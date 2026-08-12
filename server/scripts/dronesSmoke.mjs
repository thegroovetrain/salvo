// Target-drone smoke: self-boots the colyseus server on PORT 2599 (never the dev
// server's 2567), joins TWO live @colyseus/sdk clients with a DEV matchOverride
// (the production minHumans:2) + a fast storm, and proves the whole drone loop
// end to end:
//   1. Two captains join the SAME room -> countdown; at activation the room
//      fills to CONFIG.match.fillTo with weaponless drones (fillTo-2 drones +
//      the two humans, one DRONE-xx roster row each) and the match goes LIVE.
//   2. Drones SAIL: every drone position a human ever observes (radar blips +
//      sight contacts) moves over time and stays in-bounds (inside the map, out
//      of every island). The hunter's scope paints drone blips.
//   3. Drones carry NO weapons: the humans fire ONLY torpedoes (the consort
//      fires nothing at all), so ANY gun ('shell') ballistic or any enemy-owned
//      mine seen would be a drone firing. Assert zero of both across the match.
//   4. HUNTER hunts by radar/sight and TORPEDOES a drone dead (its roster kills
//      reaches 1; a drone 'sunk' event carries by=hunter).
//   5. CONSORT then parks in the storm as the zone closes -> it sinks. HUNTER is
//      now the only afloat CAPTAIN, so the match FINISHES ON THAT SINK with
//      drones still sailing (amendment 4 — drones no longer gate the win) and
//      the winner is a HUMAN: drones can NEVER win. Results rows include the
//      drones, NO row is left at placement 0, and every still-afloat drone (read
//      off the roster) places between the winner and the last sink — the
//      socket-level proof of the ruling and of the T4b placement fix.
// Then kills its own server process group and verifies port 2599 is free.
//
// WHY TWO CAPTAINS (amendment 4, Eric ruling 2026-08-11): this smoke used to run
// ONE human on a dev minHumans:1 override and assert the match stayed active
// against a full drone fill. Drones no longer gate the win, so that setup now
// finishes on the activation tick with nothing to observe. Two captains is also
// the production shape (CONFIG.match.minHumans === 2) — the very premise the
// ruling rests on. Every drone assertion above is carried over unchanged.
//
// matchOverride/zoneOverride are dev tools — the real client never sets them.
// Run: node server/scripts/dronesSmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { CONFIG, PROTOCOL_VERSION, bearing, angleDiff, generateMap, pointInIsland } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 2599;
const endpoint = `ws://localhost:${PORT}`;
// Production two-captain countdown + a phased storm fast enough to funnel the
// field in minutes.
const MATCH_OVERRIDE = { minHumans: 2, countdownMs: 3000, resultsMs: 3000, joinWindowMs: 0 }; // no gathering window — legacy fast path
// Phased timeline (Story 3.1), compressed: 12s beats close ring 1/2/3 at
// 36-48s / 84-96s / 132-144s, funneling the dumb drones toward center (they
// head for the live ring center whenever the storm catches them) — giving a
// human loitering there reliable true-sight contacts to torpedo once the ring
// is inside sight scale (terminal = 0.7 x 330 = 231u < the 330u bubble).
// offsetCap 0 keeps every ring CONCENTRIC so this smoke's center-loiter
// choreography holds (zoneSmoke covers offset rings over sockets). The fastest
// close sweeps ~107 u/s — faster than any hull, but each close is followed by
// three holding beats (36s), so trailing drones re-enter with hp to spare
// (worst tier ~30 u/s soaks ~20-30s of 4hp/s storm on 80-120hp hulls).
const ZONE_OVERRIDE = { beatMs: 12000, ringSteps: [1 / 3, 2 / 3], offsetCap: 0, terminalSightFactor: 0.7 };
/** Map center — the storm's fully-closed point (concentric rings, offsetCap 0). */
const ORIGIN = { x: 0, y: 0 };
/** The consort's station: deep inside the terminal ring (231u) so the storm
 *  never touches it, but off the hunter's center loiter so the two captains
 *  aren't stacked on the same water while torpedoes are in the air. */
const CONSORT_STATION = { x: 0, y: -160 };

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isDrone = (id) => typeof id === 'string' && id.startsWith('drone-');

// --- server lifecycle --------------------------------------------------------

