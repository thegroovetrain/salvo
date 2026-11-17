// STORY 11.8 REVIEW — the strategic camera's regressions, each against a
// MOVING ship (amendment 208's lesson: a parked ship hides follow bugs).
// Spans and radii are inputs to the generating functions, never pinned
// framings: the ring radii below are arbitrary late-game sizes.

import { describe, it, expect } from 'vitest';
import { Camera, ringFitSpanU, stepZoom, type CameraOptions } from '../render/camera.js';
import { followSpectateTarget, type SpectateFollow } from '../render/spectate.js';
import { CLIENT_CONFIG } from '../config.js';

const Z = CLIENT_CONFIG.zoom;
const M = CLIENT_CONFIG.reveal.mapFitMargin;
const MAP_R = 6000;
const VW = 1600;
const VH = 900;

const OPTS: CameraOptions = {
  defaultSpanU: Z.defaultSpanU,
  closeSpanU: Z.closeSpanU,
  ringFitMargin: M,
  homeRadiusPx: CLIENT_CONFIG.camera.homeRadiusPx,
};
const EASED: CameraOptions = { ...OPTS, slideEaseRate: CLIENT_CONFIG.camera.slideEaseRate };

/** A ship at ~30 u/s. */
const sail = (t: number, from = { x: -800, y: 500 }): { x: number; y: number } => ({ x: from.x + 28 * t, y: from.y + 11 * t });

