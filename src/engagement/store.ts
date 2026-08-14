/**
 * エンゲージメント状態の JSON 永続化 / JSON persistence for engagement state.
 *
 * 複数案件を並行して扱えるように、次のレイアウトで保存する。
 *   <dataDir>/index.json              … 索引(選択中の ID + 一覧)
 *   <dataDir>/engagements/<id>.json   … 各エンゲージメント本体
 *
 * 旧レイアウト(`<dataDir>/engagement.json` に 1 件だけ)のデータは、
 * 初回アクセス時に自動で新レイアウトへ移行する。旧ファイルは保険として残す。
 *
 * 既定の保存先は `~/.togaf-eap`。環境変数 `TOGAF_EAP_DATA_DIR` で変更できる。
 */

import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  makeId,
  normalizeEngagement,
  toIndexEntry,
  type Engagement,
  type EngagementIndex,
  type EngagementIndexEntry,
} from './model.js';

/** 保存・切替・削除時に 'change' を発火する。ダッシュボードの SSE がこれを購読する。 */
export const storeEvents = new EventEmitter();

/** 旧レイアウトのファイル名(後方互換のため公開したまま) */
export const STATE_FILENAME = 'engagement.json';

/** 索引ファイル名 */
export const INDEX_FILENAME = 'index.json';

/** エンゲージメント本体を置くサブディレクトリ名 */
export const ENGAGEMENTS_DIRNAME = 'engagements';

/** データディレクトリを解決する(呼び出しごとに環境変数を読む) */
export function getDataDir(): string {
  const override = process.env.TOGAF_EAP_DATA_DIR;
  if (override && override.trim().length > 0) return resolve(override.trim());
  return join(homedir(), '.togaf-eap');
}

/** 索引ファイルのフルパス */
export function getIndexPath(): string {
  return join(getDataDir(), INDEX_FILENAME);
}

/** エンゲージメント本体を置くディレクトリのフルパス */
export function getEngagementsDir(): string {
  return join(getDataDir(), ENGAGEMENTS_DIRNAME);
}

/** 旧レイアウトの状態ファイルのフルパス */
export function getLegacyStatePath(): string {
  return join(getDataDir(), STATE_FILENAME);
}

/**
 * ファイル名に使える ID かを検査する。
 * ディレクトリトラバーサルを避けるため、英数と `.` `_` `-` のみ許可する。
 */
function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) && !id.includes('..');
}

/** ID からエンゲージメントファイルのパスを作る(不正な ID は null) */
export function getEngagementPath(id: string): string | null {
  if (!isSafeId(id)) return null;
  return join(getEngagementsDir(), `${id}.json`);
}

/**
 * ファイル名に使えない ID を整える(旧ファイルの移行時の保険)。
 * 整えても使えない場合は null を返す。
 */
function toSafeId(id: string): string | null {
  const cleaned = id.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[^A-Za-z0-9]+/, '');
  return isSafeId(cleaned) ? cleaned : null;
}

/**
 * 現在選択中のエンゲージメントのファイルパス。
 * まだ 1 件も無い場合は旧レイアウトのパスを返す(既存の呼び出し元との互換のため)。
 */
export function getStatePath(): string {
  const id = getCurrentEngagementId();
  if (id) {
    const path = getEngagementPath(id);
    if (path) return path;
  }
  return getLegacyStatePath();
}

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** 一時ファイルに書いてから rename する(読み手が壊れた JSON を掴まないように) */
function writeJsonAtomic(path: string, value: unknown): void {
  ensureDir(path);
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}

/** JSON を読む。未作成・破損時は null(例外は投げない)。 */
function readJson(path: string): unknown {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf8');
    if (raw.trim().length === 0) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** engagements ディレクトリ内の ID を列挙する */
function listEngagementIdsOnDisk(): string[] {
  try {
    const dir = getEngagementsDir();
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json') && !f.includes('.tmp-'))
      .map((f) => f.slice(0, -'.json'.length))
      .filter((id) => isSafeId(id));
  } catch {
    return [];
  }
}

/** 索引ファイルを読む(壊れていれば null) */
function readIndexFile(): EngagementIndex | null {
  const raw = readJson(getIndexPath());
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<EngagementIndex>;
  if (!Array.isArray(value.engagements)) return null;
  const engagements: EngagementIndexEntry[] = [];
  for (const entry of value.engagements) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Partial<EngagementIndexEntry>;
    if (typeof e.id !== 'string' || !isSafeId(e.id) || typeof e.name !== 'string') continue;
    engagements.push({
      id: e.id,
      name: e.name,
      client: typeof e.client === 'string' ? e.client : undefined,
      industry: typeof e.industry === 'string' ? e.industry : undefined,
      currentPhaseId: typeof e.currentPhaseId === 'string' ? e.currentPhaseId : 'a',
      archived: e.archived === true,
      updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : '',
    });
  }
  const currentId = typeof value.currentId === 'string' ? value.currentId : null;
  return { currentId, engagements };
}

