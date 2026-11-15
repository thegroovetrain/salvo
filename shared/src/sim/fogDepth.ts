// RAIN SIGHT — the two transcendental facts of the rain's sight model (Story
// 11.6; Eric 2026-11-14, Story 11.6 bench page). They live OUTSIDE sim/fog.ts
// because that file keeps the map-gen posture (no exp / log — its source guard).
//
// Visibility through optical depth τ is Beer–Lambert: V = exp(−k × τ), k =
// `extinctionPerU` (per u at density 1). A thing is seen while V ≥
// `sightCutoffV`, i.e. while τ ≤ T = ln(1 / sightCutoffV) / k — the ONE
// threshold every eye gate compares `fogDepthAlong` against. A server gate
// never needs `fogVisibility` (it compares τ to T); the client's per-part look
// does.

/** The slice of `CONFIG.fog` the sight threshold reads. */
export interface FogSightConfig {
  extinctionPerU: number; // per u, at density 1
  sightCutoffV: number; // the visibility below which a thing vanishes
}

/**
 * T — the optical depth at which visibility falls to the cutoff:
 * ln(1 / sightCutoffV) / extinctionPerU. Degenerate dials fail OPEN (the rain
 * never hides): a non-positive or non-finite extinction, or a non-positive
 * cutoff, read Infinity; a cutoff ≥ 1 reads 0 (any rain at all hides).
 */
export function fogMaxDepth(cfg: FogSightConfig): number {
  const k = cfg.extinctionPerU;
  const v = cfg.sightCutoffV;
  if (!(k > 0) || !Number.isFinite(k) || !(v > 0)) return Infinity;
  if (v >= 1) return 0;
  return Math.log(1 / v) / k;
}

/** V = exp(−extinctionPerU × τ) in [0, 1]; a NaN or non-positive τ reads 1 (clear). */
export function fogVisibility(tau: number, cfg: FogSightConfig): number {
  if (!(tau > 0)) return 1;
  const k = cfg.extinctionPerU;
  if (!(k > 0) || !Number.isFinite(k)) return 1;
  return Math.exp(-k * tau);
}

/**
 * DISTANCE HAZE (Story 11.6, Eric 2026-11-15: the anonymous far hull is gone —
 * a hull is crisp to the class-and-name sight and FADES to gone at the hull
 * sight): the optical depth distance alone adds on a hull's eye line, in the
 * same units as rain and smoke — 0 out to `sightU`, rising linearly to
 * `maxDepth` (= T, the cutoff) at `hullSightU`. Both reaches are the
 * observer's own (whiteout-scaled). `hullSightU ≤ sightU` is a hard edge at
 * `sightU`. Non-finite input fails open (0); `d ≥ hullSightU` reads maxDepth.
 */
export function fogHazeDepth(d: number, sightU: number, hullSightU: number, maxDepth: number): number {
  if (!Number.isFinite(d) || !Number.isFinite(sightU) || !Number.isFinite(hullSightU) || !(maxDepth > 0) || !Number.isFinite(maxDepth)) return 0;
  if (!(d > sightU)) return 0;
  if (!(hullSightU > sightU) || d >= hullSightU) return maxDepth;
  return (maxDepth * (d - sightU)) / (hullSightU - sightU);
}
