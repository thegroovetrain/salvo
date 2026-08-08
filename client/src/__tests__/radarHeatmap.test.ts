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
import { CONFIG, buildHeightRaster, coverageHas, hullSilhouette, paintCoverage, perpendicularExtent, sampleHeight, transformPolygon, type HeightField, type HeightRaster, type HullId, type Vec2 } from '@salvo/shared';
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
import { buildField, buildShipStamp, coverageExtent, hullSample, shipOnlyField, stampCoverage, type RadarField, type ShipStamp } from '../render/radarField.js';
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
  hulls?: { id: string; x: number; y: number; heading: number; cls: HullId }[];
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
    quantizeInto(g, BANDS, CFG.bandAlpha, out);
    const tokens = new Set(BANDS.map((b) => b.color));
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] === 0) continue;
      const rgb = (out[i] << 16) | (out[i + 1] << 8) | out[i + 2];
      expect(tokens.has(rgb), `pixel ${i / 4} is a token`).toBe(true);
    }
  });

  // CYCLE 64, amendment 160. Eric: "I told you pretty clearly not to vary the
  // intensity per color band. At all... There's no darker blue because its 'less
  // intense in the moderate band.' That's not what the colors are for."
  //
  // The ramp cycle 63 shipped is now unrepresentable (a `HeatBand` has no alpha
  // member), but the ARITHMETIC could still reintroduce it, so pin the property
  // rather than the type: at one age, opacity must not depend on which band a
  // pixel landed in, nor on how far into that band its intensity sat.
  it('OPACITY IS AGE ALONE: every band draws at the same opacity, and intensity '
    + 'within a band does not change it', () => {
    const g = grid();
    // One intensity per band, plus a second well inside each band, so the sweep
    // covers both "different band" and "same band, different strength".
    const probes = [0.13, 0.30, 0.37, 0.60, 0.71, 0.99];
    for (let i = 0; i < g.w.length; i++) g.w[i] = probes[i % probes.length];
    g.a.fill(1); // same age everywhere — the only channel allowed to move opacity
    const out = new Uint8Array(g.cols * g.rows * 4);
    quantizeInto(g, BANDS, CFG.bandAlpha, out);
    const alphas = new Set<number>();
    for (let i = 0; i < out.length; i += 4) if (out[i + 3] > 0) alphas.add(out[i + 3]);
    expect(alphas.size, `lit pixels used ${[...alphas].join('/')} — expected ONE`).toBe(1);
    expect([...alphas][0]).toBe(Math.round(255 * CFG.bandAlpha));
  });

  it('...and AGE still moves it, so phosphor decay survives', () => {
    const g = grid();
    g.w.fill(0.99); // all red, so band can never be the cause
    for (let i = 0; i < g.a.length; i++) g.a[i] = i % 2 === 0 ? 1 : 0.4;
    const out = new Uint8Array(g.cols * g.rows * 4);
    quantizeInto(g, BANDS, CFG.bandAlpha, out);
    const alphas = new Set<number>();
    for (let i = 0; i < out.length; i += 4) if (out[i + 3] > 0) alphas.add(out[i + 3]);
    expect(alphas.size, 'two ages must give two opacities').toBe(2);
  });

  // REPLACES the cycle-62 test that asserted the per-band ramp (0.4/0.56/0.72)
  // was present and ORDERED. That test pinned exactly what amendment 160 struck
  // out, so it is retired rather than adapted — an adapted version would have
  // gone on asserting the shape of a thing that no longer exists.
  it('and a BAND HAS NO OPACITY OF ITS OWN — the ramp is unrepresentable', () => {
    for (const b of BANDS) {
      expect(Object.keys(b).sort(), 'a band is a threshold and a colour, nothing else')
        .toEqual(['at', 'color']);
    }
    // The one shared opacity is still translucent (amendment 144's ratification
    // survives the ramp's removal — Eric ratified the translucency, not the ramp).
    expect(CFG.bandAlpha, 'nothing is opaque').toBeLessThan(0.8);
    expect(CFG.bandAlpha).toBeGreaterThan(0);
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

/**
 * THE SNR ENVELOPE, RE-IMPLEMENTED HERE AND ONLY HERE — the oracle every
 * coefficient bound below is proved against.
 *
 * IT DELIBERATELY DOES NOT CALL `noiseAmplitude`. Using production as its own
 * oracle is how a bound and its assertion move together: reshape the envelope and
 * every bound silently re-derives to whatever the new shape happens to permit,
 * which is amendment 135's failure ("a bound proved at nominal is not proved")
 * wearing a different hat. Written from the RULING instead — amendment 143's
 * amplitude ramps linearly from `amount` at zero signal to zero at `solidAt`, and
 * is zero at or above it — in a different algebraic form from the production one,
 * so a shape bug shows up as a DISAGREEMENT rather than as a shared assumption.
 * The agreement itself is asserted directly, once, below; that is the same
 * pattern radarMarch.test.ts uses for the retired `faceShadow` A/B.
 */
function envelope(p: number): number {
  const { amount, solidAt } = CFG.noise;
  if (!(p > 0)) return amount;
  if (p >= solidAt) return 0;
  return (amount * (solidAt - p)) / solidAt;
}

/** The worst (luckiest) draw of a pre-grain intensity — amendment 135's
 *  `× (1 + a)`, with `a` a function of the intensity. */
function worst(peak: number): number {
  return peak * (1 + envelope(peak));
}
/** The unluckiest draw of the same. */
function best(peak: number): number {
  return peak * (1 - envelope(peak));
}

describe('the bound oracle is independent of the code it judges', () => {
  it('the re-implemented envelope agrees with production at every intensity — so '
    + 'a shape change fails HERE rather than quietly moving every bound', () => {
    for (let p = -0.2; p <= 1.2; p += 0.017) {
      expect(envelope(p), `intensity ${p.toFixed(3)}`)
        .toBeCloseTo(noiseAmplitude(p, CFG.noise), 12);
    }
    expect(envelope(0)).toBeCloseTo(CFG.noise.amount, 12);
    expect(envelope(CFG.noise.solidAt)).toBe(0);
  });
});

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
    // Re-derived at the cycle-63 9u lattice: the compute disc holds ~2.25×
    // fewer cells than at 6u, so the speckle's absolute count drops with it
    // (measured 14 at the shipped straddle; the FRACTION is unchanged).
    expect(counts[0], 'green cells').toBeGreaterThan(8);
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

// --- 5a. THE WATERLINE COEFFICIENT, at the shipped grain ----------------------
//
// `landFlat` shipped at 0.3 with a comment asserting the waterline reads GREEN,
// and 0.3 × 1.257 = 0.377 is BLUE. Third time amendment 135's rule has caught a
// coefficient proved at nominal, and the first where the same value also has a
// floor under it — so both ends are stated here, at the draw.

describe('the WATERLINE is green and still outranks sea state (amendment 129)', () => {
  /** THE FAINTEST MATERIAL ANY ISLAND CAN PRODUCE, and the value both bounds are
   *  stated at. NOT `landFlat`, which is the coefficient at height ZERO and
   *  therefore at WATER: the generator seals the lowest LAND at quantized height
   *  1, so the real waterline is one step up the lerp. Bounding the coefficient
   *  instead of the material is exactly the understatement that let 0.3 ship. */
  const WATERLINE = MODEL.landFlat + (MODEL.landSteep - MODEL.landFlat) / MODEL.refHeight;

  it('BOUND 1 — a mudflat can never reach the middle band at the luckiest draw, '
    + 'at ANY range: attenuation is <= 1, so the bare coefficient IS the '
    + 'worst-case pre-grain intensity', () => {
    expect(WATERLINE, 'the waterline is above the height-0 coefficient')
      .toBeGreaterThan(MODEL.landFlat);
    expect(worst(WATERLINE)).toBeLessThan(BANDS[1].at);
  });

  it('BOUND 2 — the weakest land cell in the game still outranks the strongest '
    + 'sea-clutter cell, at the two materials\' most adversarial draws', () => {
    // The waterline, at the 660u rim: the faintest thing the terrain layer can
    // produce anywhere on any map.
    const rim = WATERLINE * (0.05 + 0.95 / (1 + (RADAR / MODEL.surfaceRef) ** 3));
    expect(best(rim)).toBeGreaterThan(worst(MODEL.clutter));
  });

  it('RASTERIZED, AT THE SHIPPED GRAIN: a flat island paints GREEN cells and not '
    + 'one blue — THE FORBIDDEN BAND\'S CELL COUNT IS ZERO', () => {
    // Sea level exactly (h = 1 is the generator\'s waterline), close in, where
    // attenuation is nearest 1 and the coefficient is at its most exposed.
    const flat = rasterFrom(400, box(0, 0, 120, 120, 1));
    const counts = bandCounts(scope({ x: 0, y: -260 }, { raster: flat }, CFG));
    expect(counts[0], 'a green waterline').toBeGreaterThan(50);
    expect(counts[1], 'THE FORBIDDEN BAND: not one blue mudflat cell').toBe(0);
    expect(counts[2], 'and no red').toBe(0);
  });

  it('and a real island still spans ALL THREE registers at the shipped grain — '
    + 'the property the coefficient is placed under `bands[1].at` FOR', () => {
    const dome = rasterFrom(700, (x, y) => {
      const d = Math.hypot(x, y);
      return d > 150 ? 0 : Math.round(255 * (1 - d / 150));
    });
    const counts = bandCounts(scope({ x: 0, y: -420 }, { raster: dome }, CFG));
    expect(counts[2], 'RED on genuine highland').toBeGreaterThan(20);
    expect(counts[1], 'BLUE across its slopes').toBeGreaterThan(20);
    expect(counts[0], 'GREEN at the waterline').toBeGreaterThan(20);
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

  /** The coast field, for direct per-point interrogation. */
  function coastField(): RadarField {
    return buildField({
      obs: OBS,
      raster: COAST,
      ships: buildShipStamp([], OBS, MODEL, CFG.cellU),
      ring: null,
      cellU: CFG.cellU,
      model: MODEL,
    });
  }

  it('THE PROXIMITY TEST IS O(1): a water sample adjacent to a coastline reads '
    + 'surf; one far out to sea reads nothing at all', () => {
    const field = coastField();
    const near = field.sampleAt(-45, 0); // water, a few units seaward of x=-50
    expect(near, 'a water sample near the coast paints surf').not.toBeNull();
    expect(near!.refl).toBeCloseTo(MODEL.surf, 6);
    // Deep open water, well past both the coastline and the clutter compute
    // bound (own hull sits at x=-260, `clutterRangeU` is 100).
    const far = field.sampleAt(300, 0);
    expect(far, 'far out to sea, nothing paints').toBeNull();
  });

  it('THE BAND IS FLAT, AND THE READ CANNOT MAKE IT OTHERWISE — amendment 131 '
    + 'ruled a weak SEAWARD fringe, and this pins the reason the shipped band '
    + 'has no taper rather than leaving the gap silent', () => {
    const field = coastField();
    // Every cell the fringe paints reads the same coefficient...
    const lit: number[] = [];
    for (let x = -49; x < 200; x += 2) {
      const s = field.sampleAt(x, 0);
      if (s !== null && Math.abs(s.refl - MODEL.surf) < 1e-9) lit.push(x);
    }
    expect(lit.length, 'the fringe paints').toBeGreaterThan(0);
    // ...because there is nowhere to put a gradient: the band is ONE pyramid tile
    // (28u at the shipped `surfBandU`) against a 14u raster spacing, so every
    // surf sample is within a single raster sample of land on its own axis. There
    // is no finer read in the raster or the pyramid to grade against.
    const coast = -50;
    for (const x of lit) {
      expect(x - coast, `surf at x=${x} is within one raster sample of the coast`)
        .toBeLessThanOrEqual(RCELL + 1e-9);
    }
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

// --- 8. THE CORE→EDGE TERM (cycle 63, the amendment-77 pin) --------------------
//
// The point of the whole cycle: intensity is per PIXEL again, with "depth
// inside the coverage mask" as the core→edge term, so one hull shows a strong
// core and a weaker fringe at once instead of quantizing to a single per-object
// colour label. These run at the SHIPPED grain — a structural claim proved at
// nominal is not proved (amendment 135).

describe('one hull spans MORE THAN ONE BAND at the shipped grain, strongest at its core (amendment 77)', () => {
  const OBS: Vec2 = { x: 0, y: 0 };
  /** A mine layer broadside at 520u: its core sits above the red threshold
   *  with margin (unsaturated, so "strongest" is a real comparison) and its
   *  fuzz fringe grades into the blue/green registers. The mask is the
   *  production paint — `paintCoverage` at the same seed time the test's
   *  `buildShipStamp` default uses (0), so the probe walks the exact cells
   *  the stamp laid down. */
  const HULL = { id: 'a', x: 0, y: 520, heading: 0, cls: 'mineLayer' as HullId };

  function litFootprintBands(g: HeatGrid): { bands: Set<number>; centre: number; strongest: number } {
    const cov = paintCoverage(HULL.cls, HULL.x, HULL.y, HULL.heading, CFG.cellU, 0);
    const bands = new Set<number>();
    let strongest = 0;
    for (let row = 0; row < cov.h; row++) {
      for (let col = 0; col < cov.w; col++) {
        if (!coverageHas(cov, col, row)) continue;
        const w = sampleGrid(g, (cov.gx + col + 0.5) * CFG.cellU, (cov.gy + row + 0.5) * CFG.cellU).w;
        if (!(w > 0)) continue;
        strongest = Math.max(strongest, w);
        const b = bandIndex(w, BANDS);
        if (b >= 0) bands.add(b);
      }
    }
    return { bands, centre: sampleGrid(g, HULL.x, HULL.y).w, strongest };
  }

  it('paints a RED core and a weaker fringe on one hull, at the SHIPPED grain', () => {
    const g = scope(OBS, { hulls: [HULL] }, CFG); // CFG: the shipped envelope, not CLEAN
    const { bands, centre, strongest } = litFootprintBands(g);
    expect(bandAt(g, HULL.x, HULL.y), 'the core reads red').toBe(2);
    expect(bands.size, 'and the footprint spans more than one band').toBeGreaterThanOrEqual(2);
    // Strongest at the core, within the depth term's quantization: the fuzzed
    // mask's deepest cell can sit a cell off the hull centre (dilation and a
    // stretch draw shift the depth centroid — amendments 156-157), so the pin
    // is that the hull cell reads within a band-width of the peak, never that
    // it IS the peak to float precision.
    expect(centre).toBeGreaterThan(strongest * 0.9);
  });

  it('a fogged wire footprint and a client-rasterized contact of the same pose paint IDENTICAL intensities (two sources, one appearance — amendment 154)', () => {
    // Both sources run the same shared paint pipeline (rasterize + fuzz at
    // the same seed) and the same stamp, so the buffers must agree cell for
    // cell — the inside/outside split survives but stops being visible. The
    // "wire" side stamps the coverage the server would send; the "contact"
    // side rasterizes from the pose.
    const viaContact = scope(OBS, { hulls: [HULL] }, CFG);
    const cov = paintCoverage(HULL.cls, HULL.x, HULL.y, HULL.heading, CFG.cellU, 0);
    const stamp: ShipStamp = new Map();
    stampCoverage(stamp, cov, OBS, CFG.model, CFG.cellU);
    const g = grid(CFG, OBS.x, OBS.y);
    const s = marchSlice(OBS, 0, TAU - 1e-6, shipOnlyField(stamp, CFG.cellU), RADAR, 0, CFG);
    if (s !== null) raster(g, [s]);
    for (let row = 0; row < cov.h; row++) {
      for (let col = 0; col < cov.w; col++) {
        const x = (cov.gx + col + 0.5) * CFG.cellU;
        const y = (cov.gy + row + 0.5) * CFG.cellU;
        expect(sampleGrid(g, x, y).w, `cell ${col},${row}`).toBeCloseTo(sampleGrid(viaContact, x, y).w, 9);
      }
    }
  });
});

describe('the mask-derived extent preserves the amendment-118 crossover as a BAND (cycle 63)', () => {
  const OBS: Vec2 = { x: 0, y: 0 };
  /** The calibration pose swept across lattice phases AND glint seeds — every
   *  mask this path sees in production is fuzzed, so the pins run on
   *  `paintCoverage`, never the sharp rasterization. */
  function fuzzedExtents(n: number): number[] {
    const at = CONFIG.vision.farRadar; // the 7/8 rung — a test INPUT, never on a paint path
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      const x = (k * 37.3) % CFG.cellU;
      const y = at + ((k * 53.7) % CFG.cellU);
      const cov = paintCoverage('mineLayer', x, y, 0, CFG.cellU, 1000 + k * 50);
      out.push(coverageExtent(cov, OBS, CFG.cellU));
    }
    return out;
  }

  it('coverageExtent of the calibration hull: every fuzzed paint within 2 cells of truth, and the MEAN within half a cell', () => {
    const truth = perpendicularExtent(
      transformPolygon(hullSilhouette('mineLayer'), 0, CONFIG.vision.farRadar, 0),
      Math.PI / 2,
    );
    expect(truth).toBeCloseTo(CONFIG.shipClasses.mineLayer.hull.length, 9);
    const exts = fuzzedExtents(60);
    for (const ext of exts) expect(Math.abs(ext - truth)).toBeLessThanOrEqual(2 * CFG.cellU);
    const mean = exts.reduce((s, v) => s + v, 0) / exts.length;
    expect(Math.abs(mean - truth), 'the -3-cell fuzz compensation centres the read').toBeLessThanOrEqual(CFG.cellU / 2);
  });

  it('THE CROSSOVER IS A BAND, NOT A NUMBER — pinned at the WORST lattice phase and glint draw', () => {
    // Amendment 118 requires the red→blue crossover to EMERGE from the 1/d⁴
    // curve fitted to the 7/8 rung; it now emerges from the curve PLUS the
    // lattice phase PLUS the per-paint glint (the extent is a cell-quantized,
    // scintillating reconstruction — amendments 156-157), so the crossover is
    // a BAND about the rung whose width is a lattice-and-fuzz consequence.
    // Documented rather than hidden (cycle-63 review gate), and RE-DERIVED at
    // the 9u lattice as the gate requires (a coarser lattice widens the
    // band): measured over 60 phase×seed draws the calibration hull's
    // crossover spans roughly [rung − 60u, rung + 35u] — the extent reads
    // 72-99u against the true 88 and the fourth-root curve turns that ±15%
    // into ∓10% of range. The worst draw is pinned at 7 cells and the MEAN
    // within ~one cell — the fit still centres the band; a paint at the rung
    // simply shimmers between "definitely" and "probably" sweep to sweep,
    // which is what a marginal contact on a real scope does. (Sweeping only
    // one phase, as the pre-gate pin did, tested a point of a distribution
    // and called it the distribution.)
    const fitAt = CONFIG.vision.farRadar;
    const crossings = fuzzedExtents(60).map((ext) => {
      for (let d = 400; d <= 700; d += 0.5) {
        if (returnStrength(hullSample(ext, MODEL), d) < BANDS[2].at) return d;
      }
      return Number.NaN;
    });
    let worst = 0;
    let sum = 0;
    for (const c of crossings) {
      expect(Number.isFinite(c)).toBe(true);
      worst = Math.max(worst, Math.abs(c - fitAt));
      sum += c;
    }
    expect(worst, 'the worst draw stays inside the band').toBeLessThanOrEqual(7 * CFG.cellU);
    expect(Math.abs(sum / crossings.length - fitAt), 'and the band is centred on the rung').toBeLessThanOrEqual(CFG.cellU + 1);
  });
});
