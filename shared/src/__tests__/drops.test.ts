// THE AIRDROPS' pure model (Story 10.9, sim/drops.ts) and the crate's radar
// imprint (radarRaster `paintDiscCoverage`). Every expectation is written
// through CONFIG.drops / CONFIG.vision — the mechanism follows the dials,
// whatever Eric sets them to; no shipped number is pinned as a literal.
import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  coverageCellCount,
  coverageHas,
  dropCountFor,
  dropMinuteAt,
  dropTouches,
  isDropRoll,
  mulberry32,
  paintDiscCoverage,
  rasterizeDiscCoverage,
  rollBundle,
  rollDrop,
  totalDropCount,
  type DropConfig,
  type DropPickupEvent,
  type DropView,
  type FrameMsg,
  type GameEvent,
  type Rng,
} from '../index.js';

const D = CONFIG.drops;
const CELL = CONFIG.vision.radarCellU;

describe('dropCountFor — the count law', () => {
  it('scatters perMinuteRemaining × untilMinute at minute 0', () => {
    expect(dropCountFor(0)).toBe(D.perMinuteRemaining * D.untilMinute);
  });

  it('is zero at and after untilMinute', () => {
    for (let m = D.untilMinute; m < D.untilMinute + 5; m++) expect(dropCountFor(m)).toBe(0);
  });

  it('is monotone non-increasing over the match and positive before untilMinute', () => {
    for (let m = 0; m < D.untilMinute + 3; m++) {
      expect(dropCountFor(m + 1)).toBeLessThanOrEqual(dropCountFor(m));
      if (m < D.untilMinute) expect(dropCountFor(m)).toBeGreaterThan(0);
    }
  });

  it('answers 0 for a negative, fractional or non-finite minute', () => {
    for (const m of [-1, -0.5, 0.5, NaN, Infinity, -Infinity]) expect(dropCountFor(m)).toBe(0);
  });

  it('follows the dials it is handed', () => {
    const cfg: DropConfig = { ...D, perMinuteRemaining: 3, untilMinute: 4 };
    expect([0, 1, 2, 3, 4].map((m) => dropCountFor(m, cfg))).toEqual([12, 9, 6, 3, 0]);
  });

  it('totalDropCount is the sum of the law over [0, untilMinute)', () => {
    let sum = 0;
    for (let m = 0; m < D.untilMinute; m++) sum += dropCountFor(m);
    expect(totalDropCount()).toBe(sum);
    // nothing past untilMinute adds to it
    let wide = 0;
    for (let m = 0; m < D.untilMinute * 3; m++) wide += dropCountFor(m);
    expect(totalDropCount()).toBe(wide);
  });
});

describe('dropMinuteAt — the zone clock in minutes', () => {
  const BEAT = CONFIG.zone.beatMs;
  it('floors the elapsed zone time by the beat', () => {
    expect(dropMinuteAt(1000, 1000, BEAT)).toBe(0);
    expect(dropMinuteAt(1000 + BEAT - 1, 1000, BEAT)).toBe(0);
    expect(dropMinuteAt(1000 + BEAT, 1000, BEAT)).toBe(1);
    expect(dropMinuteAt(1000 + 5 * BEAT + 7, 1000, BEAT)).toBe(5);
  });

  it('is -1 before the zone starts or on a non-finite / degenerate input', () => {
    expect(dropMinuteAt(999, 1000, BEAT)).toBe(-1);
    expect(dropMinuteAt(NaN, 1000, BEAT)).toBe(-1);
    expect(dropMinuteAt(5000, Infinity, BEAT)).toBe(-1);
    expect(dropMinuteAt(5000, 1000, 0)).toBe(-1);
    expect(dropMinuteAt(5000, 1000, -BEAT)).toBe(-1);
    expect(dropMinuteAt(5000, 1000, NaN)).toBe(-1);
  });
});

