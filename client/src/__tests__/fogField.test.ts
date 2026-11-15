// THE FOG FIELD view (render/fogField.ts + render/fogPuffTile.ts, Story 9.10
// re-plan "THE FIELD"; Eric's pick B "Wisps") drawing Story 11.6's storm-eye
// rain. The contract: the density raster is the shared field's frame sampled
// deterministically (seed, time, live zone); the frame is ONE reused object,
// re-derived only for a new instant or zone; the raster is re-evaluated only on
// its cadence or a re-centre, never per frame; it rains pre-zone (the ring-0
// state, Eric 2026-11-15); no rain (no seed, a non-finite input) → a
// dark bitmap and nothing drawn or evaluated; motion off → the wisps hold
// still, motion on → they ride the spin about the eye; the wisps tile is
// seamless; the halo mask follows the own hull (a spectator is unmasked); the
// `fog` layer sits between `litZone` and `smoke`.

import { describe, it, expect, vi } from 'vitest';
import { Container, MaskFilter, Texture, TextureSource } from 'pixi.js';
import { CONFIG, fogDensityAt, fogFrameAt, makeFogField, type FogFrame } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  ALIVE_MAX_CELLS,
  DENSITY_TEXTURE_CELLS,
  FogFieldView,
  SPECTATOR_CELLS,
  aliveRasterGeometry,
  fillFogRaster,
  packDensityRgba,
  rainFlowAt,
  screenReachU,
  type FogDensityFn,
} from '../render/fogField.js';
import { bakePuffTile } from '../render/fogPuffTile.js';
import { CHART_LAYER_ORDER } from '../render/stage.js';

// jsdom has no 2d canvas: the halo bake is stubbed with the real reuse
// contract (a live texture is handed back; only a bare call mints).
vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return {
    ...actual,
    bakeHaloMaskTexture: (_haloU: number, into?: Texture | null): Texture => {
      const size = actual.HALO_MASK_TEXTURE_SIZE;
      return into ?? new Texture({ source: new TextureSource({ width: size, height: size }) });
    },
  };
});

const F = CLIENT_CONFIG.fogField;
const SEED = 0x1234abcd;
const OCEAN = 5000;
/** The zone started at match time 0; the test time is 45 s in. */
const ZONE_T0 = 0;
const T = 45000;
const own = { x: 0, y: 0 };
/** Solid rain on the whole ocean wherever the frame rains (0 past the rim) — the cadence / mask tests' stand-in. */
const SOLID: FogDensityFn = (frame, x, y) => (frame.on && x * x + y * y <= OCEAN * OCEAN ? 1 : 0);

function makeView(base: FogDensityFn = SOLID): { view: FogFieldView; layer: Container; calls: { n: number } } {
  const calls = { n: 0 };
  const spy: FogDensityFn = (...a) => {
    calls.n++;
    return base(...a);
  };
  const layer = new Container();
  const view = new FogFieldView(layer, spy);
  view.setSeed(SEED, OCEAN);
  view.setZone(ZONE_T0, 0, 0);
  return { view, layer, calls };
}

/** The shared frame at `t` with the eye at (cx, cy). */
const frameAt = (t: number, cx = 0, cy = 0, startT: number | null = ZONE_T0): FogFrame =>
  fogFrameAt(makeFogField(SEED, CONFIG.fog, OCEAN), t, startT, cx, cy);

