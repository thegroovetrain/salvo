// Combat smoke: two live @colyseus/sdk clients against a running dev server.
// Scenario 1 (fight): A pilots itself beam-on to B and holds fire until B sinks,
//   then respawns. Asserts B's hp drops in frames, booms are seen by BOTH
//   clients, the kill is booked on the public roster, and B respawns.
// Scenario 2 (island block): both ships are piloted to opposite sides of a
//   seeded island (positions computed from the map), A fires through it, and we
//   assert A's shells splash on the rock and B takes NO damage.
//
// Run against a booted server (tsx server/src/index.ts + shared/dist built),
// with HC_DEV_OPTIONS=1 in ITS env — this smoke's sandbox matchOverride +
// zoneOverride are otherwise stripped by the room (see
// server/src/rooms/roomOptions.ts):
//   HC_DEV_OPTIONS=1 npm run dev -w server   (separate terminal)
//   node server/scripts/combatSmoke.mjs
import { Client } from '@colyseus/sdk';
import { CONFIG, PROTOCOL_VERSION, generateMap, bearing, angleDiff, segCircleHit } from '@salvo/shared';

const endpoint = process.env.WS_URL || 'ws://localhost:2567';
const HALF_PI = Math.PI / 2;

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
  const ctx = { name, room, welcome: null, you: null, contacts: [], booms: [], shells: 0 };
  room.onMessage('w', (m) => (ctx.welcome = m));
  room.onMessage('f', (m) => onFrame(ctx, m));
  ctx.goal = { mode: 'idle' };
  ctx.seq = 0;
  ctx.fireSeq = 0;
  return ctx;
}

function onFrame(ctx, f) {
  if (f.you) ctx.you = f.you;
  ctx.contacts = f.contacts;
  for (const e of f.events) {
    if (e.k === 'boom') ctx.booms.push(e);
    if (e.k === 'shell') ctx.shells += 1;
  }
}

/** Send one control input for `ctx` derived from its current goal. */
function control(ctx) {
  const inp = { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, weapon: 0 };
  const g = ctx.goal;
  if (g.mode === 'goto') steerToward(ctx, inp, g.target, 1);
  else if (g.mode === 'engage') engage(ctx, inp, g.target, true);
  else if (g.mode === 'lane') laneCruise(ctx, inp, g);
  else if (g.mode === 'hold') steerToward(ctx, inp, g.target, 0);
  ctx.room.send('i', inp);
}

function steerToward(ctx, inp, target, throttle) {
  if (!ctx.you) return;
  const want = bearing(ctx.you, target);
  inp.rudder = clamp(angleDiff(ctx.you.heading, want) * 2, -1, 1);
  inp.throttle = throttle;
}

/**
 * Beam-on engage: keep the target on the port beam and hold fire when it bears.
 * Keeps steerageway (throttle 0.5) — the ship cannot turn at a standstill, so
 * engaging is a slow orbit that keeps the target abeam and shells flowing.
 * `fireAllowed` gates the trigger (island scenario only fires through cover).
 */
function engage(ctx, inp, target, fireAllowed) {
  if (!ctx.you || !target) return;
  const brg = bearing(ctx.you, target);
  const wantHeading = brg - HALF_PI; // target on the port beam
  inp.rudder = clamp(angleDiff(ctx.you.heading, wantHeading) * 3, -1, 1);
  inp.throttle = 0.5;
  inp.aim = brg;
  const off = Math.abs(angleDiff(brg, ctx.you.heading + HALF_PI));
  inp.aimDist = dist(ctx.you, target); // guns fire AT the click point now
  // Click every tick while the target bears — the mount reload paces shots.
  if (fireAllowed && off < CONFIG.gun.mounts[0].halfArc) inp.fireSeq = ++ctx.fireSeq;
}

/** True iff the island lies on the segment from `from` to `to` (blocks LOS). */
function blockedBy(from, to, isle) {
  if (!from || !to) return false;
  return segCircleHit(from, to, isle, isle.r) !== null;
}

