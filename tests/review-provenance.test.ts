/**
 * 第 4 波 q09 の回帰テスト — `check_engagement_health` の出典点検。
 *
 * 守りたいのは 4 点。
 *
 * 1. **データが無いことを根拠に褒めない。** 台帳が空(出典を持ちうる項目が 0 件)の案件で
 *    「出典管理が良好」と読める文言を出さない。0 / 0 を 100% と表示しない。
 * 2. 出典が 1 件も無い案件では、そのことを指摘として鳴らす(件数と内訳付き)。
 * 3. `confidence: 'inferred'` / `'unknown'` のまま残っている項目を名指しする。
 * 4. 全件に出典が付いている場合にだけ褒める(部分的に付いている状態は褒めない)。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

let dataDir = '';
let previous: string | undefined;

beforeAll(() => {
  previous = process.env.TOGAF_EAP_DATA_DIR;
  dataDir = mkdtempSync(join(tmpdir(), 'togaf-review-provenance-'));
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

/** `## 見出し` から次の `## ` 直前までを取り出す */
function section(text: string, heading: string): string {
  const start = text.indexOf(`## ${heading}`);
  if (start < 0) return '';
  const rest = text.slice(start + heading.length + 3);
  const end = rest.indexOf('\n## ');
  return end < 0 ? rest : rest.slice(0, end);
}

const HEALTH = { asOf: '2026-08-14', lang: 'ja' } as const;

describe('check_engagement_health の出典点検', () => {
  it('台帳が空なら、出典 0 件を褒めずに「判断できない」と書く', async () => {
    await callTool('start_engagement', { name: '出典テスト: 空の台帳' });
    const out = await callTool('check_engagement_health', HEALTH);

    const snapshot = section(out, '出典と確度');
    expect(snapshot).toContain('判断できない');
    // 0 / 0 を割合にしない
    expect(snapshot).not.toContain('100%');
    expect(section(out, '良好な点(記録に根拠のあるものだけ)')).not.toContain('出典');
    expect(section(out, 'まだ判断できないこと(記録が無い)')).toContain('台帳が空');
    // 空の台帳に出典の指摘は鳴らさない(空の台帳は別の指摘が扱う)
    expect(out).not.toContain('出典が記録されている項目が 1 件も無い');
  });

  it('出典が 1 件も無ければ、件数と内訳付きで指摘する', async () => {
    await callTool('create_engagement', { name: '出典テスト: 出典なし' });
    await callTool('update_engagement', {
      risks: [{ title: '人材数の記載が食い違う', level: 'high', status: 'open', owner: 'A', mitigation: '照合' }],
      stakeholders: [{ name: 'CISO', role: '責任者', influence: 'high', interest: 'high', approach: '月次報告' }],
    });
    const out = await callTool('check_engagement_health', HEALTH);

    expect(out).toContain('出典が記録されている項目が 1 件も無い');
    expect(out).toContain('台帳の 2 件すべてに出典が無い');
    expect(out).toContain('リスク 1 件');
    expect(out).toContain('ステークホルダー 1 件');
    // 「直せ」ではなく「確認してください」の形で終える
    expect(out).toContain('確認してください');
    expect(out).toContain('次の一手');
    // 出典 0 件を良好な点として数えない
    expect(section(out, '良好な点(記録に根拠のあるものだけ)')).not.toContain('出典が記録され');
  });

  it('一部だけ出典が付いている状態は、割合と残件を出して褒めない', async () => {
    await callTool('create_engagement', { name: '出典テスト: 一部' });
    const added = await callTool('update_engagement', {
      risks: [
        { title: '数値の食い違い', level: 'high', status: 'open', owner: 'A', mitigation: '照合' },
        { title: '根拠不明の人数', level: 'medium', status: 'open' },
      ],
    });
    const id = /`(risk-[a-z0-9-]+)`/.exec(added)?.[1];
    expect(id).toBeTruthy();
    await callTool('update_engagement', {
      risks: [{ id, source: 'csr2026.pdf p.31', confidence: 'stated' }],
    });
    const out = await callTool('check_engagement_health', HEALTH);

    expect(out).toContain('出典の付いていない項目が残っている');
    expect(out).toContain('全 2 件のうち出典があるのは 1 件(50%)');
    expect(section(out, '良好な点(記録に根拠のあるものだけ)')).not.toContain('全 2 件に出典');
  });

  it('inferred / unknown のまま残っている項目を名指しする', async () => {
    await callTool('create_engagement', { name: '出典テスト: 確度' });
    const added = await callTool('update_engagement', {
      risks: [
        { title: '推測のままのリスク', level: 'high', status: 'open', owner: 'A', mitigation: '確認' },
        { title: '出所不明のリスク', level: 'low', status: 'open' },
      ],
    });
    // 同じ ID が「追加」欄と出典表の両方に出るので重複を落とす
    const ids = [...new Set([...added.matchAll(/`(risk-[a-z0-9-]+)`/g)].map((m) => m[1]))];
    expect(ids.length).toBe(2);
    await callTool('update_engagement', {
      risks: [
        { id: ids[0], source: 'p.9 の体制図から', confidence: 'inferred' },
        { id: ids[1], source: 'どこかの資料', confidence: 'unknown' },
      ],
    });
    const out = await callTool('check_engagement_health', HEALTH);

    expect(out).toContain('推測(inferred)のまま残っている項目がある');
    expect(out).toContain('推測のままのリスク');
    expect(out).toContain('出所不明(unknown)のまま残っている項目がある');
    expect(out).toContain('出所不明のリスク');
    // 意思決定に効いている項目(対応中の高リスク)に混ざっているので警告に上げる
    expect(out).toContain('[WARNING] 推測(inferred)のまま残っている項目がある');
  });

  it('全件に出典が付いているときだけ褒める', async () => {
    await callTool('create_engagement', { name: '出典テスト: 全件' });
    const added = await callTool('update_engagement', {
      risks: [{ title: '照合済みリスク', level: 'high', status: 'open', owner: 'A', mitigation: '照合' }],
    });
    const id = /`(risk-[a-z0-9-]+)`/.exec(added)?.[1];
    await callTool('update_engagement', {
      risks: [{ id, source: 'csr2026.pdf p.31', confidence: 'stated' }],
    });
    const out = await callTool('check_engagement_health', HEALTH);

    expect(section(out, '良好な点(記録に根拠のあるものだけ)')).toContain('全 1 件に出典が記録され');
    expect(out).not.toContain('出典の付いていない項目が残っている');
    expect(out).not.toContain('出典が記録されている項目が 1 件も無い');
  });
});
