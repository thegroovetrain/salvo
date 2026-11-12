// THE MAIN BATTERY AND THE SECONDARIES, AS A BOT USES THEM (Story 10.4 —
// "functional" only; tuning is Story 10.12).
//
// MAIN BATTERY. The bot aims with its existing lead solver (tacticKit
// `leadPoint` at the main-battery shell speed) plus the competence scatter —
// but the scatter offset is HELD (`BotMind.batteryScatter`) rather than
// re-drawn every tick, because the aim it writes into `InputMsg.aim` /
// `aimDist` every tick IS the point every turret chases at a finite traverse
// rate: a per-tick jitter would keep the turrets forever just off it. The
// offset is re-drawn after each click, and whenever the target changes
// (`BotMind.batteryScatterKey`). The bot CLICKS only when a turret is
// READY AND ON TARGET for the aim it is holding — read off its OWN turret
// states (`BotSelf.turrets`, exactly the `OwnShip.turrets` a human client is
// sent), stepped one tick ahead through the SHARED `stepTurrets` the server
// runs before it picks (so a turret tracking a turning hull still reads on
// target), then the shared `pickTurret`. A target in reach that no ready
// turret can bear (the blind sector) keeps the aim and never clicks. The
// reach is the row's folded `rangeU` with the cannon's lit lift; the
// coastline gate is the cannon's.
//
// SECONDARIES. Held (`InputMsg.sec`) while the bot has a LIVE hull target
// inside `stats.secondaryRangeU`, with a burst discipline: released once heat
// reaches CONFIG.bots.secReleaseHeat, not pressed again until it has cooled to
// CONFIG.bots.secRepressHeat (or a lock has cleared). They fire along the same aim.
//
// THE NEXT-TICK POSE (Story 10.12). The server steps the hull BEFORE it steps
// the turrets and picks one (STEP_ORDER: stepShips ... stepTurrets,
// fireControl), and it resolves the input's aim / aimDist from the hull
// centre AS IT STANDS THEN. So the on-target check reads the pose the brain
// predicted for this tick (`BotMind.nextPose`, ai/tactics.ts decide) — for the
// aim point, the turret step and the pick alike — and falls back to the
// current pose when there is none.
//
// THE MINE SWEEP (Story 10.12). The secondaries are the only captain weapon
// that hurts a mine, and only where a round LANDS: on the mine's marker. A
// mine shot to 0 hp DETONATES, and its blast hurts every non-owner hull inside
// it — the sweeper included — so a mine is SWEEPABLE only from outside its
// blast: hostile, inside the secondaries' reach with a clear line, and at
// least the STAND-OFF from the hull centre (`sweepStandOffU`: the kind's blast
// radius + half the hull's length + one tick of travel at the rated max
// speed). It is swept — the aim goes on its centre and the secondaries are
// held under the same burst discipline — when the bot has no target inside
// main-battery reach (the nearest sweepable mine, any bearing), or, with one,
// when the mine lies IN THE WAY: ahead of the beam and inside a lane the
// stand-off wide either side of the hull's heading line. A bot hiding,
// holding in wait or breaking off never sweeps (the stream would give it
// away). While sweeping the aim is the mine's, so the main battery does not
// click (`BotMind.sweep`); any other weapon the brain picks that tick keeps
// the tick and the sweep waits.
//
// Pure apart from the mind seats it owns (`batteryScatter`, `secResting`,
// `sweep`) and the scatter draws off the mind's rng. No `world.js`.

import {
  CATALOG,
  CONFIG,
  SHIP_CLASS_IDS,
  effectiveStats,
  hullEnvelope,
  batteryAimPoint,
  bearing,
  copyTurrets,
  pickTurret,
  stepTurrets,
  type AimPose,
  type MineKind,
  type Vec2,
} from '@salvo/shared';
import type { BotMind, BotPosture, BotSelf } from './types.js';
import { ownReachU, type BotSituation, type BotTrack } from './utility.js';
import { reachOf } from './doctrine.js';
import { hullLengthU } from './navigate.js';
import { distTo, leadPoint, scatterOffset, shotReaches, stamped, type EquipmentTactic, type Shot, type TacticContext } from './tacticKit.js';

