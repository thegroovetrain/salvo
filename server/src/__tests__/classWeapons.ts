// Test-only fixture: FIT A HULL'S CLASS WEAPON (Story 8.10, FR48).
//
// Until Story 8.10 every captain spawned holding an interim seed of class
// weapon cards — a Torpedo Boat came up with its tubes loaded, a Battleship
// with its broadside and star shells, a Mine Layer with its rack — and dozens
// of fixtures across this suite were written against that. FR48 deleted the
// seed (epic-8 amendment 62): a hull now spawns with the GUN and the SHIFT
// BOOST only, and its first weapon arrives as a CARD from the level-zero offer
// the countdown grants.
//
// The behaviour those fixtures test (a torpedo's self-hit grace, the broadside
// arc, a mine's rear sector, the belt, the bot's weapon choice) is unchanged —
// only how the weapon got aboard is. So they fit it EXPLICITLY, here, through
// the same `applyCard` path a real pick takes. The fixture says out loud what
// the spawn used to say silently, and a suite that genuinely wants an EMPTY
// weapon row simply does not call this.
//
// NOT a copy of a shipped table: there is no spawn seed in the catalog any
// more. This is the fixtures' own statement of "the weapon this class's tests
// are about".

import type { ShipRecord, World } from '../game/world.js';

/** The weapon line(s) each hull's fixtures fit, in the order the deleted seed
 *  fitted them — so slot 2 (and, for the Battleship, slot 3) hold exactly what
 *  they held before Story 8.10. */
export const CLASS_WEAPONS: Record<string, readonly string[]> = {
  torpedoBoat: ['heavyTorpedo'],
  battleship: ['broadside', 'starShells'],
  mineLayer: ['navalMines'],
};

/**
 * Fit `rec`'s class weapon cards, first-empty-first, exactly as a pick would.
 * Only for Worlds whose catalog actually carries those lines (production, or
 * an injected catalog that imports them) — a suite running a content-free test
 * catalog wants the empty weapon row and never calls this.
 */
export function fitClassWeapons(w: World, rec: ShipRecord): void {
  for (const id of CLASS_WEAPONS[rec.hullId] ?? []) w.applyCard(rec, id);
}
