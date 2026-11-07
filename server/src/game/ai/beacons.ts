// THE BEACON FARM (Story 10.8, Eric 2026-11-06 "bots sail to and farm
// beacons", epic-10 amendment 6(g); spec R3 / R4 / R9) — the smallest change
// that makes an idle bot earn beacon XP.
//
// WHAT A BOT KNOWS: the public chart only (BotWorldPort.beacons — position,
// phase, rate, exactly what a human's chart shows). A beacon is NOT a contact:
// no track, no target, so no weapon is ever aimed at one and no avoidance term
// sees its body.
//
// WHAT IT DOES: on a deliberation with no target, the NEAREST beacon that is
// charted (about to surface) or still paying, and whose centre lies inside the
// disc the bot would patrol anyway (ai/navigate.ts patrolDisc), becomes the
// bot's goal. It sails (routed) for a STANDOFF point on the bearing from the
// beacon to itself, `CONFIG.bots.beaconStandoffFrac × CONFIG.beacons.rangeU` out — so
// the line it sails never crosses the solid body — and once there (inside
// the paying range by construction) it HOLDS dead in the water like a `hold`.
// A standoff that falls ON LAND is moved to water when it is fixed (the nav
// layer's shore snap, else the first snappable point walking in toward the
// beacon), so the bot stations on water instead of circling an anchor ashore.
// The standoff is re-fixed when the bearing from the beacon to the bot swings
// more than 90° from the one it was fixed on: after a chase round to the far
// side, the straight line to the old point would cross the solid body.
// The goal is released on the next deliberation once the beacon has gone or
// stopped paying, or a target appears (combat postures override exactly as
// before — the contest is emergent and untuned, Story 10.12 tunes it).
//
// Pure functions over plain data: no world import, no rng, no clock read.

import {
  CONFIG,
  beaconInRange,
  cellOf,
  isWater,
  pointOf,
  snapToWater,
  wrapAngle,
  type NavGrid,
  type Vec2,
  type ZoneRing,
} from '@salvo/shared';
import type { BotBeacon, BotBeaconGoal } from './types.js';

/** u — the standoff distance from a beacon's centre: the bot tuning knob
 *  `CONFIG.bots.beaconStandoffFrac` of the paying range. */
export function beaconStandoffU(): number {
  return CONFIG.bots.beaconStandoffFrac * CONFIG.beacons.rangeU;
}

/** Worth sailing for: charted (it will surface and pay) or paying now. */
export function beaconWorthFarming(b: BotBeacon): boolean {
  return b.phase === 'charted' || (b.phase !== 'gone' && b.rate01 > 0);
}

