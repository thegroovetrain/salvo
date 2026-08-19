#!/usr/bin/env node
// STORY 7.1 — THE NFR2 COLD-LOAD CAPTURE.
//
// NFR2: cold load -> interactive home in under ~10 s on the reference device
// over a typical residential connection, with fonts NOT blocking first paint,
// and with ad / analytics / consent script cost counted against the same budget
// once those exist.
//
// THIS MEASURES THE SHIPPED ARTIFACT, NOT THE PERF BUILD. `client/dist` is what
// a player downloads; the perf build carries the staged scene and would
// overstate the bundle. The static server sends `cache-control: no-store` and
// every run gets a fresh context with the cache cleared, so each run is
// genuinely cold — a warm reload is not the number NFR2 is about.
//
// "FONTS DO NOT BLOCK FIRST PAINT" IS DECIDED BY EXPERIMENT, NOT BY INFERENCE.
// Reading timings and arguing about overlap is exactly how a claim like this
// gets asserted rather than tested, so the third profile BLOCKS fonts.gstatic
// and fonts.googleapis outright. If first paint and interactive home still land
// inside the budget with the font CDN unreachable, the claim is demonstrated;
// if they do not, the blocker is real and named. That is also the honest
// simulation of a player behind a firewall or a slow font CDN.
//
// WHAT IS NOT MEASURED HERE, AND WHY: no ad, analytics or consent script cost.
// None of them exist yet (Stories 7.2 and 7.4). This run establishes the budget
// they must later fit inside, and the record says so rather than implying the
// measured figure is final.
//
//   npm run build
//   node client/scripts/loadCapture.mjs
//
// Output: _bmad-output/implementation-artifacts/perf-gate/

import { writeFileSync, existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { REPO, OUT_DIR, REFERENCE_DEVICE, serveDir, loadPlaywright, ensureOutDir, round } from './perfLib.mjs';

// HC_DIST lets a run measure a SNAPSHOT of a previous build, which is how the
// before/after pair for a load fix is taken honestly: the same script, the same
// machine, the same connection profile, two sets of bytes.
const DIST = process.env.HC_DIST ? join(REPO, process.env.HC_DIST) : join(REPO, 'client', 'dist');
const VIEWPORT = { width: 1600, height: 900 };
const BUDGET_MS = 10000;

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;

/**
 * The connection profiles. "Typical residential" is a judgement, so it is
 * stated rather than hidden: a modest home broadband line, deliberately below
 * the median so the figure is not flattering. The unthrottled run isolates how
 * much of the load is the bundle's own parse/execute cost rather than transfer.
 */
const PROFILES = [
  {
    name: 'residential-24mbps',
    blockFonts: false,
    net: { offline: false, downloadThroughput: (24 * 1024 * 1024) / 8, uploadThroughput: (8 * 1024 * 1024) / 8, latency: 30 },
  },
  {
    name: 'residential-24mbps-fonts-blocked',
    blockFonts: true,
    net: { offline: false, downloadThroughput: (24 * 1024 * 1024) / 8, uploadThroughput: (8 * 1024 * 1024) / 8, latency: 30 },
  },
  {
    name: 'unthrottled',
    blockFonts: false,
    net: { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 },
  },
];

/** Total and gzipped weight of the built assets, by extension. */
function bundleWeight(dir) {
  const byExt = {};
  let total = 0;
  let gzip = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      const bytes = statSync(p).size;
      const ext = extname(e.name) || '(none)';
      const g = /\.(js|css|html|svg|json|map)$/.test(e.name) ? gzipSync(readFileSync(p)).length : bytes;
      byExt[ext] = byExt[ext] ?? { files: 0, bytes: 0, gzip: 0 };
      byExt[ext].files += 1;
      byExt[ext].bytes += bytes;
      byExt[ext].gzip += g;
      total += bytes;
      gzip += g;
    }
  };
  walk(dir);
  return { totalBytes: total, totalGzipBytes: gzip, byExt };
}

