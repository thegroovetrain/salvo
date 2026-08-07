// The `return` grammar's BUFFER and the COEFFICIENT BOUNDS that ride on it —
// pure, no Pixi, no GPU. render/radar.ts only anchors the grid, uploads the bytes
// and positions one sprite; the march that decides what a cell holds is
// radarMarch.test.ts, and PLACEMENT is pinned at the adapter in
// radarViewport.test.ts (amendment 98).
//
// WHAT IS CONTRACT HERE, not coverage:
//
//   • EXACTLY THREE COLORS, NEVER A BLEND (amendment 77). Quantization takes an
//     intensity and returns a band INDEX; every consumer reads that band's color
//     verbatim. No input — negative, NaN, Infinity, a value between two
//     thresholds — can produce anything but one of the three tokens or full
//     transparency.
//
//   • ONE OBJECT SHOWS ALL THREE AT ONCE, and under the beam march it earns them
//     PHYSICALLY rather than from a kernel: a landmass grades red → blue → green
//     out of its own height field and the range term, so a band boundary is an
//     iso-height line (amendment 142). A HULL is now uniform across its footprint,
//     and that is the direct consequence of amendment 141 retiring the bespoke
//     ellipse dome — a hull really is one material at one range, and the dome that
//     used to give it a red core was the kernel the ruling deleted.
//
//   • THE BUFFER IS A SCRATCH SURFACE AND THE LIST IS THE HISTORY (amendment 96).
//     It is world-anchored and snapped to whole cells, so a paint's cells hold
//     still while the camera slides over them; it is re-rasterized in full every
//     frame from the slice list, so nothing ever decays in place.
//
//   • EVERY COEFFICIENT BOUND IS PROVED AT THE WORST DRAW OF THE SHIPPED GRAIN,
//     AND PINNED BY A GRAIN-ON RASTERIZATION (amendment 135). Cycle 61 shipped two
//     coefficients over their ceiling because every bound assertion ran against a
//     noise-OFF fixture, and cycle 62 REPLACED the envelope those bounds were
//     proved against — so all of them are re-derived here, at the new one. A bound
//     proved at nominal is not proved.

import { describe, it, expect } from 'vitest';
import { buildHeightRaster, sampleHeight, type HeightField, type HeightRaster, type Vec2 } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { blipLifeMs } from '../render/phosphor.js';
import { noiseAmplitude } from '../render/radarFalloff.js';
import {
  anchorGrid,
  bandIndex,
  cellCentre,
  cellOf,
  clearGrid,
  makeGrid,
  quantizeInto,
  rasterize,
  sampleGrid,
  stampSlice,
  writeCell,
  type HeatGrid,
  type HeatmapOpts,
} from '../render/radarHeatmap.js';
import { buildField, buildShipStamp, type RadarField } from '../render/radarField.js';
import { marchSlice, returnStrength, type MarchSlice } from '../render/radarMarch.js';

const CFG: HeatmapOpts = CLIENT_CONFIG.blip.heatmap;
/** The shipped knobs with the grain switched off — geometry tests need a
 *  deterministic answer, and a zero envelope is a documented value of the knob.
 *  NOTHING that asserts a coefficient BOUND may use this fixture. */
const CLEAN: HeatmapOpts = { ...CFG, noise: { amount: 0, solidAt: CFG.noise.solidAt } };
const BANDS = CFG.bands;
const MODEL = CFG.model;
const RADAR = 660; // CONFIG.vision.radar at base stats
const LIFE = blipLifeMs(4000); // 15rpm × persistSweeps
const TAU = Math.PI * 2;
const RCELL = 14; // the shipped generator's height-field sample spacing

// --- fixtures --------------------------------------------------------------------

function rasterFrom(reachU: number, h: (x: number, y: number) => number): HeightRaster {
  const k = Math.ceil(reachU / RCELL);
  const n = 2 * k + 1;
  const x0 = -k * RCELL;
  const height = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) height[j * n + i] = h(x0 + i * RCELL, x0 + j * RCELL);
  }
  return { n, cell: RCELL, x0, y0: x0, seaLevel: 0, peak: 255, height, pyramid: [] };
}

