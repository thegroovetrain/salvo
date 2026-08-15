// Queue-lobby smoke (Story 6.1): self-boots the colyseus server on PORT 2603
// (never the dev server's 2567) and proves the WHOLE production matchmaking
// handshake over real sockets — the path every real player now takes, which no
// unit test can reach because it spans two rooms, the matchMaker, and a seat
// reservation:
//
//   0. PV GATE — joinOrCreate('queue', {}) with no `pv` is REJECTED at
//      matchmake time with the human-readable "refresh" message. This is
//      amendment 5's load-bearing claim: matchMaker.reserveMultipleSeatsFor
//      never calls callOnAuth, so the ARENA's gate no longer runs for any
//      queued player and the queue's own door is the only one left.
//   1. A LONE CAPTAIN WAITS (amendment 4) — one client queues and receives
//      MSG.queueStatus {n:1, min:2, cap:20, startsInMs:null}. `startsInMs` is
//      null because the pool has not armed: the queue reports the honest state
//      instead of running a countdown that cannot fire. We then sit for several
//      seconds and assert NO seat ever arrives — no match forms for one captain.
//   2. THE POOL ARMS AT THE SECOND CAPTAIN (amendment 3) — a second client
//      queues and BOTH clients now see startsInMs non-null, bounded by
//      CONFIG.match.queueTimerMs. Still no seat: the 2:00 deadline is a real
//      wait and the cap has not been reached.
//   3. THE CAP PATH (amendment 2 — "if the lobby fills up to max players, it
//      should jump right to the 10 second countdown") — clients 3..19 queue
//      (everyone sees n:19, still armed, still no seat), then the 20th trips
//      CONFIG.map.playerCap and the queue forms IMMEDIATELY, ignoring the
//      remaining timer. All 20 receive MSG.seat.
//   4. ONE ARENA — every captain consumes its reservation and lands in the SAME
//      arena roomId (the whole point of routing through one pool), receives
//      MSG.welcome, and leaves the queue room. The LAST captain is deliberately
//      held back here to set up step 5.
//   5. THE COUNTDOWN WAITS FOR THE LAST LOADER (amendment 8) — with 19 of 20
//      aboard the arena SITS in `waiting` with the storm un-anchored; the 20th
//      consuming its seat is what arms the 0:10 countdown, after which the match
//      goes `active`. A real hold, not a stopwatch: the wait is a small fraction
//      of match.ts's 20 s boarding backstop, so the backstop cannot be what we
//      observed.
//
// WHY THE CAP PATH AND NOT THE TIMER: CONFIG.match.queueTimerMs (120000) is NOT
// overridable per-room. StandardQueueRoom builds its policy from
// defaultQueueConfig() with no options seam at all (StandardQueueRoom.ts:125),
// and the queue deliberately accepts no dev room options — sanitizeArenaOptions
// forwards only {name, cls, horn, colorPref}. Shortening the wait would mean
// editing server/src, which this smoke is not allowed to do, so it drives the
// OTHER form trigger instead: 20 real sockets reaching CONFIG.map.playerCap.
// That is a stronger proof anyway — it is the only trigger a smoke can exercise
// end to end without waiting out a two-minute deadline.
//
// Run: node server/scripts/queueSmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { CONFIG, MSG, PROTOCOL_VERSION } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 2603; // free: matchSmoke/zoneSmoke 2599, reconnect/latency 2601, metrics 2631
const endpoint = `ws://localhost:${PORT}`;

const MIN = CONFIG.match.minHumans; // 2
const CAP = CONFIG.map.playerCap; // 20 — the immediate-form trigger
/** How long a lone captain must sit with no seat before we call it proven. */
const LONE_WAIT_MS = 4000;
/** How long an armed-but-not-full pool must sit with no seat. */
const ARMED_WAIT_MS = 2500;
/** Mirrors server/src/game/match.ts BOARDING_GRACE_MS — the backstop that arms
 *  the countdown even if a captain never loads. Not importable from a .mjs
 *  smoke without pulling in the server's TS build, so it is restated here and
 *  used only to prove we stayed well clear of it. */
