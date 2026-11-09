// THE AIRDROPS, server sim (Story 10.9, epic-10 amendment 16; Eric's rulings
// R1–R4 of 2026-11-08). The World's three drop rows — `spawnDrops` (the
// minute schedule + placement), `collectDrops` (sail-over) and `stormDrops`
// — and the wreck pickup `sinkShip` leaves. A crate carries only its KIND;
// the amount (and a wreck's stats) is rolled AT PICKUP (Eric 2026-11-08).
// Contract-style: every count,
// radius and roll bound is read off CONFIG (`dropCountFor`, `CONFIG.drops`,
// `CONFIG.beacons.rangeU`), never a literal of Eric's numbers.

import { describe, expect, it, vi } from 'vitest';
import {
  CATALOG,
  CONFIG,
  DEFAULT_CLASS_ID,
  dropCountFor,
  dropTouches,
  effectiveStats,
  hullSilhouette,
  isDropKind,
  isDropRoll,
  transformPolygon,
  type DropKind,
  type DropState,
  type GameEvent,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { SPAWN_ISLAND_CLEARANCE, islandClearance } from '../game/spawn.js';
import { DT, bareWorld, captain, seatBeacon } from './beaconFixture.js';

const D = CONFIG.drops;
const BEAT = CONFIG.zone.beatMs;

/** Anchor the zone clock so that AFTER THE NEXT STEP `elapsedMs` has passed
 *  since the zone started (startZone is idempotent — once per World). */
function zoneAfterStep(w: World, elapsedMs: number): void {
  w.startZone(w.now + DT - elapsedMs);
}

/** The scheduled drops of minute `m`, in placement order. */
function batch(w: World, m: number): DropState[] {
  return [...w.drops.values()].filter((d) => d.id.startsWith(`drp-${m}-`));
}

/** The wreck pickups on the water. */
function wrecks(w: World): DropState[] {
  return [...w.drops.values()].filter((d) => d.id.startsWith('drp-w-'));
}

function dpEvents(w: World): Extract<GameEvent, { k: 'dp' }>[] {
  return w.tickEvents.filter((e): e is Extract<GameEvent, { k: 'dp' }> => e.k === 'dp');
}

/** Put a crate on the water directly (a sail-over case owns its geometry). */
function seatDrop(w: World, id: string, x: number, y: number, kind: DropKind): DropState {
  const drop: DropState = { id, x, y, kind };
  w.drops.set(id, drop);
  return drop;
}

/** The default hull's half-beam at heading 0 (its widest |y|), off the
 *  shared silhouette — never a copied number. */
function halfBeam(): number {
  return Math.max(...hullSilhouette(DEFAULT_CLASS_ID).map((v) => Math.abs(v.y)));
}

function hullPolyOf(rec: ShipRecord) {
  return transformPolygon(hullSilhouette(rec.hullId), rec.state.x, rec.state.y, rec.state.heading);
}

const STAT = D.indices[0];

describe('the minute schedule (spawnDrops)', () => {
  it('the first step after startZone scatters the minute-0 batch: dropCountFor(0) crates, each carrying only an index kind', () => {
    const w = bareWorld();
    zoneAfterStep(w, 0);
    w.step();
    const drops = batch(w, 0);
    expect(drops).toHaveLength(dropCountFor(0, D));
    expect(w.drops.size).toBe(dropCountFor(0, D));
    for (const d of drops) {
      expect(Object.keys(d).sort()).toEqual(['id', 'kind', 'x', 'y']); // no amount exists before pickup
      expect(isDropKind(d.kind)).toBe(true);
      expect(D.indices).toContain(d.kind); // a scheduled crate is never a wreck
    }
  });

  it('crossing minute m scatters exactly dropCountFor(m) more crates, on that tick', () => {
    const m = 1;
    const w = bareWorld();
    zoneAfterStep(w, m * BEAT - DT); // the next step is the last of minute m-1
    w.step();
    expect(batch(w, m)).toHaveLength(0);
    w.step(); // crosses the m mark
    expect(batch(w, m)).toHaveLength(dropCountFor(m, D));
  });

  it('a long step that crosses two minute marks scatters BOTH batches, in minute order', () => {
    const w = bareWorld();
    zoneAfterStep(w, 0);
    w.step();
    w.step(2 * BEAT);
    const ids = [...w.drops.keys()];
    expect(batch(w, 1)).toHaveLength(dropCountFor(1, D));
    expect(batch(w, 2)).toHaveLength(dropCountFor(2, D));
    const last1 = ids.lastIndexOf(batch(w, 1).at(-1)!.id);
    const first2 = ids.indexOf(batch(w, 2)[0].id);
    expect(last1).toBeLessThan(first2);
  });

  it('nothing is scattered at or after untilMinute', () => {
    const w = bareWorld();
    zoneAfterStep(w, D.untilMinute * BEAT - DT);
    w.step(); // catches up every batch before untilMinute
    const before = new Set(w.drops.keys());
    w.step(); // crosses the untilMinute mark
    w.step(BEAT); // and the next one
    const fresh = [...w.drops.keys()].filter((id) => !before.has(id));
    expect(fresh).toEqual([]);
    for (const id of before) {
      const m = Number(id.split('-')[1]);
      expect(m).toBeLessThan(D.untilMinute);
    }
  });

  it('matchOverride.drops:false (WorldOptions.drops) scatters nothing — the shipped default does', () => {
    const off = bareWorld(1008, { drops: false });
    zoneAfterStep(off, 0);
    off.step();
    off.step(2 * BEAT);
    expect(off.drops.size).toBe(0);
    const on = bareWorld(1008);
    zoneAfterStep(on, 0);
    on.step();
    expect(on.drops.size).toBeGreaterThan(0);
  });

  it('nothing is scattered before the zone starts', () => {
    const w = bareWorld();
    for (let i = 0; i < 3; i += 1) w.step();
    expect(w.drops.size).toBe(0);
  });
});

describe('placement (R1 — inside the live ring, off the land, outside every live beacon circle)', () => {
  function assertPlaced(w: World): void {
    const ring = w.zoneLiveRing;
    const live = w.beacons.records.filter((b) => w.beacons.phaseOf(b, w.now) !== 'gone');
    expect(w.drops.size).toBeGreaterThan(0);
    for (const d of w.drops.values()) {
      expect(d.x).toBe(Math.fround(d.x));
      expect(d.y).toBe(Math.fround(d.y));
      expect(Math.hypot(d.x - ring.cx, d.y - ring.cy)).toBeLessThanOrEqual(ring.r - D.radiusU + 1e-3);
      expect(islandClearance(d, w.map.islands)).toBeGreaterThan(SPAWN_ISLAND_CLEARANCE);
      for (const b of live) expect(Math.hypot(d.x - b.x, d.y - b.y)).toBeGreaterThanOrEqual(CONFIG.beacons.rangeU);
    }
  }

  it('the minute-0 batch on a real map clears land AND the cycle-0 beacons charted the same tick', () => {
    const w = new World(4242);
    zoneAfterStep(w, 0);
    w.step();
    expect(w.beacons.records.length).toBeGreaterThan(0); // the keep-out had something to read
    assertPlaced(w);
  });

  it('a later batch (caught up mid-match) obeys the same three rejections against that tick\'s ring', () => {
    const w = new World(777);
    zoneAfterStep(w, 3 * BEAT);
    w.step();
    assertPlaced(w);
  });

  it('a ring wholly inside a beacon circle skips every crate and LOGS it — never throws', () => {
    const w = bareWorld();
    w.map.radius = CONFIG.beacons.rangeU / 2; // ring 0 is the map; the whole disc sits inside one circle
    seatBeacon(w, 0, { x: 0, y: 0 }); // starts the zone now and charts cycle 0
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(() => w.step()).not.toThrow();
      expect(batch(w, 0)).toHaveLength(0);
      const skips = log.mock.calls.filter(([line]) => String(line).includes('drops.placeSkipped'));
      expect(skips).toHaveLength(dropCountFor(0, D));
    } finally {
      log.mockRestore();
    }
  });

  it('is deterministic on the private stream: same seeds → same crates; another pseudonymSeed → different', () => {
    const scatter = (pseudonymSeed: number): DropState[] => {
      const w = new World(4242, CONFIG.map.playerCap, CONFIG.zone, { pseudonymSeed });
      zoneAfterStep(w, 0);
      w.step();
      return [...w.drops.values()];
    };
    expect(scatter(11)).toEqual(scatter(11));
    expect(scatter(12)).not.toEqual(scatter(11));
  });
});

