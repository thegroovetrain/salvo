// THE OWN LAUNCHERS' PER-TICK DRIVERS (Story 10.6) — the calls main.ts's sim
// tick makes on sim/ownLaunchers.ts, kept out of main.ts so the predict half
// is unit-testable on its own (the sim/ownBatteryTick.ts precedent).
//
// Order is the server's: the hull steps, then the launchers reload and snap to
// THIS input's aim (`stepOwnLaunchers`, beside the turrets), then fire
// control picks a tube (`predictTorpedoClick`).
//
// THE VERDICT IS THE SHARED PICK (R16, Eric verbatim: "if the tube CANNOT
// POSSIBLY point at the aimed area, it doesn't fire no matter what"):
//   - no held launcher's arc holds the aim → OUT OF ARC (the denial register;
//     nothing is predicted fired, the prime is kept);
//   - an arc holds it but none of those launchers has a loaded tube → COOLING;
//   - otherwise ONE tube fires (one click, one torpedo).

import { CONFIG, type AimPose, type InputMsg, type TubePick } from '@salvo/shared';
import type { OwnLaunchers } from './ownLaunchers.js';

/**
 * One predicted tick of the own launchers from the input just sent: they point
 * at the aim only while `afloat` (and there is a pose) — a sinking hull or a wreck
 * holds its angles while the tube clocks still run, as the server's row does.
 */
export function stepOwnLaunchers(
  launchers: OwnLaunchers,
  pose: AimPose | null,
  input: Pick<InputMsg, 'aim' | 'aimDist'>,
  afloat: boolean,
): void {
  const dt = CONFIG.tick.simDtMs;
  if (pose === null || !afloat) launchers.hold(dt);
  else launchers.step(pose, input.aim, input.aimDist, dt);
}

/** Pure: the shared R16 verdict for a torpedo click on this aim against the
 *  predicted launchers; no pose reads `out-of-arc` (nothing names an area). */
export function torpedoVerdict(
  launchers: Pick<OwnLaunchers, 'pick'>,
  pose: AimPose | null,
  aim: number,
  aimDist: number,
): TubePick {
  return pose === null ? { verdict: 'out-of-arc' } : launchers.pick(pose, aim, aimDist);
}

/**
 * Pure: the predicted verdict for a TORPEDO click in the click-prediction
 * shape: `inArc` false exactly on `out-of-arc`, `loaded` true exactly on
 * `fire` — so `cooling` reads as an in-arc, unloaded click (the reload
 * denial) and `out-of-arc` as the bearing denial. The one read the reticle,
 * the denied pulse and the click prediction all make.
 */
export function torpedoClickPrediction(
  launchers: Pick<OwnLaunchers, 'pick'>,
  alive: boolean,
  pose: AimPose | null,
  aim: number,
  aimDist: number,
): { alive: boolean; loaded: boolean; inArc: boolean } {
  const v = torpedoVerdict(launchers, pose, aim, aimDist).verdict;
  return { alive, loaded: v === 'fire', inArc: v !== 'out-of-arc' };
}

/**
 * A torpedo click the client predicts will fire: run the shared pick and start
 * the picked tube's clock locally, tagged with `seq` (the input that carries
 * the click). Returns the pick, or null when it would not fire.
 */
export function predictTorpedoClick(
  launchers: OwnLaunchers,
  pose: AimPose | null,
  aim: number,
  aimDist: number,
  reloadMs: number,
  seq: number,
): Extract<TubePick, { verdict: 'fire' }> | null {
  const pick = torpedoVerdict(launchers, pose, aim, aimDist);
  if (pick.verdict !== 'fire') return null;
  launchers.fire(pick.launcher, pick.tube, reloadMs, seq);
  return pick;
}
