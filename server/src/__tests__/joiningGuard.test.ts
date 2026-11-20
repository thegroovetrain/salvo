// Story 0.3 (JOINING-client hardening) — the unit-level regression coverage the
// deferred-work triage found missing. Two adapter-side guards protect the room
// from a client that holds a roster slot without completing its JOIN_ROOM ack:
//   - afterStep() frame guard: per-tick sends skip any client not fully JOINED
//     (initial handshake AND the reconnect-ack window), so nothing enqueues into
//     an unbounded transport buffer for a client that may never confirm.
//   - kickIfStillJoining: the JOINING-deadline fire decides at fire-time — a
//     client still JOINING gets a punitive WITH_ERROR (4002) close; one that
//     reached JOINED is untouchable.
//
// Harness mirrors reconnect.test.ts: a bare `new ArenaRoom()` never runs
// @colyseus/core's __init(), so `clients`/`state`/`world`/`match`/`log` stay
// plain properties we inject directly, fake clients are plain literals with
// vi.fn() spies, and the private methods are reached through a structural cast.

import { describe, it, expect, vi } from 'vitest';
import { MSG, type FrameMsg } from '@salvo/shared';
import { ClientState, CloseCode } from 'colyseus';
import { World } from '../game/world.js';
import { clearWater } from './rainFixture.js';
import { ArenaRoom } from '../rooms/ArenaRoom.js';

interface FakeClient {
  sessionId: string;
  state: ClientState;
  send: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
}

/** A plain-literal Colyseus client stand-in: id + join-state + spied send/leave. */
function fakeClient(sessionId: string, state: ClientState): FakeClient {
  return { sessionId, state, send: vi.fn(), leave: vi.fn() };
}

interface BareRoom {
  world: World;
  match: unknown;
  state: { players: Map<string, unknown> };
  clients: FakeClient[];
  log: { warn: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
  afterStep(): void;
  kickIfStillJoining(client: FakeClient): void;
}

/**
 * A bare room with just enough injected state for afterStep()/kickIfStillJoining
 * to run without transport: a real World (with ships for each client so
 * buildFrame's perception path is exercised), a null match (afterStep's phase
 * defaults to 'waiting', syncMatch early-returns), a plain roster, the client
 * list, and a spied logger.
 */
function bareRoom(clients: FakeClient[]): BareRoom {
  const w = new World(1);
  w.map.islands.length = 0;
  const players = new Map<string, unknown>();
  for (const c of clients) {
    w.addShip(c.sessionId, c.sessionId.toUpperCase(), undefined, undefined, undefined, undefined);
    players.set(c.sessionId, {});
  }
  const room = new ArenaRoom() as unknown as BareRoom;
  room.world = w;
  room.match = null;
  room.state = { players };
  room.clients = clients;
  room.log = { warn: vi.fn(), info: vi.fn() };
  return room;
}

// --- afterStep() JOINED frame guard ------------------------------------------

describe('ArenaRoom.afterStep JOINED frame guard', () => {
  it('never sends to a JOINING client while a JOINED peer still gets MSG.frame', () => {
    const joining = fakeClient('joining', ClientState.JOINING);
    const joined = fakeClient('joined', ClientState.JOINED);
    const room = bareRoom([joining, joined]);

    room.afterStep();

    expect(joining.send).not.toHaveBeenCalled();
    expect(joined.send).toHaveBeenCalledTimes(1);
    expect(joined.send.mock.calls[0][0]).toBe(MSG.frame);
  });

  it('delivers frames once the same client flips JOINING -> JOINED', () => {
    const client = fakeClient('c', ClientState.JOINING);
    const room = bareRoom([client]);

    room.afterStep();
    expect(client.send).not.toHaveBeenCalled();

    client.state = ClientState.JOINED;
    room.afterStep();
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send.mock.calls[0][0]).toBe(MSG.frame);
  });
});

// --- the crate channel's keyframe (sent on change, Eric 2026-11-20) ------------

describe('ArenaRoom.afterStep — the crate list is sent on change, and again after any hole in a client\'s frames', () => {
  const lastFrame = (c: FakeClient): FrameMsg => c.send.mock.calls[c.send.mock.calls.length - 1][1] as FrameMsg;

  it('first frame carries the list; unchanged frames omit it; a tick the client was not sent (the reconnect window) and a resume each bring it back', () => {
    const client = fakeClient('c', ClientState.JOINED);
    const room = bareRoom([client]) as BareRoom & { onReconnect(c: FakeClient): void };
    clearWater(room.world);
    const me = room.world.ships.get('c')!.state;
    const crate = { id: 'd1', x: me.x + 300, y: me.y + 200, kind: 'xp' as const };
    room.world.drops.set(crate.id, crate);
    const row = [{ id: crate.id, x: crate.x, y: crate.y, c: 'xp' }];

    room.afterStep();
    expect(lastFrame(client).drops).toEqual(row); // the first frame: the list
    room.afterStep();
    expect('drops' in lastFrame(client)).toBe(false); // unchanged: omitted
    // The socket drops: no frame this tick, so the sequence has a hole...
    client.state = ClientState.RECONNECTING;
    const sentBefore = client.send.mock.calls.length;
    room.afterStep();
    expect(client.send.mock.calls.length).toBe(sentBefore);
    client.state = ClientState.JOINED;
    room.afterStep();
    expect(lastFrame(client).drops).toEqual(row); // ...and the next frame carries the list again
    room.afterStep();
    expect('drops' in lastFrame(client)).toBe(false);
    // A resume the room is told about (a refreshed page holds no list at all).
    room.onReconnect(client);
    room.afterStep();
    expect(lastFrame(client).drops).toEqual(row);
    // The crate is taken: the list goes out EMPTY, once.
    room.world.drops.clear();
    room.afterStep();
    expect(lastFrame(client).drops).toEqual([]);
    room.afterStep();
    expect('drops' in lastFrame(client)).toBe(false);
  });
});

// --- kickIfStillJoining deadline decision ------------------------------------

describe('ArenaRoom.kickIfStillJoining', () => {
  it('kicks a client still JOINING at fire time with a punitive WITH_ERROR close', () => {
    const client = fakeClient('stuck', ClientState.JOINING);
    const room = bareRoom([client]);

    room.kickIfStillJoining(client);

    expect(client.leave).toHaveBeenCalledTimes(1);
    expect(client.leave).toHaveBeenCalledWith(CloseCode.WITH_ERROR);
  });

  it('is a no-op for a client that reached JOINED before the deadline fired', () => {
    const client = fakeClient('ok', ClientState.JOINED);
    const room = bareRoom([client]);

    room.kickIfStillJoining(client);

    expect(client.leave).not.toHaveBeenCalled();
  });

  it('is a no-op for a client that already left the room when the deadline fires', () => {
    const departed = fakeClient('gone', ClientState.JOINING);
    const room = bareRoom([]); // deadline outlives the client: not in room.clients

    room.kickIfStillJoining(departed);

    expect(departed.leave).not.toHaveBeenCalled();
  });
});
