// Story 2.3 — the accessibility MOTION gate at its callsites. One helper
// (settings/store.ts motionIntensity) scales every flash/pulse/shake amplitude:
// `reduced` halves it, `off` removes the MOTION while the information stays.

import { describe, it, expect } from 'vitest';
import { ShakeDriver, shakeMagnitude } from '../render/shake.js';
import { vignetteAlpha } from '../render/zone.js';
import { effectPeakAlpha, isJuiceEffect } from '../render/effects.js';
import { slotFlags, slotSkin, type HotbarView } from '../render/hotbar.js';
import { motionIntensity } from '../settings/store.js';
import { hullLook } from '../render/ships.js';
import { CLIENT_CONFIG } from '../config.js';
import { CONFIG, effectiveStats, zeroUpgrades } from '@salvo/shared';

/** A deterministic rng so the shake offset is a pure function of magnitude. */
const RNG = (): number => 0;

describe('ShakeDriver — THE single shake gate', () => {
  it('full motion shakes; reduced HALVES the offset; off returns dead zero', () => {
    const at = (level: 'full' | 'reduced' | 'off'): number => {
      const d = new ShakeDriver(RNG, () => motionIntensity(level));
      d.trigger(CONFIG.torpedo.damage);
      return Math.abs(d.update(0).x);
    };
    const full = at('full');
    expect(full).toBeGreaterThan(0);
    expect(at('reduced')).toBeCloseTo(full / 2, 6);
    expect(at('off')).toBe(0);
  });

  it('motion=off leaves the raw decay state intact (a mid-shake change resolves cleanly)', () => {
    const d = new ShakeDriver(RNG, () => 0);
    d.trigger(CONFIG.torpedo.damage);
    expect(d.update(0)).toEqual({ x: 0, y: 0 });
    expect(d.magnitude).toBeCloseTo(shakeMagnitude(CONFIG.torpedo.damage), 6);
  });
});

describe('storm vignette — the PULSE is motion, the hazard is information', () => {
  it('off holds a steady non-zero alpha instead of pulsing', () => {
    const samples = [0, 0.25, 0.5, 0.75].map((t) => vignetteAlpha(true, t, 0));
    expect(new Set(samples).size).toBe(1);
    expect(samples[0]).toBeGreaterThan(0); // still clearly "you are in the storm"
  });

  it('reduced halves the swing around the same base', () => {
    const peakT = 0.25 / 1.1; // a quarter period of the 1.1Hz pulse
    const base = vignetteAlpha(true, 0, 0);
    const full = vignetteAlpha(true, peakT) - base;
    const half = vignetteAlpha(true, peakT, 0.17 / 2) - base;
    expect(half).toBeCloseTo(full / 2, 6);
  });

  it('is still zero when safely inside the circle, at every level', () => {
    expect(vignetteAlpha(false, 1, 0)).toBe(0);
    expect(vignetteAlpha(false, 1)).toBe(0);
  });
});

describe('one-shot effects — juice is gated, markers are not', () => {
  it('classifies muzzle/spark as juice and the location markers as information', () => {
    expect(isJuiceEffect('muzzle')).toBe(true);
    expect(isJuiceEffect('spark')).toBe(true);
    for (const kind of ['splash', 'sink', 'burst', 'torpwake'] as const) {
      expect(isJuiceEffect(kind), kind).toBe(false);
    }
  });

  it('motion=off removes the flashes but never the markers', () => {
    expect(effectPeakAlpha('spark', 1, 0)).toBe(0);
    expect(effectPeakAlpha('muzzle', 0.9, 0.5)).toBeCloseTo(0.45, 9);
    expect(effectPeakAlpha('sink', 0.9, 0)).toBe(0.9); // where a hull went down: kept
    expect(effectPeakAlpha('burst', 0.95, 0)).toBe(0.95);
  });
});

