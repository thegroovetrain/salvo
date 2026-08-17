// THE SHIP-ROLE SEAM (Story 6.3, epic-6 amendment 13) — three readings of what
// used to be ONE boolean, `ShipRecord.isDrone`.
//
// That flag did three different jobs at once, and they were the same set only
// because every non-human hull in the game was a weaponless PvE fleet ship:
//
//   isHuman       — a REAL CONNECTED CAPTAIN. Gates `minHumans` / countdown
//                   arming, and the wire channels that need a socket at the
//                   other end. A bot must NEVER count here: FR34 forbids
//                   bot-fill in Standard, so "enough players to start" has to
//                   mean people.
//   isParticipant — CONTESTS THE MATCH OUTCOME. The win check, placements,
//                   results rows, the sinking-window hold, the bounty throne,
//                   the public register's combatant clause, the intel discs a
//                   fleet may not spawn inside.
//   isFleetHull   — WORLD CONTENT. The PvE economy (XP tier, pveKills tally),
//                   the boon deck, kill-feed suppression, fleet aggro,
//                   greyscale nameplates.
//
// They stopped being the same set the moment Story 6.4 landed AI CAPTAINS, who
// are participants and are not fleet hulls. The seam was built AHEAD of that
// consumer, on Eric's override of the orchestrator's recommendation to defer
// it (amendment 13): the value is that the readings were separated BEFORE they
// diverged, so 6.4 changed one definition rather than auditing sixty sites.
//
// HOW 6.4 EXTENDED THIS, in full: `'bot'` joined `ShipRole` and every predicate
// below was already correct — a bot is not a fleet hull, IS a participant, and
// is NOT a human. That is why `isParticipant` is written as `!== 'fleet'`
// rather than `=== 'captain'`; the negative form is the whole point of the
// module. Exactly as designed, adding the role changed NOTHING else in this
// file — the union widened and all three predicate bodies stand byte-identical.
//
// ZERO IMPORTS FROM world.ts — deliberately. The predicates take a minimal
// structural parameter (`RoleBearing`), not `ShipRecord`, so world.ts, match.ts,
// bounty.ts (whose BountyCandidate is a plain snapshot, never a live record)
// and the tests can all read them without a module cycle.

/**
 * What a hull IS, structurally. `'captain'` is a human player's ship;
 * `'fleet'` is a PvE fleet hull; `'bot'` (Story 6.4) is an AI CAPTAIN —
 * a participant that is not a fleet hull and never a human.
 */
export type ShipRole = 'captain' | 'fleet' | 'bot';

/** The minimal shape every predicate below reads. */
export interface RoleBearing {
  role: ShipRole;
}

/**
 * WORLD CONTENT: a PvE fleet hull. Keys the economy and presentation rules —
 * XP tier and the `pveKills` tally, the boon deck, kill-feed suppression,
 * fleet aggro, the greyscale nameplate. Never the match outcome.
 */
export function isFleetHull(s: RoleBearing): boolean {
  return s.role === 'fleet';
}

/**
 * CONTESTS THE MATCH OUTCOME: the win check, placements, results rows, the
 * sinking-window hold, the bounty throne, the public register's combatant
 * clause. Written as the NEGATION of `isFleetHull` on purpose — when 6.4 adds
 * `'bot'`, an AI captain must land on this side without an edit here.
 */
export function isParticipant(s: RoleBearing): boolean {
  return s.role !== 'fleet';
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
