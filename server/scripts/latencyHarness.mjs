// Latency harness (story 1.5, NFR3 acceptance): self-boots the colyseus server
// on a scratch port, joins two scripted @colyseus/sdk clients through a
// SEEDED latency/jitter/loss shim at the SDK boundary (~150ms RTT by default),
// and runs the SAME deterministic gunnery scenario twice in one invocation:
//
//   [A] honest fireT — the shooter stamps every click with its server-clock
//       estimate (client/src/net/clock.ts-style rolling-min), so the server's
//       D1 clamp back-dates the shell by ~min(claimed, RTT+30, 150)ms.
//   [B] fireT: 0     — the explicit no-claim sentinel on every input: zero
//       compensation (the pre-D1 world).
//
// Per pass it reports: shots, predicted hits (click point within burstRadius
// of the target's client-rendered hull at click time — by construction every
// shot, since the shooter clicks ON the rendered hull), registered hits (the
// TARGET client receives a victim-private `dmg` event within shell flight time
// + 500ms slack of the click), hit-registration agreement % (registered /
// predicted), and prediction-error bounds (mean/p95/max own-hull predicted-vs-
// replayed position error on the SHOOTER, the predictionSmoke.mjs technique).
// Thresholds printed at the end are ADVISORY and PROPOSED — Eric owns gate
// numbers. Exit is 0 unless a STRUCTURAL failure occurs (server didn't boot,
// client disconnected, zero shots, timeout).
//
// Scenario (deterministic water): map pinned via the HC_DEV_OPTIONS-gated
// mapSeed room option. The shooter sails to the map center and stops; the
// target orbits the shooter's anchor at ORBIT_RADIUS_U on ~constant speed.
// The shooter fires only near beam-on (constant muzzle offset — the gun's
// shell spawns at the hull-silhouette edge along the aim bearing, so gating
// the relative bearing keeps per-shot flight distance nearly identical) at
// ~constant range: every shot is the same physics problem, and the only
// variable between pass A and pass B is the D1 back-dating. The gun bursts at
// the CLICKED point, so a hit requires the target hull to still be within
// burstRadius of the click when the shell lands — exactly the staleness the
// compensation is meant to pay back.
//
// Operator script: real time (performance.now) is fine here, but ALL latency-
// model randomness rides a seeded mulberry32 (no Math.random), so both passes
// see the identical delay/drop pattern.
//
// Run: node server/scripts/latencyHarness.mjs [--rtt 150] [--jitter 30]
//      [--loss 2] [--shots 20]
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import {
  CONFIG,
  PROTOCOL_VERSION,
  angleDiff,
  bearing,
  generateMap,
  hullSilhouette,
  mulberry32,
  resolveShipPose,
  stepShip,
} from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Scratch port: never the dev server's 2567/5173 or zoneSmoke's 2599.
const PORT = 2601;
const endpoint = `ws://localhost:${PORT}`;

// MAP SEED CHOICE: scanned seeds 1..300 with generateMap(seed, 6) for the map
// whose nearest island EDGE is farthest from the center — seed 140 keeps every
// island edge >= 540u from the origin (4 islands, all in the outer band), so
// the whole engagement bubble (shooter anchored at center, target orbiting at
// ORBIT_RADIUS_U ~180u, sight lines <= ~220u) is guaranteed open water with
// island-free LOS, and both sail-in routes from the 720u spawn ring are clear.
const MAP_SEED = 140;

// Storm neutered exactly like combatSmoke (sandbox rooms start the zone on the
// 2nd join): a 10-minute grace outlasts the whole choreography.
const SANDBOX_ZONE = { grace: 600000, shrinkDuration: 180000, endRadiusFraction: 0.15 };

// Fixed shim RNG seeds (per client), re-seeded identically for each pass so A
// and B experience the same delay/drop sequence.
const SHOOTER_SHIM_SEED = 0xa11ce;
const TARGET_SHIM_SEED = 0xb0b1e;

