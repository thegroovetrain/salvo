// The SINKING DEMO (Story 10.13 round 3): the klaxon repeating while the real
// SinkFade insert (audio/sinkFade.ts) closes over it, a water rush rises and
// fades, and everything ends in silence. Shared by the page and the offline
// self-test, so both exercise the same code.

import { Synth } from '../../src/audio/synth/render.js';
import { SinkFade } from '../../src/audio/sinkFade.js';
import type { CueRecipe } from '../../src/audio/synth/recipe.js';
import { KLAXON_SERIES_ONSETS_MS, KLAXON_STEP_S, SINKING_DEMO_S } from '../../src/audio/synth/candidates/index.js';

/** Progress updates per second of the demo (the game would update per frame). */
const UPDATES_PER_S = 10;

/** Schedule the whole demo from now; returns the insert so the caller can release it after `SINKING_DEMO_S`. */
export function scheduleSinkingDemo(ctx: BaseAudioContext, sink: AudioNode, recipe: CueRecipe, rand?: () => number): SinkFade {
  const fade = new SinkFade(ctx);
  fade.output.connect(sink);
  const synth = new Synth(ctx, fade.input);
  for (let t = 0; t < SINKING_DEMO_S; t += KLAXON_STEP_S) synth.play(recipe, { delayS: t, rand });
  const steps = SINKING_DEMO_S * UPDATES_PER_S;
  const now = ctx.currentTime;
  for (let i = 0; i <= steps; i++) fade.update(i / steps, now + i / UPDATES_PER_S);
  return fade;
}

/** The ×3 series delays (hull under a quarter), seconds. */
export const KLAXON_SERIES_S = KLAXON_SERIES_ONSETS_MS.map((ms) => ms / 1000);
