// Match-lifecycle smoke: self-boots the colyseus server on PORT 2599 (never
// the dev server's 2567), joins two live @colyseus/sdk clients with a DEV
// matchOverride that shrinks the lifecycle timers, and proves the full loop:
//   1. waiting -> countdown at the 2nd join; the room LOCKS (a 3rd client's
//      joinOrCreate lands in a fresh room).
//   2. Ready room is weapons-safe: A torpedoes B point blank — B sees the
//      boom strike itself but loses ZERO hp until the match activates.
//   3. countdown end -> active: both hulls teleported to the spawn ring at
//      full hp, storm timeline anchored (zoneState leaves 'idle').
//   4. A sinks B (two torpedoes): B's own sunk event carries by=A; B then
//      receives spec:true frames (you omitted, unfogged contacts incl. A).
//      A NEVER receives a spec frame before the frame that reports B's sink
//      (the finish happens on the sink tick — from then on everyone spectates).
//   5. results broadcast: winnerId=A, placements A=1/B=2, A's kills=1 and
//      damageDealt >= B's hull.
//   6. The room disconnects both clients ~resultsMs later (autoDispose).
// Then kills its own server process group and verifies port 2599 is free.
//
// matchOverride is a dev tool — the real client never sets it.
// Run: node server/scripts/matchSmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { CONFIG, PROTOCOL_VERSION, bearing, angleDiff, generateMap, segCircleHit } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 2599;
const endpoint = `ws://localhost:${PORT}`;
// Countdown long enough for two ring-spawned ships to close to torpedo range
// and prove damage suppression (with margin for missed passes — drone traffic
// in the ready room can intercept a fish, and the flyby orbits at current
// ship speeds mean each 12s reload gets roughly one shot per pass); results
// short so the disposal is observable.
const MATCH_OVERRIDE = { countdownMs: 120000, resultsMs: 3000 };
// After B sinks (step 4), A is the last human. Give the step-4 fight a
// comfortable storm-free window (90s grace >> the ~50s converge+two-torpedo
// fight, so A — not the storm — sinks B), then shrink to a TINY floor.
//
// endRadiusFraction is a small NON-zero value on purpose. A pure point (0) makes
// the endgame an hp race A cannot reliably win: the 120hp battleship fill drone
// outlasts A's 100hp cruiser at a zero-radius floor no matter how long the shrink
// (the heal spend is clamped to A's 100 maxHp, so it can't close the gap either).
// Instead we leave a floor pocket (~25u) that ONLY A can hold: the drone AI never
// throttles below 0.5 (drones.ts MIN_THROTTLE) so a dumb hull is always moving
// >=15u/s and cannot loiter inside so tight a circle — it keeps crossing the ring
// and storm-sinks — while A throttles right down and parks inside it, safe. Too
// LARGE a pocket and drones camp it forever (the historical 0.1/164u flake); ~25u
// is well under a dumb hull's minimum turning circle but roomy for A's tight hold.
// So the match finishes with A alive, every drone (and B) placed, A the winner.
const ZONE_OVERRIDE = { grace: 90000, shrinkDuration: 90000, endRadiusFraction: 0.015 };
// Fire only from close, well-aimed range: a short lane keeps ready-room drones
// from wandering into the shot and makes each fish near-certain on a head-on
// target (fish + closing target ≈ 90 u/s over <4s).
const TORP_RANGE = 350; // u — click only inside this
// rad — click when the target bears within this of the bow. The bow TUBE arc is
// halfArc 30° (0.524 rad) and a torpedo launches straight at `aim` whenever aim
// sits inside it (server: torpedoes.ts inArc/clampToArc), so any click inside
// ~0.4 rad puts a fish on a stationary target. Kept comfortably under 0.524 to
// absorb the bow turning between client input-sample and server apply. A tight
// gate (0.15) threw away most valid shots and made the ready-room hit flaky.
const ARC = 0.4;
const ORIGIN = { x: 0, y: 0 }; // map center — the storm's fully-closed point
// Island obstacle field, rebuilt client-side from welcome.mapSeed (deterministic,
// islands never travel on the wire — see net/connection.ts). Populated once A's
// welcome lands; used for PROACTIVE avoidance so a full-throttle hull never rams
// (and jams on) an island mid-run. Empty until set — avoidance is then a no-op.
let ISLANDS = [];
const ISLAND_LOOKAHEAD = 170; // u — start turning this far ahead of an island

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- server lifecycle --------------------------------------------------------

