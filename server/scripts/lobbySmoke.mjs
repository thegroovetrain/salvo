// Private-lobby smoke (cycle 167, Eric rulings 2026-10-02): self-boots the
// colyseus server on PORT 2613 (never the dev server's 2567) WITHOUT
// HC_DEV_OPTIONS — the private door is a production path, so it must work on a
// production-shaped server — and proves the whole lobby -> arena handshake over
// real sockets, which no unit test can reach (two rooms, the matchMaker, an
// HTTP resolve, and a seat reservation):
//
//   0. PV GATE — create('lobby') with no `pv` is refused with "refresh".
//   A. TWO CAPTAINS BY CODE —
//      1. the host creates a lobby and reads its 6-letter code off the schema;
//         a bogus code resolves 404 NO SUCH LOBBY;
//      2. a guest resolves the code typed in LOWERCASE -> roomId, joinById;
//      3. both READY -> countdownEndT > 0; the guest UNREADY -> 0; READY again;
//      4. the countdown fires: both receive MSG.seat; the old code now answers
//         409 MATCH STARTED (the lobby lingers);
//      5. both consume their seats into the SAME arena, which holds exactly
//         the two captains (bot fill off) and shows up in /liveness as a live
//         game in NEITHER operator bucket — the observable trace of
//         mode 'private' (the welcome carries no mode).
//   B. LONE HOST, BOT FILL, SEED, START NOW — bot fill on, seed 'bananas',
//      'lg' ARMS the countdown (countdownEndT > 0, forced === true — Eric
//      2026-10-02: START NOW triggers the countdown, never an instant start;
//      no seat before it elapses) -> a seat ~10 s later -> an arena with 20
//      roster rows (1 + 19 bots) whose
//      mapSeed is hashSeedText(the lobby's seedResolved) and whose resolved
//      text is 'bananas' or 'bananas' + a retry suffix — resolved only at
//      form time (seedResolved is still '' before START NOW).
//
// Run: node server/scripts/lobbySmoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { CONFIG, MSG, PROTOCOL_VERSION, hashSeedText } from '@salvo/shared';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 2613; // free: queue 2603, metrics 2631, 2607/2609/2611 taken
const endpoint = `ws://localhost:${PORT}`;
const http = `http://localhost:${PORT}`;
const CAP = CONFIG.map.playerCap;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- server lifecycle (queueSmoke's pattern) ---------------------------------

function bootServer() {
  const tsx = path.join(REPO, 'node_modules/.bin/tsx');
  return spawn(tsx, ['src/index.ts'], {
    cwd: path.join(REPO, 'server'),
    detached: true, // own process group, so we can kill tsx + its node child
    // NO HC_DEV_OPTIONS: the lobby, the trust ticket and the private arena are
    // production paths and are proven on a production-shaped server.
    env: { ...process.env, NODE_ENV: 'development', PORT: String(PORT), HC_DEV_OPTIONS: '' },
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

async function portOpen(port) {
  return (await portOpenOn(port, '127.0.0.1')) || portOpenOn(port, '::1');
}

async function waitForServer(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await portOpen(PORT)) return;
    await sleep(200);
  }
  throw new Error('server did not open the port in time');
}

function killServer(proc, signal) {
  try {
    process.kill(-proc.pid, signal); // whole group — our own PID only
  } catch {
    // already gone
  }
}

// --- harness -------------------------------------------------------------------

async function waitFor(pred, timeoutMs, label) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(50);
  }
}

async function step(label, ms, fn) {
  process.stderr.write(`[lobbySmoke] ${label}...\n`);
  let timer;
  const line = await Promise.race([
    fn(),
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`step timed out after ${ms}ms: ${label}`)), ms); }),
  ]).finally(() => clearTimeout(timer));
  console.log(`PASS ${label}: ${line}`);
  return line;
}

async function leaveQuietly(room) {
  if (!room) return;
  let timer;
  await Promise.race([
    room.leave().catch(() => undefined),
    new Promise((res) => { timer = setTimeout(res, 1500); }),
  ]).finally(() => clearTimeout(timer));
}

const joinOptions = (name) => ({ name, pv: PROTOCOL_VERSION, cls: 'torpedoBoat', horn: 'standard', gun: 'deckGun' });

/** Wrap a lobby room: capture its seat as soon as it is sent. */
function track(name, client, lobby) {
  const ctx = { name, client, lobby, seat: null, arena: null, welcome: null };
  lobby.onMessage(MSG.seat, (s) => { ctx.seat = s; });
  return ctx;
}

async function createLobby(name) {
  const client = new Client(endpoint);
  const lobby = await client.create('lobby', joinOptions(name));
  return track(name, client, lobby);
}

async function resolve(code) {
  const res = await fetch(`${http}/lobby/resolve?code=${encodeURIComponent(code)}`);
  return { status: res.status, body: await res.json() };
}

/** Consume the seat into the arena, then drop the lobby socket (what the
 *  client does). */
