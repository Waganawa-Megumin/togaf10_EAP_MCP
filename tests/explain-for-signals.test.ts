/**
 * `explain_for` が「topic に無い論点」を作らないことの回帰テスト。
 *
 * 実測された不具合:
 *  1. decision シグネチャの `go\b` が **"go-live"** に当たり、「稼働日が未定」と書いただけの
 *     topic から「判断・承認を求める話である」を論点として拾っていた。`\b` は語の切れ目ではなく
 *     単語構成文字の切れ目しか見ないので、"ago" / "cargo" にも当たる。
 *  2. 「判断を仰ぐ段階ではない。」から同じ論点を拾い、しかも「外した話題」の表にも出さなかった。
 *  3. 経営層向けの骨子が topic に金額が無くても常に「決めなかった場合に起きること(金額か期間で)」
 *     を出し、無い数字を作る方向に押していた。
 *
 * このファイルには 2 種類の検査が入っている。
 *  - **機械的な検査**: 全 signal パターンの短い英字トークンに境界が付いているか。
 *    今後 `api` / `erp` のような頭字語を足したときに、同じ穴を作れないようにする。
 *  - **実際の呼び出し**: 上の 3 件が再発していないか。
 */
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { SIGNAL_DEFS } from '../src/tools/guide.js';

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

/**
 * 正規表現の source から「短い英字トークン」を取り出す。
 *
 * 先読み・後読みは語ではないので落とし、`|` で割った断片のうち
 * 素の英数字 1〜4 文字だけを見る(`Q[1-4]` のような文字クラス入りは別途 it で検査する)。
 */
function shortAsciiTokens(source: string): string[] {
  const withoutLookaround = source.replace(/\(\?<?[!=][^)]*\)/g, '');
  return withoutLookaround
    .split('|')
    .map((piece) =>
      piece
        .replace(/^[\s()?:]+/, '')
        .replace(/s\?$/, '')
        .replace(/[\s()?:]+$/, ''),
    )
    .filter((piece) => /^[a-z0-9]{1,4}$/i.test(piece));
}

describe('signal パターンの単語境界(機械的な検査)', () => {
  const cases = SIGNAL_DEFS.flatMap((def) =>
    def.patterns.flatMap((pattern) =>
      shortAsciiTokens(pattern.source).map((token) => ({ id: def.id, pattern, token })),
    ),
  );

  it('検査対象の短いトークンが実際に存在する(抽出が空振りしていない)', () => {
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.map((c) => c.token)).toContain('go');
    expect(cases.map((c) => c.token)).toContain('api');
  });

  it('4 文字以下のトークンは、直前に英字があるときに当たらない', () => {
    const bad = cases.filter((c) => c.pattern.test(`x${c.token}`));
    expect(bad.map((c) => `${c.id}:${c.token}`)).toEqual([]);
  });

  it('3 文字以下のトークンは、直後に英字があるときにも当たらない', () => {
    const bad = cases.filter((c) => c.token.length <= 3 && c.pattern.test(`${c.token}x`));
    expect(bad.map((c) => `${c.id}:${c.token}`)).toEqual([]);
  });

  it('2 文字以下のトークンは、ハイフンで続く複合語の頭に当たらない(go-live)', () => {
    const bad = cases.filter((c) => c.token.length <= 2 && c.pattern.test(`${c.token}-live`));
    expect(bad.map((c) => `${c.id}:${c.token}`)).toEqual([]);
  });

  it('Q1〜Q4 は四半期としてだけ当たる', () => {
    const deadline = SIGNAL_DEFS.find((d) => d.id === 'deadline');
    expect(deadline).toBeDefined();
    const hits = (text: string): boolean => (deadline as { patterns: RegExp[] }).patterns.some((p) => p.test(text));
    expect(hits('2026Q1 までに')).toBe(true);
    expect(hits('Q3 に判定する')).toBe(true);
    expect(hits('FAQ1 を更新する')).toBe(false);
  });
});

