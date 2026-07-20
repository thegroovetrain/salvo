// Unit coverage for the unified ballistic factory + spawn-offset helper (A4).

import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { World } from '../game/world.js';
import { hullClearOffset, makeBallistic } from '../game/equipment/ballistics.js';

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
    };
    const omitted = makeBallistic('s0', ship, 0, 0, params);
    const explicitZero = makeBallistic('s1', ship, 0, 0, { ...params, spawnClearance: 0 });
    expect(omitted.x).toBeCloseTo(explicitZero.x, 9);
    expect(omitted.y).toBeCloseTo(explicitZero.y, 9);
  });
});
