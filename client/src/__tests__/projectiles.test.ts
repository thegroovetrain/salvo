import { describe, it, expect } from 'vitest';
import { shellPosition } from '../render/projectiles.js';

describe('shellPosition (dead reckoning)', () => {
  it('extrapolates p0 + v*(now - t0)', () => {
    const p = shellPosition({ x: 0, y: 0 }, { vx: 130, vy: 0 }, 1000, 1500);
    expect(p.x).toBeCloseTo(65, 9); // 130 u/s * 0.5s
    expect(p.y).toBeCloseTo(0, 9);
  });

  it('handles a diagonal velocity', () => {
    const p = shellPosition({ x: 10, y: -5 }, { vx: 20, vy: -40 }, 0, 250);
    expect(p.x).toBeCloseTo(10 + 20 * 0.25, 9);
    expect(p.y).toBeCloseTo(-5 - 40 * 0.25, 9);
  });

  it('clamps a past/negative elapsed to the launch point', () => {
    const p = shellPosition({ x: 3, y: 7 }, { vx: 130, vy: 130 }, 2000, 1000);
    expect(p).toEqual({ x: 3, y: 7 });
  });
});
