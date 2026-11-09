// THE LEVEL BLOCK'S PURE CORE (Story 10.10) — the XP strip's tag, chip label
// and breathing state machine, MOVED to render/console/level.ts with their
// tests (xpStrip.test.ts keeps the originals until W3 deletes the strip). The
// `TAB TO REFIT` cue did not move: it is dead with the band (R3 / R10).

import { describe, it, expect } from 'vitest';
import {
  CHIP_PULSE_HZ,
  XP_CHIP_IDLE,
  chipAlpha,
  chipBreathing,
  chipDimKeyframe,
  chipHeld,
  chipLabel,
  levelTag,
  nextChipState,
  xpFillFraction,
  type XpChipState,
} from '../render/console/level.js';
import { monoTextWidth } from '../util/monoMeasure.js';
import { easeHold } from '../render/zone.js';
import { CLIENT_CONFIG } from '../config.js';

const X = CLIENT_CONFIG.console.chip;
const K = CLIENT_CONFIG.console;

describe('xpFillFraction — the server value verbatim, clamped', () => {
  it('passes a legal fraction through and clamps a malformed one', () => {
    expect(xpFillFraction(0.5)).toBe(0.5);
    expect(xpFillFraction(-0.2)).toBe(0);
    expect(xpFillFraction(1.7)).toBe(1);
    expect(xpFillFraction(NaN)).toBe(0);
    expect(xpFillFraction(Infinity)).toBe(0);
  });
});

describe('the LV tag and the bank chip label', () => {
  it('the tag counts completed levels, floored defensively', () => {
    expect(levelTag(3.9)).toBe(levelTag(3));
    expect(levelTag(-2)).toBe(levelTag(0));
    expect(levelTag(NaN)).toBe(levelTag(0));
    expect(levelTag(12)).toMatch(/(^|\D)12$/);
  });

  it('the chip is hidden at zero, the bare count to 9, one overflow glyph past it', () => {
    expect(chipLabel(0)).toBe('');
    expect(chipLabel(-1)).toBe('');
    expect(chipLabel(4)).toBe('4');
    for (const pts of [10, 99, 1000]) {
      expect(chipLabel(pts).length).toBe(1);
      expect(chipLabel(pts)).not.toMatch(/\d/);
    }
  });

  it('no chip label is wider than the chip it sits in', () => {
    for (const pts of [1, 9, 10, 1000]) expect(monoTextWidth(chipLabel(pts), K.type.bankCount)).toBeLessThanOrEqual(K.ship.bankChip);
  });
});

describe('the chip breath — arm, decay to static, re-arm', () => {
  it('arms on the first bank and breathes under the shared cap', () => {
    const s = nextChipState(XP_CHIP_IDLE, 1, 100);
    expect(s).toEqual({ pts: 1, armedAt: 100 });
    expect(chipBreathing(s, 100)).toBe(true);
    expect(CHIP_PULSE_HZ).toBeLessThanOrEqual(CLIENT_CONFIG.settings.pulseCapHz);
    expect(1 / CHIP_PULSE_HZ).toBeGreaterThanOrEqual(2);
  });

  it('decays to static after the unspent window, information kept', () => {
    const s = nextChipState(XP_CHIP_IDLE, 1, 0);
    expect(chipBreathing(s, X.unspentSec - 0.01)).toBe(true);
    expect(chipBreathing(s, X.unspentSec)).toBe(false);
    expect(chipAlpha(s, 60)).toBe(X.chipAlpha);
  });

  it('re-arms on a new bank or a rearm touch, drops the window at zero, carries otherwise', () => {
    const armed = nextChipState(XP_CHIP_IDLE, 1, 0);
    expect(nextChipState(armed, 2, 30)).toEqual({ pts: 2, armedAt: 30 });
    expect(nextChipState(armed, 1, 40, true).armedAt).toBe(40);
    expect(nextChipState(armed, 0, 5)).toEqual(XP_CHIP_IDLE);
    expect(nextChipState(armed, 1, 3).armedAt).toBe(0);
    expect(nextChipState({ pts: 2, armedAt: null }, 2, 12).armedAt).toBe(12);
  });
});

describe('chipAlpha / the Tier-3 freeze', () => {
  const armed: XpChipState = { pts: 1, armedAt: 0 };
  const quarter = 1 / (4 * CHIP_PULSE_HZ);

  it('starts at the base, breathes symmetrically, halves at reduced, holds at off', () => {
    expect(chipAlpha(armed, 0)).toBeCloseTo(X.chipAlpha, 9);
    expect(chipAlpha(armed, quarter)).toBeCloseTo(X.chipAlpha + X.pulseAmp, 6);
    expect(chipAlpha(armed, 3 * quarter)).toBeCloseTo(X.chipAlpha - X.pulseAmp, 6);
    expect(chipAlpha(armed, quarter, X.pulseAmp / 2)).toBeCloseTo(X.chipAlpha + X.pulseAmp / 2, 6);
    expect(chipAlpha(armed, quarter, 0)).toBe(X.chipAlpha);
  });

  it('freezes toward the DIM keyframe (never gone), eased, and is a no-op at off', () => {
    expect(chipDimKeyframe(armed, 0.4)).toBeCloseTo(X.chipAlpha - X.pulseAmp, 9);
    const breathing = chipAlpha(armed, quarter);
    const one = chipHeld(armed, quarter, X.pulseAmp, easeHold(0, 1, 16));
    expect(one).toBeLessThan(breathing);
    expect(one).toBeGreaterThan(chipDimKeyframe(armed, quarter) + 1e-3);
    expect(chipHeld(armed, 0.4, 0, 1)).toBe(X.chipAlpha);
  });
});
