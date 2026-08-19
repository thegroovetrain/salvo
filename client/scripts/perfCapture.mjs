#!/usr/bin/env node
// STORY 7.1 — THE NFR1 FRAME-BUDGET CAPTURE.
//
// This is the instrument that makes the NFR1 verdict obtainable at all. Before
// it, the verdict was blocked by a genuine deadlock rather than by neglect:
//
//   * the ONLY split sim/render timer lives in client/src/stage/worstCase.ts,
//     reachable only under `import.meta.env.DEV`; and
//   * Eric ruled (2026-08-11) that a Vite DEV build is an invalid basis for an
//     NFR1 verdict in either direction ("the dev build runs poorly on my
//     machine"), and that headless Chromium's throttled `requestAnimationFrame`
//     makes any browser frame COUNT a measurement of the throttle.
//
// So "has an instrument" and "is a valid basis" were mutually exclusive. The
// PERF BUILD breaks the deadlock — `vite build --mode perf` runs the identical
// Rollup pipeline with identical minification and identical folded-away dev
// branches, and differs from the shipped artifact by one define. This script
// serves THOSE BYTES and drives them HEADFUL on the reference device, so the
// browser presents against a real vsync source and the cadence is an
// observation rather than an artifact.
//
// WHAT IT REFUSES TO DO. If the rAF cadence is implausible for a real display
// the harness reports `vsyncTrusted: false` and this script records the cadence
// leg as REFUSED rather than printing a number. A refusal is evidence; a
// fabricated frame rate is not. The per-callback cost figures remain valid in
// either case — they are `performance.now()` around real work — and the frame
// BUDGET (sim <= 3 ms, render <= 10 ms, headroom >= 3.6 ms) is a cost budget,
// which is why a cost-only run still produces a real verdict.
//
//   npm run build:perf -w client
//   node client/scripts/perfCapture.mjs              (headful — the ratified run)
//   node client/scripts/perfCapture.mjs --headless   (cost only; cadence refused)
//
// Output: _bmad-output/implementation-artifacts/perf-gate/

import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  REPO, OUT_DIR, REFERENCE_DEVICE, BUDGET,
  serveDir, loadPlaywright, ensureOutDir, round,
} from './perfLib.mjs';

const DIST = join(REPO, 'client', 'dist-perf');

/**
 * THE DEVICE PIXEL RATIO IS PART OF THE MEASUREMENT, NOT A DETAIL.
 *
 * `render/stage.ts` initialises Pixi with
 * `resolution: Math.min(window.devicePixelRatio || 1, 2)`, and the reference
 * MacBook is a Retina panel — so a real player on this device renders at 2x,
 * i.e. FOUR TIMES the fragments of a 1x capture. A capture at deviceScaleFactor
 * 1 is therefore optimistic by exactly the factor that matters most to a
 * fill-rate-bound frame, which is the failure mode a CPU-side timer cannot see
 * at all. The default here is 2 for that reason; HC_DPR=1 exists only to make
 * the fill-rate hypothesis testable by halving the linear resolution.
 */
const DPR = Number(process.env.HC_DPR ?? 2);
const VIEWPORT = process.env.HC_VIEWPORT
  ? { width: Number(process.env.HC_VIEWPORT.split('x')[0]), height: Number(process.env.HC_VIEWPORT.split('x')[1]) }
  : { width: 1600, height: 900 };

/** ms of settling after a framing change (the fog re-bake is debounced ~150ms). */
const SETTLE_MS = 1500;
/** ms of measurement dwell per framing. Long enough that p95 means something. */
const DWELL_MS = 12000;

const HEADLESS = process.argv.includes('--headless');

/**
 * The framings measured. The alive band (0.5x-1.5x) is the camera's documented
 * user-zoom range; the reveal is the omniscient whole-disc framing from Story
 * 5.3, which draws every island coastline and contour band on the map at once
 * and has NEVER been cost-measured. Averaging them into one number would hide
 * whichever is worse, so each carries its own verdict.
 */
const ALL_FRAMINGS = [
  { name: 'alive-zoom-0.5x', kind: 'zoom', value: 0.5 },
  { name: 'alive-zoom-1.0x', kind: 'zoom', value: 1.0 },
  { name: 'alive-zoom-1.5x', kind: 'zoom', value: 1.5 },
  { name: 'omniscient-reveal', kind: 'reveal' },
];

// HC_FRAMINGS runs a subset, comma-separated. This exists because measurement
// ORDER is itself a confound: a framing that runs third has a warmer cache, a
// hotter package and whatever state the previous two left behind, so a result
// that only appears in position three has to be re-taken in position one before
// it can be called a property of the framing.
const FRAMINGS = process.env.HC_FRAMINGS
  ? ALL_FRAMINGS.filter((f) => process.env.HC_FRAMINGS.split(',').includes(f.name))
  : ALL_FRAMINGS;

