// Deck-only fast mode — per-line reachability and depletion evidence at scale.
//
// A pure loop over the exported shared deck seam — buildDeck / drawOffer /
// consumeCard on a mulberry32 stream.
//
// SOFT PITY AND RARITY ARE DELETED (Story 8.1). Catalog v3 has no rarity tier,
// so there is no "rare landing rate" to escalate and no pity curve to measure;
// a line's draw weight is simply the copies it has left. The pity buckets and
// the exclusive-reach rows went with the mechanism. What survives is what the
// harness is still good for: per-line offer/pick reachability (the dead-card
// question) and deck depletion.
//
// IT NO LONGER REPLICATES ANY SERVER-SIDE BEHAVIOUR THE PURE SEAM LACKS.
// It used to model exactly one: doctrine-rival return-to-deck (fitting a card
// whose `exclusiveWith` rival was held returned the rival's card). Story 7-5
// wave 2 DELETED exclusivity outright (R2.6 — the cannon pair was its last
// user), so nothing ever re-enters a deck: a card leaves at the FIT and never
// comes back. THE STOPPING RULE IS THEREFORE JUST "THE POOL IS EMPTY" (Story
// 8.3, deferred-work :302 closed by deletion) — there is no rival floor and
// nothing left to ping-pong.
// The lazy-draw bugfix had already retired the other two models (the
// amendment-43 scrub and its scrubbed-to-empty drop, and the banked-offer
// FIFO): a DRAW takes nothing out of the deck and only the FIT does.
// Spends use the SAME deterministic policy the scripted control uses
// (spendPolicy.pickSpendChoice) — one spend per level, immediately after the
// draw, exactly like a captain who refits as soon as TAB glows.
//
// One "economy" = one class's deck played level-by-level until exhausted.
// Classes round-robin per economy; `draws` is the TOTAL draw budget across
// economies (the last economy always plays out fully — determinism over exact
// budget adherence). No World, no Match: >= 10^4 economies run in seconds.
//
// ===== THE STOPPING RULE IS A MODELING CHOICE (evidence honesty) =============
// PRODUCTION HAS NO ECONOMY TERMINATION. Levels keep coming as long as the
// match runs; only the MATCH ends, not the deck. This harness therefore
// imposes its own stop: an economy ends when the deck is EMPTY
// (deckExhausted below), with ECONOMY_DRAW_CAP as a backstop. That is a
// deliberate model, not a claim about the server. It is sound for the
// comparative question it was built to answer, because EVERY variant runs
// under the SAME rule, so cross-variant deltas are apples-to-apples; and the
// batch mode (real World + Match) corroborates without any stopping rule.
// What the rule DOES bias: absolute per-economy totals — "draws played per
// economy" and "decks effectively exhausted". Read those as harness-model
// numbers, never as production lifetimes.
// ============================================================================

import {
  CATALOG,
  DEFAULT_DECKS,
  SHIP_CLASS_IDS,
  buildDeckState,
  drawOffer,
  mulberry32,
  consumeCard,
  type DeckState,
  type LineId,
  type Rng,
  type ShipClassId,
} from '@salvo/shared';

/**
 * WHAT A HULL STARTS HOLDING: NOTHING (Story 8.10, FR48, epic-8 amendment 62).
 * The interim spawn seed — the class weapons a captain used to start with as
 * cards — is deleted, so `World.addShip` seeds `ship.cards` with the empty
 * list and the whole pool is dealt from the frozen deck list. The helper
 * stands (rather than being inlined at its two call sites) because it is the
 * harness's ONE statement of the spawn-holdings rule, and the day a hull holds
 * something again there is one line to change.
 */
export function carriedLinesFor(_cls: ShipClassId): readonly LineId[] {
  return [];
}

/** A hull's fresh drawable pool: its DEFAULT deck less stubs less its seed —
 *  exactly what `World.addShip` deals for a captain at the door (Story 8.2). */
export function defaultPoolFor(cls: ShipClassId): DeckState {
  return buildDeckState(DEFAULT_DECKS[cls], carriedLinesFor(cls));
}
import { pickSpendChoice } from './spendPolicy.js';
import { mixSeed, summarize, tally, type Summary } from './stats.js';

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
  /** Draws each economy played before hitting the harness stopping rule: the
   *  POOL IS EMPTY (see the module header — production never stops). */
  drawsPlayed: Summary;
  /** Fraction of economies that reached the harness stopping rule: an EMPTY
   *  deck. This is a MODELING stop, not a production one (module header). */
  deckExhaustedRate: number;
  cappedLines: Summary;
  anyCapRate: number;
  /** PER-LINE REACHABILITY (Story 7-5 evidence pass) — the policy-free half is
   *  `lineOffers` (deck composition + the offer roll alone); `linePicks` also
   *  carries pickSpendChoice's kind preference and must never be read as
   *  player taste. `hands` is the offers denominator; `handsByClass` the
   *  per-class one. Every catalog line is reported, including lines that were
   *  offered ZERO times — the dead-card question. */
  lineOffers: Record<string, number>;
  linePicks: Record<string, number>;
  lineOffersByClass: Record<string, Record<string, number>>;
  hands: number;
  handsByClass: Record<string, number>;
  /** Mean cards remaining AFTER draw k and its immediate spend. There are no
   *  give-backs of any kind any more (the draw is a read; only the FIT removes
   *  a card — Story 8.3), so the spend resolves inside the same step
   *  (k = 1..DEPLETION_MAX, 5-step rows). */
  depletion: { draw: number; meanRemaining: number; n: number }[];
}

