// THE COUNTERMEASURE CLOUD IS A RADAR RETURN SOURCE (Story 9.3 session 4, Eric
// 2026-10-12: "It's not being read by radar. Don't forget to composite it onto
// the radar layer so it can be painted. It should give returns in strength
// based on how thick the smoke is."). The Radar pulls the cloud haze through
// `setCloudSource` and its beam march reads it
// as one more field material — so the echo lands in the HEAT GRID and from
// there is swept, shadowed, banded and decayed by the grid's own rules.
// Contracts only: no literal intensity, no band pins.

import { describe, it, expect, vi } from 'vitest';
import { Container, Texture, TextureSource } from 'pixi.js';
import { CONFIG, buildHeightRaster, cloudOutlineRadius, mulberry32, wrapPositive, type HeightField, type HeightRaster } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { Countermeasure } from '../render/countermeasure.js';
import { Radar, type CloudReturnSource } from '../render/radar.js';
import { sampleGrid, type HeatGrid } from '../render/radarHeatmap.js';

vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return {
    ...actual,
    bakeSweepTexture: (): Texture => Texture.EMPTY,
    bakeDimMaskTexture: (_sightU: number, into?: Texture | null): Texture =>
      into ?? new Texture({ source: new TextureSource({ width: 8, height: 8 }) }),
    bakeHaloMaskTexture: (_haloU: number, into?: Texture | null): Texture =>
      into ?? new Texture({ source: new TextureSource({ width: 8, height: 8 }) }),
  };
});

const PERIOD = 60000 / CONFIG.vision.sweepRpm;
const RANGE = CONFIG.vision.radar;
const CELL = CLIENT_CONFIG.blip.heatmap.cellU;
const MIN = CLIENT_CONFIG.countermeasure.radarPaintMin;
const OWN = { x: 0, y: 0 };
const T0 = 5000;
/** The beam starts on bearing 0 at T0 and sweeps a quarter turn by QUARTER. */
const QUARTER = T0 + PERIOD / 4;

/** A synthetic cloud source from a haze function. */
const source = (haze: (x: number, y: number) => number): CloudReturnSource => ({ size: 1, coverAt: haze });

/** Haze `h` over the annular sector [r0, r1] × [b0, b1] (bearings from OWN). */
const sector = (h: number, r0: number, r1: number, b0: number, b1: number) => (x: number, y: number): number => {
  const d = Math.hypot(x, y);
  const b = wrapPositive(Math.atan2(y, x));
  return d >= r0 && d <= r1 && b >= b0 && b <= b1 ? h : 0;
};

function radarWith(src: CloudReturnSource | null, raster: HeightRaster | null = null): { radar: Radar; blip: Container } {
  const blip = new Container();
  const radar = new Radar(blip, new Container());
  radar.setCloudSource(src);
  if (raster !== null) radar.setHeightRaster(raster);
  radar.onSweepSample(0, T0);
  return { radar, blip };
}

/** Render frames from `from` to `to` at 16 ms (beam extrapolated from T0). */
function play(radar: Radar, from: number, to: number, own: { x: number; y: number } | null = OWN, each?: (t: number) => void): void {
  for (let t = from; t <= to; t += 16) {
    radar.render(own, t, null);
    each?.(t);
  }
}

const gridOf = (radar: Radar): HeatGrid | null =>
  (radar as unknown as { heat: { grid: HeatGrid } | null }).heat?.grid ?? null;

/** Every heat cell centre in the radar-ring window around OWN. */
function cellCentres(): { x: number; y: number }[] {
  const out = [];
  const k = Math.ceil(RANGE / CELL) + 2;
  for (let j = -k; j <= k; j++) for (let i = -k; i <= k; i++) out.push({ x: (i + 0.5) * CELL, y: (j + 0.5) * CELL });
  return out;
}

/** Is a cell centre within the swept bearings [b0, b1], give or take one cell? */
function nearArc(x: number, y: number, b0: number, b1: number): boolean {
  const d = Math.hypot(x, y);
  const tol = d > 0 ? (CELL * 1.5) / d : Math.PI;
  const b = wrapPositive(Math.atan2(y, x));
  return wrapPositive(b - (b0 - tol)) <= b1 - b0 + 2 * tol;
}

const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;