async function applyFraming(page, f) {
  if (f.kind === 'reveal') {
    await page.evaluate(() => window.__hcStage.setReveal(true));
    return;
  }
  await page.evaluate(
    (z) => {
      window.__hcStage.setReveal?.(false);
      window.__hcStage.setZoom(z);
    },
    f.value,
  );
}

/** One framing: apply, settle, reset the window, dwell, read everything back. */
async function measure(page, f) {
  await applyFraming(page, f);
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(() => window.__hcStage.resetSamples());
  await page.waitForTimeout(DWELL_MS);

  const read = await page.evaluate(() => ({
    stats: window.__hcStage.stats(),
    present: window.__hcStage.presentStats(),
    counts: window.__hcStage.counts(),
    zoom: window.__hcStage.zoom(),
    tick: window.__hcStage.tick(),
  }));

  const shot = join(OUT_DIR, `nfr1-${f.name}.png`);
  await page.screenshot({ path: shot, type: 'png' });

  return { framing: f.name, image: `nfr1-${f.name}.png`, ...read };
}

/**
 * The verdict for one framing. The budget is a COST budget, so it is decided on
 * p95 rather than the mean: a 60 FPS claim that holds on average and misses one
 * frame in ten is not a 60 FPS claim.
 */
function verdict(m) {
  const s = m.stats;
  if (!s) return { obtained: false, reason: 'fewer than 2 frames sampled' };
  const sim = s.sim.p95;
  const render = s.render.p95;
  const headroom = BUDGET.frameMs - sim - render;
  const cadence = m.present?.vsyncTrusted
    ? {
        obtained: true,
        p50IntervalMs: round(m.present.intervalMs.p50),
        p95IntervalMs: round(m.present.intervalMs.p95),
        longFrames: m.present.longFrames,
        sustains60: m.present.intervalMs.p95 <= 18.0,
      }
    : {
        obtained: false,
        reason:
          'rAF cadence is not trustworthy in this run (headless or no real vsync source) — refused rather than reported, per the 2026-08-11 ruling.',
        // A REFUSAL STILL RECORDS WHAT IT SAW. Discarding the samples makes a
        // refused run indistinguishable from a clean one in the audit record,
        // and the next reader cannot tell whether the clock was wrong or the
        // frame rate was bad.
        observed: m.present && {
          p50IntervalMs: round(m.present.intervalMs.p50),
          p95IntervalMs: round(m.present.intervalMs.p95),
          longFrames: m.present.longFrames,
        },
      };
  return {
    obtained: true,
    simP95Ms: round(sim),
    renderP95Ms: round(render),
    headroomMs: round(headroom),
    pass: {
      sim: sim <= BUDGET.simMs,
      render: render <= BUDGET.renderMs,
      headroom: headroom >= BUDGET.headroomMs,
    },
    cadence,
  };
}

