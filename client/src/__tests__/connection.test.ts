// Story 0.2: the 0.17 SDK's same-Room auto-reconnect is now ENABLED — an
// abnormal close fires onDrop and retries the same room with the reconnection
// token while the server holds the ship through its grace window. connect()
// sets reconnection.enabled + a maxRetries sized to span that window, and rides
// a `pv` (PROTOCOL_VERSION) in the join options for the server's version gate.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONFIG,
  DEFAULT_HORN_ID,
  DEFAULT_SHIFT,
  SHIFT_IDS,
  SHIP_CLASS_IDS,
  MSG,
  PROTOCOL_VERSION,
  type ShiftId,
} from '@salvo/shared';

interface FakeRoom {
  reconnection: { enabled: boolean; maxRetries: number };
  /** Story 6.7: what the SDK re-assigns on EVERY JOIN_ROOM ack — the value the
   *  client must keep re-persisting, since an in-page resume ROTATES it. */
  reconnectionToken: string;
  onMessage: (type: string, cb: (msg: unknown) => void) => void;
  /** The SDK's reconnect signal — `createSignal()`, so registering is a CALL. */
  onReconnect: (cb: () => void) => void;
  onError: (cb: (code: number, message?: string) => void) => void;
  onLeave: (cb: (code: number) => void) => void;
  leave: () => Promise<void>;
  left: number;
  send: (type: string, msg: unknown) => void;
  sent: Array<{ type: string; msg: unknown }>;
  fire: (type: string, msg: unknown) => void;
  /**
   * A RECONNECT ACK, in the SDK's real order (@colyseus/sdk 0.18.2
   * `build/Room.mjs`): `onReconnect.invoke()` runs its handlers SYNCHRONOUSLY
   * (`:483`, via `EventEmitter.invoke`'s `forEach`) and the rotated token is
   * assigned on the NEXT LINE (`:485`). Modelling that order is the whole point
   * — a handler that reads `reconnectionToken` directly sees the OLD value, and
   * only a continuation scheduled out of it sees the new one.
   */
  fireReconnect: (rotated: string) => void;
  fireError: (code: number, message?: string) => void;
  fireLeave: (code: number) => void;
  has: (type: string) => boolean;
}

function fakeRoom(): FakeRoom {
  const handlers = new Map<string, (msg: unknown) => void>();
  const errorHandlers: Array<(code: number, message?: string) => void> = [];
  const leaveHandlers: Array<(code: number) => void> = [];
  const reconnectHandlers: Array<() => void> = [];
  const sent: Array<{ type: string; msg: unknown }> = [];
  const self: FakeRoom = {
    // The SDK's shipping defaults — connect() is expected to (re)assert these on
    // the ARENA room and to leave them untouched on the QUEUE room (Story 6.1).
    reconnection: { enabled: true, maxRetries: 15 },
    reconnectionToken: 'arena-1:tok-join',
    onMessage: (type, cb) => void handlers.set(type, cb),
    onReconnect: (cb) => void reconnectHandlers.push(cb),
    onError: (cb) => void errorHandlers.push(cb),
    onLeave: (cb) => void leaveHandlers.push(cb),
    leave: () => {
      self.left++;
      return Promise.resolve();
    },
    left: 0,
    send: (type, msg) => void sent.push({ type, msg }),
    sent,
    fire: (type, msg) => handlers.get(type)?.(msg),
    fireReconnect: (rotated) => {
      reconnectHandlers.forEach((cb) => cb()); // invoked BEFORE the rotation...
      self.reconnectionToken = rotated; // ...which lands on the next line.
    },
    fireError: (code, message) => errorHandlers.forEach((cb) => cb(code, message)),
    fireLeave: (code) => leaveHandlers.forEach((cb) => cb(code)),
    has: (type) => handlers.has(type),
  };
  return self;
}

// Story 6.1: connect() is now a TWO-STAGE join — `joinOrCreate('queue')`, wait
// for the seat reservation, then `consumeSeatReservation` into the arena. The
// two fakes are the two rooms.
let queue: FakeRoom = fakeRoom();
let room: FakeRoom = fakeRoom();
let lastJoinRoomName: string | undefined;
let lastJoinOpts: Record<string, unknown> | undefined;
let lastReservation: unknown;
// Story 6.5: the SOLO VS AI door calls `create()`, which is a DIFFERENT SDK
// method from `joinOrCreate()` — create always mints a fresh room, which is
// what makes the solo request unable to land in another captain's match.
let lastCreateRoomName: string | undefined;
let lastCreateOpts: Record<string, unknown> | undefined;
// Story 6.7: the resume door.
let lastReconnectToken: string | undefined;
let reconnectRejection: Error | null = null;

