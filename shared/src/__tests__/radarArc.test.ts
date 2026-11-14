// THE ARC (Story 11.3, R1–R4) — contract tests for `smearArc`: the output
// always holds the sharp mask; far, it is never narrower in bearing than the
// beam and no wider than the target plus the beam; its depth is the target's
// own extent plus the pulse; near, the beam adds at most one ring of cells;
// the ±π wrap never splits an arc; each observer's arc is centered on its own
// bearing; degenerate inputs degrade as documented. Slack is one lattice cell
// (cell centres sample the sector), never a pinned measurement.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  HULL_IDS,
  coverageHas,
  hmToU,
  rasterizeDiscCoverage,
  rasterizeHullCoverage,
  rasterizeSegmentCoverage,
  smearArc,
  smearArcWithCore,
  type HullCoverage,
} from '../index.js';

const CELL = CONFIG.vision.radarCellU;
const BEAM = (CONFIG.vision.beamDeg * Math.PI) / 180;
const PULSE = hmToU(CONFIG.vision.pulseHm);

interface Polar {
  r: number[];
  t: number[];
  keys: Set<string>;
}

/** Every lit cell's centre in polar coordinates about (ox, oy), bearings
 *  relative to `phi` and wrapped to (−π, π]. */
function polar(c: HullCoverage, ox: number, oy: number, phi: number): Polar {
  const out: Polar = { r: [], t: [], keys: new Set() };
  for (let row = 0; row < c.h; row++) {
    for (let col = 0; col < c.w; col++) {
      if (!coverageHas(c, col, row)) continue;
      const dx = (c.gx + col + 0.5) * CELL - ox;
      const dy = (c.gy + row + 0.5) * CELL - oy;
      out.r.push(Math.hypot(dx, dy));
      out.t.push(Math.atan2(dy * Math.cos(phi) - dx * Math.sin(phi), dx * Math.cos(phi) + dy * Math.sin(phi)));
      out.keys.add(`${c.gx + col},${c.gy + row}`);
    }
  }
  return out;
}

const span = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);

/** A hull pose `hm` hectometers from the observer along bearing `brg`. */
function hullAt(cls: (typeof HULL_IDS)[number], ox: number, oy: number, hm: number, brg: number, heading: number): HullCoverage {
  const d = hmToU(hm);
  return rasterizeHullCoverage(cls, ox + d * Math.cos(brg), oy + d * Math.sin(brg), heading, CELL);
}

/** Bearing from the observer to the centre of a mask's rect. */
function rectBearing(c: HullCoverage, ox: number, oy: number): number {
  return Math.atan2((c.gy + c.h / 2) * CELL - oy, (c.gx + c.w / 2) * CELL - ox);
}

/** Number of 4-connected components of lit cells. */
function components(c: HullCoverage): number {
  const seen = new Set<number>();
  let n = 0;
  for (let i = 0; i < c.w * c.h; i++) {
    if (seen.has(i) || !coverageHas(c, i % c.w, Math.floor(i / c.w))) continue;
    n++;
    const stack = [i];
    seen.add(i);
    while (stack.length) {
      const j = stack.pop()!;
      const col = j % c.w;
      const row = Math.floor(j / c.w);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (row + dr) * c.w + col + dc;
        if (coverageHas(c, col + dc, row + dr) && !seen.has(k)) {
          seen.add(k);
          stack.push(k);
        }
      }
    }
  }
  return n;
}

const OX = -3000;
const OY = 1200;
const POSES = [5, 50, 200, 400].flatMap((hm) => [0.3, 2.2, -1.9].flatMap((brg) => [0, Math.PI / 2, 0.7].map((dh) => ({ hm, brg, heading: brg + dh }))));

