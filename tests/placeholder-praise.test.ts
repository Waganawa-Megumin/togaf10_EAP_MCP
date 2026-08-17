/**
 * 第 5 波 w04 の回帰テスト — 「機械が置いた仮置き文字列」で褒めない。
 *
 * 実測された嘘: `ingest_document` が関与方針(`approach`)に
 * 「要確認(自動抽出) / to be confirmed — 出典 / source: doc.md:27」という定型文を入れており、
 * 欄が空でないことを根拠に `check_engagement_health` が
 *
 *   「影響力の高いステークホルダー 3 名全員に関与方針が書かれている(未記入 0 名)。
 *     合意形成が設計されている。」
 *
 * を**良好な点**として出していた。誰一人として関与方針を決めていない案件で、
 * 客先に出す資料にそのまま載る褒め文である。
 *
 * 固定するのは 2 つ。
 * 1. 取り込みは `approach` を埋めない(空欄のほうが正しい)。
 * 2. 既に保存されている定型文は、読む側が「人が書いた内容」として数えない。
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { isWrittenByHuman } from '../src/engagement/model.js';

/** 旧 `ingest_document` が入れていた定型文そのもの */
const PLACEHOLDER = '要確認(自動抽出) / to be confirmed — 出典 / source: doc.md:5';

const DOC = [
  '# 架空社 体制表',
  '',
  '## 体制',
  '',
  '情報システム部長(佐藤)が全体を統括する。現場側は物流本部長(鈴木)。',
  '経理部長(高橋)はインボイス対応の要件を出す。',
  '',
].join('\n');

let dataDir = '';
let docPath = '';
let previous: string | undefined;

beforeAll(() => {
  previous = process.env.TOGAF_EAP_DATA_DIR;
  dataDir = mkdtempSync(join(tmpdir(), 'togaf-placeholder-praise-'));
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

function storedPath(): string {
  const dir = join(dataDir, 'engagements');
  const file = readdirSync(dir).find((f) => f.endsWith('.json'));
  if (!file) throw new Error('engagement file not found');
  return join(dir, file);
}

function storedEngagement(): Record<string, any> {
  return JSON.parse(readFileSync(storedPath(), 'utf8'));
}

/** 保存済みデータに旧版の定型文を書き戻す(古い案件を開いた状態を作る) */
function writeLegacyPlaceholder(): void {
  const stored = storedEngagement();
  for (const s of stored.stakeholders) {
    s.influence = 'high';
    s.approach = PLACEHOLDER;
  }
  writeFileSync(storedPath(), JSON.stringify(stored), 'utf8');
}

async function freshEngagement(name: string): Promise<void> {
  rmSync(join(dataDir, 'engagements'), { recursive: true, force: true });
  rmSync(join(dataDir, 'index.json'), { force: true });
  await callTool('start_engagement', { name, lang: 'ja' });
}

describe('仮置き文字列の判定', () => {
  it('機械の定型文と 1 語の仮置きは「書かれていない」', () => {
    expect(isWrittenByHuman(PLACEHOLDER)).toBe(false);
    expect(isWrittenByHuman('要確認(自動抽出)')).toBe(false);
    expect(isWrittenByHuman('to be confirmed — source: doc.md:5')).toBe(false);
    expect(isWrittenByHuman('TBD')).toBe(false);
    expect(isWrittenByHuman('未定。')).toBe(false);
    expect(isWrittenByHuman('  ')).toBe(false);
    expect(isWrittenByHuman(undefined)).toBe(false);
  });

  it('人が書いた文は、中に「要確認」が入っていても「書かれている」', () => {
    expect(isWrittenByHuman('月次で要確認事項を報告し、四半期ごとに承認を取る')).toBe(true);
    expect(isWrittenByHuman('隔週 30 分の定例で進捗と残リスクを渡す')).toBe(true);
  });
});

describe('ingest_document は関与方針を埋めない', () => {
  beforeEach(async () => {
    await freshEngagement('仮置き検証');
    await callTool('ingest_document', { path: docPath, apply: true, lang: 'ja' });
  });

  it('抽出した関係者の approach は空のまま', () => {
    const e = storedEngagement();
    expect(e.stakeholders.length).toBeGreaterThan(0);
    for (const s of e.stakeholders) {
      expect(isWrittenByHuman(s.approach), `stakeholder "${s.name}" got a filled-in approach`).toBe(false);
    }
  });

  it('健全性チェックは「合意形成が設計されている」と褒めない', async () => {
    const health = await callTool('check_engagement_health', { lang: 'ja' });
    expect(health).not.toContain('合意形成が設計されている');
    expect(health).toContain('関与方針が無い');
  });

  it('貼り付け用 JSON にも approach を入れない', async () => {
    const preview = await callTool('extract_from_document', { path: docPath, lang: 'ja' });
    expect(preview).not.toContain('"approach"');
  });
});

describe('既に保存されている定型文でも褒めない', () => {
  beforeEach(async () => {
    await freshEngagement('仮置き検証(既存データ)');
    await callTool('ingest_document', { path: docPath, apply: true, lang: 'ja' });
    writeLegacyPlaceholder();
  });

  it('健全性チェックは褒めずに、関与方針が無いと指摘する', async () => {
    const health = await callTool('check_engagement_health', { lang: 'ja' });
    expect(health).not.toContain('合意形成が設計されている');
    expect(health).toContain('関与方針が無い');
  });

  it('ステークホルダー分析も「関与方針が未設定」として指摘する', async () => {
    const matrix = await callTool('stakeholder_matrix', { lang: 'ja' });
    expect(matrix).toContain('関与方針が未設定');
  });
});
