/**
 * 第 4 波 q08 の回帰テスト。
 *
 * 守りたいのは 3 点。
 *
 * 1. `consult` は、呼び出し側(会話全体を読んでいる Claude)が `readings` で渡した
 *    読み取りを優先し、同じ軸のサーバー側の正規表現推定を捨てる。
 * 2. どちらが読んだのかを出力に必ず書く。混ぜたまま見せると、当たっている読みが
 *    どちらのものなのかを利用者が検証できない。
 * 3. `explain_for` は、拾った論点の根拠として**部分一致した語ではなく該当文**を出し、
 *    外した話題を「拾った論点」より前に開示する。
 *    「投資額」の 3 文字だけでは、肯定なのか否定なのかを読み手が確かめられない。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

let dataDir = '';
let previous: string | undefined;

beforeAll(() => {
  previous = process.env.TOGAF_EAP_DATA_DIR;
  dataDir = mkdtempSync(join(tmpdir(), 'togaf-readings-'));
  process.env.TOGAF_EAP_DATA_DIR = dataDir;
});

afterAll(() => {
  if (previous === undefined) delete process.env.TOGAF_EAP_DATA_DIR;
  else process.env.TOGAF_EAP_DATA_DIR = previous;
  rmSync(dataDir, { recursive: true, force: true });
});

interface CallResult {
  text: string;
  isError: boolean;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<CallResult> {
  const client = new Client({ name: 'test', version: '1' }, { capabilities: {} });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(b), client.connect(a)]);
  const res = (await client.callTool({ name, arguments: args })) as {
    content?: { type: string; text?: string }[];
    isError?: boolean;
  };
  await client.close();
  return {
    text: (res.content ?? []).map((c) => c.text ?? '').join('\n'),
    isError: res.isError === true,
  };
}

/** `## 見出し` から次の `## ` 直前までを取り出す */
function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const rest = text.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('consult の readings 引数', () => {
  it('渡した軸は、サーバーの本文推定より優先される', async () => {
    const res = await callTool('consult', {
      situation: '予算は潤沢に確保できている。基幹システムの刷新を検討している。',
      readings: {
        budget: {
          condition: 'budget-none',
          evidence: '5 通前の発言「今期の枠は結局ゼロになった」',
        },
      },
      lang: 'ja',
    });
    expect(res.isError).toBe(false);
    const read = section(res.text, '## 読み取った状況');
    expect(read).toContain('予算が無い');
    expect(read).not.toContain('予算が潤沢');
    // 見立ての変わり方も、渡した条件のほうに従う
    expect(res.text).toContain('次の予算を取りに行くための 1 枚');
  });

  it('どちらが読んだのかを行ごとに書く', async () => {
    const res = await callTool('consult', {
      situation: 'ひとりで担当している。基幹システムの刷新を検討している。',
      readings: {
        budget: { condition: 'budget-none', evidence: '会話中の発言「予算はつかない」' },
      },
      lang: 'ja',
    });
    const read = section(res.text, '## 読み取った状況');
    expect(read).toContain('| 誰が読んだか |');
    // 渡した軸
    expect(read).toMatch(/予算 \|.*\|.*\| あなたが渡した読み取り \|/);
    // 渡していない軸はサーバーの推定のまま
    expect(read).toMatch(/体制 \|.*\|.*\| このサーバーが本文から拾った \|/);
  });

  it('渡した根拠(evidence)をそのまま根拠欄に出す', async () => {
    const res = await callTool('consult', {
      situation: '基幹システムの刷新を検討している。',
      readings: {
        time: { condition: 'deadline-urgent', evidence: '添付資料 p.4 の投資委員会が 9 月 18 日' },
      },
      lang: 'ja',
    });
    expect(res.text).toContain('添付資料 p.4 の投資委員会が 9 月 18 日');
    expect(res.text).toContain('readings で受け取った読み取り: 期限');
  });

  it('readings を渡さない従来の呼び方は今までどおり動く', async () => {
    const res = await callTool('consult', {
      situation: '予算はゼロで、ひとりで担当している。基幹システムの刷新を検討している。',
      lang: 'ja',
    });
    expect(res.isError).toBe(false);
    const read = section(res.text, '## 読み取った状況');
    expect(read).toContain('予算が無い');
    expect(read).toContain('このサーバーが本文から拾った');
    expect(read).not.toContain('あなたが渡した読み取り');
    expect(res.text).not.toContain('readings で受け取った読み取り');
  });

  it('英語でも「どちらが読んだか」が出る', async () => {
    const res = await callTool('consult', {
      situation: 'We are replacing the core system.',
      readings: {
        sponsorship: { condition: 'sponsor-absent', evidence: 'the CIO skipped both reviews' },
      },
      lang: 'en',
    });
    expect(res.text).toContain('Read by');
    expect(res.text).toContain('the readings you passed');
    expect(res.text).toContain('the CIO skipped both reviews');
  });

  it('長すぎる evidence は例外ではなくエラー応答で返す', async () => {
    const res = await callTool('consult', {
      situation: '基幹システムの刷新を検討している。',
      readings: { budget: { condition: 'budget-none', evidence: 'あ'.repeat(400) } },
      lang: 'ja',
    });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('readings.budget.evidence');
  });
});

