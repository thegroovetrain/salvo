// PRIVATE LOBBIES — the net layer (cycle 167). A stubbed SDK and fetch drive
// net/lobby.ts through: CREATE (`client.create('lobby', joinOptions)`), JOIN
// (resolve → `joinById`), every refusal (resolve 404/409, a full room's
// `joinById` rejection, a malformed code that never leaves the client), the
// state → `LobbyView` fold, the senders, LEAVE, and the seat → arena hand-off
// through the queue path's own stage 2.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG, MSG, PROTOCOL_VERSION } from '@salvo/shared';

interface FakeRoom {
  sessionId: string;
  state: unknown;
  reconnection: { enabled: boolean; maxRetries: number };
  reconnectionToken: string;
  sent: Array<{ type: string; msg: unknown }>;
  left: number;
  onStateChange: (cb: (s: unknown) => void) => void;
  onMessage: (type: string, cb: (m: unknown) => void) => void;
  onReconnect: (cb: () => void) => void;
  onError: (cb: (code: number, message?: string) => void) => void;
  onLeave: (cb: (code: number) => void) => void;
  leave: () => Promise<void>;
  send: (type: string, msg: unknown) => void;
  fire: (type: string, msg: unknown) => void;
  fireState: (s: unknown) => void;
  fireLeave: (code: number) => void;
  fireError: (code: number, message?: string) => void;
  has: (type: string) => boolean;
}

function fakeRoom(sessionId = 'me'): FakeRoom {
  const handlers = new Map<string, (m: unknown) => void>();
  const stateCbs: Array<(s: unknown) => void> = [];
  const leaveCbs: Array<(c: number) => void> = [];
  const errorCbs: Array<(c: number, m?: string) => void> = [];
  const self: FakeRoom = {
    sessionId,
    state: undefined,
    reconnection: { enabled: false, maxRetries: 0 },
    reconnectionToken: 'r:tok',
    sent: [],
    left: 0,
    onStateChange: (cb) => void stateCbs.push(cb),
    onMessage: (type, cb) => void handlers.set(type, cb),
    onReconnect: () => undefined,
    onError: (cb) => void errorCbs.push(cb),
    onLeave: (cb) => void leaveCbs.push(cb),
    leave: () => {
      self.left++;
      return Promise.resolve();
    },
    send: (type, msg) => void self.sent.push({ type, msg }),
    fire: (type, msg) => handlers.get(type)?.(msg),
    fireState: (s) => stateCbs.forEach((cb) => cb(s)),
    fireLeave: (c) => leaveCbs.forEach((cb) => cb(c)),
    fireError: (c, m) => errorCbs.forEach((cb) => cb(c, m)),
    has: (type) => handlers.has(type),
  };
  return self;
}

let lobbyRoom = fakeRoom();
let arenaRoom = fakeRoom('arena-session');
let created: { name: string; opts: Record<string, unknown> } | null = null;
let joinedById: { id: string; opts: Record<string, unknown> } | null = null;
let joinByIdRejection: unknown = null;
let createRejection: unknown = null;
let consumed: unknown = null;

vi.mock('@colyseus/sdk', () => ({
  Client: class {
    create(name: string, opts: Record<string, unknown>): Promise<FakeRoom> {
      created = { name, opts };
      return createRejection ? Promise.reject(createRejection) : Promise.resolve(lobbyRoom);
    }
    joinById(id: string, opts: Record<string, unknown>): Promise<FakeRoom> {
      joinedById = { id, opts };
      return joinByIdRejection ? Promise.reject(joinByIdRejection) : Promise.resolve(lobbyRoom);
    }
    consumeSeatReservation(res: unknown): Promise<FakeRoom> {
      consumed = res;
      return Promise.resolve(arenaRoom);
    }
  },
}));

import {
  clampSeedText,
  createLobby,
  isWellFormedCode,
  joinByIdRefusal,
  joinLobby,
  leaveLobby,
  lobbyActive,
  lobbyResolveUrl,
  lobbyView,
  makeDeadlineAnchor,
  normalizeCode,
  sendBotFill,
  sendReady,
  sendSeed,
  sendStart,
  type LobbyHooks,
  type LobbyView,
} from '../net/lobby.js';

function hooks(): LobbyHooks & { views: LobbyView[]; calls: string[] } {
  const views: LobbyView[] = [];
  const calls: string[] = [];
  return {
    views,
    calls,
    onLobby: (v) => void views.push(v),
    onSeat: () => void calls.push('seat'),
    onError: (r) => void calls.push(`error:${r}`),
    onLeft: () => void calls.push('left'),
  };
}

function stubFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const f = vi.fn(() =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }),
  );
  vi.stubGlobal('fetch', f);
  return f;
}

const STATE = {
  code: 'QWERTY',
  hostId: 'me',
  seedText: '',
  botFill: false,
  countdownEndT: 0,
  phase: 'open',
  players: new Map([
    ['me', { id: 'me', name: 'NEMO', ready: false }],
    ['b', { id: 'b', name: 'AHAB', ready: true }],
  ]),
};

const SEAT = { room: { roomId: 'arena-1', processId: 'p' }, sessionId: 'arena-session' };

beforeEach(() => {
  lobbyRoom = fakeRoom();
  arenaRoom = fakeRoom('arena-session');
  created = null;
  joinedById = null;
  joinByIdRejection = null;
  createRejection = null;
  consumed = null;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  leaveLobby();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pure helpers', () => {
  it('normalizes a code: uppercase, A–Z only, six at most', () => {
    expect(normalizeCode('k7x-q2m')).toBe('KXQM');
    // More than six letters keeps the LAST six (review C8): a pasted
    // "CODE ABCDEF" is the code, not CODEAB.
    expect(normalizeCode('qwertyuiop')).toBe('TYUIOP');
    expect(normalizeCode('CODE ABCDEF')).toBe('ABCDEF');
    expect(normalizeCode('code: k7x-q2m-abc')).toBe('XQMABC');
    expect(isWellFormedCode('QWERTY')).toBe(true);
    expect(isWellFormedCode('QWERT')).toBe(false);
    expect(isWellFormedCode('QWERT1')).toBe(false);
  });

  it('clamps the seed text: trimmed, at most CONFIG.lobby.seedTextMax', () => {
    expect(clampSeedText('  bananas  ')).toBe('bananas');
    expect(clampSeedText('x'.repeat(50))).toHaveLength(CONFIG.lobby.seedTextMax);
  });

  it('resolves on the same HTTP origin as /liveness', () => {
    expect(lobbyResolveUrl('QWERTY')).toBe('http://localhost:2567/lobby/resolve?code=QWERTY');
  });

  it('maps a joinById rejection: locked → MATCH STARTED, full → LOBBY FULL, gone → NO SUCH LOBBY, else null', () => {
    // A lobby locks only when it forms (review C3) — locked means the match started.
    expect(joinByIdRefusal({ code: 522, message: 'room "x" is locked' })).toBe('MATCH STARTED');
    // A full room fails at the seat reservation (Colyseus SeatReservationError,
    // re-thrown by the matchmake controller as MATCHMAKE_UNHANDLED 523).
    expect(joinByIdRefusal({ code: 523, message: 'x is already full.' })).toBe('LOBBY FULL');
    expect(joinByIdRefusal({ code: 522, message: 'room "x" has been disposed.' })).toBe('NO SUCH LOBBY');
    expect(joinByIdRefusal({ code: 522, message: 'room "x" not found' })).toBe('NO SUCH LOBBY');
    expect(joinByIdRefusal({ code: 525, message: 'version mismatch' })).toBeNull();
    expect(joinByIdRefusal(new Error('socket'))).toBeNull();
  });

  it('anchors STARTS IN at arrival — immune to the client clock', () => {
    let now = 5_000;
    const anchor = makeDeadlineAnchor(() => now);
    expect(anchor(0)).toBeNull();
    // A server instant wildly off this client's clock still counts the full 10 s.
    expect(anchor(99_999_999)).toBe(5_000 + CONFIG.lobby.countdownMs);
    now = 8_000;
    expect(anchor(99_999_999)).toBe(5_000 + CONFIG.lobby.countdownMs); // same arm, same deadline
    expect(anchor(0)).toBeNull(); // cancelled
    expect(anchor(99_999_999)).toBe(8_000 + CONFIG.lobby.countdownMs); // re-armed fresh
  });

  it('folds the schema into a view, roster in join order', () => {
    const v = lobbyView(STATE, 'me', null);
    expect(v).toEqual({
      code: 'QWERTY',
      hostId: 'me',
      mySessionId: 'me',
      seedText: '',
      botFill: false,
      countdownEndT: 0,
      deadlineAt: null,
      players: [
        { id: 'me', name: 'NEMO', ready: false },
        { id: 'b', name: 'AHAB', ready: true },
      ],
      phase: 'open',
    });
  });
});

