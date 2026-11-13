#!/usr/bin/env node
// THE REAL-MATCH FREEZE CHECK (Story 11.2 follow-up 3).
//
// The bug it guards: a throw inside Pixi's own render (a live alpha-mask
// sprite's texture source destroyed under the pooled mask effect) froze the
// client on a half-drawn frame for good — the ticker never requested another
// frame, so input stopped riding the wire and the hull held its last rudder.
// It surfaced only in a REAL match, zooming / speeding across a fog raster size
// step, which no staged scene reached. So this check plays one.
//
// It boots the game server itself from `server/` on a scratch port
// (NODE_ENV=production so the server serves the BUILT client from client/dist,
// HC_DEV_OPTIONS=1), opens the real client, enters SOLO VS AI, waits for the
// buzzer, then for at least RUN_S seconds: presses W, holds A / D in turn,
// wheel-zooms out in bursts to the whole board and back in, and works the X / Z
// zoom keys. It FAILS (exit 1) on
//   - any `pageerror` or console error;
//   - a lost game WebGL context, an incomplete framebuffer, or a GPU allocation
//     over the GL budget (glProbe.mjs, the glBudget.mjs rules);
//   - a frozen loop: a FREEZE_MS window with no input message sent while the
//     own hull is afloat, or with no draw call.
// at device scale factor 2, viewports 1440×900 and 1536×850, in Chromium and —
// when Playwright's Firefox is installed — Firefox.
//
//   npm run build -w shared && npm run build -w client
//   node client/scripts/playCheck.mjs
//
// env: HC_PLAY_ENGINES — comma list (default "chromium,firefox"; a missing
//      engine is reported and skipped), HC_PLAY_RUN_S — seconds of play after
//      the buzzer (default 45, floor 40), HC_PLAY_BUZZ_S — seconds from the
//      first frame to the buzzer (default 16), HC_PLAY_PORT — the server port
//      (default: a free one), HC_GL_ARGS — Chromium flags (as glBudget.mjs),
//      HC_PLAY_HEADFUL=1 — show the browser.
//
// EVERY BROWSER IT LAUNCHES IS MUTED (perfLib.mjs `launchMuted`: the engine's
// mute switch plus an init script that routes every realtime AudioContext into
// a gain-0 node — the game's audio graph still builds and runs, silently).
//
// REMEMBER: client/dist is what vitest then sees — `rm -rf client/dist` before
// running the client tests.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { unpackMultiple } from 'msgpackr';
import { REPO, loadPlaywright, launchMuted } from './perfLib.mjs';
import { CONSOLE_BAD, instrument, judgeGlRecord } from './glProbe.mjs';

const DIST = join(REPO, 'client', 'dist', 'index.html');
const SERVER_DIR = join(REPO, 'server');
const TSX = join(REPO, 'node_modules', '.bin', 'tsx');

const DPR = 2;
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1536, height: 850 },
];
const RUN_S = Math.max(40, Number(process.env.HC_PLAY_RUN_S ?? 45));
const BUZZ_S = Number(process.env.HC_PLAY_BUZZ_S ?? 16);
/** A loop that sends no input (afloat) or draws nothing for this long is frozen. */
const FREEZE_MS = 3000;
const POLL_MS = 500;

const DEFAULT_ARGS = process.platform === 'darwin'
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--enable-unsafe-swiftshader'];

function freePort() {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.once('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
}

/** Boot the game server in its own process group (tsx spawns a node child). */
async function bootServer(port) {
  const child = spawn(TSX, ['src/index.ts'], {
    cwd: SERVER_DIR,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HC_DEV_OPTIONS: '1', HC_STAGING_KEY: '', HC_QUEUE_BOT_FILL: '' },
  });
  let out = '';
  child.stdout.on('data', (d) => { out = (out + d).slice(-4000); });
  child.stderr.on('data', (d) => { out = (out + d).slice(-4000); });
  const stop = () => {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  };
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    if (child.exitCode !== null) throw new Error(`server exited (${child.exitCode}):\n${out}`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) return { stop, pid: child.pid };
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  stop();
  throw new Error(`server did not answer /health within 60 s:\n${out}`);
}

/** Colyseus ROOM_DATA (13) message type, or null. */
function msgType(buf) {
  if (!buf || (buf[0] & 0x1f) !== 13) return null;
  try {
    const v = unpackMultiple(buf.subarray(1));
    return { type: v[0], body: v[1] };
  } catch {
    return null;
  }
}