describe('explain_for の根拠の見せ方', () => {
  it('部分一致した語ではなく、該当文そのものを出す', async () => {
    const res = await callTool('explain_for', {
      topic: '基幹システム刷新に 12 億円を投じる。2027 年 4 月稼働。',
      audience: 'executive',
      lang: 'ja',
    });
    expect(res.isError).toBe(false);
    expect(res.text).toContain('その語が出てきた文(topic 原文)');
    expect(res.text).toContain('「基幹システム刷新に 12 億円を投じる。」');
    // 冒頭に置く指示にも、語ではなく文を添える
    expect(res.text).toContain('根拠にした文は「基幹システム刷新に 12 億円を投じる。」');
  });

  it('外した話題を、拾った論点より前に開示する', async () => {
    const res = await callTool('explain_for', {
      topic:
        '報告書を ADM に対応付けた結果を報告したい。投資額は、この報告書からは読み取れない。認証取得者は 670 名以上と書かれている。',
      audience: 'executive',
      lang: 'ja',
    });
    const excluded = res.text.indexOf('## topic に出てはいるが、論点にしなかったもの');
    const kept = res.text.indexOf('## この topic の何が論点か');
    expect(excluded).toBeGreaterThan(-1);
    expect(kept).toBeGreaterThan(-1);
    expect(excluded).toBeLessThan(kept);
    // 外した側は中立な呼び名で出す(肯定の主張をそのまま残さない)
    expect(section(res.text, '## topic に出てはいるが、論点にしなかったもの')).toContain('**金額**');
    expect(res.text).not.toContain('金額が書かれている');
    // 外す根拠にした文をそのまま見せる
    expect(res.text).toContain('投資額は、この報告書からは読み取れない。');
  });

  it('外すものが無ければ、その節は出さない', async () => {
    const res = await callTool('explain_for', {
      topic: '基幹システム刷新に 12 億円を投じる。',
      audience: 'executive',
      lang: 'ja',
    });
    expect(res.text).not.toContain('## topic に出てはいるが、論点にしなかったもの');
  });

  it('英語でも同じ 2 つが成り立つ', async () => {
    const res = await callTool('explain_for', {
      topic:
        'We are asking for a decision next month. The investment amount is not stated in this report.',
      audience: 'executive',
      lang: 'en',
    });
    expect(res.text).toContain('In Your Topic But Deliberately Not Used');
    expect(res.text).toContain('**Money**');
    expect(res.text.toLowerCase()).not.toContain('a money figure is stated');
    expect(res.text).toContain('The sentence it came from');
  });
});
