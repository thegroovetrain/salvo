// Contracts of the pure half of the synthesis path (audio/synth/recipe.ts):
// sanitizers, per-shot randomness, envelope / layer / cue lengths, distance
// shaping and the shot plan. Arithmetic only — nothing here is about sound.

import { describe, it, expect } from 'vitest';
import {
  DECAY_TAUS,
  DISTANCE,
  MAX_GRAINS,
  cueLengthS,
  distanceShape,
  envTimes,
  grainOnsetsS,
  jitter,
  jitterDb,
  logPick,
  planShot,
  sanitizeDelay,
  sanitizeDistance,
  sanitizeGain,
  sanitizePan,
  type CueRecipe,
  type Layer,
} from '../recipe.js';
import { seeded } from './fakeAudio.js';

const noise = (extra: Partial<Layer> = {}): Layer => ({
  source: { kind: 'noise', color: 'white' },
  env: { peak: 1, attackMs: 2, tauMs: 40 },
  ...extra,
});

/** A droplet-scatter + Morse-pattern + echo recipe: every length term in play. */
const busy: CueRecipe = {
  layers: [
    noise({ jitter: { decay: 0.2 } }),
    {
      source: { kind: 'osc', wave: 'sine', freq: 2000 },
      env: { peak: 0.3, attackMs: 1, endMs: 25 },
      startMs: 300,
      grains: { count: 40, windowMs: 1500, thin: 1, spread: [0.5, 2] },
    },
    {
      source: { kind: 'osc', wave: 'sine', freq: 700 },
      env: { peak: 0.2, attackMs: 5, holdMs: 60, endMs: 70 },
      grains: { onsetsMs: [0, 120, 240, 600], jitterMs: 10 },
    },
  ],
  echoes: [{ delayMs: 420, gain: 0.35, lowpassHz: 500, jitter: 0.2 }],
};

describe('sanitizers (the cueGain / cuePan rule)', () => {
  it('junk gain plays at the recipe level; finite gain clamps to 0..1', () => {
    expect(sanitizeGain(undefined)).toBe(1);
    expect(sanitizeGain(NaN)).toBe(1);
    expect(sanitizeGain(Infinity)).toBe(1);
    expect(sanitizeGain(-2)).toBe(0);
    expect(sanitizeGain(3)).toBe(1);
    expect(sanitizeGain(0.4)).toBe(0.4);
  });

  it('junk pan centres; finite pan clamps to -1..1', () => {
    expect(sanitizePan(NaN)).toBe(0);
    expect(sanitizePan(-5)).toBe(-1);
    expect(sanitizePan(5)).toBe(1);
    expect(sanitizePan(0.25)).toBe(0.25);
  });

  it('junk distance is at the listener; junk delay is now', () => {
    expect(sanitizeDistance(NaN)).toBe(0);
    expect(sanitizeDistance(undefined)).toBe(0);
    expect(sanitizeDistance(2)).toBe(1);
    expect(sanitizeDelay(-1)).toBe(0);
    expect(sanitizeDelay(Infinity)).toBe(0);
    expect(sanitizeDelay(0.05)).toBe(0.05);
  });
});

describe('jitter / jitterDb / logPick', () => {
  it('jitter stays within ± frac of the value, and is identity without a frac', () => {
    const rand = seeded(7);
    for (let i = 0; i < 200; i++) {
      const v = jitter(100, 0.1, rand);
      expect(v).toBeGreaterThanOrEqual(90);
      expect(v).toBeLessThanOrEqual(110);
    }
    expect(jitter(100, undefined, rand)).toBe(100);
    expect(jitter(100, NaN, rand)).toBe(100);
    expect(jitter(100, -0.5, rand)).toBe(100);
  });

  it('jitter never crosses zero, even with frac ≥ 1', () => {
    expect(jitter(5, 3, () => 0)).toBeGreaterThan(0);
  });

  it('jitter hits both ends of the range at the extremes of rand', () => {
    expect(jitter(100, 0.1, () => 0)).toBeCloseTo(90);
    expect(jitter(100, 0.1, () => 1)).toBeCloseTo(110);
  });

  it('jitterDb is a level within ± db decibels', () => {
    const db = 2;
    expect(jitterDb(db, () => 0)).toBeCloseTo(Math.pow(10, -db / 20));
    expect(jitterDb(db, () => 1)).toBeCloseTo(Math.pow(10, db / 20));
    expect(jitterDb(undefined)).toBe(1);
  });

  it('logPick spans [lo, hi] and is 1 without a usable range', () => {
    expect(logPick([2, 8], () => 0)).toBeCloseTo(2);
    expect(logPick([2, 8], () => 1)).toBeCloseTo(8);
    expect(logPick([2, 8], () => 0.5)).toBeCloseTo(4); // geometric middle
    expect(logPick(undefined)).toBe(1);
    expect(logPick([0, 8])).toBe(1);
  });
});

