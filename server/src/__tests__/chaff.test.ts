// CHAFF (Story 8.16, catalog-v3 R39, epic-8 amendments 124(b)(c)/127).
//
// One copy puts a false-return SOURCE at the owner's position; for 15 s its
// server-generated fakes paint on every OTHER observer's radar through that
// observer's own blipGate, re-scattered once per the OWNER's sweep period and
// water-filtered (game/fakes.ts). The owner never receives them as `events`
// blips; since cycle 162 (Eric 2026-10-01, PV 68) the owner receives the
// rects of the fakes its OWN beam painted as the self-private
// `you.chaffGhosts` — the same scatter, the same rect shape, gated by the
// owner's beam and the radar shadow but not the sight annulus (the cloud is
// at the owner's own position). The cloud is WORLD-owned
// (`World.chaffSources`, keyed by owner): it runs its full window through
// the owner's sink, redeploy or respawn (amendment 127). This file pins the
// scatter contract, the row, the emission end to end through
// perception.observe(), and the owner's ghosts.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  CONSUMABLE_SLOTS,
  bearing,
  blockedWater,
  mulberry32,
  paintCoverage,
  wrapPositive,
  type BlipEvent,
  type FrameMsg,
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

/** A hand-built source for `owner`, filed in the world map (world-state
 *  setup, like injectMine's raw write). */
function arm(w: World, owner: ShipRecord, x: number, y: number, seed = 0xc0ffee): FakeSource {
  const src: FakeSource = {
    ownerId: owner.id, x, y, radius: CONFIG.chaff.radius, count: CONFIG.chaff.count,
    until: w.now + CONFIG.chaff.durationMs, seed, at: w.now, sweepPeriodMs: owner.stats.sweepPeriodMs,
  };
  w.chaffSources.set(owner.id, src);
  return src;
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

  it('the dials are the rulings: a 180 u scatter circle (Eric 2026-10-01, ×1.5 from 120) of CONFIG.chaff.count fakes', () => {
    expect(CONFIG.chaff.radius).toBe(180);
    expect(CONFIG.chaff.count).toBe(10);
  });

  it('the EPOCH is time over the OWNER\'s sweep period, and a new epoch is a new scatter', () => {
    const src: FakeSource = { ownerId: 'o', x: 0, y: 0, radius: 120, count: 10, until: 99_999, seed: 42, at: 1000, sweepPeriodMs: 4000 };
    expect(fakeEpoch(src, 1000)).toBe(0);
    expect(fakeEpoch(src, 4999)).toBe(0);
    expect(fakeEpoch(src, 5000)).toBe(1);
    expect(fakeEpoch({ ...src, sweepPeriodMs: 2000 }, 5000)).toBe(2); // a faster sweep rescatters sooner
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
    const first = w.chaffSources.get('a')!;
    expect(first).toEqual({
      x: 120, y: -40, radius: CONFIG.chaff.radius, count: CONFIG.chaff.count,
      until: w.now + CONFIG.chaff.durationMs, seed: first.seed, at: w.now,
      ownerId: 'a', sweepPeriodMs: a.stats.sweepPeriodMs,
    });
    expect('chaff' in a).toBe(false); // nothing about it on the hull (amendment 127)
    expect(Number.isInteger(first.seed)).toBe(true);
    expect(a.loadout[BELT].state).toEqual({ n: 1, reloadMsLeft: 0 });
    // Sail on, press again: a FRESH source at the NEW position replaces it.
    for (let i = 0; i < 3; i++) w.step();
    a.state.x = 300;
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: true });
    const second = w.chaffSources.get('a')!;
    expect(w.chaffSources.size).toBe(1); // REPLACED, never stacked (124(c))
    expect(second).not.toBe(first);
    expect(second.x).toBe(300);
    expect(second.at).toBe(w.now);
    expect(second.until).toBe(w.now + CONFIG.chaff.durationMs);
    expect(second.seed).not.toBe(first.seed);
    expect(a.loadout[BELT]).toEqual({ equipmentId: null, state: null });
  });

  it('a SINKING hull is refused (blocked), nothing spent; its live cloud stays on the water (amendment 127)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyCard(a, 'chaff');
    const src = arm(w, a, 0, 0);
    w.sinkShip('a', 'b');
    expect(w.chaffSources.get('a')).toBe(src); // the sink does NOT touch it
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: false, reason: 'blocked' });
    expect(a.loadout[BELT].state).toEqual({ n: 1, reloadMsLeft: 0 });
  });

  it('only the OWNER\'s own `you.chaff` carries the cloud (amendment 191) — nothing else about chaff rides any frame', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    const src = arm(w, a, 0, 0);
    const own = buildFrame(w, 'a');
    expect(own.you!.chaff).toEqual({ x: 0, y: 0, until: src.until });
    for (const id of ['a', 'b']) {
      const f = buildFrame(w, id);
      expect(JSON.stringify({ ...f, you: { ...f.you, offer: [], cards: [], chaff: undefined } })).not.toContain('chaff');
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
    const src = arm(w, o, 500, 0);
    const fakes = scatterFakes(src.seed, fakeEpoch(src, w.now), 500, 0, CONFIG.chaff.radius, CONFIG.chaff.count, w.map.islands, w.map.radius);
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

  it('the OWNER\'s fakes never ride `events` (they ride `you.chaffGhosts` instead — see the ghost suite below)', () => {
    const { w, o, a } = board();
    expect(blips(observe(w, a.id).events).length).toBeGreaterThan(0);
    expect(blips(observe(w, o.id).events)).toEqual([]); // no other hull in its annulus, and never its own fakes
    // ...while the same beam, over the same cloud, paints the owner's ghosts.
    expect(observe(w, o.id).chaffGhosts.length).toBeGreaterThan(0);
  });

  it('a LAPSED source paints nothing (lazy expiry), and a lit zone the observer owns shows the truth', () => {
    const { w, o, a } = board();
    w.chaffSources.get(o.id)!.until = w.now;
    expect(blips(observe(w, a.id).events)).toEqual([]);
    w.chaffSources.get(o.id)!.until = w.now + 5000;
    w.litZones.set('z', { id: 'z', ownerId: a.id, x: 500, y: 0, r: 200, until: w.now + 5000 } as never);
    expect(blips(observe(w, a.id).events)).toEqual([]);
  });

  it('a fake never paints inside the observer\'s sight bubble (the annulus is the gate)', () => {
    const { w, o, a } = board();
    arm(w, o, 60, 0); // the whole cloud inside a's truesight
    expect(blips(observe(w, a.id).events)).toEqual([]);
  });

  it('the scatter FLIPS when the owner\'s sweep period elapses', () => {
    const { w, o, a } = board();
    const before = blips(observe(w, a.id).events).map(maskKey).sort();
    w.now += o.stats.sweepPeriodMs; // epoch 0 -> 1 (the beam stays wide open)
    const after = blips(observe(w, a.id).events).map(maskKey).sort();
    expect(after.length).toBeGreaterThan(0);
    expect(after).not.toEqual(before);
    const next = scatterFakes(w.chaffSources.get(o.id)!.seed, 1, 500, 0, CONFIG.chaff.radius, CONFIG.chaff.count, w.map.islands, w.map.radius);
    const want = new Set(next.map((f) => fakeKey(f, w.now)));
    for (const k of after) expect(want.has(k)).toBe(true);
  });
});

