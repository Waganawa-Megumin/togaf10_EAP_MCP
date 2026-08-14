#!/usr/bin/env node
/**
 * 開発進捗の記録 CLI / Development progress CLI.
 *
 * 並列作業する各エージェントが「自分のファイルだけ」を書くことで、
 * 書き込み競合なしに進捗を共有する。集約はダッシュボード側で行う。
 *
 *   node scripts/dev-progress.mjs set <id> <status> [note]
 *   node scripts/dev-progress.mjs set a1 running "モデル拡張に着手"
 *   node scripts/dev-progress.mjs set a1 done "完了。tsc 通過" --files src/engagement/model.ts,src/engagement/store.ts
 *   node scripts/dev-progress.mjs init <id> --title "..." --owner "A1" --phase implement
 *   node scripts/dev-progress.mjs list
 *
 * status: pending | running | review | done | blocked | failed
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const PROGRESS_DIR = resolve(here, '..', '.dev-progress');

const STATUSES = ['pending', 'running', 'review', 'done', 'blocked', 'failed'];

function ensureDir() {
  if (!existsSync(PROGRESS_DIR)) mkdirSync(PROGRESS_DIR, { recursive: true });
}

function pathFor(id) {
  return join(PROGRESS_DIR, `${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
}

export function readTask(id) {
  const file = pathFor(id);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function readAll() {
  ensureDir();
  const tasks = [];
  for (const name of readdirSync(PROGRESS_DIR)) {
    if (!name.endsWith('.json')) continue;
    try {
      tasks.push(JSON.parse(readFileSync(join(PROGRESS_DIR, name), 'utf8')));
    } catch {
      // 書き込み途中のファイルは次のイベントで読み直す
    }
  }
  return tasks.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function writeTask(task) {
  ensureDir();
  const file = pathFor(task.id);
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(task, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
  return task;
}

function parseFlags(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : 'true';
      flags[key] = value;
    } else {
      rest.push(arg);
    }
  }
  return { flags, rest };
}

function main() {
  const [command, ...argv] = process.argv.slice(2);
  const { flags, rest } = parseFlags(argv);
  const now = new Date().toISOString();

  if (command === 'list' || !command) {
    for (const task of readAll()) {
      console.log(`${task.status.padEnd(8)} ${String(task.id).padEnd(10)} ${task.title ?? ''}`);
    }
    return;
  }

  if (command === 'init' || command === 'set') {
    const id = rest[0];
    if (!id) {
      console.error('usage: dev-progress.mjs set <id> <status> [note]');
      process.exit(1);
    }
    const status = command === 'set' ? rest[1] : (flags.status ?? 'pending');
    if (status && !STATUSES.includes(status)) {
      console.error(`unknown status "${status}". use one of: ${STATUSES.join(', ')}`);
      process.exit(1);
    }
    const note = rest.slice(2).join(' ') || flags.note;

    const existing = readTask(id) ?? {
      id,
      title: '',
      owner: '',
      phase: '',
      status: 'pending',
      files: [],
      log: [],
      createdAt: now,
      startedAt: null,
      finishedAt: null,
    };

    if (flags.title) existing.title = flags.title;
    if (flags.owner) existing.owner = flags.owner;
    if (flags.phase) existing.phase = flags.phase;
    if (flags.files) {
      existing.files = Array.from(new Set([...(existing.files ?? []), ...flags.files.split(',').map((f) => f.trim()).filter(Boolean)]));
    }
    if (status) {
      if (status === 'running' && !existing.startedAt) existing.startedAt = now;
      if (status === 'done' || status === 'failed') existing.finishedAt = now;
      existing.status = status;
    }
    if (note) existing.log = [...(existing.log ?? []), { at: now, status: existing.status, note }];
    existing.updatedAt = now;

    ensureDir();
    const file = pathFor(id);
    writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
    console.log(`${existing.status} ${existing.id} ${existing.title ?? ''}`);
    return;
  }

  console.error(`unknown command "${command}". use: init | set | list`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
