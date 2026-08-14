/**
 * Start 画面 / Start screen for intake.
 *
 * 相談内容とファイルを「預かる」ためだけの自己完結 HTML(外部 CDN 参照なし)。
 * 既存の HTML ダッシュボード(html.ts)と同じトークン・ダークモード・印刷 CSS を使う。
 *
 * 重要な前提:
 *   このサーバーには LLM が無い。ここで預かったものを読む・理解する・判断するのは
 *   Claude Code 側であり、この画面は「投げやすさ」だけを担当する。
 *   そのため画面には常に「Claude Code で『スタート画面に入れたものを見て』と言ってください」
 *   を出し、預かったものの 未処理 / 処理済み を明示する。
 *
 * ページ内 JS が使う HTTP 契約(サーバー側実装と合わせること):
 *   GET  /api/intake   -> { engagement, submissions[], limits? }
 *   POST /api/intake   <- multipart/form-data: message(テキスト) + files(複数)
 *                      -> { ok: true, id, fileCount } / 失敗時は非 2xx + { error }
 *   GET  /events       -> 既存の SSE。受信したら一覧を取り直す
 *
 * 受け取った JSON は「他人が書いた文字列」として扱い、必ずエスケープしてから DOM に入れる。
 */

import type { Bilingual, Lang } from '../knowledge/index.js';
import { L, label } from './labels.js';

/** 受け付ける拡張子(サーバー側の許可リストと揃える。画面は先出しの門前払い用) */
export const START_ALLOWED_EXTENSIONS: readonly string[] = [
  'pdf',
  'txt',
  'md',
  'csv',
  'tsv',
  'json',
  'html',
  'htm',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'docx',
  'xlsx',
  'pptx',
];

/** 1 ファイルの上限(25 MB) */
export const START_MAX_FILE_BYTES = 25 * 1024 * 1024;
/** 1 回の投稿の合計上限(50 MB) */
export const START_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
/** 1 回の投稿のファイル件数上限 */
export const START_MAX_FILES_PER_POST = 20;
/** 相談本文の上限文字数 */
export const START_MAX_MESSAGE_CHARS = 100000;

/** Claude Code に言ってもらう合言葉。これが画面でいちばん目立つ必要がある */
export const START_TRIGGER_PHRASE: Bilingual = {
  ja: 'スタート画面に入れたものを見て',
  en: 'look at what I put in the start screen',
};

