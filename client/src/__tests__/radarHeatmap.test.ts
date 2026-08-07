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
//   • A PAINT IS A HISTORICAL RECORD (cycle 55, amendment 83 — the governing
//     invariant, and UNAFFECTED by cycle 56). Its rasterization is byte-stable
//     across its whole decay and against every later position of the observer;
//     only opacity moves. The grid carries no observer for anything to read,
//     which is the structural half of that guarantee (section 7).
//
//   • THE SCOPE PAINTS EVERYTHING IN RADAR RANGE (cycle 56, amendments 88-90).
//     The sight exclusion is retired: a coastline or a hull inside truesight
//     paints exactly like one outside it. Section 6 is the reversal, each case
//     A/B'd against a local re-implementation of the retired verdict.
//
//   • A SIGHTED SHIP'S ECHO IS SYNTHESIZED FROM ITS `Contact` (amendment 89),
//     because the server deliberately sends no blip for a hull it is already
//     sending as a contact. Section 8 pins the sweep gate, the range complement
//     that keeps the two sources from double-painting, the shared cap key and
//     the identical footprint.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  hullSilhouette,
  islandFromPolygon,
  perpendicularExtent,
  pointInIsland,
  transformPolygon,
  type HeightRaster,
  type Island,
  type Vec2,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { blipLifeMs } from '../render/phosphor.js';
import {
  anchorGrid,
  bandIndex,
  buildIslandCoverage,
  cellCentre,
  cellOf,
  contactEcho,
  islandBearingSpan,
  makeGrid,
  quantizeInto,
  rasterize,
  sampleGrid,
  solidity,
  stampIsland,
  stampShip,
  type CoverCell,
  type HeatGrid,
  type HeatmapOpts,
  type IslandPaint,
  type RadarPaint,
  type ShipPaint,
} from '../render/radarHeatmap.js';
import {
  buildStormBand,
  clutterIntensity,
  openClutter,
  rasterizeWeather,
  weatherCycled,
  type StormPaint,
} from '../render/radarSources.js';

const CFG: HeatmapOpts = CLIENT_CONFIG.blip.heatmap;
/** The shipped knobs with the speckle switched off — geometry tests need a
 *  deterministic answer, and `noise: 0` is a documented value of the knob. */
const CLEAN: HeatmapOpts = { ...CFG, noise: 0 };
const BANDS = CFG.bands;
const RADAR = 660; // CONFIG.vision.radar at base stats
const LIFE = blipLifeMs(4000); // 15rpm × persistSweeps