async function runProfile(pw, base, profile) {
  const browser = await pw.mod.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();

  if (profile.blockFonts) {
    await context.route((url) => FONT_HOSTS.test(url.href), (route) => route.abort());
  }

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.emulateNetworkConditions', profile.net);

  let requestCount = 0;
  page.on('requestfinished', () => {
    requestCount += 1;
  });

  const t0 = Date.now();
  await page.goto(base, { waitUntil: 'commit', timeout: 120000 });

  // INTERACTIVE HOME is the honest end point, not `load`: the player can act
  // when the home overlay exists and carries its buttons. `#main-menu` is the
  // stable id ui/home.ts has always used.
  await page.waitForSelector('#main-menu button', { timeout: 120000 });
  const interactiveMs = Date.now() - t0;

  const timings = await page.evaluate((hostPattern) => {
    const re = new RegExp(hostPattern);
    const paints = performance.getEntriesByType('paint').map((e) => ({ name: e.name, startTime: e.startTime }));
    const nav = performance.getEntriesByType('navigation')[0] ?? null;
    const fonts = performance
      .getEntriesByType('resource')
      .filter((e) => re.test(e.name))
      .map((e) => ({ url: e.name, startMs: e.startTime, endMs: e.responseEnd, durationMs: e.duration }));
    return {
      paints,
      nav: nav ? { domContentLoadedMs: nav.domContentLoadedEventEnd, loadMs: nav.loadEventEnd } : null,
      fonts,
    };
  }, FONT_HOSTS.source);

  const shot = join(OUT_DIR, `nfr2-home-${profile.name}.png`);
  await page.screenshot({ path: shot, type: 'png' });
  await browser.close();

  const fcp = timings.paints.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null;
  const fp = timings.paints.find((p) => p.name === 'first-paint')?.startTime ?? null;
  const lastFontEnd = timings.fonts.length ? Math.max(...timings.fonts.map((f) => f.endMs)) : null;

  return {
    profile: profile.name,
    fontsBlocked: profile.blockFonts,
    firstPaintMs: round(fp),
    firstContentfulPaintMs: round(fcp),
    interactiveHomeMs: interactiveMs,
    withinBudget: interactiveMs <= BUDGET_MS,
    navigation: timings.nav && {
      domContentLoadedMs: round(timings.nav.domContentLoadedMs),
      loadMs: round(timings.nav.loadMs),
    },
    fontRequests: timings.fonts.map((f) => ({ url: f.url, startMs: round(f.startMs), endMs: round(f.endMs) })),
    lastFontEndMs: round(lastFontEnd),
    // Descriptive only in the unblocked runs; the DECISIVE answer is the
    // fonts-blocked profile landing inside budget.
    firstPaintPrecededFonts: fcp !== null && lastFontEnd !== null ? fcp < lastFontEnd : null,
    requestCount,
    image: `nfr2-home-${profile.name}.png`,
  };
}

async function main() {
  if (!existsSync(DIST)) {
    console.error(`No production build at ${DIST.slice(REPO.length + 1)}.\nRun:  npm run build`);
    return 2;
  }
  const pw = await loadPlaywright();
  if (!pw) {
    console.error('playwright-core not found. Set HC_PLAYWRIGHT=/path/to/playwright-core/index.mjs');
    return 2;
  }
  ensureOutDir();

  const { server, port } = await serveDir(DIST);
  const base = `http://127.0.0.1:${port}/`;
  const runs = [];
  try {
    for (const p of PROFILES) runs.push(await runProfile(pw, base, p));
  } finally {
    server.close();
  }

  const blocked = runs.find((r) => r.fontsBlocked);
  const record = {
    story: '7.1',
    what: 'NFR2 cold-load verdict against the SHIPPED production build',
    device: REFERENCE_DEVICE,
    budgetMs: BUDGET_MS,
    notMeasuredYet:
      'Ad, analytics and consent script cost — none exist yet (Stories 7.2/7.4). They must fit inside the same 10 s budget and be re-measured when they land.',
    fontsDoNotBlockFirstPaint: blocked
      ? {
          demonstratedBy: 'residential-24mbps-fonts-blocked',
          firstContentfulPaintMs: blocked.firstContentfulPaintMs,
          interactiveHomeMs: blocked.interactiveHomeMs,
          pass: blocked.withinBudget && blocked.firstContentfulPaintMs !== null,
        }
      : null,
    bundle: bundleWeight(DIST),
    runs,
  };

  const out = join(OUT_DIR, 'nfr2-cold-load.json');
  writeFileSync(out, JSON.stringify(record, null, 2) + '\n');

  console.log(`\nNFR2 cold load — ${REFERENCE_DEVICE.model}, budget ${BUDGET_MS / 1000}s to interactive home\n`);
  for (const r of runs) {
    console.log(
      `  ${r.profile.padEnd(34)} FCP ${String(r.firstContentfulPaintMs).padStart(8)}ms   ` +
        `interactive ${String(r.interactiveHomeMs).padStart(6)}ms  ${r.withinBudget ? 'ok' : 'FAIL'}   ` +
        `${r.requestCount} requests`,
    );
  }
  const b = record.bundle;
  console.log(`\n  bundle: ${(b.totalBytes / 1024).toFixed(1)} kB on disk, ${(b.totalGzipBytes / 1024).toFixed(1)} kB gzipped`);
  console.log(`\nwrote ${out.slice(REPO.length + 1)}`);
  return 0;
}

process.exit(await main());
