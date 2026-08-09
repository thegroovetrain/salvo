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
// OCCLUSION IS BACK, AND IT IS NOT IN THIS FILE (Story 4.11, amendments 176-180
// — cashing the promise cycle 62 made when amendment 140 removed the binary
// tests). THE FIELD STILL ANSWERS "what is at (x, y)?" AND NOTHING ELSE: there
// is no near-face terminator here, no cross-island LOS filter and no clutter
// occluder mask, and a sample on the far side of a landmass is still described
// exactly as one on the near face. What changed is that the MARCH
// (render/radarMarch.ts) now folds terrain height into the shared shadow
// accumulator (shared/sim/radarShadow.ts) as it walks, and masks what it does
// with this file's answer by the ray's own verdict — so occlusion is a property
// of the RAY, which is the only place it can be O(1) and the only place the
// server can share the same code. A fully shadowed sample paints nothing at all
// (cycle 69 deleted the grey NO-DATA cells that used to fill it). On the
// wire-echo field (`shipOnlyField`, `disclosed: true`) the shadow may attenuate
// but never suppress, because the server already disclosed what is there; the
// floor that discharges amendment 127 is `FieldSample.min`.
//
// WHAT THIS FILE OWES THE MARCH BEYOND THE MATERIAL IS ONE FIELD: `terrainQ`,
// the sample's own quantized height, non-zero on exactly the terrain layer
// (cycle 69). The march masks a POINT ON A SURFACE by its own height against the
// grazing ray and a COLUMN AFLOAT at mast height, and only the field knows which
// of the two a shared land/steel cell resolved to. It is a label the field
// already has, not a second land test.
//
// THE RASTER IS EXPOSED ON THE SEAM (`RadarField.raster`) FOR EXACTLY THAT, and
// for one reason beyond convenience: `solidAt` below uses `sampleHeight(...) > 0`
// as the land test, and the accumulator must not introduce a second, disagreeing
// one. Handing the march the SAME raster object this field was built from makes
// "is this land, and how tall" one answer with one source.
//
// NO SERVER-SIDE SENSOR GATE MOVES ON THIS SIDE OF THE WIRE: `pointSighted`,
// `pointDetected`, the muzzle and smoke halos and the foghorn muffle all still
// enforce binary island LOS, and only the server's `blipGate` adopts the shadow
// (amendment 179).
//
// A FIELD IS A FROZEN RECORD (amendment 83). Everything it can answer — the
// observer the clutter disc hangs on, the ring the wall tracks, where every hull
// is — is captured when the field is BUILT, and a march freezes its samples into
// a slice at creation. Nothing downstream re-evaluates any of it against live
// state. Nothing viewport-derived reaches this file at all (amendment 97): not
// one function here takes a camera, a zoom or a viewport.