describe('fillFogRaster — the shared field, sampled deterministically', () => {
  it('same frame → identical raster, every value in [0, 1], rain and clear water both present across the storm', () => {
    const n = 60;
    const a = new Float32Array(n * n);
    const b = new Float32Array(n * n);
    fillFogRaster(a, frameAt(T), -OCEAN, -OCEAN, (2 * OCEAN) / (n - 1), n);
    fillFogRaster(b, frameAt(T), -OCEAN, -OCEAN, (2 * OCEAN) / (n - 1), n);
    expect(b).toEqual(a);
    for (const v of a) expect(v >= 0 && v <= 1).toBe(true);
    expect(a.some((v) => v > 0)).toBe(true);
    expect(a.some((v) => v === 0)).toBe(true);
  });

  it('pre-zone (no zone start) RAINS — the ring-0 state (Eric 2026-11-15); a frame that cannot rain fills zeros', () => {
    const n = 60;
    const pre = new Float32Array(n * n);
    expect(fillFogRaster(pre, frameAt(T, 0, 0, null), -OCEAN, -OCEAN, (2 * OCEAN) / (n - 1), n)).toBe(true);
    expect(pre.some((v) => v > 0)).toBe(true);
    const out = new Float32Array(16).fill(0.5);
    expect(fillFogRaster(out, frameAt(T, 0, 0, Number.NaN), 3500, 0, 10, 4)).toBe(false);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('NO RAIN PAST THE RIM: a raster straddling the ocean radius is 0 at every cell outside it', () => {
    const n = 16;
    const out = new Float32Array(n * n);
    fillFogRaster(out, frameAt(T), OCEAN - 75, -75, 10, n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = OCEAN - 75 + i * 10;
        const y = -75 + j * 10;
        if (x * x + y * y > OCEAN * OCEAN) expect(out[j * n + i], `cell (${x}, ${y})`).toBe(0);
      }
    }
  });

  it('the view raster equals the pure fill of the shared frame at the view geometry and time', () => {
    const { view } = makeView(fogDensityAt);
    view.setZone(ZONE_T0, -2000, 0); // the own hull out in the storm
    view.update(16, T, false, own);
    const r = view.raster;
    const ref = new Float32Array(r.n * r.n);
    fillFogRaster(ref, frameAt(T, -2000, 0), r.ox, r.oy, r.cellU, r.n);
    expect(r.density).toEqual(ref);
  });
});

describe('frameAt — ONE shared frame', () => {
  it('is null with no seed or a frame that cannot rain; a raining frame pre-zone (the ring-0 state) and once the zone runs', () => {
    expect(new FogFieldView(new Container()).frameAt(T)).toBeNull();
    const { view } = makeView();
    view.setZone(Number.NaN, 0, 0);
    expect(view.frameAt(T)).toBeNull();
    view.setZone(null, 0, 0);
    expect(view.frameAt(T)?.on).toBe(true);
    view.setZone(T + 1000, 0, 0);
    expect(view.frameAt(T)?.on).toBe(true);
    view.setZone(ZONE_T0, 0, 0);
    expect(view.frameAt(T)?.on).toBe(true);
  });

  it('is one reused object, re-derived for a new instant or zone, and samples as a fresh shared frame', () => {
    const { view } = makeView();
    const a = view.frameAt(T);
    expect(view.frameAt(T)).toBe(a);
    expect(view.frameAt(T + 500)).toBe(a); // the tables are reused, not re-allocated
    view.setZone(ZONE_T0, 700, -300);
    const c = view.frameAt(T + 500) as FogFrame;
    const ref = frameAt(T + 500, 700, -300);
    for (const [x, y] of [[0, 0], [2500, 1000], [-3000, -2500], [4100, 200]]) {
      expect(fogDensityAt(c, x, y)).toBe(fogDensityAt(ref, x, y));
    }
  });
});

describe('the refresh cadence — never per frame', () => {
  it('evaluates n² samples on the first frame, nothing until refreshMs has passed, then n² again', () => {
    const { view, calls } = makeView();
    view.update(16, T, true, own);
    const n = view.raster.n;
    expect(view.refreshCount).toBe(1);
    expect(calls.n).toBe(n * n);
    let t = 0;
    while (t + 16 < F.refreshMs - 16) {
      t += 16;
      view.update(16, T + t, true, own);
    }
    expect(view.refreshCount).toBe(1);
    expect(calls.n).toBe(n * n);
    view.update(32, T + t + 32, true, own);
    expect(view.refreshCount).toBe(2);
    expect(calls.n).toBe(2 * n * n);
  });

  it('re-centres (and refreshes at once) only past recenterU; the buffers are reused', () => {
    const { view } = makeView();
    view.update(16, T, false, own);
    const buf = view.raster.density;
    view.update(16, T + 16, false, { x: F.recenterU * 0.5, y: 0 });
    expect(view.refreshCount).toBe(1);
    view.update(16, T + 32, false, { x: F.recenterU + 30, y: 0 });
    expect(view.refreshCount).toBe(2);
    const r = view.raster;
    expect(Math.abs(r.ox + ((r.n - 1) / 2) * r.cellU - (F.recenterU + 30))).toBeLessThanOrEqual(r.cellU);
    expect(Math.abs(r.ox % r.cellU)).toBe(0); // the origin snaps to the cell grid
    expect(r.density).toBe(buf);
  });
});

describe('the steady state allocates nothing', () => {
  it('200 frames with no refresh due never sample the field and reuse one centre and one geometry object', () => {
    type Seams = {
      centreFor: (...a: unknown[]) => unknown;
      geometryFor: (...a: unknown[]) => unknown;
    };
    for (const [pose, mode] of [[own, 'alive'], [null, 'spectate']] as const) {
      const { view, calls } = makeView();
      const screen = { x: -300, y: -200, w: 600, h: 400 };
      view.update(16, T, true, pose, screen, mode); // the one refresh
      const sampled = calls.n;
      const seams = view as unknown as Seams;
      const centre = vi.spyOn(seams, 'centreFor');
      const geometry = vi.spyOn(seams, 'geometryFor');
      for (let k = 1; k <= 200; k++) view.update(1, T + k, true, pose, screen, mode); // 200 ms < refreshMs
      expect(view.refreshCount).toBe(1);
      expect(calls.n).toBe(sampled);
      expect(centre).toHaveBeenCalledTimes(200);
      expect(geometry).toHaveBeenCalledTimes(200);
      const c0 = centre.mock.results[0].value;
      const g0 = geometry.mock.results[0].value;
      expect(centre.mock.results.every((r) => r.value === c0)).toBe(true);
      expect(geometry.mock.results.every((r) => r.value === g0)).toBe(true);
    }
  });
});

describe('no rain → a dark bitmap, nothing drawn, nothing evaluated', () => {
  it('a frame that cannot rain never samples the field and draws nothing', () => {
    const { view, layer, calls } = makeView();
    view.setZone(Number.NaN, 0, 0);
    for (let k = 0; k < 30; k++) view.update(100, T + k * 100, true, own);
    expect(calls.n).toBe(0);
    expect(view.drawn).toBe(false);
    expect(layer.mask ?? null).toBeNull();
  });

  it('pre-zone RAINS and draws (Eric 2026-11-15: the bands are there from the start line)', () => {
    const { view, calls } = makeView();
    view.setHaloU(750);
    view.setZone(null, 0, 0);
    view.update(16, T, false, own);
    expect(calls.n).toBeGreaterThan(0);
    expect(view.drawn).toBe(true);
  });

  it('rain → none zeroes the bitmap; clear() (the match-start edge) darkens it until the ring-0 rain refreshes', () => {
    const { view } = makeView();
    // A halo whose raster stays on the fixture's ocean (Story 11.2: the shipped
    // halo rides the 350 hm muzzle-flash reach, far past it).
    view.setHaloU(750);
    view.update(16, T, false, own);
    expect(view.drawn).toBe(true);
    expect(view.raster.density.every((v) => v === 1)).toBe(true);
    view.setZone(Number.NaN, 0, 0);
    view.update(16, T + 16, false, own);
    expect(view.drawn).toBe(false);
    expect(view.raster.density.every((v) => v === 0)).toBe(true);
    view.setZone(ZONE_T0, 0, 0);
    view.update(16, T + 32, false, own);
    expect(view.drawn).toBe(true);
    view.clear();
    expect(view.drawn).toBe(false);
    expect(view.raster.density.every((v) => v === 0)).toBe(true);
    expect(view.frameAt(T + 48)?.on).toBe(true); // the zone back to not started: the ring-0 rain
    view.update(16, T + 48, false, own);
    expect(view.drawn).toBe(true);
  });

  it('no seed (no welcome yet) draws nothing', () => {
    const view = new FogFieldView(new Container());
    view.setZone(ZONE_T0, 0, 0);
    view.update(16, T, false, own);
    expect(view.drawn).toBe(false);
  });
});

describe('rainFlowAt — the wisps ride the spin about the eye', () => {
  const cfg = CONFIG.fog;
  const out = { x: 0, y: 0 };

  it('is zero with no rain', () => {
    expect(rainFlowAt(frameAt(T, 0, 0, Number.NaN), 1000, 0, out)).toEqual({ x: 0, y: 0 }); // a frame that cannot rain
  });

  it('is tangential about the live eye, at the edge speed on and outside the ring, slower inside', () => {
    const fr = frameAt(T, 300, -200);
    const R = fr.R;
    for (const [r, ang] of [[0.5 * R, 0.3], [R, 1.9], [1.3 * R, 4]]) {
      const px = 300 + r * Math.cos(ang);
      const py = -200 + r * Math.sin(ang);
      const v = rainFlowAt(fr, px, py, out);
      expect(v.x * (px - 300) + v.y * (py + 200)).toBeCloseTo(0, 6);
      const speed = Math.hypot(v.x, v.y);
      if (r >= R) expect(speed).toBeCloseTo(cfg.edgeSpeedU / 1000, 9);
      else expect(speed).toBeLessThan(cfg.edgeSpeedU / 1000);
    }
  });
});

describe('the wisps', () => {
  it('motion off → the tile does not scroll; motion on → it rolls with the rain at the view centre', () => {
    const { view } = makeView();
    const at = { x: 2500, y: 1200 };
    view.update(100, T, false, at);
    view.update(100, T + 100, false, at);
    expect(view.scroll).toEqual({ x: 0, y: 0 });
    view.update(100, T + 200, true, at);
    const v = rainFlowAt(frameAt(T + 200), at.x, at.y, { x: 0, y: 0 });
    const period = F.puffTilePx / F.puffPxPerU;
    expect(v.x !== 0 || v.y !== 0).toBe(true);
    expect(view.scroll.x).toBeCloseTo((((v.x * 100) % period) + period) % period, 6);
    expect(view.scroll.y).toBeCloseTo((((v.y * 100) % period) + period) % period, 6);
  });

  it('is sized to the raster rect ∩ the screen, at maxAlpha, masked by the density sprite on alpha', () => {
    const { view } = makeView();
    view.update(16, 0, false, own, { x: -200, y: -100, w: 400, h: 200 });
    const t = view.wisps;
    expect([t.position.x, t.position.y, t.width, t.height]).toEqual([-200, -100, 400, 200]);
    expect(t.alpha).toBe(F.maxAlpha);
    expect(t.mask).toBe(view.densityMask);
  });

  it('the puff tile is deterministic, in range, and seamless across both edges', () => {
    const a = bakePuffTile(7);
    expect(Buffer.from(bakePuffTile(7).alpha.buffer).equals(Buffer.from(a.alpha.buffer))).toBe(true); // byte-identical (toEqual on 262k floats is slow)
    const S = a.size;
    expect(S).toBe(F.puffTilePx);
    let mean = 0;
    let lo = 1;
    let hi = 0;
    for (const v of a.alpha) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
      mean += v / a.alpha.length;
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    expect(mean).toBeGreaterThan(0.2); // dense body
    // Seamless: the jump across the seam (last column → first) is no larger
    // than the largest jump between any two interior neighbours.
    let interiorX = 0;
    let seamX = 0;
    let interiorY = 0;
    let seamY = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S - 1; x++) interiorX = Math.max(interiorX, Math.abs(a.alpha[y * S + x + 1] - a.alpha[y * S + x]));
      seamX = Math.max(seamX, Math.abs(a.alpha[y * S] - a.alpha[y * S + S - 1]));
    }
    for (let x = 0; x < S; x++) {
      for (let y = 0; y < S - 1; y++) interiorY = Math.max(interiorY, Math.abs(a.alpha[(y + 1) * S + x] - a.alpha[y * S + x]));
      seamY = Math.max(seamY, Math.abs(a.alpha[x] - a.alpha[(S - 1) * S + x]));
    }
    expect(seamX).toBeLessThanOrEqual(interiorX);
    expect(seamY).toBeLessThanOrEqual(interiorY);
  });
});

