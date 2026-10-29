// A hull's EFFECTIVE truesight — THE one derivation of "how far can this ship
// actually see right now".
//
// Undazzled it is the derived `sightRange`. A FLASH SHELLS burst (Story 8.17,
// epic-8 amendment 132; replaced by the FOULING SHELL in Story 9.4; RESTORED
// beside it by Story 10.9, epic-10 amendments 2 and 4; RE-CUT by Eric
// 2026-10-29 into THE WHITEOUT LAW) stamps every non-owner hull inside it with
// `dazzledUntil = hit + FLASH_WINDOW_MS` (a later hit wins — `max` — never
// stacks, never shortens). For that window the hull's truesight is the CLEAR
// CIRCLE of the whiteout:
//
//   elapsed in [0, rampMs + holdMs)      → 0 u   (the view ramps to white, holds)
//   elapsed in [rampMs + holdMs, window) → sightRange × (elapsed − ramp − hold) / clearMs
//   elapsed ≥ window                     → sightRange (the mark has lapsed)
//
// i.e. sight is ZERO through ramp + hold and then grows LINEARLY from 0 to the
// full `sightRange` across `clearMs` — "it will start clearing out around your
// ship first, and grow out from there". The curve is UNIFORM for humans and
// bots: the server's perception (`sightOf`) reads it for every hull, so a bot
// is blind exactly as long as a captain is, and the client paints the same
// curve (`flashClearFraction`) over its view.
//
// WHY IT STAYS A FUNCTION IN SHARED: it is the single entry point for every
// consumer of "how far can I see" — the server's perception (`sightOf`) and the
// client's mirrors of the bubble (the fog hole, the radar dim mask, the
// projectile cull and prediction). Three client mirrors of the server's sight
// have desynced before (epic-4 amendments); routing them all through one pure
// function both sides call means the whiteout lands in ONE place and nothing
// re-derives it per side.
//
// Radar range is NEVER touched and never an input: a flash blinds, it does not
// deafen (the radar-anchored rungs — muzzle flash, smoke halo, foghorn — stay
// undazzled; epic-2 amendment 52 "dazzle stays optics-only" stands).
//
// FAIL CLOSED: a pending dazzle (`dazzledUntil > 0`) with a non-finite `now` or
// a non-finite `dazzledUntil` reads as sight 0. The alternative — treating a
// garbage clock as "undazzled" — would hand a flashed hull its full bubble on a
// bad input; blindness is the safe error.
//
// Pure, zero I/O.

import { CONFIG } from '../constants.js';
import type { EffectiveStats } from './stats.js';

/** ms — the whole whiteout window: ramp + hold + clear (the ONE derived total). */
export const FLASH_WINDOW_MS =
  CONFIG.flashShells.rampMs + CONFIG.flashShells.holdMs + CONFIG.flashShells.clearMs;

/**
 * ms into the whiteout a hull marked `dazzledUntil` is at `now` — negative
 * before the hit (never happens on a real clock), ≥ FLASH_WINDOW_MS once the
 * mark has lapsed. Non-finite inputs give NaN; callers fail closed on it.
 */
export function flashElapsedMs(dazzledUntil: number, now: number): number {
  return FLASH_WINDOW_MS - (dazzledUntil - now);
}

/**
 * 0..1 — how far the clear circle has grown at `elapsedMs` into the whiteout:
 * 0 through ramp + hold, then linear across `clearMs`, clamped to [0, 1].
 * NaN elapsed → 0 (fail closed). The client's overlay reads THIS curve so the
 * painted clearing and the server's perception are one law.
 */
export function flashClearFraction(elapsedMs: number): number {
  const { rampMs, holdMs, clearMs } = CONFIG.flashShells;
  const t = (elapsedMs - rampMs - holdMs) / clearMs;
  if (!(t > 0)) return 0; // also catches NaN
  return t < 1 ? t : 1;
}

/**
 * u — the truesight radius a hull actually has: its derived `sightRange`, or
 * `sightRange × flashClearFraction(elapsed)` while a flash mark is pending.
 * `dazzledUntil` is the hull's server-clock mark (0 / absent = never flashed);
 * `now` is the caller's clock (the server reads its tick clock, the client its
 * server-clock estimate) — this function never reads a clock itself. Both
 * default to 0 so a caller with no dazzle to report (a wake or drone reader)
 * passes the stats alone.
 */
export function effectiveSight(
  stats: Pick<EffectiveStats, 'sightRange'>,
  dazzledUntil = 0,
  now = 0,
): number {
  if (Number.isNaN(dazzledUntil)) return 0; // fail closed: an unreadable mark is a pending one
  if (dazzledUntil <= 0 || now >= dazzledUntil) return stats.sightRange;
  return stats.sightRange * flashClearFraction(flashElapsedMs(dazzledUntil, now));
}
