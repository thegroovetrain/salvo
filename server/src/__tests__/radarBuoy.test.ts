// THE RADAR BUOY's SWEEP (Story 10.9, Eric 2026-10-27/28, epic-10 amendments
// 2 and 4; AC 5) — a second paint SOURCE for its OWNER, never a signal kind.
// The buoy's own beam (seeded at the owner's heading, turned at the OWNER's
// `sweepPeriodMs`) runs the ONE radar gate from the BUOY: centre within
// `CONFIG.buoy.radiusU`, swept this tick by the buoy's window, shadow-visible
// from the buoy (islands block every sensor at all ranges — Eric 2026-08-02),
// and the dropout roll keyed by the buoy's id. It paints non-owner hulls and
// non-own buoys, as the ordinary anonymous blips, for the OWNER ONLY; wakes
// never. Numbers come from CONFIG; the geometry is chosen relative to them.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  paintCoverage,
  paintSegmentCoverage,
  type BlipEvent,
  type ReturnBlipEvent,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { observe, observeSpectator } from '../game/perception.js';
import { addDecoy, type DecoyState } from '../game/decoys.js';
import { flatRaster, rasterFrom, ridgeField } from './islandFixture.js';

const TAU = Math.PI * 2;
const DT = CONFIG.tick.simDtMs;
const R = CONFIG.buoy.radiusU;

function bareWorld(seed = 1095): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster(6000);
  return w;
}

function place(w: World, id: string, x: number, y: number): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', undefined, undefined);
  rec.state = { x, y, heading: 0, speed: 0 };
  rec.prevSweepAngle = 2; // every hull's OWN beam parked away from bearing 0 —
  rec.sweepAngle = 2.05; // only a buoy's beam can paint in these cases
  return rec;
}

/** A RADAR buoy for `owner` at (x, y) with its beam crossing bearing 0 (east) THIS tick. */
function radarBuoy(w: World, owner: ShipRecord, x: number, y: number, id = 'rb'): DecoyState {
  const b = addDecoy(w.decoys, owner.id, x, y, id, 'radar', w.now + CONFIG.buoy.lifetimeMs, 0);
  b.sweep!.prevSweepAngle = TAU - 0.05;
  b.sweep!.sweepAngle = 0.05;
  b.sweep!.periodMs = owner.stats.sweepPeriodMs;
  return b;
}

const blips = (w: World, id: string): ReturnBlipEvent[] =>
  observe(w, id).events.filter((e): e is BlipEvent => e.k === 'blip') as ReturnBlipEvent[];

const hullPaint = (w: World, s: ShipRecord): ReturnBlipEvent => {
  const c = paintCoverage(s.hullId, s.state.x, s.state.y, s.state.heading, CONFIG.vision.radarCellU, w.now);
  return { k: 'blip', t: w.now, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits } as ReturnBlipEvent;
};

