// THE OWN BATTERY'S PER-TICK DRIVERS (Story 10.4) — the two pure-ish calls
// main.ts's sim tick makes on sim/ownBattery.ts, kept out of main.ts so the
// predict half of predict-and-correct is unit-testable on its own.
//
// Order is the server's (contract section 4): the hull steps, then the turrets
// traverse + reload toward THIS input's aim (`stepOwnBattery`), then fire
// control picks a turret (`predictBatteryClick`).

import { CONFIG, batteryAimPoint, type AimPose, type InputMsg } from '@salvo/shared';
import type { OwnBattery } from './ownBattery.js';

/** Any pose — only `batteryAimPoint`'s null-ness is read off it. */
const ORIGIN: AimPose = { x: 0, y: 0, heading: 0 };

/**
 * THE TWO QUESTIONS the own battery's tick asks (review gate C1), kept apart:
 *  - `afloat`: do the turret ANGLES chase the aim? Only while afloat — a
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
 * traverse toward the aim only while `gate.afloat` (and there is a pose), else
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
 * Pure: the predicted verdict for a MAIN BATTERY click (R4): it fires whenever
 * ANY predicted turret is ready (`loaded`) and the input carries an aim
 * (`batteryAimPoint` not null — the server denies a click with no aim), and it
 * is NEVER out of arc: the battery's arc is full.
 */
export function batteryClickPrediction(
  battery: Pick<OwnBattery, 'anyReady'>,
  alive: boolean,
  aim: number,
  aimDist: number,
): { alive: boolean; loaded: boolean; inArc: boolean } {
  const aimed = batteryAimPoint(ORIGIN, aim, aimDist) !== null;
  return { alive, loaded: aimed && battery.anyReady(), inArc: true };
}

/**
 * A main-battery click the client predicts will fire: run the shared R4 pick
 * against the predicted turrets and start the picked turret's reload locally,
 * tagged with `seq` — the input that carries the click (OwnBattery.correct
 * keeps the reload through frames older than it). Returns the picked turret
 * index, or null when none is ready (the `cooling` denial), there is no aim,
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
