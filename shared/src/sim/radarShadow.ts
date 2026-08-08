// RADAR SHADOWS — the ONE height-aware terrain-occlusion model (Story 4.11).
//
// THE RULE. Radar range is pinned to the sea horizon (amendment 114:
// 2RH = radarRange²/4), every antenna — ship, drone and decoy alike — stands
// at the single mast height H = CONFIG.vision.radarMastQ (amendment 184: a
// FIXED threshold in the height raster's own 0-255 quantized units), and a ray
// marching outward from an observer folds every LAND raster sample it crosses
// into one running scalar (amendment 178):
//
//     u_i    = 1 − h_i/H              h_i: quantized height at the sample
//     a_i    = u_i/d_i + d_i/K        d_i: the ray's ENTRY distance into that
//                                          sample's cell (see cadence below)
//     aMin   = min over folded samples of a_i
//     vis(D) = clamp01( D · (aMin − D/K) ),   K = CONFIG.vision.radar² / 4
//
// `vis(D)` is the illuminated fraction of a target at distance D: 1 fully
// painted, 0 fully shadowed, in between the soft edge. It equals u_i just past
// an obstacle, and its root D = aMin·K IS amendment 176's residual reach: once
// a bearing goes dark it stays dark to the rim — `shadowLength` is how much
// further past the obstacle you can still see, NEVER a dark band followed by
// clear water (the misreading 176 exists to kill). Hard cover is not a branch:
// h ≥ H gives u ≤ 0 and the root lands at or before the obstacle, so the
// binary behaviour is the limit of the continuous one.
//
// K DERIVES FROM BASE CONFIG.vision.radar, NEVER an observer's boon-widened
// stats.radarRange (amendment 185): K = 2RH is a WORLD constant — R an earth
// radius, H a mast height — and an observer-dependent K would let an intel
// boon shorten every soft shadow, buying its way past terrain against
// amendment 116's "land is sacred". The accepted consequence — a boon-widened
// annulus reaches past its own sea horizon — is stated there and is not a bug.
//
// RULED OUT, deliberately: a per-obstacle `shadowLength(h, d)` one-shot (the
// min collapses every obstacle into ONE scalar, O(1) per sample, no obstacle
// list — that is what makes the server gate affordable at 20Hz); a tuned
// soft-edge constant (the fade is DERIVED from the same clearance condition,
// amendment 178); a special-cased hard-cover branch; and any second
// implementation anywhere — this module is called by BOTH the server's blip
// gate and the client's beam march, and a second copy is a desync or a leak.
//
// THE FOLDING CADENCE IS THE PARITY CONTRACT. The walk — not the caller —
// decides which samples fold and at what distance: a DDA over the height
// raster's level-0 cells (14u in production), folding each LAND cell at the
// distance the ray ENTERED its (Voronoi) cell, strictly-nearer-only — a
// sample is always evaluated against the accumulator as it stood BEFORE any
// obstacle at its own distance or beyond was folded, so an obstacle's near
// face paints at full strength and only what is BEHIND it is masked
// (amendment 178's ordering rule). `advanceTo(d)` folds every cell the ray
// entered at distance < d; `visibilityAt(d)` evaluates the accumulator as it
// stands. The server drives the stepper once per candidate (`visibilityTo`,
// which advances to the entry of the TARGET's own cell and queries at the
// target's distance); the client drives it at each of its own march samples.
//
// WHAT IS BIT-EXACT IS THE CADENCE, NOT THE TWO SIDES' ANSWERS. Every entry
// distance is derived directly from the crossed cell boundary's coordinate,
// never from an accumulated float, so a RESUMED walk folds the same cells at
// the same distances as a fresh one advanced straight to the same frontier —
// resume parity is exact, and `visibilityAt` is a pure function of the
// frontier. The two CALLERS nevertheless differ, on purpose, and the header
// must not pretend otherwise:
//
//   • ORDER. The server advances then queries; the CLIENT queries then
//     advances (amendment 187 — advancing first makes `vis` at a land sample
//     `1 − h/H ≤ 0`, so every tall island would paint nothing at all).
//   • LAG. The client only calls `advanceTo` when its march enters a NEW heat
//     cell — consecutive samples deduped by cell key skip the call entirely
//     (render/radarMarch.ts) — so its frontier trails its query distance by
//     one heat-cell crossing plus one step: ~13u at the shipped 9u cell / 4u
//     step, and up to ~17u on a diagonal, where a 9u cell's chord is 9√2.
//     NOT "half a raster cell": the raster's 14u cells do not bound this, the
//     client's own sample cadence does.
//   • DIRECTION, and this is why the difference is safe rather than a desync:
//     a trailing frontier has folded a SUBSET of the server's land, and `vis`
//     is monotone non-increasing in folds, so the client always paints AT
//     LEAST what the server disclosed and never more. A leak would need the
//     opposite sign.
//
// DEGENERATE INPUTS FAIL OPEN (vis = 1): a missing raster, a non-finite
// coordinate or direction, a zero direction, a non-positive H or non-finite K
// mean "no terrain data, therefore no shadow" — today's behaviour. Fail
// CLOSED would be wrong here: the server gate would hide legitimate contacts.
// Off-raster travel is transparent (`sampleHeight` clamps to sea).
//
// A CELL NEVER OCCLUDES A QUERY POINT INSIDE IT, AT EITHER END OF THE RAY:
// the observer's own cell is exempt by `foldCell`'s `entry ≤ 0` guard, and the
// target's own by `visibilityTo`'s `cellEntryOf` fold limit. That is what makes
// the one-shot SYMMETRIC — A paints B exactly when B paints A, as the spec's
// Always clause requires — and without the far-end half a hull whose centre
// rounds into a hard-cover cell would be a one-way stealth pocket.
//
// COST. The max-height pyramid (heightField.ts) is consulted one tile at a
// time: a tile whose ceiling is SEA_HEIGHT is skipped in a single test, so an
// open-water bearing costs ~6 tile tests instead of ~47 cell steps — cheap
// open water is a stated requirement of the substrate ruling (2026-08-06).
// No transcendentals anywhere (Math.sqrt is IEEE-exact and allowed).

