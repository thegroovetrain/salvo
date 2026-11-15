import { describe, it, expect } from 'vitest';
import {
  Camera,
  canUserZoom,
  ringFitSpanU,
  spanFactor,
  stepZoom,
  userZoomLimits,
  type CameraOptions,
} from '../render/camera.js';
import { CLIENT_CONFIG } from '../config.js';

// Story 9.8 (epic-9 rulings 127/128): every framing is an ABSOLUTE world span
// across the viewport's short axis — the default and close framings from
// CLIENT_CONFIG.zoom, the zoom-out limit the live ring fitted with the reveal's
// margin — and (Story 11.8) from half the ring waypoint the centre slides to
// the ring centre. Every expectation below is derived from those config spans,
// never a literal.

const Z = CLIENT_CONFIG.zoom;
const MARGIN = CLIENT_CONFIG.reveal.mapFitMargin;

const OPTS: CameraOptions = {
  defaultSpanU: Z.defaultSpanU,
  closeSpanU: Z.closeSpanU,
  ringFitMargin: MARGIN,
  homeRadiusPx: CLIENT_CONFIG.camera.homeRadiusPx,
};

function makeCamera(): Camera {
  return new Camera({ ...OPTS });
}

/** A camera at 1600×900 (short axis 900) with a ring fed. */
function ringed(r: number, cx = 0, cy = 0): Camera {
  const cam = makeCamera();
  cam.setViewport(1600, 900);
  cam.setRing(cx, cy, r);
  return cam;
}

describe('Camera base framing — the DEFAULT span fits the short axis (ruling 127)', () => {
  it('fits defaultSpanU to the short axis', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900); // short axis = 900
    expect(cam.zoom).toBeCloseTo(900 / Z.defaultSpanU, 10);
  });

  it('uses width when it is the shorter axis', () => {
    const cam = makeCamera();
    cam.setViewport(800, 1200);
    expect(cam.zoom).toBeCloseTo(800 / Z.defaultSpanU, 10);
  });

  it('the config spans are today\'s framings: default 1.0×, close 1.5× of it', () => {
    // Not a pin of the numbers — the RELATION the ruling states: the close
    // framing is today's 1.5× view of the default one.
    expect(Z.defaultSpanU / Z.closeSpanU).toBeCloseTo(1.5, 12);
  });

  it('the camera no longer follows radar — it has no radar seam at all', () => {
    expect((makeCamera() as unknown as Record<string, unknown>).setRadarRange).toBeUndefined();
  });
});

