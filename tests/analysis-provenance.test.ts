/**
 * 第 4 波 q03 の回帰テスト。
 *
 * 守りたいのは 3 点。
 *
 * 1. **明細表に出典列が出る。** 出典が無い行は空欄ではなく「出所未記入」と出る。
 *    空欄は「見るところが無い」に見えて、そのまま見落とされる。記号には必ず凡例を付ける。
 * 2. **`assess_maturity` / `assess_readiness` は「測れなかった」を評点と別に持つ。**
 *    実測された事故は、根拠の無い因子に評点が付き、それが平均に混ざって
 *    「準備度 68%」のような**根拠の無い結論**になったこと。current=null の因子は
 *    平均・到達度・総合判定から外し、外したことを本文と保存データの両方に残す。
 * 3. **出典の集計が出る。** 「登録済みのうち出典が付いているのは N/M 件」。
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

let dataDir = '';
let previous: string | undefined;

beforeAll(() => {
  previous = process.env.TOGAF_EAP_DATA_DIR;
  dataDir = mkdtempSync(join(tmpdir(), 'togaf-q03-'));
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

/** 保存済みエンゲージメント JSON のパス(1 案件しか作らない前提) */
function engagementPath(): string {
  const dir = join(dataDir, 'engagements');
  const file = readdirSync(dir).find((f) => f.endsWith('.json'));
  if (!file) throw new Error('no engagement file');
  return join(dir, file);
}

function readEngagement(): Record<string, any> {
  return JSON.parse(readFileSync(engagementPath(), 'utf8'));
}

function writeEngagement(data: Record<string, any>): void {
  writeFileSync(engagementPath(), JSON.stringify(data, null, 2), 'utf8');
}

/** `## 見出し` から次の `## ` 直前までを取り出す(同じ語が複数の表に出るため) */
function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start < 0) throw new Error(`no section ${heading}`);
  const rest = text.slice(start + heading.length);
  const end = rest.indexOf('\n## ');
  return end < 0 ? rest : rest.slice(0, end);
}

/** 表の行のうち `needle` を含むものを返す */
function row(text: string, needle: string): string {
  const line = text.split('\n').find((l) => l.startsWith('|') && l.includes(needle));
  if (!line) throw new Error(`no table row containing ${needle}`);
  return line;
}

describe('マトリクスの出典列 / source column on the matrices', () => {
  beforeEach(async () => {
    rmSync(join(dataDir, 'engagements'), { recursive: true, force: true });
    rmSync(join(dataDir, 'index.json'), { force: true });
    await callTool('start_engagement', { name: '出典テスト', lang: 'ja' });
    await callTool('update_engagement', {
      lang: 'ja',
      risks: [
        { title: '出典のあるリスク', level: 'high', status: 'open' },
        { title: '出典の無いリスク', level: 'critical', status: 'open' },
      ],
      stakeholders: [
        { name: '出典のある人', influence: 'high', interest: 'high', concerns: ['統制'] },
        { name: '出典の無い人', influence: 'high', interest: 'low', concerns: ['速度'] },
      ],
    });
    // 出典欄はまだ書き込み系ツールの引数になっていないので、保存済み JSON に直接入れる。
    // 読み込み経路(normalizeEngagement)を通っても残ることの確認も兼ねる。
    const data = readEngagement();
    data.risks[0].source = 'security-report.pdf p.17';
    data.risks[0].confidence = 'stated';
    data.stakeholders[0].source = '2026-08-14 ヒアリング';
    data.stakeholders[0].confidence = 'inferred';
    writeEngagement(data);
  });

  it('risk_matrix は明細表に出典列を出し、無い行を「出所未記入」と書く', async () => {
    const out = await callTool('risk_matrix', { lang: 'ja' });
    expect(row(out, '出典のあるリスク')).toContain('security-report.pdf p.17');
    expect(row(out, '出典のあるリスク')).toContain('●');
    // 空欄にしない。空欄は見落とされる
    expect(row(out, '出典の無いリスク')).toContain('出所未記入');
  });

  it('記号には凡例が付き、「出所未記入」と「出所不明」を別物として説明する', async () => {
    const out = await callTool('risk_matrix', { lang: 'ja' });
    expect(out).toContain('出典欄の凡例');
    expect(out).toContain('出所未記入');
    expect(out).toContain('出所不明');
  });

  it('stakeholder_matrix も象限ごとの明細表に出典列を出す', async () => {
    const out = await callTool('stakeholder_matrix', { lang: 'ja' });
    expect(out).toContain('出典欄の凡例');
    const quadrants = section(out, '## 象限ごとの関与方針');
    expect(row(quadrants, '出典のある人')).toContain('2026-08-14 ヒアリング');
    expect(row(quadrants, '出典の無い人')).toContain('出所未記入');
  });

  it('出典の集計を N/M 件で出し、出典の無い項目を名指しする', async () => {
    const out = await callTool('risk_matrix', { lang: 'ja' });
    expect(out).toContain('出典の記入状況');
    // リスク 2 件のうち 1 件
    expect(out).toMatch(/\*\*1\/2 件\*\*/);
    // 案件全体はリスク 2 + 関係者 2 = 4 件のうち 2 件
    expect(out).toMatch(/\*\*2\/4 件\*\*/);
    expect(out).toContain('出典の無いリスク');
    expect(out).toContain('出典の無い人');
  });

  it('出典の無い重大リスクを指摘として立てる', async () => {
    const out = await callTool('risk_matrix', { lang: 'ja' });
    expect(out).toContain('重大リスク 1 件に出典が無い');
  });
});

