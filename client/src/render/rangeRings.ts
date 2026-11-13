// THE RADAR DISPLAY'S PURE RULES (Story 11.2, Eric 2026-11-12, rulings R10 /
// R16 / R19) — the range-ring spacing that FOLLOWS ZOOM in round hectometers,
// the ring set out to the radar reach, and where the compass (bearing) scale
// sits. Ported from the APPROVED reach bench (client/scripts/reachBench/
// model.ts `RING_SERIES_HM` / `ringSpacingHm`, scope.ts) — the bench keeps its
// own copy because the page must not pull the client bundle. Pure, no Pixi.

import { hmToU, uToHm } from '@salvo/shared';

/** The "nice" hectometer steps a range-ring spacing may take (data, not logic). */
export const RING_SERIES_HM: readonly number[] = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];
/** The bench's aim: this many rings reaching the screen's long half-axis. */
export const RINGS_TARGET = 5;

/**
 * Range-ring spacing (hm) that FOLLOWS ZOOM: the series step that puts the
 * number of rings reaching `halfLongHm` (the screen's long half-axis, in hm)
 * closest to `RINGS_TARGET`; a tie takes the wider step. A non-finite or
 * non-positive input takes the widest step (fail toward fewer rings).
 */
export function ringSpacingHm(halfLongHm: number): number {
  if (!(halfLongHm > 0) || !Number.isFinite(halfLongHm)) return RING_SERIES_HM[RING_SERIES_HM.length - 1];
  let best = RING_SERIES_HM[0];
  let bestErr = Infinity;
  for (const step of RING_SERIES_HM) {
    const err = Math.abs(Math.floor(halfLongHm / step) - RINGS_TARGET);
    if (err <= bestErr) {
      best = step;
      bestErr = err;
    }
  }
  return best;
}

/** The ring spacing (hm) for a viewport of `viewW` × `viewH` px at `zoom` px/u. */
export function viewRingSpacingHm(viewW: number, viewH: number, zoom: number): number {
  return ringSpacingHm(uToHm(Math.max(viewW, viewH) / 2 / zoom));
}

/**
 * How many range rings to draw: every multiple of the spacing STRICTLY inside
 * the radar reach (the reach itself is its own, distinct ring), and none past
 * `farU` — the farthest screen corner from the own ship, so rings that cannot
 * reach the screen are never built. 0 on any unusable input.
 */
export function ringCount(stepHm: number, radarU: number, farU: number): number {
  const stepU = hmToU(stepHm);
  if (!(stepU > 0) || !(radarU > 0) || !Number.isFinite(stepU + radarU)) return 0;
  const insideRadar = Math.ceil(radarU / stepU) - 1;
  const onScreen = Number.isFinite(farU) ? Math.ceil(Math.max(0, farU) / stepU) : insideRadar;
  return Math.max(0, Math.min(insideRadar, onScreen));
}

/** u — the farthest screen corner from a screen point (px), at `zoom` px/u. */
export function farCornerU(sx: number, sy: number, viewW: number, viewH: number, zoom: number): number {
  const dx = Math.max(Math.abs(sx), Math.abs(viewW - sx));
  const dy = Math.max(Math.abs(sy), Math.abs(viewH - sy));
  return Math.hypot(dx, dy) / zoom;
}

/** Where the compass scale sits this frame, in screen px about the own ship. */
export interface CompassPlacement {
  /** 'ring' — on the radar-reach ring; 'bezel' — inset at the screen edge. */
  mode: 'ring' | 'bezel';
  /** px — the scale's radius about the own ship. */
  radiusPx: number;
}

/** px — the bezel scale's inset from the nearest screen edge (the bench's). */
export const BEZEL_INSET_PX = 3;
/** px — the bezel radius moves in steps of this, so a hull drifting on screen
 *  does not rebuild the scale every frame. */
export const BEZEL_STEP_PX = 8;
/** px — the smallest bezel drawn (a hull pressed against the screen edge). */
export const BEZEL_MIN_PX = 48;

/**
 * Pure: where the compass (bearing) scale sits. ON THE RADAR-REACH RING when
 * that whole ring is on screen about the own ship at (`sx`, `sy`); otherwise
 * INSET AT THE SCREEN EDGE like a real display's bezel scale — a circle about
 * the own ship (so every bearing reads true from the hull) as large as the
 * nearest screen edge allows, less the inset, stepped by `BEZEL_STEP_PX` and
 * floored at `BEZEL_MIN_PX`. [reading: Story 11.2 — the bezel is centered on
 * the own ship, not the screen, because a bearing scale is about the observer]
 */
export function compassPlacement(sx: number, sy: number, viewW: number, viewH: number, radarPx: number): CompassPlacement {
  const edge = Math.min(sx, viewW - sx, sy, viewH - sy);
  if (radarPx > 0 && radarPx <= edge) return { mode: 'ring', radiusPx: radarPx };
  const stepped = Math.floor((edge - BEZEL_INSET_PX) / BEZEL_STEP_PX) * BEZEL_STEP_PX;
  return { mode: 'bezel', radiusPx: Math.max(BEZEL_MIN_PX, stepped) };
}

/** The compass ticks: every 5°, LONG every 10°, a numeral every 30° (the bench's). */
export interface CompassTick {
  /** Bearing, whole degrees clockwise from north. */
  deg: number;
  long: boolean;
  /** The numeral, three digits (`000`, `030` …), or null. */
  label: string | null;
}

/** Pure: the 72 ticks of one turn, from north clockwise. */
export function compassTicks(): CompassTick[] {
  const out: CompassTick[] = [];
  for (let d = 0; d < 360; d += 5) {
    out.push({ deg: d, long: d % 10 === 0, label: d % 30 === 0 ? String(d).padStart(3, '0') : null });
  }
  return out;
}

/** Compass bearing (rad, clockwise from north) → screen / world angle (rad
 *  from +x, y down — world north is up on screen, as the chart is drawn). */
export function bearingToAngle(bearingRad: number): number {
  return bearingRad - Math.PI / 2;
}
