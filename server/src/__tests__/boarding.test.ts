// BOARDING (Story 6.1, epic-6 amendment 8) — Eric: *"At 2:00 wait with at least
// 2, or at full lobby capacity, the game should drop everyone into their start
// location on the map, with movement/weapons locked and radar off. Once
// everyone is loaded, the 10 second countdown begins. Then the game starts."*
//
// Two halves, both covered here:
//   THE GATE  — a queue-formed room (MatchTimings.expectedCaptains set) holds
//               in 'waiting' until the whole seated group is aboard, backstopped
//               by a boarding grace that must never arm below minHumans.
//   THE FREEZE — while boarding, the helm is dead, nothing activates, and the
//               radar sensor is off (truesight is NOT). All five phase gates
//               flip on the SAME tick the match activates.
//
// THE COMPATIBILITY CONTRACT IS A FIRST-CLASS CASE: with expectedCaptains
// absent — the dev/sandbox door, every headless smoke, every other test — the
// state machine and every world gate must behave exactly as they shipped. The
// suite asserts that directly rather than leaving it to the other 1,180 tests.

import { describe, it, expect } from 'vitest';
import { CONFIG, type MatchPhase } from '@salvo/shared';
import { World } from '../game/world.js';
import { BOARDING_GRACE_MS, Match, type MatchHooks, type MatchTimings } from '../game/match.js';
import { buildFrame } from '../game/frames.js';

const DT = CONFIG.tick.simDtMs;
/** Fast lifecycle timings; joinWindowMs 0 = the legacy waiting -> countdown
 *  path, so a satisfied boarding gate arms visibly on the very next call. */
const BASE: MatchTimings = { countdownMs: 100, resultsMs: 200, joinWindowMs: 0 };
/** A short grace so the backstop cases don't step 400 ticks. */
const GRACE_MS = 1000;

function noopHooks(): MatchHooks {
  return { lock: () => {}, unlock: () => {}, broadcastResults: () => {}, requeue: () => {}, disconnect: () => {} };
}

interface Ctx {
  w: World;
  m: Match;
}

/** A bare island-free world plus a match with the given boarding timings. */
function setup(timings: Partial<MatchTimings>): Ctx {
  const w = new World(1);
  w.map.islands.length = 0;
  return { w, m: new Match(w, { ...BASE, boardingGraceMs: GRACE_MS, ...timings }, noopHooks()) };
}

function join(ctx: Ctx, id: string): void {
  ctx.w.addShip(id, id.toUpperCase());
  ctx.m.notifyRosterChanged();
}

function step(ctx: Ctx, ticks = 1): void {
  for (let i = 0; i < ticks; i++) {
    ctx.w.step();
    ctx.m.update();
  }
}

/** Every phase-derived world gate, read as one tuple so a test can assert the
 *  five of them move together. */
function gates(w: World): Record<string, boolean> {
  return {
    damage: w.damageEnabled,
    xp: w.xpEnabled,
    helm: w.helmEnabled,
    weapons: w.weaponsEnabled,
    radar: w.radarEnabled,
  };
}

const ALL_OFF = { damage: false, xp: false, helm: false, weapons: false, radar: false };
const ALL_ON = { damage: true, xp: true, helm: true, weapons: true, radar: true };

/** Full ahead + hard over, on the named seq. */
function helmOrder(ctx: Ctx, id: string, seq: number): void {
  ctx.w.submitInput(id, {
    seq, throttle: 1, rudder: 1, aim: 1.25, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0,
  });
}

/** One fresh gun click (seq doubles as the click counter). */
function fire(ctx: Ctx, id: string, seq: number): void {
  ctx.w.submitInput(id, {
    seq, throttle: 0, rudder: 0, aim: 0, fireSeq: seq, aimDist: 600, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0,
  });
}

// --- THE GATE ---------------------------------------------------------------