function box(cx: number, cy: number, hw: number, hh: number, h: number) {
  return (x: number, y: number): number =>
    Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh ? h : 0;
}

/** Like `rasterFrom`, but with a REAL max-height pyramid built over it —
 *  `rasterFrom`'s empty `pyramid: []` is deliberate for every OTHER suite
 *  (it makes `tileCeilingAt` answer sea level everywhere, so surf never
 *  fires and cannot muddy an unrelated fixture), but the surf suite needs a
 *  pyramid that actually answers queries. `h` is passed straight through as
 *  the quantized height (0-255), so `buildHeightRaster`'s `seaLevel: 0,
 *  peak: 255` quantization is the identity. */
function rasterWithPyramid(reachU: number, h: (x: number, y: number) => number): HeightRaster {
  const k = Math.ceil(reachU / RCELL);
  const n = 2 * k + 1;
  const x0 = -k * RCELL;
  const v = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) v[j * n + i] = h(x0 + i * RCELL, x0 + j * RCELL);
  }
  const field: HeightField = { n, cell: RCELL, x0, y0: x0, v };
  return buildHeightRaster(field, 0, 255);
}

interface FieldParts {
  raster?: HeightRaster | null;
  ring?: { cx: number; cy: number; r: number } | null;
  hulls?: { id: string; x: number; y: number; heading: number; cls: 'battleship' }[];
  model?: typeof MODEL;
}

function fieldOf(obs: Vec2, parts: FieldParts, o: HeatmapOpts): RadarField {
  const model = parts.model ?? o.model;
  return buildField({
    obs,
    raster: parts.raster ?? null,
    ships: buildShipStamp(parts.hulls ?? [], obs, model, o.cellU),
    ring: parts.ring ?? null,
    cellU: o.cellU,
    model,
  });
}

/** One whole revolution as one slice — what the scope holds after a full turn. */
function turn(obs: Vec2, parts: FieldParts, o: HeatmapOpts, t = 0): MarchSlice | null {
  return marchSlice(obs, 0, TAU - 1e-6, fieldOf(obs, parts, o), RADAR, t, o);
}

function grid(o: HeatmapOpts = CLEAN, cx = 0, cy = 0): HeatGrid {
  const g = makeGrid(RADAR, RADAR, o.cellU);
  anchorGrid(g, cx, cy);
  return g;
}

/** How many cells the buffer holds in each band — [green, blue, red]. */
function bandCounts(g: HeatGrid): number[] {
  const out = [0, 0, 0];
  for (let i = 0; i < g.w.length; i++) {
    const b = bandIndex(g.w[i], BANDS);
    if (b >= 0) out[b]++;
  }
  return out;
}

function bandAt(g: HeatGrid, x: number, y: number): number {
  return bandIndex(sampleGrid(g, x, y).w, BANDS);
}

/** Rasterize a slice list at `now`, exactly as render/radar.ts does. */
function raster(g: HeatGrid, slices: MarchSlice[], now = 0): void {
  rasterize(g, slices, { now, lifeMs: LIFE, alphaFloor: 0 });
}

/** March one revolution and rasterize it — the whole pipeline, one call. */
function scope(obs: Vec2, parts: FieldParts, o: HeatmapOpts = CLEAN): HeatGrid {
  const g = grid(o, obs.x, obs.y);
  const s = turn(obs, parts, o);
  if (s !== null) raster(g, [s]);
  return g;
}

// --- 1. the hard-quantization contract ---------------------------------------

