/**
 * ライブダッシュボードの HTTP サーバー / Live dashboard HTTP server.
 *
 * node:http のみで実装(依存追加なし)。
 *   GET  /                  ダッシュボード HTML
 *   GET  /start             Start 画面(相談内容とファイルを預ける入口)
 *   GET  /api/state         現在のエンゲージメント JSON
 *   GET  /api/intake        預かり一覧 JSON
 *   POST /api/intake        預かりの投稿(multipart / JSON / urlencoded / text)
 *   POST /api/intake/clear  預かりの全消し
 *   POST /api/intake/delete 預かりの 1 件削除
 *   GET  /events            SSE。状態ファイル・預かりの変更を push する
 *   GET  /health            死活確認
 *
 * 状態ファイルは fs.watch で監視し、同一プロセス内の保存は storeEvents でも検知する。
 * 預かりの変更は intakeEvents で検知する。
 *
 * このサーバーは 127.0.0.1 にのみ bind する。Host が loopback でないリクエストと、
 * loopback 以外の Origin からの POST は拒否する(DNS リバインディング対策)。
 * 預かったファイルは**実行も展開もしない**。読むのは Claude 側の仕事。
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { watch, type FSWatcher } from 'node:fs';
import { existsSync, mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Lang } from '../knowledge/index.js';
import {
  ENGAGEMENTS_DIRNAME,
  getDataDir,
  getEngagementsDir,
  getStatePath,
  INDEX_FILENAME,
  loadEngagement,
  STATE_FILENAME,
  storeEvents,
} from '../engagement/store.js';
import { renderDashboardHtml } from './html.js';
import { renderStartHtml } from './startHtml.js';
import {
  addIntake,
  ALLOWED_INTAKE_EXTENSIONS,
  attachmentPathOf,
  clearIntake,
  countIntake,
  deleteIntake,
  detectContentType,
  extensionOf,
  getIntakeDir,
  getIntakeFilesDir,
  intakeEvents,
  isAllowedExtension,
  listIntake,
  MAX_INTAKE_FILE_BYTES,
  MAX_INTAKE_FILES_PER_POST,
  MAX_INTAKE_POST_BYTES,
  MAX_INTAKE_TEXT_CHARS,
  toDisplayFileName,
  type NewIntakeAttachment,
} from './intakeStore.js';

const HOST = '127.0.0.1';

interface RunningDashboard {
  server: Server;
  url: string;
  port: number;
  lang: Lang;
  clients: Set<ServerResponse>;
  /** データディレクトリと engagements/ を別々に監視する(recursive は環境依存のため使わない) */
  watchers: FSWatcher[];
  heartbeat: NodeJS.Timeout;
  onStoreChange: () => void;
  onIntakeChange: () => void;
}

let running: RunningDashboard | null = null;

/** SSE クライアント全員に更新を通知する。`kind` で何が変わったかを添える。 */
function broadcast(dash: RunningDashboard, kind: 'state' | 'intake' = 'state'): void {
  const payload = `data: ${JSON.stringify({ ts: Date.now(), kind })}\n\n`;
  for (const client of dash.clients) {
    try {
      client.write(payload);
    } catch {
      dash.clients.delete(client);
    }
  }
}

// ---------------------------------------------------------------------------
// リクエストの検査(loopback 限定)
// ---------------------------------------------------------------------------

/** loopback とみなすホスト名 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** `host:port` からホスト部分だけを取り出す(IPv6 の括弧も考慮) */
function hostNameOf(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('[')) {
    const close = trimmed.indexOf(']');
    return close < 0 ? trimmed : trimmed.slice(0, close + 1);
  }
  const colon = trimmed.lastIndexOf(':');
  return colon < 0 ? trimmed : trimmed.slice(0, colon);
}

