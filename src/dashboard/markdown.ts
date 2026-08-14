/**
 * Markdown ダッシュボード / Markdown dashboard.
 * 会話内表示・コピペ・印刷向けに整形した Markdown を生成する。
 */

import { ADM_PHASES, findPhase, type Bilingual, type Lang } from '../knowledge/index.js';
import {
  CONFIDENCE_DEFINITIONS,
  CONFIDENCE_LEVELS,
  NO_SOURCE_LABEL,
  NO_SOURCE_MARK,
  OUTPUT_LIMITS,
  RISK_LEVELS,
  RISK_STATUSES,
  capCell,
  capRows,
  sourceCell,
  summarizeProgress,
  summarizeProvenance,
  type Action,
  type Assessment,
  type Engagement,
  type Priority,
  type RiskLevel,
  type RiskStatus,
  type Stakeholder,
  type TransitionState,
  type WorkPackage,
} from '../engagement/model.js';
import {
  ACTION_STATUS_LABEL,
  ASSESSMENT_KIND_LABEL,
  DECISION_STATUS_LABEL,
  DELIVERABLE_STATUS_LABEL,
  INFLUENCE_LABEL,
  L,
  PHASE_STATUS_ICON,
  PHASE_STATUS_LABEL,
  PRIORITY_LABEL,
  RISK_LEVEL_LABEL,
  RISK_STATUS_LABEL,
  WORK_PACKAGE_STATUS_LABEL,
  label,
} from './labels.js';

/**
 * この節でだけ使う表示文言 / Strings used only by the Markdown dashboard.
 * 共有ラベル(labels.ts)に無いものはここでローカルに持つ。
 */
const M = {
  unassigned: { ja: '(移行状態 未割当)', en: '(no transition)' },
  source: { ja: '出典', en: 'Source' },
  total: { ja: '計', en: 'Total' },
  average: { ja: '平均', en: 'Average' },
  overdue: { ja: '期限超過', en: 'overdue' },
  warnings: { ja: '要確認', en: 'Watch-outs' },
  transitionLegend: {
    ja: '太字の行は移行アーキテクチャ。その「状態」欄は進捗ではなく、そこで止めても事業が回るか(単独稼働)を示す。「↳」の行はその状態に属する作業パッケージ。',
    en: 'Bold rows are transition architectures; their Status column shows whether the business can run if work stops there, not progress. Rows marked "↳" are the work packages belonging to that state.',
  },
  scale: { ja: '尺度', en: 'Scale' },
  assessedAt: { ja: '評価日', en: 'Assessed' },
  summary: { ja: '所見', en: 'Summary' },
  standaloneWarning: {
    ja: 'ここで打ち切ると事業が回りません。次の移行状態まで到達する資金と体制を先に確保してください。',
    en: 'Stopping here would leave the business unable to run. Secure the funding and staffing to reach the next transition before you commit.',
  },
  disposalWarning: {
    ja: '暫定の仕組みがあるのに廃棄計画がありません。誰がいつ捨てるかを決めないと、暫定は恒久化します。',
    en: 'An interim mechanism is recorded with no disposal plan. Unless an owner and a date are fixed, the workaround becomes permanent.',
  },
  // --- 進捗の言い換え(「進捗 5%」が事業の出来高と誤読されるのを避ける) ---
  phasesInProgress: { ja: '進行中', en: 'in progress' },
  phasesSkipped: { ja: '対象外', en: 'skipped' },
  phaseShareNote: {
    ja: 'この割合は ADM の 10 フェーズのうちどこまで歩いたかを示すもので、作業の出来高でも予算消化率でもない。役員に見せるときは下の「積み上がっているもの」と必ず並べること。',
    en: 'This share tracks how far the ADM has been walked. It is not work completed and not budget spent. When showing it to an executive, always put the "recorded so far" line next to it.',
  },
  recorded: { ja: '積み上がっているもの', en: 'Recorded so far' },
  // --- コスト ---
  cost: { ja: '概算コスト', en: 'Rough cost' },
  costTotal: { ja: '合計', en: 'Total' },
  costCounted: { ja: '集計対象', en: 'Counted' },
  costPeak: { ja: 'ピーク', en: 'Peak' },
  costYear: { ja: '年', en: 'Year' },
  costQuarter: { ja: '四半期', en: 'Quarter' },
  costAmount: { ja: '金額', en: 'Amount' },
  costStack: { ja: '山積み', en: 'Load' },
  costRaw: { ja: '原文', en: 'As entered' },
  costParsed: { ja: '集計額', en: 'Parsed' },
  costRanking: { ja: '金額の大きい順', en: 'Largest first' },
  costExcluded: { ja: '合計に含めていないもの', en: 'Not included in the total' },
  costUnreadable: { ja: '金額として読めなかった', en: 'not readable as an amount' },
  costRecurring: {
    ja: '期間あたりの費用(年数が決まらないため総額に足していない)',
    en: 'per-period costs, left out of the total because the number of periods is not fixed',
  },
  costMissing: { ja: 'コスト未記入', en: 'with no cost recorded' },
  costLowerBound: {
    ja: 'コスト未記入の作業パッケージがある以上、この合計は下限であって総額ではない。',
    en: 'While any work package carries no cost, this total is a floor, not the bill.',
  },
  costMethod: {
    ja: '按分の仕方: 開始〜終了四半期に均等割り。範囲表記(「2〜3 億円」)は上限側で積む。実際の支出カーブではなく、山の位置を見るための図。',
    en: 'How it is spread: evenly across the start-to-end quarters, with ranges stacked at their upper bound. This shows where the peak lands, not an actual spend curve.',
  },
  costNoRate: {
    ja: '通貨が混ざっているため為替換算はしていない(勝手なレートで足すと見積ではなく作り話になる)。山積みは件数の多い通貨だけで描いている。',
    en: 'Currencies are not converted: inventing a rate would turn an estimate into fiction. The load chart uses only the most common currency.',
  },
  costUntimed: { ja: '時期未設定のため山積みに載っていない金額', en: 'Amount left off the load chart because it has no timing' },
  costEmpty: {
    ja: 'コストが 1 件も入っていない。`add_work_package` の costEstimate に「約 2 億円」「4,000 万円」のように書けば、合計・年ごとの山積み・予算との照合まで自動で出る。',
    en: 'No costs recorded. Put a figure in costEstimate on `add_work_package` (e.g. "約 2 億円", "40,000,000 JPY") and the total, the yearly load, and the budget check all follow automatically.',
  },
  budgetCheck: { ja: '予算との照合', en: 'Against the stated budget' },
  budgetDisclaimer: {
    ja: '上限額は案件概要・スコープの文面から自動抽出したもの。読み違いなら無視してよい。',
    en: 'The cap was extracted automatically from the overview and scope text. Ignore it if it was misread.',
  },
  more: { ja: '他', en: 'more' },
  unknownSections: { ja: '解釈できない節の指定', en: 'Unrecognized section names' },
  availableSections: { ja: '指定できる節', en: 'Available sections' },
} satisfies Record<string, Bilingual>;

/**
 * 切ったことと「全件の見方」を伝える末尾の 1 行。
 *
 * 文言は**実在する引数名**で書く。`get_dashboard` / `get_engagement` に無い引数を案内すると、
 * 利用者はその通りに呼べず、案内そのものが嘘になる(以前の文言は `sections` を挙げていた)。
 */
function trimNote(limit: number, auto: boolean): Bilingual {
  const rows = `${limit} row${limit === 1 ? '' : 's'}`;
  return {
    ja:
      (auto
        ? `件数が多いため、各表は上位のみ(最大 ${limit} 件)を表示している。`
        : `指定により、各表は上位のみ(最大 ${limit} 件)を表示している。`) +
      ' 全件を見るには `get_dashboard`(または `get_engagement`)に `compact=false` を渡す。' +
      ` 件数だけ変えるなら \`limit=<件数>\`(例: limit=${limit * 2})。生の全データは \`get_engagement\` の \`format="json"\`。`,
    en:
      (auto
        ? `There are enough entries that each table shows only its top rows (at most ${rows}).`
        : `As requested, each table shows only its top rows (at most ${rows}).`) +
      ' Pass `compact=false` to `get_dashboard` (or `get_engagement`) to see every row,' +
      ` \`limit=<n>\` to change how many (e.g. limit=${limit * 2}), or read everything raw with \`format="json"\` on \`get_engagement\`.`,
  };
}

