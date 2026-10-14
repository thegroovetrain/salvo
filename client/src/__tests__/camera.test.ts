import { describe, it, expect } from 'vitest';
import {
  Camera,
  canUserZoom,
  centreSlideT,
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
// margin — and past the default framing the centre slides to the ring centre.
// Every expectation below is derived from those config spans, never a literal.

const Z = CLIENT_CONFIG.zoom;
const MARGIN = CLIENT_CONFIG.reveal.mapFitMargin;

const OPTS: CameraOptions = {
  defaultSpanU: Z.defaultSpanU,
  closeSpanU: Z.closeSpanU,
  ringFitMargin: MARGIN,
  followRate: 5,
  leadSeconds: 4,
  leadMax: 110,
  keepInViewPadU: CLIENT_CONFIG.camera.keepInViewPadU,
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
    cam.update(0.05, { x: 300, y: -100, heading: 0, speed: 0 });
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

  it('zoomAbout keeps the world point under the cursor fixed — wheel and key steps, several zooms', () => {
    const cam = ringed(3000, 400, -250);
    cam.snapTo({ x: 1234, y: -567 });
    cam.shake.x = 3; // shake is part of the mapping and must not break the anchor
    cam.shake.y = -2;
    const cursors = [{ x: 100, y: 80 }, { x: 1500, y: 820 }, { x: 800, y: 450 }, { x: 0, y: 900 }];
    const steps = [
      (f: number): number => stepZoom(f, -100 * Z.wheelRate), // one wheel notch out
      (f: number): number => stepZoom(f, -Z.keyStep), // Z
      (f: number): number => stepZoom(f, Z.keyStep), // X
      (f: number): number => stepZoom(f, 400 * Z.wheelRate), // a wheel spin in
    ];
    for (const start of [0.3, 0.6, 1, 1.4]) {
      for (const s of cursors) {
        for (const step of steps) {
          cam.setZoomFactor(start);
          const p = cam.screenToWorld(s);
          const before = cam.zoomFactor;
          cam.zoomAbout(s.x, s.y, step(before));
          expect(cam.zoomFactor).not.toBe(before);
          const back = cam.worldToScreen(p);
          expect(back.x).toBeCloseTo(s.x, 6);
          expect(back.y).toBeCloseTo(s.y, 6);
        }
      }
    }
  });

  it('zoomAbout at a clamped limit holds the cursor point too (no drift when the zoom cannot move)', () => {
    const cam = ringed(3000);
    cam.snapTo({ x: 50, y: 60 });
    cam.setZoomFactor(99);
    const s = { x: 1200, y: 200 };
    const p = cam.screenToWorld(s);
    cam.zoomAbout(s.x, s.y, 999);
    expect(cam.center.x).toBeCloseTo(50, 9);
    expect(cam.center.y).toBeCloseTo(60, 9);
    expect(cam.worldToScreen(p).x).toBeCloseTo(s.x, 6);
  });

  it('zoomAbout at the SCREEN CENTRE is a plain zoom about the camera centre; a non-finite cursor anchors there', () => {
    const cam = ringed(3000);
    cam.snapTo({ x: 70, y: -30 });
    const c = cam.screenCenter;
    cam.zoomAbout(c.x, c.y, 0.5);
    expect(cam.center.x).toBeCloseTo(70, 9);
    expect(cam.center.y).toBeCloseTo(-30, 9);
    cam.zoomAbout(NaN, 10, 0.8);
    expect(cam.zoomFactor).toBe(0.8);
    expect(cam.center.x).toBeCloseTo(70, 9);
    expect(cam.center.y).toBeCloseTo(-30, 9);
    cam.zoomAbout(10, 10, NaN); // a non-finite zoom is ignored: nothing moves
    expect(cam.zoomFactor).toBe(0.8);
    expect(cam.center.x).toBeCloseTo(70, 9);
  });

  it('zoomAbout releases the reveal framing, like every manual camera action', () => {
    const cam = ringed(3000);
    cam.beginReveal(6000, MARGIN, CLIENT_CONFIG.reveal.zoomRate);
    cam.zoomAbout(100, 100, 0.9);
    expect(cam.revealing).toBe(false);
  });

  it('FOLLOW: the anchor holds for the zoom frame, then the eased follow resumes from the new centre', () => {
    const cam = ringed(3000);
    const hull = { x: 0, y: 0, heading: 0, speed: 0 };
    cam.snapTo(hull);
    cam.zoomAbout(1500, 100, 0.5);
    const shifted = { ...cam.center };
    expect(Math.hypot(shifted.x, shifted.y)).toBeGreaterThan(0);
    cam.update(1 / 60, hull);
    // One frame of follow eases FROM the shifted centre, never snapping back...
    expect(Math.hypot(cam.center.x, cam.center.y)).toBeLessThan(Math.hypot(shifted.x, shifted.y));
    expect(Math.hypot(cam.center.x, cam.center.y)).toBeGreaterThan(0.5 * Math.hypot(shifted.x, shifted.y));
    // ...and the follow still converges on the hull.
    for (let i = 0; i < 600; i++) cam.update(1 / 60, hull);
    expect(cam.center.x).toBeCloseTo(0, 3);
    expect(cam.center.y).toBeCloseTo(0, 3);
  });

  it('the alive user zoom is untouched by zoomAbout (the alive camera stays own-ship-anchored)', () => {
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

describe('THE CENTRE SLIDE (ruling 128)', () => {
  const RING = { x: 2000, y: -1000, r: 4000 };
  const SHIP = { x: -500, y: 400, heading: 0, speed: 0 };

  function slid(span: number): Camera {
    const cam = ringed(RING.r, RING.x, RING.y);
    cam.setUserZoom(Z.defaultSpanU / span);
    cam.snapTo(SHIP);
    cam.update(0.05, SHIP);
    return cam;
  }

  it('t is 0 at and inside the default framing, 1 at the ring fit, linear between', () => {
    const ringSpan = ringFitSpanU(RING.r, MARGIN);
    expect(centreSlideT(Z.closeSpanU, Z.defaultSpanU, ringSpan)).toBe(0);
    expect(centreSlideT(Z.defaultSpanU, Z.defaultSpanU, ringSpan)).toBe(0);
    expect(centreSlideT((Z.defaultSpanU + ringSpan) / 2, Z.defaultSpanU, ringSpan)).toBeCloseTo(0.5, 12);
    expect(centreSlideT(ringSpan, Z.defaultSpanU, ringSpan)).toBe(1);
  });

  it('a ring no wider than the default framing (or an unusable one) never slides', () => {
    expect(centreSlideT(5000, Z.defaultSpanU, Z.defaultSpanU * 0.9)).toBe(0);
    expect(centreSlideT(5000, Z.defaultSpanU, NaN)).toBe(0);
  });

  it('at the default framing the SHIP is centred', () => {
    const cam = slid(Z.defaultSpanU);
    expect(cam.center.x).toBeCloseTo(SHIP.x, 9);
    expect(cam.center.y).toBeCloseTo(SHIP.y, 9);
  });

  it('halfway between default and ring span, the centre is halfway ship → ring centre', () => {
    const cam = slid((Z.defaultSpanU + ringFitSpanU(RING.r, MARGIN)) / 2);
    expect(cam.slideT).toBeCloseTo(0.5, 9);
    expect(cam.center.x).toBeCloseTo((SHIP.x + RING.x) / 2, 9);
    expect(cam.center.y).toBeCloseTo((SHIP.y + RING.y) / 2, 9);
  });

  it('at the zoom-out limit the RING CENTRE is centred', () => {
    const cam = ringed(RING.r, RING.x, RING.y);
    cam.setUserZoom(0);
    cam.snapTo(SHIP);
    cam.update(0.05, SHIP);
    expect(cam.center.x).toBeCloseTo(RING.x, 9);
    expect(cam.center.y).toBeCloseTo(RING.y, 9);
  });

  // F2 (Story 9.8 review gate): at the out limit the centre is the ring
  // centre, so a captain OUTSIDE the ring in the storm would slide off screen.
  // The centre is clamped so the hull point stays keepInViewPadU inside every
  // edge of the view RECT; a captain inside the ring is never touched.
  it('a captain in the storm at 1.3 × r from the ring centre stays inside the view rect at the out limit', () => {
    const pad = CLIENT_CONFIG.camera.keepInViewPadU;
    expect(pad, 'the premise: a real pad').toBeGreaterThan(0);
    for (const dir of [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }]) {
      const ship = { x: RING.x + dir.x * 1.3 * RING.r, y: RING.y + dir.y * 1.3 * RING.r, heading: 0, speed: 0 };
      const cam = ringed(RING.r, RING.x, RING.y);
      cam.setUserZoom(0);
      cam.snapTo(ship);
      cam.update(0.05, ship);
      const v = cam.worldView;
      const tag = `dir (${dir.x.toFixed(2)}, ${dir.y.toFixed(2)})`;
      expect(Math.abs(ship.x - v.x), tag).toBeLessThanOrEqual(v.halfW - pad + 1e-6);
      expect(Math.abs(ship.y - v.y), tag).toBeLessThanOrEqual(v.halfH - pad + 1e-6);
      const s = cam.worldToScreen(ship);
      expect(s.x, tag).toBeGreaterThan(0);
      expect(s.x, tag).toBeLessThan(1600);
      expect(s.y, tag).toBeGreaterThan(0);
      expect(s.y, tag).toBeLessThan(900);
    }
  });

  it('a captain INSIDE the ring at the out limit is unaffected: the centre is exactly the ring centre', () => {
    for (const k of [0, 0.5, 0.95]) {
      const ship = { x: RING.x, y: RING.y + k * RING.r, heading: 0, speed: 0 };
      const cam = ringed(RING.r, RING.x, RING.y);
      cam.setUserZoom(0);
      cam.snapTo(ship);
      cam.update(0.05, ship);
      expect(cam.center.x, `k ${k}`).toBe(RING.x);
      expect(cam.center.y, `k ${k}`).toBe(RING.y);
    }
  });

  it('lead + follow smoothing apply to the SHIP term only', () => {
    const cam = ringed(RING.r, RING.x, RING.y);
    const span = (Z.defaultSpanU + ringFitSpanU(RING.r, MARGIN)) / 2;
    cam.setUserZoom(Z.defaultSpanU / span);
    cam.snapTo({ x: 0, y: 0 });
    const ship = { x: 100, y: 0, heading: 0, speed: 0 };
    cam.update(0.05, ship);
    const followX = 100 * (1 - Math.exp(-0.25)); // one 50ms step at rate 5
    expect(cam.center.x).toBeCloseTo(followX + (RING.x - followX) * 0.5, 6);
    expect(cam.center.y).toBeCloseTo(0 + (RING.y - 0) * 0.5, 6);
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

describe('Camera follow smoothing', () => {
  it('is deterministic and converges toward ship + lead', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    cam.snapTo({ x: 0, y: 0 });
    // Ship stationary at (100, 0): no lead, center approaches (100, 0).
    const ship = { x: 100, y: 0, heading: 0, speed: 0 };
    const before = cam.center.x;
    cam.update(0.05, ship);
    const after = cam.center.x;
    // one 50ms step at rate 5: factor = 1 - exp(-0.25) ~= 0.221
    expect(after).toBeCloseTo(100 * (1 - Math.exp(-0.25)), 6);
    expect(after).toBeGreaterThan(before);
    for (let i = 0; i < 400; i++) cam.update(0.05, ship);
    expect(cam.center.x).toBeCloseTo(100, 4);
    expect(cam.center.y).toBeCloseTo(0, 4);
  });

  it('leads ahead by speed * leadSeconds below the cap', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    // maxSpeed 25 * leadSeconds 4 = 100u, under leadMax 110 (cap not engaged).
    const ship = { x: 0, y: 0, heading: 0, speed: 25 };
    cam.snapTo({ x: 0, y: 0 });
    for (let i = 0; i < 500; i++) cam.update(0.05, ship);
    expect(cam.center.x).toBeCloseTo(100, 3);
    expect(cam.center.y).toBeCloseTo(0, 3);
  });

  it('caps lead at leadMax for over-speed inputs', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    const ship = { x: 0, y: 0, heading: 0, speed: 40 }; // 40*4 = 160 > 110 cap
    cam.snapTo({ x: 0, y: 0 });
    for (let i = 0; i < 500; i++) cam.update(0.05, ship);
    expect(cam.center.x).toBeCloseTo(110, 3);
    expect(cam.center.y).toBeCloseTo(0, 3);
  });

  it('leads astern when reversing', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    const ship = { x: 0, y: 0, heading: 0, speed: -8 };
    cam.snapTo({ x: 0, y: 0 });
    for (let i = 0; i < 500; i++) cam.update(0.05, ship);
    // travel dir is -x; lead magnitude = 8 * 4 = 32 (< cap)
    expect(cam.center.x).toBeCloseTo(-32, 3);
  });
});
