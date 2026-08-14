/**
 * ArchiMate モデルの書き出し(Archi 連携) / ArchiMate model export for Archi.
 *
 * 会話の中で決めた内容を、EA チームが実際に使っているモデリングツール
 * (Archi: 無償の ArchiMate エディタ)へ持ち込むための橋。
 * 出力は 2 系統:
 *   1. Archi の CSV インポート形式 (elements.csv / relations.csv / properties.csv)
 *   2. Open Exchange File 形式 (XML) — ツール間相互運用のための交換形式
 *
 * ここで扱うのは「要素タイプ名・関係タイプ名という識別子」と「ファイル形式の構造」だけで、
 * 仕様書の説明文は一切含まない。使いどころの解説はすべて独自の実務メモとして書いている。
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bilingual, Lang } from '../knowledge/index.js';
import type { Engagement } from '../engagement/model.js';
import { getDataDir, loadEngagement } from '../engagement/store.js';
import { errorResult, langSchema, textResult } from './common.js';

// ---------------------------------------------------------------------------
// 小さなヘルパ
// ---------------------------------------------------------------------------

/** 言語に応じて 1 行に整形する(表のセルにも入れられるよう ` / ` 区切り) */
function label(ja: string, en: string, lang: Lang): string {
  if (lang === 'ja') return ja;
  if (lang === 'en') return en;
  return `${ja} / ${en}`;
}

/** 箇条書きの 1 行。記号を外側で付けるので both でも "- " が二重にならない。 */
function bulletLine(ja: string, en: string, lang: Lang): string {
  const strip = (v: string): string => v.replace(/^-\s+/, '');
  return `- ${label(strip(ja), strip(en), lang)}`;
}

/** 3 桁区切り */
function formatBytes(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 安定 ID。同じ内容なら毎回同じ ID になり、Archi へ再取り込みしても重複しない。 */
function stableId(seed: string): string {
  return `id-${createHash('sha1').update(seed).digest('hex').slice(0, 12)}`;
}

/** ディレクトリ名向けのスラッグ(日本語だけの名前は空になるので呼び出し側で既定値を用意する) */
function slugify(value: string): string {
  const s = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s.length > 0 ? s : '';
}

/** 出力ディレクトリ名に付ける時刻(ローカル時間の YYYYMMDD-HHmm) */
function timestamp(date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}

/** child が parent の中にあるか(パス比較のみ。シンボリックリンクは追わない) */
function isInside(parent: string, child: string): boolean {
  const p = resolve(parent);
  const c = resolve(child);
  if (c === p) return true;
  return c.startsWith(p.endsWith(sep) ? p : `${p}${sep}`);
}

/**
 * 要素名の正規化。連続する空白・改行を 1 つの空白に畳む。
 * 登録時(addElement)と検索時(find)で必ず同じ規則を通すこと。
 * 片方だけに掛けると、`elements` と `relations` に同じ文字列を渡したのに
 * 「要素が見つかりません」になる。
 */
function normalizeName(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 壊れた/古いエンゲージメント JSON でも落ちないように配列として読む。
 * 要素が null の行も落とす(手で編集された JSON では実際に起きる)。
 */
function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value.filter((v) => v !== null && v !== undefined) : [];
}

/** 同上。文字列として読む(欠損は空文字) */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return String(value);
}

