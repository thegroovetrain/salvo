// SOLO VS AI smoke (Story 6.5): the queue-free door, over real sockets.
//
// One human client, no queue room, no second captain — `client.create('arena',
// {solo:true})` — and a full lobby of AI captains waiting for them. Two boots,
// because the two halves need opposite server configurations:
//
//   PHASE A — A PRODUCTION SERVER (no HC_DEV_OPTIONS). This is the half that
//     matters most: it proves the door a real player uses, on a server with
//     every dev option switched off.
//       A0. a NON-solo direct create('arena') is still REFUSED
//           ("...use the queue") — the solo flag opens its own door and widens
//           nothing else.
//       A1. solo:true with a stale `pv` is refused with the refresh message —
//           the PROTOCOL_VERSION gate runs FIRST on this door too.
//       A2. solo:true is admitted, and the room comes up with a FULL ROSTER:
//           CONFIG.map.playerCap rows (the captain + playerCap-1 bots), every
//           bot carrying a real callsign and a real Regatta hue — never the
//           255 drone-grey sentinel, never a duplicate. This is the story's
//           whole point: without these rows the player meets nineteen
//           amber-hollow UNKNOWN VESSELs while the chrome bar reads 1 AFLOAT.
//       A3. the countdown ARMS WITH ONE HUMAN (no second captain ever
//           connects) and the match reaches `active`, with all playerCap hulls
//           still afloat on the roster.
//
//   PHASE B — A DEV SERVER (HC_DEV_OPTIONS=1), used ONLY to shrink the clocks:
//     a solo match is a full battle royale, and the honest end of one is a
//     16-minute storm. With a fast zone timeline the ocean closes in seconds,
//     the field sinks, and the terminal proof lands: RESULTS BROADCAST, with a
//     dense 1..20 placement partition over captain AND bot rows, and a winner
//     that may legitimately be either. Nothing about the solo path itself is
//     dev-gated — only the storm clock is.
//
// Run: node server/scripts/soloSmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { CONFIG, MSG, PROTOCOL_VERSION, REGATTA_HUES, REGATTA_NO_HUE } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Free ports: matchSmoke/zoneSmoke 2599, reconnect/latency 2601, queue 2603,
// metrics 2631. The two phases use different ports so a slow SIGTERM on the
// first boot can never collide with the second.
const PORT_PROD = 2604;
const PORT_DEV = 2605;

const CAP = CONFIG.map.playerCap; // 20 hulls in a solo lobby
const BOTS = CAP - 1; // 19 AI captains — derived exactly as the room derives it

// A whole battle royale in ~a minute: 4 beats per group, 3 geometric groups
// plus the sudden-death collapse = 16 beats. At 1s a beat the ocean is fully
// closed at ~0:16, and CONFIG.zone.stormDps (4 hp/s, NEVER overridable) does
// the rest. suddenDeath MUST be set explicitly — omitting it forks the group
// COUNT, not just the magnitudes.
const ZONE_OVERRIDE = { beatMs: 1000, ringSteps: [1 / 3, 2 / 3], offsetCap: 0, terminalSightFactor: 0.05, suddenDeath: true };
// Straight into the fight; a short results window so the disposal is quick.
const MATCH_OVERRIDE = { countdownMs: 500, resultsMs: 2000 };

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- server lifecycle (the shared smoke harness) ------------------------------

