// Weapons smoke: live @colyseus/sdk clients against a running dev server,
// exercising torpedoes, mines, the main battery and the secondaries end to end — as
// SCRIPTED SCENARIOS (Story 9.15). "A smoke places, it does not sail."
//
// WHY IT USED TO FLAKE. Every hull carried a heuristic pilot (rendezvous to
// the midpoint, hold-station loiter, island-avoid rudder bias, nearest-mine
// chase) on a RANDOM map, while passive regen
// raced every kill — so a red run measured the piloting, not the weapon.
// Now nothing sails by heuristic: every phase gets its OWN fresh room on a
// PINNED map (`mapSeed`), every hull is PLACED by the dev-only `spawnOverride`
// pose, and the
// inputs are scripted per phase through the ordinary `i` channel (so they pass
// `inputs.ts`' sanitizeInput like any client's).
//
// THE PHASES (each in its own room; every number READ from CONFIG or from the
// same `effectiveStats()` fold the server uses, never typed here):
//   1. TORPEDO KILL — an Iowa with a stationary Yamato on its starboard BEAM
//      (R28: the launchers fire across the beam, never dead ahead), fitted
//      heavy torpedo + SECOND LAUNCHER TUBE (two tubes on the fore launcher,
//      each on its own clock — Story 10.6), aims the launcher at the target
//      (it points there at once — no traverse, Story 11.1), then clicks
//      every tick. The own block's `launchers` are checked loaded. The KILL
//      PLAN (torpedo count, time) is simulated below from the fitted row and
//      the target's hp (with the R8 passive regen, Story 10.5), and printed; the budget is the plan
//      plus one reload. Asserts a hit at the armor-curve blow, the roster
//      death + kill. The radar half of the torpedo contract (a torpedo's WATER
//      paints while the torpedo itself stays silent beyond detect, amendment 196)
//      lives in server/src/__tests__/perception.test.ts, not here.
//   2. MINE VISIBILITY + NO EVICTION — a stationary layer (Warspite) clicks naval
//      mines astern (inside `placeRange`, spread over the rear sector) while a
//      stationary observer sits at a FIXED point abeam of one drop point, just
//      inside the mine eye reach of it (3 hm — Story 11.2). Fit: naval
//      mines + SECOND MINE RACK (Story 10.6, R7) — the own block's two racks
//      are checked full at spawn and one-short-each after two drops (R17
//      alternation). Asserts SIX own
//      mines live at once (Story 8.4 deleted every mine cap) and that the
//      observer DOES see an enemy mine inside the mine eye reach and lists
//      none from beyond it (the other drops of the fan lie outside its reach,
//      so the "never beyond" claim can fail).
//   3. MINE AMBUSH — the layer lays ONE mine; after it arms, the victim joins
//      posed beyond the trip ring on a straight line THROUGH the mine and sails it at
//      `throttle 1, rudder 0`. Asserts the mine's gated damage and a boom. (Story
//      11.2: a mine is seen at 3 hm, less than a trip ring plus half a hull, so a
//      bow-on victim need not see the mine it strikes; the fog-crossing pin —
//      no mine listed from beyond the mine eye reach — is phase 2's side-on observer.)
//   4. LIGHT TORPEDO — the target posed on the shooter's PORT BEAM (heading +
//      π/2), inside the fore launcher's firing band (R28); the shooter AIMS the
//      launcher at the beam (no click) and checks it points there before
//      firing (no traverse, Story 11.1);
//      kill plan as in 1.
//   5. CAPTIVE MINE — the layer lays one captive; the victim drives straight
//      through its trip ring. Asserts the captive row's gated damage, a boom, and
//      that the mine was expended.
//   6. MAIN BATTERY (Story 10.4, R2/R4; Story 11.1) — shooter (the default
//      hull) and target stationary, the target dead on the shooter's beam at
//      GUN_RANGE_FRAC of reach so EVERY turret bears. The shooter holds its aim
//      until its own `you.turrets` show every turret pointing at the aim point
//      (no traverse: a socket round-trip), clicks ONCE (exactly one turret —
//      the lowest index — starts reloading, `ammo[0].n` drops by one), then
//      once per tick until every turret has fired; every dispersed shell still
//      lands on the broadside hull. Asserts every
//      shell reveal is `cannon`, the target took one gated blow per gun, and on
//      every own frame `ammo[0]` is the turrets' summary.
//   7. SECONDARIES (R3) — `sec: true` on a target inside half the main reach:
//      a short burst (heat rises, then drains after release with no further
//      rounds), then a continuous hold from cold to FULL HEAT (the rounds
//      landed equal the shared stepper's count to full heat), then a hold AT
//      full heat: heat stays 1 and rounds keep landing — full heat never locks
//      (epic-11 amendment 9).
//      Asserts `mg` reveals and the gated per-round blow.
//   8. SECONDARIES POP A MINE — a captain within secondary reach of an enemy
//      mine holds `sec` on its marker; the mine vanishes on the landing CONFIG
//      implies (ceil(mine hp / the settled round damage)), not before.
//   9. MAIN BATTERY IGNORES A MINE — a full broadside lands on a mine's
//      marker; the mine is still on the water afterwards.
//  6b. DIRECT HITS ONLY (epic-11 amendment 8) — a broadside aimed at open
//      water: a hull lying across the path is passed over, a hull beside the
//      landing (inside the retired 15 u blast) is untouched; the shells land.
//  10. HULL REPAIR (Story 10.5, R1) — a full hull's `C` press is denied
//      'blocked' and starts no cooldown; a torpedo hurts it; the next press
//      lands the instant heal (+ the first pool tick at most) and the own
//      block shows `repairReadyAt` ≈ the frame's server time + the cooldown —
//      the patient holds a HULL REPAIR card, so heal and cooldown are its own
//      folded `stats.repair` (Story 10.6, R8);
//      a press inside the cooldown is denied 'cooling' (carrying `act`) and
//      heals nothing new.
//  11. PASSIVE REGEN (R8) — the same hull, left unhurt, holds its hp after
//      the repair pool is spent and starts rising only once
//      `CONFIG.regen.outOfCombatMs` have passed since the blow, at the shared
//      `regenGain` rate. (Adds ~20 s of wall time: the wait is CONFIG's 15 s
//      and no dev override shortens it.)
//  12. SMOKE (R2) — `V` puts a cloud in the presser's own frame at its
//      position and shows `smokeReadyAt`; a second press is denied 'cooling'.
//      The presser holds a SMOKE SCREEN card: the cooldown and the cloud's
//      STAMPED life and disc are its folded `stats.smoke` (Story 10.6, R9 / I6).
//  13. ONE KIND PER SLOT — a dev fit of LIGHT + HEAVY torpedo + naval mines +
//      FLASH SHELLS: the heavy is refused (a second torpedo kind), the light
//      holds Q (slot 2), the mine E (slot 3), the flash shells R (slot 4) —
//      read off the client's own `cards` through the shared `slotsWithCards`
//      and off `you.ammo`.
//  14. A MOVED WEAPON FIRES FROM ITS SLOT — the same hull fires FLASH SHELLS
//      from slot 4: its own frame shows the tagged burst (`f`, `r` = the
//      folded radius) at the aim point and slot 4 reloading.
//
// THE WEAPONS ARE PRE-FITTED through the DEV-ONLY `fitOverride` join option
// (Story 8.10, EPIC-8 amendment 65): each fitted line lands in its FAMILY's
// slot (Story 10.5 — 2 torpedo Q, 3 mine E, 4 special shell R; 0 is the main
// battery, 1 the Shift).
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
  abilityCode,
  bearing,
  damageMultiplierFor,
  effectiveStats,
  equipmentMaxAmmo,
  familySlotFor,
  generateMap,
  hullSilhouette,
  initialSecondaries,
  islandBlocksSegment,
  islandDistance,
  launcherAimPoint,
  launcherArcHolds,
  launcherStationWorld,
  pointPolygonDistance,
  polygonMaxRadius,
  transformPolygon,
  dispersionAxes,
  regenGain,
  secondariesIntervalMs,
  settleBlow,
  slotsWithCards,
  stepSecondaries,
  turretAngle,
  turretBears,
  turretMounts,
} from '@salvo/shared';

