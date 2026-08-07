// THE WORLD FIELD THE BEAM MARCHES THROUGH (cycle 62, amendments 138-142) —
// pure, no Pixi, no config import, no state beyond the frozen record it is built
// from.
//
// THE INVERSION THIS FILE EXISTS FOR. Until cycle 61 the radar asked each OBJECT
// what it looked like and baked a per-object coverage list. That primitive could
// not express the story: Eric, on the shipped build, *"What I wanted you to
// accomplish was to have the radar correctly paint EVERYTHING it sweeps over."*
// So radar now asks each BEARING what is out there — and this module is the ONE
// place that answers "what is at (x, y)?".
//
// ONE SEAM, ONE ANSWER, AND THE ANSWER CARRIES ITS OWN PHYSICS. A `FieldSample`
// names the material's REFLECTIVITY and its GEOMETRY CLASS (point / surface /
// volume, render/radarFalloff.ts), so the march never decides what kind of thing
// it hit — it multiplies what it was handed. That is amendment 106 (reflectivity
// x falloff-by-geometry) made structural, and it is what stops a fifth return
// source arriving with a private attenuation formula.
//
// FIVE LAYERS, ONE PRIORITY ORDER (strongest scatterer first):
//
// PRIORITY IS NOT A STRICT ORDER BETWEEN LAND AND STEEL (cycle-62 review gate).
// The first two layers below occupy the same cells whenever a hull hugs a
// coastline, and a strict terrain-first chain suppressed the SHIP there — which
// silently breaks amendment 127's `minPeak` guarantee on exactly the water where
// captains hide. When both answer, the field returns the STRONGER RETURN AT THAT
// RANGE (`strongerAt`), which is the only comparison that means anything when the
// two materials sit on different falloff exponents. Everything below layer 2 is
// mutually exclusive by construction and stays a strict chain.
//
//   1. TERRAIN — from `sampleHeight` on the cycle-59 raster, CONTINUOUSLY
//      (amendment 142). The raster already carries 256 levels and is an O(1)
//      `Uint8Array` read; terracing it to the four contour bands would cost an
//      extra comparison chain to DISCARD 98% of the elevation data, would step
//      Story 4.11's shadow lengths, and is unnecessary anyway — on a continuous
//      field a colour-band boundary IS an iso-height line, so the regions land on
//      the contours by construction. NO CONTOUR POLYGON IS EVER READ. Nor is any
//      island polygon: `sampleHeight > 0` IS the land test (the generator seals
//      closure land at height 1, so land and sea are exactly separated), which is
//      also why this module needs no bounding-circle broadphase.
//   2. SHIPS — a per-frame CELL-INDEXED STAMP (amendment 141). A hull's return
//      falls out of its actual footprint in the raster the same way terrain's
//      does; there is no bespoke ellipse kernel any more. The stamp is built once
//      per frame precisely so the march never tests a polygon per sample.
//   3. THE STORM WALL and 5. SEA CLUTTER — folded in from render/radarSources.ts
//      as materials rather than as independent paint kinds.
//   4. SURF (cycle 62 review gate — restored as a field material after falling
//      out with the per-object island bake it used to ride on; Story 4.10's
//      amendment 131 ratified its shape). A water sample within `surfBandU` of
//      land is a weak breaking-surf echo. THE PROXIMITY TEST IS ONE EXTRA
//      PYRAMID READ, NOT A SCAN: `tileCeilingAt` — the cycle-59 max-height
//      pyramid built for exactly this class of query — is read once, at the
//      level whose tile size is closest to `surfBandU` (`surfPyramidLevel`,
//      resolved once per field build, never per sample). If that tile's
//      ceiling sits above sea level, land is somewhere in it, so the sample
//      paints surf. No neighbourhood of raster cells is ever scanned and no
//      island-membership polygon test is ever run — this stays off the paint
//      path exactly as it is off terrain's own land test one layer up. The
//      strength is FLAT across the band, which is a known gap against amendment
//      131's ruled seaward taper: `surfSample` records why the read cannot
//      express one and what changing that would cost.
//
// NOTHING OCCLUDES ANYTHING (amendment 140). There is no near-face terminator, no
// cross-island LOS filter and no clutter occluder mask in this file: a sample
// paints on the far side of a landmass, and behind another landmass, exactly as
// it does on the near face. This is a KNOWING, TEMPORARY regression against the
// 2026-08-02 "islands block every sensor" ruling, scoped to the radar PAINT LAYER
// and accepted on the explicit promise that Story 4.11 restores it as a
// height-derived shadow length along this same ray — a strictly better answer
// than the binary segment tests being removed. NO SERVER-SIDE SENSOR GATE MOVES:
// `blipGate`, `pointSighted`, `pointDetected`, the muzzle and smoke halos and the
// foghorn muffle all still enforce LOS and are untouched.
//
// A FIELD IS A FROZEN RECORD (amendment 83). Everything it can answer — the
// observer the clutter disc hangs on, the ring the wall tracks, where every hull
// is — is captured when the field is BUILT, and a march freezes its samples into
// a slice at creation. Nothing downstream re-evaluates any of it against live
// state. Nothing viewport-derived reaches this file at all (amendment 97): not
// one function here takes a camera, a zoom or a viewport.

