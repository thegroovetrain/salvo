// Weapons smoke: two live @colyseus/sdk clients against a running dev server,
// exercising torpedoes + mines end to end.
//   1. Torpedo kill: A (torpedo boat) faces B (mine layer) bow-on and holds
//      fire until B sinks. The arithmetic is READ FROM CONFIG, never pinned
//      here: at the numbers shipping today that is SIX 50-dmg fish
//      (CONFIG.torpedo.damage) against a 300 hp Mine Layer
//      (CONFIG.shipClasses.mineLayer.hp) across ~30 s reloads
//      (CONFIG.torpedo.reloadMs) — 6x50 = 300 >= 300 hp. The smoke clicks every
//      tick, so the fish count follows the hp and the damage automatically; the
//      only thing tuning moves is the PATIENCE budget below. Asserts at least
//      one hit at exactly CONFIG.torpedo.damage and the kill on the roster.
//   2. Torpedo never blips: B collects every torpedo id it is shown (via `torp`
//      events entering its sight) and every radar blip id — asserts the sets are
//      DISJOINT (a torpedo can never appear on the scope).
//   3. Mine visibility + NO EVICTION: B — the MINE LAYER, whose DEV SPAWN FIT
//      puts `navalMines` in the FIRST WEAPON SLOT (Q, inp.slot = 2) under the
//      Story 8.5 nine-slot fixed roles [gun, boost, <fitted weapon>, ...]; mines are
//      CLICK-FIRED into the rear placement arc, not an ability — holds station clicking
//      drops astern while A loiters within detect range but outside trigger
//      range. Asserts A never sees an enemy mine beyond DETECT range (Story
//      4.9: the 3/8 rung, 0.75 × sight — the truesight bar is retired; no
//      radar/fog leak), and that SIX laid mines are SIX LIVE mines at one
//      moment — counted on A's OWN board, which a captain always sees in full
//      at any range, so the no-eviction pin carries no geometry. Story 8.4
//      (FR57/AR48) deleted every mine cap: the old assertion here — "never more
//      than maxLive at once, yet more than maxLive distinct ids over time" —
//      was the oldest-despawn proof, and the behaviour it proved is gone.
//   5. LIGHT TORPEDO (Story 8.13): a fresh pair in their OWN room. LT-A is a
//      Torpedo Boat fitted with ONE `lightTorpedo` card (tier I), which fires
//      into the TWIN BEAM SECTORS, not the bow cone — so the harness steers
//      the target ABEAM and clicks when it bears through either beam. Asserts
//      at least one hit at exactly CONFIG.lightTorpedo.damage and the kill.
//   6. CAPTIVE MINE (Story 8.13): another fresh pair. CM-A is a Mine Layer
//      fitted with `captiveMines`, which lays ONE mine astern; CM-B then
//      drives through its 144u TRIP RING, at which point the mine launches its
//      fish instead of detonating. Asserts a hit at exactly
//      CONFIG.captiveMines.damage — the CAPTIVE row's warhead, not the naval
//      rack's.
//   4. Mine ambush: A (the Torpedo Boat) sails onto a live armed mine laid by
//      B (the Mine Layer) — asserts a CONFIG.mine.damage hp drop (55 today) +
//      a boom, and that A first saw every B-mine only from within detect
//      range. main() calls `ambushPhase(b, a, log)` (a role swap, same as
//      minePhase above), so INSIDE the function the parameter names are
//      swapped from what they name outside it: the function's own `a` is
//      real client B (idled — the mine owner, holding station) and its own
//      `b` is real client A (the one sailing onto the mine and taking the
//      hit) — the log line `ambush: B.hp 250->195 boom=true` therefore
//      reports real client A's hp, not real client B's.
//
// THE WEAPONS ARE PRE-FITTED (Story 8.10, epic-8 amendment 65). FR48 deleted
// the interim spawn seed: every hull now spawns holding the SEAT'S GUN and the
// Shift boost ONLY, and its first weapon arrives as a CARD from the level-zero
// countdown offer — which this smoke's SANDBOX room does not even have (no
// Match, so no countdown and no grant). Both clients therefore ask for their
// class weapon explicitly through the DEV-ONLY `fitOverride` join option: A the
// Torpedo Boat's `heavyTorpedo`, B the Mine Layer's `navalMines`, each landing
// in slot 2 (Q) exactly where the deleted seed used to put it. Phases 5 and 6
// ask for `lightTorpedo` and `captiveMines` the same way, and run in ROOMS OF
// THEIR OWN (`client.create` + `joinById`) so no mine or wreck left by the
// first four phases can contaminate their geometry.
//
// Run against a booted server (tsx server/src/index.ts + shared/dist built),
// with HC_DEV_OPTIONS=1 in ITS env — this smoke's sandbox matchOverride +
// zoneOverride + fitOverride are otherwise stripped by the room (see
// server/src/rooms/roomOptions.ts):
//   HC_DEV_OPTIONS=1 npm run dev -w server   (separate terminal)
//   node server/scripts/weaponsSmoke.mjs
import { Client } from '@colyseus/sdk';
import { CONFIG, PROTOCOL_VERSION, bearing, angleDiff, generateMap } from '@salvo/shared';

