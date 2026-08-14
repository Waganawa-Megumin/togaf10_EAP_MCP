/**
 * 第 4 波 v05 の回帰テスト — 「出典を表示したのに保存していない」を二度と作らない。
 *
 * 通しで使ったときに実際に起きていた 2 つの嘘を固定する。
 *
 * 1. **`ingest_document` が応答に「出典 doc.md:7」と表示しながら、台帳の `source` は空だった。**
 *    直後に `check_engagement_health` を呼ぶと「台帳の 5 件すべてに出典が無い」と出る。
 *    同じ 1 回の作業の中で、片方が「出典あり」と言い、もう片方が「出典なし」と言っていた。
 * 2. **自動抽出した項目を `stated`(確認済み)にしない。** 抽出はキーワード一致であって
 *    読解ではない。stated にすると健全性チェックが「出典なし 0 件」を良好な点として褒め、
 *    誰も原文を見ていない台帳が確認済みに見える。
 *
 * さらに、出典を要求される側(作業パッケージ・移行状態)に記録手段があることも固定する。
 * 記録手段が無いまま指摘だけ出ると、利用者は消せない指摘を出され続ける。
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { provenanceCell } from '../src/engagement/model.js';

let dataDir = '';
let docPath = '';
let previous: string | undefined;

const DOC = [
  '# 架空社 報告書',
  '',
  'レガシー基幹システムの老朽化により、可用性が低下するおそれがあります。',
  'サプライチェーン全体でのセキュリティ確保が課題です。',
  '',
].join('\n');

beforeAll(() => {
  previous = process.env.TOGAF_EAP_DATA_DIR;
  dataDir = mkdtempSync(join(tmpdir(), 'togaf-ingest-provenance-'));
  process.env.TOGAF_EAP_DATA_DIR = dataDir;
  docPath = join(dataDir, 'doc.md');
  writeFileSync(docPath, DOC, 'utf8');
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

/** 保存された案件 JSON をそのまま読む(表示ではなく実体を見る) */
function storedEngagement(): Record<string, any> {
  const dir = join(dataDir, 'engagements');
  const file = readdirSync(dir).find((f) => f.endsWith('.json'));
  if (!file) throw new Error('engagement file not found');
  return JSON.parse(readFileSync(join(dir, file), 'utf8'));
}

async function freshEngagement(name: string): Promise<void> {
  rmSync(join(dataDir, 'engagements'), { recursive: true, force: true });
  rmSync(join(dataDir, 'index.json'), { force: true });
  await callTool('start_engagement', { name, lang: 'ja' });
}

describe('ingest_document は表示した出典を実際に保存する', () => {
  beforeEach(async () => {
    await freshEngagement('取り込み検証');
    await callTool('ingest_document', { path: docPath, apply: true, lang: 'ja' });
  });

  it('登録した項目の source にファイル名:行番号が入る', () => {
    const e = storedEngagement();
    expect(e.risks.length).toBeGreaterThan(0);
    for (const r of e.risks) {
      expect(r.source, `risk "${r.title}" has no source`).toBeTruthy();
      expect(r.source).toMatch(/doc\.md:\d+/);
    }
  });

  it('自動抽出は stated にせず inferred で保存する', () => {
    const e = storedEngagement();
    for (const r of e.risks) expect(r.confidence).toBe('inferred');
    expect(e.risks.some((r: any) => r.confidence === 'stated')).toBe(false);
  });

  it('健全性チェックが「出典なし」と言わない(表示と保存が食い違わない)', async () => {
    const e = storedEngagement();
    const total = e.risks.length + e.stakeholders.length;
    const health = await callTool('check_engagement_health', { lang: 'ja' });
    expect(health).toContain(`| 出典あり | ${total} / ${total} |`);
    expect(health).toContain(`| 出典なし | 0 / ${total} |`);
    expect(health).not.toContain('すべてに出典が無い');
  });

  it('健全性チェックは「確認済み」とは言わず、推測のままであることを鳴らす', async () => {
    const health = await callTool('check_engagement_health', { lang: 'ja' });
    expect(health).toContain('● 記載あり (stated) | 0');
    expect(health).toContain('推測');
  });

  it('取り込み応答は、確度を stated にしていないことを明示する', async () => {
    await freshEngagement('取り込み文面');
    const out = await callTool('ingest_document', { path: docPath, apply: true, lang: 'ja' });
    expect(out).toContain('`source`');
    expect(out).toContain('inferred');
    expect(out).toContain('`stated` にはしていません');
  });

  it('プレビューの貼り付け用 JSON にも source と confidence が入っている', async () => {
    const out = await callTool('extract_from_document', { path: docPath, lang: 'ja' });
    const json = out.slice(out.indexOf('```json'));
    expect(json).toContain('"source"');
    expect(json).toContain('"confidence": "inferred"');
    expect(json).not.toContain('"confidence": "stated"');
  });
});