describe('CHAFF — THE OWNER\'S GHOSTS, `you.chaffGhosts` (Eric 2026-10-01, cycle 162, PV 68)', () => {
  const GHOST_KEYS = ['bits', 'gx', 'gy', 'h', 'w'];

  /** The R39 geometry: the owner `o` bursts its chaff AT ITS OWN POSITION
   *  (500, 500) — every fake inside its sight bubble, where the annulus never
   *  paints — with its beam wide open. `a` at the origin is 707 u out: beyond
   *  o's radar, so nothing else can paint on o's scope. */
  function ownBoard(seed = 0xc0ffee): { w: World; o: ShipRecord; a: ShipRecord; src: FakeSource; fakes: Fake[] } {
    const w = bareWorld();
    const o = place(w, 'o', 500, 500);
    const a = place(w, 'a', 0, 0);
    wideBeam(o);
    wideBeam(a);
    const src = arm(w, o, 500, 500, seed);
    const fakes = scatterFakes(src.seed, fakeEpoch(src, w.now), 500, 500, CONFIG.chaff.radius, CONFIG.chaff.count, w.map.islands, w.map.radius);
    expect(fakes.length).toBeGreaterThan(0);
    return { w, o, a, src, fakes };
  }

  const ghostsOf = (f: FrameMsg): string[] => (f.you!.chaffGhosts ?? []).map(maskKey).sort();

  it('the owner\'s fakes never ride `events`, and ride `you.chaffGhosts` — EXACTLY the blip rect (gx,gy,w,h,bits) of every fake the beam crossed — when the owner\'s beam crosses them inside its own bubble', () => {
    const { w, o, a, fakes } = ownBoard();
    const f = buildFrame(w, o.id);
    expect(blips(f.events)).toEqual([]); // never an events blip for the owner
    const ghosts = f.you!.chaffGhosts!;
    expect(ghosts.length).toBeGreaterThan(0);
    for (const g of ghosts) expect(Object.keys(g).sort()).toEqual(GHOST_KEYS); // no `k`, no `t`, nothing else
    for (const g of ghosts) expect(Object.keys(g)).toEqual(['gx', 'gy', 'w', 'h', 'bits']); // the blip's own key order
    // The wide beam crosses every fake on a flat raster with no island: the
    // ghost set IS the fake set, rect for rect — what enemies would see.
    expect(ghostsOf(f)).toEqual(fakes.map((fk) => fakeKey(fk, w.now)).sort());
    // Nobody else gets a ghost list (the key is absent from every other frame).
    const fa = buildFrame(w, a.id);
    expect('chaffGhosts' in fa.you!).toBe(false);
    expect(JSON.stringify(fa)).not.toContain('chaffGhosts');
    expect(JSON.stringify({ ...f, you: undefined })).not.toContain('chaffGhosts');
  });

  it('no ghosts once `until` passes (lazy expiry, with `you.chaff`) — the key is ABSENT, never []', () => {
    const { w, o, src } = ownBoard();
    expect('chaffGhosts' in buildFrame(w, o.id).you!).toBe(true);
    src.until = w.now;
    const f = buildFrame(w, o.id);
    expect('chaffGhosts' in f.you!).toBe(false);
    expect('chaff' in f.you!).toBe(false);
    expect(observe(w, o.id).chaffGhosts).toEqual([]);
  });

  it('no ghosts when the beam is elsewhere (sweptThisTick false); a narrow window paints exactly the fakes whose bearing it crosses', () => {
    const { w, o, fakes } = ownBoard();
    o.prevSweepAngle = 0;
    o.sweepAngle = 0; // a zero-width window: nothing is swept this tick
    expect('chaffGhosts' in buildFrame(w, o.id).you!).toBe(false);
    // A 0.02 rad window around fake[0]'s bearing: fake[0] paints; every ghost
    // is a fake whose bearing lies inside the window and nothing else does.
    const brg0 = bearing(o.state, fakes[0]);
    o.prevSweepAngle = wrapPositive(brg0 - 0.01);
    o.sweepAngle = wrapPositive(brg0 + 0.01);
    const swept = fakes.filter((fk) => wrapPositive(bearing(o.state, fk) - o.prevSweepAngle) < 0.02);
    expect(swept.length).toBeGreaterThan(0);
    expect(swept.length).toBeLessThan(fakes.length); // a non-trivial subset — the gate is doing work
    expect(ghostsOf(buildFrame(w, o.id))).toEqual(swept.map((fk) => fakeKey(fk, w.now)).sort());
  });

  it('a flare the owner owns over the cloud shows the truth: no ghosts there either (the ownZoneCovers skip, as for enemies\' blips)', () => {
    const { w, o } = ownBoard();
    w.litZones.set('z', { id: 'z', ownerId: o.id, x: 500, y: 500, r: 300, until: w.now + 5000 } as never);
    expect('chaffGhosts' in buildFrame(w, o.id).you!).toBe(false);
  });

  it('a re-fire REPLACES the ghosts: they come off the NEW source\'s seed, and the old set is gone', () => {
    const { w, o, fakes } = ownBoard();
    const before = ghostsOf(buildFrame(w, o.id));
    expect(before).toEqual(fakes.map((fk) => fakeKey(fk, w.now)).sort());
    const next = arm(w, o, 500, 500, 0xbeef);
    const nextFakes = scatterFakes(next.seed, fakeEpoch(next, w.now), 500, 500, CONFIG.chaff.radius, CONFIG.chaff.count, w.map.islands, w.map.radius);
    const after = ghostsOf(buildFrame(w, o.id));
    expect(after).toEqual(nextFakes.map((fk) => fakeKey(fk, w.now)).sort());
    expect(after).not.toEqual(before);
  });

  it('the ghosts ARE what the enemy sees: an enemy whose annulus and beam hold the cloud receives the same rects as `events` blips', () => {
    const { w, o, fakes } = ownBoard();
    const e = place(w, 'e', 500, 0); // 500 u below the cloud: sight 330 < 500 ≤ radar 660
    wideBeam(e);
    const enemyBlips = blips(buildFrame(w, e.id).events).map(maskKey).sort();
    const ownGhosts = ghostsOf(buildFrame(w, o.id));
    // Every fake the enemy's annulus admits is in both lists, byte-identical.
    const inAnnulus = fakes.filter((fk) => {
      const d = Math.hypot(fk.x - 500, fk.y - 0);
      return d > e.stats.sightRange && d <= e.stats.radarRange;
    });
    expect(inAnnulus.length).toBeGreaterThan(0);
    for (const fk of inAnnulus) {
      expect(enemyBlips).toContain(fakeKey(fk, w.now));
      expect(ownGhosts).toContain(fakeKey(fk, w.now));
    }
    // ...and the enemy's frame carries no ghost list of its own.
    expect('chaffGhosts' in buildFrame(w, e.id).you!).toBe(false);
  });

  it('a SPECTATOR gets no ghosts (no `you`, no beam), and the radar lock withholds them like every blip', () => {
    const { w, o } = ownBoard();
    const spec = buildFrame(w, o.id, 'finished');
    expect(spec.spec).toBe(true);
    expect(JSON.stringify(spec)).not.toContain('chaffGhosts');
    w.radarEnabled = false;
    expect('chaffGhosts' in buildFrame(w, o.id).you!).toBe(false);
    expect(observe(w, o.id).chaffGhosts).toEqual([]);
  });
});

