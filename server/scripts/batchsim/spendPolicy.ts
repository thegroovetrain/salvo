// THE DETERMINISTIC SPEND POLICY — a measurement instrument, NOT canon AI.
//
// WHY IT LIVES IN ITS OWN MODULE (cycle 110): it used to sit in `pilots.ts`
// beside the scripted captains, and it outlived them. Nothing here reads a
// World, a ship, or the clock — it is pure over (offer, rng, fitted), which is
// what let it survive the retirement of the pilots and, in Story 8.14, of the
// deck-only mode that was its second consumer.
//
// THE POLICY: whenever a level is banked, spend immediately on the front offer;
// with probability SPEND_TOP_P pick uniformly among the offer's HIGHEST-RANKED
// lines, otherwise uniformly among the whole offer. One refinement keeps the
// instrument honest: a line ALREADY AT ITS CAP on this ship is demoted, so a
// preference policy cannot fixate on a card it can buy nothing more of.
//
// RARITY IS GONE (Story 8.1). Catalog v3 has no rarity tier, so the old
// "exclusive > rare > common" preference order has nothing to order by. The
// rank is now the card's KIND — the same four words the refit card shows —
// with a nature-changing ADD-ON ranked above a ladder rung and a new weapon
// above both, which reproduces the instrument's original intent (bias toward
// the transformative card) without inventing a balance number. Like the old
// rank, it is a MEASUREMENT INSTRUMENT and not canon: ai/spending.ts owns what
// bots actually want.
// This exercises the real spendPoint/settleSpend path while keeping picks
// deterministic per stream.
//
// Determinism: the caller owns the mulberry32 stream. No Math.random, no
// Date.now, no ambient state.

import {
  CATALOG,
  SLOT_COUNT,
  boonStackCount,
  pickRefusal,
  type LineKind,
  type Rng,
  type SlotItemId,
} from '@salvo/shared';

/** A hull nobody described: every slot empty. The nine-null array matters —
 *  `pickRefusal` is fail-closed on a SHORT array (a missing slot is never
 *  "empty"), so `[]` would refuse every weapon and every consumable. */
const EMPTY_SLOTS: readonly (SlotItemId | null)[] = Object.freeze(Array.from({ length: SLOT_COUNT }, () => null));

/** Probability the spend policy takes the top-ranked line (else uniform). */
export const SPEND_TOP_P = 0.75;

/** The instrument's preference order over catalog-v3 KINDS (see header). */
const KIND_RANK: Record<LineKind, number> = { consumable: 0, ladder: 1, addon: 2, equipment: 3 };

/** Preference rank of one offer line for `fitted` — the at-cap demotion
 *  documented in the header. */
function preferenceRank(id: string, fitted: readonly string[]): number {
  if (!Object.hasOwn(CATALOG, id)) return 0;
  const line = CATALOG[id];
  if (line === undefined) return 0;
  if (boonStackCount(fitted, id) >= line.cap) return 0;
  return KIND_RANK[line.kind] ?? 0;
}

/**
 * The deterministic spend policy used by the scripted control. `fitted` = the
 * ship's currently-fitted card line ids (ship.cards); `slotIds` = its nine slot
 * contents (`loadout.map(s => s.equipmentId)`).
 *
 * IT ONLY EVER NAMES A CARD THE SERVER WOULD ACCEPT (Story 8.14 review, F4).
 * `World.spendCard` refuses a card this hull cannot take and the offer does not
 * reroll, so an instrument that keeps naming a refused index measures a match
 * in which nobody ever spends again. Null means the whole hand is refused —
 * the caller holds the level, exactly as a human would.
 */
export function pickSpendChoice(
  offer: readonly string[],
  rng: Rng,
  fitted: readonly string[],
  slotIds: readonly (SlotItemId | null)[] = EMPTY_SLOTS,
): number | null {
  const legal: number[] = [];
  for (let i = 0; i < offer.length; i += 1) {
    if (pickRefusal(fitted, slotIds, offer[i]) === null) legal.push(i);
  }
  if (legal.length === 0) return null;
  const ranks = legal.map((i) => preferenceRank(offer[i], fitted));
  const best = Math.max(...ranks);
  const top = legal.filter((_, k) => ranks[k] === best);
  if (rng.next() < SPEND_TOP_P) return top[Math.floor(rng.next() * top.length)];
  return legal[Math.floor(rng.next() * legal.length)];
}
