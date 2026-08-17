/**
 * コンサルティングツール / Consulting tool.
 *
 * 状況の自由記述を受け取り、該当するルールから
 * 関連フェーズ・推奨技法・作るべき成果物・推奨アクション・確認質問を返す。
 *
 * ここで重要なのは「話題が同じでも状況が違えば助言も違う」という点。
 * 予算ゼロ・ひとり体制の相談者に、予算潤沢・専任チーム向けの助言を返すのは害になる。
 * そのため次の 3 つを本文から読み取り、出力に反映する。
 *
 * 1. 打ち消し — 「やらないことに決まった」話題はルールを発火させない(外した事実は明示する)
 * 2. 条件    — 予算 / 期限 / 経営の関与 / 体制 / 既存資料 / 決定権 / 現場の空気 / 規制
 * 3. 業界    — `industry` 引数(または本文からの推定)で見立てと質問を業界の言葉に寄せる
 *
 * ルールが持つアクション・質問は位置で切らず、上記との関連が強い順に並べ替えてから絞る。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  bullets,
  detectIndustryCapabilitySets,
  findDeliverable,
  findIndustryCapabilitySet,
  findPhase,
  findTechnique,
  matchConsultRules,
  searchKnowledge,
  text,
  INDUSTRY_CAPABILITY_SETS,
  type Bilingual,
  type IndustryCapabilitySet,
  type IndustryReferenceCapability,
  type Lang,
  type RuleMatch,
} from '../knowledge/index.js';
import {
  SITUATION_AXIS_LABELS,
  SITUATION_CONDITIONS,
  factAdvice,
  matchConditionCombos,
  rankByRelevance,
  readSituation,
  situationAdvice,
  type DetectedCondition,
  type SituationAxis,
  type SituationCondition,
  type SituationConditionId,
  type SituationContext,
  type SituationFact,
  type SituationReading,
} from '../knowledge/consulting.js';
import { loadEngagement } from '../engagement/store.js';
import type { Engagement } from '../engagement/model.js';
import { errorResult, langSchema, msg, textResult } from './common.js';
import {
  checkFreeText,
  echoInput,
  freeTextSchema,
  HINTS,
  IDENTIFIER_LIMIT,
} from './input-limits.js';

/**
 * 案件から状況として読み込むテキストの上限。
 * 案件の説明が長くても、相談文の読み取りを押し流さないようにする。
 */
const CONTEXT_MAX = 4_000;

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

/** 箇条書きの内側で使う 1 行。both でも改行しない(改行するとリストが壊れる) */
function inline(ja: string, en: string, lang: Lang): string {
  if (lang === 'ja') return ja;
  if (lang === 'en') return en;
  return `${ja} / ${en}`;
}

/** 箇条書き 1 件。both では bullets() と同じく英語を子項目にする */
function bulletPair(ja: string, en: string, lang: Lang): string {
  if (lang === 'ja') return `- ${ja}`;
  if (lang === 'en') return `- ${en}`;
  return `- ${ja}\n  - ${en}`;
}

/**
 * 見出しの下に出す文脈行(現在フェーズ・業界・readings・案件)をまとめて 1 ブロックにする。
 *
 * ここは以前 `msg()` の結果に `cell()` を掛けていた。`cell()` は表を壊さないために
 * 改行を空白へ畳むので、`both` では `msg()` が入れた日英の区切りの改行まで消え、
 * 「…推定していません) Readings supplied by the caller: …」と地続きに繋がっていた
 * (実測)。日英は言語ごとに 1 行へ分けて組み立て、畳むのは各言語の中だけにする。
 */
function contextBlock(items: Bilingual[], lang: Lang): string {
  const line = (target: 'ja' | 'en'): string =>
    items
      .map((c) => cell(c[target]))
      .filter((c) => c.length > 0)
      .join(' / ');
  if (lang === 'ja') return `*${line('ja')}*`;
  if (lang === 'en') return `*${line('en')}*`;
  return `*${line('ja')}*\n*${line('en')}*`;
}

/** Markdown 表に入れる前に、区切りを壊す文字を無害化する */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function phaseLine(id: string, lang: Lang): string | null {
  const p = findPhase(id);
  if (!p) return null;
  return `**${p.code}. ${text(p.name, lang)}** — ${text(p.tagline, lang)}`;
}

function techniqueLine(id: string, lang: Lang): string | null {
  const t = findTechnique(id);
  if (!t) return null;
  return `**${text(t.name, lang)}** (\`${t.id}\`) — ${text(t.summary, lang === 'both' ? 'ja' : lang)}`;
}

function deliverableLine(id: string, lang: Lang): string | null {
  const d = findDeliverable(id);
  if (!d) return null;
  return `**${text(d.name, lang)}** (\`${d.id}\`) — ${text(d.summary, lang === 'both' ? 'ja' : lang)}`;
}

/** ID 群を、名称と要約の文面で状況との関連順に並べ替える */
function rankIds(
  ids: string[],
  lookup: (id: string) => { name: Bilingual; summary?: Bilingual } | undefined,
  reading: SituationReading,
  extraTerms: string[],
  limit: number,
): string[] {
  const entries: { id: string; blob: Bilingual }[] = [];
  for (const id of ids) {
    const found = lookup(id);
    if (!found) continue;
    entries.push({
      id,
      blob: {
        ja: `${found.name.ja} ${found.summary?.ja ?? ''}`,
        en: `${found.name.en} ${found.summary?.en ?? ''}`,
      },
    });
  }
  const index = new Map(entries.map((e) => [e.blob, e.id]));
  const ranked = rankByRelevance(
    entries.map((e) => e.blob),
    reading,
    extraTerms,
    limit,
  );
  return ranked.map((b) => index.get(b)).filter((v): v is string => typeof v === 'string');
}

/** 業界の解決結果 */
interface IndustryResolution {
  set?: IndustryCapabilitySet;
  /** given=引数で指定 / detected=本文から推定 / unsupported=引数はあるが未対応 / none=手がかり無し */
  source: 'given' | 'detected' | 'unsupported' | 'none';
  requested?: string;
}

function resolveIndustry(industry: string | undefined, reading: SituationReading): IndustryResolution {
  const requested = industry?.trim();
  if (requested && requested.length > 0) {
    const set = findIndustryCapabilitySet(requested);
    return set ? { set, source: 'given', requested } : { source: 'unsupported', requested };
  }
  const detected = detectIndustryCapabilitySets(reading.positiveText).filter((d) => d.confident);
  const top = detected[0];
  return top ? { set: top.set, source: 'detected' } : { source: 'none' };
}

/** 状況文に出てくる語で、その業界のどの能力が話題かを絞る */
function relevantIndustryCapabilities(
  set: IndustryCapabilitySet,
  reading: SituationReading,
  limit: number,
): { caps: IndustryReferenceCapability[]; fromText: boolean } {
  const hay = reading.positiveText.toLowerCase();
  const hit = set.capabilities.filter((c) =>
    c.triggers.some((t) => hay.includes(t.toLowerCase())),
  );
  if (hit.length > 0) return { caps: hit.slice(0, limit), fromText: true };
  return {
    caps: set.capabilities.filter((c) => c.group === 'core' && c.universal).slice(0, limit),
    fromText: false,
  };
}

