// The landmass EXTRACTION module (cycle 59) — the geometry half of sim/map.ts
// (which stays the orchestrator: sea level, coverage, repair, validation).
// Ported from the owner-approved fBm prototype (tmp-fbm/extract.mjs).
//
// The cycle-51 capsule/skeleton machinery that used to live here is DELETED:
// islands are no longer a skeleton wrapped in a displaced capsule but isolines
// of one fBm height field (sim/heightField.ts). With the capsule went the
// star-shape invariant; its two guarantees moved — lagoons are eliminated by
// the generation-time closure pass below, and push-out became
// nearest-boundary-point (sim/collision.ts).
//
// Pipeline: threshold -> land mask -> unreachable-water closure -> marching
// squares -> ordered loops. Topology comes from the boolean MASK; crossing
// POSITIONS come from the field values, so a repaired cell degrades to a
// mid-edge crossing instead of desynchronising the contour from the labelling.
//
// Everything reuses one `ExtractionGrid` context: the in-disc predicate, the
// mask, the contour link table and the flood stacks are allocated once per map
// and shared by the sea-level pass and all three contour passes.
//
// DETERMINISM: no transcendental call anywhere (no sin/cos/pow/exp/hypot —
// Math.sqrt is IEEE-exact and allowed), no unseeded randomness, no clock. All
// polygon math delegates to silhouette.ts — there is exactly ONE polygon
// library, never a second.

import type { Vec2 } from '../math/vec.js';
import type { HeightField } from './heightField.js';
import { closestPointOnPolygon, pointInPolygon } from './silhouette.js';

const OUT = 0; // outside the map disc
const WATER = 1;
const LAND = 2;

export const MASK = { OUT, WATER, LAND } as const;

/** Per-map scratch: allocated once, reused by every threshold pass. */
export interface ExtractionGrid {
  readonly field: HeightField;
  readonly radius: number;
  readonly n: number;
  readonly NN: number;
  readonly inDisc: Uint8Array;
  readonly idxList: Int32Array;
  readonly mask: Uint8Array;
  readonly open: Uint8Array;
  readonly acc: Uint8Array;
  readonly stack: Int32Array;
  readonly next: Int32Array;
  readonly seen: Uint8Array;
  /** Extra cells of closure clearance (see markOpenWater). */
  navPad: number;
}

/** Build the shared extraction scratch for one map. */
export function makeGrid(field: HeightField, radius: number): ExtractionGrid {
  const { n, cell, x0, y0 } = field;
  const NN = n * n;
  const inDisc = new Uint8Array(NN);
  const idxList = new Int32Array(NN);
  let m = 0;
  const r2 = radius * radius;
  for (let j = 0; j < n; j++) {
    const y = y0 + j * cell;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * cell;
      if (x * x + y * y <= r2) {
        inDisc[j * n + i] = 1;
        idxList[m++] = j * n + i;
      }
    }
  }
  return {
    field,
    radius,
    n,
    NN,
    inDisc,
    idxList: idxList.subarray(0, m),
    mask: new Uint8Array(NN),
    open: new Uint8Array(NN),
    acc: new Uint8Array(NN),
    stack: new Int32Array(NN),
    next: new Int32Array(2 * NN),
    seen: new Uint8Array(2 * NN),
    navPad: 1,
  };
}

/** Classify every sample against `level` into `g.mask`. */
export function buildMask(g: ExtractionGrid, level: number): Uint8Array {
  const { mask, inDisc, NN } = g;
  const v = g.field.v;
  for (let i = 0; i < NN; i++) {
    mask[i] = inDisc[i] === 0 ? OUT : v[i] >= level ? LAND : WATER;
  }
  return mask;
}

// --- Deterministic circle probes (no cos/sin enters generation) --------------

/**
 * `count` fixed points on the circle of radius `ring` via the rational
 * parametrisation t -> ((1-t²)/(1+t²), 2t/(1+t²)) over both half-circles —
 * exact arithmetic only, so no transcendental enters generation.
 */
export function ringProbes(ring: number, count: number): Vec2[] {
  const out: Vec2[] = [];
  const half = count >> 1;
  for (let k = 0; k < half; k++) {
    const t = -1 + (2 * k) / half;
    const s = 1 + t * t;
    const ux = ((1 - t * t) / s) * ring;
    const uy = ((2 * t) / s) * ring;
    out.push({ x: ux, y: uy });
    out.push({ x: -ux, y: -uy });
  }
  return out;
}

