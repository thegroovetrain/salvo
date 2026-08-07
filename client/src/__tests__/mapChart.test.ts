// The charted terrain layer's PURE logic (render/map.ts) — the hypsometric
// contour grammar ratified 2026-08-06: "each contour ring is OUTLINED in its
// solid scale colour and FILLED with a darker, less intense version of that
// same colour", bands drawn in ascending level order.
//
// Everything here is the draw PLAN, never Pixi: `terrainDrawPlan` is the seam
// that exists so band ordering, split-band completeness, colour selection and
// the screen-locked stroke width can be asserted without a canvas.
//
// Every colour and width below is READ FROM CLIENT_CONFIG, never mirrored — a
// mirrored literal is a test that keeps passing against a retuned token.

import { describe, it, expect } from 'vitest';
import { islandFromPolygon, type Island, type Vec2 } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  MAX_BAND_LEVEL,
  bandColors,
  islandBands,
  needsZoomRedraw,
  terrainDrawPlan,
} from '../render/map.js';
import { strokeWorldWidth } from '../util/math.js';

const RAMP = CLIENT_CONFIG.colors.terrain;
const T = CLIENT_CONFIG.terrain;

/** A square island at (cx, cy), half-width `h`. */
function square(cx: number, cy: number, h: number): Island {
  return islandFromPolygon([
    { x: cx - h, y: cy - h },
    { x: cx + h, y: cy - h },
    { x: cx + h, y: cy + h },
    { x: cx - h, y: cy + h },
  ]);
}

/** A square loop as a bare polygon (a contour band's poly). */
function loop(cx: number, cy: number, h: number): Vec2[] {
  return [
    { x: cx - h, y: cy - h },
    { x: cx + h, y: cy - h },
    { x: cx + h, y: cy + h },
    { x: cx - h, y: cy + h },
  ];
}

/** An elongated island whose level-2 band SPLIT into two peaks — the case the
 *  `Contour.polys` list exists for. Bands are handed in DESCENDING order so the
 *  ordering assertions cannot pass by accident of the fixture's own order. */
function twinPeaks(): Island {
  const isle = square(0, 0, 400);
  isle.contours = [
    { level: 2, polys: [loop(-200, 0, 40), loop(200, 0, 40)] },
    { level: 1, polys: [loop(0, 0, 300)] },
  ];
  return isle;
}

describe('the hypsometric ramp (CLIENT_CONFIG.colors.terrain)', () => {
  it('is exactly the four ratified levels, shore -> summit', () => {
    expect(RAMP.length).toBe(4);
    expect(MAX_BAND_LEVEL).toBe(3);
    expect(RAMP.map((b) => b.stroke)).toEqual([0x4a6b33, 0x7b8a3e, 0xae9c58, 0xdcd2ac]);
    expect(RAMP.map((b) => b.fill)).toEqual([0x242f22, 0x363c29, 0x484534, 0x5b5a52]);
  });

  it('every band FILL is darker than its own stroke — the grammar, as arithmetic', () => {
    // "filled with a DARKER, LESS INTENSE version of that same colour": the
    // relationship is per-ROW (fill vs its own stroke), never across rows.
    for (const { stroke, fill } of RAMP) {
      expect(luma(fill)).toBeLessThan(luma(stroke));
    }
  });

  it('the ramp brightens monotonically with elevation (shore darkest, summit lightest)', () => {
    for (let i = 1; i < RAMP.length; i++) {
      expect(luma(RAMP[i].stroke)).toBeGreaterThan(luma(RAMP[i - 1].stroke));
      expect(luma(RAMP[i].fill)).toBeGreaterThan(luma(RAMP[i - 1].fill));
    }
  });
});

describe('bandColors — colour selection per level', () => {
  it('returns the ramp row at that level', () => {
    for (let i = 0; i <= MAX_BAND_LEVEL; i++) expect(bandColors(i)).toEqual(RAMP[i]);
  });

  it('CLAMPS an off-ramp level instead of returning an undefined tint', () => {
    expect(bandColors(-4)).toEqual(RAMP[0]);
    expect(bandColors(99)).toEqual(RAMP[MAX_BAND_LEVEL]);
    expect(bandColors(1.9)).toEqual(RAMP[1]); // floored, never rounded up off the ramp
  });
});

describe('islandBands — the ascending draw list', () => {
  it('a flat rock is ONE band: the coastline itself, at level 0', () => {
    const rock = square(0, 0, 30);
    const bands = islandBands(rock);
    expect(bands).toHaveLength(1);
    expect(bands[0].level).toBe(0);
    // Level 0 IS the sim polygon — the same array, vertex for vertex.
    expect(bands[0].polys).toEqual([rock.poly]);
  });

  it('sorts ASCENDING regardless of the generator emission order', () => {
    expect(islandBands(twinPeaks()).map((b) => b.level)).toEqual([0, 1, 2]);
  });

  it('keeps EVERY polygon of a split band', () => {
    const band = islandBands(twinPeaks()).find((b) => b.level === 2);
    expect(band?.polys).toHaveLength(2);
  });

  it('drops a band with no polygons and a band off the ramp', () => {
    const isle = square(0, 0, 400);
    isle.contours = [
      { level: 1, polys: [] }, // nothing to draw
      { level: 0, polys: [loop(0, 0, 100)] }, // level 0 is the coastline, not a contour
      { level: MAX_BAND_LEVEL + 1, polys: [loop(0, 0, 50)] }, // off the ramp
      { level: 3, polys: [loop(0, 0, 60)] },
    ];
    expect(islandBands(isle).map((b) => b.level)).toEqual([0, 3]);
  });
});

