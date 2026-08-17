#!/usr/bin/env node
/**
 * `tools/list` の大きさを**同じ測り方で**測る / Measure the size of `tools/list`, the same way every time.
 *
 * ── 何を測っているか(ここが揃っていないと波ごとに違う数字が出る)────────────
 *
 *   正となる数字は **`JSON.stringify(result.tools)` の UTF-8 バイト数**。
 *   The single authoritative number is the UTF-8 byte length of
 *   `JSON.stringify(result.tools)` — the `tools` **array**, not the whole
 *   JSON-RPC `result` object, not the framed response line.
 *
 *   `result` 全体には `nextCursor` などの封筒が混ざる。封筒はモデルの文脈を
 *   占めないので数えない。逆に `tools` 配列は 1 バイト残らずモデルに渡る。
 *   だから配列だけを数える。過去に 99,619 / 105,788 / 118,897 と数字が揺れたのは
 *   この境界が人によって違ったため。
 *
 *   内訳の 2 つも同じ配列から取る:
 *     descriptions … 各ツールの `description` の合計(ツール直下の 1 本だけ)
 *     schemas      … 各ツールの `JSON.stringify(inputSchema)` の合計
 *   この 2 つの和は全体より小さい(name / title / 区切り記号のぶん)。
 *
 *   tokens は概算。ASCII を 1/4、非 ASCII を 0.6 トークンとして数えるだけで、
 *   実トークナイザではない。増減の傾向を見るためのもの。
 *
 * ── 使い方 / Usage ──────────────────────────────────────────────────────────
 *
 *   node scripts/measure-tools.mjs           # 人が読む表
 *   node scripts/measure-tools.mjs --json    # 機械可読(CI で追う用)
 *   node scripts/measure-tools.mjs --top 20  # 重い順の表示件数(既定 10)
 *   node scripts/measure-tools.mjs --tool update_engagement   # 1 ツールだけ詳しく
 *
 * 終了コード / Exit code: 日英併記の欠けが 1 件でもあれば 1(--json でも同じ)。
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '..', 'dist', 'index.js');

const bytes = (s) => Buffer.byteLength(String(s ?? ''), 'utf8');

/** 概算トークン。ASCII は 4 文字で 1、非 ASCII(日本語)は 1 文字で 0.6 とみなす。 */
function approxTokens(s) {
  const text = String(s ?? '');
  let ascii = 0;
  let wide = 0;
  for (const ch of text) {
    if (ch.codePointAt(0) < 128) ascii += 1;
    else wide += 1;
  }
  return Math.round(ascii / 4 + wide * 0.6);
}

// --- 日英併記の判定 / Bilingual check ---------------------------------------
// 説明文は「日本語 / English」の形で書く約束。スラッシュ(後ろに空白があるもの)か
// 改行で切って、日本語を含む断片と、日本語を含まず英単語を含む断片の**両方**が
// あれば併記とみなす。`)/ Return ...` のように前の空白が無い書き方も拾う。
// 英単語は小文字を含む 2 文字以上のラテン語(YYYY-MM-DD のような書式は英語と数えない)。
const JA = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;
const EN_WORD = /[A-Za-z][a-z]+/;

function classify(text) {
  const value = String(text ?? '');
  if (!value.trim()) return 'empty';
  const parts = value.split(/\s*\/\s+|\n/).filter((p) => p.trim());
  const hasJa = parts.some((p) => JA.test(p));
  const hasEn = parts.some((p) => !JA.test(p) && EN_WORD.test(p));
  if (hasJa && hasEn) return 'both';
  if (hasJa) return 'ja-only';
  if (hasEn) return 'en-only';
  return 'neutral'; // 記号・数字だけ。判定対象にしない
}