function bootServer() {
  const tsx = path.join(REPO, 'node_modules/.bin/tsx');
  const proc = spawn(tsx, ['src/index.ts'], {
    cwd: path.join(REPO, 'server'),
    detached: true, // own process group, so we can kill tsx + its node child
    // HC_DEV_OPTIONS=1 is required for the room to honor matchOverride/
    // zoneOverride at all (see server/src/rooms/roomOptions.ts) — without it
    // they're silently stripped and this smoke's assertions would fail.
    env: { ...process.env, NODE_ENV: 'development', PORT: String(PORT), HC_DEV_OPTIONS: '1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return proc;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1');
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
  });
}

async function waitForServer(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await portOpen(PORT)) return;
    await sleep(200);
  }
  throw new Error('server did not open the port in time');
}

function killServer(proc) {
  try {
    process.kill(-proc.pid, 'SIGTERM'); // whole group — our own PID only
  } catch {
    // already gone
  }
}

/** SIGKILL fallback if SIGTERM didn't free the port within the grace (mirrors
 *  metricsSmoke) — a leaked listener would fail the NEXT run's pre-boot guard. */
function killServerHard(proc) {
  try {
    process.kill(-proc.pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

// --- client harness ----------------------------------------------------------

async function joinClient(name) {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('arena', { name, pv: PROTOCOL_VERSION, matchOverride: MATCH_OVERRIDE, zoneOverride: ZONE_OVERRIDE });
  const ctx = {
    name, room, welcome: null, you: null, seq: 0, fireSeq: 0, fireAt: null,
    frames: 0, specFrames: 0, specWithYou: 0, specContactIds: new Set(),
    specBeforeFinish: 0, seenPeerSunk: false, peerId: null,
    boomsOnMe: 0, readyHpViolations: 0, activated: false, minHpActive: Infinity,
    sunkSeen: false, sunkBy: 'UNSET', results: null, leftCode: null, parked: false,
  };
  room.onMessage('w', (m) => (ctx.welcome = m));
  room.onMessage('f', (m) => onFrame(ctx, m));
  room.onMessage('r', (m) => (ctx.results = m));
  room.onLeave((code) => (ctx.leftCode = code));
  return ctx;
}

function onFrame(ctx, f) {
  ctx.frames += 1;
  const hasPeerSunk = ctx.peerId !== null && f.events.some((e) => e.k === 'sunk' && e.id === ctx.peerId);
  const hasOwnSunk = f.events.some((e) => e.k === 'sunk' && e.id === ctx.room.sessionId);
  if (f.spec) {
    ctx.specFrames += 1;
    if (f.you) ctx.specWithYou += 1;
    for (const c of f.contacts) ctx.specContactIds.add(c.id);
    // A spec frame is legal only once the observer is dead or the match ended.
    // The boundary frame is the one reporting the deciding sink (own death /
    // the peer's) — anything earlier is an anti-cheat violation.
    const atBoundary = ctx.sunkSeen || hasOwnSunk || ctx.seenPeerSunk || hasPeerSunk;
    if (!atBoundary) ctx.specBeforeFinish += 1;
  }
  if (hasPeerSunk) ctx.seenPeerSunk = true;
  if (f.you) {
    ctx.you = f.you;
    if (!ctx.activated && f.you.hp < CONFIG.shipClasses.cruiser.hp) ctx.readyHpViolations += 1;
    if (ctx.activated) ctx.minHpActive = Math.min(ctx.minHpActive, f.you.hp);
  }
  for (const e of f.events) {
    if (e.k === 'boom' && e.hit === ctx.room.sessionId) ctx.boomsOnMe += 1;
    if (e.k === 'sunk' && e.id === ctx.room.sessionId) {
      ctx.sunkSeen = true;
      ctx.sunkBy = e.by;
    }
  }
}

/** Steer toward the peer; torpedoes away when in range/arc and armed=true. */
function control(ctx, target, armed) {
  const inp = { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, weapon: 1 };
  if (ctx.you && target) {
    const brg = bearing(ctx.you, target);
    inp.rudder = clamp(angleDiff(ctx.you.heading, brg) * 3, -1, 1);
    inp.aim = brg;
    const d = dist(ctx.you, target);
    // Close fast, then stand off around ~150u: driving to point blank puts
    // the pair in a 3-50u waltz where the bearing swings faster than the bow
    // can track, so the ARC click gate never reopens and the fight stalls
    // after the first fish. At standoff the solution is stable and a fish
    // launches every reload.
    inp.throttle = d > 300 ? 1 : d > 150 ? 0.4 : 0;
    // Click every tick while the solution holds — the tube reload paces launches.
    if (armed && d < TORP_RANGE && Math.abs(angleDiff(ctx.you.heading, brg)) < ARC) inp.fireSeq = ++ctx.fireSeq;
  }
  ctx.room.send('i', inp);
}

/** Send a dead-stop input (throttle/rudder 0, weapons cold). */
function idle(ctx) {
  ctx.room.send('i', { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, weapon: 1 });
}

/** Full-astern + hard-rudder break-off input for a hull pinned on an island. */
function backOff(ctx) {
  return { seq: ++ctx.seq, throttle: -1, rudder: 1, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, weapon: 1 };
}

/**
 * Rudder bias (added to the desired-heading rudder) that steers a hull clear of
 * any island ahead — the same trick the drone AI uses. For each island within
 * the forward lookahead, push the rudder to whichever side puts the bow around
 * it. Proactive avoidance means a full-throttle hull rarely rams/jams at all.
 */
function islandBias(you, maxDist = Infinity) {
  const fx = Math.cos(you.heading);
  const fy = Math.sin(you.heading);
  let bias = 0;
  for (const c of ISLANDS) {
    const dx = c.x - you.x;
    const dy = c.y - you.y;
    const ahead = dx * fx + dy * fy;
    // Ignore islands behind us, and ones AT or BEYOND the target — otherwise an
    // island near a parked B would steer the shooter off its firing run forever.
    if (ahead <= 0 || ahead > maxDist - 30) continue;
    if (Math.hypot(dx, dy) > ISLAND_LOOKAHEAD + c.r) continue;
    bias += fx * dy - fy * dx > 0 ? -0.9 : 0.9; // island to port -> turn starboard
  }
  return clamp(bias, -1, 1);
}

/** True iff the segment from→to crosses no island — a clear torpedo lane. */
function losClear(from, to) {
  for (const c of ISLANDS) {
    if (segCircleHit(from, to, c, c.r) !== null) return false;
  }
  return true;
}

/**
 * Backup island-pin recovery (proactive avoidance above is the primary defense).
 * A full-throttle hull that stops moving is jammed bow-first on an island and
 * CANNOT turn off (stepShip gives ~zero rudder authority at ~zero speed). On a
 * pin, latch a short full-ASTERN + hard-rudder burst to back off (sternway
 * restores steerage), THEN a grace window where detection is paused while the
 * hull rebuilds headway — without that grace the slow sternway (< the movement
 * threshold) re-triggers instantly and the hull reverses forever. Returns the
 * break-off input while recovering, else null (caller sends its normal input).
 */
function unstickInput(ctx) {
  if (!ctx.you) return null;
  const moved = ctx._lastPos ? Math.hypot(ctx.you.x - ctx._lastPos.x, ctx.you.y - ctx._lastPos.y) : 99;
  ctx._lastPos = { x: ctx.you.x, y: ctx.you.y };
  if (ctx._backing > 0) {
    ctx._backing -= 1;
    if (ctx._backing === 0) ctx._grace = 24; // ~1.2s to rebuild headway
    return backOff(ctx);
  }
  if (ctx._grace > 0) {
    ctx._grace -= 1;
    ctx._stuck = 0;
    return null;
  }
  ctx._stuck = moved < 1.5 ? (ctx._stuck ?? 0) + 1 : 0;
  if (ctx._stuck > 10) {
    ctx._backing = 14; // ~0.7s astern clears the bow off the island
    ctx._stuck = 0;
    return backOff(ctx);
  }
  return null;
}

/** Extend back out to at least this range before re-approaching for a shot. */
const STANDOFF_OUT = 300;
/** Passing inside this range ends the approach and begins the extend leg. */
const STANDOFF_IN = 140;
/** Max ticks in an extend leg before forcing a re-approach (island trap escape). */
const EXTEND_MAX = 120;

/**
 * Racetrack torpedo run against a (stationary) target. Drive at FULL throttle so
 * the ship always keeps steerage (stepShip grants zero rudder authority at a
 * standstill — a standoff-to-a-stop deadlocks the bow off-aim and never fires).
 * Two legs, alternated per shooter:
 *   - APPROACH: steer the bow onto the target and launch when it bears tightly
 *     (|err| < ARC) and is in range. On a straight run from range the bow tracks
 *     easily (bearing slews slowly) so the shot lands.
 *   - EXTEND: once the pass closes inside STANDOFF_IN, coast straight out (the
 *     point-blank bearing slews faster than the bow can turn — the torpedo waltz
 *     that stalls a chaser at 1 hit) until back beyond STANDOFF_OUT, then
 *     re-approach. There is no ship-ship collision, so the shooter flies through.
 * unstickInput() handles island pins (a jammed hull is backed off astern). The
 * 12s tube reload paces launches; each clean approach against a parked target
 * lands a fish.
 */
function strafeFire(shooter, target, armed) {
  const un = unstickInput(shooter);
  if (un) {
    shooter.room.send('i', un);
    return;
  }
  const inp = { seq: ++shooter.seq, throttle: 1, rudder: 0, aim: 0, fireSeq: shooter.fireSeq, aimDist: 0, weapon: 1 };
  if (!shooter.you || !target) {
    shooter.room.send('i', inp);
    return;
  }
  const brg = bearing(shooter.you, target);
  const err = angleDiff(shooter.you.heading, brg);
  const d = dist(shooter.you, target);
  inp.aim = brg;
  if (shooter._extending) {
    shooter._extAge = (shooter._extAge ?? 0) + 1;
    // Re-approach once far enough out OR if the extend stalls (a B-adjacent island
    // + avoidance/back-off can pin the leg short of STANDOFF_OUT — the trap that
    // left A circling at ~127u never firing).
    if (d > STANDOFF_OUT || shooter._extAge > EXTEND_MAX) shooter._extending = false;
    inp.rudder = clamp(islandBias(shooter.you), -1, 1); // steer clear while coasting out
  } else {
    // Commit to the target: only dodge islands nearer than B (islandBias maxDist),
    // never one sitting by B, or the firing run would curve away and never launch.
    inp.rudder = clamp(err * 3 + islandBias(shooter.you, d), -1, 1);
    // Fire only with a CLEAR torpedo lane (losClear) so a fish never wastes on an
    // island between A and B — A racetracks to sample angles until one is open.
    if (armed && d < TORP_RANGE && Math.abs(err) < ARC && losClear(shooter.you, target)) inp.fireSeq = ++shooter.fireSeq;
    if (d < STANDOFF_IN) {
      shooter._extending = true; // passed close — extend out
      shooter._extAge = 0;
    }
  }
  shooter.room.send('i', inp);
}

/**
 * A strafes B (full-throttle torpedo runs); B converges on A until the pair is
 * within 500u, then LATCHES to a dead stop (`b.parked`) so A always has a
 * stationary target. The latch + strafing defeat the flyby-orbit torpedo-luck
 * flake; it is cleared at activation so B closes fresh from the redeployed ring.
 */
function huntPeer(a, b, armed) {
  strafeFire(a, b.you, armed);
  if (a.you && b.you && dist(a.you, b.you) <= 500) b.parked = true;
  if (b.parked || !b.you || !a.you) idle(b);
  else control(b, a.you, false);
}

/**
 * Drive a ship toward map center (0,0) and hold TIGHT there (throttle floor keeps
 * it looping within ~10u, never parked). Used in the endgame: A parks inside the
 * tiny storm floor pocket (~25u, see ZONE_OVERRIDE) where it is permanently safe,
 * while the dumb drones — which never throttle below 0.5 and so cannot loiter in
 * so tight a circle — keep crossing the ring and storm-sink. A survives, so the
 * match finishes with ALL drones placed and A the winner. Weapons cold here.
 */
function steerToCenter(ctx) {
  if (!ctx.you) return;
  const un = unstickInput(ctx);
  if (un) {
    ctx.room.send('i', un);
    return;
  }
  const brg = bearing(ctx.you, ORIGIN);
  const d = Math.hypot(ctx.you.x, ctx.you.y);
  // Hold TIGHT to the origin: a throttle FLOOR (never 0) keeps the hull looping
  // through center within ~10u rather than parking, so part of every loop is
  // spent INSIDE the collapsing ring even near the floor — stretching A's
  // survival well past the dumb drones, which can only orbit out at waypoint
  // distance and sit continuously outside once the ring passes them.
  ctx.room.send('i', {
    seq: ++ctx.seq,
    throttle: d > 200 ? 1 : d > 30 ? 0.45 : 0.2,
    rudder: clamp(angleDiff(ctx.you.heading, brg) * 3 + islandBias(ctx.you, d), -1, 1),
    aim: 0,
    fireSeq: ctx.fireSeq,
    aimDist: 0,
    weapon: 1,
  });
}

function phase(ctx) {
  return ctx.room.state?.matchPhase ?? 'unknown';
}

async function runUntil(tick, done, timeoutMs, label) {
  const start = Date.now();
  while (!done()) {
    tick();
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(CONFIG.tick.simDtMs);
  }
}

async function main() {
  // Pre-boot guard (mirrors metricsSmoke): refuse to boot when a foreign
  // listener already holds the port, so we never touch a process we didn't
  // start (e.g. a stale orphan or the user's own server) and never assert
  // against someone else's room state.
  assert(!(await portOpen(PORT)), `port ${PORT} is already in use — refusing to boot (won't touch a foreign listener)`);
  const server = bootServer();
  const log = [];
  let leaked = false;
  try {
    await waitForServer(15000);

    // --- 1. waiting -> countdown + room lock --------------------------------
    const a = await joinClient('ALPHA');
    await sleep(500);
    assert(phase(a) === 'waiting', `solo join should idle in waiting (got ${phase(a)})`);
    // Rebuild the exact island field for proactive avoidance (same deterministic
    // generateMap the client uses; islands never travel on the wire).
    assert(a.welcome, 'no welcome message received');
    ISLANDS = generateMap(a.welcome.mapSeed, a.welcome.playerCap).islands;
    const b = await joinClient('BRAVO');
    assert(a.room.roomId === b.room.roomId, 'A and B joined different rooms');
    a.peerId = b.room.sessionId;
    b.peerId = a.room.sessionId;
    await sleep(500);
    assert(phase(a) === 'countdown', `2nd join should start the countdown (got ${phase(a)})`);
    assert(a.room.state.countdownEndT > 0, 'countdownEndT not set');
    const c = await joinClient('CHARLIE'); // locked room -> fresh room
    assert(c.room.roomId !== a.room.roomId, 'locked room accepted a 3rd client');
    await c.room.leave();
    log.push('countdown started at 2nd join; locked room bounced CHARLIE to a fresh room');

    // --- 2. weapons-safe ready room (fire torpedoes point blank) ------------
    // huntPeer closes the pair, then LATCHES B to a dead stop once within 500u:
    // mutual full-throttle charges otherwise produce flyby orbits where the bow
    // rarely bears (one shot per 12s reload per pass, some passes wasted), which
    // is exactly the historical step-2/step-4 torpedo-luck flake. Against a
    // parked target A makes full-throttle strafing runs, landing a fish
    // near-certain on each aligned pass (the 12s tube reload paces the launches).
    const readyTick = () => huntPeer(a, b, true);
    // Bounded by the countdown anyway (`active` is the escape): with B latched to
    // a dead stop once A closes and proactive island avoidance clearing the run,
    // A lands a fish well inside the window. Timeout > countdownMs so the phase
    // flip — not this timer — ends the wait.
    await runUntil(readyTick, () => b.boomsOnMe >= 1 || phase(a) === 'active', MATCH_OVERRIDE.countdownMs + 15000, 'suppressed torpedo impact');
    assert(b.boomsOnMe >= 1, 'no torpedo struck B during the ready room');
    assert(b.readyHpViolations === 0, 'B lost hp while weapons were safe');
    log.push(`weapons safe: ${b.boomsOnMe} boom(s) on B, zero hp lost`);

    // --- 3. countdown end -> active ------------------------------------------
    await runUntil(readyTick, () => phase(a) === 'active', MATCH_OVERRIDE.countdownMs + 10000, 'activation');
    a.activated = true;
    b.activated = true;
    b.parked = false; // clear the ready-room latch: B converges fresh from the ring
    await sleep(300); // a few frames of active state
    const ring = a.welcome.mapRadius * CONFIG.map.spawnFraction;
    for (const ctx of [a, b]) {
      assert(ctx.you.hp === CONFIG.shipClasses.cruiser.hp, `${ctx.name} not at full hp after reset`);
      const r = Math.hypot(ctx.you.x, ctx.you.y);
      assert(Math.abs(r - ring) < 60, `${ctx.name} not on the spawn ring (r=${r.toFixed(0)} vs ${ring.toFixed(0)})`);
    }
    assert(a.room.state.zoneState !== 'idle', 'storm timeline not anchored at activation');
    log.push(`active: hulls redeployed to the ring (r~${ring.toFixed(0)}u), full hp, zone=${a.room.state.zoneState}`);

    // --- 4. A sinks B; B spectates unfogged; A never spec'd early ------------
    // A hunts, B converges then parks (huntPeer) so A lands both fish quickly —
    // the ~90s storm grace leaves comfortable margin over the ~50s converge+two-
    // torpedo fight, so A (not the storm) is the one that sinks B. Once B is sunk
    // it spectates and sends nothing.
    const fightTick = () => {
      if (!a.results) strafeFire(a, b.sunkSeen ? null : b.you, !b.sunkSeen);
      if (b.sunkSeen || b.results) return;
      if (a.you && b.you && dist(a.you, b.you) <= 500) b.parked = true;
      if (b.parked || !b.you || !a.you) idle(b);
      else control(b, a.you, false);
    };
    // 120s budget: ample over the ~50s fight; absorbs a slow converge or a
    // missed pass before both fish connect (110 dmg vs 100 hp).
    await runUntil(fightTick, () => b.sunkSeen, 120000, 'A sinking B');
    assert(b.sunkBy === a.room.sessionId, `B sunk by ${b.sunkBy}, expected A`);
    await runUntil(fightTick, () => b.specFrames >= 5, 5000, 'B spec frames');
    assert(b.specWithYou === 0, 'a spec frame carried `you`');
    assert(b.specContactIds.has(a.room.sessionId), 'B spec frames never showed A unfogged');
    assert(a.specBeforeFinish === 0, 'A received a spec frame before the finishing sink');
    assert(b.specBeforeFinish === 0, 'B received a spec frame before its own sink frame');
    log.push(`B sunk by A; B got ${b.specFrames} spec frames (unfogged, no you); A spec'd only after the finish`);

    // --- 5. results ----------------------------------------------------------
    // A steers to and holds the tiny storm-floor pocket at map center
    // (steerToCenter) where it is permanently safe, while the storm mops up the 4
    // fill drones (which never throttle below 0.5 and so cannot loiter in the
    // pocket). A survives, so the match finishes with A the winner and ALL drones
    // sunk. We assert LIFECYCLE INVARIANTS, not the drone-vs-B sink race:
    // B's exact rank depends on which drone sinks when, so we bound it (2..6)
    // rather than pin it. The load-bearing checks are: A wins and is placement 1
    // (first, sorted); EVERY row is placed >= 1 (no alive placement-0 hull — the
    // proof all four drones storm-died); A is credited the kill + hull damage.
    const endgameTick = () => {
      if (!a.results) steerToCenter(a);
    };
    // 300s budget: with the 180s shrink the floor lands ~grace+shrink=270s after
    // go-live and the 120hp battleship drone dies ~6s later; step 5 begins ~55s
    // in, so it must run ~220s to the finish — 300s leaves comfortable headroom.
    await runUntil(endgameTick, () => a.results !== null && b.results !== null, 300000, 'results broadcast');
    const res = a.results;
    assert(res.winnerId === a.room.sessionId, `winnerId=${res.winnerId}, expected A`);
    const rowA = res.rows.find((r) => r.id === a.room.sessionId);
    const rowB = res.rows.find((r) => r.id === b.room.sessionId);
    assert(rowA.placement === 1, `A placement=${rowA.placement}, expected 1`);
    assert(res.rows[0].id === rowA.id, `rows not sorted / winner not first (rows[0]=${res.rows[0].id})`);
    assert(
      res.rows.every((r) => r.placement >= 1),
      `an unplaced (alive) hull remained — not every drone storm-died: ${JSON.stringify(res.rows.map((r) => r.placement))}`,
    );
    assert(rowB.placement >= 2 && rowB.placement <= res.rows.length, `B placement=${rowB.placement}, expected 2..${res.rows.length}`);
    for (let i = 1; i < res.rows.length; i++) {
      assert(res.rows[i].placement >= res.rows[i - 1].placement, 'rows not sorted ascending by placement');
    }
    assert(rowA.kills >= 1, `A kills=${rowA.kills}, expected >= 1`);
    assert(rowA.damageDealt >= CONFIG.shipClasses.cruiser.hp, `A damageDealt=${rowA.damageDealt} < ${CONFIG.shipClasses.cruiser.hp}`);
    log.push(`results: winner=ALPHA (1st, ${rowA.kills} kill, ${rowA.damageDealt}dmg); B placed ${rowB.placement}; all ${res.rows.length} hulls placed`);

    // --- 6. room disconnects after resultsMs ---------------------------------
    await runUntil(() => {}, () => a.leftCode !== null && b.leftCode !== null,
      MATCH_OVERRIDE.resultsMs + 8000, 'room disconnect after results');
    log.push(`room disconnected both clients (codes ${a.leftCode}/${b.leftCode}) after ~${MATCH_OVERRIDE.resultsMs}ms`);

    console.log('MATCH SMOKE OK:', { room: a.room.roomId, trace: log });
  } finally {
    killServer(server);
    await sleep(600);
    leaked = await portOpen(PORT);
    if (leaked) {
      // SIGTERM didn't free it — escalate to SIGKILL and re-check so we never
      // leave an orphan that squats the port for the next run.
      killServerHard(server);
      await sleep(600);
      leaked = await portOpen(PORT);
      if (leaked) console.error(`ERROR: port ${PORT} still open after SIGTERM+SIGKILL (leaked listener)`);
    }
  }
  process.exit(leaked ? 1 : 0);
}

main().catch((err) => {
  console.error('MATCH SMOKE FAILED:', err.message);
  process.exit(1);
});
