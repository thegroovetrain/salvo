// COMBAT-BOT CARD POLICY (Story 6.4 wave 2; re-cut for catalog v3 in Story
// 8.1) — how a bot spends a banked level (Eric ruling D1: doctrine weights;
// D2: the heal rule).
//
// PURE POLICY, ZERO AUTHORITY. Nothing here calls World. `chooseSpend()`
// returns a `spendChoice` — an offer index, or null for "not this tick" — and
// the driver is the only thing that turns that into the one
// `world.spendPoint(botId, choice)` call per bot per tick, through the same
// public entry point a human client's SpendMsg lands on. IT NEVER RETURNS A
// NEGATIVE: the reserved -1 heal sentinel left the wire in Story 8.8.
//
// THE HEAL IS NOT A SPEND ANY MORE (epic-8 amendments 46 + 49). Healing is a
// CARD a bot draws, stocks in its belt and FIRES — so `healHpFrac` now gates
// the belt press in ai/equipment.ts (CONSUMABLE_TACTICS), not this policy. A
// hurt bot still scores a HULL REPAIR card at the ordinary consumable kind
// base, deliberately: Story 8.18 owns retuning the scorer.
//
// THE SCORING, in order:
//   1. Nothing banked → null. No offer materialized → null (a degenerate
//      offer-less level has nothing to buy at all now).
//   2. Every offered LINE is scored: the profile's re-keyed per-line
//      override if it names that line, else its re-keyed category base, else
//      the line's KIND base, else a low default. Ties break on offer index —
//      deterministic, no rng (a `spend: 'random'` test profile is the only
//      path that touches the rng at all).
//
// WHAT CATALOG V3 DELETED HERE (Story 8.1). RARITY is gone as a concept, so
// the rarity tiebreak went with it; ACQUISITION cards are gone, so the
// "already-resolved exclusive" demotion has nothing left to demote; and the
// old `copies === 1` held-line test is replaced by the only thing that is
// true of every v3 line — AT CAP: a bot that holds `CATALOG[id].cap` copies
// of a line can buy nothing more from it, whatever its cap happens to be.
//
// THE V2 → V3 REMAP, AND WHY IT LIVES HERE. `CONFIG.bots.boonWeights` is
// authored in the v2 vocabulary (nine CATEGORY bases + v2 LINE overrides).
// Catalog v3 deleted both vocabularies, and the weight tables are a BOT TUNE,
// not a card fact — retuning them is a balance pass with its own ruling, not
// a side effect of the model swap (deferred-work already carries the bot
// retune). So this module translates the shipped table onto the 29 v3 lines
// and changes NO number:
//
//   CATEGORY   → v3 lines
//   ship       → armor, speed, turning, reload
//   guns       → deckGun, deckGunTurret, deckGunBarrel
//   torpedoes  → lightTorpedo, heavyTorpedo
//   mines      → navalMines, captiveMines, foulingMines
//   broadside  → broadside
//   starShells → starShells, dazzleShells, phosphorShells
//   intel      → radarSweep
//   radarBuoy  → decoyBuoy            (R1: the buoy becomes the consumable)
//   boost      → (nothing — Story 8.9 makes the boost a universal ability,
//                 so no v3 card addresses it and the base is simply unused)
//
//   LINE OVERRIDE                     → v3 line
//   shipHull → armor · shipSpeed → speed · shipCooldown → reload
//   intelSweep → radarSweep
//   gunBarrel → deckGunBarrel · gunTurret → deckGunTurret
//   torpedoTube, torpedoSpeed, acquireTorpedo → heavyTorpedo
//   mineBlast, acquireMine → navalMines · mineCaptive → captiveMines
//   broadsideTurrets, broadsideSpread, acquireBroadside → broadside
//   starDuration, acquireStarShells → starShells · starDazzle → dazzleShells
//   buoyDuration, acquireRadarBuoy → decoyBuoy
//   buoyGun, acquireBoost → (nothing — no v3 card grants either)
//
// Several v2 keys land on ONE v3 line (raider's torpedoTube 2.5, torpedoSpeed
// 2.2 and acquireTorpedo 1.6 all become `heavyTorpedo`). The HIGHEST of them
// wins: the strongest thing the profile said about that weapon is what it
// meant about the weapon.
//
// NO PICK-ORDER AWARENESS LIVES HERE, AND NONE SHOULD.
// This policy scores each offered card on its own merits and never reasons
// about the order cards are acquired in. That was a deliberate ruling when the
// `mineDamage` × `minePropFouling` pick-order bug was still open: the finding
// was against the CARD ENGINE, not the bots, and Eric confirmed bots should
// eat it exactly as human players do rather than route around it. Catalog v3
// removes the hazard by construction (the fold is permutation-invariant and
// `validateCatalog` refuses an add/mult collision), but the rule survives its
// occasion: a future order-dependence is fixed in the engine for everyone.

