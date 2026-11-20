// THE STRATEGIC-ZOOM CHART MARKS (Story 11.8, Eric 2026-11-15: "Supreme
// Commander-esque Strategic Zoom"). Zoomed far out, hulls, mines and crates
// shrink to specks; three screen-size marks keep them legible:
//
//   • CORNER BRACKETS (render/brackets.ts) — four corner ticks framing the own
//     hull and every in-sight hull at EVERY zoom (Story 12.3; until then only
//     while the hull drew under 24 px), growing with the hull zoomed in.
//     The true-size hull always still draws inside. Never on radar paints.
//   • CHART ICONS (render/mines.ts, render/drops.ts) — a mine, airdrop or
//     salvage wreck draws ITS OWN look at a fixed 10 px while its true drawing
//     would be smaller (the chart handover), cross-fading
//     with the true-size drawing. Own-mine range rings are untouched.
//   • SPLASH PEGS (render/pegs.ts) — an X where each own shell ended.
//
// Every mark is SCREEN px at any zoom: drawn in px units and given a
// `1 / zoom` scale inside its camera-transformed layer. The icons and pegs are
// drawn once; a bracket re-strokes only when its snapped size changes. This file holds the pure handover math and the once-a-frame
// driver main.ts calls after the hulls have their poses.

import { CLIENT_CONFIG } from '../config.js';
import type { ShipView } from './ships.js';
import type { HullBrackets } from './brackets.js';
import type { SplashPegs } from './pegs.js';

const M = CLIENT_CONFIG.chartMarks;

/**
 * Pure: the fade across a band of `bandFrac × thresholdPx` centered on the
 * threshold — 1 at or below its low edge, 0 at or above its high edge, linear
 * between. A zero band is a hard step (1 below the threshold, 0 at or above).
 * Non-finite sizes read as "not drawn small" (0).
 */
export function bandAlpha(px: number, thresholdPx: number, bandFrac: number): number {
  if (!Number.isFinite(px)) return 0;
  const half = (thresholdPx * bandFrac) / 2;
  if (!(half > 0)) return px < thresholdPx ? 1 : 0;
  const v = (thresholdPx + half - px) / (2 * half);
  return Math.min(1, Math.max(0, v));
}

/** Pure: the chart icon's share of the cross-fade for a thing whose true
 *  drawing is `truePx` across (the true drawing wears `1 −` this). */
export function chartIconAlpha(truePx: number): number {
  return bandAlpha(truePx, M.iconPx, M.bandFrac);
}

/** Pure: the local scale that makes a mark drawn in px units hold its screen
 *  size inside a layer scaled by `zoom` px per u (1 for a degenerate zoom). */
export function screenScale(zoom: number): number {
  return Number.isFinite(zoom) && zoom > 0 ? 1 / zoom : 1;
}

/** What `renderChartMarks` reads off the game — the slice, so a harness can
 *  hand in just these. */
export interface ChartMarkParts {
  brackets: HullBrackets;
  pegs: SplashPegs;
  mines: { renderIcons(zoom: number): void };
  drops: { renderIcons(zoom: number): void };
  ownView: ShipView;
  contactViews: { shipViews(): Iterable<ShipView> };
}

/**
 * Once per render frame, AFTER every hull has this frame's pose and look
 * (the own view in renderAlive / renderSpectate, the contacts in
 * `ContactViews.render`): brackets on the hulls, icons on the mines and
 * crates, and the pegs aged to `nowMs` (the server clock the pegs were
 * stamped with).
 */
export function renderChartMarks(p: ChartMarkParts, zoom: number, nowMs: number): void {
  p.brackets.render(p.ownView, p.contactViews.shipViews(), zoom);
  p.mines.renderIcons(zoom);
  p.drops.renderIcons(zoom);
  p.pegs.render(nowMs, zoom);
}