/** 入力スキーマを歩いて、説明文の付いた場所を全部拾う。 */
function walkSchema(node, path, out) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.description === 'string') {
    out.push({ path, description: node.description });
  }
  if (node.properties && typeof node.properties === 'object') {
    for (const [key, child] of Object.entries(node.properties)) {
      walkSchema(child, path ? `${path}.${key}` : key, out);
    }
  }
  if (node.items) walkSchema(node.items, `${path}[]`, out);
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    if (Array.isArray(node[key])) node[key].forEach((child, i) => walkSchema(child, `${path}|${key}${i}`, out));
  }
  if (node.additionalProperties && typeof node.additionalProperties === 'object') {
    walkSchema(node.additionalProperties, `${path}.*`, out);
  }
}

// --- stdio JSON-RPC の最小クライアント / Minimal stdio JSON-RPC client -------
async function fetchTools() {
  const dataDir = mkdtempSync(join(tmpdir(), 'togaf-eap-measure-'));
  const child = spawn(process.execPath, [entry], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TOGAF_EAP_DATA_DIR: dataDir,
      TOGAF_EAP_DASHBOARD_PORT: '0',
      TOGAF_EAP_NO_BROWSER: '1',
    },
  });
  child.stderr.resume();

  let buffer = '';
  const pending = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const resolver = pending.get(message.id);
      if (resolver) {
        pending.delete(message.id);
        resolver(message);
      }
    }
  });

  let nextId = 1;
  const request = (method, params) =>
    new Promise((resolvePromise, reject) => {
      const id = nextId;
      nextId += 1;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }, 60000);
      pending.set(id, (message) => {
        clearTimeout(timer);
        resolvePromise(message);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });

  try {
    await request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'measure-tools', version: '1.0.0' },
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
    const response = await request('tools/list', {});
    if (response.error) throw new Error(`tools/list failed: ${JSON.stringify(response.error)}`);
    return response.result?.tools ?? [];
  } finally {
    child.stdin.end();
    child.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

// --- 集計 / Aggregate --------------------------------------------------------
function measure(tools) {
  const totalBytes = bytes(JSON.stringify(tools));

  const perTool = [];
  const gaps = [];
  const descCounts = new Map();
  let undescribed = 0;

  for (const tool of tools) {
    const schemaJson = JSON.stringify(tool.inputSchema ?? {});
    const nested = [];
    walkSchema(tool.inputSchema, '', nested);

    const entryBytes = bytes(JSON.stringify(tool));
    perTool.push({
      name: tool.name,
      bytes: entryBytes,
      descriptionBytes: bytes(tool.description),
      schemaBytes: bytes(schemaJson),
      argDescriptionBytes: nested.reduce((sum, n) => sum + bytes(n.description), 0),
      args: Object.keys(tool.inputSchema?.properties ?? {}).length,
      tokens: approxTokens(JSON.stringify(tool)),
    });

    const check = (where, text) => {
      const kind = classify(text);
      if (kind === 'ja-only' || kind === 'en-only') {
        gaps.push({ tool: tool.name, where, kind, bytes: bytes(text), text: String(text) });
      }
    };
    check('description', tool.description);
    for (const n of nested) check(n.path || '(schema)', n.description);

    // 重複は「引数の説明」だけでなく「ツールの説明」も見る(同じ文が 3 本のツールに
    // 貼られていたら、それは 3 倍の文脈を食っている)。
    for (const n of [...nested, { path: 'description', description: tool.description ?? '' }]) {
      if (!n.description) continue;
      const key = n.description;
      const seen = descCounts.get(key) ?? { count: 0, bytes: bytes(key), where: [] };
      seen.count += 1;
      seen.where.push(`${tool.name}.${n.path}`);
      descCounts.set(key, seen);
    }
    const described = new Set(nested.map((n) => n.path));
    for (const key of Object.keys(tool.inputSchema?.properties ?? {})) {
      if (!described.has(key)) undescribed += 1;
    }
  }

  const repeated = [...descCounts.entries()]
    .filter(([, v]) => v.count >= 3)
    .map(([text, v]) => ({
      text,
      count: v.count,
      bytes: v.bytes,
      totalBytes: v.bytes * v.count,
      where: v.where,
    }))
    .sort((a, b) => b.totalBytes - a.totalBytes);

  return {
    measuredAs: 'Buffer.byteLength(JSON.stringify(result.tools), "utf8")',
    tools: tools.length,
    totalBytes,
    descriptionBytes: perTool.reduce((s, t) => s + t.descriptionBytes, 0),
    schemaBytes: perTool.reduce((s, t) => s + t.schemaBytes, 0),
    argDescriptionBytes: perTool.reduce((s, t) => s + t.argDescriptionBytes, 0),
    approxTokens: approxTokens(JSON.stringify(tools)),
    undescribedArgs: undescribed,
    perTool: perTool.sort((a, b) => b.bytes - a.bytes),
    repeatedDescriptions: repeated,
    bilingualGaps: gaps,
  };
}

// --- 表示 / Render -----------------------------------------------------------
const num = (n) => n.toLocaleString('en-US');
const clip = (s, n) => {
  const flat = String(s).replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
};

function render(report, topN, only) {
  const lines = [];
  lines.push('tools/list size — measured as JSON.stringify(result.tools), UTF-8 bytes');
  lines.push('');
  lines.push(`  tools                 ${num(report.tools)}`);
  lines.push(`  total bytes           ${num(report.totalBytes)}`);
  lines.push(`  descriptions          ${num(report.descriptionBytes)}  (tool-level only)`);
  lines.push(`  input schemas         ${num(report.schemaBytes)}  (of which arg descriptions ${num(report.argDescriptionBytes)})`);
  lines.push(`  approx tokens         ~${num(report.approxTokens)}  (ascii/4 + wide*0.6, not a real tokenizer)`);
  lines.push(`  args with no describe ${num(report.undescribedArgs)}`);
  lines.push('');

  const shown = only ? report.perTool.filter((t) => t.name === only) : report.perTool.slice(0, topN);
  if (only && shown.length === 0) lines.push(`no tool named "${only}" — check \`node scripts/mcp-cli.mjs tools\``);
  lines.push(only ? `${only}` : `Heaviest ${shown.length} tools`);
  lines.push('  bytes    schema   desc   args  name');
  for (const t of shown) {
    lines.push(
      `  ${String(num(t.bytes)).padStart(7)}  ${String(num(t.schemaBytes)).padStart(6)}  ${String(num(t.descriptionBytes)).padStart(5)}  ${String(t.args).padStart(4)}  ${t.name}`,
    );
  }
  lines.push('');

  lines.push(`Descriptions reused 3+ times (${report.repeatedDescriptions.length})`);
  if (report.repeatedDescriptions.length === 0) lines.push('  none');
  for (const r of report.repeatedDescriptions) {
    lines.push(`  x${r.count}  ${num(r.bytes)}B each  ${num(r.totalBytes)}B total  ${clip(r.text, 70)}`);
  }
  lines.push('');

  lines.push(`Bilingual gaps (${report.bilingualGaps.length})`);
  if (report.bilingualGaps.length === 0) lines.push('  none — every description carries both ja and en');
  for (const g of report.bilingualGaps) {
    lines.push(`  ${g.kind.padEnd(7)} ${g.tool}.${g.where}  ${clip(g.text, 60)}`);
  }
  return lines.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const topIndex = argv.indexOf('--top');
  const topN = topIndex >= 0 ? Number(argv[topIndex + 1]) || 10 : 10;
  const toolIndex = argv.indexOf('--tool');
  const only = toolIndex >= 0 ? argv[toolIndex + 1] : undefined;

  let tools;
  try {
    tools = await fetchTools();
  } catch (error) {
    console.error(`measure-tools: ${error instanceof Error ? error.message : String(error)}`);
    console.error('dist/index.js is missing or the server did not start — run `npm run build` first.');
    process.exit(2);
    return;
  }

  const report = measure(tools);
  if (asJson) console.log(JSON.stringify(report, null, 2));
  else console.log(render(report, topN, only));
  process.exit(report.bilingualGaps.length === 0 ? 0 : 1);
}

main();
