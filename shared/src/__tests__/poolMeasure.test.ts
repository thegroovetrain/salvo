// THE 50-CARD ECONOMY, MEASURED (Story 8.11) — the bar FR59 is judged against
// when Story 8.18 measures the real thing.
//
// WHAT IT ANSWERS. With the match consumable pool appended (40 authored + 10
// pooled = 50), two numbers decide whether the deck still reads as a deck:
//   (a) THE ONE-COPY APPEARANCE RATE — how often a line a deck carries ONE copy
//       of (`deckGunTurret`, universal, cap 1) has been SEEN in at least one
//       offer by pick 8 / 12 / 15 / 20. A one-copy card nobody is ever offered
//       is a card that is not in the game.
//   (b) THE OFFER-SIZE MATH — the level at which an offer first holds fewer
//       than `CONFIG.offer.size` lines (fewer than four DRAWABLE lines remain:
//       either the deck is down to under four distinct lines, or the rest are
//       lines this captain already holds at cap and the guard will not offer),
//       and the level at which the draw first comes back EMPTY.
//
// HOW IT IS MEASURED, and why each choice:
//   - AN UNSTUBBED COPY OF THE CATALOG. Four of the five consumables are still
//     `stub: true` (amendment 67), so today only HULL REPAIR's pool copies are
//     dealt and the live deck is short of 50. The bar is for the FINISHED game,
//     so the measurement clears every stub flag: all 40 authored + all 10
//     pooled cards are dealable, pinned at exactly 50.
//   - A UNIFORM PICK PER LEVEL. No bot policy, no human preference — the
//     neutral captain. A policy would measure the policy.
//   - `{ held }` ON EVERY DRAW, because the at-cap guard is LIVE from this
//     story: the pool can push a line past its cap, and the guard will not
//     offer a line the captain already holds at cap. A draw without `held`
//     would measure an economy the server does not run.
//   - THE NEVER-USE MODEL, and this is the one caveat on every number below: a
//     card here is fitted and never FIRED, so nothing ever leaves `held`. In
//     production a used consumable copy leaves the ship's cards (Story 8.7),
//     which REOPENS the line and puts its remaining copies back in the draw —
//     so a consumable fitted to cap stays closed here while production reopens
//     it on use. Equipment and ladder lines are exact either way (their copies
//     never leave `cards` in production either). Read the consumable side of
//     the table as a PESSIMISTIC FLOOR, never as a ceiling.
//
// THE ASSERTIONS ARE LOOSE ON PURPOSE. The table is EVIDENCE, recorded in the
// spec's run result and the ledger; pinning a rate to three decimals would
// turn a tuning question into a failing test the first time a count moves.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  DEFAULT_DECKS,
  SHIP_CLASS_IDS,
  buildDeckState,
  consumeCard,
  drawOffer,
  mulberry32,
  rollMatchPool,
  type Catalog,
  type CatalogLine,
  type LineId,
  type ShipClassId,
} from '../index.js';

/** Economies per hull. */
const N = 2000;

/** The one-copy line every default deck carries exactly one of (cap 1). */
const ONE_COPY: LineId = 'deckGunTurret';

/** The pick marks the appearance rate is read at. */
const MARKS = [8, 12, 15, 20] as const;

/**
 * THE CATALOG AS IT WILL BE WHEN EVERY CONSUMABLE IS BUILT: the production rows
 * with `stub` cleared, so `buildDeckState` deals all 50 cards. Frozen like the
 * real one (the tier arrays below are already deep-frozen and are shared).
 */
function unstubbed(cat: Catalog): Catalog {
  const out: Record<string, CatalogLine> = {};
  for (const id of Object.keys(cat)) {
    const { stub: _stub, ...rest } = cat[id];
    out[id] = Object.freeze(rest);
  }
  return Object.freeze(out);
}

const CAT: Catalog = unstubbed(CATALOG);

/** One seeded economy's measurements. `Infinity` means "never happened". */
interface Economy {
  readonly dealable: number;
  readonly firstSeen: number; // level ONE_COPY first appeared in an offer
  readonly firstShort: number; // level an offer first held < CONFIG.offer.size lines
  readonly exhausted: number; // level the draw first came back empty
}

/** Play one whole economy: roll a pool, build the 50-card deck, then take a
 *  uniformly random offered card every level until the draw runs dry. */
