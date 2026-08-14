/**
 * Start 画面の預かり箱 / Intake box for the Start screen.
 *
 * ブラウザの Start 画面から投げられた「相談本文」と「添付ファイル」を預かるだけの層。
 * このサーバーには LLM が無いので、**中身を理解するのは Claude 側**。ここは
 *
 *   1. サーバーが決めた安全な名前でファイルを保存し
 *   2. 1 件 1 レコードの索引に記録し
 *   3. 未処理 / 処理済み(pending / done)の状態を持つ
 *
 * だけを行う。読む・判断するのは Claude の仕事。
 *
 * 保存レイアウト:
 *   <dataDir>/intake/index.json          … 索引(レコード配列)
 *   <dataDir>/intake/files/<storedName>  … 添付の実体
 *
 * 設計上の約束:
 *   - **元のファイル名を信用しない。** パスとしては一切使わず、表示用にだけ保持する。
 *     保存名はサーバーが `<recordId>-<n><ext>` の形で決める。
 *   - 拡張子は許可リスト方式。マジックバイトと食い違う場合は印を付けて保存する
 *     (保存はするが「怪しい」と分かるようにする。実行も展開もしない)。
 *   - 索引の書き込みは temp + rename で原子的に行う(store.ts の作法に合わせる)。
 *   - 資格情報らしき文字列は保存前に伏せる。画面にもログにも出さない。
 *   - この層は例外を投げない方針の呼び出し元(MCP ツール)から使われるが、
 *     入力が明らかに不正な場合のみ Error を投げる。呼び出し元で捕捉すること。
 *
 * `src/engagement/store.ts` とは意図的に独立させてある(あちらは案件本体の永続化)。
 */

import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { getDataDir } from '../engagement/store.js';

/** 預かりの追加・状態変更・削除で 'change' を発火する。ダッシュボードの SSE がこれを購読する。 */
export const intakeEvents = new EventEmitter();

/** 預かり箱のディレクトリ名 */
export const INTAKE_DIRNAME = 'intake';

/** 添付の実体を置くサブディレクトリ名 */
export const INTAKE_FILES_DIRNAME = 'files';

/** 索引ファイル名 */
export const INTAKE_INDEX_FILENAME = 'index.json';

/** 1 ファイルの上限(25MB) */
export const MAX_INTAKE_FILE_BYTES = 25 * 1024 * 1024;

/** 1 回の投稿の合計上限(50MB) */
export const MAX_INTAKE_POST_BYTES = 50 * 1024 * 1024;

/** 1 回の投稿で受け取る添付の最大件数 */
export const MAX_INTAKE_FILES_PER_POST = 20;

/** 相談本文の最大文字数(これを超えた分は切り詰めて印を付ける) */
export const MAX_INTAKE_TEXT_CHARS = 100_000;

/** 保持するレコードの最大件数(古いものから捨てる) */
export const MAX_INTAKE_RECORDS = 200;

/**
 * 受け取ってよい拡張子。許可リスト方式。
 * 実行可能形式・アーカイブは意図的に入れない(開かない・展開しない)。
 */
export const ALLOWED_INTAKE_EXTENSIONS = [
  '.pdf',
  '.txt',
  '.md',
  '.csv',
  '.tsv',
  '.json',
  '.html',
  '.htm',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.docx',
  '.xlsx',
  '.pptx',
] as const;

export type AllowedIntakeExtension = (typeof ALLOWED_INTAKE_EXTENSIONS)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_INTAKE_EXTENSIONS);

/** 添付 1 件 / One stored attachment. */
export interface IntakeAttachment {
  /** サーバーが決めた保存名(これだけがパスに使われる) */
  storedName: string;
  /** 表示用の元のファイル名(無害化済み。パスとしては使わない) */
  originalName: string;
  /** バイト数 */
  size: number;
  /** 小文字の拡張子(`.pdf` など) */
  ext: string;
  /** ブラウザが申告した種類(参考値。信用しない) */
  declaredType: string;
  /** マジックバイトから推定した種類(判定できなければ null) */
  detectedType: string | null;
  /** 拡張子と中身が食い違っている場合 true(保存はするが警告する) */
  typeMismatch: boolean;
}

