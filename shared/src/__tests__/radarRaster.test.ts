// THE SERVER-SIDE HULL RASTER (cycle 63, amendments 151-157) — unit coverage
// for the ONE shared pipeline that projects a hull polygon onto the radar
// grid and fuzzes it into a radar return. The perception suite holds the
// independently-reimplemented anti-cheat oracle
// (server/src/__tests__/perception.test.ts maskOracle); this file pins the
// primitive's own contract: the rect, the packing, the centre-cell
// fail-safe, the spine rule, world anchoring, the cell-centre coverage rule —
// and, since the cycle-63 review gate, THE FUZZ CALIBRATION: the measured
// proof that class stopped being free to read while size and orientation
// still do (amendments 156-157).

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  HULL_IDS,
  PROTOCOL_VERSION,
  coverageCellCount,
  coverageHas,
  fuzzCoverage,
  hullSilhouette,
  paintCoverage,
  paintSeed,
  pointInPolygon,
  rasterizeHullCoverage,
  transformPolygon,
  type HullCoverage,
  type HullId,
} from '../index.js';

const CELL = CONFIG.vision.radarCellU;

/** Every covered cell of a mask, as absolute cell indices. */
function cellsOf(c: HullCoverage): { gx: number; gy: number }[] {
  const out: { gx: number; gy: number }[] = [];
  for (let row = 0; row < c.h; row++) {
    for (let col = 0; col < c.w; col++) {
      if (coverageHas(c, col, row)) out.push({ gx: c.gx + col, gy: c.gy + row });
    }
  }
  return out;
}

/** Test-local spine oracle: the cells the bow→stern centre-line marks, at the
 *  CONTRACT's quarter-cell sampling (the step is part of the documented rule —
 *  a finer walk would claim corner-clipped cells the rule deliberately lets a
 *  quarter-cell step pass over). */
function spineCells(cls: HullId, x: number, y: number, heading: number): Set<string> {
  const local = hullSilhouette(cls);
  const xs = local.map((p) => p.x);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const cells = new Set<string>();
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const steps = Math.max(1, Math.ceil(((max - min) / CELL) * 4));
  for (let i = 0; i <= steps; i++) {
    const lx = min + ((max - min) * i) / steps;
    cells.add(`${Math.floor((x + c * lx) / CELL)},${Math.floor((y + s * lx) / CELL)}`);
  }
  return cells;
}

