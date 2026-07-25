// Story 2.1 — the transport-coalescing press swallow, closed. Every ACCEPTED
// input's fire/act intent is queued (InputStore.drainIntents) and evaluated in
// seq order once per tick by fireControl/activationControl, so two presses
// landing inside one 50ms tick BOTH fire or get their own wire denial — never
// a silent latest-wins swallow. Kinematics stay latest-wins; the drain bound
// IS the rate cap (INTENT_QUEUE_CAP === INPUT_RATE_CAP) because the fixed
// 1000ms rate window can flush its whole allowance into ONE tick, so a burst
// can never overflow the queue; lastFireSeq/lastActSeq stay monotonic and are
// never reset on death.

import { describe, it, expect } from 'vitest';
import { type InputMsg } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { InputStore, INTENT_QUEUE_CAP, INPUT_RATE_CAP } from '../game/inputs.js';

function bareWorld(seed = 7): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

function place(
  w: World,
  id: string,
  x: number,
  y: number,
  heading = 0,
  hull: 'torpedoBoat' | 'battleship' | 'mineLayer' = 'torpedoBoat',
): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), false, hull);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

/** A neutral-driving input with the given press fields. */
function input(seq: number, extra: Partial<InputMsg> = {}): InputMsg {
  return {
    seq, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0,
    fireT: 0, actSeq: 0, actSlot: 0,
    ...extra,
  };
}

// ---------- InputStore: the accepted-intent queue ------------------------------

describe('InputStore.drainIntents — every accepted input queues once, in seq order', () => {
  it('queues each accepted input and drains them in seq order, clearing the queue', () => {
    const store = new InputStore();
    store.submit('a', input(1, { fireSeq: 1 }), 0);
    store.submit('a', input(2, { fireSeq: 2 }), 0);
    const drained = store.drainIntents('a');
    expect(drained.map((m) => m.seq)).toEqual([1, 2]);
    expect(store.drainIntents('a')).toEqual([]); // drained = cleared
    expect(store.get('a')?.seq).toBe(2); // latest-wins kinematics untouched
  });

  it('rejected inputs (stale seq / malformed / rate-capped) never queue an intent', () => {
    const store = new InputStore();
    store.submit('a', input(5), 0);
    store.drainIntents('a');
    store.submit('a', input(4), 0); // stale — rejected
    store.submit('a', { garbage: true }, 0); // malformed — rejected
    expect(store.drainIntents('a')).toEqual([]);
  });

  it('queues EVERY input the rate cap admits inside one tick — the bound is unreachable', () => {
    const store = new InputStore();
    // A jitter flush: the WHOLE window allowance arrives at the same instant
    // (the fixed 1000ms window does not smooth arrivals across ticks).
    for (let i = 1; i <= INPUT_RATE_CAP; i++) {
      expect(store.submit('a', input(i, { fireSeq: i }), 0)).toBe(true);
    }
    // The next message is refused by the RATE cap, never by the queue cap.
    expect(store.submit('a', input(INPUT_RATE_CAP + 1, { fireSeq: 99 }), 0)).toBe(false);
    const drained = store.drainIntents('a');
    expect(drained).toHaveLength(INPUT_RATE_CAP); // not one press lost
    expect(drained.map((m) => m.seq)).toEqual(
      Array.from({ length: INPUT_RATE_CAP }, (_, i) => i + 1),
    );
    expect(store.get('a')?.seq).toBe(INPUT_RATE_CAP);
  });

  it('remove() forgets the queue with the client', () => {
    const store = new InputStore();
    store.submit('a', input(1, { fireSeq: 1 }), 0);
    store.remove('a');
    expect(store.drainIntents('a')).toEqual([]);
  });
});

// ---------- the coalescing regression: two presses, one tick -------------------

