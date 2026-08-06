// Pure radar HEATMAP math (no Pixi import — unit-tested). Cycle 52, amendments
// 76-79: the `return` layer stops being per-blip polygons and becomes a
// QUANTIZED INTENSITY BITMAP. This module owns every number that decision
// needs; the Pixi adapter (render/radar.ts) only anchors the grid, uploads the
// bytes and positions one sprite — the same seam blipMarks.ts holds for the
// `silhouette` grammar, and the same seam the retired returnMarks.ts held for
// the polygon grammar this replaces.
//
// WHY THE POLYGON MODEL DIED (amendment 76, and it was never a bug). A polygon
// carries ONE fill, so color could only ever be a per-OBJECT label — and the
// label legitimately swung, because `ext` is aspect-projected (a battleship
// reads 32u bow-on and 124u abeam). The same hull really did change color as it
// turned. An island, meanwhile, could only be approximated by scattering small
// polygons along its arc, which is exactly the "little circles around the edge"
// Eric saw. Both complaints have one root: the wrong drawing primitive.
//
// THE GOVERNING INVARIANT — A PAINT IS A HISTORICAL RECORD (cycle 55,
// amendment 83). Everything about a paint — its position, its intensity, which
// band a cell lands in, and WHETHER A GIVEN CELL PAINTS AT ALL — is decided
// ONCE, at paint creation, from the observer's state at that moment. The ONLY
// property that changes afterward is alpha, via time-based phosphor decay.
// Nothing about a paint may EVER be re-evaluated against live state: not the
// live observer position, not the live sight radius, not the live beam angle,
// not the live grid anchor. THE RADAR SWEEP IS THE ONLY THING THAT PAINTS.
//
// This rule is the first thing to check whenever a new radar behavior is added,
// and it is the rule cycle 54 broke: it gated cells against the LIVE grid
// anchor, so the sight bubble merely RECEDING lit up coastline the beam had
// never re-swept (amendment 84). Staleness is not a bug here — staleness is the
// whole contract. If a quantity can differ between the frame a paint was born
// and the frame it is stamped, it belongs ON THE PAINT, not on the grid.
//
// CYCLE 56 DID NOT TOUCH THIS INVARIANT. It retired one thing that used to be
// frozen — the SIGHT VERDICT (amendment 88, ruling R6) — and the paint model is
// otherwise unchanged. The clause above about "not the live sight radius" is now
// vacuous rather than wrong: there is no sight radius anywhere in this module to
// read, live or frozen. Everything else it forbids still stands, and R7's new
// contact-derived source is born under it like every other paint.
//
// THE RULINGS THIS FILE IMPLEMENTS:
//
//   • R1 — HISTORY LIVES IN A PAINT LIST, NOT IN THE BUFFER. Nothing here ever
//     decays a persistent buffer in place: the observer moves, so an in-place
//     decay would smear or drag old paints along with the camera. `rasterize`
//     clears, then re-stamps every LIVE paint from its own record each frame.
//     The buffer is a pure function of (paint list, now) — phosphor persistence
//     falls out for free and a paint can never be half-erased.
//
//   • R2 — THE BUFFER IS WORLD-ANCHORED. `anchorGrid` snaps the origin to a
//     whole cell (`Math.floor(worldX / cellU)`), so the pixel lattice belongs to
//     the WORLD, not to the ship. Without the snap every cell's world position
//     would slide with the observer and a static coastline would shimmer as you
//     steamed past it.
//
//   • R3 — INTENSITY FALLS OFF FROM THE CORE, PLUS NOISE. A ship echo is a
//     paraboloid dome over its aspect ellipse; an island's landmass reads
//     strongest deep inside the coastline and softens toward it. Both are then
//     multiplied by `cellNoise`, seeded on (paint, ABSOLUTE world cell) — so the
//     ragged band boundaries are stable for a paint's entire decay (a paint is a
//     historical snapshot, amendment 70's surviving clause) and are also stable
//     as the observer moves, because the cell index is a world coordinate.
//
//   • R4 — SHIPS STAMP A KERNEL SIZED BY `ext`, range-attenuated. Size is still
//     the aspect channel amendment 66 ratified; what changed is that the kernel
//     now has INTERNAL structure, so a big broadside contact earns a red core
//     with a blue surround and a green fringe while a distant needle never
//     leaves green. Strength still reads — it just reads as texture instead of
//     as a label.
//
//   • R5 — ISLANDS RASTERIZE THEIR OBSERVER-FACING LANDMASS AS SOLID FILL,
//     FROM THE REAL POLYGON. `pointInIsland` is the membership test and
//     `islandBlocksSegment` is the cross-island LOS filter — the shared
//     primitives, never a local re-implementation, and never the bounding
//     circle. That last point is the cycle-52 regression this file exists to
//     fix as much as the color one: `Island` is structurally assignable to
//     `Circle`, so the retired returnMarks.ts kept COMPILING against `x/y/r`
//     after fractal islands landed and happily painted coastline on a bounding
//     circle that can sit hundreds of units offshore of the real coast.
//
//   • R6 — THE SCOPE PAINTS EVERYTHING WITHIN RADAR RANGE, TRUESIGHT INCLUDED
//     (cycle 56, amendments 88-90 — SUPERSEDING cycle 54's sight-bubble gate and
//     the sight half of cycle 55). Eric: *"maybe we should paint everything in
//     radar range, even if its in LOS. Just that if its in LOS (truesight)
//     range, then you also see the actual ship in realtime."* Inside truesight
//     you now get BOTH channels at once: the live hull, drawn in realtime, AND
//     its radar echo painted by the sweep. A real scope does not stop painting
//     what you can also see out the window, and the doubled read is information
//     — the echo says when the beam last touched it, which the live hull cannot.
//
//     WHAT DIED IS THE SIGHT VERDICT, NOT THE FREEZING DISCIPLINE. `SightFreeze`
//     / `freezeSight` / `insideSight` and the per-cell suppression in `stampShip`
//     and in the `cover` bake are gone. Everything else amendments 83-85 ruled
//     stands untouched: `ShipPaint` still freezes `bearing`/`dist` at creation
//     and `IslandPaint.cover` still bakes per-cell intensity and `faceShadow`
//     from the observer at paint open. Amendment 86's accepted consequence — a
//     ghost may sit decaying inside the bubble — stops being an edge case and
//     becomes the ordinary case, since the bubble no longer suppresses anything.
//
//   • R7 — A SIGHTED SHIP'S ECHO IS SYNTHESIZED CLIENT-SIDE FROM ITS `Contact`
//     (amendment 89). The server has never sent a blip for a ship inside sight:
//     `blipGate` excludes `dist <= sightRange` because a sighted hull is
//     delivered as a full `Contact` instead. That is a perception-invariant
//     surface and MUST NOT CHANGE — so without a second source, retiring the
//     gate would paint islands inside the bubble and leave sighted ships as
//     holes. `contactEcho` closes that: a `Contact` carries `cls` and `heading`,
//     which is everything `perpendicularExtent` needs to compute the SAME aspect
//     extent the server puts on a wire blip. It discloses nothing new — a
//     sighted hull is already fully visible.
//
//     THE SWEEP STILL GATES IT, AND THE TWO SOURCES ARE COMPLEMENTARY. An echo
//     is created when the BEAM CROSSES its bearing (`sweepCrossed`, the same
//     half-open window a wire blip answers to) — never every frame, never on
//     contact arrival. Its range term is the EXACT complement of the server's:
//     the client synthesizes at `dist <= sightU` and the server blips at
//     `dist > sightU`, off one dazzle-scaled radius, so no hull can be both. And
//     island LOS applies here exactly as it does to every other sensor (Eric
//     ruling 2026-08-02), which is what keeps a lit-zone contact behind a
//     headland from painting an echo no beam could have returned.
//
//   • R8 — THE BUFFER MAY NEVER DROP A PAINT (cycle 57, amendments 92-94). The
//     allocation is the DERIVED worst case (`heatExtentU`, section 9), not radar
//     range: a paint born at the rim must survive the observer sailing away from
//     it for the paint's whole life. Amendment 83's scope now explicitly
//     includes anything that can drop a paint at DRAW time, which is what the
//     old radar-range square was quietly doing. Because that square is several
//     times bigger, the per-frame work moved onto an ACTIVE SUB-RECT derived
//     FROM the live paints (`liveRect`) — a cost boundary that, by construction,
//     contains every cell the stampers are about to write.
//
// THE NEAR FACE, EXACTLY (amendments 69 + 78, and cycle 51's review gate). A
// radar sees the near surface; the far side is the island's own shadow. The
// criterion generalizes the tangent rule to interior points: for a point P at
// radius rho from the bounding centre C, seen from an observer at distance d,
// the visible portion of P's own concentric circle is `(P−C)·û >= rho²/d`. On
// the boundary (rho = r) that reduces to the classic `cos >= r/d` tangent
// horizon, so the filled mass agrees with the arc rule cycle 51 shipped. What
// changes is only that the near face is FILLED rather than sampled. The
// terminator gets a short ramp so the shadow line reads as shadow rather than
// as a drawn edge.

