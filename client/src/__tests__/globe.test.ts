// THE GLOBES' SHARED SEGMENT (Story 8.6) — how much water is in the bowl.
//
// The HP globe fills with the circular segment BELOW its waterline, which in
// Pixi's y-down space means y GREATER than `waterY`: a fuller hull has a
// SMALLER `waterY`, and the two ends of the range are the empty bowl and the
// brimming one. Those two ends are exactly where a sign slip hides, so they are
// pinned by area rather than by eye, and the middle is pinned as monotone.

import { describe, it, expect } from 'vitest';
import { circleSegmentBelow } from '../render/globe.js';
import type { PolyPoint } from '../util/poly.js';

const R = 52; // the ratified globe radius (104px, epic-8 amendment 32)

/** The exact area of the whole disc, against which a sampled polygon is
 *  measured as a RATIO — a 64-gon is ~0.16% short of its circle by
 *  construction, so an absolute tolerance would only be pinning the sampling. */
const DISC = Math.PI * R * R;

/** Shoelace area of a closed polygon. */
function area(pts: readonly PolyPoint[]): number {
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    acc += a.x * b.y - b.x * a.y;
  }
  return Math.abs(acc) / 2;
}

describe('circleSegmentBelow — the fill under the waterline', () => {
  it('is EMPTY at waterY = r — an empty hull draws nothing, not a sliver', () => {
    expect(circleSegmentBelow(R, R)).toEqual([]);
    expect(circleSegmentBelow(R, R + 1)).toEqual([]);
  });

  it('is the FULL circle at waterY = -r', () => {
    const full = circleSegmentBelow(R, -R);
    expect(area(full) / DISC).toBeCloseTo(1, 2);
    expect(area(circleSegmentBelow(R, -R - 10)) / DISC).toBeCloseTo(1, 2);
  });

  it('is HALF the circle at waterY = 0', () => {
    expect(area(circleSegmentBelow(R, 0)) / (DISC / 2)).toBeCloseTo(1, 2);
  });

  it('shrinks MONOTONICALLY as the waterline rises (y falls in Pixi space)', () => {
    let prev = -1;
    for (let waterY = R; waterY >= -R; waterY -= R / 16) {
      const a = area(circleSegmentBelow(R, waterY));
      expect(a, `waterY ${waterY.toFixed(2)}`).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = a;
    }
  });

  it('closes along the CHORD: both ends sit on the waterline, the rest under it', () => {
    const waterY = R / 3;
    const seg = circleSegmentBelow(R, waterY);
    expect(seg.length).toBeGreaterThanOrEqual(48); // the ratified sampling floor
    expect(seg[0].y).toBeCloseTo(waterY, 9);
    expect(seg[seg.length - 1].y).toBeCloseTo(waterY, 9);
    expect(seg[0].x).toBeCloseTo(Math.sqrt(R * R - waterY * waterY), 9);
    expect(seg[seg.length - 1].x).toBeCloseTo(-Math.sqrt(R * R - waterY * waterY), 9);
    for (const p of seg) {
      expect(p.y).toBeGreaterThanOrEqual(waterY - 1e-9);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(R, 9); // every vertex is ON the circle
    }
  });

  it('passes through the bowl\'s floor at six o\'clock', () => {
    const seg = circleSegmentBelow(R, R / 2);
    expect(Math.max(...seg.map((p) => p.y))).toBeCloseTo(R, 6);
  });

  it('is total on a degenerate globe', () => {
    expect(circleSegmentBelow(0, 0)).toEqual([]);
    expect(circleSegmentBelow(-5, 0)).toEqual([]);
    expect(circleSegmentBelow(R, Number.NaN)).toEqual([]);
  });
});
