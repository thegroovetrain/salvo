// The `return`-grammar HEATMAP math (cycle 52, amendments 76-79) — pure, no
// Pixi, no GPU. render/radar.ts only anchors the grid, uploads the bytes and
// positions one sprite; everything that decides WHAT a pixel is lives here.
//
// WHAT IS CONTRACT HERE, not coverage:
//
//   • EXACTLY THREE COLORS, NEVER A BLEND (amendment 77). Quantization takes an
//     intensity and returns a band INDEX; every consumer reads that band's color
//     verbatim. No input — negative, NaN, Infinity, a value between two
//     thresholds — can produce anything but one of the three tokens or full
//     transparency. This is the ruling's hard edge and the first test below is
//     an exhaustive sweep against it.
//
//   • ONE OBJECT SHOWS ALL THREE AT ONCE. The headline requirement. Color is
//     INTERNAL TEXTURE, not an object label: a strong contact must read red in
//     the core, blue in the surround and green on the fringe, in the same paint,
//     on the same frame. If a single strong return ever collapses to one color,
//     the cycle has regressed to exactly what Eric rejected.
//
//   • A WEAK RETURN NEVER REACHES RED. The other half of that: strength still
//     reads once hue has stopped being a label, because a distant needle simply
//     never gets a red cell.
//
//   • AN ISLAND IS A FILLED MASS FOLLOWING ITS REAL POLYGON (amendment 78 + the
//     fractal-island landing). The regression guard is A/B against a
//     bounding-circle island in the same test: a point the OLD circle-based code
//     painted as coastline is water under the real polygon, and must paint
//     nothing. `Island` is structurally assignable to `Circle`, so the retired
//     returnMarks.ts kept compiling — and kept painting offshore — after fractal
//     islands landed. Nothing here may consult `isle.r` for membership.
//
//   • THE NEAR-FACE PHYSICS IS UNCHANGED (amendment 69, cycle 51's review gate).
//     The far side is the island's own shadow, and an island behind another
//     island paints nothing at all.
//
//   • A PAINT IS A HISTORICAL SNAPSHOT. Its rasterization is byte-stable across
//     its whole decay; only opacity moves.

import { describe, it, expect } from 'vitest';
import { islandFromPolygon, pointInIsland, type Island, type Vec2 } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { blipLifeMs } from '../render/phosphor.js';
import {
  anchorGrid,
  bandIndex,
  buildIslandCoverage,
  cellCentre,
  cellOf,
  islandBearingSpan,
  makeGrid,
  quantizeInto,
  rasterize,
  sampleGrid,
  stampIsland,
  type HeatGrid,
  type HeatmapOpts,
  type IslandPaint,
  type RadarPaint,
  type ShipPaint,
} from '../render/radarHeatmap.js';

const CFG: HeatmapOpts = CLIENT_CONFIG.blip.heatmap;
/** The shipped knobs with the speckle switched off — geometry tests need a
 *  deterministic answer, and `noise: 0` is a documented value of the knob. */
const CLEAN: HeatmapOpts = { ...CFG, noise: 0 };
const BANDS = CFG.bands;
const RADAR = 660; // CONFIG.vision.radar at base stats
const LIFE = blipLifeMs(4000); // 15rpm × persistSweeps

function grid(opts: HeatmapOpts = CLEAN, ownX = 0, ownY = 0): HeatGrid {
  const g = makeGrid(RADAR, opts.cellU);
  anchorGrid(g, ownX, ownY);
  return g;
}

/** How many cells the buffer holds in each band (index) — [green, blue, red]. */
function bandCounts(g: HeatGrid): number[] {
  const out = [0, 0, 0];
  for (let i = 0; i < g.w.length; i++) {
    const b = bandIndex(g.w[i], BANDS);
    if (b >= 0) out[b]++;
  }
  return out;
}

/** The band painted at a world point, or -1 for fully transparent. */
function bandAt(g: HeatGrid, x: number, y: number): number {
  return bandIndex(sampleGrid(g, x, y).w, BANDS);
}

/** A contact paint due +y of an observer at the origin. */
function shipPaint(ext: number, dist: number, t = 0): ShipPaint {
  return { kind: 'ship', id: 'trk-1', x: 0, y: dist, ext, bearing: Math.PI / 2, dist, t, seed: 12345 };
}