const BOARDING_GRACE_MS = 20000;
/** How long the arena must SIT at CAP-1 captains without arming. A small
 *  fraction of BOARDING_GRACE_MS, so the hold we observe cannot be the
 *  backstop's silence. */
const HOLD_MS = 3000;
/** Ceiling for "the countdown armed because the LAST LOADER arrived", measured
 *  from the moment the roster reached CAP-1. Comfortably under the backstop. */
const BOARDED_BY_MS = 10000;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- server lifecycle --------------------------------------------------------

function bootServer() {
  const tsx = path.join(REPO, 'node_modules/.bin/tsx');
  return spawn(tsx, ['src/index.ts'], {
    cwd: path.join(REPO, 'server'),
    detached: true, // own process group, so we can kill tsx + its node child
    // HC_DEV_OPTIONS=1 is NOT needed by the queue itself (it accepts no dev
    // options) but the arena's direct door is dev-gated since Story 6.1, and
    // every other smoke boots this way — kept identical so this script's server
    // is the same server the rest of the suite exercises.
    env: { ...process.env, NODE_ENV: 'development', PORT: String(PORT), HC_DEV_OPTIONS: '1' },
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

/** True if anything listens on the port via IPv4 or IPv6 loopback (the SDK
 *  dials ws://localhost, which may resolve to either family). */
async function portOpen(port) {
  return (await portOpenOn(port, '127.0.0.1')) || portOpenOn(port, '::1');
}

async function waitForServer(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await portOpen(PORT)) return;
    await sleep(200);
  }
  throw new Error('server did not open the port in time');
}

function killServer(proc, signal) {
  try {
    process.kill(-proc.pid, signal); // whole group — our own PID only
  } catch {
    // already gone
  }
}

// --- client harness ----------------------------------------------------------

/**
 * Queue one captain. Handlers are registered on the microtask immediately after
 * joinOrCreate resolves, which is what keeps the seat from being dropped: the
 * SDK WARNS AND DISCARDS a message whose type has no handler
 * (@colyseus/sdk Room.dispatchMessage). For the LAST joiner — whose own join is
 * what trips the cap — the server still has to await matchMaker.createRoom
 * (a full map generation) before any seat is sent, so registration wins by a
 * wide margin.
 */
async function queueUp(name) {
  const client = new Client(endpoint);
  const queue = await client.joinOrCreate('queue', {
    name,
    pv: PROTOCOL_VERSION,
    cls: 'torpedoBoat',
    horn: 'standard',
  });
  const ctx = {
    name, client, queue, arena: null,
    statuses: [], seat: null, welcome: null, queueLeft: null,
  };
  queue.onMessage(MSG.queueStatus, (m) => ctx.statuses.push(m));
  queue.onMessage(MSG.seat, (s) => { ctx.seat = s; });
  queue.onLeave((code) => { ctx.queueLeft = code; });
  return ctx;
}

/** The most recent QueueStatusMsg this captain saw, or null. */
const last = (ctx) => (ctx.statuses.length > 0 ? ctx.statuses[ctx.statuses.length - 1] : null);

/** Consume the reservation into the arena, then drop the queue socket (the
 *  reservation is held by the matchMaker, not by the queue room — exactly what
 *  client/src/net/connection.ts does). */
async function board(ctx) {
  ctx.arena = await ctx.client.consumeSeatReservation(ctx.seat);
  ctx.arena.onMessage(MSG.welcome, (w) => { ctx.welcome = w; });
  // Bound but ignored: without a handler the SDK logs an unhandled-type warning
  // for every frame/results message (Room.dispatchMessage).
  ctx.arena.onMessage(MSG.frame, () => undefined);
  ctx.arena.onMessage(MSG.results, () => undefined);
  ctx.arena.onMessage(MSG.ping, (m) => ctx.arena.send(MSG.ping, { n: m.n }));
  await leaveQuietly(ctx.queue);
}

async function waitFor(pred, timeoutMs, label) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(50);
  }
}

