// The `return`-grammar acquire path of render/radar.ts (cycle 50, amendments
// 51-59) — the Pixi adapter around returnMarks.ts, exercised through the real
// scene graph.
//
// WHAT IS CONTRACT HERE, not coverage:
//   • A PAINT IS POSED FROM A REAL OBSERVER OR NOT AT ALL. Radar paints arrive
//     on network cadence, not render cadence, so one can land before the first
//     render (join) or in any later gap where the own pose is unknown. The blob
//     is traced ONCE and then frozen for its whole ~12s decay (amendment 59), so
//     a guessed observer is not a one-frame cosmetic — it is twelve seconds of a
//     mark drawn unattenuated on a bearing the contact does not hold. Geometry
//     therefore resolves LAZILY, on the first frame with a pose, and the mark
//     stays undrawn until then.
//   • ONCE RESOLVED IT STAYS FROZEN. The deferral exists to stop a mark being
//     born wrong, not to make it track the observer: a phosphor paint is a
//     historical snapshot and must not re-pose as the ship moves.
//   • COASTLINE MARKS STILL PAINT, in their own list with their own caps
//     (amendment 58) — they need no deferral, since the island path only ever
//     runs with a known pose.

import { describe, it, expect, vi } from 'vitest';
import { Container, Texture, type Graphics } from 'pixi.js';
import type { ReturnBlipEvent } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { Radar } from '../render/radar.js';

// jsdom has no 2d canvas, so the baked sweep wedge can't rasterize here; the
// blip Graphics (what this file is about) need no texture at all.
vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return { ...actual, bakeSweepTexture: (): Texture => Texture.EMPTY };
});

const EXT = 100; // aspect-projected extent on the wire (u)

function makeRadar(): { radar: Radar; layer: Container } {
  const layer = new Container();
  const radar = new Radar(layer, new Container(), () => null, 'return');
  radar.onSweepSample(0, 0);
  return { radar, layer };
}

/** The one pooled blip Graphics (the only child the acquire path ever adds). */
function blipGfx(layer: Container): Graphics {
  return layer.children[0] as Graphics;
}

/** A paint 500u due +y of the origin: bearing π/2, so a correctly posed blob is
 *  WIDER than it is tall (`ext` is measured across the bearing) — and a blob
 *  posed from a null observer, at bearing 0, is exactly the reverse. */
const PAINT: ReturnBlipEvent = { k: 'blip', id: 'trk-1', x: 0, y: 500, ext: EXT, t: 1000 };

describe('`return` echoes are posed from a real observer or not at all', () => {
  it('does not draw a paint that arrives before the first render', () => {
    const { radar, layer } = makeRadar();
    radar.onBlip(PAINT);
    expect(radar.liveBlips).toBe(1); // it is live and decaying...
    expect(blipGfx(layer).visible).toBe(false); // ...but not yet drawable
  });

  it('poses it on the FIRST frame with an own pose — bearing and attenuation '
    + 'both from the real observer', () => {
    const { radar, layer } = makeRadar();
    radar.onBlip(PAINT); // arrives with no pose available
    radar.render({ x: 0, y: 0 }, 1000);
    const g = blipGfx(layer);
    expect(g.visible).toBe(true);
    const b = g.getLocalBounds();
    // Posed at bearing π/2: the extent axis runs across the screen, the range
    // smear along it. A bearing-0 fallback would be exactly this transposed.
    expect(b.width).toBeGreaterThan(b.height);
    // And attenuated for a 500u range rather than drawn at point-blank size.
    const atten = CLIENT_CONFIG.blip.returns.attenFloor
      + (1 - CLIENT_CONFIG.blip.returns.attenFloor) / (1 + 500 / (0.5 * 660));
    expect(b.width).toBeLessThan(EXT); // never full strength at 500u
    expect(b.width).toBeGreaterThan(EXT * atten * 0.9); // and not clamped away
  });

  it('draws immediately when a pose is already known — deferral is the '
    + 'exception, not the cadence', () => {
    const { radar, layer } = makeRadar();
    radar.render({ x: 0, y: 0 }, 900); // pose established first
    radar.onBlip(PAINT);
    expect(blipGfx(layer).visible).toBe(true);
  });

  it('freezes the geometry once resolved — a paint is a historical snapshot', () => {
    const { radar, layer } = makeRadar();
    radar.render({ x: 0, y: 0 }, 900);
    radar.onBlip(PAINT);
    const before = blipGfx(layer).getLocalBounds();
    radar.render({ x: 400, y: 400 }, 1100); // observer moves; the paint must not
    const after = blipGfx(layer).getLocalBounds();
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
  });
});

describe('coastline marks (amendment 58)', () => {
  it('paints the near arc the beam crossed, into its own list', () => {
    const { radar } = makeRadar();
    radar.setIslands([{ x: 300, y: 0, r: 80 }]);
    radar.onSweepSample(-0.2, 0);
    radar.render({ x: 0, y: 0 }, 0); // arms lastRotation
    radar.render({ x: 0, y: 0 }, 255); // beam advances ~0.4 rad across bearing 0
    expect(radar.liveMarks).toBeGreaterThan(0);
    expect(radar.liveBlips).toBe(0); // and never into the contact scope
  });
});
