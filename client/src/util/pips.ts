// Pip-scale mapping (Story 1.14; objective rework Eric ruling 2026-08-03) — the
// ONE pure function that turns a raw class stat into a filled-pip count for the
// class-select cards + home chip. Anchors (CLIENT_CONFIG.home.pip) are ABSOLUTE
// OBJECTIVE LADDERS: 1 pip = the anchor's `base` value, each additional pip is
// `+step` — not a relative fraction of some class-roster maximum, so a hull's
// pips never shift when the class roster changes AND the number is meaningful
// on its own (e.g. "4 pips" always means the same knot value). Kept color/
// DOM-agnostic and pure so the tokens guard has nothing to scan and the
// mapping is unit-testable.

/** A per-stat objective ladder: 1 pip = `base`, each further pip = `+step`. */
export interface PipAnchor {
  base: number;
  step: number;
}

/**
 * Filled-pip count in [1, 5] for `value` against an absolute objective ladder
 * `anchor`: `clamp(1 + round((value − base) / step), 1, 5)`. A value at or
 * below `base` still shows 1 (a class is never rendered blank); a value at or
 * above the 5-pip rung (`base + 4*step`) fills all 5.
 * A degenerate scale (`step <= 0`) or a non-finite `value` is treated as the
 * minimum single pip — never blank.
 */
export function pipFill(value: number, anchor: PipAnchor): number {
  if (!(anchor.step > 0) || !Number.isFinite(value)) return 1;
  const raw = 1 + Math.round((value - anchor.base) / anchor.step);
  return Math.min(5, Math.max(1, raw));
}
