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
  nearestCoastPoint,
  perpendicularExtent,
  pointInIsland,
  transformPolygon,
  wrapPositive,
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
  occluderCandidates,
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
  WEATHER_ANCHOR,
  buildStormBand,
  clutterIntensity,
  openClutter,
  openStorm,
  rasterizeWeather,
  weatherCycled,
  type ClutterPaint,
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
 * 270u thick (core ≈ 134) while the bay slot is 140u wide, so the retired
 * centre-keyed `core` disc reaches ~134u of OPEN WATER — the failure is not a
 * rounding error, it is most of the bay.
 *
 * THE SLOT IS WIDER THAN `2 × surfBandU` ON PURPOSE (Story 4.10 review gate).
 * `wetCells` excuses a painted water cell POSITIONALLY — within a surf band of
 * the coast it is legitimate surf (amendment 131) — so a bay narrow enough that
 * every cell in it is within 30u of a wall would excuse the very failure this
 * fixture exists to catch, and the A/B half would go green for the wrong reason.
 * At 140u wide the middle of the slot is 70u from land: unambiguously open
 * water, unambiguously not surf.
 */
function hookIsland(): Island {
  return islandFromPolygon([
    { x: -340, y: -340 },
    { x: -70, y: -340 },
    { x: -70, y: 150 },
    { x: 70, y: 150 },
    { x: 70, y: -340 },
    { x: 340, y: -340 },
    { x: 340, y: 340 },
    { x: -340, y: 340 },
  ]);
}

/** The same island as a site that never migrated sees it: `core` keyed on the
 *  bounding centre. The A/B control for every guard in this section. */
function centreKeyed(isle: Island): Island {
  return { ...isle, pole: { x: isle.x, y: isle.y } };
}

/**
 * Cells in `cover` whose centre is OPEN WATER — not on the island, and further
 * from its coastline than surf can legitimately reach.
 *
 * THE EXCUSE IS POSITIONAL, NOT AN INTENSITY THRESHOLD, and that distinction is
 * the whole strength of this guard. Story 4.10 puts a legitimate surf fringe on
 * the water (amendment 131), so the filter has to let it through — but excusing
 * every water cell weaker than the surf COEFFICIENT would also excuse a LAND
 * path that painted open water weakly, which is precisely the centre-keyed
 * `core` failure class this oracle was built for (a shallow-water cell reads
 * weak, so an intensity filter waves it past). Distance from the coastline
 * cannot be faked by a wrong intensity: surf is excused, and nothing else is.
 */
