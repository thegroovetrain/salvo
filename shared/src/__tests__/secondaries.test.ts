// THE SECONDARIES — heat, not ammo (Story 10.4, R3, Eric 2026-11-04, epic-10
// amendment 9; the heat law is PER ROUND since review-gate patch P1).
// sim/secondaries.ts as contracts, every number read off CONFIG:
//
//   (1) the RATE is exact against any tick — one round per `rateMs` while
//       held, the first on the press, a remainder carried across steps;
//   (2) HEAT IS A LEDGER OF ROUNDS: every round adds `rateMs / overheatMs`,
//       a round's own rate window never cools, idle time outside it drains
//       linearly — exactly, partial ticks included;
//   (3) NO PRESS PATTERN BEATS THE DUTY CYCLE (the tap exploit P1 closed);
//   (4) OVERHEAT: a continuous hold locks after the rounds one full heat
//       holds, at `overheatMs` to the tick; no round fires while locked even
//       if still held; the lock releases only at ZERO heat;
//   (5) releasing and re-pressing never beats the rate;
//   (6) reach is `rangeFrac` of the folded main reach.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  SHIP_CLASS_IDS,
  effectiveStats,
  initialSecondaries,
  mulberry32,
  secondariesHeatPerRound,
  secondaryReachU,
  stepSecondaries,
  type SecondariesState,
} from '../index.js';

const DT = CONFIG.tick.simDtMs;
const { rateMs, overheatMs, coolMs } = CONFIG.secondaries;

/** Heat one round adds (a fraction of full). */
const HEAT_PER_ROUND = rateMs / overheatMs;
/** Rounds a continuous hold fires from cold before it locks: the round that reaches full heat is fired. */
const ROUNDS_TO_LOCK = Math.ceil(1 / HEAT_PER_ROUND - 1e-9);
/** The 1-based step in which round `j` (0-based) of a continuous hold from cold fires: a round due on a step's end fires in it. */
const stepOfRound = (j: number, dt: number = DT): number => Math.max(1, Math.ceil((j * rateMs) / dt - 1e-9));
/** The step in which a continuous hold from cold locks. */
const LOCK_STEP = stepOfRound(ROUNDS_TO_LOCK - 1);
/** ms of idle time one round's heat takes to drain. */
const IDLE_PER_ROUND_MS = HEAT_PER_ROUND * coolMs;

/** Step `ticks` times at `dt` with a constant level; returns the rounds fired per step. */
function run(state: SecondariesState, held: boolean, ticks: number, dt: number = DT): number[] {
  const out: number[] = [];
  for (let t = 0; t < ticks; t += 1) out.push(stepSecondaries(state, held, dt));
  return out;
}

const total = (rounds: readonly number[]): number => rounds.reduce((a, b) => a + b, 0);

/** Hold from cold until the guns lock; returns the rounds fired and the steps it took. */
function holdToLock(state: SecondariesState, dt: number = DT): { rounds: number; steps: number } {
  let rounds = 0;
  for (let steps = 1; steps <= 100000; steps += 1) {
    rounds += stepSecondaries(state, true, dt);
    if (state.locked) return { rounds, steps };
  }
  throw new Error('never locked');
}

/** A whole run of a press pattern: what it fired, how hot it got, how often it locked. */
interface PatternRun {
  rounds: number;
  maxHeat: number;
  locks: number;
}

function runPattern(press: (tick: number) => boolean, ticks: number): PatternRun {
  const state = initialSecondaries();
  const out: PatternRun = { rounds: 0, maxHeat: 0, locks: 0 };
  for (let t = 0; t < ticks; t += 1) {
    const was = state.locked;
    out.rounds += stepSecondaries(state, press(t), DT);
    if (state.locked && !was) out.locks += 1;
    out.maxHeat = Math.max(out.maxHeat, state.heat);
    if (state.heat < 0 || state.heat > 1) throw new Error(`heat ${state.heat} left [0, 1] at tick ${t}`);
  }
  return out;
}

