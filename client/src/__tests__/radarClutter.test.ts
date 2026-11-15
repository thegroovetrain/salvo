// RAIN CLUTTER ON THE SCOPE (Story 11.6 scope add — render/radarClutter.ts and
// its wiring in render/radar.ts). Contracts: clutter only with rain on; every
// cell inside the step's range and the range never past the radar's; a step's
// cells bounded by the budget; the pooled list bounded; clutter never outranks
// a stronger real return in the same cell, whatever the ages; the Radar paints
// clutter only with a rain frame and an own pose. No pinned literals beyond
// fixture geometry.

import { describe, expect, it, vi } from 'vitest';
vi.setConfig({ testTimeout: 120000 });
import { Container, Texture, TextureSource } from 'pixi.js';
import { CONFIG, fogFrameAt, makeFogField, type FogFrame } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { ClutterTrack, clutterReachU, stampClutter, type ClutterBudget } from '../render/radarClutter.js';
import { RAIN_CLUTTER_DEFAULTS, emptyClutterSlice, type RainClutterOpts } from '../render/rainClutter.js';
import { anchorGrid, makeGrid, rasterize, sampleGrid } from '../render/radarHeatmap.js';
import type { MarchSlice } from '../render/radarMarch.js';
import { Radar } from '../render/radar.js';

vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return {
    ...actual,
    bakeSweepTexture: (): Texture => Texture.EMPTY,
    bakeDimMaskTexture: (_sightU: number, into?: Texture | null): Texture =>
      into ?? new Texture({ source: new TextureSource({ width: 8, height: 8 }) }),
  };
});

const CELL = CLIENT_CONFIG.blip.heatmap.cellU;
const SLICE = CLIENT_CONFIG.blip.heatmap.march.sliceRad;
const OPTS: RainClutterOpts = { ...RAIN_CLUTTER_DEFAULTS, cellU: CELL };
const OCEAN = 5000;
const FIELD = makeFogField(20261114, CONFIG.fog, OCEAN);
const RAIN: FogFrame = fogFrameAt(FIELD, CONFIG.fog.onsetMs + 60_000, 0, 0, 0, CONFIG.zone);
const DRY: FogFrame = fogFrameAt(FIELD, CONFIG.fog.onsetMs + 60_000, null, 0, 0, CONFIG.zone);
/** Near the ring edge, where the bands are thick (the first ring is the whole ocean). */
const OUT = { x: RAIN.R * 0.9, y: 0 };
/** Every tier paints every rained cell: the worst case for the bound. */
const ALL: RainClutterOpts = {
  ...OPTS,
  weak: { ...OPTS.weak, amount: 1 },
  medium: { ...OPTS.medium, amount: 1 },
  heavy: { ...OPTS.heavy, amount: 1 },
};

/** A full revolution of steps from `own` at range `rangeU`; returns the track. */
function revolution(track: ClutterTrack, frame: FogFrame | null, own: { x: number; y: number }, rangeU: number, t = 0): number {
  let cells = 0;
  for (let a = 0; a < Math.PI * 2; a += SLICE) {
    cells += track.step({ frame, ox: own.x, oy: own.y, from: a, to: a + SLICE, t, rangeU });
  }
  return cells;
}

describe('ClutterTrack — clutter slices per beam step', () => {
  it('paints only with rain on (a null or dry frame paints nothing)', () => {
    expect(RAIN.on).toBe(true);
    expect(DRY.on).toBe(false);
    const track = new ClutterTrack(OPTS, 1000);
    expect(revolution(track, null, OUT, 1500)).toBe(0);
    expect(revolution(track, DRY, OUT, 1500)).toBe(0);
    expect(track.slices).toHaveLength(0);
    expect(revolution(track, RAIN, OUT, 1500)).toBeGreaterThan(0);
  });

  it('paints only within the step range, and only inside its sector', () => {
    const track = new ClutterTrack(OPTS, 1000);
    const range = 1200;
    const from = 0.3;
    track.step({ frame: RAIN, ox: OUT.x, oy: OUT.y, from, to: from + SLICE, t: 0, rangeU: range });
    const s = track.slices[0];
    expect(s.n).toBeGreaterThan(0);
    for (let k = 0; k < s.n; k++) {
      const cx = (s.cells[2 * k] + 0.5) * CELL - OUT.x;
      const cy = (s.cells[2 * k + 1] + 0.5) * CELL - OUT.y;
      expect(Math.hypot(cx, cy)).toBeLessThanOrEqual(range);
      const b = Math.atan2(cy, cx);
      expect(b).toBeGreaterThanOrEqual(from - 1e-9);
      expect(b).toBeLessThan(from + SLICE + 1e-9);
    }
  });

  it('holds at most `cap` slices, recycling the oldest', () => {
    const cap = 7;
    const track = new ClutterTrack(OPTS, cap);
    revolution(track, RAIN, OUT, 1500);
    expect(track.slices.length).toBeLessThanOrEqual(cap);
    expect(track.slices.length).toBeGreaterThan(0);
  });

  it('retires slices by time and re-rolls each revolution', () => {
    const track = new ClutterTrack(OPTS, 1000);
    const life = 1000;
    revolution(track, RAIN, OUT, 1500, 0);
    const first = track.slices.map((s) => Array.from(s.cells.subarray(0, 2 * s.n)).join());
    track.prune(life, life);
    expect(track.slices).toHaveLength(0);
    track.wrapped();
    revolution(track, RAIN, OUT, 1500, life);
    const second = track.slices.map((s) => Array.from(s.cells.subarray(0, 2 * s.n)).join());
    expect(second).not.toEqual(first);
  });
});

