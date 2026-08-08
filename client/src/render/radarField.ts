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
  coverageHas,
  paintCoverage,
  perpendicularExtent,
  sampleHeight,
  SEA_HEIGHT,
  tileCeilingAt,
  tileSize,
  type HeightRaster,
  type HullCoverage,
  type HullId,
  type Vec2,
} from '@salvo/shared';
import { POINT, SURFACE, attenuation, heightReflectivity } from './radarFalloff.js';
import { cellOf, type ReturnModelOpts } from './radarHeatmap.js';
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
 * `ext` is the aspect-projected extent — since cycle 63 the mask-derived
 * `coverageExtent`, as the wire no longer states a scalar — so a bow-on hull
 * genuinely returns less than a broadside one at the same range: aspect is
 * still a strength channel and not merely a size one (amendment 127 is
 * explicit about that). `strongExtent`
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

/** World centre of a coverage footprint's cell rect. */
export function coverageCentre(cov: HullCoverage, cellU: number): Vec2 {
  return { x: (cov.gx + cov.w / 2) * cellU, y: (cov.gy + cov.h / 2) * cellU };
}

/** Vec2 pool for `coverageExtent` — grow-only, NEVER truncated (the cycle-63
 *  review gate found the old single-array version setting `.length = n` after
 *  filling, which dropped every pooled Vec2 past `n` and re-allocated them on
 *  the next call: a pool that defeated itself). */
const COVER_POOL: Vec2[] = [];
/** The view handed to `perpendicularExtent` — resized per call, but its
 *  elements are references INTO `COVER_POOL`, so truncating the view drops
 *  nothing. */
const COVER_VIEW: Vec2[] = [];

/**
 * The footprint's ASPECT EXTENT as seen from `obs` (u): the covered cell
 * centres projected on the axis perpendicular to the observer→footprint
 * bearing, max−min, minus THREE CELLS of fuzz compensation, floored at one
 * cell.
 *
 * THIS IS THE CELL-QUANTIZED RECONSTRUCTION OF THE RETIRED WIRE `ext`, derived
 * from data the observer already holds — the wire no longer states it (cycle
 * 63, amendment 152: the payload is a coverage footprint and nothing else),
 * and BOTH hull sources compute it from their mask through this one function,
 * so a hull's echo strength cannot change character crossing the truesight
 * seam. It feeds `hullSample` exactly as the wire scalar did.
 *
 * WHY MINUS THREE CELLS (re-derived at the cycle-63 review gate for the FUZZED
 * mask — every mask this function sees is now dilated + stretched + glinted,
 * amendments 156-157): dilation adds exactly one cell per end, the stretch
 * draws average half a cell per end, and centre-sampling undershoots the true
 * edge by about half a cell per end, so the covered-centre span overshoots the
 * true extent by ~1.5 cells per end. Measured on the calibration mine-layer
 * broadside across 200 lattice phases × glint seeds: raw fuzzed span 99-126u
 * (mean 114.9) against the true 88u — minus 27u centres it on 87.9. Every
 * paint lands within 2 cells of truth and the MEAN within half a cell (pinned
 * in radarHeatmap.test.ts, together with the amendment-118 crossover BAND this
 * scintillation produces). A single-cell mask reads the floor, which the
 * `minPeak` floor dominates anyway.
 */
export function coverageExtent(cov: HullCoverage, obs: Vec2, cellU: number): number {
  const c = coverageCentre(cov, cellU);
  const brg = Math.atan2(c.y - obs.y, c.x - obs.x);
  let n = 0;
  for (let row = 0; row < cov.h; row++) {
    for (let col = 0; col < cov.w; col++) {
      if (!coverageHas(cov, col, row)) continue;
      const p = COVER_POOL[n] ?? (COVER_POOL[n] = { x: 0, y: 0 });
      p.x = (cov.gx + col + 0.5) * cellU;
      p.y = (cov.gy + row + 0.5) * cellU;
      COVER_VIEW[n] = p;
      n++;
    }
  }
  if (n === 0) return cellU;
  COVER_VIEW.length = n;
  return Math.max(cellU, perpendicularExtent(COVER_VIEW, brg) - 3 * cellU);
}