import {
  BOON_CATALOG,
  CONFIG,
  effectiveStats,
  hullSilhouette,
  islandBlocksSegment,
  pointInIsland,
  nearestCoastPoint,
  perpendicularExtent,
  segCircleHit,
  transformPolygon,
  wrapPositive,
  type BoonDef,
  type BoonEffect,
  type HullId,
  type Island,
  type Vec2,
} from '@salvo/shared';
import { clamp01 } from '../util/math.js';
import { blipAlpha } from './phosphor.js';

const TAU = Math.PI * 2;

// Hash constants for `paintSeed`/`cellNoise`, written in DECIMAL on purpose
// (comments too): the token guard (tokens.test.ts) reports every 6/8-digit hex
// literal anywhere in client/src as a color escaping the token source, and these
// are mixing constants, not colors. Values are the standard 32-bit FNV-1a offset
// basis and prime, plus the two multipliers from the murmur3 finalizer.
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const TIME_MIX = 668265261;
const AVALANCHE_MIX = 2246822507;
/** 2^32 — the divisor that turns a u32 avalanche into a [0,1) float. */
const U32 = 4294967296;

// --- 1. the quantization contract -------------------------------------------

/**
 * One band of the quantized scale. EXACTLY THREE of these ship (amendment 77),
 * ordered ASCENDING by `at`, and a pixel below `bands[0].at` is fully
 * transparent. There is no fourth state and no interpolation anywhere: a pixel
 * is one of these colors or it is nothing.
 */
export interface HeatBand {
  /** Lowest per-pixel intensity that paints this band (ascending). */
  at: number;
  /** The band's color — used VERBATIM, never lerped toward a neighbour. */
  color: number;
  /** Peak opacity of a FRESH pixel in this band (age scales it down). */
  alpha: number;
}

/**
 * Which band a per-pixel intensity falls in, or -1 for fully transparent.
 *
 * THE HARD-QUANTIZATION GUARANTEE. This is the only function that maps
 * intensity to color, it returns an INDEX, and every caller reads
 * `bands[i].color` unmodified — so no output of the heatmap can ever be a blend
 * of two bands, at any input. A non-finite intensity answers -1 (the negated
 * compare below catches NaN), which paints nothing rather than a garbage color.
 */
export function bandIndex(intensity: number, bands: readonly HeatBand[]): number {
  if (!(intensity > 0)) return -1;
  let idx = -1;
  for (let i = 0; i < bands.length; i++) {
    if (intensity < bands[i].at) break;
    idx = i;
  }
  return idx;
}

// --- 2. the world-anchored grid ----------------------------------------------

/**
 * A rectangle of ABSOLUTE world cells: top-left index plus a size. The unit the
 * per-frame cost is expressed in (amendment 93) — the buffer is allocated for
 * the worst case and worked over one of these.
 */
export interface CellRect {
  gx0: number;
  gy0: number;
  cols: number;
  rows: number;
}

/**
 * The intensity buffer. Two parallel per-cell channels, and they carry DIFFERENT
 * quantities on purpose:
 *
 *   • `w` — intensity, the quantization input. Geometry only: aspect extent,
 *     range attenuation, distance into the landmass, noise. NEVER age.
 *   • `a` — the age opacity of whichever paint won that cell's intensity.
 *
 * WHY AGE IS NOT FOLDED INTO `w` (a deliberate deviation from the letter of
 * ruling R1's "age-derived weight", recorded here because it is load-bearing):
 * intensity decides COLOR, so an age term in it would make one object drift red
 * → blue → green as it decayed. That is amendment 76's complaint — "a single
 * object could potentially have bits that are red, blue, or green" — re-created
 * along the time axis instead of the aspect axis. Color therefore means
 * certainty and only certainty, and age keeps the alpha channel it has held
 * since Story 4.2 (amendment 64's three-channel split, intact).
 */
export interface HeatGrid {
  /** World units per cell. */
  cellU: number;
  /**
   * THE ALLOCATION side length, in cells (amendment 93). The backing arrays are
   * `capCols × capCols` and are sized ONCE, from the worst-case bound
   * `heatExtentU()` — never from what is on screen. Nothing per-frame may touch
   * this much of the buffer; `cols`/`rows` below are what a frame actually
   * costs.
   */
  capCols: number;
  /** ACTIVE rect width this frame, in cells (≤ capCols). Also the row STRIDE of
   *  `w`/`a` and of the quantized RGBA. */
  cols: number;
  /** ACTIVE rect height this frame, in cells (≤ capCols). */
  rows: number;
  /** ABSOLUTE world cell index of column 0 / row 0 of the ACTIVE rect. */
  baseGx: number;
  baseGy: number;
  /** World coordinate of the ACTIVE rect's top-left corner (= baseG* × cellU). */
  originX: number;
  originY: number;
  /** Per-cell intensity — the quantization input. */
  w: Float32Array;
  /** Per-cell age opacity of the paint that won that cell. */
  a: Float32Array;
}

/** Side length in cells of the square buffer covering `2 × radiusU`, plus two
 *  cells of slack so a snapped origin can never leave the far edge short. */
export function gridCols(radiusU: number, cellU: number): number {
  return Math.max(1, Math.ceil((2 * radiusU) / cellU) + 2);
}

/**
 * Allocate a square buffer covering `2 × radiusU` (ruling R2) at `cellU`
 * resolution.
 *
 * `radiusU` IS THE WORST-CASE BOUND, NOT THE RADAR RANGE (amendment 93). The
 * caller passes `heatExtentU()`: the farthest a paint can be created PLUS the
 * farthest the observer can sail before it decays. Sizing this square to radar
 * range — what shipped through cycle 56 — clipped any paint the observer sailed
 * away from and un-clipped it if they sailed back, which is de-rendering for a
 * reason that is not decay. The allocation is deliberately several times the
 * region a frame draws; `anchorRect` is what keeps the per-frame cost off it.
 */