// --- The closure pass ---------------------------------------------------------

/**
 * `open[i]` = water with no land within `navClear`. A full distance transform
 * is wasted work here: the only question ever asked of the distance is whether
 * it clears one fixed radius, which at 14u cells is a 2-cell disc — a bounded
 * neighbourhood test (~13 reads a cell) instead of two sweeps of a chamfer.
 *
 * CONSERVATIVE by `navPad` cells. The clearance here is measured to the
 * nearest LAND SAMPLE, but the coastline the sim actually collides with is the
 * interpolated isoline, which lies up to one cell nearer the water than that
 * sample. Testing the raw radius calls cells navigable that the
 * polygon-distance check calls tight, the flood then threads a channel the
 * real check cannot, and the repair leaves behind exactly the enclosed bays it
 * exists to remove — 12% of prototype maps still failed the shipped 32u check
 * with the unpadded radius, and none do with it.
 */
function markOpenWater(g: ExtractionGrid, navClear0: number): void {
  const { mask, open, n, NN } = g;
  const cell = g.field.cell;
  const navClear = navClear0 + cell * g.navPad;
  const r = Math.ceil(navClear / cell);
  const offs = discOffsets(n, cell, navClear, r);
  open.fill(0);
  for (let j = r; j < n - r; j++) {
    for (let i = r; i < n - r; i++) {
      const k = j * n + i;
      if (mask[k] === LAND) continue;
      if (mask[k] === OUT) {
        open[k] = 1; // beyond the disc: always sea
        continue;
      }
      open[k] = clearOfLand(mask, k, offs) ? 1 : 0;
    }
  }
  // border cells are outside the disc by construction
  for (let i = 0; i < NN; i++) if (mask[i] === OUT) open[i] = 1;
}

/** Index offsets of the disc of radius `navClear` (in u) on an n-wide grid. */
function discOffsets(n: number, cell: number, navClear: number, r: number): Int32Array {
  const offs: number[] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if ((dx * dx + dy * dy) * cell * cell < navClear * navClear) offs.push(dy * n + dx);
    }
  }
  return Int32Array.from(offs);
}

/** True iff no offset lands on a LAND cell. */
function clearOfLand(mask: Uint8Array, k: number, offs: Int32Array): boolean {
  for (let o = 0; o < offs.length; o++) {
    if (mask[k + offs[o]] === LAND) return false;
  }
  return true;
}

/**
 * 4-connected flood over `g.acc` from `sp0` stacked seeds; `admit(nb)` decides
 * which unvisited cells the front may claim. Both closure phases and their
 * differing predicates run through this one spread.
 */
function flood(g: ExtractionGrid, sp0: number, admit: (idx: number) => boolean): void {
  const { acc, stack, n, NN } = g;
  let sp = sp0;
  const visit = (nb: number): void => {
    if (!acc[nb] && admit(nb)) {
      acc[nb] = 1;
      stack[sp++] = nb;
    }
  };
  while (sp > 0) {
    const idx = stack[--sp];
    const cx = idx % n;
    if (idx >= n) visit(idx - n);
    if (idx + n < NN) visit(idx + n);
    if (cx > 0) visit(idx - 1);
    if (cx < n - 1) visit(idx + 1);
  }
}

/** Seed `g.acc`/`g.stack` with the OPEN cells under the spawn-ring probes. */
function seedFromRing(g: ExtractionGrid, spawnRing: number): number {
  const { open, acc, stack, n } = g;
  const { cell, x0, y0 } = g.field;
  acc.fill(0);
  let sp = 0;
  for (const p of ringProbes(spawnRing, 512)) {
    const i = Math.round((p.x - x0) / cell);
    const j = Math.round((p.y - y0) / cell);
    if (i < 0 || j < 0 || i >= n || j >= n) continue;
    const k = j * n + i;
    if (open[k] && !acc[k]) {
      acc[k] = 1;
      stack[sp++] = k;
    }
  }
  if (sp === 0) {
    acc[0] = 1; // grid corner: always outside the disc, hence open sea
    stack[sp++] = 0;
  }
  return sp;
}

