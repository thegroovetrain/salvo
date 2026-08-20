// THE DECK MODEL (Story 2.8, amendment 38) — the pure per-player card-deck
// engine behind every offer. A player's deck = the UNIVERSAL lines (intel +
// ship + guns categories) + one SUBDECK per carried equipment (that
// equipment's category lines) + ONE acquisition card per NOT-carried
// acquirable equipment. Copies per catalog (`BoonDef.copies` — physical
// scarcity IS the cap). Each level draws up to CONFIG.offer.size DIFFERENT
// card LINES (weighted sampling without replacement at line level).
//
// THE DRAW DOES NOT TAKE CARDS OUT (the lazy-draw bugfix): drawOffer only
// READS the pool — every drawn line stays in the deck, and exactly ONE card
// leaves it when a card is FITTED (consumeCard). The old model removed all
// four at draw time and gave three back on the spend, which meant a level
// banked but not spent held four cards hostage indefinitely — at
// CONFIG.xp.levelMs levels arrive on a wall clock, so a banked queue drained
// its own deck until offers went short and then empty. Under the new model no
// card can sit in an offer and in the deck at once (only the FRONT offer is
// ever materialized, server-side), so `copies` stays the exact stack cap with
// no scrub and no reroll. THE DECK HAS NO INFLOW AT ALL since Story 7-5 wave 2:
// `returnCards` was the give-back for the doctrine SWAP-OUT, and the exclusivity
// mechanism that swapped died with the cannon pair (R2.6), so cards only ever
// leave. Every card in the catalog now stacks with every other.
// Rare/exclusive draw weight escalates with dry levels (CONFIG.deck —
// invisible soft pity), resetting whenever any rare/exclusive lands in a draw.
//
// Acquisitions (amendments 38/41): when one is picked the server calls
// consumeAcquisition (that equipment's subdeck joins the pool; EVERY remaining
// acquisition card purges — the R slot is permanent). Amendment 43's
// scrubAcquisitions is RETIRED: it existed to clean stale acquisition cards
// out of OTHER banked offers, and under the lazy-draw model there are none.
//
// Determinism: every function is pure over (state, rng, catalog) — same
// inputs, same outputs, zero I/O. The server drives it with a per-ship
// decorrelated mulberry32 stream; tests replay whole economies. Deck state is
// SERVER-PRIVATE: it never rides the wire (the offer ids do).

import { CONFIG } from '../constants.js';
import type { Rng } from '../math/rng.js';
import {
  BOON_CATALOG,
  EQUIPMENT_CATEGORY,
  UNIVERSAL_CATEGORIES,
  isAcquisitionDef,
  type BoonCatalog,
  type BoonDef,
  type BoonId,
} from './boons.js';
import type { EquipmentId } from './loadout.js';

/**
 * One player's deck: the multiset of card ids still in the pool (one entry per
 * physical copy) and the rare-escalation counter (levels since a rare/
 * exclusive last landed in a draw). Immutable — every op returns fresh state.
 */
export interface DeckState {
  readonly cards: readonly BoonId[];
  readonly levelsSinceRare: number;
}

/** The slotFill target of an acquisition def (undefined for non-acquisitions). */
function acquisitionTarget(def: BoonDef): EquipmentId | undefined {
  const fill = def.effects.find((e) => e.kind === 'slotFill');
  return fill?.kind === 'slotFill' ? fill.equipmentId : undefined;
}

/** `copies` entries of one line id. */
function copiesOf(def: BoonDef): BoonId[] {
  return new Array<BoonId>(Math.max(0, Math.floor(def.copies))).fill(def.id);
}

/**
 * Build the deck for a loadout: universal categories + carried-equipment
 * subdecks + one acquisition card per NOT-carried acquirable equipment.
 * Iterates the catalog in insertion order (deterministic composition). The
 * caller passes the CARRIED equipment ids (drones never get a deck — a server
 * rule; this function is loadout-driven and hull-agnostic).
 */
export function buildDeck(catalog: BoonCatalog, carriedEquipment: readonly EquipmentId[]): DeckState {
  const carried = new Set<EquipmentId>(carriedEquipment);
  const categories = new Set<string>(UNIVERSAL_CATEGORIES);
  for (const eq of carried) categories.add(EQUIPMENT_CATEGORY[eq]);
  const cards: BoonId[] = [];
  for (const key of Object.keys(catalog)) {
    const def = catalog[key];
    if (def === undefined) continue;
    const target = acquisitionTarget(def);
    if (target !== undefined) {
      // Acquisition card: only for equipment the hull does NOT carry — a
      // carried equipment's acquisition never enters the deck (so slotFill's
      // already-fitted no-op stays production-unreachable).
      if (!carried.has(target)) cards.push(...copiesOf(def));
    } else if (categories.has(def.category)) {
      cards.push(...copiesOf(def));
    }
  }
  return { cards, levelsSinceRare: 0 };
}

/** Per-card draw weight of a line (CONFIG.deck escalation for rare/exclusive;
 *  commons always 1). */
function perCardWeight(def: BoonDef, levelsSinceRare: number): number {
  if (def.rarity === 'common') return 1;
  return CONFIG.deck.rareWeightBase + levelsSinceRare * CONFIG.deck.rareWeightPerDryLevel;
}

/** The distinct lines of a card multiset, first-seen order, with copy counts.
 *  Junk ids (not in the catalog) are skipped — fail-closed, never drawable. */
