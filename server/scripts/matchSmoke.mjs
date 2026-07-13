// Match-lifecycle smoke: self-boots the colyseus server on PORT 2599 (never
// the dev server's 2567), joins two live colyseus.js clients with a DEV
// matchOverride that shrinks the lifecycle timers, and proves the full loop:
//   1. waiting -> countdown at the 2nd join; the room LOCKS (a 3rd client's
//      joinOrCreate lands in a fresh room).
//   2. Ready room is weapons-safe: A torpedoes B point blank — B sees the
//      boom strike itself but loses ZERO hp until the match activates.
//   3. countdown end -> active: both hulls teleported to the spawn ring at
//      full hp, storm timeline anchored (zoneState leaves 'idle').
//   4. A sinks B (two torpedoes): B's own sunk event carries by=A; B then
//      receives spec:true frames (you omitted, unfogged contacts incl. A).
//      A NEVER receives a spec frame before the frame that reports B's sink
//      (the finish happens on the sink tick — from then on everyone spectates).
//   5. results broadcast: winnerId=A, placements A=1/B=2, A's kills=1 and
//      damageDealt >= B's hull.
//   6. The room disconnects both clients ~resultsMs later (autoDispose).
// Then kills its own server process group and verifies port 2599 is free.
//
// matchOverride is a dev tool — the real client never sets it.
// Run: node server/scripts/matchSmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from 'colyseus.js';
import { CONFIG, bearing, angleDiff } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 2599;
const endpoint = `ws://localhost:${PORT}`;
// Countdown long enough for two ring-spawned ships to close to torpedo range
// and prove damage suppression; results short so the disposal is observable.
const MATCH_OVERRIDE = { countdownMs: 45000, resultsMs: 3000 };
const TORP_RANGE = 650; // fire inside this (config range 700)
const ARC = 0.4; // rad — hold fire until the bow roughly bears

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const room = await client.joinOrCreate('arena', { name, matchOverride: MATCH_OVERRIDE });
  const ctx = {
    name, room, welcome: null, you: null, seq: 0, fireSeq: 0, fireAt: null,
    frames: 0, specFrames: 0, specWithYou: 0, specContactIds: new Set(),
    specBeforeFinish: 0, seenPeerSunk: false, peerId: null,
    boomsOnMe: 0, readyHpViolations: 0, activated: false, minHpActive: Infinity,
    sunkSeen: false, sunkBy: 'UNSET', results: null, leftCode: null,
  };
  room.onMessage('w', (m) => (ctx.welcome = m));
  room.onMessage('f', (m) => onFrame(ctx, m));
  room.onMessage('r', (m) => (ctx.results = m));
  room.onLeave((code) => (ctx.leftCode = code));
  return ctx;
}

function onFrame(ctx, f) {
  ctx.frames += 1;
  const hasPeerSunk = ctx.peerId !== null && f.events.some((e) => e.k === 'sunk' && e.id === ctx.peerId);
  const hasOwnSunk = f.events.some((e) => e.k === 'sunk' && e.id === ctx.room.sessionId);
  if (f.spec) {
    ctx.specFrames += 1;
    if (f.you) ctx.specWithYou += 1;
    for (const c of f.contacts) ctx.specContactIds.add(c.id);
    // A spec frame is legal only once the observer is dead or the match ended.
    // The boundary frame is the one reporting the deciding sink (own death /
    // the peer's) — anything earlier is an anti-cheat violation.
    const atBoundary = ctx.sunkSeen || hasOwnSunk || ctx.seenPeerSunk || hasPeerSunk;
    if (!atBoundary) ctx.specBeforeFinish += 1;
  }
  if (hasPeerSunk) ctx.seenPeerSunk = true;
  if (f.you) {
    ctx.you = f.you;
    if (!ctx.activated && f.you.hp < CONFIG.ship.hp) ctx.readyHpViolations += 1;
    if (ctx.activated) ctx.minHpActive = Math.min(ctx.minHpActive, f.you.hp);
  }
  for (const e of f.events) {
    if (e.k === 'boom' && e.hit === ctx.room.sessionId) ctx.boomsOnMe += 1;
    if (e.k === 'sunk' && e.id === ctx.room.sessionId) {
      ctx.sunkSeen = true;
      ctx.sunkBy = e.by;
    }
  }
}

/** Steer toward the peer; torpedoes away when in range/arc and armed=true. */
function control(ctx, target, armed) {
  const inp = { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, weapon: 1 };
  if (ctx.you && target) {
    const brg = bearing(ctx.you, target);
    inp.rudder = clamp(angleDiff(ctx.you.heading, brg) * 3, -1, 1);
    inp.throttle = 1;
    inp.aim = brg;
    const d = dist(ctx.you, target);
    // Click every tick while the solution holds — the tube reload paces launches.
    if (armed && d < TORP_RANGE && Math.abs(angleDiff(ctx.you.heading, brg)) < ARC) inp.fireSeq = ++ctx.fireSeq;
  }
  ctx.room.send('i', inp);
}

