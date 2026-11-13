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
import { CONFIG, DEFAULT_CLASS_ID, rasterizeHullCoverage } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { Camera } from '../render/camera.js';
import { DIM_MASK_LABEL, HEAT_FALLBACK_MAX_CELLS, Radar } from '../render/radar.js';
import type { ScreenWorldRect } from '../render/camera.js';

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
    radar.render(own, 900, cam.worldView, screen);
    const c = rasterizeHullCoverage(DEFAULT_CLASS_ID, own.x + 240, own.y - 180, 0, CELL);
    radar.onBlip({ k: 'blip', t: 1000, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits });
    radar.render(own, 1000, cam.worldView, screen);

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

// THE FIRST FRAME, THE EMPTY SCOPE AND THE LOBBY (Story 11.2 follow-up, ruling
// G1). Story 11.2 made the dim sprite ~22,700 u across. Two holes let Pixi size
// the masked pass to the WHOLE sprite (a 16,384² / 32,768² GPU target):
//  - an EMPTY layer (no paint yet — the first frame the mask goes on — or an
//    empty scope): Pixi pushes the empty (±Infinity) bounds through a matrix,
//    gets NaN, and its intersection with the mask then returns the mask itself;
//  - a caller with a camera view but no screen rect (the lobby's ambient
//    scene): the heat sprite went unclipped.
// The pass must sit inside the screen on every frame, at every zoom and reach.

function within(b: { minX: number; minY: number; maxX: number; maxY: number }, screen: ScreenWorldRect): void {
  const eps = 1e-6;
  expect(Number.isFinite(b.minX + b.minY + b.maxX + b.maxY), 'finite bounds').toBe(true);
  expect(b.minX).toBeGreaterThanOrEqual(screen.x - eps);
  expect(b.minY).toBeGreaterThanOrEqual(screen.y - eps);
  expect(b.maxX).toBeLessThanOrEqual(screen.x + screen.w + eps);
  expect(b.maxY).toBeLessThanOrEqual(screen.y + screen.h + eps);
}

function scene(): { root: Container; layer: Container; radar: Radar } {
  const root = new Container({ isRenderGroup: true });
  const layer = new Container();
  root.addChild(layer);
  const radar = new Radar(layer, new Container());
  radar.onSweepSample(0, 0);
  return { root, layer, radar };
}

function passBounds(root: Container, layer: Container): ReturnType<Container['getFastGlobalBounds']> {
  updateRenderGroupTransforms(root.renderGroup!, true);
  return layer.getFastGlobalBounds(true);
}

describe('the masked pass is bounded on EVERY frame (Story 11.2 follow-up)', () => {
  const own = { x: 1200, y: -800 };
  // The close limit, the default, a wide user zoom and the whole-board ring fit.
  const spans = [CLIENT_CONFIG.zoom.closeSpanU, CLIENT_CONFIG.zoom.defaultSpanU, 6000, 2 * CONFIG.map.baseRadius * 1.05];

  it.each(spans)('the first frame the mask goes on, with nothing painted yet, at a %s u span', (spanU) => {
    const { root, layer, radar } = scene();
    const cam = camera(spanU);
    cam.snapTo(own);
    const screen = cam.screenWorldRect;
    radar.render(own, 0, cam.worldView, screen);
    expect(layer.mask, 'the dim mask is on').not.toBeNull();
    within(passBounds(root, layer), screen);
  });

  it.each([CONFIG.vision.radar * 0.5, CONFIG.vision.radar, CONFIG.vision.radar * 2])(
    'whatever the radar reach (%s u), an empty and a painted scope stay inside the screen',
    (radarU) => {
      const { root, layer, radar } = scene();
      radar.setRanges(CONFIG.vision.sight, radarU, 60000 / CONFIG.vision.sweepRpm);
      for (const spanU of spans) {
        const cam = camera(spanU);
        cam.snapTo(own);
        const screen = cam.screenWorldRect;
        radar.render(own, 900, cam.worldView, screen);
        within(passBounds(root, layer), screen);
      }
    },
  );

  it('the lobby\'s ambient call (a camera view, no screen rect) is clipped to that view', () => {
    const { root, layer, radar } = scene();
    const cam = camera(CLIENT_CONFIG.zoom.defaultSpanU);
    cam.snapTo(own);
    const view = cam.worldView;
    radar.render(own, 900, view);
    const c = rasterizeHullCoverage(DEFAULT_CLASS_ID, own.x + 240, own.y - 180, 0, CELL);
    radar.onBlip({ k: 'blip', t: 1000, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits });
    radar.render(own, 1000, view);
    expect(layer.mask, 'the dim mask is on').not.toBeNull();
    within(passBounds(root, layer), { x: view.x - view.halfW, y: view.y - view.halfH, w: 2 * view.halfW, h: 2 * view.halfH });
  });

  it('with no rect at all to bound the pass by, the mask stays off (an undimmed scope, never an unbounded pass)', () => {
    const { layer, radar } = scene();
    radar.render(own, 900);
    expect(layer.mask ?? null).toBeNull();
  });
});

describe('the camera-less heat window is bounded (Story 11.2 follow-up, G2)', () => {
  it.each([CONFIG.vision.radar, CONFIG.vision.radar * 4])('a %s u radar sizes its fallback buffer within the cap', (radarU) => {
    const { radar } = scene();
    radar.setRanges(CONFIG.vision.sight, radarU, 60000 / CONFIG.vision.sweepRpm);
    radar.render({ x: 0, y: 0 }, 900);
    const g = (radar as unknown as { heat: { grid: { cols: number; rows: number } } | null }).heat?.grid;
    expect(g).toBeDefined();
    expect(Math.max(g!.cols, g!.rows)).toBeLessThanOrEqual(HEAT_FALLBACK_MAX_CELLS);
  });
});
