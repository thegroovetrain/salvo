// The client's radio-beacon derivation (sim/beaconView.ts, Story 10.8): the
// polled schema's public facts → this frame's live beacons through the SHARED
// lifecycle, with the zoneViewFrom-style stale-boundary care; and the
// immovable contact bodies the predictor pushes the own hull against. Every
// timing is read from CONFIG — no number of Eric's is pinned here.

import { describe, expect, it } from 'vitest';
import { CONFIG, beaconCycleStartMs, beaconPolygon, beaconStateAt, zoneGroupMs } from '@salvo/shared';
import { BEACON_SLOTS, BeaconBodies, beaconViewsFrom, isBeaconBodyId, type BeaconPlane } from '../sim/beaconView.js';
import { ContactBodies } from '../sim/contactBodies.js';
import { ContactStore } from '../net/snapshots.js';

const B = CONFIG.beacons;
const ZONE_START = 1_000_000;

/** A schema with `n` live slots of cycle `cycle` (slot i at (100 i, -50 i)). */
function plane(cycle: number, n: number, extra: Record<string, number> = {}): BeaconPlane {
  const s: Record<string, number> = { zoneStartT: ZONE_START, beaconCycle: cycle, beaconCount: n };
  for (let i = 0; i < BEACON_SLOTS; i++) {
    s[`bcn${i}X`] = 100 * i;
    s[`bcn${i}Y`] = -50 * i;
    s[`bcn${i}SinkT`] = 0;
  }
  return { ...s, ...extra } as BeaconPlane;
}

/** ms into cycle `cycle` at `offset` from its start. */
function at(cycle: number, offset: number): number {
  return beaconCycleStartMs(ZONE_START, cycle) + offset;
}

const AFLOAT = B.surfaceMs + B.floatMs / 2;

describe('beaconViewsFrom — the live set', () => {
  it('returns exactly the live slots, with the shared lifecycle state', () => {
    const now = at(1, AFLOAT);
    const views = beaconViewsFrom(plane(1, 3), now);
    expect(views.map((v) => v.slot)).toEqual([0, 1, 2]);
    const st = beaconStateAt(now, at(1, 0), 0);
    for (const v of views) {
      expect(v).toMatchObject({ x: 100 * v.slot, y: -50 * v.slot, phase: st.phase, rate01: st.rate01, sink01: st.sink01, sinkT: 0 });
    }
  });

  it('walks charted → afloat → sinking on the cycle clock, and drops a gone beacon', () => {
    const phase = (offset: number): string[] => beaconViewsFrom(plane(0, 1), at(0, offset)).map((v) => v.phase);
    expect(phase(0)).toEqual(['charted']);
    expect(phase(AFLOAT)).toEqual(['afloat']);
    expect(phase(B.surfaceMs + B.floatMs + B.sinkMs / 2)).toEqual(['sinking']);
    expect(phase(B.surfaceMs + B.floatMs + B.sinkMs)).toEqual([]);
  });

  it('gates on the count: stale slots at or past beaconCount are never read', () => {
    const s = plane(0, 2, { bcn2X: Number.NaN });
    expect(beaconViewsFrom(s, at(0, AFLOAT)).map((v) => v.slot)).toEqual([0, 1]);
    expect(beaconViewsFrom(plane(0, 0), at(0, AFLOAT))).toEqual([]);
  });

  it('clamps a count past the wire to the slot count', () => {
    expect(beaconViewsFrom(plane(0, BEACON_SLOTS + 5), at(0, AFLOAT))).toHaveLength(BEACON_SLOTS);
  });

  it('an early sink stamp sinks that beacon early (public, R9), the others keep the natural schedule', () => {
    const sinkT = at(0, B.surfaceMs + B.floatMs / 4);
    const now = sinkT + B.sinkMs / 2;
    const views = beaconViewsFrom(plane(0, 2, { bcn1SinkT: sinkT }), now);
    expect(views.find((v) => v.slot === 0)!.phase).toBe('afloat');
    const early = views.find((v) => v.slot === 1)!;
    expect(early).toMatchObject({ phase: 'sinking', sinkT });
    expect(early.sink01).toBeCloseTo(beaconStateAt(now, at(0, 0), sinkT).sink01, 9);
  });
});