describe('CREATE', () => {
  it("creates 'lobby' with the queue door's join options and pushes views", async () => {
    const h = hooks();
    const pending = createLobby({ name: 'NEMO', cls: 'battleship', gun: 'flak' }, h);
    await vi.waitFor(() => expect(lobbyRoom.has(MSG.seat)).toBe(true));
    expect(created?.name).toBe('lobby');
    expect(created?.opts).toMatchObject({ pv: PROTOCOL_VERSION, name: 'NEMO', cls: 'battleship', gun: 'flak' });
    lobbyRoom.fireState(STATE);
    expect(h.views.at(-1)?.code).toBe('QWERTY');
    expect(lobbyActive()).toBe(true);
    leaveLobby();
    expect(await pending).toBeNull();
    expect(h.calls).toEqual(['left']);
  });

  it('a refused create (version gate) reports the queue door copy and settles null', async () => {
    createRejection = Object.assign(new Error('version mismatch'), { code: 525 });
    const h = hooks();
    expect(await createLobby({}, h)).toBeNull();
    expect(h.calls).toEqual(['error:VERSION MISMATCH — PLEASE REFRESH THE PAGE']);
  });

  it('the seat hands off to the arena through the queue path stage 2', async () => {
    const h = hooks();
    const pending = createLobby({ name: 'NEMO' }, h);
    await vi.waitFor(() => expect(lobbyRoom.has(MSG.seat)).toBe(true));
    lobbyRoom.fire(MSG.seat, SEAT);
    await vi.waitFor(() => expect(arenaRoom.has(MSG.welcome)).toBe(true));
    expect(consumed).toEqual(SEAT);
    expect(arenaRoom.reconnection.enabled).toBe(true); // outfitted like any arena
    arenaRoom.fire(MSG.welcome, { sessionId: 's', mapSeed: 1, mapRadius: 1, playerCap: 20 });
    const conn = await pending;
    expect(conn?.room).toBe(arenaRoom);
    expect(h.calls).toEqual(['seat']);
    expect(lobbyRoom.left).toBe(1); // the lobby socket is dropped at the seat
    expect(lobbyActive()).toBe(false);
  });

  it('a server-side close or error is the queue door copy, never silent', async () => {
    const h = hooks();
    const pending = createLobby({}, h);
    await vi.waitFor(() => expect(lobbyRoom.has(MSG.seat)).toBe(true));
    lobbyRoom.fireError(4000);
    lobbyRoom.fireLeave(4000);
    expect(await pending).toBeNull();
    expect(h.calls).toEqual(['error:QUEUE CLOSED — PLEASE TRY AGAIN']);
  });

  it('LEAVE settles at once even if the socket never reports its close', async () => {
    lobbyRoom.leave = () => new Promise(() => undefined);
    const h = hooks();
    const pending = createLobby({}, h);
    await vi.waitFor(() => expect(lobbyRoom.has(MSG.seat)).toBe(true));
    leaveLobby();
    expect(await pending).toBeNull();
    expect(h.calls).toEqual(['left']);
  });
});

describe('senders', () => {
  it('send ruling 9 controls on the lobby channels, and nothing once the lobby is gone', async () => {
    const pending = createLobby({}, hooks());
    await vi.waitFor(() => expect(lobbyRoom.has(MSG.seat)).toBe(true));
    sendReady(true);
    sendSeed('  bananas ');
    sendBotFill(true);
    sendStart();
    expect(lobbyRoom.sent).toEqual([
      { type: MSG.lobbyReady, msg: { ready: true } },
      { type: MSG.lobbySeed, msg: { text: 'bananas' } },
      { type: MSG.lobbyBotFill, msg: { on: true } },
      { type: MSG.lobbyStart, msg: {} },
    ]);
    leaveLobby();
    await pending;
    sendReady(false);
    expect(lobbyRoom.sent).toHaveLength(4);
  });
});