// Re-based on amendment 142 (Eric 2026-10-14): the out limit is the WHOLE MAP
// fit once setMapRadius() has run (zoomWaypoint.test.ts). These cameras are
// never fed a map radius, so they pin the FALLBACK: the live ring fit.
describe('Camera alive user-zoom limits (ruling 127; ring fallback before the map radius, amendment 142)', () => {
  it('zoom-IN limit = shortAxis / closeSpanU', () => {
    const cam = ringed(4000);
    cam.setUserZoom(99);
    expect(cam.zoom).toBeCloseTo(900 / Z.closeSpanU, 10);
    expect(cam.userSpanU).toBeCloseTo(Z.closeSpanU, 9);
  });

  it('zoom-OUT limit before the map radius = the live ring fit: shortAxis / (2 × r × margin)', () => {
    const cam = ringed(4000);
    cam.setUserZoom(0);
    expect(cam.zoom).toBeCloseTo(900 / (2 * 4000 * MARGIN), 10);
    expect(cam.userSpanU).toBeCloseTo(ringFitSpanU(4000, MARGIN), 9);
  });

  it('zoom reset is the DEFAULT framing, ship centred', () => {
    const cam = ringed(4000);
    cam.setUserZoom(0.3);
    cam.resetUserZoom();
    expect(cam.zoom).toBeCloseTo(900 / Z.defaultSpanU, 10);
    cam.snapTo({ x: 300, y: -100 });
    cam.update(0.05, { x: 300, y: -100 });
    expect(cam.center.x).toBeCloseTo(300, 9);
    expect(cam.center.y).toBeCloseTo(-100, 9);
  });

  it('the limit RE-FITS as the ring closes — a captain at the out limit stays fitted', () => {
    const cam = ringed(4000);
    cam.setUserZoom(0); // sitting on the out limit
    for (const r of [3500, 2000, 1000, 700]) {
      const moved = cam.setRing(0, 0, r);
      expect(moved, `r ${r}: the clamp moved the zoom`).toBe(true);
      expect(cam.userSpanU, `r ${r}`).toBeCloseTo(ringFitSpanU(r, MARGIN), 9);
    }
  });

  it('a captain INSIDE the limits is not moved by the ring until it reaches them', () => {
    const cam = ringed(4000);
    cam.setUserZoom(1);
    expect(cam.setRing(0, 0, 3000)).toBe(false);
    expect(cam.userZoom).toBe(1);
  });

  // The ring fit is a zoom-OUT limit ONLY (Story 9.8 review gate, F3): once
  // the live ring's fitted span drops under the default framing (the final
  // close), the out limit stops AT the default framing — it never forces a
  // captain in toward the close framing.
  it('a ring narrower than the default framing holds the out limit AT the default framing', () => {
    const r = (Z.closeSpanU / (2 * MARGIN)) * 0.5; // fits well inside the close framing
    const lim = userZoomLimits(Z.defaultSpanU, Z.closeSpanU, ringFitSpanU(r, MARGIN));
    expect(lim.min).toBe(1);
    expect(lim.max).toBeCloseTo(spanFactor(Z.defaultSpanU, Z.closeSpanU), 12);
  });

  it('ring r = 300 u: the out limit is the default framing, and a captain at zoom 1 stays at 1', () => {
    expect(ringFitSpanU(300, MARGIN), 'the premise: the fit is under the default span').toBeLessThan(Z.defaultSpanU);
    const cam = ringed(4000);
    cam.setUserZoom(1);
    expect(cam.setRing(0, 0, 300), 'the ring did not force the zoom').toBe(false);
    expect(cam.userZoom).toBe(1);
    cam.setUserZoom(0);
    expect(cam.userZoom).toBe(1);
    expect(cam.userZoomLimits.min).toBe(1);
  });

  it('r → 0 holds the out limit at the DEFAULT framing (never the close one)', () => {
    const cam = ringed(4000);
    cam.setUserZoom(0);
    cam.setRing(0, 0, 0);
    expect(cam.userSpanU).toBeCloseTo(Z.defaultSpanU, 9);
    cam.setUserZoom(0);
    expect(cam.userSpanU).toBeCloseTo(Z.defaultSpanU, 9);
    cam.setUserZoom(99);
    expect(cam.userSpanU).toBeCloseTo(Z.closeSpanU, 9);
  });

  it('a NaN / negative / infinite ring falls back to the DEFAULT framing as the out limit', () => {
    for (const r of [NaN, -5, Infinity]) {
      const cam = ringed(r);
      cam.setUserZoom(0);
      expect(cam.userZoom, `r ${r}`).toBe(1);
      expect(Number.isFinite(cam.zoom), `r ${r}`).toBe(true);
      cam.setUserZoom(99);
      expect(cam.userSpanU, `r ${r}`).toBeCloseTo(Z.closeSpanU, 9);
    }
  });

  it('before any ring is fed the out limit is the default framing', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    cam.setUserZoom(0);
    expect(cam.userZoom).toBe(1);
  });

  it('IGNORES a non-finite factor — NaN can never poison the composed zoom', () => {
    const cam = ringed(4000);
    cam.setUserZoom(1.25);
    // Math.min/max pass NaN straight through, so an unguarded setter would
    // latch NaN forever (every later clamp of NaN is NaN).
    cam.setUserZoom(NaN);
    expect(cam.userZoom).toBe(1.25);
    cam.setUserZoom(Infinity);
    expect(cam.userZoom).toBe(1.25);
    cam.setUserZoom(0.8);
    expect(cam.userZoom).toBe(0.8);
  });

  // Re-based on Eric's 2026-10-14 ruling ("The full zoom-out needs to apply to
  // spectate mode, as well"): the spectate clamp IS the alive range now.
  it('is independent of the spectate factor — whose clamp is the same alive range', () => {
    const cam = ringed(3000);
    const lim = cam.spectateZoomLimits;
    expect(lim).toEqual(cam.userZoomLimits);
    cam.setZoomFactor(0.01);
    expect(900 / cam.zoom).toBeCloseTo(Z.defaultSpanU / lim.min, 6);
    cam.setZoomFactor(99);
    expect(cam.zoomFactor).toBe(lim.max);
    cam.setZoomFactor(NaN);
    expect(cam.zoomFactor).toBe(lim.max);
    cam.resetUserZoom();
    cam.setZoomFactor(0.6);
    expect(cam.zoom).toBeCloseTo((900 / Z.defaultSpanU) * 0.6, 10);
    expect(cam.userZoom).toBe(1); // the alive factor never moved
  });
});

