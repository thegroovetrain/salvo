// The rain raster for the bench: the REAL shared rain field (shared/src/sim/fog.ts
// — the eye of the hurricane anchored to the live zone ring) sampled into a square
// world raster, refreshed progressively (rows into a back buffer under a
// per-frame time budget) and blended between the last two complete rasters so
// neither the drawing nor the optical depth ever steps. The optical-depth march
// reads the blended raster bilinearly (an exact per-point march is far too slow
// for ~70 points × 6 ships × 60 fps). Two of these exist: one around the
// observer (the ship-look view), one over the whole map (the Storm view).

import { CONFIG, fogDensityAt, fogFrameAt, zoneStateAt, type FogField, type FogFrame, type ZoneRing } from '@salvo/shared';

/** The bench's match storm: the real shared rain field plus the match's rolled rings. */
export interface Storm {
  fog: FogField;
  rings: ZoneRing[];
}

/** The live ring at `tMs` (ms from zone start) — the eye's center and radius. */
export function stormRing(storm: Storm, tMs: number): ZoneRing {
  return zoneStateAt(tMs, 0, storm.rings, CONFIG.zone).current;
}

/** The real rain frame at `tMs`: `fogFrameAt` anchored to the live ring (zone start = 0). */
export function stormFrame(storm: Storm, tMs: number, out?: FogFrame): FogFrame {
  const r = stormRing(storm, tMs);
  return fogFrameAt(storm.fog, tMs, 0, r.cx, r.cy, CONFIG.zone, out && out.field === storm.fog ? out : undefined);
}

export class RainField {
  readonly N: number;
  ox = 0;
  oy = 0;
  private prev: Float32Array;
  private cur: Float32Array;
  private fill: Float32Array;
  /** Blended display raster (what is drawn and marched). */
  readonly view: Float32Array;
  private fillRow = 0;
  private frame: FogFrame | undefined;
  /** ms spent sampling in the last step (for the readout). */
  lastStepMs = 0;
  /** ms one full raster took to fill (sum over its frames). */
  lastFullMs = 0;
  private accMs = 0;

  constructor(
    public storm: Storm,
    readonly halfU: number,
    readonly cellU: number,
    cx: number,
    cy: number,
    tMs: number,
    private budgetMs = 7,
  ) {
    this.N = Math.ceil((2 * halfU) / cellU) + 1;
    const n = this.N * this.N;
    this.prev = new Float32Array(n);
    this.cur = new Float32Array(n);
    this.fill = new Float32Array(n);
    this.view = new Float32Array(n);
    this.resetAt(tMs, cx, cy);
  }

  /** Synchronous full refresh at `tMs`, optionally re-centred (seed / scrub / view change). */
  resetAt(tMs: number, cx?: number, cy?: number): void {
    if (cx !== undefined && cy !== undefined) {
      this.ox = cx - this.halfU;
      this.oy = cy - this.halfU;
    }
    this.startFill(tMs);
    for (let j = 0; j < this.N; j++) this.fillRowAt(j);
    this.prev.set(this.fill);
    this.cur.set(this.fill);
    this.view.set(this.fill);
    this.startFill(tMs);
  }

  private startFill(tMs: number): void {
    this.frame = stormFrame(this.storm, tMs, this.frame);
    this.fillRow = 0;
  }

  private fillRowAt(j: number): void {
    const N = this.N;
    const y = this.oy + j * this.cellU;
    const row = j * N;
    const f = this.frame!;
    for (let i = 0; i < N; i++) this.fill[row + i] = fogDensityAt(f, this.ox + i * this.cellU, y);
  }

  /** Advance the progressive refresh (time-budgeted); `tMs` = current match clock. Rebuilds `view`. */
  step(tMs: number): void {
    const N = this.N;
    const t0 = performance.now();
    while (this.fillRow < N) {
      this.fillRowAt(this.fillRow++);
      if (performance.now() - t0 > this.budgetMs) break;
    }
    this.lastStepMs = performance.now() - t0;
    this.accMs += this.lastStepMs;
    if (this.fillRow >= N) {
      const p = this.prev;
      this.prev = this.cur;
      this.cur = this.fill;
      this.fill = p;
      this.lastFullMs = this.accMs;
      this.accMs = 0;
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
    const N = this.N;
    const gx = (x - this.ox) / this.cellU;
    const gy = (y - this.oy) / this.cellU;
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
