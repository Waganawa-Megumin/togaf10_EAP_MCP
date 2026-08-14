/**
 * 業界別参照能力セットの整合性テスト / Integrity tests for the industry capability sets.
 *
 * 能力マップ草案が「どの業界でも同じ 14 件」に戻らないことを機械的に守る。
 * ここが壊れると、地方銀行に産業機械メーカーと同じ図が返る。
 */

import { describe, expect, it } from 'vitest';
import {
  INDUSTRY_CAPABILITY_SETS,
  REFERENCE_CAPABILITIES,
  detectIndustryCapabilitySets,
  findIndustryCapability,
  findIndustryCapabilitySet,
} from '../src/knowledge/business-architecture.js';

describe('industry capability sets', () => {
  it('covers the industries the capability map promises', () => {
    const ids = INDUSTRY_CAPABILITY_SETS.map((s) => s.id);
    for (const required of [
      'banking',
      'insurance',
      'manufacturing',
      'healthcare',
      'retail-ecommerce',
      'public-sector',
      'telecommunications',
    ]) {
      expect(ids, `${required} is missing`).toContain(required);
    }
  });

  it('names capabilities as nouns and fills every field', () => {
    const seen = new Set<string>();
    for (const set of INDUSTRY_CAPABILITY_SETS) {
      expect(set.capabilities.length, `${set.id} has too few capabilities`).toBeGreaterThanOrEqual(6);
      expect(set.notes.length, `${set.id} notes`).toBeGreaterThan(0);
      expect(set.detectors.length, `${set.id} detectors`).toBeGreaterThan(0);
      for (const cap of set.capabilities) {
        expect(seen.has(cap.id), `${cap.id} is duplicated`).toBe(false);
        seen.add(cap.id);
        // 「〜する」で終わる名前はプロセスであって能力ではない
        expect(cap.name.ja.endsWith('する'), `${cap.id} is a verb`).toBe(false);
        expect(cap.definition.ja.length, `${cap.id} definition`).toBeGreaterThan(0);
        expect(cap.definition.en.length, `${cap.id} definition en`).toBeGreaterThan(0);
        expect(cap.typicalL2.length, `${cap.id} L2`).toBeGreaterThanOrEqual(3);
        expect(cap.weakSigns.length, `${cap.id} weak signs`).toBeGreaterThan(0);
        expect(cap.probes.length, `${cap.id} probes`).toBeGreaterThan(0);
        expect(cap.triggers.length, `${cap.id} triggers`).toBeGreaterThan(0);
      }
    }
  });

  it('only supersedes generic capabilities that actually exist', () => {
    const genericIds = new Set(REFERENCE_CAPABILITIES.map((c) => c.id));
    for (const set of INDUSTRY_CAPABILITY_SETS) {
      for (const cap of set.capabilities) {
        for (const superseded of cap.supersedes ?? []) {
          expect(genericIds.has(superseded), `${cap.id} supersedes unknown ${superseded}`).toBe(true);
        }
      }
    }
  });

  it('resolves an industry argument written in either language or loosely', () => {
    expect(findIndustryCapabilitySet('金融')?.id).toBe('banking');
    expect(findIndustryCapabilitySet('地方銀行')?.id).toBe('banking');
    expect(findIndustryCapabilitySet('banking')?.id).toBe('banking');
    expect(findIndustryCapabilitySet('製造業')?.id).toBe('manufacturing');
    expect(findIndustryCapabilitySet('保険')?.id).toBe('insurance');
    expect(findIndustryCapabilitySet('自治体')?.id).toBe('public-sector');
    expect(findIndustryCapabilitySet('まったく無関係な業界')).toBeUndefined();
    expect(findIndustryCapabilitySet('   ')).toBeUndefined();
  });

  it('infers the industry from the wording of the business description', () => {
    const bank = detectIndustryCapabilitySets(
      '地方銀行。県内の個人・中小企業向けに預金、融資、為替を提供。課題は融資審査の高度化とマネロン対策。',
    );
    expect(bank[0]?.set.id).toBe('banking');

    const factory = detectIndustryCapabilitySets(
      '産業機械メーカー。国内 3 工場で搬送装置を受注生産し、設計・製造・据付・保守まで自社で対応。',
    );
    expect(factory[0]?.set.id).toBe('manufacturing');

    const hospital = detectIndustryCapabilitySets('急性期病院。外来と入院の診療を行い、レセプトで診療報酬を請求する。');
    expect(hospital[0]?.set.id).toBe('healthcare');

    // 手がかりが無い説明では推定しない(空配列か、弱い候補しか出ない)
    const vague = detectIndustryCapabilitySets('何かをやっている会社です。');
    expect(vague.every((d) => d.score < 4)).toBe(true);
  });

  it('does not call a logistics company a manufacturer', () => {
    // 「在庫」「出荷」「物流」は製造業の detectors にもあるが、当たっているのは
    // 製造業セットの 1 能力(在庫・物流運営)の語彙だけ。素点だけで判定すると
    // 物流会社に「製造実行・工程管理」「品質保証・トレーサビリティ」が付く。
    const logistics = detectIndustryCapabilitySets(
      '総合物流会社。倉庫と幹線輸送、ラストマイル配送を行う。在庫の保管と出荷が中心。',
    );
    expect(logistics.every((d) => !d.confident)).toBe(true);

    // 業界名が出ていなくても、業界固有の語が複数の能力にまたがれば推定してよい
    const unnamedBank = detectIndustryCapabilitySets('預金を預かり、融資を実行し、為替と住宅ローンを扱っている。');
    const confident = unnamedBank.filter((d) => d.confident);
    expect(confident[0]?.set.id).toBe('banking');
  });

  it('gives a bank capabilities a factory never gets, and the other way round', () => {
    const bankNames = (findIndustryCapabilitySet('banking')?.capabilities ?? []).map((c) => c.name.ja);
    const factoryNames = (findIndustryCapabilitySet('manufacturing')?.capabilities ?? []).map((c) => c.name.ja);
    expect(bankNames).toContain('与信・審査');
    expect(bankNames).toContain('預金・口座管理');
    expect(bankNames).toContain('AML / 金融犯罪対策');
    expect(factoryNames).toContain('製造実行・工程管理');
    expect(bankNames.filter((n) => factoryNames.includes(n))).toHaveLength(0);
  });

  it('finds one industry capability by id or by name', () => {
    expect(findIndustryCapability('banking-credit-underwriting')?.name.ja).toBe('与信・審査');
    expect(findIndustryCapability('与信・審査')?.id).toBe('banking-credit-underwriting');
    expect(findIndustryCapability('存在しない能力')).toBeUndefined();
  });
});
