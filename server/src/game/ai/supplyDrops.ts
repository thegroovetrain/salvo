// THE SUPPLY RUN (Story 12.4, Eric 2026-11-19 "Head for charted drops",
// "Every bot", "Collect what it sees"; epic-12 amendment 5(h)) — the smallest
// change that sends a bot to a charted supply drop and has it clear the
// crates. It replaces the radio-beacon farm (Story 10.8): there is no beacon
// body, no pot and no paying range any more, so the standoff, the
// hold-in-range and the contest-while-paying stayer are gone.
//
// WHAT A BOT KNOWS: the public chart only (BotWorldPort.supplyDrops — each
// charted spot and the moment its crates land, exactly what a human's map
// mark shows). The crates themselves are seen like any crate, through
// `PerceptionView.drops` once they are down — never anything else.
//
// WHAT IT DOES (every bot, with no target):
//   1. PICK. With no goal, the NEAREST charted spot whose crates have not
//      landed yet and whose spot lies inside the disc it would patrol anyway
//      (ai/navigate.ts patrolDisc).
//   2. SAIL (routed) for the spot; arriving before the landing it waits there
//      dead in the water, so the hull is on the spot around `landT`.
//   3. COLLECT. Once landed, it steers for the nearest crate it can SEE or
//      REMEMBERS (below) within `CONFIG.supplyDrops.scatterU` of the spot,
//      one after another; with none it makes for the spot again.
//   4. RELEASE once it is ON the spot and neither sees nor remembers a crate
//      in the circle (then it patrols on), or when the spot leaves the chart
//      or the disc.
//   REMEMBER (Eric 2026-11-19, "Remember if it's not expensive"): while it
//      holds a goal, the crates it has SEEN in the circle (id + position,
//      from its own `PerceptionView.drops` only) stay on its mind — a small
//      bounded array reused in place (noteSupplyCrates). One is forgotten
//      when the bot COULD see its spot — within its nominal eye
//      (`CONFIG.vision.hullSight`, the reach the `drop` row holds a crate to
//      since epic-12 amendment 10: a crate is seen by the hull rule) on a
//      line clear of islands (the public map, `lineBlocked` — Eric
//      2026-11-20) — and it is not sighted (taken — by this bot or another —
//      or eaten). A crate merely hidden behind an island stays remembered.
//      Rain and smoke are not asked: a crate they hide is forgotten and seen
//      again when they clear. And
//      all are forgotten when the goal changes or is released.
//   5. UNREACHABLE (Story 12.4 review fix): a spot on a non-navigable nav
//      cell counts as reached at its snapped anchor (navigate.ts
//      reachedAshoreGoal — `heldAshore`), so the bot waits and clears there;
//      a drop the ROUTER failed on (a failed — empty — route cached toward
//      its spot or a crate in its circle) is released and BARRED from
//      picking for `CONFIG.bots.nav.routeRetryMs`, the router's own retry
//      clock (supplyBarsOf) — never held for the whole cycle.
//
// Pure functions over plain data: no world import, no rng, no clock read.

import { CONFIG, type Island, type Vec2, type ZoneRing } from '@salvo/shared';
import { lineBlocked } from './plot.js';
import type { BotRememberedCrate, BotRoute, BotSupplyBar, BotSupplyDrop } from './types.js';

/** Is `p` within `r` of `c` (rim inclusive)? */
function within(p: Vec2, c: Vec2, r: number): boolean {
  return Math.hypot(p.x - c.x, p.y - c.y) <= r;
}

/** Is `p` inside `disc` (rim inclusive)? */
function inDisc(p: Vec2, disc: ZoneRing): boolean {
  return within(p, { x: disc.cx, y: disc.cy }, disc.r);
}

/** Has this drop's landing not happened yet at `now`? */
export function supplyPending(d: BotSupplyDrop, now: number): boolean {
  return now < d.landT;
}

/** Same chart row (spot and landing)? */
function sameDrop(a: BotSupplyDrop, b: BotSupplyDrop): boolean {
  return a.x === b.x && a.y === b.y && a.landT === b.landT;
}

/** Is `d` barred at `now` (the router failed on it — see supplyBarsOf)? */
function barred(d: BotSupplyDrop, bars: readonly BotSupplyBar[], now: number): boolean {
  return bars.some((b) => now < b.until && sameDrop(b, d));
}