// Scenario tunables. torpedoBoat vs torpedoBoat: the fast, slender target is
// the discriminating case — at 0.8 throttle (~40 u/s) the hull moves roughly
// its own half-length + burstRadius during (staleness + flight), so the ~135ms
// of latency D1 pays back is the difference between a burst that still clips
// the hull and one that lands astern of it.
const SHOOTER_CLS = 'torpedoBoat';
const TARGET_CLS = 'torpedoBoat';
// Empirically centered (tuning runs at rtt=150/jitter=30/loss=2): shots fire
// at ~177-182u. Measured hit-band edges at this profile: the honest pass stops
// clipping the hull at ~186u, the uncompensated pass at ~177u — so this range
// window sits inside the honest pass's band with margin while straddling the
// uncompensated pass's edge. NOTE the measured A/B band separation (~9u ≈
// ~70ms of target travel) is SMALLER than the naive rtt-sized expectation:
// with a client streaming inputs at the 50ms cadence, the D1 clamp's
// "never earlier than the previous input" floor bounds back-dating near one
// input interval — an intended property of the ratified law, measured here.
const ORBIT_RADIUS_U = 177; // u — target orbit radius around the shooter anchor
const ORBIT_THROTTLE = 0.8; // ~40 u/s on a torpedoBoat
const FIRE_MIN_RANGE_U = 60;
const FIRE_MAX_RANGE_U = 182; // blocks long shots during the target's spiral-in
const BEAM_SIN_MIN = 0.75; // fire only near beam-on (near-constant muzzle offset)
const CONTACT_FRESH_MS = 300; // newest contact sample must be this recent
const HIT_SLACK_MS = 500; // registration window = flight time + this
const CLICK_GUARD_MS = 500; // own-ammo frame view lags ~RTT; don't double-click

const DT_MS = CONFIG.tick.simDtMs;
const HALF_PI = Math.PI / 2;

class StructuralError extends Error {}

function assert(cond, msg) {
  if (!cond) throw new StructuralError(msg);
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { rttMs: 150, jitterMs: 30, lossPct: 2, shots: 20 };
  const map = { '--rtt': 'rttMs', '--jitter': 'jitterMs', '--loss': 'lossPct', '--shots': 'shots' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = map[argv[i]];
    const val = Number(argv[i + 1]);
    if (!key || !Number.isFinite(val) || val < 0) {
      throw new StructuralError(`bad argument: ${argv[i]} ${argv[i + 1]} (usage: --rtt N --jitter N --loss N --shots N)`);
    }
    opts[key] = val;
  }
  assert(opts.shots >= 1, '--shots must be >= 1');
  assert(opts.lossPct <= 100, '--loss is a percentage (0..100)');
  return opts;
}

// --- server lifecycle (zoneSmoke pattern) ------------------------------------

