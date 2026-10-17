// THE NAV HELM (Story 9.13, Eric rulings 2026-10-17, epic-9 amendments 192,
// 200, 202) — the steering MATHS the combat brain composes (ai/tactics.ts
// helmFor keeps the orchestration: priority order, the un-beach machine,
// throttle). Built on the public map through the one-per-map nav cache
// (game/navCache.ts): the generator's 32 u navigability grid and the ring flow
// fields.
//
//   * GRADED MULTI-RAY AVOIDANCE (192(c)) — CONFIG.bots.nav.avoidRays rays
//     fanned ±60° ahead, reach CONFIG.bots.nav.avoidReachTurnRadii own turn
//     radii, walked on the grid; the nearest blocked ray sets the pressure
//     (1 − hit/reach)², the more open side (the goal's side when the two are
//     close) sets the sign — replacing the binary ±0.8 nearest-coast kernel.
//     Shared with the PvE fleet (game/drones.ts imports it).
//   * GOAL STEERING (192(b)) — a straight bearing when the line is clear on
//     the grid, else a routed path (A*, string-pulled) built on the decision
//     cadence and re-planned only when the goal moved
//     CONFIG.bots.nav.routeReplanGoalMoveU.
//   * THE RING (192(a), 200) — ring runs descend the target ring's flow
//     field; the departure rule arms ring escape early; the ring clamp turns
//     to the field when its tangent runs into land.
//   * PATROL (200(3), 202) — seeded waypoints inside the safe disc / the
//     revealed next ring, cover-weighted, routed, re-picked on arrival or
//     after CONFIG.bots.nav.waypointTimeoutMs without progress.
//
// PURE OVER ITS INPUTS: no world import (eslint), no Math.random, no clock
// beyond `port.now`; the only stream is the mind's own seeded `rng`.

import {
  CONFIG,
  NAV_KIND,
  angleDiff,
  bearing,
  cellOf,
  geodesicU,
  hullBumper,
  hullEnvelope,
  isWater,
  lineClear,
  pointOf,
  snapToWater,
  wrapAngle,
  type EffectiveStats,
  type FlowField,
  type HullId,
  type Island,
  type NavGrid,
  type ShipState,
  type Vec2,
  type ZoneRing,
} from '@salvo/shared';
import { navCacheFor, type NavCache } from '../navCache.js';
import type { BotMind, BotPosture, BotSelf, BotWorldPort, BotZonePhase } from './types.js';
import { FOG_COVER_DENSITY } from './cover.js';
import { ringDeadband, type BotSituation } from './utility.js';

/** Proportional gain turning heading error into rudder (the fleet AI's) —
 *  also the gain on the ray kernel's pressure. */
export const RUDDER_GAIN = 2;
/** Rudder magnitude one active point-avoidance term (mine, hull) contributes. */
export const AVOID_STRENGTH = 0.8;
/** u — steer back toward centre once within this of the map boundary. */
const BOUNDARY_MARGIN = 80;
/** u — lookahead for the visible-mine probe: three trigger radii. */
const MINE_LOOKAHEAD = CONFIG.mine.triggerRadius * 3;
/** rad — the half-spread of the avoidance fan (amendment 192(c): ±60°). */
const RAY_SPREAD = Math.PI / 3;
/** Fraction of the reach by which one side must be MORE OPEN than the other
 *  before it beats the goal's side (the anti-flip-flop deadband). */
const OPEN_SIDE_DEADBAND = 0.25;
/** Cells the ring run looks down its flow field (~192 u): a heading that
 *  averages the 8-connected steps instead of a 45° step every cell. */
const FIELD_LOOK_CELLS = 6;
/** Patrol waypoint samples per pick (amendment 202 reading: up to 8). */
const PATROL_SAMPLES = 8;

export function clampUnit(v: number): number {
  if (v < -1) return -1;
  if (v > 1) return 1;
  return v;
}

/** THE HELM COMPOSITION (192(c)): avoidance claims the helm in proportion to
 *  its own pressure — `track · max(0, 1 − |avoid|) + avoid` (the bots'
 *  helmLeft; the fleet uses the same function). */
