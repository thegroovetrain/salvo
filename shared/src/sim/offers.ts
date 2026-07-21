// Upgrade OFFER rolls — the pure, deterministic core of the spend economy.
// A banked point carries a pre-rolled offer of three upgrades from three
// DISTINCT categories. rollOffer is called at point-EARN time on the server's
// decorrelated upgrade stream and the result is queued (ShipRecord.offers), so
// reopening the spend window can NEVER reroll an offer. Style-matched to
// sim/stats.ts: no I/O, allocation-fresh, one build-once reverse map.

import {
  UPGRADE_CATEGORIES,
  UPGRADE_CATEGORY_IDS,
  type UpgradeCategoryId,
  type UpgradeId,
} from '../constants.js';
import type { Rng } from '../math/rng.js';

/** A pre-rolled offer: three upgrade ids, one from each of three distinct categories. */
export type UpgradeOffer = readonly [UpgradeId, UpgradeId, UpgradeId];

/**
 * Upgrade ids kept in UPGRADE_IDS for wire stability (the counts array is
 * append-only) but NEVER offered. Interregnum (Story 1.4): gunAmmo is
 * neutralized — the single-shot gun pins maxAmmo to 1 in effectiveStats — so
 * offering it would be a dead pick. The guns category therefore offers
 * gunRange + gunReload only. Dies with the legacy economy in Epic 2.
 */
export const OFFER_EXCLUDED_IDS: readonly UpgradeId[] = ['gunAmmo'];

/** The offerable ids of one category (UPGRADE_CATEGORIES minus exclusions), built once. */
const OFFERABLE: Readonly<Record<UpgradeCategoryId, readonly UpgradeId[]>> = (() => {
  const out = {} as Record<UpgradeCategoryId, readonly UpgradeId[]>;
  for (const cat of UPGRADE_CATEGORY_IDS) {
    out[cat] = UPGRADE_CATEGORIES[cat].filter((id) => !OFFER_EXCLUDED_IDS.includes(id));
  }
  return out;
})();

/** The offerable upgrade ids of a category (its members minus OFFER_EXCLUDED_IDS). */
export function offerableIds(cat: UpgradeCategoryId): readonly UpgradeId[] {
  return OFFERABLE[cat];
}

/**
 * Roll one offer from `rng`. Picks 3 DISTINCT categories via a partial
 * Fisher–Yates over a copy of UPGRADE_CATEGORY_IDS (rng.int), then one uniform
 * id within each category's OFFERABLE members (rng.pick). Deterministic per
 * rng state — the same stream position always yields the same offer, which is
 * what lets the server roll once at earn-time and queue the result.
 */
export function rollOffer(rng: Rng): UpgradeOffer {
  const cats = [...UPGRADE_CATEGORY_IDS];
  const picked: UpgradeId[] = [];
  for (let i = 0; i < 3; i += 1) {
    const j = rng.int(i, cats.length - 1); // swap in a uniform pick from the unshuffled tail
    [cats[i], cats[j]] = [cats[j], cats[i]];
    picked.push(rng.pick(OFFERABLE[cats[i]]));
  }
  return [picked[0], picked[1], picked[2]];
}

/** UpgradeId → its category (reverse of UPGRADE_CATEGORIES, built once). */
const CATEGORY_OF: Readonly<Record<UpgradeId, UpgradeCategoryId>> = (() => {
  const out = {} as Record<UpgradeId, UpgradeCategoryId>;
  for (const cat of UPGRADE_CATEGORY_IDS) {
    for (const id of UPGRADE_CATEGORIES[cat]) out[id] = cat;
  }
  return out;
})();

/** Which category an upgrade id belongs to (reverse lookup). */
export function categoryOf(id: UpgradeId): UpgradeCategoryId {
  return CATEGORY_OF[id];
}
