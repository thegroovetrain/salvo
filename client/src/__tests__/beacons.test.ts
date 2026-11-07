// The radio-beacon render's pure core (render/beacons.ts, Story 10.8) — phase →
// presence, the sink fade, the range ring from CONFIG, the zoom-locked marker,
// the motion-scaled decoration — plus the thin pooled adapter's visibility.
// Numbers come from CONFIG / CLIENT_CONFIG, never pinned.

import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, type BeaconPhase } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  Beacons,
  beaconBodyLook,
  beaconDashed,
  beaconFade,
  beaconNeedsRestroke,
  beaconPulse,
  beaconRingRadiusU,
  markerAlpha,
  markerRadiusU,
  ringAlpha,
} from '../render/beacons.js';
import type { BeaconView } from '../sim/beaconView.js';

const BC = CLIENT_CONFIG.beacons;

function view(phase: BeaconPhase, sink01 = 0, slot = 0): BeaconView {
  return { slot, x: 10, y: 20, phase, rate01: phase === 'afloat' ? 1 : 1 - sink01, sink01, sinkT: 0 };
}

const STEPS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

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

  it('a live marker and ring read stronger than a charted one', () => {
    expect(markerAlpha('afloat')).toBeGreaterThan(markerAlpha('charted'));
    expect(ringAlpha('afloat')).toBeGreaterThan(ringAlpha('charted'));
  });
});

describe('beacon geometry', () => {
  it('the range ring is the shared paying range', () => {
    expect(beaconRingRadiusU()).toBe(CONFIG.beacons.rangeU);
  });

  it('the marker holds a constant screen size when zoomed out, and frames the body when zoomed in', () => {
    const far = 0.05;
    expect(markerRadiusU(far) * far).toBeCloseTo(BC.markerPx, 9);
    const close = 100;
    expect(markerRadiusU(close)).toBeCloseTo(CONFIG.beacons.bodyRadiusU * BC.bodyClearance, 9);
    expect(markerRadiusU(close)).toBeGreaterThan(CONFIG.beacons.bodyRadiusU);
  });

  it('re-strokes only past the zoom throttle, and always when never drawn', () => {
    expect(beaconNeedsRestroke(0, 1)).toBe(true);
    expect(beaconNeedsRestroke(1, 1 + BC.redrawZoomFrac / 2)).toBe(false);
    expect(beaconNeedsRestroke(1, 1 + BC.redrawZoomFrac * 2)).toBe(true);
  });
});

describe('the body on the water', () => {
  it('is absent while only charted and once gone', () => {
    expect(beaconBodyLook(view('charted')).visible).toBe(false);
    expect(beaconBodyLook(view('gone', 1)).visible).toBe(false);
  });

  it('is whole and full-size afloat', () => {
    expect(beaconBodyLook(view('afloat'))).toEqual({ visible: true, alpha: 1, scale: 1 });
  });

  it('settles and fades monotonically across the sink, ending at the ship wreck scale', () => {
    const looks = STEPS.map((s) => beaconBodyLook(view('sinking', s)));
    for (let i = 1; i < looks.length; i++) {
      expect(looks[i].alpha).toBeLessThan(looks[i - 1].alpha);
      expect(looks[i].scale).toBeLessThanOrEqual(looks[i - 1].scale);
    }
    expect(looks[looks.length - 1].alpha).toBe(0);
    expect(looks[looks.length - 1].scale).toBeCloseTo(CLIENT_CONFIG.ship.sunkScale, 9);
  });
});

describe('the transmission pulse is decoration only', () => {
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
});

describe('Beacons adapter', () => {
  function layers(): { chart: Container; world: Container; b: Beacons } {
    const chart = new Container();
    const world = new Container();
    return { chart, world, b: new Beacons(chart, world) };
  }

  it('a charted beacon draws on the chart only; an afloat one on the chart and the water', () => {
    const { chart, world, b } = layers();
    b.render([view('charted', 0, 0), view('afloat', 0, 1)], 0, 1, 0);
    expect(chart.children.map((c) => c.visible)).toEqual([true, true]);
    expect(world.children.map((c) => c.visible)).toEqual([false, true]);
    expect(chart.children[0].position).toMatchObject({ x: 10, y: 20 });
  });

  it('a slot no longer in the set hides (pooled, not destroyed)', () => {
    const { chart, world, b } = layers();
    b.render([view('afloat', 0, 0), view('afloat', 0, 1)], 0, 1, 0);
    b.render([view('afloat', 0, 1)], 0, 1, 0);
    expect(chart.children).toHaveLength(2);
    expect(chart.children.map((c) => c.visible)).toEqual([false, true]);
    expect(world.children.map((c) => c.visible)).toEqual([false, true]);
  });

  it('a sinking beacon fades on the chart by its sink progress', () => {
    const { chart, b } = layers();
    b.render([view('sinking', 0.25, 0)], 0, 1, 0);
    expect(chart.children[0].alpha).toBeCloseTo(beaconFade(view('sinking', 0.25)), 9);
  });
});
