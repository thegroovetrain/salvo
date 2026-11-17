// THE BEACON FARM (Story 10.8, Eric 2026-11-06 "bots sail to and farm
// beacons", epic-10 amendment 6(g); spec R3 / R4 / R9) — the smallest change
// that makes an idle bot earn beacon XP.
//
// WHAT A BOT KNOWS: the public chart only (BotWorldPort.beacons — position,
// phase, rate, exactly what a human's chart shows). A beacon is NOT a contact:
// no track, no target, so no weapon is ever aimed at one and no avoidance term
// sees its body.
//
// WHAT IT DOES: every deliberation, the NEAREST beacon that is charted (about
// to surface) or still paying, and that has a FARMING POINT — a point at the
// standoff distance from its centre — inside the disc the bot would patrol
// anyway (ai/navigate.ts patrolDisc), becomes the bot's goal (Story 10.12:
// judged by a reachable farming point, not by the centre). It sails (routed)
// for a STANDOFF point on the bearing from the beacon to itself,
// `CONFIG.bots.beaconStandoffFrac × CONFIG.beacons.rangeU` out — so the line it
// sails never crosses the solid body — or, when that bot-side point lies
// outside the disc, on the bearing from the beacon to the disc's centre (the
// farming point deepest inside it); once there (inside the paying range by
// construction) it HOLDS dead in the water like a `hold`.
// A standoff that falls ON LAND is moved to water when it is fixed (the nav
// layer's shore snap, else the first snappable point walking in toward the
// beacon), so the bot stations on water instead of circling an anchor ashore.
// The standoff is re-fixed when the bearing it WOULD be fixed on now (the
// bot's side, or the disc-centre side) swings more than 90° from the one it
// was fixed on — after a chase round to the far side, the straight line to
// the old point would cross the solid body — or when the old standoff has
// left the disc (a revealed ring shrank it).
// The goal is released on the next deliberation once the beacon has gone,
// stopped paying, or has no farming point left inside the disc (the reveal:
// the disc becomes the revealed next ring). Whether a TARGET pulls the bot
// off it is the profile's `contestsBeacon` (Story 10.12, R4 — ai/posture.ts).
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

/** Does some FARMING POINT of a beacon at `at` — a point at the standoff
 *  distance from its centre — lie inside `disc`? The standoff circle meets
 *  the disc exactly when the centres' distance d satisfies |d − s| ≤ r. */
export function farmableIn(at: Vec2, disc: ZoneRing): boolean {
  const d = Math.hypot(at.x - disc.cx, at.y - disc.cy);
  return Math.abs(d - beaconStandoffU()) <= disc.r;
}

/** Is `p` inside `disc` (rim inclusive)? */
function inDisc(p: Vec2, disc: ZoneRing): boolean {
  return Math.hypot(p.x - disc.cx, p.y - disc.cy) <= disc.r;
}

/** The beacons worth farming with a farming point inside `disc`, nearest
 *  first. */
function candidates(beacons: readonly BotBeacon[], disc: ZoneRing, pos: Vec2): BotBeacon[] {
  const dist = (b: BotBeacon): number => Math.hypot(b.x - pos.x, b.y - pos.y);
  return beacons.filter((b) => beaconWorthFarming(b) && farmableIn(b, disc)).sort((a, b) => dist(a) - dist(b));
}

/** The nearest beacon worth farming with a farming point inside `disc`, or
 *  null. */
export function pickBeacon(beacons: readonly BotBeacon[], disc: ZoneRing, pos: Vec2): BotBeacon | null {
  return candidates(beacons, disc, pos)[0] ?? null;
}

