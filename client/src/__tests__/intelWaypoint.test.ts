// THE INTEL WAYPOINT (Eric 2026-10-19, epic-9 amendment 208): "insert a
// 'waypoint' in between them that keeps the camera centered until I have zoomed
// out to my entire intel area, which should have a bit of clearance around it
// so that the hotbar isn't covering it up."
//
// The alive zoom stops where the radar disc (radius R × the fit margin m) PLUS
// the maximum follow lead (ruling 9), around the own ship, has its bottom edge
// on the HUD bar's top edge at any speed and heading; the ship → ring-center
// slide starts there; the ring waypoint is floored at it; the own-hull clamp
// treats the bar's top edge as the view's bottom; event-driven center jumps
// ease (ruling 10). Every expected span below is derived from that formula on
// synthetic viewports and insets, never pinned as a number.

import { describe, it, expect } from 'vitest';
import { CONFIG, mapRadius } from '@salvo/shared';
import { Camera, intelFitSpanU, ringFitSpanU, stepZoom, type CameraOptions } from '../render/camera.js';
import { wheelZoom } from '../render/spectate.js';
import { CLIENT_CONFIG } from '../config.js';

const Z = CLIENT_CONFIG.zoom;
const M = CLIENT_CONFIG.reveal.mapFitMargin;
const R = CONFIG.vision.radar;
const MAP_R = mapRadius(CONFIG.map.playerCap);
const MAP_SPAN = ringFitSpanU(MAP_R, M);
const VW = 1600;
const VH = 900;
const INSET = 150; // synthetic real-px bar inset
const LEAD = CLIENT_CONFIG.camera.leadMax;
const STILL = { heading: 0, speed: 0 };
/** A speed that saturates the follow lead at leadMax. */
const FULL = (2 * LEAD) / CLIENT_CONFIG.camera.leadSeconds;

const BASE: CameraOptions = {
  defaultSpanU: Z.defaultSpanU,
  closeSpanU: Z.closeSpanU,
  ringFitMargin: M,
  followRate: CLIENT_CONFIG.camera.followRate,
  leadSeconds: CLIENT_CONFIG.camera.leadSeconds,
  leadMax: CLIENT_CONFIG.camera.leadMax,
  keepInViewPadU: CLIENT_CONFIG.camera.keepInViewPadU,
};
const OPTS: CameraOptions = { ...BASE, intelRadiusU: R };
const EASED: CameraOptions = { ...OPTS, slideEaseRate: CLIENT_CONFIG.camera.slideEaseRate };

/** The formula, restated here so every expectation is derived, not pinned. */
function expectedIntelSpan(w: number, h: number, inset: number): number {
  return (Math.min(w, h) * (R * M + LEAD)) / Math.min(h / 2 - inset, w / 2);
}

/** An intel camera: viewport, inset, the map, and a ring of radius `r`. */
function cam(
  r: number,
  opts: { w?: number; h?: number; inset?: number; cx?: number; cy?: number } = {},
  camOpts: CameraOptions = OPTS,
): Camera {
  const c = new Camera({ ...camOpts });
  c.setViewport(opts.w ?? VW, opts.h ?? VH);
  c.setBottomInset(opts.inset ?? INSET);
  c.setMapRadius(MAP_R);
  if (Number.isFinite(r)) c.setRing(opts.cx ?? 0, opts.cy ?? 0, r);
  return c;
}

/** Park the camera at `span`, snapped onto a stationary ship, one update. */
function settle(c: Camera, span: number, ship: { x: number; y: number }): void {
  c.setUserZoom(Z.defaultSpanU / span);
  c.snapTo(ship);
  c.update(0.05, { ...ship, ...STILL });
}

const RING_R = MAP_R * 0.6; // a ring fit wider than the intel span (premise below)
const SMALL_R = MAP_R / 20; // a ring fit inside it

