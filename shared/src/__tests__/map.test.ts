import { describe, it, expect } from 'vitest';
import { generateMap, MAP_RULES, type GameMap } from '../sim/map.js';
import { mapRadius, CONFIG } from '../constants.js';
import type { Circle } from '../types.js';

function distToCenter(c: Circle): number {
  return Math.hypot(c.x, c.y);
}

function assertConstraints(map: GameMap): void {
  const { radius, spawnRing, islands } = map;
  for (let i = 0; i < islands.length; i++) {
    const c = islands[i];
    const d = distToCenter(c);
    // radius bounds
    expect(c.r).toBeGreaterThanOrEqual(MAP_RULES.MIN_R);
    expect(c.r).toBeLessThanOrEqual(MAP_RULES.MAX_R);
    // fully inside the map
    expect(d + c.r).toBeLessThanOrEqual(radius * MAP_RULES.OUTER_FRACTION + 1e-6);
    // outside the central exclusion zone
    expect(d - c.r).toBeGreaterThanOrEqual(radius * MAP_RULES.INNER_FRACTION - 1e-6);
    // clear of the spawn ring
    expect(Math.abs(d - spawnRing)).toBeGreaterThanOrEqual(c.r + MAP_RULES.SPAWN_MARGIN - 1e-6);
    // separated from every other island
    for (let j = i + 1; j < islands.length; j++) {
      const o = islands[j];
      const gap = Math.hypot(c.x - o.x, c.y - o.y);
      expect(gap).toBeGreaterThanOrEqual(c.r + o.r + MAP_RULES.SEPARATION - 1e-6);
    }
  }
}

describe('island separation vs hull beams (#64 channel guarantee)', () => {
  it('SEPARATION is 40u — wider than every hull beam, so channels are sailable', () => {
    expect(MAP_RULES.SEPARATION).toBe(40);
    const beams = [
      ...Object.values(CONFIG.shipClasses).map((c) => c.hull.beam),
      ...Object.values(CONFIG.drones).map((d) => d.hull.beam),
    ];
    for (const beam of beams) expect(beam).toBeLessThan(MAP_RULES.SEPARATION);
  });

  it('SPAWN_MARGIN is 64u — at least the widest hull bounding radius, so spawns clear the ring', () => {
    // The battleship's stern corners reach ≈62.29u from origin (> length/2 = 62);
    // SPAWN_MARGIN must cover that so the mapgen ring guarantee holds at board
    // scale (spawn.ts uses the true silhouette radius for island clearance).
    expect(MAP_RULES.SPAWN_MARGIN).toBe(64);
    const maxBoundingRadius = 62.29;
    expect(MAP_RULES.SPAWN_MARGIN).toBeGreaterThanOrEqual(maxBoundingRadius);
  });
});

describe('mapRadius', () => {
  it('scales as base * sqrt(cap / capRef)', () => {
    expect(mapRadius(CONFIG.map.capRef)).toBeCloseTo(CONFIG.map.baseRadius);
    expect(mapRadius(20)).toBeCloseTo(900 * Math.sqrt(20 / 6));
  });
});

describe('generateMap', () => {
  it('is deterministic for the same seed + cap', () => {
    const a = generateMap(2024, 6);
    const b = generateMap(2024, 6);
    expect(a).toEqual(b);
  });

  it('produces different maps for different seeds', () => {
    const a = generateMap(1, 6);
    const b = generateMap(2, 6);
    expect(a.islands).not.toEqual(b.islands);
  });

  it('sets radius and spawn ring from CONFIG', () => {
    const m = generateMap(5, 6);
    expect(m.radius).toBeCloseTo(mapRadius(6));
    expect(m.spawnRing).toBeCloseTo(mapRadius(6) * CONFIG.map.spawnFraction);
  });

  it('respects all island constraints across 50 seeds', () => {
    let totalIslands = 0;
    for (let seed = 0; seed < 50; seed++) {
      const map = generateMap(seed, 6);
      assertConstraints(map);
      totalIslands += map.islands.length;
    }
    // Sanity: the generator actually places islands (not an empty field).
    expect(totalIslands).toBeGreaterThan(50);
  });

  it('works at the full player cap radius', () => {
    const map = generateMap(7, CONFIG.map.playerCap);
    expect(map.radius).toBeCloseTo(mapRadius(CONFIG.map.playerCap));
    assertConstraints(map);
  });
});
