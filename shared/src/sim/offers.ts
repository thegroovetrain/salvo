// BOON OFFERS — the wire-facing shape of the spend economy. Story 2.8 (THE
// DECK MODEL, amendment 38) replaced the category-first roll wholesale:
// `rollBoonOffer` and its catalog-insertion-order category machinery died —
// offers are now DRAWN from the per-player deck (sim/deck.ts drawOffer:
// up to CONFIG.offer.size DIFFERENT card lines, weighted by rarity with the
// escalating rare weight). Only the offer TYPE survives here: a banked level's
// pre-drawn card ids, queued server-side (ShipRecord.offers) so reopening the
// refit window can NEVER reroll (FR19).

import type { BoonId } from './boons.js';

/** A banked offer: the drawn card-line ids, in draw order. Length is
 *  `CONFIG.offer.size` against a healthy deck; shorter only when the deck ran
 *  thin (and an EMPTY draw banks no offer at all — sim/deck.ts). */
export type BoonOffer = readonly BoonId[];