describe('envTimes', () => {
  it('a tau decay is given DECAY_TAUS time constants after attack and hold', () => {
    const e = envTimes({ peak: 1, attackMs: 10, holdMs: 20, tauMs: 100 });
    expect(e.mode).toBe('tau');
    expect(e.lengthS).toBeCloseTo(0.01 + 0.02 + 0.1 * DECAY_TAUS);
  });

  it('a ramp decay ends at endMs, never before attack + hold', () => {
    expect(envTimes({ peak: 1, attackMs: 10, endMs: 200 }).lengthS).toBeCloseTo(0.2);
    expect(envTimes({ peak: 1, attackMs: 50, holdMs: 50, endMs: 20 }).lengthS).toBeCloseTo(0.1);
  });

  it('decayScale stretches only the decay', () => {
    const base = envTimes({ peak: 1, attackMs: 10, tauMs: 100 });
    const long = envTimes({ peak: 1, attackMs: 10, tauMs: 100 }, 1.5);
    expect(long.attackS).toBe(base.attackS);
    expect(long.decayS).toBeCloseTo(base.decayS * 1.5);
  });

  it('junk times degrade to 0 rather than NaN', () => {
    const e = envTimes({ peak: 1, attackMs: NaN, tauMs: -5 }, NaN);
    expect(e.lengthS).toBe(0);
  });
});

describe('grainOnsetsS', () => {
  it('no grains = one grain at the layer start', () => {
    expect(grainOnsetsS(undefined)).toEqual([0]);
  });

  it('an explicit pattern keeps its onsets (no jitter) and never goes negative (jitter)', () => {
    expect(grainOnsetsS({ onsetsMs: [0, 60, 240] })).toEqual([0, 0.06, 0.24]);
    const jittered = grainOnsetsS({ onsetsMs: [0, 5], jitterMs: 50 }, () => 0);
    for (const o of jittered) expect(o).toBeGreaterThanOrEqual(0);
  });

  it('a scatter has `count` onsets inside the window, capped at MAX_GRAINS', () => {
    const on = grainOnsetsS({ count: 30, windowMs: 400 }, seeded(3));
    expect(on).toHaveLength(30);
    for (const o of on) expect(o).toBeLessThanOrEqual(0.4);
    expect(grainOnsetsS({ count: 1e6, windowMs: 10 }, seeded(3))).toHaveLength(MAX_GRAINS);
    expect(grainOnsetsS({ count: NaN, windowMs: 10 })).toHaveLength(0);
  });

  it('thinning crowds onsets toward the start of the window', () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const flat = grainOnsetsS({ count: 200, windowMs: 1000 }, seeded(9));
    const thin = grainOnsetsS({ count: 200, windowMs: 1000, thin: 2 }, seeded(9));
    expect(mean(thin)).toBeLessThan(mean(flat));
  });
});

describe('cueLengthS', () => {
  it('covers the end of every planned grain plus the echo tail, over many shots', () => {
    const bound = cueLengthS(busy);
    for (let seed = 1; seed <= 50; seed++) {
      const plan = planShot(busy, seeded(seed));
      for (const g of plan.grains) expect(g.onsetS + g.lengthS + plan.echoTailS).toBeLessThanOrEqual(bound + 1e-9);
      expect(plan.lengthS).toBeLessThanOrEqual(bound + 1e-9);
    }
  });

  it('grows with a later layer start and with an echo', () => {
    const one: CueRecipe = { layers: [noise()] };
    expect(cueLengthS({ layers: [noise({ startMs: 500 })] })).toBeCloseTo(cueLengthS(one) + 0.5);
    expect(cueLengthS({ ...one, echoes: [{ delayMs: 950, gain: 0.2, lowpassHz: 500 }] })).toBeCloseTo(
      cueLengthS(one) + 0.95,
    );
  });

  it('is 0 for an empty recipe', () => {
    expect(cueLengthS({ layers: [] })).toBe(0);
  });
});

