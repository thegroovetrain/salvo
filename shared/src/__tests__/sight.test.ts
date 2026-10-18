// effectiveSight (sim/sight.ts) — THE one derivation of a hull's truesight.
// The server's `sightOf` and every client mirror (fog hole, radar dim,
// projectile cull, prediction) call this one function, so pinning its contract
// here pins all of them. Since Story 9.4 retired FLASH SHELLS' dazzle, the
// contract is the derived `sightRange`, unmodified.

import { describe, it, expect } from 'vitest';
import { CONFIG, SHIP_CLASS_IDS, effectiveSight, effectiveStats, type LineId } from '../index.js';

describe('effectiveSight — the one derivation hub', () => {
  it('is the derived sightRange, on every hull and build', () => {
    const builds: LineId[][] = [[], new Array<LineId>(5).fill('radarSweep'), ['starShells', 'starShells', 'reload']];
    for (const id of SHIP_CLASS_IDS) {
      for (const cards of builds) {
        const s = effectiveStats(CONFIG.shipClasses[id], cards);
        expect(effectiveSight(s), `${id}/${cards.join(',')}`).toBe(s.sightRange);
      }
    }
  });
});
