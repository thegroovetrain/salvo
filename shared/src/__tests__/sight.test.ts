// effectiveSight (sim/sight.ts) — THE one derivation of a hull's truesight.
// The server's `sightOf` and every client mirror (fog hole, radar dim,
// projectile cull, prediction) call this one function, so pinning its contract
// here pins all of them. Story 10.9 (Eric 2026-10-28, epic-10 amendment 4,
// ruling 1) brought FLASH SHELLS' dazzle back: while dazzled, sight =
// sightRange × CONFIG.flashShells.sightFraction (a fraction of SIGHT — Eric's
// equivalence check was "1/12 of intel range" at today's numbers); radar is
// never touched.

import { describe, it, expect } from 'vitest';
import { CONFIG, SHIP_CLASS_IDS, effectiveSight, effectiveStats, type LineId } from '../index.js';

const BUILDS: LineId[][] = [[], new Array<LineId>(5).fill('radarSweep'), ['starShells', 'starShells', 'reload']];

describe('effectiveSight — the one derivation hub', () => {
  it('undazzled, it is the derived sightRange, on every hull and build — with or without the flag', () => {
    for (const id of SHIP_CLASS_IDS) {
      for (const cards of BUILDS) {
        const s = effectiveStats(CONFIG.shipClasses[id], cards);
        expect(effectiveSight(s), `${id}/${cards.join(',')}`).toBe(s.sightRange);
        expect(effectiveSight(s, false), `${id}/${cards.join(',')}`).toBe(s.sightRange);
      }
    }
  });
});

describe('effectiveSight — FLASH SHELLS dazzle (Story 10.9, ruling 1)', () => {
  it('dazzled, it is sightRange × CONFIG.flashShells.sightFraction on every hull and build', () => {
    for (const id of SHIP_CLASS_IDS) {
      for (const cards of BUILDS) {
        const s = effectiveStats(CONFIG.shipClasses[id], cards);
        expect(effectiveSight(s, true), `${id}/${cards.join(',')}`).toBe(
          s.sightRange * CONFIG.flashShells.sightFraction,
        );
        expect(effectiveSight(s, true)).toBeLessThan(effectiveSight(s, false));
      }
    }
  });

  it('a fraction of SIGHT, never of radar: the same sightRange dazzles alike whatever the radar range', () => {
    const narrow = { sightRange: 400, radarRange: 1000 };
    const wide = { sightRange: 400, radarRange: 3000 };
    expect(effectiveSight(narrow, true)).toBe(effectiveSight(wide, true));
  });

  it('never touches the stats it reads — dazzle blinds, it does not deafen', () => {
    const s = effectiveStats(CONFIG.shipClasses.torpedoBoat);
    const before = structuredClone(s);
    effectiveSight(s, true);
    expect(s).toEqual(before);
  });

  it('reads only sightRange (a bare Pick is enough — the client mirrors pass one)', () => {
    expect(effectiveSight({ sightRange: 100 }, false)).toBe(100);
    expect(effectiveSight({ sightRange: 100 }, true)).toBe(100 * CONFIG.flashShells.sightFraction);
  });
});
