/**
 * レポート・成果物のエクスポート / Report and deliverable export tools.
 *
 * 会話の中で組み立てた内容を、配布・印刷できるファイルとしてローカルに書き出す。
 * HTML は「その時点の状態を焼き込んだ」自己完結の静的ファイルで、
 * ライブダッシュボード(SSE)とは別物。外部ホストへの参照は一切作らない。
 */

import { existsSync, mkdirSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DELIVERABLES, findDeliverable, text, type Lang } from '../knowledge/index.js';
import { getDataDir, loadEngagement } from '../engagement/store.js';
import { renderDashboardMarkdown } from '../dashboard/markdown.js';
import { L, label } from '../dashboard/labels.js';
import { renderDeliverableTemplate } from './format.js';
import { errorResult, langSchema, msg, textResult, type ToolResult } from './common.js';

/** 書き出し先のサブディレクトリ名 */
const REPORT_DIR = 'reports';
const DELIVERABLE_DIR = 'deliverables';

/** 形式ごとに許可する拡張子(想定外のファイルを作らせないための歯止め) */
const ALLOWED_EXTENSIONS: Record<'markdown' | 'html', string[]> = {
  markdown: ['.md', '.markdown', '.txt'],
  html: ['.html', '.htm'],
};

// ---------------------------------------------------------------------------
// 小さなユーティリティ
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 見出しや項目名のような短いラベル用。
 * `msg` は both のとき改行で繋ぐため、1 行に収めたい箇所ではこちらを使う。
 */
function pair(ja: string, en: string, lang: Lang): string {
  return text({ ja, en }, lang);
}

/** ファイル名用のタイムスタンプ。withTime=false なら YYYYMMDD のみ */
function stamp(date: Date, withTime: boolean): string {
  const day = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
  return withTime ? `${day}-${pad2(date.getHours())}${pad2(date.getMinutes())}` : day;
}

/** 表示用の日時 "YYYY-MM-DD HH:mm" */
function formatDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * 案件名などをファイル名に使える形へ安全化する。
 * パス区切り・制御文字・OS の予約文字を落とし、`..` が残らないようにする。
 * 日本語はそのまま残す(macOS / Linux では問題なく、可読性が高い)。
 */
function safeFileStem(name: string, fallback: string): string {
  const cleaned = name
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-{2,}/g, '-')
    .replace(/^[.\-]+/, '')
    .replace(/[.\-]+$/, '')
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : fallback;
}

/** バイト数を読みやすく("12,345 bytes (12.1 KB)") */
function formatBytes(bytes: number): string {
  const grouped = bytes.toLocaleString('en-US');
  if (bytes < 1024) return `${grouped} bytes`;
  return `${grouped} bytes (${(bytes / 1024).toFixed(1)} KB)`;
}

/** OS ごとのファイルを開くコマンド */
function openCommand(path: string): string {
  const quoted = `"${path}"`;
  if (process.platform === 'darwin') return `open ${quoted}`;
  if (process.platform === 'win32') return `start "" ${quoted}`;
  return `xdg-open ${quoted}`;
}

// ---------------------------------------------------------------------------
// 書き込み先の検証(パストラバーサル対策)
// ---------------------------------------------------------------------------