function industryNameList(lang: Lang): string {
  return INDUSTRY_CAPABILITY_SETS.map((s) => `${text(s.name, lang === 'both' ? 'ja' : lang)} (\`${s.id}\`)`).join(' / ');
}

/** 引用に入れる節。長すぎる節は切り詰める(表・引用を壊さないよう cell を通す) */
function quoteClause(value: string, max = 60): string {
  const one = cell(value);
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

/**
 * 業界の観点(見立てが立った場合も、定型に一致しなかった場合も同じものを出す)。
 *
 * 返す `questions` は、その業界でしか聞けない確認事項。
 */
function industrySection(
  info: IndustryResolution,
  reading: SituationReading,
  l: Lang,
): { lines: string[]; questions: Bilingual[] } {
  const lines: string[] = [];
  const questions: Bilingual[] = [];
  if (info.set) {
    const set = info.set;
    const { caps, fromText } = relevantIndustryCapabilities(set, reading, 3);
    lines.push(msg(`## 業界の観点 — ${text(set.name, 'ja')}`, `## Industry View — ${set.name.en}`, l));
    lines.push('');
    lines.push(text(set.essence, l === 'both' ? 'ja' : l));
    lines.push('');
    if (caps.length > 0) {
      lines.push(
        fromText
          ? msg(
              'ご相談の文面に出ている語から、先に見るべき業界固有の能力:',
              'Industry-specific capabilities picked up from the wording of your description:',
              l,
            )
          : msg(
              '相談文からは業界固有の語を拾えなかったので、この業界の中核能力を挙げます(当たっていなければ無視してください):',
              'Your description contains no industry-specific vocabulary, so these are simply this industry\'s core capabilities — ignore them if they do not apply:',
              l,
            ),
      );
      lines.push('');
      for (const c of caps) {
        lines.push(`- **${text(c.name, l)}** — ${text(c.definition, l === 'both' ? 'ja' : l)}`);
        const weak = c.weakSigns[0];
        if (weak) {
          lines.push(
            `  - ${inline('弱いと起きること', 'When it is weak', l)}: ${text(weak, l === 'both' ? 'ja' : l)}`,
          );
        }
        const probe = c.probes[0];
        if (probe) questions.push(probe);
      }
      lines.push('');
    }
    const notes = set.notes.slice(0, 2);
    if (notes.length > 0) {
      lines.push(msg('この業界で外すと痛い点:', 'What hurts if you get it wrong in this industry:', l));
      lines.push('');
      lines.push(bullets(notes, l));
      lines.push('');
    }
    // 案内先は実在するツールに限る。存在しないツール名を書くと、
    // 前提知識の無い利用者はそこで必ず止まる(レッドチームで 4 ペルソナが独立に報告)。
    lines.push(
      msg(
        `この業界の能力を一覧で見るなら \`draft_capability_map\` に \`industry: "${set.id}"\` と事業の説明を渡してください。`,
        `For the full capability list, call \`draft_capability_map\` with \`industry: "${set.id}"\` and a description of the business.`,
        l,
      ),
    );
    lines.push('');
  } else if (info.source === 'unsupported' && info.requested) {
    lines.push(msg('## 業界の観点', '## Industry View', l));
    lines.push('');
    lines.push(
      msg(
        `「${cell(info.requested)}」は業界別の知識セットに入っていないので、業界固有の助言は出せません。以下は業界を問わない一般論として読んでください。`,
        `"${cell(info.requested)}" is not in the industry knowledge sets, so no industry-specific guidance is available. Read the rest as general, industry-neutral advice.`,
        l,
      ),
    );
    lines.push('');
    lines.push(
      msg(`用意があるのは: ${industryNameList(l)}`, `Available industry sets: ${industryNameList(l)}`, l),
    );
    lines.push('');
  }
  return { lines, questions };
}

/**
 * 案件に登録済みの情報を「状況」として読めるテキストにまとめる。
 *
 * これまで consult は `currentPhaseId` しか見ておらず、案件の description / scope /
 * リスク / アクションの期限を一度も読んでいなかった。案件側に
 * 「9 月 18 日の経営会議」「予算は 5 億円が上限」と書いてあっても助言に出てこない、
 * という報告の直接の原因がこれ。
 *
 * ルールの一致(見立て)には混ぜない。今聞かれていることが案件の説明で薄まると、
 * 相談に対する答えではなくなる。条件・数値・並べ替えにだけ効かせる。
 */
function engagementContext(engagement: Engagement | null): SituationContext | undefined {
  if (!engagement) return undefined;
  const parts: string[] = [];
  if (engagement.description) parts.push(engagement.description);
  if (engagement.scope) parts.push(engagement.scope);
  for (const r of engagement.risks
    .filter((risk) => risk.status === 'open' || risk.status === 'mitigating')
    .slice(0, 5)) {
    parts.push(r.description ? `${r.title}: ${r.description}` : r.title);
  }
  const dated = engagement.actions
    .filter(
      (a): a is typeof a & { due: string } =>
        a.status !== 'done' && typeof a.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.due),
    )
    .sort((a, b) => (a.due < b.due ? -1 : 1))
    .slice(0, 5);
  // 「due」は期日の手がかりとして日英どちらの読み取りにも効く語なので、そのまま添える
  for (const a of dated) parts.push(`${a.title} (due ${a.due})`);
  const text = parts.join('。').slice(0, CONTEXT_MAX);
  if (text.trim().length < 3) return undefined;
  return {
    text,
    label: {
      ja: `案件「${engagement.name}」に登録済みの内容`,
      en: `recorded on engagement "${engagement.name}"`,
    },
  };
}

/**
 * 「誰が読んだか」の表記。
 *
 * サーバーの読み取りと呼び出し側の読み取りを混ぜたまま見せると、
 * 当たっている読みがどちらのものか利用者に判別できない。必ず分けて出す。
 */
const READ_BY_CALLER: Bilingual = {
  ja: 'あなたが渡した読み取り',
  en: 'the readings you passed',
};
const READ_BY_SERVER: Bilingual = {
  ja: 'このサーバーが本文から拾った',
  en: 'picked up from the text by this server',
};

/** 事実 1 件を表の 1 行にする */
function factRow(fact: SituationFact, l: Lang): string {
  const quoted = l === 'en' ? `"${cell(fact.evidence)}"` : `「${cell(fact.evidence)}」`;
  const evidence = [quoted, cell(quoteClause(fact.clause, 40))]
    .filter((v) => v.length > 0)
    .join(' — ');
  const source = fact.sourceLabel
    ? ` (${cell(text(fact.sourceLabel, l === 'both' ? 'ja' : l))})`
    : '';
  // 数値は常にサーバー側の走査で拾ったもの(readings では数値を受け取らない)
  return `| ${cell(text(fact.topic, l === 'both' ? 'ja' : l))} | ${cell(text(fact.label, l))} | ${evidence}${source} | ${cell(text(READ_BY_SERVER, l === 'both' ? 'ja' : l))} |`;
}

