/**
 * 拡張知識ベースの整合性テスト / Integrity tests for the extended knowledge base.
 *
 * ArchiMate・周辺フレームワーク・セキュリティ EA・ビジネスアーキテクチャは
 * ADM フェーズ ID や技法・成果物 ID を相互参照する。ここが壊れると
 * ツールが黙って空の結果を返すため、参照の実在を機械的に検査する。
 */

import { describe, expect, it } from 'vitest';
import {
  ARCHIMATE_ELEMENTS,
  ARCHIMATE_LAYERS,
  ARCHIMATE_RELATIONSHIPS,
  FRAMEWORKS,
  INDUSTRIES,
  REFERENCE_CAPABILITIES,
  SABSA_LAYERS,
  SECURITY_ARTIFACTS,
  SECURITY_PHASE_MAP,
  TOGAF_ARCHIMATE_MAPPING,
  VIEWPOINTS,
  elementsByLayer,
  findArchiMateElement,
  findArchiMateLayer,
  findArchiMateRelationship,
  findFramework,
  findIndustry,
  findPhase,
  findViewpoint,
  frameworksForPhase,
  type Bilingual,
} from '../src/knowledge/index.js';

/** すべての Bilingual に日英がそろっていることを確かめる */
function expectBilingual(values: (Bilingual | undefined)[], label: string): void {
  for (const value of values) {
    if (!value) continue;
    expect(value.ja.trim().length, `${label} ja`).toBeGreaterThan(0);
    expect(value.en.trim().length, `${label} en`).toBeGreaterThan(0);
  }
}

function expectPhaseIds(ids: string[], label: string): void {
  for (const id of ids) {
    expect(findPhase(id), `${label} → ${id}`).toBeDefined();
  }
}

describe('ArchiMate knowledge', () => {
  it('covers the seven layers with unique ids', () => {
    expect(ARCHIMATE_LAYERS.length).toBe(7);
    expect(new Set(ARCHIMATE_LAYERS.map((l) => l.id)).size).toBe(7);
  });

  it('assigns every element to a real layer', () => {
    const layerIds = new Set(ARCHIMATE_LAYERS.map((l) => l.id));
    expect(ARCHIMATE_ELEMENTS.length).toBeGreaterThanOrEqual(40);
    for (const element of ARCHIMATE_ELEMENTS) {
      expect(layerIds.has(element.layer), `${element.id} → ${element.layer}`).toBe(true);
    }
    expect(new Set(ARCHIMATE_ELEMENTS.map((e) => e.id)).size).toBe(ARCHIMATE_ELEMENTS.length);
  });

  it('maps every ADM phase to real layers and elements', () => {
    const layerIds = new Set(ARCHIMATE_LAYERS.map((l) => l.id));
    expect(TOGAF_ARCHIMATE_MAPPING.length).toBe(10);
    for (const mapping of TOGAF_ARCHIMATE_MAPPING) {
      expect(findPhase(mapping.phaseId), `mapping → ${mapping.phaseId}`).toBeDefined();
      for (const layer of mapping.layers) {
        expect(layerIds.has(layer), `${mapping.phaseId} → ${layer}`).toBe(true);
      }
      for (const elementId of mapping.elementIds) {
        expect(findArchiMateElement(elementId), `${mapping.phaseId} → ${elementId}`).toBeDefined();
      }
    }
  });

  it('looks entries up by id', () => {
    expect(findArchiMateLayer(ARCHIMATE_LAYERS[0].id)).toBeDefined();
    expect(findArchiMateElement(ARCHIMATE_ELEMENTS[0].id)).toBeDefined();
    expect(findArchiMateRelationship(ARCHIMATE_RELATIONSHIPS[0].id)).toBeDefined();
    expect(findArchiMateLayer('nope')).toBeUndefined();
    expect(elementsByLayer('business').length).toBeGreaterThan(0);
  });

  it('is bilingual throughout', () => {
    expectBilingual(ARCHIMATE_LAYERS.flatMap((l) => [l.name, l.purpose]), 'layer');
    expectBilingual(ARCHIMATE_ELEMENTS.flatMap((e) => [e.name, e.meaning, e.usage]), 'element');
    expectBilingual(ARCHIMATE_RELATIONSHIPS.flatMap((r) => [r.name, r.meaning, r.usage]), 'relationship');
  });
});

