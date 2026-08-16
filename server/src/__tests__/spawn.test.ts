import { describe, it, expect } from 'vitest';
import { CONFIG, dist, generateMap, mulberry32, pointPolygonDistance, wrapPositive, type MapShape } from '@salvo/shared';
import { circleIsland } from './islandFixture.js';
import { pickSpawn, SPAWN_CANDIDATES, SPAWN_ISLAND_CLEARANCE } from '../game/spawn.js';
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
          // Oracle: raw polygon distance, no broadphase — the same intent as
          // the old `dist(p, c) - c.r`, now against the real coastline.
          expect(pointPolygonDistance(p, island.poly)).toBeGreaterThan(SPAWN_ISLAND_CLEARANCE);
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
      // Best of the evenly spaced ring candidates is within one slot of the
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
          // 6 ships on the candidate ring: worst-case honest spacing is
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
      return circleIsland(Math.cos(a) * spawnRing, Math.sin(a) * spawnRing, 120);
    });
    const map: MapShape = { radius: 900, spawnRing, islands };
    const rng = mulberry32(0xdead);
    const p = pickSpawn(map, [], rng);
    const clearance = Math.min(...islands.map((isle) => pointPolygonDistance(p, isle.poly)));
    expect(clearance).toBeGreaterThan(SPAWN_ISLAND_CLEARANCE);
  });
});

// --- ONE LATTICE, ONE SLOT PER CAPTAIN (Eric ruling 2026-08-16) --------------
//
// The ruled OUTCOME: *"No participants should start so close to each other that
// they can see each other, let alone radar scan each other."* It takes both
// halves of the mechanism, and either alone is worthless:
//
//   THE COUNT — SPAWN_CANDIDATES is CONFIG.map.playerCap, not the retired
//   literal 32. That sets the lattice pitch: 700.8u between adjacent slots at
//   cap 20, against 439u at 32 — the latter INSIDE the 660u radar range.
//
//   THE PHASE — World draws ONE lattice rotation per match and passes it at all
//   three placement edges. Without it pickSpawn re-rolled its offset on every
//   call, so each hull came off its own rotated lattice: measured over 60 seeds
//   at a full lobby, min pairwise separation was 352-483u at 20 candidates and
//   359-475u at 32 — inside radar on EVERY seed either way, i.e. the count on
//   its own moved essentially nothing.
//
// With both, the same 60-seed measurement lands on exactly 700.8u every time,
// 0/60 seeds with any pair inside radar. The empirical test below is that
// measurement; the constraint pin guards the geometry it rests on.

/** The even spacing a FULL lobby gets: the chord between adjacent slots of the
 *  one shared lattice, when every slot is occupied. */
function evenSpacing(spawnRing: number, slots: number): number {
  return 2 * spawnRing * Math.sin(Math.PI / slots);
}

describe('spawn ring candidate count — derived from the player cap', () => {
  it('is CONFIG.map.playerCap, not a literal', () => {
    expect(SPAWN_CANDIDATES).toBe(CONFIG.map.playerCap);
  });

  it('CONSTRAINT: the candidate lattice out-spaces radar range at a full lobby', () => {
    // THE PIN. Every term is live CONFIG, so retuning the player cap, the map
    // radius, the spawn fraction OR radar range fails the build here rather
    // than silently shrinking the lattice back under radar. The margin is only
    // ~6% (700.8u of spacing against 660u of radar) — a TIGHT constraint, and
    // any of those four knobs moving much will trip it. That is the point.
    const spawnRing = CONFIG.map.baseRadius * CONFIG.map.spawnFraction;
    expect(evenSpacing(spawnRing, CONFIG.map.playerCap)).toBeGreaterThan(CONFIG.vision.radar);
    // ...and the retired 32-slot ring is the counter-example the pin exists for.
    expect(evenSpacing(spawnRing, 32)).toBeLessThan(CONFIG.vision.radar);
  });

  it('a full lobby still lands every hull on the ring, island-clear', () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const map = generateMap(seed, CONFIG.match.fillTo);
      const rng = mulberry32(seed ^ 0x5eed);
      const placed: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < CONFIG.map.playerCap; i++) placed.push(pickSpawn(map, placed, rng));
      for (const p of placed) {
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(map.spawnRing, 6);
        for (const island of map.islands) {
          expect(pointPolygonDistance(p, island.poly)).toBeGreaterThan(SPAWN_ISLAND_CLEARANCE);
        }
      }
    }
  });

  it('an exhausted lattice degrades to the fallback ladder — it never STACKS hulls', () => {
    // Over-subscribe by 5. Production cannot reach this (playerCap caps the
    // clients and fleet hulls are placed with an explicit `at`), but the shared
    // lattice makes exhaustion reachable in principle, and the failure mode it
    // would otherwise have is the worst one available: an occupied slot scores
    // 0 on max-min, which still beats the -Infinity seed, so a hull would be
    // placed exactly on top of another and poison resolveShipPose's
    // pose-validity induction from that tick on. pickSpawn skips taken slots
    // instead, so the extras fall to the validated finer sweep.
    const w = new World(11);
    const placed: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < CONFIG.map.playerCap + 5; i++) {
      const rec = w.addShip(`p${i}`, `P${i}`);
      placed.push({ x: rec.state.x, y: rec.state.y });
    }
    let min = Infinity;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) min = Math.min(min, dist(placed[i], placed[j]));
    }
    // Degraded (well under the lattice pitch) but never overlapping.
    expect(min).toBeGreaterThan(2 * SPAWN_ISLAND_CLEARANCE);
  });
});