import { CONFIG } from '../constants.js';
import {
  SEA_HEIGHT,
  tileCeiling,
  tileIndexX,
  tileIndexY,
  tileSize,
  type HeightRaster,
} from './heightField.js';

/** Minimum forward progress per step (u) — breaks corner-graze float stalls. */
const EPS = 1e-6;

/** Pyramid level for open-water skips: 2³ = 8-cell tiles (112u in production).
 *  A full 660u ray over open sea resolves in ≤ ~7 ceiling tests; higher levels
 *  make a tile more likely to contain land somewhere and force the cell walk
 *  over a wider span. Clamped to the raster's actual pyramid depth. */
const SKIP_LEVEL = 3;

/**
 * A shadow walk along one ray. Call `advanceTo`/`visibilityAt` with
 * NON-DECREASING distances — `advanceTo` folds every raster cell the ray
 * entered at distance < d, and folds are permanent (the accumulator is a min).
 */
export interface ShadowWalk {
  /** Fold every land cell the ray entered at distance < `d`. Non-finite `d`
   *  is a no-op (never over-folds — ordering is load-bearing). */
  advanceTo(d: number): void;
  /** Illuminated fraction of a target at distance `d` against the accumulator
   *  as it stands (1 = fully painted, 0 = fully shadowed). Degenerate `d`
   *  (non-finite or ≤ 0) fails OPEN per the spec's edge-case matrix. */
  visibilityAt(d: number): number;
  /** Current residual reach: the distance at which `vis` hits 0 (the root
   *  aMin·K — amendment 176). Infinity while no land has been folded. A
   *  client march may stop and emit NO-DATA past this distance. */
  reach(): number;
}

/** K = radarRange²/4 = 2RH — derived from BASE CONFIG.vision.radar, never an
 *  observer's boon-widened range (amendment 185). Pinned build-failing in
 *  zone.test.ts because radarRange also drives gun/cannon/star-shell range. */
export function radarShadowK(): number {
  return CONFIG.vision.radar ** 2 / 4;
}

/** The fail-open walk: no terrain data, therefore no shadow. */
const OPEN_WALK: ShadowWalk = {
  advanceTo: () => undefined,
  visibilityAt: () => 1,
  reach: () => Infinity,
};