describe('quantization is EXACTLY three colors or transparent (amendment 77)', () => {
  it('returns a band index or -1 for every input, and never anything between', () => {
    const inputs = [
      Number.NEGATIVE_INFINITY, -1, -1e-9, 0, Number.MIN_VALUE, 0.0001,
      BANDS[0].at - 1e-9, BANDS[0].at, BANDS[1].at - 1e-9, BANDS[1].at,
      BANDS[2].at - 1e-9, BANDS[2].at, 1, 1e9, Number.POSITIVE_INFINITY, Number.NaN,
    ];
    for (const v of inputs) {
      const b = bandIndex(v, BANDS);
      expect(Number.isInteger(b), `${v}`).toBe(true);
      expect(b).toBeGreaterThanOrEqual(-1);
      expect(b).toBeLessThan(BANDS.length);
    }
    expect(bandIndex(BANDS[0].at, BANDS)).toBe(0);
    expect(bandIndex(BANDS[1].at, BANDS)).toBe(1);
    expect(bandIndex(BANDS[2].at, BANDS)).toBe(2);
    expect(bandIndex(BANDS[0].at - 1e-9, BANDS)).toBe(-1);
  });

  it('non-finite and non-positive intensities paint NOTHING, never a garbage '
    + 'color', () => {
    for (const v of [Number.NaN, Number.NEGATIVE_INFINITY, -1, 0]) {
      expect(bandIndex(v, BANDS), `${v}`).toBe(-1);
    }
  });

  it('the rasterized BYTES are only ever a band token or fully transparent', () => {
    const g = grid();
    for (let i = 0; i < g.w.length; i++) g.w[i] = (i % 40) / 40;
    g.a.fill(1);
    const out = new Uint8Array(g.cols * g.rows * 4);
    quantizeInto(g, BANDS, out);
    const tokens = new Set(BANDS.map((b) => b.color));
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] === 0) continue;
      const rgb = (out[i] << 16) | (out[i + 1] << 8) | out[i + 2];
      expect(tokens.has(rgb), `pixel ${i / 4} is a token`).toBe(true);
    }
  });

  it('and the band ALPHAS are the cycle-62 translucency, in order', () => {
    // Eric on the 4.10 build: "I definitely agree with the translucency, might
    // make it a tad more translucent" (amendment 144). The ratios are what carry
    // the three registers apart, so they are asserted, not just the values.
    expect(BANDS.map((b) => b.alpha)).toEqual([0.4, 0.56, 0.72]);
    expect(BANDS[0].alpha).toBeLessThan(BANDS[1].alpha);
    expect(BANDS[1].alpha).toBeLessThan(BANDS[2].alpha);
    expect(Math.max(...BANDS.map((b) => b.alpha)), 'nothing is opaque').toBeLessThan(0.8);
  });
});

// --- 2. one object shows all three bands -------------------------------------

describe('a landmass shows all three bands at once, and earns them physically', () => {
  /** A dome island: tall in the middle, at sea level on its coast — which is what
   *  the cycle-59 generator's height field actually does. */
  const DOME = rasterFrom(700, (x, y) => {
    const d = Math.hypot(x, y);
    return d > 150 ? 0 : Math.round(255 * (1 - d / 150));
  });
  const OBS: Vec2 = { x: 0, y: -420 };

  it('paints red, blue AND green inside ONE landmass', () => {
    const counts = bandCounts(scope(OBS, { raster: DOME }));
    expect(counts[2], 'a red core').toBeGreaterThan(20);
    expect(counts[1], 'a blue surround').toBeGreaterThan(20);
    expect(counts[0], 'a green fringe').toBeGreaterThan(20);
  });

  it('and the bands are ORDERED by HEIGHT — red inland, green at the waterline', () => {
    const g = scope(OBS, { raster: DOME });
    const byBand: number[][] = [[], [], []];
    for (let cy = 0; cy < g.rows; cy++) {
      for (let cx = 0; cx < g.cols; cx++) {
        const b = bandIndex(g.w[cy * g.cols + cx], BANDS);
        if (b < 0) continue;
        const x = cellCentre(g.baseGx + cx, g.cellU);
        const y = cellCentre(g.baseGy + cy, g.cellU);
        byBand[b].push(sampleHeight(DOME, x, y));
      }
    }
    const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(byBand[2]), 'red sits highest').toBeGreaterThan(mean(byBand[1]));
    expect(mean(byBand[1]), 'blue above green').toBeGreaterThan(mean(byBand[0]));
  });

  it('a LOW island of the same size never reaches red, and a TALL one does', () => {
    const flat = rasterFrom(700, box(0, 0, 90, 90, 2));
    const tall = rasterFrom(700, box(0, 0, 90, 90, 255));
    expect(bandCounts(scope(OBS, { raster: flat }))[2], 'flat: no red').toBe(0);
    expect(bandCounts(scope(OBS, { raster: tall }))[2], 'tall: red').toBeGreaterThan(50);
    // ...and the flat one still paints. Land is land.
    expect(bandCounts(scope(OBS, { raster: flat })).reduce((a, b) => a + b)).toBeGreaterThan(50);
  });

  it('AMENDMENT 78 REGRESSION PIN: a big tall island still reads RED at the '
    + '660u rim, with no `gain` multiplier left to prop it up', () => {
    const far = rasterFrom(900, box(0, 600, 90, 90, 255));
    const g = scope({ x: 0, y: 0 }, { raster: far });
    expect(bandAt(g, 3, 600), 'a headland at the rim is still a big red mass').toBe(2);
  });
});

