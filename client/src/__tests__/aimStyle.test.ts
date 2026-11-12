// Story 11.1 (R15 / R18) — the AIM COLOR and AIM SIZE settings and what they
// reach: the stored values are validated on read (garbage falls back to the
// defaults), AIM SIZE scales the reticle's geometry linearly and never the
// main-battery oval, and AIM COLOR reaches both the reticle and the oval.

import { describe, expect, it } from 'vitest';
import { CONFIG, DEFAULT_CLASS_ID, effectiveStats, initialTurrets } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  DEFAULT_SETTINGS,
  aimColorTint,
  coerceAimColor,
  coerceAimSize,
  sanitizeSettings,
} from '../settings/store.js';
import { reticleGeometry, reticleTint } from '../render/firing.js';
import { computeAimPreview, previewTint, type AimPreviewInput } from '../render/aimPreview.js';

const R = CLIENT_CONFIG.reticle;

describe('AIM COLOR / AIM SIZE — validated on read', () => {
  it('garbage falls back to the defaults, field by field', () => {
    for (const bad of [null, undefined, 42, 'red', '#ffb80', '#gggggg', 'ffb800', '#ffb8000', {}]) {
      expect(coerceAimColor(bad), String(bad)).toBe(DEFAULT_SETTINGS.aimColor);
    }
    for (const bad of [null, undefined, 'big', Number.NaN, Infinity, -Infinity, {}]) {
      expect(coerceAimSize(bad), String(bad)).toBe(DEFAULT_SETTINGS.aimSize);
    }
    const s = sanitizeSettings({ aimColor: 'teal', aimSize: 'huge', motion: 'reduced' });
    expect(s.aimColor).toBe(DEFAULT_SETTINGS.aimColor);
    expect(s.aimSize).toBe(DEFAULT_SETTINGS.aimSize);
    expect(s.motion).toBe('reduced'); // the neighbours survive
  });

  it('a valid hex is kept (lower-cased); a size is clamped to the range and snapped to the step', () => {
    expect(coerceAimColor('#33CCFF')).toBe('#33ccff');
    expect(coerceAimSize(R.sizeMax + 10)).toBe(R.sizeMax);
    expect(coerceAimSize(R.sizeMin - 10)).toBe(R.sizeMin);
    expect(coerceAimSize(R.sizeMin + R.sizeStep * 1.2)).toBe(R.sizeMin + R.sizeStep);
    const s = sanitizeSettings({ aimColor: '#00ff00', aimSize: R.sizeMin + R.sizeStep });
    expect(s.aimColor).toBe('#00ff00');
    expect(s.aimSize).toBe(R.sizeMin + R.sizeStep);
  });

  it('the color reaches the renderer as a tint; garbage reads the default', () => {
    expect(aimColorTint('#00ff00')).toBe(0x00ff00);
    expect(aimColorTint('#123abc')).toBe(0x123abc);
    expect(aimColorTint('nope')).toBe(aimColorTint(DEFAULT_SETTINGS.aimColor));
  });
});

describe('AIM SIZE scales the reticle linearly', () => {
  it('ring radius, cross reach and both stroke widths are proportional to the size', () => {
    const one = reticleGeometry(1);
    for (const k of [1, 1.5, 2, 3.5, 5]) {
      const g = reticleGeometry(k);
      expect(g.radius).toBeCloseTo(one.radius * k, 12);
      expect(g.crossReach).toBeCloseTo(one.crossReach * k, 12);
      expect(g.ringWidth).toBeCloseTo(one.ringWidth * k, 12);
      expect(g.crossWidth).toBeCloseTo(one.crossWidth * k, 12);
    }
    expect(one.crossReach).toBeGreaterThan(one.radius); // the cross reaches past the ring
  });
});

describe('the oval never reads AIM SIZE; AIM COLOR reaches reticle and oval', () => {
  const stats = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID], []);
  const inp: AimPreviewInput = {
    id: 'mainBattery',
    ship: { x: 0, y: 0, heading: 0, cls: DEFAULT_CLASS_ID },
    aim: 0.2,
    aimDist: stats.equipment.mainBattery.rangeU / 2,
    stats,
    mapRadius: 5000,
    islands: [],
    legal: true,
    turrets: initialTurrets(DEFAULT_CLASS_ID),
  };

  it('the oval is a pure function of the shot — AIM SIZE is not one of its inputs', () => {
    // The preview input has no size field: the same shot gives the same oval
    // however the reticle is sized.
    const before = computeAimPreview(inp).oval;
    expect(before).toBeDefined();
    expect(Object.keys(inp)).not.toContain('aimSize');
    expect(computeAimPreview({ ...inp }).oval).toEqual(before);
  });

  it('one AIM COLOR tints the armed reticle and the main-battery oval alike', () => {
    for (const tint of [0x00ff00, 0x3355ff, aimColorTint(DEFAULT_SETTINGS.aimColor)]) {
      expect(reticleTint('mainBattery', true, tint)).toBe(tint);
      expect(previewTint('mainBattery', tint)).toBe(tint);
    }
  });

  it('an unarmed reticle drops to the muted tint; the torpedo family keeps its own identity', () => {
    expect(reticleTint('mainBattery', false, 0x00ff00)).not.toBe(0x00ff00);
    expect(reticleTint('heavyTorpedo', true, 0x00ff00)).toBe(previewTint('heavyTorpedo', 0x00ff00));
    expect(reticleTint('heavyTorpedo', true, 0x00ff00)).not.toBe(0x00ff00);
  });
});
