// RAIN RADAR CLUTTER — the grainy, band-shaped mush rain paints on the scope
// (Story 11.6 scope add, Eric 2026-11-14, AskUserQuestion: "rain clutter" —
// re-rolled every sweep; WEAK near band edges, MEDIUM in band middles, HEAVY
// outside the ring; real returns are NOT weakened). Each client draws its own
// from the shared rain field (`fogDensityAt`) — no server, no wire.
//
// Pure presentation math, NO Pixi, NO Math.random: the grain is a hash of the
// ABSOLUTE radar-lattice cell (`CONFIG.vision.radarCellU`, which the radar
// hands in as `CLIENT_CONFIG.blip.heatmap.cellU` — one lattice) and the SWEEP INDEX
// (`cellNoise(paintSeed('rainClutter', sweep), gx, gy)`), so one revolution's
// clutter is a frozen, reproducible pattern and the next revolution rolls a
// fresh one. The output is a `MarchSlice` — the record the radar's own
// rasterizer stamps (render/radarHeatmap.ts `rasterize` / `stampSlice`) — so a
// clutter cell is banded, phosphor-decayed and max-wins-merged exactly like
// every other return: a hull's red cell is never weakened by clutter on it
// within the same beam crossing (stronger wins), and clutter never removes a
// paint.
//
// The tier of a cell (its center inside radar range and inside the beam
// sector swept this step) comes from the rain density d there and ρ =
// distance from the live eye / live ring radius:
//   d = 0                     → nothing (clear water, the eye, gaps)
//   ρ ≤ 1, 0 < d < midDensity → WEAK   (band edges: the soft rim of a band)
//   ρ ≤ 1, d ≥ midDensity     → MEDIUM (band middles: solid rain)
//   ρ > 1, d > 0              → HEAVY  (out in the storm), its amount eased
//                               in by d / midDensity so the storm's gaps keep
//                               soft edges instead of a hard cut
// A lit cell rolls `cellNoise < amount`; its intensity is the tier's strength
// × (1 ± grain), the same "1 ± amount" grain law the return model uses.

import { FOG_SOLID_DENSITY, fogDensityAt, type FogFrame } from '@salvo/shared';
import { cellNoise, paintSeed } from './radarHeatmap.js';
import type { MarchSlice } from './radarMarch.js';

/** One clutter tier: the chance a cell in it paints this sweep, and its intensity. */
export interface ClutterTier {
  amount: number; // probability per lattice cell per sweep, [0, 1]
  strength: number; // intensity (the heat bands' scale: green ≥ 0.12, blue ≥ 0.36, red ≥ 0.7)
}

export interface RainClutterOpts {
  cellU: number; // u — the radar lattice: radar.ts passes CLIENT_CONFIG.blip.heatmap.cellU, which IS CONFIG.vision.radarCellU
  weak: ClutterTier;
  medium: ClutterTier;
  heavy: ClutterTier;
  midDensity: number; // density splitting a band's edge (weak) from its middle (medium)
  grain: number; // intensity jitter, ± this fraction
}

/** Tier ids: -1 none, 0 weak, 1 medium, 2 heavy. */
export type ClutterTierId = -1 | 0 | 1 | 2;

/**
 * Page defaults for a marine-radar rain look (bench picks, Eric's to set):
 * faint green speckle at band edges, a denser green-into-blue smear in band
 * cores, a heavy mostly-blue carpet out in the storm. Every strength sits
 * below the red band (0.7) so a hull's solid red return always stands out.
 */
export const RAIN_CLUTTER_DEFAULTS: Omit<RainClutterOpts, 'cellU'> = {
  weak: { amount: 0.03, strength: 0.17 },
  medium: { amount: 0.11, strength: 0.3 },
  heavy: { amount: 0.175, strength: 0.42 },
  midDensity: FOG_SOLID_DENSITY,
  grain: 0.3,
};

/** The beam step the clutter is drawn for. */
export interface RainClutterInput {
  frame: FogFrame; // the rain at this instant (fogFrameAt)
  ox: number; // u — the observer (the scope's center)
  oy: number;
  rangeU: number; // u — radar range; nothing beyond it
  sweepIndex: number; // which revolution — the re-roll seed
  from: number; // rad — the beam's bearing at the start of the step (world axes: dx = cos, dy = sin)
  to: number; // rad — at the end; the step covers [from, to), to ≥ from
  t: number; // ms — paint time stamped on the slice (its phosphor age)
}