// --- 3. the buffer is world-anchored scratch ---------------------------------

describe('the buffer is WORLD-anchored, so paints do not shimmer with the camera', () => {
  const RASTER = rasterFrom(500, box(0, 300, 60, 60, 255));
  const OBS: Vec2 = { x: 0, y: 0 };

  it('a static slice keeps the SAME world cells as the camera moves', () => {
    const s = turn(OBS, { raster: RASTER }, CLEAN);
    expect(s).not.toBeNull();
    const readings: number[][] = [];
    for (const centre of [{ x: 0, y: 0 }, { x: 137.5, y: -64.25 }, { x: -400, y: 220 }]) {
      const g = grid(CLEAN, centre.x, centre.y);
      raster(g, [s!]);
      readings.push([bandAt(g, 3, 300), bandAt(g, -33, 273), bandAt(g, 45, 333)]);
    }
    expect(readings[1]).toEqual(readings[0]);
    expect(readings[2]).toEqual(readings[0]);
    expect(readings[0].some((b) => b >= 0), 'the probes are not all empty').toBe(true);
  });

  it('the origin is snapped to a whole cell, always', () => {
    const g = makeGrid(300, 200, CLEAN.cellU);
    for (const c of [{ x: 0, y: 0 }, { x: 3.1, y: -7.9 }, { x: 1234.567, y: -998.4 }]) {
      anchorGrid(g, c.x, c.y);
      expect(g.originX).toBe(g.baseGx * CLEAN.cellU);
      expect(g.originY).toBe(g.baseGy * CLEAN.cellU);
      expect(Number.isInteger(g.baseGx)).toBe(true);
      expect(Number.isInteger(g.baseGy)).toBe(true);
    }
  });

  it('`writeCell` is MAX-WINS and hands the winner BOTH channels', () => {
    const g = grid();
    writeCell(g, 4, 4, 0.5, 0.9);
    writeCell(g, 4, 4, 0.2, 0.1); // loses: intensity and alpha both stay
    const read = (): { w: number; a: number } =>
      sampleGrid(g, cellCentre(4, g.cellU), cellCentre(4, g.cellU));
    expect(read().w).toBeCloseTo(0.5, 6);
    expect(read().a, 'the loser takes neither channel').toBeCloseTo(0.9, 6);
    writeCell(g, 4, 4, 0.8, 0.2); // wins: takes the cell's alpha with it
    expect(read().w).toBeCloseTo(0.8, 6);
    expect(read().a).toBeCloseTo(0.2, 6);
  });

  it('an out-of-buffer cell is dropped silently, and `clearGrid` blanks both '
    + 'channels', () => {
    const g = grid();
    writeCell(g, g.baseGx - 5, g.baseGy - 5, 1, 1);
    writeCell(g, g.baseGx + g.cols + 1, g.baseGy, 1, 1);
    expect(bandCounts(g)).toEqual([0, 0, 0]);
    writeCell(g, g.baseGx + 2, g.baseGy + 2, 1, 1);
    clearGrid(g);
    expect(bandCounts(g)).toEqual([0, 0, 0]);
  });
});