describe('出典を要求される項目には、出典を記録する手段がある', () => {
  beforeEach(async () => {
    await freshEngagement('ロードマップ出典');
  });

  it('add_work_package が source と confidence を保存する', async () => {
    await callTool('add_work_package', {
      name: 'ID基盤刷新',
      source: 'doc.md:3',
      confidence: 'stated',
      lang: 'ja',
    });
    const wp = storedEngagement().workPackages[0];
    expect(wp.source).toBe('doc.md:3');
    expect(wp.confidence).toBe('stated');
  });

  it('add_transition_state が source と confidence を保存する', async () => {
    await callTool('add_transition_state', {
      name: '中間状態 1',
      source: '2026-08-14 ヒアリング(情シス部長)',
      confidence: 'inferred',
      lang: 'ja',
    });
    const t = storedEngagement().transitions[0];
    expect(t.source).toBe('2026-08-14 ヒアリング(情シス部長)');
    expect(t.confidence).toBe('inferred');
  });

  it('既存の id を渡して、出典だけを後から足せる', async () => {
    await callTool('add_work_package', { name: '出典なしパッケージ', lang: 'ja' });
    const id = storedEngagement().workPackages[0].id;
    await callTool('add_work_package', { id, name: '出典なしパッケージ', source: 'doc.md:4', lang: 'ja' });
    const wp = storedEngagement().workPackages[0];
    expect(wp.source).toBe('doc.md:4');
  });

  it('確度の綴り違いは保存せずに弾く(例外は投げない)', async () => {
    const out = await callTool('add_work_package', { name: 'x', confidence: 'high', lang: 'ja' });
    expect(out.length).toBeGreaterThan(0);
    const wps = storedEngagement().workPackages ?? [];
    expect(wps.every((w: any) => w.confidence !== 'high')).toBe(true);
  });
});

describe('確度だけがあって出典が無い行は、確認済みに見せない', () => {
  it('`● 記載あり` を単独で出さず、出典が無いことをセル内で言う', () => {
    expect(provenanceCell({ confidence: 'stated' }, 'ja')).toBe('● 記載あり(出典なし)');
    expect(provenanceCell({ confidence: 'inferred' }, 'ja')).toContain('出典なし');
    expect(provenanceCell({ confidence: 'stated' }, 'en')).toContain('no source');
  });

  it('出典があるときは従来どおり印と出典だけを出す', () => {
    expect(provenanceCell({ source: 'doc.md:3', confidence: 'stated' }, 'ja')).toBe('● 記載あり doc.md:3');
    expect(provenanceCell({ source: 'doc.md:3', confidence: 'stated' }, 'ja')).not.toContain('出典なし');
  });

  it('リスクの表でも「記載あり」だけの行が出ない', async () => {
    await freshEngagement('出典なし stated');
    await callTool('update_engagement', {
      lang: 'ja',
      risks: [{ title: '出典の無い断定', level: 'high', status: 'open', confidence: 'stated' }],
    });
    const table = await callTool('risk_matrix', { lang: 'ja' });
    expect(table).toContain('● 記載あり(出典なし)');
  });
});
