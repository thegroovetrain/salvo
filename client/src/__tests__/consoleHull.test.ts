// THE HULL GAUGE'S PURE CORE (Story 10.10) — the HP globe's gates and breath,
// MOVED to render/console/hull.ts with their tests (hpGlobe.test.ts keeps the
// originals until W3 deletes the globe), plus the bar's segment math.

import { describe, it, expect } from 'vitest';
import { CONFIG, DEFAULT_CLASS_ID, effectiveStats } from '@salvo/shared';
import {
  advancePulsePhase,
  hullAmberChannel,
  hullBand,
  hullColor,
  hullCritical,
  hullFillAlpha,
  hullFillHeld,
  hullFraction,
  hullHoldsLit,
  hullPercent,
  hullPulseHz,
  hullPulsing,
  hullSegments,
  hullSig,
  repairFraction,
} from '../render/console/hull.js';
import { tier1Active } from '../render/attention.js';
import { easeHold } from '../render/zone.js';
import { motionScaled } from '../settings/store.js';
import { CLIENT_CONFIG } from '../config.js';

const H = CLIENT_CONFIG.console.hull;
const CAP_HZ = CLIENT_CONFIG.settings.pulseCapHz;
const GREEN = CLIENT_CONFIG.colors.phosphor;
const AMBER = CLIENT_CONFIG.colors.amber;
const MARKER = CLIENT_CONFIG.colors.damageMarker;

describe('the hull bands (shared damageBands, one set of numbers)', () => {
  it('references CONFIG.damageBands, never a second set of thresholds', () => {
    expect(H.amberBelow).toBe(CONFIG.damageBands.amberBelow);
    expect(H.criticalBelow).toBe(CONFIG.damageBands.criticalBelow);
  });

  it('phosphor at/above the amber line, amber at/above the critical line, the marker below — exclusive lower bounds', () => {
    expect(hullColor(1)).toBe(GREEN);
    expect(hullColor(H.amberBelow)).toBe(GREEN);
    expect(hullColor(H.amberBelow - 1e-9)).toBe(AMBER);
    expect(hullColor(H.criticalBelow)).toBe(AMBER);
    expect(hullColor(H.criticalBelow - 1e-9)).toBe(MARKER);
    expect(hullColor(0)).toBe(MARKER);
    expect(hullBand(H.criticalBelow - 1e-9)).toBe('critical');
  });
});

describe('hullPercent — re-exported, the ceiling percent', () => {
  const MAX = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID]).maxHp;
  it('is the ceiling of 100 × hp / maxHp and never 0 while afloat', () => {
    for (let hp = 1; hp <= MAX; hp += 37) expect(hullPercent(hp, MAX)).toBe(Math.ceil((100 * hp) / MAX));
    expect(hullPercent(0.001, MAX)).toBe(1);
    expect(hullPercent(0, MAX)).toBe(0);
  });
});

describe('the gates — breathing, the Tier-1 threat, the amber corollary', () => {
  it('breathes below the amber line only', () => {
    expect(hullPulsing(H.amberBelow)).toBe(false);
    expect(hullPulsing(H.amberBelow - 1e-9)).toBe(true);
  });

  it('hullCritical IS the Tier-1 gate attention composes (amendment 239)', () => {
    expect(hullCritical(H.criticalBelow)).toBe(false);
    for (const frac of [0.24, 0.1, 0, 0.3, 0.9]) {
      expect(tier1Active({ hpFrac: frac, deniedLive: false })).toBe(hullCritical(frac));
    }
  });

  it('the amber channel is the band BETWEEN the two gates; a critical hull is not in it', () => {
    for (const frac of [0.49, 0.3, H.criticalBelow]) expect(hullAmberChannel(frac)).toBe(true);
    for (const frac of [0.24, 0, H.amberBelow, 1]) expect(hullAmberChannel(frac)).toBe(false);
  });

  it('holds lit only as an amber channel that lost the ranking', () => {
    expect(hullHoldsLit(0.4, false)).toBe(true);
    expect(hullHoldsLit(0.4, true)).toBe(false);
    expect(hullHoldsLit(0.2, false)).toBe(false);
    expect(hullHoldsLit(0.9, false)).toBe(false);
  });
});