/**
 * Stamp one coverage footprint into the ship layer. EVERY COVERED CELL CARRIES
 * THE SAME MATERIAL — a hull is uniform steel, so its return is uniform.
 *
 * THE CORE→EDGE RAMP THIS REPLACES WAS AN INVENTION, AND IT IS WHY SHIPS READ
 * GREEN (cycle 66, amendment 167). Cycle 63 scaled each cell by
 * `depth ÷ maxDepth` — its own distance into the mask over the mask's deepest
 * point — to satisfy amendment 77's "one return shows more than one band". On a
 * landmass that is harmless; on a hull it is fatal, because a hull is THREE
 * CELLS THICK at the shipped 9u lattice. Measured: a torpedo boat is 11.1 × 1.0
 * cells sharp and 13 × 3 dilated, so `maxDepth` is 2 and **72% of the ship
 * lands at HALF reflectivity**; a mine layer 58%. The core was red exactly as
 * the amendment-118 fit intended — and then two thirds of the mark around it
 * was drawn at half strength, into blue and green. That is the reported defect
 * in one line of arithmetic.
 *
 * WHY UNIFORM IS THE PHYSICALLY RIGHT ANSWER, not merely the one that looks
 * better. Amendment 106's own table is the argument: reflectivity is a MATERIAL
 * property, and a hull is one material end to end — steel, the strongest thing
 * on the water at 1.0, against a rock cliff's 0.5. Terrain earns its internal
 * gradient honestly, because terrain's reflectivity genuinely varies across its
 * extent (height, amendment 129); a hull's does not. The ramp was manufacturing
 * a variation the object does not have, to satisfy a rule written about objects
 * that do.
 *
 * SO AMENDMENT 77 IS SATISFIED BY TERRAIN, NOT BY EVERY OBJECT INDIVIDUALLY. Its
 * concern was colour becoming a per-object LABEL — a mark whose colour said
 * *which thing* rather than *how strong* (amendment 76's diagnosis). A uniform
 * hull whose register tracks aspect and range is colour-as-INTENSITY, which is
 * the rule; and at three cells across there is no room for a gradient that
 * means anything anyway.
 *
 * Every calibration lands unchanged, and now lands on the WHOLE mark rather
 * than on its centreline: `refl = ship × ext / strongExtent` is the amendment-118
 * crossover fit, and `min = minPeak` is amendment 127's floor.
 */
export function stampCoverage(
  stamp: ShipStamp,
  cov: HullCoverage,
  obs: Vec2,
  m: ReturnModelOpts,
  cellU: number,
): void {
  const core = hullSample(coverageExtent(cov, obs, cellU), m);
  for (let row = 0; row < cov.h; row++) {
    for (let col = 0; col < cov.w; col++) {
      if (!coverageHas(cov, col, row)) continue;
      putShip(stamp, cellKey(cov.gx + col, cov.gy + row), core);
    }
  }
}

/**
 * THE PER-FRAME SHIP LAYER, from the hulls the client already holds.
 *
 * BOTH PAINT SOURCES FEED ONE STAMP AND ONE RASTERIZER (amendments 141 + 154).
 * Inside truesight the client synthesizes a hull from its `Contact` (the
 * server deliberately sends no blip for a hull it is already sending as a
 * contact — `blipGate` excludes `dist <= sightRange`, a perception-invariant
 * surface that is untouched here) by running the SAME shared `paintCoverage`
 * pipeline the server runs for a wire blip — sharp rasterization + the
 * cycle-63 fuzz (dilation + per-paint glint, amendments 156-157); beyond it,
 * the footprint arrives already rasterized AND fuzzed on the wire. Two
 * sources, one appearance, by construction — the inside/outside split
 * survives but stops being visible. Neither can double-stamp one hull,
 * because the two ranges are exact complements about the same dazzle-scaled
 * radius.
 *
 * `seedT` is the glint seed's time term. The caller passes the CURRENT SWEEP
 * REVOLUTION INDEX rather than the frame time, so a stationary sighted hull
 * keeps one stable mask for the whole beam crossing and re-glints on the next
 * revolution — sweep-to-sweep scintillation, exactly like the wire source
 * (whose seed time is the paint tick, one paint per revolution per hull).
 */
export function buildShipStamp(
  hulls: readonly EchoHull[],
  obs: Vec2,
  m: ReturnModelOpts,
  cellU: number,
  seedT = 0,
): ShipStamp {
  const stamp: ShipStamp = new Map();
  for (const h of hulls) {
    stampCoverage(stamp, paintCoverage(h.cls, h.x, h.y, h.heading, cellU, seedT), obs, m, cellU);
  }
  return stamp;
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
