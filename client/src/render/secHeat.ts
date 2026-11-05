// THE SECONDARIES HEAT SQUARE's pure core (Story 10.4 wave 2c — the minimum
// readable readout, NOT a final HUD: epic-10 amendment 8(o), a full UI pass is
// coming). One keyless square in the HUD bar's hotbar grammar, directly after
// the gun (render/hudBar.ts `sec`), painted by render/hotbar.ts.
//
// The grammar is borrowed whole, nothing new: the square wears the hotbar's
// READY-WEAPON skin while the guns can fire and its DENIED skin while they are
// overheated (`locked` — R3: dark until heat is back to zero); a vertical fill
// rises from the floor with the heat in the skin's own color (phosphor, or the
// denied red while locked) — the held-fire drain's fill grammar, rising instead
// of draining; the glyph is the machine-gun glyph (the secondaries fire today's
// machine-gun round). The chip is a GHOST, like the gun's: the secondaries have
// no key (right mouse), and no new label string is invented.
//
// Pure, no Pixi: the heat → look mapping is what the tests measure.

import type { SecondariesHeat } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

const C = CLIENT_CONFIG.colors;

/** The hotbar skin the square borrows (render/hotbar.ts `SlotState`). */
export type SecSkinState = 'readyWeapon' | 'denied';

/** One frame of the heat square. */
export interface SecHeatLook {
  /** The hotbar skin for the frame and glyph. */
  state: SecSkinState;
  /** The heat fill's height as a fraction of the square, [0, 1]. */
  fill: number;
  /** The heat fill's color (the skin's accent: phosphor, or denied while locked). */
  color: number;
}

/** [0, 1] clamp; NaN reads as 0. */
function clamp01(v: number): number {
  if (!(v > 0)) return 0;
  return v > 1 ? 1 : v;
}

/**
 * Pure: the heat square's look. `sec` null (no own secondaries state yet) reads
 * as cold. Heat maps straight to the fill height; LOCKED switches frame, glyph
 * and fill to the denied red for as long as the lock holds — it releases only
 * at zero heat (R3), so a locked square drains red to empty and then goes back
 * to phosphor.
 */
export function secHeatLook(sec: SecondariesHeat | null): SecHeatLook {
  const locked = sec !== null && sec.locked;
  return {
    state: locked ? 'denied' : 'readyWeapon',
    fill: clamp01(sec?.heat ?? 0),
    color: locked ? C.denied : C.phosphor,
  };
}
