// LOAD TEST (Story 7-8, task 2) — the load leg of AR12 / NFR10.
//
// Three epics assumed this file existed. It did not. This is it: a real-socket
// connection SPIKE against a real Colyseus server, driving real `"i"` input
// traffic at the real 20 Hz cadence, asserting against the SAME `/metrics`
// numbers ops will watch in production. It is not a unit test and not a smoke —
// the smokes prove a flow is CORRECT, this proves the process stays INSIDE its
// tick budget while a plausible worst-minute of arrivals lands on it at once.
//
// ============================================================================
// THE DECLARED THRESHOLD, AND WHY IT IS THAT NUMBER
// ============================================================================
//
//   SELF-BOOT (default):  tick p95 <= HC_LOAD_P95_MS (default 40 ms)  ENFORCED
//   DEPLOYED:             the same number, REPORT-ONLY unless `--assert`
//
// The server runs an authoritative fixed 20 Hz simulation: `CONFIG.tick.simDtMs`
// is 50 ms, and that is the WHOLE budget for one room's `update()`. A room whose
// update costs more than 50 ms cannot hold 20 Hz at all — it falls behind by
// construction, and every client's prediction reconciles against a clock that is
// slipping. So the bar is a FRACTION of that hard ceiling, not a taste number:
//
//   40 ms = 80 % of the 50 ms step, leaving 20 % (10 ms) of headroom for GC
//   pauses, socket flushes, matchmaking work and OS scheduling jitter — all of
//   which land on the same single thread between steps and none of which the
//   per-step timer sees.
//
// It is deliberately a p95 and not a max: one 60 ms outlier during a map
// generation is a hiccup the fixed-step loop absorbs, while one step in twenty
// over budget is a process that is structurally late.
//
// WHY DEPLOYED MODE DOES NOT ENFORCE IT BY DEFAULT. The staging tier is
// `starter` (0.5 CPU / 512 MB) against production's `pro` (2 CPU / 4 GB) — see
// the deploy table in CLAUDE.md. A tick p95 measured on half a core is a LOWER
// BOUND on what production can do, not a verdict on it: a staging FAIL does not
// prove production fails, and a staging PASS is strictly good news. Reporting it
// and refusing to grade it is the honest reading. Pass `--assert` when you have
// deliberately raised the dev plan and want the number to gate.
//
// SELF-BOOT MEASUREMENT CAVEAT, stated rather than hidden: the harness and the
// server share one machine, so ~44 SDK clients decoding ~840 frames/s compete
// for the same cores as the process being measured. That biases the number
// UPWARD (pessimistic), which is the safe direction for a gate.
//
// ============================================================================
// THE SPIKE SHAPE
// ============================================================================
//
// Default self-boot profile: 44 connections, all launched without a stagger.
//
//   * 1 SEED queue client, awaited first. This is the one concession to
//     determinism and it is load-bearing: `joinOrCreate('queue')` fired 42×
//     concurrently against a server with NO queue room yet can legitimately mint
//     several pools, and three pools of fourteen never reach
//     `CONFIG.map.playerCap` — the spike would then form zero arenas and measure
//     nothing. Seeding one pool first means the concurrent wave finds an
//     existing unlocked room (StandardQueueRoom sets no `maxClients`) and lands
//     in it. The wave itself is still a genuine 43-connection storm.
//   * 41 more queue joiners, concurrent. 42 pooled captains → the policy in
//     `rooms/queue.ts` forms at the cap TWICE (20 + 20) on successive 1 Hz
//     steps and leaves 2 pooled, which is a deliberate part of the profile: a
//     partially-armed pool is a real production state.
//   * 2 SOLO VS AI creates, concurrent. Each mints its own 20-hull arena
//     (1 human + 19 bots), so the bot-AI cost is in the measurement.
//
// That is 4 simulating arenas / 80 hulls, of which 42 are driven by this
// harness's own sockets and 38 by server-side bot AI.
//
// DEPLOYED default is gentler on purpose (21 connections: 1 seed + 19 queue =
// one full cohort, plus 1 solo create) because of the tier gap above AND because
// every harness client shares ONE source IP against the per-IP solo-create
// throttle the same cycle added (default 6 admitted creates/min). Solo creates
// are HARD-CLAMPED to `MAX_DEPLOYED_SOLO` (4) in deployed mode so the harness
// can never be the thing that trips it.
//
// ============================================================================
// DEPLOYED-MODE AUTH — how a Node client gets past the staging password
// ============================================================================
//
// There is exactly ONE channel, and it is the `Cookie` request header. Read
// `server/src/stagingGate.ts`:
//
//   * :64   `GATE_COOKIE = 'hc_gate'`
//   * :83   `gateDigest()` = `sha256(HC_STAGING_KEY)` as hex — the cookie
//           carries the DIGEST, never the password
//   * :119  `stagingGateError(cookieHeader)` — a pure string function over the
//           raw Cookie header; returns `GATE_JOIN_ERROR` or null
//   * `ArenaRoom.ts:192` and `StandardQueueRoom.ts:138` both call it as
//     `stagingGateError(context?.headers?.get('cookie') ?? undefined)`
//
// So the ONLY thing either door inspects is `AuthContext.headers.get('cookie')`.
// There is NO join-option channel: nothing anywhere reads a digest out of
// `options`, and the matchmake body is not consulted by the gate at all. A
// harness that tried to pass the digest as a room option would be silently
// refused.
//
// The SDK does support this from Node, without a shim and without a dependency:
// `new Client(endpoint, { headers })` stores them as the HTTP client's base
// headers (`@colyseus/sdk/build/Client.mjs:73-75`), `executeRequest` merges base
// headers UNDER the per-request `Accept`/`Content-Type`
// (`HTTP.mjs:141-143`) so `cookie` survives into the matchmake POST, and the
// same header bag is forwarded to the websocket handshake
// (`Client.mjs:145` → `room.connect(..., this.http.options.headers)`). Node's
// `fetch` (undici) does NOT enforce the browser's forbidden-header list, so a
// `Cookie` header set this way really is sent — verified against a local
// `http.createServer` before this script was written.
//
// The same cookie is sent in SELF-BOOT mode too whenever `HC_STAGING_KEY` is
// set, and the booted child inherits the variable. That is not ceremony: it
// makes the entire deployed auth path exercisable on localhost, so the code path
// below is not "clean by inspection only".
//
// ============================================================================
// USAGE
// ============================================================================
//
//   node server/scripts/loadTest.mjs                    # self-boot, scratch port 2609
//   HC_LOAD_TARGET=https://host node server/scripts/loadTest.mjs
//   HC_LOAD_TARGET=https://host HC_STAGING_KEY=… node server/scripts/loadTest.mjs
//   HC_LOAD_TARGET=https://host node server/scripts/loadTest.mjs --assert
//
// Knobs (all optional): HC_LOAD_CLIENTS, HC_LOAD_SOLO, HC_LOAD_SECONDS,
// HC_LOAD_P95_MS, HC_LOAD_PORT. Any off-default knob CHANGES THE OUTPUT
// FILENAME (perf-gate's own rule) so a variant run can never overwrite the
// record a default run wrote.
//
// Evidence: _bmad-output/implementation-artifacts/perf-gate/loadtest-<mode>-<date>.json
//
// Process hygiene: this script kills ONLY the server it booted itself, refuses
// to boot when the scratch port is already held by a foreign listener, and tears
// down on assertion failure, on an exception, and on SIGINT/SIGTERM.