describe('the breath — accelerating, hard-capped, integrated', () => {
  it('ramps from pulseMinHz at the amber line to the shared cap at the floor, never above it', () => {
    expect(hullPulseHz(H.amberBelow)).toBeCloseTo(H.pulseMinHz, 9);
    expect(hullPulseHz(H.pulseFloorFrac)).toBeCloseTo(CAP_HZ, 9);
    for (const f of [-1, 0, 0.05, 0.2, 0.4, 1]) expect(hullPulseHz(f)).toBeLessThanOrEqual(CAP_HZ + 1e-12);
    const rates = [0.5, 0.4, 0.3, 0.2, 0.1].map(hullPulseHz);
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1]);
  });

  it('advances at the fraction`s rate, wraps, holds at zero above the band and clamps a hitch', () => {
    expect(advancePulsePhase(0, 0.2, 0.4)).toBeCloseTo(hullPulseHz(0.2) * 0.4 * Math.PI * 2, 9);
    expect(advancePulsePhase(3, 0.8, 0.05)).toBe(0);
    expect(advancePulsePhase(0, 0.05, 30)).toBe(advancePulsePhase(0, 0.05, 0.5));
    expect(advancePulsePhase(1, 0.05, -5)).toBe(1);
  });

  it('keeps the per-frame alpha step under the cap while the hull drains', () => {
    const DT = 0.05;
    const MAX_STEP = H.pulseAmp * CAP_HZ * Math.PI * 2 * DT + 1e-9;
    let phase = 0;
    let frac = 0.45;
    let prev = hullFillAlpha(frac, phase);
    for (let i = 0; i < 200 && frac > 0; i++) {
      frac = Math.max(0, frac - 0.002);
      phase = advancePulsePhase(phase, frac, DT);
      const a = hullFillAlpha(frac, phase);
      expect(Math.abs(a - prev)).toBeLessThanOrEqual(MAX_STEP);
      prev = a;
    }
  });

  it('holds the base at/above the band and at motion=off; reduced halves the swing', () => {
    expect(hullFillAlpha(0.8, Math.PI / 2)).toBe(H.fillAlpha);
    expect(hullFillAlpha(0.2, Math.PI / 2, motionScaled(H.pulseAmp, 'off'))).toBe(H.fillAlpha);
    const full = hullFillAlpha(0.2, Math.PI / 2, motionScaled(H.pulseAmp, 'full')) - H.fillAlpha;
    const half = hullFillAlpha(0.2, Math.PI / 2, motionScaled(H.pulseAmp, 'reduced')) - H.fillAlpha;
    expect(half).toBeCloseTo(full / 2, 9);
  });

  it('a held gauge eases to the LIT keyframe and is never dimmer than breathing', () => {
    const LIT = H.fillAlpha + H.pulseAmp;
    const trough = (3 * Math.PI) / 2;
    expect(hullFillHeld(0.4, trough, H.pulseAmp, 1)).toBeCloseTo(LIT, 9);
    const one = hullFillHeld(0.4, trough, H.pulseAmp, easeHold(0, 1, 16));
    expect(one).toBeGreaterThan(hullFillAlpha(0.4, trough));
    expect(one).toBeLessThan(LIT - 1e-3);
    expect(hullFillHeld(0.9, 1.2, H.pulseAmp, 1)).toBe(H.fillAlpha);
  });
});

describe('the bar — fraction, pooled repair, segments', () => {
  it('clamps the fraction; a missing denominator reads 0', () => {
    expect(hullFraction(140, 100)).toBe(1);
    expect(hullFraction(-3, 100)).toBe(0);
    expect(hullFraction(50, 0)).toBe(0);
  });

  it('clips the pool at a full hull — fill + pool never exceeds the hull', () => {
    expect(repairFraction(90, 25, 100)).toBeCloseTo(0.1, 9);
    expect(repairFraction(100, 25, 100)).toBe(0);
    for (const hp of [0, 33, 99.6, 100]) for (const pool of [0, 5, 500]) {
      expect(hullFraction(hp, 100) + repairFraction(hp, pool, 100)).toBeLessThanOrEqual(1);
    }
  });

  it('the segments sum back to the fraction and the pool, each segment within itself', () => {
    for (const [frac, pending] of [[0, 0], [0.72, 0], [0.72, 0.15], [0.05, 0.9], [1, 0]]) {
      const segs = hullSegments(frac, pending);
      expect(segs).toHaveLength(CLIENT_CONFIG.console.ship.segments);
      const n = segs.length;
      expect(segs.reduce((a, s) => a + s.fill, 0) / n).toBeCloseTo(frac, 9);
      expect(segs.reduce((a, s) => a + s.pending, 0) / n).toBeCloseTo(Math.min(1, frac + pending) - frac, 9);
      for (const s of segs) expect(s.fill + s.pending).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('fills left to right: no segment is lit past an unlit one', () => {
    const segs = hullSegments(0.43, 0.2);
    for (let i = 1; i < segs.length; i++) expect(segs[i].fill + segs[i].pending).toBeLessThanOrEqual(segs[i - 1].fill + segs[i - 1].pending + 1e-12);
  });

  it('the redraw signature catches a band change the quantized fraction hides', () => {
    expect(hullSig(0.4996)).not.toBe(hullSig(0.5));
    expect(hullSig(0.8)).toBe(hullSig(0.80004));
    expect(hullSig(0.8, 0.14)).not.toBe(hullSig(0.8, 0.13));
  });
});
