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
// Pure apart from the two mind seats it owns (`batteryScatter`,
// `secResting`) and the scatter draws off the mind's rng. No `world.js`.

import {
  CONFIG,
  batteryAimPoint,
  bearing,
  copyTurrets,
  pickTurret,
  stepTurrets,
  type Vec2,
} from '@salvo/shared';
import type { BotMind, BotSelf } from './types.js';
import type { BotSituation, BotTrack } from './utility.js';
import { reachOf } from './doctrine.js';
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

/** Would a turret be READY and ON TARGET for `aim` after this tick's turret
 *  step? One shared step on a COPY of the own turrets, then the shared pick. */
export function readyOnTarget(self: BotSelf, aim: BatteryAim): boolean {
  const own = self.turrets;
  if (own === undefined || own.length === 0) return false;
  const p = batteryAimPoint(self.state, aim.aim, aim.aimDist);
  if (p === null) return false; // no aim (gate S2): the server would refuse the click
  const next = copyTurrets([], own);
  stepTurrets(next, self.hullId, self.state, p, CONFIG.tick.simDtMs);
  return pickTurret(next, self.hullId, self.state, p)?.onTarget === true;
}

/** The main battery's shot: a click on the held aim when it is legal (reach,
 *  coastline) and a ready turret is on it; else null (the brain keeps writing
 *  the held aim regardless — tactics.ts triggerOf). */
function batterySolve(ctx: TacticContext): Shot | null {
  const t = ctx.target;
  if (t === null) return null;
  const a = batteryAim(ctx.self, ctx.mind, ctx.sit, t);
  if (a === null) return null;
  const reach = reachOf(ctx, 'mainBattery');
  if (a.aimDist > reach.maxU && !reach.litExempt(a.point)) return null;
  if (!shotReaches(ctx.self, ctx.sit, a.point)) return null;
  if (!readyOnTarget(ctx.self, a)) return null;
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
function secTarget(sit: BotSituation, t: BotTrack | null): boolean {
  return t !== null && t.live && distTo(sit, t) <= sit.stats.secondaryRangeU;
}

/**
 * The secondaries level this tick, with the burst discipline: a resting bot
 * waits for heat ≤ CONFIG.bots.secRepressHeat with the lock cleared; a firing bot rests
 * once heat ≥ CONFIG.bots.secReleaseHeat. No secondaries (absent `sec`) → false.
 */
export function secondariesHeld(self: BotSelf, mind: BotMind, sit: BotSituation, t: BotTrack | null): boolean {
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
  return secTarget(sit, t);
}
