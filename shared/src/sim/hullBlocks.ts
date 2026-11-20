// THE HULL HEALTH STEP (Story 12.3, Eric 2026-11-18, epic-12 amendment 2(e) +
// (g)) — how much of an enemy hull's health crosses the wire: a STEP, never
// the hp, a fraction or a damage amount. The server fills `Contact.hb` with
// it on the sighted contact row; the client draws its own hull's bar from the
// same function over `OwnShip.hp`. Pure over plain numbers: no I/O, no
// transcendentals.

import { CONFIG } from '../constants.js';

/** The steps a hull bar can show: 1..CONFIG.hullBar.blocks. */
export type HullBlocks = 1 | 2 | 3 | 4;

/**
 * Blocks lit for a hull at `hp` of `maxHp`: `min(blocks, floor(blocks × f) + 1)`
 * with `f = hp / maxHp` and `blocks = CONFIG.hullBar.blocks`. Each step is an
 * EXCLUSIVE LOWER BOUND FOR THE BETTER STATE — exactly `maxHp × k / blocks`
 * still shows `k + 1` — the same reading as `CONFIG.damageBands` ("frac < x"),
 * so at four blocks the bar drops to 2 the instant wounded smoke starts and
 * to 1 the instant fire starts. `f` is formed exactly as the smoke emitter
 * forms it (`hp / maxHp`, then scaled), so the two can never disagree by a
 * rounding step.
 *
 * NEVER 0, NEVER ABSENT: a hull at `hp <= 0` is SINKING, still a contact for
 * its whole window, and reads 1 — the same step as any afloat hull under the
 * last threshold, so the step discloses nothing about the window (epic-5
 * amendment 16). A non-finite fraction (a NaN hp, a zero or NaN `maxHp`)
 * fails to 1 as well, never to a full bar. Over-full hp caps at `blocks`.
 */
export function hullBlocks(hp: number, maxHp: number): HullBlocks {
  const blocks = CONFIG.hullBar.blocks;
  const step = Math.floor(blocks * (hp / maxHp)) + 1;
  if (!(step > 1)) return 1; // hp <= 0, or a NaN fraction
  return Math.min(blocks, step) as HullBlocks;
}
