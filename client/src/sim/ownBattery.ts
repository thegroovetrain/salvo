// THE OWN BATTERY (Story 10.4): the client's predicted copy of its own main
// battery turrets and secondaries heat — predict and correct, contract section 4.
//
// Seeded at rest and loaded (`initialTurrets` / `initialSecondaries`), stepped
// once per 50 ms predicted sim tick with the SAME aim the outgoing InputMsg
// carries (`stepTurrets` / `stepSecondaries` — the shared steppers the server
// runs, no per-side fork), and corrected on every own frame: the turrets copy
// the server's `you.turrets`, the heat and lock copy `you.sec` while the local
// round phase is kept. CORRECT-THEN-CONTINUE, no replay of unacked inputs: the
// error is bounded by latency × the 90°/s traverse and self-corrects next frame.
//
// SIM LAYER (net → sim → render): the frame correction and the sim tick write
// it; render reads `angles` / `heat` / `locked` and never writes.

import {
  aimPointOf,
  batterySummary,
  copyTurrets,
  fireTurret,
  initialSecondaries,
  initialTurrets,
  pickTurret,
  stepSecondaries,
  stepTurrets,
  type AimPose,
  type HullId,
  type OwnShip,
  type SecondariesState,
  type TurretPick,
  type TurretState,
} from '@salvo/shared';

/** Any pose — `stepTurrets` with a null aim point never reads it. */
const HOLD_POSE: AimPose = { x: 0, y: 0, heading: 0 };

export class OwnBattery {
  private hull: HullId;
  readonly turrets: TurretState[];
  readonly sec: SecondariesState;
  /** The turrets' hull-relative angles, one reused array (render reads it). */
  private readonly angleBuf: number[] = [];

  constructor(hull: HullId) {
    this.hull = hull;
    this.turrets = initialTurrets(hull);
    this.sec = initialSecondaries();
  }

  /** The hull this battery is modelled on. */
  get hullId(): HullId {
    return this.hull;
  }

  /** Back to rest, loaded and cold for `hull` — class change, respawn, new match. */
  reset(hull: HullId): void {
    this.hull = hull;
    copyTurrets(this.turrets, initialTurrets(hull));
    Object.assign(this.sec, initialSecondaries());
  }

  /**
   * One predicted 50 ms tick: traverse + reload every turret toward the aim
   * point of (`aim`, `aimDist`) from the predicted `pose`, and run the
   * secondaries on the sampled right-button level. Returns the secondary
   * rounds this tick fires (the server's count, predicted).
   */
  step(pose: AimPose, aim: number, aimDist: number, secHeld: boolean, dtMs: number): number {
    stepTurrets(this.turrets, this.hull, pose, aimPointOf(pose, aim, aimDist), dtMs);
    return stepSecondaries(this.sec, secHeld, dtMs);
  }

  /** A tick with no aim (a wreck, or no pose yet): every angle holds, reloads
   *  and the secondaries' cooling still run, and nothing fires. */
  hold(dtMs: number): number {
    stepTurrets(this.turrets, this.hull, HOLD_POSE, null, dtMs);
    return stepSecondaries(this.sec, false, dtMs);
  }

  /** Overwrite the predicted state from an own frame (`you.turrets`, `you.sec`).
   *  A frame for another hull (a class change mid-flight) re-seeds first. */
  correct(you: Pick<OwnShip, 'cls' | 'turrets' | 'sec'>): void {
    if (you.cls !== this.hull) this.reset(you.cls);
    copyTurrets(this.turrets, you.turrets);
    this.sec.heat = you.sec.heat;
    this.sec.locked = you.sec.locked;
  }

  /** Is any turret loaded? (R4: a click always fires when one is.) */
  anyReady(): boolean {
    for (const t of this.turrets) if (t.reloadMsLeft <= 0) return true;
    return false;
  }

  /** The R4 pick for an aim point from `pose` — the shared pure picker. */
  pick(pose: AimPose, aimPoint: { x: number; y: number }): TurretPick | null {
    return pickTurret(this.turrets, this.hull, pose, aimPoint);
  }

  /** Predict a fired turret: start its reload locally (the frame corrects it). */
  fire(index: number, reloadMs: number): void {
    fireTurret(this.turrets, index, reloadMs);
  }

  /** The hotbar pair (`n` ready, soonest reload) of the predicted state. */
  summary(): { n: number; reloadMsLeft: number } {
    return batterySummary(this.turrets);
  }

  /** The turrets' hull-relative angles, bow to stern (reused array). */
  angles(): readonly number[] {
    const out = this.angleBuf;
    out.length = this.turrets.length;
    for (let i = 0; i < this.turrets.length; i++) out[i] = this.turrets[i].a;
    return out;
  }

  /** Secondaries heat in [0, 1]. */
  get heat(): number {
    return this.sec.heat;
  }

  /** True while the secondaries are overheated and dark. */
  get locked(): boolean {
    return this.sec.locked;
  }
}
