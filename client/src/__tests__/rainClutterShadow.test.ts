// RAIN CLUTTER SKIPS ISLAND RADAR SHADOW (Eric 2026-11-15, AskUserQuestion
// "Skip radar shadow"; epic-11 amendment 13(k)) — render/rainClutter.ts (`lit`) and
// its wiring through render/radarClutter.ts. Contracts: a clutter cell the server's
// hull gate would call shadowed (`visibilityTo ≤ 0`) is not emitted, and the
// same cell with the island gone is; cells short of the island are untouched;
// with terrain the emitted set is EXACTLY the terrain-free set filtered by
// that gate; the per-step cell budget still holds.

import { describe, expect, it, vi } from 'vitest';
vi.setConfig({ testTimeout: 120000 });
import {
  CONFIG,
  buildHeightRaster,
  fogFrameAt,
  makeFogField,
  visibilityTo,
  type FogFrame,
  type HeightField,
  type HeightRaster,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { ClutterTrack, clutterReachU } from '../render/radarClutter.js';
import { RAIN_CLUTTER_DEFAULTS, type RainClutterOpts } from '../render/rainClutter.js';

const CELL = CLIENT_CONFIG.blip.heatmap.cellU;
const SLICE = CLIENT_CONFIG.blip.heatmap.march.sliceRad;
const OPTS: RainClutterOpts = { ...RAIN_CLUTTER_DEFAULTS, cellU: CELL };
/** Every tier paints every rained cell, so the shadow is the only thing that removes one. */
const ALL: RainClutterOpts = {
  ...OPTS,
  weak: { ...OPTS.weak, amount: 1 },
  medium: { ...OPTS.medium, amount: 1 },
  heavy: { ...OPTS.heavy, amount: 1 },
};
const FIELD = makeFogField(20261114, CONFIG.fog, 5000);
const RAIN: FogFrame = fogFrameAt(FIELD, 60_000, 0, 0, 0, CONFIG.zone);
const OBS = { x: RAIN.R * 0.9, y: 0 };
const RANGE = 1200;
const RCELL = 14; // the shipped height-field sample spacing
/** The step pointed at the island (toward the ring center, bearing π). */
const FROM = Math.PI - SLICE / 2;
/** The island: hard cover (above the mast height) across the step's bearing, 300–400 u out. */
const NEAR = 300;
const FAR = 400;
const HALF = 150;

/** A height raster with a real pyramid over a square about OBS. */
function rasterAbout(h: (x: number, y: number) => number): HeightRaster {
  const k = Math.ceil((RANGE + 200) / RCELL);
  const n = 2 * k + 1;
  const x0 = OBS.x - k * RCELL;
  const y0 = OBS.y - k * RCELL;
  const v = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) v[j * n + i] = h(x0 + i * RCELL, y0 + j * RCELL);
  }
  const field: HeightField = { n, cell: RCELL, x0, y0, v };
  return buildHeightRaster(field, 0, 255);
}

const island = (x: number, y: number): number =>
  OBS.x - x >= NEAR && OBS.x - x <= FAR && Math.abs(y - OBS.y) <= HALF ? 255 : 0;
const ISLAND = rasterAbout(island);
const SEA = rasterAbout(() => 0);

type Cell = { gx: number; gy: number; d: number };

/** The cells one step emits from OBS. */
function stepCells(raster: HeightRaster | null, from = FROM, opts = ALL, rangeU = RANGE): Cell[] {
  const track = new ClutterTrack(opts, 4);
  track.step({ frame: RAIN, ox: OBS.x, oy: OBS.y, from, to: from + SLICE, t: 0, rangeU, raster });
  const s = track.slices[0];
  const out: Cell[] = [];
  if (s === undefined) return out;
  for (let k = 0; k < s.n; k++) {
    const gx = s.cells[2 * k];
    const gy = s.cells[2 * k + 1];
    out.push({ gx, gy, d: Math.hypot((gx + 0.5) * CELL - OBS.x, (gy + 0.5) * CELL - OBS.y) });
  }
  return out;
}

const keys = (cs: Cell[]): string[] => cs.map((c) => `${c.gx},${c.gy}`).sort();
const lit = (c: Cell): boolean => visibilityTo(ISLAND, OBS.x, OBS.y, (c.gx + 0.5) * CELL, (c.gy + 0.5) * CELL) > 0;

describe('rain clutter and island radar shadow', () => {
  const open = stepCells(null);
  const behind = open.filter((c) => c.d > FAR + RCELL && !lit(c));

  it('the fixture has rained cells in the island shadow (the test is not vacuous)', () => {
    expect(RAIN.on).toBe(true);
    expect(behind.length).toBeGreaterThan(10);
  });

  it('does not emit a cell directly behind the island (in the shadow walk\'s shadow)', () => {
    const got = new Set(keys(stepCells(ISLAND)));
    for (const c of behind) expect(got.has(`${c.gx},${c.gy}`)).toBe(false);
  });

  it('emits the same cells with the island removed', () => {
    const got = new Set(keys(stepCells(SEA)));
    for (const c of behind) expect(got.has(`${c.gx},${c.gy}`)).toBe(true);
    expect(keys(stepCells(SEA))).toEqual(keys(open));
  });

  it('leaves the cells in front of the island unaffected', () => {
    const front = (cs: Cell[]): string[] => keys(cs.filter((c) => c.d < NEAR - RCELL));
    expect(front(open).length).toBeGreaterThan(0);
    expect(front(stepCells(ISLAND))).toEqual(front(open));
  });

  it('emits exactly the terrain-free clutter the server\'s hull gate would paint, over a whole revolution', () => {
    let checked = 0;
    for (let a = 0; a < Math.PI * 2; a += SLICE) {
      const want = keys(stepCells(null, a).filter(lit));
      expect(keys(stepCells(ISLAND, a))).toEqual(want);
      checked += want.length;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('still holds the per-step cell budget with terrain, zoomed out at full radar range', () => {
    const B = CLIENT_CONFIG.blip.heatmap.rainClutter;
    const huge = { x: OBS.x, y: OBS.y, halfW: 1e5, halfH: 1e5 };
    const r = clutterReachU(OBS.x, OBS.y, huge, CONFIG.vision.radar, SLICE, CELL, B);
    let worst = 0;
    for (let a = 0; a < Math.PI * 2; a += SLICE * 9) worst = Math.max(worst, stepCells(ISLAND, a, ALL, r).length);
    expect(worst).toBeGreaterThan(0);
    // cells are counted by center-in-wedge; the area bound holds up to lattice phase
    expect(worst).toBeLessThanOrEqual(B.maxCellsPerStep * 1.15);
  });
});