// How many of A's mines must be LIVE AT ONCE for the no-eviction pin to bite:
// one past the per-player cap of 5 that Story 8.4 deleted.
const NO_EVICTION_MINES = 6;

const endpoint = process.env.WS_URL || 'ws://localhost:2567';
const SIGHT = CONFIG.vision.sight;
const DETECT = CONFIG.vision.detect; // Story 4.9: the mine/torpedo 3/8 detect rung (247.5u)

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sandbox (dev-only): pre-step-14 room behavior — no match lifecycle, permissive
// combat policy, storm at 2nd join. The long beat keeps that storm harmless
// for the whole choreography (this smoke predates the zone / match steps).
// Phased timeline (Story 3.1): a 10-minute beat parks the first close at 30
// minutes out, so the whole choreography runs on the full-map ring.
const SANDBOX_ZONE = { beatMs: 600000, ringSteps: [1 / 3, 2 / 3], offsetCap: 1, terminalSightFactor: 2 };

/** Each hull's own non-stub weapon line — the DEV SPAWN FIT this smoke asks
 *  for (amendment 65). Since Story 8.14 there is no deck to pay a copy out of:
 *  ANY non-stub catalog line is fittable, and an unknown or stub id (or one
 *  already held at its cap) is silently dropped. */
const CLASS_WEAPON = { torpedoBoat: 'heavyTorpedo', mineLayer: 'navalMines', battleship: 'starShells' };

/**
 * `opts.weapon` — the line to fit instead of the hull's class weapon (Story
 * 8.13's `lightTorpedo` / `captiveMines`; any non-stub catalog line works since
 * Story 8.14 retired the decks).
 * `opts.roomId`  — join THAT room by id (the second half of a pair).
 * `opts.fresh`   — CREATE a room rather than joinOrCreate (the first half of a
 *                  pair that needs clean water).
 */
async function joinClient(name, cls = 'torpedoBoat', opts = {}) {
  const client = new Client(endpoint);
  const fitOverride = Array.isArray(opts.weapon) ? [...opts.weapon] : [opts.weapon ?? CLASS_WEAPON[cls]];
  const joinOpts = { name, pv: PROTOCOL_VERSION, cls, fitOverride, matchOverride: { sandbox: true }, zoneOverride: SANDBOX_ZONE };
  const room = opts.roomId
    ? await client.joinById(opts.roomId, joinOpts)
    : opts.fresh
      ? await client.create('arena', joinOpts)
      : await client.joinOrCreate('arena', joinOpts);
  const ctx = {
    name,
    room,
    welcome: null,
    you: null,
    contacts: [],
    mines: [],
    booms: [],
    dmg: [],
    torpIds: new Set(),
    blipIds: new Set(),
    seq: 0,
    fireSeq: 0,
    goal: { mode: 'idle' },
    // Mine-visibility trackers (updated every frame):
    mineLeakBeyondDetect: 0, // enemy mine seen at dist > detect (must stay 0 — Story 4.9)
    maxConcurrentEnemy: 0, // most of A's mines seen at once
    maxConcurrentOwn: 0, // most of THIS ship's OWN mines live at once (Story 8.4)
    distinctEnemy: new Set(),
    distinctOwn: new Set(),
    firstSeenDist: new Map(), // mineId -> distance at first sighting
    islands: [], // rebuilt from the welcome — arms islandAvoid
  };
  room.onMessage('w', (m) => {
    ctx.welcome = m;
    ctx.islands = generateMap(m.mapSeed, m.playerCap).islands; // arms islandAvoid
  });
  room.onMessage('f', (m) => onFrame(ctx, m));
  return ctx;
}