/** The bot's held aim for the main battery: bearing + distance from the hull
 *  centre to the led, scattered point. */
export interface BatteryAim {
  aim: number;
  aimDist: number;
  /** The world point the aim names (= aimPointOf(self.state, aim, aimDist)). */
  point: Vec2;
}

/** The held scatter offset, drawn on first use (range-scaled at the draw) and
 *  KEYED to the target it was drawn for (gate S4): a different target key —
 *  the bot switched before clicking — redraws, so one target's range-scaled
 *  offset never lands on another. The same target draws nothing. */
function heldScatter(mind: BotMind, range: number): Vec2 {
  const key = mind.targetKey;
  const held = mind.batteryScatter;
  if (held !== undefined && held !== null && mind.batteryScatterKey === key) return held;
  const drawn = scatterOffset(range, mind.rng);
  mind.batteryScatter = drawn;
  mind.batteryScatterKey = key;
  return drawn;
}

/** Does this hull carry a battery at all (a self-read)? */
function hasBattery(self: BotSelf): boolean {
  return self.turrets !== undefined && self.turrets.length > 0;
}

/** The main battery's held aim at `t`, or null when the hull has no battery. */
export function batteryAim(self: BotSelf, mind: BotMind, sit: BotSituation, t: BotTrack): BatteryAim | null {
  if (!hasBattery(self)) return null;
  const lead = leadPoint(sit, t, CONFIG.mainBattery.shellSpeed);
  const off = heldScatter(mind, Math.hypot(lead.x - sit.x, lead.y - sit.y));
  const point = { x: lead.x + off.x, y: lead.y + off.y };
  return { aim: bearing(self.state, point), aimDist: Math.hypot(point.x - sit.x, point.y - sit.y), point };
}

/** The pose the server's turret step and pick will read this tick: the
 *  brain's prediction when it was made THIS tick, else the current pose. */
export function turretPoseOf(self: BotSelf, mind: BotMind, now: number): AimPose {
  const next = mind.nextPose;
  return next !== undefined && next !== null && next.at === now ? next : self.state;
}

/** Would a turret be READY and ON TARGET for `aim` after this tick's turret
 *  step? One shared step on a COPY of the own turrets, then the shared pick —
 *  aim point, step and pick all against `pose`, the pose the server will read
 *  them from (`turretPoseOf`; the current pose when the caller has none). */
export function readyOnTarget(self: BotSelf, aim: BatteryAim, pose: AimPose = self.state): boolean {
  const own = self.turrets;
  if (own === undefined || own.length === 0) return false;
  const p = batteryAimPoint(pose, aim.aim, aim.aimDist);
  if (p === null) return false; // no aim (gate S2): the server would refuse the click
  const next = copyTurrets([], own);
  stepTurrets(next, self.hullId, pose, p, CONFIG.tick.simDtMs);
  return pickTurret(next, self.hullId, pose, p)?.onTarget === true;
}

/** The main battery's shot: a click on the held aim when it is legal (reach,
 *  coastline) and a ready turret is on it; else null (the brain keeps writing
 *  the held aim regardless — tactics.ts triggerOf). */
function batterySolve(ctx: TacticContext): Shot | null {
  const t = ctx.target;
  if (t === null || sweepingNow(ctx.mind, ctx.sit.now)) return null; // the aim is the mine's this tick
  const a = batteryAim(ctx.self, ctx.mind, ctx.sit, t);
  if (a === null) return null;
  const reach = reachOf(ctx, 'mainBattery');
  if (a.aimDist > reach.maxU && !reach.litExempt(a.point)) return null;
  if (!shotReaches(ctx.self, ctx.sit, a.point)) return null;
  if (!readyOnTarget(ctx.self, a, turretPoseOf(ctx.self, ctx.mind, ctx.sit.now))) return null;
  ctx.mind.batteryScatter = null; // a fresh scatter for the next salvo
  return stamped(ctx, 'mainBattery', { aim: a.aim, aimDist: a.aimDist, slot: ctx.slot });
}

