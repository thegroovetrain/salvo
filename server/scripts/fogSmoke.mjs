// Fog + radar smoke: two live @colyseus/sdk clients against a running dev
// server, verifying steps 9+10 end to end over the real wire. Both clients
// live in this process, so piloting/assertions use ground-truth positions
// while the FRAMES under test stay fogged.
//
// Phases:
//   0 FAR    — fresh spawns (dist > radar): NO contacts, NO blips.
//   1 BAND   — A parks in the radar annulus (sight < dist ≤ radar, LOS clear):
//              still no contacts, but blip events ≈ once per sweepPeriod each
//              way, with stale-by-design positions (≈ target pos at paint t).
//   2 SHELL  — A fires on B from beyond sight: A (owner) gets its shell event
//              at launch; B gets the SAME shell id only once it enters B's
//              sight bubble, re-parameterized (later t, nearer pos). The wire
//              carries no ttl/range-derivable field. A never sees B's booms.
//   3 SIGHT  — A drives inside sight: contact appears both ways, paints stop.
//   4 ISLAND — both park with an island between them (dist < sight): neither
//              contact nor blip; then A backs into the radar band still in the
//              island's shadow: radar stays blind too (LOS blocks radar).
//
// Run against a booted server (tsx server/src/index.ts + shared/dist built),
// with HC_DEV_OPTIONS=1 in ITS env — this smoke's sandbox matchOverride +
// zoneOverride are otherwise stripped by the room (see
// server/src/rooms/roomOptions.ts):
//   HC_DEV_OPTIONS=1 npm run dev -w server   (separate terminal)
//   node server/scripts/fogSmoke.mjs
import { Client } from '@colyseus/sdk';
import { CONFIG, generateMap, bearing, angleDiff, segCircleHit } from '@salvo/shared';

const endpoint = process.env.WS_URL || 'ws://localhost:2567';
const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;
const PERIOD = CONFIG.vision.sweepPeriod;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- clients ---

// Sandbox (dev-only): pre-step-14 room behavior — no match lifecycle, permissive
// combat policy, storm at 2nd join. The long grace keeps that storm harmless
// for the whole choreography (this smoke predates the zone / match steps).
const SANDBOX_ZONE = { grace: 600000, shrinkDuration: 180000, endRadiusFraction: 0.15 };

async function joinClient(name) {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('arena', { name, matchOverride: { sandbox: true }, zoneOverride: SANDBOX_ZONE });
  const ctx = {
    name, room, welcome: null, you: null, now: 0,
    contacts: [], blips: [], shells: [], booms: [],
    frames: null, // when set, per-frame records are pushed here
    goal: { mode: 'idle' }, seq: 0, fireSeq: 0, other: null,
  };
  room.onMessage('w', (m) => (ctx.welcome = m));
  room.onMessage('f', (f) => onFrame(ctx, f));
  return ctx;
}

function onFrame(ctx, f) {
  ctx.now = f.t;
  if (f.you) ctx.you = f.you;
  ctx.contacts = f.contacts;
  for (const e of f.events) {
    if (e.k === 'blip') ctx.blips.push(e);
    else if (e.k === 'shell') ctx.shells.push(e);
    else if (e.k === 'boom') ctx.booms.push({ ...e, seenAt: ctx.you ? { x: ctx.you.x, y: ctx.you.y } : null });
  }
  if (ctx.frames && ctx.you && ctx.other?.you) {
    ctx.frames.push({
      t: f.t,
      dist: dist(ctx.you, ctx.other.you),
      contactIds: f.contacts.map((c) => c.id),
      blocked: ctx.isle ? blockedBy(ctx.you, ctx.other.you, ctx.isle) : false,
    });
  }
}

/** True iff the island lies on the segment from `from` to `to`. */
function blockedBy(from, to, isle) {
  return segCircleHit(from, to, isle, isle.r) !== null;
}

// ---------------------------------------------------------------- piloting ---

