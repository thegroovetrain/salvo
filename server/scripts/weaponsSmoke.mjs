// Weapons smoke: two live @colyseus/sdk clients against a running dev server,
// exercising torpedoes + mines end to end.
//   1. Torpedo kill: A (torpedo boat) faces B (mine layer, 150hp since the
//      2026-08-03 hp-ladder move) bow-on and holds fire until B sinks — THREE
//      70-dmg fish across ~30s reloads (3×70 = 210 > 150 HP; the smoke clicks
//      every tick, so the fish count follows the hp automatically). Asserts
//      70-damage hits, the kill on the roster. Damage/reload retuned 55/12s ->
//      70/30s by the 2026-08-04 weapon balance pass.
//   2. Torpedo never blips: B collects every torpedo id it is shown (via `torp`
//      events entering its sight) and every radar blip id — asserts the sets are
//      DISJOINT (a torpedo can never appear on the scope).
//   3. Mine visibility + oldest-despawn: B — the MINE LAYER (mines are its
//      click-aimed rear-arc slot 1 as of Story 2.8) — holds station clicking
//      drops astern while A loiters within detect range but outside trigger
//      range. Asserts A never sees an enemy mine beyond DETECT range (Story
//      4.9: the 3/8 rung, 0.75 × sight — the truesight bar is retired; no
//      radar/fog leak), never sees more than maxLive of B's mines at once,
//      yet sees >maxLive distinct ids over time (oldest-despawn proven).
//   4. Mine ambush: A sails onto a live armed mine — asserts 55 damage + a
//      boom, and that A first saw that mine only from within detect range.
//
// Run against a booted server (tsx server/src/index.ts + shared/dist built),
// with HC_DEV_OPTIONS=1 in ITS env — this smoke's sandbox matchOverride +
// zoneOverride are otherwise stripped by the room (see
// server/src/rooms/roomOptions.ts):
//   HC_DEV_OPTIONS=1 npm run dev -w server   (separate terminal)
//   node server/scripts/weaponsSmoke.mjs
import { Client } from '@colyseus/sdk';
import { CONFIG, PROTOCOL_VERSION, bearing, angleDiff, generateMap } from '@salvo/shared';

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

async function joinClient(name, cls = 'torpedoBoat') {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('arena', { name, pv: PROTOCOL_VERSION, cls, matchOverride: { sandbox: true }, zoneOverride: SANDBOX_ZONE });
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
    distinctEnemy: new Set(),
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

/** Update mine-visibility invariants from this frame's mine list. */
function trackEnemyMines(ctx) {
  if (!ctx.you) return;
  let concurrent = 0;
  for (const m of ctx.mines) {
    if (m.own) continue;
    concurrent++;
    ctx.distinctEnemy.add(m.id);
    const d = dist(ctx.you, m);
    if (!ctx.firstSeenDist.has(m.id)) ctx.firstSeenDist.set(m.id, d);
    if (d > DETECT + 1) ctx.mineLeakBeyondDetect++;
  }
  if (concurrent > ctx.maxConcurrentEnemy) ctx.maxConcurrentEnemy = concurrent;
}

function control(ctx) {
  const inp = { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
  const g = ctx.goal;
  if (g.mode === 'goto') steerToward(ctx, inp, g.target, 1);
  else if (g.mode === 'hold') holdAt(ctx, inp, g.target);
  else if (g.mode === 'engageTorp') engageTorp(ctx, inp, g.target);
  else if (g.mode === 'dropMines') dropMines(ctx, inp);
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
  inp.slot = 1; // torpedoes
  // Click every tick while the tube bears — the reload paces launches.
  if (Math.abs(angleDiff(brg, ctx.you.heading)) < CONFIG.torpedo.halfArc) inp.fireSeq = ++ctx.fireSeq;
}

/** Hold station (light steerage) and CLICK mine drops astern — the Story 2.8
 *  aimed rear-arc placement (mine layer slot 1): aim dead astern, well inside
 *  placeRange, so every click is a legal placement. */
function dropMines(ctx, inp) {
  if (!ctx.you) return;
  inp.throttle = 0.12; // just enough steerageway to hold a heading
  inp.slot = 1; // the mine layer's mine slot (gun / mine / radarBuoy fit)
  inp.aim = ctx.you.heading + Math.PI; // dead astern — center of the placement arc
  inp.aimDist = CONFIG.mine.placeRange * 0.6; // comfortably inside placeRange
  inp.fireSeq = ++ctx.fireSeq; // click every tick; the 8s drop cooldown paces it
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
    // 12s -> 30s. B is the 150hp mineLayer, so a kill still needs THREE 70-dmg
    // fish (2x70 = 140 < 150) across ~65s of cadence, where three 55-dmg fish
    // used to span ~26s — and every MISS now costs a full 30s reload instead of
    // 12s. At 120s this phase had ~1 spare fish; 240s restores a real miss
    // margin. The assertion is unchanged: only the patience is.
  }, () => roster(a.room, b.room.sessionId)?.deaths >= 1, 240000, 'torpedo kill');
  const hits = b.dmg.slice(dmg0).filter((d) => d.amount === CONFIG.torpedo.damage);
  log.push(`torpedo: B sank; 70-dmg hits=${hits.length} kills=${roster(a.room, a.room.sessionId).kills}`);
  assert(hits.length >= 1, 'no 70-damage torpedo hit recorded on B');
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
  // A holds station dropping mines; B loiters within detect range (Story 4.9:
  // the 120u trail sits well inside the 247.5u rung), outside trigger.
  // B's loiter point TRAILS A (recomputed every tick): even at minimum
  // steerageway A drifts ~4.6 u/s, so a fixed point drops out of detect range
  // of the later drops and the distinct-id count stalls below maxLive+1.
  await pilotUntil([a, b], () => {
    a.goal = { mode: 'dropMines' };
    b.goal = { mode: 'hold', target: a.you ? { x: a.you.x, y: a.you.y + 120 } : null };
  // Budget WIDENED 90s -> 150s with the detect bar (Story 4.9): under the old
  // 330u gate the trailing observer counted drops from the phase's first tick;
  // under 247.5u it only counts them once the trail closes inside
  // detect − dropDistance (~157u), which costs the first ~25s of the window.
  }, () => b.distinctEnemy.size > CONFIG.mine.maxLive, 150000, 'A drop >maxLive mines');
  log.push(
    `mines: B saw ${b.distinctEnemy.size} distinct A-mines, max ${b.maxConcurrentEnemy} at once, ` +
      `leaksBeyondDetect=${b.mineLeakBeyondDetect}`,
  );
  assert(b.mineLeakBeyondDetect === 0, 'B saw an enemy mine beyond detect range (radar/fog leak — Story 4.9 bar)');
  assert(b.maxConcurrentEnemy <= CONFIG.mine.maxLive, `B saw > maxLive (${b.maxConcurrentEnemy}) mines at once`);
  assert(b.distinctEnemy.size > CONFIG.mine.maxLive, 'never observed a 4th mine / oldest-despawn');
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

  console.log('WEAPONS SMOKE OK:', {
    room: a.room.roomId,
    seed: a.welcome.mapSeed,
    kills: roster(a.room, a.room.sessionId).kills,
    trace: log,
  });
  await a.room.leave();
  await b.room.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error('WEAPONS SMOKE FAILED:', err.message);
  process.exit(1);
});
