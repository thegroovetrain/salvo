// Weapons smoke: live @colyseus/sdk clients against a running dev server,
// exercising torpedoes, mines, the main battery and the secondaries end to end — as
// SCRIPTED SCENARIOS (Story 9.15). "A smoke places, it does not sail."
//
// WHY IT USED TO FLAKE. Every hull carried a heuristic pilot (rendezvous to
// the midpoint, hold-station loiter, island-avoid rudder bias, nearest-mine
// chase) on a RANDOM map, while the 60 s PvE fleet wave and passive regen
// (gone since Story 10.3) raced every kill — so a red run measured the piloting, not the weapon.
// Now nothing sails by heuristic: every phase gets its OWN fresh room on a
// PINNED map (`mapSeed`), every hull is PLACED by the dev-only `spawnOverride`
// pose, the fleet wave is off (`matchOverride.fleetWaves: false`), and the
// inputs are scripted per phase through the ordinary `i` channel (so they pass
// `inputs.ts`' sanitizeInput like any client's).
//
// THE PHASES (each in its own room; every number READ from CONFIG or from the
// same `effectiveStats()` fold the server uses, never typed here):
//   1. TORPEDO KILL — an Iowa posed broadside-on to a stationary Yamato, bow
//      on the bearing, clicks the heavy tube every tick. The KILL
//      PLAN (torpedo count, time) is simulated below from the fitted row and
//      the target's hp (no regen since Story 10.3), and printed; the budget is the plan
//      plus one reload. Asserts a hit at the armor-curve blow, the roster
//      death + kill. The radar half of the torpedo contract (a torpedo's WATER
//      paints while the torpedo itself stays silent beyond detect, amendment 196)
//      lives in server/src/__tests__/perception.test.ts, not here.
//   2. MINE VISIBILITY + NO EVICTION — a stationary layer (Warspite) clicks naval
//      mines astern (inside `placeRange`, spread over the rear sector) while a
//      stationary observer sits at a FIXED point inside detect. Asserts SIX own
//      mines live at once (Story 8.4 deleted every mine cap) and that the
//      observer DOES see enemy mines inside detect. (The fog crossing itself
//      is proven by phase 3, the AMBUSH: the observer here is posed inside
//      detect of every possible drop, so a "never beyond detect" claim could
//      not fail.)
//   3. MINE AMBUSH — the layer lays ONE mine; after it arms, the victim joins
//      posed beyond detect on a straight line THROUGH the mine and sails it at
//      `throttle 1, rudder 0`. Asserts the mine's gated damage, a boom, and that the
//      mine was first sighted inside detect (the victim starts at detect + 100u,
//      so this IS the fog-crossing pin).
//   4. LIGHT TORPEDO — the target posed on the shooter's PORT BEAM (heading +
//      π/2), inside the twin beam sector by construction; kill plan as in 1.
//   5. CAPTIVE MINE — the layer lays one captive; the victim drives straight
//      through its trip ring. Asserts the captive row's gated damage, a boom, and
//      that the mine was expended.
//   6. MAIN BATTERY (Story 10.4, R2/R4) — shooter (the default hull) and target
//      stationary, the target dead on the shooter's beam inside the full-damage
//      band so EVERY turret bears. The shooter holds its aim until its own
//      `you.turrets` show every turret on the aim point, clicks ONCE (exactly
//      one turret — the lowest index — starts reloading, `ammo[0].n` drops by
//      one), then once per tick until every turret has fired. Asserts every
//      shell reveal is `cannon`, the target took one gated blow per gun, and on
//      every own frame `ammo[0]` is the turrets' summary.
//   7. SECONDARIES (R3) — `sec: true` on a target inside half the main reach:
//      a short burst (heat rises, then drains after release with no further
//      rounds), then a continuous hold from cold to the OVERHEAT lock (the
//      rounds landed equal the shared stepper's count to lock), no round while
//      locked although still held, and rounds again once heat is back to zero.
//      Asserts `mg` reveals and the gated per-round blow.
//   8. SECONDARIES POP A MINE — a captain within secondary reach of an enemy
//      mine holds `sec` on its marker; the mine vanishes on the landing CONFIG
//      implies (ceil(mine hp / the settled round damage)), not before.
//   9. MAIN BATTERY IGNORES A MINE — a full broadside lands on a mine's
//      marker; the mine is still on the water afterwards.
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
  DEFAULT_CLASS_ID,
  MSG,
  PROTOCOL_VERSION,
  aimPointOf,
  angleDiff,
  arcFor,
  bearing,
  damageMultiplierFor,
  desiredTurretAngle,
  effectiveStats,
  generateMap,
  initialSecondaries,
  islandBlocksSegment,
  islandDistance,
  settleBlow,
  stepSecondaries,
  turretBears,
  turretMounts,
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

/** THE HULLS PER ROLE (Story 10.4: the four battleships replaced the three
 *  placeholder classes, which had no 1:1 successor — a reading, by intent).
 *  The torpedo shooter is the fast hull, its target the most armored; the
 *  layer is the shortest hull; every victim / observer / gunnery shooter is
 *  the DEFAULT hull, and the gunnery target is a different hull so the
 *  ARMOR − POWER gate is not ×1. */
const TORP_SHOOTER = 'iowa';
const TORP_TARGET = 'yamato';
const LAYER = 'warspite';
const VICTIM = DEFAULT_CLASS_ID;
const GUNNER = DEFAULT_CLASS_ID;
const GUN_TARGET = 'warspite';

/** The blow a hull of `victim` stats takes from `raw` settled hp fired by a
 *  hull of `attacker` stats: the World's damage gate — the ONE armor curve over
 *  victim ARMOR minus attacker POWER (Story 10.3 indices), floored to a whole
 *  number but never below 1 (World.floorBlow). */
