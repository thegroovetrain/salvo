// THE SECONDARIES — heat, not ammo (Story 10.4, R3, Eric 2026-11-04, epic-10
// amendment 9), and heat slows the gun without ever stopping it (Eric
// 2026-11-13, epic-11 amendment 9). sim/secondaries.ts as
// contracts, every number read off CONFIG:
//
//   (1) the INTERVAL a round starts is 1000 / rate, the rate linear in heat
//       from `coldRatePerS` to `hotRatePerS`;
//   (2) HEAT IS A LEDGER OF ROUNDS: every round adds its own interval /
//       `overheatMs` (capped at 1), a round's own interval never cools, idle
//       time outside it drains linearly — exactly, partial ticks included;
//   (3) the rate is exact against any tick, the remainder carried;
//   (4) a continuous hold reaches full heat after `overheatMs` of fire, and
//       at full heat it keeps firing at the hot rate — no lock;
//   (5) no press pattern beats a hold beyond the surplus its own cooling buys,
//       and a release never brings a round forward;
//   (6) reach is `rangeFrac` of the folded main reach;
//   (7) INSTANT RELOAD VENTS them (Story 10.5, R10): heat zero.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  SHIP_CLASS_IDS,
  effectiveStats,
  initialSecondaries,
  mulberry32,
  secondariesIntervalMs,
  secondaryReachU,
  stepSecondaries,
  ventSecondaries,
  type SecondariesState,
} from '../index.js';

const DT = CONFIG.tick.simDtMs;
const { coldRatePerS, hotRatePerS, overheatMs, coolMs } = CONFIG.secondaries;

/** ms between rounds of a cold gun and of a gun at full heat. */
const COLD_MS = 1000 / coldRatePerS;
const HOT_MS = 1000 / hotRatePerS;

/** Step `ticks` times at `dt` with a constant level; returns the rounds fired per step. */
function run(state: SecondariesState, held: boolean, ticks: number, dt: number = DT): number[] {
  const out: number[] = [];
  for (let t = 0; t < ticks; t += 1) out.push(stepSecondaries(state, held, dt));
  return out;
}

const total = (rounds: readonly number[]): number => rounds.reduce((a, b) => a + b, 0);

/** Hold from cold until full heat; returns the rounds fired and the steps it took. */
function holdToFull(state: SecondariesState, dt: number = DT): { rounds: number; steps: number } {
  let rounds = 0;
  for (let steps = 1; steps <= 100000; steps += 1) {
    rounds += stepSecondaries(state, true, dt);
    if (state.heat === 1) return { rounds, steps };
  }
  throw new Error('never reached full heat');
}

/** A whole run of a press pattern: what it fired and how much heat its idle time shed. */
interface PatternRun {
  rounds: number;
  shed: number;
}

function runPattern(press: (tick: number) => boolean, ticks: number): PatternRun {
  const state = initialSecondaries();
  const out: PatternRun = { rounds: 0, shed: 0 };
  for (let t = 0; t < ticks; t += 1) {
    const before = state.heat;
    out.rounds += stepSecondaries(state, press(t), DT);
    if (state.heat < before) out.shed += before - state.heat;
    if (state.heat < 0 || state.heat > 1) throw new Error(`heat ${state.heat} left [0, 1] at tick ${t}`);
  }
  return out;
}

describe('the interval law', () => {
  it('a cold round starts the cold interval, a full-heat round the hot one, and the rate is linear in heat between', () => {
    expect(secondariesIntervalMs(0)).toBeCloseTo(COLD_MS, 9);
    expect(secondariesIntervalMs(1)).toBeCloseTo(HOT_MS, 9);
    for (const h of [0.1, 0.25, 0.5, 0.8]) {
      const rate = 1000 / secondariesIntervalMs(h);
      expect(rate, `heat ${h}`).toBeCloseTo(coldRatePerS + (hotRatePerS - coldRatePerS) * h, 9);
    }
  });

  it('heat outside [0, 1] is clamped', () => {
    expect(secondariesIntervalMs(-1)).toBe(secondariesIntervalMs(0));
    expect(secondariesIntervalMs(2)).toBe(secondariesIntervalMs(1));
  });

  it('a hotter gun is never faster', () => {
    let last = 0;
    for (let h = 0; h <= 1; h += 0.05) {
      const iv = secondariesIntervalMs(h);
      expect(iv).toBeGreaterThanOrEqual(last);
      last = iv;
    }
  });
});

