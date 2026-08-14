/**
 * ライブダッシュボードの HTTP サーバー / Live dashboard HTTP server.
 *
 * node:http のみで実装(依存追加なし)。
 *   GET /            ダッシュボード HTML
 *   GET /api/state   現在のエンゲージメント JSON
 *   GET /events      SSE。状態ファイルの変更を push する
 *   GET /health      死活確認
 *
 * 状態ファイルは fs.watch で監視し、同一プロセス内の保存は storeEvents でも検知する。
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
}

let running: RunningDashboard | null = null;

/** SSE クライアント全員に更新を通知する */
function broadcast(dash: RunningDashboard): void {
  const payload = `data: ${JSON.stringify({ ts: Date.now() })}\n\n`;
  for (const client of dash.clients) {
    try {
      client.write(payload);
    } catch {
      dash.clients.delete(client);
    }
  }
}

function handleRequest(dash: RunningDashboard, req: IncomingMessage, res: ServerResponse): void {
  const url = (req.url ?? '/').split('?')[0];

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
    return { url: running.url, port: running.port, alreadyRunning: true, statePath };
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
  };

  dash.onStoreChange = () => broadcast(dash);
  server.on('request', (req, res) => handleRequest(dash, req, res));

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

  // 同一プロセス内の保存を購読
  storeEvents.on('change', dash.onStoreChange);

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

  running = dash;
  return { url: dash.url, port: dash.port, alreadyRunning: false, statePath };
}

/** 起動中のダッシュボード情報(未起動なら null) */
export function getDashboardInfo(): DashboardInfo | null {
  if (!running) return null;
  return {
    url: running.url,
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
