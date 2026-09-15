// THE DECK MODEL (Story 2.8, amendment 38; re-cut for catalog v3 in Story 8.1)
// — the pure per-player card-deck engine behind every offer.
//
// THE FROZEN LIST BECOMES THE DRAWABLE POOL HERE (Story 8.2). A captain's deck
// is a 40-card LIST frozen at the door (the hull's default deck until Epic 9
// — sim/catalog.ts DEFAULT_DECKS, checked by sim/deckRules.ts); `buildDeckState`
// turns that list into the server-private pool the offers draw from. Two
// things leave the pool on the way, and they are the only two:
//   - a STUB line — one whose mechanism is not built yet — is never dealt
//     (Eric ruling 2026-09-15, amendment 11: stubs stay in the frozen 40 so
//     the deck IS the real deck, but they never reach an offer until their
//     story flips the flag — no code change then). This is the single point
//     at which "authored but unbuilt" becomes "unofferable";
//   - a CARRIED line is dealt one copy short, because copy 1 of an equipment
//     line IS the bare weapon and a hull that spawns with that weapon is
//     already holding it. Dealing it anyway deals a card whose `slotFill`
//     no-ops against its own fitted weapon — a whole level spent on nothing.
// Today that leaves 23 drawable cards per hull (40 − 16 stub cards − 1
// carried copy; pinned in deck.test.ts).
//
// THE DRAW DOES NOT TAKE CARDS OUT (the lazy-draw bugfix): drawOffer only READS
// the pool — every drawn line stays in the deck, and exactly ONE card leaves it
// when a card is FITTED (consumeCard). Under this model no card can sit in an
// offer and in the deck at once (only the FRONT offer is ever materialized,
// server-side), so `cap` stays the exact stack cap with no scrub and no reroll.
// THE DECK HAS NO INFLOW AT ALL: cards only ever leave.
//
// WHAT CATALOG V3 DELETED HERE. Rarity, categories, the universal/subdeck walk,
// acquisition cards and `consumeAcquisition`, and the SOFT PITY escalation
// (`levelsSinceRare`, CONFIG.deck.rareWeight*) — v3 has no rarity tier to
// escalate. A line's draw weight is now simply THE COPIES IT HAS LEFT, so a
// thinning line fades out of offers by arithmetic rather than by a dial.
//
// Determinism: every function is pure over (state, rng, catalog) — same inputs,
// same outputs, zero I/O. The server drives it with a per-ship decorrelated
// mulberry32 stream; tests replay whole economies. Deck state is SERVER-PRIVATE:
// it never rides the wire (the offer ids do).

import { CONFIG } from '../constants.js';
import type { Rng } from '../math/rng.js';
import { CATALOG, type Catalog, type LineId } from './catalog.js';

/**
 * One player's deck: the multiset of card LINE ids still in the pool (one entry
 * per physical copy). Immutable — every op returns fresh state.
 */
export interface DeckState {
  readonly cards: readonly LineId[];
}

/**
 * Build a ship's DRAWABLE pool from its frozen deck list: `deckList` in list
 * order, MINUS every stub line, MINUS one copy of every id in `carried`.
 *
 * WHY `carried` (review gate, Story 8.1). Catalog v3's own semantics are that
 * COPY 1 OF AN EQUIPMENT LINE IS THE BARE WEAPON — so a hull that spawns with
 * a weapon already fitted is, by that reading, already HOLDING copy 1 of its
 * line. Dealing it that copy anyway deals a DEAD CARD: `slotFill` is a no-op
 * against equipment already fitted, so the pick spends a whole level and moves
 * nothing. The caller seeds `ship.cards` with the same ids, which is what makes
 * the next copy the line's tier II (a real −5 % reload step) rather than a
 * second wasted tier I.
 *
 * FAIL-CLOSED at every edge: a carried id the list holds no copy of (a stub,
 * a weapon the deck does not carry — the Battleship's `broadside` — or junk)
 * removes nothing; REPEATS in `carried` remove a copy each; an id the catalog
 * does not know is dropped (the door refused it already; nothing drawable may
 * ride on an unknown id). Never negative, never throws.
 *
 * Sizes for the three default decks with their spawn seeds: TB 23 (carried
 * `heavyTorpedo`), ML 23 (`navalMines`), BS 23 (`starShells`; `broadside` is
 * carried but not in the deck).
 */