describe('intelFitSpanU: the radar disc above the bar (amendment 208)', () => {
  it('premises: intel sits between the default framing and a mid-match ring, and a late ring fits inside it', () => {
    const intel = expectedIntelSpan(VW, VH, INSET);
    expect(intel).toBeGreaterThan(Z.defaultSpanU);
    expect(ringFitSpanU(RING_R, M)).toBeGreaterThan(intel);
    expect(ringFitSpanU(SMALL_R, M)).toBeLessThan(intel);
  });

  it('landscape: the height above the bar governs; portrait: the half width does', () => {
    expect(intelFitSpanU(VW, VH, INSET, R, M, LEAD)).toBeCloseTo(expectedIntelSpan(VW, VH, INSET), 9);
    // Portrait 900×1600: W/2 < H/2 − inset, so the disc + lead spans the width exactly.
    expect(intelFitSpanU(900, 1600, INSET, R, M, LEAD)).toBeCloseTo(2 * (R * M + LEAD), 9);
  });

  it('the lead widens the fit by exactly its share of the effective radius (ruling 9)', () => {
    const still = intelFitSpanU(VW, VH, INSET, R, M);
    expect(intelFitSpanU(VW, VH, INSET, R, M, LEAD)).toBeCloseTo((still * (R * M + LEAD)) / (R * M), 9);
    expect(intelFitSpanU(VW, VH, INSET, R, M, -1)).toBeNaN();
    expect(intelFitSpanU(VW, VH, INSET, R, M, NaN)).toBeNaN();
  });

  it('a taller bar (bigger inset) needs a wider zoom-out', () => {
    expect(intelFitSpanU(VW, VH, INSET * 2, R, M)).toBeGreaterThan(intelFitSpanU(VW, VH, INSET, R, M));
  });

  it('degenerate inputs give NaN (no room above the bar, a missing radius, a bad viewport)', () => {
    for (const bad of [
      intelFitSpanU(VW, VH, VH / 2, R, M),
      intelFitSpanU(VW, VH, VH, R, M),
      intelFitSpanU(VW, VH, NaN, R, M),
      intelFitSpanU(VW, VH, INSET, NaN, M),
      intelFitSpanU(VW, VH, INSET, 0, M),
      intelFitSpanU(VW, VH, INSET, -R, M),
      intelFitSpanU(VW, VH, INSET, R, 0),
      intelFitSpanU(0, VH, INSET, R, M),
      intelFitSpanU(VW, Infinity, INSET, R, M),
    ]) {
      expect(bad).toBeNaN();
    }
  });
});

