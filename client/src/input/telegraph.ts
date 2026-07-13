// Engine-order telegraph: the throttle is a persistent STEPPED SETTING, not a
// held key. Nine detents from full astern to full ahead; each W/S (or arrow)
// TAP moves the order one step, and the ship's actual speed converges toward it
// via the shared kinematics (the setting is instant, the hull is not — the
// naval feel). Pure detent math + edge/repeat handling live here (unit-tested);
// input/keyboard.ts is the thin DOM adapter that turns keydown edges into
// step() calls, and sim/inputSampler.ts reads `throttle` every tick.

/** The nine throttle detents: index 0 = full astern (-1) .. index 8 = full ahead (+1). */
export const DETENTS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1] as const;

/** Index of the neutral (STOP, 0) detent — the starting order. */
export const NEUTRAL_INDEX = 4;

/** Keys that step the order one detent toward AHEAD. */
export const THROTTLE_AHEAD = ['KeyW', 'ArrowUp'];
/** Keys that step the order one detent toward ASTERN. */
export const THROTTLE_ASTERN = ['KeyS', 'ArrowDown'];

/** A single detent step: +1 toward ahead, -1 toward astern. */
export type Step = 1 | -1;

/** Pure: clamp a detent index into [0, DETENTS.length). */
export function clampIndex(i: number): number {
  if (i < 0) return 0;
  if (i > DETENTS.length - 1) return DETENTS.length - 1;
  return i;
}

/** Pure: the detent index one step from `i` in `dir`, clamped at the end stops. */
export function stepIndex(i: number, dir: Step): number {
  return clampIndex(i + dir);
}

/**
 * Pure: the throttle step a keydown triggers, or null if the key isn't a
 * throttle key. `repeat` (OS auto-repeat while a key is held down) yields null
 * so that ONE physical tap = ONE detent — holding W must not run up the scale.
 */
export function stepFromKey(code: string, repeat: boolean): Step | null {
  if (repeat) return null;
  if (THROTTLE_AHEAD.includes(code)) return 1;
  if (THROTTLE_ASTERN.includes(code)) return -1;
  return null;
}

/**
 * The persistent throttle order. Holds the current detent index; step()/reset()
 * mutate it. Deliberately survives blur/tab-hide (the ship keeps steaming — see
 * inputSampler.sendNeutralNow) and is reset to neutral only on spawn/sunk/spectate.
 */
export class Telegraph {
  private idx = NEUTRAL_INDEX;

  /** Current order as a throttle value in [-1, 1] (what the sampler sends). */
  get throttle(): number {
    return DETENTS[this.idx];
  }

  /** Current detent index [0, 8] — for the HUD ladder highlight + tests. */
  get index(): number {
    return this.idx;
  }

  /**
   * Move the order one detent in `dir`. Returns true iff the detent actually
   * changed (a step into an end stop is a no-op — no click, per the audio hook).
   */
  step(dir: Step): boolean {
    const next = stepIndex(this.idx, dir);
    if (next === this.idx) return false;
    this.idx = next;
    return true;
  }

  /** Reset the order to neutral (STOP). Used on spawn, sunk, and entering spectate. */
  reset(): void {
    this.idx = NEUTRAL_INDEX;
  }
}
