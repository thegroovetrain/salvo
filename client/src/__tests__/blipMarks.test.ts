// Story 4.2 (FR14, amendments 7-13) — the PURE blip-mark surface
// (render/blipMarks.ts): the ARPA speed-vector geometry and the algorithmic
// per-hue luminance floor. The Pixi adapter (render/radar.ts) only traces what
// these return, so everything worth pinning about a blip's shape and color is
// pinned here.

import { describe, it, expect } from 'vitest';
import { REGATTA_HUES, hullSilhouette } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { extentAlong, luminanceFloor, relativeLuminance, speedVector } from '../render/blipMarks.js';

const V = CLIENT_CONFIG.blip.vector;
const HUES: readonly number[] = REGATTA_HUES.map((n) => CLIENT_CONFIG.colors.players[n]);
const CVD: readonly number[] = Object.values(CLIENT_CONFIG.colors.cvd);

/** Direction (rad) of an offset from the paint position. */
const bearing = (p: { x: number; y: number }): number => Math.atan2(p.y, p.x);
/** Length of an offset from the paint position. */
const mag = (p: { x: number; y: number }): number => Math.hypot(p.x, p.y);

describe('speedVector — the ARPA mark (amendment 10)', () => {
  it('draws AHEAD along the heading, rooted on the hull outline', () => {
    const v = speedVector(0, 20, 50, V);
    expect(v).not.toBeNull();
    if (v === null) return;
    expect(v.from).toEqual({ x: 50, y: 0 }); // rooted at the outline, not the origin
    expect(v.to.x).toBeGreaterThan(v.from.x);
    expect(v.to.y).toBeCloseTo(0, 12);
    expect(bearing(v.to)).toBeCloseTo(0, 12);
  });

  it('draws ASTERN (−heading) for a REVERSING hull — the signed-speed read', () => {
    const heading = 0.7;
    const ahead = speedVector(heading, 20, 0, V);
    const astern = speedVector(heading, -20, 0, V);
    expect(ahead).not.toBeNull();
    expect(astern).not.toBeNull();
    if (ahead === null || astern === null) return;
    expect(bearing(ahead.to)).toBeCloseTo(heading, 12);
    expect(bearing(astern.to)).toBeCloseTo(heading - Math.PI, 12);
    // Same magnitude either way: only the DIRECTION carries the sign.
    expect(mag(astern.to)).toBeCloseTo(mag(ahead.to), 12);
  });

  it('scales the shaft with speed — the tip is the predicted position', () => {
    const slow = speedVector(0, 10, 0, V);
    const fast = speedVector(0, 30, 0, V);
    if (slow === null || fast === null) throw new Error('both should draw');
    expect(mag(fast.to)).toBeGreaterThan(mag(slow.to));
    expect(mag(fast.to)).toBeCloseTo(30 * V.seconds, 9); // inside the clamp band
  });

  it('clamps at BOTH ends: never vanishing, never overwhelming the hull', () => {
    const crawl = speedVector(0, V.deadSpeed + 0.01, 0, V);
    const absurd = speedVector(0, 10_000, 0, V);
    if (crawl === null || absurd === null) throw new Error('both should draw');
    expect(mag(crawl.to)).toBeCloseTo(V.minLength, 9);
    expect(mag(absurd.to)).toBeCloseTo(V.maxLength, 9);
  });

  it('draws NOTHING for a stopped contact (a decoy buoy reports speed 0)', () => {
    expect(speedVector(1.2, 0, 40, V)).toBeNull();
    expect(speedVector(1.2, V.deadSpeed, 40, V)).toBeNull();
    expect(speedVector(1.2, -V.deadSpeed, 40, V)).toBeNull();
  });

  it('terminates in an arrowhead: two barbs swept back from the tip', () => {
    const v = speedVector(0, 25, 0, V);
    if (v === null) throw new Error('should draw');
    const [a, b] = v.barbs;
    // Both barbs sit one barbLength from the tip...
    expect(Math.hypot(a.x - v.to.x, a.y - v.to.y)).toBeCloseTo(V.barbLength, 9);
    expect(Math.hypot(b.x - v.to.x, b.y - v.to.y)).toBeCloseTo(V.barbLength, 9);
    // ...BEHIND it (back down the shaft), one to each side.
    expect(a.x).toBeLessThan(v.to.x);
    expect(b.x).toBeLessThan(v.to.x);
    expect(Math.sign(a.y)).toBe(-Math.sign(b.y));
  });

  it('rotates rigidly with heading (the mark is heading-aware, not axis-aligned)', () => {
    const h = 2.4;
    const v = speedVector(h, 22, 30, V);
    if (v === null) throw new Error('should draw');
    for (const p of [v.from, v.to]) expect(bearing(p)).toBeCloseTo(h, 12);
  });
});

