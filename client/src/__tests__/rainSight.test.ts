// THE HULLS' RAIN LOOK (Story 11.6, Eric's A+D — render/rainSight.ts +
// render/hullDissolve.ts). Contracts: the V grid is the shared sight grid's
// points, each V = fogVisibility(fogDepthAlong(observer → point)); the filter
// attaches ONLY while some V reads below clear water (else the hull is
// untouched), falls back to the mean-V fade without WebGL, and is one filter
// per view, detached (never destroyed) when the water clears; the re-march
// runs on its cadence, snaps on first sight and eases between; the noise is
// equalized and deterministic; the pass padding stays bounded. Distance haze
// (Eric 2026-11-15) joins τ: crisp to sight, gone at hull sight, the name tag
// only within sight. The own hull is
// never handed an eye, so it never dissolves. No pinned literals: every
// expectation is derived from the shared functions or CLIENT_CONFIG.

import { afterEach, describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import {
  CONFIG,
  DEFAULT_CLASS_ID,
  fogDepthAlong,
  fogDepthReachFan,
  fogMaxDepth,
  smokeDepthAlong,
  fogFrameAt,
  fogHazeDepth,
  fogHullGrid,
  fogVisibility,
  makeFogField,
  baseSmokeStats,
  cloudOutlineRadius,
  type FogFrame,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  CLEAR_V,
  HullRainVis,
  RAIN_GRID_COLS,
  RAIN_GRID_N,
  RAIN_GRID_ROWS,
  SENT_FLOOR_V,
  eyeForHull,
  eyeReachFanInto,
  hullVisGrid,
  floorSentHull,
  meanVisibility,
  needsDissolve,
  plateInSight,
  rainLookMode,
  smokeDiscsInto,
  type RainEye,
  type SmokeDiscSlot,
} from '../render/rainSight.js';
import {
  HullDissolve,
  HullDissolveFilter,
  dissolveAlpha,
  dissolveNoise,
  dissolvePaddingPx,
  hullDissolveSupported,
  noiseExtentU,
  setHullDissolveSupport,
} from '../render/hullDissolve.js';
import { ShipView } from '../render/ships.js';
import { relationStyle } from '../render/relationColor.js';

const L = CLIENT_CONFIG.rainLook;
const OCEAN = 5000;
const T = 45000;
const FRAME: FogFrame = fogFrameAt(makeFogField(0x1234abcd, CONFIG.fog, OCEAN), T, 0, 0, 0);
const HULL = CONFIG.shipClasses[DEFAULT_CLASS_ID].hull;

/** A clear-water pose: observer and hull both deep inside the storm's clear eye. */
const clearEye = (): RainEye => ({ frame: FRAME, x: 0, y: 0 });
const CLEAR_POSE = { x: Math.min(150, FRAME.R * FRAME.eyeFrac * 0.25), y: 0, h: 0 };

/** A pose whose grid is part-rained: searched on the real field, observer astern of the hull. */
function partRained(): { eye: RainEye; x: number; y: number; h: number; vis: Float32Array } {
  const out = new Float32Array(RAIN_GRID_N);
  const pts = new Float64Array(2 * RAIN_GRID_N);
  for (let x = -OCEAN * 0.9; x <= OCEAN * 0.9; x += 50) {
    for (const y of [0, OCEAN * 0.3, -OCEAN * 0.3, OCEAN * 0.6]) {
      const eye = { frame: FRAME, x: x - 200, y };
      hullVisGrid(eye, x, y, 0, HULL.length, HULL.beam, pts, out);
      const lo = Math.min(...out);
      if (Math.max(...out) - lo > 0.2 && lo > CONFIG.fog.sightCutoffV) return { eye, x, y, h: 0, vis: Float32Array.from(out) };
    }
  }
  throw new Error('no part-rained pose on the fixture field');
}
const PART = partRained();

afterEach(() => setHullDissolveSupport(false));

describe('hullVisGrid — V at the shared sight grid', () => {
  it('is fogVisibility of the optical depth from the observer to each fogHullGrid point, in its layout', () => {
    const pts = new Float64Array(2 * RAIN_GRID_N);
    const n = fogHullGrid(PART.x, PART.y, PART.h, HULL.length, HULL.beam, RAIN_GRID_COLS, RAIN_GRID_ROWS, pts);
    expect(n).toBe(RAIN_GRID_N);
    for (let i = 0; i < n; i++) {
      const v = fogVisibility(fogDepthAlong(FRAME, PART.eye.x, PART.eye.y, pts[2 * i], pts[2 * i + 1]), CONFIG.fog);
      expect(PART.vis[i]).toBeCloseTo(v, 6);
    }
  });

  it('reads clear (1) everywhere in clear water and with no rain', () => {
    const out = new Float32Array(RAIN_GRID_N);
    hullVisGrid(clearEye(), CLEAR_POSE.x, CLEAR_POSE.y, 0, HULL.length, HULL.beam, new Float64Array(2 * RAIN_GRID_N), out);
    expect(out.every((v) => v === 1)).toBe(true);
    const dry = fogFrameAt(makeFogField(1, CONFIG.fog, OCEAN), T, Number.NaN, 0, 0); // cannot rain
    hullVisGrid({ frame: dry, x: PART.eye.x, y: PART.eye.y }, PART.x, PART.y, 0, HULL.length, HULL.beam, new Float64Array(2 * RAIN_GRID_N), out);
    expect(out.every((v) => v === 1)).toBe(true);
  });
});

describe('hullVisGrid — smoke adds its optical depth (τ = rain + smoke)', () => {
  const SIZE = (({ lifeMs, r0, r1 }) => ({ lifeMs, r0, r1 }))(baseSmokeStats());
  /** One held cloud at (cx, 0), aged to just before the end of its life (full growth). */
  const grownDiscs = (cx: number): SmokeDiscSlot[] => {
    const now = 100_000;
    return smokeDiscsInto([{ x: cx, y: 0, t0: now - (SIZE.lifeMs - 1), ...SIZE }], now, [], []);
  };
  const R = cloudOutlineRadius(SIZE.lifeMs - 1, SIZE);
  const cut = CONFIG.fog.sightCutoffV;
  const grid = (eye: RainEye, x: number): Float32Array => {
    const out = new Float32Array(RAIN_GRID_N);
    return hullVisGrid(eye, x, 0, Math.PI / 2, HULL.length, HULL.beam, new Float64Array(2 * RAIN_GRID_N), out);
  };
  const below = (v: Float32Array): number => v.filter((x) => x < cut).length;

  it('a hull behind a grown cloud reads below the cutoff (only the sent floor above it); with no cloud it reads 1', () => {
    const d = 2 * R + 400; // observer and hull on opposite sides of the cloud
    const behind = grid({ frame: null, smoke: grownDiscs(d / 2), x: 0, y: 0 }, d);
    expect(below(behind)).toBeGreaterThanOrEqual(RAIN_GRID_N - 1);
    expect(Math.max(...behind)).toBeLessThanOrEqual(Math.fround(SENT_FLOOR_V));
    const clear = grid({ frame: null, smoke: [], x: 0, y: 0 }, d);
    expect(clear.every((v) => v === 1)).toBe(true);
    const aside = grid({ frame: null, smoke: grownDiscs(-d), x: 0, y: 0 }, d); // the cloud behind the OBSERVER, off the line
    expect(aside.every((v) => v === 1)).toBe(true);
  });

  it('the observer standing in a cloud is not exempt (your own smoke blinds you)', () => {
    const v = grid({ frame: null, smoke: grownDiscs(0), x: 0, y: 0 }, R + 200);
    expect(below(v)).toBeGreaterThanOrEqual(RAIN_GRID_N - 1);
  });

  it('adds to the rain along the same line', () => {
    const pts = new Float64Array(2 * RAIN_GRID_N);
    const rainOnly = Float32Array.from(PART.vis);
    const both = new Float32Array(RAIN_GRID_N);
    const mid = { x: (PART.eye.x + PART.x) / 2, y: PART.eye.y };
    const thin = [{ x: mid.x, y: mid.y, r: 30 }];
    hullVisGrid({ ...PART.eye, smoke: thin }, PART.x, PART.y, PART.h, HULL.length, HULL.beam, pts, both);
    let darker = 0;
    for (let i = 0; i < RAIN_GRID_N; i++) {
      expect(both[i]).toBeLessThanOrEqual(rainOnly[i] + 1e-6);
      if (both[i] < rainOnly[i] - 1e-4) darker++;
    }
    expect(darker).toBeGreaterThan(0);
  });

  it('smokeDiscsInto: radius from the stamp at the render time; a cloud past its life is left out', () => {
    const now = 50_000;
    const pool: SmokeDiscSlot[] = [];
    const out: SmokeDiscSlot[] = [];
    smokeDiscsInto([
      { x: 1, y: 2, t0: now - 1000, ...SIZE },
      { x: 3, y: 4, t0: now - SIZE.lifeMs, ...SIZE },
    ], now, pool, out);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ x: 1, y: 2, r: cloudOutlineRadius(1000, SIZE) });
    const first = out[0];
    smokeDiscsInto([{ x: 5, y: 6, t0: now, ...SIZE }], now, pool, out);
    expect(out[0]).toBe(first); // the slot is reused, not reallocated
    expect(out[0].r).toBe(cloudOutlineRadius(0, SIZE));
  });
});

