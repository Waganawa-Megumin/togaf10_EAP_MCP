/**
 * 第 5 波 w04 の回帰テスト — 「保存を断ったとき、何をすればよいかが分かる」。
 *
 * 通しで使って実測した 2 つの不親切。
 *
 * 1. `update_engagement` に decision を渡すと「必須項目が足りません」とだけ返り、
 *    **どの欄が足りないのか**が書かれていなかった(スキーマにも required が無い)。
 *    利用者は当てずっぽうで欄を足すしかない。
 * 2. 既存項目に `confidence:"stated"` だけを渡すと(出典は付いていない)、
 *    最後の受け皿まで飛んで「想定外のエラーが発生しました」+ 英語だけの本文 +
 *    「保存内容は変わっていない可能性が高いので確認してください」と返っていた。
 *    実際には値を検査して**確実に何も保存していない**、想定内の入力の誤りである。
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

let dataDir = '';
let previous: string | undefined;

beforeAll(() => {
  previous = process.env.TOGAF_EAP_DATA_DIR;
  dataDir = mkdtempSync(join(tmpdir(), 'togaf-write-refusals-'));
  process.env.TOGAF_EAP_DATA_DIR = dataDir;
});

afterAll(() => {
  if (previous === undefined) delete process.env.TOGAF_EAP_DATA_DIR;
  else process.env.TOGAF_EAP_DATA_DIR = previous;
  rmSync(dataDir, { recursive: true, force: true });
});

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

function storedEngagement(): Record<string, any> {
  const dir = join(dataDir, 'engagements');
  const file = readdirSync(dir).find((f) => f.endsWith('.json'));
  if (!file) throw new Error('engagement file not found');
  return JSON.parse(readFileSync(join(dir, file), 'utf8'));
}

beforeEach(async () => {
  rmSync(join(dataDir, 'engagements'), { recursive: true, force: true });
  rmSync(join(dataDir, 'index.json'), { force: true });
  await callTool('start_engagement', { name: '断り方の検証', lang: 'ja' });
});

describe('登録できなかったときは、足りない欄の名前を返す', () => {
  it('decision が欠けた決定事項は、欄の名前を挙げて断る', async () => {
    const out = await callTool('update_engagement', {
      lang: 'ja',
      decisions: [{ title: '刷新方式は段階移行とする', rationale: '間に合わないため' }],
    });
    expect(out).toContain('decision');
    expect(out).toContain('title');
    expect(out).not.toContain('必須項目が足りません');
    expect(storedEngagement().decisions).toHaveLength(0);
  });

  it('title と decision が揃っていれば登録される', async () => {
    await callTool('update_engagement', {
      lang: 'ja',
      decisions: [
        {
          title: '刷新方式',
          decision: '段階移行とする',
          confidence: 'inferred',
          source: '2026-08-17 ヒアリング(情シス部長)',
        },
      ],
    });
    expect(storedEngagement().decisions).toHaveLength(1);
  });
});

describe('出典と確度の矛盾は、想定外のエラーとして返さない', () => {
  it('既存項目を stated に上げようとして出典が無いとき、日本語で断り、何も保存しない', async () => {
    await callTool('add_work_package', { name: '出典なしWP', lang: 'ja' });
    const id = storedEngagement().workPackages[0].id;
    const out = await callTool('add_work_package', { id, name: '出典なしWP', confidence: 'stated', lang: 'ja' });

    expect(out).not.toContain('想定外');
    expect(out).toMatch(/[ぁ-んァ-ヶ一-龠]/); // 日本語で返っている
    expect(out).toContain('何も保存していません');
    // 「長さを直して」は長さ以外の指摘に付いていた誤案内
    expect(out).not.toContain('長さを直して');

    const wp = storedEngagement().workPackages[0];
    expect(wp.confidence).toBeUndefined();
  });

  it('新規項目でも同じ断り方で、長さの話をしない', async () => {
    const out = await callTool('update_engagement', {
      lang: 'ja',
      risks: [{ title: '出典の無い断定', level: 'high', confidence: 'stated' }],
    });
    expect(out).toContain('何も保存していません');
    expect(out).not.toContain('長さを直して');
    expect(storedEngagement().risks).toHaveLength(0);
  });
});
