// Storm-circle smoke: self-boots the colyseus server, joins two live
// colyseus.js clients with a DEV zoneOverride that fast-forwards the timeline,
// and proves the storm end to end:
//   1. Zone starts when the 2nd ship joins (interim wiring); during grace, at
//      full radius, neither ship takes storm damage.
//   2. OUTSIDE ship (A): parks near the map boundary → the shrinking safe ring
//      passes it → HP decays at CONFIG.zone.stormDps (~4 HP/s) → eventually
//      SUNK with NO killer (its own `sunk` event carries by=undefined, and no
//      roster kill is credited to anyone).
//   3. INSIDE ship (B): sails to map center and holds → stays inside the safe
//      ring the whole time → takes ZERO storm damage.
// Then kills the server and frees the port.
//
// zoneOverride is a dev tool — matchmaking / the real client never set it (the
// client derives its ring from CONFIG.zone). Run: node server/scripts/zoneSmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from 'colyseus.js';
import { CONFIG, bearing, angleDiff, isOutside } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 2567;
const endpoint = `ws://localhost:${PORT}`;
// Fast-forward but keep the shrink gentle enough that a ship steering inward
// comfortably outruns the closing ring (dev-only override): 1s grace, 30s shrink
// to 60% of map radius (~12 u/s close rate << ship maxSpeed 25 u/s).
const ZONE_OVERRIDE = { grace: 1000, shrinkDuration: 30000, endRadiusFraction: 0.6 };

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- server lifecycle --------------------------------------------------------

function bootServer() {
  const tsx = path.join(REPO, 'node_modules/.bin/tsx');
  // cwd = server/ so tsx picks up server/tsconfig.json (experimentalDecorators +
  // useDefineForClassFields:false — required for @colyseus/schema v3), exactly
  // like `npm run dev -w server`.
  const proc = spawn(tsx, ['src/index.ts'], {
    cwd: path.join(REPO, 'server'),
    detached: true, // own process group, so we can kill tsx + its node child
    env: { ...process.env, NODE_ENV: 'development', PORT: String(PORT) },
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
    process.kill(-proc.pid, 'SIGTERM'); // whole group
  } catch {
    // already gone
  }
}

// --- client harness ----------------------------------------------------------

async function joinClient(name) {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('arena', { name, zoneOverride: ZONE_OVERRIDE });
  const ctx = {
    name, room, welcome: null, you: null, seq: 0,
    goal: { mode: 'idle' },
    minHp: Infinity, sunkBy: 'UNSET', sunkSeen: false,
    outsideSamples: [], // {t, hp} while alive AND outside the safe ring
  };
  room.onMessage('w', (m) => (ctx.welcome = m));
  room.onMessage('f', (m) => onFrame(ctx, m));
  return ctx;
}

function safeRadius(ctx) {
  const r = ctx.room.state?.zoneRadius;
  return typeof r === 'number' && r > 0 ? r : Infinity;
}

function onFrame(ctx, f) {
  if (f.you) {
    ctx.you = f.you;
    ctx.minHp = Math.min(ctx.minHp, f.you.hp);
    if (f.you.alive && isOutside(f.you, safeRadius(ctx))) {
      ctx.outsideSamples.push({ t: f.t, hp: f.you.hp });
    }
  }
  for (const e of f.events) {
    if (e.k === 'sunk' && e.id === ctx.room.sessionId) {
      ctx.sunkSeen = true;
      ctx.sunkBy = e.by; // undefined for a storm kill
    }
  }
}

function control(ctx) {
  const inp = { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fire: false, weapon: 0 };
  const g = ctx.goal;
  if (g.mode === 'goto') steerToward(ctx, inp, g.target, 1);
  ctx.room.send('i', inp);
}

function steerToward(ctx, inp, target, throttle) {
  if (!ctx.you || !target) return;
  const want = bearing(ctx.you, target);
  inp.rudder = clamp(angleDiff(ctx.you.heading, want) * 3, -1, 1);
  inp.throttle = throttle;
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

/** Average storm dps across a client's contiguous outside-window samples. */
function measuredDps(samples) {
  if (samples.length < 10) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const secs = (last.t - first.t) / 1000;
  if (secs <= 0) return null;
  return (first.hp - last.hp) / secs;
}

async function main() {
  const server = bootServer();
  const log = [];
  try {
    await waitForServer(15000);
    const a = await joinClient('ZONE-OUT'); // parks near the boundary
    const b = await joinClient('ZONE-IN'); // sails to center
    assert(a.room.roomId === b.room.roomId, 'clients joined different rooms');
    await sleep(400);
    assert(a.welcome && b.welcome, 'missing welcome');

    const mapR = a.welcome.mapRadius;
    // A steers OUTWARD toward the boundary; B sails to map center. Set from the
    // start so B is already fleeing inward when the ring begins to close.
    const setGoals = () => {
      const len = a.you ? Math.hypot(a.you.x, a.you.y) || 1 : 1;
      a.goal = { mode: 'goto', target: a.you ? { x: (a.you.x / len) * mapR * 1.5, y: (a.you.y / len) * mapR * 1.5 } : null };
      b.goal = { mode: 'goto', target: { x: 0, y: 0 } };
    };

    // Grace check: at full radius nobody takes storm damage (zone just started).
    await pilotUntil([a, b], setGoals, () => a.room.state?.zoneState === 'shrinking', 8000, 'grace->shrink');
    assert(a.minHp === CONFIG.ship.hp && b.minHp === CONFIG.ship.hp, 'storm damage during grace');
    log.push(`grace: both full HP until shrink began (state=${a.room.state.zoneState})`);

    // Reset outside-sample windows now that the ring is closing; run until A sinks.
    a.outsideSamples = [];
    b.outsideSamples = [];
    await pilotUntil([a, b], setGoals, () => a.sunkSeen, 90000, 'A storm death');

    // A: decayed at ~stormDps and sank with no killer; nobody scored a kill.
    const dps = measuredDps(a.outsideSamples);
    assert(dps !== null, 'A never logged a contiguous outside window');
    assert(Math.abs(dps - CONFIG.zone.stormDps) < 1.0, `A storm dps ${dps?.toFixed(2)} != ${CONFIG.zone.stormDps}`);
    assert(a.sunkBy === undefined, `A sunk attributed to ${a.sunkBy} (expected undefined)`);
    assert(roster(a.room, a.room.sessionId).deaths >= 1, 'A death not on roster');
    assert(roster(a.room, a.room.sessionId).kills === 0 && roster(b.room, b.room.sessionId).kills === 0, 'a kill was credited for a storm death');
    log.push(`outside: A decayed ${dps.toFixed(2)} HP/s, sunk by=undefined, no kill credited`);

    // B: stayed inside the whole time → zero storm damage.
    assert(b.minHp === CONFIG.ship.hp, `inside ship B lost HP (minHp=${b.minHp})`);
    assert(b.outsideSamples.length === 0, `inside ship B was outside the ring ${b.outsideSamples.length}x`);
    log.push(`inside: B held center at full HP (radius end=${(mapR * ZONE_OVERRIDE.endRadiusFraction).toFixed(0)}u)`);

    console.log('ZONE SMOKE OK:', { room: a.room.roomId, seed: a.welcome.mapSeed, trace: log });
    await a.room.leave();
    await b.room.leave();
  } finally {
    killServer(server);
    await sleep(300);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('ZONE SMOKE FAILED:', err.message);
  process.exit(1);
});
