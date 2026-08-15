// Story 0.2: bindRoom wires the SDK's same-Room auto-reconnect signals. onDrop
// delegates to deps.onDrop (main.ts shows the RECONNECTING banner); onReconnect
// resets the own-ship interp buffer + predictor (so the resumed ship hard-inits
// from authoritative truth instead of replaying stale un-acked inputs) and then
// delegates to deps.onReconnect (banner cleared). It ALSO arms a one-shot camera
// snap consumed on the first resumed frame — completing the handleSpawn mirror —
// and reverts the primed weapon to the gun (the sunk-path symmetry: a resume is
// a hard boundary, so a pre-outage prime never fires on the first click back).
import { describe, expect, it, vi } from 'vitest';
import { CONFIG, MSG } from '@salvo/shared';
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
import { UNKNOWN_VESSEL } from '../ui/killFeed';
import { KILL_LEADER_MARK } from '../ui/bounty';

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
  const play = vi.fn();
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
    // THE SOUND MAP (Story 4.7): a burst is a placed world cue now, so this
    // harness needs both the tone player and a listener position. These frames
    // are SPECTATOR frames (no `you`), which is exactly the camera-centre leg.
    audio: { play },
    cameraCenter: () => ({ x: 0, y: 0 }),
    onSunkObserved: vi.fn(),
    onSpectate: vi.fn(),
    colors: vi.fn(() => null),
    ordnanceHue: vi.fn(() => 0),
    ...(over.ownBurstRadius ? { ownBurstRadius: over.ownBurstRadius } : {}),
  } as unknown as RoomBindingDeps;
  bindRoom(conn, deps);
  return { sink, onBurst, spawnEffect, onBallisticUpdate, play };
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
      respawnArmed: () => true, // the ready-room shape: the server DID arm a respawn
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

  // Story 5.2 (amendments 10/16): the `sunk` event still fires at SINK-ENTRY,
  // unmoved — but the hull is not gone yet. Clearing the engine order here
  // would stop the ship the five-second window exists to keep sailing (rudder
  // authority scales with speed, so it takes the helm with it), and reverting
  // the prime would steal the torpedo a captain went down intending to fire.
  // Both move to FOUNDER (main.ts's tickSinkingWindow). Everything else on the
  // path — the score credit, the feed line, the killer, the respawn ETA — is
  // deliberately unchanged: the kill is real the moment it lands.
  it('HOLDS both resets while the hull is inside its sinking window', () => {
    const room = fakeRoom();
    const sink: { handler: (f: unknown) => void } = { handler: () => undefined };
    const conn = { room, welcome: {}, sink } as unknown as Connection;
    const resetThrottle = vi.fn();
    const resetPrime = vi.fn();
    const onSunkObserved = vi.fn();
    const state = {
      net: { you: null, sessionId: 'me', tick: 0, ackSeq: 0 },
      spectating: false, phase: '', respawnEta: null, killerId: null, mode: 'interp',
    };
    const deps = {
      state,
      clock: { addSample: vi.fn() },
      contacts: { pushFrame: vi.fn() },
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
      onOwnStats: vi.fn(),
      ownBuffer: { push: vi.fn() },
      radar: { onSweepSample: vi.fn() },
      resetThrottle,
      respawnArmed: () => true, // the ready-room shape: the server DID arm a respawn
      resetPrime,
      onSunkObserved,
    } as unknown as RoomBindingDeps;
    bindRoom(conn, deps);
    // The frame that carries the `sunk` also carries the own ship with the
    // self-private founder deadline — handleFrame adopts `you` before it routes
    // events, so the window is read off the very frame that opened it.
    const you = {
      id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 0, alive: false, ammo: [], sweep: 0,
      cls: 'torpedoBoat', pts: 0, offer: [], boostUntil: 0, boons: [], lvl: 0, xp: 0,
      repairHp: 0, sinkingUntil: 5200,
    };
    sink.handler({ t: 200, tick: 2, ackSeq: 0, you, contacts: [], mines: [], events: [{ k: 'sunk', id: 'me', by: 'rival' }] });
    expect(resetThrottle).not.toHaveBeenCalled();
    expect(resetPrime).not.toHaveBeenCalled();
    // ...while the bookkeeping the amendment pins to sink-entry all still lands.
    expect(onSunkObserved).toHaveBeenCalledWith('me', 'rival');
    expect(state.killerId).toBe('rival');
    expect(state.respawnEta).not.toBeNull();
  });
});

// --- THE RESPAWN DEADLINE IS THE SERVER'S TO ARM (Story 5.2 review fix) ------
//
// `respawnEta` used to be set on EVERY own sinking, on the reasoning that "in
// active this ETA is never used — the same frame carries spec:true". The
// sinking window broke that: `spec` now arrives five seconds later, and for the
// ~½ RTT between founder and its arrival `renderAlive` is still the render path
// with `conning(status)` freshly false, so hud.ts drew `SUNK — RESPAWNING IN 0s`
// (0s because respawnDelay 3000 < the 5000 window) over the middle of a LIVE
// match, where no respawn was ever armed.

describe('bindRoom own sunk — the respawn ETA', () => {
  function setupEta(armed: boolean) {
    const room = fakeRoom();
    const sink: { handler: (f: unknown) => void } = { handler: () => undefined };
    const conn = { room, welcome: {}, sink } as unknown as Connection;
    const state = {
      net: { you: null, sessionId: 'me', tick: 0, ackSeq: 0 },
      spectating: false, phase: '', respawnEta: null, killerId: null, mode: 'interp',
    };
    const spawnEffect = vi.fn();
    const deps = {
      state,
      clock: { addSample: vi.fn() },
      contacts: { pushFrame: vi.fn(), get: () => null },
      contactViews: { markSunk: vi.fn(), sinkFlash: vi.fn(), setSink: vi.fn() },
      mines: { sync: vi.fn() },
      ownBurstRadius: () => undefined,
      ownMineRings: () => undefined,
      litZones: { sync: vi.fn() },
      decoys: { sync: vi.fn() },
      effects: { spawnEffect },
      audio: { play: vi.fn() },
      names: (id: string) => id,
      colors: () => null,
      ordnanceHue: () => 0,
      onOwnStats: vi.fn(),
      ownBuffer: { push: vi.fn() },
      radar: { onSweepSample: vi.fn() },
      predictor: { onServerState: vi.fn() },
      resetThrottle: vi.fn(),
      resetPrime: vi.fn(),
      respawnArmed: () => armed,
      onSpectate: vi.fn(),
      onSunkObserved: vi.fn(),
    } as unknown as RoomBindingDeps;
    bindRoom(conn, deps);
    document.getElementById('kill-feed')?.remove();
    return { sink, state, spawnEffect };
  }

  /** An own-ship frame carrying the third state (dead on the wire, still sailing). */
  const sinkingFrame = (t: number, x: number, y: number, events: unknown[] = []): unknown => ({
    t, tick: 1, ackSeq: 0, contacts: [], mines: [], events,
    you: {
      id: 'me', x, y, heading: 0, speed: 10, hp: 0, alive: false, ammo: [], sweep: 0,
      cls: 'torpedoBoat', pts: 0, offer: [], boons: [], boostUntil: 0, lvl: 0, xp: 0,
      repairHp: 0, sinkingUntil: 1000 + CONFIG.ship.sinkingWindowMs,
    },
  });

  it('the READY ROOM still arms one — the overlay reads it exactly as before', () => {
    const { sink, state } = setupEta(true);
    sink.handler(sinkingFrame(1000, 0, 0, [{ k: 'sunk', id: 'me', by: 'rival' }]));
    expect(state.respawnEta).toBe(1000 + CONFIG.ship.respawnDelay);
  });

  it('an ACTIVE match arms NONE — no client-side promise the server never made', () => {
    const { sink, state } = setupEta(false);
    sink.handler(sinkingFrame(1000, 0, 0, [{ k: 'sunk', id: 'me', by: 'rival' }]));
    expect(state.respawnEta).toBeNull(); // ...so the placard has nothing to count down
  });

  // --- OWN AND ENEMY WRECKS LAND ON THE SAME BEAT ---------------------------

  it('OUR OWN sink plume lands at the KILLING BLOW, where we were holed', () => {
    const { sink, state, spawnEffect } = setupEta(false);
    sink.handler(sinkingFrame(1000, 12, -8, [{ k: 'sunk', id: 'me', by: 'rival', seen: true }]));
    // Amendment 32: our own hull blows up where it took the fatal hit, on the
    // tick it took it — the same beat our death groan already sounded on.
    expect(spawnEffect).toHaveBeenCalledWith('sink', 12, -8);
    expect(spawnEffect).toHaveBeenCalledTimes(1);
    // Five seconds of sinking, sailed: the hull ends up well away from where it
    // was holed, and NOTHING further detonates out there. The founder frame is
    // the spec frame the server sends when the window closes.
    sink.handler(sinkingFrame(1000 + CONFIG.ship.sinkingWindowMs - 50, 220, -40));
    sink.handler({
      t: 1000 + CONFIG.ship.sinkingWindowMs, tick: 2, ackSeq: 0, spec: true,
      contacts: [], mines: [], events: [],
    });
    expect(spawnEffect).toHaveBeenCalledTimes(1); // no second explosion at founder
    expect(state.spectating).toBe(true);
  });
});

// --- own spawn resets the LOCAL foghorn cooldown gate (review fix) ----------
//
// The server clears `nextHonkAt` on respawn AND redeploy (world.ts:2620,
// :879-886), but the client's mirror (`Game.nextHonkAt`) only ever advances —
// nothing reset it. Concrete failure this closes: honk, die immediately,
// respawn inside the 1.5s cooldown window. The server would accept the press
// (its own gate reset at spawn too), but the client's stale gate silently ate
// it — and since a denied honk is now silent by design (Eric ruling
// 2026-08-05, main.ts handleFoghornPress), the player got NOTHING with no
// explanation at all.
//
// Deliberately NOT wired through reconnect (unlike resetPrime): a reconnect
// resumes an IN-PROGRESS life, and a mid-life cooldown the server still
// enforces must keep holding.