// ---------------------------------------------------------------------------
// readings — 呼び出し側(会話全体を読んでいる Claude)が渡す状況の読み取り
// ---------------------------------------------------------------------------
//
// このサーバーの状況読み取りは正規表現。相談文に書かれた定型表現しか見えない。
// 一方、このツールを呼ぶ側は会話全体・添付文書・10 通前の発言まで読んでいる。
// 「予算は限られている」と 5 通前に言われていた、という事実は situation に
// 書き写されない限りサーバーには永遠に届かない。
//
// そこで軸ごとの読み取りを引数で受け取る。渡された軸は呼び出し側の読み取りを採り、
// 渡されなかった軸だけをサーバーの正規表現が埋める(=控え)。
// 出力では必ず「どちらが読んだか」を出す。混ぜたまま見せると、当たっているのが
// どちらの読みなのかを利用者が検証できない。

/** 読み取りの根拠に許す長さ。documents 側の source と揃える */
const EVIDENCE_LIMIT = 300;

/** 軸ごとに選べる値。値は `SITUATION_CONDITIONS` の ID そのもの */
const READING_CHOICES = {
  budget: ['budget-ample', 'budget-tight', 'budget-none'],
  time: ['deadline-urgent', 'deadline-fixed', 'deadline-none'],
  sponsorship: ['sponsor-committed', 'sponsor-absent'],
  capacity: ['team-dedicated', 'team-solo'],
  assets: ['assets-available', 'assets-none'],
  authority: ['authority-none'],
  climate: ['field-resistance'],
  regulation: ['regulated'],
} satisfies Record<SituationAxis, readonly SituationConditionId[]>;

type ReadingAxis = keyof typeof READING_CHOICES;

/**
 * 根拠欄のスキーマ。
 *
 * **毎回新しい zod インスタンスを返すこと。** 1 個の定数を 8 軸で使い回すと、
 * zod-to-json-schema が 2 個目以降を `$ref` に畳み、説明文がその軸から消える(実測)。
 *
 * 説明文はここでは 1 行に留める。同じ 290 バイトを 8 軸に複製すると
 * それだけで 2 千バイトを超え、ツール一覧を読む側の負担になるだけで情報は増えない。
 * 「何を書けばよいか(発言・該当箇所・ページ番号)」と「なぜ必要か(利用者が誤読を
 * 正せるようにするため)」は、`readings` のツール説明に 1 回だけ書いてある。
 */
function evidenceSchema() {
  return freeTextSchema('そう読んだ根拠 / Evidence for this reading', EVIDENCE_LIMIT).min(1);
}

/** 1 軸ぶんのスキーマ。選べる値はその軸の条件 ID に限る */
function axisReadingSchema(axis: ReadingAxis, ja: string, en: string) {
  const choices = READING_CHOICES[axis] as unknown as readonly [
    SituationConditionId,
    ...SituationConditionId[],
  ];
  return z
    .object({
      condition: z.enum(choices).describe(`${ja} / ${en}`),
      evidence: evidenceSchema(),
    })
    .optional();
}

const readingsSchema = z
  .object({
    budget: axisReadingSchema('budget', '予算', 'Budget'),
    time: axisReadingSchema('time', '期限', 'Deadline'),
    sponsorship: axisReadingSchema('sponsorship', '経営の関与', 'Executive sponsorship'),
    capacity: axisReadingSchema('capacity', '体制', 'Staffing'),
    assets: axisReadingSchema('assets', '既存資料', 'Existing material'),
    authority: axisReadingSchema('authority', '決定権', 'Decision rights'),
    climate: axisReadingSchema('climate', '現場の空気', 'Ground-level climate'),
    regulation: axisReadingSchema('regulation', '規制', 'Regulation'),
  })
  .optional();

type ReadingsInput = z.infer<typeof readingsSchema>;

/** 呼び出し側から渡された読み取り 1 件 */
interface GivenReading {
  axis: SituationAxis;
  condition: SituationCondition;
  evidence: string;
}

const CONDITION_BY_ID = new Map(SITUATION_CONDITIONS.map((c) => [c.id, c]));

/**
 * 根拠が空白だけの軸を探す。
 *
 * zod の `.min(1)` は空文字は弾くが `"   "` は通す。以前はここを黙って落としていたので、
 * 「readings を渡したのに、その軸だけ何事もなかったように推定に戻る」ことが起きた。
 * 渡したものが消えたと分かる形で返す(黙って捨てない)。
 */
function blankEvidenceAxes(input: ReadingsInput): ReadingAxis[] {
  if (!input) return [];
  return (Object.keys(READING_CHOICES) as ReadingAxis[]).filter((axis) => {
    const given = input[axis];
    return Boolean(given) && given!.evidence.trim().length === 0;
  });
}

/** 引数を、根拠つきの条件に変える(知らない ID は黙って落とす — 例外にはしない) */
function collectReadings(input: ReadingsInput): GivenReading[] {
  if (!input) return [];
  const out: GivenReading[] = [];
  for (const axis of Object.keys(READING_CHOICES) as ReadingAxis[]) {
    const given = input[axis];
    if (!given) continue;
    const condition = CONDITION_BY_ID.get(given.condition);
    if (!condition || condition.axis !== axis) continue;
    const evidence = given.evidence.trim();
    if (evidence.length === 0) continue;
    out.push({ axis, condition, evidence });
  }
  return out;
}

/**
 * 呼び出し側の読み取りで 1 軸を上書きした記録。
 *
 * 上書きは「サーバーが本文から読んだ結論を捨てる」こと。捨てたものを出さずに
 * 結果だけ見せると、本文に「予算は潤沢」と書いてあるのに助言が「予算ゼロ前提」に
 * 変わった理由が読み手に分からない。捨てた中身を必ず持ち回る。
 */
interface ReadingOverride {
  axis: SituationAxis;
  given: GivenReading;
  /** 同じ軸でサーバーが本文から読んでいた条件(この呼び出しでは使わなかったもの) */
  dropped: DetectedCondition[];
  /** 同じ軸でサーバーが本文から読んだ数値。捨てていない(本文に書いてある事実) */
  facts: SituationFact[];
}

/** 捨てた条件が、呼び出し側の読み取りと別の結論だったか */
function overrideDisagrees(o: ReadingOverride): boolean {
  return o.dropped.some((d) => d.condition.id !== o.given.condition.id);
}

/**
 * 呼び出し側の読み取りを、サーバーが読んだ結果に重ねる。
 *
 * 同じ軸はサーバー側を捨てて呼び出し側を採る(会話全体を見ているほうが正しい)。
 * 渡されなかった軸はサーバーの読み取りをそのまま残す(=従来どおりの動作)。
 * 組み合わせ判定と「読み取れなかった軸」は、重ねたあとの条件で作り直す。
 *
 * 捨てた条件は `overrides` に入れて返す。呼び出し側の読み取りが本文と食い違って
 * いても、片方を黙って消さずに両方見せられるようにするため。
 */
