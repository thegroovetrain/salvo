// THE RING WAYPOINT (Eric 2026-10-14, epic-9 amendment 142): "Maybe we
// shouldn't cap the zoom out to the current ring. Instead lets set the current
// ring as a sort of 'waypoint' and from there you could zoom out to the entire
// map, even the stormed-out bits."
//
// The zoom-out limit is the WHOLE MAP fit (2 × mapRadius × reveal.mapFitMargin,
// the reveal's framing) for the alive camera and the spectator alike; the live
// ring fit is a DETENT on the way (a step that would cross it lands on it); the
// centre slides anchor → ring centre up to the detent (from half of it since Story 11.8), then ring centre → map
// centre (the origin) out to the map fit. Every number below is derived from
// config / the shared map sizing, never a literal span.

import { describe, it, expect } from 'vitest';
import { CONFIG, mapRadius } from '@salvo/shared';
import { Camera, detentSpanU, ringFitSpanU, stepZoom, zoomOutSpanU, type CameraOptions } from '../render/camera.js';
import { wheelZoom } from '../render/spectate.js';
import { fogBakeSize, fogFrameRects } from '../render/fog.js';
import { fillOuterRadius } from '../render/zone.js';
import { CLIENT_CONFIG } from '../config.js';

const Z = CLIENT_CONFIG.zoom;
const MARGIN = CLIENT_CONFIG.reveal.mapFitMargin;
const MAP_R = mapRadius(CONFIG.map.playerCap);
const MAP_SPAN = ringFitSpanU(MAP_R, MARGIN);
const VW = 1600;
const VH = 900; // short axis

const OPTS: CameraOptions = {
  defaultSpanU: Z.defaultSpanU,
  closeSpanU: Z.closeSpanU,
  ringFitMargin: MARGIN,
};

/** A camera with the map fed and a ring of radius `r` centred at (cx, cy). */
function mapped(r: number, cx = 0, cy = 0): Camera {
  const cam = new Camera({ ...OPTS });
  cam.setViewport(VW, VH);
  cam.setMapRadius(MAP_R);
  cam.setRing(cx, cy, r);
  return cam;
}

const spanOf = (cam: Camera): number => VH / cam.zoom;

describe('the zoom-OUT limit is the WHOLE MAP (amendment 142)', () => {
  it('premise: the map fit is wider than both the default framing and a closed ring', () => {
    expect(MAP_SPAN).toBeGreaterThan(Z.defaultSpanU);
    expect(ringFitSpanU(MAP_R / 2, MARGIN)).toBeLessThan(MAP_SPAN);
  });

  it('alive: zooming fully out frames 2 × mapRadius × margin, whatever the ring', () => {
    for (const r of [MAP_R, MAP_R / 2, MAP_R / 8, 0]) {
      const cam = mapped(r);
      cam.setUserZoom(0);
      expect(cam.userSpanU, `r ${r}`).toBeCloseTo(MAP_SPAN, 6);
      expect(spanOf(cam), `r ${r}`).toBeCloseTo(MAP_SPAN, 6);
    }
  });

  it('spectate: the same whole-map out limit', () => {
    for (const r of [MAP_R, MAP_R / 3, 0]) {
      const cam = mapped(r);
      expect(cam.spectateZoomLimits).toEqual(cam.userZoomLimits);
      cam.setZoomFactor(0);
      expect(spanOf(cam), `r ${r}`).toBeCloseTo(MAP_SPAN, 6);
    }
  });

  it('the ring closing never pulls a captain at the map fit back in', () => {
    const cam = mapped(MAP_R);
    cam.setUserZoom(0);
    for (const r of [MAP_R * 0.9, MAP_R / 2, MAP_R / 10, 0]) {
      expect(cam.setRing(0, 0, r), `r ${r}`).toBe(false);
      expect(cam.userSpanU, `r ${r}`).toBeCloseTo(MAP_SPAN, 6);
    }
  });

  it('zoomOutSpanU: the map fit, never under the ring fit, falling back to the ring, NaN with neither', () => {
    expect(zoomOutSpanU(MAP_SPAN, MAP_SPAN / 2)).toBe(MAP_SPAN);
    expect(zoomOutSpanU(MAP_SPAN / 2, MAP_SPAN)).toBe(MAP_SPAN);
    expect(zoomOutSpanU(NaN, MAP_SPAN / 2)).toBe(MAP_SPAN / 2);
    expect(zoomOutSpanU(0, MAP_SPAN / 2)).toBe(MAP_SPAN / 2);
    expect(zoomOutSpanU(NaN, NaN)).toBeNaN();
    expect(zoomOutSpanU(-1, Infinity)).toBeNaN();
  });

  it('r → 0 / NaN guards: an unusable map radius falls back to the ring fit; nothing goes non-finite', () => {
    for (const bad of [NaN, -5, Infinity, 0]) {
      const cam = new Camera({ ...OPTS });
      cam.setViewport(VW, VH);
      cam.setMapRadius(bad);
      cam.setRing(0, 0, MAP_R / 2);
      cam.setUserZoom(0);
      expect(cam.userSpanU, `map ${bad}`).toBeCloseTo(ringFitSpanU(MAP_R / 2, MARGIN), 6);
      expect(Number.isFinite(cam.zoom)).toBe(true);
    }
    for (const r of [0, NaN, -5, Infinity]) {
      const cam = mapped(r);
      cam.setUserZoom(0);
      expect(cam.userSpanU, `ring ${r}`).toBeCloseTo(MAP_SPAN, 6); // the map still frames
      expect(cam.zoomDetent, `ring ${r}`).toBe(1); // the waypoint is the default framing
      cam.update(0.05, { x: 100, y: 100 });
      expect(Number.isFinite(cam.center.x) && Number.isFinite(cam.center.y), `ring ${r}`).toBe(true);
    }
  });
});