describe('the halo mask and the spectator', () => {
  it('masks the layer at the own hull while fog is drawn; a spectator is unmasked and covers the screen', () => {
    const { view, layer } = makeView();
    view.update(16, 0, false, { x: 10, y: 20 });
    expect(layer.mask).toBe(view.haloMask);
    expect([view.haloMask!.position.x, view.haloMask!.position.y]).toEqual([10, 20]);
    const screen = { x: 1000, y: 1000, w: 6000, h: 3000 };
    view.update(16, 16, false, null, screen, 'spectate');
    expect(layer.mask ?? null).toBeNull();
    expect(view.drawn).toBe(true);
    const r = view.raster;
    expect(r.n).toBe(SPECTATOR_CELLS + 1);
    expect(r.ox).toBeLessThanOrEqual(screen.x);
    expect(r.ox + (r.n - 1) * r.cellU).toBeGreaterThanOrEqual(screen.x + screen.w);
  });
});

describe('edge cases (review gate)', () => {
  it('alive with no pose yet (predictor not seeded) draws nothing and samples nothing — never the spectator raster', () => {
    const { view, layer, calls } = makeView();
    const screen = { x: -300, y: -200, w: 600, h: 400 };
    for (let k = 0; k < 10; k++) view.update(300, k * 300, true, null, screen, 'alive');
    expect(view.drawn).toBe(false);
    expect(calls.n).toBe(0);
    expect(view.refreshCount).toBe(0);
    expect(layer.mask ?? null).toBeNull();
    view.update(16, 3000, true, own, screen, 'alive'); // the pose arrives: the halo-square raster, masked
    expect(view.drawn).toBe(true);
    expect(view.raster.n).not.toBe(SPECTATOR_CELLS + 1);
    expect(layer.mask).toBe(view.haloMask);
  });
});

