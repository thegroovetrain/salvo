// BOON OFFER rolls — the pure, deterministic core of the spend economy.
// A banked level carries a pre-rolled offer of CONFIG.offer.size boons from
// that many DISTINCT categories. rollBoonOffer is called at level-EARN time on
// the server's decorrelated upgrade stream and the result is queued
// (ShipRecord.offers), so reopening the refit window can NEVER reroll an offer.
// Style-matched to sim/stats.ts: no I/O, allocation-fresh, catalog-parameterized.
//
// Story 2.7 (amendment 35) re-typed the offer from legacy upgrade ids to BOON
// ids: the 14 legacy upgrades left the offer flow entirely (rollOffer /
// UpgradeOffer / OFFER_EXCLUDED_IDS / offerableIds / categoryOf are gone with
// it). UPGRADE_IDS / UPGRADE_CATEGORIES survive in constants.ts because the
// upgrade COUNTS array is still wire contract and effectiveStats still folds
// it; both die in 2.8's wholesale strip.

import { CONFIG } from '../constants.js';
import { BOON_CATALOG, type BoonCatalog, type BoonCategory, type BoonId } from './boons.js';
import type { Rng } from '../math/rng.js';

/** A pre-rolled offer: boon ids, one from each of N distinct categories.
 *  Length is `min(CONFIG.offer.size, distinct catalog categories)` — 4 against
 *  the production catalog, fewer only against a small injected test catalog. */
export type BoonOffer = readonly BoonId[];

/**
 * The catalog's categories in ITERATION (insertion) order, each with its member
 * ids in the same order. Deterministic by construction: `Object.keys` returns
 * own string keys in insertion order, so the same catalog always yields the
 * same category list and the same per-category member order — which is what
 * makes a seeded roll reproducible across processes.
 */
function categoryIndex(catalog: BoonCatalog): { cats: BoonCategory[]; members: Map<BoonCategory, BoonId[]> } {
  const cats: BoonCategory[] = [];
  const members = new Map<BoonCategory, BoonId[]>();
  for (const id of Object.keys(catalog)) {
    const def = catalog[id];
    if (def === undefined) continue; // defensive: a hole can never be offered
    const bucket = members.get(def.category);
    if (bucket === undefined) {
      cats.push(def.category);
      members.set(def.category, [id]);
    } else {
      bucket.push(id);
    }
  }
  return { cats, members };
}

/**
 * Roll one offer from `rng` against `catalog`. Picks `min(CONFIG.offer.size,
 * categoryCount)` DISTINCT categories via a partial Fisher–Yates prefix over a
 * copy of the category list (rng.int), then one uniform id within each chosen
 * category (rng.pick). Deterministic per rng state — the same stream position
 * always yields the same offer, which is what lets the server roll once at
 * earn-time and queue the result.
 *
 * NEVER THROWS (sim purity + fail-safe): an empty catalog rolls an empty offer,
 * and a catalog with fewer categories than `CONFIG.offer.size` rolls a shorter
 * one. The refit window renders exactly as many cards as the offer carries, so
 * a short offer degrades instead of crashing a live match.
 */
export function rollBoonOffer(rng: Rng, catalog: BoonCatalog = BOON_CATALOG): BoonOffer {
  const { cats, members } = categoryIndex(catalog);
  const n = Math.min(CONFIG.offer.size, cats.length);
  const picked: BoonId[] = [];
  for (let i = 0; i < n; i += 1) {
    const j = rng.int(i, cats.length - 1); // swap in a uniform pick from the unshuffled tail
    [cats[i], cats[j]] = [cats[j], cats[i]];
    picked.push(rng.pick(members.get(cats[i])!));
  }
  return picked;
}