/**
 * Every step is wrapped in a hard deadline. Nothing in this smoke may block
 * forever: joinOrCreate, consumeSeatReservation and Room.leave are all unbounded
 * SDK promises (leave() in particular never settles against an already-closed
 * socket), and an unbounded smoke is a smoke that hangs CI instead of failing
 * it. Progress rides stderr so a hang is diagnosable from the tail alone.
 */
async function step(label, ms, fn) {
  process.stderr.write(`[queueSmoke] ${label}...\n`);
  let timer;
  const line = await Promise.race([
    fn(),
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`step timed out after ${ms}ms: ${label}`)), ms); }),
  ]).finally(() => clearTimeout(timer));
  process.stderr.write(`[queueSmoke]   ok: ${line}\n`);
  return line;
}

/** Room.leave() that can never hang the teardown. */
async function leaveQuietly(room) {
  if (!room) return;
  let timer;
  await Promise.race([
    room.leave().catch(() => undefined),
    new Promise((res) => { timer = setTimeout(res, 1500); }),
  ]).finally(() => clearTimeout(timer));
}

const phase = (ctx) => ctx.arena?.state?.matchPhase ?? 'unknown';
const seated = (all) => all.filter((c) => c.seat !== null).length;

// --- proof steps -------------------------------------------------------------

/** Step 0: a missing `pv` must be rejected at the QUEUE's door (amendment 5). */
async function provePvGate() {
  const client = new Client(endpoint);
  let rejected = null;
  try {
    await client.joinOrCreate('queue', { name: 'STALE' }); // no pv on purpose
  } catch (e) {
    rejected = e;
  }
  assert(rejected, "joinOrCreate('queue') without pv was NOT rejected");
  assert(
    /refresh/.test(rejected.message ?? ''),
    `queue pv rejection lacks the refresh message (got: ${rejected.message})`,
  );
  return `pv gate: queue rejected a pv-less join with "${rejected.message}"`;
}

/** Step 1: a lone captain waits, unarmed, and no match forms (amendment 4). */
async function proveLoneCaptainWaits(a) {
  await waitFor(() => last(a) !== null, 5000, 'first queueStatus');
  const s = last(a);
  assert(s.n === 1, `lone captain sees n=${s.n}, expected 1`);
  assert(s.min === MIN, `queueStatus min=${s.min}, expected ${MIN}`);
  assert(s.cap === CAP, `queueStatus cap=${s.cap}, expected ${CAP}`);
  assert(s.startsInMs === null, `lone captain got a countdown (startsInMs=${s.startsInMs}) — the pool must not arm below min`);
  // Sit. The 1 Hz tick runs the policy the whole time; nothing may form.
  await sleep(LONE_WAIT_MS);
  assert(a.seat === null, 'a LONE captain was seated — no match may form below minHumans');
  assert(
    a.statuses.every((m) => m.startsInMs === null),
    `an unarmed pool published a countdown: ${JSON.stringify(a.statuses)}`,
  );
  return `lone captain: n=1 min=${MIN} cap=${CAP} startsInMs=null, still unseated after ${LONE_WAIT_MS}ms`;
}

/** Step 2: the second captain ARMS the pool for everyone (amendment 3). */
async function proveArmAtSecond(a, b) {
  await waitFor(
    () => [a, b].every((c) => last(c) !== null && last(c).n === 2 && last(c).startsInMs !== null),
    5000,
    'both captains see an armed pool',
  );
  for (const c of [a, b]) {
    const s = last(c);
    assert(s.startsInMs > 0, `${c.name} armed with startsInMs=${s.startsInMs}, expected > 0`);
    assert(
      s.startsInMs <= CONFIG.match.queueTimerMs,
      `${c.name} startsInMs=${s.startsInMs} exceeds queueTimerMs=${CONFIG.match.queueTimerMs}`,
    );
  }
  // The 2:00 deadline is a REAL wait: nothing forms just because min was met.
  await sleep(ARMED_WAIT_MS);
  assert(a.seat === null && b.seat === null, 'an armed-but-not-full pool formed a match before its deadline');
  return `armed at the 2nd captain: both see n=2, startsInMs~${Math.round(last(a).startsInMs / 1000)}s; no seat after ${ARMED_WAIT_MS}ms`;
}

