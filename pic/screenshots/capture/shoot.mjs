#!/usr/bin/env node
/**
 * README 用スクリーンショットを headless chromium で撮る / Capture the README screenshots headlessly.
 *
 * ブラウザのウィンドウは開かない。撮影対象は起動済みのダッシュボード 2 本:
 *   38702 = lang both(日英併記)  … 全体・ダーク・各マトリクス
 *   38703 = lang ja              … 四半期ロードマップの拡大
 * (both のままだと作業パッケージ名がラベル欄に収まらず省略されるため、拡大は ja で撮る)
 *
 *   node pic/screenshots/capture/shoot.mjs
 *
 * Playwright は依存に入れていない。次のいずれかで解決する:
 *   1. `npm i -D playwright` してある
 *   2. 環境変数 PLAYWRIGHT_MODULE に playwright の index.mjs の絶対パス
 *   3. `npx playwright` を一度使っていれば ~/.npm/_npx 配下の playwright を自動で拾う
 * chromium 本体は `npx playwright install chromium` で入る。
 */

import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..');
mkdirSync(OUT, { recursive: true });

/** playwright の候補を列挙する(先に見つかった順に試す) */
function playwrightCandidates() {
  const out = [];
  if (process.env.PLAYWRIGHT_MODULE) out.push(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
  out.push('playwright');
  const cache = join(homedir(), '.npm', '_npx');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache)) {
      const p = join(cache, dir, 'node_modules', 'playwright', 'index.mjs');
      if (existsSync(p)) out.push(pathToFileURL(p).href);
    }
  }
  return out;
}

/**
 * chromium が実際に起動できる playwright を探す。
 * npx のキャッシュには複数バージョンが残ることがあり、対応する chromium が
 * 落としてない版もある(その場合 launch が Executable doesn't exist で失敗する)。
 */
async function launchChromium() {
  const errors = [];
  for (const spec of playwrightCandidates()) {
    try {
      const { chromium } = await import(spec);
      return await chromium.launch({ headless: true });
    } catch (error) {
      errors.push(`  ${spec}: ${String(error).split('\n')[0]}`);
    }
  }
  throw new Error(
    'headless chromium を起動できませんでした。`npm i -D playwright && npx playwright install chromium` を試してください。\n'
    + errors.join('\n'),
  );
}

const URL_BOTH = process.env.DASH_BOTH ?? 'http://127.0.0.1:38702/';
const URL_JA = process.env.DASH_JA ?? 'http://127.0.0.1:38703/';
const W = 1140;      // .wrap は max-width:1080px。左右に 30px ずつ余白が残る幅
const DSF = 1.4;     // 1140 * 1.4 = 1596px(README 表示に十分な Retina 相当)

async function open(browser, url, colorScheme) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: 1200 },
    deviceScaleFactor: DSF,
    colorScheme,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#sec-roadmap .tl-scroll');
  // SSE がつながって「ライブ更新中」になるまで待つ(ヘッダーの緑ドット)
  await page.waitForFunction(() => {
    const d = document.getElementById('dot');
    return d && !d.classList.contains('off');
  }, { timeout: 10000 });
  await page.waitForTimeout(1200); // 進捗バーのアニメーション終了待ち
  return { ctx, page };
}

const boxes = (page) =>
  page.evaluate(() => {
    const b = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height, bottom: r.bottom + scrollY };
    };
    return {
      doc: document.documentElement.scrollHeight,
      sec: b('#sec-roadmap'),
      h2: b('#sec-roadmap h2'),
      tl: b('#sec-roadmap .tl-scroll'),
    };
  });

const out = [];
const browser = await launchChromium();

/* 1) ライト: ページ先頭〜ロードマップのタイムラインまで + 2 つのマトリクス */
{
  const { ctx, page } = await open(browser, URL_BOTH, 'light');
  const m = await boxes(page);
  const h = Math.round(m.tl.bottom + 14);
  await page.setViewportSize({ width: W, height: h });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/dashboard-overview.png`, clip: { x: 0, y: 0, width: W, height: h } });
  out.push(['dashboard-overview.png', `${W}x${h} css`, `page total ${m.doc}px`]);

  for (const [sel, file] of [
    ['#sec-risk-matrix', 'dashboard-risk-matrix.png'],
    ['#sec-stakeholder-matrix', 'dashboard-stakeholder-matrix.png'],
  ]) {
    const el = await page.$(sel);
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await el.screenshot({ path: `${OUT}/${file}` });
    const bb = await el.boundingBox();
    out.push([file, `${Math.round(bb.width)}x${Math.round(bb.height)} css`, '']);
  }
  await ctx.close();
}

/* 2) 同じ範囲をダークモードで(prefers-color-scheme を emulate) */
{
  const { ctx, page } = await open(browser, URL_BOTH, 'dark');
  const m = await boxes(page);
  const h = Math.round(m.tl.bottom + 14);
  await page.setViewportSize({ width: W, height: h });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/dashboard-dark.png`, clip: { x: 0, y: 0, width: W, height: h } });
  out.push(['dashboard-dark.png', `${W}x${h} css`, `page total ${m.doc}px`]);
  await ctx.close();
}

/* 3) 四半期ロードマップの拡大(lang=ja) */
{
  const { ctx, page } = await open(browser, URL_JA, 'light');
  const m = await boxes(page);
  const pad = 16;
  const clip = {
    x: Math.round(m.sec.x - pad),
    y: Math.round(m.h2.y - pad),
    width: Math.round(m.sec.w + pad * 2),
    height: Math.round(m.tl.bottom - m.h2.y + pad * 2),
  };
  await page.setViewportSize({ width: W, height: Math.max(1200, clip.y + clip.height + 60) });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/dashboard-roadmap.png`, clip });
  out.push(['dashboard-roadmap.png', `${clip.width}x${clip.height} css`, '']);
  await ctx.close();
}

await browser.close();
for (const r of out) console.log(r.join('\t'));
console.log('\nnext: python3 pic/screenshots/capture/shrink.py   # 400 KB 超を 256 色 PNG に落とす');
