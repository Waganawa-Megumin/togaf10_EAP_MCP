/**
 * ArchiMate データの単一情報源テスト / ArchiMate single-source-of-truth tests.
 *
 * ArchiMate の知識は 2 か所に分かれている:
 *   - `src/knowledge/archimate.ts`  … 参照用の解説(何を表すか / 使い方 / 混同しやすい要素)
 *   - `src/tools/archimate.ts`      … 関係の妥当性を判定するための分類(aspect)
 *
 * 目的が違うので構造は分けているが、**同じ概念を二通りに教えてはならない**。
 * ここで要素 ID・英語名・層の一致を機械的に固定し、ずれたらビルドで落ちるようにする。
 */

import { describe, expect, it } from 'vitest';
import {
  ARCHIMATE_ELEMENTS,
  ARCHIMATE_LAYERS,
  ARCHIMATE_RELATIONSHIPS,
  TOGAF_ARCHIMATE_MAPPING,
  findPhase,
} from '../src/knowledge/index.js';
import { ELEMENTS as TOOL_ELEMENTS } from '../src/tools/archimate.js';

const byId = new Map(ARCHIMATE_ELEMENTS.map((e) => [e.id, e]));

describe('the two ArchiMate datasets stay in step', () => {
  it('defines every judgement-engine element in the knowledge base too', () => {
    const missing = TOOL_ELEMENTS.filter((e) => !byId.has(e.id)).map((e) => e.id);
    expect(missing, 'elements only in src/tools/archimate.ts').toEqual([]);
  });

  it('agrees on the layer of every shared element', () => {
    for (const element of TOOL_ELEMENTS) {
      const known = byId.get(element.id);
      if (!known) continue;
      expect(known.layer, `${element.id} layer`).toBe(element.layer);
    }
  });

  it('agrees on the English name of every shared element', () => {
    for (const element of TOOL_ELEMENTS) {
      const known = byId.get(element.id);
      if (!known) continue;
      expect(known.name.en, `${element.id} name`).toBe(element.name);
    }
  });
});

describe('ArchiMate layer invariants', () => {
  it('keeps layer.phaseIds consistent with the phase → layer mapping', () => {
    // 層側の「このフェーズで描く」と、フェーズ側の「このフェーズで描く層」が
    // 食い違うと、2 つのツールが違うことを言う。
    const layersByPhase = new Map(TOGAF_ARCHIMATE_MAPPING.map((m) => [m.phaseId, new Set(m.layers)]));
    for (const layer of ARCHIMATE_LAYERS) {
      for (const phaseId of layer.phaseIds) {
        expect(findPhase(phaseId), `${layer.id} → ${phaseId}`).toBeDefined();
        expect(
          layersByPhase.get(phaseId)?.has(layer.id),
          `layer ${layer.id} claims phase ${phaseId}, but the phase mapping does not list it`,
        ).toBe(true);
      }
    }
  });

  it('places every element in a declared layer', () => {
    const layerIds = new Set(ARCHIMATE_LAYERS.map((l) => l.id));
    for (const element of ARCHIMATE_ELEMENTS) {
      expect(layerIds.has(element.layer), `${element.id} → ${element.layer}`).toBe(true);
    }
  });
});

describe('relationship semantics', () => {
  it('describes realization as concrete → abstract', () => {
    // 向きを逆に教えると、取り込めない/意味が反転したモデルになる。
    // 実際にレビューで逆になっていたため、テストで固定する。
    const realization = ARCHIMATE_RELATIONSHIPS.find((r) => r.id === 'realization');
    expect(realization).toBeDefined();
    const japanese = `${realization!.meaning.ja} ${realization!.usage.ja}`;
    expect(japanese).toContain('具体');
    expect(japanese).toContain('抽象');
    // 「抽象 → 具体」と書いてあってはいけない
    expect(japanese).not.toMatch(/抽象\s*→\s*具体/);
    expect(japanese).not.toContain('抽象度が下がる方向');
  });

  it('classifies every relationship', () => {
    const allowed = new Set(['structural', 'dependency', 'dynamic', 'other']);
    expect(ARCHIMATE_RELATIONSHIPS.length).toBeGreaterThanOrEqual(10);
    for (const relationship of ARCHIMATE_RELATIONSHIPS) {
      expect(allowed.has(relationship.category), `${relationship.id} category`).toBe(true);
    }
  });
});
