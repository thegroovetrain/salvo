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
  fireT: number; // ms — server-clock estimate at the last click (mouse.lastClickT); 0 = no claim
  actSeq: number; // cumulative ability-activation counter (keyboard.actSeq); 0 = never
  actSlot: number; // loadout slot of the latest ability activation (0 sentinel)
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

/**
 * Pure: does an ability-activation keypress predict as DENIED (Story 1.6)?
 * Denied when the own ship is dead or the ability slot has no charge (cooling)
 * — mirroring the server's sinking gate + charge consume. There is NO arc
 * component: an ability is not aimed, so a denied press drives ONLY the
 * denied-pulse chip feedback (never the weapon-arc/reticle denied visuals).
 * FEEDBACK ONLY — the press already advanced actSeq and still rides the next
 * input either way; the server stays the sole authority on activation.
 */
export function abilityPressDenied(alive: boolean, loaded: boolean): boolean {
  return !alive || !loaded;
}

/**
 * Pure: the verdict for ONE foghorn keypress (Story 4.5, amendments 56/58).
 * Three outcomes, and the split matters:
 *  - `'ignore'` — the press never happened as far as anything is concerned. A
 *    spectator or a sunk hull has no horn (the server refuses both: world.ts
 *    consumeHonk gates on `ship.alive`), and feeding back a denial for a horn
 *    you do not have would teach the wrong rule.
 *  - `'denied'` — a real horn, pressed inside the cooldown. Plays the shipped
 *    predicted `denied` cue and sends NOTHING (the server would silently drop
 *    it anyway).
 *  - `'honk'` — send it.
 *
 * DELIBERATELY NOT GATED ON MATCH PHASE. The server honks in the weapons-safe
 * ready room exactly as it fires there (consumeHonk has no phase test), and
 * render/deniedFire.ts's header records why a client-only phase gate is a bug
 * and not a safety: it makes the UI contradict what the sim actually did. The
 * results phase needs no gate of its own — a finished match puts this client
 * in `spectating`, which the first clause already answers.
 *
 * `now` and `nextHonkAt` are SERVER-CLOCK estimates (the cooldown the server
 * enforces is measured in server time; see the caller in main.ts).
 */
export function hornPressVerdict(
  alive: boolean,
  spectating: boolean,
  now: number,
  nextHonkAt: number,
): 'ignore' | 'denied' | 'honk' {
  if (spectating || !alive) return 'ignore';
  return now >= nextHonkAt ? 'honk' : 'denied';
}

/** Pure: build the wire input for one tick. Exported for tests. `hornSeq` is
 *  the sampler's own cumulative honk counter (see InputSampler.honk) rather
 *  than an `Aiming` field: a honk is not aimed and carries no slot. */
export function buildInput(seq: number, axes: Axes, aiming: Aiming, hornSeq = 0): InputMsg {
  return {
    seq,
    throttle: clamp(axes.throttle, -1, 1),
    rudder: clamp(axes.rudder, -1, 1),
    aim: aiming.aim,
    fireSeq: aiming.fireSeq,
    aimDist: aiming.aimDist,
    slot: aiming.slot,
    fireT: aiming.fireT,
    actSeq: aiming.actSeq,
    actSlot: aiming.actSlot,
    hornSeq,
  };
}

/** Sends one input per sim tick over the given transport with monotonic seq. */
export class InputSampler {
  private seq = 0;
  private lastAiming: Aiming = { aim: 0, fireSeq: 0, aimDist: 0, slot: SLOT_GUN, fireT: 0, actSeq: 0, actSlot: 0 };
  /**
   * Cumulative FOGHORN counter (InputMsg.hornSeq); 0 = never honked, the
   * sentinel every non-honking driver keeps sending.
   *
   * A PLAIN COUNTER, deliberately not the ability FIFO: `actSeq` needs a queue
   * because several ability presses can legitimately land inside one 50ms
   * sample window and the wire carries one per input, whereas the foghorn's
   * 1.5s server cooldown (CONFIG.foghorn.cooldownMs) makes two ACCEPTED honks
   * in one tick impossible — there is never anything to queue. Monotonic and
   * never reset: the server consumes it with max(), so a reset would read as a
   * stale counter and silently swallow the next honk (world.ts records the same
   * reasoning for lastHornSeq).
   */
  private hornCount = 0;

  constructor(private readonly send: (type: string, msg: InputMsg) => void) {}

  /** Highest seq sent so far (0 before the first sample). */
  get lastSeq(): number {
    return this.seq;
  }

  /** Cumulative honk counter for the wire (InputMsg.hornSeq). */
  get hornSeq(): number {
    return this.hornCount;
  }

  /**
   * A honk was ACCEPTED locally (alive, not spectating, off cooldown): advance
   * the counter so the next input — the regular tick sample or a tab-hide
   * neutral send — carries it. Nothing is played here: an own honk is NEVER
   * client-predicted (amendment 58); the honker hears their own horn from the
   * server's self-addressed `fh`, exactly once.
   */
  honk(): void {
    this.hornCount += 1;
  }

  /** Build + send this tick's input. Returns the message for local prediction. */
  sample(axes: Axes, aiming: Aiming): InputMsg {
    this.seq += 1;
    const msg = buildInput(this.seq, axes, aiming, this.hornCount);
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
   * `currentFireT` is the mouse's live click timestamp at hide time, paired
   * with `currentFireSeq` so a gap-click carries its honest fire instant (D1);
   * falls back to the last-sampled aiming's fireT when omitted. The ability
   * counters mirror fireSeq's treatment exactly (Story 1.6): `currentActSeq` /
   * `currentActSlot` are the keyboard's live values at hide time, so an
   * ability press landing in the ≤1-tick gap since the last sample activates
   * NOW instead of on refocus; the max() guard keeps the wire counter
   * monotonic, and `actSlot` only adopts the live slot when the live counter
   * is genuinely newer. Keeps the last aim bearing / aim distance / primed
   * slot and a monotonic seq shared with sample(), so it slots into local
   * prediction exactly like a regular tick.
   */
  sendNeutralNow(
    throttle: number,
    currentFireSeq?: number,
    currentFireT?: number,
    currentActSeq?: number,
    currentActSlot?: number,
  ): InputMsg {
    this.seq += 1;
    const fireSeq = Math.max(this.lastAiming.fireSeq, currentFireSeq ?? 0);
    const fireT = currentFireT ?? this.lastAiming.fireT;
    const live = (currentActSeq ?? 0) > this.lastAiming.actSeq; // a gap-press since the last sample
    const actSeq = live ? (currentActSeq ?? 0) : this.lastAiming.actSeq;
    const actSlot = live ? (currentActSlot ?? this.lastAiming.actSlot) : this.lastAiming.actSlot;
    this.lastAiming = { ...this.lastAiming, fireSeq, fireT, actSeq, actSlot };
    // The honk counter needs no gap-handling parameter: it lives on the sampler
    // itself, so a press landing in the <=1-tick gap before the tab hid is
    // already reflected here and sounds NOW rather than on refocus (the fireSeq
    // treatment, arrived at for free).
    const msg = buildInput(this.seq, { throttle, rudder: 0 }, this.lastAiming, this.hornCount);
    this.send(MSG.input, msg);
    return msg;
  }
}