function playEconomy(cls: ShipClassId, seed: number): Economy {
  const rng = mulberry32(seed);
  const pool = rollMatchPool(rng, CAT);
  let deck = buildDeckState([...DEFAULT_DECKS[cls], ...pool], [], CAT);
  const dealable = deck.cards.length;
  const held: LineId[] = [];
  let firstSeen = Infinity;
  let firstShort = Infinity;
  for (let level = 1; level <= dealable + 1; level += 1) {
    const { offer } = drawOffer(deck, rng, CAT, { held });
    if (offer.length === 0) return { dealable, firstSeen, firstShort, exhausted: level };
    if (firstSeen === Infinity && offer.includes(ONE_COPY)) firstSeen = level;
    if (firstShort === Infinity && offer.length < CONFIG.offer.size) firstShort = level;
    const pick = offer[Math.min(Math.floor(rng.next() * offer.length), offer.length - 1)];
    deck = consumeCard(deck, pick);
    held.push(pick);
  }
  return { dealable, firstSeen, firstShort, exhausted: Infinity };
}

/** The mean of a column, counting a `never` as the cap it could not exceed. */
function mean(values: readonly number[], never: number): number {
  let sum = 0;
  for (const v of values) sum += Number.isFinite(v) ? v : never;
  return sum / values.length;
}

/** One hull's table row. */
interface Row {
  readonly cls: ShipClassId;
  readonly rates: readonly number[];
  readonly firstShort: number;
  readonly exhausted: number;
  readonly dealable: number;
}

function measure(cls: ShipClassId, ordinal: number): Row {
  const runs: Economy[] = [];
  for (let i = 0; i < N; i += 1) {
    // A decorrelated seed per (hull, economy) — no two hulls replay one stream.
    runs.push(playEconomy(cls, (i * 0x9e3779b1 + ordinal * 0x85ebca6b + 0x1234567) >>> 0));
  }
  const cap = runs[0].dealable + 1;
  return {
    cls,
    rates: MARKS.map((m) => runs.filter((r) => r.firstSeen <= m).length / runs.length),
    firstShort: mean(runs.map((r) => r.firstShort), cap),
    exhausted: mean(runs.map((r) => r.exhausted), cap),
    dealable: mean(runs.map((r) => r.dealable), cap),
  };
}

describe('THE 50-CARD ECONOMY, MEASURED (Story 8.11 — the bar Story 8.18 measures against)', () => {
  it('measures the one-copy appearance rate and the offer-size math over seeded economies', () => {
    const rows = SHIP_CLASS_IDS.map((cls, i) => measure(cls, i));

    const head = `hull          ${MARKS.map((m) => `@${String(m)}`.padStart(7)).join('')}   1st-short   empty-at   dealable`;
    const lines = rows.map((r) => [
      r.cls.padEnd(12),
      r.rates.map((p) => `${(p * 100).toFixed(1)}%`.padStart(7)).join(''),
      r.firstShort.toFixed(2).padStart(12),
      r.exhausted.toFixed(2).padStart(11),
      r.dealable.toFixed(2).padStart(11),
    ].join(''));
    console.log(
      [
        `\nTHE 50-CARD ECONOMY — ${String(N)} seeded economies per hull, uniform pick per level,`,
        `unstubbed catalog, pool ${String(CONFIG.pool.size)}, offer ${String(CONFIG.offer.size)}.`,
        'NEVER-USE MODEL — a consumable fitted to cap stays closed; production reopens it on use.',
        `Columns: share of economies in which ${ONE_COPY} (1 copy, cap 1) appeared in an`,
        'offer by pick 8/12/15/20; mean level an offer first held < 4 DRAWABLE lines (under four',
        'distinct lines left, or the rest held at cap); mean level the draw first came back',
        'empty; mean dealable deck size.',
        head,
        ...lines,
        '',
      ].join('\n'),
    );

    for (const r of rows) {
      // Every card is dealable with the stubs cleared: 40 authored + 10 pooled.
      expect(r.dealable, r.cls).toBe(CONFIG.deck.size + CONFIG.pool.size);
      // The rate can only GROW with more picks — a card seen by pick 8 has been
      // seen by pick 20.
      for (let i = 1; i < r.rates.length; i += 1) {
        expect(r.rates[i], `${r.cls}@${String(MARKS[i])}`).toBeGreaterThanOrEqual(r.rates[i - 1]);
        expect(r.rates[i], `${r.cls}@${String(MARKS[i])}`).toBeLessThanOrEqual(1);
      }
      expect(r.rates[r.rates.length - 1], r.cls).toBeGreaterThanOrEqual(r.rates[0]);
      expect(r.rates[0], r.cls).toBeGreaterThanOrEqual(0);
      // A 50-card deck cannot run short of four DISTINCT lines in the opening
      // levels (it holds well over four), nor outlive its own cards.
      expect(r.firstShort, r.cls).toBeGreaterThan(CONFIG.offer.size);
      // The empty draw lands at level `dealable + 1` for an economy that never
      // closed a line (50 picks, then nothing left), and EARLIER for one that
      // did — so `dealable + 1` is the real bound on the mean, not `dealable`.
      expect(r.exhausted, r.cls).toBeLessThanOrEqual(r.dealable + 1);
    }
  });
});