describe('explain_for: 存在しない論点を作らない', () => {
  it('"go-live" から「判断を求める話」を拾わない', async () => {
    const out = await callTool('explain_for', {
      topic: 'The go-live date is undecided.',
      audience: 'executive',
      lang: 'en',
    });
    expect(out).not.toContain('You are asking for a decision');
    expect(out).not.toContain('Asking for a decision');
    // 未決事項としては今までどおり拾う
    expect(out).toContain('Parts of it are still undecided');
  });

  it('"ago" / "cargo" からも拾わない', async () => {
    const out = await callTool('explain_for', {
      topic: 'The cargo tracking rollout stalled three months ago.',
      audience: 'pmo',
      lang: 'en',
    });
    expect(out).not.toContain('You are asking for a decision');
  });

  it('本当に go decision を求めているときは拾う(過剰修正でない)', async () => {
    const out = await callTool('explain_for', {
      topic: 'We need a go decision by Friday.',
      audience: 'executive',
      lang: 'en',
    });
    expect(out).toContain('You are asking for a decision');
  });

  it('「判断を仰ぐ段階ではない」から拾わず、外した話題として開示する', async () => {
    const out = await callTool('explain_for', {
      topic: '判断を仰ぐ段階ではない。まずは現行業務の棚卸しを共有したい。',
      audience: 'executive',
      lang: 'ja',
    });
    const stake = out.slice(out.indexOf('## この topic の何が論点か'));
    expect(stake).not.toContain('判断・承認を求める話である');
    expect(out).toContain('topic に出てはいるが、論点にしなかったもの');
    expect(out).toContain('判断・承認の依頼');
  });

  it('「判断を仰ぎたい」なら拾う(過剰修正でない)', async () => {
    const out = await callTool('explain_for', {
      topic: '再構築の可否について判断を仰ぎたい。',
      audience: 'executive',
      lang: 'ja',
    });
    expect(out).toContain('判断・承認を求める話である');
  });

  it('"capital" を api、"enterprise" を erp と読まない', async () => {
    const out = await callTool('explain_for', {
      topic: 'Capital allocation for the enterprise programme is under review.',
      audience: 'executive',
      lang: 'en',
    });
    expect(out).not.toContain('A technical or migration approach is at stake');
  });

  it('APIs は今までどおり技術方式として拾う', async () => {
    const out = await callTool('explain_for', {
      topic: 'We are exposing internal APIs to partners.',
      audience: 'engineer',
      lang: 'en',
    });
    expect(out).toContain('A technical or migration approach is at stake');
  });
});

describe('explain_for: 経営層の骨子が topic に無い軸を勧めない', () => {
  it('金額も期日も無い topic では金額を勧めない', async () => {
    const out = await callTool('explain_for', {
      topic: 'The go-live date is undecided.',
      audience: 'executive',
      lang: 'en',
    });
    expect(out).not.toContain('in money or time');
    expect(out).toContain('Do not invent a figure');
  });

  it('日本語でも同じ', async () => {
    const out = await callTool('explain_for', {
      topic: '現行業務の棚卸し結果を共有したい。',
      audience: 'executive',
      lang: 'ja',
    });
    expect(out).not.toContain('(金額か期間で)');
    expect(out).toContain('数字は作らない');
  });

  it('「読み取れない」と書かれているときは、外したことを踏まえた文になる', async () => {
    const out = await callTool('explain_for', {
      topic: '報告書を ADM に対応付けた。投資額と期限は、この報告書からは読み取れない。',
      audience: 'executive',
      lang: 'ja',
    });
    expect(out).toContain('上の表のとおり外した');
    expect(out).not.toContain('(金額か期間で)');
  });

  it('金額と期日が両方あるときは今までどおり両方で言わせる', async () => {
    const out = await callTool('explain_for', {
      topic: '基幹システム刷新に 12 億円。納期は 2027 年 4 月。',
      audience: 'executive',
      lang: 'ja',
    });
    expect(out).toContain('topic にある金額か期日で');
  });

  it('lang=both でも両方の文が出る', async () => {
    const out = await callTool('explain_for', {
      topic: 'The go-live date is undecided.',
      audience: 'executive',
      lang: 'both',
    });
    expect(out).toContain('数字は作らない');
    expect(out).toContain('Do not invent a figure');
  });
});
