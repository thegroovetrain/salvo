// Upgrade offer rolls — the deterministic core of the spend economy. Four
// properties pin it: (1) UPGRADE_CATEGORIES partitions UPGRADE_IDS exactly (the
// guard that forces a future 15th upgrade to be categorized); (2) rollOffer
// returns three ids from three distinct categories; (3) it is deterministic per
// rng state; (4) over a long stream every category and every id shows up.

import { describe, it, expect } from 'vitest';
import {
  UPGRADE_CATEGORIES,
  UPGRADE_CATEGORY_IDS,
  UPGRADE_IDS,
  categoryOf,
  mulberry32,
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

  it('is deterministic — same seed yields the same offer', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      expect(rollOffer(mulberry32(seed))).toEqual(rollOffer(mulberry32(seed)));
    }
  });

  it('covers every category and every id over a long single stream', () => {
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
    expect(ids.size).toBe(UPGRADE_IDS.length); // all 14 ids
  });
});

describe('categoryOf', () => {
  it('round-trips every id back to the category that lists it', () => {
    for (const cat of UPGRADE_CATEGORY_IDS) {
      for (const id of UPGRADE_CATEGORIES[cat]) expect(categoryOf(id)).toBe(cat);
    }
  });
});