async function board(ctx) {
  ctx.arena = await ctx.client.consumeSeatReservation(ctx.seat);
  ctx.arena.onMessage(MSG.welcome, (w) => { ctx.welcome = w; });
  ctx.arena.onMessage(MSG.frame, () => undefined);
  ctx.arena.onMessage(MSG.results, () => undefined);
  ctx.arena.onMessage(MSG.requeue, () => undefined);
  ctx.arena.onMessage(MSG.ping, (m) => ctx.arena.send(MSG.ping, { n: m.n }));
  await leaveQuietly(ctx.lobby);
}

// --- proofs ----------------------------------------------------------------------

async function provePvGate() {
  const client = new Client(endpoint);
  let rejected = null;
  try {
    await client.create('lobby', { name: 'STALE' });
  } catch (e) {
    rejected = e;
  }
  assert(rejected, "create('lobby') without pv was NOT rejected");
  assert(/refresh/.test(rejected.message ?? ''), `lobby pv rejection lacks "refresh" (got: ${rejected.message})`);
  return `create('lobby') without pv refused: "${rejected.message}"`;
}

async function proveCreateAndJoin(a) {
  await waitFor(() => /^[A-Z]{6}$/.test(a.lobby.state?.code ?? ''), 5000, 'host sees a code');
  const code = a.lobby.state.code;
  assert(a.lobby.state.hostId === a.lobby.sessionId, 'the creator is not host');
  const bogusCode = code === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
  const bogus = await resolve(bogusCode);
  assert(bogus.status === 404 && bogus.body.reason === 'NO SUCH LOBBY', `bogus code answered ${bogus.status} ${JSON.stringify(bogus.body)}`);
  const malformed = await resolve('abc');
  assert(malformed.status === 404 && malformed.body.reason === 'NO SUCH LOBBY', `malformed code answered ${malformed.status}`);
  const ok = await resolve(code.toLowerCase());
  assert(ok.status === 200 && ok.body.roomId === a.lobby.roomId, `lowercase code answered ${ok.status} ${JSON.stringify(ok.body)}`);
  const client = new Client(endpoint);
  const lobby = await client.joinById(ok.body.roomId, joinOptions('BRAVO'));
  const b = track('BRAVO', client, lobby);
  await waitFor(() => a.lobby.state.players.size === 2 && b.lobby.state?.players?.size === 2, 5000, 'both rosters show 2');
  return { b, line: `code ${code}; bogus -> 404 NO SUCH LOBBY; '${code.toLowerCase()}' -> roomId ${ok.body.roomId}; both rosters 2/${CAP}` };
}

async function proveReadyCountdown(a, b) {
  a.lobby.send(MSG.lobbyReady, { ready: true });
  b.lobby.send(MSG.lobbyReady, { ready: true });
  await waitFor(() => a.lobby.state.countdownEndT > 0 && b.lobby.state.countdownEndT > 0, 5000, 'countdown arms');
  const armed = a.lobby.state.countdownEndT - Date.now();
  assert(armed > 0 && armed <= CONFIG.lobby.countdownMs + 1000, `countdown ends ${armed}ms out`);
  b.lobby.send(MSG.lobbyReady, { ready: false });
  await waitFor(() => a.lobby.state.countdownEndT === 0 && b.lobby.state.countdownEndT === 0, 5000, 'unready cancels');
  assert(a.seat === null && b.seat === null, 'a seat arrived although the countdown was cancelled');
  b.lobby.send(MSG.lobbyReady, { ready: true });
  await waitFor(() => a.lobby.state.countdownEndT > 0, 5000, 'countdown re-arms');
  const start = Date.now();
  await waitFor(() => a.seat !== null && b.seat !== null, CONFIG.lobby.countdownMs + 5000, 'both seats');
  return `ready+ready armed ~${Math.round(armed / 1000)}s; unready cleared it; re-ready re-armed; both seats after ${Date.now() - start}ms`;
}

async function proveStartedAndArena(a, b, code) {
  const started = await resolve(code);
  assert(started.status === 409 && started.body.reason === 'MATCH STARTED', `old code during linger answered ${started.status} ${JSON.stringify(started.body)}`);
  await board(a);
  await board(b);
  assert(a.arena.roomId === b.arena.roomId, `captains landed in different arenas (${a.arena.roomId} vs ${b.arena.roomId})`);
  await waitFor(() => a.welcome !== null && b.welcome !== null, 10000, 'welcomes');
  await waitFor(() => a.arena.state?.players?.size === 2, 10000, 'arena roster 2');
  await sleep(500);
  assert(a.arena.state.players.size === 2, `bot fill was OFF but the arena holds ${a.arena.state.players.size} roster rows`);
  // /liveness: a private arena is a live game in neither operator bucket. The
  // route caches for 2 s, so poll until the arena is in it.
  let live = null;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    live = await (await fetch(`${http}/liveness`)).json();
    if (live.liveGames - live.modes.standard.games - live.modes.soloVsAi.games >= 1) break;
    await sleep(500);
  }
  const privateGames = live.liveGames - live.modes.standard.games - live.modes.soloVsAi.games;
  assert(privateGames === 1, `liveness shows ${privateGames} private games (payload ${JSON.stringify(live)})`);
  return `old code -> 409 MATCH STARTED; both in arena ${a.arena.roomId} (2 roster rows, no bots); /liveness liveGames=${live.liveGames} with 1 in neither bucket (mode private)`;
}

