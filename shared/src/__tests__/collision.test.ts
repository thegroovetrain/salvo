import { describe, it, expect } from 'vitest';
import { segCircleHit, segSegDistance } from '../math/geom.js';
import { CONFIG } from '../constants.js';
import { MAP_RULES } from '../sim/map.js';
import { resolveBoundary, resolveShipIslands, SHIP_RADIUS } from '../sim/collision.js';
import { stepShip } from '../sim/ship.js';
import { mulberry32 } from '../math/rng.js';
import type { ShipState } from '../sim/ship.js';
import type { Circle } from '../types.js';

const DAMP = CONFIG.ship.islandSpeedMult;

const DT = CONFIG.tick.simDtMs / 1000;
const maxProjSpeed = Math.max(CONFIG.gun.shellSpeed, CONFIG.torpedo.speed);
const maxTravel = maxProjSpeed * DT; // furthest a projectile moves in one tick
const CRUISER = CONFIG.shipClasses.cruiser.hull;
const hullRadius = CRUISER.beam / 2; // capsule radius
const hullHalfLen = (CRUISER.length - CRUISER.beam) / 2;

describe('swept-shell no tunneling (worst case from CONFIG)', () => {
  it('per-tick travel is smaller than the thinnest obstacle', () => {
    // If a single tick's displacement is smaller than the obstacle thickness,
    // a swept segment test physically cannot skip over it.
    expect(maxTravel).toBeLessThan(2 * MAP_RULES.MIN_R); // thinnest island diameter
    expect(maxTravel).toBeLessThan(CRUISER.beam); // hull broadside width
  });

  it('detects the fastest shell crossing the thinnest island', () => {
    const island = { x: 0, y: 0 };
    const r = MAP_RULES.MIN_R;
    // Shell sweeps a full max-speed tick straight through the island centre.
    const p0 = { x: -maxTravel / 2, y: 0 };
    const p1 = { x: maxTravel / 2, y: 0 };
    expect(segCircleHit(p0, p1, island, r)).not.toBeNull();
  });

  it('detects the fastest shell crossing a hull capsule broadside', () => {
    // Hull axis (ship at origin, heading 0): (-halfLen,0)..(halfLen,0).
    const a0 = { x: -hullHalfLen, y: 0 };
    const a1 = { x: hullHalfLen, y: 0 };
    // Shell sweeps perpendicular through the axis over one max-speed tick.
    const s0 = { x: 0, y: -maxTravel / 2 };
    const s1 = { x: 0, y: maxTravel / 2 };
    expect(segSegDistance(s0, s1, a0, a1)).toBeLessThanOrEqual(hullRadius);
  });

  it('a swept segment catches a crossing that endpoint sampling would miss', () => {
    // A long segment (many ticks) skewers a thin capsule. Both endpoints sit
    // far outside, so naive per-frame point sampling misses — the swept
    // segment distance still returns a hit. Proves the test is swept, not sampled.
    const a0 = { x: -hullHalfLen, y: 0 };
    const a1 = { x: hullHalfLen, y: 0 };
    const s0 = { x: 0, y: -500 };
    const s1 = { x: 0, y: 500 };
    // Endpoint sampling: both ends are 500u away — a miss.
    expect(Math.hypot(s0.x, s0.y)).toBeGreaterThan(hullRadius);
    expect(Math.hypot(s1.x, s1.y)).toBeGreaterThan(hullRadius);
    // Swept segment: crosses the axis, distance 0 — a hit.
    expect(segSegDistance(s0, s1, a0, a1)).toBeCloseTo(0);
  });
});

describe('resolveBoundary', () => {
  it('leaves a ship inside the map untouched', () => {
    const s: ShipState = { x: 100, y: 0, heading: 0, speed: 10 };
    resolveBoundary(s, 900);
    expect(s).toEqual({ x: 100, y: 0, heading: 0, speed: 10 });
  });

  it('clamps a ship past the edge back onto the circle and damps speed', () => {
    const s: ShipState = { x: 1000, y: 0, heading: 0, speed: 20 };
    resolveBoundary(s, 900);
    expect(Math.hypot(s.x, s.y)).toBeCloseTo(900, 9);
    expect(s.speed).toBeCloseTo(20 * DAMP, 9);
  });
});

describe('resolveShipIslands', () => {
  const island: Circle = { x: 0, y: 0, r: 50 };

  it('leaves a clear ship untouched', () => {
    const s: ShipState = { x: 200, y: 0, heading: 0, speed: 10 };
    resolveShipIslands(s, [island]);
    expect(s).toEqual({ x: 200, y: 0, heading: 0, speed: 10 });
  });

  it('pushes an overlapping ship out along the normal and damps speed', () => {
    // Center 30u from island center, well inside r + SHIP_RADIUS (=56).
    const s: ShipState = { x: 30, y: 0, heading: 0, speed: 12 };
    resolveShipIslands(s, [island]);
    const gap = Math.hypot(s.x - island.x, s.y - island.y);
    expect(gap).toBeCloseTo(island.r + SHIP_RADIUS, 9); // exactly at the contact
    expect(s.y).toBeCloseTo(0, 9); // pushed straight out along +x
    expect(s.speed).toBeCloseTo(12 * DAMP, 9);
  });

  it('escapes a dead-center ship deterministically (+x)', () => {
    const s: ShipState = { x: 0, y: 0, heading: 1, speed: 5 };
    resolveShipIslands(s, [island]);
    expect(s.x).toBeCloseTo(island.r + SHIP_RADIUS, 9);
    expect(s.y).toBeCloseTo(0, 9);
  });
});

describe('no-escape property: driving hard into obstacles never penetrates', () => {
  const cfg = CONFIG.shipClasses.cruiser.kinematics;
  const island: Circle = { x: 300, y: 0, r: 60 };

  function drive(seed: number): void {
    const rng = mulberry32(seed);
    const s: ShipState = { x: 200, y: 0, heading: 0, speed: 0 };
    for (let i = 0; i < 400; i++) {
      // Random-ish drive biased forward (into the island) with wandering rudder.
      const inp = { throttle: 1, rudder: rng.float(-1, 1) };
      stepShip(s, inp, cfg, CONFIG.tick.simDtMs / 1000);
      resolveShipIslands(s, [island]);
      resolveBoundary(s, 900);
      // Invariant after resolution: never inside the island, never past the edge.
      const gap = Math.hypot(s.x - island.x, s.y - island.y);
      expect(gap).toBeGreaterThanOrEqual(island.r + SHIP_RADIUS - 1e-6);
      expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(900 + 1e-6);
    }
  }

  it('holds across many random drives', () => {
    for (let seed = 1; seed <= 12; seed++) drive(seed);
  });
});
