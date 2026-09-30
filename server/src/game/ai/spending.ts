// COMBAT-BOT CARD POLICY (Story 6.4 wave 2; re-cut for catalog v3 in Story
// 8.1; the pre-pool wish lists deleted in Story 8.20) — how a bot spends a
// banked level.
//
// PURE POLICY, ZERO AUTHORITY. Nothing here calls World. `chooseSpend()`
// returns a `spendChoice` — an offer index, or null for "not this tick" — and
// the driver is the only thing that turns that into the one
// `world.spendPoint(botId, choice)` call per bot per tick, through the same
// public entry point a human client's SpendMsg lands on. IT NEVER RETURNS A
// NEGATIVE: the reserved -1 heal sentinel left the wire in Story 8.8.
//
// THE HEAL IS NOT A SPEND (epic-8 amendments 46 + 49). Healing is a CARD a bot
// draws, stocks in its belt and FIRES — so `healHpFrac` gates the belt press
// in ai/equipment.ts, not this policy.
//
// THE SCORER (Story 8.20, Eric ruling 2026-09-30, R3): ONE build-aware points
// table, CONFIG.bots.cardPoints, flavored by each personality's build TASTE
// (ai/profiles.ts). Wave 1S authors it; until then the weighted path is a
// temporary stub (see `bestOfferIndex`).
//
// NO PICK-ORDER AWARENESS LIVES HERE, AND NONE SHOULD. This policy scores each
// offered card on its own merits and never reasons about the order cards are
// acquired in: a future order-dependence is fixed in the engine for everyone.

import { CATALOG, SLOT_COUNT, pickRefusal, type Catalog, type Rng, type SlotItemId } from '@salvo/shared';
import type { BotProfile } from './profiles.js';

/** Everything the policy needs about the bot's own economy — read by the
 *  driver off the bot's OWN ShipRecord (the sanctioned self-read: its bank,
 *  its front offer, its fitted cards, its hp). */
export interface BotSpendState {
  /** Unspent banked levels. */
  bankedLevels: number;
  /** The FRONT OFFER's card line ids, or null (nothing materialized). */
  offer: readonly string[] | null;
  /** Card line ids already fitted, in fit order (repeats = stacks). */
  cards: readonly string[];
  /**
   * The bot's NINE SLOT CONTENTS (`loadout.map(s => s.equipmentId)`) — the same
   * array the server's `pickRefusal` takes, read off the bot's own ShipRecord
   * by the driver like everything else here (ai/ never sees a World).
   *
   * WHY THE SCORER NEEDS IT (Story 8.14 review, F4): `spendCard` refuses a card
   * this hull cannot take, and the offer does NOT reroll on a refusal. A scorer
   * that keeps naming the same refused card therefore spends the same banked
   * level into a no-op every tick, forever. Defaulted so the many hand-built
   * test states keep compiling as "nothing fitted, every slot empty".
   */
  slotIds?: readonly (SlotItemId | null)[];
  hp: number;
  /**
   * The paid HULL REPAIR pool still draining in (`BotSelf.repairHp`) — hp
   * already bought. The scorer's HURT read is `(hp + repairHp) / maxHp <
   * profile.healHpFrac`, the heal tactic's own read (Story 8.20). OPTIONAL:
   * absent reads as 0, so hand-built test states keep compiling.
   */
  repairHp?: number;
  maxHp: number;
}

/**
 * THE OFFER INDICES THIS HULL CAN ACTUALLY TAKE (Story 8.14 review, F4) — the
 * cards `World.spendCard` would not refuse, through the one shared predicate
 * both sides run. Everything downstream of a spend decision picks from HERE.
 * An empty result means the whole hand is refused, and the right answer is the
 * human one (amendment 44): DO NOT SPEND — the level stays banked until firing
 * a consumable frees a slot.
 */
function spendableIndices(s: BotSpendState, catalog: Catalog): number[] {
  const offer = s.offer ?? [];
  const slotIds = s.slotIds ?? EMPTY_SLOTS;
  const out: number[] = [];
  for (let i = 0; i < offer.length; i += 1) {
    if (pickRefusal(s.cards, slotIds, offer[i], catalog) === null) out.push(i);
  }
  return out;
}

/** A hull whose slots the caller did not supply: every slot empty, which is
 *  what a bare `BotSpendState` in a test means. */
const EMPTY_SLOTS: readonly (SlotItemId | null)[] = Object.freeze(
  Array.from({ length: SLOT_COUNT }, () => null),
);

// WAVE 1S REPLACES THIS BODY
/** TEMPORARY STUB (Story 8.20 wave 0): the first SPENDABLE offer index, or
 *  null when every card in the hand is refused. Wave 1S replaces it with the
 *  CONFIG.bots.cardPoints scorer read against `profile.taste`. */
function bestOfferIndex(_profile: BotProfile, s: BotSpendState, catalog: Catalog, _rng?: Rng): number | null {
  const spendable = spendableIndices(s, catalog);
  return spendable.length === 0 ? null : spendable[0];
}

/**
 * THE SPEND DECISION: an offer index, or null for no spend this tick. NEVER
 * negative (Story 8.8: the reserved -1 heal sentinel is gone from the wire, and
 * World.spendPoint refuses every negative as malformed). Pure — no World, no
 * clock. The driver acts on it.
 *
 * `rng` is the mind's decorrelated spendRng. A `spend: 'random'` test
 * profile's uniform offer pick consumes it; a random profile handed no rng —
 * only reachable from a hand-built test call, never from the driver, which
 * always threads the mind's spendRng — falls through to the weighted path.
 */
export function chooseSpend(
  profile: BotProfile,
  s: BotSpendState,
  catalog: Catalog = CATALOG,
  rng?: Rng,
): number | null {
  if (s.bankedLevels <= 0) return null;
  if (s.offer === null || s.offer.length === 0) return null;
  if (profile.spend === 'random' && rng !== undefined) return randomSpendable(s, catalog, rng);
  return bestOfferIndex(profile, s, catalog, rng);
}

/** The `spend: 'random'` test profile's uniform pick, over the SPENDABLE cards
 *  only (review F4) — byte-identical to the old `rng.int(0, offer.length - 1)`
 *  whenever nothing in the hand is refused, which is every ordinary hand. */
function randomSpendable(s: BotSpendState, catalog: Catalog, rng: Rng): number | null {
  const spendable = spendableIndices(s, catalog);
  if (spendable.length === 0) return null;
  return spendable[rng.int(0, spendable.length - 1)];
}
