// The rain field for the bench: the REAL shared fog field (sim/fog.ts) sampled
// into a world raster, refreshed progressively (a few rows a frame into a back
// buffer) and blended between the last two complete rasters so neither the
// drawing nor the optical depth ever steps. The optical-depth march reads the
// blended raster bilinearly (the exact per-point fogDensityAt march is far too
// slow for ~70 points × 6 ships × 60 fps).

import {
  CONFIG,
  FOG_NO_CUT,
  fogCutForTarget,
  fogDensityAt,
  fogLattice,
  makeFogField,
  type FogField,
} from '@salvo/shared';

export const OCEAN_R = 5000; // u — the field's ocean (spin centre = origin); fog is 0 beyond it
export const RASTER_R = 3800; // u — half-side of the sampled square around the observer (origin)
export const CELL_U = 24; // u per raster cell
export const N = Math.ceil((2 * RASTER_R) / CELL_U) + 1;
const ROWS_PER_FRAME = 12;

export class RainField {
  field: FogField;
  cut = FOG_NO_CUT;
  coverage: number;
  readonly ox = -RASTER_R;
  readonly oy = -RASTER_R;
  private prev = new Float32Array(N * N);
  private cur = new Float32Array(N * N);
  private fill = new Float32Array(N * N);
  /** Blended display raster (what is drawn and marched). */
  readonly view = new Float32Array(N * N);
  private fillRow = 0;
  private fillT = 0;
  private fillCut = FOG_NO_CUT;
  private readonly lattice: { x: number; y: number }[];

  constructor(seed: number, coverage: number, tMs: number) {
    this.coverage = coverage;
    this.field = makeFogField(seed, CONFIG.fog, OCEAN_R);
    this.lattice = fogLattice(0, 0, OCEAN_R, CONFIG.fog.quantileLattice);
    this.resetAt(tMs);
  }

  reseed(seed: number, tMs: number): void {
    this.field = makeFogField(seed, CONFIG.fog, OCEAN_R);
    this.resetAt(tMs);
  }

  setCoverage(c: number, tMs: number): void {
    this.coverage = c;
    this.resetAt(tMs);
  }

  /** Synchronous full refresh (seed / coverage change). */
  resetAt(tMs: number): void {
    this.cut = fogCutForTarget(this.field, tMs, this.lattice, this.coverage);
    this.fillT = tMs;
    this.fillCut = this.cut;
    for (let j = 0; j < N; j++) this.fillRowAt(j);
    this.prev.set(this.fill);
    this.cur.set(this.fill);
    this.view.set(this.fill);
    this.fillRow = 0;
    this.startFill(tMs);
  }

  private startFill(tMs: number): void {
    this.fillT = tMs;
    this.fillCut = fogCutForTarget(this.field, tMs, this.lattice, this.coverage);
    this.fillRow = 0;
  }

  private fillRowAt(j: number): void {
    const y = this.oy + j * CELL_U;
    const row = j * N;
    for (let i = 0; i < N; i++) this.fill[row + i] = fogDensityAt(this.field, this.ox + i * CELL_U, y, this.fillT, this.fillCut);
  }

  /** Advance the progressive refresh; `tMs` = current rain clock. Rebuilds `view`. */
  step(tMs: number): void {
    const end = Math.min(N, this.fillRow + ROWS_PER_FRAME);
    for (let j = this.fillRow; j < end; j++) this.fillRowAt(j);
    this.fillRow = end;
    if (this.fillRow >= N) {
      const p = this.prev;
      this.prev = this.cur;
      this.cur = this.fill;
      this.fill = p;
      this.cut = this.fillCut;
      this.startFill(tMs);
    }
    const f = this.fillRow / N;
    const a = this.prev;
    const b = this.cur;
    const v = this.view;
    for (let k = 0; k < v.length; k++) v[k] = a[k] + (b[k] - a[k]) * f;
  }

  /** Bilinear density from the blended raster; 0 outside it. */
  densityAt(x: number, y: number): number {
    const gx = (x - this.ox) / CELL_U;
    const gy = (y - this.oy) / CELL_U;
    if (!(gx >= 0 && gy >= 0 && gx < N - 1 && gy < N - 1)) return 0;
    const i = gx | 0;
    const j = gy | 0;
    const fx = gx - i;
    const fy = gy - j;
    const k = j * N + i;
    const v = this.view;
    const top = v[k] + (v[k + 1] - v[k]) * fx;
    const bot = v[k + N] + (v[k + N + 1] - v[k + N]) * fx;
    return top + (bot - top) * fy;
  }

  /** τ = ∫ density ds from (ax, ay) to (bx, by): a marchStepU midpoint march (NO own-bank exemption). */
  opticalDepth(ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (!(len > 0)) return 0;
    const n = Math.max(1, Math.ceil(len / CONFIG.fog.marchStepU));
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      sum += this.densityAt(ax + dx * f, ay + dy * f);
    }
    return sum * (len / n);
  }
}