describe('terrainDrawPlan — the ordered op list', () => {
  it('emits every polygon of every band, in ascending level order', () => {
    const ops = terrainDrawPlan([twinPeaks()], 1);
    expect(ops).toHaveLength(4); // coast + one level-1 loop + two level-2 peaks
    expect(ops.map((o) => o.stroke)).toEqual([
      RAMP[0].stroke,
      RAMP[1].stroke,
      RAMP[2].stroke,
      RAMP[2].stroke,
    ]);
    expect(ops.map((o) => o.fill)).toEqual([
      RAMP[0].fill,
      RAMP[1].fill,
      RAMP[2].fill,
      RAMP[2].fill,
    ]);
  });

  it('a higher band is always drawn AFTER the band beneath it (the whole compositing rule)', () => {
    const ops = terrainDrawPlan([twinPeaks()], 1);
    const levelOf = new Map<number, number>(RAMP.map((b, i) => [b.stroke, i]));
    const levels = ops.map((o) => levelOf.get(o.stroke) ?? -1);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
  });

  it('draws each island completely before moving to the next (islands never overlap)', () => {
    const ops = terrainDrawPlan([twinPeaks(), square(2000, 0, 50)], 1);
    expect(ops).toHaveLength(5);
    expect(ops[4].poly[0]).toEqual({ x: 1950, y: -50 });
  });

  it('the level-0 op IS the sim polygon — no smoothing, no inflation', () => {
    const isle = twinPeaks();
    expect(terrainDrawPlan([isle], 1)[0].poly).toEqual(isle.poly);
  });

  it('an empty field draws nothing', () => {
    expect(terrainDrawPlan([], 1)).toEqual([]);
  });
});

describe('screen-locked stroke width', () => {
  it('every op lands on screen at its configured px across the shipped zoom range', () => {
    for (const zoom of [0.5, 0.75, 1, 1.25, 1.5, 3]) {
      const ops = terrainDrawPlan([twinPeaks()], zoom);
      expect(ops[0].width * zoom).toBeCloseTo(T.coastPx, 9); // the coastline
      for (const op of ops.slice(1)) expect(op.width * zoom).toBeCloseTo(T.contourPx, 9);
    }
  });

  it('the contour line is SUBORDINATE to the coastline at every zoom', () => {
    expect(T.contourPx).toBeLessThan(T.coastPx);
    const ops = terrainDrawPlan([twinPeaks()], 0.5);
    for (const op of ops.slice(1)) expect(op.width).toBeLessThan(ops[0].width);
  });

  it('uses the ONE screen-lock helper, not a private copy', () => {
    expect(terrainDrawPlan([square(0, 0, 50)], 0.6)[0].width).toBe(strokeWorldWidth(T.coastPx, 0.6));
  });

  it('a degenerate camera zoom cannot produce a NaN/Infinity width', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      const w = terrainDrawPlan([square(0, 0, 50)], bad)[0].width;
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThan(0);
    }
  });
});

describe('needsZoomRedraw — the static layer stays static', () => {
  it('always draws the first time (the never-drawn sentinel)', () => {
    expect(needsZoomRedraw(-1, 1)).toBe(true);
  });

  it('ignores a zoom nudge under the throttle fraction', () => {
    const z = 1;
    expect(needsZoomRedraw(z, z * (1 + T.redrawZoomFrac * 0.5))).toBe(false);
    expect(needsZoomRedraw(z, z)).toBe(false);
  });

  it('redraws once the zoom has moved by more than the throttle fraction', () => {
    const z = 1;
    expect(needsZoomRedraw(z, z * (1 + T.redrawZoomFrac * 2))).toBe(true);
    expect(needsZoomRedraw(z, z * (1 - T.redrawZoomFrac * 2))).toBe(true);
  });

  it('a NaN zoom holds the last good draw instead of re-tessellating every frame', () => {
    expect(needsZoomRedraw(1, NaN)).toBe(false);
    expect(needsZoomRedraw(1, Infinity)).toBe(false);
  });

  it('the degenerate LATCH (0) is stable, and recovers on the next good zoom', () => {
    // MapChart latches 0 rather than the NaN it was handed — a NaN in the
    // comparison would either redraw forever or wedge the layer permanently.
    expect(needsZoomRedraw(0, NaN)).toBe(false);
    expect(needsZoomRedraw(0, 0)).toBe(false);
    expect(needsZoomRedraw(0, 1)).toBe(true);
  });

  it('a full 0.5x -> 1.5x sweep at the wheel rate costs a bounded number of redraws', () => {
    // The whole point of the throttle: sweeping the shipped user-zoom range in
    // 1% steps must not redraw ~1,100 vertices on every one of them.
    let last = -1;
    let redraws = 0;
    for (let z = 0.5; z <= 1.5001; z *= 1.01) {
      if (needsZoomRedraw(last, z)) {
        last = z;
        redraws++;
      }
    }
    expect(redraws).toBeLessThanOrEqual(60);
    expect(redraws).toBeGreaterThan(1);
  });
});

/** Rec. 601 luma of a 0xRRGGBB token (ordering only — not a contrast metric). */
function luma(hex: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