/**
 * THE closure pass: fill every body of water a hull can never reach.
 *
 * One pass replaces BOTH the retired star-shape "lagoons are structurally
 * impossible" guarantee AND the old generate-and-reject navigability loop:
 *
 *   1. OPEN water = a water cell with no land inside `navClear` (a hull fits);
 *   2. flood OPEN 4-connected from the spawn ring;
 *   3. spread from that reached open water through TIGHT water ONLY;
 *   4. water still unreached is not ocean — turn it into LAND.
 *
 * Phase 3's restriction to TIGHT water (water too close to a coast for a hull)
 * is LOAD-BEARING: spreading through ANY water instead lets a single
 * sub-hull-width strait leak the flood into a landlocked bay, so the bay's
 * genuinely navigable interior is marked reachable and never repaired. That
 * bug made the closure a no-op on most prototype maps (measured: 0 cells
 * filled) and left 28% of them failing the shipped navigability check.
 *
 * Step 4 seals an enclosed lagoon and it seals a bay whose mouth is narrower
 * than the widest hull. Geometrically the second case is two headlands nearly
 * touching, so joining them reads as a natural coastline, not a patch. Being a
 * REPAIR rather than a rejection is what lets the generator be single-shot.
 */
export function closeUnreachableWater(
  g: ExtractionGrid,
  spawnRing: number,
  navClear: number,
): number {
  const { mask, open, acc, stack, NN } = g;
  markOpenWater(g, navClear);
  // phase 1: through open water only
  flood(g, seedFromRing(g, spawnRing), (nb) => open[nb] === 1);
  // phase 2: from the reached ocean, ONLY through tight water (see above)
  let sp = 0;
  for (let i = 0; i < NN; i++) if (acc[i]) stack[sp++] = i;
  flood(g, sp, (nb) => mask[nb] === WATER && open[nb] === 0);
  let filled = 0;
  for (let i = 0; i < NN; i++) {
    if (mask[i] === WATER && !acc[i]) {
      mask[i] = LAND;
      filled++;
    }
  }
  return filled;
}

// --- Field repair (nav-cell sealing) ------------------------------------------

/**
 * Raise the FIELD into a smooth dome about (x, y) so the next threshold reads
 * it as land. Raising the field rather than overriding the mask matters: the
 * coastline is an INTERPOLATED isoline, so a mask override would leave a
 * cell-quantised blocky plug whose corners pinch against the existing coast
 * (measured in the prototype: 14x more nearest-boundary push-out failures). A
 * quadratic dome puts a smooth, genuinely circular headland there instead, and
 * it blends with whatever land it is being welded to.
 */
export function forceLandDisc(
  g: ExtractionGrid,
  x: number,
  y: number,
  rad: number,
  level: number,
): void {
  const { n, cell, x0, y0, v } = g.field;
  const amp = (level < 0 ? -level : level) * 0.02 + 0.02;
  const i0 = Math.max(0, Math.floor((x - rad - x0) / cell));
  const i1 = Math.min(n - 1, Math.ceil((x + rad - x0) / cell));
  const j0 = Math.max(0, Math.floor((y - rad - y0) / cell));
  const j1 = Math.min(n - 1, Math.ceil((y + rad - y0) / cell));
  for (let j = j0; j <= j1; j++) {
    const py = y0 + j * cell;
    for (let i = i0; i <= i1; i++) {
      const px = x0 + i * cell;
      const dx = px - x;
      const dy = py - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > rad * rad || !g.inDisc[j * n + i]) continue;
      const k = j * n + i;
      const t = 1 - Math.sqrt(d2) / rad;
      const want = level + amp * t * t * (3 - 2 * t); // smoothstep dome
      if (v[k] < want) v[k] = want;
    }
  }
  // Smooth the WELD. Where the dome meets an existing coast the two isolines
  // cross at a shallow angle and leave a cusp — a water wedge whose nearest-
  // boundary push-out direction is ambiguous. Three local blur passes over the
  // dome's neighbourhood round the junction into an ordinary headland
  // (measured: near-field push-out failures 116 -> 11 per 261k trials, i.e.
  // back to the un-repaired baseline).
  blurDisc(g, x, y, rad + 3 * cell, 3);
}

