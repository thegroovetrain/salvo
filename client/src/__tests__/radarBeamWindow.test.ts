// THE BEAM WINDOW AND THE CLOUD PAINT CONTAINER (Story 9.3, Eric 2026-10-12:
// "THIS SMOKE ALSO PAINTS RADAR RETURNS"). The Radar hands the countermeasure
// the arc its beam swept last frame — exactly its own sweep rotation's
// previous and current angles — and owns the container the cloud's phosphor
// copies live in: inside the dim-masked paint layer, above the heat sprite.

import { describe, it, expect, vi } from 'vitest';
import { Container, Texture, TextureSource } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import { Radar } from '../render/radar.js';
import { blipLifeMs, sweepRotation } from '../render/phosphor.js';

vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return {
    ...actual,
    bakeSweepTexture: (): Texture => Texture.EMPTY,
    bakeDimMaskTexture: (_sightU: number, into?: Texture | null): Texture =>
      into ?? new Texture({ source: new TextureSource({ width: 8, height: 8 }) }),
  };
});

const PERIOD = 60000 / CONFIG.vision.sweepRpm;
const OWN = { x: 120, y: -40 };

describe('Radar.beamWindow', () => {
  it('is null until two consecutive swept frames, then equals sweepRotation at the previous and current frame', () => {
    const radar = new Radar(new Container(), new Container());
    radar.onSweepSample(0.3, 0);
    expect(radar.beamWindow(), 'before any render').toBeNull();
    radar.render(OWN, 100, null, null);
    expect(radar.beamWindow(), 'one frame is no arc').toBeNull();
    radar.render(OWN, 150, null, null);
    const w = radar.beamWindow()!;
    expect(w.prev).toBeCloseTo(sweepRotation(0.3, 0, 100, PERIOD), 12);
    expect(w.cur).toBeCloseTo(sweepRotation(0.3, 0, 150, PERIOD), 12);
    expect([w.x, w.y]).toEqual([OWN.x, OWN.y]);
    expect(w.lifeMs).toBe(blipLifeMs(PERIOD));
    expect(w.rangeU, 'the range the beam reaches is the radar range').toBe(CONFIG.vision.radar);
    radar.setRanges(CONFIG.vision.sight, 1234, PERIOD);
    radar.render(OWN, 200, null, null);
    expect(radar.beamWindow()!.rangeU).toBe(1234);
  });

  it('is null on a frame with no observer (start line, spectating) and on the first frame after it', () => {
    const radar = new Radar(new Container(), new Container());
    radar.onSweepSample(0, 0);
    radar.render(OWN, 100, null, null);
    radar.render(OWN, 150, null, null);
    radar.render(null, 200, null, null);
    expect(radar.beamWindow()).toBeNull();
    radar.render(OWN, 250, null, null);
    expect(radar.beamWindow(), 'resuming needs a fresh previous bearing').toBeNull();
  });
});

describe('Radar.cloudPaintLayer', () => {
  it('lives inside the masked paint layer and stays above a (re)built heat sprite', () => {
    const blip = new Container();
    const radar = new Radar(blip, new Container());
    expect(radar.cloudPaintLayer.parent).toBe(blip);
    const fit = (radar as unknown as { fitHeat(w: number, h: number): void }).fitHeat.bind(radar);
    for (const half of [400, 900]) {
      fit(half, half); // a resize destroys and re-adds the heat sprite
      expect(blip.children.at(-1), `after a ${half}u fit`).toBe(radar.cloudPaintLayer);
      expect(blip.children.length).toBe(3); // dim mask, heat, cloud paints
    }
  });
});