describe('the rate is exact against the tick', () => {
  it('fires the first round on the press, then one per rateMs: floor(held / rateMs) + 1 rounds after any hold short of overheat', () => {
    for (const dt of [DT, 10, 16, rateMs, 250]) {
      const state = initialSecondaries();
      const maxTicks = Math.floor((overheatMs * 0.9) / dt);
      let fired = 0;
      for (let k = 1; k <= maxTicks; k += 1) {
        fired += stepSecondaries(state, true, dt);
        expect(fired, `dt ${dt}, ${k} ticks`).toBe(Math.floor((k * dt) / rateMs) + 1);
        expect(state.locked).toBe(false);
      }
    }
  });

  it('at the sim tick no two rounds share a tick, and every gap between rounds is within one tick of rateMs', () => {
    const state = initialSecondaries();
    const rounds = run(state, true, Math.floor((overheatMs * 0.9) / DT));
    expect(rateMs).toBeGreaterThan(DT); // the premise: a round takes longer than a tick
    expect(Math.max(...rounds)).toBe(1);
    const at = rounds.flatMap((n, t) => (n > 0 ? [t * DT] : []));
    const gaps = at.slice(1).map((t, i) => t - at[i]);
    expect(gaps.length).toBeGreaterThan(10);
    for (const g of gaps) expect(Math.abs(g - rateMs)).toBeLessThan(DT);
    // …and the drift never accumulates: round j fires within a tick of j × rateMs.
    at.forEach((t, j) => expect(Math.abs(t - j * rateMs), `round ${j}`).toBeLessThanOrEqual(DT));
  });

  it('a step longer than several rates fires several rounds at once and carries the remainder', () => {
    const state = initialSecondaries();
    const dt = rateMs * 3 + rateMs / 2;
    expect(stepSecondaries(state, true, dt)).toBe(4); // t = 0, r, 2r, 3r
    expect(state.untilRoundMs).toBeCloseTo(rateMs / 2, 9); // the next is due half a rate into the next step
  });

  it('RELEASING AND RE-PRESSING NEVER BEATS THE RATE: tapping every other tick fires no more than holding would', () => {
    const tapped = initialSecondaries();
    let fired = 0;
    const ticks = Math.floor((overheatMs * 0.9) / DT);
    for (let t = 0; t < ticks; t += 1) fired += stepSecondaries(tapped, t % 2 === 0, DT);
    expect(fired).toBeLessThanOrEqual(Math.floor((ticks * DT) / rateMs) + 1);
    expect(fired).toBeGreaterThan(0);
  });

  it('under ANY press pattern two rounds are never closer than rateMs apart (to the step)', () => {
    for (const dt of [1, 7, DT]) {
      const rng = mulberry32(0x5ec0 + dt);
      const state = initialSecondaries();
      let last = -Infinity;
      let fired = 0;
      let held = false;
      for (let k = 0; k < Math.ceil(60000 / dt); k += 1) {
        if (rng.float(0, 1) < 0.3) held = !held; // releases and re-presses at random
        const n = stepSecondaries(state, held, dt);
        expect(n, `dt ${dt} step ${k}`).toBeLessThanOrEqual(1); // every dt here is shorter than a round
        if (n === 0) continue;
        // A round is stamped with its step's START; its true time is inside the step.
        expect(k * dt - last, `dt ${dt} step ${k}`).toBeGreaterThan(rateMs - dt - 1e-9);
        last = k * dt;
        fired += 1;
      }
      expect(fired).toBeGreaterThan(20);
    }
  });

  it('never fires when not held', () => {
    const state = initialSecondaries();
    expect(total(run(state, false, 500))).toBe(0);
    expect(state).toEqual(initialSecondaries());
  });

  it('a step of no time (or a junk dt) changes nothing and fires nothing', () => {
    for (const dt of [0, -DT, Number.NaN]) {
      const state = initialSecondaries();
      run(state, true, 3);
      const before = { ...state };
      expect(stepSecondaries(state, true, dt)).toBe(0);
      expect(state).toEqual(before);
    }
  });
});