describe('boarding gate — the countdown waits for the last loader (amendment 8)', () => {
  it('holds in waiting until every seated captain is aboard', () => {
    const ctx = setup({ expectedCaptains: 3 });
    join(ctx, 'a');
    expect(ctx.m.phase).toBe('waiting');
    // minHumans is reached here — pre-6.1 this armed the countdown outright.
    join(ctx, 'b');
    expect(ctx.m.phase).toBe('waiting');
    join(ctx, 'c');
    expect(ctx.m.phase).toBe('countdown');
  });

  it('never arms early on its own clock while the group is still boarding', () => {
    const ctx = setup({ expectedCaptains: 3 });
    join(ctx, 'a');
    join(ctx, 'b');
    // Just under the grace: the backstop must not have fired yet.
    step(ctx, GRACE_MS / DT - 1);
    expect(ctx.m.phase).toBe('waiting');
  });

  it('grace backstop arms the countdown when a loader never arrives', () => {
    const ctx = setup({ expectedCaptains: 3 });
    join(ctx, 'a');
    join(ctx, 'b');
    step(ctx, GRACE_MS / DT);
    expect(ctx.m.phase).toBe('countdown');
  });

  it('the grace clock runs from the FIRST captain, not the last', () => {
    const ctx = setup({ expectedCaptains: 4 });
    join(ctx, 'a');
    step(ctx, GRACE_MS / DT - 2);
    // The second captain arrives late; the deadline does NOT move for them
    // (the queue's armedAtMs posture — amendment 3).
    join(ctx, 'b');
    expect(ctx.m.phase).toBe('waiting');
    step(ctx, 2);
    expect(ctx.m.phase).toBe('countdown');
  });

  it('the grace NEVER fires below minHumans — a lone captain waits forever', () => {
    const ctx = setup({ expectedCaptains: 3 });
    join(ctx, 'a');
    step(ctx, (GRACE_MS / DT) * 4);
    expect(ctx.m.phase).toBe('waiting');
    // ...and the moment a second captain lands, the long-expired grace is what
    // lets the countdown arm without waiting for the third.
    join(ctx, 'b');
    expect(ctx.m.phase).toBe('countdown');
  });

  it('a full group arms immediately — the grace is a backstop, never a delay', () => {
    const ctx = setup({ expectedCaptains: 2 });
    join(ctx, 'a');
    join(ctx, 'b');
    expect(ctx.m.phase).toBe('countdown');
  });

  it('the shipped grace exceeds Colyseus DEFAULT_SEAT_RESERVATION_TIME (15s)', () => {
    // A seat the matchmaker has already expired is never going to be consumed,
    // so a shorter grace would abandon captains who could still legitimately
    // arrive. Pinned so the constant cannot drift under that floor.
    expect(BOARDING_GRACE_MS).toBeGreaterThan(15_000);
  });
});

describe('boarding gate — no expectedCaptains is byte-identical to the shipped room', () => {
  it('arms the countdown at minHumans exactly as before', () => {
    const ctx = setup({});
    join(ctx, 'a');
    expect(ctx.m.phase).toBe('waiting');
    join(ctx, 'b');
    expect(ctx.m.phase).toBe('countdown');
  });

  it('leaves every world gate in its shipped waiting-room state', () => {
    const ctx = setup({});
    join(ctx, 'a');
    // The dev/sandbox ready room: weapons-hot but harmless, sailable, radar on.
    expect(gates(ctx.w)).toEqual({ damage: false, xp: false, helm: true, weapons: true, radar: true });
  });

  it('keeps the gathering window intact (joinWindowMs > 0)', () => {
    const ctx = setup({ joinWindowMs: 500 });
    join(ctx, 'a');
    join(ctx, 'b');
    expect(ctx.m.phase).toBe('gathering');
  });

  it('a boarding room still runs its gathering window once boarding completes', () => {
    const ctx = setup({ expectedCaptains: 3, joinWindowMs: 500 });
    join(ctx, 'a');
    join(ctx, 'b');
    expect(ctx.m.phase).toBe('waiting');
    join(ctx, 'c');
    expect(ctx.m.phase).toBe('gathering');
  });
});

// --- THE FREEZE -------------------------------------------------------------

/** A held start line: 2 captains aboard in a room expecting 3, so the room
 *  stays in the boarding 'waiting' phase for as long as the test needs. */
