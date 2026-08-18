// Liveness smoke (Story 6.6): the real-socket acceptance proof for the public
// `GET /liveness` route. Self-boots the colyseus server on PORT 2607 (NEVER the
// dev server's 2567 — the port is verified FREE before boot and the smoke
// aborts rather than touch a listener it didn't start), then proves, over live
// @colyseus/sdk sockets, that the route's numbers actually MOVE with the rooms:
//
//   1. IDLE — HTTP 200, `Cache-Control: no-store`, and the exact documented
//      shape, with the honest zero the story is about: playersOnline 0,
//      liveGames 0, and an EMITTED queue block reading pooled 0 / min / cap /
//      deadlineAt null (no room == empty queue, answered by the server rather
//      than guessed at by the client), both mode buckets zeroed. `serverNow` is
//      a real epoch, checked against this process's own clock.
//   2. UNARMED QUEUE — one captain queues. pooled 1, deadlineAt NULL. The null
//      is load-bearing: a countdown that cannot fire is exactly what the queue
//      policy forbids showing, and the endpoint must not invent one.
//   3. ARMED QUEUE — the 2nd captain arms the pool. pooled 2 and deadlineAt is
//      an ABSOLUTE EPOCH in the future, bounded by CONFIG.match.queueTimerMs.
//      playersOnline is 2 while liveGames is still 0 — queued captains are
//      online, they are not a game.
//   4. THE DEADLINE IS STABLE — polled again seconds later, deadlineAt is the
//      SAME NUMBER. That is the observable consequence of stamping it once per
//      cohort, which is what lets the queue publish its listing ON CHANGE
//      instead of writing to the matchmaker driver once a second forever.
//   4b. THE POOL DRAINS — a captain leaves an ARMED pool. `queueStep` keeps the
//      arm (frozen policy: a deadline later joins could extend is a
//      hostage-cycling vector), so the countdown would keep running toward a
//      form the policy will refuse. The route must publish deadlineAt NULL
//      while pooled < min — and republish the SAME instant, unmoved, when the
//      pool refills.
//   5. SOLO ARENA — a `create('arena', {solo:true})` room appears as ONE live
//      game with ONE player, split into modes.soloVsAi. This is the humans-only
//      rule at its sharpest: nineteen bots are afloat in that room and NONE of
//      them may reach a player-facing count.
//   6. THE CACHE — a poll taken immediately after a room's population changed
//      still reports the PRE-change counts (one driver query serves many
//      pollers), while `serverNow` is re-stamped fresh on that same cached
//      response. The staleness assertion is skipped rather than guessed if the
//      two polls did not land inside the cache window.
//
// WHY THE CAPTAINS NEVER FORM A MATCH: CONFIG.match.minHumans is 2 and the pool
// then holds for CONFIG.match.queueTimerMs (2:00), which is not overridable
// (StandardQueueRoom accepts no dev room options). Two captains therefore sit
// armed for the whole smoke, which is exactly the state steps 3-6 need.
//
// THAT MARGIN IS NOW ASSERTED, NOT ASSUMED. Steps 4-6 all depend on the cohort
// armed in step 3 still being armed, and the only thing standing between them
// and a mystery failure was the gap between the smoke's own runtime (~20-40s,
// most of it deliberate sleeps past the 2s cache) and the 2:00 cohort timer. A
// future step, a slower box or a longer sleep could quietly eat it. So the
// smoke stamps the arm and, at the end, FAILS if it used more than
// ARM_MARGIN_FRACTION of the cohort's life — a loud, diagnosable failure that
// names the real cause instead of a confusing "the pool disarmed".
//
// Then kills its own server process group and verifies port 2607 is free — a
// leaked listener FAILS the smoke (nonzero exit), it doesn't just warn.
// Run: node server/scripts/livenessSmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { CONFIG, MSG, PROTOCOL_VERSION } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Free ports: matchSmoke/zoneSmoke 2599, reconnect/latency 2601, queue 2603,
// solo 2604/2605, metrics 2631.
const PORT = 2607;
const endpoint = `ws://localhost:${PORT}`;
const livenessUrl = `http://localhost:${PORT}/liveness`;

