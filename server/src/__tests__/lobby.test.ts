// PRIVATE LOBBIES (cycle 167, Eric rulings 2026-10-02) — the server half.
//
// The pure policy (lobby.ts) is tested row by row against the spec's I/O
// matrix; then the resolve route's pure resolver; then the real LobbyRoom on
// the bare-room idiom (solo.test.ts / liveness.test.ts), with core's own
// methods injected and the matchMaker stubbed, to pin what the adapter does
// with the policy's verdicts: host-only drops, seed resolution, and the exact
// option bag it hands the arena.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClientState, CloseCode, ErrorCode } from 'colyseus';
import { CONFIG, MSG, MapGenerationError, PROTOCOL_VERSION, hashSeedText } from '@salvo/shared';
import { LobbyPolicy, cleanSeedText, isCodeReserved, mintCode, normalizeCode, releaseCode, reserveCode } from '../rooms/lobby.js';
import { resolveLobby, resolveLobbyCode, type LobbyListing } from '../lobbyResolve.js';
import { LOBBY_STARTED_ERROR, LobbyRoom, matchmakeMethodOf } from '../rooms/LobbyRoom.js';
import { isTrustedTicket, lobbyTicket } from '../rooms/lobbyTicket.js';
import { sanitizeName, sanitizeRoomOptions } from '../rooms/roomOptions.js';
import { resetSoloCreateThrottle } from '../rooms/createThrottle.js';
import type { LobbyState } from '../rooms/schema/LobbyState.js';

// The matchMaker is an ESM namespace (not spy-able in place), so the whole
// object is replaced for this file's module graph: LobbyRoom, formArena and
// lobbyResolve all see these stubs.
const mm = vi.hoisted(() => ({
  query: vi.fn(),
  createRoom: vi.fn(),
  reserveMultipleSeatsFor: vi.fn(),
  buildSeatReservation: vi.fn(),
}));
vi.mock('colyseus', async (importOriginal) => {
  const real = await importOriginal<typeof import('colyseus')>();
  return { ...real, matchMaker: mm };
});
const matchMaker = mm;

const T0 = 1_800_000_000_000;
const COUNT = CONFIG.lobby.countdownMs;

/** A policy with the given captains aboard (ids a, b, c, … in join order). */
function lobby(n: number): LobbyPolicy {
  const p = new LobbyPolicy();
  for (let i = 0; i < n; i += 1) p.onJoin(String.fromCharCode(97 + i), `CAP-${i}`);
  return p;
}

function readyAll(p: LobbyPolicy, now = T0): void {
  for (const id of p.captains.keys()) p.onReady(id, true, now);
}

// --- eligibility + arming ------------------------------------------------------

describe('LobbyPolicy — eligibility (ruling 2)', () => {
  it('1 captain without bot-fill is NOT eligible; 2 captains are; 1 with bot-fill is', () => {
    const p = lobby(1);
    expect(p.startEligible()).toBe(false);
    p.onBotFill('a', true, T0);
    expect(p.startEligible()).toBe(true);
    expect(lobby(2).startEligible()).toBe(true);
    expect(new LobbyPolicy().startEligible()).toBe(false);
  });

  it('all ready + eligible ARMS the countdown at now + countdownMs (10 s)', () => {
    const p = lobby(2);
    p.onReady('a', true, T0);
    expect(p.countdownEndT).toBe(0);
    p.onReady('b', true, T0 + 500);
    expect(p.countdownEndT).toBe(T0 + 500 + COUNT);
    expect(COUNT).toBe(10_000);
  });

  it('all ready but NOT eligible (lone host, bot-fill off) never arms', () => {
    const p = lobby(1);
    p.onReady('a', true, T0);
    expect(p.countdownEndT).toBe(0);
    expect(p.evaluate(T0 + COUNT * 3)).toBe('idle');
  });

  it('turning bot-fill on for an all-ready lone host is a fresh all-ready moment: it arms', () => {
    const p = lobby(1);
    p.onReady('a', true, T0);
    p.onBotFill('a', true, T0 + 1000);
    expect(p.countdownEndT).toBe(T0 + 1000 + COUNT);
  });

  it('a second ready does not EXTEND a running count', () => {
    const p = lobby(2);
    readyAll(p, T0);
    p.onReady('a', true, T0 + 4000);
    expect(p.countdownEndT).toBe(T0 + COUNT);
  });
});

// --- cancel rules --------------------------------------------------------------