function realpathIfExists(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * 存在する最も深い祖先だけ実パス化し、残りの区間を繋ぎ直す。
 * シンボリックリンクを経由して許可ディレクトリの外へ抜けるのを防ぐ。
 */
function resolveThroughSymlinks(absolutePath: string): string {
  const rest: string[] = [];
  let current = absolutePath;
  for (;;) {
    if (existsSync(current)) {
      const real = realpathIfExists(current);
      return rest.length > 0 ? join(real, ...rest.reverse()) : real;
    }
    const parent = dirname(current);
    if (parent === current) return absolutePath;
    rest.push(basename(current));
    current = parent;
  }
}

/** target が root の配下(root 自身は含まない)かどうか */
function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * 書き込みを許可するルート: 既定のデータディレクトリと現在の作業ディレクトリ。
 *
 * ファイルシステムのルート("/" や "C:\\")は候補から外す。
 * MCP サーバーは GUI クライアントから cwd="/" で起動されることがあり、
 * それを許可ルートにすると「配下かどうか」の検査が全ファイルを通してしまう。
 */
function allowedRoots(): string[] {
  const candidates: string[] = [getDataDir()];
  try {
    candidates.push(process.cwd());
  } catch {
    // cwd が削除済みなどで取得できない場合はデータディレクトリだけを使う
  }
  const roots: string[] = [];
  for (const candidate of candidates) {
    const root = realpathIfExists(resolve(candidate));
    if (dirname(root) === root) continue; // ファイルシステムのルートは広すぎる
    if (!roots.includes(root)) roots.push(root);
  }
  return roots;
}

type PathCheck = { ok: true; path: string } | { ok: false; reason: string };

/**
 * ユーザー指定の outputPath を検証する。
 * - `..` を含むパスは拒否
 * - 許可ルート(データディレクトリ / カレント作業ディレクトリ)の外は拒否
 * - ドットで始まる隠しディレクトリ・隠しファイルへの書き込みは拒否
 * - 形式に合わない拡張子は拒否
 */
function checkOutputPath(raw: string, format: 'markdown' | 'html', lang: Lang): PathCheck {
  const input = raw.trim();
  const roots = allowedRoots();
  const rootsText = roots.map((r) => `\`${r}\``).join(' / ');

  const deny = (ja: string, en: string): PathCheck => ({ ok: false, reason: msg(ja, en, lang) });

  if (roots.length === 0) {
    return deny(
      'outputPath を検証できる書き出し先がありません。TOGAF_EAP_DATA_DIR を設定するか、outputPath を省略してください。',
      'There is no directory available to validate outputPath against. Set TOGAF_EAP_DATA_DIR or omit outputPath.',
    );
  }
  if (input.length === 0) {
    return deny('outputPath が空です。', 'outputPath is empty.');
  }
  if (input.startsWith('~')) {
    return deny(
      '`~` から始まるパスは展開しません。絶対パスか、作業ディレクトリからの相対パスで指定してください。',
      'Paths starting with `~` are not expanded. Use an absolute path or a path relative to the working directory.',
    );
  }
  if (input.split(/[\\/]+/).includes('..')) {
    return deny(
      'パスに `..` を含めることはできません(パストラバーサル防止)。',
      'The path may not contain `..` (path traversal is blocked).',
    );
  }

  const absolute = resolveThroughSymlinks(resolve(input));
  const extension = extname(absolute).toLowerCase();
  const allowed = ALLOWED_EXTENSIONS[format];
  if (!allowed.includes(extension)) {
    return deny(
      `形式 ${format} で使える拡張子は ${allowed.join(', ')} です(指定: ${extension || '(なし)'})。`,
      `Format ${format} allows these extensions: ${allowed.join(', ')} (given: ${extension || '(none)'}).`,
    );
  }

  const root = roots.find((candidate) => isWithin(candidate, absolute));
  if (!root) {
    return deny(
      `書き出せるのは次のディレクトリ配下だけです: ${rootsText}。指定されたパス \`${absolute}\` はその外側です。`,
      `Writes are limited to these directories: ${rootsText}. The requested path \`${absolute}\` is outside them.`,
    );
  }

  const hidden = relative(root, absolute)
    .split(/[\\/]+/)
    .some((segment) => segment.startsWith('.'));
  if (hidden) {
    return deny(
      'ドットで始まるファイル・ディレクトリ(隠しファイル)への書き出しは許可していません。',
      'Writing into dot-prefixed (hidden) files or directories is not allowed.',
    );
  }

  return { ok: true, path: absolute };
}

/**
 * 既定の書き出し先が既に埋まっているときは連番を足す。
 * 既定名のタイムスタンプは分(レポート)・日(成果物)単位なので、
 * 同じ分・同じ日に 2 回書き出すと必ず衝突する。
 * ユーザーが場所を指定していない以上、黙って上書きするのも失敗するのも筋が悪いので、
 * 隣に新しいファイルを作る。
 */
function uniqueDefaultPath(path: string): string {
  if (!existsSync(path)) return path;
  const ext = extname(path);
  const stem = path.slice(0, path.length - ext.length);
  for (let n = 2; n <= 99; n += 1) {
    const candidate = `${stem}-${n}${ext}`;
    if (!existsSync(candidate)) return candidate;
  }
  return path;
}

/**
 * ファイルを書き出し、結果メッセージを組み立てる。
 * 既存ファイルは overwrite=true のときだけ上書きする。
 */
function writeExport(
  absolutePath: string,
  content: string,
  overwrite: boolean,
  lang: Lang,
  heading: { ja: string; en: string },
): ToolResult {
  let existedBefore = false;
  try {
    // throwIfNoEntry: false なので「無い」は undefined、権限エラー等だけが例外になる
    const info = statSync(absolutePath, { throwIfNoEntry: false });
    if (info) {
      existedBefore = true;
      if (info.isDirectory()) {
        return errorResult(
          msg(
            `\`${absolutePath}\` はディレクトリです。ファイル名まで指定してください。`,
            `\`${absolutePath}\` is a directory. Please give a file name.`,
            lang,
          ),
        );
      }
      if (!overwrite) {
        return errorResult(
          msg(
            `\`${absolutePath}\` は既に存在します。上書きするなら overwrite=true を指定してください(既定では上書きしません)。`,
            `\`${absolutePath}\` already exists. Pass overwrite=true to replace it (nothing is overwritten by default).`,
            lang,
          ),
        );
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return errorResult(
      msg(
        `書き出し先を確認できませんでした: ${detail}`,
        `Could not inspect the destination: ${detail}`,
        lang,
      ),
    );
  }

  try {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return errorResult(
      msg(`書き出しに失敗しました: ${detail}`, `Export failed: ${detail}`, lang),
    );
  }

  const bytes = Buffer.byteLength(content, 'utf8');
  const out: string[] = [];
  out.push(`# ${pair(heading.ja, heading.en, lang)}`);
  out.push('');
  out.push(`- ${pair('パス', 'Path', lang)}: \`${absolutePath}\``);
  out.push(`- ${pair('サイズ', 'Size', lang)}: ${formatBytes(bytes)}`);
  out.push(`- ${pair('開く', 'Open', lang)}: \`${openCommand(absolutePath)}\``);
  if (existedBefore) {
    out.push(`- ${pair('既存ファイルを上書きしました', 'An existing file was overwritten', lang)}`);
  }
  out.push('');
  return textResult(out.join('\n'));
}

// ---------------------------------------------------------------------------
// Markdown → HTML の簡易変換(この用途に必要な範囲だけ)
// ---------------------------------------------------------------------------

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** HTML への埋め込み前に必ず通す(XSS 対策) */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * インライン記法を変換する。
 * コードスパンを先に切り出し、その中では強調記法を解釈しない。
 * リンク記法は「外部ホストへの参照を作らない」方針からテキストのまま残す。
 */
function renderInline(raw: string): string {
  return raw
    .split(/(`[^`]+`)/g)
    .map((segment) => {
      if (segment.length >= 2 && segment.startsWith('`') && segment.endsWith('`')) {
        return `<code>${escapeHtml(segment.slice(1, -1))}</code>`;
      }
      let s = escapeHtml(segment);
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
      s = s.replace(/(^|\s)_([^_\s][^_]*)_(?=$|[\s.,;:!?)])/g, '$1<em>$2</em>');
      return s;
    })
    .join('');
}

/** 表の 1 行をセルに分解する(`\|` はエスケープされたパイプとして扱う) */
function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const cells: string[] = [];
  let current = '';
  let endedWithPipe = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    if (char === '\\' && trimmed[i + 1] === '|') {
      current += '|';
      i += 1;
      endedWithPipe = false;
      continue;
    }
    if (char === '|') {
      cells.push(current);
      current = '';
      endedWithPipe = true;
      continue;
    }
    current += char;
    endedWithPipe = false;
  }
  cells.push(current);
  if (trimmed.startsWith('|')) cells.shift();
  if (endedWithPipe) cells.pop();
  return cells.map((cell) => cell.trim());
}

/** `| --- | :-: |` のような区切り行か */
function isAlignmentRow(line: string | undefined): boolean {
  if (!line || !line.includes('|')) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell));
}

/** 区切り行から各列の寄せを決める */
function alignmentOf(cell: string): '' | ' class="c"' | ' class="r"' {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return ' class="c"';
  if (right) return ' class="r"';
  return '';
}

type ListFrame = { indent: number; ordered: boolean; itemOpen: boolean };

/** 連続する箇条書き行をネスト付きのリストへ変換する */
function renderList(lines: string[]): string {
  const out: string[] = [];
  const stack: ListFrame[] = [];

  const closeItem = (frame: ListFrame): void => {
    if (frame.itemOpen) {
      out.push('</li>');
      frame.itemOpen = false;
    }
  };
  const closeTop = (): void => {
    const frame = stack.pop();
    if (!frame) return;
    closeItem(frame);
    out.push(frame.ordered ? '</ol>' : '</ul>');
  };

  for (const raw of lines) {
    const match = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(raw);
    if (!match) continue;
    const indent = match[1].replace(/\t/g, '  ').length;
    const ordered = !/^[-*+]$/.test(match[2]);
    const content = renderInline(match[3]);

    while (stack.length > 0 && indent < stack[stack.length - 1].indent) closeTop();

    // 同じ深さで種類(箇条書き / 番号付き)が変わったらリストを開き直す
    if (stack.length > 0) {
      const current = stack[stack.length - 1];
      if (indent === current.indent && current.ordered !== ordered) closeTop();
    }

    const top = stack.length > 0 ? stack[stack.length - 1] : undefined;
    if (!top || indent > top.indent) {
      // より深い階層: 直前の <li> を開いたまま入れ子にする
      out.push(ordered ? '<ol>' : '<ul>');
      stack.push({ indent, ordered, itemOpen: false });
    } else {
      closeItem(top);
    }

    const frame = stack[stack.length - 1];
    out.push(`<li>${content}`);
    frame.itemOpen = true;
  }

  while (stack.length > 0) closeTop();
  return out.join('\n');
}

/**
 * Markdown を HTML の本文へ変換する。
 * 見出し・表・箇条書き・引用・コード・水平線・段落を扱う簡易実装。
 * 入力は必ずエスケープしてから組み立てる。
 */
export function markdownToHtmlBody(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  const flushParagraph = (buffer: string[]): void => {
    if (buffer.length === 0) return;
    const html = buffer
      .map((line, index) => {
        const hardBreak = /\s{2,}$/.test(line) && index < buffer.length - 1;
        return renderInline(line.trim()) + (hardBreak ? '<br>' : '');
      })
      .join('\n');
    out.push(`<p>${html}</p>`);
    buffer.length = 0;
  };

  const paragraph: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 空行: 段落の切れ目
    if (trimmed.length === 0) {
      flushParagraph(paragraph);
      i += 1;
      continue;
    }

    // フェンス付きコードブロック
    const fence = /^```+\s*([A-Za-z0-9_+-]*)\s*$/.exec(trimmed);
    if (fence) {
      flushParagraph(paragraph);
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```+\s*$/.test(lines[i].trim())) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // 閉じフェンス
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    // 見出し
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph(paragraph);
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    // 水平線
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph(paragraph);
      out.push('<hr>');
      i += 1;
      continue;
    }

    // 表(次の行が区切り行のときだけ表として扱う)
    if (trimmed.includes('|') && isAlignmentRow(lines[i + 1])) {
      flushParagraph(paragraph);
      const headers = splitTableRow(trimmed);
      const aligns = splitTableRow(lines[i + 1]).map(alignmentOf);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim().length > 0) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      const head = headers
        .map((cell, index) => `<th${aligns[index] ?? ''}>${renderInline(cell)}</th>`)
        .join('');
      const body = rows
        .map((row) => {
          const cells = headers.map((_, index) => row[index] ?? '');
          return `<tr>${cells
            .map((cell, index) => `<td${aligns[index] ?? ''}>${renderInline(cell)}</td>`)
            .join('')}</tr>`;
        })
        .join('\n');
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table></div>`,
      );
      continue;
    }

    // 引用
    if (/^>\s?/.test(trimmed)) {
      flushParagraph(paragraph);
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoted.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${quoted.map((q) => renderInline(q)).join('<br>')}</blockquote>`);
      continue;
    }

    // 箇条書き / 番号付きリスト
    if (/^(\s*)([-*+]|\d+[.)])\s+/.test(line)) {
      flushParagraph(paragraph);
      const items: string[] = [];
      while (i < lines.length && /^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i]);
        i += 1;
      }
      out.push(renderList(items));
      continue;
    }

    paragraph.push(line);
    i += 1;
  }

  flushParagraph(paragraph);
  return out.join('\n');
}

/**
 * 静的な HTML 文書に組み上げる。
 * 外部 CSS / フォント / スクリプトを一切参照しない自己完結ファイル。
 * ライブダッシュボードと違い、fetch も SSE も行わない(その時点の状態を焼き込む)。
 */
export function buildStaticHtml(options: {
  title: string;
  bodyMarkdown: string;
  lang: Lang;
  subtitle?: string;
  printLabel: string;
}): string {
  const { title, bodyMarkdown, lang, subtitle, printLabel } = options;
  const htmlLang = lang === 'en' ? 'en' : 'ja';
  const body = markdownToHtmlBody(bodyMarkdown);

  return `<!doctype html>
<html lang="${htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="TOGAF 10 EAP MCP">
<title>${escapeHtml(title)}</title>
<style>
:root {
  --bg: #f5f6f8;
  --panel: #ffffff;
  --ink: #1c1f24;
  --muted: #6b7280;
  --line: #e2e5ea;
  --accent: #2f5d8a;
  --accent-soft: #e8f0f8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #15171b;
    --panel: #1e2126;
    --ink: #e6e8ec;
    --muted: #9aa3af;
    --line: #2e333a;
    --accent: #7aa9d6;
    --accent-soft: #223244;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 28px 20px 64px;
  background: var(--bg);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.7;
}
.sheet {
  max-width: 980px;
  margin: 0 auto;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 28px 32px 36px;
}
.toolbar { max-width: 980px; margin: 0 auto 12px; display: flex; justify-content: flex-end; gap: 10px; }
button {
  font: inherit; font-size: 12px; padding: 4px 12px; border-radius: 999px;
  border: 1px solid var(--line); background: var(--panel); color: var(--ink); cursor: pointer;
}
button:hover { border-color: var(--accent); color: var(--accent); }
h1 { font-size: 22px; margin: 0 0 14px; letter-spacing: .01em; }
h2 { font-size: 16px; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
h3 { font-size: 14px; margin: 20px 0 6px; }
h4, h5, h6 { font-size: 13px; margin: 16px 0 6px; }
p { margin: 0 0 10px; }
ul, ol { margin: 0 0 10px; padding-left: 22px; }
li { margin: 2px 0; }
li > ul, li > ol { margin: 2px 0; }
blockquote {
  margin: 0 0 12px; padding: 8px 14px;
  border-left: 3px solid var(--accent); background: var(--accent-soft);
  color: var(--muted); border-radius: 0 6px 6px 0;
}
hr { border: none; border-top: 1px solid var(--line); margin: 24px 0; }
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px; background: var(--accent-soft); color: var(--ink);
  padding: 1px 5px; border-radius: 4px;
}
pre {
  background: var(--accent-soft); border: 1px solid var(--line); border-radius: 8px;
  padding: 12px 14px; overflow-x: auto; margin: 0 0 12px;
}
pre code { background: none; padding: 0; }
.table-wrap { overflow-x: auto; margin: 0 0 14px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th {
  font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
  color: var(--muted); font-weight: 600; white-space: nowrap;
}
td.c, th.c { text-align: center; white-space: nowrap; }
td.r, th.r { text-align: right; white-space: nowrap; }
tr:last-child td { border-bottom: none; }
.subtitle { color: var(--muted); font-size: 12px; margin: -8px 0 18px; }
footer { max-width: 980px; margin: 18px auto 0; color: var(--muted); font-size: 12px; text-align: center; }
@media print {
  body { background: #fff; color: #000; padding: 0; font-size: 10.5pt; }
  .sheet { border: none; border-radius: 0; padding: 0; max-width: none; }
  .toolbar { display: none !important; }
  h2 { break-after: avoid; page-break-after: avoid; }
  table, blockquote, pre { break-inside: avoid; page-break-inside: avoid; }
  thead { display: table-header-group; }
  code, pre, blockquote { background: #f4f4f4 !important; color: #000 !important; }
  a { color: #000; text-decoration: none; }
  h1 { font-size: 16pt; }
}
</style>
</head>
<body>
<div class="toolbar"><button type="button" onclick="window.print()">${escapeHtml(printLabel)}</button></div>
<main class="sheet">
${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>\n` : ''}${body}
</main>
<footer>TOGAF 10 EAP MCP — ${escapeHtml(formatDateTime(new Date()))}</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// ツール登録
// ---------------------------------------------------------------------------

export function registerExportTools(server: McpServer): void {
  server.registerTool(
    'export_report',
    {
      title: 'Export the dashboard as a file',
      description:
        '現在の案件のダッシュボードを Markdown か自己完結の静的 HTML(印刷用 CSS 付き・外部参照なし)としてファイルに書き出し、絶対パス・サイズ・開き方を返す。 / Write the current engagement dashboard to a file as Markdown or a self-contained static HTML page (print CSS, no external references); returns the absolute path, size, and how to open it.',
      inputSchema: {
        format: z.enum(['markdown', 'html']).default('html').describe('出力形式 / Output format'),
        outputPath: z
          .string()
          .optional()
          .describe(
            '出力先。既定は <データディレクトリ>/reports/ 配下。データディレクトリか作業ディレクトリ配下のみ / Output path; defaults under <dataDir>/reports/. Data dir or cwd only.',
          ),
        overwrite: z.boolean().default(false).describe('既存ファイルを上書きする / Overwrite an existing file'),
        lang: langSchema,
      },
    },
    async ({ format, outputPath, overwrite, lang }) => {
      const l = lang as Lang;
      const engagement = loadEngagement();
      if (!engagement) {
        return errorResult(
          msg(
            'エンゲージメントが未作成のため書き出せません。`start_engagement` で開始してください。',
            'Nothing to export yet: no engagement exists. Start one with `start_engagement`.',
            l,
          ),
        );
      }

      // ファイルに書き出すものは全件。会話に載せる get_dashboard と違って
      // 長さの制約が無く、途中で切れた成果物を配ってしまうほうが害が大きい。
      const markdown = renderDashboardMarkdown(engagement, l, { compact: false });
      const content =
        format === 'markdown'
          ? markdown
          : buildStaticHtml({
              title: `${label(L.dashboard, l === 'both' ? 'ja' : l)} — ${engagement.name}`,
              bodyMarkdown: markdown,
              lang: l,
              subtitle: pair(
                `静的スナップショット(${formatDateTime(new Date())} 時点)`,
                `Static snapshot taken at ${formatDateTime(new Date())}`,
                l,
              ),
              printLabel: label(L.print, l),
            });

      let target: string;
      if (outputPath === undefined) {
        const extension = format === 'markdown' ? 'md' : 'html';
        const stem = safeFileStem(engagement.name, 'engagement');
        const base = join(getDataDir(), REPORT_DIR, `${stem}-${stamp(new Date(), true)}.${extension}`);
        // 場所を指定していないなら、同じ分に 2 回呼ばれても失敗させず別名で残す
        target = overwrite ? base : uniqueDefaultPath(base);
      } else {
        const checked = checkOutputPath(outputPath, format, l);
        if (!checked.ok) return errorResult(checked.reason);
        target = checked.path;
      }

      return writeExport(target, content, overwrite, l, {
        ja: 'レポートを書き出しました',
        en: 'Report exported',
      });
    },
  );

  server.registerTool(
    'export_deliverable',
    {
      title: 'Export a deliverable template to a file',
      description:
        '知識ベースの成果物の Markdown 雛形(節構成 + 記入の手引き)をファイルに書き出す。案件名は現在のエンゲージメントから自動で入る。 / Write the Markdown skeleton of a knowledge-base deliverable (sections plus guidance) to a file. The engagement name is filled in from the current engagement.',
      inputSchema: {
        deliverable: z.string().describe('成果物 ID または名称。例 "architecture-vision" / Deliverable id or name'),
        engagementName: z
          .string()
          .optional()
          .describe('見出しの案件名。既定は現在の案件 / Engagement name for the title'),
        outputPath: z
          .string()
          .optional()
          .describe(
            '出力先。既定は <データディレクトリ>/deliverables/ 配下。データディレクトリか作業ディレクトリ配下のみ / Output path; defaults under <dataDir>/deliverables/. Data dir or cwd only.',
          ),
        overwrite: z.boolean().default(false).describe('既存ファイルを上書きする / Overwrite an existing file'),
        lang: langSchema,
      },
    },
    async ({ deliverable, engagementName, outputPath, overwrite, lang }) => {
      const l = lang as Lang;
      const found = findDeliverable(deliverable);
      if (!found) {
        return errorResult(
          msg(
            `成果物「${deliverable}」が見つかりません。利用可能な ID: ${DELIVERABLES.map((d) => d.id).join(', ')}`,
            `Deliverable "${deliverable}" not found. Available ids: ${DELIVERABLES.map((d) => d.id).join(', ')}`,
            l,
          ),
        );
      }

      const name = engagementName ?? loadEngagement()?.name;
      // 案件が選択されていれば登録済みデータを雛形に流し込む
      // (Excel への手転記が残るという所見への対応。案件が無ければ従来どおり空の雛形)
      const content = renderDeliverableTemplate(found, l, name, loadEngagement());

      let target: string;
      if (outputPath === undefined) {
        const base = join(
          getDataDir(),
          DELIVERABLE_DIR,
          `${safeFileStem(found.id, 'deliverable')}-${stamp(new Date(), false)}.md`,
        );
        // 既定名は日付までなので、同じ日の 2 回目は上書きせず連番を足す
        target = overwrite ? base : uniqueDefaultPath(base);
      } else {
        const checked = checkOutputPath(outputPath, 'markdown', l);
        if (!checked.ok) return errorResult(checked.reason);
        target = checked.path;
      }

      return writeExport(target, content, overwrite, l, {
        ja: '成果物の雛形を書き出しました',
        en: 'Deliverable template exported',
      });
    },
  );

  server.registerTool(
    'list_exports',
    {
      title: 'List exported files',
      description:
        'これまでに書き出したレポート・成果物をパス・サイズ・更新日時付きで新しい順に一覧。 / List previously exported reports and deliverables with path, size, and mtime, newest first.',
      inputSchema: {
        limit: z.number().int().min(1).max(200).default(50).describe('最大件数 / Maximum files to list'),
        lang: langSchema,
      },
    },
    async ({ limit, lang }) => {
      const l = lang as Lang;
      const dataDir = getDataDir();
      const groups: { dir: string; heading: { ja: string; en: string } }[] = [
        { dir: join(dataDir, REPORT_DIR), heading: { ja: 'レポート', en: 'Reports' } },
        {
          dir: join(dataDir, DELIVERABLE_DIR),
          heading: { ja: '成果物の雛形', en: 'Deliverable templates' },
        },
      ];

      const out: string[] = [];
      out.push(`# ${pair('書き出し済みファイル', 'Exported files', l)}`);
      out.push('');
      out.push(`- ${pair('データディレクトリ', 'Data directory', l)}: \`${dataDir}\``);
      out.push('');

      let total = 0;
      for (const group of groups) {
        out.push(`## ${pair(group.heading.ja, group.heading.en, l)}`);
        out.push('');
        if (!existsSync(group.dir)) {
          out.push(pair('(まだありません)', '(none yet)', l));
          out.push('');
          continue;
        }

        // 読めないディレクトリや、列挙中に消えたファイルで落とさない
        let files: { name: string; size: number; mtime: Date }[];
        try {
          files = readdirSync(group.dir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
            .flatMap((entry) => {
              const info = statSync(join(group.dir, entry.name), { throwIfNoEntry: false });
              return info ? [{ name: entry.name, size: info.size, mtime: info.mtime }] : [];
            })
            .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
            .slice(0, limit);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          out.push(
            msg(`一覧を取得できませんでした: ${detail}`, `Could not list this directory: ${detail}`, l),
          );
          out.push('');
          continue;
        }

        if (files.length === 0) {
          out.push(pair('(まだありません)', '(none yet)', l));
          out.push('');
          continue;
        }

        total += files.length;
        out.push(
          `| ${pair('ファイル', 'File', l)} | ${pair('サイズ', 'Size', l)} | ${pair('更新日時', 'Modified', l)} |`,
        );
        out.push('| --- | ---: | --- |');
        for (const file of files) {
          out.push(
            `| \`${file.name}\` | ${file.size.toLocaleString('en-US')} B | ${formatDateTime(file.mtime)} |`,
          );
        }
        out.push('');
        out.push(`${pair('保存先', 'Location', l)}: \`${group.dir}\``);
        out.push('');
      }

      if (total === 0) {
        out.push(
          msg(
            'まだ何も書き出していません。`export_report` や `export_deliverable` を実行してください。',
            'Nothing has been exported yet. Try `export_report` or `export_deliverable`.',
            l,
          ),
        );
      } else {
        out.push(
          msg(
            '注: outputPath を指定して別の場所へ書き出したファイルはここには出ません。',
            'Note: files written elsewhere via an explicit outputPath are not listed here.',
            l,
          ),
        );
      }
      out.push('');
      return textResult(out.join('\n'));
    },
  );
}
