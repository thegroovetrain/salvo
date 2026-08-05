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
//   • THE ECHO'S HUE IS AN INFORMATION CHANNEL AND DECAY MUST NOT TOUCH IT
//     (amendment 63). The color is baked into the mark's FILL AND STROKE at
//     acquire off the Garmin strength ramp, and the per-frame tint is the
//     hue-PRESERVING grey multiplier `blipCool`. Wiring the tint back to
//     `blipTint` — which is what this grammar did while its echoes were
//     monochrome — SETS the color green over the first ~30% of every paint and
//     erases the scale. The decay tests below are that regression guard: they
//     assert the tint is neutral grey and that fill × tint holds its hue.

import { describe, it, expect, vi } from 'vitest';
import { Container, Texture, type Graphics } from 'pixi.js';
import { CONFIG, type ReturnBlipEvent, type SilhouetteBlipEvent } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { Radar } from '../render/radar.js';
import { blipCool, blipLifeMs } from '../render/phosphor.js';
import { echoColor, returnStrength } from '../render/returnMarks.js';

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

/** The color a Graphics was actually filled/stroked with (Pixi keeps the draw
 *  instructions on the context, which is where the baked echo color lives —
 *  `tint` is a separate multiplier and says nothing about it). */
function drawnColor(g: Graphics, action: 'fill' | 'stroke'): number {
  const { instructions } = g.context as unknown as {
    instructions: { action: string; data: { style?: { color?: number } } }[];
  };
  return instructions.find((i) => i.action === action)?.data.style?.color ?? -1;
}

/** HSV hue (deg) of a packed 0xRRGGBB color; -1 for a pure grey (no hue). */
function hue(color: number): number {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  const max = Math.max(r, g, b);
  const c = max - Math.min(r, g, b);
  if (c === 0) return -1;
  const h = max === r ? (g - b) / c : max === g ? 2 + (b - r) / c : 4 + (r - g) / c;
  return (h * 60 + 360) % 360;
}

/** Is this tint a NEUTRAL grey — the only kind that cannot shift a hue? */
function isNeutralGrey(color: number): boolean {
  return ((color >> 16) & 0xff) === ((color >> 8) & 0xff) && ((color >> 8) & 0xff) === (color & 0xff);
}

