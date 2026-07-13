// Prediction smoke: proves client-side prediction would converge against the
// live server, headlessly (no browser). Two colyseus.js clients join; client A
// sends a scripted input sequence (one per 50ms, like the client's
// inputSampler) for ~3s. Then, from A's frame stream, we measure:
//
//  1. LOCKSTEP DIVERGENCE — replay each server tick with the input the server
//     says it applied (frame.ackSeq -> script[seq]) through the SHARED
//     stepShip at the same fixed dt, starting from the first `you`. This is
//     exactly what the client's reconcile replay does, so max divergence here
//     is the prediction reconciliation error floor.
//  2. PREDICTION DIVERGENCE — emulate the real client: step a local state
//     once per SENT input (client timing), and on every frame compare the
//     server-you + pending-replay against the local prediction at the same
//     seq. This includes real network jitter (two inputs landing in one
//     server tick, etc.) — the error visualError must absorb.
//
// Also asserts B's contacts track A's ship — since fog (step 9) landed this
// sub-check only sees frames where A is inside B's sight range (fogSmoke.mjs
// owns visibility verification). Requires a running server
// (tsx server/src/index.ts) and shared/dist built:
//   node server/scripts/predictionSmoke.mjs

import { Client } from 'colyseus.js';
import { CONFIG, stepShip } from '@salvo/shared';

