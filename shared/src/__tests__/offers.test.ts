// BOON offer rolls (Story 2.7) — the deterministic core of the spend economy.
// Reworked from the legacy upgrade-offer suite (rollOffer/categoryOf/
// offerableIds/OFFER_EXCLUDED_IDS all died with the upgrade offer flow; the
// UPGRADE_CATEGORIES partition guard moved to constants.test.ts, where the
// table now lives on alone until 2.8 strips it).
//
// Properties pinned here: (1) a production roll is CONFIG.offer.size ids from
// that many DISTINCT categories, every id resolvable; (2) determinism per rng
// state (the reroll-proof guarantee's foundation); (3) the fail-safe short-roll
// against small/empty injected catalogs — never a throw; (4) coverage: over a
// long stream every category and every catalog id shows up; (5) category order
// is catalog ITERATION order (reordering the catalog changes seeded offers).

import { describe, it, expect } from 'vitest';
import {
  BOON_CATALOG,
  CONFIG,
  UPGRADE_CATEGORIES,
  UPGRADE_CATEGORY_IDS,
  UPGRADE_IDS,
  mulberry32,
  rollBoonOffer,
  type BoonCatalog,
  type BoonDef,
} from '../index.js';

// LEGACY (kept, not deleted): UPGRADE_CATEGORIES no longer feeds any roll, but
// the counts array is still wire contract and the partition guard is still the
// thing that forces a future 15th upgrade to be categorized. Dies with the
// table in 2.8.
describe('UPGRADE_CATEGORIES — exact partition of UPGRADE_IDS (legacy table)', () => {
  it('every id appears in exactly one category and the union is all 14', () => {
    const seen = new Map<string, number>();
    for (const cat of UPGRADE_CATEGORY_IDS) {
      for (const id of UPGRADE_CATEGORIES[cat]) seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    for (const id of UPGRADE_IDS) expect(seen.get(id)).toBe(1); // each exactly once
    expect(seen.size).toBe(UPGRADE_IDS.length); // no stragglers, none missing
    const total = UPGRADE_CATEGORY_IDS.reduce((n, c) => n + UPGRADE_CATEGORIES[c].length, 0);
    expect(total).toBe(UPGRADE_IDS.length);
  });
});

/** category of a production catalog id (the catalog IS the reverse map). */
const catOf = (id: string): string => BOON_CATALOG[id].category;

/** A minimal injectable catalog builder: [id, category] pairs, insertion-ordered. */
function catalogOf(rows: readonly (readonly [string, string])[]): BoonCatalog {
  const out: Record<string, BoonDef> = {};
  for (const [id, category] of rows) out[id] = { id, category, effects: [] };
  return out;
}

describe('BOON_CATALOG shape — the dummy set the roll depends on (amendment 35)', () => {
  it('has at least CONFIG.offer.size distinct categories, so a full offer is always rollable', () => {
    const cats = new Set(Object.values(BOON_CATALOG).map((d) => d.category));
    expect(cats.size).toBeGreaterThanOrEqual(CONFIG.offer.size);
  });

  it('has at least two boons per category, so distinct-category offers actually VARY', () => {
    const byCat = new Map<string, number>();
    for (const def of Object.values(BOON_CATALOG)) {
      byCat.set(def.category, (byCat.get(def.category) ?? 0) + 1);
    }
    for (const [cat, n] of byCat) expect(n, cat).toBeGreaterThanOrEqual(2);
  });
});

describe('rollBoonOffer — production catalog', () => {
  it(`returns ${CONFIG.offer.size} ids from ${CONFIG.offer.size} distinct categories (~200 seeds)`, () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const offer = rollBoonOffer(mulberry32(seed));
      expect(offer).toHaveLength(CONFIG.offer.size);
      expect(new Set(offer.map(catOf)).size).toBe(CONFIG.offer.size); // distinct categories
      for (const id of offer) expect(Object.hasOwn(BOON_CATALOG, id)).toBe(true);
    }
  });

  it('never repeats an id inside one offer (distinct categories implies distinct ids)', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const offer = rollBoonOffer(mulberry32(seed));
      expect(new Set(offer).size).toBe(offer.length);
    }
  });

  it('is deterministic — same seed yields the same offer (the reroll-proof foundation)', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      expect(rollBoonOffer(mulberry32(seed))).toEqual(rollBoonOffer(mulberry32(seed)));
    }
  });

  it('advances the stream: consecutive rolls off ONE rng are not all identical', () => {
    const rng = mulberry32(7);
    const rolls = Array.from({ length: 8 }, () => rollBoonOffer(rng).join(','));
    expect(new Set(rolls).size).toBeGreaterThan(1);
  });

  it('covers every category and every catalog id over a long single stream', () => {
    const rng = mulberry32(12345);
    const cats = new Set<string>();
    const ids = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      for (const id of rollBoonOffer(rng)) {
        ids.add(id);
        cats.add(catOf(id));
      }
    }
    expect(cats.size).toBe(new Set(Object.values(BOON_CATALOG).map((d) => d.category)).size);
    expect(ids.size).toBe(Object.keys(BOON_CATALOG).length);
  });
});

