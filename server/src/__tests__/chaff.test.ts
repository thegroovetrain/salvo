// CHAFF (Story 8.16, catalog-v3 R39, epic-8 amendment 124(b)(c)).
//
// One copy puts a false-return SOURCE at the owner's position; for 15 s its
// server-generated fakes paint on every OTHER observer's radar through that
// observer's own blipGate, re-scattered once per the OWNER's sweep period and
// water-filtered (game/fakes.ts). The owner never receives them. This file pins
// the scatter contract, the row, and the emission end to end through
// perception.observe().

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  CONSUMABLE_SLOTS,
  blockedWater,
  mulberry32,
  paintCoverage,
  type BlipEvent,
  type ReturnBlipEvent,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { observe } from '../game/perception.js';
import { buildFrame } from '../game/frames.js';
import { FAKE_MAX_ATTEMPTS, fakeEpoch, scatterFakes, type Fake, type FakeSource } from '../game/fakes.js';
import { circleIsland, flatRaster } from './islandFixture.js';

const TAU = Math.PI * 2;
const BELT = CONSUMABLE_SLOTS[0];

function bareWorld(seed = 816): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster(2000);
  return w;
}

function place(w: World, id: string, x: number, y: number): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', undefined, undefined);
  rec.state = { x, y, heading: 0, speed: 0 };
  return rec;
}

/** Open (almost) the whole beam this tick, so every point in the annulus is
 *  "swept" — the test is about WHICH subjects paint, not about beam timing. */
function wideBeam(me: ShipRecord): void {
  me.prevSweepAngle = 0;
  me.sweepAngle = TAU - 1e-9;
}

/** A hand-built source (world-state setup, like injectMine's raw write). */
function source(w: World, x: number, y: number, seed = 0xc0ffee): FakeSource {
  return { x, y, radius: CONFIG.chaff.radius, count: CONFIG.chaff.count, until: w.now + CONFIG.chaff.durationMs, seed, at: w.now };
}

const blips = (evs: readonly { k: string }[]): ReturnBlipEvent[] => evs.filter((e): e is BlipEvent => e.k === 'blip') as ReturnBlipEvent[];
const maskKey = (b: { gx: number; gy: number; w: number; h: number; bits: readonly number[] }): string =>
  `${b.gx},${b.gy},${b.w},${b.h}:${b.bits.join(',')}`;
const fakeKey = (f: Fake, t: number): string => maskKey(paintCoverage(f.cls, f.x, f.y, f.heading, CONFIG.vision.radarCellU, t));

