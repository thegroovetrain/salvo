#!/usr/bin/env node
// THE GPU ALLOCATION BUDGET CHECK (Story 11.2 follow-up, ruling G1/G4).
//
// Ruling G1: no GPU render target, filter pass, mask pass, texture or
// renderbuffer the client creates may exceed the viewport's backing size by more
// than a small fixed margin, on ANY frame — the first frame after a mask or
// filter is assigned included, on resize, on zoom change, in the lobby's ambient
// scene and in the spectator / death-reveal view. Story 11.2 raised the radar
// reach to 9,091 u and the radar dim mask's pass, measured at the mask sprite's
// world span on its first frame, asked for 16,384² / 32,768² targets with 4×
// MSAA ("Framebuffer is incomplete" above the GPU limit).
//
// THIS IS A CORRECTNESS CHECK ON ALLOCATION SIZES, NOT A FRAME-RATE CAPTURE.
// It times nothing and reports no FPS. It instruments WebGL2 in the page:
//   - texImage2D / texStorage2D / renderbufferStorage(Multisample) sizes;
//   - framebuffer completeness, checked at every draw / clear / blit into a
//     framebuffer whose attachments changed since its last check;
//   - `webglcontextlost` on the game's (document-attached) canvas — Pixi's own
//     `isWebGLSupported` probe deliberately loses a throwaway context, which is
//     not the game's and is not counted;
//   - console lines naming an incomplete framebuffer, GL_OUT_OF_MEMORY or a lost
//     context.
// and FAILS (exit 1) if any allocation side exceeds
//   BACKING_FACTOR × max(canvas backing width, height)
// or any framebuffer was incomplete, or the game's context was lost.
//
// It drives the PERF BUILD (`npm run build:perf -w client` → client/dist-perf),
// the production pipeline plus the staged worst-case scene — no game server:
//   1. the home page (the lobby's ambient radar scene);
//   2. `/?stage=worstcase`: warm up, zoom from the close limit out to the whole
//      board (ring fit) and back, the spectator / death reveal on and off, and a
//      window resize down and back up;
// at device scale factors 1 and 2 and at two viewport sizes.
//
//   npm run build:perf -w client
//   node client/scripts/glBudget.mjs
//
// env: HC_GL_ARGS — Chromium flags (default: the hardware GPU through ANGLE/Metal
//      on macOS; e.g. "--enable-unsafe-swiftshader" for a software run),
//      HC_GL_HEADFUL=1 — show the browser,
//      HC_GL_SHOTS=<dir> — also save one screenshot per in-match framing there,
//      HC_GL_DUMP=<dir> — also write every recorded allocation, per run, as JSON.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, serveDir, loadPlaywright, launchMuted } from './perfLib.mjs';
import { BACKING_FACTOR, CONSOLE_BAD, instrument, judgeGlRecord } from './glProbe.mjs';

const DIST = join(REPO, 'client', 'dist-perf');


const DPRS = [1, 2];
const VIEWPORTS = [
  { width: 1600, height: 900 },
  { width: 2560, height: 1300 },
];
/** The smaller window the resize step drops to and comes back from. */
const RESIZE_TO = { width: 1024, height: 640 };
/** ms to let a framing render (several frames + the debounced fog re-bake). */
const SETTLE_MS = 900;
const LOBBY_MS = 4000;

const DEFAULT_ARGS = process.platform === 'darwin'
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--enable-unsafe-swiftshader'];


async function phase(page, name, ms = SETTLE_MS) {
  await page.evaluate((n) => { window.__glbPhase = n; }, name);
  await page.waitForTimeout(ms);
}

async function shot(page, dir, tag, name) {
  if (!dir) return;
  await page.screenshot({ path: join(dir, `${tag}-${name}.png`) });
}

