// THE SHIP-CLASS DISPLAY NAMES — a leaf module with no DOM and no render
// imports, so the Pixi HUD's SHIP tooltip (render/slotTooltip.ts, epic-8
// amendment 186) can read the same table the class-select screen, home and
// results print without importing the class-select screen itself.
// Re-exported by ui/classSelect.ts, its original home.
//
// THE NAMES ARE ERIC'S (2026-10-01, epic-8 amendment 204): SPEEDBOAT,
// DREADNOUGHT, REPEATER — plain uppercase, no prefix or suffix. The internal
// ids (`torpedoBoat`, `battleship`, `mineLayer`) are untouched.

import type { ShipClassId } from '@salvo/shared';

/** One-word display names the ship-class id can't produce. */
export const CLASS_DISPLAY_NAMES: Record<ShipClassId, string> = {
  torpedoBoat: 'SPEEDBOAT',
  battleship: 'DREADNOUGHT',
  mineLayer: 'REPEATER',
};
