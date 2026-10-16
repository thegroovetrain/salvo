// THE FOG FIELD view (render/fogField.ts + render/fogPuffTile.ts, Story 9.10
// re-plan "THE FIELD"; Eric's pick B "Wisps"). The contract: the density
// raster is the shared field sampled deterministically for (seed, t, cut);
// it is re-evaluated only on its cadence or a re-centre, never per frame; the
// drawn cut eases at most `cutEasePerS × dt`; no fog → a dark bitmap and
// nothing drawn or evaluated; motion off → the wisps hold still; the wisps
// tile is seamless; the halo mask follows the own hull (a spectator is
// unmasked); the `fog` layer sits between `litZone` and `smoke`.

import { describe, it, expect, vi } from 'vitest';
import { Container, Texture, TextureSource } from 'pixi.js';
import { CONFIG, FOG_NO_CUT, fogDensityAt, makeFogField } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { FogFieldView, SPECTATOR_CELLS, easeFogCut, fillFogRaster } from '../render/fogField.js';
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
/** A cut below every noise value: density 1 everywhere. */
const FULL = -2;
/** A mid cut: a mix of fogged and clear cells. */
const MID = 0.1;
const own = { x: 0, y: 0 };

function makeView(): { view: FogFieldView; layer: Container; calls: { n: number } } {
  const calls = { n: 0 };
  const spy: typeof fogDensityAt = (...a) => {
    calls.n++;
    return fogDensityAt(...a);
  };
  const layer = new Container();
  const view = new FogFieldView(layer, spy);
  view.setSeed(SEED);
  return { view, layer, calls };
}

