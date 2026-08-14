/**
 * 入力長と出力量の上限の回帰テスト / Regression tests for the input and output limits.
 *
 * 入力側: 上限を超えた文字列は**保存前に**弾く(黙って切り詰めない)。
 *         切り詰めると、利用者は自分の書いた内容が失われたことに気付けない。
 * 出力側: 件数の多い案件でも 1 回の応答を無制限に伸ばさない。切ったときは
 *         「何件中の何件を出したか」を必ず添える(黙って切らない)。
 */

import { describe, expect, it } from 'vitest';
import {
  EngagementInputError,
  MAX_LIST_ITEMS,
  OUTPUT_LIMITS,
  TEXT_LIMITS,
  assertEngagementProfile,
  assertTextLimit,
  assertTextListLimit,
  capCell,
  capNotice,
  capRows,
  createEngagement,
  makeId,
  now,
  type Action,
  type Engagement,
  type Risk,
  type Stakeholder,
} from '../src/engagement/model.js';
import { renderDashboardMarkdown } from '../src/dashboard/markdown.js';

describe('入力長の上限 / input length limits', () => {
  it('accepts a name at the limit and rejects one character more', () => {
    const limit = TEXT_LIMITS.name.limit;
    expect(limit).toBe(200);

    expect(() => createEngagement({ name: 'あ'.repeat(limit) })).not.toThrow();

    let thrown: unknown;
    try {
      createEngagement({ name: 'あ'.repeat(limit + 1) });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(EngagementInputError);
    const err = thrown as EngagementInputError;
    expect(err.field).toBe('name');
    expect(err.limit).toBe(limit);
    expect(err.actual).toBe(limit + 1);
    // 利用者がそのまま読むメッセージなので、上限・実測・逃がし先が日英で入っている
    expect(err.message).toContain('200');
    expect(err.message).toContain('201');
    expect(err.message).toContain(TEXT_LIMITS.name.hint.ja);
    expect(err.message).toContain(TEXT_LIMITS.name.hint.en);
  });

  it('accepts a description at the limit and rejects one character more', () => {
    const limit = TEXT_LIMITS.text.limit;
    expect(limit).toBe(4000);

    expect(() => createEngagement({ name: 'ok', description: 'x'.repeat(limit) })).not.toThrow();
    expect(() => createEngagement({ name: 'ok', description: 'x'.repeat(limit + 1) })).toThrow(
      EngagementInputError,
    );

    try {
      createEngagement({ name: 'ok', description: 'x'.repeat(limit + 1) });
      expect.unreachable('4001 chars should be rejected');
    } catch (error) {
      const err = error as EngagementInputError;
      expect(err.field).toBe('description');
      expect(err.actual).toBe(4001);
    }
  });

  it('never truncates silently: the rejected value is not stored', () => {
    const tooLong = 'あ'.repeat(TEXT_LIMITS.name.limit + 1);
    expect(() => createEngagement({ name: tooLong })).toThrow(EngagementInputError);
    // 例外が出た以上、切り詰められた案件は存在しない
    const ok = createEngagement({ name: tooLong.slice(0, TEXT_LIMITS.name.limit) });
    expect(ok.name).toHaveLength(TEXT_LIMITS.name.limit);
  });

  it('applies each kind of limit to the field it belongs to', () => {
    expect(() => assertTextLimit('industry', 'x'.repeat(100), 'industry')).not.toThrow();
    expect(() => assertTextLimit('industry', 'x'.repeat(101), 'industry')).toThrow(EngagementInputError);
    expect(() => assertTextLimit('risks[0].title', 'x'.repeat(300), 'title')).not.toThrow();
    expect(() => assertTextLimit('risks[0].title', 'x'.repeat(301), 'title')).toThrow(EngagementInputError);
    expect(() => assertTextLimit('concerns[0]', 'x'.repeat(500), 'concern')).not.toThrow();
    expect(() => assertTextLimit('concerns[0]', 'x'.repeat(501), 'concern')).toThrow(EngagementInputError);

    // 未指定・文字列以外は素通し(必須チェックはここの責務ではない)
    expect(() => assertTextLimit('name', undefined, 'name')).not.toThrow();
    expect(() => assertTextLimit('name', null, 'name')).not.toThrow();
    expect(() => assertTextLimit('name', 12345, 'name')).not.toThrow();
  });

  it('caps how many entries one list field can hold', () => {
    const concerns = (n: number) => Array.from({ length: n }, (_, i) => `関心事 ${i}`);
    expect(() => assertTextListLimit('concerns', concerns(MAX_LIST_ITEMS), 'concern')).not.toThrow();

    try {
      assertTextListLimit('concerns', concerns(MAX_LIST_ITEMS + 1), 'concern');
      expect.unreachable('101 entries should be rejected');
    } catch (error) {
      const err = error as EngagementInputError;
      expect(err).toBeInstanceOf(EngagementInputError);
      expect(err.field).toBe('concerns');
      expect(err.limit).toBe(MAX_LIST_ITEMS);
      expect(err.actual).toBe(MAX_LIST_ITEMS + 1);
    }

    // 件数が収まっていても、1 件が長ければ弾く(位置つきで報告する)
    try {
      assertTextListLimit('concerns', ['ok', 'x'.repeat(501)], 'concern');
      expect.unreachable('an oversized entry should be rejected');
    } catch (error) {
      expect((error as EngagementInputError).field).toBe('concerns[1]');
    }
  });

  it('checks every profile field through assertEngagementProfile', () => {
    for (const field of ['name', 'client', 'industry', 'description', 'scope'] as const) {
      const over = field === 'industry' ? 101 : field === 'description' || field === 'scope' ? 4001 : 201;
      try {
        assertEngagementProfile({ [field]: 'x'.repeat(over) });
        expect.unreachable(`${field} over the limit should be rejected`);
      } catch (error) {
        expect((error as EngagementInputError).field, field).toBe(field);
      }
    }
  });
});

describe('出力量の上限 / output size limits', () => {
  it('caps a list and reports how much it hid', () => {
    const rows = Array.from({ length: 60 }, (_, i) => i);

    const capped = capRows(rows, 5);
    expect(capped.rows).toHaveLength(5);
    expect(capped.total).toBe(60);
    expect(capped.hidden).toBe(55);
    expect(capped.capped).toBe(true);

    const notice = capNotice(capped, { ja: '全件は format="json" で。', en: 'Use format="json".' }, 'ja');
    // 「他 55 件」だけでは母数が分からない。出した件数・全件数・隠した件数の 3 つを出す
    expect(notice).toContain('5');
    expect(notice).toContain('60');
    expect(notice).toContain('55');
    expect(notice).toContain('全件は format="json" で。');
  });

  it('says nothing when nothing was cut', () => {
    const capped = capRows([1, 2, 3], 5);
    expect(capped.capped).toBe(false);
    expect(capped.hidden).toBe(0);
    expect(capNotice(capped, { ja: 'ja', en: 'en' }, 'both')).toBe('');
  });

  it('falls back to the shared default for a nonsensical limit', () => {
    const rows = Array.from({ length: 100 }, (_, i) => i);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(capRows(rows, bad).rows).toHaveLength(OUTPUT_LIMITS.rows);
    }
  });

  it('keeps one cell from breaking the table, and marks what it dropped', () => {
    const long = `${'あ'.repeat(200)}\n${'い'.repeat(50)}`;
    const cell = capCell(long);
    expect(cell).not.toContain('\n');
    expect(cell.startsWith('あ'.repeat(OUTPUT_LIMITS.cell))).toBe(true);
    expect(cell).toContain(`(+${251 - OUTPUT_LIMITS.cell})`);
    expect(capCell('短い値')).toBe('短い値');
  });
});

