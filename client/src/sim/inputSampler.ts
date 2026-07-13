// Per-tick input sampling. Exactly one InputMsg per 50ms sim tick (matching
// the server's latest-input model — one send per tick means one application
// per tick), with a monotonic seq. Aim/clicks/weapon come from the mouse: aim
// is a world-space bearing from the own ship to the cursor's world point,
// aimDist that distance (guns splash at the clicked point), fireSeq the
// cumulative click counter (one shot per click — the server consumes each new
// value as one shot request), weapon the current selection.

import { MSG, type InputMsg, type WeaponId } from '@salvo/shared';
import type { Axes } from '../input/keyboard.js';
import { clamp } from '../util/math.js';

/** The weapon-facing fields sampled from the mouse each tick. */
export interface Aiming {
  aim: number; // rad — world-space bearing
  fireSeq: number; // cumulative click counter (mouse.clickCount)
  aimDist: number; // u — own ship → cursor world distance
  weapon: WeaponId;
}

/** Pure: build the wire input for one tick. Exported for tests. */
export function buildInput(seq: number, axes: Axes, aiming: Aiming): InputMsg {
  return {
    seq,
    throttle: clamp(axes.throttle, -1, 1),
    rudder: clamp(axes.rudder, -1, 1),
    aim: aiming.aim,
    fireSeq: aiming.fireSeq,
    aimDist: aiming.aimDist,
    weapon: aiming.weapon,
  };
}

/** Sends one input per sim tick over the given transport with monotonic seq. */
export class InputSampler {
  private seq = 0;
  private lastAiming: Aiming = { aim: 0, fireSeq: 0, aimDist: 0, weapon: 0 };

  constructor(private readonly send: (type: string, msg: InputMsg) => void) {}

  /** Highest seq sent so far (0 before the first sample). */
  get lastSeq(): number {
    return this.seq;
  }

  /** Build + send this tick's input. Returns the message for local prediction. */
  sample(axes: Axes, aiming: Aiming): InputMsg {
    this.seq += 1;
    const msg = buildInput(this.seq, axes, aiming);
    this.lastAiming = { ...aiming };
    this.send(MSG.input, msg);
    return msg;
  }

  /**
   * Build + send a rudder-neutral input outside the normal tick cadence (used
   * when the tab goes hidden/blurred), PRESERVING the current throttle order
   * `throttle`. The server's latest-input model keeps applying the last input
   * we sent while we're backgrounded, so the rudder — the one genuinely
   * dangerous stale input (a locked turn) — is zeroed here. The throttle is
   * NOT stale: it's a deliberate engine-order telegraph setting, and a
   * backgrounded ship is meant to keep steaming straight ahead at its set
   * speed. Fire needs no neutralizing anymore: fireSeq is a click counter, and
   * with a counter nothing can stick — re-sending the LAST value is the honest
   * "no new clicks" signal (a 0 would merely be re-consumed harmlessly, but it
   * would misstate the counter). Keeps the last aim bearing / aim distance /
   * weapon selection and a monotonic seq shared with sample(), so it slots
   * into local prediction exactly like a regular tick.
   */
  sendNeutralNow(throttle: number): InputMsg {
    this.seq += 1;
    const msg = buildInput(this.seq, { throttle, rudder: 0 }, this.lastAiming);
    this.send(MSG.input, msg);
    return msg;
  }
}
