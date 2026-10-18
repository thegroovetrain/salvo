// A hull's EFFECTIVE truesight — THE one derivation of "how far can this ship
// actually see right now".
//
// Today it is simply the derived `sightRange`: nothing in the game shrinks or
// widens sight at runtime. FLASH SHELLS' dazzle (Story 8.17, epic-8 amendment
// 132) once collapsed it to 1/8 of intel range; that consumable was replaced by
// the FOULING SHELL in Story 9.4 (Eric ruling 2026-10-11, epic-9 amendments
// 61–68), whose zone slows props and never touches sight. Story 8.18's in-smoke
// rule went with Story 9.3 (a countermeasure cloud hides nothing).
//
// WHY IT STAYS A FUNCTION IN SHARED: it is the single entry point for every
// consumer of "how far can I see" — the server's perception (`sightOf`) and the
// client's mirrors of the bubble (the fog hole, the radar dim mask, the
// projectile cull and prediction). Three client mirrors of the server's sight
// have desynced before (epic-4 amendments); routing them all through one pure
// function both sides call means a future sight modifier lands in ONE place and
// nothing re-derives it per side.
//
// Radar range is never an input: sight is a different quantity from intel range.
//
// Pure, zero I/O.

import type { EffectiveStats } from './stats.js';

/** u — the truesight radius a hull actually has: its derived `sightRange`. */
export function effectiveSight(stats: Pick<EffectiveStats, 'sightRange'>): number {
  return stats.sightRange;
}