/** 預かり 1 件 / One intake record. */
export interface IntakeRecord {
  id: string;
  /** 受付時刻(ISO8601) */
  receivedAt: string;
  /** 相談本文(資格情報を伏せ、制御文字を除いたもの) */
  text: string;
  /** 添付 */
  attachments: IntakeAttachment[];
  /** 未処理 / 処理済み */
  status: 'pending' | 'done';
  /** done にした時刻 */
  processedAt?: string;
  /** done にしたときのメモ(Claude 側が何をしたか) */
  note?: string;
  /** 本文が長すぎて切り詰めた場合 true */
  textTruncated?: boolean;
  /** 資格情報らしき文字列を伏せた件数 */
  redactions?: number;
}

interface IntakeIndexFile {
  version: 1;
  records: IntakeRecord[];
}

/** 件数の内訳 */
export interface IntakeCounts {
  total: number;
  pending: number;
  done: number;
}

// ---------------------------------------------------------------------------
// パス
// ---------------------------------------------------------------------------

/** 預かり箱のディレクトリ */
export function getIntakeDir(): string {
  return join(getDataDir(), INTAKE_DIRNAME);
}

/** 添付の実体を置くディレクトリ */
export function getIntakeFilesDir(): string {
  return join(getIntakeDir(), INTAKE_FILES_DIRNAME);
}

/** 索引ファイルのフルパス */
export function getIntakeIndexPath(): string {
  return join(getIntakeDir(), INTAKE_INDEX_FILENAME);
}

/** 保存名として安全か(英数と `.` `_` `-` のみ、`..` を含まない) */
function isSafeStoredName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.includes('..');
}

/**
 * 保存名から添付の絶対パスを作る。
 * 保存名がサーバーの規則に合わない場合は null(ディレクトリ外へは絶対に出さない)。
 */
export function getAttachmentPath(storedName: string): string | null {
  if (!isSafeStoredName(storedName)) return null;
  return join(getIntakeFilesDir(), storedName);
}

// ---------------------------------------------------------------------------
// 無害化
// ---------------------------------------------------------------------------

/**
 * 元のファイル名から表示用の名前を作る。
 *
 * - `/` `\` を含むパスは最後の要素だけを取る(`../../etc/passwd` → `passwd`)
 * - Windows のドライブレター・代替データストリーム(`:`)を除く
 * - 制御文字を除く
 * - **書字方向の上書き・ゼロ幅文字を除く**。`photo<U+202E>gnp.txt` は画面上
 *   `phototxt.gnp` と読める。拡張子を偽装して見せる古典なので、表示に使う名前
 *   からは落とす(保存名はそもそもサーバーが決めるので実害は表示だけ)
 * - 長すぎる名前は切り詰める
 *
 * ここで作った名前は**表示にしか使わない**。パスはサーバーが別に決める。
 */
export function toDisplayFileName(raw: string): string {
  const lastSegment = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = lastSegment
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    // 書字方向の上書き・ゼロ幅文字(拡張子の見た目を偽装できる)
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/[:*?"<>|]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  const name = cleaned.length > 0 ? cleaned : 'unnamed';
  return name.length > 120 ? `${name.slice(0, 110)}…${name.slice(-8)}` : name;
}

/** 小文字の拡張子を取り出す(無ければ空文字) */
export function extensionOf(fileName: string): string {
  const name = toDisplayFileName(fileName);
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  const ext = name.slice(dot).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

/** 許可された拡張子か */
export function isAllowedExtension(ext: string): boolean {
  return ALLOWED_SET.has(ext.toLowerCase());
}

/** PEM ブロックの開始行(長さを固定した部分だけを正規表現で見る) */
const PEM_BEGIN = /-----BEGIN (?:[A-Z][A-Z ]{0,24})?PRIVATE KEY-----/g;

/**
 * PEM 秘密鍵ブロックを丸ごと伏せる。**正規表現ひとつで書いてはいけない。**
 *
 * `-----BEGIN …-----[\s\S]*?-----END …-----` の形は、END が無い BEGIN が
 * たくさん並ぶ入力で計算量が入力長の 2 乗になる(遅延量指定が毎回末尾まで
 * 伸びる)。実測で 1.3MB の本文が 13 秒、上限の 50MB なら数時間。node の
 * サーバーは単一スレッドなので、投稿 1 件でダッシュボード全体が固まる。
 *
 * そこで開始行だけを正規表現で見つけ、終了行は indexOf で探す。走査位置は
 * 必ず前へ進み、END が見つからなければそこで打ち切るので入力長に比例する。
 */
function redactPemBlocks(input: string): { text: string; count: number } {
  if (input.indexOf('-----BEGIN') < 0) return { text: input, count: 0 };
  let out = '';
  let cursor = 0;
  let count = 0;
  PEM_BEGIN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PEM_BEGIN.exec(input)) !== null) {
    const afterBegin = match.index + match[0].length;
    const endAt = input.indexOf('-----END', afterBegin);
    if (endAt < 0) break; // 閉じていない。これ以降に完結した鍵ブロックは無い
    const close = input.indexOf('-----', endAt + '-----END'.length);
    if (close < 0) break;
    const stop = close + 5;
    out += `${input.slice(cursor, match.index)}[REDACTED]`;
    cursor = stop;
    count += 1;
    PEM_BEGIN.lastIndex = stop;
  }
  return { text: out + input.slice(cursor), count };
}