describe('hullVisGrid — the distance haze (crisp to sight, gone at hull sight)', () => {
  const SIGHT = CONFIG.vision.sight;
  const HULL_SIGHT = CONFIG.vision.hullSight;
  const TAU = fogMaxDepth(CONFIG.fog);
  /** No rain, no smoke: only distance can dim the hull. */
  const dryEye = (): RainEye => ({ frame: null, smoke: [], sightU: SIGHT, hullSightU: HULL_SIGHT, x: 0, y: 0 });
  const gridAt = (eye: RainEye, d: number): Float32Array => {
    const out = new Float32Array(RAIN_GRID_N);
    return hullVisGrid(eye, d, 0, Math.PI / 2, HULL.length, HULL.beam, new Float64Array(2 * RAIN_GRID_N), out);
  };

  it('each point is V of the shared haze depth at its own distance (V = 1 inside sight)', () => {
    const d = (SIGHT + HULL_SIGHT) / 2;
    const vis = gridAt(dryEye(), d);
    const pts = new Float64Array(2 * RAIN_GRID_N);
    fogHullGrid(d, 0, Math.PI / 2, HULL.length, HULL.beam, RAIN_GRID_COLS, RAIN_GRID_ROWS, pts);
    for (let i = 0; i < RAIN_GRID_N; i++) {
      const tau = fogHazeDepth(Math.hypot(pts[2 * i], pts[2 * i + 1]), SIGHT, HULL_SIGHT, TAU);
      expect(vis[i]).toBeCloseTo(fogVisibility(tau, CONFIG.fog), 6);
    }
    expect(gridAt(dryEye(), SIGHT / 2).every((v) => v === 1)).toBe(true);
  });

  it('a hull clear of rain and smoke between sight and hull sight gets the dissolve; inside sight it does not', () => {
    expect(needsDissolve(gridAt(dryEye(), SIGHT / 2))).toBe(false);
    const mid = gridAt(dryEye(), (SIGHT + HULL_SIGHT) / 2);
    expect(needsDissolve(mid)).toBe(true);
    expect(rainLookMode(mid, true)).toBe('filter');
  });

  it('at hull sight a sent hull still draws its best part at the floor', () => {
    const far = gridAt(dryEye(), HULL_SIGHT + HULL.beam);
    expect(Math.max(...far)).toBeCloseTo(SENT_FLOOR_V, 6);
  });

  it('the reaches are the eye\'s own: a whiteout-shrunk sight hazes nearer; no reaches on the eye → no haze', () => {
    const half = { ...dryEye(), sightU: SIGHT / 2, hullSightU: HULL_SIGHT / 2 };
    expect(needsDissolve(gridAt(half, SIGHT * 0.6))).toBe(true);
    expect(gridAt({ frame: null, smoke: [], x: 0, y: 0 }, HULL_SIGHT * 2).every((v) => v === 1)).toBe(true);
  });

  it('an own star-shell zone exempts a hazed hull (lit from above)', () => {
    const d = (SIGHT + HULL_SIGHT) / 2;
    const eye: RainEye = { ...dryEye(), lit: [{ x: d, y: 0, r: 200 }] };
    expect(new HullRainVis(0).step(eye, d, 0, 0, HULL.length, HULL.beam, 16)).toBeNull();
  });
});