function lineCounts(cards: readonly BoonId[], catalog: BoonCatalog): Map<BoonId, number> {
  const counts = new Map<BoonId, number>();
  for (const id of cards) {
    if (!Object.hasOwn(catalog, id)) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** One weighted line pick over `counts` (line weight = copies × perCard),
 *  excluding `excluded` ids. Returns the picked id or undefined (nothing
 *  drawable). Consumes one rng.next() when a pick happens. */
function pickLine(
  counts: ReadonlyMap<BoonId, number>,
  catalog: BoonCatalog,
  rng: Rng,
  levelsSinceRare: number,
  excluded: ReadonlySet<BoonId>,
): BoonId | undefined {
  const lines: { id: BoonId; weight: number }[] = [];
  let total = 0;
  for (const [id, count] of counts) {
    if (count <= 0 || excluded.has(id)) continue;
    const def = catalog[id];
    if (def === undefined) continue;
    const weight = count * perCardWeight(def, levelsSinceRare);
    if (weight <= 0) continue;
    lines.push({ id, weight });
    total += weight;
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
function removeCopies(cards: readonly BoonId[], picked: readonly BoonId[]): BoonId[] {
  const toRemove = new Map<BoonId, number>();
  for (const id of picked) toRemove.set(id, (toRemove.get(id) ?? 0) + 1);
  const out: BoonId[] = [];
  for (const id of cards) {
    const n = toRemove.get(id) ?? 0;
    if (n > 0) toRemove.set(id, n - 1);
    else out.push(id);
  }
  return out;
}

/** Pick up to `want` DIFFERENT lines (weighted, without replacement at line
 *  level). READ-ONLY over `cards` — nothing leaves the pool here. Never
 *  throws: a thin/empty pool picks fewer/zero. */
function drawLines(
  cards: readonly BoonId[],
  catalog: BoonCatalog,
  rng: Rng,
  want: number,
  levelsSinceRare: number,
): BoonId[] {
  const counts = lineCounts(cards, catalog);
  const taken = new Set<BoonId>();
  const picked: BoonId[] = [];
  for (let i = 0; i < want; i += 1) {
    const id = pickLine(counts, catalog, rng, levelsSinceRare, taken);
    if (id === undefined) break;
    picked.push(id);
    taken.add(id); // DIFFERENT lines per draw (duplicate auto-redraw, structurally)
  }
  return picked;
}

/**
 * Draw one level's offer: up to CONFIG.offer.size DIFFERENT card lines,
 * weighted at line level (weight = copiesInDeck × perCardWeight; common
 * per-card weight 1; rare/exclusive escalates with dry levels — CONFIG.deck).
 *
 * NON-CONSUMING: the drawn cards STAY in the pool — a draw is a read, and only
 * a FIT takes a card out (consumeCard). The returned deck differs from the
 * input in exactly one field: levelsSinceRare resets to 0 when any rare/
 * exclusive is drawn, else increments (the pity escalation still advances once
 * per draw). An empty (or thin) deck draws a short or empty offer — NEVER
 * throws (the server materializes no offer for an empty draw).
 */
export function drawOffer(
  deck: DeckState,
  rng: Rng,
  catalog: BoonCatalog = BOON_CATALOG,
): { deck: DeckState; offer: BoonId[] } {
  const picked = drawLines(deck.cards, catalog, rng, CONFIG.offer.size, deck.levelsSinceRare);
  const drewRare = picked.some((id) => catalog[id] !== undefined && catalog[id].rarity !== 'common');
  return {
    deck: { cards: deck.cards, levelsSinceRare: drewRare ? 0 : deck.levelsSinceRare + 1 },
    offer: picked,
  };
}

/**
 * Remove exactly ONE copy of a line from the deck — the FIT. This is the only
 * way a card leaves the pool in the normal economy (the draw no longer takes
 * any), so the deck thins by exactly the number of upgrades fitted and
 * `copies` stays the exact stack cap. An id with no copy left is a no-op (the
 * same state reference back) — fail-closed, never throws. levelsSinceRare
 * untouched: fitting is not a draw.
 */
export function consumeCard(deck: DeckState, id: BoonId): DeckState {
  const cards = removeCopies(deck.cards, [id]);
  if (cards.length === deck.cards.length) return deck;
  return { cards, levelsSinceRare: deck.levelsSinceRare };
}

/**
 * The R slot filled with `acquiredId` (amendment 38): shuffle that equipment's
 * subdeck lines into the pool (its category's non-acquisition lines, catalog
 * copies each — position is irrelevant to a weighted draw, so "shuffle in" is
 * an append) and PURGE every remaining acquisition card (the R slot is
 * permanent — no second acquisition can ever be drawn). levelsSinceRare
 * untouched.
 */
export function consumeAcquisition(deck: DeckState, catalog: BoonCatalog, acquiredId: EquipmentId): DeckState {
  const kept = deck.cards.filter((id) => {
    if (!Object.hasOwn(catalog, id)) return true; // junk: not an acquisition, keep (undrawable anyway)
    const def = catalog[id];
    return def === undefined || !isAcquisitionDef(def);
  });
  const category = EQUIPMENT_CATEGORY[acquiredId];
  const subdeck: BoonId[] = [];
  for (const key of Object.keys(catalog)) {
    const def = catalog[key];
    if (def === undefined || isAcquisitionDef(def)) continue;
    if (def.category === category) subdeck.push(...copiesOf(def));
  }
  return { cards: [...kept, ...subdeck], levelsSinceRare: deck.levelsSinceRare };
}

// scrubAcquisitions (amendment 43) was RETIRED by the lazy-draw bugfix: it
// cleaned dead acquisition cards out of OTHER banked offers, and only the
// FRONT offer is ever materialized now — there is no second offer to scrub, by
// construction. The next offer is simply drawn from the already-purged deck.