function raster(g: HeatGrid, paints: RadarPaint[], opts: HeatmapOpts, now = 0): void {
  rasterize(g, paints, { now, lifeMs: LIFE, alphaFloor: 0, radarRange: RADAR, opts });
}

// --- 1. the hard-quantization contract ---------------------------------------

describe('quantization is EXACTLY three colors or transparent (amendment 77)', () => {
  it('returns a band index or -1 for every input, and never anything between', () => {
    const inputs = [
      Number.NEGATIVE_INFINITY, -1, -1e-9, 0, Number.MIN_VALUE, 0.0001,
      ...Array.from({ length: 2001 }, (_, i) => i / 1000), // 0 → 2 in 0.001 steps
      1e9, Number.POSITIVE_INFINITY, Number.NaN,
    ];
    for (const v of inputs) {
      const b = bandIndex(v, BANDS);
      expect(Number.isInteger(b), `${v}`).toBe(true);
      expect(b, `${v}`).toBeGreaterThanOrEqual(-1);
      expect(b, `${v}`).toBeLessThan(BANDS.length);
    }
  });

  it('non-finite and non-positive intensities paint NOTHING, never a garbage color', () => {
    for (const v of [Number.NaN, Number.NEGATIVE_INFINITY, -5, 0]) {
      expect(bandIndex(v, BANDS), `${v}`).toBe(-1);
    }
  });

  it('the rasterized BYTES are only ever a band token or fully transparent', () => {
    // The end-to-end statement: whatever the geometry does, the pixels that come
    // out are drawn from a set of three. A lerp anywhere in the pipeline puts an
    // off-palette color in this set and fails here.
    const g = grid(CFG); // WITH noise — the speckle must not invent colors either
    raster(g, [shipPaint(124, 200), shipPaint(9, 600)], CFG);
    const out = new Uint8Array(g.cols * g.rows * 4);
    quantizeInto(g, BANDS, out);
    const palette = new Set(BANDS.map((b) => b.color));
    const seen = new Set<number>();
    for (let i = 0; i < g.cols * g.rows; i++) {
      const o = i * 4;
      const rgb = (out[o] << 16) | (out[o + 1] << 8) | out[o + 2];
      if (out[o + 3] === 0) {
        expect(rgb).toBe(0); // transparent pixels carry no smuggled color
        continue;
      }
      seen.add(rgb);
    }
    for (const c of seen) expect(palette.has(c), `0x${c.toString(16)}`).toBe(true);
    expect(seen.size).toBeGreaterThan(1); // and the frame actually painted something
  });
});

// --- 2. one object, all three bands -------------------------------------------

describe('a single strong return spans ALL THREE bands (the headline requirement)', () => {
  it('paints red, blue AND green inside one contact footprint', () => {
    const g = grid();
    raster(g, [shipPaint(124, 200)], CLEAN); // battleship broadside, close aboard
    const counts = bandCounts(g);
    expect(counts[2], 'red core').toBeGreaterThan(0);
    expect(counts[1], 'blue surround').toBeGreaterThan(0);
    expect(counts[0], 'green fringe').toBeGreaterThan(0);
  });

  it('and still does with the shipped speckle on — noise ragged-edges the bands, '
    + 'it does not erase them', () => {
    const g = grid(CFG);
    raster(g, [shipPaint(124, 200)], CFG);
    for (const c of bandCounts(g)) expect(c).toBeGreaterThan(0);
  });

  it('the bands are ORDERED outward: red at the core, green on the fringe', () => {
    // Color is internal texture, so the ordering is what makes it read as one
    // object rather than three. Sampled along the echo's range axis.
    const g = grid();
    raster(g, [shipPaint(124, 200)], CLEAN);
    expect(bandAt(g, 0, 200)).toBe(2); // core
    let outermost = 2;
    for (let d = 0; d <= 70; d += CLEAN.cellU) {
      const b = bandAt(g, d, 200);
      if (b < 0) break;
      expect(b).toBeLessThanOrEqual(outermost); // never brightens on the way out
      outermost = b;
    }
    expect(outermost).toBe(0); // and it ends on green before it ends
  });
});