describe('hotbar — the ACTIVATED pop is juice; DENIED never is', () => {
  const stats = effectiveStats(CONFIG.shipClasses.torpedoBoat, zeroUpgrades());

  function view(motion: 'full' | 'reduced' | 'off'): HotbarView {
    return {
      loadout: ['gun', 'torpedo', 'speedBoost', null],
      ammo: [null, null, null, null],
      stats,
      primedSlot: 0,
      denied: [false, false, true, false],
      activated: [false, false, true, false],
      dim: false,
      motion,
    };
  }

  it('suppresses the pop at motion=off and keeps the denial at every level', () => {
    expect(slotFlags(view('full'), 2)).toEqual({ denied: true, activated: true });
    expect(slotFlags(view('reduced'), 2)).toEqual({ denied: true, activated: true });
    expect(slotFlags(view('off'), 2)).toEqual({ denied: true, activated: false });
  });

  it('scales the slot GLOW amplitude, never the state colors', () => {
    const full = slotSkin('selected');
    const off = slotSkin('selected', 0);
    expect(off.glowPx).toBe(0);
    expect(off.glowAlpha).toBe(0);
    expect(off.border).toBe(full.border); // the state channel is untouched
    expect(off.washAlpha).toBe(full.washAlpha);
    const half = slotSkin('selected', 0.5);
    expect(half.glowPx).toBeCloseTo(full.glowPx / 2, 9);
  });

  it('the DENIED skin keeps its red edge even with motion off (never silence)', () => {
    const denied = slotSkin('denied', 0);
    expect(denied.border).toBe(slotSkin('denied').border);
    expect(denied.borderWidth).toBe(slotSkin('denied').borderWidth);
  });
});

// --- REGRESSION (Story 2.3 review gate): reduced halves INTENSITY -------------
// The first cut scaled the hit-flash DURATION, which makes the cue HARDER to
// catch at reduced — the opposite of an accessibility affordance. The spec and
// amendment both say intensity: full length, half strength.

describe('hull hit-flash — reduced halves the STRENGTH, never the duration', () => {
  const SUNK = CLIENT_CONFIG.ship.sunkTint;
  const WHITE = CLIENT_CONFIG.colors.white;

  it('the flash is a blend toward white, and reduced lands exactly halfway', () => {
    const full = hullLook(motionIntensity('full'), true, 1);
    const half = hullLook(motionIntensity('reduced'), true, 1);
    const none = hullLook(motionIntensity('off'), true, 1);

    expect(full.tint).toBe(WHITE);
    expect(full.alpha).toBe(1);
    // off = no flash at all: the plain sunk look.
    expect(none.tint).toBe(SUNK);
    expect(none.alpha).toBeCloseTo(0.4, 9);
    // reduced sits halfway between them on BOTH channels.
    expect(half.alpha).toBeCloseTo((0.4 + 1) / 2, 9);
    for (const shift of [16, 8, 0]) {
      const ch = (c: number): number => (c >> shift) & 0xff;
      expect(ch(half.tint), `channel ${shift}`).toBe(Math.round((ch(SUNK) + ch(WHITE)) / 2));
    }
  });

  it('the DURATION is the same at every level (it is the strength that scales)', () => {
    // The flash window is CLIENT_CONFIG.ship.flashMs verbatim now — no motion
    // multiplier — so the cue is exactly as easy to catch at reduced as at full.
    expect(CLIENT_CONFIG.ship.flashMs).toBeGreaterThan(0);
    expect(motionIntensity('reduced')).toBe(0.5);
    expect(motionIntensity('off')).toBe(0); // and ShipView.flash() bails at 0
  });

  it('the sight FADE still multiplies through, at every flash strength', () => {
    expect(hullLook(1, false, 0.5).alpha).toBeCloseTo(0.5, 9);
    expect(hullLook(0, false, 0.25).alpha).toBeCloseTo(0.25, 9);
  });

  it('clamps a nonsense intensity instead of producing an out-of-range color', () => {
    expect(hullLook(5, true, 1).tint).toBe(WHITE);
    expect(hullLook(-1, true, 1).tint).toBe(SUNK);
  });
});