// --- 4. a slice rasterizes identically across its whole decay -----------------

describe('a slice is a historical record: only alpha moves', () => {
  const RASTER = rasterFrom(500, box(0, 300, 60, 60, 200));
  const OBS: Vec2 = { x: 0, y: 0 };

  it('same cells, same bands — only the opacity', () => {
    const s = turn(OBS, { raster: RASTER }, CFG);
    expect(s).not.toBeNull();
    const shot = (now: number): { bands: number[]; alpha: number } => {
      const g = grid(CFG);
      raster(g, [s!], now);
      return { bands: bandCounts(g), alpha: sampleGrid(g, 3, 300).a };
    };
    const fresh = shot(0);
    const old = shot(LIFE * 0.8);
    expect(old.bands, 'the same cells in the same bands').toEqual(fresh.bands);
    expect(old.alpha, 'and it has faded').toBeLessThan(fresh.alpha);
    expect(old.alpha).toBeGreaterThan(0);
  });

  it('a dead slice contributes nothing at all', () => {
    const s = turn(OBS, { raster: RASTER }, CFG);
    const g = grid(CFG);
    raster(g, [s!], LIFE + 1);
    expect(bandCounts(g)).toEqual([0, 0, 0]);
  });

  it('and stacking three revolutions of the SAME world lights exactly the cells '
    + 'one revolution lights — the grain is a property of the PLACE', () => {
    const one = turn(OBS, { raster: RASTER }, CFG, 0);
    const two = turn(OBS, { raster: RASTER }, CFG, 4000);
    const three = turn(OBS, { raster: RASTER }, CFG, 8000);
    const solo = grid(CFG);
    raster(solo, [one!], 8000);
    const stacked = grid(CFG);
    raster(stacked, [one!, two!, three!], 8000);
    expect(bandCounts(stacked), 'idempotent under max-wins').toEqual(bandCounts(solo));
  });

  it('a slice OFF the buffer is skipped by the rasterizer and never removed from '
    + 'the list (amendment 97)', () => {
    const s = turn(OBS, { raster: RASTER }, CLEAN);
    const away = grid(CLEAN, 20_000, 20_000);
    stampSlice(away, s!, 1);
    expect(bandCounts(away), 'nothing drawn off-screen').toEqual([0, 0, 0]);
    const home = grid(CLEAN, 0, 0);
    stampSlice(home, s!, 1);
    expect(bandCounts(home).reduce((a, b) => a + b), 'and everything drawn on it')
      .toBeGreaterThan(0);
  });
});

// --- 5. SEA CLUTTER: three bounds, at the SHIPPED grain -----------------------

/** The worst (luckiest) draw of a pre-grain intensity under the shipped envelope
 *  — amendment 135's `× (1 + a)`, with `a` now a function of the intensity. */
function worst(peak: number): number {
  return peak * (1 + noiseAmplitude(peak, CFG.noise));
}
/** The unluckiest draw of the same. */
function best(peak: number): number {
  return peak * (1 - noiseAmplitude(peak, CFG.noise));
}

