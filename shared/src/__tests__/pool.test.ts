// THE MATCH CONSUMABLE POOL (Story 8.11) — sim/pool.ts.
//
// Pinned here:
//   (1) the CANDIDATE SET is exactly the five catalog-v3 consumable lines in
//       LINE_IDS order, STUBS INCLUDED (Eric ruling 2026-09-18, epic-8
//       amendment 67) — `buildDeckState`'s `isDealable` is what keeps a stub
//       copy undealt, and the pool must never grow a second filter;
//   (2) the ROLL: `CONFIG.pool.size` ids, never a non-consumable line, no line
//       over its own `cap` WITHIN the pool (R44), deterministic per seed, and
//       exactly ONE rng.next() per card in the result;
//   (3) the EARLY STOP on a hand-built catalog whose lines run out of cap —
//       a shorter pool, never a retry and never a throw;
//   (4) `sanitizePool` — the structural guarantee that a dev `poolOverride` or
//       an injected fixture can never smuggle an equipment line into a deck.
//
// The 50-card economy the pool produces is MEASURED in poolMeasure.test.ts.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  LINE_IDS,
  consumableLines,
  mulberry32,
  rollMatchPool,
  sanitizePool,
  type Catalog,
  type CatalogLine,
  type LineId,
  type Rng,
} from '../index.js';

/** The SEVEN consumable lines catalog v3 authors, in LINE_IDS order. It was
 *  five until Story 8.13 (Eric rulings 2026-09-19, epic-8 amendments 74/83):
 *  `supercavTorpedo` MOVED here from the equipment id space and keeps its
 *  LINE_IDS slot, which is why it sorts BEFORE the rest; `depthCharge` is new
 *  and sits after the decoy. */
const SEVEN: readonly LineId[] = [
  'supercavTorpedo', 'hullRepair', 'shieldBlock', 'smokeScreen', 'chaff', 'decoyBuoy', 'depthCharge',
];