describe('fireControl — two clicks landing in ONE tick are BOTH evaluated in seq order', () => {
  it('gun click + primed-torpedo click in one tick: both fire (older press no longer swallowed)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0);
    w.step(); // flush joins
    // Two clicks race into the same tick: click 1 fires the gun (slot 0),
    // click 2 fires the torpedo (slot 1, dead ahead). Pre-2.1 latest-wins
    // swallowed click 1 entirely — no shell, no denial.
    w.submitInput('a', input(1, { fireSeq: 1, slot: 0, aimDist: 200 }));
    w.submitInput('a', input(2, { fireSeq: 2, slot: 1, aim: 0 }));
    w.step();
    const kinds = [...w.shells.values()].map((s) => s.kind).sort();
    expect(kinds).toEqual(['shell', 'torp']); // BOTH pressed weapons launched this tick
    expect(a.lastFireSeq).toBe(2);
    expect('denied' in buildFrame(w, 'a')).toBe(false);
  });

  it('each click keeps its OWN aim: two same-tick torpedo clicks launch on their own bearings', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0, 0);
    w.step();
    const aim1 = 0.2; // both inside the ±30° bow arc
    const aim2 = -0.3;
    w.submitInput('a', input(1, { fireSeq: 1, slot: 1, aim: aim1 }));
    w.submitInput('a', input(2, { fireSeq: 2, slot: 1, aim: aim2 }));
    w.step();
    // Only ONE torpedo can launch (1-fish pool) — the FIRST click in seq order
    // gets the round at ITS aim; the second gets a cooling denial.
    const torps = [...w.shells.values()].filter((s) => s.kind === 'torp');
    expect(torps).toHaveLength(1);
    const dir = Math.atan2(torps[0].vy, torps[0].vx);
    expect(dir).toBeCloseTo(aim1, 6); // the OLDER press's aim, not the latest input's
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: 1, reason: 'cooling', seq: 2 }]);
  });

  it('an older press that cannot fire gets its OWN wire denial while the newer press fires', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0, 0);
    w.step();
    // Click 1: torpedo dead astern (out of the bow arc) → 'out-of-arc' denial.
    // Click 2: gun at a point → fires. Pre-2.1 click 1 vanished silently.
    w.submitInput('a', input(1, { fireSeq: 1, slot: 1, aim: Math.PI }));
    w.submitInput('a', input(2, { fireSeq: 2, slot: 0, aimDist: 150 }));
    w.step();
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: 1, reason: 'out-of-arc', seq: 1 }]);
    expect([...w.shells.values()].map((s) => s.kind)).toEqual(['shell']);
  });

  it('a spoofed fireSeq jump still fires at most one shot per accepted input', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0, 0);
    w.step();
    w.submitInput('a', input(1, { fireSeq: 1000, slot: 0, aimDist: 100 }));
    w.step();
    expect(w.shells.size).toBe(1); // one gated attempt, not a thousand
  });

  it('direct ship.input assignment (the directed-test path) still fires via the backstop pass', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0);
    w.step();
    a.input = input(1, { fireSeq: 1, slot: 0, aimDist: 100 }); // no store, no queue
    w.step();
    expect(w.shells.size).toBe(1);
    expect(a.lastFireSeq).toBe(1);
  });
});

describe('activationControl — two ability presses landing in ONE tick both evaluate', () => {
  it('the ML drops a mine AND a decoy from one coalesced tick (neither press lost)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0, 0, 'mineLayer'); // slot 1 = mine, slot 2 = decoyBuoy
    w.step();
    w.submitInput('a', input(1, { actSeq: 1, actSlot: 1 }));
    w.submitInput('a', input(2, { actSeq: 2, actSlot: 2 }));
    w.step(); // ONE tick — pre-2.1 the mine press was swallowed by latest-wins
    expect(w.mines.size).toBe(1);
    expect(w.decoys.size).toBe(1);
    expect('denied' in buildFrame(w, 'a')).toBe(false);
  });

  it('a coalesced double press on an empty pool: the first fires, the second gets ITS denial', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0); // TB: slot 2 = speedBoost (1 charge)
    w.step();
    w.submitInput('a', input(1, { actSeq: 1, actSlot: 2 }));
    w.submitInput('a', input(2, { actSeq: 2, actSlot: 2 }));
    w.step();
    expect(a.boostUntil).toBeGreaterThan(0); // press 1 activated
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: 2, reason: 'no-ammo', seq: 2 }]);
    expect(a.lastActSeq).toBe(2);
  });
});

