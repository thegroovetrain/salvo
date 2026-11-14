// THE ARC BENCH BUILDER (Story 11.3, R5 + R6).
//
//   node client/scripts/arcBench.mjs [--out <path>] [--selftest]
//
// The reach bench's recipe (client/scripts/reachBench.mjs): bundles
// client/scripts/arcBench/entry.ts — which imports the REAL shared module
// (`@salvo/shared` aliased to shared/src, so `generateMap`, the radar
// rasterizers, `smearArc` and `fuzzCoverage` are the game's own code) — into
// one IIFE with esbuild, inlines it and the page CSS
// (the dispersion bench's page.css + this page's additions) into the
// template, and writes ONE self-contained HTML file with no external requests.
// It follows the hosted-artifact contract: no doctype / html / head / body
// tags (the host wraps it), starting with its <title>.
//
// --selftest loads the built page in headless Chromium (playwright-core from an
// existing install, see perfLib.mjs) at desktop and phone widths, each in a
// FRESH browser with the GPU ON, waits SETTLE_MS with no interaction and then
// calls window.__benchSelfTest(), which measures the canvases exactly as page
// load left them (it never redraws first). Exits non-zero on any page error,
// any network request, a blank canvas, a non-finite readout or a horizontal
// page scroll.
//
// WHY GPU ON AND A FRESH BROWSER PER WIDTH: in a fresh headless Chromium the
// first page's accelerated 2D canvases are LOST shortly after their first
// draw (the GPU process coming up) and RESTORED BLANK about half a second
// later (`contextlost`, then `contextrestored`). A page that does not redraw
// on `contextrestored` stays blank. `--disable-gpu` hid that; this harness
// reproduces it on purpose, so the redraw-on-restore path is what passes.

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, REPO, launchMuted } from './perfLib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BENCH = join(HERE, 'arcBench');
const SHARED_CSS = join(HERE, 'dispersionBench', 'page.css');
const DEFAULT_OUT = join(REPO, 'client', 'dist-bench', 'arcBench.html');
const MAX_BYTES = 2 * 1024 * 1024;
/** A canvas with fewer non-background pixels than this counts as blank. */
const MIN_INKED = 200;
/** ms to wait after load before measuring: past the GPU context loss and its
 *  restore (~0.5 s after the first draw in a fresh headless browser). */
const SETTLE_MS = 2000;

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, selftest: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--selftest') args.selftest = true;
    else if (argv[i] === '--out') args.out = resolve(argv[++i] ?? '');
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return args;
}

async function bundle() {
  const esbuild = await import('esbuild');
  const result = await esbuild.build({
    entryPoints: [join(BENCH, 'entry.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    write: false,
    legalComments: 'none',
    alias: { '@salvo/shared': join(REPO, 'shared', 'src', 'index.ts') },
    define: {
      __BENCH_BUILD__: JSON.stringify(`Built ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC from the shared map, raster and arc modules`),
    },
    logLevel: 'warning',
  });
  // A literal "</script" inside the bundle would end the inline tag early.
  return result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}

async function build(out) {
  const js = await bundle();
  const css = `${readFileSync(SHARED_CSS, 'utf8')}\n${readFileSync(join(BENCH, 'page.css'), 'utf8')}`;
  const html = readFileSync(join(BENCH, 'page.html'), 'utf8')
    .replace('/*__BENCH_CSS__*/', () => css)
    .replace('/*__BENCH_JS__*/', () => js);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  const bytes = statSync(out).size;
  console.log(`wrote ${out} (${(bytes / 1024).toFixed(1)} KiB)`);
  if (bytes > MAX_BYTES) throw new Error(`page is ${bytes} bytes, over the ${MAX_BYTES}-byte budget`);
  return html;
}

async function checkWidth(browser, html, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const requests = [];
  page.on('request', (r) => {
    if (!/^(data|about|blob):/.test(r.url())) requests.push(r.url());
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  try {
    // The host wraps the published file in a document; do the same here.
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${html}</body></html>`);
    await page.waitForTimeout(SETTLE_MS);
    const started = Date.now();
    const report = await page.evaluate(() => window.__benchSelfTest());
    const ms = Date.now() - started;
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    return { width, report, overflow, requests, errors, ms };
  } finally {
    await page.close();
  }
}

async function selftest(html) {
  const pw = await loadPlaywright();
  if (!pw) throw new Error('playwright-core could not be loaded (see perfLib.mjs playwrightCandidates)');
  const results = [];
  for (const width of [1280, 375]) {
    // GPU on, one fresh browser per width — see the header.
    const browser = await launchMuted(pw, 'chromium', { headless: true });
    try {
      results.push(await checkWidth(browser, html, width));
    } finally {
      await browser.close();
    }
  }
  return results;
}

function failures({ report, overflow, requests, errors }) {
  const bad = [];
  for (const c of report.canvases) if (c.inked < MIN_INKED) bad.push(`canvas #${c.id} is blank (${c.inked} inked px)`);
  for (const [k, v] of Object.entries(report.readouts)) if (!Number.isFinite(v)) bad.push(`readout ${k} is ${v}`);
  if (overflow > 0) bad.push(`horizontal page scroll of ${overflow} px`);
  for (const r of requests) bad.push(`network request: ${r}`);
  for (const e of errors) bad.push(`page error: ${e}`);
  return bad;
}

function summary(res) {
  const r = res.report.readouts;
  const least = res.report.canvases.reduce((m, c) => (c.inked < m.inked ? c : m));
  const u = (k) => Math.round(r[k]);
  return (
    `width ${res.width}: ${res.report.canvases.length} canvases, least inked ${least.id} ${least.inked} px; ` +
    `yamato side-on arc width 50/200/400 hm ${u('yamato-50-side.widthU')}/${u('yamato-200-side.widthU')}/${u('yamato-400-side.widthU')} u, 400 hm end-on ${u('cand.yamato-400-end.widthU')} u wide × ${u('cand.yamato-400-end.depthU')} u deep; ` +
    `crate ${u('crate.widthU')} u wide, wake ${u('wake.widthU')} u wide; ` +
    `smearArc ${r.smearMicros.toFixed(1)} µs/call in the page; self-test took ${res.ms} ms`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const html = await build(args.out);
  if (!args.selftest) return;
  let failed = 0;
  for (const res of await selftest(html)) {
    console.log(summary(res));
    const bad = failures(res);
    for (const b of bad) console.log(`  FAIL ${b}`);
    failed += bad.length;
  }
  console.log(failed ? `${failed} self-test failures` : 'self-test ok');
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