/** 長い文字列を要素名向けに詰める(全文は documentation に残す) */
function shorten(value: string, max: number): string {
  const flat = normalizeName(value);
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

// ---------------------------------------------------------------------------
// 型カタログ
// ---------------------------------------------------------------------------

interface TypeEntry {
  name: string;
  /** 実務での使いどころ(独自メモ)。主要な型にだけ付ける。 */
  hint?: Bilingual;
}

interface TypeGroup {
  id: string;
  label: Bilingual;
  types: TypeEntry[];
}

const ELEMENT_GROUPS: TypeGroup[] = [
  {
    id: 'strategy',
    label: { ja: '戦略', en: 'Strategy' },
    types: [
      {
        name: 'Capability',
        hint: {
          ja: '手段(部署・システム・手順)が変わっても名前が変わらないなら粒度が合っている。ロードマップの縦軸をこれで揃える',
          en: 'If the name survives a change of department, system, or procedure, the granularity is right. Use it as the axis that keeps a roadmap consistent.',
        },
      },
      {
        name: 'Resource',
        hint: {
          ja: '「この能力が弱い」の原因を人・設備・データのどれかに切り分けたいときだけ描く。数えられないものは置かない',
          en: 'Draw it only when you need to pin a weak capability on people, kit, or data. If you cannot count it, it does not belong here.',
        },
      },
      {
        name: 'ValueStream',
        hint: {
          ja: '受け手から見た一連の流れ。能力と並べると現場に話が通じるが、社内工程表に寄せた時点で価値の話ではなくなる',
          en: 'The end-to-end sequence as the recipient experiences it. Pair it with capabilities and business audiences follow along; once it mirrors an internal process chart it has stopped being about value.',
        },
      },
      {
        name: 'CourseOfAction',
        hint: {
          ja: 'やると決めた打ち手だけを置く。検討中の案まで並べると、何が合意済みか図から読めなくなる',
          en: 'Only the moves actually decided on. Park candidates here too and nobody can tell from the picture what has been agreed.',
        },
      },
    ],
  },
  {
    id: 'business',
    label: { ja: 'ビジネス', en: 'Business' },
    types: [
      {
        name: 'BusinessActor',
        hint: {
          ja: '組織・部門・人そのもの。役割(BusinessRole)と混ぜないこと。ここが混ざると人事異動のたびに図が壊れる',
          en: 'The organization or person itself. Keep it separate from BusinessRole, or every reorg breaks the model.',
        },
      },
      {
        name: 'BusinessRole',
        hint: { ja: '担う役割。担当者が替わっても残る側', en: 'The role played; survives when the person changes' },
      },
      {
        name: 'BusinessProcess',
        hint: {
          ja: '矢印の向きを言葉で説明できるときだけこちら。説明できないなら BusinessFunction',
          en: 'Use it only when you can say out loud why the arrows point that way. If you cannot, it is a BusinessFunction.',
        },
      },
      {
        name: 'BusinessFunction',
        hint: {
          ja: '順序を問わない仕事のまとまり。組織図を写しただけだと、部署名の言い換えにしかならない',
          en: 'A bundle of work with no ordering. Copy the org chart into it and all you get is department names in a new shape.',
        },
      },
      {
        name: 'BusinessService',
        hint: { ja: '外から見える業務サービス。責任の境界になる', en: 'Externally visible business service; a boundary of accountability' },
      },
      {
        name: 'BusinessObject',
        hint: {
          ja: '業務側が名前で呼ぶ情報。DataObject と 1 対 1 に並べたくなるが、対応が崩れる箇所こそ設計論点',
          en: 'Information the business calls by name. The urge is to pair each one with a DataObject; the places where that pairing breaks are the design questions worth having.',
        },
      },
      { name: 'BusinessCollaboration' },
      { name: 'BusinessInterface' },
      { name: 'BusinessInteraction' },
      { name: 'BusinessEvent' },
      { name: 'Contract' },
      { name: 'Representation' },
      { name: 'Product' },
    ],
  },
  {
    id: 'application',
    label: { ja: 'アプリケーション', en: 'Application' },
    types: [
      {
        name: 'ApplicationComponent',
        hint: {
          ja: 'システム・アプリの実体。アプリ台帳の 1 行に対応させると棚卸しがそのまま図になる',
          en: 'A concrete application. Map one row of your app inventory to one component and the inventory becomes the model.',
        },
      },
      {
        name: 'ApplicationService',
        hint: {
          ja: 'アプリが外へ差し出す機能。連携の契約面はここに書く',
          en: 'What an application offers outward; this is where the integration contract lives',
        },
      },
      {
        name: 'DataObject',
        hint: {
          ja: 'アプリ側の実体。BusinessObject と名前を揃えることより、どのアプリが正本かを 1 つに決めることの方が効く',
          en: 'The application-side counterpart. Deciding which application holds the master copy matters far more than matching names with a BusinessObject.',
        },
      },
      { name: 'ApplicationCollaboration' },
      { name: 'ApplicationInterface' },
      { name: 'ApplicationFunction' },
      { name: 'ApplicationInteraction' },
      { name: 'ApplicationProcess' },
      { name: 'ApplicationEvent' },
    ],
  },
  {
    id: 'technology',
    label: { ja: 'テクノロジー', en: 'Technology' },
    types: [
      { name: 'Node', hint: { ja: 'サーバー・実行基盤', en: 'Server or runtime platform' } },
      { name: 'SystemSoftware', hint: { ja: 'OS・ミドルウェア・DB エンジン', en: 'OS, middleware, database engine' } },
      { name: 'Artifact', hint: { ja: '配置される実体(実行ファイル・コンテナイメージ等)', en: 'Deployed artifact such as a binary or container image' } },
      { name: 'TechnologyService', hint: { ja: '基盤が提供するサービス', en: 'Service offered by the platform' } },
      { name: 'Device' },
      { name: 'TechnologyCollaboration' },
      { name: 'TechnologyInterface' },
      { name: 'Path' },
      { name: 'CommunicationNetwork' },
      { name: 'TechnologyFunction' },
      { name: 'TechnologyProcess' },
      { name: 'TechnologyInteraction' },
      { name: 'TechnologyEvent' },
    ],
  },
  {
    id: 'physical',
    label: { ja: 'フィジカル', en: 'Physical' },
    types: [{ name: 'Equipment' }, { name: 'Facility' }, { name: 'DistributionNetwork' }, { name: 'Material' }],
  },
  {
    id: 'motivation',
    label: { ja: '動機', en: 'Motivation' },
    types: [
      {
        name: 'Stakeholder',
        hint: {
          ja: '関心を持つ人・組織。必ず「誰の関心事か」を Driver に紐づける。紐づかない Stakeholder は飾り',
          en: 'Whoever holds an interest. Always tie them to a Driver; an unconnected stakeholder is decoration.',
        },
      },
      {
        name: 'Driver',
        hint: {
          ja: '「なぜ今か」の答えを置く場所。ここが埋まらない施策は、次の予算会議で落ちる',
          en: 'Where the answer to "why now" goes. A change with nothing here is the one that loses its budget at the next review.',
        },
      },
      { name: 'Assessment', hint: { ja: '動機に対する現状評価。課題を言語化する場所', en: 'Where the current state is judged and the problem gets named' } },
      { name: 'Goal', hint: { ja: '到達したい状態。測れる書き方にする', en: 'The state you want to reach; write it so it can be measured' } },
      {
        name: 'Outcome',
        hint: {
          ja: 'Goal と対で書く。目標だけ並べて成果を書かない資料は、翌期に評価しようがない',
          en: 'Write it opposite a Goal. A deck full of goals with no outcomes cannot be assessed a year later.',
        },
      },
      {
        name: 'Principle',
        hint: {
          ja: '判断が割れたときに参照するもの。「守れなかった例」を 1 つ添えないと誰も使わない',
          en: 'What you point at when a decision splits the room. Without one worked example of it being broken, nobody uses it.',
        },
      },
      {
        name: 'Requirement',
        hint: {
          ja: '検収で確認できる粒度まで落とす。落とせないなら、それはまだ Goal',
          en: 'Take it down to something acceptance testing can check. If it will not go that far, it is still a Goal.',
        },
      },
      {
        name: 'Constraint',
        hint: {
          ja: '交渉しても動かない前提だけ。動かせるものを混ぜると、自分で選択肢を狭めることになる',
          en: 'Only the givens negotiation will not move. Mix in a movable one and you have narrowed your own options for free.',
        },
      },
      { name: 'Meaning' },
      { name: 'Value' },
    ],
  },
  {
    id: 'implementation',
    label: { ja: '実装と移行', en: 'Implementation & Migration' },
    types: [
      {
        name: 'WorkPackage',
        hint: {
          ja: 'ロードマップに並ぶ箱。予算・責任者・期間を持てる大きさに割る。持てないなら大きすぎるか小さすぎる',
          en: 'The boxes on the roadmap. Size each one so it can carry a budget, an owner, and a window; if it cannot, it is the wrong size.',
        },
      },
      {
        name: 'Deliverable',
        hint: {
          ja: '作業パッケージの完了を判定できる形で書く。「検討」は成果物名にならない',
          en: 'Word it so it can decide whether the work package is done. "Investigation" is not a deliverable name.',
        },
      },
      {
        name: 'Plateau',
        hint: {
          ja: '移行の中間状態。「ここで止めても事業が回るか」を必ず確認する',
          en: 'An intermediate state. Always check whether the business can stop here and still run.',
        },
      },
      {
        name: 'Gap',
        hint: {
          ja: '2 つの状態の差。差に名前が付かないなら、状態のどちらかがまだ曖昧なまま',
          en: 'The difference between two states. If the difference will not take a name, one of the two states is still vague.',
        },
      },
      { name: 'ImplementationEvent', hint: { ja: '移行上の出来事(切替日など)', en: 'A migration moment such as a cutover date' } },
    ],
  },
  {
    id: 'other',
    label: { ja: 'その他', en: 'Other' },
    types: [
      { name: 'Location' },
      { name: 'Grouping', hint: { ja: '任意のくくり。レイヤをまたいで束ねられる', en: 'A free grouping; it can cut across layers' } },
      { name: 'Junction', hint: { ja: '関係の分岐・合流点', en: 'Split or merge point for relationships' } },
    ],
  },
];

const RELATION_TYPES: TypeEntry[] = [
  {
    name: 'Composition',
    hint: {
      ja: '部分を消したら全体も意味を失うときだけ。迷ったら Aggregation の方が後で困らない',
      en: 'Only when deleting the part makes the whole meaningless. When unsure, Aggregation causes fewer problems later.',
    },
  },
  {
    name: 'Aggregation',
    hint: {
      ja: '部分が単独でも成り立つまとまり。ロードマップの束ね方はだいたいこれで足りる',
      en: 'A grouping whose parts stand on their own. Almost all roadmap bundling needs nothing stronger.',
    },
  },
  { name: 'Assignment', hint: { ja: '担い手の割当(役割→人、ノード→アプリ)', en: 'Who or what performs it (role to actor, node to app)' } },
  {
    name: 'Realization',
    hint: {
      ja: '抽象を具体が実現する(サービス←プロセス、目標←作業パッケージ)',
      en: 'Concrete realizes abstract (process realizes service, work package realizes goal)',
    },
  },
  { name: 'Serving', hint: { ja: '提供先。「A が B に使われる」向きに引く', en: 'A serves B; draw it from the provider to the consumer' } },
  {
    name: 'Access',
    hint: {
      ja: '読みなのか書きなのかまで書き分ける。区別しないと、データの正本をどこに置くかを議論できない',
      en: 'Record whether it reads or writes. Without that distinction you cannot argue about where the master copy of the data should live.',
    },
  },
  {
    name: 'Influence',
    hint: {
      ja: '動機どうしの押し引き。強めるのか弱めるのかを書かないと、ただの線になる',
      en: 'Push and pull between motivations. Without noting whether it strengthens or weakens, it degenerates into a plain line.',
    },
  },
  {
    name: 'Triggering',
    hint: {
      ja: '順番が決まっているならこれ。データが渡るだけで順番に意味が無いなら Flow',
      en: 'Use it when the order is fixed. If data merely passes and the order carries no meaning, use Flow.',
    },
  },
  {
    name: 'Flow',
    hint: {
      ja: '何が流れるのかをラベルに書く。無記名の Flow は読み手にとって矢印以上の情報を持たない',
      en: 'Put what flows on the label. An unlabelled Flow tells the reader nothing an arrow did not already say.',
    },
  },
  {
    name: 'Specialization',
    hint: {
      ja: '共通の親を切り出すのは子が 3 つ以上になってから。2 つで階層を作ると保守の手間だけ増える',
      en: 'Factor out a parent once there are three or more children. Building a hierarchy for two only adds upkeep.',
    },
  },
  {
    name: 'Association',
    hint: {
      ja: '他のどれにも当てはまらない関連。迷ったらこれだが、多用すると「関係を考えていない図」になる',
      en: 'The catch-all link. Fine when nothing else fits, but a diagram full of them means the relationships were never thought through.',
    },
  },
];

/** 型名の照合キー(大文字小文字・記号・空白を無視する) */
function normalizeTypeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const ELEMENT_TYPE_INDEX = new Map<string, string>();
for (const group of ELEMENT_GROUPS) {
  for (const entry of group.types) ELEMENT_TYPE_INDEX.set(normalizeTypeKey(entry.name), entry.name);
}

const RELATION_TYPE_INDEX = new Map<string, string>();
for (const entry of RELATION_TYPES) {
  RELATION_TYPE_INDEX.set(normalizeTypeKey(entry.name), entry.name);
  // Archi の CSV は `AssociationRelationship` 表記なので、そちらでも受け付ける
  RELATION_TYPE_INDEX.set(normalizeTypeKey(`${entry.name}Relationship`), entry.name);
}

/** 要素タイプ名を正規化する。未知なら undefined。 */
function resolveElementType(value: string): string | undefined {
  return ELEMENT_TYPE_INDEX.get(normalizeTypeKey(value));
}

/** 関係タイプ名を正規化する。未知なら undefined。 */
function resolveRelationType(value: string): string | undefined {
  return RELATION_TYPE_INDEX.get(normalizeTypeKey(value));
}

/** 誤入力に近い候補を数件返す(前方一致 → 部分一致) */
function suggestTypes(value: string, index: Map<string, string>): string[] {
  const key = normalizeTypeKey(value);
  if (key.length === 0) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  const nearby: string[] = [];
  // 語尾違い(realizes → Realization)も拾えるよう、先頭 4 文字一致まで候補にする
  const stem = key.slice(0, Math.min(4, key.length));
  for (const [k, name] of index) {
    if (k !== normalizeTypeKey(name)) continue; // 別名(…Relationship)は候補に出さない
    if (k.startsWith(key)) starts.push(name);
    else if (k.includes(key) || key.includes(k)) contains.push(name);
    else if (stem.length >= 4 && k.startsWith(stem)) nearby.push(name);
  }
  return [...new Set([...starts, ...contains, ...nearby])].slice(0, 6);
}

// ---------------------------------------------------------------------------
// モデル(書き出し前の中間表現)
// ---------------------------------------------------------------------------

interface ModelProperty {
  key: string;
  value: string;
}

interface ModelElement {
  id: string;
  type: string;
  name: string;
  documentation: string;
  properties: ModelProperty[];
}

interface ModelRelation {
  id: string;
  type: string;
  name: string;
  documentation: string;
  sourceId: string;
  targetId: string;
}

/** 要素・関係を重複なく貯める入れ物 */
class ArchiMateModel {
  readonly elements: ModelElement[] = [];
  readonly relations: ModelRelation[] = [];
  private readonly byKey = new Map<string, ModelElement>();
  private readonly byName = new Map<string, ModelElement[]>();
  private readonly relationKeys = new Set<string>();

  /** 同じ タイプ+名前 は 1 要素に畳む */
  addElement(type: string, rawName: string, documentation = '', properties: ModelProperty[] = []): ModelElement | null {
    const name = normalizeName(rawName);
    if (name.length === 0) return null;
    const key = `${type}|${name}`;
    const existing = this.byKey.get(key);
    if (existing) {
      if (documentation.length > 0 && existing.documentation.length === 0) existing.documentation = documentation;
      // 値が空のプロパティは足さない(新規作成時と同じ規則。
      // ここを緩めると properties.csv に空行が混ざり、Archi 側で空のプロパティが増える)
      for (const p of properties) {
        if (p.value.length === 0) continue;
        if (!existing.properties.some((x) => x.key === p.key)) existing.properties.push(p);
      }
      return existing;
    }
    const element: ModelElement = {
      id: stableId(`element|${key}`),
      type,
      name,
      documentation,
      properties: properties.filter((p) => p.value.length > 0),
    };
    this.elements.push(element);
    this.byKey.set(key, element);
    const lower = name.toLowerCase();
    const list = this.byName.get(lower);
    if (list) list.push(element);
    else this.byName.set(lower, [element]);
    return element;
  }

  addRelation(type: string, source: ModelElement, target: ModelElement, name = '', documentation = ''): ModelRelation | null {
    if (source.id === target.id) return null;
    const key = `${type}|${source.id}|${target.id}|${name}`;
    if (this.relationKeys.has(key)) return null;
    this.relationKeys.add(key);
    const relation: ModelRelation = {
      id: stableId(`relation|${key}`),
      type,
      name: name.trim(),
      documentation,
      sourceId: source.id,
      targetId: target.id,
    };
    this.relations.push(relation);
    return relation;
  }

  /**
   * 参照文字列から要素を探す。
   * `名前` / `Type:名前` / 生成済み ID のいずれでも引ける。
   * 同名が複数あるときは複数返す(呼び出し側で曖昧さを報告する)。
   */
  find(ref: string): ModelElement[] {
    // 登録時と同じ正規化を通す。ここを `trim()` だけにすると、
    // 改行や連続空白を含む名前が `elements` と一字一句同じでも解決できなくなる。
    const trimmed = normalizeName(ref);
    if (trimmed.length === 0) return [];
    const colon = trimmed.indexOf(':');
    if (colon > 0) {
      const type = resolveElementType(trimmed.slice(0, colon));
      if (type) {
        const found = this.byKey.get(`${type}|${normalizeName(trimmed.slice(colon + 1))}`);
        // 見つからなければ、名前自体に `:` を含むものとして探し直す
        if (found) return [found];
      }
    }
    const byId = this.elements.find((e) => e.id === trimmed);
    if (byId) return [byId];
    return this.byName.get(trimmed.toLowerCase()) ?? [];
  }
}

// ---------------------------------------------------------------------------
// エンゲージメントからの自動要素化
// ---------------------------------------------------------------------------

/** 空でない行だけを連結してドキュメント文字列にする */
function docLines(lines: (string | undefined)[]): string {
  return lines.filter((l): l is string => typeof l === 'string' && l.trim().length > 0).join('\n');
}

/**
 * エンゲージメント状態を ArchiMate 要素に落とす。
 *
 * 対応づけは「実務で読める図になるか」を基準に決めている。
 *   ステークホルダー → Stakeholder、その関心事 → Driver(関連で接続)
 *   移行状態         → Plateau(順序どおり Triggering でつなぐ)
 *   能力             → Capability(その状態で実現しているものを Plateau から Aggregation)
 *   作業パッケージ   → WorkPackage(依存を Triggering、所属 Plateau を Association)
 *   便益             → Goal(WorkPackage から Realization)
 *   成果物           → Deliverable
 */
function buildFromEngagement(model: ArchiMateModel, engagement: Engagement, lang: Lang): string[] {
  const notes: string[] = [];

  // --- ステークホルダーと関心事 ---
  for (const s of asArray(engagement.stakeholders)) {
    const stakeholder = model.addElement(
      'Stakeholder',
      asText(s?.name),
      docLines([
        s.role ? `${label('役割', 'Role', lang)}: ${s.role}` : undefined,
        s.organization ? `${label('所属', 'Organization', lang)}: ${s.organization}` : undefined,
        `${label('影響度', 'Influence', lang)}: ${asText(s.influence)} / ${label('関心度', 'Interest', lang)}: ${asText(s.interest)}`,
        s.approach ? `${label('関与方針', 'Approach', lang)}: ${s.approach}` : undefined,
      ]),
      [
        { key: 'togaf:influence', value: asText(s.influence) },
        { key: 'togaf:interest', value: asText(s.interest) },
      ],
    );
    if (!stakeholder) continue;
    for (const rawConcern of asArray(s.concerns)) {
      const concern = asText(rawConcern);
      if (concern.trim().length === 0) continue;
      const short = shorten(concern, 80);
      // 名前に収まりきった場合は説明欄に同じ文を繰り返さない
      const driver = model.addElement('Driver', short, short === concern.trim() ? '' : concern, [
        { key: 'togaf:source', value: 'stakeholder-concern' },
      ]);
      if (driver) model.addRelation('Association', stakeholder, driver, label('関心事', 'concern', lang));
    }
  }

  // --- 移行状態と能力 ---
  const orderedTransitions = [...asArray(engagement.transitions)].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));
  const plateaus: ModelElement[] = [];
  /** 移行状態 ID → Plateau 要素。名前で引き当てると同名時に取り違えるので ID で持つ。 */
  const plateauByTransition = new Map<string, ModelElement>();
  for (const t of orderedTransitions) {
    const plateau = model.addElement(
      'Plateau',
      asText(t?.name),
      docLines([
        t.targetQuarter ? `${label('目標時期', 'Target', lang)}: ${t.targetQuarter}` : undefined,
        `${label('単独で成立', 'Standalone', lang)}: ${t.standalone ? 'yes' : 'no'}`,
        t.interim ? `${label('暫定の仕組み', 'Interim', lang)}: ${t.interim}` : undefined,
        t.disposalPlan ? `${label('暫定の廃棄計画', 'Disposal plan', lang)}: ${t.disposalPlan}` : undefined,
        t.note,
      ]),
      [
        { key: 'togaf:order', value: asText(t.order) },
        { key: 'togaf:targetQuarter', value: asText(t.targetQuarter) },
        { key: 'togaf:standalone', value: t.standalone ? 'true' : 'false' },
      ],
    );
    if (!plateau) continue;
    if (typeof t.id === 'string') plateauByTransition.set(t.id, plateau);
    // 同名の移行状態は 1 つの Plateau に畳まれる。畳まれたものを鎖に二度並べると
    // A → B → A という往復の矢印ができてロードマップが循環するので、初出のときだけ並べる。
    if (!plateaus.includes(plateau)) plateaus.push(plateau);
    for (const rawCapability of asArray(t.capabilities)) {
      const capabilityName = asText(rawCapability);
      if (capabilityName.trim().length === 0) continue;
      const capability = model.addElement(
        'Capability',
        shorten(capabilityName, 80),
        capabilityName.length > 80 ? capabilityName : '',
      );
      if (capability) model.addRelation('Aggregation', plateau, capability, '');
    }
  }
  for (let i = 0; i + 1 < plateaus.length; i += 1) {
    const from = plateaus[i];
    const to = plateaus[i + 1];
    if (from && to) model.addRelation('Triggering', from, to, label('次の状態へ', 'next', lang));
  }

  // --- 作業パッケージ・便益 ---
  const packageElements = new Map<string, ModelElement>();
  for (const wp of asArray(engagement.workPackages)) {
    const element = model.addElement(
      'WorkPackage',
      asText(wp?.name),
      docLines([
        wp.description,
        `${label('状態', 'Status', lang)}: ${asText(wp.status)}`,
        `${label('事業価値', 'Business value', lang)}: ${asText(wp.businessValue)} / ${label('工数', 'Effort', lang)}: ${asText(wp.effort)}`,
        wp.owner ? `${label('責任者', 'Owner', lang)}: ${wp.owner}` : undefined,
        wp.startQuarter || wp.endQuarter
          ? `${label('期間', 'Window', lang)}: ${wp.startQuarter ?? '?'} → ${wp.endQuarter ?? '?'}`
          : undefined,
        wp.costEstimate ? `${label('概算費用', 'Cost estimate', lang)}: ${wp.costEstimate}` : undefined,
      ]),
      [
        { key: 'togaf:status', value: asText(wp.status) },
        { key: 'togaf:businessValue', value: asText(wp.businessValue) },
        { key: 'togaf:effort', value: asText(wp.effort) },
        { key: 'togaf:startQuarter', value: asText(wp.startQuarter) },
        { key: 'togaf:endQuarter', value: asText(wp.endQuarter) },
      ],
    );
    if (!element) continue;
    if (typeof wp.id === 'string') packageElements.set(wp.id, element);

    if (typeof wp.transitionId === 'string') {
      const plateau = plateauByTransition.get(wp.transitionId);
      if (plateau) model.addRelation('Association', element, plateau, label('到達先', 'reaches', lang));
    }

    const benefit = asText(wp.benefit);
    if (benefit.trim().length > 0) {
      const short = shorten(benefit, 80);
      const goal = model.addElement(
        'Goal',
        short,
        docLines([
          short === benefit.trim() ? undefined : benefit,
          wp.benefitOwner ? `${label('刈り取り責任者', 'Benefit owner', lang)}: ${wp.benefitOwner}` : undefined,
        ]),
        [{ key: 'togaf:benefitOwner', value: asText(wp.benefitOwner) }],
      );
      if (goal) model.addRelation('Realization', element, goal, label('便益', 'benefit', lang));
    }
  }
  for (const wp of asArray(engagement.workPackages)) {
    const target = typeof wp?.id === 'string' ? packageElements.get(wp.id) : undefined;
    if (!target) continue;
    for (const dependencyId of asArray(wp.dependsOn)) {
      const source = typeof dependencyId === 'string' ? packageElements.get(dependencyId) : undefined;
      if (source) model.addRelation('Triggering', source, target, label('先行', 'precedes', lang));
    }
  }

  // --- 成果物 ---
  for (const d of asArray(engagement.deliverables)) {
    model.addElement(
      'Deliverable',
      asText(d?.name),
      docLines([
        `${label('状態', 'Status', lang)}: ${asText(d.status)}`,
        d.owner ? `${label('責任者', 'Owner', lang)}: ${d.owner}` : undefined,
        d.phaseId ? `${label('フェーズ', 'Phase', lang)}: ${d.phaseId}` : undefined,
        d.link ? `${label('保管場所', 'Location', lang)}: ${d.link}` : undefined,
        d.note,
      ]),
      [
        { key: 'togaf:status', value: asText(d.status) },
        { key: 'togaf:phase', value: asText(d.phaseId) },
      ],
    );
  }

  if (
    asArray(engagement.stakeholders).length === 0 &&
    asArray(engagement.transitions).length === 0 &&
    asArray(engagement.workPackages).length === 0
  ) {
    notes.push(
      label(
        'エンゲージメントにステークホルダー・移行状態・作業パッケージがまだ無いので、自動生成分はほぼ空です。',
        'The engagement has no stakeholders, transitions, or work packages yet, so little was generated.',
        lang,
      ),
    );
  }
  return notes;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * CSV の 1 フィールド。すべて二重引用符で囲み、内部の `"` は `""` にする。
 * 改行は残してよい(引用符の中なので正しいパーサは読める)が、CR は LF に寄せる。
 * ここを手抜きすると Archi の取り込みが黙って壊れる。
 */
