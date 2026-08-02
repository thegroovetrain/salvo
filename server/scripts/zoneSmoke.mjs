// Storm-circle smoke (phased timeline, Story 3.1): self-boots the colyseus
// server, joins two live @colyseus/sdk clients with a DEV zoneOverride that
// compresses the beat rhythm, and proves the phased storm end to end:
//   1. Zone starts when the 2nd ship joins (sandbox wiring). The schema walks
//      the four-beat rhythm in order — clear -> supply -> reveal -> closing —
//      and during the pre-close beats NEITHER ship takes storm damage while
//      inside the full-map ring.
//   2. REVEAL GATING (amendment 10): while zoneState is clear/supply the
//      zoneNext* schema fields are ZEROED; from the reveal beat they carry a
//      real ring that is strictly smaller than — and fully contained in — the
//      current ring. When the close completes, that revealed ring BECOMES the
//      current ring (zoneCur*) and zoneNext* zeroes again.
//   3. OUTSIDE ship (A): parks near the map boundary -> the closing ring
//      leaves it behind -> HP decays at CONFIG.zone.stormDps (~4 HP/s) ->
//      eventually SUNK with NO killer (its own `sunk` event carries
//      by=undefined, and no roster kill is credited to anyone).
//   4. INSIDE ship (B): chases the LIVE ring center read off the schema
//      (rings are OFFSET-center — the map origin is not the safe point) ->
//      stays inside the safe ring -> takes ZERO storm damage.
// Then kills the server and frees the port.
//
// zoneOverride is a dev tool — matchmaking / the real client never set it (the
// client derives its ring phases from CONFIG.zone). Run: node server/scripts/zoneSmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { CONFIG, PROTOCOL_VERSION, bearing, angleDiff, isOutside, zoneLiveState } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 2599; // never the dev server's 2567 — this smoke self-boots
const endpoint = `ws://localhost:${PORT}`;
// Compressed phased rhythm: 8s beats — reveal at 16s, first close at 24-32s,
// full closure at 96s. offsetCap 0.3 keeps the rolled rings genuinely OFFSET
// (the containment + follow-the-center assertions bite) while bounding the
// first ring's center within ~250u of the origin so B's sail-in from the
// spawn ring comfortably beats close 1. Terminal stays the production
// 2 x truesight (660u).
const ZONE_OVERRIDE = { beatMs: 8000, ringSteps: [1 / 3, 2 / 3], offsetCap: 0.3, terminalSightFactor: 2 };
/** The four in-group beats, in wire order (zoneState values). */
const BEAT_ORDER = ['clear', 'supply', 'reveal', 'closing'];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- server lifecycle --------------------------------------------------------

function bootServer() {
  const tsx = path.join(REPO, 'node_modules/.bin/tsx');
  // cwd = server/ so tsx picks up server/tsconfig.json (experimentalDecorators +
  // useDefineForClassFields:false — required for @colyseus/schema v4), exactly
  // like `npm run dev -w server`.
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
    process.kill(-proc.pid, 'SIGTERM'); // whole group
  } catch {
    // already gone
  }
}

// --- client harness ----------------------------------------------------------

async function joinClient(name) {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('arena', { name, pv: PROTOCOL_VERSION, zoneOverride: ZONE_OVERRIDE, matchOverride: { sandbox: true } });
  const ctx = {
    name, room, welcome: null, you: null, seq: 0,
    goal: { mode: 'idle' },
    minHp: Infinity, sunkBy: 'UNSET', sunkSeen: false,
    outsideSamples: [], // {t, hp} while alive AND outside the CURRENT ring
    firstOutsideLiveT: null, // first frame t strictly outside the LIVE interpolated ring
    firstDamageT: null, // first frame t with hp below full
    outsideLiveFrames: 0, // frames spent outside the live ring (B pins this at 0)
  };
  room.onMessage('w', (m) => (ctx.welcome = m));
  room.onMessage('f', (m) => onFrame(ctx, m));
  return ctx;
}

/** The schema's current ring (ring g as of the last boundary), or null pre-sync. */
function curRing(ctx) {
  const s = ctx.room.state;
  return s && typeof s.zoneCurR === 'number' && s.zoneCurR > 0
    ? { cx: s.zoneCurCx, cy: s.zoneCurCy, r: s.zoneCurR }
    : null;
}

