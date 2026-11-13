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
import { REPO, serveDir, loadPlaywright } from './perfLib.mjs';

const DIST = join(REPO, 'client', 'dist-perf');

/**
 * THE NAMED MARGIN. Pixi's `TexturePool` rounds every filter / mask target up
 * to the next power of two per side, so a pass exactly the size of the screen
 * can legitimately be up to (just under) twice the backing's longer side. Twice
 * the longer backing side is therefore the smallest budget a correct client can
 * meet, and anything world-sized blows straight through it.
 */
const BACKING_FACTOR = 2;

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

/** Injected before any page script: wraps the WebGL2 prototype. */
function instrument() {
  const rec = (window.__glb = { allocs: [], incomplete: [], lost: [], limits: null, maxBacking: 0 });
  const P = WebGL2RenderingContext.prototype;
  const dirty = new WeakSet();
  const backing = () => {
    let m = 0;
    for (const c of document.querySelectorAll('canvas')) m = Math.max(m, c.width, c.height);
    rec.maxBacking = Math.max(rec.maxBacking, m);
    return m;
  };
  const note = (gl, kind, w, h, extra) => {
    if (!rec.limits) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      rec.limits = {
        tex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        rb: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      };
    }
    const b = backing();
    rec.allocs.push({ kind, w, h, extra, backing: b, phase: window.__glbPhase ?? 'boot',
      stack: Math.max(w, h) > 4096 ? String(new Error().stack).split('\n').slice(2, 12).join(' | ') : undefined });
  };
  const wrap = (name, pick, after) => {
    const orig = P[name];
    P[name] = function (...a) {
      try {
        const s = pick(a);
        if (s) note(this, name, s[0], s[1], s[2]);
      } catch { /* the probe must never break the page */ }
      const r = orig.apply(this, a);
      if (after) after(this, a);
      return r;
    };
  };
  const markBound = (gl) => {
    const fb = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    if (fb) dirty.add(fb);
  };
  wrap('texImage2D', (a) => (a.length >= 9 ? [a[3], a[4]] : null));
  wrap('texStorage2D', (a) => [a[3], a[4]]);
  wrap('renderbufferStorage', (a) => [a[2], a[3]]);
  wrap('renderbufferStorageMultisample', (a) => [a[3], a[4], `samples=${a[1]}`]);
  wrap('framebufferTexture2D', () => null, markBound);
  wrap('framebufferRenderbuffer', () => null, markBound);
  const check = function (gl) {
    const fb = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    if (!fb || !dirty.has(fb)) return;
    dirty.delete(fb);
    const st = gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE && rec.incomplete.length < 50) {
      rec.incomplete.push({ status: `0x${st.toString(16)}`, phase: window.__glbPhase ?? 'boot' });
    }
  };
  for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'clear', 'blitFramebuffer']) {
    const orig = P[name];
    P[name] = function (...a) {
      try { check(this); } catch { /* never break the page */ }
      return orig.apply(this, a);
    };
  }
  // Any storage change can change an attached framebuffer's completeness.
  for (const name of ['texImage2D', 'texStorage2D', 'renderbufferStorage', 'renderbufferStorageMultisample']) {
    const orig = P[name];
    P[name] = function (...a) {
      const r = orig.apply(this, a);
      try { markBound(this); } catch { /* never break the page */ }
      return r;
    };
  }
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...r) {
    const c = gc.call(this, type, ...r);
    if (c && /webgl/.test(type) && !this.__glb) {
      this.__glb = true;
      this.addEventListener('webglcontextlost', () =>
        rec.lost.push({ ev: 'lost', game: this.isConnected, phase: window.__glbPhase ?? 'boot' }));
      this.addEventListener('webglcontextrestored', () =>
        rec.lost.push({ ev: 'restored', game: this.isConnected, phase: window.__glbPhase ?? 'boot' }));
    }
    return c;
  };
}

const CONSOLE_BAD = /framebuffer is incomplete|GL_OUT_OF_MEMORY|CONTEXT_LOST|context lost/i;

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
    renderer ??= rec.limits?.renderer ?? null;
    const budget = BACKING_FACTOR * rec.maxBacking;
    for (const a of rec.allocs) {
      const side = Math.max(a.w, a.h);
      if (worst === null || side > Math.max(worst.w, worst.h)) worst = a;
      if (side > budget) {
        failures.push(`${a.kind} ${a.w}x${a.h}${a.extra ? ` ${a.extra}` : ''} in phase "${a.phase}" > ${BACKING_FACTOR} x backing ${rec.maxBacking} = ${budget}${a.stack ? `\n        at ${a.stack.slice(0, 600)}` : ''}`);
      }
    }
    for (const f of rec.incomplete) failures.push(`incomplete framebuffer (status ${f.status}) in phase "${f.phase}"`);
    for (const l of rec.lost) if (l.game && l.ev === 'lost') failures.push(`WebGL context lost in phase "${l.phase}"`);
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
  const browser = await pw.mod.chromium.launch({ headless: process.env.HC_GL_HEADFUL !== '1', args });
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