describe('bindRoom own spawn resets the honk cooldown', () => {
  function setupSpawn() {
    const room = fakeRoom();
    const sink: { handler: (f: unknown) => void } = { handler: () => undefined };
    const conn = { room, welcome: {}, sink } as unknown as Connection;
    const resetThrottle = vi.fn();
    const resetHonkCooldown = vi.fn();
    const onOwnSpawn = vi.fn();
    const forceSnap = vi.fn();
    const ownBufferClear = vi.fn();
    const deps = {
      state: { net: { you: null, sessionId: 'me', tick: 0, ackSeq: 0 }, spectating: false, phase: '', respawnEta: null, mode: 'interp' },
      clock: { addSample: vi.fn() },
      contacts: { pushFrame: vi.fn(), clear: vi.fn() },
      contactViews: { markSpawn: vi.fn(), sinkFlash: vi.fn(), setSink: vi.fn() },
      ownBuffer: { clear: ownBufferClear },
      predictor: { forceSnap },
      mines: { sync: vi.fn() },
      ownBurstRadius: () => undefined,
      ownMineRings: () => undefined,
      litZones: { sync: vi.fn() },
      decoys: { sync: vi.fn() },
      resetThrottle,
      respawnArmed: () => true, // the ready-room shape: the server DID arm a respawn
      resetHonkCooldown,
      onOwnSpawn,
      colors: () => null,
      ordnanceHue: () => 0,
    } as unknown as RoomBindingDeps;
    bindRoom(conn, deps);
    return { sink, resetThrottle, resetHonkCooldown, onOwnSpawn, forceSnap, ownBufferClear };
  }

  const spawnFrame = (e: unknown): unknown => ({ t: 300, tick: 3, ackSeq: 0, contacts: [], mines: [], events: [e] });

  it('resets nextHonkAt on the OWN spawn, alongside the existing resetThrottle/forceSnap trio', () => {
    const { sink, resetThrottle, resetHonkCooldown, onOwnSpawn, forceSnap, ownBufferClear } = setupSpawn();
    sink.handler(spawnFrame({ k: 'spawn', id: 'me', x: 10, y: 20 }));
    expect(resetHonkCooldown).toHaveBeenCalledTimes(1);
    // Mirrors the existing own-spawn side effects it hangs alongside — proves
    // this is the same branch, not a new one.
    expect(resetThrottle).toHaveBeenCalledTimes(1);
    expect(forceSnap).toHaveBeenCalledTimes(1);
    expect(ownBufferClear).toHaveBeenCalledTimes(1);
    expect(onOwnSpawn).toHaveBeenCalledWith(10, 20);
  });

  it('does NOT reset on a CONTACT spawn (someone else respawning)', () => {
    const { sink, resetHonkCooldown, onOwnSpawn } = setupSpawn();
    sink.handler(spawnFrame({ k: 'spawn', id: 'someone-else', x: 10, y: 20 }));
    expect(resetHonkCooldown).not.toHaveBeenCalled();
    expect(onOwnSpawn).not.toHaveBeenCalled();
  });

  it('regression: the local cooldown gate would otherwise survive a death, eating an accepted respawn honk with zero feedback', () => {
    // This is the exact bug scenario, expressed against handleFoghornPress's
    // OWN logic (sim/inputSampler.ts hornPressVerdict) rather than re-deriving
    // it: a stale g.nextHonkAt from before death reads as "still cooling" on
    // the very next tick after respawn unless something zeroes it.
    const { sink, resetHonkCooldown } = setupSpawn();
    let nextHonkAt = 1_000_000; // armed by a honk just before death
    resetHonkCooldown.mockImplementation(() => {
      nextHonkAt = 0;
    });
    sink.handler(spawnFrame({ k: 'spawn', id: 'me', x: 0, y: 0 }));
    // Respawning "inside" the old cooldown window (server time barely moved)
    // must now read as ready, because the gate was reset at spawn.
    const now = 1_000_050; // well before the OLD nextHonkAt, well after 0
    expect(now >= nextHonkAt).toBe(true); // 'honk', not 'denied' — the press IS sent
  });
});

// --- the public register (PV 23): `seen` gates the spatial half --------------

