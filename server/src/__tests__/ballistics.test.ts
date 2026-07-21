// Unit coverage for the unified ballistic factory + spawn-offset helpers (A4;
// Story 1.4 added muzzleSpawn — the hull-silhouette-edge gun spawn).

import { describe, it, expect } from 'vitest';
import { CONFIG, hullSilhouette, pointPolygonDistance, transformPolygon } from '@salvo/shared';
import { World } from '../game/world.js';
import { hullClearOffset, makeBallistic, muzzleSpawn } from '../game/equipment/ballistics.js';

describe('hullClearOffset', () => {
  it("is half the FIRER's class hull length plus the projectile/trigger radius", () => {
    const w = new World(1);
    const boat = w.addShip('a', 'A', false, 'torpedoBoat');
    const battleship = w.addShip('b', 'B', false, 'battleship');
    expect(hullClearOffset(boat, 2)).toBe(CONFIG.shipClasses.torpedoBoat.hull.length / 2 + 2);
    expect(hullClearOffset(battleship, CONFIG.mine.triggerRadius)).toBe(
      CONFIG.shipClasses.battleship.hull.length / 2 + CONFIG.mine.triggerRadius,
    );
  });
});

describe('makeBallistic', () => {
  it('spawns clear of the hull along dir and sets every weapon field explicitly', () => {
    const w = new World(1);
    const ship = w.addShip('a', 'A');
    ship.state = { x: 100, y: 50, heading: 0, speed: 0 };
    const dir = Math.PI / 2; // straight up (+y)
    const s = makeBallistic('b1', ship, dir, 1234, {
      speed: 60,
      range: Number.POSITIVE_INFINITY,
      damage: 55,
      hitRadius: 2,
      kind: 'torp',
      targetX: null,
      targetY: null,
      burstRadius: 0,
      contactDamage: 55,
    });
    const off = hullClearOffset(ship, 2);
    expect(s.ownerId).toBe('a');
    expect(s.x).toBeCloseTo(100, 6); // cos(90°)=0 → no x offset
    expect(s.y).toBeCloseTo(50 + off, 6);
    expect(s.vx).toBeCloseTo(0, 6);
    expect(s.vy).toBeCloseTo(60, 6);
    expect(s.distLeft).toBe(Number.POSITIVE_INFINITY);
    expect(s.bornAt).toBe(1234);
    expect(s.kind).toBe('torp');
    expect(s.damage).toBe(55);
    expect(s.hitRadius).toBe(2);
    expect(s.targetX).toBeNull(); // contact-only projectile: no burst point
    expect(s.targetY).toBeNull();
    expect(s.burstRadius).toBe(0);
    expect(s.contactDamage).toBe(55);
  });

  // Root-cause fix (2026-07-14): BallisticParams.spawnClearance pads the spawn
  // offset with real margin ON TOP of hitRadius. torpedoSelfHit.test.ts pins
  // this end-to-end through fireTorpedo/silhouette distance math; this test
  // isolates the arithmetic directly on makeBallistic itself (offset math only,
  // no hull-endpoint geometry), so a future refactor of either call site can't
  // silently drop the `+ spawnClearance` term without failing here first.
  it('spawnClearance adds real margin ON TOP of hitRadius (torpedo path)', () => {
    const w = new World(1);
    const ship = w.addShip('a', 'A');
    ship.state = { x: 0, y: 0, heading: 0, speed: 0 };
    const params = {
      speed: 70,
      range: Number.POSITIVE_INFINITY,
      damage: 55,
      hitRadius: 2,
      kind: 'torp' as const,
      targetX: null,
      targetY: null,
      burstRadius: 0,
      contactDamage: 55,
    };
    const withoutClearance = makeBallistic('t0', ship, 0, 0, params);
    const withClearance = makeBallistic('t1', ship, 0, 0, { ...params, spawnClearance: 6 });
    // Same bearing (dir=0, +x): the offset is purely a distance-along-x delta.
    const baseOff = hullClearOffset(ship, params.hitRadius);
    const clearedOff = hullClearOffset(ship, params.hitRadius + 6);
    expect(withoutClearance.x).toBeCloseTo(baseOff, 6);
    expect(withClearance.x).toBeCloseTo(clearedOff, 6);
    expect(withClearance.x - withoutClearance.x).toBeCloseTo(6, 6); // exactly the clearance, nothing more
  });

  it('omitting spawnClearance behaves exactly like spawnClearance: 0 (guns/mines path unchanged)', () => {
    const w = new World(1);
    const ship = w.addShip('a', 'A');
    ship.state = { x: 0, y: 0, heading: 0, speed: 0 };
    const params = {
      speed: CONFIG.gun.shellSpeed,
      range: 480,
      damage: CONFIG.gun.damage,
      hitRadius: CONFIG.gun.shellRadius,
      kind: 'shell' as const,
      targetX: null,
      targetY: null,
      burstRadius: 0,
      contactDamage: CONFIG.gun.contactDamage,
    };
    const omitted = makeBallistic('s0', ship, 0, 0, params);
    const explicitZero = makeBallistic('s1', ship, 0, 0, { ...params, spawnClearance: 0 });
    expect(omitted.x).toBeCloseTo(explicitZero.x, 9);
    expect(omitted.y).toBeCloseTo(explicitZero.y, 9);
  });
});

