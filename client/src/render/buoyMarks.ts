// THE BUOY GLYPH FAMILY — "TINTED BEACON" (Story 10.9; Eric 2026-10-29 picked
// family C on the rendered page, with the PULSE healing head). ONE vocabulary
// for the four buoys, read by EVERY surface that draws a buoy: the belt /
// picker glyph (render/equipmentIcons.ts), the chart marker (render/decoys.ts
// draws that same glyph) and the drop preview (render/aimPreview.ts). The
// geometry is DATA here and nowhere else, so the surfaces cannot drift apart.
//
// A buoy is two halves:
//
//   HULL — a waterline bar, a squat can (an open rounded box) on it and a short
//          mast up from the can. Monochrome: the caller strokes it in the
//          owner's hue on the chart, the glyph's `currentColor` in the belt.
//   HEAD — the top ~60 %, FILLED in the kind's colour (a CLIENT_CONFIG token):
//          radar   a half-disc dish, silver, with a dark mast cut through it;
//          healing a disc, phosphor, with a heartbeat PULSE cut through it
//                  (Eric 2026-10-29: no cross);
//          shield  the filled heater shield, info blue;
//          speed   the filled up-arrow, amber.
//
// The head colour is a SIGHT-ONLY truth marker, like the hull itself: radar
// returns carry no personal hue and no kind tint (DESIGN.md § Two sensor
// tiers) — nothing here paints the scope; a buoy's radar paint stays the
// anonymous square.
//
// Coordinates are authored in the approved mock's 24-unit SVG box (the
// `a-body` / `c-*` / `c-heal-pulse` symbols, `tmp-candidate/buoy-icons.html`)
// and converted once into the UNIT FRAME every glyph uses (centre (0,0),
// extent ±1). Curves are sampled into polylines so both emitters (Pixi and
// SVG) draw the same points. Pure, zero Pixi, zero DOM.

import type { BuoyKind } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

const C = CLIENT_CONFIG.colors;

/** A point in the unit glyph frame. */
export type MarkPoint = readonly [number, number];

/** One polyline (a closed outline repeats nothing — fills close themselves). */
export type MarkPolyline = readonly MarkPoint[];

/** One kind's head: a filled outline in the kind's colour, plus an optional
 *  line CUT through it in the ground colour. */
export interface BuoyHead {
  /** The closed outline the head fills (unit frame). */
  readonly fill: MarkPolyline;
  /** The kind's colour — always a `CLIENT_CONFIG.colors` token. */
  readonly color: number;
  /** A line cut through the head in `BUOY_CUT_COLOR`, or null. */
  readonly cut: MarkPolyline | null;
  /** The cut's stroke width, in unit-frame units. */
  readonly cutWidth: number;
}

/** The mock's box: 24 units, centred on 12. */
const BOX_HALF = 12;
/** Pure: a mock-box point → the unit frame. */
const u = (x: number, y: number): MarkPoint => [(x - BOX_HALF) / BOX_HALF, (y - BOX_HALF) / BOX_HALF];
/** A mock-box stroke width → the unit frame. */
const uw = (w: number): number => w / BOX_HALF;

/** Points along a circle arc (mock box), `n` steps from `a0` to `a1` (y-down). */
function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, n: number): MarkPoint[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return u(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  });
}

/** Points along a cubic Bézier (mock box), `n` steps, excluding its start. */
function cubicPoints(p0: number[], p1: number[], p2: number[], p3: number[], n: number): MarkPoint[] {
  return Array.from({ length: n }, (_, k) => {
    const t = (k + 1) / n;
    const s = 1 - t;
    const w = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
    return u(w[0] * p0[0] + w[1] * p1[0] + w[2] * p2[0] + w[3] * p3[0], w[0] * p0[1] + w[1] * p1[1] + w[2] * p2[1] + w[3] * p3[1]);
  });
}

/** THE HULL (`a-body`: `M3 21h18 M8 21v-6h8v6 M12 15v-3`) — waterline, can, mast. */
export const BUOY_HULL: readonly MarkPolyline[] = [
  [u(3, 21), u(21, 21)],
  [u(8, 21), u(8, 15), u(16, 15), u(16, 21)],
  [u(12, 15), u(12, 12)],
];

/** RADAR's dish (`M4 10a8 8 0 0 1 16 0z`): the upper half-disc on (12, 10). */
const RADAR_DISH: MarkPolyline = arcPoints(12, 10, 8, Math.PI, 2 * Math.PI, 16);
/** RADAR's mast cut (`M12 10V4`). */
const RADAR_MAST: MarkPolyline = [u(12, 10), u(12, 4)];

/** HEALING's disc: r 5.5 on (12, 7.5). */
const HEAL_DISC: MarkPolyline = arcPoints(12, 7.5, 5.5, 0, 2 * Math.PI, 24).slice(0, -1);
/** HEALING's PULSE cut (`c-heal-pulse`: `M7.5 7.5h2l1-2.5 2 5 1-2.5h3`) — a
 *  flat line with one heartbeat spike. Eric 2026-10-29 ruled out the cross. */
export const HEAL_PULSE: MarkPolyline = [u(7.5, 7.5), u(9.5, 7.5), u(10.5, 5), u(12.5, 10), u(13.5, 7.5), u(16.5, 7.5)];

/** SHIELD's filled heater (`M6 3h12v5c0 3-2.5 4.6-6 5.5C8.5 12.6 6 11 6 8z`). */
const SHIELD_HEATER: MarkPolyline = [
  u(6, 3),
  u(18, 3),
  u(18, 8),
  ...cubicPoints([18, 8], [18, 11], [15.5, 12.6], [12, 13.5], 6),
  ...cubicPoints([12, 13.5], [8.5, 12.6], [6, 11], [6, 8], 6),
];

/** SPEED's filled up-arrow (`M12 2l7 7h-4v4h-6V9H5z`). */
const SPEED_ARROW: MarkPolyline = [u(12, 2), u(19, 9), u(15, 9), u(15, 13), u(9, 13), u(9, 9), u(5, 9)];

/** The colour a head's cut is drawn in: the chart's ground (`void`), so the
 *  cut reads as a line through the head. */
export const BUOY_CUT_COLOR = C.void;

/**
 * THE HEAD TABLE — TOTAL over `BuoyKind`, so a fifth kind fails to compile on
 * every surface rather than draw nothing. Every colour is a CLIENT_CONFIG
 * token (silver / phosphor / info / amber — DESIGN.md's palette).
 */
export const BUOY_HEADS: Readonly<Record<BuoyKind, BuoyHead>> = {
  radar: { fill: RADAR_DISH, color: C.silver, cut: RADAR_MAST, cutWidth: uw(2) },
  healing: { fill: HEAL_DISC, color: C.phosphor, cut: HEAL_PULSE, cutWidth: uw(1.4) },
  shield: { fill: SHIELD_HEATER, color: C.info, cut: null, cutWidth: 0 },
  speed: { fill: SPEED_ARROW, color: C.amber, cut: null, cutWidth: 0 },
};

/** The centre the owner's masthead arcs are drawn about (unit frame) — the
 *  middle of the head band — and the head's reach from it, so the arcs clear
 *  every kind's head. */
export const BUOY_HEAD_CENTER: MarkPoint = u(12, 9);
export const BUOY_HEAD_REACH = uw(8.5);
