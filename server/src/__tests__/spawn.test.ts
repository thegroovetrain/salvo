import { describe, it, expect } from 'vitest';
import { CONFIG, dist, generateMap, mulberry32 } from '@salvo/shared';
import { pickSpawn, SPAWN_ISLAND_CLEARANCE } from '../game/spawn.js';
import { World } from '../game/world.js';

const SEEDS = Array.from({ length: 25 }, (_, i) => i * 7919 + 1);

describe('pickSpawn — placement constraints across seeds', () => {
  it('always lands exactly on the spawn ring', () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed, CONFIG.match.fillTo);
      const rng = mulberry32(seed);
      const p = pickSpawn(map, [], rng);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(map.spawnRing, 6);
    }
  });

  it('never spawns inside or hugging an island', () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed, CONFIG.match.fillTo);
      const rng = mulberry32(seed ^ 0xabcdef);
      const placed: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < 6; i++) {
        const p = pickSpawn(map, placed, rng);
        for (const island of map.islands) {
          expect(dist(p, island)).toBeGreaterThan(island.r + SPAWN_ISLAND_CLEARANCE);
        }
        placed.push(p);
      }
    }
  });

  it('maximizes distance from existing ships (second spawn ~antipodal)', () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed, CONFIG.match.fillTo);
      const rng = mulberry32(seed ^ 0x55aa);
      const first = pickSpawn(map, [], rng);
      const second = pickSpawn(map, [first], rng);
      // Best of 32 evenly spaced ring candidates is within one slot of the
      // antipode: chord >= 2R*cos(pi/32), minus a little island slack.
      expect(dist(first, second)).toBeGreaterThan(1.9 * map.spawnRing);
    }
  });

  it('keeps later spawns spread out (min pairwise distance stays sane)', () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed, CONFIG.match.fillTo);
      const rng = mulberry32(seed ^ 0x1234);
      const placed: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < 6; i++) placed.push(pickSpawn(map, placed, rng));
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          // 6 ships on a ring of 32 candidates: worst-case honest spacing is
          // about one ring-sixth; require a conservative half of that.
          const arc = (2 * Math.PI * map.spawnRing) / 6;
          expect(dist(placed[i], placed[j])).toBeGreaterThan(arc * 0.4);
        }
      }
    }
  });
  it('pathological map: fully-blocked spawn ring still yields an island-CLEAR point (never overlapping)', () => {
    // Hand-built map violating mapgen's ring guarantee: 24 r=120 islands
    // centered ON the spawn ring fully cover it (and the coarse candidates).
    // The fallback ladder must walk inward and return a point with true
    // clearance — an overlapping spawn would poison resolveShipPose's
    // pose-validity induction (Codex-confirmed review finding).
    const spawnRing = 720;
    const islands = Array.from({ length: 24 }, (_, i) => {
      const a = (i * 2 * Math.PI) / 24;
      return { x: Math.cos(a) * spawnRing, y: Math.sin(a) * spawnRing, r: 120 };
    });
    const map = { radius: 900, spawnRing, islands };
    const rng = mulberry32(0xdead);
    const p = pickSpawn(map, [], rng);
    const clearance = Math.min(...islands.map((c) => dist(p, c) - c.r));
    expect(clearance).toBeGreaterThan(SPAWN_ISLAND_CLEARANCE);
  });
});

describe('World spawn integration', () => {
  it('addShip spawns on the ring facing the map center', () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const w = new World(seed);
      const rec = w.addShip('a', 'ALPHA');
      const { x, y, heading } = rec.state;
      expect(Math.hypot(x, y)).toBeCloseTo(w.map.spawnRing, 6);
      // heading points from spawn toward the origin
      expect(Math.cos(heading)).toBeCloseTo(-x / Math.hypot(x, y), 6);
      expect(Math.sin(heading)).toBeCloseTo(-y / Math.hypot(x, y), 6);
    }
  });
});