// ---------- monotonicity + lifecycle edges --------------------------------------

describe('intent-queue lifecycle discipline', () => {
  it('lastFireSeq/lastActSeq never re-evaluate a press (each press at most once)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0);
    w.step();
    w.submitInput('a', input(1, { fireSeq: 1, slot: 0, aimDist: 100, actSeq: 1, actSlot: 2 }));
    w.step();
    expect(w.shells.size).toBe(1);
    expect(a.boostUntil).toBeGreaterThan(0);
    const boostEnd = a.boostUntil;
    w.step(); // the same stored input persists — no queue entries, no fresh press
    w.step();
    expect(w.shells.size).toBe(1); // no phantom re-fire
    expect(a.boostUntil).toBe(boostEnd); // no phantom re-activation
    expect(a.lastFireSeq).toBe(1);
    expect(a.lastActSeq).toBe(1);
  });

  it('death does not reset the counters: a stale queued counter never fires a phantom shot', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0);
    w.step();
    w.submitInput('a', input(1, { fireSeq: 3, slot: 0, aimDist: 100 }));
    w.step();
    expect(w.shells.size).toBe(1);
    w.sinkShip('a');
    for (const s of [...w.shells.keys()]) w.shells.delete(s); // clear the board
    // Respawn happens through processRespawns in the waiting phase.
    for (let i = 0; i < 200 && !a.alive; i++) w.step();
    expect(a.alive).toBe(true);
    expect(a.lastFireSeq).toBe(3); // NOT reset — the live input's counter stays consumed
    w.step();
    expect(w.shells.size).toBe(0); // no phantom shot on the respawn tick
  });

  it('kinematics stay latest-wins: the tick steps on the NEWEST throttle, not a queued older one', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0);
    w.step();
    w.submitInput('a', input(1, { throttle: 1 }));
    w.submitInput('a', input(2, { throttle: 0 }));
    w.step();
    expect(a.input.seq).toBe(2);
    expect(a.state.speed).toBe(0); // stepped on throttle 0 — the latest
    // And after fire control ran, ship.input is STILL the latest (the withInput
    // swap during intent evaluation always restores it).
    expect(a.input.throttle).toBe(0);
  });

  it('the queue bound IS the rate cap — an accepted input can never overflow it', () => {
    // The rate cap is a FIXED 1000ms window, not a per-tick throttle: a jitter
    // flush can deliver the whole remaining allowance inside one 50ms tick. So
    // the only safe queue bound is the rate cap itself; an "average" bound
    // (e.g. 4 ≈ 2/tick) silently swallows the middle of a burst.
    expect(INPUT_RATE_CAP).toBeLessThanOrEqual(INTENT_QUEUE_CAP);
  });
});

// ---------- the BURST regression: a jitter flush, one tick ----------------------

describe('a burst of accepted inputs inside ONE tick: every press is evaluated', () => {
  it('6 same-tick ability presses on a 1-charge pool: 1 activation + 5 wire denials = 6', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0); // TB: slot 2 = speedBoost, ONE charge
    w.step();
    // Six valid inputs land between ticks (strictly increasing seq, actSeq
    // advancing on each) — well inside the 40/s rate cap, so ALL are accepted.
    for (let i = 1; i <= 6; i++) w.submitInput('a', input(i, { actSeq: i, actSlot: 2 }));
    w.step(); // ONE tick drains them all
    expect(a.boostUntil).toBeGreaterThan(0); // press 1 activated
    const denied = buildFrame(w, 'a').denied ?? [];
    // Every press after the first gets its OWN denial — none silently swallowed.
    expect(denied.map((d) => d.seq)).toEqual([2, 3, 4, 5, 6]);
    expect(1 + denied.length).toBe(6); // activations + denials account for all 6
    expect(a.lastActSeq).toBe(6);
  });
});
