// Story 0.2: bindRoom wires the SDK's same-Room auto-reconnect signals. onDrop
// delegates to deps.onDrop (main.ts shows the RECONNECTING banner); onReconnect
// resets the own-ship interp buffer + predictor (so the resumed ship hard-inits
// from authoritative truth instead of replaying stale un-acked inputs) and then
// delegates to deps.onReconnect (banner cleared). It ALSO arms a one-shot camera
// snap consumed on the first resumed frame — completing the handleSpawn mirror.
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

/** A minimal own-ship-carrying frame at a given world position. */
function ownFrame(x: number, y: number): unknown {
  return {
    t: 100,
    tick: 1,
    ackSeq: 0,
    you: { x, y, heading: 0, speed: 0, cls: 'torpedoBoat', upg: [], alive: true, sweep: 0 },
    contacts: [],
    mines: [],
    events: [],
  };
}

function setup() {
  const room = fakeRoom();
  const sink: { handler: (f: unknown) => void } = { handler: () => undefined };
  const conn = { room, welcome: {}, sink } as unknown as Connection;
  const ownBufferClear = vi.fn();
  const forceSnap = vi.fn();
  const onDrop = vi.fn();
  const onReconnect = vi.fn();
  const onOwnSpawn = vi.fn();
  const onDenied = vi.fn();
  const deps = {
    // handleFrame surface (enough for an own-ship frame to flow through).
    state: { net: { you: null, tick: 0, ackSeq: 0 }, spectating: false, phase: '', respawnEta: null, mode: 'interp' },
    clock: { addSample: vi.fn() },
    ownBuffer: { clear: ownBufferClear, push: vi.fn() },
    predictor: { forceSnap, onServerState: vi.fn() },
    radar: { onSweepSample: vi.fn() },
    contacts: { pushFrame: vi.fn() },
    mines: { sync: vi.fn() },
    litZones: { sync: vi.fn() },
    decoys: { sync: vi.fn() },
    onOwnStats: vi.fn(),
    onOwnSpawn,
    onDrop,
    onReconnect,
    onDenied,
    colors: vi.fn(() => null),
    ordnanceHue: vi.fn(() => 0),
  } as unknown as RoomBindingDeps;
  bindRoom(conn, deps);
  return { room, sink, ownBufferClear, forceSnap, onDrop, onReconnect, onOwnSpawn, onDenied };
}

