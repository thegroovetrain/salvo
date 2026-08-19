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
import { existsSync, readFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '..', '..');
export const OUT_DIR = join(REPO, '_bmad-output', 'implementation-artifacts', 'perf-gate');

/**
 * The machine this run is actually on, READ OFF IT rather than typed in.
 *
 * The first draft was a hardcoded literal under a docstring claiming it was
 * measured — so the first person other than Eric to run the capture would have
 * produced a record stamped `MacBookPro16,1 / i7-9750H / 32 GB` regardless of
 * their hardware, which is precisely the failure the docstring said it existed
 * to prevent. Story 7.1's AC asks for a bar reproducible by someone else, and a
 * stamp that cannot be wrong is the only kind worth having.
 *
 * `model` needs a syscall on macOS; it is best-effort and degrades to null
 * rather than guessing.
 */
function readMachine() {
  let model = null;
  try {
    model = execFileSync('sysctl', ['-n', 'hw.model'], { encoding: 'utf8' }).trim() || null;
  } catch {
    // Non-macOS, or sysctl unavailable — the rest of the stamp still stands.
  }
  const cpus = os.cpus();
  return {
    model,
    cpu: cpus.length ? `${cpus[0].model} (${cpus.length} logical cores)` : null,
    memoryGB: Math.round(os.totalmem() / 1024 ** 3),
    platform: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
  };
}

export const REFERENCE_DEVICE = readMachine();

/**
 * The machine NFR1's bar was ratified against (epic-7 amendment 1). A run on
 * anything else is still a measurement, but it is not THE bar — so the record
 * says which it is instead of leaving the reader to compare model strings.
 */
export const RATIFIED_REFERENCE_MODEL = 'MacBookPro16,1';

export function isRatifiedReference(machine = REFERENCE_DEVICE) {
  return machine.model === RATIFIED_REFERENCE_MODEL;
}

/** The ratified frame budget. Not measured here — compared against. */
export const BUDGET = { frameMs: 16.6, simMs: 3, renderMs: 10, headroomMs: 3.6 };

/**
 * WHEN A MEASURED CADENCE COUNTS AS SUSTAINING 60 FPS.
 *
 * Not a p95 threshold. The first draft used a bare `p95 <= 18.0` and failed runs
 * that dropped ZERO frames, because ordinary vsync jitter puts p95 at 18.3-18.6
 * ms on a perfectly healthy 60 Hz present — so the instrument reported "60 FPS
 * DOES NOT SUSTAIN" for a display that never missed once.
 *
 * The honest criterion reuses the definition the harness already has:
 * `LONG_PRESENT_MS` (25 ms, one and a half 60 Hz periods) IS a dropped frame.
 * So 60 FPS sustains when the median sits at the refresh period and dropped
 * frames are negligible — jitter around the period is not a miss.
 */
export const CADENCE = {
  /** Median present interval must be at the 60 Hz period, allowing jitter. */
  medianMaxMs: 18,
  /** Share of presents allowed to be outright dropped frames. */
  droppedMaxRatio: 0.005,
};

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
  if (!statSync(dir).isDirectory()) throw new Error(`Not a directory: ${dir}`);
  const root = resolve(dir);
  const server = createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      // Malformed percent-encoding throws URIError. Uncaught it killed the
      // whole capture process from inside the request handler.
      return void res.writeHead(400).end('bad request');
    }
    const file = resolve(root, '.' + pathname);
    // Containment must compare RESOLVED paths and require a separator, or a
    // sibling directory sharing the prefix (dist / dist-perf) is reachable —
    // which would let an NFR2 cold-load run serve the instrumented bundle.
    if (file !== root && !file.startsWith(root + sep)) {
      return void res.writeHead(403).end('forbidden');
    }
    const isFile = existsSync(file) && statSync(file).isFile();
    // A MISSING ASSET IS A 404, NOT THE APP SHELL. Falling back to index.html
    // for everything meant a hashed chunk absent from the build was served 200
    // text/html — the page then failed in a way that reads as a slow load, and
    // a broken build would be recorded as a load-time measurement.
    if (!isFile && extname(pathname) !== '') {
      return void res.writeHead(404).end('not found');
    }
    const target = isFile ? file : join(root, 'index.html');
    try {
      const body = readFileSync(target);
      res.writeHead(200, {
        'content-type': MIME[extname(target)] ?? 'application/octet-stream',
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

/**
 * A positive integer from the environment, or the default. A `NaN` viewport or
 * device-scale factor reaches Playwright silently and the run then measures a
 * surface nobody can name — so a malformed knob falls back loudly instead.
 */
export function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.warn(`${name}="${raw}" is not a positive number — using ${fallback}`);
    return fallback;
  }
  return n;
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
