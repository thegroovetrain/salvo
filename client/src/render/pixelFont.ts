// THE 5×7 PIXEL FONT (Story 12.3, Eric 2026-11-18: "I want to see the names
// always but the smallest it can be is a 4x8 size" → "5x7 font minimum?" → "I
// like it"). When the fitted name would drop under `nameplate.floorPx`, every
// name switches together to this: a 5×7 glyph in a 6×8 cell (1 px gaps), one
// SCREEN px per font pixel, centered, no smoothing. It is the floor — the name
// never gets smaller and never hides, and may be wider than its bracket.
//
// THE GLYPH TABLE is the approved bench's `PIX` (v13), verbatim, plus `.` and
// `'` (the story's "add if cheap"). Coverage, a reading of record for Eric's
// veto: A–Z, 0–9, `_`, `-`, space, `.`, `'`. Accented letters FOLD to their
// base letter (NFD, combining marks stripped); a name still holding a
// character outside the table (emoji, CJK, …) is not drawn here at all — the
// plate draws it in the mono at the floor size instead (`pixelFontCovers`).
//
// Pure: no Pixi, no state. The plate builds each name's pixels ONCE at latch.

/** Glyph width / cell width / cell height (px). */
export const GLYPH_W = 5;
export const GLYPH_H = 7;
export const CELL_W = 6;
export const CELL_H = 8;

const RAW: Readonly<Record<string, string>> = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110', D: '11100 10010 10001 10001 10001 10010 11100',
  E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110', J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 10001 01010 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111', 3: '11111 00010 00100 00010 00001 10001 01110',
  4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110', 9: '01110 10001 10001 01111 00001 00010 01100',
  _: '00000 00000 00000 00000 00000 00000 11111', '-': '00000 00000 00000 11111 00000 00000 00000',
  ' ': '00000 00000 00000 00000 00000 00000 00000',
  '.': '00000 00000 00000 00000 00000 01100 01100', "'": '00100 00100 01000 00000 00000 00000 00000',
};

/** The table with the row spaces stripped: 35 '0'/'1' chars per glyph, row-major. */
const PIX: ReadonlyMap<string, string> = new Map(Object.entries(RAW).map(([k, v]) => [k, v.replace(/ /g, '')]));

/** Pure: fold accented letters to their base letter (NFD, strip combining
 *  marks), then uppercase — the plate text is uppercase already. */
export function foldName(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
}

/** Pure: can the pixel font draw every character of `s` (after the fold)? */
export function pixelFontCovers(s: string): boolean {
  for (const ch of foldName(s)) if (!PIX.has(ch)) return false;
  return true;
}

/** Pure: the drawn width (px) of `n` characters — n cells, less the last gap. */
export function pixelTextWidth(n: number): number {
  return n > 0 ? n * CELL_W - (CELL_W - GLYPH_W) : 0;
}

/**
 * Pure: the lit pixels of `s` (folded) as flat [x0, y0, x1, y1, …], x from
 * the text's left edge, y from its top row (0..GLYPH_H − 1). A character
 * outside the table draws as a blank cell (callers check `pixelFontCovers`
 * first and never get here with one).
 */
export function pixelCells(s: string): number[] {
  const out: number[] = [];
  let cx = 0;
  for (const ch of foldName(s)) {
    const g = PIX.get(ch);
    if (g !== undefined) {
      for (let i = 0; i < g.length; i++) if (g[i] === '1') out.push(cx + (i % GLYPH_W), Math.floor(i / GLYPH_W));
    }
    cx += CELL_W;
  }
  return out;
}

/**
 * Pure: the glow ring around a set of lit pixels — every pixel within
 * Chebyshev distance `reach` of a lit one that is neither lit nor within
 * `inner` of one (so stacked rings never double-paint a pixel). Flat
 * [x, y, …] like `pixelCells`.
 */
export function pixelRing(cells: readonly number[], reach: number, inner: number): number[] {
  const lit = new Set<number>();
  const KEY = 4096; // packs (x, y) with headroom for a negative offset
  const key = (x: number, y: number): number => (y + KEY / 2) * KEY + (x + KEY / 2);
  for (let i = 0; i < cells.length; i += 2) lit.add(key(cells[i], cells[i + 1]));
  const near = (x: number, y: number, r: number): boolean => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (lit.has(key(x + dx, y + dy))) return true;
    return false;
  };
  const out: number[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < cells.length; i += 2) {
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = cells[i] + dx;
        const y = cells[i + 1] + dy;
        const k = key(x, y);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!near(x, y, inner)) out.push(x, y);
      }
    }
  }
  return out;
}