describe('bindRoom sunk — seen gates the sink plume and the contact teardown', () => {
  function setupSunk(
    names: (id: string) => string | null = (id) => id.toUpperCase(),
    // The last-known contact snapshot. Null models a wreck whose contact has
    // already aged out of the store — the Story 4.7 "witnessed but unplaceable"
    // case, which still SOUNDS (unpanned, at the floor).
    contactPos: { x: number; y: number } | null = { x: 40, y: 50 },
  ) {
    // MUTABLE, so the suite can sail the hull on between sink-entry and founder
    // and prove the plume does NOT follow it — since amendment 32 the mark is
    // struck where the hull was holed and stays there.
    let pos = contactPos;
    const room = fakeRoom();
    const sink: { handler: (f: unknown) => void } = { handler: () => undefined };
    const conn = { room, welcome: {}, sink } as unknown as Connection;
    const spawnEffect = vi.fn();
    const markSunk = vi.fn();
    // THE SINKING BEAT'S two new spatial seams (Story 5.2 fix): the
    // sink-entry kill flash and the per-frame settle push. Both ride the SAME
    // `seen`-gated queue entry the plume does, which is what the suite proves.
    const sinkFlash = vi.fn();
    const setSink = vi.fn();
    const play = vi.fn();
    const onSunkObserved = vi.fn();
    const deps = {
      state: {
        net: { you: null, sessionId: 'me', tick: 0, ackSeq: 0 },
        spectating: true, phase: '', respawnEta: null, killerId: null, mode: 'interp',
      },
      clock: { addSample: vi.fn() },
      contacts: {
        pushFrame: vi.fn(),
        // The stale last-known snapshot resolves a position by default — the
        // point of the suite is that `seen` (not availability) gates its use.
        get: () => (pos ? { newest: pos } : null),
      },
      contactViews: { markSunk, sinkFlash, setSink, flash: vi.fn(), markSpawn: vi.fn() },
      mines: { sync: vi.fn() },
      ownBurstRadius: () => undefined,
      ownMineRings: () => undefined,
      litZones: { sync: vi.fn() },
      decoys: { sync: vi.fn() },
      effects: { spawnEffect },
      audio: { play },
      // Story 4.7: this harness spectates (`you` is null), so the witnessed
      // sinking's cue is placed relative to the camera centre.
      cameraCenter: () => ({ x: 0, y: 0 }),
      names,
      colors: () => null,
      ordnanceHue: () => 0,
      resetThrottle: vi.fn(),
      respawnArmed: () => true,
      resetPrime: vi.fn(),
      onSunkObserved,
    } as unknown as RoomBindingDeps;
    bindRoom(conn, deps);
    document.getElementById('kill-feed')?.remove();
    return {
      sink,
      spawnEffect,
      markSunk,
      sinkFlash,
      setSink,
      play,
      onSunkObserved,
      /** Sail the still-fighting hull on (or age its contact out with null). */
      moveContact: (p: { x: number; y: number } | null) => void (pos = p),
    };
  }

  const SUNK_T = 500;
  const sunkFrame = (event: unknown): unknown =>
    ({ t: SUNK_T, tick: 5, ackSeq: 0, spec: true, contacts: [], mines: [], events: [event] });

  /** An empty frame at server time `t` — the client's only exact reading of the
   *  server clock, and therefore what drives the deferred founder flush. */
  const tickFrame = (t: number): unknown =>
    ({ t, tick: 6, ackSeq: 0, spec: true, contacts: [], mines: [], events: [] });

  const feedLines = (): string[] => {
    const feed = document.getElementById('kill-feed');
    return [...(feed?.children ?? [])].map((el) => el.textContent ?? '');
  };

  it('an UNSEEN sunk prints the feed line but spawns NO sink effect and calls NO markSunk', () => {
    const { sink, spawnEffect, markSunk, onSunkObserved } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer' }));
    expect(feedLines()).toEqual(['VICTIM SUNK BY KILLER']); // identity is public...
    expect(spawnEffect).not.toHaveBeenCalled(); // ...but a stale position never draws a plume
    expect(markSunk).not.toHaveBeenCalled();
    expect(onSunkObserved).toHaveBeenCalledWith('victim', 'killer'); // score rides regardless
  });

  // --- THE PLUME MARKS THE KILLING BLOW (amendment 32, 2026-08-14) ----------
  //
  // The `sunk` event fires at SINK-ENTRY (amendment 11) on a hull that keeps
  // steering and shooting for five more seconds (amendment 10). Amendment 18
  // moved the WHOLE spatial presentation to founder for that reason, and Eric
  // took the plume back out of it: *"There is a red explosion when the ship
  // sinks all the way. Makes no sense?... Slowly fading to black is indication
  // enough that it has sunk."* So the split is now WITHIN the spatial half —
  // the crimson mark strikes where the hit landed, the persistent wreck LOOK
  // still waits for the hull to actually go down.

  it('a SEEN sunk prints the line AND blows up NOW — but wears no wreck yet', () => {
    const { sink, spawnEffect, markSunk } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', seen: true }));
    expect(feedLines()).toEqual(['VICTIM SUNK BY KILLER']); // identity, immediately
    expect(spawnEffect).toHaveBeenCalledWith('sink', 40, 50); // ...and the mark, immediately
    expect(markSunk).not.toHaveBeenCalled(); // the hull is still fighting — no wreck look
  });

  it('...and the wreck look holds off for the WHOLE window, to the last tick', () => {
    const { sink, markSunk } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', seen: true }));
    sink.handler(tickFrame(SUNK_T + CONFIG.ship.sinkingWindowMs - 1));
    expect(markSunk).not.toHaveBeenCalled();
  });

  it('...then latches the tint at founder, with NO second explosion out there', () => {
    const { sink, spawnEffect, markSunk, moveContact } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', seen: true }));
    // The doomed hull sails on through its window — up to ~110u from where it
    // was holed. The mark does not travel with it, and founder adds nothing to
    // the water: the settle arriving at the wreck look is the whole beat.
    moveContact({ x: 140, y: -60 });
    sink.handler(tickFrame(SUNK_T + CONFIG.ship.sinkingWindowMs));
    expect(spawnEffect).toHaveBeenCalledTimes(1);
    expect(spawnEffect).toHaveBeenCalledWith('sink', 40, 50); // NOT (140,-60)
    expect(markSunk).toHaveBeenCalledWith('victim');
  });

  it('...exactly ONCE each, however many frames follow', () => {
    const { sink, spawnEffect, markSunk } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', seen: true }));
    sink.handler(tickFrame(SUNK_T + CONFIG.ship.sinkingWindowMs));
    sink.handler(tickFrame(SUNK_T + CONFIG.ship.sinkingWindowMs + 50));
    sink.handler(tickFrame(SUNK_T + CONFIG.ship.sinkingWindowMs + 5000));
    expect(spawnEffect).toHaveBeenCalledTimes(1);
    expect(markSunk).toHaveBeenCalledTimes(1);
  });

  it('a replayed `sunk` for the same hull still yields ONE wreck', () => {
    // The dedup guard runs BEFORE the spawn, which is the whole reason the
    // plume lives in openWreckWindow rather than beside the cue: a replayed
    // event must not detonate twice over a hull already going down.
    const { sink, spawnEffect } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', seen: true }));
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', seen: true }));
    sink.handler(tickFrame(SUNK_T + CONFIG.ship.sinkingWindowMs));
    expect(spawnEffect).toHaveBeenCalledTimes(1);
  });

  it('an UNSEEN sunk never queues a wreck — founder comes and goes in silence', () => {
    // The `seen` gate is unchanged, only moved: a fog kill must still never draw
    // a plume at a stale position, at sink-entry OR five seconds later.
    const { sink, spawnEffect, markSunk } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer' }));
    sink.handler(tickFrame(SUNK_T + CONFIG.ship.sinkingWindowMs));
    expect(spawnEffect).not.toHaveBeenCalled();
    expect(markSunk).not.toHaveBeenCalled();
  });

  // --- THE SINKING BEAT IS NO LONGER SILENT (Story 5.2 fix, 2026-08-13) -----
  //
  // Amendment 18 was right to move the WRECK LOOK to founder and wrong to leave
  // the five seconds in between empty: sinking a hull looked like nothing
  // happening followed by a delayed-death bug. The kill flash opens the beat at
  // sink-entry — alongside the plume, since amendment 32 — and the settle walks
  // the hull to the wreck across the window. All three ride the SAME
  // `seen`-gated queue entry, so the fog kill's silence is untouched.

  it('a SEEN sunk flashes the killed hull ONCE, on the sink-entry tick', () => {
    const { sink, sinkFlash } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', seen: true }));
    expect(sinkFlash).toHaveBeenCalledWith('victim');
    expect(sinkFlash).toHaveBeenCalledTimes(1);
  });

  it('a replayed `sunk` never fires a SECOND confirmation bloom', () => {
    const { sink, sinkFlash } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', seen: true }));
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', seen: true }));
    expect(sinkFlash).toHaveBeenCalledTimes(1);
  });

  it('...then settles the hull continuously, arriving at 1 exactly at founder', () => {
    const { sink, setSink, markSunk } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', seen: true }));
    const at = (t: number): number => {
      setSink.mockClear();
      sink.handler(tickFrame(SUNK_T + t));
      expect(setSink).toHaveBeenCalledWith('victim', expect.any(Number));
      return setSink.mock.calls[0][1] as number;
    };
    const quarter = at(CONFIG.ship.sinkingWindowMs / 4);
    const half = at(CONFIG.ship.sinkingWindowMs / 2);
    const last = at(CONFIG.ship.sinkingWindowMs - 50);
    expect(quarter).toBeCloseTo(0.25, 9);
    expect(half).toBeCloseTo(0.5, 9);
    expect(last).toBeGreaterThan(half); // monotone, and never the wreck early
    expect(last).toBeLessThan(1);
    // The founder tick hands over to the wreck look and the hull leaves the
    // queue, so the settle stops pushing — the two can never fight.
    setSink.mockClear();
    sink.handler(tickFrame(SUNK_T + CONFIG.ship.sinkingWindowMs));
    expect(markSunk).toHaveBeenCalledWith('victim');
    expect(setSink).not.toHaveBeenCalled();
  });

  it('an UNSEEN sinking draws NOTHING anywhere — no flash, no settle, no plume', () => {
    // The Public Register's line, whole: identity is public, LOCATION is not.
    // One `seen` gate covers all three spatial channels (openWreckWindow).
    const { sink, sinkFlash, setSink, spawnEffect, markSunk } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer' }));
    for (const t of [1_000, 2_500, CONFIG.ship.sinkingWindowMs, CONFIG.ship.sinkingWindowMs + 50]) {
      sink.handler(tickFrame(SUNK_T + t));
    }
    expect(sinkFlash).not.toHaveBeenCalled();
    expect(setSink).not.toHaveBeenCalled();
    expect(spawnEffect).not.toHaveBeenCalled();
    expect(markSunk).not.toHaveBeenCalled();
  });

  it('a hull unplaceable at the killing blow draws no plume — but still tears down', () => {
    // Today's staleness rule, followed rather than replaced: an unresolvable
    // position simply draws nothing (sunkPosition returns null). No position is
    // invented, the settle still runs, and the teardown does not depend on
    // having one. Rarer since amendment 32 — a hull is nearly always placeable
    // on the tick it is holed — but the guard is the same guard.
    const { sink, spawnEffect, markSunk, setSink, moveContact } = setupSunk();
    moveContact(null);
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', seen: true }));
    expect(spawnEffect).not.toHaveBeenCalled();
    sink.handler(tickFrame(SUNK_T + CONFIG.ship.sinkingWindowMs / 2));
    expect(setSink).toHaveBeenCalled(); // still enrolled in the beat
    sink.handler(tickFrame(SUNK_T + CONFIG.ship.sinkingWindowMs));
    expect(markSunk).toHaveBeenCalledWith('victim');
  });

  it('OUR OWN sinking never calls markSunk on ourselves', () => {
    // The own plume comes off `net.you` (asserted in the own-ship suite above),
    // which this spectating harness never receives — so the plume is simply
    // skipped here, exactly as an unplaceable contact is. What this pins is the
    // teardown: we are not one of our own contacts, at any beat.
    const { sink, spawnEffect, markSunk } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'me', by: 'killer', seen: true }));
    expect(spawnEffect).not.toHaveBeenCalled();
    sink.handler(tickFrame(SUNK_T + CONFIG.ship.sinkingWindowMs));
    expect(markSunk).not.toHaveBeenCalled();
  });

  it('an OWN fog kill still plays the kill tone and reaches onSunkObserved', () => {
    const { sink, spawnEffect, markSunk, play, onSunkObserved } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'me' })); // no seen — fog kill
    expect(play).toHaveBeenCalledWith('kill'); // your victim went down, witnessed or not
    expect(onSunkObserved).toHaveBeenCalledWith('victim', 'me'); // "SHIPS YOU SANK" credit
    expect(spawnEffect).not.toHaveBeenCalled(); // still no spatial render
    expect(markSunk).not.toHaveBeenCalled();
  });

  // --- THE KILL LEADER'S MARK (Story 4.6, 2026-08-10 rework) -----------------
  // `bty` is the server's PRE-SINK truth — WHICH participant held the throne
  // when the hull went down ('v' victim, 'k' killer). handleSunk takes it
  // verbatim: comparing against the client's own `bountyId` would race the
  // schema patch riding the same frame. The skull rides the leader's NAME
  // (the retired CLAIMED/LIFTED trailing connectives are gone).

  it("a victim-leads sinking ('v') marks the victim's name in the shipped line", () => {
    const { sink } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', bty: 'v' }));
    expect(feedLines()).toEqual([`${KILL_LEADER_MARK} VICTIM SUNK BY KILLER`]);
  });

  it("a killer-leads sinking ('k') marks the killer's name instead", () => {
    const { sink } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', bty: 'k' }));
    expect(feedLines()).toEqual([`VICTIM SUNK BY ${KILL_LEADER_MARK} KILLER`]);
  });

  it("a storm sink of the leader ('v', no killer) marks the LOST line", () => {
    const { sink } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: null, bty: 'v' }));
    expect(feedLines()).toEqual([`${KILL_LEADER_MARK} VICTIM LOST WITH ALL HANDS`]);
  });

  it("a SELF-sink of the holder (by === id) is the VICTIM case — one mark, on the victim", () => {
    // The server resolves by === id as 'v' (one throne, one mark); the line
    // simply wears the skull on the victim's name in both positions' text.
    const { sink } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'victim', bty: 'v' }));
    expect(feedLines()).toEqual([`${KILL_LEADER_MARK} VICTIM SUNK BY VICTIM`]);
  });

  it('an ORDINARY sinking is byte-identical to before — no mark without the channel', () => {
    const { sink } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer' }));
    expect(feedLines()).toEqual(['VICTIM SUNK BY KILLER']);
    expect(feedLines().join('')).not.toContain(KILL_LEADER_MARK);
  });

  it('the mark changes ONLY the copy — it drives no effect, no teardown, no extra tone', () => {
    const { sink, spawnEffect, markSunk, play } = setupSunk();
    // Unwitnessed, as a fog kill of the leader by a third party would be.
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', bty: 'v' }));
    expect(spawnEffect).not.toHaveBeenCalled(); // the throne discloses no position
    expect(markSunk).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled(); // not our kill, not our hull
  });

  it('a roster miss renders the neutral UNKNOWN VESSEL label — NEVER the raw session id', () => {
    // Both vessels have already LEFT the room: the roster resolves no callsign
    // for either. Under the GLOBAL feed (PV 23) this line reaches EVERY client,
    // so a raw-session-id fallback here would print transport plumbing into
    // every feed in the match.
    const { sink } = setupSunk(() => null);
    sink.handler(sunkFrame({ k: 'sunk', id: 'sess_victim1', by: 'sess_killer2' }));
    expect(feedLines()).toEqual([`${UNKNOWN_VESSEL} SUNK BY ${UNKNOWN_VESSEL}`]);
    expect(feedLines().join('')).not.toContain('sess_'); // the raw id appears nowhere
    // The roster-miss name segments stay UNCOLORED (colors() misses the same
    // entry and returns null): no span carries an inline personal-hue color.
    const spans = [...(document.getElementById('kill-feed')?.querySelectorAll('span') ?? [])];
    expect(spans.length).toBeGreaterThan(0);
    for (const span of spans) expect((span as HTMLElement).style.color).toBe('');
  });

  // --- THE SOUND MAP's sinking cue (Story 4.7) -------------------------------
  //
  // ONE CUE PER SINKING, chosen by a strict, mutually exclusive priority: your
  // own death (`sink`), your credited kill (`kill`), else a WITNESSED sinking
  // (`sunkWitness`). The last clause is gated on exactly the stamp the sink
  // plume is gated on, and for the same reason: `sunk` carries no position, so
  // the only position available is a stale contact — a fog kill that made a
  // noise would confirm "that death happened near where I last saw them", which
  // is the one thing `seen` exists to protect (amendments 29-34).

  const toneIds = (play: ReturnType<typeof vi.fn>): string[] => play.mock.calls.map(([id]) => id as string);

  it('a WITNESSED third-party sinking groans once, placed at the wreck', () => {
    const { sink, play } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', seen: true }));
    expect(toneIds(play)).toEqual(['sunkWitness']);
    // Placed: this harness spectates from the camera centre (0,0) and the
    // wreck's last-known contact is at (40,50), so the cue leans right and is
    // loud (a sinking almost on top of us).
    const opts = play.mock.calls[0][1] as { pan: number; gain: number };
    expect(opts.pan).toBeGreaterThan(0);
    expect(opts.gain).toBeGreaterThan(0.9);
  });

  it('THE DISCLOSURE RULE: an UNSEEN third-party sinking is COMPLETELY SILENT', () => {
    const { sink, play } = setupSunk();
    // The Public Register's fog kill: the feed line is the ratified public fact,
    // and it prints (asserted in the plume suite above). Nothing sounds — the
    // cue would carry the PLACE, which is not ours to have.
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer' }));
    expect(toneIds(play)).toEqual([]);
  });

  it('YOUR OWN DEATH plays the sink alarm ALONE, witnessed or not', () => {
    const { sink, play } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'me', by: 'killer', seen: true }));
    expect(toneIds(play)).toEqual(['sink']); // never the witness groan on top
  });

  it('YOUR CREDITED KILL plays the chime ALONE, even when you watched it go down', () => {
    // The chime is the CREDIT and the groan is the hull; stacking both would
    // smear one second into two overlapping low tones for nothing gained.
    const { sink, play } = setupSunk();
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'me', seen: true }));
    expect(toneIds(play)).toEqual(['kill']);
  });

  // --- A SINKING IS TERMINAL, NOT A SALVO (review gate) ---------------------
  //
  // The 300ms floor answers "how often may ONE SOURCE make a noise". Two hulls
  // going down are two sources — and a hull sinks exactly once. In a ring-closure
  // scrum the feed prints both lines; both must be heard.
  const sunkAt = (t: number, event: unknown): unknown =>
    ({ t, tick: 5, ackSeq: 0, spec: true, contacts: [], mines: [], events: [event] });

  it('TWO hulls sinking 200ms apart both groan — a sinking is not rate-limited', () => {
    const { sink, play } = setupSunk();
    sink.handler(sunkAt(1000, { k: 'sunk', id: 'victim', by: 'killer', seen: true }));
    sink.handler(sunkAt(1200, { k: 'sunk', id: 'other', by: 'killer', seen: true }));
    expect(toneIds(play)).toEqual(['sunkWitness', 'sunkWitness']);
  });

  it('a witnessed wreck we can no longer PLACE still sounds — unpanned, at the floor', () => {
    // We saw it go down, so the FACT is legitimately ours; only the bearing is
    // unavailable (the contact aged out of the store). Dropping the cue would
    // withhold something already disclosed.
    const { sink, play } = setupSunk(undefined, null);
    sink.handler(sunkFrame({ k: 'sunk', id: 'victim', by: 'killer', seen: true }));
    expect(play).toHaveBeenCalledWith('sunkWitness', { pan: 0, gain: CLIENT_CONFIG.audio.worldFloorGain });
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

  // DAMAGE CONTROL (cycle 46): the `heal` row is a pure self-private
  // CONFIRMATION — one tone, no toast, no numbers. Every authoritative value
  // (the new hp, the pool still draining) self-syncs on `you` every frame, and
  // the visual twin is the HP rail's jump plus its incoming band.
  it('a heal plays the heal cue and toasts NOTHING', () => {
    document.body.replaceChildren();
    const { sink, play } = setupToasts();
    sink.handler(rewardFrame({ k: 'heal', id: 'me' }, { alive: true }));
    expect(play).toHaveBeenCalledWith('heal');
    expect(toastLines()).toEqual([]);
  });

  it('a heal is NOT dead-gated — spending while dead is legal and still confirms', () => {
    document.body.replaceChildren();
    const { sink, play } = setupToasts();
    sink.handler(rewardFrame({ k: 'heal', id: 'me' }, { alive: false }));
    expect(play).toHaveBeenCalledWith('heal');
  });

  it("another ship's heal is ignored (defensive — the row is self-private)", () => {
    document.body.replaceChildren();
    const { sink, play } = setupToasts();
    sink.handler(rewardFrame({ k: 'heal', id: 'someone-else' }, { alive: true }));
    expect(play).not.toHaveBeenCalled();
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

  it('a level-up bank is NOT a spend ack (only `bn` and `heal` are)', () => {
    document.body.replaceChildren();
    const { sink, onSpendAck } = setupToasts();
    sink.handler(rewardFrame({ k: 'pt', id: 'me' }, { alive: true }));
    expect(onSpendAck).not.toHaveBeenCalled();
  });

  // CYCLE 44 REVIEW-GATE REGRESSION (flagged by BOTH review models): a heal is
  // the OTHER way a spend can land, so it must ack the latch exactly as `bn`
  // does. Without the ack, `spendOutcome` falls back to inference off `you` —
  // and a heal spent with a second level queued behind an IDENTICAL-signature
  // offer leaves both `pts` and the front-offer signature unchanged, so the
  // latch times out at 1.5s and pulses a DENIAL over a heal the server granted.
  it('routes a SELF heal to deps.onSpendAck (the spend latch receipt)', () => {
    document.body.replaceChildren();
    const { sink, onSpendAck } = setupToasts();
    sink.handler(rewardFrame({ k: 'heal', id: 'me' }, { alive: true }));
    expect(onSpendAck).toHaveBeenCalledTimes(1);
  });

  it("another ship's heal never acks OUR spend latch", () => {
    document.body.replaceChildren();
    const { sink, onSpendAck } = setupToasts();
    sink.handler(rewardFrame({ k: 'heal', id: 'someone-else' }, { alive: true }));
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

function setupWater(
  ownFire: OwnFire = null,
  camera: { x: number; y: number } = { x: 0, y: 0 },
  // The own-correlated blast radius (render/aimPreview.ownBurstRadius): a number
  // for a burst the click latch claims as OURS, undefined for every burst we
  // cannot honestly claim. It sizes the ring AND — since the review gate — the
  // own-hull cue suppression, so the suite can drive both from one seam.
  burstRadius: number | undefined = undefined,
) {
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
    contactViews: { flash, sinkFlash: vi.fn(), setSink: vi.fn() },
    mines: { sync: vi.fn() },
    // The own-private preview seams (aim-preview cycle): the burst ring's
    // effective radius and the own-mine rings. Both fail to `undefined` by
    // default, which is exactly the pre-stats behavior (CONFIG default / no rings).
    ownBurstRadius: () => burstRadius,
    ownMineRings: () => undefined,
    litZones: { sync: vi.fn() },
    decoys: { sync: vi.fn() },
    projectiles: { onShell, onBoom: vi.fn(), onBurst: vi.fn(), onBallisticUpdate: vi.fn(), ownFireOf: () => null },
    effects: { spawnEffect },
    shake: { trigger },
    audio: { play },
    // Story 4.7: the listener falls back to the camera on the spec-frame cases
    // this harness also drives (victimFrame with a null `you`).
    cameraCenter: () => camera,
    onOwnStats: vi.fn(),
    onOwnSpawn: vi.fn(),
    onSpectate: vi.fn(),
    ordnanceHue: () => 0,
    colors: () => null,
    ownFireWeapon,
    // The sunk-path seams, stubbed so a death frame can be driven through this
    // same harness (the frame-aggregate suite pins thud-before-sink ordering).
    names: (id: string) => id,
    onSunkObserved: vi.fn(),
    resetThrottle: vi.fn(),
    respawnArmed: () => true,
    resetPrime: vi.fn(),
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

  it('an OWN gun shot keeps its crack — and no longer flashes from here (Story 4.3)', () => {
    const { sink, play, spawnEffect, onShell } = setupWater('gun');
    sink.handler(victimFrame([{ k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 900 }], {}));
    // A REAL claim: look 'gun' AND claim 'gun' (this one may size a burst ring).
    expect(onShell).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 'gun', 'gun');
    // The universal flash is the server's `mz` row now; handleShell only ever
    // adds the own cannon's extra weight on top of it.
    expect(spawnEffect).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledWith('fireGun');
  });

  it('with NO latch (nothing fired recently) an own reveal falls back to the gun', () => {
    const { sink, play, spawnEffect, onShell } = setupWater(null);
    sink.handler(victimFrame([{ k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 900 }], {}));
    // The ratified fallback: it LOOKS and SOUNDS like our gun (pre-2.9
    // behavior, unchanged) but it CLAIMED nothing — the third argument is the
    // burst-ring authority, and a guess is not evidence.
    expect(onShell).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 'gun', null);
    expect(spawnEffect).not.toHaveBeenCalled(); // no plain muzzle from here (4.3)
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
    // Only the CLAIMED cannon shot spawns anything here; the second reveal's
    // flash (if it earns one) comes from the server's own `mz` row.
    expect(spawnEffect).toHaveBeenCalledTimes(1);
    expect(spawnEffect).toHaveBeenCalledWith('muzzleHeavy', 0, 0);
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
    expect(spawnEffect).not.toHaveBeenCalled(); // never the cannon's heavy flash
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

// --- STORY 4.3: THE GUNNERY CONVERSATION ---------------------------------------
//
// Three server rows replace three client-side guesses. `mz` says a gun-family
// weapon fired HERE (for anyone in the 412.5u halo, and deliberately anonymous),
// `sp` is our own fall of shot through any fog, `hc` is "something you fired
// connected" with no severity of any kind. The two impact rows CLAIM their
// point, so a shooter who can see their own impact draws one mark, not two.

describe('the gunnery rows (Story 4.3) — mz / sp / hc', () => {
  it('spawns the neutral muzzle flash wherever the server says a gun went off', () => {
    const { sink, spawnEffect, play } = setupWater();
    // Far outside our sight bubble and carrying NO id — we cannot see the
    // shooter and are not told who they are. It still draws.
    sink.handler(victimFrame([{ k: 'mz', x: 420, y: -80 }], {}));
    expect(spawnEffect).toHaveBeenCalledWith('muzzle', 420, -80);
    // STORY 4.7 SUPERSEDES the original "the flash is silent" assertion: the
    // flash now has its report. The tone carries exactly what the flash carries
    // — a place — and no identity, because the row has none.
    expect(play).toHaveBeenCalledWith('gunReport', expect.anything());
  });

  it('spawns our own fall of shot at the true impact point', () => {
    const { sink, spawnEffect, play } = setupWater();
    sink.handler(victimFrame([{ k: 'sp', id: 'me', x: 500, y: 260 }], {}));
    expect(spawnEffect).toHaveBeenCalledWith('splash', 500, 260);
    // STORY 4.7 SUPERSEDES "a miss has no cue": a miss is INFORMATION (FR16's
    // bracket-and-walk), and it now sounds — softly, at the far end of the
    // catalog from the hit.
    expect(play).toHaveBeenCalledWith('splash', expect.anything());
  });

  it('blooms AND calls the hit when something we fired connects', () => {
    const { sink, spawnEffect, play } = setupWater();
    sink.handler(victimFrame([{ k: 'hc', id: 'me', x: -300, y: 44 }], {}));
    expect(spawnEffect).toHaveBeenCalledWith('spark', -300, 44);
    expect(play).toHaveBeenCalledWith('hitCall');
  });

  it('SPECTATOR: another captain\'s hit call blooms but never sounds in our ears', () => {
    // `hc` is spectator-public on the wire (the `dmg` precedent), so a dead
    // captain receives EVERY shooter's Hit Call. The bloom is watching the
    // gunnery conversation and is welcome; the TONE means "something YOU fired
    // connected" and must not fire for someone else's shot — ungated, a
    // spectator would hear it for all 19 remaining hulls until results.
    const { sink, spawnEffect, play } = setupWater();
    sink.handler(victimFrame([{ k: 'hc', id: 'someone-else', x: -300, y: 44 }], {}));
    expect(spawnEffect).toHaveBeenCalledWith('spark', -300, 44);
    expect(play.mock.calls.filter(([id]) => id === 'hitCall')).toHaveLength(0);
  });

  it('THE DOUBLE-RENDER SEAM: a boom and an hc at one point draw ONE spark', () => {
    const { sink, spawnEffect, play } = setupWater();
    sink.handler(victimFrame([
      { k: 'boom', id: 's7', hit: 'foe', x: 40, y: -12 },
      { k: 'hc', id: 'me', x: 40, y: -12 },
    ], {}));
    expect(spawnEffect).toHaveBeenCalledTimes(1);
    expect(spawnEffect).toHaveBeenCalledWith('spark', 40, -12);
    expect(play).toHaveBeenCalledWith('hitCall'); // the cue is never deduped away
  });

  it('...and ORDER-INDEPENDENTLY so — hc first draws exactly one too', () => {
    const { sink, spawnEffect } = setupWater();
    sink.handler(victimFrame([
      { k: 'hc', id: 'me', x: 40, y: -12 },
      { k: 'boom', id: 's7', hit: 'foe', x: 40, y: -12 },
    ], {}));
    expect(spawnEffect).toHaveBeenCalledTimes(1);
    expect(spawnEffect).toHaveBeenCalledWith('spark', 40, -12);
  });

  it('dedupes a MISS the same way: the boom splash and our own sp are one mark', () => {
    const { sink, spawnEffect } = setupWater();
    sink.handler(victimFrame([
      { k: 'boom', id: 's7', x: 88, y: 3 },
      { k: 'sp', id: 'me', x: 88, y: 3 },
    ], {}));
    expect(spawnEffect).toHaveBeenCalledTimes(1);
    expect(spawnEffect).toHaveBeenCalledWith('splash', 88, 3);
  });

  it('leaves the PIERCE ring alongside the Hit Call bloom — different facts', () => {
    // The ring says the shell went THROUGH and is still flying; the bloom says
    // we connected. Keeping pierce out of the claim is also what keeps the
    // boom/hc pairing order-independent.
    const { sink, spawnEffect } = setupWater();
    sink.handler(victimFrame([
      { k: 'boom', id: 's7#p0', hit: 'foe', x: 40, y: 0 },
      { k: 'hc', id: 'me', x: 40, y: 0 },
    ], {}));
    expect(spawnEffect).toHaveBeenNthCalledWith(1, 'pierce', 40, 0);
    expect(spawnEffect).toHaveBeenNthCalledWith(2, 'spark', 40, 0);
  });

  it('draws every bloom of a rapid salvo but plays at most one tone per 300ms', () => {
    const { sink, spawnEffect, play } = setupWater();
    // Three connections across two frames, 200ms of server time apart.
    sink.handler(victimFrame([
      { k: 'hc', id: 'me', x: 0, y: 0 },
      { k: 'hc', id: 'me', x: 30, y: 0 },
    ], {}, { t: 1000 }));
    sink.handler(victimFrame([{ k: 'hc', id: 'me', x: 60, y: 0 }], {}, { t: 1200 }));
    expect(spawnEffect).toHaveBeenCalledTimes(3); // three points, three facts
    expect(play.mock.calls.filter(([id]) => id === 'hitCall')).toHaveLength(1);
    // ...and once the floor has elapsed the cue is heard again.
    sink.handler(victimFrame([{ k: 'hc', id: 'me', x: 90, y: 0 }], {}, { t: 1400 }));
    expect(play.mock.calls.filter(([id]) => id === 'hitCall')).toHaveLength(2);
  });

  it('the claim does not carry ACROSS frames — the same water can be shelled again', () => {
    const { sink, spawnEffect } = setupWater();
    sink.handler(victimFrame([{ k: 'sp', id: 'me', x: 12, y: 12 }], {}, { t: 1000 }));
    sink.handler(victimFrame([{ k: 'sp', id: 'me', x: 12, y: 12 }], {}, { t: 1100 }));
    expect(spawnEffect).toHaveBeenCalledTimes(2);
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

  // --- THE FRAME AGGREGATE (Eric ruling 2026-08-05) --------------------------
  //
  // A multi-barrel click now lands one `dmg` per connecting shell, so several
  // arrive in ONE frame. shake.ts resolves colliding triggers with Math.max, so
  // per-event feedback would report the biggest single hit and swallow the rest
  // — the MOUNT cards would land invisibly. One frame is one felt hit, summed.

  it('sums a THREE-hit frame into ONE shake at the total and ONE thud', () => {
    const { sink, play, trigger } = setupWater();
    sink.handler(
      victimFrame(
        [
          { k: 'dmg', id: 'me', amount: 15 },
          { k: 'dmg', id: 'me', amount: 15 },
          { k: 'dmg', id: 'me', amount: 15 },
        ],
        {},
      ),
    );
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledWith(45); // a 3× hit FEELS like a 3× hit
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith('damage'); // three identical thuds are a smear
  });

  it('leaves a SINGLE-event frame byte-for-byte as it was', () => {
    const { sink, play, trigger } = setupWater();
    sink.handler(victimFrame(dmg, {}));
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledWith(6);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith('damage');
  });

  it('never aggregates ACROSS frames — each frame is its own hit', () => {
    const { sink, trigger } = setupWater();
    sink.handler(victimFrame([{ k: 'dmg', id: 'me', amount: 15 }], {}));
    sink.handler(victimFrame([{ k: 'dmg', id: 'me', amount: 15 }], {}));
    expect(trigger.mock.calls.map((c) => c[0])).toEqual([15, 15]);
  });

  it('on the DEATH frame the killing thud lands BEFORE the sink cue', () => {
    // The server pushes `dmg` and then the `sunk` it caused, so the felt order
    // must match: hit, then hull lost. This is why the aggregate is resolved in
    // a PRE-PASS rather than after the fan-out — flushing at the end would put
    // the sink cue ahead of the blow that earned it.
    const { sink, play } = setupWater();
    sink.handler(
      victimFrame(
        [
          { k: 'dmg', id: 'me', amount: 15 },
          { k: 'sunk', id: 'me', by: 'foe', seen: true },
        ],
        {},
      ),
    );
    expect(play.mock.calls.map((c) => c[0])).toEqual(['damage', 'sink']);
  });

  it('a frame with NO own damage is silent (the common case costs nothing)', () => {
    const { sink, play, trigger } = setupWater();
    sink.handler(victimFrame([{ k: 'dmg', id: 'someone-else', amount: 15 }], {}));
    expect(trigger).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it('a shell landing in the same frame as a flush is a SLAM, not a burn', () => {
    const { sink, play, trigger } = setupWater();
    // Alone, the 6hp flush would read as burn (it does, in the tests above).
    // The 30hp shell beside it does not, and the frame reads as fire only when
    // EVERY application in it does — so this is correctly reported as the
    // impact it mostly was, and the shake still carries the full 36.
    sink.handler(
      victimFrame(
        [
          { k: 'dmg', id: 'me', amount: 6 },
          { k: 'dmg', id: 'me', amount: 30 },
        ],
        {},
        { litZones: burning('foe') },
      ),
    );
    expect(play).toHaveBeenCalledWith('damage');
    expect(play).not.toHaveBeenCalledWith('burn');
    expect(trigger).toHaveBeenCalledWith(36);
  });

  it('a lone DoT flush still reads as BURN', () => {
    const { sink, play, trigger } = setupWater();
    sink.handler(victimFrame(dmg, {}, { litZones: burning('foe') }));
    expect(play).toHaveBeenCalledWith('burn');
    expect(trigger).toHaveBeenCalledWith(6 * CLIENT_CONFIG.litZone.burnShakeScale);
  });

  it('MANY simultaneous burners still read as BURN even though the SUM passes the cap', () => {
    // The reason burn is classified PER EVENT and folded, rather than by testing
    // the total: applyZoneEffects emits one bite per (owner, victim) per tick, so
    // four distinct enemy burners produce four separate small flushes. Their sum
    // (24) sails past BURN_AMOUNT_CAP (10), whose ×4 headroom was derived for ONE
    // event covering overlapping patches. Testing the sum would report standing
    // in four fires as being shelled — a full-amplitude shake and a thud for
    // damage that was entirely DoT.
    const { sink, play, trigger } = setupWater();
    sink.handler(
      victimFrame(
        [
          { k: 'dmg', id: 'me', amount: 6 },
          { k: 'dmg', id: 'me', amount: 6 },
          { k: 'dmg', id: 'me', amount: 6 },
          { k: 'dmg', id: 'me', amount: 6 },
        ],
        {},
        { litZones: burning('foe') },
      ),
    );
    expect(play).toHaveBeenCalledWith('burn');
    expect(play).not.toHaveBeenCalledWith('damage');
    expect(trigger).toHaveBeenCalledWith(24 * CLIENT_CONFIG.litZone.burnShakeScale);
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

// --- the accumulated-pulse switch now carries THREE rows (Story 4.5) --------
//
// `fh` joins `blip` and `sm` in handlePulseEvent — the rows where the server
// keeps no history and the client synthesizes the persistence. The row's own
// behavior is covered exhaustively in foghorn.test.ts; what belongs HERE is
// that adding it did not cost the other two their fan-out, and that a honk
// never falls through into the gunnery or reward switches below it.

describe('bindRoom pulse fan-out with the foghorn row present', () => {
  function setupPulses() {
    const room = fakeRoom();
    const sink: { handler: (f: unknown) => void } = { handler: () => undefined };
    const conn = { room, welcome: {}, sink } as unknown as Connection;
    const onBlip = vi.fn();
    const onSmoke = vi.fn();
    const onHonk = vi.fn();
    const playHorn = vi.fn();
    const play = vi.fn();
    const spawnEffect = vi.fn();
    const deps = {
      state: { net: { you: null, sessionId: 'me', tick: 0, ackSeq: 0 }, spectating: true, phase: '', respawnEta: null, mode: 'interp' },
      clock: { addSample: vi.fn() },
      contacts: { pushFrame: vi.fn() },
      mines: { sync: vi.fn() },
      litZones: { sync: vi.fn() },
      decoys: { sync: vi.fn() },
      ownBurstRadius: () => undefined,
      ownMineRings: () => undefined,
      radar: { onSweepSample: vi.fn(), onBlip },
      smoke: { onSmoke },
      foghorn: { onHonk },
      cameraCenter: () => ({ x: 0, y: 0 }),
      effects: { spawnEffect },
      audio: { play, playHorn },
      onSunkObserved: vi.fn(),
      onSpectate: vi.fn(),
      colors: vi.fn(() => null),
      ordnanceHue: vi.fn(() => 0),
    } as unknown as RoomBindingDeps;
    bindRoom(conn, deps);
    return { sink, onBlip, onSmoke, onHonk, playHorn, play };
  }

  it('fans blip, sm and fh out of ONE frame, each to its own subsystem', () => {
    const { sink, onBlip, onSmoke, onHonk, playHorn } = setupPulses();
    sink.handler({
      t: 400, tick: 4, ackSeq: 0, spec: true, contacts: [], mines: [],
      events: [
        { k: 'blip', id: 'c1', x: 10, y: 20, heading: 0, speed: 0, cls: 'torpedoBoat' },
        { k: 'sm', x: 30, y: 40, tier: 1 },
        { k: 'fh', h: 'standard', b: 1.25, v: 2 },
      ],
    });
    expect(onBlip).toHaveBeenCalledTimes(1);
    expect(onSmoke).toHaveBeenCalledTimes(1);
    expect(onHonk).toHaveBeenCalledWith(1.25, 2, 400); // the FRAME's timestamp
    expect(playHorn).toHaveBeenCalledTimes(1);
  });

  it('a honk plays on its OWN path — never through the short-tone table', () => {
    // A horn is ~1.8s and multi-layered; `play()` is the 150ms-capped ToneSpec
    // path (amendment 57). Routing a honk through it would silently truncate it.
    const { sink, play, playHorn } = setupPulses();
    sink.handler({ t: 400, tick: 4, ackSeq: 0, spec: true, contacts: [], mines: [], events: [{ k: 'fh', h: 'standard', b: 0, v: 1 }] });
    expect(playHorn).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
  });
});

// --- THE SOUND MAP (Story 4.7) — the ocean's world cues ---------------------
//
// Five call sites, one contract: a cue rides an event this client ALREADY
// received through the perception boundary, at a position it has ALREADY drawn,
// and it is placed relative to where the player is listening from. Nothing here
// is new information — a modified client that deleted the whole family would
// learn nothing it did not have — which is exactly why panning it is free.
//
// The disclosure half of the story (a fog kill stays silent) is pinned in the
// `sunk` suite above, beside the plume rule it shares.

describe('the sound map (Story 4.7) — placement, suppression, and the tone floor', () => {
  /** Every tone id played, in order (the family/exclusivity assertions). */
  const ids = (play: ReturnType<typeof vi.fn>): string[] => play.mock.calls.map(([id]) => id as string);
  /** The opts of the FIRST call carrying tone id `want`. */
  const optsOf = (play: ReturnType<typeof vi.fn>, want: string): { pan: number; gain: number } =>
    play.mock.calls.find(([id]) => id === want)?.[1] as { pan: number; gain: number };
  /** ...and of the LAST one (the two-cues-in-a-row placement assertions). */
  const lastOptsOf = (play: ReturnType<typeof vi.fn>, want: string): { pan: number; gain: number } =>
    [...play.mock.calls].reverse().find(([id]) => id === want)?.[1] as { pan: number; gain: number };

  it('an ENEMY muzzle flash reports — attenuated, and panned toward the flash', () => {
    const { sink, play } = setupWater();
    // Own hull at the origin; the flash is well off to starboard.
    sink.handler(victimFrame([{ k: 'mz', x: 330, y: 0 }], {}));
    expect(ids(play)).toEqual(['gunReport']);
    const opts = optsOf(play, 'gunReport');
    expect(opts.pan).toBeCloseTo(0.5 * CLIENT_CONFIG.audio.panMax, 5); // half a reach to starboard
    expect(opts.gain).toBeGreaterThan(CLIENT_CONFIG.audio.worldFloorGain);
    expect(opts.gain).toBeLessThan(1);
  });

  it('...and to PORT the pan flips sign, so the ear is pointed at the mark the eye can find', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([{ k: 'mz', x: -330, y: 0 }], {}));
    expect(optsOf(play, 'gunReport').pan).toBeLessThan(0);
  });

  it('OUR OWN gun is not double-sounded: a flash on our own hull is silent', () => {
    // `fireGun`/`fireCannon` already sounded this shot at the instant we fired
    // it. `mz` carries no shooter id (amendment 19), so hull proximity is the
    // only discriminator available — and the correct one.
    const { sink, play, spawnEffect } = setupWater();
    sink.handler(victimFrame([{ k: 'mz', x: 0, y: 0 }], {}));
    expect(spawnEffect).toHaveBeenCalledWith('muzzle', 0, 0); // the flash still draws
    expect(ids(play)).toEqual([]); // ...but says nothing
  });

  it('a cue FARTHER AWAY is quieter than a near one, and never falls below the floor', () => {
    const { sink, play } = setupWater();
    // Two frames a full floor apart, so the rate limit is not what is being
    // measured — and both well clear of the own hull, so neither is suppressed.
    sink.handler(victimFrame([{ k: 'mz', x: 200, y: 0 }], {}, { t: 1000 }));
    sink.handler(victimFrame([{ k: 'mz', x: 640, y: 0 }], {}, { t: 2000 }));
    const [near, far] = play.mock.calls.map(([, o]) => (o as { gain: number }).gain);
    expect(far).toBeLessThan(near);
    expect(far).toBeGreaterThanOrEqual(CLIENT_CONFIG.audio.worldFloorGain);
  });

  it('HIT AND MISS ARE OPPOSITE CUES: a connecting boom impacts, a falling one splashes', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([{ k: 'boom', id: 's1', hit: 'foe', x: 200, y: 0 }], {}, { t: 1000 }));
    expect(ids(play)).toEqual(['impact']);
    sink.handler(victimFrame([{ k: 'boom', id: 's2', x: 210, y: 0 }], {}, { t: 2000 }));
    expect(ids(play)).toEqual(['impact', 'splash']);
  });

  it('our own FALL OF SHOT splashes too — bracket-and-walk is audible through fog', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([{ k: 'sp', id: 'me', x: 400, y: 100 }], {}));
    expect(ids(play)).toEqual(['splash']);
  });

  it('a BURST thuds on the impact family — the second half of report-then-boom', () => {
    const { sink, play } = setupEvents();
    sink.handler(eventFrame({ k: 'burst', id: 'shell-7', x: 300, y: -120 }));
    expect(ids(play)).toEqual(['impact']);
  });

  it('the boom and the burst SHARE the impact floor — one detonation, one thud', () => {
    // A gun shell bursting on a hull emits both in the same frame; they are one
    // fact about one point, and two overlapping sawtooth punches are a smear.
    const { sink, play } = setupWater();
    sink.handler(victimFrame([
      { k: 'boom', id: 's1', hit: 'foe', x: 120, y: 0 },
      { k: 'burst', id: 's1', x: 120, y: 0 },
    ], {}));
    expect(ids(play)).toEqual(['impact']);
  });

  it('...but the families are INDEPENDENT: a burst never silences a report', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([
      { k: 'mz', x: 300, y: 0 },
      { k: 'burst', id: 's1', x: 320, y: 0 },
      { k: 'boom', id: 's2', x: 340, y: 0 },
    ], {}));
    expect([...ids(play)].sort()).toEqual(['gunReport', 'impact', 'splash']);
  });

  it('a rapid salvo collapses to ONE cue per family per floor — read from CONFIG, not a literal', () => {
    const floor = CLIENT_CONFIG.gunnery.hitCallToneFloorMs; // the ratified 300ms same-source grammar
    const { sink, play } = setupWater();
    sink.handler(victimFrame([
      { k: 'mz', x: 300, y: 0 },
      { k: 'mz', x: 320, y: 40 },
      { k: 'mz', x: 340, y: -40 },
    ], {}, { t: 10_000 }));
    expect(ids(play)).toEqual(['gunReport']);
    // Still inside the floor: silent.
    sink.handler(victimFrame([{ k: 'mz', x: 360, y: 0 }], {}, { t: 10_000 + floor - 1 }));
    expect(ids(play)).toEqual(['gunReport']);
    // The floor has elapsed against the FRAME's server clock: heard again.
    sink.handler(victimFrame([{ k: 'mz', x: 380, y: 0 }], {}, { t: 10_000 + floor }));
    expect(ids(play)).toEqual(['gunReport', 'gunReport']);
  });

  it('the listener is the OWN HULL while we have one', () => {
    const { sink, play } = setupWater();
    // Hull and mark at the SAME point, 300u from the world origin: a cue placed
    // against anything but the hull (the origin, the camera) would pan off
    // centre. A boom, not a flash — a flash there would be our own fire.
    sink.handler(victimFrame([{ k: 'boom', id: 's1', x: 300, y: 0 }], { x: 300, y: 0 }));
    expect(optsOf(play, 'splash').pan).toBe(0);
  });

  it('...and the CAMERA CENTRE once we do not — the shipped foghorn precedent', () => {
    // World cues keep sounding while spectating: you are watching the water, and
    // every mark they point at is still being drawn (honkBearing's own rule).
    const { sink, play } = setupWater(null, { x: 400, y: 0 });
    sink.handler(victimFrame([{ k: 'boom', id: 's1', x: 400, y: 0 }], null));
    expect(optsOf(play, 'splash').pan).toBe(0); // on top of the camera, not of the origin
  });

  // --- THE VICTIM'S OWN HULL (review gate, amendment 37) --------------------
  //
  // Ordnance that resolved on OUR hull is already felt exactly once, in
  // flushDamage's per-frame aggregate: one shake at the summed magnitude and
  // one cue. Stacking a full-gain, dead-centre world cue on top of it is the
  // smear amendment 37 exists to prevent — on the most common combat event in
  // the game.

  it('a boom that hit US is NOT double-sounded — the damage aggregate is the cue', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([{ k: 'boom', id: 's1', hit: 'me', x: 0, y: 0 }], {}));
    expect(ids(play)).toEqual([]);
  });

  it('...while a boom on an ENEMY hull still thuds', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([{ k: 'boom', id: 's1', hit: 'foe', x: 120, y: 0 }], {}));
    expect(ids(play)).toEqual(['impact']);
  });

  it('the own-hull BURST is the same occurrence, and is silent too', () => {
    // A gun shell bursting on our own hull emits `burst` at the clicked point,
    // which is our hull. The damage we are about to feel IS that event.
    const { sink, play } = setupWater();
    sink.handler(victimFrame([{ k: 'burst', id: 's1', x: 0, y: 0 }], {}));
    expect(ids(play)).toEqual([]);
  });

  it('...but a burst out on the water still thuds', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([{ k: 'burst', id: 's1', x: 300, y: -120 }], {}));
    expect(ids(play)).toEqual(['impact']);
  });

  // --- THE STALE OWN POSE (review gate) -------------------------------------
  //
  // `net.you` is never cleared on death, so the wreck's last pose survives the
  // whole spectate period. Both audio consumers of "where am I" must ask
  // whether we have a LIVE hull, not merely whether a pose is on hand.

  it('SPECTATING: a cue is placed from the CAMERA, never from the stale wreck pose', () => {
    const { sink, play } = setupWater(null, { x: 0, y: 0 });
    // Alive, far to starboard of the camera...
    sink.handler(victimFrame([], { x: 500, y: 0 }, { t: 1000 }));
    // ...then dead: a spec frame carries no `you`, so the 500u pose persists.
    sink.handler(victimFrame([{ k: 'boom', id: 's1', x: 400, y: 0 }], null, { t: 2000 }));
    // From the camera the mark is to STARBOARD; from the wreck it would be to port.
    expect(optsOf(play, 'splash').pan).toBeGreaterThan(0);
  });

  it('SPECTATING: a flash near where we sank is NOT mistaken for our own gun', () => {
    // Own-fire suppression exists because `fireGun` already sounded the shot.
    // A spectator fires nothing, so suppressing here silences an enemy gun for
    // the whole spectate period — flash drawn, no report.
    const { sink, play, spawnEffect } = setupWater(null, { x: 0, y: 0 });
    sink.handler(victimFrame([], { x: 500, y: 0 }, { t: 1000 }));
    sink.handler(victimFrame([{ k: 'mz', x: 500, y: 0 }], null, { t: 2000 }));
    expect(spawnEffect).toHaveBeenCalledWith('muzzle', 500, 0);
    expect(ids(play)).toEqual(['gunReport']);
  });

  // --- THE SUPPRESSION BALL IS THE BLAST, NOT THE HULL (review gate) ---------
  //
  // The own-hull burst suppression exists for ONE reason: a burst centred on us
  // is the same occurrence as the damage we are already feeling this frame, and
  // `damage`/`burn` is that occurrence's one cue. So the question it must ask is
  // "could this burst be the one I am feeling", which is a BLAST-RADIUS test.
  // Keyed on a hull-length ball instead (124u, four times the widest base blast
  // in the game) it silenced detonations that never touched us at all.

  it('a burst 100u off our beam THUDS — it never touched us, so there is nothing to double', () => {
    const { sink, play } = setupWater();
    // 100u from the hull: no `dmg`, no `boom` on us, a ring filling the screen.
    sink.handler(victimFrame([{ k: 'burst', id: 's1', x: 100, y: 0 }], {}));
    expect(ids(play)).toEqual(['impact']);
  });

  it('...and just OUTSIDE the base blast radius it still thuds', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([{ k: 'burst', id: 's1', x: CONFIG.gun.burstRadius + 1, y: 0 }], {}));
    expect(ids(play)).toEqual(['impact']);
  });

  it('...while INSIDE it stays silent — that one really is the damage we are feeling', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([{ k: 'burst', id: 's1', x: CONFIG.gun.burstRadius - 1, y: 0 }], {}));
    expect(ids(play)).toEqual([]);
  });

  it('an OWN-correlated burst suppresses at ITS OWN effective radius, not the CONFIG base', () => {
    // The same seam that sizes the ring (deps.ownBurstRadius) sizes the silence,
    // so a FRAGMENTATION-widened blast we are standing in never double-sounds.
    const { sink, play } = setupWater(null, { x: 0, y: 0 }, 60);
    sink.handler(victimFrame([{ k: 'burst', id: 's1', x: 40, y: 0 }], {}));
    expect(ids(play)).toEqual([]);
  });

  // --- THE SHOOTER'S OWN FALL OF SHOT OUTRANKS PUBLIC WORLD NOISE -----------
  //
  // `sp` exists precisely so a shooter's own misses render through fog and
  // bracket-and-walk works (FR16, amendment 16). It is the one splash carrying
  // information the client cannot otherwise obtain, so it must never be eaten by
  // an enemy's splash that the player can already see.

  it('an enemy splash does NOT starve our own fall of shot inside the floor', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([{ k: 'boom', id: 's1', x: 200, y: 0 }], {}, { t: 1000 }));
    expect(ids(play)).toEqual(['splash']);
    // 150ms later — well inside the 300ms floor — our own miss lands elsewhere.
    sink.handler(victimFrame([{ k: 'sp', id: 'me', x: -400, y: 0 }], {}, { t: 1150 }));
    expect(ids(play)).toEqual(['splash', 'splash']);
    expect(lastOptsOf(play, 'splash').pan).toBeLessThan(0); // ...and it is placed at OUR miss
  });

  it('...but our own misses still floor against EACH OTHER — one shooter, one source', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([{ k: 'sp', id: 'me', x: 300, y: 0 }], {}, { t: 1000 }));
    sink.handler(victimFrame([{ k: 'sp', id: 'me', x: 320, y: 0 }], {}, { t: 1150 }));
    expect(ids(play)).toEqual(['splash']);
  });

  it('the SAME miss arriving on both rows still sounds ONCE — same point, same frame', () => {
    // A shooter who can SEE their own miss receives the public `boom` and the
    // self-private `sp` in one frame at byte-identical coordinates. Two floors
    // no longer collapse that pair, so the point-identity claim does — the same
    // rule that keeps the two rows from stacking two splash MARKS.
    const { sink, play } = setupWater();
    sink.handler(victimFrame([
      { k: 'boom', id: 's1', x: 400, y: 100 },
      { k: 'sp', id: 'me', x: 400, y: 100 },
    ], {}));
    expect(ids(play)).toEqual(['splash']);
  });

  it('...and a SILENCED public row never eats the point on its way out', () => {
    // The order inside splashTone is load-bearing: floor, then claim, then cue.
    // Here an enemy splash spends the public floor, so the `boom` half of our own
    // visible miss is refused a moment later — if that refusal still claimed the
    // point, the self-private `sp` behind it would find nothing to claim and the
    // shooter's own miss would go silent. That is the starvation the separate
    // floors exist to close, re-entering through the back door.
    const { sink, play } = setupWater();
    sink.handler(victimFrame([{ k: 'boom', id: 's0', x: 100, y: 0 }], {}, { t: 1000 }));
    expect(ids(play)).toEqual(['splash']);
    sink.handler(victimFrame([
      { k: 'boom', id: 's1', x: 400, y: 100 },
      { k: 'sp', id: 'me', x: 400, y: 100 },
    ], {}, { t: 1100 }));
    expect(ids(play)).toEqual(['splash', 'splash']); // ours is heard
  });

  // --- THE SINKING HULL IS STILL OURS (Story 5.2 review fix) ----------------
  //
  // `hasLiveOwnHull` asks "do we have a hull on the water", and until this fix
  // it answered with the raw `you.alive` — which amendment 11 flips FALSE at
  // sink-entry, five seconds before the hull actually goes down. The audible
  // result was on every single shot of the beat this story exists to create:
  // `handleShell`'s own-fire crack still fired (its `nearOwnShip` test is
  // position-only) while `handleMuzzle`'s suppression let go, so the SAME round
  // also played the distant `gunReport` world tone from ~0 m away.

  /** Our own ship, mid-window: dead by the wire's reckoning, still on the water. */
  const sinkingYou = (t: number) => ({ alive: false, sinkingUntil: t + CONFIG.ship.sinkingWindowMs });

  it('ONE SHOT, ONE REPORT while we are going down — the shot must not double-sound', () => {
    const { sink, play } = setupWater();
    // Our own gun-family shell reveals on our own hull and the server's public
    // `mz` lands on the same point in the same frame — exactly what a shot from
    // a sinking hull produces.
    sink.handler(victimFrame([
      { k: 'shell', id: 's1', x: 0, y: 0, vx: 40, vy: 0 },
      { k: 'mz', x: 0, y: 0 },
    ], sinkingYou(1000)));
    expect(ids(play)).toEqual(['fireGun']); // the close crack, and NOTHING else
  });

  it('...while an enemy gun firing elsewhere is still reported, sinking or not', () => {
    // The suppression must not widen into a blanket silence: it is keyed on our
    // own hull, and this flash is 330u away from it.
    const { sink, play } = setupWater();
    sink.handler(victimFrame([{ k: 'mz', x: 330, y: 0 }], sinkingYou(1000)));
    expect(ids(play)).toEqual(['gunReport']);
  });

  it('the EAR stays on the sinking hull, and does not jump to the camera', () => {
    // listenerPos shares the predicate. Hull and mark at the same point, 300u
    // off the camera at the origin: placed against the camera this would pan
    // hard to starboard, and against the hull it is dead centre.
    const { sink, play } = setupWater(null, { x: 0, y: 0 });
    sink.handler(victimFrame(
      [{ k: 'boom', id: 's1', x: 300, y: 0 }],
      { ...sinkingYou(1000), x: 300, y: 0 },
    ));
    expect(optsOf(play, 'splash').pan).toBe(0);
  });

  it('but a burst on our SINKING hull still thuds — amendment 12 leaves nothing to double', () => {
    // `inOwnBlast` deliberately does NOT take the widened predicate. Its whole
    // job is "could this be the damage I am already feeling this frame", and a
    // sinking hull feels none: damage on it is a total no-op (amendment 12), so
    // there is no `dmg`, no shake and no `damage` cue to smear against. Silence
    // here would be a ring filling the screen with nothing to hear — the lie the
    // function's own docstring rejects.
    const { sink, play } = setupWater();
    sink.handler(victimFrame([{ k: 'burst', id: 's1', x: 0, y: 0 }], sinkingYou(1000)));
    expect(ids(play)).toEqual(['impact']);
  });

  it('...and on a LIVE hull it is still silent — the damage aggregate is the cue', () => {
    const { sink, play } = setupWater();
    sink.handler(victimFrame([{ k: 'burst', id: 's1', x: 0, y: 0 }], {}));
    expect(ids(play)).toEqual([]);
  });

  it('SPECTATING is still the hard stop: a stale sinking `you` conns nothing', () => {
    // `net.you` is never cleared, so a spec frame arriving mid-window (the
    // amendment 17 truncation) leaves a `sinkingUntil` in the future on a hull
    // we no longer have. The ear must be back on the camera and the enemy's gun
    // must be audible again.
    const { sink, play } = setupWater(null, { x: 0, y: 0 });
    sink.handler(victimFrame([], { ...sinkingYou(1000), x: 500, y: 0 }, { t: 1000 }));
    sink.handler(victimFrame([{ k: 'mz', x: 500, y: 0 }], null, { t: 2000 }));
    expect(ids(play)).toEqual(['gunReport']);
  });
});