/** The schema's revealed next ring, or null while zeroed (unrevealed). */
function nextRing(ctx) {
  const s = ctx.room.state;
  return s && typeof s.zoneNextR === 'number' && s.zoneNextR > 0
    ? { cx: s.zoneNextCx, cy: s.zoneNextCy, r: s.zoneNextR }
    : null;
}

/** The LIVE interpolated ring, derived from the schema exactly like a real
 *  client (shared zoneLiveState over the revealed prefix + zoneStartT), with
 *  THIS smoke's override as the timeline cfg. Null pre-start/pre-sync. */
function liveRing(ctx, t) {
  const s = ctx.room.state;
  const cur = curRing(ctx);
  if (!s || s.zoneState === 'idle' || !cur) return null;
  return zoneLiveState(t, s.zoneStartT, cur, nextRing(ctx), ZONE_OVERRIDE).current;
}

function onFrame(ctx, f) {
  if (f.you) {
    ctx.you = f.you;
    ctx.minHp = Math.min(ctx.minHp, f.you.hp);
    // Sample while strictly outside the CURRENT (boundary) ring: the live ring
    // is always contained in it, so these samples are unambiguously in-storm.
    const ring = curRing(ctx);
    if (f.you.alive && ring && isOutside(f.you, ring.cx, ring.cy, ring.r)) {
      ctx.outsideSamples.push({ t: f.t, hp: f.you.hp });
    }
    // LIVE-boundary bookkeeping (review FIX 6): storm damage must begin when
    // the hull crosses the INTERPOLATED ring mid-close, not only once the
    // boundary ring is promoted at the beat edge.
    const live = liveRing(ctx, f.t);
    if (live && f.you.alive && isOutside(f.you, live.cx, live.cy, live.r)) {
      if (ctx.firstOutsideLiveT === null) ctx.firstOutsideLiveT = f.t;
      ctx.outsideLiveFrames += 1;
    }
    if (ctx.firstDamageT === null && f.you.hp < CONFIG.shipClasses.torpedoBoat.hp) {
      ctx.firstDamageT = f.t;
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
  const inp = { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0 };
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

/** circle b fully inside circle a (with a float epsilon)? */
function contained(a, b) {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy) + b.r <= a.r + 1e-3;
}

async function main() {
  const server = bootServer();
  const log = [];
  const fullHp = CONFIG.shipClasses.torpedoBoat.hp; // both clients join the default class
  try {
    await waitForServer(15000);
    const a = await joinClient('ZONE-OUT'); // parks near the boundary
    const b = await joinClient('ZONE-IN'); // chases the live ring center
    assert(a.room.roomId === b.room.roomId, 'clients joined different rooms');
    await sleep(400);
    assert(a.welcome && b.welcome, 'missing welcome');

    const mapR = a.welcome.mapRadius;
    // A steers OUTWARD toward the boundary; B chases the CURRENT ring center
    // read off the schema (offset rings — the origin is not the safe point).
    const setGoals = () => {
      const len = a.you ? Math.hypot(a.you.x, a.you.y) || 1 : 1;
      a.goal = { mode: 'goto', target: a.you ? { x: (a.you.x / len) * mapR * 1.5, y: (a.you.y / len) * mapR * 1.5 } : null };
      const ring = curRing(b);
      b.goal = { mode: 'goto', target: ring ? { x: ring.cx, y: ring.cy } : { x: 0, y: 0 } };
    };

    // --- 1+2. beat rhythm + reveal gating across group 0 ---------------------
    const phasesSeen = [];
    let revealedRing = null; // the zoneNext* ring captured during reveal
    const watchZone = () => {
      const state = a.room.state?.zoneState ?? 'idle';
      if (state !== 'idle' && phasesSeen[phasesSeen.length - 1] !== state) phasesSeen.push(state);
      const next = nextRing(a);
      if ((state === 'clear' || state === 'supply') && phasesSeen.length <= 2) {
        assert(next === null, `zoneNext* populated during ${state} (unrevealed geometry leaked)`);
      }
      if (state === 'reveal' && next !== null && revealedRing === null) {
        revealedRing = next;
        const cur = curRing(a);
        assert(cur !== null, 'reveal with no current ring on the schema');
        assert(next.r < cur.r, `revealed ring not smaller (${next.r} vs ${cur.r})`);
        assert(contained(cur, next), 'revealed ring not contained in the current ring');
      }
    };
    await pilotUntil([a, b], () => { setGoals(); watchZone(); },
      () => phasesSeen.includes('closing'), 40000, 'clear->supply->reveal->closing');
    assert(
      JSON.stringify(phasesSeen.slice(0, 4)) === JSON.stringify(BEAT_ORDER),
      `beat order was [${phasesSeen.join(',')}], expected [${BEAT_ORDER.join(',')}]`,
    );
    assert(revealedRing !== null, 'the reveal beat never populated zoneNext*');
    assert(a.minHp === fullHp && b.minHp === fullHp, 'storm damage during the pre-close beats');
    log.push(`rhythm: ${phasesSeen.slice(0, 4).join(' -> ')}; reveal gated (next zeroed pre-reveal, contained after)`);

    // --- 2b. close completion: the revealed ring becomes the current ring ----
    await pilotUntil([a, b], setGoals, () => {
      const cur = curRing(a);
      return cur !== null && Math.abs(cur.r - revealedRing.r) < 1e-3;
    }, 15000, 'revealed ring becoming current after close 1');
    const cur1 = curRing(a);
    assert(Math.abs(cur1.cx - revealedRing.cx) < 1e-3 && Math.abs(cur1.cy - revealedRing.cy) < 1e-3,
      'close 1 completed onto a different center than the revealed ring');
    assert(nextRing(a) === null, 'zoneNext* not zeroed after the close completed');
    log.push(`close 1: current ring is now the revealed ring (r=${cur1.r.toFixed(0)}u, offset ${Math.hypot(cur1.cx, cur1.cy).toFixed(0)}u)`);

    // --- 3. A storm-dies outside; no killer, no kill credit ------------------
    a.outsideSamples = [];
    b.outsideSamples = [];
    await pilotUntil([a, b], setGoals, () => a.sunkSeen, 90000, 'A storm death');
    // The sunk EVENT rides the frame message; the roster (kills/deaths) rides
    // the schema patch stream (~50ms cadence). Let the patch land before the
    // roster asserts below — without this they race and flake.
    await sleep(300);

    const dps = measuredDps(a.outsideSamples);
    assert(dps !== null, 'A never logged a contiguous outside window');
    assert(Math.abs(dps - CONFIG.zone.stormDps) < 1.0, `A storm dps ${dps?.toFixed(2)} != ${CONFIG.zone.stormDps}`);
    // LIVE-boundary honesty (review FIX 6): A's damage must begin when it
    // crossed the INTERPOLATED ring (mid-close), never before it, and not
    // only after the beat-edge ring promotion. Small slop covers the 20Hz
    // frame quantization + a schema patch landing between frames.
    assert(a.firstOutsideLiveT !== null, 'A never observed itself outside the live ring');
    assert(a.firstDamageT !== null, 'A never observed storm damage');
    assert(a.firstDamageT >= a.firstOutsideLiveT - 150,
      `A damaged ${a.firstOutsideLiveT - a.firstDamageT}ms BEFORE crossing the live ring`);
    assert(a.firstDamageT - a.firstOutsideLiveT <= 1500,
      `A's damage began ${a.firstDamageT - a.firstOutsideLiveT}ms after crossing the live ring (late-start regression)`);
    log.push(`live boundary: A crossed at t=${a.firstOutsideLiveT}, first damage at t=${a.firstDamageT} (+${a.firstDamageT - a.firstOutsideLiveT}ms)`);
    assert(a.sunkBy === undefined, `A sunk attributed to ${a.sunkBy} (expected undefined)`);
    assert(roster(a.room, a.room.sessionId).deaths >= 1, 'A death not on roster');
    assert(roster(a.room, a.room.sessionId).kills === 0 && roster(b.room, b.room.sessionId).kills === 0, 'a kill was credited for a storm death');
    log.push(`outside: A decayed ${dps.toFixed(2)} HP/s, sunk by=undefined, no kill credited`);

    // --- 4. B chased the live ring center and never bled ---------------------
    assert(b.minHp === fullHp, `inside ship B lost HP (minHp=${b.minHp})`);
    assert(b.outsideSamples.length === 0, `inside ship B was outside the ring ${b.outsideSamples.length}x`);
    assert(b.outsideLiveFrames === 0, `inside ship B was outside the LIVE ring ${b.outsideLiveFrames} frame(s)`);
    const ringB = curRing(b);
    log.push(`inside: B held the ring center at full HP (cur r=${ringB.r.toFixed(0)}u, center ${Math.hypot(ringB.cx, ringB.cy).toFixed(0)}u off-origin)`);

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
