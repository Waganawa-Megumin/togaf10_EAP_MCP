/**
 * 機械的な突き合わせ検査 / Mechanical cross-checking of structured findings.
 *
 * **役割分担がこのファイルの前提。**
 * 読む・理解する・判断する・重みをつけるのは Claude(サーバーからは文書も会話も見えない)。
 * このファイルがやるのは、Claude が構造化した項目の一覧を受け取って、
 * **機械にしか見つけられない食い違い**を機械的に数えて指摘することだけ。
 *
 * 実際の案件(32 ページの公開報告書の評価)で、次の食い違いは**人間が手で照合して**見つかった:
 * - p.31「連結従業員 101,800 名」と p.17「12 万人」(18% 差。丸めでは説明できない)
 * - 本文「CISSP 670 名」と図「670 名以上」(数は同じで表現だけ違う)
 * - 組織名が p.5 では 2 部門、p.20 では 1 部門(表記ゆれか実際の統合か)
 *
 * どれも「読めば分かる」ものではなく「並べて突き合わせれば分かる」もの。人手でやると落ちる。
 *
 * 出力の原則(ここを外すとこのツールは有害になる):
 * 1. **断定しない。** すべて「〜の可能性(要確認)」として出す。
 * 2. **必ず根拠を併記する。** どの項目とどの項目か、値がいくつといくつかを見せる。
 *    人間がその場で「これは違う」と捨てられなければ、指摘は検証コストの純増でしかない。
 * 3. **0 件を「問題なし」と言わない。** 機械が見ているのは形式だけで、内容の正しさは見ていない。
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { text, type Bilingual, type Lang } from '../knowledge/index.js';
import {
  CONFIDENCE_DEFINITIONS,
  CONFIDENCE_LEVELS,
  OUTPUT_LIMITS,
  capCell,
  capNotice,
  capRows,
  confidenceLabel,
  type ProvenanceConfidence,
} from '../engagement/model.js';
import { errorResult, langSchema, msg, textResult, type ToolResult } from './common.js';
import {
  checkFreeText,
  findTooManyItems,
  freeTextSchema,
  IDENTIFIER_LIMIT,
  tooManyItemsResult,
  type FreeTextCheck,
} from './input-limits.js';

// ---------------------------------------------------------------------------
// 定数 / Constants
// ---------------------------------------------------------------------------

/** 1 回に渡せる項目数。32 ページの報告書 1 本ぶんの抽出結果が入る想定 */
const MAX_INSPECT_ITEMS = 200;

/** `statement`(記述本文)の上限 */
const STATEMENT_LIMIT = 2_000;

/**
 * 表記ゆれ候補とみなす類似度の下限(文字バイグラムの Dice 係数)。
 *
 * 実測: 「サイバーセキュリティ統括部門」×「サイバーセキュリティ戦略統括部」= 0.81。
 * 0.5 まで下げると「情報セキュリティ委員会」×「情報システム部門」のような
 * **別物**まで拾い始めたので 0.62 に置いている。
 */
const VARIANT_THRESHOLD = 0.62;

/** 類似度で比べる最低文字数。これより短い語は完全一致だけを見る(誤検出が多すぎる) */
const VARIANT_MIN_LENGTH = 4;

type Severity = 'high' | 'medium' | 'low';

const SEVERITY_LABEL: Record<Severity, Bilingual> = {
  high: { ja: '要確認(高)', en: 'Check (high)' },
  medium: { ja: '要確認(中)', en: 'Check (medium)' },
  low: { ja: '要確認(低)', en: 'Check (low)' },
};

const SEVERITY_MARK: Record<Severity, string> = { high: '!!', medium: '!', low: '·' };
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

// ---------------------------------------------------------------------------
// 入力の型 / Input types
// ---------------------------------------------------------------------------

/** Claude が構造化した 1 項目 */
interface InspectItem {
  label: string;
  statement?: string;
  value?: string | number;
  unit?: string;
  subject?: string;
  source?: string;
  confidence?: ProvenanceConfidence;
}

/** 検査に使う内部表現(番号と正規化済みキーを持つ) */
interface Entry {
  /** 出力で参照する 1 始まりの番号 */
  index: number;
  item: InspectItem;
  /** 表示名 */
  label: string;
  /** 数値をひとまとめにするキー(subject があればそれ、無ければ label) */
  groupLabel: string;
  groupKey: string;
  /**
   * `subject` が実際に渡されたか。
   *
   * **渡し忘れと省略を区別するために持つ。** groupLabel だけを見ると、
   * 「label を代用した」項目と「label と同じ文字列を subject に入れた」項目が
   * 区別できず、表の「対象」欄が空白になって読み手が理由を推測できなくなる。
   */
  subjectGiven: boolean;
  /** 表記ゆれ比較に使うキー */
  nameKey: string;
  number: ParsedNumber | null;
  /** value が日付表記だったとき。日付は数値検査から外す(下の parseDate を参照) */
  date: ParsedDate | null;
  /** 明示された unit を優先し、無ければ value から取り出したもの */
  unit: string;
}

// ---------------------------------------------------------------------------
// 文字列の正規化 / String normalization
// ---------------------------------------------------------------------------

function nfkc(value: string): string {
  try {
    return value.normalize('NFKC');
  } catch {
    return value;
  }
}

/**
 * 比較用のキー。全角/半角・大文字小文字・空白・記号・中黒・長音の違いを吸収する。
 * **表示には絶対に使わない**(元の表記が消えると、人間がどちらを直すか判断できない)。
 */