export function makeGrid(radiusU: number, cellU: number): HeatGrid {
  const cols = gridCols(radiusU, cellU);
  const n = cols * cols;
  return {
    cellU,
    capCols: cols,
    cols,
    rows: cols,
    baseGx: 0,
    baseGy: 0,
    originX: 0,
    originY: 0,
    w: new Float32Array(n),
    a: new Float32Array(n),
  };
}

/**
 * Point the grid at an ACTIVE RECT of absolute world cells and clear exactly
 * that much of it.
 *
 * THE SNAP IS THE POINT (ruling R2). The rect is expressed in whole ABSOLUTE
 * cell indices, so cell (gx, gy) always covers the same world square no matter
 * where the rect sits — which is what makes `cellNoise(seed, gx, gy)` a stable
 * property of a place rather than a flicker that re-rolls every frame.
 *
 * THE RECT IS A COST BOUNDARY, NOT A VISIBILITY RULE (amendment 93). It is
 * chosen from the LIVE PAINTS THEMSELVES (`liveRect`), so it always contains
 * every cell every live paint writes: nothing can be dropped by it in the
 * bounded case. The clamp to `capCols` exists only for the unbounded one (a
 * respawn teleports the observer), and the allocation is sized so ordinary
 * sailing can never reach it.
 *
 * THE GRID CARRIES NO OBSERVER (amendment 85, and still true after 88 and 93).
 * It is a window onto the world, nothing more: where it sits decides only which
 * cells are IN BOUNDS this frame. Every judgement about a paint — including
 * whether a cell paints at all — belongs to the paint, taken at its own
 * creation. Cycle 54's `obsX`/`obsY`/`sightR2` lived here and were re-read every
 * frame, which is precisely how a receding sight bubble came to paint coastline
 * no beam had swept; cycle 56 retired the sight verdict outright, but the
 * discipline that removed it from here is the governing invariant and stands.
 */
export function anchorRect(g: HeatGrid, r: CellRect): void {
  g.cols = Math.max(0, Math.min(r.cols, g.capCols));
  g.rows = Math.max(0, Math.min(r.rows, g.capCols));
  g.baseGx = r.gx0;
  g.baseGy = r.gy0;
  g.originX = r.gx0 * g.cellU;
  g.originY = r.gy0 * g.cellU;
  const n = g.cols * g.rows;
  g.w.fill(0, 0, n);
  g.a.fill(0, 0, n);
}

/**
 * Re-centre the FULL allocation on (cx, cy) and clear it — the whole-buffer
 * anchor, kept for the observation/test seam and for the "no rect yet" case.
 *
 * The per-frame path does NOT use this: it costs the whole worst-case square,
 * which is exactly what amendment 93 forbids paying every frame. `liveRect` +
 * `anchorRect` is the frame path.
 */
export function anchorGrid(g: HeatGrid, cx: number, cy: number): void {
  const half = (g.capCols * g.cellU) / 2;
  anchorRect(g, {
    gx0: Math.floor((cx - half) / g.cellU),
    gy0: Math.floor((cy - half) / g.cellU),
    cols: g.capCols,
    rows: g.capCols,
  });
}

/** World cell index containing world coordinate `v`. */
export function cellOf(v: number, cellU: number): number {
  return Math.floor(v / cellU);
}

/** Centre of world cell `gx` on one axis. */
export function cellCentre(gx: number, cellU: number): number {
  return (gx + 0.5) * cellU;
}

/**
 * Write one cell, MAX-WINS. Overlapping paints never sum: additive accumulation
 * would let two weak ghosts of one contact fabricate a red core that neither
 * return earned, which is the same "color is lying about strength" failure from
 * the other direction. Out-of-grid writes are dropped silently — a paint at the
 * rim legitimately overhangs the buffer.
 *
 * NO GATE LIVES HERE (amendment 85, and nothing may put one back). A write
 * chokepoint is the wrong home for any judgement about a paint, because it runs
 * every frame while the paint was born once: whatever it consults is by
 * construction LIVE state. Cycle 55 moved the sight verdict out of here to the
 * two places a paint is CREATED; cycle 56 then retired that verdict altogether.
 */
export function writeCell(g: HeatGrid, gx: number, gy: number, intensity: number, alpha: number): void {
  const cx = gx - g.baseGx;
  const cy = gy - g.baseGy;
  if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) return;
  const i = cy * g.cols + cx;
  if (!(intensity > g.w[i])) return;
  g.w[i] = intensity;
  g.a[i] = alpha;
}

/** Read one cell by world position (test/observation seam). */
export function sampleGrid(g: HeatGrid, x: number, y: number): { w: number; a: number } {
  const cx = cellOf(x, g.cellU) - g.baseGx;
  const cy = cellOf(y, g.cellU) - g.baseGy;
  if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) return { w: 0, a: 0 };
  const i = cy * g.cols + cx;
  return { w: g.w[i], a: g.a[i] };
}

/**
 * Quantize the whole buffer into RGBA bytes (straight alpha — the texture source
 * premultiplies on upload).
 *
 * Every lit pixel takes its band color VERBATIM. The only continuous quantity
 * that survives to the screen is opacity, which carries age exactly as it has
 * since Story 4.2 — never a hue.
 */
export function quantizeInto(g: HeatGrid, bands: readonly HeatBand[], out: Uint8Array): void {
  for (let i = 0, n = g.cols * g.rows; i < n; i++) {
    const o = i * 4;
    const b = bandIndex(g.w[i], bands);
    if (b < 0) {
      out[o] = 0;
      out[o + 1] = 0;
      out[o + 2] = 0;
      out[o + 3] = 0;
      continue;
    }
    const band = bands[b];
    out[o] = (band.color >> 16) & 0xff;
    out[o + 1] = (band.color >> 8) & 0xff;
    out[o + 2] = band.color & 0xff;
    out[o + 3] = Math.round(255 * clamp01(band.alpha * g.a[i]));
  }
}

// --- 3. seeds and noise -------------------------------------------------------

/**
 * The seed for one paint: a 32-bit avalanche of (track key, paint time). Both
 * inputs matter — the KEY stops every paint of one contact being the same
 * re-roll, the TIME makes the next paint of that contact differ. Carried
 * forward verbatim from the retired returnMarks.blobSeed, because the contract
 * it serves (amendment 70's "stable while it decays, different next sweep") did
 * not change when the primitive did.
 */
export function paintSeed(key: string, paintT: number): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), FNV_PRIME);
  }
  h = Math.imul(h ^ (paintT | 0), TIME_MIX);
  h = Math.imul(h ^ (h >>> 15), AVALANCHE_MIX);
  return (h ^ (h >>> 13)) >>> 0;
}

/**
 * Deterministic [0,1) noise for (paint seed, ABSOLUTE world cell) — ruling R3.
 *
 * Absolute world cell, not buffer cell: the grid re-anchors every frame as the
 * observer moves, so hashing the buffer index would re-roll the whole texture
 * every time the ship crossed a cell boundary. Hashing the world cell makes the
 * noise a property of the PLACE, so a paint's ragged edges are frozen for its
 * entire decay and the scope stops boiling.
 */
export function cellNoise(seed: number, gx: number, gy: number): number {
  let h = Math.imul(seed ^ FNV_OFFSET, FNV_PRIME);
  h = Math.imul(h ^ (gx | 0), TIME_MIX);
  h = Math.imul(h ^ (gy | 0), FNV_PRIME);
  h = Math.imul(h ^ (h >>> 15), AVALANCHE_MIX);
  return ((h ^ (h >>> 13)) >>> 0) / U32;
}