vi.mock('@colyseus/sdk', () => ({
  Client: class {
    joinOrCreate(name: string, opts?: Record<string, unknown>): Promise<FakeRoom> {
      lastJoinRoomName = name;
      lastJoinOpts = opts;
      return Promise.resolve(queue);
    }
    create(name: string, opts?: Record<string, unknown>): Promise<FakeRoom> {
      lastCreateRoomName = name;
      lastCreateOpts = opts;
      return Promise.resolve(room);
    }
    consumeSeatReservation(res: unknown): Promise<FakeRoom> {
      lastReservation = res;
      return Promise.resolve(room);
    }
    // Story 6.7: the refresh-resume door. `reconnectRejection` models the
    // ordinary failures — an expired grace, a disposed room, a redeployed
    // server — all of which the SDK surfaces as a rejected matchmake request.
    reconnect(token: string): Promise<FakeRoom> {
      lastReconnectToken = token;
      if (reconnectRejection) return Promise.reject(reconnectRejection);
      return Promise.resolve(room);
    }
  },
}));

import {
  connect,
  connectErrorStatus,
  joinOptions,
  resumeConnection,
  resumeFailedStatus,
  isQueueCancelled,
  loadHornPref,
  HORN_PREF_KEY,
  QueueError,
  RECONNECT_MAX_RETRIES,
  type ConnectHooks,
} from '../net/connection';
import {
  RESUME_TOKEN_KEY,
  clearResumeToken,
  loadResumeToken,
  saveResumeToken,
} from '../net/resumeToken';

// Reset the fake rooms and captured options before EVERY test.
beforeEach(() => {
  queue = fakeRoom();
  room = fakeRoom();
  lastReservation = undefined;
  lastJoinRoomName = undefined;
  lastJoinOpts = undefined;
  lastCreateRoomName = undefined;
  lastCreateOpts = undefined;
  lastReconnectToken = undefined;
  reconnectRejection = null;
  sessionStorage.clear();
});

/**
 * Reproduce the SDK's reconnection backoff (Room.ts): each attempt waits
 * min(maxDelay, max(minDelay, floor(2^attempt * delay))) with delay=100,
 * minDelay=100, maxDelay=5000. Returns the cumulative wall time (ms) spent
 * across `attempts` retries — the window during which a late-recovering network
 * can still resume the held ship.
 */
function cumulativeBackoffMs(attempts: number): number {
  let total = 0;
  for (let n = 1; n <= attempts; n++) {
    total += Math.min(5000, Math.max(100, Math.floor(Math.pow(2, n) * 100)));
  }
  return total;
}

const GRACE_MS = CONFIG.net.reconnectGraceSeconds * 1000;
const DROP_SKEW_MS = 5_000; // server-side drop-detection slack

/** An ISeatReservation-shaped payload — the client only ever forwards it. */
const SEAT = { room: { roomId: 'arena-1', processId: 'p1' }, sessionId: 'arena-session' };

/** Drive connect() through the queue: wait for the seat handler, hand out the
 *  reservation, then fire the ARENA welcome it awaits. */
async function connectAndWelcome(
  hooks: ConnectHooks = {},
  shift?: ShiftId,
): Promise<Awaited<ReturnType<typeof connect>>> {
  const pending = connect('tester', undefined, hooks, false, shift);
  await vi.waitFor(() => {
    if (!queue.has(MSG.seat)) throw new Error('seat handler not yet registered');
  });
  queue.fire(MSG.seat, SEAT);
  await vi.waitFor(() => {
    if (!room.has(MSG.welcome)) throw new Error('welcome handler not yet registered');
  });
  room.fire(MSG.welcome, { sessionId: 's', mapSeed: 1, fogSeed: 1, mapRadius: 1, playerCap: 6 });
  return pending;
}

/** Let a `queueMicrotask` continuation run. It is queued BEFORE this resolver,
 *  so awaiting this is deterministic rather than a race. */
