// Weapons smoke: two live @colyseus/sdk clients against a running dev server,
// exercising torpedoes + mines end to end.
//   1. Torpedo kill: A faces B (bow-on) and holds fire until B sinks. With the
//      single bow tube (owner play test) that is TWO 55-dmg fish across two ~12s
//      reloads (2×55 = 110 > 100 HP), not one two-tube volley. Asserts 55-damage
//      hits, the kill on the roster.
//   2. Torpedo never blips: B collects every torpedo id it is shown (via `torp`
//      events entering its sight) and every radar blip id — asserts the sets are
//      DISJOINT (a torpedo can never appear on the scope).
//   3. Mine visibility + oldest-despawn: A holds station and drops mines astern
//      while B loiters within sight but outside trigger range. Asserts B never
//      sees an enemy mine beyond sight range (no radar/fog leak), never sees
//      more than maxLive of A's mines at once, yet sees >maxLive distinct ids
//      over time (proving the 4th drop despawned the oldest).
//   4. Mine ambush: B sails onto a live armed mine — asserts 45 damage + a boom,
//      and that B first saw that mine only from within sight range.
//
// Run against a booted server (tsx server/src/index.ts + shared/dist built),
// with HC_DEV_OPTIONS=1 in ITS env — this smoke's sandbox matchOverride +
// zoneOverride are otherwise stripped by the room (see
// server/src/rooms/roomOptions.ts):
//   HC_DEV_OPTIONS=1 npm run dev -w server   (separate terminal)
//   node server/scripts/weaponsSmoke.mjs
import { Client } from '@colyseus/sdk';
import { CONFIG, PROTOCOL_VERSION, bearing, angleDiff } from '@salvo/shared';

const endpoint = process.env.WS_URL || 'ws://localhost:2567';
const SIGHT = CONFIG.vision.sight;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sandbox (dev-only): pre-step-14 room behavior — no match lifecycle, permissive
// combat policy, storm at 2nd join. The long grace keeps that storm harmless
// for the whole choreography (this smoke predates the zone / match steps).
const SANDBOX_ZONE = { grace: 600000, shrinkDuration: 180000, endRadiusFraction: 0.15 };

async function joinClient(name) {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('arena', { name, pv: PROTOCOL_VERSION, matchOverride: { sandbox: true }, zoneOverride: SANDBOX_ZONE });
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
    mineLeakBeyondSight: 0, // enemy mine seen at dist > sight (must stay 0)
    maxConcurrentEnemy: 0, // most of A's mines seen at once
    distinctEnemy: new Set(),
    firstSeenDist: new Map(), // mineId -> distance at first sighting
  };
  room.onMessage('w', (m) => (ctx.welcome = m));
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
    if (d > SIGHT + 1) ctx.mineLeakBeyondSight++;
  }
  if (concurrent > ctx.maxConcurrentEnemy) ctx.maxConcurrentEnemy = concurrent;
}

function control(ctx) {
  const inp = { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0 };
  const g = ctx.goal;
  if (g.mode === 'goto') steerToward(ctx, inp, g.target, 1);
  else if (g.mode === 'hold') holdAt(ctx, inp, g.target);
  else if (g.mode === 'engageTorp') engageTorp(ctx, inp, g.target);
  else if (g.mode === 'dropMines') dropMines(ctx, inp);
  else if (g.mode === 'sailTo') steerToward(ctx, inp, g.target, 0.6);
  ctx.room.send('i', inp);
}

function steerToward(ctx, inp, target, throttle) {
  if (!ctx.you || !target) return;
  const want = bearing(ctx.you, target);
  inp.rudder = clamp(angleDiff(ctx.you.heading, want) * 2, -1, 1);
  inp.throttle = throttle;
}

/** Station-keep near a point: creep in if far, coast if close. */
function holdAt(ctx, inp, target) {
  if (!ctx.you || !target) return;
  const d = dist(ctx.you, target);
  const want = bearing(ctx.you, target);
  inp.rudder = clamp(angleDiff(ctx.you.heading, want) * 2, -1, 1);
  inp.throttle = d > 40 ? 0.4 : 0;
}