export function composeRudder(track: number, avoid: number): number {
  const helmLeft = Math.max(0, 1 - Math.abs(avoid));
  return clampUnit(track * helmLeft + avoid);
}

/** The map's nav cache: the port's when it carries one, else the shared
 *  one-per-map cache (a hand-built test port). */
export function navOf(port: Pick<BotWorldPort, 'map' | 'nav'>): NavCache {
  return port.nav ?? navCacheFor(port.map);
}

/** u — a hull's full-ahead turn radius at its rated speed. */
export function turnRadiusU(stats: Pick<EffectiveStats, 'kinematics'>): number {
  return stats.kinematics.maxSpeed / stats.kinematics.turnRate;
}

/** u — the avoidance fan's reach for a hull (amendment 192(c)). */
export function avoidReachU(stats: Pick<EffectiveStats, 'kinematics'>): number {
  return CONFIG.bots.nav.avoidReachTurnRadii * turnRadiusU(stats);
}

// ---------------------------------------------------------------------------
// GRADED MULTI-RAY AVOIDANCE (amendment 192(c))
// ---------------------------------------------------------------------------

/** u along the ray to its first blocking cell, or `reach` when clear. LAND
 *  blocks (outside the hull's own start cell); TIGHT water blocks once the ray
 *  has crossed navigable water (a hull hugging a coast is not blinded by its
 *  own tight band); the map's OUTSIDE is the boundary bias's job. */
export function rayHit(grid: NavGrid, x: number, y: number, angle: number, reach: number): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const step = grid.cellU / 2;
  const start = cellOf(grid, x, y);
  let seenWater = false;
  for (let t = step; t <= reach; t += step) {
    const idx = cellOf(grid, x + dx * t, y + dy * t);
    if (idx < 0) return reach;
    if (idx === start) continue;
    const kind = grid.cells[idx];
    if (kind === NAV_KIND.WATER) seenWater = true;
    else if (kind === NAV_KIND.OUTSIDE) return reach;
    else if (kind === NAV_KIND.LAND || seenWater) return t;
  }
  return reach;
}

/** +1 = port, −1 = starboard: the clearly more open side, else the side the
 *  goal lies on (else port — a fixed sign, never a coin). */
function openSide(openPort: number, openStbd: number, reach: number, heading: number, goal: number): number {
  const diff = openPort - openStbd;
  if (Math.abs(diff) > OPEN_SIDE_DEADBAND * reach) return diff > 0 ? 1 : -1;
  return angleDiff(heading, goal) < 0 ? -1 : 1;
}

/**
 * THE ISLAND TERM: the rudder bias the fan asks for. Pressure = the worst
 * ray's (1 − hit/reach)² × cos(its offset) (a blocked ray abeam matters less
 * than one dead ahead), × RUDDER_GAIN, toward the open side. Zero when every
 * ray is clear. One sign for the whole fan, so a bow-on wall never splits
 * into two cancelling terms.
 */
export function rayAvoidance(grid: NavGrid, x: number, y: number, heading: number, reach: number, goal: number): number {
  const n = Math.max(1, CONFIG.bots.nav.avoidRays);
  let danger = 0;
  let openPort = 0;
  let openStbd = 0;
  for (let i = 0; i < n; i += 1) {
    const off = n === 1 ? 0 : -RAY_SPREAD + (2 * RAY_SPREAD * i) / (n - 1);
    const hit = rayHit(grid, x, y, heading + off, reach);
    const w = (1 - hit / reach) ** 2 * Math.cos(off);
    if (w > danger) danger = w;
    if (off > 1e-9) openPort += hit;
    else if (off < -1e-9) openStbd += hit;
  }
  if (danger <= 0) return 0;
  return clampUnit(openSide(openPort, openStbd, reach, heading, goal) * danger * RUDDER_GAIN);
}

/** The island term for a bot hull (its own reach, the bearing it wants). */
export function avoidIslands(self: BotSelf, grid: NavGrid, want: number): number {
  const { x, y, heading } = self.state;
  return rayAvoidance(grid, x, y, heading, avoidReachU(self.stats), want);
}

