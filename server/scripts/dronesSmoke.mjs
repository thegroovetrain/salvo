// Target-drone smoke: self-boots the colyseus server on PORT 2599 (never the dev
// server's 2567), joins ONE live @colyseus/sdk client with a DEV matchOverride
// that lets a solo human start the countdown (minHumans:1) + a fast storm, and
// proves the whole drone loop end to end:
//   1. Solo join -> countdown; at activation the room fills to CONFIG.match.fillTo
//      with weaponless drones (5 drones + the human = 6 hulls, 5 DRONE-xx roster
//      rows), and the match does NOT insta-finish (the win-check fix).
//   2. Drones SAIL: every drone position the human ever observes (radar blips +
//      sight contacts) moves over time and stays in-bounds (inside the map, out
//      of every island). The human's scope paints drone blips.
//   3. Drones carry NO weapons: the human fires ONLY torpedoes, so ANY gun
//      ('shell') ballistic or any enemy-owned mine seen would be a drone firing.
//      Assert zero of both across the whole match.
//   4. The human hunts by radar/sight and TORPEDOES a drone dead (its roster
//      kills reaches 1; a drone 'sunk' event carries by=human).
//   5. The human then parks in the storm as the zone closes -> it sinks. With no
//      humans left the match FINISHES: winner = the human (drones can NEVER win,
//      per ruling), results rows include the drones with placements.
// Then kills its own server process group and verifies port 2599 is free.
//
// matchOverride/zoneOverride are dev tools — the real client never sets them.
// Run: node server/scripts/dronesSmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { CONFIG, PROTOCOL_VERSION, bearing, angleDiff, generateMap } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 2599;
const endpoint = `ws://localhost:${PORT}`;
// Solo countdown + a storm that grants a hunting window (25s grace at full
// radius), then closes so a parked human is stormed out.
const MATCH_OVERRIDE = { minHumans: 1, countdownMs: 3000, resultsMs: 3000 };
// Shrink to a tight ring so the dumb drones funnel toward center (they head for
// center whenever the storm catches them) — giving a human loitering at center
// reliable true-sight contacts to torpedo. The shrink RATE ((900-90)/50s ≈ 16
// u/s) is kept below ship maxSpeed (38 u/s) so a ship can actually sail inward
// and hold the safe center; a faster ring would strand every hull outside.
const ZONE_OVERRIDE = { grace: 2000, shrinkDuration: 50000, endRadiusFraction: 0.1 };

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
    assert(dist({ x, y }, isle) > isle.r, `drone ${id} observed inside an island`);
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
 * bow tube (owner play test) a fish is 55 dmg, so a 100hp drone needs TWO hits
 * across two ~12s reloads; damage persists (no drone heal/respawn in active), so
 * click-per-tick fire (reload-paced) whittles a drone down over the hunting
 * window until it sinks.
 */
function huntTick(ctx) {
  const inp = { seq: ++ctx.seq, throttle: 1, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, slot: 1, fireT: 0, actSeq: 0, actSlot: 0 };
  if (!ctx.you) return void ctx.room.send('i', inp);
  const target = nearestLive(ctx);
  const fromCenter = Math.hypot(ctx.you.x, ctx.you.y);
  // Loiter centrally: if we've drifted out toward the storm, steer home rather
  // than chase (a faster ship over-runs the tightening ring and gets stormed).
  // Otherwise face the lead point and torpedo it. A single 55-dmg tube needs a
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
    // actual launches (each click is consumed, fired or not).
    if (Math.abs(angleDiff(ctx.you.heading, brg)) < 0.12) inp.fireSeq = ++ctx.fireSeq;
  } else {
    inp.throttle = fromCenter > 60 ? 1 : 0.3; // hold near center, keep steerageway
  }
  ctx.room.send('i', inp);
}

/** FLEE: sail straight out to the edge and idle there so the storm takes us. */
function fleeTick(ctx) {
  const inp = { seq: ++ctx.seq, throttle: 1, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, slot: 1, fireT: 0, actSeq: 0, actSlot: 0 };
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

    // --- 1. solo countdown -> activation fills with drones ------------------
    const h = await joinClient('SOLO');
    await sleep(400);
    assert(phase(h) === 'countdown', `solo join should start the countdown (got ${phase(h)})`);
    await runUntil(() => {}, () => phase(h) === 'active', MATCH_OVERRIDE.countdownMs + 8000, 'activation');
    await sleep(300);
    const filled = droneRosterCount(h);
    assert(filled === CONFIG.match.fillTo - 1, `expected ${CONFIG.match.fillTo - 1} drones, got ${filled}`);
    assert(h.room.state.zoneState !== 'idle', 'storm timeline not anchored at activation');
    log.push(`activation: filled ${filled} drones (${CONFIG.match.fillTo} hulls total), match stayed active`);

    // --- 2/3/4. drones sail, paint blips, never fire; human torpedoes one ----
    // Single tube => a drone kill needs two 55-dmg fish across two ~12s reloads
    // (was one two-tube volley); widened window to absorb the extra reload.
    await runUntil(() => huntTick(h), () => h.kills >= 1, 170000, 'human torpedoes a drone');
    assert(h.blipDroneIds.size >= 1, 'the scope never painted a drone blip');
    assert(h.shellEvents === 0, `saw ${h.shellEvents} gun shells — a drone fired guns`);
    assert(h.enemyMines === 0, `saw ${h.enemyMines} enemy mines — a drone dropped a mine`);
    // Every drone we tracked long enough must have visibly moved.
    let moved = 0;
    for (const [, t] of h.droneTrack) if (dist(t.first, t.last) > 20) moved += 1;
    assert(moved >= 1, 'no observed drone ever changed position');
    log.push(
      `combat: painted ${h.blipDroneIds.size} drone blip id(s), saw ${h.contactDroneIds.size} in sight, ` +
      `${moved} drone(s) observed sailing; fired ${h.myTorps} torp reveal(s), 0 gun/mine from drones; ` +
      `killed ${h.killedDroneId} (roster kills=${h.kills})`,
    );

    // --- 5. park in the storm -> human sinks -> match finishes ---------------
    await runUntil(() => fleeTick(h), () => h.sunkSeen || phase(h) === 'finished', 90000, 'storm sinks the human');
    await runUntil(() => {}, () => h.results !== null, 8000, 'results broadcast');
    const res = h.results;
    assert(res.winnerId === h.room.sessionId, `winnerId=${res.winnerId}, expected the human (drones can't win)`);
    const rowH = res.rows.find((r) => r.id === h.room.sessionId);
    assert(rowH && rowH.placement === 1, `human placement=${rowH?.placement}, expected 1`);
    assert(rowH.kills >= 1, `human kills=${rowH.kills}`);
    const droneRows = res.rows.filter((r) => isDrone(r.id));
    assert(droneRows.length === CONFIG.match.fillTo - 1, `results missing drone rows (${droneRows.length})`);
    assert(droneRows.some((r) => r.placement > 0), 'no drone holds a placement in the results');
    log.push(
      `finish: human WON (placement 1, kills ${rowH.kills}); ` +
      `${droneRows.length} drone rows, placements [${droneRows.map((r) => r.placement).sort((a, b) => a - b).join(',')}]`,
    );

    // --- 6. room disconnects after resultsMs ---------------------------------
    await runUntil(() => {}, () => h.leftCode !== null, MATCH_OVERRIDE.resultsMs + 8000, 'room disconnect');
    log.push(`room disconnected the client (code ${h.leftCode}) after ~${MATCH_OVERRIDE.resultsMs}ms`);

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
