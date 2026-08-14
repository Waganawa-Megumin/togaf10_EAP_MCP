/**
 * Start 画面の預かり箱の回帰テスト / Regression tests for the Start screen intake box.
 *
 * この機能の要は「サーバーは預かるだけ、読むのは Claude」という分担なので、
 * テストも **預かる側の安全性** に集中する。
 *
 *   1. 保管層  — 保存 → 一覧 → 状態変更 → 削除
 *   2. 無害化  — ファイル名・拡張子・サイズ・拡張子とマジックバイトの食い違い
 *   3. 解析    — multipart を自前で解く部分が壊れた入力で落ちない
 *   4. 画面    — 預かった本文が必ずエスケープされて HTML に入る(XSS)
 *
 * ここで緩めた分だけ、ブラウザから任意の入力が届く経路が広がる。期待値は
 * 「実装がそうなっているから」ではなく「仕様としてそうあるべきだから」書く。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import {
  ALLOWED_INTAKE_EXTENSIONS,
  MAX_INTAKE_FILE_BYTES,
  MAX_INTAKE_FILES_PER_POST,
  MAX_INTAKE_POST_BYTES,
  MAX_INTAKE_RECORDS,
  MAX_INTAKE_TEXT_CHARS,
  addIntake,
  attachmentPathOf,
  checkTypeMismatch,
  clearIntake,
  countIntake,
  deleteIntake,
  detectContentType,
  extensionOf,
  getAttachmentPath,
  getIntake,
  getIntakeDir,
  getIntakeFilesDir,
  getIntakeIndexPath,
  isAllowedExtension,
  listIntake,
  markIntakeDone,
  markIntakePending,
  normalizeIntakeText,
  redactSecrets,
  toDisplayFileName,
} from '../src/dashboard/intakeStore.js';
import {
  START_ALLOWED_EXTENSIONS,
  START_MAX_FILE_BYTES,
  START_MAX_MESSAGE_CHARS,
  START_MAX_TOTAL_BYTES,
  START_TRIGGER_PHRASE,
  renderStartHtml,
} from '../src/dashboard/startHtml.js';
import { parseMultipart, startDashboard, stopDashboard } from '../src/dashboard/httpServer.js';

let dir: string;
const originalDataDir = process.env.TOGAF_EAP_DATA_DIR;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'togaf-eap-intake-'));
  process.env.TOGAF_EAP_DATA_DIR = dir;
});

afterEach(() => {
  if (originalDataDir === undefined) delete process.env.TOGAF_EAP_DATA_DIR;
  else process.env.TOGAF_EAP_DATA_DIR = originalDataDir;
  rmSync(dir, { recursive: true, force: true });
});

/** 小さなテキスト添付を作る */
function textFile(name: string, body = 'hello'): {
  originalName: string;
  data: Buffer;
  declaredType?: string;
} {
  return { originalName: name, data: Buffer.from(body, 'utf8') };
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const PDF_MAGIC = Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);

// ---------------------------------------------------------------------------
// 1. 保管層
// ---------------------------------------------------------------------------