import {
  CATALOG,
  CONFIG,
  boonStackCount,
  type Catalog,
  type CatalogLine,
  type LineKind,
  type Rng,
} from '@salvo/shared';
import type { BotProfile } from './profiles.js';
import type { AnyProfileId } from './types.js';

/** Everything the policy needs about the bot's own economy — read by the
 *  driver off the bot's OWN ShipRecord (the sanctioned self-read: its bank,
 *  its front offer, its fitted cards, its hp). */
export interface BotSpendState {
  /** Unspent banked levels. */
  bankedLevels: number;
  /** The FRONT OFFER's card line ids, or null (nothing materialized). */
  offer: readonly string[] | null;
  /** Card line ids already fitted, in fit order (repeats = stacks). */
  cards: readonly string[];
  hp: number;
  maxHp: number;
}

/** Score for a line this bot has taken to its CAP — deliberately neither zero
 *  (the pick stays legal, and a banked level held forever is wasted) nor
 *  competitive. Sits just under the lowest category base in the table. */
const HELD_LINE_SCORE = 0.9;

/** Score for a line nothing in this profile's table — and no kind base —
 *  speaks to. Below every real weight. */
const UNLISTED_SCORE = 0.5;

/**
 * THE KIND BASES (Story 8.1): what a profile wants from a line its re-keyed
 * table says nothing about, by the card's v3 KIND.
 *
 * STRUCTURAL, NOT TUNED. These are not new balance decisions: they reproduce
 * the shape the v2 table already had — a universal ladder is the safe
 * always-useful buy, an add-on is a cheap nature-changer on a weapon you are
 * already carrying, a new weapon is a bigger commitment, a consumable is the
 * least of them until Story 8.7 gives the rack a use. The real bot retune
 * against v3 decks is a balance pass with its own ruling (deferred-work).
 */
const KIND_BASE: Readonly<Record<LineKind, number>> = Object.freeze({
  ladder: 1.8,
  addon: 1.6,
  equipment: 1.2,
  consumable: 1.0,
});

/** v2 CATEGORY → the v3 lines it now speaks for (see the header table).
 *  Exported so the re-key is pinnable rather than only documented. */
export const CATEGORY_LINES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  ship: ['armor', 'speed', 'turning', 'reload'],
  guns: ['deckGun', 'deckGunTurret', 'deckGunBarrel'],
  // Story 8.13: ACOUSTIC HOMING is DELETED (homing became a tier stat on both
  // lines, amendment 80) and SUPERCAV TORPEDO became a CONSUMABLE (amendment
  // 74) — so a v2 `torpedoes` category no longer speaks for it, and it prices
  // at the consumable KIND base like every other belt line.
  torpedoes: ['lightTorpedo', 'heavyTorpedo'],
  mines: ['navalMines', 'captiveMines', 'foulingMines'],
  broadside: ['broadside'],
  starShells: ['starShells', 'dazzleShells', 'phosphorShells'],
  intel: ['radarSweep'],
  radarBuoy: ['decoyBuoy'],
  boost: [], // Story 8.9: the boost is a universal ability, not a card
});