/**
 * 資格情報らしき文字列を伏せる。
 *
 * 現場の資料には接続文字列や API キーが平然と混ざる。画面にもログにも
 * 出さないため、預かった時点で伏せる。過剰にならないよう保守的な形だけを見る。
 *
 * ここに正規表現を足すときは、**入力長に比例する形か**を必ず確かめること。
 * この関数は投稿されたテキストをそのまま食わせるので、遅い正規表現が 1 本
 * あるだけでサーバーを止められる(normalizeIntakeText で長さは頭打ちにしてある)。
 */
export function redactSecrets(input: string): { text: string; redactions: number } {
  let count = 0;
  const hit = (): string => {
    count += 1;
    return '[REDACTED]';
  };

  // PEM 秘密鍵ブロックまるごと(正規表現ではなく走査で消す。理由は redactPemBlocks 参照)
  const pem = redactPemBlocks(input);
  count += pem.count;
  let text = pem.text;
  // 各サービスのトークン形式
  text = text.replace(/\bAKIA[0-9A-Z]{16}\b/g, () => hit());
  text = text.replace(/\bASIA[0-9A-Z]{16}\b/g, () => hit());
  text = text.replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, () => hit());
  text = text.replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, () => hit());
  text = text.replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, () => hit());
  text = text.replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, () => hit());
  // JWT
  text = text.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, () => hit());
  // Authorization ヘッダ
  text = text.replace(/\b(Authorization\s*:\s*)(Bearer|Basic)\s+\S+/gi, (_m, head: string, scheme: string) => {
    count += 1;
    return `${head}${scheme} [REDACTED]`;
  });
  // key = value 形式(値が短い自然文は伏せない)
  text = text.replace(
    // 既に伏せた値([REDACTED])を二重に数えないよう除外する
    /\b(password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token|client[_-]?secret|パスワード)\b(\s*[:=]\s*)("?)(?!\[REDACTED\])([^\s"',;]{6,})\3/gi,
    (_m, key: string, sep: string, quote: string) => {
      count += 1;
      return `${key}${sep}${quote}[REDACTED]${quote}`;
    },
  );

  return { text, redactions: count };
}

/**
 * 預かる本文を整える。
 * 制御文字を落とし、資格情報を伏せ、長すぎる場合は切り詰める。
 *
 * **正規表現に食わせる前に長さを頭打ちにする。** 受け口は 1 投稿 50MB まで
 * 受けるので、素通しすると 50MB の文字列に対して十数本の置換が走り、
 * 単一スレッドのサーバーがその間まったく応答しなくなる。どうせ最後は
 * MAX_INTAKE_TEXT_CHARS で切るのだから、先に切ってから整える
 * (伏せ字で短くなる分の余裕を見て 2 倍まで残す)。
 */
export function normalizeIntakeText(raw: string): {
  text: string;
  truncated: boolean;
  redactions: number;
} {
  const hardLimit = MAX_INTAKE_TEXT_CHARS * 2;
  const overLimit = raw.length > hardLimit;
  const bounded = overLimit ? raw.slice(0, hardLimit) : raw;
  // タブと改行以外の制御文字を落とす(端末エスケープやゼロ幅文字での偽装を防ぐ)
  // eslint-disable-next-line no-control-regex
  const stripped = bounded.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  const { text: redacted, redactions } = redactSecrets(stripped);
  const truncated = overLimit || redacted.length > MAX_INTAKE_TEXT_CHARS;
  const text = truncated ? `${redacted.slice(0, MAX_INTAKE_TEXT_CHARS)}\n…(truncated)` : redacted;
  return { text: text.trim(), truncated, redactions };
}

// ---------------------------------------------------------------------------
// マジックバイト
// ---------------------------------------------------------------------------

/** 拡張子が属する「中身の系統」 */
type ContentFamily = 'pdf' | 'png' | 'jpeg' | 'gif' | 'webp' | 'zip' | 'text';

