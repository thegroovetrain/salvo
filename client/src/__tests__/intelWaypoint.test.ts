// THE INTEL WAYPOINT (Eric 2026-10-19, epic-9 amendment 208): "insert a
// 'waypoint' in between them that keeps the camera centered until I have zoomed
// out to my entire intel area, which should have a bit of clearance around it
// so that the hotbar isn't covering it up."
//
// The alive zoom stops where the radar disc (radius R × the fit margin m),
// around the own ship, has its bottom edge on the HUD bar's top edge; the ring
// waypoint is floored at it; event-driven center jumps ease (ruling 10). Story
// 11.8 retired the follow lead (ruling 9), the own-hull clamp and the slide's
// start at intel (the slide now starts at half the ring waypoint). Every
// expected span below is derived from that formula on synthetic viewports and
// insets, never pinned as a number.

import { describe, it, expect } from 'vitest';
import { CONFIG, mapRadius } from '@salvo/shared';
import { Camera, intelFitSpanU, ringFitSpanU, stepZoom, type CameraOptions } from '../render/camera.js';
import { wheelZoom } from '../render/spectate.js';
import { CLIENT_CONFIG } from '../config.js';

const Z = CLIENT_CONFIG.zoom;
const M = CLIENT_CONFIG.reveal.mapFitMargin;
/** THE INTEL RADIUS UNDER TEST — a synthetic disc well inside the board, so the
 *  waypoint MECHANISM is exercised (amendment 208). Since Story 11.2 the game's
 *  own radar reach (400 hm) is wider than the board, which makes the stop
 *  vanish by rule — that case has its own describe at the foot of this file. */
const R = mapRadius(CONFIG.map.playerCap) * 0.3;
const MAP_R = mapRadius(CONFIG.map.playerCap);
const MAP_SPAN = ringFitSpanU(MAP_R, M);
const VW = 1600;
const VH = 900;
const INSET = 150; // synthetic real-px bar inset

const BASE: CameraOptions = {
  defaultSpanU: Z.defaultSpanU,
  closeSpanU: Z.closeSpanU,
  ringFitMargin: M,
};
const OPTS: CameraOptions = { ...BASE, intelRadiusU: R };
const EASED: CameraOptions = { ...OPTS, slideEaseRate: CLIENT_CONFIG.camera.slideEaseRate };