describe('LobbyPolicy — what stops the count', () => {
  it('any un-ready cancels it', () => {
    const p = lobby(2);
    readyAll(p);
    p.onReady('b', false, T0 + 4000);
    expect(p.countdownEndT).toBe(0);
    expect(p.evaluate(T0 + COUNT)).toBe('idle');
  });

  it('re-readying after an un-ready starts a FRESH full count', () => {
    const p = lobby(2);
    readyAll(p);
    p.onReady('b', false, T0 + 4000);
    p.onReady('b', true, T0 + 5000);
    expect(p.countdownEndT).toBe(T0 + 5000 + COUNT);
  });

  it('a late join cancels it — the newcomer is not ready (ruling 10)', () => {
    const p = lobby(2);
    readyAll(p);
    const late = p.onJoin('z', 'LATE');
    expect(late.ready).toBe(false);
    expect(p.countdownEndT).toBe(0);
  });

  it('bot-fill OFF that leaves a lone captain ineligible cancels a running count', () => {
    const p = lobby(1);
    p.onBotFill('a', true, T0);
    p.onReady('a', true, T0);
    expect(p.countdownEndT).toBeGreaterThan(0);
    p.onBotFill('a', false, T0 + 2000);
    expect(p.countdownEndT).toBe(0);
  });

  it('bot-fill off with 2 aboard leaves an eligible count alone', () => {
    const p = lobby(2);
    p.onBotFill('a', true, T0);
    readyAll(p);
    p.onBotFill('a', false, T0 + 2000);
    expect(p.countdownEndT).toBe(T0 + COUNT);
  });
});

// --- leaves --------------------------------------------------------------------

describe('LobbyPolicy — a leave is a fresh all-ready moment', () => {
  it('RESTARTS from 10 s when the rest are all ready and still eligible', () => {
    const p = lobby(3);
    readyAll(p);
    p.onLeave('c', T0 + 6000);
    expect(p.countdownEndT).toBe(T0 + 6000 + COUNT);
  });

  it('arms when the one un-ready captain leaves an all-ready eligible remainder', () => {
    const p = lobby(3);
    p.onReady('a', true, T0);
    p.onReady('b', true, T0);
    expect(p.countdownEndT).toBe(0);
    p.onLeave('c', T0 + 1000);
    expect(p.countdownEndT).toBe(T0 + 1000 + COUNT);
  });

  it('STOPS when the leave makes the lobby ineligible (2 -> 1, bot-fill off)', () => {
    const p = lobby(2);
    readyAll(p);
    p.onLeave('b', T0 + 3000);
    expect(p.countdownEndT).toBe(0);
  });

  it('an unknown leave changes nothing', () => {
    const p = lobby(2);
    readyAll(p);
    expect(p.onLeave('nobody', T0 + 3000)).toBe(false);
    expect(p.countdownEndT).toBe(T0 + COUNT);
  });
});

// --- evaluate --------------------------------------------------------------------

describe('LobbyPolicy — evaluate', () => {
  it('idle -> counting -> form at the deadline', () => {
    const p = lobby(2);
    expect(p.evaluate(T0)).toBe('idle');
    readyAll(p);
    expect(p.evaluate(T0 + COUNT - 1)).toBe('counting');
    expect(p.evaluate(T0 + COUNT)).toBe('form');
  });
});

// --- host ------------------------------------------------------------------------