describe('framework catalog', () => {
  it('holds a useful number of frameworks with unique ids', () => {
    expect(FRAMEWORKS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(FRAMEWORKS.map((f) => f.id)).size).toBe(FRAMEWORKS.length);
  });

  it('references only real ADM phases', () => {
    for (const framework of FRAMEWORKS) {
      expectPhaseIds(framework.phaseIds, framework.id);
    }
  });

  it('always states limits — a framework with no downsides is not useful', () => {
    for (const framework of FRAMEWORKS) {
      expect(framework.limits.length, `${framework.id} limits`).toBeGreaterThan(0);
    }
  });

  it('finds frameworks by id, name, and phase', () => {
    const first = FRAMEWORKS[0];
    expect(findFramework(first.id)?.id).toBe(first.id);
    expect(findFramework(first.name.en)?.id).toBe(first.id);
    expect(findFramework('存在しないもの')).toBeUndefined();
    expect(frameworksForPhase('b').length).toBeGreaterThan(0);
  });
});

describe('security EA knowledge', () => {
  it('covers the six SABSA layers', () => {
    expect(SABSA_LAYERS.length).toBe(6);
    expect(new Set(SABSA_LAYERS.map((l) => l.id)).size).toBe(6);
    expectBilingual(SABSA_LAYERS.flatMap((l) => [l.name, l.purpose]), 'sabsa layer');
  });

  it('maps every ADM phase to security questions', () => {
    expect(SECURITY_PHASE_MAP.length).toBe(10);
    for (const mapping of SECURITY_PHASE_MAP) {
      expect(findPhase(mapping.phaseId), `security → ${mapping.phaseId}`).toBeDefined();
    }
  });

  it('describes security artifacts with unique ids', () => {
    expect(SECURITY_ARTIFACTS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SECURITY_ARTIFACTS.map((a) => a.id)).size).toBe(SECURITY_ARTIFACTS.length);
    expectBilingual(SECURITY_ARTIFACTS.map((a) => a.name), 'artifact');
  });
});

describe('viewpoints and industries', () => {
  it('provides viewpoints tied to real phases', () => {
    expect(VIEWPOINTS.length).toBeGreaterThanOrEqual(12);
    for (const viewpoint of VIEWPOINTS) {
      expectPhaseIds(viewpoint.phaseIds, viewpoint.id);
      expect(viewpoint.concerns.length, `${viewpoint.id} concerns`).toBeGreaterThan(0);
    }
    expect(findViewpoint(VIEWPOINTS[0].id)).toBeDefined();
  });

  it('provides industry guidance tied to real ids', () => {
    expect(INDUSTRIES.length).toBeGreaterThanOrEqual(8);
    for (const industry of INDUSTRIES) {
      expectPhaseIds(industry.phaseIds, industry.id);
      expect(industry.pitfalls.length, `${industry.id} pitfalls`).toBeGreaterThan(0);
    }
  });

  it('finds an industry by Japanese and English wording', () => {
    expect(findIndustry('製造')).toBeDefined();
    expect(findIndustry('financial')).toBeDefined();
    expect(findIndustry('まったく無関係な業界')).toBeUndefined();
  });
});

describe('business architecture reference set', () => {
  it('names capabilities as nouns, not verbs', () => {
    expect(REFERENCE_CAPABILITIES.length).toBeGreaterThanOrEqual(15);
    for (const capability of REFERENCE_CAPABILITIES) {
      // 「〜する」で終わる名前はプロセスであって能力ではない
      expect(capability.name.ja.endsWith('する'), `${capability.id} is a verb`).toBe(false);
    }
  });
});
