// A hull's EFFECTIVE truesight — THE one derivation of "how far can this ship
// actually see right now" (Story 8.17, Eric ruling 2026-09-29, epic-8
// amendment 132).
//
// A FLASH SHELLS burst dazzles every non-friendly hull inside it for
// `CONFIG.flashShells.durationMs`; while dazzled, a hull's truesight collapses
// to ONE EIGHTH OF ITS INTEL (radar) RANGE — `radarRange ×
// CONFIG.flashShells.sightFraction`, 82.5 u at the base 660 u radar. It
// replaces the old star-shell DAZZLE verb's ×0.5-of-sight factor.
//
// WHY IT LIVES IN SHARED: the server's perception (`sightOf`) and every client
// mirror of the shrunken bubble — the fog hole, the radar dim mask, the
// projectile cull and prediction — must land on the SAME number, and three
// client mirrors of the server's sight have desynced before (epic-4
// amendments). One pure function both sides call is the only way they stay
// equal; nothing re-derives it per side.
//
// SMOKE (Story 8.18's in-smoke 1/8 rule) is DELETED (Story 9.3): a
// countermeasure cloud never touches sight — since Story 9.3 session 2 (Eric
// 2026-10-12) it is a client overlay that hides nothing.
//
// Radar range itself is NEVER touched: dazzle blinds, it does not deafen.
//
// Pure, zero I/O.

import { CONFIG } from '../constants.js';
import type { EffectiveStats } from './stats.js';

/**
 * u — the truesight radius a hull actually has: its derived `sightRange`, or
 * `radarRange × CONFIG.flashShells.sightFraction` while dazzled.
 * `dazzled` is the caller's own "is `dazzledUntil` still in the future" answer
 * (the server reads its clock, the client its server-clock estimate) — this
 * function never reads a clock.
 */
export function effectiveSight(stats: Pick<EffectiveStats, 'sightRange' | 'radarRange'>, dazzled: boolean): number {
  if (dazzled) return stats.radarRange * CONFIG.flashShells.sightFraction;
  return stats.sightRange;
}
