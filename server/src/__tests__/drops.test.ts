// THE AIRDROPS, server sim (Story 10.9, epic-10 amendment 18; Eric's rulings
// R1–R4 of 2026-11-08; since Story 12.4, epic-12 amendment 5(a)/(e), every
// airdrop is an XP crate and a wreck pays +1 per victim level). The World's
// three drop rows — `spawnDrops` (the minute schedule + placement),
// `collectDrops` (sail-over) and `stormDrops` — and the wreck pickup
// `sinkShip` leaves. Contract-style: every count, radius and grant is read
// off CONFIG (`dropCountFor`, `CONFIG.drops`, `CONFIG.xp`), never a literal
// of Eric's numbers.

import { describe, expect, it, vi } from 'vitest';
import {
  CATALOG,
  CONFIG,
  DEFAULT_CLASS_ID,
  dropCountFor,
  dropTouches,
  effectiveStats,
  hullSilhouette,
  isDropRoll,
  transformPolygon,
  type DropKind,
  type DropState,
  type GameEvent,
} from '@salvo/shared';
import { World, type CrateState, type ShipRecord } from '../game/world.js';
import { Match } from '../game/match.js';
import { SPAWN_ISLAND_CLEARANCE, islandClearance } from '../game/spawn.js';
import { circleIsland } from './islandFixture.js';
import { DT, bareWorld, captain, xpMsOf } from './worldFixture.js';

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
function wrecks(w: World): CrateState[] {
  return [...w.drops.values()].filter((d) => d.id.startsWith('drp-w-'));
}

function dpEvents(w: World): Extract<GameEvent, { k: 'dp' }>[] {
  return w.tickEvents.filter((e): e is Extract<GameEvent, { k: 'dp' }> => e.k === 'dp');
}

/** Put a crate on the water directly (a sail-over case owns its geometry);
 *  a wreck carries its victim's `levels`. */
function seatDrop(w: World, id: string, x: number, y: number, kind: DropKind, levels?: number): CrateState {
  const drop: CrateState = levels === undefined ? { id, x, y, kind } : { id, x, y, kind, levels };
  w.drops.set(id, drop);
  return drop;
}

/** The XP ms one XP crate grants — the integer the one XP door rounds to. */
const CRATE_MS = Math.round(CONFIG.xp.levelMs * CONFIG.drops.xpLevels);

/** A participant that has completed `level` levels (the wreck's count). */
function leveled(rec: ShipRecord, level: number): ShipRecord {
  rec.level = level;
  return rec;
}

/** The default hull's half-beam at heading 0 (its widest |y|), off the
 *  shared silhouette — never a copied number. */
function halfBeam(): number {
  return Math.max(...hullSilhouette(DEFAULT_CLASS_ID).map((v) => Math.abs(v.y)));
}

function hullPolyOf(rec: ShipRecord) {
  return transformPolygon(hullSilhouette(rec.hullId), rec.state.x, rec.state.y, rec.state.heading);
}

/** A world where a sink is a MATCH death: the zone has started and nothing
 *  respawns (Match.applyPolicy's `active` arm). */
function liveWorld(): World {
  const w = bareWorld();
  w.startZone(w.now);
  w.respawnEnabled = false;
  return w;
}

let shellN = 0;
/** Land one real contact shell of `damage` from `by` on `victim` (the
 *  assistSplit fixture's path), so the victim's assist ledger is stamped by
 *  the production damage seam, at the world's current clock. */
function hitHull(w: World, by: string, victim: ShipRecord, damage: number): void {
  const id = `wk-${shellN++}`;
  w.shells.set(id, {
    id,
    ownerId: by,
    x: victim.state.x - 20,
    y: victim.state.y,
    vx: CONFIG.gun.shellSpeed,
    vy: 0,
    distLeft: 60,
    bornAt: w.now,
    kind: 'shell',
    family: 'cannon',
    damage,
    hitRadius: CONFIG.gun.shellRadius,
    targetX: null,
    targetY: null,
    burstRadius: 0,
    contactDamage: damage,
    hits: CONFIG.gun.hits,
  });
  for (let t = 0; t < 8 && w.shells.size > 0; t++) w.step();
}

