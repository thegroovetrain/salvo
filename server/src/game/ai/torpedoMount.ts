// THE TORPEDO LAUNCHERS, AS A BOT USES THEM (Story 10.6 review gate — the
// launchers aim like turrets, R6 / R13 / R16 / R28).
//
// THE CLICK. The bot clicks a torpedo only when the SHARED law says a tube
// fires ON TARGET: its OWN launcher states (`BotSelf.launchers`, exactly the
// `OwnShip.launchers` a human client is sent), copied and stepped one tick
// ahead through the shared `stepLaunchers` the server runs before it picks,
// then the shared `pickTube` — the main battery's `readyOnTarget` pattern
// (ai/battery.ts). Anything else (a launcher still swinging, the bearing in a
// band whose launcher is reloading, no band at all) is NOT a shot: the
// tactic answers null and the tick falls through to the next slot, so the
// main battery is never starved by a torpedo the server would refuse or fire
// off the solved aim.
//
// THE HOLD (the minimal mechanism that still lets a launcher get there). A
// launcher only moves toward the aim the bot WRITES each tick. When the
// torpedo tactic wanted a shot this tick that a loaded launcher whose band
// holds the aim could make once it arrives (`noteTorpedoHold`), the brain
// writes THAT aim instead of the main battery's held aim — but ONLY while the
// battery has no turret loaded by next tick (`batteryLoadedSoon`): a battery
// that can fire keeps its aim and its tick. No new dial, no tuning.
//
// Pure apart from the one mind seat it owns (`torpedoHold`). No `world.js`.

import {
  CONFIG,
  copyLaunchers,
  launcherAimPoint,
  launcherBears,
  pickTube,
  stepLaunchers,
  type LauncherState,
  type Vec2,
} from '@salvo/shared';
import type { BotMind, BotSelf } from './types.js';
import type { BotSituation, BotTrack } from './utility.js';
import { batteryAim } from './battery.js';

/** A torpedo aim as the bot writes it (`InputMsg.aim` / `aimDist`). */
export interface TorpedoAim {
  aim: number;
  aimDist: number;
}

const DT = CONFIG.tick.simDtMs;

/** The launcher aim point the server will read for this aim, or null (no aim). */
function aimPointFor(self: BotSelf, a: TorpedoAim): Vec2 | null {
  return launcherAimPoint(self.state, self.hullId, a.aim, a.aimDist);
}

/** The bot's own launchers after this tick's step toward `p` (a COPY). */
function steppedLaunchers(own: readonly LauncherState[], self: BotSelf, p: Vec2): LauncherState[] {
  const next = copyLaunchers([], own);
  stepLaunchers(next, self.hullId, self.state, p, DT);
  return next;
}

/**
 * Would a tube fire ON TARGET for this aim after this tick's launcher step?
 * One shared step on a COPY of the own launchers, then the shared pick.
 */
export function torpedoReadyOnTarget(self: BotSelf, a: TorpedoAim): boolean {
  const own = self.launchers;
  const p = aimPointFor(self, a);
  if (own === undefined || own.length === 0 || p === null) return false;
  const pick = pickTube(steppedLaunchers(own, self, p), self.hullId, self.state, p);
  return pick.verdict === 'fire' && pick.onTarget;
}

/**
 * Could a launcher make this shot once it has swung onto the aim — one whose
 * FIRING BAND holds the aim point (from its own station) and that has a tube
 * loaded by next tick? The condition for holding the torpedo aim.
 */
export function torpedoCanBear(self: BotSelf, a: TorpedoAim): boolean {
  const own = self.launchers;
  const p = aimPointFor(self, a);
  if (own === undefined || p === null) return false;
  return own.some((st, i) => st.tubes.some((t) => t <= DT) && launcherBears(self.hullId, i, self.state, p));
}

/** Record this tick's wanted-but-not-yet-on-target torpedo aim. */
export function noteTorpedoHold(mind: BotMind, now: number, a: TorpedoAim): void {
  mind.torpedoHold = { aim: a.aim, aimDist: a.aimDist, at: now };
}

/** Does the main battery have a turret loaded by next tick? (No battery → no.) */
function batteryLoadedSoon(self: BotSelf): boolean {
  return (self.turrets ?? []).some((t) => t.reloadMsLeft <= DT);
}

/**
 * THE AIM THE BOT HOLDS ON A NO-SHOT TICK: this tick's torpedo hold while the
 * battery has nothing loaded, else the main battery's held aim (ai/battery.ts),
 * or null when there is neither.
 */
export function heldAimOf(self: BotSelf, mind: BotMind, sit: BotSituation, target: BotTrack): TorpedoAim | null {
  const torp = mind.torpedoHold;
  if (torp !== undefined && torp !== null && torp.at === sit.now && !batteryLoadedSoon(self)) return torp;
  return batteryAim(self, mind, sit, target);
}