describe('rasterizeHullCoverage — the coverage contract', () => {
  it('covers exactly the cells whose CENTRE is inside the posed silhouette, plus the spine and the hull cell', () => {
    const [x, y, heading] = [412, -230, 0.83];
    const c = rasterizeHullCoverage('battleship', x, y, heading, CELL);
    const poly = transformPolygon(hullSilhouette('battleship'), x, y, heading);
    const hullCell = { gx: Math.floor(x / CELL), gy: Math.floor(y / CELL) };
    const spine = spineCells('battleship', x, y, heading);
    // Two-sided: every covered cell is earned, every earned cell is covered.
    for (let row = 0; row < c.h; row++) {
      for (let col = 0; col < c.w; col++) {
        const centre = { x: (c.gx + col + 0.5) * CELL, y: (c.gy + row + 0.5) * CELL };
        const isHullCell = c.gx + col === hullCell.gx && c.gy + row === hullCell.gy;
        const onSpine = spine.has(`${c.gx + col},${c.gy + row}`);
        const inside = pointInPolygon(centre, poly);
        if (coverageHas(c, col, row)) expect(inside || isHullCell || onSpine).toBe(true);
        else expect(inside || onSpine).toBe(false);
      }
    }
    // The rect is the polygon's cell-space bounding box exactly.
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    expect(c.gx).toBe(Math.floor(Math.min(...xs) / CELL));
    expect(c.gy).toBe(Math.floor(Math.min(...ys) / CELL));
    expect(c.gx + c.w - 1).toBe(Math.floor(Math.max(...xs) / CELL));
    expect(c.gy + c.h - 1).toBe(Math.floor(Math.max(...ys) / CELL));
  });

  it('THE SPINE RULE: a thin hull straddling a cell row still rasterizes its whole long axis', () => {
    // A torpedo boat's 9u beam is exactly one 9u cell: at the phase where the
    // hull straddles a row boundary, NO cell centre falls inside it and the
    // pre-gate rasterizer collapsed a 100u hull to a 3-5 cell scatter — losing
    // the orientation read amendment 151 exists to deliver. The bow→stern
    // centre-line always rasterizes, at any phase.
    for (const y of [0, 4.5, 9, 13.5]) {
      const c = rasterizeHullCoverage('torpedoBoat', 200, y, 0, CELL);
      expect(Math.max(c.w, c.h), `phase y=${y}`).toBeGreaterThanOrEqual(
        Math.floor(CONFIG.shipClasses.torpedoBoat.hull.length / CELL),
      );
    }
  });

  it('the bits array is sized exactly to the rect and packed LSB-first row-major', () => {
    const c = rasterizeHullCoverage('mineLayer', 100, 100, 0.4, CELL);
    expect(c.bits.length).toBe(Math.ceil((c.w * c.h) / 32));
    // coverageHas agrees with a hand-decoded read of every bit.
    for (let i = 0; i < c.w * c.h; i++) {
      const byHand = ((c.bits[i >>> 5] >>> (i & 31)) & 1) === 1;
      expect(coverageHas(c, i % c.w, Math.floor(i / c.w))).toBe(byHand);
    }
    // Out-of-rect reads are uncovered, never a wrap-around into another row.
    expect(coverageHas(c, -1, 0)).toBe(false);
    expect(coverageHas(c, c.w, 0)).toBe(false);
    expect(coverageHas(c, 0, c.h)).toBe(false);
  });

  it('a bow-on and a broadside pose of the same hull produce DIFFERENT rects', () => {
    const east = rasterizeHullCoverage('battleship', 300, 300, 0, CELL); // long axis in x
    const north = rasterizeHullCoverage('battleship', 300, 300, Math.PI / 2, CELL); // long axis in y
    expect(east.w).toBeGreaterThan(east.h * 2);
    expect(north.h).toBeGreaterThan(north.w * 2);
  });

  it('is WORLD-ANCHORED: translating the pose by whole cells translates the mask verbatim', () => {
    const base = rasterizeHullCoverage('torpedoBoat', 60, 90, 1.1, CELL);
    const moved = rasterizeHullCoverage('torpedoBoat', 60 + 7 * CELL, 90 - 3 * CELL, 1.1, CELL);
    expect(moved.gx).toBe(base.gx + 7);
    expect(moved.gy).toBe(base.gy - 3);
    expect(moved.w).toBe(base.w);
    expect(moved.h).toBe(base.h);
    expect(moved.bits).toEqual(base.bits);
  });

  it('THE CENTRE-CELL FAIL-SAFE: the cell containing the hull position is always covered', () => {
    for (let k = 0; k < 16; k++) {
      const heading = (k * Math.PI) / 8;
      const c = rasterizeHullCoverage('torpedoBoat', 1234.5, -987.6, heading, CELL);
      expect(coverageCellCount(c)).toBeGreaterThan(0);
      expect(coverageHas(c, Math.floor(1234.5 / CELL) - c.gx, Math.floor(-987.6 / CELL) - c.gy)).toBe(true);
    }
  });

  it('degrades to a single-cell mask on a degenerate cell size or unknown hull, never throws', () => {
    const zero = rasterizeHullCoverage('torpedoBoat', 10, 10, 0, 0);
    expect(zero.w).toBe(1);
    expect(zero.h).toBe(1);
    expect(zero.bits).toEqual([1]);
    const inf = rasterizeHullCoverage('torpedoBoat', 10, 10, 0, Infinity);
    expect(coverageCellCount(inf)).toBe(1);
    const bad = rasterizeHullCoverage('notAHull' as never, 10, 10, 0, CELL);
    expect(bad).toEqual({ gx: 1, gy: 1, w: 1, h: 1, bits: [1] });
  });

  it('all covered cells lie inside the rect (the packing cannot leak outside it)', () => {
    const c = rasterizeHullCoverage('mineLayer', -333, 777, 2.2, CELL);
    for (const cell of cellsOf(c)) {
      expect(cell.gx).toBeGreaterThanOrEqual(c.gx);
      expect(cell.gx).toBeLessThan(c.gx + c.w);
      expect(cell.gy).toBeGreaterThanOrEqual(c.gy);
      expect(cell.gy).toBeLessThan(c.gy + c.h);
    }
  });

  it('a NON-FINITE POSE degrades to a single-cell mask, never throws (cycle-63 review gate)', () => {
    // The "never throws" contract used to stop one guard short: a NaN
    // coordinate made emptyRectFor compute w*h = Infinity and
    // `new Array(Infinity)` raised inside the per-tick scan.
    expect(rasterizeHullCoverage('torpedoBoat', Number.NaN, 10, 0, CELL)).toEqual({ gx: 0, gy: 0, w: 1, h: 1, bits: [1] });
    expect(rasterizeHullCoverage('torpedoBoat', 10, Infinity, 0, CELL)).toEqual({ gx: 0, gy: 0, w: 1, h: 1, bits: [1] });
    const badHeading = rasterizeHullCoverage('torpedoBoat', 10, 10, Number.NaN, CELL);
    expect(badHeading).toEqual({ gx: Math.floor(10 / CELL), gy: Math.floor(10 / CELL), w: 1, h: 1, bits: [1] });
  });
});

