// A hull's EFFECTIVE truesight — THE one derivation of "how far can this ship
// actually see right now".
//
// Undazzled it is the derived `sightRange`. A FLASH SHELLS burst (Story 8.17,
// epic-8 amendment 132; replaced by the FOULING SHELL in Story 9.4 and
// RESTORED beside it by Story 10.9, Eric 2026-10-27/28, epic-10 amendments 2
// and 4) dazzles every non-owner hull inside it for
// `CONFIG.flashShells.durationMs`; while dazzled, a hull's truesight collapses
// to `sightRange × CONFIG.flashShells.sightFraction` — ruling 1: ONE QUARTER
// OF SIGHT (Eric's equivalence check "1/12 of intel range" holds at today's
// 500 u sight / 1500 u radar). It is a fraction of SIGHT, not of radar: the
// 8.17 cut read `radarRange × 1/8`, and that reading is superseded.
//
// WHY IT STAYS A FUNCTION IN SHARED: it is the single entry point for every
// consumer of "how far can I see" — the server's perception (`sightOf`) and the
// client's mirrors of the bubble (the fog hole, the radar dim mask, the
// projectile cull and prediction). Three client mirrors of the server's sight
// have desynced before (epic-4 amendments); routing them all through one pure
// function both sides call means the dazzle lands in ONE place and nothing
// re-derives it per side.
//
// Radar range is NEVER touched and never an input: dazzle blinds, it does not
// deafen (the radar-anchored rungs — muzzle flash, smoke halo, foghorn — stay
// undazzled; epic-2 amendment 52 "dazzle stays optics-only").
//
// Pure, zero I/O.

import { CONFIG } from '../constants.js';
import type { EffectiveStats } from './stats.js';

/**
 * u — the truesight radius a hull actually has: its derived `sightRange`, or
 * `sightRange × CONFIG.flashShells.sightFraction` while dazzled.
 * `dazzled` is the caller's own "is `dazzledUntil` still in the future" answer
 * (the server reads its clock, the client its server-clock estimate) — this
 * function never reads a clock. It defaults to false so a caller with no
 * dazzle to report (a wake or drone reader) passes the stats alone.
 */
export function effectiveSight(stats: Pick<EffectiveStats, 'sightRange'>, dazzled = false): number {
  return dazzled ? stats.sightRange * CONFIG.flashShells.sightFraction : stats.sightRange;
}