describe('LobbyPolicy — host (ruling 6)', () => {
  it('the creator (first join) is host', () => {
    expect(lobby(3).hostId).toBe('a');
  });

  it('host leaves -> the captain with the LOWEST join sequence takes it', () => {
    const p = lobby(4);
    p.onLeave('b', T0); // a non-host leave: host unchanged
    expect(p.hostId).toBe('a');
    expect(p.onLeave('a', T0)).toBe(true);
    expect(p.hostId).toBe('c'); // c joined before d
  });

  it('the last captain leaving empties the host', () => {
    const p = lobby(1);
    p.onLeave('a', T0);
    expect(p.hostId).toBe('');
  });

  it('a rejoin goes to the back of the line (fresh join sequence)', () => {
    const p = lobby(3);
    p.onLeave('a', T0); // b is host
    p.onJoin('a', 'BACK');
    p.onLeave('b', T0);
    expect(p.hostId).toBe('c');
  });

  it('non-host bot-fill is dropped; force start needs host AND eligibility', () => {
    const p = lobby(1);
    p.onJoin('b', 'B');
    p.onBotFill('b', true, T0);
    expect(p.botFill).toBe(false);
    expect(p.forceStart('b', T0)).toBe(false);
    expect(p.forceStart('a', T0)).toBe(true);
    const solo = lobby(1);
    expect(solo.forceStart('a', T0)).toBe(false); // 2 CAPTAINS OR BOT-FILL REQUIRED
    solo.onBotFill('a', true, T0);
    expect(solo.forceStart('a', T0)).toBe(true);
  });

  it('inJoinOrder is the seat order', () => {
    const p = lobby(3);
    p.onLeave('a', T0);
    p.onJoin('a', 'BACK');
    expect(p.inJoinOrder().map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });
});

// --- seating: lowest free slot, names never move (Eric 2026-10-02) ---------------

describe('LobbyPolicy — slots (lowest free, never moved)', () => {
  const slots = (p: LobbyPolicy): Record<string, number> =>
    Object.fromEntries([...p.captains.values()].map((c) => [c.id, c.slot]));

  it('join A, B, C -> slots 0, 1, 2', () => {
    expect(slots(lobby(3))).toEqual({ a: 0, b: 1, c: 2 });
  });

  it("B leaves, D joins -> D takes B's empty slot 1; A and C never move", () => {
    const p = lobby(3);
    p.onLeave('b', T0);
    expect(slots(p)).toEqual({ a: 0, c: 2 });
    p.onJoin('d', 'D');
    expect(slots(p)).toEqual({ a: 0, c: 2, d: 1 });
  });

  it('A leaves, then E and F join -> E 0, F 3 (earliest empty first)', () => {
    const p = lobby(3);
    p.onLeave('a', T0);
    p.onJoin('e', 'E');
    p.onJoin('f', 'F');
    expect(slots(p)).toEqual({ b: 1, c: 2, e: 0, f: 3 });
    expect(p.inSlotOrder().map((c) => c.id)).toEqual(['e', 'b', 'c', 'f']);
  });

  it('a full lobby fills slots 0..cap-1 exactly once', () => {
    const p = new LobbyPolicy();
    for (let i = 0; i < CONFIG.map.playerCap; i += 1) p.onJoin(`p${i}`, `P${i}`);
    expect([...p.captains.values()].map((c) => c.slot)).toEqual([...Array(CONFIG.map.playerCap).keys()]);
  });

  it('host succession follows joinSeq, not slot', () => {
    const p = lobby(3); // a0 b1 c2
    p.onLeave('b', T0);
    p.onJoin('d', 'D'); // d takes slot 1 but joined last
    p.onLeave('a', T0); // host: c (joinSeq 2) beats d (slot 1, joinSeq 3)
    expect(p.hostId).toBe('c');
    expect(p.inJoinOrder().map((c) => c.id)).toEqual(['c', 'd']);
  });
});

// --- START NOW arms a FORCED countdown (Eric 2026-10-02) -------------------------

describe('LobbyPolicy — START NOW arms a forced countdown', () => {
  it('forced arms: START NOW with nobody ready arms now + 10 s and marks it forced', () => {
    const p = lobby(2);
    expect(p.forceStart('a', T0)).toBe(true);
    expect(p.countdownEndT).toBe(T0 + COUNT);
    expect(p.forced).toBe(true);
    expect(p.evaluate(T0 + COUNT - 1)).toBe('counting');
    expect(p.evaluate(T0 + COUNT)).toBe('form');
  });

  it('forced survives un-ready (regardless of ready status)', () => {
    const p = lobby(2);
    readyAll(p);
    p.forceStart('a', T0 + 1000);
    p.onReady('b', false, T0 + 2000);
    expect(p.countdownEndT).toBe(T0 + COUNT);
    expect(p.forced).toBe(true);
    expect(p.evaluate(T0 + COUNT)).toBe('form');
  });

  it('forced survives a late join — the newcomer rides along', () => {
    const p = lobby(2);
    p.forceStart('a', T0);
    p.onJoin('z', 'LATE');
    expect(p.countdownEndT).toBe(T0 + COUNT);
    expect(p.forced).toBe(true);
    expect(p.evaluate(T0 + COUNT)).toBe('form');
    expect(p.inJoinOrder().map((c) => c.id)).toEqual(['a', 'b', 'z']);
  });

  it('forced survives a leave that keeps the lobby eligible (same end time)', () => {
    const p = lobby(3);
    p.forceStart('a', T0);
    p.onLeave('c', T0 + 4000);
    expect(p.countdownEndT).toBe(T0 + COUNT);
    expect(p.forced).toBe(true);
  });

  it('forced is cancelled by lost eligibility: 2 -> 1 with bot-fill off', () => {
    const p = lobby(2);
    p.forceStart('a', T0);
    p.onLeave('b', T0 + 3000);
    expect(p.countdownEndT).toBe(0);
    expect(p.forced).toBe(false);
    expect(p.evaluate(T0 + COUNT)).toBe('idle');
  });

  it('forced is cancelled by lost eligibility: bot-fill turned off with 1 aboard', () => {
    const p = lobby(1);
    p.onBotFill('a', true, T0);
    expect(p.forceStart('a', T0)).toBe(true);
    p.onBotFill('a', false, T0 + 2000);
    expect(p.countdownEndT).toBe(0);
    expect(p.forced).toBe(false);
  });

  it('all-ready -> START NOW converts the running count to forced (same end time)', () => {
    const p = lobby(2);
    readyAll(p, T0);
    expect(p.forced).toBe(false);
    expect(p.forceStart('a', T0 + 4000)).toBe(true);
    expect(p.countdownEndT).toBe(T0 + COUNT);
    expect(p.forced).toBe(true);
    p.onJoin('z', 'LATE'); // now immune
    expect(p.countdownEndT).toBe(T0 + COUNT);
  });

  it('START NOW during a running forced count is a no-op', () => {
    const p = lobby(2);
    p.forceStart('a', T0);
    expect(p.forceStart('a', T0 + 5000)).toBe(false);
    expect(p.countdownEndT).toBe(T0 + COUNT);
    expect(p.forced).toBe(true);
  });

  it('non-host START NOW is dropped', () => {
    const p = lobby(2);
    expect(p.forceStart('b', T0)).toBe(false);
    expect(p.countdownEndT).toBe(0);
    expect(p.forced).toBe(false);
  });

  it('ineligible START NOW is dropped (lone host, bot-fill off)', () => {
    const p = lobby(1);
    expect(p.forceStart('a', T0)).toBe(false);
    expect(p.countdownEndT).toBe(0);
    expect(p.forced).toBe(false);
  });

  it('a cleared forced count goes back to the all-ready rules (forced resets)', () => {
    const p = lobby(2);
    p.forceStart('a', T0);
    p.onLeave('b', T0 + 1000); // ineligible: cleared
    p.onJoin('c', 'C');
    readyAll(p, T0 + 2000);
    expect(p.forced).toBe(false);
    p.onReady('c', false, T0 + 3000); // an all-ready count cancels on un-ready
    expect(p.countdownEndT).toBe(0);
  });
});

// --- codes ---------------------------------------------------------------------

describe('mintCode / normalizeCode (ruling 5)', () => {
  it('mints 6 letters A–Z', () => {
    let x = 0;
    const rng = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 200; i += 1) expect(mintCode(rng, new Set())).toMatch(/^[A-Z]{6}$/);
    expect(CONFIG.lobby.codeLength).toBe(6);
  });

  it('covers both ends of the alphabet (rng 0 -> A, rng just under 1 -> Z)', () => {
    expect(mintCode(() => 0, new Set())).toBe('AAAAAA');
    expect(mintCode(() => 0.999999, new Set())).toBe('ZZZZZZ');
  });

  it('never returns a taken code', () => {
    const seq = [0, 0, 0, 0, 0, 0, 0.999999, 0, 0, 0, 0, 0];
    let i = 0;
    const rng = () => seq[i++ % seq.length];
    expect(mintCode(rng, new Set(['AAAAAA']))).toBe('ZAAAAA');
  });

  it('throws rather than spinning when every draw is taken', () => {
    expect(() => mintCode(() => 0, new Set(['AAAAAA']))).toThrow(/no free code/);
  });

  it('S3: two creates racing on the SAME taken set and rng still get different codes (in-process reservation)', () => {
    const seeded = () => {
      let x = 7;
      return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    };
    const taken = new Set<string>();
    const first = reserveCode(seeded(), taken);
    const second = reserveCode(seeded(), taken);
    expect(second).not.toBe(first);
    expect(isCodeReserved(first)).toBe(true);
    releaseCode(first);
    releaseCode(second);
    expect(isCodeReserved(first)).toBe(false);
    // Released, the same draw mints it again.
    expect(reserveCode(seeded(), taken)).toBe(first);
    releaseCode(first);
  });

  it('normalizes case and whitespace; anything else is null', () => {
    expect(normalizeCode(' k7xqzm ')).toBeNull(); // a digit is not a code letter
    expect(normalizeCode(' kxqzma ')).toBe('KXQZMA');
    for (const bad of ['', 'ABCDE', 'ABCDEFG', 'ABC DE', 'ÄBCDEF', 42, null, undefined, ['ABCDEF']]) {
      expect(normalizeCode(bad), String(bad)).toBeNull();
    }
  });
});

