// THE HULL AS A PERCENT (Story 10.3, Eric's ruling 13, 2026-11-04). Every hull
// is 1000 hp on the wire and NOBODY ever sees a raw figure out of it, theirs or
// anyone's: the client prints a whole-number percent. One pure law, shared by
// the HP globe's readout (render/hpGlobe.ts) and the card rows that speak of
// hull (ui/boonCopy.ts — HULL REPAIR's heal, SHIELD BLOCK's absorb), so the
// two can never round the same hull differently.

/**
 * `ceil(100 × hp / maxHp)`, floored at 1 while any hull remains, 0 only when
 * sunk — "Percent is the CEILING — an afloat hull never reads 0 %" (7 hp of
 * 1000 reads 1, 995 reads 100). Fed `hp + shield` it may pass 100 (the
 * shielded readout, amendment 116 in percent). A malformed max or hp (≤ 0,
 * non-finite) reads 0 rather than Infinity / NaN.
 */
export function hullPercent(hp: number, maxHp: number): number {
  if (!(hp > 0) || !(maxHp > 0) || !Number.isFinite(hp) || !Number.isFinite(maxHp)) return 0;
  return Math.max(1, Math.ceil((100 * hp) / maxHp));
}