/** In-place binomial blur over the samples within `rad` of (x, y), `passes` times. */
function blurDisc(g: ExtractionGrid, x: number, y: number, rad: number, passes: number): void {
  const { n, cell, x0, y0, v } = g.field;
  const i0 = Math.max(1, Math.floor((x - rad - x0) / cell));
  const i1 = Math.min(n - 2, Math.ceil((x + rad - x0) / cell));
  const j0 = Math.max(1, Math.floor((y - rad - y0) / cell));
  const j1 = Math.min(n - 2, Math.ceil((y + rad - y0) / cell));
  const w = i1 - i0 + 1;
  const h = j1 - j0 + 1;
  if (w < 3 || h < 3) return;
  const tmp = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * n + i;
        tmp[(j - j0) * w + (i - i0)] =
          (v[k - n - 1] + 2 * v[k - n] + v[k - n + 1] +
            2 * (v[k - 1] + 2 * v[k] + v[k + 1]) +
            v[k + n - 1] + 2 * v[k + n] + v[k + n + 1]) / 16;
      }
    }
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) v[j * n + i] = tmp[(j - j0) * w + (i - i0)];
    }
  }
}

// --- Marching squares --------------------------------------------------------
//
// Corner (i,j) samples; cell (i,j) spans corners (i,j)-(i+1,j+1).
// Case bits: 1 = (i,j) BL, 2 = (i+1,j) BR, 4 = (i+1,j+1) TR, 8 = (i,j+1) TL.
// Every segment is emitted with LAND ON THE LEFT, so outer boundaries come out
// CCW and holes come out CW — exactly the fill rule the renderer wants.
// Edge ids: horizontal edge below corner-row j: j*n + i. Vertical edge left of
// corner-col i: n*n + j*n + i. Each crossed grid edge is the exit of exactly
// one cell and the entry of exactly one other, so `next[]` is a permutation
// and the loops fall out with no endpoint matching on floats.

const SEGS = new Int8Array(16 * 4).fill(-1);
function seg(c: number, a: number, b: number): void {
  SEGS[c * 4] = a;
  SEGS[c * 4 + 1] = b;
}
seg(1, 0, 3); // BL: bottom -> left
seg(2, 1, 0); // BR: right -> bottom
seg(3, 1, 3); // BL+BR: right -> left
seg(4, 2, 1); // TR: top -> right
seg(6, 2, 0); // BR+TR: top -> bottom
seg(7, 2, 3); // BL+BR+TR: top -> left
seg(8, 3, 2); // TL: left -> top
seg(9, 0, 2); // BL+TL: bottom -> top
seg(11, 1, 2); // BL+BR+TL: right -> top
seg(12, 3, 1); // TL+TR: left -> right
seg(13, 0, 1); // BL+TL+TR: bottom -> right
seg(14, 3, 0); // BR+TL+TR: left -> bottom
// The two ambiguous saddles, resolved by the ASYMPTOTIC DECIDER (the bilinear
// value at the cell centre). Deciding them consistently is what keeps the
// contour non-self-intersecting and keeps the traced topology in agreement
// with the land connectivity.
const SADDLE = new Int8Array([
  0, 1, 2, 3, // case 5 (BL,TR land) joined
  0, 3, 2, 1, // case 5 split
  3, 0, 1, 2, // case 10 (BR,TL land) joined
  1, 0, 3, 2, // case 10 split
]);

/** Edge id for local edge index e of cell (i,j). 0=bottom 1=right 2=top 3=left. */
function edgeId(n: number, i: number, j: number, e: number): number {
  if (e === 0) return j * n + i;
  if (e === 2) return (j + 1) * n + i;
  if (e === 3) return n * n + j * n + i;
  return n * n + j * n + (i + 1);
}

/** The marching-squares case bits of cell (i,j) against the current mask. */
function cellCase(mask: Uint8Array, n: number, i: number, j: number): number {
  const bl = j * n + i;
  let c = 0;
  if (mask[bl] === LAND) c |= 1;
  if (mask[bl + 1] === LAND) c |= 2;
  if (mask[bl + n + 1] === LAND) c |= 4;
  if (mask[bl + n] === LAND) c |= 8;
  return c;
}

/** Populate `g.next` with the edge-to-edge link permutation for `level`. */
function linkCells(g: ExtractionGrid, level: number): void {
  const { n, mask, next } = g;
  const v = g.field.v;
  next.fill(-1);
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const c = cellCase(mask, n, i, j);
      if (c === 0 || c === 15) continue;
      if (c === 5 || c === 10) {
        const bl = j * n + i;
        const joined = (v[bl] + v[bl + 1] + v[bl + n] + v[bl + n + 1]) * 0.25 >= level;
        const b = (c === 5 ? 0 : 8) + (joined ? 0 : 4);
        next[edgeId(n, i, j, SADDLE[b])] = edgeId(n, i, j, SADDLE[b + 1]);
        next[edgeId(n, i, j, SADDLE[b + 2])] = edgeId(n, i, j, SADDLE[b + 3]);
      } else {
        next[edgeId(n, i, j, SEGS[c * 4])] = edgeId(n, i, j, SEGS[c * 4 + 1]);
      }
    }
  }
}

