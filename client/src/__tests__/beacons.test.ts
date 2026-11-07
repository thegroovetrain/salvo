// The radio-beacon render's pure core (render/beacons.ts, Story 10.8) — the
// buoy art whose hull IS the shared hit octagon, phase → presence, the sink
// settle and fade, the chart-icon handover, the range ring from CONFIG, the
// motion-scaled decoration — plus the thin pooled adapter's visibility.
// Numbers come from CONFIG / CLIENT_CONFIG, never pinned.

import { describe, expect, it } from 'vitest';
import { Container, type Graphics } from 'pixi.js';
import { CONFIG, beaconPolygon, type BeaconPhase } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  Beacons,
  beaconArt,
  beaconDashed,
  beaconFade,
  beaconGhostArt,
  beaconIconPx,
  beaconIconShown,
  beaconNeedsRestroke,
  beaconPulse,
  beaconPulseRadiusU,
  beaconRingRadiusU,
  beaconSettle,
  beaconTruePx,
  dashPolyline,
  markerAlpha,
  ringAlpha,
  type ArtPrim,
} from '../render/beacons.js';
import type { BeaconView } from '../sim/beaconView.js';

const BC = CLIENT_CONFIG.beacons;
const R = CONFIG.beacons.bodyRadiusU;

function view(phase: BeaconPhase, sink01 = 0, slot = 0): BeaconView {
  return { slot, x: 10, y: 20, phase, rate01: phase === 'afloat' ? 1 : 1 - sink01, sink01, sinkT: 0 };
}

const STEPS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

/** Every point a primitive covers, sampled (circles at their extremes). */
function reach(p: ArtPrim): number {
  if (p.kind === 'circle') return Math.hypot(p.c.x, p.c.y) + p.r;
  return Math.max(...p.pts.map((q) => Math.hypot(q.x, q.y)));
}

describe('beacon presence by phase', () => {
  it('only a charted beacon is drawn dashed (a signal, nothing in the water)', () => {
    expect(beaconDashed('charted')).toBe(true);
    for (const p of ['afloat', 'sinking', 'gone'] as const) expect(beaconDashed(p)).toBe(false);
  });

  it('charted and afloat are fully present; gone is absent', () => {
    expect(beaconFade(view('charted'))).toBe(1);
    expect(beaconFade(view('afloat'))).toBe(1);
    expect(beaconFade(view('gone', 1))).toBe(0);
  });

  it('the sink fade falls monotonically with sink01, from full to nothing', () => {
    const fades = STEPS.map((s) => beaconFade(view('sinking', s)));
    expect(fades[0]).toBe(1);
    expect(fades[fades.length - 1]).toBe(0);
    for (let i = 1; i < fades.length; i++) expect(fades[i]).toBeLessThan(fades[i - 1]);
  });

  it('a live icon and ring read stronger than a charted one', () => {
    expect(markerAlpha('afloat')).toBeGreaterThan(markerAlpha('charted'));
    expect(ringAlpha('afloat')).toBeGreaterThan(ringAlpha('charted'));
  });

  it('the range ring is the shared paying range', () => {
    expect(beaconRingRadiusU()).toBe(CONFIG.beacons.rangeU);
  });
});