const endpoint = process.env.WS_URL || 'ws://localhost:2567';
// u — A MINE'S OWN EYE REACH (Story 11.2, R4 / R18: 3 hm). It replaced the
// detect rung (`CONFIG.vision.detect`, = sight) this smoke was posed on. It
// is SHORTER than a trip ring plus half a hull, so a hull steaming bow-on at
// a mine trips it before its centre ever comes inside the reach — the phases
// below watch a mine from ABEAM, never from dead ahead.
const DETECT = CONFIG.vision.mineSight;
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

/** u — a torpedo click's aim distance: any positive distance names the
 *  bearing (Story 10.6 — a torpedo click with none is refused out-of-arc). */
const TORP_AIM_U = 300;
/** ms — an aim-only hold before a torpedo click: the aim reaches the server
 *  and the launcher's DERIVED angle comes back on the own frame — a few ticks
 *  (no traverse since Story 11.1, R16; `CONFIG.mainBattery.traverseDegPerS`
 *  retired 2026-11-12). */
const LAUNCHER_TRAIN_MS = 4 * DT;
/** The gunnery distance as a share of the folded reach. RE-POSED for Story
 *  11.2 (2026-11-12): the main battery reaches 380 hm now and every pose
 *  lives in the 750 u island-free centre disc, so the share is the one that
 *  keeps the longest shot (the main battery's, shooter one shot-length off
 *  the origin) inside that disc on EVERY hull's reach ratio — a mid-range
 *  shot of several hundred u, inside reach and sight. (It was 0.4 on the
 *  1,000 u reach.) Dispersion at this range is a few units along the shot. */
const GUN_RANGE_FRAC = 0.065;

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
const MATCH_OVERRIDE = { sandbox: true };

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
    expectCards: opts.expectCards, // the cards the server must show when a dev fit line is REFUSED
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
    secSeen: 0, // own frames carrying a `{heat}` sec block
    hook: null, // a phase's per-frame judge (Story 10.4), run after the frame is filed
    seq: 0,
    fireSeq: 0,
    actSeq: 0, // the ability press counter (Story 10.5) — sticky like fireSeq
    act: 0, // the ability the latest press named (wire code), sticky with actSeq
    lastT: 0, // the server time `t` of the latest frame
    hpTrace: [], // [{ t, hp }] of every own frame
    denied: [], // every FrameMsg.denied entry this client is shown, with `ft`
    clouds: [], // the latest FrameMsg.clouds
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
  ctx.lastT = f.t;
  if (f.you) {
    ctx.you = f.you;
    ctx.hpTrace.push({ t: f.t, hp: f.you.hp });
    checkBatterySummary(ctx, f.you);
  }
  for (const d of f.denied ?? []) ctx.denied.push({ ...d, ft: f.t });
  ctx.clouds = f.clouds ?? [];
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
  if (you.sec && typeof you.sec.heat === 'number' && !('locked' in you.sec)) ctx.secSeen += 1;
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
  return { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, slot: 0, fireT: 0, actSeq: ctx.actSeq, act: ctx.act, hornSeq: 0, held: false, sec: false };
}
/** A stationary hull. */
function idle() {}
/** The family slot (Story 10.5: 2 Q torpedo, 3 E mine, 4 R shell) of the
 *  hull's first fitted slot weapon — the shared `familySlotFor`, never a literal. */
function weaponSlotOf(ctx) {
  const slot = ctx.fit.map((id) => familySlotFor(id)).find((s) => s !== null && s !== undefined);
  precondition(slot !== undefined, `${ctx.name}: no slot weapon in the fit ${JSON.stringify(ctx.fit)}`);
  return slot;
}
/** Click the fitted weapon (its family slot) at a CONSTANT bearing every
 *  tick — the reload paces launches; an empty-pool click is a harmless denial. */
const clickAt = (aim, aimDist = 0) => (ctx, inp) => {
  inp.slot = weaponSlotOf(ctx);
  inp.aim = aim;
  inp.aimDist = aimDist;
  inp.fireSeq = ++ctx.fireSeq;
};
/** Hold the fitted weapon's aim on a bearing WITHOUT clicking — the
 *  launchers point at the cursor inside their bands (no traverse since Story
 *  11.1), so this is only the aim's round trip before the first click. */
const aimAt = (aim, aimDist) => (ctx, inp) => {
  inp.slot = weaponSlotOf(ctx);
  inp.aim = aim;
  inp.aimDist = aimDist;
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
    const want = c.expectCards ?? c.fit;
    assert(JSON.stringify(c.you.cards) === JSON.stringify(want), `${label}: ${c.name} fitted ${JSON.stringify(c.you.cards)}, expected ${JSON.stringify(want)}`);
  }
}

async function leaveAll(clients) {
  for (const c of clients) await c.room.leave();
}

// --- kill plans -------------------------------------------------------------

/**
 * THE KILL PLAN, simulated from CONFIG/the fold (Eric ruling 4, 2026-10-22):
 * a shooter clicking every tick from `tubes` LOADED tubes — one click, one
 * torpedo, from the lowest loaded tube, which then reloads on ITS OWN clock
 * for `reloadMs` (Story 10.6, R6, sim/launchers.ts) — each torpedo landing
 * `flightMs` after launch for `damage`, against a target of `hp`. 2026-11-05
 * (Story 10.5, R8): the PASSIVE REGEN is back — a target left unhurt for
 * `CONFIG.regen.outOfCombatMs` heals the shared `regenGain` every tick, so
 * the plan replays it between hits as the server does. Returns the torpedoes
 * needed and the kill time, or null when the regen outheals the fit inside an
 * hour.
 */
function killPlan({ hp, damage, tubes, reloadMs, flightMs }) {
  let t = 0;
  const clocks = new Array(tubes).fill(0);
  let cur = hp;
  let hits = 0;
  let lastHit = 0;
  const pending = [];
  while (t < 3_600_000) {
    const k = clocks.findIndex((c) => c <= 0);
    if (k >= 0) {
      clocks[k] = reloadMs;
      pending.push(t + flightMs);
    }
    t += DT;
    for (let i = 0; i < clocks.length; i += 1) clocks[i] = Math.max(0, clocks[i] - DT);
    if (t - lastHit >= CONFIG.regen.outOfCombatMs) cur += regenGain(cur, hp, DT / 1000);
    while (pending.length > 0 && pending[0] <= t) {
      pending.shift();
      cur -= damage;
      hits += 1;
      lastHit = t;
      if (cur <= 0) return { fish: hits, killAtMs: t };
    }
  }
  // No kill inside an hour: with the regen back, a lone slow tube can stall
  // short of a kill (the trace prints it; the chosen fit must kill).
  return null;
}

/**
 * Pick the torpedo fit: the line plus the SECOND LAUNCHER TUBE one-off — TWO
 * tubes on the fore launcher (Story 10.6, R4 / R6: tubes come only from the
 * one-off cards now, never a tier). The bare-line plan and the chosen plan
 * both go to the trace.
 */
function torpedoFit(line, shooterCls, target, rangeU) {
  const tgt = effectiveStats(CONFIG.shipClasses[target.cls], target.fit);
  const planFor = (cards) => {
    const shooter = effectiveStats(CONFIG.shipClasses[shooterCls], cards);
    const row = shooter.equipment[line];
    const flightMs = (rangeU / row.speed) * 1000;
    // The blow the target's hull takes: the server's armor curve over its ARMOR
    // minus the shooter's POWER (Story 10.3 indices), floored (World.floorBlow)
    // — as matchSmoke.
    const blow = Math.max(1, Math.floor(row.damage * damageMultiplierFor(tgt.armor - shooter.power)));
    return { cards, row, blow, plan: killPlan({ hp: tgt.maxHp, damage: blow, tubes: row.maxAmmo, reloadMs: row.reloadMs, flightMs }) };
  };
  const one = planFor([line]);
  const pick = planFor([line, 'secondLauncherTube']);
  precondition(pick.row.maxAmmo === 2, `${line}: the SECOND LAUNCHER TUBE fit folds to ${pick.row.maxAmmo} tubes, not 2`);
  precondition(pick.plan !== null, `${line}: the two-tube fit never kills inside an hour against the regen`);
  const fmt = (p) => `${JSON.stringify(p.cards)} tier ${p.row.tier}: ${p.row.maxAmmo} tube(s) x ${p.row.damage} dmg (${p.blow} after armor) / ${secs(p.row.reloadMs)} -> ${p.plan === null ? 'NO KILL inside an hour (the regen outheals it)' : `${p.plan.fish} torpedoes, kill at ${secs(p.plan.killAtMs)}`}`;
  return {
    pick,
    hp: tgt.maxHp,
    text: `plan vs ${tgt.maxHp} hp, with regen: [${fmt(one)}] [${fmt(pick)}] => fitting ${JSON.stringify(pick.cards)}`,
  };
}

