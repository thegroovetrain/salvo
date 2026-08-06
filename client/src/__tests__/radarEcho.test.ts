// The `return`-grammar acquire path of render/radar.ts (cycle 52, amendments
// 76-79) — the Pixi adapter around radarHeatmap.ts, exercised through the real
// scene graph. The band/quantization math itself is pinned in
// radarHeatmap.test.ts; this file is about the ADAPTER's contracts.
//
// WHAT IS CONTRACT HERE, not coverage:
//   • A PAINT IS POSED FROM A REAL OBSERVER OR NOT AT ALL. Radar paints arrive
//     on network cadence, not render cadence, so one can land before the first
//     render (join) or in any later gap where the own pose is unknown. Geometry
//     is frozen at resolve and the paint then decays for ~12s, so a guessed
//     observer is not a one-frame cosmetic — it is twelve seconds of a mark
//     attenuated for the wrong range on a bearing the contact does not hold.
//   • ONCE RESOLVED IT STAYS FROZEN. The deferral exists to stop a paint being
//     born wrong, not to make it track the observer: a phosphor paint is a
//     historical snapshot and must not re-pose as the ship moves.
//   • THE PAINT LIST IS THE HISTORY, THE BUFFER IS DERIVED (ruling R1). Nothing
//     decays in place; the buffer is re-rasterized in full every frame from the
//     surviving paints, which is what stops old paints smearing or dragging with
//     the camera.
//   • ISLANDS PAINT AS THE BEAM REACHES THEM (amendments 69 + 78) — one paint
//     per island per revolution, filling in behind the beam.
//   • `silhouette` MODE IS UNTOUCHED (amendment 79). It keeps hull outlines,
//     personal hues, ARPA vectors and the hue-preserving `blipCool` decay, and
//     it allocates no heatmap at all. The last describe block is that guard.

import { describe, it, expect, vi } from 'vitest';
import { Container, Texture, type Graphics } from 'pixi.js';
import {
  CONFIG,
  islandFromPolygon,
  type ReturnBlipEvent,
  type SilhouetteBlipEvent,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { Radar } from '../render/radar.js';
import { fogHoleRadiusU } from '../render/fog.js';
import { blipCool, blipLifeMs } from '../render/phosphor.js';

// jsdom has no 2d canvas, so the baked sweep wedge can't rasterize here; the
// heatmap buffer (what this file is about) needs no canvas at all.
vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return { ...actual, bakeSweepTexture: (): Texture => Texture.EMPTY };
});

const EXT = 100; // aspect-projected extent on the wire (u)
const OWN = { x: 0, y: 0 };
const LIFE = blipLifeMs(60_000 / CONFIG.vision.sweepRpm);

function makeRadar(): { radar: Radar; layer: Container } {
  const layer = new Container();
  const radar = new Radar(layer, new Container(), () => null, 'return');
  radar.onSweepSample(0, 0);
  return { radar, layer };
}

/** A rectangular ridge island — its bounding circle holds a lot of open water,
 *  which is the whole reason the polygon has to be the authority. */
function ridge(cx: number, cy: number, hw: number, hh: number) {
  return islandFromPolygon([
    { x: cx - hw, y: cy - hh },
    { x: cx + hw, y: cy - hh },
    { x: cx + hw, y: cy + hh },
    { x: cx - hw, y: cy + hh },
  ]);
}

/** A paint 500u due +y of the origin: bearing π/2, so a correctly posed kernel
 *  is WIDER than it is tall (`ext` is measured across the bearing) — and one
 *  posed from a null observer, at bearing 0, is exactly the reverse. */
const PAINT: ReturnBlipEvent = { k: 'blip', id: 'trk-1', x: 0, y: 500, ext: EXT, t: 1000 };

/** Extent of the lit region along one world axis through the paint centre. */
function litSpan(radar: Radar, axis: 'x' | 'y', cross: number, at: number): number {
  const step = CLIENT_CONFIG.blip.heatmap.cellU;
  let span = 0;
  for (let d = -400; d <= 400; d += step) {
    const x = axis === 'x' ? cross + d : at;
    const y = axis === 'x' ? at : cross + d;
    if (radar.bandAt(x, y) >= 0) span += step;
  }
  return span;
}

