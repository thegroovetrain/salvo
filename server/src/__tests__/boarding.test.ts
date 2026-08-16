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
import { CONFIG, type MatchPhase, type SpawnEvent } from '@salvo/shared';
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
  return { lock: () => {}, unlock: () => {}, broadcastResults: () => {}, disconnect: () => {} };
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
    // Heading is BIT-EXACT-ish, not bit-exact, and the culprit is neither the
    // helm lock nor the placement: stepShip runs every tick regardless and ends
    // with `wrapAngle(heading + 0)`, whose `((a+π) % τ + τ) % τ − π` round-trip
    // is not the identity in floating point for every input. It costs at most a
    // ULP, once, on the first tick. Pre-existing and placement-dependent — this
    // assertion was `toBe` only because the old spawn geometry happened to land
    // on headings that survived the round-trip.
    expect(a.state.heading).toBeCloseTo(pose.heading, 12);
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

// --- the held start line (Eric ruling 2026-08-16) ----------------------------
//
// A boarding captain is placed on the spawn ring at addShip and LOOKS AT THAT
// SPOT for the whole boarding + countdown (Story 6-1 AC; epic-6 amendment 8
// point 3). resetForMatchStart used to re-roll every hull at the gun anyway —
// measured 20/20 captains displaced, median ~2140u, six of them near-antipodal.
// The hold is gated on the QUEUE-FORMED room alone, so the dev/sandbox ready
// room (where captains really sail and fire, and the re-roll is load-bearing)
// stays byte-identical: the last case here is that regression guard, and
// match.test.ts's ready-room pin is its canonical sibling, untouched.

/** Every hull's pose, snapshotted for an across-the-transition comparison. */
function poses(ctx: Ctx): Map<string, { x: number; y: number; heading: number }> {
  const out = new Map<string, { x: number; y: number; heading: number }>();
  for (const s of ctx.w.ships.values()) out.set(s.id, { x: s.state.x, y: s.state.y, heading: s.state.heading });
  return out;
}

/** Step to 'active', then ONE more step so the activation's queued events are
 *  published. resetForMatchStart runs inside Match.update() — i.e. AFTER the
 *  tick's event swap — so anything it queues lands in the NEXT tick's window.
 *  Returns that window's spawn events. */
function activateAndDrainSpawns(ctx: Ctx): SpawnEvent[] {
  for (let i = 0; i < 200 && ctx.m.phase !== 'active'; i++) step(ctx);
  expect(ctx.m.phase).toBe('active');
  step(ctx);
  return ctx.w.tickEvents.filter((e): e is SpawnEvent => e.k === 'spawn');
}