/** The nearest charted drop still to land whose spot is inside `disc` and
 *  that is not barred, or null. */
export function pickSupplyDrop(
  drops: readonly BotSupplyDrop[],
  disc: ZoneRing,
  pos: Vec2,
  now: number,
  bars: readonly BotSupplyBar[] = [],
): BotSupplyDrop | null {
  let best: BotSupplyDrop | null = null;
  let bestD = Infinity;
  for (const d of drops) {
    if (!supplyPending(d, now) || !inDisc(d, disc) || barred(d, bars, now)) continue;
    const dist = Math.hypot(d.x - pos.x, d.y - pos.y);
    if (dist < bestD) {
      best = d;
      bestD = dist;
    }
  }
  return best;
}

/** Is the hull at `pos` on the spot (within `slackU` of it)? */
export function atSupplySpot(goal: Vec2, pos: Vec2, slackU: number): boolean {
  return within(pos, goal, slackU);
}

/** The nearest to `pos` of `list` lying within `scatterU` of `goal` when it
 *  is nearer than `best`; else `best`. */
function nearerIn<T extends Vec2>(goal: Vec2, list: readonly T[], pos: Vec2, scatterU: number, best: T | null): T | null {
  let out = best;
  let outD = best === null ? Infinity : Math.hypot(best.x - pos.x, best.y - pos.y);
  for (const c of list) {
    if (!within(c, goal, scatterU)) continue;
    const dist = Math.hypot(c.x - pos.x, c.y - pos.y);
    if (dist < outD) {
      out = c;
      outD = dist;
    }
  }
  return out;
}

/**
 * The crate to collect next: the nearest to `pos` of the SIGHTED crates
 * (`sighted` — the bot's `PerceptionView.drops`) and the REMEMBERED ones
 * (`remembered` — noteSupplyCrates) lying within `scatterU` of the goal's
 * spot. Null = none in the circle.
 */
export function supplyCrateOf<T extends Vec2>(
  goal: Vec2,
  sighted: readonly T[],
  pos: Vec2,
  scatterU: number = CONFIG.supplyDrops.scatterU,
  remembered: readonly T[] = [],
): T | null {
  return nearerIn(goal, remembered, pos, scatterU, nearerIn(goal, sighted, pos, scatterU, null));
}

/** Is a crate with this id in the sighted list? */
function sightedId(sighted: readonly BotRememberedCrate[], id: string): boolean {
  for (const c of sighted) if (c.id === id) return true;
  return false;
}

/** Drop from `memory` (in place) every crate the eye at `eye` COULD see —
 *  its spot within `eyeU` on a line clear of `islands` — and that is not
 *  sighted: it is gone. */
function forgetGone(memory: BotRememberedCrate[], sighted: readonly BotRememberedCrate[], eye: Vec2, eyeU: number, islands: readonly Island[]): void {
  let keep = 0;
  for (const c of memory) {
    if (!sightedId(sighted, c.id) && within(c, eye, eyeU) && !lineBlocked(eye, c, islands)) continue;
    memory[keep] = c;
    keep += 1;
  }
  memory.length = keep;
}

/**
 * THE MEMORY (Eric 2026-11-19, "Remember if it's not expensive"), updated in
 * place from one view: forget each remembered crate the eye at `eye` could
 * see (within `eyeU`, the line to it clear of `islands` — the public map)
 * that is not in `sighted`, then remember each sighted crate
 * within `scatterU` of `goal`'s spot not yet remembered — at most `cap`
 * entries. `sighted` is the bot's own `PerceptionView.drops`, nothing else.
 */
export function noteSupplyCrates(
  goal: Vec2,
  memory: BotRememberedCrate[],
  sighted: readonly BotRememberedCrate[],
  eye: Vec2,
  islands: readonly Island[] = [],
  eyeU: number = CONFIG.vision.hullSight,
  scatterU: number = CONFIG.supplyDrops.scatterU,
  cap: number = CONFIG.supplyDrops.crates,
): void {
  forgetGone(memory, sighted, eye, eyeU, islands);
  for (const c of sighted) {
    if (memory.length >= cap) return;
    if (!within(c, goal, scatterU) || sightedId(memory, c.id)) continue;
    memory.push({ id: c.id, x: c.x, y: c.y });
  }
}