/**
 * World position of the isoline crossing on grid edge `id`, interpolating the
 * field toward `level`; when a repaired mask cell disagrees with the raw
 * values the crossing falls back to the edge midpoint.
 *
 * The interpolation parameter is CLAMPED away from the grid CORNERS
 * (t in [0.25, 0.75]) — LOAD-BEARING: two crossings on the two edges meeting
 * at a corner can otherwise land arbitrarily close together (the isoline
 * grazing a lattice point from both sides), pinching the polygon to a
 * sub-unit neck that no amount of field morphology can see — measured 0.56u
 * in the prototype before this clamp. At 0.25 the worst corner pinch is
 * 0.25·√2·cell ≈ 4.9u at cell 14 — the minimum local feature size that makes
 * nearest-boundary push-out safe — and the cost is a <=0.25-cell coastline
 * displacement in exactly the near-degenerate case where the isoline position
 * was meaningless anyway.
 */
function crossingPoint(g: ExtractionGrid, level: number, id: number): Vec2 {
  const { n, NN } = g;
  const { cell, x0, y0, v } = g.field;
  let i: number;
  let j: number;
  let dx: number;
  let dy: number;
  if (id < NN) {
    j = (id / n) | 0;
    i = id - j * n;
    dx = 1;
    dy = 0;
  } else {
    const k = id - NN;
    j = (k / n) | 0;
    i = k - j * n;
    dx = 0;
    dy = 1;
  }
  const a = v[j * n + i];
  const b = v[(j + dy) * n + (i + dx)];
  let t = 0.5;
  if (a < level !== b < level && b !== a) t = (level - a) / (b - a);
  if (!(t > 0.25)) t = 0.25;
  else if (t > 0.75) t = 0.75;
  return { x: x0 + (i + dx * t) * cell, y: y0 + (j + dy * t) * cell };
}

/**
 * Trace every closed contour of `g.mask` as an ordered point loop. Call
 * `buildMask(g, level)` first; the mask decides topology, the field values
 * place the crossings.
 */
export function traceLoops(g: ExtractionGrid, level: number): Vec2[][] {
  const { NN, next, seen } = g;
  linkCells(g, level);
  seen.fill(0);
  const loops: Vec2[][] = [];
  for (let id = 0; id < 2 * NN; id++) {
    if (next[id] < 0 || seen[id]) continue;
    const loop: Vec2[] = [];
    let cur = id;
    while (cur >= 0 && !seen[cur]) {
      seen[cur] = 1;
      loop.push(crossingPoint(g, level, cur));
      cur = next[cur];
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}

// --- Pole of inaccessibility --------------------------------------------------

/** Axis-aligned bounding box of a polygon. */
function polyBounds(poly: readonly Vec2[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Largest inscribed disc about an interior point (polylabel-lite): coarse 9x9
 * probe over the bounding box, then five halving refinement rings around the
 * incumbent. Replaces `Island.core` measured about the bounding centre, which
 * is 0 for any hook or crescent whose centroid falls in its own bay —
 * precisely the shapes this generator makes, and precisely the islands whose
 * LOS early-out matters most. Deterministic: fixed probe order, strict
 * improvement only.
 */
export function poleOfInaccessibility(poly: readonly Vec2[]): Vec2 & { r: number } {
  const { minX, maxX, minY, maxY } = polyBounds(poly);
  let best = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, r: -1 };
  const probe = (x: number, y: number): void => {
    if (!pointInPolygon({ x, y }, poly)) return;
    const d = closestPointOnPolygon({ x, y }, poly).dist;
    if (d > best.r) best = { x, y, r: d };
  };
  const K = 8;
  for (let a = 0; a <= K; a++) {
    for (let b = 0; b <= K; b++) {
      probe(minX + ((maxX - minX) * a) / K, minY + ((maxY - minY) * b) / K);
    }
  }
  let step = Math.max((maxX - minX) / K, (maxY - minY) / K) * 0.5;
  for (let it = 0; it < 5; it++) {
    const cx = best.x;
    const cy = best.y;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) probe(cx + a * step, cy + b * step);
    }
    step *= 0.5;
  }
  if (best.r < 0) best = { x: poly[0].x, y: poly[0].y, r: 0 };
  return best;
}
