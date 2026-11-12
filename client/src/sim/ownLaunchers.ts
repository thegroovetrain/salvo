// THE OWN TORPEDO LAUNCHERS (Story 10.6, Eric 2026-11-05, R6 / R13 / R16,
// epic-10 amendment 12): the client's predicted copy of its own deck
// launchers — predict and correct, exactly as sim/ownBattery.ts does for the
// main battery turrets.
//
// Stepped once per 50 ms predicted sim tick with the SAME aim the outgoing
// InputMsg carries (`launcherAimPoint` → `stepLaunchers` — the shared stepper
// the server runs, no per-side fork; R13: the launchers follow the cursor at
// all times, whatever is primed), and corrected on every own frame from
// `you.launchers` (`copyLaunchers`). CORRECT-THEN-CONTINUE, no replay: the
// launchers SNAP to the aim (no traverse — Story 11.1 R16: `stepLaunchers` sets
// each angle to the shared `launcherAngle`), so any error lasts one tick.
//
// A ship holds launchers ONLY while its torpedo slot is filled — the wire
// omits `you.launchers` otherwise, and a correction from such a frame empties
// the model (nothing to step, nothing to draw, every click `out-of-arc`).
//
// A PREDICTED SHOT SURVIVES A STALE FRAME (the battery's review gate C2): a
// frame the server built before it applied the click's input would reset the
// fired tube to "loaded" for a round trip. `fire` remembers the input `seq`
// per (launcher, tube), and `correct` keeps that tube's LOCAL clock while the
// frame's `ackSeq` is older than it; past PENDING_CAPACITY frames without the
// ack the server's value is taken anyway (the safety valve).
//
// SIM LAYER (net → sim → render): the frame correction and the sim tick write
// it; render reads `states` / `angles()` and never writes.

import {
  copyLaunchers,
  fireTube,
  launcherAimPoint,
  launcherSummary,
  pickTube,
  stepLaunchers,
  type AimPose,
  type HullId,
  type LauncherState,
  type OwnShip,
  type TubePick,
} from '@salvo/shared';
import { PENDING_CAPACITY } from './prediction.js';

/** Any pose — `stepLaunchers` with a null aim point never reads it. */
const HOLD_POSE: AimPose = { x: 0, y: 0, heading: 0 };

/** One predicted tube fire the frames have not acked yet. */
interface PendingFire {
  launcher: number;
  tube: number;
  seq: number;
  /** Frames arrived since the fire (the safety valve's count). */
  frames: number;
  /** Scratch: the tube's local clock just before a frame overwrote it. */
  local: number;
}

export class OwnLaunchers {
  private hull: HullId;
  /** The predicted launchers, fore first — EMPTY while no torpedo is held. */
  readonly states: LauncherState[] = [];
  /** The launchers' hull-relative angles (one reused array — render reads it). */
  private readonly angleBuf: number[] = [];
  private pending: PendingFire[] = [];

  constructor(hull: HullId) {
    this.hull = hull;
  }

  /** The hull this model steps on. */
  get hullId(): HullId {
    return this.hull;
  }

  /** No launchers, nothing pending, on `hull` — class change, respawn, new match. */
  reset(hull: HullId): void {
    this.hull = hull;
    this.states.length = 0;
    this.pending = [];
  }

  /** One predicted 50 ms tick: every launcher SNAPS to the aim of (`aim`, `aimDist`) from the
   *  predicted `pose` — `launcherAimPoint`, so a zero / non-finite aim holds
   *  every angle exactly as the server does. Every tube clock counts down. */
  step(pose: AimPose, aim: number, aimDist: number, dtMs: number): void {
    stepLaunchers(this.states, this.hull, pose, launcherAimPoint(pose, this.hull, aim, aimDist), dtMs);
  }

  /** A tick whose launchers HOLD (a sinking hull, a wreck, no pose yet): the
   *  angles hold, the tube clocks still count down. */
  hold(dtMs: number): void {
    stepLaunchers(this.states, this.hull, HOLD_POSE, null, dtMs);
  }

  /**
   * Overwrite the predicted state from an own frame carrying `ackSeq`
   * (`you.launchers` — absent = no torpedo held = no launchers). A tube whose
   * predicted fire is newer than the ack keeps its local clock. A frame for
   * another hull re-seeds first.
   */
  correct(you: Pick<OwnShip, 'cls' | 'launchers'>, ackSeq: number): void {
    if (you.cls !== this.hull) this.reset(you.cls);
    for (const p of this.pending) p.local = this.states[p.launcher]?.tubes[p.tube] ?? 0;
    copyLaunchers(this.states, you.launchers ?? []);
    this.pending = this.pending.filter((p) => this.keepLocal(p, ackSeq));
  }

  /** Re-apply one pending fire's local clock if the frame is older than it (and
   *  the valve has not expired); false = drop it. */
  private keepLocal(p: PendingFire, ackSeq: number): boolean {
    p.frames += 1;
    const tubes = this.states[p.launcher]?.tubes;
    if (p.seq <= ackSeq || p.frames >= PENDING_CAPACITY || tubes === undefined || p.tube >= tubes.length) return false;
    tubes[p.tube] = p.local;
    return true;
  }

  /** The shared R16 pick for the aim of (`aim`, `aimDist`) from `pose`. */
  pick(pose: AimPose, aim: number, aimDist: number): TubePick {
    return pickTube(this.states, this.hull, pose, launcherAimPoint(pose, this.hull, aim, aimDist));
  }

  /** Predict a fired tube: start its clock locally, remembering the input `seq`
   *  that carries the click (frames older than it keep this clock). */
  fire(launcher: number, tube: number, reloadMs: number, seq: number): void {
    fireTube(this.states, launcher, tube, reloadMs);
    if (this.states[launcher]?.tubes[tube] === undefined) return;
    this.pending = this.pending.filter((p) => p.launcher !== launcher || p.tube !== tube);
    this.pending.push({ launcher, tube, seq, frames: 0, local: reloadMs });
  }

  /** The hotbar pair (tubes loaded, soonest reload) of the predicted state. */
  summary(): { n: number; reloadMsLeft: number } {
    return launcherSummary(this.states);
  }

  /** The launchers' hull-relative angles, fore first (reused array). */
  angles(): readonly number[] {
    const out = this.angleBuf;
    out.length = this.states.length;
    for (let i = 0; i < this.states.length; i++) out[i] = this.states[i].a;
    return out;
  }
}