/** The nearest beacon worth farming whose centre lies inside `disc`, or null. */
export function pickBeacon(beacons: readonly BotBeacon[], disc: ZoneRing, pos: Vec2): BotBeacon | null {
  let best: BotBeacon | null = null;
  let bestD = Infinity;
  for (const b of beacons) {
    if (!beaconWorthFarming(b) || Math.hypot(b.x - disc.cx, b.y - disc.cy) > disc.r) continue;
    const d = Math.hypot(b.x - pos.x, b.y - pos.y);
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

/** The standoff point for a beacon at `at` seen from `pos`: on the bearing
 *  from the beacon to the bot, `beaconStandoffU()` out (due +x when the bot
 *  sits exactly on the centre). */
export function standoffPoint(at: Vec2, pos: Vec2): Vec2 {
  const dx = pos.x - at.x;
  const dy = pos.y - at.y;
  const d = Math.hypot(dx, dy);
  const r = beaconStandoffU();
  if (!(d > 0)) return { x: at.x + r, y: at.y };
  return { x: at.x + (dx / d) * r, y: at.y + (dy / d) * r };
}

/** rad — the bearing from a beacon at `at` to `pos` (0 when on the centre,
 *  matching standoffPoint's due +x). */
export function beaconBearingTo(at: Vec2, pos: Vec2): number {
  const dx = pos.x - at.x;
  const dy = pos.y - at.y;
  return dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
}

/** The navigable cell centre the point `p` snaps to (the nav layer's shore
 *  snap) when that centre is still in `at`'s paying range, else null. */
function snappedInRange(grid: NavGrid, at: Vec2, p: Vec2): Vec2 | null {
  const idx = snapToWater(grid, p);
  if (idx < 0) return null;
  const c = pointOf(grid, idx);
  return beaconInRange(at.x, at.y, c.x, c.y) ? c : null;
}

/**
 * The standoff MOVED TO WATER: `raw` itself when it stands on a navigable
 * cell; else the nav layer's shore snap of it; else — a point deep inland,
 * past the snap's reach — the snap of the first point walking in from `raw`
 * toward the beacon one cell at a time (the beacon's own centre is placed
 * clear of land). Every candidate is kept inside the paying range. `raw`
 * unchanged when none snaps (the route layer copes as before).
 */
export function waterStandoff(grid: NavGrid, at: Vec2, raw: Vec2): Vec2 {
  if (isWater(grid, cellOf(grid, raw.x, raw.y))) return raw;
  const d = Math.hypot(raw.x - at.x, raw.y - at.y);
  const steps = Math.floor(d / grid.cellU);
  for (let k = 0; k <= steps; k += 1) {
    const f = d > 0 ? (d - k * grid.cellU) / d : 0;
    const hit = snappedInRange(grid, at, { x: at.x + (raw.x - at.x) * f, y: at.y + (raw.y - at.y) * f });
    if (hit !== null) return hit;
  }
  return raw;
}

/** A goal on beacon `b` fixed from `pos`: its standoff on the bot's bearing,
 *  moved to water when there is a grid. */
function fixGoal(b: Vec2, pos: Vec2, grid: NavGrid | null): BotBeaconGoal {
  const raw = standoffPoint(b, pos);
  return { x: b.x, y: b.y, bearing: beaconBearingTo(b, pos), standoff: grid === null ? raw : waterStandoff(grid, b, raw) };
}

/** Has the bot swung round the beacon more than 90° off the bearing its
 *  standoff was fixed on? */
function swungRound(goal: BotBeaconGoal, pos: Vec2): boolean {
  return Math.abs(wrapAngle(beaconBearingTo(goal, pos) - goal.bearing)) > Math.PI / 2;
}

/**
 * This deliberation's goal: the picked beacon, keeping the standoff point of
 * the previous goal when it is the same beacon (a fixed point keeps the routed
 * path from re-planning as the bot moves) — unless the bot has swung more
 * than 90° round the beacon since it was fixed, when it is re-fixed on the
 * bot's new side. Null = none. `grid` (the map's nav raster) moves a standoff
 * ashore to water; null = none (geometry only).
 */
export function beaconGoalOf(
  beacons: readonly BotBeacon[],
  disc: ZoneRing,
  pos: Vec2,
  prev: BotBeaconGoal | null,
  grid: NavGrid | null = null,
): BotBeaconGoal | null {
  const b = pickBeacon(beacons, disc, pos);
  if (b === null) return null;
  if (prev !== null && prev.x === b.x && prev.y === b.y && !swungRound(prev, pos)) return prev;
  return fixGoal(b, pos, grid);
}

/** Is the bot on station: inside the paying range AND within the standoff
 *  distance of the centre, or at its standoff point (within `slackU` — a
 *  standoff ashore is reached at its snapped anchor)? */
export function onStation(goal: BotBeaconGoal, pos: Vec2, slackU: number): boolean {
  if (!beaconInRange(goal.x, goal.y, pos.x, pos.y)) return false;
  if (Math.hypot(pos.x - goal.x, pos.y - goal.y) <= beaconStandoffU()) return true;
  return Math.hypot(pos.x - goal.standoff.x, pos.y - goal.standoff.y) <= slackU;
}
