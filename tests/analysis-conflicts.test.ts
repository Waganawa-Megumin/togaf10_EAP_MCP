/**
 * 関係者間の対立検出の回帰テスト / Regression tests for stakeholder conflict detection.
 *
 * 実際に報告された「本人の言葉では 0 件になる」言い回しを、そのままの表現で固定する。
 * あわせて、対立の無いデータで 0 件のままであること(緩めた照合が捏造に化けないこと)も見る。
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.TOGAF_EAP_DATA_DIR = mkdtempSync(join(tmpdir(), 'togaf-eap-conflict-'));

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;

const tools = new Map<string, Handler>();

beforeAll(async () => {
  const { registerAnalysisTools } = await import('../src/tools/analysis.js');
  const stub = {
    registerTool: (name: string, _def: unknown, handler: Handler) => tools.set(name, handler),
  };
  registerAnalysisTools(stub as never);
});

interface Person {
  name: string;
  concerns: string[];
}

/**
 * 関係者だけを持つ最小のエンゲージメントを書く(ツールは保存済みの状態を読むため)。
 * 保存先は毎回作り直す — ストアは旧レイアウトを初回アクセスで移行するので、
 * 同じディレクトリに書き直しても 2 回目以降は読まれない。
 */
function writeEngagement(people: Person[]): void {
  const dataDir = mkdtempSync(join(tmpdir(), 'togaf-eap-conflict-'));
  process.env.TOGAF_EAP_DATA_DIR = dataDir;
  const now = new Date().toISOString();
  writeFileSync(
    join(dataDir, 'engagement.json'),
    JSON.stringify({
      id: 'eng-test',
      name: 'conflict fixture',
      createdAt: now,
      updatedAt: now,
      currentPhaseId: 'A',
      phases: [],
      risks: [],
      decisions: [],
      actions: [],
      stakeholders: people.map((p, i) => ({
        id: `s${i}`,
        name: p.name,
        role: '',
        organization: '',
        influence: 'high',
        interest: 'high',
        concerns: p.concerns,
        approach: '',
      })),
      deliverables: [],
      workPackages: [],
      transitions: [],
      assessments: [],
      notes: [],
      capabilities: [],
      benefits: [],
    }),
  );
}

async function matrix(lang: 'ja' | 'en' | 'both' = 'ja'): Promise<string> {
  const handler = tools.get('stakeholder_matrix');
  if (!handler) throw new Error('stakeholder_matrix is not registered');
  const result = await handler({ lang });
  return result.content.map((c) => c.text).join('\n');
}

/** 対立の節だけを切り出す(ほかの節に同じ語が出るため) */
function conflictSection(out: string): string {
  const start = out.indexOf('## 関係者間の対立');
  const startEn = start < 0 ? out.indexOf('## Conflicts between stakeholders') : start;
  const from = startEn < 0 ? 0 : startEn;
  const next = out.indexOf('\n## ', from + 4);
  return next < 0 ? out.slice(from) : out.slice(from, next);
}

describe('conflict detection matches the words people actually write', () => {
  it('detects a cost cap stated as an amount against "we cannot stop production"', async () => {
    writeEngagement([
      { name: 'CFO', concerns: ['年5億円を超える案は承認しない'] },
      { name: '工場長', concerns: ['生産を1日たりとも止めたくない'] },
    ]);
    const section = conflictSection(await matrix('ja'));
    expect(section).toContain('コスト削減 vs 品質・可用性');
    // 根拠(どの関心事のどの語で判定したか)を必ず併記する
    expect(section).toContain('年5億円を超える案は承認しない');
    expect(section).toContain('生産を1日たりとも止めたくない');
  });

  it('detects "勝手に…約束" even with words in between', async () => {
    writeEngagement([
      { name: '営業', concerns: ['回答が遅いと他社に取られる'] },
      { name: '生産管理', concerns: ['営業が勝手に納期を約束する'] },
    ]);
    const section = conflictSection(await matrix('ja'));
    expect(section).toContain('速さ vs 確実さ');
    expect(section).toContain('勝手に…約束');
  });

  it('matches English by stem: "Group standardization" hits the standard side', async () => {
    writeEngagement([
      { name: 'Group EA', concerns: ['Group standardization must apply to every plant'] },
      { name: 'Plant IT', concerns: ['Each plant needs its own exceptions for local processes'] },
    ]);
    const section = conflictSection(await matrix('en'));
    expect(section).toContain('Standardization vs local autonomy');
    expect(section).toContain('Likely conflict');
  });

  it('does not stem across unrelated words (standalone is not standard)', async () => {
    writeEngagement([
      { name: 'A', concerns: ['We operate a standalone location for every customer account'] },
      { name: 'B', concerns: ['Each plant needs its own exceptions for local processes'] },
    ]);
    const section = conflictSection(await matrix('en'));
    expect(section).toContain('No conflict was found');
  });

  it('reports nothing when the concerns have nothing to do with each other', async () => {
    writeEngagement([
      { name: '人事部長', concerns: ['従業員満足度調査を年2回実施したい', '人事評価の運用を見直したい'] },
      { name: '総務課長', concerns: ['オフィスの座席表を最新に保ちたい', '備品の発注担当を決めたい'] },
    ]);
    const section = conflictSection(await matrix('ja'));
    expect(section).toContain('対立は検出できませんでした');
  });

  it('keeps a negated stance out of the count', async () => {
    writeEngagement([
      { name: 'A', concerns: ['カスタマイズはしない方針です'] },
      { name: 'B', concerns: ['標準に合わせて業務を変える'] },
    ]);
    const section = conflictSection(await matrix('ja'));
    expect(section).toContain('対立は検出できませんでした');
  });
});

describe('readiness risks are not silently truncated', () => {
  async function readiness(count: number, lang: 'ja' | 'en'): Promise<string> {
    const handler = tools.get('assess_readiness');
    if (!handler) throw new Error('assess_readiness is not registered');
    const factors = Array.from({ length: count }, (_, i) => ({
      name: `factor ${i + 1}`,
      current: 1,
      target: 4,
    }));
    const result = await handler({ factors, scale: 5, save: false, lang });
    return result.content.map((c) => c.text).join('\n');
  }

  it('emits every risky factor when they fit', async () => {
    const out = await readiness(7, 'ja');
    expect(out).toContain('7 件あります');
    expect(out.match(/"title": "変革準備度の不足/g)?.length).toBe(7);
    expect(out).toContain('すべて入れてあります');
  });

  it('says so, and names the rest, when the JSON is an extract', async () => {
    const out = await readiness(13, 'en');
    expect(out.match(/"title": "Readiness shortfall/g)?.length).toBe(10);
    expect(out).toContain('This JSON is an extract');
    expect(out).toContain('factor 13');
  });
});