function csvField(value: string): string {
  const normalized = value.replace(/\r\n?/g, '\n');
  return `"${normalized.replace(/"/g, '""')}"`;
}

function csvRow(fields: string[]): string {
  return fields.map(csvField).join(',');
}

interface OutputFile {
  name: string;
  content: string;
}

function renderCsvFiles(model: ArchiMateModel, modelId: string, modelName: string, modelDoc: string): OutputFile[] {
  const elements: string[] = [csvRow(['ID', 'Type', 'Name', 'Documentation'])];
  // 先頭行はモデル自身。Archi はこの行でモデル名・説明を取り込む。
  elements.push(csvRow([modelId, 'ArchimateModel', modelName, modelDoc]));
  for (const e of model.elements) elements.push(csvRow([e.id, e.type, e.name, e.documentation]));

  const relations: string[] = [csvRow(['ID', 'Type', 'Name', 'Documentation', 'Source', 'Target'])];
  for (const r of model.relations) {
    // Archi の CSV は関係タイプを `<名前>Relationship` で表す
    relations.push(csvRow([r.id, `${r.type}Relationship`, r.name, r.documentation, r.sourceId, r.targetId]));
  }

  const properties: string[] = [csvRow(['ID', 'Key', 'Value'])];
  for (const e of model.elements) {
    for (const p of e.properties) properties.push(csvRow([e.id, p.key, p.value]));
  }

  return [
    { name: 'elements.csv', content: `${elements.join('\n')}\n` },
    { name: 'relations.csv', content: `${relations.join('\n')}\n` },
    { name: 'properties.csv', content: `${properties.join('\n')}\n` },
  ];
}

