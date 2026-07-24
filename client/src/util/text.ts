// Callsign display helpers — the single source of the 14-char display cap and
// the surrogate-safe mid-ellipsis. Both the kill feed (ui/killFeed.ts) and the
// on-water nameplates (render/nameplates.ts) consume these, so a name is capped
// and ellipsized identically wherever it renders. The menu enforces the SAME cap
// at entry (input.maxLength + sanitizeName), so ellipsizeName only ever catches
// a legacy / hostile over-length roster name (the server never length-caps).

/** Callsign display cap (code points). Longer names mid-ellipsize to exactly this. */
export const NAME_MAX = 14;

/**
 * Mid-ellipsize a callsign longer than NAME_MAX to EXACTLY NAME_MAX code points,
 * including the single '…' — 7 head + '…' + 6 tail (= 14). Slices on CODE POINTS
 * (Array.from), not UTF-16 units, so an emoji or other astral-plane glyph is
 * never split into a lone surrogate. Shorter names pass through unchanged.
 * Callsigns are capped at entry too (menu), so this only catches legacy
 * over-length names.
 */
export function ellipsizeName(name: string): string {
  const cps = [...name];
  if (cps.length <= NAME_MAX) return name;
  return cps.slice(0, 7).join('') + '…' + cps.slice(-6).join('');
}
