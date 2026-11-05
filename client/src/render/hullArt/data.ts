// THE HULL ART DATA (Story 10.4, epic-10 amendment 7(h)/(i)): the four
// battleships' deck detail and main gunhouses, ported AS NUMBERS from the
// design sitting's feature tables (`battleship-sitting-2026-11-04.html`,
// `HOUSES` + `FEATURES`, version "Deck detail outlines" — Eric 2026-11-04:
// *"THAT is what I am FUCKING talking about! YEAH!"*). No image and no markup
// from that page is in the repo; only these numbers.
//
// ONE UNIT CONVENTION, the page's own, so a diff against the page is a straight
// read: POSITIONS are fractions — `x` of the length overall from the BOW, `y`
// of the beam off the centreline (+ = starboard) — and SIZES are METRES. The
// one place they become game units is `render/hullArt/shapes.ts` (positions ×
// the hull's CONFIG length / beam, sizes × `U_PER_M`), which is exactly the
// page's own `X(fx) = (0.5 − fx)·L`, `Y(fy) = fy·B`, `m = U_PER_M`.
//
// Pure data, no Pixi, no DOM: the canvas art and the DOM (SVG) art both read it.

import type { ShipClassId } from '@salvo/shared';

// THE SCALE (u per metre) is shared's `U_PER_M` (shared/src/constants.ts) —
// ONE constant, imported where the metres become units (shapes.ts).

/** A point as the page writes it: [fraction of length from the bow, fraction of beam]. */
export type FracPoint = readonly [number, number];

/** A main gunhouse, in the TURRET frame (x along the barrels, metres). */
export interface HouseSpec {
  /** Gunhouse polygon, metres, turret frame. Vertex 2's x is the gun face. */
  readonly poly: readonly FracPoint[];
  /** Barbette ring radius (m). */
  readonly barbette: number;
  /** Barrel length past the face (m). */
  readonly barrel: number;
  /** Across-track spacing between barrels (m). */
  readonly gap: number;
}

/** Superstructure tier (level 1..3) — a polygon in fraction space. */
export interface TierFeature {
  readonly t: 'tier';
  readonly lvl: 1 | 2 | 3;
  readonly pts: readonly FracPoint[];
}
/** A tower top / AA tub — a disc of radius `r` m. */
export interface RoundFeature {
  readonly t: 'round';
  readonly x: number;
  readonly y: number;
  readonly r: number;
}
/** A funnel — an `l` × `w` m ellipse with a dark mouth. */
export interface FunnelFeature {
  readonly t: 'funnel';
  readonly x: number;
  readonly y: number;
  readonly l: number;
  readonly w: number;
}
/** A secondary mount — an `l` × `w` m house trained to bearing `a` (deg, hull
 *  frame, 0 = the bow), `n` barrels `b` m long. */
export interface SecFeature {
  readonly t: 'sec';
  readonly x: number;
  readonly y: number;
  readonly a: number;
  readonly n: number;
  readonly l: number;
  readonly w: number;
  readonly b: number;
}
/** A casemate notch — an `l` × `w` m box. */
export interface CaseFeature {
  readonly t: 'case';
  readonly x: number;
  readonly y: number;
  readonly l: number;
  readonly w: number;
}
/** A catapult rail or a deck line — a segment in fraction space. */
export interface SegFeature {
  readonly t: 'rail' | 'line';
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}
/** A crane — a jib `l` m long at bearing `a` (deg) from its post. */
export interface CraneFeature {
  readonly t: 'crane';
  readonly x: number;
  readonly y: number;
  readonly a: number;
  readonly l: number;
}

export type Feature = TierFeature | RoundFeature | FunnelFeature | SecFeature | CaseFeature | SegFeature | CraneFeature;

