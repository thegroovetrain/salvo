// The REVEAL framing mode + the game's first animated zoom (Story 5.3,
// epic-5 amendments 25/26). The spectate clamp's own tests live in
// spectate.test.ts and camera.test.ts and are deliberately untouched — this
// file only covers the mode that is EXEMPT from that clamp, and proves the
// clamp still governs the moment the mode is released.

import { describe, it, expect } from 'vitest';
import { Camera, revealZoomFactor, SPECTATE_ZOOM_MIN } from '../render/camera.js';
import { wheelZoom, spectatePan } from '../render/spectate.js';
import { CLIENT_CONFIG } from '../config.js';
import { motionIntensity } from '../settings/store.js';

const RADAR = 660;
const MAP_RADIUS = 2400;

function makeCamera(radarRange = RADAR): Camera {
  const c = new Camera({ radarRange, followRate: 5, leadSeconds: 4, leadMax: 110 });
  c.setViewport(1600, 900); // short axis 900
  return c;
}

/** Drive the animation to convergence (5s of 60fps frames). */
function settle(cam: Camera, motionScale: number): void {
  for (let i = 0; i < 300; i++) cam.tickZoom(1000 / 60, motionScale);
}

describe('revealZoomFactor — derived from the radar fit, never a literal', () => {
  it('swaps the radar-diameter fit for the map-diameter fit', () => {
    // baseZoom fits 2*radarRange; the map is 2*mapRadius across, so the factor
    // is radarRange / (mapRadius * margin) — ~0.275 at the shipped numbers.
    expect(revealZoomFactor(RADAR, MAP_RADIUS, 1)).toBeCloseTo(1320 / 4800, 12);
    expect(revealZoomFactor(RADAR, MAP_RADIUS, 1)).toBeCloseTo(0.275, 12);
  });

  it('tracks a CHANGED map radius (Story 6.2 makes map sizing roster-dynamic)', () => {
    const small = revealZoomFactor(RADAR, 1200, 1);
    const big = revealZoomFactor(RADAR, 4800, 1);
    expect(small).toBeCloseTo(0.55, 12); // half the map => twice the factor
    expect(big).toBeCloseTo(0.1375, 12);
    expect(big).toBeLessThan(small);
  });

  it('tracks a CHANGED radar range (a radarRange upgrade moves the base fit)', () => {
    // A wider radar means baseZoom is already further out, so LESS extra
    // pull-back is needed to reach the same world framing.
    expect(revealZoomFactor(RADAR * 1.15, MAP_RADIUS, 1)).toBeCloseTo((0.275 * 1.15), 12);
  });

  it('leaves a border for the margin, and is monotonic in it', () => {
    const flush = revealZoomFactor(RADAR, MAP_RADIUS, 1);
    const bordered = revealZoomFactor(RADAR, MAP_RADIUS, CLIENT_CONFIG.reveal.mapFitMargin);
    expect(CLIENT_CONFIG.reveal.mapFitMargin).toBeGreaterThan(1);
    expect(bordered).toBeLessThan(flush); // further out => the disc has room
  });

  it('returns the plain base framing (1) for degenerate inputs — never NaN', () => {
    expect(revealZoomFactor(NaN, MAP_RADIUS, 1)).toBe(1);
    expect(revealZoomFactor(RADAR, 0, 1)).toBe(1);
    expect(revealZoomFactor(RADAR, MAP_RADIUS, 0)).toBe(1);
    expect(revealZoomFactor(RADAR, Infinity, 1)).toBe(1);
    expect(revealZoomFactor(-1, MAP_RADIUS, 1)).toBe(1);
  });
});