function phase(ctx) {
  return ctx.room.state?.matchPhase ?? 'unknown';
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

    // --- 1. waiting -> countdown + room lock --------------------------------
    const a = await joinClient('ALPHA');
    await sleep(500);
    assert(phase(a) === 'waiting', `solo join should idle in waiting (got ${phase(a)})`);
    const b = await joinClient('BRAVO');
    assert(a.room.roomId === b.room.roomId, 'A and B joined different rooms');
    a.peerId = b.room.sessionId;
    b.peerId = a.room.sessionId;
    await sleep(500);
    assert(phase(a) === 'countdown', `2nd join should start the countdown (got ${phase(a)})`);
    assert(a.room.state.countdownEndT > 0, 'countdownEndT not set');
    const c = await joinClient('CHARLIE'); // locked room -> fresh room
    assert(c.room.roomId !== a.room.roomId, 'locked room accepted a 3rd client');
    await c.room.leave();
    log.push('countdown started at 2nd join; locked room bounced CHARLIE to a fresh room');

    // --- 2. weapons-safe ready room (fire torpedoes point blank) ------------
    // Both steer at each other; A launches fish as soon as they bear.
    const readyTick = () => {
      control(a, b.you, true);
      control(b, a.you, false);
    };
    await runUntil(readyTick, () => b.boomsOnMe >= 1 || phase(a) === 'active', 60000, 'suppressed torpedo impact');
    assert(b.boomsOnMe >= 1, 'no torpedo struck B during the ready room');
    assert(b.readyHpViolations === 0, 'B lost hp while weapons were safe');
    log.push(`weapons safe: ${b.boomsOnMe} boom(s) on B, zero hp lost`);

    // --- 3. countdown end -> active ------------------------------------------
    await runUntil(readyTick, () => phase(a) === 'active', MATCH_OVERRIDE.countdownMs + 10000, 'activation');
    a.activated = true;
    b.activated = true;
    await sleep(300); // a few frames of active state
    const ring = a.welcome.mapRadius * CONFIG.map.spawnFraction;
    for (const ctx of [a, b]) {
      assert(ctx.you.hp === CONFIG.ship.hp, `${ctx.name} not at full hp after reset`);
      const r = Math.hypot(ctx.you.x, ctx.you.y);
      assert(Math.abs(r - ring) < 60, `${ctx.name} not on the spawn ring (r=${r.toFixed(0)} vs ${ring.toFixed(0)})`);
    }
    assert(a.room.state.zoneState !== 'idle', 'storm timeline not anchored at activation');
    log.push(`active: hulls redeployed to the ring (r~${ring.toFixed(0)}u), full hp, zone=${a.room.state.zoneState}`);

    // --- 4. A sinks B; B spectates unfogged; A never spec'd early ------------
    const fightTick = () => {
      if (!a.results) control(a, b.sunkSeen ? null : b.you, !b.sunkSeen);
      if (!b.sunkSeen && !b.results) control(b, a.you, false); // the dead send nothing
    };
    await runUntil(fightTick, () => b.sunkSeen, 90000, 'A sinking B');
    assert(b.sunkBy === a.room.sessionId, `B sunk by ${b.sunkBy}, expected A`);
    await runUntil(fightTick, () => b.specFrames >= 5, 5000, 'B spec frames');
    assert(b.specWithYou === 0, 'a spec frame carried `you`');
    assert(b.specContactIds.has(a.room.sessionId), 'B spec frames never showed A unfogged');
    assert(a.specBeforeFinish === 0, 'A received a spec frame before the finishing sink');
    assert(b.specBeforeFinish === 0, 'B received a spec frame before its own sink frame');
    log.push(`B sunk by A; B got ${b.specFrames} spec frames (unfogged, no you); A spec'd only after the finish`);

    // --- 5. results ----------------------------------------------------------
    await runUntil(() => {}, () => a.results !== null && b.results !== null, 5000, 'results broadcast');
    const res = a.results;
    assert(res.winnerId === a.room.sessionId, `winnerId=${res.winnerId}, expected A`);
    const rowA = res.rows.find((r) => r.id === a.room.sessionId);
    const rowB = res.rows.find((r) => r.id === b.room.sessionId);
    assert(rowA.placement === 1 && rowB.placement === 2, `placements A=${rowA.placement} B=${rowB.placement}`);
    assert(rowA.kills === 1, `A kills=${rowA.kills}`);
    assert(rowA.damageDealt >= CONFIG.ship.hp, `A damageDealt=${rowA.damageDealt} < ${CONFIG.ship.hp}`);
    assert(res.rows[0].id === rowA.id, 'rows not sorted by placement');
    log.push(`results: winner=ALPHA, rows A(1st, ${rowA.kills} kill, ${rowA.damageDealt}dmg) B(2nd)`);

    // --- 6. room disconnects after resultsMs ---------------------------------
    await runUntil(() => {}, () => a.leftCode !== null && b.leftCode !== null,
      MATCH_OVERRIDE.resultsMs + 8000, 'room disconnect after results');
    log.push(`room disconnected both clients (codes ${a.leftCode}/${b.leftCode}) after ~${MATCH_OVERRIDE.resultsMs}ms`);

    console.log('MATCH SMOKE OK:', { room: a.room.roomId, trace: log });
  } finally {
    killServer(server);
    await sleep(400);
    const open = await portOpen(PORT);
    if (open) console.error(`WARNING: port ${PORT} still open after kill`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('MATCH SMOKE FAILED:', err.message);
  process.exit(1);
});
