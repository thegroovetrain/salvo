// THE OPENING smoke (Story 8.10, FR48): the level-zero offer and the one free
// countdown redraw, over real sockets.
//
// It self-boots its own server on PORT 2611 (never the dev server's 2567) with
// HC_DEV_OPTIONS=1 and uses the SOLO VS AI door — `client.create('arena',
// {solo:true})` — because that is the simplest room that runs a real countdown
// with ONE client: the solo door forces `expectedCaptains: 1`, so the room is a
// genuine BOARDING room (held start line) and its activation takes the same
// preserve-the-economy path a queue-formed match does.
//
//   PHASE 1 — the honoured wire path, driven by this client.
//     1. On the first COUNTDOWN frame: `pts 1`, `lvl 0`, `xp 0`, a four-card
//        offer, and offer[0] is a USABLE line (a consumable, or an equipment
//        line the hull holds no copy of) — the level-zero guarantee.
//     2. Send `{choice: -2}` (MULLIGAN_CHOICE): the offer changes, a `pt`
//        event arrives, and the bank still reads 1 (a redraw spends nothing).
//     3. Send it AGAIN: nothing moves. The offer stays byte-identical for at
//        least five consecutive frames.
//     4. The water goes live: the held offer SURVIVES activation (`pts` still
//        1, the same four ids), the weapon row is still empty (no spawn seed),
//        and the sentinel is now refused.
//     5. Take card 0: `pts` drops to 0 and the line is in `cards`.
//
//   PHASE 2 — the dev arm (`matchOverride.mulligan`), in a second room on the
//     same server. The room performs the redraw itself on the first tick after
//     the countdown arms, so the captain's own sentinel is the no-op: the
//     offer stays byte-identical across five frames without a single change.
//
// Then it kills its OWN server process group and verifies the port is free.
//
// Run: HC_DEV_OPTIONS=1 node server/scripts/openingSmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { CATALOG, CONFIG, MSG, MULLIGAN_CHOICE, PROTOCOL_VERSION } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Free ports: matchSmoke/zoneSmoke 2599, reconnect/latency 2601, queue 2603,
// solo 2604/2605, liveness 2607, loadTest 2609, metrics 2631.
const PORT = 2611;
// A countdown long enough to send two sentinels and watch a handful of frames,
// short enough that the whole smoke runs in seconds. joinWindowMs 0 takes the
// legacy path straight to the countdown (no gathering window to wait out).
const MATCH_OVERRIDE = { countdownMs: 6000, resultsMs: 2000, joinWindowMs: 0 };
const ARMED_OVERRIDE = { ...MATCH_OVERRIDE, countdownMs: 5000, mulligan: true };
/** Frames the offer must stay byte-identical across after a refused redraw. */
const STEADY_FRAMES = 5;

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

// --- client harness ----------------------------------------------------------

/** The solo door: create() always mints a FRESH room. `frames` keeps the whole
 *  per-frame history of the own-ship view, which is what the byte-identity
 *  assertions below read. */
async function createSolo(port, options) {
  const client = new Client(`ws://localhost:${port}`);
  const room = await client.create('arena', { pv: PROTOCOL_VERSION, solo: true, name: 'ERIC', ...options });
  const ctx = { room, welcome: null, you: null, frames: [], pts: 0 };
  room.onMessage(MSG.welcome, (m) => (ctx.welcome = m));
  room.onMessage(MSG.frame, (f) => {
    if (!f.you) return;
    ctx.you = f.you;
    ctx.frames.push({ phase: room.state?.matchPhase ?? 'unknown', you: f.you });
    for (const e of f.events ?? []) if (e.k === 'pt') ctx.pts += 1;
  });
  room.onMessage(MSG.ping, () => undefined); // RTT loop: acknowledged, not echoed
  return ctx;
}

const phase = (ctx) => ctx.room.state?.matchPhase ?? 'unknown';
const sig = (you) => (you.offer ?? []).join(',');