describe('the shared spawn lattice — the phase is per-MATCH, not per-hull', () => {
  it('a full lobby leaves no pair inside radar range of each other', () => {
    // THE OUTCOME TEST, through the real World.addShip path (island clearance
    // and the fallback ladder included). Measured across 60 seeds this lands on
    // exactly the lattice pitch, 700.8u, on every one of them.
    for (const seed of SEEDS.slice(0, 8)) {
      const w = new World(seed);
      const placed: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < CONFIG.map.playerCap; i++) {
        const rec = w.addShip(`p${i}`, `P${i}`);
        placed.push({ x: rec.state.x, y: rec.state.y });
      }
      let min = Infinity;
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) min = Math.min(min, dist(placed[i], placed[j]));
      }
      expect(min).toBeGreaterThan(CONFIG.vision.radar);
    }
  });

  it('hulls placed at DIFFERENT times share one lattice', () => {
    // The phase must not drift with elapsed ticks or with how much rng other
    // systems have consumed — that is why it gets its own stream and is read,
    // never re-drawn. Proof without reading the private field: every pairwise
    // angular separation is an exact integer multiple of the slot pitch.
    const w = new World(4242);
    const angles: number[] = [];
    for (let wave = 0; wave < 3; wave++) {
      for (let i = 0; i < 3; i++) {
        const rec = w.addShip(`w${wave}p${i}`, `W${wave}P${i}`);
        angles.push(Math.atan2(rec.state.y, rec.state.x));
      }
      for (let t = 0; t < 25; t++) w.step(); // time passes, rng gets consumed
    }
    const pitch = (2 * Math.PI) / CONFIG.map.playerCap;
    for (let i = 0; i < angles.length; i++) {
      for (let j = i + 1; j < angles.length; j++) {
        const slots = wrapPositive(angles[i] - angles[j]) / pitch;
        expect(Math.abs(slots - Math.round(slots))).toBeLessThan(1e-9);
      }
    }
  });

  it('omitting the phase keeps the shipped per-call draw (the compatibility contract)', () => {
    // pickSpawn's 4th parameter is optional precisely so every direct caller
    // that does not pass one is untouched: the offset is still drawn from the
    // supplied rng, so two calls with the SAME occupancy still differ.
    const map = generateMap(99, CONFIG.match.fillTo);
    const rng = mulberry32(99);
    const a = pickSpawn(map, [], rng);
    const b = pickSpawn(map, [], rng);
    expect(a).not.toEqual(b);
    // ...while a supplied phase is deterministic and consumes NO rng.
    const rngA = mulberry32(7);
    const rngB = mulberry32(7);
    expect(pickSpawn(map, [], rngA, 1.234)).toEqual(pickSpawn(map, [], rngB, 1.234));
    expect(rngA.next()).toBe(rngB.next()); // neither call touched the stream
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

  it('a fresh hull\'s radar sweep STARTS at its heading (Eric ruling 2026-08-16)', () => {
    // Constructing every hull at sweepAngle 0 phase-LOCKED the fleet: a boarding
    // room freezes the sweep, so every captain's beam unfroze at exactly 0 on
    // the same tick and stayed in lockstep all match — a systematic,
    // position-determined first-detection advantage. prevSweepAngle MUST equal
    // sweepAngle so the half-open paint window [prev, sweep) is zero-width and
    // the hull's first tick paints nothing.
    const angles = new Set<number>();
    for (const seed of SEEDS.slice(0, 8)) {
      const w = new World(seed);
      const rec = w.addShip('a', 'ALPHA');
      expect(rec.sweepAngle).toBe(wrapPositive(rec.state.heading));
      expect(rec.prevSweepAngle).toBe(rec.sweepAngle);
      angles.add(rec.sweepAngle);
    }
    // ...and the whole point: different placements no longer share one phase.
    expect(angles.size).toBeGreaterThan(1);
  });
});