const EXT_FAMILY: Record<string, ContentFamily> = {
  '.pdf': 'pdf',
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.gif': 'gif',
  '.webp': 'webp',
  '.docx': 'zip',
  '.xlsx': 'zip',
  '.pptx': 'zip',
  '.txt': 'text',
  '.md': 'text',
  '.csv': 'text',
  '.tsv': 'text',
  '.json': 'text',
  '.html': 'text',
  '.htm': 'text',
};

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buffer[i] !== bytes[i]) return false;
  }
  return true;
}

/**
 * 先頭バイトから中身の種類を推定する。判定できなければ null。
 * ここで「実行可能形式」を見分けられることも重要(拡張子を偽った持ち込みの検出)。
 */
export function detectContentType(buffer: Buffer): string | null {
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return 'pdf'; // %PDF
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) return 'gif'; // GIF8
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    buffer.length >= 12 &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) return 'zip'; // docx/xlsx/pptx も zip
  if (startsWith(buffer, [0x50, 0x4b, 0x05, 0x06])) return 'zip'; // 空の zip
  if (startsWith(buffer, [0x7f, 0x45, 0x4c, 0x46])) return 'elf';
  if (startsWith(buffer, [0x4d, 0x5a])) return 'exe'; // MZ
  if (startsWith(buffer, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(buffer, [0xfe, 0xed, 0xfa, 0xcf])) {
    return 'macho';
  }
  if (startsWith(buffer, [0x23, 0x21])) return 'script'; // #!
  if (startsWith(buffer, [0x1f, 0x8b])) return 'gzip';
  if (startsWith(buffer, [0x42, 0x5a, 0x68])) return 'bzip2';
  if (startsWith(buffer, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return '7z';
  if (startsWith(buffer, [0x52, 0x61, 0x72, 0x21])) return 'rar';
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0])) return 'ole'; // 旧 doc/xls/ppt
  return null;
}

/** テキスト系として妥当か(NUL を含むものはテキストとみなさない) */
function looksLikeText(buffer: Buffer): boolean {
  const head = buffer.subarray(0, Math.min(buffer.length, 8192));
  return !head.includes(0x00);
}

/**
 * 拡張子と中身の食い違いを見る。
 * 戻り値の `detected` は推定した種類(判定不能なら null)。
 */
export function checkTypeMismatch(
  ext: string,
  buffer: Buffer,
): { detected: string | null; mismatch: boolean } {
  const family = EXT_FAMILY[ext.toLowerCase()];
  const detected = detectContentType(buffer);
  if (!family) return { detected, mismatch: false };

  if (family === 'text') {
    // テキスト系は署名が無いのが普通。既知のバイナリ署名 or NUL があれば食い違い。
    if (detected !== null) return { detected, mismatch: true };
    return { detected: looksLikeText(buffer) ? 'text' : 'binary', mismatch: !looksLikeText(buffer) };
  }
  if (detected === null) return { detected: null, mismatch: true };
  return { detected, mismatch: detected !== family };
}

// ---------------------------------------------------------------------------
// 索引の読み書き
// ---------------------------------------------------------------------------

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