/** ON the spot: within `slackU` of it, or held at the snapped anchor of a
 *  spot on a non-navigable cell (`heldAshore`). */
function onSpot(goal: BotSupplyDrop, bot: SupplyReading): boolean {
  return atSupplySpot(goal, bot.pos, bot.slackU) || bot.heldAshore?.(goal) === true;
}

/** Done with a LANDED drop: on its spot with no sighted and no remembered
 *  crate left in its circle. */
function cleared(goal: BotSupplyDrop, bot: SupplyReading, scatterU: number): boolean {
  return onSpot(goal, bot) && supplyCrateOf(goal, bot.sighted, bot.pos, scatterU, bot.remembered) === null;
}

/** The previous goal, KEPT: still on the chart, still inside the disc, not
 *  barred, and not yet cleared after its landing. Else null. */
function keptGoal(prev: BotSupplyDrop | null, drops: readonly BotSupplyDrop[], disc: ZoneRing, bot: SupplyReading, scatterU: number): BotSupplyDrop | null {
  if (prev === null || !inDisc(prev, disc) || !drops.some((d) => sameDrop(d, prev))) return null;
  if (barred(prev, bot.bars ?? [], bot.now)) return null;
  return !supplyPending(prev, bot.now) && cleared(prev, bot, scatterU) ? null : prev;
}

/** Has the router FAILED toward `goal`: the cached route is an empty (failed)
 *  one whose goal is the spot or a point in its scatter circle (a crate),
 *  within the router's own re-plan distance? */
export function routeFailedToward(
  route: BotRoute | null | undefined,
  goal: Vec2,
  scatterU: number = CONFIG.supplyDrops.scatterU,
): boolean {
  if (route === null || route === undefined || route.waypoints.length > 0) return false;
  return within(route.goal, goal, scatterU + CONFIG.bots.nav.routeReplanGoalMoveU);
}

/**
 * THE BARS for this deliberation: the bars still in force (unexpired, the
 * drop still on the chart), plus the previous goal when the router failed
 * on it (`bot.routeFailed`) — barred for `retryMs` (the router's own retry
 * clock), after which it may be picked and tried again.
 */
export function supplyBarsOf(
  drops: readonly BotSupplyDrop[],
  bars: readonly BotSupplyBar[],
  prev: BotSupplyDrop | null,
  bot: Pick<SupplyReading, 'now' | 'routeFailed'>,
  retryMs: number = CONFIG.bots.nav.routeRetryMs,
): readonly BotSupplyBar[] {
  const live = bars.filter((b) => bot.now < b.until && drops.some((d) => sameDrop(d, b)));
  if (prev === null || bot.routeFailed?.(prev) !== true || barred(prev, live, bot.now)) return live;
  return [...live, { x: prev.x, y: prev.y, landT: prev.landT, until: bot.now + retryMs }];
}

/** What a deliberation hands supplyGoalOf about the bot. */
export interface SupplyReading {
  readonly pos: Vec2;
  readonly now: number;
  /** The bot's sighted crates (`PerceptionView.drops`). */
  readonly sighted: readonly Vec2[];
  /** The crates remembered in the goal's circle (noteSupplyCrates). Absent
   *  = none. */
  readonly remembered?: readonly Vec2[];
  /** u — how close to the spot counts as ON it. */
  readonly slackU: number;
  /** Is the bot held at the snapped anchor of this spot, the spot lying on a
   *  non-navigable cell (navigate.ts reachedAshoreGoal)? Counts as ON it.
   *  Absent = never. */
  readonly heldAshore?: (spot: Vec2) => boolean;
  /** Has the router failed toward this drop (routeFailedToward on the
   *  mind's cached route)? Absent = never. */
  readonly routeFailed?: (goal: BotSupplyDrop) => boolean;
  /** The bars in force (supplyBarsOf). Absent = none. */
  readonly bars?: readonly BotSupplyBar[];
}

/**
 * This deliberation's goal: the previous one while it is kept (see
 * keptGoal; the same object, so a routed path is not re-planned), else a
 * fresh pickSupplyDrop. The goal is a COPY of the chart row (the port's rows
 * are reused between calls). Null = none.
 */