function applyReadings(
  reading: SituationReading,
  given: GivenReading[],
): { reading: SituationReading; overrides: ReadingOverride[] } {
  if (given.length === 0) return { reading, overrides: [] };
  const overridden = new Set<SituationAxis>(given.map((g) => g.axis));
  const kept = reading.conditions.filter((d) => !overridden.has(d.condition.axis));
  const overrides: ReadingOverride[] = given.map((g) => ({
    axis: g.axis,
    given: g,
    dropped: reading.conditions.filter((d) => d.condition.axis === g.axis),
    // 数値は「本文にそう書いてある」という事実なので、上書きしても表から消さない。
    facts: reading.facts.filter((f) => f.axis === g.axis),
  }));
  const fromCaller: DetectedCondition[] = given.map((g) => ({
    condition: g.condition,
    cues: [g.evidence],
  }));
  const order = SITUATION_CONDITIONS.map((c) => c.id);
  const all = [...fromCaller, ...kept].sort(
    (a, b) => order.indexOf(a.condition.id) - order.indexOf(b.condition.id),
  );
  const covered = new Set<SituationAxis>(all.map((d) => d.condition.axis));
  for (const f of reading.facts) if (f.axis) covered.add(f.axis);
  const unknownAxes = (Object.keys(SITUATION_AXIS_LABELS) as SituationAxis[]).filter(
    (a) => !covered.has(a),
  );
  return {
    reading: {
      ...reading,
      conditions: all,
      combos: matchConditionCombos(all),
      unknownAxes,
    },
    overrides,
  };
}

/**
 * 上書きした軸を表にする。
 *
 * 「あなたの読み取り」と「サーバーが本文から読んだもの」を同じ行に並べる。
 * 片方だけを見せると、どちらが間違っているのかを利用者が判定できない。
 */
function renderOverrides(overrides: ReadingOverride[], l: Lang): string[] {
  if (overrides.length === 0) return [];
  const out: string[] = [];
  const conflicts = overrides.filter(overrideDisagrees);
  const withFacts = overrides.filter((o) => o.facts.length > 0);
  out.push(
    msg(
      '### `readings` で受け取った軸を、本文の読みと突き合わせた結果',
      '### Each `readings` Axis, Checked Against What the Text Says',
      l,
    ),
  );
  out.push('');
  out.push(
    msg(
      '| 観点 | あなたの読み取り | このサーバーが本文から読んだもの | 本文の表現 | 扱い |',
      '| Aspect | Your reading | What this server read from the text | Wording in the text | What was done |',
      l === 'both' ? 'ja' : l,
    ),
  );
  out.push('| --- | --- | --- | --- | --- |');
  for (const o of overrides) {
    const axisName = cell(text(SITUATION_AXIS_LABELS[o.axis], l === 'both' ? 'ja' : l));
    // 読み取りの中身は上の表と同じく両言語で出す(both で日本語だけになると英語話者が読めない)
    const mine = cell(text(o.given.condition.label, l));
    const serverRead: string[] = [];
    const serverCues: string[] = [];
    for (const d of o.dropped) {
      serverRead.push(text(d.condition.label, l));
      serverCues.push(d.cues.slice(0, 3).join(', '));
    }
    for (const f of o.facts) {
      serverRead.push(text(f.label, l));
      serverCues.push(f.evidence);
    }
    const none = msg('(本文からは読み取れず)', '(nothing read from the text)', l === 'both' ? 'ja' : l);
    const disagrees = overrideDisagrees(o);
    const treatment = disagrees
      ? msg(
          '**食い違い。** あなたの読み取りを採用し、本文側の読みは助言に使っていない',
          '**Disagreement.** Your reading was used; the text-side read was not used in the guidance',
          l === 'both' ? 'ja' : l,
        )
      : o.dropped.length > 0
        ? msg(
            '同じ結論。根拠だけあなたのものに差し替えた',
            'Same conclusion — only the evidence was replaced with yours',
            l === 'both' ? 'ja' : l,
          )
        : o.facts.length > 0
          ? msg(
              '本文の数値はそのまま残している(下の助言で区別して出す)',
              'The number in the text is kept as-is (the guidance below keeps it separate)',
              l === 'both' ? 'ja' : l,
            )
          : msg(
              '本文からは読めなかった軸を、あなたの読み取りで埋めた',
              'Filled an axis the text did not state',
              l === 'both' ? 'ja' : l,
            );
    // 条件と数値が同じ表現を根拠にしていることがある(「2026-09-18」など)。重複は畳む
    const cues = uniq(serverCues.map((c) => cell(c)).filter((c) => c.length > 0));
    out.push(
      `| ${axisName} | ${mine} | ${serverRead.length > 0 ? cell(uniq(serverRead).join(' ; ')) : cell(none)} | ${cues.length > 0 ? cues.join(' ; ') : '—'} | ${cell(treatment)} |`,
    );
  }
  out.push('');
  if (conflicts.length > 0) {
    const names = (target: 'ja' | 'en'): string =>
      conflicts.map((o) => SITUATION_AXIS_LABELS[o.axis][target]).join(' / ');
    out.push(
      msg(
        `**${cell(names('ja'))} は、あなたの読み取りと本文が食い違っています。** どちらかが古いか、どちらかが誤読です。以下の助言はあなたの読み取りのほうを採っています。本文のほうが正しいなら、その軸を \`readings\` から外してもう一度呼んでください(本文側の読みで出し直します)。situation の文面自体が古いなら、そちらを直してください。`,
        `**Your reading and the text disagree on: ${cell(names('en'))}.** One of them is out of date, or one of them is a misread. The guidance below follows your reading. If the text is the correct one, drop that axis from \`readings\` and call again — you will get the text-side read instead. If the \`situation\` text itself is stale, fix that instead.`,
        l,
      ),
    );
    out.push('');
  }
  if (withFacts.length > 0) {
    out.push(
      msg(
        '*本文に書かれた数値(金額・日付・人数)は、上書きしても消していません。数値は「そう書いてある」という事実で、条件の読み取りとは別物だからです。上書きした軸の数値から出た助言は、下の推奨アクションで別枠にしています。*',
        '*Numbers stated in the text (amounts, dates, headcounts) are never removed by an override: a number is a fact about what the text says, which is a different thing from a reading of the situation. Advice derived from a number on an overridden axis is kept in a separate block under Recommended Actions.*',
        l,
      ),
    );
    out.push('');
  }
  return out;
}

/**
 * 上書きした軸の数値から出た助言を、別枠で出す。
 *
 * 本文の「2026-09-18(残り 35 日)」と、呼び出し側の「期限は決まっていない」を
 * 同じ見出しの下に並べると、逆算の話と「まず自分で期限を置け」の話が同時に出て、
 * どちらの前提で動けばよいのか読み手が決められなくなる。
 */
