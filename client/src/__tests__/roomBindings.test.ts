// Story 0.2: bindRoom wires the SDK's same-Room auto-reconnect signals. onDrop
// delegates to deps.onDrop (main.ts shows the RECONNECTING banner); onReconnect
// resets the own-ship interp buffer + predictor (so the resumed ship hard-inits
// from authoritative truth instead of replaying stale un-acked inputs) and then
// delegates to deps.onReconnect (banner cleared). It ALSO arms a one-shot camera
// snap consumed on the first resumed frame — completing the handleSpawn mirror —
// and reverts the primed weapon to the gun (the sunk-path symmetry: a resume is
// a hard boundary, so a pre-outage prime never fires on the first click back).
import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '@salvo/shared';
import {
  bindRoom,
  frameIsDeadOrSpectating,
  inEnemyBurningZone,
  readsAsBurn,
  windowRunning,
  type RoomBindingDeps,
} from '../net/roomBindings';
import type { Connection } from '../net/connection';
import type { OwnFire } from '../render/projectiles';
import { CLIENT_CONFIG } from '../config';
import { fitDetune } from '../audio/tones';

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
    // The own-private preview seams (aim-preview cycle): the burst ring's
    // effective radius and the own-mine rings. Both fail to `undefined` here,
    // which is exactly the pre-stats behavior (CONFIG default / no rings).
    ownBurstRadius: () => undefined,
    ownMineRings: () => undefined,
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
    // The own-private preview seams (aim-preview cycle): the burst ring's
    // effective radius and the own-mine rings. Both fail to `undefined` here,
    // which is exactly the pre-stats behavior (CONFIG default / no rings).
    ownBurstRadius: () => undefined,
    ownMineRings: () => undefined,
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