/** The in-match walk: close limit → whole board → back, reveal, resize. */
async function matchWalk(page, vp, tag, shots) {
  await page.goto(`${page.__base}/?stage=worstcase&profile=readability`, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => { window.__glbPhase = 'match-first-frames'; });
  await page.waitForFunction(() => window.__hcStage?.warmedUp?.() === true, null, { timeout: 120000 });
  await phase(page, 'match-default');
  await shot(page, shots, tag, 'default');
  for (const z of [100, 2, 1, 0.5, 0.25, 0.1]) {
    await page.evaluate((f) => window.__hcStage.setZoom(f), z);
    await phase(page, `zoom-${z}`);
  }
  await shot(page, shots, tag, 'mid');
  await page.evaluate(() => window.__hcStage.setRingFit());
  await phase(page, 'whole-board');
  await shot(page, shots, tag, 'whole-board');
  for (const z of [0.25, 1, 100]) {
    await page.evaluate((f) => window.__hcStage.setZoom(f), z);
    await phase(page, `zoom-back-${z}`);
  }
  await page.evaluate(() => window.__hcStage.setReveal(true));
  await phase(page, 'reveal');
  await page.evaluate(() => window.__hcStage.setReveal(false));
  await phase(page, 'reveal-off');
  await page.setViewportSize(RESIZE_TO);
  await phase(page, 'resized-down');
  await page.setViewportSize(vp);
  await phase(page, 'resized-up');
}

async function runOne(browser, base, dpr, vp, shots) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  page.__base = base;
  await page.addInitScript(instrument);
  const bad = [];
  page.on('console', (m) => { if (CONSOLE_BAD.test(m.text())) bad.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => bad.push(`pageerror: ${e.message.slice(0, 200)}`));
  const tag = `${dpr}x-${vp.width}x${vp.height}`;
  const collect = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__glb)));

  await page.goto(`${base}/`, { waitUntil: 'load', timeout: 60000 });
  await phase(page, 'lobby', LOBBY_MS);
  const lobby = await collect();
  await matchWalk(page, vp, tag, shots);
  const match = await collect();
  await ctx.close();
  return { tag, dpr, vp, recs: [lobby, match], bad };
}

function judge(run) {
  const failures = [];
  let worst = null;
  let renderer = null;
  for (const rec of run.recs) {
    const r = judgeGlRecord(rec);
    renderer ??= r.renderer;
    if (r.worst && (worst === null || Math.max(r.worst.w, r.worst.h) > Math.max(worst.w, worst.h))) worst = r.worst;
    failures.push(...r.failures);
  }
  for (const b of run.bad) failures.push(`console: ${b}`);
  return { failures: [...new Set(failures)], worst, renderer };
}

async function main() {
  if (!existsSync(DIST)) {
    console.error(`No perf build at ${DIST}. Run: npm run build:perf -w client`);
    return 2;
  }
  const pw = await loadPlaywright();
  if (!pw) {
    console.error('playwright-core not found. Set HC_PLAYWRIGHT=/path/to/playwright-core/index.mjs');
    return 2;
  }
  const shots = process.env.HC_GL_SHOTS ?? null;
  if (shots) mkdirSync(shots, { recursive: true });
  const dump = process.env.HC_GL_DUMP ?? null;
  if (dump) mkdirSync(dump, { recursive: true });
  const args = process.env.HC_GL_ARGS ? process.env.HC_GL_ARGS.split(' ').filter(Boolean) : DEFAULT_ARGS;
  const { server, port } = await serveDir(DIST);
  const browser = await launchMuted(pw, 'chromium', { headless: process.env.HC_GL_HEADFUL !== '1', args });
  let failed = 0;
  try {
    for (const dpr of DPRS) {
      for (const vp of VIEWPORTS) {
        const run = await runOne(browser, `http://127.0.0.1:${port}`, dpr, vp, shots);
        const { failures, worst, renderer } = judge(run);
        if (dump) writeFileSync(join(dump, `${run.tag}.json`), JSON.stringify(run.recs, null, 1));
        const w = worst ? `${worst.kind} ${worst.w}x${worst.h} (${worst.phase})` : 'none';
        console.log(`\n[${run.tag}] renderer: ${renderer}`);
        console.log(`  largest allocation: ${w}`);
        if (failures.length === 0) console.log('  PASS');
        else {
          failed++;
          console.log(`  FAIL (${failures.length}):`);
          for (const f of failures.slice(0, 20)) console.log(`    - ${f}`);
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nGL budget: ${failed === 0 ? 'PASS' : `FAIL (${failed} of ${DPRS.length * VIEWPORTS.length} runs)`} — budget ${BACKING_FACTOR} x the canvas backing's longer side`);
  return failed === 0 ? 0 : 1;
}

process.exit(await main());
