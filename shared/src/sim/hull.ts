// THE HULL PREDICATES — plain arithmetic over (hp, maxHp) that BOTH sides and
// every heal channel must agree on, held here so they cannot drift apart.
// Pure and I/O-free like every shared/ sim module.

/**
 * IS THIS HULL FULL? — under 1 hp missing (epic-8 amendment 53, Eric ruling
 * 2026-09-17).
 *
 * "Full" cannot be `hp >= maxHp`. Storm bites and burn ticks land FRACTIONAL
 * damage (amendment 39 made WEAPON damage whole, and nothing else), and the
 * out-of-combat regen closes the MISSING amount geometrically — 1 % of it per
 * second — so it never reaches zero on its own. A hull therefore parks at
 * 349.x of 350 for minutes while the globe, which floors, reads 349.
 *
 * With an exact-max test, three things go wrong at once: a scarce HULL REPAIR
 * copy (100 hp of authored heal) can be spent for 0.4 hp, the regen never
 * closes the last fraction, and the client's pre-denial disagrees with the
 * server's refusal on the same hull. One predicate answers all three — the
 * consumable row refuses on it, the regen snaps to full on it, and the belt
 * pre-denial mirrors it.
 *
 * Deliberately NOT epsilon-tuned: 1 hp is the smallest amount of WEAPON damage
 * the game deals, so "less than a point missing" is the line a player can see.
 */
export function hullIsFull(hp: number, maxHp: number): boolean {
  return maxHp - hp < 1;
}
