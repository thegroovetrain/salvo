// HARNESS SPAWN LAYOUT (Epic 9 tuning pass instrument, 2026-10-06). Contract:
// with no layout installed, pickSpawn is the shipped single-ring placement;
// with a layout installed, every seated hull sits on one of the layout's ring
// radii, island-clear, and the layout is a run-scoped override that the
// setter clears. The two-ring candidate Eric named (12 @ 0.8 R + 8 @ 0.4 R)
// is the fixture because it is the arm the harness measures.
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG, generateMap, mulberry32, pointPolygonDistance } from '@salvo/shared';
import { getSpawnLayout, pickSpawn, setSpawnLayout, spawnRingRadii, SPAWN_ISLAND_CLEARANCE } from '../game/spawn.js';

const SEEDS = [1, 7920, 15839, 23758, 31677];
const TWO_RINGS = { rings: [{ slots: 12, fraction: 0.8 }, { slots: 8, fraction: 0.4 }] };

afterEach(() => setSpawnLayout(null));

describe('spawn layout — harness two-ring lattice', () => {
  it('with no layout installed the ring radii are the shipped spawn ring', () => {
    const map = generateMap(1, CONFIG.match.fillTo);
    expect(getSpawnLayout()).toBeNull();
    expect(spawnRingRadii(map)).toEqual([map.spawnRing]);
  });

  it('seats a full lobby on the two ring radii, island-clear, never stacked', () => {
    setSpawnLayout(TWO_RINGS);
    for (const seed of SEEDS) {
      const map = generateMap(seed, CONFIG.match.fillTo);
      const radii = spawnRingRadii(map);
      expect(radii).toEqual([0.8 * map.radius, 0.4 * map.radius]);
      const rng = mulberry32(seed);
      const phase = rng.float(0, Math.PI * 2);
      const placed: { x: number; y: number }[] = [];
      let onLattice = 0;
      for (let i = 0; i < CONFIG.match.fillTo; i++) {
        const p = pickSpawn(map, placed, rng, phase);
        for (const island of map.islands) {
          expect(pointPolygonDistance(p, island.poly)).toBeGreaterThan(SPAWN_ISLAND_CLEARANCE);
        }
        for (const q of placed) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(1);
        const r = Math.hypot(p.x, p.y);
        if (radii.some((ring) => Math.abs(r - ring) < 1e-6)) onLattice += 1;
        placed.push(p);
      }
      // The coarse lattice has exactly 20 slots; a few may be island-blocked on
      // the inner ring (no keep-clear band there), so the bound is "most",
      // and the harness reports the exact miss count per arm.
      expect(onLattice).toBeGreaterThanOrEqual(CONFIG.match.fillTo - 4);
    }
  });

  it('the first two hulls land on the outer ring (max-min prefers the wider spacing)', () => {
    setSpawnLayout(TWO_RINGS);
    const map = generateMap(31677, CONFIG.match.fillTo);
    const rng = mulberry32(31677);
    const a = pickSpawn(map, [], rng, 0.3);
    const b = pickSpawn(map, [a], rng, 0.3);
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(0.8 * map.radius, 6);
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(0.8 * map.radius, 6);
  });

  it('clearing the layout restores the shipped placement exactly', () => {
    const map = generateMap(7920, CONFIG.match.fillTo);
    const before = pickSpawn(map, [], mulberry32(5), 1.1);
    setSpawnLayout(TWO_RINGS);
    setSpawnLayout(null);
    const after = pickSpawn(map, [], mulberry32(5), 1.1);
    expect(after).toEqual(before);
  });
});
