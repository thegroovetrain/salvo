// Match-lifecycle smoke — a SCRIPTED SCENARIO (Story 9.15). Self-boots the
// colyseus server on PORT 2599 (never the dev server's 2567), joins live
// @colyseus/sdk clients through the DEV door, and proves the full loop:
//   1. waiting -> GATHERING at the 2nd join: the room stays UNLOCKED for the
//      joinWindowMs override, so a 3rd client's joinOrCreate lands in the SAME
//      room. When the window elapses the countdown arms and the room LOCKS (a
//      4th client's joinOrCreate lands in a fresh room).
//   2. The ready room is weapons-safe: A's torpedo STRIKES B (a boom on B) but
//      B loses ZERO hp until the match activates.
//   3. countdown end -> active: both hulls redeployed (witnessed by the own
//      `spawn` event and A's refilled tubes), at their dev pose at full hp,
//      storm timeline anchored (zoneState leaves 'idle').
//   4. A sinks B: every hit on B is the fitted fish's damage, B's own sunk
//      event carries by=A, the fish count matches the kill plan derived from
//      CONFIG; B rides out its sinking window (Story 5.2, the amendment-17
//      reversal) and then receives spec:true frames (no `you`, A unfogged) —
//      the hold is measured in SERVER time (frame `t`) and must cover the
//      window; A NEVER receives a spec frame before the frame that reports B's sink.
//   5. results broadcast at B's FOUNDER (amendment 4): winnerId=A, A placed
//      1st and the FIRST row, B 2nd, exactly the TWO CAPTAINS, dense
//      placements, and a captains-only ROSTER (amendments 39/41). A's kills
//      >= 1 and damageDealt >= B's hull.
//   6. The room disconnects both clients ~resultsMs later (autoDispose).
// Then kills its own server process group and verifies port 2599 is free.
//
// WHY A SCRIPT, NOT A PILOT. This smoke used to sail two heuristic pilots
// (racetrack strafing, island-avoidance rudder bias, an unstick routine)
// from ring spawns ~8,000 u apart across a RANDOM map, with passive regen
// racing every single-tube kill — so its red runs were piloting outcomes, not sim defects. Now nothing
// sails: the map is PINNED (`mapSeed`), both hulls are PLACED by the dev-only
// `spawnOverride` pose (honored at spawn, at the countdown->active redeploy
// and at respawn), and the only inputs are scripted ones sent on the ordinary `i` channel, so
// they pass inputs.ts' sanitizeInput like any client's. Every number the
// smoke waits on (kill plan, budgets, the countdown) is READ from CONFIG and
// the same effectiveStats fold the server runs, at run time.
//
// THE TORPEDO IS PRE-FITTED by the DEV-ONLY `fitOverride` join option (Story
// 8.10, EPIC-8 amendment 65): every hull spawns with only its main battery
// (Story 10.4) and the seat's Shift, so A asks for `heavyTorpedo` explicitly; it lands in its
// FAMILY slot, the torpedo slot Q (Story 10.5). TWO tubes (Eric ruling 2026-10-22, Story
// 9.15 question 4 — a salvo lands inside the regen wait) come from the SECOND
// LAUNCHER TUBE one-off since Story 10.6 (R4 / R6: capacity left the tiers); the R8 passive regen is back since Story 10.5 and the plan
// replays it).
// The fit survives the activation redeploy (redeployEconomy re-applies it).
//
// Every dev option here (matchOverride, zoneOverride, mapSeed, fitOverride,
// spawnOverride) is honored only under HC_DEV_OPTIONS=1, which this script
// sets for the server it boots; the real client never sends any of them.
//
// SCOPE SINCE STORY 6.1 — THIS SMOKE COVERS THE DEV DOOR. A production client
// queues into StandardQueueRoom and arrives on a seat reservation (see
// queueSmoke.mjs); `joinOrCreate('arena')` survives only behind
// HC_DEV_OPTIONS=1. The step-1 gathering window and the "a locked room
// scatters a late joiner into a FRESH room" behavior are literally true OF THE
// DEV DOOR; in production CONFIG.match.joinWindow is 0 and the queue owns the
// wait (epic-6 amendments 1, 2 and 7).
//
// Run: node server/scripts/matchSmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import {
  CONFIG, DEFAULT_CLASS_ID, PROTOCOL_VERSION, bearing, angleDiff, generateMap, islandBlocksSegment, islandDistance,
  effectiveStats, equipmentMaxAmmo, equipmentReloadMs, damageMultiplierFor, familySlotFor, launcherArcHolds, regenGain, zoneRingRadii,
  launcherAimPoint, launcherStationWorld, torpedoLaunchPoint,
} from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 2599;
const endpoint = `ws://localhost:${PORT}`;
/** Hoisted so a failure prints how far the scenario got (weaponsSmoke's TRACE). */
const TRACE = [];

