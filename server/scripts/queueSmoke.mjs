// Queue-lobby smoke (Story 6.1, re-scripted by Story 10.11): self-boots the
// colyseus server on PORT 2603 (never the dev server's 2567) and proves the
// WHOLE production matchmaking handshake over real sockets — the path every
// real player takes, which no unit test can reach because it spans two rooms,
// the matchMaker, and a seat reservation.
//
// SERVER BOOT: this smoke boots its own server with HC_QUEUE_BOT_FILL=6 (BOT
// FILL ON, a SIX-SECOND hold — long enough to observe "armed, not yet seated",
// short enough to wait out). To run it against a server you boot yourself, boot
// with exactly that value: `HC_QUEUE_BOT_FILL=6 HC_DEV_OPTIONS=1`. The smoke
// FAILS FAST, naming the cause, if the first queueStatus does not read min 1
// (a server booted with the switch OFF reads min 2). The fill-OFF queue (arms at
// two captains, seats no bots) is covered by the unit tests (queue.test.ts and
// the queueFill switch tests), not here.
//
// THE STEPS
//   0. PV GATE — joinOrCreate('queue', {}) with no `pv` is REJECTED at
//      matchmake time with the human-readable "refresh" message. This is
//      amendment 5's load-bearing claim: matchMaker.reserveMultipleSeatsFor
//      never calls callOnAuth, so the ARENA's gate no longer runs for any
//      queued player and the queue's own door is the only one left.
//   1. A LONE CAPTAIN ARMS THE HOLD (Story 10.11, R2) — one client queues and
//      receives MSG.queueStatus {n:1, min:1, cap:CONFIG.map.playerCap} with a
//      numeric startsInMs bounded by the hold. We sit part of the hold and assert
//      NO seat arrives: one captain arms the timer, it does not skip it.
//   2. THE DEADLINE SEATS THE LONE CAPTAIN INTO A FULL ARENA (R1, R3) — when the
//      hold ends the captain IS seated, consumes the seat, and the arena's
//      roster (the schema `players` map the client receives) holds
//      CONFIG.map.playerCap entries: one human plus bots. The arena runs the
//      countdown (armed at one human) and goes `active`.
//   3. THE CAP PATH (amendment 2) — a fresh cohort: CAP-1 captains queue (all
//      see n:CAP-1, armed, no seat), then the CAPth trips CONFIG.map.playerCap
//      and the queue forms IMMEDIATELY, ignoring the remaining hold. The hold
//      the bound compares against is the server's, learned from startsInMs in
//      step 1 — not read from CONFIG.
//   4. ONE ARENA — every captain consumes its reservation and lands in the SAME
//      arena roomId (the whole point of routing through one pool), receives
//      MSG.welcome, and leaves the queue room. The LAST captain is deliberately
//      held back here to set up step 5.
//   5. THE COUNTDOWN WAITS FOR THE LAST LOADER (amendment 8) — with CAP-1 aboard
//      the arena SITS in `waiting` with the storm un-anchored; the last captain
//      consuming its seat is what arms the 0:10 countdown, after which the match
//      goes `active`. A real hold, not a stopwatch: the wait is a small fraction
//      of match.ts's 20 s boarding backstop, so the backstop cannot be what we
//      observed.
//   6. THE SHIFT CROSSES THE SEAT RESERVATION (Story 10.4 — the seat gun's
//      successor, Story 8.14 amendment 95, inheriting Story 8.2's deck proof)
//      — the arena's own `client.join` log lines are read off the server's
//      stdout: one per captain (the lone captain's arena included), every one of
//      them carrying the DEFAULT_SHIFT the queue froze, and not a single deck
//      refusal anywhere. This is the ONE proof that core carries a
//      reservation's server-only `auth` payload into `client.auth` before
//      `onJoin` — no in-process unit test reaches it.
//   7. THE SEAT SHIFT AT THE DIRECT DOOR + THE LEAK SCAN (Story 10.4) — solo
//      joins prove the sanitizer's matrix over a real socket: every SHIFT_IDS
//      entry is honoured and rides the OWN frame (`you.shift`), `bogus`
//      coerces to DEFAULT_SHIFT, the LEGACY `gun` option is ignored, and a
//      `deckId` key is DROPPED rather than refused (the 4402 is gone). Every
//      welcome and every frame they receive is scanned for the six
//      card-economy keys no client may ever see — the check the retired
//      poolSmoke used to make, kept alive here.
//
// The hold is set by the server's environment (HC_QUEUE_BOT_FILL, in seconds) —
// there is no per-room timer option, so the smoke boots with a small value.
//
// Run: node server/scripts/queueSmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { CONFIG, DEFAULT_CLASS_ID, DEFAULT_SHIFT, MSG, PROTOCOL_VERSION, SHIFT_IDS } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 2603; // free: matchSmoke/zoneSmoke 2599, reconnect/latency 2601, metrics 2631
const endpoint = `ws://localhost:${PORT}`;