describe('sail-over (collectDrops, R4)', () => {
  it('a hull on a crate takes it: the amount is rolled NOW, indexBonus += it, stats re-folded, dropsTaken 1, crate gone, ONE dp for it alone', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    const b = captain(w, 'b', 2000, 0);
    const bonusBefore = a.indexBonus[STAT];
    const statsBefore = a.stats;
    seatDrop(w, 'd1', 0, 0, STAT);
    w.step();
    const n = a.indexBonus[STAT] - bonusBefore;
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(D.bonusMin);
    expect(n).toBeLessThanOrEqual(D.bonusMax);
    expect(a.stats).toEqual(effectiveStats(a.cls, a.cards, CATALOG, a.indexBonus));
    expect(a.stats).not.toEqual(statsBefore);
    expect(a.dropsTaken).toBe(1);
    expect(b.dropsTaken).toBe(0);
    expect(w.drops.has('d1')).toBe(false);
    const dp = dpEvents(w);
    expect(dp).toHaveLength(1);
    expect(dp[0]).toEqual({ k: 'dp', id: 'a', t: w.now, g: [[STAT, n]] });
  });

  it('a wreck crate rolls wreckRolls stat + amount rolls at pickup and lands every one', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    const before = { ...a.indexBonus };
    seatDrop(w, 'dw', 0, 0, 'wreck');
    w.step();
    const g = dpEvents(w)[0].g;
    expect(g).toHaveLength(D.wreckRolls);
    for (const r of g) expect(isDropRoll(r)).toBe(true);
    const expected = { ...before };
    for (const [s, n] of g) expected[s] += n;
    expect(a.indexBonus).toEqual(expected);
  });

  it('two pickups of the same kind on one world draw different amounts over many trials (per-pickup sub-streams)', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    const amounts = new Set<number>();
    for (let i = 0; i < 40; i += 1) {
      seatDrop(w, `d${i}`, 0, 0, STAT);
      w.step();
      const dp = dpEvents(w);
      expect(dp).toHaveLength(1);
      amounts.add(dp[0].g[0][1]);
    }
    expect(a.dropsTaken).toBe(40);
    expect(amounts.size).toBeGreaterThan(1);
  });

  it('the pickup roll is deterministic on the private stream: same seeds → same grants', () => {
    const grants = (): unknown[] => {
      const w = bareWorld(1008, { pseudonymSeed: 4711 });
      captain(w, 'a', 0, 0);
      const out: unknown[] = [];
      for (let i = 0; i < 6; i += 1) {
        seatDrop(w, `d${i}`, 0, 0, i % 2 === 0 ? STAT : 'wreck');
        w.step();
        out.push(dpEvents(w)[0].g);
      }
      return out;
    };
    expect(grants()).toEqual(grants());
  });

  it('a crate out of reach stays on the water', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    seatDrop(w, 'd1', 1000, 0, STAT);
    w.step();
    expect(w.drops.has('d1')).toBe(true);
    expect(a.dropsTaken).toBe(0);
    expect(dpEvents(w)).toEqual([]);
  });

  it('a SINKING hull over a crate collects nothing', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    const bonusBefore = { ...a.indexBonus };
    seatDrop(w, 'd1', 0, 0, STAT);
    w.sinkShip('a');
    w.step();
    expect(w.drops.has('d1')).toBe(true);
    expect(a.indexBonus).toEqual(bonusBefore);
    expect(a.dropsTaken).toBe(0);
    expect(dpEvents(w)).toEqual([]);
  });

  it('two hulls touching one crate on the same tick: exactly one — the first in ship insertion order — takes it', () => {
    const w = bareWorld();
    const off = halfBeam() + D.radiusU / 3; // hulls a little apart, both within radiusU of the origin
    const a = captain(w, 'a', 0, -off);
    const b = captain(w, 'b', 0, off);
    expect(dropTouches({ x: 0, y: 0 }, hullPolyOf(a), D.radiusU)).toBe(true);
    expect(dropTouches({ x: 0, y: 0 }, hullPolyOf(b), D.radiusU)).toBe(true);
    seatDrop(w, 'd1', 0, 0, STAT);
    w.step();
    expect(a.dropsTaken).toBe(1);
    expect(b.dropsTaken).toBe(0);
    expect(dpEvents(w).map((e) => e.id)).toEqual(['a']);
  });

  it('a redeploy zeroes dropsTaken (the beaconXpMs precedent)', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    seatDrop(w, 'd1', 0, 0, STAT);
    w.step();
    expect(a.dropsTaken).toBe(1);
    w.resetForMatchStart();
    expect(a.dropsTaken).toBe(0);
    expect(w.drops.size).toBe(0); // the practice water is wiped too
  });
});

