// Deck-only fast mode (spec task: amendment 38's pity evidence at scale).
//
// A pure loop over the exported shared deck seam — buildDeck / drawOffer /
// consumeCard / returnCards / consumeAcquisition on a mulberry32 stream — with
// the server-side behavior the pure seam lacks replicated from world.ts
// spendPoint/settleSpend (read before writing this):
//   1. doctrine-rival return-to-deck: fitting a card whose exclusiveWith rival
//      is currently held removes ONE occurrence of the rival and returns its
//      card to the deck (applyBoon swapOutRival + settleSpend returnCards).
// The lazy-draw bugfix retired the other two (the amendment-43 scrub and its
// scrubbed-to-empty drop, and the banked-offer FIFO): a DRAW now takes nothing
// out of the deck and only the FIT does, and only the front level ever holds a
// hand — so depletion is unchanged at one card per fit, which is exactly what
// this harness measured before.
// Spends use the SAME deterministic policy as the scripted pilots
// (pickSpendChoice) — one spend per level, immediately after the draw, exactly
// like a captain who refits as soon as TAB glows.
//
// One "economy" = one class's deck played level-by-level until exhausted.
// Classes round-robin per economy; `draws` is the TOTAL draw budget across
// economies (the last economy always plays out fully — determinism over exact
// budget adherence). No World, no Match: >= 10^4 economies run in seconds.
//
// ===== THE STOPPING RULE IS A MODELING CHOICE (evidence honesty) =============
// PRODUCTION HAS NO ECONOMY TERMINATION. A live captain's deck never "ends":
// once a doctrine is fitted, its rival card is a permanent REPLACE offer —
// world.ts settleSpend returns the swapped-out rival to the deck, so a
// rivals-only deck cycles forever at net-zero depletion. Levels keep coming as
// long as the match runs; only the MATCH ends, not the deck.
//
// This harness therefore imposes its own stop: an economy ends when the deck is
// EMPTY OR holds only terminal rival cards (deckExhausted below), with
// ECONOMY_DRAW_CAP as a backstop. That is a deliberate model, not a claim about
// the server. It is sound for the comparative question it was built to answer:
//   - EVERY dial variant runs under the SAME rule, so cross-variant deltas
//     (flat vs escalating pity) are apples-to-apples;
//   - the pity buckets are dominated by PRE-exhaustion draws (the shallow
//     dry 0-6 rows that real matches actually reach), so the ratification
//     evidence does not rest on the tail the rule truncates;
//   - the batch mode (real World + Match) corroborates the same direction
//     without any stopping rule at all.
// What the rule DOES bias: absolute per-economy totals — "draws played per
// economy", "decks effectively exhausted", and the deep-dry (>= ~10) buckets.
// Read those as harness-model numbers, never as production lifetimes.
// ============================================================================

import {
  BOON_CATALOG,
  SHIP_CLASS_IDS,
  buildDeck,
  consumeAcquisition,
  drawOffer,
  effectiveStats,
  hullEnvelope,
  isAcquisitionDef,
  loadoutFor,
  mulberry32,
  consumeCard,
  returnCards,
  type BoonDef,
  type DeckState,
  type EquipmentId,
  type Rng,
  type ShipClassId,
} from '@salvo/shared';
import { pickSpendChoice } from './pilots.js';
import { mixSeed, summarize, tally, type Summary } from './stats.js';

/** Pity buckets: levelsSinceRare 0..PITY_MAX-1, last bucket = "PITY_MAX+". */
export const PITY_MAX = 15;
/** Depletion is tracked for draw indices 1..DEPLETION_MAX. */
const DEPLETION_MAX = 60;
/** Hard per-economy draw cap (backstop only — see deckStalled). */
const ECONOMY_DRAW_CAP = 300;

export interface DeckSimSpec {
  seed: number;
  draws: number;
}

export interface DeckAggregate {
  economies: number;
  totalDraws: number;
  /** Rare/exclusive landing rate per pre-draw levelsSinceRare (the pity curve). */
  pity: { dry: number; draws: number; rareRate: number }[];
  exclusiveOfferedReach: number;
  exclusiveOfferedDraw: Summary;
  exclusivePickedReach: number;
  exclusivePickedDraw: Summary;
  /** Draws each economy played before hitting the harness stopping rule
   *  (empty-or-rivals-only; see the module header — production never stops). */
  drawsPlayed: Summary;
  /** Fraction of economies that reached the harness stopping rule: the deck is
   *  EMPTY OR holds only terminal rival cards. A fitted doctrine's rival can
   *  never leave circulation (the swap returns it — net-zero draws forever), so
   *  a deck with a doctrine fitted structurally floors at those cards instead of
   *  zero. This is a MODELING stop, not a production one (module header). */
  deckExhaustedRate: number;
  cappedLines: Summary;
  anyCapRate: number;
  /** Mean cards remaining AFTER draw k and its immediate spend — give-backs
   *  (losing-option returns + doctrine-rival returns) included, since the spend
   *  resolves inside the same step (k = 1..DEPLETION_MAX, 5-step rows). */
  depletion: { draw: number; meanRemaining: number; n: number }[];
}