describe('CHAFF — the cloud outlives its owner (amendment 127)', () => {
  it('a pressed cloud keeps painting the SAME fakes after its owner sinks', () => {
    const w = bareWorld();
    const o = place(w, 'o', 500, 0);
    const a = place(w, 'a', 0, 0);
    w.applyCard(o, 'chaff');
    expect(w.sinkingActivationGate(o, BELT)).toEqual({ ok: true });
    wideBeam(a);
    const before = blips(observe(w, a.id).events).map(maskKey).sort();
    expect(before.length).toBeGreaterThan(0);
    w.sinkShip('o', 'a');
    wideBeam(a);
    expect(blips(observe(w, a.id).events).map(maskKey).sort()).toEqual(before);
  });

  it('the NEXT TICK after the owner sinks an enemy still receives the same fake set (same seed, same epoch)', () => {
    const w = bareWorld();
    const o = place(w, 'o', -1500, 0); // the owner far from its cloud: nothing of its own paints
    const a = place(w, 'a', 0, 0);
    const src = arm(w, o, 450, 0);
    wideBeam(a);
    const want = scatterFakes(src.seed, fakeEpoch(src, w.now), 450, 0, CONFIG.chaff.radius, CONFIG.chaff.count, w.map.islands, w.map.radius)
      .map((f) => fakeKey(f, w.now)).sort();
    const before = blips(observe(w, a.id).events).map(maskKey).sort();
    expect(before.length).toBeGreaterThan(0);
    for (const k of before) expect(want).toContain(k);
    w.sinkShip('o', 'a');
    w.step();
    expect(w.chaffSources.get('o')).toBe(src);
    expect(fakeEpoch(src, w.now)).toBe(0);
    wideBeam(a);
    const after = blips(observe(w, a.id).events).map(maskKey).sort();
    const again = scatterFakes(src.seed, 0, 450, 0, CONFIG.chaff.radius, CONFIG.chaff.count, w.map.islands, w.map.radius).map((f) => fakeKey(f, w.now)).sort();
    expect(after.length).toBe(before.length);
    for (const k of after) expect(again).toContain(k);
  });

  it('the owner RESPAWNS: the cloud is still there, and still skipped for its owner, until `until`', () => {
    const w = bareWorld();
    const o = place(w, 'o', -1500, 0);
    const a = place(w, 'a', 0, 0);
    const src = arm(w, o, 450, 0);
    w.sinkShip('o', 'a');
    const inner = w as unknown as { respawn(ship: ShipRecord): void };
    inner.respawn(o);
    expect(w.chaffSources.get('o')).toBe(src);
    o.state = { x: 0, y: 450, heading: 0, speed: 0 }; // the cloud inside its annulus
    wideBeam(a);
    wideBeam(o);
    expect(blips(observe(w, a.id).events).length).toBeGreaterThan(0);
    const ownPaints = blips(observe(w, o.id).events).map(maskKey);
    const fakeKeys = new Set(scatterFakes(src.seed, fakeEpoch(src, w.now), 450, 0, CONFIG.chaff.radius, CONFIG.chaff.count, w.map.islands, w.map.radius).map((f) => fakeKey(f, w.now)));
    for (const k of ownPaints) expect(fakeKeys.has(k)).toBe(false); // never its own fakes in `events` (they ride `you.chaffGhosts` instead)
    src.until = w.now; // lazy expiry
    o.state = { x: -1500, y: 0, heading: 0, speed: 0 }; // its hull out of a's annulus again
    wideBeam(a);
    expect(blips(observe(w, a.id).events)).toEqual([]);
  });

  it('resetForMatchStart clears every cloud (the practice -> match boundary, the mines precedent)', () => {
    const w = bareWorld();
    const o = place(w, 'o', -1500, 0);
    place(w, 'a', 0, 0);
    arm(w, o, 450, 0);
    w.resetForMatchStart();
    expect(w.chaffSources.size).toBe(0);
  });
});
