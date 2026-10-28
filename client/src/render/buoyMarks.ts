// THE BUOY KIND MARKS (Story 10.9, epic-10 amendments 2 and 4) — ONE mark
// vocabulary for the four buoys, read by BOTH surfaces that draw a buoy: the
// spar-buoy marker on the chart (render/decoys.ts) and the belt / picker glyph
// (render/equipmentIcons.ts). Copying the coordinates into a second table is
// how two surfaces start disagreeing about which buoy heals, so the mark is
// DATA here and both emitters scale it.
//
// The buoy keeps the old DECOY BUOY's silhouette (waterline, spar, diamond
// radar-reflector topmark — zero circles, so it never reads as a mine) and
// hangs ONE small mark under the waterline, centred on the spar's foot:
//
//   radar   — a SWEEP FAN: a narrow pie slice with its apex at the top, the
//             beam the buoy turns (echoes the second sweep it draws);
//   healing — a PLUS;
//   shield  — a HEATER SHIELD outline (the SHIELD BLOCK glyph's shape);
//   speed   — a DOUBLE CHEVRON (the Shift boost's glyph — the two add).
//
// IMPLEMENTER DRAFT for Eric's eye (the candidate page, AC 10). Monochrome by
// construction: a mark carries no colour of its own — the caller strokes it in
// the marker's own hue (on the chart) or the glyph's `currentColor`. Radar
// returns stay hue-free (DESIGN.md § Two sensor tiers): nothing here paints the
// scope. Every primitive is an OPEN POLYLINE in a UNIT FRAME (centre (0,0),
// extent ±1; a closed shape repeats its first point) — no circles, so the
// "distinct from a mine" property of the buoy carries through.
//
// Pure, zero Pixi, zero DOM.

import type { BuoyKind } from '@salvo/shared';

/** A point in the unit mark frame. */
export type MarkPoint = readonly [number, number];

/** One open polyline of a mark (a closed shape repeats its first point). */
export type MarkPolyline = readonly MarkPoint[];

/** The sweep fan's half-angle (rad) about straight down, and its reach. */
const FAN_HALF = Math.PI / 6;
const FAN_R = 1.8;
/** The fan's apex sits at the top of the unit box. */
const FAN_APEX: MarkPoint = [0, -0.9];

/** Points along the fan's closing arc, apex-relative, `n` steps. */
function fanArc(n: number): MarkPoint[] {
  const down = Math.PI / 2;
  return Array.from({ length: n + 1 }, (_, i): MarkPoint => {
    const a = down - FAN_HALF + (2 * FAN_HALF * i) / n;
    return [FAN_APEX[0] + Math.cos(a) * FAN_R, FAN_APEX[1] + Math.sin(a) * FAN_R];
  });
}

const RADAR_FAN: MarkPolyline = [FAN_APEX, ...fanArc(6), FAN_APEX];

/**
 * THE MARK TABLE — TOTAL over `BuoyKind`, so a fifth kind fails to compile on
 * every surface rather than draw nothing. Unit frame, ±1.
 */
export const BUOY_KIND_MARKS: Readonly<Record<BuoyKind, readonly MarkPolyline[]>> = {
  radar: [RADAR_FAN],
  healing: [
    [
      [-0.85, 0],
      [0.85, 0],
    ],
    [
      [0, -0.85],
      [0, 0.85],
    ],
  ],
  shield: [
    [
      [-0.75, -0.85],
      [0.75, -0.85],
      [0.75, 0.1],
      [0, 0.95],
      [-0.75, 0.1],
      [-0.75, -0.85],
    ],
  ],
  speed: [
    [
      [-0.85, -0.75],
      [-0.15, 0],
      [-0.85, 0.75],
    ],
    [
      [0.1, -0.75],
      [0.8, 0],
      [0.1, 0.75],
    ],
  ],
};

/** Pure: a kind's mark placed at (`cx`, `cy`) with half-size `half` — the
 *  unit polylines scaled and translated, ready for either emitter. */
export function placeKindMark(kind: BuoyKind, cx: number, cy: number, half: number): MarkPoint[][] {
  return BUOY_KIND_MARKS[kind].map((line) => line.map(([x, y]): MarkPoint => [cx + x * half, cy + y * half]));
}