// ---------------------------------------------------------------------------
// Open Exchange File (XML)
// ---------------------------------------------------------------------------

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** XML 特殊文字のエスケープ。XML 1.0 で使えない制御文字も落とす。 */
function xmlEscape(value: string): string {
  return value
    // XML 1.0 に載せられない制御文字は落とす
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c);
}

function renderOpenExchange(
  model: ArchiMateModel,
  modelId: string,
  modelName: string,
  modelDoc: string,
  lang: Lang,
): string {
  // データ側の言語は 1 つしか持てないので、要求言語(both は ja)を素直に付ける
  const xmlLang = lang === 'en' ? 'en' : 'ja';
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/"');
  out.push('       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
  out.push(
    '       xsi:schemaLocation="http://www.opengroup.org/xsd/archimate/3.0/ http://www.opengroup.org/xsd/archimate/3.0/archimate3_Model.xsd"',
  );
  out.push(`       identifier="${xmlEscape(modelId)}">`);
  out.push(`  <name xml:lang="${xmlLang}">${xmlEscape(modelName)}</name>`);
  if (modelDoc.length > 0) {
    out.push(`  <documentation xml:lang="${xmlLang}">${xmlEscape(modelDoc)}</documentation>`);
  }

  // プロパティ定義(要素側から参照する)
  const propertyKeys: string[] = [];
  for (const e of model.elements) {
    for (const p of e.properties) if (!propertyKeys.includes(p.key)) propertyKeys.push(p.key);
  }
  const propertyIds = new Map<string, string>();
  propertyKeys.forEach((key, i) => propertyIds.set(key, `propid-${i + 1}`));

  if (model.elements.length > 0) {
    out.push('  <elements>');
    for (const e of model.elements) {
      out.push(`    <element identifier="${xmlEscape(e.id)}" xsi:type="${xmlEscape(e.type)}">`);
      out.push(`      <name xml:lang="${xmlLang}">${xmlEscape(e.name)}</name>`);
      if (e.documentation.length > 0) {
        out.push(`      <documentation xml:lang="${xmlLang}">${xmlEscape(e.documentation)}</documentation>`);
      }
      if (e.properties.length > 0) {
        out.push('      <properties>');
        for (const p of e.properties) {
          const ref = propertyIds.get(p.key);
          if (!ref) continue;
          out.push(`        <property propertyDefinitionRef="${ref}">`);
          out.push(`          <value xml:lang="${xmlLang}">${xmlEscape(p.value)}</value>`);
          out.push('        </property>');
        }
        out.push('      </properties>');
      }
      out.push('    </element>');
    }
    out.push('  </elements>');
  }

  if (model.relations.length > 0) {
    out.push('  <relationships>');
    for (const r of model.relations) {
      const head =
        `    <relationship identifier="${xmlEscape(r.id)}" source="${xmlEscape(r.sourceId)}" ` +
        `target="${xmlEscape(r.targetId)}" xsi:type="${xmlEscape(r.type)}"`;
      if (r.name.length === 0 && r.documentation.length === 0) {
        out.push(`${head}/>`);
        continue;
      }
      out.push(`${head}>`);
      if (r.name.length > 0) out.push(`      <name xml:lang="${xmlLang}">${xmlEscape(r.name)}</name>`);
      if (r.documentation.length > 0) {
        out.push(`      <documentation xml:lang="${xmlLang}">${xmlEscape(r.documentation)}</documentation>`);
      }
      out.push('    </relationship>');
    }
    out.push('  </relationships>');
  }

  if (propertyKeys.length > 0) {
    out.push('  <propertyDefinitions>');
    for (const key of propertyKeys) {
      const id = propertyIds.get(key);
      if (!id) continue;
      out.push(`    <propertyDefinition identifier="${id}" type="string">`);
      out.push(`      <name>${xmlEscape(key)}</name>`);
      out.push('    </propertyDefinition>');
    }
    out.push('  </propertyDefinitions>');
  }

  out.push('</model>');
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// 出力先の解決と書き込み
// ---------------------------------------------------------------------------

type Resolved<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * 出力先を決める。
 * 書き込めるのは「データディレクトリ配下」か「カレント作業ディレクトリ配下」だけ。
 * それ以外は拒否する(会話の指示で任意の場所へ書かせない)。
 */
function resolveOutputDir(outputDir: string | undefined, slug: string, lang: Lang): Resolved<string> {
  const dataDir = getDataDir();
  const cwd = process.cwd();

  if (outputDir === undefined || outputDir.trim().length === 0) {
    return { ok: true, value: join(dataDir, 'archimate', `${slug}-${timestamp()}`) };
  }

  const raw = outputDir.trim();
  if (raw.includes('\0')) {
    return { ok: false, error: label('出力先に不正な文字が含まれています。', 'The output path contains an invalid character.', lang) };
  }
  if (/(^|[\\/])\.\.([\\/]|$)/.test(raw)) {
    return {
      ok: false,
      error: label(
        '出力先に `..` は使えません。データディレクトリ配下かカレント作業ディレクトリ配下を指定してください。',
        '`..` is not allowed in the output path. Point it inside the data directory or the current working directory.',
        lang,
      ),
    };
  }

  const absolute = isAbsolute(raw) ? resolve(raw) : resolve(cwd, raw);
  if (!isInside(dataDir, absolute) && !isInside(cwd, absolute)) {
    return {
      ok: false,
      error: label(
        `出力先が許可範囲外です。次のどちらかの配下を指定してください。\n- データディレクトリ: \`${dataDir}\`\n- カレント作業ディレクトリ: \`${cwd}\``,
        `That output path is outside the allowed area. Use a path under one of these:\n- data directory: \`${dataDir}\`\n- current working directory: \`${cwd}\``,
        lang,
      ),
    };
  }
  return { ok: true, value: absolute };
}

interface WrittenFile {
  path: string;
  name: string;
  bytes: number;
}

/** ファイル群を書き出す。既存ファイルは overwrite が true のときだけ上書きする。 */
function writeFiles(dir: string, files: OutputFile[], overwrite: boolean, lang: Lang): Resolved<WrittenFile[]> {
  const existing = files.map((f) => join(dir, f.name)).filter((p) => existsSync(p));
  if (existing.length > 0 && !overwrite) {
    return {
      ok: false,
      error: label(
        `次のファイルが既にあります。上書きするなら \`overwrite: true\` を指定してください。\n${existing.map((p) => `- \`${p}\``).join('\n')}`,
        `These files already exist. Pass \`overwrite: true\` to replace them.\n${existing.map((p) => `- \`${p}\``).join('\n')}`,
        lang,
      ),
    };
  }

  if (existsSync(dir)) {
    if (!statSync(dir).isDirectory()) {
      return { ok: false, error: label(`出力先がディレクトリではありません: \`${dir}\``, `Output path is not a directory: \`${dir}\``, lang) };
    }
  } else {
    mkdirSync(dir, { recursive: true });
  }

  const written: WrittenFile[] = [];
  for (const file of files) {
    const path = join(dir, file.name);
    writeFileSync(path, file.content, 'utf8');
    written.push({ path, name: file.name, bytes: Buffer.byteLength(file.content, 'utf8') });
  }
  return { ok: true, value: written };
}