function bootServer(port, devOptions) {
  const tsx = path.join(REPO, 'node_modules/.bin/tsx');
  const env = { ...process.env, NODE_ENV: 'development', PORT: String(port) };
  if (devOptions) env.HC_DEV_OPTIONS = '1';
  else delete env.HC_DEV_OPTIONS;
  return spawn(tsx, ['src/index.ts'], {
    cwd: path.join(REPO, 'server'),
    detached: true, // own process group, so we can kill tsx + its node child
    env,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

function portOpenOn(port, host) {
  return new Promise((resolve) => {
    const sock = net.connect(port, host);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
  });
}

/** True if anything listens on the port via IPv4 or IPv6 loopback. */
async function portOpen(port) {
  return (await portOpenOn(port, '127.0.0.1')) || portOpenOn(port, '::1');
}

async function waitForServer(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await portOpen(port)) return;
    await sleep(200);
  }
  throw new Error(`server did not open port ${port} in time`);
}

function killServer(proc, signal = 'SIGTERM') {
  try {
    process.kill(-proc.pid, signal); // whole group — our own PID only
  } catch {
    // already gone
  }
}

/** Kill a phase's server and report whether the port leaked. */
async function shutdown(proc, port) {
  killServer(proc);
  await sleep(600);
  if (!(await portOpen(port))) return false;
  killServer(proc, 'SIGKILL');
  await sleep(600);
  const leaked = await portOpen(port);
  if (leaked) console.error(`ERROR: port ${port} still open after SIGTERM+SIGKILL (leaked listener)`);
  return leaked;
}

// --- client harness ----------------------------------------------------------

/** The solo door itself: create() always mints a FRESH room. */
async function createSolo(port, options) {
  const client = new Client(`ws://localhost:${port}`);
  const room = await client.create('arena', { pv: PROTOCOL_VERSION, solo: true, ...options });
  const ctx = { room, welcome: null, frames: 0, you: null, results: null, leftCode: null };
  room.onMessage(MSG.welcome, (m) => (ctx.welcome = m));
  room.onMessage(MSG.frame, (f) => {
    ctx.frames += 1;
    if (f.you) ctx.you = f.you;
  });
  room.onMessage(MSG.results, (m) => (ctx.results = m));
  room.onMessage(MSG.ping, () => undefined); // RTT loop: acknowledged, not echoed (keeps stdout clean)
  room.onLeave((code) => (ctx.leftCode = code));
  return ctx;
}

/** Attempt a create and return the rejection (or null if it succeeded). */
async function expectRefused(port, options) {
  const client = new Client(`ws://localhost:${port}`);
  try {
    const room = await client.create('arena', options);
    await room.leave();
    return null;
  } catch (e) {
    return e;
  }
}

const phase = (ctx) => ctx.room.state?.matchPhase ?? 'unknown';

/** The roster as plain rows (the schema map the client actually receives). */
function roster(ctx) {
  const rows = [];
  ctx.room.state.players.forEach((meta, id) => {
    rows.push({ id, name: meta.name, color: meta.color, alive: meta.alive, placement: meta.placement });
  });
  return rows;
}

async function waitFor(pred, timeoutMs, label) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(50);
  }
}

// --- PHASE A: the production door --------------------------------------------

async function proveDoorRefusesNonSolo(port) {
  const err = await expectRefused(port, { pv: PROTOCOL_VERSION, name: 'INTRUDER' });
  assert(err, "a NON-solo create('arena') was ADMITTED on a production server");
  assert(
    /use the queue/.test(err.message ?? ''),
    `non-solo arena rejection lacks the direct-join message (got: ${err.message})`,
  );
  return `direct door still shut: "${err.message}"`;
}

async function proveDoorRunsThePvGate(port) {
  const err = await expectRefused(port, { pv: PROTOCOL_VERSION + 1, solo: true, name: 'STALE' });
  assert(err, 'a STALE client was admitted through the solo door');
  assert(/refresh/.test(err.message ?? ''), `solo pv rejection lacks the refresh message (got: ${err.message})`);
  return `pv gate runs first on the solo door: "${err.message}"`;
}

function proveFullRoster(ctx) {
  const rows = roster(ctx);
  assert(rows.length === CAP, `roster has ${rows.length} rows, expected ${CAP} (1 captain + ${BOTS} bots)`);
  const botRows = rows.filter((r) => r.id.startsWith('bot-'));
  assert(botRows.length === BOTS, `expected ${BOTS} bot rows, got ${botRows.length}`);
  const me = rows.find((r) => r.id === ctx.room.sessionId);
  assert(me, 'the human captain has no roster row');
  for (const r of rows) {
    assert(r.name.length > 0, `roster row ${r.id} has an EMPTY callsign`);
    assert(r.color !== REGATTA_NO_HUE, `roster row ${r.id} flies the drone-grey sentinel (${REGATTA_NO_HUE})`);
    assert(r.color >= 0 && r.color < REGATTA_HUES.length, `roster row ${r.id} has an off-wheel hue ${r.color}`);
  }
  const hues = new Set(rows.map((r) => r.color));
  assert(hues.size === CAP, `hues collide: ${hues.size} distinct across ${CAP} hulls`);
  const names = new Set(rows.map((r) => r.name.toUpperCase()));
  assert(names.size === CAP, `callsigns collide: ${names.size} distinct across ${CAP} hulls`);
  const afloat = rows.filter((r) => r.alive).length;
  assert(afloat === CAP, `${afloat} AFLOAT, expected ${CAP}`);
  return `roster: ${CAP} rows (${BOTS} AI captains), ${hues.size} distinct hues, no 255 sentinel, ${CAP} AFLOAT`;
}

// --- PHASE B: results ---------------------------------------------------------

