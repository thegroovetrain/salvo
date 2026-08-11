#!/usr/bin/env node
// THE READABILITY GATE's headless capture (Story 4.8, amendment 242).
//
// Amendment 242: *"The gate is a dev-only staged worst-case scene (multiple
// contacts, torpedoes inbound, storm closing, kill leader active, own hull
// critical), captured headlessly at both zoom extremes with the measured
// per-frame cost alongside, written up as the documented check for Eric's
// review."* This script is the capture half. The scene itself is
// client/src/stage/worstCase*.ts, reachable ONLY in a dev build at
// `/?stage=worstcase`.
//
// IT NEVER STARTS THE DEV SERVER. Eric manages `npm run dev` by hand (CLAUDE.md);
// this script probes :5173 and exits with instructions if nothing answers.
//
// IT ADDS NO DEPENDENCY TO THE REPO. `playwright-core` is not, and is not made,
// a workspace dependency: the script resolves an EXISTING install (the gstack
// skill suite ships one, with its browsers already in the Playwright cache) and
// tells you exactly what to do if it cannot find one. Same posture as
// server/scripts/*.mjs — plain node, no build step, no install.
//
//   node client/scripts/readabilityCapture.mjs
//   node client/scripts/readabilityCapture.mjs --verify-bundle   (no browser needed)
//
// Output (images + one machine-readable JSON, nothing else):
//   _bmad-output/implementation-artifacts/readability-gate/

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const OUT_DIR = join(REPO, '_bmad-output', 'implementation-artifacts', 'readability-gate');
const DIST_DIR = join(REPO, 'client', 'dist');

/** The staged scene's tell — see client/src/stage/worstCaseScene.ts STAGE_MARKER. */
const STAGE_MARKER = 'HC_STAGED_WORSTCASE_4_8';

const CLIENT_URL = process.env.HC_CLIENT_URL ?? 'http://localhost:5173';
const SCENE_URL = `${CLIENT_URL}/?stage=worstcase`;

/** The camera's documented alive user-zoom range (render/camera.ts). */
const ZOOMS = [
  { name: 'zoom-0.5x-wide', value: 0.5 },
  { name: 'zoom-1.5x-close', value: 1.5 },
];

/** Fixed viewport so two captures are the same picture at the same size. */
const VIEWPORT = { width: 1600, height: 900 };

/** ms of settling after a zoom change (the fog re-bake is debounced ~150ms). */
const SETTLE_MS = 1200;
/** ms of frame-cost sampling per zoom. */
const MEASURE_MS = 6000;

/** The ratified per-frame budget this capture is compared against. */
const BUDGET = { frameMs: 16.6, simMs: 3, renderMs: 10, headroomMs: 3.6 };

/** Where an existing playwright-core might live, in priority order. */
function playwrightCandidates() {
  const list = [];
  if (process.env.HC_PLAYWRIGHT) list.push(process.env.HC_PLAYWRIGHT);
  list.push(join(REPO, 'node_modules', 'playwright-core', 'index.mjs'));
  list.push(join(homedir(), '.claude', 'skills', 'gstack', 'node_modules', 'playwright-core', 'index.mjs'));
  return list;
}

async function loadPlaywright() {
  for (const p of playwrightCandidates()) {
    if (!existsSync(p)) continue;
    try {
      return { mod: await import(pathToFileURL(p).href), from: p };
    } catch {
      // try the next candidate — a broken install must not mask a working one
    }
  }
  try {
    return { mod: await import('playwright-core'), from: 'playwright-core (resolved)' };
  } catch {
    return null;
  }
}

async function clientReachable() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    await fetch(CLIENT_URL, { signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Grep the PRODUCTION bundle for the staged scene. Absence is the pass. */
function verifyBundle() {
  if (!existsSync(DIST_DIR)) {
    console.error(`No production build at ${DIST_DIR}.\nRun:  npm run build -w client`);
    return 2;
  }
  const hits = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.(js|css|html|map)$/.test(entry.name)) continue;
      const text = readFileSync(p, 'utf8');
      for (const needle of [STAGE_MARKER, '__hcStage', 'worstcase', 'worstCase']) {
        if (text.includes(needle)) hits.push({ file: p.slice(REPO.length + 1), needle });
      }
    }
  };
  walk(DIST_DIR);
  if (hits.length === 0) {
    console.log(`PASS — the staged scene is absent from ${DIST_DIR.slice(REPO.length + 1)}.`);
    console.log('       (searched for: ' + [STAGE_MARKER, '__hcStage', 'worstcase', 'worstCase'].join(', ') + ')');
    return 0;
  }
  console.error('FAIL — staged-scene traces found in the production bundle:');
  for (const h of hits) console.error(`  ${h.file}: ${h.needle}`);
  return 1;
}

