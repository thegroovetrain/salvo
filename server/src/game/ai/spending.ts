// COMBAT-BOT CARD POLICY — how a bot spends a banked level.
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
// in the HULL REPAIR tactic. The only thing this policy does with hp is WANT a HULL
// REPAIR card more while hurt (below).
//
// THE POINTS SCORER (Story 8.20, Eric ruling 2026-09-30, R3/R4). Every card
// in the hand that the hull can actually take (`pickRefusal`) gets a score
// from ONE table, CONFIG.bots.cardPoints, read against the bot's own build and
// its personality's build TASTE (ai/profiles.ts). Highest score wins.
//
//   - A NEW WEAPON (copy 1 of an equipment line, for an empty Q/E/R slot) is
//     worth `weapon`, or `favoriteWeapon` if it is one of the taste's
//     favorites. Nothing else is added to a weapon.
//   - AN UPGRADE (a ladder rung, or a tier copy of a weapon already held) is
//     `base`, + `favorite` if it matches a favorite upgrade, + `style` if it
//     is the build's lowest line (a `rounded` taste) or its highest (a
//     `specialist`). "The build" is every line the bot could still raise: the
//     ship ladders, the mounted gun's ladders and the weapons it holds, each
//     counted by copies held.
//   - A CONSUMABLE is `base`, + `favorite` if it is one, then + the taste's
//     belt hunger if the belt carries none of it, or + `carried` (a
//     negative) if it already does. HULL REPAIR while hurt and carrying none
//     is `base + hurtRepair` (+ `favorite`) with belt hunger NOT applied.
//
// THE ORDER THAT PRODUCES: a two-bonus upgrade and a needed repair (both 4 or
// more) beat any new weapon; a favorite weapon (3.75) beats any other weapon
// (3.5); a new weapon beats a one-bonus upgrade or consumable (3 or less); a
// plain card sits at 2 and a carried or unwanted consumable below it.
// Upgrades and consumables stand on equal footing (R4).
//
// TIES draw the mind's decorrelated spend stream (`mind.spendRng`): a uniform
// pick among the tied indices, ONE draw, and only when more than one index
// ties. No rng in hand (hand-built tests) takes the lowest tied index.
//
// NO PICK-ORDER AWARENESS LIVES HERE, AND NONE SHOULD. The scorer reads what
// the bot holds now, never the order it was acquired in: a future
// order-dependence is fixed in the engine for everyone.

import {
  CATALOG,
  CONFIG,
  CONSUMABLE_SLOTS,
  DEFAULT_GUN,
  MOUNTED_GUN,
  SLOT_COUNT,
  SLOT_GUN,
  boonStackCount,
  isConsumableId,
  ladderHost,
  pickRefusal,
  tierTargetOf,
  type Catalog,
  type CatalogLine,
  type EquipmentId,
  type Rng,
  type SlotItemId,
} from '@salvo/shared';
import type { BotProfile, BotTaste } from './profiles.js';

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
   * The scorer reads three things off it: which cards `spendCard` would refuse
   * (Story 8.14 review, F4 — the offer does NOT reroll on a refusal, so naming
   * a refused card would spend the same level into a no-op every tick), which
   * consumables the belt already carries, and the mounted gun (slot 0).
   * OPTIONAL: absent reads as "the cannon mounted, every other slot empty", so
   * the many hand-built test states keep compiling.
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

/** A hull whose slots the caller did not supply: every slot empty, which is
 *  what a bare `BotSpendState` in a test means. */
const EMPTY_SLOTS: readonly (SlotItemId | null)[] = Object.freeze(
  Array.from({ length: SLOT_COUNT }, () => null),
);

const POINTS = CONFIG.bots.cardPoints;

function slotIdsOf(s: BotSpendState): readonly (SlotItemId | null)[] {
  return s.slotIds ?? EMPTY_SLOTS;
}