const MIN = CONFIG.match.minHumans; // 2
const CAP = CONFIG.map.playerCap; // 20
/** Mirrors server/src/liveness.ts LIVENESS_CACHE_MS — restated here because a
 *  .mjs smoke cannot import the server's TS without a build. */
const CACHE_MS = 2000;
/** Comfortably past the cache window, so a poll is guaranteed fresh. */
const PAST_CACHE_MS = CACHE_MS + 600;
/** The share of CONFIG.match.queueTimerMs the smoke may consume between arming
 *  the cohort (step 3) and its last assertion about it (step 6). */
const ARM_MARGIN_FRACTION = 0.5;

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
    // HC_DEV_OPTIONS is DELIBERATELY unset: /liveness is a production surface
    // and the solo door is production too, so nothing this smoke drives may
    // depend on a dev gate.
    env: { ...process.env, NODE_ENV: 'development', PORT: String(PORT) },
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

// --- /liveness fetch + shape checks ------------------------------------------

async function fetchLiveness() {
  const res = await fetch(livenessUrl);
  const body = await res.json();
  return { status: res.status, body, headers: res.headers };
}

/** Assert the payload has the exact documented shape (types, not values). */
function assertShape(body, where) {
  assert(body && typeof body === 'object', `${where}: body not an object`);
  assert(typeof body.playersOnline === 'number', `${where}: playersOnline not numeric`);
  assert(typeof body.liveGames === 'number', `${where}: liveGames not numeric`);
  assert(typeof body.serverNow === 'number', `${where}: serverNow not numeric`);
  assert(body.modes && typeof body.modes === 'object', `${where}: modes missing`);
  for (const key of ['standard', 'soloVsAi']) {
    assert(body.modes[key] && typeof body.modes[key] === 'object', `${where}: modes.${key} missing`);
    assert(typeof body.modes[key].players === 'number', `${where}: modes.${key}.players not numeric`);
    assert(typeof body.modes[key].games === 'number', `${where}: modes.${key}.games not numeric`);
  }
  // `| null` survives in the TYPE (an older server, a proxy), but OUR server
  // must never emit it — the client would otherwise have to invent the
  // threshold, which is exactly what F7 deleted.
  assert(body.queue !== null && typeof body.queue === 'object', `${where}: queue must be an emitted block, never null`);
  if (body.queue !== null) {
    for (const key of ['pooled', 'min', 'cap']) {
      assert(typeof body.queue[key] === 'number', `${where}: queue.${key} not numeric`);
    }
    assert(
      body.queue.deadlineAt === null || typeof body.queue.deadlineAt === 'number',
      `${where}: queue.deadlineAt neither null nor numeric`,
    );
  }
}

/** A poll guaranteed past the cache window, so its counts are fresh. */
async function pollFresh(where) {
  await sleep(PAST_CACHE_MS);
  const { status, body } = await fetchLiveness();
  assert(status === 200, `${where}: /liveness status ${status}`);
  assertShape(body, where);
  return body;
}

// --- client harness -----------------------------------------------------------

async function queueUp(name) {
  const client = new Client(endpoint);
  const queue = await client.joinOrCreate('queue', {
    name,
    pv: PROTOCOL_VERSION,
    cls: 'torpedoBoat',
    horn: 'standard',
  });
  const ctx = { name, client, queue, statuses: [] };
  // Without handlers the SDK warns and discards; the statuses also give us a
  // server-side oracle for when the pool has actually registered the join.
  queue.onMessage(MSG.queueStatus, (m) => ctx.statuses.push(m));
  queue.onMessage(MSG.seat, () => undefined);
  return ctx;
}

