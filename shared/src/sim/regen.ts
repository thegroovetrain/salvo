// PASSIVE HEALING (Story 10.5, Eric 2026-11-05, epic-10 amendment 11, R8,
// verbatim: *"Also we need to add back in the 2% missing HP passive healing
// after 30 seconds of not taking damage. It wont make combat any less deadly,
// but it will allow ships who survive to recover."*).
//
// THE LAW, the whole of it: a hull that has lost no hull hp for
// `CONFIG.regen.outOfCombatMs` (15 s — Eric first said 30 s, then "Make it 15,
// 30 was too long.") heals `CONFIG.regen.missingPctPerS`
// (2 %) of its MISSING hp per second, every tick, until the next blow that
// removes hull hp restarts the wait. The clock is the hull's last-damaged
// stamp — ANY source, storm included. FIXED for every hull: not a stat, no
// card, no index, no ability scales it; HULL REPAIR neither resets the wait
// nor is reset by it (both apply).
//
// It supersedes epic-10 amendments 6(b)(6) and 8's "passive healing dies"; the
// PASSIVE HEALING card ladder Story 10.3 deleted stays deleted.
//
// The server's heal step is the only caller that mutates hp; the client learns
// hp from frames and never predicts the trickle. Pure, deterministic, zero
// I/O — the caller passes its clock.

import { CONFIG } from '../constants.js';
import { hullIsFull } from './hull.js';

/**
 * Has the hull been out of combat long enough to heal? `lastDamagedAt` is the
 * server-clock time of the last blow that removed hull hp (the hull's spawn
 * time, or 0, before any). FAIL CLOSED: a non-finite clock or stamp is not
 * due.
 */
export function regenDue(now: number, lastDamagedAt: number): boolean {
  return now - lastDamagedAt >= CONFIG.regen.outOfCombatMs;
}

/**
 * hp a DUE hull gains over `dtS` seconds: `missing × missingPctPerS × dtS`,
 * where `missing = maxHp − hp` — so it is proportional to what is MISSING,
 * slows as the hull fills, and is 0 on a full one.
 *
 * THE LAST POINT SNAPS (epic-8 amendment 53, sim/hull.ts `hullIsFull`): a
 * missing-fraction heal closes the gap geometrically and would never reach
 * full on its own, so once under 1 hp is missing the gain is the WHOLE
 * remainder. A non-finite or non-positive input gains nothing.
 *
 * The caller checks `regenDue` first; this function knows no clock.
 */
export function regenGain(hp: number, maxHp: number, dtS: number): number {
  const missing = maxHp - hp;
  if (!(missing > 0) || !(dtS > 0)) return 0; // also catches NaN
  if (hullIsFull(hp, maxHp)) return missing;
  return Math.min(missing, missing * CONFIG.regen.missingPctPerS * dtS);
}
