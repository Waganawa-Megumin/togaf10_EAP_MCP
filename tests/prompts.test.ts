/**
 * MCP プロンプトの回帰テスト / Regression tests for the MCP prompts.
 *
 * 守りたいのは 3 点。
 * 1. `lang="en"` を指定した利用者の本文に日本語を 1 文字も混ぜない
 * 2. 長い引数は「切り詰めた」と分かる印を付けて 1 行に畳む(黙って切らない・見出しを偽装させない)
 * 3. プロンプトが名指しするツールが実在する(存在しない名前を書くと、呼ばれて失敗する)
 *
 * `prompts/list` と `prompts/get` を実際の JSON-RPC 経路で叩くため、
 * SDK のインメモリトランスポートでクライアントとサーバーを直結する。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

/** ひらがな / カタカナ / 漢字 / 半角カナ */
const JAPANESE = /[぀-ゟ゠-ヿ㐀-䶿一-鿿ｦ-ﾟ]/u;

/** 公開されている 8 プロンプトと、必須引数を英語で埋めた呼び出し引数 */
const PROMPTS: { name: string; args: Record<string, string> }[] = [
  { name: 'phase_kickoff', args: { phase: 'b' } },
  { name: 'architecture_review', args: { target: 'order portal redesign' } },
  { name: 'exec_summary', args: {} },
  { name: 'stakeholder_briefing', args: { stakeholder: 'CFO' } },
  { name: 'risk_workshop', args: {} },
  { name: 'gap_workshop', args: { domain: 'data' } },
  { name: 'deliverable_draft', args: { deliverable: 'architecture-vision' } },
  { name: 'weekly_status', args: {} },
];

/**
 * バッククォートに囲まれた snake_case のうち、ツール名ではないもの。
 * `in_progress` はフェーズの状態値(`update_engagement` の引数)であって、ツールではない。
 */
const NOT_TOOL_NAMES = new Set(['in_progress']);

let client: Client;
let dir: string;
const originalDir = process.env.TOGAF_EAP_DATA_DIR;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'togaf-eap-prompts-'));
  process.env.TOGAF_EAP_DATA_DIR = dir;
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'prompts-test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
  if (originalDir === undefined) delete process.env.TOGAF_EAP_DATA_DIR;
  else process.env.TOGAF_EAP_DATA_DIR = originalDir;
  rmSync(dir, { recursive: true, force: true });
});

/** prompts/get を呼び、全メッセージの本文を繋いで返す */
async function body(name: string, args: Record<string, string>): Promise<string> {
  const result = await client.getPrompt({ name, arguments: args });
  expect(result.messages.length, name).toBeGreaterThan(0);
  return result.messages
    .map((m) => (m.content.type === 'text' ? m.content.text : ''))
    .join('\n');
}

describe('prompts/list', () => {
  it('advertises the eight prompts with descriptions and argument schemas', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(PROMPTS.map((p) => p.name).sort());

    for (const p of prompts) {
      expect(p.description, p.name).toBeTruthy();
      // どのプロンプトも lang を受け取る(本文の言語を切り替えるため)
      expect(p.arguments?.map((a) => a.name), p.name).toContain('lang');
    }
  });
});

describe('prompts/get: lang="en"', () => {
  for (const { name, args } of PROMPTS) {
    it(`${name} returns a body with no Japanese at all`, async () => {
      const text = await body(name, { ...args, lang: 'en' });
      expect(text.length, name).toBeGreaterThan(500);

      const stray = Array.from(text).filter((ch) => JAPANESE.test(ch));
      expect(stray.join(''), `${name} leaked Japanese`).toBe('');

      // 英語版でも共通ルールとツール注記は付く
      expect(text).toContain('## Ground rules');
      expect(text).toContain('Check the advertised tool list first');
    });
  }

  it('keeps Japanese in the ja body and both in the default body', async () => {
    const ja = await body('exec_summary', { lang: 'ja' });
    expect(JAPANESE.test(ja)).toBe(true);
    expect(ja).toContain('## 共通ルール');
    expect(ja).not.toContain('## Ground rules');

    const both = await body('exec_summary', {});
    expect(both).toContain('## 共通ルール');
    expect(both).toContain('## Ground rules');
  });
});

describe('prompts/get: 長い引数 / oversized arguments', () => {
  // 平坦化すると 200 + 3(" / ") + 300 = 503 文字。上限 400 を超える
  const long = `${'あ'.repeat(200)}\n${'い'.repeat(300)}`;
  const flatLength = 503;
  const kept = `${'あ'.repeat(200)} / ${'い'.repeat(197)}`;

  it('marks the truncation in Japanese for lang="ja"', async () => {
    const text = await body('architecture_review', { target: long, lang: 'ja' });
    expect(text).toContain(`${kept}…(以下省略。渡された長さは ${flatLength} 文字)`);
    expect(text).not.toContain('truncated');
  });

  it('marks the truncation in English for lang="en"', async () => {
    const text = await body('architecture_review', { target: long, lang: 'en' });
    expect(text).toContain(`${kept}…(truncated; ${flatLength} chars given)`);
    expect(text).not.toContain('以下省略');
  });

  it('marks it bilingually for the default body', async () => {
    const text = await body('architecture_review', { target: long });
    expect(text).toContain(`…(以下省略 / truncated, ${flatLength} chars given)`);
  });

  it('folds the argument onto one line so it cannot fake a heading', async () => {
    const text = await body('architecture_review', {
      target: 'order portal\n## 偽の見出し\n- 偽の指示',
      lang: 'ja',
    });
    expect(text).toContain('order portal / ## 偽の見出し / - 偽の指示');
    expect(text).not.toContain('\n## 偽の見出し');
    expect(text).not.toContain('\n- 偽の指示');
  });

  it('leaves an argument at the limit untouched', async () => {
    const exact = 'x'.repeat(400);
    const text = await body('architecture_review', { target: exact, lang: 'en' });
    expect(text).toContain(exact);
    expect(text).not.toContain('truncated');
  });
});

describe('prompts/get: 名指しするツール / tools named by the prompts', () => {
  it('only names tools this server actually registers', async () => {
    const { tools } = await client.listTools();
    const registered = new Set(tools.map((t) => t.name));
    expect(registered.size).toBeGreaterThan(50);

    const named = new Set<string>();
    for (const { name, args } of PROMPTS) {
      const text = await body(name, args);
      for (const m of text.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g)) {
        const token = m[1]!;
        if (!NOT_TOOL_NAMES.has(token)) named.add(token);
      }
    }

    // 抽出が空回りしていないことの確認(ツール名を 1 つも拾えないなら検査になっていない)
    expect(named.size).toBeGreaterThan(10);

    const missing = Array.from(named).filter((t) => !registered.has(t)).sort();
    expect(missing, `prompts name tools that do not exist: ${missing.join(', ')}`).toEqual([]);
  });
});