function normalizeKey(value: string): string {
  return nfkc(value)
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[・･,，.。、･()[\]{}「」『』【】<>《》:：;；\-‐–—ー~〜"'`|]/g, '');
}

/** Markdown 表のセル用にパイプと改行を無害化する */
function cell(value: string | undefined | null): string {
  if (!value) return '';
  return capCell(String(value), OUTPUT_LIMITS.cell)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

/** 見出し・表のセルなど 1 行に収めたい箇所の日英併記 */
function inline(ja: string, en: string, lang: Lang): string {
  return text({ ja, en }, lang);
}

/** 段落として日英を並べる */
function para(ja: string, en: string, lang: Lang): string {
  return msg(ja, en, lang);
}

// ---------------------------------------------------------------------------
// 文字バイグラムによる類似度 / Bigram similarity
// ---------------------------------------------------------------------------

function bigrams(value: string): string[] {
  if (value.length < 2) return [value];
  const out: string[] = [];
  for (let i = 0; i < value.length - 1; i += 1) out.push(value.slice(i, i + 2));
  return out;
}

/**
 * Dice 係数(0〜1)。日本語は単語に切れないので文字バイグラムで測る。
 * 英語の語順違い(`Security Office` / `Office of Security`)にもそこそこ効く。
 */
function similarity(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;
  const left = bigrams(a);
  const right = bigrams(b);
  const pool = new Map<string, number>();
  for (const g of left) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of right) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hit += 1;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (left.length + right.length);
}

/** 2 つの文字列に共通する最長の連続部分(根拠として見せる) */
function longestCommonRun(a: string, b: string): string {
  let best = '';
  for (let i = 0; i < a.length; i += 1) {
    for (let j = i + best.length + 1; j <= a.length; j += 1) {
      const piece = a.slice(i, j);
      if (b.includes(piece)) {
        if (piece.length > best.length) best = piece;
      } else {
        break;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 数値の解釈 / Number parsing
// ---------------------------------------------------------------------------

type Qualifier = 'exact' | 'approx' | 'atLeast' | 'atMost' | 'range';

const QUALIFIER_LABEL: Record<Qualifier, Bilingual> = {
  exact: { ja: '実数', en: 'exact' },
  approx: { ja: '概数(約)', en: 'approximate' },
  atLeast: { ja: '以上', en: 'at least' },
  atMost: { ja: '以下', en: 'at most' },
  range: { ja: '範囲', en: 'range' },
};

interface ParsedNumber {
  /** 渡された元の表記(そのまま見せる) */
  raw: string;
  /** 桁の語(万・億など)を掛けたあとの値 */
  value: number;
  qualifier: Qualifier;
  /** 表記から取り出した単位(「名」「社」「%」など)。無ければ空文字 */
  unit: string;
  /** 丸めの粒度。「12万」なら 10000、「101,800」なら 100 */
  rounding: number;
}

/** 桁の語。長いものから試す */
const SCALES: readonly { word: string; factor: number }[] = [
  { word: '兆', factor: 1e12 },
  { word: '億', factor: 1e8 },
  { word: '百万', factor: 1e6 },
  { word: '万', factor: 1e4 },
  { word: '千', factor: 1e3 },
  { word: 'billion', factor: 1e9 },
  { word: 'million', factor: 1e6 },
  { word: 'thousand', factor: 1e3 },
  { word: 'bn', factor: 1e9 },
  { word: 'k', factor: 1e3 },
];

const APPROX_RE = /約|およそ|凡そ|概ね|おおよそ|ほぼ|程度|前後|弱|強|approx|about|around|circa|roughly/i;
const AT_LEAST_RE = /以上|超える|超え|超|オーバー|more than|over|at least|\+\s*$/i;
const AT_MOST_RE = /以下|未満|less than|under|up to|至らない/i;
const RANGE_RE = /\d\s*[〜~–—]\s*\d/;

/** 数字と桁の語と修飾語を取り除いた残りを単位とみなす */
function extractUnit(rest: string): string {
  const cleaned = rest
    .replace(new RegExp(SCALES.map((s) => s.word).join('|'), 'gi'), '')
    .replace(APPROX_RE, '')
    .replace(AT_LEAST_RE, '')
    .replace(AT_MOST_RE, '')
    .replace(/\d+/g, '')
    .replace(/[\s　().,、。/]/g, '')
    .trim();
  return cleaned.slice(0, 12);
}

/** 末尾の 0 の個数から丸めの粒度を出す(1200 → 100、12 → 1) */
function roundingOf(mantissa: number, factor: number): number {
  if (!Number.isFinite(mantissa) || mantissa === 0) return factor;
  if (!Number.isInteger(mantissa)) {
    // 1.2万 のような表記。小数第 1 位までなら粒度は factor/10
    const decimals = String(mantissa).split('.')[1]?.length ?? 0;
    return Math.max(1, factor / 10 ** decimals);
  }
  let unit = 1;
  let n = Math.abs(mantissa);
  while (n % 10 === 0 && unit < 1e6) {
    n /= 10;
    unit *= 10;
  }
  return unit * factor;
}

/** 先頭の空白を落とす(全角空白を含む) */
function trimLead(value: string): string {
  return value.replace(/^[\s　]+/, '');
}

/**
 * 先頭の数字に付く桁の語を読む(無ければ factor=1)。
 *
 * **数字と桁の語の間の空白を跨ぐこと。** 実文書はほぼ必ず空白を入れる
 * (NEC サイバーセキュリティ経営報告書の抽出テキストは「12 万人」「4,278 億円」、
 * 英文報告書は "3 million")。空白で止めると `12 万人` が **12** と読まれ、
 * 同じ値の `120,000 人` と並べたときに「1 万倍の桁違い」という**存在しない矛盾**を
 * 重み高で報告してしまう(実測で再現)。
 *
 * 英字の桁語(k / bn / million …)は、直後が英字なら採らない。
 * 採ると `50 kg` が `k`(千)+ `g` になり、50,000 という無い数値が出る。
 */
function readScale(rest: string): { factor: number; rest: string } {
  const trimmed = trimLead(rest);
  for (const scale of SCALES) {
    if (!trimmed.toLowerCase().startsWith(scale.word.toLowerCase())) continue;
    const tail = trimmed.slice(scale.word.length);
    if (/^[A-Za-z]/.test(scale.word) && /^[A-Za-z]/.test(tail)) continue;
    return { factor: scale.factor, rest: tail };
  }
  return { factor: 1, rest };
}

/**
 * 「101,800 名」「12万人」「約 670 名以上」「35%」「3兆4000億円」のような表記を数値として読む。
 * 読めなければ null(**読めなかったことは出力で正直に伝える**)。
 *
 * 複合表記(3兆4000億)は、桁が下がり続けるあいだだけ足し込む。
 * これをやらないと「3兆4000億円」と「3.4兆円」が別の値に見えて、無い矛盾を作ってしまう。
 */
function parseNumber(raw: string): ParsedNumber | null {
  const source = nfkc(raw).trim();
  if (source.length === 0) return null;
  const flat = source.replace(/[,，]/g, '');
  const match = flat.match(/-?\d+(?:\.\d+)?/);
  if (!match || match.index === undefined) return null;
  const head = Number(match[0]);
  if (!Number.isFinite(head)) return null;

  const after = flat.slice(match.index + match[0].length);
  const before = flat.slice(0, match.index);

  const first = readScale(after);
  let total = head * first.factor;
  let lastFactor = first.factor;
  let rounding = roundingOf(head, first.factor);
  let rest = first.rest;

  // 「3兆4000億」の残り(4000億)を、桁が下がるあいだだけ足す。上限は暴走よけ。
  // 「3 兆 4000 億円」のように空白で区切られた表記も同じ 1 つの数値なので、空白を跨ぐ。
  for (let guard = 0; guard < 5; guard += 1) {
    const head2 = trimLead(rest);
    if (!/^\d/.test(head2)) break;
    const next = head2.match(/^-?\d+(?:\.\d+)?/);
    if (!next) break;
    const mantissa = Number(next[0]);
    if (!Number.isFinite(mantissa)) break;
    const scaled = readScale(head2.slice(next[0].length));
    if (scaled.factor >= lastFactor) break; // 桁が下がっていなければ別の数値。触らない
    total += mantissa * scaled.factor;
    rounding = roundingOf(mantissa, scaled.factor);
    lastFactor = scaled.factor;
    rest = scaled.rest;
  }

  let qualifier: Qualifier = 'exact';
  if (RANGE_RE.test(flat)) qualifier = 'range';
  else if (AT_LEAST_RE.test(after) || AT_LEAST_RE.test(before)) qualifier = 'atLeast';
  else if (AT_MOST_RE.test(after) || AT_MOST_RE.test(before)) qualifier = 'atMost';
  else if (APPROX_RE.test(before) || APPROX_RE.test(after)) qualifier = 'approx';

  const unitRaw = extractUnit(rest) || (/[%％]/.test(flat) ? '%' : '');
  return {
    raw: source,
    value: total,
    qualifier,
    unit: unitRaw === '％' ? '%' : unitRaw,
    rounding,
  };
}

/** 大きい数を読みやすく(1e4 以上は桁区切り) */
function fmtNumber(value: number): string {
  if (!Number.isFinite(value)) return '?';
  return Number.isInteger(value) ? value.toLocaleString('en-US') : String(value);
}

// ---------------------------------------------------------------------------
// 日付の解釈 / Date parsing
// ---------------------------------------------------------------------------

type DateGrain = 'day' | 'month' | 'year';

const GRAIN_LABEL: Record<DateGrain, Bilingual> = {
  day: { ja: '日付', en: 'date' },
  month: { ja: '年月', en: 'year-month' },
  year: { ja: '年', en: 'year' },
};

interface ParsedDate {
  /** 渡された元の表記(そのまま見せる) */
  raw: string;
  /** 比較用に YYYYMMDD の整数にしたもの(粒度が粗いときは 1 で埋める) */
  key: number;
  grain: DateGrain;
}

/**
 * 「2024年3月31日」「2025年度」「2024-03-31」のような**日付表記**を読む。読めなければ null。
 *
 * **これが無いと数値検査が嘘をつく。** 日付を数値として読むと「2024年3月31日」は 2024、
 * 「2025年3月31日」は 2025 になり、同じ subject に並べたときに
 * 「同じ対象の数値が 4% 食い違っている(重み高)」という**存在しない矛盾**が出る
 * (実測で再現した)。日付は数値検査から外し、日付として別に見る。
 *
 * 採るのは 1900〜2099 の 4 桁年に、`年` / `年度` か `-` `/` の区切りが続くものだけ。
 * 「5年」「10年間」のような期間は年が 4 桁でないので採らない。
 * 小数点区切り(`2024.5`)は **採らない** — 2024.5 億円のような小数と区別できないため、
 * `2024.3.31` のように 2 つ点があるときだけ日付とみなす。
 */
function parseDate(raw: string): ParsedDate | null {
  const source = nfkc(raw).trim();
  if (source.length === 0) return null;
  // 先頭近く(FY / 約 などの短い前置きは許す)に年が来るものだけを日付扱いする
  const patterns: readonly { re: RegExp; grain: DateGrain }[] = [
    { re: /^[^0-9]{0,4}((?:19|20)\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/, grain: 'day' },
    { re: /^[^0-9]{0,4}((?:19|20)\d{2})\s*年\s*(\d{1,2})\s*月/, grain: 'month' },
    { re: /^[^0-9]{0,4}((?:19|20)\d{2})\s*年度?(?!\d)/, grain: 'year' },
    { re: /^[^0-9]{0,4}((?:19|20)\d{2})[-/](\d{1,2})[-/](\d{1,2})(?!\d)/, grain: 'day' },
    { re: /^[^0-9]{0,4}((?:19|20)\d{2})\.(\d{1,2})\.(\d{1,2})(?!\d)/, grain: 'day' },
    { re: /^[^0-9]{0,4}((?:19|20)\d{2})[-/](\d{1,2})(?!\d)/, grain: 'month' },
  ];
  for (const { re, grain } of patterns) {
    const m = source.match(re);
    if (!m) continue;
    const year = Number(m[1]);
    const month = m[2] === undefined ? 1 : Number(m[2]);
    const day = m[3] === undefined ? 1 : Number(m[3]);
    if (month < 1 || month > 12) continue;
    if (day < 1 || day > 31) continue;
    return { raw: source, key: year * 10_000 + month * 100 + day, grain };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 数値として読めなかった理由 / Why a value could not be read as a number
// ---------------------------------------------------------------------------

/**
 * 「読めませんでした」だけでは直しようがない。**何を直せばよいか**まで返す。
 * 分類は文字種で機械的に決まるものだけに限る(中身の意味は推測しない)。
 */
type UnreadableReason = 'blank' | 'redacted' | 'kanjiNumeral' | 'nonArabicDigit' | 'noDigit';

const REDACTION_RE =
  /^(?:非公開|未公開|未公表|非開示|開示なし|不明|未定|未記載|記載なし|なし|無し|該当なし|対象外|n\/?a|tbd|unknown|undisclosed|not\s+disclosed|[-—―‐~〜…*?・．.]+)$/i;

const KANJI_NUMERAL_RE = /[〇零一二三四五六七八九十百千万億兆]/;

function unreadableReason(raw: string): UnreadableReason {
  const s = nfkc(raw).trim();
  if (s.length === 0) return 'blank';
  if (REDACTION_RE.test(s)) return 'redacted';
  if (/[0-9]/.test(s)) return 'nonArabicDigit';
  if (KANJI_NUMERAL_RE.test(s)) return 'kanjiNumeral';
  return 'noDigit';
}

const UNREADABLE_LABEL: Record<UnreadableReason, Bilingual> = {
  blank: { ja: '空白でした', en: 'it was blank' },
  redacted: {
    ja: '伏せ字か記号だけで数字がありません',
    en: 'redacted or symbols only, with no digits',
  },
  kanjiNumeral: {
    ja: '漢数字で書かれています(算用数字にすると読めます)',
    en: 'written with kanji numerals; rewrite with Arabic digits',
  },
  nonArabicDigit: {
    ja: '数字らしき文字はありますが算用数字として読めません(丸数字・ローマ数字・別の数字体系など)',
    en: 'has digit-like characters that are not Arabic numerals (circled, Roman, or another numeral system)',
  },
  noDigit: {
    ja: '数字が含まれていません(区分名や文章のようです)',
    en: 'contains no digits at all (it reads as a category name or prose)',
  },
};

/** 1 行に畳んで長さを抑える(引用ブロックに入れるので表のエスケープは不要) */
function flat(value: string, limit = 40): string {
  return capCell(String(value), limit).replace(/\r?\n/g, ' ');
}

// ---------------------------------------------------------------------------
// 単位の同義判定 / Unit synonyms
// ---------------------------------------------------------------------------

/**
 * 「同じものを数えているが書き方が違う」単位の組。
 * ここに入っていない組み合わせ(社 と 拠点 など)は**数え方そのものが違う**扱いにする。
 */
const UNIT_SYNONYMS: readonly (readonly string[])[] = [
  ['名', '人', '人員', '人材', 'person', 'persons', 'people', 'headcount'],
  ['社', '企業', '法人', 'company', 'companies', 'firm', 'firms'],
  ['拠点', '箇所', 'か所', 'ヶ所', 'カ所', 'site', 'sites', 'location', 'locations'],
  ['件', '個', 'item', 'items', 'case', 'cases'],
  ['%', 'percent', 'パーセント', '割合'],
  ['円', 'jpy', 'yen'],
  ['年', 'year', 'years', '年間'],
];

function unitFamily(unit: string): string | null {
  const key = normalizeKey(unit);
  if (key.length === 0) return null;
  for (const group of UNIT_SYNONYMS) {
    if (group.some((u) => normalizeKey(u) === key)) return group[0];
  }
  return null;
}

/** 同じ意味の単位か(同義グループに一緒に入っているか) */
function sameUnitMeaning(a: string, b: string): boolean {
  if (normalizeKey(a) === normalizeKey(b)) return true;
  const fa = unitFamily(a);
  const fb = unitFamily(b);
  return fa !== null && fa === fb;
}

// ---------------------------------------------------------------------------
// 断定的な書き方の検出 / Assertive wording
// ---------------------------------------------------------------------------

/**
 * 「推測なのに断定で書かれている」を拾うための語。
 * **広げすぎないこと。** 「である」まで拾うと inferred の項目がほぼ全部当たって、
 * 指摘そのものが読まれなくなる(ここが空振りすると、このツールは有害側に回る)。
 */
const ASSERTIVE_MARKERS: readonly string[] = [
  '必ず',
  '確実に',
  '間違いなく',
  '例外なく',
  '一切',
  '決して',
  '常に',
  'すべて',
  '全て',
  '全社',
  '完全に',
  '徹底されている',
  '唯一',
  '初の',
  '世界初',
  '業界初',
  '100%',
  'always',
  'never',
  'every ',
  'all of',
  'entirely',
  'completely',
  'guaranteed',
  'certainly',
  'definitely',
  'without exception',
  'the only',
  'world-first',
];

/** これが入っていれば「断定していない」とみなして指摘しない */
const HEDGE_MARKERS: readonly string[] = [
  '可能性',
  'と思われる',
  'とみられる',
  '見られる',
  '推定',
  '推測',
  'おそらく',
  'かもしれない',
  '見込み',
  '要確認',
  'ようだ',
  'らしい',
  'may ',
  'might ',
  'likely',
  'appears',
  'estimated',
  'probably',
  'possibly',
  'presumably',
];

function findAssertiveMarker(value: string): string | null {
  const lower = nfkc(value).toLowerCase();
  if (HEDGE_MARKERS.some((h) => lower.includes(h.toLowerCase()))) return null;
  for (const marker of ASSERTIVE_MARKERS) {
    if (lower.includes(marker.toLowerCase())) return marker.trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
// 検査結果の型 / Findings
// ---------------------------------------------------------------------------

interface Finding {
  severity: Severity;
  /** 何の指摘か(1 行) */
  title: Bilingual;
  /** 根拠。どの項目とどの項目か、値がいくつといくつか */
  evidence: Bilingual;
  /** 人間に何を確認してほしいか */
  ask: Bilingual;
  /** 参照する項目番号 */
  refs: number[];
}

interface CheckResult {
  key: string;
  name: Bilingual;
  /** 保持している指摘(上限で打ち切られていることがある) */
  findings: Finding[];
  /** 実際に検出した件数(打ち切り前)。表示件数より多いことがある */
  detected: number;
  /** 検査対象になった件数(0 件のとき「そもそも見ていない」のか区別するため) */
  scanned: number;
  /** 検査できなかった理由(あれば) */
  note?: Bilingual;
}

/**
 * 保持する指摘の上限。
 *
 * 対の総当たり検査は項目数の 2 乗で増える。実測: 似た名前を機械生成した 200 件を渡すと
 * 表記ゆれだけで 19,600 件になった(表示は 20 行に切られるが、その裏で 2 万個の
 * オブジェクトを作っている)。件数は正直に数えたまま、保持だけを打ち切る。
 */
const MAX_KEPT_FINDINGS = 2_000;

/** 件数は全部数え、保持は上限までに留める入れ物 */
class FindingSink {
  private readonly kept: Finding[] = [];
  private count = 0;

  push(finding: Finding): void {
    this.count += 1;
    if (this.kept.length < MAX_KEPT_FINDINGS) this.kept.push(finding);
  }

  get detected(): number {
    return this.count;
  }

  /** 重みの高い順に並べて返す */
  list(): Finding[] {
    return [...this.kept].sort((x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity]);
  }
}

// ---------------------------------------------------------------------------
// 検査 1: 出典が付いていない / Missing source
// ---------------------------------------------------------------------------

function checkMissingSource(entries: readonly Entry[]): CheckResult {
  const sink = new FindingSink();
  for (const e of entries) {
    const hasSource = typeof e.item.source === 'string' && e.item.source.trim().length > 0;
    if (hasSource) continue;
    const stated = e.item.confidence === 'stated';
    sink.push({
      severity: stated ? 'high' : e.item.confidence === 'inferred' ? 'low' : 'medium',
      title: stated
        ? { ja: '「記載あり」なのに出典が無い', en: 'Marked as stated but has no source' }
        : { ja: '出典が付いていない', en: 'No source recorded' },
      evidence: {
        ja: `[${e.index}] ${e.label} — confidence: ${confidenceLabel(e.item.confidence, 'ja')}`,
        en: `[${e.index}] ${e.label} — confidence: ${confidenceLabel(e.item.confidence, 'en')}`,
      },
      ask: stated
        ? {
            ja: '資料のどこに書いてあったか(ページ・図表番号)を source に入れるか、確度を inferred / unknown に落としてください。',
            en: 'Put where it was written (page, figure number) into source, or lower the confidence to inferred / unknown.',
          }
        : {
            ja: 'どこから来た項目か(ページ・発言者・日付)を source に入れてください。出所が分からない項目は、後で消す判断ができません。',
            en: 'Record where it came from (page, speaker, date) in source. An item with unknown origin cannot be dropped later with confidence.',
          },
      refs: [e.index],
    });
  }
  return {
    key: 'source',
    name: { ja: '出典が付いていない項目', en: 'Items without a source' },
    findings: sink.list(),
    detected: sink.detected,
    scanned: entries.length,
  };
}

// ---------------------------------------------------------------------------
// 検査 2: 表記ゆれの候補 / Name variants
// ---------------------------------------------------------------------------

function checkNameVariants(entries: readonly Entry[]): CheckResult {
  const sink = new FindingSink();
  const seen = new Set<string>();

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];
      if (a.nameKey.length === 0 || b.nameKey.length === 0) continue;
      if (a.label === b.label) continue;
      // 同じ subject を付けた項目どうしは「同じ対象の 2 回の出現」と本人が宣言済み。
      // ここで名前の違いを指摘すると、正しく使っている人ほど雑音が増える。
      if (a.groupKey.length > 0 && a.groupKey === b.groupKey) continue;

      const identical = a.nameKey === b.nameKey;
      const short = a.nameKey.length < VARIANT_MIN_LENGTH || b.nameKey.length < VARIANT_MIN_LENGTH;
      const score = identical ? 1 : short ? 0 : similarity(a.nameKey, b.nameKey);
      if (!identical && score < VARIANT_THRESHOLD) continue;

      const pairKey = `${Math.min(a.index, b.index)}-${Math.max(a.index, b.index)}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const run = longestCommonRun(a.nameKey, b.nameKey);
      const pct = Math.round(score * 100);
      sink.push({
        severity: identical ? 'medium' : score >= 0.8 ? 'medium' : 'low',
        title: identical
          ? { ja: '記号・全角半角だけが違う同じ名前', en: 'Same name apart from punctuation or width' }
          : { ja: '同じ実体の別表記かもしれない', en: 'Possibly the same entity written two ways' },
        evidence: {
          ja: `[${a.index}] ${a.label} ／ [${b.index}] ${b.label}(一致度 ${pct}%、共通部分「${run}」)`,
          en: `[${a.index}] ${a.label} / [${b.index}] ${b.label} (${pct}% similar, shared run "${run}")`,
        },
        ask: {
          ja: '同じ組織・同じ実体ですか。別物なら何が違うのか、同じなら正式名称をどちらに揃えるかを決めてください。組織改編で名前が変わった場合は、時点も併記が要ります。',
          en: 'Are these the same entity? If different, record what distinguishes them; if the same, choose the official name. If a reorganization renamed it, the date matters too.',
        },
        refs: [a.index, b.index],
      });
    }
  }

  return {
    key: 'variant',
    name: { ja: '表記ゆれの候補', en: 'Naming-variant candidates' },
    findings: sink.list(),
    detected: sink.detected,
    scanned: entries.length,
    // 大量に当たるのは、たいてい項目名が同じ雛形("〜の件数")で作られているとき。
    // その状態の指摘は読む価値が無いので、そう言う。
    note:
      sink.detected > 50
        ? {
            ja: `表記ゆれの候補が ${sink.detected} 件出ています。これは項目名が同じ雛形で作られているときに起きます(名前の大部分が共通なので機械には区別できません)。項目名を実体の名前そのものにするか、対になる項目だけを選んで渡し直してください。`,
            en: `${sink.detected} variant candidates is a symptom, not a result: it happens when the labels share a template so most characters match. Use the entity's own name as the label, or pass only the pairs you care about.`,
          }
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// 検査 3: 数値の食い違い / Numeric conflicts
// ---------------------------------------------------------------------------

/**
 * 2 件がまったく同じ出典を指しているか。同じなら、その表記を返す。
 *
 * 同じページの中の食い違いは「時点が違う」「範囲が違う」では説明しにくい。
 * **新しい指摘を作らず、既にある指摘に注記を足すだけ**にしてある(誤検出を増やさないため)。
 */
function sharedSource(a: Entry, b: Entry): string | null {
  const sa = (a.item.source ?? '').trim();
  const sb = (b.item.source ?? '').trim();
  if (sa.length === 0 || sb.length === 0) return null;
  return normalizeKey(sa) === normalizeKey(sb) ? sa : null;
}

/**
 * 同じ出典から来ている指摘に、その事実を注記する(重みは変えない)。
 *
 * **足すのではなく差し替える。** 元の「確認してほしいこと」に前置きを足すと、
 * セルの上限(120 文字)を越えて肝心の後半が切られる(実測で切れた)。
 * 出典が同一なら「時点が違う」「集計範囲が違う」という一般的な助言はそもそも効かないので、
 * その場合だけの短い指示に置き換える。
 */
function withSharedSourceNote(finding: Finding, a: Entry, b: Entry): Finding {
  const src = sharedSource(a, b);
  if (!src) return finding;
  const shown = flat(src, 24);
  return {
    ...finding,
    title: {
      ja: `${finding.title.ja}(同一出典)`,
      en: `${finding.title.en} (same source)`,
    },
    evidence: {
      ja: `${finding.evidence.ja} — 出典はどちらも「${shown}」`,
      en: `${finding.evidence.en} — both cite "${shown}"`,
    },
    ask: {
      ja: `出典が同一(「${shown}」)なので、時点や集計範囲の違いでは説明しにくい組み合わせです。その 1 か所の原文を開き、どちらが本文の値かを確かめてください。`,
      en: `Both cite "${shown}", so date or scope is an unlikely explanation. Open that one spot and settle which figure it states.`,
    },
  };
}

/** 同じ対象についての 2 つの数値を比べる。指摘不要なら null */
function compareNumbers(a: Entry, b: Entry, groupLabel: string): Finding | null {
  const finding = compareNumbersCore(a, b, groupLabel);
  return finding ? withSharedSourceNote(finding, a, b) : null;
}

function compareNumbersCore(a: Entry, b: Entry, groupLabel: string): Finding | null {
  const na = a.number;
  const nb = b.number;
  if (!na || !nb) return null;

  // 単位が別物(社 と 拠点)なら、そもそも数値を比べても意味がない。
  // 同じことを 2 か所で言わないため、ここでは黙って単位検査に任せる(向こうが値も見せる)。
  if (a.unit.length > 0 && b.unit.length > 0 && !sameUnitMeaning(a.unit, b.unit)) return null;

  const diff = Math.abs(na.value - nb.value);
  const base = Math.max(Math.abs(na.value), Math.abs(nb.value), 1);
  const pct = Math.round((diff / base) * 1000) / 10;
  const shown = {
    ja: `[${a.index}] ${a.label}: ${na.raw}(= ${fmtNumber(na.value)})／[${b.index}] ${b.label}: ${nb.raw}(= ${fmtNumber(nb.value)})`,
    en: `[${a.index}] ${a.label}: ${na.raw} (= ${fmtNumber(na.value)}) / [${b.index}] ${b.label}: ${nb.raw} (= ${fmtNumber(nb.value)})`,
  };

  // 値は同じで表現だけが違う(「670 名」と「670 名以上」)
  if (diff === 0) {
    if (na.qualifier === nb.qualifier) return null;
    return {
      severity: 'medium',
      title: {
        ja: '数値は同じだが表現が違う',
        en: 'Same number, different qualifier',
      },
      evidence: {
        ja: `${groupLabel}: ${shown.ja}(${text(QUALIFIER_LABEL[na.qualifier], 'ja')} と ${text(QUALIFIER_LABEL[nb.qualifier], 'ja')})`,
        en: `${groupLabel}: ${shown.en} (${text(QUALIFIER_LABEL[na.qualifier], 'en')} vs ${text(QUALIFIER_LABEL[nb.qualifier], 'en')})`,
      },
      ask: {
        ja: 'どちらが正しい言い方ですか。「以上」が付く側が実数で、付かない側が切り捨てなら、両方を実数に揃えるか、両方に「以上」を付けてください。数字が同じで表現だけ違うと、読み手はどちらかが更新漏れだと考えます。',
        en: 'Which phrasing is correct? If one side is the exact count and the other a floor, make both exact or both bounded. The same number with two different qualifiers reads as a stale copy.',
      },
      refs: [a.index, b.index],
    };
  }

  // 「以上 / 以下」で説明がつく(「670 以上」と「700」)
  if (na.qualifier === 'atLeast' && nb.value > na.value) return null;
  if (nb.qualifier === 'atLeast' && na.value > nb.value) return null;
  if (na.qualifier === 'atMost' && nb.value < na.value) return null;
  if (nb.qualifier === 'atMost' && na.value < nb.value) return null;

  // 丸めで説明がつく範囲か(「約 12 万」と「118,000」)
  const rounding = Math.max(na.rounding, nb.rounding);
  const rounded = na.rounding > 1 || nb.rounding > 1 || na.qualifier === 'approx' || nb.qualifier === 'approx';
  if (rounded && diff <= rounding / 2) {
    return {
      severity: 'low',
      title: { ja: '概数と実数が混ざっている(丸めの範囲内)', en: 'Rounded and exact figures mixed (within rounding)' },
      evidence: {
        ja: `${groupLabel}: ${shown.ja}(差 ${fmtNumber(diff)}、丸めの粒度 ${fmtNumber(rounding)} で説明できる範囲)`,
        en: `${groupLabel}: ${shown.en} (difference ${fmtNumber(diff)}, explainable by rounding to ${fmtNumber(rounding)})`,
      },
      ask: {
        ja: '矛盾ではありませんが、同じ資料の中で概数と実数が混ざっています。読み手向けにはどちらかに統一するか、概数側に「約」を明記してください。',
        en: 'Not a contradiction, but the same material mixes a rounded and an exact figure. Pick one for the reader, or mark the rounded one explicitly as approximate.',
      },
      refs: [a.index, b.index],
    };
  }

  // 桁違い(単位の取り違えでよく起きる)
  const ratio = Math.max(na.value, nb.value) / Math.max(Math.min(Math.abs(na.value), Math.abs(nb.value)), 1);
  const orderOfMagnitude = [10, 100, 1000, 10_000].some((k) => Math.abs(ratio - k) / k < 0.05);

  return {
    severity: 'high',
    title: orderOfMagnitude
      ? { ja: '同じ対象の数値が桁で食い違っている可能性', en: 'Possible order-of-magnitude mismatch for the same subject' }
      : { ja: '同じ対象の数値が食い違っている可能性', en: 'Possible numeric conflict for the same subject' },
    evidence: {
      ja: `${groupLabel}: ${shown.ja} — 差 ${fmtNumber(diff)}(${pct}%)${orderOfMagnitude ? `、比はおよそ ${Math.round(ratio)} 倍` : ''}`,
      en: `${groupLabel}: ${shown.en} — difference ${fmtNumber(diff)} (${pct}%)${orderOfMagnitude ? `, ratio about ${Math.round(ratio)}x` : ''}`,
    },
    ask: orderOfMagnitude
      ? {
          ja: '桁が違います。片方が「万」単位のまま書かれていないか、単位の取り違えが無いかを確認してください。時点が違う(年度違い)なら、両方に時点を書き足してください。',
          en: 'The magnitudes differ. Check for a dropped unit multiplier or a unit mix-up. If they are from different points in time, add the date to both.',
        }
      : {
          ja: '同じ対象について違う数値が出ています。時点が違うのか、範囲(連結/単体、国内/海外)が違うのか、どちらかが古いのかを確認し、違うなら対象名にその条件を書き足してください。',
          en: 'Two different figures for the same subject. Check whether they differ by date, by scope (consolidated vs standalone, domestic vs global), or whether one is stale — and if they legitimately differ, put that condition into the subject name.',
        },
    refs: [a.index, b.index],
  };
}

function checkNumberConflicts(entries: readonly Entry[]): CheckResult {
  const withNumber = entries.filter((e) => e.number !== null);
  const groups = new Map<string, Entry[]>();
  for (const e of withNumber) {
    const list = groups.get(e.groupKey);
    if (list) list.push(e);
    else groups.set(e.groupKey, [e]);
  }

  const sink = new FindingSink();
  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const finding = compareNumbers(list[i], list[j], list[i].groupLabel);
        if (finding) sink.push(finding);
      }
    }
  }

  // 対象名が表記ゆれの候補どうしのときは、より弱い指摘として別枠で出す
  const keys = [...groups.keys()];
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const ka = keys[i];
      const kb = keys[j];
      if (ka.length < VARIANT_MIN_LENGTH || kb.length < VARIANT_MIN_LENGTH) continue;
      if (similarity(ka, kb) < VARIANT_THRESHOLD) continue;
      const la = groups.get(ka) ?? [];
      const lb = groups.get(kb) ?? [];
      for (const a of la) {
        for (const b of lb) {
          const finding = compareNumbers(a, b, `${a.groupLabel} ≒ ${b.groupLabel}`);
          if (!finding) continue;
          sink.push({
            ...finding,
            severity: finding.severity === 'high' ? 'medium' : 'low',
            title: {
              ja: `${finding.title.ja}(対象名の表記が違うので、まず同じ対象かの確認から)`,
              en: `${finding.title.en} (the subjects are written differently — first confirm they are the same thing)`,
            },
          });
        }
      }
    }
  }

  // 日付は日付の検査に回してあるので、ここでは「読めなかった」に数えない。
  // 数えると「2024年3月31日 が読めませんでした」という、直しようのない指摘になる。
  const unparsed = entries.filter(
    (e) =>
      e.number === null &&
      e.date === null &&
      e.item.value !== undefined &&
      String(e.item.value).trim().length > 0,
  );
  return {
    key: 'number',
    name: { ja: '数値の食い違い', en: 'Numeric conflicts' },
    findings: sink.list(),
    detected: sink.detected,
    scanned: withNumber.length,
    note: unparsed.length > 0 ? unparsedNote(unparsed) : undefined,
  };
}

/**
 * 「読めませんでした」で終わらせない。**どれが・どう書かれていて・なぜ読めなかったか**まで出す。
 * 番号だけを返していたときは、利用者が元の入力を開き直さないと直せなかった。
 */
function unparsedNote(unparsed: readonly Entry[]): Bilingual {
  const SHOWN = 8;
  const lines = unparsed.slice(0, SHOWN).map((e) => {
    const raw = flat(String(e.item.value ?? ''));
    const reason = UNREADABLE_LABEL[unreadableReason(String(e.item.value ?? ''))];
    return {
      ja: `[${e.index}] ${flat(e.label, 30)}「${raw}」— ${reason.ja}`,
      en: `[${e.index}] ${flat(e.label, 30)} "${raw}" — ${reason.en}`,
    };
  });
  const rest = unparsed.length - lines.length;
  const more = {
    ja: rest > 0 ? `(ほか ${rest} 件)` : '',
    en: rest > 0 ? ` (and ${rest} more)` : '',
  };
  return {
    ja: `value を渡したのに数値として読めなかった項目が ${unparsed.length} 件あります。数値の突き合わせの対象外です。内訳: ${lines.map((l) => l.ja).join(' ／ ')}${more.ja}。数値として比べたいものは「101800」「12万」「35%」のような算用数字の表記に直して渡し直してください。伏せ字や区分名はそのままで構いません(比べる相手がいないだけです)。`,
    en: `${unparsed.length} item(s) carried a value that could not be read as a number, so they were left out of the numeric comparison. They are: ${lines.map((l) => l.en).join(' / ')}${more.en}. Rewrite the ones you want compared as Arabic figures such as "101800", "12万", or "35%". Redacted or categorical values can stay as they are — they simply have nothing to be compared against.`,
  };
}

// ---------------------------------------------------------------------------
// 検査 4: 単位が揃っていない / Unit mismatch
// ---------------------------------------------------------------------------

function checkUnits(entries: readonly Entry[]): CheckResult {
  const withUnit = entries.filter((e) => e.unit.length > 0);
  const groups = new Map<string, Entry[]>();
  for (const e of withUnit) {
    const list = groups.get(e.groupKey);
    if (list) list.push(e);
    else groups.set(e.groupKey, [e]);
  }

  const sink = new FindingSink();
  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        if (normalizeKey(a.unit) === normalizeKey(b.unit)) continue;
        const synonym = sameUnitMeaning(a.unit, b.unit);
        // 単位が別物のときは数値検査を止めてある(比べても意味がないため)。
        // そのぶん、値はこちらの根拠に出して人が自分で見比べられるようにする。
        const va = a.number ? `=${a.number.raw}` : '';
        const vb = b.number ? `=${b.number.raw}` : '';
        sink.push({
          severity: synonym ? 'low' : 'medium',
          title: synonym
            ? { ja: '同じ意味の単位が別表記で使われている', en: 'Same unit written two ways' }
            : { ja: '数え方そのものが違う可能性', en: 'Possibly counting two different things' },
          evidence: {
            ja: `${a.groupLabel}: [${a.index}] ${a.label}「${a.unit}」${va}／[${b.index}] ${b.label}「${b.unit}」${vb}`,
            en: `${a.groupLabel}: [${a.index}] ${a.label} "${a.unit}" ${va} / [${b.index}] ${b.label} "${b.unit}" ${vb}`,
          },
          ask: synonym
            ? {
                ja: '意味は同じに見えますが表記が揃っていません。資料全体でどちらに揃えるかを決めてください(表に並べたときに別の指標に見えます)。',
                en: 'They appear to mean the same thing but are written differently. Pick one for the whole document — side by side in a table they read as two different measures.',
              }
            : {
                ja: '同じ対象に違う数え方が付いています。単位が違えば数は一致しないので、この 2 件は数値としては比べていません(値は上に出してあります)。同じ対象なら数え方を決め、別の対象なら subject を分けてください。',
                en: 'The same subject carries two different counting units, so the figures were not compared numerically (both values are shown above). If it is one subject, pick the unit; if it is two, split the subject.',
              },
          refs: [a.index, b.index],
        });
      }
    }
  }

  return {
    key: 'unit',
    name: { ja: '単位の不揃い', en: 'Unit mismatches' },
    findings: sink.list(),
    detected: sink.detected,
    scanned: withUnit.length,
  };
}

// ---------------------------------------------------------------------------
// 検査 5: 推測なのに断定的 / Inferred but written as fact
// ---------------------------------------------------------------------------

function checkAssertiveInferred(entries: readonly Entry[]): CheckResult {
  const targets = entries.filter((e) => e.item.confidence === 'inferred');
  const sink = new FindingSink();
  for (const e of targets) {
    const body = e.item.statement ?? e.label;
    const marker = findAssertiveMarker(body);
    if (!marker) continue;
    sink.push({
      severity: 'medium',
      title: {
        ja: '確度が inferred(推測)なのに断定的な書き方',
        en: 'Confidence is inferred but the wording asserts a fact',
      },
      evidence: {
        ja: `[${e.index}] ${e.label} — 「${marker}」を含む: ${capCell(body, 100)}`,
        en: `[${e.index}] ${e.label} — contains "${marker}": ${capCell(body, 100)}`,
      },
      ask: {
        ja: '資料にそう書いてあったなら confidence を stated にして出典を付けてください。こちらの読み取りなら「〜と読める」「〜の可能性がある」に書き換えてください。推測が断定として報告書に載ると、後で誰も出所を辿れません。',
        en: 'If the source says this, set confidence to stated and add the source. If it is your reading, rewrite it as "appears to" / "may". An inference printed as a fact cannot be traced back later.',
      },
      refs: [e.index],
    });
  }
  return {
    key: 'assertive',
    name: { ja: '推測なのに断定的な項目', en: 'Inferred items written as fact' },
    findings: sink.list(),
    detected: sink.detected,
    scanned: targets.length,
    note:
      targets.length === 0
        ? {
            ja: 'confidence に inferred を付けた項目がありません。推測を推測として区別していない場合、この検査は何も見ていないのと同じです。',
            en: 'No item is marked inferred. If inferences are not marked as such, this check has nothing to look at.',
          }
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// 検査 6: 日付の前後 / Date ordering
// ---------------------------------------------------------------------------

/** 「始まり」を表す語。label にこれが入っていれば開始側とみなす */
const START_MARKERS: readonly string[] = [
  '開始',
  '着手',
  '起点',
  '設立',
  '発足',
  '策定',
  '公表',
  '起算',
  'start',
  'begin',
  'from',
  'since',
  'kickoff',
  'kick-off',
];

/** 「終わり」を表す語 */
const END_MARKERS: readonly string[] = [
  '終了',
  '完了',
  '期限',
  '締切',
  '締め切り',
  '納期',
  '目標時期',
  '到達',
  '廃止',
  'end',
  'until',
  'due',
  'deadline',
  'completion',
  'target date',
];

function hasMarker(value: string, markers: readonly string[]): boolean {
  const lower = nfkc(value).toLowerCase();
  return markers.some((m) => lower.includes(m.toLowerCase()));
}

/** 開始 / 終了 の役割が読み取れるか。読み取れなければ null */
function dateRole(entry: Entry): 'start' | 'end' | null {
  const body = `${entry.label} ${entry.item.statement ?? ''}`;
  const start = hasMarker(body, START_MARKERS);
  const end = hasMarker(body, END_MARKERS);
  if (start === end) return null; // 両方入っている / どちらも無い → 判断しない
  return start ? 'start' : 'end';
}

function fmtDate(d: ParsedDate, lang: Lang): string {
  return `${d.raw}(${text(GRAIN_LABEL[d.grain], lang === 'both' ? 'ja' : lang)})`;
}

/**
 * 同じ subject に入った日付どうしを見る。
 *
 * 出すのは 2 つだけ:
 * - **開始が終了より後**(label から役割が読み取れたときだけ)。ここは重み高。
 * - 役割が読み取れないまま**違う時点が同じ対象に入っている**。重み低。
 *
 * 役割が読み取れて順序も正しい組は**何も出さない**。開始日と終了日が並んでいるのは
 * 正常な状態で、そこに指摘を出すと正しく使っている人ほど雑音が増える。
 */
function checkDateOrder(entries: readonly Entry[]): CheckResult {
  const withDate = entries.filter((e) => e.date !== null);
  const groups = new Map<string, Entry[]>();
  for (const e of withDate) {
    const list = groups.get(e.groupKey);
    if (list) list.push(e);
    else groups.set(e.groupKey, [e]);
  }

  const sink = new FindingSink();
  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const da = a.date;
        const db = b.date;
        if (!da || !db || da.key === db.key) continue;

        const ra = dateRole(a);
        const rb = dateRole(b);
        const earlier = da.key < db.key ? a : b;
        const later = da.key < db.key ? b : a;
        const earlierRole = earlier === a ? ra : rb;
        const laterRole = later === a ? ra : rb;

        if (earlierRole === 'end' && laterRole === 'start') {
          sink.push({
            severity: 'high',
            title: { ja: '開始が終了より後になっている可能性', en: 'Possible start-after-end date order' },
            evidence: {
              ja: `${a.groupLabel}: [${later.index}] ${later.label}(開始)= ${fmtDate(later.date!, 'ja')} が、[${earlier.index}] ${earlier.label}(終了)= ${fmtDate(earlier.date!, 'ja')} より後です`,
              en: `${a.groupLabel}: [${later.index}] ${later.label} (start) = ${fmtDate(later.date!, 'en')} falls after [${earlier.index}] ${earlier.label} (end) = ${fmtDate(earlier.date!, 'en')}`,
            },
            ask: {
              ja: '開始と終了が逆に見えます。役割は項目名から読み取っただけなので、まず label が本当に開始/終了を指すかを確かめてください。指すなら日付のどちらかが誤りです。年度表記でずれて見えることもあります。',
              en: 'Start looks later than end. The roles came from the labels — check they really mean start and end; if so, one date is wrong. Fiscal-year notation can also make this look reversed.',
            },
            refs: [a.index, b.index],
          });
          continue;
        }
        if (ra !== null && rb !== null) continue; // 開始→終了の並びが正しい組は黙る

        sink.push({
          severity: 'low',
          title: { ja: '同じ対象に違う時点が入っている', en: 'Same subject carries two different dates' },
          evidence: {
            ja: `${a.groupLabel}: [${a.index}] ${a.label} = ${fmtDate(da, 'ja')}／[${b.index}] ${b.label} = ${fmtDate(db, 'ja')}`,
            en: `${a.groupLabel}: [${a.index}] ${a.label} = ${fmtDate(da, 'en')} / [${b.index}] ${b.label} = ${fmtDate(db, 'en')}`,
          },
          ask: {
            ja: '同じ対象に 2 つの時点が入っています。矛盾とは限りません(改定・更新なら当然)。どちらが最新かを決めるか、時点の違いを subject に書き足して分けてください。数値も一緒に動いているなら、その数値の時点も確認してください。',
            en: 'Two points in time sit under one subject. Not necessarily a contradiction — a revision would look like this. Decide which is current, or split them by writing the date into the subject. If figures move with the date, check those too.',
          },
          refs: [a.index, b.index],
        });
      }
    }
  }

  return {
    key: 'date',
    name: { ja: '日付の前後', en: 'Date ordering' },
    findings: sink.list(),
    detected: sink.detected,
    scanned: withDate.length,
    note:
      withDate.length === 0
        ? {
            ja: '日付として読める value がありません。時点(いつのデータか)は機械では照合できていないので、人が見てください。「2024年3月31日」「2025年度」のように value に入れて渡すと、この検査が働きます。',
            en: 'No value could be read as a date, so nothing about timing was checked mechanically — that lens is still yours. Pass dates in `value` as "2024年3月31日" or "2025年度" to switch this check on.',
          }
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// 検査 7: 重複した項目 / Duplicate items
// ---------------------------------------------------------------------------

/**
 * label・subject・value がすべて一致する項目。**完全一致だけを見るので誤検出は起きない**
 * (「同じかもしれない」ではなく「同じ文字列である」)。
 *
 * 32 ページの資料から抽出すると、同じ事実が章をまたいで 2 回入るのは普通に起きる。
 * 重複したまま数えると件数が水増しされ、「何件確認したか」が信用できなくなる。
 */
function checkDuplicates(entries: readonly Entry[]): CheckResult {
  const buckets = new Map<string, Entry[]>();
  for (const e of entries) {
    const valueKey = e.item.value === undefined ? '' : normalizeKey(String(e.item.value));
    const key = `${e.nameKey}\u0000${e.groupKey}\u0000${valueKey}`;
    const list = buckets.get(key);
    if (list) list.push(e);
    else buckets.set(key, [e]);
  }

  const sink = new FindingSink();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const first = list[0];
    for (let i = 1; i < list.length; i += 1) {
      const other = list[i];
      const src = sharedSource(first, other);
      const sameOrigin = src !== null || ((first.item.source ?? '').trim() === '' && (other.item.source ?? '').trim() === '');
      sink.push({
        severity: 'low',
        title: sameOrigin
          ? { ja: '同じ項目が二重に入っている', en: 'The same item was passed twice' }
          : { ja: '同じ記述が別の出典から重複している', en: 'The same wording appears under two different sources' },
        evidence: {
          ja: `[${first.index}] ${first.label} ／ [${other.index}] ${other.label} — 項目名・対象・値がすべて一致(出典: ${flat((first.item.source ?? '').trim() || '—', 30)} と ${flat((other.item.source ?? '').trim() || '—', 30)})`,
          en: `[${first.index}] ${first.label} / [${other.index}] ${other.label} — label, subject, and value are all identical (sources: ${flat((first.item.source ?? '').trim() || '—', 30)} and ${flat((other.item.source ?? '').trim() || '—', 30)})`,
        },
        ask: sameOrigin
          ? {
              ja: '同じ項目が 2 件入っています。片方を消してください。重複したまま数えると「何件確認したか」が実際より多く見えます。',
              en: 'One item is present twice. Drop one — a duplicated list inflates how much you appear to have verified.',
            }
          : {
              ja: '同じ記述が 2 か所に出ています。再掲(同じ事実を別ページでもう一度書いている)なら 1 件にまとめて出典を両方書いてください。別々に数えた値なら、二重計上になっていないかを確認してください。',
              en: 'The same statement appears in two places. If it is a restatement, merge into one item citing both sources; if the two were counted separately, check for double counting.',
            },
        refs: [first.index, other.index],
      });
    }
  }

  return {
    key: 'duplicate',
    name: { ja: '重複した項目', en: 'Duplicate items' },
    findings: sink.list(),
    detected: sink.detected,
    scanned: entries.length,
  };
}

// ---------------------------------------------------------------------------
// 出力 / Rendering
// ---------------------------------------------------------------------------

/** 0 件のときに人が見るべき観点。機械が見ていない側だけを挙げる */
const HUMAN_LENSES: readonly Bilingual[] = [
  {
    ja: '**時点**: 同じ数値でも、どの年度・どの時点のものかが混ざっていないか。`value` に日付を入れた項目どうしは機械も並べていますが、本文に「2023年度実績」と書いてあるだけの時点は機械には見えていません。',
    en: '**As-of date**: are figures from different years mixed together? Items whose `value` is a date do get compared, but a date that only appears in the prose ("FY2023 actuals") is invisible to the machine.',
  },
  {
    ja: '**範囲**: 連結/単体、国内/海外、正社員/派遣を含むか。範囲が違えば数が違って当然で、これは矛盾ではなく説明不足です。',
    en: '**Scope**: consolidated vs standalone, domestic vs global, contractors included or not. Different scope means different numbers — that is missing explanation, not a contradiction.',
  },
  {
    ja: '**書かれていないこと**: 触れられていない領域(この検査は渡された項目しか見ていません)。空白は機械には見えません。',
    en: '**What is absent**: topics never mentioned. This check only sees the items you passed; silence is invisible to it.',
  },
  {
    ja: '**因果の飛躍**: 「施策を実施した」から「リスクが下がった」への飛躍。文中の論理は検査していません。',
    en: '**Causal leaps**: "we ran the program" therefore "risk went down". The reasoning inside the text is not checked.',
  },
  {
    ja: '**重み**: 全部を同じ大きさで並べていないか。何が重要かは機械には判断できません。',
    en: '**Weighting**: is everything presented at the same size? The machine cannot tell what matters.',
  },
];

function renderFindingsTable(check: CheckResult, lang: Lang): string[] {
  const out: string[] = [];
  const capped = capRows(check.findings, OUTPUT_LIMITS.rows);
  out.push(
    `| ${inline('重み', 'Severity', lang)} | ${inline('指摘', 'Finding', lang)} | ${inline('根拠(項目番号つき)', 'Evidence (with item numbers)', lang)} | ${inline('確認してほしいこと', 'What to confirm', lang)} |`,
  );
  out.push('| --- | --- | --- | --- |');
  for (const f of capped.rows) {
    out.push(
      `| ${SEVERITY_MARK[f.severity]} ${cell(text(SEVERITY_LABEL[f.severity], lang))} | ${cell(text(f.title, lang))} | ${cell(text(f.evidence, lang))} | ${cell(text(f.ask, lang))} |`,
    );
  }
  // 表示は上位 20 件。検出数(打ち切り前)を必ず出す — 見えている件数を全部だと
  // 思わせると、この検査の意味が逆になる。
  const shown = capped.rows.length;
  if (shown < check.detected) {
    out.push('');
    out.push(
      para(
        `重みの高い順に ${shown} 件を表示しています(検出 ${check.detected} 件)。残りは項目を絞って \`inspect_findings\` を呼び直すと出ます。`,
        `Showing the ${shown} highest-weight of ${check.detected} detected. Call \`inspect_findings\` again with a narrower item list to see the rest.`,
        lang,
      ),
    );
  }
  return out;
}

function renderReport(
  entries: readonly Entry[],
  checks: readonly CheckResult[],
  title: string | undefined,
  lang: Lang,
): string {
  const out: string[] = [];
  const total = checks.reduce((sum, c) => sum + c.detected, 0);
  const high = checks.reduce((s, c) => s + c.findings.filter((f) => f.severity === 'high').length, 0);

  out.push(`# ${inline('機械的な突き合わせ検査', 'Mechanical cross-check', lang)}`);
  out.push('');
  if (title) {
    out.push(`**${inline('対象', 'Subject', lang)}**: ${cell(title)}`);
    out.push('');
  }
  out.push(
    para(
      `渡された ${entries.length} 件を機械的に突き合わせ、${total} 件を「確認してください」として返します(うち重み高 ${high} 件)。**内容の正しさは一切見ていません。** 見ているのは、出典の有無・名前の一致・数値の一致・単位の一致・確度と語調の食い違いだけです。指摘はすべて可能性であり、判断は人がしてください。`,
      `Cross-checking the ${entries.length} item(s) you passed produced ${total} thing(s) to confirm (${high} at high weight). **Nothing here judges whether the content is correct.** It only compares presence of sources, names, numbers, units, and the match between confidence and wording. Every finding is a possibility for a human to decide on.`,
      lang,
    ),
  );
  out.push('');

  // 概要表
  out.push(`## ${inline('検査ごとの件数', 'Findings per check', lang)}`);
  out.push('');
  out.push(
    `| ${inline('検査', 'Check', lang)} | ${inline('対象', 'Scanned', lang)} | ${inline('指摘', 'Findings', lang)} |`,
  );
  out.push('| --- | --- | --- |');
  for (const c of checks) {
    out.push(`| ${cell(text(c.name, lang))} | ${c.scanned} | ${c.detected} |`);
  }
  out.push('');

  if (total === 0) {
    out.push(`## ${inline('機械的な矛盾は見つかりませんでした', 'No mechanical contradiction found', lang)}`);
    out.push('');
    out.push(
      para(
        'これは**正しさの保証ではありません。** この検査は、渡された項目どうしの形式的な一致しか見ていません。渡していない項目、文脈、因果、重要度、そして「書かれていないこと」は一切見ていません。0 件は「機械で拾える食い違いは無かった」以上の意味を持ちません。',
        'This is **not a guarantee of correctness.** The check only compares the items you passed, formally. It never saw what you did not pass, nor context, causality, weighting, or what is missing. Zero findings means only that no machine-detectable mismatch was present.',
        lang,
      ),
    );
    out.push('');
    out.push(`### ${inline('ここからは人が見る観点', 'Lenses only a human can apply', lang)}`);
    out.push('');
    for (const lens of HUMAN_LENSES) out.push(`- ${text(lens, lang)}`);
    out.push('');
  } else {
    for (const c of checks) {
      if (c.findings.length === 0 && !c.note) continue;
      out.push(`## ${cell(text(c.name, lang))}(${c.detected})`);
      out.push('');
      if (c.findings.length > 0) {
        out.push(...renderFindingsTable(c, lang));
        out.push('');
      } else {
        out.push(para('この検査での指摘はありません。', 'Nothing flagged by this check.', lang));
        out.push('');
      }
      if (c.note) {
        out.push(`> ${text(c.note, lang)}`);
        out.push('');
      }
    }

    out.push(`## ${inline('この検査が見ていないもの', 'What this check does not look at', lang)}`);
    out.push('');
    for (const lens of HUMAN_LENSES) out.push(`- ${text(lens, lang)}`);
    out.push('');
  }

  // 項目一覧(番号の対応表)。指摘の [n] を引くために必要
  const capped = capRows(entries, OUTPUT_LIMITS.rows);
  out.push(`## ${inline('項目番号の対応', 'Item index', lang)}`);
  out.push('');
  out.push(
    `| # | ${inline('項目', 'Item', lang)} | ${inline('対象', 'Subject', lang)} | ${inline('値', 'Value', lang)} | ${inline('出典', 'Source', lang)} | ${inline('確度', 'Confidence', lang)} |`,
  );
  out.push('| --- | --- | --- | --- | --- | --- |');
  for (const e of capped.rows) {
    const conf = e.item.confidence ? CONFIDENCE_DEFINITIONS[e.item.confidence] : undefined;
    // subject を渡していない項目は、空欄ではなく「代用した label」を括弧と斜体で見せる。
    // 空欄のままだと、渡し忘れたのか意図して省いたのかが読み手に分からない。
    const subjectCell = e.subjectGiven ? cell(e.groupLabel) : `_(${cell(e.label)})_`;
    const valueCell = e.item.value === undefined ? '—' : cell(String(e.item.value)) || '—';
    out.push(
      `| ${e.index} | ${cell(e.label)} | ${subjectCell} | ${valueCell} | ${cell(e.item.source) || '—'} | ${conf ? `${conf.marker} ${cell(confidenceLabel(e.item.confidence, lang === 'both' ? 'ja' : lang))}` : '—'} |`,
    );
  }
  const borrowed = capped.rows.filter((e) => !e.subjectGiven).length;
  if (borrowed > 0) {
    out.push('');
    out.push(
      para(
        `「対象」欄の _(括弧つき斜体)_ ${borrowed} 件は、\`subject\` を渡していないので \`label\` をそのまま対象名として代用した項目です。数値と単位の突き合わせは**対象名が完全に一致した項目どうしだけ**で行うので、比べてほしい項目には同じ \`subject\` を明示的に入れてください(代用のままだと、同じことを指していても別々の対象として扱われます)。`,
        `The ${borrowed} _(parenthesised, italic)_ cell(s) in the Subject column mean no \`subject\` was passed, so the \`label\` was borrowed as the subject name. Figures and units are only compared **between items whose subject matches exactly**, so give the items you want compared the same explicit \`subject\` — borrowed names keep them apart even when they describe the same thing.`,
        lang,
      ),
    );
  }
  const notice = capNotice(
    capped,
    {
      ja: '全件見るには項目を分けて呼び直してください。',
      en: 'Split the list across several calls to see them all.',
    },
    lang,
  );
  if (notice) {
    out.push('');
    out.push(notice);
  }
  out.push('');

  // 次にすること
  out.push(`## ${inline('次にすること', 'What to do next', lang)}`);
  out.push('');
  if (total === 0) {
    out.push(
      `1. ${inline('上の「人が見る観点」を 1 つずつ当てて、機械では出ない食い違いを自分の目で探す。', 'Apply the human lenses above one at a time — that is where the remaining mismatches are.', lang)}`,
    );
    out.push(
      `2. ${inline('確定した項目を `update_engagement` に source と confidence を付けて登録し、案件の台帳に残す。', 'Record the confirmed items via `update_engagement` with source and confidence so they live in the engagement ledger.', lang)}`,
    );
    out.push(
      `3. ${inline('資料をもう 1 本読んだら、前回ぶんと今回ぶんを合わせて `inspect_findings` にもう一度渡す(食い違いは資料をまたいだときに出る)。', 'After reading another document, pass the old and new items together to `inspect_findings` again — conflicts surface across documents, not within one.', lang)}`,
    );
  } else {
    out.push(
      `1. ${inline('重み高の指摘から、根拠に出ている項目番号の原文に戻って確認する(先に原文、次に判断)。', 'Start with the high-weight findings: go back to the original text for the item numbers in the evidence column.', lang)}`,
    );
    out.push(
      `2. ${inline('食い違いが本物だった項目は、対象名に条件(時点・範囲)を書き足して渡し直す。説明が付けば指摘は消える。', 'Where a conflict is real, add the qualifying condition (date, scope) to the subject name and pass it again — explained differences stop being flagged.', lang)}`,
    );
    out.push(
      `3. ${inline('出典の無い項目は、原文に戻れないなら捨てる。出所不明のまま報告書に載せない。', 'Drop items with no source if you cannot get back to the original. Do not let untraceable items into the report.', lang)}`,
    );
    out.push(
      `4. ${inline('残った確定項目を `update_engagement` に source と confidence を付けて登録する。', 'Register what survives via `update_engagement` with source and confidence.', lang)}`,
    );
  }
  out.push('');
  out.push(
    para(
      '注記: この出力は渡された項目だけを見た機械的な照合です。指摘はすべて「可能性(要確認)」であり、正誤の判定ではありません。',
      'Note: this is a mechanical comparison of the items you passed. Every finding is a possibility to confirm, not a verdict.',
      lang,
    ),
  );

  return out.join('\n');
}

// ---------------------------------------------------------------------------
// 入力の検査と組み立て / Validation and assembly
// ---------------------------------------------------------------------------

function buildEntries(items: readonly InspectItem[]): Entry[] {
  return items.map((item, i) => {
    const label = String(item.label ?? '').trim();
    const subject = (item.subject ?? '').trim();
    const groupLabel = subject || label;
    const rawValue = item.value === undefined ? null : String(item.value);
    // 日付は数値ではない。先に日付として読み、読めたら数値としては見ない。
    const date = rawValue === null ? null : parseDate(rawValue);
    const parsed = rawValue === null || date !== null ? null : parseNumber(rawValue);
    const explicitUnit = (item.unit ?? '').trim();
    return {
      index: i + 1,
      item,
      label,
      groupLabel,
      groupKey: normalizeKey(groupLabel),
      subjectGiven: subject.length > 0,
      nameKey: normalizeKey(label),
      number: parsed,
      date,
      unit: explicitUnit || parsed?.unit || '',
    };
  });
}

interface InspectArgs {
  items: InspectItem[];
  title?: string;
  lang: Lang;
}

/**
 * ハンドラ本体。**例外は投げない**(投げると MCP サーバーが落ちて、
 * 利用者には次に何をすればよいかが何も残らない)。
 */
function runInspect({ items, title, lang }: InspectArgs): ToolResult {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return errorResult(
        msg(
          '検査する項目がありません。`items` に 1 件以上渡してください。1 件は `label`(項目名)が必須で、`subject`(何についての値か)・`value`(数値)・`unit`・`source`・`confidence`・`statement` は任意です。数値の食い違いは、同じ `subject` を持つ項目が 2 件以上あって初めて検出できます。',
          'Nothing to inspect. Pass at least one entry in `items`. Each needs `label`; `subject`, `value`, `unit`, `source`, `confidence`, and `statement` are optional. Numeric conflicts can only be found when two or more items share the same `subject`.',
          lang,
        ),
      );
    }

    const tooMany = findTooManyItems('items', items, MAX_INSPECT_ITEMS);
    if (tooMany) return tooManyItemsResult(tooMany, lang);

    const checksToRun: FreeTextCheck[] = [];
    if (title !== undefined) {
      checksToRun.push({ field: 'title', value: title, limit: IDENTIFIER_LIMIT });
    }
    items.forEach((item, i) => {
      checksToRun.push({ field: `items[${i}].label`, value: item.label, limit: IDENTIFIER_LIMIT });
      checksToRun.push({ field: `items[${i}].subject`, value: item.subject, limit: IDENTIFIER_LIMIT });
      checksToRun.push({ field: `items[${i}].source`, value: item.source, limit: IDENTIFIER_LIMIT });
      checksToRun.push({ field: `items[${i}].unit`, value: item.unit, limit: 60 });
      checksToRun.push({ field: `items[${i}].value`, value: item.value, limit: IDENTIFIER_LIMIT });
      checksToRun.push({ field: `items[${i}].statement`, value: item.statement, limit: STATEMENT_LIMIT });
    });
    const tooLong = checkFreeText(checksToRun, lang);
    if (tooLong) return tooLong;

    const empty = items.findIndex((item) => String(item.label ?? '').trim().length === 0);
    if (empty >= 0) {
      return errorResult(
        msg(
          `\`items[${empty}].label\` が空です。項目名は指摘の中で「どの項目か」を指すために使うので、空だと結果が読めません。短い名前を入れてください。`,
          `\`items[${empty}].label\` is empty. The label is how each finding points back at an item, so an empty one makes the result unreadable. Give it a short name.`,
          lang,
        ),
      );
    }

    const entries = buildEntries(items);
    const results: CheckResult[] = [
      checkMissingSource(entries),
      checkNameVariants(entries),
      checkNumberConflicts(entries),
      checkUnits(entries),
      checkDateOrder(entries),
      checkDuplicates(entries),
      checkAssertiveInferred(entries),
    ];
    return textResult(renderReport(entries, results, title, lang));
  } catch (error) {
    return errorResult(
      msg(
        `検査中に想定外のエラーが起きました: ${error instanceof Error ? error.message : String(error)}\n項目を減らして呼び直すか、数値の表記(\`value\`)を「101800」「12万」のような短い形にしてください。`,
        `Unexpected error while inspecting: ${error instanceof Error ? error.message : String(error)}\nRetry with fewer items, or simplify the \`value\` notation to something like "101800" or "12万".`,
        lang,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 登録 / Registration
// ---------------------------------------------------------------------------

const itemSchema = z.object({
  label: freeTextSchema(
    '項目名。指摘はこの名前で参照される / Item name; findings refer back to it',
    IDENTIFIER_LIMIT,
  ),
  subject: freeTextSchema(
    '何についての値か。**同じ対象には同じ文字列を使うこと**(これが一致した項目どうしだけ数値と単位を突き合わせる)。省略すると label を使う / What the value is about. Use the identical string for the same subject — only items sharing it are compared. Defaults to label',
    IDENTIFIER_LIMIT,
  ).optional(),
  value: z
    .union([
      freeTextSchema(
        '数値の表記。資料に書かれていたまま渡してよい(「101,800 名」「12万人」「約670名以上」「35%」)/ The figure as written in the source',
        IDENTIFIER_LIMIT,
      ),
      z.number(),
    ])
    .optional(),
  unit: freeTextSchema('単位(名・社・拠点・% など)。value に含まれていれば省略可 / Unit; optional when value contains it', 60).optional(),
  source: freeTextSchema(
    '出典。ページ・図表番号・発言者・日付など、原文に戻れる書き方で / Where it came from: page, figure, speaker, date — anything that gets you back to the original',
    IDENTIFIER_LIMIT,
  ).optional(),
  confidence: z
    .enum(CONFIDENCE_LEVELS)
    .optional()
    .describe(
      'stated=資料に書いてあった / inferred=読み取って導いた / unknown=出所を辿れない / stated: written in the source; inferred: derived by reading; unknown: cannot be traced',
    ),
  statement: freeTextSchema(
    'その項目の記述本文(任意)。断定的な書き方かどうかの検査に使う / The wording of the item; used to check assertive phrasing',
    STATEMENT_LIMIT,
  ).optional(),
});

export function registerInspectTools(server: McpServer): void {
  server.registerTool(
    'inspect_findings',
    {
      title: 'Cross-check structured findings for contradictions',
      description:
        '**あなた(Claude)が資料を読んで構造化した項目の一覧**を受け取り、機械にしか見つけられない食い違いを突き合わせて返す。サーバーは資料を読まない。検査は 7 つ: (1) 出典が付いていない項目、(2) 同じ実体の別表記の候補(文字バイグラムの類似度と共通部分を根拠として併記)、(3) 同じ subject に対する数値の食い違い(万/億の桁、「約」「以上」「以下」、丸めの粒度を解釈し、丸めで説明できるものは弱い指摘に落とす。両方が同じ出典を指していれば「時点や範囲の違いでは説明しにくい」と注記する)、(4) 単位の不揃い(名/人のような同義の表記ゆれと、社/拠点のような数え方そのものの違いを区別する)、(5) 日付の前後(「2024年3月31日」「2025年度」のような値は数値ではなく日付として読み、項目名から開始/終了が読み取れる組で順序が逆なら重み高、役割が読めない組は「同じ対象に違う時点」として弱く出す)、(6) 項目名・対象・値が完全に一致する重複項目、(7) confidence=inferred なのに断定的な語で書かれている項目。指摘はすべて「可能性(要確認)」として、どの項目とどの項目かを番号付きで併記して返す。数値として読めなかった value は、番号・元の表記・読めなかった理由(漢数字・伏せ字・数字なし など)を添えて返す。0 件のときは「機械的な矛盾は無い。ただし正しさの保証ではない」と明示し、人が見るべき観点(時点・範囲・書かれていないこと・因果の飛躍・重み)を示す。 / Takes the list of items **you** structured after reading the material and mechanically cross-checks them; the server never reads the document. Seven checks: missing sources; naming-variant candidates (with similarity and the shared substring as evidence); numeric conflicts for the same subject (understanding Japanese magnitude words, approximate/at-least/at-most qualifiers, and rounding granularity, downgrading anything rounding explains, and noting when both figures cite the same source); unit mismatches (separating synonymous spellings from genuinely different counting units); date ordering (values such as "2024年3月31日" are read as dates rather than numbers; a start dated after an end is weighted high, other date pairs are reported weakly); exact duplicate items; and items marked inferred but written as assertions. Every finding is phrased as something to confirm and cites the item numbers on both sides. Values that could not be read as numbers come back with the original text and the reason. When nothing is found it says so honestly and lists the lenses only a human can apply.',
      inputSchema: {
        items: z
          .array(itemSchema)
          .max(MAX_INSPECT_ITEMS)
          .describe(
            '検査する項目。資料をまたいで一度に渡すほど食い違いが出る / The items to check. Conflicts surface when items from several sources are passed together',
          ),
        title: freeTextSchema(
          '何を検査しているかの名前(資料名など、任意) / Optional name of what is being inspected',
          IDENTIFIER_LIMIT,
        ).optional(),
        lang: langSchema,
      },
    },
    async ({ items, title, lang }) =>
      runInspect({ items: items as InspectItem[], title, lang: lang as Lang }),
  );
}
