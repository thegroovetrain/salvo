// THE TORPEDO LAUNCHERS, AS A BOT USES THEM (Story 10.6 review gate — the
// launchers aim like turrets, R6 / R13 / R16 / R28; no traverse since Story
// 11.1, R16).
//
// THE CLICK. The bot clicks a torpedo only when the SHARED law says a tube
// FIRES: its OWN launcher states (`BotSelf.launchers`, exactly the
// `OwnShip.launchers` a human client is sent), copied and stepped one tick
// ahead through the shared `stepLaunchers` the server runs before it picks
// (so a tube that finishes reloading this tick counts), then the shared
// `pickTube` — the main battery's `readyOnTarget` pattern (ai/battery.ts).
// Anything else (the bearing in a band whose launcher is reloading, no band
// at all) is NOT a shot: the tactic answers null and the tick falls through
// to the next slot, so the main battery is never starved by a torpedo the
// server would refuse.
//
// THE TORPEDO HOLD (Story 10.6: the battery's held aim swapped for a torpedo
// aim so a launcher could swing onto it — `noteTorpedoHold`,
// `torpedoCanBear`, `heldAimOf`, `BotMind.torpedoHold`) — RETIRED 2026-11-12
// with the traverse (Story 11.1, R16): a launcher that can make the shot
// fires on the tick it is wanted, so there is nothing to hold an aim for.
//
// Pure. No `world.js`.

import {
  CONFIG,
  copyLaunchers,
  launcherAimPoint,
  pickTube,
  stepLaunchers,
  type LauncherState,
  type Vec2,
} from '@salvo/shared';
import type { BotSelf } from './types.js';

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
 * Would a tube FIRE for this aim after this tick's launcher step? One shared
 * step on a COPY of the own launchers, then the shared pick. (The name is kept
 * from the traverse era: a fired tube is always on the aim since Story 11.1.)
 */
export function torpedoReadyOnTarget(self: BotSelf, a: TorpedoAim): boolean {
  const own = self.launchers;
  const p = aimPointFor(self, a);
  if (own === undefined || own.length === 0 || p === null) return false;
  return pickTube(steppedLaunchers(own, self, p), self.hullId, self.state, p).verdict === 'fire';
}
