// CARD OFFERS — the wire-facing shape of the spend economy. Offers are DRAWN
// FROM THE COMMON POOL (sim/draw.ts drawOffer: up to CONFIG.offer.size
// DIFFERENT card lines, by the four-slot TYPE plan [ship, equipment, wildcard,
// wildcard] — Story 10.7, Eric 2026-11-06, epic-10 amendment 13; it retired
// the two-stage kind-then-line draw and the level-zero guarantee). Only the offer
// TYPE lives here: the FRONT level's drawn line ids, materialized once and held
// server-side (ShipRecord.offer) so reopening the refit window can NEVER reroll
// (FR19).
//
// AN OFFER NEVER SHOWS A LINE THE SHIP IS ALREADY AT CAP ON, nor a second kind
// of a filled family slot: the draw's eligibility law drops both before any
// slot is dealt, so a dead pick can never reach this shape. (The consumable
// exception of epic-8 amendment 94 — dealt even at cap, which made the offer
// never empty — left with the kit, 2026-11-05, Story 10.5: an offer may now be
// short, or empty once nothing is eligible. Since Story 10.7 (R5, Eric
// 2026-11-06) a level that meets an empty draw becomes a +1 bonus point on a
// random index instead, so an empty draw never sits banked.)
//
// THE DRAW IS STATELESS: there is no pool object to thin, so a line passed over
// at one level is back at full weight the next — that IS "reshuffle after every
// draw" (Eric ruling 2026-09-15, epic-8 amendment 13).

import type { LineId } from './catalog.js';

/** A materialized offer: the drawn card-line ids, in draw order. Length is
 *  `CONFIG.offer.size` while that many lines are eligible for the ship;
 *  shorter when fewer are, and empty when none is (sim/draw.ts).
 *
 *  LINE IDS ARE THE ONLY IDS ON THE WIRE (Story 8.1). */
export type BoonOffer = readonly LineId[];

/**
 * THE ONE LEGAL NEGATIVE ON THE SPEND CHANNEL: the countdown REDRAW.
 *
 * `SpendMsg.choice === MULLIGAN_CHOICE` asks the server to throw the FRONT
 * offer back and draw another one — THE ONE ASSERTED EXCEPTION to FR19's
 * "reopening the refit window can never reroll" (FR48, Eric ruling 2026-09-18,
 * epic-8 amendment 60). It is not a general reroll: the server honours it only
 * while the match is in COUNTDOWN, only for a captain that holds an offer, and
 * only ONCE per ship per match. Every other arrival — a second press, a press
 * after the water goes live, a bot, a hull with no offer — is a silent no-op
 * that leaves the offer byte-identical.
 *
 * WHY A NEGATIVE AT ALL. The negative sentinel channel was CLOSED at PV 53,
 * when the -1 DAMAGE CONTROL spend left the wire (epic-8 amendment 46 —
 * healing was the HULL REPAIR card then, the `C` ability since Story 10.5 — never a level spend), and -1 STAYS OUT: it is
 * simply malformed. -2 re-opens the channel for exactly this one value, so the
 * redraw needs no new message kind and no new field (PROTOCOL_VERSION 55).
 * Offer slots are 0..N-1, so no legal index can ever collide with it.
 */
export const MULLIGAN_CHOICE = -2 as const;
