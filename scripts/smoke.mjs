#!/usr/bin/env node
/**
 * stdio JSON-RPC スモークテスト / stdio JSON-RPC smoke test.
 *
 * dist/index.js を子プロセスとして起動し、initialize → tools/list →
 * 代表ツールの tools/call を順に流して応答を検証する。
 * 最後にライブダッシュボードを起動し、HTML / API / SSE を HTTP で確認する。
 *
 * 状態ファイルは一時ディレクトリに書くので、~/.togaf-eap は汚さない。
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '..', 'dist', 'index.js');
const dataDir = mkdtempSync(join(tmpdir(), 'togaf-eap-smoke-'));

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
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
      if (line.length === 0) continue;
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

  request(method, params, timeoutMs = 15000) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }, timeoutMs);
      this.pending.set(id, (message) => {
        clearTimeout(timer);
        resolvePromise(message);
      });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  async call(name, args = {}) {
    const response = await this.request('tools/call', { name, arguments: args });
    if (response.error) throw new Error(`${name}: ${response.error.message}`);
    const result = response.result ?? {};
    const text = (result.content ?? []).map((c) => c.text ?? '').join('\n');
    return { text, isError: Boolean(result.isError) };
  }
}

async function main() {
  console.log(`entry:    ${entry}`);
  console.log(`data dir: ${dataDir}\n`);

  const child = spawn(process.execPath, [entry], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TOGAF_EAP_DATA_DIR: dataDir, TOGAF_EAP_DASHBOARD_PORT: '0' },
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    const line = chunk.trim();
    if (line) console.log(`  [server] ${line}`);
  });

  const client = new Client(child);

  try {
    // --- initialize ---
    console.log('initialize');
    const init = await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke', version: '0.0.0' },
    });
    check('initialize returns a result', Boolean(init.result));
    check('server identifies itself', init.result?.serverInfo?.name === 'togaf10-eap-mcp',
      JSON.stringify(init.result?.serverInfo));
    check('server sends instructions', typeof init.result?.instructions === 'string');
    client.notify('notifications/initialized', {});

    // --- tools/list ---
    console.log('\ntools/list');
    const list = await client.request('tools/list', {});
    const tools = list.result?.tools ?? [];
    const names = tools.map((t) => t.name).sort();
    console.log(`  tools: ${names.join(', ')}`);
    const expected = [
      'consult', 'generate_deliverable_template', 'get_adm_phase', 'get_dashboard',
      'get_deliverable', 'get_engagement', 'get_glossary_term', 'get_technique',
      'list_adm_phases', 'list_deliverables', 'list_techniques', 'open_dashboard',
      'search_togaf', 'start_engagement', 'update_engagement',
    ];
    for (const name of expected) {
      check(`tool present: ${name}`, names.includes(name));
    }
    check('every tool has an input schema', tools.every((t) => t.inputSchema?.type === 'object'));

    // --- 参照系 ---
    console.log('\nreference tools');
    const phases = await client.call('list_adm_phases', { lang: 'both' });
    check('list_adm_phases lists ten phases',
      ['Preliminary', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'RM']
        .every((code) => phases.text.includes(`| ${code} |`)));

    const phaseA = await client.call('get_adm_phase', { phase: 'A', lang: 'both' });
    check('get_adm_phase returns Phase A', phaseA.text.includes('Architecture Vision'));
    check('get_adm_phase is bilingual',
      phaseA.text.includes('アーキテクチャビジョン') && phaseA.text.includes('Architecture Vision'));

    const badPhase = await client.call('get_adm_phase', { phase: 'ZZZ' });
    check('get_adm_phase reports unknown ids', badPhase.isError);

    const technique = await client.call('get_technique', { technique: 'gap-analysis', lang: 'ja' });
    check('get_technique returns gap analysis', technique.text.includes('ギャップ分析'));

    const deliverable = await client.call('get_deliverable', { deliverable: 'architecture-vision', lang: 'en' });
    check('get_deliverable returns the vision', deliverable.text.includes('Architecture Vision'));

    const search = await client.call('search_togaf', { query: 'ギャップ', limit: 5 });
    check('search_togaf finds Japanese terms', search.text.includes('gap-analysis'));

    const searchEn = await client.call('search_togaf', { query: 'roadmap', limit: 5 });
    check('search_togaf finds English terms', searchEn.text.includes('architecture-roadmap'));

    const term = await client.call('get_glossary_term', { term: 'abb', lang: 'both' });
    check('get_glossary_term returns ABB', term.text.includes('ABB'));

    const template = await client.call('generate_deliverable_template', {
      deliverable: 'architecture-vision',
      engagementName: 'スモークテスト案件',
      lang: 'both',
    });
    check('generate_deliverable_template produces sections',
      template.text.includes('スモークテスト案件') && template.text.includes('##'));

    // --- コンサル系 ---
    console.log('\nconsulting');
    const consultJa = await client.call('consult', {
      situation: 'レガシーな基幹システムの刷新を任された。何から始めればよいか',
      lang: 'both',
    });
    check('consult matches the legacy pattern', consultJa.text.includes('レガシー'));
    check('consult recommends phases', consultJa.text.includes('ADM'));
    check('consult asks stakeholder questions', consultJa.text.includes('?') || consultJa.text.includes('?'));

    const consultEn = await client.call('consult', {
      situation: 'We are planning a lift and shift migration to AWS',
      lang: 'en',
    });
    check('consult matches the cloud pattern', consultEn.text.toLowerCase().includes('cloud'));

    const consultUnknown = await client.call('consult', { situation: '今日は天気が良い', lang: 'ja' });
    check('consult falls back gracefully', !consultUnknown.isError && consultUnknown.text.length > 0);

    // --- エンゲージメント ---
    console.log('\nengagement');
    const empty = await client.call('get_engagement', {});
    check('get_engagement handles the empty state', empty.text.includes('start_engagement'));

    const started = await client.call('start_engagement', {
      name: 'スモークテスト案件',
      client: 'ACME 製造',
      industry: '製造業',
      description: '基幹システムの刷新',
      currentPhase: 'a',
      lang: 'ja',
    });
    check('start_engagement creates the engagement', started.text.includes('スモークテスト案件'));

    const duplicate = await client.call('start_engagement', { name: '別案件' });
    check('start_engagement refuses to overwrite silently', duplicate.isError);

    const updated = await client.call('update_engagement', {
      phases: [{ phase: 'a', status: 'completed', note: 'ビジョン承認済み' }, { phase: 'b', status: 'in_progress' }],
      currentPhase: 'b',
      risks: [{ title: '現行仕様を説明できる要員が退職予定', level: 'high', status: 'open', owner: '山田' }],
      actions: [{ title: 'データ正本の棚卸し', priority: 'high', owner: '佐藤', due: '2026-09-30' }],
      decisions: [{ title: '段階移行を採用', decision: '3 段階の移行アーキテクチャで進める', status: 'accepted' }],
      stakeholders: [{ name: '田中部長', role: '業務部門長', influence: 'high', interest: 'medium', concerns: ['月次決算が止まらないこと'] }],
      deliverables: [{ deliverableId: 'architecture-vision', status: 'drafting', owner: '鈴木' }],
      notes: ['キックオフ完了'],
      lang: 'ja',
    });
    check('update_engagement applies phase changes', updated.text.includes('phase A → completed'));
    check('update_engagement adds a risk', updated.text.includes('現行仕様を説明できる要員が退職予定'));
    check('update_engagement adds a deliverable', updated.text.includes('アーキテクチャビジョン'));

    const json = await client.call('get_engagement', { format: 'json' });
    const state = JSON.parse(json.text);
    check('state persists as JSON', state.name === 'スモークテスト案件');
    check('state holds one risk', state.risks.length === 1);
    check('state holds one action', state.actions.length === 1);
    check('state holds ten phases', state.phases.length === 10);

    // 既存項目の更新と削除
    const riskId = state.risks[0].id;
    const mutated = await client.call('update_engagement', {
      risks: [{ id: riskId, status: 'mitigating', residualLevel: 'medium', mitigation: '知識移転を前倒し' }],
      lang: 'ja',
    });
    check('update_engagement updates by id', mutated.text.includes(riskId));

    const removed = await client.call('update_engagement', { removeIds: [state.actions[0].id], lang: 'ja' });
    check('update_engagement removes by id', removed.text.includes(state.actions[0].id));

    const badId = await client.call('update_engagement', { removeIds: ['no-such-id'], lang: 'ja' });
    check('update_engagement warns on unknown ids', badId.text.includes('no-such-id'));

    // --- ダッシュボード ---
    console.log('\ndashboard');
    const dashboard = await client.call('get_dashboard', { lang: 'ja' });
    check('get_dashboard renders the engagement', dashboard.text.includes('スモークテスト案件'));
    check('get_dashboard draws a progress bar', dashboard.text.includes('█') || dashboard.text.includes('░'));

    const opened = await client.call('open_dashboard', { open: false, lang: 'ja' });
    const url = (opened.text.match(/http:\/\/127\.0\.0\.1:\d+\//) ?? [])[0];
    check('open_dashboard returns a loopback URL', Boolean(url), opened.text.slice(0, 120));

    if (url) {
      const html = await fetch(url);
      const htmlText = await html.text();
      check('dashboard serves HTML', html.status === 200 && htmlText.includes('<!doctype html>'));
      check('dashboard HTML is self-contained', !/(src|href)="https?:/.test(htmlText));
      check('dashboard HTML has print CSS', htmlText.includes('@media print'));

      const api = await (await fetch(`${url}api/state`)).json();
      check('dashboard API serves the state', api.engagement?.name === 'スモークテスト案件');

      // SSE: 接続 → 状態更新 → push を受信
      const controller = new AbortController();
      const events = await fetch(`${url}events`, { signal: controller.signal });
      check('dashboard serves SSE', (events.headers.get('content-type') ?? '').includes('text/event-stream'));

      const reader = events.body.getReader();
      const decoder = new TextDecoder();
      const readUntil = async (predicate) => {
        let buffer = '';
        const deadline = Date.now() + 5000;
        while (!predicate(buffer) && Date.now() < deadline) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
        }
        return buffer;
      };
      await readUntil((b) => b.includes('"initial":true'));

      await client.call('update_engagement', { notes: ['ライブ更新の確認'], lang: 'ja' });
      const pushed = await readUntil((b) => /^data:/m.test(b));
      check('dashboard pushes live updates over SSE', /^data:/m.test(pushed));

      controller.abort();
      await reader.cancel().catch(() => undefined);

      const reopened = await client.call('open_dashboard', { open: false, lang: 'ja' });
      check('open_dashboard reuses the running server', reopened.text.includes(url));
    }
  } finally {
    child.stdin.end();
    child.kill('SIGTERM');
    rmSync(dataDir, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nsmoke test crashed:', error);
  rmSync(dataDir, { recursive: true, force: true });
  process.exit(1);
});
