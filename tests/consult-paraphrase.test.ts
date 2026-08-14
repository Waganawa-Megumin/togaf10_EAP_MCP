import { describe, expect, it } from 'vitest';
import { readSituation } from '../src/knowledge/consulting.js';

/**
 * 言い換えの読み取り / Paraphrase detection.
 *
 * 定型句の literal だけを並べると、語尾を変えただけで一致が消える。
 * 「利用者が書いたことを『書いていない』と言う」のが一番の害なので、
 * 拾えること(recall)と、書いていないことを読まないこと(precision)を両方固定する。
 */
const ids = (situation: string): string[] =>
  readSituation(situation).conditions.map((c) => c.condition.id);

describe('言い換えを拾う / picks up paraphrases', () => {
  const hits: Array<[string, string]> = [
    ['sponsor-absent', '経営層はこの件にほとんど関心を示していない'],
    ['sponsor-absent', '役員はこの話を聞こうともしない'],
    ['sponsor-absent', '上層部の腰が重い'],
    ['sponsor-absent', '経営陣からは何も言ってこない'],
    ['sponsor-absent', 'トップの理解が得られていない'],
    ['sponsor-absent', 'スポンサーがいない'],
    ['sponsor-absent', 'executives show almost no interest in this'],
    ['sponsor-absent', 'leadership engagement is minimal'],
    ['budget-none', '予算はほとんど付いていない'],
    ['authority-none', '私に決定権はない'],
    ['authority-none', '誰が決めるのか分からない'],
    ['field-resistance', '現場は乗り気ではない'],
    ['field-resistance', '利用部門の納得が取れていない'],
  ];
  for (const [id, situation] of hits) {
    it(`reads "${situation}" as ${id}`, () => {
      expect(ids(situation)).toContain(id);
    });
  }
});

describe('書いていないことを読まない / does not invent conditions', () => {
  const misses: Array<[string, string]> = [
    ['sponsor-absent', '経営の関与は強い'],
    ['sponsor-absent', '経営の関心は高い'],
    ['sponsor-absent', '経営の関与をまず確認する'],
    ['sponsor-absent', '役員会は毎月開かれている'],
    ['budget-none', '予算は5億円'],
    ['budget-none', '予算は3億円確保済み'],
    ['budget-none', '予算はこれから決まる'],
    ['authority-none', '決定権は事業部長にある'],
    ['authority-none', '私が決定権を持っている'],
    ['field-resistance', '現場の協力が得られている'],
    ['field-resistance', '利用部門の合意ができている'],
    ['field-resistance', '現場は積極的に参加している'],
  ];
  for (const [id, situation] of misses) {
    it(`does not read "${situation}" as ${id}`, () => {
      expect(ids(situation)).not.toContain(id);
    });
  }

  it('数字だけの記述を条件として読まない / plain counts are not conditions', () => {
    const read = readSituation('社員は5000人、拠点は12か所ある');
    expect(read.conditions.map((c) => c.condition.axis)).not.toContain('budget');
  });
});

describe('根拠の併記 / evidence is carried', () => {
  it('パターンで拾ったときも本文の表現を根拠として返す', () => {
    const read = readSituation('経営層はこの件にほとんど関心を示していない');
    const hit = read.conditions.find((c) => c.condition.id === 'sponsor-absent');
    expect(hit).toBeDefined();
    expect(hit?.cues[0]).toContain('関心');
  });

  it('根拠は短く切る / evidence stays short', () => {
    const long = `${'背景の説明が延々と続く。'.repeat(20)}経営はこの件にほとんど関心を示していない`;
    const read = readSituation(long);
    const hit = read.conditions.find((c) => c.condition.id === 'sponsor-absent');
    expect(hit).toBeDefined();
    for (const cue of hit?.cues ?? []) expect(cue.length).toBeLessThanOrEqual(45);
  });
});