/**
 * The point kernel: a rudder bias away from ONE hazard point ahead within
 * `lookahead` (a mine, a hull). cross(heading, toHazard) > 0 = to port, so
 * steer starboard. Hazards astern contribute nothing.
 */
export function pointBias(hx: number, hy: number, x: number, y: number, fx: number, fy: number, lookahead: number): number {
  const dx = hx - x;
  const dy = hy - y;
  if (Math.hypot(dx, dy) > lookahead) return 0;
  if (dx * fx + dy * fy <= 0) return 0; // astern
  return fx * dy - fy * dx > 0 ? -AVOID_STRENGTH : AVOID_STRENGTH;
}

/** Summed bias away from every mine the bot CAN SEE (its own are skipped —
 *  an owner never trips its own rack). The view carries the detect gate. */
export function avoidMines(self: BotSelf, mind: BotMind): number {
  if (mind.view === null) return 0;
  const { x, y, heading } = self.state;
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  let bias = 0;
  for (const m of mind.view.mines) {
    if (m.own) continue;
    bias += pointBias(m.x, m.y, x, y, fx, fy, MINE_LOOKAHEAD);
  }
  return bias;
}

/** HULL AVOIDANCE (Story 9.5, amendment 26): every LIVE contact within
 *  CONFIG.bots.hullLookaheadU; the bot's own target only inside the bumper,
 *  and not at all under `ram`. */
export function avoidHulls(self: BotSelf, mind: BotMind, posture: BotPosture): number {
  const { x, y, heading } = self.state;
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  let bias = 0;
  for (const [key, t] of mind.contacts) {
    if (!t.live) continue;
    const isTarget = key === mind.targetKey;
    if (isTarget && posture === 'ram') continue;
    const reach = isTarget ? hullBumper(self.hullId, t.cls) : CONFIG.bots.hullLookaheadU;
    bias += pointBias(t.x, t.y, x, y, fx, fy, reach);
  }
  return bias;
}

/** Near the map edge, steer back toward the middle. */
export function boundaryBias(pos: ShipState, radius: number): number {
  if (Math.hypot(pos.x, pos.y) < radius - BOUNDARY_MARGIN) return 0;
  return clampUnit(angleDiff(pos.heading, bearing(pos, { x: 0, y: 0 }))) * AVOID_STRENGTH;
}

// ---------------------------------------------------------------------------
// GOAL STEERING — straight when clear, routed when blocked (amendment 192(b))
// ---------------------------------------------------------------------------

/** What route steering reads about the bot this tick. */
export interface NavCtx {
  pos: Vec2;
  mind: BotMind;
  nav: NavCache;
  now: number;
  /** u — own hull length: a waypoint within it is reached. */
  hullU: number;
  /** A decision-cadence tick: the only ticks that may build a route. */
  deliberate: boolean;
}

/** u — a hull's own length (the waypoint pop radius). */
export function hullLengthU(hullId: HullId): number {
  return hullEnvelope(hullId).hull.length;
}

/** Does the cached route still serve `goal` (it has not moved past the
 *  re-plan distance)? */
function routeServes(route: BotMind['route'], goal: Vec2): boolean {
  if (route === null || route === undefined) return false;
  return Math.hypot(route.goal.x - goal.x, route.goal.y - goal.y) <= CONFIG.bots.nav.routeReplanGoalMoveU;
}

/** Drop reached waypoints (never the last — the goal's own anchor) and, on a
 *  deliberation, take the shortcut when the one after is already in view. */
function advanceRoute(ctx: NavCtx, wps: Vec2[]): void {
  while (wps.length > 1 && Math.hypot(wps[0].x - ctx.pos.x, wps[0].y - ctx.pos.y) <= ctx.hullU) wps.shift();
  if (ctx.deliberate && wps.length > 1 && lineClear(ctx.nav.grid, ctx.pos, wps[1])) wps.shift();
}

/** The live route toward `goal`: kept while it serves the goal, re-built on
 *  a deliberation otherwise. A failed search is cached as an EMPTY route, so
 *  it is not retried until the goal moves. */
