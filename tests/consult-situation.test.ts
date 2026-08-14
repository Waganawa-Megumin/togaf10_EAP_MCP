/**
 * `consult` の状況読み取りの回帰テスト / Regression tests for how `consult` reads a situation.
 *
 * ここで守りたいのは 3 点。
 * 1. 「やらないことに決まった」と言われた話題を助言に混ぜない(混ぜると害になる)
 * 2. 二重否定・留保(「予算が無いわけではない」)を、肯定にも打ち消しにも数えない
 * 3. 正反対の条件には正反対の助言が出る(同じ話題でも状況で中身が変わる)
 *
 * ツール本体は `registerConsultTool` でしか公開されていないので、
 * `registerTool` だけを持つスタブに登録させてハンドラを取り出し、実際に呼ぶ。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerConsultTool } from '../src/tools/consult.js';
import {
  CONDITION_COMBOS,
  SITUATION_AXIS_LABELS,
  SITUATION_CONDITIONS,
  detectSituationConditions,
  readSituation,
  situationAdvice,
  type SituationConditionId,
} from '../src/knowledge/consulting.js';

interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

type ConsultArgs = {
  situation: string;
  currentPhase?: string;
  industry?: string;
  lang: 'ja' | 'en' | 'both';
};

type ConsultHandler = (args: ConsultArgs) => Promise<ToolResult>;

/** `registerConsultTool` からハンドラだけを取り出す */
function captureConsult(): ConsultHandler {
  let captured: ConsultHandler | undefined;
  const stub = {
    registerTool(name: string, _config: unknown, cb: ConsultHandler) {
      if (name === 'consult') captured = cb;
    },
  };
  registerConsultTool(stub as unknown as McpServer);
  if (!captured) throw new Error('consult tool was not registered');
  return captured;
}

const consultTool = captureConsult();

async function consult(situation: string, lang: ConsultArgs['lang'] = 'ja'): Promise<string> {
  const result = await consultTool({ situation, lang });
  expect(result.isError, situation).not.toBe(true);
  return result.content.map((c) => c.text).join('\n');
}

/** `## 見出し` から次の `## ` 直前までを取り出す */
function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const rest = text.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

function conditionById(id: SituationConditionId) {
  const found = SITUATION_CONDITIONS.find((c) => c.id === id);
  if (!found) throw new Error(`unknown condition id: ${id}`);
  return found;
}

let dir: string;
const originalDir = process.env.TOGAF_EAP_DATA_DIR;

// 保存済みの案件を読み込ませない(利用者の ~/.togaf-eap を触らせない)
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'togaf-eap-consult-'));
  process.env.TOGAF_EAP_DATA_DIR = dir;
});

afterEach(() => {
  if (originalDir === undefined) delete process.env.TOGAF_EAP_DATA_DIR;
  else process.env.TOGAF_EAP_DATA_DIR = originalDir;
  rmSync(dir, { recursive: true, force: true });
});

describe('consult: 打ち消された話題 / retracted topics', () => {
  const situation = 'レガシー刷新はやらないことに決まった。困っているのは顧客マスタがバラバラなことだ';

  it('names the retracted topic as excluded, with the clause it came from', async () => {
    const text = await consult(situation);
    expect(text).toContain('## 対象外として外した話題');
    expect(text).toContain('レガシーシステムの刷新');
    // 根拠は打ち消し語だけでなく、その語が出てきた節ごと引く
    expect(text).toContain('レガシー刷新はやらないことに決まった');
  });

  it('still diagnoses the topic the user actually raised', async () => {
    const text = await consult(situation);
    const diagnosis = section(text, '## 見立て');
    expect(diagnosis).toContain('データのサイロ化');
    // 打ち消しが効きすぎて全部消えていないことの確認
    expect(section(text, '## 推奨アクション').length).toBeGreaterThan(0);
  });

  it('keeps the retracted topic out of the actions and the questions', async () => {
    const text = await consult(situation);
    const actions = section(text, '## 推奨アクション');
    const questions = section(text, '## ステークホルダーへの確認質問');
    // 節が空だと以下の not.toContain が素通りするので、先に中身があることを確かめる
    expect(actions.length).toBeGreaterThan(100);
    expect(questions.length).toBeGreaterThan(100);

    // レガシー刷新ルール固有の助言(移行方式・現行仕様の属人性)が混ざっていないこと
    for (const phrase of ['二重運用', 'ビッグバン', '現行仕様の調査に期限']) {
      expect(actions, phrase).not.toContain(phrase);
    }
    for (const phrase of ['あと何年在籍しますか', '新しい基盤で動かすだけ']) {
      expect(questions, phrase).not.toContain(phrase);
    }
  });

  it('does not exclude anything when the text has no retraction', async () => {
    const text = await consult('顧客マスタがバラバラで、数字が部門ごとに合わない');
    expect(text).not.toContain('## 対象外として外した話題');
  });
});