/**
 * 明細を n 件ずつ積んだ案件を作る。
 * タイトルは番号入りにして、どの行が出て、どの行が落ちたかを機械的に判定できるようにする。
 */
function crowdedEngagement(count: number): Engagement {
  const engagement = createEngagement({ name: '出力量テスト案件', client: 'ACME' });
  const t = now();
  const risks: Risk[] = Array.from({ length: count }, (_, i) => ({
    id: makeId('risk'),
    title: `リスク${i + 1}番`,
    level: 'high',
    status: 'open',
    owner: `担当${i + 1}`,
    createdAt: t,
    updatedAt: t,
  }));
  const actions: Action[] = Array.from({ length: count }, (_, i) => ({
    id: makeId('act'),
    title: `アクション${i + 1}番`,
    status: 'todo',
    priority: 'high',
    owner: `担当${i + 1}`,
    createdAt: t,
    updatedAt: t,
  }));
  const stakeholders: Stakeholder[] = Array.from({ length: count }, (_, i) => ({
    id: makeId('stk'),
    name: `関係者${i + 1}番`,
    influence: 'high',
    interest: 'high',
    concerns: [],
    createdAt: t,
    updatedAt: t,
  }));
  return { ...engagement, risks, actions, stakeholders };
}

/** 「| リスク7番 | …」形式の明細行を数える */
function riskRows(md: string): number {
  return (md.match(/^\| リスク\d+番 /gm) ?? []).length;
}

