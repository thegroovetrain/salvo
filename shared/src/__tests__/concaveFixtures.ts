// TEST FIXTURES — two CONCAVE polygons for the concave-safety tests.
//
// The polygon library (sim/silhouette.ts) and the projectile sweep (sim/shell.ts)
// promise to be concave-safe: a cavity is OUTSIDE the hull and a projectile can
// run into it without hitting. The four battleships' traced outlines have no
// cavity deep enough to prove that, so the proof keeps the two outlines that
// did: the retired Mine Layer (a square transom notch between two stern
// prongs) and the retired Torpedo Boat (a shallow V notch in the stern), at the
// dims they had when they sailed. Both classes left the game with Story 10.4
// (2026-11-04); these are geometry fixtures, never hulls — nothing outside the
// tests can reach them.
//
// Local frame, like every silhouette: origin-centred, bow along +x.

import type { Vec2 } from '../math/vec.js';

/** Board-SVG outline (bow-up, y-down) -> local frame at exactly length × beam. */
function fromBoard(raw: readonly (readonly [number, number])[], length: number, beam: number): Vec2[] {
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const lengthScale = length / (Math.max(...ys) - Math.min(...ys));
  const beamScale = beam / (Math.max(...xs) - Math.min(...xs));
  return raw.map(([x, y]) => ({ x: (midY - y) * lengthScale, y: (x - midX) * beamScale }));
}

/**
 * 88 × 20 with a SQUARE TRANSOM NOTCH: the stern (x = −44) is two prongs with
 * a cavity between them whose walls run at y = ±3.5 and whose inner wall sits
 * 12/82 of the length forward of the stern. Bow tip at (44, 0).
 */
export const TRANSOM_NOTCH_HULL: readonly Vec2[] = fromBoard(
  [
    [18, 2],
    [24, 22],
    [27, 50],
    [28, 84],
    [21.5, 84], // starboard prong
    [21.5, 72],
    [14.5, 72], // the notch's inner wall
    [14.5, 84],
    [8, 84],
    [9, 50],
    [12, 22],
  ],
  88,
  20,
);

/**
 * 100 × 9 with a shallow V NOTCH in the stern: prong tips at (−50, ±3.5), the
 * notch apex on the centreline forward of them.
 */
export const V_NOTCH_HULL: readonly Vec2[] = fromBoard(
  [
    [12, 2],
    [15.5, 22],
    [16.5, 58],
    [15.5, 90],
    [12, 84], // the notch apex
    [8.5, 90],
    [7.5, 58],
    [8.5, 22],
  ],
  100,
  9,
);
