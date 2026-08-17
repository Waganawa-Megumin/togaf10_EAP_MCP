/**
 * 分析ツール / Analysis tools.
 *
 * ギャップ分析・リスクマトリクス・ステークホルダーマトリクス・
 * 成熟度評価・変革準備度評価を、読みやすい Markdown(表と記号による図)で返す。
 * いずれも「結果の解釈」と「次に何をすべきか」を必ず添える。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  bullets,
  findDeliverable,
  findTechnique,
  text,
  type Bilingual,
  type Lang,
} from '../knowledge/index.js';
import {
  CONFIDENCE_DEFINITIONS,
  CONFIDENCE_LEVELS,
  NO_SOURCE_LABEL,
  NO_SOURCE_MARK,
  OUTPUT_LIMITS,
  capCell,
  capNotice,
  capRows,
  checkProvenance,
  hasProvenance,
  isWrittenByHuman,
  makeId,
  normalizeProvenance,
  now,
  provenanceCell,
  sourceCell,
  summarizeProvenance,
  type Assessment,
  type AssessmentFactor,
  type AssessmentKind,
  type Engagement,
  type InfluenceLevel,
  type Provenance,
  type Risk,
  type RiskLevel,
  type RiskStatus,
  type Stakeholder,
} from '../engagement/model.js';
import { loadEngagement, saveEngagement } from '../engagement/store.js';
import {
  ASSESSMENT_KIND_LABEL,
  INFLUENCE_LABEL,
  L,
  RISK_LEVEL_LABEL,
  RISK_STATUS_LABEL,
  label,
} from '../dashboard/labels.js';
import { errorResult, langSchema, msg, textResult, type ToolResult } from './common.js';
import { checkText, checkTextList, limitErrorResult, runChecks } from './engagement.js';
import {
  checkFreeText,
  findTooManyItems,
  freeTextSchema,
  HINTS,
  IDENTIFIER_LIMIT,
  MAX_ITEMS,
  tooManyItemsResult,
} from './input-limits.js';

// ---------------------------------------------------------------------------
// 共通ヘルパ / Shared helpers
// ---------------------------------------------------------------------------

/**
 * 見出し・表のセル・箇条書きの前置きなど、1 行に収めたい箇所の日英併記。
 * `msg` は日英を改行で並べるため、表の中で使うと行が壊れる。こちらは「/」で連結する。
 */
function inline(ja: string, en: string, lang: Lang): string {
  return text({ ja, en }, lang);
}