function onFrame(ctx, f) {
  if (f.you) ctx.you = f.you;
  ctx.contacts = f.contacts;
  ctx.mines = f.mines;
  for (const e of f.events) {
    if (e.k === 'boom') ctx.booms.push(e);
    else if (e.k === 'dmg') ctx.dmg.push(e);
    else if (e.k === 'torp') ctx.torpIds.add(e.id);
    else if (e.k === 'blip') ctx.blipIds.add(e.id);
  }
  trackEnemyMines(ctx);
}

/** Update mine-visibility invariants from this frame's mine list.
 *
 *  TWO TALLIES, for two different jobs. The ENEMY tally is the FOG pin: what B
 *  can see of A's field, and at what range. The OWN tally is the NO-EVICTION
 *  pin (Story 8.4): the mine signal row always discloses a captain's OWN mines
 *  at any range, so A's own count is a true board count with no geometry in it
 *  — which is exactly what "six laid, six live" needs. Counting A's field
 *  through B's eyes instead would measure the drifting layer's spread against
 *  the detect ring, not the store. */
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

function control(ctx) {
  const inp = { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
  const g = ctx.goal;
  if (g.mode === 'goto') steerToward(ctx, inp, g.target, 1);
  else if (g.mode === 'hold') holdAt(ctx, inp, g.target);
  else if (g.mode === 'engageTorp') engageTorp(ctx, inp, g.target);
  else if (g.mode === 'dropMines') dropMines(ctx, inp);
  else if (g.mode === 'engageLight') engageLightTorp(ctx, inp, g.target);
  else if (g.mode === 'layCaptive') layCaptive(ctx, inp);
  else if (g.mode === 'sailTo') steerToward(ctx, inp, g.target, 0.6);
  ctx.room.send('i', inp);
}


/** Rudder bias steering away from any island ahead (dronesSmoke islandAvoid —
 *  needed since amendment 12 scaled the island budget with map area: long
 *  straight sail-ins on the 2400u board WILL cross rocks). */
function islandAvoid(ctx) {
  if (!ctx.you) return 0;
  const fx = Math.cos(ctx.you.heading);
  const fy = Math.sin(ctx.you.heading);
  let bias = 0;
  for (const c of ctx.islands ?? []) {
    const dx = c.x - ctx.you.x;
    const dy = c.y - ctx.you.y;
    if (dx * fx + dy * fy <= 0 || Math.hypot(dx, dy) > 170 + c.r) continue;
    bias += fx * dy - fy * dx > 0 ? -0.9 : 0.9;
  }
  return bias;
}

function steerToward(ctx, inp, target, throttle) {
  if (!ctx.you || !target) return;
  const want = bearing(ctx.you, target);
  inp.rudder = clamp(angleDiff(ctx.you.heading, want) * 2 + islandAvoid(ctx), -1, 1);
  inp.throttle = throttle;
}

/** Station-keep near a point: creep in if far, coast if close. islandAvoid
 *  rides the rudder (harness robustness, the engageTorp fix's sibling) so a
 *  trailing station-keeper can't pin itself nose-on against a rock. */
function holdAt(ctx, inp, target) {
  if (!ctx.you || !target) return;
  const d = dist(ctx.you, target);
  const want = bearing(ctx.you, target);
  inp.rudder = clamp(angleDiff(ctx.you.heading, want) * 2 + islandAvoid(ctx), -1, 1);
  inp.throttle = d > 40 ? 0.4 : 0;
}

/** Point the bow at the target and loose torpedoes when it bears in the arc.
 *  islandAvoid rides the rudder here too (harness robustness): without it a
 *  center island between the pair pins the shooter nose-on forever (the
 *  cycle-59 grounding cap holds it at the coast while the steering keeps
 *  re-aiming THROUGH the rock) and every fish dies on the island. And below
 *  ~60u the throttle drops to 0: a hull-to-hull scrum puts the target inside
 *  the fish's bow clearance, where no launch can ever connect. */
function engageTorp(ctx, inp, target) {
  if (!ctx.you || !target) return;
  const brg = bearing(ctx.you, target);
  inp.rudder = clamp(angleDiff(ctx.you.heading, brg) * 3 + islandAvoid(ctx), -1, 1);
  const range = dist(ctx.you, target);
  inp.throttle = range > 110 ? 0.6 : range > 60 ? 0.15 : 0; // close, keep steerageway, never scrum
  inp.aim = brg;
  // Slot 2 = the FIRST WEAPON slot (Q) in the Story 8.5 nine-slot fixed roles
  // [gun, boost, <fitted weapon>, ...]: slot 0 is the deck gun, slot 1 is the
  // universal Shift BOOST ability (Story 8.9), and this smoke's DEV SPAWN FIT
  // (amendment 65) puts the Torpedo Boat's `heavyTorpedo` here.
  inp.slot = 2;
  // Click every tick while the tube bears — the reload paces launches.
  if (Math.abs(angleDiff(brg, ctx.you.heading)) < CONFIG.torpedo.halfArc) inp.fireSeq = ++ctx.fireSeq;
}

/**
 * THE LIGHT TORPEDO'S BEAM ENGAGEMENT (Story 8.13, catalog-v3 R18). The light
 * fish fires into TWO MIRRORED BEAM SECTORS (±45° about ±90°), with 90°-wide
 * DEAD ZONES dead ahead and dead astern — so the heavy's "point the bow and
 * click" is exactly what never works here. The harness steers to put the
 * target on the PORT BEAM (heading = bearing − 90°) and clicks whenever the
 * bearing falls in either beam, which is also what proves the twin-sector
 * denial is not simply refusing everything.
 */
function engageLightTorp(ctx, inp, target) {
  if (!ctx.you || !target) return;
  const brg = bearing(ctx.you, target);
  const want = brg - Math.PI / 2; // target on the port beam
  inp.rudder = clamp(angleDiff(ctx.you.heading, want) * 3 + islandAvoid(ctx), -1, 1);
  const range = dist(ctx.you, target);
  inp.throttle = range > 140 ? 0.5 : range > 70 ? 0.15 : 0; // close, but never scrum
  inp.aim = brg;
  inp.slot = 2; // the fitted weapon slot (Q)
  // Fire whenever the target bears through EITHER beam sector.
  const off = Math.abs(angleDiff(ctx.you.heading, brg));
  if (Math.abs(off - Math.PI / 2) < CONFIG.lightTorpedo.halfArc) inp.fireSeq = ++ctx.fireSeq;
}

/**
 * LAY ONE CAPTIVE MINE and then stop clicking (Story 8.13). The captive rack
 * shares the naval chassis — the same rear sector and the same 150u leash — so
 * the placement is `dropMines`' verbatim; what differs is that the phase wants
 * exactly ONE mine on the water, so the click stops as soon as the layer can
 * see one of its own.
 */
function layCaptive(ctx, inp) {
  if (!ctx.you) return;
  inp.throttle = 0.12;
  inp.slot = 2;
  inp.aim = ctx.you.heading + Math.PI; // dead astern — centre of the placement arc
  inp.aimDist = CONFIG.mine.placeRange * 0.6;
  if (!ctx.mines.some((m) => m.own)) inp.fireSeq = ++ctx.fireSeq;
}

/** Hold station (light steerage) and CLICK mine drops astern — the Story 2.8
 *  aimed rear-arc placement: `navalMines` is a CLICK-FIRED WEAPON, so this goes
 *  down the fireSeq channel, not the actSeq ability one. Aim dead astern, well
 *  inside placeRange, so every click is a legal placement. */
function dropMines(ctx, inp) {
  if (!ctx.you) return;
  inp.throttle = 0.12; // just enough steerageway to hold a heading
  // Slot 2 = the FIRST WEAPON slot (Q) in the Story 8.5 nine-slot fixed roles
  // [gun, boost, <fitted weapon>, ...], where this smoke's DEV SPAWN FIT
  // (amendment 65) puts the Mine Layer's `navalMines` (the radar buoy is no
  // longer fitted on any hull — amendment 22); slot 1 is the universal Shift
  // BOOST ability (Story 8.9).
  inp.slot = 2;
  inp.aim = ctx.you.heading + Math.PI; // dead astern — center of the placement arc
  inp.aimDist = CONFIG.mine.placeRange * 0.6; // comfortably inside placeRange
  inp.fireSeq = ++ctx.fireSeq; // click every tick; CONFIG.mine.reloadMs (15s today) paces it
}

function roster(room, id) {
  return room.state.players.get(id);
}

async function pilotUntil(clients, tickFn, done, timeoutMs, label) {
  const start = Date.now();
  while (!done()) {
    for (const c of clients) control(c);
    tickFn?.();
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(CONFIG.tick.simDtMs);
  }
}

/** Bring A and B within sight of each other around the midpoint of their poses. */
async function rendezvous(a, b, log) {
  // Wait until both ships exist, then steer both to the midpoint between them
  // (much shorter sail than a fixed map point — they converge from the ring).
  await pilotUntil([a, b], () => {
    if (!a.you || !b.you) return;
    const mid = { x: (a.you.x + b.you.x) / 2, y: (a.you.y + b.you.y) / 2 };
    a.goal = { mode: 'goto', target: mid };
    b.goal = { mode: 'goto', target: mid };
  }, () => a.you && b.you && dist(a.you, b.you) < SIGHT * 0.8, 120000, 'rendezvous');
  log.push(`rendezvous: range=${dist(a.you, b.you).toFixed(0)}`);
}

async function torpedoPhase(a, b, log) {
  b.torpIds.clear();
  b.blipIds.clear();
  const dmg0 = b.dmg.length;
  b.goal = { mode: 'idle' };
  await pilotUntil([a, b], () => {
    a.goal = { mode: 'engageTorp', target: b.you };
    b.goal = { mode: 'hold', target: b.you }; // hold roughly still as a target
    // Budget WIDENED 120s -> 240s (2026-08-04 balance pass): the reload went
    // 12s -> 30s and every MISS now costs a full 30s reload instead of 12s.
    // At today's numbers B is the 300 hp mineLayer and the fish do 50, so the
    // kill needs SIX hits (5x50 = 250 < 300) across ~150s of cadence — the 240s
    // budget leaves a real, if thin, miss margin. If a future balance pass
    // raises hull hp or drops torpedo damage, WIDEN THIS BUDGET rather than
    // loosening the assertion, which is unchanged and reads CONFIG.
  }, () => roster(a.room, b.room.sessionId)?.deaths >= 1, 240000, 'torpedo kill');
  const hits = b.dmg.slice(dmg0).filter((d) => d.amount === CONFIG.torpedo.damage);
  log.push(
    `torpedo: B sank; ${CONFIG.torpedo.damage}-dmg hits=${hits.length} kills=${roster(a.room, a.room.sessionId).kills}`,
  );
  assert(hits.length >= 1, `no ${CONFIG.torpedo.damage}-damage torpedo hit recorded on B`);
  // Torpedoes must NEVER appear as radar blips.
  assert(b.torpIds.size > 0, 'B never saw a torpedo (test would be vacuous)');
  for (const id of b.torpIds) assert(!b.blipIds.has(id), `torpedo ${id} appeared as a radar blip!`);
  log.push(`torpedo: B saw ${b.torpIds.size} torps, ${b.blipIds.size} blips, zero overlap`);
  // Let B respawn.
  const before = b.you?.alive;
  await pilotUntil([a, b], null, () => b.you && b.you.alive && before === false, 8000, 'B respawn');
}

async function minePhase(a, b, log) {
  await rendezvous(a, b, log);
  // Reset visibility trackers now that B is in position.
  b.mineLeakBeyondDetect = 0;
  b.maxConcurrentEnemy = 0;
  b.distinctEnemy.clear();
  b.firstSeenDist.clear();
  a.maxConcurrentOwn = 0;
  a.distinctOwn.clear();
  // A holds station dropping mines; B loiters within detect range (Story 4.9:
  // the 120u trail sits well inside the 247.5u rung), outside trigger.
  // B's loiter point TRAILS A (recomputed every tick): even at minimum
  // steerageway A drifts ~4.6 u/s, so a fixed point drops out of detect range
  // of the later drops and the concurrent count never reaches six.
  await pilotUntil([a, b], () => {
    a.goal = { mode: 'dropMines' };
    b.goal = { mode: 'hold', target: a.you ? { x: a.you.x, y: a.you.y + 120 } : null };
  // Budget 150s -> 200s (Story 8.4): the pin now waits for SIX mines to be LIVE
  // AT ONCE rather than for six distinct ids to have been seen over time, and
  // with a 2-deep rack on a 15s reload the sixth drop cannot land before ~60s
  // of arming and reloading even in the best case. B's trailing loiter is still
  // recomputed every tick — it is what keeps the FOG half of this phase honest,
  // even though the no-eviction half no longer depends on it.
  }, () => a.maxConcurrentOwn >= NO_EVICTION_MINES, 200000, `A hold ${NO_EVICTION_MINES} mines live at once`);
  log.push(
    `mines: A held ${a.maxConcurrentOwn} own mines live at once (${a.distinctOwn.size} laid); ` +
      `B saw ${b.distinctEnemy.size} distinct A-mines, max ${b.maxConcurrentEnemy} at once, ` +
      `leaksBeyondDetect=${b.mineLeakBeyondDetect}`,
  );
  assert(b.mineLeakBeyondDetect === 0, 'B saw an enemy mine beyond detect range (radar/fog leak — Story 4.9 bar)');
  // NO EVICTION (Story 8.4, FR57/AR48): SIX LAID, SIX LIVE. Under the retired
  // per-player cap of 5 the sixth drop silently despawned the owner's oldest,
  // so this count could never have exceeded 5 — which is exactly what makes it
  // the right pin, and why it replaced the old "never more than maxLive at
  // once, yet more distinct ids over time" oldest-despawn proof.
  //
  // "SIX LIVE AT ONCE" IS THE WHOLE PIN, and deliberately the only one: a
  // `distinctOwn.size === maxConcurrentOwn` equality alongside it would demand
  // that NOTHING ever left the water, which a legitimately TRIPPED mine (B
  // drifting onto one, a chain off an ambush) breaks without any eviction being
  // involved. The high-water mark is what eviction could never produce.
  assert(
    a.maxConcurrentOwn >= NO_EVICTION_MINES,
    `A never held ${NO_EVICTION_MINES} of its own mines at once (max ${a.maxConcurrentOwn}) — eviction may be back`,
  );
}

async function ambushPhase(a, b, log) {
  // B sails onto the nearest live A-mine → should take 55 damage + a boom.
  a.goal = { mode: 'idle' };
  const hp0 = b.you.hp;
  const booms0 = b.booms.length;
  await pilotUntil([a, b], () => {
    const target = nearestEnemyMine(b);
    b.goal = target ? { mode: 'sailTo', target } : { mode: 'idle' };
  }, () => b.you && (b.you.hp <= hp0 - CONFIG.mine.damage || !b.you.alive), 60000, 'mine ambush');
  const boomed = b.booms.length > booms0;
  log.push(`ambush: B.hp ${hp0}->${b.you?.hp} boom=${boomed}`);
  assert(boomed, 'no boom on mine detonation');
  // Every enemy mine B ever saw was first seen from within DETECT range
  // (Story 4.9: the 3/8 rung — a first sighting in the 247.5–330u band would
  // mean the old truesight gate leaked back in).
  for (const [id, d] of b.firstSeenDist) assert(d <= DETECT + 1, `mine ${id} first seen at ${d.toFixed(0)}u (> detect)`);
  log.push('ambush: all enemy mines first seen within detect range');
}

function nearestEnemyMine(b) {
  if (!b.you) return null;
  let best = null;
  let bestD = Infinity;
  for (const m of b.mines) {
    if (m.own) continue;
    const d = dist(b.you, m);
    if (d < bestD) { bestD = d; best = { x: m.x, y: m.y }; }
  }
  return best;
}

/**
 * PHASE 5 — THE LIGHT TORPEDO (Story 8.13). Its own room, its own pair: LT-A
 * carries ONE `lightTorpedo` card, so it is at TIER I — a straight-runner with
 * one tube on a 25 s reload doing CONFIG.lightTorpedo.damage (40 today). The
 * target is a Torpedo Boat rather than the heavier Mine Layer purely so the
 * kill fits a sane budget: 250 hp / 40 = seven hits.
 */
async function lightTorpedoPhase(log) {
  const a = await joinClient('LT-A', 'torpedoBoat', { weapon: 'lightTorpedo', fresh: true });
  const b = await joinClient('LT-B', 'torpedoBoat', { roomId: a.room.roomId });
  await sleep(300);
  assert(a.welcome && b.welcome, 'light torpedo: missing welcome');
  await rendezvous(a, b, log);
  const dmg0 = b.dmg.length;
  await pilotUntil([a, b], () => {
    a.goal = { mode: 'engageLight', target: b.you };
    b.goal = { mode: 'hold', target: b.you };
  // ONE TUBE ON A 25 s RELOAD at 40 damage against 250 hp: seven hits, so the
  // cadence alone is ~150 s before a single miss. WIDEN THIS BUDGET rather
  // than loosening the assertion if a balance pass moves either number.
  }, () => roster(a.room, b.room.sessionId)?.deaths >= 1, 300000, 'light torpedo kill');
  const hits = b.dmg.slice(dmg0).filter((d) => d.amount === CONFIG.lightTorpedo.damage);
  log.push(`lightTorpedo: LT-B sank; ${CONFIG.lightTorpedo.damage}-dmg hits=${hits.length}`);
  assert(hits.length >= 1, `no ${CONFIG.lightTorpedo.damage}-damage LIGHT torpedo hit recorded`);
  assert(roster(a.room, a.room.sessionId).kills >= 1, 'light torpedo scored no kill');
  await a.room.leave();
  await b.room.leave();
}

/**
 * PHASE 6 — THE CAPTIVE MINE (Story 8.13, R2.12 / amendment 77). CM-A lays ONE
 * captive mine astern and stops; CM-B then sails into its 144u TRIP RING,
 * where the mine LAUNCHES its fish instead of detonating. The assertion is on
 * the CAPTIVE row's warhead (CONFIG.captiveMines.damage), which is what proves
 * the fish read its own line's numbers rather than the naval rack's.
 */
async function captiveMinePhase(log) {
  const a = await joinClient('CM-A', 'mineLayer', { weapon: 'captiveMines', fresh: true });
  const b = await joinClient('CM-B', 'torpedoBoat', { roomId: a.room.roomId });
  await sleep(300);
  assert(a.welcome && b.welcome, 'captive mine: missing welcome');
  await rendezvous(a, b, log);
  // A lays exactly one and lets it arm (CONFIG.mine.armDelay).
  await pilotUntil([a, b], () => {
    a.goal = { mode: 'layCaptive' };
    b.goal = { mode: 'hold', target: b.you };
  }, () => a.mines.filter((m) => m.own).length >= 1, 60000, 'captive mine laid');
  const laid = a.mines.find((m) => m.own);
  log.push(`captive: laid ${laid.id} kind=${laid.c ?? '(absent)'}`);
  assert(laid.c === 'captive', `own MineView carried kind ${laid.c} — expected 'captive'`);
  await sleep(CONFIG.mine.armDelay + 500);
  // B drives at the mine point; the trip ring reaches out 144u, so the fish
  // launches well before B is on top of it.
  const hp0 = b.you.hp;
  const dmg0 = b.dmg.length;
  await pilotUntil([a, b], () => {
    a.goal = { mode: 'idle' };
    b.goal = { mode: 'sailTo', target: { x: laid.x, y: laid.y } };
  }, () => b.dmg.slice(dmg0).some((d) => d.amount === CONFIG.captiveMines.damage), 90000, 'captive fish hit');
  log.push(`captive: CM-B.hp ${hp0}->${b.you?.hp} (fish dealt ${CONFIG.captiveMines.damage})`);
  assert(!a.mines.some((m) => m.id === laid.id), 'the captive mine was not expended on firing');
  assert(b.booms.length > 0, 'no boom from the captive fish');
  await a.room.leave();
  await b.room.leave();
}

async function main() {
  const a = await joinClient('WPN-A'); // torpedo boat — the torpedo-phase shooter
  const b = await joinClient('WPN-B', 'mineLayer'); // the mine-phase dropper
  assert(a.room.roomId === b.room.roomId, 'clients joined different rooms');
  await sleep(300);
  assert(a.welcome && b.welcome, 'missing welcome');

  const log = [];
  await rendezvous(a, b, log);
  await torpedoPhase(a, b, log);
  // Role swap for the mine phases: B is the mine layer (the dropper); A observes
  // in phase 3 and sails onto a mine in phase 4.
  await minePhase(b, a, log);
  await ambushPhase(b, a, log);
  await a.room.leave();
  await b.room.leave();
  // Story 8.13's two new lines, each in clean water of its own.
  await lightTorpedoPhase(log);
  await captiveMinePhase(log);

  console.log('WEAPONS SMOKE OK:', {
    room: a.room.roomId,
    seed: a.welcome.mapSeed,
    trace: log,
  });
  process.exit(0);
}

main().catch((err) => {
  console.error('WEAPONS SMOKE FAILED:', err.message);
  process.exit(1);
});