describe('clutterReachU — the per-step cost bound', () => {
  const B: ClutterBudget = CLIENT_CONFIG.blip.heatmap.rainClutter;

  it('never exceeds the radar range, and is 0 for a bad input', () => {
    expect(clutterReachU(0, 0, null, 500, SLICE, CELL, B)).toBeLessThanOrEqual(500);
    expect(clutterReachU(Number.NaN, 0, null, 500, SLICE, CELL, B)).toBe(0);
    expect(clutterReachU(0, 0, null, 0, SLICE, CELL, B)).toBe(0);
  });

  it('reaches no farther than the padded view corner', () => {
    const view = { x: 100, y: -50, halfW: 600, halfH: 300 };
    const r = clutterReachU(0, 0, view, CONFIG.vision.radar, SLICE, CELL, B);
    const p = 1 + B.viewPadFrac;
    expect(r).toBeLessThanOrEqual(Math.hypot(100 + 600 * p, 50 + 300 * p) + 1e-9);
  });

  it('bounds the cells one step paints, even zoomed out at full radar range with every cell lit', () => {
    const huge = { x: OUT.x, y: OUT.y, halfW: 1e5, halfH: 1e5 };
    const r = clutterReachU(OUT.x, OUT.y, huge, CONFIG.vision.radar, SLICE, CELL, B);
    expect(r).toBeLessThan(CONFIG.vision.radar);
    const track = new ClutterTrack(ALL, 1000);
    let worst = 0;
    for (let a = 0; a < Math.PI * 2; a += SLICE * 9) {
      worst = Math.max(worst, track.step({ frame: RAIN, ox: OUT.x, oy: OUT.y, from: a, to: a + SLICE, t: 0, rangeU: r }));
    }
    expect(worst).toBeGreaterThan(0);
    // cells are counted by center-in-wedge; the area bound holds up to lattice phase
    expect(worst).toBeLessThanOrEqual(B.maxCellsPerStep * 1.15);
  });
});

describe('max-wins: clutter sits under real returns', () => {
  const slice = (gx: number, gy: number, w: number, t: number): MarchSlice => {
    const s = emptyClutterSlice(4);
    s.cells[0] = gx;
    s.cells[1] = gy;
    s.w[0] = w;
    s.n = 1;
    s.t = t;
    s.minX = gx * CELL; s.minY = gy * CELL; s.maxX = (gx + 1) * CELL; s.maxY = (gy + 1) * CELL;
    return s;
  };
  const LIFE = 12_000;

  it('never outranks a stronger real return in the same cell, whatever the ages; covers weaker ones and empty water', () => {
    const g = makeGrid(200, 200, CELL);
    anchorGrid(g, 0, 0);
    const strongOld = slice(1, 1, 0.9, 0); // a hull, painted well before the clutter
    const weakNew = slice(2, 2, 0.1, 5000); // a faint return, newer than the clutter
    rasterize(g, [strongOld, weakNew], { now: 6000, lifeMs: LIFE, alphaFloor: 0 });
    for (const [gx, gy] of [[1, 1], [2, 2], [3, 3]]) stampClutter(g, slice(gx, gy, 0.5, 5500), 0.9);
    const at = (gx: number, gy: number): number => sampleGrid(g, (gx + 0.5) * CELL, (gy + 0.5) * CELL).w;
    expect(at(1, 1)).toBeCloseTo(0.9, 6);
    expect(at(2, 2)).toBeCloseTo(0.5, 6);
    expect(at(3, 3)).toBeCloseTo(0.5, 6);
  });
});

describe('Radar — clutter wired into the march', () => {
  const PERIOD = 60000 / CONFIG.vision.sweepRpm;
  const T0 = 5000;
  const RANGE = 1500;

  function radarWith(frame: FogFrame | null): Radar {
    const radar = new Radar(new Container(), new Container());
    radar.setRanges(CONFIG.vision.sight, RANGE, PERIOD);
    radar.setClutterSource({ frameAt: () => frame });
    radar.onSweepSample(0, T0);
    return radar;
  }
  const play = (radar: Radar, own: { x: number; y: number } | null): void => {
    for (let t = T0; t <= T0 + PERIOD / 4; t += 16) radar.render(own, t, null);
  };

  it('paints clutter in rain, inside the radar range, and none with rain off or with no own pose', () => {
    const wet = radarWith(RAIN);
    play(wet, OUT);
    expect(wet.clutterSlices.length).toBeGreaterThan(0);
    for (const s of wet.clutterSlices) {
      for (let k = 0; k < s.n; k++) {
        const d = Math.hypot((s.cells[2 * k] + 0.5) * CELL - OUT.x, (s.cells[2 * k + 1] + 0.5) * CELL - OUT.y);
        expect(d).toBeLessThanOrEqual(RANGE);
      }
    }
    const dry = radarWith(null);
    play(dry, OUT);
    expect(dry.clutterSlices).toHaveLength(0);
    const spectating = radarWith(RAIN);
    play(spectating, null);
    expect(spectating.clutterSlices).toHaveLength(0);
  });
});
