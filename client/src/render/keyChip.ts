// THE key-chip drawer — ONE key-glyph family for the whole scheme (UX-DR33:
// "every key glyph — slot keys, card picks, helm keys — renders in the same
// mono chip family so the scheme reads as one system").
//
// Extracted VERBATIM from render/hotbar.ts's private drawKeyChip (Story 2.4) so
// the hotbar's slot keys and the vitals cluster's helm keys are the same object,
// not two look-alikes that drift. The extraction is behavior-neutral: the box
// geometry, the two skins (filled amber when SELECTED, phosphor .55 outline
// otherwise), the glyph style, and the knocked-out void glyph are byte-identical
// to the hotbar's pre-extraction output.

import type { Graphics } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';

const C = CLIENT_CONFIG.colors;

/** Chip square (px) — the one size every key glyph uses. */
export const KEY_CHIP_SIZE = CLIENT_CONFIG.hotbar.keyChip;

/** The chip's mono glyph style (14px phosphor — amendment 16's de-grey). The
 *  SELECTED chip overrides the fill with `keyChipGlyphColor(true)`. */
export const KEY_CHIP_STYLE = {
  fontFamily: CLIENT_CONFIG.type.mono,
  fontSize: 14,
  fill: C.phosphor,
  letterSpacing: 0,
} as const;

/**
 * Draw one chip's BOX at (x, y). `selected` fills it amber (the selection
 * channel — the hotbar's primed slot); otherwise it is a phosphor .55 hairline
 * outline. The caller owns the GLYPH Text (position, alpha, diffed assignment);
 * this only paints the box into a Graphics.
 */
export function drawKeyChipBox(g: Graphics, x: number, y: number, selected = false, size = KEY_CHIP_SIZE): void {
  if (selected) {
    g.rect(x, y, size, size).fill({ color: C.amber, alpha: 1 });
    g.rect(x, y, size, size).stroke({ width: 1, color: C.amber, alpha: 1 });
    return;
  }
  g.rect(x, y, size, size).stroke({ width: 1, color: C.phosphor, alpha: 0.55 });
}

/** Pure: the glyph fill for a chip — void knocked out of the amber fill when
 *  selected, phosphor otherwise. */
export function keyChipGlyphColor(selected: boolean): number {
  return selected ? C.void : C.phosphor;
}
