import { describe, expect, it } from 'vitest';
import {
  ADM_PHASES,
  CONSULT_RULES,
  DELIVERABLES,
  GLOSSARY,
  TECHNIQUES,
  findDeliverable,
  findPhase,
  findTechnique,
  matchConsultRules,
  matchesKeyword,
  searchKnowledge,
} from '../src/knowledge/index.js';

describe('knowledge base shape', () => {
  it('has the ten ADM phases in order', () => {
    expect(ADM_PHASES).toHaveLength(10);
    expect(ADM_PHASES.map((p) => p.code)).toEqual([
      'Preliminary', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'RM',
    ]);
    expect(ADM_PHASES.map((p) => p.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('gives every entry both languages', () => {
    const all = [
      ...ADM_PHASES.map((p) => [p.name, p.purpose, p.tagline]),
      ...TECHNIQUES.map((t) => [t.name, t.summary]),
      ...DELIVERABLES.map((d) => [d.name, d.summary]),
      ...GLOSSARY.map((g) => [g.term, g.definition]),
    ].flat();
    for (const value of all) {
      expect(value.ja.length).toBeGreaterThan(0);
      expect(value.en.length).toBeGreaterThan(0);
    }
  });

  it('uses unique ids within each dataset', () => {
    const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
    for (const set of [ADM_PHASES, TECHNIQUES, DELIVERABLES, GLOSSARY, CONSULT_RULES]) {
      expect(new Set(ids(set)).size).toBe(set.length);
    }
  });

  it('has no dangling cross-references', () => {
    for (const phase of ADM_PHASES) {
      for (const id of phase.deliverableIds) expect(findDeliverable(id), `${phase.id} → ${id}`).toBeDefined();
      for (const id of phase.techniqueIds) expect(findTechnique(id), `${phase.id} → ${id}`).toBeDefined();
    }
    for (const t of TECHNIQUES) {
      for (const id of t.phaseIds) expect(findPhase(id), `${t.id} → ${id}`).toBeDefined();
    }
    for (const d of DELIVERABLES) {
      for (const id of [...d.createdInPhaseIds, ...d.refinedInPhaseIds]) {
        expect(findPhase(id), `${d.id} → ${id}`).toBeDefined();
      }
    }
    for (const rule of CONSULT_RULES) {
      for (const id of rule.phaseIds) expect(findPhase(id), `${rule.id} → ${id}`).toBeDefined();
      for (const id of rule.techniqueIds) expect(findTechnique(id), `${rule.id} → ${id}`).toBeDefined();
      for (const id of rule.deliverableIds) expect(findDeliverable(id), `${rule.id} → ${id}`).toBeDefined();
    }
  });
});

describe('findPhase', () => {
  it('accepts ids, codes, and "Phase X" forms', () => {
    expect(findPhase('a')?.id).toBe('a');
    expect(findPhase('A')?.id).toBe('a');
    expect(findPhase('Phase A')?.id).toBe('a');
    expect(findPhase('フェーズ B')?.id).toBe('b');
    expect(findPhase('preliminary')?.code).toBe('Preliminary');
    expect(findPhase('requirements management')?.id).toBe('requirements-management');
    expect(findPhase('nope')).toBeUndefined();
  });
});

describe('matchesKeyword', () => {
  it('requires word boundaries for ASCII keywords', () => {
    expect(matchesKeyword('we need better management', 'ma')).toBe(false);
    expect(matchesKeyword('this is an m&a deal', 'm&a')).toBe(true);
    expect(matchesKeyword('migrating to aws next year', 'aws')).toBe(true);
    expect(matchesKeyword('lawsuit pending', 'aws')).toBe(false);
  });

  it('uses substring matching for Japanese keywords', () => {
    expect(matchesKeyword('レガシー刷新を任された', 'レガシー')).toBe(true);
    expect(matchesKeyword('クラウド移行の相談', '移行')).toBe(true);
    expect(matchesKeyword('全く関係のない話', 'レガシー')).toBe(false);
  });
});

describe('searchKnowledge', () => {
  it('finds entries by Japanese keyword', () => {
    const hits = searchKnowledge('ギャップ分析');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.id === 'gap-analysis')).toBe(true);
  });

  it('finds entries by English keyword', () => {
    const hits = searchKnowledge('roadmap');
    expect(hits.some((h) => h.id === 'architecture-roadmap')).toBe(true);
  });

  it('restricts by kind and honours the limit', () => {
    const hits = searchKnowledge('architecture', { kinds: ['glossary'], limit: 3 });
    expect(hits.length).toBeLessThanOrEqual(3);
    expect(hits.every((h) => h.kind === 'glossary')).toBe(true);
  });

  it('returns nothing for an empty query', () => {
    expect(searchKnowledge('   ')).toEqual([]);
  });
});

describe('matchConsultRules', () => {
  it('matches a Japanese legacy-renewal situation', () => {
    const matches = matchConsultRules('レガシーな基幹システムの刷新を任された。何から始めるべきか');
    expect(matches[0]?.rule.id).toBe('legacy-modernization');
  });

  it('matches an English cloud-migration situation', () => {
    const matches = matchConsultRules('We are planning a lift and shift migration to AWS next year');
    expect(matches.map((m) => m.rule.id)).toContain('cloud-migration');
  });

  it('matches governance decay', () => {
    const matches = matchConsultRules('決めた技術標準が現場で守られない。勝手に別の製品が使われている');
    expect(matches.map((m) => m.rule.id)).toContain('governance-decay');
  });

  it('boosts rules that cover the current phase', () => {
    const withoutPhase = matchConsultRules('ステークホルダーの意見が割れて決まらない');
    const withPhase = matchConsultRules('ステークホルダーの意見が割れて決まらない', 'a');
    const target = 'stakeholder-conflict';
    const before = withoutPhase.find((m) => m.rule.id === target)?.score ?? 0;
    const after = withPhase.find((m) => m.rule.id === target)?.score ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  it('returns nothing when no keyword is present', () => {
    expect(matchConsultRules('今日の天気はとても良い')).toEqual([]);
  });

  it('caps the number of returned rules', () => {
    const matches = matchConsultRules(
      'レガシー刷新とクラウド移行とM&A統合とセキュリティ規制対応と要件変更が同時に起きている',
      undefined,
      2,
    );
    expect(matches.length).toBeLessThanOrEqual(2);
  });
});
