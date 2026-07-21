// Reconnect smoke (story 0.2): self-boots the colyseus server on PORT 2601
// (never the dev server's 2567 — the port is verified FREE before boot and the
// smoke aborts rather than touch a listener it didn't start), joins TWO live
// @colyseus/sdk clients with a DEV matchOverride that reaches the live phase
// fast, and proves the reconnect mechanism over real sockets:
//   0. pv GATE: a joinOrCreate WITHOUT `pv` is rejected at matchmake time with
//      the human-readable "refresh" message (and a correct-pv join succeeds).
//   1. DROP + HOLD: client A steers onto an island-clear straight course at
//      full throttle, its SDK auto-reconnect is disabled, and its raw
//      websocket is terminated (abnormal close — no room.leave). For several
//      seconds A's ship persists: B's roster keeps A's row with alive=true,
//      the match stays 'active', and no teardown runs.
//   2. FORGED TOKEN: a doctored reconnection token is rejected cleanly by the
//      matchmaker; A's ship is untouched (still in B's roster).
//   3. RESUME: client.reconnect(realToken) lands on the SAME sessionId; the
//      first frames show the ship moved a straight-line distance during the
//      outage — it kept sailing under its last stored input while pilotless.
//   4. CONTROL: a fresh input (seq continuing past the pre-drop counter —
//      the input store survived the drop) with hard rudder visibly changes
//      the ship's heading in subsequent frames.
//   5. REPLAYED TOKEN: the ORIGINAL token — consumed by step 3's resume (a
//      resume rotates the token) — is rejected cleanly on replay, so a captured
//      token can't walk a second client onto the same seat.
// Grace-EXPIRY teardown is deliberately NOT smoke-tested (60s is too slow for
// a smoke) — unit tests in server/src/__tests__/reconnect.test.ts cover the
// teardown/dedup semantics.
// Then kills its own server process group and verifies port 2601 is free — a
// leaked listener FAILS the smoke (nonzero exit), it doesn't just warn.
// Run: node server/scripts/reconnectSmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { CONFIG, PROTOCOL_VERSION, angleDiff, bearing, generateMap, segCircleHit } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 2601;
const endpoint = `ws://localhost:${PORT}`;
// Fast countdown with two humans; storm parked far in the future so it never
// interferes with the choreography.
const MATCH_OVERRIDE = { minHumans: 2, countdownMs: 2000, resultsMs: 5000 };
const ZONE_OVERRIDE = { grace: 600000, shrinkDuration: 180000, endRadiusFraction: 0.15 };
/** How long the ship sails pilotless before we resume (well inside the 60s grace). */
const OUTAGE_MS = 3500;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- server lifecycle (dronesSmoke pattern) ----------------------------------