import {
  hullSilhouette,
  perpendicularExtent,
  pointInPolygon,
  sampleHeight,
  SEA_HEIGHT,
  tileCeilingAt,
  tileSize,
  transformPolygon,
  type HeightRaster,
  type HullId,
  type Vec2,
} from '@salvo/shared';
import { POINT, SURFACE, attenuation, heightReflectivity } from './radarFalloff.js';
import { cellCentre, cellOf, type ReturnModelOpts } from './radarHeatmap.js';
import { clutterSample, stormSample, type StormRing } from './radarSources.js';

/**
 * What the world is made of at one point.
 *
 * The march multiplies `refl` by `attenuation(dist, ref, geom, floor)` and floors
 * the product at `min`. Every field layer answers in these terms and no layer
 * carries a private curve — that is the whole of amendment 106's "one return
 * model" as an interface.
 */
export interface FieldSample {
  /** Material reflectivity coefficient (0-1), before any range term. */
  refl: number;
  /** The target's GEOMETRY, which chooses the falloff exponent — never its name
   *  (amendment 105: colour is intensity, never category). */
  geom: number;
  /** Reference range (u) of that geometry's curve. */
  ref: number;
  /** Asymptotic floor of that curve. */
  floor: number;
  /** Floor on the FINAL intensity — non-zero only for hulls, where amendment
   *  127's guarantee lives: nothing the server blips ever paints nothing. */
  min: number;
}

/**
 * The one query the march makes. `null` is open water: nothing to return.
 *
 * `dist` is the sample's range from the observer, and it is here for exactly ONE
 * reason: when a hull's footprint lands on land cells, the field has to answer
 * with whichever of the two actually returns more, and "more" is only defined at
 * a range (a hull is 1/d⁴ and a coast is 1/d³, so the winner genuinely swaps).
 * It is NOT an intensity channel — the march still applies the whole range term
 * itself, and every layer still answers in pure material terms.
 */
export interface RadarField {
  sampleAt(x: number, y: number, dist?: number): FieldSample | null;
}

/**
 * Row stride of the ship stamp's numeric cell key. A world cell index is bounded
 * by `mapRadius / cellU` (a few hundred), so `gy * KEY_ROW + gx` is injective for
 * anything the generator can produce and costs nothing next to a string key.
 * Carried over verbatim from the storm bake's own key, for the same reason.
 */
const KEY_ROW = 1_000_000;

/** The cell key used by every stamp in this module. */
export function cellKey(gx: number, gy: number): number {
  return gy * KEY_ROW + gx;
}

/** The per-frame ship layer: absolute world cell -> that hull's sample. */
export type ShipStamp = Map<number, FieldSample>;

/** The part of a `Contact` a hull footprint is built from: where it is and the
 *  two fields `hullSilhouette` + `perpendicularExtent` need. Deliberately a
 *  structural subset of `Contact`, so this module never imports the wire type or
 *  the snapshot layer. */
export interface EchoHull {
  id: string;
  x: number;
  y: number;
  heading: number;
  cls: HullId;
}

/** Scratch polygon for hull footprints — consumed synchronously inside the
 *  stamp, never retained, so one array serves every hull on the scope. */
