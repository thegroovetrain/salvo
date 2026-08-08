// The radar-shadow model (Story 4.11) — every row of the spec's I/O matrix
// that lives in shared/, plus the two closed forms that make the feature
// predictable without simulating anything (amendment 176):
//
//   - worst-case reach on a bearing crossing height h is radarRange·√(1 − h/H),
//     attained when the obstacle sits at exactly HALF that distance;
//   - h = 0 ⇒ reach ≥ radarRange (a beach never shadows inside the scope —
//     amendment 114's pin 2RH = radarRange²/4 doing its job; check THIS first
//     if anyone ever re-derives R or H).
//
// Matrix rows owned elsewhere and deliberately absent here: "fully shadowed
// slice must still be enrolled" (client freeze path), "aground observer"
// (server gate suppresses paint creation before the accumulator runs), and
// "fixture world" (server test fixture seam).
//
// Rasters are built synthetically via buildHeightRaster over a hand-authored
// field (seaLevel 0, peak 255 ⇒ quantized height === field value) — never via
// generateMap, which is slow.

import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  beginShadowWalk,
  buildHeightRaster,
  radarShadowK,
  visibilityTo,
  type HeightRaster,
} from '../index.js';

const CELL = 14; // the production raster cell size
const N = 201; // covers ±1400u — comfortably past radar range (660u)
const MID = (N - 1) / 2; // 100
const X0 = -MID * CELL; // -1400: sample (MID, MID) sits at (0, 0)

const R = CONFIG.vision.radar; // 660
const H = CONFIG.vision.radarMastQ; // 64
const K = radarShadowK(); // 108900

/** Synthetic raster: `cells` is [i, j, quantizedHeight] triples, rest is sea. */
function rasterOf(cells: ReadonlyArray<readonly [number, number, number]>): HeightRaster {
  const v = new Float32Array(N * N);
  for (const [i, j, q] of cells) v[j * N + i] = q;
  return buildHeightRaster({ n: N, cell: CELL, x0: X0, y0: X0, v }, 0, 255);
}

/** Entry distance into sample column `i`'s cell for an observer at x = ox on
 *  the +x ray (cell Voronoi boundary is half a cell before the sample). */
function entryOf(i: number, ox = 0): number {
  return X0 + i * CELL - CELL / 2 - ox;
}

/** Reach measured through the public walk for one obstacle at world column
 *  `i`, observer at (ox, 0), ray +x. */
function reachFor(q: number, i: number, ox: number): number {
  const walk = beginShadowWalk(rasterOf([[i, MID, q]]), ox, 0, 1, 0);
  walk.advanceTo(entryOf(i, ox) + 1);
  return walk.reach();
}

describe('K — the world constant', () => {
  it('is radarRange²/4 (= 2RH, amendment 114/182), from BASE CONFIG.vision.radar — the module takes no observer stats anywhere in its API, so a boon-widened stats.radarRange structurally cannot reach it (amendment 185)', () => {
    expect(K).toBe(CONFIG.vision.radar ** 2 / 4);
    expect(K).toBe(108900); // 660²/4 at the shipped ladder
  });
});

describe('open water (matrix: no land on the ray)', () => {
  const sea = rasterOf([]);

  it('vis = 1 at every distance, reach is infinite', () => {
    const walk = beginShadowWalk(sea, 0, 0, 1, 0);
    for (const d of [1, 100, 330, R, 1000]) {
      walk.advanceTo(d);
      expect(walk.visibilityAt(d)).toBe(1);
    }
    expect(walk.reach()).toBe(Infinity);
    expect(visibilityTo(sea, 0, 0, R, 0)).toBe(1);
  });

  it('h = 0 terrain IS sea: a zero-height sample folds nothing, so reach ≥ radarRange holds trivially — the closed-form pin at its exact bound', () => {
    // Explicitly author height-0 "land": quantizes to SEA_HEIGHT and cannot
    // shadow anything, anywhere. This is amendment 114's pin working: the sea
    // horizon and the scope rim are the same circle by construction.
    const flat = rasterOf([[MID + 10, MID, 0], [MID + 20, MID, 0]]);
    expect(visibilityTo(flat, 0, 0, R, 0)).toBe(1);
  });
});