/** Count ids per line. */
function tally(ids: readonly LineId[]): Map<LineId, number> {
  const out = new Map<LineId, number>();
  for (const id of ids) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

/** An rng that counts how many values the roll actually spends. */
function countingRng(seed: number): { rng: Rng; calls: () => number } {
  const inner = mulberry32(seed);
  let n = 0;
  const rng: Rng = {
    next: () => {
      n += 1;
      return inner.next();
    },
    float: (min, max) => inner.float(min, max),
    int: (min, max) => inner.int(min, max),
    pick: (arr) => inner.pick(arr),
  };
  return { rng, calls: () => n };
}

/** A hand-built catalog row (real LINE_IDS keys — the candidate walk is over
 *  LINE_IDS, which IS the determinism contract's one ordering). */
const row = (id: LineId, kind: CatalogLine['kind'], cap: number): CatalogLine => ({
  id,
  kind,
  cap,
  tiers: new Array<readonly never[]>(cap).fill([]),
});

/** A frozen injectable catalog, built like the production one. */
function catalogOf(lines: readonly CatalogLine[]): Catalog {
  const out: Record<string, CatalogLine> = {};
  for (const l of lines) out[l.id] = Object.freeze(l);
  return Object.freeze(out);
}

describe('consumableLines — the candidate set (amendment 67: stubs INCLUDED)', () => {
  it('is exactly the seven consumable lines of catalog v3, in LINE_IDS order', () => {
    expect(consumableLines()).toEqual(SEVEN);
    expect(consumableLines(CATALOG)).toEqual(SEVEN);
  });

  it('is LINE_IDS order, not catalog-key order by accident, and holds no other kind', () => {
    const byLineIds = LINE_IDS.filter((id) => CATALOG[id].kind === 'consumable');
    expect(consumableLines()).toEqual(byLineIds);
    for (const id of consumableLines()) expect(CATALOG[id].kind).toBe('consumable');
  });

  it('INCLUDES the stub consumables — the deck builder, not the pool, keeps them undealt', () => {
    for (const id of ['shieldBlock', 'smokeScreen', 'chaff', 'decoyBuoy'] as const) {
      expect(CATALOG[id].stub, id).toBe(true); // still stubbed at 8.11
      expect(consumableLines(), id).toContain(id);
    }
  });

  it('a catalog with no consumable row yields an empty candidate set', () => {
    expect(consumableLines(catalogOf([row('armor', 'ladder', 4), row('missile', 'equipment', 5)])))
      .toEqual([]);
  });
});

describe('rollMatchPool — the match rolls ten hidden consumable cards (R4/R44, FR43)', () => {
  it('rolls exactly CONFIG.pool.size ids, every one of the seven consumable lines', () => {
    const pool = rollMatchPool(mulberry32(1));
    expect(pool).toHaveLength(CONFIG.pool.size);
    expect(CONFIG.pool.size).toBe(10);
    for (const id of pool) expect(SEVEN).toContain(id);
  });

  it('never rolls an equipment, ladder or add-on line, over 200 seeds', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      for (const id of rollMatchPool(mulberry32(seed))) {
        expect(CATALOG[id].kind, `seed ${seed}:${id}`).toBe('consumable');
      }
    }
  });

  it('holds no line beyond its OWN cap within the pool (R44), over 200 seeds', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      for (const [id, n] of tally(rollMatchPool(mulberry32(seed)))) {
        expect(n, `seed ${seed}:${id}`).toBeLessThanOrEqual(CATALOG[id].cap);
      }
    }
  });

  it('is DETERMINISTIC: the same seed rolls the same pool, card for card and in draw order', () => {
    for (const seed of [0, 7, 4242, 0xffffffff]) {
      expect(rollMatchPool(mulberry32(seed))).toEqual(rollMatchPool(mulberry32(seed)));
    }
  });

  it('is not a constant: 100 seeds roll at least two DIFFERENT pools', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed += 1) seen.add(rollMatchPool(mulberry32(seed)).join(','));
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it('costs exactly ONE rng.next() per card in the result', () => {
    const full = countingRng(3);
    expect(rollMatchPool(full.rng)).toHaveLength(CONFIG.pool.size);
    expect(full.calls()).toBe(CONFIG.pool.size);
    // ...and FEWER when the roll stops early: one cap-3 line spends three.
    const short = countingRng(3);
    const tiny = catalogOf([row('hullRepair', 'consumable', 3)]);
    expect(rollMatchPool(short.rng, tiny)).toHaveLength(3);
    expect(short.calls()).toBe(3);
  });

  it('returns a FROZEN list (nothing downstream may mutate a match-wide roll)', () => {
    const pool = rollMatchPool(mulberry32(5));
    expect(Object.isFrozen(pool)).toBe(true);
  });

  it('STOPS EARLY when every line is at cap — a shorter pool, never a retry', () => {
    const one = catalogOf([row('hullRepair', 'consumable', 3)]);
    expect(rollMatchPool(mulberry32(9), one)).toEqual(['hullRepair', 'hullRepair', 'hullRepair']);
    const two = catalogOf([row('hullRepair', 'consumable', 3), row('chaff', 'consumable', 3)]);
    const pool = rollMatchPool(mulberry32(9), two);
    expect(pool).toHaveLength(6);
    expect(tally(pool).get('hullRepair')).toBe(3);
    expect(tally(pool).get('chaff')).toBe(3);
  });

  it('a catalog with no consumable line rolls an EMPTY pool and spends no rng value', () => {
    const none = countingRng(1);
    const dry = catalogOf([row('armor', 'ladder', 4), row('missile', 'equipment', 5)]);
    expect(rollMatchPool(none.rng, dry)).toEqual([]);
    expect(none.calls()).toBe(0);
  });

  it('honours an injected size', () => {
    expect(rollMatchPool(mulberry32(2), CATALOG, { size: 3 })).toHaveLength(3);
    expect(rollMatchPool(mulberry32(2), CATALOG, { size: 0 })).toEqual([]);
  });

  it('with catalog v3 the early stop is UNREACHABLE at size 10 (7 lines × cap 5 = 35)', () => {
    // 25 until Story 8.13 took the consumable lines from five to seven (epic-8
    // amendments 74/83), which only widens the margin.
    const capacity = consumableLines().reduce((sum, id) => sum + CATALOG[id].cap, 0);
    expect(capacity).toBe(35);
    expect(capacity).toBeGreaterThanOrEqual(CONFIG.pool.size);
    for (let seed = 0; seed < 200; seed += 1) {
      expect(rollMatchPool(mulberry32(seed)), `seed ${seed}`).toHaveLength(CONFIG.pool.size);
    }
  });
});

describe('sanitizePool — an override can never smuggle a non-consumable line in', () => {
  it('keeps the consumable ids in the GIVEN order and drops equipment + unknown junk', () => {
    expect(sanitizePool(['hullRepair', 'deckGun', 'nope', 'chaff'])).toEqual(['hullRepair', 'chaff']);
  });

  it('drops every non-consumable KIND the catalog knows', () => {
    expect(sanitizePool(['armor', 'missile', 'dazzleShells', 'deckGunTurret', 'foulingMines'])).toEqual([]);
  });

  it('keeps DUPLICATES and applies no size clamp — an override is a deliberate list', () => {
    const many = new Array<string>(30).fill('hullRepair');
    expect(sanitizePool(many)).toHaveLength(30);
    expect(sanitizePool(['chaff', 'chaff', 'hullRepair'])).toEqual(['chaff', 'chaff', 'hullRepair']);
  });

  it('is fail-closed on prototype-shaped junk and returns a FROZEN list', () => {
    expect(sanitizePool(['__proto__', 'constructor', 'toString'])).toEqual([]);
    expect(Object.isFrozen(sanitizePool(['hullRepair']))).toBe(true);
    expect(sanitizePool([])).toEqual([]);
  });

  it('reads the INJECTED catalog, not the production one', () => {
    const swapped = catalogOf([row('armor', 'consumable', 2), row('hullRepair', 'ladder', 5)]);
    expect(sanitizePool(['armor', 'hullRepair'], swapped)).toEqual(['armor']);
  });
});