/**
 * Host / Origin が loopback かを見る。
 *
 * 127.0.0.1 に bind していても、DNS リバインディングで外部ページから
 * このサーバーを叩かれる余地があるため、Host は必ず検査する。
 * Origin は付いているときだけ検査する(curl や fetch は付けないことがある)。
 *
 * `Origin: null` は**通す側に入れない**。素の curl は Origin を付けないので
 * 何も困らない一方、`Origin: null` を送ってくるのは sandbox 付き iframe や
 * data: 文書といった「出所を隠した」文脈で、外部のページが
 * `<iframe sandbox="allow-forms allow-scripts">` からフォームを投げると
 * この形になる。預かり箱の全消し(POST /api/intake/clear)まで届くので、
 * 素性の分からない Origin は拒否する。
 */
function isLocalRequest(req: IncomingMessage): boolean {
  const host = req.headers.host;
  if (typeof host !== 'string' || host.trim() === '') return false;
  if (!LOOPBACK_HOSTS.has(hostNameOf(host))) return false;

  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin !== '') {
    try {
      const parsed = new URL(origin);
      if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) return false;
    } catch {
      return false; // `null` を含む、URL として読めない Origin
    }
  }
  return true;
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

// ---------------------------------------------------------------------------
// リクエストボディ
// ---------------------------------------------------------------------------

/** 上限を超えても読み捨てる限界(ここを超えたら接続を切る) */
const HARD_DRAIN_BYTES = 4 * MAX_INTAKE_POST_BYTES;

type BodyResult =
  | { ok: true; buffer: Buffer }
  | { ok: false; reason: 'too-large' | 'aborted' };

/**
 * ボディを読む。上限を超えた場合は**読み捨ててから** 413 を返せるようにする。
 * (途中で接続を切るとクライアントが応答を受け取れないため、最後まで読み捨てる)
 */
function readBody(req: IncomingMessage, limit: number): Promise<BodyResult> {
  return new Promise<BodyResult>((resolvePromise) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let overflow = false;
    let settled = false;
    const finish = (result: BodyResult): void => {
      if (settled) return;
      settled = true;
      resolvePromise(result);
    };

    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (overflow) {
        // 既に上限超過。バッファには積まずに読み捨てる
        if (received > HARD_DRAIN_BYTES) {
          req.destroy();
          finish({ ok: false, reason: 'too-large' });
        }
        return;
      }
      if (received > limit) {
        overflow = true;
        chunks.length = 0; // 溜め込まない(メモリを食い潰さない)
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      finish(overflow ? { ok: false, reason: 'too-large' } : { ok: true, buffer: Buffer.concat(chunks) });
    });
    req.on('error', () => finish({ ok: false, reason: 'aborted' }));
    req.on('aborted', () => finish({ ok: false, reason: 'aborted' }));
  });
}

// ---------------------------------------------------------------------------
// multipart/form-data の自前パーサ(依存追加禁止のため)
// ---------------------------------------------------------------------------

/** 1 回の投稿で読むパートの上限(壊れた入力で無限ループしないための保険) */
const MAX_MULTIPART_PARTS = 60;

interface MultipartFile {
  fieldName: string;
  fileName: string;
  contentType: string;
  data: Buffer;
}

interface MultipartResult {
  fields: Map<string, string>;
  files: MultipartFile[];
}