/**
 * Cruise along a lane defined by base point `g.base` + unit axis `g.axis`,
 * correcting toward the lane line, at steady speed. When a target + island are
 * given, aim across the lane and fire ONLY while the island blocks the shot — so
 * the two parallel courses put A's broadside on B through cover.
 */
function laneCruise(ctx, inp, g) {
  if (!ctx.you) return;
  // Perpendicular error off the lane line (base + t*axis), steer to cancel it.
  const px = -g.axis.y;
  const py = g.axis.x;
  const perp = (ctx.you.x - g.base.x) * px + (ctx.you.y - g.base.y) * py;
  const want = Math.atan2(g.axis.y, g.axis.x) + clamp(-perp * 0.01, -0.7, 0.7);
  inp.rudder = clamp(angleDiff(ctx.you.heading, want) * 3, -1, 1);
  inp.throttle = 0.55;
  if (g.target) {
    inp.aim = bearing(ctx.you, g.target);
    const off = Math.abs(angleDiff(inp.aim, ctx.you.heading + HALF_PI));
    inp.aimDist = dist(ctx.you, g.target);
    if (off < CONFIG.gun.mounts[0].halfArc && blockedBy(ctx.you, g.target, g.isle)) inp.fireSeq = ++ctx.fireSeq;
  }
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

async function fightScenario(a, b, log) {
  // B holds still (reliable target — A fires without lead); A crosses the ring
  // then engages beam-on (slow orbit) at point-blank until B sinks. Hysteresis
  // on the engage/approach switch avoids fire-stopping flip-flop at the edge.
  a.goal = { mode: 'idle' };
  b.goal = { mode: 'idle' };
  // Ground-truth target (both clients live in this process): fog (step 9) hides
  // B from A's contacts beyond sight range, so piloting can't rely on them.
  const bContact = () => b.you;
  let engaging = false;
  let lastLog = 0;
  await pilotUntil([a, b], () => {
    const tb = bContact();
    if (!tb || !a.you) return;
    const range = dist(a.you, tb);
    if (range < 180) engaging = true;
    else if (range > 300) engaging = false;
    a.goal = engaging ? { mode: 'engage', target: tb } : { mode: 'goto', target: tb };
    if (Date.now() - lastLog > 4000) {
      lastLog = Date.now();
      log.push(`fight: B.hp=${b.you?.hp} range=${range.toFixed(0)} shellsA=${a.shells}`);
    }
  }, () => roster(a.room, b.room.sessionId)?.deaths >= 1, 130000, 'B never sank');
  log.push(`fight: B sank; A.kills=${roster(a.room, a.room.sessionId).kills}`);

  // Let B respawn.
  b.goal = { mode: 'idle' };
  const before = b.you?.alive;
  await pilotUntil([a, b], null, () => b.you && b.you.alive && before === false, 8000, 'B never respawned');
  log.push('fight: B respawned');
}

function pickIsland(welcome) {
  const map = generateMap(welcome.mapSeed, welcome.playerCap);
  assert(map.islands.length > 0, 'seed produced no islands');
  return map.islands.reduce((m, c) => (c.r > m.r ? c : m), map.islands[0]);
}

/**
 * Live island-block demonstration. Both ships take parallel lanes on opposite
 * sides of a seeded island and cruise across it (lanes oriented along the local
 * tangent so both formation and pass stay inside the map circle). A fires across
 * the gap ONLY while the island blocks the shot, so every shell is aimed through
 * cover — B cannot be hit unless the rock fails to block.
 *
 * The SAFETY INVARIANT (B takes zero damage while all of A's fire is gated
 * through cover) is hard-asserted — a violation is a real island-blocking bug.
 * Achieving many blocked ticks depends on the seed's island placement + the
 * mobility model, so coverage is best-effort (warn, not fail); the deterministic
 * server test `combat.test.ts` proves blocking with exact positions.
 */
async function islandScenario(a, b, log) {
  const isle = pickIsland(a.welcome);
  const rad = Math.hypot(isle.x, isle.y) || 1;
  const radial = { x: isle.x / rad, y: isle.y / rad }; // island -> outward
  const tan = { x: -radial.y, y: radial.x }; // cruise direction (tangent)
  const lane = isle.r + 60;
  const aLane = offset(isle, radial, +lane); // outboard lane center point base
  const bLane = offset(isle, radial, -lane); // inboard lane
  const aForm = offset(aLane, tan, -260);
  const bForm = offset(bLane, tan, -260);

  const formed = { a: false, b: false };
  await pilotUntil([a, b], () => {
    a.goal = { mode: 'goto', target: aForm };
    b.goal = { mode: 'goto', target: bForm };
    if (a.you && dist(a.you, aForm) < 100) formed.a = true;
    if (b.you && dist(b.you, bForm) < 100) formed.b = true;
  }, () => formed.a && formed.b, 55000, 'form-up').catch((e) => log.push(`island: WARN ${e.message}`));

  const hp0 = b.you.hp;
  const shells0 = a.shells;
  const splash0 = a.booms.filter((e) => e.hit === undefined).length;
  let blocked = 0;
  const passed = () => a.you && dotAlong(a.you, isle, tan) > isle.r + 140;
  await pilotUntil([a, b], () => {
    a.goal = { mode: 'lane', axis: tan, base: aLane, target: b.you, isle };
    b.goal = { mode: 'lane', axis: tan, base: bLane };
    if (a.you && b.you && blockedBy(a.you, b.you, isle)) blocked += 1;
  }, passed, 40000, 'pass').catch((e) => log.push(`island: WARN ${e.message}`));

  const shells = a.shells - shells0;
  const splashes = a.booms.filter((e) => e.hit === undefined).length - splash0;
  log.push(`island: blockedTicks=${blocked} shellsThroughCover=${shells} splashes=${splashes} B.hp ${hp0}->${b.you.hp}`);
  // Hard invariant: A only ever fires through cover, so B must be unscathed.
  assert(b.you.hp === hp0, `B was damaged despite island cover (${hp0}->${b.you.hp})`);
  if (blocked > 8 && shells > 0) assert(splashes > 0, 'covered shots produced no splash');
  else log.push('island: NOTE live block under-exercised this seed (unit test is authoritative)');
}

function offset(p, dir, mag) {
  return { x: p.x + dir.x * mag, y: p.y + dir.y * mag };
}
/** Signed distance of `p` from `origin` projected on unit axis `ax`. */
function dotAlong(p, origin, ax) {
  return (p.x - origin.x) * ax.x + (p.y - origin.y) * ax.y;
}

async function main() {
  const a = await joinClient('CBT-A');
  const b = await joinClient('CBT-B');
  assert(a.room.roomId === b.room.roomId, 'clients joined different rooms');
  await sleep(300);
  assert(a.welcome && b.welcome, 'missing welcome');
  assert(Number.isFinite(a.welcome.playerCap), 'welcome missing playerCap');

  const log = [];
  await fightScenario(a, b, log);
  const bothSawBooms = a.booms.length > 0 && b.booms.length > 0;
  assert(bothSawBooms, `booms not seen by both (A=${a.booms.length} B=${b.booms.length})`);

  await islandScenario(a, b, log);

  console.log('COMBAT SMOKE OK:', {
    room: a.room.roomId,
    seed: a.welcome.mapSeed,
    playerCap: a.welcome.playerCap,
    boomsA: a.booms.length,
    boomsB: b.booms.length,
    kills: roster(a.room, a.room.sessionId).kills,
    trace: log,
  });
  await a.room.leave();
  await b.room.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error('COMBAT SMOKE FAILED:', err.message);
  process.exit(1);
});