/** Capture one zoom extreme: settle, measure, screenshot. */
async function captureZoom(page, zoom) {
  await page.evaluate((z) => window.__hcStage.setZoom(z), zoom.value);
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(() => window.__hcStage.resetSamples());
  await page.waitForTimeout(MEASURE_MS);
  const measured = await page.evaluate(() => ({
    stats: window.__hcStage.stats(),
    zoom: window.__hcStage.zoom(),
    tick: window.__hcStage.tick(),
  }));
  const file = join(OUT_DIR, `worstcase-${zoom.name}.png`);
  await page.screenshot({ path: file, type: 'png' });
  return { ...measured, requestedZoom: zoom.value, image: `worstcase-${zoom.name}.png` };
}

/** Budget verdicts. REPORTED, never tuned toward (the story forbids retuning). */
function verdicts(stats) {
  if (!stats) return null;
  const headroom = BUDGET.frameMs - stats.total.p95;
  return {
    simP95WithinBudget: stats.sim.p95 <= BUDGET.simMs,
    renderP95WithinBudget: stats.render.p95 <= BUDGET.renderMs,
    headroomP95Ms: headroom,
    headroomWithinBudget: headroom >= BUDGET.headroomMs,
  };
}

async function run() {
  if (!(await clientReachable())) {
    console.error(
      [
        `The client dev server is not answering at ${CLIENT_URL}.`,
        '',
        'This script never starts it — Eric manages the dev server by hand.',
        'Start it in another terminal and re-run:',
        '',
        '    npm run dev',
        '',
        `(override the URL with HC_CLIENT_URL if you serve the client elsewhere)`,
      ].join('\n'),
    );
    return 3;
  }

  const pw = await loadPlaywright();
  if (pw === null) {
    console.error(
      [
        'No usable playwright-core install was found, and this script deliberately',
        'does not add one to the repo.',
        '',
        'Looked in:',
        ...playwrightCandidates().map((p) => `    ${p}`),
        '',
        'Point HC_PLAYWRIGHT at an existing playwright-core index.mjs, or install',
        'browsers for one you already have. Nothing else about the staged scene',
        'depends on this — it is reachable by hand at:',
        '',
        `    ${SCENE_URL}`,
      ].join('\n'),
    );
    return 4;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await pw.mod.chromium.launch({
    // SwiftShader keeps WebGL alive in a headless container; harmless where a
    // real GPU is available. The capture measures the RENDER path, so a browser
    // that silently fell back to canvas would be measuring the wrong thing —
    // the marker check below fails loudly rather than producing a quiet lie.
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  const results = [];
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    await page.goto(SCENE_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.__hcStage === 'object' && window.__hcStage !== null, { timeout: 30000 });
    const marker = await page.evaluate(() => window.__hcStage.marker);
    if (marker !== STAGE_MARKER) throw new Error(`staged scene marker mismatch: ${marker}`);
    // Poll the warm-up rather than awaiting `ready`: a predicate can carry a
    // timeout, so a scene that never advances fails loudly instead of hanging.
    await page.waitForFunction(() => window.__hcStage.warmedUp(), { timeout: 60000 });

    // Put the cursor out ahead of the bow. The aim reticle, the bearing line and
    // the weapon arc are all derived from the pointer, and a headless page that
    // never moves it leaves them pinned to the top-left corner — a picture of
    // the HUD that no player would ever see.
    await page.mouse.move(VIEWPORT.width * 0.58, VIEWPORT.height * 0.42);

    for (const zoom of ZOOMS) results.push(await captureZoom(page, zoom));

    const report = {
      generatedAt: new Date().toISOString(),
      scene: { marker, seed: await page.evaluate(() => window.__hcStage.seed), url: SCENE_URL },
      viewport: VIEWPORT,
      measureMs: MEASURE_MS,
      budget: BUDGET,
      playwrightFrom: pw.from,
      consoleErrors,
      captures: results.map((r) => ({ ...r, verdicts: verdicts(r.stats) })),
    };
    writeFileSync(join(OUT_DIR, 'measurements.json'), `${JSON.stringify(report, null, 2)}\n`);
    for (const r of report.captures) {
      const s = r.stats;
      if (!s) {
        console.log(`${r.image}: no samples`);
        continue;
      }
      console.log(
        `${r.image}  zoom ${r.zoom.toFixed(2)}x  ${s.fps.toFixed(1)} fps  ` +
          `total p50 ${s.total.p50.toFixed(2)}ms p95 ${s.total.p95.toFixed(2)}ms  ` +
          `sim p95 ${s.sim.p95.toFixed(2)}ms  render p95 ${s.render.p95.toFixed(2)}ms`,
      );
    }
    console.log(`\nWrote ${OUT_DIR.slice(REPO.length + 1)}/ (2 PNGs + measurements.json)`);
    if (consoleErrors.length > 0) console.warn(`\n${consoleErrors.length} console error(s) — see measurements.json`);
    return 0;
  } finally {
    await browser.close();
  }
}

const mode = process.argv[2];
const code = mode === '--verify-bundle' ? verifyBundle() : await run();
process.exit(code);
