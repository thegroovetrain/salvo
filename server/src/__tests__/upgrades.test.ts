// Upgrade-point economy. Covers the earn hook in sinkShip (who banks a point,
// who never does, determinism of the pre-rolled offers off the decorrelated
// rng stream), the FIFO offer queue (front-on-the-wire, reroll-proof),
// spendPoint's fail-closed validation table, the heal spend (clamp, alive-only,
// full-hp rejection with the point preserved), the lifecycle rules (respawn
// preserves offers, redeployShip wipes them), wire privacy (pts/offer/pt/heal
// are self-private), the spend-time side effects (hull heal, +1 loaded round),
// and every stat consumer: per-observer sight/radar/sweep in perception,
// effective gun reload, torpedo launch speed on the wire, mine maxLive threaded
// from the owner's stats, and maxSpeed kinematics in stepShips.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  HEAL_CHOICE,
  SLOT_GUN,
  UPGRADE_IDS,
  effectiveStats,
  zeroUpgrades,
  type BallisticEvent,
  type BlipEvent,
  type FrameMsg,
  type GameEvent,
  type UpgradeId,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;
const DT = CONFIG.tick.simDtMs;
const HEAL = CONFIG.upgradePoints.healHp;
/** Torpedo / mine slot indices under the universal fit. */
const SLOT_TORPEDO = 1;
const SLOT_MINE = 2;

function bareWorld(seed = 1): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase());
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

/** Open the observer's paint window around a bearing (without stepping). */
function windowAround(me: ShipRecord, brg: number, halfWidth = 0.02): void {
  const wrap = (a: number): number => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  me.prevSweepAngle = wrap(brg - halfWidth);
  me.sweepAngle = wrap(brg + halfWidth);
}

/** Stack `count` upgrades of one type through the real spend-application seam. */
function stack(w: World, ship: ShipRecord, type: UpgradeId, count: number): void {
  for (let i = 0; i < count; i++) w.applyUpgrade(ship, type);
}

/** Bank `n` points on `killer` through the REAL earn path (attributed kills). */
function bank(w: World, killer: ShipRecord, n: number): void {
  for (let i = 0; i < n; i++) {
    const v = place(w, `victim-${killer.id}-${killer.offers.length}-${i}`, 500, 0);
    w.sinkShip(v.id, killer.id);
    w.removeShip(v.id);
  }
}

const upgsOf = (events: readonly GameEvent[]) => events.filter((e) => e.k === 'upg');
const ptsOf = (events: readonly GameEvent[]) => events.filter((e) => e.k === 'pt');
const healsOf = (events: readonly GameEvent[]) => events.filter((e) => e.k === 'heal');
const blipsOf = (f: FrameMsg) => f.events.filter((e): e is BlipEvent => e.k === 'blip');
const ballisticsOf = (f: FrameMsg) =>
  f.events.filter((e): e is BallisticEvent => e.k === 'shell' || e.k === 'torp');

// ---------- earn hook (sinkShip) ----------------------------------------------

