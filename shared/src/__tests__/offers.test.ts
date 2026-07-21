// Upgrade offer rolls — the deterministic core of the spend economy. Four
// properties pin it: (1) UPGRADE_CATEGORIES partitions UPGRADE_IDS exactly (the
// guard that forces a future 15th upgrade to be categorized); (2) rollOffer
// returns three ids from three distinct categories; (3) it is deterministic per
// rng state; (4) over a long stream every category and every id shows up.

import { describe, it, expect } from 'vitest';
import {
  OFFER_EXCLUDED_IDS,
  UPGRADE_CATEGORIES,
  UPGRADE_CATEGORY_IDS,
  UPGRADE_IDS,
  categoryOf,
  mulberry32,
  offerableIds,
  rollOffer,
} from '../index.js';

describe('UPGRADE_CATEGORIES — exact partition of UPGRADE_IDS', () => {
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

describe('offer-candidate exclusion (Story 1.4 interregnum)', () => {
  it('gunAmmo is the only excluded id — kept on the wire, never offered', () => {
    expect(OFFER_EXCLUDED_IDS).toEqual(['gunAmmo']);
    expect(UPGRADE_IDS).toContain('gunAmmo'); // wire-order append-only: the id survives
  });

  it('the guns category offers exactly gunRange + gunReload', () => {
    expect(offerableIds('guns')).toEqual(['gunRange', 'gunReload']);
  });

  it('every other category offers its full membership', () => {
    for (const cat of UPGRADE_CATEGORY_IDS) {
      if (cat === 'guns') continue;
      expect(offerableIds(cat)).toEqual(UPGRADE_CATEGORIES[cat]);
    }
  });

  it('every category still has at least one offerable id', () => {
    for (const cat of UPGRADE_CATEGORY_IDS) {
      expect(offerableIds(cat).length).toBeGreaterThan(0);
    }
  });
});

describe('rollOffer', () => {
  it('returns 3 ids from 3 distinct categories (~200 seeds)', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const offer = rollOffer(mulberry32(seed));
      expect(offer).toHaveLength(3);
      const cats = offer.map(categoryOf);
      expect(new Set(cats).size).toBe(3); // distinct categories
      for (const id of offer) expect(UPGRADE_IDS).toContain(id);
    }
  });

  it('never offers an excluded id (gunAmmo) — ~200 seeds', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      for (const id of rollOffer(mulberry32(seed))) {
        expect(OFFER_EXCLUDED_IDS).not.toContain(id);
      }
    }
  });

  it('is deterministic — same seed yields the same offer', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      expect(rollOffer(mulberry32(seed))).toEqual(rollOffer(mulberry32(seed)));
    }
  });

  it('covers every category and every OFFERABLE id over a long single stream', () => {
    const rng = mulberry32(12345);
    const cats = new Set<string>();
    const ids = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      for (const id of rollOffer(rng)) {
        ids.add(id);
        cats.add(categoryOf(id));
      }
    }
    expect(cats.size).toBe(UPGRADE_CATEGORY_IDS.length); // all 5 categories
    expect(ids.size).toBe(UPGRADE_IDS.length - OFFER_EXCLUDED_IDS.length); // all 13 offerable ids
    expect(ids.has('gunAmmo')).toBe(false); // the excluded id never shows up
  });
});

describe('categoryOf', () => {
  it('round-trips every id back to the category that lists it', () => {
    for (const cat of UPGRADE_CATEGORY_IDS) {
      for (const id of UPGRADE_CATEGORIES[cat]) expect(categoryOf(id)).toBe(cat);
    }
  });
});