/** Step 3: fill to CAP; the last joiner trips the immediate form (amendment 2). */
async function proveCapForms(pool) {
  // 3..CAP-1 first: still armed, still waiting.
  for (let i = pool.length; i < CAP - 1; i++) pool.push(await queueUp(`CAPTAIN-${i + 1}`));
  await waitFor(
    () => pool.every((c) => last(c) !== null && last(c).n === CAP - 1),
    10000,
    `all ${CAP - 1} captains see the full pool count`,
  );
  assert(seated(pool) === 0, `a match formed at ${CAP - 1} captains — below cap and before the deadline`);
  const roomIds = new Set(pool.map((c) => c.queue.roomId));
  assert(roomIds.size === 1, `captains scattered across ${roomIds.size} queue rooms: ${[...roomIds].join(',')}`);
  // The CAP-th captain: form now, ignore the remaining timer.
  const formedAt = Date.now();
  pool.push(await queueUp(`CAPTAIN-${CAP}`));
  await waitFor(() => seated(pool) === CAP, 15000, `all ${CAP} captains seated`);
  const took = Date.now() - formedAt;
  assert(
    took < CONFIG.match.queueTimerMs,
    `the cap form waited ${took}ms — it must ignore the remaining queueTimerMs`,
  );
  return `cap form: ${CAP - 1} pooled captains stayed unseated; the ${CAP}th trip the cap and all ${CAP} seats landed in ${took}ms (queueTimerMs=${CONFIG.match.queueTimerMs} ignored)`;
}

/**
 * Step 4: every seat consumes into the SAME arena, and every captain is
 * welcomed. The LAST captain is deliberately held back and boarded in step 5,
 * so this step is also what sets up the boarding-hold oracle: the arena ends it
 * one captain short of `expectedCaptains`.
 */
async function proveOneArena(pool) {
  const early = pool.slice(0, CAP - 1);
  await Promise.all(early.map((c) => board(c)));
  const arenaIds = new Set(early.map((c) => c.arena.roomId));
  assert(arenaIds.size === 1, `captains landed in ${arenaIds.size} different arenas: ${[...arenaIds].join(',')}`);
  const queueIds = new Set(pool.map((c) => c.queue.roomId));
  assert(!arenaIds.has([...queueIds][0]), 'the arena roomId equals the queue roomId — the seat did not cross rooms');
  await waitFor(() => early.every((c) => c.welcome !== null), 10000, 'welcome for every boarded captain');
  const seeds = new Set(early.map((c) => c.welcome.mapSeed));
  assert(seeds.size === 1, `captains were welcomed onto ${seeds.size} different maps (seeds ${[...seeds].join(',')})`);
  const sessions = new Set(early.map((c) => c.welcome.sessionId));
  assert(sessions.size === early.length, `welcome sessionIds are not unique (${sessions.size} of ${early.length})`);
  await waitFor(() => early.every((c) => c.queueLeft !== null), 8000, 'queue sockets closed');
  return `one arena: ${early.length} seats consumed into room ${[...arenaIds][0]} (mapSeed ${[...seeds][0]}), ${early.length} welcomes, queue sockets released`;
}

/**
 * Step 5: THE COUNTDOWN WAITS FOR THE LAST LOADER (amendment 8), then runs 0:10
 * and goes active.
 *
 * The oracle is a real hold, not a stopwatch: with CAP-1 captains aboard the
 * arena must sit in `waiting` — that is the boarding hold — and only the CAP-th
 * consuming its seat may arm the countdown. HOLD_MS is deliberately a small
 * fraction of match.ts's BOARDING_GRACE_MS (20_000, clocked from the FIRST
 * captain aboard), so the backstop cannot be what we observe.
 */
