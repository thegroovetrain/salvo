// THE DETERMINISTIC SPEND POLICY — a measurement instrument, NOT canon AI.
//
// WHY IT LIVES IN ITS OWN MODULE (cycle 110): it used to sit in `pilots.ts`
// beside the scripted captains, but its two consumers have different
// lifetimes. `--deck-only` builds NO World and NO Match at all (deckSim.ts is
// a pure deck-economy model), so the policy has to outlive the scripted
// captains that were retired with the omniscient pilots. Nothing here reads a
// World, a ship, or the clock — it is pure over (offer, rng, fitted).
//
// THE POLICY: whenever a level is banked, spend immediately on the front offer;
// with probability SPEND_TOP_P pick uniformly among the offer's HIGHEST-rarity
// lines (exclusive > rare > common — the "slight preference order"), otherwise
// uniformly among the whole offer. One refinement keeps the instrument honest:
// a line ALREADY FITTED on this ship is demoted to common preference, so an
// always-prefer-exclusive policy cannot fixate on a card it already holds.
// (Until Story 7-5 wave 2 this clause also covered a fitted doctrine RIVAL,
// because the swap returned the rival's card for a net-zero deck drain and the
// policy would ping-pong the pair forever. Exclusivity is deleted — R2.6 — so
// nothing returns to a deck and only the card's own copies matter.)
// This exercises the real spendPoint/settleSpend path (acquisition scrub)
// while keeping picks deterministic per stream.
//
// Determinism: the caller owns the mulberry32 stream. No Math.random, no
// Date.now, no ambient state.

import { BOON_CATALOG, type Rng } from '@salvo/shared';

/** Probability the spend policy takes the highest-rarity line (else uniform). */
export const SPEND_TOP_P = 0.75;

const RARITY_RANK: Record<string, number> = { common: 0, rare: 1, exclusive: 2 };

/** Preference rank of one offer line for `fitted` — the already-held demotion
 *  documented in the header. */
function preferenceRank(id: string, fitted: readonly string[]): number {
  const def = BOON_CATALOG[id];
  if (def === undefined) return 0;
  if (fitted.includes(id)) return 0;
  return RARITY_RANK[def.rarity] ?? 0;
}

/** The deterministic spend policy, shared by the scripted control AND the
 *  deck-only mode. `fitted` = the ship's currently-applied boon ids
 *  (ship.boons). */
export function pickSpendChoice(offer: readonly string[], rng: Rng, fitted: readonly string[]): number {
  const ranks = offer.map((id) => preferenceRank(id, fitted));
  const best = Math.max(...ranks);
  const top: number[] = [];
  for (let i = 0; i < offer.length; i += 1) if (ranks[i] === best) top.push(i);
  if (rng.next() < SPEND_TOP_P) return top[Math.floor(rng.next() * top.length)];
  return Math.floor(rng.next() * offer.length);
}