describe('the buoy art: what you see is the hitbox', () => {
  it('the hull outline is the shared beaconPolygon, vertex for vertex', () => {
    const hull = beaconArt(R)[0];
    expect(hull.part).toBe('hull');
    expect(hull.kind === 'poly' && hull.closed).toBe(true);
    if (hull.kind !== 'poly') return;
    expect(hull.pts.map((p) => [p.x, p.y])).toEqual(beaconPolygon(0, 0).map((p) => [p.x, p.y]));
  });

  it('nothing in the art reaches past the hull edge', () => {
    const inradius = R * Math.cos(Math.PI / 8);
    for (const p of beaconArt(R).slice(1)) expect(reach(p)).toBeLessThanOrEqual(inradius + 1e-9);
  });

  it('is filled (opaque hull) on the water; the charted ghost has no fill but the light', () => {
    expect(beaconArt(R)[0].fill).not.toBeNull();
    const ghost = beaconGhostArt(R);
    expect(ghost[0].part).toBe('hull');
    for (const p of ghost) expect(p.fill === null || p.part === 'lamp').toBe(true);
  });

  it('scales with the radius it is drawn at, and the light keeps its floor', () => {
    const a = beaconArt(1);
    const b = beaconArt(3);
    a.forEach((p, i) => expect(reach(b[i])).toBeCloseTo(reach(p) * 3, 9));
    const lamp = beaconArt(1, 0.5).find((p) => p.part === 'lamp');
    expect(lamp?.kind === 'circle' && lamp.r).toBe(0.5);
  });

  it('dashes a polyline into pieces no longer than the dash, inking about dash/(dash+gap) of it', () => {
    const line: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 7],
    ];
    const dashes = dashPolyline(line, 1, 0.5);
    const len = (d: number[][]): number => d.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - d[i][0], p[1] - d[i][1]), 0);
    for (const d of dashes) expect(len(d)).toBeLessThanOrEqual(1 + 1e-9);
    const inked = dashes.reduce((s, d) => s + len(d), 0);
    expect(inked / 17).toBeCloseTo(1 / 1.5, 1);
    expect(dashPolyline(line, 0, 0.5)).toEqual([line]);
  });

  it('re-strokes only past the zoom throttle, and always when never drawn', () => {
    expect(beaconNeedsRestroke(0, 1)).toBe(true);
    expect(beaconNeedsRestroke(1, 1 + BC.redrawZoomFrac / 2)).toBe(false);
    expect(beaconNeedsRestroke(1, 1 + BC.redrawZoomFrac * 2)).toBe(true);
  });
});

describe('the handover: never an icon on top of the buoy', () => {
  const threshold = BC.iconPx / (2 * R); // the zoom at which the true buoy is icon-sized

  it('the true size is the body diameter on screen', () => {
    expect(beaconTruePx(threshold)).toBeCloseTo(BC.iconPx, 9);
    expect(beaconTruePx(2)).toBeCloseTo(4 * R, 9);
  });

  it('in the water, the icon shows below the threshold zoom and hides at and past it', () => {
    for (const phase of ['afloat', 'sinking'] as const) {
      expect(beaconIconShown(phase, threshold * 0.99)).toBe(true);
      expect(beaconIconShown(phase, threshold)).toBe(false);
      expect(beaconIconShown(phase, threshold * 4)).toBe(false);
    }
  });

  it('while only charted the icon shows at every zoom; once gone, never', () => {
    for (const z of [threshold / 10, threshold, threshold * 10]) {
      expect(beaconIconShown('charted', z)).toBe(true);
      expect(beaconIconShown('gone', z)).toBe(false);
    }
  });

  it('follows the body size and the icon size it is handed', () => {
    expect(beaconIconShown('afloat', threshold, R * 2)).toBe(false);
    expect(beaconIconShown('afloat', threshold, R / 2)).toBe(true);
    expect(beaconIconShown('afloat', threshold, R, BC.iconPx * 2)).toBe(true);
  });

  it('the icon is never drawn smaller than the true buoy', () => {
    for (const z of [threshold / 4, threshold, threshold * 3]) {
      expect(beaconIconPx(z)).toBeGreaterThanOrEqual(beaconTruePx(z));
      expect(beaconIconPx(z)).toBeGreaterThanOrEqual(BC.iconPx);
    }
  });
});

describe('the settle on the water', () => {
  it('is absent while only charted and once gone', () => {
    expect(beaconSettle(view('charted')).visible).toBe(false);
    expect(beaconSettle(view('gone', 1)).visible).toBe(false);
  });

  it('is whole and full-size afloat', () => {
    expect(beaconSettle(view('afloat'))).toMatchObject({ visible: true, alpha: 1, scale: 1 });
  });

  it('settles and fades monotonically across the sink, ending at the ship wreck scale', () => {
    const looks = STEPS.map((s) => beaconSettle(view('sinking', s)));
    for (let i = 1; i < looks.length; i++) {
      expect(looks[i].alpha).toBeLessThan(looks[i - 1].alpha);
      expect(looks[i].scale).toBeLessThanOrEqual(looks[i - 1].scale);
    }
    expect(looks[looks.length - 1].alpha).toBe(0);
    expect(looks[looks.length - 1].scale).toBeCloseTo(CLIENT_CONFIG.ship.sunkScale, 9);
    expect(looks[looks.length - 1].tint).not.toBe(looks[0].tint);
  });
});

