// THE RADAR DISPLAY'S PURE RULES (Story 11.2, render/rangeRings.ts): the ring
// spacing follows zoom in round hectometers, the ring set stops inside the
// radar reach and at the screen, and the compass scale sits on the reach ring
// when that ring fits, else at the screen edge about the own ship. Contracts
// only — never a pinned ring size (standing rule: test the generating function).

import { describe, expect, it } from 'vitest';
import { CONFIG, hmToU, mapRadius, uToHm } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  BEZEL_INSET_PX,
  BEZEL_MIN_PX,
  RING_SERIES_HM,
  RINGS_TARGET,
  bearingToAngle,
  compassPlacement,
  compassTicks,
  farCornerU,
  ringCount,
  ringSpacingHm,
  viewRingSpacingHm,
} from '../render/rangeRings.js';

const Z = CLIENT_CONFIG.zoom;

describe('ringSpacingHm — spacing follows zoom in round hectometers', () => {
  it('is always a member of the series, for any input', () => {
    for (const h of [0.1, 3, 17, 58, 222, 409, 5000, Number.NaN, -1, 0]) {
      expect(RING_SERIES_HM, `${h}`).toContain(ringSpacingHm(h));
    }
  });

  it('keeps the on-screen ring count within two of the target across the whole zoom range, at common aspects', () => {
    for (const [w, h] of [[1920, 1080], [1280, 800], [2560, 1080], [800, 1200]] as const) {
      // The alive framings: close → default → the whole-board fit.
      for (let span = Z.closeSpanU; span <= 2 * mapRadius(CONFIG.map.playerCap) * 1.2; span *= 1.05) {
        const zoom = Math.min(w, h) / span;
        const step = viewRingSpacingHm(w, h, zoom);
        const halfLongHm = uToHm(Math.max(w, h) / 2 / zoom);
        const count = Math.floor(halfLongHm / step);
        expect(Math.abs(count - RINGS_TARGET), `${w}x${h} span ${span.toFixed(0)}`).toBeLessThanOrEqual(2);
      }
    }
  });

});

describe('ringCount — inside the radar reach, and only rings that reach the screen', () => {
  it('every drawn ring lies strictly inside the reach (the reach is its own ring)', () => {
    for (const step of RING_SERIES_HM) {
      const n = ringCount(step, CONFIG.vision.radar, Infinity);
      expect(n * hmToU(step), `${step}`).toBeLessThan(CONFIG.vision.radar);
      expect((n + 1) * hmToU(step), `${step}`).toBeGreaterThanOrEqual(CONFIG.vision.radar - 1e-6);
    }
  });

  it('stops at the first ring past the farthest screen corner', () => {
    const step = 10;
    const far = hmToU(35);
    const n = ringCount(step, CONFIG.vision.radar, far);
    expect(n * hmToU(step)).toBeGreaterThanOrEqual(far);
    expect((n - 1) * hmToU(step)).toBeLessThan(far);
  });

  it('degenerate inputs draw nothing', () => {
    expect(ringCount(0, CONFIG.vision.radar, 1000)).toBe(0);
    expect(ringCount(10, Number.NaN, 1000)).toBe(0);
    expect(ringCount(10, -5, 1000)).toBe(0);
  });

  it('farCornerU is the farthest screen corner from the ship, in u', () => {
    expect(farCornerU(0, 0, 300, 400, 2)).toBeCloseTo(250, 9);
    expect(farCornerU(150, 200, 300, 400, 1)).toBeCloseTo(250, 9);
  });
});

describe('compassPlacement — on the reach ring when it fits, else the bezel', () => {
  it('sits ON the radar-reach ring when the whole ring is on screen about the ship', () => {
    const p = compassPlacement(500, 400, 1000, 800, 300);
    expect(p).toEqual({ mode: 'ring', radiusPx: 300 });
  });

  it('otherwise a bezel about the ship, inset inside the NEAREST screen edge', () => {
    for (const [sx, sy] of [[500, 400], [300, 400], [500, 650], [900, 100]] as const) {
      const p = compassPlacement(sx, sy, 1000, 800, 5000);
      const edge = Math.min(sx, 1000 - sx, sy, 800 - sy);
      expect(p.mode).toBe('bezel');
      expect(p.radiusPx, `${sx},${sy}`).toBeLessThanOrEqual(Math.max(BEZEL_MIN_PX, edge - BEZEL_INSET_PX));
      expect(p.radiusPx).toBeGreaterThanOrEqual(BEZEL_MIN_PX);
    }
  });

  it('the bezel radius moves in steps, so a drifting hull does not rebuild it every pixel', () => {
    const a = compassPlacement(500, 400, 1000, 800, 5000).radiusPx;
    const b = compassPlacement(501, 400, 1000, 800, 5000).radiusPx;
    expect(a).toBe(b);
  });
});

describe('compassTicks — every 5°, long every 10°, a numeral every 30°', () => {
  it('72 ticks round from north; 36 long; 12 numerals on the 30s', () => {
    const t = compassTicks();
    expect(t).toHaveLength(72);
    expect(t.filter((k) => k.long)).toHaveLength(36);
    const labelled = t.filter((k) => k.label !== null);
    expect(labelled.map((k) => k.deg)).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
    for (const k of labelled) expect(Number(k.label)).toBe(k.deg);
  });

  it('bearing north is straight UP the screen, east to the right', () => {
    expect(Math.sin(bearingToAngle(0))).toBeCloseTo(-1, 12);
    expect(Math.cos(bearingToAngle(Math.PI / 2))).toBeCloseTo(1, 12);
  });
});
