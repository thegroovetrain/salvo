// SMOKE SCREEN (Story 8.18, catalog-v3 R38, epic-8 amendments 138–145) — a
// key-fired consumable, the LAST live-content stub flipped. One copy opens a
// 5 s LAY WINDOW on the activating hull (`CONFIG.smokeScreen.layMs`): every
// `puffIntervalMs` (500 ms — 10 puffs per copy) World.stepSmoke drops a
// stationary puff at the hull's CENTER (Eric 2026-09-30, amendment 190 — it
// was the stern), born at r0 (82.5 u — 1/8 of intel
// range) and growing to r1 (165 u — 2/8; Eric 2026-09-30) over its whole
// `lifeMs` (30 s), after which it is deleted. A puff is
// "an island for every sensor but radar": signals.ts's ONE `sightClear`
// predicate hides hulls, ordnance, mines, decoys, the mz/sm marks, in-bubble
// torpedo water and muffles the foghorn behind it — and, by Eric's ruling
// 142, hides a hull even under the observer's own flare. Radar is untouched.
//
// A second copy while laying RESTARTS the 5 s clock (ruling 140 — the
// shield/chaff "replaces" posture; the copy is spent). Puffs already laid live
// out their 30 s whatever happens to the hull (amendment 127: everything on
// the water outlives its owner); laying STOPS at sink entry (ruling 144 —
// World resets `smokeUntil` where it nulls the shield), and a NEW press while
// sinking is refused `blocked` here, nothing spent (the ONE SPEND LAW; the
// chaff row's one guard, verbatim). The World owns every write (`setSmokeScreen`
// — the ActivationContext capability); this row keeps only the guard.

import { isAfloat, type LoadoutSlot } from '@salvo/shared';
import type { ActivationContext, ActivationResult } from '../index.js';
import { consumableRow, type ConsumableRow } from './row.js';

function smokeScreenEffect(ctx: ActivationContext, _slot: LoadoutSlot): ActivationResult {
  if (!isAfloat(ctx.ship.lifecycle)) return { ok: false, reason: 'blocked' };
  ctx.setSmokeScreen();
  return { ok: true };
}

export const smokeScreenRow: ConsumableRow = consumableRow('smokeScreen', smokeScreenEffect);
