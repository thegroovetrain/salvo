// THE LANE NUDGE (Story 10.9 "Airdrops", epic-10 amendment 16; spec
// Boundaries "Bots", orchestrator ruling W4-1) — bots take a drop on their
// line, nothing more (Story 10.12 tunes the appetite).
//
// WHAT A BOT KNOWS: `PerceptionView.drops` — the SIGHTED crates only (human
// parity; a crate's radar blip is never plotted, ai/plot.ts
// `isCrateSizedPaint`). No port widening.
//
// WHAT IT DOES: in the non-combat bearings only (idle / patrol / beacon farm
// in transit — ai/tactics.ts `postureBearing`), the nearest sighted crate
// lying AHEAD along the bearing the bot already wants, within
// `CONFIG.bots.dropAheadU` along that line and `CONFIG.bots.dropLaneU` either
// side of it, becomes this tick's waypoint. No posture, no goal state: the
// crate stays in the lane as the bot closes on it (its along / lateral
// offsets shrink together), and once it is collected or out of sight the
// bearing falls back to the goal's. A bot stationed on a beacon never leaves
// station for a crate.
//
// Pure functions over plain data: no world import, no rng, no clock read.

import { CONFIG, type DropView } from '@salvo/shared';

/** The lane dials (`CONFIG.bots` by default — a test may pass its own). */
export interface DropLaneCfg {
  /** u — how far ahead along the goal bearing a crate may lie. */
  dropAheadU: number;
  /** u — how far either side of the goal line a crate may lie. */
  dropLaneU: number;
}

/**
 * The nearest sighted crate in the bot's lane: its offset from `self`
 * projected on `goalBearing` lies in (0, `dropAheadU`] and its perpendicular
 * offset is within `dropLaneU`. Null = none.
 */
export function laneDrop(
  self: { x: number; y: number; heading?: number },
  goalBearing: number,
  drops: readonly DropView[],
  cfg: DropLaneCfg = CONFIG.bots,
): DropView | null {
  const ux = Math.cos(goalBearing);
  const uy = Math.sin(goalBearing);
  let best: DropView | null = null;
  let bestD = Infinity;
  for (const d of drops) {
    const dx = d.x - self.x;
    const dy = d.y - self.y;
    const along = dx * ux + dy * uy;
    if (!(along > 0) || along > cfg.dropAheadU || Math.abs(dx * uy - dy * ux) > cfg.dropLaneU) continue;
    const dist = Math.hypot(dx, dy);
    if (dist < bestD) {
      best = d;
      bestD = dist;
    }
  }
  return best;
}
