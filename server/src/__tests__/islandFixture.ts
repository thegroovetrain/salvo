// Test-only island fixtures (cycle 51 — fractal polygon coastlines).
//
// Before cycle 51 every server test that needed terrain wrote a literal
// `{ x, y, r }` circle. Islands are polygons now, so those fixtures are ported
// through THIS helper rather than hand-rolling vertices per test — each test's
// original intent (which segment is blocked, where the rim sits, how much
// clearance a point has) is preserved because the polygon is a regular n-gon
// whose INRADIUS is exactly `r`.
//
// WHY inradius and not circumradius: the phase is chosen so an EDGE MIDPOINT —
// not a vertex — sits on each cardinal axis, and every edge midpoint is at
// exactly `r` from the centre. Virtually every ported fixture reasons along an
// axis ("a rock on the +x flight path", "rim at x=3"), so those comments stay
// literally true to the unit. Off-axis the coastline bulges by at most
// r·(sec(π/SIDES) − 1) ≈ 3e-4·r — far below any assertion tolerance in the
// suite. Segments along an axis through the centre therefore cross edge
// interiors, never a vertex, which keeps the polygon predicates off their
// degenerate case.
//
// A useful consequence: islandFromPolygon derives `core` (largest disc about
// the pole of inaccessibility fully inside the polygon) = the inradius = `r`,
// so islandBlocksSegment's `core` early-out reproduces the OLD circle LOS
// answer exactly for any segment that reaches within `r` of the centre — the
// regular polygon's pole of inaccessibility coincides with its centroid, so
// `pole` lands exactly at `(x, y)` too.

import { buildHeightRaster, islandFromPolygon, type HeightRaster, type Island } from '@salvo/shared';

/** Vertex count for a fixture coastline. High enough that the polygon is a
 *  circle to within 3e-4 of its radius, cheap enough for unit tests. */
const SIDES = 128;

/**
 * A near-circular island fixture: centre `(x, y)`, coastline exactly `r` from
 * the centre along every cardinal axis (see the module note). The polygon is
 * regular, so its pole of inaccessibility lands exactly at `(x, y)` too —
 * push-out and `Island.x/y`/`Island.pole` are all exact.
 */
export function circleIsland(x: number, y: number, r: number, sides = SIDES): Island {
  const phase = Math.PI / sides;
  const circum = r / Math.cos(phase);
  const poly = Array.from({ length: sides }, (_, i) => {
    const a = phase + (i * 2 * Math.PI) / sides;
    return { x: x + Math.cos(a) * circum, y: y + Math.sin(a) * circum };
  });
  return islandFromPolygon(poly);
}

// ---------------------------------------------------------------------------
// Height-raster fixtures (Story 4.11 — the radar blip gate's shadow seam).
//
// THE TRAP THESE EXIST TO CLOSE: a `circleIsland` above is polygon geometry
// ONLY — it has NO presence in the map's height raster, so as of Story 4.11
// it blocks SIGHT (binary island LOS) but casts NO radar shadow. And clearing
// `w.map.islands` leaves the REAL generated raster in place, so an "empty"
// fixture world would silently shadow radar off terrain the test believes is
// absent. Any test whose intent involves radar occlusion (or its absence)
// must therefore control the raster EXPLICITLY:
//
//   w.map.heightRaster = flatRaster();                       // open water
//   w.map.heightRaster = rasterFrom(700, ridgeField(200, 0, 40, 40));  // hard cover
//
// Heights are in the raster's own 0-255 quantized units; the mast threshold
// is CONFIG.vision.radarMastQ = 64 (h ≥ 64 is hard cover — dark to the rim on
// that bearing; 0 < h < 64 is soft cover with a derived residual reach; h = 0
// never shadows). Mirrors the client suite's rasterFrom/ridge fixture, but
// built through the REAL buildHeightRaster so the max-height pyramid the
// production march skips open water with is present and correct.
// ---------------------------------------------------------------------------

/** The shipped generator's height-field sample spacing (TERRAIN_PARAMS.cell). */
const RASTER_CELL = 14;

/** Quantized height (0-255) at a world point — a raster fixture's terrain. */
export type HeightAt = (x: number, y: number) => number;

/**
 * A synthetic HeightRaster covering the square [±reachU]² about the origin,
 * sampled from `h` at the production 14u cell spacing, with a REAL max-height
 * pyramid (via buildHeightRaster — seaLevel 0 / peak 255 makes the quantizer
 * the identity on 0-255 inputs). Everything off the square is transparent sea
 * (the march's documented off-raster rule), so a modest `reachU` is enough
 * for any directed case.
 */
export function rasterFrom(reachU: number, h: HeightAt): HeightRaster {
  const k = Math.ceil(reachU / RASTER_CELL);
  const n = 2 * k + 1;
  const x0 = -k * RASTER_CELL;
  const v = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) v[j * n + i] = h(x0 + i * RASTER_CELL, x0 + j * RASTER_CELL);
  }
  return buildHeightRaster({ n, cell: RASTER_CELL, x0, y0: x0, v }, 0, 255);
}

/** An all-sea raster: NO radar shadow anywhere — the explicit statement of
 *  intent for every fixture world that clears `map.islands`. */
export function flatRaster(reachU = 700): HeightRaster {
  return rasterFrom(reachU, () => 0);
}

/** A rectangular obstruction |x−cx| ≤ hw, |y−cy| ≤ hh at uniform quantized
 *  height `q` (default 255: unambiguous hard cover), sea everywhere else. */
export function ridgeField(cx: number, cy: number, hw: number, hh: number, q = 255): HeightAt {
  return (x: number, y: number): number =>
    Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh ? q : 0;
}
