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
// AD / ANALYTICS / CONSENT COST IS NOW INCLUDED (Story 7.4). It was not when
// this script was written — the header used to say so — but Story 7.2 shipped
// the analytics layer and Story 7.4 puts the AdSense loader in the head, so the
// bytes are in `client/dist` and this run counts them. The AdSense tag is
// BUILD-GATED on `VITE_ADSENSE_CLIENT`, so a run measures whichever build it was
// given; each run records `thirdPartyOrigins` so the record can never be read as
// covering a script it never fetched.
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
  // EVERY EXIT PATH CLOSES THE BROWSER. Without this, any throw between launch
  // and close leaks a headless Chromium for the life of the shell and abandons
  // the remaining profiles with no record written.
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();

    if (profile.blockFonts) {
      await context.route((url) => FONT_HOSTS.test(url.href), (route) => route.abort());
    }

    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.clearBrowserCache');
    await cdp.send('Network.emulateNetworkConditions', profile.net);

    // THIRD-PARTY ORIGINS ARE RECORDED, NOT INFERRED (Story 7.4).
    //
    // Story 7.2's decisive NFR2 evidence was an ABSENCE — the cold-load record
    // contacted the font CDN and nothing else, which is what Consent Mode BASIC
    // looked like from the outside. Story 7.4 retires Basic and puts the AdSense
    // loader in the head, so that absence is GONE BY RULING and the record must
    // now say which third parties a cold load actually reaches. Without this the
    // file could not distinguish "the ad script loaded and cost 3 kB" from "the
    // ad script never loaded and this number is meaningless" — the same
    // self-description failure the run-configuration fields were added for.
    let requestCount = 0;
    const thirdPartyOrigins = new Set();
    page.on('requestfinished', (req) => {
      requestCount += 1;
      try {
        // Compare ORIGIN to ORIGIN. `base` carries a trailing slash, so a
        // `startsWith` against it classifies the local static server itself as
        // third-party — which would bury the real finding in noise.
        const { origin } = new URL(req.url());
        if (origin !== new URL(base).origin) thirdPartyOrigins.add(origin);
      } catch {
        /* a non-URL request target tells us nothing; the count still stands */
      }
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

    const fcp = timings.paints.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null;
    const fp = timings.paints.find((p) => p.name === 'first-paint')?.startTime ?? null;
    const lastFontEnd = timings.fonts.length ? Math.max(...timings.fonts.map((f) => f.endMs)) : null;

    return {
      profile: profile.name,
      fontsBlocked: profile.blockFonts,
      firstPaintMs: round(fp),
      firstContentfulPaintMs: round(fcp),
      interactiveHomeMs: interactiveMs,
      // A run that never recorded a contentful paint has not demonstrated a
      // load, however fast the selector appeared.
      withinBudget: interactiveMs <= BUDGET_MS && fcp !== null,
      navigation: timings.nav && {
        domContentLoadedMs: round(timings.nav.domContentLoadedMs),
        loadMs: round(timings.nav.loadMs),
      },
      fontRequests: timings.fonts.map((f) => ({ url: f.url, startMs: round(f.startMs), endMs: round(f.endMs) })),
      lastFontEndMs: round(lastFontEnd),
      // NAMED FOR WHAT IT ACTUALLY COMPARES. The first draft called this
      // `firstPaintPrecededFonts` while computing it from FCP, and it read
      // `false` in every run INCLUDING the one that aborts every font request —
      // a field that is wrong in 100% of observed cases, shipped inside a record
      // whose thesis is "demonstrated, not argued". The DECISIVE answer is the
      // fonts-blocked profile landing inside budget; this is context only.
      fcpPrecededLastFontResponse: fcp !== null && lastFontEnd !== null ? fcp < lastFontEnd : null,
      requestCount,
      thirdPartyOrigins: [...thirdPartyOrigins].sort(),
      image: `nfr2-home-${profile.name}.png`,
    };
  } finally {
    await browser.close();
  }
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
    // The instrument is Story 7.1's; the CONTENT of a run is whatever build it
    // was handed. Naming only 7.1 made a 7.4 run read as a 7.1 verdict.
    story: '7.1 (instrument) — re-run by any story that adds page weight',
    what: 'NFR2 cold-load verdict against the SHIPPED production build',
    device: REFERENCE_DEVICE,
    budgetMs: BUDGET_MS,
    // WAS `notMeasuredYet` UNTIL STORY 7.4. That field said ad/analytics/consent
    // cost did not exist yet; both stories have since landed, so leaving it would
    // have made the record state something false about itself. What a run now
    // reaches is recorded per profile in `thirdPartyOrigins` rather than asserted
    // here, because the ad tag is BUILD-GATED on `VITE_ADSENSE_CLIENT` — an
    // unconfigured build legitimately contacts no ad origin at all, and the
    // record has to be able to tell the two builds apart.
    scriptCostMeasured:
      'Third-party script cost is included only to the extent the MEASURED BUILD carried it. Both the AdSense loader '
      + '(`VITE_ADSENSE_CLIENT`, Story 7.4) and the GA4 tag (`VITE_GA_MEASUREMENT_ID`, Story 7.2) are BUILD-GATED, so a '
      + 'run with neither set measures neither. Do not read this field as a claim — read each run\'s `thirdPartyOrigins`, '
      + 'which is the only evidence of what was actually fetched.',
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