describe('rollBoonOffer — injected catalogs (fail-safe, never throws)', () => {
  it('rolls min(size, categoryCount): a 2-category catalog yields a 2-card offer', () => {
    const small = catalogOf([
      ['a1', 'alpha'],
      ['a2', 'alpha'],
      ['b1', 'beta'],
    ]);
    for (let seed = 0; seed < 60; seed += 1) {
      const offer = rollBoonOffer(mulberry32(seed), small);
      expect(offer).toHaveLength(2);
      expect(new Set(offer.map((id) => small[id].category)).size).toBe(2);
    }
  });

  it('an EMPTY catalog rolls an empty offer instead of throwing', () => {
    expect(rollBoonOffer(mulberry32(1), {})).toEqual([]);
  });

  it('a single-category catalog rolls a one-card offer', () => {
    const one = catalogOf([
      ['a1', 'alpha'],
      ['a2', 'alpha'],
    ]);
    const offer = rollBoonOffer(mulberry32(3), one);
    expect(offer).toHaveLength(1);
    expect(one[offer[0]]).toBeDefined();
  });

  it('never draws the same category twice, however many rolls', () => {
    const cat = catalogOf([
      ['a', 'alpha'],
      ['b', 'beta'],
      ['c', 'gamma'],
      ['d', 'delta'],
      ['e', 'epsilon'],
      ['f', 'zeta'],
    ]);
    for (let seed = 0; seed < 200; seed += 1) {
      const offer = rollBoonOffer(mulberry32(seed), cat);
      const cats = offer.map((id) => cat[id].category);
      expect(new Set(cats).size).toBe(cats.length);
    }
  });

  it('category order is CATALOG ITERATION order: reordering the same defs changes the roll', () => {
    const forward = catalogOf([
      ['a', 'alpha'],
      ['b', 'beta'],
      ['c', 'gamma'],
      ['d', 'delta'],
      ['e', 'epsilon'],
    ]);
    const reversed = catalogOf([
      ['e', 'epsilon'],
      ['d', 'delta'],
      ['c', 'gamma'],
      ['b', 'beta'],
      ['a', 'alpha'],
    ]);
    const rolls = (c: BoonCatalog): string[] =>
      Array.from({ length: 20 }, (_, s) => rollBoonOffer(mulberry32(s), c).join(','));
    expect(rolls(forward)).not.toEqual(rolls(reversed));
  });

  it('a catalog carrying an inherited-looking key is not offered from prototype pollution', () => {
    // Object.keys is own-enumerable only: a prototype-planted def can never be
    // rolled (the resolveBoons / hookKinematics hasOwn discipline, structurally).
    const proto = { constructor: { id: 'x', category: 'evil', effects: [] } } as unknown as BoonCatalog;
    expect(rollBoonOffer(mulberry32(1), Object.create(proto) as BoonCatalog)).toEqual([]);
  });
});
