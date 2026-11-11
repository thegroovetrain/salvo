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
// sighted HOSTILE mine inside the secondaries' reach with a clear line is
// swept — the aim goes on its centre and the secondaries are held under the
// same burst discipline — when the bot has no target inside main-battery
// reach, or when the mine is one the helm is already steering round
// (navigate.ts `minePressing`). While sweeping the aim is the mine's, so the
// main battery does not click (`BotMind.sweep`); any other weapon the brain
// picks that tick keeps the tick and the sweep waits.
//
// Pure apart from the mind seats it owns (`batteryScatter`, `secResting`,
// `sweep`) and the scatter draws off the mind's rng. No `world.js`.

import {
  CONFIG,
  batteryAimPoint,
  bearing,
  copyTurrets,
  pickTurret,
  stepTurrets,
  type AimPose,
  type Vec2,
} from '@salvo/shared';
import type { BotMind, BotSelf } from './types.js';
import { ownReachU, type BotSituation, type BotTrack } from './utility.js';
import { reachOf } from './doctrine.js';
import { minePressing } from './navigate.js';
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

/** The secondaries level this tick ON A HULL TARGET: the burst discipline
 *  AND a live hull inside their reach. */
export function secondariesHeld(self: BotSelf, mind: BotMind, sit: BotSituation, t: BotTrack | null): boolean {
  return secondariesReady(self, mind) && secTarget(sit, t);
}

// ---------------------------------------------------------------------------
// THE MINE SWEEP (Story 10.12)
// ---------------------------------------------------------------------------

/** A sighted mine as the sweep reads it (the view's `MineView` fields it needs). */
export interface SweepMine {
  readonly x: number;
  readonly y: number;
  readonly own: boolean;
}

/** Is the target's plot inside own main-battery reach (no target → no)? */
export function targetInBatteryReach(sit: BotSituation, t: BotTrack | null): boolean {
  return t !== null && distTo(sit, t) <= ownReachU(sit);
}

/** May this mine be swept at all: hostile, its centre inside the
 *  secondaries' reach of the hull centre, the line to it clear of land? */
function sweepable(self: BotSelf, sit: BotSituation, m: SweepMine): boolean {
  if (m.own) return false;
  if (Math.hypot(m.x - sit.x, m.y - sit.y) > sit.stats.secondaryRangeU) return false;
  return shotReaches(self, sit, m);
}

/**
 * THE SWEEP PICK: the nearest sighted HOSTILE mine inside the secondaries'
 * reach with a clear line — any such mine while the bot has no target inside
 * main-battery reach (`targetInReach` false), only one PRESSING THE HELM
 * (the helm's own mine lookahead, navigate.ts `minePressing`) while it has.
 * Null = nothing to sweep. Pure.
 */
export function sweepPick<M extends SweepMine>(self: BotSelf, sit: BotSituation, mines: readonly M[], targetInReach: boolean): M | null {
  let best: M | null = null;
  let bestD = Infinity;
  for (const m of mines) {
    if (!sweepable(self, sit, m)) continue;
    if (targetInReach && !minePressing(self.state, m)) continue;
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

/**
 * PLAN THE SECONDARIES for this tick — the burst discipline (stepped here,
 * once) and the sweep pick. A resting or locked battery sweeps nothing (the
 * aim stays the main battery's). A pick is stamped on `mind.sweep` so the
 * main battery holds its click this tick; no pick clears the seat.
 */
export function planSecondaries(self: BotSelf, mind: BotMind, sit: BotSituation, t: BotTrack | null): SecondariesPlan {
  const ready = secondariesReady(self, mind);
  const mines = ready ? mind.view?.mines ?? [] : [];
  const mine = mines.length === 0 ? null : sweepPick(self, sit, mines, targetInBatteryReach(sit, t));
  mind.sweep = mine === null ? null : { x: mine.x, y: mine.y, at: sit.now };
  return { ready, sweep: mine === null ? null : { x: mine.x, y: mine.y } };
}
