// THE RADAR BUOY (Story 7-5 wave 2, R2.7-R2.11) — directed behaviour suite.
// The perception INVARIANT work (the verifyBlip carve-out, verifyBuoy, the
// completeness extension, the leak-catch pin) lives in perception.test.ts
// with the other independently-reimplemented oracles; THIS file pins the
// buoy's world behaviour through the production APIs: placement lifecycle,
// the R2.8 relay (radar returns only, never vision), buoy-position island
// shadowing, the R2.9 anonymous self-paint, the R2.11 jamming rules (adds
// fakes, never deletes; owner exempt; deterministic per (buoy, sweep)), the
// R2.10 gun buoy, and R2.7's destructible-for-free rule (no XP, no feed
// line).

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  effectiveStats,
  paintCoverage,
  paintSegmentCoverage,
  resolveBoons,
  type BlipEvent,
  type FrameMsg,
  type HullCoverage,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { BUOY_SIZE_U, addBuoy, scatterJamFakes, type BuoyState } from '../game/equipment/index.js';
import { flatRaster, rasterFrom, ridgeField } from './islandFixture.js';

const TAU = Math.PI * 2;
const CELL = CONFIG.vision.radarCellU;
const SLOT_BUOY = 2; // the Mine Layer fit: [gun, mine, radarBuoy, empty]

/** Islands cleared AND the raster flattened (the perception.test idiom). */
function bareWorld(seed = 7): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster(1200);
  return w;
}

/** Add a captain and teleport it to an exact pose, beam PARKED zero-width. */
function place(w: World, id: string, x: number, y: number, heading = 0, cls: ShipClassId = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', cls);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  rec.sweepAngle = 0;
  rec.prevSweepAngle = 0;
  return rec;
}

/** Fit raw boon ids the way the fuzz does (ids + resolved defs + stats). */
function fitBoons(rec: ShipRecord, ids: string[]): void {
  rec.boons = ids;
  rec.boonDefs = resolveBoons(ids);
  rec.stats = effectiveStats(rec.cls, rec.boonDefs);
}

/** Open a SHIP's paint window around a bearing. */
function windowAround(me: ShipRecord, brg: number, halfWidth = 0.02): void {
  me.prevSweepAngle = (brg - halfWidth + TAU) % TAU;
  me.sweepAngle = (brg + halfWidth + TAU) % TAU;
}

/** Open a BUOY's own paint window around a bearing (same half-open rule). */
function buoyWindowAround(b: BuoyState, brg: number, halfWidth = 0.02): void {
  b.prevSweepAngle = (brg - halfWidth + TAU) % TAU;
  b.sweepAngle = (brg + halfWidth + TAU) % TAU;
}

/** A (nearly) full-circle paint window: every bearing in [0, 2π−ε) paints. */
function fullWindow(me: ShipRecord): void {
  me.prevSweepAngle = 0;
  me.sweepAngle = TAU - 1e-9;
}

const blipsOf = (f: FrameMsg): BlipEvent[] => f.events.filter((e): e is BlipEvent => e.k === 'blip');

/** EXACT footprint membership: some blip in the frame carries this mask. */
function hasMask(blips: readonly BlipEvent[], c: HullCoverage): boolean {
  return blips.some(
    (b) => b.gx === c.gx && b.gy === c.gy && b.w === c.w && b.h === c.h &&
      b.bits.length === c.bits.length && c.bits.every((v, i) => v === b.bits[i]),
  );
}

/** The expected mask of a SHIP pose this tick (the production pipeline —
 *  directed behaviour tests may consume it; oracle independence is
 *  perception.test.ts's discipline, not this file's). */
function shipMask(w: World, s: ShipRecord): HullCoverage {
  return paintCoverage(s.hullId, s.state.x, s.state.y, s.state.heading, CELL, w.now);
}

/** The buoy's own expected paint: the degenerate-segment square (R2.9). */
function buoyMask(w: World, b: BuoyState): HullCoverage {
  return paintSegmentCoverage(b.x, b.y, b.x, b.y, BUOY_SIZE_U, CELL, w.now);
}

// ---------- placement + lifecycle (R2.7) --------------------------------------