import {
  WAKE_AGE_BUCKETS,
  coverageCellCount,
  coverageHas,
  paintCoverage,
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
import { cellNoise, cellOf, paintSeed, type ReturnModelOpts } from './radarHeatmap.js';
import {
  CHOP_HEAD_MULTIPLE,
  chopSample,
  clutterSample,
  stormSample,
  wakeKeepFraction,
  wakeSample,
  type StormRing,
} from './radarSources.js';

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
   *  127's guarantee lives: nothing the server blips ever paints nothing. It
   *  floors the return BEFORE the range term (`returnStrength`) and again AFTER
   *  the shadow term (`shade`), which is what lets an occluded hull fade without
   *  ever being erased. */
  min: number;
  /**
   * THE SAMPLE'S OWN HEIGHT, in the raster's quantized units — non-zero on
   * EXACTLY the terrain layer and 0 on every other material (cycle 69).
   *
   * It is here because the march has to know WHICH INSTANCE of the illumination
   * rule to mask this sample with (render/radarMarch.ts's header): terrain is a
   * point on a surface, masked by its own height against the grazing ray, while
   * everything afloat is a column masked at mast height. THE ANSWER MUST COME
   * FROM THE FIELD, not from the ray's own raster read, because the two solid
   * layers share cells — a hull hugging a coastline can WIN a land cell
   * (`solidAt`), and it is still a hull when it does.
   *
   * 0 IS "NOT TERRAIN", NOT "SEA LEVEL". Feeding a water sample's 0 into the
   * terrain rule fails it open and would erase the shadow it stands in, which is
   * why the rule takes this field rather than a bare height.
   */
  terrainQ: number;
  /**
   * FLOOR UNDER THE SHADOW TERM ONLY (Story 4.12) — absent means "use `min`",
   * which is every pre-4.12 material and keeps them byte-identical.
   *
   * IT EXISTS BECAUSE THE TWO FLOORS ARE DIFFERENT PROMISES and one material
   * finally needs to make only the second. `min` says *the material always
   * returns at least this, at any range* (amendment 127's hull guarantee, and it
   * is applied in `returnStrength`, before the shadow). This says *a DISCLOSURE
   * never goes dark* (amendment 190: suppression is forbidden, attenuation with a
   * floor is not), and it is applied in `shade`, after it.
   *
   * A hull sets `min` and lets this default to it, exactly as before. A DISCLOSED
   * wake segment must do the opposite: its whole recency channel is cells
   * legitimately falling under the transparency threshold as their water ages and
   * as range grows, so a `min` floor would freeze the track at full length and
   * full life forever — the reach and the age ladder are the two things this
   * material exists to express. What it does need is that a segment the server
   * GATED THROUGH cannot be deleted again by the client's own (deliberately more
   * generous — amendment 192) shadow walk, and that is exactly what a floor here
   * buys and nothing else.
   */
  shadowFloor?: number;
  /**
   * THE MATERIAL'S OWN GRAIN SCALE on the ambient SNR envelope (Story 4.12,
   * amendment 203) — absent (or 1) for everything that scatters incoherently,
   * which is every material but one.
   *
   * The grain models SCINTILLATION, and a ship's track is an organized,
   * persistent surface feature rather than random capillary roughness, so it
   * twinkles less. That is a physical property of a material and belongs on the
   * material, beside its coefficient and its geometry — not as a branch in the
   * march, which is exactly the "a fifth return source arrives with a private
   * formula" shape this seam exists to prevent.
   */
  grain?: number;
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
  /**
   * THE ELEVATION AUTHORITY THIS FIELD WAS BUILT FROM, or null for a field with
   * no terrain at all — the march's shadow accumulator reads it (Story 4.11).
   *
   * It is carried on the seam rather than passed alongside so that there is
   * exactly ONE land answer: `solidAt` tests `sampleHeight(raster, …) > 0` and
   * the accumulator folds heights out of the same array, so the two cannot drift
   * into disagreeing about where a coastline is.
   */
  readonly raster: HeightRaster | null;
  /**
   * TRUE when everything this field can answer was ALREADY DISCLOSED by the
   * server (the wire-echo path — `shipOnlyField`), FALSE for the world field the
   * beam walks.
   *
   * It governs ONE thing in the march: whether the shadow may SUPPRESS. On a
   * disclosed field it may not — the ray attenuates what it finds and floors it
   * at the material's own guarantee (`FieldSample.min`), because a bearing the
   * server already answered is not a bearing the client learned nothing on. On
   * the world field the shadow is free to take a sample to nothing, and a sample
   * taken to nothing is simply not stored.
   */
  readonly disclosed: boolean;
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

/**
 * A CELL-INDEXED MATERIAL LAYER: absolute world cell -> the material there.
 *
 * Two layers use it — the per-frame SHIP stamp (amendment 141) and, since Story
 * 4.12, the WAKE stamp (core + the chop that hangs off it). `ShipStamp` remains
 * as the ship layer's name because that is what every existing caller says.
 */
export type CellStamp = Map<number, FieldSample>;

/** The per-frame ship layer: absolute world cell -> that hull's sample. */
export type ShipStamp = CellStamp;

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
 *
 * SINCE CYCLE 67 EVERY HULL SAMPLE IS THE SAME COEFFICIENT, so on the SHIP layer
 * this comparison is a tie in every case a shipped caller can produce and the
 * guard is a no-op there. On the WAKE layer (Story 4.12) it does real work: a
 * ribbon's turbulent core and the chop pushed out around it genuinely differ, and
 * they overlap wherever two segments of one track cross — so the core wins its
 * own cells by STRENGTH rather than by which segment was stamped last.
 * It stays for hulls because the INVARIANT is what matters, not the arithmetic:
 * `Map.set` is last-wins, and the moment any hull-like material differs from
 * steel (a decoy, a wreck, a surfaced hulk) iteration order would silently
 * decide the reading. A no-op guard on a stated invariant is cheap; discovering
 * you deleted it is not.
 */
function putStronger(stamp: CellStamp, key: number, s: FieldSample): void {
  const cur = stamp.get(key);
  if (cur !== undefined && cur.refl >= s.refl) return;
  stamp.set(key, s);
}

/**
 * A HULL'S MATERIAL — the coefficient, full stop (cycle 67, amendments 171-175).
 *
 * COLOUR IS MATERIAL AND RANGE. NOTHING ELSE. Every hull on the water is steel,
 * so every hull reads the same register at the same range; what tells you it is
 * a battleship rather than a torpedo boat is the SIZE of the mark. Size carries
 * size, colour carries strength-vs-range, and neither carries the other.
 *
 * WHAT WAS DELETED, AND WHY IT WAS A DOUBLE-COUNT. This used to return
 * `ship x ext / strongExtent`, where `ext` was the hull's extent projected
 * perpendicular to the observer. `ext` was ratified as the aspect channel by
 * amendment 66 — back when a return was an ELLIPSE SIZED BY `ext` and the scalar
 * was the only aspect information the client had. Since cycle 63 the COVERAGE
 * MASK carries aspect: a bow-on hull rasterizes to a genuinely small mark all by
 * itself. `ext`'s second job — dimming the return for the same underlying reason
 * the mask was already shrinking it — was never removed, so a bow-on hull was
 * made small by the mask AND dim by the coefficient, twice for one physics.
 *
 * AND THE NUMBER UNDERNEATH IT WAS WRONG. Eric asked why a bow-on hull reflects
 * less, and honestly it barely does. A warship's radar cross-section is dominated
 * by CORNER REFLECTORS — the hull-sea dihedral, and the right angles all over the
 * superstructure — which retroreflect across a wide span of incident angles.
 * Broadside is a peak, but bow-on is typically only ~10 dB down and still an
 * enormous absolute RCS; on a gain-controlled marine set a ship reads as a solid
 * bright target from any aspect. The "steel bow-on ~0.25" figure this was built on
 * comes from amendment 106's coefficient table, which says IN THAT AMENDMENT that
 * it is an assistant handwave and the first thing to tune. It was treated as
 * authority, and it should not have been.
 *
 * `minPeak` SURVIVES UNCHANGED (amendment 127): the floor that makes radar range
 * mean ONE number for every hull. It no longer binds anywhere inside the scope —
 * a uniform steel coefficient clears it at every range out to the rim — but
 * dropping it so signature becomes stealth is a ruled-out design, not a missing
 * feature, and the guarantee is asserted directly rather than trusted to the
 * curve.
 */
export function hullSample(m: ReturnModelOpts): FieldSample {
  return {
    refl: m.ship,
    geom: POINT,
    ref: m.pointRef,
    floor: m.pointFloor,
    min: m.minPeak,
    terrainQ: 0, // steel, wherever it happens to sit
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
    terrainQ: h, // the ONE non-zero: this is the terrain layer
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
  // `terrainQ: 0` — surf is BREAKING WATER, not ground. It stands at the
  // waterline, so it is masked at mast height like everything else afloat.
  return { refl: m.surf, geom: SURFACE, ref: m.surfaceRef, floor: m.floor, min: 0, terrainQ: 0 };
}

/** World centre of a coverage footprint's cell rect. */
export function coverageCentre(cov: HullCoverage, cellU: number): Vec2 {
  return { x: (cov.gx + cov.w / 2) * cellU, y: (cov.gy + cov.h / 2) * cellU };
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
 * AND THE MATERIAL NO LONGER DEPENDS ON THE OBSERVER AT ALL (cycle 67,
 * amendments 171-175). `stampCoverage` used to take the observer's position,
 * for one reason: to reconstruct the hull's aspect-projected extent from the
 * mask (`coverageExtent`) and scale reflectivity by it. That was the aspect
 * DOUBLE-COUNT — the mask this function is stamping already carries aspect —
 * and with it gone the parameter went too, rather than lingering as an argument
 * that implies a hull's material varies with who is looking at it. `refl = ship`
 * is now the whole of amendment 118's crossover fit, and `min = minPeak` is
 * amendment 127's floor; both land on every cell of the mark.
 *
 * AND THE MATERIAL IS AN ARGUMENT AS OF STORY 4.12. It used to call
 * `hullSample(m)` itself, which was fine while a coverage mask could only ever be
 * a hull; the server now rasterizes WAKE RIBBONS onto the same lattice in the
 * same `HullCoverage` shape, so the one place that lays a mask into a cell layer
 * takes the material it is laying. The alternative — a second, parallel stamp
 * loop for water — is how two rasterizers drift.
 */
export function stampCoverage(
  stamp: CellStamp,
  cov: HullCoverage,
  s: FieldSample,
): void {
  for (let row = 0; row < cov.h; row++) {
    for (let col = 0; col < cov.w; col++) {
      if (!coverageHas(cov, col, row)) continue;
      putStronger(stamp, cellKey(cov.gx + col, cov.gy + row), s);
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
  m: ReturnModelOpts,
  cellU: number,
  seedT = 0,
): ShipStamp {
  const stamp: ShipStamp = new Map();
  const steel = hullSample(m);
  for (const h of hulls) {
    stampCoverage(stamp, paintCoverage(h.cls, h.x, h.y, h.heading, cellU, seedT), steel);
  }
  return stamp;
}

// --- the WAKE layer (Story 4.12) -------------------------------------------------

/**
 * ONE DISCLOSED WAKE SEGMENT: the coverage mask the server rasterized onto the
 * shared lattice, plus its quantized water-age bucket, and NOTHING ELSE.
 *
 * That is the whole wire row (amendment 194) and deliberately so — no ship id, no
 * class, no hue, no owner, no hull↔wake linkage. Whether two segments belong to
 * one track is the PLAYER's inference off the ribbon's shape and the age gradient
 * along it; it is never the wire's statement, and nothing in this module may
 * reconstruct it.
 */
export interface WakeSegmentCover {
  cov: HullCoverage;
  /** Water-age bucket, 0 (freshest) .. WAKE_AGE_BUCKETS-1. */
  a: number;
}

/**
 * THE CHOP HALO, IN CELLS, for one segment — how far the displaced water reaches
 * beyond the turbulent core.
 *
 * IT IS DERIVED FROM THE MASK'S OWN THICKNESS, WHICH IS WHY IT NEEDS NO IDENTITY.
 * `cells / max(w, h)` is the mask's mean thickness along its long axis, i.e. the
 * source's beam in cells; the Kelvin wedge then puts the envelope's half-width at
 * `CHOP_HEAD_MULTIPLE` times the core's, so the halo beyond the core is
 * `(multiple − 1) × half-thickness` ≈ the beam itself. A battleship pushes a real
 * patch, a torpedo's one-cell ribbon pushes barely a cell — amendment 197's
 * "a lone torpedo track reads plainly" holding by construction rather than by a
 * special case the payload could not support anyway.
 *
 * AND IT TAPERS ON THE AGE CHANNEL, which is a DEVIATION OF RECORD worth stating
 * plainly. Amendment 206 wants the envelope widest at the ribbon's HEAD, where
 * water is actively displaced, narrowing behind it at the Kelvin half-angle. The
 * payload carries no head↔tail linkage and no distance-astern (194), so the only
 * "how far behind the hull is this water" channel that exists is the AGE BUCKET —
 * and the taper runs down it, reaching the bare core at the oldest bucket. The
 * Kelvin constant therefore sets the envelope's WIDTH rather than the taper's
 * rate; the rate is set by the source's own speed, since a fast hull spreads its
 * buckets over more water. Both sources agree on this because both express it in
 * buckets (amendment 154: two sources, one appearance).
 */
export function chopHaloCells(cov: HullCoverage, bucket: number): number {
  const span = Math.max(cov.w, cov.h);
  if (!(span > 0)) return 0;
  const thickness = coverageCellCount(cov) / span;
  const halo = (CHOP_HEAD_MULTIPLE - 1) * (thickness / 2);
  const last = WAKE_AGE_BUCKETS - 1;
  const b = Number.isFinite(bucket) ? Math.min(last, Math.max(0, Math.floor(bucket))) : last;
  const taper = last > 0 ? 1 - b / last : 1;
  return Math.max(0, Math.round(halo * taper));
}

/** Lay one segment's chop halo: every cell within `halo` of a covered cell that
 *  the core does not already own. `putStronger` keeps the core wherever the two
 *  meet, so chop can never overwrite the track it is hiding (amendment 198). */
function stampChop(stamp: CellStamp, cov: HullCoverage, halo: number, s: FieldSample): void {
  if (halo <= 0) return;
  for (let row = 0; row < cov.h; row++) {
    for (let col = 0; col < cov.w; col++) {
      if (!coverageHas(cov, col, row)) continue;
      for (let dy = -halo; dy <= halo; dy++) {
        for (let dx = -halo; dx <= halo; dx++) {
          putStronger(stamp, cellKey(cov.gx + col + dx, cov.gy + row + dy), s);
        }
      }
    }
  }
}

/**
 * BUILD THE WAKE LAYER from disclosed segments: each segment's core at the wake
 * material scaled by its own water age, plus the chop halo around it.
 *
 * CHOP IS LAID FIRST AND THE CORE SECOND, so `putStronger`'s comparison never has
 * to arbitrate a tie in the wrong direction; and the two are one layer rather
 * than two because a cell can only be one material, which is the same reason the
 * field answers one sample per point.
 *
 * `shadowFloor` is `wakeLitFloor(m)` on the DISCLOSED (wire) path and 0 on the
 * world field the local beam marches. Only the CORE takes it: a disclosed segment
 * may not be deleted by the client's own shadow walk (amendment 190), while chop
 * is synthesized here, was disclosed by nobody, and may go dark exactly as
 * terrain does.
 */
export function buildWakeStamp(
  segs: readonly WakeSegmentCover[],
  m: ReturnModelOpts,
  shadowFloor = 0,
): CellStamp {
  const stamp: CellStamp = new Map();
  const chop = chopSample(m);
  for (const seg of segs) stampChop(stamp, seg.cov, chopHaloCells(seg.cov, seg.a), chop);
  for (const seg of segs) {
    stampWakeCore(stamp, seg.cov, wakeSample(m, seg.a, shadowFloor), wakeKeepFraction(m, seg.a));
  }
  return stamp;
}

/**
 * THE FRAY STENCIL'S SEED (cycle 71, amendment 214).
 *
 * DELIBERATELY NOT `MARCH_SEED`. The grain stencil and the fray stencil are
 * both per-absolute-cell draws, and sharing a seed would CORRELATE them: the
 * same cells the grain leans dark would be the cells the fray removes, so the
 * two channels would compound in some places and cancel in others instead of
 * being independent. A separate key makes the tail's thinning statistically
 * clean against the speckle it sits in.
 *
 * Constant for the whole match, exactly as `MARCH_SEED` is, so which cells a
 * bucket drops is a property of the PLACE and not of the frame. That is what
 * keeps the tail from boiling: as water ages through a bucket boundary the
 * stencil TIGHTENS on the cells it already had rather than re-rolling a fresh
 * scatter, so the track visibly erodes instead of flickering.
 */
const FRAY_SEED = paintSeed('wakefray', 0);

/**
 * Lay a wake segment's CORE, dropping the fraction of its cells its water age
 * has already lost (amendment 214). `keep >= 1` is the freshest bucket and lays
 * every cell — the exact `stampCoverage` behaviour, which is why the fresh head
 * of a track is byte-identical to what cycle 70 drew.
 *
 * The kept set is NESTED across buckets by construction: the test is one draw
 * per cell against a falling threshold, so a cell that survives the oldest
 * bucket survived every younger one. A stretch of water therefore only ever
 * LOSES cells as it ages, which is the reading — erosion, not a new scatter
 * every 1.375s.
 */
function stampWakeCore(
  stamp: CellStamp,
  cov: HullCoverage,
  s: FieldSample,
  keep: number,
): void {
  if (keep >= 1) {
    stampCoverage(stamp, cov, s);
    return;
  }
  for (let row = 0; row < cov.h; row++) {
    for (let col = 0; col < cov.w; col++) {
      if (!coverageHas(cov, col, row)) continue;
      const gx = cov.gx + col;
      const gy = cov.gy + row;
      if (cellNoise(FRAY_SEED, gx, gy) >= keep) continue;
      putStronger(stamp, cellKey(gx, gy), s);
    }
  }
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
  /**
   * The per-frame WAKE layer (Story 4.12) — disturbed water the client holds
   * POSE for, i.e. the inside-truesight source, exactly as `ships` is the
   * inside-truesight hull source. Optional: a caller with no wake at all passes
   * nothing and the field answers as it did before 4.12, cell for cell.
   *
   * BEYOND TRUESIGHT WAKE DOES NOT COME THROUGH HERE. It arrives already gated
   * and rasterized on the wire and is marched at once through `wakeOnlyField`,
   * for the same reason a wire hull echo is: the SERVER's beam already crossed
   * it, and waiting for the local beam would paint it a revolution stale.
   */
  wake?: CellStamp;
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
 *
 * DISTURBED WATER RANKS BELOW SURF AND ABOVE CLUTTER (Story 4.12), which is the
 * scatterer ordering again rather than a new rule: a breaking coastline returns
 * more than a ship's track, a ship's track returns more than open sea state, and
 * the coefficients say so. It is ONE Map probe covering BOTH new materials — a
 * wake's core and the chop pushed out around it share a layer because a cell can
 * only be one material, and separating them would buy a second probe on every
 * open-water sample for an answer the stamp already arbitrated.
 */
export function buildField(f: FieldSpec): RadarField {
  const m = f.model;
  const surfLevel = f.raster === null ? -1 : surfPyramidLevel(f.raster, m.surfBandU);
  const wake = f.wake;
  return {
    raster: f.raster,
    disclosed: false,
    sampleAt(x: number, y: number, dist = 0): FieldSample | null {
      const solid = solidAt(f, x, y, dist);
      if (solid !== null) return solid;
      const storm = f.ring === null ? null : stormSample(f.ring, x, y, m);
      if (storm !== null) return storm;
      const surf = f.raster === null ? null : surfSample(f.raster, surfLevel, x, y, m);
      if (surf !== null) return surf;
      const water = wake === undefined || wake.size === 0 ? undefined : stampAt(wake, x, y, f.cellU);
      if (water !== undefined) return water;
      return clutterSample(f.obs, x, y, m);
    },
  };
}

/** One cell-indexed layer's answer at a point. */
function stampAt(stamp: CellStamp, x: number, y: number, cellU: number): FieldSample | undefined {
  return stamp.get(cellKey(cellOf(x, cellU), cellOf(y, cellU)));
}

/**
 * A field carrying ONE WAKE LAYER and nothing else — the wire source's sibling of
 * `shipOnlyField`, and it inherits that function's whole argument.
 *
 * `disclosed: true` for the same reason: the server has already gated these
 * segments (annulus + swept-this-tick + amendment 179's shadow accumulator, per
 * segment), so a client-side occlusion test may ATTENUATE what it finds but may
 * never SUPPRESS it, and this ray emits no NO-DATA marks — a bearing the server
 * answered is not a bearing the client learned nothing on. That is amendment 190
 * exactly: *"suppression is forbidden, attenuation with a floor is not."*
 *
 * WHERE THE FLOOR IS, AND WHY IT IS NOT `min`. For a hull the floor is `minPeak`
 * on `FieldSample.min`, which `returnStrength` applies BEFORE the range term —
 * that is amendment 127's *"anything the server blips paints at least a speck"*,
 * a promise about a CONTACT. Water cannot take that floor: the wake's entire
 * recency channel is cells legitimately falling under the transparency threshold
 * as their water ages and as range grows, and a `min` would freeze the track at
 * full length and full life forever. So a disclosed segment carries
 * `FieldSample.shadowFloor` = `wakeLitFloor(m)` instead — applied AFTER the
 * shadow and nowhere else, so a partially-shadowed segment reads weaker and a
 * fully-shadowed one still paints, while the reach and the age ladder are
 * untouched. That is amendment 190 in this material's own currency.
 */
export function wakeOnlyField(
  wake: CellStamp,
  cellU: number,
  raster: HeightRaster | null = null,
): RadarField {
  // The floor itself rides the STAMP (`buildWakeStamp`'s `shadowFloor`), where
  // it costs one allocation per segment rather than one per sample.

  return {
    raster,
    disclosed: true,
    sampleAt(x: number, y: number): FieldSample | null {
      if (wake.size === 0) return null;
      return stampAt(wake, x, y, cellU) ?? null;
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
 *
 * IT CARRIES THE RASTER, AND THE SHADOW ATTENUATES WHAT IT PAINTS WITHOUT EVER
 * SUPPRESSING IT (Story 4.11, corrected at the review gate).
 *
 * THE POSITION THIS REPLACES, AND WHY IT WAS WRONG. This path shipped with
 * `raster: null` — a deliberate choice, argued from amendment 127: the wire echo
 * has ALREADY been gated by the server's own `blipGate`, which runs the same
 * shadow model along the same ray, so a second client-side occlusion test could
 * only ever SUPPRESS a blip the server legitimately disclosed, and *"anything
 * the server blips paints at least a speck"* forbids that in as many words. The
 * reasoning is sound and it still binds. The CONCLUSION did not follow: a null
 * raster does not merely refuse to suppress, it refuses to ATTENUATE, so beyond
 * truesight — the one tier this feature governs, since inside it a hull arrives
 * as a `Contact` and is painted through `buildField` — a 5%-illuminated hull
 * painted at FULL strength right up to the tick the server's gate flipped, and
 * then vanished. That is exactly the cut Story 4.11's acceptance criterion
 * forbids (*"a ship crossing into a shadow ... fades through the weakest band
 * rather than cutting at a line"*), and it also let a full-strength echo sit in
 * water this same scope had painted nothing in.
 *
 * SUPPRESSION IS FORBIDDEN; ATTENUATION-WITH-A-FLOOR IS NOT, AND THE FLOOR IS
 * WHAT DISCHARGES AMENDMENT 127. The march scales every sample by the ray's
 * illuminated fraction and then floors the result at the material's own
 * guarantee (`hullSample`'s `min` = `model.minPeak` — the existing "nothing the
 * server disclosed ever vanishes" constant, not a new knob), so a partially
 * shadowed hull reads WEAKER and a fully shadowed one still paints its speck.
 * `disclosed` is what carries that rule into the march: on this field the shadow
 * may never take a sample to nothing.
 *
 * A caller with no terrain still passes `null`, which makes the shadow walk fail
 * open exactly as before.
 */
export function shipOnlyField(
  ships: ShipStamp,
  cellU: number,
  raster: HeightRaster | null = null,
): RadarField {
  return {
    raster,
    disclosed: true,
    sampleAt(x: number, y: number): FieldSample | null {
      if (ships.size === 0) return null;
      return ships.get(cellKey(cellOf(x, cellU), cellOf(y, cellU))) ?? null;
    },
  };
}