describe('the Camera intel waypoint', () => {
  it('omitted option = today: the intel span is the default framing, the alive ring detent is zoomDetent', () => {
    const c = new Camera({ ...BASE });
    c.setViewport(VW, VH);
    c.setBottomInset(INSET);
    c.setMapRadius(MAP_R);
    c.setRing(0, 0, RING_R);
    expect(c.intelSpanU).toBe(Z.defaultSpanU);
    // today's single ring detent: no stop appears at the spawn framing
    expect(c.aliveZoomDetents).toEqual([c.zoomDetent]);
  });

  it('the fallback (no usable fit) adds no stop at the spawn framing', () => {
    const c = cam(RING_R, { inset: VH / 2 });
    expect(c.aliveZoomDetents).toEqual([c.zoomDetent]);
    expect(stepZoom(1.2, -100_000 * Z.wheelRate, c.aliveZoomDetents)).toBe(c.zoomDetent);
  });

  it('degenerate fit (inset at or past half the height) falls back to the default framing; nothing goes NaN', () => {
    const c = cam(RING_R, { inset: VH / 2 });
    expect(c.intelSpanU).toBe(Z.defaultSpanU);
    for (const f of c.aliveZoomDetents) expect(Number.isFinite(f)).toBe(true);
    settle(c, Z.defaultSpanU, { x: 10, y: 20 });
    expect(Number.isFinite(c.zoom) && Number.isFinite(c.center.x)).toBe(true);
  });

  it('setBottomInset ignores non-finite and negative values', () => {
    const c = cam(RING_R);
    for (const bad of [NaN, -1, Infinity]) {
      c.setBottomInset(bad);
      expect(c.bottomInsetPx).toBe(INSET);
    }
  });

  it('AT intel, still: slideT 0, the ship at the exact screen center, the disc clears the bar by (R·(m−1) + lead)·zoom', () => {
    const c = cam(RING_R, { cx: MAP_R * 0.3, cy: -MAP_R * 0.2 });
    const ship = { x: 400, y: -250 };
    settle(c, c.intelSpanU, ship);
    expect(c.userSpanU).toBeCloseTo(expectedIntelSpan(VW, VH, INSET), 6);
    expect(c.slideT).toBe(0);
    expect(c.center.x).toBeCloseTo(ship.x, 9);
    expect(c.center.y).toBeCloseTo(ship.y, 9);
    const barTop = VH - INSET;
    const bottom = c.worldToScreen({ x: ship.x, y: ship.y + R }).y;
    expect(bottom).toBeCloseTo(barTop - (R * (M - 1) + LEAD) * c.zoom, 6);
    expect(bottom).toBeLessThan(barTop);
    expect(c.worldToScreen({ x: ship.x - R, y: ship.y }).x).toBeGreaterThanOrEqual(0);
    expect(c.worldToScreen({ x: ship.x + R, y: ship.y }).x).toBeLessThanOrEqual(VW);
  });

  it('INSIDE intel: no slide, the center is the follow point', () => {
    const c = cam(RING_R, { cx: 900, cy: 900 });
    const ship = { x: -300, y: 120 };
    for (const k of [0, 0.5, 0.99]) {
      settle(c, Z.defaultSpanU + k * (c.intelSpanU - Z.defaultSpanU), ship);
      expect(c.slideT).toBe(0);
      expect(c.center.x).toBeCloseTo(ship.x, 9);
      expect(c.center.y).toBeCloseTo(ship.y, 9);
    }
  });

  it('BETWEEN intel and ring: slideT = (span − intel)/(ring − intel), linear; 1 at the ring', () => {
    const c = cam(RING_R);
    const intel = c.intelSpanU;
    const ring = ringFitSpanU(RING_R, M);
    for (const k of [0.25, 0.5, 0.75, 1]) {
      const span = intel + k * (ring - intel);
      c.setUserZoom(Z.defaultSpanU / span);
      expect(c.slideT).toBeCloseTo((span - intel) / (ring - intel), 9);
    }
  });

  it('the alive ring detent is never tighter than intel; the spectate detent is unchanged', () => {
    for (const r of [MAP_R, RING_R, MAP_R / 4, SMALL_R, 0]) {
      const c = cam(r);
      const ringFit = ringFitSpanU(r, M);
      expect(c.aliveDetentSpanU, `r ${r}`).toBeCloseTo(Math.max(c.intelSpanU, ringFit), 6);
      expect(c.detentSpanU, `r ${r}`).toBeCloseTo(Math.max(Z.defaultSpanU, ringFit), 6);
    }
  });

  it('no ring yet: the intel detent still applies and the ring detent IS intel', () => {
    const c = cam(NaN);
    const [intel, ring] = c.aliveZoomDetents;
    expect(intel).toBeCloseTo(Z.defaultSpanU / expectedIntelSpan(VW, VH, INSET), 12);
    expect(ring).toBe(intel);
    expect(stepZoom(1, -100_000 * Z.wheelRate, c.aliveZoomDetents)).toBe(intel);
  });
});