describe('CHAFF — the scatter contract (game/fakes.ts)', () => {
  it('is DETERMINISTIC in (seed, epoch, circle, islands, radius) and follows the documented four-draw order', () => {
    const a = scatterFakes(1234, 0, 100, -50, 120, 10, [], 2800);
    const b = scatterFakes(1234, 0, 100, -50, 120, 10, [], 2800);
    expect(a).toEqual(b);
    expect(a).toHaveLength(10); // open water: nothing rejected
    // The first fake, re-derived by hand from the contract.
    const rng = mulberry32((1234 ^ Math.imul(1, 0x9e3779b9)) >>> 0);
    const r = 120 * Math.sqrt(rng.next());
    const th = TAU * rng.next();
    rng.next(); // heading
    rng.next(); // class
    expect(a[0].x).toBeCloseTo(100 + Math.cos(th) * r, 12);
    expect(a[0].y).toBeCloseTo(-50 + Math.sin(th) * r, 12);
    for (const f of a) expect(Math.hypot(f.x - 100, f.y + 50)).toBeLessThanOrEqual(120 + 1e-9);
  });

  it('ON WATER ALWAYS: beside an island every fake is legal water, re-drawn up to 16 times, and FEWER than `count` is legal', () => {
    const isle = circleIsland(0, 0, 110);
    let sawShort = false;
    for (let seed = 1; seed <= 60; seed++) {
      const fakes = scatterFakes(seed, 0, 0, 0, 120, 10, [isle], 2800);
      expect(fakes.length).toBeLessThanOrEqual(10);
      for (const f of fakes) expect(blockedWater(f, [isle], 2800), `seed ${seed}`).toBe(false);
      if (fakes.length < 10) sawShort = true;
    }
    // Centred on a rock that covers ~84 % of the cloud, SOME fake somewhere
    // must exhaust its 16 attempts — the drop rule is real, not vacuous.
    expect(sawShort).toBe(true);
    expect(FAKE_MAX_ATTEMPTS).toBe(16);
    // Off the rim of the water disk too.
    for (const f of scatterFakes(7, 0, 2790, 0, 120, 10, [], 2800)) expect(Math.hypot(f.x, f.y)).toBeLessThanOrEqual(2800);
  });

  it('WITHOUT the filter the same seed WOULD land on the rock (the rejection is doing the work)', () => {
    const isle = circleIsland(0, 0, 110);
    const open = scatterFakes(3, 0, 0, 0, 120, 10, [], 2800);
    expect(open.some((f) => blockedWater(f, [isle], 2800))).toBe(true);
  });

  it('the EPOCH is time over the OWNER\'s sweep period, and a new epoch is a new scatter', () => {
    const src: FakeSource = { x: 0, y: 0, radius: 120, count: 10, until: 99_999, seed: 42, at: 1000 };
    expect(fakeEpoch(src, 1000, 4000)).toBe(0);
    expect(fakeEpoch(src, 4999, 4000)).toBe(0);
    expect(fakeEpoch(src, 5000, 4000)).toBe(1);
    expect(fakeEpoch(src, 5000, 2000)).toBe(2); // a faster sweep rescatters sooner
    expect(scatterFakes(42, 0, 0, 0, 120, 10, [], 2800)).not.toEqual(scatterFakes(42, 1, 0, 0, 120, 10, [], 2800));
  });
});

describe('CHAFF — the row (Story 8.16)', () => {
  it('a press puts a source at the OWNER\'s position (fresh seed, 15 s) and spends one copy; a second REPLACES it', () => {
    const w = bareWorld();
    const a = place(w, 'a', 120, -40);
    w.applyCard(a, 'chaff');
    w.applyCard(a, 'chaff');
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: true });
    const first = a.chaff!;
    expect(first).toEqual({
      x: 120, y: -40, radius: CONFIG.chaff.radius, count: CONFIG.chaff.count,
      until: w.now + CONFIG.chaff.durationMs, seed: first.seed, at: w.now,
    });
    expect(Number.isInteger(first.seed)).toBe(true);
    expect(a.loadout[BELT].state).toEqual({ n: 1, reloadMsLeft: 0 });
    // Sail on, press again: a FRESH source at the NEW position replaces it.
    for (let i = 0; i < 3; i++) w.step();
    a.state.x = 300;
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: true });
    expect(a.chaff).not.toBe(first);
    expect(a.chaff!.x).toBe(300);
    expect(a.chaff!.at).toBe(w.now);
    expect(a.chaff!.until).toBe(w.now + CONFIG.chaff.durationMs);
    expect(a.chaff!.seed).not.toBe(first.seed);
    expect(a.loadout[BELT]).toEqual({ equipmentId: null, state: null });
  });

  it('a SINKING hull is refused (blocked), nothing spent; a sunk hull loses its source', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyCard(a, 'chaff');
    a.chaff = source(w, 0, 0);
    w.sinkShip('a', 'b');
    expect(a.chaff).toBeNull(); // the life boundary nulls it
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: false, reason: 'blocked' });
    expect(a.loadout[BELT].state).toEqual({ n: 1, reloadMsLeft: 0 });
  });

  it('nothing about chaff ever rides a frame — not the owner\'s, not anyone\'s', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    a.chaff = source(w, 0, 0);
    for (const id of ['a', 'b']) {
      const f = buildFrame(w, id);
      expect(JSON.stringify({ ...f, you: { ...f.you, offer: [], cards: [] } })).not.toContain('chaff');
    }
  });
});

