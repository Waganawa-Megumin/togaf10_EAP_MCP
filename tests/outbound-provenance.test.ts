/**
 * 第 5 波 w02 の回帰テスト — **会話の外に出ていく成果物**に出典が残るか。
 *
 * ダッシュボードやレポートは、印刷されて配られたあと誰にも直せない。
 * ここで固定するのは、実際に外に出たファイル/画面で壊れていた 5 点。
 *
 * 1. 評価(成熟度・準備度)の**因子ごとの出典**が表示から落ちない。
 *    因子側に出典があるのに評価そのものの出典だけを見せると、
 *    原文を指せる点数が「? 出所未記入」の点数に見える。
 * 2. `export_report format:"html"` で、コードスパンを含む強調が
 *    アンダースコアのまま本文に出ない(出典の警告行と凡例行がこれだった)。
 * 3. 書き出した HTML の印刷 CSS が、ダークテーマの端末から印刷しても
 *    紙側の配色に戻る(出典サマリが白地に薄灰で載らない)。
 * 4. ライブ HTML ダッシュボードの `provenanceStats` が
 *    `summarizeProvenance` と同じ数を出す(壊れた JSON でも)。
 * 5. 「出典が 1 文字も書かれていない」状態を指す語が 1 つに揃っている
 *    (`? 出所未記入`。`—` や「出典なし」と割れない)。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { renderDashboardHtml } from '../src/dashboard/html.js';
import {
  NO_SOURCE_LABEL,
  NO_SOURCE_MARK,
  normalizeEngagement,
  provenanceCell,
  summarizeProvenance,
  type Engagement,
} from '../src/engagement/model.js';

let dataDir = '';
let previous: string | undefined;

beforeAll(async () => {
  previous = process.env.TOGAF_EAP_DATA_DIR;
  dataDir = mkdtempSync(join(tmpdir(), 'togaf-outbound-prov-'));
  process.env.TOGAF_EAP_DATA_DIR = dataDir;
  await seed();
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

function storedEngagement(): Engagement {
  const dir = join(dataDir, 'engagements');
  const file = readdirSync(dir).find((f) => f.endsWith('.json'));
  if (!file) throw new Error('engagement file not found');
  const parsed = normalizeEngagement(JSON.parse(readFileSync(join(dir, file), 'utf8')));
  if (!parsed) throw new Error('engagement not readable');
  return parsed;
}

/** 出典あり / 推測 / 出所未記入 を混ぜた案件を 1 件作る */
async function seed(): Promise<void> {
  await callTool('start_engagement', { name: '出典の外出し検証', client: '検証商事', lang: 'ja' });
  await callTool('update_engagement', {
    lang: 'ja',
    risks: [
      { title: '保守終了', level: 'high', status: 'open', source: 'plan.pdf p.12', confidence: 'stated' },
      { title: '要員不足', level: 'medium', status: 'open', source: 'ヒアリングから導出', confidence: 'inferred' },
      { title: '出典の無いリスク', level: 'low', status: 'open' },
    ],
    stakeholders: [{ name: '山田', role: 'CIO', influence: 'high', interest: 'high', source: '組織図 p.3', confidence: 'stated' }],
  });
  // 因子ごとにだけ出典がある評価(評価そのものには出典を付けない)
  await callTool('assess_maturity', {
    save: true,
    title: '因子出典テスト',
    lang: 'ja',
    factors: [
      { name: 'ガバナンス', current: 2, target: 4, source: 'plan.pdf p.30', confidence: 'stated' },
      { name: '標準', current: 1, target: 3, source: '推定', confidence: 'inferred' },
      { name: '人材', current: 2, target: 4 },
    ],
  });
}

describe('評価の因子ごとの出典が表示から落ちない', () => {
  it('Markdown ダッシュボードの因子表に出典列が出る', async () => {
    const out = await callTool('get_dashboard', { lang: 'ja' });
    const block = out.slice(out.indexOf('因子出典テスト'));
    expect(block).toContain('plan.pdf p.30');
    expect(block).toContain('推定');
    // 出典を持たない因子は空欄にしない
    expect(block).toContain(`${NO_SOURCE_MARK} ${NO_SOURCE_LABEL.ja}`);
    // 評価そのものが「出所未記入」に見えるだけで終わらせない
    expect(block).toContain('因子ごとの出典');
  });

  it('ライブ HTML ダッシュボードでも因子ごとの出典を描く', () => {
    const html = renderDashboardHtml('ja');
    // 因子の出典は factorProv が真のときだけ描く分岐を持っている
    expect(html).toContain('factorProv');
    expect(html).toContain('showFactorSrc');
    expect(html).toContain('factorSource');
  });
});