/**
 * The noise MULTIPLIER for a cell: 1 ± `amount`.
 *
 * This is what makes the three bands INTERLEAVE at their boundaries instead of
 * forming three clean concentric rings — the difference between "a radar return"
 * and "a target reticle". `amount <= 0` is an exact 1 (a clean-edge debug mode
 * and the deterministic path the geometry tests use).
 */
export function noiseMul(seed: number, gx: number, gy: number, amount: number): number {
  if (!(amount > 0)) return 1;
  return 1 + amount * (2 * cellNoise(seed, gx, gy) - 1);
}

// --- 4. ship echoes ------------------------------------------------------------

/** Tunables for a ship echo kernel (CLIENT_CONFIG.blip.heatmap.ship). */
export interface ShipEchoOpts {
  /** Smallest drawable ACROSS extent (u) — a bow-on needle is weak, not absent. */
  minExtent: number;
  /** Range depth as a fraction of the across extent (the scope's range smear). */
  depthFrac: number;
  /** Smallest drawable range depth (u). */
  minDepth: number;
  /** Asymptotic floor of the attenuation curve (strictly > 0, never reached). */
  attenFloor: number;
  /** Range at which the above-floor part has halved, as a fraction of radar range. */
  attenHalfRange: number;
  /** Attenuated ACROSS extent (u) that reads as a full-strength core. */
  strongExtent: number;
  /** Floor on a kernel's PEAK intensity, so the weakest echo still paints. */
  minPeak: number;
}

/** Tunables for island landmass fill (CLIENT_CONFIG.blip.heatmap.island). */
export interface IslandEchoOpts {
  /** Depth (u) inside the coastline at which land reads at full solidity. */
  depthFullU: number;
  /** Solidity floor at the waterline — land is land, so the coast still paints. */
  minLand: number;
  /** Gain applied to solidity before range attenuation (clamped to 1 after). */
  gain: number;
  /** Terminator ramp width, as a fraction of the island's bounding radius. */
  terminator: number;
  /** Hard cap on covered cells per island paint. */
  maxCells: number;
}

/** Everything the rasterizer needs from CLIENT_CONFIG. */
export interface HeatmapOpts {
  cellU: number;
  noise: number;
  bands: readonly HeatBand[];
  ship: ShipEchoOpts;
  island: IslandEchoOpts;
}

/**
 * Range attenuation at `dist` for an observer whose radar reaches `radarRange`.
 *
 * Carried forward from the retired returnMarks.ts unchanged, floor and all:
 * STRICTLY DECREASING everywhere, with the floor as an ASYMPTOTE rather than a
 * clamp so two different ranges never attenuate identically.
 *
 *     atten(d) = floor + (1 − floor) / (1 + d / (halfRange · radarRange))
 */
export function rangeAttenuation(dist: number, radarRange: number, o: ShipEchoOpts): number {
  const ref = o.attenHalfRange * radarRange;
  if (!(ref > 0)) return 1;
  return o.attenFloor + (1 - o.attenFloor) / (1 + Math.max(0, dist) / ref);
}

/**
 * The kernel's PEAK intensity — what its core cell reads before noise.
 *
 * Aspect-projected `ext`, attenuated by range, normalized against
 * `strongExtent` (amendment 66's channel, unchanged: hull geometry × relative
 * bearing × range and NOTHING else — never boons, hp or damage state). The
 * `minPeak` floor is what keeps the weakest legitimate return visible as a
 * green speck rather than vanishing under `bands[0].at`.
 */
export function shipPeak(ext: number, dist: number, radarRange: number, o: ShipEchoOpts): number {
  const strong = o.strongExtent > 0 ? o.strongExtent : 1;
  const raw = (Math.max(0, ext) * rangeAttenuation(dist, radarRange, o)) / strong;
  return clamp01(Math.max(o.minPeak, raw));
}

/** The kernel's two semi-axes (u): ACROSS the bearing (the `ext` channel) and
 *  ALONG it (the scope's range smear, floored so a needle still has a body). */
export function shipAxes(
  ext: number,
  dist: number,
  radarRange: number,
  o: ShipEchoOpts,
): { across: number; along: number } {
  const across = Math.max(o.minExtent, Math.max(0, ext) * rangeAttenuation(dist, radarRange, o));
  return { across, along: Math.max(o.minDepth, across * o.depthFrac) };
}

/**
 * One resolved contact echo in the paint list (world geometry + server time).
 *
 * `bearing` and `dist` are FROZEN at creation and never re-derived (amendment
 * 83): that freeze is why range attenuation correctly never changes as you sail
 * away. Cycle 56 removed the sight verdict that briefly rode alongside them
 * (amendment 88); the freezing discipline they exemplify is untouched.
 *
 * TWO SOURCES BUILD THIS RECORD, and they are complementary by range. Beyond
 * truesight it is a WIRE blip (`ReturnBlipEvent`, resolved against the observer
 * in render/radar.ts); inside truesight it is synthesized from the ship's
 * `Contact` by `contactEcho` (ruling R7). Both carry the contact's id, so both
 * answer to ONE per-track paint cap.
 */
export interface ShipPaint {
  kind: 'ship';
  /** Contact id — the per-track cap key, shared by both sources (ruling R7). */
  id: string;
  x: number;
  y: number;
  /** Aspect-projected extent (u) BEFORE range attenuation, straight off the wire. */
  ext: number;
  /** Observer→echo bearing (rad) AT PAINT TIME. */
  bearing: number;
  /** Observer→echo distance (u) AT PAINT TIME. */
  dist: number;
  /** Server paint time (ms) — the age channel. */
  t: number;
  seed: number;
}

/**
 * How far (u) a ship kernel reaches from its own centre — the half-extent of
 * the cell box `stampShip` walks, and therefore the ONE number the active-rect
 * bound has to agree with.
 *
 * Extracted so the stamper and the footprint calculation cannot drift: if this
 * ever under-reported, `liveRect` would return a rect the stamper writes
 * outside of, and `writeCell` would silently drop the overhang — the exact
 * clipping amendment 93 exists to kill, re-created one layer down.
 */
export function shipReachU(
  p: ShipPaint,
  cellU: number,
  radarRange: number,
  o: HeatmapOpts,
): number {
  const { across, along } = shipAxes(p.ext, p.dist, radarRange, o.ship);
  return Math.max(cellU * 0.85, Math.max(across, along) / 2);
}

/**
 * Stamp one contact echo: a paraboloid dome over the aspect ellipse.
 *
 * `1 − q²` (no sqrt, no pow) falls from `peak` at the core to 0 at the ellipse
 * edge, so ONE strong return crosses every band on its way out — red core, blue
 * surround, green fringe — which is the headline requirement of amendment 77. A
 * weak return simply starts below the top threshold and never reaches red: that
 * is how strength keeps reading once color has stopped being a label.
 *
 * The semi-axes are floored at 0.85 cells so the smallest echo still lights its
 * own cell: at exactly half a cell, a paint sitting on a cell corner would land
 * at q² = 2 and stamp nothing at all.
 *
 * NO SIGHT GATE (ruling R6, amendment 88). Every cell of the kernel paints,
 * inside truesight or out — the scope paints everything in radar range. What the
 * kernel reads is decided entirely by the paint's own frozen `ext`/`bearing`/
 * `dist`, so it is byte-stable across the paint's whole decay and against every
 * later position of the observer.
 */
