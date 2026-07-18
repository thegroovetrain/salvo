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
  fire: (type: string, msg: unknown) => void;
  fireLeave: (code: number) => void;
  has: (type: string) => boolean;
}

function fakeRoom(): FakeRoom {
  const handlers = new Map<string, (msg: unknown) => void>();
  const leaveHandlers: Array<(code: number) => void> = [];
  return {
    // The SDK's shipping defaults — connect() is expected to (re)assert these.
    reconnection: { enabled: true, maxRetries: 15 },
    onMessage: (type, cb) => void handlers.set(type, cb),
    onError: () => undefined,
    onLeave: (cb) => void leaveHandlers.push(cb),
    leave: () => Promise.resolve(),
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

import { connect, connectErrorStatus } from '../net/connection';

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
    // Sized to keep retrying across the 60s server grace window (backoff caps at
    // 5s/attempt, so ~15 attempts land inside 60s; a few more cover drop-skew).
    expect(conn.room.reconnection.maxRetries).toBeGreaterThanOrEqual(16);
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
});

describe('connectErrorStatus', () => {
  it('maps the server version-gate rejection to a refresh prompt', () => {
    expect(connectErrorStatus(new Error('version mismatch — please refresh'))).toMatch(/REFRESH/);
    expect(connectErrorStatus(new Error('protocol version mismatch'))).toMatch(/REFRESH/);
  });

  it('keeps the generic server-down hint for other failures', () => {
    expect(connectErrorStatus(new Error('timed out waiting for welcome'))).toMatch(/:2567/);
    expect(connectErrorStatus(undefined)).toMatch(/:2567/);
  });
});