describe('the broadcast pulse is decoration only', () => {
  it('is absent at motion intensity 0 in every phase', () => {
    for (const p of ['charted', 'afloat', 'sinking', 'gone'] as const) {
      expect(beaconPulse(500, view(p, 0.5), 0).alpha).toBe(0);
    }
  });

  it('is absent while only charted (nothing transmits yet)', () => {
    expect(beaconPulse(500, view('charted'), 1).alpha).toBe(0);
  });

  it('scales with the motion intensity and never touches presence', () => {
    const full = beaconPulse(500, view('afloat'), 1);
    const half = beaconPulse(500, view('afloat'), 0.5);
    expect(full.alpha).toBeGreaterThan(0);
    expect(half.alpha).toBeCloseTo(full.alpha / 2, 9);
    expect(beaconFade(view('afloat'))).toBe(1);
  });

  it('carries the sink fade', () => {
    expect(beaconPulse(500, view('sinking', 0.5), 1).alpha).toBeLessThan(beaconPulse(500, view('afloat'), 1).alpha);
  });

  it('grows from the edge of whatever is drawn — the icon while it shows, else the hull', () => {
    const zoom = 0.5;
    const p = { px: 0, alpha: 1 };
    expect(beaconPulseRadiusU(p, zoom, false)).toBeCloseTo(R, 9);
    expect(beaconPulseRadiusU(p, zoom, true)).toBeCloseTo(beaconIconPx(zoom) / 2 / zoom, 9);
    expect(beaconPulseRadiusU({ px: 10, alpha: 1 }, zoom, false)).toBeCloseTo(R + 10 / zoom, 9);
  });
});

describe('Beacons adapter', () => {
  function layers(): { chart: Container; world: Container; b: Beacons } {
    const chart = new Container();
    const world = new Container();
    return { chart, world, b: new Beacons(chart, world) };
  }
  /** chart children per slot: [ring, icon]; world children per slot: [body, pulse]. */
  const icons = (chart: Container): Graphics[] => chart.children.filter((_, i) => i % 2 === 1) as Graphics[];
  const rings = (chart: Container): Graphics[] => chart.children.filter((_, i) => i % 2 === 0) as Graphics[];
  const bodies = (world: Container): Graphics[] => world.children.filter((_, i) => i % 2 === 0) as Graphics[];
  const farZoom = BC.iconPx / (2 * R) / 4;
  const nearZoom = (BC.iconPx / (2 * R)) * 4;

  it('a charted beacon draws on the chart only; an afloat one on the water too', () => {
    const { chart, world, b } = layers();
    b.render([view('charted', 0, 0), view('afloat', 0, 1)], 0, farZoom, 0);
    expect(rings(chart).map((c) => c.visible)).toEqual([true, true]);
    expect(bodies(world).map((c) => c.visible)).toEqual([false, true]);
    expect(rings(chart)[0].position).toMatchObject({ x: 10, y: 20 });
  });

  it('hands the afloat icon over to the true-size buoy when zoomed in; the ring stays', () => {
    const { chart, world, b } = layers();
    b.render([view('afloat')], 0, farZoom, 0);
    expect(icons(chart)[0].visible).toBe(true);
    b.render([view('afloat')], 0, nearZoom, 0);
    expect(icons(chart)[0].visible).toBe(false);
    expect(rings(chart)[0].visible).toBe(true);
    expect(bodies(world)[0].visible).toBe(true);
  });

  it('a slot no longer in the set hides (pooled, not destroyed)', () => {
    const { chart, world, b } = layers();
    b.render([view('afloat', 0, 0), view('afloat', 0, 1)], 0, farZoom, 0);
    b.render([view('afloat', 0, 1)], 0, farZoom, 0);
    expect(chart.children).toHaveLength(4);
    expect(rings(chart).map((c) => c.visible)).toEqual([false, true]);
    expect(bodies(world).map((c) => c.visible)).toEqual([false, true]);
  });

  it('a sinking beacon fades on the chart and the water by its sink progress', () => {
    const { chart, world, b } = layers();
    b.render([view('sinking', 0.25, 0)], 0, farZoom, 0);
    expect(rings(chart)[0].alpha).toBeCloseTo(beaconFade(view('sinking', 0.25)), 9);
    expect(bodies(world)[0].alpha).toBeCloseTo(beaconSettle(view('sinking', 0.25)).alpha, 9);
  });
});