interface WalkState {
  readonly r: HeightRaster;
  readonly ox: number;
  readonly oy: number;
  readonly dx: number; // unit direction
  readonly dy: number;
  readonly h: number; // mast height H, quantized units
  readonly k: number; // radarRange²/4
  readonly level: number; // pyramid level used for sea-tile skips
  readonly tExit: number; // distance at which the ray leaves the raster square
  /** Folding frontier: every land cell entered at distance < t is folded, and
   *  t is always either a cell entry distance or past the last query. */
  t: number;
  /** The running scalar: min over folded samples of a_i. Infinity = clear. */
  aMin: number;
}

function finitePair(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b);
}

function positiveFinite(x: number): boolean {
  return Number.isFinite(x) && x > 0;
}

/** Every precondition for a meaningful march; anything false ⇒ fail open. */
function walkable(
  raster: HeightRaster | null | undefined,
  ox: number,
  oy: number,
  dirX: number,
  dirY: number,
  h: number,
  k: number,
): raster is HeightRaster {
  if (raster === null || raster === undefined) return false;
  if (!finitePair(ox, oy) || !finitePair(dirX, dirY)) return false;
  if (!positiveFinite(h) || !positiveFinite(k)) return false;
  return positiveFinite(raster.cell) && raster.n > 0 && raster.pyramid.length > 0;
}

/** [tEnter, tExit] of the ray against one axis slab, or null for a miss. */
function axisSpan(o: number, dir: number, min: number, max: number): readonly [number, number] | null {
  if (dir === 0) return o >= min && o <= max ? [-Infinity, Infinity] : null;
  const t1 = (min - o) / dir;
  const t2 = (max - o) / dir;
  return t1 < t2 ? [t1, t2] : [t2, t1];
}

/** Distance at which the ray leaves the raster's covered square (0 = the ray
 *  never touches it for t ≥ 0 — everything is off-raster sea). */
function rayGridExit(r: HeightRaster, ox: number, oy: number, dx: number, dy: number): number {
  const lo = -r.cell / 2;
  const span = r.n * r.cell;
  const x = axisSpan(ox, dx, r.x0 + lo, r.x0 + lo + span);
  const y = axisSpan(oy, dy, r.y0 + lo, r.y0 + lo + span);
  if (x === null || y === null) return 0;
  const enter = Math.max(x[0], y[0]);
  const exit = Math.min(x[1], y[1]);
  return exit > Math.max(enter, 0) ? exit : 0;
}

/**
 * Fold one raster cell into the accumulator at the ray's entry distance into
 * it. Strictly-nearer-only ordering is the caller's job; the observer's own
 * cell (entry ≤ 0) never occludes — nothing at distance 0 stands between the
 * antenna and anything else, and u/d is undefined there (the d = 0 guard).
 * `visibilityTo` mirrors this at the far end (`cellEntryOf`).
 */
function foldCell(s: WalkState, i: number, j: number, entry: number): void {
  if (entry <= 0) return;
  if (i < 0 || j < 0 || i >= s.r.n || j >= s.r.n) return;
  const q = s.r.height[j * s.r.n + i];
  if (q <= SEA_HEIGHT) return;
  const a = (1 - q / s.h) / entry + entry / s.k;
  if (a < s.aMin) s.aMin = a;
}

/** Ray distance at which coordinate `boundary` is crossed on one axis. */
function boundaryCross(o: number, dir: number, boundary: number): number {
  return dir === 0 ? Infinity : (boundary - o) / dir;
}

/**
 * DDA over level-0 cells from `from` to `to`, folding each land cell at its
 * entry distance. Every boundary crossing is derived DIRECTLY from the
 * boundary's coordinate (never an accumulated step), so a resumed walk folds
 * bit-identical distances to a one-shot — the parity contract's mechanism.
 * Returns the entry distance of the first UNfolded cell (≥ `to`), which is
 * where a later advance resumes.
 */
function walkCells(s: WalkState, from: number, to: number): number {
  const { r, ox, oy, dx, dy } = s;
  const px = ox + dx * (from + EPS);
  const py = oy + dy * (from + EPS);
  let i = Math.round((px - r.x0) / r.cell);
  let j = Math.round((py - r.y0) / r.cell);
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  let entry = from;
  while (entry < to) {
    foldCell(s, i, j, entry);
    const nx = boundaryCross(ox, dx, r.x0 + (i + sx * 0.5) * r.cell);
    const ny = boundaryCross(oy, dy, r.y0 + (j + sy * 0.5) * r.cell);
    if (nx <= ny) {
      entry = nx;
      i += sx;
    } else {
      entry = ny;
      j += sy;
    }
  }
  return entry;
}