async function waitFor(pred, timeoutMs, label) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(25);
  }
}

/** Wait until `n` more frames have arrived, and return the slice. */
async function nextFrames(ctx, n, timeoutMs, label) {
  const from = ctx.frames.length;
  await waitFor(() => ctx.frames.length >= from + n, timeoutMs, label);
  return ctx.frames.slice(from, from + n);
}

// --- assertions ---------------------------------------------------------------

/** A line the hull can actually USE: a consumable, or an equipment line it
 *  holds no copy of. The shared catalog is the same table the server drew from. */
function isUsable(lineId, cards) {
  const line = CATALOG[lineId];
  assert(line !== undefined, `offer carried an id the catalog does not know: ${lineId}`);
  return line.kind === 'consumable' || (line.kind === 'equipment' && !cards.includes(lineId));
}

function proveOpening(you) {
  assert(you.pts === 1, `first countdown frame reads pts ${you.pts}, expected 1`);
  assert(you.lvl === 0, `first countdown frame reads lvl ${you.lvl}, expected 0 (the grant banks, it does not level)`);
  assert((you.xp ?? 0) === 0, `first countdown frame reads xp ${you.xp}, expected 0`);
  assert(Array.isArray(you.offer) && you.offer.length === CONFIG.offer.size,
    `offer is ${JSON.stringify(you.offer)}, expected ${CONFIG.offer.size} cards`);
  assert(new Set(you.offer).size === you.offer.length, `offer repeats a line: ${you.offer.join(',')}`);
  assert(you.cards.length === 0, `hull spawned holding ${JSON.stringify(you.cards)} — the spawn seed is deleted`);
  assert(isUsable(you.offer[0], you.cards),
    `offer[0] (${you.offer[0]}) is not a usable line — the level-zero guarantee did not hold`);
  return `opening: LV 0, bank 1, offer [${you.offer.join(', ')}], guaranteed card ${you.offer[0]}`;
}

/** Assert the offer signature does not move across `n` consecutive frames. */
function proveSteady(frames, expected, what) {
  for (const [i, f] of frames.entries()) {
    assert(sig(f.you) === expected, `${what}: frame ${i} offer moved to [${sig(f.you)}], expected [${expected}]`);
  }
  return `${what}: byte-identical across ${frames.length} frames`;
}

// --- PHASE 1: the honoured wire path -----------------------------------------

