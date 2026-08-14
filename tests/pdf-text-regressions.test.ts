/**
 * 第 4 波 v02 の検証で、**実物の公開文書**(NEC サイバーセキュリティ経営報告書 2026 の
 * 抽出テキスト `redteam-samples/nec-plain.txt`)を通したときに再現した欠陥を固定する。
 *
 * どれも「合成した見本では通るが、PDF から抜いた実物のテキストでは壊れる」型。
 * 実物のテキストには **合字**(`ﬁ` U+FB01)と、**数字と桁の語の間の空白**(「12 万人」)が
 * 必ず入っており、どちらもここで直すまで誤りを生んでいた。
 *
 * 1. 語中切りの再発 — `Certiﬁed Information Security Manager` の一致が `ed Information …`
 *    から始まっていた。`Corporate Executive CISO` で直したはずの欠陥が、合字が
 *    「語の文字」として数えられていなかったために別の入口から戻っていた。
 * 2. 統制の記述がリスクとして台帳に入る — 「リスクを低減しています」「基盤を確立しています」。
 * 3. 数値の誤読 — 「12 万人」が **12** と読まれ、同じ値の「120,000 人」との間に
 *    「1 万倍の桁違い」という**存在しない矛盾**が重み高で報告されていた。
 *    検査器が偽の指摘を出すと、それは検証コストの純増になり、無いほうがましになる。
 */

import { beforeAll, describe, expect, it } from 'vitest';

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text?: string }[] }>;

const tools = new Map<string, Handler>();

beforeAll(async () => {
  const stub = {
    registerTool: (name: string, _def: unknown, handler: Handler) => tools.set(name, handler),
  };
  const { registerDocumentTools } = await import('../src/tools/documents.js');
  const { registerInspectTools } = await import('../src/tools/inspect.js');
  registerDocumentTools(stub as never);
  registerInspectTools(stub as never);
});

async function call(name: string, args: Record<string, unknown>): Promise<string> {
  const handler = tools.get(name);
  if (!handler) throw new Error(`${name} is not registered`);
  const result = await handler(args);
  return (result.content ?? []).map((c) => c.text ?? '').join('\n');
}

const extract = (text: string, kind: string): Promise<string> =>
  call('extract_from_document', { text, kind, source: 'sample', lang: 'ja' });

describe('PDF 抽出テキストでも語の途中から役職を切り出さない', () => {
  it('合字を含む Certiﬁed … を "ed Information Security Manager" にしない', async () => {
    // ﬁ = ﬁ。PDF から抜いたテキストには実際に 16 か所あった。
    const out = await extract('CISM（Certiﬁed Information Security Manager）の保有者は 30 名。', 'stakeholders');
    // 表のセル(| … |)として「ed …」が名前に入っていないこと。原文の列には元の文が出るので、
    // 部分文字列ではなくセル境界で見る。
    expect(out).not.toMatch(/\|\s*ed Information Security Manager\s*\|/);
    expect(out).toContain('Information Security Manager');
  });

  it('Corporate Executive CISO は丸ごと残る(以前は "orate Executive CISO")', async () => {
    const out = await extract('Corporate Executive CISOを置いている。', 'stakeholders');
    expect(out).toContain('Corporate Executive CISO');
    expect(out).not.toMatch(/\|\s*orate Executive CISO\s*\|/);
  });

  it('全角英字の直後でも語中から始めない', async () => {
    const out = await extract('ＮＥＣ部門長が承認する。', 'stakeholders');
    // 名前の列(表の 2 列目)が「部門長」だけになっていないこと
    expect(out).toMatch(/\|\s*ＮＥＣ部門長\s*\|/);
    expect(out).not.toMatch(/\|\s*部門長\s*\|\s*部門長\s*\|/);
  });
});