describe('SEA CLUTTER is texture and nothing else (amendments 130 + 133 + 136)', () => {
  const OBS: Vec2 = { x: 0, y: 0 };
  const PEAK = MODEL.clutter; // the haze's intensity at the hull (atten ≈ 1)

  it('BOUND 1 — it STRADDLES `bands[0].at`, so the grain speckles it into a '
    + 'haze rather than painting a disc or painting nothing', () => {
    expect(best(PEAK), 'the unluckiest cell is dark').toBeLessThan(BANDS[0].at);
    expect(worst(PEAK), 'the luckiest cell lights').toBeGreaterThan(BANDS[0].at);
  });

  it('BOUND 2 — it is GREEN at every range and can never reach blue, at the '
    + 'luckiest draw', () => {
    expect(worst(PEAK)).toBeLessThan(BANDS[1].at);
  });

  it('BOUND 3 — it can never outrank even the FAINTEST legitimate echo, at the '
    + 'luckiest clutter draw against the unluckiest echo draw', () => {
    expect(worst(PEAK)).toBeLessThan(best(MODEL.minPeak));
  });

  it('RASTERIZED, AT THE SHIPPED GRAIN: the haze paints a SPECKLED GREEN field '
    + 'and not one blue cell', () => {
    const g = scope(OBS, {}, CFG);
    const counts = bandCounts(g);
    expect(counts[0], 'green cells').toBeGreaterThan(30);
    expect(counts[1], 'THE FORBIDDEN BAND: not one blue cell').toBe(0);
    expect(counts[2], 'and no red').toBe(0);
    // Speckled, not solid: a good fraction of the disc stays dark.
    const disc = Math.PI * MODEL.clutterRangeU ** 2 / CFG.cellU ** 2;
    expect(counts[0] / disc, 'lit fraction of the compute disc').toBeLessThan(0.5);
  });

  it('THE HAZE\'S EDGE IS DECIDED BY THE CURVE, not by `clutterRangeU`', () => {
    const g = scope(OBS, {}, CFG);
    let far = 0;
    for (let cy = 0; cy < g.rows; cy++) {
      for (let cx = 0; cx < g.cols; cx++) {
        if (bandIndex(g.w[cy * g.cols + cx], BANDS) < 0) continue;
        const x = cellCentre(g.baseGx + cx, g.cellU);
        const y = cellCentre(g.baseGy + cy, g.cellU);
        far = Math.max(far, Math.hypot(x, y));
      }
    }
    expect(far, 'the last lit cell is well inside the compute bound')
      .toBeLessThan(MODEL.clutterRangeU - 15);
    expect(far, 'and the haze is a real disc, not a speck').toBeGreaterThan(40);
  });

  it('AND IT IS SEA CLUTTER: it paints on no landmass at all — the field answers '
    + 'ONE material per point and terrain outranks it', () => {
    const land = rasterFrom(200, box(0, 0, 60, 60, 1)); // land right under the ship
    const g = scope(OBS, { raster: land }, CFG);
    // Every lit cell inside the slab reads at least the FLAT land coefficient,
    // which is far above anything clutter can produce.
    for (const p of [{ x: 3, y: 3 }, { x: -27, y: 21 }, { x: 45, y: -45 }]) {
      const w = sampleGrid(g, p.x, p.y).w;
      expect(w, `land cell at ${p.x},${p.y}`).toBeGreaterThan(best(MODEL.landFlat) - 1e-9);
    }
  });

  it('and a `minPeak` echo sharing a cell with it wins outright (max-wins)', () => {
    const g = grid(CFG);
    writeCell(g, 0, 0, worst(PEAK), 1);
    writeCell(g, 0, 0, best(MODEL.minPeak), 0.2);
    expect(sampleGrid(g, 3, 3).w).toBeCloseTo(best(MODEL.minPeak), 6);
    expect(sampleGrid(g, 3, 3).a, 'and takes the alpha with it').toBeCloseTo(0.2, 6);
  });
});

// --- 5b. SURF: restored as a field material, two bounds -----------------------