// ---------------------------------------------------------------------------
// THE WIRE LATTICE IS A PROTOCOL DECISION (cycle-63 review gate, finding on
// the "one knob" comment): `radarCellU` decides what every gx/gy/bits on the
// wire MEANS, so retuning it is a wire break even though the message shape is
// unchanged. This pin couples it to PROTOCOL_VERSION 31 by name — changing
// either value forces a deliberate decision here, never a silent render
// retune.
// ---------------------------------------------------------------------------

describe('the radar lattice is pinned beside the protocol version', () => {
  it('radarCellU is 9 at PROTOCOL_VERSION 40 — retune both together, deliberately (34 → 35 was sudden death appending the storm timeline\'s collapse group; 35 → 36 was Story 5.6, the bigger ocean + the self-private Contact.aggro; 36 → 37 was Story 6.3\'s arena-side requeue signal; 37 → 38 was the Intel Range merge; 38 → 39 deleted the FRAGMENTATION CASING card; 39 → 40 merged the two mine-ring cards. The lattice itself moved for none of them)', () => {
    expect(PROTOCOL_VERSION).toBe(40);
    expect(CONFIG.vision.radarCellU).toBe(9);
    // The fuzz knobs are wire-authoritative for the same reason (they shape
    // the bits the server sends): pinned with the lattice.
    expect(CONFIG.vision.radarFuzz).toEqual({ stretchP: 0.5, glintP: 0.35 });
  });
});

// ---------------------------------------------------------------------------
// THE FUZZ (amendments 156-157): mechanism contract + the measured
// calibration that proves the ruling's three requirements simultaneously —
// class not trivially separable, size still discriminating at the extremes,
// orientation still readable.
// ---------------------------------------------------------------------------

/** One fuzzed paint with lattice phase and glint seed varied per index. */
function fuzzedPaint(cls: HullId, k: number, heading: number): HullCoverage {
  const x = 100 + ((k * 37.3) % CELL);
  const y = 500 + ((k * 53.7) % CELL);
  return paintCoverage(cls, x, y, heading, CELL, 1000 + k * 50);
}