describe('`return` paints are posed from a real observer or not at all', () => {
  it('holds a paint that arrives before the first render, painting nothing', () => {
    const { radar } = makeRadar();
    radar.onBlip(PAINT);
    expect(radar.livePaints).toBe(0); // parked, not posed
    expect(radar.bandAt(PAINT.x, PAINT.y)).toBe(-1);
  });

  it('poses it on the FIRST frame with an own pose — bearing and attenuation '
    + 'both from the real observer', () => {
    const { radar } = makeRadar();
    radar.onBlip(PAINT); // arrives with no pose available
    radar.render(OWN, 1000);
    expect(radar.livePaints).toBe(1);
    expect(radar.bandAt(PAINT.x, PAINT.y)).toBeGreaterThanOrEqual(0);
    // Posed at bearing π/2: the extent axis runs across the observer's line of
    // sight, the range smear along it. A bearing-0 fallback is this transposed.
    const across = litSpan(radar, 'x', 0, 500);
    const along = litSpan(radar, 'y', 500, 0);
    expect(across).toBeGreaterThan(along);
    // And attenuated for a 500u range rather than drawn at point-blank size.
    const o = CLIENT_CONFIG.blip.heatmap.ship;
    const atten = o.attenFloor + (1 - o.attenFloor) / (1 + 500 / (o.attenHalfRange * 660));
    expect(across).toBeLessThan(EXT);
    expect(across).toBeGreaterThan(EXT * atten * 0.6);
  });

  it('poses immediately when a pose is already known — deferral is the '
    + 'exception, not the cadence', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900); // pose established first
    radar.onBlip(PAINT);
    expect(radar.livePaints).toBe(1);
  });

  it('freezes the geometry once resolved — a paint is a historical snapshot', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900);
    radar.onBlip(PAINT);
    radar.render(OWN, 950);
    const before = litSpan(radar, 'x', 0, 500);
    radar.render({ x: 400, y: 400 }, 1100); // observer moves; the paint must not
    expect(litSpan(radar, 'x', 0, 500)).toBe(before);
  });
});

describe('the paint list is the history and the buffer is derived (ruling R1)', () => {
  it('keeps at most `paintsPerContact` live paints of one track', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 0);
    for (let i = 0; i < 8; i++) radar.onBlip({ ...PAINT, t: i * 100, y: 300 + i * 10 });
    expect(radar.livePaints).toBe(CLIENT_CONFIG.blip.paintsPerContact);
  });

  it('re-rasterizes from scratch: a paint that ages out leaves NOTHING behind', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900);
    radar.onBlip(PAINT);
    radar.render(OWN, 1000);
    expect(radar.bandAt(PAINT.x, PAINT.y)).toBeGreaterThanOrEqual(0);
    radar.render(OWN, PAINT.t + LIFE + 1);
    expect(radar.livePaints).toBe(0);
    expect(radar.bandAt(PAINT.x, PAINT.y)).toBe(-1);
  });

  it('clearBlips drops every paint (entering spectate)', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900);
    radar.onBlip(PAINT);
    radar.clearBlips();
    radar.render(OWN, 1000);
    expect(radar.livePaints).toBe(0);
    expect(radar.bandAt(PAINT.x, PAINT.y)).toBe(-1);
  });
});

describe('island landmasses (amendments 69 + 78)', () => {
  // BEYOND TRUESIGHT ON PURPOSE (cycle 54, amendments 80-82). This fixture used
  // to sit at x = 300 — INSIDE the 330u sight bubble — which is precisely the
  // bug that cycle closed: coastline painted straight through the bubble while
  // a hull at the same range was never sent as a blip at all. These tests are
  // about the landmass grammar, so the island moves out to where the scope is
  // the sensor; the gate itself is pinned in radarHeatmap.test.ts section 6 and
  // by the dazzle block below.
  const ISLE = ridge(600, 0, 120, 90);

  it('paints the landmass the beam swept, and paints it SOLID', () => {
    const { radar } = makeRadar();
    radar.setIslands([ISLE]);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0); // arms lastRotation
    radar.render(OWN, 900); // beam advances ~1.4 rad across bearing 0
    expect(radar.liveIslandPaints).toBe(1);
    // A point deep inside the near face reads as land, not as a rim sample.
    expect(radar.bandAt(520, 0)).toBeGreaterThanOrEqual(0);
    expect(radar.bandAt(540, 0)).toBeGreaterThanOrEqual(0);
  });

  it('opens ONE paint per island per revolution, not one per frame', () => {
    const { radar } = makeRadar();
    radar.setIslands([ISLE]);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0);
    for (let t = 100; t <= 900; t += 100) radar.render(OWN, t);
    expect(radar.liveIslandPaints).toBe(1);
  });

  it('paints nothing inside the bounding circle that is not inside the POLYGON', () => {
    const { radar } = makeRadar();
    radar.setIslands([ISLE]);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0);
    radar.render(OWN, 900);
    // 600 ± 140 in y is inside the bounding circle (r = 150) and outside the
    // 120 × 90 rectangle — and comfortably beyond the sight bubble, so the
    // sight gate is not what is answering here. The retired code painted coast
    // samples exactly there.
    expect(Math.hypot(600, 140)).toBeGreaterThan(CONFIG.vision.sight);
    expect(radar.bandAt(600, 140)).toBe(-1);
    expect(radar.bandAt(600, -140)).toBe(-1);
  });

  it('a landmass never evicts a contact paint from the scope', () => {
    const { radar } = makeRadar();
    radar.setIslands([ISLE]);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0);
    radar.onBlip({ ...PAINT, t: 0 });
    radar.render(OWN, 900);
    expect(radar.liveIslandPaints).toBe(1);
    expect(radar.livePaints - radar.liveIslandPaints).toBe(1);
  });
});

