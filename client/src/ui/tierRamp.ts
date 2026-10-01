// THE ABSOLUTE TIER RAMP — one source for every DOM surface that tints a tier.
//
// Moved out of `upgradeMenu.ts` (Story 8.21) so the refit card and the results
// modal's LOADOUT block read the SAME five strings; `upgradeMenu.ts` re-exports
// `LINEAGE_TIERS` so its existing importers are untouched. The rationale for the
// ramp itself (the loot-tier convention, Eric ruling 2026-08-19; ABSOLUTE, not
// normalized) stays on the re-export in `upgradeMenu.ts`. The Pixi bar's twin is
// `TIER_COLORS` in `render/hotbar.ts` — the same five tokens as numbers.

/** Tier I..V on the absolute ramp: green / blue / purple / red / gold. */
export const LINEAGE_TIERS: readonly string[] = [
  'var(--hc-phosphor)', // I   — green
  'var(--hc-info)', // II  — blue
  'var(--hc-storm-readout)', // III — purple
  'var(--hc-denied)', // IV  — red
  'var(--hc-amber)', // V   — gold
];

const ROMAN: readonly string[] = ['I', 'II', 'III', 'IV', 'V'];

/** Clamp a tier onto the ramp's five rungs (1..5); a non-finite tier reads I. */
function clampTier(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(Math.trunc(n), 1), ROMAN.length);
}

/** Pure: the Roman numeral for a tier, clamped to I..V. */
export function romanTier(n: number): string {
  return ROMAN[clampTier(n) - 1];
}

/** Pure: the ramp colour for a tier, clamped to I..V. */
export function tierTint(n: number): string {
  return LINEAGE_TIERS[clampTier(n) - 1];
}
