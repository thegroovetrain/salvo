// THE OWN BATTERY'S PER-TICK DRIVERS (Story 10.4) — the two pure-ish calls
// main.ts's sim tick makes on sim/ownBattery.ts, kept out of main.ts so the
// predict half of predict-and-correct is unit-testable on its own.
//
// Order is the server's (contract section 4): the hull steps, then the turrets
// traverse + reload toward THIS input's aim (`stepOwnBattery`), then fire
// control picks a turret (`predictBatteryClick`).

import { CONFIG, aimPointOf, type AimPose, type InputMsg } from '@salvo/shared';
import type { OwnBattery } from './ownBattery.js';

/**
 * One predicted tick of the own battery from the input just sent. A hull that
 * is not afloat (sunk / wreck) or has no pose yet holds its turret angles —
 * reloads and the secondaries' cooling still run (the orchestrator's ruling:
 * a wreck's turrets hold their angle), and the secondaries never fire.
 */
export function stepOwnBattery(
  battery: OwnBattery,
  pose: AimPose | null,
  input: Pick<InputMsg, 'aim' | 'aimDist' | 'sec'>,
  afloat: boolean,
): number {
  const dt = CONFIG.tick.simDtMs;
  if (pose === null || !afloat) return battery.hold(dt);
  return battery.step(pose, input.aim, input.aimDist, input.sec, dt);
}

/**
 * Pure: the predicted verdict for a MAIN BATTERY click (R4): it fires whenever
 * ANY predicted turret is ready (`loaded`), and it is NEVER out of arc — the
 * battery's arc is full, so the only denial is `cooling` (nothing ready).
 */
export function batteryClickPrediction(
  battery: Pick<OwnBattery, 'anyReady'>,
  alive: boolean,
): { alive: boolean; loaded: boolean; inArc: boolean } {
  return { alive, loaded: battery.anyReady(), inArc: true };
}

/**
 * A main-battery click the client predicts will fire: run the shared R4 pick
 * against the predicted turrets and start the picked turret's reload locally.
 * Returns the picked turret index, or null when none is ready (the `cooling`
 * denial) or there is no pose.
 */
export function predictBatteryClick(
  battery: OwnBattery,
  pose: AimPose | null,
  aim: number,
  aimDist: number,
  reloadMs: number,
): number | null {
  if (pose === null) return null;
  const pick = battery.pick(pose, aimPointOf(pose, aim, aimDist));
  if (pick === null) return null;
  battery.fire(pick.index, reloadMs);
  return pick.index;
}