/** What the eye actually gets: the baked color scaled by the Pixi tint. */
function effective(color: number, tint: number): number {
  const ch = (shift: number): number =>
    Math.round((((color >> shift) & 0xff) * ((tint >> shift) & 0xff)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
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

  it('wears the SAME strength scale a ship echo does — terrain is just a return', () => {
    const { radar, layer } = makeRadar();
    radar.setIslands([{ x: 300, y: 0, r: 80 }]);
    radar.onSweepSample(-0.2, 0);
    radar.render({ x: 0, y: 0 }, 0);
    radar.render({ x: 0, y: 0 }, 255);
    const coast = drawnColor(blipGfx(layer), 'fill');
    // Not white, not the phosphor chrome color: a real ramp sample.
    expect(coast).not.toBe(CLIENT_CONFIG.colors.white);
    expect(hue(coast)).toBeGreaterThan(0);
    expect(hue(coast)).toBeLessThan(hue(CLIENT_CONFIG.colors.echoWeak)); // off the weak end
  });
});

// --- the Garmin echo scale on the scope (amendment 63) ----------------------

const OWN = { x: 0, y: 0 };
const RADAR_RANGE = CONFIG.vision.radar;
const O = CLIENT_CONFIG.blip.returns;
const LIFE = blipLifeMs(60_000 / CONFIG.vision.sweepRpm);

describe('a `return` echo is DRAWN in its strength color', () => {
  it('bakes the ramp color into both the fill and the edge, never white', () => {
    const { radar, layer } = makeRadar();
    radar.render(OWN, 900);
    radar.onBlip(PAINT); // 500u due +y, ext 100
    const expected = echoColor(returnStrength(EXT, 500, RADAR_RANGE, O), O.ramp);
    const g = blipGfx(layer);
    expect(drawnColor(g, 'fill')).toBe(expected);
    expect(drawnColor(g, 'stroke')).toBe(expected);
    expect(expected).not.toBe(CLIENT_CONFIG.colors.white); // the pre-63 wiring
  });

  it('a WEAKER echo paints a different (bluer) color than a strong one', () => {
    // Hue is the strength channel now, so two strengths must not share a color.
    const weak = echoColor(returnStrength(12, 600, RADAR_RANGE, O), O.ramp);
    const strong = echoColor(returnStrength(124, 60, RADAR_RANGE, O), O.ramp);
    expect(weak).not.toBe(strong);
    expect(hue(weak)).toBeGreaterThan(hue(strong));
  });
});

describe('decay preserves the echo HUE — the `blipTint` trap (amendment 63)', () => {
  it('cools through a NEUTRAL GREY tint at every age', () => {
    // THIS IS THE REGRESSION GUARD. `blipTint` returns saturated phosphor green
    // (#66FFAA → #0A3D20), which is never neutral, so rewiring the `return` path
    // back to it fails this assertion on the first aged frame.
    const { radar, layer } = makeRadar();
    radar.render(OWN, 900);
    radar.onBlip(PAINT);
    const g = blipGfx(layer);
    for (const now of [1000, 2000, 4000, 8000, 12_000]) {
      radar.render(OWN, now);
      expect(isNeutralGrey(g.tint), `age ${now - PAINT.t}`).toBe(true);
      expect(g.tint, `age ${now - PAINT.t}`).toBe(blipCool(now - PAINT.t, LIFE, CLIENT_CONFIG.blip.coolFloor));
    }
  });

  it('holds the hue EXACTLY while alpha carries the age', () => {
    const { radar, layer } = makeRadar();
    radar.render(OWN, 900);
    radar.onBlip(PAINT);
    const g = blipGfx(layer);
    const baked = drawnColor(g, 'fill');
    const bakedHue = hue(baked);
    expect(bakedHue).toBeGreaterThan(0); // the echo has a hue to lose
    let prevAlpha = Infinity;
    for (const now of [1000, 2000, 4000, 8000, 12_000]) {
      radar.render(OWN, now);
      // hue = strength (never moves), alpha = age (only ever falls). The 1°
      // tolerance is 8-bit re-quantization in `effective` (the GPU multiplies in
      // float); a color-SETTING ramp would move the hue by TENS of degrees —
      // #66FFAA is 152° away from this echo's red.
      expect(Math.abs(hue(effective(baked, g.tint)) - bakedHue), `age ${now - PAINT.t}`)
        .toBeLessThan(1);
      expect(drawnColor(g, 'fill')).toBe(baked); // and the color is never re-decided
      expect(g.alpha).toBeLessThan(prevAlpha);
      prevAlpha = g.alpha;
    }
  });
});

describe('`silhouette` mode decays exactly as before (amendment 51: untouched)', () => {
  const HUE = CLIENT_CONFIG.colors.players.cyan;
  const POSE: SilhouetteBlipEvent = {
    k: 'blip', id: 'trk-s', x: 0, y: 500, t: 1000, cls: 'battleship', heading: 0, speed: 20,
  };

  it('still cools on the same hue-preserving grey ramp, at the same floor', () => {
    const layer = new Container();
    const radar = new Radar(layer, new Container(), () => HUE, 'silhouette');
    radar.onSweepSample(0, 0);
    radar.render(OWN, 900);
    radar.onBlip(POSE);
    const g = blipGfx(layer);
    const stroked = drawnColor(g, 'stroke');
    for (const now of [1000, 2000, 4000, 8000, 12_000]) {
      radar.render(OWN, now);
      expect(g.tint, `age ${now - POSE.t}`).toBe(blipCool(now - POSE.t, LIFE, CLIENT_CONFIG.blip.coolFloor));
      expect(drawnColor(g, 'stroke')).toBe(stroked); // the owner's hue, untouched
    }
    // And it is a hue, not the anonymous white the `return` grammar used to draw.
    expect(hue(stroked)).toBeCloseTo(hue(HUE), 0);
  });
});