/** The page's `HOUSES`, verbatim. */
export const HOUSES: Readonly<Record<ShipClassId, HouseSpec>> = {
  yamato: { poly: [[-9, -9.5], [5, -9.5], [9.5, -6], [9.5, 6], [5, 9.5], [-9, 9.5]], barbette: 9.8, barrel: 21, gap: 4.5 },
  bismarck: { poly: [[-7, -5.2], [3, -5.2], [6, -3.2], [6, 3.2], [3, 5.2], [-7, 5.2]], barbette: 5.6, barrel: 17, gap: 3.75 },
  warspite: { poly: [[-6, -4.8], [3, -4.8], [5.5, -3], [5.5, 3], [3, 4.8], [-6, 4.8]], barbette: 5.2, barrel: 15, gap: 3 },
  iowa: { poly: [[-6.5, -6.6], [4, -6.6], [7, -3.8], [7, 3.8], [4, 6.6], [-6.5, 6.6]], barbette: 6.9, barrel: 20, gap: 3.1 },
};

// --- builders for the page's mirrored spreads (port of its flatMap idioms) ---

/** A secondary on BOTH beams at each `x` (port at −y / bearing −90°, starboard
 *  at +y / +90°) — the page's `[...].flatMap(x => [port, stbd])`. */
function secPairs(xs: readonly number[], y: number, n: number, l: number, w: number, b: number): SecFeature[] {
  return xs.flatMap((x) => [
    { t: 'sec', x, y: -y, a: -90, n, l, w, b },
    { t: 'sec', x, y, a: 90, n, l, w, b },
  ]);
}

/** A disc on both beams at each `[x, y]`. */
function roundPairs(at: readonly FracPoint[], r: number): RoundFeature[] {
  return at.flatMap(([x, y]) => [
    { t: 'round', x, y: -y, r },
    { t: 'round', x, y, r },
  ]);
}

/** A casemate on both beams at each `x`. */
function casePairs(xs: readonly number[], y: number, l: number, w: number): CaseFeature[] {
  return xs.flatMap((x) => [
    { t: 'case', x, y: -y, l, w },
    { t: 'case', x, y, l, w },
  ]);
}

