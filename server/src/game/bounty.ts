// THE BOUNTY (Story 4.6, Eric ruling 2026-08-10) — the held-throne rule over
// captain-only kills. Pure logic, ZERO Colyseus imports (the spawn.ts /
// drones.ts posture): World feeds it a candidate snapshot and mirrors the
// answer; ArenaRoom publishes the one scalar. The server owns the answer even
// though the roster's public kill counts would let a client derive it — two
// independent derivations of one rule is exactly the desync class
// effectiveStats() exists to prevent, and the XP bonus must be authoritative.
//
// The rule, in full (all four clauses ratified 2026-08-10):
//   • STRICT OVERTAKE ONLY — a tie never transfers the throne, in either
//     direction: a vacant throne stays vacant while the top captain-kill
//     count is shared, and a held throne stays with the incumbent until
//     another alive captain STRICTLY exceeds their count. Tied challengers
//     above the incumbent transfer to nobody (no unique maximum).
//   • CAPTAIN KILLS ONLY — drone sinkings advance nobody (the Public
//     Register's "drones are not combatants" position).
//   • MINIMUM `CONFIG.bounty.minCaptainKills` — a zero-kill field has no
//     bounty.
//   • THE HOLDER MUST BE ALIVE — a sunk (or absent) holder vacates the
//     throne, and re-claiming it requires a fresh strict unique maximum
//     among alive captains.
//
// Evaluated once per sink, in sink order (and on ship removal, so the throne
// never names an absent player) — simultaneous challengers resolve
// sequentially, which is why the per-evaluation tie rule almost never fires
// in a live match but must still be exact.

import { CONFIG } from '@salvo/shared';

/** One ship's view into the throne rule — a plain snapshot, never a live
 *  ShipRecord (the module stays pure and trivially unit-testable). */
export interface BountyCandidate {
  id: string;
  alive: boolean;
  /** Drones can neither hold the throne nor count toward it — guarded here
   *  as well as at the increment site (defense in depth: a future combat-bot
   *  path that mis-credits a drone still cannot crown one). */
  isDrone: boolean;
  /** Human-captain victims only (ShipRecord.captainKills — never `kills`,
   *  which keeps counting drones for the roster tally). */
  captainKills: number;
}

/**
 * The next throne holder given the current one ('' = vacant) and the full
 * candidate field. Returns the holder's id, or '' when the throne is (or
 * stays) vacant.
 *
 * The incumbent competes as the FLOOR, not as a candidate: challengers must
 * strictly exceed the incumbent's count (or, on a vacant throne, reach
 * `minCaptainKills`), and among the challengers only a strict UNIQUE maximum
 * takes it — two challengers tied above the floor transfer to nobody, so a
 * held throne stays held and a vacant one stays vacant.
 */
export function nextBountyHolder(current: string, cands: readonly BountyCandidate[]): string {
  const held = cands.find((c) => c.id === current && c.alive && !c.isDrone);
  // FAIL-CLOSED on a non-finite incumbent count (defense in depth — unreachable
  // today, `captainKills` is only ever 0-initialized and `+= 1`, same posture
  // as `addXpMs` in world.ts): an unguarded NaN floor fails every `<=` skip
  // below, so a zero-kill challenger would wrongly clear it. Infinity instead
  // means nothing can ever displace a corrupt incumbent.
  const floor = held
    ? Number.isFinite(held.captainKills) ? held.captainKills : Number.POSITIVE_INFINITY
    : CONFIG.bounty.minCaptainKills - 1;
  const winner = uniqueChallengerAbove(floor, current, cands);
  if (winner !== null) return winner.id;
  return held ? current : '';
}

/** An alive non-drone challenger (the incumbent never challenges itself) with
 *  a FINITE count — fail-closed defense in depth: an unguarded NaN passes
 *  every `<= floor` skip below (NaN comparisons are always false), which
 *  would let a corrupt candidate become the running `best` and be crowned. */
function eligible(c: BountyCandidate, current: string): boolean {
  return c.alive && !c.isDrone && c.id !== current && Number.isFinite(c.captainKills);
}

/**
 * The strict UNIQUE maximum among eligible challengers strictly above
 * `floor`, or null when none exists — nobody cleared the floor, or the
 * maximum is shared (tied challengers claim for nobody).
 */
function uniqueChallengerAbove(floor: number, current: string, cands: readonly BountyCandidate[]): BountyCandidate | null {
  let best: BountyCandidate | null = null;
  let tiedAtBest = false;
  for (const c of cands) {
    if (!eligible(c, current) || c.captainKills <= floor) continue; // strict overtake only
    if (best === null || c.captainKills > best.captainKills) {
      best = c;
      tiedAtBest = false;
    } else if (c.captainKills === best.captainKills) {
      tiedAtBest = true; // shared maximum: nobody claims
    }
  }
  return tiedAtBest ? null : best;
}
