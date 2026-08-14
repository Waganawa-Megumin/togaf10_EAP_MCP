/**
 * HTML ダッシュボード / HTML dashboard.
 *
 * 自己完結した 1 ファイルの HTML を生成する(外部 CDN 参照なし)。
 * ページ内 JS が /api/state を取得して描画し、/events の SSE で
 * 状態ファイルの変更を検知して再描画する。印刷用 CSS 付き。
 *
 * v2 で追加したもの:
 *   - ロードマップ(四半期軸のタイムライン。CSS グリッドで描画)
 *   - リスクヒートマップ(レベル × 状態)
 *   - ステークホルダー 4 象限(影響力 × 関心度)
 *   - 評価(成熟度 / 変革準備度)の現在値・目標値バー
 *   - 目次ナビ / テーマ手動切替 / 未対応のみ表示フィルタ
 */

import { ADM_PHASES, type Bilingual, type Lang } from '../knowledge/index.js';
import {
  ACTION_STATUS_LABEL,
  ASSESSMENT_KIND_LABEL,
  DECISION_STATUS_LABEL,
  DELIVERABLE_STATUS_LABEL,
  INFLUENCE_LABEL,
  L,
  PHASE_STATUS_LABEL,
  PRIORITY_LABEL,
  RISK_LEVEL_LABEL,
  RISK_STATUS_LABEL,
  WORK_PACKAGE_STATUS_LABEL,
  label,
} from './labels.js';

/**
 * この画面だけで使う追加ラベル。
 * 共有ラベル(labels.ts の `L`)は他のダッシュボードと共用のため、
 * HTML 固有の操作系文言はここにローカル定義する。
 */
const LOCAL = {
  contents: { ja: '目次', en: 'Contents' },
  themeAuto: { ja: 'テーマ: 自動', en: 'Theme: Auto' },
  themeLight: { ja: 'テーマ: ライト', en: 'Theme: Light' },
  themeDark: { ja: 'テーマ: ダーク', en: 'Theme: Dark' },
  openOnly: { ja: '未対応のみ', en: 'Open only' },
  unscheduled: { ja: '時期未定', en: 'Unscheduled' },
  disposalMissing: {
    ja: '⚠ 未設定 — 誰がいつ捨てるかを決めないと、暫定は恒久化します',
    en: '⚠ Not set — without an owner and a date, the workaround becomes permanent',
  },
  quadrantRule: {
    ja: '「中」以上を高側に配置しています',
    en: 'Medium and above is plotted on the high side',
  },
  summary: { ja: '所見', en: 'Summary' },
  scale: { ja: '尺度', en: 'Scale' },
  assessedAt: { ja: '評価日', en: 'Assessed' },
} satisfies Record<string, Bilingual>;

/** JSON をそのまま <script> に埋めても壊れないようにする */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');
}

function labelMap<T extends string>(map: Record<T, { ja: string; en: string }>, lang: Lang): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(map) as T[]) out[key] = label(map[key], lang);
  return out;
}

