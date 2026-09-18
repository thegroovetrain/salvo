// THE MATCH CONSUMABLE POOL smoke (Story 8.11, FR43/NFR20) — the HIDING half,
// over real sockets.
//
// The pool's COMPOSITION is the one thing about it a client may never learn:
// ten consumable cards are appended to every captain's and bot's deck, and
// nothing on the wire says which ten, how many are left, or that the deck grew
// at all. A unit test can prove the server-side shape; only a real socket can
// prove what a real client actually receives, which is what this smoke is for.
//
// It self-boots its own server on PORT 2613 (never the dev server's 2567) with
// HC_DEV_OPTIONS=1 and uses the SOLO VS AI door — `client.create('arena',
// {solo:true})` — with the dev ROOM options `poolOverride` (a pinned,
// deterministic pool) and a short `matchOverride.countdownMs`.
//
//   1. THE ROOM BOOTS WITH THE OPTION. A rejected dev option would be logged
//      server-side only, so what a client can see is that the room came up and
//      welcomed it at all — asserted, then the composition assertions are left
//      to the unit tests (matchPool.test.ts), where they belong.
//   2. THE WELCOME carries `config.pool` = exactly `{ size: 10 }` — the SIZE is
//      public (players may know a match deals ten), the composition is not —
//      and NO key named pool/deck/deckList/deckLeft/deckSize/remaining exists
//      anywhere else in the message, at any depth.
//   3. NO FRAME carries one of those keys at any depth, over 40 countdown
//      frames — the frame invariant, live rather than property-generated.
//
// Then it kills its OWN server process group and verifies the port is free.
//
// Run: HC_DEV_OPTIONS=1 node server/scripts/poolSmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { CONFIG, MSG, PROTOCOL_VERSION } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Free ports: matchSmoke/zoneSmoke 2599, reconnect/latency 2601, queue 2603,
// solo 2604/2605, liveness 2607, loadTest 2609, opening 2611, metrics 2631.
const PORT = 2613;
/** A DETERMINISTIC pool, so a failure here is never a roll. Three HULL REPAIRs
 *  are three dealable cards on top of the authored deck — and the smoke never
 *  looks for them on the wire, which is the whole point. */
const POOL_OVERRIDE = ['hullRepair', 'hullRepair', 'hullRepair'];
const MATCH_OVERRIDE = { countdownMs: 8000, resultsMs: 2000, joinWindowMs: 0 };
/** Countdown frames scanned for a deck-shaped key. */
const SCAN_FRAMES = 40;
/** Keys no message outside the welcome's CONFIG snapshot may carry — the deck
 *  itself plus the DRAW-PILE COUNTER family Eric deleted on 2026-09-10/11. */
const FORBIDDEN = ['deck', 'deckList', 'deckId', 'deckLeft', 'deckSize', 'pool', 'remaining'];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- server lifecycle (the shared smoke harness) ------------------------------

