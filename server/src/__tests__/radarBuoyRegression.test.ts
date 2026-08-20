// THE ERIC PLAYTEST REGRESSIONS (Story 7-5 fix cycle, 2026-08-19/20) — both
// defects reproduced through the PRODUCTION drop path (submitInput → activate
// → dropBuoy → spawnBuoy), never a hand-injected fixture: the shipped suite
// drove everything through addBuoy and both defects sailed past it.
//
// Defect 1 — "it has no radar sweep… where the fuck is that?" / "It gets its
// own returns. I just get to see them as the owner." The R2.8 relay merged the
// buoy's returns into the owner's untagged blip stream, so the client priced
// them from the OWNER (rim-band or minPeak-speck intensity) and drew no sweep
// at the buoy. Fixed: the buoy's returns arrive TAGGED `src: <buoy id>`
// (PV 44) as the buoy's OWN scope.
//
// Defect 2 — "It fires a muzzle flash, but even if its in LOS range there is
// no projectile and it deals no damage to anything." The turret was HITSCAN:
// hp genuinely fell, but nothing was observable — no projectile, no Hit Call,
// and `dmg` is victim-private, so the flash was the whole weapon from the
// owner's seat. Fixed: the turret fires a REAL shell down the one ballistics
// pipeline.

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
import { flatRaster } from './islandFixture.js';

const TAU = Math.PI * 2;
const CELL = CONFIG.vision.radarCellU;
const SLOT_BUOY = 2; // the Mine Layer fit: [gun, mine, radarBuoy, empty]

function bareWorld(seed = 7): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster(1200);
  return w;
}

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

function fitBoons(rec: ShipRecord, ids: string[]): void {
  rec.boons = ids;
  rec.boonDefs = resolveBoons(ids);
  rec.stats = effectiveStats(rec.cls, rec.boonDefs);
}

function buoyWindowAround(b: BuoyState, brg: number, halfWidth = 0.02): void {
  b.prevSweepAngle = (brg - halfWidth + TAU) % TAU;
  b.sweepAngle = (brg + halfWidth + TAU) % TAU;
}

function fullWindow(me: ShipRecord): void {
  me.prevSweepAngle = 0;
  me.sweepAngle = TAU - 1e-9;
}

const blipsOf = (f: FrameMsg): BlipEvent[] => f.events.filter((e): e is BlipEvent => e.k === 'blip');

function maskEq(b: BlipEvent, c: HullCoverage): boolean {
  return (
    b.gx === c.gx && b.gy === c.gy && b.w === c.w && b.h === c.h &&
    b.bits.length === c.bits.length && c.bits.every((v, i) => v === b.bits[i])
  );
}

function shipMask(w: World, s: ShipRecord): HullCoverage {
  return paintCoverage(s.hullId, s.state.x, s.state.y, s.state.heading, CELL, w.now);
}