describe('ダッシュボードの出力量 / dashboard output size', () => {
  const COUNT = 60;

  it('caps a crowded engagement without being asked, and says so', () => {
    const md = renderDashboardMarkdown(crowdedEngagement(COUNT), 'ja');

    expect(riskRows(md)).toBe(OUTPUT_LIMITS.rows);
    expect(md).toContain('リスク1番');
    expect(md).not.toContain(`リスク${COUNT}番`);

    // 切ったことを黙って済ませない: 隠した件数と母数の両方を出す
    expect(md).toMatch(/40\s*件/);
    expect(md).toMatch(/60\s*件/);
    // 全件を見る手段を必ず添える
    expect(md).toMatch(/compact|format="json"|get_engagement/);
  });

  it('applies the same cap to every crowded table, not just to risks', () => {
    const md = renderDashboardMarkdown(crowdedEngagement(COUNT), 'ja');
    expect(md).toContain('アクション1番');
    expect(md).not.toContain(`アクション${COUNT}番`);
    expect(md).toContain('関係者1番');
    expect(md).not.toContain(`関係者${COUNT}番`);
  });

  it('still prints everything when the caller explicitly refuses the cap', () => {
    const md = renderDashboardMarkdown(crowdedEngagement(COUNT), 'ja', { compact: false });
    expect(riskRows(md)).toBe(COUNT);
    expect(md).toContain(`リスク${COUNT}番`);
    expect(md).not.toMatch(/他\s*\d+\s*件/);
  });

  it('cuts harder when asked for the print-on-one-page rendering', () => {
    const md = renderDashboardMarkdown(crowdedEngagement(COUNT), 'ja', { compact: true, limit: 5 });
    expect(riskRows(md)).toBe(5);
    for (const i of [1, 2, 3, 4, 5]) expect(md, `リスク${i}番`).toContain(`リスク${i}番`);
    for (const i of [6, 20, 59, 60]) expect(md, `リスク${i}番`).not.toContain(`リスク${i}番`);
    expect(md).toMatch(/55\s*件/);
  });

  it('is materially shorter than the uncapped rendering', () => {
    const engagement = crowdedEngagement(COUNT);
    const full = renderDashboardMarkdown(engagement, 'ja', { compact: false });
    const capped = renderDashboardMarkdown(engagement, 'ja');
    expect(full.length).toBeGreaterThan(6000);
    expect(capped.length).toBeLessThan(full.length * 0.75);
  });

  it('leaves a small engagement untouched', () => {
    const md = renderDashboardMarkdown(crowdedEngagement(3), 'ja');
    for (const i of [1, 2, 3]) expect(md).toContain(`リスク${i}番`);
    expect(riskRows(md)).toBe(3);
    expect(md).not.toMatch(/他\s*\d+\s*件/);
  });
});