async function runPhase1(log) {
  const ctx = await createSolo(PORT, { matchOverride: MATCH_OVERRIDE });
  await waitFor(() => ctx.welcome !== null, 10000, 'welcome');
  await waitFor(() => phase(ctx) === 'countdown' && ctx.you !== null, 15000, 'countdown with an own-ship frame');
  const first = ctx.frames.filter((f) => f.phase === 'countdown')[0] ?? { you: ctx.you };
  log.push(proveOpening(first.you));
  const handA = sig(first.you);

  // (2) ONE redraw, through the spend channel the client uses.
  const ptsBefore = ctx.pts;
  ctx.room.send(MSG.spend, { choice: MULLIGAN_CHOICE });
  await waitFor(() => ctx.you !== null && sig(ctx.you) !== handA, 5000, 'the offer to change after the redraw');
  const handB = sig(ctx.you);
  assert(ctx.you.pts === 1, `the redraw spent a level (pts ${ctx.you.pts})`);
  assert(ctx.you.offer.length === CONFIG.offer.size, `redrawn offer is ${ctx.you.offer.length} cards`);
  assert(isUsable(ctx.you.offer[0], ctx.you.cards),
    `the REDRAWN offer[0] (${ctx.you.offer[0]}) is not usable — the guarantee did not ride the redraw`);
  await waitFor(() => ctx.pts > ptsBefore, 3000, 'a `pt` event for the redraw');
  log.push(`redraw honoured: [${handA}] -> [${handB}], pt delivered, bank still 1`);

  // (3) The SECOND press is a no-op: same hand, frame after frame.
  ctx.room.send(MSG.spend, { choice: MULLIGAN_CHOICE });
  log.push(proveSteady(await nextFrames(ctx, STEADY_FRAMES, 5000, 'frames after the second redraw'),
    handB, 'second redraw refused'));

  // (4) The water goes live: the held economy crosses the line intact.
  await waitFor(() => phase(ctx) === 'active', MATCH_OVERRIDE.countdownMs + 15000, 'activation');
  const live = await nextFrames(ctx, 3, 5000, 'frames after activation');
  const you = live[live.length - 1].you;
  assert(you.pts === 1, `the held level did not survive activation (pts ${you.pts})`);
  assert(sig(you) === handB, `the held offer changed at activation: [${sig(you)}] vs [${handB}]`);
  assert(you.cards.length === 0, `cards is ${JSON.stringify(you.cards)} at 0:00 — nothing was taken`);
  assert(you.ammo[2] === null, 'the weapon row is not empty at 0:00 — something fitted itself');
  log.push(`activation: bank 1, the same hand [${handB}], an empty weapon row`);

  // ...and the redraw is GONE on live water.
  ctx.room.send(MSG.spend, { choice: MULLIGAN_CHOICE });
  log.push(proveSteady(await nextFrames(ctx, STEADY_FRAMES, 5000, 'frames after the live-phase redraw'),
    handB, 'live-phase redraw refused'));

  // (5) Take card 0 — the ordinary spend, through the same channel.
  const picked = you.offer[0];
  ctx.room.send(MSG.spend, { choice: 0 });
  await waitFor(() => ctx.you.pts === 0, 5000, 'the bank to empty after the pick');
  await waitFor(() => ctx.you.cards.includes(picked), 5000, `the picked line ${picked} to appear in cards`);
  assert(ctx.you.offer.length === 0, `a spent bank still carries an offer: ${JSON.stringify(ctx.you.offer)}`);
  log.push(`pick: ${picked} fitted, bank 0, offer cleared`);

  await ctx.room.leave();
}

// --- PHASE 2: the dev arm -----------------------------------------------------

async function runPhase2(log) {
  const ctx = await createSolo(PORT, { matchOverride: ARMED_OVERRIDE });
  await waitFor(() => ctx.welcome !== null, 10000, 'welcome (armed room)');
  await waitFor(() => phase(ctx) === 'countdown' && ctx.you !== null, 15000, 'countdown (armed room)');
  const you = ctx.frames.filter((f) => f.phase === 'countdown')[0]?.you ?? ctx.you;
  // The room redrew for us on the first tick after the arm, so the opening
  // invariants must hold of the REDRAWN hand exactly as they did of the first.
  log.push(proveOpening(you).replace('opening:', 'armed room, auto-redrawn:'));
  // The captain's own sentinel is now the no-op — the one redraw is spent.
  const hand = sig(ctx.you);
  ctx.room.send(MSG.spend, { choice: MULLIGAN_CHOICE });
  log.push(proveSteady(await nextFrames(ctx, STEADY_FRAMES, 5000, 'frames after the armed room\'s refused redraw'),
    hand, 'auto-armed redraw already spent'));
  await ctx.room.leave();
}

// --- main ---------------------------------------------------------------------

async function main() {
  const log = [];
  assert(!(await portOpen(PORT)), `port ${PORT} is already in use — refusing to boot`);
  const server = bootServer(PORT);
  try {
    await waitForServer(PORT, 15000);
    await runPhase1(log);
    await runPhase2(log);
  } finally {
    if (await shutdown(server, PORT)) throw new Error(`leaked port ${PORT}`);
  }
  console.log('OPENING SMOKE OK:', { trace: log });
  process.exit(0);
}

main().catch((err) => {
  console.error('OPENING SMOKE FAILED:', err.message);
  process.exit(1);
});