/** Markdown の表セル用にパイプと改行を無害化する */
function cell(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** 外部由来の文字列を 1 行に畳み、長すぎるものは切り詰める(引用表示用) */
function quoteOneLine(value: string, max = 120): string {
  const flat = value.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * 備考セル内の区切り。`lang: 'both'` ではラベル自体が " / " で日英を繋ぐため、
 * 同じ記号を項目の区切りに使うと境目が読めなくなる。
 */
const SEP = ' • ';

/**
 * JSON 由来の配列を安全に扱う。
 * 永続化された engagement.json は手書き・旧形式のことがあり、
 * `normalizeEngagement` も配列要素の中身までは検証しない。
 * ダッシュボード描画はそれで例外を投げてはならない(MCP ツールが落ちる)。
 */
function list<T>(value: readonly T[] | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

/** ラベル表を引く。未知のキー(手書き JSON など)はキー名をそのまま表示して落ちない */
function labelOf(map: Record<string, Bilingual>, key: string | undefined, lang: Lang): string {
  if (!key) return '';
  const found: Bilingual | undefined = map[key];
  return found ? label(found, lang) : key;
}

/** 進捗バーを文字で描く */
export function progressBar(percent: number, width = 20): string {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

function formatDate(iso: string): string {
  // ISO 文字列を "YYYY-MM-DD HH:mm" に(タイムゾーンはローカル)
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 四半期表記 (YYYY-Qn) の解析結果 */
export interface ParsedQuarter {
  year: number;
  /** 1-4 */
  quarter: number;
}

/** "2027-Q1" 形式を解析する。解釈できなければ null */
export function parseQuarter(value: string | undefined): ParsedQuarter | null {
  if (!value) return null;
  const m = /^(\d{4})[-\s]?Q([1-4])$/i.exec(value.trim());
  if (!m) return null;
  return { year: Number(m[1]), quarter: Number(m[2]) };
}

/** 並べ替え・山積み用の整数表現(year * 4 + quarter - 1)。解釈できなければ null */
function quarterIndex(value: string | undefined): number | null {
  const q = parseQuarter(value);
  return q ? q.year * 4 + (q.quarter - 1) : null;
}

/** 整数表現を "YYYY-Qn" に戻す */
function quarterLabel(index: number): string {
  return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
}

/** 並べ替え用のキー。不正表記・未記入は末尾に送る */
function quarterKey(value: string | undefined): number {
  const index = quarterIndex(value);
  return index === null ? Number.POSITIVE_INFINITY : index;
}

/** 四半期文字列を時系列に比較する(未記入・不正表記は末尾) */
export function compareQuarter(a: string | undefined, b: string | undefined): number {
  const ka = quarterKey(a);
  const kb = quarterKey(b);
  if (ka === kb) return 0;
  return ka < kb ? -1 : 1;
}

/** 開始〜終了の四半期を 1 セルに収める */
function quarterRange(start: string | undefined, end: string | undefined): string {
  if (start && end && start !== end) return `${start} → ${end}`;
  return start ?? end ?? '';
}

/** ローカル日付を YYYY-MM-DD で返す(期限判定用) */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 期限を過ぎた未完了アクションか */
function isOverdue(action: Action, reference: string): boolean {
  if (action.status === 'done' || !action.due) return false;
  const due = action.due.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  return due < reference;
}

/** エンゲージメント未作成時のメッセージ */
export function emptyDashboard(lang: Lang): string {
  return `# ${label(L.dashboard, lang)}\n\n${label(L.noEngagement, lang)}\n`;
}

// ============================================================
// 概算コストの集計 / Rough cost roll-up
//
// costEstimate は自由記述(「約 2.1 億円」「4,000 万円」「$1.2M」)なので、
// 読めたものだけを合計し、読めなかったものは件数と原文を必ず開示する。
// 為替換算はしない — 勝手なレートで足した瞬間、見積ではなく作り話になる。
// ============================================================

/** 集計で扱う通貨 / Currencies recognised in cost estimates. */
export type CurrencyCode = 'JPY' | 'USD' | 'EUR' | 'GBP';

/** 金額 1 件の解析結果 */
export interface ParsedAmount {
  currency: CurrencyCode;
  /** 範囲表記(「2〜3 億円」)の下限と上限。単一値なら同じ値 */
  min: number;
  max: number;
  /** 「約」「概算」などが付いていた */
  approximate: boolean;
  /** 「/年」「年間」など期間あたりの費用(総額には足さない) */
  recurring: boolean;
}

const UNIT_FACTOR: Record<string, number> = {
  兆: 1e12,
  億: 1e8,
  万: 1e4,
  千: 1e3,
  billion: 1e9,
  bn: 1e9,
  b: 1e9,
  million: 1e6,
  mn: 1e6,
  mm: 1e6,
  m: 1e6,
  thousand: 1e3,
  k: 1e3,
};

/** 数値 + 単位。単位のアルファベットは語の途中で拾わない(months の m など) */
const AMOUNT_RE = /(\d[\d,]*(?:\.\d+)?)\s*(兆|億|万|千|billion|bn|million|mn|mm|thousand|[kmb])?(?![a-z])/gi;
/** 直後が通貨記号なら、単位が無くても金額とみなす */
const CURRENCY_AFTER_RE = /^\s*(円|¥|yen|jpy|ドル|dollars?|usd|\$|eur|€|gbp|£)/i;
/** 日付・割合・員数は金額ではない */
const DATE_AFTER_RE = /^\s*(年|月|日|%|割|[Qq][1-4])/;
const COUNT_AFTER_RE = /^\s*(人|名|件|社|台|回|時間|日間|か月|ヶ月|ケ月|people|persons?|months?|days?)/i;
/** 掛け算が書かれているものは解釈しない(「100 万円 × 30 人月」を 100 万円と読むより、読めないと言う方が安全) */
const MULTIPLIER_RE = /[×✕]|\d\s*\*\s*\d/;
const APPROX_RE = /約|およそ|概算|程度|前後|~|approx|about|circa|ca\./i;
const RECURRING_RE = /年間|毎年|年額|月額|毎月|[／/]\s*(?:年度|年|月|yr|year|month|mo)|per\s*(?:year|annum|month)|annually|monthly/i;
/**
 * 範囲の区切り。前が数字・単位・通貨、後ろが数字か通貨記号のときだけ範囲とみなす。
 * 「2026-Q1」は後ろが Q なので割らない。英語の単位("$2.5M - $4M")も左辺として認める。
 */
const RANGE_SPLIT_RE =
  /(?<=[\d兆億万千円¥$€£]|\d\s?(?:billion|bn|million|mn|mm|thousand|[kmb]))\s*(?:〜|～|~|–|—|ー|-|to)\s*(?=[\d¥$€£]|(?:USD|EUR|GBP|JPY)\s*[\d¥$€£])/i;
/** 左辺が「数字だけ」かどうか(「3〜5 億円」の 3 は単位を継承してよいが、「sprint 3-4」の 3 は駄目) */
const BARE_NUMBER_ONLY_RE = /^\s*(?:約|およそ|概算|approx\.?|about|circa|ca\.)?\s*[¥$€£]?\s*[\d,]+(?:\.\d+)?\s*$/i;
/** 単位も通貨も付かない 4 桁は年度表記とみなす(「2026-2028 で 3 億円」を 2,026 億円にしない) */
const YEARLIKE_RE = /^(?:19|20|21)\d{2}$/;

const CURRENCY_PATTERNS: { code: CurrencyCode; re: RegExp }[] = [
  { code: 'JPY', re: /円|¥|jpy|yen/i },
  { code: 'USD', re: /\$|usd|ドル|dollar/i },
  { code: 'EUR', re: /€|eur|ユーロ/i },
  { code: 'GBP', re: /£|gbp|ポンド/i },
];

/** 全角の数字・記号を半角にそろえる */
function normalizeAmountText(value: string): string {
  return value
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/．/g, '.')
    .replace(/，/g, ',')
    .replace(/＄/g, '$')
    .replace(/￥/g, '¥')
    .replace(/％/g, '%')
    .replace(/　/g, ' ')
    .trim();
}

interface AmountToken {
  value: number;
  factor: number;
  hasUnit: boolean;
  nearCurrency: boolean;
  start: number;
  end: number;
}

/** 数値トークンを拾う(日付・割合・員数は落とす) */
function tokenizeAmounts(s: string): AmountToken[] {
  const tokens: AmountToken[] = [];
  AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null = AMOUNT_RE.exec(s);
  while (m !== null) {
    if (m[0].length === 0) {
      AMOUNT_RE.lastIndex += 1;
    } else {
      const num = Number(m[1].replace(/,/g, ''));
      const unit = m[2] ? m[2].toLowerCase() : '';
      const end = m.index + m[0].length;
      const after = s.slice(end);
      const skip = COUNT_AFTER_RE.test(after) || (!unit && DATE_AFTER_RE.test(after));
      if (Number.isFinite(num) && !skip) {
        tokens.push({
          value: num,
          factor: unit ? (UNIT_FACTOR[unit] ?? 1) : 1,
          hasUnit: Boolean(unit),
          nearCurrency: CURRENCY_AFTER_RE.test(after),
          start: m.index,
          end,
        });
      }
    }
    m = AMOUNT_RE.exec(s);
  }
  return tokens;
}

interface AmountRun {
  value: number;
  hasUnit: boolean;
  nearCurrency: boolean;
  largestFactor: number;
  start: number;
  end: number;
}

/** 「1 億 2000 万」のように続けて書かれたトークンを 1 つの金額にまとめる */
function mergeAmountTokens(s: string, tokens: AmountToken[]): AmountRun[] {
  const runs: AmountRun[] = [];
  for (const t of tokens) {
    const prev = runs.length > 0 ? runs[runs.length - 1] : undefined;
    const contiguous =
      prev !== undefined &&
      prev.hasUnit &&
      prev.largestFactor > t.factor &&
      s.slice(prev.end, t.start).trim().length === 0;
    if (contiguous && prev) {
      prev.value += t.value * t.factor;
      prev.hasUnit = prev.hasUnit || t.hasUnit;
      prev.nearCurrency = prev.nearCurrency || t.nearCurrency;
      prev.largestFactor = Math.max(prev.largestFactor, t.factor);
      prev.end = t.end;
    } else {
      runs.push({
        value: t.value * t.factor,
        hasUnit: t.hasUnit,
        nearCurrency: t.nearCurrency,
        largestFactor: t.factor,
        start: t.start,
        end: t.end,
      });
    }
  }
  return runs;
}

function detectCurrency(s: string): CurrencyCode | null {
  for (const p of CURRENCY_PATTERNS) {
    if (p.re.test(s)) return p.code;
  }
  return null;
}

/**
 * 金額らしさの高い候補だけに絞る。
 * 単位付き > 通貨記号に隣接 > その他、の順で採る。
 */
function pickAmountRuns(s: string, currency: CurrencyCode | null): AmountRun[] {
  const runs = mergeAmountTokens(s, tokenizeAmounts(s));
  const withUnit = runs.filter((r) => r.hasUnit);
  if (withUnit.length > 0) return withUnit;
  const nearCurrency = runs.filter((r) => r.nearCurrency);
  if (nearCurrency.length > 0) return nearCurrency;
  return currency === null ? [] : runs;
}

/**
 * 自由記述のコストを金額として読む。読めなければ null。
 * 読めないものを黙って 0 として扱わないことがこの関数の役目。
 */
export function parseCostEstimate(raw: string | undefined | null): ParsedAmount | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = normalizeAmountText(raw);
  if (s.length === 0) return null;
  if (MULTIPLIER_RE.test(s)) return null;

  const currency = detectCurrency(s);
  const approximate = APPROX_RE.test(s);
  const recurring = RECURRING_RE.test(s);
  const code: CurrencyCode = currency ?? 'JPY';

  // 範囲表記(「5,000 万〜1 億円」「3〜5 億円」)
  const parts = s.split(RANGE_SPLIT_RE);
  if (parts.length === 2) {
    const lo = pickAmountRuns(parts[0], currency);
    const hi = pickAmountRuns(parts[1], currency);
    if (lo.length === 1 && hi.length === 1) {
      // 左辺に単位が無いとき、右辺の単位を継承してよいのは「数字だけが書かれている」場合に限る。
      // 「sprint 3-4 で 2000 万円」の 3 を 3 万円と読んだり、「2026-2028 で 3 億円」の 2026 を
      // 2,026 億円と読んだりするくらいなら、読めなかったと言う方が正しい。
      const loText = parts[0];
      if (!lo[0].hasUnit && (!BARE_NUMBER_ONLY_RE.test(loText) || YEARLIKE_RE.test(loText.trim()))) {
        return null;
      }
      const loValue = lo[0].hasUnit ? lo[0].value : lo[0].value * hi[0].largestFactor;
      const hiValue = hi[0].value;
      if (hi[0].hasUnit || lo[0].hasUnit || currency !== null) {
        return {
          currency: code,
          min: Math.min(loValue, hiValue),
          max: Math.max(loValue, hiValue),
          approximate,
          recurring,
        };
      }
    }
    return null;
  }

  const runs = pickAmountRuns(s, currency);
  // 金額が 2 つ以上あって範囲でもないものは、合算なのか併記なのか決められない。
  // 推測で足すより「読めなかった」と言う方が正しい。
  if (runs.length !== 1) return null;
  const run = runs[0];
  if (!run.hasUnit && currency === null) return null;
  return { currency: code, min: run.value, max: run.value, approximate, recurring };
}

/** 3 桁区切り */
function group(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 金額を日英で書き分ける(日本語は億・万、英語は通貨 + 3 桁区切り) */
function amountLabel(value: number, currency: CurrencyCode): Bilingual {
  if (currency !== 'JPY') {
    const both = `${currency} ${group(value)}`;
    return { ja: both, en: both };
  }
  // 億・万に丸めるが、丸めで桁が消えないところだけ小数 1 桁を残す
  const ja =
    value >= 1e12
      ? `${(value / 1e12).toFixed(1)} 兆円`
      : value >= 1e11
        ? `${group(value / 1e8)} 億円`
        : value >= 1e8
          ? `${(value / 1e8).toFixed(1)} 億円`
          : value >= 1e4 && (value >= 1e6 || value % 1e4 === 0)
            ? `${group(value / 1e4)} 万円`
            : value >= 1e4
              ? `${(value / 1e4).toFixed(1)} 万円`
              : `${group(value)} 円`;
  return { ja, en: `JPY ${group(value)}` };
}

/** 金額を 1 行に整形する */
export function formatAmount(value: number, currency: CurrencyCode, lang: Lang): string {
  return label(amountLabel(value, currency), lang);
}

/** 範囲つきの金額を 1 行に整形する(下限=上限なら 1 つだけ) */
export function formatAmountRange(min: number, max: number, currency: CurrencyCode, lang: Lang): string {
  return label(rangeLabel(min, max, currency), lang);
}

function rangeLabel(min: number, max: number, currency: CurrencyCode): Bilingual {
  if (Math.round(min) === Math.round(max)) return amountLabel(max, currency);
  const a = amountLabel(min, currency);
  const b = amountLabel(max, currency);
  return { ja: `${a.ja} 〜 ${b.ja}`, en: `${a.en} – ${b.en}` };
}

/** コスト集計の対象 1 件 */
export interface CostEntry {
  id: string;
  name: string;
  raw: string;
  amount: ParsedAmount | null;
  startQuarter?: string;
  endQuarter?: string;
}

export interface CurrencyTotal {
  currency: CurrencyCode;
  min: number;
  max: number;
  count: number;
  approximate: boolean;
}

export interface PeriodCost {
  key: number;
  label: string;
  amount: number;
}

/** コスト集計の結果 */
export interface CostRollup {
  /** 通貨ごとの合計(換算しない) */
  totals: CurrencyTotal[];
  /** 合計に含めた作業パッケージ */
  entries: CostEntry[];
  /** 期間あたりの費用として書かれていたもの */
  recurring: CostEntry[];
  /** 金額として読めなかったもの */
  unparsed: CostEntry[];
  /** costEstimate が空のもの */
  missing: string[];
  /** 山積みに使った通貨(件数最多) */
  stackCurrency: CurrencyCode | null;
  quarters: PeriodCost[];
  years: PeriodCost[];
  /** 時期未設定で山積みに載らなかった金額 */
  untimed: number;
  peakYear: PeriodCost | null;
  peakQuarter: PeriodCost | null;
  /** 対象にした作業パッケージ数 */
  packageCount: number;
}

/** 山積みの按分は最大 40 四半期まで(異常な入力で表が暴れないように) */
const MAX_SPREAD_QUARTERS = 40;

/** 作業パッケージのコストを集計する */
export function summarizeCosts(packages: readonly WorkPackage[]): CostRollup {
  const entries: CostEntry[] = [];
  const recurring: CostEntry[] = [];
  const unparsed: CostEntry[] = [];
  const missing: string[] = [];
  const source = list(packages).filter((w): w is WorkPackage => Boolean(w) && typeof w === 'object');

  for (const w of source) {
    // 手書き JSON では数値が入っていることもある。空でなければ文字列として読みにいく。
    const raw =
      typeof w.costEstimate === 'string'
        ? w.costEstimate.trim()
        : w.costEstimate === undefined || w.costEstimate === null
          ? ''
          : String(w.costEstimate).trim();
    if (raw.length === 0) {
      missing.push(w.name);
      continue;
    }
    const amount = parseCostEstimate(raw);
    const entry: CostEntry = {
      id: w.id,
      name: w.name,
      raw,
      amount,
      startQuarter: w.startQuarter,
      endQuarter: w.endQuarter,
    };
    if (!amount) unparsed.push(entry);
    else if (amount.recurring) recurring.push(entry);
    else entries.push(entry);
  }

  const byCurrency = new Map<CurrencyCode, CurrencyTotal>();
  for (const e of entries) {
    const a = e.amount as ParsedAmount;
    const found = byCurrency.get(a.currency);
    if (found) {
      found.min += a.min;
      found.max += a.max;
      found.count += 1;
      found.approximate = found.approximate || a.approximate;
    } else {
      byCurrency.set(a.currency, {
        currency: a.currency,
        min: a.min,
        max: a.max,
        count: 1,
        approximate: a.approximate,
      });
    }
  }
  const totals = [...byCurrency.values()].sort((a, b) => b.count - a.count || b.max - a.max);
  const stackCurrency = totals.length > 0 ? totals[0].currency : null;

  // --- 山積み(主要通貨のみ・範囲は上限側) ---
  const perQuarter = new Map<number, number>();
  let untimed = 0;
  for (const e of entries) {
    const a = e.amount as ParsedAmount;
    if (a.currency !== stackCurrency) continue;
    const value = a.max;
    const s = quarterIndex(e.startQuarter);
    const t = quarterIndex(e.endQuarter);
    if (s === null && t === null) {
      untimed += value;
      continue;
    }
    const from = Math.min(s ?? (t as number), t ?? (s as number));
    const to = Math.max(s ?? (t as number), t ?? (s as number));
    const span = Math.min(to - from + 1, MAX_SPREAD_QUARTERS);
    const share = value / span;
    for (let i = 0; i < span; i += 1) {
      const key = from + i;
      perQuarter.set(key, (perQuarter.get(key) ?? 0) + share);
    }
  }
  const quarters: PeriodCost[] = [...perQuarter.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, amount]) => ({ key, label: quarterLabel(key), amount }));

  const perYear = new Map<number, number>();
  for (const q of quarters) {
    const year = Math.floor(q.key / 4);
    perYear.set(year, (perYear.get(year) ?? 0) + q.amount);
  }
  const years: PeriodCost[] = [...perYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, amount]) => ({ key, label: String(key), amount }));

  const peakOf = (rows: PeriodCost[]): PeriodCost | null =>
    rows.reduce<PeriodCost | null>((best, row) => (best === null || row.amount > best.amount ? row : best), null);

  return {
    totals,
    entries,
    recurring,
    unparsed,
    missing,
    stackCurrency,
    quarters,
    years,
    untimed,
    peakYear: peakOf(years),
    peakQuarter: peakOf(quarters),
    packageCount: source.length,
  };
}

