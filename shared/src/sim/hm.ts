// THE HECTOMETER RULER (Story 11.2, ruling R1, Eric 2026-11-12) — the one
// ruler every reach is spoken in. The 10,000 u board is a real 44 km sea, so
// one hectometer (100 m) is 10,000 / 440 u ≈ 22.73 u. Pure functions over
// plain numbers: no I/O, no CONFIG read, no transcendentals.

/** u per hectometer: the 10,000 u board is 440 hm (a real 44 km). */
export const HM_U = 10000 / 440;

/** Hectometers → world units. */
export function hmToU(hm: number): number {
  return hm * HM_U;
}

/** World units → hectometers. */
export function uToHm(u: number): number {
  return u / HM_U;
}

/** A distance in u as whole hectometers ("400"); non-finite fails closed to "". */
export function formatHm(u: number): string {
  const hm = uToHm(u);
  if (!Number.isFinite(hm)) return '';
  // `+ 0` turns a rounded -0 into 0, so a tiny negative never prints "-0".
  return String(Math.round(hm) + 0);
}