describe('cleanSeedText', () => {
  it('trims, strips control/format code points, caps at 32 code points', () => {
    expect(cleanSeedText('  bananas  ')).toBe('bananas');
    expect(cleanSeedText('ba\u0000na‮nas')).toBe('bananas');
    expect(cleanSeedText('x'.repeat(40))).toBe('x'.repeat(CONFIG.lobby.seedTextMax));
    expect(cleanSeedText('   ')).toBe('');
    expect(cleanSeedText(5)).toBeNull();
  });
});

// --- the resolve route -----------------------------------------------------------

function listing(code: string, extra: Partial<LobbyListing> = {}, phase = 'open'): LobbyListing {
  return { roomId: `room-${code}`, clients: 1, maxClients: 20, metadata: { code, phase, mode: 'private' }, ...extra };
}

describe('resolveLobby — the join modal rows', () => {
  const rooms = [listing('KXQZMA'), listing('FULLLL', { clients: 20 }), listing('GONEAA', {}, 'started')];

  it('ok: any case resolves to the roomId', () => {
    expect(resolveLobby('kxqzma', rooms)).toEqual({ status: 200, body: { roomId: 'room-KXQZMA' } });
  });

  it('unknown and malformed codes: 404 NO SUCH LOBBY, never a throw', () => {
    for (const bad of ['ZZZZZZ', 'abc', '', 42, null, undefined, { code: 'x' }, ['KXQZMA']]) {
      expect(resolveLobby(bad, rooms), String(bad)).toEqual({ status: 404, body: { reason: 'NO SUCH LOBBY' } });
    }
  });

  it('full: 409 LOBBY FULL', () => {
    expect(resolveLobby('FULLLL', rooms)).toEqual({ status: 409, body: { reason: 'LOBBY FULL' } });
  });

  it('started (lingering): 409 MATCH STARTED, ahead of the full check', () => {
    expect(resolveLobby('GONEAA', rooms)).toEqual({ status: 409, body: { reason: 'MATCH STARTED' } });
    const both = [listing('GONEAA', { clients: 20 }, 'started')];
    expect(resolveLobby('GONEAA', both).body).toEqual({ reason: 'MATCH STARTED' });
  });

  it('a listing with no metadata never matches', () => {
    expect(resolveLobby('KXQZMA', [{ roomId: 'x', clients: 0, maxClients: 20 }]).status).toBe(404);
  });

  it('a failed driver query answers NO SUCH LOBBY rather than a 500', async () => {
    await expect(resolveLobbyCode('KXQZMA', () => Promise.reject(new Error('driver down')))).resolves.toEqual({
      status: 404,
      body: { reason: 'NO SUCH LOBBY' },
    });
    const query = vi.fn(() => Promise.resolve(rooms));
    await expect(resolveLobbyCode('nope', query)).resolves.toMatchObject({ status: 404 });
    expect(query).not.toHaveBeenCalled(); // a malformed code never touches the driver
  });
});