// --- `silhouette` mode is UNTOUCHED (amendment 79) -------------------------------

describe('`silhouette` mode is byte-identical to the shipped Story 4.2 grammar', () => {
  const HUE = CLIENT_CONFIG.colors.players.cyan;
  const POSE: SilhouetteBlipEvent = {
    k: 'blip', id: 'trk-s', x: 0, y: 500, t: 1000, cls: 'battleship', heading: 0, speed: 20,
  };

  /** The color a Graphics was actually stroked with (Pixi keeps the draw
   *  instructions on the context; `tint` is a separate multiplier). */
  function strokeColor(g: Graphics): number {
    const { instructions } = g.context as unknown as {
      instructions: { action: string; data: { style?: { color?: number } } }[];
    };
    return instructions.find((i) => i.action === 'stroke')?.data.style?.color ?? -1;
  }

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

  function makeSilhouette(): { radar: Radar; layer: Container } {
    const layer = new Container();
    const radar = new Radar(layer, new Container(), () => HUE, 'silhouette');
    radar.onSweepSample(0, 0);
    return { radar, layer };
  }

  it('still draws a hull outline in the owner\'s personal hue', () => {
    const { radar, layer } = makeSilhouette();
    radar.render(OWN, 900);
    radar.onBlip(POSE);
    const g = layer.children[0] as Graphics;
    expect(radar.liveBlips).toBe(1);
    expect(hue(strokeColor(g))).toBeCloseTo(hue(HUE), 0);
    // True-scale silhouette + ARPA vector, drawn once at acquire.
    expect(g.getLocalBounds().width).toBeGreaterThan(0);
  });

  it('still cools on the same hue-preserving grey ramp, at the same floor', () => {
    const { radar, layer } = makeSilhouette();
    radar.render(OWN, 900);
    radar.onBlip(POSE);
    const g = layer.children[0] as Graphics;
    const stroked = strokeColor(g);
    for (const now of [1000, 2000, 4000, 8000, 12_000]) {
      radar.render(OWN, now);
      expect(g.tint, `age ${now - POSE.t}`).toBe(
        blipCool(now - POSE.t, LIFE, CLIENT_CONFIG.blip.coolFloor),
      );
      expect(strokeColor(g)).toBe(stroked); // the owner's hue, untouched
    }
  });

  it('allocates NO heatmap and paints no bitmap cell, ever', () => {
    const { radar } = makeSilhouette();
    radar.setIslands([ridge(300, 0, 120, 90)]);
    radar.render(OWN, 0);
    radar.render(OWN, 900);
    radar.onBlip(POSE);
    radar.render(OWN, 1000);
    expect(radar.livePaints).toBe(0);
    expect(radar.liveIslandPaints).toBe(0);
    expect(radar.bandAt(0, 500)).toBe(-1);
    expect(radar.bandAt(300, 0)).toBe(-1);
  });

  it('THE SIGHT GATE NEVER REACHES IT: a paint deep inside truesight still '
    + 'draws its full outline, dazzled or not (amendment 82)', () => {
    // `silhouette` has no coverage grid and never had the bug, so the gate must
    // be structurally invisible to it. A hull 120u out — well inside the bubble,
    // and inside even the DAZZLED bubble — still draws exactly as it always did.
    const close: SilhouetteBlipEvent = { ...POSE, y: 120 };
    const { radar, layer } = makeSilhouette();
    radar.render(OWN, 900);
    radar.onBlip(close);
    const g = layer.children[0] as Graphics;
    const stroked = strokeColor(g);
    const bounds = g.getLocalBounds().width;
    expect(radar.liveBlips).toBe(1);
    expect(bounds).toBeGreaterThan(0);

    radar.setDazzled(true);
    radar.render(OWN, 1000);
    expect(radar.liveBlips).toBe(1);
    expect(g.visible).toBe(true);
    expect(strokeColor(g)).toBe(stroked);
    expect(g.getLocalBounds().width).toBe(bounds);
    // ...and still no buffer exists to gate.
    expect(radar.bandAt(close.x, close.y)).toBe(-1);
  });
});