async function soloUp(name) {
  const client = new Client(endpoint);
  const arena = await client.create('arena', { name, pv: PROTOCOL_VERSION, solo: true });
  arena.onMessage(MSG.welcome, () => undefined);
  arena.onMessage(MSG.frame, () => undefined);
  arena.onMessage(MSG.results, () => undefined);
  arena.onMessage(MSG.ping, (m) => arena.send(MSG.ping, { n: m.n }));
  return { name, client, arena };
}

async function waitFor(pred, timeoutMs, label) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(50);
  }
}

const last = (ctx) => (ctx.statuses.length > 0 ? ctx.statuses[ctx.statuses.length - 1] : null);

/** Room.leave() that can never hang the teardown. */
async function leaveQuietly(room) {
  if (!room) return;
  let timer;
  await Promise.race([
    room.leave().catch(() => undefined),
    new Promise((res) => { timer = setTimeout(res, 1500); }),
  ]).finally(() => clearTimeout(timer));
}

/** Every step under a hard deadline — an unbounded smoke hangs CI, it doesn't
 *  fail it. Progress rides stderr so a hang is diagnosable from the tail. */
async function step(label, ms, fn) {
  process.stderr.write(`[livenessSmoke] ${label}...\n`);
  let timer;
  const line = await Promise.race([
    fn(),
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`step timed out after ${ms}ms: ${label}`)), ms); }),
  ]).finally(() => clearTimeout(timer));
  process.stderr.write(`[livenessSmoke]   ok: ${line}\n`);
  return line;
}

// --- proof steps -------------------------------------------------------------

/** Step 1: an idle server reports an honest zero in the documented shape. */
async function proveIdle() {
  const { status, body, headers } = await fetchLiveness();
  assert(status === 200, `idle /liveness status ${status}`);
  assertShape(body, 'idle');
  // A caching proxy holding one response would freeze PLAYERS ONLINE for a
  // whole session and pin the ABSOLUTE deadlineAt at 0:00 forever.
  const cacheControl = headers.get('cache-control');
  assert(
    typeof cacheControl === 'string' && cacheControl.includes('no-store'),
    `/liveness must send Cache-Control: no-store, got ${JSON.stringify(cacheControl)}`,
  );
  assert(body.playersOnline === 0, `idle playersOnline should be 0, got ${body.playersOnline}`);
  assert(body.liveGames === 0, `idle liveGames should be 0, got ${body.liveGames}`);
  // The EMPTY-SERVER answer comes from the server, never from a client literal.
  assert(body.queue.pooled === 0, `idle queue.pooled should be 0, got ${body.queue.pooled}`);
  assert(body.queue.min === MIN, `idle queue.min should be ${MIN}, got ${body.queue.min}`);
  assert(body.queue.cap === CAP, `idle queue.cap should be ${CAP}, got ${body.queue.cap}`);
  assert(body.queue.deadlineAt === null, `idle queue published a deadline: ${body.queue.deadlineAt}`);
  assert(body.modes.standard.games === 0 && body.modes.soloVsAi.games === 0, 'idle mode split not zeroed');
  // serverNow is an EPOCH the client subtracts from its own Date.now() to get a
  // skew offset — a monotonic source here would be silently, badly wrong.
  const skew = Math.abs(body.serverNow - Date.now());
  assert(skew < 60_000, `serverNow does not look like an epoch (off by ${skew}ms from ours)`);
  // ONE router now carries BOTH endpoints (so @colyseus/playground's
  // __globalEndpoints lists /liveness too). /metrics is an ops route someone is
  // watching: it must stay byte-identical in behaviour, not merely still exist.
  const ops = await fetch(`http://localhost:${PORT}/metrics`);
  assert(ops.status === 200, `/metrics regressed to status ${ops.status} — the router stopped serving it`);
  const opsBody = await ops.json();
  assert(typeof opsBody.rooms === 'number', '/metrics no longer returns its own payload');
  return `idle: 200 + no-store, shape ok, playersOnline=0 liveGames=0 queue={pooled:0,min:${MIN},cap:${CAP},deadlineAt:null}, serverNow within ${skew}ms of ours; /metrics still 200`;
}

