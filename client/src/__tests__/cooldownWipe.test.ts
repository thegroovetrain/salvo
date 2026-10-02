// THE COOLDOWN WIPE (Story 8.6) — the radial clock that replaces the hotbar's
// perimeter track, and the ray helper underneath it.
//
// What is actually being pinned is the SHAPE OF TIME on a cooling slot: a dark
// overlay that uncovers CLOCKWISE FROM TWELVE, angle-uniform like the mock's
// CSS `conic-gradient`. The area checks are exact rather than approximate on
// purpose — `squareRayPoint` lands every sample exactly on the perimeter and
// every crossed corner is emitted, so a correct polygon has no sag to tolerate.

import { describe, it, expect } from 'vitest';
import { wipeLabel, wipePolygon } from '../render/cooldownWipe.js';
import { squareRayPoint, type PolyPoint } from '../util/poly.js';

const HALF = 27; // half of the bar's 54px weapon square

/** Shoelace area of a closed polygon (absolute — winding is not the subject). */
function area(pts: readonly PolyPoint[]): number {
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    acc += a.x * b.y - b.x * a.y;
  }
  return Math.abs(acc) / 2;
}

/** Even-odd point-in-polygon (ray cast). */
function inside(pts: readonly PolyPoint[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function hasPoint(pts: readonly PolyPoint[], x: number, y: number): boolean {
  return pts.some((p) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9);
}

describe('squareRayPoint — 0 deg = 12 o\'clock, positive CLOCKWISE', () => {
  it('lands the cardinal rays on the edge midpoints', () => {
    const top = squareRayPoint(0, HALF);
    expect(top.x).toBeCloseTo(0, 10);
    expect(top.y).toBeCloseTo(-HALF, 10); // Pixi y-down: twelve o'clock is NEGATIVE y
    const right = squareRayPoint(90, HALF);
    expect(right.x).toBeCloseTo(HALF, 10);
    expect(right.y).toBeCloseTo(0, 10);
    const bottom = squareRayPoint(180, HALF);
    expect(bottom.x).toBeCloseTo(0, 10);
    expect(bottom.y).toBeCloseTo(HALF, 10);
    const left = squareRayPoint(270, HALF);
    expect(left.x).toBeCloseTo(-HALF, 10);
    expect(left.y).toBeCloseTo(0, 10);
  });

  it('lands the diagonals exactly on the corners', () => {
    const tr = squareRayPoint(45, HALF);
    expect(tr.x).toBeCloseTo(HALF, 10);
    expect(tr.y).toBeCloseTo(-HALF, 10);
    expect(squareRayPoint(135, HALF).y).toBeCloseTo(HALF, 10); // bottom-right
    expect(squareRayPoint(225, HALF).x).toBeCloseTo(-HALF, 10); // bottom-left
  });

  it('is total and periodic — every direction has exactly one crossing', () => {
    for (let deg = -720; deg <= 720; deg += 7) {
      const p = squareRayPoint(deg, HALF);
      expect(Math.max(Math.abs(p.x), Math.abs(p.y)), `deg ${deg}`).toBeCloseTo(HALF, 10);
    }
    const a = squareRayPoint(30, HALF);
    const b = squareRayPoint(390, HALF);
    expect(a.x).toBeCloseTo(b.x, 10);
    expect(a.y).toBeCloseTo(b.y, 10);
    const degenerate = squareRayPoint(90, 0); // degenerate square
    expect(degenerate.x).toBeCloseTo(0, 10);
    expect(degenerate.y).toBeCloseTo(0, 10);
  });
});

describe('wipePolygon — the DARK region, uncovering clockwise from twelve', () => {
  it('at e = 0 covers the WHOLE square', () => {
    const poly = wipePolygon(0, HALF);
    expect(area(poly)).toBeCloseTo((HALF * 2) ** 2, 6);
    expect(poly).toHaveLength(4); // nothing to cut yet — the plain four corners
  });

  it('at e = 0.25 leaves the TOP-RIGHT quadrant clear and the rest dark', () => {
    const poly = wipePolygon(0.25, HALF);
    expect(inside(poly, HALF / 2, -HALF / 2)).toBe(false); // top-right — cleared
    expect(inside(poly, HALF / 2, HALF / 2)).toBe(true); // bottom-right
    expect(inside(poly, -HALF / 2, HALF / 2)).toBe(true); // bottom-left
    expect(inside(poly, -HALF / 2, -HALF / 2)).toBe(true); // top-left
    // Exactly three quarters of the square, because the 0 and 90 deg rays are
    // axis-aligned and the cleared wedge is exactly one quadrant.
    expect(area(poly)).toBeCloseTo((HALF * 2) ** 2 * 0.75, 6);
  });

  it('at e = 1 (and past it) is EMPTY — a finished reload draws nothing', () => {
    expect(wipePolygon(1, HALF)).toEqual([]);
    expect(wipePolygon(1.5, HALF)).toEqual([]);
  });

  it('emits every CROSSED corner exactly, and drops the cleared one', () => {
    const poly = wipePolygon(0.25, HALF);
    expect(hasPoint(poly, HALF, HALF)).toBe(true); // 135 — bottom-right
    expect(hasPoint(poly, -HALF, HALF)).toBe(true); // 225 — bottom-left
    expect(hasPoint(poly, -HALF, -HALF)).toBe(true); // 315 — top-left
    expect(hasPoint(poly, HALF, -HALF)).toBe(false); // 45 — swept past, uncovered
  });

  it('is ANGLE-uniform, not perimeter-uniform: half elapsed is half the square', () => {
    // The whole reason for `squareRayPoint`. A perimeter-fraction sweep would
    // put the halfway edge somewhere on the bottom flat instead of at six
    // o'clock, and the clock would read as visibly uneven.
    const half = wipePolygon(0.5, HALF);
    expect(area(half)).toBeCloseTo((HALF * 2) ** 2 * 0.5, 6);
    expect(inside(half, HALF / 2, -HALF / 2)).toBe(false); // top-right cleared
    expect(inside(half, HALF / 2, HALF / 2)).toBe(false); // bottom-right cleared
    expect(inside(half, -HALF / 2, HALF / 2)).toBe(true); // the left half is dark
  });

  it('shrinks MONOTONICALLY as the reload elapses', () => {
    let prev = Infinity;
    for (let e = 0; e < 1; e += 0.05) {
      const a = area(wipePolygon(e, HALF));
      expect(a, `e ${e.toFixed(2)}`).toBeLessThan(prev + 1e-9);
      prev = a;
    }
  });

  it('offsets to the square it is drawn in, and is total on garbage input', () => {
    const at = wipePolygon(0.25, HALF, 100, 40);
    expect(inside(at, 100 - HALF / 2, 40 + HALF / 2)).toBe(true);
    expect(inside(at, 100 + HALF / 2, 40 - HALF / 2)).toBe(false);
    expect(area(wipePolygon(Number.NaN, HALF))).toBeCloseTo((HALF * 2) ** 2, 6); // reads as 0
    expect(wipePolygon(-1, HALF)).toHaveLength(4);
  });
});

describe('wipeLabel — tenths under two seconds, whole seconds rounded UP above', () => {
  it('pins the ratified cases', () => {
    expect(wipeLabel(1999)).toBe('2.0');
    expect(wipeLabel(1950)).toBe('2.0');
    expect(wipeLabel(1200)).toBe('1.2');
    expect(wipeLabel(6100)).toBe('7');
    expect(wipeLabel(0)).toBe('');
  });

  it('covers the tenths band, the two-second boundary and a long cooldown', () => {
    expect(wipeLabel(40)).toBe('0.0'); // under a tenth: the numeral is about to go
    expect(wipeLabel(100)).toBe('0.1');
    expect(wipeLabel(2000)).toBe('2'); // the boundary flips to whole seconds
    expect(wipeLabel(2001)).toBe('3'); // ...rounded UP, which is the honest side
    expect(wipeLabel(18000)).toBe('18');
  });

  it('is EMPTY, never "0", for a slot that is not cooling', () => {
    expect(wipeLabel(-1)).toBe('');
    expect(wipeLabel(Number.NaN)).toBe('');
    expect(wipeLabel(Number.POSITIVE_INFINITY)).toBe('');
  });
});