describe('stepping across the two alive waypoints', () => {
  /** Key steps from `start` in `dir` until `stop` holds; every landed value. */
  function walk(c: Camera, dir: 1 | -1, stop: () => boolean): number[] {
    const seen: number[] = [];
    for (let i = 0; i < 400 && !stop(); i++) {
      c.setUserZoom(stepZoom(c.userZoom, dir * Z.keyStep, c.aliveZoomDetents));
      seen.push(c.userZoom);
    }
    return seen;
  }

  it('keys OUT from the default stop exactly on intel, then exactly on the ring, then run free to the map', () => {
    const c = cam(RING_R);
    const [intel, ring] = c.aliveZoomDetents;
    const seen = walk(c, -1, () => c.userSpanU >= MAP_SPAN - 1e-6);
    const iIntel = seen.indexOf(intel);
    const iRing = seen.indexOf(ring);
    expect(iIntel).toBeGreaterThanOrEqual(0);
    expect(iRing).toBeGreaterThan(iIntel);
    expect(seen[iIntel + 1]).toBeCloseTo(intel * Math.exp(-Z.keyStep), 12); // the next step moves on
    expect(seen[iRing + 1]).toBeCloseTo(ring * Math.exp(-Z.keyStep), 12);
    expect(c.userSpanU).toBeCloseTo(MAP_SPAN, 6);
  });

  it('keys IN from the map fit mirror it: ring, then intel, then on toward the close framing', () => {
    const c = cam(RING_R);
    c.setUserZoom(0);
    const [intel, ring] = c.aliveZoomDetents;
    const seen = walk(c, 1, () => c.userZoom >= 1);
    const iRing = seen.indexOf(ring);
    const iIntel = seen.indexOf(intel);
    expect(iRing).toBeGreaterThanOrEqual(0);
    expect(iIntel).toBeGreaterThan(iRing);
    expect(seen[iIntel + 1]).toBeCloseTo(intel * Math.exp(Z.keyStep), 12);
  });

  it('one huge wheel spin is one step: default → intel → ring → map fit, and back in the same order', () => {
    const c = cam(RING_R);
    const [intel, ring] = c.aliveZoomDetents;
    const spin = (dy: number): void => c.setUserZoom(stepZoom(c.userZoom, -dy * Z.wheelRate, c.aliveZoomDetents));
    spin(100_000);
    expect(c.userZoom).toBe(intel);
    spin(100_000);
    expect(c.userZoom).toBe(ring);
    spin(100_000);
    expect(c.userSpanU).toBeCloseTo(MAP_SPAN, 6);
    spin(-100_000);
    expect(c.userZoom).toBe(ring);
    spin(-100_000);
    expect(c.userZoom).toBe(intel);
  });

  it('stepZoom with a list lands on the FIRST detent crossed from either side; a list of one is the old detent', () => {
    const ds = [0.6, 0.3];
    expect(stepZoom(1, -10, ds)).toBe(0.6);
    expect(stepZoom(0.6, -10, ds)).toBe(0.3);
    expect(stepZoom(0.1, 10, ds)).toBe(0.3);
    expect(stepZoom(0.3, 10, ds)).toBe(0.6);
    expect(stepZoom(1, -10, [0.3, 0.6])).toBe(0.6); // order-free
    expect(stepZoom(1, -10, [NaN, 0, 0.3])).toBe(0.3); // unusable entries ignored
    expect(stepZoom(0.52, -Z.keyStep, [0.5])).toBe(stepZoom(0.52, -Z.keyStep, 0.5));
  });
});

