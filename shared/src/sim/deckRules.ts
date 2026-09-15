// DECK LEGALITY (Story 8.2, AR52 / epic-8 "Deck rules") — the ONE pure
// function that says whether a 40-card list is a legal deck.
//
// EXACTLY FOUR RULES AND NOTHING ELSE. Two composition rules — the card count
// and the equipment-line cap — plus two ownership bounds — every line owned,
// no line over its catalog cap. There is deliberately NO heal requirement, NO
// ladder requirement and NO hull lock (a deck belongs to a hull as a LABEL,
// never a lock; the catalog is hull-agnostic): a pure-gunboat deck and a
// zero-heal deck are both legal, and the harness's PACIFIST deck (zero
// equipment lines) is legal too.
//
// THE RULE ORDER IS PART OF THE CONTRACT: `size`, then `equipmentLines`, then
// `unowned`, then `overCap`. The first failing rule is the one reported, so a
// refusal reason is stable for a given deck — the door logs it and Epic 9's
// Ship & Deck screen will render it — and a test can pin one rule at a time
// without the others masking it.
//
// PURE AND DETERMINISTIC over (cards, owned, catalog): no logging, no I/O, no
// clock. The server runs it ONCE, at the door (server/src/game/decks.ts is the
// loader; the two rooms are the doors); the client will run the same function
// for the pre-queue gate in Epic 9. Both sides import this file, so the
// verdict can never fork.
//
// Sits BELOW catalog.ts (imports it, is never imported by it): the default
// decks are validated against these rules at module load from the foot of THIS
// file, which keeps the import graph acyclic while still failing the first
// import on either side if an authored default is ever illegal.

import { CONFIG } from '../constants.js';
import { CATALOG, DEFAULT_DECKS, DEFAULT_OWNED, type Catalog } from './catalog.js';

/** The four deck rules, in the order they are checked. */
export type DeckRule = 'size' | 'equipmentLines' | 'unowned' | 'overCap';

/** A legality verdict: legal, or the FIRST rule the deck breaks. */
export type DeckCheck = { ok: true } | { ok: false; rule: DeckRule };

/** The shared "legal" verdict — one frozen identity, allocation-free. */
const LEGAL: DeckCheck = Object.freeze({ ok: true });

/** Copies per id, in first-seen order. Junk ids are counted too — they are
 *  what the `unowned` rule refuses. */
function copiesById(cards: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of cards) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

/**
 * The number of DISTINCT `equipment` lines in a card list — the lines whose
 * copy 1 is a `slotFill` (the bare weapon). Add-ons, ladders and consumables
 * never count, and an id the catalog does not know never counts either (the
 * `unowned` rule catches it; this one has nothing to say about it).
 */
export function equipmentLineCount(cards: readonly string[], catalog: Catalog = CATALOG): number {
  const seen = new Set<string>();
  for (const id of cards) {
    if (!Object.hasOwn(catalog, id)) continue;
    if (catalog[id]?.kind === 'equipment') seen.add(id);
  }
  return seen.size;
}

/**
 * Is `cards` a legal deck for a player who owns `owned`?
 *
 *   - `size`           — `cards.length !== CONFIG.deck.size` (40).
 *   - `equipmentLines` — more than CONFIG.deck.maxEquipmentLines (3) distinct
 *                        lines of kind `equipment`.
 *   - `unowned`        — any id not in `owned`. An id the catalog does not
 *                        know is unowned by definition, whatever `owned` says:
 *                        a junk id can never be legal.
 *   - `overCap`        — more copies of a line than its catalog `cap`.
 *
 * Checked in that order; the first failure is reported. Nothing else is a
 * rule (see the file header).
 */
export function checkDeck(
  cards: readonly string[],
  owned: ReadonlySet<string>,
  catalog: Catalog = CATALOG,
): DeckCheck {
  if (cards.length !== CONFIG.deck.size) return { ok: false, rule: 'size' };
  if (equipmentLineCount(cards, catalog) > CONFIG.deck.maxEquipmentLines) {
    return { ok: false, rule: 'equipmentLines' };
  }
  const copies = copiesById(cards);
  if (!everyLineOwned(copies, owned, catalog)) return { ok: false, rule: 'unowned' };
  if (!everyLineUnderCap(copies, catalog)) return { ok: false, rule: 'overCap' };
  return LEGAL;
}

/** The `unowned` rule: every id known to the catalog AND in `owned`. */
function everyLineOwned(copies: ReadonlyMap<string, number>, owned: ReadonlySet<string>, catalog: Catalog): boolean {
  for (const id of copies.keys()) {
    if (!Object.hasOwn(catalog, id) || !owned.has(id)) return false;
  }
  return true;
}

/** The `overCap` rule: no line held above its catalog cap. */
function everyLineUnderCap(copies: ReadonlyMap<string, number>, catalog: Catalog): boolean {
  for (const [id, n] of copies) {
    if (n > (catalog[id]?.cap ?? 0)) return false;
  }
  return true;
}

/**
 * THE DEFAULT DECKS ARE LEGAL, CHECKED AT LOAD (the catalog.ts
 * `validateCatalog` posture): an authored default that breaks a rule throws on
 * the first import of the shared barrel, on BOTH sides, rather than surfacing
 * as a refused join for every captain of that hull. catalog.ts already refuses
 * a count over cap and a sum other than 40 inside `deckFromCounts`; this is the
 * full four-rule check against a fresh account's unlocks. Pinned again in
 * deckRules.test.ts.
 */
for (const [hull, deck] of Object.entries(DEFAULT_DECKS)) {
  const verdict = checkDeck(deck, DEFAULT_OWNED);
  if (!verdict.ok) throw new Error(`DEFAULT_DECKS.${hull} is illegal: ${verdict.rule}`);
}