describe('extentAlong — the vector roots on the hull, never inside it', () => {
  it('returns the bow extent at angle 0 and the stern extent at π', () => {
    for (const cls of ['torpedoBoat', 'battleship', 'mineLayer'] as const) {
      const poly = hullSilhouette(cls);
      const bow = extentAlong(poly, 0);
      const stern = extentAlong(poly, Math.PI);
      expect(bow).toBeGreaterThan(0);
      expect(stern).toBeGreaterThan(0);
      // Both are real hull extents — never larger than the hull's half-length
      // plus a hair (the silhouette is origin-centered on the bow/stern midpoint).
      const maxX = Math.max(...poly.map((p) => Math.abs(p.x)));
      expect(bow).toBeLessThanOrEqual(maxX + 1e-9);
      expect(stern).toBeLessThanOrEqual(maxX + 1e-9);
    }
  });

  it('is the max projection, so no vert of the hull sticks past the root', () => {
    const poly = hullSilhouette('battleship');
    const a = 0.9;
    const e = extentAlong(poly, a);
    for (const p of poly) expect(p.x * Math.cos(a) + p.y * Math.sin(a)).toBeLessThanOrEqual(e + 1e-9);
  });
});

// --- The algorithmic luminance floor (amendment 13) --------------------------

/** HSV hue angle in degrees, or null for an achromatic color. */
function hueDeg(color: number): number | null {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-9) return null;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
}

/** Smallest signed separation between two hue angles, in degrees. */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const TARGET = CLIENT_CONFIG.blip.lumaFloor;

describe('relativeLuminance — the WCAG transfer function', () => {
  it('anchors at black and white', () => {
    expect(relativeLuminance(0x000000)).toBeCloseTo(0, 12);
    expect(relativeLuminance(0xffffff)).toBeCloseTo(1, 12);
  });

  it('weights green far above blue (which is why the blues need lifting)', () => {
    expect(relativeLuminance(0x00ff00)).toBeCloseTo(0.7152, 6);
    expect(relativeLuminance(0x0000ff)).toBeCloseTo(0.0722, 6);
  });
});

describe('luminanceFloor — algorithmic, hue-preserving, no per-hue table', () => {
  it('lifts ALL 20 Regatta hues to the floor', () => {
    expect(HUES).toHaveLength(20);
    for (const hue of HUES) {
      const lifted = luminanceFloor(hue, TARGET);
      expect(relativeLuminance(lifted), hue.toString(16)).toBeGreaterThanOrEqual(TARGET - 1e-6);
    }
  });

  it('lifts ALL 8 colorblind-assist families to the floor', () => {
    expect(CVD).toHaveLength(8);
    for (const hue of CVD) {
      const lifted = luminanceFloor(hue, TARGET);
      expect(relativeLuminance(lifted), hue.toString(16)).toBeGreaterThanOrEqual(TARGET - 1e-6);
    }
  });

  it('PRESERVES the hue of every wheel + assist color it lifts', () => {
    for (const hue of [...HUES, ...CVD]) {
      const before = hueDeg(hue);
      const after = hueDeg(luminanceFloor(hue, TARGET));
      if (before === null || after === null) continue; // no achromatic entries today
      // 2° covers the 8-bit rounding of the lifted channels; nothing here shifts
      // family (adjacent Regatta hues sit ~18° apart).
      expect(hueGap(before, after), hue.toString(16)).toBeLessThan(2);
    }
  });

  it('NEVER darkens: an already-bright hue returns byte-identical', () => {
    for (const hue of [...HUES, ...CVD]) {
      const lifted = luminanceFloor(hue, TARGET);
      expect(relativeLuminance(lifted)).toBeGreaterThanOrEqual(relativeLuminance(hue) - 1e-9);
      if (relativeLuminance(hue) >= TARGET) expect(lifted).toBe(hue);
    }
  });

  it('is idempotent — a floored hue is already at or above the floor', () => {
    for (const hue of [...HUES, ...CVD]) {
      const once = luminanceFloor(hue, TARGET);
      expect(luminanceFloor(once, TARGET)).toBe(once);
    }
  });

  it('reaches even the darkest possible input (black → the target, via white)', () => {
    expect(relativeLuminance(luminanceFloor(0x000000, TARGET))).toBeGreaterThanOrEqual(TARGET - 1e-6);
    expect(luminanceFloor(0x000000, 1)).toBe(0xffffff);
  });

  it('needs the DESATURATION leg for the blues (full value alone falls short)', () => {
    // cobalt at full HSV value is only ~0.19 relative luminance: blue carries
    // 7% of the luminance weight, so the lift MUST be able to wash toward white.
    const cobalt = CLIENT_CONFIG.colors.players.cobalt;
    expect(relativeLuminance(cobalt)).toBeLessThan(TARGET);
    const lifted = luminanceFloor(cobalt, TARGET);
    expect(relativeLuminance(lifted)).toBeGreaterThanOrEqual(TARGET - 1e-6);
    expect(hueGap(hueDeg(cobalt) ?? 0, hueDeg(lifted) ?? 0)).toBeLessThan(2);
  });
});