describe('heat is a ledger of rounds', () => {
  it('the heat of one round is rateMs / overheatMs: overheatMs of continuous fire is one full heat', () => {
    expect(secondariesHeatPerRound()).toBe(HEAT_PER_ROUND);
    expect(secondariesHeatPerRound() * (overheatMs / rateMs)).toBeCloseTo(1, 12);
  });

  it('EVERY ROUND adds the same heat: through a continuous hold heat is exactly (rounds fired) × the heat of one round', () => {
    for (const dt of [DT, 10, 16, 250]) {
      const state = initialSecondaries();
      let fired = 0;
      for (let k = 1; k < stepOfRound(ROUNDS_TO_LOCK - 1, dt); k += 1) {
        fired += stepSecondaries(state, true, dt);
        expect(state.heat, `dt ${dt} step ${k}`).toBeCloseTo(fired * HEAT_PER_ROUND, 9);
        expect(state.locked).toBe(false);
      }
      expect(fired).toBeGreaterThan(0);
    }
  });

  it("A ROUND'S OWN RATE WINDOW DOES NOT COOL: one tapped round holds its heat until its window has run, then drains — to the millisecond inside a tick", () => {
    const state = initialSecondaries();
    expect(stepSecondaries(state, true, DT)).toBe(1); // the round fires at the step's start
    expect(state.heat).toBeCloseTo(HEAT_PER_ROUND, 12);
    let sawPartial = false;
    for (let k = 2; state.heat > 0 && k < 10000; k += 1) {
      stepSecondaries(state, false, DT);
      const idleMs = Math.max(0, k * DT - rateMs); // time since the round's window closed
      const want = Math.max(0, HEAT_PER_ROUND - idleMs / coolMs);
      expect(state.heat, `step ${k}`).toBeCloseTo(want, 12);
      if (idleMs > 0 && idleMs < DT) sawPartial = true; // the window closed INSIDE this step
    }
    expect(state.heat).toBe(0);
    // The premise of "partial tick": the window does not end on a tick boundary.
    expect(rateMs % DT === 0 || sawPartial).toBe(true);
  });

  it('the busy window holds heat whether the button is held or released (a locked or idle gun inside it does not cool either)', () => {
    const released = initialSecondaries();
    stepSecondaries(released, true, DT);
    const whole = Math.floor((rateMs - DT) / DT); // whole steps still inside the round's window
    for (let k = 0; k < whole; k += 1) {
      stepSecondaries(released, false, DT);
      expect(released.heat).toBeCloseTo(HEAT_PER_ROUND, 12);
    }
    expect(whole).toBeGreaterThan(0);
  });

  it('released short of overheat, heat drains linearly to exactly zero in (window left) + heat × coolMs and the guns were never locked', () => {
    const state = initialSecondaries();
    run(state, true, Math.floor(LOCK_STEP / 2));
    const peak = state.heat;
    const windowLeft = state.untilRoundMs;
    expect(peak).toBeGreaterThan(0);
    const drainTicks = Math.ceil((windowLeft + peak * coolMs) / DT - 1e-9);
    for (let k = 1; k < drainTicks; k += 1) {
      stepSecondaries(state, false, DT);
      expect(state.heat).toBeCloseTo(peak - Math.max(0, k * DT - windowLeft) / coolMs, 9);
      expect(state.heat).toBeGreaterThan(0);
      expect(state.locked).toBe(false);
    }
    stepSecondaries(state, false, DT);
    expect(state.heat).toBe(0);
    // Cold again: a fresh press fires at once.
    expect(stepSecondaries(state, true, DT)).toBe(1);
  });

  it('short bursts with rests long enough to shed them can go on indefinitely without ever locking', () => {
    const state = initialSecondaries();
    const burst = Math.floor(LOCK_STEP / 4);
    let fired = 0;
    for (let cycle = 0; cycle < 50; cycle += 1) {
      const n = total(run(state, true, burst));
      fired += n;
      // Each round needs its own idle time; the last round's window runs first.
      run(state, false, Math.ceil((rateMs + n * IDLE_PER_ROUND_MS) / DT) + 1);
      expect(state.locked, `cycle ${cycle}`).toBe(false);
      expect(state.heat).toBe(0);
    }
    expect(fired).toBeGreaterThan(50);
  });

  it('THE LAW IS EXACT, NOT TICK-QUANTIZED: the same press pattern stepped at a fifth of the tick gives the same rounds and the same heat', () => {
    const rng = mulberry32(0x104_5ec);
    const coarse = initialSecondaries();
    const fine = initialSecondaries();
    const sub = 5;
    let held = false;
    let locked = false;
    for (let t = 0; t < 4000 && !locked; t += 1) {
      if (rng.float(0, 1) < 0.2) held = !held;
      const a = stepSecondaries(coarse, held, DT);
      const b = total(run(fine, held, sub, DT / sub));
      locked = coarse.locked || fine.locked; // the unlock is a per-step event; compare up to the first lock
      if (locked) break;
      expect(b, `tick ${t}`).toBe(a);
      expect(fine.heat, `tick ${t}`).toBeCloseTo(coarse.heat, 9);
      expect(fine.untilRoundMs, `tick ${t}`).toBeCloseTo(coarse.untilRoundMs, 9);
    }
  });
});

