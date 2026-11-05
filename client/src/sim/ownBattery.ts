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
// A PREDICTED SHOT SURVIVES A STALE FRAME (review gate C2). A frame the server
// built before it applied the click's input would reset the fired turret to
// "ready" for a round trip. So `fire` remembers the input `seq` that carried
// the click, and `correct` keeps that turret's LOCAL reload (the angle still
// comes from the frame) while the frame's `ackSeq` is older than it — the
// predictor's own ack (sim/prediction.ts `onServerState`). Once a frame acks
// the seq the server's value is taken, whatever it says (a denied click comes
// back ready). SAFETY VALVE: after PENDING_CAPACITY frames without the ack —
// the predictor's own pending-ring bound, past which it has given up on an
// input too — the server's value is taken anyway, so nothing strands a turret.
//
// SIM LAYER (net → sim → render): the frame correction and the sim tick write
// it; render reads `angles` / `heat` / `locked` and never writes.

import {
  batteryAimPoint,
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
import { PENDING_CAPACITY } from './prediction.js';

/** No predicted fire waiting on an ack. */
const NO_SEQ = -1;

/** Any pose — `stepTurrets` with a null aim point never reads it. */
const HOLD_POSE: AimPose = { x: 0, y: 0, heading: 0 };

export class OwnBattery {
  private hull: HullId;
  readonly turrets: TurretState[];
  readonly sec: SecondariesState;
  /** The turrets' hull-relative angles, one reused array (render reads it). */
  private readonly angleBuf: number[] = [];
  /** Per turret: the input seq of a predicted fire the frames have not acked
   *  yet (NO_SEQ = none), and how many frames have arrived since (the valve). */
  private readonly firedSeq: number[] = [];
  private readonly firedFrames: number[] = [];
  /** Scratch: the local reloads just before a frame overwrites them. */
  private readonly localReload: number[] = [];

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
    this.firedSeq.length = 0;
    this.firedFrames.length = 0;
  }

  /**
   * One predicted 50 ms tick: traverse + reload every turret toward the aim
   * point of (`aim`, `aimDist`) from the predicted `pose` — `batteryAimPoint`,
   * so a zero / non-finite aim holds every angle exactly as the server does —
   * and run the secondaries on `secLive` (the right-button level the server
   * would read, already gated). Returns the secondary rounds this tick fires
   * (the server's count, predicted).
   */
  step(pose: AimPose, aim: number, aimDist: number, secLive: boolean, dtMs: number): number {
    stepTurrets(this.turrets, this.hull, pose, batteryAimPoint(pose, aim, aimDist), dtMs);
    return stepSecondaries(this.sec, secLive, dtMs);
  }

  /** A tick whose turrets HOLD (a sinking hull, a wreck, or no pose yet): every
   *  angle holds and reloads still count down; the secondaries still run on
   *  `secLive` (a sinking hull's guns stay live — the caller gates it). */
  hold(secLive: boolean, dtMs: number): number {
    stepTurrets(this.turrets, this.hull, HOLD_POSE, null, dtMs);
    return stepSecondaries(this.sec, secLive, dtMs);
  }

  /** Overwrite the predicted state from an own frame (`you.turrets`, `you.sec`)
   *  carrying `ackSeq`. A turret whose predicted fire is newer than the ack
   *  keeps its local reload (see the header). A frame for another hull (a class
   *  change mid-flight) re-seeds first. */
  correct(you: Pick<OwnShip, 'cls' | 'turrets' | 'sec'>, ackSeq: number): void {
    if (you.cls !== this.hull) this.reset(you.cls);
    const local = this.localReload;
    local.length = this.turrets.length;
    for (let i = 0; i < this.turrets.length; i++) local[i] = this.turrets[i].reloadMsLeft;
    copyTurrets(this.turrets, you.turrets);
    this.keepUnackedReloads(ackSeq);
    this.sec.heat = you.sec.heat;
    this.sec.locked = you.sec.locked;
  }

  /** Re-apply the local reload of every turret whose predicted fire the frame
   *  has not acked (and the valve has not expired); clear the rest. */
  private keepUnackedReloads(ackSeq: number): void {
    for (let i = 0; i < this.firedSeq.length; i++) {
      const seq = this.firedSeq[i] ?? NO_SEQ;
      if (seq === NO_SEQ) continue;
      this.firedFrames[i] += 1;
      const stale = seq > ackSeq && this.firedFrames[i] < PENDING_CAPACITY;
      if (stale && i < this.turrets.length) {
        this.turrets[i].reloadMsLeft = this.localReload[i] ?? 0;
      } else {
        this.firedSeq[i] = NO_SEQ;
      }
    }
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

  /** Predict a fired turret: start its reload locally, remembering the input
   *  `seq` that carries the click (frames older than it keep this reload). */
  fire(index: number, reloadMs: number, seq: number = NO_SEQ): void {
    fireTurret(this.turrets, index, reloadMs);
    if (index < 0 || index >= this.turrets.length) return;
    for (let i = this.firedSeq.length; i <= index; i++) {
      this.firedSeq[i] = NO_SEQ;
      this.firedFrames[i] = 0;
    }
    this.firedSeq[index] = seq;
    this.firedFrames[index] = 0;
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
