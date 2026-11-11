// THE SOUND AUDITION BUILDER (Story 10.13 wave A).
//
//   node client/scripts/soundAudition.mjs [--out <path>] [--selftest]
//
// Bundles client/scripts/audition/entry.ts — which imports the REAL client
// audio modules (candidates, render, engineGraph, master, tones) — into one
// IIFE with esbuild, inlines it and the page CSS into the template, and writes
// ONE self-contained HTML file with no external requests. The file follows the
// hosted-artifact contract: no doctype / html / head / body tags (the host
// wraps it), starting with its <title>.
//
// --selftest loads the built page in headless Chromium (playwright-core from an
// existing install, see perfLib.mjs) and calls window.__auditionSelfTest(),
// which renders every candidate through an OfflineAudioContext and the master
// chain. Exits non-zero on silence, non-finite samples, clipping, or any
// network request the page tries to make.

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, REPO } from './perfLib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDITION = join(HERE, 'audition');
const DEFAULT_OUT = join(REPO, 'client', 'dist-audition', 'sound-audition.html');
const MAX_BYTES = 2 * 1024 * 1024;
/** A render quieter than this (loudest 100 ms window, ≈ -60 dBFS) is "silent". */
const SILENT_RMS = 0.001;
const PEAK_LIMIT = 1.0;

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
    entryPoints: [join(AUDITION, 'entry.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    write: false,
    legalComments: 'none',
    alias: { '@salvo/shared': join(REPO, 'shared', 'src', 'index.ts') },
    define: { __APP_VERSION__: JSON.stringify('audition'), __HC_PERF__: 'false' },
    logLevel: 'warning',
  });
  // A literal "</script" inside the bundle would end the inline tag early.
  return result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}

async function build(out) {
  const js = await bundle();
  const css = readFileSync(join(AUDITION, 'page.css'), 'utf8');
  const html = readFileSync(join(AUDITION, 'page.html'), 'utf8')
    .replace('/*__AUDITION_CSS__*/', () => css)
    .replace('/*__AUDITION_JS__*/', () => js);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  const bytes = statSync(out).size;
  console.log(`wrote ${out} (${(bytes / 1024).toFixed(1)} KiB)`);
  if (bytes > MAX_BYTES) throw new Error(`page is ${bytes} bytes, over the ${MAX_BYTES}-byte budget`);
  return html;
}

function verdict(item) {
  if (!Number.isFinite(item.peak) || !Number.isFinite(item.rms)) return 'NON-FINITE';
  if (item.rms < SILENT_RMS) return 'SILENT';
  if (item.peak > PEAK_LIMIT) return 'CLIPS';
  return 'ok';
}

const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');

function printTable(items) {
  const w = Math.max(...items.map((i) => i.id.length));
  console.log(`${'item'.padEnd(w)}  length s   peak  peak dB   rms   rms dB  raw peak dB  verdict`);
  for (const i of items) {
    const row = [
      i.id.padEnd(w),
      i.lengthS.toFixed(2).padStart(8),
      i.peak.toFixed(3).padStart(6),
      db(i.peak).padStart(8),
      i.rms.toFixed(3).padStart(6),
      db(i.rms).padStart(7),
      db(i.rawPeak).padStart(11),
      verdict(i),
    ];
    console.log(row.join('  '));
  }
}

async function selftest(html) {
  const pw = await loadPlaywright();
  if (!pw) throw new Error('playwright-core could not be loaded (see perfLib.mjs playwrightCandidates)');
  const browser = await pw.mod.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const requests = [];
    page.on('request', (r) => {
      if (!/^(data|about|blob):/.test(r.url())) requests.push(r.url());
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // The host wraps the published file in a document; do the same here.
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`);
    page.setDefaultTimeout(0);
    const items = await page.evaluate(() => window.__auditionSelfTest());
    return { items, requests, errors };
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const html = await build(args.out);
  if (!args.selftest) return;
  const { items, requests, errors } = await selftest(html);
  printTable(items);
  const bad = items.filter((i) => verdict(i) !== 'ok');
  console.log(`\n${items.length} renders, ${bad.length} failing; ${requests.length} network requests; ${errors.length} page errors`);
  for (const r of requests) console.log(`  request: ${r}`);
  for (const e of errors) console.log(`  page error: ${e}`);
  if (bad.length || requests.length || errors.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
