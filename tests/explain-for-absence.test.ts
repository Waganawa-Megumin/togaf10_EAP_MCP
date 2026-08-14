/**
 * `explain_for` が「書かれていない」と言われた項目を論点に据えないことの回帰テスト。
 *
 * 実測された不具合: topic に「投資額は…読み取れない」と書いても
 * 「金額が書かれている」を拾い、経営層向けの出力の冒頭と「この順に話す」の
 * 両方に「金額の桁と振れ幅を先に言う」を置いていた。存在しない数字を、
 * 最も目立つ 2 か所で勧める形になる。
 */
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const client = new Client({ name: 'test', version: '1' }, { capabilities: {} });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(b), client.connect(a)]);
  const res = (await client.callTool({ name, arguments: args })) as {
    content?: { type: string; text?: string }[];
  };
  await client.close();
  return (res.content ?? []).map((c) => c.text ?? '').join('\n');
}

describe('explain_for と「その情報は無い」', () => {
  it('読み取れないと書かれた金額を論点に据えない', async () => {
    const out = await callTool('explain_for', {
      topic:
        '報告書を TOGAF ADM に対応付けた結果。投資額・例外承認の権限者・KPI の目標値は、この報告書からは読み取れない。',
      audience: 'executive',
      lang: 'ja',
    });
    expect(out).not.toContain('金額が書かれている');
    expect(out).not.toContain('桁と振れ幅');
  });

  it('英語でも同じ', async () => {
    const out = await callTool('explain_for', {
      topic:
        'Mapping the report to TOGAF ADM. The investment amount and KPI targets are not stated in this document.',
      audience: 'executive',
      lang: 'en',
    });
    expect(out.toLowerCase()).not.toContain('money figure is stated');
  });

  it('実際に金額があるときは今までどおり拾う', async () => {
    const out = await callTool('explain_for', {
      topic: '基幹システム刷新に 12 億円を投じる。2027 年 4 月稼働。過去 2 回頓挫している。',
      audience: 'executive',
      lang: 'ja',
    });
    expect(out).toContain('金額が書かれている');
  });

  it('「書かれていない」と「実際にある」が同居しても、あるほうだけ拾う', async () => {
    const out = await callTool('explain_for', {
      topic: '刷新に 12 億円を投じる。稼働時期は未定。',
      audience: 'executive',
      lang: 'ja',
    });
    expect(out).toContain('金額が書かれている');
    expect(out).not.toContain('期日が決まっている');
  });
});