/** Point the bow at the target and loose torpedoes when it bears in the arc. */
function engageTorp(ctx, inp, target) {
  if (!ctx.you || !target) return;
  const brg = bearing(ctx.you, target);
  inp.rudder = clamp(angleDiff(ctx.you.heading, brg) * 3, -1, 1);
  const range = dist(ctx.you, target);
  inp.throttle = range > 110 ? 0.6 : 0.15; // close then keep steerageway
  inp.aim = brg;
  inp.slot = 1; // torpedoes
  // Click every tick while the tube bears — the reload paces launches.
  if (Math.abs(angleDiff(brg, ctx.you.heading)) < CONFIG.torpedo.halfArc) inp.fireSeq = ++ctx.fireSeq;
}

/** Hold station (heading steady with light steerage) and drop mines astern. */
function dropMines(ctx, inp) {
  if (!ctx.you) return;
  inp.throttle = 0.12; // just enough steerageway to hold a heading
  inp.slot = 2; // mines
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
  }, () => roster(a.room, b.room.sessionId)?.deaths >= 1, 120000, 'torpedo kill');
  const hits = b.dmg.slice(dmg0).filter((d) => d.amount === CONFIG.torpedo.damage);
  log.push(`torpedo: B sank; 55-dmg hits=${hits.length} kills=${roster(a.room, a.room.sessionId).kills}`);
  assert(hits.length >= 1, 'no 55-damage torpedo hit recorded on B');
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
  b.mineLeakBeyondSight = 0;
  b.maxConcurrentEnemy = 0;
  b.distinctEnemy.clear();
  b.firstSeenDist.clear();
  // A holds station dropping mines; B loiters within sight, outside trigger.
  // B's loiter point TRAILS A (recomputed every tick): even at minimum
  // steerageway A drifts ~4.6 u/s, so a fixed point drops out of sight range
  // of the later drops and the distinct-id count stalls below maxLive+1.
  await pilotUntil([a, b], () => {
    a.goal = { mode: 'dropMines' };
    b.goal = { mode: 'hold', target: a.you ? { x: a.you.x, y: a.you.y + 120 } : null };
  }, () => b.distinctEnemy.size > CONFIG.mine.maxLive, 90000, 'A drop >maxLive mines');
  log.push(
    `mines: B saw ${b.distinctEnemy.size} distinct A-mines, max ${b.maxConcurrentEnemy} at once, ` +
      `leaksBeyondSight=${b.mineLeakBeyondSight}`,
  );
  assert(b.mineLeakBeyondSight === 0, 'B saw an enemy mine beyond sight range (radar/fog leak)');
  assert(b.maxConcurrentEnemy <= CONFIG.mine.maxLive, `B saw > maxLive (${b.maxConcurrentEnemy}) mines at once`);
  assert(b.distinctEnemy.size > CONFIG.mine.maxLive, 'never observed a 4th mine / oldest-despawn');
}

async function ambushPhase(a, b, log) {
  // B sails onto the nearest live A-mine → should take 45 damage + a boom.
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
  // Every enemy mine B ever saw was first seen from within sight range.
  for (const [id, d] of b.firstSeenDist) assert(d <= SIGHT + 1, `mine ${id} first seen at ${d.toFixed(0)}u (> sight)`);
  log.push('ambush: all enemy mines first seen within sight range');
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
  const a = await joinClient('WPN-A');
  const b = await joinClient('WPN-B');
  assert(a.room.roomId === b.room.roomId, 'clients joined different rooms');
  await sleep(300);
  assert(a.welcome && b.welcome, 'missing welcome');

  const log = [];
  await rendezvous(a, b, log);
  await torpedoPhase(a, b, log);
  await minePhase(a, b, log);
  await ambushPhase(a, b, log);

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
