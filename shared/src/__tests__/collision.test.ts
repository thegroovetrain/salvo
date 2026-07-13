import { describe, it, expect } from 'vitest';
import { segCircleHit, segSegDistance } from '../math/geom.js';
import { CONFIG } from '../constants.js';
import { MAP_RULES } from '../sim/map.js';

const DT = CONFIG.tick.simDtMs / 1000;
const maxProjSpeed = Math.max(CONFIG.gun.shellSpeed, CONFIG.torpedo.speed);
const maxTravel = maxProjSpeed * DT; // furthest a projectile moves in one tick
const hullRadius = CONFIG.ship.beam / 2; // capsule radius
const hullHalfLen = (CONFIG.ship.length - CONFIG.ship.beam) / 2;

describe('swept-shell no tunneling (worst case from CONFIG)', () => {
  it('per-tick travel is smaller than the thinnest obstacle', () => {
    // If a single tick's displacement is smaller than the obstacle thickness,
    // a swept segment test physically cannot skip over it.
    expect(maxTravel).toBeLessThan(2 * MAP_RULES.MIN_R); // thinnest island diameter
    expect(maxTravel).toBeLessThan(CONFIG.ship.beam); // hull broadside width
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
