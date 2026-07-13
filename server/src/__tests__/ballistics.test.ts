// Unit coverage for the unified ballistic factory + spawn-offset helper (A4).

import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { World } from '../game/world.js';
import { hullClearOffset, makeBallistic } from '../game/weapons/ballistics.js';

describe('hullClearOffset', () => {
  it("is half the FIRER's class hull length plus the projectile/trigger radius", () => {
    const w = new World(1);
    const cruiser = w.addShip('a', 'A', false, 'cruiser');
    const battleship = w.addShip('b', 'B', false, 'battleship');
    expect(hullClearOffset(cruiser, 2)).toBe(CONFIG.shipClasses.cruiser.hull.length / 2 + 2);
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
      graceMs: 100,
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
    expect(s.graceMs).toBe(100);
  });
});
