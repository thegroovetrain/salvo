// THE HP GLOBE (render/hpGlobe.ts, Story 8.6) — the HUD bar's left-hand bowl of
// water.
//
// Most of this suite MOVED here verbatim from hud.test.ts when the 6px vertical
// HP rail became a 104px globe: the bands, the header value, the accelerating
// pulse and its 1.1 Hz ceiling, the integrated phase, the redraw signature,
// the paid pool's incoming band, the amber-corollary inputs and the eased hold
// are all the SAME behaviour under the same names, and these pins are what
// prove the move did not change any of it.
//
// What is NEW is the SHAPE: the waterline's height in the bowl, the circular
// segment below it, and the pending-heal band (epic-8 amendment 35) between the
// live waterline and where the still-draining pool will leave it.

import { describe, it, expect, afterEach } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, effectiveStats } from '@salvo/shared';
import {
  HpGlobe,
  advancePulsePhase,
  circleBandBetween,
  globeWaterY,
  hpColor,
  hpGlobeHoldsLit,
  hullFillAlpha,
  hullFillHeld,
  hullHeaderValue,
  hullMaxLabel,
  hullPulseHz,
  hullShownValue,
  railAmberChannel,
  railCritical,
  railFraction,
  railPulsing,
  railSig,
  repairFraction,
  type HpGlobeInput,
} from '../render/hpGlobe.js';
import { circleSegmentBelow } from '../render/globe.js';
import { hudBarLayout, type Circle } from '../render/hudBar.js';
import { tier1Active } from '../render/attention.js';
import { easeHold, vignetteAlpha } from '../render/zone.js';
import { motionScaled, settings } from '../settings/store.js';
import { CLIENT_CONFIG } from '../config.js';

const V = CLIENT_CONFIG.vitals;
const CAP_HZ = CLIENT_CONFIG.settings.pulseCapHz;
const GREEN = CLIENT_CONFIG.colors.phosphor;
const AMBER = CLIENT_CONFIG.colors.amber;
const MARKER = CLIENT_CONFIG.colors.damageMarker;

/** The globe the shipped bar actually lays out (r 52, epic-8 amendment 32). */
const GLOBE: Circle = hudBarLayout(1366, 768).hpGlobe;

describe('hpColor thresholds (Story 2.4 bands: 50% / 25%, damageMarker)', () => {
  it('is phosphor at/above 50%, amber at/above 25%, damageMarker below', () => {
    expect(hpColor(1)).toBe(GREEN);
    expect(hpColor(0.8)).toBe(GREEN); // I/O matrix: healthy 80/100
    expect(hpColor(0.49)).toBe(AMBER); // I/O matrix: wounded 49/100
    expect(hpColor(0.26)).toBe(AMBER);
    expect(hpColor(0.24)).toBe(MARKER); // I/O matrix: critical 24/100
    expect(hpColor(0)).toBe(MARKER); // I/O matrix: sunk
  });

  it('treats 0.5 and 0.25 as EXCLUSIVE lower bounds for the better color', () => {
    expect(hpColor(0.5)).toBe(GREEN); // exactly half hull still reads healthy
    expect(hpColor(0.25)).toBe(AMBER); // exactly a quarter still reads amber
    expect(hpColor(0.5 - 1e-9)).toBe(AMBER);
    expect(hpColor(0.25 - 1e-9)).toBe(MARKER);
  });

  it('never returns the retired crimson `damage` token', () => {
    const bands = [0, 0.1, 0.24, 0.25, 0.49, 0.5, 1].map(hpColor);
    expect(bands).not.toContain(CLIENT_CONFIG.colors.damage);
  });

  // The RAMP RING (ruling 6): the globe's second, outer hairline carries the
  // same band colour, so the hull's state reads at a glance without the number.
  it('the ramp reads the I/O matrix rows at 60 / 40 / 20 percent', () => {
    expect(hpColor(0.6)).toBe(GREEN);
    expect(hpColor(0.4)).toBe(AMBER);
    expect(hpColor(0.2)).toBe(MARKER);
  });
});