function routeFor(ctx: NavCtx, goal: Vec2): Vec2[] {
  const mind = ctx.mind;
  if (!routeServes(mind.route, goal)) {
    if (!ctx.deliberate) return [];
    mind.route = { goal: { x: goal.x, y: goal.y }, waypoints: ctx.nav.routeTo(ctx.pos, goal) ?? [], builtAt: ctx.now };
  }
  const wps = mind.route?.waypoints ?? [];
  advanceRoute(ctx, wps);
  return wps;
}

/** The bearing toward `goal`: direct when the grid line is clear (the
 *  route is dropped), else the next routed waypoint; with no route yet (or
 *  none to be had) the direct bearing, avoidance doing the rest. */
export function steerToward(ctx: NavCtx, goal: Vec2): number {
  if (lineClear(ctx.nav.grid, ctx.pos, goal)) {
    ctx.mind.route = null;
    return bearing(ctx.pos, goal);
  }
  const wps = routeFor(ctx, goal);
  return bearing(ctx.pos, wps.length > 0 ? wps[0] : goal);
}

// ---------------------------------------------------------------------------
// THE RING (amendments 192(a), 200)
// ---------------------------------------------------------------------------

/** The ring a ring run is FOR: the revealed next ring while there is one
 *  (the close converges on it), else the live ring. */
export function ringGoalOf(port: Pick<BotWorldPort, 'zoneLiveRing' | 'zoneNextRing'>): ZoneRing {
  return port.zoneNextRing() ?? port.zoneLiveRing;
}

/**
 * The field's heading at (x, y): from the hull's own cell centre to the cell
 * FIELD_LOOK_CELLS down the field — centre to centre, so a hull's sub-cell
 * offset never wobbles the heading (open water reads exactly straight). A
 * hull standing off navigable water heads for its snapped cell first. Null
 * at a goal or where the field cannot reach.
 */
export function fieldBearing(field: FlowField, grid: NavGrid, x: number, y: number): number | null {
  const start = snapToWater(grid, { x, y });
  if (start < 0 || !(field.dist[start] < Infinity)) return null;
  if (cellOf(grid, x, y) !== start) return bearing({ x, y }, pointOf(grid, start));
  let idx = start;
  for (let k = 0; k < FIELD_LOOK_CELLS; k += 1) {
    const nx = field.next[idx];
    if (nx < 0) break;
    idx = nx;
  }
  return idx === start ? null : bearing(pointOf(grid, start), pointOf(grid, idx));
}

/** THE RING RUN: down the target ring's flow field (around the land), or
 *  straight at its centre where the field has nothing to say. */
export function ringRunBearing(pos: Vec2, nav: NavCache, ring: ZoneRing): number {
  return fieldBearing(nav.fieldFor(ring), nav.grid, pos.x, pos.y) ?? bearing(pos, { x: ring.cx, y: ring.cy });
}

/** ms until the storm rim reaches `pos` (null = no close is coming). Before
 *  the close begins: the time to its start (conservative); while closing:
 *  the live rim's gap to the bot over its closing speed. */
export function stormArrivalMs(pos: Vec2, live: ZoneRing, next: ZoneRing, zone: BotZonePhase): number | null {
  const ms = zone.closesInMs;
  if (ms === null) return null;
  if (zone.phase !== 'closing') return ms;
  const shrink = live.r - next.r;
  if (!(shrink > 0) || !(ms > 0)) return ms;
  const gap = live.r - Math.hypot(pos.x - live.cx, pos.y - live.cy);
  return Math.max(0, gap) / (shrink / ms);
}

/**
 * THE DEPARTURE RULE (amendment 200(1)): a bot outside the revealed next ring
 * (by its escape deadband) leaves when the water route to that ring's safe
 * set — the flow field's geodesic length over own rated speed — plus
 * CONFIG.bots.ringLeaveMarginMs reaches the storm's arrival. An unreachable
 * field reading falls back to the straight gap to the rim.
 */