describe('point earn — who banks one', () => {
  it('an attributed kill banks ONE point (stats untouched) + a self-private pt event', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    w.step(); // flush joins
    w.sinkShip('b', 'a');
    w.step();
    expect(a.offers).toHaveLength(1);
    // Earning applies NOTHING: the build and cached stats are the zero-upgrade identity.
    expect(a.upgrades).toEqual(zeroUpgrades());
    expect(a.stats).toEqual(effectiveStats(a.cls, zeroUpgrades()));
    expect(upgsOf(w.tickEvents)).toEqual([]); // upg fires at SPEND time, never at earn
    // Exactly one pt event, visible ONLY to the killer.
    const fa = buildFrame(w, 'a');
    expect(ptsOf(fa.events)).toEqual([{ k: 'pt', id: 'a' }]);
    expect(ptsOf(buildFrame(w, 'b').events)).toEqual([]);
  });

  it('a storm death (no killer) banks nothing', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    w.step();
    w.sinkShip('b'); // by=undefined — the storm has no killer
    w.step();
    expect(a.offers).toEqual([]);
    expect(ptsOf(w.tickEvents)).toEqual([]);
  });

  it('a self-kill banks nothing', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step();
    w.sinkShip('a', 'a');
    w.step();
    expect(a.offers).toEqual([]);
    expect(ptsOf(w.tickEvents)).toEqual([]);
  });

  it('a killer who already left the room banks nothing and does not crash', () => {
    const w = bareWorld();
    place(w, 'b', 100, 0);
    w.step();
    expect(() => w.sinkShip('b', 'gone')).not.toThrow();
    w.step();
    expect(ptsOf(w.tickEvents)).toEqual([]);
  });

  it('a DEAD killer (mutual destruction) still banks the point', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    w.step();
    w.sinkShip('a', 'b'); // a dies first...
    w.sinkShip('b', 'a'); // ...but its torpedo still lands
    w.step();
    expect(a.offers).toHaveLength(1);
    expect(a.alive).toBe(false);
    expect(a.hp).toBe(0); // earning is inert — a corpse banks, nothing heals
  });

  it('offers are deterministic per seed (reproducible kill sequence → same offers)', () => {
    const run = (): UpgradeId[][] => {
      const w = bareWorld(777);
      const a = place(w, 'a', 0, 0);
      w.step();
      for (let i = 0; i < 6; i++) {
        const victim = place(w, `v${i}`, 300, 0);
        w.step();
        w.sinkShip(victim.id, 'a');
        w.step();
        w.removeShip(victim.id);
      }
      return a.offers.map((o) => [...o]);
    };
    const first = run();
    expect(first).toHaveLength(6);
    for (const offer of first) {
      expect(offer).toHaveLength(3);
      for (const type of offer) expect(UPGRADE_IDS).toContain(type);
    }
    expect(run()).toEqual(first); // same seed, same stream, same offer contents
  });
});

// ---------- the FIFO offer queue -----------------------------------------------

describe('offer queue — FIFO, front on the wire, reroll-proof', () => {
  it('3 kills queue 3 offers; spend applies exactly the FRONT slot, then surfaces the next', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step();
    bank(w, a, 3);
    w.step();
    expect(a.offers).toHaveLength(3);
    const first = [...a.offers[0]];
    const second = [...a.offers[1]];
    const f1 = buildFrame(w, 'a');
    expect(f1.you!.pts).toBe(3);
    expect(f1.you!.offer).toEqual(first.map((t) => UPGRADE_IDS.indexOf(t)));
    expect(w.spendPoint('a', 1)).toBe(true);
    // Exactly offers[0][1] was applied — the count that moved matches the id.
    expect(a.upgrades[UPGRADE_IDS.indexOf(first[1])]).toBe(1);
    expect(a.upgrades.reduce((s, n) => s + n, 0)).toBe(1);
    expect(a.stats).toEqual(effectiveStats(a.cls, a.upgrades));
    const f2 = buildFrame(w, 'a');
    expect(f2.you!.pts).toBe(2);
    expect(f2.you!.offer).toEqual(second.map((t) => UPGRADE_IDS.indexOf(t))); // former 2nd, now front
  });

  it('the front offer is reroll-proof: identical across consecutive frames with no spend', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step();
    bank(w, a, 1);
    const f1 = buildFrame(w, 'a');
    w.step();
    w.step();
    const f2 = buildFrame(w, 'a');
    expect(f2.you!.offer).toEqual(f1.you!.offer); // closing/reopening the window can't reroll
    expect(f2.you!.offer).toHaveLength(3);
  });
});

// ---------- spendPoint validation (the wire entry, fail-closed) -----------------

