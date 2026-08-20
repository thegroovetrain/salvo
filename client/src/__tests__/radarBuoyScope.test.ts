// THE BUOY'S OWN SCOPE, client half (Story 7-5 fix cycle — Eric playtest:
// *"It has no radar sweep. Its supposed to have its own radar sweep that
// paints around it, where the fuck is that?"* / *"It gets its own returns. I
// just get to see them as the owner."*).
//
// The shipped R2.8 relay merged a buoy's returns into the owner's untagged
// blip stream, so the renderer priced EVERY echo from the OWNER's hull: a
// return the buoy saw up close rendered at the rim band (or the minPeak speck
// behind terrain), and no sweep existed at the buoy at all. This file is the
// regression suite that would have caught both halves:
//
//   • a `src`-tagged echo is priced FROM THE BUOY — brighter than the
//     identical payload priced from the distant owner (FAILS on the pre-fix
//     renderer, which ignored the tag);
//   • every LIVE own buoy carries its own rotating sweep wedge, at the buoy,
//     turning at the fixed CONFIG rate (FAILS pre-fix: no such sprite existed).

import { describe, expect, it, vi } from 'vitest';
import { Container, Texture } from 'pixi.js';
import { CONFIG, rasterizeHullCoverage, type BuoyView, type ReturnBlipEvent } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { Camera } from '../render/camera.js';
import { Radar } from '../render/radar.js';
import { sweepRotation } from '../render/phosphor.js';

// jsdom has no 2d canvas (the radarViewport.test.ts precedent).
vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return {
    ...actual,
    bakeSweepTexture: (): Texture => Texture.EMPTY,
    bakeDimMaskTexture: (): Texture => Texture.EMPTY,
  };
});

const CELL = CLIENT_CONFIG.blip.heatmap.cellU;
const OWN = { x: 0, y: 0 };
const BUOY: BuoyView = { id: 'b1', x: 500, y: 0, until: 99_000, own: true, by: 'me', sweep: 1.25 };

function harness(): { radar: Radar; cam: Camera } {
  const radar = new Radar(new Container(), new Container());
  radar.onSweepSample(0, 0);
  const cam = new Camera({ radarRange: CONFIG.vision.radar, followRate: 6, leadSeconds: 0, leadMax: 0 });
  cam.setViewport(1280, 720);
  cam.snapTo(OWN);
  return { radar, cam };
}

function blip(x: number, y: number, src?: string): ReturnBlipEvent {
  const c = rasterizeHullCoverage('battleship', x, y, 0, CELL);
  const e: ReturnBlipEvent = { k: 'blip', t: 1000, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits };
  return src === undefined ? e : { ...e, src };
}

