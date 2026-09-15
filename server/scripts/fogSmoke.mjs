// Fog + radar smoke: two live @colyseus/sdk clients against a running dev
// server, verifying steps 9+10 end to end over the real wire. Both clients
// live in this process, so piloting/assertions use ground-truth positions
// while the FRAMES under test stay fogged.
//
// Phases:
//   0 FAR    — fresh spawns (dist > radar): NO contacts, NO blips.
//   1 BAND   — A parks in the radar annulus (sight < dist ≤ radar, LOS clear):
//              still no contacts, but blip events ≈ once per sweep revolution each
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
import { CONFIG, PROTOCOL_VERSION, generateMap, bearing, angleDiff, islandBlocksSegment, visibilityTo } from '@salvo/shared';

const endpoint = process.env.WS_URL || 'ws://localhost:2567';
const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;
const PERIOD = 60000 / CONFIG.vision.sweepRpm; // ms per base radar revolution
// THE parking tolerance: the one threshold `settle()` and `parkAcross()` accept
// as "arrived", and therefore the per-hull error budget every geometric
// precondition has to survive. Declared once so those preconditions can include
// it by reference (islandSetup's truesight filter, the 4b hard-cover re-check)
// instead of restating a literal that silently stops matching if this moves.
const PARK_TOL = 45;
// Slack on the any-hull sight bound (assertNoContactsWhile). Both sides of the
// comparison come from the SAME frame, so the true slack is zero; this only
// absorbs a frame that carried contacts but no `you` (the observer pose is then
// one 50ms tick stale — at most ~2.3u of hull travel).
const SIGHT_TOL = 15;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** World-space center of a `ReturnBlipEvent`'s cell rect.
 *  A blip has carried NO x/y since the `return` radar grammar replaced the
 *  retired `silhouette` shape (cycle 105, PV 44): the payload is an ABSOLUTE
 *  world cell rect on the `CONFIG.vision.radarCellU` lattice
 *  (`shared/src/types.ts` ReturnBlipEvent — k,t,gx,gy,w,h,bits) plus a packed
 *  coverage mask, and it carries no identity either. This smoke's band check
 *  predates that change and was reading `e.x`/`e.y` (undefined → NaN → the
 *  assert could never pass); the rect center is the equivalent proxy for
 *  "the paint landed on the target hull". */
const blipCenter = (e) => ({
  x: (e.gx + e.w / 2) * CONFIG.vision.radarCellU,
  y: (e.gy + e.h / 2) * CONFIG.vision.radarCellU,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- clients ---

// Sandbox (dev-only): pre-step-14 room behavior — no match lifecycle, permissive
// combat policy, storm at 2nd join. The long beat keeps that storm harmless
// for the whole choreography (this smoke predates the zone / match steps).
// Phased timeline (Story 3.1): a 10-minute beat parks the first close at 30
// minutes out, so the whole choreography runs on the full-map ring.
const SANDBOX_ZONE = { beatMs: 600000, ringSteps: [1 / 3, 2 / 3], offsetCap: 1, terminalSightFactor: 2 };

async function joinClient(name) {
  const client = new Client(endpoint);
  // mapSeed 265 (dev-only pin): the latencyHarness scan winner for the
  // amendment-12 island field (fewest islands — 23 — with the farthest center
  // clearance, 663u; scan method documented there). park() carries an
  // islandAvoid bias for the long sail-ins; the pin keeps the standoff
  // geometry and LOS lanes deterministic.
  const room = await client.joinOrCreate('arena', { name, pv: PROTOCOL_VERSION, matchOverride: { sandbox: true }, zoneOverride: SANDBOX_ZONE, mapSeed: 265 });
  const ctx = {
    name, room, welcome: null, you: null, now: 0,
    contacts: [], blips: [], shells: [], booms: [],
    frames: null, // when set, per-frame records are pushed here
    goal: { mode: 'idle' }, seq: 0, fireSeq: 0, other: null,
    islands: [], // rebuilt from the welcome — arms park()'s island avoidance
  };
  room.onMessage('w', (m) => {
    ctx.welcome = m;
    ctx.islands = generateMap(m.mapSeed, m.playerCap).islands;
  });
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
      // EVERY contact's range from the observer's OWN pose in the SAME frame
      // (perception materializes a contact at the live sim pose, and `you` is
      // the same tick's pose — no interpolation on either side), which is what
      // lets assertNoContactsWhile police the any-hull sight bound below.
      contactD: f.contacts.map((c) => ({ id: c.id, d: dist(c, ctx.you) })),
      blocked: ctx.isle ? blockedBy(ctx.you, ctx.other.you, ctx.isle) : false,
    });
  }
}