// --- 予算上限らしき記述の検出 ---

/** 案件概要・スコープから読み取った予算上限らしき記述 */
export interface BudgetHint {
  /** 抜き出した文(人が判断できるようそのまま引用する) */
  sentence: string;
  amount: ParsedAmount;
  period: 'total' | 'year' | 'month';
}

const BUDGET_KEYWORD_RE = /予算|上限|キャップ|投資枠|投資額|budget|cap(?![a-z])|ceiling|funding/i;
const PER_YEAR_RE = /年間|毎年|年額|annual|per\s*(?:year|annum)|[／/]\s*年|年\s*[0-9]|年に/i;
const PER_MONTH_RE = /月額|毎月|monthly|per\s*month|[／/]\s*月/i;

/** 文中の最大の金額を採る(上限の文には複数の数字が並びやすい) */
function largestAmountIn(sentence: string): ParsedAmount | null {
  const s = normalizeAmountText(sentence);
  if (MULTIPLIER_RE.test(s)) return null;
  const currency = detectCurrency(s);
  const runs = pickAmountRuns(s, currency).filter((r) => r.hasUnit || currency !== null);
  if (runs.length === 0) return null;
  const best = runs.reduce((a, b) => (b.value > a.value ? b : a));
  return {
    currency: currency ?? 'JPY',
    min: best.value,
    max: best.value,
    approximate: APPROX_RE.test(s),
    recurring: false,
  };
}

/** 案件概要・スコープ・メモから予算上限らしき記述を拾う */
export function findBudgetHints(...texts: (string | undefined)[]): BudgetHint[] {
  const hints: BudgetHint[] = [];
  for (const text of texts) {
    if (!text || typeof text !== 'string') continue;
    // 英語は「. 」+ 大文字で文を切る(「approx. 4M」「ca. 5M」は切らない)
    for (const sentence of text.split(/[。\n\r;；]+|(?<=[a-z0-9)\]%])\.\s+(?=[A-Z])/)) {
      const trimmed = sentence.trim();
      if (trimmed.length === 0 || !BUDGET_KEYWORD_RE.test(trimmed)) continue;
      const amount = largestAmountIn(trimmed);
      if (!amount) continue;
      const period = PER_MONTH_RE.test(trimmed) ? 'month' : PER_YEAR_RE.test(trimmed) ? 'year' : 'total';
      hints.push({ sentence: quoteOneLine(trimmed), amount, period });
    }
  }
  return hints;
}

/**
 * 集計結果と予算上限らしき記述を突き合わせる。
 * 断定はしない — 数字を並べて、判断は人に返す。
 */