/** この画面だけで使う文言 */
const S = {
  startTitle: { ja: '相談スタート', en: 'Start a consultation' },
  lead: {
    ja: '相談したいことと資料をここに預けてください。読んで分析するのは Claude Code 側です。',
    en: 'Drop your question and materials here. Claude Code is what reads and analyses them.',
  },
  messageLabel: { ja: '相談したいこと', en: 'What do you want to ask?' },
  placeholder: {
    ja: '基幹システムの刷新を検討中。予算は5億円、9月の経営会議で決裁を取りたい。何から手を付ければいい?',
    en: 'We are replacing our core system. Budget is 500M JPY and I need board approval in September. Where do I start?',
  },
  dropTitle: { ja: 'ファイル・画像をここにドロップ', en: 'Drop files or images here' },
  dropSub: {
    ja: 'クリックして選ぶ / スクリーンショットは ⌘V(Ctrl+V)で貼り付け',
    en: 'or click to choose — screenshots can be pasted with ⌘V / Ctrl+V',
  },
  allowed: { ja: '受け付ける形式', en: 'Accepted' },
  limits: { ja: '上限', en: 'Limits' },
  perFile: { ja: '1 ファイル', en: 'per file' },
  perPost: { ja: '1 回の投稿', en: 'per submission' },
  selected: { ja: '預ける予定', en: 'Ready to hand over' },
  total: { ja: '合計', en: 'Total' },
  remove: { ja: '取り消す', en: 'Remove' },
  submit: { ja: '預ける', en: 'Hand over' },
  submitting: { ja: '送信中…', en: 'Sending…' },
  rejected: { ja: '受け付けられなかったもの', en: 'Not accepted' },
  reasonExt: { ja: '対応していない形式です', en: 'Unsupported file type' },
  reasonSize: { ja: '1 ファイルの上限を超えています', en: 'Over the per-file limit' },
  reasonTotal: { ja: '合計の上限を超えるため外しました', en: 'Dropped: over the total limit' },
  reasonDup: { ja: '同じファイルが既に選ばれています', en: 'Already selected' },
  reasonEmpty: { ja: '中身が空です', en: 'Empty file' },
  reasonCount: { ja: '1 回に預けられる件数を超えています', en: 'Over the per-submission file count' },
  perPostFiles: { ja: '1 回の件数', en: 'files per submission' },
  serverRejected: { ja: 'サーバーが受け取らなかったもの', en: 'Rejected by the server' },
  mismatch: {
    ja: '⚠ 拡張子と中身が食い違っています',
    en: '⚠ Extension does not match the file content',
  },
  redacted: { ja: '資格情報らしき文字列を伏せました', en: 'Credential-like strings were masked' },
  truncated: { ja: '本文が長いため切り詰めました', en: 'Message was truncated' },
  claudeNote: { ja: 'Claude のメモ', en: 'Note from Claude' },
  needSomething: {
    ja: '相談文かファイルのどちらかを入れてください',
    en: 'Enter a message or attach at least one file',
  },
  tooLong: { ja: '本文が長すぎます', en: 'Message is too long' },
  received: { ja: '預かりました', en: 'Received' },
  pendingBanner: { ja: '未処理の預かりものがあります', en: 'Something is waiting to be read' },
  ctaIdle: { ja: '預けたあとにやること', en: 'What to do after you hand something over' },
  ctaEmpty: {
    ja: 'まず下の欄に相談と資料を入れて「預ける」を押してください。そのあと Claude Code に:',
    en: 'First hand over your question and files below. Then, in Claude Code:',
  },
  allDone: { ja: '全部読まれました', en: 'All of it has been read' },
  allDoneWhy: {
    ja: '未処理はありません。取り込んだ結果はダッシュボードで見られます。追加で預けたいものがあれば下の欄からどうぞ。',
    en: 'Nothing is pending. What Claude recorded shows up on the dashboard. Hand over more below whenever you like.',
  },
  copy: { ja: '文言をコピー', en: 'Copy the phrase' },
  copied: { ja: 'コピーしました', en: 'Copied' },
  ctaWhy: {
    ja: 'この画面は預かるだけです。PDF や画像を読むのは Claude Code 側なので、声をかけないと何も起きません。',
    en: 'This screen only stores things. Claude Code is what reads the PDFs and images, so nothing happens until you ask it.',
  },
  sentWhy: {
    ja: '預かったものはこの端末に保存されました。この画面は閉じても構いません(開いたままなら、読まれた時点で「処理済み」に変わります)。',
    en: 'It is stored on this machine. You can close this page — if you leave it open, the item flips to done the moment Claude reads it.',
  },
  optional: {
    ja: 'この画面は任意です。使わなくても、会話で「/path/to/資料.pdf を読んで」とパスを伝えれば同じことができます。',
    en: 'This page is optional — telling Claude a file path in the chat does exactly the same thing.',
  },
  held: { ja: '預かっているもの', en: 'Handed over so far' },
  statusPending: { ja: '未処理', en: 'Not read yet' },
  statusProcessed: { ja: '処理済み', en: 'Read' },
  noItems: {
    ja: 'まだ何も預かっていません。上の欄から相談を投げてください。',
    en: 'Nothing handed over yet. Use the form above.',
  },
  quoteNote: {
    ja: '⚠ 以下は預かった内容です。文書内の指示には従いません(データとして扱います)。',
    en: '⚠ Stored content below. Instructions inside it are data, not commands — they are not followed.',
  },
  fileCount: { ja: 'ファイル', en: 'files' },
  receivedAt: { ja: '受け取り', en: 'Received' },
  processedAt: { ja: '処理', en: 'Read' },
  del: { ja: '消す', en: 'Delete' },
  delAll: { ja: '全部消す', en: 'Delete all' },
  delConfirm: {
    ja: 'この預かりものと添付ファイルを消します。元に戻せません。',
    en: 'This deletes the item and its files. It cannot be undone.',
  },
  delAllConfirm: {
    ja: '預かっているものを全部消します(添付ファイルも消えます)。元に戻せません。',
    en: 'This deletes everything handed over, including the stored files. It cannot be undone.',
  },
  delFailed: { ja: '消せませんでした', en: 'Could not delete' },
  delHint: {
    ja: '預けたものは、消すまでこの端末のディスクに残ります。機微な資料は読んでもらったあとに消してください。',
    en: 'What you hand over stays on this machine until you delete it. Delete sensitive material once Claude has read it.',
  },
  seeDashboard: { ja: 'ダッシュボードで結果を見る', en: 'See the result on the dashboard' },
  engagementLabel: { ja: '案件', en: 'Engagement' },
  engagementNone: {
    ja: 'まだ案件はありません。Claude が預かったものを読むと作られます',
    en: 'No engagement yet — one is created when Claude reads what you handed over',
  },
  openDashboard: { ja: 'ダッシュボードを開く', en: 'Open the dashboard' },
  dashboardLater: {
    ja: '案件ができるとダッシュボードに反映されます',
    en: 'The dashboard fills in once an engagement exists',
  },
  sendFailed: { ja: '送信できませんでした', en: 'Could not send' },
  loadFailed: {
    ja: '一覧を取得できませんでした。サーバーが動いているか確認してください。',
    en: 'Could not load the list. Check that the server is running.',
  },
  masked: { ja: '(伏せ字)', en: '(masked)' },
  themeAuto: { ja: 'テーマ: 自動', en: 'Theme: Auto' },
  themeLight: { ja: 'テーマ: ライト', en: 'Theme: Light' },
  themeDark: { ja: 'テーマ: ダーク', en: 'Theme: Dark' },
  chars: { ja: '文字', en: 'chars' },
} satisfies Record<string, Bilingual>;

/** JSON をそのまま <script> に埋めても壊れないようにする */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');
}

