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
// NOTHING IS CARRIED ANY MORE (Story 8.10): the interim spawn-seed table is
// deleted and every hull spawns with the gun and the Shift boost only, so the
// server builds every pool with `carried = []` and the parameter survives for
// the day a hull sails with a weapon again. Today that leaves 27 drawable
// cards per hull (40 − 13 stub cards; pinned in deck.test.ts). It was 26 with
// the seed, and 23 until Story 8.8 flipped HULL REPAIR's three copies live.
//
// THE DRAW DOES NOT TAKE CARDS OUT (the lazy-draw bugfix): drawOffer only READS
// the pool — every drawn line stays in the deck, and exactly ONE card leaves it
// when a card is FITTED (consumeCard). Under this model no card can sit in an
// offer and in the deck at once (only the FRONT offer is ever materialized,
// server-side), so `cap` stays the exact stack cap with no scrub and no reroll.
// THE DECK HAS NO INFLOW AT ALL: cards only ever leave.
//
// THIS READ-ONLY DRAW *IS* "RESHUFFLE AFTER EVERY DRAW" (Eric ruling
// 2026-09-15, epic-8 amendment 13). Drawing "fairly from what is left in the
// deck" does NOT require the deck to run out before an unchosen card can come
// back: because the draw only reads, a line passed over at level 1 is back in
// the hat at FULL weight at level 2. There is no exhaust-then-reshuffle cycle
// to build, and no card is ever set aside.
//
// THE AT-CAP GUARD (Story 8.3): a line the SHIP already holds at its `cap` is
// dropped from the candidate set BEFORE any weighting — it is never offered and
// never costs an rng value. The caller names what the ship holds with
// `drawOffer(deck, rng, catalog, { held: ship.cards })`; omit it and the draw is
// byte-identical to one with no guard at all.
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
import { boonStackCount, CATALOG, type Catalog, type LineId } from './catalog.js';

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
 * Sizes for the three default decks as the server builds them TODAY (Story
 * 8.10 deleted the spawn seed, so `carried` is empty for every hull): 27 each.
 * With a seed of one equipment line it would be 26 — the parameter is kept
 * against the day a hull sails with a weapon again.
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
 * What the SHIP already holds, for the at-cap guard.
 *
 * `held` is the ship's FITTED card ids, ONE ENTRY PER COPY — the same shape as
 * `ShipRecord.cards`, so the server passes `{ held: ship.cards }` straight
 * through. Omitted (or empty) means "guard nothing".
 */
export interface DrawOpts {
  readonly held?: readonly LineId[];

  /**
   * THE LEVEL-ZERO USABLE-CARD GUARANTEE (Story 8.10, FR48) — and it is passed
   * at LEVEL ZERO ONLY, NEVER for a later level. The opening offer at the start
   * line is the captain's first weapon, so the first card must be something the
   * ship can actually USE: the draw picks card 0 uniformly over `usableLines`
   * (a consumable line, or an equipment line the ship holds no copy of) and
   * fills the rest by the ordinary copies-weight.
   *
   * VACUOUS, NEVER A REROLL: with no usable line in the pool (a ladders-only
   * deck) the draw is byte-identical to the plain one for the same rng state —
   * same offer, same stream position. The rng cost is exactly one `rng.next()`
   * per OFFERED line either way.
   */
  readonly guarantee?: boolean;
}

/**
 * The lines the ship is AT CAP on: `held` copies ≥ the line's `cap`. Computed
 * ONCE per draw and fed to `pickLine` as exclusions, so an at-cap line is gone
 * before any weighting — never offered, never worth an rng value.
 *
 * FAIL-CLOSED: an id the catalog does not know is ignored (lineCounts skips
 * it), never a throw. A line held BELOW its cap is not excluded — it still
 * draws at its copies-remaining weight like any other.
 */
function atCapLines(held: readonly LineId[], catalog: Catalog): Set<LineId> {
  const out = new Set<LineId>();
  for (const [id, n] of lineCounts(held, catalog)) {
    const line = catalog[id];
    if (line !== undefined && n >= line.cap) out.add(id);
  }
  return out;
}

/**
 * THE USABLE LINES of a deck: the distinct drawable lines, in CATALOG order,
 * that would give the ship something it can USE right now —
 *
 *   - every `consumable` line (a copy stocks a rack the ship can fire), and
 *   - every `equipment` line the ship holds NO copy of, whose next tier is
 *     therefore tier I: the bare weapon itself.
 *
 * An `equipment` line the ship already holds is excluded because its next copy
 * is a tier bump on a weapon already aboard, not a new verb; `ladder` and
 * `addon` lines are excluded because a stat step or a bolt-on verb is not
 * something a bare hull can put to sea with. A line the ship holds AT CAP is
 * never usable (it is not offerable at all).
 *
 * Pure and order-stable: the result is in CATALOG key order, so the same deck
 * and the same hold always give the same list — which is what makes the
 * uniform first pick of the guaranteed draw deterministic.
 */
export function usableLines(
  deck: DeckState,
  held: readonly LineId[],
  catalog: Catalog = CATALOG,
): LineId[] {
  const atCap = atCapLines(held, catalog);
  const out: LineId[] = [];
  for (const [id, count] of lineCounts(deck.cards, catalog)) {
    if (count <= 0 || atCap.has(id)) continue;
    const line = catalog[id];
    if (line === undefined) continue;
    const usable = line.kind === 'consumable'
      || (line.kind === 'equipment' && boonStackCount(held, id) === 0);
    if (usable) out.push(id);
  }
  return out;
}

/** The guaranteed FIRST card: one uniform pick over `usableLines`, costing
 *  exactly ONE rng.next(). Undefined — and NO rng value spent — when nothing is
 *  usable, which is what keeps the guarantee vacuous instead of a reroll. */
function pickUsable(
  deck: DeckState,
  held: readonly LineId[],
  catalog: Catalog,
  rng: Rng,
): LineId | undefined {
  const usable = usableLines(deck, held, catalog);
  if (usable.length === 0) return undefined;
  const i = Math.min(Math.floor(rng.next() * usable.length), usable.length - 1); // clamp: float dust
  return usable[i];
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
 *
 * THE AT-CAP GUARD: `opts.held` names the ship's fitted copies; a line it holds
 * at `cap` is excluded BEFORE weighting, so it never appears in an offer and
 * costs no rng value. `held` order does not matter. With `held` absent or empty
 * the draw is byte-identical to the unguarded one — same offer, same stream
 * position (exactly ONE rng.next() per OFFERED line, guard or no guard).
 *
 * THE LEVEL-ZERO GUARANTEE (Story 8.10): with `opts.guarantee`, card 0 is drawn
 * UNIFORMLY over `usableLines` (one rng.next()) and the remaining
 * `CONFIG.offer.size − 1` come from the ordinary copies-weight with that line
 * excluded like any drawn one. With nothing usable the guarantee does nothing
 * at all — same offer, same stream position as the plain draw. See DrawOpts.
 */
export function drawOffer(
  deck: DeckState,
  rng: Rng,
  catalog: Catalog = CATALOG,
  opts: DrawOpts = {},
): { deck: DeckState; offer: LineId[] } {
  const counts = lineCounts(deck.cards, catalog);
  const held = opts.held ?? [];
  const taken = atCapLines(held, catalog);
  const offer: LineId[] = [];
  const first = opts.guarantee === true ? pickUsable(deck, held, catalog, rng) : undefined;
  if (first !== undefined) {
    offer.push(first);
    taken.add(first);
  }
  for (let i = offer.length; i < CONFIG.offer.size; i += 1) {
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