function boarding(): Ctx {
  const ctx = setup({ expectedCaptains: 3, boardingGraceMs: 1_000_000 });
  join(ctx, 'a');
  join(ctx, 'b');
  expect(ctx.m.phase).toBe('waiting');
  return ctx;
}

describe('boarding freeze — movement locked', () => {
  it('a full-ahead hard-over order moves the hull not one unit', () => {
    const ctx = boarding();
    const a = ctx.w.ships.get('a')!;
    const pose = { x: a.state.x, y: a.state.y, heading: a.state.heading };
    for (let i = 1; i <= 40; i++) {
      helmOrder(ctx, 'a', i);
      step(ctx);
    }
    expect(a.state.speed).toBe(0);
    expect(a.state.x).toBe(pose.x);
    expect(a.state.y).toBe(pose.y);
    expect(a.state.heading).toBe(pose.heading);
  });

  it('aim and the input ack still track — the HUD is live, only the helm is dead', () => {
    const ctx = boarding();
    const a = ctx.w.ships.get('a')!;
    helmOrder(ctx, 'a', 7);
    step(ctx);
    expect(a.input.aim).toBeCloseTo(1.25, 10);
    expect(a.lastAckSeq).toBe(7);
    // The APPLIED order is neutral...
    expect(a.input.throttle).toBe(0);
    expect(a.input.rudder).toBe(0);
    // ...and the STORED message is untouched, so the lock can never erase a
    // client's real order (the InputStore hands out the same object each tick).
    expect(ctx.w.inputs.get('a')!.throttle).toBe(1);
  });

  it('the same order sails the hull in a non-boarding room', () => {
    const ctx = setup({});
    join(ctx, 'a');
    const a = ctx.w.ships.get('a')!;
    const x0 = a.state.x;
    const y0 = a.state.y;
    for (let i = 1; i <= 40; i++) {
      helmOrder(ctx, 'a', i);
      step(ctx);
    }
    expect(Math.hypot(a.state.x - x0, a.state.y - y0)).toBeGreaterThan(10);
  });
});

describe('boarding freeze — weapons locked', () => {
  it('a click spawns no ordnance at all (not merely harmless ordnance)', () => {
    const ctx = boarding();
    for (let i = 1; i <= 10; i++) {
      fire(ctx, 'a', i);
      step(ctx);
    }
    expect(ctx.w.shells.size).toBe(0);
  });

  it('the activation gate refuses every press with the wire-silent frozen denial', () => {
    const ctx = boarding();
    const a = ctx.w.ships.get('a')!;
    expect(ctx.w.sinkingActivationGate(a, 0)).toEqual({ ok: false, reason: 'frozen' });
    // ...and no denial reaches the wire: a locked start line is self-evident.
    fire(ctx, 'a', 1);
    step(ctx);
    expect(buildFrame(ctx.w, 'a', ctx.m.phase as MatchPhase).denied).toBeUndefined();
  });

  it('leaves every pool full and every reload idle — nothing was consumed', () => {
    const ctx = boarding();
    const a = ctx.w.ships.get('a')!;
    for (let i = 1; i <= 10; i++) {
      fire(ctx, 'a', i);
      step(ctx);
    }
    // The refusal happens ABOVE the equipment row, so a boarding click cannot
    // drain a round or arm a reload — the captain reaches the start line with
    // exactly the loadout they boarded with.
    const slot = a.loadout[0]!;
    expect(slot.state!.reloadMsLeft).toBe(0);
    expect(slot.state!.n).toBe(a.stats.gun.maxAmmo);
  });

  it('the same click fires in a non-boarding room', () => {
    const ctx = setup({});
    join(ctx, 'a');
    fire(ctx, 'a', 1);
    step(ctx);
    expect(ctx.w.shells.size).toBe(1);
  });
});