/** 一時ファイルに書いてから rename する(読み手が壊れた JSON を掴まないように) */
function writeJsonAtomic(path: string, value: unknown): void {
  ensureDir(dirname(path));
  const tmp = `${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAttachment(raw: unknown): IntakeAttachment | null {
  if (!isRecord(raw)) return null;
  const storedName = typeof raw.storedName === 'string' ? raw.storedName : '';
  if (!isSafeStoredName(storedName)) return null;
  return {
    storedName,
    originalName:
      typeof raw.originalName === 'string' ? toDisplayFileName(raw.originalName) : storedName,
    size: typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : 0,
    ext: typeof raw.ext === 'string' ? raw.ext.toLowerCase() : '',
    declaredType: typeof raw.declaredType === 'string' ? raw.declaredType.slice(0, 100) : '',
    detectedType: typeof raw.detectedType === 'string' ? raw.detectedType : null,
    typeMismatch: raw.typeMismatch === true,
  };
}

function normalizeRecord(raw: unknown): IntakeRecord | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id : '';
  if (!isSafeStoredName(id)) return null;
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments.map(normalizeAttachment).filter((a): a is IntakeAttachment => a !== null)
    : [];
  const record: IntakeRecord = {
    id,
    receivedAt: typeof raw.receivedAt === 'string' ? raw.receivedAt : new Date(0).toISOString(),
    text: typeof raw.text === 'string' ? raw.text : '',
    attachments,
    status: raw.status === 'done' ? 'done' : 'pending',
  };
  if (typeof raw.processedAt === 'string') record.processedAt = raw.processedAt;
  if (typeof raw.note === 'string') record.note = raw.note;
  if (raw.textTruncated === true) record.textTruncated = true;
  if (typeof raw.redactions === 'number' && raw.redactions > 0) record.redactions = raw.redactions;
  return record;
}

/** 索引を読む。未作成・破損時は空(例外は投げない)。 */
function readIndex(): IntakeIndexFile {
  try {
    const path = getIntakeIndexPath();
    if (!existsSync(path)) return { version: 1, records: [] };
    const raw = readFileSync(path, 'utf8');
    if (raw.trim().length === 0) return { version: 1, records: [] };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.records)) return { version: 1, records: [] };
    const records = parsed.records
      .map(normalizeRecord)
      .filter((r): r is IntakeRecord => r !== null);
    return { version: 1, records };
  } catch {
    return { version: 1, records: [] };
  }
}

function writeIndex(index: IntakeIndexFile): void {
  // 新しい順に保つ
  index.records.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : a.receivedAt > b.receivedAt ? -1 : 0));
  writeJsonAtomic(getIntakeIndexPath(), index);
}

function emitChange(): void {
  intakeEvents.emit('change');
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/** 預かり一覧(新しい順)。`status` を渡すと絞り込む。 */
export function listIntake(status?: 'pending' | 'done'): IntakeRecord[] {
  const records = readIndex().records;
  return status ? records.filter((r) => r.status === status) : records;
}

/** 1 件取り出す(無ければ null) */
export function getIntake(id: string): IntakeRecord | null {
  return listIntake().find((r) => r.id === id) ?? null;
}

/** 件数の内訳 */
export function countIntake(): IntakeCounts {
  const records = readIndex().records;
  const pending = records.filter((r) => r.status === 'pending').length;
  return { total: records.length, pending, done: records.length - pending };
}

/** 添付の絶対パス(実体が無ければ null)。Claude がここを Read する。 */
export function attachmentPathOf(attachment: IntakeAttachment): string | null {
  const path = getAttachmentPath(attachment.storedName);
  if (!path || !existsSync(path)) return null;
  return path;
}

/** 新規添付の入力 */
export interface NewIntakeAttachment {
  /** ブラウザが申告したファイル名(信用しない) */
  originalName: string;
  /** 中身 */
  data: Buffer;
  /** ブラウザが申告した Content-Type(参考値) */
  declaredType?: string;
}

/** 添付が受け取れない理由 */
export interface IntakeRejection {
  originalName: string;
  reason: 'extension' | 'size' | 'empty';
  detail: string;
}

/** 追加の入力 */
export interface AddIntakeInput {
  text?: string;
  attachments?: NewIntakeAttachment[];
}

/** 追加の結果 */
export interface AddIntakeResult {
  record: IntakeRecord;
  /** 受け取れなかった添付(理由つき) */
  rejected: IntakeRejection[];
}

function newRecordId(): string {
  return `in-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

/**
 * 預かりを 1 件追加する。
 *
 * 保存名はサーバーが決める(`<recordId>-<n><ext>`)。元の名前は表示用にしか使わない。
 * 拡張子が許可外・サイズ超過の添付は保存せず `rejected` で返す。
 * 本文も添付も空の場合は Error を投げる(呼び出し元で捕捉すること)。
 */
export function addIntake(input: AddIntakeInput): AddIntakeResult {
  const normalized = normalizeIntakeText(input.text ?? '');
  const incoming = input.attachments ?? [];

  const id = newRecordId();
  const rejected: IntakeRejection[] = [];
  const accepted: { attachment: IntakeAttachment; data: Buffer }[] = [];

  let seq = 0;
  for (const item of incoming.slice(0, MAX_INTAKE_FILES_PER_POST)) {
    const display = toDisplayFileName(item.originalName);
    if (item.data.length === 0) {
      rejected.push({ originalName: display, reason: 'empty', detail: 'empty file' });
      continue;
    }
    if (item.data.length > MAX_INTAKE_FILE_BYTES) {
      rejected.push({
        originalName: display,
        reason: 'size',
        detail: `${item.data.length} bytes > ${MAX_INTAKE_FILE_BYTES}`,
      });
      continue;
    }
    const ext = extensionOf(display);
    if (!isAllowedExtension(ext)) {
      rejected.push({
        originalName: display,
        reason: 'extension',
        detail: ext === '' ? 'no extension' : `${ext} is not allowed`,
      });
      continue;
    }
    seq += 1;
    const { detected, mismatch } = checkTypeMismatch(ext, item.data);
    accepted.push({
      attachment: {
        storedName: `${id}-${seq}${ext}`,
        originalName: display,
        size: item.data.length,
        ext,
        declaredType: (item.declaredType ?? '').slice(0, 100).replace(/[^\x20-\x7e]/g, ''),
        detectedType: detected,
        typeMismatch: mismatch,
      },
      data: item.data,
    });
  }

  if (normalized.text.length === 0 && accepted.length === 0) {
    throw new Error('nothing to store: text and attachments are both empty');
  }

  // 実体を書いてから索引を更新する(索引にあるのに実体が無い状態を避ける)
  const filesDir = getIntakeFilesDir();
  ensureDir(filesDir);
  for (const { attachment, data } of accepted) {
    const path = getAttachmentPath(attachment.storedName);
    if (!path) continue; // 保存名はサーバー生成なので通常起こらない
    writeFileSync(path, data, { mode: 0o600, flag: 'wx' });
  }

  const record: IntakeRecord = {
    id,
    receivedAt: new Date().toISOString(),
    text: normalized.text,
    attachments: accepted.map((a) => a.attachment),
    status: 'pending',
  };
  if (normalized.truncated) record.textTruncated = true;
  if (normalized.redactions > 0) record.redactions = normalized.redactions;

  const index = readIndex();
  index.records.unshift(record);
  // 古いものから捨てる(実体も消す)
  while (index.records.length > MAX_INTAKE_RECORDS) {
    const dropped = index.records.pop();
    if (dropped) removeAttachmentFiles(dropped);
  }
  writeIndex(index);
  emitChange();
  return { record, rejected };
}

function removeAttachmentFiles(record: IntakeRecord): void {
  for (const attachment of record.attachments) {
    const path = getAttachmentPath(attachment.storedName);
    if (!path) continue;
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      // 消せなくても続行する
    }
  }
}

