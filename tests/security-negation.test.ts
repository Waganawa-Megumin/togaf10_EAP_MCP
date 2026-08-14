/**
 * 状況読み取りの打ち消し / Negation in the security situation reading.
 *
 * 「個人情報もカード情報も扱わない」を「個人データを扱う」と読むと、
 * 利用者が扱わないと明言したものを根拠に対策を勧めることになる。
 * 逆に打ち消しを効かせすぎて、公開範囲や二重否定まで消してもいけない。
 */

import { describe, expect, it } from 'vitest';
import { registerSecurityTools } from '../src/tools/security.js';

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;

/** ツールのハンドラだけを取り出す小さなスタブ */
function securityTool(name: string): Handler {
  const handlers = new Map<string, Handler>();
  const stub = {
    registerTool(toolName: string, _def: unknown, handler: Handler) {
      handlers.set(toolName, handler);
    },
  };
  // McpServer の全面を模す必要はない。registerTool しか呼ばれない
  registerSecurityTools(stub as never);
  const handler = handlers.get(name);
  if (!handler) throw new Error(`no tool: ${name}`);
  return handler;
}

async function threatModel(system: string, lang = 'ja'): Promise<string> {
  const handler = securityTool('threat_model_starter');
  const result = await handler({ system, lang });
  return result.content.map((c) => c.text).join('\n');
}

describe('打ち消しの読み取り / negation in the situation reading', () => {
  it('does not read "we handle neither personal nor card data" as holding personal data', async () => {
    const out = await threatModel('個人情報もカード情報も扱わない社内の勤怠システム。社員 30 人。');
    expect(out).toContain('| データの機微性 | 読み取れず');
    // 黙って捨てず、打ち消しとして読んだことを開示する
    expect(out).toContain('打ち消しとして読んだ記述');
    // 「カード情報」も決済データとして認識したうえで打ち消す
    expect(out).toContain('カード情報');
    expect(out).toContain('個人データ / 取引・決済は扱わない');
  });

  // 助詞が「は」以外・丁寧形の打ち消しを取りこぼすと、
  // 利用者は同じことを言い直させられる(実測: 先に着手すべき項目が 2 → 4 に増えた)
  it.each([
    ['社内の備品管理。個人情報もありません。', '個人データ'],
    ['社内の備品管理。決済もありません。', '取引・決済'],
    ['社内の備品管理。決済は行いません。', '取引・決済'],
    ['社内の備品管理。個人情報は保有していない。', '個人データ'],
  ])('reads %s as a denial', async (systemText, kind) => {
    const out = await threatModel(systemText);
    expect(out).toContain('| データの機微性 | 読み取れず');
    expect(out).toContain(`${kind} を対象外として扱った`);
  });

  it('still reads personal data when the text says it is handled', async () => {
    const out = await threatModel('個人情報を扱う社内の勤怠システム。社員 30 人。');
    expect(out).toContain('| データの機微性 | 個人データ');
    expect(out).not.toContain('打ち消しとして読んだ記述');
  });

  it('treats a double negative as present, not as a denial', async () => {
    const out = await threatModel('社内の勤怠システム。個人情報が無いわけではない。社員 30 人。');
    expect(out).toContain('| データの機微性 | 個人データ');
    expect(out).toContain('打ち消さなかった二重否定');
  });

  it('keeps the exposure reading when only the data is denied', async () => {
    const out = await threatModel('インターネット公開の勤怠システムで個人情報は扱わない');
    expect(out).toContain('社外公開');
    expect(out).toContain('| データの機微性 | 読み取れず');
  });

  it('denies only what precedes the marker, so "no personal data but payments happen" keeps payments', async () => {
    const out = await threatModel('社外公開のポータル。個人情報は扱わないが決済は行う。');
    expect(out).toContain('取引・決済');
  });

  it('reads an English denial and answers in English only', async () => {
    const out = await threatModel(
      'An internal time-and-attendance system for 30 employees. It does not handle personal data or card numbers.',
      'en',
    );
    expect(out).toContain('Read as ruled out');
    expect(out).toContain('| Sensitivity | not determined');
    // 根拠として引用する語は利用者の原文由来なので、それ以外に日本語を混ぜない
    expect(out).not.toMatch(/[ぁ-んァ-ヶ一-鿿]/u);
  });

  it('keeps 1,240 as the scale even though clause splitting cuts on commas', async () => {
    const out = await threatModel(
      'インターネット公開の受発注ポータル。取引先 1,240 社が使う。個人情報は扱わない。',
    );
    expect(out).toContain('1,240 社');
  });
});
