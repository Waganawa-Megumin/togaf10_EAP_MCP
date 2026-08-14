/**
 * 成果物雛形への案件データ流し込みのテスト /
 * Tests for pre-filling deliverable templates from the engagement.
 *
 * ここが黙って壊れると、雛形は「見出しだけの空箱」に戻り、利用者は
 * 登録済みのステークホルダーを手で書き写す羽目になる(それが元の不満だった)。
 * 挿入先は deliverables.ts の見出し文言に依存しているため、文言が変わったときに
 * 気づけるようにしておく。
 */

import { describe, expect, it } from 'vitest';
import { DELIVERABLES, findDeliverable } from '../src/knowledge/index.js';
import { createEngagement } from '../src/engagement/model.js';
import { renderDeliverableTemplate } from '../src/tools/format.js';
import type { Engagement } from '../src/engagement/model.js';

function sample(): Engagement {
  const e = createEngagement({
    name: 'テスト案件',
    client: 'テスト商事',
    industry: '製造',
    description: '基幹刷新',
    scope: '国内 3 拠点',
  });
  e.stakeholders = [
    {
      id: 'stk-1',
      name: '田中 経理部長',
      role: '部長',
      organization: '経理部',
      influence: 'high',
      interest: 'high',
      concerns: ['月次決算が 5 営業日を超えないこと'],
      approach: '隔週で個別説明',
    },
    {
      id: 'stk-2',
      name: '山本 センター長',
      role: 'センター長',
      organization: '物流本部',
      influence: 'low',
      interest: 'low',
      concerns: [],
    },
  ];
  e.risks = [
    { id: 'risk-1', title: '軽いリスク', level: 'low', status: 'open' },
    { id: 'risk-2', title: '重いリスク', level: 'critical', status: 'open' },
  ];
  return e;
}

describe('renderDeliverableTemplate — engagement pre-fill', () => {
  it('drops recorded stakeholders into the stakeholder map', () => {
    const d = findDeliverable('stakeholder-map')!;
    const out = renderDeliverableTemplate(d, 'ja', 'テスト案件', sample());
    expect(out).toContain('田中 経理部長');
    expect(out).toContain('山本 センター長');
    // 作り物の記入例は実データに置き換わる
    expect(out).not.toContain('アーキテクト A');
  });

  it('returns the untouched skeleton when there is no engagement', () => {
    const d = findDeliverable('stakeholder-map')!;
    const withNull = renderDeliverableTemplate(d, 'ja', undefined, null);
    const legacy = renderDeliverableTemplate(d, 'ja');
    expect(withNull).toBe(legacy);
    expect(withNull).not.toContain('田中 経理部長');
  });

  it('produces different bodies for different engagements', () => {
    const d = findDeliverable('architecture-vision')!;
    const a = renderDeliverableTemplate(d, 'ja', 'A', sample());
    const b = createEngagement({ name: 'B 案件', client: '別会社', industry: '金融' });
    b.stakeholders = [
      { id: 'stk-9', name: '高橋 常務', role: '常務', influence: 'high', interest: 'high' },
    ];
    const outB = renderDeliverableTemplate(d, 'ja', 'B', b);
    expect(a).not.toBe(outB);
    expect(a).toContain('田中 経理部長');
    expect(outB).toContain('高橋 常務');
    expect(outB).not.toContain('田中 経理部長');
  });

  it('orders risks by severity and never invents blank cells', () => {
    const d = findDeliverable('architecture-vision')!;
    const out = renderDeliverableTemplate(d, 'ja', 'テスト案件', sample());
    expect(out.indexOf('重いリスク')).toBeLessThan(out.indexOf('軽いリスク'));
    // 関心事が未登録の人は空欄のまま、かつ埋めていない旨が本文に出る
    expect(out).not.toMatch(/山本 センター長 \| センター長 \| 物流本部 \| [^|\s]/);
  });

  it('escapes pipes and newlines so the tables stay one row per person', () => {
    const e = sample();
    e.stakeholders = [
      {
        id: 'stk-x',
        name: 'パイプ|太郎',
        role: '部長\n改行',
        influence: 'high',
        interest: 'high',
        concerns: ['関心|事\nです'],
      },
    ];
    const out = renderDeliverableTemplate(findDeliverable('stakeholder-map')!, 'ja', 'x', e);
    const rows = out.split('\n').filter((l) => l.startsWith('|'));
    const widths = new Set(rows.map((l) => l.split(/(?<!\\)\|/).length));
    expect(widths.size).toBe(1);
    expect(out).toContain('パイプ\\|太郎');
  });

  it('keeps the data even when no section heading matches', () => {
    const d = structuredClone(findDeliverable('stakeholder-map')!);
    d.template = d.template!.map((s, i) => ({
      ...s,
      heading: { ja: `節 ${i + 1}`, en: `Section ${i + 1}` },
    }));
    const out = renderDeliverableTemplate(d, 'ja', 'テスト案件', sample());
    expect(out).toContain('案件データ(参考)');
    expect(out).toContain('田中 経理部長');
  });

  it('never throws for any deliverable', () => {
    const e = sample();
    for (const d of DELIVERABLES) {
      expect(() => renderDeliverableTemplate(d, 'both', 'テスト案件', e)).not.toThrow();
    }
  });
});