export function budgetFindings(rollup: CostRollup, hints: BudgetHint[]): Bilingual[] {
  const out: Bilingual[] = [];
  for (const hint of hints) {
    const cap = hint.amount.max;
    const currency = hint.amount.currency;
    const capText = amountLabel(cap, currency);
    const quote = { ja: `「${hint.sentence}」`, en: `"${hint.sentence}"` };
    const total = rollup.totals.find((t) => t.currency === currency);
    if (!total) {
      out.push({
        ja: `${quote.ja} から上限 ${capText.ja} を読み取ったが、同じ通貨で集計できたコストが無いため比較していない。`,
        en: `${quote.en} suggests a cap of ${capText.en}, but no cost in that currency could be totalled, so nothing was compared.`,
      });
      continue;
    }
    const totalText = rangeLabel(total.min, total.max, currency);

    if (hint.period === 'total') {
      const over = total.max > cap;
      const delta = amountLabel(Math.abs(total.max - cap), currency);
      out.push({
        ja: `${over ? '⚠ ' : '✔ '}${quote.ja} を総額の上限 ${capText.ja} と読み取った。集計した総額は ${totalText.ja} で、${over ? `${delta.ja} 超過している` : `${delta.ja} 余っている`}。`,
        en: `${over ? '⚠ ' : '✔ '}${quote.en} reads as a total cap of ${capText.en}. The costs total ${totalText.en}, i.e. ${over ? `${delta.en} over` : `${delta.en} of headroom`}.`,
      });
      continue;
    }

    // 年あたり(月あたりは 12 倍して年に直して比べる)
    const yearlyCap = hint.period === 'month' ? cap * 12 : cap;
    const yearlyCapText = amountLabel(yearlyCap, currency);
    if (rollup.years.length === 0 || rollup.stackCurrency !== currency) {
      const yearsNeeded = yearlyCap > 0 ? total.max / yearlyCap : 0;
      out.push({
        ja: `⚠ ${quote.ja} を年あたりの上限 ${yearlyCapText.ja} と読み取った。時期が入っていないため年次配分を出せないが、総額 ${totalText.ja} はこの枠で最低 ${yearsNeeded.toFixed(1)} 年分に相当する。各作業パッケージに四半期を入れれば年ごとの山積みが出る。`,
        en: `⚠ ${quote.en} reads as a cap of ${yearlyCapText.en} per year. Without quarters there is no yearly split, but the total of ${totalText.en} is at least ${yearsNeeded.toFixed(1)} years of that allowance. Add quarters to the work packages to get the yearly load.`,
      });
      continue;
    }
    const over = rollup.years.filter((y) => y.amount > yearlyCap);
    const peak = rollup.peakYear;
    const span = `${rollup.years[0].label}–${rollup.years[rollup.years.length - 1].label}`;
    const envelope = amountLabel(yearlyCap * rollup.years.length, currency);
    if (over.length > 0) {
      const detail = over
        .map((y) => `${y.label}: ${amountLabel(y.amount, currency).ja} (+${amountLabel(y.amount - yearlyCap, currency).ja})`)
        .join('、');
      const detailEn = over
        .map((y) => `${y.label}: ${amountLabel(y.amount, currency).en} (+${amountLabel(y.amount - yearlyCap, currency).en})`)
        .join(', ');
      out.push({
        ja: `⚠ ${quote.ja} を年あたりの上限 ${yearlyCapText.ja} と読み取った。山積みが上限を超える年がある — ${detail}。時期をずらすか、その年の作業パッケージを削るかを決めること。`,
        en: `⚠ ${quote.en} reads as a cap of ${yearlyCapText.en} per year. The load exceeds it in ${detailEn}. Either move work to another year or drop something from that year.`,
      });
    } else if (peak) {
      // 年ごとに収まっていても、期間全体の枠と総額の関係は別に確かめる
      const envelopeValue = yearlyCap * rollup.years.length;
      const overall =
        total.max > envelopeValue
          ? {
              ja: `ただし総額 ${totalText.ja} は、${span} の ${rollup.years.length} 年分の枠 ${envelope.ja} を超えている(時期未設定分を含む)。年ごとには収まっていても、期間全体では収まらない。`,
              en: `The total of ${totalText.en} nevertheless exceeds the ${envelope.en} envelope for ${span} (${rollup.years.length} years), untimed work included. It fits year by year but not over the period.`,
            }
          : {
              ja: `総額 ${totalText.ja} も ${span} の ${rollup.years.length} 年分の枠 ${envelope.ja} の内側(残り ${amountLabel(envelopeValue - total.max, currency).ja})。`,
              en: `The total of ${totalText.en} also sits inside the ${envelope.en} envelope for ${span} (${rollup.years.length} years), leaving ${amountLabel(envelopeValue - total.max, currency).en}.`,
            };
      out.push({
        ja: `✔ ${quote.ja} を年あたりの上限 ${yearlyCapText.ja} と読み取った。山積みのピークは ${peak.label} 年の ${amountLabel(peak.amount, currency).ja} で枠内。${overall.ja}`,
        en: `✔ ${quote.en} reads as a cap of ${yearlyCapText.en} per year. The peak load is ${amountLabel(peak.amount, currency).en} in ${peak.label}, inside the cap. ${overall.en}`,
      });
    }
    if (rollup.untimed > 0 && rollup.stackCurrency === currency) {
      out.push({
        ja: `時期未設定の ${amountLabel(rollup.untimed, currency).ja} は、どの年にも積まれていない。上の年次配分はその分だけ軽く見えている。`,
        en: `${amountLabel(rollup.untimed, currency).en} has no timing and lands in no year, so the yearly split above reads lighter than reality.`,
      });
    }
  }
  // 合計に入っていない作業パッケージがある状態での「枠内」は、下限での判定にすぎない。
  // ✔ を額面どおり受け取られるのがいちばん危ないので、判定と同じ場所で必ず断っておく。
  if (out.length > 0) {
    const uncounted = rollup.unparsed.length + rollup.missing.length + rollup.recurring.length;
    if (uncounted > 0) {
      const parts: Bilingual[] = [];
      if (rollup.unparsed.length > 0) {
        parts.push({ ja: `金額として読めないもの ${rollup.unparsed.length} 件`, en: `${rollup.unparsed.length} not readable as an amount` });
      }
      if (rollup.missing.length > 0) {
        parts.push({ ja: `コスト未記入 ${rollup.missing.length} 件`, en: `${rollup.missing.length} with no cost entered` });
      }
      if (rollup.recurring.length > 0) {
        parts.push({ ja: `期間あたりの費用 ${rollup.recurring.length} 件`, en: `${rollup.recurring.length} priced per period` });
      }
      out.push({
        ja: `⚠ この照合は合計に入っている分だけで行っている(${parts.map((p) => p.ja).join('、')})。上の判定は「少なくともこれだけは要る」という下限の話で、「枠に収まる」の証明ではない。`,
        en: `⚠ The comparison covers only what could be totalled (${parts.map((p) => p.en).join(', ')}). Read the verdict above as a floor — the least this will cost — not as proof that it fits.`,
      });
    }
  }
  return out;
}

/** 山積みの棒 */
function loadBar(value: number, max: number, width = 14): string {
  if (max <= 0) return '';
  const filled = Math.max(1, Math.round((value / max) * width));
  return '█'.repeat(Math.min(width, filled));
}

/** コスト節の描画オプション */
export interface CostSectionOptions {
  /** full: 四半期の山積みと金額順の一覧まで出す / compact: 合計と年次だけ */
  detail?: 'full' | 'compact';
  /** 見出しを出すか(既定 true) */
  heading?: boolean;
  /** full の一覧に載せる最大件数 */
  maxRows?: number;
}

/**
 * 概算コスト節 / Cost section.
 * 合計・年ごとの山積み・集計できなかったもの・予算との照合をこの順で返す。
 * 「いくらかかるのか」は役員の最初の質問なので、必ず最初に金額を置く。
 */
export function renderCostSection(
  engagement: Engagement,
  lang: Lang,
  options: CostSectionOptions = {},
): string[] {
  const detail = options.detail ?? 'full';
  const maxRows = options.maxRows ?? 15;
  const packages = list(engagement.workPackages).filter((w) => w && w.status !== 'cancelled');
  if (packages.length === 0) return [];

  const rollup = summarizeCosts(packages);
  const out: string[] = [];
  if (options.heading !== false) {
    out.push(`## ${label(M.cost, lang)}`);
    out.push('');
  }

  if (rollup.totals.length === 0) {
    out.push(label(M.costEmpty, lang));
    out.push('');
    if (rollup.unparsed.length > 0) {
      out.push(
        `- ${label(M.costUnreadable, lang)}: ${rollup.unparsed.length} — ${rollup.unparsed
          .map(
            (e) =>
              `${cell(e.name)}${lang === 'en' ? ' “' : '「'}${cell(quoteOneLine(e.raw, 40))}${lang === 'en' ? '”' : '」'}`,
          )
          .join(', ')}`,
      );
    }
    if (rollup.missing.length > 0) {
      out.push(
        `- ${label(M.costMissing, lang)}: ${rollup.missing.length} — ${rollup.missing
          .slice(0, 8)
          .map((n) => cell(n))
          .join(', ')}`,
      );
    }
    out.push('');
    return out;
  }

  // --- 合計(最初に金額) ---
  const totalLines = rollup.totals.map((t) => {
    const value = rangeLabel(t.min, t.max, t.currency);
    return label(
      {
        ja: `**${M.costTotal.ja}: ${t.approximate ? '概算 ' : ''}${value.ja}**`,
        en: `**${M.costTotal.en}: ${t.approximate ? 'approx. ' : ''}${value.en}**`,
      },
      lang,
    );
  });
  out.push(totalLines.join('  \n'));
  out.push('');
  const notCounted = rollup.packageCount - rollup.entries.length;
  out.push(
    label(
      {
        ja: `${M.costCounted.ja}: ${rollup.entries.length}/${rollup.packageCount} 件(未集計 ${notCounted} 件)`,
        en: `${M.costCounted.en}: ${rollup.entries.length} of ${rollup.packageCount} work packages (${notCounted} not counted)`,
      },
      lang,
    ),
  );
  out.push('');
  if (rollup.totals.length > 1) {
    out.push(`_${label(M.costNoRate, lang)}_`);
    out.push('');
  }

  // --- 年ごとの山積み ---
  const stackCurrency = rollup.stackCurrency ?? 'JPY';
  if (rollup.years.length > 0) {
    const peak = rollup.peakYear ? rollup.peakYear.amount : 0;
    out.push(
      `| ${label(M.costYear, lang)} | ${label(M.costAmount, lang)} | ${label(M.costStack, lang)} |`,
    );
    out.push('| --- | ---: | --- |');
    for (const y of rollup.years) {
      out.push(
        `| ${y.label} | ${label(amountLabel(y.amount, stackCurrency), lang)} | ${loadBar(y.amount, peak)} |`,
      );
    }
    out.push('');
    if (rollup.peakYear) {
      const peakAmount = amountLabel(rollup.peakYear.amount, stackCurrency);
      out.push(
        label(
          {
            ja: `${M.costPeak.ja}: **${rollup.peakYear.label}** — ${peakAmount.ja}`,
            en: `${M.costPeak.en}: **${rollup.peakYear.label}** — ${peakAmount.en}`,
          },
          lang,
        ),
      );
      out.push('');
    }
  }

  // --- 四半期の山積み(詳細表示のみ。長すぎる計画は先頭 24 四半期で打ち切る) ---
  if (detail === 'full' && rollup.quarters.length > 1) {
    const peak = rollup.peakQuarter ? rollup.peakQuarter.amount : 0;
    const shown = rollup.quarters.slice(0, 24);
    out.push(
      `| ${label(M.costQuarter, lang)} | ${label(M.costAmount, lang)} | ${label(M.costStack, lang)} |`,
    );
    out.push('| --- | ---: | --- |');
    for (const q of shown) {
      out.push(
        `| ${q.label} | ${label(amountLabel(q.amount, stackCurrency), lang)} | ${loadBar(q.amount, peak)} |`,
      );
    }
    if (rollup.quarters.length > shown.length) {
      out.push(`| ${moreText(capOf(rollup.quarters.length, shown.length), lang)} |  |  |`);
    }
    out.push('');
  }
  if (rollup.years.length > 0) {
    out.push(`_${label(M.costMethod, lang)}_`);
    out.push('');
  }
  if (rollup.untimed > 0) {
    out.push(
      `⚠ ${label(M.costUntimed, lang)}: ${label(amountLabel(rollup.untimed, stackCurrency), lang)}`,
    );
    out.push('');
  }

  // --- 金額の大きい順(どれが高いのかは 2 番目に来る質問) ---
  if (rollup.entries.length > 0) {
    const ranked = [...rollup.entries].sort(
      (a, b) => (b.amount as ParsedAmount).max - (a.amount as ParsedAmount).max,
    );
    const shown = ranked.slice(0, maxRows);
    out.push(`**${label(M.costRanking, lang)}**`);
    out.push('');
    out.push(
      `| ${label(L.workPackages, lang)} | ${label(M.costRaw, lang)} | ${label(M.costParsed, lang)} | ${label(L.quarter, lang)} |`,
    );
    out.push('| --- | --- | ---: | --- |');
    for (const e of shown) {
      const a = e.amount as ParsedAmount;
      out.push(
        `| ${cell(e.name)} | ${cell(quoteOneLine(e.raw, 40))} | ${label(rangeLabel(a.min, a.max, a.currency), lang)} | ${cell(quarterRange(e.startQuarter, e.endQuarter))} |`,
      );
    }
    if (ranked.length > shown.length) {
      out.push(
        `| ${moreText(capOf(ranked.length, shown.length), lang)} |  |  |  |`,
      );
    }
    out.push('');
  }

  // --- 合計に含めていないもの(黙って落とさない) ---
  const excluded: string[] = [];
  const [openQ, closeQ] = lang === 'en' ? [' “', '”'] : ['「', '」'];
  const withRaw = (rows: readonly CostEntry[]): string =>
    rows
      .slice(0, 8)
      .map((x) => `${cell(x.name)}${openQ}${cell(quoteOneLine(x.raw, 40))}${closeQ}`)
      .join(', ');
  const excludedLine = (kind: Bilingual, count: number, detail: string): string =>
    `- ${label({ ja: `${kind.ja}: **${count}** 件 — ${detail}`, en: `**${count}** ${kind.en} — ${detail}` }, lang)}`;
  if (rollup.unparsed.length > 0) {
    excluded.push(excludedLine(M.costUnreadable, rollup.unparsed.length, withRaw(rollup.unparsed)));
  }
  if (rollup.recurring.length > 0) {
    excluded.push(excludedLine(M.costRecurring, rollup.recurring.length, withRaw(rollup.recurring)));
  }
  if (rollup.missing.length > 0) {
    excluded.push(
      excludedLine(
        M.costMissing,
        rollup.missing.length,
        rollup.missing
          .slice(0, 8)
          .map((n) => cell(n))
          .join(', '),
      ),
    );
  }
  if (excluded.length > 0) {
    out.push(`**${label(M.costExcluded, lang)}**`);
    out.push('');
    out.push(...excluded);
    if (rollup.missing.length > 0) {
      out.push(`- ${label(M.costLowerBound, lang)}`);
    }
    out.push('');
  }

  // --- 予算との照合 ---
  const hints = findBudgetHints(engagement.description, engagement.scope, ...list(engagement.notes));
  const findings = budgetFindings(rollup, hints);
  if (findings.length > 0) {
    out.push(`**${label(M.budgetCheck, lang)}**`);
    out.push('');
    for (const f of findings) out.push(`- ${label(f, lang)}`);
    out.push(`- _${label(M.budgetDisclaimer, lang)}_`);
    out.push('');
  }

  return out;
}