/**
 * True iff the island lies on the segment from `from` to `to`. Uses the shared
 * polygon LOS seam — the SAME primitive perception.ts runs, so the smoke agrees
 * with the server. (The old bounding-circle test over-blocked: islands are
 * fractal polygons inscribed in `isle.r`.)
 */
function blockedBy(from, to, isle) {
  return islandBlocksSegment(from, to, isle);
}

// ---------------------------------------------------------------- piloting ---

function control(ctx) {
  const inp = { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
  const g = ctx.goal;
  if (g.mode === 'park') park(ctx, inp, g.target);
  else if (g.mode === 'engage') engage(ctx, inp, g.target, g.fire);
  ctx.room.send('i', inp);
}

/** Rudder bias steering away from any island ahead (dronesSmoke islandAvoid —
 *  needed since amendment 12: the area-scaled island budget puts ~35 rocks on
 *  the 2400u board, so long straight sail-ins WILL cross some). */
function islandAvoid(ctx) {
  const fx = Math.cos(ctx.you.heading);
  const fy = Math.sin(ctx.you.heading);
  let bias = 0;
  for (const c of ctx.islands) {
    const dx = c.x - ctx.you.x;
    const dy = c.y - ctx.you.y;
    if (dx * fx + dy * fy <= 0 || Math.hypot(dx, dy) > 170 + c.r) continue;
    bias += fx * dy - fy * dx > 0 ? -0.9 : 0.9;
  }
  return bias;
}

/** Drive to `target` and stop there (throttle tapers with distance). */
function park(ctx, inp, target) {
  if (!ctx.you) return;
  const d = dist(ctx.you, target);
  if (d < 15) return; // arrived: coast to a stop
  const want = bearing(ctx.you, target);
  const err = angleDiff(ctx.you.heading, want);
  inp.rudder = clamp(err * 2.5 + islandAvoid(ctx), -1, 1);
  inp.throttle = d > 140 ? 1 : Math.abs(err) > 0.6 ? 0.35 : clamp(d / 140, 0.25, 1);
}

/** Beam-on orbit keeping `target` abeam; fires when it bears (combatSmoke's). */
function engage(ctx, inp, target, fireAllowed) {
  if (!ctx.you || !target) return;
  const brg = bearing(ctx.you, target);
  inp.rudder = clamp(angleDiff(ctx.you.heading, brg - Math.PI / 2) * 3, -1, 1);
  inp.throttle = 0.5;
  inp.aim = brg;
  inp.aimDist = dist(ctx.you, target); // the shell bursts AT the click point
  // 360° gun (Story 1.4): never out-of-arc — click every tick while allowed;
  // the single-shot reload paces shots.
  if (fireAllowed) inp.fireSeq = ++ctx.fireSeq;
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
    (a.goal.mode !== 'park' || dist(a.you, a.goal.target) < PARK_TOL) &&
    (b.goal.mode !== 'park' || dist(b.you, b.goal.target) < PARK_TOL);
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

/**
 * Blips in a window, ATTRIBUTED to `target` when one is given. The `return`
 * radar grammar carries no identity (cycle 105), so attribution is geometric:
 * a paint whose cell-rect center is within ATTRIBUTE_U of the (parked) subject
 * is the subject's. Same reason as assertNoContactsWhile — PvE fleet hulls
 * paint too, and their paints say nothing about a captain-to-captain claim.
 */
// 60u: a hull's rasterized footprint centers within well under a hull length of
// its own hull (the band phase asserts exactly that bound independently). Wider
// than this and a PvE fleet hull loitering near the subject is mistaken for it —
// measured: at 150u the island phase attributed a drone's paint to the subject
// on a bearing whose `visibilityTo` was a hard 0.
const ATTRIBUTE_U = 60;
const blipsIn = (ctx, t0, t1, target) => {
  // A subject with no pose yet makes attribution VACUOUS: every paint fails the
  // distance test, so every "no blips" assert downstream passes for the wrong
  // reason. A subject is always a joined client that has framed by the time any
  // phase runs, so this can only fire on a real regression.
  if (target) assert(target.you, `blipsIn: subject ${target.name} has no pose yet — attribution would be vacuous`);
  return ctx.blips.filter(
    (e) => e.t >= t0 && e.t <= t1 && (!target || dist(blipCenter(e), target.you) < ATTRIBUTE_U),
  );
};

/** Frames where the predicate held; asserts none of them carried a contact. */
/**
 * Every fog claim in this smoke is about ONE subject — the other captain —
 * because every predicate is written over `f.dist`, the captain-to-captain
 * separation. The PvE fleet (Story 5.6) sails its own hulls into these rooms
 * and they legitimately enter sight, so counting ANY contact (what this did
 * before) makes the claim false for a reason it never meant to test. Scope it
 * to the subject id.
 */
function assertNoContactsWhile(frames, pred, label, subjectId) {
  const held = frames.filter(pred);
  const bad = held.filter((f) => f.contactIds.includes(subjectId));
  assert(bad.length === 0, `${label}: ${bad.length}/${held.length} frames leaked a contact`);
  // ...AND the any-hull half the subject scoping would otherwise have dropped.
  // Scoping to the subject id answers "is B hidden from A", but a perception
  // regression that leaked a THIRD hull (a PvE fleet ship) past the sight
  // boundary would sail through it. The honest invariant is not "no fleet
  // contacts" — fleet hulls legitimately enter sight all the time — it is NO
  // CONTACT BEYOND SIGHT, for any id, which is exactly what contactSignal
  // claims (`d <= sightOf(me)` + LOS, boundary inclusive). Checked over EVERY
  // frame in the window, not just the held ones: the bound does not depend on
  // the phase predicate. Neither smoke client ever fires a star shell, so the
  // lit-zone truesight-parity path (the one legal way a contact sits outside
  // the bubble) cannot arise here; if one is ever added, that path needs an
  // exemption rather than a bigger tolerance.
  for (const f of frames) {
    for (const c of f.contactD) {
      assert(c.d <= SIGHT + SIGHT_TOL, `${label}: contact ${c.id} at ${c.d.toFixed(0)}u > sight ${SIGHT}u (+${SIGHT_TOL}u tol)`);
    }
  }
  return held.length;
}

// ------------------------------------------------------------------ phases ---

async function phaseFar(a, b, log) {
  await pilotUntil([a, b], null, () => a.you && b.you, 5000, 'first frames');
  const d0 = dist(a.you, b.you);
  assert(d0 > RADAR, `spawns unexpectedly close (${d0.toFixed(0)}u <= radar)`);
  const obs = await observe(a, b, PERIOD * 1.5);
  assertNoContactsWhile(obs.a, () => true, 'far/A', b.room.sessionId);
  assertNoContactsWhile(obs.b, () => true, 'far/B', a.room.sessionId);
  assert(blipsIn(a, obs.w0.a, obs.w1.a, b).length === 0, 'far: A got blips beyond radar range');
  assert(blipsIn(b, obs.w0.b, obs.w1.b, a).length === 0, 'far: B got blips beyond radar range');
  log.push(`far: dist=${d0.toFixed(0)}u — no contacts, no blips over ${(PERIOD * 1.5) / 1000}s`);
}

/** A point `standoff` u from B toward A, rotated until the B-line is LOS-clear. */
function standoffPoint(a, b, islands, standoff) {
  const base = bearing(b.you, a.you);
  for (let k = 0; k < 12; k++) {
    const ang = base + k * (Math.PI / 9) * (k % 2 ? 1 : -1);
    const p = { x: b.you.x + Math.cos(ang) * standoff, y: b.you.y + Math.sin(ang) * standoff };
    if (islands.every((i) => !islandBlocksSegment(p, b.you, i))) return p;
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
  assertNoContactsWhile(obs.a, (f) => f.dist > SIGHT + 15, 'band/A', b.room.sessionId);
  assertNoContactsWhile(obs.b, (f) => f.dist > SIGHT + 15, 'band/B', a.room.sessionId);
  // Radar: ≈ once per sweep period, each way.
  const ba = blipsIn(a, obs.w0.a, obs.w1.a, b);
  const bb = blipsIn(b, obs.w0.b, obs.w1.b, a);
  for (const [who, blips, target2, ctx] of [['A', ba, b, a], ['B', bb, a, b]]) {
    assert(blips.length >= 2 && blips.length <= 3,
      `band: ${who} got ${blips.length} blips over 2.5 periods (want 2-3)`);
    // WHAT IS NOW PROVEN, and why the old form proved nothing. `blipsIn` with a
    // subject PRE-FILTERS to centers within ATTRIBUTE_U, so re-asserting the
    // same `< 60` on the same metric was a tautology: a return rasterized 90u
    // off the hull was silently EXCLUDED from the set rather than failing, and
    // the count band then failed for an unrelated-looking reason (or passed, if
    // it was one of three). Position is a claim again by looking at the paints
    // attribution THREW AWAY. Over the UNFILTERED window we take every paint
    // landing within 2x ATTRIBUTE_U of the parked subject and require that it
    // also be within ATTRIBUTE_U — i.e. NO RETURN NEAR THE SUBJECT IS OFF
    // TARGET, so a mis-rasterized (or drifted, or wrong-hull-pose) return in
    // the 60-120u shell is a FAILURE instead of an exclusion.
    // The subject is the only captain in that shell (they parked ~420u apart),
    // and fleet hulls cannot be attributed directly — their positions are not
    // available to this smoke at all beyond truesight, which is exactly the
    // range this phase lives at — so the annulus is the available oracle.
    const unfiltered = blipsIn(ctx, ctx === a ? obs.w0.a : obs.w0.b, ctx === a ? obs.w1.a : obs.w1.b, null);
    const near = unfiltered.filter((e) => dist(blipCenter(e), target2.you) < 2 * ATTRIBUTE_U);
    const offTarget = near.filter((e) => dist(blipCenter(e), target2.you) >= ATTRIBUTE_U);
    assert(offTarget.length === 0,
      `band: ${who} painted ${offTarget.length} return(s) near the subject but off it (${offTarget.map((e) => dist(blipCenter(e), target2.you).toFixed(0)).join(',')}u; attribute<${ATTRIBUTE_U}u)`);
    assert(near.length === blips.length,
      `band: ${who} attribution disagrees (${blips.length} attributed vs ${near.length} within ${2 * ATTRIBUTE_U}u)`);
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
    // Reveal must be LATER than launch — never on the launch tick. The exact
    // delay is geometry ((standoff - sight)/shellSpeed ~ 180ms at 420u standoff,
    // sight 330, shell 500u/s — the old 1000ms literal predates both retunes);
    // the load-bearing anti-cheat check is the reveal POSITION below (the shell
    // materializes at B's sight boundary, not at A's muzzle).
    assert(sb.t - sa.t >= CONFIG.tick.simDtMs, `shell: ${sb.id} revealed to B on its launch tick (+${(sb.t - sa.t).toFixed(0)}ms)`);
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
  const late = (ctx, w0, w1, target) => blipsIn(ctx, w0 + 300, w1, target).length;
  assert(late(a, obs.w0.a, obs.w1.a, b) === 0, 'sight: A still painted blips inside sight');
  assert(late(b, obs.w0.b, obs.w1.b, a) === 0, 'sight: B still painted blips inside sight');
  log.push(`sight: dist~150u — contacts steady (${nA} frames), blips stopped over ${(PERIOD * 1.5) / 1000}s`);
}

/** Pick an island + opposing park points that fit in the map, LOS-checked.
 *
 *  THE RADAR CLAUSE IS HEIGHT-AWARE NOW (Story 4.11, cycle 68): binary polygon
 *  LOS still gates truesight (phase 4a), but the radar gate is
 *  `radarShadow.visibilityTo(...) > 0` — a low island deliberately no longer
 *  hides a distant ship. Phase 4b's "no blip" claim is therefore only true
 *  behind terrain that is ABSOLUTE COVER at that standoff (~39% of
 *  land-crossing bearings), so the island/bearing search now demands it
 *  explicitly instead of assuming every rock blocks every ray. */
/** Absolute radar cover BOTH ways between two points (the phase-4b claim). */
function hardCover(map, p, q) {
  return (
    visibilityTo(map.heightRaster, p.x, p.y, q.x, q.y) === 0 &&
    visibilityTo(map.heightRaster, q.x, q.y, p.x, p.y) === 0
  );
}

function islandSetup(map, near, gapA, gapB) {
  const out = [];
  const ok = (p) =>
    Math.hypot(p.x, p.y) < map.radius - 60 &&
    map.islands.every((i) => Math.hypot(p.x - i.x, p.y - i.y) > i.r + 30);
  // Upper bound is the 4a constraint: parked on opposite sides at `gap` each,
  // the pair must still be inside truesight — and PARKING ERROR COUNTS. `done`
  // in parkAcross accepts PARK_TOL per hull, so the worst legal park is
  // `2r + gapA + gapB + 2 * PARK_TOL` apart, and a filter written at the
  // NOMINAL separation admits islands that can put a legal park OUTSIDE sight
  // (r = 110 gave 300u nominal against SIGHT 330 — 30u of headroom against 90u
  // of budget), turning phase 4a's `nA > 20` into a coin flip. Including the
  // budget binds at r < 70 on the shipped numbers. The shipped 65 cap predates
  // the height-aware radar gate and excluded exactly the tall rocks phase 4b
  // needs for absolute cover, so it stays lifted.
  const isles = map.islands
    .filter((i) => i.r >= 28 && i.r <= 110 && 2 * i.r + gapA + gapB + 2 * PARK_TOL < SIGHT - 20)
    .sort((p, q) => dist(p, near) - dist(q, near));
  for (const isle of isles) {
    for (let k = 0; k < 36; k++) {
      const ang = (k * Math.PI) / 18;
      const u = { x: Math.cos(ang), y: Math.sin(ang) };
      const pa = { x: isle.x + u.x * (isle.r + gapA), y: isle.y + u.y * (isle.r + gapA) };
      const pb = { x: isle.x - u.x * (isle.r + gapB), y: isle.y - u.y * (isle.r + gapB) };
      // The 4b standoff must land A in the RADAR ANNULUS (SIGHT < d <= RADAR),
      // and the separation there is `2r + farGap + gapB` — so a fixed offset is
      // only safe for a big rock. The shipped 240 gave 2*28+280 = 336u against
      // SIGHT 330 on a minimum-radius island, i.e. 6u of headroom against ~10u
      // of parking slop: whether the phase could pass at all depended on which
      // island happened to be nearest B's (randomly placed) spawn. Derive the
      // offset from the island instead, aiming ~SIGHT+120 (450u — comfortably
      // clear of both band edges at RADAR 660).
      const farGap = Math.max(240, SIGHT + 120 - 2 * isle.r - gapB);
      const paFar = { x: isle.x + u.x * (isle.r + farGap), y: isle.y + u.y * (isle.r + farGap) };
      if (ok(pa) && ok(pb) && ok(paFar) && hardCover(map, paFar, pb)) out.push({ isle, pa, pb, paFar, farGap, ok });
    }
  }
  if (out.length === 0) throw new Error('no usable island for the shadow phase');
  return out;
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
    dist(a.you, pa) < PARK_TOL && dist(b.you, pb) < PARK_TOL &&
    Math.abs(a.you.speed) < 1 && Math.abs(b.you.speed) < 1;
  await pilotUntil([a, b], () => {
    a.goal.target = routeGoal(a, pa, isle);
    b.goal.target = routeGoal(b, pb, isle);
  }, done, timeoutMs, label);
}

/**
 * Park A in the shadowed radar band and PROVE the cover on the ACTUAL poses.
 *
 * `islandSetup` evaluates hardCover at the NOMINAL points, but parkAcross
 * accepts PARK_TOL of error PER HULL — up to 90u of combined drift on a ray
 * whose whole claim is that it grazes terrain tall enough to be absolute cover.
 * A correct server can therefore paint a legitimate blip through a gap the
 * smoke opened itself, and phase 4b reports "terrain failed to block radar".
 * So: re-evaluate `visibilityTo` BOTH ways on the parked poses; while it is not
 * absolute cover, re-park — first by re-deriving A's standoff along the line
 * through the island from B's ACTUAL pose (B's drift tilts the ray, and this
 * cancels it), then by falling back to the next candidate bearing/island. Only
 * a verified-covered park is ever observed.
 */
async function parkShadowedBand(a, b, map, cands, log) {
  let last = '';
  for (let ci = 0; ci < Math.min(cands.length, 3); ci++) {
    const cand = cands[ci];
    let paFar = cand.paFar;
    for (let attempt = 0; attempt < 3; attempt++) {
      await parkAcross(a, b, cand.isle, paFar, cand.pb, 120000, `park in shadowed radar band (cand ${ci}, try ${attempt})`);
      if (hardCover(map, a.you, b.you)) {
        if (ci > 0 || attempt > 0) log.push(`island: shadowed-band park verified on cand ${ci} try ${attempt}`);
        return { ...cand, paFar };
      }
      last = `cand ${ci} try ${attempt}: vis=${visibilityTo(map.heightRaster, a.you.x, a.you.y, b.you.x, b.you.y).toFixed(4)}/${visibilityTo(map.heightRaster, b.you.x, b.you.y, a.you.x, a.you.y).toFixed(4)} offA=${dist(a.you, paFar).toFixed(0)}u offB=${dist(b.you, cand.pb).toFixed(0)}u`;
      // Re-aim A down the true island-to-B line, correcting for B's park error.
      const ang = Math.atan2(b.you.y - cand.isle.y, b.you.x - cand.isle.x);
      const p = { x: cand.isle.x - Math.cos(ang) * (cand.isle.r + cand.farGap), y: cand.isle.y - Math.sin(ang) * (cand.isle.r + cand.farGap) };
      if (!cand.ok(p) || !hardCover(map, p, b.you)) break; // this bearing is spent
      paFar = p;
    }
  }
  throw new Error(`island: could not park in absolute radar cover (${last})`);
}

async function phaseIsland(a, b, map, log) {
  const cands = islandSetup(map, b.you, 40, 40);
  const { isle, pa, pb } = cands[0];
  a.isle = isle;
  b.isle = isle;
  await parkAcross(a, b, isle, pa, pb, 180000, 'park across the island');

  // 4a: inside sight range but shadowed — no contacts (and trivially no paint).
  let obs = await observe(a, b, PERIOD * 1.5);
  const shadowed = (f) => f.blocked && f.dist <= SIGHT;
  const nA = assertNoContactsWhile(obs.a, shadowed, 'island/A', b.room.sessionId);
  const nB = assertNoContactsWhile(obs.b, shadowed, 'island/B', a.room.sessionId);
  assert(nA > 20 && nB > 20, `island: shadow barely held (A=${nA} B=${nB} frames) — park failed?`);
  assert(blipsIn(a, obs.w0.a + 300, obs.w1.a, b).length === 0, 'island: A painted a shadowed blip');
  const d1 = dist(a.you, b.you);

  // 4b: back A out into the radar annulus, still down-shadow — radar stays blind.
  // The park is VERIFIED on the parked poses before a single frame is observed
  // (see parkShadowedBand), so the precondition is live, not nominal.
  const band = await parkShadowedBand(a, b, map, cands, log);
  const paFar = band.paFar;
  a.isle = band.isle; // a later candidate may be a different rock
  b.isle = band.isle;
  obs = await observe(a, b, PERIOD * 2.2);
  const bandShadow = (f) => f.blocked && f.dist > SIGHT && f.dist <= RADAR;
  const nA2 = obs.a.filter(bandShadow).length;
  const dbg = `frames=${obs.a.length} blocked=${obs.a.filter((f) => f.blocked).length} inBand=${obs.a.filter((f) => f.dist > SIGHT && f.dist <= RADAR).length} d=[${Math.min(...obs.a.map((f) => f.dist)).toFixed(0)}..${Math.max(...obs.a.map((f) => f.dist)).toFixed(0)}]u SIGHT=${SIGHT}`;
  assert(nA2 > 20, `island: banded shadow barely held (${nA2} frames; ${dbg})`);
  assertNoContactsWhile(obs.a, () => true, 'island-band/A', b.room.sessionId);
  // Absolute cover was verified ON THE PARKED POSES (parkShadowedBand), so a
  // blip here means the height-aware radar gate leaked, not that terrain is
  // soft and not that the smoke parked itself into a gap.
  const liveVis = visibilityTo(map.heightRaster, a.you.x, a.you.y, b.you.x, b.you.y).toFixed(4);
  const nomVis = visibilityTo(map.heightRaster, paFar.x, paFar.y, band.pb.x, band.pb.y).toFixed(4);
  const offA = dist(a.you, paFar).toFixed(0), offB = dist(b.you, band.pb).toFixed(0);
  assert(blipsIn(a, obs.w0.a + 300, obs.w1.a, b).length === 0, `island: terrain failed to block radar (A got a blip; liveVis=${liveVis} nomVis=${nomVis} offA=${offA}u offB=${offB}u d=${dist(a.you, b.you).toFixed(0)}u)`);
  assert(blipsIn(b, obs.w0.b + 300, obs.w1.b, a).length === 0, 'island: terrain failed to block radar (B got a blip)');
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