/** Step 2: one queued captain — pooled 1, NO countdown. */
async function proveUnarmed(a) {
  await waitFor(() => last(a) !== null, 8000, 'first queueStatus');
  const body = await pollFresh('unarmed');
  assert(body.queue.pooled === 1, `unarmed pooled=${body.queue.pooled}, expected 1`);
  assert(body.queue.min === MIN, `queue.min=${body.queue.min}, expected ${MIN}`);
  assert(body.queue.cap === CAP, `queue.cap=${body.queue.cap}, expected ${CAP}`);
  assert(
    body.queue.deadlineAt === null,
    `an UNARMED pool published a deadline (${body.queue.deadlineAt}) — a countdown that cannot fire`,
  );
  assert(body.playersOnline === 1, `unarmed playersOnline=${body.playersOnline}, expected 1`);
  assert(body.liveGames === 0, `a queued captain was counted as a live game (${body.liveGames})`);
  return `unarmed: pooled=1 min=${MIN} cap=${CAP} deadlineAt=null, playersOnline=1 liveGames=0`;
}

/** Step 3: the 2nd captain arms the pool — an absolute epoch deadline appears. */
async function proveArmed(a, b) {
  await waitFor(
    () => [a, b].every((c) => last(c) !== null && last(c).n === 2 && last(c).startsInMs !== null),
    8000,
    'both captains see an armed pool',
  );
  const body = await pollFresh('armed');
  assert(body.queue.pooled === 2, `armed pooled=${body.queue.pooled}, expected 2`);
  assert(typeof body.queue.deadlineAt === 'number', 'an ARMED pool published deadlineAt=null');
  const remaining = body.queue.deadlineAt - body.serverNow;
  assert(remaining > 0, `deadlineAt is in the PAST (${remaining}ms) on a freshly armed pool`);
  assert(
    remaining <= CONFIG.match.queueTimerMs,
    `remaining ${remaining}ms exceeds queueTimerMs=${CONFIG.match.queueTimerMs}`,
  );
  // It must be a WALL-CLOCK epoch, not a room-clock reading: the home screen
  // ticks its countdown against its own Date.now(), corrected by serverNow.
  const vsOurClock = body.queue.deadlineAt - Date.now();
  assert(
    vsOurClock > 0 && vsOurClock <= CONFIG.match.queueTimerMs,
    `deadlineAt is not an epoch our own clock can use (${vsOurClock}ms away)`,
  );
  assert(body.playersOnline === 2, `armed playersOnline=${body.playersOnline}, expected 2`);
  assert(body.liveGames === 0, `armed liveGames=${body.liveGames}, expected 0 (no match has formed)`);
  return `armed: pooled=2, deadlineAt is an epoch ${Math.round(remaining / 1000)}s out (<= queueTimerMs), playersOnline=2 liveGames=0`;
}

/** Step 4: the deadline is stamped ONCE per cohort — it must not drift. */
async function proveDeadlineStable(first) {
  const body = await pollFresh('stable');
  assert(typeof body.queue.deadlineAt === 'number', 'stable: the pool disarmed');
  assert(
    body.queue.deadlineAt === first,
    `deadlineAt drifted ${body.queue.deadlineAt - first}ms between polls — it must be stamped once per cohort (a drifting value would also mean a driver write every tick)`,
  );
  return `deadline stable across a ${PAST_CACHE_MS}ms gap: ${first} both times`;
}

/**
 * Step 4b: an ARMED pool drains below min.
 *
 * `queueStep` clears `armedAtMs` only when a match FORMS, never when the pool
 * drains — frozen policy (a deadline later joins could extend is a
 * hostage-cycling vector). So the pool below stays armed underneath while being
 * unable to form, and the ROUTE must stop publishing the countdown: the home
 * screen otherwise read `1 QUEUED · STARTS 1:50`, ticked to `0:00`, and stuck
 * there forever with no match possible.
 *
 * Refilling must republish the SAME instant, unmoved — which is also the proof
 * that this is a publishing decision and not a policy change.
 */