/** Exit distance of the level-`s.level` tile (ti, tj) along the ray. */
function tileExitDist(s: WalkState, ti: number, tj: number): number {
  const size = tileSize(s.r, s.level);
  const minX = s.r.x0 - s.r.cell / 2 + ti * size;
  const minY = s.r.y0 - s.r.cell / 2 + tj * size;
  const ex = axisExit(s.ox, s.dx, minX, minX + size);
  const ey = axisExit(s.oy, s.dy, minY, minY + size);
  return Math.min(ex, ey);
}

function axisExit(o: number, dir: number, min: number, max: number): number {
  if (dir > 0) return (max - o) / dir;
  if (dir < 0) return (min - o) / dir;
  return Infinity;
}

/**
 * Process the tile at the walk frontier: skip it whole if its max-height
 * ceiling is sea (the pyramid's purpose — open water costs one test per
 * tile), else cell-walk it up to `limit`. Returns the new frontier, always
 * strictly ahead of the old one (termination guarantee).
 */
function stepTile(s: WalkState, limit: number): number {
  const px = s.ox + s.dx * (s.t + EPS);
  const py = s.oy + s.dy * (s.t + EPS);
  const ti = tileIndexX(s.r, s.level, px);
  const tj = tileIndexY(s.r, s.level, py);
  const exit = Math.max(tileExitDist(s, ti, tj), s.t + EPS);
  if (tileCeiling(s.r, s.level, ti, tj) <= SEA_HEIGHT) return exit;
  return Math.max(walkCells(s, s.t, Math.min(limit, exit)), s.t + EPS);
}

/** advanceTo's engine: fold every cell entered at distance < d. */
function advance(s: WalkState, d: number): void {
  if (!Number.isFinite(d) || d <= s.t) return;
  const limit = Math.min(d, s.tExit);
  // Belt-and-braces loop bound: legitimately ≤ ~2·n tile/cell segments per
  // call; exhausting it (float pathology only) would fail OPEN for the
  // remainder of THIS CALL. That is deliberately NOT symmetric between the two
  // sides — the server's one-shot spends one budget on the whole ray, while an
  // incremental march gets a fresh budget per `advanceTo` — so an exhausted
  // guard would be a divergence, not a shared fail-open. It is unreachable
  // rather than handled, on two separate grounds: `limit` is finite and every
  // stepTile advances the frontier by ≥ EPS, so the loop TERMINATES; and each
  // step that is not that degenerate floor clears a whole cell or tile, so the
  // count stays inside the budget.
  let guard = 4 * s.r.n + 64;
  while (s.t < limit && guard > 0) {
    s.t = stepTile(s, limit);
    guard -= 1;
  }
  if (d > s.t) s.t = d; // past the raster square there is only transparent sea
}

/** vis(D) = clamp01(D · (aMin − D/K)) — amendment 178's running-scalar form. */
function visAt(aMin: number, k: number, d: number): number {
  if (aMin === Infinity) return 1;
  if (!Number.isFinite(d) || d <= 0) return 1; // degenerate D fails OPEN
  const v = d * (aMin - d / k);
  if (v >= 1) return 1;
  return v > 0 ? v : 0;
}

/** The root of vis — amendment 176's residual reach. */
function reachOf(aMin: number, k: number): number {
  if (aMin === Infinity) return Infinity;
  const root = aMin * k;
  return root > 0 ? root : 0;
}

/** Build the marching state, or null for any degenerate input (fail open). */
function newWalkState(
  raster: HeightRaster | null | undefined,
  ox: number,
  oy: number,
  dirX: number,
  dirY: number,
): WalkState | null {
  const h = CONFIG.vision.radarMastQ;
  const k = radarShadowK();
  if (!walkable(raster, ox, oy, dirX, dirY, h, k)) return null;
  const len = Math.sqrt(dirX * dirX + dirY * dirY);
  if (!positiveFinite(len)) return null;
  const dx = dirX / len;
  const dy = dirY / len;
  return {
    r: raster,
    ox,
    oy,
    dx,
    dy,
    h,
    k,
    level: Math.max(0, Math.min(SKIP_LEVEL, raster.pyramid.length - 1)),
    tExit: rayGridExit(raster, ox, oy, dx, dy),
    t: 0,
    aMin: Infinity,
  };
}