describe('merged waypoints: a late ring fit at or inside intel (amendment 208)', () => {
  it('one stop; slideT ≡ 0; the map slide runs ship → map center from intel to the map fit', () => {
    const ringC = { x: MAP_R * 0.2, y: MAP_R * 0.1 };
    const c = cam(SMALL_R, { cx: ringC.x, cy: ringC.y });
    const [intel, ring] = c.aliveZoomDetents;
    expect(ring).toBe(intel);
    c.setUserZoom(stepZoom(1, -100_000 * Z.wheelRate, c.aliveZoomDetents));
    expect(c.userZoom).toBe(intel);
    c.setUserZoom(stepZoom(c.userZoom, -Z.keyStep, c.aliveZoomDetents));
    expect(c.userZoom).toBeCloseTo(intel * Math.exp(-Z.keyStep), 12); // the next step leaves it
    const ship = { x: 200, y: 100 };
    const mid = (c.intelSpanU + MAP_SPAN) / 2;
    settle(c, mid, ship);
    expect(c.slideT).toBe(0);
    expect(c.mapSlideT).toBeCloseTo(0.5, 9);
    expect(c.center.x).toBeCloseTo(ship.x / 2, 6);
    expect(c.center.y).toBeCloseTo(ship.y / 2, 6);
  });

  it('a captain parked on the ring detent rides it as the ring closes, and lands on intel once it fits inside', () => {
    const c = cam(RING_R);
    c.setUserZoom(c.aliveZoomDetents[1]);
    const midR = (ringFitSpanU(RING_R, M) + c.intelSpanU) / 2 / (2 * M); // a closer ring, still wider than intel
    c.setRing(0, 0, midR);
    expect(c.userSpanU).toBeCloseTo(ringFitSpanU(midR, M), 6);
    c.setRing(0, 0, SMALL_R);
    expect(c.userZoom).toBe(c.aliveZoomDetents[0]);
  });
});

describe('resize and UI scale re-fit the intel waypoint (amendment 208)', () => {
  it('the getter reads the live viewport and inset', () => {
    const c = cam(RING_R);
    c.setViewport(1280, 614);
    expect(c.intelSpanU).toBeCloseTo(expectedIntelSpan(1280, 614, INSET), 6);
    c.setBottomInset(INSET * 1.25);
    expect(c.intelSpanU).toBeCloseTo(expectedIntelSpan(1280, 614, INSET * 1.25), 6);
  });

  it('a zoom parked on intel rides a resize and a scale change, and the disc still clears the bar', () => {
    const c = cam(RING_R);
    c.setUserZoom(c.aliveZoomDetents[0]);
    for (const [w, h, inset] of [
      [1280, 614, INSET],
      [1280, 614, INSET * 1.25],
      [1920, 1080, INSET * 0.9],
      [900, 1600, INSET],
    ] as const) {
      c.setViewport(w, h);
      c.setBottomInset(inset);
      expect(c.userSpanU, `${w}×${h} @ ${inset}`).toBeCloseTo(expectedIntelSpan(w, h, inset), 6);
      c.snapTo({ x: 0, y: 0 });
      c.update(0.05, { x: 0, y: 0, ...STILL });
      expect(c.worldToScreen({ x: 0, y: R }).y).toBeLessThan(h - inset);
    }
  });

  it('a zoom NOT parked on intel is left alone by a resize', () => {
    const c = cam(RING_R);
    c.setUserZoom(1); // the spawn framing
    c.setViewport(1280, 614);
    c.setBottomInset(INSET * 1.25);
    expect(c.userZoom).toBe(1);
  });
});

describe('an intel fit wider than the whole-map fit (tiny map, very short viewport)', () => {
  it('the intel span is capped at the map fit, so the stop sits on the out limit and stays reachable', () => {
    const tinyR = expectedIntelSpan(VW, VH, INSET) / (2 * M) / 2; // map fit = half the intel fit
    const c = new Camera({ ...OPTS });
    c.setViewport(VW, VH);
    c.setBottomInset(INSET);
    c.setMapRadius(tinyR);
    c.setRing(0, 0, tinyR);
    expect(intelFitSpanU(VW, VH, INSET, R, M, LEAD)).toBeGreaterThan(c.mapSpanU); // premise
    expect(c.intelSpanU).toBeCloseTo(c.mapSpanU, 9);
    const [intel] = c.aliveZoomDetents;
    expect(intel).toBeCloseTo(c.userZoomLimits.min, 12);
    c.setUserZoom(stepZoom(1, -100_000 * Z.wheelRate, c.aliveZoomDetents));
    expect(c.userZoom).toBe(c.userZoomLimits.min);
  });
});