describe('spendPoint — validation table', () => {
  it('rejects an unknown ship and an empty bank', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    expect(w.spendPoint('ghost', 0)).toBe(false);
    expect(w.spendPoint('a', 0)).toBe(false); // nothing banked yet
  });

  it('rejects every malformed choice, leaving the queue untouched', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step();
    bank(w, a, 1);
    const offer = [...a.offers[0]];
    const bad: unknown[] = [-1, 4, 1.5, '1', null, undefined, Number.NaN];
    for (const choice of bad) {
      expect(w.spendPoint('a', choice)).toBe(false);
    }
    expect(a.offers).toHaveLength(1);
    expect([...a.offers[0]]).toEqual(offer); // untouched, not rerolled
    expect(a.upgrades).toEqual(zeroUpgrades());
  });

  it('a valid slot applies the upgrade, recomputes stats, and emits a self-private upg', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    w.step();
    bank(w, a, 1);
    w.step(); // flush the earn tick's pt/sunk events
    const expected = a.offers[0][2];
    expect(w.spendPoint('a', 2)).toBe(true);
    expect(a.offers).toEqual([]);
    expect(a.upgrades[UPGRADE_IDS.indexOf(expected)]).toBe(1);
    expect(a.stats).toEqual(effectiveStats(a.cls, a.upgrades));
    w.step();
    const upgs = upgsOf(buildFrame(w, 'a').events);
    expect(upgs).toEqual([{ k: 'upg', id: 'a', type: expected }]);
    expect(upgsOf(buildFrame(w, 'b').events)).toEqual([]); // self-private, like at earn
  });

  it('upgrades ARE spendable while dead (builds persist across respawn)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step();
    bank(w, a, 1);
    w.sinkShip('a'); // storm — a is a corpse with a banked point
    const expected = a.offers[0][0];
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.upgrades[UPGRADE_IDS.indexOf(expected)]).toBe(1);
  });
});

// ---------- the heal spend -------------------------------------------------------

describe('spendPoint — heal (HEAL_CHOICE)', () => {
  it('heals exactly healHp on a damaged hull, consuming the front offer', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    w.step();
    bank(w, a, 1);
    w.step();
    a.hp = a.stats.maxHp - 60;
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    expect(a.hp).toBe(a.stats.maxHp - 60 + HEAL);
    expect(a.offers).toEqual([]);
    w.step();
    // The heal event carries the ACTUAL delta and is self-private.
    expect(healsOf(buildFrame(w, 'a').events)).toEqual([{ k: 'heal', id: 'a', amount: HEAL }]);
    expect(healsOf(buildFrame(w, 'b').events)).toEqual([]);
  });

  it('clamps to the missing hp near full — the event carries the clamped remainder', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step();
    bank(w, a, 1);
    a.hp = a.stats.maxHp - 10;
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    expect(a.hp).toBe(a.stats.maxHp);
    w.step();
    expect(healsOf(w.tickEvents)).toEqual([{ k: 'heal', id: 'a', amount: 10 }]);
  });

  it('rejects a heal while dead — the point is PRESERVED', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step();
    bank(w, a, 1);
    w.sinkShip('a');
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(false);
    expect(a.offers).toHaveLength(1);
  });

  it('rejects a heal at full hp — the point is PRESERVED', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step();
    bank(w, a, 1);
    expect(a.hp).toBe(a.stats.maxHp);
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(false);
    expect(a.offers).toHaveLength(1);
    w.step();
    expect(healsOf(w.tickEvents)).toEqual([]);
  });
});

// ---------- lifecycle: respawn preserves, redeploy wipes ----------------------