export function buildDeckState(
  deckList: readonly LineId[],
  carried: readonly LineId[] = [],
  catalog: Catalog = CATALOG,
): DeckState {
  const held = new Map<string, number>();
  for (const id of carried) held.set(id, (held.get(id) ?? 0) + 1);
  const cards: LineId[] = [];
  for (const id of deckList) {
    if (!isDealable(id, catalog)) continue;
    const owed = held.get(id) ?? 0;
    if (owed > 0) held.set(id, owed - 1); // the hull already holds this copy
    else cards.push(id);
  }
  return { cards };
}

/** A known, NON-STUB line — the only kind a pool may hold. */
function isDealable(id: string, catalog: Catalog): boolean {
  if (!Object.hasOwn(catalog, id)) return false;
  const line = catalog[id];
  return line !== undefined && line.stub !== true;
}

/** The distinct lines of a card multiset, in CATALOG order, with copy counts.
 *  Junk ids (not in the catalog) are skipped — fail-closed, never drawable. */
function lineCounts(cards: readonly LineId[], catalog: Catalog): Map<LineId, number> {
  const raw = new Map<LineId, number>();
  for (const id of cards) {
    if (!Object.hasOwn(catalog, id)) continue;
    raw.set(id, (raw.get(id) ?? 0) + 1);
  }
  const counts = new Map<LineId, number>();
  for (const key of Object.keys(catalog)) {
    const n = raw.get(key as LineId);
    if (n !== undefined) counts.set(key as LineId, n);
  }
  return counts;
}

/** One weighted line pick over `counts` (weight = COPIES REMAINING — no rarity,
 *  no pity), excluding `excluded` ids. Returns the picked id or undefined
 *  (nothing drawable). Consumes one rng.next() when a pick happens. */
function pickLine(
  counts: ReadonlyMap<LineId, number>,
  rng: Rng,
  excluded: ReadonlySet<LineId>,
): LineId | undefined {
  const lines: { id: LineId; weight: number }[] = [];
  let total = 0;
  for (const [id, count] of counts) {
    if (count <= 0 || excluded.has(id)) continue;
    lines.push({ id, weight: count });
    total += count;
  }
  if (lines.length === 0) return undefined;
  let r = rng.next() * total;
  for (const line of lines) {
    r -= line.weight;
    if (r < 0) return line.id;
  }
  return lines[lines.length - 1].id; // float-dust fallback: the last candidate
}

/** Remove ONE copy of each named id from `cards`, preserving order. */
function removeCopies(cards: readonly LineId[], picked: readonly LineId[]): LineId[] {
  const toRemove = new Map<LineId, number>();
  for (const id of picked) toRemove.set(id, (toRemove.get(id) ?? 0) + 1);
  const out: LineId[] = [];
  for (const id of cards) {
    const n = toRemove.get(id) ?? 0;
    if (n > 0) toRemove.set(id, n - 1);
    else out.push(id);
  }
  return out;
}

/**
 * Draw one level's offer: up to CONFIG.offer.size DIFFERENT card lines,
 * weighted at line level by COPIES REMAINING IN THE DECK.
 *
 * NON-CONSUMING: the drawn cards STAY in the pool — a draw is a read, and only
 * a FIT takes a card out (consumeCard). The returned deck is the input state
 * unchanged (same reference); the pair shape survives because callers thread it.
 * An empty (or thin) deck draws a short or empty offer — NEVER throws (the
 * server materializes no offer for an empty draw). A STUB line can never be
 * offered, because `buildDeckState` never deals one.
 */
export function drawOffer(
  deck: DeckState,
  rng: Rng,
  catalog: Catalog = CATALOG,
): { deck: DeckState; offer: LineId[] } {
  const counts = lineCounts(deck.cards, catalog);
  const taken = new Set<LineId>();
  const offer: LineId[] = [];
  for (let i = 0; i < CONFIG.offer.size; i += 1) {
    const id = pickLine(counts, rng, taken);
    if (id === undefined) break;
    offer.push(id);
    taken.add(id); // DIFFERENT lines per draw (duplicate auto-redraw, structurally)
  }
  return { deck, offer };
}

/**
 * Remove exactly ONE copy of a line from the deck — the FIT. This is the only
 * way a card leaves the pool (the draw takes none), so the deck thins by exactly
 * the number of cards fitted and `cap` stays the exact stack cap. An id with no
 * copy left is a no-op (the same state reference back) — fail-closed, never
 * throws.
 */
export function consumeCard(deck: DeckState, id: LineId): DeckState {
  const cards = removeCopies(deck.cards, [id]);
  if (cards.length === deck.cards.length) return deck;
  return { cards };
}
