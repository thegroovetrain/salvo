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
// field (seaLevel 0, peak 255 ⇒ quantized height === field value), because
// generateMap is slow. THE ONE EXCEPTION is the amendment-184 hard-cover
// guardrail at the bottom of this file, whose whole subject is what the real
// generator produces — it pays for five maps and stays under a second.

import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  SEA_HEIGHT,
  beginShadowWalk,
  buildHeightRaster,
  generateMap,
  radarShadowK,
  sampleHeight,
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
    // "Just past the obstacle" is read through the WALK, because the one-shot
    // exempts the TARGET's own cell (see the symmetry suite): a target standing
    // INSIDE the obstacle's own raster cell is not shadowed by it.
    const walk = beginShadowWalk(raster, 0, 0, 1, 0);
    walk.advanceTo(d0 + 1);
    expect(walk.visibilityAt(d0 + 1)).toBeCloseTo(1 - q / H, 2);
    let prev = 2;
    for (let d = d0 + CELL + 1; d < reach; d += 10) {
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
  // "Immediately past" means past the obstacle's own RASTER CELL: a target
  // inside that cell is exempt from it at both ends of the ray (the symmetry
  // suite below), so 0.5u past the cell's near boundary is still full paint.
  it.each([[64], [200], [255]])('q = %i: dark immediately past the obstacle cell, to the rim', (q) => {
    const raster = rasterOf([[122, MID, q]]);
    const d0 = entryOf(122);
    expect(visibilityTo(raster, 0, 0, d0 + CELL + 0.001, 0)).toBe(0); // the very next cell
    expect(visibilityTo(raster, 0, 0, d0 + CELL + 0.5, 0)).toBe(0);
    expect(visibilityTo(raster, 0, 0, d0 + 100, 0)).toBe(0);
    expect(visibilityTo(raster, 0, 0, R, 0)).toBe(0);
    // …and inside the obstacle's own cell the exemption applies, not a fade:
    expect(visibilityTo(raster, 0, 0, d0 + 0.5, 0)).toBe(1);
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

describe('the folding cadence — the parity contract (resumed walk ≡ fresh walk at the same frontier)', () => {
  const cadenceBoard = rasterOf([
    [111, MID, 16],
    [122, MID, 32],
    [130, MID + 1, 90], // just off the ray — must NOT fold
    [140, MID, 7],
  ]);

  it('a RESUMED incremental walk and a FRESH walk advanced straight to the same frontier agree bit-for-bit', () => {
    // This — not "the server and the client agree" — is what the module makes
    // exact. Both callers drive the same DDA, whose every entry distance is
    // derived from a cell-boundary coordinate rather than an accumulated float,
    // so where the frontier is, is all that matters; the two SIDES then differ
    // by their query order and their sample cadence (module header).
    const resumed = beginShadowWalk(cadenceBoard, 0, 0, 1, 0);
    for (let d = 5; d <= R; d += 7.3) {
      resumed.advanceTo(d);
      const fresh = beginShadowWalk(cadenceBoard, 0, 0, 1, 0);
      fresh.advanceTo(d);
      expect(resumed.visibilityAt(d)).toBe(fresh.visibilityAt(d));
      expect(resumed.reach()).toBe(fresh.reach());
    }
  });

  it('the one-shot differs from an advance-to-d walk ONLY on the target cell, and only in the over-painting direction', () => {
    for (let d = 5; d <= R; d += 7.3) {
      const walk = beginShadowWalk(cadenceBoard, 0, 0, 1, 0);
      walk.advanceTo(d);
      // The one-shot exempts the target's own cell, so it can only ever be
      // BRIGHTER — never darker, which is the direction that could hide a
      // contact the client is painting.
      expect(visibilityTo(cadenceBoard, 0, 0, d, 0)).toBeGreaterThanOrEqual(walk.visibilityAt(d));
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

// ---------------------------------------------------------------------------
// SYMMETRY — the spec's Always clause: "Observer and target are both at mast
// height H, so the model is symmetric — A paints B exactly when B paints A."
//
// The observer's own cell has always been exempt (`foldCell`'s `entry <= 0`).
// The TARGET's had no mirror until the cycle-68 review gate: `visibilityTo`
// advanced to `len`, folding every cell entered at `entry < len` INCLUDING the
// one the target itself sits in. A target in a hard-cover cell then read 0 from
// every bearing while reading 1 in the other direction — a one-way stealth
// pocket, invisible to everyone and seeing everyone. Reachable because a hull
// afloat can have its CENTRE round into a land raster cell near a steep coast
// (navigable water measures up to ~q58 against the q64 mast threshold, and
// nothing structural pins that gap).
// ---------------------------------------------------------------------------

describe('symmetry — a cell never occludes a query point inside it, at EITHER end of the ray', () => {
  const target = { x: X0 + 122 * CELL, y: 0 }; // the centre of cell (122, MID)

  it.each([[64], [200], [255]])(
    'q = %i: a target sitting in a hard-cover cell paints from every bearing, and paints back — the ONLY land on the ray is its own cell',
    (q) => {
      const raster = rasterOf([[122, MID, q]]);
      for (let b = 0; b < 16; b++) {
        const ang = (b / 16) * Math.PI * 2;
        const ox = target.x + Math.cos(ang) * 300;
        const oy = target.y + Math.sin(ang) * 300;
        const fwd = visibilityTo(raster, ox, oy, target.x, target.y);
        const rev = visibilityTo(raster, target.x, target.y, ox, oy);
        expect(fwd > 0).toBe(rev > 0); // the Always clause
        expect(fwd).toBe(1);
        expect(rev).toBe(1);
      }
    },
  );

  it('the exemption is EXACTLY one cell: the cell ending 0.001u before the target still occludes', () => {
    const raster = rasterOf([[122, MID, 255]]);
    const d0 = entryOf(122);
    // 0.001u past the obstacle cell's FAR boundary is a different cell, so the
    // obstacle folds normally. An exemption written as "len − one cell" would
    // wrongly spare it.
    expect(visibilityTo(raster, 0, 0, d0 + CELL + 0.001, 0)).toBe(0);
  });

  it('holds over a scattered hard-cover board at arbitrary angles, both endpoints anywhere (including on land)', () => {
    // Hard cover only (q >= H ⇒ u <= 0 ⇒ a <= d/K ⇒ vis <= D(d − D)/K <= 0 for
    // any obstacle at 0 < d < D), so the DARK/LIT verdict cannot depend on
    // WHERE along the chord the cell folded — which is what makes the boolean
    // symmetry exact rather than approximate. (Soft cover is symmetric in the
    // continuous law — vis > 0 ⟺ uK > d(D − d), and d(D − d) is symmetric under
    // d ↦ D − d — but the two directions fold a cell at its near face and at its
    // far face respectively, so they can straddle the root by one cell width.)
    let s = 0x9e3779b9;
    const rnd = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 2 ** 32);
    const cells: Array<readonly [number, number, number]> = [];
    for (let b = 0; b < 24; b++) {
      const ci = 40 + Math.floor(rnd() * 120);
      const cj = 40 + Math.floor(rnd() * 120);
      const q = H + Math.floor(rnd() * (255 - H)); // hard cover only
      const rad = 1 + Math.floor(rnd() * 3);
      for (let dj = -rad; dj <= rad; dj++) {
        for (let di = -rad; di <= rad; di++) cells.push([ci + di, cj + dj, q]);
      }
    }
    const raster = rasterOf(cells);

    let dark = 0;
    for (let n = 0; n < 4000; n++) {
      const ax = -700 + rnd() * 1400;
      const ay = -700 + rnd() * 1400;
      const ang = rnd() * Math.PI * 2;
      const d = 20 + rnd() * (R - 20);
      const bx = ax + Math.cos(ang) * d;
      const by = ay + Math.sin(ang) * d;
      const fwd = visibilityTo(raster, ax, ay, bx, by);
      const rev = visibilityTo(raster, bx, by, ax, ay);
      expect(fwd > 0).toBe(rev > 0);
      if (!(fwd > 0)) dark++;
    }
    expect(dark).toBeGreaterThan(200); // the board really does shadow things
  });
});

// ---------------------------------------------------------------------------
// THE HARD-COVER SHARE — the guardrail amendment 184 promised when it shipped
// `radarMastQ = 64`: "with a test that measures the hard-cover share across
// seeds and pins the accepted spread — so if the generator's height range ever
// moves, the shadow character moves visibly rather than silently."
//
// WHAT IS MEASURED. `H` is ONE knob doing TWO jobs (amendment 177): everything
// in the law is the ratio h/H, so the same number that decides what is an
// ABSOLUTE wall also sets how long every softer shadow is. The operative
// statistic is therefore the CHORD SPINE — the tallest quantized height a
// bearing meets, since a graze samples an island's fringe and a proper crossing
// samples its spine — and "absolute cover" is `spine >= radarMastQ`, which by
// the law gives u <= 0 and a root at or before the obstacle.
//
// This is an INDEPENDENT oracle: it reads the generator's raster through
// `sampleHeight` and never calls the shadow module, so it pins the TERRAIN
// against the threshold rather than re-running the code under test.
// ---------------------------------------------------------------------------

/** Deterministic LCG — the whole measurement is a pure function of the seeds,
 *  so these numbers do not vary run to run and the bands below are about
 *  GENERATOR drift, never flake. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 2 ** 32);
}

/** Land-crossing and absolute-cover counts over `points` random afloat
 *  observers × `bearings` bearings on one real generated map. */
function coverCounts(seed: number, points: number, bearings: number): { land: number; hard: number; rays: number } {
  const map = generateMap(seed); // default player cap ⇒ the production 2400u board
  const raster = map.heightRaster;
  const rnd = lcg(seed * 7919 + 13);
  let land = 0;
  let hard = 0;
  let rays = 0;
  for (let taken = 0, tries = 0; taken < points && tries < points * 50; tries++) {
    const a = rnd() * Math.PI * 2;
    const rad = Math.sqrt(rnd()) * map.radius * 0.97; // area-uniform in the disc
    const ox = Math.cos(a) * rad;
    const oy = Math.sin(a) * rad;
    if (sampleHeight(raster, ox, oy) > SEA_HEIGHT) continue; // afloat only
    taken++;
    for (let b = 0; b < bearings; b++) {
      const ang = ((b + rnd()) / bearings) * Math.PI * 2; // stratified + jittered
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      let spine = SEA_HEIGHT;
      // Half a raster cell: a sweep at 7u / 3.5u / 1.75u / 0.9u moves the
      // measured share by under 0.1pp, so the step is not a lever here.
      for (let d = CELL / 2; d <= R; d += CELL / 2) {
        const q = sampleHeight(raster, ox + dx * d, oy + dy * d);
        if (q > spine) spine = q;
      }
      rays++;
      if (spine > SEA_HEIGHT) {
        land++;
        if (spine >= H) hard++;
      }
    }
  }
  return { land, hard, rays };
}

describe('the shadow character at radarMastQ (amendment 184 guardrail)', () => {
  it('pins the absolute-cover share of land-crossing bearings across real generated maps', () => {
    const seeds = [1, 2, 3, 4, 5];
    let land = 0;
    let hard = 0;
    let rays = 0;
    for (const seed of seeds) {
      const c = coverCounts(seed, 120, 36);
      land += c.land;
      hard += c.hard;
      rays += c.rays;
      // PER-SEED SPREAD IS MAP CHARACTER, NOT DRIFT. `q64` is a fixed point on
      // each map's elevation SCALE, not a percentile of its distribution, so
      // the share genuinely varies by seed — amendment 184 accepts exactly this
      // ("the share of land above it still varies by seed"). Measured over
      // these five: 35.9 / 38.8 / 48.8 / 49.9 / 54.8 %. The wide per-seed band
      // exists only to catch a seed collapsing to all-hard or all-soft.
      expect(c.hard / c.land).toBeGreaterThan(0.25);
      expect(c.hard / c.land).toBeLessThan(0.7);
    }

    // THE POOLED FIGURE IS THE PIN. Measured 45.2% over these five seeds
    // (n = 3197 land-crossing bearings; 45.9% over eight seeds at 3× the
    // sampling, so the estimator is stable).
    //
    // WHY THIS BAND, and it is derived rather than eyeballed:
    //   • FLOOR ON WIDTH — the binomial standard error at n ≈ 3200 and p ≈ 0.45
    //     is 0.9pp, so ±8pp is ~9σ. It cannot fire on sampling noise (and the
    //     sampling is deterministic anyway: fixed seeds, fixed LCG).
    //   • CEILING ON WIDTH — re-running this same measurement at other mast
    //     thresholds gives amendment 177's H-table under this methodology:
    //     q32 → 66.3%, q64 → 44.2%, q96 → 28.2%, q128 → 15.8%. The midpoints
    //     to the neighbouring rungs are 36.2% and 55.3%, so the band fires
    //     BEFORE the shadow character has drifted halfway to a different mast
    //     height — which is the "visibly, not silently" bar amendment 184 set.
    //
    // NOTE ON THE RATIFIED FIGURE. Amendment 177's table reads 38.8% absolute
    // and 17.4% land-crossing, measured on 4 (unrecorded) seeds before the
    // shipped generator settled; this measurement reads ~45% and ~15% on the
    // shipped one. The whole H-table sits ~5pp high under this methodology
    // (61.9/38.8/22.7/12.6 there vs 66.3/44.2/28.2/15.8 here), i.e. the SHAPE
    // Eric chose against is unchanged — a coastal graze costs almost nothing, a
    // spine crossing reliably breaks a lock, and the middle band is wide. The
    // pin is the measured truth, not the prose figure, because a guardrail that
    // pins a number the code does not produce guards nothing.
    const share = hard / land;
    expect(share).toBeGreaterThan(0.37);
    expect(share).toBeLessThan(0.53);

    // And the feature stays SITUATIONAL by construction (amendment 177: most of
    // the scope is never touched either way). Measured 14.8%; amendment 177
    // recorded 17.4%. A generator that pushed this past a quarter of the scope
    // would be a different game whatever the hard-cover share did.
    const crossing = land / rays;
    expect(crossing).toBeGreaterThan(0.09);
    expect(crossing).toBeLessThan(0.22);
  });
});