export function stampShip(
  g: HeatGrid,
  p: ShipPaint,
  alpha: number,
  radarRange: number,
  o: HeatmapOpts,
): void {
  const { across, along } = shipAxes(p.ext, p.dist, radarRange, o.ship);
  const floor = g.cellU * 0.85;
  const ax = Math.max(floor, along / 2);
  const ay = Math.max(floor, across / 2);
  const peak = shipPeak(p.ext, p.dist, radarRange, o.ship);
  const cos = Math.cos(p.bearing);
  const sin = Math.sin(p.bearing);
  const reach = shipReachU(p, g.cellU, radarRange, o);
  const gy1 = cellOf(p.y + reach, g.cellU);
  const gx1 = cellOf(p.x + reach, g.cellU);
  for (let gy = cellOf(p.y - reach, g.cellU); gy <= gy1; gy++) {
    const wy = cellCentre(gy, g.cellU) - p.y;
    for (let gx = cellOf(p.x - reach, g.cellU); gx <= gx1; gx++) {
      const wx = cellCentre(gx, g.cellU) - p.x;
      const u = (wx * cos + wy * sin) / ax;
      const v = (wy * cos - wx * sin) / ay;
      const q2 = u * u + v * v;
      if (q2 >= 1) continue;
      writeCell(g, gx, gy, peak * (1 - q2) * noiseMul(p.seed, gx, gy, o.noise), alpha);
    }
  }
  // A RETURN ALWAYS LIGHTS THE CELL IT IS IN. The dome falls to zero at the
  // ellipse edge, so the smallest echo — whose semi-axes are the cell floor —
  // can otherwise sit near a cell CORNER, land at q² > 1 in every neighbour and
  // paint nothing at all. `writeCell` is max-wins, so this can only ever add the
  // core the profile already intends.
  const cgx = cellOf(p.x, g.cellU);
  const cgy = cellOf(p.y, g.cellU);
  writeCell(g, cgx, cgy, peak * noiseMul(p.seed, cgx, cgy, o.noise), alpha);
}

// --- 5. island landmass -------------------------------------------------------

/** One covered land cell of an island paint: absolute world cell, its baked
 *  intensity, and the observer bearing that has to be swept before it paints. */
export interface CoverCell {
  gx: number;
  gy: number;
  i: number;
  b: number;
}

/** One island paint in the list: the landmass, the observer it was painted
 *  FROM, the arc the beam has swept across it so far, and its server time. */
export interface IslandPaint {
  kind: 'island';
  isle: Island;
  /** Beam bearing when this paint opened, and where the beam has reached. */
  from: number;
  to: number;
  /** True once the beam has left the island's span — the arc test is then moot. */
  full: boolean;
  t: number;
  /** Baked coverage (built once, from the observer at paint time). The bake
   *  freezes intensity, `faceShadow` and cross-island LOS; nothing in it is ever
   *  re-evaluated against live state (amendment 83). There is no sight term in
   *  it any more — the scope paints everything in radar range (amendment 88). */
  cover: readonly CoverCell[];
  /** The cover's absolute-cell bounding rect, baked ALONGSIDE it (`coverBox`).
   *  Frozen like everything else on a paint, and precomputed rather than
   *  rescanned: the active-rect union runs every frame, and re-deriving this
   *  from `cover` there would double the per-frame island cost for a number that
   *  can never change. Empty cover ⇒ a zero-size rect, which unions away. */
  box: CellRect;
}

/** The absolute-cell bounding rect of a baked coverage list — the island half of
 *  the active-rect union. A zero-size rect for empty cover. */
export function coverBox(cover: readonly CoverCell[]): CellRect {
  if (cover.length === 0) return { gx0: 0, gy0: 0, cols: 0, rows: 0 };
  let gx0 = cover[0].gx;
  let gy0 = cover[0].gy;
  let gx1 = gx0;
  let gy1 = gy0;
  for (const c of cover) {
    if (c.gx < gx0) gx0 = c.gx;
    else if (c.gx > gx1) gx1 = c.gx;
    if (c.gy < gy0) gy0 = c.gy;
    else if (c.gy > gy1) gy1 = c.gy;
  }
  return { gx0, gy0, cols: gx1 - gx0 + 1, rows: gy1 - gy0 + 1 };
}

export type RadarPaint = ShipPaint | IslandPaint;

/**
 * The terminator factor at `p`: 1 on the observer-facing side, ramping to 0
 * across the far shoulder.
 *
 * `m = ((P−C)·û − |P−C|²/d) / r` is 0 exactly on the visible horizon of P's own
 * concentric circle — on the coastline (|P−C| = r) that is the classic tangent
 * condition `cos >= r/d`, so the filled mass agrees with the near-arc rule
 * cycle 51 shipped. `term` widens the ramp so the shadow line reads as shadow.
 */
export function faceShadow(p: Vec2, isle: Island, obs: Vec2, term: number): number {
  const ux = obs.x - isle.x;
  const uy = obs.y - isle.y;
  const d = Math.hypot(ux, uy);
  if (!(d > 1)) return 1; // observer effectively at the centre — no near side
  const px = p.x - isle.x;
  const py = p.y - isle.y;
  const rho2 = px * px + py * py;
  const r = Math.max(1, isle.r);
  const m = ((px * ux + py * uy) / d - rho2 / d) / r;
  return term > 0 ? clamp01(1 + m / term) : (m >= 0 ? 1 : 0);
}

/**
 * How SOLID the land is at `p`: 0 at the coastline, 1 at `depthFullU` inside it.
 *
 * This is what makes a big island read as a big red mass with softer edges
 * (amendment 78) while a lone rock never gets deep enough to reach red at all —
 * "honestly not sure, could be something tiny" is the literally correct read of
 * a 25u rock.
 *
 * `isle.core` (the largest disc about the bounding centre that is fully inside
 * the polygon) is the cheap early-out: any point inside it is at least
 * `core − |P−C|` from the coastline, so a deep interior cell answers without
 * touching a single polygon edge. Only cells near the coast pay for
 * `nearestCoastPoint`.
 */
export function solidity(p: Vec2, isle: Island, depthFullU: number): number {
  if (!(depthFullU > 0)) return 1;
  const dc = Math.hypot(p.x - isle.x, p.y - isle.y);
  if (isle.core - dc >= depthFullU) return 1;
  return clamp01(nearestCoastPoint(p, isle).dist / depthFullU);
}

/**
 * The islands that could shadow `isle` for this observer — the ONLY ones the
 * per-cell LOS test has to run against.
 *
 * Cross-island occlusion is not new (Eric ruling 2026-08-02: islands block every
 * sensor at all ranges; cycle 51's review gate enforced it on coast marks), but
 * running `islandBlocksSegment` for every cell × every island would be the
 * quadratic the perf budget cannot pay. A candidate must be NEARER the observer
 * than this island's far side AND its bounding circle must lie across the
 * observer→island corridor. On a map whose landmasses are placed with a
 * CHANNEL_MIN gap this is almost always empty.
 */
export function occluderCandidates(isle: Island, field: readonly Island[], obs: Vec2): Island[] {
  const d = Math.hypot(isle.x - obs.x, isle.y - obs.y);
  return field.filter(
    (other) =>
      other !== isle &&
      Math.hypot(other.x - obs.x, other.y - obs.y) < d + isle.r &&
      segCircleHit(obs, isle, other, other.r + isle.r) !== null,
  );
}

/**
 * Is `p` land? THE EXACT POLYGON decides — `pointInIsland` runs its own
 * bounding-circle broadphase and then the real coastline test.
 *
 * The `core` disc is the cheap early-IN (island.ts's own documented shortcut):
 * it is by definition wholly inside the polygon, so a point in it is land
 * without visiting one edge. That matters here because the coverage bake is the
 * only expensive thing in this file and the interior is most of it.
 */