describe('a weak or distant return never reaches the strongest band', () => {
  it('a bow-on needle at the rim paints green only', () => {
    const g = grid();
    raster(g, [shipPaint(9, 640)], CLEAN); // torpedo boat bow-on, near max range
    const counts = bandCounts(g);
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBe(0);
    expect(counts[2]).toBe(0);
  });

  it('but it is never INVISIBLE — the weakest legitimate echo still paints', () => {
    // `minPeak` above `bands[0].at` with noise headroom: a contact you cannot
    // see at all is not a weak return, it is a missing one.
    const g = grid(CFG);
    raster(g, [shipPaint(0, 660)], CFG);
    expect(bandCounts(g)[0]).toBeGreaterThan(0);
  });

  it('the same hull reads STRONGER close than far — strength still carries', () => {
    const near = grid();
    raster(near, [shipPaint(60, 100)], CLEAN);
    const far = grid();
    raster(far, [shipPaint(60, 640)], CLEAN);
    expect(bandCounts(near)[2]).toBeGreaterThan(bandCounts(far)[2]);
  });
});

// --- 3. islands: a filled mass on the REAL polygon -----------------------------

const HALF_W = 200;
const HALF_H = 150;

/** A rectangular ridge at the origin: bounding circle r = 250, so ~46% of that
 *  disc is open water — which is exactly the gap the old bounding-circle code
 *  painted coastline into. */
function ridgeIsland(): Island {
  return islandFromPolygon([
    { x: -HALF_W, y: -HALF_H },
    { x: HALF_W, y: -HALF_H },
    { x: HALF_W, y: HALF_H },
    { x: -HALF_W, y: HALF_H },
  ]);
}

/** The SAME island as the retired code effectively saw it: its bounding circle,
 *  as a polygon. The A/B control for the fractal-island regression guard. */
function circleIsland(r: number): Island {
  const poly: Vec2[] = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
  return islandFromPolygon(poly);
}

function islandPaint(isle: Island, field: readonly Island[], obs: Vec2, opts: HeatmapOpts): IslandPaint {
  return {
    kind: 'island',
    isle,
    from: 0,
    to: 0,
    full: true, // the beam has swept the whole span
    t: 0,
    cover: buildIslandCoverage(isle, field, obs, RADAR, 999, opts),
  };
}

