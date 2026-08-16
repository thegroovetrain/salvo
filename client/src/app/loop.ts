// The single render loop: one Pixi ticker containing a fixed-step accumulator
// (not two loops). Simulation advances in fixed SIM_DT steps for determinism
// (matches the server tick + future client prediction); rendering interpolates
// between the last two sim states by the leftover-accumulator alpha.
//
// FAULT CONTAINMENT (cycle 91) — this file is the client's only equivalent of
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

/**
 * A best-effort rate-limit key. EVERY read of `err` here is hostile territory:
 * `String(err)` throws on a null-prototype object, `err.message` throws on an
 * Error subclass with a throwing getter, and even `err instanceof Error` throws
 * on a Proxy with a throwing `getPrototypeOf` trap. Callers must treat this as
 * fallible.
 */
function reportKey(err: unknown, phase: LoopPhase): string {
  const detail = err instanceof Error ? err.message : String(err);
  return `${phase}:${String(detail)}`;
}

/**
 * Rate-limited one-shot report per distinct (phase, message) signature.
 *
 * THE WHOLE BODY IS CONTAINED, not just the hook call (cycle 91 review gate).
 * `report` runs inside `guard`'s CATCH block, so anything that throws in here
 * escapes `guard`, escapes the while-loop, escapes `tick`, and kills the ticker
 * — re-arming the exact bug this module exists to prevent, from inside the
 * containment code. Reading a thrown value is not safe (see reportKey), and
 * `cb.onError` may itself be a throwing getter, so the property access lives
 * inside the try too. The last-resort fallback deliberately logs NO part of
 * `err`: at that point we have proven that touching it throws.
 */
function report(err: unknown, phase: LoopPhase, cb: LoopCallbacks, reported: Set<string>): void {
  try {
    const key = reportKey(err, phase);
    if (reported.has(key)) return;
    // The cap is PER PHASE (review gate): a global one let eight distinct
    // simTick signatures permanently silence the very first render failure.
    let seen = 0;
    for (const k of reported) if (k.startsWith(`${phase}:`)) seen += 1;
    if (seen >= MAX_REPORTED) return;
    reported.add(key);
    // The caller's hook REPLACES the fallback rather than adding to it, so one
    // throw produces one line.
    const hook = cb.onError;
    if (hook === undefined) {
      console.error(`[loop] ${phase} failed — the loop continues`, err);
      return;
    }
    hook(err, phase);
  } catch {
    try {
      console.error(`[loop] ${phase} failed, and reporting it threw too — the loop continues`);
    } catch {
      /* nothing left to try; the loop must still survive */
    }
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
      // DECREMENT FIRST — defensive, NOT load-bearing. An earlier draft of this
      // comment claimed a decrement below the call would hang the tab; that is
      // WRONG and the review gate caught it: `guard` catches, so control returns
      // normally and a trailing decrement would run exactly as before. The
      // ordering matters only if something ever escapes `guard` — which `report`
      // now goes to some length to prevent — so this is belt-and-braces against
      // that one residual path, and nothing else. Do not restate it as a law.
      accumulator -= SIM_DT;
      guard(() => cb.simTick(SIM_DT), 'simTick', cb, reported);
    }
    guard(() => cb.render(accumulator / SIM_DT, frameDt), 'render', cb, reported);
  };
  app.ticker.add(tick);
  return () => app.ticker.remove(tick);
}