/**
 * Begin a shadow walk from (`ox`, `oy`) along (`dirX`, `dirY`) — a unit
 * direction by contract, though any non-zero finite vector is normalized
 * defensively. H and K are read from CONFIG at call time (base values only —
 * amendment 185). Any degenerate input returns the fail-open walk.
 */
export function beginShadowWalk(
  raster: HeightRaster | null | undefined,
  ox: number,
  oy: number,
  dirX: number,
  dirY: number,
): ShadowWalk {
  const s = newWalkState(raster, ox, oy, dirX, dirY);
  if (s === null) return OPEN_WALK;
  return {
    advanceTo: (d: number): void => advance(s, d),
    visibilityAt: (d: number): number => visAt(s.aMin, s.k, d),
    reach: (): number => reachOf(s.aMin, s.k),
  };
}

/**
 * Distance at which the ray ENTERS the raster cell containing (`px`, `py`),
 * clamped to `len` — the exclusive fold limit for a one-shot query at that
 * point. THE FAR-END MIRROR OF `foldCell`'s `entry <= 0` GUARD, and the reason
 * the model is symmetric by construction (`vis(A→B) > 0 ⟺ vis(B→A) > 0`): a
 * cell that CONTAINS a query point cannot stand between that point and
 * anything, at either end of the ray. Without it a hull whose centre rounds
 * into a hard-cover cell — navigable water sits in cells up to ~q58 against
 * the q64 threshold, and nothing structural pins that gap — would be a one-way
 * stealth pocket: invisible to everyone, seeing everyone.
 *
 * It exempts EXACTLY one cell, never a neighbour: the limit is that cell's own
 * entry distance, derived from the SAME boundary coordinate expression the DDA
 * uses (`x0 + (i ∓ ½)·cell`, differenced against the origin and divided by the
 * same normalized direction — `s.dx`/`s.dy`, not a re-normalization), so it is
 * bit-identical to the entry `walkCells` would compute. A cell ending 0.001u
 * before the target still has `entry < limit` and still folds.
 */
function cellEntryOf(s: WalkState, px: number, py: number, len: number): number {
  const { r } = s;
  const i = Math.round((px - r.x0) / r.cell);
  const j = Math.round((py - r.y0) / r.cell);
  // A zero component never crosses a boundary on that axis, so it imposes no
  // entry constraint (boundaryCross's +Infinity is the EXIT convention).
  const ex = s.dx === 0 ? -Infinity : boundaryCross(s.ox, s.dx, r.x0 + (i - (s.dx > 0 ? 0.5 : -0.5)) * r.cell);
  const ey = s.dy === 0 ? -Infinity : boundaryCross(s.oy, s.dy, r.y0 + (j - (s.dy > 0 ? 0.5 : -0.5)) * r.cell);
  const e = Math.max(ex, ey);
  return e < len ? e : len; // NaN (unreachable: state is finite) ⇒ len
}

/**
 * One-shot convenience for the server's single observer→target ray: the
 * illuminated fraction of a target at (`tx`, `ty`) as seen from (`ox`, `oy`).
 * Marches the SAME stepper — the parity contract forbids a second marching
 * code path. A target on the observer (d = 0), or any non-finite coordinate,
 * fails OPEN.
 *
 * Folds every cell the ray entered BEFORE the target's own cell; the target's
 * cell is exempt, mirroring the observer's (see `cellEntryOf`).
 */
export function visibilityTo(
  raster: HeightRaster | null | undefined,
  ox: number,
  oy: number,
  tx: number,
  ty: number,
): number {
  const dx = tx - ox;
  const dy = ty - oy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!positiveFinite(len)) return 1;
  const s = newWalkState(raster, ox, oy, dx / len, dy / len);
  if (s === null) return 1;
  advance(s, cellEntryOf(s, tx, ty, len));
  return visAt(s.aMin, s.k, len);
}
