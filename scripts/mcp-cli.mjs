#!/usr/bin/env node
/**
 * MCP サーバーを手で叩くための CLI / A CLI for driving the MCP server by hand.
 *
 * `dist/index.js` を stdio で起動し、MCP クライアントと同じ JSON-RPC で会話する。
 * 実際に Claude が呼ぶのと同じ経路なので、ツールの出力をそのまま目視できる。
 *
 *   node scripts/mcp-cli.mjs tools                     # ツール名の一覧
 *   node scripts/mcp-cli.mjs schema <tool>             # 入力スキーマ
 *   node scripts/mcp-cli.mjs call <tool> '<json>'      # ツール呼び出し
 *   node scripts/mcp-cli.mjs call <tool> --file a.json # 引数を JSON ファイルから
 *   node scripts/mcp-cli.mjs prompts                   # プロンプト一覧
 *   node scripts/mcp-cli.mjs prompt <name> '<json>'    # プロンプト取得
 *   node scripts/mcp-cli.mjs resources                 # リソース一覧
 *   node scripts/mcp-cli.mjs resource <uri>            # リソース読み取り
 *
 * オプション:
 *   --data-dir <path>   TOGAF_EAP_DATA_DIR を差し替える(既定は一時ディレクトリ)
 *   --keep-data         一時ディレクトリを消さない(パスを表示する)
 *   --raw               応答 JSON をそのまま出す
 *   --quiet             ヘッダを出さず本文だけ出す
 */

import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '..', 'dist', 'index.js');

function parseArgv(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      rest.push(arg);
    }
  }
  return { flags, rest };
}

class Client {
  constructor(child) {
    this.child = child;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.onData(chunk));
  }

  onData(chunk) {
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const resolver = this.pending.get(message.id);
      if (resolver) {
        this.pending.delete(message.id);
        resolver(message);
      }
    }
  }

  notify(method, params) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  request(method, params, timeoutMs = 60000) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }, timeoutMs);
      this.pending.set(id, (message) => {
        clearTimeout(timer);
        resolvePromise(message);
      });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }
}

function textOf(result) {
  return (result?.content ?? []).map((c) => c.text ?? '').join('\n');
}