// STORY 11.2 FOLLOW-UP 3 (ruling R1): the density sprite is a LIVE alpha mask.
// Pixi binds a sprite mask's TextureSource into the pooled MaskFilter's bind
// group, and a destroyed source destroys that group — the next mask push read
// `resources` = null inside Pixi's render and froze the client. These drive the
// real raster geometry across every size the view can take and hold the source
// to one identity, never destroyed, with a REAL MaskFilter bound to it the way
// the pooled AlphaMaskEffect is.
describe('the density mask keeps ONE live source (the frozen-client crash)', () => {
  /** Every geometry the view can be asked for, in an order that crosses steps both ways. */
  const walk = (view: FogFieldView, step: (k: number) => void): void => {
    let t = 0;
    const frame = (pose: { x: number; y: number } | null, screen: { x: number; y: number; w: number; h: number }, mode: 'alive' | 'spectate'): void => {
      t += 16;
      view.update(16, t, false, pose, screen, mode);
      step(t);
    };
    const around = (half: number): { x: number; y: number; w: number; h: number } => ({ x: -half * 1.6, y: -half, w: half * 3.2, h: half * 2 });
    // zoom out past several 512 u steps, then back in (the alive raster resizes)
    for (const half of [200, 600, 1100, 1700, 2600, 4000, 9000, 4000, 1700, 600, 200]) frame(own, around(half), 'alive');
    frame(null, around(3000), 'spectate'); // the spectator size
    view.setHaloU(750); // a halo change
    frame(own, around(600), 'alive');
    view.setHaloU(4000);
    frame(own, around(2600), 'alive');
  };

  it('the source is never replaced or destroyed while n changes, and a MaskFilter bound to it stays usable', () => {
    const { view } = makeView();
    view.update(16, 0, false, own, { x: -320, y: -200, w: 640, h: 400 }, 'alive');
    const source = view.densityMask.texture.source;
    const filter = new MaskFilter({ sprite: view.densityMask, inverse: false, channel: 'alpha' });
    const sizes = new Set<number>();
    walk(view, () => {
      sizes.add(view.raster.n);
      // AlphaMaskPipe's pushMaskBegin: the pooled effect's first touch. Throws
      // "Cannot read properties of null" once the bound source is destroyed.
      expect(() => {
        filter.inverse = false;
        filter.channel = 'alpha';
      }).not.toThrow();
      expect(view.densityMask.texture.source).toBe(source);
      expect(source.destroyed).toBe(false);
      filter.resources.uMaskTexture = view.densityMask.texture.source; // MaskFilter.apply's rebind
    });
    expect(sizes.size).toBeGreaterThanOrEqual(3); // the walk really did change the raster size
  });

  it('cell (i, j) still maps to the same world square, its alpha is the density, and the padding clamps the last cell', () => {
    const { view } = makeView();
    view.setZone(ZONE_T0, -2000, 0);
    walk(view, () => {
      const { density, n, cellU, ox, oy } = view.raster;
      const sp = view.densityMask;
      const side = sp.texture.source.width;
      expect(side).toBe(DENSITY_TEXTURE_CELLS);
      expect(n).toBeLessThanOrEqual(side);
      // texel i spans [x, x + scale) from the sprite origin: its centre is the raster cell's centre
      expect(sp.scale.x).toBe(cellU);
      expect(sp.scale.y).toBe(cellU);
      expect(sp.anchor.x).toBe(0);
      expect(sp.position.x + 0.5 * sp.scale.x).toBe(ox);
      expect(sp.position.y + 0.5 * sp.scale.y).toBe(oy);
      expect(sp.texture.frame.width).toBe(side); // the whole texture, so orig = source size in the mask matrix
      const rgba = sp.texture.source.resource as Uint8Array;
      for (const [i, j] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1], [n >> 1, n >> 2]]) {
        expect(rgba[(j * side + i) * 4 + 3]).toBe(Math.round(density[j * n + i] * 255));
      }
    });
  });
});

