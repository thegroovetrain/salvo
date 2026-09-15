// CARD OFFERS — the wire-facing shape of the spend economy. Offers are DRAWN
// from the per-player deck (sim/deck.ts drawOffer: up to CONFIG.offer.size
// DIFFERENT card lines, weighted by the copies each line has left). Only the
// offer TYPE lives here: the FRONT level's drawn line ids, materialized once
// and held server-side (ShipRecord.offer) so reopening the refit window can
// NEVER reroll (FR19).

import type { LineId } from './catalog.js';

/** A materialized offer: the drawn card-line ids, in draw order. Length is
 *  `CONFIG.offer.size` against a healthy deck; shorter only when the deck ran
 *  thin (and an EMPTY draw materializes no offer at all — sim/deck.ts).
 *
 *  LINE IDS ARE THE ONLY IDS ON THE WIRE (Story 8.1). */
export type BoonOffer = readonly LineId[];
