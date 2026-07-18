// Netcode smoke: join two @colyseus/sdk clients to a running dev server, send
// input messages from both, and assert:
//   - both receive the "w" welcome (sessionId, mapSeed, mapRadius, config)
//   - both receive per-tick "f" frames with `you` present
//   - client A's ship MOVES under a full-throttle input, and frames ack its seq
//   - each client's frames list the OTHER ship in `contacts`
// NOTE: this was the step-5 interp checkpoint (unfogged contacts). Since fog
// (step 9) landed, the contact assertion only holds while the ships are within
// sight range of each other — fresh spawns usually are NOT. Superseded by
// fogSmoke.mjs; kept for the welcome/frame/ack plumbing checks.
// Run against a booted server, with HC_DEV_OPTIONS=1 in ITS env — this
// smoke's sandbox matchOverride + zoneOverride are otherwise stripped by the
// room (see server/src/rooms/roomOptions.ts):
//   HC_DEV_OPTIONS=1 npm run dev -w server   (separate terminal)
//   node server/scripts/smoke.mjs
import { Client } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@salvo/shared';

const endpoint = process.env.WS_URL || 'ws://localhost:2567';
const FRAME_WAIT_MS = 1500;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Sandbox (dev-only): pre-step-14 room behavior — no match lifecycle, permissive
// combat policy, storm at 2nd join. The long grace keeps that storm harmless
// for the whole choreography (this smoke predates the zone / match steps).
const SANDBOX_ZONE = { grace: 600000, shrinkDuration: 180000, endRadiusFraction: 0.15 };

async function joinClient(name) {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('arena', { name, pv: PROTOCOL_VERSION, matchOverride: { sandbox: true }, zoneOverride: SANDBOX_ZONE });
  const ctx = { name, room, welcome: null, frames: [] };
  room.onMessage('w', (msg) => (ctx.welcome = msg));
  room.onMessage('f', (msg) => ctx.frames.push(msg));
  return ctx;
}

function sendInputs(ctx, throttle) {
  let seq = 0;
  return setInterval(() => {
    ctx.room.send('i', { seq: ++seq, throttle, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, weapon: 0 });
    ctx.lastSeq = seq;
  }, 50);
}

function checkClient(ctx, otherId) {
  const { name, frames, welcome } = ctx;
  assert(welcome, `${name}: no welcome received`);
  assert(welcome.sessionId === ctx.room.sessionId, `${name}: welcome sessionId mismatch`);
  assert(Number.isFinite(welcome.mapSeed), `${name}: welcome missing mapSeed`);
  assert(welcome.mapRadius > 0, `${name}: welcome missing mapRadius`);
  assert(welcome.config?.tick?.simDtMs === 50, `${name}: welcome missing CONFIG snapshot`);

  assert(frames.length >= 10, `${name}: expected >=10 frames, got ${frames.length}`);
  const first = frames.find((f) => f.you);
  const last = [...frames].reverse().find((f) => f.you);
  assert(first && last, `${name}: frames missing 'you'`);
  const moved = Math.hypot(last.you.x - first.you.x, last.you.y - first.you.y);
  assert(moved > 3, `${name}: ship did not move (moved=${moved.toFixed(2)}u)`);
  assert(last.ackSeq > 0 && last.ackSeq <= ctx.lastSeq, `${name}: bad ackSeq ${last.ackSeq}`);

  // Post-fog this only holds when the ships happen to be inside sight range —
  // fresh spawns are not (see header: superseded by fogSmoke.mjs; this smoke
  // is kept for the welcome/frame/ack plumbing checks). Report, don't fail.
  const withContact = frames.filter((f) => f.contacts.some((c) => c.id === otherId));
  const contact = withContact.length > 0 ? `${withContact.length} frames` : 'none (fogged — expected)';
  return { name, frames: frames.length, moved: moved.toFixed(1), ackSeq: last.ackSeq, contact };
}

async function main() {
  const a = await joinClient('SMOKE-A');
  const b = await joinClient('SMOKE-B');
  assert(a.room.roomId === b.room.roomId, 'clients joined different rooms');

  const timers = [sendInputs(a, 1), sendInputs(b, -0.5)];
  await new Promise((r) => setTimeout(r, FRAME_WAIT_MS));
  timers.forEach(clearInterval);

  const resultA = checkClient(a, b.room.sessionId);
  const resultB = checkClient(b, a.room.sessionId);

  console.log('NETCODE SMOKE OK:', {
    room: a.room.roomId,
    mapSeed: a.welcome.mapSeed,
    mapRadius: a.welcome.mapRadius,
    a: resultA,
    b: resultB,
  });

  await a.room.leave();
  await b.room.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error('NETCODE SMOKE FAILED:', err.message);
  process.exit(1);
});
