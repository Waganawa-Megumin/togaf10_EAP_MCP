/**
 * エンゲージメント状態モデル / Engagement state model.
 *
 * 1 つの「アーキテクチャ案件」の進行状況を表す。JSON でそのまま永続化される。
 */

import { randomBytes } from 'node:crypto';

import { ADM_PHASES, type Bilingual, type Lang } from '../knowledge/index.js';

export const PHASE_STATUSES = ['not_started', 'in_progress', 'completed', 'skipped'] as const;
export type PhaseStatus = (typeof PHASE_STATUSES)[number];

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_STATUSES = ['open', 'mitigating', 'closed', 'accepted'] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

export const DECISION_STATUSES = ['proposed', 'accepted', 'rejected', 'superseded'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const ACTION_STATUSES = ['todo', 'in_progress', 'done', 'blocked'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const INFLUENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type InfluenceLevel = (typeof INFLUENCE_LEVELS)[number];

export const DELIVERABLE_STATUSES = ['not_started', 'drafting', 'review', 'approved', 'baselined'] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export const WORK_PACKAGE_STATUSES = ['proposed', 'planned', 'in_progress', 'delivered', 'cancelled'] as const;
export type WorkPackageStatus = (typeof WORK_PACKAGE_STATUSES)[number];

export const ASSESSMENT_KINDS = ['maturity', 'readiness'] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export interface PhaseProgress {
  phaseId: string;
  status: PhaseStatus;
  note?: string;
  updatedAt: string;
}

export interface Risk {
  id: string;
  title: string;
  description?: string;
  /** 対策前のリスクレベル */
  level: RiskLevel;
  /** 対策後に残るリスクレベル */
  residualLevel?: RiskLevel;
  status: RiskStatus;
  owner?: string;
  mitigation?: string;
  phaseId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Decision {
  id: string;
  title: string;
  /** 背景・検討した選択肢 */
  context?: string;
  /** 決定内容 */
  decision: string;
  /** 根拠 */
  rationale?: string;
  status: DecisionStatus;
  decidedBy?: string;
  phaseId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Action {
  id: string;
  title: string;
  owner?: string;
  /** 期限 (YYYY-MM-DD) */
  due?: string;
  status: ActionStatus;
  priority: Priority;
  phaseId?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Stakeholder {
  id: string;
  name: string;
  role?: string;
  organization?: string;
  influence: InfluenceLevel;
  interest: InfluenceLevel;
  /** 関心事(本人の言葉で) */
  concerns: string[];
  /** 関与方針 */
  approach?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliverableProgress {
  id: string;
  /** 知識ベースの成果物 ID(任意) */
  deliverableId?: string;
  name: string;
  status: DeliverableStatus;
  owner?: string;
  phaseId?: string;
  /** 保管場所(URL / パス) */
  link?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 移行アーキテクチャ(中間状態)。
 * `standalone` は「ここで止めても事業が回るか」— フェーズ E の必須確認事項。
 */
export interface TransitionState {
  id: string;
  name: string;
  /** ロードマップ上の並び順 */
  order: number;
  /** 到達目標時期。四半期表記を推奨(例: 2027-Q1) */
  targetQuarter?: string;
  /** その状態で実現している能力 */
  capabilities: string[];
  /** ここで止めても事業が回るか */
  standalone: boolean;
  /** 暫定的な仕組み(二重運用・暫定連携など) */
  interim?: string;
  /** 暫定の仕組みの廃棄計画と期限 */
  disposalPlan?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** 作業パッケージ(ギャップを束ねた実行単位) */
export interface WorkPackage {
  id: string;
  name: string;
  description?: string;
  status: WorkPackageStatus;
  /** 属する移行アーキテクチャ(TransitionState.id) */
  transitionId?: string;
  phaseId?: string;
  owner?: string;
  /** 四半期表記(例: 2026-Q3) */
  startQuarter?: string;
  endQuarter?: string;
  /** 先行する作業パッケージ ID */
  dependsOn: string[];
  /** 事業価値と実現容易性(優先順位付けの 2 軸) */
  businessValue: Priority;
  effort: Priority;
  costEstimate?: string;
  /** 実現する便益と、その刈り取り責任者 */
  benefit?: string;
  benefitOwner?: string;
  createdAt: string;
  updatedAt: string;
}

/** 評価因子(現在水準 / 目標水準) */
export interface AssessmentFactor {
  name: string;
  current: number;
  target: number;
  note?: string;
}

/** 成熟度評価 / 変革準備度評価の記録 */
export interface Assessment {
  id: string;
  kind: AssessmentKind;
  title: string;
  /** 評価尺度の最大値(既定 5) */
  scale: number;
  factors: AssessmentFactor[];
  summary?: string;
  assessedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Engagement {
  id: string;
  name: string;
  client?: string;
  industry?: string;
  description?: string;
  scope?: string;
  /** 現在注力しているフェーズ ID */
  currentPhaseId: string;
  /** アーカイブ済み(一覧では既定で非表示) */
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
  phases: PhaseProgress[];
  risks: Risk[];
  decisions: Decision[];
  actions: Action[];
  stakeholders: Stakeholder[];
  deliverables: DeliverableProgress[];
  transitions: TransitionState[];
  workPackages: WorkPackage[];
  assessments: Assessment[];
  notes: string[];
}

/** 複数エンゲージメントの索引 / Index entry for the multi-engagement store. */
export interface EngagementIndexEntry {
  id: string;
  name: string;
  client?: string;
  industry?: string;
  currentPhaseId: string;
  archived: boolean;
  updatedAt: string;
}

export interface EngagementIndex {
  /** いま選択されているエンゲージメント ID */
  currentId: string | null;
  engagements: EngagementIndexEntry[];
}

/** エンゲージメントから索引エントリを作る */
export function toIndexEntry(engagement: Engagement): EngagementIndexEntry {
  return {
    id: engagement.id,
    name: engagement.name,
    client: engagement.client,
    industry: engagement.industry,
    currentPhaseId: engagement.currentPhaseId,
    archived: engagement.archived === true,
    updatedAt: engagement.updatedAt,
  };
}

/** 現在時刻を ISO 文字列で返す */
export function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// ID 採番 / Identifier allocation
// ---------------------------------------------------------------------------

/**
 * ID の形は `<種別>-<通し番号>-<乱数>`(例: `risk-3-k7f2qa`)。
 *
 * **通し番号の意味は全種類で同じ**: 「その入れ物の中で何番目に作られたか」。
 * 入れ物は 2 段しかない。
 *
 * - 案件の中の項目(`risk` / `dec` / `act` / `stk` / `dlv` / `trn` / `wp` / `asmt`)
 *   → その**案件の中**での通し番号。種別ごとに 1 から数える。
 * - 案件そのもの(`eng`)→ **保存先全体**での通し番号。ただし採番表に入るのは
 *   そのプロセスが読み込んだ案件だけなので、索引しか読まずに新規作成する経路では
 *   番号が 1 に戻る(ID 自体は乱数部で必ず異なる)。`store.readIndex()` が
 *   `registerExistingIds(索引の ID 一覧)` を呼べば番号も通しになる。
 *
 * 以前はモジュール変数のカウンタだけで採番していたため、番号は
 * 「そのプロセスが何個 ID を作ったか」でしかなかった。1 回の呼び出しで
 * まとめて登録するツール(取り込みなど)では連番に見える一方、
 * `add_work_package` のように 1 件ずつ別プロセスで呼ばれるものは毎回 1 に戻り、
 * 同じ台帳の中で番号の意味が場所によって違っていた。
 *
 * いまは**保存済みの状態から採番する**。読み込み時(`normalizeEngagement`)に
 * 既存 ID を採番表へ取り込み、次の番号をその最大値の次に押し上げる。
 * したがって取り込みを 2 回走らせても `risk-1` が 2 つできることはない。
 *
 * 乱数部は残す。プロセスをまたいで同時に書き込まれた場合(番号だけでは
 * 衝突しうる)と、外部で編集された ID との衝突に対する保険。
 */
const ID_SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 案件そのものの ID 種別 */
const ENGAGEMENT_ID_PREFIX = 'eng';

/** 案件 ID を数える入れ物のキー(案件 ID とは衝突しない名前にする) */
const ENGAGEMENT_SCOPE_KEY = '#engagements';

/**
 * 採番表に取り込む番号の上限。外部で編集された `risk-99999999999-x` のような
 * ID に引きずられて、以降の番号が読めない桁数になるのを防ぐ。
 */
const MAX_SEED_SEQUENCE = 1_000_000;

/** `<種別>-<番号>` を取り出す。番号が無い ID(`eng-legacy-1` など)は一致しない */
const ID_SEQUENCE_PATTERN = /^([a-z][a-z0-9]*)-(\d{1,12})(?:-|$)/i;

interface IdScope {
  /** この入れ物で既に使われている ID */
  used: Set<string>;
  /** 種別ごとの次の番号 */
  next: Map<string, number>;
}

/** 入れ物(案件 ID か `#engagements`)ごとの採番状態 */
const idScopes = new Map<string, IdScope>();

/** このプロセスが見た・作った全 ID。入れ物を取り違えても衝突させないための保険 */
const knownIds = new Set<string>();

/** 直近に読み込まれた案件。`makeId` に入れ物が渡されなかったときの既定 */
let activeScopeKey: string | null = null;

function getIdScope(key: string): IdScope {
  let scope = idScopes.get(key);
  if (!scope) {
    scope = { used: new Set<string>(), next: new Map<string, number>() };
    idScopes.set(key, scope);
  }
  return scope;
}

/** 入れ物の指定(案件そのもの / 案件 ID / 未指定)をキーに直す */
function scopeKeyFor(prefix: string, scope?: Engagement | string): string {
  if (typeof scope === 'string' && scope.length > 0) return scope;
  if (scope && typeof scope === 'object' && typeof scope.id === 'string' && scope.id.length > 0) {
    return scope.id;
  }
  if (prefix === ENGAGEMENT_ID_PREFIX) return ENGAGEMENT_SCOPE_KEY;
  return activeScopeKey ?? ENGAGEMENT_SCOPE_KEY;
}

/** ファイル名にもそのまま使える種別名に整える */
function normalizePrefix(prefix: string): string {
  const cleaned = prefix.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned.length > 0 ? cleaned : 'id';
}

function randomIdSuffix(length = 6): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ID_SUFFIX_ALPHABET[(bytes[i] ?? 0) % ID_SUFFIX_ALPHABET.length];
  }
  return out;
}

/** ID 1 件を採番表に取り込む(既存の番号を追い越すように次の番号を上げる) */
function registerId(id: string, scope: IdScope): void {
  if (typeof id !== 'string' || id.length === 0) return;
  scope.used.add(id);
  knownIds.add(id);
  const match = ID_SEQUENCE_PATTERN.exec(id);
  if (!match) return;
  const prefix = normalizePrefix(match[1] ?? '');
  const seq = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(seq) || seq < 1 || seq > MAX_SEED_SEQUENCE) return;
  const next = scope.next.get(prefix) ?? 1;
  if (seq + 1 > next) scope.next.set(prefix, seq + 1);
}

/**
 * 保存済みの ID を採番表に取り込む。
 *
 * 呼ぶ必要があるのは「model.ts の外で ID を読み込んだ」場合だけ
 * (案件そのものの読み込みは `normalizeEngagement` が済ませる)。
 *
 * @param ids   既に存在する ID
 * @param scope 入れ物。案件かその ID。未指定なら案件 ID の入れ物として扱う
 */
export function registerExistingIds(ids: Iterable<string>, scope?: Engagement | string): void {
  const key = typeof scope === 'string' || scope ? scopeKeyFor(ENGAGEMENT_ID_PREFIX, scope) : ENGAGEMENT_SCOPE_KEY;
  const target = getIdScope(key);
  for (const id of ids) registerId(id, target);
}

/** 案件 1 件ぶんの ID(案件自身と全項目)を採番表に取り込み、既定の入れ物にする */
export function registerEngagementIds(engagement: Engagement): void {
  registerId(engagement.id, getIdScope(ENGAGEMENT_SCOPE_KEY));
  const scope = getIdScope(engagement.id);
  const lists: { id?: unknown }[][] = [
    engagement.risks,
    engagement.decisions,
    engagement.actions,
    engagement.stakeholders,
    engagement.deliverables,
    engagement.transitions,
    engagement.workPackages,
    engagement.assessments,
  ];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item && typeof item.id === 'string') registerId(item.id, scope);
    }
  }
  activeScopeKey = engagement.id;
}

/**
 * 種別ごとの一意 ID を作る(例: `risk-3-k7f2qa`)。
 *
 * 番号は**保存済みの状態の続き**から始まる。読み込み済みの案件があれば
 * その案件の中での通し番号、無ければ案件 ID の通し番号。
 *
 * @param prefix 種別(`risk` / `act` / `wp` など)
 * @param scope  どの案件の中で数えるか。省略時は直近に読み込まれた案件
 */
export function makeId(prefix: string, scope?: Engagement | string): string {
  const kind = normalizePrefix(prefix);
  const target = getIdScope(scopeKeyFor(kind, scope));
  let seq = target.next.get(kind) ?? 1;
  // 番号 + 乱数の両方が一致したときだけ番号を進める(通常は 1 周目で確定する)
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = `${kind}-${seq}-${randomIdSuffix()}`;
    if (!knownIds.has(candidate) && !target.used.has(candidate)) {
      target.used.add(candidate);
      knownIds.add(candidate);
      target.next.set(kind, seq + 1);
      return candidate;
    }
    seq += 1;
  }
  // ここには到達しない想定。到達しても衝突しないよう乱数部を伸ばす。
  const fallback = `${kind}-${seq}-${randomIdSuffix(16)}`;
  target.used.add(fallback);
  knownIds.add(fallback);
  target.next.set(kind, seq + 1);
  return fallback;
}

/**
 * 採番表を空にする(テスト用)。
 * 実行中のサーバーからは呼ばない — 呼ぶと番号が 1 に戻る。
 */
export function resetIdAllocationForTests(): void {
  idScopes.clear();
  knownIds.clear();
  activeScopeKey = null;
}

/** 全 ADM フェーズを未着手で初期化する */
export function initialPhases(timestamp: string): PhaseProgress[] {
  return ADM_PHASES.map((p) => ({
    phaseId: p.id,
    status: 'not_started' as PhaseStatus,
    updatedAt: timestamp,
  }));
}

// ---------------------------------------------------------------------------
// 入力長の上限 / Input length limits
// ---------------------------------------------------------------------------

/**
 * 文字列フィールドの上限 / Per-field character limits.
 *
 * 上限が無いと、数万文字の案件名や関心事がそのまま JSON に保存され、
 * 以降すべてのダッシュボード・表・書き出しが読めなくなる(1 セルが画面を埋める)。
 * ここは**黙って切り詰めず、明確なエラーで弾く**。切り詰めると利用者は
 * 何が失われたか分からないまま保存が完了してしまうため。
 *
 * `hint` には「ではどこに書けばよいか」を必ず入れる。上限を伝えるだけでは
 * 利用者は同じ内容を貼り直すしかない。
 */
export interface TextFieldLimit {
  /** 上限文字数 */
  limit: number;
  /** 超えたときの逃がし先 */
  hint: Bilingual;
}

export const TEXT_LIMITS = {
  /** 案件名。一覧・見出し・ファイル名に出るので短く */
  name: {
    limit: 200,
    hint: {
      ja: '短い呼び名を name に入れ、背景や詳細は description に書いてください。',
      en: 'Put a short label in name and move the background and detail into description.',
    },
  },
  client: {
    limit: 200,
    hint: {
      ja: '組織名だけを client に入れ、補足は description に書いてください。',
      en: 'Keep client to the organisation name and put anything else in description.',
    },
  },
  industry: {
    limit: 100,
    hint: {
      ja: '業界名だけを industry に入れてください(例: 銀行、製造)。',
      en: 'Keep industry to the industry name alone (for example: banking, manufacturing).',
    },
  },
  /** 表の 1 行になる見出し。長いと表が崩れる */
  title: {
    limit: 300,
    hint: {
      ja: '1 行で読める見出しにし、詳細は description / note 側に書いてください。',
      en: 'Keep the title readable on one line and move the detail into description or note.',
    },
  },
  /** ステークホルダーの関心事 1 件 */
  concern: {
    limit: 500,
    hint: {
      ja: '関心事は 1 件ずつ短く分けて登録し、長い経緯は approach に書いてください。',
      en: 'Record concerns as short separate entries and put the long background into approach.',
    },
  },
  /** 自由記述(説明・背景・対策・メモなど) */
  text: {
    limit: 4000,
    hint: {
      ja: 'この長さを超える内容は文書として別に保管し、link に場所を書いてください。',
      en: 'Store anything longer as its own document and record where it lives in link.',
    },
  },
} as const satisfies Record<string, TextFieldLimit>;

/** `TEXT_LIMITS` に定義のある種別 */
export type TextFieldKind = keyof typeof TEXT_LIMITS;

/** 1 つの配列フィールドに入れられる要素数の上限(関心事・能力・依存など) */
export const MAX_LIST_ITEMS = 100;

/**
 * 入力が上限を超えたときのエラー。
 *
 * MCP SDK はツールコールバックの例外を捕捉して `isError: true` の結果に変換するため、
 * これを投げてもサーバーは落ちない。メッセージは利用者がそのまま読む前提で日英併記。
 */
export class EngagementInputError extends Error {
  readonly field: string;
  readonly limit: number;
  readonly actual: number;

  constructor(message: string, field: string, limit: number, actual: number) {
    super(message);
    this.name = 'EngagementInputError';
    this.field = field;
    this.limit = limit;
    this.actual = actual;
  }
}

/**
 * 文字列フィールドの長さを検査する。超えていれば `EngagementInputError` を投げる。
 *
 * @param field 利用者に見せるフィールド名(例: `name`, `risks[0].title`)
 * @param value 検査対象。undefined / null は「未指定」として通す
 * @param kind  上限の種別。既定は `text`(自由記述)
 */
export function assertTextLimit(field: string, value: unknown, kind: TextFieldKind = 'text'): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string') return;
  const { limit, hint } = TEXT_LIMITS[kind];
  const actual = value.length;
  if (actual <= limit) return;
  throw new EngagementInputError(
    `入力が長すぎます: ${field} は ${limit} 文字までです(受け取った長さ: ${actual} 文字)。${hint.ja}` +
      ` / Input too long: ${field} accepts at most ${limit} characters (received ${actual}). ${hint.en}`,
    field,
    limit,
    actual,
  );
}

/**
 * 文字列配列の要素数と各要素の長さを検査する。
 * 関心事のような「いくらでも足せる」項目が保存 JSON を壊さないようにする。
 */
export function assertTextListLimit(
  field: string,
  values: unknown,
  kind: TextFieldKind = 'text',
  maxItems: number = MAX_LIST_ITEMS,
): void {
  if (values === undefined || values === null) return;
  if (!Array.isArray(values)) return;
  if (values.length > maxItems) {
    throw new EngagementInputError(
      `項目が多すぎます: ${field} は ${maxItems} 件までです(受け取った件数: ${values.length} 件)。` +
        '束ねるか、複数回に分けて登録してください。' +
        ` / Too many entries: ${field} accepts at most ${maxItems} (received ${values.length}). Group them, or register them in several calls.`,
      field,
      maxItems,
      values.length,
    );
  }
  values.forEach((v, i) => assertTextLimit(`${field}[${i}]`, v, kind));
}

/** 案件の基本情報(名称・クライアント・概要・スコープ)をまとめて検査する */
export function assertEngagementProfile(input: {
  name?: unknown;
  client?: unknown;
  industry?: unknown;
  description?: unknown;
  scope?: unknown;
}): void {
  assertTextLimit('name', input.name, 'name');
  assertTextLimit('client', input.client, 'client');
  assertTextLimit('industry', input.industry, 'industry');
  assertTextLimit('description', input.description, 'text');
  assertTextLimit('scope', input.scope, 'text');
}

// ---------------------------------------------------------------------------
// 出力量の上限 / Output size limits
// ---------------------------------------------------------------------------

/**
 * 表 1 つあたりに出す最大件数 / How many rows one table may show.
 *
 * 関係者 60 名・リスク 60 件の案件では、全件を出すと 1 回の応答が数万文字になり、
 * 会話がそれだけで埋まる(実測: `get_dashboard` 15,000 字 / 22KB、`stakeholder_matrix` 32KB)。
 * 表示側はこの値で切り、切ったことと全件の見方を必ず添える。
 *
 * 上限は**ここ 1 か所**に置く。表ごとに別々の数字を直書きすると、
 * 「どこまで出るのか」が利用者にも実装者にも分からなくなるため。
 * 取り込み先(未適用): `dashboard/markdown.ts` の `renderDashboardMarkdown`
 * (`compact` / `limit` を件数に応じて自動で立てる)、`tools/analysis.ts` の
 * `stakeholder_matrix` / `risk_matrix` の一覧表。
 */
export const OUTPUT_LIMITS = {
  /** 通常の表(リスク・アクション・関係者など) */
  rows: 20,
  /** 診断系ツールの「指摘」など、上位だけ見れば足りるもの */
  highlights: 10,
  /** 1 セルに入れる文字数 */
  cell: 120,
} as const;

/** 上限で切った結果 / A list after the cap has been applied. */
export interface CappedRows<T> {
  rows: T[];
  /** 元の件数 */
  total: number;
  /** 表示しなかった件数 */
  hidden: number;
  /** 切ったかどうか */
  capped: boolean;
}

/**
 * 一覧を上位 N 件に切る。切った件数を必ず返すので、呼び出し側は
 * 「黙って切る」ことができない(`hidden` を無視すると型は通るが、
 * `capNotice` を添えるのが本来の使い方)。
 */
export function capRows<T>(rows: readonly T[], limit: number = OUTPUT_LIMITS.rows): CappedRows<T> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : OUTPUT_LIMITS.rows;
  const all = Array.isArray(rows) ? rows : [];
  if (all.length <= safeLimit) {
    return { rows: [...all], total: all.length, hidden: 0, capped: false };
  }
  return {
    rows: all.slice(0, safeLimit),
    total: all.length,
    hidden: all.length - safeLimit,
    capped: true,
  };
}