describe('fillFogRaster — the shared field, sampled deterministically', () => {
  it('same (seed, t, cut) → identical raster, every value in [0, 1], with fog and clear water both present at a mid cut', () => {
    const n = 40;
    const a = new Float32Array(n * n);
    const b = new Float32Array(n * n);
    fillFogRaster(a, makeFogField(SEED, CONFIG.fog), -400, -400, 20, n, 5000, MID);
    fillFogRaster(b, makeFogField(SEED, CONFIG.fog), -400, -400, 20, n, 5000, MID);
    expect(b).toEqual(a);
    for (const v of a) expect(v >= 0 && v <= 1).toBe(true);
    expect(a.some((v) => v > 0)).toBe(true);
    expect(a.some((v) => v === 0)).toBe(true);
  });

  it('the no-fog cut fills zeros and reports nothing lit', () => {
    const out = new Float32Array(16).fill(0.5);
    expect(fillFogRaster(out, makeFogField(SEED, CONFIG.fog), 0, 0, 10, 4, 0, FOG_NO_CUT)).toBe(false);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('the view raster equals the pure fill at the view geometry, time and cut', () => {
    const { view } = makeView();
    view.setCut(MID);
    view.update(16, 7000, false, own);
    const r = view.raster;
    const ref = new Float32Array(r.n * r.n);
    fillFogRaster(ref, makeFogField(SEED, CONFIG.fog), r.ox, r.oy, r.cellU, r.n, 7000, MID);
    expect(r.density).toEqual(ref);
  });
});

describe('the refresh cadence — never per frame', () => {
  it('evaluates n² samples on the first frame, nothing until refreshMs has passed, then n² again', () => {
    const { view, calls } = makeView();
    view.setCut(FULL);
    view.update(16, 0, true, own);
    const n = view.raster.n;
    expect(view.refreshCount).toBe(1);
    expect(calls.n).toBe(n * n);
    let t = 0;
    while (t + 16 < F.refreshMs - 16) {
      t += 16;
      view.update(16, t, true, own);
    }
    expect(view.refreshCount).toBe(1);
    expect(calls.n).toBe(n * n);
    view.update(32, t + 32, true, own);
    expect(view.refreshCount).toBe(2);
    expect(calls.n).toBe(2 * n * n);
  });

  it('re-centres (and refreshes at once) only past recenterU; the buffers are reused', () => {
    const { view } = makeView();
    view.setCut(FULL);
    view.update(16, 0, false, own);
    const buf = view.raster.density;
    view.update(16, 16, false, { x: F.recenterU * 0.5, y: 0 });
    expect(view.refreshCount).toBe(1);
    view.update(16, 32, false, { x: F.recenterU + 30, y: 0 });
    expect(view.refreshCount).toBe(2);
    const r = view.raster;
    expect(Math.abs(r.ox + ((r.n - 1) / 2) * r.cellU - (F.recenterU + 30))).toBeLessThanOrEqual(r.cellU);
    expect(Math.abs(r.ox % r.cellU)).toBe(0); // the origin snaps to the cell grid
    expect(r.density).toBe(buf);
  });

  it('a refresh of the real field over the halo square is cheap (printed under HC_PERF_LOG=1)', () => {
    const view = new FogFieldView(new Container());
    view.setSeed(SEED);
    view.setCut(MID);
    view.update(16, 0, false, own); // warm-up
    let best = Number.POSITIVE_INFINITY;
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      view.update(F.refreshMs, (k + 1) * F.refreshMs, false, own);
      best = Math.min(best, performance.now() - t0);
    }
    const n = view.raster.n;
    if (process.env.HC_PERF_LOG === '1') {
      console.log(`[fogField] refresh ${n}×${n} = ${n * n} samples: best-of-5 ${best.toFixed(2)} ms`);
    }
    expect(view.refreshCount).toBe(6);
    expect(best).toBeLessThan(50); // a loose guard against an accidental O(n⁴); the target is < 2–3 ms
  });
});

describe('the eased cut', () => {
  it('moves at most cutEasePerS × dt toward the target', () => {
    expect(easeFogCut(0.5, 0, 1000)).toBeCloseTo(0.5 - F.cutEasePerS, 9);
    expect(easeFogCut(0.5, 1, 500)).toBeCloseTo(0.5 + F.cutEasePerS / 2, 9);
    expect(easeFogCut(0.5, 0.5 + F.cutEasePerS / 10, 1000)).toBeCloseTo(0.5 + F.cutEasePerS / 10, 9); // lands, never overshoots
  });

  it('snaps when either side is the no-fog cut; a non-finite target is no fog', () => {
    expect(easeFogCut(FOG_NO_CUT, 0.3, 16)).toBe(0.3);
    expect(easeFogCut(0.3, FOG_NO_CUT, 16)).toBe(FOG_NO_CUT);
    expect(easeFogCut(0.3, Number.NaN, 16)).toBe(FOG_NO_CUT);
  });

  it('the view eases frame by frame', () => {
    const { view } = makeView();
    view.setCut(0.4);
    view.update(16, 0, false, own);
    expect(view.drawnCut).toBe(0.4);
    view.setCut(0.2);
    view.update(1000, 1000, false, own);
    expect(view.drawnCut).toBeCloseTo(0.4 - F.cutEasePerS, 9);
  });
});

describe('no fog → a dark bitmap, nothing drawn, nothing evaluated', () => {
  it('the no-fog cut never samples the field and draws nothing', () => {
    const { view, layer, calls } = makeView();
    view.setCut(FOG_NO_CUT);
    for (let k = 0; k < 30; k++) view.update(100, k * 100, true, own);
    expect(calls.n).toBe(0);
    expect(view.drawn).toBe(false);
    expect(layer.mask ?? null).toBeNull();
  });

  it('fog → none zeroes the bitmap; clear() (the match-start edge) does too and resets the cut', () => {
    const { view } = makeView();
    view.setCut(FULL);
    view.update(16, 0, false, own);
    expect(view.drawn).toBe(true);
    expect(view.raster.density.every((v) => v === 1)).toBe(true);
    view.setCut(FOG_NO_CUT);
    view.update(16, 16, false, own);
    expect(view.drawn).toBe(false);
    expect(view.raster.density.every((v) => v === 0)).toBe(true);
    view.setCut(FULL);
    view.update(16, 32, false, own);
    expect(view.drawn).toBe(true);
    view.clear();
    expect(view.drawnCut).toBe(FOG_NO_CUT);
    expect(view.drawn).toBe(false);
    expect(view.raster.density.every((v) => v === 0)).toBe(true);
  });

  it('no seed (no welcome yet) draws nothing', () => {
    const view = new FogFieldView(new Container());
    view.setCut(FULL);
    view.update(16, 0, false, own);
    expect(view.drawn).toBe(false);
  });
});

describe('the wisps', () => {
  it('motion off → the tile does not scroll; motion on → it rolls with the field wind', () => {
    const { view } = makeView();
    view.setCut(FULL);
    view.update(100, 0, false, own);
    view.update(100, 100, false, own);
    expect(view.scroll).toEqual({ x: 0, y: 0 });
    const field = makeFogField(SEED, CONFIG.fog);
    view.update(100, 200, true, own);
    expect(view.scroll.x).toBeCloseTo(((field.windX * 100) % 1024 + 1024) % 1024, 6);
    expect(view.scroll.y).toBeCloseTo(((field.windY * 100) % 1024 + 1024) % 1024, 6);
  });

  it('is sized to the raster rect ∩ the screen, at maxAlpha, masked by the density sprite on alpha', () => {
    const { view } = makeView();
    view.setCut(FULL);
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
    view.setCut(FULL);
    view.update(16, 0, false, { x: 10, y: 20 });
    expect(layer.mask).toBe(view.haloMask);
    expect([view.haloMask!.position.x, view.haloMask!.position.y]).toEqual([10, 20]);
    const screen = { x: 1000, y: 1000, w: 6000, h: 3000 };
    view.update(16, 16, false, null, screen);
    expect(layer.mask ?? null).toBeNull();
    expect(view.drawn).toBe(true);
    const r = view.raster;
    expect(r.n).toBe(SPECTATOR_CELLS + 1);
    expect(r.ox).toBeLessThanOrEqual(screen.x);
    expect(r.ox + (r.n - 1) * r.cellU).toBeGreaterThanOrEqual(screen.x + screen.w);
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