function wetCells(isle: Island, cover: readonly CoverCell[]): number {
  const band = CLEAN.model.surfBandU;
  return cover.filter((c) => {
    const p = { x: cellCentre(c.gx, CLEAN.cellU), y: cellCentre(c.gy, CLEAN.cellU) };
    if (pointInIsland(p, isle)) return false;
    return nearestCoastPoint(p, isle).dist > band;
  }).length;
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
    // In the slot, 30u off the eastern wall. It has to be OFF-CENTRE: at the
    // slot's midline the true coastline distance is 70u, which saturates
    // `depthFullU` on its own and would read 1 for the RIGHT reason — the probe
    // has to sit where the honest answer and the buggy one differ.
    const bay = { x: 40, y: isle.y };
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
    const DEEP: HeatmapOpts = {
      ...CLEAN,
      island: { ...CLEAN.island, maxCells: 40000, surfMaxCells: 40000 },
    };
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
//   • CLUTTER CAN NEVER OUTRANK A REAL RETURN (amendments 130 + 133), is never
//     blue, and STRADDLES `bands[0].at` so it speckles.
//
//   • THE STORM PAINTS ITS WALL, NOT ITS AREA (amendment 128) — a fixed-thickness
//     band on the LIVE ring, clipped to radar range from the frozen observer, and
//     never strong enough to out-read a hull.
//
//   • EVERY COEFFICIENT BOUND IS STATED AND ASSERTED AT THE WORST-CASE NOISE
//     DRAW. This is the review-gate correction the whole section turns on. The
//     noise multiplier (±`noise`, so up to ×1.3) is applied to a cell's intensity
//     AFTER the coefficients are chosen, so a bound written against the bare
//     coefficient is not a bound at all — and every test that could have caught
//     it ran the `CLEAN` (noise 0) fixture. Two shipped coefficients were wrong
//     that way: `surf` 0.3 × 1.3 = 0.39 painted BLUE on open water, and `storm`
//     0.6 × 1.3 = 0.78 painted the storm wall RED, out-reading a hull. So each
//     source below is pinned twice: arithmetically at `× (1 + noise)`, and
//     through a RASTERIZED band histogram with the shipped speckle on.

/** The noise multiplier's extremes — the two draws every coefficient bound in
 *  this section has to survive. `CLEAN` (noise 0) is exactly 1 for both, which
 *  is why bounds asserted through it proved nothing. */
const WORST = 1 + CFG.noise;
const BEST = 1 - CFG.noise;

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

  it('THE BOUND WITH THE NOISE IN IT: even the luckiest surf cell in the game '
    + 'stays green', () => {
    // The shipped 0.3 satisfied `surf < bands[1].at` and FAILED this: 0.39 > 0.36,
    // so breakers read blue on open water within ~310u. The bare-coefficient
    // form is not a bound, because `noiseMul` multiplies the cell AFTER it.
    expect(CFG.model.surf, 'the bare coefficient is not the ceiling')
      .toBeLessThan(BANDS[1].at);
    expect(CFG.model.surf * WORST, 'and neither is it once noise is applied')
      .toBeLessThan(BANDS[1].at);
  });

  it('RASTERIZED, WITH THE SHIPPED SPECKLE ON: the surf fringe alone paints '
    + 'green and ONLY green', () => {
    // The histogram statement, on the water cells only: no matter which way
    // every cell's noise draw falls, the fringe can produce no blue and no red.
    const isle = ridgeIsland();
    const cover = buildIslandCoverage(isle, [isle], OBS_S, RADAR, 999, CFG).filter(
      (c) => !pointInIsland({ x: cellCentre(c.gx, CFG.cellU), y: cellCentre(c.gy, CFG.cellU) }, isle),
    );
    const g = grid(CFG, OBS_S.x, OBS_S.y);
    stampIsland(g, { kind: 'island', isle, from: 0, to: 0, full: true, t: 0, cover }, 1);
    const [green, blue, red] = bandCounts(g);
    expect(green, 'the fringe is visible').toBeGreaterThan(0);
    expect(blue, 'never "probably a thing" on open water').toBe(0);
    expect(red).toBe(0);
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

describe('SEA CLUTTER is texture and nothing else (amendments 130 + 133)', () => {
  const M = CFG.model;
  const REACH = M.clutterRangeU;

  /** A full-arc haze about the origin, over an island field. */
  function haze(field: readonly Island[] = [], obs: Vec2 = { x: 0, y: 0 }): ClutterPaint {
    const p = openClutter(obs, 0, 0, field, REACH);
    p.full = true;
    return p;
  }

  function weather(g: HeatGrid, paints: RadarPaint[], opts: HeatmapOpts): void {
    rasterizeWeather(g, paints, { now: 0, lifeMs: LIFE, alphaFloor: 0, opts });
  }

  it('BOUND 1 — it STRADDLES `bands[0].at`, so the noise speckles it into a '
    + 'haze instead of a solid disc or nothing at all (amendment 133)', () => {
    const peak = clutterIntensity(0, M);
    expect(peak).toBeGreaterThan(0); // the source is real, not disabled
    expect(peak * BEST, 'the unluckiest cell must go dark').toBeLessThan(BANDS[0].at);
    expect(peak * WORST, 'the luckiest cell must light').toBeGreaterThan(BANDS[0].at);
  });

  it('BOUND 2 — it is GREEN at every range and can never reach blue, even at '
    + 'the noise multiplier\'s most favourable draw', () => {
    // At zero range the attenuation term is 1, so this IS the ceiling.
    expect(clutterIntensity(0, M) * WORST, 'the luckiest cell in the game')
      .toBeLessThan(BANDS[1].at);
  });

  it('BOUND 3 — it can never outrank even the FAINTEST legitimate echo, at the '
    + 'worst pairing of draws', () => {
    // `writeCell` is max-wins and hands the winner BOTH the intensity and the
    // alpha, so a clutter cell that beat a decaying echo's core would re-age it
    // and a ghost would stop reading as a ghost. The weakest real return there
    // is, is a `minPeak` core on its unluckiest draw; clutter's ceiling is its
    // peak on its luckiest. The shipped 0.13 failed this (0.169 > 0.14).
    expect(clutterIntensity(0, M) * WORST, 'the luckiest clutter cell')
      .toBeLessThan(CFG.ship.minPeak * BEST);
  });

  it('so a full haze paints a SPECKLED GREEN field — some cells lit, some not, '
    + 'and not one of them blue or red', () => {
    const g = grid(CFG);
    weather(g, [haze()], CFG);
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
    const alone = grid(CFG);
    raster(alone, [faint], CFG);
    const both = grid(CFG);
    raster(both, [faint, haze()], CFG);
    expect(sampleGrid(both, 0, 60).w, 'clutter did not raise the cell').toBe(
      sampleGrid(alone, 0, 60).w,
    );
    expect(bandAt(both, 0, 60), 'and the echo still paints').toBeGreaterThanOrEqual(0);
  });

  it('THE DISC EDGE IS DECIDED BY THE CURVE, not by `clutterRangeU` — the haze '
    + 'has already faded to nothing well inside the compute bound', () => {
    // Amendment 130 requires the concentration to fall out of the 1/d³ falloff.
    // On the shared `surfaceRef` the return was at 99.7% of peak at 100u, so the
    // speckle density stepped from ~26% straight to zero at a hard radius — a
    // drawn circle wearing a falloff's clothes. `clutterRef` is what makes the
    // fade real, and this is the statement of it: NOTHING can light at the
    // bound, so the bound cannot be seen.
    expect(clutterIntensity(REACH, M) * WORST, 'nothing lights at the compute bound')
      .toBeLessThan(BANDS[0].at);
    // ...and the fade is gradual rather than a second cliff: the luckiest draw
    // crosses the threshold somewhere strictly inside the disc.
    const fade = [10, 30, 50, 70, 90].filter((d) => clutterIntensity(d, M) * WORST > BANDS[0].at);
    expect(fade.length, 'the haze is a real disc, not a ring of one radius')
      .toBeGreaterThan(1);
    expect(fade[fade.length - 1], 'and it is dark long before the bound')
      .toBeLessThan(REACH * 0.9);
    // The A/B that makes this a REGRESSION guard: on the coastline's reference
    // range the same coefficient is still lighting cells at the bound, which is
    // exactly the hard edge this fix removes.
    const shared = { ...M, clutterRef: M.surfaceRef };
    expect(clutterIntensity(REACH, shared) * WORST, 'surfaceRef: still lit at 100u')
      .toBeGreaterThan(BANDS[0].at);
  });

  it('falls off with range out of the SURFACE curve rather than a hand-placed '
    + 'radius', () => {
    expect(clutterIntensity(200, M)).toBeLessThan(clutterIntensity(0, M));
    expect(clutterIntensity(2000, M)).toBeLessThan(clutterIntensity(200, M));
  });

  it('STACKING IS IDEMPOTENT: three live hazes light exactly the cells one '
    + 'lights — the speckle is a property of the PLACE', () => {
    // Every clutter paint carries ONE stable seed. With a per-paint seed the
    // three live hazes of a 3-deep persistence drew three INDEPENDENT ~26%
    // samples of the same disc under max-wins, lighting ~60% of it — the solid
    // disc amendment 133's straddle exists to prevent, rebuilt by stacking.
    const one = grid(CFG);
    weather(one, [haze()], CFG);
    const three = grid(CFG);
    weather(three, [haze(), haze(), haze()], CFG);
    expect(bandCounts(one)[0], 'the single haze lights cells').toBeGreaterThan(0);
    expect(bandCounts(three)).toEqual(bandCounts(one));
    expect([...three.w]).toEqual([...one.w]);
    // A/B: independent seeds light strictly more of the same disc.
    const rolled = grid(CFG);
    weather(rolled, [
      { ...haze(), seed: 11 },
      { ...haze(), seed: 22 },
      { ...haze(), seed: 33 },
    ], CFG);
    expect(bandCounts(rolled)[0], 're-rolled seeds fill the disc in')
      .toBeGreaterThan(bandCounts(one)[0]);
  });

  it('IT IS SEA CLUTTER: it paints on no landmass, and on no water an island '
    + 'stands in front of', () => {
    // A headland just east of the observer, well inside the haze disc.
    const isle = islandFromPolygon([
      { x: 30, y: -60 },
      { x: 70, y: -60 },
      { x: 70, y: 60 },
      { x: 30, y: 60 },
    ]);
    const g = grid(CFG);
    weather(g, [haze([isle])], CFG);
    // Nothing on the land itself.
    for (const p of [{ x: 50, y: 0 }, { x: 40, y: 30 }, { x: 60, y: -40 }]) {
      expect(pointInIsland(p, isle), 'the probe IS land').toBe(true);
      expect(sampleGrid(g, p.x, p.y).w, `haze on land at ${p.x},${p.y}`).toBe(0);
    }
    // Nor on the water in its shadow, which is still inside the disc.
    expect(sampleGrid(g, 90, 0).w, 'haze behind the headland').toBe(0);
    // ...while the open water on the other side of the ship is untouched.
    expect(sampleGrid(g, -50, 0).w, 'open water still hazes').toBeGreaterThan(0);
    // A/B: with no island field those same cells all haze, so the masking is
    // doing the work rather than the disc merely not reaching them.
    const open = grid(CFG);
    weather(open, [haze()], CFG);
    expect(sampleGrid(open, 50, 0).w, 'no island: the cell hazes').toBeGreaterThan(0);
    expect(sampleGrid(open, 90, 0).w, 'no island: the shadow cell hazes').toBeGreaterThan(0);
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

  it('THE BOUND WITH THE NOISE IN IT: even the luckiest cell of the wall\'s '
    + 'spine stays out of the red band', () => {
    // The shipped 0.6 claimed to be "below `bands[2].at` by construction" and
    // was not — 0.6 × 1.3 = 0.78 — so the storm wall out-read a hull, directly
    // against amendment 128. The bare coefficient was never the ceiling.
    expect(CFG.model.storm, 'the bare coefficient clears red').toBeLessThan(BANDS[2].at);
    expect(CFG.model.storm * WORST, 'and so does the luckiest draw')
      .toBeLessThan(BANDS[2].at);
  });

  it('RASTERIZED, WITH THE SHIPPED SPECKLE ON: the wall paints blue and green '
    + 'and NEVER red', () => {
    const g = grid(CFG);
    stampWeather(g, [stormPaint(buildStormBand(RING, OBS_Z, RADAR, 7, CFG))], CFG);
    const [green, blue, red] = bandCounts(g);
    expect(blue, 'still a blue wall under the speckle').toBeGreaterThan(0);
    expect(green, 'still a green shoulder').toBeGreaterThan(0);
    expect(red, 'weather may never out-read a hull, at any draw').toBe(0);
  });

  it('THE CELL CAP IS DERIVED, so a boon-scaled scope does not silently lose '
    + 'the wall\'s outer radii', () => {
    // `radarRange` at the call site is the BOON-SCALED stat (up to ~2.01×). The
    // retired fixed 8,000 was sized against BASE radar range, so a big scope
    // blew past it and `buildStormBand` broke BETWEEN radius walks — trimming
    // the band's outer edge, on exactly the build that paid for reach.
    const BOOSTED = Math.round(RADAR * 2.01); // ~1327u
    const ring = { cx: 0, cy: 0, r: 1200 };
    const cover = buildStormBand(ring, OBS_Z, BOOSTED, 7, CLEAN);
    expect(cover.length, 'a big ring bakes a lot of cells').toBeGreaterThan(8000);
    // NOT TRUNCATED: the band still reaches both edges all the way round. A
    // radius-walk break shows up as a band that is thin (or absent) at the
    // radii the loop never got to — i.e. the OUTER ones.
    const half = CLEAN.model.stormBandU / 2;
    const radii = cover.map((c) =>
      Math.hypot(cellCentre(c.gx, CLEAN.cellU) - ring.cx, cellCentre(c.gy, CLEAN.cellU) - ring.cy),
    );
    expect(Math.max(...radii), 'the outer edge is baked')
      .toBeGreaterThan(ring.r + half - CLEAN.cellU * 2);
    expect(Math.min(...radii), 'and so is the inner one')
      .toBeLessThan(ring.r - half + CLEAN.cellU * 2);
    // ...and the wall is a full annulus, not an arc the break left behind: every
    // quadrant of it carries cells.
    const quads = [0, 0, 0, 0];
    for (const c of cover) {
      const a = Math.atan2(cellCentre(c.gy, CLEAN.cellU) - ring.cy, cellCentre(c.gx, CLEAN.cellU) - ring.cx);
      quads[Math.min(3, Math.floor(((a + Math.PI) / (Math.PI / 2)) % 4))]++;
    }
    for (const q of quads) expect(q, 'every quadrant of the wall is baked').toBeGreaterThan(50);
  });

  it('a lowered `cellU` — the documented perf lever — does not truncate it '
    + 'either', () => {
    const fine: HeatmapOpts = { ...CLEAN, cellU: 3 };
    const cover = buildStormBand(RING, OBS_Z, RADAR, 7, fine);
    const coarse = buildStormBand(RING, OBS_Z, RADAR, 7, CLEAN);
    // Quartering the cell area roughly quadruples the cell count; under a fixed
    // 8,000 cap it would have stopped at the cap instead.
    expect(cover.length).toBeGreaterThan(coarse.length * 3);
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

// --- 10. THE WEATHER ARC STARTS AT THE ANCHOR (Story 4.10 review gate) ----------
//
// A weather paint's arc used to open at the FRAME's beam bearing — the bearing
// on the frame BEFORE the anchor crossing, i.e. a hair SHORT of the anchor.
// `stampCover` measures the swept arc as `wrapPositive(to − from)`, so once the
// beam came all the way round and landed in that sliver between `from` and the
// anchor — the last frame of most revolutions — a nearly-full arc wrapped down
// to almost nothing and the haze and the wall vanished for one frame. Anchoring
// the arc's ORIGIN makes the span `wrapPositive(to)`, which grows monotonically
// across the revolution and has nowhere to fall.

describe('a weather arc grows monotonically and never collapses for a frame', () => {
  const TURN = Math.PI * 2;
  const RING = { cx: 0, cy: 0, r: 400 };
  const OBS_W = { x: 0, y: 0 };

  it('both sources open their arc at the ANCHOR, not at the frame bearing', () => {
    const clut = openClutter(OBS_W, 0.05, 0, [], CFG.model.clutterRangeU);
    const wall = openStorm(RING, OBS_W, RADAR, 0.05, 0, 7, CLEAN);
    expect(clut.from).toBe(WEATHER_ANCHOR);
    expect(wall?.from).toBe(WEATHER_ANCHOR);
  });

  /** Lit cells of one paint, frame by frame, as the beam walks a revolution.
   *  Clutter has to be walked with the SPECKLE ON — at `noise: 0` its straddled
   *  coefficient lights nothing at all, which is the whole of amendment 133. */
  function walk(make: (to: number) => RadarPaint, opts: HeatmapOpts): number[] {
    const out: number[] = [];
    for (let to = 0.04; to < TURN; to += 0.04) {
      const g = grid(opts);
      rasterizeWeather(g, [make(to)], { now: 0, lifeMs: LIFE, alphaFloor: 0, opts });
      out.push(litCount(g));
    }
    return out;
  }

  it('the STORM WALL fills in behind the beam and never un-fills', () => {
    const cover = buildStormBand(RING, OBS_W, RADAR, 7, CLEAN);
    const counts = walk(
      (to) => ({ kind: 'storm', from: WEATHER_ANCHOR, to, full: false, t: 0, cover }),
      CLEAN,
    );
    expect(counts[counts.length - 1], 'a full wall by the end of the turn')
      .toBeGreaterThan(100);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i], `frame ${i} lost cells`).toBeGreaterThanOrEqual(counts[i - 1]);
    }
    // THE A/B, and it is what makes this a regression guard: the retired
    // bookkeeping opened the arc a frame SHORT of the anchor. Walk the same
    // revolution against a `from` of −0.04 (wrapped) and the last frames of the
    // turn collapse to a sliver.
    const bad = wrapPositive(-0.04);
    const broken = walk(
      (to) => ({ kind: 'storm', from: bad, to, full: false, t: 0, cover }),
      CLEAN,
    );
    const peak = Math.max(...broken);
    expect(Math.min(...broken.slice(-3)), 'the retired form collapses at the wrap')
      .toBeLessThan(peak * 0.1);
  });

  it('the SEA CLUTTER haze does the same', () => {
    const counts = walk((to) => openClutter(OBS_W, to, 0, [], CFG.model.clutterRangeU), CFG);
    expect(counts[counts.length - 1]).toBeGreaterThan(10);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i], `frame ${i} lost cells`).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });
});

// --- 11. LAND AND SURF DRAW ON SEPARATE BUDGETS (Story 4.10 review gate) --------

describe('surf can never starve the coastline out of the bake', () => {
  const OBS_B = { x: 0, y: -400 };

  /** A landmass big enough that land + surf together overrun one shared cap,
   *  and small enough that the SHIPPED budgets still bake it whole. */
  function bigRidge(): Island {
    return islandFromPolygon([
      { x: -210, y: -140 },
      { x: 210, y: -140 },
      { x: 210, y: 140 },
      { x: -210, y: 140 },
    ]);
  }

  /** Cells of a bake whose centre is on the island. */
  function landCount(isle: Island, cover: readonly CoverCell[]): number {
    return cover.filter((c) =>
      pointInIsland({ x: cellCentre(c.gx, CLEAN.cellU), y: cellCentre(c.gy, CLEAN.cellU) }, isle),
    ).length;
  }

  it('a big island\'s LAND coverage is byte-identical whether surf is on or off', () => {
    const isle = bigRidge();
    const roomy: HeatmapOpts = {
      ...CLEAN,
      island: { ...CLEAN.island, maxCells: 99_999, surfMaxCells: 99_999 },
    };
    // The true, untruncated answers, so the cap below can be positioned exactly
    // where a SHARED budget would have bitten and a split one does not.
    const noSurf = buildIslandCoverage(
      isle,
      [isle],
      OBS_B,
      RADAR,
      999,
      { ...roomy, model: { ...roomy.model, surfBandU: 0 } },
    );
    const wantLand = noSurf.length;
    const wantAll = buildIslandCoverage(isle, [isle], OBS_B, RADAR, 999, roomy).length;
    expect(wantLand, 'the island really does bake land').toBeGreaterThan(200);
    expect(wantAll, 'and a real surf fringe on top of it').toBeGreaterThan(wantLand + 100);

    // A cap that holds all the land and only SOME of the surf: under one shared
    // budget the fringe eats into the coastline's share, and because the scan is
    // ROW-MAJOR what the island loses is its southern rows — the least visible
    // way to lose a coastline, and therefore the worst.
    const CAP = wantLand + 50;
    const split: HeatmapOpts = {
      ...CLEAN,
      island: { ...CLEAN.island, maxCells: CAP, surfMaxCells: CAP },
    };
    const withSurf = buildIslandCoverage(isle, [isle], OBS_B, RADAR, 999, split);
    expect(landCount(isle, withSurf), 'surf changed the LAND coverage').toBe(wantLand);
    // THE PREMISE: land + surf genuinely overrun one budget of `CAP`.
    expect(wantAll, 'a shared cap would have bitten').toBeGreaterThan(CAP);
  });

  it('and the shipped budgets bake this island whole, land AND fringe', () => {
    const isle = bigRidge();
    const cover = buildIslandCoverage(isle, [isle], OBS_B, RADAR, 999, CLEAN);
    const land = landCount(isle, cover);
    expect(land, 'land is not at its cap').toBeLessThan(CLEAN.island.maxCells);
    expect(cover.length - land, 'nor is surf').toBeLessThan(CLEAN.island.surfMaxCells);
  });
});

// --- 12. THE OCCLUDER SHORTLIST COVERS THE SURF BAND TOO ------------------------

describe('cross-island LOS reaches the surf fringe (Story 4.10 review gate)', () => {
  it('an island that only crosses the corridor to a SURF cell is still '
    + 'shortlisted', () => {
    // Surf cells sit up to `surfBandU` OUTSIDE the bounding circle, so a
    // shortlist drawn at exactly `isle.r` can miss an occluder whose only
    // intersection with the observer→cell corridor lies in that annulus — and a
    // missed candidate is not a slack answer, it is a per-cell LOS test that
    // never runs at all.
    const isle = islandFromPolygon([
      { x: -40, y: 200 },
      { x: 40, y: 200 },
      { x: 40, y: 280 },
      { x: -40, y: 280 },
    ]); // centre (0, 240), r ≈ 56.6
    const obs = { x: 0, y: -400 }; // the corridor is the y-axis
    // A slab whose bounding circle stands off the corridor by MORE than
    // `slab.r + isle.r` (99.3u) and LESS than `slab.r + isle.r + surfBandU`
    // (129.3u): invisible to the un-padded shortlist, caught by the padded one.
    const slab = islandFromPolygon([
      { x: 100, y: -40 },
      { x: 130, y: -40 },
      { x: 130, y: 40 },
      { x: 100, y: 40 },
    ]); // centre (115, 0), r ≈ 42.7
    const pad = CLEAN.model.surfBandU;
    const field = [isle, slab];
    expect(slab.r + isle.r, 'the un-padded corridor misses it').toBeLessThan(slab.x);
    expect(slab.r + isle.r + pad, 'the padded one reaches it').toBeGreaterThan(slab.x);
    expect(occluderCandidates(isle, field, obs, pad), 'widened: shortlisted')
      .toContain(slab);
    // A/B: the un-padded shortlist drops it, which is the shipped defect.
    expect(occluderCandidates(isle, field, obs), 'un-padded: missed')
      .not.toContain(slab);
  });

  it('and an island genuinely between the observer and the fringe blanks it', () => {
    const isle = ridgeIsland();
    const obs = { x: 0, y: -600 };
    // A headland covering the fringe just seaward of the ridge's near coast.
    const near = islandFromPolygon([
      { x: -60, y: -420 },
      { x: 60, y: -420 },
      { x: 60, y: -340 },
      { x: -60, y: -340 },
    ]);
    const probe = { x: 0, y: -HALF_H - CLEAN.model.surfBandU / 2 };
    expect(pointInIsland(probe, isle), 'the probe is surf, not land').toBe(false);

    const alone = grid(CLEAN, obs.x, obs.y);
    stampIsland(alone, islandPaint(isle, [isle], obs, CLEAN), 1);
    expect(bandAt(alone, probe.x, probe.y), 'unoccluded control').toBeGreaterThanOrEqual(0);

    const shadowed = grid(CLEAN, obs.x, obs.y);
    stampIsland(shadowed, islandPaint(isle, [isle, near], obs, CLEAN), 1);
    expect(bandAt(shadowed, probe.x, probe.y), 'surf behind a headland').toBe(-1);
  });
});
