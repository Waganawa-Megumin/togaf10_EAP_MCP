import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDashboardInfo, startDashboard, stopDashboard } from '../src/dashboard/httpServer.js';
import { saveEngagement } from '../src/engagement/store.js';
import { createEngagement } from '../src/engagement/model.js';

let dir: string;
const originalDir = process.env.TOGAF_EAP_DATA_DIR;
const originalPort = process.env.TOGAF_EAP_DASHBOARD_PORT;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'togaf-eap-dash-'));
  process.env.TOGAF_EAP_DATA_DIR = dir;
  delete process.env.TOGAF_EAP_DASHBOARD_PORT;
});

afterEach(async () => {
  await stopDashboard();
  if (originalDir === undefined) delete process.env.TOGAF_EAP_DATA_DIR;
  else process.env.TOGAF_EAP_DATA_DIR = originalDir;
  if (originalPort === undefined) delete process.env.TOGAF_EAP_DASHBOARD_PORT;
  else process.env.TOGAF_EAP_DASHBOARD_PORT = originalPort;
  rmSync(dir, { recursive: true, force: true });
});

describe('dashboard http server', () => {
  it('serves HTML, state, and health on loopback', async () => {
    const info = await startDashboard('ja');
    expect(info.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(info.alreadyRunning).toBe(false);

    const html = await fetch(info.url);
    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toContain('text/html');
    expect(await html.text()).toContain('EventSource');

    const state = await fetch(`${info.url}api/state`);
    expect(state.status).toBe(200);
    const body = (await state.json()) as { engagement: unknown; statePath: string };
    expect(body.engagement).toBeNull();
    expect(body.statePath).toContain('engagement.json');

    const health = await fetch(`${info.url}health`);
    expect((await health.json()).ok).toBe(true);

    const missing = await fetch(`${info.url}nope`);
    expect(missing.status).toBe(404);
  });

  it('does not start a second server', async () => {
    const first = await startDashboard('ja');
    const second = await startDashboard('en');
    expect(second.alreadyRunning).toBe(true);
    expect(second.port).toBe(first.port);
    expect(getDashboardInfo()?.port).toBe(first.port);
  });

  it('honours TOGAF_EAP_DASHBOARD_PORT', async () => {
    process.env.TOGAF_EAP_DASHBOARD_PORT = '0';
    const info = await startDashboard('ja');
    expect(info.port).toBeGreaterThan(0);
  });

  it('pushes an SSE event when the engagement is saved', async () => {
    const info = await startDashboard('ja');
    const controller = new AbortController();
    const res = await fetch(`${info.url}events`, { signal: controller.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // retry 行・イベントはチャンク境界がまたがるので、条件を満たすまで読み進める
    const readUntil = async (predicate: (buffer: string) => boolean): Promise<string> => {
      let buffer = '';
      const deadline = Date.now() + 5000;
      while (!predicate(buffer) && Date.now() < deadline) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      return buffer;
    };

    // 接続直後の初期イベント
    expect(await readUntil((b) => b.includes('"initial":true'))).toContain('data:');

    saveEngagement(createEngagement({ name: 'live update' }));

    // 保存後の更新通知(ping コメントは読み飛ばす)
    const received = await readUntil((b) => /^data:/m.test(b));
    expect(received).toMatch(/^data:/m);
    expect(received).not.toContain('"initial":true');

    controller.abort();
    await reader.cancel().catch(() => undefined);

    // 更新後の状態が API から読める
    const state = (await (await fetch(`${info.url}api/state`)).json()) as {
      engagement: { name: string } | null;
    };
    expect(state.engagement?.name).toBe('live update');
  }, 10000);

  it('stops cleanly', async () => {
    const info = await startDashboard('ja');
    await stopDashboard();
    expect(getDashboardInfo()).toBeNull();
    await expect(fetch(info.url)).rejects.toThrow();
  });
});