// --- the door -------------------------------------------------------------------

describe('LobbyRoom.onAuth — the third door', () => {
  beforeEach(() => resetSoloCreateThrottle());
  afterEach(() => {
    delete process.env.HC_SOLO_CREATE_LIMIT;
    resetSoloCreateThrottle();
  });

  const ctx = (method: string, ip = '203.0.113.9') => ({
    ip,
    headers: new Headers({ 'x-forwarded-for': ip }),
    req: { url: `http://localhost:2567/matchmake/${method}/lobby` },
  });

  it('runs the PV gate', async () => {
    await expect(LobbyRoom.onAuth('', {}, ctx('create'))).rejects.toThrow(/refresh/);
    await expect(LobbyRoom.onAuth('', { pv: PROTOCOL_VERSION + 1 }, ctx('joinById'))).rejects.toThrow(/refresh/);
    await expect(LobbyRoom.onAuth('', { pv: PROTOCOL_VERSION }, ctx('create'))).resolves.toBe(true);
  });

  it('reads the matchmake method off the request path', () => {
    expect(matchmakeMethodOf(ctx('create'))).toBe('create');
    expect(matchmakeMethodOf(ctx('joinById'))).toBe('joinById');
    expect(matchmakeMethodOf(undefined)).toBeNull();
    expect(matchmakeMethodOf({ ip: undefined, headers: new Headers(), req: { url: 42 } })).toBeNull();
  });

  it('CREATES share the per-IP solo bucket (ruling 8); joins by code never spend it', async () => {
    process.env.HC_SOLO_CREATE_LIMIT = '2';
    const opts = { pv: PROTOCOL_VERSION };
    await expect(LobbyRoom.onAuth('', opts, ctx('create'))).resolves.toBe(true);
    await expect(LobbyRoom.onAuth('', opts, ctx('create'))).resolves.toBe(true);
    for (let i = 0; i < 5; i += 1) await expect(LobbyRoom.onAuth('', opts, ctx('joinById'))).resolves.toBe(true);
    await expect(LobbyRoom.onAuth('', opts, ctx('create'))).rejects.toThrow(/too many matches/);
    // A joinOrCreate would MINT a lobby (the room is private, so it never
    // finds one), so it is metered as a create too.
    await expect(LobbyRoom.onAuth('', opts, ctx('joinOrCreate'))).rejects.toThrow(/too many matches/);
    // Another address has its own bucket.
    await expect(LobbyRoom.onAuth('', opts, ctx('create', '198.51.100.1'))).resolves.toBe(true);
  });
});

// --- the room ---------------------------------------------------------------------

interface FakeClient {
  sessionId: string;
  state: ClientState;
  auth?: unknown;
  send: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
}

interface LobbyHarness {
  state: LobbyState;
  clients: FakeClient[];
  onCreate(): Promise<void>;
  onJoin(client: FakeClient, options?: unknown): void;
  onLeave(client: FakeClient): void;
  setMetadata: ReturnType<typeof vi.fn>;
  setPrivate: ReturnType<typeof vi.fn>;
  lock: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  onDispose(): void;
  generateMapForSeed: (seed: number) => unknown;
  policy: { evaluate: (now: number) => unknown };
  autoDispose: boolean;
}

function fakeClient(id: string): FakeClient {
  return { sessionId: id, state: ClientState.JOINED, send: vi.fn(), error: vi.fn(), leave: vi.fn() };
}