function watchSockets(page, st) {
  page.on('websocket', (ws) => {
    ws.on('framesent', ({ payload }) => {
      if (typeof payload === 'string') return;
      if (msgType(payload)?.type === 'i') st.inputs++;
    });
    ws.on('framereceived', ({ payload }) => {
      if (typeof payload === 'string') return;
      const m = msgType(payload);
      if (m?.type !== 'f' || !m.body) return;
      st.frames++;
      st.firstFrameMs ??= Date.now();
      const you = m.body.you;
      st.afloat = !m.body.spec && you != null && you.alive !== false && !you.sinking;
    });
  });
}

async function enterSolo(page, base) {
  await page.goto(`${base}/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.locator('input').first().fill('playcheck');
  await page.locator('[title="Open the class-select layer"]').click();
  await page.waitForTimeout(700);
  await page.getByText('CONFIRM SELECTION').click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'SOLO VS AI', exact: true }).click();
}

/** The play script after the buzzer: [second, label, action]. */
function timeline(page, vp) {
  const cx = Math.round(vp.width / 2);
  const cy = Math.round(vp.height / 2);
  const wheel = (dy) => page.mouse.wheel(0, dy);
  const burst = (dy, n) => page.evaluate(([d, k, x, y]) => {
    for (let i = 0; i < k; i++) window.dispatchEvent(new WheelEvent('wheel', { deltaY: d, clientX: x, clientY: y, bubbles: true }));
  }, [dy, n, cx, cy]);
  const keys = async (k, n) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await page.waitForTimeout(30); } };
  const tl = [];
  for (let s = 0; s < RUN_S; s += 20) {
    tl.push([s, 'W x3', () => keys('KeyW', 3)]);
    tl.push([s + 1, 'D down', () => page.keyboard.down('KeyD')]);
    tl.push([s + 2, 'wheel out x5', async () => { for (let i = 0; i < 5; i++) { await wheel(120); await page.waitForTimeout(150); } }]);
    tl.push([s + 4, 'wheel burst out 40 (whole board)', () => burst(120, 40)]);
    tl.push([s + 6, 'D up, A down', async () => { await page.keyboard.up('KeyD'); await page.keyboard.down('KeyA'); }]);
    tl.push([s + 7, 'wheel burst in 40', () => burst(-120, 40)]);
    tl.push([s + 9, 'Z x40 (out)', () => keys('KeyZ', 40)]);
    tl.push([s + 12, 'X x60 (in)', () => keys('KeyX', 60)]);
    tl.push([s + 15, 'A up, D down', async () => { await page.keyboard.up('KeyA'); await page.keyboard.down('KeyD'); }]);
    tl.push([s + 16, 'wheel out x8, in x8', async () => {
      for (let i = 0; i < 8; i++) { await wheel(120); await page.waitForTimeout(100); }
      for (let i = 0; i < 8; i++) { await wheel(-120); await page.waitForTimeout(100); }
    }]);
    tl.push([s + 19, 'D up', () => page.keyboard.up('KeyD')]);
  }
  return tl.filter((e) => e[0] < RUN_S).sort((a, b) => a[0] - b[0]);
}

/** Sample input and draw counters; record any FREEZE_MS stall. */
async function sample(page, st, failures) {
  const draws = await page.evaluate(() => window.__glb?.draws ?? 0).catch(() => st.lastDraws);
  const now = Date.now();
  if (draws !== st.lastDraws) { st.lastDraws = draws; st.drawAt = now; }
  if (st.inputs !== st.lastInputs || !st.afloat) { st.lastInputs = st.inputs; st.inputAt = now; }
  if (now - st.drawAt > FREEZE_MS && !st.drawFrozen) {
    st.drawFrozen = true;
    failures.push(`frozen loop: no draw call for ${now - st.drawAt} ms at +${((now - st.buzzMs) / 1000).toFixed(1)} s`);
  }
  if (now - st.inputAt > FREEZE_MS && !st.inputFrozen) {
    st.inputFrozen = true;
    failures.push(`frozen loop: no input message for ${now - st.inputAt} ms while afloat at +${((now - st.buzzMs) / 1000).toFixed(1)} s`);
  }
}

async function play(page, vp, st, failures) {
  const t0 = Date.now();
  while (st.firstFrameMs === null && Date.now() - t0 < 150000) await page.waitForTimeout(500);
  if (st.firstFrameMs === null) throw new Error('no match frame within 150 s');
  st.buzzMs = st.firstFrameMs + BUZZ_S * 1000;
  while (Date.now() < st.buzzMs) await page.waitForTimeout(250);
  await page.evaluate(() => { window.__glbPhase = 'play'; });
  await page.mouse.move(Math.round(vp.width / 2) + 200, Math.round(vp.height / 2) - 150);
  st.drawAt = st.inputAt = Date.now();
  const tl = timeline(page, vp);
  const inputs0 = st.inputs;
  let nextPoll = Date.now();
  while (Date.now() - st.buzzMs < RUN_S * 1000) {
    const sec = (Date.now() - st.buzzMs) / 1000;
    while (tl.length && tl[0][0] <= sec) await tl.shift()[2]();
    if (Date.now() >= nextPoll) {
      await sample(page, st, failures);
      nextPoll = Date.now() + POLL_MS;
    }
    await page.waitForTimeout(50);
  }
  for (const k of ['KeyA', 'KeyD']) await page.keyboard.up(k).catch(() => {});
  return st.inputs - inputs0;
}

async function runOne(browser, base, vp, engine) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  await page.addInitScript(instrument);
  const failures = [];
  const st = { inputs: 0, frames: 0, firstFrameMs: null, afloat: false, lastDraws: -1, lastInputs: -1, drawAt: 0, inputAt: 0, buzzMs: 0 };
  page.on('pageerror', (e) => failures.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || CONSOLE_BAD.test(m.text())) failures.push(`console.${m.type()}: ${m.text().slice(0, 300)}`);
  });
  page.on('crash', () => failures.push('page crashed'));
  watchSockets(page, st);
  let sent = 0;
  try {
    await enterSolo(page, base);
    sent = await play(page, vp, st, failures);
    const rec = await page.evaluate(() => JSON.parse(JSON.stringify(window.__glb)));
    const gl = judgeGlRecord(rec);
    failures.push(...gl.failures);
    return { tag: `${engine} ${DPR}x ${vp.width}x${vp.height}`, failures: [...new Set(failures)], sent, frames: st.frames, afloat: st.afloat, worst: gl.worst, renderer: gl.renderer };
  } catch (e) {
    failures.push(`run aborted: ${String(e).slice(0, 300)}`);
    return { tag: `${engine} ${DPR}x ${vp.width}x${vp.height}`, failures: [...new Set(failures)], sent, frames: st.frames, afloat: st.afloat, worst: null, renderer: null };
  } finally {
    await ctx.close().catch(() => {});
  }
}

function launchOpts(engine) {
  const opts = { headless: process.env.HC_PLAY_HEADFUL !== '1' };
  if (engine === 'chromium') opts.args = process.env.HC_GL_ARGS ? process.env.HC_GL_ARGS.split(' ').filter(Boolean) : DEFAULT_ARGS;
  return opts;
}

function print(run) {
  const w = run.worst ? `${run.worst.kind} ${run.worst.w}x${run.worst.h}` : 'none';
  console.log(`\n[${run.tag}] renderer: ${run.renderer}`);
  console.log(`  frames received: ${run.frames}, inputs sent during play: ${run.sent}, afloat at end: ${run.afloat}, largest allocation: ${w}`);
  if (run.failures.length === 0) console.log('  PASS');
  else {
    console.log(`  FAIL (${run.failures.length}):`);
    for (const f of run.failures.slice(0, 20)) console.log(`    - ${f}`);
  }
}

async function main() {
  if (!existsSync(DIST)) {
    console.error(`No client build at ${DIST}. Run: npm run build -w shared && npm run build -w client`);
    return 2;
  }
  const pw = await loadPlaywright();
  if (!pw) {
    console.error('playwright-core not found. Set HC_PLAYWRIGHT=/path/to/playwright-core/index.mjs');
    return 2;
  }
  const engines = (process.env.HC_PLAY_ENGINES ?? 'chromium,firefox').split(',').map((s) => s.trim()).filter(Boolean);
  const port = Number(process.env.HC_PLAY_PORT) || (await freePort());
  const server = await bootServer(port);
  console.log(`server on :${port} (pid group ${server.pid}); ${RUN_S} s of play per run`);
  let failed = 0;
  let ran = 0;
  try {
    for (const engine of engines) {
      let browser;
      try {
        browser = await launchMuted(pw, engine, launchOpts(engine)); // muted: switch + init script (perfLib)
      } catch (e) {
        console.log(`\n[${engine}] SKIPPED — not launchable here: ${String(e).split('\n')[0].slice(0, 200)}`);
        continue;
      }
      try {
        for (const vp of VIEWPORTS) {
          const run = await runOne(browser, `http://127.0.0.1:${port}`, vp, engine);
          ran++;
          if (run.failures.length > 0) failed++;
          print(run);
        }
      } finally {
        await browser.close().catch(() => {});
      }
    }
  } finally {
    server.stop();
  }
  console.log(`\nPlay check: ${ran > 0 && failed === 0 ? 'PASS' : `FAIL (${failed} of ${ran} runs)`}`);
  return ran > 0 && failed === 0 ? 0 : 1;
}

process.exit(await main());
