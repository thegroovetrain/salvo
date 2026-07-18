// Story 0.2: bindRoom wires the SDK's same-Room auto-reconnect signals. onDrop
// delegates to deps.onDrop (main.ts shows the RECONNECTING banner); onReconnect
// resets the own-ship interp buffer + predictor (so the resumed ship hard-inits
// from authoritative truth instead of replaying stale un-acked inputs) and then
// delegates to deps.onReconnect (banner cleared).
import { describe, expect, it, vi } from 'vitest';
import { bindRoom, type RoomBindingDeps } from '../net/roomBindings';
import type { Connection } from '../net/connection';

interface FakeRoom {
  onMessage: (type: string, cb: (msg: unknown) => void) => void;
  onError: (cb: (code: number, message?: string) => void) => void;
  onLeave: (cb: (code: number) => void) => void;
  onDrop: (cb: () => void) => void;
  onReconnect: (cb: () => void) => void;
  fireDrop: () => void;
  fireReconnect: () => void;
}

function fakeRoom(): FakeRoom {
  let drop: (() => void) | undefined;
  let reconnect: (() => void) | undefined;
  return {
    onMessage: () => undefined,
    onError: () => undefined,
    onLeave: () => undefined,
    onDrop: (cb) => void (drop = cb),
    onReconnect: (cb) => void (reconnect = cb),
    fireDrop: () => drop?.(),
    fireReconnect: () => reconnect?.(),
  };
}

function setup() {
  const room = fakeRoom();
  const conn = { room, welcome: {}, sink: { handler: () => undefined } } as unknown as Connection;
  const ownBufferClear = vi.fn();
  const forceSnap = vi.fn();
  const onDrop = vi.fn();
  const onReconnect = vi.fn();
  const deps = {
    ownBuffer: { clear: ownBufferClear },
    predictor: { forceSnap },
    onDrop,
    onReconnect,
  } as unknown as RoomBindingDeps;
  bindRoom(conn, deps);
  return { room, ownBufferClear, forceSnap, onDrop, onReconnect };
}

describe('bindRoom reconnect signals', () => {
  it('delegates a drop to deps.onDrop (RECONNECTING banner) without touching prediction', () => {
    const { room, ownBufferClear, forceSnap, onDrop, onReconnect } = setup();
    room.fireDrop();
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onReconnect).not.toHaveBeenCalled();
    // A drop alone must not disturb the still-predicting own ship.
    expect(ownBufferClear).not.toHaveBeenCalled();
    expect(forceSnap).not.toHaveBeenCalled();
  });

  it('resets interp buffer + predictor and clears the banner on reconnect', () => {
    const { room, ownBufferClear, forceSnap, onReconnect } = setup();
    room.fireReconnect();
    expect(ownBufferClear).toHaveBeenCalledTimes(1);
    expect(forceSnap).toHaveBeenCalledTimes(1);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});
