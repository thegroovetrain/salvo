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
  BOON_CATALOG,
  CONFIG,
  hullSilhouette,
  islandFromPolygon,
  perpendicularExtent,
  pointInIsland,
  transformPolygon,
  type BoonDef,
  type Island,
  type Vec2,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { blipLifeMs } from '../render/phosphor.js';
import {
  EMPTY_RECT,
  RECT_BUCKET,
  anchorGrid,
  anchorRect,
  bandIndex,
  bucketUp,
  buildIslandCoverage,
  cellCentre,
  cellOf,
  contactEcho,
  coverBox,
  gridCols,
  heatExtentU,
  islandBearingSpan,
  liveRect,
  makeGrid,
  maxKernelReachU,
  maxObserverSpeedU,
  quantizeInto,
  rasterize,
  sampleGrid,
  stampIsland,
  stampShip,
  unionRect,
  type CellRect,
  type CoverCell,
  type HeatGrid,
  type HeatmapOpts,
  type IslandPaint,
  type RadarPaint,
  type RasterCtx,
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
  const cover = buildIslandCoverage(isle, field, obs, RADAR, 999, opts);
  return {
    kind: 'island',
    isle,
    from: 0,
    to: 0,
    full: true, // the beam has swept the whole span
    t: 0,
    cover,
    box: coverBox(cover),
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
    const partial: IslandPaint = {
      kind: 'island',
      isle,
      from: 1.4,
      to: 1.5,
      full: false,
      t: 0,
      cover,
      box: coverBox(cover),
    };
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
    if (p !== null) stampShip(a, p, 1, RADAR, CLEAN);
    const b = grid(CLEAN);
    stampShip(b, wire, 1, RADAR, CLEAN);
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

// --- 9. NO CLIPPING, NO EXCEPTIONS (cycle 57, amendments 92-94) ------------------
//
// Eric, on the cycle-56 build: *"If it gets painted, it STAYS painted until it
// decays, NO EXCEPTIONS."* The buffer used to be allocated at half-extent
// exactly `radarRange`, so a rim paint was clipped the moment the observer
// sailed outward and came back if they sailed back — de-rendering for a reason
// that is not decay, and the THIRD violation of amendment 83 in this family.
//
// TWO THINGS ARE CONTRACT HERE, and the second is the one that will decay first:
//
//   • THE BOUND IS DERIVED AND PINNED. `heatExtentU` must cover
//     `radarRange + maxObserverSpeed × maxPaintLife`, with every term re-derived
//     BELOW from CONFIG and the boon catalog by hand — a second implementation,
//     not a call into the one under test. Retuning ship speed, `sweepRpm`,
//     `persistSweeps` or adding a speed card therefore breaks a test rather than
//     silently reintroducing the clip. This is the real deliverable: the
//     allocation itself is one line.
//
//   • THE ACTIVE SUB-RECT CANNOT DROP A CELL. The allocation is several times
//     the old square, so a frame may not touch all of it — but the region a
//     frame DOES work has to be indistinguishable from working the whole thing.
//     The guard is A/B: rasterize the same paints into a full-capacity anchor
//     and into the active rect, and compare the LIT SETS by absolute world cell.

/** The mult/add a def carries on one stat path (test-local reader — the point is
 *  to fold the catalog BY HAND rather than through effectiveStats). */
function statEffect(def: BoonDef, path: string): { mult: number; add: number } {
  let mult = 1;
  let add = 0;
  for (const e of def.effects) {
    if (e.kind !== 'stat' || e.path !== path) continue;
    mult *= e.mult ?? 1;
    add += e.add ?? 0;
  }
  return { mult, add };
}

/**
 * THE INDEPENDENT ORACLE for the worst-case observer speed: the fastest pickable
 * hull, `shipSpeed` folded multiplicatively at its full copy count, plus the
 * boost bonus with `boostMax` folded additively at its own.
 *
 * Deliberately reimplemented rather than imported. It reads the catalog's
 * numbers (so a card retune moves both sides together) but does the FOLD by
 * hand, so an error inside `effectiveStats`'s ordering, or inside this file's
 * assembly of the fit, shows up as a mismatch instead of cancelling out.
 *
 * IF A NEW SPEED CARD LANDS, this oracle must learn about it — that failure is
 * the tripwire working, not a flaky test.
 */
function oracleMaxObserverSpeed(): number {
  const hull = Math.max(
    ...Object.values(CONFIG.shipClasses).map((c) => c.kinematics.maxSpeed),
  );
  const spd = statEffect(BOON_CATALOG.shipSpeed, 'kinematics.maxSpeed');
  const bst = statEffect(BOON_CATALOG.boostMax, 'boost.speedBonus');
  const sailing = hull * spd.mult ** BOON_CATALOG.shipSpeed.copies;
  const boost = CONFIG.speedBoost.speedBonus + bst.add * BOON_CATALOG.boostMax.copies;
  return sailing + boost;
}

/** Every lit cell of a buffer keyed by ABSOLUTE world cell → band index, so two
 *  rasterizations can be compared regardless of where each one is anchored. */
function litByWorldCell(g: HeatGrid): Map<string, number> {
  const out = new Map<string, number>();
  for (let cy = 0; cy < g.rows; cy++) {
    for (let cx = 0; cx < g.cols; cx++) {
      const b = bandIndex(g.w[cy * g.cols + cx], BANDS);
      if (b >= 0) out.set(`${g.baseGx + cx},${g.baseGy + cy}`, b);
    }
  }
  return out;
}

describe('the allocation covers the derived worst case (amendment 93)', () => {
  const LIVE_LIFE = blipLifeMs(60_000 / CONFIG.vision.sweepRpm);

  it('derives the worst-case observer speed rather than writing one down', () => {
    // Same number, two folds. A hardcoded literal here would be the "bigger
    // magic number" the ruling explicitly refused.
    expect(maxObserverSpeedU()).toBeCloseTo(oracleMaxObserverSpeed(), 6);
    // Sanity on the shape of that number: strictly faster than any BASE hull,
    // because the worst case is a maxed hull under boost.
    const fastestBase = Math.max(
      ...Object.values(CONFIG.shipClasses).map((c) => c.kinematics.maxSpeed),
    );
    expect(maxObserverSpeedU()).toBeGreaterThan(fastestBase);
  });

  it('THE BOUND: the allocated extent covers radarRange + maxSpeed × paintLife', () => {
    const bound = RADAR + (oracleMaxObserverSpeed() * LIVE_LIFE) / 1000;
    const extent = heatExtentU(RADAR, LIVE_LIFE, CFG);
    expect(extent).toBeGreaterThanOrEqual(bound);
    // …and the buffer rounds UP from the extent, never down: the half-extent of
    // the square the grid actually allocates still covers it.
    const g = makeGrid(extent, CFG.cellU);
    expect((g.capCols * CFG.cellU) / 2).toBeGreaterThanOrEqual(bound);
    // The kernel overhang is in there too — a paint's CELLS reach past its
    // centre, and clipping the fringe is still clipping.
    expect(extent - bound).toBeGreaterThanOrEqual(maxKernelReachU(CFG));
  });

  it('tracks a retune: a longer paint life or a longer radar reach both grow it', () => {
    const base = heatExtentU(RADAR, LIVE_LIFE, CFG);
    expect(heatExtentU(RADAR, LIVE_LIFE * 2, CFG)).toBeGreaterThan(base);
    expect(heatExtentU(RADAR * 2, LIVE_LIFE, CFG)).toBeGreaterThan(base);
    // A shorter sweep (the sweepRpm boon) honestly shrinks it — a paint is
    // pruned against the LIVE life, so it cannot outlive the smaller bound.
    expect(heatExtentU(RADAR, LIVE_LIFE / 2, CFG)).toBeLessThan(base);
  });

  it('is meaningfully bigger than the radar-range square that used to ship', () => {
    const now = gridCols(heatExtentU(RADAR, LIVE_LIFE, CFG), CFG.cellU);
    expect(now).toBeGreaterThan(2 * gridCols(RADAR, CFG.cellU));
  });
});

describe('the ACTIVE SUB-RECT is a cost boundary, never a visibility rule', () => {
  const EXTENT = heatExtentU(RADAR, LIFE, CLEAN);
  const CTX: RasterCtx = {
    now: 0,
    lifeMs: LIFE,
    alphaFloor: 0,
    radarRange: RADAR,
    opts: CLEAN,
  };

  /** Two ship echoes and one landmass, spread across most of a radar circle. */
  function spread(): RadarPaint[] {
    const isle = ridgeIsland();
    const cover = buildIslandCoverage(isle, [isle], { x: 0, y: 0 }, RADAR, 7, CLEAN);
    return [
      { kind: 'ship', id: 'a', x: 0, y: 600, ext: 100, bearing: Math.PI / 2, dist: 600, t: 0, seed: 1 },
      { kind: 'ship', id: 'b', x: -500, y: -260, ext: 80, bearing: 3.6, dist: 563, t: 0, seed: 2 },
      { kind: 'island', isle, from: 0, to: 0, full: true, t: 0, cover, box: coverBox(cover) },
    ];
  }

  it('rasterizes EXACTLY what the full buffer would — same lit cells, same '
    + 'bands — while touching a fraction of it', () => {
    const paints = spread();
    const full = makeGrid(EXTENT, CLEAN.cellU);
    anchorGrid(full, 0, 0);
    rasterize(full, paints, CTX);

    const active = makeGrid(EXTENT, CLEAN.cellU);
    const rect = liveRect(active, paints, CTX);
    expect(rect).not.toBeNull();
    anchorRect(active, rect as CellRect);
    rasterize(active, paints, CTX);

    const before = litByWorldCell(full);
    expect(before.size).toBeGreaterThan(0);
    expect(litByWorldCell(active)).toEqual(before);
    // …and that agreement is bought for a fraction of the cells.
    expect(active.cols * active.rows).toBeLessThan(full.capCols * full.capCols / 4);
  });

  it('follows the paints, not the observer: nearby contacts cost a small rect '
    + 'no matter how big the allocation is', () => {
    const near: RadarPaint[] = [0, 1, 2].map((i) => ({
      kind: 'ship',
      id: `n${i}`,
      x: i * 40,
      y: 60,
      ext: 60,
      bearing: 1.2,
      dist: 90,
      t: 0,
      seed: i,
    }));
    const g = makeGrid(EXTENT, CLEAN.cellU);
    anchorRect(g, liveRect(g, near, CTX) as CellRect);
    // The whole cluster spans ~200u; one bucket of cells covers it.
    expect(g.cols).toBeLessThanOrEqual(2 * RECT_BUCKET);
    expect(g.rows).toBeLessThanOrEqual(2 * RECT_BUCKET);
    // And the frame's work is a small fraction of even the OLD square.
    expect(g.cols * g.rows).toBeLessThan(gridCols(RADAR, CLEAN.cellU) ** 2);
  });

  it('contains every cell a stamper writes, including the kernel fringe', () => {
    const p: ShipPaint = {
      kind: 'ship', id: 'k', x: 12, y: -7, ext: 124, bearing: 0.3, dist: 0, t: 0, seed: 3,
    };
    const g = makeGrid(EXTENT, CLEAN.cellU);
    anchorRect(g, liveRect(g, [p], CTX) as CellRect);
    rasterize(g, [p], CTX);
    // Nothing was dropped at the rim: the same paint into the full buffer lights
    // exactly the same cells.
    const full = makeGrid(EXTENT, CLEAN.cellU);
    anchorGrid(full, p.x, p.y);
    rasterize(full, [p], CTX);
    expect(litByWorldCell(g)).toEqual(litByWorldCell(full));
  });

  it('is null when nothing is live, and an empty grid samples as transparent', () => {
    const g = makeGrid(EXTENT, CLEAN.cellU);
    const dead: ShipPaint = {
      kind: 'ship', id: 'd', x: 0, y: 100, ext: 100, bearing: 1.57, dist: 100,
      t: -LIFE - 1, seed: 4,
    };
    expect(liveRect(g, [], CTX)).toBeNull();
    expect(liveRect(g, [dead], CTX)).toBeNull();
    anchorRect(g, EMPTY_RECT);
    expect(bandAt(g, 0, 100)).toBe(-1);
  });

  it('rounds out to whole buckets so the texture size stops churning', () => {
    expect(bucketUp(1, RECT_BUCKET)).toBe(RECT_BUCKET);
    expect(bucketUp(RECT_BUCKET, RECT_BUCKET)).toBe(RECT_BUCKET);
    expect(bucketUp(RECT_BUCKET + 1, RECT_BUCKET)).toBe(2 * RECT_BUCKET);
    expect(bucketUp(7, 1)).toBe(7);
    // A one-cell drift in a paint's footprint must not move the rect SIZE.
    const g = makeGrid(EXTENT, CLEAN.cellU);
    const at = (y: number): number => {
      const p: ShipPaint = {
        kind: 'ship', id: 'p', x: 0, y, ext: 90, bearing: 1.57, dist: 300, t: 0, seed: 5,
      };
      return (liveRect(g, [p], CTX) as CellRect).cols;
    };
    expect(at(300)).toBe(at(300 + CLEAN.cellU));
  });

  it('unions rects and ignores empty ones', () => {
    const a: CellRect = { gx0: 0, gy0: 0, cols: 4, rows: 4 };
    const b: CellRect = { gx0: 10, gy0: -3, cols: 2, rows: 2 };
    expect(unionRect(a, b)).toEqual({ gx0: 0, gy0: -3, cols: 12, rows: 7 });
    expect(unionRect(a, EMPTY_RECT)).toEqual(a);
    expect(unionRect(null, EMPTY_RECT)).toBeNull();
    expect(unionRect(null, b)).toEqual(b);
  });

  it('coverBox bounds a landmass exactly', () => {
    const cover: CoverCell[] = [
      { gx: 3, gy: -2, i: 1, b: 0 },
      { gx: 7, gy: 5, i: 1, b: 0 },
      { gx: 5, gy: 1, i: 1, b: 0 },
    ];
    expect(coverBox(cover)).toEqual({ gx0: 3, gy0: -2, cols: 5, rows: 8 });
    expect(coverBox([])).toEqual({ gx0: 0, gy0: 0, cols: 0, rows: 0 });
  });
});
