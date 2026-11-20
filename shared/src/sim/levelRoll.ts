// THE LEVEL STAT ROLL (Eric 2026-11-19, Story 12.4, epic-12 amendment 5(b)):
// every completed level rolls a die once for each stat in
// `CONFIG.xp.statRoll.indices` and adds the face to that stat's bonus index
// points (`IndexBonus`, folded by `effectiveStats()`). *"Treat it like a dice
// roll, where the faces are 0, 0, 1, 1, 2, 3."* Pure, deterministic, zero
// I/O: the caller hands in its own isolated stream (never a ship's offer
// stream).

import { CONFIG, type IndexId } from '../constants.js';

/** The roll's dials (`CONFIG.xp.statRoll`), widened for fixtures and
 *  `--tune` overrides. */
export interface StatRollConfig {
  readonly faces: readonly number[];
  readonly indices: readonly IndexId[];
}

/** Is `n` a face the die may show? A non-negative integer. */
function isFace(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

/**
 * ONE ROLL OF THE DIE: face `faces[floor(u × faces.length)]`. FAIL-CLOSED —
 * a non-finite `u` or one outside [0, 1), an empty face list, or a junk face
 * (non-finite, negative or fractional) counts 0, never NaN or a fraction.
 */
export function rollDie(u: number, faces: readonly number[]): number {
  if (!(u >= 0 && u < 1) || faces.length === 0) return 0;
  const face = faces[Math.floor(u * faces.length)];
  return isFace(face) ? face : 0;
}

/**
 * ONE LEVEL'S ROLL: exactly ONE `rng.next()` per stat in `cfg.indices`, in
 * list order (the stream contract a seeded replay depends on), each through
 * `rollDie`. Returns only the stats that rolled a non-zero face, as
 * `[stat, points]` pairs in list order.
 */
export function rollLevelStats(rng: { next(): number }, cfg: StatRollConfig = CONFIG.xp.statRoll): Array<[IndexId, number]> {
  const out: Array<[IndexId, number]> = [];
  for (const stat of cfg.indices) {
    const face = rollDie(rng.next(), cfg.faces);
    if (face > 0) out.push([stat, face]);
  }
  return out;
}
