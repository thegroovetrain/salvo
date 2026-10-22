// Weapons smoke: live @colyseus/sdk clients against a running dev server,
// exercising torpedoes, mines and the three deck guns end to end — as
// SCRIPTED SCENARIOS (Story 9.15). "A smoke places, it does not sail."
//
// WHY IT USED TO FLAKE. Every hull carried a heuristic pilot (rendezvous to
// the midpoint, hold-station loiter, island-avoid rudder bias, nearest-mine
// chase) on a RANDOM map, while the 60 s PvE fleet wave and passive regen
// raced every kill — so a red run measured the piloting, not the weapon.
// Now nothing sails by heuristic: every phase gets its OWN fresh room on a
// PINNED map (`mapSeed`), every hull is PLACED by the dev-only `spawnOverride`
// pose, the fleet wave is off (`matchOverride.fleetWaves: false`), and the
// inputs are scripted per phase through the ordinary `i` channel (so they pass
// `inputs.ts`' sanitizeInput like any client's).
//
// THE PHASES (each in its own room; every number READ from CONFIG or from the
// same `effectiveStats()` fold the server uses, never typed here):
//   1. TORPEDO KILL + NEVER A BLIP — a Torpedo Boat posed dead astern of a
//      stationary Mine Layer, bow on the bearing, clicks the heavy tube every
//      tick. The KILL PLAN (fish count, time) is simulated below from the
//      fitted row, the target's hp and its passive regen, and printed; the
//      budget is the plan plus one reload. Asserts a hit at the row's damage,
//      the roster death + kill, and that no torpedo id ever shows as a blip.
//   2. MINE VISIBILITY + NO EVICTION — a stationary Mine Layer clicks naval
//      mines astern (inside `placeRange`, spread over the rear sector) while a
//      stationary observer sits at a FIXED point inside detect. Asserts SIX own
//      mines live at once (Story 8.4 deleted every mine cap) and that the
//      observer never sees an enemy mine beyond `CONFIG.vision.detect`.
//   3. MINE AMBUSH — the layer lays ONE mine; after it arms, the victim joins
//      posed beyond detect on a straight line THROUGH the mine and sails it at
//      `throttle 1, rudder 0`. Asserts the mine's damage, a boom, and that the
//      mine was first sighted inside detect.
//   4. LIGHT TORPEDO — the target posed on the shooter's PORT BEAM (heading +
//      π/2), inside the twin beam sector by construction; kill plan as in 1.
//   5. CAPTIVE MINE — the layer lays one captive; the victim drives straight
//      through its trip ring. Asserts the captive row's damage, a boom, and
//      that the mine was expended.
//   6. THE THREE GUNS — one room per seat gun (`gun` join option, EMPTY fit),
//      shooter and target stationary inside the gun's full-damage band.
//      Cannon/flak: one click per reload; machine gun: `held: true` for a
//      derived window, `fireSeq` stays 0. Asserts the CONFIG damage, every
//      shell reveal's family `w`, and the MG's zero click edges.
//
// THE WEAPONS ARE PRE-FITTED through the DEV-ONLY `fitOverride` join option
// (Story 8.10, EPIC-8 amendment 65): the fitted line lands in slot 2 (Q) under
// the Story 8.5 nine-slot fixed roles [gun, boost, <fitted weapon>, ...].
//
// A `PRECONDITION:` failure is a SCRIPT BUG (a pose that missed the island-free
// center disc, a target outside an arc), not a smoke failure.
//
// Run against a booted server with HC_DEV_OPTIONS=1 in ITS env — every dev
// option here is otherwise stripped (server/src/rooms/roomOptions.ts):
//   cd server && HC_DEV_OPTIONS=1 PORT=2699 ../node_modules/.bin/tsx src/index.ts
//   WS_URL=ws://localhost:2699 node server/scripts/weaponsSmoke.mjs
import { Client } from '@colyseus/sdk';
import {
  CONFIG,
  MSG,
  PROTOCOL_VERSION,
  angleDiff,
  arcFor,
  bearing,
  effectiveStats,
  generateMap,
  islandBlocksSegment,
  islandDistance,
  twinSectorSide,
} from '@salvo/shared';

const endpoint = process.env.WS_URL || 'ws://localhost:2567';
const DETECT = CONFIG.vision.detect; // Story 4.9: the mine/torpedo detect rung (= sight since Story 9.8)
const DT = CONFIG.tick.simDtMs;

/** The pinned map (fogSmoke's seed). */
const MAP_SEED = 265;
const MAP = generateMap(MAP_SEED, CONFIG.map.playerCap);
/** mapgen keeps INNER_FRACTION (0.15) of the map radius island-free by
 *  construction (server/src/game/spawn.ts) — every pose lives in that disc. */