// --- Story 6.3: the cohort-collapse signal -----------------------------------
//
// `rq` is the ONE channel that tells a client its lobby is gone. The whole
// reason it exists is that a socket close cannot say it: the normal end-of-match
// disconnect closes the socket too, and that one must keep landing home and
// WAITING for input. So these pin both directions — the signal routes, and
// nothing else does.

interface MsgRoom {
  onMessage: (type: string, cb: (msg: unknown) => void) => void;
  onError: (cb: (code: number, message?: string) => void) => void;
  onLeave: (cb: (code: number) => void) => void;
  onDrop: (cb: () => void) => void;
  onReconnect: (cb: () => void) => void;
  fire: (type: string, msg: unknown) => void;
  fireLeave: (code: number) => void;
}

/** A fake room that actually delivers messages (the shared one drops them). */
function msgRoom(): MsgRoom {
  const handlers = new Map<string, (msg: unknown) => void>();
  let leave: ((code: number) => void) | undefined;
  return {
    onMessage: (type, cb) => void handlers.set(type, cb),
    onError: () => undefined,
    onLeave: (cb) => void (leave = cb),
    onDrop: () => undefined,
    onReconnect: () => undefined,
    fire: (type, msg) => handlers.get(type)?.(msg),
    fireLeave: (code) => leave?.(code),
  };
}