describe('the minute schedule (spawnDrops)', () => {
  it("the first step after startZone scatters the minute-0 batch: dropCountFor(0) crates, every one an 'xp' crate", () => {
    const w = bareWorld();
    zoneAfterStep(w, 0);
    w.step();
    const drops = batch(w, 0);
    expect(drops).toHaveLength(dropCountFor(0, D));
    expect(w.drops.size).toBe(dropCountFor(0, D));
    for (const d of drops) {
      expect(Object.keys(d).sort()).toEqual(['id', 'kind', 'x', 'y']); // nothing but its kind
      expect(d.kind).toBe('xp'); // every airdrop is an XP crate (Story 12.4)
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
    const off = bareWorld(1008, { drops: false, supplyDrops: false }); // the supply crates are not the schedule
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

describe('placement (R1 — inside the live ring, off the land)', () => {
  function assertPlaced(w: World): void {
    const ring = w.zoneLiveRing;
    expect(w.drops.size).toBeGreaterThan(0);
    for (const d of w.drops.values()) {
      expect(d.x).toBe(Math.fround(d.x));
      expect(d.y).toBe(Math.fround(d.y));
      expect(Math.hypot(d.x - ring.cx, d.y - ring.cy)).toBeLessThanOrEqual(ring.r - D.radiusU + 1e-3);
      expect(islandClearance(d, w.map.islands)).toBeGreaterThan(SPAWN_ISLAND_CLEARANCE);
    }
  }

  it('the minute-0 batch on a real map clears land', () => {
    const w = new World(4242);
    zoneAfterStep(w, 0);
    w.step();
    assertPlaced(w);
  });

  it('a later batch (caught up mid-match) obeys the same rejections against that tick\'s ring', () => {
    const w = new World(777);
    zoneAfterStep(w, 3 * BEAT);
    w.step();
    assertPlaced(w);
  });

  it('a ring wholly on land skips every crate and LOGS it — never throws', () => {
    const w = bareWorld(1008, { supplyDrops: false });
    w.map.radius = D.radiusU * 40; // ring 0 is the map...
    w.map.islands.push(circleIsland(0, 0, w.map.radius * 2)); // ...and all of it is land
    zoneAfterStep(w, 0);
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

  it('a ring too small to hold a whole crate places none (the domain is never clamped to the centre)', () => {
    const w = bareWorld();
    w.map.radius = D.radiusU / 2; // ring 0 is the map: smaller than one crate
    zoneAfterStep(w, 0);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(() => w.step()).not.toThrow();
      expect(w.drops.size).toBe(0);
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
  it('a hull on an XP crate takes it: exactly xpLevels of a level through the XP door, dropsTaken 1, crate gone, ONE dp for it alone with no grant', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    const b = captain(w, 'b', 2000, 0); // the passive-XP control: same tick, no crate
    seatDrop(w, 'd1', 0, 0, 'xp');
    w.step();
    expect(xpMsOf(a) - xpMsOf(b)).toBe(CRATE_MS);
    expect(a.dropsTaken).toBe(1);
    expect(b.dropsTaken).toBe(0);
    expect(w.drops.has('d1')).toBe(false);
    const dp = dpEvents(w);
    expect(dp).toHaveLength(1);
    expect(dp[0]).toEqual({ k: 'dp', id: 'a', t: w.now, g: [] });
  });

  it('a wreck crate grants one +1 pick per victim level, merged per stat, every grant landing and the stats re-folded', () => {
    const levels = 7;
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    const before = { ...a.indexBonus };
    seatDrop(w, 'dw', 0, 0, 'wreck', levels);
    w.step();
    const g = dpEvents(w)[0].g;
    for (const r of g) expect(isDropRoll(r)).toBe(true);
    expect(new Set(g.map(([s]) => s)).size).toBe(g.length); // one pair per stat
    expect(g.reduce((sum, [, n]) => sum + n, 0)).toBe(levels);
    const expected = { ...before };
    for (const [s, n] of g) expected[s] += n;
    expect(a.indexBonus).toEqual(expected);
    expect(a.stats).toEqual(effectiveStats(a.cls, a.cards, CATALOG, a.indexBonus));
    expect(a.dropsTaken).toBe(1);
  });

  it('wreck pickups draw on per-pickup sub-streams: many wrecks of one size do not all grant alike', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    const grants = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      seatDrop(w, `d${i}`, 0, 0, 'wreck', 3);
      w.step();
      const dp = dpEvents(w);
      expect(dp).toHaveLength(1);
      grants.add(JSON.stringify(dp[0].g));
    }
    expect(a.dropsTaken).toBe(20);
    expect(grants.size).toBeGreaterThan(1);
  });

  it('the pickup roll is deterministic on the private stream: same seeds → same grants', () => {
    const grants = (): unknown[] => {
      const w = bareWorld(1008, { pseudonymSeed: 4711 });
      captain(w, 'a', 0, 0);
      const out: unknown[] = [];
      for (let i = 0; i < 6; i += 1) {
        seatDrop(w, `d${i}`, 0, 0, i % 2 === 0 ? 'xp' : 'wreck', i % 2 === 0 ? undefined : i);
        w.step();
        out.push(dpEvents(w)[0].g);
      }
      return out;
    };
    expect(grants()).toEqual(grants());
  });

  it('collection runs only while the match is live (xpEnabled): the results window grants nothing', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    const xpBefore = xpMsOf(a);
    seatDrop(w, 'd1', 0, 0, 'xp');
    w.xpEnabled = false;
    w.step();
    expect(w.drops.has('d1')).toBe(true);
    expect(xpMsOf(a)).toBe(xpBefore);
    expect(a.dropsTaken).toBe(0);
    expect(dpEvents(w)).toEqual([]);
    w.xpEnabled = true;
    w.step();
    expect(w.drops.has('d1')).toBe(false);
    expect(a.dropsTaken).toBe(1);
  });

  it('a crate out of reach stays on the water', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    seatDrop(w, 'd1', 1000, 0, 'xp');
    w.step();
    expect(w.drops.has('d1')).toBe(true);
    expect(a.dropsTaken).toBe(0);
    expect(dpEvents(w)).toEqual([]);
  });

  it('a SINKING hull over a crate collects nothing', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    const bonusBefore = { ...a.indexBonus };
    seatDrop(w, 'd1', 0, 0, 'wreck', 3);
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
    seatDrop(w, 'd1', 0, 0, 'xp');
    w.step();
    expect(a.dropsTaken).toBe(1);
    expect(b.dropsTaken).toBe(0);
    expect(dpEvents(w).map((e) => e.id)).toEqual(['a']);
  });

  it('a redeploy zeroes dropsTaken', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    seatDrop(w, 'd1', 0, 0, 'xp');
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
    seatDrop(w, 'in', ring.cx, ring.cy, 'xp');
    seatDrop(w, 'out', ring.cx + ring.r + D.radiusU, ring.cy, 'xp');
    w.step();
    expect(w.drops.has('in')).toBe(true);
    expect(w.drops.has('out')).toBe(false);
  });
});

describe('the wreck pickup (sinkShip, R2)', () => {
  it("once the zone has started, a sinking participant with a level leaves ONE crate of kind 'wreck' at its centre, carrying its level", () => {
    const w = liveWorld();
    leveled(captain(w, 'a', 123.4, -56.7), 5);
    w.sinkShip('a');
    const ws = wrecks(w);
    expect(ws).toHaveLength(1);
    expect([ws[0].x, ws[0].y]).toEqual([Math.fround(123.4), Math.fround(-56.7)]);
    expect(ws[0].kind).toBe('wreck');
    expect(ws[0].levels).toBe(5);
    w.sinkShip('a'); // the sink lock: no second wreck for the same death
    expect(wrecks(w)).toHaveLength(1);
  });

  it('a LEVEL-0 victim leaves no wreck (Eric 2026-11-19: "lvl 0 = none")', () => {
    const w = liveWorld();
    const a = captain(w, 'a', 0, 0);
    expect(a.level).toBe(0);
    w.sinkShip('a');
    expect(wrecks(w)).toHaveLength(0);
  });

  it("end to end: the victim's wreck, taken by another hull, grants exactly as many points as the victim had levels", () => {
    const w = liveWorld();
    leveled(captain(w, 'v', 0, 0), 4);
    const taker = captain(w, 't', 3000, 0);
    const before = { ...taker.indexBonus };
    w.sinkShip('v');
    const [wreck] = wrecks(w);
    taker.state = { x: wreck.x, y: wreck.y, heading: 0, speed: 0 };
    w.step();
    expect(w.drops.has(wreck.id)).toBe(false);
    let gained = 0;
    for (const k of CONFIG.xp.statRoll.indices) gained += taker.indexBonus[k] - before[k];
    expect(gained).toBe(4);
  });

  it('wreck pickups are placed even with the schedule switched off', () => {
    const w = bareWorld(1008, { drops: false });
    zoneAfterStep(w, 0);
    w.respawnEnabled = false;
    leveled(captain(w, 'a', 0, 0), 1);
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
    const w = liveWorld();
    const bot = leveled(w.addBot(undefined, undefined), 1);
    w.sinkShip(bot.id);
    expect(wrecks(w)).toHaveLength(1);
  });

  it('a hull that will RESPAWN (sandbox / pre-active practice, respawnEnabled) leaves no crate even after the zone starts', () => {
    const w = bareWorld();
    w.startZone(w.now);
    leveled(captain(w, 'a', 0, 0), 1);
    leveled(captain(w, 'b', 500, 0), 1);
    w.respawnEnabled = true;
    w.sinkShip('a');
    expect(wrecks(w)).toHaveLength(0);
    w.respawnEnabled = false;
    w.sinkShip('b');
    expect(wrecks(w)).toHaveLength(1);
  });

  it('a sink by damage with an EMPTY ledger (the storm) still leaves a crate', () => {
    const w = liveWorld();
    const a = leveled(captain(w, 'a', 0, 0), 1);
    expect(a.damageFrom.size).toBe(0);
    w.sinkShip('a'); // killer-less, NOT a scuttle: the storm's own call
    expect(wrecks(w)).toHaveLength(1);
  });
});

describe('the quitter wreck (Eric 2026-11-09: a scuttle leaves a wreck only IN COMBAT)', () => {
  const WINDOW = (): number => CONFIG.xp.assistWindowMs;

  it('a captain scuttled with no damage taken leaves NO crate (disconnected out of the blue)', () => {
    const w = liveWorld();
    leveled(captain(w, 'a', 0, 0), 1);
    w.sinkShip('a', undefined, { scuttle: true });
    expect(wrecks(w)).toHaveLength(0);
  });

  it('a captain hit by another hull 5 s ago and then scuttled leaves ONE wreck crate', () => {
    expect(WINDOW()).toBeGreaterThan(5000); // the case needs the hit inside the window
    const w = liveWorld();
    const a = leveled(captain(w, 'a', 0, 0), 1);
    captain(w, 'b', 0, 1500);
    hitHull(w, 'b', a, 1);
    expect(a.damageFrom.has('b')).toBe(true);
    w.now += 5000; // a clock jump: the case is about the ledger's age, not the sea between
    w.sinkShip('a', undefined, { scuttle: true });
    expect(wrecks(w)).toHaveLength(1);
  });

  it('a captain last hit assistWindowMs + 1 s ago and then scuttled leaves NO crate (the fight is over)', () => {
    const w = liveWorld();
    const a = leveled(captain(w, 'a', 0, 0), 1);
    captain(w, 'b', 0, 1500);
    hitHull(w, 'b', a, 1);
    expect(a.damageFrom.has('b')).toBe(true);
    w.now += WINDOW() + 1000;
    w.sinkShip('a', undefined, { scuttle: true });
    expect(wrecks(w)).toHaveLength(0);
  });

  it('through the REAL leave (Match.onPlayerLeave): in combat, a wreck; out of the blue, none', () => {
    const w = new World(1008);
    w.map.islands.length = 0;
    const hooks = { lock: () => {}, unlock: () => {}, broadcastResults: () => {}, requeue: () => {}, disconnect: () => {} };
    const m = new Match(w, { countdownMs: 100, resultsMs: 200, joinWindowMs: 0 }, hooks);
    for (const id of ['a', 'b', 'c', 'd']) {
      w.addShip(id, id.toUpperCase(), 'captain', undefined, undefined, undefined);
      m.notifyRosterChanged();
    }
    for (let i = 0; i < 100 && m.phase !== 'active'; i++) {
      w.step();
      m.update();
    }
    expect(m.phase).toBe('active');
    expect(w.respawnEnabled).toBe(false);
    const a = leveled(w.ships.get('a')!, 1);
    leveled(w.ships.get('c')!, 1);
    hitHull(w, 'b', a, 1);
    expect(a.damageFrom.has('b')).toBe(true);
    m.onPlayerLeave('a'); // in combat
    m.onPlayerLeave('c'); // never touched
    const ws = wrecks(w);
    expect(ws).toHaveLength(1);
    expect([ws[0].x, ws[0].y]).toEqual([Math.fround(a.state.x), Math.fround(a.state.y)]);
  });
});