const CENTER_DISC_U = 0.15 * MAP.radius;
/** u — a pose's minimum clearance from any island edge (a hull half-length). */
const POSE_CLEARANCE_U = 60;

/** How many of the layer's mines must be LIVE AT ONCE for the no-eviction pin
 *  to bite: one past the per-player cap of 5 that Story 8.4 deleted. */
const NO_EVICTION_MINES = 6;

/** Eric's ruling 4 (2026-10-22): a smoke may stack a torpedo line to TIER III. */
const MAX_SMOKE_CARDS = 3;

// Sandbox (dev-only): no match lifecycle, permissive combat policy, storm at
// the 2nd join. The 10-minute beat parks the first close 30 minutes out, so
// every phase runs on the full-map ring.
const SANDBOX_ZONE = { beatMs: 600000, ringSteps: [1 / 3, 2 / 3], offsetCap: 1, terminalSightFactor: 2 };
const MATCH_OVERRIDE = { sandbox: true, fleetWaves: false };

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function precondition(cond, msg) {
  if (!cond) throw new Error(`PRECONDITION: ${msg}`);
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

/** The phase trace, hoisted so a FAILED run still prints what passed. */
const TRACE = [];

/**
 * Join one client. `opts.fit` — the dev fit (`fitOverride`, epic-8 amendment
 * 65); `opts.pose` — the dev spawn pose; `opts.roomId` — join THAT room by id,
 * else CREATE a fresh one; `opts.gun` — the seat's gun join option.
 */
async function joinClient(name, cls, opts) {
  const client = new Client(endpoint);
  const joinOpts = {
    name,
    pv: PROTOCOL_VERSION,
    cls,
    mapSeed: MAP_SEED,
    fitOverride: [...opts.fit],
    matchOverride: MATCH_OVERRIDE,
    zoneOverride: SANDBOX_ZONE,
    spawnOverride: opts.pose,
  };
  if (opts.gun !== undefined) joinOpts.gun = opts.gun;
  const room = opts.roomId ? await client.joinById(opts.roomId, joinOpts) : await client.create('arena', joinOpts);
  const ctx = {
    name,
    cls,
    fit: opts.fit,
    pose: opts.pose,
    room,
    welcome: null,
    you: null,
    mines: [],
    booms: [],
    dmg: [],
    torpIds: new Set(),
    blipIds: new Set(),
    shellW: [], // Story 8.15: the gun family `w` of every shell reveal this client is shown
    seq: 0,
    fireSeq: 0,
    script: idle,
    mineLeakBeyondDetect: 0, // enemy mine seen at dist > detect (must stay 0 — Story 4.9)
    maxConcurrentEnemy: 0,
    maxConcurrentOwn: 0, // most of THIS ship's OWN mines live at once (Story 8.4)
    distinctEnemy: new Set(),
    distinctOwn: new Set(),
    firstSeenDist: new Map(), // enemy mineId -> distance at first sighting
  };
  room.onMessage(MSG.welcome, (m) => {
    ctx.welcome = m;
  });
  room.onMessage(MSG.frame, (m) => onFrame(ctx, m));
  // Every other server->client type is a no-op here (the D1 ping loop's 'p',
  // results, queue/lobby chatter) — registered so the SDK does not warn.
  for (const t of Object.values(MSG)) if (t !== MSG.welcome && t !== MSG.frame) room.onMessage(t, () => {});
  return ctx;
}

function onFrame(ctx, f) {
  if (f.you) ctx.you = f.you;
  ctx.mines = f.mines;
  for (const e of f.events) {
    if (e.k === 'boom') ctx.booms.push(e);
    else if (e.k === 'dmg') ctx.dmg.push(e);
    else if (e.k === 'torp') ctx.torpIds.add(e.id);
    else if (e.k === 'blip') ctx.blipIds.add(e.id);
    else if (e.k === 'shell') ctx.shellW.push(e.w);
  }
  trackEnemyMines(ctx);
}

/** Mine-visibility tallies from this frame's mine list. TWO TALLIES, two
 *  jobs: the ENEMY tally is the FOG pin (what this client sees of another
 *  layer's field, and at what range); the OWN tally is the NO-EVICTION pin
 *  (Story 8.4) — a captain's own mines are disclosed at any range, so its own
 *  count is a true board count with no geometry in it. */
function trackEnemyMines(ctx) {
  if (!ctx.you) return;
  let concurrent = 0;
  let own = 0;
  for (const m of ctx.mines) {
    if (m.own) {
      own++;
      ctx.distinctOwn.add(m.id);
      continue;
    }
    concurrent++;
    ctx.distinctEnemy.add(m.id);
    const d = dist(ctx.you, m);
    if (!ctx.firstSeenDist.has(m.id)) ctx.firstSeenDist.set(m.id, d);
    if (d > DETECT + 1) ctx.mineLeakBeyondDetect++;
  }
  if (concurrent > ctx.maxConcurrentEnemy) ctx.maxConcurrentEnemy = concurrent;
  if (own > ctx.maxConcurrentOwn) ctx.maxConcurrentOwn = own;
}

// --- scripted inputs --------------------------------------------------------

function neutralInput(ctx) {
  return { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false };
}
/** A stationary hull. */
function idle() {}
/** Click the fitted weapon (slot 2) at a CONSTANT bearing every tick — the
 *  reload paces launches; an empty-pool click is a harmless denial. */
const clickAt = (aim, aimDist = 0) => (ctx, inp) => {
  inp.slot = 2;
  inp.aim = aim;
  inp.aimDist = aimDist;
  inp.fireSeq = ++ctx.fireSeq;
};
/** Sail straight ahead on the posed heading. */
function sailAhead(_ctx, inp) {
  inp.throttle = 1;
}

function roster(room, id) {
  return room.state.players.get(id);
}

/** Send every client its scripted input once per sim tick until `done()`. */
async function pilotUntil(clients, done, timeoutMs, label, tickFn) {
  const start = Date.now();
  while (!done()) {
    for (const c of clients) {
      const inp = neutralInput(c);
      c.script(c, inp);
      c.room.send(MSG.input, inp);
    }
    tickFn?.();
    if (Date.now() - start > timeoutMs) throw new Error(`timeout (${secs(timeoutMs)}): ${label}`);
    await sleep(DT);
  }
  return Date.now() - start;
}

/** Keep sending every client its scripted input for `ms` (a fixed wait). */
async function holdFor(clients, ms) {
  const until = Date.now() + ms;
  await pilotUntil(clients, () => Date.now() >= until, ms + 5000, 'hold');
}

// --- placement preconditions ------------------------------------------------

/** A pose is legal for a scripted scenario: inside the island-free center
 *  disc and clear of every island edge on the pinned map. */
function checkPoseWater(label, p) {
  precondition(Math.hypot(p.x, p.y) <= CENTER_DISC_U, `${label} pose (${p.x.toFixed(0)},${p.y.toFixed(0)}) outside the ${CENTER_DISC_U.toFixed(0)}u center disc`);
  for (const isle of MAP.islands) {
    precondition(islandDistance(p, isle) > POSE_CLEARANCE_U, `${label} pose within ${POSE_CLEARANCE_U}u of an island`);
  }
}
function checkLane(label, a, b) {
  for (const isle of MAP.islands) precondition(!islandBlocksSegment(a, b, isle), `${label}: an island blocks the lane`);
}

/** Wait for every client's welcome + first `you`, then check each landed on
 *  its pose (the dev door honored `spawnOverride`) on the pinned map. */
async function awaitPosed(clients, label) {
  // Budget: a join's welcome and first frame arrive within a few ticks; 5 s is
  // a socket allowance, not a sim cadence.
  await pilotUntil(clients, () => clients.every((c) => c.welcome && c.you), 5000, `${label}: first frames`);
  for (const c of clients) {
    precondition(c.welcome.mapSeed === MAP_SEED, `${label}: ${c.name} got mapSeed ${c.welcome.mapSeed}, expected ${MAP_SEED} (is HC_DEV_OPTIONS=1 set on the server?)`);
    const off = dist(c.you, c.pose);
    precondition(off < 2 && Math.abs(angleDiff(c.you.heading, c.pose.heading)) < 0.01,
      `${label}: ${c.name} spawned at (${c.you.x.toFixed(0)},${c.you.y.toFixed(0)},${c.you.heading.toFixed(2)}), not its pose — spawnOverride stripped?`);
  }
}

async function leaveAll(clients) {
  for (const c of clients) await c.room.leave();
}

// --- kill plans -------------------------------------------------------------

/**
 * THE KILL PLAN, simulated from CONFIG/the fold (Eric ruling 4, 2026-10-22):
 * a shooter clicking every tick from a FULL pool of `maxAmmo` (one launch per
 * tick at most; the pool refills ONE round per `reloadMs` — equipment/ammo.ts),
 * each fish landing `flightMs` after launch for `damage`, against a target of
 * `hp` that regains `regen.missingPctPerS` of its MISSING hull per second once
 * `regen.outOfCombatMs` have wholly passed since its last hit (World.tickRegen
 * / regenDue). Returns the fish needed, the kill time and whether the kill
 * landed inside one regen wait (no regen tick ever credited).
 */
function killPlan({ hp, damage, maxAmmo, reloadMs, flightMs, regen }) {
  let t = 0;
  let n = maxAmmo;
  let left = 0;
  let cur = hp;
  let lastHit = -Infinity;
  let firstHit = null;
  let hits = 0;
  let regenTicks = 0;
  const pending = [];
  while (t < 3_600_000) {
    if (n > 0) {
      n -= 1;
      if (left <= 0) left = reloadMs;
      pending.push(t + flightMs);
    }
    t += DT;
    if (n < maxAmmo) {
      left -= DT;
      if (left <= 0) {
        n += 1;
        left = n < maxAmmo ? left + reloadMs : 0;
      }
    } else left = 0;
    while (pending.length > 0 && pending[0] <= t) {
      pending.shift();
      cur -= damage;
      hits += 1;
      lastHit = t;
      firstHit ??= t;
      if (cur <= 0) return { fish: hits, killAtMs: t, insideRegenWait: regenTicks === 0 };
    }
    if (lastHit <= t - DT - regen.outOfCombatMs && cur < hp) {
      cur += (hp - cur) * regen.missingPctPerS * (DT / 1000);
      if (firstHit !== null) regenTicks += 1;
    }
  }
  throw new Error(`PRECONDITION: no kill inside an hour (damage ${damage} vs hp ${hp} with regen)`);
}

/**
 * Pick the torpedo fit: the smallest card stack (≤ tier III) that gives TWO
 * tubes, IF its plan lands the kill inside one regen wait; otherwise one card
 * (tier I). Both plans go to the trace.
 */
function torpedoFit(line, shooterCls, target, rangeU) {
  const tgt = effectiveStats(CONFIG.shipClasses[target.cls], target.fit);
  const planFor = (cards) => {
    const row = effectiveStats(CONFIG.shipClasses[shooterCls], Array(cards).fill(line)).equipment[line];
    const flightMs = (rangeU / row.speed) * 1000;
    return { cards, row, plan: killPlan({ hp: tgt.maxHp, damage: row.damage, maxAmmo: row.maxAmmo, reloadMs: row.reloadMs, flightMs, regen: tgt.regen }) };
  };
  const one = planFor(1);
  let two = null;
  for (let k = 1; k <= MAX_SMOKE_CARDS && two === null; k++) {
    const p = planFor(k);
    if (p.row.maxAmmo >= 2) two = p;
  }
  const pick = two !== null && two.plan.insideRegenWait ? two : one;
  const fmt = (p) => `${p.cards} card(s) tier ${p.row.tier}: ${p.row.maxAmmo} tube(s) x ${p.row.damage} dmg / ${secs(p.row.reloadMs)} -> ${p.plan.fish} fish, kill at ${secs(p.plan.killAtMs)}${p.plan.insideRegenWait ? ' (inside one regen wait)' : ' (regen races it)'}`;
  return {
    pick,
    hp: tgt.maxHp,
    text: `plan vs ${tgt.maxHp} hp, regen ${tgt.regen.missingPctPerS * 100}%/s of missing after ${secs(tgt.regen.outOfCombatMs)}: ` +
      `[${fmt(one)}]` + (two ? ` [${fmt(two)}]` : ' [no two-tube tier <= III]') + ` => fitting ${pick.cards} card(s)`,
  };
}

// --- phases -----------------------------------------------------------------

/** PHASE 1 — heavy torpedo kill + torpedoes never blip. */
async function torpedoPhase(log) {
  // u — inside the heavy fish's run: a tier-I straight-runner has NO max range
  // (torpedoCore: range = Infinity); a homing tier carries
  // CONFIG.torpedo.homingMaxRangeU. Inside sight, so the target sees the fish.
  const D = 300;
  const target = { cls: 'mineLayer', fit: [] };
  const fit = torpedoFit('heavyTorpedo', 'torpedoBoat', target, D);
  log.push(`torpedo: ${fit.text}`);
  const row = fit.pick.row;
  const runU = row.homingTurnRate > 0 ? CONFIG.torpedo.homingMaxRangeU : Infinity;
  const aPose = { x: -D, y: 0, heading: 0 };
  const bPose = { x: 0, y: 0, heading: Math.PI / 2 }; // broadside to the shooter
  checkPoseWater('torpedo A', aPose);
  checkPoseWater('torpedo B', bPose);
  checkLane('torpedo', aPose, bPose);
  precondition(D < runU && D < CONFIG.vision.sight, `torpedo: range ${D}u outside the run (${runU}) or sight`);
  const a = await joinClient('WPN-A', 'torpedoBoat', { fit: Array(fit.pick.cards).fill('heavyTorpedo'), pose: aPose });
  const b = await joinClient('WPN-B', target.cls, { fit: target.fit, pose: bPose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'torpedo');
  const brg = bearing(a.you, b.you);
  precondition(Math.abs(angleDiff(a.you.heading, brg)) < CONFIG.torpedo.halfArc, 'torpedo: target outside the bow arc');
  precondition(b.you.hp === fit.hp, `torpedo: target hp ${b.you.hp} != planned ${fit.hp}`);
  a.script = clickAt(brg);
  // Budget: the simulated kill time + ONE reload of slack.
  const budget = fit.pick.plan.killAtMs + row.reloadMs;
  const took = await pilotUntil([a, b], () => roster(a.room, b.room.sessionId)?.deaths >= 1, budget, 'torpedo kill');
  const hits = b.dmg.filter((d) => d.amount === row.damage);
  const kills = roster(a.room, a.room.sessionId).kills;
  log.push(`torpedo: B sank in ${secs(took)} (budget ${secs(budget)}); ${row.damage}-dmg hits=${hits.length} kills=${kills}`);
  assert(hits.length >= 1, `no ${row.damage}-damage torpedo hit recorded on B`);
  assert(kills >= 1, 'the torpedo kill is not on the shooter\'s roster row');
  // Torpedoes must NEVER appear as radar blips.
  assert(b.torpIds.size > 0, 'B never saw a torpedo (test would be vacuous)');
  for (const id of b.torpIds) assert(!b.blipIds.has(id), `torpedo ${id} appeared as a radar blip!`);
  log.push(`torpedo: B saw ${b.torpIds.size} torps, ${b.blipIds.size} blips, zero overlap`);
  await leaveAll([a, b]);
}

/** The naval rack's placement aim for the k-th drop: dead astern, fanned
 *  across the rear sector so the drops do not stack on one point. */
function astern(heading, k) {
  return heading + Math.PI + ((k % 5) - 2) * 0.2;
}
const DROP_U = CONFIG.mine.placeRange * 0.6; // comfortably inside placeRange

/** PHASE 2 — mine visibility + no eviction. */
async function minePhase(log) {
  const layerPose = { x: 0, y: 0, heading: 0 };
  // FIXED observer: every legal drop lies within placeRange of the layer, so
  // an observer within (detect − placeRange) of the layer has the whole field
  // inside detect; and far outside any trigger ring.
  const obsPose = { x: 0, y: 300, heading: 0 };
  checkPoseWater('mine layer', layerPose);
  checkPoseWater('mine observer', obsPose);
  precondition(dist(layerPose, obsPose) + CONFIG.mine.placeRange < DETECT, 'mine: observer cannot see the whole drop zone inside detect');
  const rack = effectiveStats(CONFIG.shipClasses.mineLayer, ['navalMines']).equipment.navalMines;
  precondition(dist(layerPose, obsPose) - CONFIG.mine.placeRange > rack.triggerRadius + 50, 'mine: observer inside a trip ring');
  const a = await joinClient('MINE-A', 'mineLayer', { fit: ['navalMines'], pose: layerPose });
  const b = await joinClient('MINE-B', 'torpedoBoat', { fit: [], pose: obsPose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'mine');
  a.script = (ctx, inp) => clickAt(astern(ctx.pose.heading, ctx.distinctOwn.size), DROP_U)(ctx, inp);
  // Budget: NO_EVICTION_MINES drops at one per CONFIG.mine.reloadMs is an upper
  // bound on the rack's cadence (it starts full, so it is faster), + armDelay,
  // + ONE reload of slack.
  const budget = NO_EVICTION_MINES * rack.reloadMs + CONFIG.mine.armDelay + rack.reloadMs;
  const took = await pilotUntil([a, b], () => a.maxConcurrentOwn >= NO_EVICTION_MINES, budget, `A hold ${NO_EVICTION_MINES} mines live at once`);
  log.push(
    `mines: A held ${a.maxConcurrentOwn} own mines live at once (${a.distinctOwn.size} laid) in ${secs(took)} (budget ${secs(budget)}, rack ${rack.maxAmmo} / ${secs(rack.reloadMs)}); ` +
      `B saw ${b.distinctEnemy.size} distinct A-mines, max ${b.maxConcurrentEnemy} at once, leaksBeyondDetect=${b.mineLeakBeyondDetect}`,
  );
  assert(b.mineLeakBeyondDetect === 0, 'B saw an enemy mine beyond detect range (radar/fog leak — Story 4.9 bar)');
  assert(b.distinctEnemy.size > 0, 'B never saw an enemy mine inside detect (the fog pin would be vacuous)');
  // NO EVICTION (Story 8.4, FR57/AR48): SIX LAID, SIX LIVE — under the retired
  // per-player cap of 5 this high-water mark could never pass 5.
  assert(a.maxConcurrentOwn >= NO_EVICTION_MINES, `A never held ${NO_EVICTION_MINES} of its own mines at once (max ${a.maxConcurrentOwn}) — eviction may be back`);
  await leaveAll([a, b]);
}

/** Lay exactly ONE mine of the fitted kind astern; return it once armed. */
async function layOne(a, label) {
  a.script = (ctx, inp) => {
    if (!ctx.mines.some((m) => m.own)) clickAt(astern(ctx.pose.heading, 2), DROP_U)(ctx, inp);
  };
  // Budget: the rack starts loaded — a few ticks; one reload of slack.
  const rowId = a.fit[0];
  const reloadMs = effectiveStats(CONFIG.shipClasses[a.cls], a.fit).equipment[rowId].reloadMs;
  await pilotUntil([a], () => a.mines.some((m) => m.own), reloadMs, `${label}: one mine laid`);
  const laid = a.mines.find((m) => m.own);
  a.script = idle;
  // Let it arm (CONFIG.mine.armDelay — the shared chassis) + two ticks.
  await holdFor([a], CONFIG.mine.armDelay + 2 * DT);
  return laid;
}

/** Pose a victim beyond detect on a straight line through `mine`, heading at
 *  it; the line runs along −y so it passes the layer (at the origin) wide. */
function victimPoseThrough(mine) {
  const approach = DETECT + 100; // u — starts OUTSIDE detect: the first sighting is a real fog crossing
  return { pose: { x: mine.x, y: mine.y + approach, heading: -Math.PI / 2 }, approach };
}

/** Time (ms) for a hull from rest to cover `u` at full throttle — the class
 *  kinematics (accel to maxSpeed, then cruise). */
function sailMs(cls, u) {
  const k = effectiveStats(CONFIG.shipClasses[cls], []).kinematics;
  const accelU = (k.maxSpeed * k.maxSpeed) / (2 * k.accel);
  if (u <= accelU) return Math.sqrt((2 * u) / k.accel) * 1000;
  return (k.maxSpeed / k.accel + (u - accelU) / k.maxSpeed) * 1000;
}

/** PHASE 3 — the mine ambush. */
async function ambushPhase(log) {
  const layerPose = { x: 0, y: 0, heading: 0 };
  checkPoseWater('ambush layer', layerPose);
  const a = await joinClient('AMB-A', 'mineLayer', { fit: ['navalMines'], pose: layerPose });
  await awaitPosed([a], 'ambush');
  const laid = await layOne(a, 'ambush');
  // The victim is posed AFTER the mine exists, from the mine's own position.
  const { pose, approach } = victimPoseThrough(laid);
  checkPoseWater('ambush victim', pose);
  checkLane('ambush', pose, laid);
  const b = await joinClient('AMB-B', 'torpedoBoat', { fit: [], pose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'ambush victim');
  const blast = effectiveStats(CONFIG.shipClasses.mineLayer, ['navalMines']).equipment.navalMines;
  const hp0 = b.you.hp;
  const booms0 = b.booms.length;
  b.script = sailAhead;
  // Budget: the sail from rest over the approach + the same again of slack.
  const budget = 2 * sailMs('torpedoBoat', approach);
  const took = await pilotUntil([a, b], () => b.dmg.some((d) => d.amount === blast.damage) || !b.you.alive, budget, 'mine ambush');
  b.script = idle;
  await holdFor([a, b], 4 * DT);
  const boomed = b.booms.length > booms0;
  log.push(`ambush: victim sailed ${approach}u onto ${laid.id} in ${secs(took)} (budget ${secs(budget)}); hp ${hp0}->${b.you.hp} (mine ${blast.damage}) boom=${boomed}; first seen at ${b.firstSeenDist.get(laid.id)?.toFixed(0)}u`);
  assert(b.dmg.some((d) => d.amount === blast.damage), `no ${blast.damage}-damage mine hit on the victim`);
  assert(b.you.hp <= hp0 - blast.damage + 1, `victim hp ${hp0}->${b.you.hp}: the mine's ${blast.damage} did not land`);
  assert(boomed, 'no boom on mine detonation');
  assert(b.firstSeenDist.has(laid.id), 'the victim never saw the mine it struck (the fog pin would be vacuous)');
  for (const [id, d] of b.firstSeenDist) assert(d <= DETECT + 1, `mine ${id} first seen at ${d.toFixed(0)}u (> detect)`);
  log.push('ambush: all enemy mines first seen within detect range');
  await leaveAll([a, b]);
}

/** PHASE 4 — the light torpedo (twin beam sectors). */
async function lightTorpedoPhase(log) {
  const D = 250; // u — inside sight; a tier-I light fish is a straight-runner with no max range
  const target = { cls: 'torpedoBoat', fit: [] };
  const fit = torpedoFit('lightTorpedo', 'torpedoBoat', target, D);
  log.push(`lightTorpedo: ${fit.text}`);
  const row = fit.pick.row;
  const aPose = { x: 0, y: 0, heading: 0 };
  const bPose = { x: 0, y: D, heading: 0 }; // the PORT BEAM: bearing = heading + π/2
  checkPoseWater('light A', aPose);
  checkPoseWater('light B', bPose);
  checkLane('light', aPose, bPose);
  const a = await joinClient('LT-A', 'torpedoBoat', { fit: Array(fit.pick.cards).fill('lightTorpedo'), pose: aPose });
  const b = await joinClient('LT-B', target.cls, { fit: target.fit, pose: bPose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'light');
  const brg = bearing(a.you, b.you);
  const off = Math.abs(angleDiff(a.you.heading, brg));
  precondition(Math.abs(off - Math.PI / 2) < CONFIG.lightTorpedo.halfArc, 'light: target outside the beam sector');
  precondition(twinSectorSide(a.you.heading, brg, arcFor('lightTorpedo')) !== null, 'light: twinSectorSide refuses the bearing');
  a.script = clickAt(brg);
  const budget = fit.pick.plan.killAtMs + row.reloadMs; // the simulated kill + ONE reload of slack
  const took = await pilotUntil([a, b], () => roster(a.room, b.room.sessionId)?.deaths >= 1, budget, 'light torpedo kill');
  const hits = b.dmg.filter((d) => d.amount === row.damage);
  log.push(`lightTorpedo: LT-B sank in ${secs(took)} (budget ${secs(budget)}); ${row.damage}-dmg hits=${hits.length}`);
  assert(hits.length >= 1, `no ${row.damage}-damage LIGHT torpedo hit recorded`);
  assert(roster(a.room, a.room.sessionId).kills >= 1, 'light torpedo scored no kill');
  await leaveAll([a, b]);
}

/** PHASE 5 — the captive mine (its fish, not a blast). */
async function captiveMinePhase(log) {
  const layerPose = { x: 0, y: 0, heading: 0 };
  checkPoseWater('captive layer', layerPose);
  const a = await joinClient('CM-A', 'mineLayer', { fit: ['captiveMines'], pose: layerPose });
  await awaitPosed([a], 'captive');
  const laid = await layOne(a, 'captive');
  assert(laid.c === 'captive', `own MineView carried kind ${laid.c} — expected 'captive'`);
  const row = effectiveStats(CONFIG.shipClasses.mineLayer, ['captiveMines']).equipment.captiveMines;
  const { pose, approach } = victimPoseThrough(laid);
  checkPoseWater('captive victim', pose);
  checkLane('captive', pose, laid);
  precondition(approach > row.triggerRadius, 'captive: victim posed inside the trip ring');
  const b = await joinClient('CM-B', 'torpedoBoat', { fit: [], pose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'captive victim');
  const hp0 = b.you.hp;
  b.script = sailAhead;
  // Budget: the sail from rest to the trip ring + the same again of slack.
  const budget = 2 * sailMs('torpedoBoat', approach);
  const took = await pilotUntil([a, b], () => b.dmg.some((d) => d.amount === row.damage), budget, 'captive fish hit');
  b.script = idle;
  await holdFor([a, b], 4 * DT);
  log.push(`captive: laid ${laid.id} kind=${laid.c}; trip ring ${row.triggerRadius}u; CM-B.hp ${hp0}->${b.you.hp} (fish ${row.damage}) in ${secs(took)} (budget ${secs(budget)})`);
  assert(row.damage === CONFIG.captiveMines.damage, 'captive: tier-I row damage is not CONFIG.captiveMines.damage');
  assert(!a.mines.some((m) => m.id === laid.id), 'the captive mine was not expended on firing');
  assert(b.booms.length > 0, 'no boom from the captive fish');
  await leaveAll([a, b]);
}

/** The seat gun id -> the CONFIG damage one hit lands, the shell-reveal
 *  family `w` the target is shown (Story 8.15), and its stats row. */
const GUN_DAMAGE = { deckGun: CONFIG.gun.damage, machineGun: CONFIG.machineGun.damage, flak: CONFIG.flak.damage };
const GUN_W = { deckGun: 'cannon', machineGun: 'mg', flak: 'flak' };
const GUN_ROW = { deckGun: 'gun', machineGun: 'machineGun', flak: 'flak' };
/** u — the machine gun aims a little PAST the target so the direct shell
 *  crosses the hull before it expires at its aim point. */
const MG_OVERSHOOT_U = 30;

/** PHASE 6 — one seat gun, stationary shooter and target. */
async function gunPhase(log, gun) {
  // The tier-I row from the same fold the server uses (EMPTY fit). Every blow
  // is range-attenuated past `gunAttenuation.fullFrac` of `rangeU`
  // (sim/attenuation.ts), so the pair sits at 80 % of the full-damage band.
  // There is no aim scatter (guns.ts: the cannon's two barrels straddle the
  // click on parallel tracks, `barrelSpacingU` apart — both land on the hull).
  const row = effectiveStats(CONFIG.shipClasses.torpedoBoat, []).equipment[GUN_ROW[gun]];
  const D = Math.round(0.8 * CONFIG.gunAttenuation.fullFrac * row.rangeU);
  const aPose = { x: -D, y: 0, heading: 0 };
  const bPose = { x: 0, y: 0, heading: Math.PI / 2 };
  checkPoseWater(`${gun} A`, aPose);
  checkPoseWater(`${gun} B`, bPose);
  checkLane(gun, aPose, bPose);
  precondition(D <= CONFIG.gunAttenuation.fullFrac * row.rangeU && D < CONFIG.vision.sight, `${gun}: ${D}u outside the full-damage band or the target's sight`);
  const a = await joinClient(`GUN-${gun}`, 'torpedoBoat', { fit: [], pose: aPose, gun });
  const b = await joinClient(`TGT-${gun}`, 'mineLayer', { fit: [], pose: bPose, roomId: a.room.roomId });
  await awaitPosed([a, b], gun);
  assert(a.you.gun === gun, `${gun}: the shooter's own frame reads gun '${a.you.gun}'`);
  const brg = bearing(a.you, b.you);
  const flightMs = (D / CONFIG.gun.shellSpeed) * 1000; // the gun family shares one muzzle velocity
  let heldTicks = 0;
  let lastClickAt = -Infinity;
  if (gun === 'machineGun') {
    // A LEVEL (amendment 103): held for the first shell's flight + four more
    // `rateMs` shells, then released. fireSeq is never touched.
    const holdMs = flightMs + 4 * row.rateMs;
    const t0 = Date.now();
    a.script = (_ctx, inp) => {
      inp.slot = 0;
      inp.aim = brg;
      inp.aimDist = D + MG_OVERSHOOT_U;
      inp.held = Date.now() - t0 < holdMs;
      if (inp.held) heldTicks += 1;
    };
  } else {
    // A CLICK weapon: one fireSeq edge per `reloadMs`.
    a.script = (ctx, inp) => {
      inp.slot = 0;
      inp.aim = brg;
      inp.aimDist = D;
      if (Date.now() - lastClickAt >= row.reloadMs) {
        lastClickAt = Date.now();
        inp.fireSeq = ++ctx.fireSeq;
      }
    };
  }
  // Budget: the first shell's flight + ONE reload (swap) of slack + a second of socket allowance.
  const budget = (gun === 'machineGun' ? flightMs + 4 * row.rateMs : 0) + flightMs + row.reloadMs + 1000;
  const took = await pilotUntil([a, b], () => b.dmg.some((d) => d.amount === GUN_DAMAGE[gun]), budget, `${gun}: a ${GUN_DAMAGE[gun]}-damage hit`);
  // Stop firing and let any shell still in flight land.
  a.script = idle;
  await holdFor([a, b], 2 * flightMs + 10 * DT);
  const hits = b.dmg.filter((d) => d.amount === GUN_DAMAGE[gun]);
  const ws = b.shellW;
  log.push(
    `${gun}: range ${D}u (tier-I rangeU ${row.rangeU}), hit in ${secs(took)} (budget ${secs(budget)}), ${GUN_DAMAGE[gun]}-dmg hits=${hits.length}, ` +
      `target saw ${ws.length} shell reveals w=[${[...new Set(ws)].join(',')}]` +
      (gun === 'machineGun' ? `, held ticks sent=${heldTicks}, fireSeq=${a.fireSeq}` : ''),
  );
  assert(hits.length >= 1, `${gun}: no ${GUN_DAMAGE[gun]}-damage hit recorded on the target`);
  assert(ws.length > 0, `${gun}: the target never saw a shell reveal (the w check would be vacuous)`);
  for (const w of ws) assert(w === GUN_W[gun], `${gun}: a shell reveal carried w='${w}', expected '${GUN_W[gun]}'`);
  if (gun === 'machineGun') {
    assert(heldTicks > 0, 'machineGun: the level was never held (vacuous)');
    assert(a.fireSeq === 0, 'machineGun: the stream sent a click edge — it must be a level only');
  }
  await leaveAll([a, b]);
}

async function main() {
  const t0 = Date.now();
  const log = TRACE;
  await torpedoPhase(log);
  await minePhase(log);
  await ambushPhase(log);
  await lightTorpedoPhase(log);
  await captiveMinePhase(log);
  for (const gun of ['deckGun', 'machineGun', 'flak']) await gunPhase(log, gun);
  console.log('WEAPONS SMOKE OK:', { seed: MAP_SEED, wall: secs(Date.now() - t0), trace: log });
  process.exit(0);
}

main().catch((err) => {
  const bug = err.message.startsWith('PRECONDITION:');
  console.error(bug ? 'WEAPONS SMOKE SCRIPT BUG:' : 'WEAPONS SMOKE FAILED:', err.message, { trace: TRACE });
  process.exit(1);
});