// Eric 2026-10-14: "The full zoom-out needs to apply to spectate mode, as well.
// In this case, the zoom in/out should be localized around my mouse cursor
// (since my ship has sunk/is otherwise nonexistent)."
describe('SPECTATE zoom = the alive range, anchored at the cursor (Eric 2026-10-14)', () => {
  it('the spectate limits ARE the alive limits for the same viewport and ring', () => {
    for (const r of [0, 300, 900, 2400, 5600]) {
      const cam = ringed(r);
      expect(cam.spectateZoomLimits).toEqual(cam.userZoomLimits);
      expect(cam.spectateZoomLimits).toEqual(userZoomLimits(Z.defaultSpanU, Z.closeSpanU, ringFitSpanU(r, MARGIN)));
      cam.setZoomFactor(99);
      expect(900 / cam.zoom).toBeCloseTo(Z.closeSpanU, 6); // the in limit is the close framing
      cam.setZoomFactor(0.0001);
      expect(900 / cam.zoom).toBeCloseTo(Math.max(Z.defaultSpanU, ringFitSpanU(r, MARGIN)), 6);
    }
  });

  it('the ring feed re-fits the spectate out limit as the ring closes — never past the default framing', () => {
    const cam = ringed(2400);
    cam.setZoomFactor(0.0001); // parked at the out limit
    expect(900 / cam.zoom).toBeCloseTo(ringFitSpanU(2400, MARGIN), 6);
    expect(cam.setRing(0, 0, 1200)).toBe(true);
    expect(900 / cam.zoom).toBeCloseTo(ringFitSpanU(1200, MARGIN), 6); // carried in, still fitted
    cam.setRing(0, 0, 100); // fitted span now under the default framing
    expect(cam.zoomFactor).toBe(1);
    expect(900 / cam.zoom).toBeCloseTo(Z.defaultSpanU, 6);
  });

  it('a spectator inside the limits is not moved by the ring', () => {
    const cam = ringed(2400);
    cam.setZoomFactor(0.8);
    expect(cam.setRing(0, 0, 2000)).toBe(false);
    expect(cam.zoomFactor).toBe(0.8);
  });

  it('r → 0 and a NaN / negative / infinite ring hold the spectate out limit at the DEFAULT framing', () => {
    for (const r of [0, NaN, -5, Infinity]) {
      const cam = ringed(2400);
      cam.setZoomFactor(0.0001);
      cam.setRing(0, 0, r);
      expect(cam.zoomFactor).toBe(1);
      expect(Number.isFinite(cam.zoom)).toBe(true);
      cam.setZoomFactor(0.0001);
      expect(cam.zoomFactor).toBe(1); // the default framing, never the close one
    }
  });

  it('the ring feed leaves a live REVEAL framing alone (amendment 25: exempt from the clamp)', () => {
    const cam = ringed(2400);
    cam.beginReveal(6000, MARGIN, CLIENT_CONFIG.reveal.zoomRate);
    cam.tickZoom(0, 0); // motion off: arrive
    const reveal = cam.zoomFactor;
    cam.setRing(0, 0, 1000);
    expect(cam.zoomFactor).toBe(reveal);
  });

  // Story 11.8 (Eric 2026-11-15): the spectate zoom takes the STRATEGIC rules —
  // in toward the cursor (the anchor solved through the slide's inverse), out
  // about the anchor.
  it('zoomAbout IN keeps the world point under the cursor fixed and PANS — wheel and key steps, several zooms', () => {
    const cam = ringed(3000, 400, -250);
    cam.shake.x = 3; // shake is part of the mapping and must not break the anchor
    cam.shake.y = -2;
    const cursors = [{ x: 100, y: 80 }, { x: 1500, y: 820 }, { x: 700, y: 520 }, { x: 0, y: 900 }];
    const steps = [
      (f: number): number => stepZoom(f, Z.keyStep), // X
      (f: number): number => stepZoom(f, 400 * Z.wheelRate), // a wheel spin in
    ];
    for (const start of [0.3, 0.6, 1, 1.4]) {
      for (const s of cursors) {
        for (const step of steps) {
          cam.snapTo({ x: 1234, y: -567 });
          cam.home();
          cam.setZoomFactor(start);
          cam.update(0, { x: 1234, y: -567 });
          const p = cam.screenToWorld(s);
          const before = cam.zoomFactor;
          cam.zoomAbout(s.x, s.y, step(before));
          expect(cam.zoomFactor).toBeGreaterThan(before);
          expect(cam.mode).toBe('panned');
          const back = cam.worldToScreen(p);
          expect(back.x).toBeCloseTo(s.x, 6);
          expect(back.y).toBeCloseTo(s.y, 6);
        }
      }
    }
  });

  it('zoomAbout OUT is about the anchor: FOLLOW stays FOLLOW and the anchor does not move', () => {
    const cam = ringed(3000, 400, -250);
    const hull = { x: 1234, y: -567 };
    cam.update(0, hull);
    for (const s of [{ x: 100, y: 80 }, { x: 1500, y: 820 }]) {
      cam.zoomAbout(s.x, s.y, stepZoom(cam.zoomFactor, -Z.keyStep));
      expect(cam.mode).toBe('follow');
      expect(cam.anchorPoint).toEqual(hull);
    }
  });

  it('zoomAbout at a clamped limit moves nothing (the zoom could not change)', () => {
    const cam = ringed(3000);
    cam.snapTo({ x: 50, y: 60 });
    cam.setZoomFactor(99);
    cam.zoomAbout(1200, 200, 999);
    expect(cam.center.x).toBeCloseTo(50, 9);
    expect(cam.center.y).toBeCloseTo(60, 9);
    expect(cam.mode).toBe('follow');
  });

  it('a non-finite cursor is the SCREEN CENTRE; a non-finite zoom is ignored', () => {
    const cam = ringed(3000);
    cam.snapTo({ x: 70, y: -30 });
    cam.setZoomFactor(0.6);
    cam.zoomAbout(NaN, 10, 0.8); // in, about the screen centre = the hull: FOLLOW stays
    expect(cam.zoomFactor).toBe(0.8);
    expect(cam.mode).toBe('follow');
    expect(cam.center.x).toBeCloseTo(70, 9);
    expect(cam.center.y).toBeCloseTo(-30, 9);
    cam.zoomAbout(10, 10, NaN);
    expect(cam.zoomFactor).toBe(0.8);
    expect(cam.center.x).toBeCloseTo(70, 9);
  });

  it('a zoom IN with the cursor within the home radius of the followed hull stays FOLLOW about the hull', () => {
    const cam = ringed(3000);
    const hull = { x: -200, y: 150 };
    cam.update(0, hull);
    const at = cam.worldToScreen(hull);
    const r = CLIENT_CONFIG.camera.homeRadiusPx;
    cam.zoomAbout(at.x + r * 0.9, at.y, 1.3);
    expect(cam.mode).toBe('follow');
    expect(cam.anchorPoint).toEqual(hull);
    cam.setZoomFactor(1);
    cam.zoomAbout(at.x + r * 1.5, at.y, 1.3);
    expect(cam.mode).toBe('panned');
  });

  it('zoomAbout releases the reveal framing, like every manual camera action', () => {
    const cam = ringed(3000);
    cam.beginReveal(6000, MARGIN, CLIENT_CONFIG.reveal.zoomRate);
    cam.zoomAbout(100, 100, 0.9);
    expect(cam.revealing).toBe(false);
  });

  it('the alive user zoom is untouched by zoomAbout (the spectate factor is its own)', () => {
    const cam = ringed(3000);
    cam.zoomAbout(200, 200, 0.7);
    expect(cam.userZoom).toBe(1);
  });
});

