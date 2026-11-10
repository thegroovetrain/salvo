// THE MONO TYPE MODEL (moved out of ui/refitCardFit.ts by Story 10.10 — the
// refit band retires, the battle consoles keep measuring).
//
// Every HUD and chrome mark in the game is set in ONE monospaced stack, so a
// line's rendered width is simply glyphs × advance. That makes text fit a
// question of arithmetic rather than a canvas measure: exact, headless-safe,
// and free per frame (reading a Pixi `Text`'s bounds forces a measure every
// time its string changes and is unavailable under jsdom).
//
// ui/refitCardFit.ts was deleted with the band (Story 10.10's W3); its callers
// import from here.

/**
 * Mono advance width, in em — THE model constant.
 *
 * Geist Mono (the declared face) advances 0.6 em exactly; the fallback stack
 * ('ui-monospace', SFMono-Regular, Menlo, monospace) tops out at Menlo's
 * 1233/2048 = 0.6021 em. 0.605 covers the whole declared stack with a little
 * room, so a mark that fits the model fits the render on every fallback too.
 */
export const MONO_ADVANCE_EM = 0.605;

/** Advance width (px) of one glyph at a size + letter-spacing. */
export function monoCharWidth(fontPx: number, letterSpacingPx = 0): number {
  return fontPx * MONO_ADVANCE_EM + letterSpacingPx;
}

/** Rendered width (px) of a mono string. Counts CODE POINTS, not UTF-16 units. */
export function monoTextWidth(text: string, fontPx: number, letterSpacingPx = 0): number {
  return [...text].length * monoCharWidth(fontPx, letterSpacingPx);
}

/**
 * Line count a mono string wraps to inside `boxW`. Greedy, whitespace-only
 * breaks (the conservative bound), with a hard chunk break for any single token
 * wider than the box (what `overflow-wrap:anywhere` does). Empty text occupies
 * no lines.
 */
export function monoWrapLines(text: string, fontPx: number, letterSpacingPx: number, boxW: number): number {
  const perLine = Math.max(1, Math.floor(boxW / monoCharWidth(fontPx, letterSpacingPx)));
  let lines = 0;
  let used = 0;
  for (const word of text.split(/\s+/)) {
    const w = [...word].length;
    if (w === 0) continue;
    if (used > 0 && used + 1 + w <= perLine) {
      used += 1 + w;
      continue;
    }
    lines += 1;
    used = w;
    while (used > perLine) {
      lines += 1;
      used -= perLine;
    }
  }
  return lines;
}

/** Widest single unbreakable token (px) in a whitespace-separated string — a
 *  token wider than its box is what makes text paint outside it when
 *  word-breaking is off. */
export function widestToken(text: string, fontPx: number, letterSpacingPx = 0): number {
  let widest = 0;
  for (const word of text.split(/\s+/)) widest = Math.max(widest, monoTextWidth(word, fontPx, letterSpacingPx));
  return widest;
}