describe('sea-level fringe (matrix: land at h ≈ 0, any d₀)', () => {
  it('the lowest representable land (q = 1) costs under 1% of the scope even at its worst placement — a coastal graze costs almost nothing', () => {
    const u = 1 - 1 / H;
    const worst = R * Math.sqrt(u); // 654.83u of 660
    // Worst placement: obstacle at exactly half the worst-case reach.
    const boundary = X0 + 150 * CELL - CELL / 2; // 693
    const ox = boundary - worst / 2;
    const walk = beginShadowWalk(rasterOf([[150, MID, 1]]), ox, 0, 1, 0);
    walk.advanceTo(R);
    expect(walk.reach()).toBeCloseTo(worst, 6);
    expect(walk.reach()).toBeGreaterThan(0.99 * R);
    // Any other placement hurts LESS:
    for (const off of [-200, -100, 100, 200]) {
      expect(reachFor(1, 150, ox - off)).toBeGreaterThanOrEqual(worst - 1e-9);
    }
  });
});

describe('soft cover (matrix: 0 < h < H at d₀)', () => {
  // q = 32 ⇒ u = 0.5, single cell at column 122 (x = 308), observer at origin:
  // entry d₀ = 301, reach = d₀ + K·u/d₀ = 301 + 54450/301 ≈ 481.9.
  const q = 32;
  const d0 = entryOf(122); // 301
  const raster = rasterOf([[122, MID, q]]);
  const reach = d0 + (K * (1 - q / H)) / d0;

  it('reach = d₀ + K(1 − h/H)/d₀ — the accumulator root IS the gate reach, one function, one root', () => {
    const walk = beginShadowWalk(raster, 0, 0, 1, 0);
    walk.advanceTo(d0 + 1);
    expect(walk.reach()).toBeCloseTo(reach, 6);
  });

  it('vis equals u just past the obstacle, fades monotonically, and hits exactly 0 at the reach — dark from there to the rim', () => {
    expect(visibilityTo(raster, 0, 0, d0 + 1, 0)).toBeCloseTo(1 - q / H, 2);
    let prev = 2;
    for (let d = d0 + 1; d < reach; d += 10) {
      const v = visibilityTo(raster, 0, 0, d, 0);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      prev = v;
    }
    expect(visibilityTo(raster, 0, 0, reach - 1, 0)).toBeGreaterThan(0);
    expect(visibilityTo(raster, 0, 0, reach + 1, 0)).toBe(0);
    // Residual reach, NOT a dark band (amendment 176): still dark at the rim.
    expect(visibilityTo(raster, 0, 0, R, 0)).toBe(0);
    expect(visibilityTo(raster, 0, 0, R * 2, 0)).toBe(0);
  });
});

describe('hard cover (matrix: h ≥ H — no separate branch, the root just lands at or before the obstacle)', () => {
  it.each([[64], [200], [255]])('q = %i: dark immediately past the obstacle, to the rim', (q) => {
    const raster = rasterOf([[122, MID, q]]);
    const d0 = entryOf(122);
    expect(visibilityTo(raster, 0, 0, d0 + 0.5, 0)).toBe(0);
    expect(visibilityTo(raster, 0, 0, d0 + 100, 0)).toBe(0);
    expect(visibilityTo(raster, 0, 0, R, 0)).toBe(0);
  });
});

describe('near face (matrix: sample AT the obstacle — strictly-nearer-only folding)', () => {
  it('a target exactly at the obstacle cell entry paints at full strength, even against hard cover', () => {
    const raster = rasterOf([[122, MID, 255]]);
    const d0 = entryOf(122);
    const walk = beginShadowWalk(raster, 0, 0, 1, 0);
    walk.advanceTo(d0);
    expect(walk.visibilityAt(d0)).toBe(1); // the cell at d₀ is NOT folded yet
    walk.advanceTo(d0 + 0.5);
    expect(walk.visibilityAt(d0 + 0.5)).toBe(0); // now it is
  });
});

describe('two obstacles (matrix: low near, tall far)', () => {
  const near: readonly [number, number, number] = [111, MID, 16]; // u = 0.75, entry 147
  const far: readonly [number, number, number] = [122, MID, 48]; // u = 0.25, entry 301
  const both = rasterOf([near, far]);
  const onlyNear = rasterOf([near]);
  const onlyFar = rasterOf([far]);

  it('the far obstacle NEAR FACE is evaluated against only the accumulator that stood before it (ordering rule)', () => {
    // The low near obstacle barely constrains: at the far obstacle's entry the
    // combined walk still paints at full strength.
    const d2 = entryOf(122);
    const walk = beginShadowWalk(both, 0, 0, 1, 0);
    walk.advanceTo(d2);
    expect(walk.visibilityAt(d2)).toBe(visibilityTo(onlyNear, 0, 0, d2, 0));
    expect(walk.visibilityAt(d2)).toBe(1);
  });

  it('aMin takes the stronger constraint: combined vis is the min of both single-obstacle curves at every distance', () => {
    for (const d of [200, 310, 350, 380, 391, 420, 500, R]) {
      const a = visibilityTo(onlyNear, 0, 0, d, 0);
      const b = visibilityTo(onlyFar, 0, 0, d, 0);
      expect(visibilityTo(both, 0, 0, d, 0)).toBeCloseTo(Math.min(a, b), 12);
    }
  });
});

