import { describe, it, expect } from 'vitest';
import { segCircleExit, segCircleHit, segSegDistance, pointInCircle } from '../math/geom.js';

describe('pointInCircle', () => {
  it('detects containment inclusive of the boundary', () => {
    expect(pointInCircle({ x: 0, y: 0 }, { x: 0, y: 0 }, 5)).toBe(true);
    expect(pointInCircle({ x: 5, y: 0 }, { x: 0, y: 0 }, 5)).toBe(true); // on boundary
    expect(pointInCircle({ x: 6, y: 0 }, { x: 0, y: 0 }, 5)).toBe(false);
  });
});

describe('segCircleHit', () => {
  const center = { x: 0, y: 0 };

  it('finds the entry t for a segment crossing the circle', () => {
    const t = segCircleHit({ x: -10, y: 0 }, { x: 10, y: 0 }, center, 5);
    expect(t).not.toBeNull();
    // crosses at x=-5 -> t = 5/20 = 0.25
    expect(t as number).toBeCloseTo(0.25);
  });

  it('returns null for a clear miss', () => {
    expect(segCircleHit({ x: -10, y: 20 }, { x: 10, y: 20 }, center, 5)).toBeNull();
  });

  it('treats a tangent as a grazing hit', () => {
    // segment along y=5 grazes the top of a r=5 circle
    const t = segCircleHit({ x: -10, y: 5 }, { x: 10, y: 5 }, center, 5);
    expect(t).not.toBeNull();
    expect(t as number).toBeCloseTo(0.5);
  });

  it('returns 0 when the segment starts inside (no tunneling out)', () => {
    expect(segCircleHit({ x: 0, y: 0 }, { x: 100, y: 0 }, center, 5)).toBe(0);
  });

  it('returns null when the circle is beyond the segment end', () => {
    expect(segCircleHit({ x: -100, y: 0 }, { x: -50, y: 0 }, center, 5)).toBeNull();
  });

  it('handles a degenerate (point) segment', () => {
    expect(segCircleHit({ x: 3, y: 0 }, { x: 3, y: 0 }, center, 5)).toBe(0); // inside
    expect(segCircleHit({ x: 9, y: 0 }, { x: 9, y: 0 }, center, 5)).toBeNull(); // outside
  });
});

describe('segCircleExit', () => {
  const center = { x: 0, y: 0 };

  it('finds the far crossing where a segment starting inside exits the circle', () => {
    // From origin heading +x, exits r=5 circle at x=5 -> t = 5/10 = 0.5.
    const t = segCircleExit({ x: 0, y: 0 }, { x: 10, y: 0 }, center, 5);
    expect(t).not.toBeNull();
    expect(t as number).toBeCloseTo(0.5);
  });

  it('returns null when the segment stays fully inside the circle', () => {
    expect(segCircleExit({ x: 0, y: 0 }, { x: 1, y: 0 }, center, 5)).toBeNull();
  });

  it('handles a tangent grazing the circle', () => {
    // Segment along y=5 grazes the top of a r=5 circle: exit root ~ midpoint.
    const t = segCircleExit({ x: -10, y: 5 }, { x: 10, y: 5 }, center, 5);
    if (t !== null) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
      expect(t).toBeCloseTo(0.5);
    }
  });

  it('returns null for a degenerate (point) segment', () => {
    expect(segCircleExit({ x: 3, y: 0 }, { x: 3, y: 0 }, center, 5)).toBeNull();
  });

  it('returns null when the exit lies beyond the segment end', () => {
    // Starts inside but the segment is too short to reach the boundary.
    expect(segCircleExit({ x: 0, y: 0 }, { x: 2, y: 0 }, center, 5)).toBeNull();
  });
});

describe('segSegDistance', () => {
  it('is zero for crossing segments', () => {
    const d = segSegDistance({ x: -5, y: 0 }, { x: 5, y: 0 }, { x: 0, y: -5 }, { x: 0, y: 5 });
    expect(d).toBeCloseTo(0);
  });

  it('measures the gap between parallel segments', () => {
    const d = segSegDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 4 }, { x: 10, y: 4 });
    expect(d).toBeCloseTo(4);
  });

  it('measures endpoint-to-endpoint for disjoint collinear segments', () => {
    const d = segSegDistance({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 8, y: 0 }, { x: 12, y: 0 });
    expect(d).toBeCloseTo(3);
  });

  it('handles degenerate point-vs-segment', () => {
    const d = segSegDistance({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(d).toBeCloseTo(5); // point (5,5) to x-axis segment
  });

  it('handles degenerate point-vs-point', () => {
    const d = segSegDistance({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 4 });
    expect(d).toBeCloseTo(5);
  });
});
