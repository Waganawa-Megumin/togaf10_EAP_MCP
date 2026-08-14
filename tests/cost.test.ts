/**
 * 概算コストの解析・集計 / Cost parsing and roll-up.
 * 自由記述の金額を読み違えないこと、読めないものを黙って 0 にしないことを守る。
 */

import { describe, expect, it } from 'vitest';
import {
  budgetFindings,
  findBudgetHints,
  formatAmount,
  parseCostEstimate,
  renderCostSection,
  summarizeCosts,
} from '../src/dashboard/markdown.js';
import { createEngagement, type WorkPackage } from '../src/engagement/model.js';

function wp(partial: Partial<WorkPackage> & { name: string }): WorkPackage {
  return {
    id: partial.name,
    status: 'planned',
    dependsOn: [],
    businessValue: 'medium',
    effort: 'medium',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('parseCostEstimate', () => {
  it('reads Japanese magnitude units', () => {
    expect(parseCostEstimate('約 2.1 億円')?.max).toBe(210_000_000);
    expect(parseCostEstimate('4,000万円')?.max).toBe(40_000_000);
    expect(parseCostEstimate('1億2000万円')?.max).toBe(120_000_000);
    expect(parseCostEstimate('1万5000円')?.max).toBe(15_000);
    expect(parseCostEstimate('1兆円')?.max).toBe(1_000_000_000_000);
  });

  it('marks approximate wording', () => {
    expect(parseCostEstimate('約 2 億円')?.approximate).toBe(true);
    expect(parseCostEstimate('2 億円')?.approximate).toBe(false);
  });

  it('reads plain numbers only when a currency is stated', () => {
    expect(parseCostEstimate('¥50,000,000')?.max).toBe(50_000_000);
    expect(parseCostEstimate('50,000,000円')?.max).toBe(50_000_000);
    expect(parseCostEstimate('8000')).toBeNull();
  });

  it('keeps foreign currencies separate rather than converting them', () => {
    expect(parseCostEstimate('$1.2M')).toMatchObject({ currency: 'USD', max: 1_200_000 });
    expect(parseCostEstimate('€2.5M')?.currency).toBe('EUR');
    expect(parseCostEstimate('2 billion JPY')?.max).toBe(2_000_000_000);
  });

  it('reads ranges, inheriting the unit from the right-hand side', () => {
    expect(parseCostEstimate('3〜5億円')).toMatchObject({ min: 300_000_000, max: 500_000_000 });
    expect(parseCostEstimate('5,000万〜1億円')).toMatchObject({ min: 50_000_000, max: 100_000_000 });
  });

  it('flags per-period costs instead of adding them to a total', () => {
    expect(parseCostEstimate('500万円/年')?.recurring).toBe(true);
    expect(parseCostEstimate('年間 300 万円')?.recurring).toBe(true);
    expect(parseCostEstimate('3,000万円')?.recurring).toBe(false);
  });

  it('refuses what it cannot read rather than guessing', () => {
    expect(parseCostEstimate('未定')).toBeNull();
    expect(parseCostEstimate('TBD')).toBeNull();
    expect(parseCostEstimate('人月換算で調整中')).toBeNull();
    expect(parseCostEstimate('100万円 × 30人月')).toBeNull(); // 掛け算は解釈しない
    expect(parseCostEstimate('30人月')).toBeNull();
    expect(parseCostEstimate('3 months')).toBeNull();
    expect(parseCostEstimate(undefined)).toBeNull();
  });

  it('ignores dates and counts that sit next to the figure', () => {
    expect(parseCostEstimate('2026年度に2億円')?.max).toBe(200_000_000);
    expect(parseCostEstimate('予算 500,000円 (2026年)')?.max).toBe(500_000);
  });
});

describe('formatAmount', () => {
  it('writes yen in 億 / 万 for Japanese and in full digits for English', () => {
    expect(formatAmount(1_100_000_000, 'JPY', 'ja')).toBe('11.0 億円');
    expect(formatAmount(40_000_000, 'JPY', 'ja')).toBe('4,000 万円');
    expect(formatAmount(1_100_000_000, 'JPY', 'en')).toBe('JPY 1,100,000,000');
    expect(formatAmount(1_200_000, 'USD', 'en')).toBe('USD 1,200,000');
  });
});

describe('summarizeCosts', () => {
  const packages = [
    wp({ name: 'A', costEstimate: '約 2.1 億円', startQuarter: '2026-Q1', endQuarter: '2026-Q2' }),
    wp({ name: 'B', costEstimate: '1億2000万円', startQuarter: '2027-Q1', endQuarter: '2027-Q1' }),
    wp({ name: 'C', costEstimate: '人月換算' }),
    wp({ name: 'D', costEstimate: '500万円/年' }),
    wp({ name: 'E' }),
  ];

  it('totals what it can read and discloses what it dropped', () => {
    const r = summarizeCosts(packages);
    expect(r.totals).toHaveLength(1);
    expect(r.totals[0].max).toBe(330_000_000);
    expect(r.unparsed.map((x) => x.name)).toEqual(['C']);
    expect(r.recurring.map((x) => x.name)).toEqual(['D']);
    expect(r.missing).toEqual(['E']);
  });

  it('spreads each package evenly across its quarters and finds the peak year', () => {
    const r = summarizeCosts(packages);
    expect(r.quarters.map((q) => q.label)).toEqual(['2026-Q1', '2026-Q2', '2027-Q1']);
    expect(r.quarters[0].amount).toBe(105_000_000);
    expect(r.peakYear?.label).toBe('2026');
  });

  it('keeps currencies apart instead of inventing an exchange rate', () => {
    const r = summarizeCosts([wp({ name: 'A', costEstimate: '2 億円' }), wp({ name: 'B', costEstimate: '$1M' })]);
    expect(r.totals.map((t) => t.currency).sort()).toEqual(['JPY', 'USD']);
  });

  it('survives hand-edited JSON', () => {
    const r = summarizeCosts([
      // 型に反する値でも落ちないこと(engagement.json は手で編集されうる)
      { id: 'x', name: 'X', costEstimate: 12345 } as unknown as WorkPackage,
      null as unknown as WorkPackage,
    ]);
    expect(r.unparsed.map((x) => x.raw)).toEqual(['12345']);
  });
});

describe('budget hints', () => {
  it('picks up a stated cap and says which period it read', () => {
    const [hint] = findBudgetHints('3 か年で刷新する。予算上限は年 5 億円。');
    expect(hint.amount.max).toBe(500_000_000);
    expect(hint.period).toBe('year');
    expect(findBudgetHints('総予算は 10 億円')[0].period).toBe('total');
    expect(findBudgetHints('特に制約はない')).toHaveLength(0);
  });

  it('reports the years that break an annual cap', () => {
    const rollup = summarizeCosts([
      wp({ name: 'A', costEstimate: '6 億円', startQuarter: '2027-Q1', endQuarter: '2027-Q4' }),
    ]);
    const findings = budgetFindings(rollup, findBudgetHints('予算上限は年 5 億円'));
    expect(findings).toHaveLength(1);
    expect(findings[0].ja).toContain('2027');
    expect(findings[0].ja).toContain('⚠');
  });

  it('does not cry wolf when the plan fits', () => {
    const rollup = summarizeCosts([
      wp({ name: 'A', costEstimate: '1 億円', startQuarter: '2027-Q1', endQuarter: '2027-Q4' }),
    ]);
    const findings = budgetFindings(rollup, findBudgetHints('予算上限は年 5 億円'));
    expect(findings[0].ja).toContain('✔');
  });
});

describe('renderCostSection', () => {
  it('leads with the total and tells the reader what is missing', () => {
    const e = createEngagement({ name: 'X', description: '予算上限は年 5 億円。' });
    e.workPackages = [
      wp({ name: 'A', costEstimate: '6 億円', startQuarter: '2027-Q1', endQuarter: '2027-Q4' }),
      wp({ name: 'B' }),
    ];
    const md = renderCostSection(e, 'ja').join('\n');
    expect(md).toContain('6.0 億円');
    expect(md).toContain('コスト未記入');
    expect(md).toContain('予算との照合');
  });

  it('asks for figures instead of printing a zero total', () => {
    const e = createEngagement({ name: 'X' });
    e.workPackages = [wp({ name: 'A' })];
    const md = renderCostSection(e, 'ja').join('\n');
    expect(md).toContain('costEstimate');
    expect(md).not.toContain('0 円');
  });

  it('escapes pipes coming from user text', () => {
    const e = createEngagement({ name: 'X' });
    e.workPackages = [wp({ name: 'A | B', costEstimate: '2 億円 | 税別', startQuarter: '2026-Q1' })];
    const md = renderCostSection(e, 'ja').join('\n');
    expect(md).toContain('A \\| B');
    expect(md).toContain('税別');
    expect(md).not.toMatch(/\| A \| B \|/);
  });
});

/**
 * 検証で見つかった読み違いの回帰テスト。
 * 「読めない」と言うのは安全側だが、年度表記を金額に化けさせるのは危険側。
 */
describe('parseCostEstimate — 検証で見つかった穴', () => {
  it('reads English ranges (the unit letter used to break the range split)', () => {
    expect(parseCostEstimate('$2.5M - $4M')).toMatchObject({ currency: 'USD', min: 2_500_000, max: 4_000_000 });
    expect(parseCostEstimate('$2.5M〜$4M')).toMatchObject({ currency: 'USD', min: 2_500_000, max: 4_000_000 });
    expect(parseCostEstimate('$5 million to $8 million')).toMatchObject({ min: 5_000_000, max: 8_000_000 });
    expect(parseCostEstimate('USD 3M to USD 5M')).toMatchObject({ currency: 'USD', min: 3_000_000, max: 5_000_000 });
  });

  it('never reads a fiscal-year range as an amount', () => {
    // 「2026-2028 で 3 億円」を 3 億円〜2,026 億円 と読んでいた
    expect(parseCostEstimate('2026-2028 で 3億円')).toBeNull();
    expect(parseCostEstimate('FY2026-2028 3億円')).toBeNull();
    expect(parseCostEstimate('2026-Q1 から 2028-Q4 まで 3億円')?.max).toBe(300_000_000);
  });

  it('does not inherit a unit across unrelated words', () => {
    // 「sprint 3-4 で 2000 万円」を 3 万円〜2,000 万円 と読んでいた
    expect(parseCostEstimate('sprint 3-4 で 2000万円')).toBeNull();
    expect(parseCostEstimate('1-2 億円')).toMatchObject({ min: 100_000_000, max: 200_000_000 });
  });
});

describe('budgetFindings — 合計が欠けたままの「枠内」判定', () => {
  it('says the verdict is a floor when work packages are missing from the total', () => {
    const packages = [
      wp({ name: 'A', costEstimate: '2 億円', startQuarter: '2026-Q1', endQuarter: '2026-Q4' }),
      wp({ name: 'B', costEstimate: '要見積', startQuarter: '2026-Q1', endQuarter: '2026-Q4' }),
      wp({ name: 'C' }),
    ];
    const rollup = summarizeCosts(packages);
    const hints = findBudgetHints('予算上限は年 5 億円');
    const lines = budgetFindings(rollup, hints).map((b) => b.ja);
    expect(lines.some((l) => l.startsWith('✔'))).toBe(true);
    expect(lines.some((l) => l.includes('下限'))).toBe(true);
    expect(lines.join('\n')).toContain('金額として読めないもの 1 件');
    expect(lines.join('\n')).toContain('コスト未記入 1 件');
  });

  it('stays quiet about exclusions when everything was counted', () => {
    const rollup = summarizeCosts([wp({ name: 'A', costEstimate: '2 億円', startQuarter: '2026-Q1' })]);
    const lines = budgetFindings(rollup, findBudgetHints('予算上限は年 5 億円')).map((b) => b.ja);
    expect(lines.join('\n')).not.toContain('下限');
  });
});

describe('findBudgetHints — 英文の切り出し', () => {
  it('quotes only the sentence carrying the cap', () => {
    const hints = findBudgetHints(
      'Move the retail estate to cloud. Constraint: the annual budget cap is $4 million. Complete by end of FY2027.',
    );
    expect(hints).toHaveLength(1);
    expect(hints[0].sentence).toBe('Constraint: the annual budget cap is $4 million');
    expect(hints[0].period).toBe('year');
    expect(hints[0].amount.max).toBe(4_000_000);
  });
});
