// Pip-scale mapping (Story 1.14) — the ONE pure function that turns a raw class
// stat into a filled-pip count for the class-select cards + home chip. Anchors
// are ABSOLUTE (CLIENT_CONFIG.home.pip — Eric ruling 2026-07-24), so a hull's
// pips never shift when the class roster changes. Kept color/DOM-agnostic and
// pure so the tokens guard has nothing to scan and the mapping is unit-testable.

/**
 * Filled-pip count in [1, 5] for `value` against an absolute `anchorMax`:
 * `clamp(round(value / anchorMax * 5), 1, 5)`. A value at or above the anchor
 * fills all 5; a zero/tiny value still shows 1 (a class is never rendered blank).
 * `anchorMax <= 0` is treated as a degenerate scale → the minimum single pip.
 */
export function pipFill(value: number, anchorMax: number): number {
  if (!(anchorMax > 0) || !Number.isFinite(value)) return 1;
  const raw = Math.round((value / anchorMax) * 5);
  return Math.min(5, Math.max(1, raw));
}
