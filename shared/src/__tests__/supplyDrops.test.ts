// THE SUPPLY DROPS' pure timing model (Story 12.4, epic-12 amendment 5;
// sim/supplyDrops.ts — ported from the radio beacons' cycle / count cases of
// Story 10.8). Every expectation is written through CONFIG.supplyDrops /
// CONFIG.zone — the mechanism follows the dials, whatever Eric sets them to.
import { describe, it, expect, vi } from 'vitest';
import {
  CONFIG,
  supplyCountFor,
  supplyCycleAt,
  supplyCycleStartMs,
  supplyDropLanded,
  supplyLandMs,
  zoneGroupMs,
} from '../index.js';

const S = CONFIG.supplyDrops;

describe('supplyCountFor', () => {
  it('reads counts[cycle] for every listed cycle and 0 past the list or before it', () => {
    S.counts.forEach((n, c) => expect(supplyCountFor(c)).toBe(n));
    expect(supplyCountFor(S.counts.length)).toBe(0);
    expect(supplyCountFor(-1)).toBe(0);
    expect(supplyCountFor(0.5)).toBe(0);
    expect(supplyCountFor(Number.NaN)).toBe(0);
  });

  it('a malformed entry places nothing', () => {
    const cfg = { ...S, counts: [Number.NaN, -3] };
    expect(supplyCountFor(0, cfg)).toBe(0);
    expect(supplyCountFor(1, cfg)).toBe(0);
  });
});

describe('supplyCycleAt / supplyCycleStartMs — the zone ring-group clock', () => {
  const g = zoneGroupMs(CONFIG.zone);
  const z0 = 3_000;

  it('the cycle is the ring group; each cycle starts where the last ended', () => {
    expect(g).toBeGreaterThan(0);
    for (let c = 0; c <= S.counts.length; c++) {
      const s = supplyCycleStartMs(z0, c);
      expect(s).toBe(z0 + c * g);
      expect(supplyCycleAt(s, z0)).toBe(c);
      expect(supplyCycleAt(s + g - 1, z0)).toBe(c);
    }
  });

  it('-1 before the zone starts, on a non-finite clock or a degenerate timeline', () => {
    expect(supplyCycleAt(z0 - 1, z0)).toBe(-1);
    expect(supplyCycleAt(Number.NaN, z0)).toBe(-1);
    const broken = { ...CONFIG.zone, beatMs: 0 };
    expect(supplyCycleAt(z0 + g, z0, broken)).toBe(-1);
    expect(supplyCycleStartMs(z0, 0, broken)).toBe(Number.POSITIVE_INFINITY);
    expect(supplyCycleStartMs(z0, -1)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('supplyLandMs / supplyDropLanded — charted, then landed', () => {
  const start = 7_000; // an arbitrary cycle start (ms)

  it('the crates land surfaceMs after the cycle start, landed AT that instant and after', () => {
    const land = supplyLandMs(start);
    expect(land).toBe(start + S.surfaceMs);
    expect(supplyDropLanded(land - 1, start)).toBe(false);
    expect(supplyDropLanded(land, start)).toBe(true);
    expect(supplyDropLanded(land + 1, start)).toBe(true);
  });

  it('follows a custom surfaceMs', () => {
    const cfg = { ...S, surfaceMs: S.surfaceMs * 2 + 1 };
    expect(supplyLandMs(start, cfg)).toBe(start + cfg.surfaceMs);
    expect(supplyDropLanded(start + cfg.surfaceMs - 1, start, cfg)).toBe(false);
    expect(supplyDropLanded(start + cfg.surfaceMs, start, cfg)).toBe(true);
  });

  it('never lands on a non-finite clock or a never-starting cycle', () => {
    expect(supplyDropLanded(Number.NaN, start)).toBe(false);
    expect(supplyDropLanded(1e15, supplyCycleStartMs(0, -1))).toBe(false);
  });
});

describe('SUPPLY_WIRE_SLOTS — the wire capacity guard', () => {
  it('a CONFIG asking for more spots in a cycle than the wire carries fails at module load', async () => {
    const real = await import('../constants.js');
    const { SUPPLY_WIRE_SLOTS } = await import('../sim/supplyDrops.js');
    vi.resetModules();
    vi.doMock('../constants.js', () => ({
      ...real,
      CONFIG: { ...real.CONFIG, supplyDrops: { ...real.CONFIG.supplyDrops, counts: [SUPPLY_WIRE_SLOTS + 1] } },
    }));
    try {
      await expect(import('../sim/supplyDrops.js')).rejects.toThrow(/SUPPLY_WIRE_SLOTS/);
    } finally {
      vi.doUnmock('../constants.js');
      vi.resetModules();
    }
  });
});