const HULL_SCRATCH: Vec2[] = [];

/**
 * Write one ship cell, MAX-WINS — the same rule `writeCell` applies one level
 * down, and the reason it has to be stated here too is that `Map.set` is
 * LAST-WINS. Two hulls overlapping one cell (a shadowing pair, a hull alongside a
 * decoy) let iteration ORDER decide the reading, so the weaker of the two could
 * overwrite the stronger purely because it came later in the contact list.
 *
 * COMPARING `refl` IS COMPARING THE RETURN. Every hull sample shares one geometry
 * class, one reference range and one floor (`hullSample`), so the coefficient
 * orders them identically at every range — there is no exponent swap to worry
 * about the way there is between steel and rock.
 */
function putShip(stamp: ShipStamp, key: number, s: FieldSample): void {
  const cur = stamp.get(key);
  if (cur !== undefined && cur.refl >= s.refl) return;
  stamp.set(key, s);
}

/**
 * A HULL'S MATERIAL (amendments 118 + 127, unchanged in substance from the
 * cycle-61 peak).
 *
 * `ext` is the aspect-projected extent, so a bow-on hull genuinely returns less
 * than a broadside one at the same range — aspect is still a strength channel and
 * not merely a size one (amendment 127 is explicit about that). `strongExtent`
 * normalizes it and is the same constant the red->blue crossover is FITTED
 * against, which is why the fit still holds after the kernel that used to apply
 * it was deleted. `minPeak` is the floor that makes radar range mean ONE number
 * for every hull: dropping it so signature becomes stealth is a ruled-out design,
 * not a missing feature.
 */
export function hullSample(ext: number, m: ReturnModelOpts): FieldSample {
  const strong = m.strongExtent > 0 ? m.strongExtent : 1;
  return {
    refl: (m.ship * Math.max(0, ext)) / strong,
    geom: POINT,
    ref: m.pointRef,
    floor: m.pointFloor,
    min: m.minPeak,
  };
}

/** Terrain's material at a quantized height (amendment 129's reflectivity, the
 *  half of it that survives the depth term's deletion — see the module header). */
export function terrainSample(h: number, m: ReturnModelOpts): FieldSample {
  return {
    refl: heightReflectivity(h, m),
    geom: SURFACE,
    ref: m.surfaceRef,
    floor: m.floor,
    min: 0,
  };
}

/**
 * THE PYRAMID LEVEL SURF READS (module header, layer 4). Chosen ONCE per field
 * build — never per sample, which is what keeps the proximity test O(1) — as
 * the level whose `tileSize` is closest to `surfBandU`. A raster with no
 * pyramid (an empty `pyramid` array, as some test fixtures deliberately ship)
 * answers level 0, and `tileCeilingAt` treats an out-of-range level as sea
 * level, so surf simply never fires rather than reading off nothing.
 */
export function surfPyramidLevel(raster: HeightRaster, surfBandU: number): number {
  let level = 0;
  let bestDiff = Infinity;
  for (let lvl = 0; lvl < raster.pyramid.length; lvl++) {
    const diff = Math.abs(tileSize(raster, lvl) - surfBandU);
    if (diff < bestDiff) {
      bestDiff = diff;
      level = lvl;
    }
  }
  return level;
}

