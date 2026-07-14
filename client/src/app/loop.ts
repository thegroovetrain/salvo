// The single render loop: one Pixi ticker containing a fixed-step accumulator
// (not two loops). Simulation advances in fixed SIM_DT steps for determinism
// (matches the server tick + future client prediction); rendering interpolates
// between the last two sim states by the leftover-accumulator alpha.

import type { Application, Ticker } from 'pixi.js';
import { CONFIG } from '@salvo/shared';

const SIM_DT = CONFIG.tick.simDtMs / 1000; // s
const MAX_FRAME_DT = 0.25; // s — spiral-of-death clamp

export interface LoopCallbacks {
  /** Advance the sim by exactly `dt` (= SIM_DT) seconds. May run 0..N times. */
  simTick(dt: number): void;
  /**
   * Render one frame. `alpha` in [0,1) is the fraction into the next sim step
   * (for interpolation); `frameDt` is the real elapsed time (for smooth,
   * non-authoritative visuals like the camera).
   */
  render(alpha: number, frameDt: number): void;
}

/** Start driving `cb` from the app ticker. The ticker auto-starts on init. */
export function startLoop(app: Application, cb: LoopCallbacks): void {
  let accumulator = 0;
  app.ticker.add((ticker: Ticker) => {
    let frameDt = ticker.deltaMS / 1000;
    if (frameDt > MAX_FRAME_DT) frameDt = MAX_FRAME_DT;
    accumulator += frameDt;
    while (accumulator >= SIM_DT) {
      cb.simTick(SIM_DT);
      accumulator -= SIM_DT;
    }
    cb.render(accumulator / SIM_DT, frameDt);
  });
}