async function lobbyRoom(): Promise<{
  r: LobbyHarness;
  send: (c: FakeClient, type: string, msg?: unknown) => void;
  tick: () => void;
  join: (id: string, options?: Record<string, unknown>) => FakeClient;
  timeouts: Array<{ fn: () => void; ms: number }>;
  /** The host's START NOW, then the clock run past the forced countdown and
   *  the tick that forms (Eric 2026-10-02: START NOW arms the countdown). */
  startNow: (c: FakeClient) => Promise<void>;
}> {
  const handlers = new Map<string, (c: FakeClient, m: unknown) => void>();
  const ticks: Array<() => void> = [];
  const timeouts: Array<{ fn: () => void; ms: number }> = [];
  const r = new LobbyRoom() as unknown as LobbyHarness & Record<string, unknown>;
  r.clients = [];
  r.clock = {
    currentTime: 0,
    setInterval: (fn: () => void) => ticks.push(fn),
    setTimeout: (fn: () => void, ms: number) => timeouts.push({ fn, ms }),
  };
  r.onMessage = (type: string, fn: (c: FakeClient, m: unknown) => void) => handlers.set(type, fn);
  r.setMetadata = vi.fn(() => Promise.resolve());
  r.setPrivate = vi.fn(() => Promise.resolve());
  r.lock = vi.fn(() => Promise.resolve());
  r.disconnect = vi.fn(() => Promise.resolve());
  await r.onCreate();
  return {
    r,
    send: (c, type, msg) => handlers.get(type)?.(c, msg),
    tick: () => {
      for (const fn of ticks) fn();
    },
    join: (id, options = {}) => {
      const c = fakeClient(id);
      r.clients.push(c);
      r.onJoin(c, { pv: PROTOCOL_VERSION, ...options });
      return c;
    },
    timeouts,
    startNow: async (c) => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(T0);
      handlers.get(MSG.lobbyStart)?.(c, undefined);
      now.mockReturnValue(T0 + COUNT);
      for (const fn of ticks) fn();
      await settle();
    },
  };
}

