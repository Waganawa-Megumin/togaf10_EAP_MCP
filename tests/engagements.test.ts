/**
 * 複数エンゲージメント対応のテスト / Multi-engagement store tests.
 *
 * レビューで実機再現した 3 件の欠陥(索引破損時に旧ファイルを取りこぼす、
 * 不正 ID の旧データを落とす、コピーしたファイルで幽霊エントリが増える)の
 * 回帰テストを含む。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  archiveEngagement,
  clearEngagement,
  deleteEngagement,
  getCurrentEngagementId,
  getEngagementPath,
  getEngagementsDir,
  getIndexPath,
  getLegacyStatePath,
  getStatePath,
  listEngagements,
  loadEngagement,
  loadEngagementById,
  readIndex,
  saveEngagement,
  setCurrentEngagement,
} from '../src/engagement/store.js';
import { createEngagement, type Engagement } from '../src/engagement/model.js';

let dir: string;
const original = process.env.TOGAF_EAP_DATA_DIR;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'togaf-eap-multi-'));
  process.env.TOGAF_EAP_DATA_DIR = dir;
});

afterEach(() => {
  if (original === undefined) delete process.env.TOGAF_EAP_DATA_DIR;
  else process.env.TOGAF_EAP_DATA_DIR = original;
  rmSync(dir, { recursive: true, force: true });
});

/** 旧レイアウト(engagement.json 1 件)のデータを置く */
function writeLegacy(name: string, id = 'eng-legacy-1'): Engagement {
  const engagement: Engagement = { ...createEngagement({ name }), id };
  writeFileSync(getLegacyStatePath(), `${JSON.stringify(engagement, null, 2)}\n`, 'utf8');
  return engagement;
}

describe('multi-engagement layout', () => {
  it('saves to engagements/<id>.json and writes an index', () => {
    const saved = saveEngagement(createEngagement({ name: 'A社 刷新' }));

    expect(existsSync(join(getEngagementsDir(), `${saved.id}.json`))).toBe(true);
    expect(existsSync(getIndexPath())).toBe(true);
    expect(getCurrentEngagementId()).toBe(saved.id);
    expect(getStatePath()).toBe(getEngagementPath(saved.id));
  });

  it('keeps several engagements and switches between them', () => {
    const first = saveEngagement(createEngagement({ name: '案件1' }));
    const second = saveEngagement(createEngagement({ name: '案件2' }));

    // 直近保存が選択中
    expect(getCurrentEngagementId()).toBe(second.id);
    expect(listEngagements()).toHaveLength(2);

    expect(setCurrentEngagement(first.id)).toBe(true);
    expect(loadEngagement()?.name).toBe('案件1');

    expect(setCurrentEngagement('no-such-id')).toBe(false);
    expect(loadEngagement()?.name).toBe('案件1');
  });

  it('hides archived engagements unless asked, without deleting them', () => {
    const keep = saveEngagement(createEngagement({ name: '進行中' }));
    const old = saveEngagement(createEngagement({ name: '終了案件' }));

    expect(archiveEngagement(old.id, true)).toBe(true);
    expect(listEngagements().map((e) => e.id)).toEqual([keep.id]);
    expect(listEngagements(true)).toHaveLength(2);
    expect(loadEngagementById(old.id)?.name).toBe('終了案件');

    expect(archiveEngagement(old.id, false)).toBe(true);
    expect(listEngagements()).toHaveLength(2);
    expect(archiveEngagement('no-such-id', true)).toBe(false);
  });

  it('reselects a survivor when the current engagement is deleted', () => {
    const first = saveEngagement(createEngagement({ name: '案件1' }));
    const second = saveEngagement(createEngagement({ name: '案件2' }));
    expect(getCurrentEngagementId()).toBe(second.id);

    expect(deleteEngagement(second.id)).toBe(true);
    expect(getCurrentEngagementId()).toBe(first.id);
    expect(loadEngagement()?.name).toBe('案件1');

    expect(deleteEngagement(first.id)).toBe(true);
    expect(getCurrentEngagementId()).toBeNull();
    expect(loadEngagement()).toBeNull();
    expect(deleteEngagement('no-such-id')).toBe(false);
  });
});

