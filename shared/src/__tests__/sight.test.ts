// effectiveSight (sim/sight.ts) — THE one derivation of a hull's truesight
// under FLASH SHELLS (Story 8.17, Eric ruling 2026-09-29, epic-8 amendment
// 132): while dazzled, sight = radarRange × CONFIG.flashShells.sightFraction
// (1/8 of intel range — 82.5 u at the base 660 u radar), replacing the old
// star-shell dazzle's ×0.5-of-sight factor. The server's `sightOf` and every
// client mirror call this one function, so pinning it here pins all of them.

import { describe, it, expect } from 'vitest';
import { CONFIG, SHIP_CLASS_IDS, effectiveSight, effectiveStats, type LineId } from '../index.js';

describe('effectiveSight — FLASH SHELLS dazzle (amendment 132)', () => {
  it('undazzled, it is the derived sightRange exactly (330 u at base)', () => {
    const s = effectiveStats(CONFIG.shipClasses.battleship);
    expect(effectiveSight(s, false)).toBe(s.sightRange);
    expect(effectiveSight(s, false)).toBe(330);
  });

  it('dazzled, it is ONE EIGHTH of intel range: 330 → 82.5 u at the base 660 u radar', () => {
    const s = effectiveStats(CONFIG.shipClasses.battleship);
    expect(s.radarRange).toBe(660);
    expect(CONFIG.flashShells.sightFraction).toBe(0.125);
    expect(effectiveSight(s, true)).toBe(82.5);
    expect(effectiveSight(s, true)).toBe(s.radarRange * CONFIG.flashShells.sightFraction);
  });

  it('because sightRange is DERIVED as radarRange/2, a dazzled hull sees sightRange/4 on every hull and build', () => {
    // A radar-sweep build moves sweep rate, never range (no card writes
    // radarRange since 2026-08-20) — the identity is pinned across hulls and a
    // representative carded build so a future range card cannot desync it.
    const builds: LineId[][] = [[], new Array<LineId>(5).fill('radarSweep'), ['starShells', 'starShells', 'reload']];
    for (const id of SHIP_CLASS_IDS) {
      for (const cards of builds) {
        const s = effectiveStats(CONFIG.shipClasses[id], cards);
        expect(effectiveSight(s, true), `${id}/${cards.join(',')}`).toBeCloseTo(s.sightRange / 4, 12);
        expect(effectiveSight(s, false), `${id}/${cards.join(',')}`).toBe(s.sightRange);
      }
    }
  });

  it('never touches radar range — dazzle blinds, it does not deafen', () => {
    const s = effectiveStats(CONFIG.shipClasses.torpedoBoat);
    const before = { ...s };
    effectiveSight(s, true);
    expect(s).toEqual(before);
  });

  it('reads only the two fields it names (a bare Pick is enough — the client mirrors pass one)', () => {
    expect(effectiveSight({ sightRange: 100, radarRange: 800 }, false)).toBe(100);
    expect(effectiveSight({ sightRange: 100, radarRange: 800 }, true)).toBe(100);
  });
});