describe('an island rasterizes as a contiguous filled mass (amendment 78)', () => {
  const OBS = { x: 0, y: -400 };

  it('fills its observer-facing interior — this is a MASS, not sampled points', () => {
    const isle = ridgeIsland();
    const g = grid(CLEAN, OBS.x, OBS.y);
    stampIsland(g, islandPaint(isle, [isle], OBS, CLEAN), 1);
    let inside = 0;
    let lit = 0;
    // A broad band of the near face, well clear of the terminator (where the
    // island legitimately shadows its own flanks): every land cell must paint.
    for (let y = -HALF_H + CLEAN.cellU; y < -95; y += CLEAN.cellU) {
      for (let x = -150; x <= 150; x += CLEAN.cellU) {
        if (!pointInIsland({ x, y }, isle)) continue;
        inside++;
        if (bandAt(g, x, y) >= 0) lit++;
      }
    }
    expect(inside).toBeGreaterThan(300); // the sample is a real area, not 3 cells
    expect(lit / inside).toBe(1);
    // And the mass as a whole is a MASS: thousands of cells, not a rim of dots.
    // The old grammar's ceiling was 14 samples per island, by construction.
    expect(bandCounts(g).reduce((a, b) => a + b, 0)).toBeGreaterThan(1000);
  });

  it('a big landmass shows all three bands too — solid core, softer edges', () => {
    const isle = ridgeIsland();
    const g = grid(CLEAN, OBS.x, OBS.y);
    stampIsland(g, islandPaint(isle, [isle], OBS, CLEAN), 1);
    const counts = bandCounts(g);
    expect(counts[2], 'red interior').toBeGreaterThan(0);
    expect(counts[1], 'blue shoulder').toBeGreaterThan(0);
    expect(counts[0], 'green water line').toBeGreaterThan(0);
    // The interior is the strong part, the coastline the weak part.
    expect(bandAt(g, 0, -60)).toBe(2);
    expect(bandAt(g, 0, -HALF_H + CLEAN.cellU)).toBeLessThan(2);
  });

  it('REGRESSION GUARD: a point inside the bounding CIRCLE but outside the '
    + 'POLYGON paints nothing — and the old circle behavior painted it', () => {
    const isle = ridgeIsland();
    const water = { x: 0, y: -200 }; // 200u from centre, r = 250: inside the circle
    // The premise the guard rests on: the bounding circle calls this land.
    expect(Math.hypot(water.x, water.y)).toBeLessThan(isle.r);
    expect(pointInIsland(water, isle)).toBe(false);

    const real = grid(CLEAN, OBS.x, OBS.y);
    stampIsland(real, islandPaint(isle, [isle], OBS, CLEAN), 1);
    expect(bandAt(real, water.x, water.y), 'polygon: open water').toBe(-1);

    // A/B against the island as the retired bounding-circle code saw it. This
    // half is what makes the guard a REGRESSION guard rather than an assertion
    // that happens to pass: swap the polygon back for the circle and the same
    // point lights up.
    const circle = circleIsland(isle.r);
    const old = grid(CLEAN, OBS.x, OBS.y);
    stampIsland(old, islandPaint(circle, [circle], OBS, CLEAN), 1);
    expect(bandAt(old, water.x, water.y), 'bounding circle: painted land').toBeGreaterThanOrEqual(0);
  });

  it('nothing paints on the FAR side — the island is its own shadow', () => {
    const isle = ridgeIsland();
    const obs = { x: 0, y: -500 };
    const g = grid(CLEAN, obs.x, obs.y);
    stampIsland(g, islandPaint(isle, [isle], obs, CLEAN), 1);
    const far = { x: 0, y: 140 };
    expect(pointInIsland(far, isle), 'the far point IS land').toBe(true);
    expect(Math.hypot(far.x - obs.x, far.y - obs.y), 'and it is in range').toBeLessThan(RADAR);
    expect(bandAt(g, far.x, far.y)).toBe(-1);
    expect(bandAt(g, 0, -140), 'while the near face does paint').toBeGreaterThanOrEqual(0);
  });

  it('nothing paints BEHIND an occluding island (cycle 51 review gate, kept)', () => {
    const far = ridgeIsland();
    const near = islandFromPolygon([
      { x: -60, y: -360 },
      { x: 60, y: -360 },
      { x: 60, y: -240 },
      { x: -60, y: -240 },
    ]);
    const obs = { x: 0, y: -600 };
    const probe = { x: 0, y: -140 }; // dead astern of the near island

    const alone = grid(CLEAN, obs.x, obs.y);
    stampIsland(alone, islandPaint(far, [far], obs, CLEAN), 1);
    expect(bandAt(alone, probe.x, probe.y), 'unoccluded control').toBeGreaterThanOrEqual(0);

    const shadowed = grid(CLEAN, obs.x, obs.y);
    stampIsland(shadowed, islandPaint(far, [far, near], obs, CLEAN), 1);
    expect(bandAt(shadowed, probe.x, probe.y)).toBe(-1);
    // ...and the shadow is a corridor, not a blanket: the far island's flanks,
    // which the near island does not cover, still paint.
    expect(bandAt(shadowed, -180, -140)).toBeGreaterThanOrEqual(0);
  });

  it('only the arc the beam has swept paints — a landmass fills in behind the beam', () => {
    const isle = ridgeIsland();
    const obs = { x: 0, y: -400 };
    const cover = buildIslandCoverage(isle, [isle], obs, RADAR, 999, CLEAN);
    // The island lies due +y of the observer, so its cells bear ~0.9-2.24 rad.
    const partial: IslandPaint = { kind: 'island', isle, from: 1.4, to: 1.5, full: false, t: 0, cover };
    const g = grid(CLEAN, obs.x, obs.y);
    stampIsland(g, partial, 1);
    const swept = bandCounts(g).reduce((a, b) => a + b, 0);
    const full = grid(CLEAN, obs.x, obs.y);
    stampIsland(full, { ...partial, full: true }, 1);
    const all = bandCounts(full).reduce((a, b) => a + b, 0);
    expect(swept).toBeGreaterThan(0);
    expect(swept).toBeLessThan(all);
  });
});

