// THE FRAME HANDLER'S SELF-LATCHING SEAM (cycle 91) — sibling of the loop
// containment in loopContainment.test.ts.
//
// applyFrame used to call `deps.onOwnStats(...)` and only THEN advance the
// `net.you` mirror. A throw inside applyOwnStats therefore left the mirror
// stale, so the very next frame compared the same new boon list against the
// same old one, decided stats had changed AGAIN, and threw AGAIN — forever —
// skipping everything below that line (reconcile/ack, radar sweep anchor,
// contacts, events) on every one of those frames. Combined with the ticker
// defect it was a permanent freeze; on its own it is a permanently degraded
// session. The fix is ordering: evaluate the predicate against the old mirror,
// advance the mirror, then fan out.

import { describe, it, expect, vi } from 'vitest';
import { bindRoom } from '../net/roomBindings.js';
import type { Connection } from '../net/connection.js';
import type { RoomBindingDeps } from '../net/roomBindings.js';

/** The room surface bindRoom touches — signals are callable, not objects. */
function fakeRoom(): unknown {
  return {
    onMessage: () => undefined,
    onError: () => undefined,
    onLeave: () => undefined,
    onDrop: () => undefined,
    onReconnect: () => undefined,
  };
}

/** A frame carrying an own-ship block with the given fitted boons. */
function frameWith(tick: number, boons: readonly string[]): unknown {
  return {
    t: tick * 50,
    tick,
    ackSeq: 0,
    contacts: [],
    mines: [],
    events: [],
    you: {
      x: 0, y: 0, heading: 0, speed: 0, alive: true, hp: 100,
      cls: 'torpedoBoat', boons, sweep: 0, pts: 0, offer: [], ammo: [],
    },
  };
}

function setup(onOwnStats: () => void): {
  sink: { handler: (f: unknown) => void };
  state: { net: { you: unknown } };
  pushFrame: ReturnType<typeof vi.fn>;
  onServerState: ReturnType<typeof vi.fn>;
} {
  const sink: { handler: (f: unknown) => void } = { handler: () => undefined };
  const conn = { room: fakeRoom(), welcome: {}, sink, early: { results: null, bound: false } } as unknown as Connection;
  // mode 'predict' so the reconcile call is actually reached — it is gated on
  // this, and an 'interp' harness would make the onServerState assertion vacuous.
  const state = {
    net: { you: null as unknown, sessionId: 'me', tick: 0, ackSeq: 0 },
    spectating: false, phase: '', respawnEta: null, killerId: null, mode: 'predict',
  };
  const pushFrame = vi.fn();
  const onServerState = vi.fn();
  const deps = {
    state,
    clock: { addSample: vi.fn() },
    contacts: { pushFrame },
    mines: { sync: vi.fn() },
    ownBurstRadius: () => undefined,
    ownMineRings: () => undefined,
    litZones: { sync: vi.fn() },
    decoys: { sync: vi.fn() },
    effects: { spawnEffect: vi.fn() },
    audio: { play: vi.fn() },
    names: (id: string) => id,
    colors: () => null,
    ordnanceHue: () => 0,
    ownBuffer: { push: vi.fn(), clear: vi.fn() },
    predictor: { onServerState },
    radar: { onSweepSample: vi.fn() },
    onOwnStats,
    onOwnSpawn: vi.fn(),
    resetThrottle: vi.fn(),
    resetPrime: vi.fn(),
    respawnArmed: () => true,
  } as unknown as RoomBindingDeps;
  bindRoom(conn, deps);
  return { sink, state: state as unknown as { net: { you: unknown } }, pushFrame, onServerState };
}

describe('applyFrame ordering — a throwing onOwnStats must not latch', () => {
  it('advances the net.you mirror even when onOwnStats throws', () => {
    const onOwnStats = vi.fn(() => {
      throw new Error('applyOwnStats blew up');
    });
    const { sink, state } = setup(onOwnStats);
    expect(() => sink.handler(frameWith(1, ['intelSweep']))).toThrow();
    // THE POINT: the mirror advanced despite the throw, so the next frame has a
    // fresh baseline to compare against.
    expect(state.net.you).not.toBeNull();
    expect((state.net.you as { boons: string[] }).boons).toEqual(['intelSweep']);
  });

  it('does not re-fire onOwnStats on the next frame for the same boon list', () => {
    const onOwnStats = vi.fn(() => {
      throw new Error('applyOwnStats blew up');
    });
    const { sink } = setup(onOwnStats);
    expect(() => sink.handler(frameWith(1, ['intelSweep']))).toThrow();
    // Same boons: with the mirror advanced, ownStatsChanged is now false, so the
    // second frame must sail straight past the throwing callback. Under the old
    // ordering this threw again, and would have thrown on every frame forever.
    sink.handler(frameWith(2, ['intelSweep']));
    expect(onOwnStats).toHaveBeenCalledTimes(1);
  });

  // Asserts `predictor.onServerState` BY NAME (acceptance audit): the AC names
  // that call specifically, and the original test asserted only the sibling
  // `contacts.pushFrame` further down the same path.
  it('resumes reconciliation — predictor.onServerState runs on frames after the throw', () => {
    const onOwnStats = vi.fn(() => {
      throw new Error('applyOwnStats blew up');
    });
    const { sink, onServerState } = setup(onOwnStats);
    expect(() => sink.handler(frameWith(1, ['intelSweep']))).toThrow();
    expect(onServerState).not.toHaveBeenCalled(); // frame 1 died below the throw
    sink.handler(frameWith(2, ['intelSweep']));
    expect(onServerState).toHaveBeenCalledTimes(1);
  });

  it('still fans the rest of the frame out on frames after the throw', () => {
    const onOwnStats = vi.fn(() => {
      throw new Error('applyOwnStats blew up');
    });
    const { sink, pushFrame } = setup(onOwnStats);
    expect(() => sink.handler(frameWith(1, ['intelSweep']))).toThrow();
    sink.handler(frameWith(2, ['intelSweep']));
    sink.handler(frameWith(3, ['intelSweep']));
    // EXACTLY 2 (review gate): the throwing frame 1 must NOT reach pushFrame —
    // it is below the throw — and frames 2 and 3 must both get there. A `>= 2`
    // bound would also pass if frame 1 leaked through, which is the opposite of
    // what this asserts. Under the old ordering this was 0.
    expect(pushFrame).toHaveBeenCalledTimes(2);
  });

  it('fires again when the boon list genuinely changes', () => {
    const onOwnStats = vi.fn();
    const { sink } = setup(onOwnStats);
    sink.handler(frameWith(1, ['intelSweep']));
    sink.handler(frameWith(2, ['intelSweep', 'shipHull']));
    expect(onOwnStats).toHaveBeenCalledTimes(2);
  });
});
