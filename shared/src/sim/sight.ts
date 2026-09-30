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
// SMOKE (Story 8.18, Eric ruling 2026-09-29, epic-8 amendment 149, final): a
// hull whose centre is inside ANY live SMOKE SCREEN puff — whoever laid it,
// its own trail included — sees at `radarRange ×
// CONFIG.smokeScreen.inSmokeSightFraction` (1/8 of intel range, 82.5 u at
// base), INTO other smoke within that bubble (server: signals.ts `sightClear`
// drops the puff term for an in-smoke observer) and at nothing optical beyond
// it. This function only sizes the bubble. DAZZLE IS LISTED FIRST and wins
// when both apply — the two fractions are separate dials that happen to be
// equal today (1/8 each); a flashed hull in smoke reads the flash dial.
//
// Radar range itself is NEVER touched: dazzle blinds, it does not deafen.
//
// Pure, zero I/O.

import { CONFIG } from '../constants.js';
import type { EffectiveStats } from './stats.js';

/**
 * u — the truesight radius a hull actually has: its derived `sightRange`;
 * `radarRange × CONFIG.flashShells.sightFraction` while dazzled; else
 * `radarRange × CONFIG.smokeScreen.inSmokeSightFraction` while its centre is
 * inside any live smoke puff (amendment 149). Dazzle is checked first and wins
 * when both hold.
 * `dazzled` is the caller's own "is `dazzledUntil` still in the future" answer
 * (the server reads its clock, the client its server-clock estimate) and
 * `inSmoke` the caller's own "is a live puff's disc over my centre" answer
 * (the server's per-tick `ShipRecord.inSmoke` stamp, mirrored to the client
 * as the self-private `OwnShip.inSmoke`) — this function never reads a clock
 * or a puff store. `inSmoke` defaults to false so a caller with no smoke
 * knowledge keeps the two-argument contract.
 */
export function effectiveSight(stats: Pick<EffectiveStats, 'sightRange' | 'radarRange'>, dazzled: boolean, inSmoke = false): number {
  if (dazzled) return stats.radarRange * CONFIG.flashShells.sightFraction;
  if (inSmoke) return stats.radarRange * CONFIG.smokeScreen.inSmokeSightFraction;
  return stats.sightRange;
}