/**
 * THE OFFER INDICES THIS HULL CAN ACTUALLY TAKE (Story 8.14 review, F4) — the
 * cards `World.spendCard` would not refuse, through the one shared predicate
 * both sides run. An empty result means the whole hand is refused, and the
 * right answer is the human one (amendment 44): DO NOT SPEND — the level stays
 * banked until firing a consumable frees a slot.
 */
function spendableIndices(s: BotSpendState, catalog: Catalog): number[] {
  const offer = s.offer ?? [];
  const slotIds = slotIdsOf(s);
  const out: number[] = [];
  for (let i = 0; i < offer.length; i += 1) {
    if (pickRefusal(s.cards, slotIds, offer[i], catalog) === null) out.push(i);
  }
  return out;
}

/** The equipment row slot 0 carries — the cannon's when the caller supplied
 *  no slots (or slot 0 holds nothing a gun ladder could name). */
function mountedGunOf(s: BotSpendState): EquipmentId {
  const g = s.slotIds?.[SLOT_GUN] ?? null;
  return g === null || isConsumableId(g) ? MOUNTED_GUN[DEFAULT_GUN] : g;
}

/** Does this line belong to the bot's UPGRADEABLE SET — a ship ladder, a
 *  ladder of the mounted gun, or a weapon already held? (Cap is checked by
 *  the caller.) */
function inUpgradeableSet(line: CatalogLine, copies: number, mounted: EquipmentId): boolean {
  if (line.kind === 'equipment') return copies > 0;
  if (line.kind !== 'ladder') return false;
  const host = ladderHost(line);
  return host === undefined || host === mounted;
}

/**
 * THE UPGRADEABLE SET `U` the style bonus reads (spec "Scorer definitions"):
 * the ship ladders, the mounted gun's ladder lines and every held equipment
 * line, each only while BELOW CAP, valued by copies held. Derived from the
 * catalog (a ladder with no host is a ship ladder), never a list of ids.
 */
function upgradeableSet(s: BotSpendState, catalog: Catalog): Map<string, number> {
  const mounted = mountedGunOf(s);
  const out = new Map<string, number>();
  for (const key of Object.keys(catalog)) {
    const line = catalog[key];
    if (line === undefined || line.stub === true) continue;
    const copies = boonStackCount(s.cards, key);
    if (copies < line.cap && inUpgradeableSet(line, copies, mounted)) out.set(key, copies);
  }
  return out;
}

/** Does this upgrade card earn the STYLE bonus — its line holds the build's
 *  lowest copy count (`rounded`) or highest (`specialist`)? */
function styleMatches(taste: BotTaste, s: BotSpendState, line: CatalogLine, catalog: Catalog): boolean {
  const set = upgradeableSet(s, catalog);
  const mine = set.get(line.id);
  if (mine === undefined) return false;
  const counts = [...set.values()];
  const target = taste.style === 'rounded' ? Math.min(...counts) : Math.max(...counts);
  return mine === target;
}

/** Does this upgrade card match one of the taste's favorite upgrades? A tier
 *  copy of a held weapon is `weapons`; a ladder with a host row is `gun`; a
 *  ship ladder is named by its own line id. */
function isFavoriteUpgrade(taste: BotTaste, line: CatalogLine): boolean {
  const favs: readonly string[] = taste.favoriteUpgrades;
  if (line.kind === 'equipment') return favs.includes('weapons');
  if (line.kind !== 'ladder') return false;
  return ladderHost(line) === undefined ? favs.includes(line.id) : favs.includes('gun');
}

function upgradeScore(taste: BotTaste, s: BotSpendState, line: CatalogLine, catalog: Catalog): number {
  const favorite = isFavoriteUpgrade(taste, line) ? POINTS.favorite : 0;
  const style = styleMatches(taste, s, line, catalog) ? POINTS.style : 0;
  return POINTS.base + favorite + style;
}

function weaponScore(taste: BotTaste, line: CatalogLine): number {
  const eq = tierTargetOf(line);
  return eq !== undefined && taste.favoriteWeapons.includes(eq) ? POINTS.favoriteWeapon : POINTS.weapon;
}