describe('the storm (stormDrops)', () => {
  it('a crate outside the live ring is gone after a step; one inside stays', () => {
    const w = bareWorld(1008, { drops: false });
    zoneAfterStep(w, 0);
    const ring = w.zoneLiveRing;
    seatDrop(w, 'in', ring.cx, ring.cy, STAT);
    seatDrop(w, 'out', ring.cx + ring.r + D.radiusU, ring.cy, STAT);
    w.step();
    expect(w.drops.has('in')).toBe(true);
    expect(w.drops.has('out')).toBe(false);
  });
});

describe('the wreck pickup (sinkShip, R2)', () => {
  it("once the zone has started, a sinking participant leaves ONE crate of kind 'wreck' at its centre", () => {
    const w = bareWorld();
    w.startZone(w.now);
    captain(w, 'a', 123.4, -56.7);
    w.sinkShip('a');
    const ws = wrecks(w);
    expect(ws).toHaveLength(1);
    expect([ws[0].x, ws[0].y]).toEqual([Math.fround(123.4), Math.fround(-56.7)]);
    expect(ws[0].kind).toBe('wreck');
    w.sinkShip('a'); // the sink lock: no second wreck for the same death
    expect(wrecks(w)).toHaveLength(1);
  });

  it('wreck pickups are placed even with the schedule switched off', () => {
    const w = bareWorld(1008, { drops: false });
    zoneAfterStep(w, 0);
    captain(w, 'a', 0, 0);
    w.step();
    w.sinkShip('a');
    w.step();
    expect(batch(w, 0)).toHaveLength(0);
    expect(wrecks(w)).toHaveLength(1);
  });

  it('a sink BEFORE the zone starts (a ready-room / sandbox practice sink) places no wreck crate', () => {
    const w = bareWorld();
    captain(w, 'a', 0, 0);
    w.sinkShip('a');
    expect(wrecks(w)).toHaveLength(0);
    expect(w.drops.size).toBe(0);
  });

  it('a bot (an AI captain) leaves one too', () => {
    const w = bareWorld();
    w.startZone(w.now);
    const bot = w.addBot(undefined, undefined);
    w.sinkShip(bot.id);
    expect(wrecks(w)).toHaveLength(1);
  });
});