function inLand(p: Vec2, isle: Island): boolean {
  const dx = p.x - isle.x;
  const dy = p.y - isle.y;
  if (isle.core > 0 && dx * dx + dy * dy <= isle.core * isle.core) return true;
  return pointInIsland(p, isle);
}

/** Intensity of one candidate land cell, or 0 if it does not paint at all. */
function coverIntensity(
  p: Vec2,
  isle: Island,
  obs: Vec2,
  radarRange: number,
  o: HeatmapOpts,
  occ: readonly Island[],
): number {
  const dist = Math.hypot(p.x - obs.x, p.y - obs.y);
  const shadow = faceShadow(p, isle, obs, o.island.terminator);
  if (shadow <= 0) return 0;
  if (!inLand(p, isle)) return 0;
  for (const other of occ) if (islandBlocksSegment(obs, p, other)) return 0;
  const isl = o.island;
  // `minLand` remapped, not clamped: land is land, so the waterline still
  // returns something, but the interior keeps the full range of the scale above
  // it. `gain` is what lets a solid interior stay RED out to the rim instead of
  // sliding to blue with range — amendment 78 asked for a big red mass, not a
  // big mass that is only red when you are on top of it.
  const sol = isl.minLand + (1 - isl.minLand) * solidity(p, isle, isl.depthFullU);
  return clamp01(sol * isl.gain * shadow * rangeAttenuation(dist, radarRange, o.ship));
}

/**
 * Bake an island's observer-facing landmass into a coverage list, ONCE per paint.
 *
 * Bounded three ways (the perf contract): a bounding-box scan in CELLS, not in
 * polygon vertices; `pointInIsland`'s own broadphase plus the `core` early-out
 * inside `solidity`, so most interior cells never visit an edge; and an
 * occluder shortlist so the LOS test is normally skipped entirely. Cells are
 * stored in ABSOLUTE world indices, so the list survives every re-anchor of the
 * grid and is never rebuilt as the observer moves.
 *
 * NO SIGHT TERM (ruling R6, amendment 88). Cycle 54 filtered truesight cells out
 * here and cycle 55 froze that filter to bake time; cycle 56 retired the verdict
 * itself, so a coastline inside the bubble now bakes and paints like any other.
 * What remains frozen at bake time is what always was: per-cell intensity,
 * `faceShadow`, and the cross-island LOS shortlist.
 */
export function buildIslandCoverage(
  isle: Island,
  field: readonly Island[],
  obs: Vec2,
  radarRange: number,
  seed: number,
  o: HeatmapOpts,
): CoverCell[] {
  const out: CoverCell[] = [];
  const occ = occluderCandidates(isle, field, obs);
  const r2 = isle.r * isle.r;
  const range2 = radarRange * radarRange;
  const gx0 = cellOf(isle.x - isle.r, o.cellU);
  const gx1 = cellOf(isle.x + isle.r, o.cellU);
  const gy1 = cellOf(isle.y + isle.r, o.cellU);
  for (let gy = cellOf(isle.y - isle.r, o.cellU); gy <= gy1 && out.length < o.island.maxCells; gy++) {
    const y = cellCentre(gy, o.cellU);
    for (let gx = gx0; gx <= gx1 && out.length < o.island.maxCells; gx++) {
      const x = cellCentre(gx, o.cellU);
      // The two scalar rejections run on raw numbers BEFORE anything allocates a
      // point or calls into polygon math. Most of a bounding box is neither in
      // the bounding circle nor in radar range, and paying a Vec2 plus a
      // function call for each of those cells was the whole bake's cost.
      if (!inBroadphase(x, y, isle, obs, r2, range2)) continue;
      const p = { x, y };
      const i = coverIntensity(p, isle, obs, radarRange, o, occ) * noiseMul(seed, gx, gy, o.noise);
      if (i > 0) out.push({ gx, gy, i, b: Math.atan2(y - obs.y, x - obs.x) });
    }
  }
  return out;
}

/** Bounding circle + radar range, in raw scalars — the allocation-free prefilter
 *  in front of every exact test. */
function inBroadphase(
  x: number,
  y: number,
  isle: Island,
  obs: Vec2,
  r2: number,
  range2: number,
): boolean {
  const dx = x - isle.x;
  const dy = y - isle.y;
  if (dx * dx + dy * dy > r2) return false;
  const ox = x - obs.x;
  const oy = y - obs.y;
  return ox * ox + oy * oy <= range2;
}

/** Stamp an island paint: every covered cell whose bearing the beam has reached.
 *  Nothing is judged here — `cover` is a finished record baked at paint open,
 *  and the only live input is which part of the arc the beam has swept. */
export function stampIsland(g: HeatGrid, p: IslandPaint, alpha: number): void {
  const span = wrapPositive(p.to - p.from);
  for (const c of p.cover) {
    if (!p.full && wrapPositive(c.b - p.from) > span) continue;
    writeCell(g, c.gx, c.gy, c.i, alpha);
  }
}

// --- 6. the frame ---------------------------------------------------------------

/** Per-frame inputs the rasterizer needs beyond the paint list itself. */
export interface RasterCtx {
  now: number;
  lifeMs: number;
  /** Colorblind-assist alpha floor (`blipAlpha`'s minAlpha). */
  alphaFloor: number;
  radarRange: number;
  opts: HeatmapOpts;
}

/**
 * RE-RASTERIZE THE WHOLE BUFFER FROM THE PAINT LIST (ruling R1).
 *
 * The caller has already anchored (and therefore cleared) the grid. Nothing
 * decays in place; a paint's only per-frame state is its age, which becomes the
 * alpha channel of every cell it wins. Dead paints (alpha 0) are skipped here
 * and pruned by the caller.
 */
export function rasterize(g: HeatGrid, paints: readonly RadarPaint[], ctx: RasterCtx): void {
  for (const p of paints) {
    const alpha = blipAlpha(ctx.now - p.t, ctx.lifeMs, ctx.alphaFloor);
    if (alpha <= 0) continue;
    if (p.kind === 'ship') stampShip(g, p, alpha, ctx.radarRange, ctx.opts);
    else stampIsland(g, p, alpha);
  }
}

/**
 * Rect QUANTIZATION STEP, in cells. The active rect is rounded UP to a multiple
 * of this before it is used.
 *
 * Why round at all: the rect is recomputed from the live paints every frame, so
 * without a step it would change by a cell or two constantly — and every change
 * in its SIZE reallocates the GPU texture (Pixi's `TextureSource.resize` bumps
 * the resource id). Rounding to a coarse step makes the size change only when
 * the scope's real footprint grows or shrinks by a meaningful amount, at a cost
 * of at most one step of extra cells per axis. Position is free to move every
 * frame — that is one sprite transform, not an upload.
 */
export const RECT_BUCKET = 32;

/** Round `n` up to a multiple of `q` (`q <= 1` = no rounding). */
export function bucketUp(n: number, q: number): number {
  const v = Math.max(0, Math.ceil(n));
  return q > 1 ? Math.ceil(v / q) * q : v;
}

/** The absolute-cell rect ONE paint can write into — its exact footprint. */
export function paintRect(p: RadarPaint, cellU: number, ctx: RasterCtx): CellRect {
  if (p.kind === 'island') return p.box;
  const reach = shipReachU(p, cellU, ctx.radarRange, ctx.opts);
  const gx0 = cellOf(p.x - reach, cellU);
  const gy0 = cellOf(p.y - reach, cellU);
  return {
    gx0,
    gy0,
    cols: cellOf(p.x + reach, cellU) - gx0 + 1,
    rows: cellOf(p.y + reach, cellU) - gy0 + 1,
  };
}

