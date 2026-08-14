/**
 * 知識ベースの入口 / Knowledge base entry point.
 * 各データセットの再エクスポートと、横断検索・ルールマッチングを提供する。
 */

import { ADM_PHASES, findPhase } from './adm-phases.js';
import { TECHNIQUES, findTechnique } from './techniques.js';
import { DELIVERABLES, findDeliverable } from './deliverables.js';
import { GLOSSARY, findTerm } from './glossary.js';
import { CONSULT_RULES } from './consulting.js';
import type { Bilingual, ConsultRule, SearchHit } from './types.js';

export * from './types.js';
export { ADM_PHASES, findPhase } from './adm-phases.js';
export { TECHNIQUES, findTechnique } from './techniques.js';
export { DELIVERABLES, findDeliverable } from './deliverables.js';
export { GLOSSARY, findTerm } from './glossary.js';
export { CONSULT_RULES, type WeightedConsultRule } from './consulting.js';
export { VIEWPOINTS, findViewpoint, type Viewpoint } from './viewpoints.js';
export { INDUSTRIES, findIndustry, type IndustryGuidance } from './industries.js';
// ArchiMate(記述言語)と TOGAF ADM(手法)の対応
export {
  ARCHIMATE_LAYERS,
  ARCHIMATE_ELEMENTS,
  ARCHIMATE_RELATIONSHIPS,
  TOGAF_ARCHIMATE_MAPPING,
  findArchiMateElement,
  findArchiMateLayer,
  findArchiMateRelationship,
  elementsByLayer,
  type ArchiMateLayerId,
  type ArchiMateLayer,
  type ArchiMateElement,
  type ArchiMateRelationship,
} from './archimate.js';
// 周辺フレームワーク(BIZBOK / Zachman / C4 / Wardley など)
export {
  FRAMEWORKS,
  findFramework,
  frameworksForPhase,
  frameworksByCategory,
  type Framework,
  type FrameworkCategory,
} from './frameworks.js';
// セキュリティ EA(SABSA を参照)
export {
  SABSA_LAYERS,
  SABSA_QUESTIONS,
  SECURITY_PHASE_MAP,
  SECURITY_ARTIFACTS,
  SECURITY_PITFALLS,
  THREAT_LENSES,
  type SabsaLayer,
  type SecurityArtifact,
} from './security-ea.js';
// ビジネスアーキテクチャの作り方(業界別の能力セットを含む)
export {
  CAPABILITY_LEVELS,
  CAPABILITY_METHOD,
  VALUE_STREAM_METHOD,
  CROSS_MAPPING,
  REFERENCE_CAPABILITIES,
  CAPABILITY_GROUP_LABELS,
  ANTI_PATTERNS,
  NAMING_LEXICON,
  INDUSTRY_CAPABILITY_SETS,
  findReferenceCapability,
  findAntiPattern,
  findCrossMapping,
  findIndustryCapabilitySet,
  detectIndustryCapabilitySets,
  findIndustryCapability,
  type Method,
  type MethodStep,
  type ReferenceCapability,
  type CapabilityLevelGuide,
  type CapabilityGroup,
  type CrossMapping,
  type CrossReading,
  type IndustryCapabilitySet,
  type IndustryReferenceCapability,
  type IndustryDetection,
  type BusinessArchitectureAntiPattern,
  type NamingLexicon,
} from './business-architecture.js';

/** ASCII のみで構成されるか(単語境界マッチを使ってよいか)の判定 */
function isAscii(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]+$/.test(s);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * キーワードが対象文に含まれるか。
 * ASCII キーワードは単語境界で、日本語キーワードは部分一致で判定する。
 */