function cam(ringR: number, ringC = { x: 1800, y: -1200 }, opts: CameraOptions = OPTS): Camera {
  const c = new Camera({ ...opts });
  c.setViewport(VW, VH);
  c.setMapRadius(MAP_R);
  c.setRing(ringC.x, ringC.y, ringR);
  return c;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('endgame centering: h = max(R / 2, floor) (fix 1)', () => {
  it('at the default zoom a FOLLOW ship is dead centre whatever the ring has closed to', () => {
    for (const r of [600, 1000, 3500]) {
      const c = cam(r);
      c.setUserZoom(1); // the default framing
      for (let i = 0; i < 90; i++) {
        const ship = sail(i / 30);
        c.update(1 / 30, ship);
        const s = c.worldToScreen(ship);
        expect(s.x, `r ${r} frame ${i}`).toBeCloseTo(VW / 2, 6);
        expect(s.y, `r ${r} frame ${i}`).toBeCloseTo(VH / 2, 6);
      }
    }
  });

  it('spectating, the watched ship is dead centre at the default zoom too', () => {
    for (const r of [600, 1000, 3500]) {
      const c = cam(r);
      c.setSpectating(true);
      for (let i = 0; i < 30; i++) {
        const ship = sail(i / 30);
        c.update(1 / 30, ship);
        expect(dist(c.center, ship), `r ${r}`).toBeLessThan(1e-6);
      }
    }
  });

  it('the drawn centre is continuous in span from the close framing to the whole board, for every ring', () => {
    for (const r of [600, 1000, 3500, MAP_R * 0.8]) {
      const c = cam(r);
      const ship = sail(2);
      let last: { x: number; y: number } | null = null;
      const lo = Z.closeSpanU;
      const hi = c.mapSpanU;
      const steps = 4000;
      for (let i = 0; i <= steps; i++) {
        c.setUserZoom(Z.defaultSpanU / (lo + ((hi - lo) * i) / steps));
        c.update(0, ship);
        // A seam would jump by the ship-to-ring distance (thousands of u);
        // a linear glide moves a few u per fine step.
        if (last !== null) expect(dist(c.center, last), `r ${r} step ${i}`).toBeLessThan(50);
        last = { ...c.center };
      }
      expect(dist(last as { x: number; y: number }, { x: 0, y: 0 })).toBeLessThan(1e-6); // whole board: board centre
    }
  });

  it('zoom-in toward the cursor still holds the world point under it when the ring has closed inside the floor', () => {
    const c = cam(600);
    c.setUserZoom(Z.defaultSpanU / ((c.intelSpanU + c.mapSpanU) / 2)); // mid anchor → board glide
    c.update(0, sail(0));
    const s = { x: 1200, y: 300 };
    const p = c.screenToWorld(s);
    c.zoomUserAbout(s.x, s.y, stepZoom(c.userZoom, Z.keyStep));
    const back = c.worldToScreen(p);
    expect(back.x).toBeCloseTo(s.x, 6);
    expect(back.y).toBeCloseTo(s.y, 6);
    expect(c.mode).toBe('panned');
  });
});

describe('the weight epsilon and the no-op pan (fixes 2 + 3)', () => {
  /** A span whose anchor glide is 1 − 1e-9 complete (float residue at the waypoint). */
  function nearlyComplete(c: Camera): number {
    const R = c.aliveDetentSpanU;
    const h = Math.max(R / 2, c.intelSpanU);
    return h + (1 - 1e-9) * (R - h);
  }

  it('a residue-weight pan is a no-op: FOLLOW stays FOLLOW and the anchor stays on the ship', () => {
    const c = cam(MAP_R * 0.8);
    c.setUserZoom(Z.defaultSpanU / nearlyComplete(c));
    const ship = sail(1);
    c.update(0, ship);
    const before = { ...c.center };
    c.pan(40, -25);
    expect(c.mode).toBe('follow');
    expect(c.anchorPoint).toEqual(ship);
    expect(c.center).toEqual(before);
  });

  it('a residue-weight zoom-in aims at the cursor point itself, never a thrown anchor', () => {
    const c = cam(MAP_R * 0.8);
    const span = nearlyComplete(c);
    c.setUserZoom(Z.defaultSpanU / span);
    c.update(0, sail(1));
    const s = { x: 300, y: 200 };
    const p = c.screenToWorld(s);
    c.zoomUserAbout(s.x, s.y, Z.defaultSpanU / (span * 1.0000000001)); // a sliver in, still past 1 − ε
    expect(dist(c.anchorPoint, p)).toBeLessThan(MAP_R); // inside the board, not flung by 1 / 1e-9
  });

  it('a no-op pan (zero delta, or no anchor say) leaves the reveal framing running', () => {
    const c = cam(MAP_R * 0.8);
    c.beginReveal(MAP_R, M, CLIENT_CONFIG.reveal.zoomRate);
    c.pan(0, 0);
    expect(c.revealing).toBe(true);
    c.tickZoom(0, 0); // arrive at the whole board
    c.pan(100, 100);
    expect(c.revealing).toBe(true);
    expect(c.mode).toBe('follow');
  });
});

describe('respawn returns FOLLOW (fix 4)', () => {
  it('respawnAt: a PANNED camera comes back to FOLLOW on the new hull, which then stays centred under way', () => {
    const c = cam(3500);
    c.update(0, sail(0));
    c.pan(900, 400);
    expect(c.mode).toBe('panned');
    const spawn = { x: 2500, y: 1000 };
    c.respawnAt(spawn);
    expect(c.mode).toBe('follow');
    for (let i = 0; i < 30; i++) {
      const ship = sail(i / 30, spawn);
      c.update(1 / 30, ship);
      expect(dist(c.center, ship)).toBeLessThan(1e-6);
    }
  });
});

describe('spectate target switch glides (fix 6)', () => {
  it('a new watched hull is reached over the eased glide, not a cut; then followed exactly', () => {
    const c = cam(3500, undefined, EASED);
    c.setSpectating(true);
    const follow: SpectateFollow = { id: null };
    const killer = (t: number) => sail(t, { x: -1500, y: 900 });
    const other = (t: number) => sail(t, { x: 1400, y: -700 });
    for (let i = 0; i < 30; i++) followSpectateTarget(c, follow, 'killer', killer(i / 30), 1 / 30);
    const before = { ...c.center };
    const gap = dist(before, other(1));
    followSpectateTarget(c, follow, 'other', other(1), 1 / 30);
    expect(dist(c.center, before)).toBeLessThan(0.25 * gap); // no cut on the switch frame
    for (let i = 1; i < 60; i++) followSpectateTarget(c, follow, 'other', other(1 + i / 30), 1 / 30);
    expect(dist(c.center, other(1 + 59 / 30))).toBeLessThan(0.01 * gap); // arrived, and following
  });

  it('a frame with no sample holds the last anchor (no jump to the origin)', () => {
    const c = cam(3500, undefined, EASED);
    c.setSpectating(true);
    const follow: SpectateFollow = { id: null };
    for (let i = 0; i < 120; i++) followSpectateTarget(c, follow, 'killer', sail(i / 30), 1 / 30); // the first glide settles
    const held = { ...c.center };
    followSpectateTarget(c, follow, 'killer', null, 1 / 30);
    expect(dist(c.center, held)).toBeLessThan(1e-3);
    expect(dist(c.center, { x: 0, y: 0 })).toBeGreaterThan(100);
  });
});

describe('the drawn centre matches this frame\'s zoom (fix 7)', () => {
  it('a reveal tick re-places the centre at once: motion off shows the whole board on its first frame', () => {
    const c = cam(3500);
    c.setSpectating(true);
    c.update(0, sail(1));
    c.beginReveal(MAP_R, M, CLIENT_CONFIG.reveal.zoomRate);
    c.tickZoom(16, 0); // motion: off — arrive
    expect(dist(c.center, { x: 0, y: 0 })).toBeLessThan(1e-6);
  });
});

describe('a key zoom-in with no cursor known stays FOLLOW (fix 8)', () => {
  it('FOLLOW, slide active, cursor unknown: zooms about the ship and stays FOLLOW', () => {
    const c = cam(MAP_R * 0.8);
    const R = c.aliveDetentSpanU;
    c.setUserZoom(Z.defaultSpanU / (0.8 * R)); // mid slide: the ship is off screen centre
    for (let i = 0; i < 20; i++) {
      const ship = sail(i / 30);
      c.update(1 / 30, ship);
      c.zoomUserAbout(NaN, NaN, stepZoom(c.userZoom, Z.keyStep * 0.1));
      expect(c.mode).toBe('follow');
      expect(c.anchorPoint).toEqual(ship);
    }
  });

  it('premise: the ring fit drives that slide (a real ring, not the floor)', () => {
    expect(ringFitSpanU(MAP_R * 0.8, M)).toBeGreaterThan(2 * Z.defaultSpanU);
  });
});
