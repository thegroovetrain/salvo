// THE MASKED PASS'S BOUNDS (Story 11.2 follow-up, ruling G1): `maskPassRect`
// is what a sprite-masked layer's filter pass is limited to. Contract: the rect
// lies inside the screen's world rect for any zoom, device pixel ratio and mask
// reach — so the pass, in device pixels, never exceeds the viewport's backing —
// and it is exactly screen ∩ the mask's frame.

import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { Camera } from '../render/camera.js';
import { maskPassRect, usableScreen, viewAsScreen, type PassRect } from '../render/maskPass.js';

const out = (): PassRect => ({ x: 0, y: 0, width: 0, height: 0 });

function screenAt(viewW: number, viewH: number, spanU: number, cx: number, cy: number) {
  const c = new Camera({
    defaultSpanU: CLIENT_CONFIG.zoom.defaultSpanU,
    closeSpanU: CLIENT_CONFIG.zoom.closeSpanU,
    ringFitMargin: CLIENT_CONFIG.reveal.mapFitMargin,
    followRate: 6,
    leadSeconds: 0,
    leadMax: 0,
  });
  c.setViewport(viewW, viewH);
  c.setRing(0, 0, CONFIG.map.baseRadius);
  c.setUserZoom(CLIENT_CONFIG.zoom.defaultSpanU / spanU);
  c.snapTo({ x: cx, y: cy });
  return { rect: c.screenWorldRect, zoom: c.zoom };
}

describe('maskPassRect', () => {
  const viewports: Array<[number, number]> = [[1600, 900], [2560, 1300], [390, 844]];
  const spans = [CLIENT_CONFIG.zoom.closeSpanU, CLIENT_CONFIG.zoom.defaultSpanU, 6000, 2 * CONFIG.map.baseRadius * 1.05];
  // From a sliver to many times today's radar (the dim's span is radar × 1.25).
  const reaches = [10, CONFIG.vision.sight, CONFIG.vision.radar * 1.25, CONFIG.vision.radar * 5];

  it('the pass never exceeds the viewport backing, at any zoom, DPR and reach', () => {
    for (const [w, h] of viewports) {
      for (const spanU of spans) {
        for (const halfU of reaches) {
          for (const dpr of [1, 2, 3]) {
            const { rect, zoom } = screenAt(w, h, spanU, 300, -200);
            const r = maskPassRect(rect, 340, -260, halfU, out());
            expect(r).not.toBeNull();
            expect(Math.ceil(r!.width * zoom * dpr)).toBeLessThanOrEqual(Math.ceil(w * dpr) + 1);
            expect(Math.ceil(r!.height * zoom * dpr)).toBeLessThanOrEqual(Math.ceil(h * dpr) + 1);
            expect(r!.x).toBeGreaterThanOrEqual(rect.x - 1e-9);
            expect(r!.y).toBeGreaterThanOrEqual(rect.y - 1e-9);
          }
        }
      }
    }
  });

  it('is exactly screen ∩ the mask frame', () => {
    const r = maskPassRect({ x: 0, y: 0, w: 100, h: 50 }, 90, 10, 20, out());
    expect(r).toEqual({ x: 70, y: 0, width: 30, height: 30 });
  });

  it('a mask frame wholly off screen is an empty pass, not an unbounded one', () => {
    const r = maskPassRect({ x: 0, y: 0, w: 100, h: 50 }, 1000, 1000, 20, out());
    expect(r!.width * r!.height).toBe(0);
  });

  it('cannot be bounded without a usable screen or a finite frame: null', () => {
    expect(maskPassRect(null, 0, 0, 10, out())).toBeNull();
    expect(maskPassRect({ x: 0, y: 0, w: 0, h: 10 }, 0, 0, 10, out())).toBeNull();
    expect(maskPassRect({ x: Number.NaN, y: 0, w: 10, h: 10 }, 0, 0, 10, out())).toBeNull();
    expect(maskPassRect({ x: 0, y: 0, w: 10, h: 10 }, Number.NaN, 0, 10, out())).toBeNull();
    expect(maskPassRect({ x: 0, y: 0, w: 10, h: 10 }, 0, 0, Number.POSITIVE_INFINITY, out())).toBeNull();
  });

  it('viewAsScreen is the view\'s own rect, and refuses a non-finite one', () => {
    expect(viewAsScreen({ x: 10, y: 20, halfW: 5, halfH: 4 })).toEqual({ x: 5, y: 16, w: 10, h: 8 });
    expect(viewAsScreen(null)).toBeNull();
    expect(viewAsScreen({ x: 0, y: 0, halfW: Number.NaN, halfH: 1 })).toBeNull();
    expect(usableScreen({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
  });
});