function bootServer() {
  const tsx = path.join(REPO, 'node_modules/.bin/tsx');
  const proc = spawn(tsx, ['src/index.ts'], {
    cwd: path.join(REPO, 'server'),
    detached: true, // own process group, so we can kill tsx + its node child
    // HC_DEV_OPTIONS=1 is required for the room to honor matchOverride/
    // zoneOverride at all (see server/src/rooms/roomOptions.ts) — without it
    // they're silently stripped and this smoke's assertions would fail.
    env: { ...process.env, NODE_ENV: 'development', PORT: String(PORT), HC_DEV_OPTIONS: '1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return proc;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1');
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
  });
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

// --- client harness ----------------------------------------------------------

async function joinClient(name) {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('arena', {
    name,
    pv: PROTOCOL_VERSION,
    matchOverride: MATCH_OVERRIDE,
    zoneOverride: ZONE_OVERRIDE,
  });
  const ctx = {
    name, room, welcome: null, you: null, seq: 0, fireSeq: 0,
    frames: 0, blipDroneIds: new Set(), contactDroneIds: new Set(),
    liveContacts: [], // this-frame drone contacts (true-sight, live pos+vel)
    droneTrack: new Map(), // droneId -> [first {x,y}, last {x,y}] to prove motion
    shellEvents: 0, enemyMines: 0, myTorps: 0,
    kills: 0, killedDroneId: null, sunkSeen: false, results: null, leftCode: null,
    islands: [], mapRadius: 0,
  };
  room.onMessage('w', (m) => onWelcome(ctx, m));
  room.onMessage('f', (m) => onFrame(ctx, m));
  room.onMessage('r', (m) => (ctx.results = m));
  room.onLeave((code) => (ctx.leftCode = code));
  return ctx;
}

function onWelcome(ctx, m) {
  ctx.welcome = m;
  ctx.mapRadius = m.mapRadius;
  ctx.islands = generateMap(m.mapSeed, m.playerCap).islands;
}

function recordDronePos(ctx, id, x, y) {
  const t = ctx.droneTrack.get(id);
  if (!t) ctx.droneTrack.set(id, { first: { x, y }, last: { x, y } });
  else t.last = { x, y };
  // In-bounds invariants for every observed drone position.
  assert(Math.hypot(x, y) <= ctx.mapRadius + 2, `drone ${id} observed outside the map`);
  for (const isle of ctx.islands) {
    // Polygon containment, not the bounding circle: islands are fractal
    // polygons inscribed in `isle.r`, so open water inside `r` (a cove, a
    // concave shoreline) is a LEGAL drone position. The old circle test
    // asserted the wrong invariant and would false-fail on it.
    assert(!pointInIsland({ x, y }, isle), `drone ${id} observed inside an island`);
  }
}

function onFrame(ctx, f) {
  ctx.frames += 1;
  if (f.you) ctx.you = f.you;
  ctx.liveContacts = f.contacts.filter((c) => isDrone(c.id));
  for (const c of ctx.liveContacts) {
    ctx.contactDroneIds.add(c.id);
    recordDronePos(ctx, c.id, c.x, c.y);
  }
  for (const e of f.events) onEvent(ctx, e);
  for (const mine of f.mines) if (!mine.own) ctx.enemyMines += 1;
}

function onEvent(ctx, e) {
  if (e.k === 'blip' && isDrone(e.id)) {
    ctx.blipDroneIds.add(e.id);
    recordDronePos(ctx, e.id, e.x, e.y);
  }
  if (e.k === 'shell') ctx.shellEvents += 1; // human never fires guns => must stay 0
  if (e.k === 'torp') ctx.myTorps += 1;
  if (e.k === 'sunk' && isDrone(e.id) && e.by === ctx.room.sessionId) {
    ctx.kills += 1;
    ctx.killedDroneId = e.id;
  }
  if (e.k === 'sunk' && e.id === ctx.room.sessionId) ctx.sunkSeen = true;
}

// --- steering ----------------------------------------------------------------

/** Nearest LIVE drone contact this frame (true-sight only), or null. */
function nearestLive(ctx) {
  let best = null;
  let bestD = Infinity;
  for (const c of ctx.liveContacts) {
    const d = dist(ctx.you, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** Lead a live contact by torpedo travel time. */
function leadPoint(you, c) {
  const t = dist(you, c) / CONFIG.torpedo.speed;
  return { x: c.x + Math.cos(c.heading) * c.speed * t, y: c.y + Math.sin(c.heading) * c.speed * t };
}

/** Rudder bias steering the human clear of any island dead ahead (else it jams). */
function islandAvoid(ctx) {
  const fx = Math.cos(ctx.you.heading);
  const fy = Math.sin(ctx.you.heading);
  let bias = 0;
  for (const c of ctx.islands) {
    const dx = c.x - ctx.you.x;
    const dy = c.y - ctx.you.y;
    if (dx * fx + dy * fy <= 0 || Math.hypot(dx, dy) > 160 + c.r) continue;
    bias += fx * dy - fy * dx > 0 ? -0.9 : 0.9; // turn away from the island's side
  }
  return bias;
}

/**
 * HUNT: loiter at center (the storm funnels the dumb drones inward, into true
 * sight) and lead-fire torpedoes at the nearest live contact. With the single
 * bow tube (owner play test) a fish is 70 dmg (retuned 55 -> 70, Eric ruling
 * 2026-08-04), so a 100hp drone still needs TWO hits — but now across two ~30s
 * reloads (retuned 12s -> 30s in the same pass); damage persists (no drone heal/respawn in active), so
 * click-per-tick fire (reload-paced) whittles a drone down over the hunting
 * window until it sinks.
 */
function huntTick(ctx, consort) {
  const inp = { seq: ++ctx.seq, throttle: 1, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, slot: 1, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
  if (!ctx.you) return void ctx.room.send('i', inp);
  const target = nearestLive(ctx);
  const fromCenter = Math.hypot(ctx.you.x, ctx.you.y);
  // Loiter centrally: if we've drifted out toward the storm, steer home rather
  // than chase (a faster ship over-runs the tightening ring and gets stormed).
  // Otherwise face the lead point and torpedo it. A single 70-dmg tube needs a
  // TIGHT solution to reliably land two fish on the same funneling drone, so
  // fire only when well aligned (loose 0.45rad spray mostly missed 38u/s drones).
  const chasing = target && fromCenter < 220;
  const aimPt = chasing ? leadPoint(ctx.you, target) : { x: 0, y: 0 };
  const brg = bearing(ctx.you, aimPt);
  inp.aim = brg;
  inp.rudder = clamp(angleDiff(ctx.you.heading, brg) * 3 + islandAvoid(ctx), -1, 1);
  if (chasing) {
    // Keep steerage (>steerageSpeed) even when closing so the bow can track a
    // maneuvering drone — a stalled hull can't turn (rudder scales with speed).
    inp.throttle = dist(ctx.you, target) > 120 ? 1 : 0.4;
    // Click every tick while the solution is tight — the tube reload paces the
    // actual launches (each click is consumed, fired or not) — UNLESS the
    // consort is sitting in the lane. Two captains share this water now, and a
    // stray fish into the consort would sink it early and finish the match
    // before the hunt lands its kill (amendment 4: one captain down ends it).
    const aligned = Math.abs(angleDiff(ctx.you.heading, brg)) < 0.12;
    if (aligned && !friendlyInLane(ctx, consort, brg, dist(ctx.you, target))) inp.fireSeq = ++ctx.fireSeq;
  } else {
    inp.throttle = fromCenter > 60 ? 1 : 0.3; // hold near center, keep steerageway
  }
  ctx.room.send('i', inp);
}

/**
 * Is the consort inside the firing lane — within FRIENDLY_CONE of the shot
 * bearing and no further out than the target? Out-of-band knowledge (the
 * harness drives both captains), used ONLY to hold fire; nothing here reads a
 * frame the client wasn't sent.
 */
const FRIENDLY_CONE = 0.35; // rad
function friendlyInLane(ctx, consort, brg, targetDist) {
  if (!consort?.you || consort.sunkSeen) return false;
  const d = dist(ctx.you, consort.you);
  if (d > targetDist + 150) return false;
  return Math.abs(angleDiff(bearing(ctx.you, consort.you), brg)) < FRIENDLY_CONE;
}

/**
 * HOLD STATION: make for `pt` and loiter there. `pt` sits well inside the
 * terminal ring (concentric, 231u), so a captain holding it is storm-safe for
 * the whole match — which is what keeps the consort alive through the hunt and
 * the hunter alive through the finish. Weapons cold: fireSeq never advances.
 */
function holdTick(ctx, pt) {
  const inp = { seq: ++ctx.seq, throttle: 0.4, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, slot: 1, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
  if (ctx.you) {
    const brg = bearing(ctx.you, pt);
    const d = dist(ctx.you, pt);
    inp.rudder = clamp(angleDiff(ctx.you.heading, brg) * 3 + islandAvoid(ctx), -1, 1);
    inp.throttle = d > 200 ? 1 : d > 60 ? 0.5 : 0.3; // keep steerageway, don't overshoot
  }
  ctx.room.send('i', inp);
}

/** FLEE: sail straight out to the edge and idle there so the storm takes us. */
function fleeTick(ctx) {
  const inp = { seq: ++ctx.seq, throttle: 1, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, slot: 1, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
  if (ctx.you) {
    const outward = Math.atan2(ctx.you.y, ctx.you.x); // bearing away from center
    inp.rudder = clamp(angleDiff(ctx.you.heading, outward) * 3, -1, 1);
  }
  ctx.room.send('i', inp);
}

function phase(ctx) {
  return ctx.room.state?.matchPhase ?? 'unknown';
}

function droneRosterCount(ctx) {
  let n = 0;
  ctx.room.state.players.forEach((_meta, id) => { if (isDrone(id)) n += 1; });
  return n;
}

/** Drone ids the ROSTER still reports as afloat — an oracle independent of the
 *  results placements, so "the match finished with drones afloat" is observed
 *  rather than inferred from the placement numbers being tested. */
function afloatDroneIds(ctx) {
  const out = [];
  ctx.room.state.players.forEach((meta, id) => { if (isDrone(id) && meta.alive) out.push(id); });
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

async function main() {
  const server = bootServer();
  const log = [];
  try {
    await waitForServer(15000);

    // --- 1. two captains -> countdown -> activation fills with drones -------
    const h = await joinClient('HUNTER');
    const k = await joinClient('CONSORT');
    assert(h.room.roomId === k.room.roomId, 'HUNTER and CONSORT joined different rooms');
    await sleep(400);
    assert(phase(h) === 'countdown', `2nd join should start the countdown (got ${phase(h)})`);
    await runUntil(() => {}, () => phase(h) === 'active', MATCH_OVERRIDE.countdownMs + 8000, 'activation');
    await sleep(300);
    const filled = droneRosterCount(h);
    assert(filled === CONFIG.match.fillTo - 2, `expected ${CONFIG.match.fillTo - 2} drones, got ${filled}`);
    assert(h.room.state.zoneState !== 'idle', 'storm timeline not anchored at activation');
    log.push(`activation: filled ${filled} drones (${CONFIG.match.fillTo} hulls total), match went live`);

    // --- 2/3/4. drones sail, paint blips, never fire; hunter torpedoes one ---
    // Single tube => a drone kill needs two 70-dmg fish across two ~30s reloads
    // (was one two-tube volley); widened window to absorb the extra reload.
    // NOTE: the 2026-08-04 balance pass took the reload 12s -> 30s, so every
    // MISS now costs 30s of this window instead of 12s.
    // Budget WIDENED 170s -> 300s in the same pass, for the same reason.
    // CONSORT holds its storm-safe station throughout: it must outlive the hunt,
    // because the moment it is out HUNTER wins and the match is over.
    await runUntil(
      () => { huntTick(h, k); holdTick(k, CONSORT_STATION); },
      () => h.kills >= 1,
      300000,
      'hunter torpedoes a drone',
    );
    assert(!k.sunkSeen, 'CONSORT sank during the hunt — the match would have ended early');
    assert(h.blipDroneIds.size >= 1, 'the scope never painted a drone blip');
    assert(h.shellEvents === 0, `saw ${h.shellEvents} gun shells — a drone fired guns`);
    assert(k.shellEvents === 0, `CONSORT saw ${k.shellEvents} gun shells — a drone fired guns`);
    assert(h.enemyMines === 0, `saw ${h.enemyMines} enemy mines — a drone dropped a mine`);
    assert(k.enemyMines === 0, `CONSORT saw ${k.enemyMines} enemy mines — a drone dropped a mine`);
    // The consort never clicks: its fireSeq never advances (holdTick is cold).
    // NOTE: k.myTorps is NOT the check — a `torp` event is any OBSERVED torpedo
    // reveal, so the consort counts the hunter's fish too.
    assert(k.fireSeq === 0, `CONSORT clicked ${k.fireSeq} time(s) (it must stay weapons-cold)`);
    // Every drone we tracked long enough must have visibly moved.
    let moved = 0;
    for (const [, t] of h.droneTrack) if (dist(t.first, t.last) > 20) moved += 1;
    assert(moved >= 1, 'no observed drone ever changed position');
    log.push(
      `combat: painted ${h.blipDroneIds.size} drone blip id(s), saw ${h.contactDroneIds.size} in sight, ` +
      `${moved} drone(s) observed sailing; fired ${h.myTorps} torp reveal(s), 0 gun/mine from drones; ` +
      `killed ${h.killedDroneId} (roster kills=${h.kills})`,
    );

    // --- 5. consort parks in the storm -> it sinks -> match finishes ---------
    // AMENDMENT 4 over real sockets: the finish lands on CONSORT's sink, with
    // drones still sailing. HUNTER holds its safe station and simply wins.
    await runUntil(
      () => { holdTick(h, ORIGIN); fleeTick(k); },
      () => k.sunkSeen || phase(h) === 'finished',
      90000,
      'storm sinks the consort',
    );
    await runUntil(() => {}, () => h.results !== null, 8000, 'results broadcast');
    const res = h.results;
    assert(res.winnerId === h.room.sessionId, `winnerId=${res.winnerId}, expected the hunter (drones can't win)`);
    assert(!isDrone(res.winnerId), `a DRONE won (${res.winnerId})`);
    const rowH = res.rows.find((r) => r.id === h.room.sessionId);
    assert(rowH && rowH.placement === 1, `hunter placement=${rowH?.placement}, expected 1`);
    assert(rowH.kills >= 1, `hunter kills=${rowH.kills}`);
    const rowK = res.rows.find((r) => r.id === k.room.sessionId);
    // Bounded, not pinned (like matchSmoke's rowB): the consort heads the SUNK
    // tier, which starts behind the winner and every still-afloat drone, and a
    // drone sinking on the same tick after it (sink order within a tick is
    // emission order) would take that head slot.
    assert(rowK && rowK.placement >= 2, `consort placement=${rowK?.placement}, expected >= 2`);
    const droneRows = res.rows.filter((r) => isDrone(r.id));
    assert(droneRows.length === CONFIG.match.fillTo - 2, `results missing drone rows (${droneRows.length})`);
    // THE RULING (T4b): the match ended with drones still afloat, and a hull
    // that never sank OUTLASTED every hull that did — so those drones place
    // between the winner and the sunk tier instead of falling out at placement
    // 0 (which used to sort them ahead of the winner). NO row is unplaced, and
    // placements are the dense range 1..N.
    assert(
      res.rows.every((r) => r.placement >= 1),
      `a row was left unplaced: ${JSON.stringify(res.rows.map((r) => [r.id, r.placement]))}`,
    );
    const seen = res.rows.map((r) => r.placement).sort((x, y) => x - y);
    assert(
      seen.every((p, i) => p === i + 1),
      `placements are not the dense range 1..${res.rows.length}: ${seen.join(',')}`,
    );
    assert(res.rows[0].id === rowH.id, `winner is not the first row (got ${res.rows[0].id})`);
    // Read the survivors off the ROSTER (independent oracle), then require each
    // of them to place ahead of the consort — the last sink. At least one must
    // exist: drones afloat at the finish is the whole point of amendment 4.
    const afloat = afloatDroneIds(h);
    assert(
      afloat.length > 0,
      'every drone was sunk at the finish — the match did not end with drones afloat (amendment 4)',
    );
    const survivorDrones = droneRows.filter((r) => afloat.includes(r.id));
    assert(
      survivorDrones.every((r) => r.placement > 1 && r.placement < rowK.placement),
      'a still-afloat drone did not place between the winner and the last sink: ' +
      JSON.stringify(res.rows.map((r) => [r.id, r.placement])),
    );
    log.push(
      `finish: HUNTER WON (placement 1, first row, kills ${rowH.kills}) with ` +
      `${survivorDrones.length} drone(s) STILL AFLOAT placed ${survivorDrones.map((r) => r.placement).sort((a, b) => a - b).join(',')}; ` +
      `consort placed ${rowK.placement}; ${droneRows.length} drone rows, ` +
      `placements [${droneRows.map((r) => r.placement).sort((a, b) => a - b).join(',')}]; no row at placement 0`,
    );

    // --- 6. room disconnects after resultsMs ---------------------------------
    await runUntil(() => {}, () => h.leftCode !== null && k.leftCode !== null, MATCH_OVERRIDE.resultsMs + 8000, 'room disconnect');
    log.push(`room disconnected both clients (codes ${h.leftCode}/${k.leftCode}) after ~${MATCH_OVERRIDE.resultsMs}ms`);

    console.log('DRONES SMOKE OK:', { room: h.room.roomId, trace: log });
  } finally {
    killServer(server);
    await sleep(400);
    const open = await portOpen(PORT);
    if (open) console.error(`WARNING: port ${PORT} still open after kill`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('DRONES SMOKE FAILED:', err.message);
  process.exit(1);
});