// --- the sight gate, through the adapter (cycle 54, amendments 80-82) ------------

describe('the sight gate is the DRAWN fog hole, dazzle included (amendment 81)', () => {
  const SIGHT = CONFIG.vision.sight;
  const DAZZLE = CONFIG.starShells.dazzleSightFactor;
  /** Between the dazzled hole and the un-dazzled one: the annulus that is fogged
   *  and unpainted unless the radar hears about the dazzle. */
  const MID = SIGHT * ((1 + DAZZLE) / 2);

  it('the suppression radius IS fogHoleRadiusU, at base stats and dazzled', () => {
    const { radar } = makeRadar();
    // Called, not re-derived: if either side ever changes, this equality is the
    // thing that breaks, rather than a seam appearing on the water.
    expect(radar.sightHoleU).toBe(fogHoleRadiusU(SIGHT, false));
    expect(radar.setDazzled(true)).toBe(true); // mirrors Fog's changed-flag
    expect(radar.isDazzled).toBe(true);
    expect(radar.sightHoleU).toBe(fogHoleRadiusU(SIGHT, true));
    // And that IS a shrink, by exactly the ratified factor.
    expect(radar.sightHoleU).toBe(SIGHT * DAZZLE);
    expect(radar.setDazzled(true)).toBe(false); // no-op flip reports no change
  });

  it('an echo in the dazzle annulus is suppressed normally and PAINTS while '
    + 'dazzled — no dead ring that is fogged AND unpainted', () => {
    const echo: ReturnBlipEvent = { ...PAINT, y: MID };
    expect(MID).toBeGreaterThan(SIGHT * DAZZLE);
    expect(MID).toBeLessThan(SIGHT);

    const { radar } = makeRadar();
    radar.render(OWN, 900);
    radar.onBlip(echo);
    radar.render(OWN, 1000);
    expect(radar.bandAt(echo.x, echo.y), 'inside truesight: dark').toBe(-1);

    radar.setDazzled(true);
    radar.render(OWN, 1000);
    expect(radar.bandAt(echo.x, echo.y), 'dazzled: the scope takes over').toBeGreaterThanOrEqual(0);

    // ...and the disc comes straight back when the dazzle lifts. The paint list
    // is untouched throughout — the gate suppresses the RASTER, never the paint.
    radar.setDazzled(false);
    radar.render(OWN, 1000);
    expect(radar.bandAt(echo.x, echo.y)).toBe(-1);
    expect(radar.livePaints).toBe(1);
  });

  it('the disc follows the LIVE observer, not the position a paint was baked '
    + 'from — which is why it is a stamp-time rule', () => {
    // An island baked while it was beyond truesight must go dark once the ship
    // sails into it, even though its coverage list is frozen for the whole
    // revolution. A bake-time gate would keep painting it.
    const isle = ridge(600, 0, 120, 90);
    const { radar } = makeRadar();
    radar.setIslands([isle]);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0);
    radar.render(OWN, 900);
    expect(radar.liveIslandPaints).toBe(1);
    expect(radar.bandAt(520, 0), 'baked from 520u out: painted').toBeGreaterThanOrEqual(0);

    // Steam to within truesight of that same coastline; the paint is unchanged.
    radar.render({ x: 400, y: 0 }, 1000);
    expect(radar.liveIslandPaints).toBe(1);
    expect(radar.bandAt(520, 0), 'now 120u away: the eye has it').toBe(-1);

    // ...and back out again, from the same frozen coverage.
    radar.render(OWN, 1100);
    expect(radar.bandAt(520, 0)).toBeGreaterThanOrEqual(0);
  });
});
