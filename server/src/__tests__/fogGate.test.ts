// The bounded fog gate (Story 11.2 follow-up) — `World.fogSightAdmits`.
//
// THE CONTRACT: for every ray, length and range it answers exactly what the
// sight gate answered on the full toll — `toll <= 0 || d + toll <= range`
// with `toll = World.fogTollAlong(ray)` — and it may stop walking only once
// that answer is decided. Sight is the anti-cheat boundary: an early "seen"
// that the full toll would have refused is a leak. The oracle is the full
// toll itself, asked on a second World with the identical field so neither
// call can warm the other's memo.

import { describe, it, expect } from 'vitest';
import { CONFIG, FOG_NO_CUT, fogCutForTarget, fogLattice, mulberry32 } from '@salvo/shared';
import { World } from '../game/world.js';

const SEED = 31;
const FULL_FOG_CUT = -2; // density 1 on the whole ocean: every observer stands in its own bank

function pair(cut: number): { gate: World; toll: World } {
  const make = (): World => {
    const w = new World(SEED, CONFIG.match.fillTo);
    w.setFogCutForTest(cut);
    return w;
  };
  return { gate: make(), toll: make() };
}

/** A cut that fogs `share` of the ocean solid — real banks with clear water between. */
function banksCut(share: number): number {
  const w = new World(SEED, CONFIG.match.fillTo);
  return fogCutForTarget(w.fogFieldForTest(), w.now, fogLattice(0, 0, w.map.radius, CONFIG.fog.quantileLattice), share);
}

function reference(toll: World, ax: number, ay: number, bx: number, by: number, d: number, range: number): boolean {
  const t = toll.fogTollAlong(ax, ay, bx, by);
  return t <= 0 || d + t <= range;
}

describe('World.fogSightAdmits — the full toll\'s answer, decided early', () => {
  it('equals `toll <= 0 || d + toll <= range` for seeded rays under thin fog, thick fog and one ocean-wide bank — at ranges on, just inside and just outside the ray\'s own tolled length, and both answers occur', () => {
    let seen = 0;
    let hidden = 0;
    let walked = 0;
    for (const cut of [banksCut(0.1), banksCut(0.4), FULL_FOG_CUT]) {
      const { gate, toll } = pair(cut);
      const R = gate.map.radius;
      const rng = mulberry32(0xf06 ^ Math.round(cut * 1000));
      for (let n = 0; n < 1500; n++) {
        const ax = (rng.next() * 2 - 1) * R * 0.7;
        const ay = (rng.next() * 2 - 1) * R * 0.7;
        const len = n % 4 === 0 ? 20 + rng.next() * 300 : 300 + rng.next() * 7500;
        const ang = rng.next() * 6.283185307179586;
        const bx = ax + Math.cos(ang) * len;
        const by = ay + Math.sin(ang) * len;
        const d = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
        const t = toll.fogTollAlong(ax, ay, bx, by);
        // Ranges around the decision: the ray's exact tolled length (the
        // inclusive boundary), a hair either side, the free radius, the bare
        // length, and unrelated ones.
        const ranges = [d + t, d + t - 1e-9, d + t + 1e-9, d + t - 1e-5, d + t + 1e-5, d + t * 0.5, d + t * 2 + 1, d, d * (1 + CONFIG.fog.sightCostPerU), d + rng.next() * 3 * d];
        for (const range of ranges) {
          if (!(d <= range)) continue; // the gate's precondition: geometrically in range
          const want = reference(toll, ax, ay, bx, by, d, range);
          const before = gate.fogWalks;
          expect(gate.fogSightAdmits(ax, ay, bx, by, d, range), `cut ${cut} ray ${n} range ${range} (d ${d}, toll ${t})`).toBe(want);
          walked += gate.fogWalks - before;
          if (want) seen += 1;
          else hidden += 1;
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(hidden).toBeGreaterThan(0);
    expect(walked).toBeGreaterThan(0);
  });

  it('with no fog every in-range ray is admitted and nothing is walked', () => {
    const { gate } = pair(FOG_NO_CUT);
    const before = gate.fogWalks;
    expect(gate.fogSightAdmits(-400, 120, 900, -310, 1371, 1371)).toBe(true);
    expect(gate.fogWalks).toBe(before);
  });

  it('a ray inside the free radius — its whole length at full density still fits the range — is admitted without a walk, and the same question twice walks once', () => {
    const { gate, toll } = pair(banksCut(0.4));
    const cost = CONFIG.fog.sightCostPerU;
    const [ax, ay, bx, by] = [-300, 120, 400, -200];
    const d = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
    const before = gate.fogWalks;
    expect(gate.fogSightAdmits(ax, ay, bx, by, d, d * (1 + cost) + 1)).toBe(true);
    expect(gate.fogWalks).toBe(before);
    // Past the free radius the walk is paid — once for a repeated question.
    const range = d * (1 + cost) - 1;
    const first = gate.fogSightAdmits(ax, ay, bx, by, d, range);
    expect(first).toBe(reference(toll, ax, ay, bx, by, d, range));
    expect(gate.fogWalks).toBe(before + 1);
    expect(gate.fogSightAdmits(ax, ay, bx, by, d, range)).toBe(first);
    expect(gate.fogWalks).toBe(before + 1);
  });

  it('degenerate rays pay nothing: a point, a non-finite end, a ray wholly off the ocean', () => {
    const { gate } = pair(FULL_FOG_CUT);
    const far = gate.map.radius * 3;
    expect(gate.fogSightAdmits(0, 0, 0, 0, 0, 10)).toBe(true);
    expect(gate.fogSightAdmits(NaN, 0, 100, 0, 100, 100)).toBe(true);
    expect(gate.fogSightAdmits(far, 0, far + 500, 0, 500, 500)).toBe(true);
  });
});