describe('the cloud paints the HEAT grid where the beam sweeps hazy cells, and nowhere else', () => {
  it('a real held cloud on the scope: the swept, hazy cells gain heat over a scope with no cloud source; nothing else differs', () => {
    // STEP-1 regression: on HEAD the cloud never reached the heat grid at all.
    const cm = new Countermeasure(new Container(), mulberry32(3).next);
    cm.sync([{ id: 'c', x: 220, y: 140, t0: 0 }]);
    cm.render(T0); // a built body, frozen for the sweep
    const withCloud = radarWith(cm);
    const control = radarWith(null);
    play(withCloud.radar, T0, QUARTER);
    play(control.radar, T0, QUARTER);
    let gained = 0;
    for (const c of cellCentres()) {
      const a = withCloud.radar.intensityAt(c.x, c.y);
      const b = control.radar.intensityAt(c.x, c.y);
      if (a === b) continue;
      expect(cm.coverAt(c.x, c.y), `(${c.x}, ${c.y}) differs but is not hazy`).toBeGreaterThanOrEqual(MIN);
      expect(nearArc(c.x, c.y, 0, Math.PI / 2), `(${c.x}, ${c.y}) differs off the swept arc`).toBe(true);
      expect(Math.hypot(c.x, c.y)).toBeLessThanOrEqual(RANGE + CELL);
      if (a > b) gained++;
    }
    expect(gained, 'the cloud returns').toBeGreaterThan(0);
  });

  it('a cloud on bearings the beam has not reached yet paints nothing', () => {
    const { radar } = radarWith(source(sector(0.9, 150, 300, Math.PI, Math.PI + 0.5)));
    play(radar, T0, QUARTER);
    for (const c of cellCentres()) {
      if (sector(0.9, 150, 300, Math.PI, Math.PI + 0.5)(c.x, c.y) > 0) expect(radar.intensityAt(c.x, c.y)).toBe(0);
    }
  });

  it('the radar draws the cloud through its one heat sprite: the paint layer holds only the dim mask and the heat surface', () => {
    const { radar, blip } = radarWith(source(sector(0.9, 150, 300, 0.2, 0.5)));
    play(radar, T0, QUARTER);
    expect(gridOf(radar)).not.toBeNull();
    expect(blip.children).toHaveLength(2);
    expect(blip.children).toContain(radar.dimMask);
  });
});

describe('strength by thickness (Eric: "returns in strength based on how thick the smoke is")', () => {
  it('a thicker cloud returns stronger than a thinner one at the same range in the same sweep', () => {
    const thick = sector(0.9, 200, 300, 0.2, 0.5);
    const thin = sector(0.3, 200, 300, 0.9, 1.2);
    const { radar } = radarWith(source((x, y) => Math.max(thick(x, y), thin(x, y))));
    play(radar, T0, QUARTER);
    const inner = (f: (x: number, y: number) => number) =>
      cellCentres().filter((c) => f(c.x, c.y) > 0).map((c) => radar.intensityAt(c.x, c.y));
    const a = inner(thick);
    const b = inner(thin);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(mean(b), 'the thin cloud still returns').toBeGreaterThan(0);
    expect(mean(a)).toBeGreaterThan(mean(b));
  });

  it('a wisp under radarPaintMin returns nothing', () => {
    const wisp = sector(MIN / 2, 200, 300, 0.2, 0.5);
    const withWisp = radarWith(source(wisp));
    const control = radarWith(null);
    play(withWisp.radar, T0, QUARTER);
    play(control.radar, T0, QUARTER);
    for (const c of cellCentres()) {
      if (wisp(c.x, c.y) > 0) expect(withWisp.radar.intensityAt(c.x, c.y)).toBe(control.radar.intensityAt(c.x, c.y));
    }
  });
});

