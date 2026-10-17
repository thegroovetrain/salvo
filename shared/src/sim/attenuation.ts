// DECK-GUN BLOW ARITHMETIC (Story 9.12, Eric 2026-10-16, forge
// weapon-balance-math; epic-9 amendments 184–185). Pure, zero I/O, no
// transcendentals: three small functions the server's deck-gun blow sites
// compose as `settleBlow(damage × flakRimFactor(...) × rangeAttenuation(...))`
// before the one armor gate.
//
// - `rangeAttenuation` — Eric's forge lock: "full damage out to ~50 % of the
//   gun's range, then falls gradually to ~80 % at max range (reason: reward
//   moving in a bit)". Linear between the two, clamped beyond range. The
//   distance is the shell's launch point → impact (ruling 184(b)); the
//   reference is the firer's `rangeU` at fire time.
// - `flakRimFactor` — the flak burst's rim deals HALF the centre damage,
//   proportional by the caught hull's nearest outline point (replaces the
//   flat D − 10 of 2026-10-13).
// - `settleBlow` — the ONE floor to a whole number with a floor of 1 for a
//   positive blow (ruling 184(c)); a non-positive raw blow is no blow.
//
// Every function FAILS OPEN to "no change" on degenerate input (a 0 / NaN
// reference, a hostile dial) and can never answer NaN or a factor above 1.

/** The shape of `CONFIG.gunAttenuation`. */
export interface GunAttenuationCfg {
  /** Fraction of the reference range flown at full damage. */
  fullFrac: number;
  /** Damage factor at (and beyond) the reference range. */
  minFactor: number;
}

/** `x` clamped into [0, 1]; a non-finite `x` reads as `fallback`. */
function clamp01(x: number, fallback: number): number {
  if (!Number.isFinite(x)) return fallback;
  return Math.min(1, Math.max(0, x));
}

/** A positive finite number, or false. */
function positiveFinite(x: number): boolean {
  return Number.isFinite(x) && x > 0;
}

/**
 * The range-attenuation factor for a shell that flew `flownU` against the
 * firer's reference `rangeU`: 1 while `flownU / rangeU ≤ fullFrac`, linear to
 * `minFactor` at 1, `minFactor` beyond. Returns 1 for a non-finite or
 * non-positive `rangeU` or `flownU` (no reference = no attenuation). The
 * dials are sanitized here: `minFactor` into [0, 1] (non-finite → 1, i.e. no
 * attenuation) and `fullFrac` into [0, 1) (non-finite → 1, no attenuation
 * at any distance); a `fullFrac` of 1 or more is a STEP — 1 below range, `minFactor` at and after it.
 */
export function rangeAttenuation(flownU: number, rangeU: number, cfg: GunAttenuationCfg): number {
  if (!positiveFinite(rangeU) || !positiveFinite(flownU)) return 1;
  const rawFull = cfg.fullFrac;
  if (!Number.isFinite(rawFull)) return 1; // a hostile dial fails open: no attenuation
  const minFactor = clamp01(cfg.minFactor, 1);
  const r = flownU / rangeU;
  if (r >= 1) return minFactor;
  if (rawFull >= 1) return 1; // the bad-dial step: full damage all the way to range
  const fullFrac = Math.max(0, rawFull);
  if (r <= fullFrac) return 1;
  return 1 - ((1 - minFactor) * (r - fullFrac)) / (1 - fullFrac);
}

/**
 * The flak burst's rim falloff: `1 − rimFactor × clamp01(nearestU /
 * burstRadius)`, where `nearestU` is the distance from the burst centre to
 * the caught hull's NEAREST outline point (0 inside). A non-positive or
 * non-finite `burstRadius` → 1; `rimFactor` clamped to [0, 1] (non-finite →
 * 0, no falloff); a non-finite `nearestU` is treated as the rim.
 */
export function flakRimFactor(nearestU: number, burstRadius: number, rimFactor: number): number {
  if (!positiveFinite(burstRadius)) return 1;
  const rim = clamp01(rimFactor, 0);
  const frac = Number.isFinite(nearestU) ? clamp01(nearestU / burstRadius, 1) : 1;
  return 1 - rim * frac;
}

/** The float-dust epsilon of the one floor (`16 × 0.9` must floor to 14, not
 *  13 on a representation error). */
export const BLOW_FLOOR_EPS = 1e-9;

/**
 * The ONE floor of a deck-gun blow (ruling 184(c)): a non-finite or
 * non-positive `raw` is 0 (no blow); otherwise `max(1, floor(raw + ε))` — a
 * positive blow always deals at least one hit point.
 */
export function settleBlow(raw: number): number {
  if (!positiveFinite(raw)) return 0;
  return Math.max(1, Math.floor(raw + BLOW_FLOOR_EPS));
}