async function proveDrainAndRefill(leaving, rejoin, armedDeadline) {
  await leaveQuietly(leaving.queue);
  const drained = await pollFresh('drained');
  assert(drained.queue.pooled === 1, `drained pooled=${drained.queue.pooled}, expected 1`);
  assert(
    drained.queue.deadlineAt === null,
    `an armed pool that fell BELOW min still published a countdown (${drained.queue.deadlineAt}) — it can never fire`,
  );
  const back = await rejoin();
  await waitFor(() => last(back) !== null, 8000, 'the replacement captain is pooled');
  const refilled = await pollFresh('refilled');
  assert(refilled.queue.pooled === 2, `refilled pooled=${refilled.queue.pooled}, expected 2`);
  assert(
    refilled.queue.deadlineAt === armedDeadline,
    `the cohort's deadline MOVED across the drain (${refilled.queue.deadlineAt} vs ${armedDeadline}) — armedAtMs must survive, only its publication stops`,
  );
  return `drain: pooled 2->1 published deadlineAt=null; refill 1->2 republished the SAME deadline ${armedDeadline}`;
}

/** Step 5: a solo arena is 1 player / 1 game, split into soloVsAi. */
async function proveSoloArena(solo) {
  await waitFor(() => solo.arena.state?.players?.size >= CAP, 25000, `solo roster reaches ${CAP}`);
  const body = await pollFresh('solo');
  assert(body.liveGames === 1, `solo liveGames=${body.liveGames}, expected 1`);
  assert(body.modes.soloVsAi.games === 1, `modes.soloVsAi.games=${body.modes.soloVsAi.games}, expected 1`);
  // THE humans-only proof: ${CAP} hulls are afloat in that room, exactly one of
  // which holds a socket.
  assert(
    body.modes.soloVsAi.players === 1,
    `modes.soloVsAi.players=${body.modes.soloVsAi.players}, expected 1 — ${CAP - 1} bots leaked into a player-facing count`,
  );
  assert(body.modes.standard.games === 0, `modes.standard.games=${body.modes.standard.games}, expected 0`);
  // 2 queued captains + 1 solo human.
  assert(body.playersOnline === 3, `playersOnline=${body.playersOnline}, expected 3`);
  return `solo arena: liveGames=1 modes.soloVsAi={players:1,games:1} with ${CAP - 1} bots afloat and invisible; playersOnline=3`;
}

/**
 * Step 6: the cache. Poll, change the population, poll again IMMEDIATELY: the
 * second poll must still report the pre-change counts, with a FRESH serverNow.
 * Skipped rather than guessed if the two polls straddled the window.
 */
async function proveCache(makeCaptain) {
  const before = await pollFresh('cache-before');
  const c = await makeCaptain();
  await waitFor(() => last(c) !== null, 8000, 'the new captain is pooled');
  const at = Date.now();
  const { body: cached } = await fetchLiveness();
  const elapsed = Date.now() - at;
  assert(cached.serverNow >= at, `serverNow was not re-stamped on the cached response (${cached.serverNow} < ${at})`);
  if (Date.now() - before.serverNow > CACHE_MS - 400) {
    return `cache: SKIPPED the staleness assertion (polls straddled the ${CACHE_MS}ms window); serverNow WAS re-stamped fresh`;
  }
  assert(
    cached.playersOnline === before.playersOnline,
    `a poll ${elapsed}ms inside the ${CACHE_MS}ms cache window already saw the new captain (${cached.playersOnline} vs ${before.playersOnline}) — one driver query must serve many pollers`,
  );
  const fresh = await pollFresh('cache-after');
  assert(
    fresh.playersOnline === before.playersOnline + 1,
    `after the window the count did not catch up (${fresh.playersOnline}, expected ${before.playersOnline + 1})`,
  );
  return `cache: a poll inside the window served the stale count ${before.playersOnline} with a fresh serverNow; past it the count moved to ${fresh.playersOnline}`;
}