describe('muzzleSpawn — hull-silhouette-edge spawn (no dead ring)', () => {
  const CLEAR = CONFIG.gun.shellRadius;

  it('spawns strictly outside the own silhouette, hugging the boundary, on every bearing', () => {
    const w = new World(1);
    const ship = w.addShip('a', 'A', false, 'battleship');
    ship.state = { x: 40, y: -25, heading: 0.7, speed: 0 };
    const poly = transformPolygon(hullSilhouette('battleship'), 40, -25, 0.7);
    for (let i = 0; i < 16; i++) {
      const dir = (i / 16) * 2 * Math.PI;
      const p = muzzleSpawn(ship, dir, CLEAR);
      const d = pointPolygonDistance(p, poly);
      expect(d).toBeGreaterThan(0); // outside the hull...
      expect(d).toBeLessThanOrEqual(2 * CLEAR + 1); // ...but never a dead ring
    }
  });

  it('a concave bearing (mineLayer transom notch, dead astern) spawns in the OPEN cavity, outside the hull', () => {
    const w = new World(1);
    const ship = w.addShip('a', 'A', false, 'mineLayer');
    ship.state = { x: 0, y: 0, heading: 0, speed: 0 };
    const poly = transformPolygon(hullSilhouette('mineLayer'), 0, 0, 0);
    const p = muzzleSpawn(ship, Math.PI, CLEAR); // straight astern, through the notch cavity
    // The notch is an OPEN cavity wide enough for the shell: the boundary
    // crossing on this bearing is the cavity's inner wall, so the shell spawns
    // inside the notch — outside the silhouette polygon — and exits astern.
    expect(pointPolygonDistance(p, poly)).toBeGreaterThan(0); // never inside the hull
    expect(p.y).toBeCloseTo(0, 6); // dead on the astern bearing
    expect(p.x).toBeLessThan(-CONFIG.shipClasses.mineLayer.hull.length / 4); // well aft of center
    expect(p.x).toBeGreaterThan(-CONFIG.shipClasses.mineLayer.hull.length / 2 - 3 * CLEAR); // no dead ring astern either
  });

  it('follows the ship pose: spawn point rotates and translates with the hull', () => {
    const w = new World(1);
    const ship = w.addShip('a', 'A');
    ship.state = { x: 100, y: 200, heading: Math.PI / 2, speed: 0 };
    const p = muzzleSpawn(ship, Math.PI / 2, CLEAR); // over the bow (heading +y)
    expect(p.x).toBeCloseTo(100, 4); // bow line stays on the ship's x
    // Bow tip sits length/2 up the +y axis; spawn is just beyond it.
    expect(p.y).toBeGreaterThan(200 + CONFIG.shipClasses.torpedoBoat.hull.length / 2);
    expect(p.y).toBeLessThan(200 + CONFIG.shipClasses.torpedoBoat.hull.length / 2 + 3 * CLEAR + 1);
  });
});
