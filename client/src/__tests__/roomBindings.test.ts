// Story 0.2: bindRoom wires the SDK's same-Room auto-reconnect signals. onDrop
// delegates to deps.onDrop (main.ts shows the RECONNECTING banner); onReconnect
// resets the own-ship interp buffer + predictor (so the resumed ship hard-inits
// from authoritative truth instead of replaying stale un-acked inputs) and then
// delegates to deps.onReconnect (banner cleared). It ALSO arms a one-shot camera
// snap consumed on the first resumed frame — completing the handleSpawn mirror —
// and reverts the primed weapon to the gun (the sunk-path symmetry: a resume is
// a hard boundary, so a pre-outage prime never fires on the first click back).
import { describe, expect, it, vi } from 'vitest';
import { bindRoom, frameIsDeadOrSpectating, type RoomBindingDeps } from '../net/roomBindings';
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
    you: { x, y, heading: 0, speed: 0, cls: 'torpedoBoat', upg: [], boons: [], alive: true, sweep: 0 },
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
  const resetPrime = vi.fn();
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
    resetPrime,
    colors: vi.fn(() => null),
    ordnanceHue: vi.fn(() => 0),
  } as unknown as RoomBindingDeps;
  bindRoom(conn, deps);
  return { room, sink, ownBufferClear, forceSnap, onDrop, onReconnect, onOwnSpawn, onDenied, resetPrime };
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

  it('reverts the primed weapon to the gun on reconnect (the sunk-path symmetry)', () => {
    const { room, resetPrime } = setup();
    // A drop alone must NOT disturb the prime — the player is still sailing the
    // same hull and the SDK is only retrying the socket.
    room.fireDrop();
    expect(resetPrime).not.toHaveBeenCalled();
    // The resume IS a hard boundary: a torpedo/mine primed before the outage
    // must not fire on the first click back.
    room.fireReconnect();
    expect(resetPrime).toHaveBeenCalledTimes(1);
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
  const onBallisticUpdate = vi.fn();
  const deps = {
    state: { net: { you: null, sessionId: 'me', tick: 0, ackSeq: 0 }, spectating: true, phase: '', respawnEta: null, mode: 'interp' },
    clock: { addSample: vi.fn() },
    contacts: { pushFrame: vi.fn() },
    mines: { sync: vi.fn() },
    litZones: { sync: vi.fn() },
    decoys: { sync: vi.fn() },
    projectiles: { onBurst, onBoom, onBallisticUpdate },
    effects: { spawnEffect },
    onSunkObserved: vi.fn(),
    onSpectate: vi.fn(),
    colors: vi.fn(() => null),
    ordnanceHue: vi.fn(() => 0),
  } as unknown as RoomBindingDeps;
  bindRoom(conn, deps);
  return { sink, onBurst, spawnEffect, onBallisticUpdate };
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

// --- Story 2.8: the homing torpedo's track update -------------------------------

describe('bindRoom torpU events', () => {
  it('routes a torpU to the projectile track update — and nothing else', () => {
    const { sink, onBallisticUpdate, spawnEffect } = setupEvents();
    const ev = { k: 'torpU', id: 't-3', x: 120, y: -40, vx: 0, vy: 60, t: 200 };
    sink.handler(eventFrame(ev));
    expect(onBallisticUpdate).toHaveBeenCalledTimes(1);
    expect(onBallisticUpdate).toHaveBeenCalledWith(ev);
    // A steer is NOT a launch: no muzzle flash, no splash, no tone — the fish
    // was already revealed and this only keeps the dead reckoning honest.
    expect(spawnEffect).not.toHaveBeenCalled();
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
    const onSunkObserved = vi.fn();
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
      onSunkObserved,
    } as unknown as RoomBindingDeps;
    bindRoom(conn, deps);
    // Own-ship sunk event (id === sessionId) drives the own-death branch.
    sink.handler({ t: 200, tick: 2, ackSeq: 0, contacts: [], mines: [], events: [{ k: 'sunk', id: 'me', by: null }] });
    expect(resetThrottle).toHaveBeenCalledTimes(1);
    expect(resetPrime).toHaveBeenCalledTimes(1); // the primed skillshot never survives death
    // Story 2.3: the SAME observed sinking feeds the personal-score accumulator
    // and (for our own hull, in a live match) opens the elimination modal.
    expect(onSunkObserved).toHaveBeenCalledWith('me', null);
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

// --- self-private reward toasts (Story 2.7, amendment 37) --------------------
//
// The `pt` level-up toast is SUPPRESSED entirely while the local captain is
// dead/spectating: a posthumous kill still banks the level server-side (ratified
// 2.6), but "LEVEL UP — TAB TO REFIT" is a lie to a corpse — there is no refit
// surface while spectating. The `bn` boon-fit toast is deliberately NOT gated:
// spending while dead is legal, and the confirmation is exactly what is wanted.

/** A reward-event frame. `you` present+alive = a live captain; omitting `you`
 *  (with spec:true) is EXACTLY the shape a spectator frame arrives in.
 *  `boons` is the list the frame ALREADY carries when its `bn` event fans out
 *  (handleFrame applies `you` before the events), which is what lets the fitted
 *  toast name the ladder rung the card showed. */
function rewardFrame(event: unknown, own: { alive: boolean; boons?: string[] } | null): unknown {
  const base = { t: 300, tick: 3, ackSeq: 0, contacts: [], mines: [], events: [event] };
  if (!own) return { ...base, spec: true };
  return {
    ...base,
    you: { x: 0, y: 0, heading: 0, speed: 0, cls: 'torpedoBoat', boons: own.boons ?? [], alive: own.alive, sweep: 0 },
  };
}

function setupToasts(spectating = false) {
  const room = fakeRoom();
  const sink: { handler: (f: unknown) => void } = { handler: () => undefined };
  const conn = { room, welcome: {}, sink } as unknown as Connection;
  const play = vi.fn();
  const onSpendAck = vi.fn();
  const onBoonFitted = vi.fn();
  const deps = {
    state: {
      net: { you: null, sessionId: 'me', tick: 0, ackSeq: 0 },
      spectating, phase: '', respawnEta: null, mode: 'interp',
    },
    clock: { addSample: vi.fn() },
    contacts: { pushFrame: vi.fn() },
    mines: { sync: vi.fn() },
    litZones: { sync: vi.fn() },
    decoys: { sync: vi.fn() },
    ownBuffer: { push: vi.fn(), clear: vi.fn() },
    predictor: { onServerState: vi.fn(), forceSnap: vi.fn() },
    radar: { onSweepSample: vi.fn(), onBlip: vi.fn() },
    effects: { spawnEffect: vi.fn() },
    audio: { play },
    names: (id: string) => id,
    colors: () => null,
    ordnanceHue: () => 0,
    onOwnStats: vi.fn(),
    onOwnSpawn: vi.fn(),
    onSpectate: vi.fn(),
    onSunkObserved: vi.fn(),
    onSpendAck,
    onBoonFitted,
  } as unknown as RoomBindingDeps;
  bindRoom(conn, deps);
  return { sink, play, onSpendAck, onBoonFitted };
}

function toastLines(): string[] {
  const stack = document.getElementById('upgrade-toast');
  return [...(stack?.children ?? [])].map((el) => el.textContent ?? '');
}

describe('frameIsDeadOrSpectating — the amendment 37 gate', () => {
  it('is true for a spectator frame (no `you`) and for a dead-but-present `you`', () => {
    expect(frameIsDeadOrSpectating(rewardFrame(null, null) as never)).toBe(true);
    expect(frameIsDeadOrSpectating(rewardFrame(null, { alive: false }) as never)).toBe(true);
  });

  it('is false for a live captain', () => {
    expect(frameIsDeadOrSpectating(rewardFrame(null, { alive: true }) as never)).toBe(false);
  });
});

describe('bindRoom reward toasts', () => {
  it('a LIVE captain gets the level-up toast + point tone', () => {
    document.body.replaceChildren();
    const { sink, play } = setupToasts();
    sink.handler(rewardFrame({ k: 'pt', id: 'me' }, { alive: true }));
    expect(toastLines()).toEqual(['▲ LEVEL UP — TAB TO REFIT']);
    expect(play).toHaveBeenCalledWith('point');
  });

  it('a SPECTATING captain gets NO level-up toast and NO tone (amendment 37)', () => {
    document.body.replaceChildren();
    const { sink, play } = setupToasts(true);
    sink.handler(rewardFrame({ k: 'pt', id: 'me' }, null));
    expect(toastLines()).toEqual([]);
    expect(play).not.toHaveBeenCalled();
  });

  it('a DEAD-but-present captain gets no level-up toast either', () => {
    document.body.replaceChildren();
    const { sink, play } = setupToasts();
    sink.handler(rewardFrame({ k: 'pt', id: 'me' }, { alive: false }));
    expect(toastLines()).toEqual([]);
    expect(play).not.toHaveBeenCalled();
  });

  it('a fitted boon toasts with the ladder name + its TIER cue, even while dead', () => {
    document.body.replaceChildren();
    const { sink, play } = setupToasts();
    sink.handler(rewardFrame({ k: 'bn', id: 'me', boon: 'gunDamage' }, { alive: false, boons: ['gunDamage'] }));
    expect(toastLines()).toEqual(['◆ HEAVY SHELLS Mk I FITTED']);
    expect(play).toHaveBeenCalledWith('fitCommon');
  });

  it('WEIGHTS the fit cue by the fitted line\'s tier (Story 2.9)', () => {
    for (const [boon, tone] of [['gunDamage', 'fitCommon'], ['gunBarrel', 'fitRare'], ['cannonAp', 'fitExclusive']]) {
      document.body.replaceChildren();
      const { sink, play } = setupToasts();
      sink.handler(rewardFrame({ k: 'bn', id: 'me', boon }, { alive: true, boons: [boon] }));
      expect(play).toHaveBeenCalledWith(tone);
    }
  });

  it('routes the fit FLASH to the fitted line\'s category (amendment 51)', () => {
    document.body.replaceChildren();
    const { sink, onBoonFitted } = setupToasts();
    sink.handler(rewardFrame({ k: 'bn', id: 'me', boon: 'mineBlast' }, { alive: true, boons: ['mineBlast'] }));
    expect(onBoonFitted).toHaveBeenCalledWith('mines');
    sink.handler(rewardFrame({ k: 'bn', id: 'me', boon: 'intelRadar' }, { alive: true, boons: ['intelRadar'] }));
    expect(onBoonFitted).toHaveBeenCalledWith('intel'); // shipwide -> the rank-wide flash
  });

  it('never goes SILENT on an unknown id (FR22): the common cue + a rank-wide flash', () => {
    document.body.replaceChildren();
    const { sink, play, onBoonFitted, onSpendAck } = setupToasts();
    sink.handler(rewardFrame({ k: 'bn', id: 'me', boon: 'notARealBoon' }, { alive: true, boons: ['notARealBoon'] }));
    expect(play).toHaveBeenCalledWith('fitCommon');
    expect(onBoonFitted).toHaveBeenCalledWith('');
    expect(onSpendAck).toHaveBeenCalledTimes(1);
  });

  it('the fitted toast names the RUNG that was fitted, not the line\'s first name', () => {
    // Story 2.8's name-by-stack-position: the frame's `boons` already carries
    // the new occurrence, so the third HEAVY SHELLS toasts as Mk III — exactly
    // the name the card the player clicked was showing.
    document.body.replaceChildren();
    const { sink } = setupToasts();
    sink.handler(rewardFrame(
      { k: 'bn', id: 'me', boon: 'gunDamage' },
      { alive: true, boons: ['gunDamage', 'gunDamage', 'gunDamage'] },
    ));
    expect(toastLines()).toEqual(['◆ HEAVY SHELLS Mk III FITTED']);
  });

  it("another ship's reward events are ignored (defensive — perception already gates them)", () => {
    document.body.replaceChildren();
    const { sink, play, onSpendAck } = setupToasts();
    sink.handler(rewardFrame({ k: 'pt', id: 'someone-else' }, { alive: true }));
    sink.handler(rewardFrame({ k: 'bn', id: 'someone-else', boon: 'shipSpeed' }, { alive: true }));
    expect(toastLines()).toEqual([]);
    expect(play).not.toHaveBeenCalled();
    expect(onSpendAck).not.toHaveBeenCalled(); // and no foreign spend can ack ours
  });

  // STORY 2.7 REVIEW — the `bn` event is ALSO the spend latch's ack: the one
  // unambiguous "your spend landed" signal on the wire (main.ts marks the latch,
  // which then releases as a success even when a same-frame passive bank and an
  // identical re-roll hide every other landing signal). Net calls the callback;
  // it never reaches into main.
  it('routes a SELF boon-fit to deps.onSpendAck (the spend latch receipt)', () => {
    document.body.replaceChildren();
    const { sink, onSpendAck } = setupToasts();
    sink.handler(rewardFrame({ k: 'bn', id: 'me', boon: 'gunDamage' }, { alive: true, boons: ['gunDamage'] }));
    expect(onSpendAck).toHaveBeenCalledTimes(1);
  });

  it('acks a boon fitted while DEAD too (spending while dead is legal)', () => {
    document.body.replaceChildren();
    const { sink, onSpendAck } = setupToasts();
    sink.handler(rewardFrame({ k: 'bn', id: 'me', boon: 'shipSpeed' }, { alive: false, boons: ['shipSpeed'] }));
    expect(onSpendAck).toHaveBeenCalledTimes(1);
  });

  it('a level-up bank is NOT a spend ack (only `bn` is)', () => {
    document.body.replaceChildren();
    const { sink, onSpendAck } = setupToasts();
    sink.handler(rewardFrame({ k: 'pt', id: 'me' }, { alive: true }));
    expect(onSpendAck).not.toHaveBeenCalled();
  });
});