function grid(opts: HeatmapOpts = CLEAN, ownX = 0, ownY = 0): HeatGrid {
  const g = makeGrid(RADAR, RADAR, opts.cellU);
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

/**
 * Every LIT cell in the buffer, as its world centre plus its distance from
 * `obs`.
 *
 * This is the seam the PER-CELL sight gate has to be asserted through. A
 * point-probe pair ("this point is dark, that one is lit") could pass against an
 * object-level exclusion that happened to keep the right object; partitioning
 * EVERY lit cell of one rasterization by its distance cannot. The observer is an
 * explicit argument because the GRID NO LONGER CARRIES ONE (amendment 85) — the
 * observer a verdict was taken from belongs to the PAINT, and the tests below
 * have to be able to name one that differs from where the buffer is centred.
 */
function litCells(g: HeatGrid, obs: Vec2 = { x: 0, y: 0 }): { x: number; y: number; d: number }[] {
  const out: { x: number; y: number; d: number }[] = [];
  for (let cy = 0; cy < g.rows; cy++) {
    for (let cx = 0; cx < g.cols; cx++) {
      if (bandIndex(g.w[cy * g.cols + cx], BANDS) < 0) continue;
      const x = cellCentre(g.baseGx + cx, g.cellU);
      const y = cellCentre(g.baseGy + cy, g.cellU);
      out.push({ x, y, d: Math.hypot(x - obs.x, y - obs.y) });
    }
  }
  return out;
}

/** How many lit cells fall strictly inside / outside a suppression radius
 *  measured from `obs`. */
function split(g: HeatGrid, holeU: number, obs: Vec2 = { x: 0, y: 0 }): {
  inside: number;
  outside: number;
} {
  const lit = litCells(g, obs);
  return {
    inside: lit.filter((c) => c.d <= holeU).length,
    outside: lit.filter((c) => c.d > holeU).length,
  };
}

/** A contact paint due +y of an observer at the origin. */
function shipPaint(ext: number, dist: number, t = 0): ShipPaint {
  return {
    kind: 'ship',
    id: 'trk-1',
    x: 0,
    y: dist,
    ext,
    bearing: Math.PI / 2,
    dist,
    t,
    seed: 12345,
  };
}

/**
 * CYCLE 55's SIGHT VERDICT, RE-IMPLEMENTED HERE AND ONLY HERE.
 *
 * The retired behavior: a cell inside the observer's truesight when the beam
 * swept it never entered the coverage list at all (amendments 80-85). The
 * production filter is gone, so the A/B halves below rebuild it independently —
 * which is what makes "the island inside truesight paints now" a REVERSAL guard
 * rather than an assertion that happens to pass. Feed it the same observer the
 * coverage was baked from.
 */
function cycle55Cover(cover: readonly CoverCell[], obs: Vec2, holeU: number): CoverCell[] {
  return cover.filter((c) => {
    const dx = cellCentre(c.gx, CLEAN.cellU) - obs.x;
    const dy = cellCentre(c.gy, CLEAN.cellU) - obs.y;
    return dx * dx + dy * dy > holeU * holeU;
  });
}

function raster(g: HeatGrid, paints: RadarPaint[], opts: HeatmapOpts, now = 0): void {
  const ctx = { now, lifeMs: LIFE, alphaFloor: 0, opts };
  rasterize(g, paints, ctx);
  rasterizeWeather(g, paints, ctx); // the second pass render/radar.ts makes
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

/** A long ridge running AWAY from an observer at the origin, sized so its lit
 *  near face crosses base truesight (330u): land from y = 200 to y = 560, so
 *  part of the face is inside the bubble and part of it beyond. The straddle
 *  fixture for the sight gate (section 6). */
function straddleRidge(): Island {
  return islandFromPolygon([
    { x: -90, y: 200 },
    { x: 90, y: 200 },
    { x: 90, y: 560 },
    { x: -90, y: 560 },
  ]);
}

/** An island paint whose beam has swept the whole span, baked from `obs`. */
function islandPaint(
  isle: Island,
  field: readonly Island[],
  obs: Vec2,
  opts: HeatmapOpts,
): IslandPaint {
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

// --- 6. THE SCOPE PAINTS EVERYTHING IN RANGE (cycle 56, amendments 88-90) -------
//
// WHAT IS CONTRACT HERE:
//
//   • THE SIGHT EXCLUSION IS RETIRED. Eric: *"maybe we should paint everything
//     in radar range, even if its in LOS. Just that if its in LOS (truesight)
//     range, then you also see the actual ship in realtime."* Inside truesight
//     you get BOTH channels — the live hull AND its echo — so nothing in this
//     module consults a sight radius at all any more.
//
//   • EVERY TEST BELOW IS A DIRECT REVERSAL, AND SAYS SO IN ITS A/B HALF. The
//     retired verdict is re-implemented once, locally, in `cycle55Cover` (and
//     inline for ship kernels, where it lived in `stampShip`): each case asserts
//     the new behavior AND that the cycle-55 rule would have produced the exact
//     opposite. Without that half these would be assertions that happen to pass
//     — a heatmap that simply painted everything all along would satisfy them.
//
//   • AMENDMENT 83 IS UNAFFECTED AND STILL GOVERNS (section 7). What died is the
//     frozen sight VERDICT, not the freezing discipline: a paint's footprint,
//     bands and intensities are still decided once at creation and are still
//     byte-stable against every later position of the observer. Only alpha
//     moves. Amendment 86's "a ghost may decay inside the bubble" stops being an
//     edge case and becomes the ordinary case.

/** Base truesight (u) — the radius the RETIRED verdict was taken against, and
 *  the radius the A/B halves below rebuild it at. */
const HOLE = 330;

describe('the scope paints INSIDE truesight now (amendment 88 — the reversal)', () => {
  it('an island wholly inside truesight paints a full mass — and cycle 55 '
    + 'painted ZERO cells of it', () => {
    // The exact case cycle 54/55 suppressed: a coastline every cell of which is
    // inside the bubble. It must now paint like any other landmass.
    const isle = ridgeIsland(); // r = 250 about the origin
    const obs = { x: 0, y: -260 }; // every cell of its lit near face is < 330u away
    const paint = islandPaint(isle, [isle], obs, CLEAN);

    const now = grid(CLEAN, obs.x, obs.y);
    stampIsland(now, paint, 1);
    const mass = bandCounts(now).reduce((a, b) => a + b, 0);
    expect(mass, 'a full landmass, inside the bubble').toBeGreaterThan(1000);
    expect(litCells(now, obs).every((c) => c.d <= HOLE), 'all of it inside sight').toBe(true);

    // THE REVERSAL, PROVEN: the retired verdict applied to this very coverage
    // list leaves nothing at all. This block fails against cycle 55's behavior.
    const cycle55 = grid(CLEAN, obs.x, obs.y);
    stampIsland(cycle55, { ...paint, cover: cycle55Cover(paint.cover, obs, HOLE) }, 1);
    expect(bandCounts(cycle55), 'cycle 55 painted none of it').toEqual([0, 0, 0]);
  });

  it('an island straddling the boundary paints BOTH portions — cycle 55 kept '
    + 'only the outside one', () => {
    const isle = straddleRidge();
    const obs = { x: 0, y: 0 };
    const paint = islandPaint(isle, [isle], obs, CLEAN);
    // Sanity on the geometry itself: the landmass really does cross the line.
    expect(pointInIsland({ x: 0, y: HOLE - 60 }, isle)).toBe(true);
    expect(pointInIsland({ x: 0, y: HOLE + 40 }, isle)).toBe(true);

    const now = grid(CLEAN, obs.x, obs.y);
    stampIsland(now, paint, 1);
    const cut = split(now, HOLE, obs);
    expect(cut.inside, 'coastline inside truesight').toBeGreaterThan(0);
    expect(cut.outside, 'coastline beyond truesight').toBeGreaterThan(0);

    // THE REVERSAL: cycle 55 kept the outside portion byte-for-byte and deleted
    // the inside one. The outside half being IDENTICAL is what proves this
    // cycle only added cells — it did not re-tune the fill.
    const cycle55 = grid(CLEAN, obs.x, obs.y);
    stampIsland(cycle55, { ...paint, cover: cycle55Cover(paint.cover, obs, HOLE) }, 1);
    const before = split(cycle55, HOLE, obs);
    expect(before.inside, 'cycle 55: nothing inside').toBe(0);
    expect(before.outside, 'cycle 55: the same outside portion').toBe(cut.outside);
  });

  it('a ship echo wholly inside truesight paints — cycle 55 suppressed every '
    + 'cell of it', () => {
    const paint = shipPaint(124, 150); // 150u out: deep inside the bubble
    const g = grid(CLEAN);
    raster(g, [paint], CLEAN);
    const lit = litCells(g);
    expect(lit.length, 'the kernel paints').toBeGreaterThan(0);
    // THE REVERSAL: cycle 55's per-cell gate in `stampShip` dropped exactly the
    // cells whose centre lay within the frozen radius — here, all of them.
    expect(lit.every((c) => c.d <= HOLE), 'and every lit cell is inside truesight').toBe(true);
  });

  it('a ship echo straddling the boundary paints BOTH halves', () => {
    // A big broadside contact sitting exactly on the old boundary: its kernel is
    // ~72u deep in range, so it genuinely spans both sides. Cycle 55 kept the
    // outside half and deleted the inside one; both now paint.
    const g = grid(CLEAN);
    raster(g, [shipPaint(200, HOLE)], CLEAN);
    const cut = split(g, HOLE);
    expect(cut.inside, 'inside truesight').toBeGreaterThan(0);
    expect(cut.outside, 'beyond truesight').toBeGreaterThan(0);
  });
});

// --- 7. A PAINT IS STILL A HISTORICAL RECORD (amendment 83, unaffected by 88) ----

describe('THE HEADLINE GUARD: a paint is decided once and only alpha moves '
  + '(amendment 83)', () => {
  it('one paint list, three observer anchors — identical cells, bands and '
    + 'intensities every time', () => {
    // The structural half of the guarantee: the rasterizer is handed no observer
    // state, so there is nothing live for a footprint to drift against. This is
    // what cycle 55 bought and what cycle 56 must not spend.
    const isle = ridgeIsland();
    const obs = { x: 0, y: -400 };
    const paints: RadarPaint[] = [shipPaint(124, 300), islandPaint(isle, [isle], obs, CLEAN)];

    // The anchors below all keep the whole paint list inside the buffer, which
    // is only 2 × radar range wide: a clipped mark would differ for reasons of
    // EXTENT rather than of policy, and that is a different test (the "leaving
    // radar range" case below).
    const ref = grid(CLEAN, 0, 0);
    raster(ref, paints, CLEAN);
    const refLit = litCells(ref).map((c) => `${c.x},${c.y}`).sort();
    expect(refLit.length).toBeGreaterThan(500);

    for (const [ox, oy] of [[40, -60], [-90, 120], [0, 200]]) {
      const g = grid(CLEAN, ox, oy);
      raster(g, paints, CLEAN);
      expect(litCells(g).map((c) => `${c.x},${c.y}`).sort(), `observer ${ox},${oy}`)
        .toEqual(refLit);
      expect(bandCounts(g)).toEqual(bandCounts(ref));
      expect(sampleGrid(g, 0, 300).w).toBe(sampleGrid(ref, 0, 300).w);
    }
  });

  it('and it is ALPHA, not membership, that moves as it ages', () => {
    const paint = shipPaint(200, 300);
    const fresh = grid(CLEAN);
    raster(fresh, [paint], CLEAN);
    const old = grid(CLEAN);
    raster(old, [paint], CLEAN, LIFE * 0.75);
    expect(bandCounts(old)).toEqual(bandCounts(fresh));
    expect(sampleGrid(old, 0, 300).w).toBe(sampleGrid(fresh, 0, 300).w);
    expect(sampleGrid(old, 0, 300).a).toBeLessThan(sampleGrid(fresh, 0, 300).a);
  });
});

describe('a legitimately swept paint is never taken away — only time '
  + 'retires it (amendment 86)', () => {
  it('a ghost the observer has closed on keeps decaying in place — now the '
    + 'ORDINARY case, not an accepted edge case', () => {
    // Eric: *"just because it leaves radar range doesn't mean it gets
    // un-painted. the phosphor decays naturally, right?"* Amendment 86 recorded
    // a ghost decaying inside the bubble as an accepted consequence; with the
    // sight exclusion retired it is simply what the scope does.
    const paint = shipPaint(200, 500);
    const swept = grid(CLEAN);
    raster(swept, [paint], CLEAN);
    const bands = bandCounts(swept);
    expect(bands.reduce((a, b) => a + b, 0), 'it painted when swept').toBeGreaterThan(0);

    const closed = { x: 0, y: 480 }; // 20u off the echo: deep inside truesight
    const near = grid(CLEAN, closed.x, closed.y);
    raster(near, [paint], CLEAN);
    expect(
      litCells(near, closed).every((c) => c.d < HOLE),
      'the ghost is inside the CURRENT bubble',
    ).toBe(true);
    expect(bandCounts(near), 'and it is untouched — same cells, same bands').toEqual(bands);
  });

  it('leaving RADAR range does not un-paint either — a ship latches its `dist`', () => {
    // Attenuation is computed from the FROZEN range, so sailing away cannot dim
    // or erase a mark. Same paint, four observer anchors out to the edge of the
    // buffer (which is only 2 × radar range wide, so a full departure clips the
    // mark for reasons of extent rather than of policy): identical cells,
    // identical bands, identical intensities every time.
    const paint = shipPaint(124, 500);
    const ref = grid(CLEAN);
    raster(ref, [paint], CLEAN);
    expect(bandCounts(ref).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    for (const [ox, oy] of [[0, 1050], [450, 850], [-500, 150]]) {
      const g = grid(CLEAN, ox, oy);
      raster(g, [paint], CLEAN);
      expect(bandCounts(g), `observer ${ox},${oy}`).toEqual(bandCounts(ref));
      expect(sampleGrid(g, 0, 500).w).toBe(sampleGrid(ref, 0, 500).w);
    }
    // And the latched range really is the attenuation channel: the same hull at
    // the same PLACE, frozen at a longer range, reads weaker — a smaller kernel
    // (the saturated core cell reads 1.0 either way, so the footprint is where
    // the attenuation shows).
    const farLatch: ShipPaint = { ...paint, dist: 650 };
    const weak = grid(CLEAN);
    raster(weak, [farLatch], CLEAN);
    expect(bandCounts(weak).reduce((a, b) => a + b, 0))
      .toBeLessThan(bandCounts(ref).reduce((a, b) => a + b, 0));
  });

  it('but TIME does retire it: the decay path still empties the buffer', () => {
    // The one thing that may take a paint away. `blipAlpha` is age-only, so the
    // whole mark leaves at end of life regardless of range or beam position.
    const paint = shipPaint(124, 500);
    const alive = grid(CLEAN);
    raster(alive, [paint], CLEAN, LIFE - 1);
    expect(bandCounts(alive).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    const dead = grid(CLEAN);
    raster(dead, [paint], CLEAN, LIFE + 1);
    expect(bandCounts(dead)).toEqual([0, 0, 0]);
  });
});

// --- 8. contact-derived echoes (ruling R7, amendment 89) ------------------------
//
// WHAT IS CONTRACT HERE:
//
//   • THE SWEEP GATES IT, exactly as it gates a wire blip. An echo is born when
//     the BEAM CROSSES the contact's bearing — not every frame, not on contact
//     arrival. Amendment 83 governs this source like every other.
//
//   • THE TWO SOURCES ARE COMPLEMENTARY, so a hull is never painted twice. The
//     client synthesizes at `dist <= sightU`; the server blips at `dist >
//     sightU`. The seam test below pins BOTH sides of that inequality against a
//     local re-implementation of the server's own range term.
//
//   • THE FOOTPRINT IS THE SAME EITHER WAY. `ext` is computed from exactly the
//     inputs the server's `echoExtent` uses, so an echo does not change
//     character when a hull crosses the seam between the sources.
//
//   • ONE CAP KEY. A contact-derived paint carries the contact id, which is the
//     same field a wire paint's track cap keys on.

/** The server's `blipGate` range term, re-implemented locally: it emits a wire
 *  blip only BEYOND truesight. The client's synthesis must be its exact
 *  complement, and the seam test asserts the two partition the line. */
function serverWouldBlip(dist: number, sightU: number): boolean {
  return dist > sightU;
}

const SIGHT = 330;
/** A sighted contact 200u due +y of an observer at the origin: bearing π/2. */
const SIGHTED = { id: 'ship-7', x: 0, y: 200, heading: 0, cls: 'battleship' as const };
const OBS = { x: 0, y: 0 };

/** The whole beam arc, so only the range/LOS terms can reject. */
const SWEPT: [number, number] = [0, Math.PI * 1.9];

describe('a sighted ship paints from its Contact when the BEAM crosses it '
  + '(amendment 89)', () => {
  it('paints when the beam crosses its bearing', () => {
    const p = contactEcho(SIGHTED, OBS, SIGHT, 1.4, 1.8, [], 1000);
    expect(p).not.toBeNull();
    expect(p?.bearing).toBeCloseTo(Math.PI / 2, 6);
    expect(p?.dist).toBeCloseTo(200, 6);
    expect(p?.t).toBe(1000);
  });

  it('paints NOTHING before the beam reaches it — the sweep gate holds', () => {
    // The beam is still short of π/2 (and, on the other side, has already passed
    // it). Neither arc may create a paint: a contact is not a paint trigger.
    expect(contactEcho(SIGHTED, OBS, SIGHT, 0.2, 1.0, [], 1000)).toBeNull();
    expect(contactEcho(SIGHTED, OBS, SIGHT, 1.8, 2.6, [], 1000)).toBeNull();
    // Nor does a stalled beam (zero advance) paint, however long it sits there.
    expect(contactEcho(SIGHTED, OBS, SIGHT, 1.6, 1.6, [], 1000)).toBeNull();
  });

  it('is created ONCE per crossing, not once per frame in the arc', () => {
    // Frame-by-frame advance across the bearing: exactly one frame may produce a
    // paint, because `sweepCrossed` is half-open in the direction of travel.
    let paints = 0;
    for (let a = 1.2; a < 1.9; a += 0.1) {
      if (contactEcho(SIGHTED, OBS, SIGHT, a, a + 0.1, [], 1000) !== null) paints++;
    }
    expect(paints).toBe(1);
  });
});

describe('the two ship-paint sources are COMPLEMENTARY — no double-painting', () => {
  it('THE SEAM: at exactly the sight radius the client paints and the server '
    + 'does not; one unit further out, the reverse', () => {
    const on = { ...SIGHTED, y: SIGHT };
    const out = { ...SIGHTED, y: SIGHT + 1 };
    // Inclusive on the client, exclusive on the server — the server's `blipGate`
    // excludes `dist <= sightRange` exactly, so the boundary hull is ours.
    expect(contactEcho(on, OBS, SIGHT, ...SWEPT, [], 0), 'client paints the boundary')
      .not.toBeNull();
    expect(serverWouldBlip(SIGHT, SIGHT), 'server does not').toBe(false);
    expect(contactEcho(out, OBS, SIGHT, ...SWEPT, [], 0), 'client declines beyond it')
      .toBeNull();
    expect(serverWouldBlip(SIGHT + 1, SIGHT), 'server takes over').toBe(true);
  });

  it('the partition is total: across a whole range sweep, EXACTLY ONE source '
    + 'ever paints', () => {
    for (let d = 1; d <= 660; d += 1) {
      const c = { ...SIGHTED, y: d };
      const client = contactEcho(c, OBS, SIGHT, ...SWEPT, [], 0) !== null;
      expect(client, `${d}u`).toBe(!serverWouldBlip(d, SIGHT));
    }
  });

  it('a DAZZLED seam moves both sources together — the annulus is blipped, not '
    + 'synthesized, and never both', () => {
    // The client's radius is `fogHoleRadiusU`, which IS the server's dazzle-
    // scaled `sightOf`. Shrink it and the annulus the eye lost changes hands
    // cleanly: the client stops synthesizing there and the server starts
    // blipping there.
    const dazzled = SIGHT * CONFIG.starShells.dazzleSightFactor;
    const mid = (dazzled + SIGHT) / 2;
    const c = { ...SIGHTED, y: mid };
    expect(contactEcho(c, OBS, SIGHT, ...SWEPT, [], 0), 'un-dazzled: ours').not.toBeNull();
    expect(serverWouldBlip(mid, SIGHT)).toBe(false);
    expect(contactEcho(c, OBS, dazzled, ...SWEPT, [], 0), 'dazzled: theirs').toBeNull();
    expect(serverWouldBlip(mid, dazzled)).toBe(true);
  });

  it('and the cap key is the CONTACT ID — the same field a wire paint keys on, '
    + 'so a hull crossing the seam keeps ONE ghost train', () => {
    const p = contactEcho(SIGHTED, OBS, SIGHT, ...SWEPT, [], 0);
    expect(p?.id).toBe(SIGHTED.id);
    expect(p?.kind).toBe('ship');
  });
});

describe('a contact-derived echo is geometrically a wire blip', () => {
  it('its `ext` is exactly what the server would put on the wire for the same '
    + 'hull and aspect', () => {
    for (const heading of [0, 0.7, Math.PI / 2, 2.9, -1.1]) {
      const c = { ...SIGHTED, heading };
      const p = contactEcho(c, OBS, SIGHT, ...SWEPT, [], 0);
      // The server's `echoExtent`, re-implemented: the silhouette posed at the
      // ORIGIN with the paint's heading, projected perpendicular to the
      // observer→target bearing.
      const wire = perpendicularExtent(
        transformPolygon(hullSilhouette(c.cls), 0, 0, heading, []),
        Math.atan2(c.y - OBS.y, c.x - OBS.x),
      );
      expect(p?.ext).toBeCloseTo(wire, 9);
    }
    // ...and the channel is live: a battleship bow-on and abeam do NOT read the
    // same, or the assertion above would be pinning a constant.
    const bowOn = contactEcho({ ...SIGHTED, heading: Math.PI / 2 }, OBS, SIGHT, ...SWEPT, [], 0);
    const abeam = contactEcho({ ...SIGHTED, heading: 0 }, OBS, SIGHT, ...SWEPT, [], 0);
    expect(abeam?.ext ?? 0).toBeGreaterThan((bowOn?.ext ?? 0) * 2);
  });

  it('stamps the IDENTICAL footprint a wire paint of that `ext` would', () => {
    const p = contactEcho(SIGHTED, OBS, SIGHT, ...SWEPT, [], 0);
    const wire: ShipPaint = { ...shipPaint(p?.ext ?? 0, 200), seed: p?.seed ?? 0 };
    const a = grid(CLEAN);
    if (p !== null) stampShip(a, p, 1, CLEAN);
    const b = grid(CLEAN);
    stampShip(b, wire, 1, CLEAN);
    expect(bandCounts(a).reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
    expect([...a.w]).toEqual([...b.w]);
  });
});

describe('islands block this sensor too (Eric ruling 2026-08-02)', () => {
  it('a sighted contact behind a headland returns no echo — and the same '
    + 'contact in open water does', () => {
    // The case that makes this gate load-bearing rather than theoretical: a hull
    // lit by our own star shell arrives as a Contact with NO line of sight.
    const headland = islandFromPolygon([
      { x: -40, y: 80 },
      { x: 40, y: 80 },
      { x: 40, y: 140 },
      { x: -40, y: 140 },
    ]);
    expect(contactEcho(SIGHTED, OBS, SIGHT, ...SWEPT, [headland], 0)).toBeNull();
    expect(contactEcho(SIGHTED, OBS, SIGHT, ...SWEPT, [], 0)).not.toBeNull();
    // A headland off to one side shadows nothing on this bearing.
    const aside = islandFromPolygon([
      { x: 300, y: 80 },
      { x: 380, y: 80 },
      { x: 380, y: 140 },
      { x: 300, y: 140 },
    ]);
    expect(contactEcho(SIGHTED, OBS, SIGHT, ...SWEPT, [aside], 0)).not.toBeNull();
  });
});

// --- the pole/core semantic shift (cycle 59) -----------------------------------
//
// `Island.core` used to be the inscribed radius about the BOUNDING CENTRE and is
// now the inscribed radius about `pole`, the pole of inaccessibility. Both are
// plain numbers on a type that is still structurally assignable to `Circle`, so
// a site that kept reading `isle.x/y` COMPILES AND SHIPS SILENTLY — which is
// exactly why the A/B half of every test below swaps the pole back to the
// bounding centre and demands the failure reappear.

/**
 * A HOOK island: a thick C whose vertex centroid falls in its own bay. Arms are
 * 280u thick (core ≈ 140) while the bay slot is only 40u wide, so the retired
 * centre-keyed `core` disc reaches ~140u of OPEN WATER — the failure is not a
 * rounding error, it is most of the bay.
 */
function hookIsland(): Island {
  return islandFromPolygon([
    { x: -300, y: -300 },
    { x: -20, y: -300 },
    { x: -20, y: 150 },
    { x: 20, y: 150 },
    { x: 20, y: -300 },
    { x: 300, y: -300 },
    { x: 300, y: 300 },
    { x: -300, y: 300 },
  ]);
}

/** The same island as a site that never migrated sees it: `core` keyed on the
 *  bounding centre. The A/B control for every guard in this section. */
function centreKeyed(isle: Island): Island {
  return { ...isle, pole: { x: isle.x, y: isle.y } };
}

/**
 * Cells in `cover` whose centre is NOT on the island AND which paint stronger
 * than SURF possibly can — i.e. water painted as LANDMASS.
 *
 * The intensity clause is what keeps this guard sharp now that Story 4.10 puts a
 * legitimate surf fringe on the water (amendment 131). A surf cell's ceiling is
 * its coefficient (the taper, the terminator and the attenuation are all ≤ 1),
 * so anything above it on open water can only have come from the LAND path —
 * which is exactly the failure a centre-keyed `core` early-IN produces.
 */
function wetCells(isle: Island, cover: readonly CoverCell[]): number {
  const surfMax = CLEAN.model.surf;
  return cover.filter(
    (c) =>
      c.i > surfMax + 1e-9 &&
      !pointInIsland({ x: cellCentre(c.gx, CLEAN.cellU), y: cellCentre(c.gy, CLEAN.cellU) }, isle),
  ).length;
}

describe('core is measured about the POLE, not the bounding centre (cycle 59)', () => {
  const OBS = { x: 0, y: -500 }; // off the bay mouth, looking into the slot

  it('THE PREMISE: the hook fixture really does put its centroid in the water', () => {
    const isle = hookIsland();
    expect(pointInIsland(isle.pole, isle), 'the pole is interior by construction').toBe(true);
    expect(pointInIsland({ x: isle.x, y: isle.y }, isle), 'the centroid is in the bay').toBe(false);
    expect(isle.core).toBeGreaterThan(100); // a disc big enough to flood the slot
  });

  it('the core disc about the POLE is all land; the same disc about the centroid is not', () => {
    const isle = hookIsland();
    let wetAboutCentre = 0;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
      for (const f of [0.25, 0.5, 0.75, 0.95]) {
        const d = isle.core * f;
        const pole = { x: isle.pole.x + Math.cos(a) * d, y: isle.pole.y + Math.sin(a) * d };
        expect(pointInIsland(pole, isle), 'inside the pole disc').toBe(true);
        const centre = { x: isle.x + Math.cos(a) * d, y: isle.y + Math.sin(a) * d };
        if (!pointInIsland(centre, isle)) wetAboutCentre++;
      }
    }
    expect(wetAboutCentre, 'the centre-keyed disc covers open water').toBeGreaterThan(0);
  });

  it('solidity does not report full-solid land in the middle of a bay', () => {
    const isle = hookIsland();
    const bay = { x: 0, y: isle.y }; // in the slot, ~20u from each wall
    const depth = CLEAN.island.depthFullU;
    // The true answer is the coastline distance — the slot is far shallower
    // than `depthFullU`, so this cell can never be a saturated interior.
    expect(solidity(bay, isle, depth)).toBeLessThan(0.5);
    // A/B: keyed on the bounding centre, the early-out fires and swears it is
    // the deepest part of a landmass.
    expect(solidity(bay, centreKeyed(isle), depth)).toBe(1);
  });

  it('the coverage bake paints no cell that is not on the polygon', () => {
    // `maxCells` is raised for this fixture ALONE: the hook is 600 × 600 of
    // land, several times the shipped cap, and a truncated bake would stop
    // scanning before it ever reached the bay — leaving the A/B half green for
    // the wrong reason. The cap is a runaway guard, not part of this contract.
    const DEEP: HeatmapOpts = { ...CLEAN, island: { ...CLEAN.island, maxCells: 40000 } };
    const isle = hookIsland();
    const cover = buildIslandCoverage(isle, [isle], OBS, RADAR, 999, DEEP);
    expect(cover.length, 'the island does paint').toBeGreaterThan(100);
    expect(wetCells(isle, cover), 'no sailable water painted as land').toBe(0);

    // A/B: the centre-keyed `core` early-IN returns true before the polygon is
    // ever consulted, so the bay lights up as solid landmass.
    const bad = centreKeyed(isle);
    expect(wetCells(isle, buildIslandCoverage(bad, [bad], OBS, RADAR, 999, DEEP))).toBeGreaterThan(0);
  });
});

// --- 9. THE PHYSICAL RETURN MODEL (Story 4.10, amendments 105-106, 127-132) -----
//
// WHAT IS CONTRACT HERE:
//
//   • HEIGHT MULTIPLIES DEPTH, IT DOES NOT REPLACE IT (amendment 129). Two
//     islands of IDENTICAL geometry, one high and one at sea level, must not
//     paint identically — and the tall one must still read as a big red mass out
//     to the rim, which is amendment 78 and is pinned here as a regression.
//
//   • SURF IS A SEAWARD FRINGE, NEAR FACE ONLY (amendment 131). Outside the
//     polygon, within `surfBandU`, inheriting the island's own terminator — and
//     GREEN at every range, never blue.
//
//   • CLUTTER CAN NEVER OUTRANK A REAL RETURN (amendment 130). Its peak stays
//     strictly below `bands[0].at` at the noise multiplier's most favourable
//     draw. This is the assertion that stops a future coefficient raise from
//     silently inverting a ruling Eric made.
//
//   • THE STORM PAINTS ITS WALL, NOT ITS AREA (amendment 128) — a fixed-thickness
//     band on the LIVE ring, clipped to radar range from the frozen observer, and
//     never strong enough to out-read a hull.

/** A uniform synthetic height raster covering the whole test map. `sampleHeight`
 *  reads `n`/`cell`/`x0`/`y0`/`height` and nothing else, so the pyramid is a
 *  formality here (Story 4.11 is the pass that will consume it). */
function flatRaster(h: number): HeightRaster {
  const n = 128;
  const height = new Uint8Array(n * n).fill(h);
  return { n, cell: 32, x0: -2048, y0: -2048, seaLevel: 0, peak: 255, height, pyramid: [{ n, cells: height }] };
}

/** Total lit cells in the buffer. */
function litCount(g: HeatGrid): number {
  return bandCounts(g).reduce((a, b) => a + b, 0);
}

/** An island paint baked against a synthetic raster. */
function islandOn(isle: Island, obs: Vec2, raster: HeightRaster | null): IslandPaint {
  return {
    kind: 'island',
    isle,
    from: 0,
    to: 0,
    full: true,
    t: 0,
    cover: buildIslandCoverage(isle, [isle], obs, RADAR, 999, CLEAN, raster),
  };
}

describe('terrain HEIGHT multiplies the depth rule (amendment 129)', () => {
  const OBS_H = { x: 0, y: -400 };

  function ridgeAt(h: number): HeatGrid {
    const isle = ridgeIsland();
    const g = grid(CLEAN, OBS_H.x, OBS_H.y);
    stampIsland(g, islandOn(isle, OBS_H, flatRaster(h)), 1);
    return g;
  }

  it('two islands of EQUAL size paint differently when one is steep and one is '
    + 'flat — the whole point of the channel', () => {
    const steep = ridgeAt(200); // well above `refHeight`
    const flat = ridgeAt(2); // barely above sea level
    expect(bandCounts(steep)[2], 'steep: a red core').toBeGreaterThan(0);
    expect(bandCounts(flat)[2], 'flat: no red anywhere').toBe(0);
    // ...and the flat one is not merely a weaker version of nothing: the depth
    // rule is untouched, so it still paints as a MASS, in weaker bands. (It
    // loses a thin outer fringe whose cells fall under `bands[0].at` once the
    // flat coefficient is applied — which is the honest read of a mudflat's
    // waterline, not a lost landmass.)
    expect(litCount(flat), 'still a mass').toBeGreaterThan(litCount(steep) * 0.85);
    expect(bandAt(steep, 0, -60), 'steep interior').toBe(2);
    expect(bandAt(flat, 0, -60), 'flat interior').toBeLessThan(2);
    expect(bandAt(flat, 0, -60), 'but still land, not water').toBeGreaterThanOrEqual(0);
  });

  it('and with NO raster the fill is the pre-4.10 one — the height channel adds, '
    + 'it never subtracts', () => {
    const isle = ridgeIsland();
    const none = buildIslandCoverage(isle, [isle], OBS_H, RADAR, 999, CLEAN);
    const steep = buildIslandCoverage(isle, [isle], OBS_H, RADAR, 999, CLEAN, flatRaster(255));
    expect(none.map((c) => c.i)).toEqual(steep.map((c) => c.i));
  });

  it('AMENDMENT 78 REGRESSION PIN: a big tall island\'s interior still reads RED '
    + 'at 640u — a big red mass, not one that is only red up close', () => {
    const isle = ridgeIsland();
    const obs = { x: 0, y: -680 };
    const probe = { x: 0, y: -40 }; // 640u out, deep inside the landmass
    expect(pointInIsland(probe, isle)).toBe(true);
    expect(Math.hypot(probe.x - obs.x, probe.y - obs.y)).toBeCloseTo(640, 6);
    const g = grid(CLEAN, obs.x, obs.y);
    stampIsland(g, islandOn(isle, obs, flatRaster(200)), 1);
    expect(bandAt(g, probe.x, probe.y)).toBe(2);
  });
});

describe('SURF is a seaward fringe on the near face (amendment 131)', () => {
  const OBS_S = { x: 0, y: -400 };
  const BAND = CLEAN.model.surfBandU;

  function surfGrid(): HeatGrid {
    const isle = ridgeIsland();
    const g = grid(CLEAN, OBS_S.x, OBS_S.y);
    stampIsland(g, islandPaint(isle, [isle], OBS_S, CLEAN), 1);
    return g;
  }

  it('paints just SEAWARD of the near coast — outside the polygon', () => {
    const isle = ridgeIsland();
    const p = { x: 0, y: -HALF_H - BAND / 2 };
    expect(pointInIsland(p, isle), 'the probe is on the WATER').toBe(false);
    expect(bandAt(surfGrid(), p.x, p.y)).toBeGreaterThanOrEqual(0);
  });

  it('and stops at `surfBandU` — open water beyond the band is open water', () => {
    const g = surfGrid();
    expect(bandAt(g, 0, -HALF_H - BAND * 2)).toBe(-1);
    expect(bandAt(g, 0, -HALF_H - BAND * 4)).toBe(-1);
  });

  it('paints NOTHING on the far face — it inherits the island\'s own terminator '
    + 'rather than growing a second one', () => {
    const g = surfGrid();
    const far = { x: 0, y: HALF_H + BAND / 2 };
    expect(pointInIsland(far, ridgeIsland())).toBe(false);
    expect(bandAt(g, far.x, far.y)).toBe(-1);
  });

  it('and is GREEN at every range — a line of breakers may never read as '
    + '"probably a thing"', () => {
    const isle = ridgeIsland();
    for (const obs of [{ x: 0, y: -200 }, { x: 0, y: -400 }, { x: 0, y: -640 }]) {
      const cover = buildIslandCoverage(isle, [isle], obs, RADAR, 999, CLEAN);
      const surf = cover.filter(
        (c) =>
          !pointInIsland({ x: cellCentre(c.gx, CLEAN.cellU), y: cellCentre(c.gy, CLEAN.cellU) }, isle),
      );
      expect(surf.length, `surf cells from ${obs.y}`).toBeGreaterThan(0);
      for (const c of surf) expect(c.i, 'never reaches the blue band').toBeLessThan(BANDS[1].at);
    }
  });

  it('a LAND cell at the waterline still takes the land path — surf does not '
    + 'replace the coastline, it sits outside it', () => {
    const g = surfGrid();
    const coast = { x: 0, y: -HALF_H + CLEAN.cellU };
    expect(pointInIsland(coast, ridgeIsland())).toBe(true);
    expect(sampleGrid(g, coast.x, coast.y).w).toBeGreaterThan(
      sampleGrid(g, 0, -HALF_H - BAND / 2).w,
    );
  });
});

describe('SEA CLUTTER is texture and nothing else (amendment 130)', () => {
  const M = CFG.model;

  it('UPPER BOUND: it is GREEN at every range and can never reach blue, even at '
    + 'the noise multiplier\'s most favourable draw', () => {
    // At zero range the attenuation term is 1, so this IS the ceiling.
    const peak = clutterIntensity(0, M);
    expect(peak).toBeGreaterThan(0); // the source is real, not disabled
    expect(peak * (1 + CFG.noise), 'the luckiest cell in the game').toBeLessThan(BANDS[1].at);
  });

  it('LOWER BOUND: it STRADDLES `bands[0].at`, so the noise speckles it into a '
    + 'haze instead of a solid disc or nothing at all (amendment 133)', () => {
    const peak = clutterIntensity(0, M);
    expect(peak * (1 - CFG.noise), 'the unluckiest cell must go dark').toBeLessThan(BANDS[0].at);
    expect(peak * (1 + CFG.noise), 'the luckiest cell must light').toBeGreaterThan(BANDS[0].at);
  });

  it('so a full haze paints a SPECKLED GREEN field — some cells lit, some not, '
    + 'and not one of them blue or red', () => {
    const g = grid(CFG);
    const haze = openClutter({ x: 0, y: 0 }, 0, 0, 0, 4242);
    haze.full = true;
    rasterizeWeather(g, [haze], { now: 0, lifeMs: LIFE, alphaFloor: 0, opts: CFG });
    const [green, blue, red] = bandCounts(g);
    expect(green, 'the haze must be visible').toBeGreaterThan(0);
    expect(blue, 'never "probably a thing" on empty water').toBe(0);
    expect(red).toBe(0);
    // SPECKLE, not a solid disc: the noise must leave a real share of the disc
    // dark, or the haze reads as a drawn circle around own hull. `covered` is
    // every cell the haze reached in the INTENSITY field; `green` is the subset
    // that cleared the threshold.
    let covered = 0;
    for (let i = 0; i < g.w.length; i++) if (g.w[i] > 0) covered++;
    expect(covered, 'the haze must reach cells at all').toBeGreaterThan(green);
    expect(green, 'a solid disc is the wrong look').toBeLessThan(covered * 0.9);
  });

  it('and a `minPeak` echo sharing a cell with it wins outright (max-wins)', () => {
    const faint = shipPaint(0, 60); // the weakest legitimate return there is
    const haze = openClutter({ x: 0, y: 0 }, 0, 0, 0, 4242);
    haze.full = true;
    const alone = grid(CLEAN);
    raster(alone, [faint], CLEAN);
    const both = grid(CLEAN);
    raster(both, [faint, haze], CLEAN);
    expect(sampleGrid(both, 0, 60).w, 'clutter did not raise the cell').toBe(
      sampleGrid(alone, 0, 60).w,
    );
    expect(bandAt(both, 0, 60), 'and the echo still paints').toBeGreaterThanOrEqual(0);
  });

  it('falls off with range out of the SURFACE curve rather than a hand-placed '
    + 'radius', () => {
    expect(clutterIntensity(200, M)).toBeLessThan(clutterIntensity(0, M));
    expect(clutterIntensity(2000, M)).toBeLessThan(clutterIntensity(200, M));
  });
});

describe('THE STORM WALL (amendment 128): a band on the LIVE ring', () => {
  const OBS_Z = { x: 0, y: 0 };
  const RING = { cx: 0, cy: 0, r: 400 };

  function stormPaint(cover: CoverCell[], from = 0, to = 0, full = true): StormPaint {
    return { kind: 'storm', from, to, full, t: 0, cover };
  }

  function stampWeather(g: HeatGrid, paints: RadarPaint[], opts: HeatmapOpts): void {
    rasterizeWeather(g, paints, { now: 0, lifeMs: LIFE, alphaFloor: 0, opts });
  }

  it('bakes a fixed-thickness band on the ring radius, and nothing off it', () => {
    const cover = buildStormBand(RING, OBS_Z, RADAR, 7, CLEAN);
    expect(cover.length).toBeGreaterThan(100);
    const half = CLEAN.model.stormBandU / 2 + CLEAN.cellU;
    for (const c of cover) {
      const x = cellCentre(c.gx, CLEAN.cellU);
      const y = cellCentre(c.gy, CLEAN.cellU);
      const d = Math.hypot(x - RING.cx, y - RING.cy);
      expect(Math.abs(d - RING.r), `cell at ${x},${y}`).toBeLessThanOrEqual(half);
      expect(Number.isFinite(c.i) && c.i > 0, 'no NaN reaches writeCell').toBe(true);
    }
  });

  it('is clipped to RADAR RANGE from the frozen observer', () => {
    // The observer stands off to one side: the near arc is in range, the far arc
    // (700u away) is not, and must simply not exist in the bake.
    const obs = { x: -300, y: 0 };
    const cover = buildStormBand(RING, obs, RADAR, 7, CLEAN);
    expect(cover.length).toBeGreaterThan(50);
    for (const c of cover) {
      const x = cellCentre(c.gx, CLEAN.cellU);
      const y = cellCentre(c.gy, CLEAN.cellU);
      expect(Math.hypot(x - obs.x, y - obs.y)).toBeLessThanOrEqual(RADAR + CLEAN.cellU);
    }
    // A/B that the clip actually BIT: from the ring's own centre the whole
    // circumference is in range and the bake is strictly bigger.
    expect(cover.length).toBeLessThan(buildStormBand(RING, OBS_Z, RADAR, 7, CLEAN).length);
    // And the far arc — the point of the ring diametrically opposite, 700u out —
    // is genuinely absent rather than merely dim.
    const farthest = Math.max(...cover.map((c) => cellCentre(c.gx, CLEAN.cellU)));
    expect(farthest, 'nothing baked past the range horizon').toBeLessThan(RING.r - CLEAN.cellU);
  });

  it('a ring wholly out of radar range bakes NOTHING', () => {
    expect(buildStormBand({ cx: 0, cy: 0, r: 2000 }, OBS_Z, RADAR, 7, CLEAN)).toEqual([]);
    expect(buildStormBand({ cx: 4000, cy: 0, r: 400 }, OBS_Z, RADAR, 7, CLEAN)).toEqual([]);
  });

  it('a degenerate ring bakes nothing rather than NaN — or a hung frame', () => {
    // The infinities are not hypothetical hygiene: the radial walk advances by a
    // fixed step, so `Infinity + step === Infinity` would spin forever inside a
    // render frame. This case is the reason `buildStormBand` tests finiteness
    // before it tests sign.
    for (const r of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildStormBand({ cx: 0, cy: 0, r }, OBS_Z, RADAR, 7, CLEAN), `r=${r}`).toEqual([]);
    }
    expect(buildStormBand({ cx: Number.NaN, cy: 0, r: 400 }, OBS_Z, RADAR, 7, CLEAN)).toEqual([]);
    expect(buildStormBand(RING, OBS_Z, 0, 7, CLEAN)).toEqual([]);
  });

  it('reads BLUE with a green shoulder — legible across the map, and never '
    + 'strong enough to out-read a hull', () => {
    const g = grid(CLEAN);
    stampWeather(g, [stormPaint(buildStormBand(RING, OBS_Z, RADAR, 7, CLEAN))], CLEAN);
    const counts = bandCounts(g);
    expect(counts[1], 'a blue wall').toBeGreaterThan(0);
    expect(counts[0], 'with a green shoulder').toBeGreaterThan(0);
    expect(counts[2], 'and never red — weather may not out-read a hull').toBe(0);
    // The wall is on the ring, so the water inside the scope stays clear.
    expect(bandAt(g, 0, 0), 'inside the ring is open water').toBe(-1);
    expect(bandAt(g, 0, RING.r), 'and the wall is where the ring is').toBeGreaterThanOrEqual(0);
  });

  it('and it obeys the arc gate like every other paint — nothing paints ahead of '
    + 'the beam', () => {
    const cover = buildStormBand(RING, OBS_Z, RADAR, 7, CLEAN);
    const g = grid(CLEAN);
    stampWeather(g, [stormPaint(cover, 0, 0.4, false)], CLEAN);
    const swept = litCount(g);
    const all = grid(CLEAN);
    stampWeather(all, [stormPaint(cover)], CLEAN);
    expect(swept).toBeGreaterThan(0);
    expect(swept).toBeLessThan(litCount(all));
  });

  it('a stalled beam opens no weather paint at all (the zero-width advance)', () => {
    expect(weatherCycled(1.2, 1.2)).toBe(false);
    expect(weatherCycled(-0.2, 0.2), 'but crossing the anchor does').toBe(true);
  });
});