/** The PRODUCTION click: slot 2, astern, 60u — activate → dropBuoy → spawnBuoy. */
function dropBuoy(w: World, id: string, fireSeq: number): void {
  w.submitInput(id, { seq: fireSeq, throttle: 0, rudder: 0, aim: Math.PI, fireSeq, aimDist: 60, slot: SLOT_BUOY, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
  w.step();
}

describe("PLAYTEST REGRESSION — the buoy's own scope through the PRODUCTION drop path", () => {
  it("a DROPPED buoy's returns arrive TAGGED with its id; an enemy frame never carries src", () => {
    const w = bareWorld();
    place(w, 'm', 0, 0, 0, 'mineLayer');
    dropBuoy(w, 'm', 1); // the real click: astern 60u → buoy at (-60, 0)
    expect(w.buoys.size).toBe(1);
    const [b] = [...w.buoys.values()];
    // A hull only the buoy can usefully see: 340u from the owner (beyond the
    // 330u sight bubble, so NOT a contact; owner's beam parked, so no own
    // paint), 280u from the buoy.
    const e = place(w, 'e', -340, 0);
    buoyWindowAround(b, Math.PI); // the BUOY's beam crosses e
    const f = buildFrame(w, 'm');
    expect(f.contacts).toEqual([]);
    const blips = blipsOf(f);
    expect(blips).toHaveLength(1);
    expect(maskEq(blips[0], shipMask(w, e))).toBe(true);
    expect(blips[0].src).toBe(b.id); // ATTRIBUTED — the client prices it from the buoy
    // The enemy's own frame: the owner's hull may paint on e's radar, but no
    // blip in any enemy frame ever carries an attribution key at all.
    fullWindow(e);
    for (const bl of blipsOf(buildFrame(w, 'e'))) expect('src' in bl).toBe(false);
  });

  it("the scope is a pure function of the buoy: its beam paints even the OWNER's own hull, tagged", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'mineLayer');
    const b = addBuoy(w.buoys, a, 200, 0, w.now, 'b1', 1);
    buoyWindowAround(b, Math.PI); // the buoy's beam crosses the OWNER's bearing
    const blips = blipsOf(buildFrame(w, 'a'));
    expect(blips).toHaveLength(1);
    expect(maskEq(blips[0], shipMask(w, a))).toBe(true); // your buoy's first revolution finds YOU
    expect(blips[0].src).toBe('b1');
  });

  it("an enemy jamming buoy's FAKES pass MY buoy's gate wearing MY buoy's tag — src never certifies a subject real", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const jOwner = place(w, 'j', 2000, 2000);
    fitBoons(jOwner, ['buoyJamming']);
    const mine = addBuoy(w.buoys, a, 500, 0, w.now, 'b1', 1);
    const jam = addBuoy(w.buoys, jOwner, 700, 0, w.now, 'b2', 305419896);
    // Open MY buoy's whole revolution so every bearing paints this tick.
    mine.prevSweepAngle = 0;
    mine.sweepAngle = TAU - 1e-9;
    const blips = blipsOf(buildFrame(w, 'a'));
    // Every one of the enemy's fakes inside my buoy's 330u set is on my wire,
    // tagged as MY buoy's return — byte-identical in every other way to a real
    // hull's paint, so the tag can never be read as "certified real".
    const fakes = scatterJamFakes(jam.jamSeed, jam.jamEpoch, jam.x, jam.y, jam.radarRange);
    const gated = fakes.filter((fk) => Math.hypot(fk.x - mine.x, fk.y - mine.y) <= mine.radarRange);
    expect(gated.length).toBeGreaterThan(0); // non-vacuous for this seed
    for (const fk of gated) {
      const mask = paintCoverage(fk.cls, fk.x, fk.y, fk.heading, CELL, w.now);
      const match = blips.find((bl) => maskEq(bl, mask));
      expect(match).toBeDefined();
      expect(match!.src).toBe('b1');
    }
    // The enemy BUOY itself is a physical subject of my buoy's scope too.
    const jamSquare = paintSegmentCoverage(jam.x, jam.y, jam.x, jam.y, BUOY_SIZE_U, CELL, w.now);
    const jamPaint = blips.find((bl) => bl.src === 'b1' && maskEq(bl, jamSquare));
    expect(jamPaint).toBeDefined();
  });
});

describe('PLAYTEST REGRESSION — the gun buoy through the PRODUCTION drop path', () => {
  it('a DROPPED gun buoy launches a VISIBLE shell, the owner gets a Hit Call, and the damage is real', () => {
    // The hitscan build passed the shipped suite because that suite
    // hand-injected the buoy AND asserted only the hp number — nothing
    // asserted anything OBSERVABLE. This test fails on that build at the
    // first shell assertion.
    const w = bareWorld();
    const ml = place(w, 'm', 0, 0, 0, 'mineLayer');
    fitBoons(ml, ['buoyGun']);
    dropBuoy(w, 'm', 1); // production click: buoy at (-60, 0)
    const [b] = [...w.buoys.values()];
    const e = place(w, 'e', b.x - 200, b.y); // 200u from the buoy, in its set
    const hp0 = e.hp;
    w.step(); // the turret fires
    expect(w.shells.size).toBe(1); // a REAL projectile is in the air
    // The owner SEES it: the ballistic reveal rides the owner's own frame.
    expect(buildFrame(w, 'm').events.filter((ev) => ev.k === 'shell')).toHaveLength(1);
    // And the flash is at the BUOY's muzzle (just clear of its own 12u
    // silhouette — the bow clearance that stops the turret shooting itself),
    // identity-free, exactly one.
    const flashes = buildFrame(w, 'e').events.filter((ev) => ev.k === 'mz') as { k: string; x: number; y: number }[];
    expect(flashes).toHaveLength(1);
    expect(Object.keys(flashes[0]).sort()).toEqual(['k', 'x', 'y']);
    expect(Math.hypot(flashes[0].x - b.x, flashes[0].y - b.y)).toBeLessThanOrEqual(BUOY_SIZE_U + CONFIG.gun.shellRadius);
    let sawHc = false;
    for (let t = 0; t < 12 && !sawHc; t++) {
      w.step();
      sawHc = buildFrame(w, 'm').events.some((ev) => ev.k === 'hc');
    }
    expect(sawHc).toBe(true); // the owner is TOLD the shot connected
    expect(e.hp).toBe(hp0 - CONFIG.radarBuoy.gunDamage); // and the damage is real
  });
});