/** v2 LINE-override key → the v3 line it now names (see the header table).
 *  A key with no v3 home is listed in HOMELESS_V2_LINES below instead, and
 *  contributes nothing. Exported so the re-key is pinnable. */
export const LINE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  shipHull: 'armor',
  shipSpeed: 'speed',
  shipCooldown: 'reload',
  intelSweep: 'radarSweep',
  gunBarrel: 'deckGunBarrel',
  gunTurret: 'deckGunTurret',
  torpedoTube: 'heavyTorpedo',
  torpedoSpeed: 'heavyTorpedo',
  acquireTorpedo: 'heavyTorpedo',
  mineBlast: 'navalMines',
  acquireMine: 'navalMines',
  mineCaptive: 'captiveMines',
  broadsideTurrets: 'broadside',
  broadsideSpread: 'broadside',
  acquireBroadside: 'broadside',
  starDuration: 'starShells',
  acquireStarShells: 'starShells',
  starDazzle: 'dazzleShells',
  buoyDuration: 'decoyBuoy',
  acquireRadarBuoy: 'decoyBuoy',
});

/**
 * The v2 line-override keys catalog v3 has NO home for, listed deliberately so
 * the "every override names a real line" pin can tell a re-key gap from a
 * ruled deletion:
 *   - `buoyGun` — the GUN BUOY verb; R1 deletes the radar buoy (Story 8.15)
 *     and no v3 line grants it.
 *   - `acquireBoost` — the speed boost becomes the universal Shift ability in
 *     Story 8.9, so it is not a card at all.
 *   - `torpedoHoming` — the ACOUSTIC HOMING add-on is DELETED (Eric ruling
 *     2026-09-19, epic-8 amendment 80): homing is a TIER STAT on the light and
 *     heavy lines, so the want has no single card to attach to. Re-keying it
 *     onto one of the two lines would silently double that line's price for a
 *     profile that actually wanted the verb on both.
 *   - `minePropFouling` — the PROP FOULING add-on is DELETED (amendment 81)
 *     and FOULING MINES is now a WEAPON LINE of its own, priced by the `mines`
 *     CATEGORY like the other two racks. The v2 key was an ADD-ON's weight;
 *     carrying it onto a whole weapon line would price a rack by what the
 *     profile thought of a modifier.
 *
 * STORY 8.18 OWNS THE RETUNE. Re-authoring these tables in v3 vocabulary (at
 * which point a profile can say what it thinks of FOULING MINES directly) is a
 * balance pass with its own ruling, not a side effect of a content story.
 */
export const HOMELESS_V2_LINES: ReadonlySet<string> = new Set([
  'buoyGun',
  'acquireBoost',
  'torpedoHoming',
  'minePropFouling',
]);

/** One profile's two-level weight table, widened for lookup. */
interface WeightTable {
  cat: Readonly<Record<string, number>>;
  lines: Readonly<Record<string, number>>;
}

/** The empty table a profile OUTSIDE CONFIG.bots.boonWeights resolves to —
 *  test-only rows have no doctrine table (they spend at random and only reach
 *  the weighted scorer through a hand-built call), so every line scores at
 *  its kind base rather than crashing on a missing table. Unreachable for the
 *  six in-game ids, whose tables always exist. */
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
function lineOf(catalog: Catalog, id: string): CatalogLine | null {
  if (!Object.hasOwn(catalog, id)) return null;
  return catalog[id] ?? null;
}

/** The HIGHEST re-keyed per-line override this profile has for `id`, or null.
 *  A table key that already IS a v3 line id counts as itself, so a future
 *  retune can author v3 keys directly without touching this module. */
function overrideFor(table: WeightTable, id: string): number | null {
  let best: number | null = null;
  for (const key of Object.keys(table.lines)) {
    const target = key === id ? id : LINE_ALIASES[key];
    if (target !== id) continue;
    const w = table.lines[key];
    if (w !== undefined && (best === null || w > best)) best = w;
  }
  return best;
}