describe('Camera reveal framing — the whole ocean in frame', () => {
  it('beginReveal uses the camera OWN radarRange, and the settled view fits the map', () => {
    const cam = makeCamera();
    cam.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    settle(cam, 1);
    // World units across the short axis = the map diameter, exactly.
    expect(900 / cam.zoom).toBeCloseTo(2 * MAP_RADIUS, 6);
    // ...and half the map disc is inside the half-extent (worldView is the
    // radar buffer's only input, so it must agree).
    expect(cam.worldView.halfH).toBeCloseTo(MAP_RADIUS, 6);
  });

  it('follows a radarRange upgrade taken BEFORE the reveal', () => {
    const cam = makeCamera();
    cam.setRadarRange(RADAR * 1.15);
    cam.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    settle(cam, 1);
    expect(cam.zoomFactor).toBeCloseTo(0.275 * 1.15, 10);
    // The COMPOSED zoom is the same world framing either way — the base fit and
    // the factor move in opposite directions by construction.
    expect(900 / cam.zoom).toBeCloseTo(2 * MAP_RADIUS, 6);
  });

  it('is EXEMPT from the spectate clamp (amendment 25) — it settles below 0.5x', () => {
    const cam = makeCamera();
    cam.beginReveal(MAP_RADIUS, CLIENT_CONFIG.reveal.mapFitMargin, CLIENT_CONFIG.reveal.zoomRate);
    settle(cam, 1);
    expect(cam.zoomFactor).toBeLessThan(SPECTATE_ZOOM_MIN);
    expect(cam.zoomFactor).toBeCloseTo(RADAR / (MAP_RADIUS * CLIENT_CONFIG.reveal.mapFitMargin), 10);
  });

  it('survives a resize: the factor is viewport-independent, the framing is not', () => {
    const cam = makeCamera();
    cam.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    settle(cam, 1);
    const factor = cam.zoomFactor;
    cam.setViewport(800, 1200); // short axis 800 now
    expect(cam.zoomFactor).toBe(factor);
    expect(800 / cam.zoom).toBeCloseTo(2 * MAP_RADIUS, 6);
  });

  it('ignores a degenerate target or rate rather than poisoning the zoom', () => {
    const cam = makeCamera();
    const before = cam.zoom;
    cam.setRevealTarget(NaN, CLIENT_CONFIG.reveal.zoomRate);
    cam.setRevealTarget(0.3, 0);
    cam.setRevealTarget(0.3, NaN);
    expect(cam.revealing).toBe(false);
    settle(cam, 1);
    expect(cam.zoom).toBe(before);
  });
});

describe('The animated zoom + the motion setting (amendment 26 — NOT exempt)', () => {
  it('animates rather than jumping at motion: full', () => {
    const cam = makeCamera();
    const start = cam.zoomFactor; // 1
    cam.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    cam.tickZoom(1000 / 60, motionIntensity('full'));
    const after1 = cam.zoomFactor;
    expect(after1).toBeLessThan(start); // moving out
    expect(after1).toBeGreaterThan(0.275); // but nowhere near arrived
    settle(cam, motionIntensity('full'));
    expect(cam.zoomFactor).toBeCloseTo(0.275, 6);
  });

  it('reduced scales the DURATION, never the destination (half the time)', () => {
    const full = makeCamera();
    const reduced = makeCamera();
    full.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    reduced.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    // Same elapsed time: reduced is further along...
    for (let i = 0; i < 20; i++) {
      full.tickZoom(1000 / 60, motionIntensity('full'));
      reduced.tickZoom(1000 / 60, motionIntensity('reduced'));
    }
    expect(reduced.zoomFactor).toBeLessThan(full.zoomFactor);
    // ...specifically, reduced at t == full at 2t (rate = base / scale).
    const half = makeCamera();
    half.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    for (let i = 0; i < 40; i++) half.tickZoom(1000 / 60, motionIntensity('full'));
    expect(half.zoomFactor).toBeCloseTo(reduced.zoomFactor, 9);
    // ...and both land on the identical framing.
    settle(full, motionIntensity('full'));
    settle(reduced, motionIntensity('reduced'));
    expect(reduced.zoomFactor).toBeCloseTo(full.zoomFactor, 12);
  });

  it('motion: off SNAPS on the first frame — the identical view, no travel', () => {
    const animated = makeCamera();
    const snapped = makeCamera();
    animated.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    snapped.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    // One frame at `off` is the whole animation.
    snapped.tickZoom(1000 / 60, motionIntensity('off'));
    expect(snapped.zoomFactor).toBeCloseTo(0.275, 12);
    // "off removes motion, never information": same destination as `full`.
    settle(animated, motionIntensity('full'));
    expect(snapped.zoomFactor).toBeCloseTo(animated.zoomFactor, 6);
    expect(snapped.zoom).toBeCloseTo(animated.zoom, 9);
  });

  it('snaps even on a zero-length first frame (dt 0 still arrives at off)', () => {
    const cam = makeCamera();
    cam.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    cam.tickZoom(0, motionIntensity('off'));
    expect(cam.zoomFactor).toBeCloseTo(0.275, 12);
  });

  it('is a no-op when the reveal mode is off, and tolerates a junk dt', () => {
    const cam = makeCamera();
    const before = cam.zoomFactor;
    cam.tickZoom(16, 1);
    expect(cam.zoomFactor).toBe(before);
    cam.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    cam.tickZoom(NaN, 1); // a first-frame dt from an unstarted clock
    expect(cam.zoomFactor).toBe(before); // treated as 0 elapsed, never NaN
    expect(Number.isFinite(cam.zoom)).toBe(true);
  });

  it('settles EXACTLY on the target so the factor stops changing', () => {
    const cam = makeCamera();
    cam.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    settle(cam, 1);
    const settled = cam.zoomFactor;
    cam.tickZoom(1000 / 60, 1);
    expect(cam.zoomFactor).toBe(settled); // no forever-twitching sixth decimal
  });
});

