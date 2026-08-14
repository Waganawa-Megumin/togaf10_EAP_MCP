/**
 * 出力が名指しするツール名の実在検査 / Every tool name printed by the source must exist.
 *
 * 実際に起きた事故: 出力に `get_industry_capability_set` という**存在しないツール名**が
 * ハードコードされ、4 人の利用者が「書いてあるとおり打って必ず止まる」状態になった。
 * `tests/prompts.test.ts` は prompts の本文だけを見ているので、ツール出力に埋め込まれた
 * 名前は素通りしていた。ここでは **`src/` のソース全体**を機械的に走査する。
 *
 * 検査のしかた:
 * 1. サーバーを実際に起動して、登録済みツール名・prompt 名・全引数名・全 enum 値を集める
 *    (手で書いた一覧は必ず古くなるので、権威は常に動いているサーバー側に置く)
 * 2. `src/**` の文字列からバッククォートに囲まれた snake_case 識別子を抜き出す
 * 3. 1 に無いものが残ったら落とす(既知の例外は ALLOWED に理由付きで書く)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/**
 * ツール名ではないと分かっている snake_case のトークン。
 *
 * **ここに足すときは必ず理由を書くこと。** 理由が書けないものは、たいてい
 * 「存在しないツール名を出力に書いてしまった」側の間違い。
 */
const ALLOWED = new Map<string, string>([
  // 追加する例:
  //   ['model_repository', 'Archi (.archimate) の XML 要素名であってツールではない'],
]);

/**
 * バッククォートに囲まれた snake_case 識別子(`some_tool_name`)。
 *
 * アンダースコアを必須にしているのは意図的。外すと `a` `true` `risk` のような
 * ただの語まで拾ってしまい(実測: 未知トークンが 0 個 → 45 個)、許可リストが
 * 肥大化して検査そのものが形骸化する。登録済み 84 ツールのうち
 * アンダースコアを持たないのは `consult` の 1 件だけなので、
 * **存在しないツール名は事実上すべて snake_case で書かれる**。
 */
const TOKEN = /`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g;

/** src 配下の .ts を全部集める */
function collectSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSources(full, out);
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * ソース 1 本からトークンを拾う。
 *
 * テンプレートリテラルの中では ` は `\`` と書かれるため、先にエスケープを外す。
 * 外さないと「テンプレートリテラルに書かれたツール名」を丸ごと見逃す
 * (実際、この形が出力側では一番多い)。
 */
function tokensIn(source: string): Set<string> {
  const unescaped = source.replace(/\\`/g, '`');
  const found = new Set<string>();
  for (const m of unescaped.matchAll(TOKEN)) found.add(m[1]!);
  return found;
}

/** JSON Schema を再帰して、引数名と enum 値を全部集める */
function collectSchemaNames(schema: unknown, out: Set<string>): void {
  if (!schema || typeof schema !== 'object') return;
  const s = schema as Record<string, unknown>;
  const props = s.properties;
  if (props && typeof props === 'object') {
    for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
      out.add(key);
      collectSchemaNames(value, out);
    }
  }
  if (Array.isArray(s.enum)) {
    for (const v of s.enum) if (typeof v === 'string') out.add(v);
  }
  if (s.items) collectSchemaNames(s.items, out);
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branch = s[key];
    if (Array.isArray(branch)) for (const b of branch) collectSchemaNames(b, out);
  }
}

let client: Client;
let dir: string;
const originalDir = process.env.TOGAF_EAP_DATA_DIR;

/** 登録済みツール名 */
let toolNames = new Set<string>();
/** ツール名以外に、出力に書いてよいと判断できる語(引数名・enum 値・prompt 名) */
let knownWords = new Set<string>();

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'togaf-eap-toolnames-'));
  process.env.TOGAF_EAP_DATA_DIR = dir;
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'tool-names-test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const { tools } = await client.listTools();
  toolNames = new Set(tools.map((t) => t.name));

  knownWords = new Set<string>();
  for (const t of tools) collectSchemaNames(t.inputSchema, knownWords);

  const { prompts } = await client.listPrompts();
  for (const p of prompts) {
    knownWords.add(p.name);
    for (const a of p.arguments ?? []) knownWords.add(a.name);
  }
});

afterAll(async () => {
  await client.close();
  if (originalDir === undefined) delete process.env.TOGAF_EAP_DATA_DIR;
  else process.env.TOGAF_EAP_DATA_DIR = originalDir;
  rmSync(dir, { recursive: true, force: true });
});

describe('src が名指しする識別子 / identifiers named by the source', () => {
  it('registers the expected surface (guards against an empty scan)', () => {
    expect(toolNames.size).toBeGreaterThanOrEqual(80);
    expect(knownWords.size).toBeGreaterThan(50);
  });

  it('finds tool names in the source (guards against a regex that matches nothing)', () => {
    const files = collectSources(SRC_DIR);
    expect(files.length).toBeGreaterThan(20);

    const all = new Set<string>();
    for (const f of files) for (const t of tokensIn(readFileSync(f, 'utf8'))) all.add(t);

    // 実在するツール名を十分な数拾えていなければ、抽出そのものが壊れている
    const hits = Array.from(all).filter((t) => toolNames.has(t));
    expect(hits.length).toBeGreaterThan(30);
  });

  it('never names a tool that this server does not register', () => {
    const offenders: string[] = [];
    for (const file of collectSources(SRC_DIR)) {
      const rel = file.slice(SRC_DIR.length + 1);
      for (const token of tokensIn(readFileSync(file, 'utf8'))) {
        if (toolNames.has(token)) continue;
        if (knownWords.has(token)) continue;
        if (ALLOWED.has(token)) continue;
        offenders.push(`${rel}: \`${token}\``);
      }
    }
    expect(
      offenders.sort(),
      'これらは登録済みツール名でも引数名でもありません。' +
        '出力に書くと利用者はそのとおり打って必ず失敗します。' +
        'ツール名の綴りを直すか、ツールでないなら ALLOWED に理由付きで登録してください。',
    ).toEqual([]);
  });

  it('keeps the ALLOWED list documented and free of stale entries', () => {
    const all = new Set<string>();
    for (const f of collectSources(SRC_DIR)) for (const t of tokensIn(readFileSync(f, 'utf8'))) all.add(t);

    for (const [token, reason] of ALLOWED) {
      expect(reason.length, `ALLOWED["${token}"] needs a reason`).toBeGreaterThan(10);
      // 許可リストに実在するツール名が紛れ込むと、検査が骨抜きになる
      expect(toolNames.has(token), `${token} is a real tool; remove it from ALLOWED`).toBe(false);
      // 出典が消えた例外を残すと、次の誤字をそのまま通してしまう
      expect(all.has(token), `${token} no longer appears in src; remove it from ALLOWED`).toBe(true);
    }
  });
});