/** The tier of a cell with rain density `d` at ρ = distance from the eye / ring radius. */
export function clutterTierAt(d: number, rho: number, midDensity: number): ClutterTierId {
  if (!(d > 0)) return -1;
  if (!(rho <= 1)) return 2;
  return d < midDensity ? 0 : 1;
}

/** The paint probability of a cell (the tier's amount; heavy eased in by density). */
export function clutterAmountAt(d: number, rho: number, o: Omit<RainClutterOpts, 'cellU'>): number {
  const tier = clutterTierAt(d, rho, o.midDensity);
  if (tier === -1) return 0;
  if (tier === 0) return o.weak.amount;
  if (tier === 1) return o.medium.amount;
  const ease = o.midDensity > 0 ? Math.min(1, d / o.midDensity) : 1;
  return o.heavy.amount * ease;
}

function tierStrength(tier: ClutterTierId, o: RainClutterOpts): number {
  return tier === 0 ? o.weak.strength : tier === 1 ? o.medium.strength : o.heavy.strength;
}

/** A fresh, empty slice record (buffers grow as needed). */
export function emptyClutterSlice(capacity = 1024): MarchSlice {
  return {
    kind: 'slice', cells: new Int32Array(capacity * 2), w: new Float32Array(capacity), n: 0, t: 0,
    minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
  };
}

function push(s: MarchSlice, gx: number, gy: number, w: number, cellU: number): MarchSlice {
  let out = s;
  if (out.n >= out.w.length) {
    const grown = emptyClutterSlice(out.w.length * 2);
    grown.cells.set(out.cells);
    grown.w.set(out.w);
    grown.n = out.n;
    grown.t = out.t;
    grown.minX = out.minX; grown.minY = out.minY; grown.maxX = out.maxX; grown.maxY = out.maxY;
    out = grown;
  }
  out.cells[out.n * 2] = gx;
  out.cells[out.n * 2 + 1] = gy;
  out.w[out.n] = w;
  out.n++;
  const x0 = gx * cellU;
  const y0 = gy * cellU;
  if (x0 < out.minX) out.minX = x0;
  if (y0 < out.minY) out.minY = y0;
  if (x0 + cellU > out.maxX) out.maxX = x0 + cellU;
  if (y0 + cellU > out.maxY) out.maxY = y0 + cellU;
  return out;
}

/** Per-step constants handed to the row walk. */
interface Walk {
  in: RainClutterInput;
  o: RainClutterOpts;
  seed: number;
  seedW: number;
  // the wedge piece: unit vectors of its two edges
  u0x: number; u0y: number; u1x: number; u1y: number;
}

/** Is offset (px, py) inside the half-open wedge piece [u0, u1) and the range disc? */
function inPiece(w: Walk, px: number, py: number, R2: number): boolean {
  if (px * px + py * py > R2) return false;
  return w.u0x * py - w.u0y * px >= 0 && px * w.u1y - py * w.u1x > 0;
}

/** Narrow [lo, hi] by a·x ≥ b (a·x > b for strict; boundaries are re-tested per cell anyway). */
function halfPlane(a: number, b: number, lo: number, hi: number): [number, number] {
  if (a > 0) return [Math.max(lo, b / a), hi];
  if (a < 0) return [lo, Math.min(hi, b / a)];
  return b <= 0 ? [lo, hi] : [1, 0];
}

/** One cell: roll it, maybe paint it. */
function cell(w: Walk, s: MarchSlice, gx: number, gy: number, cx: number, cy: number): MarchSlice {
  const f = w.in.frame;
  const d = fogDensityAt(f, cx, cy);
  if (!(d > 0)) return s;
  const ex = cx - f.cx;
  const ey = cy - f.cy;
  const rho = f.R > 0 ? Math.sqrt(ex * ex + ey * ey) / f.R : Infinity;
  const p = clutterAmountAt(d, rho, w.o);
  if (!(cellNoise(w.seed, gx, gy) < p)) return s;
  const tier = clutterTierAt(d, rho, w.o.midDensity);
  const g = w.o.grain > 0 ? w.o.grain : 0;
  const intensity = tierStrength(tier, w.o) * (1 + g * (2 * cellNoise(w.seedW, gx, gy) - 1));
  return intensity > 0 ? push(s, gx, gy, intensity, w.o.cellU) : s;
}