describe('the closed forms (amendment 176)', () => {
  it('worst-case reach on a bearing crossing height h is radarRange·√(1 − h/H), attained at exactly half that distance', () => {
    for (const q of [8, 32, 56]) {
      const worst = R * Math.sqrt(1 - q / H);
      const boundary = X0 + 150 * CELL - CELL / 2; // 693
      const atHalf = boundary - worst / 2;
      expect(reachFor(q, 150, atHalf)).toBeCloseTo(worst, 6);
      // Terrain nearer or farther than half-reach hurts less:
      for (const off of [-120, -50, 50, 120]) {
        const ox = atHalf - off;
        if (boundary - ox <= 0) continue;
        expect(reachFor(q, 150, ox)).toBeGreaterThan(worst);
      }
    }
  });
});

describe('off-raster rays (matrix: ray leaves the grid — transparent beyond the disc, no resurrection)', () => {
  it('a bearing that exits the raster stays clear beyond it', () => {
    const sea = rasterOf([]);
    const walk = beginShadowWalk(sea, 1200, 0, 1, 0); // exits at x = 1407
    walk.advanceTo(10_000);
    expect(walk.visibilityAt(10_000)).toBe(1);
  });

  it('a shadow folded inside the raster persists past the raster edge (once dark, dark to the rim)', () => {
    const raster = rasterOf([[190, MID, 200]]); // x = 1260, near the +x edge
    expect(visibilityTo(raster, 1200, 0, 1200 + R, 0)).toBe(0);
  });

  it('an observer far off the raster sees no shadow at all', () => {
    const raster = rasterOf([[122, MID, 255]]);
    expect(visibilityTo(raster, -99_999, 0, -99_000, 0)).toBe(1);
    // Ray that never touches the raster square:
    const walk = beginShadowWalk(raster, 0, 99_999, 1, 0);
    walk.advanceTo(R);
    expect(walk.visibilityAt(R)).toBe(1);
  });
});

describe('degenerate inputs fail OPEN (matrix: no terrain data ⇒ no shadow)', () => {
  const wall = rasterOf([[122, MID, 255]]);

  it('missing raster', () => {
    expect(visibilityTo(null, 0, 0, R, 0)).toBe(1);
    expect(visibilityTo(undefined, 0, 0, R, 0)).toBe(1);
    const walk = beginShadowWalk(null, 0, 0, 1, 0);
    walk.advanceTo(R);
    expect(walk.visibilityAt(R)).toBe(1);
    expect(walk.reach()).toBe(Infinity);
  });

  it('non-finite coordinates or direction, and the zero direction', () => {
    for (const walk of [
      beginShadowWalk(wall, NaN, 0, 1, 0),
      beginShadowWalk(wall, 0, Infinity, 1, 0),
      beginShadowWalk(wall, 0, 0, NaN, 1),
      beginShadowWalk(wall, 0, 0, 0, 0),
    ]) {
      walk.advanceTo(R);
      expect(walk.visibilityAt(R)).toBe(1);
    }
    expect(visibilityTo(wall, NaN, 0, R, 0)).toBe(1);
  });

  it('degenerate query distances: d = 0, negative, NaN and Infinity all return full visibility', () => {
    const walk = beginShadowWalk(wall, 0, 0, 1, 0);
    walk.advanceTo(R);
    expect(walk.visibilityAt(0)).toBe(1);
    expect(walk.visibilityAt(-5)).toBe(1);
    expect(walk.visibilityAt(NaN)).toBe(1);
    expect(walk.visibilityAt(Infinity)).toBe(1);
    expect(walk.visibilityAt(500)).toBe(0); // …while a real query still works
  });

  it('a target on the observer (d = 0 ray) fails open', () => {
    expect(visibilityTo(wall, 300, 0, 300, 0)).toBe(1);
  });

  it('advanceTo(NaN) is a no-op — it never over-folds (ordering is load-bearing), and the walk stays usable', () => {
    const walk = beginShadowWalk(wall, 0, 0, 1, 0);
    walk.advanceTo(NaN);
    expect(walk.visibilityAt(400)).toBe(1); // nothing folded yet
    walk.advanceTo(400);
    expect(walk.visibilityAt(400)).toBe(0); // then a real advance works
  });

  it('H ≤ 0 fails open (patched CONFIG, restored)', () => {
    const vision = CONFIG.vision as unknown as { radarMastQ: number };
    const orig = vision.radarMastQ;
    try {
      vision.radarMastQ = 0;
      expect(visibilityTo(wall, 0, 0, R, 0)).toBe(1);
      vision.radarMastQ = NaN;
      expect(visibilityTo(wall, 0, 0, R, 0)).toBe(1);
    } finally {
      vision.radarMastQ = orig;
    }
  });

  it('non-finite K fails open (patched CONFIG.vision.radar, restored)', () => {
    const vision = CONFIG.vision as unknown as { radar: number };
    const orig = vision.radar;
    try {
      vision.radar = NaN;
      expect(visibilityTo(wall, 0, 0, 660, 0)).toBe(1);
    } finally {
      vision.radar = orig;
    }
  });
});