describe('spectate is unchanged by an intel-configured camera', () => {
  function pair(r: number): [Camera, Camera] {
    const plain = new Camera({ ...BASE });
    plain.setViewport(VW, VH);
    plain.setMapRadius(MAP_R);
    plain.setRing(500, -300, r);
    return [plain, cam(r, { cx: 500, cy: -300 })];
  }

  it('zoomDetent, wheel stops, the cursor anchor and the ring ride match a camera without it', () => {
    for (const r of [RING_R, MAP_R / 4, SMALL_R]) {
      const [a, b] = pair(r);
      expect(b.zoomDetent, `r ${r}`).toBe(a.zoomDetent);
      a.snapTo({ x: 900, y: 400 });
      b.snapTo({ x: 900, y: 400 });
      for (let i = 0; i < 60; i++) {
        a.zoomAbout(1300, 200, wheelZoom(a.zoomFactor, 100, a.zoomDetent));
        b.zoomAbout(1300, 200, wheelZoom(b.zoomFactor, 100, b.zoomDetent));
        expect(b.zoomFactor, `r ${r} i ${i}`).toBe(a.zoomFactor);
        expect(b.center.x).toBeCloseTo(a.center.x, 9);
        expect(b.center.y).toBeCloseTo(a.center.y, 9);
      }
    }
    const [a, b] = pair(RING_R);
    a.setZoomFactor(a.zoomDetent);
    b.setZoomFactor(b.zoomDetent);
    a.setRing(500, -300, MAP_R / 4);
    b.setRing(500, -300, MAP_R / 4);
    expect(b.zoomFactor).toBe(a.zoomFactor);
  });
});

describe('the own hull never sits under the bar (amendment 208 clamp reading)', () => {
  it('at every span from intel out to the map fit, anywhere on the map, hull y ≤ bar top − pad·zoom', () => {
    const pad = CLIENT_CONFIG.camera.keepInViewPadU;
    const ringC = { x: MAP_R * 0.3, y: -MAP_R * 0.25 };
    for (let a = 0; a < 16; a++) {
      for (const k of [0, 0.5, 0.9, 1]) {
        const ship = { x: Math.cos(a) * k * MAP_R, y: Math.sin(a) * k * MAP_R };
        const c = cam(MAP_R * 0.4, { cx: ringC.x, cy: ringC.y });
        const intel = c.intelSpanU;
        const ring = c.aliveDetentSpanU;
        for (const span of [intel, (intel + ring) / 2, ring, (ring + MAP_SPAN) / 2, MAP_SPAN]) {
          settle(c, span, ship);
          const tag = `a ${a} k ${k} span ${span.toFixed(0)}`;
          const s = c.worldToScreen(ship);
          expect(s.y, tag).toBeLessThanOrEqual(VH - INSET - pad * c.zoom + 1e-6);
          expect(s.y, tag).toBeGreaterThanOrEqual(pad * c.zoom - 1e-6);
        }
      }
    }
  });
});