/** HC_QUEUE_BOT_FILL the server is booted with, in SECONDS (see the header). */
const BOT_FILL_SECONDS = 6;
/** The hold that value means, in ms — the bound a status is checked against. */
const EXPECTED_HOLD_MS = BOT_FILL_SECONDS * 1000;
const CAP = CONFIG.map.playerCap; // the immediate-form trigger and the fill target
/** How long a lone captain sits with no seat before we call "armed, not yet
 *  seated" proven — comfortably inside the hold. */
const LONE_WAIT_MS = 2000;
/** The cap path must trip the cap this far BEFORE its cohort's hold would end,
 *  or the smoke could not tell the cap from the timer. */
const CAP_TRIP_MARGIN_MS = 1500;
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

/** Every line the server wrote to stdout — its structured log (server/src/
 *  log.ts emits `level event {json}` through console.log). Step 6 reads the
 *  arena's own join lines out of it. */
const serverLog = [];

function bootServer() {
  const tsx = path.join(REPO, 'node_modules/.bin/tsx');
  const proc = spawn(tsx, ['src/index.ts'], {
    cwd: path.join(REPO, 'server'),
    detached: true, // own process group, so we can kill tsx + its node child
    // HC_DEV_OPTIONS=1 is NOT needed by the queue itself (it accepts no dev
    // options) but the arena's direct door is dev-gated since Story 6.1, and
    // every other smoke boots this way — kept identical so this script's server
    // is the same server the rest of the suite exercises.
    env: {
      ...process.env, NODE_ENV: 'development', PORT: String(PORT), HC_DEV_OPTIONS: '1',
      HC_QUEUE_BOT_FILL: String(BOT_FILL_SECONDS), // bot fill ON, six-second hold
    },
    // stdout is PIPED (it used to be ignored) so step 6 can read the server's
    // own structured log; stderr still passes through for diagnosability.
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => serverLog.push(chunk));
  return proc;
}

/** The server's stdout so far, as whole lines. */
const serverLines = () => serverLog.join('').split('\n');

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
    cls: DEFAULT_CLASS_ID,
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

// --- the leak scan (Story 8.14, absorbed from the deleted poolSmoke) ---------

/**
 * KEYS THAT MAY NEVER REACH A CLIENT. The card economy is entirely
 * server-private: there is no deck any more, no hidden match pool, and the
 * match-wide TAKE LEDGER and the per-ship WEIGHTS that Story 8.14 added are
 * server state that no frame, welcome or schema may ever carry. Only the four
 * offered line ids leave the server.
 *
 * Scanned as OWN KEYS, never as text: a LINE ID riding `offer`/`cards` as a
 * VALUE must never false-positive.
 */
const FORBIDDEN = ['deck', 'deckList', 'deckId', 'pool', 'takes', 'weights'];

/** The path to the first OWN KEY matching `forbidden` anywhere in `value`, or
 *  null. */
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

/** A private SOLO VS AI room on the direct door — `create()` always mints a
 *  fresh one, so these three probes can never touch the queue's arena. */
async function createSolo(options) {
  const client = new Client(endpoint);
  const room = await client.create('arena', { pv: PROTOCOL_VERSION, solo: true, name: 'ERIC', ...options });
  const ctx = { room, welcome: null, frames: [] };
  room.onMessage(MSG.welcome, (m) => { ctx.welcome = m; });
  room.onMessage(MSG.frame, (f) => ctx.frames.push(f));
  room.onMessage(MSG.results, () => undefined);
  room.onMessage(MSG.ping, (m) => room.send(MSG.ping, { n: m.n }));
  return ctx;
}

/** This client's frames that actually carry the own-ship block. */
const ownFrames = (ctx) => ctx.frames.filter((f) => f.you !== undefined && f.you !== null);

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

/** What a queue status must read under HC_QUEUE_BOT_FILL: ONE captain arms. */
function assertBotFillOn(s) {
  assert(
    s.min === 1,
    `queueStatus min=${s.min}, expected 1 — the server was NOT booted with HC_QUEUE_BOT_FILL=${BOT_FILL_SECONDS} (bot fill ON); this smoke needs it`,
  );
  assert(s.cap === CAP, `queueStatus cap=${s.cap}, expected ${CAP}`);
}

/** The first status carrying a numeric countdown, or null. */
const armedStatus = (ctx) => ctx.statuses.find((m) => typeof m.startsInMs === 'number') ?? null;

/**
 * Step 1: a lone captain ARMS the hold and is not seated before it ends.
 * Returns the hold the server applies as learned from the countdown it
 * published (the cap path compares against THIS, never against CONFIG).
 */
async function proveLoneCaptainArms(a) {
  await waitFor(() => last(a) !== null, 5000, 'first queueStatus');
  assertBotFillOn(last(a));
  await waitFor(() => armedStatus(a) !== null, 4000, 'a lone captain armed the pool (numeric startsInMs)');
  const s = armedStatus(a);
  assert(s.n === 1, `lone captain sees n=${s.n}, expected 1`);
  assert(s.startsInMs > 0, `lone captain armed with startsInMs=${s.startsInMs}, expected > 0`);
  assert(
    s.startsInMs <= EXPECTED_HOLD_MS,
    `lone captain startsInMs=${s.startsInMs} exceeds the ${EXPECTED_HOLD_MS}ms hold HC_QUEUE_BOT_FILL=${BOT_FILL_SECONDS} sets`,
  );
  await sleep(LONE_WAIT_MS);
  assert(a.seat === null, 'the lone captain was seated BEFORE the hold ended — one captain arms the timer, it must not skip it');
  return {
    holdMs: s.startsInMs,
    line: `lone captain: n=1 min=1 cap=${CAP}, armed with startsInMs=${s.startsInMs} (<= ${EXPECTED_HOLD_MS}ms hold), still unseated after ${LONE_WAIT_MS}ms`,
  };
}

/**
 * Step 2: the deadline seats the lone captain into an arena filled to the cap
 * (one human + bots), which counts down and goes active.
 */
async function proveDeadlineFillsArena(a, holdMs) {
  const t0 = Date.now();
  await waitFor(() => a.seat !== null, holdMs + 8000, 'the lone captain is seated at the deadline');
  const waited = Date.now() - t0;
  await board(a);
  await waitFor(() => a.welcome !== null, 10000, 'welcome for the lone captain');
  await waitFor(() => a.arena.state?.players?.size === CAP, 15000, `arena roster reaches ${CAP}`);
  await waitFor(() => phase(a) === 'countdown' || phase(a) === 'active', 10000, 'one human armed the countdown');
  await waitFor(() => phase(a) === 'active', CONFIG.match.countdown + 15000, 'countdown -> active');
  return `deadline: the lone captain was seated ${waited}ms after step 1's wait and boarded an arena whose roster holds ${a.arena.state.players.size} (one human + ${CAP - 1} bots); the match went ACTIVE`;
}

/** Step 3: fill a fresh cohort to CAP; the last joiner trips the immediate form. */
async function proveCapForms(pool, holdMs) {
  const cohortStart = Date.now();
  pool.push(await queueUp('CAPTAIN-1'));
  await waitFor(() => armedStatus(pool[0]) !== null, 4000, 'the cohort armed');
  // 2..CAP-1 together: this has to land well inside the hold.
  const rest = await Promise.all(
    Array.from({ length: CAP - 2 }, (_, i) => queueUp(`CAPTAIN-${i + 2}`)),
  );
  pool.push(...rest);
  await waitFor(
    () => pool.every((c) => last(c) !== null && last(c).n === CAP - 1),
    10000,
    `all ${CAP - 1} captains see the full pool count`,
  );
  assert(seated(pool) === 0, `a match formed at ${CAP - 1} captains — below cap and before the deadline`);
  const roomIds = new Set(pool.map((c) => c.queue.roomId));
  assert(roomIds.size === 1, `captains scattered across ${roomIds.size} queue rooms: ${[...roomIds].join(',')}`);
  const spent = Date.now() - cohortStart;
  assert(
    spent < holdMs - CAP_TRIP_MARGIN_MS,
    `queueing ${CAP - 1} captains took ${spent}ms of the ${holdMs}ms hold — too close to tell the cap from the timer`,
  );
  // The CAP-th captain: form now, ignore the remaining timer.
  const formedAt = Date.now();
  pool.push(await queueUp(`CAPTAIN-${CAP}`));
  await waitFor(() => seated(pool) === CAP, 15000, `all ${CAP} captains seated`);
  const into = Date.now() - cohortStart;
  assert(
    into < holdMs,
    `the cap form landed ${into}ms into the cohort — past the ${holdMs}ms hold, so the timer could have formed it`,
  );
  return `cap form: ${CAP - 1} pooled captains stayed unseated; the ${CAP}th tripped the cap and all ${CAP} seats landed in ${Date.now() - formedAt}ms, ${into}ms into a ${holdMs}ms hold (remaining timer ignored)`;
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

/**
 * Step 6: THE SHIFT CROSSED THE RESERVATION (Story 10.4 — the seat gun's
 * successor, Story 8.14 amendment 95). Every captain reached the arena through
 * the queue, so every arena join must report the Shift the QUEUE froze into the
 * seat's server-only `auth` payload. These captains send no `shift` at all, so
 * the queue sanitizes it to DEFAULT_SHIFT and the arena must log exactly that —
 * the same transport proof the deck used to give: if `client.auth` arrived
 * empty the arena would fall back to the join option instead, and on this path
 * the two answers happen to agree, so the log line is read together with step
 * 7's DIRECT-door check, where they do not.
 *
 * `deck.illegal` and the 4402 refusal are GONE with the deck door: nothing at
 * either door can refuse a join over the card economy any more, and a line
 * claiming otherwise is a regression.
 */
async function proveShiftRodeTheSeat(expected) {
  await sleep(300); // let the last join's line flush through the pipe
  const joins = serverLines().filter((l) => l.startsWith('info client.join '));
  assert(
    joins.length === expected,
    `saw ${joins.length} arena client.join lines, expected ${expected}`,
  );
  const tag = `"shift":"${DEFAULT_SHIFT}"`;
  const seat = joins.filter((l) => l.includes(tag));
  assert(
    seat.length === expected,
    `only ${seat.length}/${expected} arena joins logged ${tag} — the seat's auth did not reach client.auth: ${joins.filter((l) => !l.includes(tag)).join(' | ')}`,
  );
  const refusals = serverLines().filter((l) => l.includes('deck.illegal') || l.includes('deck illegal'));
  assert(refusals.length === 0, `a deck refusal fired in a codebase with no deck door: ${refusals.join(' | ')}`);
  return `shift transport: all ${expected} arena joins logged ${tag} (the seat's server-only auth reached client.auth), no deck refusal anywhere`;
}

/**
 * Step 7: THE SEAT SHIFT AT THE DIRECT DOOR (Story 10.4). Solo joins, each
 * proving one row of the sanitizer's matrix end to end — over a real socket,
 * because `OwnShip.shift` is a WIRE field and no unit test proves it left the
 * server:
 *
 *   - every `SHIFT_IDS` entry -> reaches the arena and the OWN frame reads it;
 *   - `shift: 'bogus'` -> coerced to DEFAULT_SHIFT, never a refusal;
 *   - the legacy `gun: 'flak'` -> ignored (DEFAULT_SHIFT), never a refusal;
 *   - `deckId: 'x'` -> a dead key now: DROPPED like any unknown option, the
 *     join proceeds, and the 4402 refusal that used to fire does not exist.
 */
async function proveSeatShift() {
  const cases = [
    // Every seat id reads back on the own frame exactly as picked.
    ...SHIFT_IDS.map((id) => ({ label: `shift:'${id}'`, options: { shift: id }, expect: id })),
    { label: "shift:'bogus'", options: { shift: 'bogus' }, expect: DEFAULT_SHIFT },
    { label: "legacy gun:'flak'", options: { gun: 'flak' }, expect: DEFAULT_SHIFT },
    { label: "deckId:'x'", options: { deckId: 'x' }, expect: DEFAULT_SHIFT },
  ];
  const seen = [];
  for (const c of cases) {
    const ctx = await createSolo(c.options);
    try {
      await waitFor(() => ownFrames(ctx).length > 0, 20000, `${c.label}: an own frame`);
      const shift = ownFrames(ctx)[0].you.shift;
      assert(shift === c.expect, `${c.label}: own frame reads shift '${shift}', expected '${c.expect}'`);
      assert(findForbiddenKey(ctx.welcome, FORBIDDEN) === null, `${c.label}: the welcome carries a forbidden key`);
      for (const [i, f] of ctx.frames.entries()) {
        const hit = findForbiddenKey(f, FORBIDDEN);
        assert(hit === null, `${c.label}: frame ${i} carries a forbidden key at ${hit}`);
      }
      seen.push(`${c.label} -> ${shift} (${ctx.frames.length} clean frames)`);
    } finally {
      await leaveQuietly(ctx.room);
    }
  }
  return `seat shift at the direct door: ${seen.join('; ')}`;
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
  let lone = null;
  try {
    await waitForServer(15000);

    log.push(await step('0 pv gate', 15000, () => provePvGate()));

    let holdMs = EXPECTED_HOLD_MS;
    log.push(await step('1 lone captain arms the hold', 30000, async () => {
      lone = await queueUp('ALPHA');
      const r = await proveLoneCaptainArms(lone);
      holdMs = r.holdMs;
      return r.line;
    }));

    log.push(await step('2 deadline seats the lone captain into a full arena', 60000, () =>
      proveDeadlineFillsArena(lone, holdMs)));
    await leaveQuietly(lone.arena); // the lone arena has no other human: it disposes

    log.push(await step(`3 fill to cap (${CAP})`, 90000, () => proveCapForms(pool, holdMs)));

    log.push(await step('4 one arena', 60000, () => proveOneArena(pool)));
    log.push(await step('5 boarding -> active', 90000, () => proveBoardingToActive(pool)));
    log.push(await step('6 shift rode the seat reservation', 15000, () => proveShiftRodeTheSeat(CAP + 1))); // the cap cohort + the lone captain
    log.push(await step('7 seat shift at the direct door', 120000, () => proveSeatShift()));

    console.log('QUEUE SMOKE OK:', { queue: pool[0].queue.roomId, arena: pool[0].arena.roomId, trace: log });
  } finally {
    if (lone) {
      await leaveQuietly(lone.arena);
      await leaveQuietly(lone.queue);
    }
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