describe('NO PRESS PATTERN BEATS THE DUTY CYCLE (review-gate patch P1: tapping is not a way round the heat limit)', () => {
  const T_MS = 120000;
  const TICKS = T_MS / DT;
  /** ms per round the heat law can sustain: the round's own window plus the idle time its heat takes to drain. */
  const SUSTAINED_MS_PER_ROUND = rateMs * (1 + coolMs / overheatMs);
  /** Rounds one full heat is worth — what a cold gun has banked. */
  const ROUNDS_PER_FULL_HEAT = 1 / HEAT_PER_ROUND;

  const seeded = (seed: number, p: number): ((t: number) => boolean) => {
    const rng = mulberry32(seed);
    const bits = Array.from({ length: TICKS }, () => rng.float(0, 1) < p);
    return (t) => bits[t];
  };
  const FIXED = [true, false, false, true, true, false, true, false, false, false, true];
  const patterns: [string, (t: number) => boolean][] = [
    ['continuous hold', () => true],
    ['1 tick in 2', (t) => t % 2 === 0],
    ['1 tick in 3', (t) => t % 3 === 0],
    ['1 tick in 4', (t) => t % 4 === 0],
    ['1 tick in 6', (t) => t % 6 === 0],
    ['2 ticks in 5', (t) => t % 5 < 2],
    ['a fixed irregular pattern', (t) => FIXED[t % FIXED.length]],
    ['random, held half the time', seeded(0xa11ce, 0.5)],
    ['random, held a third of the time', seeded(0xb0b, 0.33)],
    ['random, held a tenth of the time', seeded(0xcafe, 0.1)],
  ];

  it('the window is much longer than one overheat-and-cool cycle', () => {
    expect(T_MS).toBeGreaterThan(10 * (overheatMs + coolMs));
  });

  it.each(patterns)('%s: heat stays in [0, 1] and the rounds fired never exceed the duty-cycle bound', (_name, press) => {
    const r = runPattern(press, TICKS); // throws if heat ever leaves [0, 1]
    expect(r.rounds).toBeGreaterThan(0);
    // THE BOUND. Heat ends ≥ 0 and never passes 1, every round added
    // HEAT_PER_ROUND, and only idle time (T − rounds × rateMs at most) drained
    // it — so rounds × (rateMs + its idle share) ≤ T + one full heat's worth.
    // Each lock throws away less than one round's heat (the overshoot past
    // full), hence the `+ locks`.
    expect(r.rounds).toBeLessThanOrEqual(T_MS / SUSTAINED_MS_PER_ROUND + ROUNDS_PER_FULL_HEAT + r.locks);
    // A pattern that never locks gets no such allowance.
    if (r.locks === 0) expect(r.rounds).toBeLessThanOrEqual(T_MS / SUSTAINED_MS_PER_ROUND + ROUNDS_PER_FULL_HEAT);
  });

  it('TAPPING BUYS NOTHING: no tap pattern fires more than a continuous hold plus one full heat of rounds', () => {
    const hold = runPattern(() => true, TICKS);
    for (const [name, press] of patterns) {
      expect(runPattern(press, TICKS).rounds, name).toBeLessThanOrEqual(hold.rounds + ROUNDS_PER_FULL_HEAT);
    }
  });

  it('a tap that out-fires what its idle time can shed OVERHEATS: any pattern faster than the sustained rate locks', () => {
    for (const [name, press] of patterns) {
      const r = runPattern(press, TICKS);
      if (r.rounds > T_MS / SUSTAINED_MS_PER_ROUND + ROUNDS_PER_FULL_HEAT) expect(r.locks, name).toBeGreaterThan(0);
    }
    // …and the taps a player would actually try are in that set: one tick in
    // two and one in three both press again before a round's heat has drained.
    for (const every of [2, 3]) {
      expect(every * DT - rateMs, `1 in ${every}`).toBeLessThan(IDLE_PER_ROUND_MS); // the premise
      expect(runPattern((t) => t % every === 0, TICKS).locks, `1 in ${every}`).toBeGreaterThan(0);
    }
  });
});