describe('boarding freeze — radar off, truesight ON', () => {
  it('the sweep does not turn', () => {
    const ctx = boarding();
    const a = ctx.w.ships.get('a')!;
    const angle = a.sweepAngle;
    step(ctx, 100); // > one full 4s revolution
    expect(a.sweepAngle).toBe(angle);
    expect(a.prevSweepAngle).toBe(angle);
  });

  it('no blip of any kind reaches a client for a full revolution', () => {
    const ctx = boarding();
    const a = ctx.w.ships.get('a')!;
    const b = ctx.w.ships.get('b')!;
    a.state.x = 0;
    a.state.y = 0;
    // Squarely in the radar annulus: outside truesight, inside radar range.
    b.state.x = (CONFIG.vision.sight + CONFIG.vision.radar) / 2;
    b.state.y = 0;
    for (let i = 0; i < 100; i++) {
      step(ctx);
      const frame = buildFrame(ctx.w, 'a', ctx.m.phase as MatchPhase);
      expect(frame.events.filter((e) => e.k === 'blip' || e.k === 'wk')).toEqual([]);
    }
  });

  it('the identical geometry DOES paint once the match is live (the control)', () => {
    const ctx = setup({ expectedCaptains: 2, boardingGraceMs: 1_000_000 });
    join(ctx, 'a');
    join(ctx, 'b');
    const a = ctx.w.ships.get('a')!;
    const b = ctx.w.ships.get('b')!;
    for (let i = 0; i < 200 && ctx.m.phase !== 'active'; i++) step(ctx);
    expect(ctx.m.phase).toBe('active');
    a.state.x = 0;
    a.state.y = 0;
    b.state.x = (CONFIG.vision.sight + CONFIG.vision.radar) / 2;
    b.state.y = 0;
    let painted = 0;
    for (let i = 0; i < 100; i++) {
      step(ctx);
      a.state.x = 0;
      a.state.y = 0;
      b.state.x = (CONFIG.vision.sight + CONFIG.vision.radar) / 2;
      b.state.y = 0;
      painted += buildFrame(ctx.w, 'a', 'active').events.filter((e) => e.k === 'blip').length;
    }
    expect(painted).toBeGreaterThan(0);
  });

  it('truesight is untouched — a hull inside the sight bubble is still a contact', () => {
    const ctx = boarding();
    const a = ctx.w.ships.get('a')!;
    const b = ctx.w.ships.get('b')!;
    a.state.x = 0;
    a.state.y = 0;
    b.state.x = CONFIG.vision.sight / 2;
    b.state.y = 0;
    step(ctx);
    const frame = buildFrame(ctx.w, 'a', ctx.m.phase as MatchPhase);
    expect(frame.contacts.map((c) => c.id)).toEqual(['b']);
  });
});

describe('boarding freeze — every phase gate flips on the same tick', () => {
  it('damage, xp, helm, weapons and radar all go live at activation together', () => {
    const ctx = setup({ expectedCaptains: 2, boardingGraceMs: 1_000_000 });
    join(ctx, 'a');
    expect(gates(ctx.w)).toEqual(ALL_OFF); // boarding, alone
    join(ctx, 'b');
    expect(ctx.m.phase).toBe('countdown');
    expect(gates(ctx.w)).toEqual(ALL_OFF); // still the held start line
    // Walk the countdown out one tick at a time: until the activation tick every
    // gate reads false, and on it every gate reads true. No gate leads or lags.
    let flipped = 0;
    // Read the phase through a widening cast and keep it OUT of the loop
    // condition: a `ctx.m.phase !== 'active'` guard narrows the property for the
    // whole body, and tsc cannot see that step() reassigns it — so every later
    // comparison against 'active' looks impossible to it.
    let previous = ctx.m.phase as MatchPhase;
    for (let i = 0; i < 100; i++) {
      if (previous === 'active') break;
      step(ctx);
      const phase = ctx.m.phase as MatchPhase;
      if (phase === 'active') flipped = i + 1;
      previous = phase;
      expect(gates(ctx.w)).toEqual(phase === 'active' ? ALL_ON : ALL_OFF);
    }
    expect(flipped).toBeGreaterThan(0);
    expect(ctx.m.phase).toBe('active');
  });

  it('the results window keeps the shipped behavior — the freeze is pre-live only', () => {
    const ctx = setup({ expectedCaptains: 2, boardingGraceMs: 1_000_000 });
    join(ctx, 'a');
    join(ctx, 'b');
    for (let i = 0; i < 100 && ctx.m.phase !== 'active'; i++) step(ctx);
    ctx.m.onPlayerLeave('b'); // last captain standing -> finish
    for (let i = 0; i < 200 && ctx.m.phase !== 'finished'; i++) step(ctx);
    expect(ctx.m.phase).toBe('finished');
    // Amendment 8 rules the PRE-live state and says nothing about results:
    // damage/xp freeze as they always have, the survivor may still sail.
    expect(gates(ctx.w)).toEqual({ damage: false, xp: false, helm: true, weapons: true, radar: true });
  });
});

