// Token color helpers — the ONE place a numeric 0xRRGGBB design token becomes a
// CSS color string. Pixi consumes tokens as raw numbers; DOM/canvas need strings,
// so these two tiny projectors bridge the gap. No string→number parser exists on
// purpose: tokens are authored as numbers in config.ts (CLIENT_CONFIG.colors) and
// only ever flow numbers → strings, never back.

/** 0xRRGGBB → '#rrggbb' (lowercase, always 6 digits). */
export function cssHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

/** 0xRRGGBB + alpha [0,1] → 'rgba(r, g, b, a)' — the token's alpha variant. */
export function cssRgba(n: number, alpha: number): string {
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
