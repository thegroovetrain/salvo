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
//   • R8 — AND IT IS SIZED TO THE VIEWPORT, NOT TO THE RADAR RING (cycle 58,
//     amendments 95-99). The buffer is a SCRATCH SURFACE, not storage: R1
//     already put every byte of history in the paint list and re-rasterizes the
//     whole list every frame, so the buffer only ever needs to cover WHAT IS ON
//     SCREEN. Anything off-screen is not visible, so not rasterizing it costs
//     nothing and it reappears the moment it scrolls back into view.
//
//     THIS FIXES A REAL CLIPPING BUG. A ring-sized buffer re-centred on the
//     observer clipped any paint the observer had sailed away from — Eric saw a
//     "box" around the radar ring when zoomed out, and paints vanished and came
//     back as he manoeuvred, which amendment 83 forbids outright ("if it gets
//     painted it stays painted until it decays").
//
//     WHAT THIS MODULE OWES THE ADAPTER IS THE SNAP, AND ONLY THE SNAP. The
//     centre handed to `anchorGrid` is now the CAMERA rather than the ship, and
//     `Math.floor` is what makes that safe: cell (gx, gy) covers the same world
//     square no matter where the camera stands, so a paint's cells hold still
//     while the camera slides over them. Cycle 57 was reverted from production
//     for losing exactly that property — it re-centred a paint-driven sub-rect
//     every frame and placed the sprite at that moving origin, so islands
//     drifted with the boat.
//
//     NOTHING VIEWPORT-DERIVED MAY EVER REACH PAINT CREATION OR RETIREMENT
//     (amendment 97). The camera decides ONE thing: which rectangle of world is
//     drawn this frame. Creation stays gated only by sweep + radar range + LOS;
//     retirement stays gated only by time; the paint list is never culled by
//     visibility. That is what makes Eric's stated requirement hold for free —
//     *"if I am zoomed in when it paints and then I zoom out, it still shows me
//     everything that would have been there"* — because the viewport was never
//     consulted when the paint was recorded. Note that not one function in this
//     module takes a viewport, a zoom or a camera: the only surface that knows
//     the buffer changed size is `gridSpan`.
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
//     CYCLE 59 REPEAT OF THE SAME TRAP, ONE FIELD OVER: `isle.core` is now the
//     inscribed radius about `isle.pole`, not about `isle.x/y`. The two cheap
//     early-outs that ride on it (`solidity`'s depth shortcut, `inLand`'s
//     early-IN) are keyed on the POLE for that reason — on a hook island the
//     bounding centre sits in the bay, and a centre-keyed core disc paints
//     sailable water as solid landmass before the polygon is ever consulted.
//     Everything else in this file that reads `x/y/r` is using the BOUNDING
//     CIRCLE deliberately (broadphase, bbox scan, angular span, `faceShadow`'s
//     terminator) and is correct as written.
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
  hullSilhouette,
  islandBlocksSegment,
  pointInIsland,
  nearestCoastPoint,
  perpendicularExtent,
  sampleHeight,
  segCircleHit,
  transformPolygon,
  wrapPositive,
  type HeightRaster,
  type HullId,
  type Island,
  type Vec2,
} from '@salvo/shared';
import { clamp01 } from '../util/math.js';
import { blipAlpha } from './phosphor.js';
import { POINT, SURFACE, attenuation, heightReflectivity } from './radarFalloff.js';
// TYPE-ONLY, and that is what keeps the dependency one-way. render/radarSources.ts
// imports this module's grid primitives at RUNTIME; this module needs only the
// SHAPE of the two paints it does not stamp, so the import erases at compile time
// and there is no module cycle. `rasterizeWeather` (over there) stamps them.
import type { ClutterPaint, StormPaint } from './radarSources.js';

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
}

/**
 * Cell quantum for a buffer span (ruling R8). Spans are rounded UP to a multiple
 * of this, so a continuously-varying viewport (a wheel zoom, a window drag) does
 * not reallocate the texture on every intermediate value — and the rounding is
 * always slack, never a crop.
 */
export const GRID_QUANTUM = 16;

/**
 * Cells needed to cover `2 × halfU` at `cellU` resolution: the exact span, plus
 * two cells of slack so a snapped origin can never leave the far edge short,
 * rounded up to `GRID_QUANTUM`. A non-finite or non-positive input answers the
 * quantum rather than NaN — a rogue viewport must not size a buffer to garbage.
 */