describe('JOIN', () => {
  it('resolves the code (any case), then joinById with the join options', async () => {
    const f = stubFetch(200, { roomId: 'room-42' });
    const h = hooks();
    const pending = joinLobby('qwerty', { name: 'NEMO', cls: 'battleship' }, h);
    await vi.waitFor(() => expect(lobbyRoom.has(MSG.seat)).toBe(true));
    expect(f).toHaveBeenCalledWith('http://localhost:2567/lobby/resolve?code=QWERTY', expect.anything());
    expect(joinedById?.id).toBe('room-42');
    expect(joinedById?.opts).toMatchObject({ pv: PROTOCOL_VERSION, name: 'NEMO', cls: 'battleship' });
    leaveLobby();
    expect(await pending).toBeNull();
  });

  it.each([
    [404, 'NO SUCH LOBBY'],
    [409, 'LOBBY FULL'],
    [409, 'MATCH STARTED'],
  ] as const)('a %i %s refusal reaches onError verbatim, with no join', async (status, reason) => {
    stubFetch(status, { reason });
    const h = hooks();
    expect(await joinLobby('QWERTY', {}, h)).toBeNull();
    expect(h.calls).toEqual([`error:${reason}`]);
    expect(joinedById).toBeNull();
  });

  it('a malformed code is refused locally as NO SUCH LOBBY, with no request', async () => {
    const f = stubFetch(200, { roomId: 'x' });
    const h = hooks();
    expect(await joinLobby('QW3', {}, h)).toBeNull();
    expect(h.calls).toEqual(['error:NO SUCH LOBBY']);
    expect(f).not.toHaveBeenCalled();
  });

  it('a joinById that loses the race to a full room reads LOBBY FULL', async () => {
    stubFetch(200, { roomId: 'room-42' });
    joinByIdRejection = Object.assign(new Error('room-42 is already full.'), { code: 523 });
    const h = hooks();
    expect(await joinLobby('QWERTY', {}, h)).toBeNull();
    expect(h.calls).toEqual(['error:LOBBY FULL']);
  });

  it('a joinById that loses the race to the lobby forming reads MATCH STARTED', async () => {
    stubFetch(200, { roomId: 'room-42' });
    joinByIdRejection = Object.assign(new Error('room "room-42" is locked'), { code: 522 });
    const h = hooks();
    expect(await joinLobby('QWERTY', {}, h)).toBeNull();
    expect(h.calls).toEqual(['error:MATCH STARTED']);
  });

  it("the server's late-joiner refusal rejecting the join itself (client.error in onJoin) reads MATCH STARTED", async () => {
    // The SDK's consumeSeatReservation rejects with ServerError(code, message)
    // when the room's ERROR frame beats JOIN_ROOM — the usual shape of the
    // LobbyRoom's refuseLateJoin.
    stubFetch(200, { roomId: 'room-42' });
    joinByIdRejection = Object.assign(new Error('MATCH STARTED'), { code: 523 });
    const h = hooks();
    expect(await joinLobby('QWERTY', {}, h)).toBeNull();
    expect(h.calls).toEqual(['error:MATCH STARTED']);
  });

  it("the server's late-joiner refusal (client.error 'MATCH STARTED', then a leave) reads MATCH STARTED", async () => {
    stubFetch(200, { roomId: 'room-42' });
    const h = hooks();
    const pending = joinLobby('QWERTY', {}, h);
    await vi.waitFor(() => expect(lobbyRoom.has(MSG.seat)).toBe(true));
    lobbyRoom.fireError(4000, 'MATCH STARTED');
    lobbyRoom.fireLeave(4002);
    expect(await pending).toBeNull();
    expect(h.calls).toEqual(['error:MATCH STARTED']);
  });

  it('a version-gate rejection at joinById takes the queue door copy', async () => {
    stubFetch(200, { roomId: 'room-42' });
    joinByIdRejection = Object.assign(new Error('version mismatch'), { code: 525 });
    const h = hooks();
    expect(await joinLobby('QWERTY', {}, h)).toBeNull();
    expect(h.calls).toEqual(['error:VERSION MISMATCH — PLEASE REFRESH THE PAGE']);
  });

  it('an unreachable resolve route is a connection failure, not a refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const h = hooks();
    expect(await joinLobby('QWERTY', {}, h)).toBeNull();
    expect(h.calls).toEqual(['error:CONNECTION FAILED — IS THE SERVER RUNNING ON :2567?']);
  });

  it('a garbled resolve answer is a connection failure, never a guessed refusal', async () => {
    stubFetch(500, { error: 'boom' });
    const h = hooks();
    expect(await joinLobby('QWERTY', {}, h)).toBeNull();
    expect(h.calls).toEqual(['error:CONNECTION FAILED — IS THE SERVER RUNNING ON :2567?']);
  });
});