describe('stepZoom — the key / wheel step is a LOG step (today\'s feel at the default framing)', () => {
  it('one key press is e^±keyStep — within a percent of today\'s ±0.1 at the default framing', () => {
    expect(stepZoom(1, Z.keyStep)).toBeCloseTo(Math.exp(Z.keyStep), 12);
    expect(Math.abs(stepZoom(1, Z.keyStep) - 1.1)).toBeLessThan(0.01);
    expect(Math.abs(stepZoom(1, -Z.keyStep) - 0.9)).toBeLessThan(0.01);
  });

  it('is the same PERCEIVED step anywhere in the range — a ratio, never an increment', () => {
    for (const f of [0.15, 0.5, 1, 1.4]) {
      expect(stepZoom(f, -Z.keyStep) / f).toBeCloseTo(Math.exp(-Z.keyStep), 12);
    }
  });

  it('a 100-unit wheel notch is within a percent of today\'s −0.08', () => {
    expect(Math.abs(stepZoom(1, -100 * Z.wheelRate) - 0.92)).toBeLessThan(0.01);
  });

  it('a non-finite amount leaves the factor unchanged', () => {
    expect(stepZoom(0.7, NaN)).toBe(0.7);
  });
});

// Story 11.8 (Eric 2026-11-15): the drawn centre is slide(anchor, span) — the
// anchor until half the ring waypoint, then a glide to the ring centre, then on
// to the board centre (the pure math: cameraSlide.test.ts). These are the
// camera-level compositions, with MOVING ships (amendment 208's lesson).
describe('THE STRATEGIC CAMERA (Story 11.8)', () => {
  const RING = { x: 2000, y: -1000, r: 4000 };
  /** A ship at 30 u/s heading east-south-east. */
  const sail = (t: number): { x: number; y: number } => ({ x: -500 + 28 * t, y: 400 + 11 * t });

  function cam(span: number, mapRadius?: number): Camera {
    const c = ringed(RING.r, RING.x, RING.y);
    if (mapRadius !== undefined) c.setMapRadius(mapRadius);
    c.setUserZoom(Z.defaultSpanU / span);
    return c;
  }

  it('FOLLOW, span ≤ h: the moving ship sits at the exact screen centre every frame (shake aside)', () => {
    const c = cam(Z.defaultSpanU);
    expect(c.userSpanU).toBeLessThanOrEqual(ringFitSpanU(RING.r, MARGIN) / 2); // premise: inside h
    for (let i = 0; i < 120; i++) {
      const ship = sail(i / 60);
      c.update(1 / 60, ship);
      const s = c.worldToScreen(ship);
      expect(s.x).toBeCloseTo(800, 9);
      expect(s.y).toBeCloseTo(450, 9);
    }
    c.shake.x = 4;
    c.shake.y = -3;
    const s = c.worldToScreen(sail(119 / 60));
    expect(s.x - 800).toBeCloseTo(4, 9);
    expect(s.y - 450).toBeCloseTo(-3, 9);
  });

  it('between h and R the centre glides ship → ring centre (linear in span); at R it IS the ring centre', () => {
    const R = ringFitSpanU(RING.r, MARGIN);
    for (const k of [0.25, 0.5, 1]) {
      const span = R / 2 + k * (R / 2);
      const c = cam(span);
      const ship = sail(3);
      c.update(1 / 60, ship);
      expect(c.slideT).toBeCloseTo(k, 9);
      expect(c.center.x).toBeCloseTo(ship.x + k * (RING.x - ship.x), 6);
      expect(c.center.y).toBeCloseTo(ship.y + k * (RING.y - ship.y), 6);
      expect(c.mode).toBe('follow');
    }
  });

  it('at the whole-board span the board centre is centred, still FOLLOW; back inside h the ship is centred again', () => {
    const c = cam(Z.defaultSpanU, 6000);
    c.setUserZoom(0); // the out limit: the whole-board fit
    c.update(1 / 60, sail(1));
    expect(c.center.x).toBeCloseTo(0, 6);
    expect(c.center.y).toBeCloseTo(0, 6);
    expect(c.mode).toBe('follow');
    c.setUserZoom(1);
    const ship = sail(1.5);
    c.update(1 / 60, ship);
    expect(c.center.x).toBeCloseTo(ship.x, 9);
    expect(c.center.y).toBeCloseTo(ship.y, 9);
  });

  it('PANNED holds the water while the ship sails on; Space (home) snaps back at the same zoom', () => {
    const c = cam(Z.defaultSpanU);
    c.update(1 / 60, sail(0));
    c.pan(300, -200);
    expect(c.mode).toBe('panned');
    const held = { ...c.center };
    for (let i = 1; i < 60; i++) c.update(1 / 60, sail(i / 60));
    expect(c.center).toEqual(held);
    const zoom = c.zoom;
    c.home();
    const ship = sail(1);
    c.update(1 / 60, ship);
    expect(c.mode).toBe('follow');
    expect(c.zoom).toBe(zoom);
    expect(c.center.x).toBeCloseTo(ship.x, 9);
    expect(c.center.y).toBeCloseTo(ship.y, 9);
  });

  it('a pan moves the DRAWN centre by exactly the asked delta at any slide fraction below 1 (Δ / (1 − t))', () => {
    const R = ringFitSpanU(RING.r, MARGIN);
    for (const span of [Z.defaultSpanU, R * 0.6, R * 0.9]) {
      const c = cam(span);
      c.update(0, sail(0));
      const before = { ...c.center };
      c.pan(120, -45);
      expect(c.center.x - before.x, `span ${span}`).toBeCloseTo(120, 6);
      expect(c.center.y - before.y, `span ${span}`).toBeCloseTo(-45, 6);
    }
  });

  it('the middle drag is 1:1 under the cursor: the world point under it follows the hand', () => {
    const c = cam(ringFitSpanU(RING.r, MARGIN) * 0.7);
    c.update(0, sail(0));
    const s = { x: 400, y: 300 };
    const p = c.screenToWorld(s);
    c.panScreen(55, -20);
    const back = c.worldToScreen(p);
    expect(back.x).toBeCloseTo(s.x + 55, 6);
    expect(back.y).toBeCloseTo(s.y - 20, 6);
  });

  it('at full zoom-out a pan is a no-op (the anchor has no say), and the mode is left alone', () => {
    const c = cam(Z.defaultSpanU, 6000);
    c.setUserZoom(0);
    c.update(0, sail(0));
    const before = { ...c.center };
    c.pan(500, 500);
    expect(c.center).toEqual(before);
    expect(c.mode).toBe('follow');
  });

  it('the panned anchor is clamped inside the board fit', () => {
    const c = cam(Z.defaultSpanU, 6000);
    c.update(0, sail(0));
    c.pan(1e7, 0);
    expect(Math.hypot(c.anchorPoint.x, c.anchorPoint.y)).toBeCloseTo(c.mapSpanU / 2, 6);
  });

  it('the cursor zoom-in from the whole board heads for the cursor; Space returns FOLLOW at the same zoom', () => {
    const c = cam(Z.defaultSpanU, 6000);
    c.setUserZoom(0);
    const ship = sail(0);
    c.update(0, ship);
    const s = { x: 1300, y: 200 };
    const target = c.screenToWorld(s);
    const far = Math.hypot(c.center.x - target.x, c.center.y - target.y);
    for (let i = 0; i < 40; i++) c.zoomUserAbout(s.x, s.y, stepZoom(c.userZoom, Z.keyStep, c.aliveZoomDetents));
    expect(c.mode).toBe('panned');
    // The view went TOWARD the point first under the cursor, never toward the ship.
    expect(Math.hypot(c.center.x - target.x, c.center.y - target.y)).toBeLessThan(far / 2);
    const zoom = c.zoom;
    c.home();
    c.update(0, ship);
    expect(c.zoom).toBe(zoom);
    expect(c.mode).toBe('follow');
  });

  it('no ring and no board known (the lobby scene, a bare camera): nothing ever slides', () => {
    const c = makeCamera();
    c.setViewport(1600, 900);
    c.update(0, { x: 777, y: -333 });
    expect(c.center.x).toBe(777);
    expect(c.center.y).toBe(-333);
  });
});

