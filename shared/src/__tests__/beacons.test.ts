// THE RADIO BEACONS' pure model (Story 10.8, sim/beacons.ts). Every
// expectation is written through CONFIG.beacons / CONFIG.zone / CONFIG.xp —
// the mechanism follows the dials, whatever Eric sets them to.
import { describe, it, expect, vi } from 'vitest';
import {
  CONFIG,
  beaconCountFor,
  beaconCycleAt,
  beaconCycleStartMs,
  beaconHittable,
  beaconInRange,
  beaconPolygon,
  beaconSinkStartMs,
  beaconSolid,
  beaconStateAt,
  beaconXpMsPerMs,
  splitBeaconPot,
  zoneGroupMs,
  type BeaconPhase,
} from '../index.js';
import { polygonArea } from '../sim/silhouette.js';

const B = CONFIG.beacons;
const START = 7_000; // an arbitrary cycle start (ms)
const SURFACE = START + B.surfaceMs;
const NATURAL_SINK = SURFACE + B.floatMs;
const NATURAL_GONE = NATURAL_SINK + B.sinkMs;

describe('beaconCountFor', () => {
  it('reads counts[cycle] for every listed cycle and 0 past the list or before it', () => {
    B.counts.forEach((n, c) => expect(beaconCountFor(c)).toBe(n));
    expect(beaconCountFor(B.counts.length)).toBe(0);
    expect(beaconCountFor(-1)).toBe(0);
    expect(beaconCountFor(0.5)).toBe(0);
    expect(beaconCountFor(Number.NaN)).toBe(0);
  });

  it('a malformed entry places nothing', () => {
    const cfg = { ...B, counts: [Number.NaN, -3] };
    expect(beaconCountFor(0, cfg)).toBe(0);
    expect(beaconCountFor(1, cfg)).toBe(0);
  });
});