async function main() {
  if (!existsSync(DIST)) {
    console.error(`No perf build at ${DIST.slice(REPO.length + 1)}.\nRun:  npm run build:perf -w client`);
    return 2;
  }
  const pw = await loadPlaywright();
  if (!pw) {
    console.error('playwright-core not found. Set HC_PLAYWRIGHT=/path/to/playwright-core/index.mjs');
    return 2;
  }
  ensureOutDir();

  const { server, port } = await serveDir(DIST);
  const base = `http://127.0.0.1:${port}`;
  // WHICH GPU DRAWS THIS IS PART OF THE VERDICT, NOT AN INCIDENTAL.
  // MacBookPro16,1 has switchable graphics: an integrated Intel UHD 630 and a
  // discrete AMD Radeon Pro 5300M. macOS gives a freshly spawned, unfocused
  // automation window to the LOW-POWER part, so an unflagged capture measures
  // the integrated GPU — which reads as a catastrophic frame rate that a human
  // playing the game in the foreground would never see. Measured on the home
  // screen: 50.8 ms/frame integrated versus 16.7 ms discrete, same build, same
  // pixels.
  //
  // HC_GPU=high is therefore the RATIFIED configuration (a foreground game gets
  // the high-performance GPU), and the integrated run is kept as a deliberate
  // stress data point for players whose hardware has no discrete part at all.
  const gpuArgs =
    process.env.HC_GPU === 'high'
      ? ['--force_high_performance_gpu']
      : process.env.HC_GPU === 'low'
        ? // The integrated-hardware stress point, forced. Not a failure of the
          // client — it is the honest answer for a player whose machine has no
          // discrete GPU to ask for, which is a large share of laptops.
          ['--force_low_power_gpu']
        : [];
  const browser = await pw.mod.chromium.launch({
    headless: HEADLESS,
    args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', ...gpuArgs],
  });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });

  const results = [];
  let gpu = null;
  try {
    // HC_PROFILE swaps the staged population. It exists to answer one question
    // the frame-time split cannot: is the cost coming from the SCENE or from
    // the baseline full-screen composite? If a light population costs the same
    // as the reference one, entity count is not the lever and no amount of
    // pooling or batching will move the verdict.
    const profile = process.env.HC_PROFILE ?? 'nfr1';
    await page.goto(`${base}/?stage=worstcase&profile=${profile}`, { waitUntil: 'load', timeout: 60000 });

    // WHICH RENDERER ACTUALLY DREW THIS? Without asking, a fill-rate verdict is
    // worthless: a Chromium that has silently fallen back to SwiftShader (CPU
    // rasterisation) will report a catastrophic frame rate that says nothing
    // whatever about the reference device's real GPU. The renderer string is
    // recorded beside every number so no reader has to take the hardware on
    // faith.
    // THE PROBE MUST ASK FOR WHAT THE GAME ASKS FOR. A throwaway canvas created
    // with the default power preference can land on a DIFFERENT adapter than the
    // game's own context on the very same page — which is not a contradiction,
    // it is the whole mechanism this story found: `powerPreference` is what
    // decides, per context. Probing with the default would report the integrated
    // GPU while the game ran on the discrete one, i.e. an honest-looking number
    // attached to the wrong hardware.
    gpu = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const opts = { powerPreference: 'high-performance' };
      const gl = c.getContext('webgl2', opts) ?? c.getContext('webgl', opts);
      if (!gl) return { ok: false, renderer: 'no webgl context' };
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        ok: true,
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        devicePixelRatio: window.devicePixelRatio,
      };
    });
    const soft = /swiftshader|software|llvmpipe|angle \(google/i.test(gpu.renderer ?? '');
    console.log(`\nrenderer: ${gpu.renderer} (dpr ${gpu.devicePixelRatio})${soft ? '  <-- SOFTWARE, verdict invalid' : ''}`);
    gpu.hardwareAccelerated = !soft;
    await page.waitForFunction(() => window.__hcStage?.warmedUp?.() === true, null, { timeout: 120000 });
    for (const f of FRAMINGS) results.push(await measure(page, f));
  } finally {
    await browser.close();
    server.close();
  }

  const record = {
    story: '7.1',
    what: 'NFR1 frame-budget verdict, staged NFR1 population on the perf build',
    device: REFERENCE_DEVICE,
    basis: {
      build: 'client/dist-perf (vite build --mode perf) — production pipeline, production minification',
      headless: HEADLESS,
      gpu,
      viewport: VIEWPORT,
      devicePixelRatio: DPR,
      devicePixelRatio: DPR,
      dwellMsPerFraming: DWELL_MS,
      scene: '?stage=worstcase&profile=nfr1',
    },
    budget: BUDGET,
    framings: results.map((m) => ({
      framing: m.framing,
      image: m.image,
      zoom: round(m.zoom, 3),
      sceneTick: m.tick,
      counts: m.counts,
      frameCostMs: m.stats && {
        frames: m.stats.frames,
        total: { p50: round(m.stats.total.p50), p95: round(m.stats.total.p95), max: round(m.stats.total.max) },
        sim: { p50: round(m.stats.sim.p50), p95: round(m.stats.sim.p95), max: round(m.stats.sim.max) },
        render: { p50: round(m.stats.render.p50), p95: round(m.stats.render.p95), max: round(m.stats.render.max) },
      },
      verdict: verdict(m),
    })),
  };

  const out = join(OUT_DIR, 'nfr1-frame-budget.json');
  writeFileSync(out, JSON.stringify(record, null, 2) + '\n');

  console.log(`\nNFR1 frame budget — ${REFERENCE_DEVICE.model}, ${HEADLESS ? 'headless' : 'HEADFUL'}`);
  console.log(`budget: sim <= ${BUDGET.simMs}ms, render <= ${BUDGET.renderMs}ms, headroom >= ${BUDGET.headroomMs}ms\n`);
  for (const f of record.framings) {
    const v = f.verdict;
    if (!v.obtained) {
      console.log(`  ${f.framing.padEnd(20)} NOT OBTAINED — ${v.reason}`);
      continue;
    }
    const mark = (ok) => (ok ? 'ok  ' : 'FAIL');
    console.log(
      `  ${f.framing.padEnd(20)} sim ${String(v.simP95Ms).padStart(6)}ms ${mark(v.pass.sim)}  ` +
        `render ${String(v.renderP95Ms).padStart(6)}ms ${mark(v.pass.render)}  ` +
        `headroom ${String(v.headroomMs).padStart(6)}ms ${mark(v.pass.headroom)}`,
    );
    console.log(
      `  ${''.padEnd(20)} cadence: ` +
        (v.cadence.obtained
          ? `p50 ${v.cadence.p50IntervalMs}ms / p95 ${v.cadence.p95IntervalMs}ms, ${v.cadence.longFrames} long — ${v.cadence.sustains60 ? '60 FPS SUSTAINS' : '60 FPS DOES NOT SUSTAIN'}`
          : 'REFUSED (' + v.cadence.reason + ')'),
    );
    console.log(`  ${''.padEnd(20)} entities: ${JSON.stringify(f.counts)}`);
  }
  console.log(`\nwrote ${out.slice(REPO.length + 1)}`);
  return 0;
}

process.exit(await main());