/**
 * ファイル名と中身の ID が一致するものだけを読む。
 * ファイルを手でコピーした場合に、同じ ID の実体が二重に見えるのを防ぐ。
 */
function loadOwnedEngagement(id: string): Engagement | null {
  const loaded = loadEngagementById(id);
  return loaded && loaded.id === id ? loaded : null;
}

/** 索引をディスク上のファイルから作り直す(索引が壊れた・消えたとき用) */
function rebuildIndexFromDisk(): EngagementIndex {
  const engagements: EngagementIndexEntry[] = [];
  for (const id of listEngagementIdsOnDisk()) {
    const loaded = loadOwnedEngagement(id);
    if (loaded) engagements.push(toIndexEntry(loaded));
  }
  sortEntries(engagements);
  const first = engagements.find((e) => !e.archived) ?? engagements[0];
  return { currentId: first ? first.id : null, engagements };
}

/** 更新日時の新しい順に並べる */
function sortEntries(entries: EngagementIndexEntry[]): void {
  entries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

/**
 * 旧レイアウトのファイルしか無い場合に、新レイアウトへ移行する。
 * 旧ファイルは削除しない(移行に失敗しても手元にデータが残るように)。
 */
function migrateLegacyIfNeeded(): void {
  // 新レイアウトの実体があれば移行済み
  if (listEngagementIdsOnDisk().length > 0) return;
  // 索引が読めるなら移行済みとみなす(中身が空でも尊重する。
  // 全件削除したあとに旧ファイルから案件が復活しないようにするため)。
  // 索引が壊れている場合は読めないので、ここで旧ファイルを拾い直せる。
  if (readIndexFile()) return;
  const legacy = getLegacyStatePath();
  if (!existsSync(legacy)) return;
  const source = normalizeEngagement(readJson(legacy));
  if (!source) return;
  // 旧ファイルの ID がファイル名に使えない場合は安全な ID に振り直す
  const id = getEngagementPath(source.id) ? source.id : (toSafeId(source.id) ?? makeId('eng'));
  const engagement: Engagement = id === source.id ? source : { ...source, id };
  const path = getEngagementPath(engagement.id);
  if (!path) return;
  try {
    writeJsonAtomic(path, engagement);
    writeIndex({ currentId: engagement.id, engagements: [toIndexEntry(engagement)] });
  } catch {
    // 移行できなくても致命的ではない。旧ファイルはそのまま残る。
  }
}

/** 索引を書き込む */
function writeIndex(index: EngagementIndex): void {
  sortEntries(index.engagements);
  writeJsonAtomic(getIndexPath(), index);
}

/**
 * 索引を読む。未作成なら旧レイアウトからの移行を試み、
 * それでも無ければディスク上のファイルから組み立てる。
 */
export function readIndex(): EngagementIndex {
  migrateLegacyIfNeeded();
  const index = readIndexFile();
  if (!index) return rebuildIndexFromDisk();
  // 索引にあるが実体が消えているものは除外する(索引は書き換えない)。
  // 手で編集された索引に同じ ID が並んでいた場合も 1 件に畳む。
  const known = new Set<string>();
  const alive: EngagementIndexEntry[] = [];
  for (const entry of index.engagements) {
    if (known.has(entry.id)) continue;
    const path = getEngagementPath(entry.id);
    if (path === null || !existsSync(path)) continue;
    known.add(entry.id);
    alive.push(entry);
  }
  // 索引に載っていない実体を拾う(手動でファイルを置いた場合)
  for (const id of listEngagementIdsOnDisk()) {
    if (known.has(id)) continue;
    const loaded = loadOwnedEngagement(id);
    if (!loaded) continue;
    known.add(id);
    alive.push(toIndexEntry(loaded));
  }
  sortEntries(alive);
  const currentId = index.currentId && alive.some((e) => e.id === index.currentId)
    ? index.currentId
    : (alive.find((e) => !e.archived) ?? alive[0])?.id ?? null;
  return { currentId, engagements: alive };
}

/** 保存済みエンゲージメントの一覧(既定ではアーカイブ済みを除く) */
export function listEngagements(includeArchived = false): EngagementIndexEntry[] {
  const entries = readIndex().engagements;
  return includeArchived ? entries : entries.filter((e) => !e.archived);
}

/** 現在選択中のエンゲージメント ID(未作成なら null) */
export function getCurrentEngagementId(): string | null {
  return readIndex().currentId;
}

/** ID を指定してエンゲージメントを読み込む。未作成・破損時は null。 */
export function loadEngagementById(id: string): Engagement | null {
  const path = getEngagementPath(id);
  if (!path) return null;
  return normalizeEngagement(readJson(path));
}

/**
 * 現在選択中のエンゲージメントを読み込む。
 * 未作成・破損時は null を返す(例外は投げない)。
 */
export function loadEngagement(): Engagement | null {
  const id = getCurrentEngagementId();
  if (!id) return null;
  return loadEngagementById(id);
}

/**
 * エンゲージメントを保存し、索引を更新して選択中にする。
 * 一時ファイルへ書いてから rename することで、ダッシュボードが
 * 書き込み途中の壊れた JSON を読むことを防ぐ。
 */
export function saveEngagement(engagement: Engagement): Engagement {
  const next: Engagement = { ...engagement, updatedAt: new Date().toISOString() };
  const path = getEngagementPath(next.id);
  if (!path) {
    // 通常は makeId 由来なので起こらないが、不正な ID はファイル名にできない
    throw new Error(`invalid engagement id: ${next.id}`);
  }
  // 索引は書き込み前に読む(移行処理をここで済ませる)
  const index = readIndex();
  writeJsonAtomic(path, next);
  const entry = toIndexEntry(next);
  const others = index.engagements.filter((e) => e.id !== next.id);
  writeIndex({ currentId: next.id, engagements: [entry, ...others] });
  storeEvents.emit('change', next);
  return next;
}

/** 選択中のエンゲージメントを切り替える。存在しない ID なら false。 */
export function setCurrentEngagement(id: string): boolean {
  const index = readIndex();
  if (!index.engagements.some((e) => e.id === id)) return false;
  writeIndex({ currentId: id, engagements: index.engagements });
  storeEvents.emit('change', loadEngagementById(id));
  return true;
}

/** アーカイブ状態を変更する。存在しない ID なら false。 */
export function archiveEngagement(id: string, archived: boolean): boolean {
  const engagement = loadEngagementById(id);
  const path = getEngagementPath(id);
  if (!engagement || !path) return false;
  const next: Engagement = { ...engagement, archived, updatedAt: new Date().toISOString() };
  writeJsonAtomic(path, next);
  const index = readIndex();
  const others = index.engagements.filter((e) => e.id !== id);
  writeIndex({ currentId: index.currentId, engagements: [toIndexEntry(next), ...others] });
  storeEvents.emit('change', loadEngagement());
  return true;
}

/**
 * エンゲージメントを削除する。存在しない ID なら false。
 * 選択中のものを消した場合は、残っているうちの最新を選択し直す。
 */
export function deleteEngagement(id: string): boolean {
  const path = getEngagementPath(id);
  if (!path || !existsSync(path)) return false;
  const index = readIndex();
  try {
    unlinkSync(path);
  } catch {
    return false;
  }
  const remaining = index.engagements.filter((e) => e.id !== id);
  const currentId = index.currentId === id || index.currentId === null
    ? (remaining.find((e) => !e.archived) ?? remaining[0])?.id ?? null
    : index.currentId;
  writeIndex({ currentId, engagements: remaining });
  storeEvents.emit('change', loadEngagement());
  return true;
}

/** 保存されている状態をすべて削除する(主にテスト用) */
export function clearEngagement(): void {
  for (const id of listEngagementIdsOnDisk()) {
    const path = getEngagementPath(id);
    if (path && existsSync(path)) {
      try {
        unlinkSync(path);
      } catch {
        // 消せなくても続行する
      }
    }
  }
  for (const path of [getIndexPath(), getLegacyStatePath()]) {
    if (existsSync(path)) {
      try {
        unlinkSync(path);
      } catch {
        // 消せなくても続行する
      }
    }
  }
  storeEvents.emit('change', null);
}

/**
 * 現在選択中のエンゲージメントを読み込み、変換関数を適用して保存する。
 * エンゲージメントが未作成なら null を返す。
 */
export function mutateEngagement(fn: (engagement: Engagement) => Engagement): Engagement | null {
  const current = loadEngagement();
  if (!current) return null;
  return saveEngagement(fn(current));
}
