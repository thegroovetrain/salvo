// Per-tick input sampling. Exactly one InputMsg per 50ms sim tick (matching
// the server's latest-input model — one send per tick means one application
// per tick), with a monotonic seq. Aim/fire/weapon come from the mouse: aim is
// a world-space bearing from the own ship to the cursor's world point, fire is
// button-0 held (hold-to-fire — the server derives shots), weapon is the
// current selection (guns=0 until step 12).

import { MSG, type InputMsg, type WeaponId } from '@salvo/shared';
import type { Axes } from '../input/keyboard.js';
import { clamp } from '../util/math.js';

/** The weapon-facing fields sampled from the mouse each tick. */
export interface Aiming {
  aim: number; // rad — world-space bearing
  fire: boolean; // button-0 held
  weapon: WeaponId;
}

/** Pure: build the wire input for one tick. Exported for tests. */
export function buildInput(seq: number, axes: Axes, aiming: Aiming): InputMsg {
  return {
    seq,
    throttle: clamp(axes.throttle, -1, 1),
    rudder: clamp(axes.rudder, -1, 1),
    aim: aiming.aim,
    fire: aiming.fire,
    weapon: aiming.weapon,
  };
}

/** Sends one input per sim tick over the given transport with monotonic seq. */
export class InputSampler {
  private seq = 0;
  private lastAim = 0;
  private lastWeapon: WeaponId = 0;

  constructor(private readonly send: (type: string, msg: InputMsg) => void) {}

  /** Highest seq sent so far (0 before the first sample). */
  get lastSeq(): number {
    return this.seq;
  }

  /** Build + send this tick's input. Returns the message for local prediction. */
  sample(axes: Axes, aiming: Aiming): InputMsg {
    this.seq += 1;
    const msg = buildInput(this.seq, axes, aiming);
    this.lastAim = aiming.aim;
    this.lastWeapon = aiming.weapon;
    this.send(MSG.input, msg);
    return msg;
  }

  /**
   * Build + send a rudder-neutral, no-fire input outside the normal tick
   * cadence (used when the tab goes hidden/blurred), PRESERVING the current
   * throttle order `throttle`. The server's latest-input model keeps applying
   * the last input we sent while we're backgrounded, so rudder + fire — the
   * genuinely dangerous stale inputs (a locked turn, guns blazing at no one) —
   * are zeroed here. The throttle is NOT stale: it's a deliberate engine-order
   * telegraph setting, and a backgrounded ship is meant to keep steaming
   * straight ahead at its set speed. (This deliberately supersedes the old
   * all-stop behaviour, from when throttle was a held key.) Keeps the last aim
   * bearing + weapon selection (irrelevant while fire=false) and a monotonic
   * seq shared with sample(), so it slots into local prediction exactly like a
   * regular tick.
   */
  sendNeutralNow(throttle: number): InputMsg {
    this.seq += 1;
    const msg = buildInput(this.seq, { throttle, rudder: 0 }, {
      aim: this.lastAim,
      fire: false,
      weapon: this.lastWeapon,
    });
    this.send(MSG.input, msg);
    return msg;
  }
}