describe('rollDrop / rollBundle — the roll law', () => {
  it('every stat is one of cfg.indices and every amount an integer in [bonusMin, bonusMax], both bounds reached', () => {
    const rng = mulberry32(0xd509);
    const stats = new Set<string>();
    const amounts = new Set<number>();
    for (let i = 0; i < 4000; i++) {
      const [stat, n] = rollDrop(rng);
      expect(D.indices).toContain(stat);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(D.bonusMin);
      expect(n).toBeLessThanOrEqual(D.bonusMax);
      stats.add(stat);
      amounts.add(n);
    }
    expect(stats.size).toBe(D.indices.length);
    expect(amounts.has(D.bonusMin)).toBe(true);
    expect(amounts.has(D.bonusMax)).toBe(true);
  });

  it('spends exactly two rng.next() draws per roll, stat first', () => {
    const draws = [0.999999, 0];
    let calls = 0;
    const stub: Rng = {
      next: () => draws[calls++ % draws.length],
      float: () => {
        throw new Error('rollDrop must spend next() only');
      },
      int: () => {
        throw new Error('rollDrop must spend next() only');
      },
      pick: () => {
        throw new Error('rollDrop must spend next() only');
      },
    };
    expect(rollDrop(stub)).toEqual([D.indices[D.indices.length - 1], D.bonusMin]);
    expect(calls).toBe(2);
    // an rng returning exactly 1 (a stub; mulberry32 never does) stays in bounds
    const ones: Rng = { ...stub, next: () => 1 };
    expect(rollDrop(ones)).toEqual([D.indices[D.indices.length - 1], D.bonusMax]);
  });

  it('is deterministic: the same seed rolls the same sequence', () => {
    expect(rollBundle(mulberry32(42), 50)).toEqual(rollBundle(mulberry32(42), 50));
  });

  it('rollBundle(n) is n independent rollDrops in turn, and nothing for a non-positive or fractional n', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const bundle = rollBundle(a, D.wreckRolls);
    expect(bundle).toHaveLength(D.wreckRolls);
    expect(bundle).toEqual(Array.from({ length: D.wreckRolls }, () => rollDrop(b)));
    for (const n of [0, -1, 1.5, NaN]) expect(rollBundle(mulberry32(7), n)).toEqual([]);
  });
});

describe('dropTouches — the pickup test (R4)', () => {
  // a 20 u square hull centred on the origin
  const SQUARE = [
    { x: -10, y: -10 },
    { x: 10, y: -10 },
    { x: 10, y: 10 },
    { x: -10, y: 10 },
  ];
  const R = D.radiusU;
  it('touches when the drop centre is inside the hull', () => {
    expect(dropTouches({ x: 3, y: -2 }, SQUARE, R)).toBe(true);
  });
  it('touches exactly at radiusU from an edge (inclusive)', () => {
    expect(dropTouches({ x: 10 + R, y: 0 }, SQUARE, R)).toBe(true);
  });
  it('does not touch just beyond radiusU', () => {
    expect(dropTouches({ x: 10 + R + 0.01, y: 0 }, SQUARE, R)).toBe(false);
    // off a corner, the distance is Euclidean, not per-axis
    const d = R / Math.SQRT2;
    expect(dropTouches({ x: 10 + d + 0.5, y: 10 + d + 0.5 }, SQUARE, R)).toBe(false);
  });
});

describe('isDropRoll — the fail-closed ingest gate', () => {
  const stat = D.indices[0];
  it('accepts a known stat with a positive integer amount', () => {
    expect(isDropRoll([stat, 1])).toBe(true);
    expect(isDropRoll([stat, D.bonusMax])).toBe(true);
  });
  it('rejects an unknown stat, a bad amount, or a non-tuple', () => {
    const bad: unknown[] = [
      ['hullRepair', 1],
      [stat, 0],
      [stat, -2],
      [stat, 1.5],
      [stat, NaN],
      [stat, Infinity],
      [stat, '3'],
      [stat],
      [stat, 1, 2],
      { 0: stat, 1: 1, length: 2 },
      null,
      undefined,
      'armor',
      3,
    ];
    for (const v of bad) expect(isDropRoll(v)).toBe(false);
  });
  it('reads the stat list it is handed', () => {
    expect(isDropRoll([stat, 1], [])).toBe(false);
  });
});

