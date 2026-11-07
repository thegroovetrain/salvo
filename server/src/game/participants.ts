// THE SHIP-ROLE SEAM (Story 6.3, epic-6 amendment 13) — the readings of what
// used to be ONE boolean, `ShipRecord.isDrone`.
//
//   isHuman       — a REAL CONNECTED CAPTAIN. Gates `minHumans` / countdown
//                   arming, and the wire channels that need a socket at the
//                   other end. A bot must NEVER count here: FR34 forbids
//                   bot-fill in Standard, so "enough players to start" has to
//                   mean people.
//   isParticipant — CONTESTS THE MATCH OUTCOME. The win check, placements,
//                   results rows, the sinking-window hold, the bounty throne,
//                   the public register's combatant clause.
//
// The third reading, `isFleetHull` (WORLD CONTENT — the PvE fleet's economy,
// aggro and presentation rules), RETIRED with the fleet at Story 10.8 (epic-10
// amendment 6(b)(1)): every hull in the game is now a captain or an AI captain,
// so every hull contests the outcome. `isParticipant` stays as the named
// reading its twelve call sites ask — "does this hull play the game" — rather
// than being inlined to `true` at each, so a future non-contesting role has
// one place to land.
//
// ZERO IMPORTS FROM world.ts — deliberately. The predicates take a minimal
// structural parameter (`RoleBearing`), not `ShipRecord`, so world.ts, match.ts,
// bounty.ts (whose BountyCandidate is a plain snapshot, never a live record)
// and the tests can all read them without a module cycle.

/**
 * What a hull IS, structurally. `'captain'` is a human player's ship; `'bot'`
 * (Story 6.4) is an AI CAPTAIN — a participant that is never a human.
 */
export type ShipRole = 'captain' | 'bot';

/** The minimal shape every predicate below reads. */
export interface RoleBearing {
  role: ShipRole;
}

/**
 * CONTESTS THE MATCH OUTCOME: the win check, placements, results rows, the
 * sinking-window hold, the bounty throne, the public register's combatant
 * clause. Exhaustive over `ShipRole` since Story 10.8 — a human captain and an
 * AI captain both play the game.
 */
export function isParticipant(s: RoleBearing): boolean {
  return s.role === 'captain' || s.role === 'bot';
}

/**
 * A REAL CONNECTED CAPTAIN — a person. Gates `minHumans`, countdown arming,
 * and the self-private wire channels that need a client to receive them. A bot
 * must never count here (FR34: zero bot-fill in Standard), which is why this is
 * the one predicate written as a positive `=== 'captain'`.
 */
export function isHuman(s: RoleBearing): boolean {
  return s.role === 'captain';
}
