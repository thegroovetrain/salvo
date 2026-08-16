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
// THE `mineDamage` × `minePropFouling` PICK-ORDER BUG IS EATEN, NOT DODGED.
// The two cards compose differently depending on which is picked first (53 hp
// vs 45 hp for the same pair of cards), because prop-fouling's ×0.6 multiplies
// whatever damage is on the sheet when it lands. That is an UNRULED finding
// against the boon engine, not a bot problem, and Eric confirmed bots eat it
// exactly as human players do. There is deliberately NO special case here —
// no ordering preference, no lookahead, no "buy the multiplier last" rule. If
// you came here to fix it, fix it in the boon engine for everyone, with a
// ruling.

import { BOON_CATALOG, CONFIG, HEAL_CHOICE, type BoonCatalog, type BoonDef } from '@salvo/shared';
import type { BotProfile } from './profiles.js';
import type { BotProfileId } from './types.js';

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

/** Score for a line whose doctrine pair is already resolved — deliberately
 *  neither zero (the pick stays legal) nor competitive (it stops the
 *  ping-pong). Sits just under the lowest category base in the table. */
const RESOLVED_EXCLUSIVE_SCORE = 0.9;

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

/** The CONFIG weight table for a profile (category bases + line overrides). */
function weightTable(profile: BotProfileId): WeightTable {
  const t = CONFIG.bots.boonWeights[profile] as { cat: Record<string, number>; lines?: Record<string, number> };
  return { cat: t.cat, lines: t.lines ?? {} };
}

/** Catalog lookup, own-property only (the engine-wide fail-closed gate: a
 *  plain-object catalog answers `catalog['constructor']` otherwise). */
function defOf(catalog: BoonCatalog, id: string): BoonDef | null {
  if (!Object.hasOwn(catalog, id)) return null;
  return catalog[id] ?? null;
}

/** True when this bot has already resolved the doctrine pair this line
 *  belongs to — it holds the card, or it holds the rival. */
function pairResolved(def: BoonDef, fitted: readonly string[]): boolean {
  if (def.exclusiveWith === undefined) return false;
  return fitted.includes(def.id) || fitted.includes(def.exclusiveWith);
}

/**
 * How much this profile wants one offered line: the per-LINE override if the
 * table names it, else the per-CATEGORY base, else the unlisted default —
 * with a resolved doctrine pair demoted to neutral. Exported so tests (and a
 * future tuning tool) can read the policy without running a spend.
 */
export function boonWeightFor(
  profile: BotProfileId,
  id: string,
  fitted: readonly string[] = [],
  catalog: BoonCatalog = BOON_CATALOG,
): number {
  const def = defOf(catalog, id);
  if (def === null) return 0; // unknown id: never picked
  if (pairResolved(def, fitted)) return RESOLVED_EXCLUSIVE_SCORE;
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
 */
export function chooseSpend(
  profile: BotProfile,
  s: BotSpendState,
  catalog: BoonCatalog = BOON_CATALOG,
): number | null {
  if (s.bankedLevels <= 0) return null;
  if (s.maxHp > 0 && s.hp / s.maxHp < profile.healHpFrac) return HEAL_CHOICE;
  if (s.offer === null || s.offer.length === 0) return null;
  return bestOfferIndex(profile, s, catalog);
}
