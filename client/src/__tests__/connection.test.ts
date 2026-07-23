// Story 0.2: the 0.17 SDK's same-Room auto-reconnect is now ENABLED — an
// abnormal close fires onDrop and retries the same room with the reconnection
// token while the server holds the ship through its grace window. connect()
// sets reconnection.enabled + a maxRetries sized to span that window, and rides
// a `pv` (PROTOCOL_VERSION) in the join options for the server's version gate.
import { describe, expect, it, vi } from 'vitest';
import { MSG, PROTOCOL_VERSION } from '@salvo/shared';

interface FakeRoom {
  reconnection: { enabled: boolean; maxRetries: number };
  onMessage: (type: string, cb: (msg: unknown) => void) => void;
  onError: (cb: (code: number, message?: string) => void) => void;
  onLeave: (cb: (code: number) => void) => void;
  leave: () => Promise<void>;
  send: (type: string, msg: unknown) => void;
  sent: Array<{ type: string; msg: unknown }>;
  fire: (type: string, msg: unknown) => void;
  fireLeave: (code: number) => void;
  has: (type: string) => boolean;
}

function fakeRoom(): FakeRoom {
  const handlers = new Map<string, (msg: unknown) => void>();
  const leaveHandlers: Array<(code: number) => void> = [];
  const sent: Array<{ type: string; msg: unknown }> = [];
  return {
    // The SDK's shipping defaults — connect() is expected to (re)assert these.
    reconnection: { enabled: true, maxRetries: 15 },
    onMessage: (type, cb) => void handlers.set(type, cb),
    onError: () => undefined,
    onLeave: (cb) => void leaveHandlers.push(cb),
    leave: () => Promise.resolve(),
    send: (type, msg) => void sent.push({ type, msg }),
    sent,
    fire: (type, msg) => handlers.get(type)?.(msg),
    fireLeave: (code) => leaveHandlers.forEach((cb) => cb(code)),
    has: (type) => handlers.has(type),
  };
}

let room: FakeRoom = fakeRoom();
let lastJoinOpts: Record<string, unknown> | undefined;

vi.mock('@colyseus/sdk', () => ({
  Client: class {
    joinOrCreate(_name: string, opts?: Record<string, unknown>): Promise<FakeRoom> {
      lastJoinOpts = opts;
      return Promise.resolve(room);
    }
  },
}));

import { connect, connectErrorStatus, loadColorPref, RECONNECT_MAX_RETRIES } from '../net/connection';

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

/** Drive connect() to a resolved connection, firing the welcome it awaits. */
async function connectAndWelcome(): Promise<Awaited<ReturnType<typeof connect>>> {
  const pending = connect('tester');
  await vi.waitFor(() => {
    if (!room.has(MSG.welcome)) throw new Error('welcome handler not yet registered');
  });
  room.fire(MSG.welcome, { sessionId: 's', mapSeed: 1, mapRadius: 1, playerCap: 6 });
  return pending;
}

describe('connect', () => {
  it('enables SDK auto-reconnection with a grace-spanning retry budget (story 0.2)', async () => {
    room = fakeRoom();
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
  });

  it('rides the current PROTOCOL_VERSION as `pv` in the join options', async () => {
    room = fakeRoom();
    await connectAndWelcome();
    expect(lastJoinOpts?.pv).toBe(PROTOCOL_VERSION);
  });

  it('rejects immediately when the socket closes during the welcome handshake', async () => {
    room = fakeRoom();
    const pending = connect('tester');
    await vi.waitFor(() => {
      if (!room.has(MSG.welcome)) throw new Error('welcome handler not yet registered');
    });
    room.fireLeave(1006);
    await expect(pending).rejects.toThrow(/closed during the welcome handshake|connection closed/);
  });

  it('echoes the server ping nonce immediately (D1 RTT measurement)', async () => {
    room = fakeRoom();
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
