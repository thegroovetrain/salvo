// Token color helpers — the ONE place a numeric 0xRRGGBB design token becomes a
// CSS color string. Pixi consumes tokens as raw numbers; DOM/canvas need strings,
// so these two tiny projectors bridge the gap. No string→number parser exists on
// purpose: tokens are authored as numbers in config.ts (CLIENT_CONFIG.colors) and
// only ever flow numbers → strings, never back.

// Inputs are masked to the low 24 bits (`(n >>> 0) & 0xffffff`) so a stray sign
// bit, alpha byte, or out-of-range number can never produce malformed output.
// (0xffffff here is the RGB channel mask, NOT a color literal — the guard scan
// allowlists it in this file.)

/** 0xRRGGBB → '#rrggbb' (lowercase, always 6 digits). */
export function cssHex(n: number): string {
  return '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0');
}

/** 0xRRGGBB + alpha [0,1] → 'rgba(r, g, b, a)' — the token's alpha variant.
 *  Alpha is clamped to [0,1]; the color is masked to 24 bits. */
export function cssRgba(n: number, alpha: number): string {
  const v = (n >>> 0) & 0xffffff;
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