describe('legacy migration', () => {
  it('migrates engagement.json into the new layout on first access', () => {
    writeLegacy('旧レイアウト案件');

    const loaded = loadEngagement();
    expect(loaded?.name).toBe('旧レイアウト案件');
    expect(existsSync(getIndexPath())).toBe(true);
    // 旧ファイルは保険として残す
    expect(existsSync(getLegacyStatePath())).toBe(true);
  });

  it('still migrates when index.json is corrupted', () => {
    writeLegacy('壊れた索引でも拾う');
    mkdirSync(getEngagementsDir(), { recursive: true });
    writeFileSync(getIndexPath(), '{ not json', 'utf8');

    // 索引が読めないので旧ファイルから作り直す(データが消えたように見えてはいけない)
    expect(loadEngagement()?.name).toBe('壊れた索引でも拾う');
  });

  it('migrates a legacy file whose id is unusable as a filename', () => {
    writeLegacy('危険な ID', '../../evil id');

    const loaded = loadEngagement();
    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe('危険な ID');
    // engagements/ の外にファイルを作らない
    expect(existsSync(join(dir, '..', 'evil id.json'))).toBe(false);
  });

  it('does not resurrect the legacy engagement after everything is deleted', () => {
    writeLegacy('消したい案件');
    const migrated = loadEngagement();
    expect(migrated).not.toBeNull();

    expect(deleteEngagement(migrated!.id)).toBe(true);
    // 索引は空のまま残るので、旧ファイルからの再移行は起きない
    expect(loadEngagement()).toBeNull();
    expect(listEngagements(true)).toHaveLength(0);
  });
});

describe('index recovery', () => {
  it('rebuilds the index from disk when it is missing', () => {
    const saved = saveEngagement(createEngagement({ name: '索引なしでも読む' }));
    rmSync(getIndexPath());

    const index = readIndex();
    expect(index.engagements.map((e) => e.id)).toEqual([saved.id]);
    expect(loadEngagement()?.name).toBe('索引なしでも読む');
  });

  it('ignores a copied file whose inner id does not match its filename', () => {
    const saved = saveEngagement(createEngagement({ name: '原本' }));
    const copyPath = join(getEngagementsDir(), 'copy-of-original.json');
    writeFileSync(copyPath, readFileSync(join(getEngagementsDir(), `${saved.id}.json`), 'utf8'), 'utf8');
    rmSync(getIndexPath());

    // 複製は採用しない(同じ ID が二重に並ぶ幽霊エントリを防ぐ)
    expect(readIndex().engagements).toHaveLength(1);
    expect(readIndex().engagements[0].id).toBe(saved.id);
  });

  it('drops index entries whose file has disappeared', () => {
    const first = saveEngagement(createEngagement({ name: '残る' }));
    const second = saveEngagement(createEngagement({ name: '消える' }));
    rmSync(join(getEngagementsDir(), `${second.id}.json`));

    expect(readIndex().engagements.map((e) => e.id)).toEqual([first.id]);
  });

  it('survives a corrupted engagement file', () => {
    const saved = saveEngagement(createEngagement({ name: '壊れる案件' }));
    writeFileSync(join(getEngagementsDir(), `${saved.id}.json`), '{ broken', 'utf8');

    expect(loadEngagementById(saved.id)).toBeNull();
    expect(() => loadEngagement()).not.toThrow();
  });
});

describe('clearEngagement', () => {
  it('removes every engagement, the index, and the legacy file', () => {
    writeLegacy('旧');
    saveEngagement(createEngagement({ name: '新' }));

    clearEngagement();

    expect(loadEngagement()).toBeNull();
    expect(listEngagements(true)).toHaveLength(0);
    expect(existsSync(getIndexPath())).toBe(false);
    expect(existsSync(getLegacyStatePath())).toBe(false);
  });
});
