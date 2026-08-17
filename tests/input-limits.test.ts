/**
 * 助言系ツールの入力上限 / Input limits on the advisory tools.
 *
 * 実際に起きたこと: 書き込み系(`update_engagement` など)には上限があったのに、
 * 助言系(`consult` / `start_here` / `threat_model_starter` …)には無く、渡した本文を
 * そのまま出力に混ぜていた。実測で **30 万字の入力 → 99 万バイトの応答**、
 * 配列 1 要素に 33 万字を入れると **495 万バイト**。
 *
 * ここで守るのは 4 点。
 * 1. 上限を超えたら短いエラーになる(応答が入力より大きくならない)
 * 2. 上限ちょうどは通り、+1 で落ちる(実用の邪魔をしない)
 * 3. `lang="en"` のエラー本文に日本語が 1 文字も混ざらない
 * 4. 通る長さでも、入力の全文エコーはしない(先頭だけ + 切った旨)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { ECHO_LIMIT, FREE_TEXT_LIMIT, IDENTIFIER_LIMIT } from '../src/tools/input-limits.js';

/** ひらがな / カタカナ / 漢字 / 半角カナ */
const JAPANESE = /[぀-ゟ゠-ヿ㐀-䶿一-鿿ｦ-ﾟ]/u;

let client: Client;
let dir: string;
const originalDir = process.env.TOGAF_EAP_DATA_DIR;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'togaf-eap-input-limits-'));
  process.env.TOGAF_EAP_DATA_DIR = dir;
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'input-limits-test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
  if (originalDir === undefined) delete process.env.TOGAF_EAP_DATA_DIR;
  else process.env.TOGAF_EAP_DATA_DIR = originalDir;
  rmSync(dir, { recursive: true, force: true });
});

/** ツールを呼び、本文と isError を返す */
async function call(
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; isError: boolean }> {
  const result = (await client.callTool({ name, arguments: args })) as {
    content: { type: string; text?: string }[];
    isError?: boolean;
  };
  const text = result.content
    .map((c) => (c.type === 'text' ? (c.text ?? '') : ''))
    .join('\n');
  return { text, isError: result.isError === true };
}

/** ちょうど n 文字の日本語テキスト */
function jp(n: number): string {
  return '標準化を進めたい。'.repeat(Math.ceil(n / 9)).slice(0, n);
}

/** 自由記述 1 つで呼べるツールと、その引数名 */
const FREE_TEXT_TOOLS: { tool: string; field: string; extra?: Record<string, unknown> }[] = [
  { tool: 'consult', field: 'situation' },
  { tool: 'start_here', field: 'goal' },
  { tool: 'tailor_adm', field: 'purpose', extra: { scale: 'small' } },
  { tool: 'explain_for', field: 'topic', extra: { audience: 'executive' } },
  { tool: 'threat_model_starter', field: 'system' },
  { tool: 'security_requirements_checklist', field: 'scope' },
];