describe('the follow lead is inside the fit (Eric 2026-10-19, ruling 9)', () => {
  /** Park at the intel span with the ship at `speed` on `heading`, the follow converged. */
  function underWay(c: Camera, ship: { x: number; y: number }, heading: number, speed: number): void {
    c.setUserZoom(Z.defaultSpanU / c.intelSpanU);
    c.snapTo(ship);
    for (let i = 0; i < 100; i++) c.update(1, { ...ship, heading, speed });
  }

  it('at full speed on any heading — lead straight up the screen (the ship pushed toward the bar) or down — and still, the disc clears the bar and the sides', () => {
    // worldToScreen: screen y grows with world y, so a lead toward −y points UP
    // the screen and puts the ship BELOW center, toward the bar; +y is DOWN.
    const headings = [-Math.PI / 2, Math.PI / 2, ...Array.from({ length: 16 }, (_, i) => (i * Math.PI) / 8)];
    for (const [w, h, inset] of [
      [VW, VH, INSET],
      [1280, 614, INSET],
      [1920, 1080, 154],
      [900, 1600, INSET],
    ] as const) {
      const c = cam(RING_R, { w, h, inset });
      const ship = { x: 300, y: -200 };
      for (const heading of headings) {
        for (const speed of [FULL, -FULL, 0]) {
          underWay(c, ship, heading, speed);
          const tag = `${w}×${h} heading ${heading.toFixed(2)} speed ${speed}`;
          expect(c.slideT, tag).toBe(0);
          const s = c.worldToScreen(ship);
          const e = R * M * c.zoom; // the disc × its margin, in px
          expect(s.y + e, tag).toBeLessThanOrEqual(h - inset + 1e-6);
          expect(s.y - e, tag).toBeGreaterThanOrEqual(-1e-6);
          expect(s.x - e, tag).toBeGreaterThanOrEqual(-1e-6);
          expect(s.x + e, tag).toBeLessThanOrEqual(w + 1e-6);
        }
      }
    }
  });

  it('the worst heading (lead straight up the screen) puts the disc bottom exactly at the bar top minus the margin', () => {
    const c = cam(RING_R);
    const ship = { x: 0, y: 0 };
    underWay(c, ship, -Math.PI / 2, FULL);
    const bottom = c.worldToScreen(ship).y + R * M * c.zoom;
    expect(bottom).toBeCloseTo(VH - INSET, 6);
  });
});

describe('event-driven center jumps ease (Eric 2026-10-19, ruling 10)', () => {
  const DT = 1 / 60;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
  const RC = { x: 600, y: -400 };
  const SHIP = { x: RC.x + SMALL_R * 0.5, y: RC.y + SMALL_R * 0.3 };

  /** Parked on the alive ring stop over a still ship, the follow converged. */
  function parkedOnRing(camOpts: CameraOptions): Camera {
    const c = cam(RING_R, { cx: RC.x, cy: RC.y }, camOpts);
    c.setUserZoom(c.aliveZoomDetents[1]);
    c.snapTo(SHIP);
    for (let i = 0; i < 50; i++) c.update(1, { ...SHIP, ...STILL });
    return c;
  }

  it('the merge (a parked ring stop drops onto intel) glides the center from the ring center to the ship', () => {
    const c = parkedOnRing(EASED);
    const pre = { ...c.center };
    expect(dist(pre, RC)).toBeLessThan(1e-6); // parked on the ring stop: the ring center
    c.setRing(RC.x, RC.y, SMALL_R);
    expect(c.userZoom).toBe(c.aliveZoomDetents[0]); // merged onto intel: the target is now the ship
    const jump = dist(pre, SHIP);
    c.update(DT, { ...SHIP, ...STILL });
    expect(dist(c.center, pre)).toBeLessThan(0.15 * jump);
    let last = dist(c.center, SHIP);
    for (let i = 1; i < 1.5 / DT; i++) {
      c.update(DT, { ...SHIP, ...STILL });
      const d = dist(c.center, SHIP);
      expect(d).toBeLessThanOrEqual(last);
      last = d;
    }
    expect(last).toBeLessThanOrEqual(0.01 * jump);
  });

  it('without the option the merge lands at once (the pre-ruling behavior)', () => {
    const c = parkedOnRing(OPTS);
    c.setRing(RC.x, RC.y, SMALL_R);
    c.update(DT, { ...SHIP, ...STILL });
    expect(c.center.x).toBeCloseTo(SHIP.x, 9);
    expect(c.center.y).toBeCloseTo(SHIP.y, 9);
  });

  it("the player's own zoom stays direct: a zoom step puts the center straight on the slide", () => {
    const c = parkedOnRing(EASED);
    const span = (c.intelSpanU + ringFitSpanU(RING_R, M)) / 2;
    c.setUserZoom(Z.defaultSpanU / span);
    c.update(DT, { ...SHIP, ...STILL });
    const t = c.slideT;
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
    expect(c.center.x).toBeCloseTo(SHIP.x + t * (RC.x - SHIP.x), 9);
    expect(c.center.y).toBeCloseTo(SHIP.y + t * (RC.y - SHIP.y), 9);
  });

  it('a UI-scale change that moves the slide target between the stops eases too; snapTo drops the jump', () => {
    const c = parkedOnRing(EASED);
    c.setUserZoom(Z.defaultSpanU / ((c.intelSpanU + ringFitSpanU(RING_R, M)) / 2));
    for (let i = 0; i < 50; i++) c.update(1, { ...SHIP, ...STILL });
    const pre = { ...c.center };
    c.setBottomInset(INSET * 1.25); // intel widens, so slideT drops and the target moves toward the ship
    const target = { x: SHIP.x + c.slideT * (RC.x - SHIP.x), y: SHIP.y + c.slideT * (RC.y - SHIP.y) };
    const jump = dist(pre, target);
    expect(jump).toBeGreaterThan(1);
    c.update(DT, { ...SHIP, ...STILL });
    expect(dist(c.center, pre)).toBeLessThan(0.15 * jump);
    c.snapTo(SHIP);
    c.update(DT, { ...SHIP, ...STILL });
    expect(dist(c.center, target)).toBeLessThan(1e-9);
  });
});