describe('island bearing span — the fractal-island cove correction', () => {
  it('an observer inside the bounding circle but AFLOAT still gets a span', () => {
    // The retired code rejected the whole island on `dist <= r`, so a captain in
    // a cove (or in the gap of a bent ridge) saw no coastline at all.
    const isle = ridgeIsland();
    const cove = { x: 0, y: -200 }; // inside the bounding circle, on the water
    expect(pointInIsland(cove, isle)).toBe(false);
    const span = islandBearingSpan(isle, cove, RADAR);
    expect(span).not.toBeNull();
    expect(span?.half).toBeCloseTo(Math.PI, 5); // it surrounds the observer
  });

  it('an observer AGROUND gets none, and neither does an island out of range', () => {
    const isle = ridgeIsland();
    expect(islandBearingSpan(isle, { x: 0, y: 0 }, RADAR)).toBeNull();
    expect(islandBearingSpan(isle, { x: 0, y: -4000 }, RADAR)).toBeNull();
  });
});

// --- 4. persistence -------------------------------------------------------------

describe('a paint rasterizes identically across its whole decay', () => {
  it('same cells, same bands — only the opacity moves', () => {
    const isle = ridgeIsland();
    const obs = { x: 0, y: -400 };
    const paints: RadarPaint[] = [shipPaint(124, 300), islandPaint(isle, [isle], obs, CFG)];

    const fresh = grid(CFG, obs.x, obs.y);
    raster(fresh, paints, CFG, 0);
    const old = grid(CFG, obs.x, obs.y);
    raster(old, paints, CFG, LIFE * 0.75);

    let compared = 0;
    for (let i = 0; i < fresh.w.length; i++) {
      expect(bandIndex(old.w[i], BANDS), `cell ${i}`).toBe(bandIndex(fresh.w[i], BANDS));
      if (fresh.a[i] > 0) {
        expect(old.a[i]).toBeLessThan(fresh.a[i]);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(100);
  });

  it('a dead paint contributes nothing at all', () => {
    const g = grid();
    raster(g, [shipPaint(124, 200)], CLEAN, LIFE + 1);
    expect(bandCounts(g)).toEqual([0, 0, 0]);
  });
});

// --- 5. the world-anchored lattice (ruling R2) -----------------------------------

describe('the buffer is WORLD-anchored, so paints do not shimmer with the camera', () => {
  it('a static paint keeps the SAME world cells as the observer moves', () => {
    const paint = shipPaint(124, 300);
    const lit = (ownX: number, ownY: number): string[] => {
      const g = grid(CLEAN, ownX, ownY);
      raster(g, [paint], CLEAN);
      const out: string[] = [];
      for (let cy = 0; cy < g.rows; cy++) {
        for (let cx = 0; cx < g.cols; cx++) {
          if (bandIndex(g.w[cy * g.cols + cx], BANDS) >= 0) {
            out.push(`${cx + g.baseGx},${cy + g.baseGy}`);
          }
        }
      }
      return out.sort();
    };
    // A drift of a third of a cell must not move a single cell of the paint.
    expect(lit(2, 0)).toEqual(lit(0, 0));
    // Nor must a drift of many whole cells (the origin re-snaps under it).
    expect(lit(97, -53)).toEqual(lit(0, 0));
  });

  it('the origin is snapped to a whole cell, always', () => {
    for (const v of [0, 3, -3, 1234.5678, -987.65]) {
      const g = grid(CLEAN, v, v);
      expect(g.originX / CLEAN.cellU).toBe(Math.round(g.originX / CLEAN.cellU));
      expect(g.originX).toBe(cellCentre(g.baseGx, CLEAN.cellU) - CLEAN.cellU / 2);
      expect(cellOf(g.originX, CLEAN.cellU)).toBe(g.baseGx);
    }
  });

  it('covers 2 × radar range around the ship', () => {
    const g = grid();
    expect(g.cols * CLEAN.cellU).toBeGreaterThanOrEqual(2 * RADAR);
    expect(sampleGrid(g, 0, RADAR - CLEAN.cellU).w).toBe(0); // in-bounds, just unlit
    expect(sampleGrid(g, 0, RADAR * 4).w).toBe(0); // out of bounds, no throw
  });
});