describe('upgrade lifecycle', () => {
  it('respawn (waiting phase) PRESERVES the build: counts, stats, effective hp + pools', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stack(w, a, 'hullPoints', 1);
    stack(w, a, 'torpedoAmmo', 1); // gunAmmo is neutralized (pinned pool) — torpedo pins the effective-pool rebuild
    w.sinkShip('a');
    for (let i = 0; i <= CONFIG.ship.respawnDelay / DT; i++) w.step();
    expect(a.alive).toBe(true);
    expect(a.upgrades[UPGRADE_IDS.indexOf('hullPoints')]).toBe(1);
    expect(a.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp + CONFIG.upgrades.hullPoints.add); // effective max
    expect(a.loadout[SLOT_TORPEDO].state).toEqual({ n: CONFIG.torpedo.maxAmmo + 1, reloadMsLeft: 0 }); // effective pool
  });

  it('respawn (waiting phase) PRESERVES banked offers, contents intact', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step();
    bank(w, a, 2);
    const offers = a.offers.map((o) => [...o]);
    w.sinkShip('a');
    for (let i = 0; i <= CONFIG.ship.respawnDelay / DT; i++) w.step();
    expect(a.alive).toBe(true);
    expect(a.offers.map((o) => [...o])).toEqual(offers);
  });

  it('redeployShip (match start) WIPES the build: counts zero, stats revert to base', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stack(w, a, 'maxSpeed', 2);
    stack(w, a, 'hullPoints', 1);
    w.resetForMatchStart();
    expect(a.upgrades).toEqual(zeroUpgrades());
    expect(a.stats).toEqual(effectiveStats(a.cls, zeroUpgrades()));
    expect(a.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp);
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: CONFIG.gun.maxAmmo, reloadMsLeft: 0 });
  });

  it('redeployShip (match start) WIPES banked offers too — no head start into the match', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step();
    bank(w, a, 2);
    w.resetForMatchStart();
    expect(a.offers).toEqual([]);
  });
});

// ---------- spend-time side effects (applyUpgrade) ------------------------------

describe('spend side effects', () => {
  it('hullPoints heals +add, clamped to the new effective max', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const base = CONFIG.shipClasses.torpedoBoat.hp; // 70 (default class)
    const add = CONFIG.upgrades.hullPoints.add; // 20
    a.hp = 50;
    w.applyUpgrade(a, 'hullPoints');
    expect(a.stats.maxHp).toBe(base + add); // 90
    expect(a.hp).toBe(50 + add); // 70
    a.hp = a.stats.maxHp; // full at 90
    w.applyUpgrade(a, 'hullPoints'); // max -> 110, heal 90+20 = 110 (clamp exact)
    expect(a.hp).toBe(base + 2 * add);
    expect(a.hp).toBeLessThanOrEqual(a.stats.maxHp);
  });

  it('gunAmmo is NEUTRALIZED (interregnum): count moves, but the single-shot pool stays pinned at 1', () => {
    // Eric ruling 2026-07-21: the id stays spendable for wire stability (a
    // pre-rolled legacy offer may still name it) but effectiveStats pins the
    // gun pool to 1, so the grant's +1 load clamps to a full pool — no effect.
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    expect(a.loadout[SLOT_GUN].state!.n).toBe(CONFIG.gun.maxAmmo);
    w.applyUpgrade(a, 'gunAmmo');
    expect(a.upgrades[UPGRADE_IDS.indexOf('gunAmmo')]).toBe(1); // the count DID increment
    expect(a.stats.gun.maxAmmo).toBe(CONFIG.gun.maxAmmo); // pinned: still the 1-round pool
    expect(a.loadout[SLOT_GUN].state!.n).toBe(CONFIG.gun.maxAmmo); // clamp holds the pool at 1
  });

  it('gunAmmo mid-cooldown leaves the gun pool UNTOUCHED: no free round bypassing the reload', () => {
    // The real hazard the guard closes: a spent gun (n=0, reloadMsLeft>0) must
    // NOT gain a loaded round from a gunAmmo spend — that would hand out a free
    // shot mid-cooldown. Count increments; the pool (n AND reloadMsLeft) is inert.
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.loadout[SLOT_GUN].state!.n = 0;
    a.loadout[SLOT_GUN].state!.reloadMsLeft = 1234; // mid-cooldown
    w.applyUpgrade(a, 'gunAmmo');
    expect(a.upgrades[UPGRADE_IDS.indexOf('gunAmmo')]).toBe(1); // count still moves
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0); // NO free round loaded
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(1234); // cooldown untouched
  });

  it('torpedoAmmo grants +1 loaded round, clamped to the new effective pool', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyUpgrade(a, 'torpedoAmmo');
    expect(a.stats.torpedo.maxAmmo).toBe(CONFIG.torpedo.maxAmmo + 1);
    expect(a.loadout[SLOT_TORPEDO].state!.n).toBe(CONFIG.torpedo.maxAmmo + 1); // +1 current, at the new cap
    a.loadout[SLOT_TORPEDO].state!.n = 0; // empty tube mid-reload
    w.applyUpgrade(a, 'torpedoAmmo');
    expect(a.loadout[SLOT_TORPEDO].state!.n).toBe(1); // immediately usable
  });

  it('non-hull, non-ammo spends leave hp and loaded rounds untouched', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp = 60;
    const before = a.loadout.map((s) => (s.state ? { ...s.state } : null));
    w.applyUpgrade(a, 'sightRange');
    w.applyUpgrade(a, 'gunReload');
    expect(a.hp).toBe(60);
    expect(a.loadout.map((s) => (s.state ? { ...s.state } : null))).toEqual(before);
  });
});