function control(ctx) {
  const inp = { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, weapon: 0 };
  const g = ctx.goal;
  if (g.mode === 'park') park(ctx, inp, g.target);
  else if (g.mode === 'engage') engage(ctx, inp, g.target, g.fire);
  ctx.room.send('i', inp);
}

/** Drive to `target` and stop there (throttle tapers with distance). */
function park(ctx, inp, target) {
  if (!ctx.you) return;
  const d = dist(ctx.you, target);
  if (d < 15) return; // arrived: coast to a stop
  const want = bearing(ctx.you, target);
  const err = angleDiff(ctx.you.heading, want);
  inp.rudder = clamp(err * 2.5, -1, 1);
  inp.throttle = d > 140 ? 1 : Math.abs(err) > 0.6 ? 0.35 : clamp(d / 140, 0.25, 1);
}

/** Beam-on orbit keeping `target` abeam; fires when it bears (combatSmoke's). */
function engage(ctx, inp, target, fireAllowed) {
  if (!ctx.you || !target) return;
  const brg = bearing(ctx.you, target);
  inp.rudder = clamp(angleDiff(ctx.you.heading, brg - Math.PI / 2) * 3, -1, 1);
  inp.throttle = 0.5;
  inp.aim = brg;
  const off = Math.abs(angleDiff(brg, ctx.you.heading + Math.PI / 2));
  inp.aimDist = dist(ctx.you, target); // guns fire AT the click point now
  // Click every tick while the target bears — the mount reload paces shots.
  if (fireAllowed && off < CONFIG.gun.mounts[0].halfArc) inp.fireSeq = ++ctx.fireSeq;
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

/** Park both ships on their goals and wait until they have (nearly) stopped. */
async function settle(a, b, timeoutMs, label) {
  const settled = () =>
    a.you && b.you && Math.abs(a.you.speed) < 1 && Math.abs(b.you.speed) < 1 &&
    (a.goal.mode !== 'park' || dist(a.you, a.goal.target) < 45) &&
    (b.goal.mode !== 'park' || dist(b.you, b.goal.target) < 45);
  await pilotUntil([a, b], null, settled, timeoutMs, label);
}

/** Keep both ships under control for `ms` while recording frames. */
async function observe(a, b, ms) {
  a.frames = [];
  b.frames = [];
  const w0 = { a: a.now, b: b.now };
  const start = Date.now();
  while (Date.now() - start < ms) {
    control(a);
    control(b);
    await sleep(CONFIG.tick.simDtMs);
  }
  const out = { a: a.frames, b: b.frames, w0, w1: { a: a.now, b: b.now } };
  a.frames = null;
  b.frames = null;
  return out;
}

const blipsIn = (ctx, t0, t1) => ctx.blips.filter((e) => e.t >= t0 && e.t <= t1);

/** Frames where the predicate held; asserts none of them carried a contact. */
function assertNoContactsWhile(frames, pred, label) {
  const held = frames.filter(pred);
  const bad = held.filter((f) => f.contactIds.length > 0);
  assert(bad.length === 0, `${label}: ${bad.length}/${held.length} frames leaked a contact`);
  return held.length;
}

// ------------------------------------------------------------------ phases ---

async function phaseFar(a, b, log) {
  await pilotUntil([a, b], null, () => a.you && b.you, 5000, 'first frames');
  const d0 = dist(a.you, b.you);
  assert(d0 > RADAR, `spawns unexpectedly close (${d0.toFixed(0)}u <= radar)`);
  const obs = await observe(a, b, PERIOD * 1.5);
  assertNoContactsWhile(obs.a, () => true, 'far/A');
  assertNoContactsWhile(obs.b, () => true, 'far/B');
  assert(blipsIn(a, obs.w0.a, obs.w1.a).length === 0, 'far: A got blips beyond radar range');
  assert(blipsIn(b, obs.w0.b, obs.w1.b).length === 0, 'far: B got blips beyond radar range');
  log.push(`far: dist=${d0.toFixed(0)}u — no contacts, no blips over ${(PERIOD * 1.5) / 1000}s`);
}

/** A point `standoff` u from B toward A, rotated until the B-line is LOS-clear. */
function standoffPoint(a, b, islands, standoff) {
  const base = bearing(b.you, a.you);
  for (let k = 0; k < 12; k++) {
    const ang = base + k * (Math.PI / 9) * (k % 2 ? 1 : -1);
    const p = { x: b.you.x + Math.cos(ang) * standoff, y: b.you.y + Math.sin(ang) * standoff };
    if (islands.every((i) => segCircleHit(p, b.you, i, i.r) === null)) return p;
  }
  throw new Error('no LOS-clear standoff point found');
}

async function phaseRadarBand(a, b, map, log) {
  const target = standoffPoint(a, b, map.islands, 420);
  a.goal = { mode: 'park', target };
  b.goal = { mode: 'idle' };
  await settle(a, b, 120000, 'park in radar band');
  const nBlipsA = a.blips.length;
  const obs = await observe(a, b, PERIOD * 2.5);
  // Fog: still zero contacts anywhere outside sight (small transit margin).
  assertNoContactsWhile(obs.a, (f) => f.dist > SIGHT + 15, 'band/A');
  assertNoContactsWhile(obs.b, (f) => f.dist > SIGHT + 15, 'band/B');
  // Radar: ≈ once per sweep period, each way.
  const ba = blipsIn(a, obs.w0.a, obs.w1.a);
  const bb = blipsIn(b, obs.w0.b, obs.w1.b);
  for (const [who, blips, target2] of [['A', ba, b], ['B', bb, a]]) {
    assert(blips.length >= 2 && blips.length <= 3,
      `band: ${who} got ${blips.length} blips over 2.5 periods (want 2-3)`);
    for (const e of blips) {
      assert(dist(e, target2.you) < 60, `band: ${who} blip ${dist(e, target2.you).toFixed(0)}u off target`);
    }
    for (let i = 1; i < blips.length; i++) {
      const gap = blips[i].t - blips[i - 1].t;
      assert(Math.abs(gap - PERIOD) < 400, `band: ${who} paint gap ${gap}ms (want ~${PERIOD})`);
    }
  }
  const gaps = ba.slice(1).map((e, i) => (e.t - ba[i].t).toFixed(0)).join(',');
  log.push(`band: dist~420u — 0 contacts; blips A=${ba.length} B=${bb.length}, gapsA=[${gaps}]ms (fresh joins had ${nBlipsA})`);
}

async function phaseShellReveal(a, b, log) {
  const aShells0 = a.shells.length;
  const bShells0 = b.shells.length;
  const aBooms0 = a.booms.length;
  const hp0 = b.you.hp;
  a.goal = { mode: 'engage', target: b.you, fire: true };
  const start = Date.now();
  await pilotUntil([a, b], () => { a.goal.target = b.you; }, () => Date.now() - start > 6000, 99999, 'x');
  a.goal = { mode: 'engage', target: b.you, fire: false };
  const holdStart = Date.now();
  await pilotUntil([a, b], null, () => Date.now() - holdStart > 4500, 99999, 'x'); // let shells land
  const aShells = a.shells.slice(aShells0);
  const bShells = b.shells.slice(bShells0);
  assert(aShells.length > 0, 'shell: A never fired');
  assert(bShells.length > 0, 'shell: no shell ever entered B sight');
  for (const sb of bShells) {
    const sa = aShells.find((e) => e.id === sb.id);
    assert(sa, `shell: B saw ${sb.id} that A (owner) never did`);
    assert(sb.t - sa.t >= 1000, `shell: ${sb.id} revealed to B only ${(sb.t - sa.t).toFixed(0)}ms after launch (fired from ~400u)`);
    assert(sa.ttl === undefined && sb.ttl === undefined, `shell: ${sb.id} carried a ttl (range-derivable field must not be on the wire)`);
    assert(dist(sb, b.you) <= SIGHT + 60, `shell: ${sb.id} revealed ${dist(sb, b.you).toFixed(0)}u from B (outside sight)`);
  }
  // A must never see its own out-of-sight impacts (no hit confirmation leak).
  const aBooms = a.booms.slice(aBooms0);
  for (const e of aBooms) {
    assert(e.seenAt && dist(e, e.seenAt) <= SIGHT + 60, `shell: A saw a boom ${dist(e, e.seenAt).toFixed(0)}u away`);
  }
  const revealed = bShells.map((sb) => {
    const sa = aShells.find((e) => e.id === sb.id);
    return `${sb.id}:+${(sb.t - sa.t).toFixed(0)}ms@${dist(sb, b.you).toFixed(0)}u`;
  });
  log.push(`shell: A fired ${aShells.length}, revealed to B ${bShells.length} [${revealed.join(' ')}], B.hp ${hp0}->${b.you.hp}, A booms seen=${aBooms.length}`);
}

async function phaseSight(a, b, map, log) {
  const target = standoffPoint(a, b, map.islands, 150);
  a.goal = { mode: 'park', target };
  b.goal = { mode: 'idle' };
  await pilotUntil([a, b], () => {}, () =>
    a.contacts.some((c) => c.id === b.room.sessionId) &&
    b.contacts.some((c) => c.id === a.room.sessionId), 120000, 'contact inside sight');
  log.push(`sight: contact both ways at dist=${dist(a.you, b.you).toFixed(0)}u`);
  await settle(a, b, 60000, 'park inside sight');
  const obs = await observe(a, b, PERIOD * 1.5);
  const inSight = (f) => f.dist < SIGHT - 15;
  const nA = obs.a.filter((f) => inSight(f) && f.contactIds.includes(b.room.sessionId)).length;
  assert(nA > 0, 'sight: contact vanished while parked inside sight');
  // Inside sight there is no paint: no blips stamped in the parked window.
  const late = (ctx, w0, w1) => blipsIn(ctx, w0 + 300, w1).length;
  assert(late(a, obs.w0.a, obs.w1.a) === 0, 'sight: A still painted blips inside sight');
  assert(late(b, obs.w0.b, obs.w1.b) === 0, 'sight: B still painted blips inside sight');
  log.push(`sight: dist~150u — contacts steady (${nA} frames), blips stopped over ${(PERIOD * 1.5) / 1000}s`);
}

/** Pick an island + opposing park points that fit in the map, LOS-checked. */
function islandSetup(map, near, gapA, gapB) {
  const ok = (p) =>
    Math.hypot(p.x, p.y) < map.radius - 60 &&
    map.islands.every((i) => Math.hypot(p.x - i.x, p.y - i.y) > i.r + 30);
  const isles = map.islands
    .filter((i) => i.r >= 28 && i.r <= 65)
    .sort((p, q) => dist(p, near) - dist(q, near));
  for (const isle of isles) {
    for (let k = 0; k < 12; k++) {
      const ang = (k * Math.PI) / 6;
      const u = { x: Math.cos(ang), y: Math.sin(ang) };
      const pa = { x: isle.x + u.x * (isle.r + gapA), y: isle.y + u.y * (isle.r + gapA) };
      const pb = { x: isle.x - u.x * (isle.r + gapB), y: isle.y - u.y * (isle.r + gapB) };
      const paFar = { x: isle.x + u.x * (isle.r + 240), y: isle.y + u.y * (isle.r + 240) };
      if (ok(pa) && ok(pb) && ok(paFar)) return { isle, pa, pb, paFar };
    }
  }
  throw new Error('no usable island for the shadow phase');
}

/** Next waypoint toward `target`: flank the island if it blocks the straight line. */
function routeGoal(ctx, target, isle) {
  if (!ctx.you || !blockedBy(ctx.you, target, isle)) return target;
  const dx = target.x - isle.x;
  const dy = target.y - isle.y;
  const n = Math.hypot(dx, dy) || 1;
  const off = isle.r + 130;
  const p1 = { x: isle.x - (dy / n) * off, y: isle.y + (dx / n) * off };
  const p2 = { x: isle.x + (dy / n) * off, y: isle.y - (dx / n) * off };
  return dist(ctx.you, p1) < dist(ctx.you, p2) ? p1 : p2;
}

/** Park both ships on their island-side points, detouring around the rock. */
async function parkAcross(a, b, isle, pa, pb, timeoutMs, label) {
  a.goal = { mode: 'park', target: pa };
  b.goal = { mode: 'park', target: pb };
  const done = () =>
    a.you && b.you &&
    dist(a.you, pa) < 45 && dist(b.you, pb) < 45 &&
    Math.abs(a.you.speed) < 1 && Math.abs(b.you.speed) < 1;
  await pilotUntil([a, b], () => {
    a.goal.target = routeGoal(a, pa, isle);
    b.goal.target = routeGoal(b, pb, isle);
  }, done, timeoutMs, label);
}

async function phaseIsland(a, b, map, log) {
  const { isle, pa, pb, paFar } = islandSetup(map, b.you, 40, 40);
  a.isle = isle;
  b.isle = isle;
  await parkAcross(a, b, isle, pa, pb, 180000, 'park across the island');

  // 4a: inside sight range but shadowed — no contacts (and trivially no paint).
  let obs = await observe(a, b, PERIOD * 1.5);
  const shadowed = (f) => f.blocked && f.dist <= SIGHT;
  const nA = assertNoContactsWhile(obs.a, shadowed, 'island/A');
  const nB = assertNoContactsWhile(obs.b, shadowed, 'island/B');
  assert(nA > 20 && nB > 20, `island: shadow barely held (A=${nA} B=${nB} frames) — park failed?`);
  assert(blipsIn(a, obs.w0.a + 300, obs.w1.a).length === 0, 'island: A painted a shadowed blip');
  const d1 = dist(a.you, b.you);

  // 4b: back A out into the radar annulus, still down-shadow — radar stays blind.
  await parkAcross(a, b, isle, paFar, pb, 120000, 'park in shadowed radar band');
  obs = await observe(a, b, PERIOD * 2.2);
  const bandShadow = (f) => f.blocked && f.dist > SIGHT && f.dist <= RADAR;
  const nA2 = obs.a.filter(bandShadow).length;
  assert(nA2 > 20, `island: banded shadow barely held (${nA2} frames)`);
  assertNoContactsWhile(obs.a, () => true, 'island-band/A');
  assert(blipsIn(a, obs.w0.a + 300, obs.w1.a).length === 0, 'island: LOS failed to block radar (A got a blip)');
  assert(blipsIn(b, obs.w0.b + 300, obs.w1.b).length === 0, 'island: LOS failed to block radar (B got a blip)');
  log.push(`island: r=${isle.r.toFixed(0)}u — shadowed at ${d1.toFixed(0)}u: no contact (${nA}f); at ${dist(a.you, b.you).toFixed(0)}u in band: no blip over ${(PERIOD * 2.2) / 1000}s (${nA2}f)`);
}

// -------------------------------------------------------------------- main ---

async function main() {
  const a = await joinClient('FOG-A');
  const b = await joinClient('FOG-B');
  a.other = b;
  b.other = a;
  assert(a.room.roomId === b.room.roomId, 'clients joined different rooms');
  await sleep(300);
  assert(a.welcome && b.welcome, 'missing welcome');
  const map = generateMap(a.welcome.mapSeed, a.welcome.playerCap);

  const log = [];
  await phaseFar(a, b, log);
  await phaseRadarBand(a, b, map, log);
  await phaseShellReveal(a, b, log);
  await phaseSight(a, b, map, log);
  await phaseIsland(a, b, map, log);

  console.log('FOG SMOKE OK:', { room: a.room.roomId, seed: a.welcome.mapSeed });
  for (const line of log) console.log('  ' + line);
  await a.room.leave();
  await b.room.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error('FOG SMOKE FAILED:', err.message);
  process.exit(1);
});
