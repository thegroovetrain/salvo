// THE SHIP-CLASS DISPLAY NAMES — a leaf module with no DOM and no render
// imports, so a Pixi HUD surface (the SHIP tooltip of epic-8 amendment 186
// until Story 10.10) can read the same table the class-select screen, home and
// results print without importing the class-select screen itself.
// Re-exported by ui/classSelect.ts, its original home.
//
// THE NAMES ARE ERIC'S (Story 10.4): YAMATO, BISMARCK, HMS WARSPITE, USS IOWA
// — plain uppercase.

import type { ShipClassId } from '@salvo/shared';

/** One-word display names the ship-class id can't produce. */
export const CLASS_DISPLAY_NAMES: Record<ShipClassId, string> = {
  yamato: 'YAMATO',
  bismarck: 'BISMARCK',
  warspite: 'HMS WARSPITE',
  iowa: 'USS IOWA',
};
