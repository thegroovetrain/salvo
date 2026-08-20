// COMBAT-BOT BOON POLICY (Story 6.4, wave 2) — how a bot spends a banked
// level (Eric ruling D1: doctrine weights; D2: the heal rule).
//
// PURE POLICY, ZERO AUTHORITY. Nothing here calls World. `chooseSpend()`
// returns a `spendChoice` — an offer index, HEAL_CHOICE (-1), or null for "not
// this tick" — and the driver is the only thing that turns that into the one
// `world.spendPoint(botId, choice)` call per bot per tick, through the same
// public entry point a human client's SpendMsg lands on.
//
// THE SCORING, in order:
//   1. Nothing banked → null. No offer materialized → null (a degenerate
//      offer-less level still leaves the heal strip live, which is why the
//      heal test comes first).
//   2. hp/maxHp below the profile's healHpFrac → HEAL_CHOICE. A bot that
//      keeps buying cards while sinking is a bot that dies with a full hand.
//   3. Otherwise every offered line is scored by the PROFILE's weight table
//      (CONFIG.bots.boonWeights): the per-LINE override if the table names
//      that card, else the per-CATEGORY base, else a low default for anything
//      the table does not speak to. Rarity breaks a tie (rares and exclusives
//      are the nature-changers), then the lowest index — deterministic, no rng.
//
// EXCLUSIVE DEMOTION, and why it is not optional. A doctrine pair is
// swap-legal: taking ACOUSTIC HOMING while holding COMMAND DETONATION swaps
// the doctrine and returns the rival card to the deck, where it can be drawn
// again. A weight table that says "raider loves torpedoHoming" would therefore
// re-buy the same doctrine forever, ping-ponging every level the deck offers
// it. So a line whose pair is ALREADY RESOLVED (this bot holds this card, or
// holds its rival) drops to a neutral score — never zero, because taking it is
// still legal and still better than nothing when the rest of the hand is
// junk. Same shape as the batch-sim's `preferenceRank`, which is a
// MEASUREMENT INSTRUMENT and not canon — it is deliberately not imported.
//
// NO PICK-ORDER AWARENESS LIVES HERE, AND NONE SHOULD.
// This policy scores each offered card on its own merits and never reasons
// about the order cards are acquired in. That was a deliberate ruling when the
// `mineDamage` × `minePropFouling` pick-order bug was still open (the pair
// composed to 53 hp or 45 hp depending on which landed first): the finding was
// against the BOON ENGINE, not the bots, and Eric confirmed bots should eat it
// exactly as human players do rather than route around it.
//
// That bug is now FIXED UPSTREAM — amendment 25 deleted prop-fouling's damage
// multiplier, so one effect writes `mine.damage` and order cannot matter. The
// rule survives its occasion: if a future card reintroduces order-dependence,
// the fix belongs in the boon engine for everyone, with a ruling — not as a
// lookahead special case in here.

import { BOON_CATALOG, CONFIG, HEAL_CHOICE, type BoonCatalog, type BoonDef, type Rng } from '@salvo/shared';
import type { BotProfile } from './profiles.js';
import type { AnyProfileId } from './types.js';

/** Everything the policy needs about the bot's own economy — read by the
 *  driver off the bot's OWN ShipRecord (the sanctioned self-read: its bank,
 *  its front offer, its fitted boons, its hp). */
export interface BotSpendState {
  /** Unspent banked levels. */
  bankedLevels: number;
  /** The FRONT OFFER's boon ids, or null (nothing materialized). */
  offer: readonly string[] | null;
  /** Boon ids already fitted, in application order (repeats = stacks). */
  boons: readonly string[];
  hp: number;
  maxHp: number;
}

/** Score for a line this bot already holds a copy of — deliberately neither
 *  zero (the pick stays legal) nor competitive. Sits just under the lowest
 *  category base in the table. */
const HELD_LINE_SCORE = 0.9;

/** Score for a card in a category this profile's table says nothing about.
 *  Below every real weight, above a resolved exclusive is NOT the point — an
 *  unlisted category is simply not wanted. */
const UNLISTED_SCORE = 0.5;

/** Tiebreak only: at equal weight, prefer the scarcer, more transformative
 *  card. Never a term in the weight itself. */
const RARITY_RANK: Readonly<Record<string, number>> = { common: 0, rare: 1, exclusive: 2 };

/** One profile's two-level weight table, widened for lookup. */
interface WeightTable {
  cat: Readonly<Record<string, number>>;
  lines: Readonly<Record<string, number>>;
}

/** The empty table a profile OUTSIDE CONFIG.bots.boonWeights resolves to —
 *  test-only rows have no doctrine table (they spend at random and only reach
 *  the weighted scorer through a hand-built call), so every line scores at
 *  the unlisted default rather than crashing on a missing table. Unreachable
 *  for the six in-game ids, whose tables always exist. */
const EMPTY_TABLE: WeightTable = { cat: {}, lines: {} };

/** The CONFIG weight table for a profile (category bases + line overrides). */
function weightTable(profile: AnyProfileId): WeightTable {
  const tables = CONFIG.bots.boonWeights as Partial<
    Record<string, { cat: Record<string, number>; lines?: Record<string, number> }>
  >;
  const t = Object.hasOwn(tables, profile) ? tables[profile] : undefined;
  return t === undefined ? EMPTY_TABLE : { cat: t.cat, lines: t.lines ?? {} };
}