import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { CONFIG, MSG, PROTOCOL_VERSION } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_DIR = path.join(REPO, '_bmad-output/implementation-artifacts/perf-gate');

// Scratch port. NEVER 2567 (the dev game server) and never 5173 (Vite). Free of
// every other smoke: matchSmoke/zoneSmoke 2599, reconnect/latency 2601,
// queue 2603, solo 2604/2605, metrics 2631.
const DEFAULT_PORT = 2609;
/** Hard ceiling on solo creates in deployed mode — see the header. */
const MAX_DEPLOYED_SOLO = 4;
/** The tick budget the threshold is a fraction of. */
const TICK_BUDGET_MS = CONFIG.tick.simDtMs; // 50
const CAP = CONFIG.map.playerCap; // 20

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowMs = () => Date.now();

// --- profile ------------------------------------------------------------------

function stripSlash(s) {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return { value: fallback, custom: false };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name}=${raw} is not a non-negative number`);
  return { value: Math.floor(n), custom: Math.floor(n) !== fallback };
}

function resolveProfile() {
  const target = process.env.HC_LOAD_TARGET ? stripSlash(process.env.HC_LOAD_TARGET) : null;
  const mode = target ? 'deployed' : 'selfboot';
  const port = intEnv('HC_LOAD_PORT', DEFAULT_PORT);
  const clients = intEnv('HC_LOAD_CLIENTS', mode === 'deployed' ? 21 : 44);
  const soloRaw = intEnv('HC_LOAD_SOLO', mode === 'deployed' ? 1 : 2);
  const seconds = intEnv('HC_LOAD_SECONDS', 60);
  const p95 = intEnv('HC_LOAD_P95_MS', 40);
  // The clamp is a SAFETY rail, not a preference: it protects the deployed
  // tier's per-IP solo-create throttle from this harness.
  const solo = mode === 'deployed' ? Math.min(soloRaw.value, MAX_DEPLOYED_SOLO) : soloRaw.value;
  if (solo > clients.value) throw new Error(`HC_LOAD_SOLO (${solo}) exceeds HC_LOAD_CLIENTS (${clients.value})`);
  const origin = target ?? `http://localhost:${port.value}`;
  const custom = [clients, soloRaw, seconds, p95, port].some((k) => k.custom) || solo !== soloRaw.value;
  return {
    mode,
    origin,
    port: port.value,
    clients: clients.value,
    solo,
    queueClients: clients.value - solo,
    seconds: seconds.value,
    p95Ms: p95.value,
    enforceP95: mode === 'selfboot' || process.argv.includes('--assert'),
    custom,
    stagingKeySet: Boolean(process.env.HC_STAGING_KEY),
  };
}

