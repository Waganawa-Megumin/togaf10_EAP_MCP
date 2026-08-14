/**
 * 機械的な突き合わせ検査の回帰テスト / Regression tests for `inspect_findings`.
 *
 * 固定するのは、**実際の案件で人間が手で照合して見つけた**食い違い 3 件:
 * - p.31「101,800 名」と p.17「12 万人」(丸めでは説明できない 15% 差)
 * - 本文「670 名」と図「670 名以上」(数は同じで表現だけ違う)
 * - 「サイバーセキュリティ統括部門」と「サイバーセキュリティ戦略統括部」(表記ゆれ候補)
 *
 * 併せて、**空振りしないこと**も同じ重さで見る。整合したデータで指摘を作ってしまうと
 * このツールは検証コストの純増になり、無いほうがましになる。
 */

import { beforeAll, describe, expect, it } from 'vitest';

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;

const tools = new Map<string, Handler>();

beforeAll(async () => {
  const { registerInspectTools } = await import('../src/tools/inspect.js');
  const stub = {
    registerTool: (name: string, _def: unknown, handler: Handler) => tools.set(name, handler),
  };
  registerInspectTools(stub as never);
});

interface Item {
  label: string;
  subject?: string;
  value?: string | number;
  unit?: string;
  source?: string;
  confidence?: 'stated' | 'inferred' | 'unknown';
  statement?: string;
}

async function inspect(items: Item[], lang: 'ja' | 'en' | 'both' = 'ja'): Promise<string> {
  const handler = tools.get('inspect_findings');
  if (!handler) throw new Error('inspect_findings is not registered');
  const result = await handler({ items, lang });
  return result.content.map((c) => c.text).join('\n');
}

async function inspectRaw(args: Record<string, unknown>) {
  const handler = tools.get('inspect_findings');
  if (!handler) throw new Error('inspect_findings is not registered');
  return handler(args);
}

