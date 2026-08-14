/**
 * HTML ダッシュボード / HTML dashboard.
 *
 * 自己完結した 1 ファイルの HTML を生成する(外部 CDN 参照なし)。
 * ページ内 JS が /api/state を取得して描画し、/events の SSE で
 * 状態ファイルの変更を検知して再描画する。印刷用 CSS 付き。
 */

import { ADM_PHASES, type Lang } from '../knowledge/index.js';
import {
  ACTION_STATUS_LABEL,
  DECISION_STATUS_LABEL,
  DELIVERABLE_STATUS_LABEL,
  INFLUENCE_LABEL,
  L,
  PHASE_STATUS_LABEL,
  PRIORITY_LABEL,
  RISK_LEVEL_LABEL,
  RISK_STATUS_LABEL,
  label,
} from './labels.js';

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
  };

  return `<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'ja'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TOGAF 10 EAP — ${strings.dashboard}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232f5d8a'/%3E%3Ctext x='16' y='23' font-size='15' font-family='sans-serif' font-weight='700' text-anchor='middle' fill='white'%3EEA%3C/text%3E%3C/svg%3E">
<style>
:root {
  --bg: #f5f6f8;
  --panel: #ffffff;
  --ink: #1c1f24;
  --muted: #6b7280;
  --line: #e2e5ea;
  --accent: #2f5d8a;
  --accent-soft: #e8f0f8;
  --ok: #2f7a54;
  --warn: #b7791f;
  --high: #c05621;
  --crit: #a32b2b;
  --radius: 10px;
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
    --ok: #6cc08b;
    --warn: #d9a441;
    --high: #e08a4e;
    --crit: #e06c6c;
  }
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
.controls { display: flex; align-items: center; gap: 10px; }
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
section { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; margin-top: 16px; }
section > h2 { font-size: 15px; margin: 0 0 12px; display: flex; align-items: baseline; gap: 8px; }
section > h2 .count { font-size: 12px; color: var(--muted); font-weight: 400; }
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
.tag.not_started { color: var(--muted); }
.tag.in_progress { color: var(--accent); border-color: var(--accent); }
.tag.completed { color: var(--ok); border-color: var(--ok); }
.tag.skipped { color: var(--muted); opacity: .65; }
.tag.low { color: var(--muted); }
.tag.medium, .tag.drafting, .tag.proposed, .tag.mitigating, .tag.review { color: var(--warn); border-color: var(--warn); }
.tag.high, .tag.blocked { color: var(--high); border-color: var(--high); }
.tag.critical, .tag.open, .tag.rejected { color: var(--crit); border-color: var(--crit); }
.tag.done, .tag.closed, .tag.accepted, .tag.approved, .tag.baselined { color: var(--ok); border-color: var(--ok); }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 600; }
tr:last-child td { border-bottom: none; }
td.c, th.c { text-align: center; white-space: nowrap; }
td.n, th.n { white-space: nowrap; }
.empty { color: var(--muted); font-size: 13px; }
.decision { border-left: 3px solid var(--line); padding: 2px 0 2px 14px; margin-bottom: 14px; }
.decision:last-child { margin-bottom: 0; }
.decision h3 { font-size: 14px; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.decision dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; font-size: 13px; }
.decision dt { color: var(--muted); }
.decision dd { margin: 0; }
ul.notes { margin: 0; padding-left: 20px; }
footer { margin-top: 24px; color: var(--muted); font-size: 12px; text-align: center; }
@media print {
  body { background: #fff; color: #000; padding: 0; font-size: 11pt; }
  .controls, footer .hint { display: none !important; }
  section { border: 1px solid #ccc; box-shadow: none; break-inside: avoid; page-break-inside: avoid; margin-top: 10pt; }
  .phase.current { background: #f0f0f0 !important; }
  .tag { border-color: #999 !important; color: #000 !important; }
  a { color: #000; text-decoration: none; }
  h1 { font-size: 16pt; }
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
      <button onclick="window.print()" id="printBtn"></button>
    </div>
  </header>
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
  function tag(cls, txt) { return '<span class="tag ' + esc(cls) + '">' + esc(txt) + '</span>'; }
  function section(title, count, body) {
    return '<section><h2>' + esc(title) + (count === null ? '' : '<span class="count">' + count + '</span>') + '</h2>' + body + '</section>';
  }
  function empty() { return '<p class="empty">' + esc(S.none) + '</p>'; }
  function table(headers, rows) {
    if (!rows.length) return empty();
    var th = headers.map(function (h) {
      return '<th' + (h.c ? ' class="c"' : h.n ? ' class="n"' : '') + '>' + esc(h.t) + '</th>';
    }).join('');
    return '<table><thead><tr>' + th + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  }

  function renderProgress(e) {
    var counts = { completed: 0, in_progress: 0, not_started: 0, skipped: 0 };
    e.phases.forEach(function (p) { counts[p.status] = (counts[p.status] || 0) + 1; });
    var effective = e.phases.length - counts.skipped;
    var pct = effective > 0 ? Math.round(((counts.completed + counts.in_progress * 0.5) / effective) * 100) : 0;
    var openRisks = e.risks.filter(function (r) { return r.status === 'open' || r.status === 'mitigating'; }).length;
    var openActions = e.actions.filter(function (a) { return a.status !== 'done'; }).length;
    var stat = function (n, k) { return '<div class="stat"><div class="n">' + n + '</div><div class="k">' + esc(k) + '</div></div>'; };
    return '<section>'
      + '<div class="bar"><i style="width:' + pct + '%"></i></div>'
      + '<div class="stats">'
      + stat(pct + '%', S.progress)
      + stat(counts.completed + '/' + effective, S.admProgress)
      + stat(openRisks, S.risks + ' (' + S.openItems + ')')
      + stat(openActions, S.actions + ' (' + S.openItems + ')')
      + stat(e.decisions.length, S.decisions)
      + stat(e.deliverables.length, S.deliverables)
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
    return section(S.admProgress, null, '<div class="phases">' + rows + '</div>');
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
      rows));
  }

  function renderRisks(e) {
    var order = { critical: 0, high: 1, medium: 2, low: 3 };
    var rows = e.risks.slice().sort(function (a, b) { return order[a.level] - order[b.level]; }).map(function (r) {
      return '<tr><td>' + esc(r.title) + (r.description ? '<br><span class="empty">' + esc(r.description) + '</span>' : '')
        + '</td><td class="c">' + tag(r.level, D.riskLevel[r.level] || r.level)
        + '</td><td class="c">' + (r.residualLevel ? tag(r.residualLevel, D.riskLevel[r.residualLevel]) : '')
        + '</td><td class="c">' + tag(r.status, D.riskStatus[r.status] || r.status)
        + '</td><td class="n">' + esc(r.owner) + '</td><td>' + esc(r.mitigation) + '</td></tr>';
    });
    return section(S.risks, e.risks.length, table(
      [{ t: S.title }, { t: S.level, c: 1 }, { t: S.residual, c: 1 }, { t: S.status, c: 1 }, { t: S.owner, n: 1 }, { t: S.mitigation }],
      rows));
  }

  function renderDecisions(e) {
    if (!e.decisions.length) return section(S.decisions, 0, empty());
    var body = e.decisions.map(function (d) {
      var dl = '';
      if (d.context) dl += '<dt>' + esc(S.description) + '</dt><dd>' + esc(d.context) + '</dd>';
      dl += '<dt>' + esc(S.decision) + '</dt><dd>' + esc(d.decision) + '</dd>';
      if (d.rationale) dl += '<dt>' + esc(S.rationale) + '</dt><dd>' + esc(d.rationale) + '</dd>';
      if (d.decidedBy) dl += '<dt>' + esc(S.decidedBy) + '</dt><dd>' + esc(d.decidedBy) + '</dd>';
      return '<div class="decision"><h3>' + esc(d.title) + tag(d.status, D.decisionStatus[d.status] || d.status)
        + '</h3><dl>' + dl + '</dl></div>';
    }).join('');
    return section(S.decisions, e.decisions.length, body);
  }

  function renderActions(e) {
    var prio = { high: 0, medium: 1, low: 2 };
    var rows = e.actions.slice().sort(function (a, b) {
      return (a.status === 'done') - (b.status === 'done') || prio[a.priority] - prio[b.priority];
    }).map(function (a) {
      return '<tr><td>' + esc(a.title) + (a.note ? '<br><span class="empty">' + esc(a.note) + '</span>' : '')
        + '</td><td class="n">' + esc(a.owner) + '</td><td class="n">' + esc(a.due)
        + '</td><td class="c">' + tag(a.priority, D.priority[a.priority] || a.priority)
        + '</td><td class="c">' + tag(a.status, D.actionStatus[a.status] || a.status) + '</td></tr>';
    });
    return section(S.actions, e.actions.length, table(
      [{ t: S.title }, { t: S.owner, n: 1 }, { t: S.due, n: 1 }, { t: S.priority, c: 1 }, { t: S.status, c: 1 }], rows));
  }

  function renderDeliverables(e) {
    var codes = {};
    D.phases.forEach(function (p) { codes[p.id] = p.code; });
    var rows = e.deliverables.map(function (d) {
      var link = d.link ? '<a href="' + esc(d.link) + '">' + esc(d.link) + '</a>' : '';
      return '<tr><td>' + esc(d.name) + (d.note ? '<br><span class="empty">' + esc(d.note) + '</span>' : '')
        + '</td><td class="c">' + esc(codes[d.phaseId] || '')
        + '</td><td class="c">' + tag(d.status, D.deliverableStatus[d.status] || d.status)
        + '</td><td class="n">' + esc(d.owner) + '</td><td>' + link + '</td></tr>';
    });
    return section(S.deliverables, e.deliverables.length, table(
      [{ t: S.title }, { t: S.phase, c: 1 }, { t: S.status, c: 1 }, { t: S.owner, n: 1 }, { t: S.link }], rows));
  }

  function render(e) {
    if (!e) {
      document.getElementById('title').textContent = S.dashboard;
      document.getElementById('meta').textContent = '';
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
    meta.push('<span>' + esc(S.updatedAt) + ': ' + fmtDate(e.updatedAt) + '</span>');
    document.getElementById('meta').innerHTML = meta.join('');

    var html = renderProgress(e);
    if (e.description || e.scope) {
      var d = '';
      if (e.description) d += '<p>' + esc(e.description) + '</p>';
      if (e.scope) d += '<p><strong>' + esc(S.scope) + '</strong>: ' + esc(e.scope) + '</p>';
      html += section(S.description, null, d);
    }
    html += renderPhases(e) + renderStakeholders(e) + renderRisks(e)
      + renderDecisions(e) + renderActions(e) + renderDeliverables(e);
    if (e.notes && e.notes.length) {
      html += section(S.notes, e.notes.length, '<ul class="notes">' + e.notes.map(function (n) {
        return '<li>' + esc(n) + '</li>';
      }).join('') + '</ul>');
    }
    root.innerHTML = html;
    document.getElementById('gen').textContent = S.generated + ': ' + fmtDate(new Date().toISOString());
  }

  function load() {
    fetch('/api/state', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { render(j.engagement); })
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