/** Smallest rect containing both (a zero-size rect contributes nothing). */
export function unionRect(a: CellRect | null, b: CellRect): CellRect | null {
  if (b.cols <= 0 || b.rows <= 0) return a;
  if (a === null) return b;
  const gx0 = Math.min(a.gx0, b.gx0);
  const gy0 = Math.min(a.gy0, b.gy0);
  return {
    gx0,
    gy0,
    cols: Math.max(a.gx0 + a.cols, b.gx0 + b.cols) - gx0,
    rows: Math.max(a.gy0 + a.rows, b.gy0 + b.rows) - gy0,
  };
}

/**
 * THE ACTIVE SUB-RECT for this frame: the union of every LIVE paint's footprint,
 * rounded out to `RECT_BUCKET` and clamped to the allocation — or null when
 * nothing is live.
 *
 * THIS IS THE WHOLE PER-FRAME COST STORY (amendment 93). The buffer is allocated
 * for the worst case a paint's life can reach, which is several times the old
 * radar-range square; clearing, quantizing and uploading all of that every frame
 * would be a real regression. So the frame works over the region the paints
 * ACTUALLY occupy, which in ordinary play is a small box around the observer and
 * costs what it cost before the allocation grew.
 *
 * IT CAN NEVER DROP A PAINT, and that is a structural property, not a tuning
 * choice: the rect is derived FROM the paint list, by unioning the same
 * footprint each paint's stamper walks. The only way out of the rect is the
 * `capCols` clamp, which the allocation bound puts out of reach of any observer
 * that got where it is by sailing.
 *
 * The centring on clamp keeps the middle of the union rather than an edge, so
 * the unbounded case (a respawn teleport) degrades symmetrically instead of
 * lopping one side off.
 */
export function liveRect(
  g: HeatGrid,
  paints: readonly RadarPaint[],
  ctx: RasterCtx,
): CellRect | null {
  let box: CellRect | null = null;
  for (const p of paints) {
    if (blipAlpha(ctx.now - p.t, ctx.lifeMs, ctx.alphaFloor) <= 0) continue;
    box = unionRect(box, paintRect(p, g.cellU, ctx));
  }
  if (box === null) return null;
  const cols = Math.min(g.capCols, bucketUp(box.cols, RECT_BUCKET));
  const rows = Math.min(g.capCols, bucketUp(box.rows, RECT_BUCKET));
  return {
    gx0: box.gx0 - Math.floor((cols - box.cols) / 2),
    gy0: box.gy0 - Math.floor((rows - box.rows) / 2),
    cols,
    rows,
  };
}

/** The rect that means "nothing is live": zero cells, so every sample misses,
 *  every clear is free and `bandAt` answers -1 (see radar.ts paintHeat). */
export const EMPTY_RECT: CellRect = { gx0: 0, gy0: 0, cols: 0, rows: 0 };

// --- 7. sweep bookkeeping -------------------------------------------------------

/**
 * Did the beam cross `target` while advancing from `from` to `to`?
 *
 * Half-open in the direction of travel — `(from, to]` — so a bearing exactly on
 * a frame boundary paints once, never twice. A zero-width advance (a stalled
 * clock, or two render calls inside the same millisecond) crosses nothing,
 * which is what keeps a paused tab from stacking duplicate paints.
 */
export function sweepCrossed(from: number, to: number, target: number): boolean {
  const span = wrapPositive(to - from);
  if (span <= 0) return false;
  const off = wrapPositive(target - from);
  return off > 0 && off <= span;
}

/** Does the swept arc `(from, to]` touch the bearing interval `centre ± half`? */
export function arcOverlaps(from: number, to: number, centre: number, half: number): boolean {
  return (
    sweepCrossed(from, to, centre - half) ||
    sweepCrossed(from, to, centre + half) ||
    sweepCrossed(centre - half, centre + half, to)
  );
}

/**
 * The bearing interval an island subtends from `obs`, or null when it cannot
 * paint at all (the observer is AGROUND on it, or it is wholly out of radar
 * range).
 *
 * FRACTAL-ISLAND CORRECTION: the aground test is `pointInIsland`, not the old
 * `dist <= r`. A bounding circle can easily contain water — a cove, the gap
 * inside a bent ridge — and the retired code treated an observer sitting in one
 * as run aground and silently painted no coastline at all. When the observer IS
 * inside the bounding circle but afloat, the island subtends the whole circle.
 */
export function islandBearingSpan(
  isle: Island,
  obs: Vec2,
  radarRange: number,
): { centre: number; half: number } | null {
  const dx = isle.x - obs.x;
  const dy = isle.y - obs.y;
  const dist = Math.hypot(dx, dy);
  if (dist - isle.r > radarRange) return null;
  if (pointInIsland(obs, isle)) return null;
  return {
    centre: Math.atan2(dy, dx),
    half: dist > isle.r ? Math.asin(Math.min(1, isle.r / dist)) : Math.PI,
  };
}

/** Full turn (rad) — exported so the adapter can mark a paint complete. */
export const FULL_TURN = TAU;

// --- 8. contact-derived echoes (ruling R7, amendment 89) ------------------------

/** The part of a `Contact` an echo is synthesized from: identity, where it is,
 *  and the two fields `perpendicularExtent` needs. Deliberately a structural
 *  subset of `Contact` (plus the interpolated pose the renderer draws), so this
 *  module never imports the wire type or the snapshot layer. */
export interface EchoContact {
  id: string;
  x: number;
  y: number;
  heading: number;
  cls: HullId;
}

/** Scratch polygon for the extent computation — the mirror of the server's own
 *  `EXT_SCRATCH` (game/signals.ts). Consumed synchronously inside
 *  `contactEcho`, never retained, so one array serves every contact. */
const EXT_SCRATCH: Vec2[] = [];

/**
 * THE SECOND SOURCE OF SHIP PAINTS: a sighted hull's echo, synthesized from its
 * `Contact` (ruling R7, amendment 89). Returns the paint the beam just earned,
 * or null when this contact is not the client's to paint on this frame.
 *
 * WHY IT EXISTS. The server has never sent a blip for a ship inside sight —
 * `blipGate` excludes `dist <= sightRange` because a sighted hull is delivered
 * as a full `Contact` instead. That rule is a perception-invariant surface and
 * is untouched. Retiring the sight gate (amendment 88) without this would paint
 * coastline inside the bubble and leave every sighted hull a hole in it.
 *
 * FOUR GATES, CHEAPEST FIRST — and every one of them mirrors a term of the
 * server's own `blipGate` rather than inventing a client rule:
 *
 *   1. RANGE, the EXACT COMPLEMENT. `dist <= sightU` here; `dist > sightU` on
 *      the server. `sightU` is the dazzle-scaled truesight radius both sides
 *      already agree on (`fogHoleRadiusU` ≡ the server's `sightOf`), so no hull
 *      can be painted by both sources and none can fall between them. This is
 *      the ONE line that keeps the two sources from double-painting.
 *   2. THE SWEEP. `sweepCrossed(from, to, bearing)` — the same half-open window
 *      a wire blip answers to, so a contact-derived echo is born when the BEAM
 *      REACHES IT and never on contact arrival or on a frame tick. Amendment 83
 *      governs it exactly as it governs every other paint.
 *   3. ISLAND LOS. Islands block every sensor at all ranges (Eric ruling
 *      2026-08-02) and `blipGate` tests it too. It matters here because a
 *      contact can legitimately reach the client with NO line of sight — a hull
 *      lit by our own star shell — and the radar must not return an echo off a
 *      hull the beam cannot see.
 *   4. THE HULL. An id outside the registry paints nothing rather than throwing
 *      inside the render loop (the `drawBlip` fail-soft, same reasoning).
 *
 * The extent is computed EXACTLY as the server computes it for a wire blip
 * (`echoExtent`): the silhouette posed at the origin with the paint's heading,
 * projected perpendicular to the observer→target bearing. Same input, same
 * footprint — an echo does not change character when a hull crosses the
 * boundary between the two sources.
 */
