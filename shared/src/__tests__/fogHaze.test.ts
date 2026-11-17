// fogHazeDepth — the distance haze (Story 11.6, Eric 2026-11-15): a hull is
// crisp to the class-and-name sight and fades to gone at the hull sight.
import { describe, expect, it } from 'vitest';
import { fogHazeDepth } from '../sim/fogDepth.js';

describe('fogHazeDepth', () => {
  const S = 4545;
  const H = 7955;
  const T = 499;

  it('adds nothing out to the class-and-name sight', () => {
    for (const d of [0, S / 2, S]) expect(fogHazeDepth(d, S, H, T)).toBe(0);
  });

  it('rises monotonically from 0 past the sight to exactly T at the hull sight, and holds T beyond', () => {
    let prev = 0;
    for (let k = 1; k <= 20; k++) {
      const v = fogHazeDepth(S + ((H - S) * k) / 20, S, H, T);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
    expect(fogHazeDepth(H, S, H, T)).toBe(T);
    expect(fogHazeDepth(H * 2, S, H, T)).toBe(T);
  });

  it('is linear in distance between the two reaches', () => {
    const mid = fogHazeDepth((S + H) / 2, S, H, T);
    expect(Math.abs(mid - T / 2)).toBeLessThan(1e-9);
  });

  it('a hull sight not past the sight is a hard edge; non-finite input fails open', () => {
    expect(fogHazeDepth(S + 1, S, S, T)).toBe(T);
    expect(fogHazeDepth(NaN, S, H, T)).toBe(0);
    expect(fogHazeDepth(S + 10, NaN, H, T)).toBe(0);
    expect(fogHazeDepth(S + 10, S, H, Infinity)).toBe(0);
    expect(fogHazeDepth(S + 10, S, H, 0)).toBe(0);
  });
});