async function main() {
  const { flags, rest } = parseArgv(process.argv.slice(2));
  const [command, ...args] = rest;
  const quiet = Boolean(flags.quiet);
  const raw = Boolean(flags.raw);

  const dataDir = flags['data-dir']
    ? resolve(String(flags['data-dir']))
    : mkdtempSync(join(tmpdir(), 'togaf-eap-cli-'));
  const temporary = !flags['data-dir'];

  // open_dashboard を呼ぶとブラウザが開き、CLI 終了と同時にサーバーも死ぬため
  // 「アクセスできません」のタブだけが残る。テスト用途では常に抑止する。
  // PATH の先頭に何もしない open/xdg-open/start を置いて無効化する
  // (サーバー側の TOGAF_EAP_NO_BROWSER にも対応しているが、古い dist でも効くようにこの方法を採る)。
  const shimDir = mkdtempSync(join(tmpdir(), 'togaf-eap-noopen-'));
  for (const name of ['open', 'xdg-open', 'start']) {
    const shim = join(shimDir, name);
    writeFileSync(shim, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(shim, 0o755);
  }

  const child = spawn(process.execPath, [entry], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TOGAF_EAP_DATA_DIR: dataDir,
      TOGAF_EAP_DASHBOARD_PORT: '0',
      TOGAF_EAP_NO_BROWSER: '1',
      PATH: `${shimDir}:${process.env.PATH ?? ''}`,
    },
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    if (!quiet) process.stderr.write(`[server] ${chunk}`);
  });

  const client = new Client(child);
  let exitCode = 0;

  try {
    await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-cli', version: '1.0.0' },
    });
    client.notify('notifications/initialized', {});

    const readArgs = (value) => {
      if (flags.file) return JSON.parse(readFileSync(resolve(String(flags.file)), 'utf8'));
      if (!value) return {};
      return JSON.parse(value);
    };

    switch (command) {
      case 'tools': {
        const response = await client.request('tools/list', {});
        const tools = response.result?.tools ?? [];
        if (raw) {
          console.log(JSON.stringify(tools, null, 2));
        } else {
          // 説明は日英併記で 1 本の文字列。' / ' で切ると英語側が消えて
          // 「日本語しか無い」と誤認されるため、全文を折り返して出す。
          for (const tool of tools) {
            const desc = (tool.description ?? '').replace(/\s+/g, ' ').trim();
            console.log(`${tool.name}\n    ${desc}`);
          }
          console.log(`\n${tools.length} tools`);
        }
        break;
      }
      case 'schema': {
        const response = await client.request('tools/list', {});
        const tool = (response.result?.tools ?? []).find((t) => t.name === args[0]);
        if (!tool) {
          console.error(`tool not found: ${args[0]}`);
          exitCode = 1;
          break;
        }
        console.log(JSON.stringify(tool.inputSchema, null, 2));
        break;
      }
      case 'call': {
        const response = await client.request('tools/call', {
          name: args[0],
          arguments: readArgs(args[1]),
        });
        if (response.error) {
          console.error(`protocol error: ${response.error.message}`);
          exitCode = 1;
          break;
        }
        if (raw) {
          console.log(JSON.stringify(response.result, null, 2));
        } else {
          if (!quiet && response.result?.isError) console.log('*** isError: true ***\n');
          console.log(textOf(response.result));
        }
        break;
      }
      case 'prompts': {
        const response = await client.request('prompts/list', {});
        const prompts = response.result?.prompts ?? [];
        for (const prompt of prompts) console.log(`${prompt.name}\n    ${prompt.description ?? ''}`);
        console.log(`\n${prompts.length} prompts`);
        break;
      }
      case 'prompt': {
        const response = await client.request('prompts/get', {
          name: args[0],
          arguments: readArgs(args[1]),
        });
        if (response.error) {
          console.error(`protocol error: ${response.error.message}`);
          exitCode = 1;
          break;
        }
        if (raw) console.log(JSON.stringify(response.result, null, 2));
        else {
          for (const message of response.result?.messages ?? []) {
            console.log(`--- ${message.role} ---`);
            console.log(message.content?.text ?? JSON.stringify(message.content));
          }
        }
        break;
      }
      case 'resources': {
        const listed = await client.request('resources/list', {});
        for (const resource of listed.result?.resources ?? []) {
          console.log(`${resource.uri}\n    ${resource.name ?? ''}`);
        }
        const templates = await client.request('resources/templates/list', {});
        for (const template of templates.result?.resourceTemplates ?? []) {
          console.log(`${template.uriTemplate}\n    ${template.name ?? ''}`);
        }
        break;
      }
      case 'resource': {
        const response = await client.request('resources/read', { uri: args[0] });
        if (response.error) {
          console.error(`protocol error: ${response.error.message}`);
          exitCode = 1;
          break;
        }
        for (const item of response.result?.contents ?? []) console.log(item.text ?? '');
        break;
      }
      default:
        console.error('usage: mcp-cli.mjs tools | schema <tool> | call <tool> \'<json>\' | prompts | prompt <name> | resources | resource <uri>');
        exitCode = 1;
    }
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    exitCode = 1;
  } finally {
    child.stdin.end();
    child.kill('SIGTERM');
    rmSync(shimDir, { recursive: true, force: true });
    if (temporary && !flags['keep-data']) rmSync(dataDir, { recursive: true, force: true });
    else if (!quiet) console.error(`[data dir] ${dataDir}`);
  }

  // process.exit() は書き込み待ちの stdout を捨てるため、パイプに繋ぐと
  // 64KB で出力が切れる(実測 65,536 バイト)。ここで打ち切られると
  // 「出力が短くなった」と誤って測ってしまうので、必ず書き切ってから終わる。
  await drainStdout();
  process.exit(exitCode);
}

/** stdout の書き込みが実際に流れ切るまで待つ */
function drainStdout() {
  return new Promise((resolve) => {
    if (process.stdout.write('')) resolve();
    else process.stdout.once('drain', resolve);
  });
}

main();