describe('bindRoom reconnect signals', () => {
  it('delegates a drop to deps.onDrop (RECONNECTING banner) without touching prediction', () => {
    const { room, ownBufferClear, forceSnap, onDrop, onReconnect } = setup();
    room.fireDrop();
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onReconnect).not.toHaveBeenCalled();
    // ACCEPTED LIMITATION (0.2): a drop does not touch the still-predicting own
    // ship — prediction keeps sampling/applying local input through the outage
    // (see the onDrop binding comment). Not a feature; the freeze/flag UX is 6.7.
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

  it('snaps the camera to the resumed hull on the FIRST own frame after a reconnect only', () => {
    const { room, sink, onOwnSpawn } = setup();
    // Ordinary pre-reconnect frame: no camera snap (snap rides spawn/resume only).
    sink.handler(ownFrame(10, 20));
    expect(onOwnSpawn).not.toHaveBeenCalled();
    // Resume arms the one-shot snap; it fires on the next authoritative pose.
    room.fireReconnect();
    sink.handler(ownFrame(500, 600));
    expect(onOwnSpawn).toHaveBeenCalledTimes(1);
    expect(onOwnSpawn).toHaveBeenCalledWith(500, 600);
    // Subsequent ordinary frames must NOT re-snap (the flag is consumed once).
    sink.handler(ownFrame(700, 800));
    expect(onOwnSpawn).toHaveBeenCalledTimes(1);
  });
});

// --- decoy channel (Story 1.8) ----------------------------------------------

/** A minimal deps whose contact-like channel spies are exposed for assertions. */
function setupChannels() {
  const room = fakeRoom();
  const sink: { handler: (f: unknown) => void } = { handler: () => undefined };
  const conn = { room, welcome: {}, sink } as unknown as Connection;
  const decoysSync = vi.fn();
  const deps = {
    // spectating:true so a spec frame's onSpectate branch is skipped (the
    // existing spectator-frame tests use the same shortcut).
    state: { net: { you: null, sessionId: 'me', tick: 0, ackSeq: 0 }, spectating: true, phase: '', respawnEta: null, mode: 'interp' },
    clock: { addSample: vi.fn() },
    contacts: { pushFrame: vi.fn() },
    mines: { sync: vi.fn() },
    litZones: { sync: vi.fn() },
    decoys: { sync: decoysSync },
    colors: vi.fn(() => null),
    ordnanceHue: vi.fn(() => 0),
  } as unknown as RoomBindingDeps;
  bindRoom(conn, deps);
  return { sink, decoysSync };
}

describe('bindRoom decoy channel', () => {
  it('syncs the decoy list contact-like every frame (the mines/litZones precedent)', () => {
    const { sink, decoysSync } = setupChannels();
    const decoys = [{ id: 'd1', x: 10, y: 20, until: 5000, own: true, by: 'p1' }];
    sink.handler({ t: 100, tick: 1, ackSeq: 0, spec: true, contacts: [], mines: [], events: [], decoys });
    expect(decoysSync).toHaveBeenCalledWith(decoys, expect.any(Function)); // + firer-hue resolver (Story 1.12)
  });

  it('treats an omitted decoys key as an empty list (frames omit it when none)', () => {
    const { sink, decoysSync } = setupChannels();
    sink.handler({ t: 100, tick: 1, ackSeq: 0, spec: true, contacts: [], mines: [], events: [] });
    expect(decoysSync).toHaveBeenCalledWith([], expect.any(Function));
  });
});

// --- burst event handling (Story 1.4) ---------------------------------------

/** A spectator-style frame (no `you`) carrying a single event. */
function eventFrame(event: unknown): unknown {
  return { t: 200, tick: 2, ackSeq: 0, spec: true, contacts: [], mines: [], events: [event] };
}

function setupEvents() {
  const room = fakeRoom();
  const sink: { handler: (f: unknown) => void } = { handler: () => undefined };
  const conn = { room, welcome: {}, sink } as unknown as Connection;
  const onBurst = vi.fn();
  const spawnEffect = vi.fn();
  const onBoom = vi.fn();
  const deps = {
    state: { net: { you: null, sessionId: 'me', tick: 0, ackSeq: 0 }, spectating: true, phase: '', respawnEta: null, mode: 'interp' },
    clock: { addSample: vi.fn() },
    contacts: { pushFrame: vi.fn() },
    mines: { sync: vi.fn() },
    litZones: { sync: vi.fn() },
    decoys: { sync: vi.fn() },
    projectiles: { onBurst, onBoom },
    effects: { spawnEffect },
    onSpectate: vi.fn(),
    colors: vi.fn(() => null),
    ordnanceHue: vi.fn(() => 0),
  } as unknown as RoomBindingDeps;
  bindRoom(conn, deps);
  return { sink, onBurst, spawnEffect };
}

describe('bindRoom burst events', () => {
  it('spawns the burst effect and terminates the shell render on a burst event', () => {
    const { sink, onBurst, spawnEffect } = setupEvents();
    sink.handler(eventFrame({ k: 'burst', id: 'shell-7', x: 300, y: -120 }));
    expect(onBurst).toHaveBeenCalledTimes(1);
    expect(onBurst).toHaveBeenCalledWith({ k: 'burst', id: 'shell-7', x: 300, y: -120 });
    expect(spawnEffect).toHaveBeenCalledWith('burst', 300, -120);
  });
});

// --- own sunk resets transient captain state (Story 1.4) --------------------

describe('bindRoom own sunk', () => {
  it('reverts BOTH the engine order and the primed skillshot to the gun for the next life', () => {
    const room = fakeRoom();
    const sink: { handler: (f: unknown) => void } = { handler: () => undefined };
    const conn = { room, welcome: {}, sink } as unknown as Connection;
    const resetThrottle = vi.fn();
    const resetPrime = vi.fn();
    const deps = {
      state: {
        net: { you: null, sessionId: 'me', tick: 0, ackSeq: 0 },
        spectating: false, phase: '', respawnEta: null, killerId: null, mode: 'interp',
      },
      clock: { addSample: vi.fn() },
      contacts: { pushFrame: vi.fn() },
      mines: { sync: vi.fn() },
    litZones: { sync: vi.fn() },
    decoys: { sync: vi.fn() },
      effects: { spawnEffect: vi.fn() },
      audio: { play: vi.fn() },
      names: (id: string) => id,
      colors: () => null,
      ordnanceHue: () => 0,
      resetThrottle,
      resetPrime,
    } as unknown as RoomBindingDeps;
    bindRoom(conn, deps);
    // Own-ship sunk event (id === sessionId) drives the own-death branch.
    sink.handler({ t: 200, tick: 2, ackSeq: 0, contacts: [], mines: [], events: [{ k: 'sunk', id: 'me', by: null }] });
    expect(resetThrottle).toHaveBeenCalledTimes(1);
    expect(resetPrime).toHaveBeenCalledTimes(1); // the primed skillshot never survives death
  });
});

describe('bindRoom denial channel (Story 1.10)', () => {
  it('routes each self-private denied entry to deps.onDenied, in wire order', () => {
    const { sink, onDenied } = setup();
    const f = ownFrame(0, 0) as Record<string, unknown>;
    f.denied = [
      { slot: 1, reason: 'out-of-arc', seq: 4 },
      { slot: 2, reason: 'no-ammo', seq: 7 },
    ];
    sink.handler(f);
    expect(onDenied).toHaveBeenCalledTimes(2);
    expect(onDenied).toHaveBeenNthCalledWith(1, { slot: 1, reason: 'out-of-arc', seq: 4 });
    expect(onDenied).toHaveBeenNthCalledWith(2, { slot: 2, reason: 'no-ammo', seq: 7 });
  });

  it('a frame WITHOUT the denied key routes nothing (omitted = none)', () => {
    const { sink, onDenied } = setup();
    sink.handler(ownFrame(0, 0));
    expect(onDenied).not.toHaveBeenCalled();
  });
});