/** The formula, restated here so every expectation is derived, not pinned. */
function expectedIntelSpan(w: number, h: number, inset: number): number {
  return (Math.min(w, h) * (R * M)) / Math.min(h / 2 - inset, w / 2);
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
  c.update(0.05, ship);
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
    expect(intelFitSpanU(VW, VH, INSET, R, M)).toBeCloseTo(expectedIntelSpan(VW, VH, INSET), 9);
    // Portrait 900×1600: W/2 < H/2 − inset, so the disc spans the width exactly.
    expect(intelFitSpanU(900, 1600, INSET, R, M)).toBeCloseTo(2 * (R * M), 9);
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


  // Story 11.8 (Eric 2026-11-15): the slide starts at HALF the ring waypoint —
  // the alive one, floored at intel — not at the intel stop.
  it('the slide reads the ALIVE ring waypoint: from h = max(R/2, intel) to R — or straight to the board when R ≤ h', () => {
    for (const r of [MAP_R * 0.9, RING_R, SMALL_R]) {
      const c = cam(r);
      const Rw = c.aliveDetentSpanU;
      const h = Math.max(Rw / 2, c.intelSpanU);
      const end = Rw > h ? Rw : MAP_SPAN;
      for (const k of [0, 0.25, 0.5, 1]) {
        c.setUserZoom(Z.defaultSpanU / (h + k * (end - h)));
        expect(c.slideT, `r ${r} k ${k}`).toBeCloseTo(k, 9);
      }
    }
  });

  it('spectating, the slide reads the SPECTATE ring waypoint (floored at the default framing)', () => {
    const c = cam(SMALL_R);
    c.setSpectating(true);
    const Rw = c.detentSpanU;
    expect(Rw).toBeLessThan(c.aliveDetentSpanU); // premise: the two differ here
    const h = Math.max(Rw / 2, Z.defaultSpanU); // the spectate floor
    expect(Rw).toBeLessThanOrEqual(h); // the late ring: no ring leg
    c.setZoomFactor(Z.defaultSpanU / ((h + MAP_SPAN) / 2));
    expect(c.slideT).toBeCloseTo(0.5, 9);
    expect(c.mapSlideT).toBe(0);
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
  it('one stop; past it the ship glides straight to the map centre — no ring leg once R ≤ h (Story 11.8 review)', () => {
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
    expect(c.slideT).toBeCloseTo(0.5, 9);
    expect(c.mapSlideT).toBe(0);
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
      c.update(0.05, { x: 0, y: 0 });
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

// STORY 11.2 (R11): an intel fit AT OR PAST the whole-map fit is no stop at all
// (it was capped onto the out limit, which left both centre slides no room, so
// the fully-zoomed-out camera stayed on the ship). With the game's own 400 hm
// radar reach the intel disc is always wider than the board, so this is the
// shipped camera: zoomed fully out it frames the BOARD, centred on the board.
describe('an intel fit at or past the whole-map fit is no stop (Story 11.2)', () => {
  it('a tiny map under the synthetic disc: the intel span falls back to the default framing, one detent', () => {
    const tinyR = expectedIntelSpan(VW, VH, INSET) / (2 * M) / 2; // map fit = half the intel fit
    const c = new Camera({ ...OPTS });
    c.setViewport(VW, VH);
    c.setBottomInset(INSET);
    c.setMapRadius(tinyR);
    c.setRing(0, 0, tinyR);
    expect(intelFitSpanU(VW, VH, INSET, R, M)).toBeGreaterThan(c.mapSpanU); // premise
    expect(c.intelSpanU).toBe(Z.defaultSpanU);
    expect(c.aliveZoomDetents).toHaveLength(1);
  });

  it("the GAME's camera (intel = the radar reach): zoomed fully out, a MOVING rim ship sees the board centred", () => {
    const game: CameraOptions = { ...BASE, intelRadiusU: CONFIG.vision.radar };
    const ringC = { x: MAP_R * 0.25, y: -MAP_R * 0.15 };
    for (const ring of [MAP_R, MAP_R * 0.4]) {
      const c = new Camera({ ...game });
      c.setViewport(VW, VH);
      c.setMapRadius(MAP_R);
      c.setRing(ring === MAP_R ? 0 : ringC.x, ring === MAP_R ? 0 : ringC.y, ring);
      expect(intelFitSpanU(VW, VH, 0, CONFIG.vision.radar, M)).toBeGreaterThanOrEqual(c.mapSpanU); // premise
      c.setUserZoom(c.userZoomLimits.min); // fully out: the whole-map fit
      expect(c.userSpanU).toBeCloseTo(c.mapSpanU, 6);
      // A ship under way near the rim, heading across the board.
      const ship = { x: -MAP_R * 0.8, y: MAP_R * 0.3 };
      c.snapTo(ship);
      for (let i = 0; i < 120; i++) {
        ship.x += Math.cos(0.4) * 30 * 0.05;
        ship.y += Math.sin(0.4) * 30 * 0.05;
        c.update(0.05, ship);
      }
      expect(c.center.x, `ring ${ring}`).toBeCloseTo(0, 6);
      expect(c.center.y, `ring ${ring}`).toBeCloseTo(0, 6);
      // ...and the whole board is on screen: the rim at every compass point.
      for (const [x, y] of [[MAP_R, 0], [-MAP_R, 0], [0, MAP_R], [0, -MAP_R]] as const) {
        const p = c.worldToScreen({ x, y });
        expect(p.x).toBeGreaterThanOrEqual(-1e-6);
        expect(p.x).toBeLessThanOrEqual(VW + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(-1e-6);
        expect(p.y).toBeLessThanOrEqual(VH + 1e-6);
      }
    }
  });
});

describe('spectate is unchanged by an intel-configured camera', () => {
  function pair(r: number): [Camera, Camera] {
    const plain = new Camera({ ...BASE });
    plain.setViewport(VW, VH);
    plain.setMapRadius(MAP_R);
    plain.setRing(500, -300, r);
    const withIntel = cam(r, { cx: 500, cy: -300 });
    plain.setSpectating(true);
    withIntel.setSpectating(true);
    return [plain, withIntel];
  }

  it('zoomDetent, wheel stops, the slide and the ring ride match a camera without it', () => {
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


describe('event-driven center jumps ease (Eric 2026-10-19, ruling 10 — kept by Story 11.8)', () => {
  const DT = 1 / 60;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
  const RC = { x: 600, y: -400 };

  /** Parked on the alive ring stop (the slide at the ring centre), a ship sailing. */
  function parkedOnRing(camOpts: CameraOptions): Camera {
    const c = cam(RING_R, { cx: RC.x, cy: RC.y }, camOpts);
    c.setUserZoom(c.aliveZoomDetents[1]);
    c.update(0, sail(0));
    return c;
  }
  const sail = (t: number): { x: number; y: number } => ({ x: RC.x + 300 + 25 * t, y: RC.y - 200 + 10 * t });

  it('a ring feed that moves the ring centre glides the drawn centre there instead of popping', () => {
    const c = parkedOnRing(EASED);
    const pre = { ...c.center };
    expect(dist(pre, RC)).toBeLessThan(1e-6); // parked on the ring stop: the ring centre
    const moved = { x: RC.x + 400, y: RC.y - 300 };
    c.setRing(moved.x, moved.y, RING_R * 0.9);
    const jump = dist(pre, moved);
    c.update(DT, sail(DT));
    expect(dist(c.center, pre)).toBeLessThan(0.15 * jump);
    let last = dist(c.center, moved);
    for (let i = 2; i < 1.5 / DT; i++) {
      c.update(DT, sail(i * DT));
      const d = dist(c.center, moved);
      expect(d).toBeLessThanOrEqual(last + 1e-9);
      last = d;
    }
    expect(last).toBeLessThanOrEqual(0.01 * jump);
  });

  it('without the option the move lands at once (the pre-ruling behavior)', () => {
    const c = parkedOnRing(OPTS);
    c.setRing(RC.x + 400, RC.y - 300, RING_R * 0.9);
    c.update(DT, sail(DT));
    expect(c.center.x).toBeCloseTo(RC.x + 400, 9);
    expect(c.center.y).toBeCloseTo(RC.y - 300, 9);
  });

  it("the player's own zoom stays direct: a zoom step puts the centre straight on the slide; snapTo / home drop a jump", () => {
    const c = parkedOnRing(EASED);
    const Rw = c.aliveDetentSpanU;
    const h = Math.max(Rw / 2, c.intelSpanU);
    expect(Rw).toBeGreaterThan(h); // premise: a ring leg exists
    c.setUserZoom(Z.defaultSpanU / ((h + Rw) / 2));
    const ship = sail(1);
    c.update(DT, ship);
    const t = c.slideT;
    expect(t).toBeCloseTo(0.5, 9);
    expect(c.center.x).toBeCloseTo(ship.x + t * (RC.x - ship.x), 9);
    expect(c.center.y).toBeCloseTo(ship.y + t * (RC.y - ship.y), 9);
    c.setRing(RC.x + 400, RC.y, RING_R); // an eased jump starts...
    c.home(); // ...and Space drops it: the snap is instant
    c.update(DT, ship);
    expect(c.center.x).toBeCloseTo(ship.x + t * (RC.x + 400 - ship.x), 9);
  });
});

describe('review-gate patches (2026-10-19)', () => {
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
    c.setViewport(1280, 560);
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
