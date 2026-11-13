// THE DISPERSION BENCH BUILDER (Story 11.1, Phase A, ruling R1).
//
//   node client/scripts/dispersionBench.mjs [--out <path>] [--selftest]
//
// Bundles client/scripts/dispersionBench/entry.ts — which imports the REAL
// shared module (`@salvo/shared` aliased to shared/src, so `dispersedPoint`,
// `dispersionAxes`, the hull silhouettes and the blast test are the code the
// server fires with) — into one IIFE with esbuild, inlines it and the page CSS
// into the template, and writes ONE self-contained HTML file with no external
// requests. The recipe is soundAudition.mjs's: the file follows the
// hosted-artifact contract (no doctype / html / head / body tags; the host
// wraps it), starting with its <title>.
//
// --selftest loads the built page in headless Chromium (playwright-core from an
// existing install, see perfLib.mjs) and calls window.__benchSelfTest(). Exits
// non-zero on any page error, any network request, a blank canvas, or a
// non-finite readout.

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, REPO, launchMuted } from './perfLib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BENCH = join(HERE, 'dispersionBench');
const DEFAULT_OUT = join(REPO, 'client', 'dist-bench', 'dispersion-bench.html');
const MAX_BYTES = 2 * 1024 * 1024;
/** A canvas with fewer non-background pixels than this counts as blank. */
const MIN_INKED = 200;

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
      __BENCH_BUILD__: JSON.stringify(`Built ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC from the shared dispersion module`),
    },
    logLevel: 'warning',
  });
  // A literal "</script" inside the bundle would end the inline tag early.
  return result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}

async function build(out) {
  const js = await bundle();
  const css = readFileSync(join(BENCH, 'page.css'), 'utf8');
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

async function selftest(html) {
  const pw = await loadPlaywright();
  if (!pw) throw new Error('playwright-core could not be loaded (see perfLib.mjs playwrightCandidates)');
  // --disable-gpu: on this machine headless Chromium loses every GPU-backed 2D
  // canvas context within a frame (even a one-canvas page), which reads as a
  // blank canvas; software rendering is what the self-test needs anyway.
  const browser = await launchMuted(pw, 'chromium', { headless: true, args: ['--disable-gpu'] });
  try {
    const results = [];
    for (const width of [1280, 375]) {
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
      // The host wraps the published file in a document; do the same here.
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${html}</body></html>`);
      const report = await page.evaluate(() => window.__benchSelfTest());
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      results.push({ width, report, overflow, requests, errors });
      await page.close();
    }
    return results;
  } finally {
    await browser.close();
  }
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const html = await build(args.out);
  if (!args.selftest) return;
  let failed = 0;
  for (const res of await selftest(html)) {
    const least = res.report.canvases.reduce((m, c) => (c.inked < m.inked ? c : m));
    const canv = `${res.report.canvases.length} canvases, least inked ${least.id} ${least.inked} px`;
    const r = res.report.readouts;
    console.log(`width ${res.width}: ${canv}; aim oval ${r.aimOvalLongPx.toFixed(1)} px long; oval ${r.fullLengthU.toFixed(2)} × ${r.fullWidthU.toFixed(2)} u; hit ${(r.hitShare * 100).toFixed(1)} %; middle half ${(r.innerShare * 100).toFixed(1)} %`);
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