export function contactEcho(
  c: EchoContact,
  obs: Vec2,
  sightU: number,
  from: number,
  to: number,
  islands: readonly Island[],
  t: number,
): ShipPaint | null {
  const dx = c.x - obs.x;
  const dy = c.y - obs.y;
  const dist = Math.hypot(dx, dy);
  if (!(dist <= sightU)) return null;
  const bearing = Math.atan2(dy, dx);
  if (!sweepCrossed(from, to, bearing)) return null;
  for (const isle of islands) if (islandBlocksSegment(obs, c, isle)) return null;
  const hull = hullSilhouette(c.cls);
  if (hull === undefined) return null;
  const ext = perpendicularExtent(transformPolygon(hull, 0, 0, c.heading, EXT_SCRATCH), bearing);
  return {
    kind: 'ship',
    id: c.id,
    x: c.x,
    y: c.y,
    ext,
    bearing,
    dist,
    t,
    seed: paintSeed(c.id, t),
  };
}

// --- 9. the allocation bound (amendment 93) -------------------------------------
//
// NO CLIPPING, NO EXCEPTIONS. Eric, on the cycle-56 build: *"If it gets painted,
// it STAYS painted until it decays, NO EXCEPTIONS."* Through cycle 56 the buffer
// was allocated as a square of half-extent exactly `radarRange`, re-anchored on
// the observer every frame — so a paint born near the rim was clipped the moment
// the observer sailed outward and reappeared if they sailed back. That is
// de-rendering for a reason that is not decay, and it was the THIRD violation of
// amendment 83 in this family (cycle 55: the gate was evaluated live; cycle 56:
// the sight exclusion; now: the buffer extent). Amendment 83's scope now
// explicitly covers anything that can drop a paint at DRAW time, not just
// anything that can re-decide one.
//
// THE ANSWER IS A DERIVED BOUND, NOT A BIGGER MAGIC NUMBER. A paint's maximum
// possible distance from the observer at the END of its life is computable:
//
//     radarRange                     — the farthest a paint can be CREATED
//   + maxObserverSpeedU × paintLife  — the farthest the observer can then sail
//   + maxKernelReachU                — the kernel's own overhang past its centre
//
// Every term is derived from CONFIG / effectiveStats and none is a literal, so
// retuning ship speed, `sweepRpm`, `persistSweeps`, the hull table or the boon
// catalog moves the allocation with them. The bound test in
// radarHeatmap.test.ts re-derives all three independently and asserts the
// allocation covers them — which is what makes a future retune fail a test
// instead of silently reintroducing the clip.
//
// WHY THE LIVE SWEEP PERIOD IS THE RIGHT LIFE TERM, not the base one: a paint is
// pruned against the LIVE life (`prunePaints`), so a paint still alive at age t
// has t < life-now by definition, and the distance it can have opened up is
// therefore under `speed × life-now` whatever the life used to be. A sweep boon
// that shortens the life shortens the bound honestly.
//
// THE ONE DISCONTINUITY THE BOUND DOES NOT COVER is a teleport — a respawn moves
// the observer without sailing. `liveRect`'s clamp handles it (it can only ever
// bite past the bound), and the death path clears the paint list anyway.

/** Does this effect RAISE one of the two speed terms? A hypothetical card that
 *  lowered them would only shrink the worst case, so it is excluded rather than
 *  folded in. */
function raisesSpeed(e: BoonEffect): boolean {
  if (e.kind !== 'stat') return false;
  if (e.path !== 'kinematics.maxSpeed' && e.path !== 'boost.speedBonus') return false;
  return (e.mult ?? 1) > 1 || (e.add ?? 0) > 0;
}

/** Every speed-raising card in the catalog, at its full physical copy count —
 *  the fastest legal build, assembled FROM the catalog rather than described. */
function maxSpeedFit(): BoonDef[] {
  const out: BoonDef[] = [];
  for (const def of Object.values(BOON_CATALOG)) {
    if (!def.effects.some(raisesSpeed)) continue;
    for (let i = 0; i < def.copies; i++) out.push(def);
  }
  return out;
}

/**
 * THE WORST-CASE OBSERVER SPEED (u/s): the fastest pickable hull, with every
 * speed-raising boon at full stack, under boost.
 *
 * Derived, never written down. `effectiveStats` is the one legal path from
 * (class + boons) to a derived number — the desync firewall — so the fold order,
 * the multiplicative stacking of `shipSpeed` and the additive stacking of
 * `boostMax` are all whatever the sim says they are, not whatever this file
 * assumed. The boost bonus is ADDED rather than folded because that is exactly
 * what `boostedKinematics` does per tick (sim/boost.ts): `maxSpeed + bonus`.
 *
 * DRONES ARE EXCLUDED ON PURPOSE. `CONFIG.drones.small` is nominally faster than
 * any ship class, but the observer is always the local player and OwnShip.cls is
 * a ShipClassId — constants.ts: *"you can never BE a drone"*. The worst case is
 * over the hulls a client can actually steer.
 *
 * KNOWN LIMIT, recorded rather than guessed around: a future `kinematics`
 * BEHAVIOR hook (sim/hooks.ts, HOOK_REGISTRY ships empty) could raise the cap
 * with no stat path to read. Nothing can derive that today; a hook that does it
 * must extend this function.
 */
export function maxObserverSpeedU(): number {
  const fit = maxSpeedFit();
  let best = 0;
  for (const cls of Object.values(CONFIG.shipClasses)) {
    const s = effectiveStats(cls, fit);
    best = Math.max(best, s.kinematics.maxSpeed + s.boost.speedBonus);
  }
  return best;
}

/** The largest aspect extent (u) any hull can present — bounded by the diagonal
 *  of its silhouette's bounding box, over EVERY hull that can paint (drones
 *  included here: a drone is never the observer but is very much a contact). */
export function maxHullExtentU(): number {
  let best = 0;
  const hulls = [...Object.values(CONFIG.shipClasses), ...Object.values(CONFIG.drones)];
  for (const h of hulls) best = Math.max(best, Math.hypot(h.hull.length, h.hull.beam));
  return best;
}

/**
 * The largest distance (u) a ship kernel can reach past its own centre — the
 * `shipReachU` of the biggest hull at zero attenuation. Range attenuation only
 * ever shrinks the axes, so this is a true ceiling.
 */
export function maxKernelReachU(o: HeatmapOpts): number {
  const across = Math.max(o.ship.minExtent, maxHullExtentU());
  const along = Math.max(o.ship.minDepth, across * o.ship.depthFrac);
  return Math.max(o.cellU * 0.85, Math.max(across, along) / 2);
}

/**
 * THE ALLOCATION HALF-EXTENT (u) the heatmap buffer must cover: the farthest any
 * cell of any live paint can sit from the observer, ever. `makeGrid`'s argument.
 *
 * `lifeMs` is the phosphor life the caller prunes against (`blipLifeMs` of the
 * observer's effective sweep period), so the bound tracks a sweep upgrade.
 */
export function heatExtentU(radarRange: number, lifeMs: number, o: HeatmapOpts): number {
  return radarRange + (maxObserverSpeedU() * Math.max(0, lifeMs)) / 1000 + maxKernelReachU(o);
}