// ---------- wire privacy: pts/offer/pt/heal are self-private --------------------

describe('wire privacy — banked points never leak', () => {
  it("own frame: pts counts the queue, offer is the FRONT offer as valid UPGRADE_IDS indices", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step();
    bank(w, a, 2);
    const f = buildFrame(w, 'a');
    expect(f.you!.pts).toBe(2);
    expect(f.you!.offer).toHaveLength(3);
    for (const idx of f.you!.offer) {
      expect(Number.isInteger(idx)).toBe(true);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(UPGRADE_IDS.length);
    }
    expect(f.you!.offer.map((i) => UPGRADE_IDS[i])).toEqual([...a.offers[0]]);
  });

  it("another ship's frame carries no pt/heal events, and its contacts carry no pts/offer", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0); // inside a's AND b's sight — b sees a as a contact
    w.step();
    bank(w, a, 2);
    a.hp = a.stats.maxHp - 30;
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    w.step(); // pt (earn) + heal (spend) events flush this tick
    const fb = buildFrame(w, 'b');
    expect(ptsOf(fb.events)).toEqual([]);
    expect(healsOf(fb.events)).toEqual([]);
    const contact = fb.contacts.find((c) => c.id === 'a')!;
    expect(contact).toBeDefined();
    expect('pts' in contact).toBe(false);
    expect('offer' in contact).toBe(false);
  });
});

// ---------- perception: per-observer effective vision --------------------------