function renderConflictNumbers(
  advice: Bilingual[],
  overrides: ReadingOverride[],
  l: Lang,
): string[] {
  if (advice.length === 0) return [];
  const axes = overrides.filter((o) => o.facts.length > 0);
  const jaNames = axes.map((o) => SITUATION_AXIS_LABELS[o.axis].ja).join(' / ');
  const enNames = axes.map((o) => SITUATION_AXIS_LABELS[o.axis].en).join(' / ');
  const out: string[] = [];
  out.push(
    msg(
      `**本文の数値から言えること(ただし ${cell(jaNames)} はあなたの読み取りで上書き済み)**`,
      `**What the numbers in the text imply — but ${cell(enNames)} was overridden by your reading**`,
      l,
    ),
  );
  out.push('');
  out.push(bullets(advice, l));
  out.push('');
  out.push(
    msg(
      '*この数値は本文に書かれているので消していませんが、同じ軸の読み取りをあなたが上書きしているため、上の推奨と前提が食い違います。数値のほうが古いなら situation から外し、読み取りのほうが古いなら `readings` から外して、もう一度呼んでください。*',
      '*These numbers are in the text, so they are not removed — but you overrode the reading on the same axis, so they rest on a different premise than the recommendations above. If the number is stale, drop it from `situation`; if your reading is stale, drop that axis from `readings`. Then call again.*',
      l,
    ),
  );
  out.push('');
  return out;
}

