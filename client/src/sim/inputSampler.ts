// Per-tick input sampling. Exactly one InputMsg per 50ms sim tick (matching
// the server's latest-input model — one send per tick means one application
// per tick), with a monotonic seq. Aim/fire/weapon are stubbed until mouse
// aim (step 8): aim 0, fire false, weapon 0.

import { MSG, type InputMsg } from '@salvo/shared';
import type { Axes } from '../input/keyboard.js';
import { clamp } from '../util/math.js';

/** Pure: build the wire input for one tick. Exported for tests. */
export function buildInput(seq: number, axes: Axes): InputMsg {
  return {
    seq,
    throttle: clamp(axes.throttle, -1, 1),
    rudder: clamp(axes.rudder, -1, 1),
    aim: 0, // mouse aim lands in step 8
    fire: false,
    weapon: 0,
  };
}

/** Sends one input per sim tick over the given transport with monotonic seq. */
export class InputSampler {
  private seq = 0;

  constructor(private readonly send: (type: string, msg: InputMsg) => void) {}

  /** Highest seq sent so far (0 before the first sample). */
  get lastSeq(): number {
    return this.seq;
  }

  /** Build + send this tick's input. Returns the message for local prediction. */
  sample(axes: Axes): InputMsg {
    this.seq += 1;
    const msg = buildInput(this.seq, axes);
    this.send(MSG.input, msg);
    return msg;
  }
}