// --- main --------------------------------------------------------------------

async function main() {
  assert(!(await portOpen(PORT)), `port ${PORT} is already in use — refusing to boot (won't touch a foreign listener)`);
  const server = bootServer();
  const log = [];
  const captains = [];
  let solo = null;
  let leaked = false;
  try {
    await waitForServer(15000);

    log.push(await step('1 idle', 15000, () => proveIdle()));

    log.push(await step('2 unarmed queue', 30000, async () => {
      captains.push(await queueUp('ALPHA'));
      return proveUnarmed(captains[0]);
    }));

    let armedDeadline = null;
    let armedAtWall = 0;
    log.push(await step('3 armed queue', 30000, async () => {
      captains.push(await queueUp('BRAVO'));
      const line = await proveArmed(captains[0], captains[1]);
      const { body } = await fetchLiveness();
      armedDeadline = body.queue.deadlineAt;
      armedAtWall = Date.now(); // everything below rides THIS cohort's timer
      return line;
    }));

    log.push(await step('4 deadline stable', 30000, () => proveDeadlineStable(armedDeadline)));

    log.push(await step('4b drain below min', 40000, async () => {
      const bravo = captains.pop(); // leaves the pool inside the proof
      return proveDrainAndRefill(bravo, async () => {
        const c = await queueUp('DELTA');
        captains.push(c);
        return c;
      }, armedDeadline);
    }));

    log.push(await step('5 solo arena', 60000, async () => {
      solo = await soloUp('SOLO-1');
      return proveSoloArena(solo);
    }));

    log.push(await step('6 cache', 40000, () => proveCache(async () => {
      const c = await queueUp('CHARLIE');
      captains.push(c);
      return c;
    })));

    // THE MARGIN, ASSERTED. Steps 4-6 all rest on the step-3 cohort still being
    // armed; that only holds because the smoke's own runtime is far under
    // CONFIG.match.queueTimerMs, and nothing used to say so. Fail loudly, and
    // name the cause, rather than let a future step turn this into a mystery.
    log.push(await step('7 cohort margin', 20000, async () => {
      const used = Date.now() - armedAtWall;
      const budget = CONFIG.match.queueTimerMs * ARM_MARGIN_FRACTION;
      assert(
        used < budget,
        `the smoke used ${used}ms of the cohort's ${CONFIG.match.queueTimerMs}ms timer (budget ${budget}ms) — steps 4-6 assume it stays armed; shorten the run or re-arm a fresh cohort`,
      );
      const { body } = await fetchLiveness();
      assert(
        typeof body.queue.deadlineAt === 'number',
        'the cohort disarmed before the last assertion — the margin above is the thing that failed',
      );
      return `margin: used ${Math.round(used / 1000)}s of the ${Math.round(CONFIG.match.queueTimerMs / 1000)}s cohort timer (budget ${Math.round(budget / 1000)}s), still armed`;
    }));

    console.log('LIVENESS SMOKE OK:', { trace: log });
  } finally {
    for (const c of captains) await leaveQuietly(c.queue);
    if (solo) await leaveQuietly(solo.arena);
    killServer(server, 'SIGTERM');
    await sleep(800);
    leaked = await portOpen(PORT);
    if (leaked) {
      killServer(server, 'SIGKILL');
      await sleep(800);
      leaked = await portOpen(PORT);
      if (leaked) console.error(`ERROR: port ${PORT} still open after SIGTERM+SIGKILL (leaked listener)`);
    }
  }
  process.exit(leaked ? 1 : 0);
}

main().catch((err) => {
  console.error('LIVENESS SMOKE FAILED:', err.message);
  process.exit(1);
});