function setupEvents(over: Record<string, unknown> = {}) {
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
    // The own-private preview seams (aim-preview cycle): the burst ring's
    // effective radius and the own-mine rings. Both fail to `undefined` here,
    // which is exactly the pre-stats behavior (CONFIG default / no rings).
    ownBurstRadius: () => undefined,
    ownMineRings: () => undefined,
    litZones: { sync: vi.fn() },
    decoys: { sync: vi.fn() },
    projectiles: {
      onBurst: over.onBurst ?? onBurst,
      onBoom,
      onBallisticUpdate,
      ownFireOf: over.ownFireOf ?? (() => null),
    },
    effects: { spawnEffect },
    onSunkObserved: vi.fn(),
    onSpectate: vi.fn(),
    colors: vi.fn(() => null),
    ordnanceHue: vi.fn(() => 0),
    ...(over.ownBurstRadius ? { ownBurstRadius: over.ownBurstRadius } : {}),
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
    // An UNCORRELATED burst (not ours) keeps the CONFIG-default ring radius:
    // the wire carries no radius, and an onlooker must not read one off it.
    expect(spawnEffect).toHaveBeenCalledWith('burst', 300, -120, 1, undefined);
  });

  // P1(c): the ring is sized off a CLAIM, never off the near-hull look. The
  // wiring must read the claim BEFORE onBurst consumes it, and must pass what
  // the claim says — not what the shell was dressed as.
  it('sizes the ring off the track’s claim, and reads it BEFORE the track is retired', () => {
    const calls: string[] = [];
    const { sink, spawnEffect } = setupEvents({
      ownFireOf: (id: string) => {
        calls.push(`read:${id}`);
        return 'cannon';
      },
      onBurst: () => calls.push('retire'),
      ownBurstRadius: (own: unknown) => (own === 'cannon' ? 77 : undefined),
    });
    sink.handler(eventFrame({ k: 'burst', id: 'shell-7', x: 300, y: -120 }));
    expect(calls).toEqual(['read:shell-7', 'retire']); // order is load-bearing
    expect(spawnEffect).toHaveBeenCalledWith('burst', 300, -120, 1, 77);
  });

  it('leaves an UNCLAIMED near-hull shell (an enemy’s, or our own 2nd barrel) on the default', () => {
    // ownFireOf answers null for anything that never claimed the latch — even
    // though roomBindings dressed it with the ratified 'gun' look.
    const { sink, spawnEffect } = setupEvents({ ownFireOf: () => null });
    sink.handler(eventFrame({ k: 'burst', id: 'shell-9', x: 0, y: 0 }));
    expect(spawnEffect).toHaveBeenCalledWith('burst', 0, 0, 1, undefined);
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
      // The own-private preview seams (aim-preview cycle): the burst ring's
      // effective radius and the own-mine rings. Both fail to `undefined` here,
      // which is exactly the pre-stats behavior (CONFIG default / no rings).
      ownBurstRadius: () => undefined,
      ownMineRings: () => undefined,
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
    // The own-private preview seams (aim-preview cycle): the burst ring's
    // effective radius and the own-mine rings. Both fail to `undefined` here,
    // which is exactly the pre-stats behavior (CONFIG default / no rings).
    ownBurstRadius: () => undefined,
    ownMineRings: () => undefined,
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
    // The cue carries BOTH axes as of Story 2.9: the tier picks the tone, the
    // category transposes it (see the fitDetune suite below).
    expect(play).toHaveBeenCalledWith('fitCommon', { detune: fitDetune('guns') });
  });

  it('WEIGHTS the fit cue by the fitted line\'s tier (Story 2.9)', () => {
    for (const [boon, tone] of [['gunDamage', 'fitCommon'], ['gunBarrel', 'fitRare'], ['cannonAp', 'fitExclusive']]) {
      document.body.replaceChildren();
      const { sink, play } = setupToasts();
      sink.handler(rewardFrame({ k: 'bn', id: 'me', boon }, { alive: true, boons: [boon] }));
      expect(play).toHaveBeenCalledWith(tone, expect.anything());
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
    expect(play).toHaveBeenCalledWith('fitCommon', { detune: 0 });
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

// --- STORY 2.9: the net side of "the build must be felt" ------------------------
//
// Three separate contracts live down here, and they share one theme: the client
// may present a doctrine ONLY from something it legitimately has —
//   • OWN fire, correlated with our own click (never inferable by an onlooker);
//   • an enemy's OBSERVABLE behavior (a derived pierce id, a burning zone we are
//     standing in) — never a new field describing their build.

/** A frame carrying events plus an own ship at the origin (the victim cases). */
function victimFrame(
  events: unknown[],
  you: Record<string, unknown> | null,
  extra: Record<string, unknown> = {},
): unknown {
  const base = { t: 1000, tick: 3, ackSeq: 0, contacts: [], mines: [], events, ...extra };
  if (!you) return { ...base, spec: true };
  return {
    ...base,
    you: { x: 0, y: 0, heading: 0, speed: 0, cls: 'torpedoBoat', boons: [], alive: true, sweep: 0, ...you },
  };
}

function setupWater(ownFire: OwnFire = null) {
  const room = fakeRoom();
  const sink: { handler: (f: unknown) => void } = { handler: () => undefined };
  const conn = { room, welcome: {}, sink } as unknown as Connection;
  // A ONE-SHOT stand-in for main.ts's latch (sim/ownFire.ts, pinned in its own
  // suite): claiming CONSUMES, so a second reveal in the same window gets null.
  let held: OwnFire = ownFire;
  const ownFireWeapon = vi.fn((): OwnFire => {
    const claimed = held;
    held = null;
    return claimed;
  });
  const play = vi.fn();
  const spawnEffect = vi.fn();
  const onShell = vi.fn();
  const trigger = vi.fn();
  const flash = vi.fn();
  const deps = {
    state: {
      net: { you: null, sessionId: 'me', tick: 0, ackSeq: 0, litZones: [] },
      spectating: false, phase: '', respawnEta: null, mode: 'interp',
    },
    clock: { addSample: vi.fn() },
    ownBuffer: { push: vi.fn(), clear: vi.fn() },
    predictor: { onServerState: vi.fn(), forceSnap: vi.fn() },
    radar: { onSweepSample: vi.fn(), onBlip: vi.fn() },
    contacts: { pushFrame: vi.fn(), ids: () => [], get: () => null },
    contactViews: { flash },
    mines: { sync: vi.fn() },
    // The own-private preview seams (aim-preview cycle): the burst ring's
    // effective radius and the own-mine rings. Both fail to `undefined` here,
    // which is exactly the pre-stats behavior (CONFIG default / no rings).
    ownBurstRadius: () => undefined,
    ownMineRings: () => undefined,
    litZones: { sync: vi.fn() },
    decoys: { sync: vi.fn() },
    projectiles: { onShell, onBoom: vi.fn(), onBurst: vi.fn(), onBallisticUpdate: vi.fn(), ownFireOf: () => null },
    effects: { spawnEffect },
    shake: { trigger },
    audio: { play },
    onOwnStats: vi.fn(),
    onOwnSpawn: vi.fn(),
    onSpectate: vi.fn(),
    ordnanceHue: () => 0,
    colors: () => null,
    ownFireWeapon,
  } as unknown as RoomBindingDeps;
  bindRoom(conn, deps);
  return { sink, play, spawnEffect, onShell, trigger, flash, deps, ownFireWeapon };
}

describe('own-fire correlation (Story 2.9) — telling our cannon from our gun', () => {
  it('an OWN cannon shot lands with cannon weight: heavy muzzle, heavy report, cannon look', () => {
    const { sink, play, spawnEffect, onShell } = setupWater('cannon');
    sink.handler(victimFrame([{ k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 900 }], {}));
    expect(onShell).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 'cannon', 'cannon');
    expect(spawnEffect).toHaveBeenCalledWith('muzzleHeavy', 0, 0);
    expect(play).toHaveBeenCalledWith('fireCannon'); // the heavier report, finally played
  });

  it('an OWN gun shot is unchanged — the ordinary flash and the gun crack', () => {
    const { sink, play, spawnEffect, onShell } = setupWater('gun');
    sink.handler(victimFrame([{ k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 900 }], {}));
    // A REAL claim: look 'gun' AND claim 'gun' (this one may size a burst ring).
    expect(onShell).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 'gun', 'gun');
    expect(spawnEffect).toHaveBeenCalledWith('muzzle', 0, 0);
    expect(play).toHaveBeenCalledWith('fireGun');
  });

  it('with NO latch (nothing fired recently) an own reveal falls back to the gun', () => {
    const { sink, play, spawnEffect, onShell } = setupWater(null);
    sink.handler(victimFrame([{ k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 900 }], {}));
    // The ratified fallback: it LOOKS and SOUNDS like our gun (pre-2.9
    // behavior, unchanged) but it CLAIMED nothing — the third argument is the
    // burst-ring authority, and a guess is not evidence.
    expect(onShell).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 'gun', null);
    expect(spawnEffect).toHaveBeenCalledWith('muzzle', 0, 0);
    expect(play).toHaveBeenCalledWith('fireGun');
  });

  it('NEVER attributes a distant (enemy) shell to our own weapon, latch or no latch', () => {
    const { sink, play, spawnEffect, onShell } = setupWater('cannon');
    // Far from our hull: this is somebody else's shell, revealed at our fog edge.
    sink.handler(victimFrame([{ k: 'shell', id: 'e1', x: 900, y: 0, vx: 130, vy: 0, t: 900 }], {}));
    expect(onShell).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }), null, null);
    expect(spawnEffect).not.toHaveBeenCalled(); // no visible hull there → no flash
    expect(play).not.toHaveBeenCalled(); // ...and certainly no own-fire cue
  });

  it('marks an own TORPEDO as ours (styled from own doctrine at launch)', () => {
    const { sink, play, onShell } = setupWater('torpedo');
    sink.handler(victimFrame([{ k: 'torp', id: 't1', x: 0, y: 0, vx: 60, vy: 0, t: 900 }], {}));
    expect(onShell).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 'torpedo', 'torpedo');
    expect(play).toHaveBeenCalledWith('fireTorp');
  });

  // --- 2.9 REVIEW: the latch must not dress what it did not fire --------------
  //
  // The correlation is a HEURISTIC over one self-private click, and its whole
  // licence is that it only ever describes the round that click actually made.
  // Every case below is one where it used to claim more than that.

  it('a fish on our bow we did NOT fire renders generic — the homing look is not free', () => {
    // A cannon latch is standing (we just shelled someone) and an ENEMY torpedo
    // surfaces inside our hull length. Dressing it as our own steering fish
    // would tell the player their doctrine is in the water when the enemy's is.
    const { sink, onShell } = setupWater('cannon');
    sink.handler(victimFrame([{ k: 'torp', id: 't1', x: 0, y: 0, vx: 60, vy: 0, t: 900 }], {}));
    expect(onShell).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), null, null);
  });

  it('keeps the pre-2.9 own-fire WHOOSH on the near-hull heuristic alone', () => {
    // Deliberately unchanged: the torpedo whoosh on `nearOwnShip` predates 2.9
    // (it is the muzzle-flash heuristic), and retuning an old cue is not this
    // patch's business. Only the LOOK — new information, and new misinformation
    // — is gated on the claim.
    const { sink, play } = setupWater(null);
    sink.handler(victimFrame([{ k: 'torp', id: 't1', x: 0, y: 0, vx: 60, vy: 0, t: 900 }], {}));
    expect(play).toHaveBeenCalledWith('fireTorp');
  });

  it('ONE claim dresses ONE shell: the second reveal in the window reads generic', () => {
    // The latch is one-shot (sim/ownFire.ts). Two shells materialize on our hull
    // in the same frame — ours, and an enemy's revealed at point-blank range.
    // The first wears the cannon weight; the second must not.
    const { sink, play, spawnEffect, onShell } = setupWater('cannon');
    sink.handler(victimFrame([
      { k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 900 },
      { k: 'shell', id: 's2', x: 0, y: 0, vx: -130, vy: 0, t: 900 },
    ], {}));
    expect(onShell).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 's1' }), 'cannon', 'cannon');
    expect(onShell).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 's2' }), 'gun', null);
    expect(spawnEffect).toHaveBeenNthCalledWith(1, 'muzzleHeavy', 0, 0);
    expect(spawnEffect).toHaveBeenNthCalledWith(2, 'muzzle', 0, 0);
    expect(play).toHaveBeenNthCalledWith(1, 'fireCannon');
    expect(play).toHaveBeenNthCalledWith(2, 'fireGun');
  });

  it('never CLAIMS the latch for a reveal that is not on our own hull', () => {
    // Consuming on a distant shell would burn the claim our own reveal is about
    // to need — so the far shell must not consult it at all.
    const { sink, onShell, ownFireWeapon } = setupWater('cannon');
    sink.handler(victimFrame([{ k: 'shell', id: 'e1', x: 900, y: 0, vx: 130, vy: 0, t: 900 }], {}));
    sink.handler(victimFrame([{ k: 'torp', id: 'e2', x: 900, y: 0, vx: 60, vy: 0, t: 900 }], {}));
    expect(ownFireWeapon).not.toHaveBeenCalled();
    expect(onShell).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'e1' }), null, null);
    expect(onShell).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'e2' }), null, null);
  });

  it('gives an own STAR SHELL its own report — and the ordinary shell look', () => {
    // The flare rides the `shell` wire kind, so it reached the client wearing
    // the gun's crack. It is a fitted line like any other and must be FELT
    // (FR22); the LOOK stays generic, because a flare in flight is a shell.
    const { sink, play, spawnEffect, onShell } = setupWater('starShells');
    sink.handler(victimFrame([{ k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 900 }], {}));
    expect(play).toHaveBeenCalledWith('fireStarShells');
    expect(play).not.toHaveBeenCalledWith('fireGun');
    expect(onShell).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 'starShells', 'starShells');
    expect(spawnEffect).toHaveBeenCalledWith('muzzle', 0, 0); // not the cannon's heavy flash
  });
});