describe('RADAR BUOY — a second sweep for its OWNER (AC 5)', () => {
  it('a hull inside the buoy\'s radius but beyond the owner\'s OWN radar IS painted for the owner — and for nobody else', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    const far = o.stats.radarRange + 1000; // the buoy sits well past the owner's own radar
    radarBuoy(w, o, far, 0);
    const t = place(w, 't', far + R / 2, 0); // due EAST of the buoy, inside its radius
    const x = place(w, 'x', far, R / 3); // a third hull near the buoy (and inside its radius)
    expect(Math.hypot(t.state.x, t.state.y)).toBeGreaterThan(o.stats.radarRange); // premise: the owner's own radar cannot reach t
    const own = blips(w, 'o');
    expect(own).toContainEqual({ ...hullPaint(w, t), src: 'rb' });
    expect(own).toHaveLength(1); // x lies NORTH of the buoy: outside this tick's window (bearing 0 only)
    // Nobody but the owner gets the buoy's paints.
    expect(blips(w, 't')).toEqual([]);
    expect(blips(w, 'x')).toEqual([]);
  });

  it('edge: the radius is inclusive; a hull just past it is not painted', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    const far = o.stats.radarRange + 1000;
    radarBuoy(w, o, far, 0);
    place(w, 'in', far + R, 0);
    expect(blips(w, 'o')).toHaveLength(1);
    w.ships.get('in')!.state.x = far + R + 1;
    expect(blips(w, 'o')).toEqual([]);
  });

  it('islands shadow it: a hull behind hard cover FROM THE BUOY is not painted (Eric 2026-08-02)', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    const far = o.stats.radarRange + 1000;
    const tx = far + R / 2;
    // A mast-high ridge between the buoy and the target.
    w.map.heightRaster = rasterFrom(6000, ridgeField(far + R / 4, 0, 30, 60, 255));
    radarBuoy(w, o, far, 0);
    place(w, 't', tx, 0);
    expect(blips(w, 'o')).toEqual([]);
    // The same layout on flat water paints.
    w.map.heightRaster = flatRaster(6000);
    expect(blips(w, 'o')).toHaveLength(1);
  });

  it('it paints an ENEMY buoy as the ordinary decoy square, never the owner\'s own buoys, never anyone\'s wake', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    const e = place(w, 'e', 0, 3000);
    const far = o.stats.radarRange + 1000;
    radarBuoy(w, o, far, 0);
    addDecoy(w.decoys, e.id, far + R / 2, 0, 'enemy', 'healing', w.now + CONFIG.buoy.lifetimeMs, 0);
    addDecoy(w.decoys, o.id, far + R / 3, 0, 'mine', 'healing', w.now + CONFIG.buoy.lifetimeMs, 0);
    const want = paintSegmentCoverage(far + R / 2, 0, far + R / 2, 0, CONFIG.buoy.sizeU, CONFIG.vision.radarCellU, w.now);
    expect(blips(w, 'o')).toEqual([{ k: 'blip', t: w.now, gx: want.gx, gy: want.gy, w: want.w, h: want.h, bits: want.bits, src: 'rb' }]);
    expect(observe(w, 'o').events.some((ev) => ev.k === 'wk')).toBe(false);
  });

  it('a radar buoy someone ELSE owns paints nothing for the observer', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    const x = place(w, 'x', 200, 0);
    const far = x.stats.radarRange + 1000;
    radarBuoy(w, o, far, 0);
    place(w, 't', far + R / 2, 0);
    expect(blips(w, 'x')).toEqual([]);
    expect(blips(w, 'o')).toHaveLength(1);
  });

  it('the buoy\'s beam turns at the OWNER\'s sweepPeriodMs — a re-read every tick, kept once the owner is gone; seeded at the owner\'s heading on the drop', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    o.state.heading = 1.25;
    (w as unknown as { spawnDecoy(s: ShipRecord, x: number, y: number, k: string): void }).spawnDecoy(o, 100, 0, 'radar');
    const b = w.decoys.get('d1')!;
    expect(b.sweep!.sweepAngle).toBeCloseTo(1.25, 12);
    expect(b.sweep!.periodMs).toBe(o.stats.sweepPeriodMs);
    const step = (period: number): void => {
      const before = b.sweep!.sweepAngle;
      w.step();
      expect(b.sweep!.prevSweepAngle).toBe(before);
      expect(b.sweep!.sweepAngle).toBeCloseTo((before + (TAU * DT) / period) % TAU, 9);
    };
    step(o.stats.sweepPeriodMs);
    // A faster owner (its effective period halved) turns the buoy faster.
    const half = o.stats.sweepPeriodMs / 2;
    o.stats = { ...o.stats, sweepPeriodMs: half };
    step(half);
    // The owner leaves: the beam keeps its last period.
    w.ships.delete('o');
    step(half);
    expect(b.sweep!.periodMs).toBe(half);
  });

  it('a full revolution bumps the buoy\'s own sweepRev (the dropout roll\'s key)', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    const b = radarBuoy(w, o, 100, 0);
    b.sweep!.sweepAngle = TAU - 1e-6;
    w.step();
    expect(b.sweep!.sweepRev).toBe(1);
  });

  // THE PAINT'S ORIGIN TAG (Story 10.9 review gate): the client marches every
  // echo from an origin — the own hull for the own sweep, the BUOY for a buoy
  // paint — so a buoy paint carries `src` = the owner's own buoy id. Self-
  // private: only the owner ever receives one, and the owner already holds
  // the buoy's id/position/sweep on DecoyView. NOT a perception exception.
  describe('`src` names the owner\'s own RADAR buoy on its paints, and nothing else carries it', () => {
    it('a buoy paint carries src = that buoy\'s id; the own sweep\'s paint of the same hull carries none', () => {
      const w = bareWorld();
      const o = place(w, 'o', 0, 0);
      const t = place(w, 't', R / 2, 0); // inside both the owner's radar and the buoy's radius
      radarBuoy(w, o, 0, -R / 4, 'rb1'); // bearing to t is NOT east: park its beam on t's bearing instead
      const b = w.decoys.get('rb1')!;
      const brg = Math.atan2(t.state.y - b.y, t.state.x - b.x);
      const at = (brg + TAU) % TAU;
      b.sweep!.prevSweepAngle = at - 0.05;
      b.sweep!.sweepAngle = at + 0.05;
      o.prevSweepAngle = TAU - 0.05; // and the owner's OWN beam crosses east (t's bearing) this tick
      o.sweepAngle = 0.05;
      const got = blips(w, 'o');
      const bare = hullPaint(w, t);
      expect(got).toHaveLength(2); // two antennas, two returns
      expect(got).toContainEqual(bare); // the own sweep: no src key at all
      expect(got).toContainEqual({ ...bare, src: 'rb1' });
      expect(got.filter((e) => !('src' in e))).toHaveLength(1);
    });

    it('with two radar buoys each paint names the buoy whose beam made it', () => {
      const w = bareWorld();
      const o = place(w, 'o', 0, 0);
      const far = o.stats.radarRange + 1000;
      radarBuoy(w, o, far, 0, 'east');
      radarBuoy(w, o, far, 4 * R, 'north');
      const a = place(w, 'a', far + R / 2, 0);
      const c = place(w, 'c', far + R / 2, 4 * R);
      expect(blips(w, 'o')).toEqual(expect.arrayContaining([
        { ...hullPaint(w, a), src: 'east' },
        { ...hullPaint(w, c), src: 'north' },
      ]));
      expect(blips(w, 'o')).toHaveLength(2);
    });

    it('a non-owner never receives a src blip — not through its own sweep, not as a spectator', () => {
      const w = bareWorld();
      const o = place(w, 'o', 0, 0);
      const x = place(w, 'x', 200, 0);
      x.prevSweepAngle = TAU - 0.05; // x's own beam crosses east this tick
      x.sweepAngle = 0.05;
      const far = o.stats.radarRange - 200;
      radarBuoy(w, o, far, 0);
      place(w, 't', far + R / 2, 0);
      const owner = blips(w, 'o');
      expect(owner.some((e) => e.src === 'rb')).toBe(true); // premise: the owner's buoy paints
      const seen = blips(w, 'x');
      expect(seen).toHaveLength(1); // premise: x's own sweep paints t
      expect(seen.some((e) => 'src' in e)).toBe(false);
      for (const id of ['o', 'x', 'nobody']) {
        expect(observeSpectator(w, id).events.some((e) => e.k === 'blip' && 'src' in e)).toBe(false);
      }
    });
  });
});
