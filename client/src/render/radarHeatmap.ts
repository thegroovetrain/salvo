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
// THE FIVE RULINGS THIS FILE IMPLEMENTS:
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
//   • R6 — NOTHING PAINTS INSIDE THE SIGHT BUBBLE, AND THE RULE IS PER-CELL
//     (cycle 54, amendments 80-82). Inside truesight you are LOOKING, and the
//     scope adds nothing there. Cycle 53 left a real inconsistency: ship echoes
//     never appeared inside truesight (the SERVER's `blipGate` has always
//     excluded `dist <= sightRange`, because a sighted hull arrives as a full
//     `Contact` instead), but island coverage is pure client presentation off
//     the map seed and had no sight term at all — so coastline painted straight
//     through the bubble while hulls did not. This closes it toward NONE.
//
//     PER-CELL, not per-object, is the whole nuance: *"ships that are partially
//     seen and partially in radar range should definitely still be painted"*. An
//     island straddling the boundary paints only the portion beyond it; a hull
//     at the very edge paints the part that lies outside. Skipping whole objects
//     whose centre is inside would delete exactly that case. Only amendment 76's
//     per-pixel intensity makes it expressible at all — a polygon carries one
//     fill and would have had to be wholly in or wholly out.
//
//     The gate lives ON THE GRID (`anchorGrid` sets it, `writeCell` enforces
//     it): that is the single unbypassable write chokepoint, and it folds into
//     the bounds check that every candidate cell already pays. See `insideSight`
//     for why it is a STAMP-time and not a BAKE-time rule.
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
  islandBlocksSegment,
  pointInIsland,
  nearestCoastPoint,
  segCircleHit,
  wrapPositive,
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
  cols: number;
  rows: number;
  /** ABSOLUTE world cell index of column 0 / row 0 (see `anchorGrid`). */
  baseGx: number;
  baseGy: number;
  /** World coordinate of the grid's top-left corner (= baseG* × cellU). */
  originX: number;
  originY: number;
  /** Per-cell intensity — the quantization input. */
  w: Float32Array;
  /** Per-cell age opacity of the paint that won that cell. */
  a: Float32Array;
  /** THE OBSERVER this frame (= the centre `anchorGrid` was called with), and
   *  the centre of the sight-suppression disc (ruling R6). */
  obsX: number;
  obsY: number;
  /** SQUARED radius (u²) of the suppression disc — the fog hole, pre-squared
   *  once per frame so the per-cell test is a multiply-compare with no sqrt.
   *  0 disables the gate entirely (the un-gated `anchorGrid` overload, which is
   *  what every geometry test that is not ABOUT the gate uses). */
  sightR2: number;
}

/**
 * Allocate a square buffer covering `2 × radiusU` (ruling R2) at `cellU`
 * resolution, plus two cells of slack so a snapped origin can never leave the
 * far edge short.
 */
export function makeGrid(radiusU: number, cellU: number): HeatGrid {
  const cols = Math.max(1, Math.ceil((2 * radiusU) / cellU) + 2);
  const n = cols * cols;
  return {
    cellU,
    cols,
    rows: cols,
    baseGx: 0,
    baseGy: 0,
    originX: 0,
    originY: 0,
    w: new Float32Array(n),
    a: new Float32Array(n),
    obsX: 0,
    obsY: 0,
    sightR2: 0,
  };
}

/**
 * Re-centre the grid on (cx, cy) and clear it.
 *
 * THE SNAP IS THE POINT (ruling R2). The origin is floored to a whole cell, so
 * cell (gx, gy) always covers the same world square no matter where the
 * observer stands — which is what makes `cellNoise(seed, gx, gy)` a stable
 * property of a place rather than a flicker that re-rolls every frame.
 *
 * `sightHoleU` ARMS THE SIGHT GATE (ruling R6) for the frame about to be
 * stamped. The centre is (cx, cy) — which IS the observer, since the buffer is
 * defined as covering 2 × radar range about the own ship — so the suppression
 * disc is re-established from the LIVE observer position on every single frame.
 * Omit it (or pass 0) for an un-gated raster.
 */
export function anchorGrid(g: HeatGrid, cx: number, cy: number, sightHoleU = 0): void {
  const half = (g.cols * g.cellU) / 2;
  g.baseGx = Math.floor((cx - half) / g.cellU);
  g.baseGy = Math.floor((cy - half) / g.cellU);
  g.originX = g.baseGx * g.cellU;
  g.originY = g.baseGy * g.cellU;
  g.obsX = cx;
  g.obsY = cy;
  g.sightR2 = sightHoleU > 0 ? sightHoleU * sightHoleU : 0;
  g.w.fill(0);
  g.a.fill(0);
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
 * IS CELL (gx, gy) INSIDE THE OBSERVER'S SIGHT BUBBLE? (ruling R6.)
 *
 * The cell's CENTRE decides — the same point every other per-cell quantity in
 * this file is evaluated at (intensity, solidity, noise), so the gate cannot
 * disagree with the value it is suppressing. `<=` mirrors the server's
 * `blipGate`, which excludes `dist <= sightRange` exactly.
 *
 * WHY THIS IS A STAMP-TIME AND NOT A BAKE-TIME RULE — the load-bearing choice.
 * An island's coverage is baked ONCE per beam revolution and then cached in
 * ABSOLUTE world cells for the paint's whole ~12s phosphor life (three live
 * paints per island). The observer, meanwhile, moves continuously. Baking the
 * gate into `CoverCell.i` would freeze the suppression disc at the position the
 * ship held when the beam swept that coastline, and seconds later it would be
 * suppressing water the ship has left behind while painting coastline the ship
 * has since sailed into — the seam amendment 81 exists to remove, just lagging
 * instead of offset. Evaluating here re-derives it from the live observer every
 * frame, which is exactly the cadence the drawn fog hole moves at.
 */
export function insideSight(g: HeatGrid, gx: number, gy: number): boolean {
  if (!(g.sightR2 > 0)) return false;
  const dx = cellCentre(gx, g.cellU) - g.obsX;
  const dy = cellCentre(gy, g.cellU) - g.obsY;
  return dx * dx + dy * dy <= g.sightR2;
}

/**
 * Write one cell, MAX-WINS. Overlapping paints never sum: additive accumulation
 * would let two weak ghosts of one contact fabricate a red core that neither
 * return earned, which is the same "color is lying about strength" failure from
 * the other direction. Out-of-grid writes are dropped silently — a paint at the
 * rim legitimately overhangs the buffer.
 *
 * THIS IS ALSO WHERE THE SIGHT GATE BITES (ruling R6), for two reasons. It is
 * the single chokepoint every stamped cell in the module already passes through,
 * so no present or future paint kind can route around it; and it rides the
 * bounds check that candidate cell already pays, so the gate costs one squared
 * distance compare on cells that were going to be touched anyway — never a
 * second pass over the buffer.
 */
export function writeCell(g: HeatGrid, gx: number, gy: number, intensity: number, alpha: number): void {
  const cx = gx - g.baseGx;
  const cy = gy - g.baseGy;
  if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) return;
  if (insideSight(g, gx, gy)) return;
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

/** One resolved contact echo in the paint list (world geometry + server time). */
export interface ShipPaint {
  kind: 'ship';
  /** Contact id — the per-track cap key. */
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
  const reach = Math.max(ax, ay);
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
  /** Baked coverage (built once, from the observer at paint time). */
  cover: readonly CoverCell[];
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

/** Stamp an island paint: every covered cell whose bearing the beam has reached. */
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