// --- the scenario, derived from CONFIG ----------------------------------------

/** The pinned map (fogSmoke's documented pin). Islands never travel on the
 *  wire, so the script rebuilds the same field from the welcome's seed. */
const MAP_SEED = 265;
/** Every client joins with no `cls` -> the server seats DEFAULT_CLASS_ID (Story
 *  10.4: Bismarck), so this smoke reads that hull's CONFIG row. */
const TB = CONFIG.shipClasses[DEFAULT_CLASS_ID];
/** Its full hull, from the same fold the server runs. */
const FULL_HP = effectiveStats(TB, []).maxHp;
const HULL_L = TB.hull.length;
const TORP = 'heavyTorpedo';
const TORP_SLOT = familySlotFor(TORP); // the torpedo FAMILY slot, Q (Story 10.5)
/** The smoke's own clear-water bound for the poses: mapgen suppresses land
 *  around the map centre, and both poses must sit well inside that. This is
 *  the smoke's bound, not a mapgen guarantee — the real precondition is the
 *  island-clearance + clear-lane check in assertLane(). */
const CENTER_FRACTION = 0.15;

/**
 * THE FIT: the torpedo, then the SECOND LAUNCHER TUBE one-off (Story 10.6, R6:
 * the fore launcher then holds TWO tubes, each on its own reload clock). The
 * tube count is read back from the same effectiveStats fold the server runs.
 */
const FIT = [TORP, 'secondLauncherTube'];
if (equipmentMaxAmmo(effectiveStats(TB, FIT), TORP) !== 2) throw new Error(`PRECONDITION: ${JSON.stringify(FIT)} does not fold to two tubes`);
const SHOOTER = effectiveStats(TB, FIT);
const TARGET = effectiveStats(TB, []); // B carries no fit: it only has to float
const FISH = {
  damage: SHOOTER.equipment[TORP].damage,
  speed: SHOOTER.equipment[TORP].speed,
  reloadMs: equipmentReloadMs(SHOOTER, TORP),
  tubes: equipmentMaxAmmo(SHOOTER, TORP),
};
/** The blow B's hull takes per fish: the server's armor curve over B's ARMOR
 *  minus A's POWER (Story 10.3 indices), floored to a whole number
 *  (World.floorBlow). */
const FISH_BLOW = Math.max(1, Math.floor(FISH.damage * damageMultiplierFor(TARGET.armor - SHOOTER.power)));

/**
 * THE LANE. B (the target) at the origin facing +x; A (the shooter) astern-west
 * of it on the x axis, heading −π/2, so B lies on A's BEAM — the middle of the
 * fore launcher's firing band (R28, Eric 2026-11-06: the launchers fire across
 * the beam, never dead ahead). d = three hull lengths: open water between A's
 * side and B's stern, so the fish spawns well clear of A (hull edge +
 * hitRadius + spawnClearance) and runs a short, straight lane, far inside
 * sight and a homing fish's travel budget.
 */
const D = 3 * HULL_L;
const B_POSE = { x: 0, y: 0, heading: 0 };
const A_POSE = { x: -D, y: 0, heading: -Math.PI / 2 };
/** The fore launcher's station and the click's aim point (B's centre). */
const LAUNCHER_AT = launcherStationWorld(DEFAULT_CLASS_ID, 0, A_POSE);
const AIM_AT = launcherAimPoint(A_POSE, DEFAULT_CLASS_ID, bearing(A_POSE, B_POSE), D);
/** rad — the WORLD bearing the trained fore launcher fires on: station -> aim point. */
const LAUNCH_BRG = Math.atan2(AIM_AT.y - LAUNCHER_AT.y, AIM_AT.x - LAUNCHER_AT.x);
/** Fish run from the fore launcher's launch point (clear of A's side by the
 *  launch clearance, Story 10.6) to B's stern, and its flight. */
const LAUNCH_AT = torpedoLaunchPoint(LAUNCHER_AT, A_POSE, DEFAULT_CLASS_ID, LAUNCH_BRG);
const FISH_RUN = Math.hypot(LAUNCH_AT.x - B_POSE.x, LAUNCH_AT.y - B_POSE.y) - HULL_L / 2 - 2 * CONFIG.torpedo.hitRadius;
const FLIGHT_MS = (FISH_RUN / FISH.speed) * 1000;
/** ms — the fore launcher swings its whole train interval inside this, plus two
 *  ticks of slack: it rests dead ahead, inside its own dead wedge, and must
 *  train onto the beam before a click fires (R13 / R28). */
const LAUNCHER_TRAIN_MS = Math.ceil((2 * TB.launchers.fore.trainDeg * 1000) / CONFIG.mainBattery.traverseDegPerS) + 2 * CONFIG.tick.simDtMs;
/** Socket + tick slack on every wait (join round-trips, frame delivery). */
const SLACK_MS = 5000;