describe('per-observer sight (sightRange upgrade)', () => {
  const target = SIGHT + 20; // between base sight and one-stack sight (220*1.12=246.4)

  it('a sight-upgraded observer sees a CONTACT at a distance an un-upgraded one does not', () => {
    // Two observer/target pairs at the IDENTICAL offset (sight+20), pairs far
    // enough apart that neither pair pollutes the other's contacts.
    const w = bareWorld();
    const up = place(w, 'up', -400, 0);
    place(w, 'upTarget', -400 + target, 0);
    place(w, 'base', 400, 0);
    place(w, 'baseTarget', 400 + target, 0);
    stack(w, up, 'sightRange', 1);
    expect(buildFrame(w, 'up').contacts.map((c) => c.id)).toEqual(['upTarget']);
    expect(buildFrame(w, 'base').contacts.map((c) => c.id)).toEqual([]);
  });

  it('a sight-upgraded observer gets the ballistic first-sight reveal at the wider radius', () => {
    const w = bareWorld();
    const up = place(w, 'up', 0, 0);
    place(w, 'base', 0, 0);
    place(w, 'owner', 700, 0);
    stack(w, up, 'sightRange', 1);
    w.shells.set('s1', {
      id: 's1', ownerId: 'owner', x: target, y: 0, vx: -CONFIG.gun.shellSpeed, vy: 0,
      distLeft: 400, bornAt: w.now, kind: 'shell', damage: CONFIG.gun.damage,
      hitRadius: CONFIG.gun.shellRadius,
      targetX: null, targetY: null, burstRadius: 0, contactDamage: CONFIG.gun.contactDamage,
    });
    expect(ballisticsOf(buildFrame(w, 'up')).map((e) => e.id)).toEqual(['s1']);
    expect(ballisticsOf(buildFrame(w, 'base'))).toEqual([]);
  });

  it('a sight-upgraded observer sees an enemy MINE at the wider radius', () => {
    const w = bareWorld();
    const up = place(w, 'up', 0, 0);
    place(w, 'base', 0, 0);
    stack(w, up, 'sightRange', 1);
    w.mines.set('m1', { id: 'm1', ownerId: 'x', x: target, y: 0, armedAt: 0 });
    expect(buildFrame(w, 'up').mines.map((m) => m.id)).toEqual(['m1']);
    expect(buildFrame(w, 'base').mines).toEqual([]);
  });

  it('a sight-upgraded observer keeps the victim id on a boom a base observer must strip', () => {
    const w = bareWorld();
    const up = place(w, 'up', 0, 0);
    place(w, 'base', 0, 0);
    place(w, 'victim', target, 0);
    stack(w, up, 'sightRange', 1);
    // A boom AT the base sight boundary, striking the victim whose center
    // (at `target`) only the upgraded observer can sight. Routed through the
    // real chokepoint via the world's pending-events queue.
    const boom = { k: 'boom' as const, id: 'x1', hit: 'victim', x: SIGHT - 1, y: 0 };
    interface Pendable { pending: GameEvent[] }
    (w as unknown as Pendable).pending.push(boom);
    w.step();
    const upBoom = buildFrame(w, 'up').events.find((e) => e.k === 'boom');
    const baseBoom = buildFrame(w, 'base').events.find((e) => e.k === 'boom');
    expect(upBoom).toBeDefined();
    expect(baseBoom).toBeDefined();
    expect((upBoom as { hit?: string }).hit).toBe('victim'); // center sighted at 240u
    expect((baseBoom as { hit?: string }).hit).toBeUndefined(); // stripped: center fogged
  });
});

describe('per-observer radar (radarRange upgrade)', () => {
  it('paints a blip in the widened annulus that a base observer cannot reach', () => {
    const target = RADAR + 40; // between base radar and one-stack radar (650*1.15=747.5)
    const w = bareWorld();
    const up = place(w, 'up', 0, 0);
    const base = place(w, 'base', 0, 0);
    place(w, 'target', target, 0);
    stack(w, up, 'radarRange', 1);
    windowAround(up, 0);
    windowAround(base, 0);
    expect(blipsOf(buildFrame(w, 'up')).map((e) => e.id)).toEqual(['target']);
    expect(blipsOf(buildFrame(w, 'base'))).toEqual([]);
  });
});

describe('per-observer sweep (sweepSpeed upgrade)', () => {
  it('an upgraded sweep completes a revolution proportionally faster', () => {
    const w = bareWorld();
    const up = place(w, 'up', 0, 0);
    const base = place(w, 'base', 0, 0);
    stack(w, up, 'sweepSpeed', 1);
    const ticks = 20; // 1s — well inside the first (shorter) revolution
    for (let i = 0; i < ticks; i++) w.step();
    const factor = CONFIG.upgrades.sweepSpeed.periodMult;
    expect(base.sweepAngle).toBeCloseTo((2 * Math.PI * ticks * DT) / CONFIG.vision.sweepPeriod, 9);
    expect(up.sweepAngle).toBeCloseTo(base.sweepAngle / factor, 9);
  });
});