describe('実施した統制の記述をリスク台帳に入れない', () => {
  const controls = [
    'なりすましやサイバー攻撃のリスクを低減しています。',
    'リスク軽減のための基盤を確立しています。',
    '全社で脆弱性診断を年 2 回実施しました。',
    'CSIRT を活用し、インシデント対応の水準を高めています。',
  ];

  it('統制の記述は除外され、除外の理由と行番号が残る', async () => {
    const out = await extract(controls.join('\n'), 'risks');
    expect(out).toContain('## リスク (0)');
    // 黙って落とさない。理由が読み手に出ていること。
    expect(out).toContain('実施した統制・成果の記述');
    for (const line of controls) expect(out).toContain(line);
  });

  it('本物のリスクは 1 件も落ちない', async () => {
    const risks = [
      '運用担当者の高齢化により、保守が属人化するおそれがあります。',
      'サプライチェーン全体でのセキュリティ確保が課題です。',
      '未対応の脆弱性が 12 件残存しています。',
    ];
    const out = await extract([...controls, ...risks].join('\n'), 'risks');
    expect(out).toContain('## リスク (3)');
    for (const line of risks) expect(out).toContain(line);
  });
});

describe('社外機関を関係者として拾う', () => {
  it('役職語を含まない機関名でも候補になり、設備名は候補にしない', async () => {
    const out = await extract(
      [
        '独立行政法人情報処理推進機構と共同研究を行っている。',
        '東京高等専門学校の学生に講義を提供した。',
        '内閣サイバーセキュリティセンターの指針に沿って運用する。',
        'デジタル庁のガイドラインを参照する。',
        '社内のデータセンターは 3 拠点ある。',
      ].join('\n'),
      'stakeholders',
    );
    expect(out).toContain('独立行政法人情報処理推進機構');
    expect(out).toContain('東京高等専門学校');
    expect(out).toContain('内閣サイバーセキュリティセンター');
    expect(out).toContain('デジタル庁');
    expect(out).toContain('## ステークホルダー (4)');
  });
});

describe('数字と桁の語のあいだの空白を跨いで読む', () => {
  const inspect = (items: Record<string, unknown>[]): Promise<string> =>
    call('inspect_findings', { items, lang: 'ja' });

  it('「12 万人」と「120,000 人」を矛盾として報告しない', async () => {
    const out = await inspect([
      { label: '従業員数A', subject: '従業員数', value: '12 万人', source: 'p.17' },
      { label: '従業員数B', subject: '従業員数', value: '120,000 人', source: 'p.31' },
    ]);
    expect(out).toContain('機械的な矛盾は見つかりませんでした');
  });

  it('「3 兆 4000 億円」と「3.4 兆円」を矛盾として報告しない', async () => {
    const out = await inspect([
      { label: '売上A', subject: '売上収益', value: '3 兆 4000 億円', source: 'p.2' },
      { label: '売上B', subject: '売上収益', value: '3.4 兆円', source: 'p.5' },
    ]);
    expect(out).toContain('機械的な矛盾は見つかりませんでした');
  });

  it('"3 million" と "3,000,000" を矛盾として報告しない', async () => {
    const out = await inspect([
      { label: 'R&D A', subject: 'R&D spend', value: '3 million USD', source: 'p.9' },
      { label: 'R&D B', subject: 'R&D spend', value: '3,000,000 USD', source: 'p.10' },
    ]);
    expect(out).toContain('機械的な矛盾は見つかりませんでした');
  });

  it('「50 kg」の kg を 千 + g と読まない', async () => {
    const out = await inspect([
      { label: '重量A', subject: '装置重量', value: '50 kg', source: 'p.20' },
      { label: '重量B', subject: '装置重量', value: '50000 g', source: 'p.21' },
    ]);
    // 50kg と 50000g は単位が違うので数値比較にはならないが、
    // 50 kg が 50,000 に化けていれば「同じ値」として単位検査に落ちる。
    expect(out).not.toContain('50 kg(= 50,000)');
  });

  it('本物の食い違いは正しい差分で報告する(101,800 名 と 12 万人)', async () => {
    const out = await inspect([
      { label: '連結従業員数', subject: '従業員数', value: '101,800 名', source: 'p.31', confidence: 'stated' },
      { label: '従業員規模', subject: '従業員数', value: '12 万人', source: 'p.17', confidence: 'stated' },
    ]);
    expect(out).toContain('= 120,000');
    expect(out).toContain('18,200');
    expect(out).not.toContain('101,788');
  });
});