describe('a src-tagged return is priced from the BUOY, not the owner (the defect-1 regression)', () => {
  it('the identical payload paints BRIGHTER tagged than untagged: the buoy is 120u from the subject, the owner 620u', () => {
    // The hull sits at (620, 0): 620u from the owner's hull, 120u from the
    // owner's buoy at (500, 0). Pre-fix the renderer ignored `src` and priced
    // both from the owner — this assertion is exactly what failed on the water.
    const tagged = harness();
    tagged.radar.setOwnBuoys([BUOY], 900);
    tagged.radar.render(OWN, 900, null, tagged.cam.worldView);
    tagged.radar.onBlip(blip(620, 0, BUOY.id));
    tagged.radar.render(OWN, 1000, null, tagged.cam.worldView);

    const untagged = harness();
    untagged.radar.setOwnBuoys([BUOY], 900);
    untagged.radar.render(OWN, 900, null, untagged.cam.worldView);
    untagged.radar.onBlip(blip(620, 0));
    untagged.radar.render(OWN, 1000, null, untagged.cam.worldView);

    const buoyPriced = tagged.radar.intensityAt(620, 0);
    const ownPriced = untagged.radar.intensityAt(620, 0);
    expect(ownPriced).toBeGreaterThan(0); // both paint — nothing is suppressed
    expect(buoyPriced).toBeGreaterThan(ownPriced); // but the buoy's picture is the buoy's
    // And the band tells the player the same story: up close to the sensor
    // that saw it, the return reads a full band hotter.
    expect(tagged.radar.bandAt(620, 0)).toBeGreaterThan(untagged.radar.bandAt(620, 0));
  });

  it('a tagged echo arriving after its buoy despawned still prices from the RETAINED sensor entry', () => {
    const { radar, cam } = harness();
    radar.setOwnBuoys([BUOY], 900);
    radar.setOwnBuoys([], 950); // the buoy left the frame list (expired/destroyed)
    radar.render(OWN, 950, null, cam.worldView);
    radar.onBlip(blip(620, 0, BUOY.id)); // a straggler return, one frame late
    radar.render(OWN, 1000, null, cam.worldView);

    const reference = harness();
    reference.radar.render(OWN, 950, null, reference.cam.worldView);
    reference.radar.onBlip(blip(620, 0));
    reference.radar.render(OWN, 1000, null, reference.cam.worldView);

    expect(radar.intensityAt(620, 0)).toBeGreaterThan(reference.radar.intensityAt(620, 0));
  });
});

describe('every LIVE own buoy carries its OWN rotating sweep wedge (the missing-sweep regression)', () => {
  it('the wedge exists, sits at the buoy, and turns at the fixed CONFIG rate from the frame-carried angle', () => {
    const { radar, cam } = harness();
    radar.setOwnBuoys([BUOY], 900);
    radar.render(OWN, 1000, null, cam.worldView);
    const wedge = radar.buoyWedge(BUOY.id);
    expect(wedge).toBeDefined(); // pre-fix: no such sprite existed at all
    expect(wedge!.visible).toBe(true);
    expect(wedge!.position.x).toBe(BUOY.x);
    expect(wedge!.position.y).toBe(BUOY.y);
    // Extrapolated exactly as the own wedge is, on the buoy's fixed period.
    const periodMs = 60000 / CONFIG.radarBuoy.sweepRpm;
    expect(wedge!.rotation).toBeCloseTo(sweepRotation(BUOY.sweep, 900, 1000, periodMs), 9);
    // And it advances with server time — the beam visibly goes round.
    radar.render(OWN, 1500, null, cam.worldView);
    expect(wedge!.rotation).toBeCloseTo(sweepRotation(BUOY.sweep, 900, 1500, periodMs), 9);
    expect(wedge!.rotation).not.toBeCloseTo(sweepRotation(BUOY.sweep, 900, 1000, periodMs), 3);
  });

  it('the wedge comes DOWN the moment the buoy leaves the frame list, and never draws for an enemy buoy', () => {
    const { radar, cam } = harness();
    radar.setOwnBuoys([BUOY, { ...BUOY, id: 'e9', own: false, by: 'them' }], 900);
    radar.render(OWN, 1000, null, cam.worldView);
    expect(radar.buoyWedge('e9')).toBeUndefined(); // an enemy buoy is a subject, never a sensor
    expect(radar.buoyWedge(BUOY.id)!.visible).toBe(true);
    radar.setOwnBuoys([], 1050); // expired/destroyed
    radar.render(OWN, 1100, null, cam.worldView);
    expect(radar.buoyWedge(BUOY.id)?.visible ?? false).toBe(false);
  });

  it('the wedge hides with the rest of the scope when there is no own pose (start line / spectate)', () => {
    const { radar, cam } = harness();
    radar.setOwnBuoys([BUOY], 900);
    radar.render(OWN, 1000, null, cam.worldView);
    expect(radar.buoyWedge(BUOY.id)!.visible).toBe(true);
    radar.render(null, 1100, null, null); // dark scope: no beams at all
    expect(radar.buoyWedge(BUOY.id)!.visible).toBe(false);
  });
});