describe('gap_analysis の出典 / provenance on gap_analysis', () => {
  it('sources で渡した出典がギャップ表に出て、渡していない要素は「出所未記入」になる', async () => {
    const out = await callTool('gap_analysis', {
      lang: 'ja',
      baseline: ['旧資産管理'],
      target: ['ゼロトラスト基盤'],
      sources: [{ element: 'ゼロトラスト基盤', source: 'security-report.pdf p.12', confidence: 'stated' }],
    });
    const gaps = section(out, '## 検出したギャップと推奨アクション');
    expect(row(gaps, 'ゼロトラスト基盤')).toContain('security-report.pdf p.12');
    expect(row(gaps, '旧資産管理')).toContain('出所未記入');
    expect(out).toContain('出典が付いている要素は **1/2 件**');
  });

  it('baseline にも target にも無い element は黙って捨てず、警告する', async () => {
    const out = await callTool('gap_analysis', {
      lang: 'ja',
      baseline: ['A'],
      target: ['B'],
      sources: [{ element: '存在しない要素', source: 'x' }],
    });
    expect(out).toContain('存在しない要素');
    expect(out).toContain('見つかりません');
  });

  it('出典に含まれるパイプは表を壊さない', async () => {
    const out = await callTool('gap_analysis', {
      lang: 'ja',
      baseline: ['A'],
      target: ['B'],
      sources: [{ element: 'A', source: 'doc | p.5' }],
    });
    expect(out).toContain('doc \\| p.5');
  });

  it('出典が長すぎる場合は保存も分析もせずに理由を返す', async () => {
    const out = await callTool('gap_analysis', {
      lang: 'ja',
      baseline: ['A'],
      target: ['B'],
      sources: [{ element: 'A', source: 'x'.repeat(400) }],
    });
    expect(out).toContain('sources[0].source');
    expect(out).toContain('300 文字');
  });
});

describe('「測れなかった」を評点と別に持つ / undetermined factors', () => {
  const factors = [
    { name: '判定できる因子', current: 4, target: 4, note: '委員会が四半期開催', source: 'p.8', confidence: 'stated' },
    { name: '判断材料の無い因子', current: null, target: 4, note: '資料に記載が無い' },
  ];

  it('current=null の因子は平均・到達度から外れる', async () => {
    const out = await callTool('assess_maturity', { lang: 'ja', scale: 5, factors });
    // 判定できた 1 因子だけの平均。0 として混ぜると 2 になる
    expect(out).toContain('4 / 5');
    expect(out).toContain('**100%**');
    expect(out).toContain('2 因子中 1 因子で判定');
  });

  it('除外したことと因子名を必ず書く(平均を上げて黙らない)', async () => {
    const out = await callTool('assess_maturity', { lang: 'ja', scale: 5, factors });
    expect(out).toContain('判断できなかった因子');
    expect(out).toContain('判断材料の無い因子');
    expect(out).toContain('「判断材料なし」は評点 0 ではありません');
  });

  it('理由(note)の無い因子は「理由が未記入」と出す', async () => {
    const out = await callTool('assess_maturity', {
      lang: 'ja',
      scale: 5,
      factors: [
        { name: '判定できる因子', current: 3, target: 4 },
        { name: '理由の無い因子', current: null, target: 4 },
      ],
    });
    expect(out).toContain('理由が未記入');
  });

  it('全因子が判断材料なしなら総合判定を出さない', async () => {
    const out = await callTool('assess_readiness', {
      lang: 'ja',
      scale: 5,
      save: true,
      factors: [{ name: 'a', current: null, target: 4 }],
    });
    expect(out).toContain('総合判定は出せません');
    // 0 点として平均した「到達度 0%」も、目標 0 扱いの「100%」も出してはならない
    expect(out).not.toContain('目標に対する到達度');
    expect(out).toContain('保存していません');
  });

  it('保存データに仮の評点を入れない(判定できた因子だけを保存し、範囲を要約に残す)', async () => {
    rmSync(join(dataDir, 'engagements'), { recursive: true, force: true });
    rmSync(join(dataDir, 'index.json'), { force: true });
    await callTool('start_engagement', { name: '保存テスト', lang: 'ja' });
    await callTool('assess_maturity', { lang: 'ja', scale: 5, save: true, factors });
    const stored = readEngagement().assessments[0];
    expect(stored.factors).toHaveLength(1);
    expect(stored.factors[0].name).toBe('判定できる因子');
    expect(stored.factors[0].source).toBe('p.8');
    expect(stored.factors[0].confidence).toBe('stated');
    expect(stored.summary).toContain('2 因子中 1 因子で判定');
    expect(stored.summary).toContain('判断材料の無い因子');
  });

  it('current が数値でも null でもない場合は、0 を薦めずに null を薦める', async () => {
    const out = await callTool('assess_maturity', {
      lang: 'ja',
      scale: 5,
      factors: [{ name: 'a', current: 9, target: 4 }],
    });
    expect(out).toContain('0〜5 の範囲外');
  });
});