async function proveBoardingToActive(pool) {
  const a = pool[0];
  const lastCaptain = pool[CAP - 1];
  await waitFor(() => a.arena.state?.players?.size === CAP - 1, 20000, `arena roster reaches ${CAP - 1}`);
  const heldFrom = Date.now();
  await sleep(HOLD_MS);
  assert(
    phase(a) === 'waiting',
    `the arena left BOARDING at ${CAP - 1}/${CAP} captains (phase=${phase(a)}) — the countdown must wait for the last loader`,
  );
  assert(a.arena.state.zoneState === 'idle', 'the storm timeline anchored during boarding');
  // The last loader arrives — this, and only this, may arm the countdown.
  await board(lastCaptain);
  await waitFor(() => a.arena.state?.players?.size === CAP, 10000, `arena roster reaches ${CAP}`);
  await waitFor(() => phase(a) === 'countdown' || phase(a) === 'active', 10000, 'last loader -> countdown');
  const armedIn = Date.now() - heldFrom;
  assert(
    armedIn < BOARDED_BY_MS,
    `the countdown armed ${armedIn}ms into boarding — at that point the ${BOARDING_GRACE_MS}ms backstop, not the "everyone loaded" gate, is the likelier cause`,
  );
  assert(lastCaptain.welcome !== null, 'the last loader never received its welcome');
  await waitFor(() => phase(a) === 'active', CONFIG.match.countdown + 15000, 'countdown -> active');
  assert(a.arena.state.zoneState !== 'idle', 'storm timeline not anchored at activation');
  for (const c of pool) {
    assert(phase(c) === 'active', `${c.name} is in phase ${phase(c)} while the match is active`);
  }
  return `boarding held at ${CAP - 1}/${CAP} for ${HOLD_MS}ms in phase 'waiting'; the last loader armed the countdown (${armedIn}ms into a ${BOARDING_GRACE_MS}ms backstop window) and the match went ACTIVE with the storm anchored`;
}

// --- main --------------------------------------------------------------------

async function main() {
  // Pre-boot guard (mirrors matchSmoke/metricsSmoke): refuse to boot when a
  // foreign listener already holds the port, so we never touch a process we
  // didn't start and never assert against someone else's room state.
  assert(!(await portOpen(PORT)), `port ${PORT} is already in use — refusing to boot (won't touch a foreign listener)`);
  const server = bootServer();
  const log = [];
  let leaked = false;
  const pool = [];
  try {
    await waitForServer(15000);

    log.push(await step('0 pv gate', 15000, () => provePvGate()));

    log.push(await step('1 lone captain', 30000, async () => {
      pool.push(await queueUp('ALPHA'));
      return proveLoneCaptainWaits(pool[0]);
    }));

    log.push(await step('2 arm at the 2nd captain', 30000, async () => {
      pool.push(await queueUp('BRAVO'));
      return proveArmAtSecond(pool[0], pool[1]);
    }));

    log.push(await step(`3 fill to cap (${CAP})`, 90000, () => proveCapForms(pool)));

    log.push(await step('4 one arena', 60000, () => proveOneArena(pool)));
    log.push(await step('5 boarding -> active', 90000, () => proveBoardingToActive(pool)));

    console.log('QUEUE SMOKE OK:', { queue: pool[0].queue.roomId, arena: pool[0].arena.roomId, trace: log });
  } finally {
    for (const c of pool) {
      await leaveQuietly(c.arena);
      await leaveQuietly(c.queue);
    }
    killServer(server, 'SIGTERM');
    await sleep(600);
    leaked = await portOpen(PORT);
    if (leaked) {
      // SIGTERM didn't free it — escalate and re-check so we never leave an
      // orphan squatting the port for the next run.
      killServer(server, 'SIGKILL');
      await sleep(600);
      leaked = await portOpen(PORT);
      if (leaked) console.error(`ERROR: port ${PORT} still open after SIGTERM+SIGKILL (leaked listener)`);
    }
  }
  process.exit(leaked ? 1 : 0);
}

main().catch((err) => {
  console.error('QUEUE SMOKE FAILED:', err.message);
  process.exit(1);
});