describe('inspect_findings', () => {
  it('registers under a name the tool-name check can verify', () => {
    expect(tools.has('inspect_findings')).toBe(true);
  });

  it('実際に人が見つけた数値の食い違いを検出する(101,800 名 と 12万人)', async () => {
    const out = await inspect([
      { label: '連結従業員数(p.31)', subject: '連結従業員数', value: '101,800 名', source: 'p.31', confidence: 'stated' },
      { label: '従業員数(p.17)', subject: '連結従業員数', value: '12万人', source: 'p.17', confidence: 'stated' },
    ]);
    expect(out).toContain('食い違っている可能性');
    // 根拠として両方の値と項目番号が出ること(片方だけでは人が判断できない)
    expect(out).toContain('101,800');
    expect(out).toContain('12万人');
    expect(out).toContain('[1]');
    expect(out).toContain('[2]');
    // 断定していないこと
    expect(out).not.toContain('矛盾しています。');
  });

  it('数は同じで表現だけ違う場合を、食い違いとは別の指摘として出す(670名 と 670名以上)', async () => {
    const out = await inspect([
      { label: 'CISSP(本文)', subject: 'CISSP 保有者数', value: '670名', source: 'p.22', confidence: 'stated' },
      { label: 'CISSP(図)', subject: 'CISSP 保有者数', value: '670名以上', source: 'p.22 図3', confidence: 'stated' },
    ]);
    expect(out).toContain('数値は同じだが表現が違う');
  });

  it('丸めで説明できる差は重み高にしない(約12万 と 118,000)', async () => {
    const out = await inspect([
      { label: '投資額(本文)', subject: '投資額', value: '約12万', unit: '円', source: 'p.9', confidence: 'stated' },
      { label: '投資額(表)', subject: '投資額', value: '118,000円', source: 'p.10', confidence: 'stated' },
    ]);
    expect(out).toContain('丸めの範囲内');
    expect(out).not.toContain('!! 要確認(高)');
  });

  it('複合表記を同じ額として読む(3兆4000億円 と 3.4兆円 は矛盾ではない)', async () => {
    const same = await inspect([
      { label: '売上(本文)', subject: '売上', value: '3兆4000億円', source: 'p.3', confidence: 'stated' },
      { label: '売上(図)', subject: '売上', value: '3.4兆円', source: 'p.4', confidence: 'stated' },
    ]);
    expect(same).toContain('機械的な矛盾は見つかりませんでした');

    const different = await inspect([
      { label: '売上(本文)', subject: '売上', value: '3兆4000億円', source: 'p.3', confidence: 'stated' },
      { label: '売上(図)', subject: '売上', value: '2.9兆円', source: 'p.4', confidence: 'stated' },
    ]);
    expect(different).toContain('食い違っている可能性');
    expect(different).toContain('3,400,000,000,000');
  });

  it('「以上」で説明がつく差は指摘しない(670名以上 と 700名)', async () => {
    const out = await inspect([
      { label: '有資格者(図)', subject: '有資格者数', value: '670名以上', source: 'p.22', confidence: 'stated' },
      { label: '有資格者(最新)', subject: '有資格者数', value: '700名', source: 'p.30', confidence: 'stated' },
    ]);
    expect(out).toContain('機械的な矛盾は見つかりませんでした');
  });

  it('表記ゆれの候補を、類似度と共通部分つきで挙げる(断定はしない)', async () => {
    const out = await inspect([
      { label: 'サイバーセキュリティ統括部門', source: 'p.5', confidence: 'stated' },
      { label: 'サイバーセキュリティ戦略統括部', source: 'p.20', confidence: 'stated' },
    ]);
    expect(out).toContain('同じ実体の別表記かもしれない');
    expect(out).toContain('一致度');
    expect(out).toContain('共通部分');
    expect(out).toContain('同じ組織・同じ実体ですか');
  });

  it('別物の組織名は表記ゆれにしない', async () => {
    const out = await inspect([
      { label: '情報セキュリティ委員会', source: 'p.5', confidence: 'stated' },
      { label: '購買部門', source: 'p.6', confidence: 'stated' },
    ]);
    expect(out).not.toContain('同じ実体の別表記かもしれない');
  });

  it('同じ subject を付けた項目どうしは表記ゆれ扱いしない(正しく使うほど雑音が増えないこと)', async () => {
    const out = await inspect([
      { label: 'CISSP 保有者(本文)', subject: 'CISSP 保有者数', value: '670名', source: 'p.22', confidence: 'stated' },
      { label: 'CISSP 保有者(図)', subject: 'CISSP 保有者数', value: '670名', source: 'p.23', confidence: 'stated' },
    ]);
    expect(out).not.toContain('同じ実体の別表記かもしれない');
  });

  it('単位の同義(名/人)と、数え方の違い(社/拠点)を区別する', async () => {
    const synonym = await inspect([
      { label: '従業員(本文)', subject: '従業員数', value: '1,000名', source: 'p.1', confidence: 'stated' },
      { label: '従業員(図)', subject: '従業員数', value: '1,000人', source: 'p.2', confidence: 'stated' },
    ]);
    expect(synonym).toContain('同じ意味の単位が別表記');

    const different = await inspect([
      { label: 'グループ会社数', subject: 'グループ規模', value: '280社', source: 'p.4', confidence: 'stated' },
      { label: '拠点数', subject: 'グループ規模', value: '310拠点', source: 'p.4', confidence: 'stated' },
    ]);
    expect(different).toContain('数え方そのものが違う可能性');
    // 単位が違う組は数値としては比べない(同じことを 2 か所で言わない)
    expect(different).not.toContain('同じ対象の数値が食い違っている可能性');
  });

  it('出典の無い項目を挙げ、stated なのに出典が無いものは重みを上げる', async () => {
    const out = await inspect([
      { label: '出典のない項目', confidence: 'unknown' },
      { label: '記載ありなのに出典がない項目', confidence: 'stated' },
    ]);
    expect(out).toContain('出典が付いていない');
    expect(out).toContain('「記載あり」なのに出典が無い');
    expect(out).toContain('!! 要確認(高)');
  });

  it('inferred なのに断定的な語で書かれた項目を挙げる。ぼかしてある項目は挙げない', async () => {
    const assertive = await inspect([
      { label: '統制範囲', statement: 'すべてのグループ会社を必ず統制している', confidence: 'inferred', source: 'p.20' },
    ]);
    expect(assertive).toContain('断定的な書き方');

    const hedged = await inspect([
      { label: '統制範囲', statement: 'グループ会社の多くを統制している可能性がある', confidence: 'inferred', source: 'p.20' },
    ]);
    expect(hedged).not.toContain('断定的な書き方');
  });

  it('0 件のときは「正しさの保証ではない」と言い、人が見る観点を示す', async () => {
    const out = await inspect([
      { label: '従業員数', subject: '従業員数', value: '101,800名', source: 'p.31', confidence: 'stated' },
    ]);
    expect(out).toContain('機械的な矛盾は見つかりませんでした');
    expect(out).toContain('正しさの保証ではありません');
    expect(out).toContain('時点');
    expect(out).toContain('書かれていないこと');
    expect(out).toContain('次にすること');
  });

  it('必ず「次にすること」で終わる', async () => {
    const out = await inspect([
      { label: 'A', subject: 'x', value: '10名', source: 'p.1', confidence: 'stated' },
      { label: 'B', subject: 'x', value: '99名', source: 'p.2', confidence: 'stated' },
    ]);
    expect(out).toContain('## 次にすること');
    expect(out.indexOf('## 次にすること')).toBeGreaterThan(out.indexOf('## 数値の食い違い'));
  });

  it('パイプと改行を無害化して表を壊さない', async () => {
    const out = await inspect([{ label: 'A|B\n## 見出し', confidence: 'unknown' }]);
    expect(out).toContain('A\\|B');
    for (const line of out.split('\n')) {
      if (!line.startsWith('|')) continue;
      // 表の行がヘッダに化けていないこと
      expect(line.includes('\n')).toBe(false);
    }
  });

  it('項目が空・長すぎ・多すぎのときは例外を投げずにエラー応答を返す', async () => {
    const empty = await inspectRaw({ items: [], lang: 'ja' });
    expect(empty.isError).toBe(true);
    expect(empty.content[0].text).toContain('`items`');

    const blankLabel = await inspectRaw({ items: [{ label: '   ' }], lang: 'ja' });
    expect(blankLabel.isError).toBe(true);

    const tooLong = await inspectRaw({ items: [{ label: 'a'.repeat(301) }], lang: 'ja' });
    expect(tooLong.isError).toBe(true);
    expect(tooLong.content[0].text).toContain('items[0].label');

    const tooMany = await inspectRaw({
      items: Array.from({ length: 201 }, (_, i) => ({ label: `x${i}` })),
      lang: 'ja',
    });
    expect(tooMany.isError).toBe(true);
  });

  it('大量の項目でも検出件数を正直に出し、表示は上位に絞る', async () => {
    const items: Item[] = Array.from({ length: 60 }, (_, i) => ({
      label: `指標${i}の値`,
      subject: '共通の対象',
      value: `${100 + i}名`,
      source: `p.${i}`,
      confidence: 'stated' as const,
    }));
    const out = await inspect(items);
    expect(out).toContain('検出');
    expect(out).toContain('重みの高い順に 20 件を表示');
    // 表の行数は上限で抑えられている(1 件ごとに 1 行)
    const rows = out.split('\n').filter((l) => l.startsWith('| !') || l.startsWith('| ·'));
    expect(rows.length).toBeLessThanOrEqual(100);
  });

  it('英語だけでも同じ検査が働く', async () => {
    const out = await inspect(
      [
        { label: 'Headcount (p.31)', subject: 'headcount', value: '101,800', unit: 'people', source: 'p.31', confidence: 'stated' },
        { label: 'Headcount (p.17)', subject: 'headcount', value: '120,000 people', source: 'p.17', confidence: 'stated' },
      ],
      'en',
    );
    expect(out).toContain('Possible numeric conflict');
    expect(out).toContain('What to do next');
  });
});