describe('smearArc — the arc law (Story 11.3)', () => {
  it('always keeps every sharp cell lit (output ⊇ sharp), for hulls, wakes and crates', () => {
    for (const cls of HULL_IDS) {
      for (const p of POSES) {
        const sharp = hullAt(cls, OX, OY, p.hm, p.brg, p.heading);
        const out = polar(smearArc(sharp, OX, OY, CELL, BEAM, PULSE), OX, OY, 0).keys;
        for (const k of polar(sharp, OX, OY, 0).keys) expect(out.has(k)).toBe(true);
      }
    }
    const d = hmToU(300);
    const wake = rasterizeSegmentCoverage(OX + d, OY, OX + d + 40, OY + 30, 20, CELL);
    const crate = rasterizeDiscCoverage(OX, OY + d, CONFIG.drops.radiusU, CELL);
    for (const sharp of [wake, crate]) {
      const out = polar(smearArc(sharp, OX, OY, CELL, BEAM, PULSE), OX, OY, 0).keys;
      for (const k of polar(sharp, OX, OY, 0).keys) expect(out.has(k)).toBe(true);
    }
  });

  it('far: spans at least the beam in bearing, and no more than the target plus the beam', () => {
    for (const cls of HULL_IDS) {
      for (const p of POSES.filter((q) => q.hm >= 200)) {
        const sharp = hullAt(cls, OX, OY, p.hm, p.brg, p.heading);
        const phi = rectBearing(sharp, OX, OY);
        const out = polar(smearArc(sharp, OX, OY, CELL, BEAM, PULSE), OX, OY, phi);
        const sharpT = polar(sharp, OX, OY, phi).t;
        const slack = (2 * Math.SQRT2 * CELL) / Math.min(...out.r);
        expect(span(out.t)).toBeGreaterThanOrEqual(BEAM - slack);
        expect(span(out.t)).toBeLessThanOrEqual(span(sharpT) + BEAM + slack);
      }
    }
  });

  it('a far crate disc and a far wake segment smear by the same beam', () => {
    const d = hmToU(350);
    const crate = rasterizeDiscCoverage(OX + d * Math.cos(1), OY + d * Math.sin(1), CONFIG.drops.radiusU, CELL);
    const wake = rasterizeSegmentCoverage(OX - d, OY, OX - d - 30, OY - 10, 20, CELL);
    for (const sharp of [crate, wake]) {
      const out = polar(smearArc(sharp, OX, OY, CELL, BEAM, PULSE), OX, OY, rectBearing(sharp, OX, OY));
      expect(span(out.t)).toBeGreaterThanOrEqual(BEAM - (2 * Math.SQRT2 * CELL) / Math.min(...out.r));
    }
  });

  it('depth along the line of sight is the target extent plus the pulse', () => {
    for (const cls of HULL_IDS) {
      for (const p of POSES.filter((q) => q.hm >= 50)) {
        const sharp = hullAt(cls, OX, OY, p.hm, p.brg, p.heading);
        const out = polar(smearArc(sharp, OX, OY, CELL, BEAM, PULSE), OX, OY, 0);
        const extent = span(polar(sharp, OX, OY, 0).r);
        expect(span(out.r)).toBeLessThanOrEqual(extent + PULSE + CELL);
        expect(span(out.r)).toBeGreaterThanOrEqual(extent + PULSE - 2 * CELL);
      }
    }
  });

  it('near: the beam adds at most one ring of cells (the silhouette survives)', () => {
    for (const cls of HULL_IDS) {
      for (const p of POSES.filter((q) => q.hm === 5)) {
        const sharp = hullAt(cls, OX, OY, p.hm, p.brg, p.heading);
        const sharpKeys = polar(sharp, OX, OY, 0).keys;
        const out = polar(smearArc(sharp, OX, OY, CELL, BEAM, 0), OX, OY, 0).keys;
        for (const k of out) {
          const [x, y] = k.split(',').map(Number);
          const near = [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => sharpKeys.has(`${x + dx},${y + dy}`)));
          expect(near).toBe(true);
        }
      }
    }
  });

  it('a target straddling bearing ±π paints one contiguous arc', () => {
    const ox = 2000;
    const oy = 0;
    const sharp = rasterizeHullCoverage('yamato', ox - hmToU(300), oy + 0.3 * CELL, Math.PI / 2, CELL);
    const out = smearArc(sharp, ox, oy, CELL, BEAM, PULSE);
    expect(components(out)).toBe(1);
    const t = polar(out, ox, oy, Math.PI).t;
    expect(span(t)).toBeLessThanOrEqual(span(polar(sharp, ox, oy, Math.PI).t) + BEAM + (2 * Math.SQRT2 * CELL) / hmToU(290));
    expect(Math.min(...t)).toBeLessThan(0);
    expect(Math.max(...t)).toBeGreaterThan(0);
  });

  it('two observers get different masks, each centered on its own bearing', () => {
    const tx = 500;
    const ty = -400;
    const sharp = rasterizeHullCoverage('bismarck', tx, ty, 0.4, CELL);
    const d = hmToU(250);
    const observers = [
      { x: tx - d, y: ty },
      { x: tx, y: ty + d },
    ];
    const masks = observers.map((o) => smearArc(sharp, o.x, o.y, CELL, BEAM, PULSE));
    expect(masks[0]).not.toEqual(masks[1]);
    masks.forEach((m, i) => {
      const o = observers[i];
      const t = polar(m, o.x, o.y, Math.atan2(ty - o.y, tx - o.x)).t;
      const mid = (Math.max(...t) + Math.min(...t)) / 2;
      expect(Math.abs(mid)).toBeLessThanOrEqual((2 * CELL) / d);
    });
  });

  it('degrades: bad observer, lattice or a too-near observer returns sharp; a bad axis is unsmeared', () => {
    const sharp = hullAt('iowa', OX, OY, 100, 0.5, 1);
    expect(smearArc(sharp, NaN, OY, CELL, BEAM, PULSE)).toBe(sharp);
    expect(smearArc(sharp, OX, Infinity, CELL, BEAM, PULSE)).toBe(sharp);
    expect(smearArc(sharp, OX, OY, 0, BEAM, PULSE)).toBe(sharp);
    expect(smearArc(sharp, OX, OY, NaN, BEAM, PULSE)).toBe(sharp);
    expect(smearArc(sharp, OX, OY, CELL, 0, 0)).toBe(sharp);
    const inside = { x: (sharp.gx + sharp.w / 2) * CELL, y: (sharp.gy + sharp.h / 2) * CELL };
    expect(smearArc(sharp, inside.x, inside.y, CELL, BEAM, PULSE)).toBe(sharp);
    for (const bad of [NaN, -1, Infinity]) {
      expect(smearArc(sharp, OX, OY, CELL, bad, PULSE)).toEqual(smearArc(sharp, OX, OY, CELL, 0, PULSE));
      expect(smearArc(sharp, OX, OY, CELL, BEAM, bad)).toEqual(smearArc(sharp, OX, OY, CELL, BEAM, 0));
    }
  });

  it('each axis smears only its own direction', () => {
    const sharp = hullAt('warspite', OX, OY, 300, -0.8, 0.1);
    const phi = rectBearing(sharp, OX, OY);
    const s = polar(sharp, OX, OY, phi);
    const beamOnly = polar(smearArc(sharp, OX, OY, CELL, BEAM, 0), OX, OY, phi);
    const pulseOnly = polar(smearArc(sharp, OX, OY, CELL, 0, PULSE), OX, OY, phi);
    expect(span(beamOnly.r)).toBeLessThanOrEqual(span(s.r) + CELL);
    expect(span(pulseOnly.t)).toBeLessThanOrEqual(span(s.t) + (2 * CELL) / hmToU(290));
  });

  // Story 11.3 review (P7a): a zero beam still smears in RANGE — every sharp
  // cell's own ray, the pulse deep — never only the cells a ray hits exactly.
  it('a zero beam with a pulse smears each cell along its own ray, the pulse deep, and nowhere sideways', () => {
    for (const [d, brg] of [[300, 0.3], [hmToU(200), 2.2], [hmToU(400), -1.9]] as const) {
      const tx = OX + Math.cos(brg) * d;
      const ty = OY + Math.sin(brg) * d;
      const sharp = rasterizeDiscCoverage(tx, ty, 1, CELL); // one cell
      const out = smearArc(sharp, OX, OY, CELL, 0, PULSE);
      const phi = rectBearing(sharp, OX, OY);
      const p = polar(out, OX, OY, phi);
      expect(span(p.r), `${d.toFixed(0)} u`).toBeGreaterThanOrEqual(PULSE - CELL);
      expect(span(p.r)).toBeLessThanOrEqual(PULSE + 2 * CELL);
      // sideways: no cell farther off the ray than a cell's diagonal
      for (let i = 0; i < p.r.length; i++) expect(Math.abs(p.r[i] * Math.sin(p.t[i]))).toBeLessThanOrEqual(CELL * Math.SQRT2);
    }
  });

  // Story 11.3 review (P7b): degrade, never throw — a mask whose rect is not
  // finite integers, or an observer so far that the arc's box would dwarf any
  // legal paint (past the radar's reach × beam + pulse, generously), returns
  // the sharp mask unchanged.
  it('degrades, never throws: a non-finite rect or an absurdly far observer returns sharp unchanged', () => {
    const sharp = hullAt('iowa', OX, OY, 100, 0.5, 1);
    for (const bad of [{ gx: NaN }, { gy: Infinity }, { gx: 0.5 }, { w: NaN }, { h: -Infinity }]) {
      const m = { ...sharp, ...bad };
      expect(() => smearArc(m, OX, OY, CELL, BEAM, PULSE)).not.toThrow();
      expect(smearArc(m, OX, OY, CELL, BEAM, PULSE)).toBe(m);
    }
    for (const far of [1e7, 1e9, 1e300]) {
      expect(() => smearArc(sharp, OX - far, OY, CELL, BEAM, PULSE)).not.toThrow();
      expect(smearArc(sharp, OX - far, OY, CELL, BEAM, PULSE), `${far} u`).toBe(sharp);
    }
    // ...while every legal range still smears.
    const edge = hullAt('yamato', OX, OY, 400, 0.7, 0.2);
    expect(smearArc(edge, OX, OY, CELL, BEAM, PULSE)).not.toBe(edge);
  });

  // Story 11.3 review (P5): the wake paint smears its ribbon ONCE; the
  // spine's own arc (the glint's core) is tested only on the arc's lit cells.
  it('smearArcWithCore: the arc is smearArc\'s, and on its lit cells the core is exactly the core mask\'s own arc', () => {
    const lit = (c: HullCoverage, x: number, y: number): boolean => coverageHas(c, x - c.gx, y - c.gy);
    for (let k = 0; k < 24; k++) {
      const d = [40, 300, hmToU(50), hmToU(200), hmToU(400)][k % 5];
      const brg = 0.4 + k * 1.13;
      const tx = OX + Math.cos(brg) * d;
      const ty = OY + Math.sin(brg) * d;
      const cover = rasterizeSegmentCoverage(tx, ty, tx + Math.cos(k) * 12, ty + Math.sin(k) * 12, 32, CELL);
      // a core on the cover's rect: every other covered cell (the spine stands in)
      const core = { ...cover, bits: cover.bits.map((wd, i) => wd & (i % 2 === 0 ? 0x55555555 : 0xaaaaaaaa)) };
      const out = smearArcWithCore(cover, core, OX, OY, CELL, BEAM, PULSE);
      expect(out.arc, `#${k}`).toEqual(smearArc(cover, OX, OY, CELL, BEAM, PULSE));
      const ref = smearArc(core, OX, OY, CELL, BEAM, PULSE);
      expect([out.core.gx, out.core.gy, out.core.w, out.core.h]).toEqual([out.arc.gx, out.arc.gy, out.arc.w, out.arc.h]);
      for (let row = 0; row < out.arc.h; row++) {
        for (let col = 0; col < out.arc.w; col++) {
          const x = out.arc.gx + col;
          const y = out.arc.gy + row;
          const want = lit(out.arc, x, y) && lit(ref, x, y);
          expect(coverageHas(out.core, col, row), `#${k} (${x}, ${y})`).toBe(want);
        }
      }
    }
    const sharp = rasterizeSegmentCoverage(OX + 3, OY + 2, OX + 9, OY + 2, 32, CELL);
    const atIt = smearArcWithCore(sharp, sharp, OX, OY, CELL, BEAM, PULSE);
    expect(atIt.arc).toBe(sharp);
    expect(atIt.core).toBe(sharp);
  });

  it('is deterministic and leaves its input untouched', () => {
    const sharp = hullAt('yamato', OX, OY, 400, 1.1, 0.2);
    const copy = { ...sharp, bits: [...sharp.bits] };
    const a = smearArc(sharp, OX, OY, CELL, BEAM, PULSE);
    hullAt('iowa', OX, OY, 50, 0, 0);
    expect(smearArc(sharp, OX, OY, CELL, BEAM, PULSE)).toEqual(a);
    expect(sharp).toEqual(copy);
  });
});