interface EconomyState {
  deck: DeckState;
  fitted: string[];
}

/** Per-line offer/pick accumulation, shared across every economy in a run. */
export interface LineLedger {
  hands: number;
  offers: Record<string, number>;
  picks: Record<string, number>;
  byClass: Record<string, Record<string, number>>;
  handsByClass: Record<string, number>;
}

const emptyLedger = (): LineLedger => ({ hands: 0, offers: {}, picks: {}, byClass: {}, handsByClass: {} });

const bumpLine = (rec: Record<string, number>, key: string): void => {
  rec[key] = (rec[key] ?? 0) + 1;
};

/** Fold one materialized hand into the per-line ledger. */
function recordHand(ledger: LineLedger, cls: ShipClassId, offer: readonly string[]): void {
  ledger.hands += 1;
  ledger.handsByClass[cls] = (ledger.handsByClass[cls] ?? 0) + 1;
  const byClass = (ledger.byClass[cls] ??= {});
  for (const id of offer) {
    bumpLine(ledger.offers, id);
    bumpLine(byClass, id);
  }
}

interface EconomyStats {
  draws: number;
  emptied: boolean;
  remainingByDraw: number[];
  cappedLines: number;
}

/** Spend the materialized front hand through the settleSpend-equivalent pure
 *  flow: ONLY the chosen card leaves the deck (the other three never left). */
function spendFront(st: EconomyState, front: readonly string[], rng: Rng): string | null {
  if (front.length === 0) return null;
  const choice = pickSpendChoice(front, rng, st.fitted);
  const chosen = front[choice];
  st.deck = consumeCard(st.deck, chosen as (typeof st.deck.cards)[number]);
  st.fitted.push(chosen);
  return chosen;
}

/** THE HARNESS STOPPING RULE: the deck is EMPTY. No card can return to a deck,
 *  so an empty deck is the only terminal state. */
const deckExhausted = (st: EconomyState): boolean => st.deck.cards.length === 0;

/** One level's draw + immediate spend; false = deck could not draw (done).
 *  Split from playEconomy for the complexity budget. */
function playOneDraw(
  st: EconomyState,
  stats: EconomyStats,
  draw: number,
  rng: Rng,
  ledger: LineLedger,
  cls: ShipClassId,
): boolean {
  const r = drawOffer(st.deck, rng);
  st.deck = r.deck;
  if (r.offer.length === 0) return false; // nothing drawable: a level banks nothing
  stats.draws = draw;
  recordHand(ledger, cls, r.offer);
  const picked = spendFront(st, r.offer, rng);
  if (picked !== null) bumpLine(ledger.picks, picked);
  if (draw <= DEPLETION_MAX) stats.remainingByDraw.push(st.deck.cards.length);
  return true;
}

/** Play one full economy. */
function playEconomy(cls: ShipClassId, rng: Rng, ledger: LineLedger): EconomyStats {
  // Each class plays its own DEFAULT deck (Story 8.2): 23 drawable cards
  // today, so an economy exhausts in ~23 draws and the per-class ledger
  // columns are real per-hull evidence.
  const st: EconomyState = { deck: defaultPoolFor(cls), fitted: [] };
  const stats: EconomyStats = { draws: 0, emptied: false, remainingByDraw: [], cappedLines: 0 };
  for (let draw = 1; draw <= ECONOMY_DRAW_CAP; draw += 1) {
    if (deckExhausted(st)) break;
    if (!playOneDraw(st, stats, draw, rng, ledger, cls)) break;
  }
  stats.emptied = deckExhausted(st);
  for (const [id, n] of tally(st.fitted)) {
    if (Object.hasOwn(CATALOG, id) && n >= CATALOG[id].cap) stats.cappedLines += 1;
  }
  return stats;
}

export function runDeckSim(spec: DeckSimSpec): DeckAggregate {
  const economies: EconomyStats[] = [];
  const ledger = emptyLedger();
  let totalDraws = 0;
  for (let e = 0; totalDraws < spec.draws; e += 1) {
    const rng = mulberry32(mixSeed(spec.seed, e));
    const cls = SHIP_CLASS_IDS[e % SHIP_CLASS_IDS.length];
    const stats = playEconomy(cls, rng, ledger);
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
  return buildDeckAggregate(economies, totalDraws, ledger);
}

function buildDeckAggregate(
  economies: readonly EconomyStats[],
  totalDraws: number,
  ledger: LineLedger,
): DeckAggregate {
  const depletion: DeckAggregate['depletion'] = [];
  for (let k = 5; k <= DEPLETION_MAX; k += 5) {
    const at = economies.filter((e) => e.remainingByDraw.length >= k).map((e) => e.remainingByDraw[k - 1]);
    if (at.length === 0) continue;
    depletion.push({ draw: k, meanRemaining: at.reduce((a, b) => a + b, 0) / at.length, n: at.length });
  }
  return {
    economies: economies.length,
    totalDraws,
    drawsPlayed: summarize(economies.map((e) => e.draws)),
    deckExhaustedRate: economies.length === 0 ? 0 : economies.filter((e) => e.emptied).length / economies.length,
    cappedLines: summarize(economies.map((e) => e.cappedLines)),
    anyCapRate: economies.length === 0 ? 0 : economies.filter((e) => e.cappedLines > 0).length / economies.length,
    depletion,
    lineOffers: ledger.offers,
    linePicks: ledger.picks,
    lineOffersByClass: ledger.byClass,
    hands: ledger.hands,
    handsByClass: ledger.handsByClass,
  };
}