function bootServer() {
  const tsx = path.join(REPO, 'node_modules/.bin/tsx');
  // cwd = server/ so tsx picks up server/tsconfig.json (schema decorators).
  return spawn(tsx, ['src/index.ts'], {
    cwd: path.join(REPO, 'server'),
    detached: true, // own process group: we kill tsx + its node child, nothing else
    env: { ...process.env, NODE_ENV: 'development', PORT: String(PORT), HC_DEV_OPTIONS: '1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
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
  throw new StructuralError('server did not open the port in time');
}

function killServer(proc) {
  try {
    process.kill(-proc.pid, 'SIGTERM'); // ONLY the group we spawned
  } catch {
    // already gone
  }
}

// --- latency shim at the SDK boundary ----------------------------------------
// Every message in BOTH directions is delayed by oneWay = rtt/2 ± jitter/2
// drawn from a seeded PRNG; a drop probability applies ONLY to the coalescable
// channels 'i' (input) and 'f' (frame) — latest-wins / interpolation recover
// by design. 'w'/'p'/'r'/'u' are never dropped. ORDERING GUARANTEE: per
// channel, each delivery time is chained off the previous one
// (at = max(now + oneWay, lastDeliveryAt)), and Node fires timers in due-time
// order, so a later message can never overtake an earlier one on its channel.
// Ping echoes ('p') ride the same inbound delay + outbound delay — that is
// what makes the server's app-level RTT measurement honestly see ~rtt.

const DROPPABLE = new Set(['i', 'f']);

function makeShim(room, opts, rng) {
  const outNext = new Map();
  const inNext = new Map();
  const oneWay = () => opts.rttMs / 2 + rng.float(-opts.jitterMs / 2, opts.jitterMs / 2);
  const schedule = (nextMap, channel, fn) => {
    const now = performance.now();
    const at = Math.max(now + Math.max(oneWay(), 0), nextMap.get(channel) ?? 0);
    nextMap.set(channel, at);
    setTimeout(fn, at - now);
  };
  return {
    send(channel, msg) {
      if (DROPPABLE.has(channel) && rng.next() < opts.lossPct / 100) return;
      schedule(outNext, channel, () => {
        try {
          room.send(channel, msg);
        } catch {
          // room already closed during teardown — nothing to deliver to
        }
      });
    },
    on(channel, handler) {
      room.onMessage(channel, (msg) => {
        if (DROPPABLE.has(channel) && rng.next() < opts.lossPct / 100) return;
        schedule(inNext, channel, () => handler(msg));
      });
    },
  };
}

// --- server-clock estimate ---------------------------------------------------
// ROLLING-MIN offset estimator, mirroring client/src/net/clock.ts: each sample
// offset = clientReceiveTime - serverT can only OVERSHOOT the true skew
// (transit is strictly additive noise), so the windowed minimum is the honest
// estimate and jitter spikes can never drag it. A plain EWMA would absorb
// every spike into the fire-time claim — rejected for the honest run (per the
// story ruling); the slew/snap smoothing of the real client is presentation
// polish the harness doesn't need.

const CLOCK_WINDOW_MS = 5000;

function makeClock() {
  const samples = []; // {at, offset}
  let last = -Infinity;
  return {
    addSample(serverT, at = performance.now()) {
      samples.push({ at, offset: at - serverT });
      while (samples.length > 1 && samples[0].at < at - CLOCK_WINDOW_MS) samples.shift();
    },
    ready() {
      return samples.length > 0;
    },
    serverNow(at = performance.now()) {
      if (samples.length === 0) return 0;
      let min = Infinity;
      for (const s of samples) min = Math.min(min, s.offset);
      const t = at - min;
      if (t < last) return last;
      last = t;
      return t;
    },
  };
}

// --- own-ship predictor (predictionSmoke technique) --------------------------
// Mirrors client/src/sim/prediction.ts: step the shared stepShip once per SENT
// input; on every frame drop acked inputs, replay the pending ones from the
// authoritative `you`, and sample the position error between the replayed
// state and the live local prediction at the same seq (= the real client's
// per-reconcile correction). Collision resolve uses the SAME shared
// resolveShipPose the client predictor runs, so grazing an island on the
// sail-in doesn't fake divergence.

function makePredictor(map, cls) {
  return {
    kin: CONFIG.shipClasses[cls].kinematics,
    poly: hullSilhouette(cls),
    map,
    dt: DT_MS / 1000,
    pending: [],
    curr: null,
    scratch: [],
    samples: [],
  };
}

function predictorStep(p, s, inp) {
  const prev = { x: s.x, y: s.y, heading: s.heading };
  stepShip(s, inp, p.kin, p.dt);
  const { contact } = resolveShipPose(prev, s, p.map.islands, p.map.radius, p.poly, p.scratch);
  if (contact) s.speed *= CONFIG.ship.islandSpeedMult;
}

function predictorLocalTick(p, inp) {
  if (!p.curr) return;
  p.pending.push({ seq: inp.seq, throttle: inp.throttle, rudder: inp.rudder });
  if (p.pending.length > 64) p.pending.shift();
  predictorStep(p, p.curr, inp);
}

function predictorReconcile(p, you, ackSeq) {
  while (p.pending.length > 0 && p.pending[0].seq <= ackSeq) p.pending.shift();
  const replayed = { x: you.x, y: you.y, heading: you.heading, speed: you.speed };
  for (const q of p.pending) predictorStep(p, replayed, { throttle: q.throttle, rudder: q.rudder });
  // Sample only while the hull is under way: the anchored shooter predicts a
  // motionless ship exactly (error pinned at 0), and those samples would flood
  // the percentile into meaninglessness. predictionSmoke's script is always
  // moving; this keeps the measured bounds comparable to it.
  if (p.curr && Math.abs(you.speed) > 0.5) {
    p.samples.push(Math.hypot(replayed.x - p.curr.x, replayed.y - p.curr.y));
  }
  p.curr = replayed;
}

// --- clients -----------------------------------------------------------------

async function joinClient(name, cls, opts, shimSeed, honest) {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('arena', {
    name,
    cls,
    pv: PROTOCOL_VERSION,
    mapSeed: MAP_SEED,
    matchOverride: { sandbox: true },
    zoneOverride: SANDBOX_ZONE,
  });
  const ctx = {
    name,
    room,
    shim: makeShim(room, opts, mulberry32(shimSeed)),
    honest,
    welcome: null,
    you: null,
    clock: makeClock(),
    left: false,
    seq: 0,
    fireSeq: 0,
    aim: 0,
    aimDist: 0,
    lastClickT: 0, // ms server-clock estimate at the most recent click (fireT)
    lastClickWall: -Infinity,
    pred: null, // shooter only
    track: null, // shooter only: interp samples of the target contact
    trackId: '',
    dmgWalls: [], // target only: wall-clock arrival of own victim-private dmg
    anchor: null, // shooter only: settled engagement anchor
  };
  ctx.shim.on('w', (m) => {
    ctx.welcome = m;
    ctx.clock.addSample(m.t);
  });
  ctx.shim.on('f', (m) => onFrame(ctx, m));
  // Echo pings immediately on (delayed) receipt, back through the outbound
  // delay — the server's windowed-min RTT then honestly measures ~rtt.
  ctx.shim.on('p', (m) => ctx.shim.send('p', { n: m.n }));
  ctx.shim.on('r', () => {});
  room.onLeave(() => {
    ctx.left = true;
  });
  return ctx;
}

function onFrame(ctx, f) {
  ctx.clock.addSample(f.t);
  if (f.you) ctx.you = f.you;
  if (ctx.pred && f.you && f.you.alive) predictorReconcile(ctx.pred, f.you, f.ackSeq);
  if (ctx.track) {
    const c = f.contacts.find((k) => k.id === ctx.trackId);
    if (c) {
      ctx.track.samples.push({ t: f.t, x: c.x, y: c.y });
      if (ctx.track.samples.length > 2) ctx.track.samples.shift();
      ctx.track.lastWall = performance.now();
    }
  }
  for (const e of f.events) {
    if (e.k === 'dmg' && e.id === ctx.room.sessionId) ctx.dmgWalls.push(performance.now());
  }
}

/**
 * The shooter's client-side view of the target: linear interpolation over the
 * last two contact samples at renderT = serverNow() - interpDelay, clamped to
 * the sample span — a deliberate simplification of the real renderer's
 * snapshot buffer (accepted per the story ruling; with a 100ms interp delay
 * over 50ms frames, renderT almost always falls between the last two samples).
 */
function renderedTarget(track, renderT) {
  const n = track.samples.length;
  if (n === 0) return null;
  const s1 = track.samples[n - 1];
  const s0 = n > 1 ? track.samples[n - 2] : s1;
  if (s1.t <= s0.t) return { x: s1.x, y: s1.y };
  const a = clamp((renderT - s0.t) / (s1.t - s0.t), 0, 1);
  return { x: s0.x + (s1.x - s0.x) * a, y: s0.y + (s1.y - s0.y) * a };
}

// --- piloting ----------------------------------------------------------------

function steerToward(you, target, throttle, inp) {
  inp.rudder = clamp(angleDiff(you.heading, bearing(you, target)) * 3, -1, 1);
  inp.throttle = throttle;
}

/** CCW orbit around C at radius R: hold the tangent bearing with a radial
 *  correction term; from far outside it degenerates into a ~46° inward spiral. */
function orbitControl(you, C, R, inp) {
  const rx = you.x - C.x;
  const ry = you.y - C.y;
  const rr = Math.hypot(rx, ry) || 1;
  const want = Math.atan2(ry, rx) + HALF_PI + clamp((rr - R) * 0.03, -0.8, 0.8);
  inp.rudder = clamp(angleDiff(you.heading, want) * 3, -1, 1);
  // Full throttle while far outside the ring (initial approach + post-respawn
  // return from the 720u spawn ring) — identical in both passes, and shots are
  // range-gated, so this only trims dead time, never the firing geometry.
  inp.throttle = rr > R + 80 ? 1 : ORBIT_THROTTLE;
}

/** Shooter station-keeping: sail to the center, brake, settle. Returns true
 *  once anchored (speed ~0 near the center) — the engagement may begin. */
function shooterPilot(ctx, inp) {
  const you = ctx.you;
  if (!you || !you.alive) return false;
  if (ctx.anchor) return true; // stay stopped (throttle/rudder already 0)
  const d = Math.hypot(you.x, you.y);
  if (d > 15) {
    steerToward(you, { x: 0, y: 0 }, clamp(d / 150, 0.15, 1), inp);
    return false;
  }
  if (Math.abs(you.speed) < 1) {
    ctx.anchor = { x: you.x, y: you.y };
    return true;
  }
  return false; // coasting to a stop over the center
}

// --- the shot protocol (client-honest: shooter's own frames only) ------------

function maybeFire(shooter, pass, now) {
  const own = shooter.pred.curr ?? shooter.you;
  const ammo = shooter.you?.ammo?.[0];
  if (!own || !ammo || ammo.n < 1) return;
  if (now - shooter.lastClickWall < Math.max(CONFIG.gun.reloadMs * 0.15, CLICK_GUARD_MS)) return;
  if (!shooter.track || now - shooter.track.lastWall > CONTACT_FRESH_MS) return;
  const renderT = shooter.clock.serverNow() - CONFIG.tick.interpDelayMs;
  const p = renderedTarget(shooter.track, renderT);
  if (!p) return;
  const dx = p.x - own.x;
  const dy = p.y - own.y;
  const range = Math.hypot(dx, dy);
  if (range < FIRE_MIN_RANGE_U || range > FIRE_MAX_RANGE_U) return;
  const relSin = Math.sin(Math.atan2(dy, dx) - own.heading);
  if (Math.abs(relSin) < BEAM_SIN_MIN) return;

  // Click the target's RENDERED position: aim/aimDist describe that point,
  // fireSeq requests the shot, fireT (pass A only) claims the click instant on
  // the server-clock estimate. PREDICTED HIT: the click point is ON the
  // rendered hull center, trivially within burstRadius — asserted literally.
  shooter.fireSeq += 1;
  shooter.aim = Math.atan2(dy, dx);
  shooter.aimDist = range;
  shooter.lastClickT = shooter.clock.serverNow();
  shooter.lastClickWall = now;
  const predicted = dist2(p, p) <= CONFIG.gun.burstRadius; // click point == rendered hull pos
  pass.shots.push({
    wall: now,
    deadline: now + (range / CONFIG.gun.shellSpeed) * 1000 + HIT_SLACK_MS,
    range,
    relSin,
    predicted,
    registered: false,
    reported: false,
  });
}

/** Match freshly arrived victim-side dmg events to the earliest open shot
 *  window (windows never overlap: flight+slack < the 3s gun reload). */
function correlate(pass, target) {
  for (const wall of target.dmgWalls) {
    const shot = pass.shots.find((s) => !s.registered && wall >= s.wall && wall <= s.deadline);
    if (shot) shot.registered = true;
  }
  target.dmgWalls.length = 0;
}

function reportSettledShots(pass, label, now) {
  for (const s of pass.shots) {
    if (s.reported || (!s.registered && now <= s.deadline)) continue;
    s.reported = true;
    const n = pass.shots.indexOf(s) + 1;
    const verdict = s.registered ? 'HIT' : 'MISS';
    console.log(`[${label}] shot ${n}/${pass.budget}: range=${s.range.toFixed(0)}u relSin=${s.relSin.toFixed(2)} -> ${verdict}`);
  }
}

// --- one pass ----------------------------------------------------------------

function buildInput(ctx) {
  return {
    seq: ++ctx.seq,
    throttle: 0,
    rudder: 0,
    aim: ctx.aim,
    fireSeq: ctx.fireSeq,
    aimDist: ctx.aimDist,
    slot: 0,
    // Honest pass: the server-clock estimate captured at the most recent
    // click (re-sent every tick, like the real input sampler). B pass: the
    // explicit no-claim sentinel on every single input.
    fireT: ctx.honest ? ctx.lastClickT : 0,
  };
}

async function waitForWelcomes(shooter, target) {
  const start = Date.now();
  while (!shooter.welcome || !target.welcome) {
    assert(Date.now() - start < 10000, 'welcome did not arrive (shim) in time');
    await sleep(50);
  }
}

function passTick(shooter, target, pass, now) {
  const shooterInp = buildInput(shooter);
  const targetInp = buildInput(target);
  const anchored = shooterPilot(shooter, shooterInp);
  if (target.you?.alive) orbitControl(target.you, shooter.anchor ?? { x: 0, y: 0 }, ORBIT_RADIUS_U, targetInp);
  if (anchored && pass.shots.length < pass.budget) maybeFire(shooter, pass, now);
  // fireSeq/aim/fireT ride EVERY input (cumulative-counter model), so a
  // dropped input never loses a click — the next one re-carries it.
  shooterInp.fireSeq = shooter.fireSeq;
  shooterInp.aim = shooter.aim;
  shooterInp.aimDist = shooter.aimDist;
  shooterInp.fireT = shooter.honest ? shooter.lastClickT : 0;
  shooter.shim.send('i', shooterInp);
  target.shim.send('i', targetInp);
  predictorLocalTick(shooter.pred, shooterInp);
  correlate(pass, target);
}

function passDone(pass, now) {
  if (pass.shots.length < pass.budget) return false;
  return now > Math.max(...pass.shots.map((s) => s.deadline)) + 1000;
}

async function runPass(label, honest, opts) {
  const shooter = await joinClient(`LAT-${label}-SHOOTER`, SHOOTER_CLS, opts, SHOOTER_SHIM_SEED, honest);
  const target = await joinClient(`LAT-${label}-TARGET`, TARGET_CLS, opts, TARGET_SHIM_SEED, honest);
  assert(shooter.room.roomId === target.room.roomId, 'clients joined different rooms');
  await waitForWelcomes(shooter, target);
  assert(shooter.welcome.mapSeed === MAP_SEED, `mapSeed not pinned (got ${shooter.welcome.mapSeed}) — is HC_DEV_OPTIONS reaching the server?`);
  const map = generateMap(shooter.welcome.mapSeed, shooter.welcome.playerCap);
  shooter.pred = makePredictor(map, SHOOTER_CLS);
  shooter.track = { samples: [], lastWall: -Infinity };
  shooter.trackId = target.room.sessionId;

  const pass = { budget: opts.shots, shots: [] };
  const timeoutMs = 90000 + opts.shots * 20000;
  const start = performance.now();
  let lastProgress = start;
  for (;;) {
    const now = performance.now();
    assert(!shooter.left && !target.left, 'a client disconnected mid-pass');
    assert(now - start < timeoutMs, `pass ${label} timed out (${pass.shots.length}/${opts.shots} shots in ${Math.round(timeoutMs / 1000)}s)`);
    passTick(shooter, target, pass, now);
    reportSettledShots(pass, label, now);
    if (passDone(pass, now)) break;
    if (now - lastProgress > 15000) {
      lastProgress = now;
      const reg = pass.shots.filter((s) => s.registered).length;
      console.log(`[${label}] t=${Math.round((now - start) / 1000)}s shots=${pass.shots.length}/${opts.shots} registered=${reg} targetAlive=${target.you?.alive}`);
    }
    await sleep(DT_MS);
  }
  assert(pass.shots.length > 0, `pass ${label} fired zero shots`);

  const metrics = summarize(pass, shooter.pred.samples);
  await shooter.room.leave();
  await target.room.leave();
  return metrics;
}

// --- metrics -----------------------------------------------------------------

function summarize(pass, errSamples) {
  const predicted = pass.shots.filter((s) => s.predicted).length;
  const registered = pass.shots.filter((s) => s.registered).length;
  const sorted = [...errSamples].sort((a, b) => a - b);
  const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
  const p95 = sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] : 0;
  const max = sorted.length ? sorted[sorted.length - 1] : 0;
  return {
    shots: pass.shots.length,
    predicted,
    registered,
    agreement: predicted > 0 ? (registered / predicted) * 100 : 0,
    err: { mean, p95, max, n: sorted.length },
  };
}

function reportLine(tag, m) {
  const agree = `${m.agreement.toFixed(1)}% (${m.registered}/${m.predicted})`;
  const err = `${m.err.mean.toFixed(2)}/${m.err.p95.toFixed(2)}/${m.err.max.toFixed(2)} u`;
  return `${tag} agreement: ${agree} | prediction error mean/p95/max: ${err}`;
}

function printReport(opts, a, b) {
  console.log('');
  console.log('LATENCY HARNESS REPORT');
  console.log(`profile: rtt=${opts.rttMs}ms jitter=${opts.jitterMs}ms loss=${opts.lossPct}% shots=${opts.shots} seed=${MAP_SEED}`);
  console.log(reportLine('[A honest fireT]', a));
  console.log(reportLine('[B fireT=0]     ', b));
  const gate1 = a.agreement >= 90 ? 'PASS' : 'MISS';
  const gate2 = a.agreement > b.agreement ? 'PASS' : 'MISS';
  console.log(`ADVISORY (PROPOSED, not ratified — Eric owns gate numbers): agreement(A) >= 90%: ${gate1}; agreement(A) > agreement(B): ${gate2}`);
}

// --- main --------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const server = bootServer();
  const cleanup = () => killServer(server);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });
  try {
    await waitForServer(15000);
    console.log(`latency harness: rtt=${opts.rttMs}ms jitter=${opts.jitterMs}ms loss=${opts.lossPct}% shots=${opts.shots} mapSeed=${MAP_SEED} port=${PORT}`);
    const a = await runPass('A', true, opts);
    // Let the empty room dispose (autoDispose) so pass B joinOrCreate builds a
    // FRESH room from the same pinned seed instead of reusing pass A's world.
    await sleep(1500);
    const b = await runPass('B', false, opts);
    printReport(opts, a, b);
  } finally {
    cleanup();
    await sleep(300);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('LATENCY HARNESS FAILED (structural):', err.message);
  process.exit(1);
});
