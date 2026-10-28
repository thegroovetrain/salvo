// The loadout row grammar, a LEAF module: the numbers the class card's loadout
// rows and the CONSUMABLES row/picker (ui/kitPicker.ts) share. They live here
// so kitPicker never imports classSelect (which imports kitPicker).

/** The card's inner content width (px): 356 − 2 × 22 padding. */
export const CARD_INNER_PX = 356 - 2 * 22;
/** The loadout row grammar: key column, key→value gap, value type. */
export const LOADOUT_KEY_COL_PX = 108;
export const LOADOUT_KEY_GAP_PX = 10;
export const LOADOUT_KEY_TRACKING_EM = 0.14;
export const LOADOUT_VALUE_PX = 20;
export const LOADOUT_VALUE_TRACKING_EM = 0.05;