export function supplyGoalOf(
  drops: readonly BotSupplyDrop[],
  disc: ZoneRing,
  bot: SupplyReading,
  prev: BotSupplyDrop | null,
  scatterU: number = CONFIG.supplyDrops.scatterU,
): BotSupplyDrop | null {
  const kept = keptGoal(prev, drops, disc, bot, scatterU);
  if (kept !== null) return kept;
  const pick = pickSupplyDrop(drops, disc, bot.pos, bot.now, bot.bars ?? []);
  return pick === null ? null : { x: pick.x, y: pick.y, landT: pick.landT };
}

/** Waiting on the spot for the landing: on it (or held at its snapped
 *  anchor — `heldAshore`), crates not down yet. */
export function waitingForSupply(goal: BotSupplyDrop, pos: Vec2, now: number, slackU: number, heldAshore = false): boolean {
  return supplyPending(goal, now) && (heldAshore || atSupplySpot(goal, pos, slackU));
}

/** The point the helm steers for on a supply run: before the landing the
 *  spot; after it the next sighted or remembered crate in the circle, else
 *  the spot. */
export function supplySteerPoint(
  goal: BotSupplyDrop,
  sighted: readonly Vec2[],
  pos: Vec2,
  now: number,
  remembered: readonly Vec2[] = [],
): Vec2 {
  return supplyCrateTarget(goal, sighted, pos, now, remembered) ?? goal;
}

// THE CRATE APPROACH (Story 12.4 orbit fix; orchestrator ruling 2026-11-19,
// Eric's veto): a crate inside the hull's turning circle can never be reached
// by holding the turn — the bot orbits it at full ahead for the whole cycle.
// So on a crate it takes the fastest ahead step whose turning circle leaves
// the crate outside, else the slowest ahead step.

/** The ahead steps of the engine telegraph, fastest first — the very detents
 *  a human's W/S steps through (client/src/input/telegraph.ts `DETENTS`). */
export const AHEAD_STEPS: readonly number[] = [1, 0.75, 0.5, 0.25];

/** The kinematics the turn model reads (shared sim/ship.ts stepShip). */
export interface TurnKinematics {
  readonly maxSpeed: number;
  readonly turnRate: number;
  readonly steerageSpeed: number;
}

/** u — the steady turning radius at throttle `step` under the shared turn
 *  model: speed `step × maxSpeed`, rudder authority `min(1, speed /
 *  steerageSpeed)`, so radius = max(speed, steerageSpeed) / turnRate. */
export function stepTurnRadiusU(kin: TurnKinematics, step: number): number {
  return Math.max(step * kin.maxSpeed, kin.steerageSpeed) / kin.turnRate;
}

/** Is `p` strictly inside either turning circle (port or starboard) of
 *  radius `r` tangent to a hull at `pose` (heading in radians)? */
export function insideTurnCircle(pose: Vec2 & { readonly heading: number }, p: Vec2, r: number): boolean {
  const nx = -Math.sin(pose.heading) * r;
  const ny = Math.cos(pose.heading) * r;
  return Math.hypot(p.x - (pose.x + nx), p.y - (pose.y + ny)) < r || Math.hypot(p.x - (pose.x - nx), p.y - (pose.y - ny)) < r;
}

/** The throttle for steering at a crate at `p`: the fastest AHEAD_STEPS
 *  step whose turning circle leaves it outside, else the slowest. */
export function crateApproachThrottle(pose: Vec2 & { readonly heading: number }, p: Vec2, kin: TurnKinematics): number {
  for (const step of AHEAD_STEPS) {
    if (!insideTurnCircle(pose, p, stepTurnRadiusU(kin, step))) return step;
  }
  return AHEAD_STEPS[AHEAD_STEPS.length - 1];
}

/** The crate a supply run is steering for this tick (after the landing, the
 *  nearest sighted or remembered one in the circle), or null — before the
 *  landing, or none left. */
export function supplyCrateTarget(goal: BotSupplyDrop, sighted: readonly Vec2[], pos: Vec2, now: number, remembered: readonly Vec2[] = []): Vec2 | null {
  if (supplyPending(goal, now)) return null;
  return supplyCrateOf(goal, sighted, pos, CONFIG.supplyDrops.scatterU, remembered);
}