describe('radar buoy — placement + the one-buoy lifecycle (R2.7)', () => {
  it('a fireSeq click astern places the buoy AT the clicked point with the owner-stat life/hp/set', () => {
    const w = bareWorld();
    const ml = place(w, 'm', 0, 0, 0, 'mineLayer');
    w.submitInput('m', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 60, slot: SLOT_BUOY, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
    w.step();
    expect(w.buoys.size).toBe(1);
    const [b] = [...w.buoys.values()];
    expect(b.ownerId).toBe('m');
    expect(b.x).toBeCloseTo(ml.state.x - 60, 0); // astern 60u of a heading-0 hull
    expect(b.hp).toBe(CONFIG.radarBuoy.hp);
    expect(b.radarRange).toBe(CONFIG.radarBuoy.radarRange); // FLAT — never the owner's intel build
    expect(b.until).toBe(w.now + CONFIG.radarBuoy.durationMs); // fireT clamps to the apply tick (no RTT claim)
    expect(ml.loadout[SLOT_BUOY].state).toEqual({ n: 0, reloadMsLeft: CONFIG.radarBuoy.reloadMs });
  });

  it('life < reload: the buoy expires silently ~10s BEFORE the next charge, so a second live buoy is structurally impossible', () => {
    const w = bareWorld();
    const ml = place(w, 'm', 0, 0, 0, 'mineLayer');
    w.submitInput('m', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 60, slot: SLOT_BUOY, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
    w.step();
    expect(w.buoys.size).toBe(1);
    // Never two live at any tick, and expiry emits NOTHING.
    for (let t = 0; t < 700; t++) {
      w.step();
      expect(w.buoys.size).toBeLessThanOrEqual(1);
      expect(w.tickEvents.filter((e) => e.k === 'sunk')).toEqual([]);
    }
    expect(w.buoys.size).toBe(0); // 35s in: long expired
    // The dead gap really existed: at expiry (20s) the reload had ~10s to run.
    expect(CONFIG.radarBuoy.reloadMs - CONFIG.radarBuoy.durationMs).toBe(10000);
    expect(ml.loadout[SLOT_BUOY].state!.n).toBe(1); // recharged by 35s
  });
});

// ---------- R2.8: the relay is radar returns ONLY, from the buoy's position ---

describe('radar buoy — the relay (R2.8)', () => {
  it('(a) the owner receives a RETURN for a contact only the buoy can see — and NO contact/vision for it', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const e = place(w, 'e', 700, 0, 1.1); // 700u from a: beyond radar (660) AND sight
    const b = addBuoy(w.buoys, a, 500, 0, w.now, 'b1', 1);
    buoyWindowAround(b, 0); // the BUOY's beam crosses e this tick (e is 200u from it)
    const f = buildFrame(w, 'a');
    expect(f.contacts).toEqual([]); // NO vision, NO truesight, NO LOS — radar returns only
    const blips = blipsOf(f);
    expect(blips).toHaveLength(1);
    expect(hasMask(blips, shipMask(w, e))).toBe(true); // the identical anonymous footprint
    // Close the buoy's window: the relay stops — proving the return came
    // through the BUOY's own sweep, not any observer-side gate.
    buoyWindowAround(b, Math.PI);
    expect(blipsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('a relay never reaches anyone but the buoy\'s OWNER', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'v', 0, 2000); // a bystander, far from everything
    const e = place(w, 'e', 700, 0);
    const b = addBuoy(w.buoys, a, 500, 0, w.now, 'b1', 1);
    buoyWindowAround(b, 0);
    expect(blipsOf(buildFrame(w, 'a'))).toHaveLength(1);
    expect(hasMask(blipsOf(buildFrame(w, 'a')), shipMask(w, e))).toBe(true);
    expect(blipsOf(buildFrame(w, 'v'))).toEqual([]); // not the owner: nothing relayed
  });

  it('(b) hard terrain between BUOY and contact suppresses the relayed return (the shadow march runs from the buoy)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const e = place(w, 'e', 700, 0);
    const b = addBuoy(w.buoys, a, 500, 0, w.now, 'b1', 1);
    buoyWindowAround(b, 0);
    expect(hasMask(blipsOf(buildFrame(w, 'a')), shipMask(w, e))).toBe(true); // open water: relayed
    // A hard-cover ridge (q255 ≥ mast 64) between buoy (500) and target (700).
    w.map.heightRaster = rasterFrom(1200, ridgeField(600, 0, 30, 60));
    expect(blipsOf(buildFrame(w, 'a'))).toEqual([]); // the buoy's radar is blind through rock
  });
});

// ---------- R2.9: the buoy paints with its OWN profile, no owner identity -----

describe('radar buoy — the anonymous self-paint (R2.9)', () => {
  it('an enemy sweep paints the buoy as a small OWN-profile return carrying no id and no owner', () => {
    const w = bareWorld();
    const v = place(w, 'v', 0, 0);
    const j = place(w, 'j', 2000, 2000); // the owner, far away
    const b = addBuoy(w.buoys, j, 450, 0, w.now, 'b1', 1);
    windowAround(v, 0); // v's OWN beam crosses the buoy's bearing
    const blips = blipsOf(buildFrame(w, 'v'));
    expect(blips).toHaveLength(1);
    expect(hasMask(blips, buoyMask(w, b))).toBe(true); // the 12u square — never any hull's silhouette
    // The one blip grammar: coverage footprint keys ONLY (no id/by/owner).
    expect(Object.keys(blips[0]).sort()).toEqual(['bits', 'gx', 'gy', 'h', 'k', 't', 'w']);
    // And the up-close truth channel is absent beyond sight: no BuoyView.
    expect(buildFrame(w, 'v').buoys).toBeUndefined();
  });

  it('the BuoyView truth channel: owner always; an enemy only when SIGHTED (with `by` naming the owner)', () => {
    const w = bareWorld();
    const v = place(w, 'v', 0, 0);
    const j = place(w, 'j', 2000, 2000);
    const b = addBuoy(w.buoys, j, 100, 0, w.now, 'b1', 1); // inside v's truesight
    expect(buildFrame(w, 'j').buoys).toEqual([
      { id: 'b1', x: 100, y: 0, until: b.until, own: true, by: 'j' }, // owner: always, at any range
    ]);
    expect(buildFrame(w, 'v').buoys).toEqual([
      { id: 'b1', x: 100, y: 0, until: b.until, own: false, by: 'j' }, // sighted enemy: attributed
    ]);
    v.state.x = -600; // now 700u away — out of sight, out of the channel
    expect(buildFrame(w, 'v').buoys).toBeUndefined();
  });
});

// ---------- R2.11: the jamming buoy --------------------------------------------

describe('radar buoy — jamming (R2.11)', () => {
  it('(c) a jammed enemy receives the fakes AND the real return; the exempt owner receives only the real one', () => {
    const w = bareWorld();
    const v = place(w, 'v', 0, 0); // the jammed enemy
    const j = place(w, 'j', 1000, 0); // the buoy's owner (own beam parked)
    fitBoons(j, ['buoyJamming']);
    const bReal = addBuoy(w.buoys, j, 450, 0, w.now, 'b1', 305419896); // deterministic jamSeed
    const h = place(w, 'h', 480, 60, 1.25); // the REAL hull inside the jammed circle
    fullWindow(v); // v's whole scope paints this tick
    buoyWindowAround(bReal, Math.atan2(60, 30)); // the buoy's beam crosses h → relays to j
    const vBlips = blipsOf(buildFrame(w, 'v'));
    // THE REAL HULL STILL PAINTS — jamming ADDS, it never deletes.
    expect(hasMask(vBlips, shipMask(w, h))).toBe(true);
    // The buoy itself paints too (R2.9), concealed among its own fakes.
    expect(hasMask(vBlips, buoyMask(w, bReal))).toBe(true);
    // Every fake inside v's annulus is on v's wire, byte-exact — recomputed
    // from the same (jamSeed, epoch) contract the server used.
    const fakes = scatterJamFakes(bReal.jamSeed, bReal.jamEpoch, bReal.x, bReal.y, bReal.radarRange);
    const gated = fakes.filter((fk) => {
      const d = Math.hypot(fk.x, fk.y); // v is at the origin
      return d > v.stats.sightRange && d <= v.stats.radarRange;
    });
    expect(gated.length).toBeGreaterThan(0); // non-vacuous for this seed
    for (const fk of gated) {
      expect(hasMask(vBlips, paintCoverage(fk.cls, fk.x, fk.y, fk.heading, CELL, w.now))).toBe(true);
    }
    expect(vBlips).toHaveLength(2 + gated.length); // real + buoy paint + fakes, nothing else
    // THE OWNER IS EXEMPT: j's frame carries the relayed REAL hull and nothing
    // fabricated — no fake, no self-paint of its own buoy.
    const jBlips = blipsOf(buildFrame(w, 'j'));
    expect(jBlips).toHaveLength(1);
    expect(hasMask(jBlips, shipMask(w, h))).toBe(true);
  });

  it('(d) fakes are DETERMINISTIC per (buoy, sweep revolution) and re-scatter on each completed revolution', () => {
    // The pure contract: same (seed, epoch, circle) → identical set; a moved
    // epoch or seed → a different set.
    const one = scatterJamFakes(42, 0, 100, -50, 330);
    expect(scatterJamFakes(42, 0, 100, -50, 330)).toEqual(one);
    expect(one).toHaveLength(CONFIG.radarBuoy.jamFakes);
    for (const fk of one) {
      expect(Math.hypot(fk.x - 100, fk.y + 50)).toBeLessThanOrEqual(330); // inside the circle
    }
    expect(scatterJamFakes(42, 1, 100, -50, 330)).not.toEqual(one);
    expect(scatterJamFakes(43, 0, 100, -50, 330)).not.toEqual(one);
    // And the WORLD advances the epoch exactly once per buoy revolution: at
    // the base 15 RPM a revolution is 4s = 80 ticks.
    const w = bareWorld();
    const j = place(w, 'j', 0, 0);
    fitBoons(j, ['buoyJamming']);
    const b = addBuoy(w.buoys, j, 100, 0, w.now, 'b1', 42);
    const epoch0 = [...b.jamFakes];
    expect(epoch0).toEqual(scatterJamFakes(42, 0, 100, 0, 330));
    for (let t = 0; t < 79; t++) w.step();
    expect(b.jamEpoch).toBe(0); // one tick shy of a full revolution
    expect(b.jamFakes).toEqual(epoch0);
    w.step();
    expect(b.jamEpoch).toBe(1); // the revolution completed: re-scattered
    expect(b.jamFakes).toEqual(scatterJamFakes(42, 1, 100, 0, 330));
    expect(b.jamFakes).not.toEqual(epoch0);
  });

  it('a NON-jamming buoy emits no fakes (the verb gates emission, not the scatter)', () => {
    const w = bareWorld();
    const v = place(w, 'v', 0, 0);
    const j = place(w, 'j', 2000, 2000);
    addBuoy(w.buoys, j, 450, 100, w.now, 'b1', 42); // owner holds NO verb
    fullWindow(v);
    const blips = blipsOf(buildFrame(w, 'v'));
    expect(blips).toHaveLength(1); // the buoy's own honest paint, nothing else
  });
});

// ---------- R2.10: the gun buoy ------------------------------------------------

describe('radar buoy — the GUN BUOY (R2.10)', () => {
  it('auto-fires 5 damage on a 5s cooldown at a hostile inside its own 330u set, crediting kills to the OWNER', () => {
    const w = bareWorld();
    const j = place(w, 'j', 2000, 2000, 0, 'mineLayer');
    fitBoons(j, ['buoyGun']);
    addBuoy(w.buoys, j, 0, 0, w.now, 'b1', 1);
    const e = place(w, 'e', 200, 0); // an enemy captain inside the buoy's set
    const hp0 = e.hp;
    w.step();
    expect(e.hp).toBe(hp0 - CONFIG.radarBuoy.gunDamage); // first shot lands at once
    w.step();
    expect(e.hp).toBe(hp0 - CONFIG.radarBuoy.gunDamage); // cooling: no second shot next tick
    for (let t = 0; t < 100; t++) w.step(); // 5s later…
    expect(e.hp).toBe(hp0 - 2 * CONFIG.radarBuoy.gunDamage); // …exactly one more
    // The kill pays the OWNER through the ordinary sink path.
    e.hp = 1;
    w.respawnEnabled = false;
    for (let t = 0; t < 101; t++) w.step();
    expect(e.hp).toBeLessThanOrEqual(0);
    expect(j.kills).toBe(1); // credited like any of the owner's ordnance
  });

  it('R2.21: fires on a NEUTRAL drone it can see (autonomous — no aggro gate), aggroing NOBODY at the owner', () => {
    const w = bareWorld();
    const j = place(w, 'j', 2000, 2000, 0, 'mineLayer');
    addBuoy(w.buoys, j, 0, 0, w.now, 'b1', 1);
    const drone = w.addShip('fleet-1', 'CONVOY', 'fleet', 'droneSmall');
    drone.state.x = 150;
    drone.state.y = 0;
    drone.state.speed = 0;
    const far = place(w, 'e', 400, 0); // an enemy, but past the 330u set
    const dHp = drone.hp;
    const fHp = far.hp;
    w.step();
    expect(drone.hp).toBe(dHp); // no verb: nothing fires
    expect(far.hp).toBe(fHp);
    fitBoons(j, ['buoyGun']);
    w.step();
    // R2.10's aggro-gated hostile would have refused this NEUTRAL drone —
    // R2.21 shoots anything the buoy's own radar sees that isn't the owner.
    expect(drone.hp).toBe(dHp - CONFIG.radarBuoy.gunDamage);
    expect(far.hp).toBe(fHp); // the set is the buoy's own radar range, not the map
    // R2.21a: the hit aggros nobody — the owner never inherits the turret's fight.
    expect(w.drones.isTargeting('fleet-1', 'j')).toBe(false);
  });

  it('R2.21: picks the target NEAREST TO THE BUOY, and never one its own radar cannot see (hard terrain)', () => {
    const w = bareWorld();
    const j = place(w, 'j', 2000, 2000, 0, 'mineLayer');
    fitBoons(j, ['buoyGun']);
    addBuoy(w.buoys, j, 0, 0, w.now, 'b1', 1);
    const near = place(w, 'n', 120, 0); // nearest to the BUOY (the owner's position is irrelevant)
    const farther = place(w, 'f', 0, 250);
    const nHp = near.hp;
    const fHp = farther.hp;
    w.step();
    expect(near.hp).toBe(nHp - CONFIG.radarBuoy.gunDamage); // nearest-to-buoy wins
    expect(farther.hp).toBe(fHp);
    // Hard cover between buoy and the near target: its radar is blind on that
    // bearing, so the gun retargets what it CAN see — perception bounds the
    // weapon, not bare distance.
    w.map.heightRaster = rasterFrom(1200, ridgeField(60, 0, 20, 40));
    for (let t = 0; t < 100; t++) w.step(); // through the next cooldown
    expect(near.hp).toBe(nHp - CONFIG.radarBuoy.gunDamage); // never shot through the ridge
    expect(farther.hp).toBe(fHp - CONFIG.radarBuoy.gunDamage); // the visible one takes the round
  });
});

// ---------- R2.7: destructible for free ----------------------------------------

describe('radar buoy — destructible by ordinary weapons, paying nothing (R2.7)', () => {
  it('(f) a gun burst destroys the buoy: no XP, no kill-feed line, no tally — and the shooter still gets a Hit Call', () => {
    const w = bareWorld();
    w.xpEnabled = false; // isolate: any XP would be a payment, not the passive tick
    const k = place(w, 'k', 0, 0);
    const j = place(w, 'j', 2000, 2000);
    const b = addBuoy(w.buoys, j, 100, 0, w.now, 'b1', 1);
    b.hp = 8; // one 10-damage burst finishes it
    // Burst point 20u ABEAM of the buoy (never on its silhouette), so the
    // shell flies past and the BURST — not an interception — resolves it.
    w.shells.set('s1', {
      id: 's1', ownerId: 'k', x: 60, y: 20, vx: CONFIG.gun.shellSpeed, vy: 0,
      distLeft: 40, bornAt: w.now, kind: 'shell', damage: 10,
      hitRadius: CONFIG.gun.shellRadius, targetX: 100, targetY: 20,
      burstRadius: CONFIG.gun.burstRadius, contactDamage: CONFIG.gun.contactDamage,
    });
    const xp0 = k.xpMs + k.level * CONFIG.xp.levelMs;
    w.step();
    w.step(); // the shell needs two 25u sub-flights to reach its burst point
    expect(w.buoys.size).toBe(0); // destroyed
    expect(k.xpMs + k.level * CONFIG.xp.levelMs).toBe(xp0); // NO XP
    expect(k.kills).toBe(0); // NO tally
    expect(w.tickEvents.filter((e) => e.k === 'sunk')).toEqual([]); // NO feed line
    // Something of the shooter's CONNECTED: the Hit Call is honest.
    expect(w.tickEvents.some((e) => e.k === 'hc' && e.id === 'k')).toBe(true);
  });

  it('a mine BLAST damages a buoy inside it, but a buoy never TRIPS a mine', () => {
    const w = bareWorld();
    const m = place(w, 'm', 500, 500, 0, 'mineLayer');
    const j = place(w, 'j', 2000, 2000);
    const b = addBuoy(w.buoys, j, 0, 0, w.now, 'b1', 1);
    // An armed enemy mine right next to the buoy: the buoy is NOT a hull, so
    // nothing trips — both persist indefinitely.
    w.mines.set('mine1', { id: 'mine1', ownerId: 'm', x: 10, y: 0, armedAt: 0 });
    for (let t = 0; t < 40; t++) w.step();
    expect(w.mines.size).toBe(1);
    expect(w.buoys.size).toBe(1);
    // A hull trips it — and the blast bites the buoy standing inside it.
    const e = place(w, 'e', 10, CONFIG.mine.triggerRadius - 1);
    void e;
    const hp0 = b.hp;
    w.step();
    expect(w.mines.size).toBe(0); // tripped by the HULL
    expect(b.hp).toBe(hp0 - CONFIG.mine.damage); // the buoy pays blast damage
  });
});