describe('the live ring fit is a DETENT on the way out (amendment 142)', () => {
  const R = MAP_R / 2;

  it('a key step that would cross it from INSIDE lands exactly on it; the next step continues out', () => {
    const cam = mapped(R);
    const detent = cam.zoomDetent;
    let guard = 0;
    while (cam.userZoom > detent && guard++ < 200) {
      const before = cam.userZoom;
      const free = stepZoom(before, -Z.keyStep);
      cam.setUserZoom(stepZoom(before, -Z.keyStep, detent));
      if (free < detent) expect(cam.userZoom).toBe(detent); // the crossing step
    }
    expect(cam.userZoom).toBe(detent);
    expect(cam.userSpanU).toBeCloseTo(ringFitSpanU(R, MARGIN), 6);
    cam.setUserZoom(stepZoom(cam.userZoom, -Z.keyStep, cam.zoomDetent));
    expect(cam.userZoom).toBeCloseTo(detent * Math.exp(-Z.keyStep), 12);
  });

  it('a key step that would cross it from OUTSIDE lands exactly on it; the next step continues in', () => {
    const cam = mapped(R);
    cam.setUserZoom(0); // the map fit
    const detent = cam.zoomDetent;
    let guard = 0;
    while (cam.userZoom < detent && guard++ < 200) cam.setUserZoom(stepZoom(cam.userZoom, Z.keyStep, detent));
    expect(cam.userZoom).toBe(detent);
    cam.setUserZoom(stepZoom(cam.userZoom, Z.keyStep, cam.zoomDetent));
    expect(cam.userZoom).toBeCloseTo(detent * Math.exp(Z.keyStep), 12);
  });

  it('one wheel event is ONE step: a huge spin from the default lands on the detent, the remainder dropped', () => {
    const cam = mapped(R);
    cam.setUserZoom(stepZoom(1, -100_000 * Z.wheelRate, cam.zoomDetent));
    expect(cam.userZoom).toBe(cam.zoomDetent);
    cam.setUserZoom(stepZoom(cam.userZoom, -100_000 * Z.wheelRate, cam.zoomDetent));
    expect(cam.userSpanU).toBeCloseTo(MAP_SPAN, 6); // the next spin runs on to the map fit
    expect(wheelZoom(1, 100_000, cam.zoomDetent)).toBe(cam.zoomDetent); // the spectate wheel shares it
  });

  it('stepZoom: steps that do not cross, start on the detent, or have no usable detent are free', () => {
    const d = 0.5;
    expect(stepZoom(0.9, -Z.keyStep, d)).toBeCloseTo(0.9 * Math.exp(-Z.keyStep), 12);
    expect(stepZoom(d, -Z.keyStep, d)).toBeCloseTo(d * Math.exp(-Z.keyStep), 12);
    expect(stepZoom(d, Z.keyStep, d)).toBeCloseTo(d * Math.exp(Z.keyStep), 12);
    expect(stepZoom(0.52, -Z.keyStep, d)).toBe(d);
    expect(stepZoom(0.48, Z.keyStep, d)).toBe(d);
    for (const bad of [undefined, NaN, 0, -1, Infinity]) {
      expect(stepZoom(0.52, -Z.keyStep, bad)).toBeCloseTo(0.52 * Math.exp(-Z.keyStep), 12);
    }
    expect(stepZoom(0.52, NaN, d)).toBe(0.52);
  });

  it('the detent moves as the ring closes, and never sits tighter than the default framing', () => {
    let last = Infinity;
    for (const r of [MAP_R, MAP_R * 0.7, MAP_R / 3, MAP_R / 10, 0]) {
      const cam = mapped(r);
      const want = Math.max(Z.defaultSpanU, ringFitSpanU(r, MARGIN));
      expect(cam.detentSpanU, `r ${r}`).toBeCloseTo(want, 6);
      expect(cam.detentSpanU, `r ${r}`).toBeGreaterThanOrEqual(Z.defaultSpanU);
      expect(cam.detentSpanU, `r ${r}`).toBeLessThanOrEqual(last);
      expect(cam.zoomDetent).toBeCloseTo(Z.defaultSpanU / want, 12);
      last = cam.detentSpanU;
    }
    expect(detentSpanU(Z.defaultSpanU, NaN)).toBe(Z.defaultSpanU);
  });

  it('a captain PARKED on the detent rides it as the ring closes; one at the map fit stays on the map', () => {
    const cam = mapped(MAP_R * 0.8);
    cam.setUserZoom(cam.zoomDetent);
    for (const r of [MAP_R * 0.6, MAP_R / 3, MAP_R / 6]) {
      expect(cam.setRing(0, 0, r), `r ${r}`).toBe(true);
      expect(cam.userSpanU, `r ${r}`).toBeCloseTo(ringFitSpanU(r, MARGIN), 6);
    }
    const spec = mapped(MAP_R * 0.8);
    spec.setZoomFactor(spec.zoomDetent);
    spec.setRing(0, 0, MAP_R / 4);
    expect(spanOf(spec)).toBeCloseTo(ringFitSpanU(MAP_R / 4, MARGIN), 6);
    // At the FIRST ring the fit IS the map fit: zoomed fully out is not "parked".
    const first = mapped(MAP_R);
    first.setUserZoom(0);
    first.setRing(0, 0, MAP_R * 0.5);
    expect(first.userSpanU).toBeCloseTo(MAP_SPAN, 6);
  });
});
describe('fog and storm still cover the screen at the map fit (amendment 142)', () => {
  const RING = { x: -MAP_R * 0.35, y: MAP_R * 0.25, r: MAP_R * 0.15 };

  /** Fog.rebake + Fog.update geometry (render/fog.ts): the sprite about the
   *  hull's screen point, the flat strips around it. */
  function fogLayout(cam: Camera, ship: { x: number; y: number }): {
    hole: { x: number; y: number }; holePx: number; left: number; top: number; sw: number; sh: number;
  } {
    const holePx = CONFIG.vision.hullSight * cam.zoom;
    const { w, h, scale } = fogBakeSize(VW, VH, holePx);
    const sw = Math.ceil(w * scale) / scale;
    const sh = Math.ceil(h * scale) / scale;
    const hole = cam.worldToScreen(ship);
    return { hole, holePx, left: Math.round(hole.x - sw / 2), top: Math.round(hole.y - sh / 2), sw, sh };
  }

  // Story 11.8: the hull may be panned OFF screen. Whatever the sprite does not
  // cover is filled flat — so every strip must lie wholly outside the hole, or
  // it would paint fog over water the eye sees.
  it('the baked sprite + frame strips tile the whole screen, and no strip ever reaches into the hole — hull on or off screen', () => {
    for (const span of [Z.closeSpanU, Z.defaultSpanU, MAP_SPAN / 2, MAP_SPAN]) {
      for (let a = 0; a < 12; a++) {
        const ship = { x: Math.cos(a) * MAP_R, y: Math.sin(a) * MAP_R };
        const cam = mapped(RING.r, RING.x, RING.y);
        cam.setUserZoom(Z.defaultSpanU / span);
        cam.update(0.05, ship);
        cam.pan(-Math.cos(a) * MAP_R * 0.8, -Math.sin(a) * MAP_R * 0.8); // toward the far side
        cam.update(0.05, ship);
        const f = fogLayout(cam, ship);
        const strips = fogFrameRects(f.left, f.top, f.sw, f.sh, VW, VH);
        const ix = Math.max(0, Math.min(VW, f.left + f.sw) - Math.max(0, f.left));
        const iy = Math.max(0, Math.min(VH, f.top + f.sh) - Math.max(0, f.top));
        const covered = ix * iy + strips.reduce((s, r) => s + r.w * r.h, 0);
        const tag = `span ${span} a ${a}`;
        expect(covered, tag).toBeCloseTo(VW * VH, 3);
        for (const r of strips) {
          const nx = Math.max(r.x, Math.min(f.hole.x, r.x + r.w));
          const ny = Math.max(r.y, Math.min(f.hole.y, r.y + r.h));
          expect(Math.hypot(nx - f.hole.x, ny - f.hole.y), tag).toBeGreaterThanOrEqual(f.holePx - 1);
        }
      }
    }
  });

  it('the storm fill disc about the ring centre reaches every screen corner at the map fit', () => {
    const cam = mapped(RING.r, RING.x, RING.y);
    cam.setUserZoom(0);
    const ship = { x: MAP_R * 0.9, y: -MAP_R * 0.4 };
    cam.snapTo(ship);
    cam.update(0.05, ship);
    const fillR = fillOuterRadius({
      cur: { cx: RING.x, cy: RING.y },
      camX: cam.center.x,
      camY: cam.center.y,
      zoom: cam.zoom,
      screenW: VW,
      screenH: VH,
      mapRadius: MAP_R,
    });
    for (const c of [{ x: 0, y: 0 }, { x: VW, y: 0 }, { x: 0, y: VH }, { x: VW, y: VH }]) {
      const w = cam.screenToWorld(c);
      expect(Math.hypot(w.x - RING.x, w.y - RING.y)).toBeLessThan(fillR);
    }
  });
});

describe('spectate zoom-out across the detent and at the map limit (amendment 142; Story 11.8 rules)', () => {
  it('a wheel run out stops on the detent on the way, ends on the whole map with the board centred, and never leaves FOLLOW', () => {
    const cam = mapped(MAP_R / 3, 500, -300);
    const hull = { x: 900, y: 400 };
    cam.update(0, hull);
    const s = { x: 1300, y: 200 };
    const seen: number[] = [];
    for (let i = 0; i < 400 && spanOf(cam) < MAP_SPAN - 1e-6; i++) {
      cam.zoomAbout(s.x, s.y, wheelZoom(cam.zoomFactor, 100, cam.zoomDetent));
      cam.update(0, hull);
      seen.push(cam.zoomFactor);
      expect(cam.mode).toBe('follow');
    }
    expect(seen).toContain(cam.zoomDetent);
    expect(spanOf(cam)).toBeCloseTo(MAP_SPAN, 6);
    expect(cam.center.x).toBeCloseTo(0, 6);
    expect(cam.center.y).toBeCloseTo(0, 6);
  });
});
