// Story 0.2: the 0.17 SDK's same-Room auto-reconnect is now ENABLED — an
// abnormal close fires onDrop and retries the same room with the reconnection
// token while the server holds the ship through its grace window. connect()
// sets reconnection.enabled + a maxRetries sized to span that window, and rides
// a `pv` (PROTOCOL_VERSION) in the join options for the server's version gate.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HORN_ID, MSG, PROTOCOL_VERSION, REGATTA_HUES } from '@salvo/shared';

interface FakeRoom {
  reconnection: { enabled: boolean; maxRetries: number };
  onMessage: (type: string, cb: (msg: unknown) => void) => void;
  onError: (cb: (code: number, message?: string) => void) => void;
  onLeave: (cb: (code: number) => void) => void;
  leave: () => Promise<void>;
  left: number;
  send: (type: string, msg: unknown) => void;
  sent: Array<{ type: string; msg: unknown }>;
  fire: (type: string, msg: unknown) => void;
  fireError: (code: number, message?: string) => void;
  fireLeave: (code: number) => void;
  has: (type: string) => boolean;
}

function fakeRoom(): FakeRoom {
  const handlers = new Map<string, (msg: unknown) => void>();
  const errorHandlers: Array<(code: number, message?: string) => void> = [];
  const leaveHandlers: Array<(code: number) => void> = [];
  const sent: Array<{ type: string; msg: unknown }> = [];
  const self: FakeRoom = {
    // The SDK's shipping defaults — connect() is expected to (re)assert these on
    // the ARENA room and to leave them untouched on the QUEUE room (Story 6.1).
    reconnection: { enabled: true, maxRetries: 15 },
    onMessage: (type, cb) => void handlers.set(type, cb),
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

vi.mock('@colyseus/sdk', () => ({
  Client: class {
    joinOrCreate(name: string, opts?: Record<string, unknown>): Promise<FakeRoom> {
      lastJoinRoomName = name;
      lastJoinOpts = opts;
      return Promise.resolve(queue);
    }
    consumeSeatReservation(res: unknown): Promise<FakeRoom> {
      lastReservation = res;
      return Promise.resolve(room);
    }
  },
}));

import {
  connect,
  connectErrorStatus,
  ensureColorPref,
  isQueueCancelled,
  loadColorPref,
  loadHornPref,
  HORN_PREF_KEY,
  QueueError,
  RECONNECT_MAX_RETRIES,
  __resetSessionColorPrefForTests,
  type ConnectHooks,
} from '../net/connection';

// Module-level state in connection.ts (`sessionColorPref`) would otherwise leak
// between tests in this file — e.g. the 'connect' tests below already exercise
// `ensureColorPref()` indirectly (connect() now always resolves one), which
// would seed the cache before the dedicated `ensureColorPref` tests further down
// ever run. Reset before EVERY test so each one starts from a clean cache.
beforeEach(() => {
  __resetSessionColorPrefForTests();
  queue = fakeRoom();
  room = fakeRoom();
  lastReservation = undefined;
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

const GRACE_MS = 60_000; // CONFIG.net.reconnectGraceSeconds
const DROP_SKEW_MS = 5_000; // server-side drop-detection slack

/** An ISeatReservation-shaped payload — the client only ever forwards it. */
const SEAT = { room: { roomId: 'arena-1', processId: 'p1' }, sessionId: 'arena-session' };

/** Drive connect() through the queue: wait for the seat handler, hand out the
 *  reservation, then fire the ARENA welcome it awaits. */
async function connectAndWelcome(
  hooks: ConnectHooks = {},
): Promise<Awaited<ReturnType<typeof connect>>> {
  const pending = connect('tester', undefined, hooks);
  await vi.waitFor(() => {
    if (!queue.has(MSG.seat)) throw new Error('seat handler not yet registered');
  });
  queue.fire(MSG.seat, SEAT);
  await vi.waitFor(() => {
    if (!room.has(MSG.welcome)) throw new Error('welcome handler not yet registered');
  });
  room.fire(MSG.welcome, { sessionId: 's', mapSeed: 1, mapRadius: 1, playerCap: 6 });
  return pending;
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
    room.fire(MSG.welcome, { sessionId: 's', mapSeed: 1, mapRadius: 1, playerCap: 6 });
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
      // Well past WELCOME_TIMEOUT_MS (5s) AND past CONFIG.match.queueTimerMs
      // (2:00): a pooled captain waits, and an unarmed pool waits indefinitely.
      await vi.advanceTimersByTimeAsync(180_000);
      expect(settled).toBe(false);
      queue.fire(MSG.seat, SEAT);
      await vi.advanceTimersByTimeAsync(0);
      room.fire(MSG.welcome, { sessionId: 's', mapSeed: 1, mapRadius: 1, playerCap: 6 });
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
    queue.fire(MSG.queueStatus, { n: 2, min: 2, cap: 20, startsInMs: 120_000 });
    expect(seen).toEqual([
      { n: 1, min: 2, cap: 20, startsInMs: null },
      { n: 2, min: 2, cap: 20, startsInMs: 120_000 },
    ]);
    queue.fire(MSG.seat, SEAT);
    await vi.waitFor(() => {
      if (!room.has(MSG.welcome)) throw new Error('welcome handler not yet registered');
    });
    room.fire(MSG.welcome, { sessionId: 's', mapSeed: 1, mapRadius: 1, playerCap: 6 });
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
    // The room the player deliberately left must not be re-reported as a drop:
    // the rejection is the CANCEL, and the copy stays quiet.
    await pending.catch((err) => {
      expect(isQueueCancelled(err)).toBe(true);
      expect(connectErrorStatus(err)).toMatch(/CANCELLED/);
    });
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
      expect(connectErrorStatus(err)).not.toMatch(/:2567/);
      expect(connectErrorStatus(err)).toMatch(/QUEUE CLOSED/);
    });
  });

  it('reports a queue room error the same way', async () => {
    const pending = connect('tester');
    await vi.waitFor(() => {
      if (!queue.has(MSG.seat)) throw new Error('seat handler not yet registered');
    });
    queue.fireError(500, 'queue exploded');
    await pending.catch((err) => expect(connectErrorStatus(err)).toMatch(/QUEUE CLOSED/));
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

describe('connectErrorStatus', () => {
  it('maps the server pv-gate rejection (code 525) to a refresh prompt — even without version text', () => {
    // The SDK surfaces the ServerError(AUTH_FAILED) as MatchMakeError.code = 525;
    // the code alone is authoritative, regardless of the message wording.
    expect(connectErrorStatus(codedError(525, 'onAuth failed'))).toMatch(/REFRESH/);
  });

  it('falls back to the exact "version mismatch" phrase only for a codeless error', () => {
    expect(connectErrorStatus(new Error('version mismatch — please refresh'))).toMatch(/REFRESH/);
  });

  it('does NOT mislabel an unrelated codeless failure that merely contains "version"', () => {
    // A ws protocol error / proxy page can carry "version" without being a stale
    // bundle — the tightened phrase (exact "version mismatch") must not fire.
    expect(connectErrorStatus(new Error('websocket protocol version 13 unsupported'))).toMatch(/:2567/);
  });

  it('does NOT treat a non-525 coded failure as a version rejection', () => {
    // A different MatchMakeError code is a different failure, even if its text
    // happens to say "version mismatch" — the code discriminates first.
    expect(connectErrorStatus(codedError(523, 'version mismatch'))).toMatch(/:2567/);
  });

  it('keeps the generic server-down hint for other failures', () => {
    expect(connectErrorStatus(new Error('timed out waiting for welcome'))).toMatch(/:2567/);
    expect(connectErrorStatus(undefined)).toMatch(/:2567/);
  });
});

describe('loadColorPref — persisted Regatta preference (Story 1.12)', () => {
  const KEY = 'hullcracker.color'; // COLOR_PREF_KEY (connection.ts)

  function withStored(value: string | null): number | undefined {
    if (value === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
    return loadColorPref();
  }

  it('returns undefined for an absent key (no preference written)', () => {
    expect(withStored(null)).toBeUndefined();
  });

  it('returns undefined for an empty / whitespace-only value (NOT the Number("") = 0 trap)', () => {
    // The regression this fix closes: Number('') and Number('   ') both coerce to
    // 0, which would forward a bogus colorPref: 0 for a never-set key.
    expect(withStored('')).toBeUndefined();
    expect(withStored('   ')).toBeUndefined();
  });

  it('accepts a valid in-range wheel index, including the boundaries 0 and 19', () => {
    expect(withStored('7')).toBe(7);
    expect(withStored('0')).toBe(0);
    expect(withStored('19')).toBe(19);
  });

  it('rejects out-of-range / fractional / non-numeric values', () => {
    expect(withStored('20')).toBeUndefined();
    expect(withStored('-1')).toBeUndefined();
    expect(withStored('3.5')).toBeUndefined();
    expect(withStored('x')).toBeUndefined();
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

describe('ensureColorPref — never-null preference resolution (Story 1.14)', () => {
  const KEY = 'hullcracker.color'; // COLOR_PREF_KEY (connection.ts)

  it('rolls and persists a random in-range index when no key is stored', () => {
    localStorage.removeItem(KEY);
    const idx = ensureColorPref();
    expect(Number.isInteger(idx)).toBe(true);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(REGATTA_HUES.length);
    // Persisted immediately — a subsequent loadColorPref() sees the SAME value,
    // and it survives as the stored string format saveColorPref() also uses.
    expect(localStorage.getItem(KEY)).toBe(String(idx));
    expect(loadColorPref()).toBe(idx);
  });

  it('never rerolls a valid stored preference', () => {
    localStorage.setItem(KEY, '7');
    expect(ensureColorPref()).toBe(7);
    // Untouched — still exactly what was stored, not rewritten.
    expect(localStorage.getItem(KEY)).toBe('7');
  });

  it('rerolls and persists a valid index when the stored value is corrupt (garbage string)', () => {
    localStorage.setItem(KEY, 'not-a-number');
    const idx = ensureColorPref();
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(REGATTA_HUES.length);
    expect(localStorage.getItem(KEY)).toBe(String(idx));
  });

  it('rerolls and persists a valid index when the stored value is out of range', () => {
    localStorage.setItem(KEY, '20');
    const idx = ensureColorPref();
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(REGATTA_HUES.length);
    expect(localStorage.getItem(KEY)).toBe(String(idx));
  });

  it('rerolls and persists a valid index when the stored value is empty', () => {
    localStorage.setItem(KEY, '');
    const idx = ensureColorPref();
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(REGATTA_HUES.length);
    expect(localStorage.getItem(KEY)).toBe(String(idx));
  });
});

describe('ensureColorPref — session cache when localStorage.setItem throws (regression)', () => {
  const KEY = 'hullcracker.color';
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  // Simulates blocked/private-mode/quota-exceeded storage: reads still work
  // (the key is simply absent), but persisting a fresh roll always throws.
  beforeEach(() => {
    localStorage.removeItem(KEY);
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError (simulated blocked/private-mode storage)');
    });
  });

  afterEach(() => {
    setItemSpy.mockRestore();
  });

  it('returns the SAME index across two successive calls (no per-call reroll)', () => {
    const first = ensureColorPref();
    const second = ensureColorPref();
    expect(second).toBe(first);
    expect(Number.isInteger(first)).toBe(true);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(REGATTA_HUES.length);
    // Confirms persistence genuinely failed for this scenario — the key never
    // landed in storage, so a plain loadColorPref()-backed fallback (with no
    // session cache) would have had nothing to agree on and would reroll.
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("is the SAME index connect() forwards as `colorPref` in its join options", async () => {
    const idx = ensureColorPref();
    await connectAndWelcome();
    // Before the fix, connect() read loadColorPref() directly (undefined in this
    // throwing-storage environment) and omitted `colorPref` entirely — the
    // server would then assign a hue different from the one ensureColorPref()
    // told the whole home/bay chrome to tint with.
    expect(lastJoinOpts?.colorPref).toBe(idx);
  });
});