describe('SURF (Story 4.10 amendment 131, restored as a field material by the '
  + 'cycle-62 review gate)', () => {
  const OBS: Vec2 = { x: -260, y: 0 };
  // A straight coastline: land for x <= -50, open water for x > -50, far
  // enough from the observer's own hull that only the fringe is under test.
  const COAST = rasterWithPyramid(700, (x) => (x <= -50 ? 200 : 0));

  it('BOUND 1 — surf can never reach the middle band at the worst noise draw, '
    + 'at any range: attenuation is <= 1 everywhere, so the bare coefficient IS '
    + 'the worst-case pre-grain intensity, at zero range and every range past it', () => {
    expect(worst(MODEL.surf)).toBeLessThan(BANDS[1].at);
  });

  it("BOUND 2 — surf can never read weaker than sea clutter's strongest "
    + "possible reading, even at the two materials' most adversarial draws", () => {
    expect(best(MODEL.surf)).toBeGreaterThan(worst(MODEL.clutter));
  });

  it('THE PROXIMITY TEST IS O(1): a water sample adjacent to a coastline reads '
    + 'surf; one far out to sea reads nothing at all', () => {
    const field = buildField({
      obs: OBS,
      raster: COAST,
      ships: buildShipStamp([], OBS, MODEL, CFG.cellU),
      ring: null,
      cellU: CFG.cellU,
      model: MODEL,
    });
    const near = field.sampleAt(-45, 0); // water, a few units seaward of x=-50
    expect(near, 'a water sample near the coast paints surf').not.toBeNull();
    expect(near!.refl).toBeCloseTo(MODEL.surf, 6);
    // Deep open water, well past both the coastline and the clutter compute
    // bound (own hull sits at x=-260, `clutterRangeU` is 100).
    const far = field.sampleAt(300, 0);
    expect(far, 'far out to sea, nothing paints').toBeNull();
  });

  it('RASTERIZED, AT THE SHIPPED GRAIN: every water cell the fringe paints '
    + "reads green, never blue or red — THE FORBIDDEN BANDS' cell counts "
    + 'are ZERO', () => {
    const g = scope(OBS, { raster: COAST }, CFG);
    let sawWaterPaint = false;
    let blueOrRed = 0;
    for (let cy = 0; cy < g.rows; cy++) {
      for (let cx = 0; cx < g.cols; cx++) {
        const b = bandIndex(g.w[cy * g.cols + cx], BANDS);
        if (b < 0) continue;
        const x = cellCentre(g.baseGx + cx, g.cellU);
        const y = cellCentre(g.baseGy + cy, g.cellU);
        if (sampleHeight(COAST, x, y) !== 0) continue; // a land cell, not surf
        sawWaterPaint = true;
        if (b > 0) blueOrRed++;
      }
    }
    expect(sawWaterPaint, 'the coastline actually painted a fringe').toBe(true);
    expect(blueOrRed, 'not one surf cell in the forbidden bands').toBe(0);
  });

  it('paints on EVERY side of an island, including the side facing away from '
    + 'the observer — nothing occludes anything (amendment 140)', () => {
    const RADIUS = 60;
    const ISLAND = rasterWithPyramid(400, (x, y) => (Math.hypot(x, y) <= RADIUS ? 200 : 0));
    const g = scope({ x: 0, y: -300 }, { raster: ISLAND }, CFG);
    let near = 0; // south of the island: the NEAR face, closest to the observer
    let far = 0; // north of the island: the FAR face, on the OPPOSITE side
    for (let cy = 0; cy < g.rows; cy++) {
      for (let cx = 0; cx < g.cols; cx++) {
        const b = bandIndex(g.w[cy * g.cols + cx], BANDS);
        if (b < 0) continue;
        const x = cellCentre(g.baseGx + cx, g.cellU);
        const y = cellCentre(g.baseGy + cy, g.cellU);
        const d = Math.hypot(x, y);
        if (d <= RADIUS || d > RADIUS + MODEL.surfBandU * 3) continue; // the
        // island itself, or open water well past the fringe — not surf
        if (y < 0) near++;
        else if (y > 0) far++;
      }
    }
    expect(near, 'near-face fringe painted').toBeGreaterThan(0);
    expect(far, 'far-face fringe painted too, exactly as strongly — unshadowed').toBeGreaterThan(0);
  });
});

// --- 6. THE STORM WALL: a band on the LIVE ring ------------------------------