/** 移行状態 1 件の警告文を集める(単独稼働不可・廃棄計画なし) */
function transitionWarnings(t: TransitionState, lang: Lang): string[] {
  const warnings: string[] = [];
  if (!t.standalone) {
    warnings.push(`⚠ **${t.name}** — ${label(M.standaloneWarning, lang)}`);
  }
  if (t.interim && !t.disposalPlan) {
    warnings.push(`⚠ **${t.name}** — ${label(M.disposalWarning, lang)}`);
  }
  return warnings;
}

/** 移行状態の備考セル */
function transitionNote(t: TransitionState, lang: Lang): string {
  const parts: string[] = [];
  const capabilities = list(t.capabilities);
  if (capabilities.length > 0) parts.push(`${label(L.capabilities, lang)}: ${capabilities.join('; ')}`);
  if (t.interim) {
    parts.push(`${label(L.interim, lang)}: ${t.interim}`);
    parts.push(
      t.disposalPlan ? `${label(L.disposalPlan, lang)}: ${t.disposalPlan}` : `⚠ ${label(L.disposalPlan, lang)}: —`,
    );
  }
  if (t.note) parts.push(t.note);
  return cell(parts.join(SEP));
}

/** 作業パッケージの備考セル */
function workPackageNote(w: WorkPackage, lang: Lang, nameOf: (id: string) => string): string {
  const parts: string[] = [];
  const dependsOn = list(w.dependsOn);
  if (dependsOn.length > 0) {
    parts.push(`${label(L.dependsOn, lang)}: ${dependsOn.map(nameOf).join(', ')}`);
  }
  if (w.benefit) {
    const owner = w.benefitOwner ? ` (${label(L.benefitOwner, lang)}: ${w.benefitOwner})` : '';
    parts.push(`${label(L.benefit, lang)}: ${w.benefit}${owner}`);
  }
  if (w.costEstimate) parts.push(`${label(L.cost, lang)}: ${w.costEstimate}`);
  return cell(parts.join(SEP));
}

/** 何件中の何件を出したか。「他 M 件」だけでは母数が分からず、切ったことが伝わらない */
interface RowCap {
  /** 表示しなかった件数 */
  hidden: number;
  /** 元の件数 */
  total: number;
  /** 表示した件数 */
  shown: number;
}

/** 件数の組を作る(`take` を通さない表からも使う) */
function capOf(total: number, shown: number): RowCap {
  return { hidden: Math.max(0, total - shown), total, shown };
}

/** 省略した件数の言い回し。母数と表示件数を必ず添える(黙って切らない) */
function moreText(cap: RowCap, lang: Lang): string {
  return label(
    {
      ja: `${M.more.ja} ${cap.hidden} 件(全 ${cap.total} 件のうち上位 ${cap.shown} 件を表示)`,
      en: `${cap.hidden} ${M.more.en} (showing the top ${cap.shown} of ${cap.total})`,
    },
    lang,
  );
}

/** 表の末尾に「他 M 件(全 N 件のうち…)」を 1 行足す(列数を合わせて表を壊さない) */
function moreRow(cap: RowCap, columns: number, lang: Lang): string {
  const text = moreText(cap, lang);
  const cells = [text, ...new Array<string>(Math.max(0, columns - 1)).fill('')];
  return `| ${cells.join(' | ')} |`;
}

// ---------------------------------------------------------------------------
// 出典 / Provenance
//
// ダッシュボードは「そのまま配る 1 枚」なので、ここに出典が出ていないと
// 台帳に記録した出典が配布物の手前で消える(記録はされているのに誰も見ない)。
// 印とラベルの実体は engagement/model.ts に 1 か所だけ置いてある。
// ---------------------------------------------------------------------------

/**
 * 出典列の凡例。記号だけを出して意味を書かないと、読む側が印を無視する。
 * 3 値の定義は `CONFIDENCE_DEFINITIONS` を引くので、増減しても追従する。
 */
function sourceLegend(lang: Lang): string {
  const line = (l: 'ja' | 'en'): string =>
    [
      ...CONFIDENCE_LEVELS.map((v) => `\`${CONFIDENCE_DEFINITIONS[v].marker}\` ${CONFIDENCE_DEFINITIONS[v].label[l]}`),
      `\`${NO_SOURCE_MARK}\` ${NO_SOURCE_LABEL[l]}`,
    ].join(' / ');
  const ja = `_出典欄: ${line('ja')}。「${NO_SOURCE_MARK} ${NO_SOURCE_LABEL.ja}」は出典が 1 文字も書かれていない行で、「${CONFIDENCE_DEFINITIONS.unknown.marker} ${CONFIDENCE_DEFINITIONS.unknown.label.ja}」(書いたが辿れない)とは別物。_`;
  const en = `_Source column: ${line('en')}. "${NO_SOURCE_MARK} ${NO_SOURCE_LABEL.en}" means nothing was recorded at all, which is not the same as "${CONFIDENCE_DEFINITIONS.unknown.marker} ${CONFIDENCE_DEFINITIONS.unknown.label.en}" (recorded but untraceable)._`;
  if (lang === 'ja') return ja;
  if (lang === 'en') return en;
  return `${ja}\n${en}`;
}

/**
 * 見出し直下に出す 1 行の出典サマリ。
 * 台帳が空のときは何も出さない(0/0 を「100%」や「良好」と読ませないため)。
 */
function provenanceHeadline(e: Engagement, lang: Lang): string[] {
  const summary = summarizeProvenance(e);
  if (summary.total === 0) return [];
  const pct = Math.round((summary.withSource / summary.total) * 100);
  const breakdown = CONFIDENCE_LEVELS.map(
    (v) => `${CONFIDENCE_DEFINITIONS[v].marker} ${summary.byConfidence[v]}`,
  ).join(' / ');
  const ja = `**出典** — ${summary.withSource}/${summary.total} 件に出典あり (${pct}%) · ${breakdown} · 確度未設定 ${summary.byConfidence.unset}`;
  const en = `**Sources** — ${summary.withSource}/${summary.total} entries carry a source (${pct}%) · ${breakdown} · confidence unset ${summary.byConfidence.unset}`;
  const line = lang === 'ja' ? ja : lang === 'en' ? en : `${ja}\n${en}`;
  const out = [line];
  if (summary.withoutSource > 0) {
    const nja = `_出典の無い ${summary.withoutSource} 件は、後から真偽を確かめられません。この 1 枚を配る前に、数字と固有名詞の行だけでも出典を埋めてください。_`;
    const nen = `_The ${summary.withoutSource} entries without a source cannot be checked later. Before handing this page over, fill in at least the rows carrying figures and proper nouns._`;
    out.push('');
    out.push(lang === 'ja' ? nja : lang === 'en' ? nen : `${nja}\n${nen}`);
  }
  out.push('');
  return out;
}

/** 上位 n 件に絞った結果 */
interface Taken<T> extends RowCap {
  rows: readonly T[];
}

/**
 * compact のときだけ上位 n 件に絞る(件数は `capRows` に合わせる)。
 * 実際に切ったかどうかを `track` に記録する。切っていないのに「絞った」と注記すると、
 * 出ていない行があると読者に誤解させるため。
 */
