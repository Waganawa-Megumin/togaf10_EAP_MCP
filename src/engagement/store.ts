/**
 * エンゲージメント状態の JSON 永続化 / JSON persistence for engagement state.
 *
 * 既定の保存先は `~/.togaf-eap/engagement.json`。
 * 環境変数 `TOGAF_EAP_DATA_DIR` で保存ディレクトリを変更できる。
 */

import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { normalizeEngagement, type Engagement } from './model.js';

/** 保存時に 'change' を発火する。ダッシュボードの SSE がこれを購読する。 */
export const storeEvents = new EventEmitter();

export const STATE_FILENAME = 'engagement.json';

/** データディレクトリを解決する(呼び出しごとに環境変数を読む) */
export function getDataDir(): string {
  const override = process.env.TOGAF_EAP_DATA_DIR;
  if (override && override.trim().length > 0) return resolve(override.trim());
  return join(homedir(), '.togaf-eap');
}

/** 状態ファイルのフルパス */
export function getStatePath(): string {
  return join(getDataDir(), STATE_FILENAME);
}

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * 保存済みのエンゲージメントを読み込む。
 * 未作成・破損時は null を返す(例外は投げない)。
 */
export function loadEngagement(): Engagement | null {
  const path = getStatePath();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    if (raw.trim().length === 0) return null;
    return normalizeEngagement(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * エンゲージメントを保存する。
 * 一時ファイルへ書いてから rename することで、ダッシュボードが
 * 書き込み途中の壊れた JSON を読むことを防ぐ。
 */
export function saveEngagement(engagement: Engagement): Engagement {
  const path = getStatePath();
  ensureDir(path);
  const next: Engagement = { ...engagement, updatedAt: new Date().toISOString() };
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
  storeEvents.emit('change', next);
  return next;
}

/** 状態ファイルを削除する(主にテスト用) */
export function clearEngagement(): void {
  const path = getStatePath();
  if (existsSync(path)) unlinkSync(path);
  storeEvents.emit('change', null);
}

/**
 * 既存のエンゲージメントを読み込み、変換関数を適用して保存する。
 * エンゲージメントが未作成なら null を返す。
 */
export function mutateEngagement(fn: (engagement: Engagement) => Engagement): Engagement | null {
  const current = loadEngagement();
  if (!current) return null;
  return saveEngagement(fn(current));
}