describe('beaconCycleAt / beaconCycleStartMs — the zone ring-group clock', () => {
  const g = zoneGroupMs(CONFIG.zone);
  const z0 = 3_000;

  it('the cycle is the ring group; each cycle starts where the last ended', () => {
    expect(g).toBeGreaterThan(0);
    for (let c = 0; c <= B.counts.length; c++) {
      const s = beaconCycleStartMs(z0, c);
      expect(s).toBe(z0 + c * g);
      expect(beaconCycleAt(s, z0)).toBe(c);
      expect(beaconCycleAt(s + g - 1, z0)).toBe(c);
    }
  });

  it('-1 before the zone starts, on a non-finite clock or a degenerate timeline', () => {
    expect(beaconCycleAt(z0 - 1, z0)).toBe(-1);
    expect(beaconCycleAt(Number.NaN, z0)).toBe(-1);
    const broken = { ...CONFIG.zone, beatMs: 0 };
    expect(beaconCycleAt(z0 + g, z0, broken)).toBe(-1);
    expect(beaconCycleStartMs(z0, 0, broken)).toBe(Number.POSITIVE_INFINITY);
    expect(beaconCycleStartMs(z0, -1)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('beaconStateAt — the lifecycle (R3, R6)', () => {
  const at = (t: number, sinkT = 0) => beaconStateAt(t, START, sinkT);

  it('charted until the surface instant, afloat at it, paying nothing before', () => {
    expect(at(START)).toEqual({ phase: 'charted', rate01: 0, sink01: 0 });
    expect(at(SURFACE - 1).phase).toBe('charted');
    expect(at(SURFACE)).toEqual({ phase: 'afloat', rate01: 1, sink01: 0 });
    expect(at(NATURAL_SINK - 1)).toEqual({ phase: 'afloat', rate01: 1, sink01: 0 });
  });

  it('sinks from the natural sink start, the rate falling linearly to 0, then gone', () => {
    expect(at(NATURAL_SINK)).toEqual({ phase: 'sinking', rate01: 1, sink01: 0 });
    const mid = at(NATURAL_SINK + B.sinkMs / 2);
    expect(mid.phase).toBe('sinking');
    expect(mid.rate01).toBeCloseTo(0.5, 12);
    expect(mid.sink01).toBeCloseTo(0.5, 12);
    const q = at(NATURAL_SINK + B.sinkMs / 4);
    expect(q.rate01).toBeCloseTo(0.75, 12);
    expect(q.rate01 + q.sink01).toBeCloseTo(1, 12);
    expect(at(NATURAL_GONE)).toEqual({ phase: 'gone', rate01: 0, sink01: 1 });
  });

  it('an early sink stamp during the float shifts the whole sinking window earlier', () => {
    const early = SURFACE + B.floatMs / 3;
    expect(beaconSinkStartMs(START, early)).toBe(early);
    expect(at(early - 1, early).phase).toBe('afloat');
    expect(at(early, early)).toEqual({ phase: 'sinking', rate01: 1, sink01: 0 });
    expect(at(early + B.sinkMs / 2, early).rate01).toBeCloseTo(0.5, 12);
    expect(at(early + B.sinkMs, early).phase).toBe('gone');
    // Destroyed on the very tick it surfaced: it never pays a full-rate tick.
    expect(at(SURFACE, SURFACE).phase).toBe('sinking');
  });

  it('a stamp that is absent, non-finite, pre-surface or not earlier than natural reads as natural', () => {
    for (const sinkT of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, SURFACE - 1, NATURAL_SINK, NATURAL_GONE]) {
      expect(beaconSinkStartMs(START, sinkT), String(sinkT)).toBe(NATURAL_SINK);
    }
  });

  it('a non-positive sinkMs sinks instantly; a never-starting cycle stays charted', () => {
    expect(beaconStateAt(NATURAL_SINK, START, 0, { ...B, sinkMs: 0 }).phase).toBe('gone');
    expect(beaconStateAt(1e12, Number.POSITIVE_INFINITY, 0).phase).toBe('charted');
  });
});

describe('beaconXpMsPerMs — the rate (R4)', () => {
  it('pays levelsPerMin levels per minute at the full rate, scaled by rate01', () => {
    const minute = 60_000;
    expect(beaconXpMsPerMs(1) * minute).toBeCloseTo(B.levelsPerMin * CONFIG.xp.levelMs, 9);
    expect(beaconXpMsPerMs(0.5)).toBeCloseTo(beaconXpMsPerMs(1) / 2, 12);
  });

  it('pays nothing at or below 0 or on garbage, and never more than full', () => {
    expect(beaconXpMsPerMs(0)).toBe(0);
    expect(beaconXpMsPerMs(-1)).toBe(0);
    expect(beaconXpMsPerMs(Number.NaN)).toBe(0);
    expect(beaconXpMsPerMs(2)).toBe(beaconXpMsPerMs(1));
  });

  it('a natural life pays float + half the sink at the full rate (the linear fall integrates)', () => {
    const dt = CONFIG.tick.simDtMs;
    let pot = 0;
    for (let t = START; t < NATURAL_GONE + dt; t += dt) pot += beaconXpMsPerMs(beaconStateAt(t, START, 0).rate01) * dt;
    const full = beaconXpMsPerMs(1);
    // Left-Riemann sum over the linear fall: within one full-rate tick of exact.
    expect(Math.abs(pot - full * (B.floatMs + B.sinkMs / 2))).toBeLessThanOrEqual(full * dt);
  });
});

describe('beaconHittable / beaconSolid (R6, R12)', () => {
  it('hittable afloat only; solid afloat and sinking', () => {
    const phases: BeaconPhase[] = ['charted', 'afloat', 'sinking', 'gone'];
    expect(phases.filter(beaconHittable)).toEqual(['afloat']);
    expect(phases.filter(beaconSolid)).toEqual(['afloat', 'sinking']);
  });
});

describe('beaconPolygon', () => {
  it('a CCW regular octagon of circumradius bodyRadiusU around the centre, written into out', () => {
    const out: { x: number; y: number }[] = [];
    const poly = beaconPolygon(100, -40, B, out);
    expect(poly).toBe(out);
    expect(poly).toHaveLength(8);
    for (const p of poly) expect(Math.hypot(p.x - 100, p.y + 40)).toBeCloseTo(B.bodyRadiusU, 12);
    expect(polygonArea(poly)).toBeGreaterThan(0); // CCW, the silhouettes' winding
    const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
    expect(cx).toBeCloseTo(100, 12);
    expect(cy).toBeCloseTo(-40, 12);
    // Reuse keeps the same vertex objects.
    const first = poly[0];
    beaconPolygon(0, 0, B, out);
    expect(out[0]).toBe(first);
  });
});

describe('splitBeaconPot — integer shares, carried remainder', () => {
  it('conserves the pot exactly over a sweep: share × n + carry === pot', () => {
    for (let n = 1; n <= 17; n++) {
      for (const pot of [0.25, 1, 7, 149.5, 150, 1001, 12345.75]) {
        const { shareMs, carryMs } = splitBeaconPot(pot, n);
        expect(Number.isInteger(shareMs)).toBe(true);
        expect(shareMs * n + carryMs).toBeCloseTo(pot, 9);
        expect(carryMs).toBeGreaterThanOrEqual(0);
        expect(carryMs).toBeLessThan(n);
      }
    }
  });

  it('an empty circle pays nothing and carries nothing; garbage pays nothing', () => {
    expect(splitBeaconPot(500, 0)).toEqual({ shareMs: 0, carryMs: 0 });
    expect(splitBeaconPot(500, -2)).toEqual({ shareMs: 0, carryMs: 0 });
    expect(splitBeaconPot(500, Number.POSITIVE_INFINITY)).toEqual({ shareMs: 0, carryMs: 0 });
    expect(splitBeaconPot(Number.NaN, 3)).toEqual({ shareMs: 0, carryMs: 0 });
    expect(splitBeaconPot(0, 3)).toEqual({ shareMs: 0, carryMs: 0 });
  });
});

describe('beaconInRange', () => {
  it('inclusive at exactly rangeU, out just past it, in any direction', () => {
    const r = B.rangeU;
    expect(beaconInRange(10, 20, 10 + r, 20)).toBe(true);
    expect(beaconInRange(10, 20, 10, 20 - r)).toBe(true);
    expect(beaconInRange(10, 20, 10 + r + 1e-6, 20)).toBe(false);
    expect(beaconInRange(0, 0, (r * 3) / 5, (r * 4) / 5)).toBe(true);
  });
});

describe('BEACON_WIRE_SLOTS — the wire capacity guard', () => {
  it('a CONFIG asking for more beacons in a cycle than the wire carries fails at module load', async () => {
    const real = await import('../constants.js');
    const { BEACON_WIRE_SLOTS } = await import('../sim/beacons.js');
    vi.resetModules();
    vi.doMock('../constants.js', () => ({
      ...real,
      CONFIG: { ...real.CONFIG, beacons: { ...real.CONFIG.beacons, counts: [BEACON_WIRE_SLOTS + 1] } },
    }));
    try {
      await expect(import('../sim/beacons.js')).rejects.toThrow(/BEACON_WIRE_SLOTS/);
    } finally {
      vi.doUnmock('../constants.js');
      vi.resetModules();
    }
  });
});
