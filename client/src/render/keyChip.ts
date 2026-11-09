// THE key-chip glyph color — ONE key-glyph family for the whole scheme (UX-DR33:
// "every key glyph — slot keys, card picks, helm keys — renders in the same
// mono chip family so the scheme reads as one system").
//
// Story 2.4 extracted the hotbar's private chip drawer here so the hotbar's slot
// keys and the helm keys were the same object. Story 10.10 retired the hotbar;
// the weapons console draws its own chip BOXES (they grow with their glyph) and
// keeps the one shared rule left: the glyph's fill per selection state.

import { CLIENT_CONFIG } from '../config.js';

const C = CLIENT_CONFIG.colors;

/** Pure: the glyph fill for a chip — void knocked out of the amber fill when
 *  selected, phosphor otherwise. */
export function keyChipGlyphColor(selected: boolean): number {
  return selected ? C.void : C.phosphor;
}