describe('plateInSight — the name tag only within the class-and-name sight', () => {
  const eye: RainEye = { frame: null, sightU: 1000, hullSightU: 2000, x: 100, y: 0 };
  it('is true to the effective sight by center distance, false beyond; no eye or no reach → true', () => {
    expect(plateInSight(eye, 1100, 0)).toBe(true);
    expect(plateInSight(eye, 1100.5, 0)).toBe(false);
    expect(plateInSight(null, 1e9, 0)).toBe(true);
    expect(plateInSight({ frame: null, x: 0, y: 0 }, 1e9, 0)).toBe(true);
  });
});

describe('floorSentHull — a sent hull is never drawn fully gone', () => {
  it('raises only the best part to the sent floor when every part is below it', () => {
    const cut = CONFIG.fog.sightCutoffV;
    const v = Float32Array.from({ length: RAIN_GRID_N }, (_, i) => (cut / 10) * (1 + i / RAIN_GRID_N));
    const before = Float32Array.from(v);
    const best = before.indexOf(Math.max(...before));
    floorSentHull(v);
    for (let i = 0; i < v.length; i++) expect(v[i]).toBe(i === best ? Math.fround(SENT_FLOOR_V) : before[i]);
  });

  it('the floored best part DRAWS: the shader alpha clears its vanish edge and is visibly present', () => {
    // every part at or under the cutoff — the case the floor exists for
    for (const fill of [0, CONFIG.fog.sightCutoffV / 2, CONFIG.fog.sightCutoffV]) {
      const v = floorSentHull(new Float32Array(RAIN_GRID_N).fill(fill));
      const best = Math.max(...v);
      // the vanish edge is fully open at the best part (the dissolve's own survivors draw at full D fade)
      expect(dissolveAlpha(best, 1, 1)).toBeCloseTo(1 + (best - 1) * L.dStrength, 6);
      // the plain-fade path (far fallback) draws it at least a few 8-bit steps
      expect(dissolveAlpha(best, 0, 0)).toBeGreaterThan(4 / 255);
    }
  });

  it('leaves a grid with any part at or above the sent floor untouched', () => {
    const v = new Float32Array(RAIN_GRID_N).fill(0);
    v[3] = SENT_FLOOR_V;
    const before = Float32Array.from(v);
    floorSentHull(v);
    expect(Array.from(v)).toEqual(Array.from(before));
  });
});