/** ダッシュボードの HTML を生成する */
export function renderDashboardHtml(lang: Lang = 'both'): string {
  const strings: Record<string, string> = {};
  for (const key of Object.keys(L) as (keyof typeof L)[]) strings[key] = label(L[key], lang);
  for (const key of Object.keys(LOCAL) as (keyof typeof LOCAL)[]) strings[key] = label(LOCAL[key], lang);

  const data = {
    lang,
    strings,
    phases: ADM_PHASES.map((p) => ({ id: p.id, code: p.code, name: label(p.name, lang) })),
    phaseStatus: labelMap(PHASE_STATUS_LABEL, lang),
    riskLevel: labelMap(RISK_LEVEL_LABEL, lang),
    riskStatus: labelMap(RISK_STATUS_LABEL, lang),
    decisionStatus: labelMap(DECISION_STATUS_LABEL, lang),
    actionStatus: labelMap(ACTION_STATUS_LABEL, lang),
    priority: labelMap(PRIORITY_LABEL, lang),
    influence: labelMap(INFLUENCE_LABEL, lang),
    deliverableStatus: labelMap(DELIVERABLE_STATUS_LABEL, lang),
    workPackageStatus: labelMap(WORK_PACKAGE_STATUS_LABEL, lang),
    assessmentKind: labelMap(ASSESSMENT_KIND_LABEL, lang),
  };

  return `<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'ja'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TOGAF 10 EAP — ${strings.dashboard}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23101c2e'/%3E%3Cg transform='rotate(-90 16 16)'%3E%3Ccircle cx='16' cy='16' r='11' fill='none' stroke='%23e8a52c' stroke-width='4.4' stroke-dasharray='15.3 53.8' stroke-dashoffset='0'/%3E%3Ccircle cx='16' cy='16' r='11' fill='none' stroke='%233f7fd6' stroke-width='4.4' stroke-dasharray='15.3 53.8' stroke-dashoffset='-17.3'/%3E%3Ccircle cx='16' cy='16' r='11' fill='none' stroke='%235f8fd2' stroke-width='4.4' stroke-dasharray='15.3 53.8' stroke-dashoffset='-34.6'/%3E%3Ccircle cx='16' cy='16' r='11' fill='none' stroke='%233ec9e0' stroke-width='4.4' stroke-dasharray='15.3 53.8' stroke-dashoffset='-51.9'/%3E%3C/g%3E%3Ccircle cx='16' cy='16' r='3' fill='%23f2f6fb'/%3E%3C/svg%3E">
<script>
/* 描画前にテーマを適用してちらつきを防ぐ */
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
  --warn: #b7791f;
  --high: #c05621;
  --crit: #a32b2b;
  --tint-low: #eef1f5;
  --tint-medium: #fdf3e1;
  --tint-high: #fbeade;
  --tint-critical: #f8dede;
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
    --warn: #d9a441;
    --high: #e08a4e;
    --crit: #e06c6c;
    --tint-low: #23272d;
    --tint-medium: #3a3122;
    --tint-high: #3b2c20;
    --tint-critical: #3d2323;
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
  --warn: #d9a441;
  --high: #e08a4e;
  --crit: #e06c6c;
  --tint-low: #23272d;
  --tint-medium: #3a3122;
  --tint-high: #3b2c20;
  --tint-critical: #3d2323;
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
.wrap { max-width: 1080px; margin: 0 auto; }
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
button {
  font: inherit; font-size: 12px; padding: 4px 12px; border-radius: 999px;
  border: 1px solid var(--line); background: var(--panel); color: var(--ink); cursor: pointer;
}
button:hover { border-color: var(--accent); color: var(--accent); }
button.mini { padding: 2px 10px; font-size: 11px; color: var(--muted); }
button.mini[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
nav.toc {
  position: sticky; top: 0; z-index: 5;
  display: flex; flex-wrap: wrap; gap: 4px;
  padding: 8px 0; margin: 4px 0 0;
  background: var(--bg); border-bottom: 1px solid var(--line);
}
nav.toc a {
  font-size: 12px; color: var(--muted); text-decoration: none;
  padding: 3px 10px; border-radius: 999px; border: 1px solid transparent;
}
nav.toc a:hover { color: var(--accent); border-color: var(--accent); background: var(--panel); }
nav.toc:empty { display: none; }
section {
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 16px 18px; margin-top: 16px; scroll-margin-top: 56px;
}
section > h2 { font-size: 15px; margin: 0 0 12px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
section > h2 .count { font-size: 12px; color: var(--muted); font-weight: 400; }
section > h2 .tools { margin-left: auto; display: inline-flex; gap: 6px; align-items: center; }
h3.sub { font-size: 13px; margin: 18px 0 8px; color: var(--muted); font-weight: 600; }
.bar { height: 10px; border-radius: 999px; background: var(--line); overflow: hidden; }
.bar > i { display: block; height: 100%; background: var(--accent); transition: width .4s ease; }
.stats { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 12px; }
.stat .n { font-size: 20px; font-weight: 600; }
.stat .k { font-size: 12px; color: var(--muted); }
.phases { display: grid; gap: 6px; }
.phase { display: grid; grid-template-columns: 72px 1fr auto; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 8px; border: 1px solid transparent; }
.phase.current { background: var(--accent-soft); border-color: var(--accent); }
.phase .code { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 12px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.phase .nm { font-size: 13px; }
.phase .nt { display: block; color: var(--muted); font-size: 12px; }
.tag { font-size: 11px; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--line); white-space: nowrap; }
.tag.not_started, .tag.proposed_wp { color: var(--muted); }
.tag.in_progress, .tag.planned { color: var(--accent); border-color: var(--accent); }
.tag.completed, .tag.delivered { color: var(--ok); border-color: var(--ok); }
.tag.skipped, .tag.cancelled { color: var(--muted); opacity: .65; }
.tag.low { color: var(--muted); }
.tag.medium, .tag.drafting, .tag.proposed, .tag.mitigating, .tag.review { color: var(--warn); border-color: var(--warn); }
.tag.high, .tag.blocked { color: var(--high); border-color: var(--high); }
.tag.critical, .tag.open, .tag.rejected { color: var(--crit); border-color: var(--crit); }
.tag.done, .tag.closed, .tag.accepted, .tag.approved, .tag.baselined { color: var(--ok); border-color: var(--ok); }
.tblwrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 600; }
tr:last-child td { border-bottom: none; }
td.c, th.c { text-align: center; white-space: nowrap; }
td.n, th.n { white-space: nowrap; }
.empty { color: var(--muted); font-size: 13px; }
.decision, .tcard { border-left: 3px solid var(--line); padding: 2px 0 2px 14px; margin-bottom: 14px; }
.decision:last-child, .tcard:last-child { margin-bottom: 0; }
.decision h3, .tcard h3 { font-size: 14px; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.decision dl, .tcard dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; font-size: 13px; }
.decision dt, .tcard dt { color: var(--muted); }
.decision dd, .tcard dd { margin: 0; }
.tcard { border-left-color: var(--accent); }
.tcard.warn { border-left-color: var(--crit); }
ul.notes { margin: 0; padding-left: 20px; }
ul.plain { margin: 0; padding-left: 18px; }
footer { margin-top: 24px; color: var(--muted); font-size: 12px; text-align: center; }

/* --- ロードマップ(四半期タイムライン) --- */
.tl-scroll { overflow-x: auto; padding-bottom: 6px; }
.tl { position: relative; --lab: 190px; }
.tl-grid { display: grid; row-gap: 5px; align-items: stretch; }
.tl-mark { display: flex; justify-content: center; pointer-events: none; z-index: 0; }
.tl-mark > i { display: block; width: 0; height: 100%; border-left: 2px dashed var(--accent); }
.tl-mark.warn > i { border-left-color: var(--crit); }
.tl-chips { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; padding-bottom: 4px; z-index: 2; }
/* 端の列ではラベルがはみ出して切れるため、内側に寄せる */
.tl-chips.at-end { justify-content: flex-end; }
.tl-chips.at-start { justify-content: flex-start; }
.tl-chip {
  font-size: 11px; padding: 2px 8px; border-radius: 999px; white-space: nowrap;
  border: 1px solid var(--accent); color: var(--accent); background: var(--panel);
}
.tl-chip.warn { border-color: var(--crit); color: var(--crit); }
.warntx { color: var(--crit); }
.tl-head { font-size: 11px; color: var(--muted); text-align: center; white-space: nowrap; padding: 0 2px 5px; border-bottom: 1px solid var(--line); z-index: 1; }
.tl-head.rowlab { text-align: left; }
.tl-lab { font-size: 12px; padding-right: 12px; z-index: 1; min-width: 0; display: flex; align-items: center; gap: 6px; }
.tl-lab .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl-bar {
  z-index: 1; height: 20px; align-self: center; border-radius: 999px;
  background: var(--accent-soft); border: 1px solid var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; overflow: hidden; white-space: nowrap; padding: 0 8px; color: var(--accent);
}
.tl-bar.proposed { background: transparent; border-style: dashed; color: var(--muted); border-color: var(--muted); }
.tl-bar.in_progress { background: var(--accent); color: var(--on-accent); }
.tl-bar.delivered { background: var(--ok); border-color: var(--ok); color: var(--on-accent); }
.tl-bar.cancelled { background: transparent; border-color: var(--line); color: var(--muted); opacity: .6; text-decoration: line-through; }
.chiprow { display: flex; flex-wrap: wrap; gap: 6px; }
.who { font-size: 11px; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); white-space: nowrap; }

/* --- リスクヒートマップ --- */
.hm { display: grid; gap: 5px; min-width: 420px; }
.hm .h { font-size: 11px; color: var(--muted); text-align: center; }
.hm .rh { font-size: 12px; color: var(--muted); text-align: right; padding-right: 8px; white-space: nowrap; align-self: center; }
.hm .cell {
  border: 1px solid var(--line); border-radius: 8px; text-align: center;
  padding: 12px 4px; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums;
}
.hm .cell.z { color: var(--muted); opacity: .45; font-weight: 400; }
.hm .cell.low { background: var(--tint-low); border-color: var(--line); color: var(--muted); }
.hm .cell.medium { background: var(--tint-medium); border-color: var(--warn); color: var(--warn); }
.hm .cell.high { background: var(--tint-high); border-color: var(--high); color: var(--high); }
.hm .cell.critical { background: var(--tint-critical); border-color: var(--crit); color: var(--crit); }

/* --- ステークホルダー 4 象限 --- */
.quad { display: grid; grid-template-columns: auto 1fr 1fr; gap: 6px; }
.quad .ch { font-size: 11px; color: var(--muted); text-align: center; }
.quad .rh { font-size: 11px; color: var(--muted); align-self: center; white-space: nowrap; padding-right: 6px; }
.qd { border: 1px solid var(--line); border-radius: 8px; padding: 9px 11px; min-height: 92px; }
.qd.hi { background: var(--accent-soft); border-color: var(--accent); }
.qd h4 { margin: 0 0 7px; font-size: 11px; font-weight: 600; color: var(--muted); letter-spacing: .04em; }
.qd.hi h4 { color: var(--accent); }
.axis { font-size: 11px; color: var(--muted); margin-top: 8px; }

/* --- 評価 --- */
.asmt + .asmt { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
.asmt h3 { font-size: 14px; margin: 0 0 2px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.asmt .sub { font-size: 12px; color: var(--muted); margin-bottom: 10px; }
.af { display: grid; grid-template-columns: minmax(110px, 210px) 1fr auto; gap: 8px 14px; align-items: center; }
.af .fn { font-size: 12px; }
.af .fn small { display: block; color: var(--muted); }
.af .fb { position: relative; height: 12px; border-radius: 999px; background: var(--line); }
.af .fb > i { display: block; height: 100%; border-radius: 999px; background: var(--accent); }
.af .fb > b { position: absolute; top: -4px; width: 2px; height: 20px; border-radius: 1px; background: var(--ink); }
.af .fv { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }

@media (max-width: 640px) {
  .tl { --lab: 116px; }
  .af { grid-template-columns: 1fr; }
  /* 狭い画面では 4 象限を縦に積む(象限名が各カードにあるので軸見出しは省く) */
  .quad { grid-template-columns: 1fr; }
  .quad .ch, .quad .rh { display: none; }
}
@media print {
  /* ダークテーマ表示中に印刷しても紙面は明色に固定する */
  :root, :root:not([data-theme="light"]), :root[data-theme="dark"] {
    --bg: #ffffff;
    --panel: #ffffff;
    --ink: #000000;
    --muted: #555555;
    --line: #bbbbbb;
    --accent: #2f5d8a;
    --accent-soft: #e8f0f8;
    --on-accent: #ffffff;
    --ok: #2f7a54;
    --warn: #8a6414;
    --high: #a0451a;
    --crit: #8f2323;
    --tint-low: #f0f2f5;
    --tint-medium: #fdf3e1;
    --tint-high: #fbeade;
    --tint-critical: #f8dede;
  }
  body { background: #fff; color: #000; padding: 0; font-size: 11pt; }
  .controls, nav.toc, section > h2 .tools, footer .hint { display: none !important; }
  section { border: 1px solid #ccc; box-shadow: none; break-inside: avoid; page-break-inside: avoid; margin-top: 10pt; }
  .phase.current { background: #f0f0f0 !important; }
  .tag { border-color: #999 !important; color: #000 !important; }
  a { color: #000; text-decoration: none; }
  h1 { font-size: 16pt; }
  .tl-scroll, .tblwrap { overflow: visible !important; }
  .tl { min-width: 0 !important; --lab: 130px; }
  .hm { min-width: 0 !important; }
  .tl-bar, .hm .cell, .af .fb, .af .fb > i, .bar > i, .qd.hi {
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .hm .cell, .qd, .tcard, .asmt { break-inside: avoid; page-break-inside: avoid; }
}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div>
      <h1 id="title">TOGAF 10 EAP</h1>
      <div class="meta" id="meta"></div>
    </div>
    <div class="controls">
      <span class="pill"><span class="dot" id="dot"></span><span id="conn"></span></span>
      <button id="themeBtn" type="button"></button>
      <button onclick="window.print()" id="printBtn" type="button"></button>
    </div>
  </header>
  <nav class="toc" id="toc"></nav>
  <div id="root"></div>
  <footer>
    <span id="gen"></span>
    <span class="hint"> — TOGAF 10 EAP MCP</span>
  </footer>
</div>
<script>
(function () {
  var D = ${safeJson(data)};
  var S = D.strings;
  var root = document.getElementById('root');
  var toc = document.getElementById('toc');
  var themeBtn = document.getElementById('themeBtn');

  /* 画面の状態(フィルタは再取得なしで再描画するためここに持つ) */
  var state = { engagement: null, openRisksOnly: false, openActionsOnly: false };
  var navItems = [];

  document.getElementById('printBtn').textContent = S.print;
  document.getElementById('conn').textContent = S.live;

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return esc(iso);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fmtDay(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return esc(iso);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function tag(cls, txt) { return '<span class="tag ' + esc(cls) + '">' + esc(txt) + '</span>'; }
  /* 保管先はローカルパスや file:// も許すが、クリックでコードが走る URL はリンクにしない */
  function safeHref(url) {
    return /^\\s*(javascript|data|vbscript):/i.test(String(url)) ? null : String(url);
  }
  function section(title, count, body, id, tools) {
    var attr = '';
    if (id) {
      attr = ' id="sec-' + esc(id) + '"';
      navItems.push({ id: 'sec-' + id, title: title });
    }
    return '<section' + attr + '><h2>' + esc(title)
      + (count === null || count === undefined ? '' : '<span class="count">' + count + '</span>')
      + (tools ? '<span class="tools">' + tools + '</span>' : '')
      + '</h2>' + body + '</section>';
  }
  function empty() { return '<p class="empty">' + esc(S.none) + '</p>'; }
  function table(headers, rows) {
    if (!rows.length) return empty();
    var th = headers.map(function (h) {
      return '<th' + (h.c ? ' class="c"' : h.n ? ' class="n"' : '') + '>' + esc(h.t) + '</th>';
    }).join('');
    /* 幅の広い表は画面ごと横スクロールさせず、表の中でスクロールさせる */
    return '<div class="tblwrap"><table><thead><tr>' + th + '</tr></thead><tbody>'
      + rows.join('') + '</tbody></table></div>';
  }
  function toggleBtn(key, on) {
    return '<button type="button" class="mini" data-toggle="' + esc(key) + '" aria-pressed="'
      + (on ? 'true' : 'false') + '">' + esc(S.openOnly) + '</button>';
  }

  /* --- 四半期の解析(例: 2027-Q1 / 2027Q1 / 2027-1) --- */
  function parseQ(value) {
    if (!value) return null;
    var m = String(value).match(/(\\d{4})\\D*([1-4])(?!\\d)/);
    if (!m) return null;
    var y = parseInt(m[1], 10);
    var q = parseInt(m[2], 10);
    return { idx: y * 4 + (q - 1) };
  }
  function qLabel(idx) { return Math.floor(idx / 4) + '-Q' + ((idx % 4) + 1); }

  function renderProgress(e) {
    var counts = { completed: 0, in_progress: 0, not_started: 0, skipped: 0 };
    e.phases.forEach(function (p) { counts[p.status] = (counts[p.status] || 0) + 1; });
    var effective = e.phases.length - counts.skipped;
    var pct = effective > 0 ? Math.round(((counts.completed + counts.in_progress * 0.5) / effective) * 100) : 0;
    var openRisks = e.risks.filter(function (r) { return r.status === 'open' || r.status === 'mitigating'; }).length;
    var openActions = e.actions.filter(function (a) { return a.status !== 'done'; }).length;
    var stat = function (n, k) { return '<div class="stat"><div class="n">' + n + '</div><div class="k">' + esc(k) + '</div></div>'; };
    var extra = '';
    if ((e.workPackages || []).length) extra += stat(e.workPackages.length, S.workPackages);
    if ((e.transitions || []).length) extra += stat(e.transitions.length, S.transitions);
    return '<section>'
      + '<div class="bar"><i style="width:' + pct + '%"></i></div>'
      + '<div class="stats">'
      + stat(pct + '%', S.progress)
      + stat(counts.completed + '/' + effective, S.admProgress)
      + stat(openRisks, S.risks + ' (' + S.openItems + ')')
      + stat(openActions, S.actions + ' (' + S.openItems + ')')
      + stat(e.decisions.length, S.decisions)
      + stat(e.deliverables.length, S.deliverables)
      + extra
      + '</div></section>';
  }

  function renderPhases(e) {
    var byId = {};
    e.phases.forEach(function (p) { byId[p.phaseId] = p; });
    var rows = D.phases.map(function (ph) {
      var p = byId[ph.id] || { status: 'not_started' };
      var cur = ph.id === e.currentPhaseId;
      return '<div class="phase' + (cur ? ' current' : '') + '">'
        + '<div class="code">' + esc(ph.code) + '</div>'
        + '<div class="nm">' + esc(ph.name) + (p.note ? '<span class="nt">' + esc(p.note) + '</span>' : '') + '</div>'
        + '<div>' + tag(p.status, D.phaseStatus[p.status] || p.status) + '</div>'
        + '</div>';
    }).join('');
    return section(S.admProgress, null, '<div class="phases">' + rows + '</div>', 'phases');
  }

  /* --- ロードマップ: 移行アーキテクチャ + 作業パッケージ --- */
  function renderRoadmap(e) {
    var trans = e.transitions || [];
    var wps = e.workPackages || [];
    if (!trans.length && !wps.length) return '';

    var transById = {};
    trans.forEach(function (t) { transById[t.id] = t; });
    var wpById = {};
    wps.forEach(function (w) { wpById[w.id] = w; });

    /* 四半期の範囲を求める */
    var idxs = [];
    var ranges = {};
    wps.forEach(function (w) {
      var s = parseQ(w.startQuarter);
      var en = parseQ(w.endQuarter);
      if (!s && !en) return;
      var a = s ? s.idx : en.idx;
      var b = en ? en.idx : s.idx;
      if (b < a) { var swap = a; a = b; b = swap; }
      ranges[w.id] = { a: a, b: b };
      idxs.push(a);
      idxs.push(b);
    });
    var transAt = {};
    trans.forEach(function (t) {
      var q = parseQ(t.targetQuarter);
      if (!q) return;
      transAt[t.id] = q.idx;
      idxs.push(q.idx);
    });

    var body = '';
    if (idxs.length) {
      var min = Math.min.apply(null, idxs);
      var max = Math.max.apply(null, idxs);
      if (max - min > 39) max = min + 39; /* 描画上限(横スクロールが無限に伸びないように) */
      var cols = max - min + 1;
      var clamp = function (v) { return Math.max(min, Math.min(max, v)); };

      var scheduled = wps.filter(function (w) { return ranges[w.id]; }).sort(function (x, y) {
        return ranges[x.id].a - ranges[y.id].a || ranges[x.id].b - ranges[y.id].b;
      });
      var totalRows = 2 + scheduled.length;
      var cells = [];

      /* 移行アーキテクチャ: 縦線 + チップ(単独稼働できないものは警告色) */
      var byCol = {};
      trans.forEach(function (t) {
        if (transAt[t.id] === undefined) return;
        var c = clamp(transAt[t.id]) - min;
        if (!byCol[c]) byCol[c] = [];
        byCol[c].push(t);
      });
      Object.keys(byCol).forEach(function (key) {
        var c = parseInt(key, 10);
        var list = byCol[key];
        var warn = list.some(function (t) { return t.standalone === false; });
        cells.push('<div class="tl-mark' + (warn ? ' warn' : '')
          + '" style="grid-column:' + (2 + c) + ';grid-row:1 / span ' + totalRows + '"><i></i></div>');
        var chips = list.map(function (t) {
          var hint = t.standalone === false ? S.standalone + ': ' + S.standaloneNo : S.standalone + ': ' + S.standaloneYes;
          return '<span class="tl-chip' + (t.standalone === false ? ' warn' : '') + '" title="' + esc(t.name + ' — ' + hint) + '">'
            + esc(t.name) + '</span>';
        }).join('');
        /* 端の列は中央寄せだとラベルがはみ出して切れるので、内側に寄せる */
        var edge = c >= cols - 1 ? ' at-end' : (c <= 0 ? ' at-start' : '');
        cells.push('<div class="tl-chips' + edge + '" style="grid-column:' + (2 + c) + ';grid-row:1">' + chips + '</div>');
      });
      cells.push('<div class="tl-head rowlab" style="grid-column:1;grid-row:2">' + esc(S.quarter) + '</div>');
      for (var i = 0; i < cols; i++) {
        cells.push('<div class="tl-head" style="grid-column:' + (2 + i) + ';grid-row:2">' + esc(qLabel(min + i)) + '</div>');
      }

      /* 作業パッケージ: 開始〜終了四半期にバーを描く */
      scheduled.forEach(function (w, n) {
        var r = 3 + n;
        var a = clamp(ranges[w.id].a) - min;
        var b = clamp(ranges[w.id].b) - min;
        var span = Math.max(1, b - a + 1);
        var t = w.transitionId ? transById[w.transitionId] : null;
        /* 表示する時期は描画上限で丸めた値ではなく、登録されている四半期そのもの */
        var period = qLabel(ranges[w.id].a) + ' → ' + qLabel(ranges[w.id].b);
        var hint = [w.name, D.workPackageStatus[w.status] || w.status, period];
        if (t) hint.push(S.transition + ': ' + t.name);
        if (w.owner) hint.push(S.owner + ': ' + w.owner);
        cells.push('<div class="tl-lab" style="grid-column:1;grid-row:' + r + '" title="' + esc(hint.join(' / ')) + '">'
          + '<span class="nm">' + esc(w.name) + '</span>'
          + tag(w.status === 'proposed' ? 'proposed_wp' : w.status, D.workPackageStatus[w.status] || w.status)
          + '</div>');
        cells.push('<div class="tl-bar ' + esc(w.status) + '" style="grid-column:' + (2 + a) + ' / span ' + span
          + ';grid-row:' + r + '" title="' + esc(hint.join(' / ')) + '">'
          + (span > 1 ? esc(period) : '') + '</div>');
      });

      body += '<div class="tl-scroll"><div class="tl" style="min-width:calc(var(--lab) + ' + (cols * 78) + 'px)">'
        + '<div class="tl-grid" style="grid-template-columns:var(--lab) repeat(' + cols + ', minmax(0, 1fr))">'
        + cells.join('') + '</div></div></div>';

      var unscheduled = wps.filter(function (w) { return !ranges[w.id]; });
      if (unscheduled.length) {
        body += '<h3 class="sub">' + esc(S.unscheduled) + '</h3><div class="chiprow">'
          + unscheduled.map(function (w) {
            return '<span class="who">' + esc(w.name) + ' '
              + esc(D.workPackageStatus[w.status] || w.status) + '</span>';
          }).join('') + '</div>';
      }
    }

    /* 作業パッケージの明細 */
    if (wps.length) {
      var rows = wps.map(function (w) {
        var t = w.transitionId ? transById[w.transitionId] : null;
        var period = [w.startQuarter, w.endQuarter].filter(Boolean).join(' → ');
        var deps = (w.dependsOn || []).map(function (id) {
          return wpById[id] ? wpById[id].name : id;
        }).join(', ');
        var sub = [];
        if (w.description) sub.push(w.description);
        if (w.costEstimate) sub.push(S.cost + ': ' + w.costEstimate);
        if (w.benefit) sub.push(S.benefit + ': ' + w.benefit + (w.benefitOwner ? ' (' + w.benefitOwner + ')' : ''));
        return '<tr><td>' + esc(w.name)
          + (sub.length ? '<br><span class="empty">' + esc(sub.join(' / ')) + '</span>' : '')
          + '</td><td class="c">' + tag(w.status === 'proposed' ? 'proposed_wp' : w.status, D.workPackageStatus[w.status] || w.status)
          + '</td><td class="n">' + esc(t ? t.name : '')
          + '</td><td class="n">' + esc(period)
          + '</td><td class="c">' + tag(w.businessValue, D.priority[w.businessValue] || w.businessValue)
          + '</td><td class="c">' + tag(w.effort, D.priority[w.effort] || w.effort)
          + '</td><td>' + esc(deps)
          + '</td><td class="n">' + esc(w.owner) + '</td></tr>';
      });
      body += '<h3 class="sub">' + esc(S.workPackages) + '</h3>' + table(
        [{ t: S.title }, { t: S.status, c: 1 }, { t: S.transition, n: 1 }, { t: S.quarter, n: 1 },
         { t: S.businessValue, c: 1 }, { t: S.effort, c: 1 }, { t: S.dependsOn }, { t: S.owner, n: 1 }],
        rows);
    }

    /* 移行アーキテクチャの明細 */
    if (trans.length) {
      var cards = trans.slice().sort(function (x, y) { return (x.order || 0) - (y.order || 0); }).map(function (t) {
        var warn = t.standalone === false;
        var dl = '';
        if (t.targetQuarter) dl += '<dt>' + esc(S.quarter) + '</dt><dd>' + esc(t.targetQuarter) + '</dd>';
        if ((t.capabilities || []).length) {
          dl += '<dt>' + esc(S.capabilities) + '</dt><dd>' + esc(t.capabilities.join('; ')) + '</dd>';
        }
        if (t.interim) dl += '<dt>' + esc(S.interim) + '</dt><dd>' + esc(t.interim) + '</dd>';
        if (t.disposalPlan) {
          dl += '<dt>' + esc(S.disposalPlan) + '</dt><dd>' + esc(t.disposalPlan) + '</dd>';
        } else if (t.interim) {
          // 暫定の仕組みがあるのに廃棄計画が無い場合は警告する(暫定が恒久化する典型)
          dl += '<dt>' + esc(S.disposalPlan) + '</dt><dd class="warntx">' + esc(S.disposalMissing) + '</dd>';
        }
        if (t.note) dl += '<dt>' + esc(S.note) + '</dt><dd>' + esc(t.note) + '</dd>';
        return '<div class="tcard' + (warn ? ' warn' : '') + '"><h3>' + esc(t.name)
          + tag(warn ? 'critical' : 'completed', S.standalone + ': ' + (warn ? S.standaloneNo : S.standaloneYes))
          + '</h3><dl>' + dl + '</dl></div>';
      }).join('');
      body += '<h3 class="sub">' + esc(S.transitions) + '</h3>' + cards;
    }

    return section(S.roadmap, wps.length + trans.length, body, 'roadmap');
  }

  function renderStakeholders(e) {
    var rows = e.stakeholders.map(function (s) {
      return '<tr><td class="n">' + esc(s.name) + '</td><td class="n">' + esc([s.role, s.organization].filter(Boolean).join(' / '))
        + '</td><td class="c">' + tag(s.influence, D.influence[s.influence] || s.influence)
        + '</td><td class="c">' + tag(s.interest, D.influence[s.interest] || s.interest)
        + '</td><td>' + esc((s.concerns || []).join('; ')) + '</td><td>' + esc(s.approach) + '</td></tr>';
    });
    return section(S.stakeholders, e.stakeholders.length, table(
      [{ t: S.name, n: 1 }, { t: S.role, n: 1 }, { t: S.influence, c: 1 }, { t: S.interest, c: 1 }, { t: S.concerns }, { t: S.approach }],
      rows), 'stakeholders');
  }

  /* --- ステークホルダー 4 象限(影響力 × 関心度) --- */
  function renderStakeholderMatrix(e) {
    var list = e.stakeholders || [];
    if (!list.length) return '';
    var hiSide = function (v) { return v === 'high' || v === 'medium'; };
    var buckets = { hh: [], hl: [], lh: [], ll: [] };
    list.forEach(function (s) {
      var k = (hiSide(s.influence) ? 'h' : 'l') + (hiSide(s.interest) ? 'h' : 'l');
      buckets[k].push(s);
    });
    var chips = function (arr) {
      if (!arr.length) return '<span class="empty">' + esc(S.none) + '</span>';
      return '<div class="chiprow">' + arr.map(function (s) {
        var hint = S.influence + ': ' + (D.influence[s.influence] || s.influence)
          + ' / ' + S.interest + ': ' + (D.influence[s.interest] || s.interest);
        return '<span class="who" title="' + esc(hint) + '">' + esc(s.name) + '</span>';
      }).join('') + '</div>';
    };
    var quad = function (title, arr, hi) {
      return '<div class="qd' + (hi ? ' hi' : '') + '"><h4>' + esc(title) + ' (' + arr.length + ')</h4>' + chips(arr) + '</div>';
    };
    var body = '<div class="quad">'
      + '<div></div>'
      + '<div class="ch">' + esc(S.interest + ': ' + D.influence.low) + '</div>'
      + '<div class="ch">' + esc(S.interest + ': ' + D.influence.high) + '</div>'
      + '<div class="rh">' + esc(S.influence + ': ' + D.influence.high) + '</div>'
      + quad(S.keepSatisfied, buckets.hl, false)
      + quad(S.manageClosely, buckets.hh, true)
      + '<div class="rh">' + esc(S.influence + ': ' + D.influence.low) + '</div>'
      + quad(S.monitor, buckets.ll, false)
      + quad(S.keepInformed, buckets.lh, false)
      + '</div><p class="axis">' + esc(S.quadrantRule) + '</p>';
    return section(S.stakeholderMatrix, list.length, body, 'stakeholder-matrix');
  }

  function renderRisks(e) {
    var order = { critical: 0, high: 1, medium: 2, low: 3 };
    var list = e.risks.slice();
    if (state.openRisksOnly) {
      list = list.filter(function (r) { return r.status === 'open' || r.status === 'mitigating'; });
    }
    var rows = list.sort(function (a, b) { return order[a.level] - order[b.level]; }).map(function (r) {
      return '<tr><td>' + esc(r.title) + (r.description ? '<br><span class="empty">' + esc(r.description) + '</span>' : '')
        + '</td><td class="c">' + tag(r.level, D.riskLevel[r.level] || r.level)
        + '</td><td class="c">' + (r.residualLevel ? tag(r.residualLevel, D.riskLevel[r.residualLevel]) : '')
        + '</td><td class="c">' + tag(r.status, D.riskStatus[r.status] || r.status)
        + '</td><td class="n">' + esc(r.owner) + '</td><td>' + esc(r.mitigation) + '</td></tr>';
    });
    var count = state.openRisksOnly ? list.length + ' / ' + e.risks.length : e.risks.length;
    return section(S.risks, count, table(
      [{ t: S.title }, { t: S.level, c: 1 }, { t: S.residual, c: 1 }, { t: S.status, c: 1 }, { t: S.owner, n: 1 }, { t: S.mitigation }],
      rows), 'risks', toggleBtn('risks', state.openRisksOnly));
  }

  /* --- リスクヒートマップ(レベル × 状態) --- */
  function renderRiskMatrix(e) {
    var risks = e.risks || [];
    if (!risks.length) return '';
    var levels = ['critical', 'high', 'medium', 'low'];
    var statuses = ['open', 'mitigating', 'accepted', 'closed'];
    var grid = {};
    var plotted = 0;
    risks.forEach(function (r) {
      /* 想定外のレベル・状態(手編集された JSON など)は升目が無いので集計から外す */
      if (levels.indexOf(r.level) < 0 || statuses.indexOf(r.status) < 0) return;
      var key = r.level + '|' + r.status;
      if (!grid[key]) grid[key] = [];
      grid[key].push(r.title);
      plotted += 1;
    });
    if (!plotted) return '';
    var html = '<div class="tblwrap"><div class="hm" style="grid-template-columns:auto repeat('
      + statuses.length + ', minmax(0, 1fr))">';
    html += '<div></div>';
    statuses.forEach(function (st) {
      html += '<div class="h">' + esc(D.riskStatus[st] || st) + '</div>';
    });
    levels.forEach(function (lv) {
      html += '<div class="rh">' + esc(D.riskLevel[lv] || lv) + '</div>';
      statuses.forEach(function (st) {
        var titles = grid[lv + '|' + st] || [];
        var cls = titles.length ? lv : 'z';
        html += '<div class="cell ' + cls + '"' + (titles.length ? ' title="' + esc(titles.join(' / ')) + '"' : '')
          + '>' + titles.length + '</div>';
      });
    });
    html += '</div></div>';
    /* 件数は「実際に升目に入った数」。表側の総数と食い違うときは想定外の値が混じっている */
    return section(S.riskMatrix, plotted, html, 'risk-matrix');
  }

  function renderDecisions(e) {
    if (!e.decisions.length) return section(S.decisions, 0, empty(), 'decisions');
    var body = e.decisions.map(function (d) {
      var dl = '';
      if (d.context) dl += '<dt>' + esc(S.description) + '</dt><dd>' + esc(d.context) + '</dd>';
      dl += '<dt>' + esc(S.decision) + '</dt><dd>' + esc(d.decision) + '</dd>';
      if (d.rationale) dl += '<dt>' + esc(S.rationale) + '</dt><dd>' + esc(d.rationale) + '</dd>';
      if (d.decidedBy) dl += '<dt>' + esc(S.decidedBy) + '</dt><dd>' + esc(d.decidedBy) + '</dd>';
      return '<div class="decision"><h3>' + esc(d.title) + tag(d.status, D.decisionStatus[d.status] || d.status)
        + '</h3><dl>' + dl + '</dl></div>';
    }).join('');
    return section(S.decisions, e.decisions.length, body, 'decisions');
  }

  function renderActions(e) {
    var prio = { high: 0, medium: 1, low: 2 };
    var list = e.actions.slice();
    if (state.openActionsOnly) {
      list = list.filter(function (a) { return a.status !== 'done'; });
    }
    var rows = list.sort(function (a, b) {
      return (a.status === 'done') - (b.status === 'done') || prio[a.priority] - prio[b.priority];
    }).map(function (a) {
      return '<tr><td>' + esc(a.title) + (a.note ? '<br><span class="empty">' + esc(a.note) + '</span>' : '')
        + '</td><td class="n">' + esc(a.owner) + '</td><td class="n">' + esc(a.due)
        + '</td><td class="c">' + tag(a.priority, D.priority[a.priority] || a.priority)
        + '</td><td class="c">' + tag(a.status, D.actionStatus[a.status] || a.status) + '</td></tr>';
    });
    var count = state.openActionsOnly ? list.length + ' / ' + e.actions.length : e.actions.length;
    return section(S.actions, count, table(
      [{ t: S.title }, { t: S.owner, n: 1 }, { t: S.due, n: 1 }, { t: S.priority, c: 1 }, { t: S.status, c: 1 }], rows),
      'actions', toggleBtn('actions', state.openActionsOnly));
  }

  function renderDeliverables(e) {
    var codes = {};
    D.phases.forEach(function (p) { codes[p.id] = p.code; });
    var rows = e.deliverables.map(function (d) {
      var href = d.link ? safeHref(d.link) : null;
      var link = d.link ? (href ? '<a href="' + esc(href) + '">' + esc(href) + '</a>' : esc(d.link)) : '';
      return '<tr><td>' + esc(d.name) + (d.note ? '<br><span class="empty">' + esc(d.note) + '</span>' : '')
        + '</td><td class="c">' + esc(codes[d.phaseId] || '')
        + '</td><td class="c">' + tag(d.status, D.deliverableStatus[d.status] || d.status)
        + '</td><td class="n">' + esc(d.owner) + '</td><td>' + link + '</td></tr>';
    });
    return section(S.deliverables, e.deliverables.length, table(
      [{ t: S.title }, { t: S.phase, c: 1 }, { t: S.status, c: 1 }, { t: S.owner, n: 1 }, { t: S.link }], rows),
      'deliverables');
  }

  /* --- 評価: 因子ごとに現在値(塗り)と目標値(目盛り)を並べる --- */
  function renderAssessments(e) {
    var list = e.assessments || [];
    if (!list.length) return '';
    var body = list.map(function (a) {
      var scale = a.scale > 0 ? a.scale : 5;
      var head = '<h3>' + esc(a.title) + tag('accepted', D.assessmentKind[a.kind] || a.kind) + '</h3>';
      var subs = [];
      if (a.assessedAt) subs.push(S.assessedAt + ': ' + fmtDay(a.assessedAt));
      subs.push(S.scale + ': 0–' + scale);
      var sub = '<div class="sub">' + esc(subs.join(' · ')) + '</div>';
      var factors = (a.factors || []).map(function (f) {
        /* 数値は記録された値をそのまま出し、バーの長さだけ尺度に収める
           (尺度外の値が入っていても表示を書き換えないため) */
        var curVal = Number(f.current) || 0;
        var tgtVal = Number(f.target) || 0;
        var cur = Math.max(0, Math.min(scale, curVal));
        var tgt = Math.max(0, Math.min(scale, tgtVal));
        var gap = Math.round((tgtVal - curVal) * 100) / 100;
        var hint = S.current + ': ' + curVal + ' / ' + S.target + ': ' + tgtVal;
        return '<div class="fn">' + esc(f.name) + (f.note ? '<small>' + esc(f.note) + '</small>' : '') + '</div>'
          + '<div class="fb" title="' + esc(hint) + '">'
          + '<i style="width:' + (cur / scale * 100) + '%"></i>'
          + '<b style="left:calc(' + (tgt / scale * 100) + '% - 1px)" title="' + esc(S.target + ': ' + tgtVal) + '"></b>'
          + '</div>'
          + '<div class="fv">' + esc(curVal + ' / ' + tgtVal + ' (' + S.gap + ' ' + (gap > 0 ? '+' : '') + gap + ')') + '</div>';
      }).join('');
      var summary = a.summary ? '<p class="empty">' + esc(S.summary + ': ' + a.summary) + '</p>' : '';
      return '<div class="asmt">' + head + sub
        + (factors ? '<div class="af">' + factors + '</div>' : empty())
        + summary + '</div>';
    }).join('');
    return section(S.assessments, list.length, body, 'assessments');
  }

  /* --- 目次ナビ --- */
  function renderToc() {
    if (navItems.length < 2) { toc.innerHTML = ''; return; }
    toc.innerHTML = '<span class="who">' + esc(S.contents) + '</span>' + navItems.map(function (item) {
      return '<a href="#' + esc(item.id) + '">' + esc(item.title) + '</a>';
    }).join('');
  }

  /* --- フィルタのトグルを配線する(IIFE 内の関数を参照するため描画後に付ける) --- */
  function wireToggles() {
    var buttons = root.querySelectorAll('[data-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].onclick = function (ev) {
        var key = ev.currentTarget.getAttribute('data-toggle');
        if (key === 'risks') state.openRisksOnly = !state.openRisksOnly;
        else if (key === 'actions') state.openActionsOnly = !state.openActionsOnly;
        render();
      };
    }
  }

  function render() {
    var e = state.engagement;
    navItems = [];
    if (!e) {
      document.getElementById('title').textContent = S.dashboard;
      document.getElementById('meta').textContent = '';
      toc.innerHTML = '';
      root.innerHTML = '<section><p class="empty">' + esc(S.noEngagement) + '</p></section>';
      return;
    }
    document.title = e.name + ' — TOGAF 10 EAP';
    document.getElementById('title').textContent = S.dashboard + ': ' + e.name;
    var cur = D.phases.filter(function (p) { return p.id === e.currentPhaseId; })[0];
    var meta = [];
    if (e.client) meta.push('<span>' + esc(S.client) + ': ' + esc(e.client) + '</span>');
    if (e.industry) meta.push('<span>' + esc(S.industry) + ': ' + esc(e.industry) + '</span>');
    meta.push('<span>' + esc(S.currentPhase) + ': ' + esc(cur ? cur.code + '. ' + cur.name : e.currentPhaseId) + '</span>');
    if (e.archived) meta.push('<span>' + esc(S.archived) + '</span>');
    meta.push('<span>' + esc(S.updatedAt) + ': ' + fmtDate(e.updatedAt) + '</span>');
    document.getElementById('meta').innerHTML = meta.join('');

    var html = renderProgress(e);
    if (e.description || e.scope) {
      var d = '';
      if (e.description) d += '<p>' + esc(e.description) + '</p>';
      if (e.scope) d += '<p><strong>' + esc(S.scope) + '</strong>: ' + esc(e.scope) + '</p>';
      html += section(S.description, null, d, 'overview');
    }
    html += renderPhases(e)
      + renderRoadmap(e)
      + renderStakeholders(e)
      + renderStakeholderMatrix(e)
      + renderRisks(e)
      + renderRiskMatrix(e)
      + renderDecisions(e)
      + renderActions(e)
      + renderDeliverables(e)
      + renderAssessments(e);
    if (e.notes && e.notes.length) {
      html += section(S.notes, e.notes.length, '<ul class="notes">' + e.notes.map(function (n) {
        return '<li>' + esc(n) + '</li>';
      }).join('') + '</ul>', 'notes');
    }
    root.innerHTML = html;
    renderToc();
    wireToggles();
    document.getElementById('gen').textContent = S.generated + ': ' + fmtDate(new Date().toISOString());
  }

  /* --- テーマ(自動 → ライト → ダークの順に切り替え、localStorage に保存) --- */
  var THEME_KEY = 'togaf-eap-theme';
  function currentTheme() {
    try {
      var t = localStorage.getItem(THEME_KEY);
      return t === 'light' || t === 'dark' ? t : 'auto';
    } catch (err) {
      return 'auto';
    }
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

  function load() {
    fetch('/api/state', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { state.engagement = j.engagement; render(); })
      .catch(function () { /* 次の SSE / 再接続で回復する */ });
  }

  function setConn(ok) {
    document.getElementById('dot').className = 'dot' + (ok ? '' : ' off');
    document.getElementById('conn').textContent = ok ? S.live : S.reconnecting;
  }

  function connect() {
    var es = new EventSource('/events');
    es.onopen = function () { setConn(true); };
    es.onmessage = function () { load(); };
    es.onerror = function () {
      setConn(false);
      es.close();
      setTimeout(connect, 2000);
    };
  }

  load();
  connect();
})();
</script>
</body>
</html>
`;
}