function take<T>(rows: readonly T[], compact: boolean, limit: number, track?: TrimTracker): Taken<T> {
  if (!compact) return { rows, ...capOf(rows.length, rows.length) };
  const capped = capRows(rows, limit);
  if (capped.capped && track) track.any = true;
  return { rows: capped.rows, hidden: capped.hidden, total: capped.total, shown: capped.rows.length };
}

/** 実際に切ったかどうかの記録 */
interface TrimTracker {
  any: boolean;
}

/** 描画の絞り込み設定 */
interface RenderOptions {
  compact: boolean;
  limit: number;
  /** 実際に切ったかどうかを呼び出し元に返すための記録 */
  trim: TrimTracker;
}

/**
 * ロードマップ節 / Roadmap section.
 * 移行状態を四半期順に並べ、その下に属する作業パッケージをぶら下げる。
 */
function roadmapSection(e: Engagement, lang: Lang, opts: RenderOptions): string[] {
  // 手書き JSON に null が混ざっていても描画で落ちない(MCP ツールが例外を投げてはならない)
  const allTransitions = list(e.transitions).filter((t): t is TransitionState => Boolean(t) && typeof t === 'object');
  const allWorkPackages = list(e.workPackages).filter((w): w is WorkPackage => Boolean(w) && typeof w === 'object');
  if (allTransitions.length === 0 && allWorkPackages.length === 0) return [];

  const nameById = new Map(allWorkPackages.map((w) => [w.id, w.name]));
  const nameOf = (id: string): string => nameById.get(id) ?? id;

  // 移行アーキテクチャの並びは利用者が指定した order が正(HTML ダッシュボードも order 順)。
  // 目標時期は order が同じときの補助キーに留める。
  const transitions = [...allTransitions].sort(
    (a, b) =>
      (a.order || 0) - (b.order || 0) ||
      compareQuarter(a.targetQuarter, b.targetQuarter) ||
      a.name.localeCompare(b.name),
  );
  const known = new Set(allTransitions.map((t) => t.id));
  const grouped = new Map<string, WorkPackage[]>();
  const unassigned: WorkPackage[] = [];
  for (const w of allWorkPackages) {
    if (w.transitionId && known.has(w.transitionId)) {
      const list = grouped.get(w.transitionId);
      if (list) list.push(w);
      else grouped.set(w.transitionId, [w]);
    } else {
      unassigned.push(w);
    }
  }
  const byStart = (a: WorkPackage, b: WorkPackage): number =>
    compareQuarter(a.startQuarter ?? a.endQuarter, b.startQuarter ?? b.endQuarter) || a.name.localeCompare(b.name);

  const out: string[] = [];
  out.push(`## ${label(L.roadmap, lang)}`);
  out.push('');
  out.push(
    `| ${label(L.quarter, lang)} | ${label(L.title, lang)} | ${label(L.status, lang)} | ${label(L.owner, lang)} | ${label(L.businessValue, lang)} | ${label(L.effort, lang)} | ${label(L.note, lang)} |`,
  );
  out.push('| --- | --- | :-: | --- | :-: | :-: | --- |');

  const wpRow = (w: WorkPackage, nested: boolean): string => {
    const cells = [
      cell(quarterRange(w.startQuarter, w.endQuarter)),
      `${nested ? '↳ ' : ''}${cell(w.name)}`,
      labelOf(WORK_PACKAGE_STATUS_LABEL, w.status, lang),
      cell(w.owner),
      labelOf(PRIORITY_LABEL, w.businessValue, lang),
      labelOf(PRIORITY_LABEL, w.effort, lang),
      workPackageNote(w, lang, nameOf),
    ];
    return `| ${cells.join(' | ')} |`;
  };

  const warnings: string[] = [];
  for (const t of transitions) {
    const flagged = !t.standalone || Boolean(t.interim && !t.disposalPlan);
    const standalone = `${t.standalone ? '✔' : '⚠'} ${label(t.standalone ? L.standaloneYes : L.standaloneNo, lang)}`;
    const cells = [
      cell(t.targetQuarter),
      `**${flagged ? '⚠ ' : ''}${cell(t.name)}**`,
      standalone,
      '',
      '',
      '',
      transitionNote(t, lang),
    ];
    out.push(`| ${cells.join(' | ')} |`);
    const members = take((grouped.get(t.id) ?? []).sort(byStart), opts.compact, opts.limit, opts.trim);
    for (const w of members.rows) out.push(wpRow(w, true));
    if (members.hidden > 0) out.push(moreRow(members, 7, lang));
    warnings.push(...transitionWarnings(t, lang));
  }

  if (unassigned.length > 0) {
    if (transitions.length > 0) {
      out.push(`|  | **${label(M.unassigned, lang)}** |  |  |  |  |  |`);
    }
    const orphans = take([...unassigned].sort(byStart), opts.compact, opts.limit, opts.trim);
    for (const w of orphans.rows) out.push(wpRow(w, transitions.length > 0));
    if (orphans.hidden > 0) out.push(moreRow(orphans, 7, lang));
  }

  out.push('');
  if (transitions.length > 0 && !opts.compact) {
    // 表の読み方(移行状態の行の「状態」欄は進捗ではなく単独稼働の可否)を添える
    out.push(`_${label(M.transitionLegend, lang)}_`);
    out.push('');
  }
  if (warnings.length > 0) {
    const shown = take(warnings, opts.compact, opts.limit, opts.trim);
    out.push(`**${label(M.warnings, lang)}**`);
    out.push('');
    for (const w of shown.rows) out.push(`- ${w}`);
    if (shown.hidden > 0) out.push(`- ${moreText(shown, lang)}`);
    out.push('');
  }
  return out;
}

