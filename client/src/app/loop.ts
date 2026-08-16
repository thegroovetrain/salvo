// The single render loop: one Pixi ticker containing a fixed-step accumulator
// (not two loops). Simulation advances in fixed SIM_DT steps for determinism
// (matches the server tick + future client prediction); rendering interpolates
// between the last two sim states by the leftover-accumulator alpha.
//
// FAULT CONTAINMENT (cycle 90) — this file is the client's only equivalent of
// the server's story-0.3 tick-error containment (ArenaRoom.runStep), and until
// this cycle it had none. Pixi 8's ticker clears `_requestId` BEFORE calling
// `update()` and only re-requests the frame AFTER it returns
// (node_modules/pixi.js/lib/ticker/Ticker.mjs) — so a single escaped exception
// leaves `started === true` with nothing scheduled and NO FRAME IS EVER
// REQUESTED AGAIN. That is not a dropped frame: input sampling stops, so the
// server keeps sailing the hull on its last engine order while the picture
// freezes. Our listener also runs at the default UPDATE_PRIORITY.NORMAL while
// Pixi's own renderer sits at LOW, so the throw pre-empts rendering too.
// Everything below exists to make a frame-path throw cost ONE FRAME.

import type { Application, Ticker } from 'pixi.js';
import { CONFIG } from '@salvo/shared';

const SIM_DT = CONFIG.tick.simDtMs / 1000; // s
const MAX_FRAME_DT = 0.25; // s — spiral-of-death clamp

/** Which half of the frame threw — passed to the caller's error hook and used
 *  as the log's rate-limit key. */
export type LoopPhase = 'simTick' | 'render';

/** Distinct error signatures to report before going quiet. A frame-path throw
 *  usually repeats EVERY frame, so an unbounded log is its own outage; the cap
 *  bounds the pathological case where the signature itself varies per frame. */
const MAX_REPORTED = 8;

export interface LoopCallbacks {
  /** Advance the sim by exactly `dt` (= SIM_DT) seconds. May run 0..N times. */
  simTick(dt: number): void;
  /**
   * Render one frame. `alpha` in [0,1) is the fraction into the next sim step
   * (for interpolation); `frameDt` is the real elapsed time (for smooth,
   * non-authoritative visuals like the camera).
   */
  render(alpha: number, frameDt: number): void;
  /**
   * Optional: a frame-path callback threw. The loop has already contained it
   * and will keep running. Exists because THIS module has no access to game
   * state by design, and the single most useful thing to capture is the fitted
   * boon list at the moment of the throw — which only the caller holds. The
   * hook is itself guarded, so a throwing reporter cannot re-break the loop.
   */
  onError?(err: unknown, phase: LoopPhase): void;
}

/** Run `fn`, containing and reporting any throw. Returns nothing — the frame
 *  simply loses that half of its work. */
function guard(fn: () => void, phase: LoopPhase, cb: LoopCallbacks, reported: Set<string>): void {
  try {
    fn();
  } catch (err) {
    report(err, phase, cb, reported);
  }
}

/** Rate-limited one-shot report per distinct (phase, message) signature. */
function report(err: unknown, phase: LoopPhase, cb: LoopCallbacks, reported: Set<string>): void {
  const key = `${phase}:${err instanceof Error ? err.message : String(err)}`;
  if (reported.has(key) || reported.size >= MAX_REPORTED) return;
  reported.add(key);
  // The caller's hook REPLACES the fallback rather than adding to it, so one
  // throw produces one line. Its own failure must never propagate back into the
  // loop we are busy protecting — so a broken reporter degrades to the fallback.
  if (cb.onError === undefined) {
    console.error(`[loop] ${phase} failed — the loop continues`, err);
    return;
  }
  try {
    cb.onError(err, phase);
  } catch {
    console.error(`[loop] ${phase} failed (onError threw too) — the loop continues`, err);
  }
}

/**
 * Start driving `cb` from the app ticker. The ticker auto-starts on init.
 *
 * Returns a DISPOSER that detaches the callback. Story 6.3 needs it: the
 * auto-requeue tears the arena session down IN PLACE (no page reload), and the
 * loop has to stop the instant the collapse signal lands — a sim tick after the
 * room has been left would sample input and `send` into a dead socket. Callers
 * that live for the page's lifetime may ignore it.
 */
export function startLoop(app: Application, cb: LoopCallbacks): () => void {
  let accumulator = 0;
  const reported = new Set<string>();
  const tick = (ticker: Ticker): void => {
    let frameDt = ticker.deltaMS / 1000;
    if (frameDt > MAX_FRAME_DT) frameDt = MAX_FRAME_DT;
    accumulator += frameDt;
    while (accumulator >= SIM_DT) {
      // DECREMENT FIRST — load-bearing, not style. `guard` swallows the throw
      // that used to escape this loop entirely, so a decrement placed after the
      // call would never run on a throwing tick and the condition would never
      // clear: a hung tab, strictly worse than the freeze this cycle fixes.
      accumulator -= SIM_DT;
      guard(() => cb.simTick(SIM_DT), 'simTick', cb, reported);
    }
    guard(() => cb.render(accumulator / SIM_DT, frameDt), 'render', cb, reported);
  };
  app.ticker.add(tick);
  return () => app.ticker.remove(tick);
}