describe('paintDiscCoverage — the crate imprint on the radar grid', () => {
  it('is deterministic for a fixed paint time', () => {
    expect(paintDiscCoverage(123.4, -56.7, D.radiusU, CELL, 5000)).toEqual(
      paintDiscCoverage(123.4, -56.7, D.radiusU, CELL, 5000),
    );
  });

  it('covers at least one cell, the crate cell included', () => {
    const x = 123.4;
    const y = -56.7;
    const c = paintDiscCoverage(x, y, D.radiusU, CELL, 5000);
    expect(coverageCellCount(c)).toBeGreaterThan(0);
    expect(coverageHas(c, Math.floor(x / CELL) - c.gx, Math.floor(y / CELL) - c.gy)).toBe(true);
  });

  it('a disc of radius ≥ a few cells covers more cells than one of radius ≤ half a cell', () => {
    for (const t of [0, 1000, 77_777]) {
      const small = paintDiscCoverage(400.5, 400.5, CELL / 2, CELL, t);
      const big = paintDiscCoverage(400.5, 400.5, 3 * CELL, CELL, t);
      expect(coverageCellCount(big)).toBeGreaterThan(coverageCellCount(small));
    }
  });

  it("the painted rect contains the disc's bounding box", () => {
    for (const [x, y, t] of [
      [0, 0, 0],
      [17.3, 4.4, 50],
      [-901.2, 333.9, 12_345],
    ]) {
      const c = paintDiscCoverage(x, y, D.radiusU, CELL, t);
      expect(c.gx).toBeLessThanOrEqual(Math.floor((x - D.radiusU) / CELL));
      expect(c.gy).toBeLessThanOrEqual(Math.floor((y - D.radiusU) / CELL));
      expect(c.gx + c.w - 1).toBeGreaterThanOrEqual(Math.floor((x + D.radiusU) / CELL));
      expect(c.gy + c.h - 1).toBeGreaterThanOrEqual(Math.floor((y + D.radiusU) / CELL));
    }
  });

  it('the sharp imprint lights exactly the cells the disc touches', () => {
    const x = 40.2;
    const y = 13.9;
    const r = D.radiusU;
    const c = rasterizeDiscCoverage(x, y, r, CELL);
    for (let row = 0; row < c.h; row++) {
      for (let col = 0; col < c.w; col++) {
        const x0 = (c.gx + col) * CELL;
        const y0 = (c.gy + row) * CELL;
        const nx = Math.max(x0, Math.min(x, x0 + CELL));
        const ny = Math.max(y0, Math.min(y, y0 + CELL));
        expect(coverageHas(c, col, row)).toBe(Math.hypot(nx - x, ny - y) <= r);
      }
    }
  });

  it('degrades to one cell on a non-finite centre, radius or lattice', () => {
    for (const c of [
      paintDiscCoverage(NaN, 0, D.radiusU, CELL, 0),
      rasterizeDiscCoverage(NaN, 0, D.radiusU, CELL),
      rasterizeDiscCoverage(5, 5, NaN, CELL),
      rasterizeDiscCoverage(5, 5, -1, CELL),
      rasterizeDiscCoverage(5, 5, D.radiusU, 0),
    ]) {
      expect(coverageCellCount(c)).toBeGreaterThan(0);
      expect(Number.isFinite(c.w * c.h)).toBe(true);
    }
    expect(coverageCellCount(rasterizeDiscCoverage(NaN, 0, D.radiusU, CELL))).toBe(1);
  });
});

describe('the wire types', () => {
  it('a FrameMsg without drops and a dp GameEvent type-check', () => {
    const frame: FrameMsg = { t: 0, tick: 0, ackSeq: 0, contacts: [], events: [], mines: [] };
    const view: DropView = { id: 'd1', x: 1, y: 2, g: [[D.indices[0], 3]] };
    const withDrops: FrameMsg = { ...frame, drops: [view] };
    const dp: DropPickupEvent = { k: 'dp', id: 's1', t: 10, g: view.g };
    const ev: GameEvent = dp;
    expect(frame.drops).toBeUndefined();
    expect(withDrops.drops).toHaveLength(1);
    expect(ev.k).toBe('dp');
  });
});