/** Is the beacon paying now (afloat or sinking with a rate above 0)? */
export function beaconPaying(b: BotBeacon): boolean {
  return b.phase !== 'gone' && b.phase !== 'charted' && b.rate01 > 0;
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

/** The point a goal's standoff is fixed TOWARD: the bot itself when its
 *  side's standoff lies inside `disc`, else the disc's centre (the bearing
 *  whose farming point lies deepest inside it — inside whenever the beacon
 *  is farmableIn the disc). */
export function standoffSide(b: Vec2, pos: Vec2, disc: ZoneRing): Vec2 {
  return inDisc(standoffPoint(b, pos), disc) ? pos : { x: disc.cx, y: disc.cy };
}

/** A goal on beacon `b` fixed from `pos`: its standoff on the bearing of
 *  standoffSide, moved to water when there is a grid. NULL when the standoff
 *  that comes out (after the water move) is not inside `disc` — the bot would
 *  park outside the water it patrols (Story 10.12 review gate). */
function fixGoal(b: BotBeacon, pos: Vec2, disc: ZoneRing, grid: NavGrid | null): BotBeaconGoal | null {
  const centerSide = !inDisc(standoffPoint(b, pos), disc); // standoffSide's own test
  const toward = centerSide ? { x: disc.cx, y: disc.cy } : pos;
  const raw = standoffPoint(b, toward);
  const standoff = grid === null ? raw : waterStandoff(grid, b, raw);
  if (!inDisc(standoff, disc)) return null;
  return { x: b.x, y: b.y, bearing: beaconBearingTo(b, toward), standoff, centerSide, paying: beaconPaying(b) };
}

/** Must a kept goal be re-fixed: its stored (water-moved) standoff has left
 *  the disc, the standoff on its fixed bearing (before the water move) has,
 *  or the bearing it would be fixed on now has swung more than 90° off the
 *  one it was fixed on? */
function needsRefix(goal: BotBeaconGoal, pos: Vec2, disc: ZoneRing): boolean {
  const r = beaconStandoffU();
  if (!inDisc(goal.standoff, disc)) return true;
  if (!inDisc({ x: goal.x + Math.cos(goal.bearing) * r, y: goal.y + Math.sin(goal.bearing) * r }, disc)) return true;
  const now = beaconBearingTo(goal, standoffSide(goal, pos, disc));
  return Math.abs(wrapAngle(now - goal.bearing)) > Math.PI / 2;
}

/** The previous goal KEPT for beacon `b` (same beacon, no re-fix due), its
 *  `paying` re-read off the chart (a copy only when it changed, so a kept
 *  goal keeps its identity — and its standoff — while nothing moved); else
 *  null. */
function keptGoal(prev: BotBeaconGoal | null, b: BotBeacon, pos: Vec2, disc: ZoneRing): BotBeaconGoal | null {
  if (prev === null || prev.x !== b.x || prev.y !== b.y || needsRefix(prev, pos, disc)) return null;
  const paying = beaconPaying(b);
  return prev.paying === paying ? prev : { ...prev, paying };
}

/**
 * This deliberation's goal: the nearest eligible beacon, keeping the standoff
 * point of the previous goal when it is the same beacon (a fixed point keeps
 * the routed path from re-planning as the bot moves) — unless needsRefix (the
 * side it would be fixed on has swung more than 90°, or the old standoff left
 * the disc), when it is re-fixed. A beacon whose fixed standoff lands outside
 * the disc (fixGoal null) yields no goal, and the next-nearest eligible beacon
 * is tried. `paying` is re-read every call. Null = none. `grid` (the map's nav
 * raster) moves a standoff ashore to water; null = none (geometry only).
 */
export function beaconGoalOf(
  beacons: readonly BotBeacon[],
  disc: ZoneRing,
  pos: Vec2,
  prev: BotBeaconGoal | null,
  grid: NavGrid | null = null,
): BotBeaconGoal | null {
  for (const b of candidates(beacons, disc, pos)) {
    const goal = keptGoal(prev, b, pos, disc) ?? fixGoal(b, pos, disc, grid);
    if (goal !== null) return goal;
  }
  return null;
}

/** Is the bot on station: inside the paying range AND at its standoff point
 *  (within `slackU` — a standoff ashore is reached at its snapped anchor), or,
 *  for a BOT-SIDE goal only, anywhere within the standoff distance of the
 *  centre. A disc-centre-side goal was fixed there because the bot's side lies
 *  outside the patrol disc, so only its standoff point counts. */
export function onStation(goal: BotBeaconGoal, pos: Vec2, slackU: number): boolean {
  if (!beaconInRange(goal.x, goal.y, pos.x, pos.y)) return false;
  if (!goal.centerSide && Math.hypot(pos.x - goal.x, pos.y - goal.y) <= beaconStandoffU()) return true;
  return Math.hypot(pos.x - goal.standoff.x, pos.y - goal.standoff.y) <= slackU;
}
