/**
 * 対立検出の言い換え耐性テスト / Paraphrase robustness for stakeholder conflict detection.
 *
 * `analysis-conflicts.test.ts` は「報告された 4 つの言い回し」をそのまま固定する。
 * こちらはその 4 つを **一語も共有しない別人の言い方** に置き換えても検出できるかを見る。
 * 報告された文字列だけに当たる状態(過学習)に戻ったら、こちらが落ちる。
 *
 * あわせて、無関係な関心事 20 件超の総当りで 1 件も対立を作らないこと(捏造しないこと)を見る。
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.TOGAF_EAP_DATA_DIR = mkdtempSync(join(tmpdir(), 'togaf-eap-paraphrase-'));

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;

const tools = new Map<string, Handler>();

beforeAll(async () => {
  const { registerAnalysisTools } = await import('../src/tools/analysis.js');
  const stub = {
    registerTool: (name: string, _def: unknown, handler: Handler) => tools.set(name, handler),
  };
  registerAnalysisTools(stub as never);
});

function writeEngagement(people: { name: string; concerns: string[] }[]): void {
  const dataDir = mkdtempSync(join(tmpdir(), 'togaf-eap-paraphrase-'));
  process.env.TOGAF_EAP_DATA_DIR = dataDir;
  const now = new Date().toISOString();
  writeFileSync(
    join(dataDir, 'engagement.json'),
    JSON.stringify({
      id: 'eng-test',
      name: 'paraphrase fixture',
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

function conflictSection(out: string): string {
  const start = out.indexOf('## 関係者間の対立');
  const from = start < 0 ? out.indexOf('## Conflicts between stakeholders') : start;
  if (from < 0) return '';
  const next = out.indexOf('\n## ', from + 4);
  return next < 0 ? out.slice(from) : out.slice(from, next);
}

/** 対立節が「検出できませんでした」ではなく、実際に軸を挙げているか */
function detected(section: string): boolean {
  return /対立しうる論点を \d+ 件検出|surfaced \d+ potential points? of conflict/i.test(section);
}

/** 報告された言い回しと一語も共有しない言い換え */
const PARAPHRASES: [string, string, string, string][] = [
  // [ラベル, 左の関心事, 右の関心事, 期待する軸名]
  [
    '費用の上限を「決裁しません」と言う',
    '投資額が年間5億を上回る計画は決裁しません',
    'ラインを一時間でも停めるわけにはいかない',
    'コスト削減 vs 品質・可用性',
  ],
  [
    '費用の上限を「予算枠は据え置き」と言う',
    '来期の予算枠は据え置きです。これ以上は出せません',
    '設備が落ちると即日で出荷が止まります',
    'コスト削減 vs 品質・可用性',
  ],
  [
    '速さを「その日のうちに」と言う',
    'その日のうちに返事を出せないと商談が流れる',
    '数字の裏取りをせずに客先へ返すのはやめてほしい',
    '速さ vs 確実さ',
  ],
  [
    '速さを「三日もかかる」と言う',
    '見積の回答に三日もかかるのは話にならない',
    '確認しないまま納期を出されると後で必ず手戻りになる',
    '速さ vs 確実さ',
  ],
  [
    '速さを「競合に持っていかれる」と言う',
    '返事が遅れると競合に持っていかれる',
    '営業が現場に確認せずに客先へ納期を回答してしまう',
    '速さ vs 確実さ',
  ],
  [
    '標準化を「同じやり方に寄せたい」と言う',
    'グループ全体で同じやり方に寄せたい',
    '拠点ごとに事情が違うので今のやり方を残したい',
    '標準化・全社最適 vs 現場裁量・個別最適',
  ],
];

describe('conflict detection survives paraphrase (not tuned to the reported strings)', () => {
  for (const [label, left, right, axis] of PARAPHRASES) {
    it(`detects: ${label}`, async () => {
      writeEngagement([
        { name: '左', concerns: [left] },
        { name: '右', concerns: [right] },
      ]);
      const section = conflictSection(await matrix('ja'));
      expect(detected(section)).toBe(true);
      expect(section).toContain(axis);
      // 根拠にした関心事は必ず併記する(利用者が外れを捨てられるように)
      expect(section).toContain(left);
      expect(section).toContain(right);
    });
  }

  it('detects the English paraphrases without the word "standardization"', async () => {
    writeEngagement([
      { name: 'Group Architect', concerns: ['We must roll out one common template across all subsidiaries'] },
      { name: 'Site IT', concerns: ['Every subsidiary runs its own way of working and needs carve-outs'] },
    ]);
    const section = conflictSection(await matrix('en'));
    expect(detected(section)).toBe(true);
    expect(section).toContain('Standardization vs local autonomy');
  });

  it('keeps lang=en free of Japanese in the conflict section', async () => {
    writeEngagement([
      { name: 'Sales Manager', concerns: ['If we cannot answer the customer the same day the deal goes elsewhere'] },
      { name: 'Planning Lead', concerns: ['Sales commit to dates without checking with the shop floor'] },
    ]);
    const section = conflictSection(await matrix('en'));
    expect(detected(section)).toBe(true);
    expect(section).not.toMatch(/[぀-ヿ一-鿿]/);
  });
});

describe('a looser match must not invent conflicts', () => {
  /** どの組み合わせでも対立にならないはずの関心事 */
  const NEUTRAL = [
    '社員食堂のメニューをもう少し増やしてほしいという声が多い',
    '保養所の予約がなかなか取れない',
    '社内報の発行が遅れがちで、写真の差し替えが間に合わない',
    '周年イベントの会場をどこにするか決まっていない',
    '新人研修の日程を早めに決めたい',
    '資格取得の補助制度をもう少し広げたい',
    '名刺のデザインを刷新したい',
    '会議室の予約システムが古い',
    '通勤手当の申請様式を電子化したい',
    '健康診断の受診率を上げたい',
    'The onboarding handbook needs a refresh this year',
    'We would like a better seating plan for the new floor',
    'Our training material for interns is out of date',
    'The intranet search does not find old announcements',
    'Please add more bicycle parking at the north gate',
    // 語幹照合が効きすぎていないかを狙った語(standalone / location / plants / businesses ...)
    'The standalone location of the customer account is unclear',
    'We are planning the ordering desk for the coastal warehouse',
    'Processing times for the plants are recorded in the operating model',
    'Our businesses share a single costume supplier',
  ];

  it('reports zero conflicts across every pair of unrelated concerns', async () => {
    const offenders: string[] = [];
    for (let i = 0; i < NEUTRAL.length; i += 1) {
      for (let j = i + 1; j < NEUTRAL.length; j += 1) {
        writeEngagement([
          { name: 'A', concerns: [NEUTRAL[i]] },
          { name: 'B', concerns: [NEUTRAL[j]] },
        ]);
        const section = conflictSection(await matrix('ja'));
        if (detected(section)) offenders.push(`${NEUTRAL[i]} × ${NEUTRAL[j]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('still says so plainly when nothing is detected', async () => {
    writeEngagement([
      { name: '総務', concerns: ['社員食堂のメニューを増やしてほしい'] },
      { name: '広報', concerns: ['社内報の発行が遅れがちだ'] },
    ]);
    const section = conflictSection(await matrix('ja'));
    expect(section).toContain('対立は検出できませんでした');
    // 0 件のときは手で見る観点を出す(利用者を空手で帰さない)
    expect(section).toContain('手で突き合わせる観点');
  });
});