function bootServer(port) {
  const tsx = path.join(REPO, 'node_modules/.bin/tsx');
  return spawn(tsx, ['src/index.ts'], {
    cwd: path.join(REPO, 'server'),
    detached: true, // own process group, so we can kill tsx + its node child
    env: { ...process.env, NODE_ENV: 'development', PORT: String(port), HC_DEV_OPTIONS: '1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

function portOpenOn(port, host) {
  return new Promise((resolve) => {
    const sock = net.connect(port, host);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
  });
}

/** True if anything listens on the port via IPv4 or IPv6 loopback. */
async function portOpen(port) {
  return (await portOpenOn(port, '127.0.0.1')) || portOpenOn(port, '::1');
}

async function waitForServer(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await portOpen(port)) return;
    await sleep(200);
  }
  throw new Error(`server did not open port ${port} in time`);
}

function killServer(proc, signal = 'SIGTERM') {
  try {
    process.kill(-proc.pid, signal); // whole group — our own PID only
  } catch {
    // already gone
  }
}

/** Kill the server we booted and report whether the port leaked. */
async function shutdown(proc, port) {
  killServer(proc);
  await sleep(600);
  if (!(await portOpen(port))) return false;
  killServer(proc, 'SIGKILL');
  await sleep(600);
  const leaked = await portOpen(port);
  if (leaked) console.error(`ERROR: port ${port} still open after SIGTERM+SIGKILL (leaked listener)`);
  return leaked;
}

// --- the key scan -------------------------------------------------------------

/** The path to the first OWN KEY matching `forbidden` anywhere in `value`, or
 *  null. A KEY scan, never a text scan: a LINE ID riding `offer`/`cards` as a
 *  VALUE must never false-positive. */
function findForbiddenKey(value, forbidden, trail = '$') {
  if (Array.isArray(value)) {
    for (const [i, entry] of value.entries()) {
      const hit = findForbiddenKey(entry, forbidden, `${trail}[${i}]`);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (value === null || typeof value !== 'object') return null;
  for (const [key, nested] of Object.entries(value)) {
    if (forbidden.includes(key)) return `${trail}.${key}`;
    const hit = findForbiddenKey(nested, forbidden, `${trail}.${key}`);
    if (hit !== null) return hit;
  }
  return null;
}

// --- client harness -----------------------------------------------------------

async function createSolo(port, options) {
  const client = new Client(`ws://localhost:${port}`);
  const room = await client.create('arena', { pv: PROTOCOL_VERSION, solo: true, name: 'ERIC', ...options });
  const ctx = { room, welcome: null, frames: [] };
  room.onMessage(MSG.welcome, (m) => (ctx.welcome = m));
  room.onMessage(MSG.frame, (f) => ctx.frames.push(f));
  room.onMessage(MSG.ping, () => undefined); // RTT loop: acknowledged, not echoed
  return ctx;
}

async function waitFor(pred, timeoutMs, label) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(25);
  }
}

// --- the checks ---------------------------------------------------------------

function proveWelcome(welcome) {
  const cfg = welcome.config;
  assert(cfg !== undefined && cfg !== null, 'the welcome carries no config snapshot');
  assert(JSON.stringify(cfg.pool) === JSON.stringify({ size: CONFIG.pool.size }),
    `welcome config.pool is ${JSON.stringify(cfg.pool)}, expected {"size":${CONFIG.pool.size}}`);
  // Everything OUTSIDE the config snapshot: not one deck-shaped key. `config`
  // is spliced out for this scan and only for it — `config.deck` (the two
  // public rule dials) and `config.pool` (the SIZE) are the two legitimate
  // ones on this message, and both are pinned exactly, in decks.test.ts.
  const hit = findForbiddenKey({ ...welcome, config: undefined }, FORBIDDEN);
  assert(hit === null, `the welcome carries a deck-shaped key at ${hit}`);
  return `welcome: config.pool = {size:${CONFIG.pool.size}}, no deck-shaped key outside config`;
}

function proveFrames(frames) {
  for (const [i, f] of frames.entries()) {
    const hit = findForbiddenKey(f, FORBIDDEN);
    assert(hit === null, `frame ${i} carries a deck-shaped key at ${hit}`);
  }
  return `frames: ${frames.length} countdown frames, no deck-shaped key at any depth`;
}

// --- main ---------------------------------------------------------------------

async function main() {
  const log = [];
  assert(!(await portOpen(PORT)), `port ${PORT} is already in use — refusing to boot`);
  const server = bootServer(PORT);
  try {
    await waitForServer(PORT, 15000);
    const ctx = await createSolo(PORT, { poolOverride: POOL_OVERRIDE, matchOverride: MATCH_OVERRIDE });
    // (1) The room came up WITH the dev pool and welcomed us. A refusal is
    // server-side-only (room.devOptionsRejected), so this is the client's
    // whole view of it — the composition lives in the unit tests.
    await waitFor(() => ctx.welcome !== null, 10000, 'welcome');
    log.push(`PASS room booted with poolOverride [${POOL_OVERRIDE.join(', ')}] and welcomed the captain`);
    // (2) The welcome.
    log.push(`PASS ${proveWelcome(ctx.welcome)}`);
    // (3) The frames.
    await waitFor(() => ctx.frames.length >= SCAN_FRAMES, 20000, `${SCAN_FRAMES} frames`);
    log.push(`PASS ${proveFrames(ctx.frames.slice(0, SCAN_FRAMES))}`);
    await ctx.room.leave();
  } finally {
    if (await shutdown(server, PORT)) throw new Error(`leaked port ${PORT}`);
  }
  for (const line of log) console.log(line);
  console.log('POOL SMOKE OK');
  process.exit(0);
}

main().catch((err) => {
  console.error('FAIL', err.message);
  console.error('POOL SMOKE FAILED');
  process.exit(1);
});