function updateRecord(id: string, fn: (record: IntakeRecord) => IntakeRecord): IntakeRecord | null {
  const index = readIndex();
  const position = index.records.findIndex((r) => r.id === id);
  if (position < 0) return null;
  const next = fn(index.records[position]);
  index.records[position] = next;
  writeIndex(index);
  emitChange();
  return next;
}

/** 処理済みにする。存在しない ID なら null。 */
export function markIntakeDone(id: string, note?: string): IntakeRecord | null {
  return updateRecord(id, (record) => {
    const next: IntakeRecord = { ...record, status: 'done', processedAt: new Date().toISOString() };
    const trimmed = (note ?? '').trim();
    if (trimmed.length > 0) next.note = redactSecrets(trimmed).text.slice(0, 500);
    return next;
  });
}

/** 未処理に戻す。存在しない ID なら null。 */
export function markIntakePending(id: string): IntakeRecord | null {
  return updateRecord(id, (record) => {
    const next: IntakeRecord = { ...record, status: 'pending' };
    delete next.processedAt;
    return next;
  });
}

/** 1 件消す(添付の実体も消す)。存在しない ID なら false。 */
export function deleteIntake(id: string): boolean {
  const index = readIndex();
  const target = index.records.find((r) => r.id === id);
  if (!target) return false;
  removeAttachmentFiles(target);
  writeIndex({ version: 1, records: index.records.filter((r) => r.id !== id) });
  emitChange();
  return true;
}

/** 全部消す。消した件数を返す。 */
export function clearIntake(): number {
  const index = readIndex();
  const removed = index.records.length;
  for (const record of index.records) removeAttachmentFiles(record);

  // 索引に載っていない孤児ファイルも掃除する(異常終了で残ったもの)
  try {
    const dir = getIntakeFilesDir();
    if (existsSync(dir)) {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        try {
          if (statSync(path).isFile()) unlinkSync(path);
        } catch {
          // 消せなくても続行する
        }
      }
    }
  } catch {
    // ディレクトリが読めなくても続行する
  }

  writeIndex({ version: 1, records: [] });
  emitChange();
  return removed;
}

/** 預かり箱ごと消す(主にテスト用) */
export function removeIntakeDir(): void {
  try {
    rmSync(getIntakeDir(), { recursive: true, force: true });
  } catch {
    // 消せなくても続行する
  }
  emitChange();
}