describe('CHAFF — emission through perception.observe()', () => {
  /** Owner far away; the cloud at (500, 0); observers at the origin and at
   *  (1000, 0), both with the cloud inside their radar annulus. */
  function board(): { w: World; o: ShipRecord; a: ShipRecord; c: ShipRecord; fakes: Fake[] } {
    const w = bareWorld();
    const o = place(w, 'o', 500, 500); // the OWNER: the cloud is in ITS annulus too
    const a = place(w, 'a', 0, 0);
    const c = place(w, 'c', 1000, 0);
    for (const s of [o, a, c]) wideBeam(s);
    o.chaff = source(w, 500, 0);
    const fakes = scatterFakes(o.chaff.seed, fakeEpoch(o.chaff, w.now, o.stats.sweepPeriodMs), 500, 0, 120, 10, w.map.islands, w.map.radius);
    return { w, o, a, c, fakes };
  }

  it('every gated fake paints ONE untagged blip shaped like a real hull, IDENTICAL for every observer', () => {
    const { w, a, c, fakes } = board();
    const want = new Set(fakes.map((f) => fakeKey(f, w.now)));
    const ka = blips(observe(w, a.id).events).map(maskKey);
    const kc = blips(observe(w, c.id).events).map(maskKey);
    expect(ka.length).toBeGreaterThan(0);
    for (const k of ka) expect(want.has(k)).toBe(true);
    for (const k of kc) expect(want.has(k)).toBe(true);
    // Every fake both observers' gates admit reaches both, byte-identical.
    const inBoth = fakes.filter((f) => {
      const da = Math.hypot(f.x - a.state.x, f.y - a.state.y);
      const dc = Math.hypot(f.x - c.state.x, f.y - c.state.y);
      const sight = a.stats.sightRange;
      const radar = a.stats.radarRange;
      return da > sight && da <= radar && dc > sight && dc <= radar;
    });
    expect(inBoth.length).toBeGreaterThan(0);
    for (const f of inBoth) {
      expect(ka).toContain(fakeKey(f, w.now));
      expect(kc).toContain(fakeKey(f, w.now));
    }
    for (const b of blips(observe(w, a.id).events)) expect(Object.keys(b).sort()).toEqual(['bits', 'gx', 'gy', 'h', 'k', 't', 'w']);
  });

  it('the OWNER never receives its own fakes', () => {
    const { w, o, a } = board();
    expect(blips(observe(w, a.id).events).length).toBeGreaterThan(0);
    expect(blips(observe(w, o.id).events)).toEqual([]); // no other hull in its annulus, and never its own fakes
  });

  it('a LAPSED source paints nothing (lazy expiry), and a lit zone the observer owns shows the truth', () => {
    const { w, o, a } = board();
    o.chaff!.until = w.now;
    expect(blips(observe(w, a.id).events)).toEqual([]);
    o.chaff!.until = w.now + 5000;
    w.litZones.set('z', { id: 'z', ownerId: a.id, x: 500, y: 0, r: 200, until: w.now + 5000, phosphor: false, dazzle: false } as never);
    expect(blips(observe(w, a.id).events)).toEqual([]);
  });

  it('a fake never paints inside the observer\'s sight bubble (the annulus is the gate)', () => {
    const { w, o, a } = board();
    o.chaff = source(w, 60, 0); // the whole cloud inside a's truesight
    expect(blips(observe(w, a.id).events)).toEqual([]);
  });

  it('the scatter FLIPS when the owner\'s sweep period elapses', () => {
    const { w, o, a } = board();
    const before = blips(observe(w, a.id).events).map(maskKey).sort();
    w.now += o.stats.sweepPeriodMs; // epoch 0 -> 1 (the beam stays wide open)
    const after = blips(observe(w, a.id).events).map(maskKey).sort();
    expect(after.length).toBeGreaterThan(0);
    expect(after).not.toEqual(before);
    const next = scatterFakes(o.chaff!.seed, 1, 500, 0, 120, 10, w.map.islands, w.map.radius);
    const want = new Set(next.map((f) => fakeKey(f, w.now)));
    for (const k of after) expect(want.has(k)).toBe(true);
  });
});