/** The slotFill target of an acquisition def (world.consumeAcquisitionPick). */
function acquisitionTarget(def: BoonDef): EquipmentId | null {
  const fill = def.effects.find((e) => e.kind === 'slotFill');
  return fill !== undefined && fill.kind === 'slotFill' ? fill.equipmentId : null;
}

/** Carried equipment ids for a class's fresh fit (World.carriedEquipment). */
function carriedFor(cls: ShipClassId): EquipmentId[] {
  const loadout = loadoutFor(cls, effectiveStats(hullEnvelope(cls)));
  const out: EquipmentId[] = [];
  for (const slot of loadout) if (slot.equipmentId !== null) out.push(slot.equipmentId);
  return out;
}

interface EconomyState {
  deck: DeckState;
  fitted: string[];
}

interface EconomyStats {
  draws: number;
  emptied: boolean;
  firstExclusiveOffered: number | null;
  firstExclusivePicked: number | null;
  remainingByDraw: number[];
  cappedLines: number;
}

/** Spend the materialized front hand through the settleSpend-equivalent pure
 *  flow: ONLY the chosen card leaves the deck (the other three never left). */
function spendFront(st: EconomyState, front: readonly string[], rng: Rng): string | null {
  if (front.length === 0) return null;
  const choice = pickSpendChoice(front, rng, st.fitted);
  const chosen = front[choice];
  st.deck = consumeCard(st.deck, chosen);
  const def = BOON_CATALOG[chosen];
  // (1) doctrine-rival return-to-deck (applyBoon swapOutRival).
  if (def?.exclusiveWith !== undefined) {
    const at = st.fitted.indexOf(def.exclusiveWith);
    if (at >= 0) {
      st.fitted.splice(at, 1);
      st.deck = returnCards(st.deck, [def.exclusiveWith]);
    }
  }
  st.fitted.push(chosen);
  if (def !== undefined && isAcquisitionDef(def)) {
    const target = acquisitionTarget(def);
    // The next hand is drawn from the CLEANED deck — no banked offer can hold
    // a now-dead acquisition card, so amendment 43's scrub is unreachable.
    if (target !== null) st.deck = consumeAcquisition(st.deck, BOON_CATALOG, target);
  }
  return chosen;
}

const hasExclusive = (ids: readonly string[]): boolean =>
  ids.some((id) => BOON_CATALOG[id]?.rarity === 'exclusive');

/** A card that can never permanently leave the deck: the doctrine rival of a
 *  currently-fitted exclusive (picking it swaps and returns the other side). */
const isTerminalRival = (id: string, fitted: readonly string[]): boolean => {
  const def = BOON_CATALOG[id];
  return def?.exclusiveWith !== undefined && fitted.includes(def.exclusiveWith);
};

/** THE HARNESS STOPPING RULE (module header): empty, or only terminal rival
 *  cards — every further draw would be a net-zero doctrine ping-pong (found
 *  empirically: without this, every doctrine-fitted economy burns the draw cap
 *  and floods the pity table with degenerate tail draws). Production has no
 *  such stop; this is a modeling choice applied identically to every variant. */
const deckExhausted = (st: EconomyState): boolean =>
  st.deck.cards.every((id) => isTerminalRival(id, st.fitted));

/** One level's draw + immediate spend; false = deck could not draw (done).
 *  Split from playEconomy for the complexity budget. */
function playOneDraw(
  st: EconomyState,
  stats: EconomyStats,
  draw: number,
  rng: Rng,
  pityHits: number[],
  pityDraws: number[],
): boolean {
  const dry = Math.min(st.deck.levelsSinceRare, PITY_MAX);
  const r = drawOffer(st.deck, rng, BOON_CATALOG);
  st.deck = r.deck;
  if (r.offer.length === 0) return false; // nothing drawable: a level banks nothing
  stats.draws = draw;
  pityDraws[dry] += 1;
  if (r.offer.some((id) => BOON_CATALOG[id]?.rarity !== 'common')) pityHits[dry] += 1;
  if (stats.firstExclusiveOffered === null && hasExclusive(r.offer)) stats.firstExclusiveOffered = draw;
  const picked = spendFront(st, r.offer, rng);
  if (picked !== null && stats.firstExclusivePicked === null && hasExclusive([picked])) {
    stats.firstExclusivePicked = draw;
  }
  if (draw <= DEPLETION_MAX) stats.remainingByDraw.push(st.deck.cards.length);
  return true;
}