describe('the hull readout — `HULL 212 /250`', () => {
  it('renders whole hull points and floors at zero', () => {
    expect(hullHeaderValue(80, 100)).toBe('80/100');
    expect(hullHeaderValue(72.4, 100)).toBe('72/100');
    expect(hullHeaderValue(0, 100)).toBe('0/100');
    expect(hullHeaderValue(-5, 100)).toBe('0/100'); // an overkill hit never reads negative
  });

  it('FLOORS rather than rounds, so the number agrees with the globe band', () => {
    // 49.6 hp is an AMBER globe (the band uses the exact fraction) — rounding it
    // to "50" would put a healthy-looking number beside a wounded bowl.
    expect(hullHeaderValue(49.6, 100)).toBe('49/100');
    expect(hullHeaderValue(50, 100)).toBe('50/100'); // exactly half still reads 50 (phosphor)
    expect(hullHeaderValue(24.9, 100)).toBe('24/100');
  });

  it('never reads 0 on a LIVE hull (storm damage leaves fractions)', () => {
    expect(hullHeaderValue(0.4, 100)).toBe('1/100');
    expect(hullHeaderValue(0.001, 100)).toBe('1/100');
    expect(hullHeaderValue(1, 100)).toBe('1/100');
    // ...and only a genuinely sunk hull reads zero.
    expect(hullHeaderValue(0, 100)).toBe('0/100');
    expect(hullHeaderValue(-0.2, 100)).toBe('0/100');
  });

  // The globe splits the one string across two type registers (18px value,
  // 10px max) — the SPLIT must be exactly the string, never a second rounding.
  it('splits into the two registers without re-deriving either half', () => {
    expect(`${hullShownValue(212)}${hullMaxLabel(250)}`).toBe(hullHeaderValue(212, 250));
    expect(hullShownValue(212)).toBe(212);
    expect(hullMaxLabel(250)).toBe('/250');
    expect(hullMaxLabel(249.6)).toBe('/250'); // the max ROUNDS, as it always did
  });
});

describe('globeWaterY — the waterline`s height in the bowl', () => {
  const R = 52;

  it('is the floor at 0%, the middle at 50% and the crown at 100%', () => {
    // Pixi y grows DOWNWARD, so a fuller hull has a SMALLER waterline y.
    expect(globeWaterY(R, 0)).toBe(R);
    expect(globeWaterY(R, 0.5)).toBe(0);
    expect(globeWaterY(R, 1)).toBe(-R);
  });

  it('is linear in the fraction and clamps beyond either end', () => {
    expect(globeWaterY(R, 0.25)).toBeCloseTo(R / 2, 9);
    expect(globeWaterY(R, 0.848)).toBeCloseTo(R - 2 * R * 0.848, 9); // I/O matrix: 212/250
    expect(globeWaterY(R, 2)).toBe(-R);
    expect(globeWaterY(R, -1)).toBe(R);
  });

  it('drives the segment polygon: empty at 0, the whole disc at 1', () => {
    expect(circleSegmentBelow(R, globeWaterY(R, 0))).toHaveLength(0);
    expect(circleSegmentBelow(R, globeWaterY(R, 1)).length).toBeGreaterThan(2);
    // At half hull every vertex sits at or below the centre line, and the
    // polygon reaches the bowl's floor.
    const half = circleSegmentBelow(R, globeWaterY(R, 0.5));
    expect(half.every((p) => p.y >= -1e-9)).toBe(true);
    expect(Math.max(...half.map((p) => p.y))).toBeCloseTo(R, 6);
  });
});

describe('circleBandBetween — the PENDING-HEAL band (amendment 35)', () => {
  const R = 52;

  it('spans exactly the two waterlines, live below and pending above', () => {
    const live = globeWaterY(R, 0.16); // I/O matrix: hp 40 of 250
    const pending = globeWaterY(R, 0.16 + 0.1); // + a 25-point pool
    const band = circleBandBetween(R, pending, live);
    expect(band.length).toBeGreaterThan(2);
    const ys = band.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(pending, 9);
    expect(Math.max(...ys)).toBeCloseTo(live, 9);
    // ...and it never leaves the disc.
    expect(band.every((p) => Math.hypot(p.x, p.y) <= R + 1e-6)).toBe(true);
  });

  it('is EMPTY when the pool cannot land — the clamp at maxHp is free', () => {
    // repairFraction already clips the pool at the crown, so a full hull puts
    // both waterlines on the same line and the band degenerates to nothing.
    const frac = 1;
    const pending = repairFraction(100, 25, 100);
    expect(pending).toBe(0);
    expect(circleBandBetween(R, globeWaterY(R, frac + pending), globeWaterY(R, frac))).toHaveLength(0);
    // A nearly-full hull shows only the part that WILL land, never a band
    // hanging off the top of the bowl.
    const nearly = railFraction(90, 100);
    const landing = repairFraction(90, 25, 100);
    const band = circleBandBetween(R, globeWaterY(R, nearly + landing), globeWaterY(R, nearly));
    expect(Math.min(...band.map((p) => p.y))).toBeGreaterThanOrEqual(-R);
    expect(nearly + landing).toBeLessThanOrEqual(1);
  });

  it('is empty on an inverted or degenerate band, never inside-out', () => {
    expect(circleBandBetween(R, 10, 10)).toHaveLength(0);
    expect(circleBandBetween(R, 10, -10)).toHaveLength(0); // pending below live
    expect(circleBandBetween(0, -1, 1)).toHaveLength(0);
  });
});