/**
 * THE KILL PLAN (Eric ruling 2026-10-22, Story 9.15 question 4: derived from
 * CONFIG). A tick-stepped replay of the fight the server will run: A clicks
 * every tick, ONE loaded tube fires per click (the lowest), each tube reloads
 * on its own clock (Story 10.6, sim/launchers.ts) and each fish lands FLIGHT_MS later for
 * FISH_BLOW. 2026-11-05 (Story 10.5, R8): the PASSIVE REGEN is back — B,
 * unhurt for CONFIG.regen.outOfCombatMs, heals the shared regenGain every tick
 * (the heavy fish's reload outlasts the wait), so the replay heals it too.
 * Returns the fish B takes, the salvos (distinct firing moments) and the
 * simulated sink time.
 */
function killPlan() {
  const dt = CONFIG.tick.simDtMs;
  let hp = TARGET.maxHp;
  // ONE CLOCK PER TUBE (Story 10.6, R6): a fired tube reloads on its own.
  const tubes = new Array(FISH.tubes).fill(0);
  let lastFireAt = -Infinity;
  let salvos = 0;
  let fish = 0;
  let lastHit = 0;
  const inFlight = [];
  for (let t = 0; t < 3600000; t += dt) {
    if (t - lastHit >= CONFIG.regen.outOfCombatMs) hp += regenGain(hp, TARGET.maxHp, dt / 1000);
    for (let k = 0; k < tubes.length; k += 1) tubes[k] = Math.max(0, tubes[k] - dt);
    const k = tubes.findIndex((c) => c <= 0);
    if (k >= 0) {
      tubes[k] = FISH.reloadMs; // one click, one torpedo
      if (t - lastFireAt > dt) salvos += 1;
      lastFireAt = t;
      inFlight.push(t + FLIGHT_MS);
    }
    while (inFlight.length > 0 && inFlight[0] <= t) {
      inFlight.shift();
      hp -= FISH_BLOW;
      fish += 1;
      lastHit = t;
      if (hp <= 0) return { fish, salvos, sinkMs: t };
    }
  }
  throw new Error('PRECONDITION: the kill plan never sinks B');
}
const PLAN = killPlan();
/** The fight budget: one reload per salvo plus ONE reload of slack (AC 2). */
const FIGHT_BUDGET_MS = PLAN.salvos * FISH.reloadMs + FISH.reloadMs;

/**
 * Lifecycle timers. The countdown is what step 2 needs and nothing more: the
 * launcher's train onto the beam + the first fish's flight + one reload (a fish lost to a tick-phase race gets a
 * second chance) + socket slack. resultsMs short so the disposal is
 * observable. joinWindowMs is a small REAL window (unlike the other smokes'
 * 0): step 1 proves the gathering phase over real sockets; 5 s so the
 * post-join sleep + CHARLIE's join round-trip can't eat it on a slow box.
 */
const COUNTDOWN_MS = Math.ceil(LAUNCHER_TRAIN_MS + FLIGHT_MS + FISH.reloadMs + SLACK_MS);
const MATCH_OVERRIDE = { countdownMs: COUNTDOWN_MS, resultsMs: 3000, joinWindowMs: 5000 };
/**
 * The storm: offsetCap 0 keeps every ring concentric on the map centre, where
 * both poses sit, so the storm reaches a hull only once a ring SMALLER than
 * its distance from the centre starts closing — the close into ring k starts
 * at (4(k-1) + 3) x beatMs after activation. stormFreeMs() derives that window
 * from the same zoneRingRadii the server runs, and assertLane() requires it to
 * cover the fight budget plus B's sinking window (it does at today's CONFIG
 * with room to spare — see the printed plan — so beatMs is not widened).
 * Nothing here waits on closure any more (amendment 4 retired the storm
 * endgame), so beatMs only has to keep the storm off the fight.
 */
const ZONE_OVERRIDE = { beatMs: 45000, ringSteps: [1 / 3, 2 / 3], offsetCap: 0, terminalSightFactor: 0.04 };

