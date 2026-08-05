// Pins the `return`-grammar aspect primitive (the radar realism cycle, Eric
// rulings 2026-08-05, amendments 60-66): perpendicularExtent is the ONE
// quantity a return-mode blip carries (`ext`), and the design thesis lives in
// its geometry — a hull's echo width depends on ASPECT, so size stops mapping
// cleanly to class. These tests pin the thesis itself (bow-on < abeam, the
// cross-class overlap), the from-either-side symmetry, and the
// translation-invariance that lets callers pass world-posed polygons.

import { describe, it, expect } from 'vitest';
import {
  SHIP_CLASS_IDS,
  hullEnvelope,
  hullSilhouette,
  perpendicularExtent,
  transformPolygon,
} from '../index.js';

const bb = hullSilhouette('battleship');
const tb = hullSilhouette('torpedoBoat');

/** [min, max] extent across bearings 0..π (π-symmetry covers the rest). */
function extentRange(id: (typeof SHIP_CLASS_IDS)[number], samples = 256): [number, number] {
  const poly = hullSilhouette(id);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < samples; i++) {
    const e = perpendicularExtent(poly, (i / samples) * Math.PI);
    if (e < min) min = e;
    if (e > max) max = e;
  }
  return [min, max];
}

describe('perpendicularExtent — the design thesis (AC1)', () => {
  it('a battleship bow-on paints materially SMALLER than the same hull abeam', () => {
    // Local frame: bow at +x. Bearing 0 = observer→target along the hull
    // axis (bow-on) → the echo spans the BEAM; bearing π/2 (abeam) → the
    // echo spans the LENGTH. Normalization pins both spans exactly.
    const { hull } = hullEnvelope('battleship');
    const bowOn = perpendicularExtent(bb, 0);
    const abeam = perpendicularExtent(bb, Math.PI / 2);
    expect(bowOn).toBeCloseTo(hull.beam, 9); // 32u
    expect(abeam).toBeCloseTo(hull.length, 9); // 124u
    expect(abeam).toBeGreaterThan(bowOn * 3); // materially, not marginally
  });
});

describe('perpendicularExtent — no single extent value identifies a class (amendments 64, 66)', () => {
  it('a torpedo boat abeam out-paints a battleship bow-on, so the class bands overlap', () => {
    // The mysticism ohzie asked for, delivered by physics: the LIGHTEST hull
    // at its broadest aspect returns a BIGGER echo than the heaviest hull at
    // its narrowest, so echo size alone can never resolve class.
    const tbAbeam = perpendicularExtent(tb, Math.PI / 2); // 100u (TB length)
    const bbBowOn = perpendicularExtent(bb, 0); // 32u (BB beam)
    expect(tbAbeam).toBeGreaterThan(bbBowOn);
  });

  it('all three ship classes overlap pairwise across the full aspect sweep (AC2)', () => {
    const ranges = SHIP_CLASS_IDS.map((id) => extentRange(id));
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        const [aMin, aMax] = ranges[i];
        const [bMin, bMax] = ranges[j];
        // A shared band exists: some extent value is producible by BOTH hulls.
        expect(Math.max(aMin, bMin)).toBeLessThan(Math.min(aMax, bMax));
      }
    }
  });
});

describe('perpendicularExtent — invariances', () => {
  it('is invariant under bearing + π (a hull is the same width from either side)', () => {
    for (const id of SHIP_CLASS_IDS) {
      const poly = hullSilhouette(id);
      for (const bearing of [0, 0.3, Math.PI / 2, 1.9, 2.7]) {
        expect(perpendicularExtent(poly, bearing + Math.PI)).toBeCloseTo(
          perpendicularExtent(poly, bearing),
          9,
        );
      }
    }
  });

  it('is translation-invariant (world-posed and origin-posed polygons agree)', () => {
    // M2 computes ext off transformPolygon output at the ship's world pose;
    // max−min of the projections cancels the translation exactly.
    const heading = 0.7;
    const bearing = 1.2;
    const atOrigin = transformPolygon(bb, 0, 0, heading);
    const atPose = transformPolygon(bb, 512, -340, heading);
    expect(perpendicularExtent(atPose, bearing)).toBeCloseTo(
      perpendicularExtent(atOrigin, bearing),
      9,
    );
  });
});