export function registerConsultTool(server: McpServer): void {
  server.registerTool(
    'consult',
    {
      title: 'Consult on a situation',
      description:
        'アーキテクチャ上の状況を自由記述で渡すと、TOGAF ADM の観点で「見立て・着目すべきフェーズ・推奨技法・作るべき成果物・推奨アクション・ステークホルダーへの確認質問」を返す。予算・期限・経営の関与・体制などの条件を本文から読み取り、助言の中身を条件に合わせて変える。「やらないことに決まった」話題は見立てから外す。 / Describe a situation in free text and get a TOGAF-based read: diagnosis, relevant ADM phases, techniques, deliverables, actions, and questions to ask. Constraints stated in the text — budget, deadline, executive engagement, staffing — change what is recommended, and topics you say are off the table are excluded.',
      inputSchema: {
        situation: freeTextSchema(
          '状況の自由記述(日本語/英語どちらでも可)。予算・期限・体制・経営の関与など、制約も一緒に書くほど助言が具体的になる / Free-text description of the situation. The more constraints you state — budget, deadline, staffing, executive engagement — the more specific the guidance.',
        ).min(3),
        currentPhase: freeTextSchema(
          '現在の ADM フェーズ ID(任意) / Current ADM phase id, if any',
          IDENTIFIER_LIMIT,
        ).optional(),
        industry: freeTextSchema(
          '業界(任意)。対応業界なら見立てと質問に反映する / Industry, if relevant. Supported industries change the read and the questions.',
          IDENTIFIER_LIMIT,
        ).optional(),
        readings: readingsSchema.describe(
          'あなた(呼び出し側)が既に読み取れている状況(任意)。このサーバーの読み取りは situation の文字列に対する正規表現でしかなく、会話の前のほうで言われたこと・添付文書に書いてあることは見えません。**会話から読み取れているなら、ここに渡すほうが正確です。** 渡した軸はそのまま採用し、渡さなかった軸だけをサーバーが本文から推定します(控え)。各軸には condition と evidence の 2 つを付けてください。evidence は「そう読み取った根拠」で、会話中の発言・文書の該当箇所・ページ番号など、利用者が誤読を正せる形で書きます(空欄・空白だけの evidence は受け付けません)。出力にはどちらが読んだのかを明記し、あなたの読み取りが situation の文面と食い違う場合は両方を並べて示します(片方を黙って捨てません)。 /What you have already read from the conversation (optional). This server only regex-matches the `situation` string, so anything said earlier in the conversation or written in an attached document is invisible to it. **If you can read it from the conversation, passing it here is more accurate.** Axes you pass are used as-is; axes you omit fall back to the server\'s own guess from the text. Give each axis both a `condition` and an `evidence`: the evidence is why you read it that way — the remark, the passage, the page number — written so the user can correct a misread (blank or whitespace-only evidence is rejected). The output states which side read what, and where your reading contradicts the `situation` text it shows both — neither side is dropped silently.',
        ),
        lang: langSchema,
      },
    },
    async ({ situation, currentPhase, industry, readings, lang }) => {
      try {
        const l = lang as Lang;
        // 助言系にも上限を効かせる。ここを通す前に走査すると、入力の長さがそのまま
        // 応答の長さになる(実測: 30 万字 → 99 万バイト)。
        const tooLong = checkFreeText(
          [
            { field: 'situation', value: situation, hint: HINTS.situation },
            { field: 'currentPhase', value: currentPhase, limit: IDENTIFIER_LIMIT, hint: HINTS.identifier },
            { field: 'industry', value: industry, limit: IDENTIFIER_LIMIT, hint: HINTS.identifier },
            ...(Object.keys(READING_CHOICES) as ReadingAxis[]).map((axis) => ({
              field: `readings.${axis}.evidence`,
              value: readings?.[axis]?.evidence,
              limit: EVIDENCE_LIMIT,
              hint: HINTS.identifier,
            })),
          ],
          l,
        );
        if (tooLong) return tooLong;
        // 空白だけの根拠は zod を通ってしまう。黙って推定に戻さず、消えたことを伝える。
        const blank = blankEvidenceAxes(readings);
        if (blank.length > 0) {
          const jaNames = blank.map((a) => SITUATION_AXIS_LABELS[a].ja).join(' / ');
          const enNames = blank.map((a) => SITUATION_AXIS_LABELS[a].en).join(' / ');
          const fields = blank.map((a) => `readings.${a}.evidence`).join(', ');
          return errorResult(
            msg(
              `${fields} が空白だけです(対象の軸: ${cell(jaNames)})。そう読み取った根拠を書いてください。根拠の無い読み取りは、利用者が誤読を正せないので受け取りません。何も実行していません。`,
              `${fields} contains only whitespace (axes: ${cell(enNames)}). State why you read it that way. A reading with no evidence cannot be corrected by the user, so it is not accepted. Nothing was run.`,
              l,
            ),
          );
        }
        const givenReadings = collectReadings(readings);

        const engagement = loadEngagement();
        const phaseHint = currentPhase ?? engagement?.currentPhaseId;
        const resolvedPhase = phaseHint ? findPhase(phaseHint) : undefined;

        // --- 1. 状況を読む(打ち消し・条件・数値・案件に登録済みの内容) ---
        const engagementInput = engagementContext(engagement);
        // 呼び出し側(会話全体を読んでいる Claude)の読み取りを上書きで重ねる。
        // readings を渡さない従来の呼び方では、この行は素通りする。
        const { reading, overrides } = applyReadings(
          readSituation(situation, engagementInput),
          givenReadings,
        );
        const givenAxes = new Set<SituationAxis>(givenReadings.map((g) => g.axis));
        const facts = reading.facts;
        const numberAdvice = factAdvice(facts);
        // 上書きした軸の数値から出た助言は別枠にする。
        // 「残り 35 日」と「期限が決まっていない」を同じ見出しの下に並べると、
        // どちらの前提で動けばよいのか読み手が決められない。
        const overriddenFacts = overrides.flatMap((o) => o.facts);
        const overriddenAdvice = new Set(factAdvice(overriddenFacts, numberAdvice.length).map((a) => a.ja));
        const plainNumberAdvice = numberAdvice.filter((a) => !overriddenAdvice.has(a.ja));
        const conflictNumberAdvice = numberAdvice.filter((a) => overriddenAdvice.has(a.ja));
        const searchText = reading.positiveText.length >= 3 ? reading.positiveText : situation;
        const matches = matchConsultRules(searchText, resolvedPhase?.id);
        const excluded: RuleMatch[] =
          reading.hasNegation && reading.negatedText.length >= 3
            ? matchConsultRules(reading.negatedText, resolvedPhase?.id).filter(
                (e) => !matches.some((m) => m.rule.id === e.rule.id),
              )
            : [];
        const advice = situationAdvice(reading);
        const industryInfo = resolveIndustry(industry, reading);

        const out: string[] = [];
        out.push(msg('# TOGAF ベースの見立て', '# TOGAF-Based Assessment', l));
        out.push('');
        // 全文エコーはしない。長い状況説明をそのまま返すと応答が入力より大きくなる。
        for (const line of echoInput(situation, l).split('\n')) out.push(`> ${cell(line)}`);

        // 文脈行は日英を分けて持つ。1 本の文字列にしてしまうと、表用の cell() が
        // 日英の区切りごと畳んでしまう(contextBlock のコメント参照)。
        const context: Bilingual[] = [];
        if (resolvedPhase) {
          context.push({
            ja: `現在フェーズ: ${resolvedPhase.code}. ${resolvedPhase.name.ja}`,
            en: `Current phase: ${resolvedPhase.code}. ${resolvedPhase.name.en}`,
          });
        }
        if (industryInfo.set) {
          const name = industryInfo.set.name;
          context.push(
            industryInfo.source === 'detected'
              ? {
                  ja: `業界(本文から推定): ${name.ja}`,
                  en: `Industry (inferred from the text): ${name.en}`,
                }
              : { ja: `業界: ${name.ja}`, en: `Industry: ${name.en}` },
          );
        } else if (industryInfo.source === 'unsupported' && industryInfo.requested) {
          context.push({
            ja: `業界: ${cell(industryInfo.requested)}(未対応)`,
            en: `Industry: ${cell(industryInfo.requested)} (not supported)`,
          });
        }
        if (givenReadings.length > 0) {
          // both のときに日英どちらも日本語の軸名になっていた。軸名は言語ごとに引く。
          const axisNames = (target: 'ja' | 'en'): string =>
            givenReadings.map((g) => SITUATION_AXIS_LABELS[g.axis][target]).join(' / ');
          context.push({
            ja: `readings で受け取った読み取り: ${axisNames('ja')}(この軸は推定していません)`,
            en: `Readings supplied by the caller: ${axisNames('en')} (not guessed here)`,
          });
        }
        if (engagement) {
          context.push(
            engagementInput
              ? {
                  ja: `案件: ${engagement.name}(説明・スコープ・登録済みの期限も一緒に読みました)`,
                  en: `Engagement: ${engagement.name} (its description, scope, and recorded due dates were read too)`,
                }
              : { ja: `案件: ${engagement.name}`, en: `Engagement: ${engagement.name}` },
          );
        }
        if (context.length > 0) {
          out.push('');
          out.push(contextBlock(context, l));
        }
        out.push('');

        // --- 2. 読み取った状況 ---
        out.push(msg('## 読み取った状況', '## What I Read From Your Description', l));
        out.push('');
        if (reading.conditions.length > 0 || facts.length > 0) {
          out.push(
            msg(
              '| 観点 | 読み取り | 根拠にした表現 | 誰が読んだか |',
              '| Aspect | Read | Wording it came from | Read by |',
              l === 'both' ? 'ja' : l,
            ),
          );
          out.push('| --- | --- | --- | --- |');
          // 数値から読んだものを先に出す。金額・日付・人数は形容詞より具体的に効く
          for (const f of facts) out.push(factRow(f, l));
          for (const d of reading.conditions) {
            const axis = SITUATION_AXIS_LABELS[d.condition.axis];
            const byCaller = givenAxes.has(d.condition.axis);
            const source = d.sourceLabel
              ? ` (${cell(text(d.sourceLabel, l === 'both' ? 'ja' : l))})`
              : d.from === 'number'
                ? msg(' (上の数値から)', ' (derived from the number above)', l === 'both' ? 'ja' : l)
                : '';
            const readBy = byCaller ? READ_BY_CALLER : READ_BY_SERVER;
            out.push(
              `| ${cell(text(axis, l === 'both' ? 'ja' : l))} | ${cell(text(d.condition.label, l))} | ${cell(d.cues.slice(0, 3).join(', '))}${source} | ${cell(text(readBy, l === 'both' ? 'ja' : l))} |`,
            );
          }
          out.push('');
          const assumptions = facts.filter((f) => f.assumption);
          if (assumptions.length > 0) {
            for (const f of assumptions) {
              if (!f.assumption) continue;
              out.push(
                bulletPair(
                  `補った前提: ${f.assumption.ja}`,
                  `Assumption filled in: ${f.assumption.en}`,
                  l,
                ),
              );
            }
            out.push('');
          }
          if (givenReadings.length > 0) {
            out.push(
              msg(
                `**${READ_BY_CALLER.ja}**の行は \`readings\` で受け取った値をそのまま採用しています(その軸ではサーバー側の本文推定を使っていません)。残りの軸だけを、このサーバーが situation の文字列から推定しました。`,
                `Rows marked **${READ_BY_CALLER.en}** are taken verbatim from \`readings\`; on those axes the server's own text matching was not used at all. Only the remaining axes were guessed from the \`situation\` string.`,
                l,
              ),
            );
            out.push('');
            out.push(...renderOverrides(overrides, l));
          }
          out.push(
            msg(
              '以下の助言は、この読み取りに合わせて内容を変えています。読み取りが違っていれば、その旨を書いてもう一度呼んでください。',
              'The guidance below is shaped by this read. If any of it is wrong, say so and call the tool again.',
              l,
            ),
          );
        } else {
          // 「書かれていなかった」と断定しない。利用者が書いたことを「書いていない」と
          // 言うのが一番の害になる(読み落としはこちら側の問題)。
          out.push(
            msg(
              '予算・期限・体制・経営の関与といった条件を、この文面からはこちらで読み取れませんでした(書かれていないと決めつけているわけではありません。書かれているのに拾えていないなら、こちらの読み落としです)。そのため以下は一般的な助言にしています。金額・日付・人数のように数字で書いていただけると、そのまま助言に反映します。',
              'I could not pick up constraints such as budget, deadline, staffing, or executive engagement from this text — that is not a claim that you did not state them; if you did, the miss is on my side. The guidance below therefore stays general. Stating them as numbers — an amount, a date, a headcount — gets them straight into the advice.',
              l,
            ),
          );
        }
        if (reading.unknownAxes.length > 0) {
          const jaNames = reading.unknownAxes.map((a: SituationAxis) => SITUATION_AXIS_LABELS[a].ja).join(' / ');
          const enNames = reading.unknownAxes.map((a: SituationAxis) => SITUATION_AXIS_LABELS[a].en).join(' / ');
          out.push('');
          out.push(
            msg(
              `*こちらでは読み取れなかった観点: ${cell(jaNames)}。書かれているのにここに並んでいる場合は、こちらの読み落としです — 表現を変えて書き足すか、\`readings\` 引数に読み取り結果を直接渡していただければ、推定に頼らず確実に反映します。*`,
              `*Aspects I could not pick up: ${cell(enNames)}. If you did state any of them, that is a miss on my side — restate it in other words, or pass the reading directly in the \`readings\` argument so nothing has to be guessed.*`,
              l,
            ),
          );
        }
        if (reading.hedged.length > 0) {
          const quoted = reading.hedged.map((c) => `「${quoteClause(c.text, 40)}」`).join('');
          const quotedEn = reading.hedged.map((c) => `"${quoteClause(c.text, 40)}"`).join(', ');
          out.push('');
          out.push(
            msg(
              `*${quoted}は二重否定・留保の言い回しなので、肯定とも打ち消しとも取らず判断を保留しました。どちらの意味かを言い切ってもらえれば助言が変わります。*`,
              `*${quotedEn} reads as a double negative or a hedge, so it is treated as neither a statement nor a retraction. State it plainly either way and the guidance changes.*`,
              l,
            ),
          );
        }
        out.push('');

        // --- 3. 打ち消された話題 ---
        // 根拠は打ち消し語だけでなく、その語が出てきた節ごと引く。
        // 「ではなく」だけを見せられても、外した判断が正しいか読者が確かめられない。
        // 節を特定できないものは、根拠を示せない以上「外した」と言わずに黙って通す。
        const excludedLines = excluded
          .map((e) => {
            const clause = reading.clauses.find(
              (c) => c.negated && e.matchedKeywords.some((k) => c.text.toLowerCase().includes(k.toLowerCase())),
            );
            if (!clause) return null;
            const evidence = quoteClause(clause.text);
            if (evidence.length === 0) return null;
            return bulletPair(
              `**${e.rule.name.ja}** — 「${evidence}」と伺ったので、この見立てからは外しました。`,
              `**${e.rule.name.en}** — you said "${evidence}", so it is left out of this read.`,
              l,
            );
          })
          .filter((line): line is string => line !== null);
        if (excludedLines.length > 0) {
          out.push(msg('## 対象外として外した話題', '## Topics Excluded as Off the Table', l));
          out.push('');
          out.push(...excludedLines);
          out.push('');
          out.push(
            msg(
              '*外すのが誤りなら、その話題も対象だと書いてもう一度呼んでください。*',
              '*If that is wrong, say the topic is in scope and call again.*',
              l,
            ),
          );
          out.push('');
        }

        // --- 4. ルール未マッチ時 ---
        if (matches.length === 0) {
          out.push(
            msg(
              '## 見立て\n\n定型パターンには一致しませんでした。知識ベースの近い項目と、現在フェーズの観点を示します。',
              '## Diagnosis\n\nThis did not match a known pattern. Here are the closest knowledge-base entries and the view from your current phase.',
              l,
            ),
          );
          out.push('');
          const hits = searchKnowledge(searchText, { limit: 6 });
          if (hits.length > 0) {
            out.push(msg('### 関連しそうな項目', '### Possibly related entries', l));
            out.push('');
            for (const hit of hits) {
              out.push(
                `- [${hit.kind}] **${text(hit.title, l)}** (\`${hit.id}\`) — ${text(hit.snippet, l === 'both' ? 'ja' : l)}`,
              );
            }
            out.push('');
          }
          const base = resolvedPhase ?? findPhase('a');
          if (base) {
            out.push(msg(`### ${base.code} の観点から`, `### From the perspective of Phase ${base.code}`, l));
            out.push('');
            out.push(bullets(base.steps, l));
            out.push('');
          }
          if (plainNumberAdvice.length > 0) {
            out.push(
              msg(
                '### 読み取った数値から言えること',
                '### What the numbers you gave already imply',
                l,
              ),
            );
            out.push('');
            out.push(bullets(plainNumberAdvice, l));
            out.push('');
          }
          out.push(...renderConflictNumbers(conflictNumberAdvice, overrides, l));
          if (advice.actions.length > 0) {
            out.push(
              msg(
                '### あなたの状況の条件から言えること',
                '### What your stated constraints already imply',
                l,
              ),
            );
            out.push('');
            for (const d of reading.conditions) {
              out.push(bulletPair(d.condition.implication.ja, d.condition.implication.en, l));
            }
            out.push('');
            out.push(bullets(advice.actions, l));
            out.push('');
            if (advice.questions.length > 0) {
              out.push(msg('### まず確認したいこと', '### Worth confirming first', l));
              out.push('');
              out.push(bullets(advice.questions, l));
              out.push('');
            }
          }
          // 定型に一致しなくても、業界が分かっているなら業界の観点は出せる
          const fallbackIndustry = industrySection(industryInfo, reading, l);
          if (fallbackIndustry.lines.length > 0) {
            out.push(...fallbackIndustry.lines);
            if (fallbackIndustry.questions.length > 0 && industryInfo.set) {
              out.push(
                msg(
                  `**${text(industryInfo.set.name, 'ja')}ならではの確認**`,
                  `**Specific to ${industryInfo.set.name.en}**`,
                  l,
                ),
              );
              out.push('');
              out.push(bullets(fallbackIndustry.questions.slice(0, 2), l));
              out.push('');
            }
          }
          out.push(
            msg(
              '状況をもう少し具体的に(何が起きていて、誰が困っていて、何を決めたいのか)書くと、より具体的な提案ができます。',
              'Describe the situation more concretely — what is happening, who is stuck, and what decision you need — and the guidance gets much sharper.',
              l,
            ),
          );
          return textResult(out.join('\n'));
        }

        // --- 5. 見立て ---
        out.push(msg('## 見立て', '## Diagnosis', l));
        out.push('');
        for (const m of matches) {
          out.push(`### ${text(m.rule.name, l)}`);
          out.push('');
          out.push(text(m.rule.diagnosis, l === 'both' ? 'ja' : l));
          if (l === 'both') {
            out.push('');
            out.push(m.rule.diagnosis.en);
          }
          out.push('');
          out.push(
            `*${inline('反応したキーワード', 'Matched keywords', l)}: ${cell(m.matchedKeywords.join(', '))}*`,
          );
          out.push('');
        }

        if (reading.conditions.length > 0 || reading.combos.length > 0) {
          out.push(
            msg(
              '### あなたの状況では、この見立てはこう変わる',
              '### How your situation changes that read',
              l,
            ),
          );
          out.push('');
          for (const combo of reading.combos) {
            out.push(
              bulletPair(
                `**${combo.label.ja}** — ${combo.advice.ja}`,
                `**${combo.label.en}** — ${combo.advice.en}`,
                l,
              ),
            );
          }
          for (const d of reading.conditions) {
            out.push(
              bulletPair(
                `**${d.condition.label.ja}** — ${d.condition.implication.ja}`,
                `**${d.condition.label.en}** — ${d.condition.implication.en}`,
                l,
              ),
            );
          }
          out.push('');
        }

        // 並べ替えに使う語(状況の内容語 + 一致したキーワード)
        const matchedTerms = uniq(matches.flatMap((m) => m.matchedKeywords));

        // --- 6. フェーズ / 技法 / 成果物 ---
        const phaseIds = uniq(matches.flatMap((m) => m.rule.phaseIds));
        out.push(msg('## 着目すべき ADM フェーズ', '## ADM Phases to Focus On', l));
        out.push('');
        const orderedPhases = phaseIds
          .map((id) => findPhase(id))
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .sort((a, b) => a.order - b.order);
        for (const p of orderedPhases) {
          const line = phaseLine(p.id, l);
          if (line) out.push(`- ${line}`);
        }
        out.push('');

        const techniqueBudget = uniq(matches.flatMap((m) => m.rule.techniqueIds)).length;
        const techniqueIds = rankIds(
          uniq(matches.flatMap((m) => m.fullRule.techniqueIds)),
          (id) => findTechnique(id),
          reading,
          matchedTerms,
          Math.max(techniqueBudget, 1),
        );
        out.push(msg('## 推奨技法', '## Recommended Techniques', l));
        out.push('');
        for (const id of techniqueIds) {
          const line = techniqueLine(id, l);
          if (line) out.push(`- ${line}`);
        }
        out.push('');

        const deliverableBudget = uniq(matches.flatMap((m) => m.rule.deliverableIds)).length;
        const deliverableIds = rankIds(
          uniq(matches.flatMap((m) => m.fullRule.deliverableIds)),
          (id) => findDeliverable(id),
          reading,
          matchedTerms,
          Math.max(deliverableBudget, 1),
        );
        out.push(msg('## 作るべき成果物', '## Deliverables to Produce', l));
        out.push('');
        for (const id of deliverableIds) {
          const line = deliverableLine(id, l);
          if (line) out.push(`- ${line}`);
        }
        out.push('');
        out.push(
          msg(
            '雛形が必要なら `generate_deliverable_template` に上記の ID を渡してください。',
            'Pass any id above to `generate_deliverable_template` for a Markdown skeleton.',
            l,
          ),
        );
        out.push('');

        // --- 7. 業界の観点 ---
        const industryOut = industrySection(industryInfo, reading, l);
        out.push(...industryOut.lines);
        const industryQuestions = industryOut.questions;

        // --- 8. 推奨アクション ---
        out.push(msg('## 推奨アクション', '## Recommended Actions', l));
        out.push('');
        if (plainNumberAdvice.length > 0) {
          out.push(
            msg(
              '**書かれていた数値に対して(金額・日付・人数から直接言えること)**',
              '**Against the numbers you stated (straight from the amount, date, and headcount)**',
              l,
            ),
          );
          out.push('');
          out.push(bullets(plainNumberAdvice, l));
          out.push('');
        }
        out.push(...renderConflictNumbers(conflictNumberAdvice, overrides, l));
        if (advice.actions.length > 0) {
          out.push(
            msg(
              '**あなたの状況の条件に対して(ここが最優先)**',
              '**For the constraints you stated (do these first)**',
              l,
            ),
          );
          out.push('');
          out.push(bullets(advice.actions, l));
          out.push('');
        }
        // ルール側は位置ではなく状況との関連で選ぶ。条件由来の助言がある分だけ数を譲る。
        const reserve = advice.actions.length > 0 ? 2 : 0;
        const ruleActions: Bilingual[] = [];
        const seenActions = new Set<string>(advice.actions.map((a) => a.ja));
        for (const m of matches) {
          const limit = Math.max(2, m.rule.actions.length - reserve);
          for (const a of rankByRelevance(m.fullRule.actions, reading, m.matchedKeywords, limit)) {
            if (seenActions.has(a.ja)) continue;
            seenActions.add(a.ja);
            ruleActions.push(a);
          }
        }
        if (ruleActions.length > 0) {
          out.push(
            msg(
              '**この話題の定石として(状況に近い順)**',
              '**Standard practice for this topic (ordered by fit to your situation)**',
              l,
            ),
          );
          out.push('');
          out.push(bullets(ruleActions, l));
          out.push('');
        }

        // --- 9. 確認質問 ---
        out.push(msg('## ステークホルダーへの確認質問', '## Questions to Ask Stakeholders', l));
        out.push('');
        const seenQuestions = new Set<string>();
        if (advice.questions.length > 0) {
          out.push(msg('**状況の条件について**', '**About the constraints you stated**', l));
          out.push('');
          out.push(bullets(advice.questions, l));
          out.push('');
          for (const q of advice.questions) seenQuestions.add(q.ja);
        }
        const reserveQ = advice.questions.length > 0 ? 1 : 0;
        const ruleQuestions: Bilingual[] = [];
        for (const m of matches) {
          const limit = Math.max(2, m.rule.questions.length - reserveQ);
          for (const q of rankByRelevance(m.fullRule.questions, reading, m.matchedKeywords, limit)) {
            if (seenQuestions.has(q.ja)) continue;
            seenQuestions.add(q.ja);
            ruleQuestions.push(q);
          }
        }
        if (ruleQuestions.length > 0) {
          out.push(msg('**この話題について**', '**About the topic itself**', l));
          out.push('');
          out.push(bullets(ruleQuestions, l));
          out.push('');
        }
        const industryQ = industryQuestions.filter((q) => !seenQuestions.has(q.ja)).slice(0, 2);
        if (industryQ.length > 0 && industryInfo.set) {
          out.push(
            msg(
              `**${text(industryInfo.set.name, 'ja')}ならではの確認**`,
              `**Specific to ${industryInfo.set.name.en}**`,
              l,
            ),
          );
          out.push('');
          out.push(bullets(industryQ, l));
          out.push('');
        }

        // --- 10. 次の一手 ---
        out.push(msg('## 次の一手', '## Next Step', l));
        out.push('');
        // 上書きした軸の数値から出た助言は「今日やること 1 つ」に選ばない。
        // 前提が食い違っているものを、確認の余地なく最優先で出さない。
        const firstAction = plainNumberAdvice[0] ?? advice.actions[0] ?? ruleActions[0];
        if (firstAction) {
          out.push(
            msg(
              `今日やることを 1 つに絞るなら: ${firstAction.ja}`,
              `If you do one thing today: ${firstAction.en}`,
              l,
            ),
          );
          out.push('');
        }
        if (engagement) {
          out.push(
            msg(
              `\`update_engagement\` で上記のアクションやリスクを案件「${engagement.name}」に登録し、\`get_dashboard\` / \`open_dashboard\` で進捗を可視化できます。`,
              `Register these actions and risks against "${engagement.name}" with \`update_engagement\`, then use \`get_dashboard\` or \`open_dashboard\` to track them.`,
              l,
            ),
          );
        } else {
          out.push(
            msg(
              '`start_engagement` で案件を開始すると、上記のアクション・リスク・成果物を進捗管理できます。',
              'Start an engagement with `start_engagement` to track these actions, risks, and deliverables.',
              l,
            ),
          );
        }
        out.push('');

        return textResult(out.join('\n'));
      } catch (error) {
        // 例外の文面には入力の断片が入り得る(正規表現エラーは対象文をそのまま載せる)。
        // そのまま返すと、失敗応答が入力より大きくなる。短く切ってから返す。
        const detail = error instanceof Error ? error.message : String(error);
        return errorResult(
          `consult の実行に失敗しました / consult failed: ${quoteClause(detail, 200)}`,
        );
      }
    },
  );
}