export function departureDue(
  sit: Pick<BotSituation, 'x' | 'y' | 'stats' | 'speed'>,
  port: Pick<BotWorldPort, 'zoneLiveRing' | 'zoneNextRing' | 'zonePhase'>,
  nav: NavCache,
): boolean {
  const next = port.zoneNextRing();
  if (next === null || !(next.r > 0)) return false;
  const dNext = Math.hypot(sit.x - next.cx, sit.y - next.cy);
  if (dNext <= next.r - ringDeadband(sit.stats, sit.speed)) return false;
  const arrival = stormArrivalMs(sit, port.zoneLiveRing, next, port.zonePhase());
  if (arrival === null) return false;
  const geo = geodesicU(nav.fieldFor(next), nav.grid, sit.x, sit.y);
  const runU = geo < Infinity ? geo : Math.max(0, dNext - next.r);
  return (runU / sit.stats.kinematics.maxSpeed) * 1000 + CONFIG.bots.ringLeaveMarginMs >= arrival;
}

/** u — how far ahead a bearing is judged against the ring: the hull's 180°
 *  reversal run at the greater of rated and live speed (the boost is not in
 *  EffectiveStats). See ringClamped. */
function ringLookaheadU(stats: EffectiveStats, speed: number): number {
  return (Math.max(stats.kinematics.maxSpeed, Math.abs(speed)) * Math.PI) / stats.kinematics.turnRate;
}

/** The disc-projection clamp (the storm-chatter fix): rotate `want` to the
 *  edge of the legal cone when its reversal run would end outside the live
 *  ring's deadband; the bearing itself when unconstrained. */
function coneClamped(pos: ShipState, sit: BotSituation, want: number, lookahead: number): number {
  const ring = sit.ring;
  const ux = pos.x - ring.cx;
  const uy = pos.y - ring.cy;
  const d = Math.hypot(ux, uy);
  if (!(ring.r > 0) || d < 1e-6) return want;
  const safe = Math.max(0, ring.r - ringDeadband(sit.stats, pos.speed));
  const cosMax = (safe * safe - d * d - lookahead * lookahead) / (2 * lookahead * d);
  if (cosMax >= 1) return want;
  const out = Math.atan2(uy, ux);
  if (cosMax <= -1) return wrapAngle(out + Math.PI);
  const off = angleDiff(out, want);
  const limit = Math.acos(cosMax);
  if (Math.abs(off) >= limit) return want;
  return wrapAngle(out + (off >= 0 ? limit : -limit));
}

/**
 * THE RING AS A CONSTRAINT ON A CHOSEN HEADING — LAND-AWARE (amendment 192):
 * the cone clamp of the storm-chatter fix (a heading whose reversal run would
 * end outside the ring is rotated to the cone's edge), and when the clamped
 * heading's run is NOT clear water on the grid, the ring's flow-field
 * direction instead — the rim tangent no longer drives a bot into a headland.
 * Unconstrained bearings pass through untouched (no segment test).
 */
export function ringClamped(pos: ShipState, sit: BotSituation, want: number, nav: NavCache, ring: ZoneRing): number {
  const lookahead = ringLookaheadU(sit.stats, pos.speed);
  const clamped = coneClamped(pos, sit, want, lookahead);
  if (clamped === want) return want;
  const end = { x: pos.x + Math.cos(clamped) * lookahead, y: pos.y + Math.sin(clamped) * lookahead };
  return lineClear(nav.grid, pos, end) ? clamped : ringRunBearing(pos, nav, ring);
}

// ---------------------------------------------------------------------------
// POSTURE GEOMETRY
// ---------------------------------------------------------------------------

/** BAND HOLDING: close outside the band, open inside its floor, hold a
 *  beam-on orbit inside it (kiting-style; amendment 198's bands). */
export function bandOrbit(pos: ShipState, aim: Vec2, band: { min: number; max: number }): number {
  const brg = bearing(pos, aim);
  const d = Math.hypot(aim.x - pos.x, aim.y - pos.y);
  if (d > band.max) return brg;
  if (d < band.min) return wrapAngle(brg + Math.PI);
  const side = angleDiff(brg, pos.heading) >= 0 ? 1 : -1;
  return wrapAngle(brg + (Math.PI / 2) * side);
}

/** KITE (amendments 193/194): hold the plot at CONFIG.bots.kiteHoldFrac × own reach —
 *  open when it closes inside, close when it opens past own reach. */
