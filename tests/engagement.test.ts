import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clearEngagement,
  getStatePath,
  loadEngagement,
  mutateEngagement,
  saveEngagement,
  storeEvents,
} from '../src/engagement/store.js';
import { createEngagement, summarizeProgress } from '../src/engagement/model.js';
import { renderDashboardMarkdown, progressBar } from '../src/dashboard/markdown.js';
import { renderDashboardHtml } from '../src/dashboard/html.js';

let dir: string;
const original = process.env.TOGAF_EAP_DATA_DIR;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'togaf-eap-test-'));
  process.env.TOGAF_EAP_DATA_DIR = dir;
});

afterEach(() => {
  if (original === undefined) delete process.env.TOGAF_EAP_DATA_DIR;
  else process.env.TOGAF_EAP_DATA_DIR = original;
  rmSync(dir, { recursive: true, force: true });
});

describe('store', () => {
  it('honours TOGAF_EAP_DATA_DIR', () => {
    expect(getStatePath()).toBe(join(dir, 'engagement.json'));
  });

  it('returns null before anything is saved', () => {
    expect(loadEngagement()).toBeNull();
  });

  it('round-trips an engagement through JSON', () => {
    const engagement = createEngagement({ name: '基幹システム刷新', client: 'ACME', industry: '製造' });
    saveEngagement(engagement);

    const loaded = loadEngagement();
    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe('基幹システム刷新');
    expect(loaded?.client).toBe('ACME');
    expect(loaded?.phases).toHaveLength(10);
    expect(loaded?.id).toBe(engagement.id);
  });

  it('writes the file atomically and leaves no temp files behind', () => {
    saveEngagement(createEngagement({ name: 'atomic' }));
    const raw = readFileSync(getStatePath(), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('emits a change event on save', () => {
    let fired = 0;
    const listener = () => { fired += 1; };
    storeEvents.on('change', listener);
    saveEngagement(createEngagement({ name: 'evented' }));
    storeEvents.removeListener('change', listener);
    expect(fired).toBe(1);
  });

  it('survives a corrupted state file', () => {
    writeFileSync(getStatePath(), '{ this is not json', 'utf8');
    expect(loadEngagement()).toBeNull();
  });

  it('backfills missing phases when loading older state', () => {
    const engagement = createEngagement({ name: 'partial' });
    engagement.phases = engagement.phases.slice(0, 3);
    saveEngagement(engagement);
    expect(loadEngagement()?.phases).toHaveLength(10);
  });

  it('clears state', () => {
    saveEngagement(createEngagement({ name: 'temp' }));
    clearEngagement();
    expect(loadEngagement()).toBeNull();
  });

  it('mutates in place and returns null with no engagement', () => {
    expect(mutateEngagement((e) => e)).toBeNull();
    saveEngagement(createEngagement({ name: 'before' }));
    const updated = mutateEngagement((e) => ({ ...e, name: 'after' }));
    expect(updated?.name).toBe('after');
    expect(loadEngagement()?.name).toBe('after');
  });
});

describe('summarizeProgress', () => {
  it('counts an untouched engagement as zero percent', () => {
    expect(summarizeProgress(createEngagement({ name: 'x' })).percent).toBe(0);
  });

  it('counts in-progress phases as half', () => {
    const e = createEngagement({ name: 'x' });
    e.phases[0].status = 'completed';
    e.phases[1].status = 'in_progress';
    const s = summarizeProgress(e);
    expect(s.completed).toBe(1);
    expect(s.inProgress).toBe(1);
    expect(s.percent).toBe(15); // (1 + 0.5) / 10
  });

  it('excludes skipped phases from the denominator', () => {
    const e = createEngagement({ name: 'x' });
    for (let i = 0; i < 5; i += 1) e.phases[i].status = 'completed';
    for (let i = 5; i < 10; i += 1) e.phases[i].status = 'skipped';
    expect(summarizeProgress(e).percent).toBe(100);
  });
});

describe('markdown dashboard', () => {
  it('renders an empty-state message with no engagement', () => {
    const md = renderDashboardMarkdown(null, 'ja');
    expect(md).toContain('start_engagement');
  });

  it('renders engagement content', () => {
    const e = createEngagement({ name: '刷新PJ', client: 'ACME' });
    e.phases[1].status = 'in_progress';
    e.risks.push({
      id: 'risk-1', title: '要員のスキル不足', level: 'high', status: 'open',
      owner: '山田', createdAt: e.createdAt, updatedAt: e.updatedAt,
    });
    e.actions.push({
      id: 'act-1', title: 'ステークホルダー洗い出し', status: 'todo', priority: 'high',
      createdAt: e.createdAt, updatedAt: e.updatedAt,
    });
    const md = renderDashboardMarkdown(e, 'ja');
    expect(md).toContain('刷新PJ');
    expect(md).toContain('ACME');
    expect(md).toContain('要員のスキル不足');
    expect(md).toContain('ステークホルダー洗い出し');
    // 10 フェーズすべてが表に並ぶ
    for (const code of ['Preliminary', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'RM']) {
      expect(md).toContain(`| ${code}.`);
    }
  });

  it('escapes pipes so the table survives', () => {
    const e = createEngagement({ name: 'pipe' });
    e.actions.push({
      id: 'a1', title: 'A | B', status: 'todo', priority: 'low',
      createdAt: e.createdAt, updatedAt: e.updatedAt,
    });
    expect(renderDashboardMarkdown(e, 'ja')).toContain('A \\| B');
  });

  it('draws a progress bar of fixed width', () => {
    expect(progressBar(0).length).toBe(20);
    expect(progressBar(100)).toBe('█'.repeat(20));
    expect(progressBar(50)).toBe(`${'█'.repeat(10)}${'░'.repeat(10)}`);
  });
});

describe('html dashboard', () => {
  it('is self-contained and references no external hosts', () => {
    const html = renderDashboardHtml('both');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('EventSource');
    expect(html).toContain('@media print');
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/href="https?:/);
  });

  it('inlines the phase list for the requested language', () => {
    expect(renderDashboardHtml('en')).toContain('Architecture Vision');
    expect(renderDashboardHtml('ja')).toContain('アーキテクチャビジョン');
  });
});