interface Dims {
  long: number;
  short: number;
  cells: number;
}

function dimsOf(c: HullCoverage): Dims {
  return { long: Math.max(c.w, c.h), short: Math.min(c.w, c.h), cells: coverageCellCount(c) };
}

/** Min/max of each dim over `n` fuzzed paints. */
function dimRange(cls: HullId, heading: number, n: number): { lo: Dims; hi: Dims } {
  const lo = { long: Infinity, short: Infinity, cells: Infinity };
  const hi = { long: -Infinity, short: -Infinity, cells: -Infinity };
  for (let k = 0; k < n; k++) {
    const d = dimsOf(fuzzedPaint(cls, k, heading));
    lo.long = Math.min(lo.long, d.long);
    lo.short = Math.min(lo.short, d.short);
    lo.cells = Math.min(lo.cells, d.cells);
    hi.long = Math.max(hi.long, d.long);
    hi.short = Math.max(hi.short, d.short);
    hi.cells = Math.max(hi.cells, d.cells);
  }
  return { lo, hi };
}

const ASPECTS = [0, Math.PI / 6, Math.PI / 4, Math.PI / 2];

describe('fuzzCoverage — the mechanism contract', () => {
  it('the fuzzed mask CONTAINS the sharp mask (the hull core is never eroded), so a mask is never empty and the hull cell stays lit', () => {
    for (const cls of HULL_IDS) {
      for (let k = 0; k < 8; k++) {
        const x = 50 + k * 3.7;
        const y = -80 + k * 5.3;
        const heading = k * 0.9;
        const sharp = rasterizeHullCoverage(cls, x, y, heading, CELL);
        const fuzzed = fuzzCoverage(sharp, paintSeed(k, x, y, heading), CONFIG.vision.radarFuzz);
        for (const cell of cellsOf(sharp)) {
          expect(coverageHas(fuzzed, cell.gx - fuzzed.gx, cell.gy - fuzzed.gy), `${cls} core cell`).toBe(true);
        }
        expect(coverageCellCount(fuzzed)).toBeGreaterThan(coverageCellCount(sharp));
      }
    }
  });

  it('is DETERMINISTIC per seed and OBSERVER-FREE: the same (pose, tick) always yields the identical mask', () => {
    // This is the property that makes the wire mask observer-independent, the
    // server's one-slot memo sound, and the decoy's counter-intel paint
    // byte-identical to a genuine hull at the same pose (amendment 11: both
    // run this same pipeline; there is no observer input to diverge on).
    const a = paintCoverage('mineLayer', 321.5, -77.25, 1.9, CELL, 4321);
    const b = paintCoverage('mineLayer', 321.5, -77.25, 1.9, CELL, 4321);
    expect(b).toEqual(a);
  });

  it('NO STABLE PER-SHIP SIGNATURE (amendment 157): the same hull at the same pose re-glints every paint — the jitter cannot correlate a hull across sweeps', () => {
    // A stationary hull (or a decoy buoy) paints a DIFFERENT mask each tick,
    // because the seed is (time, pose) and never any ship identity. If a
    // per-ship seed ever crept in, consecutive paints would be identical and
    // this fails.
    const masks = new Set<string>();
    for (let t = 0; t < 12; t++) {
      masks.add(JSON.stringify(paintCoverage('battleship', 400, 250, 0.6, CELL, 1000 + t * 50)));
    }
    expect(masks.size).toBeGreaterThan(8);
  });

  it('4-CONNECTIVITY BY CONSTRUCTION: no fuzzed mask holds a diagonal-only adjacency, so a march ray can never fall through a corner gap (re-establishing the cycle-62 guarantee)', () => {
    // Dilation alone does NOT make this moot — glint erosion can re-open any
    // corner the dilation closed — which is why fuzzCoverage ends with the
    // bridge-repair pass this test pins. Headings include the ~45° worst case.
    for (const cls of HULL_IDS) {
      for (let k = 0; k < 40; k++) {
        const c = fuzzedPaint(cls, k, (k * 0.21) % (Math.PI * 2));
        for (let row = 0; row < c.h - 1; row++) {
          for (let col = 0; col < c.w - 1; col++) {
            const back = Number(coverageHas(c, col, row)) + Number(coverageHas(c, col + 1, row + 1));
            const fore = Number(coverageHas(c, col + 1, row)) + Number(coverageHas(c, col, row + 1));
            expect(back === 2 && fore === 0, `${cls} paint ${k}: \\ diagonal gap`).toBe(false);
            expect(fore === 2 && back === 0, `${cls} paint ${k}: / diagonal gap`).toBe(false);
          }
        }
      }
    }
  });
});