describe('hullPulseHz — the accelerating, hard-capped pulse', () => {
  it('starts at ~0.5 Hz where the pulse begins (50% hull)', () => {
    expect(hullPulseHz(V.amberBelow)).toBeCloseTo(V.pulseMinHz, 9);
    expect(hullPulseHz(0.49)).toBeGreaterThan(V.pulseMinHz);
    expect(hullPulseHz(0.49)).toBeLessThan(0.6);
  });

  it('accelerates monotonically as the hull burns down', () => {
    const rates = [0.5, 0.4, 0.3, 0.24, 0.15, 0.1].map(hullPulseHz);
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    expect(hullPulseHz(0.24)).toBeGreaterThan(V.pulseMinHz);
    expect(hullPulseHz(0.24)).toBeLessThan(CAP_HZ);
  });

  it('hits the 1.1 Hz photosensitivity ceiling at 10% and NEVER exceeds it', () => {
    expect(hullPulseHz(V.pulseFloorFrac)).toBeCloseTo(CAP_HZ, 9);
    expect(hullPulseHz(0.05)).toBeCloseTo(CAP_HZ, 9);
    expect(hullPulseHz(0.01)).toBeCloseTo(CAP_HZ, 9);
    expect(hullPulseHz(0)).toBeCloseTo(CAP_HZ, 9);
    expect(hullPulseHz(-1)).toBeCloseTo(CAP_HZ, 9); // clamped, not extrapolated
  });

  it('shares ONE ceiling with the storm vignette (no second 1.1 literal)', () => {
    for (const frac of [0, 0.05, 0.1, 0.2, 0.35, 0.5, 1]) {
      expect(hullPulseHz(frac)).toBeLessThanOrEqual(CAP_HZ);
    }
    const Z = CLIENT_CONFIG.zone;
    expect(vignetteAlpha(true, 0.25 / CAP_HZ)).toBeCloseTo(Z.vignetteBase + Z.vignetteAmp, 6);
  });

  it('is the BREATHING gate, and no longer the Tier-1 gate (amendment 239)', () => {
    expect(railPulsing(V.amberBelow)).toBe(false);
    expect(railPulsing(V.amberBelow - 1e-9)).toBe(true);
    expect(railPulsing(0.3)).toBe(true);
    expect(tier1Active({ hpFrac: 0.3, deniedLive: false })).toBe(false);
    expect(tier1Active({ hpFrac: 0.9, deniedLive: false })).toBe(false);
  });

  it('railCritical IS the Tier-1 gate (amendment 239) — one threshold, not two', () => {
    expect(railCritical(V.criticalBelow)).toBe(false);
    expect(hpColor(V.criticalBelow)).toBe(AMBER);
    expect(railCritical(V.criticalBelow - 1e-9)).toBe(true);
    for (const frac of [0.24, 0.1, 0]) {
      expect(tier1Active({ hpFrac: frac, deniedLive: false })).toBe(railCritical(frac));
      expect(tier1Active({ hpFrac: frac, deniedLive: false })).toBe(true);
      expect(railPulsing(frac)).toBe(true); // the tier is a SUBSET of the pulse band
    }
  });
});

