#!/usr/bin/env node
/**
 * 開発進捗ライブダッシュボード / Development progress live dashboard.
 *
 * `.dev-progress/*.json`(1 タスク 1 ファイル)を集約してブラウザに表示する。
 * ディレクトリを watch し、変更を SSE で push するのでリロード不要。
 *
 *   node scripts/dev-dashboard.mjs            # 起動してブラウザを開く
 *   node scripts/dev-dashboard.mjs --no-open  # ブラウザは開かない
 *   PORT=7799 node scripts/dev-dashboard.mjs
 *
 * 依存ゼロ(node 標準モジュールのみ)。
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, watch } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PROGRESS_DIR = resolve(here, '..', '.dev-progress');
const PORT = Number.parseInt(process.env.PORT ?? '7799', 10);
const HOST = '127.0.0.1';
const openBrowser = !process.argv.includes('--no-open');

function readAll() {
  if (!existsSync(PROGRESS_DIR)) mkdirSync(PROGRESS_DIR, { recursive: true });
  const tasks = [];
  for (const name of readdirSync(PROGRESS_DIR)) {
    if (!name.endsWith('.json')) continue;
    try {
      tasks.push(JSON.parse(readFileSync(join(PROGRESS_DIR, name), 'utf8')));
    } catch {
      // 書き込み途中のファイルは次の watch イベントで読み直す
    }
  }
  return tasks.sort(
    (a, b) => String(a.phase ?? '').localeCompare(String(b.phase ?? '')) || String(a.id).localeCompare(String(b.id)),
  );
}

const PAGE = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TOGAF 10 EAP MCP — 開発進捗</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232f5d8a'/%3E%3Ctext x='16' y='23' font-size='15' font-family='sans-serif' font-weight='700' text-anchor='middle' fill='white'%3E%E2%9A%99%3C/text%3E%3C/svg%3E">
<style>
:root {
  --bg:#0f1216; --panel:#171b21; --panel2:#1d222a; --ink:#e7eaef; --muted:#8b94a1; --line:#2a3039;
  --accent:#5b9bd5; --run:#d9a441; --done:#5cc08b; --block:#e08a4e; --fail:#e06c6c; --review:#a78bfa;
}
@media (prefers-color-scheme: light) {
  :root { --bg:#f4f6f8; --panel:#fff; --panel2:#f7f9fb; --ink:#1b1f25; --muted:#69727e; --line:#e2e6ec;
          --accent:#2f5d8a; --run:#b7791f; --done:#2f7a54; --block:#c05621; --fail:#a32b2b; --review:#7c5cd6; }
}
*{box-sizing:border-box}
body{margin:0;padding:22px 20px 60px;background:var(--bg);color:var(--ink);
  font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP","Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.6}
.wrap{max-width:1180px;margin:0 auto}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
h1{font-size:20px;margin:0 0 2px}
.sub{color:var(--muted);font-size:12.5px}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:3px 11px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--muted)}
.dot{width:7px;height:7px;border-radius:50%;background:var(--done)}
.dot.off{background:var(--fail)}
.bar{height:9px;border-radius:999px;background:var(--line);overflow:hidden;margin:16px 0 10px}
.bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--done));transition:width .5s ease}
.counts{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:18px}
.counts b{font-size:19px;font-weight:600}
.counts span{color:var(--muted);font-size:12px;margin-left:5px}
.phase{margin-top:22px}
.phase h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 10px;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--line);border-radius:9px;padding:12px 14px}
.card.running{border-left-color:var(--run)}
.card.done{border-left-color:var(--done)}
.card.review{border-left-color:var(--review)}
.card.blocked{border-left-color:var(--block)}
.card.failed{border-left-color:var(--fail)}
.card h3{font-size:13.5px;margin:0 0 5px;display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.tag{font-size:10.5px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.tag.running{color:var(--run);border-color:var(--run)}
.tag.done{color:var(--done);border-color:var(--done)}
.tag.review{color:var(--review);border-color:var(--review)}
.tag.blocked{color:var(--block);border-color:var(--block)}
.tag.failed{color:var(--fail);border-color:var(--fail)}
.meta{color:var(--muted);font-size:11.5px;margin-bottom:6px}
.files{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}
.files code{background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:1px 6px;font-size:11px;color:var(--muted)}
.log{margin:8px 0 0;padding:0;list-style:none;border-top:1px solid var(--line);padding-top:7px}
.log li{font-size:12px;color:var(--muted);display:flex;gap:8px}
.log li time{flex:none;font-variant-numeric:tabular-nums;opacity:.75}
.empty{color:var(--muted);padding:40px 0;text-align:center}
footer{margin-top:26px;color:var(--muted);font-size:11.5px;text-align:center}
.spin{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--run);animation:p 1.1s ease-in-out infinite}
@keyframes p{0%,100%{opacity:.25}50%{opacity:1}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>TOGAF 10 EAP MCP — 開発進捗</h1>
      <div class="sub" id="sub">並列エージェントの作業状況をライブ表示しています</div>
    </div>
    <span class="pill"><span class="dot" id="dot"></span><span id="conn">ライブ更新中</span></span>
  </header>
  <div class="bar"><i id="bar" style="width:0%"></i></div>
  <div class="counts" id="counts"></div>
  <div id="root"></div>
  <footer id="gen"></footer>
</div>
<script>
function esc(v){return v==null?'':String(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function hhmm(iso){var d=new Date(iso);if(isNaN(d))return '';var p=function(n){return String(n).padStart(2,'0')};return p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds())}
var LABEL={pending:'待機',running:'作業中',review:'レビュー',done:'完了',blocked:'ブロック',failed:'失敗'};
var PHASE_LABEL={implement:'実装(並列)',review:'レビュー',integrate:'統合・検証',plan:'計画'};

function render(tasks){
  var root=document.getElementById('root');
  if(!tasks.length){root.innerHTML='<div class="empty">タスクがまだ登録されていません</div>';return}
  var counts={pending:0,running:0,review:0,done:0,blocked:0,failed:0};
  tasks.forEach(function(t){counts[t.status]=(counts[t.status]||0)+1});
  var total=tasks.length, pct=Math.round((counts.done/total)*100);
  document.getElementById('bar').style.width=pct+'%';
  document.getElementById('counts').innerHTML=
    '<div><b>'+pct+'%</b><span>完了率</span></div>'+
    ['done','running','review','pending','blocked','failed'].map(function(k){
      return counts[k]?'<div><b>'+counts[k]+'</b><span>'+LABEL[k]+'</span></div>':''
    }).join('');

  var phases={};
  tasks.forEach(function(t){var p=t.phase||'implement';(phases[p]=phases[p]||[]).push(t)});
  var html='';
  Object.keys(phases).sort().forEach(function(p){
    html+='<div class="phase"><h2>'+esc(PHASE_LABEL[p]||p)+'</h2><div class="grid">';
    phases[p].forEach(function(t){
      var log=(t.log||[]).slice(-4).map(function(l){
        return '<li><time>'+hhmm(l.at)+'</time><span>'+esc(l.note)+'</span></li>'}).join('');
      html+='<div class="card '+esc(t.status)+'">'
        +'<h3><span>'+(t.status==='running'?'<span class="spin"></span> ':'')+esc(t.title||t.id)+'</span>'
        +'<span class="tag '+esc(t.status)+'">'+esc(LABEL[t.status]||t.status)+'</span></h3>'
        +'<div class="meta">'+esc(t.id)+(t.owner?' · '+esc(t.owner):'')+'</div>'
        +((t.files&&t.files.length)?'<div class="files">'+t.files.map(function(f){return '<code>'+esc(f)+'</code>'}).join('')+'</div>':'')
        +(log?'<ul class="log">'+log+'</ul>':'')
        +'</div>';
    });
    html+='</div></div>';
  });
  root.innerHTML=html;
  document.getElementById('gen').textContent='最終更新 '+hhmm(new Date().toISOString())+' — .dev-progress/ を監視中';
}
function load(){fetch('/api/tasks',{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){render(j.tasks)}).catch(function(){})}
function setConn(ok){document.getElementById('dot').className='dot'+(ok?'':' off');document.getElementById('conn').textContent=ok?'ライブ更新中':'再接続中…'}
function connect(){var es=new EventSource('/events');es.onopen=function(){setConn(true)};es.onmessage=function(){load()};
  es.onerror=function(){setConn(false);es.close();setTimeout(connect,2000)}}
load();connect();
</script>
</body>
</html>
`;

const clients = new Set();

const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  if (url === '/api/tasks') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ tasks: readAll() }));
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
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(PAGE);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

function broadcast() {
  const payload = `data: ${JSON.stringify({ ts: Date.now() })}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

if (!existsSync(PROGRESS_DIR)) mkdirSync(PROGRESS_DIR, { recursive: true });
let timer = null;
watch(PROGRESS_DIR, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(broadcast, 90);
});
setInterval(() => {
  for (const client of clients) {
    try {
      client.write(': ping\n\n');
    } catch {
      clients.delete(client);
    }
  }
}, 20000);

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log(`dev dashboard: ${url}`);
  console.log(`watching:      ${PROGRESS_DIR}`);
  if (openBrowser) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    try {
      const child = spawn(cmd, process.platform === 'win32' ? ['', url] : [url], {
        stdio: 'ignore',
        detached: true,
        shell: process.platform === 'win32',
      });
      child.on('error', () => undefined);
      child.unref();
    } catch {
      // 開けなくても URL は出力済み
    }
  }
});