const endpoint = process.env.WS_URL || 'ws://localhost:2567';
const DT = CONFIG.tick.simDtMs / 1000;
const SCRIPT_TICKS = 60; // ~3s at 50ms cadence
const SETTLE_MS = 600;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function step(state, inp) {
  stepShip(state, inp, CONFIG.ship, DT);
  return state;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

async function joinClient(name) {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('arena', { name });
  const ctx = { name, room, welcome: null, frames: [] };
  room.onMessage('w', (msg) => (ctx.welcome = msg));
  room.onMessage('f', (msg) => ctx.frames.push(msg));
  return ctx;
}

/** Scripted input for seq n: full ahead, rudder square wave. Seq 0 = neutral. */
function scriptInput(seq) {
  if (seq === 0) return { seq: 0, throttle: 0, rudder: 0, aim: 0, fire: false, weapon: 0 };
  const rudder = seq % 30 < 15 ? 0.7 : -0.7;
  return { seq, throttle: 1, rudder, aim: 0, fire: false, weapon: 0 };
}

function sendScript(ctx) {
  return new Promise((resolve) => {
    let seq = 0;
    const timer = setInterval(() => {
      seq += 1;
      ctx.room.send('i', scriptInput(seq));
      if (seq >= SCRIPT_TICKS) {
        clearInterval(timer);
        resolve(seq);
      }
    }, CONFIG.tick.simDtMs);
  });
}

/** Metric 1: replay each server tick with the ack'd script input. */
function lockstepDivergence(frames) {
  const withYou = frames.filter((f) => f.you);
  assert(withYou.length > 40, `too few frames with you: ${withYou.length}`);
  const sim = { ...pick(withYou[0].you) };
  let max = 0;
  let prevTick = withYou[0].tick;
  for (let i = 1; i < withYou.length; i++) {
    const f = withYou[i];
    const steps = f.tick - prevTick;
    prevTick = f.tick;
    for (let s = 0; s < steps; s++) step(sim, scriptInput(f.ackSeq));
    max = Math.max(max, dist(sim, f.you));
    // Re-anchor each frame (like reconcile does) so errors don't compound.
    Object.assign(sim, pick(f.you));
  }
  return max;
}

/** Metric 2: client-style prediction — local step per sent input, replay on frame. */
function predictionDivergence(frames) {
  const withYou = frames.filter((f) => f.you);
  const base = withYou[0];
  // Local prediction states indexed by seq: state after locally applying seq.
  const local = new Map([[base.ackSeq, pick(base.you)]]);
  let cur = { ...pick(base.you) };
  for (let seq = base.ackSeq + 1; seq <= SCRIPT_TICKS; seq++) {
    cur = step({ ...cur }, scriptInput(seq));
    local.set(seq, { ...cur });
  }
  let max = 0;
  let maxCorrection = 0; // per-reconcile visualError injection (consecutive replays)
  let prevReplay = null;
  for (const f of withYou) {
    if (f.ackSeq === 0 || f.ackSeq > SCRIPT_TICKS) continue;
    const replay = { ...pick(f.you) };
    for (let seq = f.ackSeq + 1; seq <= SCRIPT_TICKS; seq++) step(replay, scriptInput(seq));
    max = Math.max(max, dist(replay, local.get(SCRIPT_TICKS)));
    if (prevReplay) maxCorrection = Math.max(maxCorrection, dist(replay, prevReplay));
    prevReplay = replay;
  }
  return { max, maxCorrection };
}

function pick(you) {
  return { x: you.x, y: you.y, heading: you.heading, speed: you.speed };
}

/** B's contacts must track A's authoritative positions at matching ticks. */
function contactTracking(aFrames, bFrames, aId) {
  const aByTick = new Map(aFrames.filter((f) => f.you).map((f) => [f.tick, f.you]));
  let max = -1;
  let matched = 0;
  for (const f of bFrames) {
    const c = f.contacts.find((k) => k.id === aId);
    const you = aByTick.get(f.tick);
    if (!c || !you) continue;
    matched += 1;
    max = Math.max(max, dist(c, you));
  }
  assert(matched > 30, `B matched too few of A's ticks: ${matched}`);
  return { matched, max };
}

async function main() {
  const a = await joinClient('PRED-A');
  const b = await joinClient('PRED-B');
  assert(a.room.roomId === b.room.roomId, 'clients joined different rooms');

  await sendScript(a);
  await new Promise((r) => setTimeout(r, SETTLE_MS));

  assert(a.welcome && b.welcome, 'missing welcome');
  const lastAck = a.frames.filter((f) => f.you).at(-1).ackSeq;
  assert(lastAck === SCRIPT_TICKS, `server ack ${lastAck} != ${SCRIPT_TICKS}`);

  const first = a.frames.find((f) => f.you).you;
  const last = a.frames.filter((f) => f.you).at(-1).you;
  const moved = dist(first, last);
  assert(moved > 20, `A did not move enough (${moved.toFixed(1)}u)`);

  const lockstep = lockstepDivergence(a.frames);
  const prediction = predictionDivergence(a.frames);
  const tracking = contactTracking(a.frames, b.frames, a.room.sessionId);

  assert(lockstep < 0.01, `lockstep divergence too high: ${lockstep}`);
  assert(tracking.max < 1e-9, `B's contacts diverge from A's you: ${tracking.max}`);
  // Cumulative divergence includes real network jitter (latest-input model
  // re-applying or dropping inputs when the client's 50ms send grid drifts
  // against the server tick grid). Gate loosely at one ship length; the real
  // client reconciles every frame, so what the player sees is maxCorrectionU
  // per frame, absorbed by visualError.
  assert(prediction.max < CONFIG.ship.length, `prediction divergence too high: ${prediction.max}`);

  console.log('PREDICTION SMOKE OK:', {
    room: a.room.roomId,
    framesA: a.frames.length,
    framesB: b.frames.length,
    movedU: +moved.toFixed(1),
    maxLockstepDivergenceU: +lockstep.toExponential(3),
    cumulativePredictionDivergenceU: +prediction.max.toFixed(4),
    maxPerFrameCorrectionU: +prediction.maxCorrection.toFixed(4),
    contactTracking: { matched: tracking.matched, maxU: +tracking.max.toExponential(3) },
  });

  await a.room.leave();
  await b.room.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error('PREDICTION SMOKE FAILED:', err.message);
  process.exit(1);
});