describe('consult: 二重否定 / double negatives', () => {
  const situation = '予算が無いわけではないが、とにかく時間がない。基幹システムの刷新を任された';

  it('counts a hedged clause as neither a condition nor a retraction', () => {
    const reading = readSituation(situation);

    expect(reading.hedged).toHaveLength(1);
    expect(reading.hedged[0]?.text).toContain('予算が無いわけではない');
    expect(reading.hedged[0]?.hedgeMarker).toBe('わけではない');

    // 肯定文にも打ち消し文にも入れない
    expect(reading.positiveText).not.toContain('わけではない');
    expect(reading.negatedText).not.toContain('わけではない');

    // 予算の軸はどちら側にも倒さず「判断していない」に置く
    expect(reading.conditions.map((c) => c.condition.axis)).not.toContain('budget');
    expect(reading.unknownAxes).toContain('budget');

    // 留保していない部分はきちんと読む
    expect(reading.conditions.map((c) => c.condition.id)).toContain('deadline-urgent');
  });

  it('says out loud that it suspended judgement on the hedged clause', async () => {
    const text = await consult(situation);
    expect(text).toContain('二重否定');
    expect(text).toContain('予算が無いわけではないが');
  });

  it('shows no budget row and no budget verdict for the hedged clause', async () => {
    const text = await consult(situation);
    const read = section(text, '## 読み取った状況');

    // 「| 予算 | ... |」の行(= 予算を読み取ったという主張)が立っていないこと
    expect(read).not.toMatch(/\|\s*予算\s*\|/);
    expect(read).toMatch(/\|\s*期限\s*\|/);
    // 判断していない軸として名前が挙がる
    expect(read).toContain('記述が無いため判断していない観点');

    // 条件の見出しとして予算の判定が出ていないこと
    for (const id of ['budget-none', 'budget-tight', 'budget-ample'] as SituationConditionId[]) {
      expect(text, id).not.toContain(`**${conditionById(id).label.ja}**`);
    }
  });

  it('reads a plainly stated budget the normal way', () => {
    // 二重否定の抑制が、素直な言い方まで殺していないこと
    const ids = detectSituationConditions('予算はゼロだ').map((c) => c.condition.id);
    expect(ids).toContain('budget-none');

    // 同じ文から「わけではない」だけを外すと、今度は予算が読み取られる
    // (= 上の抑制は留保表現によるもので、たまたま当たっていないのではない)
    const plain = readSituation('予算が無い。とにかく時間がない。基幹システムの刷新を任された');
    expect(plain.hedged).toHaveLength(0);
    expect(plain.conditions.map((c) => c.condition.id)).toContain('budget-none');
    expect(plain.unknownAxes).not.toContain('budget');
  });
});

describe('consult: 条件の読み取り / condition detection', () => {
  const cases: { situation: string; id: SituationConditionId }[] = [
    { situation: '予算はゼロで、レガシー基幹システムの刷新を任された', id: 'budget-none' },
    { situation: '予算は潤沢に確保されている。クラウド移行を検討している', id: 'budget-ample' },
    { situation: '全社共通の受発注システムを入れたいが、現場は反対している', id: 'field-resistance' },
  ];

  for (const { situation, id } of cases) {
    it(`detects ${id}`, async () => {
      const detected = detectSituationConditions(situation).map((c) => c.condition.id);
      expect(detected).toContain(id);

      const text = await consult(situation);
      const condition = conditionById(id);
      const read = section(text, '## 読み取った状況');
      expect(read).toContain(SITUATION_AXIS_LABELS[condition.axis].ja);
      expect(read).toContain(condition.label.ja);
    });
  }

  it('carries the condition into the advice, not just into the read', async () => {
    const text = await consult('予算はゼロで、レガシー基幹システムの刷新を任された');
    const actions = section(text, '## 推奨アクション');
    expect(actions).toContain('**あなたの状況の条件に対して(ここが最優先)**');
    expect(actions).toContain(conditionById('budget-none').actions[0]!.ja);
  });

  it('says plainly when the text states no conditions at all', async () => {
    const text = await consult('顧客マスタがバラバラで困っている');
    const read = section(text, '## 読み取った状況');
    expect(read).toContain('条件は文中に書かれていなかった');
    expect(read).not.toMatch(/\|\s*予算\s*\|/);
  });
});

