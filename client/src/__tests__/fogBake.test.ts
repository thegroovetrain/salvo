// THE FOG BAKE UNDER THE FREE CAMERA (Story 11.8 review). The normal bake —
// 2 × the viewport about the own hull — must keep its pre-11.8 resolution for
// every player at ordinary zoom; only a hull panned OFF the screen takes the
// wide (hole-diameter) bake, with hysteresis so an edge-straddling hull does
// not re-bake every frame. The canvas bake itself is stubbed (jsdom has no 2D
// canvas): what is under test is which bake the overlay asks for.

import { describe, it, expect, vi } from 'vitest';
import { Container, Texture, TextureSource } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

vi.mock('../render/textures.js', async (orig) => {
  const actual = await orig<typeof import('../render/textures.js')>();
  return {
    ...actual,
    bakeFogTexture: (w: number, h: number) => new Texture({ source: new TextureSource({ width: w, height: h }) }),
  };
});

const { EXTRA_MARGIN_PX, FOG_BAKE_MAX_PX, FOG_WIDE_BAND_PX, Fog, fogWideBake } = await import('../render/fog.js');

const VW = 1920;
const VH = 1080;
/** The default framing's px per u at this viewport (camera.ts baseZoom). */
const ZOOM = Math.min(VW, VH) / CLIENT_CONFIG.zoom.defaultSpanU;

/** The pre-11.8 bake scale (`git show 2fea27e0:client/src/render/fog.ts`,
 *  `fogBakeSize(viewW, viewH)`): 2 × the viewport + the margin, capped. */
function preDiffScale(vw: number, vh: number): number {
  return Math.min(1, FOG_BAKE_MAX_PX / Math.max(2 * vw + 2 * EXTRA_MARGIN_PX, 2 * vh + 2 * EXTRA_MARGIN_PX));
}

describe('Fog bake resolution — the hull-centered bake keeps the pre-11.8 scale', () => {
  it('at the default zoom with the hull centered, the bake scale is the pre-diff value (the hole is far wider than the screen)', () => {
    expect(CONFIG.vision.hullSight * ZOOM).toBeGreaterThan(VW); // premise: the hole dwarfs the screen
    const fog = new Fog(new Container());
    fog.rebake(VW, VH, ZOOM);
    fog.update(VW / 2, VH / 2);
    expect(fog.wideBake).toBe(false);
    expect(fog.bakeScale).toBe(preDiffScale(VW, VH));
  });

  it('a hull panned off screen takes the wide bake (sprite ≥ the hole), and coming back restores the normal one', () => {
    const fog = new Fog(new Container());
    fog.rebake(VW, VH, ZOOM);
    fog.update(-400, VH / 2);
    expect(fog.wideBake).toBe(true);
    expect(fog.bakeScale).toBeLessThan(preDiffScale(VW, VH));
    fog.update(VW / 2, VH / 2);
    expect(fog.wideBake).toBe(false);
    expect(fog.bakeScale).toBe(preDiffScale(VW, VH));
  });
});

describe('fogWideBake — hysteresis at the screen edge', () => {
  it('goes wide only once the hull is off screen, back only once it is inside by the band', () => {
    expect(fogWideBake(false, 0, VH / 2, VW, VH)).toBe(false); // on the edge: still on screen
    expect(fogWideBake(false, -1, VH / 2, VW, VH)).toBe(true);
    expect(fogWideBake(true, 1, VH / 2, VW, VH)).toBe(true); // just back inside: stays wide
    expect(fogWideBake(true, FOG_WIDE_BAND_PX - 1, VH / 2, VW, VH)).toBe(true);
    expect(fogWideBake(true, FOG_WIDE_BAND_PX, VH / 2, VW, VH)).toBe(false);
    expect(fogWideBake(false, NaN, 0, VW, VH)).toBe(true);
  });

  it('a hull jittering across the edge re-bakes once, not every frame', () => {
    const fog = new Fog(new Container());
    fog.rebake(VW, VH, ZOOM);
    const spy = vi.spyOn(fog, 'rebake');
    for (let i = 0; i < 20; i++) fog.update(i % 2 === 0 ? -3 : 3, VH / 2);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