describe('the radar rules apply to the cloud as to every return', () => {
  it('cells beyond radar range stamp nothing; the in-range part of the same cloud does', () => {
    const far = sector(0.9, RANGE - 150, RANGE + 250, 0.2, 0.5);
    const { radar } = radarWith(source(far));
    play(radar, T0, QUARTER);
    let near = 0;
    for (const c of cellCentres()) {
      if (far(c.x, c.y) === 0) continue;
      const d = Math.hypot(c.x, c.y);
      if (d > RANGE + CELL) expect(radar.intensityAt(c.x, c.y)).toBe(0);
      else if (radar.intensityAt(c.x, c.y) > 0) near++;
    }
    expect(near).toBeGreaterThan(0);
  });

  it('with no beam (no own pose: spectating, start line) nothing is stamped', () => {
    const cloud = sector(0.9, 150, 300, 0, 2 * Math.PI);
    const { radar } = radarWith(source(cloud));
    play(radar, T0, T0 + PERIOD, null);
    // One assertion over the whole window rather than one per cell: the twelfths
    // rim (epic-9 amendment 103) made the window ~5x the cells, and 115k
    // per-cell `expect` calls alone outran the 5 s test timeout.
    const stamped = cellCentres().filter((c) => radar.intensityAt(c.x, c.y) !== 0);
    expect(stamped).toEqual([]);
  });

  it('after the beam passes, the stamped heat decays on the grid\'s own phosphor rule (monotone, never re-lit until the next sweep)', () => {
    const cloud = sector(0.9, 200, 300, 0.2, 0.5);
    const { radar } = radarWith(source(cloud));
    play(radar, T0, QUARTER);
    const lit = cellCentres().filter((c) => cloud(c.x, c.y) > 0 && radar.intensityAt(c.x, c.y) > 0);
    expect(lit.length).toBeGreaterThan(0);
    const alphaAt = (): number[] => {
      const g = gridOf(radar)!;
      return lit.map((c) => sampleGrid(g, c.x, c.y).a);
    };
    let prev = alphaAt();
    const first = prev;
    // The beam comes back round to 0.2 at T0 + 0.2/2π·PERIOD + PERIOD; stop short.
    for (let t = QUARTER + 200; t < T0 + PERIOD; t += 200) {
      play(radar, t - 184, t);
      const now = alphaAt();
      for (let k = 0; k < now.length; k++) expect(now[k]).toBeLessThanOrEqual(prev[k]);
      prev = now;
    }
    expect(mean(prev)).toBeLessThan(mean(first));
  });

  it('terrain shadows the cloud like a hull: a tall island between the antenna and the cloud darkens the cloud behind it', () => {
    const cloud = sector(0.9, 250, 330, 0.2, 0.5);
    const b = 0.35; // the island's bearing, mid-cloud
    const island = (x: number, y: number): number => {
      const d = Math.hypot(x, y);
      const a = wrapPositive(Math.atan2(y, x));
      return d >= 100 && d <= 160 && Math.abs(a - b) <= 0.2 ? 255 : 0;
    };
    const k = Math.ceil((RANGE + 200) / CELL);
    const n = 2 * k + 1;
    const x0 = -k * CELL;
    const v = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) v[j * n + i] = island(x0 + i * CELL, x0 + j * CELL);
    // A REAL max-height pyramid: the shadow walk fails open without one.
    const field: HeightField = { n, cell: CELL, x0, y0: x0, v };
    const raster = buildHeightRaster(field, 0, 255);
    const open = radarWith(source(cloud));
    const shadowed = radarWith(source(cloud), raster);
    play(open.radar, T0, QUARTER);
    play(shadowed.radar, T0, QUARTER);
    const behind = cellCentres().filter((c) => {
      const a = wrapPositive(Math.atan2(c.y, c.x));
      return cloud(c.x, c.y) > 0 && Math.abs(a - b) <= 0.02;
    });
    expect(behind.length).toBeGreaterThan(0);
    expect(mean(behind.map((c) => open.radar.intensityAt(c.x, c.y)))).toBeGreaterThan(0);
    for (const c of behind) expect(shadowed.radar.intensityAt(c.x, c.y)).toBe(0);
  });
});