// The latch's own rules (one-shot claim, staleness, the hard-boundary clear)
// live in __tests__/ownFire.test.ts — this suite pins how roomBindings SPENDS it.

describe('pierce identity (Story 2.9) — the derived AP boom id', () => {
  it('renders a punch-through ring for a derived id and the ordinary spark otherwise', () => {
    const { sink, spawnEffect } = setupWater();
    sink.handler(victimFrame([{ k: 'boom', id: 's7#p0', hit: 'foe', x: 40, y: 0 }], {}));
    expect(spawnEffect).toHaveBeenCalledWith('pierce', 40, 0);
    spawnEffect.mockClear();
    sink.handler(victimFrame([{ k: 'boom', id: 's7', hit: 'foe', x: 90, y: 0 }], {}));
    expect(spawnEffect).toHaveBeenCalledWith('spark', 90, 0); // terminal: unchanged
  });

  it('still flashes the struck contact, and still splashes a MISS (no id styling)', () => {
    const { sink, spawnEffect, flash } = setupWater();
    sink.handler(victimFrame([{ k: 'boom', id: 's7#p1', hit: 'foe', x: 40, y: 0 }], {}));
    expect(flash).toHaveBeenCalledWith('foe');
    spawnEffect.mockClear();
    sink.handler(victimFrame([{ k: 'boom', id: 's7#p2', x: 40, y: 0 }], {})); // no hit
    expect(spawnEffect).toHaveBeenCalledWith('splash', 40, 0);
  });

  it('a boom with no id at all is a plain spark (fail-open, never a throw)', () => {
    const { sink, spawnEffect } = setupWater();
    sink.handler(victimFrame([{ k: 'boom', hit: 'foe', x: 5, y: 5 }], {}));
    expect(spawnEffect).toHaveBeenCalledWith('spark', 5, 5);
  });
});

