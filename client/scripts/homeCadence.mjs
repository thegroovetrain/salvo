#!/usr/bin/env node
// A VALIDITY CONTROL FOR THE STORY 7.1 FRAME VERDICT — not part of the gate.
//
// The NFR1 capture drives a STAGED scene, and a staged scene can have its own
// pathologies: worstCaseScene.ts re-seats the zone timeline every tick, and the
// storm plane's outer radius is recomputed from camera-to-ring geometry, so a
// per-frame re-bake induced by the harness would be measured as if it were a
// property of the game. Before any of the capture's numbers can be called a
// fact about Hullcracker rather than a fact about the harness, the SHIPPED
// build with NO staged scene has to be measured the same way.
//
// So this probes the real production bundle's HOME screen — the ambient scene,
// the real render loop, no harness — with a bare rAF chain, at whatever device
// pixel ratio is asked for. If home is slow too, the cost is baseline and the
// staged scene is exonerated. If home is fast, the staged scene is the suspect.
//
//   npm run build
//   node client/scripts/homeCadence.mjs            (dpr 2, as the Retina panel runs)
//   HC_DPR=1 node client/scripts/homeCadence.mjs
//
// Prints only; writes nothing. This is a control, and controls do not belong in
// the audit record as if they were the gate.

import { join } from 'node:path';
import { REPO, serveDir, loadPlaywright, series, round } from './perfLib.mjs';

const DIST = join(REPO, 'client', 'dist');
const DPR = Number(process.env.HC_DPR ?? 2);
const VIEWPORT = process.env.HC_VIEWPORT
  ? { width: Number(process.env.HC_VIEWPORT.split('x')[0]), height: Number(process.env.HC_VIEWPORT.split('x')[1]) }
  : { width: 1600, height: 900 };
const SAMPLE_MS = 8000;

async function main() {
  const pw = await loadPlaywright();
  if (!pw) {
    console.error('playwright-core not found.');
    return 2;
  }
  const { server, port } = await serveDir(DIST);
  // THIS MACHINE HAS SWITCHABLE GRAPHICS AND IT CHANGES THE ANSWER.
  // MacBookPro16,1 carries both an integrated Intel UHD 630 and a discrete AMD
  // Radeon Pro. macOS hands a freshly spawned, unfocused window to the
  // low-power GPU, so an automated capture measures the INTEGRATED part by
  // default while the human's own browser may well be on the discrete one. A
  // verdict that does not say which GPU drew it is not a verdict.
  const browser = await pw.mod.chromium.launch({
    headless: false,
    args: process.env.HC_GPU === 'high' ? ['--force_high_performance_gpu'] : [],
  });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });

  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('#main-menu button', { timeout: 60000 });
    await page.waitForTimeout(2500); // let the ambient scene settle

    const gpu = await page.evaluate(() => {
      // Mirror the game's own context request — see perfCapture.mjs; a
      // default-preference probe can report a different adapter than the one
      // that actually drew the frames.
      const c = document.createElement('canvas');
      const opts = { powerPreference: 'high-performance' };
      const gl = c.getContext('webgl2', opts) ?? c.getContext('webgl', opts);
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: gl && dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
        dpr: window.devicePixelRatio,
        canvas: (() => {
          const el = document.querySelector('#app canvas');
          return el ? { w: el.width, h: el.height, cssW: el.clientWidth, cssH: el.clientHeight } : null;
        })(),
      };
    });

    const intervals = await page.evaluate(async (ms) => {
      const out = [];
      let last = null;
      await new Promise((done) => {
        const t0 = performance.now();
        const step = (t) => {
          if (last !== null) out.push(t - last);
          last = t;
          if (t - t0 < ms) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
      return out;
    }, SAMPLE_MS);

    const s = series(intervals);
    console.log(`\nHOME SCREEN cadence — shipped build, no staged scene`);
    console.log(`  renderer : ${gpu.renderer}`);
    console.log(`  dpr      : ${gpu.dpr}  viewport ${VIEWPORT.width}x${VIEWPORT.height}  canvas ${gpu.canvas?.w}x${gpu.canvas?.h}`);
    console.log(`  intervals: p50 ${round(s.p50)}ms  p95 ${round(s.p95)}ms  max ${round(s.max)}ms  (n=${s.n})`);
    console.log(`  implied  : ~${round(1000 / s.p50, 1)} FPS median\n`);
  } finally {
    await browser.close();
    server.close();
  }
  return 0;
}

process.exit(await main());