async function proveLoneHostBotFill() {
  const h = await createLobby('SOLO');
  try {
    await waitFor(() => /^[A-Z]{6}$/.test(h.lobby.state?.code ?? ''), 5000, 'code');
    h.lobby.send(MSG.lobbyStart); // not eligible yet: dropped
    await sleep(1200);
    assert(h.seat === null, 'a lone host without bot fill was seated by START NOW');
    h.lobby.send(MSG.lobbyBotFill, { on: true });
    h.lobby.send(MSG.lobbySeed, { text: 'bananas' });
    await waitFor(() => h.lobby.state.botFill && h.lobby.state.seedText === 'bananas', 5000, 'seed text shown');
    // The seed is resolved ONCE, at form time (never per keystroke/tick).
    assert(h.lobby.state.seedResolved === '', `seed resolved before the form ('${h.lobby.state.seedResolved}')`);
    const pressed = Date.now();
    h.lobby.send(MSG.lobbyStart);
    await waitFor(() => h.lobby.state.countdownEndT > 0, 5000, 'START NOW arms the countdown');
    assert(h.lobby.state.forced === true, `START NOW armed a countdown that is not forced (forced=${h.lobby.state.forced})`);
    const armed = h.lobby.state.countdownEndT - pressed;
    assert(armed > CONFIG.lobby.countdownMs - 1000 && armed <= CONFIG.lobby.countdownMs + 1000, `START NOW countdown ends ${armed}ms out`);
    await sleep(1500);
    assert(h.seat === null, 'a seat arrived before the START NOW countdown elapsed (instant teleport)');
    await waitFor(() => h.seat !== null && h.lobby.state.seedResolved !== '', CONFIG.lobby.countdownMs + 15000, 'seat + seed resolved at form');
    const seatedAfter = Date.now() - pressed;
    assert(seatedAfter >= CONFIG.lobby.countdownMs - 1000, `seat arrived ${seatedAfter}ms after START NOW (< countdown)`);
    const resolved = h.lobby.state.seedResolved;
    assert(/^bananas\d*$/.test(resolved), `seedResolved '${resolved}' is not bananas[+suffix]`);
    await board(h);
    await waitFor(() => h.welcome !== null, 15000, 'welcome');
    await waitFor(() => h.arena.state?.players?.size === CAP, 15000, `arena roster ${CAP}`);
    const want = hashSeedText(resolved);
    assert(h.arena.state.mapSeed === want, `arena mapSeed ${h.arena.state.mapSeed} != hashSeedText('${resolved}') ${want}`);
    assert(h.welcome.mapSeed === want, `welcome mapSeed ${h.welcome.mapSeed} != ${want}`);
    return `lone host: START NOW dropped without bot fill; bot fill + seed 'bananas' + START NOW armed a forced ~${Math.round(armed / 1000)}s countdown, seat after ${seatedAfter}ms (resolved '${resolved}') -> ${CAP} roster rows (1 + ${CAP - 1} bots), mapSeed ${want} = hashSeedText('${resolved}')`;
  } finally {
    await leaveQuietly(h.arena);
    await leaveQuietly(h.lobby);
  }
}

// --- main ----------------------------------------------------------------------

async function main() {
  assert(!(await portOpen(PORT)), `port ${PORT} is already in use — refusing to boot (won't touch a foreign listener)`);
  const server = bootServer();
  let leaked = false;
  let failed = null;
  const all = [];
  try {
    await waitForServer(20000);
    await step('0 pv gate', 15000, () => provePvGate());
    const a = await createLobby('ALPHA');
    all.push(a);
    let code = '';
    await step('A1 create + resolve + join by code', 20000, async () => {
      const { b, line } = await proveCreateAndJoin(a);
      all.push(b);
      code = a.lobby.state.code;
      return line;
    });
    await step('A2 ready / unready / countdown -> seats', 40000, () => proveReadyCountdown(all[0], all[1]));
    await step('A3 MATCH STARTED + one private arena', 40000, () => proveStartedAndArena(all[0], all[1], code));
    await step('B lone host bot fill + seed + START NOW countdown', 75000, () => proveLoneHostBotFill());
    console.log('LOBBY SMOKE OK');
  } catch (err) {
    failed = err;
  } finally {
    for (const c of all) {
      await leaveQuietly(c.arena);
      await leaveQuietly(c.lobby);
    }
    killServer(server, 'SIGTERM');
    await sleep(600);
    leaked = await portOpen(PORT);
    if (leaked) {
      killServer(server, 'SIGKILL');
      await sleep(600);
      leaked = await portOpen(PORT);
      if (leaked) console.error(`ERROR: port ${PORT} still open after SIGTERM+SIGKILL (leaked listener)`);
    }
  }
  if (failed) {
    console.error('LOBBY SMOKE FAILED:', failed.message);
    process.exit(1);
  }
  process.exit(leaked ? 1 : 0);
}

main().catch((err) => {
  console.error('LOBBY SMOKE FAILED:', err.message);
  process.exit(1);
});