/**
 * SURF'S MATERIAL (module header, layer 4; Story 4.10 amendment 131). Callers
 * only ever reach this on a WATER sample (`buildField` has already tried
 * `terrainSample` and failed), so this never re-samples height at `(x, y)` —
 * it only asks whether the sample's own pyramid TILE has land in it anywhere,
 * at the level `surfPyramidLevel` already resolved for the whole field.
 *
 * THE BAND IS TILE-ALIGNED, NOT A TRUE RADIAL DISTANCE, and that is an
 * intentional trade recorded here so it is never "corrected" into a
 * per-sample distance transform: a tile is a fixed square, so a water sample
 * near a tile's corner can be lit by land closer to a NEIGHBOURING tile that
 * this read never sees, and the fringe's width varies a little around the
 * coast as the tile grid falls where it falls. Surf is a decorative fringe,
 * not a ranging instrument, and the pyramid's own grain hides the tiling.
 *
 * THE STRENGTH IS FLAT ACROSS THE BAND, AND AMENDMENT 131 RULED A *WEAK SEAWARD
 * FRINGE*, so this is a ruled taper that is deliberately NOT implemented rather
 * than one that was forgotten — recorded at the cycle-62 review gate, which
 * caught it missing. THE READ CANNOT EXPRESS ONE. The band is exactly one pyramid
 * tile: at the shipped numbers `surfPyramidLevel` answers level 1, whose tile is
 * 28u — i.e. TWO raster samples on a side, against a 14u raster spacing. So every
 * water sample that paints surf is within one raster sample of land on the axis,
 * and there is no finer read anywhere in the raster or the pyramid to grade it
 * with: pyramid level 0 IS the raster cell, and a surf sample's own cell is water
 * by construction. Producing a genuine seaward gradient would need EITHER a
 * per-sample distance transform (the thing this seam exists to avoid, and a
 * per-frame cost on every water cell on the scope) OR a wider fringe from the
 * next pyramid level up, which doubles the ratified `surfBandU` and is a design
 * change requiring a ruling. Neither is a review-gate call, so the flat band
 * ships and the gap is stated here.
 */
export function surfSample(
  raster: HeightRaster,
  level: number,
  x: number,
  y: number,
  m: ReturnModelOpts,
): FieldSample | null {
  if (tileCeilingAt(raster, level, x, y) <= SEA_HEIGHT) return null;
  return { refl: m.surf, geom: SURFACE, ref: m.surfaceRef, floor: m.floor, min: 0 };
}

/** Cell-space bounding box of a world-space box, as [gx0, gy0, gx1, gy1]. */
function cellBox(minX: number, minY: number, maxX: number, maxY: number, cellU: number): number[] {
  return [cellOf(minX, cellU), cellOf(minY, cellU), cellOf(maxX, cellU), cellOf(maxY, cellU)];
}

/**
 * Stamp a hull's real footprint: every cell whose centre lies inside the posed
 * silhouette, plus the cell the hull's own centre is in.
 *
 * THE SILHOUETTE IS THE FOOTPRINT (amendment 141). It is the SHARED polygon —
 * the same one the hull renderer draws and the server hit-tests — posed through
 * the shared `transformPolygon` and tested with the shared `pointInPolygon`. No
 * polygon math is re-implemented here and no bounding circle stands in for a
 * hull. The centre write is the same fail-safe the retired kernel carried: a
 * torpedo boat seen end-on is narrower than a cell, and a return always lights
 * the cell it is in.
 */
export function stampHull(stamp: ShipStamp, h: EchoHull, s: FieldSample, cellU: number): void {
  const local = hullSilhouette(h.cls);
  if (local === undefined) return; // unknown hull id paints nothing, never throws
  const poly = transformPolygon(local, h.x, h.y, h.heading, HULL_SCRATCH);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const [gx0, gy0, gx1, gy1] = cellBox(minX, minY, maxX, maxY, cellU);
  for (let gy = gy0; gy <= gy1; gy++) {
    const y = cellCentre(gy, cellU);
    for (let gx = gx0; gx <= gx1; gx++) {
      const x = cellCentre(gx, cellU);
      if (pointInPolygon({ x, y }, poly)) putShip(stamp, cellKey(gx, gy), s);
    }
  }
  putShip(stamp, cellKey(cellOf(h.x, cellU), cellOf(h.y, cellU)), s);
}

/**
 * Stamp a WIRE echo's footprint: the aspect extent laid across the bearing, one
 * resolution cell deep.
 *
 * A wire blip carries `ext` and nothing else — no class, no heading — and that is
 * a perception-invariant surface, not an oversight. So its footprint is exactly
 * what the wire describes: `ext` units ACROSS the observer's bearing, and one
 * cell ALONG it, which is the scope's own range resolution. There is no kernel
 * knob here on purpose; the retired `minExtent`/`depthFrac`/`minDepth` trio
 * invented a shape the wire never claimed. A sub-cell extent still lights its own
 * cell, for the same reason `stampHull` writes its centre.
 *
 * THE FOOTPRINT IS 4-CONNECTED, NOT MERELY SAMPLED (cycle-62 review gate). Points
 * half a cell apart along a DIAGONAL bearing can land in cells that touch only at
 * a corner, and a ray crossing between them then finds nothing — a hole in the
 * one paint amendment 127 guarantees. The step is under a cell on each axis, so
 * consecutive cells differ by at most one index per axis; writing the corner cell
 * whenever BOTH indices moved bridges the diagonal exactly, at the cost of one
 * extra map write per turn of the staircase.
 */