/** リスクマトリクス節 / Risk matrix (level x status counts). */
function riskMatrixSection(e: Engagement, lang: Lang): string[] {
  if (e.risks.length === 0) return [];

  const levels: RiskLevel[] = [...RISK_LEVELS].reverse(); // 致命的 → 低
  const statuses: readonly RiskStatus[] = RISK_STATUSES;
  const counts = new Map<string, number>();
  for (const r of e.risks) {
    const key = `${r.level}/${r.status}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const at = (level: RiskLevel, status: RiskStatus): number => counts.get(`${level}/${status}`) ?? 0;
  const show = (n: number): string => (n === 0 ? '·' : String(n));

  const out: string[] = [];
  out.push(`## ${label(L.riskMatrix, lang)}`);
  out.push('');
  out.push(
    `| ${label(L.level, lang)} | ${statuses.map((s) => label(RISK_STATUS_LABEL[s], lang)).join(' | ')} | ${label(M.total, lang)} |`,
  );
  out.push(`| --- |${statuses.map(() => ' :-: |').join('')} :-: |`);
  for (const level of levels) {
    const row = statuses.map((s) => at(level, s));
    const sum = row.reduce((a, b) => a + b, 0);
    out.push(
      `| ${label(RISK_LEVEL_LABEL[level], lang)} | ${row.map(show).join(' | ')} | ${sum === 0 ? '·' : `**${sum}**`} |`,
    );
  }
  const totals = statuses.map((s) => levels.reduce((sum, level) => sum + at(level, s), 0));
  out.push(
    `| **${label(M.total, lang)}** | ${totals.map((n) => (n === 0 ? '·' : `**${n}**`)).join(' | ')} | **${e.risks.length}** |`,
  );
  out.push('');
  return out;
}

/** 評価 1 件を表に描く */
function assessmentBlock(a: Assessment, lang: Lang, opts: RenderOptions): string[] {
  const out: string[] = [];
  const allFactors = list(a.factors);
  const scale = Number.isFinite(a.scale) && a.scale > 0 ? a.scale : 5;
  const heading = `${labelOf(ASSESSMENT_KIND_LABEL, a.kind, lang)}: ${a.title}`;
  out.push(`### ${heading}`);
  out.push('');
  const meta = [`${label(M.scale, lang)}: 1–${scale}`];
  if (a.assessedAt) meta.push(`${label(M.assessedAt, lang)}: ${a.assessedAt.slice(0, 10)}`);
  out.push(`_${meta.join(' | ')}_`);
  out.push('');

  if (allFactors.length > 0) {
    const withNote = allFactors.some((f) => Boolean(f.note));
    const noteHead = withNote ? ` ${label(L.note, lang)} |` : '';
    const noteAlign = withNote ? ' --- |' : '';
    out.push(
      `| ${label(L.factor, lang)} | ${label(L.current, lang)} | ${label(L.target, lang)} | ${label(L.gap, lang)} |${noteHead}`,
    );
    out.push(`| --- | --- | --- | :-: |${noteAlign}`);
    const bar = (value: number): string => {
      const clamped = Math.max(0, Math.min(scale, value));
      return `\`${progressBar((clamped / scale) * 100, 10)}\` ${value}`;
    };
    // compact ではギャップの大きい因子から見せる(残りは件数で示す)
    const ordered = opts.compact
      ? [...allFactors].sort((x, y) => y.target - y.current - (x.target - x.current))
      : allFactors;
    const shown = take(ordered, opts.compact, opts.limit, opts.trim);
    for (const f of shown.rows) {
      const gap = f.target - f.current;
      const gapCell = gap > 0 ? `+${gap}` : String(gap);
      const note = withNote ? ` ${cell(f.note)} |` : '';
      out.push(`| ${cell(f.name)} | ${bar(f.current)} | ${bar(f.target)} | ${gapCell} |${note}`);
    }
    if (shown.hidden > 0) out.push(moreRow(shown, withNote ? 5 : 4, lang));
    if (allFactors.length > 1) {
      // 平均は表示件数ではなく全因子で計算する(絞り込みで数字が変わってはいけない)
      const avg = (pick: (n: { current: number; target: number }) => number): number =>
        Math.round((allFactors.reduce((sum, f) => sum + pick(f), 0) / allFactors.length) * 10) / 10;
      const current = avg((f) => f.current);
      const target = avg((f) => f.target);
      const gap = Math.round((target - current) * 10) / 10;
      const note = withNote ? ' |' : '';
      out.push(
        `| **${label(M.average, lang)}** | ${bar(current)} | ${bar(target)} | ${gap > 0 ? `+${gap}` : gap} |${note}`,
      );
    }
    out.push('');
  }
  if (a.summary) {
    out.push(`**${label(M.summary, lang)}**: ${a.summary}`);
    out.push('');
  }
  return out;
}

/** 評価節 / Assessments section. */
function assessmentsSection(e: Engagement, lang: Lang, opts: RenderOptions): string[] {
  const assessments = list(e.assessments);
  if (assessments.length === 0) return [];
  const out: string[] = [];
  out.push(`## ${label(L.assessments, lang)}`);
  out.push('');
  // 新しい評価から順に(評価日が無いものは末尾)
  const at = (a: Assessment): string => a.assessedAt ?? '';
  const sorted = [...assessments].sort((a, b) => (at(a) < at(b) ? 1 : at(a) > at(b) ? -1 : 0));
  const shown = take(sorted, opts.compact, opts.limit, opts.trim);
  for (const a of shown.rows) out.push(...assessmentBlock(a, lang, opts));
  if (shown.hidden > 0) {
    out.push(`_${moreText(shown, lang)}_`);
    out.push('');
  }
  return out;
}

// --- 節の選択 ---

/** ダッシュボードで指定できる節 / Selectable dashboard sections. */
export const DASHBOARD_SECTIONS = [
  'summary',
  'phases',
  'roadmap',
  'cost',
  'stakeholders',
  'risks',
  'riskMatrix',
  'decisions',
  'actions',
  'deliverables',
  'assessments',
  'notes',
] as const;

export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

/** 節の説明(ツールのスキーマ説明にそのまま使える) */
export const DASHBOARD_SECTION_LABEL: Record<DashboardSection, Bilingual> = {
  summary: { ja: '概況(フェーズ到達点と登録件数)', en: 'Summary (phase reached, what is recorded)' },
  phases: { ja: 'ADM フェーズ進捗', en: 'ADM phase progress' },
  roadmap: { ja: 'ロードマップ', en: 'Roadmap' },
  cost: { ja: '概算コスト(合計・年ごとの山積み・予算照合)', en: 'Rough cost (total, yearly load, budget check)' },
  stakeholders: { ja: 'ステークホルダー', en: 'Stakeholders' },
  risks: { ja: 'リスク一覧', en: 'Risk list' },
  riskMatrix: { ja: 'リスクマトリクス', en: 'Risk matrix' },
  decisions: { ja: '決定事項', en: 'Decisions' },
  actions: { ja: 'アクション', en: 'Actions' },
  deliverables: { ja: '成果物', en: 'Deliverables' },
  assessments: { ja: '評価(成熟度・変革準備度)', en: 'Assessments' },
  notes: { ja: 'メモ', en: 'Notes' },
};

/** よくある言い換えを受け付ける(前提知識ゼロで呼べるように) */
const SECTION_ALIAS: Record<string, DashboardSection> = {
  overview: 'summary',
  概況: 'summary',
  adm: 'phases',
  phase: 'phases',
  フェーズ: 'phases',
  wp: 'roadmap',
  workpackages: 'roadmap',
  'work-packages': 'roadmap',
  timeline: 'roadmap',
  ロードマップ: 'roadmap',
  budget: 'cost',
  costs: 'cost',
  money: 'cost',
  コスト: 'cost',
  予算: 'cost',
  stakeholder: 'stakeholders',
  ステークホルダー: 'stakeholders',
  risk: 'risks',
  リスク: 'risks',
  riskmatrix: 'riskMatrix',
  'risk-matrix': 'riskMatrix',
  decision: 'decisions',
  決定: 'decisions',
  action: 'actions',
  アクション: 'actions',
  deliverable: 'deliverables',
  成果物: 'deliverables',
  assessment: 'assessments',
  readiness: 'assessments',
  maturity: 'assessments',
  評価: 'assessments',
  note: 'notes',
  メモ: 'notes',
};

function resolveSections(requested: readonly string[] | undefined): {
  active: Set<DashboardSection>;
  unknown: string[];
} {
  const all = new Set<DashboardSection>(DASHBOARD_SECTIONS);
  if (!Array.isArray(requested) || requested.length === 0) return { active: all, unknown: [] };
  const active = new Set<DashboardSection>();
  const unknown: string[] = [];
  const known = new Set<string>(DASHBOARD_SECTIONS);
  for (const raw of requested) {
    if (typeof raw !== 'string') continue;
    const key = raw.trim();
    if (key.length === 0) continue;
    const lower = key.toLowerCase();
    if (lower === 'all' || lower === '*') {
      for (const s of DASHBOARD_SECTIONS) active.add(s);
      continue;
    }
    const canonical = known.has(key)
      ? (key as DashboardSection)
      : (SECTION_ALIAS[lower] ?? (known.has(lower) ? (lower as DashboardSection) : undefined));
    if (canonical) active.add(canonical);
    else unknown.push(key);
  }
  return { active, unknown };
}

/** `renderDashboardMarkdown` の絞り込み指定 */
export interface DashboardMarkdownOptions {
  /**
   * 表示する節。省略・空配列なら全部。
   * `DASHBOARD_SECTIONS` のキーのほか、よくある言い換え(budget, リスク など)も受け付ける。
   */
  sections?: readonly string[];
  /**
   * 各表を上位のみに絞り、残りは件数で示す。
   * - `true`: 印刷 1 枚向け。`limit` 既定 5
   * - `false`: 件数がいくら多くても全件出す(自動の絞り込みも止める)
   * - 未指定: 件数が多いときだけ自動で絞る(`limit` 既定 `OUTPUT_LIMITS.rows`)
   */
  compact?: boolean;
  /** 1 表あたり件数。指定するとその件数で絞る(compact=false のときは無視) */
  limit?: number;
  /**
   * 件数が多いときの自動絞り込み。既定 true。
   * ファイルへの書き出しなど「全件が要る」用途では false にする。
   */
  auto?: boolean;
}

/**
 * 自動で絞り込みに切り替える件数。
 * 明細の合計がこれを超えると 1 回の応答が 1 万文字を超え始める(実測: 60/60/60 で 13,263 字 ja)。
 */
export const DASHBOARD_AUTO_COMPACT_THRESHOLD = OUTPUT_LIMITS.rows * 2;

/**
 * 自動絞り込みの判定に使う件数(明細行になるもの)。
 * `take()` で切られる一覧はすべてここに数える。数え漏らすと、その種別ばかりの案件
 * (決定事項だけ 80 件、メモだけ 80 件など)で自動絞り込みが一切効かない。
 */
function detailRowCount(e: Engagement): number {
  return (
    list(e.risks).length +
    list(e.actions).length +
    list(e.stakeholders).length +
    list(e.deliverables).length +
    list(e.workPackages).length +
    list(e.decisions).length +
    list(e.notes).length
  );
}

/** ダッシュボードの Markdown を生成する */
export function renderDashboardMarkdown(
  engagement: Engagement | null,
  lang: Lang = 'both',
  options: DashboardMarkdownOptions = {},
): string {
  if (!engagement) return emptyDashboard(lang);

  const e = engagement;
  const { active, unknown } = resolveSections(options.sections);
  // compact=false は「全件出せ」という明示なので、自動の絞り込みより強い。
  const explicitLimit =
    Number.isFinite(options.limit) && (options.limit as number) > 0 ? Math.floor(options.limit as number) : null;
  const refusedCompact = options.compact === false;
  // compact=true も limit=<件数> も「絞れ」という指定。どちらも利用者の意思。
  const requestedCompact = options.compact === true || explicitLimit !== null;
  // 件数が多い案件を素で出すと 1 回の応答が会話を埋める。黙って切らずに、切ったことを末尾で必ず言う。
  const autoCompact =
    !refusedCompact &&
    !requestedCompact &&
    options.auto !== false &&
    detailRowCount(e) > DASHBOARD_AUTO_COMPACT_THRESHOLD;
  const compact = !refusedCompact && (requestedCompact || autoCompact);
  // 明示の compact は「印刷 1 枚」用途なので今まで通り 5 件、自動のときは共通の上限に合わせる。
  const limit = explicitLimit ?? (options.compact === true ? 5 : OUTPUT_LIMITS.rows);
  const trim: TrimTracker = { any: false };
  const opts: RenderOptions = { compact, limit, trim };
  /**
   * 自由記述の欄。絞り込み中は 1 セルの長さも上限で抑える
   * (行数を絞っても 1 行が数百字あると結局 1 枚に収まらない)。切ったことはセル内に残る。
   */
  const longCell = (value: string | undefined): string => (compact ? cell(capCell(value ?? '')) : cell(value));
  /** 表の外(見出し・箇条書き)に出る自由記述。絞り込み中だけ長さを抑える */
  const longText = (value: string | undefined): string => (compact ? capCell(value ?? '') : (value ?? ''));
  const show = (section: DashboardSection): boolean => active.has(section);
  const progress = summarizeProgress(e);
  const currentPhase = findPhase(e.currentPhaseId);
  const out: string[] = [];

  out.push(`# ${label(L.dashboard, lang)}: ${e.name}`);
  out.push('');

  const meta: string[] = [];
  if (e.client) meta.push(`**${label(L.client, lang)}**: ${e.client}`);
  if (e.industry) meta.push(`**${label(L.industry, lang)}**: ${e.industry}`);
  meta.push(
    `**${label(L.currentPhase, lang)}**: ${currentPhase ? `${currentPhase.code} — ${label(currentPhase.name, lang)}` : e.currentPhaseId}`,
  );
  meta.push(`**${label(L.updatedAt, lang)}**: ${formatDate(e.updatedAt)}`);
  out.push(meta.join('  \n'));
  out.push('');

  if (show('summary')) {
    if (e.description) {
      out.push(`**${label(L.description, lang)}**: ${e.description}`);
      out.push('');
    }
    if (e.scope) {
      out.push(`**${label(L.scope, lang)}**: ${e.scope}`);
      out.push('');
    }
  }

  // --- 現在地(「進捗 %」は ADM フェーズの消化率であって仕事の出来高ではない) ---
  const reference = today();
  const openRisks = e.risks.filter((r) => r.status === 'open' || r.status === 'mitigating').length;
  const openActions = e.actions.filter((a) => a.status !== 'done').length;
  const overdueActions = e.actions.filter((a) => isOverdue(a, reference)).length;
  if (show('summary')) {
    const effective = progress.total - progress.skipped;
    // 「進捗 15%」ではなく「何の 15% か」を先に言う
    const walked: Bilingual = {
      ja: `ADM フェーズ ${progress.completed}/${effective} 完了`,
      en: `${progress.completed}/${effective} ADM phases complete`,
    };
    out.push(
      `\`${progressBar(progress.percent)}\` **${label(walked, lang)}** (${progress.percent}%)` +
        (progress.inProgress > 0 ? ` · ${label(M.phasesInProgress, lang)} ${progress.inProgress}` : '') +
        (progress.skipped > 0 ? ` · ${label(M.phasesSkipped, lang)} ${progress.skipped}` : ''),
    );
    out.push('');
    out.push(`_${label(M.phaseShareNote, lang)}_`);
    out.push('');

    // 「積み上がっているもの」— 3 か月分の作業量はこちらに出る
    const overdueSuffix = overdueActions > 0 ? ` (⚠ ${overdueActions} ${label(M.overdue, lang)})` : '';
    const counts = [
      `${label(L.stakeholders, lang)}: ${list(e.stakeholders).length}`,
      `${label(L.risks, lang)}: ${list(e.risks).length} (${openRisks} ${label(L.openItems, lang)})`,
      `${label(L.workPackages, lang)}: ${list(e.workPackages).length}`,
      `${label(L.transitions, lang)}: ${list(e.transitions).length}`,
      `${label(L.assessments, lang)}: ${list(e.assessments).length}`,
      `${label(L.decisions, lang)}: ${list(e.decisions).length}`,
      `${label(L.deliverables, lang)}: ${list(e.deliverables).length}`,
      `${label(L.actions, lang)}: ${list(e.actions).length} (${openActions} ${label(L.openItems, lang)})${overdueSuffix}`,
    ];
    // 役員の最初の質問は「いくらかかるのか」。合計が出るなら概況に並べる。
    const rollup = summarizeCosts(list(e.workPackages).filter((w) => w && w.status !== 'cancelled'));
    if (rollup.totals.length > 0) {
      const t = rollup.totals[0];
      counts.push(`${label(M.cost, lang)}: ${label(rangeLabel(t.min, t.max, t.currency), lang)}`);
    }
    out.push(`**${label(M.recorded, lang)}** — ${counts.join(' | ')}`);
    out.push('');
    // 件数だけを見せると「これだけ積み上がった」で話が終わる。
    // 何件が辿れるのかを同じ高さに並べておく。
    out.push(...provenanceHeadline(e, lang));
  }

  // --- ADM フェーズ進捗 ---
  if (show('phases')) {
    out.push(`## ${label(L.admProgress, lang)}`);
    out.push('');
    out.push(`| | ${label(L.phase, lang)} | ${label(L.status, lang)} | ${label(L.note, lang)} |`);
    out.push('| :-: | --- | --- | --- |');
    for (const phase of ADM_PHASES) {
      const p = e.phases.find((x) => x.phaseId === phase.id);
      const status = p?.status ?? 'not_started';
      const icon = PHASE_STATUS_ICON[status] ?? '?';
      const marker = phase.id === e.currentPhaseId ? '**→**' : icon;
      out.push(
        `| ${marker} | ${phase.code}. ${cell(label(phase.name, lang))} | ${icon} ${labelOf(PHASE_STATUS_LABEL, status, lang)} | ${cell(p?.note)} |`,
      );
    }
    out.push('');
  }

  // --- ロードマップ(移行アーキテクチャ + 作業パッケージ) ---
  if (show('roadmap')) out.push(...roadmapSection(e, lang, opts));

  // --- 概算コスト ---
  // ダッシュボードは 1 枚に近づけたいので四半期の山積みまでは出さない(そこは get_roadmap の担当)
  if (show('cost')) {
    // 絞り込み中に非圧縮より多く出さない(limit は 20 まで上がるので下限側を採る)
    out.push(...renderCostSection(e, lang, { detail: 'compact', maxRows: compact ? Math.min(limit, 8) : 8 }));
  }

  // --- ステークホルダー ---
  if (show('stakeholders')) {
    out.push(`## ${label(L.stakeholders, lang)}`);
    out.push('');
    if (e.stakeholders.length === 0) {
      out.push(label(L.none, lang));
    } else {
      out.push(
        `| ${label(L.name, lang)} | ${label(L.role, lang)} | ${label(L.influence, lang)} | ${label(L.interest, lang)} | ${label(L.concerns, lang)} | ${label(L.approach, lang)} | ${label(M.source, lang)} |`,
      );
      out.push('| --- | --- | :-: | :-: | --- | --- | --- |');
      // compact では影響力 × 関心度の高い人から見せる(絞るときに落とすのは末端の人)
      const weight = (s: Stakeholder): number => {
        const score: Record<string, number> = { high: 3, medium: 2, low: 1 };
        return (score[s.influence] ?? 0) * 2 + (score[s.interest] ?? 0);
      };
      const ordered = compact ? [...e.stakeholders].sort((a, b) => weight(b) - weight(a)) : e.stakeholders;
      const shown = take(ordered, compact, limit, trim);
      for (const s of shown.rows) {
        out.push(
          `| ${longCell(s.name)} | ${longCell([s.role, s.organization].filter(Boolean).join(' / '))} | ${labelOf(INFLUENCE_LABEL, s.influence, lang)} | ${labelOf(INFLUENCE_LABEL, s.interest, lang)} | ${longCell(list(s.concerns).join('; '))} | ${longCell(s.approach)} | ${sourceCell(s, lang)} |`,
        );
      }
      if (shown.hidden > 0) out.push(moreRow(shown, 7, lang));
      out.push('');
      out.push(sourceLegend(lang));
    }
    out.push('');
  }

  // --- リスク ---
  if (show('risks')) {
    out.push(`## ${label(L.risks, lang)}`);
    out.push('');
    if (e.risks.length === 0) {
      out.push(label(L.none, lang));
    } else {
      out.push(
        `| ${label(L.title, lang)} | ${label(L.level, lang)} | ${label(L.residual, lang)} | ${label(L.status, lang)} | ${label(L.owner, lang)} | ${label(L.mitigation, lang)} | ${label(M.source, lang)} |`,
      );
      out.push('| --- | :-: | :-: | :-: | --- | --- | --- |');
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const rank = (level: RiskLevel): number => order[level] ?? 9;
      const sorted = [...e.risks].sort((a, b) => rank(a.level) - rank(b.level));
      const shown = take(sorted, compact, limit, trim);
      for (const r of shown.rows) {
        out.push(
          `| ${longCell(r.title)} | ${labelOf(RISK_LEVEL_LABEL, r.level, lang)} | ${labelOf(RISK_LEVEL_LABEL, r.residualLevel, lang)} | ${labelOf(RISK_STATUS_LABEL, r.status, lang)} | ${longCell(r.owner)} | ${longCell(r.mitigation)} | ${sourceCell(r, lang)} |`,
        );
      }
      if (shown.hidden > 0) out.push(moreRow(shown, 7, lang));
      out.push('');
      out.push(sourceLegend(lang));
    }
    out.push('');
  }

  // --- リスクマトリクス ---
  if (show('riskMatrix')) out.push(...riskMatrixSection(e, lang));

  // --- 決定事項 ---
  if (show('decisions')) {
    out.push(`## ${label(L.decisions, lang)}`);
    out.push('');
    if (e.decisions.length === 0) {
      out.push(label(L.none, lang));
    } else {
      const shown = take(e.decisions, compact, limit, trim);
      for (const d of shown.rows) {
        out.push(`### ${longText(d.title)} — ${labelOf(DECISION_STATUS_LABEL, d.status, lang)}`);
        out.push('');
        if (d.context && !compact) out.push(`- ${d.context}`);
        out.push(`- **${label(L.decision, lang)}**: ${longText(d.decision)}`);
        if (d.rationale && !compact) out.push(`- **${label(L.rationale, lang)}**: ${d.rationale}`);
        if (d.decidedBy) out.push(`- **${label(L.decidedBy, lang)}**: ${longText(d.decidedBy)}`);
        out.push('');
      }
      if (shown.hidden > 0) {
        out.push(`_${moreText(shown, lang)}_`);
        out.push('');
      }
    }
    out.push('');
  }

  // --- アクション ---
  if (show('actions')) {
    out.push(`## ${label(L.actions, lang)}`);
    out.push('');
    if (e.actions.length === 0) {
      out.push(label(L.none, lang));
    } else {
      out.push(
        `| ${label(L.title, lang)} | ${label(L.owner, lang)} | ${label(L.due, lang)} | ${label(L.priority, lang)} | ${label(L.status, lang)} |`,
      );
      out.push('| --- | --- | --- | :-: | :-: |');
      const prio: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const rank = (p: Priority): number => prio[p] ?? 9;
      const sorted = [...e.actions].sort(
        (a, b) => Number(a.status === 'done') - Number(b.status === 'done') || rank(a.priority) - rank(b.priority),
      );
      const shown = take(sorted, compact, limit, trim);
      for (const a of shown.rows) {
        // 期限を過ぎた未完了アクションは期限欄に印を付ける
        const due = isOverdue(a, reference) ? `⚠ ${cell(a.due)}` : cell(a.due);
        out.push(
          `| ${longCell(a.title)} | ${longCell(a.owner)} | ${due} | ${labelOf(PRIORITY_LABEL, a.priority, lang)} | ${labelOf(ACTION_STATUS_LABEL, a.status, lang)} |`,
        );
      }
      if (shown.hidden > 0) out.push(moreRow(shown, 5, lang));
    }
    out.push('');
  }

  // --- 成果物 ---
  if (show('deliverables')) {
    out.push(`## ${label(L.deliverables, lang)}`);
    out.push('');
    if (e.deliverables.length === 0) {
      out.push(label(L.none, lang));
    } else {
      out.push(
        `| ${label(L.title, lang)} | ${label(L.phase, lang)} | ${label(L.status, lang)} | ${label(L.owner, lang)} | ${label(L.link, lang)} |`,
      );
      out.push('| --- | :-: | :-: | --- | --- |');
      const shown = take(e.deliverables, compact, limit, trim);
      for (const d of shown.rows) {
        const ph = d.phaseId ? findPhase(d.phaseId) : undefined;
        out.push(
          `| ${longCell(d.name)} | ${ph ? ph.code : ''} | ${labelOf(DELIVERABLE_STATUS_LABEL, d.status, lang)} | ${longCell(d.owner)} | ${longCell(d.link)} |`,
        );
      }
      if (shown.hidden > 0) out.push(moreRow(shown, 5, lang));
    }
    out.push('');
  }

  // --- 評価(成熟度 / 変革準備度) ---
  if (show('assessments')) out.push(...assessmentsSection(e, lang, opts));

  // --- メモ ---
  if (show('notes') && e.notes.length > 0) {
    out.push(`## ${label(L.notes, lang)}`);
    out.push('');
    const shown = take(e.notes, compact, limit, trim);
    for (const n of shown.rows) out.push(`- ${longText(n)}`);
    if (shown.hidden > 0) out.push(`- ${moreText(shown, lang)}`);
    out.push('');
  }

  // 実際に切った表があるときだけ案内を出す(切っていないのに注記を出すと、
  // 出ていない行があると誤解させる)
  if (compact && trim.any) {
    // 利用者が compact / limit を指定したときに「件数が多いため」と言うと、
    // 自分の指定が効いていないように読める。理由は実際のきっかけどおりに書く。
    out.push(`_${label(trimNote(limit, autoCompact), lang)}_`);
    out.push('');
  }
  if (unknown.length > 0) {
    // 指定ミスで黙って空になると原因が分からない。使えるキーをその場で出す。
    out.push(
      `_${label(M.unknownSections, lang)}: ${unknown.map((u) => `\`${cell(u)}\``).join(', ')} — ${label(M.availableSections, lang)}: ${DASHBOARD_SECTIONS.join(', ')}_`,
    );
    out.push('');
  }

  out.push('---');
  out.push(`_${label(L.generated, lang)}: ${formatDate(new Date().toISOString())} — TOGAF 10 EAP MCP_`);
  out.push('');

  return out.join('\n');
}