/**
 * 切ったことを利用者に伝える 1 行を作る。切っていなければ空文字。
 *
 * @param capped   `capRows` の結果
 * @param seeAll   全件を見る方法(ツール名と引数)。例: `{ ja: '全件は `get_engagement` に format="json" を渡す', en: ... }`
 */
export function capNotice(capped: CappedRows<unknown>, seeAll: Bilingual, lang: Lang = 'both'): string {
  if (!capped.capped) return '';
  const ja = `上位 ${capped.rows.length} 件を表示(全 ${capped.total} 件、残り ${capped.hidden} 件は非表示)。${seeAll.ja}`;
  const en = `Showing the top ${capped.rows.length} of ${capped.total} (${capped.hidden} hidden). ${seeAll.en}`;
  if (lang === 'ja') return ja;
  if (lang === 'en') return en;
  return `${ja} / ${en}`;
}

/** 1 セルが表を壊さない長さに収める(切ったことが分かる印を残す) */
export function capCell(value: string, limit: number = OUTPUT_LIMITS.cell): string {
  const flat = value.replace(/\r?\n+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit)}…(+${flat.length - limit})`;
}

export interface CreateEngagementInput {
  name: string;
  client?: string;
  industry?: string;
  description?: string;
  scope?: string;
  currentPhaseId?: string;
}

/**
 * 新しいエンゲージメントを作る。
 * 上限を超える入力は保存前に `EngagementInputError` で弾く(切り詰めない)。
 */
export function createEngagement(input: CreateEngagementInput): Engagement {
  assertEngagementProfile(input);
  const timestamp = now();
  const id = makeId(ENGAGEMENT_ID_PREFIX);
  // 作った直後にこの案件へ項目を足す呼び出し元のために、既定の入れ物を移す
  activeScopeKey = id;
  return {
    id,
    name: input.name,
    client: input.client,
    industry: input.industry,
    description: input.description,
    scope: input.scope,
    currentPhaseId: input.currentPhaseId ?? 'a',
    createdAt: timestamp,
    updatedAt: timestamp,
    phases: initialPhases(timestamp),
    risks: [],
    decisions: [],
    actions: [],
    stakeholders: [],
    deliverables: [],
    transitions: [],
    workPackages: [],
    assessments: [],
    notes: [],
  };
}

/** フェーズ進捗の集計 / Roll up phase progress for the dashboard. */
export interface ProgressSummary {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  skipped: number;
  /** skipped を除いた完了率(0-100) */
  percent: number;
}

export function summarizeProgress(engagement: Engagement): ProgressSummary {
  const counts = { completed: 0, in_progress: 0, not_started: 0, skipped: 0 };
  for (const p of engagement.phases) counts[p.status] += 1;
  const effective = engagement.phases.length - counts.skipped;
  const percent = effective > 0
    ? Math.round(((counts.completed + counts.in_progress * 0.5) / effective) * 100)
    : 0;
  return {
    total: engagement.phases.length,
    completed: counts.completed,
    inProgress: counts.in_progress,
    notStarted: counts.not_started,
    skipped: counts.skipped,
    percent,
  };
}

/** 未読み込みの古い JSON でも壊れないように欠損フィールドを補う */
export function normalizeEngagement(raw: unknown): Engagement | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Partial<Engagement>;
  if (typeof e.id !== 'string' || typeof e.name !== 'string') return null;
  const timestamp = typeof e.updatedAt === 'string' ? e.updatedAt : now();
  const knownPhaseIds = new Set(ADM_PHASES.map((p) => p.id));
  const phases = Array.isArray(e.phases) ? e.phases.filter((p) => knownPhaseIds.has(p?.phaseId)) : [];
  // 知識ベース側にフェーズが増えた場合に備えて不足分を補完する
  for (const p of ADM_PHASES) {
    if (!phases.some((x) => x.phaseId === p.id)) {
      phases.push({ phaseId: p.id, status: 'not_started', updatedAt: timestamp });
    }
  }
  const engagement: Engagement = {
    id: e.id,
    name: e.name,
    client: e.client,
    industry: e.industry,
    description: e.description,
    scope: e.scope,
    currentPhaseId: typeof e.currentPhaseId === 'string' ? e.currentPhaseId : 'a',
    archived: e.archived === true,
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : timestamp,
    updatedAt: timestamp,
    phases,
    risks: Array.isArray(e.risks) ? e.risks : [],
    decisions: Array.isArray(e.decisions) ? e.decisions : [],
    actions: Array.isArray(e.actions) ? e.actions : [],
    stakeholders: Array.isArray(e.stakeholders) ? e.stakeholders : [],
    deliverables: Array.isArray(e.deliverables) ? e.deliverables : [],
    transitions: Array.isArray(e.transitions) ? e.transitions : [],
    workPackages: Array.isArray(e.workPackages) ? e.workPackages : [],
    assessments: Array.isArray(e.assessments) ? e.assessments : [],
    notes: Array.isArray(e.notes) ? e.notes : [],
  };
  // 読み込みは必ずここを通る。保存済みの ID を採番表に取り込むのはこの 1 か所。
  registerEngagementIds(engagement);
  return engagement;
}
