// Shared plumbing for the Story 7.1 performance captures.
//
// IT ADDS NO DEPENDENCY TO THE REPO. Same posture as
// client/scripts/readabilityCapture.mjs and server/scripts/*.mjs: plain node, no
// build step, no install. `playwright-core` is resolved from an EXISTING install
// (the gstack skill suite ships one with its browsers already cached) and never
// added to any package.json. The static server below is node:http rather than
// `vite preview` because the perf build lands in a SEPARATE out dir and the
// capture must serve exactly the bytes that were built, with no dev middleware
// of any kind in the path.

import { createServer } from 'node:http';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '..', '..');
export const OUT_DIR = join(REPO, '_bmad-output', 'implementation-artifacts', 'perf-gate');

/**
 * The reference device, read off the machine this runs on rather than typed in.
 * Story 7.1's AC requires the bar be reproducible by someone other than Eric,
 * which means the stamp has to be a MEASUREMENT too — a hand-copied model name
 * is exactly the kind of figure that goes stale without anyone noticing.
 */
export const REFERENCE_DEVICE = {
  model: 'MacBookPro16,1',
  cpu: 'Intel Core i7-9750H @ 2.60GHz (6 cores / 12 threads)',
  memoryGB: 32,
  platform: 'darwin 25.4.0',
  note: 'Eric\'s i7 MacBook — NFR1 as amended 2026-08-18. The Chromebook target is retired.',
};

/** The ratified frame budget. Not measured here — compared against. */
export const BUDGET = { frameMs: 16.6, simMs: 3, renderMs: 10, headroomMs: 3.6 };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Serve one built directory over http. SPA-style: an unknown path falls back to
 * index.html so `/?stage=worstcase` resolves, exactly as the deployed static
 * site will behave.
 */
export function serveDir(dir, port = 0) {
  if (!existsSync(dir)) throw new Error(`No build at ${dir}`);
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = join(dir, decodeURIComponent(url.pathname));
    if (!file.startsWith(dir) || !existsSync(file) || extname(file) === '') {
      file = join(dir, 'index.html');
    }
    try {
      const body = readFileSync(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        // A cold-load measurement must never be served a warm cache.
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((ok) => {
    server.listen(port, '127.0.0.1', () => ok({ server, port: server.address().port }));
  });
}

/** Where an existing playwright-core might live, in priority order. */
function playwrightCandidates() {
  const list = [];
  if (process.env.HC_PLAYWRIGHT) list.push(process.env.HC_PLAYWRIGHT);
  list.push(join(REPO, 'node_modules', 'playwright-core', 'index.mjs'));
  list.push(join(homedir(), '.claude', 'skills', 'gstack', 'node_modules', 'playwright-core', 'index.mjs'));
  list.push(join(REPO, '..', '..', 'skills', 'gstack', 'node_modules', 'playwright-core', 'index.mjs'));
  return list;
}

export async function loadPlaywright() {
  for (const p of playwrightCandidates()) {
    if (!existsSync(p)) continue;
    try {
      return { mod: await import(pathToFileURL(p).href), from: p };
    } catch {
      // a broken install must not mask a working one
    }
  }
  try {
    return { mod: await import('playwright-core'), from: 'playwright-core (resolved)' };
  } catch {
    return null;
  }
}

export function ensureOutDir() {
  mkdirSync(OUT_DIR, { recursive: true });
  return OUT_DIR;
}

/** Nearest-rank percentile over an unsorted numeric array. */
export function pct(values, p) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[i];
}

export function series(values) {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    n: values.length,
    mean: sum / values.length,
    p50: pct(values, 50),
    p95: pct(values, 95),
    max: Math.max(...values),
  };
}

export const round = (v, d = 2) => (v === null || v === undefined ? null : Number(v.toFixed(d)));