describe('the filter on/off decision', () => {
  it('no grid or a clear grid is off; a rained grid is the filter, or the fade without WebGL', () => {
    const clear = new Float32Array(RAIN_GRID_N).fill(1);
    const justClear = new Float32Array(RAIN_GRID_N).fill(CLEAR_V);
    const rained = Float32Array.from(clear);
    rained[RAIN_GRID_N - 1] = 0.5;
    for (const supported of [true, false]) {
      expect(rainLookMode(null, supported)).toBe('off');
      expect(rainLookMode(clear, supported)).toBe('off');
      expect(rainLookMode(justClear, supported)).toBe('off');
    }
    expect(rainLookMode(rained, true)).toBe('filter');
    expect(rainLookMode(rained, false)).toBe('fade');
    expect(needsDissolve(rained)).toBe(true);
    expect(needsDissolve(clear)).toBe(false);
  });

  it('meanVisibility is the grid mean (1 for an empty grid)', () => {
    expect(meanVisibility([])).toBe(1);
    expect(meanVisibility(PART.vis)).toBeCloseTo(PART.vis.reduce((s, v) => s + v, 0) / RAIN_GRID_N, 6);
  });
});

describe('HullRainVis — the cadence', () => {
  it('snaps on first sight, holds its march between refreshes, eases to the next march after one', () => {
    const rv = new HullRainVis(0);
    const first = rv.step(PART.eye, PART.x, PART.y, PART.h, HULL.length, HULL.beam, 16);
    expect(Array.from(first!)).toEqual(Array.from(PART.vis));
    // the hull moves into clear water, but no march is due yet: the drawn grid holds
    let t = 16;
    while (t + 16 < L.visRefreshMs) {
      rv.step(clearEye(), CLEAR_POSE.x, CLEAR_POSE.y, 0, HULL.length, HULL.beam, 16);
      t += 16;
    }
    expect(Array.from(rv.vis)).toEqual(Array.from(PART.vis));
    // past the refresh: the clear march lands and the grid eases up toward it, never past
    for (let k = 0; k < 4; k++) rv.step(clearEye(), CLEAR_POSE.x, CLEAR_POSE.y, 0, HULL.length, HULL.beam, 16);
    for (let i = 0; i < RAIN_GRID_N; i++) {
      expect(rv.vis[i]).toBeGreaterThanOrEqual(PART.vis[i]);
      expect(rv.vis[i]).toBeLessThanOrEqual(1);
    }
    expect(rv.vis.some((v, i) => v > PART.vis[i])).toBe(true);
    for (let k = 0; k < 200; k++) rv.step(clearEye(), CLEAR_POSE.x, CLEAR_POSE.y, 0, HULL.length, HULL.beam, 16);
    expect(needsDissolve(rv.vis)).toBe(false);
  });

  it('no eye → null, and the next eye snaps again', () => {
    const rv = new HullRainVis(0);
    rv.step(clearEye(), CLEAR_POSE.x, CLEAR_POSE.y, 0, HULL.length, HULL.beam, 16);
    expect(rv.step(null, 0, 0, 0, HULL.length, HULL.beam, 16)).toBeNull();
    const back = rv.step(PART.eye, PART.x, PART.y, PART.h, HULL.length, HULL.beam, 16);
    expect(Array.from(back!)).toEqual(Array.from(PART.vis));
  });
});