/** Walk the lattice rows of one convex wedge piece (≤ a quarter turn). */
function walkPiece(w: Walk, s0: MarchSlice): MarchSlice {
  const { ox, oy, rangeU: R } = w.in;
  const c = w.o.cellU;
  const R2 = R * R;
  // y extent: the piece's corners, plus the disc's top / bottom if the piece spans them
  let yLo = Math.min(0, R * w.u0y, R * w.u1y);
  let yHi = Math.max(0, R * w.u0y, R * w.u1y);
  if (w.u0x > 0 && w.u1x < 0) yHi = R; // spans +y (bearing π/2)
  if (w.u0x < 0 && w.u1x > 0) yLo = -R; // spans −y (bearing 3π/2)
  let s = s0;
  const gy0 = Math.floor((oy + yLo) / c);
  const gy1 = Math.floor((oy + yHi) / c);
  for (let gy = gy0; gy <= gy1; gy++) {
    const cy = (gy + 0.5) * c;
    const py = cy - oy;
    const span2 = R2 - py * py;
    if (span2 < 0) continue;
    const half = Math.sqrt(span2);
    let [lo, hi] = halfPlane(-w.u0y, -w.u0x * py, -half, half);
    [lo, hi] = halfPlane(w.u1y, py * w.u1x, lo, hi);
    if (hi < lo) continue;
    const gx0 = Math.floor((ox + lo) / c) - 1;
    const gx1 = Math.floor((ox + hi) / c) + 1;
    for (let gx = gx0; gx <= gx1; gx++) {
      const cx = (gx + 0.5) * c;
      if (inPiece(w, cx - ox, py, R2)) s = cell(w, s, gx, gy, cx, cy);
    }
  }
  return s;
}

const QUARTER = Math.PI / 2;
const TURN = Math.PI * 2;

/** Is there anything to paint: rain on, a positive finite step, range, lattice and observer? */
function canPaint(input: RainClutterInput, opts: RainClutterOpts, width: number): boolean {
  if (!input.frame.on || !(width > 0) || !(input.rangeU > 0) || !(opts.cellU > 0)) return false;
  return [input.from, width, input.rangeU, input.ox, input.oy].every(Number.isFinite);
}

/**
 * The clutter the beam paints sweeping [from, to) this step: lattice cells
 * whose centers lie in that sector within `rangeU` of the observer, rolled
 * against the sweep's seed. A non-positive or non-finite step, range or
 * observer, or a frame with no rain, paints nothing. A step of a full turn or
 * more paints the whole disc once. Reuses `out` (returned possibly regrown).
 */
export function rainClutter(input: RainClutterInput, opts: RainClutterOpts, out?: MarchSlice): MarchSlice {
  let s = out ?? emptyClutterSlice();
  s.n = 0;
  s.t = input.t;
  s.minX = Infinity; s.minY = Infinity; s.maxX = -Infinity; s.maxY = -Infinity;
  const from = input.from;
  const width = Math.min(TURN, input.to - from);
  if (!canPaint(input, opts, width)) return s;
  const sweep = Math.floor(input.sweepIndex) | 0;
  const w: Walk = {
    in: input, o: opts, seed: paintSeed('rainClutter', sweep), seedW: paintSeed('rainClutterW', sweep),
    u0x: 0, u0y: 0, u1x: 0, u1y: 0,
  };
  const pieces = Math.ceil(width / QUARTER);
  for (let k = 0; k < pieces; k++) {
    const a0 = from + (width * k) / pieces;
    const a1 = from + (width * (k + 1)) / pieces;
    w.u0x = Math.cos(a0); w.u0y = Math.sin(a0);
    w.u1x = Math.cos(a1); w.u1y = Math.sin(a1);
    s = walkPiece(w, s);
  }
  return s;
}