describe('burn identity (Story 2.9) — a damage tick taken inside enemy fire', () => {
  const burning = (by: string) => [{ id: 'z1', x: 0, y: 0, r: 100, until: 9e9, by, mode: 'incendiary' }];
  const dmg = [{ k: 'dmg', id: 'me', amount: 6 }];

  it('reads an ordinary hit as damage: full shake, the impact thud', () => {
    const { sink, play, trigger } = setupWater();
    sink.handler(victimFrame(dmg, {}));
    expect(play).toHaveBeenCalledWith('damage');
    expect(trigger).toHaveBeenCalledWith(6);
  });

  it('reads a tick inside an ENEMY burning zone as BURN: the burn cue, a softened shake', () => {
    const { sink, play, trigger } = setupWater();
    sink.handler(victimFrame(dmg, {}, { litZones: burning('foe') }));
    expect(play).toHaveBeenCalledWith('burn');
    expect(play).not.toHaveBeenCalledWith('damage');
    const shaken = trigger.mock.calls[0][0] as number;
    expect(shaken).toBeGreaterThan(0); // it is still damage — never silent
    expect(shaken).toBeLessThan(6); // ...but a DoT tick, not a slam
  });

  it('our OWN flare never burns us (you cannot set fire to yourself)', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame(dmg, {}, { litZones: burning('me') }));
    expect(play).toHaveBeenCalledWith('damage');
  });

  it('a NON-incendiary enemy zone is not fire, and neither is standing outside one', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame(dmg, {}, { litZones: [{ ...burning('foe')[0], mode: 'dazzle' }] }));
    expect(play).toHaveBeenCalledWith('damage');
    play.mockClear();
    sink.handler(victimFrame(dmg, {}, { litZones: [{ ...burning('foe')[0], x: 900 }] }));
    expect(play).toHaveBeenCalledWith('damage');
  });

  // --- 2.9 REVIEW: burn is a CLASSIFICATION, not a location -------------------
  //
  // "Is there fire under the hull right now" was wrong in both directions. A
  // torpedo that slams a hull parked in a burning patch is not a crackle, and
  // the last DoT flush of a fire we have already sailed clear of is not a shell.

  it('reads a BIG hit taken inside the fire as the slam it was', () => {
    const { sink, play, trigger } = setupWater();
    sink.handler(victimFrame([{ k: 'dmg', id: 'me', amount: 40 }], {}, { litZones: burning('foe') }));
    expect(play).toHaveBeenCalledWith('damage');
    expect(play).not.toHaveBeenCalledWith('burn');
    expect(trigger).toHaveBeenCalledWith(40); // full amplitude — a torpedo, not a tick
  });

  it('still reads a DoT flush that lands just after the fire left the frame', () => {
    const { sink, play, trigger } = setupWater();
    // Frame 1 (t=1000): standing in the fire, no damage yet.
    sink.handler(victimFrame([], {}, { litZones: burning('foe') }));
    // Frame 2: the zone is gone from the list (expired, or we sailed clear) and
    // the server's aggregated flush for the window we DID burn in arrives.
    sink.handler({
      t: 1400, tick: 4, ackSeq: 0, contacts: [], mines: [],
      events: [{ k: 'dmg', id: 'me', amount: 6 }],
      you: { x: 0, y: 0, heading: 0, speed: 0, cls: 'torpedoBoat', boons: [], alive: true, sweep: 0 },
    });
    expect(play).toHaveBeenLastCalledWith('burn');
    expect(trigger).toHaveBeenLastCalledWith(6 * CLIENT_CONFIG.litZone.burnShakeScale);
  });

  it('lets the grace EXPIRE — a hit long after the fire is an ordinary hit', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([], {}, { litZones: burning('foe') })); // t=1000
    sink.handler({
      t: 6000, tick: 9, ackSeq: 0, contacts: [], mines: [],
      events: [{ k: 'dmg', id: 'me', amount: 6 }],
      you: { x: 0, y: 0, heading: 0, speed: 0, cls: 'torpedoBoat', boons: [], alive: true, sweep: 0 },
    });
    expect(play).toHaveBeenLastCalledWith('damage');
  });

  it('a small hit with NO fire in our history is still an ordinary hit', () => {
    const { sink, play, trigger } = setupWater();
    sink.handler(victimFrame([{ k: 'dmg', id: 'me', amount: 2 }], {}));
    expect(play).toHaveBeenCalledWith('damage');
    expect(trigger).toHaveBeenCalledWith(2);
  });

  it('readsAsBurn pins both halves: recent enough AND small enough', () => {
    const cap = CONFIG.starShells.incendiaryDps * 0.5 * 4;
    expect(readsAsBurn(cap, 0)).toBe(true);
    expect(readsAsBurn(cap, 600)).toBe(true); // the grace's last instant
    expect(readsAsBurn(cap + 0.1, 0)).toBe(false); // too big to be a DoT flush
    expect(readsAsBurn(1, 601)).toBe(false); // too long since the fire
    expect(readsAsBurn(1, Infinity)).toBe(false); // never burned at all
  });

  it('inEnemyBurningZone pins the predicate itself', () => {
    const zones = [
      { id: 'a', x: 0, y: 0, r: 100, until: 9e9, by: 'foe', mode: 'incendiary' as const },
      { id: 'b', x: 0, y: 0, r: 100, until: 9e9, by: 'me', mode: 'incendiary' as const },
    ];
    expect(inEnemyBurningZone(zones, { x: 50, y: 0 }, 'me')).toBe(true);
    expect(inEnemyBurningZone(zones, { x: 100, y: 0 }, 'me')).toBe(true); // on the edge
    expect(inEnemyBurningZone(zones, { x: 101, y: 0 }, 'me')).toBe(false);
    expect(inEnemyBurningZone([zones[1]], { x: 0, y: 0 }, 'me')).toBe(false); // our own flare
    expect(inEnemyBurningZone([], { x: 0, y: 0 }, 'me')).toBe(false);
  });
});

