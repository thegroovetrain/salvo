// THE OWN ACCENT (Story 10.4, Eric's ruling R6). The Color Hoist and its 20-hue
// wheel are gone; the port chrome that wore the player's personal hue — the
// class-select selection (card border, name, pips, chips, picker accent), the
// home class chip and the callsign field — wears the OWN relation color instead
// (render/relationColor.ts), the same cyan the own hull is drawn in. A fixed
// value, so there is nothing to pick, persist or subscribe to.

import { relationFill, relationStroke } from '../render/relationColor.js';
import { cssHex, textSafe } from '../util/color.js';

/** The accent surface the port chrome paints with (the retired hoist's shape). */
export interface OwnAccent {
  /** The accent as CSS (outlines, borders). */
  readonly accent: string;
  /** The accent as a raw 0xRRGGBB number (for `cssRgba` glows). */
  readonly accentValue: number;
  /** The accent rendered as TEXT — WCAG-lifted via `textSafe`. */
  readonly accentText: string;
  /** The dark interior fill as CSS (silhouette fills). */
  readonly accentFill: string;
}

const OWN = relationStroke('own');

export const OWN_ACCENT: OwnAccent = {
  accent: cssHex(OWN),
  accentValue: OWN,
  accentText: cssHex(textSafe(OWN)),
  accentFill: cssHex(relationFill('own')),
};