describe('HullRainVis — the floor holds while easing between marches', () => {
  it('the drawn best part never dips under the sent floor when the best part moves', () => {
    // a hull broadside-on behind a cloud, seen first from one side, then the other:
    // both marches floor a DIFFERENT best part; the ease between them must not dim both
    const d = 600;
    const disc = (cx: number) => [{ x: cx, y: 0, r: 260 }];
    const west: RainEye = { frame: null, smoke: disc(d / 2), x: 0, y: 0 };
    const east: RainEye = { frame: null, smoke: disc(1.5 * d), x: 2 * d, y: 0 };
    const pts = new Float64Array(2 * RAIN_GRID_N);
    const a = hullVisGrid(west, d, 0, Math.PI / 2, HULL.length, HULL.beam, pts, new Float32Array(RAIN_GRID_N));
    const b = hullVisGrid(east, d, 0, Math.PI / 2, HULL.length, HULL.beam, pts, new Float32Array(RAIN_GRID_N));
    expect(a.indexOf(Math.max(...a))).not.toBe(b.indexOf(Math.max(...b)));
    const rv = new HullRainVis(0);
    rv.step(west, d, 0, Math.PI / 2, HULL.length, HULL.beam, 16);
    for (let t = 0; t < 4 * L.visRefreshMs; t += 16) {
      const vis = rv.step(east, d, 0, Math.PI / 2, HULL.length, HULL.beam, 16)!;
      expect(Math.max(...vis)).toBeGreaterThanOrEqual(Math.fround(SENT_FLOOR_V));
    }
  });
});

describe('a hull lit from above by an OWN star shell gets no rain eye (V = 1)', () => {
  it('eyeForHull: inside an own live lit zone → null; outside, or no zones → the eye', () => {
    const lit = [{ x: PART.x, y: PART.y, r: 50 }];
    expect(eyeForHull({ ...PART.eye, lit }, PART.x + 10, PART.y)).toBeNull();
    const eye = { ...PART.eye, lit };
    expect(eyeForHull(eye, PART.x + 100, PART.y)).toBe(eye);
    expect(eyeForHull(PART.eye, PART.x, PART.y)).toBe(PART.eye);
    expect(eyeForHull(null, PART.x, PART.y)).toBeNull();
  });

  it('a contact view inside its observer\'s own lit zone draws undissolved; outside it, rained', () => {
    setHullDissolveSupport(true);
    const v = new ShipView(relationStyle('enemy'), DEFAULT_CLASS_ID);
    v.update(PART.x, PART.y, PART.h);
    v.setRain({ ...PART.eye, lit: [{ x: PART.x, y: PART.y, r: 80 }] }, 16);
    expect(v.rainFiltered).toBe(false);
    v.setRain({ ...PART.eye, lit: [{ x: PART.x + 5000, y: PART.y, r: 80 }] }, 16);
    expect(v.rainFiltered).toBe(true);
  });
});