/** The HIGHEST re-keyed category base this profile has for `id`, or null. */
function categoryFor(table: WeightTable, id: string): number | null {
  let best: number | null = null;
  for (const key of Object.keys(table.cat)) {
    if (!(CATEGORY_LINES[key] ?? []).includes(id)) continue;
    const w = table.cat[key];
    if (w !== undefined && (best === null || w > best)) best = w;
  }
  return best;
}

/**
 * How much this profile wants one offered LINE: the HIGHEST of its re-keyed
 * per-line overrides and its re-keyed category bases for that line, else the
 * line's KIND base — with a line already held AT CAP demoted to neutral.
 * Exported so tests (and a future tuning tool) can read the policy without
 * running a spend.
 *
 * WHY THE MAX RATHER THAN "OVERRIDE FIRST" (Story 8.1): the re-key collapses
 * several v2 keys onto one v3 line, and a v2 table could legitimately price
 * them differently — raider's `acquireRadarBuoy` 0.8 (an acquisition it ranked
 * last) and its `radarBuoy` category base both now speak about `decoyBuoy`.
 * Taking the strongest thing the profile said about that line keeps the v2
 * intent intact in both directions; override-first would silently let an
 * acquisition ranking demote a category the profile actually wants.
 */
export function boonWeightFor(
  profile: AnyProfileId,
  id: string,
  fitted: readonly string[] = [],
  catalog: Catalog = CATALOG,
): number {
  const line = lineOf(catalog, id);
  if (line === null) return 0; // unknown id: never picked
  if (boonStackCount(fitted, id) >= line.cap) return HELD_LINE_SCORE;
  const table = weightTable(profile);
  const named = [overrideFor(table, id), categoryFor(table, id)].filter((w): w is number => w !== null);
  if (named.length > 0) return Math.max(...named);
  return KIND_BASE[line.kind] ?? UNLISTED_SCORE;
}

/** The best line in an offer under this profile's weights. Never returns -1
 *  for a non-empty offer: even an all-junk hand is spent, because a banked
 *  level held forever is a level wasted. Ties keep the incumbent, so offer
 *  index settles them — deterministic, rng-free. */
function bestOfferIndex(profile: BotProfile, s: BotSpendState, catalog: Catalog): number {
  const offer = s.offer ?? [];
  let bestI = 0;
  let bestW = -Infinity;
  for (let i = 0; i < offer.length; i += 1) {
    const w = boonWeightFor(profile.id, offer[i], s.cards, catalog);
    if (w > bestW) {
      bestW = w;
      bestI = i;
    }
  }
  return bestI;
}

/**
 * THE SPEND DECISION: an offer index, or null for no spend this tick. NEVER
 * negative (Story 8.8: the reserved -1 heal sentinel is gone from the wire, and
 * World.spendPoint refuses every negative as malformed). Pure — no World, no
 * clock, no rng. The driver acts on it.
 *
 * `rng` (Story 7-6 wave 4) is consumed ONLY by a `spend: 'random'` test
 * profile's uniform offer pick — the WEIGHTED path never touches it (a
 * weighted spend with an rng in hand is byte-identical to one without), so
 * every in-game profile's spend stays pure and rng-free exactly as shipped.
 * A random profile handed no rng — only
 * reachable from a hand-built test call, never from the driver, which always
 * threads the mind's spendRng — falls through to the weighted scorer rather
 * than inventing a fixed pick.
 */
export function chooseSpend(
  profile: BotProfile,
  s: BotSpendState,
  catalog: Catalog = CATALOG,
  rng?: Rng,
): number | null {
  if (s.bankedLevels <= 0) return null;
  if (s.offer === null || s.offer.length === 0) return null;
  if (profile.spend === 'random' && rng !== undefined) return rng.int(0, s.offer.length - 1);
  return bestOfferIndex(profile, s, catalog);
}
