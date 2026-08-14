#!/usr/bin/env node
/**
 * スクリーンショット撮影用にダッシュボードだけを起動する / Start the dashboard alone, for screenshots.
 *
 * `open_dashboard` ツールでも同じサーバーが起動するが、`scripts/mcp-cli.mjs` は呼び出しが
 * 終わると MCP サーバーごと終了するため、撮影中はページが落ちる。ここではビルド済みの
 * `dist/` をそのまま読み込み、プロセスを生かしたままにする。**ブラウザは開かない**
 * (`TOGAF_EAP_NO_BROWSER=1` を自分で設定する)。
 *
 *   node pic/screenshots/capture/serve.mjs [dataDir] [port] [lang]
 *   既定: /tmp/togaf-eap-demo 38702 both
 *
 * 事前に `npm run build` が済んでいること。
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');

const [dataDir = '/tmp/togaf-eap-demo', port = '38702', lang = 'both'] = process.argv.slice(2);

process.env.TOGAF_EAP_DATA_DIR = resolve(dataDir);
process.env.TOGAF_EAP_NO_BROWSER = '1';
process.env.TOGAF_EAP_DASHBOARD_PORT = port;

const mod = pathToFileURL(resolve(repo, 'dist', 'dashboard', 'httpServer.js')).href;
const { startDashboard } = await import(mod);
const info = await startDashboard(lang);
console.log(`READY ${info.url} (lang=${lang}, data=${process.env.TOGAF_EAP_DATA_DIR})`);