// ---------------------------------------------------------------------------
// 入力 → モデル
// ---------------------------------------------------------------------------

const elementInput = z.object({
  name: z.string().min(1).describe('要素名 / Element name'),
  type: z.string().min(1).describe('要素タイプ(例: Capability, ApplicationComponent)。list_archimate_types 参照 / ArchiMate element type'),
  documentation: z.string().optional().describe('説明。Archi の Documentation 欄に入る / Documentation text'),
});

const relationInput = z.object({
  source: z.string().min(1).describe('関係元の要素名(同名が複数あるときは `Type:名前`) / Source element name'),
  target: z.string().min(1).describe('関係先の要素名 / Target element name'),
  type: z.string().min(1).describe('関係タイプ(例: Realization, Serving, Triggering) / Relationship type'),
  name: z.string().optional().describe('関係のラベル / Optional label on the relationship'),
});

type ElementInput = z.infer<typeof elementInput>;
type RelationInput = z.infer<typeof relationInput>;

interface BuildArgs {
  elements: ElementInput[];
  relations: RelationInput[];
  fromEngagement: boolean;
  modelName?: string;
  lang: Lang;
}

interface BuiltModel {
  model: ArchiMateModel;
  modelName: string;
  modelDoc: string;
  slug: string;
  notes: string[];
}