describe('intake store: save, list, status, delete', () => {
  it('starts empty and does not create anything just by looking', () => {
    expect(listIntake()).toEqual([]);
    expect(countIntake()).toEqual({ total: 0, pending: 0, done: 0 });
    expect(getIntake('in-nope')).toBeNull();
  });

  it('stores a text-only consultation as pending', () => {
    const { record, rejected } = addIntake({ text: '基幹システムの刷新を相談したい' });

    expect(rejected).toEqual([]);
    expect(record.status).toBe('pending');
    expect(record.text).toBe('基幹システムの刷新を相談したい');
    expect(record.attachments).toEqual([]);
    expect(record.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
    expect(Number.isNaN(Date.parse(record.receivedAt))).toBe(false);

    expect(listIntake()).toHaveLength(1);
    expect(listIntake('pending')).toHaveLength(1);
    expect(listIntake('done')).toHaveLength(0);
    expect(countIntake()).toEqual({ total: 1, pending: 1, done: 0 });
    expect(getIntake(record.id)?.text).toBe('基幹システムの刷新を相談したい');
    expect(existsSync(getIntakeIndexPath())).toBe(true);
  });

  it('stores an attachment under a server-chosen name and makes it readable', () => {
    const { record, rejected } = addIntake({
      text: '現行の構成図です',
      attachments: [{ originalName: '構成図.pdf', data: PDF_MAGIC, declaredType: 'application/pdf' }],
    });

    expect(rejected).toEqual([]);
    expect(record.attachments).toHaveLength(1);
    const attachment = record.attachments[0];
    expect(attachment.originalName).toBe('構成図.pdf');
    expect(attachment.ext).toBe('.pdf');
    expect(attachment.size).toBe(PDF_MAGIC.length);

    // 保存名はサーバーが決める。元の名前(日本語)はパスに使わない。
    expect(attachment.storedName).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
    expect(attachment.storedName).not.toContain('構成図');
    expect(attachment.storedName.endsWith('.pdf')).toBe(true);

    const path = attachmentPathOf(attachment);
    expect(path).not.toBeNull();
    expect(path!.startsWith(getIntakeFilesDir() + sep)).toBe(true);
    expect(existsSync(path!)).toBe(true);
  });

  it('lists newest first', () => {
    const first = addIntake({ text: '1 件目' }).record;
    const second = addIntake({ text: '2 件目' }).record;
    const third = addIntake({ text: '3 件目' }).record;

    const ids = listIntake().map((r) => r.id);
    expect(ids).toEqual([third.id, second.id, first.id]);
  });

  it('marks a record done and back to pending', () => {
    const { record } = addIntake({ text: '見てほしい' });

    const done = markIntakeDone(record.id, 'リスク 3 件を案件に登録した');
    expect(done?.status).toBe('done');
    expect(done?.note).toBe('リスク 3 件を案件に登録した');
    expect(typeof done?.processedAt).toBe('string');
    expect(countIntake()).toEqual({ total: 1, pending: 0, done: 1 });
    expect(listIntake('pending')).toHaveLength(0);
    expect(listIntake('done')).toHaveLength(1);

    // 状態はディスクに残る(別の呼び出しから読み直せる)
    expect(getIntake(record.id)?.status).toBe('done');

    const back = markIntakePending(record.id);
    expect(back?.status).toBe('pending');
    expect(back?.processedAt).toBeUndefined();
    expect(countIntake()).toEqual({ total: 1, pending: 1, done: 0 });
  });

  it('returns null for an unknown id instead of throwing', () => {
    expect(markIntakeDone('in-does-not-exist')).toBeNull();
    expect(markIntakePending('in-does-not-exist')).toBeNull();
    expect(deleteIntake('in-does-not-exist')).toBe(false);

    // 不正な形の ID(パス片)でも落ちないし、何も作らない
    expect(markIntakeDone('../../etc/passwd')).toBeNull();
    expect(deleteIntake('../../etc/passwd')).toBe(false);
    expect(listIntake()).toEqual([]);
  });

  it('deletes a record together with its stored file', () => {
    const { record } = addIntake({
      text: '添付つき',
      attachments: [textFile('memo.txt')],
    });
    const path = attachmentPathOf(record.attachments[0])!;
    expect(existsSync(path)).toBe(true);

    expect(deleteIntake(record.id)).toBe(true);
    expect(existsSync(path)).toBe(false);
    expect(listIntake()).toEqual([]);
    expect(deleteIntake(record.id)).toBe(false);
  });

  it('clears everything, including files left behind', () => {
    addIntake({ text: 'a', attachments: [textFile('a.txt')] });
    addIntake({ text: 'b', attachments: [textFile('b.md')] });
    expect(countIntake().total).toBe(2);

    expect(clearIntake()).toBe(2);
    expect(listIntake()).toEqual([]);
    expect(countIntake()).toEqual({ total: 0, pending: 0, done: 0 });
    expect(readdirSync(getIntakeFilesDir())).toEqual([]);
  });

  it('refuses to store a completely empty submission', () => {
    expect(() => addIntake({})).toThrow();
    expect(() => addIntake({ text: '   \n  ' })).toThrow();
    expect(listIntake()).toEqual([]);
  });

  it('survives a corrupt index instead of throwing', async () => {
    addIntake({ text: '生き残るはず' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(getIntakeIndexPath(), '{ this is not json', 'utf8');

    expect(listIntake()).toEqual([]);
    expect(countIntake()).toEqual({ total: 0, pending: 0, done: 0 });
    // 壊れた索引の上からでも新しい預かりは受け付けられる
    expect(addIntake({ text: '再開' }).record.status).toBe('pending');
    expect(listIntake()).toHaveLength(1);
  });

  it('keeps at most MAX_INTAKE_RECORDS records, dropping the oldest', () => {
    const oldest = addIntake({ text: 'oldest' }).record;
    for (let i = 0; i < MAX_INTAKE_RECORDS + 2; i += 1) addIntake({ text: `filler ${i}` });

    expect(listIntake()).toHaveLength(MAX_INTAKE_RECORDS);
    expect(getIntake(oldest.id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. 無害化: ファイル名
// ---------------------------------------------------------------------------

describe('intake store: file names are never trusted', () => {
  it.each([
    ['../../x.txt', 'x.txt'],
    ['../../../../etc/passwd', 'passwd'],
    ['..\\..\\x.txt', 'x.txt'],
    ['/etc/passwd', 'passwd'],
    ['C:\\Users\\admin\\secret.txt', 'secret.txt'],
    ['....//....//x.txt', 'x.txt'],
    ['/', 'unnamed'],
    ['..', 'unnamed'],
    ['.', 'unnamed'],
    ['', 'unnamed'],
    ['   ', 'unnamed'],
    ['.bashrc', 'bashrc'],
    ['設計書.pdf', '設計書.pdf'],
    ['議事録 2026-08-14.md', '議事録 2026-08-14.md'],
  ])('sanitises %j to %j', (raw, expected) => {
    expect(toDisplayFileName(raw)).toBe(expected);
  });

  it('strips NUL and other control characters', () => {
    expect(toDisplayFileName('a\u0000b.txt')).toBe('ab.txt');
    expect(toDisplayFileName('re\u0000port.pdf\u0000.exe')).not.toContain('\u0000');
    // 端末エスケープでの偽装も落とす
    expect(toDisplayFileName('safe\u001b[31m.txt')).not.toContain('\u001b');
  });

  it('shortens an absurdly long name but keeps the extension usable', () => {
    const long = `${'あ'.repeat(400)}.txt`;
    const display = toDisplayFileName(long);
    expect(display.length).toBeLessThanOrEqual(120);
    expect(display.length).toBeGreaterThan(0);
    expect(extensionOf(long)).toBe('.txt');
  });

  it('never turns a hostile name into a path outside the intake directory', () => {
    const hostile = [
      '../../../../etc/passwd.txt',
      '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts.txt',
      '/tmp/pwned.md',
      'a\u0000b.md',
      `${'x'.repeat(500)}.md`,
      '../設計書.pdf',
    ];
    const { record, rejected } = addIntake({
      attachments: hostile.map((name) => textFile(name, 'body')),
    });
    expect(rejected).toEqual([]);
    expect(record.attachments).toHaveLength(hostile.length);

    const filesDir = getIntakeFilesDir();
    for (const attachment of record.attachments) {
      expect(attachment.storedName).not.toContain('..');
      expect(attachment.storedName).not.toContain('/');
      expect(attachment.storedName).not.toContain('\\');
      const path = attachmentPathOf(attachment);
      expect(path).not.toBeNull();
      expect(path!.startsWith(filesDir + sep)).toBe(true);
    }
    // すべての実体は預かり箱の中だけにある
    expect(readdirSync(filesDir)).toHaveLength(hostile.length);
    expect(existsSync('/tmp/pwned.md')).toBe(false);
  });

  it('refuses to build a path from a stored name it did not choose', () => {
    expect(getAttachmentPath('../../etc/passwd')).toBeNull();
    expect(getAttachmentPath('..')).toBeNull();
    expect(getAttachmentPath('a/b.txt')).toBeNull();
    expect(getAttachmentPath('a\\b.txt')).toBeNull();
    expect(getAttachmentPath('')).toBeNull();
    expect(getAttachmentPath('.hidden')).toBeNull();
    expect(getAttachmentPath('in-abc-1.pdf')).toBe(join(getIntakeFilesDir(), 'in-abc-1.pdf'));
  });
});

// ---------------------------------------------------------------------------
// 3. 無害化: 拡張子とサイズ
// ---------------------------------------------------------------------------

describe('intake store: extension allow-list', () => {
  it('accepts every advertised extension', () => {
    for (const ext of ALLOWED_INTAKE_EXTENSIONS) {
      expect(isAllowedExtension(ext)).toBe(true);
      expect(isAllowedExtension(ext.toUpperCase())).toBe(true);
    }
  });

  it.each([
    'evil.exe',
    'evil.sh',
    'evil.bat',
    'evil.cmd',
    'evil.ps1',
    'evil.dll',
    'evil.so',
    'archive.zip',
    'archive.tar',
    'archive.gz',
    'archive.7z',
    'legacy.doc',
    'legacy.xls',
    'noextension',
    'evil.pdf.exe',
    'report.PDF.EXE',
  ])('rejects %s', (name) => {
    expect(isAllowedExtension(extensionOf(name))).toBe(false);

    const { record, rejected } = addIntake({ text: '本文', attachments: [textFile(name)] });
    expect(record.attachments).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe('extension');
  });

  it('does not open or expand archives — it simply refuses them', () => {
    const { record, rejected } = addIntake({ text: '本文', attachments: [{ originalName: 'x.zip', data: ZIP_MAGIC }] });
    expect(record.attachments).toEqual([]);
    expect(rejected[0].reason).toBe('extension');
    expect(readdirSync(getIntakeFilesDir())).toEqual([]);
  });

  it('is case-insensitive about the extension it accepts', () => {
    const { record, rejected } = addIntake({ attachments: [{ originalName: 'REPORT.PDF', data: PDF_MAGIC }] });
    expect(rejected).toEqual([]);
    expect(record.attachments[0].ext).toBe('.pdf');
    expect(record.attachments[0].storedName.endsWith('.pdf')).toBe(true);
  });

  it('throws when every attachment was rejected and there is no text', () => {
    expect(() => addIntake({ attachments: [textFile('evil.exe')] })).toThrow();
    expect(listIntake()).toEqual([]);
    // 弾いた添付は 1 バイトもディスクに落ちない(預かり箱そのものが作られない)
    expect(existsSync(getIntakeFilesDir()) ? readdirSync(getIntakeFilesDir()) : []).toEqual([]);
  });
});

describe('intake store: size limits', () => {
  it('rejects a file over the per-file limit', () => {
    const oversized = Buffer.alloc(MAX_INTAKE_FILE_BYTES + 1, 0x41);
    const { record, rejected } = addIntake({
      text: '大きすぎる添付',
      attachments: [{ originalName: 'huge.txt', data: oversized }],
    });
    expect(record.attachments).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe('size');
    expect(readdirSync(getIntakeFilesDir())).toEqual([]);
  });

  it('accepts a file exactly at the limit', () => {
    const exact = Buffer.alloc(MAX_INTAKE_FILE_BYTES, 0x41);
    const { record, rejected } = addIntake({ attachments: [{ originalName: 'edge.txt', data: exact }] });
    expect(rejected).toEqual([]);
    expect(record.attachments[0].size).toBe(MAX_INTAKE_FILE_BYTES);
  });

  it('rejects an empty file', () => {
    const { rejected } = addIntake({ text: '本文', attachments: [{ originalName: 'empty.txt', data: Buffer.alloc(0) }] });
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe('empty');
  });

  it('caps how many attachments one submission may carry', () => {
    const many = Array.from({ length: MAX_INTAKE_FILES_PER_POST + 5 }, (_v, i) => textFile(`f${i}.txt`));
    const { record } = addIntake({ text: '多すぎる', attachments: many });
    expect(record.attachments.length).toBeLessThanOrEqual(MAX_INTAKE_FILES_PER_POST);
    expect(record.attachments).toHaveLength(MAX_INTAKE_FILES_PER_POST);
  });

  it('truncates an over-long consultation body and says so', () => {
    const long = 'あ'.repeat(MAX_INTAKE_TEXT_CHARS + 500);
    const { record } = addIntake({ text: long });
    expect(record.textTruncated).toBe(true);
    expect(record.text.length).toBeLessThan(long.length);

    const short = normalizeIntakeText('短い本文');
    expect(short.truncated).toBe(false);
    expect(short.text).toBe('短い本文');
  });
});

// ---------------------------------------------------------------------------
// 4. 拡張子とマジックバイトの食い違い
// ---------------------------------------------------------------------------

describe('intake store: extension vs magic bytes', () => {
  it('recognises the signatures that matter', () => {
    expect(detectContentType(PDF_MAGIC)).toBe('pdf');
    expect(detectContentType(PNG_MAGIC)).toBe('png');
    expect(detectContentType(ZIP_MAGIC)).toBe('zip');
    expect(detectContentType(ELF_MAGIC)).toBe('elf');
    expect(detectContentType(Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toBe('exe');
    expect(detectContentType(Buffer.from('#!/bin/sh\n'))).toBe('script');
    expect(detectContentType(Buffer.from('plain text'))).toBeNull();
  });

  it('flags a mismatch without refusing the file outright', () => {
    const { record, rejected } = addIntake({
      attachments: [{ originalName: 'not-really.pdf', data: PNG_MAGIC }],
    });
    expect(rejected).toEqual([]);
    expect(record.attachments[0].typeMismatch).toBe(true);
    expect(record.attachments[0].detectedType).toBe('png');
  });

  it('flags an executable hiding behind a text extension', () => {
    const { record } = addIntake({ attachments: [{ originalName: 'notes.txt', data: ELF_MAGIC }] });
    expect(record.attachments[0].typeMismatch).toBe(true);
    expect(record.attachments[0].detectedType).toBe('elf');
  });

  it('does not cry wolf on honest files', () => {
    expect(checkTypeMismatch('.pdf', PDF_MAGIC).mismatch).toBe(false);
    expect(checkTypeMismatch('.png', PNG_MAGIC).mismatch).toBe(false);
    expect(checkTypeMismatch('.docx', ZIP_MAGIC).mismatch).toBe(false);
    expect(checkTypeMismatch('.xlsx', ZIP_MAGIC).mismatch).toBe(false);
    expect(checkTypeMismatch('.md', Buffer.from('# 見出し\n本文', 'utf8')).mismatch).toBe(false);
    expect(checkTypeMismatch('.csv', Buffer.from('a,b\n1,2\n', 'utf8')).mismatch).toBe(false);
  });

  it('never trusts the Content-Type the browser declared', () => {
    const { record } = addIntake({
      attachments: [
        { originalName: 'x.txt', data: Buffer.from('hi'), declaredType: 'application/x-msdownload' },
      ],
    });
    // 申告値は参考として持つが、保存の可否は拡張子と中身で決める
    expect(record.attachments[0].ext).toBe('.txt');
    expect(record.attachments[0].typeMismatch).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. 資格情報を残さない
// ---------------------------------------------------------------------------

describe('intake store: credentials are redacted before they are stored', () => {
  it.each([
    ['AKIAIOSFODNN7EXAMPLE', 'AWS access key id'],
    ['ghp_0123456789abcdefghijABCDEFGHIJ0123', 'GitHub token'],
    ['sk-0123456789abcdefghij0123456789', 'API key'],
    ['xoxb-1234567890-abcdefghijklm', 'Slack token'],
  ])('redacts %s', (secret) => {
    const { record } = addIntake({ text: `接続情報は ${secret} です` });
    expect(record.text).not.toContain(secret);
    expect(record.text).toContain('[REDACTED]');
    expect(record.redactions).toBeGreaterThan(0);
  });

  it('redacts key=value style secrets', () => {
    const { text, redactions } = redactSecrets('password = hunter2000\napi_key: abcdef123456');
    expect(text).not.toContain('hunter2000');
    expect(text).not.toContain('abcdef123456');
    expect(redactions).toBeGreaterThanOrEqual(2);
  });

  it('redacts a whole private key block', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nAAAA\n-----END RSA PRIVATE KEY-----';
    const { text } = redactSecrets(`鍵はこれです\n${pem}\n以上`);
    expect(text).not.toContain('MIIEow');
    expect(text).toContain('[REDACTED]');
  });

  it('leaves ordinary prose alone', () => {
    const prose = 'この案件では認証基盤の刷新を検討しています。予算は 5000 万円です。';
    const { text, redactions } = redactSecrets(prose);
    expect(text).toBe(prose);
    expect(redactions).toBe(0);
  });

  it('strips control characters from the consultation body', () => {
    const { text } = normalizeIntakeText('前\u0000半\u001b[31m後半');
    expect(text).not.toContain('\u0000');
    expect(text).not.toContain('\u001b');
    expect(text).toContain('前半');
  });
});

// ---------------------------------------------------------------------------
// 6. Start 画面の HTML
// ---------------------------------------------------------------------------

/**
 * 画面の中の JS が使っているエスケープ関数を取り出して、その場で実行する。
 *
 * 一覧は預かった本文をブラウザ側で描くので、守りの要はこの 1 関数。
 * 「esc という名前の関数がある」ではなく「実際に無害化する」ことを検査する。
 */
function extractPageEscaper(html: string): (value: unknown) => string {
  const start = /function esc\s*\(\s*[A-Za-z_$][\w$]*\s*\)/.exec(html)?.index ?? -1;
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  let end = -1;
  for (let i = html.indexOf('{', start); i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  expect(end).toBeGreaterThan(start);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(`${html.slice(start, end)}; return esc;`) as () => (v: unknown) => string;
  return factory();
}

describe('start screen HTML', () => {
  it('is a self-contained document with no external resources', () => {
    for (const lang of ['ja', 'en', 'both'] as const) {
      const html = renderStartHtml(lang);
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).toContain('<style>');
      expect(html).toContain('<script>');

      // CDN・外部フォント・外部画像を一切読まない(Artifact/オフラインでも同じ見た目)
      expect(html).not.toMatch(/src\s*=\s*["']https?:/i);
      expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet["']/i);
      expect(html).not.toMatch(/@import/i);
      expect(html).not.toMatch(/["']\/\/[a-z0-9.-]+\.[a-z]{2,}\//i);
      // fetch は同一オリジンの相対パスだけ
      expect(html).not.toMatch(/fetch\(\s*["']https?:/i);
    }
  });

  it('always tells the reader to go back to Claude Code', () => {
    const ja = renderStartHtml('ja');
    expect(ja).toContain('Claude Code');
    expect(ja).toContain(START_TRIGGER_PHRASE.ja);

    const en = renderStartHtml('en');
    expect(en).toContain('Claude Code');
    expect(en).toContain(START_TRIGGER_PHRASE.en);

    const both = renderStartHtml('both');
    expect(both).toContain(START_TRIGGER_PHRASE.ja);
    expect(both).toContain(START_TRIGGER_PHRASE.en);
  });

  it('shows the pending / done distinction', () => {
    const ja = renderStartHtml('ja');
    expect(ja).toContain('未処理');
    expect(ja).toContain('処理済み');

    const en = renderStartHtml('en');
    expect(en).toContain('Not read yet');
    expect(en).toContain('Read');
  });

  it('keeps its print and dark-mode rules', () => {
    const html = renderStartHtml('ja');
    expect(html).toContain('@media print');
    expect(html).toContain('prefers-color-scheme: dark');
  });

  it('advertises limits that match the server, never looser', () => {
    // 画面が「25MB まで」と言いながらサーバーが 10MB で断る、の逆も含めて防ぐ
    expect(START_MAX_FILE_BYTES).toBe(MAX_INTAKE_FILE_BYTES);
    expect(START_MAX_TOTAL_BYTES).toBe(MAX_INTAKE_POST_BYTES);
    expect(START_MAX_MESSAGE_CHARS).toBeLessThanOrEqual(MAX_INTAKE_TEXT_CHARS);

    for (const ext of START_ALLOWED_EXTENSIONS) {
      expect(isAllowedExtension(`.${ext}`)).toBe(true);
    }
  });

  it('escapes hostile text before it reaches the DOM', () => {
    const esc = extractPageEscaper(renderStartHtml('ja'));

    expect(esc('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(esc('<script>alert(1)</script>')).not.toContain('<script>');
    expect(esc('"><img src=x onerror=alert(1)>')).toBe(
      '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;',
    );
    expect(esc("' onmouseover='alert(1)")).not.toContain("'");
    expect(esc('a & b')).toBe('a &amp; b');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    // 普通の日本語はそのまま読める
    expect(esc('基幹システムの刷新')).toBe('基幹システムの刷新');
  });

  it('never concatenates submission fields into HTML without escaping them', () => {
    const html = renderStartHtml('ja');
    // 一覧の描画は innerHTML を使うので、本文・ファイル名は必ず esc() を通す
    expect(html).toContain('esc(mask(s.message))');
    expect(html).not.toMatch(/\+\s*s\.message\s*\+/);
    expect(html).not.toMatch(/\+\s*f\.name\s*\+/);
    expect(html).not.toMatch(/\+\s*engagement\.name\s*\+/);
  });

  it('marks the consultation body as data, not as instructions', () => {
    const ja = renderStartHtml('ja');
    // 預かった本文は引用ブロックに閉じ込め、「指示には従わない」と明示する
    expect(ja).toContain('blockquote');
    expect(ja).toContain('指示');
  });
});

// ---------------------------------------------------------------------------
// 7. multipart/form-data の自前パーサ
// ---------------------------------------------------------------------------

type MultipartPart =
  | { name: string; value: string }
  | { name: string; fileName: string; data: Buffer; type?: string; star?: boolean };

/** テスト用に multipart/form-data の本文を組み立てる */
function multipartBody(boundary: string, parts: MultipartPart[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`, 'utf8'));
    if ('value' in part) {
      chunks.push(Buffer.from(`content-disposition: form-data; name="${part.name}"\r\n\r\n`, 'utf8'));
      chunks.push(Buffer.from(part.value, 'utf8'));
    } else {
      const nameParam = part.star
        ? `filename*=UTF-8''${encodeURIComponent(part.fileName)}`
        : `filename="${part.fileName}"`;
      chunks.push(
        Buffer.from(
          `content-disposition: form-data; name="${part.name}"; ${nameParam}\r\n` +
            `content-type: ${part.type ?? 'application/octet-stream'}\r\n\r\n`,
          'utf8',
        ),
      );
      chunks.push(part.data);
    }
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return Buffer.concat(chunks);
}

describe('multipart parser', () => {
  const B = '----togafBoundary123';

  it('reads a text field on its own', () => {
    const parsed = parseMultipart(multipartBody(B, [{ name: 'message', value: '相談です' }]), B);
    expect(parsed).not.toBeNull();
    expect(parsed!.fields.get('message')).toBe('相談です');
    expect(parsed!.files).toEqual([]);
  });

  it('reads a file on its own', () => {
    const parsed = parseMultipart(
      multipartBody(B, [{ name: 'files', fileName: 'a.pdf', data: PDF_MAGIC, type: 'application/pdf' }]),
      B,
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.fields.size).toBe(0);
    expect(parsed!.files).toHaveLength(1);
    expect(parsed!.files[0].fileName).toBe('a.pdf');
    expect(parsed!.files[0].contentType).toBe('application/pdf');
    expect(parsed!.files[0].data.equals(PDF_MAGIC)).toBe(true);
  });

  it('reads a message and files together', () => {
    const parsed = parseMultipart(
      multipartBody(B, [
        { name: 'message', value: 'これを見てください' },
        { name: 'files', fileName: 'one.md', data: Buffer.from('# 一つ目') },
        { name: 'files', fileName: 'two.csv', data: Buffer.from('a,b\n1,2\n') },
      ]),
      B,
    );
    expect(parsed!.fields.get('message')).toBe('これを見てください');
    expect(parsed!.files.map((f) => f.fileName)).toEqual(['one.md', 'two.csv']);
    expect(parsed!.files[0].data.toString('utf8')).toBe('# 一つ目');
  });

  it('keeps a Japanese file name sent as raw UTF-8', () => {
    const parsed = parseMultipart(
      multipartBody(B, [{ name: 'files', fileName: '基本設計書 v2.pdf', data: PDF_MAGIC }]),
      B,
    );
    expect(parsed!.files[0].fileName).toBe('基本設計書 v2.pdf');
  });

  it('decodes a Japanese file name sent as RFC 5987 filename*', () => {
    const parsed = parseMultipart(
      multipartBody(B, [{ name: 'files', fileName: '議事録.docx', data: ZIP_MAGIC, star: true }]),
      B,
    );
    expect(parsed!.files[0].fileName).toBe('議事録.docx');
  });

  it('keeps binary payloads byte-for-byte', () => {
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a, 0xff, 0x00, 0x1a]);
    const parsed = parseMultipart(multipartBody(B, [{ name: 'files', fileName: 'x.png', data: binary }]), B);
    expect(parsed!.files[0].data.equals(binary)).toBe(true);
  });

  it.each([
    ['an empty body', Buffer.alloc(0)],
    ['a body with no boundary at all', Buffer.from('just some text, no multipart here')],
    ['a truncated body', Buffer.from(`--${B}\r\ncontent-disposition: form-data; name="a"`)],
    ['headers that never terminate', Buffer.from(`--${B}\r\ncontent-disposition: form-data; name="a"\r\n`)],
    ['a part whose boundary never closes', Buffer.from(`--${B}\r\ncontent-disposition: form-data; name="a"\r\n\r\nbody without an end`)],
    ['random binary noise', Buffer.from([0x00, 0xff, 0x10, 0x80, 0x00, 0x2d, 0x2d, 0x00])],
    ['only the closing marker', Buffer.from(`--${B}--\r\n`)],
  ])('never throws on %s', (_label, body) => {
    let result: unknown;
    expect(() => {
      result = parseMultipart(body, B);
    }).not.toThrow();
    // 読めない入力は null。中途半端に読んだ結果を返さない
    if (_label !== 'only the closing marker') expect(result).toBeNull();
  });

  it('never throws when the boundary is nonsense', () => {
    const body = multipartBody(B, [{ name: 'a', value: 'b' }]);
    expect(() => parseMultipart(body, 'not-the-boundary')).not.toThrow();
    expect(parseMultipart(body, 'not-the-boundary')).toBeNull();
    expect(() => parseMultipart(body, '')).not.toThrow();
  });

  it('refuses an absurd number of parts instead of grinding away', () => {
    const many = Array.from({ length: 200 }, (_v, i) => ({ name: `f${i}`, value: 'x' }));
    expect(parseMultipart(multipartBody(B, many), B)).toBeNull();
  });

  it('unescapes a quoted file name without letting it become a path', () => {
    const raw = Buffer.concat([
      Buffer.from(`--${B}\r\n`, 'utf8'),
      Buffer.from('content-disposition: form-data; name="files"; filename="../../etc/passwd.txt"\r\n\r\n', 'utf8'),
      Buffer.from('root:x:0:0'),
      Buffer.from(`\r\n--${B}--\r\n`, 'utf8'),
    ]);
    const parsed = parseMultipart(raw, B);
    // パーサは申告値をそのまま渡す。無害化は保存側の責任(そこで最後の要素だけになる)
    expect(parsed!.files[0].fileName).toBe('../../etc/passwd.txt');
    expect(toDisplayFileName(parsed!.files[0].fileName)).toBe('passwd.txt');
  });
});

// ---------------------------------------------------------------------------
// 8. HTTP 経路(ブラウザから届くところ)
// ---------------------------------------------------------------------------

interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  text: string;
  json: () => unknown;
}

/**
 * node:http で素のリクエストを投げる。
 * fetch では Host を差し替えられないので、Origin / Host の検査を試すために必要。
 */
function rawRequest(
  port: number,
  options: { method?: string; path: string; headers?: Record<string, string>; body?: Buffer | string },
): Promise<RawResponse> {
  return new Promise((resolvePromise, reject) => {
    const body = options.body === undefined ? undefined : Buffer.from(options.body as never);
    void import('node:http').then(({ request }) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          method: options.method ?? 'GET',
          path: options.path,
          headers: {
            ...(body ? { 'content-length': String(body.length) } : {}),
            ...(options.headers ?? {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const text = buffer.toString('utf8');
            resolvePromise({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: buffer,
              text,
              json: () => JSON.parse(text) as unknown,
            });
          });
        },
      );
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  });
}

const HTTP_BOUNDARY = '----togafHttpBoundary';

function postMultipart(port: number, parts: MultipartPart[], headers: Record<string, string> = {}) {
  return rawRequest(port, {
    method: 'POST',
    path: '/api/intake',
    headers: { 'content-type': `multipart/form-data; boundary=${HTTP_BOUNDARY}`, ...headers },
    body: multipartBody(HTTP_BOUNDARY, parts),
  });
}

describe('start screen over HTTP', () => {
  let port = 0;

  beforeEach(async () => {
    delete process.env.TOGAF_EAP_DASHBOARD_PORT;
    port = (await startDashboard('ja')).port;
  });

  afterEach(async () => {
    await stopDashboard();
  });

  it('serves the start screen on the same server as the dashboard', async () => {
    const health = await rawRequest(port, { path: '/health' });
    expect(health.status).toBe(200);

    const start = await rawRequest(port, { path: '/start' });
    expect(start.status).toBe(200);
    expect(String(start.headers['content-type'])).toContain('text/html');
    expect(start.headers['x-content-type-options']).toBe('nosniff');

    // 相談を投げたあと何をすればよいかが画面に書いてある
    expect(start.text).toContain('Claude Code');
    expect(start.text).toMatch(/スタート画面に入れたものを見て|look at what I put in the [Ss]tart screen/);

    // 自己完結(CDN を読まない)
    expect(start.text).not.toMatch(/src\s*=\s*["']https?:/i);
    expect(start.text).not.toMatch(/<link[^>]+rel=["']stylesheet["']/i);

    // ダッシュボードは別ポートを持たない
    const dashboard = await rawRequest(port, { path: '/' });
    expect(dashboard.status).toBe(200);
  });

  it('accepts a consultation with an attachment and reports what to do next', async () => {
    const res = await postMultipart(port, [
      { name: 'message', value: '基幹システム刷新の相談です' },
      { name: 'files', fileName: '構成図.pdf', data: PDF_MAGIC, type: 'application/pdf' },
    ]);
    expect(res.status).toBe(201);

    const body = res.json() as {
      ok: boolean;
      record: { id: string; status: string; attachments: { originalName: string; path: string }[] };
      nextStep: { ja: string; en: string };
    };
    expect(body.ok).toBe(true);
    expect(body.record.status).toBe('pending');
    expect(body.record.attachments).toHaveLength(1);
    expect(body.record.attachments[0].originalName).toBe('構成図.pdf');

    // Claude が読むための絶対パスが返る(預かり箱の中にしか無い)
    expect(body.record.attachments[0].path.startsWith(getIntakeFilesDir() + sep)).toBe(true);
    expect(existsSync(body.record.attachments[0].path)).toBe(true);

    // 「次に何をするか」が必ず添えられる
    expect(`${body.nextStep.ja}${body.nextStep.en}`).toContain('Claude Code');

    const list = (await rawRequest(port, { path: '/api/intake' })).json() as {
      counts: { total: number; pending: number };
    };
    expect(list.counts).toMatchObject({ total: 1, pending: 1 });
  });

  it('keeps a Japanese file name and stores it under a safe name', async () => {
    const res = await postMultipart(port, [
      { name: 'files', fileName: '基本設計書 v2.docx', data: ZIP_MAGIC, star: true },
    ]);
    expect(res.status).toBe(201);
    const record = listIntake()[0];
    expect(record.attachments[0].originalName).toBe('基本設計書 v2.docx');
    expect(record.attachments[0].storedName).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*\.docx$/);
  });

  it('never lets a hostile file name escape the intake directory', async () => {
    const res = await postMultipart(port, [
      { name: 'files', fileName: '../../../../tmp/togaf-eap-pwned.md', data: Buffer.from('# nope') },
    ]);
    expect(res.status).toBe(201);

    const stored = listIntake()[0].attachments[0];
    expect(stored.originalName).toBe('togaf-eap-pwned.md');
    expect(attachmentPathOf(stored)!.startsWith(getIntakeFilesDir() + sep)).toBe(true);
    expect(existsSync('/tmp/togaf-eap-pwned.md')).toBe(false);
    expect(readdirSync(getIntakeFilesDir())).toHaveLength(1);
  });

  it('refuses a file whose extension is not on the allow-list', async () => {
    const res = await postMultipart(port, [
      { name: 'message', value: 'これも見て' },
      { name: 'files', fileName: 'tool.exe', data: Buffer.from('MZ binary') },
    ]);
    expect(res.status).toBe(415);
    // 1 件でも駄目なら何も保存しない(半分だけ入って気付かないのを避ける)
    expect(listIntake()).toEqual([]);
  });

  it('refuses an executable hiding behind an allowed extension', async () => {
    const res = await postMultipart(port, [{ name: 'files', fileName: 'notes.txt', data: ELF_MAGIC }]);
    expect(res.status).toBe(415);
    expect(listIntake()).toEqual([]);
  });

  it('refuses an archive instead of expanding it', async () => {
    const res = await postMultipart(port, [{ name: 'files', fileName: 'bundle.zip', data: ZIP_MAGIC }]);
    expect(res.status).toBe(415);
    expect(listIntake()).toEqual([]);
  });

  it('refuses a file over the per-file limit with 413', async () => {
    const res = await postMultipart(port, [
      { name: 'files', fileName: 'huge.txt', data: Buffer.alloc(MAX_INTAKE_FILE_BYTES + 1, 0x41) },
    ]);
    expect(res.status).toBe(413);
    expect((res.json() as { error: string }).error).toBe('file-too-large');
    expect(listIntake()).toEqual([]);
  }, 30000);

  it('refuses a submission over the total post limit with 413', async () => {
    // 1 ファイルずつは上限内でも、合計で越えるものは読み切る前に断る
    const chunk = Math.floor(MAX_INTAKE_POST_BYTES / 3) + 1024;
    const res = await postMultipart(port, [
      { name: 'files', fileName: 'a.txt', data: Buffer.alloc(chunk, 0x41) },
      { name: 'files', fileName: 'b.txt', data: Buffer.alloc(chunk, 0x42) },
      { name: 'files', fileName: 'c.txt', data: Buffer.alloc(chunk, 0x43) },
    ]);
    expect(res.status).toBe(413);
    expect((res.json() as { error: string }).error).toBe('payload-too-large');
    expect(listIntake()).toEqual([]);
    // 断ったあともサーバーは生きている
    expect((await rawRequest(port, { path: '/health' })).status).toBe(200);
  }, 60000);

  it('refuses more attachments than one submission may carry', async () => {
    const parts: MultipartPart[] = Array.from({ length: MAX_INTAKE_FILES_PER_POST + 1 }, (_v, i) => ({
      name: 'files',
      fileName: `f${i}.txt`,
      data: Buffer.from(`file ${i}`),
    }));
    const res = await postMultipart(port, parts);
    expect(res.status).toBe(413);
    expect(listIntake()).toEqual([]);
  });

  it('answers 400 on a broken multipart body instead of crashing', async () => {
    const broken = await rawRequest(port, {
      method: 'POST',
      path: '/api/intake',
      headers: { 'content-type': `multipart/form-data; boundary=${HTTP_BOUNDARY}` },
      body: `--${HTTP_BOUNDARY}\r\ncontent-disposition: form-data; name="message"\r\n\r\nno end here`,
    });
    expect(broken.status).toBe(400);

    // 壊れた投稿のあとでもサーバーは生きている
    expect((await rawRequest(port, { path: '/health' })).status).toBe(200);
  });

  it('answers 400 when nothing was submitted', async () => {
    const empty = await postMultipart(port, [{ name: 'message', value: '   ' }]);
    expect(empty.status).toBe(400);
    expect(listIntake()).toEqual([]);
  });

  it('refuses methods other than GET and POST', async () => {
    for (const method of ['PUT', 'DELETE', 'PATCH', 'OPTIONS', 'TRACE']) {
      const res = await rawRequest(port, { method, path: '/api/intake' });
      expect(res.status).toBe(405);
      expect(String(res.headers.allow)).toContain('GET');
    }
  });

  it('answers 404 for paths it does not know', async () => {
    expect((await rawRequest(port, { path: '/nope' })).status).toBe(404);
    expect((await rawRequest(port, { path: '/api/intake/files/secret' })).status).toBe(404);
    expect((await rawRequest(port, { method: 'POST', path: '/nope', body: 'x' })).status).toBe(404);
  });

  it('refuses a request whose Host or Origin is not loopback', async () => {
    const badHost = await rawRequest(port, { path: '/api/intake', headers: { host: 'attacker.example' } });
    expect(badHost.status).toBe(403);

    const badOrigin = await rawRequest(port, {
      method: 'POST',
      path: '/api/intake',
      headers: { origin: 'http://attacker.example', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'from a hostile page' }),
    });
    expect(badOrigin.status).toBe(403);
    expect(listIntake()).toEqual([]);

    // localhost からの投稿は通る
    const good = await rawRequest(port, {
      method: 'POST',
      path: '/api/intake',
      headers: { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'from the start screen' }),
    });
    expect(good.status).toBe(201);
  });

  it('treats a submitted body as data, never as markup', async () => {
    const payload = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    expect((await postMultipart(port, [{ name: 'message', value: payload }])).status).toBe(201);

    // 画面の HTML には投稿本文が生のまま入らない(描画はブラウザ側で esc を通す)
    const start = await rawRequest(port, { path: '/start' });
    expect(start.text).not.toContain(payload);
    expect(start.text).not.toContain('onerror=alert(2)');

    // API はデータとして返す。JSON 文字列なので markup にはならない
    const list = (await rawRequest(port, { path: '/api/intake' })).json() as {
      records: { text: string }[];
    };
    expect(list.records[0].text).toBe(payload);

    // その本文を画面のエスケープ関数に通すと無害化される
    const esc = extractPageEscaper(start.text);
    expect(esc(payload)).toContain('&lt;script&gt;');
    expect(esc(payload)).not.toContain('<script>');
  });

  it('hides credentials that were pasted into the consultation', async () => {
    const secret = 'AKIAIOSFODNN7EXAMPLE';
    await postMultipart(port, [{ name: 'message', value: `本番の鍵は ${secret} です` }]);

    const raw = (await rawRequest(port, { path: '/api/intake' })).text;
    expect(raw).not.toContain(secret);
    expect(raw).toContain('[REDACTED]');
  });

  it('deletes and clears through the API', async () => {
    await postMultipart(port, [{ name: 'message', value: '1 件目' }]);
    await postMultipart(port, [{ name: 'message', value: '2 件目' }]);
    const id = listIntake()[0].id;

    const missing = await rawRequest(port, {
      method: 'POST',
      path: '/api/intake/delete',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'in-not-here' }),
    });
    expect(missing.status).toBe(404);
    expect(listIntake()).toHaveLength(2);

    const removed = await rawRequest(port, {
      method: 'POST',
      path: '/api/intake/delete',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    expect(removed.status).toBe(200);
    expect(listIntake()).toHaveLength(1);

    const cleared = await rawRequest(port, { method: 'POST', path: '/api/intake/clear' });
    expect(cleared.status).toBe(200);
    expect(listIntake()).toEqual([]);
  });

  it('accepts a plain JSON or urlencoded submission too', async () => {
    const asJson = await rawRequest(port, {
      method: 'POST',
      path: '/api/intake',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'JSON からの相談' }),
    });
    expect(asJson.status).toBe(201);

    const asForm = await rawRequest(port, {
      method: 'POST',
      path: '/api/intake',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'message=' + encodeURIComponent('フォームからの相談'),
    });
    expect(asForm.status).toBe(201);
    expect(listIntake().map((r) => r.text)).toContain('フォームからの相談');
  });

  it('pushes an SSE event when something is handed over', async () => {
    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/events`, { signal: controller.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    const readUntil = async (predicate: (buffer: string) => boolean): Promise<string> => {
      let buffer = '';
      const deadline = Date.now() + 5000;
      while (!predicate(buffer) && Date.now() < deadline) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      return buffer;
    };

    expect(await readUntil((b) => b.includes('"initial":true'))).toContain('data:');
    await postMultipart(port, [{ name: 'message', value: 'SSE の確認' }]);
    const received = await readUntil((b) => /^data:.*(?!initial)/m.test(b.replace(/.*initial.*\n/, '')));
    expect(received).toMatch(/^data:/m);

    controller.abort();
    await reader.cancel().catch(() => undefined);
  }, 10000);

  it('serves a page whose JS reads the keys the API actually returns', async () => {
    // 画面とサーバーが別々に育つと「投げたのに一覧に出ない」になる。
    // 画面の JS が読んでいるキー名を拾い、API がそれを返していることを確かめる。
    await postMultipart(port, [
      { name: 'message', value: '契約の確認' },
      { name: 'files', fileName: 'note.md', data: Buffer.from('# note') },
    ]);

    const html = (await rawRequest(port, { path: '/start' })).text;
    const payload = (await rawRequest(port, { path: '/api/intake' })).json() as Record<string, unknown>;

    const listKey = /\b(?:data|j|payload)\.(records|submissions|items)\b/.exec(html)?.[1];
    expect(listKey).toBeTruthy();
    const items = payload[listKey!];
    expect(Array.isArray(items)).toBe(true);
    expect((items as unknown[]).length).toBe(1);

    const first = (items as Record<string, unknown>[])[0];
    const filesKey = /\b(?:r|s|item)\.(attachments|files)\b/.exec(html)?.[1];
    expect(filesKey).toBeTruthy();
    expect(Array.isArray(first[filesKey!])).toBe(true);
    expect((first[filesKey!] as unknown[]).length).toBe(1);

    // 未処理 / 処理済み が API から見分けられる(画面はこれで状態を出す)
    expect((payload.counts as { pending: number }).pending).toBe(1);
    markIntakeDone(String(first.id), '登録済み');
    const after = (await rawRequest(port, { path: '/api/intake' })).json() as {
      counts: { pending: number; done: number };
      records: { status: string; processedAt?: string }[];
    };
    expect(after.counts).toMatchObject({ pending: 0, done: 1 });
    expect(after.records[0].status).not.toBe(first.status);
    expect(typeof after.records[0].processedAt).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 9. 画面モジュールが実際に配信されているか
// ---------------------------------------------------------------------------

describe('start screen wiring', () => {
  let port = 0;

  beforeEach(async () => {
    delete process.env.TOGAF_EAP_DASHBOARD_PORT;
    port = (await startDashboard('ja')).port;
  });

  afterEach(async () => {
    await stopDashboard();
  });

  it('serves the real Start screen, not the emergency fallback', async () => {
    // サーバーには画面モジュールが読めないときの簡易版がある。配線がずれると
    // 簡易版だけが出続け、作り込んだ画面が永久に届かない(利用者からは分からない)。
    const served = (await rawRequest(port, { path: '/start' })).text;
    expect(served).toBe(renderStartHtml('ja'));
  });
});

// ---------------------------------------------------------------------------
// 10. 投稿 1 件でサーバーを止められないか(計算量)
// ---------------------------------------------------------------------------

/**
 * ここは「速さ」ではなく**止まらないこと**のテスト。
 *
 * 受け口は 1 投稿 50MB まで受ける。node の HTTP サーバーは単一スレッドなので、
 * 本文の整形に入力長の 2 乗のような処理が 1 つでも混じっていると、投稿 1 件で
 * ダッシュボードごと固まる(実測: 直したときは 1.3MB の本文で 13 秒、
 * /health まで応答しなくなった)。閾値は実行環境に幅を持たせて緩めに置き、
 * 「桁が変わったら気付く」ことだけを狙う。
 */
describe('a single submission cannot stall the server', () => {
  it('shrugs off a body full of unterminated PEM headers', () => {
    // 閉じていない `-----BEGIN … PRIVATE KEY-----` を並べただけの本文。
    // 遅延量指定つきの 1 本の正規表現で書くと、ここで計算量が爆発する。
    const hostile = '-----BEGIN PRIVATE KEY-----'.repeat(50_000); // 約 1.3MB
    const started = Date.now();
    const { redactions } = redactSecrets(hostile);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(redactions).toBe(0); // 閉じていないので鍵ではない
  });

  it('still redacts real key blocks, including several in one body', () => {
    const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQ\n-----END RSA PRIVATE KEY-----';
    const encrypted =
      '-----BEGIN ENCRYPTED PRIVATE KEY-----\nDEK-Info: AES-128-CBC,9A2B\n\nMIIEow\n-----END ENCRYPTED PRIVATE KEY-----';
    const { text, redactions } = redactSecrets(`前置き\n${key}\n間の文\n${encrypted}\n後書き`);
    expect(text).not.toContain('MIIEowIBAAKCAQ');
    expect(text).not.toContain('AES-128-CBC');
    expect(text).toContain('前置き');
    expect(text).toContain('後書き');
    expect(redactions).toBe(2);
  });

  it('caps the text before it reaches any of the cleaning passes', () => {
    // 50MB の本文をそのまま正規表現に流すと、置換のたびに 50MB の文字列が
    // 作られる。どうせ MAX_INTAKE_TEXT_CHARS で切るのだから先に切る。
    // 中身も意地悪にして、切っていないことが時間に出るようにしておく。
    const huge = '-----BEGIN PRIVATE KEY-----ふつうの文章です。'.repeat(120_000); // 約 5MB
    expect(huge.length).toBeGreaterThan(MAX_INTAKE_TEXT_CHARS * 10);
    const started = Date.now();
    const result = normalizeIntakeText(huge);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(MAX_INTAKE_TEXT_CHARS + 32);
  });
});

// ---------------------------------------------------------------------------
// 11. 表示名のなりすまし
// ---------------------------------------------------------------------------

describe('display names cannot lie about what they are', () => {
  it('drops right-to-left overrides that fake an extension', () => {
    // `photo<U+202E>gnp.txt` は画面上 `phototxt.gnp` と読める。
    const shown = toDisplayFileName('photo‮gnp.txt');
    expect(shown).not.toContain('‮');
    expect(shown).toBe('photognp.txt');
  });

  it('drops zero-width characters', () => {
    expect(toDisplayFileName('re​port﻿.pdf')).toBe('report.pdf');
  });

  it('still keeps ordinary Japanese names intact', () => {
    expect(toDisplayFileName('現行構成 v2.pdf')).toBe('現行構成 v2.pdf');
  });
});

// ---------------------------------------------------------------------------
// 12. Origin の検査
// ---------------------------------------------------------------------------

describe('opaque origins are refused', () => {
  let port = 0;

  beforeEach(async () => {
    delete process.env.TOGAF_EAP_DASHBOARD_PORT;
    port = (await startDashboard('ja')).port;
  });

  afterEach(async () => {
    await stopDashboard();
  });

  it('refuses Origin: null (a sandboxed iframe can post from any site)', async () => {
    // sandbox 付き iframe や data: 文書は Origin を `null` で送る。外部ページが
    // `<iframe sandbox="allow-forms allow-scripts">` からフォームを投げるとこの形になり、
    // 通してしまうと預かり箱の全消しまで届く。
    const posted = await rawRequest(port, {
      method: 'POST',
      path: '/api/intake',
      headers: { origin: 'null', 'content-type': 'application/x-www-form-urlencoded' },
      body: 'text=from-a-sandboxed-iframe',
    });
    expect(posted.status).toBe(403);

    const cleared = await rawRequest(port, {
      method: 'POST',
      path: '/api/intake/clear',
      headers: { origin: 'null' },
    });
    expect(cleared.status).toBe(403);
  });

  it('still accepts the Start screen origin, and plain tools that send none', async () => {
    const withOrigin = await rawRequest(port, {
      method: 'POST',
      path: '/api/intake',
      headers: { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'text=from-the-start-screen',
    });
    expect(withOrigin.status).toBe(201);

    const withoutOrigin = await rawRequest(port, {
      method: 'POST',
      path: '/api/intake',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'text=from-curl',
    });
    expect(withoutOrigin.status).toBe(201);
  });
});

