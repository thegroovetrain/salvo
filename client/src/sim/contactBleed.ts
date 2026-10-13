// HULL CONTACT BLEED (Story 9.5, epic-9 amendments 79 + 83): how hard the own
// hull is grinding against something on the predictor's last live tick. Pure;
// read by render/contactFx.ts (the grind tone) and by main.ts, which stamps
// `state.contactBleeding` for net/roomBindings.ts flushDamage (a windowed bleed
// `dmg` plays no thud and no shake while the grind tone is the cue).
//
// A HULL row bleeds by `vt + vn`: sliding along the other hull AND pressing
// into it both grind (amendment 83: a sustained push bleeds like a scrape).
// LAND bleeds by sliding only — the coast's tangential share of the own speed.

import type { HullContact } from '@salvo/shared';

/** The own hull's land contact as the bleed needs it (Predictor.lastLand). */
export interface BleedLand {
  contact: boolean;
  headOn: number;
  /** u/s — |speed| before the grounding damp. */
  speed: number;
}

/** u/s — the fastest bleed this tick: any hull row's `vt + vn`, or the coast's
 *  tangential share of the own speed while on land. */
export function bleedSpeed(contacts: readonly HullContact[], land: BleedLand): number {
  let v = land.contact ? land.speed * Math.sqrt(Math.max(0, 1 - land.headOn * land.headOn)) : 0;
  for (const c of contacts) if (c.vt + c.vn > v) v = c.vt + c.vn;
  return v;
}