/** Let formArena's awaits settle. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('LobbyRoom — the adapter', () => {
  let created: Array<{ name: string; options: Record<string, unknown> }>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    created = [];
    mm.query.mockReset().mockResolvedValue([]);
    mm.createRoom.mockReset().mockImplementation(async (name: string, options: Record<string, unknown>) => {
      created.push({ name, options });
      return { roomId: 'arena-1', name };
    });
    mm.reserveMultipleSeatsFor.mockReset().mockImplementation(async (_room: unknown, seats: unknown[]) =>
      seats.map(() => true));
    mm.buildSeatReservation.mockReset().mockImplementation((_room: unknown, sessionId: string) => ({ sessionId }));
  });
  afterEach(() => vi.restoreAllMocks());

  it('mints a 6-letter code, goes private, publishes {code, phase, mode}', async () => {
    const { r } = await lobbyRoom();
    expect(r.state.code).toMatch(/^[A-Z]{6}$/);
    expect(r.setPrivate).toHaveBeenCalledWith(true);
    const meta = r.setMetadata.mock.calls.at(-1)?.[0];
    expect(meta).toEqual({ code: r.state.code, phase: 'open', mode: 'private' });
  });

  it('avoids a code a live lobby already holds', async () => {
    mm.query.mockResolvedValue([{ metadata: { code: 'AAAAAA' } }]);
    const spy = vi.spyOn(Math, 'random'); // the code must NOT come from Math.random
    const { r } = await lobbyRoom();
    expect(r.state.code).not.toBe('AAAAAA');
    expect(spy).not.toHaveBeenCalled();
  });

  it('mirrors joins, host, ready and the countdown into the schema', async () => {
    const { r, send, join } = await lobbyRoom();
    const a = join('a', { name: 'ALPHA' });
    const b = join('b', { name: 'BRAVO' });
    expect(r.state.hostId).toBe('a');
    expect([...r.state.players.values()].map((p) => p.name)).toEqual(['ALPHA', 'BRAVO']);
    send(a, MSG.lobbyReady, { ready: true });
    send(b, MSG.lobbyReady, { ready: true });
    expect(r.state.players.get('b')?.ready).toBe(true);
    expect(r.state.countdownEndT).toBeGreaterThan(Date.now());
    send(b, MSG.lobbyReady, { ready: false });
    expect(r.state.countdownEndT).toBe(0);
    send(b, MSG.lobbyReady, { ready: 'yes' }); // non-boolean dropped
    expect(r.state.players.get('b')?.ready).toBe(false);
  });

  it("mirrors each captain's slot; a vacated slot is refilled by the next joiner", async () => {
    const { r, join } = await lobbyRoom();
    join('a');
    const b = join('b');
    join('c');
    r.clients.splice(1, 1);
    r.onLeave(b);
    join('d');
    const seen = Object.fromEntries([...r.state.players.values()].map((p) => [p.id, p.slot]));
    expect(seen).toEqual({ a: 0, c: 2, d: 1 });
  });

  it('non-host control messages are silently dropped', async () => {
    const { r, send, join } = await lobbyRoom();
    join('a');
    const b = join('b');
    send(b, MSG.lobbyBotFill, { on: true });
    send(b, MSG.lobbySeed, { text: 'bananas' });
    send(b, MSG.lobbyStart);
    expect(r.state.botFill).toBe(false);
    expect(r.state.seedText).toBe('');
    expect(r.state.countdownEndT).toBe(0);
    expect(r.state.forced).toBe(false);
    expect(created).toEqual([]);
  });

  it('host leaves -> host passes and the schema says so', async () => {
    const { r, join } = await lobbyRoom();
    const a = join('a');
    join('b');
    join('c');
    r.clients.splice(0, 1);
    r.onLeave(a);
    expect(r.state.hostId).toBe('b');
    expect(r.state.players.has('a')).toBe(false);
  });

  it('seed: shown at once, blank clears it', async () => {
    const { r, send, tick, join } = await lobbyRoom();
    const a = join('a');
    send(a, MSG.lobbySeed, { text: '  bananas  ' });
    expect(r.state.seedText).toBe('bananas');
    send(a, MSG.lobbySeed, { text: '' });
    tick();
    expect(r.state.seedText).toBe('');
    expect(r.state.seedResolved).toBe('');
  });

  it('S1: seed spam never probes the map; the form probes ONCE, with the final text', async () => {
    const { r, send, tick, join, startNow } = await lobbyRoom();
    const gen = vi.fn(() => ({}));
    r.generateMapForSeed = gen;
    const a = join('a');
    join('b');
    for (const text of ['b', 'ba', 'ban', 'bana', 'bananas']) {
      send(a, MSG.lobbySeed, { text });
      tick();
    }
    expect(gen).not.toHaveBeenCalled();
    expect(r.state.seedResolved).toBe('');
    await startNow(a);
    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen).toHaveBeenCalledWith(hashSeedText('bananas'));
    expect(r.state.seedResolved).toBe('bananas');
    expect(created[0].options.mapSeed).toBe(hashSeedText('bananas'));
  });

  it('S1: a MapGenerationError at form time takes the suffix retry (ruling 3)', async () => {
    const { r, send, join, startNow } = await lobbyRoom();
    r.generateMapForSeed = vi.fn((seed: number) => {
      if (seed === hashSeedText('bananas')) throw new MapGenerationError(seed, CONFIG.map.playerCap, 1);
      return {};
    });
    const a = join('a');
    join('b');
    send(a, MSG.lobbySeed, { text: 'bananas' });
    await startNow(a);
    expect(r.state.seedResolved).toBe('bananas0');
    expect(created[0].options.mapSeed).toBe(hashSeedText('bananas0'));
  });

  it('S1: a probe that throws anything else still forms the arena, with NO seed (random map)', async () => {
    const { r, send, join, startNow } = await lobbyRoom();
    r.generateMapForSeed = vi.fn(() => {
      throw new Error('unexpected');
    });
    const a = join('a');
    join('b');
    send(a, MSG.lobbySeed, { text: 'bananas' });
    await startNow(a);
    expect(created).toHaveLength(1);
    expect(created[0].options).not.toHaveProperty('mapSeed');
    expect(r.state.seedResolved).toBe('');
    expect(r.state.seedText).toBe('bananas');
    expect(a.send).toHaveBeenCalledWith(MSG.seat, { sessionId: 'a' });
  });

  it('S1: nothing thrown inside the tick escapes into the clock interval', async () => {
    const { r, tick, join } = await lobbyRoom();
    join('a');
    vi.spyOn(r.policy, 'evaluate').mockImplementation(() => {
      throw new Error('policy bug');
    });
    expect(() => tick()).not.toThrow();
  });

  it('S2: a captain whose join lands AFTER the form is told MATCH STARTED and closed', async () => {
    const { r, send, join, startNow } = await lobbyRoom();
    const a = join('a');
    join('b');
    await startNow(a);
    const late = join('c');
    expect(LOBBY_STARTED_ERROR).toBe('MATCH STARTED');
    expect(late.error).toHaveBeenCalledWith(ErrorCode.MATCHMAKE_UNHANDLED, 'MATCH STARTED');
    expect(late.leave).toHaveBeenCalledWith(CloseCode.WITH_ERROR);
    expect(r.state.players.has('c')).toBe(false);
    expect(late.send).not.toHaveBeenCalled();
  });

  it('S3: a lobby holds its code reserved until it disposes', async () => {
    const { r } = await lobbyRoom();
    const code = r.state.code;
    expect(isCodeReserved(code)).toBe(true);
    r.onDispose();
    expect(isCodeReserved(code)).toBe(false);
  });

  it('S4: a blank callsign is resolved at the lobby door and carried on the seat, so the arena shows the same name', async () => {
    const { r, send, join, startNow } = await lobbyRoom();
    const a = join('a', { name: '   ' });
    join('b', { name: 'BRAVO' });
    expect(r.state.players.get('a')?.name).toBe('CAPTAIN-1');
    await startNow(a);
    const seats = matchMaker.reserveMultipleSeatsFor.mock.calls[0][1] as Array<{ options: Record<string, unknown> }>;
    expect(seats[0].options.name).toBe('CAPTAIN-1');
    expect(seats[1].options.name).toBe('BRAVO');
    // ...and the arena's own sanitizer keeps it verbatim (no CAPTAIN-n re-draw).
    expect(sanitizeName(seats[0].options.name)).toBe('CAPTAIN-1');
  });

  it('a lone host with bot-fill + seed forces a start: the arena bag is trusted and complete', async () => {
    const { r, send, tick, join, timeouts, startNow } = await lobbyRoom();
    const a = join('a', { name: 'ERIC', gun: 'flak' });
    send(a, MSG.lobbyStart); // not eligible yet: dropped
    expect(created).toEqual([]);
    send(a, MSG.lobbyBotFill, { on: true });
    send(a, MSG.lobbySeed, { text: 'bananas' });
    tick();
    await startNow(a);
    const resolvedText = r.state.seedResolved;
    expect(resolvedText).toMatch(/^bananas\d*$/);
    expect(created).toHaveLength(1);
    const { name, options } = created[0];
    expect(name).toBe('arena');
    expect(options).toMatchObject({ expectedCaptains: 1, mode: 'private', botFill: true, mapSeed: hashSeedText(resolvedText) });
    expect(isTrustedTicket(options.lobbyTicket)).toBe(true);
    // ...and the arena's own sanitizer admits every key of it in production.
    const { sanitized, rejectedKeys } = sanitizeRoomOptions(options, false);
    expect(sanitized).toMatchObject({ expectedCaptains: 1, mode: 'private', botFill: true, mapSeed: hashSeedText(resolvedText) });
    expect(rejectedKeys).toEqual([]);
    // The seat went out; the gun rode `auth`, never `options`.
    expect(a.send).toHaveBeenCalledWith(MSG.seat, { sessionId: 'a' });
    const seats = matchMaker.reserveMultipleSeatsFor.mock.calls[0][1] as Array<{ options: Record<string, unknown>; auth: Record<string, unknown> }>;
    expect(seats[0].auth.gun).toBe('flak');
    expect(seats[0].options.gun).toBeUndefined();
    // The code is dead, the room locked, and it lingers before closing.
    expect(r.state.phase).toBe('started');
    expect(r.setMetadata.mock.calls.at(-1)?.[0]).toMatchObject({ phase: 'started' });
    expect(r.lock).toHaveBeenCalled();
    expect(r.autoDispose).toBe(false);
    expect(timeouts.some((t) => t.ms === CONFIG.lobby.startedLingerMs)).toBe(true);
  });

  it('a blank seed sends no mapSeed (the arena rolls a random map)', async () => {
    const { send, join, startNow } = await lobbyRoom();
    const a = join('a');
    join('b');
    await startNow(a);
    expect(created[0].options).not.toHaveProperty('mapSeed');
    expect(created[0].options).toMatchObject({ expectedCaptains: 2, botFill: false, mode: 'private' });
  });

  it('START NOW arms a forced countdown in the schema and forms only when it elapses', async () => {
    const { r, send, tick, join } = await lobbyRoom();
    const a = join('a');
    const b = join('b');
    const now = vi.spyOn(Date, 'now').mockReturnValue(T0);
    send(a, MSG.lobbyStart);
    await settle();
    expect(created).toHaveLength(0);
    expect(r.state.countdownEndT).toBe(T0 + COUNT);
    expect(r.state.forced).toBe(true);
    send(b, MSG.lobbyReady, { ready: true });
    send(b, MSG.lobbyReady, { ready: false }); // regardless of ready status
    join('c'); // a late joiner rides along
    send(a, MSG.lobbyStart); // a second press is a no-op
    expect(r.state.countdownEndT).toBe(T0 + COUNT);
    now.mockReturnValue(T0 + COUNT - 1);
    tick();
    await settle();
    expect(created).toHaveLength(0);
    now.mockReturnValue(T0 + COUNT);
    tick();
    await settle();
    expect(created).toHaveLength(1);
    expect(created[0].options).toMatchObject({ expectedCaptains: 3 });
    expect(r.state.forced).toBe(false);
    expect(r.state.countdownEndT).toBe(0);
  });

  it('the all-ready countdown fires the form on the tick that crosses it', async () => {
    const { send, tick, join } = await lobbyRoom();
    const a = join('a');
    const b = join('b');
    const now = vi.spyOn(Date, 'now').mockReturnValue(T0);
    send(a, MSG.lobbyReady, { ready: true });
    send(b, MSG.lobbyReady, { ready: true });
    now.mockReturnValue(T0 + COUNT - 1);
    tick();
    await settle();
    expect(created).toHaveLength(0);
    now.mockReturnValue(T0 + COUNT);
    tick();
    await settle();
    expect(created).toHaveLength(1);
    expect(a.send).toHaveBeenCalledWith(MSG.seat, { sessionId: 'a' });
    expect(b.send).toHaveBeenCalledWith(MSG.seat, { sessionId: 'b' });
  });

  it('an arena that cannot be created fails every seat and does not linger', async () => {
    mm.createRoom.mockRejectedValue(new Error('boom'));
    const { r, send, join, startNow } = await lobbyRoom();
    const a = join('a');
    join('b');
    await startNow(a);
    expect(a.error).toHaveBeenCalled();
    expect(a.leave).toHaveBeenCalled();
    expect(r.autoDispose).toBe(true);
    // S2: the failed lobby closes itself; no straggler keeps it alive.
    expect(r.disconnect).toHaveBeenCalled();
  });

  it('the ticket never reaches a client', async () => {
    const { send, join, startNow } = await lobbyRoom();
    const a = join('a');
    join('b');
    await startNow(a);
    for (const call of a.send.mock.calls) expect(JSON.stringify(call)).not.toContain(lobbyTicket());
  });
});