/** The page's `FEATURES`, in its own order (draw order = list order). */
export const FEATURES: Readonly<Record<ShipClassId, readonly Feature[]>> = {
  yamato: [
    { t: 'tier', lvl: 1, pts: [[0.44, -0.28], [0.47, -0.43], [0.68, -0.43], [0.71, -0.28], [0.71, 0.28], [0.68, 0.43], [0.47, 0.43], [0.44, 0.28]] },
    { t: 'tier', lvl: 2, pts: [[0.495, -0.2], [0.51, -0.34], [0.64, -0.34], [0.655, -0.2], [0.655, 0.2], [0.64, 0.34], [0.51, 0.34], [0.495, 0.2]] },
    { t: 'tier', lvl: 3, pts: [[0.503, -0.11], [0.545, -0.11], [0.545, 0.11], [0.503, 0.11]] },
    { t: 'round', x: 0.516, y: 0, r: 4.6 },
    { t: 'round', x: 0.531, y: 0, r: 2.6 },
    { t: 'funnel', x: 0.596, y: 0, l: 8.4, w: 5.8 },
    { t: 'sec', x: 0.468, y: 0, a: 0, n: 3, l: 9, w: 6, b: 11 },
    { t: 'sec', x: 0.69, y: 0, a: 180, n: 3, l: 9, w: 6, b: 11 },
    ...secPairs([0.528, 0.549, 0.57, 0.591, 0.612], 0.45, 2, 4, 3.6, 4.5),
    ...secPairs([0.632], 0.36, 2, 4, 3.6, 4.5),
    ...roundPairs([[0.235, 0.32], [0.262, 0.3], [0.366, 0.26], [0.435, 0.23], [0.484, 0.23], [0.76, 0.3], [0.79, 0.33], [0.84, 0.3]], 2.6),
    { t: 'rail', x0: 0.86, y0: -0.24, x1: 0.96, y1: -0.2 },
    { t: 'rail', x0: 0.86, y0: 0.24, x1: 0.96, y1: 0.2 },
    { t: 'crane', x: 0.85, y: 0, a: 180, l: 14 },
    { t: 'line', x0: 0.31, y0: -0.47, x1: 0.31, y1: 0.47 },
  ],
  bismarck: [
    { t: 'tier', lvl: 1, pts: [[0.33, -0.22], [0.345, -0.34], [0.66, -0.34], [0.68, -0.2], [0.68, 0.2], [0.66, 0.34], [0.345, 0.34], [0.33, 0.22]] },
    { t: 'tier', lvl: 2, pts: [[0.4, -0.19], [0.47, -0.19], [0.47, 0.19], [0.4, 0.19]] },
    { t: 'round', x: 0.44, y: 0, r: 4.2 },
    { t: 'round', x: 0.447, y: 0, r: 2.4 },
    { t: 'funnel', x: 0.505, y: 0, l: 8, w: 5 },
    { t: 'tier', lvl: 2, pts: [[0.53, -0.21], [0.64, -0.21], [0.64, 0.21], [0.53, 0.21]] },
    { t: 'round', x: 0.62, y: 0, r: 3 },
    { t: 'rail', x0: 0.56, y0: -0.47, x1: 0.56, y1: 0.47 },
    ...secPairs([0.385, 0.5, 0.6], 0.42, 2, 7, 5, 8),
    ...secPairs([0.42, 0.46, 0.58, 0.62], 0.27, 2, 4, 3.2, 4),
    { t: 'crane', x: 0.545, y: -0.3, a: -90, l: 10 },
    { t: 'crane', x: 0.545, y: 0.3, a: 90, l: 10 },
  ],
  warspite: [
    { t: 'tier', lvl: 1, pts: [[0.37, -0.22], [0.4, -0.37], [0.62, -0.37], [0.66, -0.22], [0.66, 0.22], [0.62, 0.37], [0.4, 0.37], [0.37, 0.22]] },
    { t: 'tier', lvl: 2, pts: [[0.395, -0.21], [0.47, -0.21], [0.47, 0.21], [0.395, 0.21]] },
    { t: 'round', x: 0.412, y: 0, r: 3.6 },
    { t: 'round', x: 0.412, y: 0, r: 1.8 },
    { t: 'funnel', x: 0.477, y: 0, l: 7, w: 4.6 },
    { t: 'tier', lvl: 2, pts: [[0.5, -0.2], [0.57, -0.2], [0.57, 0.2], [0.5, 0.2]] },
    { t: 'rail', x0: 0.535, y0: -0.47, x1: 0.535, y1: 0.47 },
    { t: 'crane', x: 0.585, y: -0.3, a: 180, l: 10 },
    { t: 'crane', x: 0.585, y: 0.3, a: 180, l: 10 },
    ...secPairs([0.49, 0.53], 0.3, 2, 4, 3.2, 4),
    ...casePairs([0.31, 0.34, 0.37, 0.4], 0.46, 4, 2.2),
    ...roundPairs([[0.455, 0.34], [0.505, 0.34]], 2.4),
  ],
  iowa: [
    { t: 'tier', lvl: 1, pts: [[0.395, -0.1], [0.43, -0.31], [0.665, -0.31], [0.7, -0.15], [0.7, 0.15], [0.665, 0.31], [0.43, 0.31], [0.395, 0.1]] },
    { t: 'tier', lvl: 2, pts: [[0.43, -0.15], [0.478, -0.15], [0.478, 0.15], [0.43, 0.15]] },
    { t: 'round', x: 0.46, y: 0, r: 3.6 },
    { t: 'round', x: 0.46, y: 0, r: 1.8 },
    { t: 'funnel', x: 0.515, y: 0, l: 7.5, w: 5 },
    { t: 'funnel', x: 0.61, y: 0, l: 7.5, w: 5 },
    { t: 'tier', lvl: 2, pts: [[0.625, -0.11], [0.66, -0.11], [0.66, 0.11], [0.625, 0.11]] },
    { t: 'round', x: 0.642, y: 0, r: 2.4 },
    ...secPairs([0.468, 0.515, 0.578, 0.612, 0.65], 0.2, 2, 4.8, 4.2, 5),
    ...roundPairs([[0.186, 0.135], [0.23, 0.3], [0.362, 0.42], [0.436, 0.44], [0.56, 0.46], [0.593, 0.46], [0.683, 0.45], [0.83, 0.18], [0.93, 0.22], [0.985, 0.14]], 2.2),
    { t: 'rail', x0: 0.9, y0: -0.1, x1: 0.975, y1: -0.2 },
    { t: 'rail', x0: 0.9, y0: 0.1, x1: 0.975, y1: 0.2 },
    { t: 'crane', x: 0.945, y: 0, a: 180, l: 10 },
  ],
};