export function kiteBearing(pos: ShipState, aim: Vec2, reachU: number): number {
  return bandOrbit(pos, aim, { min: CONFIG.bots.kiteHoldFrac * reachU, max: reachU });
}

// ---------------------------------------------------------------------------
// PATROL (amendments 200(3), 202)
// ---------------------------------------------------------------------------

/** The disc an idle bot patrols: the revealed next ring, else the
 *  always-safe disc — shrunk by own escape deadband and held on the map. */
export function patrolDisc(port: BotWorldPort, sit: Pick<BotSituation, 'stats' | 'speed'>): ZoneRing {
  const base = port.zoneNextRing() ?? port.zoneSafeDisc();
  const band = ringDeadband(sit.stats, sit.speed);
  const r = Math.min(Math.max(0, base.r - band), Math.max(0, port.map.radius - band));
  return { cx: base.cx, cy: base.cy, r };
}

/** Cover-ish water (amendment 202): solid fog, or within one island radius
 *  of an island's coast (its centre within two radii). */
function coverish(p: Vec2, islands: readonly Island[], fogAt: BotMind['fogAt']): boolean {
  if (fogAt !== undefined && fogAt(p.x, p.y) >= FOG_COVER_DENSITY) return true;
  for (const isle of islands) {
    if (Math.hypot(p.x - isle.x, p.y - isle.y) <= 2 * isle.r) return true;
  }
  return false;
}

/** A fresh patrol waypoint: up to PATROL_SAMPLES uniform draws off the
 *  mind's seeded rng inside the disc, land cells rejected, the first
 *  cover-ish one taken, else the last water one, else the disc's centre. */
export function pickPatrolWaypoint(mind: BotMind, grid: NavGrid, disc: ZoneRing, islands: readonly Island[]): Vec2 {
  let last: Vec2 | null = null;
  for (let i = 0; i < PATROL_SAMPLES; i += 1) {
    const a = mind.rng.float(0, Math.PI * 2);
    const r = Math.sqrt(mind.rng.next()) * disc.r;
    const p = { x: disc.cx + Math.cos(a) * r, y: disc.cy + Math.sin(a) * r };
    if (!isWater(grid, cellOf(grid, p.x, p.y))) continue;
    if (coverish(p, islands, mind.fogAt)) return p;
    last = p;
  }
  return last ?? { x: disc.cx, y: disc.cy };
}

/** Is the waypoint spent: gone, outside the disc, reached, or stalled for
 *  waypointTimeoutMs (the progress clock is advanced here)? */
function patrolSpent(ctx: NavCtx, disc: ZoneRing, reachU: number): boolean {
  const mind = ctx.mind;
  const wp = mind.patrolWaypoint;
  if (wp === null || wp === undefined) return true;
  if (Math.hypot(wp.x - disc.cx, wp.y - disc.cy) > Math.max(disc.r, ctx.hullU)) return true;
  const d = Math.hypot(wp.x - ctx.pos.x, wp.y - ctx.pos.y);
  if (d <= reachU) return true;
  if (d <= (mind.patrolBestU ?? Infinity) - ctx.hullU) {
    mind.patrolBestU = d;
    mind.patrolProgressAt = ctx.now;
  }
  return ctx.now - (mind.patrolProgressAt ?? ctx.now) > CONFIG.bots.nav.waypointTimeoutMs;
}

/** THE ROUTED PATROL: steer (routed) for the current waypoint, re-picking it
 *  on a deliberation once spent. */
export function patrolBearing(ctx: NavCtx, port: BotWorldPort, sit: BotSituation, reachU: number): number {
  const disc = patrolDisc(port, sit);
  if (ctx.deliberate && patrolSpent(ctx, disc, reachU)) {
    ctx.mind.patrolWaypoint = pickPatrolWaypoint(ctx.mind, ctx.nav.grid, disc, sit.islands);
    ctx.mind.patrolBestU = Infinity;
    ctx.mind.patrolProgressAt = ctx.now;
  }
  return steerToward(ctx, ctx.mind.patrolWaypoint ?? { x: disc.cx, y: disc.cy });
}