export function stampEcho(
  stamp: ShipStamp,
  x: number,
  y: number,
  bearing: number,
  ext: number,
  s: FieldSample,
  cellU: number,
): void {
  const half = Math.max(0, ext) / 2;
  const ax = -Math.sin(bearing); // across the bearing
  const ay = Math.cos(bearing);
  const step = cellU / 2;
  let lastX = Number.NaN;
  let lastY = Number.NaN;
  for (let t = -half; t <= half; t += step) {
    const gx = cellOf(x + ax * t, cellU);
    const gy = cellOf(y + ay * t, cellU);
    if (gx !== lastX && gy !== lastY && !Number.isNaN(lastX)) putShip(stamp, cellKey(gx, lastY), s);
    putShip(stamp, cellKey(gx, gy), s);
    lastX = gx;
    lastY = gy;
  }
  putShip(stamp, cellKey(cellOf(x, cellU), cellOf(y, cellU)), s);
}

/**
 * THE PER-FRAME SHIP LAYER, from the hulls the client already holds.
 *
 * BOTH PAINT SOURCES FEED ONE STAMP (amendment 141). Inside truesight the client
 * synthesizes a hull from its `Contact` (the server deliberately sends no blip
 * for a hull it is already sending as a contact — `blipGate` excludes
 * `dist <= sightRange`, a perception-invariant surface that is untouched here);
 * beyond it, a wire echo is stamped from `ext`. Neither can double-stamp one
 * hull, because the two ranges are exact complements about the same
 * dazzle-scaled radius.
 */
export function buildShipStamp(
  hulls: readonly EchoHull[],
  obs: Vec2,
  m: ReturnModelOpts,
  cellU: number,
): ShipStamp {
  const stamp: ShipStamp = new Map();
  for (const h of hulls) {
    const local = hullSilhouette(h.cls);
    if (local === undefined) continue;
    const bearing = Math.atan2(h.y - obs.y, h.x - obs.x);
    stampHull(stamp, h, hullSample(echoExtent(local, h.heading, bearing), m), cellU);
  }
  return stamp;
}

/** Scratch for the extent computation — the mirror of the server's own
 *  `EXT_SCRATCH` (game/signals.ts), consumed synchronously. */
const EXT_SCRATCH: Vec2[] = [];

/**
 * The aspect-projected extent of a hull, computed EXACTLY as the server computes
 * it for a wire blip: the SHARED `perpendicularExtent` over the silhouette posed
 * at the origin with the hull's heading. Same input, same function, same answer —
 * an echo does not change character when a hull crosses the boundary between the
 * two sources.
 */
function echoExtent(local: readonly Vec2[], heading: number, bearing: number): number {
  return perpendicularExtent(transformPolygon(local, 0, 0, heading, EXT_SCRATCH), bearing);
}

/** Everything a field is FROZEN from at build time (amendment 83). */
export interface FieldSpec {
  /** The observer, as of this frame — the sea-clutter haze hangs on it. */
  obs: Vec2;
  /** The cycle-59 height raster, or null for a caller that has none (in which
   *  case the field carries no terrain at all rather than guessing at one). */
  raster: HeightRaster | null;
  /** The per-frame ship layer. */
  ships: ShipStamp;
  /** The LIVE storm ring, or null when the timeline is not anchored. Only the
   *  live ring is a physical object; the dashed next-ring telegraph is a chart
   *  annotation and must never return an echo (amendment 128). */
  ring: StormRing | null;
  cellU: number;
  model: ReturnModelOpts;
}

/** The ship layer's answer at a point, or null. */
function shipAt(f: FieldSpec, x: number, y: number): FieldSample | null {
  if (f.ships.size === 0) return null;
  return f.ships.get(cellKey(cellOf(x, f.cellU), cellOf(y, f.cellU))) ?? null;
}