describe('packDensityRgba — the raster in the texture corner', () => {
  const raster = (n: number): Float32Array => Float32Array.from({ length: n * n }, (_, k) => ((k * 37) % 101) / 100);
  const alphaAt = (out: Uint8Array, side: number, i: number, j: number): number => out[(j * side + i) * 4 + 3];

  it('writes white texels with alpha = density in the n × n corner, rows at the texture stride', () => {
    const n = 5;
    const side = 8;
    const d = raster(n);
    const out = new Uint8Array(side * side * 4);
    packDensityRgba(d, n, out, side);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = (j * side + i) * 4;
        expect([out[k], out[k + 1], out[k + 2], out[k + 3]]).toEqual([255, 255, 255, Math.round(d[j * n + i] * 255)]);
      }
    }
  });

  it('column n and row n repeat the last column / row (linear filtering clamps as at a texture edge); nothing past them is written', () => {
    const n = 5;
    const side = 8;
    const d = raster(n);
    const out = new Uint8Array(side * side * 4);
    packDensityRgba(d, n, out, side);
    for (let j = 0; j < n; j++) expect(alphaAt(out, side, n, j)).toBe(alphaAt(out, side, n - 1, j));
    for (let i = 0; i <= n; i++) expect(alphaAt(out, side, i, n)).toBe(alphaAt(out, side, i, n - 1));
    for (let j = 0; j < side; j++) for (let i = n + 1; i < side; i++) expect(alphaAt(out, side, i, j)).toBe(0);
    for (let i = 0; i < side; i++) expect(alphaAt(out, side, i, n + 1)).toBe(0);
  });

  it('a raster that fills the texture writes exactly side² texels and no padding', () => {
    const side = 6;
    const d = raster(side);
    const out = new Uint8Array(side * side * 4);
    expect(() => packDensityRgba(d, side, out, side)).not.toThrow();
    for (let k = 0; k < side * side; k++) expect(out[k * 4 + 3]).toBe(Math.round(d[k] * 255));
  });
});