/** HURT — the heal tactic's own read, including the repair still draining in. */
function isHurt(profile: BotProfile, s: BotSpendState): boolean {
  return s.maxHp > 0 && (s.hp + (s.repairHp ?? 0)) / s.maxHp < profile.healHpFrac;
}

/** Does a BELT slot already carry this consumable? */
function carries(s: BotSpendState, id: string): boolean {
  const slotIds = slotIdsOf(s);
  return CONSUMABLE_SLOTS.some((i) => slotIds[i] === id);
}

function consumableScore(profile: BotProfile, s: BotSpendState, id: string): number {
  const favs: readonly string[] = profile.taste.favoriteConsumables;
  const favorite = favs.includes(id) ? POINTS.favorite : 0;
  const carried = carries(s, id);
  if (!carried && id === 'hullRepair' && isHurt(profile, s)) return POINTS.base + POINTS.hurtRepair + favorite;
  const belt = carried ? POINTS.carried : POINTS.beltHunger[profile.taste.beltHunger];
  return POINTS.base + favorite + belt;
}

/**
 * ONE CARD'S SCORE for this bot, or null when the hull cannot take it
 * (`pickRefusal` — unknown, stub, at cap, belt full, no weapon slot). Pure:
 * no rng, no clock. Exported so tests and tuning tools can read the policy
 * without running a spend.
 */
export function cardScore(
  profile: BotProfile,
  s: BotSpendState,
  lineId: string,
  catalog: Catalog = CATALOG,
): number | null {
  if (pickRefusal(s.cards, slotIdsOf(s), lineId, catalog) !== null) return null;
  const line = catalog[lineId];
  if (line === undefined) return null;
  if (line.kind === 'consumable') return consumableScore(profile, s, lineId);
  if (line.kind === 'equipment' && boonStackCount(s.cards, lineId) === 0) return weaponScore(profile.taste, line);
  return upgradeScore(profile.taste, s, line, catalog);
}

/** The max-scoring offer indices, in offer order (empty when all refused). */
function topIndices(profile: BotProfile, s: BotSpendState, catalog: Catalog): number[] {
  const offer = s.offer ?? [];
  let best = -Infinity;
  let ties: number[] = [];
  for (let i = 0; i < offer.length; i += 1) {
    const score = cardScore(profile, s, offer[i], catalog);
    if (score === null || score < best) continue;
    if (score > best) {
      best = score;
      ties = [];
    }
    ties.push(i);
  }
  return ties;
}

/** THE TIE-BREAK: one uniform draw among the tied indices, and only when
 *  there IS a tie and an rng; otherwise the lowest index. */
function breakTie(ties: readonly number[], rng?: Rng): number | null {
  if (ties.length === 0) return null;
  if (ties.length === 1 || rng === undefined) return ties[0];
  return ties[rng.int(0, ties.length - 1)];
}

/**
 * THE SPEND DECISION: an offer index, or null for no spend this tick. NEVER
 * negative (Story 8.8: the reserved -1 heal sentinel is gone from the wire, and
 * World.spendPoint refuses every negative as malformed). Pure — no World, no
 * clock. The driver acts on it.
 *
 * `rng` is the mind's decorrelated spendRng. The points scorer draws it only
 * to break a tie; a `spend: 'random'` test profile's uniform offer pick
 * consumes it; a random profile handed no rng — only reachable from a
 * hand-built test call, never from the driver, which always threads the
 * mind's spendRng — falls through to the scorer.
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
  return breakTie(topIndices(profile, s, catalog), rng);
}

/** The `spend: 'random'` test profile's uniform pick, over the SPENDABLE cards
 *  only (review F4) — byte-identical to the old `rng.int(0, offer.length - 1)`
 *  whenever nothing in the hand is refused, which is every ordinary hand. */
function randomSpendable(s: BotSpendState, catalog: Catalog, rng: Rng): number | null {
  const spendable = spendableIndices(s, catalog);
  if (spendable.length === 0) return null;
  return spendable[rng.int(0, spendable.length - 1)];
}