/** The return one sample would make at `dist`, before grain — the same
 *  expression `returnStrength` evaluates, kept here so the field can compare two
 *  materials without importing the march (which imports this module). */
function returnAt(s: FieldSample, dist: number): number {
  return Math.max(s.min, s.refl * attenuation(dist, s.ref, s.geom, s.floor));
}

/**
 * THE SOLID LAYERS — terrain and steel — as ONE answer.
 *
 * A hull hugging a coastline puts both in the same cell, and a strict
 * terrain-first chain suppressed the hull there: a battleship alongside a mudflat
 * read as mudflat, which is amendment 127's `minPeak` guarantee broken on the
 * exact water where captains go to hide. So when both answer, the STRONGER
 * RETURN AT THIS RANGE wins. It has to be at a range: steel falls off as 1/d⁴ and
 * rock as 1/d³, so a comparison of bare coefficients would pick the wrong one at
 * one end of the scope or the other.
 */
function solidAt(f: FieldSpec, x: number, y: number, dist: number): FieldSample | null {
  const h = f.raster === null ? 0 : sampleHeight(f.raster, x, y);
  const ship = shipAt(f, x, y);
  if (!(h > 0)) return ship;
  const land = terrainSample(h, f.model);
  if (ship === null) return land;
  return returnAt(ship, dist) >= returnAt(land, dist) ? ship : land;
}

/**
 * Build the queryable field. The returned object closes over the frozen spec and
 * holds no mutable state of its own, so a march can be replayed against it and
 * answer identically.
 *
 * PRIORITY IS BY DOMINANT SCATTERER — with the two SOLID layers resolved by
 * strength rather than by rank (`solidAt`), because they genuinely share cells
 * and a strict order there suppressed hulls against coastlines. The rest of the
 * ordering is also the cost ordering:
 * terrain is one `Uint8Array` read, the ship stamp is one `Map` probe skipped
 * entirely when no hull is on the scope, the storm wall is scalar arithmetic,
 * surf is one MORE `Uint8Array`-backed pyramid read (paid only on a water
 * sample the first three layers already rejected), and clutter is scalar
 * arithmetic. A cell can only be one material, so sea clutter can never paint
 * on a landmass — which is the "clutter is SEA state" rule holding
 * STRUCTURALLY, with no polygon test and no occluder shortlist (amendment 140
 * deleted the shortlist; this is why nothing was lost with it). SURF RANKS
 * ABOVE CLUTTER AND BELOW TERRAIN, by construction: it is only ever tried
 * after `terrainSample` has already failed (a land sample is land, never
 * surf) and before `clutterSample` (a breaking coastline is a stronger
 * scatterer than open sea state, amendment 131).
 *
 * `surfPyramidLevel` is resolved ONCE here, not per sample — the whole point
 * of the pyramid seam is that the proximity test costs one read, not a scan.
 */
export function buildField(f: FieldSpec): RadarField {
  const m = f.model;
  const surfLevel = f.raster === null ? -1 : surfPyramidLevel(f.raster, m.surfBandU);
  return {
    sampleAt(x: number, y: number, dist = 0): FieldSample | null {
      const solid = solidAt(f, x, y, dist);
      if (solid !== null) return solid;
      const storm = f.ring === null ? null : stormSample(f.ring, x, y, m);
      if (storm !== null) return storm;
      const surf = f.raster === null ? null : surfSample(f.raster, surfLevel, x, y, m);
      if (surf !== null) return surf;
      return clutterSample(f.obs, x, y, m);
    },
  };
}

/**
 * A field carrying ONE ship layer and nothing else.
 *
 * This is how a wire echo reaches the paint list without a second code path: the
 * server has ALREADY sweep-gated it (`blipGate` fires on the tick the beam
 * crosses the hull), so the client cannot wait for its own beam to come round
 * without painting the hull a whole revolution stale — but the intensity, the
 * noise, the slice record and the stamping are all still the march's, applied to
 * a field that contains only that hull. One model, one primitive, one list.
 */
export function shipOnlyField(ships: ShipStamp, cellU: number): RadarField {
  return {
    sampleAt(x: number, y: number): FieldSample | null {
      if (ships.size === 0) return null;
      return ships.get(cellKey(cellOf(x, cellU), cellOf(y, cellU))) ?? null;
    },
  };
}