describe('Manual input releases the reveal — then the clamp governs again', () => {
  it('a wheel notch releases the mode and the [0.5, 1] clamp takes over', () => {
    const cam = makeCamera();
    cam.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    settle(cam, 1);
    expect(cam.revealing).toBe(true);

    // The real wheel path: wheelZoom() off the live factor, into setZoomFactor.
    cam.setZoomFactor(wheelZoom(cam.zoomFactor, 250));
    expect(cam.revealing).toBe(false);
    // LEDGERED POP (amendment 25): 0.275 -> the clamp floor, accepted.
    expect(cam.zoomFactor).toBe(SPECTATE_ZOOM_MIN);

    // Ticking after release must not drag the camera back out.
    settle(cam, 1);
    expect(cam.zoomFactor).toBe(SPECTATE_ZOOM_MIN);
    // ...and the untouched clamp still governs both ends.
    cam.setZoomFactor(0.1);
    expect(cam.zoomFactor).toBe(SPECTATE_ZOOM_MIN);
    cam.setZoomFactor(7);
    expect(cam.zoomFactor).toBe(1);
  });

  it('a free-pan releases the mode but does NOT move the zoom', () => {
    const cam = makeCamera();
    cam.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    settle(cam, 1);
    const framing = cam.zoomFactor;

    const d = spectatePan({ throttle: 1, rudder: 0 }, 0.1, cam.zoomFactor);
    cam.pan(d.dx, d.dy);
    expect(cam.revealing).toBe(false);
    expect(cam.zoomFactor).toBe(framing); // a pan is not a zoom: nothing jumps
    settle(cam, 1);
    expect(cam.zoomFactor).toBe(framing); // and it stays put
  });

  it('resetZoomFactor (respawn / rejoin) leaves the mode too', () => {
    const cam = makeCamera();
    cam.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    settle(cam, 1);
    cam.resetZoomFactor();
    expect(cam.revealing).toBe(false);
    expect(cam.zoomFactor).toBe(1);
    settle(cam, 1);
    expect(cam.zoomFactor).toBe(1);
  });

  it('the reveal never touches the alive user-zoom clamp', () => {
    const cam = makeCamera();
    cam.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    settle(cam, 1);
    cam.setUserZoom(0.1);
    expect(cam.userZoom).toBe(0.5); // USER_ZOOM_MIN, unmoved
    cam.setUserZoom(99);
    expect(cam.userZoom).toBe(1.5); // USER_ZOOM_MAX, unmoved
  });
});

describe('CLIENT_CONFIG.reveal', () => {
  it('derives the easing rate from the authored duration (one number to tune)', () => {
    expect(CLIENT_CONFIG.reveal.zoomRate).toBeCloseTo(3 / (CLIENT_CONFIG.reveal.zoomMs / 1000), 12);
    expect(CLIENT_CONFIG.reveal.zoomRate).toBeGreaterThan(0);
  });

  it('the authored duration is what the animation actually takes at motion: full', () => {
    const cam = makeCamera();
    cam.beginReveal(MAP_RADIUS, 1, CLIENT_CONFIG.reveal.zoomRate);
    const frames = Math.round(CLIENT_CONFIG.reveal.zoomMs / (1000 / 60));
    for (let i = 0; i < frames; i++) cam.tickZoom(1000 / 60, motionIntensity('full'));
    // 3 time constants in: ~95% of the travel from 1 to 0.275 is done.
    const done = (1 - cam.zoomFactor) / (1 - 0.275);
    expect(done).toBeGreaterThan(0.94);
    expect(done).toBeLessThan(0.97);
  });
});