function gatedBlow(raw, victim, attacker) {
  return raw > 0 ? Math.max(1, Math.floor(raw * damageMultiplierFor(victim.armor - attacker.power))) : 0;
}
const statsOf = (cls, fit = []) => effectiveStats(CONFIG.shipClasses[cls], fit);

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
 * else CREATE a fresh one. (The seat `gun` option is gone with Story 10.4.)
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
    shellW: [], // Story 8.15: the gun family `w` of every shell reveal this client is shown
    events: [], // every event this client is shown, with the frame's server time `ft`
    frames: 0,
    batteryMismatch: [], // own frames whose ammo[0] is NOT the turrets' summary (Story 10.4)
    secSeen: 0, // own frames carrying a `{heat, locked}` sec block
    hook: null, // a phase's per-frame judge (Story 10.4), run after the frame is filed
    seq: 0,
    fireSeq: 0,
    script: idle,
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
  ctx.frames += 1;
  if (f.you) {
    ctx.you = f.you;
    checkBatterySummary(ctx, f.you);
  }
  ctx.mines = f.mines;
  for (const e of f.events) {
    ctx.events.push({ ...e, ft: f.t });
    if (e.k === 'boom') ctx.booms.push(e);
    else if (e.k === 'dmg') ctx.dmg.push(e);
    else if (e.k === 'shell') ctx.shellW.push(e.w);
  }
  trackEnemyMines(ctx);
  if (ctx.you) ctx.hook?.(ctx, f);
}

/** STORY 10.4: slot 0's hotbar pair on a captain is DERIVED from the turrets
 *  (`batterySummary`): `n` = turrets ready, `reloadMsLeft` = the soonest
 *  running reload (0 when all are ready). Checked on EVERY own frame. */
function checkBatterySummary(ctx, you) {
  if (you.sec && typeof you.sec.heat === 'number' && typeof you.sec.locked === 'boolean') ctx.secSeen += 1;
  const t = you.turrets;
  const s = you.ammo?.[0];
  if (!Array.isArray(t) || !s) {
    ctx.batteryMismatch.push(`no turrets/ammo[0] (turrets=${JSON.stringify(t)}, ammo0=${JSON.stringify(s)})`);
    return;
  }
  const ready = t.filter((x) => x.reloadMsLeft <= 0).length;
  const running = t.filter((x) => x.reloadMsLeft > 0).map((x) => x.reloadMsLeft);
  const soonest = running.length > 0 ? Math.min(...running) : 0;
  if (s.n !== ready || Math.abs(s.reloadMsLeft - soonest) > 1e-6) {
    ctx.batteryMismatch.push(`ammo[0]=${JSON.stringify(s)} vs turrets ready=${ready} soonest=${soonest}`);
  }
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
  }
  if (concurrent > ctx.maxConcurrentEnemy) ctx.maxConcurrentEnemy = concurrent;
  if (own > ctx.maxConcurrentOwn) ctx.maxConcurrentOwn = own;
}

// --- scripted inputs --------------------------------------------------------

function neutralInput(ctx) {
  return { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false, sec: false };
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
    // Everything below is OBSERVED FROM THE SERVER: a mismatch is a smoke failure.
    assert(c.welcome.mapSeed === MAP_SEED, `${label}: ${c.name} got mapSeed ${c.welcome.mapSeed}, expected ${MAP_SEED} (is HC_DEV_OPTIONS=1 set on the server?)`);
    const off = dist(c.you, c.pose);
    assert(off < 2 && Math.abs(angleDiff(c.you.heading, c.pose.heading)) < 0.01,
      `${label}: ${c.name} spawned at (${c.you.x.toFixed(0)},${c.you.y.toFixed(0)},${c.you.heading.toFixed(2)}), not its pose — spawnOverride stripped?`);
    assert(JSON.stringify(c.you.cards) === JSON.stringify(c.fit), `${label}: ${c.name} fitted ${JSON.stringify(c.you.cards)}, expected ${JSON.stringify(c.fit)}`);
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
 * `hp`. 2026-11-04 (Story 10.3): the regen term is GONE with the out-of-combat
 * regen itself — the target heals nothing between hits. Returns the fish
 * needed and the kill time.
 */
function killPlan({ hp, damage, maxAmmo, reloadMs, flightMs }) {
  let t = 0;
  let n = maxAmmo;
  let left = 0;
  let cur = hp;
  let hits = 0;
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
      if (cur <= 0) return { fish: hits, killAtMs: t };
    }
  }
  throw new Error(`PRECONDITION: no kill inside an hour (damage ${damage} vs hp ${hp})`);
}

/**
 * Pick the torpedo fit: ALWAYS the smallest card stack (≤ tier III) that gives
 * TWO tubes (a tiered fit is allowed — Eric 2026-10-22). The tier-I plan and
 * the chosen plan both go to the trace.
 */
function torpedoFit(line, shooterCls, target, rangeU) {
  const tgt = effectiveStats(CONFIG.shipClasses[target.cls], target.fit);
  const planFor = (cards) => {
    const row = effectiveStats(CONFIG.shipClasses[shooterCls], Array(cards).fill(line)).equipment[line];
    const flightMs = (rangeU / row.speed) * 1000;
    const shooter = effectiveStats(CONFIG.shipClasses[shooterCls], Array(cards).fill(line));
    // The blow the target's hull takes: the server's armor curve over its ARMOR
    // minus the shooter's POWER (Story 10.3 indices), floored (World.floorBlow)
    // — as matchSmoke.
    const blow = Math.max(1, Math.floor(row.damage * damageMultiplierFor(tgt.armor - shooter.power)));
    return { cards, row, blow, plan: killPlan({ hp: tgt.maxHp, damage: blow, maxAmmo: row.maxAmmo, reloadMs: row.reloadMs, flightMs }) };
  };
  const one = planFor(1);
  let two = null;
  for (let k = 1; k <= MAX_SMOKE_CARDS && two === null; k++) {
    const p = planFor(k);
    if (p.row.maxAmmo >= 2) two = p;
  }
  precondition(two !== null, `${line}: no two-tube tier within ${MAX_SMOKE_CARDS} cards`);
  const pick = two;
  const fmt = (p) => `${p.cards} card(s) tier ${p.row.tier}: ${p.row.maxAmmo} tube(s) x ${p.row.damage} dmg (${p.blow} after armor) / ${secs(p.row.reloadMs)} -> ${p.plan.fish} fish, kill at ${secs(p.plan.killAtMs)}`;
  return {
    pick,
    hp: tgt.maxHp,
    text: `plan vs ${tgt.maxHp} hp, no regen: ` +
      `[${fmt(one)}]` + (two ? ` [${fmt(two)}]` : ' [no two-tube tier <= III]') + ` => fitting ${pick.cards} card(s)`,
  };
}

