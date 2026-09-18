// THE MATCH CONSUMABLE POOL (Story 8.11) — catalog-v3 R4/R44, FR43.
//
// WHAT THE POOL IS. Every match rolls ONE hidden list of `CONFIG.pool.size`
// (10) CONSUMABLE cards, and that same list is appended to every captain's and
// every bot's deck: 40 authored + 10 = 50 at the seat. It is the only thing in
// a match that the MATCH deals rather than the player — which is what lets a
// captain assume "there might be more heals and shields out there" without
// ever knowing how many of which. Each line is drawn at most its own catalog
// `cap` WITHIN the pool (R44), so no single line can fill it.
//
// ALL FIVE CONSUMABLE LINES ROLL, STUBS INCLUDED (Eric ruling 2026-09-18,
// epic-8 amendment 67). Four of the five (SHIELD BLOCK, SMOKE SCREEN, CHAFF,
// DECOY BUOY) are still `stub: true` until Stories 8.15/8.16; their pool copies
// join the deck and are never DEALT, exactly as amendment 11 ruled for the
// authored decks' stub cards. Nothing here filters them: `buildDeckState`'s
// existing `isDealable` is the single point at which "authored but unbuilt"
// becomes "unofferable", and the pool must not grow a second one. When a stub
// flag flips, the rest of the pool comes alive with no code change.
//
// HIDDEN MEANS HIDDEN (NFR20). The composition never rides a frame, never rides
// the welcome, never reaches the schema, `/metrics` or the results; the room
// logs `match.pool { count }` and nothing else. Only the SIZE is public (it
// rides inside the welcome's CONFIG snapshot like every other block).
//
// WHY THE ROLL IS HERE AND THE SEED IS NOT. The roll is pure and deterministic
// over (rng, catalog, cfg) like every other sim function, so both the server
// and the harness replay it exactly. The SEED is the ADAPTER's — `ArenaRoom`
// supplies room entropy, the harness derives it from the match seed — because
// `mapSeed` RIDES THE WELCOME: a pool derived from it would be brute-forceable
// by any client that can read its own map. That is the `zoneSeeds` /
// `pseudonymSeed` posture, unchanged.
//
// THE AT-CAP GUARD IS LIVE FROM THIS STORY ON. Until now every door-admitted
// deck held each line at or under its cap, so the guard in `drawOffer` was
// provably idle. With the pool appended a deck may hold authored + pool copies
// BEYOND a line's cap (HULL REPAIR 3 + 5 = 8 against a cap of 5). Every draw —
// server, harness and RL alike — must therefore pass `{ held }`.
//
// AND THOSE EXTRA COPIES ARE NOT DEAD — THEY ARE GATED BEHIND USE. The guard
// only refuses to OFFER a line the ship currently HOLDS at cap. A pool holds
// CONSUMABLES and nothing else, and a used consumable copy LEAVES the ship's
// cards (`World.spendStock`, Story 8.7), so the moment a captain fires one of
// five stocked HULL REPAIR the line reopens and the deck's remaining copies
// are drawable again. That is the mechanic the pool was bought for: extra
// supply behind the trigger — never an offer past the cap.

import { CONFIG } from '../constants.js';
import type { Rng } from '../math/rng.js';
import { CATALOG, LINE_IDS, type Catalog, type LineId } from './catalog.js';

/** The pool's one dial-shaped input: how many cards a match rolls.
 *  `CONFIG.pool` satisfies it; tests pass their own size. */
export interface PoolConfig {
  readonly size: number;
}

/**
 * The lines a pool may hold: every catalog line whose `kind` is `consumable`,
 * in `LINE_IDS` order (the determinism contract's one ordering — never
 * re-sorted, never catalog-key order by accident).
 *
 * STUB LINES ARE INCLUDED (amendment 67). This is deliberately NOT the set of
 * lines that can be DEALT; it is the set catalog v3 authored as consumables.
 * A catalog that knows none of the `LINE_IDS` — or none of them as consumables
 * — yields an empty list, and `rollMatchPool` then rolls an empty pool.
 */
export function consumableLines(catalog: Catalog = CATALOG): readonly LineId[] {
  const out: LineId[] = [];
  for (const id of LINE_IDS) {
    const line = Object.hasOwn(catalog, id) ? catalog[id] : undefined;
    if (line !== undefined && line.kind === 'consumable') out.push(id);
  }
  return out;
}

/**
 * ROLL ONE MATCH'S POOL: `cfg.size` consumable cards, each draw UNIFORM over
 * the consumable lines still under their own `cap` within the pool (R44).
 *
 * Cost: exactly ONE `rng.next()` per card in the result — the same clamped
 * uniform pick as `pickUsable` in sim/deck.ts (`Math.min(Math.floor(r * n),
 * n - 1)`, the float-dust clamp), so a replay of the stream lines up card for
 * card. The result is in DRAW ORDER, and stays that way: a deck is an
 * insertion-order multiset and nothing downstream sorts it.
 *
 * EARLY STOP, NEVER A THROW: when every consumable line has reached its cap the
 * roll stops and returns a SHORTER pool. With catalog v3 that is unreachable
 * (5 lines × cap 5 = 25 ≥ 10, pinned), but a hand-built catalog — one
 * consumable of cap 3 — rolls three cards and stops.
 *
 * NEVER AN EQUIPMENT, LADDER OR ADDON LINE, whatever the catalog says: the
 * candidate set is consumable-kind only, which is the structural half of "a
 * pool can never make a deck legal or illegal".
 */
export function rollMatchPool(
  rng: Rng,
  catalog: Catalog = CATALOG,
  cfg: PoolConfig = CONFIG.pool,
): readonly LineId[] {
  const lines = consumableLines(catalog);
  const caps = new Map<LineId, number>(lines.map((id) => [id, catalog[id].cap]));
  const taken = new Map<LineId, number>();
  const out: LineId[] = [];
  for (let i = 0; i < cfg.size; i += 1) {
    const candidates = lines.filter((id) => (taken.get(id) ?? 0) < (caps.get(id) ?? 0));
    if (candidates.length === 0) break; // every line at cap — a shorter pool, not a retry
    const k = Math.min(Math.floor(rng.next() * candidates.length), candidates.length - 1);
    const id = candidates[k];
    taken.set(id, (taken.get(id) ?? 0) + 1);
    out.push(id);
  }
  return Object.freeze(out);
}

/**
 * SANITIZE AN EXPLICIT POOL — the dev `poolOverride` and any injected test
 * fixture come through here. Keeps, IN THE GIVEN ORDER, only ids the catalog
 * knows AND whose kind is `consumable`; everything else (equipment, ladders,
 * add-ons, unknown junk) is dropped silently, exactly like every other
 * fail-closed id path.
 *
 * NO SIZE CLAMP AND NO DEDUPE: an override is a deliberate hand-built list, so
 * three HULL REPAIRs stay three HULL REPAIRs and a 30-card list stays 30. What
 * it CANNOT do is smuggle a non-consumable line into a deck — that is the
 * structural guarantee this function exists for.
 */
export function sanitizePool(ids: readonly string[], catalog: Catalog = CATALOG): readonly LineId[] {
  const out: LineId[] = [];
  for (const id of ids) {
    const line = Object.hasOwn(catalog, id) ? catalog[id] : undefined;
    if (line !== undefined && line.kind === 'consumable') out.push(id as LineId);
  }
  return Object.freeze(out);
}
