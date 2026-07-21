// Per-tick input sampling. Exactly one InputMsg per 50ms sim tick (matching
// the server's latest-input model — one send per tick means one application
// per tick), with a monotonic seq. Aim/clicks/slot come from the mouse +
// keyboard prime: aim is a world-space bearing from the own ship to the
// cursor's world point, aimDist that distance (the gun bursts at the clicked
// point), fireSeq the cumulative click counter (one shot per click — the server
// consumes each new value as one shot request), slot the primed loadout slot at
// click time (0 = gun default; the server keeps no priming state, so the click's
// slot IS the resolved prime).

import { MSG, SLOT_GUN, type InputMsg } from '@salvo/shared';
import type { Axes } from '../input/keyboard.js';
import { clamp } from '../util/math.js';

/** The fire-facing fields sampled from mouse + keyboard prime each tick. */
export interface Aiming {
  aim: number; // rad — world-space bearing
  fireSeq: number; // cumulative click counter (mouse.clickCount)
  aimDist: number; // u — own ship → cursor world distance
  slot: number; // primed loadout slot (0 = gun) — the click's wire slot
}

/**
 * Pure: does a click on the primed skillshot slot predict as FIREABLE, so the
 * client consumes the prime (reverts to gun)? A predicted-denied click
 * (reloading / out of the weapon's arc) KEEPS the prime and pulses denied
 * feedback (render/deniedFire.ts) instead. The gun (slot 0) is never a prime to
 * consume. The wire slot per click is the truth regardless — this only decides
 * the pure-UX prime state (Eric ruling / design note 2026-07-21).
 */
export function primeFireable(primedSlot: number, loaded: boolean, inArc: boolean): boolean {
  return primedSlot !== SLOT_GUN && loaded && inArc;
}

/**
 * Pure: should a fired click CONSUME the prime this tick? Only when the own ship
 * is ALIVE and the click predicts fireable (primeFireable). A dead / not-yet-
 * spawned ship never consumes: death independently reverts the prime to the gun
 * (roomBindings handleSunk → resetPrime), so consuming here would at best be
 * redundant and, on the death tick, would act on an already-stale slot.
 */
export function shouldConsumePrime(
  alive: boolean,
  primedSlot: number,
  loaded: boolean,
  inArc: boolean,
): boolean {
  return alive && primeFireable(primedSlot, loaded, inArc);
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
    slot: aiming.slot,
  };
}

/** Sends one input per sim tick over the given transport with monotonic seq. */
export class InputSampler {
  private seq = 0;
  private lastAiming: Aiming = { aim: 0, fireSeq: 0, aimDist: 0, slot: SLOT_GUN };

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
   * with a counter nothing can stick. `currentFireSeq` is the mouse's live
   * click count at hide time: a click landing in the ≤1-tick gap since the
   * last sample would otherwise sit unsent until refocus and fire minutes
   * later at a stale aim — sending the live count fires it NOW, at an aim at
   * most one tick old. Guarded with max() so the wire counter never regresses.
   * Keeps the last aim bearing / aim distance / primed slot and a
   * monotonic seq shared with sample(), so it slots into local prediction
   * exactly like a regular tick.
   */
  sendNeutralNow(throttle: number, currentFireSeq?: number): InputMsg {
    this.seq += 1;
    const fireSeq = Math.max(this.lastAiming.fireSeq, currentFireSeq ?? 0);
    this.lastAiming = { ...this.lastAiming, fireSeq };
    const msg = buildInput(this.seq, { throttle, rudder: 0 }, this.lastAiming);
    this.send(MSG.input, msg);
    return msg;
  }
}