describe('beaconViewsFrom — the stale boundary and missing fields', () => {
  it('an older server (no beacon fields at all) yields an empty list', () => {
    expect(beaconViewsFrom({ zoneStartT: ZONE_START } as BeaconPlane, at(0, AFLOAT))).toEqual([]);
    expect(beaconViewsFrom({} as BeaconPlane, at(0, AFLOAT))).toEqual([]);
  });

  it('no set (cycle -1), a malformed cycle or count, or no zone clock yields an empty list', () => {
    const now = at(0, AFLOAT);
    expect(beaconViewsFrom(plane(-1, 3), now)).toEqual([]);
    expect(beaconViewsFrom(plane(0.5, 3), now)).toEqual([]);
    expect(beaconViewsFrom(plane(0, 2.5), now)).toEqual([]);
    expect(beaconViewsFrom(plane(0, 3, { zoneStartT: 0 }), now)).toEqual([]);
  });

  it('a set whose cycle the zone clock has already left does not render (the patch has not landed yet)', () => {
    const s = plane(0, 3);
    expect(beaconViewsFrom(s, ZONE_START + zoneGroupMs() + 1)).toEqual([]);
  });

  it('a slot with a missing or non-finite coordinate is dropped, never a NaN sprite', () => {
    const views = beaconViewsFrom(plane(0, 3, { bcn0X: Number.NaN, bcn1Y: Number.POSITIVE_INFINITY }), at(0, AFLOAT));
    expect(views.map((v) => v.slot)).toEqual([2]);
    const missing = plane(0, 2) as unknown as Record<string, unknown>;
    delete missing.bcn1Y;
    expect(beaconViewsFrom(missing as BeaconPlane, at(0, AFLOAT)).map((v) => v.slot)).toEqual([0]);
  });

  it('a missing or non-finite sink stamp reads as the natural schedule', () => {
    const s = plane(0, 1, { bcn0SinkT: Number.NaN });
    expect(beaconViewsFrom(s, at(0, AFLOAT))[0]).toMatchObject({ phase: 'afloat', sinkT: 0 });
  });

  it('reuses the caller-owned output array and its view objects', () => {
    const out = beaconViewsFrom(plane(0, 3), at(0, AFLOAT));
    const first = out[0];
    expect(beaconViewsFrom(plane(0, 2), at(0, AFLOAT), out)).toBe(out);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(first);
  });
});

describe('BeaconBodies — the solid beacons in the hull pass', () => {
  it('a solid beacon (afloat or sinking) is one immovable body: the shared octagon, mass = its ARMOR', () => {
    const afloat = beaconViewsFrom(plane(0, 1), at(0, AFLOAT));
    const sinking = beaconViewsFrom(plane(1, 1), at(1, B.surfaceMs + B.floatMs + B.sinkMs / 2));
    for (const views of [afloat, sinking]) {
      const bodies = new BeaconBodies().build(views);
      expect(bodies).toHaveLength(1);
      const b = bodies[0];
      expect(b.movable).toBe(false);
      expect(b.mass).toBe(B.armor);
      expect(b.state).toMatchObject({ x: views[0].x, y: views[0].y });
      expect(b.poly).toEqual(beaconPolygon(views[0].x, views[0].y));
      expect(isBeaconBodyId(b.id)).toBe(true);
    }
  });

  it('a charted beacon is not a body (nothing in the water yet)', () => {
    expect(new BeaconBodies().build(beaconViewsFrom(plane(0, 3), at(0, 0)))).toEqual([]);
  });

  it('a gone beacon is not a body', () => {
    expect(new BeaconBodies().build(beaconViewsFrom(plane(0, 3), at(0, B.surfaceMs + B.floatMs + B.sinkMs)))).toEqual([]);
  });

  it('ContactBodies appends the beacon bodies after the sighted contacts', () => {
    const beacons = new BeaconBodies().build(beaconViewsFrom(plane(0, 2), at(0, AFLOAT)));
    const store = new ContactStore();
    store.pushFrame(1000, [{ id: 'a', x: 0, y: 0, heading: 0, speed: 0, cls: 'bismarck' }]);
    const ids = new ContactBodies().build(store, 1000, 'me', beacons).map((b) => b.id);
    expect(ids[0]).toBe('a');
    expect(ids.slice(1)).toEqual(beacons.map((b) => b.id));
  });

  it('a beacon body id never reads as a contact hull id', () => {
    expect(isBeaconBodyId('a')).toBe(false);
  });
});