/** 入力とエンゲージメントからモデルを組み立てる */
function buildModel(args: BuildArgs): Resolved<BuiltModel> {
  const { lang } = args;
  const model = new ArchiMateModel();
  const notes: string[] = [];
  let engagement: Engagement | null = null;

  if (args.fromEngagement) {
    engagement = loadEngagement();
    if (!engagement) {
      return {
        ok: false,
        error: label(
          'エンゲージメントがまだありません。`fromEngagement` を使う前に create_engagement で作ってください。',
          'No engagement exists yet. Create one with create_engagement before using `fromEngagement`.',
          lang,
        ),
      };
    }
    notes.push(...buildFromEngagement(model, engagement, lang));
  }

  // 明示指定の要素(自動生成分と同じ タイプ+名前 なら畳まれる)
  const unknownElementTypes: string[] = [];
  for (const input of args.elements) {
    const type = resolveElementType(input.type);
    if (!type) {
      unknownElementTypes.push(input.type);
      continue;
    }
    model.addElement(type, input.name, input.documentation ?? '');
  }
  if (unknownElementTypes.length > 0) {
    const lines = [...new Set(unknownElementTypes)].map((t) => {
      const suggestions = suggestTypes(t, ELEMENT_TYPE_INDEX);
      return `- \`${t}\`${suggestions.length > 0 ? ` → ${suggestions.join(', ')} ?` : ''}`;
    });
    return {
      ok: false,
      error: label(
        `未知の要素タイプがあります。\`list_archimate_types\` で使える名前を確認してください。\n${lines.join('\n')}`,
        `Unknown element type(s). Call \`list_archimate_types\` for the valid names.\n${lines.join('\n')}`,
        lang,
      ),
    };
  }

  // 関係(要素名で解決する)
  const problems: string[] = [];
  for (const input of args.relations) {
    const type = resolveRelationType(input.type);
    if (!type) {
      const suggestions = suggestTypes(input.type, RELATION_TYPE_INDEX);
      problems.push(
        label(
          `関係タイプが不明: \`${input.type}\`${suggestions.length > 0 ? ` → ${suggestions.join(', ')} ?` : ''}`,
          `Unknown relationship type: \`${input.type}\`${suggestions.length > 0 ? ` → ${suggestions.join(', ')} ?` : ''}`,
          lang,
        ),
      );
      continue;
    }
    const sources = model.find(input.source);
    const targets = model.find(input.target);
    if (sources.length === 0 || targets.length === 0) {
      const missing = sources.length === 0 ? input.source : input.target;
      problems.push(
        label(
          `要素が見つかりません: \`${missing}\`(先に elements に追加するか、名前を一致させてください)`,
          `Element not found: \`${missing}\` (add it to elements first, or match the name exactly)`,
          lang,
        ),
      );
      continue;
    }
    if (sources.length > 1 || targets.length > 1) {
      const ambiguous = sources.length > 1 ? sources : targets;
      const first = ambiguous[0];
      problems.push(
        label(
          `同名の要素が複数あります: \`${first ? first.name : ''}\`。\`Type:名前\`(例: \`${ambiguous.map((e) => e.type).join(':… / ')}:…\`)で指定してください。`,
          `Several elements share the name \`${first ? first.name : ''}\`. Disambiguate with \`Type:Name\` (types: ${ambiguous.map((e) => e.type).join(', ')}).`,
          lang,
        ),
      );
      continue;
    }
    const source = sources[0];
    const target = targets[0];
    if (!source || !target) continue;
    if (source.id === target.id) {
      // 黙って捨てると「指定したのに図に出ない」になるので、入力の誤りとして返す
      problems.push(
        label(
          `自分自身への関係は書き出せません: \`${source.name}\`(\`${type}\`)。source と target を別の要素にしてください。`,
          `A relationship from an element to itself is not exported: \`${source.name}\` (\`${type}\`). Point source and target at different elements.`,
          lang,
        ),
      );
      continue;
    }
    model.addRelation(type, source, target, input.name ?? '');
  }
  if (problems.length > 0) {
    return {
      ok: false,
      error: label(
        `関係を解決できませんでした。\n${problems.map((p) => `- ${p}`).join('\n')}`,
        `Could not resolve the relationships.\n${problems.map((p) => `- ${p}`).join('\n')}`,
        lang,
      ),
    };
  }

  if (model.elements.length === 0) {
    return {
      ok: false,
      error: label(
        '書き出す要素がありません。`elements` を渡すか、`fromEngagement: true` を指定してください。',
        'Nothing to export. Pass `elements`, or set `fromEngagement: true`.',
        lang,
      ),
    };
  }

  const modelName = args.modelName?.trim() || engagement?.name || 'TOGAF EAP Model';
  const modelDoc = docLines([
    engagement ? `${label('エンゲージメント', 'Engagement', lang)}: ${engagement.name}` : undefined,
    engagement?.client ? `${label('顧客', 'Client', lang)}: ${engagement.client}` : undefined,
    label(
      'TOGAF 10 EAP MCP から書き出したモデル(非公式ツール)。',
      'Model exported from the TOGAF 10 EAP MCP server (unofficial tool).',
      lang,
    ),
  ]);

  return {
    ok: true,
    value: {
      model,
      modelName,
      modelDoc,
      slug: slugify(args.modelName ?? engagement?.name ?? '') || 'archimate',
      notes,
    },
  };
}

// ---------------------------------------------------------------------------
// レポート整形
// ---------------------------------------------------------------------------

/** タイプ別の件数表 */
function countTable(entries: { type: string }[], header: string, lang: Lang): string[] {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const out: string[] = [];
  out.push(`| ${header} | ${label('件数', 'Count', lang)} |`);
  out.push('|---|---:|');
  for (const [type, count] of rows) out.push(`| ${type} | ${count} |`);
  return out;
}

function writtenTable(files: WrittenFile[], lang: Lang): string[] {
  const out: string[] = [];
  out.push(`| ${label('ファイル', 'File', lang)} | ${label('バイト', 'Bytes', lang)} |`);
  out.push('|---|---:|');
  for (const f of files) out.push(`| \`${f.name}\` | ${formatBytes(f.bytes)} |`);
  return out;
}

