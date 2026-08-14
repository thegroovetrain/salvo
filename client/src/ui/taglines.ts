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
 * deterministic. Clamped so a degenerate rand() === 1 returns the last entry
 * rather than indexing past the array (undefined).
 */
export function pickTagline(rand: () => number = Math.random): string {
  const idx = Math.min(HOME_TAGLINES.length - 1, Math.floor(rand() * HOME_TAGLINES.length));
  return HOME_TAGLINES[idx];
}