describe('consult: 正反対の状況 / opposite situations', () => {
  const poorText = '予算はゼロで、私しかいない。レガシー基幹システムの刷新を任された';
  const richText = '予算は潤沢に確保されており、専任チームがいる。レガシー基幹システムの刷新を任された';

  it('produces materially different guidance for the same topic', async () => {
    const poor = await consult(poorText);
    const rich = await consult(richText);
    expect(poor).not.toBe(rich);

    const poorActions = section(poor, '## 推奨アクション');
    const richActions = section(rich, '## 推奨アクション');
    expect(poorActions).not.toBe(richActions);

    // 条件そのものの助言が、それぞれの側にだけ出る
    expect(poorActions).toContain(conditionById('budget-none').actions[0]!.ja);
    expect(poorActions).toContain(conditionById('team-solo').actions[0]!.ja);
    expect(richActions).toContain(conditionById('budget-ample').actions[0]!.ja);
    expect(richActions).toContain(conditionById('team-dedicated').actions[0]!.ja);

    expect(richActions).not.toContain(conditionById('budget-none').actions[0]!.ja);
    expect(poorActions).not.toContain(conditionById('budget-ample').actions[0]!.ja);
  });

  it('pushes the topic advice a no-budget reader cannot act on to the back', async () => {
    const poorActions = section(await consult(poorText), '## 推奨アクション');
    const richActions = section(await consult(richText), '## 推奨アクション');
    expect(poorActions.length).toBeGreaterThan(100);
    expect(richActions.length).toBeGreaterThan(100);

    // budget-none の avoid にある語(金と人を前提にする助言)は、無予算側には出さない
    const avoided = conditionById('budget-none').avoid.filter((word) => richActions.includes(word));
    expect(avoided.length, 'the funded answer should contain at least one such phrase').toBeGreaterThan(0);
    for (const word of avoided) {
      expect(poorActions, word).not.toContain(word);
    }
  });

  it('names the combination, not just the two conditions separately', async () => {
    const poor = await consult(poorText);
    const combo = CONDITION_COMBOS.find((c) => c.id === 'no-money-no-people');
    expect(combo).toBeDefined();
    expect(poor).toContain(combo!.label.ja);
    expect(poor).toContain(combo!.advice.ja);
  });
});

describe('consult: 条件データの健全性 / condition data integrity', () => {
  it('fills both ja and en on every condition', () => {
    for (const c of SITUATION_CONDITIONS) {
      const texts = [
        c.label,
        c.implication,
        ...c.actions,
        ...c.questions,
      ];
      for (const t of texts) {
        expect(t.ja.length, `${c.id}.ja`).toBeGreaterThan(0);
        expect(t.en.length, `${c.id}.en`).toBeGreaterThan(0);
      }
      expect(c.cues.length, `${c.id}.cues`).toBeGreaterThan(0);
      expect(c.actions.length, `${c.id}.actions`).toBeGreaterThan(0);
      expect(c.questions.length, `${c.id}.questions`).toBeGreaterThan(0);
      expect(SITUATION_AXIS_LABELS[c.axis], `${c.id}.axis`).toBeDefined();
    }
  });

  it('uses unique condition ids and labels every axis', () => {
    const ids = SITUATION_CONDITIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const axis of Object.keys(SITUATION_AXIS_LABELS)) {
      expect(
        SITUATION_CONDITIONS.some((c) => c.axis === axis),
        `axis without any condition: ${axis}`,
      ).toBe(true);
    }
  });

  it('keeps combo references pointing at real conditions', () => {
    const known = new Set(SITUATION_CONDITIONS.map((c) => c.id));
    const comboIds = CONDITION_COMBOS.map((c) => c.id);
    expect(new Set(comboIds).size).toBe(comboIds.length);

    for (const combo of CONDITION_COMBOS) {
      expect(combo.requires.length, `${combo.id}.requires`).toBeGreaterThan(0);
      expect(combo.label.ja.length && combo.label.en.length, `${combo.id}.label`).toBeGreaterThan(0);
      expect(combo.advice.ja.length && combo.advice.en.length, `${combo.id}.advice`).toBeGreaterThan(0);
      for (const group of combo.requires) {
        expect(group.length, `${combo.id}.requires group`).toBeGreaterThan(0);
        for (const id of group) expect(known.has(id), `${combo.id} → ${id}`).toBe(true);
      }
    }
  });

  it('caps how much condition-derived advice one answer can carry', () => {
    // 条件が 5 つ当たっても、アクション 5 件・質問 4 件を超えない
    const reading = readSituation(
      '予算はゼロ、時間がない、経営は無関心、私しかいない、資料がない、決定権がない、現場は反対している、監査もある',
    );
    expect(reading.conditions.length).toBeGreaterThanOrEqual(5);

    const advice = situationAdvice(reading);
    expect(advice.actions.length).toBeLessThanOrEqual(5);
    expect(advice.questions.length).toBeLessThanOrEqual(4);

    // 1 つの条件で枠を使い切らない(条件ごとに 1 件ずつ拾う)
    const owners = new Set(
      advice.actions.map(
        (a) => reading.conditions.find((c) => c.condition.actions.some((x) => x.ja === a.ja))?.condition.id,
      ),
    );
    expect(owners.size).toBe(advice.actions.length);
  });
});
