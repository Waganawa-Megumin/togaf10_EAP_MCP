/**
 * 出典(source)と確度(confidence)の型・正規化・検査 / Provenance on engagement entities.
 *
 * ここで守りたいのは 3 つ。
 *  1. **この欄が無い保存済み JSON が今までどおり読めて、更新できる**
 *  2. 新しい欄が保存 → 読み込みで往復する
 *  3. 不正な値は「書き込み時は明確なエラー」「読み込み時は黙って落とす」
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEngagement, loadEngagementById, saveEngagement } from '../src/engagement/store.js';
import {
  CONFIDENCE_DEFINITIONS,
  CONFIDENCE_LEVELS,
  EngagementInputError,
  EngagementValueError,
  TEXT_LIMITS,
  assertProvenance,
  checkProvenance,
  confidenceLabel,
  confidenceMeaning,
  createEngagement,
  hasProvenance,
  isConfidence,
  mergeProvenance,
  normalizeEngagement,
  normalizeProvenance,
  provenanceCell,
  sanitizeProvenance,
  shortSource,
  summarizeProvenance,
  type Risk,
} from '../src/engagement/model.js';

let dir: string;
const original = process.env.TOGAF_EAP_DATA_DIR;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'togaf-eap-prov-'));
  process.env.TOGAF_EAP_DATA_DIR = dir;
});

afterEach(() => {
  if (original === undefined) delete process.env.TOGAF_EAP_DATA_DIR;
  else process.env.TOGAF_EAP_DATA_DIR = original;
  rmSync(dir, { recursive: true, force: true });
});

/** 出典欄がまだ無かった頃の保存ファイルをそのまま置く */
function writeLegacyEngagement(id: string): void {
  mkdirSync(join(dir, 'engagements'), { recursive: true });
  const legacy = {
    id,
    name: '旧形式の案件',
    client: 'ACME',
    currentPhaseId: 'a',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    phases: [{ phaseId: 'a', status: 'in_progress', updatedAt: '2026-01-01T00:00:00.000Z' }],
    risks: [
      {
        id: 'risk-1-legacy',
        title: '要員不足',
        level: 'high',
        status: 'open',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    decisions: [],
    actions: [],
    stakeholders: [],
    deliverables: [],
    transitions: [],
    workPackages: [],
    assessments: [],
    notes: [],
  };
  writeFileSync(join(dir, 'engagements', `${id}.json`), `${JSON.stringify(legacy, null, 2)}\n`, 'utf8');
  writeFileSync(
    join(dir, 'index.json'),
    `${JSON.stringify(
      {
        currentId: id,
        engagements: [
          { id, name: '旧形式の案件', client: 'ACME', currentPhaseId: 'a', archived: false, updatedAt: '2026-01-01T00:00:00.000Z' },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

describe('confidence の定義', () => {
  it('3 値ちょうどで、すべて日英の意味を持つ', () => {
    expect([...CONFIDENCE_LEVELS]).toEqual(['stated', 'inferred', 'unknown']);
    for (const level of CONFIDENCE_LEVELS) {
      const def = CONFIDENCE_DEFINITIONS[level];
      expect(def.value).toBe(level);
      expect(def.label.ja.length).toBeGreaterThan(0);
      expect(def.label.en.length).toBeGreaterThan(0);
      expect(def.meaning.ja.length).toBeGreaterThan(0);
      expect(def.meaning.en.length).toBeGreaterThan(0);
    }
  });

  it('ラベルと意味は未設定でも読める文面を返す', () => {
    expect(confidenceLabel('stated', 'ja')).toBe('記載あり');
    expect(confidenceLabel('stated', 'en')).toBe('stated');
    expect(confidenceLabel(undefined, 'ja')).toBe('未設定');
    expect(confidenceMeaning(undefined, 'en')).toContain('not set');
    expect(isConfidence('stated')).toBe(true);
    expect(isConfidence('high')).toBe(false);
  });
});

describe('正規化', () => {
  it('空白を畳み、空文字は欄ごと落とす', () => {
    expect(normalizeProvenance({ source: '  security-report.pdf\n p.5  ', confidence: 'STATED' })).toEqual({
      source: 'security-report.pdf p.5',
      confidence: 'stated',
    });
    expect(normalizeProvenance({ source: '   ', confidence: '  ' })).toEqual({});
    expect(normalizeProvenance(undefined)).toEqual({});
  });

  it('読み込み側(sanitize)は読めない値を黙って落とし、決して投げない', () => {
    expect(sanitizeProvenance({ source: 'p.5', confidence: 'high' })).toEqual({ source: 'p.5' });
    expect(sanitizeProvenance({ source: 42, confidence: null })).toEqual({});
    expect(sanitizeProvenance({ source: 'x'.repeat(TEXT_LIMITS.source.limit + 50) }).source?.length).toBe(
      TEXT_LIMITS.source.limit,
    );
  });

  it('部分更新は「未指定なら保つ / 空文字なら消す」', () => {
    const current = { source: 'security-report.pdf p.5', confidence: 'stated' as const };
    expect(mergeProvenance(current, {})).toEqual(current);
    expect(mergeProvenance(current, { source: '2026-08-14 ヒアリング' })).toEqual({
      source: '2026-08-14 ヒアリング',
      confidence: 'stated',
    });
    expect(mergeProvenance(current, { source: '' })).toEqual({ confidence: 'stated' });
    expect(mergeProvenance(current, { confidence: '' })).toEqual({ source: 'security-report.pdf p.5' });
  });
});

describe('検査', () => {
  it('confidence の不正値は明確なエラーになる', () => {
    expect(() => assertProvenance('risks[0]', { confidence: 'high' })).toThrow(EngagementValueError);
    try {
      assertProvenance('risks[0]', { confidence: 'high' });
    } catch (error) {
      const e = error as EngagementValueError;
      expect(e.field).toBe('risks[0].confidence');
      expect(e.detail.ja).toContain('stated');
      expect(e.detail.en).toContain('inferred');
    }
    expect(() => assertProvenance('risks[0]', { confidence: 'stated' })).not.toThrow();
    expect(() => normalizeProvenance({ confidence: 'まあまあ' })).toThrow(EngagementValueError);
  });

  it('source の上限超過は長さのエラーになる', () => {
    const tooLong = 'x'.repeat(TEXT_LIMITS.source.limit + 1);
    expect(() => assertProvenance('stakeholders[2]', { source: tooLong })).toThrow(EngagementInputError);
    expect(() => assertProvenance('stakeholders[2]', { source: 'x'.repeat(TEXT_LIMITS.source.limit) })).not.toThrow();
  });

  it('checkProvenance は投げずに日英の文面を返す', () => {
    expect(checkProvenance('risks[0]', { confidence: 'stated', source: 'p.5' })).toBeNull();
    const bad = checkProvenance('risks[0]', { confidence: 'high' }, 'ja');
    expect(bad).toContain('risks[0].confidence');
    const long = checkProvenance('risks[0]', { source: 'x'.repeat(TEXT_LIMITS.source.limit + 1) }, 'en');
    expect(long).toContain('at most');
    expect(checkProvenance('risks[0]', { source: 123 }, 'en')).toContain('must be a string');
  });
});

describe('表示用ヘルパ', () => {
  it('hasProvenance は空白だけの出典を「無い」と見る', () => {
    expect(hasProvenance({ source: 'security-report.pdf p.5' })).toBe(true);
    expect(hasProvenance({ source: '   ' })).toBe(false);
    expect(hasProvenance({ confidence: 'stated' })).toBe(false);
    expect(hasProvenance(undefined)).toBe(false);
  });

  it('shortSource は 1 行に畳んで切る', () => {
    expect(shortSource(' 報告書.pdf\n p.12-18 ')).toBe('報告書.pdf p.12-18');
    expect(shortSource('x'.repeat(60), 20)).toHaveLength(20);
    expect(shortSource(undefined)).toBe('');
  });

  it('provenanceCell は表に置ける形で返し、パイプを逃がす', () => {
    expect(provenanceCell(undefined)).toBe('—');
    expect(provenanceCell({ source: 'a|b' })).toBe('a\\|b');
    const cell = provenanceCell({ source: 'security-report.pdf p.5', confidence: 'stated' }, 'ja');
    expect(cell).toContain('記載あり');
    expect(cell).toContain('security-report.pdf p.5');
    expect(cell).not.toContain('\n');
  });
});

describe('永続化', () => {
  it('出典欄が無い既存の保存データを読み込んで更新できる', () => {
    writeLegacyEngagement('eng-legacy-1');
    const loaded = loadEngagement();
    expect(loaded).not.toBeNull();
    expect(loaded?.risks).toHaveLength(1);
    expect(loaded?.risks[0]?.source).toBeUndefined();
    expect(loaded?.risks[0]?.confidence).toBeUndefined();

    const updated = saveEngagement({ ...loaded!, notes: ['追記'] });
    expect(updated.notes).toEqual(['追記']);
    expect(loadEngagementById('eng-legacy-1')?.risks[0]?.title).toBe('要員不足');
  });

  it('出典と確度が保存 → 読み込みで往復する', () => {
    const engagement = createEngagement({ name: '出典テスト' });
    const risk: Risk = {
      id: 'risk-1-abcdef',
      title: '要員不足',
      level: 'high',
      status: 'open',
      source: 'security-report.pdf p.5',
      confidence: 'stated',
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
    };
    saveEngagement({ ...engagement, risks: [risk] });
    const loaded = loadEngagement();
    expect(loaded?.risks[0]?.source).toBe('security-report.pdf p.5');
    expect(loaded?.risks[0]?.confidence).toBe('stated');
  });

  it('手で編集された読めない confidence は読み込み時に落ちるだけで、案件は壊れない', () => {
    const normalized = normalizeEngagement({
      id: 'eng-1-hand',
      name: '手編集',
      currentPhaseId: 'a',
      risks: [{ id: 'risk-1-hand', title: 'x', level: 'high', status: 'open', source: '  p.5 ', confidence: 'high' }],
      stakeholders: [{ id: 'stk-1-hand', name: '部長', influence: 'high', interest: 'high', concerns: [] }],
    });
    expect(normalized).not.toBeNull();
    expect(normalized?.risks[0]?.source).toBe('p.5');
    expect(normalized?.risks[0]?.confidence).toBeUndefined();
    expect(normalized?.stakeholders[0]?.name).toBe('部長');
  });
});

describe('集計', () => {
  it('出典の有無を数え、無い項目を一覧で返す', () => {
    const engagement = createEngagement({ name: '集計' });
    const stamp = '2026-08-14T00:00:00.000Z';
    const summary = summarizeProvenance({
      ...engagement,
      risks: [
        { id: 'risk-1-a', title: '出典あり', level: 'high', status: 'open', source: 'p.5', confidence: 'stated', createdAt: stamp, updatedAt: stamp },
        { id: 'risk-2-b', title: '出典なし', level: 'low', status: 'open', createdAt: stamp, updatedAt: stamp },
      ],
      stakeholders: [
        { id: 'stk-1-c', name: '部長', influence: 'high', interest: 'high', concerns: [], confidence: 'inferred', createdAt: stamp, updatedAt: stamp },
      ],
    });
    expect(summary.total).toBe(3);
    expect(summary.withSource).toBe(1);
    expect(summary.withoutSource).toBe(2);
    expect(summary.byConfidence).toEqual({ stated: 1, inferred: 1, unknown: 0, unset: 1 });
    expect(summary.missing.map((m) => m.label)).toEqual(['出典なし', '部長']);
    expect(summary.missing[0]?.kind).toBe('risk');
  });
});
