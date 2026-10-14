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

describe('Camera alive user-zoom limits (ruling 127)', () => {
  it('zoom-IN limit = shortAxis / closeSpanU', () => {
    const cam = ringed(4000);
    cam.setUserZoom(99);
    expect(cam.zoom).toBeCloseTo(900 / Z.closeSpanU, 10);
    expect(cam.userSpanU).toBeCloseTo(Z.closeSpanU, 9);
  });

  it('zoom-OUT limit = the live ring fit: shortAxis / (2 × r × margin)', () => {
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

  it('a ring narrower than the close framing pins BOTH limits to the close framing', () => {
    const lim = userZoomLimits(Z.defaultSpanU, Z.closeSpanU, ringFitSpanU(100, MARGIN));
    expect(lim.min).toBeCloseTo(lim.max, 12);
    expect(lim.max).toBeCloseTo(spanFactor(Z.defaultSpanU, Z.closeSpanU), 12);
  });

  it('r → 0 clamps to the close limit (continuous with the final ring closing)', () => {
    const cam = ringed(4000);
    cam.setUserZoom(0);
    cam.setRing(0, 0, 0);
    expect(cam.userSpanU).toBeCloseTo(Z.closeSpanU, 9);
    cam.setUserZoom(0);
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

  it('is independent of the spectate factor — the spectate clamp is the 2,640–1,320 u spans', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    const lim = cam.spectateZoomLimits;
    cam.setZoomFactor(0.01);
    expect(900 / cam.zoom).toBeCloseTo(Z.defaultSpanU / lim.min, 6);
    cam.setZoomFactor(99);
    expect(cam.zoomFactor).toBe(lim.max);
    cam.setZoomFactor(NaN);
    expect(cam.zoomFactor).toBe(lim.max);
    cam.resetUserZoom();
    cam.setZoomFactor(0.6);
    expect(cam.zoom).toBeCloseTo((900 / Z.defaultSpanU) * 0.6, 10);
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
