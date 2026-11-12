// THE DISPERSION BENCH (Story 11.1, Phase A) — the page's pure model. Every
// landing is the REAL shared `dispersedPoint`, every blast/hull test the REAL
// shared `polyInBlast` against the REAL hull silhouette, every salvo's tracks
// the REAL `parallelOffsets` at the main battery's barrel spacing. Seeds come
// from a counter, never Math.random.
//
// Frame: the aim point is the origin, the line of fire runs along +x (the
// shooter sits at x = -range), so "along the shot" is x and "across" is y.

import {
  CONFIG,
  dispersedPoint,
  dispersionAxes,
  hullSilhouette,
  parallelOffsets,
  polyInBlast,
  transformPolygon,
  type DispersionCfg,
  type HullId,
  type Vec2,
} from '@salvo/shared';

export interface BenchState {
  cfg: DispersionCfg;
  rangeU: number;
  shells: number;
  hull: HullId;
  hullX: number;
  hullY: number;
  /** Hull heading vs. the line of fire: 0 = end-on, 90 = side-on. */
  hullAngleDeg: number;
  /** The salvo counter: the drawn salvo's seeds derive from it. */
  counter: number;
  accumulate: boolean;
}

export interface Shell {
  origin: Vec2;
  aim: Vec2;
  land: Vec2;
}

/** How many salvos the "fire 200 salvos" toggle draws. */
export const ACCUMULATE_SALVOS = 200;
/** How many shells the readouts are measured over. */
export const STAT_SHELLS = 2000;
/** The readouts' fixed sample starts here, so a reroll never moves them. */
const STAT_SALVO_BASE = 1_000_000;

export const BLAST_U = CONFIG.mainBattery.burstRadius;
// Every shell of a salvo aims at the ONE point (Eric 2026-11-12, R13) and the
// game's `CONFIG.mainBattery.barrelSpacingU` retired with the parallel landing
// tracks, so the bench's tracks are all on the aim point.
export const SPACING_U = 0;

/** One shell's seed from (salvo, shell): order-independent hash. */
export function shellSeed(salvo: number, shell: number): number {
  return (Math.imul(salvo + 1, 0x85ebca6b) ^ Math.imul(shell + 1, 0x9e3779b9)) >>> 0;
}

/** The salvo's per-shell track offsets (across the line of fire). */
export function trackOffsets(shells: number): Vec2[] {
  return parallelOffsets(0, shells, SPACING_U);
}

/** One salvo: each shell on its own parallel track, landing through the real function. */
export function salvo(s: BenchState, salvoIndex: number): Shell[] {
  return trackOffsets(s.shells).map((o, i) => {
    const origin = { x: -s.rangeU + o.x, y: o.y };
    const aim = { x: o.x, y: o.y };
    return { origin, aim, land: dispersedPoint(origin.x, origin.y, aim.x, aim.y, shellSeed(salvoIndex, i), s.cfg) };
  });
}

/** The target hull's world polygon at its current placement. */
export function hullPoly(s: BenchState): Vec2[] {
  return transformPolygon(hullSilhouette(s.hull), s.hullX, s.hullY, (s.hullAngleDeg * Math.PI) / 180);
}

/** Normalized radius of a landing inside its own shell's ellipse (1 = the edge). */
export function normRadius(sh: Shell, s: BenchState): number {
  const { alongU, acrossU } = dispersionAxes(s.rangeU, s.cfg);
  // A zero-size oval (floor 0 at range 0) lands every shell on the aim point.
  const a = Math.max(alongU, 1e-12);
  const b = Math.max(acrossU, 1e-12);
  return Math.hypot((sh.land.x - sh.aim.x) / a, (sh.land.y - sh.aim.y) / b);
}

export interface Readouts {
  fullLengthU: number;
  fullWidthU: number;
  hitShare: number;
  innerShare: number;
}

/** The readouts, over a fixed seeded sample of STAT_SHELLS shells. */
export function readouts(s: BenchState): Readouts {
  const poly = hullPoly(s);
  const salvos = Math.ceil(STAT_SHELLS / s.shells);
  let hits = 0;
  let inner = 0;
  let n = 0;
  for (let k = 0; k < salvos; k++) {
    for (const sh of salvo(s, STAT_SALVO_BASE + k)) {
      n++;
      if (polyInBlast(sh.land, BLAST_U, poly)) hits++;
      if (normRadius(sh, s) < 0.5) inner++;
    }
  }
  const { alongU, acrossU } = dispersionAxes(s.rangeU, s.cfg);
  return { fullLengthU: alongU * 2, fullWidthU: acrossU * 2, hitShare: hits / n, innerShare: inner / n };
}

/** Does this landing's blast reach the hull? */
export function blastReaches(land: Vec2, poly: readonly Vec2[]): boolean {
  return polyInBlast(land, BLAST_U, poly);
}