describe('the declared seat', () => {
  const at = (n: string): number => CHART_LAYER_ORDER.indexOf(n as never);
  it('fog sits directly above litZone and directly below smoke, under every hull and mark', () => {
    expect(at('fog')).toBe(at('litZone') + 1);
    expect(at('smoke')).toBe(at('fog') + 1);
    for (const above of ['mineChart', 'ship', 'plate', 'cloud', 'blip', 'ownShip']) {
      expect(at(above)).toBeGreaterThan(at('fog'));
    }
  });
});


// STORY 11.2: the halo rides the 350 hm muzzle-flash reach, so the alive raster
// is capped at what the screen shows from the hull and at ALIVE_MAX_CELLS a side.
describe('aliveRasterGeometry — the alive raster is bounded at every halo and zoom', () => {
  const F = CLIENT_CONFIG.fogField;
  const geo = (halo: number, reach: number): { n: number; cell: number } => {
    const out = { n: 0, cell: 0 };
    aliveRasterGeometry(halo, reach, out);
    return out;
  };

  it('never carries more than ALIVE_MAX_CELLS (+1) a side, and covers min(halo, screen fit)', () => {
    for (const halo of [500, 2000, 2 * CONFIG.vision.muzzleFlash, 40000]) {
      for (const reach of [300, 1400, 6000, 12000, Number.NaN]) {
        const g = geo(halo, reach);
        expect(g.n - 1, `${halo}/${reach}`).toBeLessThanOrEqual(ALIVE_MAX_CELLS);
        const want = Number.isFinite(reach) ? Math.min(halo, 2 * (reach + F.recenterU)) : halo;
        expect((g.n - 1) * g.cell, `${halo}/${reach}`).toBeGreaterThanOrEqual(want - 1e-9);
      }
    }
  });

  it('a small halo keeps the shipped cell (the old raster, untouched)', () => {
    expect(geo(2 * (750 + F.recenterU), Number.NaN).cell).toBe(F.cellU);
  });

  it('screenReachU is the farthest screen corner from the centre', () => {
    expect(screenReachU({ x: -30, y: -40, w: 60, h: 80 }, { x: 0, y: 0 })).toBeCloseTo(50, 9);
    expect(screenReachU({ x: 0, y: 0, w: 60, h: 80 }, { x: 0, y: 0 })).toBeCloseTo(100, 9);
  });
});