export function matchesKeyword(haystackLower: string, keyword: string): boolean {
  const k = keyword.trim().toLowerCase();
  if (k.length === 0) return false;
  if (isAscii(k)) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(k)}($|[^a-z0-9])`, 'i');
    return re.test(haystackLower);
  }
  return haystackLower.includes(k);
}

function flatten(values: Bilingual[]): string {
  return values.map((v) => `${v.ja} ${v.en}`).join(' ');
}

interface IndexEntry {
  kind: SearchHit['kind'];
  id: string;
  title: Bilingual;
  snippet: Bilingual;
  keywords: string[];
  body: string;
}

let indexCache: IndexEntry[] | null = null;

function buildIndex(): IndexEntry[] {
  if (indexCache) return indexCache;
  const entries: IndexEntry[] = [];

  for (const p of ADM_PHASES) {
    entries.push({
      kind: 'phase',
      id: p.id,
      title: p.name,
      snippet: p.tagline,
      keywords: p.keywords,
      body: [
        p.name.ja, p.name.en, p.code, p.tagline.ja, p.tagline.en, p.purpose.ja, p.purpose.en,
        flatten(p.inputs), flatten(p.steps), flatten(p.outputs), flatten(p.tips),
      ].join(' ').toLowerCase(),
    });
  }

  for (const t of TECHNIQUES) {
    entries.push({
      kind: 'technique',
      id: t.id,
      title: t.name,
      snippet: t.summary,
      keywords: t.keywords,
      body: [
        t.name.ja, t.name.en, t.summary.ja, t.summary.en,
        flatten(t.whenToUse), flatten(t.steps), flatten(t.pitfalls),
      ].join(' ').toLowerCase(),
    });
  }

  for (const d of DELIVERABLES) {
    entries.push({
      kind: 'deliverable',
      id: d.id,
      title: d.name,
      snippet: d.summary,
      keywords: d.keywords,
      body: [
        d.name.ja, d.name.en, d.summary.ja, d.summary.en,
        flatten(d.contents), flatten(d.tips),
      ].join(' ').toLowerCase(),
    });
  }

  for (const g of GLOSSARY) {
    entries.push({
      kind: 'glossary',
      id: g.id,
      title: g.term,
      snippet: g.definition,
      keywords: g.keywords,
      body: [g.term.ja, g.term.en, g.definition.ja, g.definition.en].join(' ').toLowerCase(),
    });
  }

  indexCache = entries;
  return entries;
}

export interface SearchOptions {
  kinds?: SearchHit['kind'][];
  limit?: number;
}

/** 知識ベース全体を日英で検索する / Search the whole knowledge base in either language. */
export function searchKnowledge(query: string, options: SearchOptions = {}): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const limit = options.limit ?? 10;
  const kinds = options.kinds;

  // 空白区切りの語すべてと、クエリ全体の両方で照合する
  const terms = Array.from(new Set([q, ...q.split(/\s+/).filter((t) => t.length > 0)]));

  const hits: SearchHit[] = [];
  for (const entry of buildIndex()) {
    if (kinds && !kinds.includes(entry.kind)) continue;
    let score = 0;
    const titleLower = `${entry.title.ja} ${entry.title.en}`.toLowerCase();
    const keywordsLower = entry.keywords.map((k) => k.toLowerCase());

    for (const term of terms) {
      if (entry.id === term) score += 12;
      if (keywordsLower.some((k) => k === term)) score += 8;
      else if (keywordsLower.some((k) => k.includes(term) || term.includes(k))) score += 4;
      if (matchesKeyword(titleLower, term)) score += 6;
      if (matchesKeyword(entry.body, term)) score += 2;
    }

    if (score > 0) {
      hits.push({ kind: entry.kind, id: entry.id, title: entry.title, snippet: entry.snippet, score });
    }
  }

  return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// コンサルティングルールのマッチング
//
// 「キーワードが 1 個当たったから、そのルールの助言を丸ごと出す」をやめる。
// 一致の強さ(主題語か周辺語か)・出現回数・文中での位置から確信度を出し、
// 確信度が低いルールは採用しないか、出す量を絞る。
// ---------------------------------------------------------------------------

/** キーワードの強さ / How decisive a keyword is for its rule. */
export type KeywordStrength = 'strong' | 'weak';

/** 状況文のどのあたりで一致したか / Where in the text the keyword appeared. */
export type MatchPosition = 'opening' | 'middle' | 'closing';

/** キーワード 1 件の一致内容 / One keyword hit, with where and how often it matched. */
export interface KeywordHit {
  keyword: string;
  strength: KeywordStrength;
  /** 最初に現れた文字位置(0 起点) */
  index: number;
  /** 出現回数 */
  occurrences: number;
  /** 文全体を 3 分割したときの出現位置。主題は前半に書かれることが多い */
  position: MatchPosition;
  /** このヒットのスコア寄与 */
  score: number;
}

/** 見立ての確信度 / How much to trust this read. */
export type MatchConfidence = 'high' | 'medium' | 'low';

/** ルールのマッチ結果 / A matched consulting rule with its score. */
export interface RuleMatch {
  /**
   * 確信度に応じてアクション・質問・技法・成果物を絞り込んだルール。
   * 低い確信度では見立て本文に但し書きが付く。
   */
  rule: ConsultRule;
  score: number;
  /** 一致したキーワード(強弱を問わず、スコアの高い順) */
  matchedKeywords: string[];
  /** 確信度 */
  confidence: MatchConfidence;
  /** 主題語として一致したキーワード */
  strongMatches: string[];
  /** 周辺語として一致したキーワード */
  weakMatches: string[];
  /** 一致の詳細(位置・回数つき) */
  hits: KeywordHit[];
  /** 確信度の根拠(そのまま画面に出せる 1 行) */
  rationale: Bilingual;
  /** 絞り込む前の元ルール */
  fullRule: ConsultRule;
}

/** 単語境界を考慮してキーワードの出現位置をすべて返す */
function keywordPositions(haystackLower: string, keyword: string): number[] {
  const k = keyword.trim().toLowerCase();
  const positions: number[] = [];
  if (k.length === 0) return positions;
  const ascii = isAscii(k);
  let from = 0;
  for (;;) {
    const i = haystackLower.indexOf(k, from);
    if (i < 0) break;
    if (ascii) {
      // ASCII は単語境界でのみ採用(matchesKeyword と同じ判定)
      const before = i === 0 ? '' : haystackLower.charAt(i - 1);
      const after = haystackLower.charAt(i + k.length);
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) positions.push(i);
    } else {
      positions.push(i);
    }
    from = i + 1;
  }
  return positions;
}

function positionOf(index: number, length: number): MatchPosition {
  if (length <= 0) return 'opening';
  const ratio = index / length;
  if (ratio < 1 / 3) return 'opening';
  if (ratio < 2 / 3) return 'middle';
  return 'closing';
}

/** 位置による重み。主題は文の前半で述べられることが多い */
const POSITION_WEIGHT: Record<MatchPosition, number> = {
  opening: 1.15,
  middle: 1,
  closing: 0.9,
};

interface RawHit {
  keyword: string;
  strength: KeywordStrength;
  /** 照合に使った正規化後の長さ */
  length: number;
  positions: number[];
}

function collectRawHits(
  haystackLower: string,
  keywords: string[] | undefined,
  strength: KeywordStrength,
): RawHit[] {
  const raw: RawHit[] = [];
  for (const keyword of keywords ?? []) {
    const positions = keywordPositions(haystackLower, keyword);
    if (positions.length === 0) continue;
    raw.push({ keyword, strength, length: keyword.trim().length, positions });
  }
  return raw;
}

/**
 * 同じ箇所に重ねて当たったキーワードを 1 件に畳む。
 * 「過去に頓挫」に対して「頓挫」「過去に」まで数えると、同じ 1 文を 3 回証拠として
 * 数えることになり、確信度が実態より高く出てしまうため。長いキーワードを優先して残す。
 */
function dedupeOverlaps(raw: RawHit[]): RawHit[] {
  const taken: Array<[number, number]> = [];
  const kept: RawHit[] = [];
  // 主題語を先に、同じ強さなら長い方を先に確保する
  const rank = (h: RawHit) => (h.strength === 'strong' ? 0 : 1);
  const ordered = [...raw].sort(
    (a, b) => rank(a) - rank(b) || b.length - a.length || a.keyword.localeCompare(b.keyword),
  );
  for (const hit of ordered) {
    const positions = hit.positions.filter((p) => {
      const end = p + hit.length;
      return !taken.some(([s, e]) => p >= s && end <= e);
    });
    if (positions.length === 0) continue;
    for (const p of positions) taken.push([p, p + hit.length]);
    kept.push({ ...hit, positions });
  }
  return kept;
}

function scoreHits(raw: RawHit[], haystackLength: number): KeywordHit[] {
  return raw.map((hit) => {
    const index = hit.positions[0] ?? 0;
    const occurrences = hit.positions.length;
    const position = positionOf(index, haystackLength);
    // 主題語は基礎点が高く、長さ(具体性)もそのまま効く。
    // 周辺語は基礎点が低く、長さの効きも抑える。
    const base = hit.strength === 'strong' ? 24 : 7;
    const specificity = Math.min(hit.length, 12) * (hit.strength === 'strong' ? 1 : 0.4);
    // 繰り返し出てくる語は主題である可能性が高い(2 回目までを加点)
    const repeat = 1 + 0.25 * Math.min(occurrences - 1, 2);
    const score = Math.round((base + specificity) * repeat * POSITION_WEIGHT[position]);
    return { keyword: hit.keyword, strength: hit.strength, index, occurrences, position, score };
  });
}

/** 確信度ごとの出力量。2 番手・3 番手のルールはさらに絞る(無関係な助言の混入を防ぐ) */
const QUOTA: Record<MatchConfidence, { actions: number; questions: number; techniques: number; deliverables: number; phases: number }> = {
  high: { actions: 5, questions: 4, techniques: 5, deliverables: 6, phases: 6 },
  medium: { actions: 3, questions: 3, techniques: 3, deliverables: 3, phases: 5 },
  low: { actions: 2, questions: 2, techniques: 2, deliverables: 2, phases: 3 },
};

const RANK_ACTION_CAP = [Number.POSITIVE_INFINITY, 3, 2];

function joinKeywords(list: string[], max = 3): string {
  const shown = list.slice(0, max).join('、');
  return list.length > max ? `${shown} ほか` : shown;
}

function joinKeywordsEn(list: string[], max = 3): string {
  const shown = list.slice(0, max).join(', ');
  return list.length > max ? `${shown}, …` : shown;
}

/** 確信度の根拠を 1 行で説明する */
function buildRationale(confidence: MatchConfidence, strong: string[], weak: string[]): Bilingual {
  if (confidence === 'high') {
    return {
      ja: `確信度 高 — 主題語 ${strong.length} 件(${joinKeywords(strong)})が一致した。`,
      en: `Confidence high — ${strong.length} topic keyword(s) matched (${joinKeywordsEn(strong)}).`,
    };
  }
  if (confidence === 'medium') {
    if (strong.length > 0) {
      return {
        ja: `確信度 中 — 主題語「${joinKeywords(strong)}」が一致した。周辺の状況までは読み取れていない。`,
        en: `Confidence medium — topic keyword "${joinKeywordsEn(strong)}" matched, but the surrounding context is not confirmed.`,
      };
    }
    return {
      ja: `確信度 中 — 周辺語が ${weak.length} 件(${joinKeywords(weak)})一致した。主題語の一致は無い。`,
      en: `Confidence medium — ${weak.length} peripheral keywords matched (${joinKeywordsEn(weak)}); no topic keyword matched.`,
    };
  }
  return {
    ja: `確信度 低 — 一致したのは周辺語「${joinKeywords(weak)}」だけ。この見立てが主題かどうかは確認できていない。`,
    en: `Confidence low — only peripheral keywords matched ("${joinKeywordsEn(weak)}"). Whether this is really your topic is unconfirmed.`,
  };
}

/** 確信度が低い見立てには、断定しないための但し書きを本文に付ける */
function withCaveat(diagnosis: Bilingual, confidence: MatchConfidence, weak: string[]): Bilingual {
  if (confidence === 'high') return diagnosis;
  if (confidence === 'medium') return diagnosis;
  return {
    ja: `${diagnosis.ja}\n\n> (この見立ての確信度は低い。反応したのは「${joinKeywords(weak)}」という周辺語だけで、これが本題かどうかは読み取れていない。的外れなら無視してよい。状況をもう少し具体的に書くと見立てが変わる。)`,
    en: `${diagnosis.en}\n\n> (Low confidence: only the peripheral terms "${joinKeywordsEn(weak)}" matched, so this may not be your actual topic. Ignore it if it misses, or describe the situation more concretely to get a different read.)`,
  };
}

/** 確信度と順位に応じてルールを絞り込む(元のルールは変更しない) */
function trimRule(rule: ConsultRule, confidence: MatchConfidence, rank: number, weak: string[]): ConsultRule {
  const quota = QUOTA[confidence];
  const cap = RANK_ACTION_CAP[rank] ?? 2;
  return {
    ...rule,
    diagnosis: withCaveat(rule.diagnosis, confidence, weak),
    phaseIds: rule.phaseIds.slice(0, quota.phases),
    techniqueIds: rule.techniqueIds.slice(0, quota.techniques),
    deliverableIds: rule.deliverableIds.slice(0, quota.deliverables),
    actions: rule.actions.slice(0, Math.min(quota.actions, cap)),
    questions: rule.questions.slice(0, Math.min(quota.questions, cap)),
  };
}

interface Candidate {
  rule: ConsultRule;
  score: number;
  hits: KeywordHit[];
  strong: string[];
  weak: string[];
  confidence: MatchConfidence;
}

/**
 * 状況の自由記述に対して該当するコンサルティングルールを返す。
 *
 * - 主題語(strongKeywords)の一致を重く、周辺語(keywords)の一致を軽く扱う。
 * - 周辺語が 1 個当たっただけのルールは採用しない。製品名を 1 度書いただけで
 *   その製品の選定手順が丸ごと出てくる、という誤爆を防ぐため。
 * - ただし他に一致が 1 件も無い場合に限り、最も有力な弱い一致を確信度「低」で返す。
 * - currentPhase が指定されていれば、そのフェーズを扱うルールを軽く優先する。
 */
export function matchConsultRules(
  situation: string,
  currentPhaseId?: string,
  limit = 3,
): RuleMatch[] {
  const s = situation.toLowerCase();
  if (s.trim().length === 0) return [];

  const accepted: Candidate[] = [];
  const rejected: Candidate[] = [];

  for (const rule of CONSULT_RULES) {
    const raw = dedupeOverlaps([
      ...collectRawHits(s, rule.strongKeywords, 'strong'),
      ...collectRawHits(s, rule.keywords, 'weak'),
    ]);
    const hits = scoreHits(raw, s.length).sort((a, b) => b.score - a.score || a.index - b.index);
    if (hits.length === 0) continue;

    const strong = hits.filter((h) => h.strength === 'strong');
    const weak = hits.filter((h) => h.strength === 'weak');

    let score = hits.reduce((acc, h) => acc + h.score, 0);
    // 複数キーワードが当たったルールを強く優先する
    if (strong.length >= 2) score += 20;
    if (strong.length >= 1 && weak.length >= 1) score += 8;
    if (hits.length >= 3) score += 10;
    if (currentPhaseId && rule.phaseIds.includes(currentPhaseId)) score += 5;

    let confidence: MatchConfidence;
    if (strong.length >= 2 || (strong.length >= 1 && hits.length >= 3)) confidence = 'high';
    else if (strong.length >= 1 || weak.length >= 3) confidence = 'medium';
    else confidence = 'low';

    const candidate: Candidate = {
      rule,
      score,
      hits,
      strong: strong.map((h) => h.keyword),
      weak: weak.map((h) => h.keyword),
      confidence,
    };

    // 周辺語 1 個だけの一致は、証拠として弱すぎるので採用しない
    if (strong.length === 0 && weak.length < 2) rejected.push(candidate);
    else accepted.push(candidate);
  }

  const byScore = (a: Candidate, b: Candidate) => b.score - a.score || a.rule.id.localeCompare(b.rule.id);
  let pool = accepted.sort(byScore);

  if (pool.length === 0) {
    // 他に手がかりが無いときだけ、最も有力な弱い一致を「低」で返す。
    // (他に強い見立てがあるときは、この救済は働かないので混入しない)
    const fallback = rejected.sort(byScore)[0];
    if (!fallback) return [];
    pool = [{ ...fallback, confidence: 'low' }];
  } else {
    const top = pool[0]!;
    // 上位から大きく離れたルールは無関係な可能性が高いので落とす。
    // ただし「レガシー刷新をクラウドで」のように、副題が 1 語でしか表現されないことは
    // 普通にあるので、閾値は低めに置き、量の抑制は確信度による絞り込みに任せる。
    pool = pool.filter((c, i) => i === 0 || c.score >= top.score * 0.25);
    // 確信度の高い見立てがあるときに、確信度の低い見立てを並べない
    if (top.confidence === 'high') pool = pool.filter((c) => c.confidence !== 'low');
  }

  return pool.slice(0, limit).map((c, rank) => ({
    rule: trimRule(c.rule, c.confidence, rank, c.weak),
    score: c.score,
    matchedKeywords: c.hits.map((h) => h.keyword),
    confidence: c.confidence,
    strongMatches: c.strong,
    weakMatches: c.weak,
    hits: c.hits,
    rationale: buildRationale(c.confidence, c.strong, c.weak),
    fullRule: c.rule,
  }));
}

/** ID 群から成果物・技法・フェーズの名称を引く小さなヘルパ */
export function phaseName(id: string): Bilingual | undefined {
  return findPhase(id)?.name;
}
export function techniqueName(id: string): Bilingual | undefined {
  return findTechnique(id)?.name;
}
export function deliverableName(id: string): Bilingual | undefined {
  return findDeliverable(id)?.name;
}
export function glossaryTerm(id: string): Bilingual | undefined {
  return findTerm(id)?.term;
}