function bootServer() {
  const tsx = path.join(REPO, 'node_modules/.bin/tsx');
  const proc = spawn(tsx, ['src/index.ts'], {
    cwd: path.join(REPO, 'server'),
    detached: true, // own process group, so we can kill tsx + its node child
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
  const ctx = { name, room, welcome: null, you: null, seq: 0, islands: [], mapRadius: 0 };
  room.onMessage('w', (m) => {
    ctx.welcome = m;
    ctx.mapRadius = m.mapRadius;
    ctx.islands = generateMap(m.mapSeed, m.playerCap).islands;
  });
  room.onMessage('f', (m) => { if (m.you) ctx.you = m.you; });
  room.onMessage('r', () => {});
  return ctx;
}

function sendInput(ctx, { throttle = 0, rudder = 0, aim = 0 }) {
  ctx.room.send('i', {
    seq: ++ctx.seq, throttle, rudder, aim, fireSeq: 0, aimDist: 0, slot: 0,
  });
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

/** True when a 500u ray from `pos` along `brg` crosses no island and stays in the map. */
function corridorClear(ctx, pos, brg) {
  const end = { x: pos.x + Math.cos(brg) * 500, y: pos.y + Math.sin(brg) * 500 };
  if (Math.hypot(end.x, end.y) > ctx.mapRadius - 40) return false;
  for (const isle of ctx.islands) {
    // segCircleHit returns 0 (falsy) when p0 is already inside the padded
    // circle — compare against null explicitly.
    if (segCircleHit(pos, end, isle, isle.r + 20) !== null) return false;
  }
  return true;
}

/** Pick a bearing with 500u of clear water (center-ward bias from the spawn ring). */
function clearBearing(ctx) {
  const inward = bearing(ctx.you, { x: 0, y: 0 });
  for (let off = 0; off < Math.PI; off += 0.2) {
    for (const brg of off === 0 ? [inward] : [inward + off, inward - off]) {
      if (corridorClear(ctx, ctx.you, brg)) return brg;
    }
  }
  throw new Error('no island-clear corridor found from spawn');
}

// --- proof steps -------------------------------------------------------------

/** Step 0: missing pv must be rejected at matchmake with the "refresh" message. */
async function provePvGate() {
  const client = new Client(endpoint);
  let rejected = null;
  try {
    await client.joinOrCreate('arena', { name: 'STALE' }); // no pv on purpose
  } catch (e) {
    rejected = e;
  }
  assert(rejected, 'joinOrCreate without pv was NOT rejected');
  assert(
    /refresh/.test(rejected.message ?? ''),
    `pv rejection lacks the refresh message (got: ${rejected.message})`,
  );
  return `pv gate: missing pv rejected with "${rejected.message}"`;
}

/** Steer A onto an island-clear straight course at full throttle, return its course. */
async function steerOntoClearCourse(a) {
  await runUntil(() => sendInput(a, { throttle: 0 }), () => a.you !== null, 8000, 'first frame with you');
  const course = clearBearing(a);
  await runUntil(
    () => sendInput(a, {
      throttle: 1,
      aim: course,
      rudder: clamp(angleDiff(a.you.heading, course) * 3, -1, 1),
    }),
    () => Math.abs(angleDiff(a.you.heading, course)) < 0.08 && a.you.speed > 15,
    20000,
    'A aligned on a clear course at speed',
  );
  // Last stored input: full throttle, rudder ~0 → the ghost sails straight.
  sendInput(a, { throttle: 1, aim: course, rudder: 0 });
  await sleep(120); // let the final input land before the socket dies
  return course;
}

/** Hold window: A must persist in B's roster, alive, with the match still live. */
async function proveHold(b, aSessionId) {
  const start = Date.now();
  let checks = 0;
  while (Date.now() - start < OUTAGE_MS) {
    const meta = b.room.state.players.get(aSessionId);
    assert(meta !== undefined, `A vanished from B's roster ${Date.now() - start}ms after the drop`);
    assert(meta.alive === true, 'A no longer alive in the roster during grace');
    assert(phase(b) === 'active', `match phase left 'active' during grace (${phase(b)})`);
    checks += 1;
    await sleep(250);
  }
  return `hold: A persisted in B's roster+alive through ${checks} checks over ${OUTAGE_MS}ms`;
}

/** A forged token must be rejected and must not disturb the pending ship. */
async function proveForgedToken(b, aSessionId, realToken) {
  const [roomId] = realToken.split(':');
  let rejected = null;
  try {
    await new Client(endpoint).reconnect(`${roomId}:FORGED0000`);
  } catch (e) {
    rejected = e;
  }
  assert(rejected, 'forged reconnection token was NOT rejected');
  await sleep(300);
  assert(b.room.state.players.get(aSessionId) !== undefined, 'forged token attempt tore down A');
  assert(b.room.state.players.get(aSessionId).alive === true, 'forged token attempt killed A');
  return `forged token: rejected ("${rejected.message}"), ship untouched`;
}

/** Real token resumes the same sessionId; the ship sailed on while pilotless. */
async function proveResume(aSessionId, realToken, preDropPos, seqStart) {
  const client = new Client(endpoint);
  const room2 = await client.reconnect(realToken);
  assert(room2.sessionId === aSessionId, `resumed sessionId ${room2.sessionId} !== ${aSessionId}`);
  const a2 = { name: 'A2', room: room2, you: null, seq: seqStart };
  room2.onMessage('w', () => {});
  room2.onMessage('f', (m) => { if (m.you) a2.you = m.you; });
  room2.onMessage('r', () => {});
  await runUntil(() => {}, () => a2.you !== null, 8000, 'frames resume after reconnect');
  const sailed = dist(a2.you, preDropPos);
  assert(sailed > 40, `ship only moved ${sailed.toFixed(1)}u while pilotless — it was not simulated`);
  return { a2, line: `resume: same sessionId, ship sailed ${sailed.toFixed(0)}u during the outage` };
}

/** A fresh input (seq continues past the pre-drop counter) must steer the ship. */
async function proveControl(a2) {
  const h0 = a2.you.heading;
  await runUntil(
    () => sendInput(a2, { throttle: 1, rudder: 1, aim: a2.you.heading }),
    () => Math.abs(angleDiff(h0, a2.you.heading)) > 0.4,
    10000,
    'fresh input turns the resumed ship',
  );
  const turned = Math.abs(angleDiff(h0, a2.you.heading));
  return `control: post-resume input (seq ${a2.seq}) turned the ship ${turned.toFixed(2)}rad`;
}

/**
 * The OLD token (already consumed by the successful resume — a resume rotates
 * the reconnection token) must be rejected cleanly on replay. Guards against a
 * captured-token replay walking a second client onto the same seat.
 */
async function proveReplayedToken(oldToken) {
  let rejected = null;
  try {
    await new Client(endpoint).reconnect(oldToken);
  } catch (e) {
    rejected = e;
  }
  assert(rejected, 'REPLAYED (already-consumed) reconnection token was NOT rejected');
  return `replayed token: consumed token rejected cleanly ("${rejected.message}")`;
}

async function main() {
  assert(!(await portOpen(PORT)), `port ${PORT} is already in use — refusing to boot (won't touch a foreign listener)`);
  const server = bootServer();
  const log = [];
  let leaked = false;
  try {
    await waitForServer(15000);

    log.push(await provePvGate());

    // Two humans -> countdown -> active.
    const a = await joinClient('CAPT-A');
    const b = await joinClient('CAPT-B');
    await runUntil(() => {}, () => phase(a) === 'active', MATCH_OVERRIDE.countdownMs + 10000, 'activation');
    log.push('match reached the live phase with 2 humans');

    await steerOntoClearCourse(a);
    const preDropPos = { x: a.you.x, y: a.you.y };
    const seqAtDrop = a.seq;

    // Capture the REAL token, then drop the raw socket WITHOUT room.leave —
    // auto-reconnect is disabled first so the drop stays dropped.
    const realToken = a.room.reconnectionToken;
    assert(typeof realToken === 'string' && realToken.includes(':'), 'no reconnectionToken exposed');
    a.room.reconnection.enabled = false;
    // UNDOCUMENTED SDK INTERNAL (pinned to @colyseus/sdk 0.17.43): reaching into
    // room.connection.transport.ws is the only way to simulate an abnormal
    // socket drop (1006) — room.leave() would be a consented 4000 that skips
    // onDrop. Revisit if the SDK's transport shape changes on upgrade.
    const ws = a.room.connection.transport.ws;
    if (typeof ws.terminate === 'function') ws.terminate();
    else ws.close();
    log.push(`dropped A's socket abnormally (token captured, seq at drop ${seqAtDrop})`);

    log.push(await proveHold(b, a.room.sessionId));
    log.push(await proveForgedToken(b, a.room.sessionId, realToken));
    const { a2, line } = await proveResume(a.room.sessionId, realToken, preDropPos, seqAtDrop);
    log.push(line);
    log.push(await proveControl(a2));
    // realToken was consumed by proveResume's successful reconnect — replaying
    // it now must be rejected (token rotates on resume).
    log.push(await proveReplayedToken(realToken));

    console.log('RECONNECT SMOKE OK:', { room: b.room.roomId, trace: log });
  } finally {
    killServer(server);
    await sleep(400);
    leaked = await portOpen(PORT);
    if (leaked) console.error(`ERROR: port ${PORT} still open after kill (leaked listener)`);
  }
  // A leaked listener is a real failure (would block the next boot), not a
  // warning — fail the smoke with a nonzero exit.
  process.exit(leaked ? 1 : 0);
}

main().catch((err) => {
  console.error('RECONNECT SMOKE FAILED:', err.message);
  process.exit(1);
});