describe('canUserZoom — the alive-only gate for X/Z + wheel zoom', () => {
  it('allows zoom ONLY for a live captain who is not spectating', () => {
    expect(canUserZoom(false, true)).toBe(true);
    expect(canUserZoom(true, true)).toBe(false); // spectate owns zoom there
    expect(canUserZoom(false, false)).toBe(false); // sunk, awaiting respawn
  });

  it('treats a MISSING own ship as NOT alive (pre-join / before the first frame)', () => {
    // `you` is null until the first frame lands; an `alive === false` gate would
    // let zoom (and its debounced fog re-bake) run against an unstarted match.
    expect(canUserZoom(false, undefined)).toBe(false);
    expect(canUserZoom(true, undefined)).toBe(false);
  });
});

describe('Camera world<->screen roundtrip', () => {
  it('screenToWorld inverts worldToScreen', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    cam.snapTo({ x: 120, y: -40 });
    cam.shake.x = 7;
    cam.shake.y = -3;
    for (const p of [
      { x: 0, y: 0 },
      { x: 250, y: 130 },
      { x: -900, y: 640 },
    ]) {
      const s = cam.worldToScreen(p);
      const back = cam.screenToWorld(s);
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it('maps the camera center to screen center (no shake)', () => {
    const cam = makeCamera();
    cam.setViewport(1000, 800);
    cam.snapTo({ x: 42, y: 17 });
    const s = cam.worldToScreen({ x: 42, y: 17 });
    expect(s.x).toBeCloseTo(500, 6);
    expect(s.y).toBeCloseTo(400, 6);
  });
});

describe('FOLLOW has no lead and no easing (Story 11.8 retired both)', () => {
  it('a ship under way at any heading and speed is the centre on the very next frame', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    cam.snapTo({ x: 0, y: 0 });
    for (let i = 0; i < 30; i++) {
      const ship = { x: 40 * i, y: -25 * i };
      cam.update(0.05, ship);
      expect(cam.center.x).toBeCloseTo(ship.x, 12);
      expect(cam.center.y).toBeCloseTo(ship.y, 12);
    }
  });
});