/** Content-Type ヘッダから boundary を取り出す(引用符つきにも対応) */
function boundaryOf(contentType: string): string | null {
  const match = /;\s*boundary\s*=\s*(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const value = (match?.[1] ?? match?.[2] ?? '').trim();
  if (value.length === 0 || value.length > 200) return null;
  return value;
}

/** `name="..."` 形式のパラメータを取り出す(引用符なしの token にも対応) */
function headerParam(header: string, key: string): string | null {
  const quoted = new RegExp(`;\\s*${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'i').exec(header);
  if (quoted) return quoted[1].replace(/\\(.)/g, '$1');
  const bare = new RegExp(`;\\s*${key}\\s*=\\s*([^;\\s]+)`, 'i').exec(header);
  return bare ? bare[1] : null;
}

/**
 * RFC 5987 の `filename*=UTF-8''%E3%81%82...` を取り出す。
 * 日本語ファイル名はこの形か、素の UTF-8 バイト列で来る(どちらも扱う)。
 */
function extendedFileName(header: string): string | null {
  const match = /;\s*filename\*\s*=\s*([^;]+)/i.exec(header);
  if (!match) return null;
  const raw = match[1].trim().replace(/^"|"$/g, '');
  const parts = raw.split("'");
  const encoded = parts.length >= 3 ? parts.slice(2).join("'") : raw;
  let decoded: string;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  // `charset'lang'` を percent-encode して送ってくる実装もあるので、
  // デコード後にもう一度だけ前置きを落とす
  const after = decoded.split("'");
  if (after.length >= 3 && /^[A-Za-z0-9._-]*$/.test(after[0]) && /^[A-Za-z0-9._-]*$/.test(after[1])) {
    decoded = after.slice(2).join("'");
  }
  return decoded;
}

/**
 * multipart/form-data を解く。壊れていれば null(呼び出し元が 400 を返す)。
 *
 * ヘッダは UTF-8 として読む。ブラウザは非 ASCII のファイル名を素の UTF-8 で
 * 送るため、これで日本語ファイル名がそのまま取れる。
 */
export function parseMultipart(buffer: Buffer, boundary: string): MultipartResult | null {
  const marker = Buffer.from(`--${boundary}`, 'latin1');
  const delimiter = Buffer.from(`\r\n--${boundary}`, 'latin1');

  let position = buffer.indexOf(marker);
  if (position < 0) return null;
  position += marker.length;

  const fields = new Map<string, string>();
  const files: MultipartFile[] = [];

  for (let part = 0; part < MAX_MULTIPART_PARTS; part += 1) {
    // 終端マーカー `--boundary--`
    if (buffer.length >= position + 2 && buffer[position] === 0x2d && buffer[position + 1] === 0x2d) {
      return { fields, files };
    }
    // パート開始の CRLF
    const crlf = buffer.indexOf('\r\n', position, 'latin1');
    if (crlf < 0) return null;
    position = crlf + 2;

    const headerEnd = buffer.indexOf('\r\n\r\n', position, 'latin1');
    if (headerEnd < 0) return null;
    const headerText = buffer.subarray(position, headerEnd).toString('utf8');
    const bodyStart = headerEnd + 4;

    const next = buffer.indexOf(delimiter, bodyStart);
    if (next < 0) return null; // 境界が閉じていない = 壊れた入力
    const body = buffer.subarray(bodyStart, next);
    position = next + delimiter.length;

    const disposition = /^content-disposition\s*:\s*(.*)$/im.exec(headerText)?.[1] ?? '';
    const contentType = /^content-type\s*:\s*(.*)$/im.exec(headerText)?.[1]?.trim() ?? '';
    const fieldName = headerParam(`;${disposition}`, 'name') ?? '';
    const fileName = extendedFileName(`;${disposition}`) ?? headerParam(`;${disposition}`, 'filename');

    if (fileName !== null) {
      files.push({
        fieldName,
        fileName,
        contentType,
        data: Buffer.from(body), // subarray は元バッファを参照するのでコピーする
      });
    } else if (fieldName !== '') {
      fields.set(fieldName, body.toString('utf8'));
    }
  }
  // パートが多すぎる = 想定外の入力
  return null;
}

// ---------------------------------------------------------------------------
// 預かりの受け口
// ---------------------------------------------------------------------------

/** 中身が実行可能形式だったら、拡張子が何であれ受け取らない */
const EXECUTABLE_TYPES = new Set(['elf', 'exe', 'macho', 'script', 'gzip', 'bzip2', '7z', 'rar']);

interface IntakePayload {
  text: string;
  files: MultipartFile[];
}

/** POST /api/intake のボディを読み解く。読めなければ null。 */
function parseIntakePayload(contentType: string, buffer: Buffer): IntakePayload | null {
  const type = contentType.split(';')[0].trim().toLowerCase();

  if (type === 'multipart/form-data') {
    const boundary = boundaryOf(contentType);
    if (!boundary) return null;
    const parsed = parseMultipart(buffer, boundary);
    if (!parsed) return null;
    const text = parsed.fields.get('text') ?? parsed.fields.get('message') ?? parsed.fields.get('note') ?? '';
    // 名前だけで中身が空のファイル入力(未選択の <input type=file>)は落とす
    const files = parsed.files.filter((f) => f.data.length > 0 || f.fileName.trim() !== '');
    return { text, files };
  }

  if (type === 'application/json') {
    try {
      const parsed: unknown = JSON.parse(buffer.toString('utf8') || '{}');
      if (typeof parsed !== 'object' || parsed === null) return null;
      const value = parsed as Record<string, unknown>;
      const text = typeof value.text === 'string' ? value.text : typeof value.message === 'string' ? value.message : '';
      return { text, files: [] };
    } catch {
      return null;
    }
  }

  if (type === 'application/x-www-form-urlencoded') {
    const params = new URLSearchParams(buffer.toString('utf8'));
    return { text: params.get('text') ?? params.get('message') ?? '', files: [] };
  }

  if (type === 'text/plain' || type === '') {
    return { text: buffer.toString('utf8'), files: [] };
  }

  return null;
}

/**
 * 添付の絶対パスを添えた JSON(画面と Claude が場所を知るため)。
 *
 * 添付は `attachments` と `files` の両方の名前で返す。画面側の実装が
 * どちらの名前で読んでも「投げたのに一覧に出ない」にならないようにするため。
 */
function intakeListPayload(): unknown {
  const records = listIntake().map((record) => {
    const attachments = record.attachments.map((attachment) => ({
      ...attachment,
      path: attachmentPathOf(attachment),
    }));
    return { ...record, attachments, files: attachments };
  });
  return {
    ok: true,
    records,
    counts: countIntake(),
    intakeDir: getIntakeDir(),
    filesDir: getIntakeFilesDir(),
    allowedExtensions: [...ALLOWED_INTAKE_EXTENSIONS],
    limits: {
      maxFileBytes: MAX_INTAKE_FILE_BYTES,
      maxPostBytes: MAX_INTAKE_POST_BYTES,
      maxFilesPerPost: MAX_INTAKE_FILES_PER_POST,
      maxTextChars: MAX_INTAKE_TEXT_CHARS,
    },
  };
}

/** POST /api/intake */
async function handleIntakePost(dash: RunningDashboard, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req, MAX_INTAKE_POST_BYTES);
  if (!body.ok) {
    if (body.reason === 'aborted') return; // クライアントが切った。応答先が無い
    sendJson(res, 413, {
      ok: false,
      error: 'payload-too-large',
      message: {
        ja: `1 回の投稿は合計 ${Math.floor(MAX_INTAKE_POST_BYTES / (1024 * 1024))}MB までです。分けて投稿してください。`,
        en: `A single post is limited to ${Math.floor(MAX_INTAKE_POST_BYTES / (1024 * 1024))}MB. Please split it up.`,
      },
      limit: MAX_INTAKE_POST_BYTES,
    });
    return;
  }

  const payload = parseIntakePayload(String(req.headers['content-type'] ?? ''), body.buffer);
  if (!payload) {
    sendJson(res, 400, {
      ok: false,
      error: 'bad-request',
      message: {
        ja: '投稿の形式を読み取れませんでした(multipart が壊れているか、対応していない Content-Type です)。',
        en: 'Could not read the submission (broken multipart, or an unsupported Content-Type).',
      },
    });
    return;
  }

  if (payload.files.length > MAX_INTAKE_FILES_PER_POST) {
    sendJson(res, 413, {
      ok: false,
      error: 'too-many-files',
      message: {
        ja: `一度に預けられるファイルは ${MAX_INTAKE_FILES_PER_POST} 件までです。`,
        en: `At most ${MAX_INTAKE_FILES_PER_POST} files per submission.`,
      },
      limit: MAX_INTAKE_FILES_PER_POST,
    });
    return;
  }

  // --- 事前検査。1 件でも駄目なら何も保存しない(部分的に入って気付かないのを避ける) ---
  const tooLarge: { name: string; size: number }[] = [];
  const notAllowed: { name: string; ext: string; reason: string }[] = [];

  for (const file of payload.files) {
    const display = toDisplayFileName(file.fileName);
    if (file.data.length > MAX_INTAKE_FILE_BYTES) {
      tooLarge.push({ name: display, size: file.data.length });
      continue;
    }
    const ext = extensionOf(display);
    if (!isAllowedExtension(ext)) {
      notAllowed.push({ name: display, ext, reason: ext === '' ? 'no-extension' : 'extension-not-allowed' });
      continue;
    }
    const detected = detectContentType(file.data);
    if (detected !== null && EXECUTABLE_TYPES.has(detected)) {
      // 拡張子を偽った実行可能形式・アーカイブ。開かないので実害は無いが、そもそも預からない
      notAllowed.push({ name: display, ext, reason: `content-is-${detected}` });
    }
  }

  if (tooLarge.length > 0) {
    sendJson(res, 413, {
      ok: false,
      error: 'file-too-large',
      message: {
        ja: `1 ファイルは ${Math.floor(MAX_INTAKE_FILE_BYTES / (1024 * 1024))}MB までです。`,
        en: `Each file is limited to ${Math.floor(MAX_INTAKE_FILE_BYTES / (1024 * 1024))}MB.`,
      },
      limit: MAX_INTAKE_FILE_BYTES,
      files: tooLarge,
    });
    return;
  }

  if (notAllowed.length > 0) {
    sendJson(res, 415, {
      ok: false,
      error: 'unsupported-media-type',
      message: {
        ja: '受け取れない種類のファイルが含まれています。許可されている拡張子のみ預けられます。',
        en: 'The submission contains a file type that is not accepted. Only allowed extensions can be stored.',
      },
      allowedExtensions: [...ALLOWED_INTAKE_EXTENSIONS],
      files: notAllowed,
    });
    return;
  }

  const attachments: NewIntakeAttachment[] = payload.files.map((file) => ({
    originalName: file.fileName,
    data: file.data,
    declaredType: file.contentType,
  }));

  if (payload.text.trim().length === 0 && attachments.length === 0) {
    sendJson(res, 400, {
      ok: false,
      error: 'empty-submission',
      message: {
        ja: '相談内容かファイルのどちらかを入れてください。',
        en: 'Please enter a message or attach a file.',
      },
    });
    return;
  }

  try {
    // 通知は intakeStore の 'change' 経由で飛ぶ(ここで broadcast すると二重になる)
    const result = addIntake({ text: payload.text, attachments });
    const warnings = result.record.attachments
      .filter((a) => a.typeMismatch)
      .map((a) => ({
        file: a.originalName,
        kind: 'type-mismatch',
        detail: `${a.ext} but content looks like ${a.detectedType ?? 'unknown'}`,
      }));
    sendJson(res, 201, {
      ok: true,
      record: {
        ...result.record,
        attachments: result.record.attachments.map((a) => ({ ...a, path: attachmentPathOf(a) })),
      },
      rejected: result.rejected,
      warnings,
      counts: countIntake(),
      nextStep: {
        ja: 'Claude Code で「スタート画面に入れたものを見て」と言ってください。',
        en: 'In Claude Code, say "look at what I put in the start screen".',
      },
    });
  } catch {
    // ここに来るのは保存に失敗したときだけ。**詳細は返さない。**
    // fs のエラーメッセージには絶対パスがそのまま入る(`EACCES: ... '/Users/…'`)。
    // 画面はローカルとはいえ、断る側の応答に環境の中身を書かない。
    sendJson(res, 500, {
      ok: false,
      error: 'store-failed',
      message: {
        ja: '預かりの保存に失敗しました。データディレクトリの権限を確認してください。',
        en: 'Failed to store the submission. Check the permissions of the data directory.',
      },
    });
  }
}

/** POST /api/intake/delete */
async function handleIntakeDelete(dash: RunningDashboard, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req, 64 * 1024);
  if (!body.ok) {
    if (body.reason === 'aborted') return;
    sendJson(res, 413, { ok: false, error: 'payload-too-large' });
    return;
  }
  let id = '';
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  try {
    if (type === 'application/json') {
      const parsed: unknown = JSON.parse(body.buffer.toString('utf8') || '{}');
      if (typeof parsed === 'object' && parsed !== null) {
        const value = (parsed as Record<string, unknown>).id;
        if (typeof value === 'string') id = value;
      }
    } else {
      id = new URLSearchParams(body.buffer.toString('utf8')).get('id') ?? '';
    }
  } catch {
    id = '';
  }
  if (id.trim() === '') {
    sendJson(res, 400, { ok: false, error: 'missing-id' });
    return;
  }
  const removed = deleteIntake(id.trim());
  if (!removed) {
    sendJson(res, 404, { ok: false, error: 'not-found' });
    return;
  }
  sendJson(res, 200, { ok: true, counts: countIntake() });
}

// ---------------------------------------------------------------------------
// Start 画面
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Start 画面の描画が転んだときの最小の入口。
 *
 * 画面本体は `./startHtml.ts`。そこが例外を投げても /start が真っ白に
 * ならないよう、預ける手段と合言葉だけを持つ素朴な HTML を返す。
 * 自己完結(CDN 参照なし)・XSS 対策済み・ダークモード対応。
 */
function renderFallbackStartHtml(lang: Lang): string {
  const ja = lang !== 'en';
  const en = lang !== 'ja';
  const both = ja && en;
  const t = (jaText: string, enText: string): string =>
    escapeHtml(both ? `${jaText} / ${enText}` : ja ? jaText : enText);
  return `<!doctype html>
<html lang="${ja ? 'ja' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t('相談スタート', 'Consultation Start')}</title>
<style>
:root { color-scheme: light dark; }
body { margin:0; padding:1.5rem; font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif;
  line-height:1.6; max-width:44rem; margin-inline:auto; }
textarea { width:100%; min-height:8rem; box-sizing:border-box; font:inherit; }
.note { border-left:4px solid currentColor; padding:.4rem .8rem; opacity:.9; }
</style>
</head>
<body>
<h1>${t('相談スタート', 'Consultation Start')}</h1>
<p class="note"><strong>${t('預けたあとは Claude Code で「スタート画面に入れたものを見て」と言ってください。', 'After submitting, tell Claude Code: "look at what I put in the start screen".')}</strong></p>
<p>${t('この画面は預かるだけです。読んで判断するのは Claude です。', 'This screen only stores what you submit. Claude is the one that reads and decides.')}</p>
<form method="post" action="/api/intake" enctype="multipart/form-data">
  <p><textarea name="message" aria-label="${t('相談内容', 'Your question')}"></textarea></p>
  <p><input type="file" name="files" multiple></p>
  <p><button type="submit">${t('預ける', 'Submit')}</button></p>
</form>
<p><a href="/">${t('ダッシュボードへ', 'Go to the dashboard')}</a></p>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// ルーティング
// ---------------------------------------------------------------------------

function handleRequest(dash: RunningDashboard, req: IncomingMessage, res: ServerResponse): void {
  const url = (req.url ?? '/').split('?')[0];
  const method = (req.method ?? 'GET').toUpperCase();

  // Host / Origin が loopback でなければ何も返さない
  if (!isLocalRequest(req)) {
    sendJson(res, 403, { ok: false, error: 'forbidden-origin' });
    return;
  }

  if (method !== 'GET' && method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method-not-allowed' }, { allow: 'GET, POST' });
    return;
  }

  if (method === 'POST') {
    const run = (task: Promise<void>): void => {
      task.catch(() => {
        // ハンドラは例外を投げない。応答済みならそのまま、未応答なら 500 を返す
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'internal-error' });
        else res.end();
      });
    };
    if (url === '/api/intake') {
      run(handleIntakePost(dash, req, res));
      return;
    }
    if (url === '/api/intake/clear') {
      const removed = clearIntake();
      sendJson(res, 200, { ok: true, removed, counts: countIntake() });
      return;
    }
    if (url === '/api/intake/delete') {
      run(handleIntakeDelete(dash, req, res));
      return;
    }
    // POST を受け付けないパス
    sendJson(res, 404, { ok: false, error: 'not-found' });
    return;
  }

  if (url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, port: dash.port }));
    return;
  }

  if (url === '/api/state') {
    const engagement = loadEngagement();
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify({ engagement, statePath: getStatePath() }));
    return;
  }

  if (url === '/api/intake') {
    sendJson(res, 200, intakeListPayload());
    return;
  }

  if (url === '/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n');
    res.write(`data: ${JSON.stringify({ ts: Date.now(), initial: true })}\n\n`);
    dash.clients.add(res);
    req.on('close', () => {
      dash.clients.delete(res);
    });
    return;
  }

  if (url === '/start' || url === '/start.html') {
    let html: string;
    try {
      html = renderStartHtml(dash.lang);
    } catch {
      // 画面の描画で転んでもサーバーは落とさない。最低限の入口を返す
      html = renderFallbackStartHtml(dash.lang);
    }
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(html);
    return;
  }

  if (url === '/' || url === '/index.html') {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(renderDashboardHtml(dash.lang));
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
}