describe('overheat', () => {
  it('a continuous hold from cold locks on the round that reaches full heat — as many rounds as one full heat holds, at overheatMs to the tick', () => {
    const state = initialSecondaries();
    let fired = 0;
    for (let k = 1; k < LOCK_STEP; k += 1) {
      fired += stepSecondaries(state, true, DT);
      expect(state.locked, `tick ${k}`).toBe(false);
    }
    fired += stepSecondaries(state, true, DT);
    expect(state.locked).toBe(true);
    expect(state.heat).toBe(1);
    expect(fired).toBe(ROUNDS_TO_LOCK);
    // The same count the per-tick law gave: every round a hold of overheatMs fires.
    expect(fired).toBeGreaterThanOrEqual(Math.floor(overheatMs / rateMs));
    expect(fired).toBeLessThanOrEqual(Math.floor(overheatMs / rateMs) + 1);
    // Eric's R3 number: overheatMs of fire, give or take a tick.
    expect(Math.abs(LOCK_STEP * DT - overheatMs)).toBeLessThanOrEqual(DT);
  });

  it('the rounds to a lock do not depend on the tick', () => {
    for (const dt of [1, 10, 16, DT, rateMs, 250]) {
      expect(holdToLock(initialSecondaries(), dt).rounds, `dt ${dt}`).toBe(ROUNDS_TO_LOCK);
    }
  });

  it('LOCKED: no round fires even while still held, and the lock releases only when heat is back to ZERO — the last window, then coolMs', () => {
    const state = initialSecondaries();
    holdToLock(state);
    const windowLeft = state.untilRoundMs; // the locking round's own window is still running
    const toCold = Math.ceil((windowLeft + coolMs) / DT - 1e-9);
    for (let k = 1; k < toCold; k += 1) {
      expect(stepSecondaries(state, true, DT), `tick ${k}`).toBe(0); // still held: nothing
      expect(state.locked, `tick ${k}`).toBe(true);
      expect(state.heat).toBeGreaterThan(0);
      expect(state.heat).toBeCloseTo(1 - Math.max(0, k * DT - windowLeft) / coolMs, 9);
    }
    expect(stepSecondaries(state, true, DT)).toBe(0); // the step that reaches zero unlocks, it does not fire
    expect(state.locked).toBe(false);
    expect(state.heat).toBe(0);
    // Still held: the very next step fires again.
    expect(stepSecondaries(state, true, DT)).toBe(1);
  });

  it('a locked gun cools at the same rate whether the button is held or released', () => {
    const held = initialSecondaries();
    const released = initialSecondaries();
    holdToLock(held);
    holdToLock(released);
    run(held, true, 37);
    run(released, false, 37);
    expect(held.heat).toBe(released.heat);
    expect(held.locked).toBe(released.locked);
  });

  it('a held trigger cycles: every burst after a lock is the same full heat of rounds, one cycle = the burst + its last window + coolMs (to the tick)', () => {
    const state = initialSecondaries();
    const first = holdToLock(state);
    const cycles = 5;
    for (let c = 0; c < cycles; c += 1) {
      let dark = 0;
      while (state.locked) {
        expect(stepSecondaries(state, true, DT)).toBe(0);
        dark += 1;
      }
      expect(Math.abs(dark * DT - (rateMs + coolMs)), `cycle ${c}`).toBeLessThanOrEqual(DT);
      const next = holdToLock(state);
      expect(next.rounds, `cycle ${c}`).toBe(first.rounds);
      expect(next.steps, `cycle ${c}`).toBe(first.steps);
    }
  });

  it('is deterministic', () => {
    const play = (): { state: SecondariesState; rounds: number[] } => {
      const state = initialSecondaries();
      const rounds: number[] = [];
      for (let t = 0; t < 2000; t += 1) rounds.push(stepSecondaries(state, (t * 7) % 13 < 9, DT));
      return { state, rounds };
    };
    expect(play()).toEqual(play());
  });
});

describe('the bot heat thresholds (CONFIG.bots, review-gate patch P5)', () => {
  it('a bot releases above where it presses again, both strictly inside (0, 1), and a release leaves room for at least one more round before the lock', () => {
    const { secReleaseHeat, secRepressHeat } = CONFIG.bots;
    expect(secRepressHeat).toBeGreaterThan(0);
    expect(secReleaseHeat).toBeLessThan(1);
    expect(secRepressHeat).toBeLessThan(secReleaseHeat);
    expect(secReleaseHeat + HEAT_PER_ROUND).toBeLessThan(1);
  });
});

describe('reach', () => {
  it('is rangeFrac of the main reach, and the stats row publishes it off the FOLDED main reach on every hull', () => {
    expect(secondaryReachU(1000)).toBe(1000 * CONFIG.secondaries.rangeFrac);
    for (const id of SHIP_CLASS_IDS) {
      const stats = effectiveStats(CONFIG.shipClasses[id]);
      expect(stats.secondaryRangeU, id).toBe(secondaryReachU(stats.equipment.mainBattery.rangeU));
      expect(stats.secondaryRangeU, id).toBeLessThan(stats.equipment.mainBattery.rangeU);
    }
  });
});