describe('HullDissolve — one filter per view, attached only while rained', () => {
  it('the filter renders at the render target\'s resolution (a hull never softens when it attaches)', () => {
    expect(new HullDissolveFilter(new Container()).resolution).toBe('inherit');
  });

  it('is unsupported until the stage says WebGL', () => {
    expect(hullDissolveSupported()).toBe(false);
    setHullDissolveSupport(true);
    expect(hullDissolveSupported()).toBe(true);
  });

  it('clear → no filter and alpha 1; rained → the filter (one instance, reused); clear again → detached', () => {
    setHullDissolveSupport(true);
    const target = new Container();
    const d = new HullDissolve(target);
    expect(d.apply(null, HULL.length, HULL.beam)).toBe(1);
    expect(target.filters ?? null).toBeNull();
    expect(d.apply(PART.vis, HULL.length, HULL.beam)).toBe(1);
    expect(d.active).toBe(true);
    const filters = target.filters as readonly unknown[];
    expect(filters.length).toBe(1);
    const f = filters[0];
    expect(f).toBeInstanceOf(HullDissolveFilter);
    d.apply(PART.vis, HULL.length, HULL.beam);
    expect((target.filters as readonly unknown[])[0]).toBe(f);
    d.apply(new Float32Array(RAIN_GRID_N).fill(1), HULL.length, HULL.beam);
    expect(d.active).toBe(false);
    expect(target.filters ?? null).toBeNull();
    d.apply(PART.vis, HULL.length, HULL.beam);
    expect((target.filters as readonly unknown[])[0]).toBe(f);
  });

  it('without WebGL: no filter, and the view fades by the mean V', () => {
    const target = new Container();
    const d = new HullDissolve(target);
    expect(d.apply(PART.vis, HULL.length, HULL.beam)).toBeCloseTo(meanVisibility(PART.vis), 9);
    expect(target.filters ?? null).toBeNull();
  });

  it('the pass padding is the blur spill, at least 1 px and never past maxPadPx', () => {
    for (const ppu of [0, 0.01, 1, 4, 50, 1e6, Number.NaN]) {
      const p = dissolvePaddingPx(ppu);
      expect(p).toBeGreaterThanOrEqual(1);
      expect(p).toBeLessThanOrEqual(L.maxPadPx);
    }
    expect(dissolvePaddingPx(2)).toBeLessThanOrEqual(dissolvePaddingPx(4));
  });
});

describe('the dissolve noise', () => {
  it('is deterministic, spans [0, 1] uniformly (equalized), and covers the largest hull', () => {
    const w = 64;
    const h = 24;
    const a = dissolveNoise(w, h, L.grainU, 7);
    expect(Array.from(dissolveNoise(w, h, L.grainU, 7))).toEqual(Array.from(a));
    const sorted = Array.from(a).sort((p, q) => p - q);
    expect(sorted[0]).toBe(0);
    expect(sorted[sorted.length - 1]).toBe(1);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeCloseTo(0.5, 1);
    const ext = noiseExtentU();
    for (const id of Object.keys(CONFIG.shipClasses) as (keyof typeof CONFIG.shipClasses)[]) {
      expect(ext.w).toBeGreaterThan(CONFIG.shipClasses[id].hull.length);
      expect(ext.h).toBeGreaterThan(CONFIG.shipClasses[id].hull.beam);
    }
  });
});