describe('the held start line — a boarding captain starts where they boarded', () => {
  it('every captain keeps their exact x, y and heading across countdown -> active', () => {
    const ctx = setup({ expectedCaptains: 2 });
    join(ctx, 'a');
    join(ctx, 'b');
    // The pose each captain has been staring at since they dropped in.
    const boarded = poses(ctx);
    activateAndDrainSpawns(ctx);
    for (const [id, was] of boarded) {
      const now = ctx.w.ships.get(id)!.state;
      // POSITION IS BIT-IDENTICAL, not merely close: the hold skips the write
      // entirely, so these are the same doubles. A "moved less than X" form
      // would have passed at the 439u this defect was producing.
      expect(now.x).toBe(was.x);
      expect(now.y).toBe(was.y);
      // Heading gets a ULP of tolerance for stepShip's wrapAngle round-trip
      // (see the movement-locked test above) — nothing to do with the hold,
      // which never writes heading at all.
      expect(now.heading).toBeCloseTo(was.heading, 12);
    }
  });

  it('emits NO spawn event at activation — a no-move snap would blink the HUD', () => {
    // A spawn event whose position equals the current position still calls the
    // client's predictor.forceSnap(), blanking the own hull/nameplate/hotbar for
    // ~1-3 frames at the exact moment the gun goes. The client's own
    // updateMatchEpoch already resets engine orders on the `-> active` edge and
    // documents itself as idempotent with this event, so dropping it is free.
    const ctx = setup({ expectedCaptains: 2 });
    join(ctx, 'a');
    join(ctx, 'b');
    expect(activateAndDrainSpawns(ctx)).toEqual([]);
  });

  it('still runs the whole rest of the reset — only the placement is held', () => {
    const ctx = setup({ expectedCaptains: 2 });
    join(ctx, 'a');
    join(ctx, 'b');
    const a = ctx.w.ships.get('a')!;
    // Damage/spend the hull mid-boarding so a skipped reset would be visible.
    a.hp = 3;
    a.loadout[0]!.state!.n = 0;
    a.loadout[0]!.state!.reloadMsLeft = 4321;
    a.bankedLevels = 7;
    a.xpMs = 99_999;
    a.level = 4;
    activateAndDrainSpawns(ctx);
    expect(a.hp).toBe(a.stats.maxHp);
    expect(a.loadout[0]!.state!.n).toBe(a.stats.gun.maxAmmo);
    expect(a.loadout[0]!.state!.reloadMsLeft).toBe(0);
    expect(a.bankedLevels).toBe(0);
    expect(a.level).toBe(0);
    // xpMs was wiped to 0 and has since accrued the ONE post-activation tick
    // this helper steps to publish the event window (xpEnabled is live now).
    expect(a.xpMs).toBe(DT);
  });

  it('the dev/sandbox room STILL re-rolls placement and STILL emits spawn', () => {
    // The gate's regression guard, asserted the way that room actually works:
    // it is sailable and weapons-hot for its whole waiting phase, so captains
    // are somewhere else entirely by the time the countdown ends, and the
    // re-roll is precisely what RETURNS THEM TO THE RING. (Asserting merely
    // "the position changed" would be wrong here now that one shared lattice
    // exists — a hull that never left its slot can legitimately be handed the
    // same slot back.)
    // A long countdown so there is room to sail before activation fires (BASE's
    // 100ms would activate two ticks after the second join).
    const ctx = setup({ countdownMs: 5000 });
    join(ctx, 'a');
    join(ctx, 'b');
    for (let i = 1; i <= 60; i++) {
      helmOrder(ctx, 'a', i);
      helmOrder(ctx, 'b', i);
      step(ctx);
    }
    // Both captains have sailed off the spawn ring...
    for (const s of ctx.w.ships.values()) {
      expect(Math.abs(Math.hypot(s.state.x, s.state.y) - ctx.w.map.spawnRing)).toBeGreaterThan(1);
    }
    const sailed = poses(ctx);
    const spawns = activateAndDrainSpawns(ctx);
    // ...the redeploy put every one of them back on it, and announced it.
    expect(spawns.map((e) => e.id).sort()).toEqual(['a', 'b']);
    for (const [id, was] of sailed) {
      const now = ctx.w.ships.get(id)!.state;
      // Within a unit of the ring, not ON it to six places: the redeploy zeroes
      // speed but the helm is live again in 'active', and the one extra tick
      // this helper steps to publish the event window lets the still-standing
      // full-ahead order accelerate the hull ~0.03u off the ring.
      expect(Math.abs(Math.hypot(now.x, now.y) - ctx.w.map.spawnRing)).toBeLessThan(1);
      expect({ x: now.x, y: now.y }).not.toEqual({ x: was.x, y: was.y });
    }
    // ...and each event reports the hull's true post-redeploy point: exactly on
    // the ring, and where that hull now is (bar the same one tick of travel).
    for (const e of spawns) {
      const s = ctx.w.ships.get(e.id)!.state;
      expect(Math.hypot(e.x, e.y)).toBeCloseTo(ctx.w.map.spawnRing, 6);
      expect(Math.hypot(e.x - s.x, e.y - s.y)).toBeLessThan(1);
    }
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
    expect(calls).toEqual(['lock', 'disconnect']);
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
    // The compatibility contract: no expectedCaptains means nothing moved.
    const { ctx, calls } = sealedSetup({});
    join(ctx, 'a');
    join(ctx, 'b');
    expect(ctx.m.phase).toBe('countdown');
    ctx.m.onPlayerLeave('b');
    expect(calls).toEqual(['lock', 'unlock']);
  });
});