describe('export_report の HTML が読める形で出る', () => {
  let html = '';

  beforeAll(async () => {
    const out = await callTool('export_report', { format: 'html', lang: 'ja', overwrite: true });
    const match = out.match(/`([^`]+\.html)`/);
    if (!match) throw new Error(`export path not found in: ${out}`);
    html = readFileSync(match[1], 'utf8');
  });

  it('コードスパンを含む強調がアンダースコアのまま本文に出ない', () => {
    // 出典の凡例行・推測の警告行はどちらも `●` などのコードスパンを含む強調で書かれている
    expect(html).not.toContain('<p>_');
    expect(html).toMatch(/<em>[^<]*<code>/);
    expect(html).toContain('出所未記入');
  });

  it('置き換えに使った制御文字が本文に残らない', () => {
    expect(html).not.toContain('\u0001');
    expect(html).not.toContain('\u0002');
  });

  it('表と表紙の両方に出典が出る', () => {
    expect(html).toContain('<th>出典</th>');
    expect(html).toMatch(/class="subtitle">[^<]*出典: \d+\/\d+/);
  });

  it('印刷 CSS が紙側の配色に戻す(ダークテーマの端末から印刷しても読める)', () => {
    const print = html.slice(html.indexOf('@media print'));
    expect(print).toContain('--muted:');
    expect(print).toContain('--ink: #000000');
    expect(print).toContain('.sheet { background: #fff;');
    expect(print).toContain('.subtitle, th, footer { color: #000 !important; }');
  });
});

describe('ライブ HTML の集計が summarizeProvenance と一致する', () => {
  /** 埋め込み JS から provenanceStats だけを取り出して呼べるようにする */
  function loadProvenanceStats(): (e: unknown) => {
    total: number;
    withSource: number;
    withoutSource: number;
    by: Record<string, number>;
  } {
    const html = renderDashboardHtml('ja');
    let src = html.split('<script>')[2].split('</script>')[0];
    src = src.replace(
      '(function () {',
      '(function () {\n  globalThis.__ps = function (e) { return provenanceStats(e); };',
      1,
    );
    const stub = (): unknown =>
      new Proxy(
        { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
        {
          get(target: Record<string, unknown>, key: string | symbol) {
            if (key in target) return target[key as string];
            return () => stub();
          },
          set(target: Record<string, unknown>, key: string, value: unknown) {
            target[key] = value;
            return true;
          },
        },
      );
    const ctx: Record<string, unknown> = {
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      document: {
        addEventListener() {},
        getElementById: () => stub(),
        querySelector: () => stub(),
        querySelectorAll: () => [],
        createElement: () => stub(),
        body: stub(),
        documentElement: stub(),
      },
      window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
      localStorage: { getItem: () => null, setItem() {} },
      location: { href: '', search: '', pathname: '/' },
      fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
      EventSource: function EventSourceStub(this: Record<string, unknown>) {
        this.addEventListener = (): void => {};
        this.close = (): void => {};
      },
      history: { replaceState() {} },
      navigator: { userAgent: 'node' },
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    try {
      vm.runInContext(src, ctx);
    } catch {
      // DOM を全部は模していないので、途中で止まっても関数さえ取れていればよい
    }
    const fn = ctx.__ps as ((e: unknown) => never) | undefined;
    if (!fn) throw new Error('provenanceStats could not be reached');
    return fn as never;
  }

  const cases: [string, (e: Engagement) => unknown][] = [
    ['そのままの案件', (e) => e],
    [
      '手編集で壊れた JSON(null / 文字列 / 空白だけの出典)',
      (e) => ({
        ...e,
        risks: [...e.risks, null, 'broken', { title: 'x', source: '   ' }],
      }),
    ],
    [
      'confidence に prototype の名前が入っている',
      (e) => ({
        ...e,
        risks: [...e.risks, { title: 'z', confidence: 'constructor' }, { title: 'w', confidence: 'toString' }],
      }),
    ],
    ['台帳が空', () => ({ id: 'e', name: 'n' })],
  ];

  for (const [name, mutate] of cases) {
    it(`一致する: ${name}`, () => {
      const stats = loadProvenanceStats();
      const raw = mutate(storedEngagement());
      const model = summarizeProvenance(normalizeEngagement(JSON.parse(JSON.stringify(raw))) as Engagement);
      const live = stats(raw);
      expect([live.total, live.withSource, live.withoutSource]).toEqual([
        model.total,
        model.withSource,
        model.withoutSource,
      ]);
      expect(live.by).toEqual(model.byConfidence);
      // 内訳は必ず総数に足し合う(NaN が混ざると合わなくなる)
      const sum = Object.values(live.by).reduce((a, b) => a + b, 0);
      expect(sum).toBe(live.total);
    });
  }
});

describe('「出典が書かれていない」を指す語が 1 つに揃っている', () => {
  it('確度だけがある行も凡例の語と印で書く', () => {
    const cell = provenanceCell({ confidence: 'inferred' }, 'ja');
    expect(cell).toContain(`${NO_SOURCE_MARK} ${NO_SOURCE_LABEL.ja}`);
    expect(cell).not.toContain('出典なし');
  });

  it('update_engagement の応答が、同じ状態を 2 つの見た目で出さない', async () => {
    const out = await callTool('update_engagement', {
      lang: 'ja',
      risks: [{ title: '語彙の確認', level: 'low', status: 'open' }],
    });
    const row = out.split('\n').find((line) => line.includes('語彙の確認') && line.startsWith('|'));
    expect(row).toBeDefined();
    // ダッシュボードの表と同じ `? 出所未記入`。`—` に戻さない
    expect(row).toContain(`${NO_SOURCE_MARK} ${NO_SOURCE_LABEL.ja}`);
    expect(out).toContain(`${NO_SOURCE_MARK} ${NO_SOURCE_LABEL.ja} 1 件`);
  });
});