function proveResults(ctx) {
  const res = ctx.results;
  const ids = res.rows.map((r) => r.id);
  assert(res.rows.length === CAP, `results carried ${res.rows.length} rows, expected ${CAP}`);
  const botRows = res.rows.filter((r) => r.id.startsWith('bot-'));
  assert(botRows.length === BOTS, `results carried ${botRows.length} bot rows, expected ${BOTS}`);
  assert(ids.includes(ctx.room.sessionId), 'the human captain has no results row');
  for (const r of res.rows) assert(r.name.length > 0, `results row ${r.id} has an EMPTY callsign`);
  const places = res.rows.map((r) => r.placement).sort((a, b) => a - b);
  assert(places.every((p, i) => p === i + 1), `placements are not the dense range 1..${CAP}: ${places.join(',')}`);
  // A bot may legitimately win (it is a participant like any captain), and a
  // same-tick wipe is the existing draw — both are correct outcomes here.
  assert(
    res.winnerId === '' || ids.includes(res.winnerId),
    `winnerId=${res.winnerId} is neither a participant nor the draw sentinel`,
  );
  const winner = res.rows.find((r) => r.id === res.winnerId);
  const who = winner ? `${winner.name} (${winner.id.startsWith('bot-') ? 'AI captain' : 'the human'})` : 'DRAW';
  return `results: ${CAP} rows (${BOTS} AI captains), dense 1..${CAP}, winner=${who}`;
}

// --- main --------------------------------------------------------------------

async function runPhaseA(log) {
  assert(!(await portOpen(PORT_PROD)), `port ${PORT_PROD} is already in use — refusing to boot`);
  const server = bootServer(PORT_PROD, false);
  try {
    await waitForServer(PORT_PROD, 15000);
    log.push(await proveDoorRefusesNonSolo(PORT_PROD));
    log.push(await proveDoorRunsThePvGate(PORT_PROD));

    const a = await createSolo(PORT_PROD, { name: 'ERIC', cls: 'battleship' });
    await waitFor(() => a.welcome !== null, 10000, 'welcome');
    // The countdown must arm with ONE human aboard — nobody else is coming.
    await waitFor(() => phase(a) === 'countdown', 10000, 'countdown without a second captain');
    assert(a.room.state.countdownEndT > 0, 'countdown armed with no deadline');
    log.push('countdown armed with ONE captain aboard (no second human, no queue)');
    await waitFor(() => a.room.state.players.size === CAP, 10000, 'full roster');
    log.push(proveFullRoster(a));
    // ...and it goes live on its own, CONFIG.match.countdown later.
    await waitFor(() => phase(a) === 'active', CONFIG.match.countdown + 15000, 'activation');
    await sleep(400);
    assert(a.frames > 0, 'no frames received');
    assert(a.you, 'no own-ship state in any frame');
    assert(a.room.state.zoneState !== 'idle', 'storm timeline not anchored at activation');
    log.push(`active: ${roster(a).filter((r) => r.alive).length} AFLOAT, zone=${a.room.state.zoneState}, ${a.frames} frames`);
    await a.room.leave();
  } finally {
    if (await shutdown(server, PORT_PROD)) throw new Error(`phase A leaked port ${PORT_PROD}`);
  }
}

async function runPhaseB(log) {
  assert(!(await portOpen(PORT_DEV)), `port ${PORT_DEV} is already in use — refusing to boot`);
  const server = bootServer(PORT_DEV, true);
  try {
    await waitForServer(PORT_DEV, 15000);
    const b = await createSolo(PORT_DEV, {
      name: 'ERIC',
      matchOverride: MATCH_OVERRIDE,
      zoneOverride: ZONE_OVERRIDE,
    });
    await waitFor(() => b.welcome !== null, 10000, 'welcome');
    await waitFor(() => phase(b) === 'active', 20000, 'activation (fast countdown)');
    // The ocean closes on its own clock; the field goes down; the last hull
    // afloat (bot or human) takes it. stormDps is never overridable, so this
    // budget is hull HP over 4 hp/s plus every sinking window.
    await waitFor(() => b.results !== null, 240000, 'results broadcast');
    log.push(proveResults(b));
    await waitFor(() => b.leftCode !== null, MATCH_OVERRIDE.resultsMs + 15000, 'room disconnect after results');
    log.push(`room disconnected the captain (code ${b.leftCode}) after ~${MATCH_OVERRIDE.resultsMs}ms`);
  } finally {
    if (await shutdown(server, PORT_DEV)) throw new Error(`phase B leaked port ${PORT_DEV}`);
  }
}

async function main() {
  const log = [];
  await runPhaseA(log);
  await runPhaseB(log);
  console.log('SOLO SMOKE OK:', { trace: log });
  process.exit(0);
}

main().catch((err) => {
  console.error('SOLO SMOKE FAILED:', err.message);
  process.exit(1);
});