/** Play one full economy; feeds the shared pity buckets as it draws. */
function playEconomy(
  cls: ShipClassId,
  rng: Rng,
  pityHits: number[],
  pityDraws: number[],
): EconomyStats {
  const st: EconomyState = { deck: buildDeck(BOON_CATALOG, carriedFor(cls)), fitted: [] };
  const stats: EconomyStats = {
    draws: 0,
    emptied: false,
    firstExclusiveOffered: null,
    firstExclusivePicked: null,
    remainingByDraw: [],
    cappedLines: 0,
  };
  for (let draw = 1; draw <= ECONOMY_DRAW_CAP; draw += 1) {
    if (deckExhausted(st)) break; // empty, or terminal-rival ping-pong only
    if (!playOneDraw(st, stats, draw, rng, pityHits, pityDraws)) break;
  }
  stats.emptied = deckExhausted(st);
  for (const [id, n] of tally(st.fitted)) {
    const def = BOON_CATALOG[id];
    if (def !== undefined && n >= def.copies) stats.cappedLines += 1;
  }
  return stats;
}

export function runDeckSim(spec: DeckSimSpec): DeckAggregate {
  const pityHits = new Array<number>(PITY_MAX + 1).fill(0);
  const pityDraws = new Array<number>(PITY_MAX + 1).fill(0);
  const economies: EconomyStats[] = [];
  let totalDraws = 0;
  for (let e = 0; totalDraws < spec.draws; e += 1) {
    const rng = mulberry32(mixSeed(spec.seed, e));
    const cls = SHIP_CLASS_IDS[e % SHIP_CLASS_IDS.length];
    const stats = playEconomy(cls, rng, pityHits, pityDraws);
    // ZERO-PROGRESS GUARD (defense in depth behind the --set floors): the budget
    // loop only advances on draws played, so an economy that plays none would
    // spin forever. The known cause is a non-positive offer.size (drawOffer
    // returns an empty offer every level), now rejected at parse/apply time —
    // anything else reaching here is a structural bug, and must fail loudly.
    if (stats.draws === 0) {
      throw new Error(
        `deck-only: economy ${e} (class ${cls}) played 0 draws — no progress is possible ` +
          `(check CONFIG.offer.size / the deck catalog); refusing to spin`,
      );
    }
    economies.push(stats);
    totalDraws += stats.draws;
  }
  return buildDeckAggregate(economies, totalDraws, pityHits, pityDraws);
}

function buildDeckAggregate(
  economies: readonly EconomyStats[],
  totalDraws: number,
  pityHits: readonly number[],
  pityDraws: readonly number[],
): DeckAggregate {
  const offered = economies.map((e) => e.firstExclusiveOffered).filter((d): d is number => d !== null);
  const picked = economies.map((e) => e.firstExclusivePicked).filter((d): d is number => d !== null);
  const depletion: DeckAggregate['depletion'] = [];
  for (let k = 5; k <= DEPLETION_MAX; k += 5) {
    const at = economies.filter((e) => e.remainingByDraw.length >= k).map((e) => e.remainingByDraw[k - 1]);
    if (at.length === 0) continue;
    depletion.push({ draw: k, meanRemaining: at.reduce((a, b) => a + b, 0) / at.length, n: at.length });
  }
  return {
    economies: economies.length,
    totalDraws,
    pity: pityDraws.map((draws, dry) => ({ dry, draws, rareRate: draws === 0 ? 0 : pityHits[dry] / draws })),
    exclusiveOfferedReach: economies.length === 0 ? 0 : offered.length / economies.length,
    exclusiveOfferedDraw: summarize(offered),
    exclusivePickedReach: economies.length === 0 ? 0 : picked.length / economies.length,
    exclusivePickedDraw: summarize(picked),
    drawsPlayed: summarize(economies.map((e) => e.draws)),
    deckExhaustedRate: economies.length === 0 ? 0 : economies.filter((e) => e.emptied).length / economies.length,
    cappedLines: summarize(economies.map((e) => e.cappedLines)),
    anyCapRate: economies.length === 0 ? 0 : economies.filter((e) => e.cappedLines > 0).length / economies.length,
    depletion,
  };
}