/** HTML の静的部分に入れる文字列をエスケープする */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Start 画面の HTML を生成する / Render the intake start screen. */
export function renderStartHtml(lang: Lang = 'both'): string {
  const strings: Record<string, string> = {};
  for (const key of Object.keys(S) as (keyof typeof S)[]) strings[key] = label(S[key], lang);
  for (const key of ['none', 'live', 'reconnecting', 'dashboard', 'updatedAt'] as const) {
    strings[key] = label(L[key], lang);
  }
  strings.phrase = label(START_TRIGGER_PHRASE, lang);

  const data = {
    lang,
    strings,
    phrase: START_TRIGGER_PHRASE.ja,
    phraseEn: START_TRIGGER_PHRASE.en,
    limits: {
      maxFileBytes: START_MAX_FILE_BYTES,
      maxTotalBytes: START_MAX_TOTAL_BYTES,
      maxFilesPerPost: START_MAX_FILES_PER_POST,
      maxMessageChars: START_MAX_MESSAGE_CHARS,
      allowedExtensions: START_ALLOWED_EXTENSIONS,
    },
  };

  /* 合言葉は JS を切っていても読めるように静的にも置く(いちばん目立つ要素なので)。
     lang=both のときは 1 行に混ぜず、日本語と英語で 1 行ずつ出す。 */
  const jaLine =
    `<p class="say" id="ctaSay">Claude Code で <b id="ctaPhrase">${esc(START_TRIGGER_PHRASE.ja)}</b> と言ってください</p>`;
  const enLine =
    `<p class="say alt"${lang === 'en' ? ' id="ctaSay"' : ''}>In Claude Code, say <b${lang === 'en' ? ' id="ctaPhrase"' : ''}>${esc(START_TRIGGER_PHRASE.en)}</b></p>`;
  const ctaLines = lang === 'en' ? enLine : lang === 'ja' ? jaLine : `${jaLine}\n    ${enLine}`;

  return `<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'ja'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TOGAF 10 EAP — ${esc(strings.startTitle)}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23101c2e'/%3E%3Cg transform='rotate(-90 16 16)'%3E%3Ccircle cx='16' cy='16' r='11' fill='none' stroke='%23e8a52c' stroke-width='4.4' stroke-dasharray='15.3 53.8' stroke-dashoffset='0'/%3E%3Ccircle cx='16' cy='16' r='11' fill='none' stroke='%233f7fd6' stroke-width='4.4' stroke-dasharray='15.3 53.8' stroke-dashoffset='-17.3'/%3E%3Ccircle cx='16' cy='16' r='11' fill='none' stroke='%235f8fd2' stroke-width='4.4' stroke-dasharray='15.3 53.8' stroke-dashoffset='-34.6'/%3E%3Ccircle cx='16' cy='16' r='11' fill='none' stroke='%233ec9e0' stroke-width='4.4' stroke-dasharray='15.3 53.8' stroke-dashoffset='-51.9'/%3E%3C/g%3E%3Ccircle cx='16' cy='16' r='3' fill='%23f2f6fb'/%3E%3C/svg%3E">
<script>
/* 描画前にテーマを適用してちらつきを防ぐ(ダッシュボードと同じキーを使う) */
(function () {
  try {
    var t = localStorage.getItem('togaf-eap-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (err) { /* localStorage が使えない環境では OS 設定に従う */ }
})();
</script>
<style>
:root {
  --bg: #f5f6f8;
  --panel: #ffffff;
  --ink: #1c1f24;
  --muted: #6b7280;
  --line: #e2e5ea;
  --accent: #2f5d8a;
  --accent-soft: #e8f0f8;
  --on-accent: #ffffff;
  --ok: #2f7a54;
  --ok-soft: #e8f4ed;
  --warn: #b7791f;
  --crit: #a32b2b;
  --tint-low: #eef1f5;
  --radius: 10px;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #15171b;
    --panel: #1e2126;
    --ink: #e6e8ec;
    --muted: #9aa3af;
    --line: #2e333a;
    --accent: #7aa9d6;
    --accent-soft: #223244;
    --on-accent: #15171b;
    --ok: #6cc08b;
    --ok-soft: #1f2f27;
    --warn: #d9a441;
    --crit: #e06c6c;
    --tint-low: #23272d;
  }
}
:root[data-theme="dark"] {
  --bg: #15171b;
  --panel: #1e2126;
  --ink: #e6e8ec;
  --muted: #9aa3af;
  --line: #2e333a;
  --accent: #7aa9d6;
  --accent-soft: #223244;
  --on-accent: #15171b;
  --ok: #6cc08b;
  --ok-soft: #1f2f27;
  --warn: #d9a441;
  --crit: #e06c6c;
  --tint-low: #23272d;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 24px 20px 64px;
  background: var(--bg);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.65;
}
.wrap { max-width: 880px; margin: 0 auto; }
header.top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: .01em; }
.meta { color: var(--muted); font-size: 13px; }
.meta span + span::before { content: "·"; margin: 0 8px; }
.controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pill {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; padding: 3px 10px; border-radius: 999px;
  border: 1px solid var(--line); background: var(--panel); color: var(--muted);
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); }
.dot.off { background: var(--crit); }
button, .btn {
  font: inherit; font-size: 12px; padding: 4px 12px; border-radius: 999px;
  border: 1px solid var(--line); background: var(--panel); color: var(--ink);
  cursor: pointer; text-decoration: none; display: inline-block;
}
button:hover, .btn:hover { border-color: var(--accent); color: var(--accent); }
button:disabled { opacity: .55; cursor: default; }
button:disabled:hover { border-color: var(--line); color: var(--ink); }
button.primary {
  font-size: 14px; padding: 8px 22px; font-weight: 600;
  background: var(--accent); color: var(--on-accent); border-color: var(--accent);
}
button.primary:hover { background: var(--accent); color: var(--on-accent); opacity: .9; }
button.mini { padding: 2px 10px; font-size: 11px; color: var(--muted); }
section {
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 16px 18px; margin-top: 16px;
}
section > h2 { font-size: 15px; margin: 0 0 12px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
section > h2 .count { font-size: 12px; color: var(--muted); font-weight: 400; }
.lead { color: var(--muted); font-size: 13px; margin: 0 0 14px; }
.hint { color: var(--muted); font-size: 12px; margin: 6px 0 0; }
.empty { color: var(--muted); font-size: 13px; }
.hidden { display: none !important; }

/* --- 相談を書く欄 --- */
label.fld { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; font-weight: 600; }
textarea {
  width: 100%; min-height: 128px; resize: vertical;
  font: inherit; font-size: 14px; line-height: 1.6;
  padding: 11px 13px; border-radius: var(--radius);
  border: 1px solid var(--line); background: var(--bg); color: var(--ink);
}
textarea:focus { outline: none; border-color: var(--accent); }
.counter { font-size: 11px; color: var(--muted); text-align: right; margin-top: 4px; }
.counter.over { color: var(--crit); }

/* --- ドラッグ&ドロップ --- */
.drop {
  margin-top: 14px; padding: 22px 16px; text-align: center; cursor: pointer;
  border: 2px dashed var(--line); border-radius: var(--radius); background: var(--bg);
}
.drop:hover, .drop:focus-visible { border-color: var(--accent); outline: none; }
.drop.over { border-color: var(--accent); background: var(--accent-soft); }
.drop .dt { font-size: 14px; font-weight: 600; }
.drop .ds { font-size: 12px; color: var(--muted); }
.files { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 6px; }
.files li {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  border: 1px solid var(--line); border-radius: 8px; padding: 7px 11px; background: var(--bg);
}
.files .fname { flex: 1 1 200px; min-width: 0; overflow-wrap: anywhere; font-size: 13px; }
.files .fsz { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.files .fkind {
  font-size: 11px; padding: 1px 8px; border-radius: 999px;
  border: 1px solid var(--line); color: var(--muted); white-space: nowrap;
}
.files li.bad { border-color: var(--crit); }
.files li.bad .why { font-size: 12px; color: var(--crit); flex-basis: 100%; }
.actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 16px; }
.errline { color: var(--crit); font-size: 13px; margin: 10px 0 0; }
.prog { margin-top: 12px; }
.bar { height: 8px; border-radius: 999px; background: var(--line); overflow: hidden; }
.bar > i { display: block; height: 100%; width: 35%; border-radius: 999px; background: var(--accent); animation: slide 1.1s ease-in-out infinite; }
@keyframes slide { 0% { margin-left: -35%; } 100% { margin-left: 100%; } }
@media (prefers-reduced-motion: reduce) { .bar > i { animation: none; width: 100%; } }

/* --- 次の一手(画面でいちばん目立つ) --- */
section.cta { border: 2px solid var(--accent); background: var(--accent-soft); }
section.cta.done { border-color: var(--ok); background: var(--ok-soft); }
.cta .head { font-size: 15px; font-weight: 700; margin: 0 0 8px; color: var(--accent); }
.cta.done .head { color: var(--ok); }
.cta .say { font-size: 19px; line-height: 1.5; margin: 0; overflow-wrap: anywhere; }
.cta .say b {
  display: inline-block; padding: 2px 10px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--accent); font-size: 20px;
}
.cta .say.alt { font-size: 15px; margin-top: 6px; color: var(--muted); }
.cta .say.alt b { font-size: 15px; color: var(--ink); }
.cta .why { color: var(--muted); font-size: 12px; margin: 10px 0 0; }
.cta .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 12px; }

/* --- 預かっているものの一覧 --- */
.item { border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 14px; margin-top: 10px; }
.item.pending { border-left: 4px solid var(--warn); }
.item.processed { border-left: 4px solid var(--ok); background: var(--tint-low); }
.item .ih { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.tag { font-size: 11px; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--line); white-space: nowrap; }
.tag.pending { color: var(--warn); border-color: var(--warn); }
.tag.processed { color: var(--ok); border-color: var(--ok); }
.item .when { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.quote {
  margin: 0; padding: 9px 12px; border-left: 3px solid var(--line); background: var(--bg);
  border-radius: 0 8px 8px 0; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere;
  max-height: 15em; overflow: auto;
}
.qnote { font-size: 11px; color: var(--muted); margin: 6px 0 0; }
footer { margin-top: 24px; color: var(--muted); font-size: 12px; text-align: center; }

@media (max-width: 640px) {
  body { padding: 16px 12px 48px; }
  .cta .say { font-size: 17px; }
  .cta .say b { font-size: 18px; }
  .actions { gap: 10px; }
  button.primary { width: 100%; }
}
@media print {
  :root, :root:not([data-theme="light"]), :root[data-theme="dark"] {
    --bg: #ffffff; --panel: #ffffff; --ink: #000000; --muted: #555555; --line: #bbbbbb;
    --accent: #2f5d8a; --accent-soft: #e8f0f8; --on-accent: #ffffff;
    --ok: #2f7a54; --ok-soft: #eef6f1; --warn: #8a6414; --crit: #8f2323; --tint-low: #f0f2f5;
  }
  body { background: #fff; color: #000; padding: 0; font-size: 11pt; }
  .controls, .drop, .actions, .prog, form .counter { display: none !important; }
  section { border: 1px solid #ccc; break-inside: avoid; page-break-inside: avoid; margin-top: 10pt; }
  .item, .cta { break-inside: avoid; page-break-inside: avoid; }
  section.cta, .item.processed { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  a { color: #000; text-decoration: none; }
  h1 { font-size: 16pt; }
}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div>
      <h1 id="title">TOGAF 10 EAP — ${esc(strings.startTitle)}</h1>
      <div class="meta" id="meta"></div>
    </div>
    <div class="controls">
      <span class="pill"><span class="dot" id="dot"></span><span id="conn"></span></span>
      <button id="themeBtn" type="button"></button>
      <a class="btn" id="dashLink" href="/">${esc(strings.openDashboard)}</a>
    </div>
  </header>

  <!-- 次の一手。JS を切っていても読めるように文言は静的に置く -->
  <section class="cta" id="cta">
    <p class="head" id="ctaHead">${esc(strings.ctaEmpty)}</p>
    <div id="ctaSayWrap">
    ${ctaLines}
      <div class="row">
        <button id="copyBtn" type="button">${esc(strings.copy)}</button>
        <span class="hint" id="copyMsg"></span>
      </div>
    </div>
    <p class="why" id="ctaWhy">${esc(strings.ctaWhy)}</p>
    <div class="row hidden" id="ctaDoneRow">
      <a class="btn" id="ctaDashLink" href="/">${esc(strings.seeDashboard)}</a>
    </div>
  </section>

  <section id="formSec">
    <h2>${esc(strings.messageLabel)}</h2>
    <p class="lead">${esc(strings.lead)}</p>
    <label class="fld" for="message">${esc(strings.messageLabel)}</label>
    <textarea id="message" rows="6" maxlength="${START_MAX_MESSAGE_CHARS}"
      placeholder="${esc(strings.placeholder)}"></textarea>
    <div class="counter" id="counter"></div>

    <div class="drop" id="drop" tabindex="0" role="button" aria-describedby="dropHint">
      <div class="dt">${esc(strings.dropTitle)}</div>
      <div class="ds">${esc(strings.dropSub)}</div>
      <input type="file" id="fileInput" multiple class="hidden">
    </div>
    <p class="hint" id="dropHint"></p>

    <ul class="files" id="fileList"></ul>
    <ul class="files" id="rejectList"></ul>

    <div class="actions">
      <button class="primary" id="submitBtn" type="button">${esc(strings.submit)}</button>
      <span class="hint" id="sizeTotal"></span>
    </div>
    <p class="errline hidden" id="formError"></p>
    <div class="prog hidden" id="progress">
      <div class="bar"><i></i></div>
      <p class="hint" id="progText"></p>
    </div>
  </section>

  <section id="listSec">
    <h2>${esc(strings.held)}<span class="count" id="listCount"></span>
      <button id="clearBtn" type="button" class="mini hidden">${esc(strings.delAll)}</button>
    </h2>
    <p class="hint" id="delHint"></p>
    <p class="errline hidden" id="listError"></p>
    <div id="intakeList"></div>
  </section>

  <footer>
    <span id="foot"></span>
    <span> — TOGAF 10 EAP MCP</span>
  </footer>
</div>
<script>
(function () {
  var D = ${safeJson(data)};
  var S = D.strings;
  var limits = D.limits;

  var el = function (id) { return document.getElementById(id); };
  var messageEl = el('message');
  var dropEl = el('drop');
  var inputEl = el('fileInput');
  var listEl = el('fileList');
  var rejectEl = el('rejectList');
  var submitEl = el('submitBtn');
  var progEl = el('progress');
  var ctaEl = el('cta');
  var intakeEl = el('intakeList');

  /* 画面の状態 */
  var picked = [];          /* 投稿前に選ばれたファイル */
  var rejects = [];         /* その場で断ったもの(理由付き) */
  var submissions = [];     /* サーバーが預かっているもの */
  var engagement = null;
  var sending = false;
  var justSent = false;

  /* --- 文字列の扱い: 受け取った値は必ずエスケープしてから DOM に入れる --- */
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 資格情報らしき文字列は画面に出さない(サーバー側でも伏せるが、二重に守る) */
  var SECRET_PATTERNS = [
    /\\bAKIA[0-9A-Z]{12,}\\b/g,
    /\\bASIA[0-9A-Z]{12,}\\b/g,
    /\\bgh[pousr]_[A-Za-z0-9]{20,}\\b/g,
    /\\bxox[abprs]-[A-Za-z0-9-]{10,}\\b/g,
    /\\bsk-[A-Za-z0-9_-]{16,}\\b/g,
    /((?:password|passwd|secret|token|api[_-]?key|authorization)\\s*[:=]\\s*)(\\S{6,})/gi
  ];
  /* PEM 鍵ブロックは正規表現で囲まない。\`-----BEGIN …[\\s\\S]*?…-----END\` の形は
     END の無い BEGIN が並ぶ本文で計算量が長さの 2 乗になり、描画のたびに
     タブが固まる(最大 200 件 × 10 万字を毎回なぞる)。開始を探して終了を
     indexOf で見つける走査なら長さに比例する。サーバー側の redactPemBlocks と同じ考え方。 */
  var PEM_BEGIN = /-----BEGIN (?:[A-Z][A-Z ]{0,24})?PRIVATE KEY-----/g;
  function maskPem(text) {
    if (text.indexOf('-----BEGIN') < 0) return text;
    var out = '', cursor = 0, m;
    PEM_BEGIN.lastIndex = 0;
    while ((m = PEM_BEGIN.exec(text)) !== null) {
      var endAt = text.indexOf('-----END', m.index + m[0].length);
      if (endAt < 0) break;
      var close = text.indexOf('-----', endAt + 8);
      if (close < 0) break;
      out += text.slice(cursor, m.index) + S.masked;
      cursor = close + 5;
      PEM_BEGIN.lastIndex = cursor;
    }
    return out + text.slice(cursor);
  }
  function mask(text) {
    var out = maskPem(String(text === null || text === undefined ? '' : text));
    for (var i = 0; i < SECRET_PATTERNS.length; i++) {
      out = out.replace(SECRET_PATTERNS[i], function (m, p1) {
        return (typeof p1 === 'string' ? p1 : '') + S.masked;
      });
    }
    return out;
  }
  /* サーバーの返す message は { ja, en } の場合がある(日英併記の方針) */
  function serverMessage(j, httpStatus) {
    var m = j && j.message;
    var out = '';
    if (m && typeof m === 'object') {
      out = D.lang === 'en' ? (m.en || m.ja || '') : D.lang === 'ja' ? (m.ja || m.en || '') : [m.ja, m.en].filter(Boolean).join(' / ');
    } else if (typeof m === 'string') {
      out = m;
    }
    if (!out) out = (j && j.error) ? String(j.error) : '';
    if (j && j.files && j.files.length) {
      out += ' — ' + j.files.map(function (f) { return String(f.name || f.file || '?'); }).join(', ');
    }
    return out || (S.sendFailed + ' (HTTP ' + httpStatus + ')');
  }
  function bytes(n) {
    var v = Number(n);
    if (!isFinite(v) || v < 0) return '';
    if (v < 1024) return v + ' B';
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
    return (v / 1024 / 1024).toFixed(1) + ' MB';
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || '');
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function extOf(name) {
    var m = String(name || '').toLowerCase().match(/\\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  /* --- 選んだファイルの検査(サーバーでも同じことをするが、待たせないためここでも断る) --- */
  function totalBytes(list) {
    var sum = 0;
    for (var i = 0; i < list.length; i++) sum += list[i].size || 0;
    return sum;
  }
  function addFiles(files) {
    rejects = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var ext = extOf(f.name);
      var why = null;
      if (limits.allowedExtensions.indexOf(ext) < 0) why = S.reasonExt + ' (.' + (ext || '?') + ')';
      else if (!f.size) why = S.reasonEmpty;
      else if (f.size > limits.maxFileBytes) why = S.reasonSize + ' (' + bytes(f.size) + ')';
      else if (isDuplicate(f)) why = S.reasonDup;
      else if (picked.length >= limits.maxFilesPerPost) why = S.reasonCount + ' (' + limits.maxFilesPerPost + ')';
      else if (totalBytes(picked) + f.size > limits.maxTotalBytes) why = S.reasonTotal;
      if (why) rejects.push({ name: f.name, size: f.size, why: S.rejected + ': ' + why });
      else picked.push(f);
    }
    renderFiles();
  }
  function isDuplicate(f) {
    for (var i = 0; i < picked.length; i++) {
      if (picked[i].name === f.name && picked[i].size === f.size) return true;
    }
    return false;
  }
  function removeAt(index) {
    picked.splice(index, 1);
    renderFiles();
  }

  function renderFiles() {
    var html = '';
    for (var i = 0; i < picked.length; i++) {
      var f = picked[i];
      html += '<li><span class="fname">' + esc(f.name) + '</span>'
        + '<span class="fkind">' + esc(extOf(f.name) || (f.type || '?')) + '</span>'
        + '<span class="fsz">' + esc(bytes(f.size)) + '</span>'
        + '<button type="button" class="mini" data-rm="' + i + '">' + esc(S.remove) + '</button></li>';
    }
    listEl.innerHTML = html;
    var buttons = listEl.querySelectorAll('[data-rm]');
    for (var b = 0; b < buttons.length; b++) {
      buttons[b].onclick = function (ev) {
        removeAt(parseInt(ev.currentTarget.getAttribute('data-rm'), 10));
      };
    }

    var rj = '';
    for (var k = 0; k < rejects.length; k++) {
      rj += '<li class="bad"><span class="fname">' + esc(rejects[k].name) + '</span>'
        + '<span class="fsz">' + esc(bytes(rejects[k].size)) + '</span>'
        + '<span class="why">' + esc(rejects[k].why) + '</span></li>';
    }
    rejectEl.innerHTML = rj;

    el('sizeTotal').textContent = picked.length
      ? S.selected + ': ' + picked.length + ' ' + S.fileCount + ' / ' + S.total + ' ' + bytes(totalBytes(picked))
      : '';
  }

  function renderCounter() {
    var n = messageEl.value.length;
    var c = el('counter');
    c.textContent = n + ' / ' + limits.maxMessageChars + ' ' + S.chars;
    c.className = 'counter' + (n > limits.maxMessageChars ? ' over' : '');
  }

  function showError(text) {
    var e = el('formError');
    if (!text) { e.className = 'errline hidden'; e.textContent = ''; return; }
    e.className = 'errline';
    e.textContent = text;
  }

  /* --- 次の一手のバナー(常に出す。合言葉が画面でいちばん目立つ必要がある) ---
     状態は 3 つ。「まだ何も預けていない」「未処理がある(=声をかける)」
     「全部読まれた(=ダッシュボードを見る)」。
     全部読まれたあとも合言葉を出しっぱなしにすると、言っても「未処理はありません」
     としか返らず行き止まりになるので、そのときだけ合言葉を引っ込めて次の行き先を出す。 */
  function renderCta() {
    var pending = 0;
    for (var i = 0; i < submissions.length; i++) if (submissions[i].status === 'pending') pending += 1;
    var allDone = submissions.length > 0 && pending === 0;

    ctaEl.className = 'cta' + (justSent || allDone ? ' done' : '');
    el('ctaSayWrap').className = allDone ? 'hidden' : '';
    el('ctaDoneRow').className = allDone ? 'row' : 'row hidden';
    el('ctaWhy').textContent = allDone ? S.allDoneWhy : justSent ? S.sentWhy : S.ctaWhy;

    if (allDone) {
      el('ctaHead').textContent = S.allDone;
    } else if (justSent) {
      el('ctaHead').textContent = S.received
        + (pending ? ' (' + S.statusPending + ': ' + pending + ')' : '');
    } else if (pending > 0) {
      el('ctaHead').textContent = S.pendingBanner + ' (' + pending + ')';
    } else {
      el('ctaHead').textContent = S.ctaEmpty;
    }
  }

  /* --- 預かっているものの一覧 --- */
  function renderList() {
    el('clearBtn').className = submissions.length ? 'mini' : 'mini hidden';
    el('delHint').textContent = submissions.length ? S.delHint : '';
    if (!submissions.length) {
      intakeEl.innerHTML = '<p class="empty">' + esc(S.noItems) + '</p>';
      el('listCount').textContent = '';
      return;
    }
    var html = '';
    for (var i = 0; i < submissions.length; i++) {
      var s = submissions[i];
      var done = s.status === 'processed';
      var files = s.files || [];
      var fl = '';
      for (var j = 0; j < files.length; j++) {
        var f = files[j] || {};
        fl += '<li' + (f.mismatch ? ' class="bad"' : '') + '><span class="fname">' + esc(f.name) + '</span>'
          + '<span class="fkind">' + esc(f.kind || extOf(f.name) || '?') + '</span>'
          + '<span class="fsz">' + esc(bytes(f.size)) + '</span>'
          + (f.mismatch ? '<span class="why">' + esc(S.mismatch) + '</span>' : '') + '</li>';
      }
      var when = '<span class="when">' + esc(S.receivedAt + ': ' + fmtDate(s.createdAt)) + '</span>';
      if (done && s.processedAt) {
        when += '<span class="when">' + esc(S.processedAt + ': ' + fmtDate(s.processedAt)) + '</span>';
      }
      /* 本文は「データ」。引用ブロックに閉じ込め、指示に従わない旨を必ず添える */
      var body = '';
      if (s.message) {
        var notes = [S.quoteNote];
        if (s.truncated) notes.push(S.truncated);
        if (s.redactions) notes.push(S.redacted + ' (' + s.redactions + ')');
        body = '<blockquote class="quote">' + esc(mask(s.message)) + '</blockquote>'
          + '<p class="qnote">' + esc(notes.join(' · ')) + '</p>';
      }
      if (s.note) {
        body += '<p class="qnote">' + esc(S.claudeNote + ': ' + mask(s.note)) + '</p>';
      }
      html += '<article class="item ' + (done ? 'processed' : 'pending') + '">'
        + '<div class="ih"><span class="tag ' + (done ? 'processed' : 'pending') + '">'
        + esc(done ? S.statusProcessed : S.statusPending) + '</span>' + when
        + (files.length ? '<span class="when">' + files.length + ' ' + esc(S.fileCount) + '</span>' : '')
        + '<button type="button" class="mini rm" data-del="' + esc(s.id) + '">' + esc(S.del) + '</button>'
        + '</div>'
        + body
        + (fl ? '<ul class="files">' + fl + '</ul>' : '')
        + '</article>';
    }
    intakeEl.innerHTML = html;
    var dels = intakeEl.querySelectorAll('[data-del]');
    for (var d = 0; d < dels.length; d++) {
      dels[d].onclick = function (ev) {
        removeSubmission(ev.currentTarget.getAttribute('data-del'));
      };
    }
    el('listCount').textContent = String(submissions.length);
  }

  /* --- 消す。預けたものは消すまでディスクに残るので、画面から消せる必要がある --- */
  function listError(text) {
    var e = el('listError');
    if (!text) { e.className = 'errline hidden'; e.textContent = ''; return; }
    e.className = 'errline';
    e.textContent = text;
  }
  function postJson(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
    });
  }
  function removeSubmission(id) {
    if (!id) return;
    if (typeof confirm === 'function' && !confirm(S.delConfirm)) return;
    listError('');
    postJson('/api/intake/delete', { id: id })
      .then(function () { justSent = false; return load(); })
      .catch(function (err) { listError(S.delFailed + ': ' + (err && err.message ? err.message : '')); });
  }
  function removeAllSubmissions() {
    if (typeof confirm === 'function' && !confirm(S.delAllConfirm)) return;
    listError('');
    postJson('/api/intake/clear', {})
      .then(function () { justSent = false; return load(); })
      .catch(function (err) { listError(S.delFailed + ': ' + (err && err.message ? err.message : '')); });
  }

  function renderMeta() {
    var meta = el('meta');
    if (engagement && engagement.name) {
      meta.innerHTML = '<span>' + esc(S.engagementLabel) + ': ' + esc(engagement.name) + '</span>';
      el('dashLink').className = 'btn';
    } else {
      meta.innerHTML = '<span>' + esc(S.engagementNone) + '</span>';
      el('dashLink').className = 'btn';
      el('dashLink').title = S.dashboardLater;
    }
  }

  function renderAll() {
    renderMeta();
    renderCta();
    renderList();
  }

  /* --- サーバーとのやりとり ---
     サーバー側の JSON は records / attachments / status='done' という形。
     実装が入れ替わっても壊れないよう、別名も受け付ける。 */
  function normalizeFile(f) {
    if (!f) return { name: '', size: 0, kind: '', mismatch: false };
    return {
      name: f.originalName || f.name || f.storedName || '',
      size: f.size || 0,
      kind: String(f.ext || f.declaredType || f.type || '').replace(/^\\./, ''),
      mismatch: f.typeMismatch === true
    };
  }
  function normalizeRecord(s) {
    var done = s.status === 'done' || s.status === 'processed' || s.processed === true;
    return {
      id: s.id,
      status: done ? 'processed' : 'pending',
      createdAt: s.receivedAt || s.createdAt || '',
      processedAt: s.processedAt || null,
      message: typeof s.text === 'string' ? s.text : (s.message || ''),
      note: s.note || '',
      truncated: s.textTruncated === true,
      redactions: Number(s.redactions) || 0,
      files: (s.attachments || s.files || []).map(normalizeFile)
    };
  }
  function applyLimits(j) {
    var lim = j.limits || {};
    if (lim.maxFileBytes) limits.maxFileBytes = lim.maxFileBytes;
    if (lim.maxPostBytes || lim.maxTotalBytes) limits.maxTotalBytes = lim.maxPostBytes || lim.maxTotalBytes;
    if (lim.maxFilesPerPost) limits.maxFilesPerPost = lim.maxFilesPerPost;
    if (lim.maxTextChars || lim.maxMessageChars) limits.maxMessageChars = lim.maxTextChars || lim.maxMessageChars;
    var allowed = j.allowedExtensions || lim.allowedExtensions;
    if (allowed && allowed.length) {
      limits.allowedExtensions = allowed.map(function (x) {
        return String(x).replace(/^\\./, '').toLowerCase();
      });
    }
    renderHint();
    renderCounter();
  }
  function load() {
    /* 案件名は既存のダッシュボード API から取る(預かり API は案件を持たない) */
    fetch('/api/state', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { engagement = j.engagement || null; renderMeta(); })
      .catch(function () { /* 一覧は出せるので致命的ではない */ });

    return fetch('/api/intake', { cache: 'no-store', headers: { accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var items = j.records || j.submissions || j.items || [];
        submissions = items.map(normalizeRecord);
        if (j.engagement) engagement = j.engagement;
        applyLimits(j);
        renderAll();
      })
      .catch(function () {
        intakeEl.innerHTML = '<p class="empty">' + esc(S.loadFailed) + '</p>';
      });
  }

  function submit() {
    if (sending) return;
    showError('');
    var text = messageEl.value;
    if (!text.trim() && !picked.length) { showError(S.needSomething); return; }
    if (text.length > limits.maxMessageChars) { showError(S.tooLong); return; }

    var form = new FormData();
    /* サーバーは text を先に見る。message は別実装向けの別名 */
    form.append('text', text);
    form.append('message', text);
    for (var i = 0; i < picked.length; i++) form.append('files', picked[i], picked[i].name);

    sending = true;
    justSent = false;
    submitEl.disabled = true;
    submitEl.textContent = S.submitting;
    progEl.className = 'prog';
    el('progText').textContent = S.submitting
      + (picked.length ? ' (' + picked.length + ' ' + S.fileCount + ' / ' + bytes(totalBytes(picked)) + ')' : '');

    fetch('/api/intake', { method: 'POST', body: form })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok || j.ok === false) throw new Error(serverMessage(j, r.status));
          return j;
        });
      })
      .then(function (j) {
        picked = [];
        rejects = [];
        messageEl.value = '';
        /* サーバー側が断った / 警告したものは、投稿後にそのまま出す */
        var list = (j.rejected || []).map(function (x) {
          return { name: x.name || x.file || '?', size: x.size, why: S.serverRejected + ': ' + (x.reason || '') };
        }).concat((j.warnings || []).map(function (w) {
          return { name: w.file || w.name || '?', size: w.size, why: S.mismatch + (w.detail ? ' (' + w.detail + ')' : '') };
        }));
        rejects = list;
        renderFiles();
        renderCounter();
        justSent = true;
        return load();
      })
      .catch(function (err) {
        showError(S.sendFailed + ': ' + (err && err.message ? err.message : ''));
      })
      .then(function () {
        sending = false;
        submitEl.disabled = false;
        submitEl.textContent = S.submit;
        progEl.className = 'prog hidden';
        el('progText').textContent = '';
        if (justSent) {
          renderCta();
          if (ctaEl.scrollIntoView) ctaEl.scrollIntoView({ block: 'start' });
        }
      });
  }

  /* --- 入力の配線 --- */
  submitEl.onclick = submit;
  el('clearBtn').onclick = removeAllSubmissions;
  messageEl.oninput = renderCounter;
  dropEl.onclick = function () { inputEl.click(); };
  dropEl.onkeydown = function (ev) {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); inputEl.click(); }
  };
  inputEl.onchange = function () {
    addFiles(inputEl.files || []);
    inputEl.value = '';
  };
  /* スクリーンショットの貼り付け。会話にパスを打つやり方では渡せない唯一のものなので、
     この画面が本当に楽になる場面はここ。クリップボードの画像にはファイル名が無いことが
     多いので、拡張子つきの名前をこちら側で付ける(サーバーは許可拡張子しか受け取らない)。 */
  document.addEventListener('paste', function (ev) {
    if (!ev.clipboardData) return;
    var items = ev.clipboardData.files;
    if (!items || !items.length) return;
    var named = [];
    for (var i = 0; i < items.length; i++) {
      var f = items[i];
      if (f.name && extOf(f.name)) { named.push(f); continue; }
      var type = String(f.type || '');
      if (type.indexOf('image/') !== 0) continue;
      var ext = type.slice(6).toLowerCase();
      if (ext === 'jpeg') ext = 'jpg';
      if (limits.allowedExtensions.indexOf(ext) < 0) continue;
      var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      try {
        named.push(new File([f], 'pasted-' + stamp + '.' + ext, { type: type }));
      } catch (err) { named.push(f); }
    }
    if (!named.length) return;
    ev.preventDefault();
    addFiles(named);
  });
  dropEl.ondragover = function (ev) { ev.preventDefault(); dropEl.className = 'drop over'; };
  dropEl.ondragleave = function () { dropEl.className = 'drop'; };
  dropEl.ondrop = function (ev) {
    ev.preventDefault();
    dropEl.className = 'drop';
    if (ev.dataTransfer && ev.dataTransfer.files) addFiles(ev.dataTransfer.files);
  };
  /* 画面のどこに落としてもブラウザがファイルを開いてしまわないようにする */
  document.addEventListener('dragover', function (ev) { ev.preventDefault(); });
  document.addEventListener('drop', function (ev) { ev.preventDefault(); });

  el('copyBtn').onclick = function () {
    var phrase = D.lang === 'en' ? D.phraseEn : D.phrase;
    var done = function () {
      el('copyMsg').textContent = S.copied;
      setTimeout(function () { el('copyMsg').textContent = ''; }, 2000);
    };
    /* クリップボードが使えない環境(権限拒否・非セキュアな文脈)では
       黙って何も起きないと「ボタンが壊れている」ように見えるので、
       必ず合言葉そのものを画面に出して手で選べるようにする。 */
    var fallback = function () { el('copyMsg').textContent = phrase; };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(phrase).then(done, fallback);
        return;
      }
    } catch (err) { /* 下のフォールバックへ */ }
    fallback();
  };

  function renderHint() {
    el('dropHint').textContent = S.allowed + ': ' + limits.allowedExtensions.join(', ')
      + ' · ' + S.limits + ': ' + S.perFile + ' ' + bytes(limits.maxFileBytes)
      + ' / ' + S.perPost + ' ' + bytes(limits.maxTotalBytes)
      + ' / ' + S.perPostFiles + ' ' + limits.maxFilesPerPost;
  }

  /* --- テーマ(ダッシュボードと同じ挙動・同じ保存キー) --- */
  var THEME_KEY = 'togaf-eap-theme';
  var themeBtn = el('themeBtn');
  function currentTheme() {
    try {
      var t = localStorage.getItem(THEME_KEY);
      return t === 'light' || t === 'dark' ? t : 'auto';
    } catch (err) { return 'auto'; }
  }
  function applyTheme(mode) {
    if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
    themeBtn.textContent = mode === 'light' ? S.themeLight : mode === 'dark' ? S.themeDark : S.themeAuto;
    try {
      if (mode === 'auto') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, mode);
    } catch (err) { /* 保存できなくても表示は切り替わる */ }
  }
  themeBtn.onclick = function () {
    var order = ['auto', 'light', 'dark'];
    applyTheme(order[(order.indexOf(currentTheme()) + 1) % order.length]);
  };
  applyTheme(currentTheme());

  /* --- 状態変化の受信(SSE。切れたら再接続し、その間は取り直す) --- */
  function setConn(ok) {
    el('dot').className = 'dot' + (ok ? '' : ' off');
    el('conn').textContent = ok ? S.live : S.reconnecting;
  }
  function connect() {
    if (typeof EventSource !== 'function') { setConn(false); return; }
    var es = new EventSource('/events');
    es.onopen = function () { setConn(true); };
    es.onmessage = function () { load(); };
    es.onerror = function () {
      setConn(false);
      es.close();
      setTimeout(connect, 2000);
    };
  }

  el('conn').textContent = S.live;
  /* 使わない人が損した気にならないよう、「この画面は任意」を常に足元に出す。
     CTA の文言(声をかけないと動かない理由)と重複させない。 */
  el('foot').textContent = S.optional;
  renderHint();
  renderCounter();
  renderFiles();
  renderAll();
  load();
  connect();
  /* SSE が状態ファイルの変更しか運ばない場合に備えて軽く取り直す */
  setInterval(function () {
    if (!sending && !document.hidden) load();
  }, 5000);
})();
</script>
</body>
</html>
`;
}

/**
 * 別名 / Alias.
 *
 * HTTP サーバー側は Start 画面の描画関数を `renderStartPageHtml` という名前で読む。
 * 画面の実体はこのファイルなので、同じ関数を両方の名前で公開しておく
 * (どちらの名前で結線されても動くようにするため)。
 */
export const renderStartPageHtml = renderStartHtml;