describe('the hull views', () => {
  it('a contact ShipView wears the filter in rain and none in clear water or with no eye', () => {
    setHullDissolveSupport(true);
    const v = new ShipView(relationStyle('enemy'), DEFAULT_CLASS_ID);
    v.update(PART.x, PART.y, PART.h);
    v.setRain(PART.eye, 16);
    expect(v.rainFiltered).toBe(true);
    v.setRain(null, 16);
    expect(v.rainFiltered).toBe(false);
    v.update(CLEAR_POSE.x, CLEAR_POSE.y, 0);
    v.setRain(clearEye(), 16);
    expect(v.rainFiltered).toBe(false);
    expect(v.gfx.filters ?? null).toBeNull();
  });

  it('a view with no pose yet never marches (its (0, 0) default is not a pose)', () => {
    setHullDissolveSupport(true);
    const v = new ShipView(relationStyle('enemy'), DEFAULT_CLASS_ID);
    v.setRain(PART.eye, 16);
    expect(v.rainFiltered).toBe(false);
  });

  it('without WebGL a ShipView fades by the mean V, and recovers in clear water', () => {
    const v = new ShipView(relationStyle('enemy'), DEFAULT_CLASS_ID);
    v.update(CLEAR_POSE.x, CLEAR_POSE.y, 0);
    const clearAlpha = v.gfx.alpha;
    v.update(PART.x, PART.y, PART.h);
    v.setRain(PART.eye, 16);
    expect(v.gfx.alpha).toBeCloseTo(clearAlpha * meanVisibility(PART.vis), 6);
    v.setRain(null, 16);
    expect(v.gfx.alpha).toBe(clearAlpha);
  });
});

describe('eyeReachFanInto — the radar dim fan through rain AND smoke', () => {
  const RAYS = 120;
  const TAU = fogMaxDepth(CONFIG.fog);
  const SIGHT = 900;
  const SMOKE = { thickness: CONFIG.countermeasure.sightThickness, softFrac: CONFIG.countermeasure.sightSoftFrac };
  const along = (k: number, d: number, ox: number, oy: number) => {
    const a = (k * 2 * Math.PI) / RAYS;
    return { x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d };
  };

  it('with no smoke it IS the shared rain fan', () => {
    const out = eyeReachFanInto(FRAME, [], PART.eye.x, PART.eye.y, SIGHT, TAU, new Float32Array(RAYS));
    expect(Array.from(out)).toEqual(Array.from(fogDepthReachFan(FRAME, PART.eye.x, PART.eye.y, SIGHT, TAU, new Float32Array(RAYS))));
  });

  it('smoke alone (no rain) shortens only the bearings a cloud lies on, to where its τ reaches T', () => {
    const cloud = [{ x: 400, y: 0, r: 150 }];
    const out = eyeReachFanInto(null, cloud, 0, 0, SIGHT, TAU, new Float32Array(RAYS));
    expect(out[0]).toBeLessThan(SIGHT);
    const p = along(0, out[0], 0, 0);
    expect(smokeDepthAlong(cloud, 0, 0, p.x, p.y, SMOKE)).toBeCloseTo(TAU, -1); // within one march step's linearization
    expect(out[RAYS / 2]).toBe(Math.fround(SIGHT)); // the bearing away from the cloud
  });

  it('rain + smoke: a shortened bearing ends where the two depths together reach T, never past the rain-only reach', () => {
    const ox = PART.eye.x;
    const oy = PART.eye.y;
    const rainOnly = fogDepthReachFan(FRAME, ox, oy, SIGHT, TAU, new Float32Array(RAYS));
    const thin = [{ x: ox + 150, y: oy, r: 60 }];
    const out = eyeReachFanInto(FRAME, thin, ox, oy, SIGHT, TAU, new Float32Array(RAYS));
    for (let k = 0; k < RAYS; k++) expect(out[k]).toBeLessThanOrEqual(rainOnly[k] + 1e-3);
    expect(out[0]).toBeLessThan(rainOnly[0]);
    const p = along(0, out[0], ox, oy);
    const tau = fogDepthAlong(FRAME, ox, oy, p.x, p.y) + smokeDepthAlong(thin, ox, oy, p.x, p.y, SMOKE);
    expect(Math.abs(tau - TAU)).toBeLessThan(TAU * 0.05);
  });
});
