// Metrics + structured-logging smoke (story 0.3): the real-socket acceptance
// proof for server operability. Self-boots the colyseus server on PORT 2631
// (NEVER the dev server's 2567 — the port is verified FREE before boot and the
// smoke aborts rather than touch a listener it didn't start), with HC_DEBUG
// UNSET, and captures the child's stdout into an in-process line buffer. It
// then proves, over live @colyseus/sdk sockets:
//
//   1. /metrics while idle: HTTP 200, JSON of the exact shape
//      {rooms, players, tick:{p50,p95,max,samples}, messages:{ratePerSec,total}}.
//   2. TWO clients join (pv required since 0.2) with a DEV matchOverride
//      (minHumans:2) so the countdown arms at the 2nd join and reaches the live
//      phase fast; the storm is parked far in the future so it never interferes.
//   3. /metrics DURING the live match: rooms >= 1, players >= 1, tick.samples>0
//      with p50/p95/max > 0, messages.total > 0 (the clients' inputs are counted).
//   4. Match driven to a REAL match.end by the most deterministic route the win
//      logic allows (see MATCH-DRIVING STRATEGY below): both humans LEAVE while
//      active, so aliveHumans() hits 0 and Match.finish() fires — winner is the
//      latest-sunk human. No combat, no storm, no drone-clearing: nothing timing
//      -flaky. matchSmoke's endgame-via-storm path is deliberately NOT copied.
//   5. Captured-stdout assertions: exactly one `info match.end {...}` line whose
//      JSON parses and carries ALL of matchId, mode:'arena', rosterSize,
//      rosterByClass, durationS, winnerClass, killsByClass, stormDeaths; at least
//      one `client.join` and one `match.activate` line, each carrying roomId AND
//      matchId AND a numeric tick; ZERO `debug` lines (HC_DEBUG unset); and no
//      raw UNSTRUCTURED src output (a known event token appearing on a line that
//      isn't a `level event {json}` line is a defect — tsx/node/colyseus banner
//      noise is fine and filtered out by prefix).
//
// MATCH-DRIVING STRATEGY (why it's deterministic): checkWin() finishes the match
// only when no human is alive, OR exactly one human is alive with no other hull
// afloat. With 2 humans + fill drones, the sole non-flaky finish is "no human
// alive": A leaves (recorded sunk-at-leave, 1 human + drones remain → no finish),
// then B leaves (0 humans alive → finish, winner = latest-sunk human = B). This
// needs no weapons hits, no storm timing, and no drone attrition — the two
// consented leaves are the entire choreography.
//
// Then kills its own server process group and verifies port 2631 is free — a
// leaked listener FAILS the smoke (nonzero exit), it doesn't just warn.
// Run: node server/scripts/metricsSmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { CONFIG, PROTOCOL_VERSION } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 2631;
const endpoint = `ws://localhost:${PORT}`;
const metricsUrl = `http://localhost:${PORT}/metrics`;
// Fast countdown with two humans; storm parked far in the future so it never
// interferes with (or contributes storm-deaths to) the short live window.
const MATCH_OVERRIDE = { minHumans: 2, countdownMs: 1500, resultsMs: 3000 };
const ZONE_OVERRIDE = { grace: 600000, shrinkDuration: 180000, endRadiusFraction: 0.15 };

/** Structured src log events — a known token off a non-structured line = defect. */
const KNOWN_EVENTS = new Set([
  'room.create', 'room.dispose', 'room.devOptionsRejected',
  'client.join', 'client.leave', 'client.drop', 'client.resume', 'client.joiningKick',
  'match.activate', 'match.end', 'match.abort',
  'tick.error', 'tick.summary',
]);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- server lifecycle (reconnectSmoke pattern, stdout PIPED for capture) ------

/** Live line buffer of the child's stdout — the assertion surface. */
const stdoutLines = [];