/** `hc_gate=<sha256(HC_STAGING_KEY)>` — the ONLY channel either room's onAuth
 *  reads (stagingGate.ts:64/83/119). Undefined when no key is configured, in
 *  which case the gate is inert server-side and the header is omitted. */
function gateHeaders() {
  const key = process.env.HC_STAGING_KEY;
  if (!key) return undefined;
  const digest = createHash('sha256').update(key).digest('hex');
  return { cookie: `hc_gate=${digest}` };
}

// --- server lifecycle (self-boot only; the shared smoke harness) ---------------

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

function bootServer(port) {
  const tsx = path.join(REPO, 'node_modules/.bin/tsx');
  return spawn(tsx, ['src/index.ts'], {
    cwd: path.join(REPO, 'server'),
    detached: true, // own process group, so we can kill tsx + its node child
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      // NO HC_DEV_OPTIONS: every door this harness knocks on (the queue, and
      // create('arena',{solo:true})) is a PRODUCTION door. Booting with dev
      // options on would measure a server no player ever meets.
      HC_DEV_OPTIONS: '',
      // The per-IP solo-create throttle is DISABLED for the self-boot spike:
      // every client here shares one loopback IP by construction, so a
      // production-shaped throttle would refuse the profile's own solo creates
      // and turn a load measurement into a throttle test. Deployed mode leaves
      // it alone and stays under it by clamping solo creates instead.
      HC_SOLO_CREATE_LIMIT: '0',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

async function waitForServer(port, timeoutMs) {
  const start = nowMs();
  while (nowMs() - start < timeoutMs) {
    if (await portOpen(port)) return;
    await sleep(200);
  }
  throw new Error(`server did not open port ${port} within ${timeoutMs}ms`);
}

function signalGroup(proc, signal) {
  try {
    process.kill(-proc.pid, signal); // whole group — our own PID only
  } catch {
    // already gone
  }
}

/** Kill the server WE booted and report whether the port leaked. */
async function shutdownServer(proc, port) {
  if (!proc) return false;
  signalGroup(proc, 'SIGTERM');
  await sleep(700);
  if (!(await portOpen(port))) return false;
  signalGroup(proc, 'SIGKILL');
  await sleep(700);
  const leaked = await portOpen(port);
  if (leaked) console.error(`ERROR: port ${port} still open after SIGTERM+SIGKILL (leaked listener)`);
  return leaked;
}

// --- refusal classification ----------------------------------------------------

/**
 * Bucket a matchmake rejection by CAUSE. The doors return human-readable
 * strings (stagingGate.ts GATE_JOIN_ERROR, roomOptions.ts protocolVersionError,
 * soloThrottle.ts SOLO_CREATE_THROTTLE_ERROR, @colyseus/core's own lock/full
 * messages), so the message is the signal; the numeric code is recorded
 * alongside it but never relied on for the bucket — @colyseus/core reports an
 * `onAuth` refusal as a generic AUTH_FAILED whatever the reason, so every one
 * of ours would collapse into a single bucket if the code decided it.
 *
 * ORDER IS LOAD-BEARING and each arm is anchored to a phrase its own source
 * owns: gate → "password-protected", pv → "refresh", throttle → "too many".
 * Verified against the shipped strings, not guessed.
 */
function refusalCause(err) {
  const msg = String(err?.message ?? '');
  if (/password-protected|staging server/i.test(msg)) return 'gate';
  if (/refresh|protocol/i.test(msg)) return 'pv';
  if (/locked|is full|no rooms|maxClients|not found/i.test(msg)) return 'capacity';
  if (/too many|throttl|rate limit|slow down|try again/i.test(msg)) return 'throttle';
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|socket hang up|fetch failed/i.test(msg)) return 'network';
  return 'other';
}

// --- client harness ------------------------------------------------------------

/** Everything a connection can end up as. Exactly one of these per attempt. */
function makeLedger() {
  return {
    attempted: 0,
    joined: 0,
    refused: { gate: 0, pv: 0, capacity: 0, throttle: 0, network: 0, other: 0 },
    refusalSamples: [],
    errored: 0,
    errorSamples: [],
    drops: 0,
    dropSamples: [],
  };
}

function recordRefusal(ledger, kind, err) {
  ledger.refused[kind] += 1;
  if (ledger.refusalSamples.length < 5) {
    ledger.refusalSamples.push({ cause: kind, code: err?.code ?? null, message: String(err?.message ?? '') });
  }
}

/** Reject a connection attempt that never settles, so the spike cannot hang. */
function withDeadline(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout after ${ms}ms: ${label}`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Bind the message handlers a real client binds. The SDK WARNS AND DISCARDS a
 * message whose type has no handler (Room.dispatchMessage), so every channel the
 * arena can emit gets one — including MSG.ping, which is echoed exactly as the
 * shipped client echoes it (the RTT estimator in server/src/game/rtt.ts depends
 * on the echo, and a harness that ignored it would measure a server with no RTT
 * traffic at all).
 */
function bindArena(ctx, room) {
  ctx.arena = room;
  room.onMessage(MSG.welcome, (w) => { ctx.welcome = w; });
  room.onMessage(MSG.frame, (f) => { ctx.frames += 1; if (f.you) ctx.you = f.you; });
  room.onMessage(MSG.results, () => undefined);
  room.onMessage(MSG.requeue, () => undefined);
  room.onMessage(MSG.ping, (m) => { try { room.send(MSG.ping, { n: m.n }); } catch { /* closing */ } });
  room.onLeave((code) => { ctx.arenaLeft = code; });
}

const HULLS = ['torpedoBoat', 'battleship', 'mineLayer'];

function makeCtx(id, kind) {
  return {
    id, kind,
    client: null, queue: null, arena: null,
    seat: null, welcome: null, you: null,
    frames: 0, inputs: 0, seq: 0,
    queueLeft: null, arenaLeft: null,
    expectQueueLeave: false,
  };
}

/** One QUEUE captain: the door every standard-match player walks through. */
async function joinQueue(cfg, ctx, headers) {
  ctx.client = new Client(cfg.origin, headers ? { headers } : undefined);
  ctx.queue = await withDeadline(
    ctx.client.joinOrCreate('queue', {
      name: ctx.id,
      pv: PROTOCOL_VERSION,
      cls: HULLS[ctx.hash % HULLS.length],
      horn: 'standard',
    }),
    30000,
    `${ctx.id} joinOrCreate('queue')`,
  );
  ctx.queue.onMessage(MSG.queueStatus, () => undefined);
  ctx.queue.onMessage(MSG.seat, (s) => { ctx.seat = s; });
  ctx.queue.onLeave((code) => { ctx.queueLeft = code; });
  return ctx;
}

/** One SOLO VS AI captain: `create('arena', {solo:true})` mints a fresh 20-hull
 *  room (1 human + 19 bots). `create`, never `joinOrCreate` — see epic-6
 *  amendment 29; joining someone else's solo room is not a thing. */
async function createSolo(cfg, ctx, headers) {
  ctx.client = new Client(cfg.origin, headers ? { headers } : undefined);
  const room = await withDeadline(
    ctx.client.create('arena', { name: ctx.id, pv: PROTOCOL_VERSION, solo: true, cls: 'battleship' }),
    45000, // a solo create runs a full map generation + 19-bot fleet build
    `${ctx.id} create('arena',{solo:true})`,
  );
  bindArena(ctx, room);
  return ctx;
}

/** Consume a seat into the arena and release the queue socket — verbatim what
 *  client/src/net/connection.ts does (the reservation is held by the matchMaker,
 *  not by the queue room). */
async function board(ctx) {
  const room = await withDeadline(ctx.client.consumeSeatReservation(ctx.seat), 30000, `${ctx.id} consumeSeatReservation`);
  bindArena(ctx, room);
  ctx.expectQueueLeave = true;
  await leaveQuietly(ctx.queue);
}

/** Room.leave() that can never hang the teardown (leave() never settles against
 *  an already-closed socket). */
async function leaveQuietly(room) {
  if (!room) return;
  let timer;
  await Promise.race([
    room.leave().catch(() => undefined),
    new Promise((res) => { timer = setTimeout(res, 1500); }),
  ]).finally(() => clearTimeout(timer));
}

// --- the input driver ----------------------------------------------------------

/**
 * REAL input traffic at the REAL cadence. `client/src/sim/inputSampler.ts` sends
 * one `"i"` per 50 ms sim step, so this does the same — one shared 50 ms timer
 * over every arena-connected client rather than N timers, which keeps the
 * harness's own scheduling out of the server's measurement.
 *
 * Helm axes and aim VARY per client and over time on purpose: a fleet of ships
 * all sending `throttle:0` never moves, never collides, never grounds and never
 * exercises the collision/zone/wake legs of the step order — it would measure an
 * idle world wearing a load test's name. Nothing fires (`fireSeq` stays 0): the
 * spike is about the per-tick simulation cost, and ordnance would make the
 * roster decay unpredictably inside the measurement window.
 */
function makeInputDriver(clients) {
  let timer = null;
  let ticks = 0;
  let sent = 0;
  const step = () => {
    ticks += 1;
    for (const ctx of clients) {
      if (!ctx.arena || ctx.arenaLeft !== null) continue;
      const phase = (ctx.hash + ticks) * 0.037;
      try {
        ctx.arena.send(MSG.input, {
          seq: ++ctx.seq,
          throttle: Math.sin(phase) > 0 ? 1 : 0.5,
          rudder: Math.sin(phase * 0.31),
          aim: (phase % (Math.PI * 2)),
          fireSeq: 0,
          aimDist: 0,
          slot: 0,
          fireT: 0,
          actSeq: 0,
          actSlot: 0,
          hornSeq: 0,
        });
        ctx.inputs += 1;
        sent += 1;
      } catch {
        // socket closing mid-flush; the drop ledger is what records it
      }
    }
  };
  return {
    start() { if (!timer) timer = setInterval(step, CONFIG.tick.simDtMs); },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
    get sent() { return sent; },
  };
}

// --- /metrics polling ----------------------------------------------------------

async function fetchMetrics(cfg, headers) {
  const res = await fetch(`${cfg.origin}/metrics`, { headers: headers ?? undefined });
  if (!res.ok) throw new Error(`/metrics returned ${res.status}`);
  return res.json();
}

/** Poll every 5 s throughout, keeping the whole series (the table reports peak
 *  and end; the JSON carries every sample so a suspicious run is re-readable). */
function makeMetricsPoller(cfg, headers) {
  const samples = [];
  const errors = [];
  let timer = null;
  const poll = async (label) => {
    try {
      const body = await fetchMetrics(cfg, headers);
      samples.push({ t: nowMs(), label, ...body });
      return body;
    } catch (e) {
      errors.push({ t: nowMs(), label, message: String(e?.message ?? e) });
      return null;
    }
  };
  return {
    poll,
    start(label) { if (!timer) timer = setInterval(() => { void poll(label); }, 5000); },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
    get samples() { return samples; },
    get errors() { return errors; },
  };
}

/** The worst p95 the process reported while under load, and the final reading. */
function summarizeMetrics(samples, sinceT) {
  const window = samples.filter((s) => s.t >= sinceT);
  const pool = window.length > 0 ? window : samples;
  if (pool.length === 0) return null;
  let peak = pool[0];
  for (const s of pool) if (s.tick.p95 > peak.tick.p95) peak = s;
  return { peak, end: pool[pool.length - 1], count: pool.length };
}

// --- phases --------------------------------------------------------------------

/**
 * THE SPIKE. One awaited seed queue join (see the header — without it a
 * concurrent wave can mint several pools and form zero arenas), then everything
 * else launched at once with no stagger.
 */
async function runSpike(cfg, headers, ledger) {
  const clients = [];
  const seed = makeCtx('LOAD-SEED-000', 'queue');
  seed.hash = 0;
  ledger.attempted += 1;
  // The seed goes through the SAME ledger as the wave and its failure is NOT
  // fatal. It is one connection like any other: a refused seed (a staging host
  // with no cookie is the obvious case) must be reported as a refusal WITH ITS
  // CAUSE in the table, not thrown as a bare message that leaves the other 43
  // attempts unaccounted for. Without the seed the wave may mint several pools
  // and form no arena — which the "drove a live simulation" assertion catches
  // with a far clearer verdict than a crash gives.
  try {
    await joinQueue(cfg, seed, headers);
    ledger.joined += 1;
    clients.push(seed);
  } catch (e) {
    classifyFailure(ledger, e);
    console.error(`[loadTest] seed queue join failed (${refusalCause(e)}): ${e?.message ?? e}`);
  }

  const attempts = [];
  for (let i = 1; i < cfg.queueClients; i++) {
    const ctx = makeCtx(`LOAD-Q-${String(i).padStart(3, '0')}`, 'queue');
    ctx.hash = i * 7;
    attempts.push({ ctx, run: () => joinQueue(cfg, ctx, headers) });
  }
  for (let i = 0; i < cfg.solo; i++) {
    const ctx = makeCtx(`LOAD-SOLO-${String(i).padStart(3, '0')}`, 'solo');
    ctx.hash = 500 + i * 13;
    attempts.push({ ctx, run: () => createSolo(cfg, ctx, headers) });
  }
  ledger.attempted += attempts.length;

  const settled = await Promise.allSettled(attempts.map((a) => a.run()));
  settled.forEach((res, i) => {
    const { ctx } = attempts[i];
    if (res.status === 'fulfilled') {
      ledger.joined += 1;
      clients.push(ctx);
      return;
    }
    classifyFailure(ledger, res.reason);
  });
  return clients;
}

/**
 * Every non-join outcome lands in exactly one bucket. A network failure or a
 * harness deadline is an ERROR (we never reached a server verdict); anything
 * with a server-issued message is a REFUSAL, filed by cause.
 */
function classifyFailure(ledger, reason) {
  const cause = refusalCause(reason);
  if (cause === 'network' || /^timeout after/.test(String(reason?.message ?? ''))) {
    ledger.errored += 1;
    if (ledger.errorSamples.length < 5) ledger.errorSamples.push(String(reason?.message ?? reason));
    return;
  }
  recordRefusal(ledger, cause, reason);
}

/** Wait for the queue to seat whole cohorts, then board every seat that landed. */
async function boardSeats(clients, expectedSeats, timeoutMs) {
  const queued = clients.filter((c) => c.kind === 'queue');
  const start = nowMs();
  while (nowMs() - start < timeoutMs) {
    if (queued.filter((c) => c.seat !== null).length >= expectedSeats) break;
    await sleep(200);
  }
  const withSeats = queued.filter((c) => c.seat !== null);
  const settled = await Promise.allSettled(withSeats.map((c) => board(c)));
  const failed = settled.filter((s) => s.status === 'rejected');
  return { seats: withSeats.length, boarded: settled.length - failed.length, boardFailures: failed.map((f) => String(f.reason?.message ?? f.reason)) };
}

const phaseOf = (ctx) => ctx.arena?.state?.matchPhase ?? 'unknown';

/** Best-effort: hold until the arenas go live, so the measured window is the
 *  ACTIVE simulation and not a countdown. Not an assertion — a room that never
 *  activates shows up in the table as `active: 0` and fails the meaningful-run
 *  check instead, with a clearer message than a timeout would give. */
async function waitForActive(clients, timeoutMs) {
  const inArena = clients.filter((c) => c.arena);
  if (inArena.length === 0) return 0; // nothing to wait for — don't burn the timeout
  const start = nowMs();
  while (nowMs() - start < timeoutMs) {
    if (inArena.length > 0 && inArena.every((c) => phaseOf(c) === 'active')) break;
    await sleep(250);
  }
  return inArena.filter((c) => phaseOf(c) === 'active').length;
}

/** An arena socket that closed while we were still driving it is a DROP. */
function tallyDrops(clients, ledger) {
  for (const ctx of clients) {
    if (ctx.arenaLeft !== null) {
      ledger.drops += 1;
      if (ledger.dropSamples.length < 5) ledger.dropSamples.push({ id: ctx.id, where: 'arena', code: ctx.arenaLeft });
      continue;
    }
    // A queue socket closing once a seat exists is the DESIGNED handover, not a
    // drop — whether or not we got round to consuming it (the surplus pool can
    // legitimately form its own cohort mid-run once queueTimerMs elapses). One
    // that closed with NO seat at all is a real drop.
    if (ctx.queueLeft !== null && !ctx.expectQueueLeave && ctx.seat === null) {
      ledger.drops += 1;
      if (ledger.dropSamples.length < 5) ledger.dropSamples.push({ id: ctx.id, where: 'queue', code: ctx.queueLeft });
    }
  }
}

// --- assertions ----------------------------------------------------------------

function assertions(cfg, ledger, board, activeCount, metrics, inputsSent) {
  const refusedTotal = Object.values(ledger.refused).reduce((a, b) => a + b, 0);
  const out = [];
  const add = (name, pass, detail) => out.push({ name, pass, detail });

  add(
    'every connection accounted for',
    ledger.attempted === ledger.joined + refusedTotal + ledger.errored,
    `attempted=${ledger.attempted} joined=${ledger.joined} refused=${refusedTotal} errored=${ledger.errored}`,
  );
  add('no connection errors', ledger.errored === 0, ledger.errorSamples.join(' | ') || 'none');
  add('no unexplained socket drops', ledger.drops === 0, JSON.stringify(ledger.dropSamples));
  add('every seat boarded', board.boardFailures.length === 0, `seats=${board.seats} boarded=${board.boarded} ${board.boardFailures.join(' | ')}`);
  add('the spike drove a live simulation', activeCount > 0 && inputsSent > 0, `active clients=${activeCount}, inputs sent=${inputsSent}`);
  add('/metrics answered throughout', metrics !== null && metrics.count >= 2, metrics ? `${metrics.count} samples in the measured window` : 'no samples');
  add('tick samples > 0', metrics !== null && metrics.end.tick.samples > 0, metrics ? `samples=${metrics.end.tick.samples}` : 'n/a');

  const p95 = metrics?.peak.tick.p95 ?? Infinity;
  const within = p95 <= cfg.p95Ms;
  if (cfg.enforceP95) {
    add(`tick p95 <= ${cfg.p95Ms}ms (${Math.round((cfg.p95Ms / TICK_BUDGET_MS) * 100)}% of the ${TICK_BUDGET_MS}ms step)`, within, `peak p95=${p95}ms`);
  } else {
    add(`tick p95 (report-only on a ${cfg.mode} tier; --assert to enforce)`, true, `peak p95=${p95}ms vs a ${cfg.p95Ms}ms reference — ${within ? 'within' : 'OVER'}`);
  }
  return out;
}

// --- output --------------------------------------------------------------------

function pad(s, w) {
  const str = String(s);
  return str.length >= w ? str : str + ' '.repeat(w - str.length);
}
function padL(s, w) {
  const str = String(s);
  return str.length >= w ? str : ' '.repeat(w - str.length) + str;
}

function printRows(title, rows) {
  const w = Math.max(...rows.map(([k]) => String(k).length), title.length);
  console.log(`\n${title}`);
  console.log('-'.repeat(w + 26));
  for (const [k, v] of rows) console.log(`${pad(k, w)}  ${padL(v, 22)}`);
}

function resultTable(cfg, ledger, board, activeCount, metrics, inputsSent, elapsedS, soloArenas) {
  const refusedTotal = Object.values(ledger.refused).reduce((a, b) => a + b, 0);
  printRows('CONNECTIONS', [
    ['mode', cfg.mode],
    ['endpoint', cfg.origin],
    ['attempted', ledger.attempted],
    ['joined', ledger.joined],
    ['refused (total)', refusedTotal],
    ['  ...gate (401)', ledger.refused.gate],
    ['  ...protocol version', ledger.refused.pv],
    ['  ...capacity', ledger.refused.capacity],
    ['  ...throttle', ledger.refused.throttle],
    ['  ...network', ledger.refused.network],
    ['  ...other', ledger.refused.other],
    ['errored', ledger.errored],
    ['dropped mid-run', ledger.drops],
    ['queue seats consumed', board.boarded],
    // The ADMITTED solo creates, not the configured count: on a refused run the
    // configured number would report arenas that were never minted.
    ['solo arenas created', soloArenas],
    ['clients in an ACTIVE match', activeCount],
  ]);
  printRows('TRAFFIC', [
    ['input "i" messages sent', inputsSent],
    ['drive window (s)', elapsedS],
    ['send cadence (Hz)', Math.round(1000 / CONFIG.tick.simDtMs)],
  ]);
  const peak = metrics?.peak;
  const end = metrics?.end;
  printRows('SERVER /metrics', [
    ['tick p50 @ peak (ms)', peak ? peak.tick.p50 : 'n/a'],
    ['tick p95 @ peak (ms)', peak ? peak.tick.p95 : 'n/a'],
    ['tick max @ peak (ms)', peak ? peak.tick.max : 'n/a'],
    ['tick p50 @ end (ms)', end ? end.tick.p50 : 'n/a'],
    ['tick p95 @ end (ms)', end ? end.tick.p95 : 'n/a'],
    ['tick max @ end (ms)', end ? end.tick.max : 'n/a'],
    ['tick samples @ end', end ? end.tick.samples : 'n/a'],
    ['rooms @ end', end ? end.rooms : 'n/a'],
    ['players @ end', end ? end.players : 'n/a'],
    ['messages/sec @ end', end ? end.messages.ratePerSec : 'n/a'],
    ['messages total @ end', end ? end.messages.total : 'n/a'],
    ['tick budget (ms)', TICK_BUDGET_MS],
    ['p95 threshold (ms)', `${cfg.p95Ms}${cfg.enforceP95 ? '' : ' (report-only)'}`],
  ]);
}

function printVerdicts(checks) {
  const w = Math.max(...checks.map((c) => c.name.length));
  console.log('\nASSERTIONS');
  console.log('-'.repeat(w + 34));
  for (const c of checks) console.log(`${pad(c.name, w)}  ${pad(c.pass ? 'PASS' : 'FAIL', 6)}  ${c.detail}`);
}

/** perf-gate's own rule: an off-default knob CHANGES the filename, so a variant
 *  run cannot overwrite the record a default run wrote. */
function evidencePath(cfg) {
  const date = new Date().toISOString().slice(0, 10);
  const variant = cfg.custom ? `-n${cfg.clients}x${cfg.solo}-${cfg.seconds}s` : '';
  return path.join(EVIDENCE_DIR, `loadtest-${cfg.mode}${variant}-${date}.json`);
}

function writeEvidence(cfg, payload) {
  const file = evidencePath(cfg);
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return file;
}

// --- main ----------------------------------------------------------------------

async function main() {
  const cfg = resolveProfile();
  const headers = gateHeaders();
  const ledger = makeLedger();
  const startedAt = new Date().toISOString();

  let server = null;
  let clients = [];
  let driver = null;
  let poller = null;
  let leaked = false;

  const teardown = async () => {
    driver?.stop();
    poller?.stop();
    for (const ctx of clients) {
      await leaveQuietly(ctx.arena);
      await leaveQuietly(ctx.queue);
    }
    if (server) leaked = await shutdownServer(server, cfg.port);
  };
  // Ctrl-C must not orphan a booted server on a scratch port.
  const onSignal = () => { void teardown().finally(() => process.exit(130)); };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    console.log(`[loadTest] mode=${cfg.mode} endpoint=${cfg.origin} clients=${cfg.clients} (queue ${cfg.queueClients} + solo ${cfg.solo}) drive=${cfg.seconds}s p95<=${cfg.p95Ms}ms${cfg.enforceP95 ? '' : ' (report-only)'}`);
    if (headers) console.log('[loadTest] staging gate: sending hc_gate cookie (sha256 of HC_STAGING_KEY)');

    if (cfg.mode === 'selfboot') {
      if (await portOpen(cfg.port)) {
        throw new Error(`port ${cfg.port} is already in use — refusing to boot (won't touch a listener we didn't start)`);
      }
      server = bootServer(cfg.port);
      await waitForServer(cfg.port, 20000);
    }

    poller = makeMetricsPoller(cfg, headers);
    const baseline = await poller.poll('baseline');
    if (!baseline) throw new Error(`/metrics unreachable at ${cfg.origin}/metrics — cannot gate on numbers we cannot read`);
    console.log(`[loadTest] baseline /metrics: rooms=${baseline.rooms} players=${baseline.players}`);
    poller.start('run');

    console.log('[loadTest] spike: launching every remaining connection with no stagger...');
    const spikeStart = nowMs();
    clients = await runSpike(cfg, headers, ledger);
    console.log(`[loadTest] spike settled in ${nowMs() - spikeStart}ms: ${ledger.joined}/${ledger.attempted} joined`);

    // Whole cohorts only: the queue seats CAP at a time and holds the surplus.
    const expectedSeats = Math.floor(clients.filter((c) => c.kind === 'queue').length / CAP) * CAP;
    const board = await boardSeats(clients, expectedSeats, 90000);
    console.log(`[loadTest] boarded ${board.boarded} of ${board.seats} seats (expected whole cohorts: ${expectedSeats})`);

    driver = makeInputDriver(clients);
    driver.start();
    const activeCount = await waitForActive(clients, 60000);
    console.log(`[loadTest] ${activeCount} clients in an ACTIVE match; driving inputs for ${cfg.seconds}s...`);

    const windowStart = nowMs();
    await sleep(cfg.seconds * 1000);
    const elapsedS = Math.round((nowMs() - windowStart) / 1000);
    await poller.poll('final');
    driver.stop();

    tallyDrops(clients, ledger);
    const metrics = summarizeMetrics(poller.samples, windowStart);
    const inputsSent = driver.sent;
    const checks = assertions(cfg, ledger, board, activeCount, metrics, inputsSent);
    const soloArenas = clients.filter((c) => c.kind === 'solo' && c.arena).length;

    resultTable(cfg, ledger, board, activeCount, metrics, inputsSent, elapsedS, soloArenas);
    printVerdicts(checks);

    const failed = checks.filter((c) => !c.pass);
    const file = writeEvidence(cfg, {
      story: '7-8', harness: 'server/scripts/loadTest.mjs',
      startedAt, finishedAt: new Date().toISOString(),
      verdict: failed.length === 0 ? 'PASS' : 'FAIL',
      node: process.version, platform: `${process.platform} ${process.arch}`,
      protocolVersion: PROTOCOL_VERSION,
      profile: { ...cfg, stagingCookieSent: Boolean(headers) },
      tickBudgetMs: TICK_BUDGET_MS,
      connections: { ...ledger, boarded: board.boarded, seats: board.seats, boardFailures: board.boardFailures, activeInMatch: activeCount, soloArenas },
      traffic: { inputMessagesSent: inputsSent, cadenceHz: Math.round(1000 / CONFIG.tick.simDtMs), driveSeconds: elapsedS },
      metrics: { peak: metrics?.peak ?? null, end: metrics?.end ?? null, series: poller.samples, pollErrors: poller.errors },
      assertions: checks,
    });

    console.log(`\nevidence: ${file}`);
    if (failed.length > 0) {
      console.error(`\nLOAD TEST FAILED (${failed.length} assertion${failed.length === 1 ? '' : 's'}):`);
      for (const c of failed) console.error(`  - ${c.name}: ${c.detail}`);
      await teardown();
      process.exit(1);
    }
    console.log('\nLOAD TEST OK');
    await teardown();
    process.exit(leaked ? 1 : 0);
  } catch (err) {
    console.error(`\nLOAD TEST FAILED: ${err?.message ?? err}`);
    await teardown();
    process.exit(1);
  }
}

main();