// --- no late arrivals (Eric ruling 2026-08-15, amendment 10) ------------------

describe('a queue-formed cohort is sealed', () => {
  /** As setup(), but recording every lock/unlock the match asks the room for. */
  function sealedSetup(timings: Partial<MatchTimings>): { ctx: Ctx; calls: string[] } {
    const calls: string[] = [];
    const w = new World(1);
    w.map.islands.length = 0;
    const hooks: MatchHooks = {
      lock: () => calls.push('lock'),
      unlock: () => calls.push('unlock'),
      broadcastResults: () => {},
      requeue: () => calls.push('requeue'),
      disconnect: () => calls.push('disconnect'),
    };
    const m = new Match(w, { ...BASE, boardingGraceMs: GRACE_MS, ...timings }, hooks);
    return { ctx: { w, m }, calls };
  }

  it('never unlocks when a captain leaves during the countdown', () => {
    // The cohort was fixed the instant the queue formed the room, so a dip below
    // minHumans must NOT re-open the door for a stranger. ArenaRoom additionally
    // locks the room from birth, which this unit cannot observe.
    const { ctx, calls } = sealedSetup({ expectedCaptains: 2 });
    join(ctx, 'a');
    join(ctx, 'b');
    expect(ctx.m.phase).toBe('countdown');
    ctx.m.onPlayerLeave('b');
    expect(ctx.m.phase).toBe('waiting');
    // Locked once, NEVER unlocked — and collapsed rather than left to strand the
    // survivor in a sealed room that can never reach minHumans again.
    //
    // THE REQUEUE SIGNAL RIDES IN FRONT OF THE COLLAPSE (Story 6.3, epic-6
    // amendment 15): the survivor goes back to the QUEUE rather than home, so
    // they do not pay a menu trip for someone else's disconnect. ORDER IS
    // LOAD-BEARING and pinned here — the room must be told where to send them
    // before it is told to send them away.
    expect(calls).toEqual(['lock', 'requeue', 'disconnect']);
  });

  it('a larger cohort losing one captain never requeues anyone', () => {
    // The signal is confined to the ONE branch that collapses a sealed room.
    const { ctx, calls } = sealedSetup({ expectedCaptains: 4 });
    for (const id of ['a', 'b', 'c', 'd']) join(ctx, id);
    expect(ctx.m.phase).toBe('countdown');
    ctx.m.onPlayerLeave('d');
    expect(calls).not.toContain('requeue');
    expect(calls).not.toContain('disconnect');
  });

  it('a larger cohort losing one captain is untouched — it still has enough', () => {
    const { ctx, calls } = sealedSetup({ expectedCaptains: 3 });
    join(ctx, 'a');
    join(ctx, 'b');
    join(ctx, 'c');
    expect(ctx.m.phase).toBe('countdown');
    ctx.m.onPlayerLeave('c');
    expect(ctx.m.phase).toBe('countdown'); // 2 left, still >= minHumans
    expect(calls).toEqual(['lock']); // no collapse, no unlock
  });

  it('the dev/sandbox ready room still unlocks, exactly as it always has', () => {
    // The compatibility contract: no expectedCaptains means nothing moved —
    // including the amendment-15 requeue, which is a QUEUE-formed-room signal
    // and must never reach the dev/sandbox door (there is no pool to return to).
    const { ctx, calls } = sealedSetup({});
    join(ctx, 'a');
    join(ctx, 'b');
    expect(ctx.m.phase).toBe('countdown');
    ctx.m.onPlayerLeave('b');
    expect(calls).toEqual(['lock', 'unlock']);
  });
});