describe('THE STORM WALL (amendment 128): a band on the live ring', () => {
  const OBS: Vec2 = { x: 0, y: 0 };
  const RING = { cx: 0, cy: 0, r: 300 };
  const HALF = MODEL.stormBandU / 2;
  /** The wall alone: clutter zeroed so the near field cannot muddy the counts. */
  const DRY = { ...MODEL, clutter: 0 };

  it('paints a fixed-thickness band on the ring radius, and nothing off it', () => {
    const g = scope(OBS, { ring: RING, model: DRY }, CLEAN);
    expect(bandAt(g, RING.r, 0), 'on the spine').toBeGreaterThanOrEqual(0);
    expect(bandAt(g, 0, RING.r), 'and all the way round').toBeGreaterThanOrEqual(0);
    expect(bandAt(g, RING.r - HALF - 20, 0), 'inside the band').toBe(-1);
    expect(bandAt(g, RING.r + HALF + 20, 0), 'outside it').toBe(-1);
  });

  it('THE BOUND WITH THE GRAIN IN IT: the wall can never read RED, at the '
    + 'luckiest draw', () => {
    expect(worst(MODEL.storm)).toBeLessThan(BANDS[2].at);
  });

  it('RASTERIZED, AT THE SHIPPED GRAIN: blue and green cells, not one red', () => {
    const g = scope(OBS, { ring: RING, model: DRY }, CFG);
    const counts = bandCounts(g);
    expect(counts[1], 'the spine is blue').toBeGreaterThan(50);
    expect(counts[0], 'with a green shoulder').toBeGreaterThan(10);
    expect(counts[2], 'THE FORBIDDEN BAND: a hull is the only red thing').toBe(0);
  });

  it('a ring wholly out of radar range paints nothing', () => {
    const g = scope(OBS, { ring: { cx: 0, cy: 0, r: 4000 }, model: DRY }, CLEAN);
    expect(bandCounts(g)).toEqual([0, 0, 0]);
  });

  it('and the wall is a record of where the ring WAS: re-marching a CLOSED ring '
    + 'does not move the slice already taken', () => {
    const early = turn(OBS, { ring: RING, model: DRY }, CLEAN)!;
    const before = [...early.w];
    turn(OBS, { ring: { ...RING, r: 120 }, model: DRY }, CLEAN);
    expect([...early.w]).toEqual(before);
  });
});

// --- 7. HULLS on the raster ---------------------------------------------------

describe('a hull is stamped into the same raster and painted by the same rules', () => {
  const OBS: Vec2 = { x: 0, y: 0 };

  it('its return lands on its own footprint and reads RED close in', () => {
    const g = scope(OBS, { hulls: [{ id: 'a', x: 0, y: 200, heading: 0, cls: 'battleship' }] }, CLEAN);
    expect(bandAt(g, 0, 200), 'amidships').toBe(2);
    expect(bandAt(g, 0, 400), 'and nothing where there is no hull').toBe(-1);
  });

  it('and a BROADSIDE hull paints a broader mark than a bow-on one', () => {
    const width = (heading: number): number => {
      const g = scope(OBS, { hulls: [{ id: 'a', x: 0, y: 300, heading, cls: 'battleship' }] }, CLEAN);
      let lo = Infinity;
      let hi = -Infinity;
      for (let cy = 0; cy < g.rows; cy++) {
        for (let cx = 0; cx < g.cols; cx++) {
          if (bandIndex(g.w[cy * g.cols + cx], BANDS) < 0) continue;
          const x = cellCentre(g.baseGx + cx, g.cellU);
          lo = Math.min(lo, x);
          hi = Math.max(hi, x);
        }
      }
      return hi - lo;
    };
    expect(width(0)).toBeGreaterThan(width(Math.PI / 2) * 2);
  });

  it('THE GUARANTEE (amendment 127): the weakest legitimate echo still clears '
    + 'the transparency threshold at the SHIPPED grain', () => {
    const floorPeak = returnStrength(
      { refl: 0, geom: 4, ref: MODEL.pointRef, floor: MODEL.pointFloor, min: MODEL.minPeak },
      RADAR,
    );
    expect(floorPeak).toBe(MODEL.minPeak);
    expect(best(floorPeak), 'even at the unluckiest draw').toBeGreaterThan(BANDS[0].at);
  });
});