function elementPreview(model: ArchiMateModel, lang: Lang, limit = 20): string[] {
  const out: string[] = [];
  out.push(`| ${label('タイプ', 'Type', lang)} | ${label('名前', 'Name', lang)} |`);
  out.push('|---|---|');
  for (const e of model.elements.slice(0, limit)) {
    out.push(`| ${e.type} | ${e.name.replace(/\|/g, '\\|')} |`);
  }
  if (model.elements.length > limit) {
    out.push(`| … | ${label(`ほか ${model.elements.length - limit} 件`, `${model.elements.length - limit} more`, lang)} |`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// ツール登録
// ---------------------------------------------------------------------------

export function registerArchiMateExportTools(server: McpServer): void {
  server.registerTool(
    'export_archimate_csv',
    {
      title: 'Export an ArchiMate model as Archi CSV',
      description:
        'ArchiMate モデルを Archi の CSV インポート形式(elements.csv / relations.csv / properties.csv)で書き出す。`fromEngagement: true` にすると、現在のエンゲージメントのステークホルダー・関心事・移行状態・能力・作業パッケージ・便益・成果物を自動で要素化する。出力後に Archi での取り込み手順を返す。 / Export an ArchiMate model in the CSV layout Archi imports (elements.csv, relations.csv, properties.csv). With `fromEngagement: true` the current engagement (stakeholders, concerns, plateaus, capabilities, work packages, benefits, deliverables) is turned into elements automatically. The reply includes the Archi import steps.',
      inputSchema: {
        elements: z.array(elementInput).default([]).describe('書き出す要素 / Elements to export'),
        relations: z.array(relationInput).default([]).describe('要素間の関係。source/target は要素名で指定 / Relationships between elements, referenced by name'),
        fromEngagement: z
          .boolean()
          .default(false)
          .describe('現在のエンゲージメントから要素を自動生成する / Also generate elements from the current engagement'),
        modelName: z.string().optional().describe('モデル名(既定: エンゲージメント名) / Model name'),
        outputDir: z
          .string()
          .optional()
          .describe('出力先ディレクトリ。データディレクトリ配下かカレント作業ディレクトリ配下のみ / Output directory; must sit under the data dir or the cwd'),
        overwrite: z.boolean().default(false).describe('既存ファイルを上書きする / Overwrite existing files'),
        lang: langSchema,
      },
    },
    async ({ elements, relations, fromEngagement, modelName, outputDir, overwrite, lang }) => {
      const l = lang as Lang;
      try {
        const built = buildModel({ elements, relations, fromEngagement, modelName, lang: l });
        if (!built.ok) return errorResult(built.error);

        const dir = resolveOutputDir(outputDir, built.value.slug, l);
        if (!dir.ok) return errorResult(dir.error);

        const modelId = stableId(`model|${built.value.modelName}`);
        const files = renderCsvFiles(built.value.model, modelId, built.value.modelName, built.value.modelDoc);
        const written = writeFiles(dir.value, files, overwrite, l);
        if (!written.ok) return errorResult(written.error);

        const model = built.value.model;
        const out: string[] = [];
        out.push(`# ${label('ArchiMate CSV を書き出しました', 'ArchiMate CSV exported', l)}`);
        out.push('');
        out.push(`- ${label('モデル名', 'Model', l)}: ${built.value.modelName}`);
        out.push(`- ${label('出力先', 'Output directory', l)}: \`${dir.value}\``);
        out.push(
          `- ${label('要素', 'Elements', l)}: ${model.elements.length} / ${label('関係', 'Relationships', l)}: ${model.relations.length}`,
        );
        out.push('');
        out.push(...writtenTable(written.value, l));
        out.push('');
        out.push(`## ${label('内訳', 'Breakdown', l)}`);
        out.push('');
        out.push(...countTable(model.elements, label('要素タイプ', 'Element type', l), l));
        if (model.relations.length > 0) {
          out.push('');
          out.push(...countTable(model.relations, label('関係タイプ', 'Relationship type', l), l));
        }
        out.push('');
        out.push(`## ${label('要素', 'Elements', l)}`);
        out.push('');
        out.push(...elementPreview(model, l));
        out.push('');
        out.push(`## ${label('Archi での取り込み手順', 'Import into Archi', l)}`);
        out.push('');
        out.push(
          `1. ${label(
            'Archi を起動し、空のモデルを新規作成する(既存モデルへ入れると ID 一致でマージされる)',
            'Start Archi and create an empty model (importing into an existing model merges by ID).',
            l,
          )}`,
        );
        out.push(
          `2. ${label(
            'メニュー `File > Import > Model From CSV...`(バージョンにより表記が異なる)',
            'Menu `File > Import > Model From CSV...` (wording varies by version).',
            l,
          )}`,
        );
        out.push(
          `3. ${label(
            `\`${join(dir.value, 'elements.csv')}\` を選ぶ。同じフォルダの relations.csv / properties.csv は自動で読まれる`,
            `Pick \`${join(dir.value, 'elements.csv')}\`; relations.csv and properties.csv in the same folder are picked up automatically.`,
            l,
          )}`,
        );
        out.push(`4. ${label('プレビューを確認して Finish', 'Check the preview and click Finish.', l)}`);
        out.push(
          `5. ${label(
            '取り込んだ要素はモデルツリーに入るだけで図にはならない。ビューを新規作成し、ツリーからドラッグして図を組む',
            'Imported elements land in the model tree only. Create a view and drag them in to build the diagram.',
            l,
          )}`,
        );
        out.push('');
        out.push(`## ${label('次の一手', 'Next step', l)}`);
        out.push('');
        out.push(
          bulletLine(
            '- まず Plateau(移行状態)を横に並べた 1 枚を作る。ロードマップの合意はこの 1 枚で取れる',
            '- Start with one view: plateaus laid out left to right. That single picture is usually enough to agree the roadmap.',
            l,
          ),
        );
        out.push(
          bulletLine(
            '- 同じ名前・同じタイプなら ID は毎回同じになる。修正して再取り込みすれば要素は重複せず更新される',
            '- IDs are derived from type and name, so re-importing after an edit updates elements instead of duplicating them.',
            l,
          ),
        );
        out.push(
          bulletLine(
            '- CSV は UTF-8。Excel で開いて保存し直すと文字化けや引用符の崩れが起きるので、編集は Archi 側で行う',
            '- The CSV is UTF-8. Round-tripping it through Excel tends to break encoding and quoting, so edit in Archi instead.',
            l,
          ),
        );
        for (const note of built.value.notes) out.push(`- ${note}`);

        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          label(
            `書き出しに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Export failed: ${error instanceof Error ? error.message : String(error)}`,
            l,
          ),
        );
      }
    },
  );

  server.registerTool(
    'export_archimate_open_exchange',
    {
      title: 'Export an ArchiMate model as an Open Exchange File',
      description:
        'ArchiMate モデルを Open Exchange File 形式(XML)で書き出す。Archi 以外のツールとも交換できる標準的なファイル形式。入力は export_archimate_csv と同じ。 / Export an ArchiMate model as an Open Exchange File (XML), the interchange format other ArchiMate tools also read. Same inputs as export_archimate_csv.',
      inputSchema: {
        elements: z.array(elementInput).default([]).describe('書き出す要素 / Elements to export'),
        relations: z.array(relationInput).default([]).describe('要素間の関係 / Relationships between elements'),
        fromEngagement: z
          .boolean()
          .default(false)
          .describe('現在のエンゲージメントから要素を自動生成する / Also generate elements from the current engagement'),
        modelName: z.string().optional().describe('モデル名 / Model name'),
        fileName: z.string().optional().describe('ファイル名(既定: model.xml) / File name, default model.xml'),
        outputDir: z
          .string()
          .optional()
          .describe('出力先ディレクトリ。データディレクトリ配下かカレント作業ディレクトリ配下のみ / Output directory; must sit under the data dir or the cwd'),
        overwrite: z.boolean().default(false).describe('既存ファイルを上書きする / Overwrite existing files'),
        lang: langSchema,
      },
    },
    async ({ elements, relations, fromEngagement, modelName, fileName, outputDir, overwrite, lang }) => {
      const l = lang as Lang;
      try {
        const built = buildModel({ elements, relations, fromEngagement, modelName, lang: l });
        if (!built.ok) return errorResult(built.error);

        // ファイル名は 1 階層のみ許可(ディレクトリ区切りを含めさせない)
        const requested = (fileName ?? '').trim();
        if (requested.includes('/') || requested.includes('\\') || requested.includes('\0')) {
          return errorResult(
            label(
              '`fileName` にパス区切りは使えません。ディレクトリは `outputDir` で指定してください。',
              '`fileName` cannot contain a path separator. Use `outputDir` for the directory.',
              l,
            ),
          );
        }
        const safeName = requested.length > 0 ? (requested.endsWith('.xml') ? requested : `${requested}.xml`) : 'model.xml';

        const dir = resolveOutputDir(outputDir, built.value.slug, l);
        if (!dir.ok) return errorResult(dir.error);

        const modelId = stableId(`model|${built.value.modelName}`);
        const xml = renderOpenExchange(built.value.model, modelId, built.value.modelName, built.value.modelDoc, l);
        const written = writeFiles(dir.value, [{ name: safeName, content: xml }], overwrite, l);
        if (!written.ok) return errorResult(written.error);

        const model = built.value.model;
        const filePath = written.value[0]?.path ?? join(dir.value, safeName);
        const out: string[] = [];
        out.push(`# ${label('ArchiMate Open Exchange File を書き出しました', 'ArchiMate Open Exchange File exported', l)}`);
        out.push('');
        out.push(`- ${label('モデル名', 'Model', l)}: ${built.value.modelName}`);
        out.push(`- ${label('ファイル', 'File', l)}: \`${filePath}\``);
        out.push(
          `- ${label('要素', 'Elements', l)}: ${model.elements.length} / ${label('関係', 'Relationships', l)}: ${model.relations.length}`,
        );
        out.push('');
        out.push(...writtenTable(written.value, l));
        out.push('');
        out.push(`## ${label('内訳', 'Breakdown', l)}`);
        out.push('');
        out.push(...countTable(model.elements, label('要素タイプ', 'Element type', l), l));
        if (model.relations.length > 0) {
          out.push('');
          out.push(...countTable(model.relations, label('関係タイプ', 'Relationship type', l), l));
        }
        out.push('');
        out.push(`## ${label('要素', 'Elements', l)}`);
        out.push('');
        out.push(...elementPreview(model, l));
        out.push('');
        out.push(`## ${label('Archi での取り込み手順', 'Import into Archi', l)}`);
        out.push('');
        out.push(`1. ${label('Archi を起動する', 'Start Archi.', l)}`);
        out.push('2. `File > Import > Model From Open Exchange File...`');
        out.push(`3. ${label(`\`${filePath}\` を選ぶ`, `Select \`${filePath}\`.`, l)}`);
        out.push(
          `4. ${label(
            '図(ビュー)は含めていないので、モデルツリーから要素をドラッグしてビューを作る',
            'No views are included, so drag elements from the model tree onto a new view.',
            l,
          )}`,
        );
        out.push(
          `5. ${label(
            'メニューに項目が無い場合は Archi が古い。Archi を更新するか Open Exchange のプラグインを入れる',
            'If the menu item is missing, the Archi build is old: update Archi or install its Open Exchange plug-in.',
            l,
          )}`,
        );
        out.push('');
        out.push(`## ${label('次の一手', 'Next step', l)}`);
        out.push('');
        out.push(
          bulletLine(
            '- 他ツール(EA リポジトリ製品など)へ渡すならこちらの形式。Archi だけで完結するなら CSV の方が差分を追いやすい',
            '- Use this format to hand the model to another EA tool. If you stay inside Archi, CSV is easier to diff.',
            l,
          ),
        );
        out.push(
          bulletLine(
            '- 取り込み側がエラーを出す場合、まず未対応の要素タイプを疑う。`list_archimate_types` で置き換え先を探す',
            '- If the importing tool complains, suspect an element type it does not support and look for a replacement with `list_archimate_types`.',
            l,
          ),
        );
        for (const note of built.value.notes) out.push(`- ${note}`);

        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          label(
            `書き出しに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Export failed: ${error instanceof Error ? error.message : String(error)}`,
            l,
          ),
        );
      }
    },
  );

  server.registerTool(
    'list_archimate_types',
    {
      title: 'List ArchiMate element and relationship types',
      description:
        'export_archimate_* に渡せる要素タイプ・関係タイプの一覧を、レイヤ別と使いどころ付きで返す。タイプ名の指定は大文字小文字・空白・ハイフンを無視して照合される。 / List the element and relationship types accepted by the export tools, grouped by layer with practical notes. Type names are matched ignoring case, spaces, and hyphens.',
      inputSchema: {
        group: z
          .string()
          .optional()
          .describe('絞り込み(strategy / business / application / technology / physical / motivation / implementation / other) / Filter by group'),
        relationsOnly: z.boolean().default(false).describe('関係タイプだけ返す / Return relationship types only'),
        lang: langSchema,
      },
    },
    async ({ group, relationsOnly, lang }) => {
      const l = lang as Lang;
      try {
        const out: string[] = [];
        out.push(`# ${label('ArchiMate タイプ一覧', 'ArchiMate type reference', l)}`);
        out.push('');

        if (!relationsOnly) {
          const filter = group?.trim().toLowerCase();
          const groups = filter ? ELEMENT_GROUPS.filter((g) => g.id === filter) : ELEMENT_GROUPS;
          if (groups.length === 0) {
            return errorResult(
              label(
                `不明なグループ: \`${group ?? ''}\`。使えるのは ${ELEMENT_GROUPS.map((g) => g.id).join(', ')}。`,
                `Unknown group: \`${group ?? ''}\`. Valid values: ${ELEMENT_GROUPS.map((g) => g.id).join(', ')}.`,
                l,
              ),
            );
          }
          out.push(`## ${label('要素タイプ', 'Element types', l)}`);
          out.push('');
          for (const g of groups) {
            out.push(`### ${label(g.label.ja, g.label.en, l)} (\`${g.id}\`)`);
            out.push('');
            out.push(`| ${label('タイプ', 'Type', l)} | ${label('使いどころ', 'Where it earns its place', l)} |`);
            out.push('|---|---|');
            for (const t of g.types) {
              const hint = t.hint ? label(t.hint.ja, t.hint.en, l) : '';
              out.push(`| \`${t.name}\` | ${hint} |`);
            }
            out.push('');
          }
        }

        out.push(`## ${label('関係タイプ', 'Relationship types', l)}`);
        out.push('');
        out.push(`| ${label('タイプ', 'Type', l)} | ${label('使いどころ', 'Where it earns its place', l)} |`);
        out.push('|---|---|');
        for (const t of RELATION_TYPES) {
          const hint = t.hint ? label(t.hint.ja, t.hint.en, l) : '';
          out.push(`| \`${t.name}\` | ${hint} |`);
        }
        out.push('');
        out.push(`## ${label('渡し方', 'How to pass them', l)}`);
        out.push('');
        out.push(
          bulletLine(
            '- 要素: `{ name: "受注管理", type: "ApplicationComponent", documentation: "…" }`',
            '- Element: `{ name: "Order Management", type: "ApplicationComponent", documentation: "…" }`',
            l,
          ),
        );
        out.push(
          bulletLine(
            '- 関係: `{ source: "受注管理", target: "受注サービス", type: "Realization" }`(source/target は要素名)',
            '- Relationship: `{ source: "Order Management", target: "Order Service", type: "Realization" }` (source/target are element names)',
            l,
          ),
        );
        out.push(
          bulletLine(
            '- 同名の要素が複数あるときは `Type:名前` で区別する(例: `BusinessRole:承認者`)',
            '- If two elements share a name, disambiguate with `Type:Name` (e.g. `BusinessRole:Approver`).',
            l,
          ),
        );
        out.push(
          bulletLine(
            '- 関係タイプは `Association` でも `AssociationRelationship` でも受け付ける(CSV 側は後者で書き出す)',
            '- Relationship types accept either `Association` or `AssociationRelationship`; the CSV output uses the latter form.',
            l,
          ),
        );
        out.push('');
        out.push(
          label(
            '迷ったら要素タイプは絞る。1 枚の図にタイプが 7 種類を超えると、読み手はもう関係を追えない。',
            'When in doubt, use fewer types. Past roughly seven element types on one view, readers stop following the relationships.',
            l,
          ),
        );

        return textResult(out.join('\n'));
      } catch (error) {
        return errorResult(
          label(
            `一覧の生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            `Failed to build the type list: ${error instanceof Error ? error.message : String(error)}`,
            l,
          ),
        );
      }
    },
  );
}
