// ON FIRE (render/fire.ts, cycle 162, Eric 2026-10-01: "some kind of 'on fire'
// effect for a ship under 25%"). The flames ride the tier-2 `sm` pulse only, and
// they are INFORMATION like smoke (epic-4 amendment 49): presence, extent and tier are
// motion-blind; only the flicker and the rise scale with the motion setting.

import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import type { SmokeEvent } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  FLAME_DRAW_RADIUS,
  Fire,
  flameAlpha,
  flameFlicker,
  flameRadius,
  flameRise,
  flameSpawnTimes,
  flameTongue,
} from '../render/fire.js';
import { motionIntensity, settings } from '../settings/store.js';

const F = CLIENT_CONFIG.fire;
const LIFE = F.lifeMs;

describe('the tier gate — fire is the under-25 % tier and nothing else', () => {
  it('a tier-1 pulse spawns no flames; a tier-2 pulse spawns `fire.flames`', () => {
    expect(flameSpawnTimes(1000, 1)).toEqual([]);
    expect(flameSpawnTimes(1000, 2)).toHaveLength(F.flames);
    const fire = new Fire(new Container());
    fire.onSmoke({ k: 'sm', x: 0, y: 0, tier: 1 }, 1000);
    expect(fire.liveFlames).toBe(0);
    fire.onSmoke({ k: 'sm', x: 0, y: 0, tier: 2 }, 1000);
    expect(fire.liveFlames).toBe(F.flames);
  });

  it('back-dates the extra tongues by `stagger` on the server clock', () => {
    const ts = flameSpawnTimes(5000, 2);
    for (let i = 0; i < ts.length; i++) expect(ts[i]).toBe(5000 - i * F.stagger);
  });

  it('spawns AND renders full-sized at EVERY motion level — no motion gate', () => {
    const prev = settings.current.motion;
    try {
      for (const motion of ['full', 'reduced', 'off'] as const) {
        settings.set({ motion });
        const fire = new Fire(new Container());
        fire.onSmoke({ k: 'sm', x: 5, y: 6, tier: 2 }, 1000);
        fire.render(1000 + LIFE / 2);
        expect(fire.liveFlames, motion).toBe(F.flames);
      }
    } finally {
      settings.set({ motion: prev });
    }
  });
});

describe('flameAlpha — blooms in, fades out, dead at a full life', () => {
  it('is 0 at and after a full life', () => {
    expect(flameAlpha(LIFE, LIFE, F.peakAlpha)).toBe(0);
    expect(flameAlpha(LIFE * 3, LIFE, F.peakAlpha)).toBe(0);
  });

  it('is continuous at the origin: a jitter-negative age reads exactly newborn (smoke.ts clamp rule)', () => {
    const atZero = flameAlpha(0, LIFE, F.peakAlpha);
    expect(flameAlpha(-40, LIFE, F.peakAlpha)).toBe(atZero);
    expect(flameAlpha(-10_000, LIFE, F.peakAlpha)).toBe(atZero);
    expect(flameAlpha(LIFE * 0.05, LIFE, F.peakAlpha)).toBeGreaterThan(atZero);
  });

  it('peaks at the top of the bloom-in ramp and never exceeds `peakAlpha`', () => {
    let max = 0;
    for (let a = 0; a <= LIFE; a += 5) max = Math.max(max, flameAlpha(a, LIFE, F.peakAlpha));
    expect(max).toBeLessThanOrEqual(F.peakAlpha);
    expect(max).toBeGreaterThan(F.peakAlpha * 0.8);
  });
});

describe('flameRadius — the tongue grows over its life', () => {
  it('runs r0 at birth to r1 at death, monotonic and clamped', () => {
    expect(flameRadius(0, LIFE, F.r0, F.r1)).toBe(F.r0);
    expect(flameRadius(LIFE, LIFE, F.r0, F.r1)).toBe(F.r1);
    expect(flameRadius(LIFE * 4, LIFE, F.r0, F.r1)).toBe(F.r1);
    let prev = -Infinity;
    for (let a = 0; a <= LIFE; a += 10) {
      const r = flameRadius(a, LIFE, F.r0, F.r1);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
});

describe("motion: 'off' removes MOTION, never INFORMATION", () => {
  const off = motionIntensity('off');

  it('flicker is exactly 1 at intensity 0 — a still flame at its true strength and width', () => {
    for (const age of [0, 37, 120, 333, 599]) expect(flameFlicker(age, off, 0.4)).toBe(1);
  });

  it('flicker stays inside ±flickerAmp at full motion', () => {
    const full = motionIntensity('full');
    for (let a = 0; a < LIFE; a += 7) {
      expect(Math.abs(flameFlicker(a, full, 0.2) - 1)).toBeLessThanOrEqual(F.flickerAmp + 1e-12);
    }
  });

  it('rise is 0 at intensity 0 and points UP the screen (−y) when motion is on', () => {
    const still = flameRise(500, off);
    expect(still.dx === 0 && still.dy === 0).toBe(true); // -0 safe
    const up = flameRise(500, motionIntensity('full'));
    expect(up.dx).toBe(0);
    expect(up.dy).toBeLessThan(0);
  });
});

describe('the adapter — pooled, capped, retired on age', () => {
  it('caps live tongues at `maxFlames`, oldest first', () => {
    const fire = new Fire(new Container());
    const e: SmokeEvent = { k: 'sm', x: 10, y: 20, tier: 2 };
    for (let i = 0; i < F.maxFlames; i++) fire.onSmoke(e, 1000 + i);
    expect(fire.liveFlames).toBe(F.maxFlames);
  });

  it('retires on AGE (a negative-age first frame survives), and clear() drops all', () => {
    const fire = new Fire(new Container());
    fire.onSmoke({ k: 'sm', x: 0, y: 0, tier: 2 }, 10_000);
    fire.render(10_000 - 30);
    expect(fire.liveFlames).toBe(F.flames);
    fire.render(10_000 + LIFE + F.stagger * F.flames + 1);
    expect(fire.liveFlames).toBe(0);
    fire.onSmoke({ k: 'sm', x: 0, y: 0, tier: 2 }, 20_000);
    fire.clear();
    expect(fire.liveFlames).toBe(0);
  });

  it('sits at the BOTTOM of its layer, under every puff added before or after', () => {
    const layer = new Container();
    const before = new Container();
    layer.addChild(before);
    new Fire(layer);
    expect(layer.getChildIndex(before)).toBe(1);
  });

  it('draws a closed teardrop whose point is straight up at 2r', () => {
    const pts = flameTongue(FLAME_DRAW_RADIUS);
    expect(pts[0]).toBe(0);
    expect(pts[1]).toBe(-2 * FLAME_DRAW_RADIUS);
    for (let i = 2; i < pts.length; i += 2) {
      expect(Math.hypot(pts[i], pts[i + 1])).toBeCloseTo(FLAME_DRAW_RADIUS, 9);
    }
  });
});