// --- phases -----------------------------------------------------------------

/** PHASE 1 — heavy torpedo kill. */
async function torpedoPhase(log) {
  // u — inside the heavy fish's run: a tier-I straight-runner has NO max range
  // (torpedoCore: range = Infinity); a homing tier carries
  // CONFIG.torpedo.homingMaxRangeU. Inside sight, so the target sees the fish.
  const D = 300;
  const target = { cls: TORP_TARGET, fit: [] };
  const fit = torpedoFit('heavyTorpedo', TORP_SHOOTER, target, D);
  log.push(`torpedo: ${fit.text}`);
  const row = fit.pick.row;
  const runU = row.homingTurnRate > 0 ? CONFIG.torpedo.homingMaxRangeU : Infinity;
  const aPose = { x: -D, y: 0, heading: 0 };
  const bPose = { x: 0, y: 0, heading: Math.PI / 2 }; // broadside to the shooter
  checkPoseWater('torpedo A', aPose);
  checkPoseWater('torpedo B', bPose);
  checkLane('torpedo', aPose, bPose);
  precondition(D < runU && D < CONFIG.vision.sight, `torpedo: range ${D}u outside the run (${runU}) or sight`);
  const a = await joinClient('WPN-A', TORP_SHOOTER, { fit: Array(fit.pick.cards).fill('heavyTorpedo'), pose: aPose });
  const b = await joinClient('WPN-B', target.cls, { fit: target.fit, pose: bPose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'torpedo');
  const brg = bearing(a.you, b.you);
  precondition(Math.abs(angleDiff(a.you.heading, brg)) < CONFIG.torpedo.halfArc, 'torpedo: target outside the bow arc');
  assert(b.you.hp === fit.hp, `torpedo: target hp ${b.you.hp} != planned ${fit.hp} (shared fold vs server maxHp)`);
  const tubes = a.you.ammo[2];
  assert(tubes !== null && tubes !== undefined && tubes.n === row.maxAmmo, `torpedo: shooter slot 2 holds ${tubes?.n} fish, planned ${row.maxAmmo} tubes`);
  a.script = clickAt(brg);
  // Budget: the simulated kill time + ONE reload of slack.
  const budget = fit.pick.plan.killAtMs + row.reloadMs;
  const took = await pilotUntil([a, b], () => roster(a.room, b.room.sessionId)?.deaths >= 1, budget, 'torpedo kill');
  const blow = fit.pick.blow;
  const hits = b.dmg.filter((d) => d.amount === blow);
  const kills = roster(a.room, a.room.sessionId).kills;
  log.push(`torpedo: B sank in ${secs(took)} (budget ${secs(budget)}); ${blow}-dmg hits (${row.damage} x armor curve)=${hits.length} kills=${kills}`);
  assert(hits.length >= 1, `no ${blow}-damage torpedo hit recorded on B`);
  assert(kills >= 1, 'the torpedo kill is not on the shooter\'s roster row');
  log.push('torpedo: the radar half of the torpedo contract lives in server/src/__tests__/perception.test.ts (amendment 196)');
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
  const rack = statsOf(LAYER, ['navalMines']).equipment.navalMines;
  precondition(dist(layerPose, obsPose) - CONFIG.mine.placeRange > rack.triggerRadius + 50, 'mine: observer inside a trip ring');
  const a = await joinClient('MINE-A', LAYER, { fit: ['navalMines'], pose: layerPose });
  const b = await joinClient('MINE-B', VICTIM, { fit: [], pose: obsPose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'mine');
  a.script = (ctx, inp) => clickAt(astern(ctx.pose.heading, ctx.distinctOwn.size), DROP_U)(ctx, inp);
  // Budget: NO_EVICTION_MINES drops at one per CONFIG.mine.reloadMs is an upper
  // bound on the rack's cadence (it starts full, so it is faster), + armDelay,
  // + ONE reload of slack.
  const budget = NO_EVICTION_MINES * rack.reloadMs + CONFIG.mine.armDelay + rack.reloadMs;
  const took = await pilotUntil([a, b], () => a.maxConcurrentOwn >= NO_EVICTION_MINES, budget, `A hold ${NO_EVICTION_MINES} mines live at once`);
  log.push(
    `mines: A held ${a.maxConcurrentOwn} own mines live at once (${a.distinctOwn.size} laid) in ${secs(took)} (budget ${secs(budget)}, rack ${rack.maxAmmo} / ${secs(rack.reloadMs)}); ` +
      `B saw ${b.distinctEnemy.size} distinct A-mines, max ${b.maxConcurrentEnemy} at once`,
  );
  assert(b.distinctEnemy.size > 0, 'B never saw an enemy mine inside detect (disclosure inside detect broke)');
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
  const a = await joinClient('AMB-A', LAYER, { fit: ['navalMines'], pose: layerPose });
  await awaitPosed([a], 'ambush');
  const laid = await layOne(a, 'ambush');
  // The victim is posed AFTER the mine exists, from the mine's own position.
  const { pose, approach } = victimPoseThrough(laid);
  checkPoseWater('ambush victim', pose);
  checkLane('ambush', pose, laid);
  const b = await joinClient('AMB-B', VICTIM, { fit: [], pose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'ambush victim');
  const rack = statsOf(LAYER, ['navalMines']).equipment.navalMines;
  // The blast through the damage gate: victim ARMOR − the layer's POWER.
  const blast = { damage: gatedBlow(rack.damage, statsOf(VICTIM), statsOf(LAYER, ['navalMines'])) };
  const hp0 = b.you.hp;
  const booms0 = b.booms.length;
  b.script = sailAhead;
  // Budget: the sail from rest over the approach + the same again of slack.
  const budget = 2 * sailMs(VICTIM, approach);
  const took = await pilotUntil([a, b], () => b.dmg.some((d) => d.amount === blast.damage) || !b.you.alive, budget, 'mine ambush');
  b.script = idle;
  await holdFor([a, b], 4 * DT);
  const boomed = b.booms.length > booms0;
  log.push(`ambush: victim sailed ${approach}u onto ${laid.id} in ${secs(took)} (budget ${secs(budget)}); hp ${hp0}->${b.you.hp} (mine ${rack.damage} -> ${blast.damage} after the gate) boom=${boomed}; first seen at ${b.firstSeenDist.get(laid.id)?.toFixed(0)}u`);
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
  const target = { cls: VICTIM, fit: [] };
  const fit = torpedoFit('lightTorpedo', TORP_SHOOTER, target, D);
  log.push(`lightTorpedo: ${fit.text}`);
  const row = fit.pick.row;
  const aPose = { x: 0, y: 0, heading: 0 };
  const bPose = { x: 0, y: D, heading: 0 }; // the PORT BEAM: bearing = heading + π/2
  checkPoseWater('light A', aPose);
  checkPoseWater('light B', bPose);
  checkLane('light', aPose, bPose);
  const a = await joinClient('LT-A', TORP_SHOOTER, { fit: Array(fit.pick.cards).fill('lightTorpedo'), pose: aPose });
  const b = await joinClient('LT-B', target.cls, { fit: target.fit, pose: bPose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'light');
  const tubes = a.you.ammo[2];
  assert(tubes !== null && tubes !== undefined && tubes.n === row.maxAmmo, `light: shooter slot 2 holds ${tubes?.n} fish, planned ${row.maxAmmo} tubes`);
  const brg = bearing(a.you, b.you);
  const off = Math.abs(angleDiff(a.you.heading, brg));
  precondition(Math.abs(off - Math.PI / 2) < CONFIG.lightTorpedo.halfArc, 'light: target outside the beam sector');
  precondition(twinSectorSide(a.you.heading, brg, arcFor('lightTorpedo')) !== null, 'light: twinSectorSide refuses the bearing');
  a.script = clickAt(brg);
  const budget = fit.pick.plan.killAtMs + row.reloadMs; // the simulated kill + ONE reload of slack
  const took = await pilotUntil([a, b], () => roster(a.room, b.room.sessionId)?.deaths >= 1, budget, 'light torpedo kill');
  const blow = fit.pick.blow;
  const hits = b.dmg.filter((d) => d.amount === blow);
  log.push(`lightTorpedo: LT-B sank in ${secs(took)} (budget ${secs(budget)}); ${blow}-dmg hits (${row.damage} x armor curve)=${hits.length}`);
  assert(hits.length >= 1, `no ${blow}-damage LIGHT torpedo hit recorded`);
  assert(roster(a.room, a.room.sessionId).kills >= 1, 'light torpedo scored no kill');
  await leaveAll([a, b]);
}

/** PHASE 5 — the captive mine (its fish, not a blast). */
async function captiveMinePhase(log) {
  const layerPose = { x: 0, y: 0, heading: 0 };
  checkPoseWater('captive layer', layerPose);
  const a = await joinClient('CM-A', LAYER, { fit: ['captiveMines'], pose: layerPose });
  await awaitPosed([a], 'captive');
  const laid = await layOne(a, 'captive');
  assert(laid.c === 'captive', `own MineView carried kind ${laid.c} — expected 'captive'`);
  const row = statsOf(LAYER, ['captiveMines']).equipment.captiveMines;
  // The captive's torpedo through the damage gate: victim ARMOR − the layer's POWER.
  const blow = gatedBlow(row.damage, statsOf(VICTIM), statsOf(LAYER, ['captiveMines']));
  const { pose, approach } = victimPoseThrough(laid);
  checkPoseWater('captive victim', pose);
  checkLane('captive', pose, laid);
  precondition(approach > row.triggerRadius, 'captive: victim posed inside the trip ring');
  const b = await joinClient('CM-B', VICTIM, { fit: [], pose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'captive victim');
  const hp0 = b.you.hp;
  b.script = sailAhead;
  // Budget: the sail from rest to the trip ring + the same again of slack.
  const budget = 2 * sailMs(VICTIM, approach);
  const took = await pilotUntil([a, b], () => b.dmg.some((d) => d.amount === blow), budget, 'captive torpedo hit');
  b.script = idle;
  await holdFor([a, b], 4 * DT);
  log.push(`captive: laid ${laid.id} kind=${laid.c}; trip ring ${row.triggerRadius}u; CM-B.hp ${hp0}->${b.you.hp} (torpedo ${row.damage} -> ${blow} after the gate) in ${secs(took)} (budget ${secs(budget)})`);
  assert(row.damage === CONFIG.captiveMines.damage, 'captive: tier-I row damage is not CONFIG.captiveMines.damage');
  assert(!a.mines.some((m) => m.id === laid.id), 'the captive mine was not expended on firing');
  assert(b.booms.length > 0, 'no boom from the captive torpedo');
  await leaveAll([a, b]);
}

// --- the main battery and the secondaries (Story 10.4) ----------------------

/** u — the secondaries aim a little PAST the target so the direct round
 *  crosses the hull before it expires at its aim point (the old machine gun's
 *  rule; the secondaries round IS that round, contract §5). */
const SEC_OVERSHOOT_U = 30;
/** rad — R4's on-target tolerance, from CONFIG. */
const ON_TARGET_RAD = (CONFIG.mainBattery.onTargetDeg * Math.PI) / 180;

/** ms — the longest any turret can need to train onto a legal aim: twice its
 *  train limit (stop to stop) at the CONFIG traverse rate. */
function worstTrainMs(hull) {
  const trainDeg = CONFIG.shipClasses[hull].battery.trainDeg;
  return ((2 * trainDeg) / CONFIG.mainBattery.traverseDegPerS) * 1000;
}

/** Indices of the turrets this own frame shows ON the aim point (R4's test). */
function turretsOnAim(ctx, aimPt) {
  const t = ctx.you?.turrets ?? [];
  const pose = { x: ctx.you.x, y: ctx.you.y, heading: ctx.you.heading };
  return t.flatMap((tt, i) => (turretBears(ctx.cls, i, pose, aimPt) && Math.abs(tt.a - desiredTurretAngle(ctx.cls, i, pose, aimPt)) <= ON_TARGET_RAD ? [i] : []));
}
const reloadingTurrets = (ctx) => (ctx.you?.turrets ?? []).flatMap((t, i) => (t.reloadMsLeft > 0 ? [i] : []));

/**
 * Hold the main-battery aim on `aimPt` (bearing `aim`, distance `aimDist`
 * from the ship centre) until EVERY turret is on it, click ONCE and check that
 * exactly ONE turret (the lowest index — every turret bears, R4 priority 1)
 * started its reload, then click once per tick until every turret has fired.
 * Returns what the trace prints.
 */
async function trainAndFireBroadside(a, others, aim, aimDist, aimPt, label) {
  const mounts = turretMounts(a.cls);
  const row = statsOf(a.cls).equipment.mainBattery;
  let clicks = 0;
  let clickNow = false;
  let everyTick = false;
  a.script = (ctx, inp) => {
    inp.slot = 0;
    inp.aim = aim;
    inp.aimDist = aimDist;
    if (clickNow || everyTick) {
      inp.fireSeq = ++ctx.fireSeq;
      clicks += 1;
      clickNow = false;
    }
  };
  // TRAIN: budget = the worst stop-to-stop traverse + a second of socket slack.
  const trainBudget = worstTrainMs(a.cls) + 1000;
  const trainedIn = await pilotUntil([a, ...others], () => turretsOnAim(a, aimPt).length === mounts.length, trainBudget, `${label}: every turret on the aim`);
  assert(reloadingTurrets(a).length === 0, `${label}: a turret is reloading before the first click`);
  assert(a.you.ammo[0].n === mounts.length, `${label}: ammo[0].n ${a.you.ammo[0].n} before the first click, expected ${mounts.length} ready turrets`);
  // ONE CLICK: one turret fires, only its reload starts.
  clickNow = true;
  await pilotUntil([a, ...others], () => reloadingTurrets(a).length > 0, 1000 + 4 * DT, `${label}: the first click's turret starts reloading`);
  const first = reloadingTurrets(a);
  const firstN = a.you.ammo[0].n;
  assert(first.length === 1, `${label}: ONE click started ${first.length} reloads (turrets ${JSON.stringify(first)}) — expected exactly one`);
  assert(first[0] === 0, `${label}: the click fired turret ${first[0]}, expected turret 0 (lowest index on target, R4)`);
  assert(firstN === mounts.length - 1, `${label}: ammo[0].n ${firstN} after one click, expected ${mounts.length - 1}`);
  assert(a.you.turrets[0].reloadMsLeft <= row.reloadMs, `${label}: turret 0 reload ${a.you.turrets[0].reloadMsLeft} > the folded ${row.reloadMs}`);
  // ONCE PER TICK until every turret is reloading.
  everyTick = true;
  await pilotUntil([a, ...others], () => reloadingTurrets(a).length === mounts.length, mounts.length * DT + 2000, `${label}: every turret fired`);
  everyTick = false;
  a.script = idle;
  const left = a.you.turrets.map((t) => Math.round(t.reloadMsLeft));
  assert(a.you.ammo[0].n === 0, `${label}: ammo[0].n ${a.you.ammo[0].n} with every turret reloading`);
  return {
    guns: mounts.reduce((s, m) => s + m.guns, 0),
    text: `trained in ${secs(trainedIn)} (worst ${secs(worstTrainMs(a.cls))}); click 1 -> turret ${first[0]} reloading, ammo[0].n ${mounts.length}->${firstN}; ` +
      `${clicks} click(s) total -> every turret reloading [${left.join(', ')}] ms (folded ${row.reloadMs})`,
  };
}

/** PHASE 6 — the main battery: train, one turret per click, a full broadside. */
async function mainBatteryPhase(log) {
  // The FOLDED row from the same fold the server uses (EMPTY fit). Every blow
  // is range-attenuated past `gunAttenuation.fullFrac` of `rangeU`
  // (sim/attenuation.ts), so the pair sits at 80 % of the full-damage band.
  const row = statsOf(GUNNER).equipment.mainBattery;
  const D = Math.round(0.8 * CONFIG.gunAttenuation.fullFrac * row.rangeU);
  // The target dead on the shooter's STARBOARD beam (shooter heading +π/2,
  // bearing 0), broadside to the fall of shot (its length across the
  // parallel tracks, so every shell of a salvo lands on the hull).
  const aPose = { x: -D, y: 0, heading: Math.PI / 2 };
  const bPose = { x: 0, y: 0, heading: Math.PI / 2 };
  checkPoseWater('main A', aPose);
  checkPoseWater('main B', bPose);
  checkLane('main', aPose, bPose);
  precondition(D <= CONFIG.gunAttenuation.fullFrac * row.rangeU && D < CONFIG.vision.sight, `main: ${D}u outside the full-damage band or the target's sight`);
  const aim = bearing(aPose, bPose);
  const aimPt = aimPointOf(aPose, aim, D);
  const mounts = turretMounts(GUNNER);
  precondition(mounts.every((_, i) => turretBears(GUNNER, i, aPose, aimPt)), 'main: a turret cannot bear on the beam aim (blind sector)');
  precondition(row.maxAmmo === mounts.length, `main: maxAmmo ${row.maxAmmo} is not the turret count ${mounts.length}`);
  const a = await joinClient('MAIN-A', GUNNER, { fit: [], pose: aPose });
  const b = await joinClient('MAIN-B', GUN_TARGET, { fit: [], pose: bPose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'main');
  assert(Array.isArray(a.you.turrets) && a.you.turrets.length === mounts.length, `main: own frame carries ${a.you.turrets?.length} turrets, the hull mounts ${mounts.length}`);
  const blow = gatedBlow(row.damage, statsOf(GUN_TARGET), statsOf(GUNNER));
  const hp0 = b.you.hp;
  const dmg0 = b.dmg.length;
  const fired = await trainAndFireBroadside(a, [b], aim, D, aimPt, 'main');
  // Let every shell land: the flight + ten ticks.
  const flightMs = (D / CONFIG.mainBattery.shellSpeed) * 1000;
  await holdFor([a, b], flightMs + 10 * DT);
  const hits = b.dmg.slice(dmg0);
  const ws = b.shellW;
  log.push(
    `main: ${GUNNER} -> ${GUN_TARGET} at ${D}u (rangeU ${row.rangeU}); ${fired.text}; ` +
      `${hits.length} blows of ${blow} (${row.damage} x armor curve) for ${fired.guns} guns, hp ${hp0}->${b.you.hp}; ` +
      `target saw ${ws.length} shell reveals w=[${[...new Set(ws)].join(',')}]; ${a.frames} own frames, ammo[0] mismatches ${a.batteryMismatch.length}`,
  );
  assert(ws.length > 0, 'main: the target never saw a shell reveal (the w check would be vacuous)');
  for (const w of ws) assert(w === 'cannon', `main: a shell reveal carried w='${w}', expected 'cannon'`);
  for (const h of hits) assert(h.amount === blow, `main: a ${h.amount}-damage blow, expected ${blow} (${row.damage} through the gate)`);
  assert(hits.length === fired.guns, `main: ${hits.length} blows landed, the broadside is ${fired.guns} guns`);
  assert(hp0 - b.you.hp === fired.guns * blow, `main: target hp ${hp0}->${b.you.hp}, expected -${fired.guns * blow}`);
  assert(a.batteryMismatch.length === 0, `main: ammo[0] is not the turret summary on ${a.batteryMismatch.length} frame(s): ${a.batteryMismatch.slice(0, 3).join(' | ')}`);
  await leaveAll([a, b]);
}

/** The shared stepper's own count: rounds a CONTINUOUS hold fires from cold
 *  before the lock (sim/secondaries.ts — the very function the server steps). */
function roundsToLock() {
  const s = initialSecondaries();
  let n = 0;
  for (let i = 0; i < 100000 && !s.locked; i++) n += stepSecondaries(s, true, DT);
  precondition(s.locked, 'secondaries: the shared stepper never locks');
  return n;
}

/** PHASE 7 — the secondaries: burst, release, overheat lock, cool, resume. */
async function secondariesPhase(log) {
  const st = statsOf(GUNNER);
  const reach = st.secondaryRangeU;
  const D = Math.round(0.8 * CONFIG.gunAttenuation.fullFrac * reach);
  const aPose = { x: -D, y: 0, heading: Math.PI / 2 };
  const bPose = { x: 0, y: 0, heading: Math.PI / 2 };
  checkPoseWater('sec A', aPose);
  checkPoseWater('sec B', bPose);
  checkLane('sec', aPose, bPose);
  precondition(D + SEC_OVERSHOOT_U <= reach && D <= CONFIG.gunAttenuation.fullFrac * reach, `sec: ${D}u (+${SEC_OVERSHOOT_U}) outside the reach ${reach} or the full-damage band`);
  const cfg = CONFIG.secondaries;
  const blow = gatedBlow(cfg.damage, statsOf(GUN_TARGET), st);
  const toLock = roundsToLock();
  const flightMs = ((D + SEC_OVERSHOOT_U) / cfg.shellSpeed) * 1000;
  const a = await joinClient('SEC-A', GUNNER, { fit: [], pose: aPose });
  const b = await joinClient('SEC-B', GUN_TARGET, { fit: [], pose: bPose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'sec');
  assert(a.you.sec && a.you.sec.heat === 0 && a.you.sec.locked === false, `sec: a fresh hull's sec block is ${JSON.stringify(a.you.sec)}, expected cold`);
  const brg = bearing(a.you, b.you);
  let held = false;
  let heldTicks = 0;
  a.script = (_ctx, inp) => {
    inp.aim = brg;
    inp.aimDist = D + SEC_OVERSHOOT_U;
    inp.sec = held;
    if (held) heldTicks += 1;
  };
  const hp0 = b.you.hp;
  // (a) BURST: a quarter of the overheat time, then release.
  held = true;
  let burstMax = 0;
  await pilotUntil([a, b], () => heldTicks * DT >= cfg.overheatMs / 4, cfg.overheatMs / 4 + 2000, 'sec burst', () => {
    burstMax = Math.max(burstMax, a.you.sec.heat);
  });
  const lockedInBurst = a.you.sec.locked;
  held = false;
  await holdFor([a, b], flightMs + 4 * DT);
  const hpAfterBurst = b.you.hp;
  const heatAfterRelease = a.you.sec.heat;
  await holdFor([a, b], 1000);
  const hpQuiet = b.you.hp;
  // Drain to zero (at most the full cool time + a second of slack).
  const drainedIn = await pilotUntil([a, b], () => a.you.sec.heat === 0, cfg.coolMs + 1000, 'sec heat drains to zero');
  const burstRounds = (hp0 - hpAfterBurst) / blow;
  assert(burstMax > 0, 'sec: heat never rose while held');
  assert(!lockedInBurst, 'sec: a short burst locked the guns');
  assert(heatAfterRelease < burstMax, `sec: heat ${heatAfterRelease} after release did not drain below ${burstMax}`);
  assert(burstRounds >= 1 && Number.isInteger(burstRounds), `sec: the burst took ${hp0 - hpAfterBurst} hp, not a whole number (>= 1) of ${blow}-hp rounds`);
  assert(hpQuiet === hpAfterBurst, `sec: the target lost ${hpAfterBurst - hpQuiet} hp after release — rounds without the trigger`);
  // (b) OVERHEAT: a continuous hold from cold to the lock.
  const hpCold = b.you.hp;
  held = true;
  // The FIRST own frame that shows the lock cleared, recorded per frame (the
  // stepper clears it on the step heat reaches zero and fires on the next).
  let firstUnlocked = null;
  let sawLocked = false;
  a.hook = (ctx) => {
    if (ctx.you.sec.locked) sawLocked = true;
    else if (sawLocked && firstUnlocked === null) firstUnlocked = { ...ctx.you.sec };
  };
  const lockIn = await pilotUntil([a, b], () => a.you.sec.locked, cfg.overheatMs + 2000, 'sec overheat lock');
  await holdFor([a, b], flightMs + 4 * DT); // still held: the last rounds land, no new ones fire
  const hpAtLock = b.you.hp;
  const lockRounds = (hpCold - hpAtLock) / blow;
  // ...still held through the lock: nothing may land until heat is back to zero.
  const coolIn = await pilotUntil([a, b], () => !a.you.sec.locked, cfg.coolMs + 2000, 'sec lock clears');
  const hpAtUnlock = b.you.hp;
  const heatAtUnlock = firstUnlocked?.heat;
  a.hook = null;
  await holdFor([a, b], flightMs + 6 * DT); // still held: the guns are back
  held = false;
  await holdFor([a, b], flightMs + 4 * DT);
  const hpEnd = b.you.hp;
  const hits = b.dmg;
  const ws = b.shellW;
  log.push(
    `sec: ${GUNNER} -> ${GUN_TARGET} at ${D}u (reach ${reach}); blow ${blow} (${cfg.damage} x armor curve); ` +
      `burst ${secs(cfg.overheatMs / 4)}: heat max ${burstMax.toFixed(3)} -> ${heatAfterRelease.toFixed(3)} after release, ${burstRounds} rounds, drained in ${secs(drainedIn)}; ` +
      `hold from cold locked in ${secs(lockIn)} after ${lockRounds} rounds (stepper says ${toLock}); lock cleared ${secs(coolIn)} later (heat ${heatAtUnlock}), ` +
      `${(hpAtLock - hpAtUnlock) / blow} rounds while locked; resumed ${(hpAtUnlock - hpEnd) / blow} rounds; hp ${hp0}->${hpEnd}; ` +
      `${hits.length} dmg events, reveals w=[${[...new Set(ws)].join(',')}]`,
  );
  assert(lockRounds === toLock, `sec: ${lockRounds} rounds landed from cold to the lock, the shared stepper fires ${toLock}`);
  assert(hpAtUnlock === hpAtLock, `sec: ${hpAtLock - hpAtUnlock} hp landed while LOCKED (still held)`);
  // The first unlocked frame shows heat zero, or at most ONE firing step past
  // it (a frame can carry the next tick, which fires again while held).
  assert(heatAtUnlock !== undefined && heatAtUnlock <= DT / cfg.overheatMs + 1e-9, `sec: the lock cleared at heat ${heatAtUnlock}, not zero`);
  assert(hpEnd < hpAtUnlock, 'sec: no round after the lock cleared although still held');
  assert(ws.length > 0, 'sec: the target never saw a round reveal (the w check would be vacuous)');
  for (const w of ws) assert(w === 'mg', `sec: a round reveal carried w='${w}', expected 'mg'`);
  for (const h of hits) assert(h.amount === blow, `sec: a ${h.amount}-damage blow, expected ${blow}`);
  assert((hp0 - hpEnd) === hits.length * blow, `sec: hp ${hp0}->${hpEnd} is not ${hits.length} dmg events x ${blow}`);
  assert(a.fireSeq === 0, 'sec: the stream sent a click edge — it must be a level only');
  await leaveAll([a, b]);
}

/** Every event `ctx` was shown at `p` (within `r`) of the given kinds whose
 *  id is not `exceptId`. */
function eventsAt(ctx, p, r, kinds, exceptId) {
  return ctx.events.filter((e) => kinds.includes(e.k) && e.id !== exceptId && Number.isFinite(e.x) && Math.hypot(e.x - p.x, e.y - p.y) <= r);
}

/** PHASE 8 — the secondaries pop a mine on the landing CONFIG implies. */
async function secondariesMinePhase(log) {
  const layerPose = { x: 0, y: 0, heading: 0 };
  checkPoseWater('sec-mine layer', layerPose);
  const a = await joinClient('SM-A', LAYER, { fit: ['navalMines'], pose: layerPose });
  await awaitPosed([a], 'sec-mine');
  const laid = await layOne(a, 'sec-mine');
  const st = statsOf(GUNNER);
  const D = Math.round(0.8 * CONFIG.gunAttenuation.fullFrac * st.secondaryRangeU);
  // The shooter due north of the mine, the round flying straight down onto
  // the marker (the layer sits east of the line).
  const sPose = { x: laid.x, y: laid.y + D, heading: 0 };
  checkPoseWater('sec-mine shooter', sPose);
  checkLane('sec-mine', sPose, laid);
  const rack = statsOf(LAYER, ['navalMines']).equipment.navalMines;
  precondition(D > rack.triggerRadius + 60 && D > CONFIG.mine.blastRadius + 60, 'sec-mine: shooter inside the trip ring / blast');
  precondition(D < DETECT, 'sec-mine: the shooter cannot see the mine it shoots');
  const s = await joinClient('SM-S', GUNNER, { fit: [], pose: sPose, roomId: a.room.roomId });
  await awaitPosed([a, s], 'sec-mine shooter');
  // CONFIG's landings: the round's damage settled once (inside the full-damage
  // band, so unattenuated), against the mine's hp. No armor gate: a mine is not a hull.
  const perRound = settleBlow(CONFIG.secondaries.damage);
  const landingsNeeded = Math.ceil(CONFIG.mine.hp / perRound);
  const aim = bearing(sPose, laid);
  const aimDist = dist(sPose, laid);
  const reach = CONFIG.mine.hitRadiusU;
  // Landings = the shooter's own fall-of-shot booms ON the marker; the frame
  // that no longer lists the mine is the pop.
  let popAt = null;
  const landings = () => eventsAt(s, laid, reach, ['boom'], laid.id).length;
  s.script = (_ctx, inp) => {
    inp.aim = aim;
    inp.aimDist = aimDist;
    inp.sec = popAt === null;
  };
  let seenPresent = false;
  // Judged PER FRAME: the popping round's boom and the mine's removal share a
  // tick, and a round still in flight after the pop must not be counted.
  s.hook = (ctx) => {
    const present = ctx.mines.some((m) => m.id === laid.id);
    if (present) seenPresent = true;
    if (!present && seenPresent && popAt === null) popAt = landings();
  };
  const budget = landingsNeeded * CONFIG.secondaries.rateMs + (aimDist / CONFIG.secondaries.shellSpeed) * 1000 + 2000;
  const took = await pilotUntil([a, s], () => popAt !== null, budget, 'sec-mine: the mine pops');
  s.hook = null;
  s.script = idle;
  await holdFor([a, s], 4 * DT);
  log.push(`sec-mine: ${laid.id} (${CONFIG.mine.hp} hp) at ${aimDist.toFixed(0)}u; ${perRound}/round -> ${landingsNeeded} landings needed; popped on landing ${popAt} in ${secs(took)}; layer's own list holds it: ${a.mines.some((m) => m.id === laid.id)}`);
  assert(seenPresent, 'sec-mine: the shooter never saw the mine (vacuous)');
  assert(popAt === landingsNeeded, `sec-mine: the mine popped on landing ${popAt}, CONFIG implies ${landingsNeeded}`);
  assert(!a.mines.some((m) => m.id === laid.id), "sec-mine: the mine is still in its layer's own list");
  await leaveAll([a, s]);
}

/** PHASE 9 — a main-battery broadside on a mine's marker leaves it on the water. */
async function mainBatteryMinePhase(log) {
  const layerPose = { x: 0, y: 0, heading: 0 };
  checkPoseWater('main-mine layer', layerPose);
  const a = await joinClient('MM-A', LAYER, { fit: ['navalMines'], pose: layerPose });
  await awaitPosed([a], 'main-mine');
  const laid = await layOne(a, 'main-mine');
  const row = statsOf(GUNNER).equipment.mainBattery;
  const D = Math.round(0.8 * CONFIG.gunAttenuation.fullFrac * row.rangeU);
  // Due north of the mine, heading 0: the mine on the STARBOARD beam, every turret bears.
  const sPose = { x: laid.x, y: laid.y + D, heading: 0 };
  checkPoseWater('main-mine shooter', sPose);
  checkLane('main-mine', sPose, laid);
  precondition(D < DETECT, 'main-mine: the shooter cannot see the mine it shoots');
  const aim = bearing(sPose, laid);
  const aimPt = aimPointOf(sPose, aim, D);
  precondition(turretMounts(GUNNER).every((_, i) => turretBears(GUNNER, i, sPose, aimPt)), 'main-mine: a turret cannot bear on the mine');
  const s = await joinClient('MM-S', GUNNER, { fit: [], pose: sPose, roomId: a.room.roomId });
  await awaitPosed([a, s], 'main-mine shooter');
  const fired = await trainAndFireBroadside(s, [a], aim, D, aimPt, 'main-mine');
  const flightMs = (D / CONFIG.mainBattery.shellSpeed) * 1000;
  await holdFor([a, s], flightMs + 20 * DT);
  // The salvo LANDED ON the marker: the landing test's own reach (blast + marker).
  const reach = row.burstRadius + CONFIG.mine.hitRadiusU;
  const onMarker = eventsAt(s, laid, reach, ['burst', 'boom'], laid.id).length;
  const stillOwn = a.mines.some((m) => m.id === laid.id);
  const stillSeen = s.mines.some((m) => m.id === laid.id);
  log.push(`main-mine: ${fired.guns}-gun broadside at ${laid.id} from ${D}u: ${fired.text}; ${onMarker} detonations within ${reach}u of the marker; mine still on the water (layer ${stillOwn}, shooter ${stillSeen})`);
  assert(onMarker >= 1, 'main-mine: no shell detonated on the marker (vacuous)');
  assert(stillOwn && stillSeen, 'main-mine: the main battery took the mine off the water — its mask must not hurt a mine (R3)');
  await leaveAll([a, s]);
}

async function main() {
  const t0 = Date.now();
  const log = TRACE;
  await torpedoPhase(log);
  await minePhase(log);
  await ambushPhase(log);
  await lightTorpedoPhase(log);
  await captiveMinePhase(log);
  await mainBatteryPhase(log);
  await secondariesPhase(log);
  await secondariesMinePhase(log);
  await mainBatteryMinePhase(log);
  assert(TRACE.length > 0, 'empty trace');
  console.log('WEAPONS SMOKE OK:', { seed: MAP_SEED, wall: secs(Date.now() - t0), trace: log });
  process.exit(0);
}

main().catch((err) => {
  const bug = err.message.startsWith('PRECONDITION:');
  console.error(bug ? 'WEAPONS SMOKE SCRIPT BUG:' : 'WEAPONS SMOKE FAILED:', err.message, { trace: TRACE });
  process.exit(1);
});
