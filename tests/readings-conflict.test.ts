/**
 * 第 4 波 v03(検証)で見つけた 2 件の回帰テスト。
 *
 * `readings` は「同じ軸のサーバー側推定を捨てて呼び出し側を採る」仕組みだが、
 * 捨てたものを一切表示していなかった。本文に「予算は潤沢」と書いてあるのに
 * 助言が「予算ゼロ前提」に変わっても、利用者には理由が見えない。
 * さらに悪いことに、数値(「2026-09-18、残り 34 日」)から出た逆算の助言は
 * 上書き後も同じ見出しの下に残り、「期限が無いので自分で 90 日の区切りを置け」と
 * 並んで出ていた。前提の食い違う 2 つの指示が、区別なく同じ節に並ぶ状態。
 *
 * 守りたいのは 3 点。
 *
 * 1. 上書きした軸は、捨てたサーバー側の読みを必ず表に出す(黙って一方を捨てない)。
 * 2. 上書きした軸の数値から出た助言は、別の見出しに分けて前提の違いを書く。
 * 3. 根拠が空白だけの読み取りは、黙って推定に戻さずエラーにする。
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
  dataDir = mkdtempSync(join(tmpdir(), 'togaf-readings-conflict-'));
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

describe('readings が本文と食い違うとき', () => {
  it('捨てたサーバー側の読みを、根拠の表現ごと表に出す', async () => {
    const res = await callTool('consult', {
      situation: '予算は潤沢に確保できている。基幹システムの刷新を検討している。',
      readings: {
        budget: { condition: 'budget-none', evidence: '3 通前「今期は追加予算が付かない」' },
      },
      lang: 'ja',
    });
    expect(res.isError).toBe(false);
    // 採用したのは呼び出し側の読み
    expect(res.text).toContain('予算が無い');
    // 捨てたサーバー側の読みと、その根拠にした本文の表現の両方が残っている
    expect(res.text).toContain('予算は確保されている');
    expect(res.text).toContain('潤沢');
    expect(res.text).toContain('食い違い');
    // どちらかを直す手段まで書く
    expect(res.text).toContain('`readings` から外して');
  });

  it('同じ結論なら「食い違い」とは書かない', async () => {
    const res = await callTool('consult', {
      situation: '予算は潤沢に確保できている。基幹システムの刷新を検討している。',
      readings: {
        budget: { condition: 'budget-ample', evidence: '会議で追加予算が承認済み' },
      },
      lang: 'ja',
    });
    expect(res.isError).toBe(false);
    expect(res.text).toContain('同じ結論');
    expect(res.text).not.toContain('食い違い');
  });

  it('本文から読めなかった軸を埋めただけなら、捨てたとは書かない', async () => {
    const res = await callTool('consult', {
      situation: '基幹システムの刷新を検討している。',
      readings: {
        climate: { condition: 'field-resistance', evidence: '現場ヒアリングで反発が強かった' },
      },
      lang: 'ja',
    });
    expect(res.isError).toBe(false);
    expect(res.text).toContain('読めなかった軸を、あなたの読み取りで埋めた');
    expect(res.text).not.toContain('食い違い');
  });

  it('上書きした軸の数値から出た助言は、別の見出しに分ける', async () => {
    const res = await callTool('consult', {
      situation: '2026-09-18 の経営会議までに基幹システム刷新の方針を決める必要がある。',
      readings: {
        time: { condition: 'deadline-none', evidence: '会議は延期になったと 5 通前に聞いた' },
      },
      lang: 'ja',
    });
    expect(res.isError).toBe(false);
    // 数値は消さない(本文にそう書いてあるという事実)
    expect(res.text).toContain('2026-09-18');
    // ただし別見出しに分け、前提が食い違うことを書く
    expect(res.text).toContain('あなたの読み取りで上書き済み');
    expect(res.text).toContain('上の推奨と前提が食い違います');
    // 前提の食い違う助言を「今日やること 1 つ」には選ばない
    const next = res.text.slice(res.text.indexOf('## 次の一手'));
    expect(next).not.toContain('逆算すると');
  });

  it('英語でも同じ開示をする(日本語が混ざらない)', async () => {
    const res = await callTool('consult', {
      situation: 'The steering committee meets on 2026-09-18 to decide the core system replacement.',
      readings: {
        time: { condition: 'deadline-none', evidence: 'The meeting was postponed, per message 5' },
      },
      lang: 'en',
    });
    expect(res.isError).toBe(false);
    expect(res.text).toContain('Checked Against What the Text Says');
    expect(res.text).toContain('Disagreement');
    expect(res.text).toContain('overridden by your reading');
    expect(res.text).not.toMatch(/[぀-ヿ一-龯]/);
  });
});

describe('readings の根拠が空白だけのとき', () => {
  it('黙って推定に戻さず、消えた軸を名指ししてエラーにする', async () => {
    const res = await callTool('consult', {
      situation: '基幹システムの刷新を検討している。',
      readings: {
        budget: { condition: 'budget-none', evidence: '   ' },
        time: { condition: 'deadline-none', evidence: '\t\n ' },
      },
      lang: 'ja',
    });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('readings.budget.evidence');
    expect(res.text).toContain('readings.time.evidence');
    expect(res.text).toContain('何も実行していません');
  });
});

describe('readings を渡さない従来の呼び方', () => {
  it('上書きの節も「あなたが渡した読み取り」も出さない', async () => {
    const res = await callTool('consult', {
      situation: '予算は潤沢に確保できている。基幹システムの刷新を検討している。',
      lang: 'ja',
    });
    expect(res.isError).toBe(false);
    expect(res.text).toContain('予算は確保されている');
    expect(res.text).toContain('このサーバーが本文から拾った');
    expect(res.text).not.toContain('あなたが渡した読み取り');
    expect(res.text).not.toContain('突き合わせた結果');
    expect(res.text).not.toContain('上書き済み');
  });
});