describe('自由記述の上限 / free-text limits', () => {
  for (const { tool, field, extra } of FREE_TEXT_TOOLS) {
    it(`${tool}.${field}: 30 万字を短いエラーで弾く`, async () => {
      const { text, isError } = await call(tool, { ...extra, [field]: jp(300_000), lang: 'ja' });
      expect(isError, `${tool} should reject`).toBe(true);
      // 応答が入力より大きくなっていた回帰を防ぐ。エラー文に巨大入力を混ぜない
      expect(text.length, `${tool} error is not short: ${text.length}`).toBeLessThan(1_000);
      expect(text).toContain(`\`${field}\``);
      expect(text).toContain(FREE_TEXT_LIMIT.toLocaleString('en-US'));
      expect(text).toContain((300_000).toLocaleString('en-US'));
    });

    it(`${tool}.${field}: lang="en" のエラーに日本語を混ぜない`, async () => {
      const { text, isError } = await call(tool, { ...extra, [field]: jp(300_000), lang: 'en' });
      expect(isError).toBe(true);
      const stray = Array.from(text).filter((ch) => JAPANESE.test(ch));
      expect(stray.join(''), `${tool} leaked Japanese`).toBe('');
      expect(text).toContain('Input too long');
    });
  }

  it('consult: 上限ちょうどは通り、+1 で落ちる', async () => {
    const exact = await call('consult', { situation: jp(FREE_TEXT_LIMIT), lang: 'ja' });
    expect(exact.isError, 'the limit itself must pass').toBe(false);

    const over = await call('consult', { situation: jp(FREE_TEXT_LIMIT + 1), lang: 'ja' });
    expect(over.isError, 'one character over must fail').toBe(true);
    expect(over.text).toContain((FREE_TEXT_LIMIT + 1).toLocaleString('en-US'));
  });

  it('consult: 通る長さでも入力を全文エコーしない', async () => {
    const situation = jp(FREE_TEXT_LIMIT);
    const { text, isError } = await call('consult', { situation, lang: 'ja' });
    expect(isError).toBe(false);
    // 出力が入力より大きくならない(これが元の症状)
    expect(text.length).toBeLessThan(situation.length);
    expect(text).not.toContain(situation);
    expect(text).toContain(`先頭 ${ECHO_LIMIT.toLocaleString('en-US')} 文字だけ表示`);
  });

  it('consult: 短い入力はこれまでどおり全文載る', async () => {
    const situation = '基幹システムの刷新を検討中。予算は未確定で、経営層の関与が弱い。';
    const { text, isError } = await call('consult', { situation, lang: 'ja' });
    expect(isError).toBe(false);
    expect(text).toContain(situation);
    expect(text).not.toContain('だけ表示しています');
  });
});

describe('配列要素の上限 / limits on list entries', () => {
  it('gap_analysis: 1 要素が長すぎるとその位置を名指しして落ちる', async () => {
    const { text, isError } = await call('gap_analysis', {
      baseline: [jp(300_000)],
      target: ['新基幹'],
      lang: 'ja',
    });
    expect(isError).toBe(true);
    expect(text.length).toBeLessThan(1_000);
    expect(text).toContain('`baseline[0]`');
    expect(text).toContain(IDENTIFIER_LIMIT.toLocaleString('en-US'));
  });

  it('threat_model_starter: assets の 1 件が長すぎると落ちる', async () => {
    const { text, isError } = await call('threat_model_starter', {
      system: '社外公開のポータル',
      assets: ['顧客情報', jp(300_000)],
      lang: 'ja',
    });
    expect(isError).toBe(true);
    expect(text.length).toBeLessThan(1_000);
    expect(text).toContain('`assets[1]`');
  });

  it('gap_analysis: 普通の長さの要素はこれまでどおり通る', async () => {
    const { text, isError } = await call('gap_analysis', {
      baseline: ['受注管理(現行)', '在庫照会'],
      target: ['受注管理(新)', '在庫照会', '与信判定'],
      lang: 'ja',
    });
    expect(isError).toBe(false);
    expect(text).toContain('与信判定');
  });
});

describe('ID 引数の上限 / limits on identifier arguments', () => {
  // 参照系は `reference` 1 本に統合済み。ID 引数は `id`(個別取得)と `within`(絞り込み)。
  const CASES: { tool: string; field: string; extra?: Record<string, unknown> }[] = [
    { tool: 'reference', field: 'id', extra: { of: 'archimate-element' } },
    { tool: 'reference', field: 'within', extra: { of: 'archimate-element' } },
    { tool: 'map_security_to_adm', field: 'phase' },
  ];

  for (const { tool, field, extra } of CASES) {
    it(`${tool}.${field}: 長い値を短いエラーで弾く`, async () => {
      const { text, isError } = await call(tool, { ...extra, [field]: jp(300_000), lang: 'ja' });
      expect(isError).toBe(true);
      expect(text.length, `${tool} error is not short: ${text.length}`).toBeLessThan(1_000);
      expect(text).toContain(`\`${field}\``);
    });

    it(`${tool}.${field}: 見つからない値もそのまま返さない`, async () => {
      const { text } = await call(tool, {
        ...extra,
        [field]: 'x'.repeat(IDENTIFIER_LIMIT),
        lang: 'ja',
      });
      // 「見つかりません」で 300 文字丸ごと返していた回帰を防ぐ
      expect(text).not.toContain('x'.repeat(IDENTIFIER_LIMIT));
      expect(text).toContain('…');
    });
  }
});