describe('hullFillAlpha — opacity breathing, only below 50%', () => {
  const AMP = V.pulseAmp;
  const PEAK = Math.PI / 2;
  const TROUGH = (3 * Math.PI) / 2;

  it('holds the steady base alpha at/above 50% hull (healthy never breathes)', () => {
    const samples = [0, PEAK, Math.PI, TROUGH].map((p) => hullFillAlpha(0.8, p));
    expect(new Set(samples).size).toBe(1);
    expect(samples[0]).toBe(V.railFillAlpha);
    expect(hullFillAlpha(0.5, PEAK)).toBe(V.railFillAlpha);
  });

  it('breathes around the base below 50%, never to nothing', () => {
    const peak = hullFillAlpha(0.2, PEAK);
    const trough = hullFillAlpha(0.2, TROUGH);
    expect(peak).toBeCloseTo(V.railFillAlpha + AMP, 6);
    expect(trough).toBeCloseTo(V.railFillAlpha - AMP, 6);
    expect(trough).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('is motion-gated in the vignette shape: off holds the base, reduced halves the swing', () => {
    const off = [0, PEAK, Math.PI, TROUGH].map((p) => hullFillAlpha(0.2, p, motionScaled(AMP, 'off')));
    expect(new Set(off).size).toBe(1);
    expect(off[0]).toBe(V.railFillAlpha);
    const full = hullFillAlpha(0.2, PEAK, motionScaled(AMP, 'full')) - V.railFillAlpha;
    const half = hullFillAlpha(0.2, PEAK, motionScaled(AMP, 'reduced')) - V.railFillAlpha;
    expect(half).toBeCloseTo(full / 2, 9);
  });
});

// The phase is INTEGRATED, never derived from absolute time: `sin(t · hz)` only
// looks right while hz is constant, and hz changes with every point of hull.
describe('pulse phase integration — the globe can never strobe on a changing hull', () => {
  it('advances at the fraction`s rate and wraps into [0, 2π)', () => {
    const hz = hullPulseHz(0.2);
    expect(advancePulsePhase(0, 0.2, 0.4)).toBeCloseTo(hz * 0.4 * Math.PI * 2, 9);
    expect(advancePulsePhase(0, 0.2, 0)).toBe(0);
    for (let p = 0, i = 0; i < 200; i++) {
      p = advancePulsePhase(p, 0.05, 0.5);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(Math.PI * 2);
    }
  });

  it('holds at zero above the band, so the first breath starts from the steady globe', () => {
    expect(advancePulsePhase(3, 0.8, 0.05)).toBe(0);
    expect(advancePulsePhase(3, V.amberBelow, 0.05)).toBe(0);
    const first = advancePulsePhase(0, V.amberBelow - 0.001, 0.05);
    expect(hullFillAlpha(V.amberBelow - 0.001, 0)).toBe(V.railFillAlpha);
    expect(first).toBeGreaterThan(0);
  });

  it('clamps a hitching / backgrounded frame (and a negative clock step)', () => {
    expect(advancePulsePhase(0, 0.05, 30)).toBe(advancePulsePhase(0, 0.05, 0.5));
    expect(advancePulsePhase(1, 0.05, -5)).toBe(1);
  });

  it('keeps the per-frame alpha step under the 1.1 Hz ceiling while the hull DRAINS at minute ten', () => {
    const DT = 0.05;
    const AMP = V.pulseAmp;
    const MAX_STEP = AMP * CAP_HZ * Math.PI * 2 * DT + 1e-9;
    let phase = 0;
    let frac = 0.45;
    let prev = hullFillAlpha(frac, phase, AMP);
    for (let i = 0; i < 200 && frac > 0; i++) {
      frac = Math.max(0, frac - 0.002);
      phase = advancePulsePhase(phase, frac, DT);
      const alpha = hullFillAlpha(frac, phase, AMP);
      expect(Math.abs(alpha - prev), `frame ${i} at frac ${frac.toFixed(3)}`).toBeLessThanOrEqual(MAX_STEP);
      prev = alpha;
    }
  });
});

describe('railSig — the globe geometry redraw guard', () => {
  it('forces a redraw across the band/gate transition that the quantized fraction hides', () => {
    expect((0.5).toFixed(3)).toBe((0.4996).toFixed(3));
    expect(railSig(0.4996)).not.toBe(railSig(0.5));
    expect((0.25).toFixed(3)).toBe((0.2496).toFixed(3));
    expect(railSig(0.2496)).not.toBe(railSig(0.25));
  });

  it('still skips the redraw while the hull is steady', () => {
    expect(railSig(0.8)).toBe(railSig(0.8));
    expect(railSig(0.8)).toBe(railSig(0.80004));
  });

  it('carries the incoming band, so a draining pool alone redraws the globe', () => {
    expect(railSig(0.8, 0.14)).not.toBe(railSig(0.8, 0.13));
    expect(railSig(0.8, 0)).toBe(railSig(0.8));
  });
});

describe('repairFraction — the incoming band`s size', () => {
  it('is the pool as a fraction of the bowl while there is room for it', () => {
    expect(repairFraction(50, 25, 100)).toBeCloseTo(0.25);
    expect(repairFraction(0, 25, 100)).toBeCloseTo(0.25);
  });

  it('CLIPS at the crown — a pool draining into a nearly-full hull', () => {
    expect(repairFraction(90, 25, 100)).toBeCloseTo(0.1);
    expect(repairFraction(100, 25, 100)).toBe(0);
  });

  it('is zero with no pool, no hull points, and never negative', () => {
    expect(repairFraction(50, 0, 100)).toBe(0);
    expect(repairFraction(50, -5, 100)).toBe(0);
    expect(repairFraction(50, 25, 0)).toBe(0);
    expect(repairFraction(-5, 25, 100)).toBeCloseTo(0.25);
  });

  it('never exceeds the empty part of the bowl (fill + incoming ≤ the whole globe)', () => {
    for (const hp of [0, 1, 33, 74, 99.6, 100]) {
      for (const pool of [0, 5, 25, 500]) {
        expect(railFraction(hp, 100) + repairFraction(hp, pool, 100)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('railAmberChannel / railFraction — the corollary`s HP input', () => {
  it('is the band BETWEEN the two shipped gates, never a third threshold', () => {
    for (const frac of [0.49, 0.4, 0.3, V.criticalBelow]) {
      expect(railAmberChannel(frac)).toBe(railPulsing(frac) && !railCritical(frac));
      expect(railAmberChannel(frac)).toBe(true);
    }
  });

  it('a CRIMSON globe is NOT an amber channel — it is the threat tier', () => {
    for (const frac of [0.24, 0.1, 0]) {
      expect(railCritical(frac)).toBe(true);
      expect(railAmberChannel(frac)).toBe(false);
      expect(tier1Active({ hpFrac: frac, deniedLive: false })).toBe(true);
    }
    expect(railAmberChannel(V.amberBelow)).toBe(false);
    expect(railAmberChannel(1)).toBe(false);
  });

  it('clamps, and reads a missing denominator as 0 (NULL is the CALLER`s job)', () => {
    expect(railFraction(50, 100)).toBe(0.5);
    expect(railFraction(140, 100)).toBe(1);
    expect(railFraction(-3, 100)).toBe(0);
    expect(railFraction(50, 0)).toBe(0);
  });

  it('hpGlobeHoldsLit resolves the corollary for this channel in ONE place', () => {
    expect(hpGlobeHoldsLit(0.4, true)).toBe(true); // amber, and the ring outranks it
    expect(hpGlobeHoldsLit(0.4, false)).toBe(false); // amber and unchallenged: it breathes
    expect(hpGlobeHoldsLit(0.2, true)).toBe(false); // crimson: not in the amber set at all
    expect(hpGlobeHoldsLit(0.9, true)).toBe(false); // healthy: nothing to hold
  });
});

describe('hullFillHeld — the eased hold at the lit keyframe', () => {
  const AMP = V.pulseAmp;
  const LIT = V.railFillAlpha + AMP;

  it('a full hold is the LIT keyframe at every phase — never dimmer than breathing', () => {
    for (const phase of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 5.1]) {
      expect(hullFillHeld(0.4, phase, AMP, 1)).toBeCloseTo(LIT, 9);
      expect(hullFillHeld(0.4, phase, AMP, 1)).toBeGreaterThanOrEqual(hullFillAlpha(0.4, phase, AMP) - 1e-9);
    }
  });

  it('EASES rather than snaps — a partial blend is a real intermediate value', () => {
    const trough = (3 * Math.PI) / 2;
    const breathing = hullFillAlpha(0.4, trough, AMP);
    const oneFrame = hullFillHeld(0.4, trough, AMP, easeHold(0, 1, 16));
    expect(oneFrame).toBeGreaterThan(breathing);
    expect(oneFrame).toBeLessThan(LIT - 1e-3);
    let hold = 0;
    for (let i = 0; i < 120; i++) hold = easeHold(hold, 1, 16);
    expect(hullFillHeld(0.4, trough, AMP, hold)).toBeCloseTo(LIT, 3);
  });

  it('is a NO-OP above the band and at motion=off — it can never ADD motion', () => {
    expect(hullFillHeld(0.9, 1.2, AMP, 1)).toBe(V.railFillAlpha);
    expect(hullFillHeld(0.4, 1.2, 0, 1)).toBe(V.railFillAlpha);
  });
});

// --- the Pixi shell ------------------------------------------------------------

describe('HpGlobe shell — a healthy frame, a healing frame and a sunk one', () => {
  const stats = effectiveStats(CONFIG.shipClasses.torpedoBoat);
  const MAX = stats.maxHp;

  function input(over: Partial<HpGlobeInput> = {}): HpGlobeInput {
    return { hp: MAX * 0.8, maxHp: MAX, repairHp: 0, alive: true, sinking: false, ...over };
  }

  afterEach(() => settings.reset());

  it('draws every band, a pending band and an empty bowl without throwing', () => {
    const globe = new HpGlobe(new Container());
    for (const frac of [1, 0.6, 0.4, 0.2, 0]) {
      expect(() => globe.update(input({ hp: MAX * frac }), GLOBE, 1, false, 1)).not.toThrow();
    }
    expect(() =>
      globe.update(input({ hp: MAX * 0.16, repairHp: MAX * 0.1 }), GLOBE, 2, false, 1),
    ).not.toThrow();
    expect(() => globe.update(input({ hp: MAX, repairHp: MAX }), GLOBE, 3, false, 1)).not.toThrow();
  });

  it('reads out `HULL n /max` and tracks the hull down', () => {
    const globe = new HpGlobe(new Container());
    globe.update(input({ hp: 212, maxHp: 250 }), GLOBE, 1, false, 1);
    expect(globe.readoutText()).toBe('HULL 212 /250');
    globe.update(input({ hp: 0.4, maxHp: 250 }), GLOBE, 2, false, 1);
    expect(globe.readoutText()).toBe('HULL 1 /250'); // a live hull never reads 0
    globe.update(input({ hp: 0, maxHp: 250, alive: false }), GLOBE, 3, false, 1);
    expect(globe.readoutText()).toBe('HULL 0 /250');
  });

  // THE strobe regression, driven through the real instrument: a hull draining
  // in the storm at minute ten, one 50ms frame at a time.
  it('never jumps the water alpha while the hull drains ten minutes into a match', () => {
    const globe = new HpGlobe(new Container());
    const MAX_STEP = V.pulseAmp * CAP_HZ * Math.PI * 2 * 0.05 + 1e-9;
    let hp = MAX * 0.45;
    let now = 600;
    globe.update(input({ hp }), GLOBE, now, false, 1);
    let prev = globe.fillAlpha;
    for (let i = 0; i < 200 && hp > 0; i++) {
      hp = Math.max(0, hp - MAX * 0.002);
      now += 0.05;
      globe.update(input({ hp }), GLOBE, now, false, 1);
      expect(Math.abs(globe.fillAlpha - prev), `frame ${i}`).toBeLessThanOrEqual(MAX_STEP);
      prev = globe.fillAlpha;
    }
  });

  it('breathes an amber hull, and EASES to its lit keyframe when the ring outranks it', () => {
    const free = new HpGlobe(new Container());
    const held = new HpGlobe(new Container());
    const LIT = V.railFillAlpha + V.pulseAmp;
    const alphas: number[] = [];
    let t = 0;
    for (let i = 0; i < 90; i++) {
      t += 0.016;
      free.update(input({ hp: MAX * 0.4 }), GLOBE, t, false, 1);
      held.update(input({ hp: MAX * 0.4 }), GLOBE, t, false, 1);
      alphas.push(free.fillAlpha);
    }
    expect(new Set(alphas.map((a) => a.toFixed(4))).size).toBeGreaterThan(10); // it moves
    expect(Math.min(...alphas)).toBeLessThan(V.railFillAlpha);
    // One frame of hold is strictly between the breath and the keyframe.
    held.update(input({ hp: MAX * 0.4 }), GLOBE, (t += 0.016), true, 1);
    free.update(input({ hp: MAX * 0.4 }), GLOBE, t, false, 1);
    expect(held.fillAlpha).toBeGreaterThan(free.fillAlpha);
    expect(held.fillAlpha).toBeLessThan(LIT - 0.01);
    for (let i = 0; i < 200; i++) held.update(input({ hp: MAX * 0.4 }), GLOBE, (t += 0.016), true, 1);
    expect(held.fillAlpha).toBeCloseTo(LIT, 2);
  });

  it('hides and re-shows as one object', () => {
    const layer = new Container();
    const globe = new HpGlobe(layer);
    globe.update(input(), GLOBE, 1, false, 1);
    expect(layer.children[0].visible).toBe(true);
    globe.hide();
    expect(layer.children[0].visible).toBe(false);
    globe.update(input(), GLOBE, 2, false, 1);
    expect(layer.children[0].visible).toBe(true);
  });
});