describe('victim tells (Story 2.9) — SLOWED / DAZZLED cue edges', () => {
  it('fires each cue ONCE on the rising edge, and never on a refresh', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([], { slowedUntil: 4000 }));
    expect(play).toHaveBeenCalledWith('slowed');
    play.mockClear();
    sink.handler(victimFrame([], { slowedUntil: 4000 })); // still running
    sink.handler(victimFrame([], { slowedUntil: 9000 })); // REFRESHED, not re-applied
    expect(play).not.toHaveBeenCalled();
  });

  it('says nothing on the falling edge (the line simply disappears)', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([], { dazzledUntil: 4000 }));
    play.mockClear();
    sink.handler(victimFrame([], { dazzledUntil: 0 })); // expired
    expect(play).not.toHaveBeenCalled();
  });

  it('re-fires when the affliction lands AGAIN after ending', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([], { slowedUntil: 1500 }));
    sink.handler(victimFrame([], {})); // clear
    play.mockClear();
    sink.handler(victimFrame([], { slowedUntil: 3000 })); // fouled a second time
    expect(play).toHaveBeenCalledWith('slowed');
  });

  it('drives the two windows independently, and stays quiet with neither running', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([], {}));
    expect(play).not.toHaveBeenCalled();
    sink.handler(victimFrame([], { slowedUntil: 4000, dazzledUntil: 4000 }));
    expect(play).toHaveBeenCalledWith('slowed');
    expect(play).toHaveBeenCalledWith('dazzled');
  });

  it('a spectator frame (no `you`) clears both without a sound', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([], { slowedUntil: 4000 }));
    play.mockClear();
    sink.handler(victimFrame([], null)); // died mid-window
    expect(play).not.toHaveBeenCalled();
  });

  it('windowRunning measures against the FRAME\'s own server time', () => {
    expect(windowRunning(1001, 1000)).toBe(true);
    expect(windowRunning(1000, 1000)).toBe(false); // expires AT the instant
    expect(windowRunning(undefined, 1000)).toBe(false); // never started
  });
});