describe('review-gate patches (2026-10-19)', () => {
  it('a viewport too short for the bar: the bar edge wins, hull y ≤ viewH − inset − pad·zoom', () => {
    const pad = CLIENT_CONFIG.camera.keepInViewPadU;
    for (const h of [280, 140]) {
      const c = cam(RING_R, { h });
      const ship = { x: 0, y: RING_R * 0.9 };
      for (const span of [(c.intelSpanU + c.aliveDetentSpanU) / 2, c.aliveDetentSpanU, MAP_SPAN]) {
        settle(c, span, ship);
        expect(c.worldToScreen(ship).y, `h ${h} span ${span.toFixed(0)}`).toBeLessThanOrEqual(
          h - INSET - pad * c.zoom + 1e-6,
        );
      }
    }
  });

  it('a transient degenerate viewport does not move a parked intel zoom (the fallback never rides)', () => {
    const c = cam(RING_R);
    const intel = c.aliveZoomDetents[0];
    c.setUserZoom(intel);
    c.setViewport(VW, 2 * INSET); // no room above the bar: the fit is unusable
    expect(c.intelSpanU).toBe(Z.defaultSpanU);
    expect(c.userZoom).toBe(intel);
    c.setViewport(VW, VH);
    expect(c.userZoom).toBe(intel);
  });

  it('a zoom parked on the ring stop rides a resize that lifts intel over it, onto the merged stop', () => {
    const c = cam(RING_R);
    c.setUserZoom(c.aliveZoomDetents[1]);
    c.setViewport(1280, 614);
    expect(c.intelSpanU).toBeGreaterThan(ringFitSpanU(RING_R, M)); // premise: intel lifted over the ring fit
    const [intel, ring] = c.aliveZoomDetents;
    expect(ring).toBe(intel);
    expect(c.userZoom).toBe(intel);
  });

  it('setBottomInset reports whether the user zoom moved, like setRing', () => {
    const c = cam(RING_R);
    c.setUserZoom(c.aliveZoomDetents[0]);
    expect(c.setBottomInset(INSET * 1.25)).toBe(true);
    expect(c.setBottomInset(INSET * 1.25)).toBe(false);
    expect(c.setBottomInset(NaN)).toBe(false);
  });
});