export function gridSpan(halfU: number, cellU: number): number {
  if (!(halfU > 0) || !(cellU > 0)) return GRID_QUANTUM;
  const need = Math.ceil((2 * halfU) / cellU) + 2;
  return Math.max(GRID_QUANTUM, Math.ceil(need / GRID_QUANTUM) * GRID_QUANTUM);
}

/**
 * Allocate a buffer covering `2 × halfWU` by `2 × halfHU` (rulings R2 + R8) at
 * `cellU` resolution.
 *
 * THE BUFFER IS A SCRATCH SURFACE, NOT STORAGE (ruling R8, amendment 96). Its
 * extent is a rendering decision and nothing else: history lives in the paint
 * list, which is re-rasterized in full every frame, so a region the buffer does
 * not cover this frame is simply not DRAWN this frame — never forgotten, and
 * back the instant it is covered again.
 */
export function makeGrid(halfWU: number, halfHU: number, cellU: number): HeatGrid {
  const cols = gridSpan(halfWU, cellU);
  const rows = gridSpan(halfHU, cellU);
  const n = cols * rows;
  return {
    cellU,
    cols,
    rows,
    baseGx: 0,
    baseGy: 0,
    originX: 0,
    originY: 0,
    w: new Float32Array(n),
    a: new Float32Array(n),
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
 * THE GRID CARRIES NO OBSERVER (amendment 85, and still true after 88). It is a
 * window onto the world, nothing more: where it is centred decides only which
 * cells are IN BOUNDS this frame. Every judgement about a paint — including
 * whether a cell paints at all — belongs to the paint, taken at its own
 * creation. Cycle 54's `obsX`/`obsY`/`sightR2` lived here and were re-read every
 * frame, which is precisely how a receding sight bubble came to paint coastline
 * no beam had swept; cycle 56 retired the sight verdict outright, but the
 * discipline that removed it from here is the governing invariant and stands.
 *
 * WHAT IT IS CENTRED ON IS NOW THE CAMERA (ruling R8, amendment 96), and that
 * changes NOTHING here: the centre has always been a pure windowing input, and
 * the floor below is what keeps the lattice world-locked no matter what is
 * handed in. A centre that is not snapped would slide every cell's world square
 * under the paints — the exact regression cycle 57 shipped.
 */
export function anchorGrid(g: HeatGrid, cx: number, cy: number): void {
  g.baseGx = Math.floor((cx - (g.cols * g.cellU) / 2) / g.cellU);
  g.baseGy = Math.floor((cy - (g.rows * g.cellU) / 2) / g.cellU);
  g.originX = g.baseGx * g.cellU;
  g.originY = g.baseGy * g.cellU;
  clearGrid(g);
}

/** Blank every cell, leaving the anchor alone. Used on the frames that draw
 *  nothing at all, so a hidden buffer can never answer with last frame's cells. */
export function clearGrid(g: HeatGrid): void {
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
 *
 * BLANK FIRST, THEN WRITE ONLY WHAT IS LIT. Output is identical to clearing each
 * transparent pixel in the loop, but a viewport-sized buffer (ruling R8) is
 * mostly empty most of the time — a screen at min zoom is ~350k cells of which a
 * few thousand carry a return — so a single typed-array `fill` plus a scalar
 * reject beats four byte stores and a band lookup per dead cell. Measured at
 * roughly half the per-frame cost of the buffer at min zoom.
 */
export function quantizeInto(g: HeatGrid, bands: readonly HeatBand[], out: Uint8Array): void {
  out.fill(0);
  for (let i = 0, n = g.cols * g.rows; i < n; i++) {
    const w = g.w[i];
    if (!(w > 0)) continue; // the overwhelming majority: already blank
    const b = bandIndex(w, bands);
    if (b < 0) continue;
    const o = i * 4;
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
  /** Asymptotic floor of the POINT curve (strictly > 0, never reached). */
  attenFloor: number;
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

/**
 * THE PHYSICAL RETURN MODEL's tuning (Story 4.10, amendments 105-106) —
 * per-material coefficients, the three geometry reference ranges, and the four
 * world-space extents the new sources need. The MATH is render/radarFalloff.ts;
 * every source in the grammar composes
 * `coefficient × falloff(geometry) × its own shape term` through it, and no
 * source carries a private attenuation formula.
 */
export interface ReturnModelOpts {
  /** Steel broadside — the coefficient table's 1.0 anchor (POINT geometry). */
  ship: number;
  /** Terrain at or above `refHeight` (SURFACE). */
  landSteep: number;
  /** Terrain at sea level (SURFACE) — amendment 129's other end. */
  landFlat: number;
  /** Breaking surf (SURFACE). */
  surf: number;
  /** Sea clutter (SURFACE) — bounded by amendment 130, see the config comment. */
  clutter: number;
  /** The storm wall (VOLUME). */
  storm: number;
  /** Reference range (u) of the POINT curve — FITTED, never typed in. */
  pointRef: number;
  /** Reference range (u) of the SURFACE curve. */
  surfaceRef: number;
  /** Reference range (u) of the VOLUME curve. */
  volumeRef: number;
  /** Asymptotic floor shared by the SURFACE and VOLUME curves. */
  floor: number;
  /** Quantized raster height (0-255) at which `landSteep` is reached. */
  refHeight: number;
  /** How far seaward of a coastline surf paints (u). */
  surfBandU: number;
  /** Compute bound (u) on the clutter disc — not its visual extent. */
  clutterRangeU: number;
  /** Full thickness (u) of the storm wall band. */
  stormBandU: number;
}

/** Everything the rasterizer needs from CLIENT_CONFIG. */
export interface HeatmapOpts {
  cellU: number;
  noise: number;
  bands: readonly HeatBand[];
  model: ReturnModelOpts;
  ship: ShipEchoOpts;
  island: IslandEchoOpts;
}

/**
 * A SHIP IS A POINT TARGET: 1/d⁴ (amendment 106).
 *
 * This REPLACES cycle 52's `rangeAttenuation`, whose hyperbola was explicitly
 * not physical and whose reference was a fraction of the observer's LIVE radar
 * range. The reference is now `model.pointRef`, fitted once so the red→blue
 * crossover lands on the 7/8 rung (amendment 118) — so nothing here reads a
 * live observer stat, and no range constant is ever compared against.
 */
function shipAtten(dist: number, o: HeatmapOpts): number {
  return attenuation(dist, o.model.pointRef, POINT, o.ship.attenFloor);
}

/**
 * COASTLINE, SURF AND CLUTTER ARE SURFACE TARGETS: 1/d³ (amendment 106).
 * Exported because the island bake and the weather sources are three callers of
 * one curve — the model is a module, not a copied expression.
 */
export function surfaceAtten(dist: number, m: ReturnModelOpts): number {
  return attenuation(dist, m.surfaceRef, SURFACE, m.floor);
}

/**
 * The kernel's PEAK intensity — what its core cell reads before noise.
 *
 * Aspect-projected `ext` × the material coefficient, attenuated on the POINT
 * curve, normalized against `strongExtent` (amendment 66's channel, unchanged:
 * hull geometry × relative bearing × range and NOTHING else — never boons, hp
 * or damage state). The `minPeak` floor is what keeps the weakest legitimate
 * return visible as a green speck rather than vanishing under `bands[0].at`,
 * and under 1/d⁴ it is doing far more work than it used to (amendment 127: the
 * floors survive the physics — a small hull bow-on at the rim must still
 * paint).
 */
export function shipPeak(ext: number, dist: number, o: HeatmapOpts): number {
  const strong = o.ship.strongExtent > 0 ? o.ship.strongExtent : 1;
  const raw = (o.model.ship * Math.max(0, ext) * shipAtten(dist, o)) / strong;
  return clamp01(Math.max(o.ship.minPeak, raw));
}

/** The kernel's two semi-axes (u): ACROSS the bearing (the `ext` channel) and
 *  ALONG it (the scope's range smear, floored so a needle still has a body).
 *  Size rides the SAME curve as strength — on a real set they are one quantity
 *  (amendment 74), so a distant hull shrinks as it dims. */
export function shipAxes(ext: number, dist: number, o: HeatmapOpts): { across: number; along: number } {
  const across = Math.max(o.ship.minExtent, Math.max(0, ext) * shipAtten(dist, o));
  return { across, along: Math.max(o.ship.minDepth, across * o.ship.depthFrac) };
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
export function stampShip(g: HeatGrid, p: ShipPaint, alpha: number, o: HeatmapOpts): void {
  const { across, along } = shipAxes(p.ext, p.dist, o);
  const floor = g.cellU * 0.85;
  const ax = Math.max(floor, along / 2);
  const ay = Math.max(floor, across / 2);
  const peak = shipPeak(p.ext, p.dist, o);
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

/** One covered cell of a baked paint: absolute world cell, its baked intensity,
 *  and the observer bearing that has to be swept before it paints. Shared by the
 *  island bake (land + surf) and the storm band (render/radarSources.ts) — the
 *  arc-gated cover list is one primitive, not one per source. */
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
   *  freezes intensity, `faceShadow`, terrain height and cross-island LOS;
   *  nothing in it is ever re-evaluated against live state (amendment 83). There
   *  is no sight term in it any more — the scope paints everything in radar
   *  range (amendment 88). Story 4.10: it also carries the SURF fringe, which
   *  rides the same bake because it inherits the same terminator and the same
   *  occluder shortlist — a second scan would double the only expensive thing in
   *  this file. */
  cover: readonly CoverCell[];
}

/** Every paint the `return` grammar can hold. The last two are declared in
 *  render/radarSources.ts and stamped there (`rasterizeWeather`); they appear
 *  here only so the ONE paint list stays a single typed union. */
export type RadarPaint = ShipPaint | IslandPaint | ClutterPaint | StormPaint;

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
 * `isle.core` is the cheap early-out: any point inside it is at least
 * `core − |P−pole|` from the coastline, so a deep interior cell answers without
 * touching a single polygon edge. Only cells near the coast pay for
 * `nearestCoastPoint`.
 *
 * KEYED ON `isle.pole`, NOT `isle.x/y` (cycle 59). `core` is the inscribed
 * radius about the POLE OF INACCESSIBILITY, not about the bounding-circle
 * centre. The two coincided while islands were star-shaped capsules; under the
 * height-field generator a hook island's bounding centre can sit in its own
 * BAY, so a disc measured from there covers open water — and this early-out
 * would report depth-1 solid land in the middle of a sailable inlet.
 */
export function solidity(p: Vec2, isle: Island, depthFullU: number): number {
  if (!(depthFullU > 0)) return 1;
  const dc = Math.hypot(p.x - isle.pole.x, p.y - isle.pole.y);
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
 *
 * CENTRED ON `isle.pole` (cycle 59) — see `solidity` for why. Keyed on the
 * bounding centre this early-IN would PAINT SAILABLE WATER AS LAND wherever a
 * hook island's centroid falls in its own bay, and no amount of exact polygon
 * work downstream can undo an early return of `true`.
 */
function inLand(p: Vec2, isle: Island): boolean {
  const dx = p.x - isle.pole.x;
  const dy = p.y - isle.pole.y;
  if (isle.core > 0 && dx * dx + dy * dy <= isle.core * isle.core) return true;
  return pointInIsland(p, isle);
}

/**
 * How much of its full strength surf keeps at the SEAWARD edge of the band. The
 * fringe fades outward rather than ending on a drawn line — the same reasoning
 * as the island terminator's ramp, one scale down.
 */
const SURF_EDGE = 0.5;

/**
 * Intensity of one LAND cell (amendment 129: depth × height, and both are real).
 *
 * `minLand` remapped, not clamped: land is land, so the waterline still returns
 * something, but the interior keeps the full range of the scale above it.
 * `gain` is what lets a solid interior stay RED out to the rim instead of
 * sliding to blue with range — amendment 78 asked for a big red mass, not a big
 * mass that is only red when you are on top of it.
 *
 * HEIGHT MULTIPLIES THAT, IT DOES NOT REPLACE IT. Height-replaces-depth was the
 * most literal read of the story's own AC and was REJECTED, because a large flat
 * island would then read uniformly weak regardless of size and amendment 78
 * would be superseded. So a big island is still a big mass, and what height
 * decides is HOW RED. Elevation comes from the cycle-59 raster via `sampleHeight`
 * — the ratified authority — and never from the contour polygons. With no raster
 * (a caller that never supplied one) the term is `landSteep`, i.e. exactly the
 * pre-4.10 fill, so the height channel adds and never subtracts.
 */
function landIntensity(
  p: Vec2,
  isle: Island,
  dist: number,
  shadow: number,
  o: HeatmapOpts,
  raster: HeightRaster | null,
): number {
  const isl = o.island;
  const sol = isl.minLand + (1 - isl.minLand) * solidity(p, isle, isl.depthFullU);
  const refl =
    raster === null ? o.model.landSteep : heightReflectivity(sampleHeight(raster, p.x, p.y), o.model);
  return clamp01(sol * refl * isl.gain * shadow * surfaceAtten(dist, o.model));
}

/**
 * Intensity of one SURF cell: a weak seaward fringe just outside the coastline
 * (amendment 131), tapering across the band.
 *
 * NEAR FACE ONLY, and by INHERITANCE rather than by a second rule — the caller
 * has already applied the island's own terminator and occluder shortlist, so
 * surf goes into shadow exactly where the coast it breaks on does. Its
 * coefficient is bounded below `bands[1].at`, so surf is GREEN at every range:
 * "honestly not sure, could be something tiny" is the literally correct read of
 * a line of breakers.
 */
function surfIntensity(coast: number, dist: number, shadow: number, o: HeatmapOpts): number {
  const m = o.model;
  const taper = 1 - (1 - SURF_EDGE) * clamp01(coast / m.surfBandU);
  return clamp01(m.surf * taper * shadow * surfaceAtten(dist, m));
}

/**
 * Intensity of one candidate cell of an island paint — LAND or SURF — or 0 if
 * it does not paint at all.
 *
 * Ordered cheapest-first, and the ordering is the perf contract: the terminator
 * is scalar arithmetic, membership is a broadphased polygon test, the coastline
 * distance is a polygon walk, and the LOS shortlist is normally empty.
 */
function coverIntensity(
  p: Vec2,
  isle: Island,
  obs: Vec2,
  o: HeatmapOpts,
  ctx: { occ: readonly Island[]; raster: HeightRaster | null },
): number {
  const shadow = faceShadow(p, isle, obs, o.island.terminator);
  if (shadow <= 0) return 0;
  const land = inLand(p, isle);
  const coast = land ? 0 : nearestCoastPoint(p, isle).dist;
  if (!land && coast > o.model.surfBandU) return 0;
  for (const other of ctx.occ) if (islandBlocksSegment(obs, p, other)) return 0;
  const dist = Math.hypot(p.x - obs.x, p.y - obs.y);
  return land
    ? landIntensity(p, isle, dist, shadow, o, ctx.raster)
    : surfIntensity(coast, dist, shadow, o);
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
 * What remains frozen at bake time is what always was, plus what Story 4.10 adds:
 * per-cell intensity, `faceShadow`, the cross-island LOS shortlist, and now the
 * terrain HEIGHT sample and the SURF fringe.
 *
 * SURF RIDES THIS LOOP (amendment 131). The scan widens by `surfBandU` and a
 * WATER cell within that distance of the coastline emits a weak surface return
 * instead of a land one. It is the same loop because it is the same physics
 * neighbourhood: identical terminator, identical occluders, identical range
 * gate. A second pass would double the only expensive thing in this file.
 *
 * `raster` is the cycle-59 height field (amendment 129), or null for a caller
 * that has none — in which case land reflectivity is `landSteep`, i.e. exactly
 * the pre-4.10 fill.
 */
export function buildIslandCoverage(
  isle: Island,
  field: readonly Island[],
  obs: Vec2,
  radarRange: number,
  seed: number,
  o: HeatmapOpts,
  raster: HeightRaster | null = null,
): CoverCell[] {
  const out: CoverCell[] = [];
  const ctx = { occ: occluderCandidates(isle, field, obs), raster };
  // The scan reaches PAST the coastline by the surf band — and so does the
  // broadphase radius, or the fringe would be clipped to the bounding circle.
  const reach = isle.r + o.model.surfBandU;
  const r2 = reach * reach;
  const range2 = radarRange * radarRange;
  const gx0 = cellOf(isle.x - reach, o.cellU);
  const gx1 = cellOf(isle.x + reach, o.cellU);
  const gy1 = cellOf(isle.y + reach, o.cellU);
  for (let gy = cellOf(isle.y - reach, o.cellU); gy <= gy1 && out.length < o.island.maxCells; gy++) {
    const y = cellCentre(gy, o.cellU);
    for (let gx = gx0; gx <= gx1 && out.length < o.island.maxCells; gx++) {
      const x = cellCentre(gx, o.cellU);
      // The two scalar rejections run on raw numbers BEFORE anything allocates a
      // point or calls into polygon math. Most of a bounding box is neither in
      // the bounding circle nor in radar range, and paying a Vec2 plus a
      // function call for each of those cells was the whole bake's cost.
      if (!inBroadphase(x, y, isle, obs, r2, range2)) continue;
      const i = coverIntensity({ x, y }, isle, obs, o, ctx) * noiseMul(seed, gx, gy, o.noise);
      if (i > 0) out.push({ gx, gy, i, b: Math.atan2(y - obs.y, x - obs.x) });
    }
  }
  return out;
}

/** Bounding circle (widened by the surf band) + radar range, in raw scalars —
 *  the allocation-free prefilter in front of every exact test. */
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

/**
 * Stamp a BAKED COVER LIST under its arc gate: every covered cell whose bearing
 * the beam has reached.
 *
 * Nothing is judged here — `cover` is a finished record baked at paint open, and
 * the only live input is which part of the arc the beam has swept. Shared by the
 * island paint and the storm wall (render/radarSources.ts): two sources, one
 * stamping primitive, so the arc semantics cannot drift between them.
 */
export function stampCover(
  g: HeatGrid,
  cover: readonly CoverCell[],
  from: number,
  to: number,
  full: boolean,
  alpha: number,
): void {
  const span = wrapPositive(to - from);
  const f = wrapPositive(from);
  for (let k = 0; k < cover.length; k++) {
    const c = cover[k];
    // The arc test, inlined. `c.b` is an `atan2` result in [-π, π] and `f` was
    // wrapped into [0, τ) once above, so the difference lies in [-3π, π] and two
    // conditional adds wrap it exactly — the same answer `wrapPositive` gives,
    // without its two modulos, on a path that runs per CELL for every cover
    // paint on the scope. A COMPLETED arc skips it entirely.
    if (!full) {
      let off = c.b - f;
      if (off < 0) off += TAU;
      if (off < 0) off += TAU;
      if (off > span) continue;
    }
    writeCell(g, c.gx, c.gy, c.i, alpha);
  }
}

/** Stamp an island paint (land + surf) — the cover list under its arc gate. */
export function stampIsland(g: HeatGrid, p: IslandPaint, alpha: number): void {
  stampCover(g, p.cover, p.from, p.to, p.full, alpha);
}

// --- 6. the frame ---------------------------------------------------------------

/**
 * Per-frame inputs the rasterizer needs beyond the paint list itself.
 *
 * NOTE WHAT IS NOT HERE ANY MORE: the observer's live `radarRange`. Cycle 52's
 * ship curve scaled its reference by it, so a mid-decay boon would have
 * restretched the attenuation of paints already on the scope; Story 4.10's
 * reference is the fitted `model.pointRef`. The rasterizer now consults NO live
 * observer state whatsoever, which is amendment 83 holding structurally rather
 * than by inspection.
 */
export interface RasterCtx {
  now: number;
  lifeMs: number;
  /** Colorblind-assist alpha floor (`blipAlpha`'s minAlpha). */
  alphaFloor: number;
  opts: HeatmapOpts;
}

/**
 * RE-RASTERIZE THE WHOLE BUFFER FROM THE PAINT LIST (ruling R1).
 *
 * The caller has already anchored (and therefore cleared) the grid. Nothing
 * decays in place; a paint's only per-frame state is its age, which becomes the
 * alpha channel of every cell it wins. Dead paints (alpha 0) are skipped here
 * and pruned by the caller.
 *
 * SHIPS AND ISLANDS ONLY. The weather sources (clutter, storm) are stamped by
 * `rasterizeWeather` in render/radarSources.ts on the same list, right after
 * this call — two passes over a ≤128-entry array, in exchange for a strictly
 * one-way module dependency. Each module stamps the kinds it declares.
 */
export function rasterize(g: HeatGrid, paints: readonly RadarPaint[], ctx: RasterCtx): void {
  for (const p of paints) {
    const alpha = blipAlpha(ctx.now - p.t, ctx.lifeMs, ctx.alphaFloor);
    if (alpha <= 0) continue;
    if (p.kind === 'ship') stampShip(g, p, alpha, ctx.opts);
    else if (p.kind === 'island') stampIsland(g, p, alpha);
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