// --- phases -----------------------------------------------------------------

/** PHASE 1 — heavy torpedo kill. */
async function torpedoPhase(log) {
  // u — inside the heavy fish's run (every torpedo runs its row's folded
  // `runU` and then expires — Story 11.2, R5) and inside the torpedo eye
  // reach, so the target sees the fish.
  const D = 300;
  const target = { cls: TORP_TARGET, fit: [] };
  const fit = torpedoFit('heavyTorpedo', TORP_SHOOTER, target, D);
  log.push(`torpedo: ${fit.text}`);
  const row = fit.pick.row;
  const runU = row.runU;
  // R28: the launchers fire across the beam, never dead ahead — the shooter
  // heads −π/2 so B (bearing 0) sits on its STARBOARD beam.
  const aPose = { x: -D, y: 0, heading: -Math.PI / 2 };
  const bPose = { x: 0, y: 0, heading: Math.PI / 2 }; // broadside to the shooter
  checkPoseWater('torpedo A', aPose);
  checkPoseWater('torpedo B', bPose);
  checkLane('torpedo', aPose, bPose);
  precondition(D < runU && D < CONFIG.vision.torpedoSight, `torpedo: range ${D}u outside the run (${runU}) or the torpedo eye reach`);
  const a = await joinClient('WPN-A', TORP_SHOOTER, { fit: fit.pick.cards, pose: aPose });
  const b = await joinClient('WPN-B', target.cls, { fit: target.fit, pose: bPose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'torpedo');
  const brg = bearing(a.you, b.you);
  precondition(launcherArcHolds(TORP_SHOOTER, statsOf(TORP_SHOOTER, fit.pick.cards).torpedoLaunchers, a.you.heading, brg), 'torpedo: target outside the launcher arcs');
  assert(b.you.hp === fit.hp, `torpedo: target hp ${b.you.hp} != planned ${fit.hp} (shared fold vs server maxHp)`);
  const tubes = a.you.ammo[familySlotFor('heavyTorpedo')];
  assert(tubes !== null && tubes !== undefined && tubes.n === row.maxAmmo, `torpedo: shooter slot ${familySlotFor('heavyTorpedo')} holds ${tubes?.n} torpedoes, planned ${row.maxAmmo} tubes`);
  // The own block carries the launchers (Story 10.6): the fore, with every tube loaded.
  const own = (a.you.launchers ?? []).flatMap((l) => l.tubes);
  assert(own.length === row.maxAmmo && own.every((t) => t === 0), `torpedo: own launchers carry tubes ${JSON.stringify(own)}, planned ${row.maxAmmo} loaded`);
  // AIM FIRST (R28): the beam is in the fore launcher's band; it points there
  // the tick the aim arrives (no traverse, Story 11.1).
  a.script = aimAt(brg, TORP_AIM_U);
  await holdFor([a, b], LAUNCHER_TRAIN_MS);
  a.script = clickAt(brg, TORP_AIM_U);
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

/** u — how far inside the mine eye reach a watcher is posed from the mine it
 *  must see (a margin against the drop landing a unit off its aim). */
const WATCH_INSIDE_U = 8;

/** The k-th drop's point for a layer at `pose` (see `astern`). */
function dropPoint(pose, k) {
  const brg = astern(pose.heading, k);
  return { x: pose.x + Math.cos(brg) * DROP_U, y: pose.y + Math.sin(brg) * DROP_U };
}

/** u — the gap between the point `p` and the hull of `cls` at `pose`: the
 *  distance from `p` to the hull's outline (a mine trips on the silhouette,
 *  not on the centre). */
function hullGap(cls, pose, p) {
  const dx = p.x - pose.x;
  const dy = p.y - pose.y;
  const c = Math.cos(-pose.heading);
  const sn = Math.sin(-pose.heading);
  return pointPolygonDistance({ x: dx * c - dy * sn, y: dx * sn + dy * c }, hullSilhouette(cls));
}

/** PHASE 2 — mine visibility + no eviction. */
async function minePhase(log) {
  const layerPose = { x: 0, y: 0, heading: 0 };
  // FIXED observer, ABEAM of the fan's FIRST drop (k = 0 — the one click the
  // script always makes with no mine of its own yet, so that point is mined
  // on every run; later clicks read a mine count that lags the frames) and
  // just inside the mine eye reach of it, on the fan's outer side (Story
  // 11.2: a mine is seen at 3 hm, far less than the drop fan is wide, so the
  // observer watches ONE drop point, side on, with its outline clear of every
  // trip ring of the fan).
  const watched = dropPoint(layerPose, 0);
  const outward = watched.y >= layerPose.y ? 1 : -1;
  const obsPose = { x: watched.x, y: watched.y + outward * (DETECT - WATCH_INSIDE_U), heading: 0 };
  checkPoseWater('mine layer', layerPose);
  checkPoseWater('mine observer', obsPose);
  precondition(dist(obsPose, watched) < DETECT, 'mine: the observer cannot see the drop point it watches');
  // TWO RACKS (Story 10.6, R7): the naval line plus SECOND MINE RACK — each
  // rack holds the row's per-rack base and has its own clock.
  const MINE_FIT = ['navalMines', 'secondMineRack'];
  const layerStats = statsOf(LAYER, MINE_FIT);
  const rack = layerStats.equipment.navalMines;
  for (let k = 0; k < 5; k += 1) {
    precondition(hullGap(VICTIM, obsPose, dropPoint(layerPose, k)) > rack.triggerRadius + WATCH_INSIDE_U, `mine: the observer's hull is inside drop ${k}'s trip ring`);
  }
  const a = await joinClient('MINE-A', LAYER, { fit: MINE_FIT, pose: layerPose });
  const b = await joinClient('MINE-B', VICTIM, { fit: [], pose: obsPose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'mine');
  const perRack = rack.maxAmmo / layerStats.mineRacks;
  const racks0 = JSON.stringify(a.you.racks);
  assert(racks0 === JSON.stringify(Array(layerStats.mineRacks).fill({ n: perRack, reloadMsLeft: 0 })), `mine: own racks ${racks0}, expected ${layerStats.mineRacks} full racks of ${perRack}`);
  let racksSeen = '';
  a.script = (ctx, inp) => clickAt(astern(ctx.pose.heading, ctx.distinctOwn.size), DROP_U)(ctx, inp);
  // Budget: NO_EVICTION_MINES drops at one per CONFIG.mine.reloadMs is an upper
  // bound on the rack's cadence (it starts full, so it is faster), + armDelay,
  // + ONE reload of slack.
  const budget = NO_EVICTION_MINES * rack.reloadMs + CONFIG.mine.armDelay + rack.reloadMs;
  const took = await pilotUntil([a, b], () => {
    // THE ALTERNATION (R17): after the first two drops each rack is one short.
    if (racksSeen === '' && a.distinctOwn.size === 2) racksSeen = JSON.stringify((a.you.racks ?? []).map((r) => r.n));
    return a.maxConcurrentOwn >= NO_EVICTION_MINES;
  }, budget, `A hold ${NO_EVICTION_MINES} mines live at once`);
  log.push(`mines: racks at spawn ${racks0}; mines per rack after two drops ${racksSeen} (alternating — R17)`);
  assert(racksSeen === '' || racksSeen === JSON.stringify(Array(layerStats.mineRacks).fill(perRack - 1)), `mine: after two drops the racks hold ${racksSeen}, expected one drop from each`);
  log.push(
    `mines: A held ${a.maxConcurrentOwn} own mines live at once (${a.distinctOwn.size} laid) in ${secs(took)} (budget ${secs(budget)}, rack ${rack.maxAmmo} / ${secs(rack.reloadMs)}); ` +
      `B saw ${b.distinctEnemy.size} distinct A-mines, max ${b.maxConcurrentEnemy} at once`,
  );
  assert(b.distinctEnemy.size > 0, 'B never saw an enemy mine inside the mine eye reach (disclosure inside it broke)');
  // THE FOG PIN (it lived on the ambush until Story 11.2): no enemy mine is
  // ever first listed from beyond the mine eye reach.
  for (const [id, d] of b.firstSeenDist) assert(d <= DETECT + 1, `mine ${id} first seen at ${d.toFixed(0)}u (> the mine eye reach ${DETECT.toFixed(0)}u)`);
  log.push(`mines: every enemy mine B listed was first seen inside the mine eye reach (${DETECT.toFixed(0)}u)`);
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

/** Pose a victim on a straight line through `mine`, heading at it, 100 u
 *  short of whichever is FARTHER from the mine: its bow on the trip ring
 *  (`triggerRadius`), or its centre on the mine eye reach — so it starts
 *  outside the ring AND beyond the mine eye reach whatever that reach is
 *  (3 hm when this phase was written, 10 hm since 2026-11-12); the line runs
 *  along −y so it passes the layer (at the origin) wide. */
function victimPoseThrough(mine, triggerRadius) {
  const approach = Math.round(Math.max(triggerRadius + polygonMaxRadius(hullSilhouette(VICTIM)), DETECT) + 100);
  precondition(approach > DETECT, 'victim posed inside the mine eye reach');
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
  const { pose, approach } = victimPoseThrough(laid, statsOf(LAYER, ['navalMines']).equipment.navalMines.triggerRadius);
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
  // Story 11.2: a hull steaming bow-on trips the mine before its centre is
  // inside the 3 hm mine eye reach, so the victim may never list the mine it
  // struck — that is the rule now, not a leak (the non-vacuous fog pin is
  // PHASE 2's side-on observer). Whatever it did list was inside the reach.
  for (const [id, d] of b.firstSeenDist) assert(d <= DETECT + 1, `mine ${id} first seen at ${d.toFixed(0)}u (> the mine eye reach)`);
  await leaveAll([a, b]);
}

/** PHASE 4 — the light torpedo, fired ABEAM from the fore launcher
 *  (Story 10.6: the twin beam sectors are gone). */
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
  const a = await joinClient('LT-A', TORP_SHOOTER, { fit: fit.pick.cards, pose: aPose });
  const b = await joinClient('LT-B', target.cls, { fit: target.fit, pose: bPose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'light');
  const tubes = a.you.ammo[familySlotFor('lightTorpedo')];
  assert(tubes !== null && tubes !== undefined && tubes.n === row.maxAmmo, `light: shooter slot ${familySlotFor('lightTorpedo')} holds ${tubes?.n} torpedoes, planned ${row.maxAmmo} tubes`);
  const brg = bearing(a.you, b.you);
  precondition(launcherArcHolds(TORP_SHOOTER, statsOf(TORP_SHOOTER, fit.pick.cards).torpedoLaunchers, a.you.heading, brg), 'light: target outside the launcher arcs');
  // AIM FIRST: the fore launcher points at the cursor inside its band the
  // tick the aim arrives (no traverse, Story 11.1) — checked below on the
  // own frame before the click.
  a.script = aimAt(brg, TORP_AIM_U);
  await holdFor([a, b], LAUNCHER_TRAIN_MS);
  // ON the aim point as seen FROM ITS OWN STATION (the shared geometry the
  // server's pick measures with — a launcher forward of the centre sees the
  // beam point a little abaft the beam).
  const ang = a.you.launchers?.[0]?.a;
  const st = launcherStationWorld(TORP_SHOOTER, 0, a.you);
  const ap = launcherAimPoint(a.you, TORP_SHOOTER, brg, TORP_AIM_U);
  const want = Math.atan2(ap.y - st.y, ap.x - st.x);
  assert(ang !== undefined && Math.abs(angleDiff(a.you.heading + ang, want)) < 0.05, `light: the fore launcher sits at ${ang} rad after the aim, not on it (${want.toFixed(3)} rad from its station)`);
  a.script = clickAt(brg, TORP_AIM_U);
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
  const { pose, approach } = victimPoseThrough(laid, row.triggerRadius);
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
/** rad — "on the aim" for an own-frame turret angle: half a degree of display
 *  slack (the derived angle is exact on the server; `onTargetDeg` retired
 *  2026-11-12, Story 11.1). */
const ON_AIM_TOL_RAD = Math.PI / 360;
/** ms — the aim reaches the server and the derived turret angles come back
 *  on the own frame: socket slack only (no traverse since Story 11.1, R16). */
const SNAP_BUDGET_MS = 1000;

/** Indices of the turrets this own frame shows AT their derived angle for
 *  the aim point — at the aim inside the arc (shared `turretAngle`). */
function turretsOnAim(ctx, aimPt) {
  const t = ctx.you?.turrets ?? [];
  const pose = { x: ctx.you.x, y: ctx.you.y, heading: ctx.you.heading };
  return t.flatMap((tt, i) => (turretBears(ctx.cls, i, pose, aimPt) && Math.abs(tt.a - turretAngle(ctx.cls, i, pose, aimPt)) <= ON_AIM_TOL_RAD ? [i] : []));
}
const reloadingTurrets = (ctx) => (ctx.you?.turrets ?? []).flatMap((t, i) => (t.reloadMsLeft > 0 ? [i] : []));

/**
 * Hold the main-battery aim on `aimPt` (bearing `aim`, distance `aimDist`
 * from the ship centre) until the own frame shows EVERY turret pointing at it
 * (no traverse — a socket round-trip, R16), click ONCE and check that exactly
 * ONE turret (the lowest index — every turret bears, bow first) started its
 * reload, then click once per tick until every turret has fired. Returns what
 * the trace prints.
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
  // AIM: no traverse (R16) — the budget is socket slack only.
  const trainedIn = await pilotUntil([a, ...others], () => turretsOnAim(a, aimPt).length === mounts.length, SNAP_BUDGET_MS, `${label}: every turret on the aim`);
  assert(reloadingTurrets(a).length === 0, `${label}: a turret is reloading before the first click`);
  assert(a.you.ammo[0].n === mounts.length, `${label}: ammo[0].n ${a.you.ammo[0].n} before the first click, expected ${mounts.length} ready turrets`);
  // ONE CLICK: one turret fires, only its reload starts.
  clickNow = true;
  await pilotUntil([a, ...others], () => reloadingTurrets(a).length > 0, 1000 + 4 * DT, `${label}: the first click's turret starts reloading`);
  const first = reloadingTurrets(a);
  const firstN = a.you.ammo[0].n;
  assert(first.length === 1, `${label}: ONE click started ${first.length} reloads (turrets ${JSON.stringify(first)}) — expected exactly one`);
  assert(first[0] === 0, `${label}: the click fired turret ${first[0]}, expected turret 0 (the lowest-index turret that bears, R16)`);
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
    text: `on the aim in ${secs(trainedIn)} (no traverse); click 1 -> turret ${first[0]} reloading, ammo[0].n ${mounts.length}->${firstN}; ` +
      `${clicks} click(s) total -> every turret reloading [${left.join(', ')}] ms (folded ${row.reloadMs})`,
  };
}

/** PHASE 6 — the main battery: aim, one turret per click, a full broadside. */
async function mainBatteryPhase(log) {
  // The FOLDED row from the same fold the server uses (EMPTY fit). Damage is
  // flat with range (Story 11.1); the pair sits at GUN_RANGE_FRAC of reach.
  const row = statsOf(GUNNER).equipment.mainBattery;
  const D = Math.round(GUN_RANGE_FRAC * row.rangeU);
  // The target dead on the shooter's STARBOARD beam (shooter heading +π/2,
  // bearing 0), broadside to the fall of shot (its length across the line of
  // fire): every barrel aims at its centre (converge, R13) and each shell's
  // dispersed landing is a few units off it, so every shell lands on the hull.
  const aPose = { x: -D, y: 0, heading: Math.PI / 2 };
  const bPose = { x: 0, y: 0, heading: Math.PI / 2 };
  checkPoseWater('main A', aPose);
  checkPoseWater('main B', bPose);
  checkLane('main', aPose, bPose);
  precondition(D <= row.rangeU && D < CONFIG.vision.sight, `main: ${D}u outside the reach or the target's sight`);
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

/**
 * PHASE 6b — DIRECT HITS ONLY (Eric 2026-11-13, epic-11 amendment 8: "Only
 * the landing point counts"). The shooter aims at OPEN WATER 2·D out on its
 * beam. Hull P lies broadside ACROSS the line of fire at D — every shell's
 * path crosses it — and hull Q lies ALONG the line of fire beside the aim
 * point, its outline a few units off it: inside the retired 15 u blast,
 * outside every landing (the across-shot spread at 2·D). Neither takes a
 * blow, and the shooter sees its shells land (landing booms at the aim).
 */
async function mainBatteryDirectHitPhase(log) {
  const row = statsOf(GUNNER).equipment.mainBattery;
  const D = Math.round(GUN_RANGE_FRAC * row.rangeU);
  const aPose = { x: -D, y: 0, heading: Math.PI / 2 };
  const aimPt = { x: D, y: 0 };
  const pPose = { x: 0, y: 0, heading: Math.PI / 2 }; // across the line of fire, mid-path
  // Q along the line of fire, beside the aim point: its nearest outline
  // `GAP` u off the aim, the across spread (half its full width) inside that.
  const across = dispersionAxes(2 * D).acrossU / 2;
  const GAP = Math.ceil(across) + 3;
  precondition(GAP < CONFIG.gun.burstRadius, `main-direct: a ${GAP} u gap is outside the retired 15 u blast (the case would not discriminate)`);
  const halfBeam = Math.max(...hullSilhouette(GUN_TARGET).map((v) => Math.abs(v.y)));
  const qPose = { x: D, y: halfBeam + GAP, heading: 0 };
  const qPoly = transformPolygon(hullSilhouette(GUN_TARGET), qPose.x, qPose.y, qPose.heading);
  precondition(Math.abs(pointPolygonDistance(aimPt, qPoly) - GAP) < 0.5, 'main-direct: Q is not GAP u off the aim point');
  for (const [l, p] of [['A', aPose], ['P', pPose], ['Q', qPose]]) checkPoseWater(`main-direct ${l}`, p);
  checkLane('main-direct', aPose, aimPt);
  precondition(2 * D <= row.rangeU, 'main-direct: the aim point is past the reach');
  const aim = bearing(aPose, aimPt);
  const mounts = turretMounts(GUNNER);
  precondition(mounts.every((_, i) => turretBears(GUNNER, i, aPose, aimPt)), 'main-direct: a turret cannot bear on the beam aim');
  const a = await joinClient('MD-A', GUNNER, { fit: [], pose: aPose });
  const pc = await joinClient('MD-P', GUN_TARGET, { fit: [], pose: pPose, roomId: a.room.roomId });
  const qc = await joinClient('MD-Q', GUN_TARGET, { fit: [], pose: qPose, roomId: a.room.roomId });
  await awaitPosed([a, pc, qc], 'main-direct');
  const hpP = pc.you.hp;
  const hpQ = qc.you.hp;
  const fired = await trainAndFireBroadside(a, [pc, qc], aim, 2 * D, aimPt, 'main-direct');
  await holdFor([a, pc, qc], ((2 * D) / CONFIG.mainBattery.shellSpeed) * 1000 + 20 * DT);
  const reachAlong = dispersionAxes(2 * D).alongU / 2 + 1;
  const landed = eventsAt(a, aimPt, reachAlong, ['boom']).filter((e) => e.hit === undefined).length;
  log.push(
    `main-direct: ${fired.guns} guns at open water ${2 * D}u out; P across the path at ${D}u hp ${hpP}->${pc.you.hp} (${pc.dmg.length} dmg); ` +
      `Q ${GAP}u beside the aim (outline) hp ${hpQ}->${qc.you.hp} (${qc.dmg.length} dmg); ${landed} landing booms within ${reachAlong.toFixed(1)}u of the aim`,
  );
  assert(landed >= 1, 'main-direct: no shell landed at the aim point (vacuous)');
  assert(pc.dmg.length === 0 && pc.you.hp === hpP, 'main-direct: the hull on the path took a blow — the shell must pass over it');
  assert(qc.dmg.length === 0 && qc.you.hp === hpQ, 'main-direct: the hull beside the landing took a blow — only a landing INSIDE a hull counts');
  await leaveAll([a, pc, qc]);
}

/** The shared stepper's own count: rounds a CONTINUOUS hold fires from cold
 *  up to the round that reaches full heat (sim/secondaries.ts — the very
 *  function the server steps). */
function roundsToFull() {
  const s = initialSecondaries();
  let n = 0;
  for (let i = 0; i < 100000 && s.heat < 1; i++) n += stepSecondaries(s, true, DT);
  precondition(s.heat === 1, 'secondaries: the shared stepper never reaches full heat');
  return n;
}

/** PHASE 7 — the secondaries: burst, release, cold to full heat, firing on at full heat. */
async function secondariesPhase(log) {
  const st = statsOf(GUNNER);
  const reach = st.secondaryRangeU;
  const D = Math.round(GUN_RANGE_FRAC * reach);
  const aPose = { x: -D, y: 0, heading: Math.PI / 2 };
  const bPose = { x: 0, y: 0, heading: Math.PI / 2 };
  checkPoseWater('sec A', aPose);
  checkPoseWater('sec B', bPose);
  checkLane('sec', aPose, bPose);
  precondition(D + SEC_OVERSHOOT_U <= reach, `sec: ${D}u (+${SEC_OVERSHOOT_U}) outside the reach ${reach}`);
  const cfg = CONFIG.secondaries;
  const blow = gatedBlow(cfg.damage, statsOf(GUN_TARGET), st);
  const toFull = roundsToFull();
  const hotMs = secondariesIntervalMs(1);
  const flightMs = ((D + SEC_OVERSHOOT_U) / cfg.shellSpeed) * 1000;
  const a = await joinClient('SEC-A', GUNNER, { fit: [], pose: aPose });
  const b = await joinClient('SEC-B', GUN_TARGET, { fit: [], pose: bPose, roomId: a.room.roomId });
  await awaitPosed([a, b], 'sec');
  assert(a.you.sec && a.you.sec.heat === 0 && !('locked' in a.you.sec), `sec: a fresh hull's sec block is ${JSON.stringify(a.you.sec)}, expected cold`);
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
  assert(heatAfterRelease < burstMax, `sec: heat ${heatAfterRelease} after release did not drain below ${burstMax}`);
  assert(burstRounds >= 1 && Number.isInteger(burstRounds), `sec: the burst took ${hp0 - hpAfterBurst} hp, not a whole number (>= 1) of ${blow}-hp rounds`);
  assert(hpQuiet === hpAfterBurst, `sec: the target lost ${hpAfterBurst - hpQuiet} hp after release — rounds without the trigger`);
  // (b) TO FULL HEAT: a continuous hold from cold, released on the first own
  // frame at full heat — inside the capping round's own interval, so no
  // further round fires — then every round in flight lands.
  const hpCold = b.you.hp;
  held = true;
  a.hook = (ctx) => {
    if (ctx.you.sec.heat === 1) held = false;
  };
  const fullIn = await pilotUntil([a, b], () => a.you.sec.heat === 1, cfg.overheatMs + 2000, 'sec full heat');
  await holdFor([a, b], flightMs + 4 * DT);
  a.hook = null;
  const hpAtFull = b.you.hp;
  const fullRounds = (hpCold - hpAtFull) / blow;
  // (c) AT FULL HEAT: held again until heat is back at 1, then held on for
  // three hot intervals — every own frame shows heat 1, and rounds land.
  // The re-press waits for a frame that shows the gun cooling first: a stale
  // full-heat frame would end the next wait before any held input went out,
  // and the press could then land a tick after cooling began (review fix).
  await pilotUntil([a, b], () => a.you.sec.heat < 1, cfg.coolMs + 2000, 'sec starts cooling after the release');
  held = true;
  await pilotUntil([a, b], () => a.you.sec.heat === 1, cfg.overheatMs + 2000, 'sec back at full heat');
  const hpHot0 = b.you.hp;
  let hotFrames = 0;
  let coolerFrames = 0;
  a.hook = (ctx) => {
    if (ctx.you.sec.heat === 1) hotFrames += 1;
    else coolerFrames += 1;
  };
  await holdFor([a, b], 3 * hotMs);
  a.hook = null;
  held = false;
  await holdFor([a, b], flightMs + 4 * DT);
  const hpEnd = b.you.hp;
  const hotRounds = (hpHot0 - hpEnd) / blow;
  const hits = b.dmg;
  const ws = b.shellW;
  log.push(
    `sec: ${GUNNER} -> ${GUN_TARGET} at ${D}u (reach ${reach}); blow ${blow} (${cfg.damage} x armor curve); ` +
      `burst ${secs(cfg.overheatMs / 4)}: heat max ${burstMax.toFixed(3)} -> ${heatAfterRelease.toFixed(3)} after release, ${burstRounds} rounds, drained in ${secs(drainedIn)}; ` +
      `hold from cold reached full heat in ${secs(fullIn)} after ${fullRounds} rounds (stepper says ${toFull}); ` +
      `held ${secs(3 * hotMs)} at full heat: ${hotFrames} frames at heat 1, ${coolerFrames} cooler, ${hotRounds} rounds landed; hp ${hp0}->${hpEnd}; ` +
      `${hits.length} dmg events, reveals w=[${[...new Set(ws)].join(',')}]`,
  );
  assert(fullRounds === toFull, `sec: ${fullRounds} rounds landed from cold to full heat, the shared stepper fires ${toFull}`);
  assert(coolerFrames === 0 && hotFrames > 0, `sec: held at full heat, ${coolerFrames} own frames showed heat below 1`);
  assert(hotRounds >= 2, `sec: only ${hotRounds} rounds landed in ${secs(3 * hotMs)} held at full heat — full heat must never stop the gun`);
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
  // Story 11.2: the shooter must SEE the mine it pops (its own frames time
  // the pop), and a mine is seen at 3 hm — so it lies close ABEAM, just
  // inside the mine eye reach, its outline clear of the trip ring and the
  // blast. Due north of the mine, heading 0, the round flying straight down
  // onto the marker (the layer sits east of the line).
  const D = Math.round(DETECT - WATCH_INSIDE_U);
  const sPose = { x: laid.x, y: laid.y + D, heading: 0 };
  checkPoseWater('sec-mine shooter', sPose);
  checkLane('sec-mine', sPose, laid);
  const rack = statsOf(LAYER, ['navalMines']).equipment.navalMines;
  precondition(hullGap(GUNNER, sPose, laid) > Math.max(rack.triggerRadius, CONFIG.mine.blastRadius), 'sec-mine: shooter inside the trip ring / blast');
  precondition(D < DETECT && D <= st.secondaryRangeU, 'sec-mine: the shooter cannot see or cannot reach the mine it shoots');
  const s = await joinClient('SM-S', GUNNER, { fit: [], pose: sPose, roomId: a.room.roomId });
  await awaitPosed([a, s], 'sec-mine shooter');
  // CONFIG's landings: the round's damage settled once (flat with range), against
  // the mine's hp — each dispersed landing a unit or two off the marker's
  // centre, well inside its `hitRadiusU`. No armor gate: a mine is not a hull.
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
  const budget = landingsNeeded * secondariesIntervalMs(1) + (aimDist / CONFIG.secondaries.shellSpeed) * 1000 + 2000;
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
  const D = Math.round(GUN_RANGE_FRAC * row.rangeU);
  // Due north of the mine, heading 0: the mine on the STARBOARD beam, every turret bears.
  const sPose = { x: laid.x, y: laid.y + D, heading: 0 };
  checkPoseWater('main-mine shooter', sPose);
  checkLane('main-mine', sPose, laid);
  // Story 11.2: at gunnery distance a mine is far beyond its 3 hm eye reach,
  // so the shooter fires at a marker it cannot see — the LAYER, which always
  // lists its own mines, is the witness that it stayed on the water.
  precondition(D > DETECT, 'main-mine: the shooter is inside the mine eye reach (pose it by the sec-mine rule instead)');
  const aim = bearing(sPose, laid);
  const aimPt = aimPointOf(sPose, aim, D);
  precondition(turretMounts(GUNNER).every((_, i) => turretBears(GUNNER, i, sPose, aimPt)), 'main-mine: a turret cannot bear on the mine');
  const s = await joinClient('MM-S', GUNNER, { fit: [], pose: sPose, roomId: a.room.roomId });
  await awaitPosed([a, s], 'main-mine shooter');
  const fired = await trainAndFireBroadside(s, [a], aim, D, aimPt, 'main-mine');
  const flightMs = (D / CONFIG.mainBattery.shellSpeed) * 1000;
  await holdFor([a, s], flightMs + 20 * DT);
  // The salvo LANDED ON the marker: a landing (a `boom` since the blast
  // retired — epic-11 amendment 8) within the marker's own hit radius.
  const reach = CONFIG.mine.hitRadiusU;
  const onMarker = eventsAt(s, laid, reach, ['boom'], laid.id).length;
  const stillOwn = a.mines.some((m) => m.id === laid.id);
  log.push(`main-mine: ${fired.guns}-gun broadside at ${laid.id} from ${D}u: ${fired.text}; ${onMarker} detonations within ${reach}u of the marker; mine still on the water (its layer's own list: ${stillOwn})`);
  assert(onMarker >= 1, 'main-mine: no shell detonated on the marker (vacuous)');
  assert(stillOwn, 'main-mine: the main battery took the mine off the water — its mask must not hurt a mine (R3)');
  await leaveAll([a, s]);
}

// --- the cooldown abilities, passive regen, the family slots (Story 10.5) ----

/** Press a cooldown ability (`C` repair / `V` smoke) ONCE: the next input
 *  advances `actSeq` and names the ability by its shared wire code; both stay
 *  sticky on every later input, so a re-sent input never reads as a new press. */
function press(ctx, ability) {
  ctx.act = abilityCode(ability);
  ctx.actSeq += 1;
  return ctx.actSeq;
}
/** The ability denial (if any) the server sent for the press `seq`. */
const denialOf = (ctx, seq) => ctx.denied.find((d) => d.seq === seq && d.act !== undefined);
/** Every `heal` cue this client was shown. */
const heals = (ctx) => ctx.events.filter((e) => e.k === 'heal');

/** Wait for the server's answer to the press `seq`: a denial for it, or `ok()`. */
async function awaitAnswer(clients, ctx, seq, ok, label) {
  // Budget: a press is consumed on the next tick; a second of socket slack.
  await pilotUntil(clients, () => denialOf(ctx, seq) !== undefined || ok(), 1000 + 4 * DT, label);
  return denialOf(ctx, seq);
}

/** Hurt `v` with ONE heavy torpedo from a posed shooter `s` (phase 1's
 *  geometry). Returns the server time of the frame that carried the blow. */
async function torpedoOnce(s, v, label) {
  const brg = bearing(s.you, v.you);
  precondition(launcherArcHolds(s.cls, statsOf(s.cls, s.fit).torpedoLaunchers, s.you.heading, brg), `${label}: target outside the launcher arcs`);
  // AIM FIRST (R28): the launcher points at the aim inside its band (no traverse, Story 11.1).
  s.script = aimAt(brg, TORP_AIM_U);
  await holdFor([s, v], LAUNCHER_TRAIN_MS);
  s.script = clickAt(brg, TORP_AIM_U);
  const row = statsOf(s.cls, s.fit).equipment.heavyTorpedo;
  const flightMs = (dist(s.you, v.you) / row.speed) * 1000;
  await pilotUntil([s, v], () => v.dmg.length > 0, flightMs + 2000, `${label}: the torpedo lands`);
  s.script = idle;
  return v.lastT;
}

/** PHASES 10 + 11 — HULL REPAIR (R1) and the passive regen (R8) on one hull. */
async function repairAndRegenPhase(log) {
  const D = 300;
  const aPose = { x: 0, y: 0, heading: Math.PI / 2 }; // the patient, broadside to the shooter
  const sPose = { x: -D, y: 0, heading: -Math.PI / 2 }; // the patient on the shooter's beam (R28)
  checkPoseWater('repair A', aPose);
  checkPoseWater('repair S', sPose);
  checkLane('repair', sPose, aPose);
  // PER-SHIP NUMBERS (Story 10.6, R8): the patient holds a HULL REPAIR card,
  // so its heal and cooldown are its own folded `stats.repair`, not CONFIG's
  // no-card base (one card, so one heavy torpedo still leaves room to see the
  // heal unclamped).
  const PATIENT_FIT = ['hullRepair'];
  const a = await joinClient('REP-A', VICTIM, { fit: PATIENT_FIT, pose: aPose });
  const s = await joinClient('REP-S', TORP_SHOOTER, { fit: ['heavyTorpedo'], pose: sPose, roomId: a.room.roomId });
  await awaitPosed([a, s], 'repair');
  const hr = statsOf(VICTIM, PATIENT_FIT).repair;
  precondition(hr.instantHp > CONFIG.hullRepair.instantHp && hr.cooldownMs < CONFIG.hullRepair.cooldownMs, `repair: the two cards fold to ${JSON.stringify(hr)} — not above the no-card base`);
  const maxHp = statsOf(VICTIM, PATIENT_FIT).maxHp;
  // (a) FULL HULL: denied 'blocked', no heal, no cooldown.
  assert(a.you.hp === maxHp && a.you.repairReadyAt === undefined, `repair: a fresh hull shows hp ${a.you.hp}/${maxHp}, repairReadyAt ${a.you.repairReadyAt}`);
  const fullSeq = press(a, 'repair');
  const full = await awaitAnswer([a, s], a, fullSeq, () => heals(a).length > 0, 'repair: the full-hull press is answered');
  await holdFor([a, s], 4 * DT);
  assert(full?.reason === 'blocked' && full.act === abilityCode('repair'), `repair: the full-hull press answered ${JSON.stringify(full)}, expected 'blocked' with act ${abilityCode('repair')}`);
  assert(heals(a).length === 0 && a.you.repairReadyAt === undefined, `repair: a full-hull press healed (${heals(a).length}) or started the cooldown (${a.you.repairReadyAt})`);
  // (b) HURT, then press: the instant heal and the cooldown stamp.
  const hitT = await torpedoOnce(s, a, 'repair');
  await holdFor([a, s], 4 * DT);
  const hurt = a.you.hp;
  precondition(maxHp - hurt > hr.instantHp + hr.regenHp, `repair: the torpedo took ${maxHp - hurt} hp — too little to see the heal unclamped`);
  const seq = press(a, 'repair');
  await awaitAnswer([a, s], a, seq, () => heals(a).length > 0, 'repair: the heal cue');
  await holdFor([a, s], 2 * DT);
  // Judged on the FRAME that carried the `heal` cue (its server time `ft`).
  const healT = heals(a)[0].ft;
  const healFrame = a.hpTrace.find((p) => p.t === healT);
  assert(healFrame !== undefined, `repair: no own frame at the heal cue's time ${healT}`);
  const healed = healFrame.hp - hurt;
  const readyIn = a.you.repairReadyAt - healT;
  // The pool's first tick may ride the same frame as the instant half.
  const poolPerTick = (hr.regenHp * DT) / hr.regenMs;
  assert(healed >= hr.instantHp - 1e-6 && healed <= hr.instantHp + 2 * poolPerTick + 1e-6, `repair: hp ${hurt}->${healFrame.hp} (+${healed}), expected the instant ${hr.instantHp} (+ at most two pool ticks of ${poolPerTick})`);
  assert(Number.isFinite(readyIn) && Math.abs(readyIn - hr.cooldownMs) <= 3 * DT, `repair: repairReadyAt is ${readyIn} ms past the frame, expected ~${hr.cooldownMs} (the ship's folded stats.repair.cooldownMs)`);
  // (c) A SECOND press inside the cooldown: 'cooling', no new heal cue, the stamp unmoved.
  const readyAt = a.you.repairReadyAt;
  const heals0 = heals(a).length;
  const seq2 = press(a, 'repair');
  const cooling = await awaitAnswer([a, s], a, seq2, () => heals(a).length > heals0, 'repair: the cooling press is answered');
  assert(cooling?.reason === 'cooling' && cooling.act === abilityCode('repair'), `repair: the second press answered ${JSON.stringify(cooling)}, expected 'cooling' with act ${abilityCode('repair')}`);
  assert(heals(a).length === heals0 && a.you.repairReadyAt === readyAt, `repair: the cooling press healed or moved the stamp (${a.you.repairReadyAt} vs ${readyAt})`);
  log.push(`repair: full hull -> denied '${full.reason}' (act ${full.act}), no cooldown; torpedo ${maxHp}->${hurt}; press -> +${healed.toFixed(2)} hp (instant ${hr.instantHp}), repairReadyAt = t + ${readyIn} ms (cooldown ${hr.cooldownMs}); second press -> denied '${cooling.reason}' (act ${cooling.act}, seq ${cooling.seq})`);
  // (d) PASSIVE REGEN: once the pool is spent the hull holds, then rises when
  // outOfCombatMs have passed since the blow.
  const wait = CONFIG.regen.outOfCombatMs;
  // Budget: the pool's payout + 2 s of socket slack.
  await pilotUntil([a, s], () => a.lastT >= healT + hr.regenMs + 4 * DT, hr.regenMs + 2000, 'regen: the repair pool drains');
  const plateau = a.you.hp;
  const rising = (p) => p.t > healT && p.hp > plateau + 1e-9;
  // Budget: what is left of the wait since the blow + 2 s of socket slack.
  await pilotUntil([a, s], () => a.hpTrace.some(rising), Math.max(0, hitT + wait - a.lastT) + 2000, 'regen: hp starts rising');
  const first = a.hpTrace.find(rising);
  // ...and keeps rising at the shared law: replay regenGain tick by tick from the plateau.
  await holdFor([a, s], 1000);
  const last = a.hpTrace[a.hpTrace.length - 1];
  const flat = a.hpTrace.filter((p) => p.hp <= plateau + 1e-9).pop();
  let want = flat.hp;
  for (let t = flat.t + DT; t <= last.t + 1e-9; t += DT) want += regenGain(want, maxHp, DT / 1000);
  log.push(`regen: plateau ${plateau.toFixed(2)} after the pool; first rise ${first.t - hitT} ms after the blow (wait ${wait}); ${flat.hp.toFixed(2)}->${last.hp.toFixed(2)} over ${last.t - flat.t} ms (shared regenGain replay ${want.toFixed(2)})`);
  assert(first.t - hitT >= wait - DT, `regen: hp rose ${first.t - hitT} ms after the blow, before the ${wait} ms wait`);
  assert(first.t - hitT <= wait + 4 * DT, `regen: hp rose only ${first.t - hitT} ms after the blow (wait ${wait})`);
  assert(Math.abs(last.hp - want) <= 0.01 * (maxHp - flat.hp) + 1e-6, `regen: hp ${last.hp} after ${last.t - flat.t} ms, the shared law says ${want}`);
  await leaveAll([a, s]);
}

/** PHASE 12 — SMOKE (R2): the cloud at the presser, the stamp, the cooling press. */
async function smokePhase(log) {
  const pose = { x: 0, y: 0, heading: 0 };
  checkPoseWater('smoke', pose);
  // PER-SHIP NUMBERS (Story 10.6, R9 / I6): one SMOKE SCREEN card — the
  // cooldown and the cloud's STAMPED life and disc are the presser's folded
  // `stats.smoke`.
  const SMOKE_FIT = ['smokeScreen'];
  const sm = statsOf(VICTIM, SMOKE_FIT).smoke;
  precondition(sm.cooldownMs < CONFIG.countermeasure.cooldownMs && sm.lifeMs > CONFIG.countermeasure.lifeMs, `smoke: one card folds to ${JSON.stringify(sm)} — not past the no-card base`);
  const a = await joinClient('SMK-A', VICTIM, { fit: SMOKE_FIT, pose });
  await awaitPosed([a], 'smoke');
  assert(a.you.smokeReadyAt === undefined && a.clouds.length === 0, `smoke: a fresh hull shows smokeReadyAt ${a.you.smokeReadyAt}, ${a.clouds.length} clouds`);
  const seq = press(a, 'smoke');
  const denied = await awaitAnswer([a], a, seq, () => a.clouds.length > 0, 'smoke: the cloud appears');
  assert(denied === undefined, `smoke: the first press was denied ${JSON.stringify(denied)}`);
  const cloud = a.clouds[0];
  const readyIn = a.you.smokeReadyAt - a.lastT;
  assert(dist(cloud, a.you) <= 1, `smoke: the cloud sits ${dist(cloud, a.you).toFixed(1)} u from the presser`);
  assert(Number.isFinite(readyIn) && Math.abs(readyIn - sm.cooldownMs) <= 3 * DT, `smoke: smokeReadyAt is ${readyIn} ms past the frame, expected ~${sm.cooldownMs} (the ship's folded stats.smoke.cooldownMs)`);
  assert(cloud.lifeMs === sm.lifeMs && Math.abs(cloud.r0 - sm.r0) < 1e-9 && Math.abs(cloud.r1 - sm.r1) < 1e-9, `smoke: the cloud carries ${JSON.stringify({ lifeMs: cloud.lifeMs, r0: cloud.r0, r1: cloud.r1 })}, the presser's stats say ${JSON.stringify({ lifeMs: sm.lifeMs, r0: sm.r0, r1: sm.r1 })}`);
  const clouds0 = a.clouds.length;
  const seq2 = press(a, 'smoke');
  const cooling = await awaitAnswer([a], a, seq2, () => a.clouds.length > clouds0, 'smoke: the second press is answered');
  await holdFor([a], 4 * DT);
  assert(cooling?.reason === 'cooling' && cooling.act === abilityCode('smoke'), `smoke: the second press answered ${JSON.stringify(cooling)}, expected 'cooling' with act ${abilityCode('smoke')}`);
  assert(a.clouds.length === clouds0, `smoke: the cooling press made a cloud (${a.clouds.length} vs ${clouds0})`);
  log.push(`smoke: press -> cloud ${cloud.id} at (${cloud.x.toFixed(0)},${cloud.y.toFixed(0)}) on the presser, smokeReadyAt = t + ${readyIn} ms (cooldown ${sm.cooldownMs.toFixed(0)}), stamped life ${cloud.lifeMs} ms, disc ${cloud.r0.toFixed(1)} -> ${cloud.r1.toFixed(1)} u; second press -> denied '${cooling.reason}' (act ${cooling.act})`);
  await leaveAll([a]);
}

/** PHASES 13 + 14 — one kind per family slot, and FLASH SHELLS fired from their slot. */
async function familySlotsPhase(log) {
  const pose = { x: 0, y: 0, heading: 0 };
  checkPoseWater('family', pose);
  const ask = ['lightTorpedo', 'heavyTorpedo', 'navalMines', 'dazzleShells'];
  const kept = ask.filter((id) => id !== 'heavyTorpedo');
  const a = await joinClient('FAM-A', VICTIM, { fit: ask, expectCards: kept, pose });
  await awaitPosed([a], 'family'); // asserts `you.cards` === kept: the heavy was refused
  const st = statsOf(VICTIM, a.you.cards);
  const slots = slotsWithCards(st, a.you.cards).map((sl) => sl.equipmentId);
  const want = { lightTorpedo: familySlotFor('lightTorpedo'), navalMines: familySlotFor('navalMines'), dazzleShells: familySlotFor('dazzleShells') };
  for (const [id, slot] of Object.entries(want)) {
    assert(slots[slot] === id, `family: slot ${slot} holds ${slots[slot]}, expected ${id}`);
    assert(a.you.ammo[slot]?.n === equipmentMaxAmmo(st, id), `family: ammo[${slot}] ${JSON.stringify(a.you.ammo[slot])}, expected ${equipmentMaxAmmo(st, id)} ready (${id})`);
  }
  assert(!slots.includes('heavyTorpedo') && familySlotFor('heavyTorpedo') === want.lightTorpedo, `family: the heavy torpedo found a slot (${JSON.stringify(slots)})`);
  log.push(`family: fit ${JSON.stringify(ask)} -> cards ${JSON.stringify(a.you.cards)}; slots ${JSON.stringify(slots)}; ammo n ${JSON.stringify(a.you.ammo.map((x) => x?.n ?? null))}`);
  // FLASH SHELLS from their slot, at open water inside sight and beyond the disc.
  const row = st.equipment.dazzleShells;
  const shellSlot = want.dazzleShells;
  // (Story 11.2: sight is 200 hm now — the aim stays a couple of hundred u
  // past the disc, on the island-free centre water, not halfway to sight.)
  const aimDist = Math.round(Math.min((CONFIG.vision.sight + row.radius) / 2, row.radius + 200));
  precondition(aimDist > row.radius + 60 && aimDist < CONFIG.vision.sight && aimDist <= row.rangeU, `flash: aim ${aimDist} u outside (radius + 60, sight) or the reach ${row.rangeU}`);
  const aim = Math.PI / 2;
  const aimPt = aimPointOf(pose, aim, aimDist);
  checkLane('flash', pose, aimPt);
  let fired = false;
  a.script = (ctx, inp) => {
    inp.slot = shellSlot;
    inp.aim = aim;
    inp.aimDist = aimDist;
    if (!fired) inp.fireSeq = ++ctx.fireSeq;
    fired = true;
  };
  const burst = () => a.events.find((e) => e.k === 'burst' && e.f === true);
  const flightMs = (aimDist / CONFIG.flashShells.shellSpeed) * 1000;
  // Budget: the shell's flight + 2 s of socket slack.
  await pilotUntil([a], () => burst() !== undefined, flightMs + 2000, 'flash: the tagged burst');
  a.script = idle;
  const b = burst();
  const pool = a.you.ammo[shellSlot];
  log.push(`flash: slot ${shellSlot} fired at ${aimDist} u -> burst f=${b.f} r=${b.r} at (${b.x.toFixed(0)},${b.y.toFixed(0)}) (aim (${aimPt.x.toFixed(0)},${aimPt.y.toFixed(0)}), folded radius ${row.radius}); ammo[${shellSlot}] ${JSON.stringify(pool)} (reload ${row.reloadMs})`);
  assert(b.r === row.radius, `flash: the burst carried r=${b.r}, the folded radius is ${row.radius}`);
  assert(dist(b, aimPt) <= 5, `flash: the burst landed ${dist(b, aimPt).toFixed(1)} u from the aim point`);
  assert(pool !== null && pool !== undefined && pool.n === 0 && pool.reloadMsLeft > 0 && pool.reloadMsLeft <= row.reloadMs, `flash: slot ${shellSlot} is not reloading after the shot: ${JSON.stringify(pool)}`);
  await leaveAll([a]);
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
  await mainBatteryDirectHitPhase(log);
  await secondariesPhase(log);
  await secondariesMinePhase(log);
  await mainBatteryMinePhase(log);
  await repairAndRegenPhase(log);
  await smokePhase(log);
  await familySlotsPhase(log);
  assert(TRACE.length > 0, 'empty trace');
  console.log('WEAPONS SMOKE OK:', { seed: MAP_SEED, wall: secs(Date.now() - t0), trace: log });
  process.exit(0);
}

main().catch((err) => {
  const bug = err.message.startsWith('PRECONDITION:');
  console.error(bug ? 'WEAPONS SMOKE SCRIPT BUG:' : 'WEAPONS SMOKE FAILED:', err.message, { trace: TRACE });
  process.exit(1);
});