function flushMicrotasks(): Promise<void> {
  return new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe('connect — the two-stage queue → arena join (Story 6.1)', () => {
  it('joins the QUEUE first and reaches the arena only by consuming the seat', async () => {
    const conn = await connectAndWelcome();
    expect(lastJoinRoomName).toBe('queue');
    // The reservation is forwarded VERBATIM — the client never inspects it.
    expect(lastReservation).toEqual(SEAT);
    // And the Connection describes the ARENA room, so bindRoom/buildGame see
    // exactly what they saw before the queue existed.
    expect(conn.room).toBe(room);
    // The queue socket is dropped once the seat is in hand: the reservation is
    // held by the matchMaker, not the queue room.
    expect(queue.left).toBeGreaterThanOrEqual(1);
  });

  it('does NOT resolve until the ARENA welcome lands (the home must stay up)', async () => {
    let settled = false;
    const pending = connect('tester').then(
      () => void (settled = true),
      () => void (settled = true),
    );
    await vi.waitFor(() => {
      if (!queue.has(MSG.seat)) throw new Error('seat handler not yet registered');
    });
    queue.fire(MSG.seat, SEAT);
    // Seated, but no welcome yet: startGame() hides the home and stops the
    // ambient scene the instant this resolves, so resolving here would drop the
    // player onto a black canvas.
    await vi.waitFor(() => {
      if (!room.has(MSG.welcome)) throw new Error('welcome handler not yet registered');
    });
    expect(settled).toBe(false);
    room.fire(MSG.welcome, { sessionId: 's', mapSeed: 1, fogSeed: 1, mapRadius: 1, playerCap: 6 });
    await pending;
    expect(settled).toBe(true);
  });

  it('never times out the QUEUE wait — only the arena handshake has a deadline', async () => {
    vi.useFakeTimers();
    try {
      let settled = false;
      const pending = connect('tester').then(
        () => void (settled = true),
        () => void (settled = true),
      );
      await vi.advanceTimersByTimeAsync(0); // let the queue join resolve
      // Well past WELCOME_TIMEOUT_MS (5s) AND past CONFIG.match.queueTimerMs:
      // a pooled captain waits, and with bot fill off (Story 10.11) a pool below
      // the arm minimum waits indefinitely.
      await vi.advanceTimersByTimeAsync(180_000);
      expect(settled).toBe(false);
      queue.fire(MSG.seat, SEAT);
      await vi.advanceTimersByTimeAsync(0);
      room.fire(MSG.welcome, { sessionId: 's', mapSeed: 1, fogSeed: 1, mapRadius: 1, playerCap: 6 });
      await pending;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('forwards queue liveness to onQueue and withdraws CANCEL once seated', async () => {
    const seen: unknown[] = [];
    const cancels: Array<(() => void) | null> = [];
    await connectAndWelcome({
      onQueue: (q) => void seen.push(q),
      onQueued: (c) => void cancels.push(c),
    });
    // (the status push has to be fired before the seat to be observed, so this
    // test only asserts the hook wiring; the liveness copy is home.test.ts's)
    expect(cancels).toHaveLength(2);
    expect(typeof cancels[0]).toBe('function'); // handed the canceller when pooled
    expect(cancels[1]).toBeNull(); // withdrawn the moment the wait ends
    expect(seen).toEqual([]);
  });

  it('pushes every queueStatus through onQueue while pooled', async () => {
    const seen: unknown[] = [];
    const pending = connect('tester', undefined, { onQueue: (q) => void seen.push(q) });
    await vi.waitFor(() => {
      if (!queue.has(MSG.queueStatus)) throw new Error('queue handler not yet registered');
    });
    queue.fire(MSG.queueStatus, { n: 1, min: 2, cap: 20, startsInMs: null });
    queue.fire(MSG.queueStatus, { n: 2, min: 2, cap: 20, startsInMs: CONFIG.match.queueTimerMs });
    expect(seen).toEqual([
      { n: 1, min: 2, cap: 20, startsInMs: null },
      { n: 2, min: 2, cap: 20, startsInMs: CONFIG.match.queueTimerMs },
    ]);
    queue.fire(MSG.seat, SEAT);
    await vi.waitFor(() => {
      if (!room.has(MSG.welcome)) throw new Error('welcome handler not yet registered');
    });
    room.fire(MSG.welcome, { sessionId: 's', mapSeed: 1, fogSeed: 1, mapRadius: 1, playerCap: 6 });
    await pending;
  });

  it('CANCEL leaves the queue and rejects as CANCELLED, not as a failure', async () => {
    let cancel: (() => void) | null = null;
    const pending = connect('tester', undefined, {
      onQueued: (c) => {
        if (c) cancel = c;
      },
    });
    await vi.waitFor(() => {
      if (!cancel) throw new Error('canceller not yet handed out');
    });
    (cancel as unknown as () => void)();
    await expect(pending).rejects.toThrow(QueueError);
    // The room the player deliberately left must not be re-reported as a drop.
    // The rejection carries the CANCEL, and since Eric's 2026-08-18 ruling it
    // carries NO STATUS COPY AT ALL: leaving the pool is not a connection
    // outcome, so the caller hands the status line back to the server register
    // instead of writing queue chatter onto it. `connectErrorStatus` therefore
    // must never speak of a cancel — a dead copy string is a dead knob.
    await pending.catch((err) => expect(isQueueCancelled(err)).toBe(true));
    expect(queue.left).toBe(1);
  });

  it('does not mistake the cancel-driven onLeave for a dropped connection', async () => {
    let cancel: (() => void) | null = null;
    const pending = connect('tester', undefined, {
      onQueued: (c) => {
        if (c) cancel = c;
      },
    });
    await vi.waitFor(() => {
      if (!cancel) throw new Error('canceller not yet handed out');
    });
    (cancel as unknown as () => void)();
    queue.fireLeave(4000); // the leave() the cancel itself caused
    await pending.catch((err) => expect(isQueueCancelled(err)).toBe(true));
  });

  it('reports a queue drop as a QUEUE failure, never as ":2567 is down"', async () => {
    const pending = connect('tester');
    await vi.waitFor(() => {
      if (!queue.has(MSG.seat)) throw new Error('seat handler not yet registered');
    });
    queue.fireLeave(1006);
    await pending.catch((err) => {
      expect(isQueueCancelled(err)).toBe(false);
      // The queue join SUCCEEDED, so the server is demonstrably reachable.
      expect(connectErrorStatus(err)).toBe(QUEUE_LINE);
      expect(connectErrorStatus(err)).not.toBe(SERVER_DOWN_LINE);
    });
  });

  it('reports a queue room error the same way', async () => {
    const pending = connect('tester');
    await vi.waitFor(() => {
      if (!queue.has(MSG.seat)) throw new Error('seat handler not yet registered');
    });
    queue.fireError(500, 'queue exploded');
    await pending.catch((err) => expect(connectErrorStatus(err)).toBe(QUEUE_LINE));
  });
});

describe('connect — the SOLO VS AI door (Story 6.5)', () => {
  const SOLO_CLASS = SHIP_CLASS_IDS[SHIP_CLASS_IDS.length - 1];
  /** Drive the solo path: no queue, no seat — straight to the arena welcome. */
  async function connectSolo(
    hooks: ConnectHooks = {},
  ): Promise<Awaited<ReturnType<typeof connect>>> {
    const pending = connect('tester', SOLO_CLASS, hooks, true);
    await vi.waitFor(() => {
      if (!room.has(MSG.welcome)) throw new Error('welcome handler not yet registered');
    });
    room.fire(MSG.welcome, { sessionId: 's', mapSeed: 1, fogSeed: 1, mapRadius: 1, playerCap: 20 });
    return pending;
  }

  it('CREATES a fresh arena — never joinOrCreate, and never the queue room', async () => {
    const conn = await connectSolo();
    expect(lastCreateRoomName).toBe('arena');
    expect(lastCreateOpts?.solo).toBe(true);
    // `create()` is the whole safety argument: it always mints a NEW room, so a
    // solo request can never land in another captain's match. joinOrCreate
    // could, which is why this asserts the method and not just the room name.
    expect(lastJoinRoomName).toBeUndefined();
    expect(conn.room).toBe(room);
    expect(queue.left).toBe(0); // the pool was never entered at all
  });

  it('still rides the PROTOCOL_VERSION gate and the full identity options', async () => {
    await connectSolo();
    expect(lastCreateOpts?.pv).toBe(PROTOCOL_VERSION);
    expect(lastCreateOpts?.cls).toBe(SOLO_CLASS);
    expect(lastCreateOpts?.name).toBe('tester');
    expect(lastCreateOpts?.horn).toBe(DEFAULT_HORN_ID);
    // Story 10.4: the SEAT'S SHIFT rides the solo door exactly as it rides the
    // queue door — the solo arena seats a captain the same way.
    expect(lastCreateOpts?.shift).toBe(DEFAULT_SHIFT);
    expect(lastCreateOpts).not.toHaveProperty('kit'); // Story 10.5: the kit left the join
  });

  it('binds NO queue channel and hands out NO canceller — there is nothing to wait for', async () => {
    const seen: unknown[] = [];
    const cancels: Array<(() => void) | null> = [];
    await connectSolo({ onQueue: (q) => void seen.push(q), onQueued: (c) => void cancels.push(c) });
    // R4 (no lie on screen): `QUEUED n/min · AWAITING A SECOND CAPTAIN` is
    // painted from onQueue, so a solo deploy that never binds the channel makes
    // that line structurally unreachable rather than merely unlikely.
    expect(room.has(MSG.queueStatus)).toBe(false);
    expect(room.has(MSG.seat)).toBe(false);
    expect(seen).toEqual([]);
    expect(cancels).toEqual([]);
  });

  it('sets the same arena reconnect policy as a queued join', async () => {
    const conn = await connectSolo();
    expect(conn.room.reconnection.enabled).toBe(true);
    expect(conn.room.reconnection.maxRetries).toBe(RECONNECT_MAX_RETRIES);
  });

  it('leaves the PLAY path on the queue, byte for byte', async () => {
    await connectAndWelcome();
    expect(lastJoinRoomName).toBe('queue');
    expect(lastCreateRoomName).toBeUndefined(); // create() is the solo door only
    expect(lastJoinOpts?.solo).toBeUndefined(); // and `solo` never rides a queue join
  });
});

describe('connect', () => {
  it('enables SDK auto-reconnection with a grace-spanning retry budget (story 0.2)', async () => {
    const conn = await connectAndWelcome();
    expect(conn.room.reconnection.enabled).toBe(true);
    expect(conn.room.reconnection.maxRetries).toBe(RECONNECT_MAX_RETRIES);
    // Assert the DERIVED property, not a hand-picked margin: the cumulative SDK
    // backoff across RECONNECT_MAX_RETRIES attempts must outlast the 60s server
    // grace plus drop-detection skew, or a late-recovering network gives up
    // while the seat is still held. (Guards the retry count from silent erosion.)
    expect(cumulativeBackoffMs(conn.room.reconnection.maxRetries)).toBeGreaterThanOrEqual(
      GRACE_MS + DROP_SKEW_MS,
    );
    // Story 6.1: the ARENA room ONLY. On the queue room auto-reconnect would
    // re-join a pool the player has already been handed off from (or cancelled
    // out of), so the queue is left on the SDK's own defaults.
    expect(queue.reconnection.maxRetries).toBe(15);
  });

  it('rides the current PROTOCOL_VERSION as `pv` in the join options', async () => {
    await connectAndWelcome();
    expect(lastJoinOpts?.pv).toBe(PROTOCOL_VERSION);
  });

  it("forwards the seat's Shift as `shift` — DEFAULT_SHIFT when the caller names none", async () => {
    await connectAndWelcome();
    // Story 10.4: the Shift is the captain's PICK (the seat's, not the hull's),
    // re-sanitized server-side exactly like `cls`. Always SENT, never omitted.
    expect(lastJoinOpts?.shift).toBe(DEFAULT_SHIFT);
  });

  it('forwards the THREADED Shift pick verbatim (startGame, connect, joinOptions)', async () => {
    const other = SHIFT_IDS.find((id) => id !== DEFAULT_SHIFT) as ShiftId;
    await connectAndWelcome({}, other);
    expect(lastJoinOpts?.shift).toBe(other);
  });

  it('carries no retired seat-gun or color-preference key (Story 10.4)', async () => {
    await connectAndWelcome();
    expect(lastJoinOpts).not.toHaveProperty('gun');
    expect(lastJoinOpts).not.toHaveProperty('colorPref');
  });

  // Story 10.5 (2026-11-05, epic-10 amendment 11): the consumable kit left
  // the join with the kit — no `kit` key is ever sent.
  it('sends no `kit` key (the kit retired)', async () => {
    await connectAndWelcome();
    expect(lastJoinOpts).not.toHaveProperty('kit');
  });

  it('forwards the persisted foghorn variant as `horn` (Story 4.5, amendment 52)', async () => {
    await connectAndWelcome();
    // ALWAYS sent (loadHornPref never returns undefined) and re-sanitized
    // server-side in onJoin, exactly like `cls`. Exactly one horn ships and no
    // UI writes the key — a second horn is CONTENT and needs an Eric ruling.
    expect(lastJoinOpts?.horn).toBe(DEFAULT_HORN_ID);
  });

  it('rejects immediately when the socket closes during the welcome handshake', async () => {
    const pending = connect('tester');
    await vi.waitFor(() => {
      if (!queue.has(MSG.seat)) throw new Error('seat handler not yet registered');
    });
    queue.fire(MSG.seat, SEAT);
    await vi.waitFor(() => {
      if (!room.has(MSG.welcome)) throw new Error('welcome handler not yet registered');
    });
    room.fireLeave(1006);
    await expect(pending).rejects.toThrow(/closed during the welcome handshake|connection closed/);
  });

  it('echoes the server ping nonce immediately (D1 RTT measurement)', async () => {
    await connectAndWelcome();
    // The ping handler is registered pre-welcome (alongside the frame handler).
    expect(room.has(MSG.ping)).toBe(true);
    room.fire(MSG.ping, { n: 7, t: 123456 });
    // Echoes back ONLY the nonce on the same channel — no server send time, no state.
    expect(room.sent).toEqual([{ type: MSG.ping, msg: { n: 7 } }]);
    room.fire(MSG.ping, { n: 8, t: 123556 });
    expect(room.sent[1]).toEqual({ type: MSG.ping, msg: { n: 8 } });
  });
});

/** A MatchMakeError-shaped error: an Error carrying a numeric `.code`. */
function codedError(code: number, message: string): Error {
  const e = new Error(message);
  (e as unknown as { code: number }).code = code;
  return e;
}

// The three status lines connectErrorStatus can paint, named by the input that
// selects each — so the tests pin which failure maps to which line, never the copy.
const VERSION_LINE = connectErrorStatus(codedError(525, 'onAuth failed'));
const SERVER_DOWN_LINE = connectErrorStatus(undefined);
const QUEUE_LINE = connectErrorStatus(new QueueError('queue closed'));

describe('connectErrorStatus', () => {
  it('maps the server pv-gate rejection (code 525) to the refresh line — even without version text', () => {
    // The SDK surfaces the ServerError(AUTH_FAILED) as MatchMakeError.code = 525;
    // the code alone is authoritative, regardless of the message wording. The
    // refresh line is PRESENT and distinct from the server-down hint.
    expect(VERSION_LINE.length).toBeGreaterThan(0);
    expect(VERSION_LINE).not.toBe(SERVER_DOWN_LINE);
    expect(VERSION_LINE).not.toBe(QUEUE_LINE);
  });

  it('falls back to the exact "version mismatch" phrase only for a codeless error', () => {
    expect(connectErrorStatus(new Error('version mismatch — please refresh'))).toBe(VERSION_LINE);
  });

  it('does NOT mislabel an unrelated codeless failure that merely contains "version"', () => {
    // A ws protocol error / proxy page can carry "version" without being a stale
    // bundle — the tightened phrase (exact "version mismatch") must not fire.
    expect(connectErrorStatus(new Error('websocket protocol version 13 unsupported'))).toBe(SERVER_DOWN_LINE);
  });

  it('does NOT treat a non-525 coded failure as a version rejection', () => {
    // A different MatchMakeError code is a different failure, even if its text
    // happens to say "version mismatch" — the code discriminates first.
    expect(connectErrorStatus(codedError(523, 'version mismatch'))).toBe(SERVER_DOWN_LINE);
  });

  it('keeps the generic server-down hint for other failures', () => {
    expect(SERVER_DOWN_LINE.length).toBeGreaterThan(0);
    expect(connectErrorStatus(new Error('timed out waiting for welcome'))).toBe(SERVER_DOWN_LINE);
  });
});

describe('loadHornPref — the persisted foghorn variant (Story 4.5, amendment 52)', () => {
  afterEach(() => localStorage.removeItem(HORN_PREF_KEY));

  it('FAILS OPEN to the default horn for an absent key — the shipped case', () => {
    // No UI writes this key: exactly one horn ships, and adding variants is
    // CONTENT that needs an Eric ruling. The seam is plumbed, not surfaced.
    localStorage.removeItem(HORN_PREF_KEY);
    expect(loadHornPref()).toBe(DEFAULT_HORN_ID);
  });

  it('FAILS OPEN for a corrupt, empty, or unknown id — never silence, never a throw', () => {
    for (const junk of ['', '   ', 'not-a-horn', '42', '[]']) {
      localStorage.setItem(HORN_PREF_KEY, junk);
      expect(loadHornPref()).toBe(DEFAULT_HORN_ID);
    }
  });

  it('returns a valid stored id unchanged', () => {
    localStorage.setItem(HORN_PREF_KEY, DEFAULT_HORN_ID);
    expect(loadHornPref()).toBe(DEFAULT_HORN_ID);
  });

  it('survives storage that throws (blocked / private-mode localStorage)', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadHornPref()).toBe(DEFAULT_HORN_ID);
    spy.mockRestore();
  });
});

describe('joinOptions — the seat payload (Story 10.4)', () => {
  it('defaults the Shift to DEFAULT_SHIFT and carries neither `gun` nor `colorPref`', () => {
    const opts = joinOptions('tester', SHIP_CLASS_IDS[0]);
    expect(opts.shift).toBe(DEFAULT_SHIFT);
    expect(opts).not.toHaveProperty('gun');
    expect(opts).not.toHaveProperty('colorPref');
  });

  it('carries every Shift id it is handed, verbatim', () => {
    for (const id of SHIFT_IDS) expect(joinOptions('tester', SHIP_CLASS_IDS[0], id).shift, id).toBe(id);
  });
});

// --- Story 6.7: THE RESUME TOKEN ---------------------------------------------
//
// A refresh used to lose the match outright, because `room.reconnectionToken`
// lives on the Room object and dies with the tab's JS heap. `sessionStorage` was
// used NOWHERE in `client/src` before this story.

describe('the resume token store (net/resumeToken.ts)', () => {
  it('round-trips a well-formed `roomId:token` through sessionStorage', () => {
    saveResumeToken('arena-1:abc');
    expect(sessionStorage.getItem(RESUME_TOKEN_KEY)).toBe('arena-1:abc');
    expect(loadResumeToken()).toBe('arena-1:abc');
    clearResumeToken();
    expect(loadResumeToken()).toBeNull();
    expect(sessionStorage.getItem(RESUME_TOKEN_KEY)).toBeNull();
  });

  it('reads a MALFORMED stored value as absent rather than handing it to the SDK', () => {
    // `Client.reconnect()` splits on ':' and THROWS on anything that is not
    // `roomId:token` (@colyseus/sdk 0.18.2 build/Client.mjs:131-134), so a corrupt key
    // must land on the home screen, never as an exception on the boot path.
    for (const junk of ['', 'no-colon', ':', 'roomonly:', ':tokenonly']) {
      sessionStorage.setItem(RESUME_TOKEN_KEY, junk);
      expect(loadResumeToken()).toBeNull();
    }
  });

  it('never persists something reconnect() would throw on', () => {
    saveResumeToken('no-colon');
    expect(sessionStorage.getItem(RESUME_TOKEN_KEY)).toBeNull();
  });
});

describe('connect — persisting the reconnection token (Story 6.7)', () => {
  it('persists the token so a page refresh has something to resume with', async () => {
    expect(sessionStorage.getItem(RESUME_TOKEN_KEY)).toBeNull();
    await connectAndWelcome();
    expect(loadResumeToken()).toBe('arena-1:tok-join');
  });

  it('RE-WRITES the token on every ack, not once at connect (ruling R9)', async () => {
    await connectAndWelcome();
    expect(loadResumeToken()).toBe('arena-1:tok-join');
    // An in-page resume ROTATES the token server-side: the SDK re-assigns
    // `room.reconnectionToken` on EVERY JOIN_ROOM ack, reconnects included. A
    // write-once client would carry the DEAD pre-resume token into the next
    // refresh and fast-fail deterministically on a session that was fully
    // entitled to resume — the half-resume double fault R9 names.
    room.reconnectionToken = 'arena-1:tok-rotated';
    room.fire(MSG.frame, { t: 1, tick: 1, ackSeq: 0, contacts: [], mines: [] });
    expect(loadResumeToken()).toBe('arena-1:tok-rotated');
  });

  it('the frame channel alone still refreshes it, with no resume signal fired at all', async () => {
    await connectAndWelcome();
    room.reconnectionToken = 'arena-1:tok-rotated';
    expect(loadResumeToken()).toBe('arena-1:tok-join'); // nothing has acked yet
    room.fire(MSG.frame, { t: 2, tick: 2, ackSeq: 0, contacts: [], mines: [] });
    expect(loadResumeToken()).toBe('arena-1:tok-rotated');
  });

  it('re-writes the ROTATED token ON THE RESUME ACK, not on the first frame after it', async () => {
    // THE WINDOW THIS CLOSES. Frames are one tick apart (50ms), so a
    // frame-driven write left `sessionStorage` holding the PRE-ROTATION token
    // for a whole tick after a successful in-page resume — and a second drop or
    // a refresh inside it fast-fails on a dead token, which is the half-resume
    // double fault R9 exists to prevent.
    //
    // Verified against @colyseus/sdk 0.18.2 `build/Room.mjs`: the JOIN_ROOM
    // handler calls `onReconnect.invoke()` (`:483`) and assigns the rotated
    // token on the NEXT LINE (`:485`), both synchronous. So the handler itself
    // must NOT read the token — a microtask scheduled out of it must.
    await connectAndWelcome();
    let insideHandler: string | null = null;
    room.onReconnect(() => void (insideHandler = loadResumeToken()));
    room.fireReconnect('arena-1:tok-rotated');
    expect(insideHandler).toBe('arena-1:tok-join'); // the OLD value, as the SDK dictates
    await flushMicrotasks();
    expect(loadResumeToken()).toBe('arena-1:tok-rotated');
    // ...and no frame was involved: the belt-and-braces path never ran.
    expect(room.sent.length).toBe(0);
  });

  it('clears the token when the welcome handshake fails — a half-open room is not resumable', async () => {
    const pending = connect('tester');
    await vi.waitFor(() => {
      if (!queue.has(MSG.seat)) throw new Error('seat handler not yet registered');
    });
    queue.fire(MSG.seat, SEAT);
    await vi.waitFor(() => {
      if (!room.has(MSG.welcome)) throw new Error('welcome handler not yet registered');
    });
    expect(loadResumeToken()).toBe('arena-1:tok-join'); // the join ack persisted it
    room.fireError(500, 'boom');
    await expect(pending).rejects.toThrow();
    expect(loadResumeToken()).toBeNull();
  });
});

describe('resumeConnection — the refresh resume (Story 6.7)', () => {
  it('resolves NULL without touching the network when nothing is stored', async () => {
    expect(await resumeConnection()).toBeNull();
    expect(lastReconnectToken).toBeUndefined(); // no matchmake request at all
  });

  it('resolves NULL on a malformed stored token, without asking the SDK to throw', async () => {
    sessionStorage.setItem(RESUME_TOKEN_KEY, 'garbage');
    expect(await resumeConnection()).toBeNull();
    expect(lastReconnectToken).toBeUndefined();
  });

  it('reconnects on the stored token and CONSUMES the re-sent welcome', async () => {
    saveResumeToken('arena-1:stored');
    const pending = resumeConnection();
    await vi.waitFor(() => {
      if (!room.has(MSG.welcome)) throw new Error('welcome handler not yet registered');
    });
    room.fire(MSG.welcome, { sessionId: 's', mapSeed: 1, fogSeed: 1, mapRadius: 1, playerCap: 6 });
    const conn = await pending;
    expect(lastReconnectToken).toBe('arena-1:stored');
    // The welcome is consumed HERE, before any Game exists: `welcome.sessionId`
    // feeds createGameState, which is NOT idempotent, so it must never be fed
    // into a live Game.
    expect(conn?.welcome.sessionId).toBe('s');
    expect(conn?.room).toBe(room);
    // ...and the resumed room gets the SAME reconnect policy an ordinary join
    // does, or the next in-page drop would run on the SDK's own defaults.
    expect(conn?.room.reconnection.enabled).toBe(true);
    expect(conn?.room.reconnection.maxRetries).toBe(RECONNECT_MAX_RETRIES);
    // ...and the resume's own ack re-persisted the token it came back with.
    expect(loadResumeToken()).toBe('arena-1:tok-join');
  });

  it('CLEARS a stale token and rejects, so the next reload cannot loop on it', async () => {
    saveResumeToken('arena-1:expired');
    reconnectRejection = new Error('reconnection token invalid or expired');
    await expect(resumeConnection()).rejects.toThrow(/invalid or expired/);
    expect(loadResumeToken()).toBeNull();
  });

  it('CLEARS the token when the resumed room never sends a welcome', async () => {
    saveResumeToken('arena-1:stored');
    const pending = resumeConnection();
    await vi.waitFor(() => {
      if (!room.has(MSG.welcome)) throw new Error('welcome handler not yet registered');
    });
    room.fireLeave(1006);
    await expect(pending).rejects.toThrow();
    expect(loadResumeToken()).toBeNull();
  });

  it('captures a `results` that lands BEFORE the welcome — the resume ordering', async () => {
    // Core awaits the reconnection deferred's resolve before calling
    // `onReconnect`, so ArenaRoom's `lastResults` re-send goes out FIRST and the
    // welcome second. `results` is a ONE-SHOT with no next tick to say it again,
    // so a resume into the results window would otherwise never open the final
    // table at all. bindRoom replays whatever this holder caught.
    saveResumeToken('arena-1:stored');
    const pending = resumeConnection();
    await vi.waitFor(() => {
      if (!room.has(MSG.results)) throw new Error('results handler not yet registered');
    });
    room.fire(MSG.results, { rows: [], winnerId: 'w' });
    room.fire(MSG.welcome, { sessionId: 's', mapSeed: 1, fogSeed: 1, mapRadius: 1, playerCap: 6 });
    const conn = await pending;
    expect(conn?.early.results).toEqual({ rows: [], winnerId: 'w' });
    expect(conn?.early.bound).toBe(false); // bindRoom has not attached yet
  });

  it('a failed resume paints a non-empty info-tone line for the home status, never a dead screen', () => {
    const line = resumeFailedStatus();
    expect(line.text.length).toBeGreaterThan(0);
    expect(line.tone).toBe('info'); // an expired grace is ordinary, not a refusal
  });
});