/**
 * OS 標準のコマンドでブラウザを開く(失敗しても致命的ではない)。
 *
 * `TOGAF_EAP_NO_BROWSER` が設定されていれば何もしない。
 * CI・ヘッドレス環境のほか、短命なプロセスから呼ぶ場合に必要:
 * サーバーはプロセス終了とともに落ちるため、開いたタブが
 * 「アクセスできません」になって残るだけになる。
 */
export function browserSuppressed(): boolean {
  const value = process.env.TOGAF_EAP_NO_BROWSER;
  return typeof value === 'string' && value.trim() !== '' && value !== '0' && value.toLowerCase() !== 'false';
}

export function openBrowser(url: string): boolean {
  if (browserSuppressed()) return false;
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  const args = platform === 'win32' ? ['', url] : [url];
  try {
    const child = spawn(command, args, {
      stdio: 'ignore',
      detached: true,
      shell: platform === 'win32',
    });
    child.on('error', () => {
      /* ブラウザが開けなくても URL は返す */
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export interface DashboardInfo {
  url: string;
  /** Start 画面(相談内容とファイルを預ける入口)の URL */
  startUrl: string;
  port: number;
  alreadyRunning: boolean;
  statePath: string;
}

/**
 * ダッシュボードサーバーを起動する。既に起動していれば既存の URL を返す。
 * ポートは環境変数 TOGAF_EAP_DASHBOARD_PORT、未指定なら空きポート自動割当。
 */
export async function startDashboard(lang: Lang = 'both'): Promise<DashboardInfo> {
  const statePath = getStatePath();

  if (running) {
    running.lang = lang;
    return {
      url: running.url,
      startUrl: `${running.url}start`,
      port: running.port,
      alreadyRunning: true,
      statePath,
    };
  }

  const envPort = Number.parseInt(process.env.TOGAF_EAP_DASHBOARD_PORT ?? '', 10);
  const port = Number.isFinite(envPort) && envPort >= 0 && envPort <= 65535 ? envPort : 0;

  const clients = new Set<ServerResponse>();
  const server = createServer();

  const dash: RunningDashboard = {
    server,
    url: '',
    port: 0,
    lang,
    clients,
    watchers: [],
    heartbeat: setInterval(() => {
      for (const client of clients) {
        try {
          client.write(': ping\n\n');
        } catch {
          clients.delete(client);
        }
      }
    }, 20000),
    onStoreChange: () => {
      /* 起動後に差し替える */
    },
    onIntakeChange: () => {
      /* 起動後に差し替える */
    },
  };

  dash.onStoreChange = () => broadcast(dash, 'state');
  dash.onIntakeChange = () => broadcast(dash, 'intake');
  server.on('request', (req, res) => {
    // 途中で切られたリクエストで落ちないようにする
    req.on('error', () => {
      /* 応答先が消えただけ */
    });
    res.on('error', () => {
      /* 同上 */
    });
    try {
      handleRequest(dash, req, res);
    } catch {
      // ルーティングで想定外の例外が出てもサーバーは落とさない
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'internal-error' }));
      } else {
        res.end();
      }
    }
  });
  // 壊れた HTTP リクエストでプロセスを落とさない
  server.on('clientError', (_error, socket) => {
    try {
      if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      else socket.destroy();
    } catch {
      /* 既に切断済み */
    }
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => {
      server.removeListener('error', reject);
      resolvePromise();
    });
  });

  const address = server.address() as AddressInfo;
  dash.port = address.port;
  dash.url = `http://${HOST}:${address.port}/`;

  // 同一プロセス内の保存・預かりの変更を購読
  storeEvents.on('change', dash.onStoreChange);
  intakeEvents.on('change', dash.onIntakeChange);

  // 外部からのファイル書き換えも監視する(ディレクトリ監視で rename にも追従)。
  // 保存レイアウトは <dataDir>/index.json と <dataDir>/engagements/<id>.json の 2 階層なので、
  // それぞれを監視する。fs.watch の recursive はプラットフォーム依存のため使わない。
  const dataDir = getDataDir();
  const engagementsDir = getEngagementsDir();
  let timer: NodeJS.Timeout | null = null;
  const notify = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => broadcast(dash), 80);
  };

  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    dash.watchers.push(
      watch(dataDir, (_event, filename) => {
        // 索引・旧レイアウトの状態ファイル・engagements ディレクトリ自体の変化を拾う
        if (
          filename &&
          filename !== INDEX_FILENAME &&
          filename !== STATE_FILENAME &&
          filename !== ENGAGEMENTS_DIRNAME
        ) {
          return;
        }
        notify();
      }),
    );
  } catch {
    // 監視できない環境でも、同一プロセスの更新は storeEvents で反映される
  }

  try {
    if (!existsSync(engagementsDir)) mkdirSync(engagementsDir, { recursive: true });
    dash.watchers.push(
      watch(engagementsDir, (_event, filename) => {
        // 書き込み途中の一時ファイルは無視する
        if (filename && filename.includes('.tmp-')) return;
        notify();
      }),
    );
  } catch {
    // 同上
  }

  // 預かり箱も監視する。別プロセスの MCP ツールが pending → done にした場合、
  // intakeEvents は届かないので、ファイルの変化で拾って画面へ push する。
  let intakeTimer: NodeJS.Timeout | null = null;
  try {
    const intakeDir = getIntakeDir();
    if (!existsSync(intakeDir)) mkdirSync(intakeDir, { recursive: true });
    dash.watchers.push(
      watch(intakeDir, (_event, filename) => {
        // 書き込み途中の一時ファイルは無視する
        if (filename && filename.includes('.tmp-')) return;
        if (intakeTimer) clearTimeout(intakeTimer);
        intakeTimer = setTimeout(() => broadcast(dash, 'intake'), 80);
      }),
    );
  } catch {
    // 監視できない環境でも、同一プロセスの更新は intakeEvents で反映される
  }

  running = dash;
  return {
    url: dash.url,
    startUrl: `${dash.url}start`,
    port: dash.port,
    alreadyRunning: false,
    statePath,
  };
}

/** 起動中のダッシュボード情報(未起動なら null) */
export function getDashboardInfo(): DashboardInfo | null {
  if (!running) return null;
  return {
    url: running.url,
    startUrl: `${running.url}start`,
    port: running.port,
    alreadyRunning: true,
    statePath: getStatePath(),
  };
}

/** ダッシュボードサーバーを停止する(主にテスト用) */
export async function stopDashboard(): Promise<void> {
  if (!running) return;
  const dash = running;
  running = null;
  storeEvents.removeListener('change', dash.onStoreChange);
  intakeEvents.removeListener('change', dash.onIntakeChange);
  clearInterval(dash.heartbeat);
  for (const watcher of dash.watchers) {
    try {
      watcher.close();
    } catch {
      /* 既に閉じている */
    }
  }
  dash.watchers.length = 0;
  for (const client of dash.clients) {
    try {
      client.end();
    } catch {
      /* 既に切断済み */
    }
  }
  dash.clients.clear();
  await new Promise<void>((resolvePromise) => {
    dash.server.close(() => resolvePromise());
  });
}