function stormFreeMs(mapRadius) {
  const reach = Math.max(Math.hypot(A_POSE.x, A_POSE.y), Math.hypot(B_POSE.x, B_POSE.y)) + HULL_L / 2;
  const radii = zoneRingRadii(mapRadius, ZONE_OVERRIDE);
  for (let k = 1; k < radii.length; k += 1) {
    if (radii[k] < reach) return (4 * (k - 1) + 3) * ZONE_OVERRIDE.beatMs;
  }
  return Infinity;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
/** A failed precondition is a SCRIPT bug (a bad pose or plan), not a smoke fail. */
function precondition(cond, msg) {
  if (!cond) throw new Error(`PRECONDITION: ${msg}`);
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Socket round-trip allowance for a state/message to reach a client after the
 *  server changed it (join, phase flip): polled, never slept. */
const ROUNDTRIP_MS = 2000;
// --- server lifecycle --------------------------------------------------------

function bootServer() {
  const tsx = path.join(REPO, 'node_modules/.bin/tsx');
  const proc = spawn(tsx, ['src/index.ts'], {
    cwd: path.join(REPO, 'server'),
    detached: true, // own process group, so we can kill tsx + its node child
    // HC_DEV_OPTIONS=1 is required for the room to honor any dev option at all
    // (see server/src/rooms/roomOptions.ts) — without it they're stripped and
    // reported in rejectedKeys, and this smoke's assertions would fail.
    env: { ...process.env, NODE_ENV: 'development', PORT: String(PORT), HC_DEV_OPTIONS: '1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return proc;
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

/** Join through the dev door. Every join pins the map (room options ride the
 *  creating join); `pose`/`fit` are per-captain. */
async function joinClient(name, { pose, fit } = {}) {
  const client = new Client(endpoint);
  const opts = { name, pv: PROTOCOL_VERSION, mapSeed: MAP_SEED, matchOverride: MATCH_OVERRIDE, zoneOverride: ZONE_OVERRIDE };
  if (pose) opts.spawnOverride = pose;
  if (fit) opts.fitOverride = fit;
  const room = await client.joinOrCreate('arena', opts);
  const ctx = {
    name, room, welcome: null, you: null, firstYou: null, seq: 0, fireSeq: 0,
    frames: 0, specFrames: 0, specWithYou: 0, specContactIds: new Set(),
    specBeforeFinish: 0, seenPeerSunk: false, lastT: 0, sunkT: null, firstSpecT: null, resultsT: null, spawnsSeen: 0, peerId: null,
    boomsOnMe: 0, readyHpViolations: 0, activated: false, dmgActive: [],
    sunkSeen: false, sunkBy: 'UNSET', results: null, leftCode: null,
  };
  room.onMessage('w', (m) => (ctx.welcome = m));
  room.onMessage('f', (m) => onFrame(ctx, m));
  room.onMessage('r', (m) => {
    ctx.results = m;
    ctx.resultsT = ctx.lastT; // ResultsMsg carries no clock: the last frame's server time
  });
  // The server's RTT ping — no reply needed here; registered so the SDK does
  // not log "onMessage() not registered for type 'p'" every few seconds.
  room.onMessage('p', () => {});
  room.onLeave((code) => (ctx.leftCode = code));
  return ctx;
}

function onFrame(ctx, f) {
  ctx.frames += 1;
  ctx.lastT = f.t;
  const hasPeerSunk = ctx.peerId !== null && f.events.some((e) => e.k === 'sunk' && e.id === ctx.peerId);
  const hasOwnSunk = f.events.some((e) => e.k === 'sunk' && e.id === ctx.room.sessionId);
  if (f.spec) {
    ctx.specFrames += 1;
    if (ctx.firstSpecT === null) ctx.firstSpecT = f.t;
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
    if (ctx.firstYou === null) ctx.firstYou = f.you;
    if (!ctx.activated && f.you.hp < FULL_HP) ctx.readyHpViolations += 1;
  }
  for (const e of f.events) {
    if (e.k === 'boom' && e.hit === ctx.room.sessionId) ctx.boomsOnMe += 1;
    if (e.k === 'dmg' && e.id === ctx.room.sessionId && ctx.activated) ctx.dmgActive.push(e);
    if (e.k === 'spawn' && e.id === ctx.room.sessionId) ctx.spawnsSeen += 1;
    if (e.k === 'sunk' && e.id === ctx.room.sessionId) {
      ctx.sunkSeen = true;
      if (ctx.sunkT === null) ctx.sunkT = f.t;
      ctx.sunkBy = e.by;
    }
  }
}

/** A full legal InputMsg: dead stop, weapons cold (the fireSeq is not bumped). */
function input(ctx) {
  return { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, slot: TORP_SLOT, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false };
}

/** Send a dead-stop input. */
function idle(ctx) {
  ctx.room.send('i', input(ctx));
}

/** AIM WITHOUT A CLICK: dead stop, aim = the bearing to B, the fireSeq not
 *  bumped — the launchers chase the aim (R13) and nothing fires. */
function aimOnly(ctx) {
  ctx.room.send('i', { ...input(ctx), aim: bearing(A_POSE, B_POSE), aimDist: D });
}

/** True once A's fore launcher sits on LAUNCH_BRG (inside the battery's on-target tolerance). */
function trained(ctx) {
  const l = ctx.you?.launchers?.[0];
  const tol = (CONFIG.mainBattery.onTargetDeg * Math.PI) / 180;
  return l !== undefined && Math.abs(angleDiff(ctx.you.heading + l.a, LAUNCH_BRG)) <= tol;
}

/** TRAIN FIRST: aim (no click) until the fore launcher is on the aim. */
async function trainLauncher(a, b) {
  await runUntil(() => { aimOnly(a); idle(b); }, () => trained(a), LAUNCHER_TRAIN_MS + SLACK_MS, 'the fore launcher trains onto the beam');
}

/** THE SCRIPTED CLICK: dead stop, aim = the bearing to B (A's starboard beam by
 *  the pose), a fresh fireSeq edge every tick; the tube reload paces launches. */
function fire(ctx) {
  ctx.fireSeq += 1;
  // A positive aim distance names the area (Story 10.6: a torpedo click with
  // none is refused out-of-arc).
  ctx.room.send('i', { ...input(ctx), aim: bearing(A_POSE, B_POSE), aimDist: D });
}

function phase(ctx) {
  return ctx.room.state?.matchPhase ?? 'unknown';
}

/** Roster rows that are NOT one of the two captains — the independent oracle
 *  for amendment 41 over a real socket: the match-start drone fill is deleted
 *  outright (and the PvE fleet with it, Story 10.8), so the roster this smoke
 *  sees must be captains and nothing else. */
function nonCaptainRosterRows(ctx, captainIds) {
  const out = [];
  ctx.room.state.players.forEach((_meta, id) => {
    if (!captainIds.includes(id)) out.push(id);
  });
  return out;
}

async function runUntil(tick, done, timeoutMs, label) {
  const start = Date.now();
  while (!done()) {
    tick();
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(CONFIG.tick.simDtMs);
  }
}

/** The lane precondition on the pinned map: both poses on clear water well
 *  inside the centre, a hull length off every coast, no island across the
 *  A->B lane, and a storm-free window that covers the fight. */
function assertLane(welcome) {
  assert(welcome.mapSeed === MAP_SEED, `welcome mapSeed ${welcome.mapSeed} !== pinned ${MAP_SEED}`);
  const map = generateMap(welcome.mapSeed, welcome.playerCap);
  for (const [name, p] of [['A', A_POSE], ['B', B_POSE]]) {
    precondition(Math.hypot(p.x, p.y) <= CENTER_FRACTION * map.radius, `${name} pose outside ${CENTER_FRACTION} x map radius`);
    for (const isle of map.islands) {
      precondition(islandDistance(p, isle) >= HULL_L, `${name} pose within a hull length of the island at (${isle.x.toFixed(0)},${isle.y.toFixed(0)})`);
    }
  }
  for (const isle of map.islands) {
    precondition(!islandBlocksSegment(A_POSE, B_POSE, isle), `the island at (${isle.x.toFixed(0)},${isle.y.toFixed(0)}) blocks the A->B lane`);
  }
  const stormFree = stormFreeMs(map.radius);
  precondition(stormFree >= FIGHT_BUDGET_MS + CONFIG.ship.sinkingWindowMs,
    `storm-free window ${stormFree} ms < fight budget ${FIGHT_BUDGET_MS} ms + sinking window — widen beatMs`);
  return stormFree;
}

/** The pose/arc/fit precondition from each captain's FIRST `you` frame. */
function assertPoses(a, b) {
  for (const [ctx, pose] of [[a, A_POSE], [b, B_POSE]]) {
    const y = ctx.firstYou;
    assert(dist(y, pose) < 1 && Math.abs(angleDiff(y.heading, pose.heading)) < 1e-6,
      `${ctx.name} spawned at (${y.x.toFixed(1)},${y.y.toFixed(1)}) h=${y.heading.toFixed(3)}, not its dev pose`);
  }
  assert(a.firstYou.hp === SHOOTER.maxHp && b.firstYou.hp === TARGET.maxHp, `spawn hp A ${a.firstYou.hp} / B ${b.firstYou.hp}, expected ${SHOOTER.maxHp} / ${TARGET.maxHp} (shared fold vs server maxHp)`);
  const off = Math.abs(angleDiff(a.firstYou.heading, bearing(a.firstYou, B_POSE)));
  precondition(launcherArcHolds(DEFAULT_CLASS_ID, SHOOTER.torpedoLaunchers, a.firstYou.heading, bearing(a.firstYou, B_POSE)), `bearing to B is ${off.toFixed(3)} rad off A's bow — outside the fore launcher's firing band`);
  assert(JSON.stringify(a.firstYou.cards) === JSON.stringify(FIT), `A fitted ${JSON.stringify(a.firstYou.cards)}, expected ${JSON.stringify(FIT)}`);
  const pool = a.firstYou.ammo[TORP_SLOT];
  assert(pool !== null && pool.n === FISH.tubes, `A's slot ${TORP_SLOT} holds ${pool?.n} torpedoes, expected ${FISH.tubes} tubes`);
  // The launchers ride the own block (Story 10.6): one fore launcher, every tube loaded.
  const tubes = (a.firstYou.launchers ?? []).flatMap((l) => l.tubes);
  assert(tubes.length === FISH.tubes && tubes.every((t) => t === 0), `A's own launchers carry tubes ${JSON.stringify(tubes)}, expected ${FISH.tubes} loaded`);
}

function planLine(stormFree) {
  return `plan: seed ${MAP_SEED}, d=${D}u (3 hull lengths), fit ${JSON.stringify(FIT)} -> ${FISH.tubes} tubes, ` +
    `${FISH_BLOW} dmg/fish (${FISH.damage} x armor curve), reload ${FISH.reloadMs}ms, flight ~${FLIGHT_MS.toFixed(0)}ms; ` +
    `B ${TARGET.maxHp}hp, with regen -> ` +
    `${PLAN.fish} fish in ${PLAN.salvos} salvos (sim sink at ${(PLAN.sinkMs / 1000).toFixed(1)}s); ` +
    `fight budget ${FIGHT_BUDGET_MS}ms, countdown ${COUNTDOWN_MS}ms, storm-free ${stormFree}ms`;
}

/** Step 1 — waiting -> gathering (unlocked window) -> countdown + room lock. */
async function stepGathering() {
  const a = await joinClient('ALPHA', { pose: A_POSE, fit: FIT });
  await runUntil(() => {}, () => a.welcome !== null && phase(a) !== 'unknown', ROUNDTRIP_MS, 'welcome + room state');
  assert(phase(a) === 'waiting', `solo join should idle in waiting (got ${phase(a)})`);
  assert(a.welcome, 'no welcome message received');
  TRACE.push(planLine(assertLane(a.welcome)));
  const b = await joinClient('BRAVO', { pose: B_POSE });
  assert(a.room.roomId === b.room.roomId, 'A and B joined different rooms');
  a.peerId = b.room.sessionId;
  b.peerId = a.room.sessionId;
  await runUntil(() => {}, () => phase(a) === 'gathering', ROUNDTRIP_MS, 'gathering window opens at the 2nd join');
  assert(phase(a) === 'gathering', `2nd join should open the gathering window (got ${phase(a)})`);
  const gatherDeadline = a.room.state.countdownEndT;
  assert(gatherDeadline > 0, 'gathering deadline (countdownEndT) not set');
  // The gathering room is still UNLOCKED: a 3rd joinOrCreate lands in it.
  const c = await joinClient('CHARLIE');
  assert(c.room.roomId === a.room.roomId, 'gathering room bounced a 3rd client (window should be open)');
  await c.room.leave(); // 2 humans remain (>= min) — the window keeps running
  await runUntil(() => {}, () => phase(a) === 'countdown', MATCH_OVERRIDE.joinWindowMs + 10000, 'gathering window expiry -> countdown');
  // The deadline must have MOVED to the countdown's (a stale gathering
  // deadline would also be > 0 — assert re-arm, not mere presence).
  assert(a.room.state.countdownEndT > gatherDeadline, 'countdownEndT was not re-armed past the gathering deadline');
  const d = await joinClient('DELTA'); // locked room -> fresh room
  assert(d.room.roomId !== a.room.roomId, 'locked room accepted a 4th client');
  await d.room.leave();
  TRACE.push('gathering opened at 2nd join (CHARLIE joined the SAME room); window expiry armed the countdown; locked room bounced DELTA to a fresh room');
  return { a, b };
}

/** Step 2 — the ready room is weapons-safe: a fish strikes B, B loses nothing. */
async function stepReadyRoom(a, b) {
  await runUntil(() => {}, () => a.firstYou !== null && b.firstYou !== null, SLACK_MS, 'first own-ship frames');
  assertPoses(a, b);
  await trainLauncher(a, b);
  const readyTick = () => { fire(a); idle(b); };
  await runUntil(readyTick, () => b.boomsOnMe >= 1 || phase(a) === 'active', FLIGHT_MS + FISH.reloadMs + SLACK_MS, 'suppressed torpedo impact');
  assert(b.boomsOnMe >= 1, 'no torpedo struck B during the ready room');
  assert(b.readyHpViolations === 0, 'B lost hp while weapons were safe');
  TRACE.push(`weapons safe: ${b.boomsOnMe} boom(s) on B, zero hp lost`);
}

/** Step 3 — countdown end -> active: dev poses, full hp, tubes, zone anchored. */
async function stepActivation(a, b) {
  const calm = () => { idle(a); idle(b); };
  const spawns0 = { a: a.spawnsSeen, b: b.spawnsSeen }; // join-time spawns, before the redeploy
  await runUntil(calm, () => phase(a) === 'active', COUNTDOWN_MS + SLACK_MS, 'activation');
  a.activated = true;
  b.activated = true;
  // THE REDEPLOY WITNESSES: the server emits a `spawn` event to the own hull on
  // every redeploy (World.redeployShip), and A's tubes refill. The pose check
  // below is only a "did not drift" check — the hulls were posed already, so
  // it cannot prove a redeploy happened.
  await runUntil(calm, () => a.spawnsSeen > spawns0.a && b.spawnsSeen > spawns0.b, ROUNDTRIP_MS, 'own spawn event at the redeploy');
  assert(a.spawnsSeen > spawns0.a && b.spawnsSeen > spawns0.b, `redeploy not witnessed: spawn events A ${spawns0.a}->${a.spawnsSeen} / B ${spawns0.b}->${b.spawnsSeen}`);
  await sleep(300); // a few frames of active state
  for (const [ctx, pose] of [[a, A_POSE], [b, B_POSE]]) {
    assert(ctx.you.hp === FULL_HP, `${ctx.name} not at full hp after reset`);
    assert(dist(ctx.you, pose) < 2, `${ctx.name} not at its dev pose after the redeploy (${ctx.you.x.toFixed(1)},${ctx.you.y.toFixed(1)})`);
  }
  const pool = a.you.ammo[TORP_SLOT];
  assert(pool !== null && pool.n === FISH.tubes, `A's tubes not refilled at the redeploy (${pool?.n}/${FISH.tubes})`);
  assert(a.room.state.zoneState !== 'idle', 'storm timeline not anchored at activation');
  TRACE.push(`active: both hulls redeployed (own spawn events A ${a.spawnsSeen} / B ${b.spawnsSeen}) and still on their dev poses, full hp, ${FISH.tubes} tubes loaded, zone=${a.room.state.zoneState}`);
}

/** Step 4 — A sinks B on the planned fish; B spectates unfogged; A never spec'd early. */
async function stepSink(a, b) {
  // The redeploy put the launchers back at rest: train again before the first click.
  await trainLauncher(a, b);
  // A clicks every tick (the reload paces the fish); B sits still. Once B is
  // sunk it spectates and sends nothing, and A stands down.
  const fightTick = () => {
    if (!a.results) (b.sunkSeen ? idle(a) : fire(a));
    if (!b.sunkSeen && !b.results) idle(b);
  };
  await runUntil(fightTick, () => b.sunkSeen, FIGHT_BUDGET_MS, 'A sinking B');
  assert(b.sunkBy === a.room.sessionId, `B sunk by ${b.sunkBy}, expected A`);
  const blows = b.dmgActive.map((e) => e.amount);
  assert(blows.every((x) => x === FISH_BLOW), `B took blows ${JSON.stringify(blows)}, expected only ${FISH_BLOW}`);
  // Two-sided contract, NOT equality: the plan is a tick replay of the server,
  // so a reload timing nudge could flip an exact count without any contract
  // breaking. Lower bound = the arithmetic minimum (no fish wasted on
  // nothing); upper bound = the plan.
  const minFish = Math.ceil(TARGET.maxHp / FISH_BLOW);
  assert(blows.length >= minFish, `B sank on ${blows.length} fish, fewer than the arithmetic minimum ${minFish}`);
  assert(blows.length <= PLAN.fish, `B sank on ${blows.length} fish, more than the kill plan's ${PLAN.fish}`);
  assert(b.dmgActive[b.dmgActive.length - 1].hp === 0, 'the sinking blow did not leave B at 0 hp');
  // THE SINKING WINDOW HOLDS THE FINISH (Story 5.2 + the amendment-17
  // REVERSAL, Eric veto 2026-08-12): spec frames (and the results right behind
  // them) arrive only once B founders — the window plus socket slack.
  await runUntil(fightTick, () => b.specFrames >= 5, CONFIG.ship.sinkingWindowMs + 2 * SLACK_MS, 'B spec frames'); // wall-clock = timeout only
  // The hold, in SERVER time: B stays a fogged, firing hull for the whole window.
  const hold = b.firstSpecT - b.sunkT;
  const holdMin = CONFIG.ship.sinkingWindowMs - CONFIG.tick.simDtMs;
  assert(b.sunkT !== null && b.firstSpecT !== null, 'B never recorded its sunk / first spec frame time');
  assert(hold >= holdMin, `B's sinking window held ${hold} ms of server time, < ${holdMin} ms (window ${CONFIG.ship.sinkingWindowMs} ms less one tick)`);
  assert(b.specWithYou === 0, 'a spec frame carried `you`');
  assert(b.specContactIds.has(a.room.sessionId), 'B spec frames never showed A unfogged');
  assert(a.specBeforeFinish === 0, 'A received a spec frame before the finishing sink');
  assert(b.specBeforeFinish === 0, 'B received a spec frame before its own sink frame');
  TRACE.push(`B sunk by A on ${blows.length} fish of ${FISH_BLOW} (min ${minFish}, plan ${PLAN.fish}); B held ${hold} ms of server time (>= ${holdMin}) before ${b.specFrames} spec frames (unfogged, no you); A spec'd only after the finish`);
}

/** Step 5 — results at B's FOUNDER (amendment 4): captains only, dense placements. */
async function stepResults(a, b) {
  await runUntil(() => {}, () => a.results !== null && b.results !== null, 10000, 'results broadcast');
  const res = a.results;
  // Results arrive no earlier than the first spec frame (the match holds open).
  // `r` carries no clock, so its time is the last frame BEFORE it: the broadcast
  // shares a tick with the first spec frame, hence one tick of resolution.
  assert(b.resultsT + CONFIG.tick.simDtMs >= b.firstSpecT, `results reached B at server t=${b.resultsT}, before its first spec frame at t=${b.firstSpecT}`);
  assert(res.winnerId === a.room.sessionId, `winnerId=${res.winnerId}, expected A`);
  const rowA = res.rows.find((r) => r.id === a.room.sessionId);
  const rowB = res.rows.find((r) => r.id === b.room.sessionId);
  assert(rowA && rowB, `results rows missing A/B (rows: ${res.rows.map((r) => r.id).join(',')})`);
  assert(rowA.placement === 1, `A placement=${rowA.placement}, expected 1`);
  // THE RULING over real sockets (Eric 2026-08-11, superseding amendment 8):
  // the results table is CAPTAINS ONLY and placement is captain-relative.
  assert(rowB.placement === 2, `B placement=${rowB.placement}, expected 2`);
  assert(res.rows[0].id === rowA.id, `winner is not the first row (got ${res.rows[0].id})`);
  assert(res.rows.length === 2, `expected exactly the 2 captains, got ${res.rows.length} rows`);
  assert(res.rows.every((r) => r.placement >= 1), `a row was left unplaced: ${JSON.stringify(res.rows.map((r) => [r.id, r.placement]))}`);
  // Dense 1..N with no duplicates and no gaps — the partition invariant.
  const seen = res.rows.map((r) => r.placement).sort((x, y) => x - y);
  assert(seen.every((p, i) => p === i + 1), `placements are not the dense range 1..${res.rows.length}: ${seen.join(',')}`);
  // The independent oracle (Story 5.6, amendment 41): the roster is
  // CAPTAINS ONLY — no fill exists.
  const strays = nonCaptainRosterRows(a, [a.room.sessionId, b.room.sessionId]);
  assert(strays.length === 0, `roster carried ${strays.length} non-captain row(s): ${JSON.stringify(strays)} (amendment 41)`);
  for (let i = 1; i < res.rows.length; i++) {
    assert(res.rows[i].placement >= res.rows[i - 1].placement, 'rows not sorted ascending by placement');
  }
  assert(rowA.kills >= 1, `A kills=${rowA.kills}, expected >= 1`);
  assert(rowA.damageDealt >= TARGET.maxHp, `A damageDealt=${rowA.damageDealt} < ${TARGET.maxHp}`);
  TRACE.push(
    `results: winner=ALPHA (1st row, ${rowA.kills} kill, ${rowA.damageDealt}dmg); ` +
    `B placed ${rowB.placement} of ${res.rows.length} rows — both CAPTAINS, dense 1..2; roster is CAPTAINS ONLY`,
  );
}

/** Step 6 — the room disconnects both clients after resultsMs (autoDispose). */
async function stepDispose(a, b) {
  await runUntil(() => {}, () => a.leftCode !== null && b.leftCode !== null, MATCH_OVERRIDE.resultsMs + 8000, 'room disconnect after results');
  TRACE.push(`room disconnected both clients (codes ${a.leftCode}/${b.leftCode}) after ~${MATCH_OVERRIDE.resultsMs}ms`);
}

async function scenario() {
  const { a, b } = await stepGathering();
  await stepReadyRoom(a, b);
  await stepActivation(a, b);
  await stepSink(a, b);
  await stepResults(a, b);
  await stepDispose(a, b);
  return a.room.roomId;
}

async function main() {
  // Pre-boot guard (mirrors metricsSmoke): refuse to boot when a foreign
  // listener already holds the port, so we never touch a process we didn't
  // start and never assert against someone else's room state.
  assert(!(await portOpen(PORT)), `port ${PORT} is already in use — refusing to boot (won't touch a foreign listener)`);
  const started = Date.now();
  const server = bootServer();
  let leaked = false;
  try {
    await waitForServer(15000);
    const roomId = await scenario();
    console.log('MATCH SMOKE OK:', { room: roomId, wallMs: Date.now() - started, trace: TRACE });
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
  const bug = err.message.startsWith('PRECONDITION:');
  console.error(bug ? 'MATCH SMOKE SCRIPT BUG:' : 'MATCH SMOKE FAILED:', err.message);
  console.error('trace so far:', TRACE);
  process.exit(1);
});