/** Catalog lookup, own-property only (the engine-wide fail-closed gate: a
 *  plain-object catalog answers `catalog['constructor']` otherwise). */
function defOf(catalog: BoonCatalog, id: string): BoonDef | null {
  if (!Object.hasOwn(catalog, id)) return null;
  return catalog[id] ?? null;
}

/** True when this bot already holds the ONE-COPY line this def names — a rare
 *  ×1 doctrine card it has fitted is worth nothing more to it.
 *
 *  EXCLUSIVITY IS DELETED (Story 7-5 wave 2, R2.6): this used to also demote a
 *  line whose `exclusiveWith` RIVAL was held, because the cannon's AP/PLUNGING
 *  pair could only ever resolve one way. Doctrine verbs now stack, so there is
 *  no rival to be pre-empted by — only the card's own copies matter, and the
 *  deck already stops re-offering an exhausted line.
 *
 *  THE `copies === 1` TEST IS THE FIX, NOT A NARROWING (cross-model review,
 *  cycle 110). This read `fitted.includes(def.id)` with no copy test, so it
 *  demoted EVERY held line — including the deliberately stackable ones. A
 *  `siege` bot that bought one `intelRange` scored the next at 0.9 instead of
 *  its profile's 2.4 and stopped building the stacked line its whole doctrine
 *  is about; the same held for `shipCooldown` (×5), `mineBlast` (×4) and
 *  every other ladder. The docstring above always said ONE-COPY; only the
 *  implementation disagreed. A multi-copy line needs no demotion at all — the
 *  deck stops offering it once its copies are spent. */
function alreadyHeld(def: BoonDef, fitted: readonly string[]): boolean {
  return def.copies === 1 && fitted.includes(def.id);
}

/**
 * How much this profile wants one offered line: the per-LINE override if the
 * table names it, else the per-CATEGORY base, else the unlisted default —
 * with an already-held one-copy line demoted to neutral. Exported so tests (and a
 * future tuning tool) can read the policy without running a spend.
 */
export function boonWeightFor(
  profile: AnyProfileId,
  id: string,
  fitted: readonly string[] = [],
  catalog: BoonCatalog = BOON_CATALOG,
): number {
  const def = defOf(catalog, id);
  if (def === null) return 0; // unknown id: never picked
  if (alreadyHeld(def, fitted)) return HELD_LINE_SCORE;
  const table = weightTable(profile);
  return table.lines[id] ?? table.cat[def.category] ?? UNLISTED_SCORE;
}

/** Rarity rank of a line (tiebreak only). */
function rarityOf(catalog: BoonCatalog, id: string): number {
  const def = defOf(catalog, id);
  return def === null ? -1 : (RARITY_RANK[def.rarity] ?? 0);
}

/** True when candidate `i` beats the incumbent on weight, then rarity. Index
 *  order settles a full tie by never displacing the incumbent. */
function beats(w: number, r: number, bestW: number, bestR: number): boolean {
  if (w !== bestW) return w > bestW;
  return r > bestR;
}

/** The best line in an offer under this profile's weights. Never returns -1
 *  for a non-empty offer: even an all-junk hand is spent, because a banked
 *  level held forever is a level wasted. */
function bestOfferIndex(profile: BotProfile, s: BotSpendState, catalog: BoonCatalog): number {
  const offer = s.offer ?? [];
  let bestI = 0;
  let bestW = -Infinity;
  let bestR = -1;
  for (let i = 0; i < offer.length; i += 1) {
    const w = boonWeightFor(profile.id, offer[i], s.boons, catalog);
    const r = rarityOf(catalog, offer[i]);
    if (beats(w, r, bestW, bestR)) {
      bestW = w;
      bestR = r;
      bestI = i;
    }
  }
  return bestI;
}

/**
 * THE SPEND DECISION: an offer index, HEAL_CHOICE, or null for no spend this
 * tick. Pure — no World, no clock, no rng. The driver acts on it.
 *
 * The heal test precedes the offer test deliberately: HEAL_CHOICE is spendable
 * with no materialized offer at all (World.spendPoint routes it before the
 * card path), so a hurt bot holding a degenerate offer-less level still gets
 * its damage control.
 *
 * `rng` (Story 7-6 wave 4) is consumed ONLY by a `spend: 'random'` test
 * profile's uniform offer pick — the WEIGHTED path never touches it (a
 * weighted spend with an rng in hand is byte-identical to one without), so
 * every in-game profile's spend stays pure and rng-free exactly as shipped.
 * The heal rule above fires BEFORE the mode fork in both modes (ruled: the
 * card pick alone is randomized). A random profile handed no rng — only
 * reachable from a hand-built test call, never from the driver, which always
 * threads the mind's spendRng — falls through to the weighted scorer rather
 * than inventing a fixed pick.
 */
export function chooseSpend(
  profile: BotProfile,
  s: BotSpendState,
  catalog: BoonCatalog = BOON_CATALOG,
  rng?: Rng,
): number | null {
  if (s.bankedLevels <= 0) return null;
  if (s.maxHp > 0 && s.hp / s.maxHp < profile.healHpFrac) return HEAL_CHOICE;
  if (s.offer === null || s.offer.length === 0) return null;
  if (profile.spend === 'random' && rng !== undefined) return rng.int(0, s.offer.length - 1);
  return bestOfferIndex(profile, s, catalog);
}
