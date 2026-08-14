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
export { CONSULT_RULES } from './consulting.js';
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
// ビジネスアーキテクチャの作り方
export {
  CAPABILITY_LEVELS,
  CAPABILITY_METHOD,
  VALUE_STREAM_METHOD,
  CROSS_MAPPING,
  REFERENCE_CAPABILITIES,
  type Method,
  type ReferenceCapability,
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

/** ルールのマッチ結果 / A matched consulting rule with its score. */
export interface RuleMatch {
  rule: ConsultRule;
  score: number;
  matchedKeywords: string[];
}

/**
 * 状況の自由記述に対して該当するコンサルティングルールを返す。
 * currentPhase が指定されていれば、そのフェーズを扱うルールを軽く優先する。
 */
export function matchConsultRules(
  situation: string,
  currentPhaseId?: string,
  limit = 3,
): RuleMatch[] {
  const s = situation.toLowerCase();
  const matches: RuleMatch[] = [];

  for (const rule of CONSULT_RULES) {
    const matched = rule.keywords.filter((k) => matchesKeyword(s, k));
    if (matched.length === 0) continue;
    let score = matched.length * 10;
    // 長いキーワードほど具体的とみなして加点
    score += matched.reduce((acc, k) => acc + Math.min(k.length, 12), 0);
    if (currentPhaseId && rule.phaseIds.includes(currentPhaseId)) score += 5;
    matches.push({ rule, score, matchedKeywords: matched });
  }

  return matches.sort((a, b) => b.score - a.score || a.rule.id.localeCompare(b.rule.id)).slice(0, limit);
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
