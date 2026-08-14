// Home tagline pool (cycle 87, Eric ruling 2026-08-14) — replaces the fixed
// "LAST HULL FLOATING WINS" wordmark line with a random nautical pun, redrawn
// on every mount (and therefore on every return to port, since returnToPort()
// is a full location.reload() — see app/returnToPort.ts). Pure, zero imports,
// no DOM: makeWordmark() in ui/home.ts is the only consumer.
//
// The pool is Eric-approved copy, verbatim — exact casing, punctuation and
// ASCII apostrophes as reviewed. Do not reword, reorder, trim, or add entries
// without a fresh ruling; two candidates ("WHAT A LOAD OF SHIP",
// "LET'S GET SHIPFACED") were explicitly excluded and must stay out.
export const HOME_TAGLINES: readonly string[] = Object.freeze([
  'SEAS THE DAY',
  'WATER YOU WAITING FOR?',
  'HULL OF A GOOD TIME',
  'OH BUOY, HERE WE GO',
  'PIER PRESSURE',
  'SHIP HAPPENS',
  'NAUTI BY NATURE',
  "FOR FLOAT'S SAKE",
  'RUDDER NONSENSE',
  'KEEL WELL SOON',
  'SINK OR SWIM. MOSTLY SINK.',
  'ALL HANDS ON DECK. BRIEFLY.',
  'ABANDON SHIP RESPONSIBLY',
  'YOUR HULL, THEIR PROBLEM',
  'WE HAVE A SINKING FEELING',
  'BUOYANCY IS TEMPORARY',
  'NO SHIP LASTS FOREVER',
  'THE SEA ALWAYS COLLECTS',
  'SOMEONE HAS TO SINK FIRST',
  'DAMAGE CONTROL IS A MINDSET',
]);

/**
 * Draw uniformly from HOME_TAGLINES. `rand` is injectable (default
 * Math.random — legal here, this is DOM chrome, not sim code) so tests are
 * deterministic. For rand() in [0,1) the draw is exactly uniform: each index k
 * owns the bin [k/20, (k+1)/20).
 *
 * The index is clamped into range on BOTH sides, and non-finite draws fall back
 * to the first entry. Review gate (cycle 85): the only production caller passes
 * the default Math.random, so no live path can reach the degenerate cases — but
 * this function is exported and annotated `: string`, and an unguarded
 * NaN/negative draw would hand back `undefined` in violation of its own return
 * type. Cheap to make honest, so it is.
 */
export function pickTagline(rand: () => number = Math.random): string {
  const raw = Math.floor(rand() * HOME_TAGLINES.length);
  const idx = Number.isFinite(raw) ? Math.min(HOME_TAGLINES.length - 1, Math.max(0, raw)) : 0;
  return HOME_TAGLINES[idx];
}
