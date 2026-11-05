// THE HULL PREDICATES — plain arithmetic over (hp, maxHp) that BOTH sides and
// every heal channel must agree on, held here so they cannot drift apart.
// Pure and I/O-free like every shared/ sim module.

/**
 * IS THIS HULL FULL? — under 1 hp missing (epic-8 amendment 53, Eric ruling
 * 2026-09-17).
 *
 * "Full" cannot be `hp >= maxHp`. Storm bites and burn ticks land FRACTIONAL
 * damage (amendment 39 made WEAPON damage whole, and nothing else), and a
 * missing-fraction heal (the out-of-combat regen — sim/regen.ts, back since
 * Story 10.5) closes the MISSING amount geometrically, so it never reaches
 * zero on its own. A hull therefore parks a fraction under
 * full for minutes while a floored readout says it is short.
 *
 * With an exact-max test, three things go wrong at once: a HULL REPAIR press
 * (a fifth of the hull of authored heal, and a 90 s cooldown) can be spent
 * for 0.4 hp, the trickle never closes the last fraction, and the client's
 * pre-denial disagrees with the server's refusal on the same hull. One
 * predicate answers all three — `repairRefusal` (sim/abilities.ts) refuses on
 * it on both sides and `regenGain` (sim/regen.ts) snaps to full on it.
 *
 * Deliberately NOT epsilon-tuned: 1 hp is the smallest amount of WEAPON damage
 * the game deals, so "less than a point missing" is the line a player can see.
 */
export function hullIsFull(hp: number, maxHp: number): boolean {
  return maxHp - hp < 1;
}