// ---------- weapon consumers ----------------------------------------------------

describe('effective weapon stats in the fire path', () => {
  it('gunReload: a consumed round starts the EFFECTIVE (shorter) reload', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stack(w, a, 'gunReload', 1);
    a.input = { seq: 1, throttle: 0, rudder: 0, aim: Math.PI / 2, fireSeq: 1, aimDist: 300, slot: SLOT_GUN, fireT: 0 };
    w.step();
    expect(a.loadout[SLOT_GUN].state!.n).toBe(CONFIG.gun.maxAmmo - 1);
    // consume() set the timer to the effective reload, then the same tick's
    // fireControl had already run tickReload BEFORE the click (full pool, 0).
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBeCloseTo(CONFIG.gun.reloadMs * CONFIG.upgrades.gunReload.mult, 9);
  });

  it('torpedoSpeed: the launched fish is faster, and ONLY vx/vy change on the wire event', () => {
    const launch = (upgraded: boolean): BallisticEvent => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      if (upgraded) stack(w, a, 'torpedoSpeed', 1);
      w.step(); // flush join spawn + the upg event
      a.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, slot: SLOT_TORPEDO, fireT: 0 };
      w.step();
      const ev = w.tickEvents.find((e): e is BallisticEvent => e.k === 'torp');
      expect(ev).toBeDefined();
      return ev!;
    };
    const base = launch(false);
    const fast = launch(true);
    expect(Math.hypot(base.vx, base.vy)).toBeCloseTo(CONFIG.torpedo.speed, 6);
    expect(Math.hypot(fast.vx, fast.vy)).toBeCloseTo(CONFIG.torpedo.speed * CONFIG.upgrades.torpedoSpeed.mult, 6);
    // Same constant-free wire shape — the speed rides the velocity, nothing else.
    expect(Object.keys(fast).sort()).toEqual(Object.keys(base).sort());
    expect(Object.keys(fast).sort()).toEqual(['id', 'k', 't', 'vx', 'vy', 'x', 'y']);
    expect({ x: fast.x, y: fast.y }).toEqual({ x: base.x, y: base.y }); // same muzzle offset
  });

  it("mine maxLive comes from the OWNER's stats: an upgraded owner keeps one more mine live", () => {
    const dropMines = (upgraded: boolean, drops: number): number => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      if (upgraded) stack(w, a, 'maxMines', 1);
      w.step();
      for (let i = 0; i < drops; i++) {
        a.loadout[SLOT_MINE].state = { n: 1, reloadMsLeft: 0 }; // skip the reload wait
        w.submitInput('a', {
          seq: i + 1, throttle: 0, rudder: 0, aim: 0,
          fireSeq: i + 1, aimDist: 0, slot: SLOT_MINE, fireT: 0,
        });
        w.step();
      }
      return w.mines.size;
    };
    expect(dropMines(false, 5)).toBe(CONFIG.mine.maxLive); // base cap: oldest evicted
    expect(dropMines(true, 5)).toBe(CONFIG.mine.maxLive + 1); // upgraded owner's cap
  });

  it('maxSpeed: an upgraded hull out-runs an identical un-upgraded twin', () => {
    const w = bareWorld();
    const up = place(w, 'up', 0, -200);
    place(w, 'base', 0, 200);
    stack(w, up, 'maxSpeed', 2);
    for (let tick = 1; tick <= 200; tick++) {
      w.submitInput('up', { seq: tick, throttle: 1, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0 });
      w.submitInput('base', { seq: tick, throttle: 1, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0 });
      w.step();
    }
    const f = CONFIG.upgrades.maxSpeed.mult ** 2;
    expect(w.ships.get('up')!.state.speed).toBeCloseTo(CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed * f, 6);
    expect(w.ships.get('base')!.state.speed).toBeCloseTo(CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed, 6);
  });
});
