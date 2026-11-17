// THE OWN BATTERY'S PER-TICK DRIVERS (Story 10.4) — the two pure-ish calls
// main.ts's sim tick makes on sim/ownBattery.ts, kept out of main.ts so the
// predict half of predict-and-correct is unit-testable on its own.
//
// Order is the server's (contract section 4): the hull steps, then the turrets
// reload and snap to THIS input's aim (`stepOwnBattery`), then fire
// control picks a turret (`predictBatteryClick`).

import { CONFIG, batteryAimPoint, type AimPose, type InputMsg } from '@salvo/shared';
import type { OwnBattery } from './ownBattery.js';

/**
 * THE TWO QUESTIONS the own battery's tick asks (review gate C1), kept apart:
 *  - `afloat`: do the turret ANGLES follow the aim? Only while afloat — a
 *    sinking hull or a wreck holds its angles (reloads still count down), as
 *    the server's `stepTurrets` row does.
 *  - `weaponsLive`: would the server run the secondaries on the real `sec`
 *    level? Hull afloat OR sinking, AND the weapons lock not holding (the
 *    server's `activationRefusal`); otherwise the stream steps as released.
 */
export interface OwnBatteryGate {
  readonly afloat: boolean;
  readonly weaponsLive: boolean;
}

/**
 * One predicted tick of the own battery from the input just sent: the turrets
 * snap to the aim only while `gate.afloat` (and there is a pose), else
 * hold; the secondaries step on `input.sec` only while `gate.weaponsLive`.
 */
export function stepOwnBattery(
  battery: OwnBattery,
  pose: AimPose | null,
  input: Pick<InputMsg, 'aim' | 'aimDist' | 'sec'>,
  gate: OwnBatteryGate,
): number {
  const dt = CONFIG.tick.simDtMs;
  const sec = gate.weaponsLive && input.sec;
  if (pose === null || !gate.afloat) return battery.hold(sec, dt);
  return battery.step(pose, input.aim, input.aimDist, sec, dt);
}

/**
 * Pure: would a MAIN BATTERY click on this aim fire against the predicted
 * turrets? Exactly when the shared pick names a turret (arc-only fire, Eric
 * 2026-11-05, epic-10 amendment 10): a READY turret whose arc holds the aim
 * point. No pose, or no aim (`batteryAimPoint` null — the server denies a
 * click with no aim) → false. The one read both the reticle's "loaded" and
 * the click prediction make, so the two cannot disagree with the server.
 */
export function batteryWouldFire(
  battery: Pick<OwnBattery, 'pick'>,
  pose: AimPose | null,
  aim: number,
  aimDist: number,
): boolean {
  if (pose === null) return false;
  const aimPoint = batteryAimPoint(pose, aim, aimDist);
  return aimPoint !== null && battery.pick(pose, aimPoint) !== null;
}

/**
 * Pure: the predicted verdict for a MAIN BATTERY click: `loaded` iff the
 * shared pick would fire a turret (`batteryWouldFire`). A click whose aim no
 * ready turret bears reads as not loaded — the server's `cooling` denial, since
 * every bearing is inside some turret's arc and the bearing ones are
 * reloading. It is NEVER out of arc as a weapon: the battery's arc is full.
 */
export function batteryClickPrediction(
  battery: Pick<OwnBattery, 'pick'>,
  alive: boolean,
  pose: AimPose | null,
  aim: number,
  aimDist: number,
): { alive: boolean; loaded: boolean; inArc: boolean } {
  return { alive, loaded: batteryWouldFire(battery, pose, aim, aimDist), inArc: true };
}

/**
 * A main-battery click the client predicts will fire: run the shared pick
 * against the predicted turrets and start the picked turret's reload locally,
 * tagged with `seq` — the input that carries the click (OwnBattery.correct
 * keeps the reload through frames older than it). Returns the picked turret
 * index, or null when no ready turret bears (the `cooling` denial), there is no aim,
 * or there is no pose.
 */
export function predictBatteryClick(
  battery: OwnBattery,
  pose: AimPose | null,
  aim: number,
  aimDist: number,
  reloadMs: number,
  seq: number,
): number | null {
  if (pose === null) return null;
  const aimPoint = batteryAimPoint(pose, aim, aimDist);
  if (aimPoint === null) return null;
  const pick = battery.pick(pose, aimPoint);
  if (pick === null) return null;
  battery.fire(pick.index, reloadMs, seq);
  return pick.index;
}
