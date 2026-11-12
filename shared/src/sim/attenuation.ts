// DECK-GUN BLOW ARITHMETIC (Story 9.12, Eric 2026-10-16, forge
// weapon-balance-math; epic-9 amendments 184–185). Pure, zero I/O, no
// transcendentals: two small functions the server's deck-gun blow sites
// compose as `settleBlow(damage × flakRimFactor(...))` before the one armor
// gate.
//
// - `flakRimFactor` — the flak burst's rim deals HALF the centre damage,
//   proportional by the caught hull's nearest outline point (replaces the
//   flat D − 10 of 2026-10-13).
// - `settleBlow` — the ONE floor to a whole number with a floor of 1 for a
//   positive blow (ruling 184(c)); a non-positive raw blow is no blow.
//
// RANGE ATTENUATION (`rangeAttenuation`, `GunAttenuationCfg`) — RETIRED
// 2026-11-12, Story 11.1 (Eric's lock 3 / #39; supersedes epic-9 amendment
// 187): damage is flat with range; a long shot is a gamble on where it lands
// (sim/dispersion.ts), never a weaker hit.
//
// Every function FAILS OPEN to "no change" on degenerate input and can never
// answer NaN or a factor above 1.

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
