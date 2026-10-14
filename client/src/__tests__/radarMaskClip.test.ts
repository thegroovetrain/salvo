// THE RADAR'S MASKED PASS IS CLIPPED TO THE SCREEN (Story 9.8 perf gate).
//
// `blipLayer` is masked by the near-range dim sprite, so Pixi draws it through
// a filter pass sized to the layer's bounds ∩ the mask's — and Pixi's mask
// filter opts OUT of viewport clipping. The heat buffer carries whole cells of
// slack past the view, so at the close framing that pass ran 2063 px tall at
// DPR 2 (a 4096² pooled target). The heat sprite's bounds are now cut to the
// screen's world rect: whatever the framing, the pass is never larger than the
// screen. Nothing off screen is visible, so no on-screen pixel changes.

import { describe, it, expect, vi } from 'vitest';
import { Container, Sprite, Texture, TextureSource, updateRenderGroupTransforms } from 'pixi.js';
import { CONFIG, rasterizeHullCoverage } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { Camera } from '../render/camera.js';
import { DIM_MASK_LABEL, Radar } from '../render/radar.js';

// jsdom has no 2d canvas: the sweep wedge is stubbed, and the dim mask is a
// texture of the REAL bake's size (no pixels), so the mask's world bounds — the
// other half of the pass's intersection — are the real ones.
vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  const size = actual.DIM_MASK_TEXTURE_SIZE;
  return {
    ...actual,
    bakeSweepTexture: (): Texture => Texture.EMPTY,
    bakeDimMaskTexture: (): Texture => new Texture({ source: new TextureSource({ width: size, height: size }) }),
  };
});

const CELL = CLIENT_CONFIG.blip.heatmap.cellU;

function camera(spanU: number): Camera {
  const c = new Camera({
    defaultSpanU: CLIENT_CONFIG.zoom.defaultSpanU,
    closeSpanU: CLIENT_CONFIG.zoom.closeSpanU,
    ringFitMargin: CLIENT_CONFIG.reveal.mapFitMargin,
    followRate: 6,
    leadSeconds: 0,
    leadMax: 0,
  });
  c.setViewport(1600, 900);
  c.setRing(0, 0, CONFIG.map.baseRadius);
  c.setUserZoom(CLIENT_CONFIG.zoom.defaultSpanU / spanU);
  return c;
}

describe('the radar layer\'s masked pass stays inside the screen', () => {
  it.each([
    ['close', CLIENT_CONFIG.zoom.closeSpanU],
    ['default', CLIENT_CONFIG.zoom.defaultSpanU],
  ])('at the %s framing, with paint on the scope', (_name, spanU) => {
    const root = new Container({ isRenderGroup: true });
    const layer = new Container();
    root.addChild(layer);
    const radar = new Radar(layer, new Container());
    radar.onSweepSample(0, 0);
    const own = { x: 1200, y: -800 };
    const cam = camera(spanU);
    cam.snapTo(own);
    const screen = cam.screenWorldRect;
    radar.render(own, 900, null, cam.worldView, screen);
    const c = rasterizeHullCoverage('mineLayer', own.x + 240, own.y - 180, 0, CELL);
    radar.onBlip({ k: 'blip', t: 1000, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits });
    radar.render(own, 1000, null, cam.worldView, screen);

    const heat = layer.children.find((k): k is Sprite => k instanceof Sprite && k.label !== DIM_MASK_LABEL);
    expect(heat?.visible, 'the scope holds paint').toBe(true);
    expect(layer.mask, 'the dim mask is on').not.toBeNull();
    updateRenderGroupTransforms(root.renderGroup!, true);
    const b = layer.getFastGlobalBounds(true);
    const eps = 1e-6;
    expect(b.minX).toBeGreaterThanOrEqual(screen.x - eps);
    expect(b.minY).toBeGreaterThanOrEqual(screen.y - eps);
    expect(b.maxX).toBeLessThanOrEqual(screen.x + screen.w + eps);
    expect(b.maxY).toBeLessThanOrEqual(screen.y + screen.h + eps);
    expect(b.height, 'the whole screen height is still drawn').toBeGreaterThan(screen.h * 0.99);
  });
});
