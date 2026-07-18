// The 0.17 SDK auto-reconnects on abnormal closes by default, but the server
// has no reconnection support until story 0.2 — connect() must disable it so a
// dropped socket fails fast into onLeave (DISCONNECTED banner) instead of a
// silent multi-minute retry loop against a server that can never accept it.
import { describe, expect, it, vi } from 'vitest';
import { MSG } from '@salvo/shared';

interface FakeRoom {
  reconnection: { enabled: boolean };
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
    reconnection: { enabled: true }, // the SDK's shipping default
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

vi.mock('@colyseus/sdk', () => ({
  Client: class {
    joinOrCreate(): Promise<FakeRoom> {
      return Promise.resolve(room);
    }
  },
}));

import { connect } from '../net/connection';

describe('connect', () => {
  it('disables SDK auto-reconnection until the server supports resume (story 0.2)', async () => {
    room = fakeRoom();
    const pending = connect('tester');
    await vi.waitFor(() => {
      if (!room.has(MSG.welcome)) throw new Error('welcome handler not yet registered');
    });
    room.fire(MSG.welcome, { sessionId: 's', mapSeed: 1, mapRadius: 1, playerCap: 6 });
    const conn = await pending;
    expect(conn.room.reconnection.enabled).toBe(false);
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