describe('distanceShape', () => {
  it('is untouched at the listener and the DISTANCE far values at range', () => {
    const near = distanceShape(0);
    expect(near).toEqual({ gain: 1, lowpassHz: DISTANCE.nearLowpassHz, preDelayS: 0, wet: 1 });
    const far = distanceShape(1);
    expect(far.gain).toBeCloseTo(DISTANCE.farGain);
    expect(far.lowpassHz).toBeCloseTo(DISTANCE.farLowpassHz);
    expect(far.preDelayS).toBeCloseTo(DISTANCE.farPreDelayS);
    expect(far.wet).toBeCloseTo(DISTANCE.farWet);
  });

  it('is monotone: farther is quieter, darker, later and wetter', () => {
    let prev = distanceShape(0);
    for (let i = 1; i <= 20; i++) {
      const s = distanceShape(i / 20);
      expect(s.gain).toBeLessThan(prev.gain);
      expect(s.lowpassHz).toBeLessThan(prev.lowpassHz);
      expect(s.preDelayS).toBeGreaterThan(prev.preDelayS);
      expect(s.wet).toBeGreaterThan(prev.wet);
      prev = s;
    }
  });

  it('non-finite input degrades to the listener; out of range clamps', () => {
    expect(distanceShape(NaN)).toEqual(distanceShape(0));
    expect(distanceShape(-1)).toEqual(distanceShape(0));
    expect(distanceShape(9)).toEqual(distanceShape(1));
  });
});

describe('planShot', () => {
  it('is deterministic under a seeded rand', () => {
    expect(planShot(busy, seeded(42))).toEqual(planShot(busy, seeded(42)));
  });

  it('plans one grain per onset per layer', () => {
    const plan = planShot(busy, seeded(1));
    const per = (i: number) => plan.grains.filter((g) => g.layer === i).length;
    expect(per(0)).toBe(1);
    expect(per(1)).toBe(40);
    expect(per(2)).toBe(4);
  });

  it('shares one layer-jitter draw across a layer’s grains, spread aside', () => {
    const plan = planShot(busy, seeded(5));
    const morse = plan.grains.filter((g) => g.layer === 2);
    for (const g of morse) {
      expect(g.freqScale).toBe(morse[0].freqScale);
      expect(g.decayScale).toBe(morse[0].decayScale);
    }
    const drops = plan.grains.filter((g) => g.layer === 1);
    for (const g of drops) {
      expect(g.freqScale).toBeGreaterThanOrEqual(0.5);
      expect(g.freqScale).toBeLessThanOrEqual(2);
    }
  });

  it('drops a layer beyond its farCut, keeps it within', () => {
    const r: CueRecipe = { layers: [noise(), noise({ farCut: 0.5 })] };
    expect(planShot(r, seeded(1), 0.4).grains).toHaveLength(2);
    expect(planShot(r, seeded(1), 0.6).grains).toHaveLength(1);
  });

  // Story 10.13: `pitch` transposes the whole shot (the telegraph's ahead /
  // astern pair) — every grain's frequency multiplier, nothing else.
  it('pitch multiplies every grain’s freqScale and leaves the rest of the plan alone; junk is 1', () => {
    const base = planShot(busy, seeded(3));
    const up = planShot(busy, seeded(3), 0, 1.5);
    expect(up.grains.map((g) => g.freqScale)).toEqual(base.grains.map((g) => g.freqScale * 1.5));
    expect(up.grains.map(({ freqScale: _f, ...rest }) => rest)).toEqual(base.grains.map(({ freqScale: _f, ...rest }) => rest));
    expect(up.echoes).toEqual(base.echoes);
    for (const junk of [0, -2, NaN, Infinity]) expect(planShot(busy, seeded(3), 0, junk)).toEqual(base);
  });

  it('lengthS is the latest grain end plus the longest echo', () => {
    const plan = planShot(busy, seeded(8));
    const end = Math.max(...plan.grains.map((g) => g.onsetS + g.lengthS));
    expect(plan.echoTailS).toBe(Math.max(...plan.echoes.map((e) => e.delayS)));
    expect(plan.lengthS).toBeCloseTo(end + plan.echoTailS);
  });
});