function bootServer() {
  const tsx = path.join(REPO, 'node_modules/.bin/tsx');
  const proc = spawn(tsx, ['src/index.ts'], {
    cwd: path.join(REPO, 'server'),
    detached: true, // own process group, so we can kill tsx + its node child
    // HC_DEV_OPTIONS=1 lets the room honor matchOverride/zoneOverride; HC_DEBUG
    // is DELIBERATELY unset (proof #5 asserts zero debug lines). stdout is PIPED
    // so the logger's `level event {json}` lines land in stdoutLines; stderr is
    // inherited so tsx/node crashes are still visible on the console.
    env: { ...process.env, NODE_ENV: 'development', PORT: String(PORT), HC_DEV_OPTIONS: '1', HC_DEBUG: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let buf = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      stdoutLines.push(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
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

/** SIGKILL fallback if SIGTERM didn't free the port within the grace. */
async function killServerHard(proc) {
  try {
    process.kill(-proc.pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

// --- structured-log parsing ---------------------------------------------------

/** Parse one `level event {json}` line; null for anything else (banner/noise). */
function parseStructured(line) {
  const m = line.match(/^(info|warn|error|debug) (\S+) (\{.*\})$/);
  if (!m) return null;
  let fields;
  try {
    fields = JSON.parse(m[3]);
  } catch {
    return null;
  }
  return { level: m[1], event: m[2], fields };
}

function structuredLines() {
  return stdoutLines.map(parseStructured).filter((s) => s !== null);
}

// --- /metrics fetch + shape checks --------------------------------------------

async function fetchMetrics() {
  const res = await fetch(metricsUrl);
  const body = await res.json();
  return { status: res.status, body };
}

/** Assert the payload has the exact documented shape (types, not values). */
function assertMetricsShape(body, where) {
  assert(body && typeof body === 'object', `${where}: /metrics body not an object`);
  assert(typeof body.rooms === 'number', `${where}: rooms not numeric`);
  assert(typeof body.players === 'number', `${where}: players not numeric`);
  assert(body.tick && typeof body.tick === 'object', `${where}: tick missing`);
  for (const k of ['p50', 'p95', 'max', 'samples']) {
    assert(typeof body.tick[k] === 'number', `${where}: tick.${k} not numeric`);
  }
  assert(body.messages && typeof body.messages === 'object', `${where}: messages missing`);
  assert(typeof body.messages.ratePerSec === 'number', `${where}: messages.ratePerSec not numeric`);
  assert(typeof body.messages.total === 'number', `${where}: messages.total not numeric`);
}

// --- client harness -----------------------------------------------------------

async function joinClient(name) {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('arena', {
    name,
    pv: PROTOCOL_VERSION,
    matchOverride: MATCH_OVERRIDE,
    zoneOverride: ZONE_OVERRIDE,
  });
  const ctx = { name, room, you: null, seq: 0 };
  room.onMessage('w', () => {});
  room.onMessage('f', (m) => { if (m.you) ctx.you = m.you; });
  room.onMessage('r', () => {});
  return ctx;
}

/** Send a benign input (weapons-cold, no throttle) — bumps the message counter. */
function pingInput(ctx) {
  ctx.room.send('i', { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, weapon: 0 });
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

// --- assertions ---------------------------------------------------------------

/** Proof #5a: exactly one match.end line with all 8 documented fields. */
function proveMatchEndLine() {
  const ends = structuredLines().filter((s) => s.level === 'info' && s.event === 'match.end');
  assert(ends.length === 1, `expected exactly 1 info match.end line, got ${ends.length}`);
  const f = ends[0].fields;
  const required = ['matchId', 'mode', 'rosterSize', 'rosterByClass', 'durationS', 'winnerClass', 'killsByClass', 'stormDeaths'];
  for (const k of required) assert(k in f, `match.end missing field '${k}'`);
  assert(typeof f.matchId === 'string' && f.matchId.length > 0, `match.end matchId not a non-empty string (${f.matchId})`);
  assert(f.mode === 'arena', `match.end mode !== 'arena' (${f.mode})`);
  assert(typeof f.rosterSize === 'number' && f.rosterSize >= 2, `match.end rosterSize suspicious (${f.rosterSize})`);
  assert(f.rosterByClass && typeof f.rosterByClass === 'object', 'match.end rosterByClass not an object');
  assert(typeof f.durationS === 'number', `match.end durationS not numeric (${f.durationS})`);
  assert(typeof f.winnerClass === 'string', `match.end winnerClass not a class string (${f.winnerClass})`);
  assert(f.killsByClass && typeof f.killsByClass === 'object', 'match.end killsByClass not an object');
  assert(typeof f.stormDeaths === 'number', `match.end stormDeaths not numeric (${f.stormDeaths})`);
  return f;
}

/** Proof #5b: a lifecycle line of `event` carries roomId + matchId + numeric tick. */
function proveContextLine(event) {
  const hits = structuredLines().filter((s) => s.event === event);
  assert(hits.length >= 1, `expected >= 1 '${event}' line, got ${hits.length}`);
  const f = hits[0].fields;
  assert(typeof f.roomId === 'string' && f.roomId.length > 0, `${event} missing roomId`);
  assert(typeof f.matchId === 'string' && f.matchId.length > 0, `${event} missing matchId`);
  assert(typeof f.tick === 'number', `${event} tick not numeric (${f.tick})`);
  return `${event}: roomId=${f.roomId} matchId=${f.matchId} tick=${f.tick}`;
}

/** Proof #5c: zero debug lines (HC_DEBUG unset). */
function proveNoDebug() {
  const dbg = structuredLines().filter((s) => s.level === 'debug');
  assert(dbg.length === 0, `expected 0 debug lines with HC_DEBUG unset, got ${dbg.length} (e.g. "${dbg[0]?.event}")`);
}

/** Proof #5d: no raw unstructured src output (known event token off a non-log line). */
function proveNoUnstructuredSrc() {
  for (const line of stdoutLines) {
    if (parseStructured(line)) continue; // a valid structured line is fine
    for (const ev of KNOWN_EVENTS) {
      assert(!line.includes(ev), `unstructured src line leaked event '${ev}': ${JSON.stringify(line)}`);
    }
  }
}

// --- main ---------------------------------------------------------------------

async function main() {
  assert(!(await portOpen(PORT)), `port ${PORT} is already in use — refusing to boot (won't touch a foreign listener)`);
  const server = bootServer();
  const log = [];
  let leaked = false;
  try {
    await waitForServer(15000);

    // --- proof #1: /metrics idle -------------------------------------------
    const idle = await fetchMetrics();
    assert(idle.status === 200, `idle /metrics status ${idle.status}`);
    assertMetricsShape(idle.body, 'idle');
    assert(idle.body.rooms === 0, `idle rooms should be 0, got ${idle.body.rooms}`);
    log.push(`idle /metrics: 200, shape ok, rooms=${idle.body.rooms} players=${idle.body.players}`);

    // --- proof #2: two clients -> live phase --------------------------------
    const a = await joinClient('CAPT-A');
    const b = await joinClient('CAPT-B');
    assert(a.room.roomId === b.room.roomId, 'A and B joined different rooms');
    await runUntil(() => {}, () => phase(a) === 'active', MATCH_OVERRIDE.countdownMs + 12000, 'activation');
    log.push(`match reached the live phase (room ${a.room.roomId})`);

    // Drive a few benign inputs from both so messages.total is provably > 0 and
    // enough sim steps accrue for tick percentiles to be populated.
    await runUntil(
      () => { pingInput(a); pingInput(b); },
      () => false,
      1500,
      'never',
    ).catch(() => {}); // intentional: run the ticker for ~1.5s then move on

    // --- proof #3: /metrics live --------------------------------------------
    const live = await fetchMetrics();
    assert(live.status === 200, `live /metrics status ${live.status}`);
    assertMetricsShape(live.body, 'live');
    assert(live.body.rooms >= 1, `live rooms should be >= 1, got ${live.body.rooms}`);
    assert(live.body.players >= 1, `live players should be >= 1, got ${live.body.players}`);
    assert(live.body.tick.samples > 0, `live tick.samples should be > 0, got ${live.body.tick.samples}`);
    assert(live.body.tick.p50 > 0, `live tick.p50 should be > 0, got ${live.body.tick.p50}`);
    assert(live.body.tick.p95 > 0, `live tick.p95 should be > 0, got ${live.body.tick.p95}`);
    assert(live.body.tick.max > 0, `live tick.max should be > 0, got ${live.body.tick.max}`);
    assert(live.body.messages.total > 0, `live messages.total should be > 0, got ${live.body.messages.total}`);
    log.push(
      `live /metrics: rooms=${live.body.rooms} players=${live.body.players} ` +
      `tick{p50:${live.body.tick.p50},p95:${live.body.tick.p95},max:${live.body.tick.max},` +
      `samples:${live.body.tick.samples}} messages.total=${live.body.messages.total}`,
    );

    // --- proof #4: drive to a REAL match.end (both humans leave) -------------
    // A leaves first: 1 human + drones remain, so no finish yet.
    await a.room.leave();
    await sleep(300);
    // B leaves: no human alive -> Match.finish() -> broadcastResults -> match.end.
    await b.room.leave();
    // Give the finishing tick + its synchronous log line time to flush to stdout.
    await runUntil(
      () => {},
      () => structuredLines().some((s) => s.event === 'match.end'),
      8000,
      'match.end line on stdout',
    );
    log.push('both captains left the live match -> Match.finish() fired');

    // --- proof #5: captured-stdout assertions -------------------------------
    const endFields = proveMatchEndLine();
    log.push(`match.end fields: ${JSON.stringify(endFields)}`);
    log.push(proveContextLine('client.join'));
    log.push(proveContextLine('match.activate'));
    proveNoDebug();
    log.push('zero debug lines (HC_DEBUG unset)');
    proveNoUnstructuredSrc();
    log.push('no raw unstructured src output on stdout');

    console.log('METRICS SMOKE OK:', { room: a.room.roomId, trace: log });
  } finally {
    killServer(server);
    await sleep(600);
    leaked = await portOpen(PORT);
    if (leaked) {
      // SIGTERM didn't free it — escalate to SIGKILL and re-check.
      await killServerHard(server);
      await sleep(600);
      leaked = await portOpen(PORT);
      if (leaked) console.error(`ERROR: port ${PORT} still open after SIGTERM+SIGKILL (leaked listener)`);
    }
  }
  process.exit(leaked ? 1 : 0);
}

main().catch((err) => {
  console.error('METRICS SMOKE FAILED:', err.message);
  process.exit(1);
});
