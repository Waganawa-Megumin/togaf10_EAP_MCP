/**
 * `explain_for` の打ち消し判定の回帰テスト。
 *
 * 「topic に無い論点を作らない」の検査は tests/explain-for-signals.test.ts にある。
 * こちらはその**言い換え違い**と、**逆向きの実害**(利用者が書いたものを消す)を見る。
 * すべて実呼び出しで再現したものだけを入れてある。
 *
 * 作っていた側(捏造):
 *  1. "There is no deadline set for this work." から「期日が書かれている」を拾っていた。
 *  2. "No budget figure has been agreed." から「金額が書かれている」を拾っていた。
 *  3. "This is not a request for approval." から「判断を求める話である」を拾っていた。
 *  4. 「予算の話ではない。」「これは承認の依頼ではない。」も同じ(SCOPE_WORDS_JA に当たらない)。
 *
 * 消していた側(過剰な打ち消し):
 *  5. 「納期は未定です。」で **「未決事項」を「外した話題」に送っていた**。未定であること自体が
 *     その論点なのに、利用者が書いた唯一の話題を外したと報告していた。
 *  6. 「予算は 5 億円だが、期日は未定。」で、未定は期日にしか掛かっていないのに
 *     **利用者が書いた「5 億円」ごと外していた**。
 *  7. "No estimate is available for the ERP replacement." で、無いのは見積だけなのに
 *     主題である ERP 刷新まで外していた。
 *  8. 素の `.` を全て文末とみなしていたため「投資額は 1.5 億円。」が「投資額は 1.」で切れ、
 *     判定の根拠として引用する文が検算に使えない形になっていた。
 */
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

async function explain(topic: string, lang: 'ja' | 'en'): Promise<string> {
  const client = new Client({ name: 'test', version: '1' }, { capabilities: {} });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(b), client.connect(a)]);
  const res = (await client.callTool({
    name: 'explain_for',
    arguments: { topic, audience: 'executive', lang },
  })) as { content?: { type: string; text?: string }[] };
  await client.close();
  return (res.content ?? []).map((c) => c.text ?? '').join('\n');
}

/** 「拾った論点」の表の行だけを取り出す(列数で他の表と区別する) */
function signalRows(out: string): { label: string; matched: string }[] {
  return out
    .split('\n')
    .filter((line) => line.startsWith('| **'))
    .map((line) => line.split('|').map((c) => c.trim()))
    .filter((cells) => cells.length === 7)
    .map((cells) => ({ label: cells[1].replace(/\*\*/g, ''), matched: cells[2] }));
}

const squeeze = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

describe('explain_for: 打ち消された話題を論点にしない', () => {
  it.each([
    ['There is no deadline set for this work.', 'en', 'A date or deadline is stated'],
    ['No budget figure has been agreed.', 'en', 'A money figure is stated'],
    ['This is not a request for approval.', 'en', 'You are asking for a decision'],
    ['We are not asking you to approve anything today.', 'en', 'You are asking for a decision'],
    ['予算の話ではない。', 'ja', '金額が書かれている'],
    ['これは承認の依頼ではない。', 'ja', '判断・承認を求める話である'],
    ['承認を求めていない。状況の共有だけ。', 'ja', '判断・承認を求める話である'],
    ['経費削減が主題ではない。', 'ja', '金額が書かれている'],
  ] as const)('%s からは「%s」を拾わない', async (topic, lang, label) => {
    const out = await explain(topic, lang);
    expect(signalRows(out).map((r) => r.label)).not.toContain(label);
  });

  it('外したことを黙らない(「外した話題」の表に出す)', async () => {
    const ja = await explain('予算の話ではない。', 'ja');
    expect(ja).toContain('外した話題');
    expect(ja).toContain('| **金額** |');
    const en = await explain('There is no deadline set for this work.', 'en');
    expect(en).toContain('Topic left out');
    expect(en).toContain('| **Dates** |');
  });

  it('「話ではない」だけでは打ち消さない(「電話ではない」に当ててしまうため)', async () => {
    const out = await explain('電話ではない。対面で予算 3 億円の話をする。', 'ja');
    expect(signalRows(out).map((r) => r.label)).toContain('金額が書かれている');
  });
});

describe('explain_for: 打ち消しで利用者の記述まで消さない', () => {
  it('「未定」は未決事項の根拠であって、未決事項の打ち消しではない', async () => {
    const out = await explain('納期は未定です。', 'ja');
    const rows = signalRows(out);
    expect(rows.map((r) => r.label)).toContain('まだ決まっていない部分がある');
    // 「無い」と言われたのは期日なので、そちらは外す
    expect(rows.map((r) => r.label)).not.toContain('期日・時期が書かれている');
  });

  it('同じ文に書かれている数字は、別のものが未定でも残る', async () => {
    const out = await explain('予算は 5 億円だが、期日は未定。', 'ja');
    const money = signalRows(out).find((r) => r.label === '金額が書かれている');
    expect(money?.matched).toBe('5 億円');
  });

  it('取り下げ(中止)のときは数字があっても残さない', async () => {
    const out = await explain('5 億円の刷新案件は中止した。', 'ja');
    expect(signalRows(out).map((r) => r.label)).not.toContain('金額が書かれている');
    expect(out).toContain('| **金額** |');
  });

  it('値が無いという記述は、値を名指しする論点にだけ掛かる', async () => {
    const out = await explain('No estimate is available for the ERP replacement.', 'en');
    expect(signalRows(out).map((r) => r.label)).toContain(
      'A technical or migration approach is at stake',
    );
  });

  it('小数点で文が切れない(根拠として引用する文が検算に使える)', async () => {
    const out = await explain('第2四半期に稼働。投資額は 1.5 億円。', 'ja');
    const money = signalRows(out).find((r) => r.label === '金額が書かれている');
    expect(money?.matched).toBe('1.5 億円');
    expect(out).toContain('「投資額は 1.5 億円。」');
  });
});

describe('explain_for: 反応した語は必ず topic に実在する(機械的な検査)', () => {
  const topics: [string, 'ja' | 'en'][] = [
    ['The cargo terminal upgrade is on hold.', 'en'],
    ['Our Chicago office needs a new network.', 'en'],
    ['The migration was completed two years ago.', 'en'],
    ['We reviewed the FAQ1 document last week.', 'en'],
    ['The deadline is Q1 2027 and we need sign-off.', 'en'],
    ['The API gateway costs 12M USD per year.', 'en'],
    ['The date is yet to be agreed, but the budget is 12M USD.', 'en'],
    ['来年度の予算は 5 億円で、期限は 2027 年 3 月。', 'ja'],
    ['この段階では十分ではない。予算は 3 億円。', 'ja'],
    ['方針を決めていただきたい。金曜までに。', 'ja'],
  ];

  it.each(topics)('%s', async (topic, lang) => {
    const rows = signalRows(await explain(topic, lang));
    for (const row of rows) {
      expect(squeeze(topic)).toContain(squeeze(row.matched));
    }
  });

  it('検査が空振りしていない(論点を 1 つも拾わない topic ばかりではない)', async () => {
    const counts = await Promise.all(
      topics.map(async ([topic, lang]) => signalRows(await explain(topic, lang)).length),
    );
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(8);
  });
});