// F1 (Story 9.8 review gate; Eric's ruling 123: "everything radar delivers
// rolls"). The server rolls a cloud's RADAR delivery once per revolution, but
// the client holds every cloud it was sent until it dies. The held copy must
// not keep painting the scope every sweep: a held cloud beyond sight returns
// only while its last delivery is fresh (this or the previous revolution); one
// whose rows stop goes dark one revolution later and comes back when a row
// lands. A cloud inside sight (no roll) never stops.
describe('the held cloud\'s radar return rolls per revolution (F1)', () => {
  const B = 0.3; // the cloud's bearing from OWN (rad)
  /** When the beam (bearing 0 at T0) reaches bearing B on revolution k. */
  const crossing = (k: number): number => T0 + k * PERIOD + (B / (2 * Math.PI)) * PERIOD;
  const HALF_WIN = PERIOD / 8; // well clear of the cloud's bearing span either side

  function setup(dist: number): { cm: Countermeasure; radar: Radar; cells: { x: number; y: number }[]; cloud: { id: string; x: number; y: number; t0: number } } {
    const cloud = { id: 'c', x: dist * Math.cos(B), y: dist * Math.sin(B), t0: T0 - 1000 };
    const cm = new Countermeasure(new Container(), mulberry32(5).next);
    cm.sync([{ ...cloud, deliveredAt: T0 }]); // first delivery: paints at once
    cm.render(T0); // a built body, frozen for the test
    const { radar } = radarWith(cm);
    radar.setRanges(CONFIG.vision.sight, CONFIG.vision.radar, PERIOD);
    const cells = cellCentres().filter((c) => cm.coverAt(c.x, c.y) >= MIN && Math.hypot(c.x, c.y) <= RANGE - CELL);
    return { cm, radar, cells, cloud };
  }

  /** The phosphor alpha summed over the cloud's cells (decays between sweeps). */
  const heat = (radar: Radar, cells: { x: number; y: number }[]): number => {
    const g = gridOf(radar);
    return g === null ? 0 : cells.reduce((s, c) => s + sampleGrid(g, c.x, c.y).a, 0);
  };

  /** Play across revolution k's crossing; did the beam (re)paint the cloud? */
  function repainted(radar: Radar, cells: { x: number; y: number }[], k: number, from: number): { painted: boolean; to: number } {
    const before = crossing(k) - HALF_WIN;
    const after = crossing(k) + HALF_WIN;
    // Off the cloud's bearings, coarse frames (cost only: nothing to paint
    // there); across the crossing, 16 ms frames.
    for (let t = from; t < before; t += 80) radar.render(OWN, t, null);
    radar.render(OWN, before, null);
    const a = heat(radar, cells);
    play(radar, before + 16, after);
    const b = heat(radar, cells);
    return { painted: b > a * 1.05 + 1e-6, to: after + 16 };
  }

  it('a FAR held cloud whose rows stop goes dark one revolution later, and returns when a row lands', () => {
    const { cm, radar, cells, cloud } = setup(1300);
    expect(cells.length, 'the premise: hazy cells in radar range').toBeGreaterThan(0);
    expect(
      Math.hypot(cloud.x, cloud.y) - cloudOutlineRadius(crossing(4) - cloud.t0),
      'the premise: the cloud\'s nearest rim stays beyond sight all test long',
    ).toBeGreaterThan(radar.sightHoleU);
    let t = T0;
    let r = repainted(radar, cells, 0, t); // delivered this revolution
    expect(r.painted, 'rev 0: a newly held cloud paints at once').toBe(true);
    r = repainted(radar, cells, 1, r.to); // the previous revolution's row admits it
    expect(r.painted, 'rev 1: the previous revolution\'s delivery still admits it').toBe(true);
    r = repainted(radar, cells, 2, r.to); // no row for two revolutions
    expect(r.painted, 'rev 2: no row since rev 0 — dark on the scope').toBe(false);
    t = r.to;
    cm.sync([{ ...cloud, deliveredAt: crossing(2) + HALF_WIN }]); // a row lands again
    r = repainted(radar, cells, 3, t);
    expect(r.painted, 'rev 3: delivered again — back on the scope').toBe(true);
    // The held set (the haze, the wake mirror) never lost it.
    expect(cm.size).toBe(1);
  });

  it('a cloud INSIDE sight (delivered by eye, no roll) never stops returning', () => {
    const { radar, cells, cloud } = setup(300);
    expect(cells.length).toBeGreaterThan(0);
    expect(Math.hypot(cloud.x, cloud.y) - cloudOutlineRadius(0), 'the premise: inside sight').toBeLessThanOrEqual(radar.sightHoleU);
    let to = T0;
    for (let k = 0; k < 4; k++) {
      const r = repainted(radar, cells, k, to);
      expect(r.painted, `rev ${k}`).toBe(true);
      to = r.to;
    }
  });
});
