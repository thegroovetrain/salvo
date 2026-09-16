// CARD OFFERS — the wire-facing shape of the spend economy. Offers are DRAWN
// from the per-player deck (sim/deck.ts drawOffer: up to CONFIG.offer.size
// DIFFERENT card lines, weighted by the copies each line has left). Only the
// offer TYPE lives here: the FRONT level's drawn line ids, materialized once
// and held server-side (ShipRecord.offer) so reopening the refit window can
// NEVER reroll (FR19).
//
// AN OFFER NEVER SHOWS A LINE THE SHIP IS ALREADY AT CAP ON (Story 8.3): the
// draw takes the ship's fitted cards as `opts.held` and drops any line held at
// its `cap` before weighting, so a dead pick can never reach this shape. And
// because the draw only READS the pool (sim/deck.ts), a line passed over at one
// level is back at full weight the next — that IS "reshuffle after every draw"
// (Eric ruling 2026-09-15, epic-8 amendment 13).

import type { LineId } from './catalog.js';

/** A materialized offer: the drawn card-line ids, in draw order. Length is
 *  `CONFIG.offer.size` against a healthy deck; shorter only when the deck ran
 *  thin (and an EMPTY draw materializes no offer at all — sim/deck.ts).
 *
 *  LINE IDS ARE THE ONLY IDS ON THE WIRE (Story 8.1). */
export type BoonOffer = readonly LineId[];
