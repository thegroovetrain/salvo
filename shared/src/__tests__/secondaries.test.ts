// THE SECONDARIES — heat, not ammo (Story 10.4, R3, Eric 2026-11-04, epic-10
// amendment 9). sim/secondaries.ts as contracts, every number read off CONFIG:
//
//   (1) the RATE is exact against any tick — one round per `rateMs` while
//       held, the first on the press, a remainder carried across steps;
//   (2) a BURST heats linearly while firing and drains linearly once released;
//   (3) OVERHEAT: `overheatMs` of continuous fire locks the guns, no round
//       fires while locked even if still held, and the lock releases only at
//       ZERO heat, `coolMs` later;
//   (4) releasing and re-pressing never beats the rate;
//   (5) reach is `rangeFrac` of the folded main reach.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  SHIP_CLASS_IDS,
  effectiveStats,
  initialSecondaries,
  secondaryReachU,
  stepSecondaries,
  type SecondariesState,
} from '../index.js';

const DT = CONFIG.tick.simDtMs;
const { rateMs, overheatMs, coolMs } = CONFIG.secondaries;

/** Step `ticks` times at `dt` with a constant level; returns the rounds fired per step. */
function run(state: SecondariesState, held: boolean, ticks: number, dt = DT): number[] {
  const out: number[] = [];
  for (let t = 0; t < ticks; t += 1) out.push(stepSecondaries(state, held, dt));
  return out;
}

const total = (rounds: readonly number[]): number => rounds.reduce((a, b) => a + b, 0);

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

  it('never fires when not held', () => {
    const state = initialSecondaries();
    expect(total(run(state, false, 500))).toBe(0);
    expect(state).toEqual(initialSecondaries());
  });
});

describe('a burst heats while firing and drains when released', () => {
  it('heat rises linearly — held ms / overheatMs — and every step of a hold fires or waits, never locks early', () => {
    const state = initialSecondaries();
    const ticks = Math.floor(overheatMs / 2 / DT);
    for (let k = 1; k <= ticks; k += 1) {
      stepSecondaries(state, true, DT);
      expect(state.heat).toBeCloseTo((k * DT) / overheatMs, 9);
      expect(state.locked).toBe(false);
    }
  });

  it('released short of overheat, heat drains linearly to exactly zero in heat × coolMs and the guns were never locked', () => {
    const state = initialSecondaries();
    const heldTicks = Math.floor(overheatMs / 2 / DT);
    run(state, true, heldTicks);
    const peak = state.heat;
    const drainTicks = Math.ceil((peak * coolMs) / DT - 1e-9);
    for (let k = 1; k < drainTicks; k += 1) {
      stepSecondaries(state, false, DT);
      expect(state.heat).toBeCloseTo(peak - (k * DT) / coolMs, 9);
      expect(state.heat).toBeGreaterThan(0);
      expect(state.locked).toBe(false);
    }
    stepSecondaries(state, false, DT);
    expect(state.heat).toBe(0);
    // Cold again: a fresh press fires at once.
    expect(stepSecondaries(state, true, DT)).toBe(1);
  });

  it('short bursts with rests between them can go on indefinitely without ever locking', () => {
    const state = initialSecondaries();
    const burst = Math.floor(overheatMs / 4 / DT);
    const rest = Math.ceil(((burst * DT) / overheatMs) * coolMs / DT) + 1; // long enough to shed the burst's heat
    let fired = 0;
    for (let cycle = 0; cycle < 50; cycle += 1) {
      fired += total(run(state, true, burst));
      run(state, false, rest);
      expect(state.locked, `cycle ${cycle}`).toBe(false);
      expect(state.heat).toBe(0);
    }
    expect(fired).toBeGreaterThan(50);
  });
});

describe('overheat', () => {
  const toFull = Math.round(overheatMs / DT);
  const toCold = Math.round(coolMs / DT);

  it('continuous fire locks the guns after exactly overheatMs — not a tick sooner, not a tick later', () => {
    const state = initialSecondaries();
    for (let k = 1; k < toFull; k += 1) {
      stepSecondaries(state, true, DT);
      expect(state.locked, `tick ${k}`).toBe(false);
    }
    stepSecondaries(state, true, DT);
    expect(state.locked).toBe(true);
    expect(state.heat).toBe(1);
  });

  it('LOCKED: no round fires even while still held, and the lock releases only when heat is back to ZERO, coolMs later', () => {
    const state = initialSecondaries();
    const firing = total(run(state, true, toFull));
    expect(firing).toBe(Math.floor(overheatMs / rateMs) + 1);
    for (let k = 1; k < toCold; k += 1) {
      expect(stepSecondaries(state, true, DT), `tick ${k}`).toBe(0); // still held: nothing
      expect(state.locked, `tick ${k}`).toBe(true);
      expect(state.heat).toBeGreaterThan(0);
      expect(state.heat).toBeCloseTo(1 - (k * DT) / coolMs, 9);
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
    run(held, true, toFull);
    run(released, true, toFull);
    run(held, true, 37);
    run(released, false, 37);
    expect(held.heat).toBe(released.heat);
    expect(held.locked).toBe(released.locked);
  });

  it('a held trigger cycles: fire for overheatMs, dark for coolMs, and the long-run round count follows the duty cycle', () => {
    const state = initialSecondaries();
    const cycles = 5;
    const fired = total(run(state, true, cycles * (toFull + toCold)));
    expect(fired).toBe(cycles * (Math.floor(overheatMs / rateMs) + 1));
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