/** THE MAIN BATTERY's weapon row. Same no-persistence want as the cannon
 *  (blip shooting is a ruled skill); every legality question is in solve. */
export const mainBatteryTactic: EquipmentTactic = {
  id: 'mainBattery',
  kind: 'shot',
  reachU: (stats) => stats.equipment.mainBattery.rangeU,
  want: (ctx) => ctx.target !== null,
  solve: batterySolve,
};

/** Is the target a live hull inside the secondaries' reach? */
export function secTarget(sit: BotSituation, t: BotTrack | null): boolean {
  return t !== null && t.live && distTo(sit, t) <= sit.stats.secondaryRangeU;
}

/**
 * THE BURST DISCIPLINE, one step: may the secondaries be held this tick? A
 * resting bot waits for heat ≤ CONFIG.bots.secRepressHeat with the lock
 * cleared; a firing bot rests once heat ≥ CONFIG.bots.secReleaseHeat. No
 * secondaries (absent `sec`) → false. Writes `mind.secResting`: call it ONCE
 * a tick.
 */
export function secondariesReady(self: BotSelf, mind: BotMind): boolean {
  const sec = self.sec;
  if (sec === undefined) return false;
  if (mind.secResting === true) {
    if (sec.locked || sec.heat > CONFIG.bots.secRepressHeat) return false;
    mind.secResting = false;
  }
  if (sec.locked || sec.heat >= CONFIG.bots.secReleaseHeat) {
    mind.secResting = true;
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// THE MINE SWEEP (Story 10.12)
// ---------------------------------------------------------------------------

/** A sighted mine as the sweep reads it (the view's `MineView` fields it
 *  needs; `c` is the kind, absent from an older frame). */
export interface SweepMine {
  readonly x: number;
  readonly y: number;
  readonly own: boolean;
  readonly c?: MineKind;
}

/** u — a mine line's blast radius at the TOP of its ladder: the shared fold
 *  over every copy the line's cap allows. A bot cannot see another captain's
 *  tier (cards are private) and a tiered blast is wider than the CONFIG base,
 *  so the stand-off assumes the widest blast that mine could carry. */
function topTierBlastU(line: 'navalMines' | 'captiveMines' | 'foulingMines'): number {
  const copies = new Array<string>(CATALOG[line].cap).fill(line);
  return effectiveStats(hullEnvelope(SHIP_CLASS_IDS[0]), copies).equipment[line].blastRadius;
}

/** u — each kind's WIDEST possible blast radius (topTierBlastU; the server
 *  detonates with the layer's folded stats); an unknown kind reads the
 *  largest. */
const BLAST_BY_KIND: Readonly<Record<MineKind, number>> = Object.freeze({
  naval: topTierBlastU('navalMines'),
  captive: topTierBlastU('captiveMines'),
  fouling: topTierBlastU('foulingMines'),
});
const BLAST_UNKNOWN = Math.max(...Object.values(BLAST_BY_KIND));

/** u — THE SWEEP STAND-OFF for a mine of kind `kind`: its blast radius, plus
 *  half the hull's length (the blast reaches the silhouette, not the centre),
 *  plus one tick of travel at the rated max speed (the hull moves before the
 *  round lands). A hull centre at least this far from the mine is outside
 *  its blast. */
export function sweepStandOffU(self: BotSelf, sit: BotSituation, kind: MineKind | undefined): number {
  const blast = kind === undefined ? BLAST_UNKNOWN : BLAST_BY_KIND[kind];
  const travel = (sit.stats.kinematics.maxSpeed * CONFIG.tick.simDtMs) / 1000;
  return blast + hullLengthU(self.hullId) / 2 + travel;
}

/** Is the target's plot inside own main-battery reach (no target → no)? */
export function targetInBatteryReach(sit: BotSituation, t: BotTrack | null): boolean {
  return t !== null && distTo(sit, t) <= ownReachU(sit);
}

/** May this mine be swept at all: hostile, its centre inside the
 *  secondaries' reach of the hull centre and OUTSIDE the stand-off (the
 *  sweeper clear of its blast), the line to it clear of land? */
function sweepable(self: BotSelf, sit: BotSituation, m: SweepMine, standOff: number): boolean {
  if (m.own) return false;
  const d = Math.hypot(m.x - sit.x, m.y - sit.y);
  if (d > sit.stats.secondaryRangeU || d < standOff) return false;
  return shotReaches(self, sit, m);
}

/** Is the mine IN THE WAY: ahead of the beam (within ±90° of the bow) and
 *  inside the lane `halfWidth` either side of the hull's heading line? */
export function inSweepLane(self: BotSelf, m: Vec2, halfWidth: number): boolean {
  const { x, y, heading } = self.state;
  const dx = m.x - x;
  const dy = m.y - y;
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  if (dx * fx + dy * fy < 0) return false;
  return Math.abs(dx * fy - dy * fx) <= halfWidth;
}

/** Does this mine qualify for the pick: sweepable, and — with a target in
 *  battery reach — in the way? */
function sweepCandidate(self: BotSelf, sit: BotSituation, m: SweepMine, targetInReach: boolean): boolean {
  const standOff = sweepStandOffU(self, sit, m.c);
  if (!sweepable(self, sit, m, standOff)) return false;
  return !targetInReach || inSweepLane(self, m, standOff);
}

/**
 * THE SWEEP PICK: the nearest sweepable mine (hostile, inside the
 * secondaries' reach, outside its own blast stand-off, a clear line) — any
 * such mine while the bot has no target inside main-battery reach
 * (`targetInReach` false), only one IN THE WAY (ahead, inside the stand-off
 * lane — `inSweepLane`) while it has. Null = nothing to sweep. Pure.
 */
export function sweepPick<M extends SweepMine>(self: BotSelf, sit: BotSituation, mines: readonly M[], targetInReach: boolean): M | null {
  let best: M | null = null;
  let bestD = Infinity;
  for (const m of mines) {
    if (!sweepCandidate(self, sit, m, targetInReach)) continue;
    const d = Math.hypot(m.x - sit.x, m.y - sit.y);
    if (d < bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

/** Is the sweep holding the aim on this decision tick? */
export function sweepingNow(mind: BotMind, now: number): boolean {
  const s = mind.sweep;
  return s !== undefined && s !== null && s.at === now;
}

/** This tick's secondaries plan: whether the burst discipline lets them
 *  fire, and the mine they sweep (null = none). */
export interface SecondariesPlan {
  readonly ready: boolean;
  readonly sweep: Vec2 | null;
}

/** The postures that never sweep: a bot hiding, lying in wait or breaking
 *  off keeps quiet — a sweep's stream would give it away. */
const QUIET_POSTURES: readonly BotPosture[] = ['hold', 'hide', 'disengage'];

/**
 * PLAN THE SECONDARIES for this tick — the burst discipline (stepped here,
 * once) and the sweep pick. A resting or locked battery sweeps nothing (the
 * aim stays the main battery's), nor does a bot in a QUIET posture. A pick is
 * stamped on `mind.sweep` so the main battery holds its click this tick; no
 * pick clears the seat.
 */
export function planSecondaries(self: BotSelf, mind: BotMind, sit: BotSituation, t: BotTrack | null, posture: BotPosture): SecondariesPlan {
  const ready = secondariesReady(self, mind);
  const mines = ready && !QUIET_POSTURES.includes(posture) ? mind.view?.mines ?? [] : [];
  const mine = mines.length === 0 ? null : sweepPick(self, sit, mines, targetInBatteryReach(sit, t));
  mind.sweep = mine === null ? null : { x: mine.x, y: mine.y, at: sit.now };
  return { ready, sweep: mine === null ? null : { x: mine.x, y: mine.y } };
}