/** Markdown 表のセル用にパイプと改行を無害化する */
function cell(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * 表・一覧に要素名を出すときの整形。
 * 利用者の入力をそのまま何度も並べると、出力が入力より大きくなる(実測: 入力 60KB → 出力 155KB)。
 * 表示は 120 文字で切り、`…(+N)` で切ったことを明示する(照合には元の名前を使う)。
 */
function elementCell(value: string): string {
  return cell(capCell(value, 120));
}

/** 0〜scale の値を █░ のバーで表す */
function bar(value: number, scale: number, width = 10): string {
  const ratio = scale <= 0 ? 0 : Math.max(0, Math.min(1, value / scale));
  const filled = Math.round(ratio * width);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
}

/** 比較用に名前を正規化する(前後空白除去・小文字化・連続空白の圧縮) */
function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 重複を除いた文字列配列(最初の表記を残す) */
function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (v.length === 0) continue;
    const key = normalizeName(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** ISO 文字列から経過日数を求める(不正な値は null) */
function daysSince(iso: string): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** 小数 1 桁に丸める */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 英文の単複を揃える(件数付きの語) */
function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** 段落として日英を並べる(both では改行区切り。text() の「/」連結は長文だと読めない) */
function para(value: Bilingual, lang: Lang): string {
  return msg(value.ja, value.en, lang);
}

/**
 * 保存の失敗を例外として投げず、本文で伝えるための包み。
 * ツールハンドラから例外を投げると、利用者には「次に何をすればよいか」が何も残らない。
 */
function trySave(engagement: Engagement): { ok: true } | { ok: false; reason: string } {
  try {
    saveEngagement(engagement);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 利用者が書いた文字列を本文中に引用するための整形。
 * 改行を畳み、長すぎる場合は切り詰める(表に入れる場合は別途 cell() を通す)。
 */
function quote(value: string, max = 80): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** 技法・成果物への参照行(知識ベースに無ければ null) */
function techniquePointer(id: string, lang: Lang): string | null {
  const t = findTechnique(id);
  if (!t) return null;
  return `\`reference of="technique" id="${t.id}"\` — ${text(t.name, lang)}`;
}

function deliverablePointer(id: string, lang: Lang): string | null {
  const d = findDeliverable(id);
  if (!d) return null;
  return `\`reference of="deliverable" id="${d.id}"\` — ${text(d.name, lang)}`;
}

/** 参照行をまとめて「参考」節にする */
function referenceSection(lines: (string | null)[], lang: Lang): string[] {
  const valid = lines.filter((x): x is string => x !== null);
  if (valid.length === 0) return [];
  const out: string[] = [];
  out.push(`## ${inline('参考', 'References', lang)}`);
  out.push('');
  for (const line of valid) out.push(`- ${line}`);
  out.push('');
  return out;
}

// ---------------------------------------------------------------------------
// 出典 / Provenance in the detail tables
//
// 実際の案件で起きたこと: 文書から読み取った数字と、こちらが推測した数字が、
// 台帳の中で同じ顔をして並んだ。表に出典の列が無いと、後から
// 「これは資料に書いてあったのか、我々が言ったのか」を確かめられない。
//
// 出典が無い行を**空欄にしない**のはそのため。空欄は「まだ入れていない」ではなく
// 「見るところが無い」に見えて、そのまま見落とされる。
// ---------------------------------------------------------------------------

// 印・ラベル・セル生成の実体は `engagement/model.ts` に 1 か所だけ置いてある。
// ダッシュボード(markdown / html)と図(diagrams.ts)も同じものを使うので、
// ここで作り直すと表ごとに未記入の見た目が変わる。再輸出だけにとどめること。
export { NO_SOURCE_MARK, NO_SOURCE_LABEL, sourceCell };

/** 複数の要素にまたがる行(現行 → 目標 など)の出典セル */
function combinedSourceCell(entities: (Provenance | null | undefined)[], lang: Lang): string {
  const parts: string[] = [];
  for (const e of entities) {
    if (!hasProvenance(e) && !e?.confidence) continue;
    const rendered = provenanceCell(e, lang);
    if (!parts.includes(rendered)) parts.push(rendered);
  }
  if (parts.length === 0) {
    return `${NO_SOURCE_MARK} ${inline(NO_SOURCE_LABEL.ja, NO_SOURCE_LABEL.en, lang)}`;
  }
  return parts.join(' / ');
}

/**
 * 出典列の凡例。記号だけを出して意味を書かないと、読む側が印を無視する。
 * 確度の 3 値は `CONFIDENCE_DEFINITIONS`(model.ts)に 1 か所だけ定義があり、ここはそれを引く。
 */
export function provenanceLegend(lang: Lang): string {
  const line = (l: 'ja' | 'en'): string =>
    [
      ...CONFIDENCE_LEVELS.map((v) => `\`${CONFIDENCE_DEFINITIONS[v].marker}\` ${text(CONFIDENCE_DEFINITIONS[v].label, l)}`),
      `\`${NO_SOURCE_MARK}\` ${l === 'ja' ? NO_SOURCE_LABEL.ja : NO_SOURCE_LABEL.en}`,
    ].join(' / ');
  return msg(
    `出典欄の凡例: ${line('ja')}。「${NO_SOURCE_MARK} ${NO_SOURCE_LABEL.ja}」は出典が 1 文字も書かれていない行で、「${CONFIDENCE_DEFINITIONS.unknown.marker} ${text(CONFIDENCE_DEFINITIONS.unknown.label, 'ja')}」(出典は書いたが辿れない)とは別物です。`,
    `Source column legend: ${line('en')}. "${NO_SOURCE_MARK} ${NO_SOURCE_LABEL.en}" means nothing at all was recorded, which is not the same as "${CONFIDENCE_DEFINITIONS.unknown.marker} ${text(CONFIDENCE_DEFINITIONS.unknown.label, 'en')}" (a source was written down but cannot be traced).`,
    lang,
  );
}

/** 出典の付き具合(この表に載っている分) */
function countProvenance(items: readonly (Provenance | null | undefined)[]): {
  total: number;
  withSource: number;
  withoutSource: number;
} {
  const total = items.length;
  const withSource = items.filter((x) => hasProvenance(x)).length;
  return { total, withSource, withoutSource: total - withSource };
}

/**
 * 「登録済み項目のうち出典が付いているのは N/M 件」の節。
 *
 * 人が目で照合していたことを機械にやらせる第一歩。件数だけでなく、
 * 出典の無い項目を**名前で**出す(件数だけだと、どれを直すのかが分からない)。
 */
function provenanceCoverageSection(
  subject: Bilingual,
  items: readonly (Provenance | null | undefined)[],
  engagement: Engagement,
  lang: Lang,
): string[] {
  const local = countProvenance(items);
  const all = summarizeProvenance(engagement);
  const out: string[] = [];
  out.push(`## ${inline('出典の記入状況', 'Source coverage', lang)}`);
  out.push('');
  const breakdown = (l: 'ja' | 'en'): string =>
    [
      ...CONFIDENCE_LEVELS.map(
        (v) => `${CONFIDENCE_DEFINITIONS[v].marker} ${text(CONFIDENCE_DEFINITIONS[v].label, l)} ${all.byConfidence[v]}`,
      ),
      `${l === 'ja' ? '確度未設定' : 'confidence not set'} ${all.byConfidence.unset}`,
    ].join(' / ');
  out.push(
    bullets(
      [
        {
          ja: `この表の${subject.ja}: **${local.withSource}/${local.total} 件**に出典が付いています(未記入 ${local.withoutSource} 件)。`,
          en: `${subject.en} in this table: **${local.withSource} of ${local.total}** carry a source (${local.withoutSource} without).`,
        },
        {
          ja: `案件全体(リスク・決定事項・アクション・関係者・成果物・移行状態・作業パッケージ・評価): **${all.withSource}/${all.total} 件**。確度の内訳: ${breakdown('ja')}。`,
          en: `Across the whole engagement (risks, decisions, actions, stakeholders, deliverables, transitions, work packages, assessments): **${all.withSource} of ${all.total}**. By confidence: ${breakdown('en')}.`,
        },
      ],
      lang,
    ),
  );
  out.push('');
  if (all.missing.length > 0) {
    const shown = capRows(all.missing);
    out.push(
      msg(
        `出典が無い項目 ${all.missing.length} 件:`,
        `${all.missing.length} entries with no source:`,
        lang,
      ),
    );
    out.push('');
    for (const m of shown.rows) {
      out.push(`- \`${m.kind}\` ${cell(capCell(m.label || m.id))}${m.id ? ` (\`${m.id}\`)` : ''}`);
    }
    if (shown.capped) {
      out.push('');
      out.push(
        `_${capNotice(
          shown,
          {
            ja: '出典の無い項目は種別順。全件は `get_engagement` の format="json" で確認できる。',
            en: 'Ordered by kind. Read them all with format="json" on `get_engagement`.',
          },
          lang,
        )}_`,
      );
    }
    out.push('');
  }
  out.push(
    msg(
      '出典の無い項目は、後から真偽を確かめられません。消す判断も残す判断もできないまま台帳に残り続けます。出典を足すか、項目そのものを消すかを決めてください。',
      'An entry with no source cannot be checked later. It stays on the ledger with nobody able to decide whether to keep it or drop it. Either attach a source or remove the entry.',
      lang,
    ),
  );
  out.push('');
  return out;
}

/** 指摘の重大度 / Severity of a finding. */
type Severity = 'high' | 'medium' | 'low';

const SEVERITY_LABEL: Record<Severity, Bilingual> = {
  high: { ja: '高', en: 'High' },
  medium: { ja: '中', en: 'Medium' },
  low: { ja: '低', en: 'Low' },
};

const SEVERITY_MARK: Record<Severity, string> = {
  high: '!!',
  medium: '!',
  low: '·',
};

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

interface Finding {
  severity: Severity;
  /** 指摘の対象(リスク名・ステークホルダー名など) */
  subject: string;
  issue: Bilingual;
  recommendation: Bilingual;
}

/** 指摘一覧を表に整形する */
function renderFindings(findings: Finding[], lang: Lang): string[] {
  const out: string[] = [];
  out.push(`## ${label(L.findings, lang)}`);
  out.push('');
  if (findings.length === 0) {
    out.push(
      msg(
        '要対応の指摘はありません。記入は一通り揃っています。',
        'No findings. The records are complete enough to work from.',
        lang,
      ),
    );
    out.push('');
    return out;
  }
  const sorted = [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  // 登録件数の多い案件では指摘が 100 件を超え、それだけで会話が埋まる。
  // 深刻度順に上位だけ出し、残りが何件あるかと、その残りの見方を必ず添える。
  const shown = capRows(sorted, OUTPUT_LIMITS.highlights);
  out.push(
    `| ${label(L.severity, lang)} | ${inline('対象', 'Subject', lang)} | ${inline('指摘', 'Issue', lang)} | ${label(L.recommendation, lang)} |`,
  );
  out.push('| :-: | --- | --- | --- |');
  for (const f of shown.rows) {
    out.push(
      // 対象名は利用者が入れた文字列で、上限まで長いことがある(表が読めなくなる)
      `| ${SEVERITY_MARK[f.severity]} ${label(SEVERITY_LABEL[f.severity], lang)} | ${cell(capCell(f.subject))} | ${cell(text(f.issue, lang))} | ${cell(text(f.recommendation, lang))} |`,
    );
  }
  if (shown.capped) {
    // 深刻度の内訳を出す。「残り 117 件」だけだと、重いものが隠れているのかが分からない。
    const rest = sorted.slice(shown.rows.length);
    const breakdown = (['high', 'medium', 'low'] as Severity[])
      .map((s) => ({ s, n: rest.filter((f) => f.severity === s).length }))
      .filter((x) => x.n > 0)
      .map((x) => `${label(SEVERITY_LABEL[x.s], lang)} ${x.n}`)
      .join(' / ');
    out.push('');
    out.push(
      `_${capNotice(
        shown,
        {
          ja: `指摘は深刻度順。非表示の内訳: ${breakdown}。上位から対処して同じ分析を再実行すると、残りが順に出る。`,
          en: `Findings are ordered by severity. Hidden: ${breakdown}. Work through these and run the same analysis again to see the rest.`,
        },
        lang,
      )}_`,
    );
  }
  out.push('');
  return out;
}

/** エンゲージメント未作成時の案内(見出しは呼び出し元の分析名にする) */
function noEngagementResult(lang: Lang, heading: Bilingual = L.dashboard): ToolResult {
  return textResult(
    [
      `# ${label(heading, lang)}`,
      '',
      label(L.noEngagement, lang),
      '',
      msg(
        'この分析は保存済みの案件データを読みます。`start_engagement` で案件を作り、`update_engagement` で内容を登録してから再実行してください。',
        'This analysis reads the stored engagement. Create one with `start_engagement`, record entries with `update_engagement`, then run this again.',
        lang,
      ),
    ].join('\n'),
  );
}

// ---------------------------------------------------------------------------
// 1. gap_analysis — 現行 × 目標のギャップ分析
// ---------------------------------------------------------------------------

/** 現行要素と目標要素の対応関係の種別 */
const MAPPING_KINDS = ['retained', 'modified', 'replaced'] as const;
type MappingKind = (typeof MAPPING_KINDS)[number];

const MAPPING_MARK: Record<MappingKind, string> = {
  retained: '=',
  modified: '~',
  replaced: '→',
};

const MAPPING_LABEL: Record<MappingKind, Bilingual> = {
  retained: { ja: '維持(そのまま流用)', en: 'Retained (carried over as-is)' },
  modified: { ja: '改修(手を入れて流用)', en: 'Modified (carried over with changes)' },
  replaced: { ja: '置換(別のもので置き換え)', en: 'Replaced (swapped for something else)' },
};

const NEW_MARK = '+';
const ELIMINATED_MARK = 'x';

/** ギャップ種別ごとの推奨アクション(独自の実務指針) */
const GAP_ACTION: Record<'new' | 'eliminated' | MappingKind, Bilingual> = {
  new: {
    ja: '作業パッケージに切り出し、必要な能力・調達方針・責任者・初回リリース範囲を決める。最初から全部作らず、価値が出る最小の単位に割る。',
    en: 'Carve it into a work package and decide the capability needed, sourcing approach, owner, and first release scope. Do not build all of it at once; slice it to the smallest piece that delivers value.',
  },
  eliminated: {
    ja: '利用者と連携先を洗い出し、停止日・データ移行・契約解約・要員再配置までを 1 つの作業パッケージにする。止め切るまでコスト削減は実現しない。',
    en: 'Identify every consumer and interface, then bundle the shutdown date, data migration, contract termination, and staff reassignment into one work package. The savings do not exist until it is actually switched off.',
  },
  retained: {
    ja: '流用の前提(性能・保守期限・ライセンス)が目標時点でも成り立つか確認する。「そのまま使える」は劣化の見落としを生みやすい。',
    en: 'Confirm the assumptions behind reuse (capacity, support end-of-life, licensing) still hold at the target date. "It just carries over" is where quiet decay hides.',
  },
  modified: {
    ja: '変更範囲と後方互換を保つ期間を決め、既存利用者への影響評価を先に行う。改修は新規より安く見えるが、影響範囲の調査で逆転することがある。',
    en: 'Define the change scope and how long backward compatibility is kept, and assess the impact on current consumers first. Modification looks cheaper than new build until the impact survey says otherwise.',
  },
  replaced: {
    ja: '新旧の並行期間・切替判定基準・旧側の停止日を、切替前に決めて合意する。停止日を決めない置換は二重運用として固定化する。',
    en: 'Agree the parallel-run period, cutover criteria, and the shutdown date of the old side before switching. A replacement without a shutdown date freezes into permanent dual operation.',
  },
};

const GAP_KIND_TITLE: Record<'new' | 'eliminated' | MappingKind, Bilingual> = {
  new: { ja: '新規に必要なもの (New)', en: 'New — to be created' },
  eliminated: { ja: '廃止されるもの (Eliminated)', en: 'Eliminated — to be retired' },
  retained: { ja: '維持されるもの (Retained)', en: 'Retained' },
  modified: { ja: '改修が必要なもの (Modified)', en: 'Modified' },
  replaced: { ja: '置き換えられるもの (Replaced)', en: 'Replaced' },
};

/** 表示に使う建築ドメイン名 */
const DOMAIN_LABEL: Record<string, Bilingual> = {
  business: { ja: 'ビジネス', en: 'Business' },
  data: { ja: 'データ', en: 'Data' },
  application: { ja: 'アプリケーション', en: 'Application' },
  technology: { ja: 'テクノロジー', en: 'Technology' },
};

interface ResolvedMapping {
  fromIndex: number;
  toIndex: number;
  kind: MappingKind;
}

/** マトリクスを表として描ける上限(超えたら一覧表示に切り替える) */
const MATRIX_MAX = 12;

/** 要素 1 件の出典(gap_analysis の sources 引数) */
interface ElementSourceInput {
  element: string;
  source?: string;
  confidence?: string;
}

interface GapAnalysisInput {
  baseline: string[];
  target: string[];
  mappings?: { from: string; to: string; kind: MappingKind }[];
  sources?: ElementSourceInput[];
  domain?: string;
  save?: boolean;
  lang: string;
}

/** ギャップから起こす作業パッケージの提案(add_work_package にそのまま渡せる形) */
interface WorkPackageProposal {
  name: string;
  description: string;
  status: 'proposed';
  owner: string;
  startQuarter: string;
  endQuarter: string;
  businessValue: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  benefit: string;
  benefitOwner: string;
}

/** 1 回の出力に載せる提案の上限(これを超えると読めなくなるため打ち切る) */
const PROPOSAL_MAX = 10;

/**
 * 準備度評価が出すリスク登録用 JSON に載せる件数の上限。
 * 以前は「N 件あります」と書いたあとに 3 件しか出さず、抜粋であることも書いていなかった。
 * 原則は全件。ここで切る場合は、切ったことと残りの入れ方を必ず本文に書く。
 */
const RISK_JSON_MAX = 10;

/** 要素 1 つの行き先(1 要素 = 1 分類。維持 / 新設 / 廃止 を混ぜないための単位) */
interface ClassifiedGapElement {
  kind: 'new' | 'eliminated' | MappingKind;
  /** 表示用の見出し。現行名、または「現行 → 目標」 */
  label: string;
}

/**
 * 現行要素と目標要素を、重複なく 1 要素 1 分類に割り当てる。
 * - 現行要素: 行き先が無ければ廃止。同名で目標に残るなら維持(他に改修/置換があっても維持が優先)。
 * - 目標要素: 現行からの対応が 1 つも無いものだけを新設として数える。
 * 対応関係(mapping)の件数ではなく要素の件数を数えるので、同じ要素が維持と廃止に二重に現れない。
 */
function classifyGapElements(
  baseline: string[],
  target: string[],
  outgoing: ResolvedMapping[][],
  incoming: ResolvedMapping[][],
  lang: Lang,
): ClassifiedGapElement[] {
  const result: ClassifiedGapElement[] = [];
  const dest = (links: ResolvedMapping[]): string => links.map((l) => target[l.toIndex]).join(', ');
  for (let i = 0; i < baseline.length; i += 1) {
    const links = outgoing[i];
    if (links.length === 0) {
      result.push({ kind: 'eliminated', label: baseline[i] });
      continue;
    }
    const retained = links.filter((l) => l.kind === 'retained');
    const modified = links.filter((l) => l.kind === 'modified');
    const replaced = links.filter((l) => l.kind === 'replaced');
    if (retained.length > 0) {
      const others = [...modified, ...replaced];
      const note = others.length > 0 ? ` (${inline('ほかに', 'also', lang)} → ${dest(others)})` : '';
      result.push({ kind: 'retained', label: `${baseline[i]}${note}` });
    } else if (modified.length > 0) {
      const note =
        replaced.length > 0 ? ` (${inline('ほかに置換', 'also replaced by', lang)} → ${dest(replaced)})` : '';
      result.push({ kind: 'modified', label: `${baseline[i]} → ${dest(modified)}${note}` });
    } else {
      result.push({ kind: 'replaced', label: `${baseline[i]} → ${dest(replaced)}` });
    }
  }
  for (let j = 0; j < target.length; j += 1) {
    if (incoming[j].length === 0) result.push({ kind: 'new', label: target[j] });
  }
  return result;
}

function runGapAnalysis(input: GapAnalysisInput): ToolResult {
  const lang = input.lang as Lang;

  // 助言層の上限。ここを通すと、要素名の長さがそのまま出力の長さになる
  // (実測: 1 要素 30 万字 → 495 万バイト)。
  const tooMany =
    findTooManyItems('baseline', input.baseline) ??
    findTooManyItems('target', input.target) ??
    findTooManyItems('mappings', input.mappings) ??
    findTooManyItems('sources', input.sources);
  if (tooMany) return tooManyItemsResult(tooMany, lang);
  const tooLong = checkFreeText(
    [
      ...(input.baseline ?? []).map((v, i) => ({
        field: `baseline[${i}]`,
        value: v,
        limit: IDENTIFIER_LIMIT,
        hint: HINTS.listItem,
      })),
      ...(input.target ?? []).map((v, i) => ({
        field: `target[${i}]`,
        value: v,
        limit: IDENTIFIER_LIMIT,
        hint: HINTS.listItem,
      })),
      ...(input.mappings ?? []).flatMap((m, i) => [
        { field: `mappings[${i}].from`, value: m.from, limit: IDENTIFIER_LIMIT, hint: HINTS.listItem },
        { field: `mappings[${i}].to`, value: m.to, limit: IDENTIFIER_LIMIT, hint: HINTS.listItem },
      ]),
      ...(input.sources ?? []).map((s, i) => ({
        field: `sources[${i}].element`,
        value: s.element,
        limit: IDENTIFIER_LIMIT,
        hint: HINTS.listItem,
      })),
      { field: 'domain', value: input.domain, limit: IDENTIFIER_LIMIT, hint: HINTS.identifier },
    ],
    lang,
  );
  if (tooLong) return tooLong;

  // 出典の値そのものの検査(長さと 3 値)。投げない入口を使う決まり
  const badProvenance = runChecks(
    (input.sources ?? []).map((s, i) => () => checkProvenance(`sources[${i}]`, s, lang)),
  );
  if (badProvenance) return errorResult(badProvenance);

  const baseline = uniqueNames(input.baseline);
  const target = uniqueNames(input.target);

  if (baseline.length === 0 && target.length === 0) {
    return errorResult(
      msg(
        'baseline と target のどちらにも有効な要素がありません。現行構成と目標構成の要素名を渡してください。',
        'Neither baseline nor target contains a usable element. Pass the element names of the current and target states.',
        lang,
      ),
    );
  }

  const baselineKeys = baseline.map(normalizeName);
  const targetKeys = target.map(normalizeName);

  // --- 対応関係の解決 ---
  const resolved: ResolvedMapping[] = [];
  const warnings: string[] = [];
  for (const m of input.mappings ?? []) {
    const fromIndex = baselineKeys.indexOf(normalizeName(m.from));
    const toIndex = targetKeys.indexOf(normalizeName(m.to));
    if (fromIndex < 0) {
      warnings.push(
        inline(
          `対応関係の from「${m.from}」は baseline に見つかりません(無視しました)。`,
          `Mapping source "${m.from}" is not in baseline; it was ignored.`,
          lang,
        ),
      );
      continue;
    }
    if (toIndex < 0) {
      warnings.push(
        inline(
          `対応関係の to「${m.to}」は target に見つかりません(無視しました)。`,
          `Mapping destination "${m.to}" is not in target; it was ignored.`,
          lang,
        ),
      );
      continue;
    }
    if (resolved.some((r) => r.fromIndex === fromIndex && r.toIndex === toIndex)) continue;
    resolved.push({ fromIndex, toIndex, kind: m.kind });
  }

  // --- 要素ごとの出典 ---
  // 要素名は利用者(=資料を読んだ側)が付けた名前なので、突き合わせは名前の正規化で行う。
  // baseline / target のどちらにも無い名前は、黙って捨てずに警告する
  // (「出典を付けたつもり」で通ってしまうのが一番まずい)。
  const sourceByElement = new Map<string, Provenance>();
  for (const s of input.sources ?? []) {
    const key = normalizeName(s.element ?? '');
    if (key.length === 0) continue;
    if (!baselineKeys.includes(key) && !targetKeys.includes(key)) {
      warnings.push(
        inline(
          `出典の element「${s.element}」は baseline にも target にも見つかりません(無視しました)。`,
          `Source entry for element "${s.element}" matches neither baseline nor target; it was ignored.`,
          lang,
        ),
      );
      continue;
    }
    // 検査は上の checkProvenance で済んでいるのでここには来ないが、
    // ツールハンドラから例外を投げない決まりなので受け止めておく
    try {
      sourceByElement.set(key, normalizeProvenance(s, `sources[${s.element}]`));
    } catch {
      warnings.push(
        inline(
          `出典の element「${s.element}」は値を読み取れませんでした(無視しました)。`,
          `The source entry for element "${s.element}" could not be read; it was ignored.`,
          lang,
        ),
      );
    }
  }
  const provenanceOf = (element: string): Provenance | undefined =>
    sourceByElement.get(normalizeName(element));

  // 現行にも目標にも同名で存在する要素は「維持」。
  // ここは以前、その現行要素に別の対応があるとき / その目標要素に別の対応が入っているときに
  // 突き合わせを飛ばしていたため、両方に存在する要素が「廃止」や「新規」として出ていた。
  // 同名の組を必ず結ぶことで、維持 / 新設 / 廃止の 3 分類が崩れないようにする。
  const autoMatched: string[] = [];
  /** 同名の維持と、別の明示対応(改修・置換)が同居している要素 */
  const ambiguous: string[] = [];
  for (let i = 0; i < baseline.length; i += 1) {
    const toIndex = targetKeys.indexOf(baselineKeys[i]);
    if (toIndex < 0) continue;
    // 同じ組が明示されている場合は利用者の指定を優先する(from X to X kind=modified など)
    if (resolved.some((r) => r.fromIndex === i && r.toIndex === toIndex)) continue;
    const hasOther = resolved.some((r) => r.fromIndex === i || r.toIndex === toIndex);
    resolved.push({ fromIndex: i, toIndex, kind: 'retained' });
    autoMatched.push(baseline[i]);
    if (hasOther) ambiguous.push(baseline[i]);
  }

  const outgoing = baseline.map((_, i) => resolved.filter((r) => r.fromIndex === i));
  const incoming = target.map((_, j) => resolved.filter((r) => r.toIndex === j));

  const eliminatedIdx = baseline.map((_, i) => i).filter((i) => outgoing[i].length === 0);
  const newIdx = target.map((_, j) => j).filter((j) => incoming[j].length === 0);
  const byKind: Record<MappingKind, ResolvedMapping[]> = {
    retained: resolved.filter((r) => r.kind === 'retained'),
    modified: resolved.filter((r) => r.kind === 'modified'),
    replaced: resolved.filter((r) => r.kind === 'replaced'),
  };

  const out: string[] = [];
  const domainLabel = input.domain
    ? DOMAIN_LABEL[normalizeName(input.domain)]
      ? text(DOMAIN_LABEL[normalizeName(input.domain)], lang)
      : input.domain
    : null;

  out.push(
    `# ${inline('ギャップ分析', 'Gap Analysis', lang)}${domainLabel ? ` (${domainLabel})` : ''}`,
  );
  out.push('');
  out.push(
    inline(
      `現行 ${baseline.length} 要素 × 目標 ${target.length} 要素 / 対応関係 ${resolved.length} 件`,
      `${plural(baseline.length, 'baseline element', 'baseline elements')} x ${plural(target.length, 'target element', 'target elements')}, ${plural(resolved.length, 'mapping', 'mappings')}`,
      lang,
    ),
  );
  out.push('');

  if (warnings.length > 0) {
    for (const w of warnings) out.push(`> ${w}`);
    out.push('');
  }
  if (autoMatched.length > 0) {
    out.push(
      `> ${inline(
        `現行にも目標にも同名で存在するため「維持」とみなした要素: ${autoMatched.join(', ')}`,
        `Present in both baseline and target under the same name, so treated as retained: ${autoMatched.join(', ')}`,
        lang,
      )}`,
    );
    out.push('');
  }
  if (ambiguous.length > 0) {
    out.push(
      `> ${inline(
        `次の要素は「目標にも同名で残る」と「別の要素へ改修・置換する」の両方が指定されています: ${ambiguous.join(', ')}。どちらが正しいのかを確認してください(名前が同じでも中身が別物なら、目標側の名前を変えると誤解が消えます)。`,
        `The following elements are both kept under the same name in the target and mapped to something else as modified or replaced: ${ambiguous.join(', ')}. Confirm which is intended — if the same name means a different thing in the target, renaming the target element removes the ambiguity.`,
        lang,
      )}`,
    );
    out.push('');
  }

  // --- マトリクス ---
  out.push(`## ${inline('現行 × 目標 マトリクス', 'Baseline x Target matrix', lang)}`);
  out.push('');
  if (baseline.length > MATRIX_MAX || target.length > MATRIX_MAX) {
    out.push(
      msg(
        `要素数が多い(上限 ${MATRIX_MAX})ため、マトリクス表は省略し、下のギャップ一覧で示します。ドメインや業務領域で分割して再実行すると、マトリクスとして読める粒度になります。`,
        `There are more elements than the matrix limit (${MATRIX_MAX}), so the grid is omitted and the gaps are listed below. Re-run per domain or business area to get a readable grid.`,
        lang,
      ),
    );
    out.push('');
  } else {
    const header = [
      `${inline('現行 \\ 目標', 'Baseline \\ Target', lang)}`,
      ...target.map((t) => elementCell(t)),
      inline('廃止 (Eliminated)', 'Eliminated', lang),
    ];
    out.push(`| ${header.join(' | ')} |`);
    out.push(`| --- |${target.map(() => ' :-: |').join('')} :-: |`);
    for (let i = 0; i < baseline.length; i += 1) {
      const row: string[] = [elementCell(baseline[i])];
      for (let j = 0; j < target.length; j += 1) {
        const m = resolved.find((r) => r.fromIndex === i && r.toIndex === j);
        row.push(m ? MAPPING_MARK[m.kind] : '');
      }
      row.push(outgoing[i].length === 0 ? ELIMINATED_MARK : '');
      out.push(`| ${row.join(' | ')} |`);
    }
    const newRow: string[] = [inline('新規 (New)', 'New', lang)];
    for (let j = 0; j < target.length; j += 1) {
      newRow.push(incoming[j].length === 0 ? NEW_MARK : '');
    }
    newRow.push('-');
    out.push(`| ${newRow.join(' | ')} |`);
    out.push('');
    out.push(
      msg(
        `凡例: \`=\` 維持 / \`~\` 改修 / \`→\` 置換 / \`${NEW_MARK}\` 新規に必要 / \`${ELIMINATED_MARK}\` 廃止`,
        `Legend: \`=\` retained, \`~\` modified, \`→\` replaced, \`${NEW_MARK}\` newly required, \`${ELIMINATED_MARK}\` eliminated`,
        lang,
      ),
    );
    out.push('');
  }

  // --- 要素ごとの行き先(1 要素 = 1 行。維持 / 新設 / 廃止 の 3 分類が本体)---
  const classified = classifyGapElements(baseline, target, outgoing, incoming, lang);
  const countOf = (kind: 'new' | 'eliminated' | MappingKind): number =>
    classified.filter((c) => c.kind === kind).length;
  const namesOf = (kind: 'new' | 'eliminated' | MappingKind): string[] =>
    classified.filter((c) => c.kind === kind).map((c) => c.label);
  const retainedCount = countOf('retained');

  out.push(`## ${inline('要素の行き先', 'Where each element ends up', lang)}`);
  out.push('');
  out.push(
    msg(
      '現行の要素と、現行に対応の無い目標の要素を 1 つずつ数えています(1 要素は 1 行にだけ現れます)。現行にも目標にも同じ名前で存在する要素は「維持」であり、廃止にも新規にも入りません。',
      'Every baseline element, plus every target element with no baseline counterpart, is counted exactly once here. Anything present in both states under the same name is retained — it is neither eliminated nor new.',
      lang,
    ),
  );
  out.push('');
  out.push(
    `| ${inline('区分', 'Category', lang)} | ${inline('件数', 'Count', lang)} | ${inline('要素', 'Elements', lang)} | ${inline('意味', 'Meaning', lang)} |`,
  );
  out.push('| --- | :-: | --- | --- |');
  const summaryRows: { kind: 'new' | 'eliminated' | MappingKind; meaning: Bilingual }[] = [
    {
      kind: 'retained',
      meaning: { ja: '現行にも目標にもある。そのまま持ち越す', en: 'Present in both states; carried over unchanged' },
    },
    {
      kind: 'modified',
      meaning: { ja: '現行を手直しして目標に届かせる', en: 'Existing element reworked to meet the target' },
    },
    {
      kind: 'replaced',
      meaning: { ja: '現行を別のもので置き換える(旧側は止める)', en: 'Swapped for something else; the old side is switched off' },
    },
    {
      kind: 'new',
      meaning: {
        ja: '目標にあって現行に無い。作る・買う・借りるの判断が要る',
        en: 'In the target, absent today. Needs a build/buy/rent decision',
      },
    },
    {
      kind: 'eliminated',
      meaning: { ja: '目標に居場所が無い。止める計画が要る', en: 'No place in the target. Needs a shutdown plan' },
    },
  ];
  for (const row of summaryRows) {
    const names = namesOf(row.kind);
    const shown = names.slice(0, 8).map((n) => elementCell(n)).join(', ');
    const rest = names.length > 8 ? ` (+${names.length - 8})` : '';
    out.push(
      `| ${text(GAP_KIND_TITLE[row.kind], lang)} | ${names.length} | ${shown || '—'}${rest} | ${text(row.meaning, lang)} |`,
    );
  }
  out.push('');

  const workItems = countOf('new') + countOf('modified') + countOf('replaced') + countOf('eliminated');
  out.push(
    msg(
      `合計 ${classified.length} 要素のうち、作業を伴うのは ${workItems} 件です(維持 ${retainedCount} 件を除く)。`,
      `Of ${plural(classified.length, 'element', 'elements')}, ${workItems} ${workItems === 1 ? 'requires' : 'require'} work; the ${plural(retainedCount, 'retained one', 'retained ones')} ${retainedCount === 1 ? 'does' : 'do'} not.`,
      lang,
    ),
  );
  out.push('');

  // --- ギャップ一覧と推奨アクション ---
  out.push(`## ${inline('検出したギャップと推奨アクション', 'Detected gaps and recommended actions', lang)}`);
  out.push('');

  const gapRows: { kind: 'new' | 'eliminated' | MappingKind; subject: string; elements: string[] }[] = [];
  for (const j of newIdx) gapRows.push({ kind: 'new', subject: target[j], elements: [target[j]] });
  for (const i of eliminatedIdx) gapRows.push({ kind: 'eliminated', subject: baseline[i], elements: [baseline[i]] });
  for (const m of byKind.modified)
    gapRows.push({
      kind: 'modified',
      subject: `${baseline[m.fromIndex]} → ${target[m.toIndex]}`,
      elements: [baseline[m.fromIndex], target[m.toIndex]],
    });
  for (const m of byKind.replaced)
    gapRows.push({
      kind: 'replaced',
      subject: `${baseline[m.fromIndex]} → ${target[m.toIndex]}`,
      elements: [baseline[m.fromIndex], target[m.toIndex]],
    });

  if (gapRows.length === 0) {
    out.push(
      msg(
        '作業を伴うギャップは検出されませんでした。現行と目標が同じ、あるいは目標の記述が現行をなぞっているだけの可能性があります。目標側に「やめること」と「新しく必要になること」が書かれているか点検してください。',
        'No gaps requiring work were detected. Either the two states are identical, or the target simply restates the baseline. Check that the target says what stops and what becomes newly necessary.',
        lang,
      ),
    );
    out.push('');
  } else {
    out.push(
      msg(
        '対応関係ごとに 1 行です。1 つの現行要素に複数の行き先があるときは複数行になるため、上の「要素の行き先」の件数とは一致しないことがあります。',
        'One row per mapping. A baseline element with several destinations produces several rows, so the counts here can differ from the per-element table above.',
        lang,
      ),
    );
    out.push('');
    out.push(
      `| ${inline('区分', 'Category', lang)} | ${inline('対象', 'Element', lang)} | ${label(L.recommendation, lang)} | ${inline('出典', 'Source', lang)} |`,
    );
    out.push('| --- | --- | --- | --- |');
    for (const row of gapRows) {
      out.push(
        `| ${text(GAP_KIND_TITLE[row.kind], lang)} | ${elementCell(row.subject)} | ${cell(text(GAP_ACTION[row.kind], lang))} | ${combinedSourceCell(row.elements.map(provenanceOf), lang)} |`,
      );
    }
    out.push('');
    out.push(provenanceLegend(lang));
    out.push('');
    const elementCoverage = countProvenance([...baseline, ...target].map(provenanceOf));
    out.push(
      msg(
        `出典が付いている要素は **${elementCoverage.withSource}/${elementCoverage.total} 件**です(現行 ${baseline.length} + 目標 ${target.length})。${
          elementCoverage.withSource === 0
            ? '1 件も付いていません。sources 引数に element と source(必要なら confidence)を渡すと、この列に出典が入ります。この分析の結論を会議で使うなら、少なくとも廃止と新規の要素には出典が要ります(「なぜこれを止めるのか」を必ず聞かれるため)。'
            : '未記入の要素は、後から「誰がそう言ったのか」を確かめられません。sources 引数で足してください。'
        }`,
        `**${elementCoverage.withSource} of ${elementCoverage.total}** elements carry a source (${baseline.length} baseline + ${target.length} target). ${
          elementCoverage.withSource === 0
            ? 'None do. Pass element and source (and confidence if you have it) in the sources argument and this column fills in. If this analysis is going into a meeting, the eliminated and new elements need one at minimum — you will be asked why each is on the list.'
            : 'For the rest, nobody can later check who said so. Add them through the sources argument.'
        }`,
        lang,
      ),
    );
    out.push('');
  }

  if (retainedCount > 0) {
    out.push(
      `${inline('維持される要素', 'Retained elements', lang)}: ${namesOf('retained').map((n) => elementCell(n)).join(', ')}`,
    );
    out.push('');
    out.push(
      `${inline('維持される要素の注意点', 'A note on retained elements', lang)}: ${text(GAP_ACTION.retained, lang)}`,
    );
    out.push('');
  }

  // --- 作業パッケージ提案(そのまま貼れる JSON)---
  // 検出したギャップを手で登録し直させないため、add_work_package の引数の形で出す。
  const proposals: WorkPackageProposal[] = [];
  const en = lang === 'en';
  const placeholder = (): Pick<
    WorkPackageProposal,
    'status' | 'owner' | 'startQuarter' | 'endQuarter' | 'businessValue' | 'effort' | 'benefitOwner'
  > => ({
    status: 'proposed',
    owner: '',
    startQuarter: '',
    endQuarter: '',
    businessValue: 'medium',
    effort: 'medium',
    benefitOwner: '',
  });

  if (eliminatedIdx.length > 0) {
    const names = eliminatedIdx.map((i) => baseline[i]);
    const shown = names.slice(0, 3).join(en ? ', ' : '・');
    const suffix = names.length > 3 ? (en ? ` and ${names.length - 3} more` : ` ほか ${names.length - 3} 件`) : '';
    proposals.push({
      name: en ? `Retire: ${shown}${suffix}` : `廃止: ${shown}${suffix}`,
      description: en
        ? `Targets: ${names.join(', ')}. Include the consumer/interface survey, the shutdown date, data migration, contract termination, and staff reassignment in this one package.`
        : `対象: ${names.join('・')}。利用者と連携先の洗い出し、停止日の決定、データ移行、契約解約、要員の再配置までを 1 つの単位に含める。`,
      benefit: en
        ? `Operating cost and support contracts released by retiring ${names.length} elements (fill in the amount yourself)`
        : `廃止 ${names.length} 件分の運用費・保守契約の削減(金額は自分で入れる)`,
      ...placeholder(),
    });
  }
  for (const j of newIdx) {
    proposals.push({
      name: en ? `New: ${target[j]}` : `新規: ${target[j]}`,
      description: en
        ? `In the target, absent today. Decide build/buy/rent, the capability required, and the scope of the first release.`
        : '目標側にあって現行に無い。作る/買う/借りるの判断、必要な能力、初回リリースの範囲を決める。',
      benefit: '',
      ...placeholder(),
    });
  }
  for (const m of byKind.replaced) {
    proposals.push({
      name: en
        ? `Replace: ${baseline[m.fromIndex]} -> ${target[m.toIndex]}`
        : `置換: ${baseline[m.fromIndex]} → ${target[m.toIndex]}`,
      description: en
        ? `Replace ${baseline[m.fromIndex]} with ${target[m.toIndex]}. Agree the parallel-run period, the cutover criteria, and the shutdown date of the old side before switching.`
        : `${baseline[m.fromIndex]} を ${target[m.toIndex]} で置き換える。並行期間・切替判定基準・旧側の停止日を切替前に決める。`,
      benefit: '',
      ...placeholder(),
    });
  }
  for (const m of byKind.modified) {
    proposals.push({
      name: en
        ? `Modify: ${baseline[m.fromIndex]} -> ${target[m.toIndex]}`
        : `改修: ${baseline[m.fromIndex]} → ${target[m.toIndex]}`,
      description: en
        ? `Rework ${baseline[m.fromIndex]} into ${target[m.toIndex]}. Fix the change scope, how long backward compatibility is kept, and the impact on current consumers first.`
        : `${baseline[m.fromIndex]} に手を入れて ${target[m.toIndex]} にする。変更範囲・後方互換を保つ期間・既存利用者への影響評価を先に決める。`,
      benefit: '',
      ...placeholder(),
    });
  }

  if (proposals.length > 0) {
    const shownProposals = proposals.slice(0, PROPOSAL_MAX);
    out.push(
      `## ${inline('作業パッケージとして登録する(コピーして使う)', 'Register these as work packages (copy and paste)', lang)}`,
    );
    out.push('');
    out.push(
      msg(
        `検出した ${gapRows.length} 件のギャップを、${proposals.length} 個の作業パッケージ案にまとめました(廃止は 1 つに束ねています)。下の配列の要素を 1 つずつ \`add_work_package\` に渡してください。複数をまとめて登録するツールはこのサーバーにはないため、1 要素 = 1 回の呼び出しになります。`,
        `The ${gapRows.length} detected gaps are grouped into ${proposals.length} proposed work packages (retirements bundled into one). Pass each element of the array below to \`add_work_package\`, one call per element — this server has no bulk-registration tool.`,
        lang,
      ),
    );
    out.push('');
    out.push('```json');
    out.push(JSON.stringify(shownProposals, null, 2));
    out.push('```');
    out.push('');
    if (proposals.length > shownProposals.length) {
      out.push(
        msg(
          `提案は ${proposals.length} 件ありますが、読める量に収めるため ${shownProposals.length} 件だけ載せています。残りはドメインや業務領域で分割して再実行すると出ます。`,
          `There are ${proposals.length} proposals; only ${shownProposals.length} are shown to keep this readable. Re-run split by domain or business area to get the rest.`,
          lang,
        ),
      );
      out.push('');
    }
    out.push(
      msg(
        'owner・時期・便益は空欄にしてあります(この分析だけでは決められないため)。businessValue と effort は仮に medium を置いているだけなので、優先順位を議論する前に自分の判断で置き直してください。時期を空のまま登録すると `add_work_package` が「時期の書けない作業は、まだ計画ではなく願望」と警告します。',
        'Owner, timing, and benefit are left blank because this analysis cannot decide them. businessValue and effort are placeholders set to medium; replace them with your own judgement before you prioritise. Registering with empty timing makes `add_work_package` warn that work with no date is a wish, not a plan.',
        lang,
      ),
    );
    out.push('');
  }

  // --- 案件メモへの記録 ---
  out.push(`## ${inline('保存', 'Saving', lang)}`);
  out.push('');
  if (!input.save) {
    out.push(
      msg(
        'この分析は案件データを変更していません(既定は save=false)。分析した事実を案件のメモに残す場合は save=true で再実行してください。作業パッケージ自体は、上の JSON を `add_work_package` に渡すと登録されます。',
        'Nothing was written to the engagement (save defaults to false). Re-run with save=true to record this analysis as an engagement note. The work packages themselves are created by passing the JSON above to `add_work_package`.',
        lang,
      ),
    );
  } else {
    const engagement = loadEngagement();
    if (!engagement) {
      out.push(
        msg(
          '案件が未作成のため保存していません。`start_engagement` で案件を作ってから save=true で再実行してください。',
          'Not saved: no engagement exists. Create one with `start_engagement`, then re-run with save=true.',
          lang,
        ),
      );
    } else {
      const stamp = now().slice(0, 10);
      const summaryLine = en
        ? `[${stamp}] Gap analysis${domainLabel ? ` (${domainLabel})` : ''}: baseline ${baseline.length} / target ${target.length}; new ${countOf('new')}, eliminated ${countOf('eliminated')}, modified ${countOf('modified')}, replaced ${countOf('replaced')}, retained ${retainedCount}. Gaps needing work: ${gapRows.map((r) => r.subject).join('; ') || 'none'}`
        : `[${stamp}] ギャップ分析${domainLabel ? `(${domainLabel})` : ''}: 現行 ${baseline.length} / 目標 ${target.length}、新規 ${countOf('new')}・廃止 ${countOf('eliminated')}・改修 ${countOf('modified')}・置換 ${countOf('replaced')}・維持 ${retainedCount}。要作業のギャップ: ${gapRows.map((r) => r.subject).join('、') || 'なし'}`;
      engagement.notes.push(quote(summaryLine, 600));
      engagement.updatedAt = now();
      const saved = trySave(engagement);
      out.push(
        saved.ok
          ? msg(
              `**保存しました** — 案件「${engagement.name}」のメモに、この分析の要約を 1 行追記しました(作業パッケージやリスクは追加していません)。保存したくない場合は save=false で実行してください。`,
              `**Saved** — one summary line was appended to the notes of engagement "${engagement.name}". No work packages or risks were created. Run with save=false if you do not want this written.`,
              lang,
            )
          : msg(
              `保存に失敗しました(${saved.reason})。分析結果そのものは上に出ています。データ保存先(既定 \`~/.togaf-eap\`、環境変数 \`TOGAF_EAP_DATA_DIR\` で変更)の書き込み権限を確認してください。`,
              `Saving failed (${saved.reason}). The analysis itself is above. Check write access to the data directory (default \`~/.togaf-eap\`, override with \`TOGAF_EAP_DATA_DIR\`).`,
              lang,
            ),
      );
    }
  }
  out.push('');

  // --- 解釈と次の一手 ---
  out.push(`## ${inline('解釈と次の一手', 'How to read this and what to do next', lang)}`);
  out.push('');

  const reading: Bilingual[] = [];
  if (eliminatedIdx.length === 0 && baseline.length > 0) {
    reading.push({
      ja: '廃止が 0 件です。現行が一切減らない目標像は、増えた分の費用と運用だけが積み上がります。「本当に全部残すのか」「残すなら誰がその費用を持つのか」を先に問い直してください。コスト削減を根拠に投資を通すつもりなら、この状態では通りません。',
      en: 'Nothing is eliminated. A target that removes nothing only adds cost and operational load. Re-ask whether every current element truly has to stay and, if so, who pays for it. If the investment case rests on savings, it does not stand up in this shape.',
    });
  } else if (eliminatedIdx.length > 0) {
    reading.push({
      ja: `廃止 ${eliminatedIdx.length} 件が、この計画の費用削減の源泉です。停止日と停止の責任者を決めていない廃止は、ほぼ確実に残ります。廃止だけを束ねた作業パッケージを作り、進捗を単独で追ってください。`,
      en: `The ${eliminatedIdx.length} eliminated elements are where the savings come from. Retirements without a shutdown date and a named owner almost always survive. Bundle the retirements into their own work package and track it separately.`,
    });
  }
  if (newIdx.length > 0 && eliminatedIdx.length > 0 && newIdx.length >= eliminatedIdx.length * 2) {
    reading.push({
      ja: '新規が廃止の 2 倍以上あります。移行期間中は新旧が並走し、運用負荷が一時的に最大化します。並走のピークがいつで、そこに人が足りるかを移行計画で確認してください。',
      en: 'New elements outnumber retirements by more than two to one. Old and new run side by side during the transition, so operational load peaks mid-way. Check in the migration plan when that peak lands and whether staffing covers it.',
    });
  }
  const consolidations = target.filter((_, j) => incoming[j].length >= 2).length;
  const splits = baseline.filter((_, i) => outgoing[i].length >= 2).length;
  if (consolidations > 0) {
    reading.push({
      ja: `複数の現行要素が 1 つの目標要素に集約される箇所が ${consolidations} 件あります。集約は効果が大きい反面、要件の最大公約数ではなく最小公倍数になりがちです。どの要件を捨てるかを先に決めてください。`,
      en: `${plural(consolidations, 'target element consolidates', 'target elements consolidate')} several baseline elements. Consolidation pays well but tends to accumulate every requirement instead of dropping any. Decide up front which requirements will not be carried over.`,
    });
  }
  if (splits > 0) {
    reading.push({
      ja: `1 つの現行要素が複数の目標要素に分割される箇所が ${splits} 件あります。分割時はデータの持ち主と整合性の責任範囲が曖昧になりやすいので、境界をデータ単位で明記してください。`,
      en: `${plural(splits, 'baseline element splits', 'baseline elements split')} into several target elements. Splits blur who owns which data and who guarantees consistency, so state the boundary at the data level.`,
    });
  }
  if (byKind.replaced.length > 0) {
    reading.push({
      ja: '置換がある計画では、旧側の停止判断が先送りされやすい。切替判定基準(何が満たされたら旧を止めるか)を、置換ごとに 1 行で書けるまで具体化してください。',
      en: 'Where replacements exist, the decision to switch the old side off tends to slip. Make the cutover criteria concrete enough to state in one line per replacement.',
    });
  }
  reading.push({
    ja: 'ギャップは、それ単体では作業計画になりません。関連するギャップを束ねて作業パッケージにし、依存関係と順序を付けて初めて実行できます。',
    en: 'A gap list is not yet a plan. Group related gaps into work packages, then add dependencies and sequence before anything can be executed.',
  });
  out.push(bullets(reading, lang));
  out.push('');

  const nextSteps: Bilingual[] = [
    {
      ja: 'ギャップを束ねて作業パッケージにする。1 パッケージ = 1 責任者 = 1 つの成果と便益になるよう割る。',
      en: 'Group the gaps into work packages, sized so each has one owner, one outcome, and one benefit.',
    },
    {
      ja: '廃止のパッケージには、停止日・移行対象データ・契約解約・利用者への通知をすべて含める。',
      en: 'Give each retirement package a shutdown date, the data to migrate, contracts to terminate, and consumer notifications.',
    },
    {
      ja: '中間の到達点(移行アーキテクチャ)を置き、そこで止めても事業が回るかを確認する。回らないなら区切り方が誤っている。',
      en: 'Define interim milestones (transition architectures) and check the business still runs if you stop there. If it does not, the slicing is wrong.',
    },
    {
      ja: '確定した内容を `update_engagement` で案件に記録し、`get_dashboard` で全体像として共有する。',
      en: 'Record what you settle with `update_engagement` and share the whole picture with `get_dashboard`.',
    },
  ];
  out.push(`### ${inline('次の一手', 'Next steps', lang)}`);
  out.push('');
  out.push(bullets(nextSteps, lang));
  out.push('');

  out.push(
    ...referenceSection(
      [
        techniquePointer('gap-analysis', lang),
        techniquePointer('migration-planning-techniques', lang),
        deliverablePointer('architecture-roadmap', lang),
        deliverablePointer('transition-architecture', lang),
      ],
      lang,
    ),
  );

  return textResult(out.join('\n'));
}

// ---------------------------------------------------------------------------
// 2. risk_matrix — リスクのレベル × 状態マトリクス
// ---------------------------------------------------------------------------

/** マトリクスの行(深刻な順) */
const RISK_LEVEL_ORDER: RiskLevel[] = ['critical', 'high', 'medium', 'low'];
/** マトリクスの列(未対応 → 解消の順) */
const RISK_STATUS_ORDER: RiskStatus[] = ['open', 'mitigating', 'accepted', 'closed'];

const RISK_LEVEL_RANK: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3, critical: 4 };

/** 未対応リスクとみなす状態 */
function isActive(risk: Risk): boolean {
  return risk.status === 'open' || risk.status === 'mitigating';
}

/** リスク 1 件の短い表示名 */
function riskSubject(risk: Risk): string {
  return `${risk.title} (\`${risk.id}\`)`;
}

const STALE_DAYS = 30;

function runRiskMatrix(lang: Lang): ToolResult {
  const engagement = loadEngagement();
  if (!engagement) return noEngagementResult(lang, L.riskMatrix);

  const risks = engagement.risks;
  const out: string[] = [];
  out.push(`# ${label(L.riskMatrix, lang)}: ${engagement.name}`);
  out.push('');

  if (risks.length === 0) {
    out.push(
      msg(
        'リスクが 1 件も登録されていません。これは「リスクが無い」ではなく「まだ洗い出していない」状態です。リスクゼロのアーキテクチャ計画は存在しません。',
        'No risks are recorded. That does not mean there are none; it means none have been identified yet. No architecture plan has zero risk.',
        lang,
      ),
    );
    out.push('');
    out.push(`## ${inline('次の一手', 'Next steps', lang)}`);
    out.push('');
    out.push(
      bullets(
        [
          {
            ja: '最低限、次の 4 種を洗い出す: 業務が止まるリスク、移行に失敗するリスク、費用が超過するリスク、人が足りないリスク。',
            en: 'At minimum, identify four kinds: business interruption, migration failure, cost overrun, and insufficient staffing.',
          },
          {
            ja: '各リスクに、対策前レベル(level)・対策(mitigation)・対策後の残存レベル(residualLevel)・受容者(owner)を必ず付ける。',
            en: 'Give every risk an initial level, a mitigation, a residual level, and an owner.',
          },
          {
            ja: '`update_engagement` の risks で登録し、この分析をもう一度実行する。',
            en: 'Record them via the risks field of `update_engagement`, then run this analysis again.',
          },
        ],
        lang,
      ),
    );
    out.push('');
    out.push(...referenceSection([techniquePointer('risk-management', lang)], lang));
    return textResult(out.join('\n'));
  }

  // --- レベル × 状態 マトリクス ---
  out.push(`## ${inline('レベル × 状態', 'Level x status', lang)}`);
  out.push('');
  out.push(
    `| ${label(L.level, lang)} \\ ${label(L.status, lang)} | ${RISK_STATUS_ORDER.map((s) => label(RISK_STATUS_LABEL[s], lang)).join(' | ')} | ${inline('計', 'Total', lang)} |`,
  );
  out.push(`| --- |${RISK_STATUS_ORDER.map(() => ' :-: |').join('')} :-: |`);
  for (const level of RISK_LEVEL_ORDER) {
    const cells = RISK_STATUS_ORDER.map((status) => {
      const n = risks.filter((r) => r.level === level && r.status === status).length;
      return n === 0 ? '·' : String(n);
    });
    const rowTotal = risks.filter((r) => r.level === level).length;
    out.push(
      `| **${label(RISK_LEVEL_LABEL[level], lang)}** | ${cells.join(' | ')} | ${rowTotal === 0 ? '·' : rowTotal} |`,
    );
  }
  const colTotals = RISK_STATUS_ORDER.map((status) => {
    const n = risks.filter((r) => r.status === status).length;
    return n === 0 ? '·' : String(n);
  });
  out.push(`| ${inline('計', 'Total', lang)} | ${colTotals.join(' | ')} | ${risks.length} |`);
  out.push('');

  // --- 対策後の見通し(レベル → 残存レベル) ---
  const withResidual = risks.filter((r) => r.residualLevel !== undefined);
  out.push(`## ${inline('対策後の見通し(現在 → 残存)', 'After mitigation (current → residual)', lang)}`);
  out.push('');
  if (withResidual.length === 0) {
    out.push(
      msg(
        '残存リスクが 1 件も評価されていません。対策を打った後にどこまで下がるのかが不明なため、この計画は「対策すれば大丈夫」以上のことを言えていません。',
        'No residual risk has been assessed. Without knowing how far each risk drops after mitigation, the plan says no more than "we will handle it".',
        lang,
      ),
    );
    out.push('');
  } else {
    out.push(
      `| ${inline('現在', 'Current', lang)} \\ ${label(L.residual, lang)} | ${RISK_LEVEL_ORDER.map((l) => label(RISK_LEVEL_LABEL[l], lang)).join(' | ')} | ${inline('未評価', 'Not assessed', lang)} |`,
    );
    out.push(`| --- |${RISK_LEVEL_ORDER.map(() => ' :-: |').join('')} :-: |`);
    for (const level of RISK_LEVEL_ORDER) {
      const cells = RISK_LEVEL_ORDER.map((residual) => {
        const n = risks.filter((r) => r.level === level && r.residualLevel === residual).length;
        return n === 0 ? '·' : String(n);
      });
      const unknown = risks.filter((r) => r.level === level && r.residualLevel === undefined).length;
      out.push(
        `| **${label(RISK_LEVEL_LABEL[level], lang)}** | ${cells.join(' | ')} | ${unknown === 0 ? '·' : unknown} |`,
      );
    }
    out.push('');
    out.push(
      msg(
        '行が対策前、列が対策後です。対角線より右にあるものが「対策で下がるリスク」。対角線上は対策を打っても下がらないリスクなので、対策の中身か前提を疑ってください。対角線より左は対策後のほうが高いという評価であり、評価の誤りか対策自体の副作用を意味します。',
        'Rows are the level before mitigation, columns the level after. Cells to the right of the diagonal are the risks the mitigation actually reduces. Cells on the diagonal do not drop at all, so question the mitigation or its assumptions. Cells to the left claim a higher level after mitigation, which means either a rating error or a side effect of the mitigation itself.',
        lang,
      ),
    );
    out.push('');
  }

  // --- リスク一覧 ---
  // 上のマトリクスは全件の集計(切ると全体像が消える)。切るのはこの明細表だけ。
  out.push(`## ${label(L.risks, lang)}`);
  out.push('');
  const sortedRisks = [...risks].sort(
    (a, b) =>
      RISK_LEVEL_RANK[b.level] - RISK_LEVEL_RANK[a.level] ||
      Number(isActive(b)) - Number(isActive(a)) ||
      a.title.localeCompare(b.title),
  );
  const shownRisks = capRows(sortedRisks);
  out.push(
    `| ID | ${label(L.title, lang)} | ${label(L.level, lang)} | ${label(L.residual, lang)} | ${label(L.status, lang)} | ${label(L.owner, lang)} | ${label(L.mitigation, lang)} | ${inline('出典', 'Source', lang)} |`,
  );
  out.push('| --- | --- | :-: | :-: | :-: | --- | --- | --- |');
  for (const r of shownRisks.rows) {
    out.push(
      [
        '',
        `\`${r.id}\``,
        // 見出しも 300 字まで入るので、行数を絞っても 1 行が長いと表が読めない
        cell(capCell(r.title)),
        label(RISK_LEVEL_LABEL[r.level], lang),
        r.residualLevel ? label(RISK_LEVEL_LABEL[r.residualLevel], lang) : '—',
        label(RISK_STATUS_LABEL[r.status], lang),
        cell(capCell(r.owner ?? '')) || '—',
        // 1 行が長いと 20 件でも表が読めなくなるので、自由記述だけ長さを抑える
        cell(capCell(r.mitigation ?? '')) || '—',
        sourceCell(r, lang),
        '',
      ].join(' | ').trim(),
    );
  }
  if (shownRisks.capped) {
    out.push('');
    out.push(
      `_${capNotice(
        shownRisks,
        {
          ja: '並びは深刻度順。上のマトリクスは全件の集計なので、件数は全体を反映している。明細を全件見るには `get_dashboard` に compact=false(件数を変えるなら limit=<件数>)、生データなら `get_engagement` の format="json"。',
          en: 'Ordered by severity. The matrix above still counts every risk. For the full detail call `get_dashboard` with compact=false (or limit=<n>), or read the raw data with format="json" on `get_engagement`.',
        },
        lang,
      )}_`,
    );
  }
  out.push('');
  out.push(provenanceLegend(lang));
  out.push('');

  // --- 出典の記入状況 ---
  out.push(...provenanceCoverageSection({ ja: 'リスク', en: 'Risks' }, risks, engagement, lang));

  // --- 要対応の指摘 ---
  const findings: Finding[] = [];
  const severeWithoutSource = risks.filter(
    (r) => (r.level === 'critical' || r.level === 'high') && !hasProvenance(r),
  );
  if (severeWithoutSource.length > 0) {
    findings.push({
      severity: 'medium',
      subject: inline('全体', 'Overall', lang),
      issue: {
        ja: `重大リスク ${severeWithoutSource.length} 件に出典が無い`,
        en: `${severeWithoutSource.length} severe risks carry no source`,
      },
      recommendation: {
        ja: '重大と判定した根拠(どの資料の何ページ、誰の発言、どの障害)を出典として入れる。根拠を示せない重大リスクは、対策予算を要求する場で必ず「本当にそうなのか」と問われて止まる。',
        en: 'Record what made it severe — which page of which document, whose statement, which incident. A severe risk you cannot source gets stopped the moment you ask for budget against it.',
      },
    });
  }
  for (const r of risks) {
    const active = isActive(r);
    const severe = r.level === 'critical' || r.level === 'high';
    const ownerMissing = !(r.owner && r.owner.trim().length > 0);

    if (severe && active && !(r.mitigation && r.mitigation.trim().length > 0)) {
      findings.push({
        severity: 'high',
        subject: riskSubject(r),
        issue: {
          ja: '重大なリスクだが対策が空欄',
          en: 'Severe risk with no mitigation recorded',
        },
        recommendation: {
          ja: '対策を 1 つ決めて書く。決められないなら「受容」に変え、誰が受容したかを owner に書く。空欄のままにしない。',
          en: 'Decide and write one mitigation. If you cannot, change the status to accepted and name who accepted it in owner. Do not leave it blank.',
        },
      });
    }
    // 受容者不明は「担当未設定」より重い指摘なので、両方は出さず重い側だけを出す
    const acceptedWithoutOwner = r.status === 'accepted' && severe && ownerMissing;
    if (acceptedWithoutOwner) {
      findings.push({
        severity: 'high',
        subject: riskSubject(r),
        issue: {
          ja: '重大なリスクを受容しているが受容者が不明',
          en: 'A severe risk is accepted but nobody is named as accepting it',
        },
        recommendation: {
          ja: '受容は判断であり、判断には名前が要る。受容した役職者を owner に記載し、決定事項としても残す。',
          en: 'Acceptance is a decision and a decision needs a name. Put the accepting executive in owner and log it as a decision too.',
        },
      });
    }
    if (r.status !== 'closed' && r.residualLevel === undefined) {
      findings.push({
        severity: 'medium',
        subject: riskSubject(r),
        issue: { ja: '残存リスクが未評価', en: 'Residual risk not assessed' },
        recommendation: {
          ja: '対策を実施した後に残る水準(residualLevel)を見積もる。ここが下がらない対策は、やる意味を再検討する。',
          en: 'Estimate the level that remains after mitigation. If it does not drop, question whether the mitigation is worth doing.',
        },
      });
    }
    if (ownerMissing && r.status !== 'closed' && !acceptedWithoutOwner) {
      findings.push({
        severity: 'medium',
        subject: riskSubject(r),
        issue: { ja: '担当・受容者が未設定', en: 'No owner assigned' },
        recommendation: {
          ja: '個人名で担当を置く。組織名だけの担当は、実際には誰も見ていないのと同じ。',
          en: 'Assign a named individual. An owner recorded as a team name means nobody is actually watching it.',
        },
      });
    }
    // 低リスクが低のままなのは正常なので、中以上のリスクだけを対象にする
    if (
      r.residualLevel !== undefined &&
      RISK_LEVEL_RANK[r.level] >= RISK_LEVEL_RANK.medium &&
      RISK_LEVEL_RANK[r.residualLevel] >= RISK_LEVEL_RANK[r.level] &&
      active
    ) {
      findings.push({
        severity: 'medium',
        subject: riskSubject(r),
        issue: {
          ja: '対策後もレベルが下がらない見込み',
          en: 'The level is not expected to drop after mitigation',
        },
        recommendation: {
          ja: '対策の実効性か、リスクの分解の仕方を見直す。下がらないなら、回避(やり方を変える)か移転(契約・保険)を検討する。',
          en: 'Revisit the mitigation or how the risk is decomposed. If it will not drop, consider avoidance (change the approach) or transfer (contract, insurance).',
        },
      });
    }
    const age = daysSince(r.updatedAt);
    if (active && age !== null && age >= STALE_DAYS) {
      findings.push({
        severity: 'low',
        subject: riskSubject(r),
        issue: {
          ja: `未対応のまま ${age} 日更新されていない`,
          en: `Open for ${age} days with no update`,
        },
        recommendation: {
          ja: '状況が変わっていないか確認し、変わっていないなら「なぜ動いていないのか」を課題として扱う。',
          en: 'Check whether anything changed; if not, treat the lack of movement itself as the issue.',
        },
      });
    }
  }
  out.push(...renderFindings(findings, lang));

  // --- 解釈と次の一手 ---
  const activeCount = risks.filter(isActive).length;
  const severeActive = risks.filter((r) => isActive(r) && (r.level === 'critical' || r.level === 'high')).length;
  const acceptedSevere = risks.filter(
    (r) => r.status === 'accepted' && (r.level === 'critical' || r.level === 'high'),
  ).length;

  out.push(`## ${inline('解釈と次の一手', 'How to read this and what to do next', lang)}`);
  out.push('');
  const reading: Bilingual[] = [];
  reading.push({
    ja: `未対応(未対応 + 対応中)は ${activeCount} 件、うち重大(高・致命的)は ${severeActive} 件です。`,
    en: `${activeCount} risks are live (open or mitigating), ${severeActive} of them severe (high or critical).`,
  });
  if (severeActive > 0) {
    reading.push({
      ja: '重大リスクが未処理のまま次フェーズへ進むと、後工程で必ず設計のやり直しに化けます。フェーズの完了判定に「重大リスクが対応中以上であること」を入れてください。',
      en: 'Carrying severe risks into the next phase reliably turns into rework later. Make "no severe risk left untouched" part of the phase exit criteria.',
    });
  } else {
    reading.push({
      ja: '重大リスクは残っていません。ただし低・中のリスクが同時に顕在化すると重大になる組み合わせがないかを点検してください。',
      en: 'No severe risks remain. Still, check whether any combination of low and medium risks becomes severe if they occur together.',
    });
  }
  if (acceptedSevere > 0) {
    reading.push({
      ja: `重大リスクを ${acceptedSevere} 件受容しています。受容は正当な選択ですが、受容した事実・理由・受容者を決定事項として残さないと、後から「聞いていない」になります。`,
      en: `${acceptedSevere} severe risks are accepted. Acceptance is legitimate, but unless the fact, the reason, and the accepting person are logged as a decision, it later becomes "nobody told me".`,
    });
  }
  if (withResidual.length > 0 && withResidual.length < risks.length) {
    reading.push({
      ja: `残存レベルを評価済みなのは ${withResidual.length}/${risks.length} 件です。未評価の分は、対策の費用対効果を議論できません。`,
      en: `Residual levels exist for ${withResidual.length} of ${risks.length} risks. For the rest, you cannot discuss whether the mitigation is worth its cost.`,
    });
  }
  out.push(bullets(reading, lang));
  out.push('');
  out.push(`### ${inline('次の一手', 'Next steps', lang)}`);
  out.push('');
  out.push(
    bullets(
      [
        {
          ja: '上の指摘を、担当と期限のあるアクションに変換する(`update_engagement` の actions)。',
          en: 'Convert the findings above into actions with an owner and a due date (`update_engagement` actions).',
        },
        {
          ja: '重大リスクは、対応中に格上げして週次で状況を追う。動かないリスクは対策が机上のままの証拠。',
          en: 'Move severe risks to mitigating and review them weekly. A risk that never moves is proof the mitigation exists only on paper.',
        },
        {
          ja: '受容したリスクは決定事項として記録し、受容者・受容日・見直し時期を書く。',
          en: 'Log accepted risks as decisions with who accepted, when, and when it will be revisited.',
        },
      ],
      lang,
    ),
  );
  out.push('');
  out.push(...referenceSection([techniquePointer('risk-management', lang)], lang));

  return textResult(out.join('\n'));
}

// ---------------------------------------------------------------------------
// 3. stakeholder_matrix — 影響力 × 関心度
// ---------------------------------------------------------------------------

type Quadrant = 'manageClosely' | 'keepSatisfied' | 'keepInformed' | 'monitor';

const QUADRANT_LABEL: Record<Quadrant, Bilingual> = {
  manageClosely: L.manageClosely,
  keepSatisfied: L.keepSatisfied,
  keepInformed: L.keepInformed,
  monitor: L.monitor,
};

const QUADRANT_CONDITION: Record<Quadrant, Bilingual> = {
  manageClosely: { ja: '影響力 高 × 関心度 高', en: 'High influence x high interest' },
  keepSatisfied: { ja: '影響力 高 × 関心度 低', en: 'High influence x low interest' },
  keepInformed: { ja: '影響力 低 × 関心度 高', en: 'Low influence x high interest' },
  monitor: { ja: '影響力 低 × 関心度 低', en: 'Low influence x low interest' },
};

/** 象限ごとの関与方針(独自の実務指針) */
const QUADRANT_APPROACH: Record<Quadrant, Bilingual> = {
  manageClosely: {
    ja: '意思決定の場に必ず入れる。成果物のレビュー者に指名し、異論は早い段階で出してもらう。この層の合意が取れない案は、後半で必ず止まる。',
    en: 'Put them in the decision forum. Name them as reviewers of the deliverables and get their objections early. Anything this group has not agreed to stalls later.',
  },
  keepSatisfied: {
    ja: '要点だけを短く定期的に。関心が低いうちに前提を握っておく。関心を持った時に初めて反対されるのが最悪の形なので、先に懸念を聞き出して潰しておく。',
    en: 'Short, regular, headline-level updates. Lock in the premises while their attention is low. The worst case is a first objection raised the moment they do start paying attention, so surface their concerns in advance.',
  },
  keepInformed: {
    ja: '詳細情報の提供先であり、現場知識の供給源。検討の入力をもらい、決まったことは理由付きで返す。ここを情報から切ると、実装段階で抵抗になる。',
    en: 'Give them detail and take their operational knowledge as input; return decisions with the reasoning. Cutting them out of the loop turns into resistance during implementation.',
  },
  monitor: {
    ja: '過剰な工数をかけない。ただし象限は固定ではないので、スコープや体制が変わる節目で位置付けを見直す。',
    en: 'Do not over-invest. Positions are not fixed, though, so re-check them whenever scope or organization changes.',
  },
};

const INFLUENCE_RANK: Record<InfluenceLevel, number> = { low: 0, medium: 1, high: 2 };

/** medium 以上を「高側」として扱う(取りこぼしのほうが痛いため) */
function isHighSide(level: InfluenceLevel): boolean {
  return INFLUENCE_RANK[level] >= 1;
}

// --- 象限判定の公開 API(図ツールと表ツールで同じ判定を使うため)---

export type StakeholderQuadrant = Quadrant;

/** 象限判定に必要な最小限の入力。登録済み Stakeholder でも図ツールの引数でもそのまま渡せる */
export interface StakeholderQuadrantInput {
  name?: string;
  influence: InfluenceLevel;
  interest: InfluenceLevel;
  /** 利用者が自分で書いた関与方針。あればこちらを優先する */
  approach?: string;
}

export interface StakeholderQuadrantResult {
  quadrant: StakeholderQuadrant;
  /** 影響力を高側と判定したか(medium 以上) */
  influenceHighSide: boolean;
  /** 関心度を高側と判定したか(medium 以上) */
  interestHighSide: boolean;
  /** medium を含み、判定が入れ替わり得る位置にいるか */
  borderline: boolean;
  /** 表示名。境界線上なら末尾に `*` が付く */
  displayName: string;
  label: Bilingual;
  condition: Bilingual;
  /** 関与方針。利用者が approach を書いていればその文言をそのまま返す */
  approach: Bilingual;
  approachSource: 'user' | 'default';
}

/** 境界線上であることを示す記号 */
export const STAKEHOLDER_BORDERLINE_MARK = '*';

export const STAKEHOLDER_QUADRANT_ORDER: StakeholderQuadrant[] = [
  'manageClosely',
  'keepSatisfied',
  'keepInformed',
  'monitor',
];

export const STAKEHOLDER_QUADRANT_LABEL: Record<StakeholderQuadrant, Bilingual> = QUADRANT_LABEL;
export const STAKEHOLDER_QUADRANT_CONDITION: Record<StakeholderQuadrant, Bilingual> = QUADRANT_CONDITION;
export const STAKEHOLDER_QUADRANT_APPROACH: Record<StakeholderQuadrant, Bilingual> = QUADRANT_APPROACH;

/** 判定ルールの開示文。表でも図でも同じ文言を出すため、ここに 1 つだけ置く */
export const STAKEHOLDER_QUADRANT_RULE: Bilingual = {
  ja: `判定は「中(medium)以上を高側」として行っています(取りこぼしより過剰配慮のほうが安いため)。\`${STAKEHOLDER_BORDERLINE_MARK}\` 付きは中を含む境界線上の人で、実際の影響力を本人・周囲に確認する価値があります。`,
  en: `Anything at medium or above counts as the high side, because over-engaging costs less than missing someone. Names marked \`${STAKEHOLDER_BORDERLINE_MARK}\` sit on the boundary; it is worth confirming their real influence.`,
};

/**
 * 影響力 × 関心度から象限を決める。
 * この 1 関数を表(stakeholder_matrix)と図(diagram_stakeholder_matrix)の両方で使い、
 * 同じ人が表と図で別の象限に現れることを防ぐ。
 */
export function classifyStakeholderQuadrant(input: StakeholderQuadrantInput): StakeholderQuadrantResult {
  const influenceHighSide = isHighSide(input.influence);
  const interestHighSide = isHighSide(input.interest);
  const quadrant: StakeholderQuadrant = influenceHighSide
    ? interestHighSide
      ? 'manageClosely'
      : 'keepSatisfied'
    : interestHighSide
      ? 'keepInformed'
      : 'monitor';
  const borderline = input.influence === 'medium' || input.interest === 'medium';
  const name = input.name ?? '';
  const userApproach = input.approach && input.approach.trim().length > 0 ? input.approach.trim() : null;
  return {
    quadrant,
    influenceHighSide,
    interestHighSide,
    borderline,
    displayName: `${name}${borderline ? STAKEHOLDER_BORDERLINE_MARK : ''}`,
    label: QUADRANT_LABEL[quadrant],
    condition: QUADRANT_CONDITION[quadrant],
    // 利用者が書いた方針は、こちらの既定方針より必ず優先する
    approach: userApproach ? { ja: userApproach, en: userApproach } : QUADRANT_APPROACH[quadrant],
    approachSource: userApproach ? 'user' : 'default',
  };
}

function quadrantOf(s: Stakeholder): Quadrant {
  return classifyStakeholderQuadrant(s).quadrant;
}

function stakeholderTag(s: Stakeholder): string {
  return classifyStakeholderQuadrant(s).displayName;
}

// --- 関係者間の対立検出 / Detecting conflicts between stakeholders ---
//
// 手作業でいちばん面倒なのが「誰と誰の言い分が両立しないか」の突き合わせなので、
// 登録された関心事(concerns)の文言だけを機械的に照合して候補を出す。
// 出すのは候補であり、当てずっぽうで対立を作らないために次を守る:
//   - 根拠(どの関心事のどの語で判定したか)を必ず併記する
//   - 話題が重ならない組は「要確認」として弱く出す
//   - 0 件のときは「検出できなかった」と言い、手で見る観点を示す

/** 対立軸の一方の立場 */
interface ConflictPole {
  label: Bilingual;
  /** 判定語。ASCII は単語境界一致、日本語は部分一致 */
  keywords: string[];
}

/** 実務で繰り返し現れる対立軸(独自の整理) */
interface ConflictAxis {
  id: string;
  name: Bilingual;
  poles: [ConflictPole, ConflictPole];
  /** 何を巡って食い違うのか */
  issue: Bilingual;
  /** 放置すると何が起きるか */
  ifIgnored: Bilingual;
  /** いつ誰が裁くか */
  arbitration: Bilingual;
}

const CONFLICT_AXES: ConflictAxis[] = [
  {
    id: 'speed-vs-certainty',
    name: { ja: '速さ vs 確実さ', en: 'Speed vs certainty' },
    poles: [
      {
        label: { ja: '早く出したい(速さ優先)', en: 'Wants an answer fast' },
        keywords: [
          // 軸名そのものの語も入れる(「速さを取る」と書く人が居る)
          '速さ', '速度', 'スピード',
          '早く', '早期', '迅速', '即答', '即日', '当日', 'その場で', '今すぐ', 'すぐに回答',
          '遅い', '遅く', '遅れ', '時間がかかる', '待たされ', '待たせ', '待てない', '待ち時間',
          'リードタイム', '短縮', '失注', '取り逃', '機会損失', 'タイムリー', '間に合わ~ない',
          // 議事メモで実際に出る言い回し(辞書語に書き直させないための追加)
          'その日のうち', '当日中', '翌日には', '返事が遅', '回答が遅', '回答に~かかる',
          '日~かかる', '週間~かかる', '時間~かかりすぎ', 'かかりすぎ', '先延ばし',
          '商談が流れ', '他社に取ら', '他社に流れ', '他社に持って', '競合に取ら', '競合に流れ',
          '競合に持って', '後手に回',
          'fast', 'faster', 'speed', 'quick', 'immediately', 'same-day', 'turnaround', 'urgency',
          'delay', 'slow', 'lead time', 'lose the deal', 'lost deals', 'responsive', 'waiting',
          'right away', 'on the spot', 'time to market',
          'takes too long', 'too long to', 'same day', 'within the day', 'competitor wins',
          'lose to a competitor', 'go elsewhere',
        ],
      },
      {
        label: { ja: '確定してから出したい(確実さ優先)', en: 'Wants it confirmed before it goes out' },
        keywords: [
          '確実', '確実さ', '確度',
          '正確', '精度', '確定してから', '確定した', '裏付け', '根拠を', '検証してから', '承認を経て',
          '手戻り', 'ミス', '誤り', '間違い', '実現可能性', '守れない', '無理な約束', '確約',
          // 「営業が勝手に納期を約束する」のように間に語が入る言い方に当てる
          '勝手に~約束', '勝手に~決め', '勝手に~回答', '独断で', '安請け合い', '責任が持て~ない',
          // 「確認せずに出す」は否定形だが、書いた本人は確実さを求めている。
          // 否定の抑止に引っかからないよう、否定を含んだ形をそのまま判定語にする。
          '確認せず', '確認もせず', '確認しないまま', '確認を取らず', '確認を取らないまま',
          '裏取り', '裏取りをせず', '裏を取らず', '検証せず', '精査せず', '精査',
          '未確認', '見込みで', '曖昧なまま', 'ダブルチェック', '出図~やめ', '手順を省',
          'accuracy', 'accurate', 'precise', 'confirm', 'certainty', 'verified', 'validated',
          'double-check', 'rework', 'error', 'mistake', 'feasibility', 'realistic', 'over-promise',
          'overpromise', 'sign-off', 'signed off',
          'without checking', 'unchecked', 'unverified', 'cross-check', 'due diligence',
        ],
      },
    ],
    issue: {
      ja: '確定していない情報をどこまで顧客・社外に出してよいか(速さと確実さのどちらを優先するか)',
      en: 'How much unconfirmed information may go out to the customer — whether speed or certainty wins',
    },
    ifIgnored: {
      ja: '現場が個別に折衝して回避策(裏の運用)を作る。仕組みの外で約束が動くため、どちらの側の数字も信用できなくなり、後で納期遅延・値引き・手戻りとして表面化する。',
      en: 'Both sides invent private workarounds. Commitments start moving outside the system, neither side\'s numbers can be trusted, and it resurfaces later as missed dates, discounts, and rework.',
    },
    arbitration: {
      ja: '受注から出荷までを通しで見る業務オーナー(事業責任者)が裁く。「どの条件なら暫定回答でよいか」「暫定と確定をどう区別して伝えるか」を要求確定の前に決め、決定事項として記録する。',
      en: 'The business owner accountable end-to-end from order to delivery decides. Settle before requirements are frozen: under what conditions a provisional answer is allowed, and how provisional is distinguished from confirmed. Record it as a decision.',
    },
  },
  {
    id: 'standard-vs-local',
    name: { ja: '標準化・全社最適 vs 現場裁量・個別最適', en: 'Standardization vs local autonomy' },
    poles: [
      {
        label: { ja: '標準に合わせる側', en: 'Wants to conform to the standard' },
        keywords: [
          '標準', '標準化', '全社最適', '統一', '共通化', 'パッケージ', 'ノンカスタマイズ', '集約',
          '一元', '全社', '統合', 'グループ標準', 'グローバル標準', '横串', 'ばらつき',
          '業務を変える', '業務プロセスを変える', 'あるべき姿に合わせ',
          // 「標準」という語を使わずに標準化を言う人が多いので、その言い回しも入れる
          '同じやり方', '一つのやり方', '同一のやり方', 'グループ全体', '全体で統一', '全体で揃え',
          '足並みを揃え', 'ひな形', 'テンプレート', '逸脱', '例外は認め~ない', '横並び',
          // `standard` は語幹で照合するので standardization / standardised / standards にも当たる
          'standard', 'fit to standard', 'package', 'out-of-the-box', 'consolidate',
          'single instance', 'company-wide', 'group-wide', 'harmonize', 'centralize',
          'one way of working', 'common process',
          'common template', 'one template', 'single template', 'common model',
          'group blueprint', 'uniform', 'every site', 'every plant',
          'all subsidiaries', 'across all sites', 'across all plants', 'roll out one',
        ],
      },
      {
        label: { ja: '現場のやり方を守る側', en: 'Wants to protect how the work is done today' },
        keywords: [
          // 裸の「現場」は「営業が現場に確認せずに」のような無関係な文にも当たるので入れない。
          // 現場側の立場を表す形にしてから入れる。
          '現場裁量', '現場のやり方', '現場の事情', '現場の実情', '現場の負担', '現場が混乱',
          '現場から反発', '現場が回ら~ない', '現場ごと',
          '個別最適', '個別対応', '独自', '例外', '特例', 'カスタマイズ', 'アドオン',
          '裁量', '部門ごと', '拠点ごと', '工場ごと', '部署ごと', '現行踏襲', '今のやり方', 'うちのやり方',
          '特殊事情', '事情が違う', '変更に反対', '反対', '負担が増える', '混乱',
          'local', 'autonomy', 'on-site', 'exception', 'customization', 'add-on', 'discretion',
          'per-site', 'site-specific', 'as-is', 'resist', 'disruption', 'burden', 'retraining',
          'our own way', 'special case', 'each plant', 'each site',
          'carve out', 'carve-out', 'its own way', 'own way of working', 'opt out',
          'waiver', 'not fit', 'does not cover', 'not cover', 'our site', 'this site only',
        ],
      },
    ],
    issue: {
      ja: '標準からの逸脱をどこまで認めるか(全社で 1 つのやり方に寄せるか、現場ごとのやり方を残すか)',
      en: 'How much deviation from the standard is allowed — one company-wide way of working, or local variation',
    },
    ifIgnored: {
      ja: '要件定義の後半で例外要求が噴き出し、カスタマイズが積み上がる。標準化で見込んだ費用削減と保守性の効果が消え、次の更改でも同じ議論をやり直すことになる。',
      en: 'Exception requests erupt late in requirements and customizations pile up. The savings and maintainability the standardization case was built on evaporate, and the same argument repeats at the next upgrade.',
    },
    arbitration: {
      ja: 'アーキテクチャ委員会(または CIO)が、逸脱を認める基準・申請窓口・承認者を先に決めて裁く。あわせて業務側の代表と、変更に伴う教育・要員計画を合意しておく。移行計画の前に決めないと、個別交渉が固定化する。',
      en: 'The architecture board (or the CIO) decides the criteria for granting an exception, the single intake route, and who approves. Agree the training and staffing plan with the business representatives at the same time. Settle it before migration planning, or case-by-case bargaining becomes permanent.',
    },
  },
  {
    id: 'cost-vs-quality',
    name: { ja: 'コスト削減 vs 品質・可用性', en: 'Cost reduction vs quality and availability' },
    poles: [
      {
        label: { ja: '費用を抑えたい側', en: 'Wants the spend down' },
        keywords: [
          'コスト', 'コスト削減', '費用', '費用削減', '経費削減', '予算', '削減', '安く', '低コスト',
          '投資対効果', '費用対効果', '価格', '経費', '人員削減', '採算', '原価',
          // 金額の上限を口にするのは「費用を抑えたい側」の典型(例: 年5億円を超える案は承認しない)
          '億円', '億を', '万円', '上限', '超える案', '承認しない', '決裁', '抑え', '圧縮', '増やせない',
          // 「決裁しません」は否定の抑止に消されるので、否定を含んだ形をそのまま判定語にする
          '決裁しません', '決裁しない', '決裁でき~ない', '承認しません', '通しません', '通りません',
          '出せません', '追加は出せ~ない', '認められません', '据え置き', '予算枠', 'これ以上は',
          '身の丈', '身銭',
          'roi', 'cost', 'budget', 'cheap', 'cheaper', 'saving', 'reduce spend', 'spend', 'headcount',
          'capex', 'opex', 'affordable', 'price tag',
          'will not fund', 'cannot fund', 'not approve', 'sign the cheque', 'business case',
          'value for money', 'cap the spend',
        ],
      },
      {
        label: { ja: '品質・可用性を守りたい側', en: 'Wants quality and availability protected' },
        keywords: [
          '品質', '可用性', '性能', 'レスポンス', '信頼性', '冗長', '障害', '安定稼働', '保守性', '網羅',
          // 「1 日たりとも止めたくない」のように間に語が入る言い方に当てる
          '止め~ない', '止まら~ない', '停止~できない', 'ライン停止', '稼働率', '歩留まり', '不良', 'クレーム',
          // 「停める」「止まります」「落ちたら」など、辞書語に書き直させないための追加
          '停め', '停ま', '停止', '止まる', '止まり', '止まっ',
          'システムが落ち', '設備が落ち', 'サーバが落ち', 'サーバーが落ち', '落ちたら', '落ちると',
          '復旧', '欠品',
          'sla', 'quality', 'availability', 'performance', 'reliability', 'redundancy', 'uptime',
          'downtime', 'outage', 'robust', 'stability', 'defect', 'service level',
          'recovery time', 'mean time',
        ],
      },
    ],
    issue: {
      ja: '費用をどこまで削り、どの水準の品質・可用性を買うか(削った分の劣化を誰が引き受けるか)',
      en: 'How far the spend comes down and what level of quality and availability is bought — and who absorbs the degradation',
    },
    ifIgnored: {
      ja: '水準を決めないまま安い案が通り、障害が起きてから「そんな品質とは聞いていない」になる。追加投資は障害の後にしか出ないため、結局は高くつく。',
      en: 'The cheap option passes with no agreed level, and after the first outage it becomes "nobody told us the quality would be this". The extra money only appears after the failure, so it ends up costing more.',
    },
    arbitration: {
      ja: '投資判断者(スポンサー / 財務)が裁く。先に品質・可用性を数値(停止許容時間・応答時間・復旧目標)で決め、その水準に対する費用を出す形にする。数値が無い議論は必ず安い方が勝つ。',
      en: 'The investment decision-maker (sponsor or finance) decides. Fix the quality and availability numbers first — tolerable downtime, response time, recovery targets — then price against them. Without numbers, the cheaper option always wins.',
    },
  },
  {
    id: 'short-vs-long',
    name: { ja: '短期の成果 vs 長期の持続性', en: 'Short-term results vs long-term sustainability' },
    poles: [
      {
        label: { ja: '今期の成果を出したい側', en: 'Wants results this period' },
        keywords: [
          '短期', '短期の成果', '今期', '今年度', '年度内', '早期に成果', 'すぐに', '当面',
          'クイックウィン', '目先', '目に見える成果',
          'this quarter', 'this fiscal', 'this year', 'short term', 'quick win', 'asap',
        ],
      },
      {
        label: { ja: '長く使える形にしたい側', en: 'Wants something that lasts' },
        keywords: [
          '長期', '中長期', '持続性', '将来', '持続', '技術的負債', '拡張性', '作り直し', '土台',
          '次の10年', '長く使える', '将来的に',
          'long term', 'sustainable', 'sustainability', 'technical debt', 'scalability',
          'maintainability', 'foundation', 'future-proof', 'long run',
        ],
      },
    ],
    issue: {
      ja: '今期に見せる成果と、後で効いてくる土台づくりのどちらに予算と人を割くか',
      en: 'Where the budget and the people go: visible results this period, or the foundation that pays off later',
    },
    ifIgnored: {
      ja: '短期側が勝ち続け、土台は毎回「次回」に送られる。3〜4 回送ると作り直し以外の選択肢が無くなり、費用は当初の見積では収まらない。',
      en: 'The short-term side keeps winning and the foundation is deferred every round. After three or four deferrals, a rebuild is the only option left and it will not fit the original estimate.',
    },
    arbitration: {
      ja: 'スポンサーがロードマップの区切り(移行アーキテクチャ)で裁く。各区切りで「今回やらないこと」を明文化し、土台側の作業には期限付きの枠を確保する。枠を取らない限り、土台は永久に後回しになる。',
      en: 'The sponsor decides at the roadmap milestones (transition architectures). Write down what is explicitly not done in each slice and ring-fence a dated allocation for foundation work. Without a ring-fence it is deferred forever.',
    },
  },
  {
    id: 'control-vs-convenience',
    name: { ja: '統制・セキュリティ vs 利便性', en: 'Control and security vs convenience' },
    poles: [
      {
        label: { ja: '統制を効かせたい側', en: 'Wants control enforced' },
        keywords: [
          'セキュリティ', '統制', '内部統制', '監査', '規制', 'コンプライアンス', '法令', '権限管理',
          '承認フロー', 'ガバナンス', '個人情報', '情報漏えい', '情報漏洩', '漏えい', '証跡',
          '不正', '権限', '認証', 'ログを残',
          'security', 'audit', 'compliance', 'regulation', 'regulatory', 'governance', 'privacy',
          'traceability', 'access control', 'least privilege', 'audit trail', 'accountability',
        ],
      },
      {
        label: { ja: '現場の使いやすさを守りたい側', en: 'Wants day-to-day usability protected' },
        keywords: [
          '使いやすさ', '使いにくい', '利便性', '手間', '二度手間', '煩雑', '面倒', '制約が多い',
          '自由に', '業務が止まる', 'ハードルが高い', '申請が多い', '手続きが多い', '入力が増える',
          '現場が回ら~ない',
          'usability', 'convenience', 'friction', 'cumbersome', 'red tape', 'self-service',
          'too many steps', 'user experience', 'slows people down',
        ],
      },
    ],
    issue: {
      ja: '統制の強さと日々の業務の回りやすさのどこで折り合うか(誰がリスクを受容するか)',
      en: 'Where control strength and day-to-day workability meet — and who accepts the residual risk',
    },
    ifIgnored: {
      ja: '統制が強すぎれば現場が抜け道(共有 ID・私物端末・表計算での二重管理)を作り、弱すぎれば監査で止まる。どちらも表面化するのは監査か事故の後。',
      en: 'Too much control and the floor invents workarounds — shared accounts, personal devices, shadow spreadsheets. Too little and the audit stops you. Either way it only surfaces after the audit or the incident.',
    },
    arbitration: {
      ja: 'リスクを受容する人(セキュリティ責任者と業務側役員の連名)が裁く。例外は期限付きで承認し、期限が来たら自動的に見直す。受容者の名前が入らない例外は認めない。',
      en: 'Whoever accepts the risk decides — jointly, the security owner and the business executive. Approve exceptions with an expiry date and review them when it arrives. No exception without a named acceptor.',
    },
  },
  {
    id: 'bigbang-vs-continuity',
    name: { ja: '一気に変える vs 現行業務を止めない', en: 'Change it all at once vs keep the business running' },
    poles: [
      {
        label: { ja: '一気に変えたい側', en: 'Wants to change it in one go' },
        keywords: [
          '一気に', '一気に変え', 'ビッグバン', '全面刷新', '刷新', '抜本的', '一斉', '一括で',
          'スクラップ', '一度に~切り替え',
          'big bang', 'all at once', 'radical', 'overhaul', 'rip and replace', 'single cutover',
        ],
      },
      {
        label: { ja: '現行業務の継続を守りたい側', en: 'Wants continuity of the running business' },
        keywords: [
          '段階的', '小さく', '徐々に', '並行稼働', '業務継続', '無停止', '繁忙期', 'リスクを抑え',
          // 「1 日たりとも止めたくない」「現行を止められない」「一時間でも停めるわけには」
          '止め~ない', '止まら~ない', '停止~できない', '停め~ない', '停め~いかない', '停まら~ない',
          'incremental', 'phased', 'step by step', 'parallel run', 'cannot stop', 'peak season',
          'low risk', 'continuity', 'keep running', 'no downtime',
        ],
      },
    ],
    issue: {
      ja: '切替を一度でやるか刻むか(止められない業務と、二重運用の負担のどちらを取るか)',
      en: 'One cutover or many (which is worse: the business that cannot stop, or the burden of running two systems)',
    },
    ifIgnored: {
      ja: '切替方式が決まらないまま設計が進み、後から並行稼働のためのつなぎを追加することになる。つなぎは捨てる前提で作られないため、そのまま残って恒久化する。',
      en: 'Design proceeds without a cutover approach, then temporary bridges get bolted on for the parallel run. Bridges built without a disposal date stay forever.',
    },
    arbitration: {
      ja: 'スポンサーと業務オーナーが、移行計画(フェーズ E/F)の前に裁く。並行稼働の期間・費用・旧側の停止日をセットで決める。停止日の無い段階移行は、二重運用として固定化する。',
      en: 'The sponsor and the business owner decide before migration planning (phases E/F). Fix the parallel-run period, its cost, and the shutdown date of the old side together. A phased migration with no shutdown date freezes into permanent dual operation.',
    },
  },
];

/** 対立の確からしさを上げるための「同じ話題か」判定 */
interface ConflictTopic {
  id: string;
  name: Bilingual;
  keywords: string[];
}

const CONFLICT_TOPICS: ConflictTopic[] = [
  {
    id: 'order-quote',
    name: { ja: '見積・受注・納期回答', en: 'Quotes, orders, and delivery dates' },
    keywords: [
      '見積', '受注', '納期', '引合', 'リードタイム', '出荷', '回答', '注文', '販売', '失注', '約束', '営業',
      '商談', '客先', '顧客', '返事', '見込客', '案件',
      'quote', 'order', 'delivery date', 'lead time', 'rfq', 'sales', 'customer', 'deal', 'bid',
    ],
  },
  {
    id: 'production',
    name: { ja: '生産・在庫', en: 'Production and inventory' },
    keywords: [
      '生産', '製造', '在庫', '工場', '工程', '設備', '調達', '購買', 'ライン', '稼働', '拠点', '現場',
      'production', 'manufacturing', 'inventory', 'plant', 'shop floor', 'procurement',
      'site', 'subsidiary', 'depot', 'factory',
    ],
  },
  {
    id: 'process-people',
    name: { ja: '業務プロセス・要員', en: 'Business process and people' },
    keywords: [
      '業務プロセス', '業務', 'プロセス', '手順', '運用ルール', '現場', '要員', '人員', '雇用', '教育', '組織',
      'process', 'workflow', 'staff', 'staffing', 'headcount', 'training', 'organisation', 'jobs',
    ],
  },
  {
    id: 'system-data',
    name: { ja: 'システム・データ', en: 'Systems and data' },
    keywords: [
      'システム', 'パッケージ', '基幹', 'データ', 'マスタ', '連携', 'インタフェース', 'クラウド', 'erp',
      'system', 'package', 'data', 'master data', 'interface', 'integration', 'cloud', 'platform',
    ],
  },
  {
    id: 'money',
    name: { ja: '費用・投資', en: 'Cost and investment' },
    keywords: [
      'コスト', '費用', '予算', '投資', '価格', '原価', '料金', '億円', '万円', '金額',
      'cost', 'budget', 'investment', 'price', 'spend',
    ],
  },
  {
    id: 'customer',
    name: { ja: '顧客・取引先', en: 'Customers and partners' },
    keywords: ['顧客', '客先', '取引先', 'チャネル', 'customer', 'client', 'channel'],
  },
  {
    id: 'security',
    name: { ja: 'セキュリティ・統制', en: 'Security and control' },
    keywords: [
      'セキュリティ', '監査', '規制', '法令', '個人情報', '統制',
      'security', 'audit', 'regulation', 'compliance', 'privacy',
    ],
  },
];

/** 否定表現。「カスタマイズはしない」「大幅な変更に反対」を賛成と読まないため */
const NEGATION_JA =
  /^[はをもがのにでとへ、\s]{0,3}(?:しない|しません|せず|させない|できない|認めない|不要|不可|禁止|なし|無し|反対|避け|やめ|廃止|は困る|は避け)/;
const NEGATION_EN = /^(?:no|not|never|without|avoid|avoiding|minimal|minimum|less)$/;

// --- 判定語の照合 / Matching a keyword against a concern ---
//
// 以前は「ASCII は単語境界のちょうど一致」「日本語は連続句のちょうど一致」だったため、
// 利用者が自分の言葉で書くと当たらなかった(実測):
//   - `standard` が "Group standardization" に当たらない
//   - `勝手に約束` が「営業が勝手に納期を約束する」に当たらない(間に 3 文字入るだけで外れる)
// そこで英語は語幹、日本語は「順序を保った飛び石」で照合する。
// 緩めた分だけ誤検出は増えるので、話題が重ならない組は confidence='possible'(要確認)に落とし、
// 根拠にした関心事と一致した語を必ず併記する。

/** 日本語の飛び石照合で、部品と部品の間に許す最大文字数 */
const JA_GAP_CHARS = 8;
/** 英語の複数語で、語と語の間に許す最大単語数 */
const EN_GAP_WORDS = 2;
/** 判定語の中で「間に何か入ってよい」ことを表す区切り(例: `勝手に~約束`) */
const KEYWORD_GAP = '~';

/**
 * 語尾を落として比較用の語幹にする。
 * 残る語幹の長さに下限を付けることで、過剰一致(local と location が同じ語幹になるなど)を防ぐ。
 */
interface StemRule {
  suffix: string;
  /** 語幹として残す最小文字数。これを下回るなら落とさない */
  min: number;
  /** 落としたあとに付け直す文字(deliveries → delivery) */
  to?: string;
}

const STEM_RULES: StemRule[] = [
  { suffix: 'izations', min: 5 },
  { suffix: 'isations', min: 5 },
  { suffix: 'ization', min: 5 },
  { suffix: 'isation', min: 5 },
  { suffix: 'ations', min: 5 },
  { suffix: 'ation', min: 5 },
  { suffix: 'izing', min: 5 },
  { suffix: 'ising', min: 5 },
  { suffix: 'ized', min: 5 },
  { suffix: 'ised', min: 5 },
  { suffix: 'izes', min: 5 },
  { suffix: 'ises', min: 5 },
  { suffix: 'ize', min: 5 },
  { suffix: 'ise', min: 5 },
  { suffix: 'ements', min: 5 },
  { suffix: 'ement', min: 5 },
  { suffix: 'ments', min: 5 },
  { suffix: 'ment', min: 5 },
  { suffix: 'ness', min: 5 },
  { suffix: 'ates', min: 5 },
  { suffix: 'ate', min: 5 },
  { suffix: 'ities', min: 5 },
  { suffix: 'ity', min: 5 },
  { suffix: 'ally', min: 5 },
  { suffix: 'ly', min: 5 },
  { suffix: 'ing', min: 5 },
  { suffix: 'ies', min: 4, to: 'y' },
  { suffix: 'ed', min: 4 },
  { suffix: 'es', min: 3 },
  { suffix: 's', min: 3 },
];

/** 1 語を語幹にする(規則は最大 2 回まで適用する: businesses → business → busines) */
function stemWord(word: string): string {
  let current = word;
  for (let pass = 0; pass < 2; pass += 1) {
    let changed = false;
    for (const rule of STEM_RULES) {
      if (!current.endsWith(rule.suffix)) continue;
      const base = current.slice(0, current.length - rule.suffix.length) + (rule.to ?? '');
      if (base.length < rule.min) continue;
      current = base;
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return current;
}

interface Token {
  stem: string;
  start: number;
  end: number;
}

/** 照合結果の位置(否定表現を見るために終端も要る) */
interface KeywordMatch {
  start: number;
  end: number;
}

/** キャッシュの上限。長時間動くサーバーで無制限に太らせない */
const MATCH_CACHE_MAX = 500;

function cachePut<K, V>(cache: Map<K, V>, key: K, value: V): V {
  if (cache.size >= MATCH_CACHE_MAX) cache.clear();
  cache.set(key, value);
  return value;
}

const tokenCache = new Map<string, Token[]>();

/** 英数字の並びを語として切り出す(日本語文中の "ERP" のような語も拾う) */
function tokensOf(haystack: string): Token[] {
  const cached = tokenCache.get(haystack);
  if (cached) return cached;
  const tokens: Token[] = [];
  const re = /[a-z0-9]+/g;
  let m: RegExpExecArray | null = re.exec(haystack);
  while (m !== null) {
    tokens.push({ stem: stemWord(m[0]), start: m.index, end: m.index + m[0].length });
    m = re.exec(haystack);
  }
  return cachePut(tokenCache, haystack, tokens);
}

interface ParsedKeyword {
  /** ASCII の語か(true なら語幹照合、false なら日本語の飛び石照合) */
  ascii: boolean;
  /** 順に現れる必要のある部品 */
  parts: string[];
  /** 根拠として画面に出す表記 */
  display: string;
  /** 同義の語をまとめるための鍵(cost と costs を 2 件として数えない) */
  key: string;
}

const keywordCache = new Map<string, ParsedKeyword>();

function parseKeyword(keyword: string): ParsedKeyword {
  const cached = keywordCache.get(keyword);
  if (cached) return cached;
  const raw = keyword.trim().toLowerCase();
  const ascii = /^[\x20-\x7e]+$/.test(raw);
  const parts = ascii
    ? raw.split(/[^a-z0-9]+/).filter((p) => p.length > 0).map(stemWord)
    : raw.split(KEYWORD_GAP).map((p) => p.trim()).filter((p) => p.length > 0);
  const display = ascii ? keyword.trim() : keyword.trim().split(KEYWORD_GAP).join('…');
  return cachePut(keywordCache, keyword, { ascii, parts, display, key: parts.join(' ') });
}

/** 英語: 語幹が順に現れればよい(間に最大 EN_GAP_WORDS 語まで許す) */
function asciiMatches(haystack: string, parts: string[]): KeywordMatch[] {
  const tokens = tokensOf(haystack);
  const found: KeywordMatch[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].stem !== parts[0]) continue;
    let last = i;
    let ok = true;
    for (let p = 1; p < parts.length; p += 1) {
      let next = -1;
      for (let j = last + 1; j <= last + 1 + EN_GAP_WORDS && j < tokens.length; j += 1) {
        if (tokens[j].stem === parts[p]) {
          next = j;
          break;
        }
      }
      if (next < 0) {
        ok = false;
        break;
      }
      last = next;
    }
    if (ok) found.push({ start: tokens[i].start, end: tokens[last].end });
  }
  return found;
}

/** 日本語: 部品が語順どおりに現れればよい(間に最大 JA_GAP_CHARS 文字まで許す) */
function jaMatches(haystack: string, parts: string[]): KeywordMatch[] {
  const found: KeywordMatch[] = [];
  let from = 0;
  for (;;) {
    const start = haystack.indexOf(parts[0], from);
    if (start < 0) return found;
    let end = start + parts[0].length;
    let ok = true;
    for (let p = 1; p < parts.length; p += 1) {
      const idx = haystack.indexOf(parts[p], end);
      if (idx < 0 || idx - end > JA_GAP_CHARS) {
        ok = false;
        break;
      }
      end = idx + parts[p].length;
    }
    if (ok) found.push({ start, end });
    from = start + parts[0].length;
  }
}

function keywordMatches(haystack: string, parsed: ParsedKeyword): KeywordMatch[] {
  if (parsed.parts.length === 0) return [];
  return parsed.ascii ? asciiMatches(haystack, parsed.parts) : jaMatches(haystack, parsed.parts);
}

/** 話題の一致(立場ではなく題材なので否定は見ない) */
function topicHit(haystack: string, keyword: string): boolean {
  return keywordMatches(haystack, parseKeyword(keyword)).length > 0;
}

/** 立場の一致。否定されている出現は数えない */
function stanceHit(haystack: string, keyword: string): boolean {
  const parsed = parseKeyword(keyword);
  for (const m of keywordMatches(haystack, parsed)) {
    if (parsed.ascii) {
      const before = haystack.slice(Math.max(0, m.start - 24), m.start);
      const prev = /([a-z']+)[^a-z']*$/.exec(before)?.[1] ?? '';
      if (!NEGATION_EN.test(prev)) return true;
    } else {
      const after = haystack.slice(m.end, m.end + 12);
      if (!NEGATION_JA.test(after)) return true;
    }
  }
  return false;
}

/** ある関心事が、ある立場に当たったか(当たった語も返す) */
interface PoleHit {
  concern: string;
  matched: string[];
}

function poleHits(concerns: string[], pole: ConflictPole): PoleHit[] {
  const hits: PoleHit[] = [];
  for (const concern of concerns) {
    const hay = concern.toLowerCase();
    // 語幹が同じ語(cost / costs)は 1 件として数える。根拠の欄に同じ語が並ぶのを避け、
    // 「当たりの強い側」の判定が語形のゆれで決まらないようにする。
    const seen = new Set<string>();
    const matched: string[] = [];
    for (const k of pole.keywords) {
      const parsed = parseKeyword(k);
      if (seen.has(parsed.key)) continue;
      if (!stanceHit(hay, k)) continue;
      seen.add(parsed.key);
      matched.push(parsed.display);
    }
    if (matched.length > 0) hits.push({ concern, matched });
  }
  return hits;
}

const topicCache = new Map<string, ConflictTopic[]>();

function topicsOf(concern: string): ConflictTopic[] {
  const cached = topicCache.get(concern);
  if (cached) return cached;
  const hay = concern.toLowerCase();
  const topics = CONFLICT_TOPICS.filter((t) => t.keywords.some((k) => topicHit(hay, k)));
  topicCache.set(concern, topics);
  return topics;
}

/** 対立軸の片側に立っている 1 人と、その根拠 */
interface ConflictParticipant {
  person: Stakeholder;
  /** 根拠にした関心事(その立場に最もよく当たったもの) */
  concern: string;
  matched: string[];
  /** この人が軸の両側に関心事を持っているか */
  twoSided: boolean;
}

/**
 * 1 つの対立軸につき 1 件。
 * 同じことを言う人が複数いても組み合わせの数だけ並べない(4 人 × 4 人で 16 行になると読めない)。
 */
interface DetectedConflict {
  axis: ConflictAxis;
  /** [軸の一方の立場に立つ人たち, 他方に立つ人たち] */
  sides: [ConflictParticipant[], ConflictParticipant[]];
  /** 代表として詳しく示す 1 組(話題が重なる組を優先) */
  representative: [ConflictParticipant, ConflictParticipant];
  sharedTopics: ConflictTopic[];
  /** likely = 同じ話題で正面から食い違う / possible = 同じ軸だが話題が重ならない(要確認) */
  confidence: 'likely' | 'possible';
}

/** 関心事だけを見て有効な文字列に整える(手書き JSON でも落ちないように) */
function usableConcerns(s: Stakeholder): string[] {
  if (!Array.isArray(s.concerns)) return [];
  return s.concerns.filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
}

/** 影響力・関心度の重み(同じ確度なら重い人の対立を先に出す) */
function stakeholderWeight(s: Stakeholder): number {
  return INFLUENCE_RANK[s.influence] * 2 + INFLUENCE_RANK[s.interest];
}

/**
 * 登録された関心事から、対立しうる軸を検出する。
 * 語の照合だけで判定しているので、ここで出るのは「候補」であり確定した対立ではない。
 * 1 軸につき 1 件にまとめ、両側に立つ人を全員並べる。
 */
function detectStakeholderConflicts(people: Stakeholder[]): DetectedConflict[] {
  const found: DetectedConflict[] = [];

  for (const axis of CONFLICT_AXES) {
    // 人ごとに、この軸のどちら側に当たったかを求める
    const hitsOf = new Map<string, [PoleHit[], PoleHit[]]>();
    for (const s of people) {
      const concerns = usableConcerns(s);
      if (concerns.length === 0) continue;
      const hits: [PoleHit[], PoleHit[]] = [
        poleHits(concerns, axis.poles[0]),
        poleHits(concerns, axis.poles[1]),
      ];
      if (hits[0].length > 0 || hits[1].length > 0) hitsOf.set(s.id, hits);
    }

    const bestOf = (hits: PoleHit[]): PoleHit | null =>
      hits.length === 0 ? null : [...hits].sort((x, y) => y.matched.length - x.matched.length)[0];

    // 両側に当たった人は、当たりの強い側にだけ置く(同じ人が両側に並ぶと読めない)
    const build = (pole: 0 | 1): ConflictParticipant[] =>
      people
        .flatMap((s) => {
          const hits = hitsOf.get(s.id);
          if (!hits) return [];
          const mine = bestOf(hits[pole]);
          if (!mine) return [];
          const other = bestOf(hits[pole === 0 ? 1 : 0]);
          if (other && other.matched.length > mine.matched.length) return [];
          // 同点なら pole 0 側に寄せる(どちらかに決めないと両側に出てしまう)
          if (other && other.matched.length === mine.matched.length && pole === 1) return [];
          return [
            {
              person: s,
              concern: mine.concern,
              matched: mine.matched,
              twoSided: other !== null,
            },
          ];
        })
        .sort((x, y) => stakeholderWeight(y.person) - stakeholderWeight(x.person));

    const sideA = build(0);
    const sideB = build(1);
    // 同一人物が両側に居るだけの状態は対立ではない(本人の中の両立)
    const hasCrossPair = sideA.some((a) => sideB.some((b) => b.person.id !== a.person.id));
    if (!hasCrossPair) continue;

    // 代表の組は「同じ話題を指していて、両側発言でない」ものを優先する
    let representative: [ConflictParticipant, ConflictParticipant] | null = null;
    let sharedTopics: ConflictTopic[] = [];
    let bestScore = -1;
    for (const a of sideA) {
      const aTopics = topicsOf(a.concern);
      for (const b of sideB) {
        if (a.person.id === b.person.id) continue;
        const bTopics = topicsOf(b.concern);
        const shared = aTopics.filter((t) => bTopics.some((u) => u.id === t.id));
        const score =
          (shared.length > 0 ? 1000 : 0) +
          (a.twoSided || b.twoSided ? 0 : 500) +
          (stakeholderWeight(a.person) + stakeholderWeight(b.person)) * 10 +
          a.matched.length +
          b.matched.length;
        if (score > bestScore) {
          bestScore = score;
          representative = [a, b];
          sharedTopics = shared;
        }
      }
    }
    if (!representative) continue;

    const twoSidedRep = representative[0].twoSided || representative[1].twoSided;
    found.push({
      axis,
      sides: [sideA, sideB],
      representative,
      sharedTopics,
      confidence: sharedTopics.length > 0 && !twoSidedRep ? 'likely' : 'possible',
    });
  }

  return found.sort((x, y) => {
    if (x.confidence !== y.confidence) return x.confidence === 'likely' ? -1 : 1;
    const w = (c: DetectedConflict): number =>
      stakeholderWeight(c.representative[0].person) + stakeholderWeight(c.representative[1].person);
    return w(y) - w(x);
  });
}

/** 片側に並べる人数の上限(超えた分は名前だけ添える) */
const CONFLICT_SIDE_MAX = 5;

const CONFIDENCE_LABEL: Record<DetectedConflict['confidence'], Bilingual> = {
  likely: { ja: '!! 対立の可能性(高)', en: '!! Likely conflict' },
  possible: { ja: '? 対立の可能性(要確認)', en: '? Possible conflict, to be checked' },
};

/** 検出できなかったときに手で見る観点(軸の定義からそのまま作る) */
function conflictChecklist(lang: Lang): string {
  return bullets(
    CONFLICT_AXES.map((axis) => ({
      ja: `${axis.name.ja} — ${axis.issue.ja}`,
      en: `${axis.name.en} — ${axis.issue.en}`,
    })),
    lang,
  );
}

function personLabel(s: Stakeholder, lang: Lang): string {
  const role = s.role && s.role.trim().length > 0 ? `, ${cell(s.role)}` : '';
  return `${cell(s.name)} (${label(L.influence, lang)} ${label(INFLUENCE_LABEL[s.influence], lang)}, ${label(L.interest, lang)} ${label(INFLUENCE_LABEL[s.interest], lang)}${role})`;
}

/** 対立の節を組み立てる */
function renderStakeholderConflicts(
  people: Stakeholder[],
  conflicts: DetectedConflict[],
  lang: Lang,
): string[] {
  const out: string[] = [];
  out.push(`## ${inline('関係者間の対立(関心事から検出)', 'Conflicts between stakeholders (from recorded concerns)', lang)}`);
  out.push('');

  const withConcerns = people.filter((s) => usableConcerns(s).length > 0);

  if (conflicts.length === 0) {
    out.push(
      msg(
        '登録された関心事の突き合わせでは、対立は検出できませんでした。これは「対立が無い」ことの証明ではありません。判定は関心事に書かれた語だけを見ているので、言い回しが違えば見落とします。',
        'No conflict was found by matching the recorded concerns. That is not proof there is none: the check only looks at the words in the concerns, so different phrasing slips through.',
        lang,
      ),
    );
    out.push('');
    if (withConcerns.length < 2) {
      out.push(
        msg(
          `関心事が記入されている関係者は ${withConcerns.length} 名です。突き合わせには最低 2 名分の関心事が要ります。`,
          `Only ${withConcerns.length} stakeholder(s) have concerns recorded; the comparison needs at least two.`,
          lang,
        ),
      );
      out.push('');
    }
    out.push(`### ${inline('手で突き合わせる観点', 'What to check by hand', lang)}`);
    out.push('');
    out.push(conflictChecklist(lang));
    out.push('');
    out.push(
      msg(
        '各観点について「誰がどちら側か」を 1 行で書いてみてください。両側に人が居る観点は、決めていない限り必ず後で衝突します。両側に人が居ると分かったら、その人たちの言い分を本人の言葉のまま concerns に入れて再実行すると、この節に出るようになります。',
        'For each lens, write one line naming who is on which side. Any lens with people on both sides will collide later unless it is decided. Once you know, record each person\'s position in their own words in concerns and re-run — it will then show up in this section.',
        lang,
      ),
    );
    out.push('');
    return out;
  }

  out.push(
    msg(
      `関心事の文言を突き合わせて、対立しうる論点を ${conflicts.length} 件検出しました。これは語の一致による**推定**であり、当事者に確認するまでは対立と決まったわけではありません。根拠にした関心事を必ず併記しているので、外れているものはその場で捨ててください。`,
      `Matching the wording of the recorded concerns surfaced ${plural(conflicts.length, 'potential point of conflict', 'potential points of conflict')}. These are **inferences** from word matches, not confirmed conflicts. The concerns used as evidence are shown with each one, so discard whatever does not hold.`,
      lang,
    ),
  );
  out.push('');
  out.push(
    `| ${inline('確度', 'Confidence', lang)} | ${inline('対立軸', 'Axis', lang)} | ${inline('当事者', 'Parties', lang)} | ${inline('争点', 'What it is about', lang)} |`,
  );
  out.push('| --- | --- | --- | --- |');
  const names = (side: ConflictParticipant[]): string => {
    const shown = side.slice(0, 3).map((p) => cell(p.person.name)).join(', ');
    return side.length > 3 ? `${shown} +${side.length - 3}` : shown;
  };
  for (const c of conflicts) {
    out.push(
      `| ${text(CONFIDENCE_LABEL[c.confidence], lang)} | ${text(c.axis.name, lang)} | ${names(c.sides[0])} ↔ ${names(c.sides[1])} | ${cell(text(c.axis.issue, lang))} |`,
    );
  }
  out.push('');

  conflicts.forEach((c, index) => {
    const topics =
      c.sharedTopics.length > 0
        ? `${inline('共通の話題', 'shared topic', lang)}: ${c.sharedTopics.map((t) => text(t.name, lang)).join(', ')}`
        : inline(
            '共通の話題は見つからず(別の件を指している可能性)',
            'no shared topic found (they may be talking about different things)',
            lang,
          );
    out.push(
      `### ${index + 1}. ${text(c.axis.name, lang)} — ${text(CONFIDENCE_LABEL[c.confidence], lang)} (${topics})`,
    );
    out.push('');
    for (const [poleIndex, side] of c.sides.entries()) {
      const pole = c.axis.poles[poleIndex];
      out.push(`- **${text(pole.label, lang)}** (${side.length})`);
      for (const p of side.slice(0, CONFLICT_SIDE_MAX)) {
        // 代表印は複数人が並ぶ側でだけ意味がある
        const rep =
          side.length > 1 && c.representative[poleIndex].person.id === p.person.id
            ? ` ${inline('[代表]', '[example]', lang)}`
            : '';
        out.push(`  - ${personLabel(p.person, lang)}${rep}`);
        out.push(
          `    - ${inline('根拠にした関心事', 'Evidence', lang)}: 「${quote(p.concern, 120)}」(${inline('一致した語', 'matched', lang)}: ${p.matched.slice(0, 5).join(' / ')})`,
        );
      }
      if (side.length > CONFLICT_SIDE_MAX) {
        const rest = side.slice(CONFLICT_SIDE_MAX).map((p) => cell(p.person.name));
        out.push(
          `  - ${inline(`ほか ${rest.length} 名: ${rest.join(', ')}`, `and ${rest.length} more: ${rest.join(', ')}`, lang)}`,
        );
      }
    }
    out.push(`- **${inline('争点', 'The question', lang)}**: ${text(c.axis.issue, lang)}`);
    out.push(`- **${inline('放置すると', 'If it is left alone', lang)}**: ${text(c.axis.ifIgnored, lang)}`);
    out.push(`- **${inline('いつ誰が裁くか', 'Who decides, and when', lang)}**: ${text(c.axis.arbitration, lang)}`);
    const twoSidedNames = [...c.sides[0], ...c.sides[1]]
      .filter((p) => p.twoSided)
      .map((p) => cell(p.person.name));
    const uniqueTwoSided = [...new Set(twoSidedNames)];
    if (uniqueTwoSided.length > 0) {
      out.push(
        `- ${inline('注記', 'Note', lang)}: ${inline(
          `${uniqueTwoSided.join(', ')} は軸の両側に当たる関心事を書いています。本人の中では両立している可能性があるため、対立と決めつけず本人に確認してください。`,
          `${uniqueTwoSided.join(', ')} has concerns matching both sides of this axis, so they may already hold both positions. Check before calling it a conflict.`,
          lang,
        )}`,
      );
    }
    out.push('');
  });
  out.push(
    msg(
      '検出した対立は、そのままでは誰も裁きません。`update_engagement` の decisions に「未決」として、争点・当事者・裁定者・期限を入れて登録してください。対立を決定事項として立てておかないと、成果物のレビューの場で毎回蒸し返されます。',
      'A detected conflict decides itself for nobody. Record each one via the decisions field of `update_engagement` as open, with the question, the parties, who decides, and by when. Conflicts that are not raised as decisions come back at every deliverable review.',
      lang,
    ),
  );
  out.push('');
  return out;
}

/**
 * 象限ごとの明細に何名まで載せるか。
 *
 * 象限は 4 つあるので、1 表ずつ `OUTPUT_LIMITS.rows` まで出すと合計 80 行になり、
 * 「絞った」ことにならない。明細全体で `OUTPUT_LIMITS.rows` 行を人数比で配分し、
 * どの象限も最低 3 名は見えるようにする(0 名にすると象限の性格が分からなくなる)。
 * 2 × 2 の集計側は全員を載せたままなので、誰が居るかは失われない。
 */
function quadrantLimit(members: number, people: number): number {
  if (people <= OUTPUT_LIMITS.rows) return OUTPUT_LIMITS.rows;
  return Math.max(3, Math.floor((OUTPUT_LIMITS.rows * members) / people));
}

function runStakeholderMatrix(lang: Lang): ToolResult {
  const engagement = loadEngagement();
  if (!engagement) return noEngagementResult(lang, L.stakeholderMatrix);

  const people = engagement.stakeholders;
  const out: string[] = [];
  out.push(`# ${label(L.stakeholderMatrix, lang)}: ${engagement.name}`);
  out.push('');

  if (people.length === 0) {
    out.push(
      msg(
        'ステークホルダーが 1 件も登録されていません。誰の関心事に答えるためのアーキテクチャなのかが定まっていない状態です。',
        'No stakeholders are recorded. Without them, there is no statement of whose concerns the architecture is meant to answer.',
        lang,
      ),
    );
    out.push('');
    out.push(`## ${inline('次の一手', 'Next steps', lang)}`);
    out.push('');
    out.push(
      bullets(
        [
          {
            ja: '最低限、次を特定する: 予算を出す人、業務を止められる人、運用を引き受ける人、規制・監査で見る人。',
            en: 'At minimum identify: who funds it, who can halt the business, who will operate it, and who reviews it for regulation or audit.',
          },
          {
            ja: '各人に影響力(influence)・関心度(interest)・関心事(concerns)を付けて `update_engagement` の stakeholders で登録する。',
            en: 'Record influence, interest, and concerns for each via the stakeholders field of `update_engagement`.',
          },
        ],
        lang,
      ),
    );
    out.push('');
    out.push(
      ...referenceSection(
        [techniquePointer('stakeholder-management', lang), deliverablePointer('stakeholder-map', lang)],
        lang,
      ),
    );
    return textResult(out.join('\n'));
  }

  const groups: Record<Quadrant, Stakeholder[]> = {
    manageClosely: [],
    keepSatisfied: [],
    keepInformed: [],
    monitor: [],
  };
  for (const s of people) groups[quadrantOf(s)].push(s);

  // --- 2 × 2 マトリクス ---
  out.push(`## ${inline('影響力 × 関心度', 'Influence x interest', lang)}`);
  out.push('');
  out.push(
    `| ${label(L.influence, lang)} \\ ${label(L.interest, lang)} | ${inline('高', 'High', lang)} | ${inline('低', 'Low', lang)} |`,
  );
  out.push('| :-: | --- | --- |');
  out.push(
    `| **${inline('高', 'High', lang)}** | **${label(L.manageClosely, lang)}**<br>${groups.manageClosely.map((s) => cell(capCell(stakeholderTag(s)))).join('<br>') || '·'} | **${label(L.keepSatisfied, lang)}**<br>${groups.keepSatisfied.map((s) => cell(capCell(stakeholderTag(s)))).join('<br>') || '·'} |`,
  );
  out.push(
    `| **${inline('低', 'Low', lang)}** | **${label(L.keepInformed, lang)}**<br>${groups.keepInformed.map((s) => cell(capCell(stakeholderTag(s)))).join('<br>') || '·'} | **${label(L.monitor, lang)}**<br>${groups.monitor.map((s) => cell(capCell(stakeholderTag(s)))).join('<br>') || '·'} |`,
  );
  out.push('');
  out.push(para(STAKEHOLDER_QUADRANT_RULE, lang));
  out.push('');

  // --- 象限ごとの方針 ---
  out.push(`## ${inline('象限ごとの関与方針', 'Engagement approach per quadrant', lang)}`);
  out.push('');
  out.push(provenanceLegend(lang));
  out.push('');
  const quadrantOrder: Quadrant[] = ['manageClosely', 'keepSatisfied', 'keepInformed', 'monitor'];
  for (const q of quadrantOrder) {
    const members = groups[q];
    out.push(
      `### ${label(QUADRANT_LABEL[q], lang)} — ${text(QUADRANT_CONDITION[q], lang)} (${members.length})`,
    );
    out.push('');
    out.push(text(QUADRANT_APPROACH[q], lang));
    out.push('');
    if (members.length === 0) {
      out.push(label(L.none, lang));
      out.push('');
      continue;
    }
    // 上の 2 × 2 は全員を載せた集計(切ると誰が抜けたか分からなくなる)。
    // 切るのは象限ごとのこの明細表だけで、影響力の高い人から残す。
    const ordered = [...members].sort(
      (a, b) =>
        INFLUENCE_RANK[b.influence] - INFLUENCE_RANK[a.influence] ||
        INFLUENCE_RANK[b.interest] - INFLUENCE_RANK[a.interest] ||
        a.name.localeCompare(b.name),
    );
    const shownMembers = capRows(ordered, quadrantLimit(members.length, people.length));
    out.push(
      `| ${label(L.name, lang)} | ${label(L.role, lang)} | ${label(L.influence, lang)} | ${label(L.interest, lang)} | ${label(L.concerns, lang)} | ${label(L.approach, lang)} | ${inline('出典', 'Source', lang)} |`,
    );
    out.push('| --- | --- | :-: | :-: | --- | --- | --- |');
    for (const s of shownMembers.rows) {
      out.push(
        [
          '',
          cell(capCell(stakeholderTag(s))),
          cell(capCell(s.role ?? '')) || '—',
          label(INFLUENCE_LABEL[s.influence], lang),
          label(INFLUENCE_LABEL[s.interest], lang),
          cell(capCell(s.concerns.join(' / '))) || '—',
          cell(capCell(s.approach ?? '')) || '—',
          sourceCell(s, lang),
          '',
        ].join(' | ').trim(),
      );
    }
    if (shownMembers.capped) {
      out.push('');
      out.push(
        `_${capNotice(
          shownMembers,
          {
            ja: '並びは影響力の高い順。上の 2 × 2 には全員載っている。明細を全件見るには `get_dashboard` に compact=false(件数を変えるなら limit=<件数>)、生データなら `get_engagement` の format="json"。',
            en: 'Ordered by influence. Everyone still appears in the 2 x 2 above. For the full detail call `get_dashboard` with compact=false (or limit=<n>), or read the raw data with format="json" on `get_engagement`.',
          },
          lang,
        )}_`,
      );
    }
    out.push('');
  }

  // --- 出典の記入状況 ---
  out.push(...provenanceCoverageSection({ ja: '関係者', en: 'Stakeholders' }, people, engagement, lang));

  // --- 関係者間の対立 ---
  const conflicts = detectStakeholderConflicts(people);
  out.push(...renderStakeholderConflicts(people, conflicts, lang));

  // --- 指摘 ---
  const findings: Finding[] = [];
  // 影響力の高い層(密に関与 / 満足を維持)の位置付けは、誰かの判断で決まっている。
  // その判断の出所が残っていないと、体制が変わったときに全部やり直しになる。
  const heavyWithoutSource = [...groups.manageClosely, ...groups.keepSatisfied].filter((s) => !hasProvenance(s));
  if (heavyWithoutSource.length > 0) {
    findings.push({
      severity: 'medium',
      subject: inline('全体', 'Overall', lang),
      issue: {
        ja: `影響力の高い ${heavyWithoutSource.length} 名に出典が無い`,
        en: `${heavyWithoutSource.length} high-influence stakeholders carry no source`,
      },
      recommendation: {
        ja: 'その人を「影響力が高い」と判断した根拠(組織図・決裁権限規程・面談日・誰の紹介か)を出典として入れる。根拠が残っていない人物像は、担当が代わった時点で最初から作り直しになる。',
        en: 'Record what put them there — the org chart, the delegation-of-authority rules, the interview date, who introduced them. A stakeholder picture with no trail is rebuilt from scratch the moment the consultant changes.',
      },
    });
  }
  const likely = conflicts.filter((c) => c.confidence === 'likely');
  for (const c of likely.slice(0, 5)) {
    const [repA, repB] = c.representative;
    const extra = c.sides[0].length + c.sides[1].length - 2;
    const bothHeavy = isHighSide(repA.person.influence) && isHighSide(repB.person.influence);
    findings.push({
      severity: bothHeavy ? 'high' : 'medium',
      subject: `${repA.person.name} ↔ ${repB.person.name}${extra > 0 ? ` (+${extra})` : ''}`,
      issue: {
        ja: `関心事が正面から食い違う(${c.axis.name.ja})`,
        en: `Concerns point in opposite directions (${c.axis.name.en})`,
      },
      recommendation: {
        ja: `${c.axis.issue.ja} — これを決定事項として立て、裁定者と期限を入れる。${c.axis.arbitration.ja}`,
        en: `${c.axis.issue.en} — raise it as a decision with a named arbiter and a date. ${c.axis.arbitration.en}`,
      },
    });
  }
  if (likely.length > 0) {
    // 当事者以外に影響力「高」の人が居ない対立は、当事者同士で決めるしかなくなる
    const unarbitrated = likely.filter((c) => {
      const parties = new Set([...c.sides[0], ...c.sides[1]].map((p) => p.person.id));
      return !people.some((s) => s.influence === 'high' && !parties.has(s.id));
    });
    if (unarbitrated.length > 0) {
      findings.push({
        severity: 'high',
        subject: unarbitrated.map((c) => text(c.axis.name, lang)).join(' / '),
        issue: {
          ja: '対立を裁ける上位者(影響力 高)が、当事者以外に登録されていない',
          en: 'No high-influence stakeholder outside the conflicting parties is recorded',
        },
        recommendation: {
          ja: '当事者同士の話し合いでは決着しない。両者の上位にいる決裁者(スポンサー・担当役員)を特定して登録し、裁定の場と期限を決める。上位者が居ない対立は、そのまま実装工程まで持ち越される。',
          en: 'The parties will not settle this between themselves. Identify and record the decision-maker above both of them (the sponsor or the responsible executive) and fix where and by when it is arbitrated. A conflict with nobody above it simply travels into implementation.',
        },
      });
    }
  }
  for (const s of people) {
    const q = quadrantOf(s);
    if (s.concerns.length === 0) {
      findings.push({
        severity: q === 'manageClosely' || q === 'keepSatisfied' ? 'high' : 'medium',
        subject: s.name,
        issue: { ja: '関心事が未記入', en: 'No concerns recorded' },
        recommendation: {
          ja: '本人の言葉で関心事を 2〜3 個聞き取る。関心事が無いまま作った成果物は、その人のレビューを通らない。',
          en: 'Interview them for two or three concerns in their own words. Deliverables built without them will not survive that person’s review.',
        },
      });
    }
    // 仮置きの定型文は未設定として扱う(欄が埋まっているだけでは方針にならない)
    if (!isWrittenByHuman(s.approach)) {
      findings.push({
        severity: q === 'manageClosely' || q === 'keepSatisfied' ? 'high' : 'low',
        subject: s.name,
        issue: { ja: '関与方針が未設定', en: 'No engagement approach set' },
        recommendation: {
          ja: `「誰が・どの頻度で・何を渡すか」を 1 行で決める。「${QUADRANT_LABEL[q].ja}」の方針を出発点にする。`,
          en: `Write one line covering who contacts them, how often, and with what. Start from the "${QUADRANT_LABEL[q].en}" approach.`,
        },
      });
    }
  }
  const highInfluence = people.filter((s) => s.influence === 'high').length;
  if (highInfluence === 0) {
    findings.push({
      severity: 'high',
      subject: inline('全体', 'Overall', lang),
      issue: {
        ja: '影響力「高」の人が 1 人もいない',
        en: 'Nobody is recorded with high influence',
      },
      recommendation: {
        ja: '予算・体制・優先順位を最終的に決める人を特定して登録する。決裁者が居ないまま進む案件は、承認段階で必ず止まる。',
        en: 'Identify and record whoever finally decides budget, staffing, and priority. An engagement without a decision-maker stalls at approval.',
      },
    });
  }
  if (people.length >= 4 && groups.manageClosely.length / people.length > 0.6) {
    findings.push({
      severity: 'medium',
      subject: inline('全体', 'Overall', lang),
      issue: {
        ja: '大半が「密に関与」に集中しており、優先順位が付いていない',
        en: 'Most stakeholders land in "manage closely", so no priority is expressed',
      },
      recommendation: {
        ja: '影響力を「この人の反対で計画が止まるか」で、関心度を「自分から状況を聞きに来るか」で付け直す。全員が最重要なら、誰にも十分な時間を割けない。',
        en: 'Re-rate influence by "can this person stop the plan" and interest by "do they come asking for status". If everyone is top priority, nobody gets enough of your time.',
      },
    });
  }
  if (groups.monitor.length === people.length) {
    findings.push({
      severity: 'medium',
      subject: inline('全体', 'Overall', lang),
      issue: { ja: '全員が「監視」象限にいる', en: 'Everyone falls into the "monitor" quadrant' },
      recommendation: {
        ja: '評価が低すぎるか、本当の関係者がまだ登録されていない。決裁者と業務側の責任者を追加する。',
        en: 'Either the ratings are too low or the real stakeholders are missing. Add the decision-maker and the business-side owner.',
      },
    });
  }
  out.push(...renderFindings(findings, lang));

  // --- 解釈と次の一手 ---
  out.push(`## ${inline('解釈と次の一手', 'How to read this and what to do next', lang)}`);
  out.push('');
  const reading: Bilingual[] = [];
  reading.push({
    ja: `登録 ${people.length} 名 — 密に関与 ${groups.manageClosely.length} / 満足を維持 ${groups.keepSatisfied.length} / 情報提供 ${groups.keepInformed.length} / 監視 ${groups.monitor.length}。`,
    en: `${people.length} stakeholders — manage closely ${groups.manageClosely.length}, keep satisfied ${groups.keepSatisfied.length}, keep informed ${groups.keepInformed.length}, monitor ${groups.monitor.length}.`,
  });
  if (groups.keepSatisfied.length > 0) {
    reading.push({
      ja: '「満足を維持」の層が最も事故になりやすい層です。影響力が大きいのに関心が低いため、意思決定の直前に初めて中身を見て反対する、という形で表面化します。節目の前に個別に当てておいてください。',
      en: 'The "keep satisfied" group is where surprises come from: high influence, low attention, so they first look at the content right before a decision and object. Brief them individually ahead of each milestone.',
    });
  }
  if (groups.keepInformed.length > 0) {
    reading.push({
      ja: '「情報提供」の層は現場の実態を最もよく知っています。要件の抜けを見つける相手として使うと、後戻りが減ります。',
      en: 'The "keep informed" group knows day-to-day reality best. Using them to find requirement gaps cuts rework later.',
    });
  }
  if (conflicts.length > 0) {
    reading.push({
      ja: `関心事の突き合わせで、対立しうる論点が ${conflicts.length} 件出ています(うち確度が高いもの ${conflicts.filter((c) => c.confidence === 'likely').length} 件)。対立は要件の優先順位を決める段階までに裁いておかないと、成果物のレビューのたびに同じ議論が戻ってきます。`,
      en: `${conflicts.length} potential point(s) of conflict came out of the concern comparison (${conflicts.filter((c) => c.confidence === 'likely').length} of them likely). Unless they are arbitrated before requirements are prioritized, the same argument returns at every deliverable review.`,
    });
  } else if (people.length >= 2) {
    reading.push({
      ja: '関心事からは対立が検出されませんでした。ただし対立が無いという証明にはなりません。関心事が当たり障りのない書き方(「全体最適の実現」など)になっていると、対立は文言に現れません。本人の言葉のまま、困っていることを書き取ってください。',
      en: 'No conflict came out of the concerns, which is not evidence that none exists. Concerns written in safe, abstract language ("achieve enterprise-wide optimization") hide every disagreement. Write down what each person actually complains about, in their words.',
    });
  }
  reading.push({
    ja: 'この配置は固定ではありません。スコープの拡大、体制変更、予算削減のたびに人の位置は動きます。フェーズの切り替え時に見直してください。',
    en: 'These positions are not fixed. Scope growth, reorganizations, and budget cuts all move people. Re-check at each phase boundary.',
  });
  out.push(bullets(reading, lang));
  out.push('');
  out.push(`### ${inline('次の一手', 'Next steps', lang)}`);
  out.push('');
  out.push(
    bullets(
      [
        {
          ja: '象限ごとの方針を各人の approach として `update_engagement` に書き戻し、担当者を割り当てる。',
          en: 'Write the per-quadrant approach back into each person’s approach field via `update_engagement`, and assign who owns the relationship.',
        },
        {
          ja: '関心事を成果物の記述内容に対応付ける(誰の関心に、どの図・どの章で答えるか)。',
          en: 'Map each concern to where it is answered (which view, which section of which deliverable).',
        },
        {
          ja: '検出された対立(または上の観点で自分が見つけた対立)を `update_engagement` の decisions に「未決」で登録し、裁定者と期限を入れる。',
          en: 'Record each detected conflict — or each one you found using the lenses above — as an open decision via `update_engagement`, with an arbiter and a date.',
        },
        {
          ja: '報告頻度・形式・担当を一覧にしてコミュニケーション計画としてまとめる。',
          en: 'Collect the cadence, format, and owner per stakeholder into a communications plan.',
        },
      ],
      lang,
    ),
  );
  out.push('');
  out.push(
    ...referenceSection(
      [
        techniquePointer('stakeholder-management', lang),
        deliverablePointer('stakeholder-map', lang),
        deliverablePointer('communications-plan', lang),
      ],
      lang,
    ),
  );

  return textResult(out.join('\n'));
}

// ---------------------------------------------------------------------------
// 4/5. assess_maturity / assess_readiness — 評価
// ---------------------------------------------------------------------------

interface DefaultFactor {
  name: Bilingual;
  /** 何を見るか */
  description: Bilingual;
  /** 差が大きいときの改善のヒント */
  hint: Bilingual;
}

/** EA 実践の成熟度を測る既定因子(独自の因子セット) */
const MATURITY_FACTORS: DefaultFactor[] = [
  {
    name: { ja: 'ガバナンスと決定の場', en: 'Governance and decision forum' },
    description: {
      ja: 'アーキテクチャ上の決定を、誰がどこで下し、逸脱をどう扱うかが決まっているか',
      en: 'Whether it is settled who decides architecture matters, where, and how deviations are handled',
    },
    hint: {
      ja: '会議体を増やす前に、既存の投資判断・設計レビューの場に「アーキテクチャ観点の議題」を 1 つ差し込むほうが早い。逸脱時の扱い(期限付き許容)を先に決める。',
      en: 'Rather than adding a new board, insert one architecture item into the existing investment or design review. Decide up front how deviations are handled (time-boxed exceptions).',
    },
  },
  {
    name: { ja: '手法のテーラリング', en: 'Method tailoring' },
    description: {
      ja: 'ADM を自組織の規模・文化・調達方式に合わせて調整し、実際に回せているか',
      en: 'Whether the ADM is tailored to the organization’s size, culture, and procurement style and actually runs',
    },
    hint: {
      ja: '全フェーズを厳密にやろうとして止まる例が多い。案件規模別に「必ずやる成果物」を 3 つに絞った軽量版を先に定義する。',
      en: 'Trying to run every phase in full is where teams stall. Define a light version first: three mandatory deliverables per engagement size.',
    },
  },
  {
    name: { ja: '現行・目標の記述と最新性', en: 'Baseline and target descriptions kept current' },
    description: {
      ja: '現行と目標のアーキテクチャが記述され、古くならずに参照されているか',
      en: 'Whether baseline and target architectures are documented, current, and actually referenced',
    },
    hint: {
      ja: '全体を最新に保とうとすると必ず腐る。変更が入る領域だけを更新対象にし、更新の引き金(リリース・調達)に紐づける。',
      en: 'Keeping everything current always rots. Limit updates to areas that change, and tie updates to triggers such as releases or procurements.',
    },
  },
  {
    name: { ja: 'リポジトリと再利用', en: 'Repository and reuse' },
    description: {
      ja: '成果物が集約され、次の案件で実際に再利用されているか',
      en: 'Whether deliverables are collected in one place and genuinely reused on the next engagement',
    },
    hint: {
      ja: '置き場所より「探し方」が問題であることが多い。分類より、案件別に「最初に読む 1 枚」を決めるほうが再利用が進む。',
      en: 'The problem is usually findability, not storage. Naming one "read this first" page per engagement beats elaborate taxonomies.',
    },
  },
  {
    name: { ja: '事業戦略との結び付き', en: 'Link to business strategy' },
    description: {
      ja: 'アーキテクチャ活動が事業目標・投資判断と結び付いているか',
      en: 'Whether architecture work connects to business goals and investment decisions',
    },
    hint: {
      ja: '事業計画の言葉(売上・コスト・リードタイム)に翻訳できていない資料は読まれない。1 つの目標に対する寄与を 1 行で書く練習から始める。',
      en: 'Material that is not translated into business language (revenue, cost, lead time) does not get read. Start by writing one line on the contribution to one goal.',
    },
  },
  {
    name: { ja: '体制とスキル', en: 'People and skills' },
    description: {
      ja: '担当する人数・力量・育成の仕組みが、扱う範囲に見合っているか',
      en: 'Whether headcount, capability, and development match the scope being covered',
    },
    hint: {
      ja: '人を増やす前に扱う範囲を絞るほうが現実的。優先領域を 1〜2 に限定し、そこだけ深く見る体制にする。',
      en: 'Narrowing scope is more realistic than adding headcount. Limit to one or two priority areas and cover those properly.',
    },
  },
  {
    name: { ja: 'ツールと現況の把握', en: 'Tooling and visibility of the estate' },
    description: {
      ja: '構成情報の管理・可視化・現況取得がどれだけ手作業から離れているか',
      en: 'How far inventory, visualization, and current-state discovery have moved off manual effort',
    },
    hint: {
      ja: '高機能なツールより、既にある台帳(資産管理・監視・課金)を突き合わせるほうが早く効く。手入力の台帳は必ずずれる。',
      en: 'Reconciling existing sources (asset management, monitoring, billing) beats buying a sophisticated tool. Hand-maintained inventories always drift.',
    },
  },
  {
    name: { ja: '効果の測定', en: 'Measuring the value delivered' },
    description: {
      ja: 'アーキテクチャ活動の効果を測り、次の判断に使えているか',
      en: 'Whether the effect of architecture work is measured and fed back into decisions',
    },
    hint: {
      ja: '測る指標を後から作ると必ず有利な数字になる。着手時に「この案件で何が下がれば成功か」を 1 つ決めて記録しておく。',
      en: 'Metrics invented afterwards always flatter the result. At kickoff, fix one number that must go down for the work to count as successful.',
    },
  },
];

/** 変革準備度を測る既定因子(独自の因子セット) */
const READINESS_FACTORS: DefaultFactor[] = [
  {
    name: { ja: '経営の意思とスポンサー', en: 'Executive intent and sponsorship' },
    description: {
      ja: '変革を主導する経営層が居て、抵抗が出たときに前へ出るか',
      en: 'Whether an executive owns the change and will step forward when resistance appears',
    },
    hint: {
      ja: 'スポンサーが名目だけの場合、最初の対立で計画が止まる。着手前に「揉めたときに何を判断してもらうか」を具体的に握る。',
      en: 'A sponsor in name only means the plan halts at the first conflict. Before starting, agree specifically what they will rule on when it gets contested.',
    },
  },
  {
    name: { ja: '予算の確保', en: 'Funding commitment' },
    description: {
      ja: '複数年にわたる費用が、単年度の思いつきではなく計画として確保されているか',
      en: 'Whether multi-year cost is committed as a plan rather than a single-year impulse',
    },
    hint: {
      ja: '初年度だけ付いた予算で始める変革は、中間状態で止まって最悪の形(二重運用)で固定化する。最低限、中間の到達点までの費用を確保する。',
      en: 'A transformation funded only for year one freezes mid-way in the worst shape: dual operation. Secure funding at least to the first interim state.',
    },
  },
  {
    name: { ja: '推進体制と権限', en: 'Change organization and authority' },
    description: {
      ja: '専任の推進役が居て、部門をまたいで決められる権限があるか',
      en: 'Whether dedicated change leads exist with authority that crosses departments',
    },
    hint: {
      ja: '兼任だけの体制は、通常業務が忙しくなった瞬間に止まる。工数の何割を割くかを人事上の合意として取る。',
      en: 'A team of part-timers stops the moment day-to-day work spikes. Get the percentage of their time agreed as a staffing commitment.',
    },
  },
  {
    name: { ja: 'スキルと経験', en: 'Skills and experience' },
    description: {
      ja: '目標状態を作り、運用するために必要な技術・業務知識が組織内にあるか',
      en: 'Whether the technical and domain skills to build and run the target state exist in-house',
    },
    hint: {
      ja: '外部調達で埋める場合、引き継ぎ先が居ないと運用開始後に破綻する。内製化の対象範囲を先に決めてから調達する。',
      en: 'If you buy the skills in, decide who takes them over first; otherwise it breaks once operations start. Fix what stays in-house before contracting.',
    },
  },
  {
    name: { ja: '過去の変革実績', en: 'Track record of past change' },
    description: {
      ja: '過去に同規模の変革をやり切った経験があり、その学びが残っているか',
      en: 'Whether the organization has finished a change of similar size and kept what it learned',
    },
    hint: {
      ja: '失敗の記憶が強い組織では、計画の正しさより「今回は何が違うのか」の説明が効く。前回止まった原因を 1 つ挙げ、対処を明示する。',
      en: 'Where past failure is fresh, explaining what is different this time beats arguing the plan is correct. Name one reason the last attempt stopped and how it is handled now.',
    },
  },
  {
    name: { ja: '業務部門の受容度', en: 'Acceptance by the business' },
    description: {
      ja: '業務のやり方が変わることを現場が受け入れられる状態にあるか',
      en: 'Whether the front line can absorb a change to how the work is done',
    },
    hint: {
      ja: '反対の正体は「不便になる」ではなく「評価が下がる」であることが多い。移行期の評価・目標をどう扱うかを人事側と決める。',
      en: 'Objections are usually about performance ratings, not inconvenience. Settle with HR how targets and appraisals work during the transition.',
    },
  },
  {
    name: { ja: '変革の必要性の共有', en: 'Shared sense of necessity' },
    description: {
      ja: 'なぜ今変えるのかが、経営から現場まで同じ言葉で語られているか',
      en: 'Whether why-now is told in the same words from the executive floor to the front line',
    },
    hint: {
      ja: '説明資料を増やすより、現場が実際に困っている事象を 1 つ選び、それが解消される形で語るほうが伝わる。',
      en: 'Rather than more slides, pick one problem the front line actually suffers and frame the change as removing it.',
    },
  },
  {
    name: { ja: 'IT 環境の変更容易性', en: 'Ability to change the IT estate' },
    description: {
      ja: '既存システムに手を入れられる状態か(構成情報・テスト環境・保守契約)',
      en: 'Whether existing systems can actually be changed (inventory, test environments, support contracts)',
    },
    hint: {
      ja: '変更できない理由が「技術」ではなく「保守契約と検証環境の不足」であることは多い。着手前に契約と環境を点検する。',
      en: 'The blocker is often support contracts and missing test environments rather than technology. Audit contracts and environments before starting.',
    },
  },
];

interface FactorInput {
  name: string;
  /** 判断できなかった場合は null(評点を付けずに「判断材料なし」として扱う) */
  current: number | null;
  target: number;
  note?: string;
  source?: string;
  confidence?: string;
}

/**
 * 「この資料からは判断できない」因子 / A factor the material at hand cannot answer.
 *
 * 実測された問題: 根拠が無い因子にも評点が付き、その評点が平均に入って
 * **誤った結論**(「準備度 68%、条件付きで着手可」など)を出していた。
 * 判断できないことは 0 点でも 3 点でもない。評点とは別の状態として持ち、
 * 総合判定から外したうえで、外したこと自体を必ず本文に書く。
 */
interface UndeterminedFactor extends Provenance {
  name: string;
  target: number;
  /** なぜ判断できないのか(どの資料に無かったのか) */
  note?: string;
}

/**
 * 因子に付いた出典を `Provenance` に整える。
 * 呼び出し前に `checkProvenance` を通してあるので投げないが、
 * ツールハンドラから例外を出さない決まりなので受け止めておく。
 */
function sanitizeFactorProvenance(f: { source?: unknown; confidence?: unknown }): Provenance {
  try {
    return normalizeProvenance(f);
  } catch {
    return {};
  }
}

interface AssessmentInput {
  factors?: FactorInput[];
  scale: number;
  save: boolean;
  title?: string;
  lang: string;
}

const ASSESSMENT_INTRO: Record<AssessmentKind, Bilingual> = {
  maturity: {
    ja: 'EA 実践がどこまで組織に根付いているかを因子ごとに測ります。点数そのものより、「どの因子が足を引っ張っているか」と「その差が事業にどう効くか」を読むための道具です。',
    en: 'Measures how far EA practice has taken root, factor by factor. The score matters less than which factor holds the rest back and what that costs the business.',
  },
  readiness: {
    ja: '変革に着手できる状態かを因子ごとに測ります。準備度が低い因子は、計画の巧拙に関係なく変革を止める要因になるため、着手前の手当てが要ります。',
    en: 'Measures whether the organization can start the change. A weak factor stops a transformation regardless of how good the plan is, so it needs handling before kickoff.',
  },
};

const GENERIC_HINT: Record<AssessmentKind, Bilingual> = {
  maturity: {
    ja: '差の原因を「決め事が無い」「決めたが守られていない」「人手が足りない」のどれかに切り分ける。原因が違えば打ち手も費用も変わる。',
    en: 'Separate the cause into "no rule exists", "the rule is ignored", or "not enough people". The remedy and its cost differ for each.',
  },
  readiness: {
    ja: '不足の原因を「意思」「資源」「能力」のどれかに切り分け、着手前に埋める手当てを決める。埋まらないなら、その範囲は今回のスコープから外す。',
    en: 'Separate the shortfall into intent, resources, or capability, and decide how it is closed before kickoff. If it cannot be closed, take that area out of scope.',
  },
};

function defaultFactorsFor(kind: AssessmentKind): DefaultFactor[] {
  return kind === 'maturity' ? MATURITY_FACTORS : READINESS_FACTORS;
}

// ---------------------------------------------------------------------------
// 評点帯 / Score bands
//
// 因子ごとの推奨は「因子名」だけでは決めない。評点・ギャップ幅・利用者が書いた
// note を見て変える。評点から組織の内情を断定しないよう、文面は条件付きにする。
// ---------------------------------------------------------------------------

type FactorBand = 'bottleneck' | 'act' | 'watch' | 'lowCeiling' | 'strength';

const BAND_LABEL: Record<FactorBand, Bilingual> = {
  bottleneck: { ja: '最も低い水準帯', en: 'Lowest band' },
  act: { ja: '差が大きい(先に手当て)', en: 'Wide gap (handle first)' },
  watch: { ja: '差は小さい(監視対象)', en: 'Small gap (watch item)' },
  lowCeiling: { ja: '低い水準のまま現状維持', en: 'Held low by the target' },
  strength: { ja: '強み(目標に到達)', en: 'Strength (at or above target)' },
};

const BAND_MARK: Record<FactorBand, string> = {
  bottleneck: '!!',
  act: '!',
  watch: '·',
  lowCeiling: '?',
  strength: '+',
};

const BAND_RANK: Record<FactorBand, number> = {
  bottleneck: 0,
  act: 1,
  watch: 2,
  lowCeiling: 3,
  strength: 4,
};

interface ScoredFactor {
  factor: AssessmentFactor;
  gap: number;
  band: FactorBand;
  /** 評点が尺度の高い側にあるか(高い側には「できていない前提」の助言を出さない) */
  highSide: boolean;
}

/** 評点帯の判定に使う閾値(尺度に合わせて動かす) */
function bandThresholds(scale: number): { low: number; bigGap: number; high: number } {
  return {
    low: Math.max(1, Math.floor(scale * 0.25)),
    bigGap: Math.max(2, Math.round(scale * 0.4)),
    high: scale * 0.7,
  };
}

function scoreFactors(factors: AssessmentFactor[], scale: number): ScoredFactor[] {
  const t = bandThresholds(scale);
  return factors.map((factor) => {
    const gap = factor.target - factor.current;
    // 尺度が 2〜3 のときに中央値まで「低い」と判定しないよう、半分未満であることも条件にする
    const isLow = factor.current <= t.low && factor.current < scale / 2;
    const band: FactorBand = isLow
      ? gap > 0
        ? 'bottleneck'
        : 'lowCeiling'
      : gap <= 0
        ? 'strength'
        : gap >= t.bigGap
          ? 'act'
          : 'watch';
    return { factor, gap, band, highSide: factor.current >= t.high };
  });
}

/** 評点帯ごとの読み(評点とギャップの実数を必ず本文に入れる) */
function bandReading(kind: AssessmentKind, sf: ScoredFactor, scale: number): Bilingual {
  const c = round1(sf.factor.current);
  const t = round1(sf.factor.target);
  const g = round1(sf.gap);
  switch (sf.band) {
    case 'bottleneck':
      return {
        ja: `現在 ${c}/${scale} はこの評価の中で最も低い水準帯です。この帯の因子は、他を上げても全体の足を引っ張り続ける場合が多く、放置したまま進めると後工程で計画側の変更として跳ね返ります。今期はここに取り組みを 1 つだけ置き、担当・期限・「何ができたら 1 段上がったと言えるか」を各 1 行で決めてください。`,
        en: `At ${c} of ${scale} this is the lowest band in this assessment. Factors here tend to keep holding everything else back however far the others rise, and leaving it alone usually returns later as a change to the plan. Put exactly one piece of work against it this period, with an owner, a date, and one line saying what counts as having moved up a level.`,
      };
    case 'act':
      return kind === 'readiness'
        ? {
            ja: `差は +${g}(${c} → ${t})で、着手前に手当てを決めておきたい幅です。この幅の因子は、計画の巧拙に関係なく変革の途中で制約として表面化し、そのときは計画側を削って吸収することになります。着手前に「誰が・いつまでに・いくらで埋めるか」を決めるか、埋められないならこの因子に依存する範囲を今回のスコープから外すかを、先に選んでください。`,
            en: `The gap is +${g} (${c} → ${t}), wide enough to need a remedy before kickoff. Gaps this size tend to surface mid-change as a constraint regardless of how good the plan is, and the plan is what gets cut to absorb it. Decide now who closes it, by when, and at what cost — or take the areas that depend on this factor out of scope.`,
          }
        : {
            ja: `差は +${g}(${c} → ${t})で、今期の重点候補です。全因子を均等に上げようとすると、どれも 1 段上がらずに終わる場合が多いので、この因子に資源を寄せ、1 段だけ上げる取り組みを 1 つ決めてください。`,
            en: `The gap is +${g} (${c} → ${t}), which makes it a candidate for this period's focus. Lifting every factor evenly usually ends with none of them moving a full level, so concentrate resource here and define one piece of work that raises this factor by one level.`,
          };
    case 'watch':
      return {
        ja: `差は +${g}(${c} → ${t})と小さく、着手前の必須課題ではありません。ただし差が小さい因子は「もう少しで届く」と判断されて後回しになりやすく、他の負荷が上がったときに最初に落ちます。監視対象として、四半期ごとに同じ人が付け直し、下がっていないかだけ見てください。`,
        en: `The gap is small at +${g} (${c} → ${t}), so this is not a blocker before kickoff. Small gaps do get postponed on the grounds that they are nearly there, and they are the first thing to slip when load rises elsewhere. Keep it as a watch item: have the same person re-score it each quarter and check only that it has not fallen.`,
      };
    case 'lowCeiling':
      return {
        ja: `現在 ${c} に対して目標 ${t} — 低い水準のまま現状維持の設定になっています。今回は扱わないと決めているならこのままで構いません。そうでない場合は目標の置き忘れの可能性があるので、到達したい水準を置き直してください。扱わないと決めた場合は、その理由を 1 行残しておくと、後から「なぜ手を付けなかったのか」を説明できます。`,
        en: `Current ${c} against a target of ${t} — the target holds this factor where it already is, at a low level. That is fine if you have decided not to touch it this time. If not, the target was probably never revisited; set it to the level you intend to reach. If it really is out of scope, leave one line saying why, so the decision can be explained later.`,
      };
    case 'strength':
      return {
        ja: `現在 ${c} が目標 ${t} に届いています。ここは相対的な強みとして扱え、他因子を引き上げる梃子に使えます(この因子で機能している進め方・体制・会議体を、差の大きい因子にそのまま横展開する)。強みは放置すると落ちるので、「誰が何を続けることで維持されているか」を 1 行だけ残しておくと、体制変更のときに守れます。`,
        en: `Current ${c} meets the target of ${t}. Treat this as a relative strength and use it as leverage: take whatever works here — the cadence, the people, the forum — and apply it to the factors with wide gaps. Strengths decay when ignored, so write one line on who keeps it working, and it survives the next reorganisation.`,
      };
  }
}

/** 利用者が書いた note を推奨文の中で使う(書かれていなければ書くよう促す) */
function evidenceReading(kind: AssessmentKind, sf: ScoredFactor): Bilingual {
  const note = sf.factor.note && sf.factor.note.trim().length > 0 ? quote(sf.factor.note) : null;
  if (!note) {
    return {
      ja: '根拠(note)が空欄です。この評点は、いまのままでは他人に説明できません。実際に起きた事実を 1 行入れてください(人数・件数・期間・直近の出来事など)。評点の妥当性は数字ではなく根拠で決まります。',
      en: 'The note is empty, so this score cannot be explained to anyone else as it stands. Add one line of fact — headcount, counts, elapsed time, a recent event. A score is defended by its evidence, not by the number.',
    };
  }
  switch (sf.band) {
    case 'strength':
      return {
        ja: `根拠として「${note}」と書かれています。この状態が個人ではなく仕組みで支えられているか(担当者が代わっても残るか)を確認してください。人に紐づく強みは異動で消えます。`,
        en: `You recorded the evidence as "${note}". Check whether this rests on a mechanism rather than on individuals — whether it survives the people changing. A strength attached to a person leaves with them.`,
      };
    case 'bottleneck':
    case 'act':
      return kind === 'readiness'
        ? {
            ja: `根拠として「${note}」と書かれています。この記述が示す不足が「意思」「資源」「能力」のどれなのかを切り分けてください。切り分けが違うと、打ち手も費用も変わります。`,
            en: `You recorded the evidence as "${note}". Separate what it points to: intent, resources, or capability. The remedy and its cost differ for each.`,
          }
        : {
            ja: `根拠として「${note}」と書かれています。この記述が「決め事が無い」「決めたが守られていない」「人手が足りない」のどれに当たるかを切り分けてください。原因が違えば打ち手も費用も変わります。`,
            en: `You recorded the evidence as "${note}". Sort it into one of three: no rule exists, the rule is ignored, or there are not enough people. The remedy and its cost differ for each.`,
          };
    default:
      return {
        ja: `根拠として「${note}」と書かれています。変革の途中でこの前提(人員・契約・体制)が崩れないかを見てください。崩れたときに真っ先に落ちるのがこの帯の因子です。`,
        en: `You recorded the evidence as "${note}". Watch whether those premises — staffing, contracts, structure — still hold mid-change. Factors in this band are the first to fall when they do not.`,
      };
  }
}

/** 入力された因子名から既定因子を引く(完全一致 → 部分一致) */
function findDefaultFactor(name: string, set: DefaultFactor[]): DefaultFactor | undefined {
  const key = normalizeName(name);
  const exact = set.find((f) => normalizeName(f.name.ja) === key || normalizeName(f.name.en) === key);
  if (exact) return exact;
  if (key.length < 3) return undefined;
  return set.find((f) => {
    const ja = normalizeName(f.name.ja);
    const en = normalizeName(f.name.en);
    return key.includes(ja) || ja.includes(key) || key.includes(en) || en.includes(key);
  });
}

/** 因子未指定のとき、既定の因子セットを提示して評価を促す */
function renderFactorTemplate(kind: AssessmentKind, scale: number, lang: Lang): string {
  const set = defaultFactorsFor(kind);
  const out: string[] = [];
  out.push(`# ${label(ASSESSMENT_KIND_LABEL[kind], lang)}`);
  out.push('');
  out.push(text(ASSESSMENT_INTRO[kind], lang));
  out.push('');
  out.push(
    msg(
      `因子が指定されていないため、既定の因子セット(${set.length} 件)を提示します。0〜${scale} で現在(current)と目標(target)を付けて、もう一度このツールを呼んでください。判断できない因子は current に null を渡してください(その因子は総合判定から外し、「判断材料なし」として別に示します)。`,
      `No factors were supplied, so here is the default set (${set.length} factors). Rate current and target from 0 to ${scale} and call this tool again. For any factor you cannot judge, pass null for current — it is then excluded from the overall verdict and listed separately as undetermined.`,
      lang,
    ),
  );
  out.push('');
  out.push(`| # | ${label(L.factor, lang)} | ${inline('何を見るか', 'What to look at', lang)} |`);
  out.push('| :-: | --- | --- |');
  set.forEach((f, i) => {
    out.push(`| ${i + 1} | ${cell(text(f.name, lang))} | ${cell(text(f.description, lang))} |`);
  });
  out.push('');
  out.push(`## ${inline('評点の目安', 'How to score', lang)}`);
  out.push('');
  // 尺度が 4 未満だと中間の目安が端の値と重なるため、目安の刻みを変える
  const scoreAnchors: Bilingual =
    scale >= 4
      ? {
          ja: `0 = まったく無い / 1 = 個人の努力に依存 / ${Math.round(scale / 2)} 前後 = 決まってはいるが例外が多い / ${scale - 1} = 定着して回っている / ${scale} = 測って改善まで回っている`,
          en: `0 = absent; 1 = depends on individuals; around ${Math.round(scale / 2)} = defined but frequently bypassed; ${scale - 1} = established and running; ${scale} = measured and continuously improved`,
        }
      : {
          ja: `0 = まったく無い / ${scale - 1} = 決まってはいるが例外が多い / ${scale} = 定着し、測って改善まで回っている(${scale} 段階の尺度なので中間の目安は置いていません。細かく見たい場合は scale を 5 前後にしてください)`,
          en: `0 = absent; ${scale - 1} = defined but frequently bypassed; ${scale} = established, measured, and improving (a ${scale}-point scale leaves no room for intermediate anchors; use a scale of about 5 if you need finer steps)`,
        };
  out.push(
    bullets(
      [
        scoreAnchors,
        {
          ja: '目標は「理想」ではなく「次の 12〜18 か月で到達したい水準」を入れる。全因子を最高値にした目標は計画として使えない。',
          en: 'Set the target to where you intend to be in 12–18 months, not to the ideal. A target of maximum everywhere cannot be planned against.',
        },
        {
          ja: '現在の評点は、複数人に別々に付けてもらうと差が出る。その差自体が実態を語る。',
          en: 'Have several people score current levels independently. The spread between them is itself informative.',
        },
        {
          ja: '手元の資料からその因子を判断できないときは、current に **null** を渡す(0 ではない)。0 は「無い」という判断、null は「判断していない」。null にした因子は総合判定から外され、「判断材料なし」として別に出る。',
          en: 'When the material at hand does not let you judge a factor, pass **null** for current — not 0. Zero is a finding ("there is none"); null is the absence of one. Factors set to null are excluded from the overall verdict and listed separately as undetermined.',
        },
        {
          ja: '評点の根拠が資料にあるなら source に出典(例: "security-report.pdf p.17")を、その出典が本文の記載か自分の推測かを confidence に入れる。出典のある評点だけが、次に測る人に引き継げる。',
          en: 'When the score comes from a document, put the reference in source (e.g. "security-report.pdf p.17") and say in confidence whether it is stated there or inferred. Only sourced scores survive a change of assessor.',
        },
      ],
      lang,
    ),
  );
  out.push('');
  out.push(`## ${inline('呼び出し例', 'Example call', lang)}`);
  out.push('');
  out.push('```json');
  out.push(
    JSON.stringify(
      {
        scale,
        factors: [
          // source が空のまま confidence: "stated" を例に出さない。
          // stated は「原文を指させる」という意味なので、出典が空の stated は
          // それ自体が矛盾で、この雛形をそのまま貼れば「出所不明を確認済みとして
          // 登録する」ことになる。空欄のときは confidence ごと省く(省略時は
          // 未設定のまま保存され、stated には決してならない)。
          ...set.slice(0, 2).map((f) => ({
            name: lang === 'en' ? f.name.en : f.name.ja,
            current: 2,
            target: 4,
            note: '',
            source: '',
          })),
          // 3 件目は「判断できなかった」例。null は 0 の代わりではないことを見せる
          ...set.slice(2, 3).map((f) => ({
            name: lang === 'en' ? f.name.en : f.name.ja,
            current: null,
            target: 4,
            note:
              lang === 'en'
                ? 'The material at hand says nothing about this; ask the IT planning lead.'
                : '手元の資料に記載が無い。情報システム部門の企画担当に確認する。',
            source: '',
            confidence: 'unknown',
          })),
        ],
      },
      null,
      2,
    ),
  );
  out.push('```');
  out.push('');
  out.push(
    msg(
      '3 件目は「判断できなかった」書き方の例です(current が null)。適当な評点を置くより、null にして note に「なぜ判断できないか」を書くほうが、評価全体の信頼度が上がります。',
      'The third entry shows how to say "I could not judge this" (current is null). Setting null and writing why in note makes the whole assessment more trustworthy than guessing a score.',
      lang,
    ),
  );
  out.push('');
  out.push(
    msg(
      '因子は自由に差し替えて構いません。自組織で議論になっている論点を因子にしたほうが、評価結果が使われます。',
      'Feel free to replace the factors. Assessments get used when the factors match what the organization actually argues about.',
      lang,
    ),
  );
  out.push('');
  out.push(
    ...referenceSection(
      kind === 'maturity'
        ? [techniquePointer('architecture-maturity', lang), techniquePointer('architecture-governance', lang)]
        : [
            techniquePointer('business-transformation-readiness', lang),
            techniquePointer('capability-based-planning', lang),
          ],
      lang,
    ),
  );
  return out.join('\n');
}

/**
 * 因子名を本文中に並べる。名前は 1 件 300 字まで入るので、件数と長さの両方を切る
 * (切らないと 100 因子 × 300 字がそのまま本文に出る)。
 */
function factorNames(items: readonly { name: string }[], l: 'ja' | 'en', max = 8): string {
  const shown = items.slice(0, max).map((f) => capCell(f.name, 60));
  const rest =
    items.length > max ? (l === 'en' ? ` and ${items.length - max} more` : ` ほか ${items.length - max} 件`) : '';
  return `${shown.join(l === 'en' ? ', ' : '、')}${rest}`;
}

/**
 * 「判断できなかった」因子の節。
 *
 * これを出さずに評点だけ返すと、**判断していないこと**が結果から消える。
 * 消えた瞬間、読んだ人はそれを「問題なし」と受け取る。件数・因子名・理由・出典を必ず出す。
 */
function renderUndetermined(
  kind: AssessmentKind,
  undetermined: UndeterminedFactor[],
  totalFactors: number,
  measuredCount: number,
  scale: number,
  lang: Lang,
): string[] {
  const out: string[] = [];
  if (undetermined.length === 0) return out;
  out.push(`## ${inline('判断できなかった因子', 'Factors that could not be judged', lang)} (${undetermined.length})`);
  out.push('');
  out.push(
    msg(
      measuredCount > 0
        ? `${totalFactors} 因子のうち ${undetermined.length} 因子は、判断材料が無いため評点を付けていません。上の平均・到達度・総合判定は、残る ${measuredCount} 因子だけで出した数字です。`
        : `${totalFactors} 因子すべてに判断材料がなく、評点を付けていません。平均も到達度も総合判定も出していません。`,
      measuredCount > 0
        ? `${undetermined.length} of the ${totalFactors} factors carry no score because there was nothing to judge from. The averages, the progress figure, and the verdict above rest on the other ${measuredCount}.`
        : `None of the ${totalFactors} factors could be judged, so no score was given and no average, progress figure, or verdict was produced.`,
      lang,
    ),
  );
  out.push('');
  const shown = capRows(undetermined);
  out.push(
    `| ${label(L.factor, lang)} | ${label(L.target, lang)} | ${inline('なぜ判断できないか', 'Why it could not be judged', lang)} | ${inline('出典', 'Source', lang)} |`,
  );
  out.push('| --- | --- | --- | --- |');
  for (const f of shown.rows) {
    out.push(
      [
        '',
        cell(f.name),
        `\`${bar(f.target, scale)}\` ${round1(f.target)}`,
        cell(capCell(f.note ?? '')) ||
          `**${inline('理由が未記入', 'reason not recorded', lang)}**`,
        sourceCell(f, lang),
        '',
      ].join(' | ').trim(),
    );
  }
  if (shown.capped) {
    out.push('');
    out.push(
      `_${capNotice(
        shown,
        {
          ja: '判断できなかった因子は入力順。全件見るには因子の数を減らして分けて呼ぶ。',
          en: 'Undetermined factors in input order. Split the call into smaller factor sets to see them all.',
        },
        lang,
      )}_`,
    );
  }
  out.push('');
  const noReason = undetermined.filter((f) => !(f.note && f.note.trim().length > 0));
  const reading: Bilingual[] = [];
  reading.push({
    ja: '「判断できない」は評価の失敗ではなく、次にやる作業です。因子ごとに「誰に聞けば分かるか」または「どの資料を見れば分かるか」を 1 行決めて、期限付きのアクションとして `update_engagement` の actions に登録してください。',
    en: 'Not being able to judge is not a failed assessment; it is the next piece of work. For each factor decide in one line who to ask or which document to read, then record it as a dated action via `update_engagement`.',
  });
  if (noReason.length > 0) {
    reading.push({
      ja: `理由(note)が書かれていない因子が ${noReason.length} 件あります: ${factorNames(noReason, 'ja')}。理由が無いと、次に測る人が同じところで再び止まります。「どの資料のどこに無かったのか」を 1 行入れてください。`,
      en: `${noReason.length} of them have no reason recorded: ${factorNames(noReason, 'en')}. Without it the next assessor stops at the same place. Write one line on where you looked and what was missing.`,
    });
  }
  if (measuredCount > 0 && undetermined.length >= measuredCount) {
    reading.push({
      ja: `判定できた因子(${measuredCount})より判断できなかった因子(${undetermined.length})のほうが多い状態です。この評価は現状の把握には使えますが、着手可否や投資判断の根拠には使えません。判断材料を集めてから測り直してください。`,
      en: `More factors are undetermined (${undetermined.length}) than judged (${measuredCount}). This assessment can describe what you know, but it cannot support a go/no-go or an investment decision. Gather the missing material and re-measure.`,
    });
  }
  reading.push(
    kind === 'readiness'
      ? {
          ja: '判断できない因子は、変革リスクではなく「調べる」作業です。リスクとして登録すると、調べれば消えるものが対策付きの課題として残り続けます。',
          en: 'An undetermined factor is an investigation task, not a transformation risk. Logging it as a risk leaves something that a single question would have closed sitting on the register with a mitigation attached.',
        }
      : {
          ja: '判断できない因子が同じ場所に残り続ける場合、その因子は「測れない」のではなく「見ている人がいない」可能性があります。誰の担当なのかを先に決めてください。',
          en: 'When the same factor stays undetermined round after round, it is usually not unmeasurable — nobody owns it. Settle who owns it before trying to measure it again.',
        },
  );
  out.push(bullets(reading, lang));
  out.push('');
  return out;
}

function runAssessment(kind: AssessmentKind, input: AssessmentInput): ToolResult {
  const lang = input.lang as Lang;
  const scale = input.scale;
  const raw = input.factors ?? [];

  if (raw.length === 0) {
    return textResult(renderFactorTemplate(kind, scale, lang));
  }

  // --- 長さの上限(save=true だと案件 JSON に入るので、保存前にここで止める)---
  const tooLong = runChecks([
    () => checkText('title', input.title, 'title', lang),
    () => checkTextList('factors[].name', raw.map((f) => f.name), 'title', lang),
    () => checkTextList('factors[].note', raw.map((f) => f.note), 'text', lang),
  ]);
  if (tooLong) return limitErrorResult(tooLong, lang);

  // 出典の値そのものの検査(投げない入口を使う)
  const badProvenance = runChecks(raw.map((f, i) => () => checkProvenance(`factors[${i}]`, f, lang)));
  if (badProvenance) return errorResult(badProvenance);

  // --- 入力検証 ---
  const problems: string[] = [];
  raw.forEach((f, i) => {
    const position = `#${i + 1}${f.name ? ` (${f.name})` : ''}`;
    if (!f.name || f.name.trim().length === 0) {
      problems.push(inline(`${position}: 因子名が空です。`, `${position}: the factor name is empty.`, lang));
    }
    // current=null は「判断できない」の意思表示なので、範囲検査の対象外
    const checks: [string, number][] = [['target', f.target]];
    if (f.current !== null && f.current !== undefined) checks.push(['current', f.current]);
    for (const [key, value] of checks) {
      if (!Number.isFinite(value)) {
        problems.push(
          inline(
            `${position}: ${key} が数値ではありません。${key === 'current' ? '判断できない場合は null を渡してください(0 ではありません)。' : ''}`,
            `${position}: ${key} is not a number.${key === 'current' ? ' Pass null when you cannot judge it — not 0.' : ''}`,
            lang,
          ),
        );
      } else if (value < 0 || value > scale) {
        problems.push(
          inline(
            `${position}: ${key}=${value} は 0〜${scale} の範囲外です。`,
            `${position}: ${key}=${value} is outside the range 0–${scale}.`,
            lang,
          ),
        );
      }
    }
  });
  if (problems.length > 0) {
    return errorResult(
      [
        msg('入力に誤りがあります。', 'The input is invalid.', lang),
        '',
        ...problems.map((p) => `- ${p}`),
        '',
        msg(
          `評点は 0 以上 ${scale} 以下で指定してください(scale を変えたい場合は scale パラメータで指定します)。`,
          `Scores must be between 0 and ${scale}. Pass a different scale parameter if you need another range.`,
          lang,
        ),
      ].join('\n'),
    );
  }

  // --- 判定できた因子と、判断材料が無かった因子に分ける ---
  // ここが分かれていないと、根拠の無い因子の評点が平均に混ざり、
  // 「準備度 68%」のような**根拠の無い結論**が出る。
  const factors: AssessmentFactor[] = [];
  const undetermined: UndeterminedFactor[] = [];
  for (const f of raw) {
    const prov = sanitizeFactorProvenance(f);
    if (f.current === null || f.current === undefined) {
      undetermined.push({ name: f.name.trim(), target: f.target, note: f.note, ...prov });
    } else {
      factors.push({ name: f.name.trim(), current: f.current, target: f.target, note: f.note, ...prov });
    }
  }
  const totalFactors = raw.length;
  const measuredCount = factors.length;

  const defaults = defaultFactorsFor(kind);
  const gaps = factors.map((f) => f.target - f.current);
  const avgCurrent = measuredCount > 0 ? factors.reduce((a, f) => a + f.current, 0) / measuredCount : 0;
  const avgTarget = measuredCount > 0 ? factors.reduce((a, f) => a + f.target, 0) / measuredCount : 0;
  const achievement = avgTarget > 0 ? Math.round((avgCurrent / avgTarget) * 100) : 100;
  const maxGap = gaps.length > 0 ? Math.max(...gaps) : 0;
  const weakest = measuredCount > 0 ? factors.reduce((a, b) => (a.current <= b.current ? a : b)) : null;
  /** 変革リスクとして扱うギャップの目安 */
  const riskThreshold = Math.max(1, Math.round(scale * 0.3));
  /** 「N 因子中 M 因子で判定」の 1 行。除外があるときだけ後半を足す */
  const scopeLine: Bilingual = {
    ja:
      undetermined.length > 0
        ? `**${totalFactors} 因子中 ${measuredCount} 因子で判定**しました。残り ${undetermined.length} 因子は判断材料がなく、下の数字には入っていません。`
        : `${totalFactors} 因子すべてを判定しました(判断材料なしの因子はありません)。`,
    en:
      undetermined.length > 0
        ? `**Judged on ${measuredCount} of ${totalFactors} factors.** The other ${undetermined.length} had nothing to judge from and are not in the figures below.`
        : `All ${totalFactors} factors were judged; none were left undetermined.`,
  };

  const customTitle = input.title && input.title.trim().length > 0 ? input.title.trim() : null;
  // 保存する記録には必ず名前を持たせる(未指定なら評価種別をそのまま名前にする)
  const title = customTitle ?? label(ASSESSMENT_KIND_LABEL[kind], lang === 'both' ? 'ja' : lang);

  const out: string[] = [];
  out.push(`# ${label(ASSESSMENT_KIND_LABEL[kind], lang)}${customTitle ? `: ${customTitle}` : ''}`);
  out.push('');
  out.push(text(ASSESSMENT_INTRO[kind], lang));
  out.push('');
  out.push(
    inline(
      `評価尺度 0〜${scale} / 因子 ${totalFactors} 件`,
      `Scale 0–${scale}, ${totalFactors} factors`,
      lang,
    ),
  );
  out.push('');

  // --- 因子ごとの表 ---
  out.push(`## ${inline('因子ごとの評価', 'Factor scores', lang)}`);
  out.push('');
  out.push(
    `| ${label(L.factor, lang)} | ${label(L.current, lang)} | ${label(L.target, lang)} | ${label(L.gap, lang)} | ${label(L.note, lang)} | ${inline('出典', 'Source', lang)} |`,
  );
  out.push('| --- | --- | --- | :-: | --- | --- |');
  factors.forEach((f, i) => {
    out.push(
      [
        '',
        cell(f.name),
        `\`${bar(f.current, scale)}\` ${round1(f.current)}`,
        `\`${bar(f.target, scale)}\` ${round1(f.target)}`,
        gaps[i] > 0 ? `+${round1(gaps[i])}` : String(round1(gaps[i])),
        cell(f.note) || '',
        sourceCell(f, lang),
        '',
      ].join(' | ').trim(),
    );
  });
  // 判断できなかった因子も同じ表に出す。別の表にすると「無かったこと」になる
  for (const f of undetermined) {
    out.push(
      [
        '',
        cell(f.name),
        `**${inline('判断材料なし', 'undetermined', lang)}**`,
        `\`${bar(f.target, scale)}\` ${round1(f.target)}`,
        '—',
        cell(f.note) || '',
        sourceCell(f, lang),
        '',
      ].join(' | ').trim(),
    );
  }
  out.push('');
  if (undetermined.length > 0) {
    out.push(
      msg(
        `「判断材料なし」は評点 0 ではありません。0 は「無い」という判定、判断材料なしは「まだ判定していない」です。この ${undetermined.length} 件は下の平均・到達度・総合判定のいずれにも入っていません。`,
        `"Undetermined" is not a score of 0. Zero is a finding — there is none. Undetermined means no finding was made. These ${undetermined.length} are excluded from the averages, the progress figure, and the verdict below.`,
        lang,
      ),
    );
    out.push('');
  }
  out.push(provenanceLegend(lang));
  out.push('');

  // --- 判定できた因子が 1 件も無い場合 ---
  // ここで平均を出すと 0 除算になるだけでなく、「到達度 100%」のような
  // **測っていないのに測ったように見える数字**が出る。総合判定そのものを出さない。
  if (measuredCount === 0) {
    out.push(`## ${inline('総合', 'Overall', lang)}`);
    out.push('');
    out.push(
      msg(
        `**総合判定は出せません。** ${totalFactors} 因子すべてが「判断材料なし」です。平均も到達度も、判定できた因子が 1 件も無い以上、計算しても意味を持ちません(0 点として平均すると「最低水準」という誤った結論になります)。`,
        `**No overall verdict.** All ${totalFactors} factors are undetermined. An average or a progress figure computed from nothing would be meaningless — and averaging them as zeros would state the false conclusion that everything is at the lowest level.`,
        lang,
      ),
    );
    out.push('');
    out.push(
      ...renderUndetermined(kind, undetermined, totalFactors, measuredCount, scale, lang),
    );
    out.push(`## ${inline('保存', 'Saving', lang)}`);
    out.push('');
    out.push(
      msg(
        '判定できた因子が 1 件も無いため、save の指定にかかわらず保存していません。評点の付いた因子が 1 件でもあれば保存できます。',
        'Nothing was saved regardless of the save flag, because not a single factor was judged. Saving becomes possible as soon as one factor carries a score.',
        lang,
      ),
    );
    out.push('');
    out.push(`## ${inline('次の一手', 'Next steps', lang)}`);
    out.push('');
    out.push(
      bullets(
        [
          {
            ja: '因子ごとに「誰に聞けば分かるか」を 1 人ずつ決める。全部を 1 人に聞こうとすると止まる。',
            en: 'Name one person to ask per factor. Routing every factor to one person is where this stalls.',
          },
          {
            ja: '判断材料が集まった因子から順に current を入れて、このツールをもう一度呼ぶ。全因子が揃うまで待つ必要はない。',
            en: 'Fill in current for each factor as its evidence arrives and call this tool again. There is no need to wait for a complete set.',
          },
          {
            ja: '資料しか無い状態で全因子に評点を付けようとしないこと。根拠のない評点は、根拠のない結論になって独り歩きする。',
            en: 'Do not score every factor from documents alone. Scores without evidence become conclusions without evidence, and those travel.',
          },
        ],
        lang,
      ),
    );
    out.push('');
    out.push(
      ...referenceSection(
        kind === 'maturity'
          ? [techniquePointer('architecture-maturity', lang), techniquePointer('architecture-governance', lang)]
          : [
              techniquePointer('business-transformation-readiness', lang),
              techniquePointer('capability-based-planning', lang),
            ],
        lang,
      ),
    );
    return textResult(out.join('\n'));
  }

  // --- 総合 ---
  out.push(`## ${inline('総合', 'Overall', lang)}`);
  out.push('');
  out.push(para(scopeLine, lang));
  out.push('');
  out.push(`- ${label(L.current, lang)}: \`${bar(avgCurrent, scale, 20)}\` ${round1(avgCurrent)} / ${scale}`);
  out.push(`- ${label(L.target, lang)}: \`${bar(avgTarget, scale, 20)}\` ${round1(avgTarget)} / ${scale}`);
  // maxGap は負にもなり得る(全因子が目標以上)。符号を付け足すと "+-3" になるため分岐する
  const gapNote: Bilingual =
    maxGap > 0
      ? {
          ja: `最大ギャップ: +${round1(maxGap)}`,
          en: `largest gap: +${round1(maxGap)}`,
        }
      : {
          ja: 'ギャップなし(全因子が目標水準以上)',
          en: 'no gap; every factor is at or above target',
        };
  out.push(
    `- ${inline('目標に対する到達度', 'Progress toward target', lang)}: **${achievement}%** (${text(gapNote, lang)})`,
  );
  out.push('');

  if (avgTarget === 0) {
    out.push(
      msg(
        '目標がすべて 0 のため、到達度の数値は意味を持ちません。到達したい水準を target に入れて再実行してください。',
        'Every target is 0, so the progress figure means nothing. Put the level you intend to reach in target and run this again.',
        lang,
      ),
    );
    out.push('');
  } else if (achievement > 100) {
    out.push(
      msg(
        '現在の評価が目標を上回っています。目標が古いか、低く置かれている可能性が高いので、目標を置き直してから読んでください。',
        'The current scores exceed the target. The target is most likely stale or set too low; reset it before reading the result.',
        lang,
      ),
    );
    out.push('');
  }

  const verdict: Bilingual =
    kind === 'maturity'
      ? achievement >= 90
        ? {
            ja: 'ほぼ目標水準に達しています。次は水準の維持ではなく、目標そのものを引き上げるか、対象範囲を広げるかの選択になります。',
            en: 'You are near the target. The next question is not maintenance but whether to raise the target or widen the scope it applies to.',
          }
        : achievement >= 60
          ? {
              ja: '届く距離にあります。全因子を均等に上げるのではなく、最も低い 1〜2 因子に資源を集中するほうが早く効きます。',
              en: 'Within reach. Concentrating on the one or two weakest factors works faster than lifting everything evenly.',
            }
          : {
              ja: '差が大きい状態です。全部を同時に上げようとすると、どれも中途半端になります。今期は 1 因子に絞り、その因子だけ目標水準に到達させてください。',
              en: 'The gap is wide. Trying to raise everything at once leaves all of it half-done. Pick one factor for this period and take that one to target.',
            }
      : achievement >= 85
        ? {
            ja: '着手できる状態です。ただし最低点の因子は変革中に必ず表面化するので、監視対象として計画に載せてください。',
            en: 'Ready to start. The weakest factor will still surface mid-change, so carry it in the plan as something to watch.',
          }
        : achievement >= 60
          ? {
              ja: '条件付きで着手できます。ギャップの大きい因子に手当てを付けたうえで、範囲を絞って始めるのが現実的です。',
              en: 'You can start with conditions. Put remedies against the wide-gap factors and begin with a narrowed scope.',
            }
          : {
              ja: '着手前に手当てが必要な状態です。この準備度で大規模変革を始めると、中間状態で止まって二重運用が固定化する可能性が高いです。まず準備度を上げる小さな取り組みから始めてください。',
              en: 'Remedies are needed before kickoff. Starting a large transformation from here typically stalls mid-way and freezes dual operation. Begin with a smaller effort that raises readiness itself.',
            };
  out.push(text(verdict, lang));
  out.push('');
  if (undetermined.length > 0) {
    out.push(
      msg(
        `この判定は ${totalFactors} 因子中 ${measuredCount} 因子に基づくものです。除外した ${undetermined.length} 因子(${factorNames(undetermined, 'ja')})は「良い」でも「悪い」でもなく、判断していません。判定を人に伝えるときは、必ずこの範囲も一緒に伝えてください。除外した因子が実は最も低い水準だった場合、この判定は上振れしています。`,
        `This verdict rests on ${measuredCount} of ${totalFactors} factors. The ${undetermined.length} excluded (${factorNames(undetermined, 'en')}) are neither good nor bad — they were not judged. Always pass on the scope with the verdict: if an excluded factor turns out to be the weakest of all, this verdict reads high.`,
        lang,
      ),
    );
    out.push('');
  }

  // --- 因子ごとの読みと次の一手 ---
  // 推奨は「因子名 × 評点帯 × ギャップ幅」で選び、利用者が書いた note を本文で参照する。
  const scored = scoreFactors(factors, scale);
  const ordered = [...scored].sort(
    (a, b) =>
      BAND_RANK[a.band] - BAND_RANK[b.band] || b.gap - a.gap || a.factor.current - b.factor.current,
  );
  const ranked = scored
    .filter((x) => x.gap > 0)
    .sort((a, b) => b.gap - a.gap || a.factor.current - b.factor.current);
  const withoutNote = factors.filter((f) => !(f.note && f.note.trim().length > 0));

  out.push(`## ${inline('因子ごとの読みと次の一手', 'Factor-by-factor reading and next move', lang)}`);
  out.push('');

  // 帯ごとの内訳を先に出す(どこから手を付けるかを 1 目で決められるように)
  const bandOrder: FactorBand[] = ['bottleneck', 'act', 'watch', 'lowCeiling', 'strength'];
  out.push(
    `| ${inline('区分', 'Band', lang)} | ${inline('件数', 'Count', lang)} | ${label(L.factor, lang)} |`,
  );
  out.push('| --- | :-: | --- |');
  for (const band of bandOrder) {
    const members = ordered.filter((x) => x.band === band);
    if (members.length === 0) continue;
    out.push(
      `| ${BAND_MARK[band]} ${label(BAND_LABEL[band], lang)} | ${members.length} | ${members.map((x) => cell(x.factor.name)).join(', ')} |`,
    );
  }
  out.push('');
  if (withoutNote.length > 0) {
    out.push(
      msg(
        `評点を付けた ${measuredCount} 件中 ${withoutNote.length} 件の因子に根拠(note)がありません: ${factorNames(withoutNote, 'ja')}。根拠の無い評点は、評価者が代わると再現しません。`,
        `${withoutNote.length} of the ${measuredCount} scored factors carry no evidence in note: ${factorNames(withoutNote, 'en')}. Scores without evidence do not reproduce when the assessor changes.`,
        lang,
      ),
    );
    out.push('');
  }

  ordered.forEach((entry, i) => {
    const def = findDefaultFactor(entry.factor.name, defaults);
    const gapText =
      entry.gap > 0 ? `${label(L.gap, lang)} +${round1(entry.gap)}` : `${label(L.gap, lang)} ${round1(entry.gap)}`;
    out.push(
      `### ${i + 1}. ${entry.factor.name} — ${label(BAND_LABEL[entry.band], lang)} (${round1(entry.factor.current)} → ${round1(entry.factor.target)}, ${gapText})`,
    );
    out.push('');
    if (def) {
      out.push(`${inline('見るところ', 'What to look at', lang)}: ${text(def.description, lang)}`);
      out.push('');
    }
    out.push(para(bandReading(kind, entry, scale), lang));
    out.push('');
    out.push(`${inline('根拠の扱い', 'On the evidence', lang)}: ${para(evidenceReading(kind, entry), lang)}`);

    // 因子固有の「よくある詰まり方」は、当てはまり得る帯にだけ出す。
    // 評点が高い側の因子に「できていない前提」の助言を返すと、事実と逆のことを言うことになる。
    const bandAllowsHint = entry.band !== 'strength' && !(entry.band === 'watch' && entry.highSide);
    // 既定因子に無い(利用者が独自に立てた)因子には固有の知見が無い。一般論の GENERIC_HINT は
    // 「根拠の扱い」が既に同じ切り分けを求めている帯(bottleneck / act で note 記入済み)では
    // 同じことを二度言うだけなので出さない。note が空欄のときだけ、切り分け方として残す。
    const evidenceAlreadyAsksToTriage =
      entry.factor.note !== undefined &&
      entry.factor.note.trim().length > 0 &&
      (entry.band === 'bottleneck' || entry.band === 'act');
    const showHint = bandAllowsHint && (def !== undefined || !evidenceAlreadyAsksToTriage);
    if (showHint) {
      out.push('');
      out.push(
        def
          ? `${inline('この因子でよくある詰まり方(当てはまる場合のみ)', 'Common failure mode for this factor — use it only if it matches', lang)}: ${text(def.hint, lang)}`
          : `${inline('切り分け方(一般論。この因子固有の知見はこのサーバーにはありません)', 'How to triage it — general advice; this server has no knowledge specific to this factor', lang)}: ${text(GENERIC_HINT[kind], lang)}`,
      );
    } else if (entry.band === 'watch') {
      out.push('');
      out.push(
        msg(
          `現在の水準が高い側(${round1(entry.factor.current)}/${scale})のため、この因子で一般に語られる「できていない場合の助言」は出していません。上の読みが実態と合っているかだけ確認してください。`,
          `Because the current score sits on the high side (${round1(entry.factor.current)} of ${scale}), the usual "if this is not working" advice for this factor is withheld. Just check the reading above against reality.`,
          lang,
        ),
      );
    }
    if (kind === 'readiness' && entry.gap >= riskThreshold) {
      out.push('');
      out.push(
        msg(
          `> 変革リスク候補: この因子のギャップ(+${round1(entry.gap)})は、計画の巧拙に関係なく変革を止める要因になり得ます。`,
          `> Candidate transformation risk: a gap of +${round1(entry.gap)} on this factor can stop the change regardless of plan quality.`,
          lang,
        ),
      );
    }
    out.push('');
  });

  if (ranked.length === 0) {
    out.push(
      msg(
        `評点を付けた ${measuredCount} 因子はすべて目標水準に達しています。目標が低すぎないか、あるいは評価が甘くないかを、別の評価者と突き合わせて確認してください。`,
        `All ${measuredCount} scored factors are at target. Check with a second assessor whether the targets are too low or the scoring too generous.`,
        lang,
      ),
    );
    out.push('');
  }

  // --- 判断できなかった因子 ---
  out.push(...renderUndetermined(kind, undetermined, totalFactors, measuredCount, scale, lang));

  // --- 変革リスクの登録案内(readiness のみ)---
  if (kind === 'readiness') {
    const risky = ranked.filter((x) => x.gap >= riskThreshold);
    out.push(`## ${inline('変革リスクとしての登録', 'Recording these as transformation risks', lang)}`);
    out.push('');
    if (risky.length === 0) {
      out.push(
        msg(
          `評点を付けた ${measuredCount} 因子の中に、ギャップが目安(+${riskThreshold})を超えるものはありません。${
            undetermined.length > 0
              ? `ただし ${undetermined.length} 因子は判断材料が無く、リスクの有無自体が分かっていません。「リスクなし」ではなく「まだ見ていない」です。`
              : '準備度の面では、いま特別に登録すべきリスクはありません。'
          }`,
          `None of the ${measuredCount} scored factors exceeds the threshold of +${riskThreshold}.${
            undetermined.length > 0
              ? ` ${undetermined.length} factors remain undetermined, so whether they carry risk is unknown — that is "not looked at yet", not "no risk".`
              : ' Nothing here needs recording as a readiness risk right now.'
          }`,
          lang,
        ),
      );
      out.push('');
    } else {
      out.push(
        msg(
          `ギャップが +${riskThreshold} 以上の因子が ${risky.length} 件あります。準備不足は「そのうち何とかなる」形で放置されやすいので、リスクとして登録し、受容者と対策を付けてください。このツールはリスクを登録しません。次のように \`update_engagement\` を呼んでください。`,
          `${plural(risky.length, 'factor exceeds', 'factors exceed')} a gap of +${riskThreshold}. Readiness shortfalls quietly persist under the assumption they will sort themselves out, so record them as risks with an owner and a mitigation. This tool does not record them; call \`update_engagement\` as below.`,
          lang,
        ),
      );
      out.push('');
      // 「N 件ある」と書いた直後に 3 件しか出さないと、貼った人はそれで全部だと思う。
      // 原則は全件出す。多すぎて読めないときだけ切り、切ったことと残りの入れ方を必ず書く。
      const shown = capRows(risky, RISK_JSON_MAX);
      out.push('```json');
      out.push(
        JSON.stringify(
          {
            risks: shown.rows.map((x) => {
              const note = x.factor.note && x.factor.note.trim().length > 0 ? quote(x.factor.note, 120) : null;
              return {
                title:
                  lang === 'en'
                    ? `Readiness shortfall: ${capCell(x.factor.name, 120)}`
                    : `変革準備度の不足: ${capCell(x.factor.name, 120)}`,
                description:
                  lang === 'en'
                    ? `Scored ${round1(x.factor.current)} of ${scale} against a target of ${round1(x.factor.target)}. Evidence: ${note ?? 'not recorded'}`
                    : `評点 ${round1(x.factor.current)}/${scale}(目標 ${round1(x.factor.target)})。根拠: ${note ?? '未記入'}`,
                level: x.gap >= riskThreshold * 1.5 ? 'high' : 'medium',
                status: 'open',
                owner: '',
                mitigation: '',
              };
            }),
          },
          null,
          2,
        ),
      );
      out.push('```');
      out.push('');
      if (shown.capped) {
        const rest = risky.slice(RISK_JSON_MAX).map((x) => capCell(x.factor.name, 60));
        out.push(
          msg(
            `この JSON は抜粋です: 該当 ${shown.total} 件のうち、ギャップの大きい ${shown.rows.length} 件だけを載せています。残り ${shown.hidden} 件(${rest.join('、')})も同じ形式で risks 配列に足してください。抜けたまま起票すると、登録済みの件数と本文の件数が食い違います。`,
            `This JSON is an extract: ${shown.rows.length} of the ${shown.total} factors, widest gap first. Add the remaining ${shown.hidden} (${rest.join(', ')}) to the risks array in the same shape. If they are left out, the number of risks on record will not match the number stated above.`,
            lang,
          ),
        );
      } else {
        out.push(
          msg(
            `上の JSON には該当 ${shown.total} 件をすべて入れてあります(抜粋ではありません)。owner と mitigation は空にしてあるので、埋めてから渡してください。`,
            `The JSON above contains all ${shown.total} of them — it is not an extract. owner and mitigation are left blank; fill them in before sending it.`,
            lang,
          ),
        );
      }
      out.push('');
    }
  }

  // --- 保存 ---
  const timestamp = now();
  const weakestName = weakest ? capCell(weakest.name, 60) : '—';
  // 保存する要約にも判定の範囲を必ず入れる。後で読む人は本文ではなく要約を見る
  const scopeSuffix =
    undetermined.length > 0
      ? lang === 'en'
        ? ` Judged on ${measuredCount} of ${totalFactors} factors; ${undetermined.length} undetermined (${factorNames(undetermined, 'en', 3)}).`
        : ` ${totalFactors} 因子中 ${measuredCount} 因子で判定(判断材料なし ${undetermined.length} 件: ${factorNames(undetermined, 'ja', 3)})。`
      : '';
  const summary =
    lang === 'en'
      ? `Average ${round1(avgCurrent)} → ${round1(avgTarget)} of ${scale} (${achievement}% of target). Weakest factor: ${weakestName}.${scopeSuffix}`
      : `平均 ${round1(avgCurrent)} → ${round1(avgTarget)}(${scale} 点満点、到達度 ${achievement}%)。最も低い因子: ${weakestName}。${scopeSuffix}`;

  out.push(`## ${inline('保存', 'Saving', lang)}`);
  out.push('');
  if (!input.save) {
    out.push(
      msg(
        'この結果は保存していません(既定は save=false のプレビューです)。案件の記録として残し、次回と比較したい場合は save=true で実行してください。',
        'This result was not saved (save defaults to false, i.e. preview only). Run again with save=true to keep it on the engagement and compare with the next round.',
        lang,
      ),
    );
  } else {
    const engagement: Engagement | null = loadEngagement();
    if (!engagement) {
      out.push(
        msg(
          'エンゲージメントが未作成のため保存していません。`start_engagement` で案件を作ってから再実行すると、評価が案件に記録され、時系列で比較できるようになります。',
          'Not saved: no engagement exists. Create one with `start_engagement` and run this again to keep the assessment with the engagement and compare over time.',
          lang,
        ),
      );
    } else {
      const assessment: Assessment = {
        id: makeId('asmt'),
        kind,
        title,
        scale,
        factors,
        summary,
        assessedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      // 判断できなかった因子は評点を持たないので factors には入れない
      // (0 や仮の数値を入れると、保存データ側で「測った」ことになってしまう)。
      // 代わりに要約に範囲を書いてあり、保存後に読んでも判定の範囲が分かる。
      engagement.assessments.push(assessment);
      const stored = trySave(engagement);
      const previous = engagement.assessments.filter((a) => a.kind === kind && a.id !== assessment.id);
      out.push(
        stored.ok
          ? msg(
              `**保存しました** — 案件「${engagement.name}」に評価を記録しました(ID: \`${assessment.id}\`)。保存したくない場合は save=false で実行してください(既定は save=false です)。なお、保存済みの評価を消すツールは現時点でありません。試しの評点で呼ぶときは save を付けないでください。`,
              `**Saved** — the assessment was recorded on engagement "${engagement.name}" (id: \`${assessment.id}\`). Run with save=false to keep it out of the record (false is the default). Note that no tool currently deletes a stored assessment, so leave save off when you are trying numbers out.`,
              lang,
            )
          : msg(
              `保存に失敗しました(${stored.reason})。評価結果そのものは上に出ています。データ保存先(既定 \`~/.togaf-eap\`、環境変数 \`TOGAF_EAP_DATA_DIR\` で変更)の書き込み権限を確認してください。`,
              `Saving failed (${stored.reason}). The assessment itself is above. Check write access to the data directory (default \`~/.togaf-eap\`, override with \`TOGAF_EAP_DATA_DIR\`).`,
              lang,
            ),
      );
      if (stored.ok && undetermined.length > 0) {
        out.push('');
        out.push(
          msg(
            `保存したのは評点の付いた ${measuredCount} 因子だけです。判断材料の無かった ${undetermined.length} 因子(${factorNames(undetermined, 'ja', 3)})は、仮の数値を入れると「測った」ことになってしまうため保存していません。判定の範囲は要約に書いてあります。判断材料が揃ったら、全因子を入れて測り直してください。`,
            `Only the ${measuredCount} scored factors were stored. The ${undetermined.length} undetermined ones (${factorNames(undetermined, 'en', 3)}) were not: a placeholder number would make them look measured. The scope is recorded in the summary. Re-measure with the full set once the missing material is in hand.`,
            lang,
          ),
        );
      }
      if (stored.ok && previous.length > 0) {
        // 手書き JSON でも落ちないように、評価日・因子の欠損を許容する
        const at = (a: Assessment): string => (typeof a.assessedAt === 'string' ? a.assessedAt : '');
        const last = [...previous].sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : 0))[
          previous.length - 1
        ];
        const lastFactors = Array.isArray(last.factors) ? last.factors : [];
        const lastAvg = lastFactors.length > 0
          ? lastFactors.reduce((a, f) => a + (Number.isFinite(f?.current) ? f.current : 0), 0) / lastFactors.length
          : 0;
        const lastDate = at(last).slice(0, 10) || '—';
        const delta = round1(avgCurrent - lastAvg);
        out.push('');
        out.push(
          msg(
            `同種の評価が ${previous.length} 件あります。直近(${lastDate})の平均 ${round1(lastAvg)} との差は ${delta >= 0 ? '+' : ''}${delta} です。尺度や因子が違う場合、この差は比較になりません。`,
            `${plural(previous.length, 'earlier assessment', 'earlier assessments')} of the same kind exist${previous.length === 1 ? 's' : ''}. Compared with the most recent (${lastDate}, average ${round1(lastAvg)}), the change is ${delta >= 0 ? '+' : ''}${delta}. The comparison only holds if the scale and factors match.`,
            lang,
          ),
        );
      }
    }
  }
  out.push('');

  // --- 次の一手 ---
  out.push(`## ${inline('次の一手', 'Next steps', lang)}`);
  out.push('');
  out.push(
    bullets(
      kind === 'maturity'
        ? [
            {
              ja: '最も低い因子を 1 つ選び、6 か月で 1 段上げるための具体的な取り組みを決める(担当・期限付き)。',
              en: 'Pick the single weakest factor and define concrete work to raise it one level in six months, with an owner and a date.',
            },
            {
              ja: '評価結果を経営層に見せるときは、点数ではなく「この差があると何が起きるか」を先に語る。',
              en: 'When you show this to executives, lead with what the gap causes, not with the scores.',
            },
            {
              ja: '同じ因子・同じ尺度で半年ごとに測り直す。因子を変えると前回との比較ができなくなる。',
              en: 'Re-measure every six months with the same factors and scale. Changing factors destroys comparability.',
            },
            {
              ja: '結果を `update_engagement` のアクション・決定事項に落とし込み、`get_dashboard` で共有する。',
              en: 'Turn the outcome into actions and decisions via `update_engagement`, then share with `get_dashboard`.',
            },
          ]
        : [
            {
              ja: 'ギャップの大きい因子に手当てを決め、手当てが付かない因子については、その領域を今回のスコープから外すことを検討する。',
              en: 'Assign a remedy to each wide-gap factor; where no remedy is possible, consider taking that area out of scope for this round.',
            },
            {
              ja: '準備度の低さは、移行アーキテクチャの刻み方で緩和できる。到達点を小さく区切り、各区切りで成果を見せる。',
              en: 'Weak readiness can be absorbed by how you slice the transitions: smaller milestones, visible results at each.',
            },
            {
              ja: '評価結果をスポンサーと共有し、着手の可否そのものを決定事項として記録する。',
              en: 'Share the result with the sponsor and log the decision to proceed (or not) as a decision.',
            },
            {
              ja: '着手後も四半期ごとに測り直す。準備度は体制変更や予算見直しで簡単に下がる。',
              en: 'Re-measure quarterly after kickoff. Readiness drops easily with reorganizations and budget reviews.',
            },
          ],
      lang,
    ),
  );
  out.push('');
  out.push(
    ...referenceSection(
      kind === 'maturity'
        ? [techniquePointer('architecture-maturity', lang), techniquePointer('architecture-governance', lang)]
        : [
            techniquePointer('business-transformation-readiness', lang),
            techniquePointer('capability-based-planning', lang),
          ],
      lang,
    ),
  );

  return textResult(out.join('\n'));
}

// ---------------------------------------------------------------------------
// 登録 / Registration
// ---------------------------------------------------------------------------

const factorInputSchema = z.object({
  // 上限の実際の判定は runAssessment 側(TEXT_LIMITS の title / text)。
  // ここでの max は、その手前でメモリを食わないための最後の防波堤。
  name: freeTextSchema('評価因子名 / Factor name', 300).min(1),
  current: z
    .number()
    .nullable()
    .describe(
      '現在の水準(0〜scale)。手元の資料・情報からは判断できない場合は null を渡す(0 ではない。0 は「無い」という判定、null は「判定していない」)。null の因子は平均・到達度・総合判定から除外し、「判断材料なし」として別に示す / Current level 0 to scale. Pass null — not 0 — when the material at hand does not let you judge it: 0 is a finding, null is the absence of one. Null factors are excluded from the averages, the progress figure, and the verdict, and are listed separately as undetermined',
    ),
  target: z.number().describe('目標の水準(0〜scale) / Target level, 0 to scale'),
  note: freeTextSchema(
    '根拠。current が null のときは「なぜ判断できないのか」を書く / Evidence; when current is null, write why it could not be judged',
    4000,
  ).optional(),
  source: freeTextSchema(
    '評点の出典。例: "security-report.pdf p.17" / "2026-08-14 情シス部長ヒアリング" / Where the score comes from, e.g. "security-report.pdf p.17"',
    300,
  ).optional(),
  confidence: z
    .enum(CONFIDENCE_LEVELS)
    .optional()
    .describe('stated=出典にそう書いてある / inferred=書かれてはいないが導いた / unknown=出所を辿れない'),
});

const scaleSchema = z
  .number()
  .int()
  .min(2)
  .max(10)
  .default(5)
  .describe('評価尺度の最大値(既定 5) / Maximum value of the rating scale, default 5');

export function registerAnalysisTools(server: McpServer): void {
  server.registerTool(
    'gap_analysis',
    {
      title: 'Run a gap analysis',
      description:
        '現行(baseline)と目標(target)の構成要素を突き合わせ、マトリクスで対応関係を可視化し、新規に必要なもの・廃止されるもの・改修/置換されるものをギャップとして洗い出して、それぞれの推奨アクションと解釈を返す。廃止側も必ず出すため、コスト削減の根拠が消えない。検出したギャップは `add_work_package` にそのまま渡せる JSON として出力し、save=true で分析の要約を案件のメモに残せる。sources 引数で要素ごとの出典を渡すと、ギャップ一覧に出典列が出る(渡さなかった要素は空欄ではなく「出所未記入」と表示する)。 / Compare baseline and target elements, render the mapping as a matrix, and derive the gaps: what must be newly created, what gets eliminated, and what is modified or replaced, each with a recommended action. Eliminations are always reported so the cost-reduction case stays visible. The gaps are also emitted as ready-to-paste `add_work_package` JSON, and save=true appends a summary of the analysis to the engagement notes. Pass per-element provenance in sources to get a source column on the gap table; elements without one are marked "no source" rather than left blank.',
      inputSchema: {
        baseline: z
          .array(freeTextSchema('現行の構成要素 1 件 / One baseline element', IDENTIFIER_LIMIT))
          .max(MAX_ITEMS)
          .describe('現行の構成要素(能力・システム・データ・技術など) / Baseline elements: capabilities, systems, data, technologies'),
        target: z
          .array(freeTextSchema('目標の構成要素 1 件 / One target element', IDENTIFIER_LIMIT))
          .max(MAX_ITEMS)
          .describe('目標の構成要素 / Target elements'),
        mappings: z
          .array(
            z.object({
              from: freeTextSchema('現行の要素名 / Baseline element name', IDENTIFIER_LIMIT),
              to: freeTextSchema('目標の要素名 / Target element name', IDENTIFIER_LIMIT),
              kind: z
                .enum(MAPPING_KINDS)
                .describe('retained=そのまま流用 / modified=改修して流用 / replaced=置き換え'),
            }),
          )
          .max(MAX_ITEMS)
          .optional()
          .describe(
            '現行と目標の対応関係。省略した現行要素は、同名の目標があれば維持、無ければ廃止として扱う / Mapping between baseline and target. Unmapped baseline elements are retained when a same-named target exists, otherwise eliminated',
          ),
        sources: z
          .array(
            z.object({
              element: freeTextSchema(
                '出典を付ける要素名(baseline か target に書いたものと同じ名前) / The element name this source belongs to; must match a baseline or target entry',
                IDENTIFIER_LIMIT,
              ),
              source: freeTextSchema(
                '出典の短い呼び名。例: "security-report.pdf p.17" / "2026-08-14 情シス部長ヒアリング" / A short handle for the source, e.g. "security-report.pdf p.17"',
                300,
              ).optional(),
              confidence: z
                .enum(CONFIDENCE_LEVELS)
                .optional()
                .describe(
                  'stated=出典にそう書いてある / inferred=書かれてはいないが導いた / unknown=出所を辿れない',
                ),
            }),
          )
          .max(MAX_ITEMS)
          .optional()
          .describe(
            '要素ごとの出典。ギャップ一覧に出典列が出る。渡さなかった要素は「出所未記入」と表示される(空欄にはしない) / Per-element provenance. Adds a source column to the gap table; elements you omit are shown as "no source" rather than left blank',
          ),
        domain: freeTextSchema(
          '対象ドメイン(business / data / application / technology など) / Architecture domain',
          IDENTIFIER_LIMIT,
        ).optional(),
        save: z
          .boolean()
          .default(false)
          .describe(
            '分析の要約を案件のメモに 1 行記録する(既定 false)。作業パッケージは登録しない / Append a one-line summary of this analysis to the engagement notes (default false). Work packages are not created',
          ),
        lang: langSchema,
      },
    },
    async ({ baseline, target, mappings, sources, domain, save, lang }) =>
      runGapAnalysis({ baseline, target, mappings, sources, domain, save, lang }),
  );

  server.registerTool(
    'risk_matrix',
    {
      title: 'Visualize the risk matrix',
      description:
        '保存されている案件のリスクを、レベル × 状態、および現在レベル × 残存レベルのマトリクスで可視化し、残存リスク未評価・受容者未設定・重大リスクの対策空欄などを要対応として指摘する。明細表には出典列(記号の凡例つき)が出て、出典の付いている件数を「N/M 件」で集計し、出典の無い項目を名指しする。 / Plot the stored engagement risks as level x status and current x residual matrices, and flag what needs attention: unassessed residual risk, missing owners, and severe risks with no mitigation. The detail table carries a source column with a legend, and the output counts how many entries can be traced back to a source and names the ones that cannot.',
      inputSchema: { lang: langSchema },
    },
    async ({ lang }) => runRiskMatrix(lang as Lang),
  );

  server.registerTool(
    'stakeholder_matrix',
    {
      title: 'Visualize the stakeholder matrix',
      description:
        'ステークホルダーを影響力 × 関心度の 4 象限(密に関与 / 満足を維持 / 情報提供 / 監視)に配置し、象限ごとの推奨関与方針と、関心事・関与方針が未記入の人を指摘する。さらに登録された関心事を突き合わせて、利害が衝突しうる組み合わせ(速さ vs 確実さ、標準化 vs 現場裁量、コスト vs 品質、短期 vs 長期、統制 vs 利便性、一気に変える vs 現行業務の継続)を、根拠にした関心事・放置した場合に起きること・裁定者と時期つきで返す。検出できない場合は手で見るべき観点を示す。象限ごとの明細表には出典列(記号の凡例つき)が出て、出典の付いている件数を「N/M 件」で集計する。 / Place stakeholders in the influence x interest quadrants (manage closely, keep satisfied, keep informed, monitor), give the recommended approach per quadrant, and flag anyone missing concerns or an engagement approach. It also compares the recorded concerns to surface pairs whose interests collide — speed vs certainty, standardization vs local autonomy, cost vs quality, short vs long term, control vs convenience, big-bang vs continuity — each with the concerns used as evidence, what happens if it is left alone, and who should arbitrate when. When nothing is detected it says so and gives the lenses to check by hand. The per-quadrant tables carry a source column with a legend, and the output counts how many entries can be traced back to a source.',
      inputSchema: { lang: langSchema },
    },
    async ({ lang }) => runStakeholderMatrix(lang as Lang),
  );

  server.registerTool(
    'assess_maturity',
    {
      title: 'Assess EA practice maturity',
      description:
        'EA 実践の成熟度を因子ごとに評価し、現在/目標/差をバー付きの表、総合スコア、因子ごとの読みと次の一手として返す。推奨は因子名だけでなく評点帯・ギャップ幅・記入した根拠(note)に応じて変わる。手元の資料からは判断できない因子は current に null を渡すと、評点を付けずに「判断材料なし」として総合判定から除外し、除外したことと因子名を明示する(N 因子中 M 因子で判定、と書く)。因子ごとに source / confidence で出典を付けられる。因子を省略すると既定の因子セットを提示する。既定では保存しない(save=true を渡したときだけエンゲージメントに記録する)。 / Assess EA practice maturity factor by factor and return a bar table of current, target, and gap, an overall score, and a per-factor reading with the next move. Recommendations vary by score band, gap width, and the evidence you wrote in note — not by factor name alone. Pass null for current on any factor the material cannot answer: it gets no score, is excluded from the verdict, and is reported by name as undetermined ("judged on M of N factors"). Each factor can carry source and confidence. Omit factors to get the default factor set. Nothing is stored unless save=true.',
      inputSchema: {
        factors: z
          .array(factorInputSchema)
          .optional()
          .describe('評価因子。省略すると既定の因子セットを提示する / Factors; omit to receive the default set'),
        scale: scaleSchema,
        save: z
          .boolean()
          .default(false)
          .describe(
            'エンゲージメントに評価を保存する(既定 false = プレビューのみ。指定しない限り案件データは変わらない) / Store the assessment on the engagement (default false: preview only; nothing is written unless you pass true)',
          ),
        title: freeTextSchema('評価の名前(任意) / Optional title for this assessment', 300).optional(),
        lang: langSchema,
      },
    },
    async ({ factors, scale, save, title, lang }) =>
      runAssessment('maturity', { factors, scale, save, title, lang }),
  );

  server.registerTool(
    'assess_readiness',
    {
      title: 'Assess business transformation readiness',
      description:
        '変革準備度(経営の意思・予算・体制・スキル・変革実績・業務部門の受容度など)を因子ごとに評価し、バー付きの表・総合判定・因子ごとの読みと次の一手を返す。推奨は因子名だけでなく評点帯・ギャップ幅・記入した根拠(note)に応じて変わる。ギャップの大きい因子は変革リスクとして扱い、`update_engagement` での登録用 JSON を添える。判断できない因子は current に null を渡すと、評点を付けずに総合判定から除外し、除外したことを明示する(「リスクなし」と「まだ見ていない」を混同させない)。因子ごとに source / confidence で出典を付けられる。既定では保存しない(save=true を渡したときだけエンゲージメントに記録する)。 / Assess transformation readiness (executive intent, funding, organization, skills, track record, business acceptance, and more) and return a bar table, an overall verdict, and a per-factor reading with the next move. Recommendations vary by score band, gap width, and the evidence you wrote in note — not by factor name alone. Wide-gap factors are called out as transformation risks with ready-to-paste `update_engagement` JSON. Pass null for current on any factor you cannot judge: it is excluded from the verdict and reported separately, so "no risk" is never confused with "not looked at". Each factor can carry source and confidence. Nothing is stored unless save=true.',
      inputSchema: {
        factors: z
          .array(factorInputSchema)
          .optional()
          .describe('評価因子。省略すると既定の因子セットを提示する / Factors; omit to receive the default set'),
        scale: scaleSchema,
        save: z
          .boolean()
          .default(false)
          .describe(
            'エンゲージメントに評価を保存する(既定 false = プレビューのみ。指定しない限り案件データは変わらない) / Store the assessment on the engagement (default false: preview only; nothing is written unless you pass true)',
          ),
        title: freeTextSchema('評価の名前(任意) / Optional title for this assessment', 300).optional(),
        lang: langSchema,
      },
    },
    async ({ factors, scale, save, title, lang }) =>
      runAssessment('readiness', { factors, scale, save, title, lang }),
  );
}
