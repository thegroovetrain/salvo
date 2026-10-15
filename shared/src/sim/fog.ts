// FOG BANKS — the sight cost of haze (Story 9.10; Eric 2026-10-14, epic-9
// amendments 149–150, and 2026-10-15, amendments 162–168).
//
// This module is the ONE derivation of the fog sight cost. The server's
// perception (signals.ts sight sites, the 750 u flash/smoke halo, the PvE
// drones' `shipSees`) reads it; the perception invariant oracle deliberately
// re-derives it NUMERICALLY (segment sampling) rather than calling this closed
// form, so the two check each other. No other second derivation may exist.
//
// The rule in plain words: a ray from an observer to a point pays
// `sightCostPerU × density` extra units of distance for every unit of its
// length that lies inside a bank's CURRENT disc. A bank's radius and density
// both scale by `fogScale` — 0 → 1 over `growMs` from birth, 1 through the
// hold, 1 → 0 over the last `fadeMs` before `until` (amendment 165). Sight
// only: radar, zone circles, the foghorn and the storm never read this file.
//
// PURE, DETERMINISTIC, ZERO I/O, plain objects. NO TRANSCENDENTALS (the
// map-gen posture): `Math.sqrt` only — no hypot, trig, pow, exp/log, random,
// and no clock (time arrives as the `now` argument). A shared test guards the
// source text.

/**
 * One fog bank — the SERVER store record. Stationary for its whole life.
 * `R` is its FULL radius (u); `bornAt` / `until` are server-clock ms. Never
 * sent as-is: the wire shape is `FogBankView` (types.ts), which carries the
 * current radius and density only.
 */
export interface FogBankRecord {
  id: string;
  x: number; // u — bank centre
  y: number; // u
  R: number; // u — full radius (reached at the end of the grow ramp)
  bornAt: number; // ms — server time the bank was born
  until: number; // ms — server time the bank is gone
}

/** The slice of `CONFIG.fog` the math reads (CONFIG.fog fits). */
export interface FogConfig {
  sightCostPerU: number;
  growMs: number;
  fadeMs: number;
}

/** A linear ramp `elapsed / span`; a non-positive span reads 1 (no division by zero). */
function ramp(elapsed: number, span: number): number {
  return span > 0 ? elapsed / span : 1;
}

/**
 * The bank's life scale at `now`, in [0, 1]:
 * min(grow ramp (now − bornAt) / growMs, 1, fade ramp (until − now) / fadeMs).
 * Non-finite inputs read 0 (the bank is treated as absent).
 */
export function fogScale(bank: FogBankRecord, now: number, cfg: FogConfig): number {
  if (!allFinite([now, bank.bornAt, bank.until])) return 0;
  const s = Math.min(ramp(now - bank.bornAt, cfg.growMs), 1, ramp(bank.until - now, cfg.fadeMs));
  if (!Number.isFinite(s)) return 0;
  return s < 0 ? 0 : s;
}

/** The bank's CURRENT radius at `now`: R × fogScale (non-finite R reads 0). */
export function fogRadius(bank: FogBankRecord, now: number, cfg: FogConfig): number {
  if (!Number.isFinite(bank.R) || bank.R <= 0) return 0;
  return bank.R * fogScale(bank, now, cfg);
}

/** The bank's CURRENT density at `now`, in [0, 1] — equal to its scale (amendment 165). */
export function fogDensity(bank: FogBankRecord, now: number, cfg: FogConfig): number {
  return fogScale(bank, now, cfg);
}

function allFinite(xs: readonly number[]): boolean {
  for (const x of xs) if (!Number.isFinite(x)) return false;
  return true;
}

/** Clamp `v` into [0, hi]. */
function clamp0(v: number, hi: number): number {
  return v < 0 ? 0 : v > hi ? hi : v;
}

/**
 * Length of segment AB lying inside the disc (C, r). Projects C onto the
 * line, solves the two circle–line crossings, clamps each to the segment
 * (an endpoint inside the disc is handled by the clamp) and returns the gap
 * between them. r ≤ 0 or any non-finite input → 0; a zero-length segment → 0
 * (a point has no length, even inside the disc); a tangent → 0.
 */
export function segDiscChord(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, r: number,
): number {
  if (!allFinite([ax, ay, bx, by, cx, cy, r]) || r <= 0) return 0;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 0) return 0;
  const len = Math.sqrt(len2);
  const ex = cx - ax;
  const ey = cy - ay;
  const along = (ex * dx + ey * dy) / len; // u along AB from A to C's foot
  const perp2 = ex * ex + ey * ey - along * along; // squared distance C → line
  const half2 = r * r - perp2;
  if (half2 <= 0) return 0;
  const half = Math.sqrt(half2);
  const chord = clamp0(along + half, len) - clamp0(along - half, len);
  return chord > 0 ? chord : 0;
}

/**
 * The extra sight distance a ray A → B pays crossing the banks at `now`:
 * Σ chord(current disc) × density × sightCostPerU. Banks at scale 0 add
 * nothing. Always ≥ 0 and finite (a non-finite term is dropped).
 */
export function fogCostAlong(
  ax: number, ay: number, bx: number, by: number,
  banks: readonly FogBankRecord[], now: number, cfg: FogConfig,
): number {
  let cost = 0;
  for (const bank of banks) {
    const s = fogScale(bank, now, cfg);
    if (s <= 0) continue;
    const chord = segDiscChord(ax, ay, bx, by, bank.x, bank.y, fogRadius(bank, now, cfg));
    const term = chord * s * cfg.sightCostPerU;
    if (Number.isFinite(term) && term > 0) cost += term;
  }
  return cost;
}