describe('the folding cadence — the parity contract (server one-shot ≡ client incremental march)', () => {
  it('an incremental walk and a fresh one-shot fold bit-identical accumulators at every distance', () => {
    const raster = rasterOf([
      [111, MID, 16],
      [122, MID, 32],
      [130, MID + 1, 90], // just off the ray — must NOT fold
      [140, MID, 7],
    ]);
    const walk = beginShadowWalk(raster, 0, 0, 1, 0);
    for (let d = 5; d <= R; d += 7.3) {
      walk.advanceTo(d);
      expect(visibilityTo(raster, 0, 0, d, 0)).toBe(walk.visibilityAt(d));
    }
  });

  it('pyramid tile-skips change nothing: the walk agrees with an independent naive per-cell fold on a scattered board at arbitrary angles', () => {
    // Independent oracle: literals (H = 64, K = 108900), no pyramid, no
    // production traversal — boundary crossings enumerated directly.
    const naive = (r: HeightRaster, ox: number, oy: number, dx: number, dy: number, D: number): number => {
      const ts: number[] = [];
      for (let m = -1; m < N; m++) {
        const tx = dx === 0 ? -1 : (X0 + (m + 0.5) * CELL - ox) / dx;
        if (tx > 0 && tx < D) ts.push(tx);
        const ty = dy === 0 ? -1 : (X0 + (m + 0.5) * CELL - oy) / dy;
        if (ty > 0 && ty < D) ts.push(ty);
      }
      ts.sort((a, b) => a - b);
      let aMin = Infinity;
      for (const t of ts) {
        const i = Math.round((ox + dx * (t + 1e-9) - X0) / CELL);
        const j = Math.round((oy + dy * (t + 1e-9) - X0) / CELL);
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const q = r.height[j * N + i];
        if (q <= 0) continue;
        const a = (1 - q / 64) / t + t / 108900;
        if (a < aMin) aMin = a;
      }
      if (aMin === Infinity) return 1;
      return Math.max(0, Math.min(1, D * (aMin - D / 108900)));
    };

    // Deterministic scattered board: ~30 blobs of varied height.
    let s = 0x12345678;
    const rnd = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 2 ** 32);
    const cells: Array<readonly [number, number, number]> = [];
    for (let b = 0; b < 30; b++) {
      const ci = 30 + Math.floor(rnd() * 140);
      const cj = 30 + Math.floor(rnd() * 140);
      const q = 5 + Math.floor(rnd() * 250);
      const rad = 1 + Math.floor(rnd() * 3);
      for (let dj = -rad; dj <= rad; dj++) {
        for (let di = -rad; di <= rad; di++) cells.push([ci + di, cj + dj, q]);
      }
    }
    const raster = rasterOf(cells);

    for (let ray = 0; ray < 25; ray++) {
      const ox = -700 + rnd() * 1400;
      const oy = -700 + rnd() * 1400;
      const ang = rnd() * Math.PI * 2;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const walk = beginShadowWalk(raster, ox, oy, dx, dy);
      for (const d of [90, 240, 410, R]) {
        walk.advanceTo(d);
        expect(walk.visibilityAt(d)).toBeCloseTo(naive(raster, ox, oy, dx, dy, d), 5);
      }
    }
  });
});