describe('heat is a ledger of rounds', () => {
  it('EVERY ROUND adds its own interval / overheatMs (capped at 1) and starts that interval — at any tick', () => {
    for (const dt of [1, 16, DT]) {
      const state = initialSecondaries();
      let checked = 0;
      for (let k = 0; k < Math.ceil((overheatMs * 1.5) / dt); k += 1) {
        const before = state.heat;
        if (stepSecondaries(state, true, dt) === 0) continue;
        const iv = secondariesIntervalMs(before);
        expect(state.heat, `dt ${dt} step ${k}`).toBeCloseTo(Math.min(1, before + iv / overheatMs), 9);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(10);
    }
  });

  it("A ROUND'S OWN INTERVAL DOES NOT COOL: one tapped round holds its heat until its interval has run, then drains — to the millisecond inside a tick", () => {
    const state = initialSecondaries();
    expect(stepSecondaries(state, true, DT)).toBe(1); // the round fires at the step's start
    const peak = state.heat;
    expect(peak).toBeCloseTo(COLD_MS / overheatMs, 12);
    let sawPartial = false;
    for (let k = 2; state.heat > 0 && k < 10000; k += 1) {
      stepSecondaries(state, false, DT);
      const idleMs = Math.max(0, k * DT - COLD_MS); // time since the round's interval closed
      expect(state.heat, `step ${k}`).toBeCloseTo(Math.max(0, peak - idleMs / coolMs), 12);
      if (idleMs > 0 && idleMs < DT) sawPartial = true; // the interval closed INSIDE this step
    }
    expect(state.heat).toBe(0);
    expect(COLD_MS % DT === 0 || sawPartial).toBe(true);
  });

  it('released, heat drains linearly to exactly zero in (interval left) + heat × coolMs, and the rate recovers with it', () => {
    const state = initialSecondaries();
    holdToFull(state);
    run(state, true, 7); // a little time riding full heat
    const peak = state.heat;
    const windowLeft = state.untilRoundMs;
    const drainTicks = Math.ceil((windowLeft + peak * coolMs) / DT - 1e-9);
    for (let k = 1; k < drainTicks; k += 1) {
      stepSecondaries(state, false, DT);
      expect(state.heat, `tick ${k}`).toBeCloseTo(peak - Math.max(0, k * DT - windowLeft) / coolMs, 9);
      expect(state.heat).toBeGreaterThan(0);
    }
    stepSecondaries(state, false, DT);
    expect(state.heat).toBe(0);
    // Cold again: a fresh press fires at once and starts the cold interval.
    expect(stepSecondaries(state, true, DT)).toBe(1);
    expect(state.untilRoundMs + DT).toBeCloseTo(COLD_MS, 9);
  });

  it('THE LAW IS EXACT, NOT TICK-QUANTIZED: the same press pattern stepped at a fifth of the tick gives the same rounds and the same heat', () => {
    const rng = mulberry32(0x104_5ec);
    const coarse = initialSecondaries();
    const fine = initialSecondaries();
    const sub = 5;
    let held = false;
    for (let t = 0; t < 4000; t += 1) {
      if (rng.float(0, 1) < 0.2) held = !held;
      const a = stepSecondaries(coarse, held, DT);
      const b = total(run(fine, held, sub, DT / sub));
      expect(b, `tick ${t}`).toBe(a);
      expect(fine.heat, `tick ${t}`).toBeCloseTo(coarse.heat, 9);
      expect(fine.untilRoundMs, `tick ${t}`).toBeCloseTo(coarse.untilRoundMs, 9);
    }
  });
});

describe('the rate is exact against the tick', () => {
  it('fires the first round on the press', () => {
    expect(stepSecondaries(initialSecondaries(), true, DT)).toBe(1);
  });

  it('a step longer than several intervals fires every round due in it and carries the remainder', () => {
    const state = initialSecondaries();
    const dt = COLD_MS * 2.5; // rounds at 0, then after each interval — short of a third interval's end
    const want: number[] = [];
    let h = 0;
    let t = 0;
    while (t <= dt) {
      want.push(t);
      const iv = secondariesIntervalMs(h);
      h = Math.min(1, h + iv / overheatMs);
      t += iv;
    }
    expect(stepSecondaries(state, true, dt)).toBe(want.length);
    expect(want.length).toBeGreaterThan(1);
    expect(state.untilRoundMs).toBeCloseTo(t - dt, 9);
    expect(state.heat).toBeCloseTo(h, 12);
  });

  it('never fires when not held', () => {
    const state = initialSecondaries();
    expect(total(run(state, false, 500))).toBe(0);
    expect(state).toEqual(initialSecondaries());
  });

  it('a step of no time (or a junk dt) changes nothing and fires nothing', () => {
    for (const dt of [0, -DT, Number.NaN, Number.POSITIVE_INFINITY]) {
      const state = initialSecondaries();
      run(state, true, 3);
      const before = { ...state };
      expect(stepSecondaries(state, true, dt)).toBe(0);
      expect(state).toEqual(before);
    }
  });

  it('a non-finite heat reads as cold: the held step still ends, at the cold interval', () => {
    const state: SecondariesState = { heat: Number.NaN, untilRoundMs: 0 };
    expect(stepSecondaries(state, true, DT)).toBe(Math.floor(DT / secondariesIntervalMs(0)) + 1);
    expect(Number.isFinite(state.heat)).toBe(true);
    expect(Number.isFinite(state.untilRoundMs)).toBe(true);
    expect(secondariesIntervalMs(Number.NaN)).toBe(secondariesIntervalMs(0));
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

describe('overheat slows the gun and never stops it', () => {
  it('a cold gun held for overheatMs at the sim tick fires the mean of the cold and hot rates × overheatMs (± 1 round) and ends at full heat', () => {
    const state = initialSecondaries();
    const fired = total(run(state, true, overheatMs / DT));
    const mean = ((coldRatePerS + hotRatePerS) / 2) * (overheatMs / 1000);
    expect(Math.abs(fired - mean)).toBeLessThanOrEqual(1);
    expect(state.heat).toBe(1);
  });

  it('full heat comes within one hot interval of overheatMs of continuous fire, at any tick', () => {
    for (const dt of [1, 10, 16, DT, 250]) {
      const { steps } = holdToFull(initialSecondaries(), dt);
      expect(Math.abs(steps * dt - overheatMs), `dt ${dt}`).toBeLessThanOrEqual(HOT_MS + dt);
    }
  });

  it('held at full heat for a further minute: a round every hot interval, heat never leaves 1, the gun never stops', () => {
    const state = initialSecondaries();
    holdToFull(state);
    run(state, true, Math.ceil(HOT_MS / DT) + 1); // the round that capped heat finishes its interval
    const minuteTicks = 60000 / DT;
    const at: number[] = [];
    for (let k = 0; k < minuteTicks; k += 1) {
      if (stepSecondaries(state, true, DT) > 0) at.push(k * DT);
      expect(state.heat, `tick ${k}`).toBe(1);
    }
    expect(Math.abs(at.length - (60000 / 1000) * hotRatePerS)).toBeLessThanOrEqual(1);
    const gaps = at.slice(1).map((t, i) => t - at[i]);
    for (const g of gaps) expect(Math.abs(g - HOT_MS)).toBeLessThan(DT);
  });

  it('heat stays in [0, 1] under a long random press pattern', () => {
    const rng = mulberry32(0xbeef);
    expect(() => runPattern(() => rng.float(0, 1) < 0.6, 6000)).not.toThrow();
  });
});

describe('NO PRESS PATTERN BEATS A HOLD BEYOND WHAT ITS OWN COOLING EARNS (tapping is not a way round the heat)', () => {
  const T_MS = 120000;
  const TICKS = T_MS / DT;
  /** Most rounds one unit of shed heat can ever buy: every round costs at least a cold interval's share. */
  const ROUNDS_PER_HEAT = overheatMs / COLD_MS;

  const seeded = (seed: number, p: number): ((t: number) => boolean) => {
    const rng = mulberry32(seed);
    const bits = Array.from({ length: TICKS }, () => rng.float(0, 1) < p);
    return (t) => bits[t];
  };
  const FIXED = [true, false, false, true, true, false, true, false, false, false, true];
  const patterns: [string, (t: number) => boolean][] = [
    ['1 tick in 2', (t) => t % 2 === 0],
    ['1 tick in 3', (t) => t % 3 === 0],
    ['1 tick in 4', (t) => t % 4 === 0],
    ['1 tick in 6', (t) => t % 6 === 0],
    ['2 ticks in 5', (t) => t % 5 < 2],
    ['bursts and rests', (t) => t % 40 < 20],
    ['a fixed irregular pattern', (t) => FIXED[t % FIXED.length]],
    ['random, held half the time', seeded(0xa11ce, 0.5)],
    ['random, held a third of the time', seeded(0xb0b, 0.33)],
    ['random, held a tenth of the time', seeded(0xcafe, 0.1)],
  ];

  it('the window is much longer than one overheat-and-cool cycle', () => {
    expect(T_MS).toBeGreaterThan(5 * (overheatMs + coolMs));
  });

  it.each(patterns)('%s: never more rounds than a hold plus the surplus its shed heat buys', (_name, press) => {
    const hold = runPattern(() => true, TICKS);
    const r = runPattern(press, TICKS);
    expect(r.rounds).toBeGreaterThan(0);
    expect(r.rounds).toBeLessThanOrEqual(hold.rounds + Math.ceil(r.shed * ROUNDS_PER_HEAT) + 1);
  });

  it('TAP SPAM: pressing and releasing every other tick fires no more than a hold over the same time', () => {
    const hold = runPattern(() => true, TICKS);
    for (const every of [2, 3]) {
      expect(runPattern((t) => t % every === 0, TICKS).rounds, `1 in ${every}`).toBeLessThanOrEqual(hold.rounds);
    }
  });

  it('A RELEASE NEVER BRINGS A ROUND FORWARD: under any press pattern each round waits out the previous round’s interval', () => {
    for (const dt of [1, 7, DT]) {
      const rng = mulberry32(0x5ec0 + dt);
      const state = initialSecondaries();
      let last = -Infinity;
      let lastIv = 0;
      let fired = 0;
      let held = false;
      for (let k = 0; k < Math.ceil(60000 / dt); k += 1) {
        if (rng.float(0, 1) < 0.3) held = !held;
        const before = state.heat; // a held step does not cool before it fires
        const n = stepSecondaries(state, held, dt);
        expect(n, `dt ${dt} step ${k}`).toBeLessThanOrEqual(1); // every dt here is shorter than an interval
        if (n === 0) continue;
        // A round is stamped with its step's START; its true time is inside the step.
        expect(k * dt - last, `dt ${dt} step ${k}`).toBeGreaterThan(lastIv - dt - 1e-9);
        last = k * dt;
        lastIv = secondariesIntervalMs(before);
        fired += 1;
      }
      expect(fired).toBeGreaterThan(20);
    }
  });
});

describe('ventSecondaries — INSTANT RELOAD vents the secondaries (Story 10.5, R10)', () => {
  it('a gun at full heat comes back cold and free at once; the input is not mutated', () => {
    const state = initialSecondaries();
    holdToFull(state);
    const before = { ...state };
    expect(before.untilRoundMs).toBeGreaterThan(0); // the capping round's interval is still running
    const vented = ventSecondaries(state);
    expect(vented).not.toBe(state);
    expect(state).toEqual(before);
    expect(vented).toEqual({ heat: 0, untilRoundMs: 0 });
  });

  it('a vented gun that is still held fires on the very next step, at the cold rate', () => {
    const state = ventSecondaries((() => {
      const s = initialSecondaries();
      holdToFull(s);
      return s;
    })());
    expect(stepSecondaries(state, true, DT)).toBeGreaterThan(0);
    expect(state.untilRoundMs).toBeCloseTo(COLD_MS - DT, 9); // the cold interval, less the step it fired in
  });

  it('works on the wire slice (heat only) and is the identity on a cold gun', () => {
    expect(ventSecondaries({ heat: 0.6 })).toEqual({ heat: 0 });
    expect(ventSecondaries(initialSecondaries())).toEqual(initialSecondaries());
  });
});

describe('the bot heat thresholds (CONFIG.bots, review-gate patch P5)', () => {
  it('a bot releases above where it presses again, both strictly inside (0, 1)', () => {
    const { secReleaseHeat, secRepressHeat } = CONFIG.bots;
    expect(secRepressHeat).toBeGreaterThan(0);
    expect(secReleaseHeat).toBeLessThan(1);
    expect(secRepressHeat).toBeLessThan(secReleaseHeat);
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