function setupSignals() {
  const room = msgRoom();
  const sink: { handler: (f: unknown) => void } = { handler: () => undefined };
  const conn = { room, welcome: {}, sink } as unknown as Connection;
  const onRequeue = vi.fn();
  const onRoomLeave = vi.fn();
  const onResults = vi.fn();
  const deps = {
    state: { net: {}, matchOver: false },
    onRequeue,
    onRoomLeave,
    onResults,
  } as unknown as RoomBindingDeps;
  bindRoom(conn, deps);
  return { room, onRequeue, onRoomLeave, onResults };
}

describe('bindRoom — the requeue signal', () => {
  it('routes `rq` to deps.onRequeue, once, carrying the reason verbatim', () => {
    const { room, onRequeue } = setupSignals();
    room.fire(MSG.requeue, { reason: 'cohortLost' });
    expect(onRequeue).toHaveBeenCalledTimes(1);
    expect(onRequeue).toHaveBeenCalledWith({ reason: 'cohortLost' });
  });

  // THE PIN THE WHOLE CHANNEL EXISTS FOR: the ordinary match end is
  // results-then-disconnect, and NEITHER may auto-requeue anybody. Without a
  // separate signal the client would have to guess from the socket close, and
  // every finished match would fling the player into a new queue.
  it('a normal match end — results, then the room disconnects — never requeues', () => {
    const { room, onRequeue, onRoomLeave, onResults } = setupSignals();
    room.fire(MSG.results, { winnerId: 'a', rows: [] });
    room.fireLeave(1000);
    expect(onResults).toHaveBeenCalledTimes(1);
    expect(onRoomLeave).toHaveBeenCalledTimes(1);
    expect(onRequeue).not.toHaveBeenCalled();
  });

  it('a bare disconnect with no signal in front of it never requeues either', () => {
    const { room, onRequeue, onRoomLeave } = setupSignals();
    room.fireLeave(4000);
    expect(onRoomLeave).toHaveBeenCalledTimes(1);
    expect(onRequeue).not.toHaveBeenCalled();
  });

  // The collapse's real shape on the wire: signal first, socket close a beat
  // behind it. Both land, and both are delivered — the LATCH that turns them
  // into exactly one join lives in app/requeue.ts, not here.
  it('the collapse delivers both: the signal, then the disconnect behind it', () => {
    const { room, onRequeue, onRoomLeave } = setupSignals();
    room.fire(MSG.requeue, { reason: 'cohortLost' });
    room.fireLeave(1000);
    expect(onRequeue).toHaveBeenCalledTimes(1);
    expect(onRoomLeave).toHaveBeenCalledTimes(1);
  });
});
