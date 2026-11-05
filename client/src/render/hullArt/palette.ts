// THE SKIN + RELATION PALETTE for the hull art (Story 10.4 wave 2c). Two rules,
// epic-10 amendments 7(k) and 7(m): every FILL is the hull's skin (only the
// Default skin ships in 10.4 — R6), every LINE is the one relation color the
// caller hands in. Pure; the colors themselves live in CLIENT_CONFIG.skins.

import type { ShipClassId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../config.js';
import type { FillKey } from './shapes.js';

const SK = CLIENT_CONFIG.skins;

/** Pure: the Default skin's packed color for a fill slot on hull `id`. */
export function skinFill(id: ShipClassId, key: FillKey): number {
  const s = SK.default[id];
  switch (key) {
    case 'tier1':
      return s.tier[0];
    case 'tier2':
      return s.tier[1];
    case 'tier3':
      return s.tier[2];
    case 'funnelMouth':
      return SK.funnelMouth;
    default:
      return s[key];
  }
}