describe('the fit cue is transposed by CATEGORY (Story 2.9 carry-over)', () => {
  it('plays the tier tone at its category\'s detune', () => {
    document.body.replaceChildren();
    const { sink, play } = setupToasts();
    sink.handler(rewardFrame({ k: 'bn', id: 'me', boon: 'mineBlast' }, { alive: true, boons: ['mineBlast'] }));
    expect(play).toHaveBeenCalledWith('fitCommon', { detune: fitDetune('mines') });
  });

  it('gives two same-tier fits on DIFFERENT slots different voices', () => {
    document.body.replaceChildren();
    const { sink, play } = setupToasts();
    sink.handler(rewardFrame({ k: 'bn', id: 'me', boon: 'gunDamage' }, { alive: true, boons: ['gunDamage'] }));
    sink.handler(rewardFrame({ k: 'bn', id: 'me', boon: 'mineBlast' }, { alive: true, boons: ['mineBlast'] }));
    const [first, second] = play.mock.calls;
    expect(first[0]).toBe(second[0]); // same tier → same tone id
    expect(first[1]).not.toEqual(second[1]); // ...heard as a different event
  });

  it('an unknown boon still sounds — common weight, untransposed root', () => {
    document.body.replaceChildren();
    const { sink, play } = setupToasts();
    sink.handler(rewardFrame({ k: 'bn', id: 'me', boon: 'notARealBoon' }, { alive: true, boons: ['x'] }));
    expect(play).toHaveBeenCalledWith('fitCommon', { detune: 0 });
  });
});