describe('THE CALIBRATION (amendments 156-157): measured, not asserted', () => {
  it('BEFORE — the sharp mask at the shipped cycle-63 lattice (6u) identified the hull: all six (long, short, cells) triples are pairwise distinct at every aspect', () => {
    for (const a of ASPECTS) {
      const triples = HULL_IDS.map((cls) => {
        const c = rasterizeHullCoverage(cls, 100.5, 500.5, a, 6);
        const d = dimsOf(c);
        return `${d.long}x${d.short}x${d.cells}`;
      });
      expect(new Set(triples).size, `aspect ${a.toFixed(2)}: a lookup table works`).toBe(HULL_IDS.length);
    }
  });

  it('AFTER — under the fuzz, EVERY hull\'s dimension ranges overlap at least one other hull\'s in all of long, short AND cells, at every aspect: no lookup table survives', () => {
    for (const a of ASPECTS) {
      const ranges = HULL_IDS.map((cls) => dimRange(cls, a, 48));
      for (let i = 0; i < ranges.length; i++) {
        const confusable = ranges.some((r, j) => {
          if (j === i) return false;
          const me = ranges[i];
          const overlaps = (key: keyof Dims): boolean => me.lo[key] <= r.hi[key] && r.lo[key] <= me.hi[key];
          return overlaps('long') && overlaps('short') && overlaps('cells');
        });
        expect(confusable, `${HULL_IDS[i]} at aspect ${a.toFixed(2)} has a confusable neighbour`).toBe(true);
      }
    }
  });

  it('SIZE STILL DISCRIMINATES AT THE EXTREMES: over the 3-paint phosphor window, a battleship always reads clearly bigger than a torpedo boat', () => {
    // The read a player actually gets is the persistence window, so the pin is
    // the median of 3 consecutive paints: every battleship window out-reads
    // every torpedo-boat window on covered-cell count, at every tested aspect.
    for (const a of [0, Math.PI / 4, Math.PI / 2]) {
      const medians = (cls: HullId): number[] => {
        const out: number[] = [];
        for (let g = 0; g < 16; g++) {
          const w = [0, 1, 2].map((j) => coverageCellCount(fuzzedPaint(cls, g * 3 + j, a))).sort((p, q) => p - q);
          out.push(w[1]);
        }
        return out;
      };
      expect(Math.min(...medians('battleship')), `aspect ${a.toFixed(2)}`).toBeGreaterThan(Math.max(...medians('torpedoBoat')));
    }
  });

  it('ORIENTATION STILL READS: broadside vs bow-on differ in the expected axis, on EVERY paint of the two most elongated hulls', () => {
    for (const cls of ['battleship', 'torpedoBoat'] as const) {
      for (let k = 0; k < 24; k++) {
        const east = fuzzedPaint(cls, k, 0);
        const north = fuzzedPaint(cls, k, Math.PI / 2);
        expect(east.w, `${cls} paint ${k} heading east`).toBeGreaterThan(east.h);
        expect(north.h, `${cls} paint ${k} heading north`).toBeGreaterThan(north.w);
      }
    }
  });
});
