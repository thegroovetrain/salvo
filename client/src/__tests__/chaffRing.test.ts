// THE CHAFF OWNER'S RING (cycle 158, Eric 2026-09-30, epic-8 amendment 191) —
// render/chaffRing.ts. *"I don't want to see the false radar information the
// chaff is creating, but i do want *SOME* indication that chaff has been used in
// an area."* One dim phosphor DASHED circle of `CONFIG.chaff.radius` around the
// owner's self-private `you.chaff` point, fading to nothing at its `until`.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Container } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { CHAFF_RING_RADIUS, ChaffRing, chaffDashFraction, chaffDashSegments, chaffRingAlpha } from '../render/chaffRing.js';

const K = CLIENT_CONFIG.chaffRing;
const D = CONFIG.chaff.durationMs;

describe('chaffRingAlpha — a function of server time, nothing else', () => {
  it('is the base alpha on a fresh cloud, half at half-life, 0 at expiry', () => {
    const until = 100_000;
    expect(chaffRingAlpha(until, until - D)).toBeCloseTo(K.alpha, 9);
    expect(chaffRingAlpha(until, until - D / 2)).toBeCloseTo(K.alpha / 2, 9);
    expect(chaffRingAlpha(until, until)).toBe(0);
    expect(K.alpha).toBe(0.45);
  });

  it('clamps: never above the base before the fresh point, never below 0 after expiry', () => {
    expect(chaffRingAlpha(100_000, 100_000 - 3 * D)).toBe(K.alpha);
    expect(chaffRingAlpha(100_000, 100_000 + 5000)).toBe(0);
  });

  it('reads no ring for a non-finite input or a non-positive duration', () => {
    expect(chaffRingAlpha(Number.NaN, 0)).toBe(0);
    expect(chaffRingAlpha(1000, Number.POSITIVE_INFINITY)).toBe(0);
    expect(chaffRingAlpha(1000, 0, 0)).toBe(0);
  });
});

describe('the ring geometry comes off CONFIG', () => {
  it('draws at the cloud\'s own scatter radius (120 u)', () => {
    expect(CHAFF_RING_RADIUS).toBe(CONFIG.chaff.radius);
    expect(CHAFF_RING_RADIUS).toBe(120);
  });

  it('is DASHED: the dash + gap pitch around the circumference, at least 8 dashes', () => {
    const n = chaffDashSegments();
    expect(n).toBe(Math.round((2 * Math.PI * CONFIG.chaff.radius) / (K.dash + K.gap)));
    expect(n).toBeGreaterThanOrEqual(8);
    expect(chaffDashSegments(1)).toBe(8);
  });

  it('a NON-POSITIVE dash + gap pitch (a bad feel knob) returns a fixed 8 dashes, never Infinity (review gate P5)', () => {
    expect(chaffDashSegments(120, 0, 0)).toBe(8);
    expect(chaffDashSegments(120, -4, 2)).toBe(8);
    expect(chaffDashSegments(120, Number.NaN, 4)).toBe(8);
    expect(chaffDashSegments(Number.POSITIVE_INFINITY)).toBe(8);
    expect(chaffDashFraction(0, 0)).toBe(0.5);
    expect(chaffDashFraction(K.dash, K.gap)).toBeCloseTo(K.dash / (K.dash + K.gap), 12);
  });
});

describe('ChaffRing — shown at the own cloud, hidden otherwise', () => {
  it('is hidden with no cloud, and after the cloud expires', () => {
    const layer = new Container();
    const ring = new ChaffRing(layer);
    expect(layer.children).toHaveLength(1);
    ring.render(undefined, 0);
    expect(ring.visible).toBe(false);
    ring.render(null, 0);
    expect(ring.visible).toBe(false);
    ring.render({ x: 300, y: 200, until: 10_000 }, 10_000);
    expect(ring.visible).toBe(false);
    ring.render({ x: Number.NaN, y: 200, until: 10_000 }, 0);
    expect(ring.visible).toBe(false);
  });

  it('sits at the burst point with the faded alpha, and a re-fire simply moves it', () => {
    const ring = new ChaffRing(new Container());
    ring.render({ x: 300, y: 200, until: 15_000 }, 0);
    expect(ring.visible).toBe(true);
    expect(ring.position).toEqual({ x: 300, y: 200 });
    expect(ring.alpha).toBeCloseTo(chaffRingAlpha(15_000, 0), 9);
    ring.render({ x: 400, y: 250, until: 20_000 }, 10_000);
    expect(ring.position).toEqual({ x: 400, y: 250 });
    expect(ring.alpha).toBeCloseTo(chaffRingAlpha(20_000, 10_000), 9);
  });

  it('carries no colour literal — the stroke is the phosphor token', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../render/chaffRing.ts'), 'utf8');
    expect(src).toContain('CLIENT_CONFIG.colors.phosphor');
    expect(src).not.toMatch(/0x[0-9a-f]{6}|#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
