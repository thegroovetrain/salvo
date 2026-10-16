// PHOSPHOR SHELLS burning-zone rendering (render/burnZones.ts, Story 8.17;
// body re-made by Story 9.11 — epic-9 amendment 154). The crimson ember disc is
// gone: the zone is WHITE FIRE ON THE WATER — seeded tongues over the whole
// disc, the same for every observer, still at motion off — and ownership reads
// on the RING alone (own white, another's the shared alert blend).

import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { BurnZoneView } from '@salvo/shared';
import { BurnZones, burnFlames, burnFlicker, flameCountFor } from '../render/burnZones.js';
import { LIT_FADE_MS, litZoneFade } from '../render/litZones.js';
import { alertClock, alertTint, mixColor } from '../render/alertBlend.js';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';

const Z = CLIENT_CONFIG.burnZone;
const burn = (id: string, by = 'enemy', until = 10_000, r = 100): BurnZoneView => ({ id, x: 0, y: 0, r, until, by });

/** A zone root's two children: [glow (fill + ring), fire]. */
function partsOf(layer: Container, i = 0): { root: Container; ring: Graphics; fire: Container } {
  const root = layer.children[i] as Container;
  const [ring, fire] = root.children as [Graphics, Container];
  return { root, ring, fire };
}

beforeEach(() => alertClock.reset());
afterEach(() => settings.reset());

describe('BurnZones.sync — the burning-zone lifecycle', () => {
  it('spawns one root per zone and despawns what left the list', () => {
    const layer = new Container();
    const zones = new BurnZones(layer);
    zones.sync([burn('a'), burn('b', 'me')], 'me');
    expect(zones.size).toBe(2);
    expect(layer.children).toHaveLength(2);
    zones.sync([burn('b', 'me')], 'me'); // `a` expired / out of radar
    expect(zones.size).toBe(1);
    expect(layer.children).toHaveLength(1);
    zones.sync([], 'me'); // the frame omitted the key
    expect(zones.size).toBe(0);
    expect(zones.flameCountOf('b')).toBeNull();
  });

  it('is the family glow and a field of fire — no ember child (amendment 181: the fill stays)', () => {
    const layer = new Container();
    const zones = new BurnZones(layer);
    zones.sync([burn('z', 'foe')], 'me');
    const { root, ring, fire } = partsOf(layer);
    expect(root.children).toHaveLength(2);
    expect(ring.context.instructions.map((i) => i.action)).toEqual(['fill', 'stroke']); // the lit zone's glow: fill + ring
    expect(ring.blendMode).toBe('add');
    expect(fire.children).toHaveLength(zones.flameCountOf('z') ?? -1);
    for (const t of fire.children as Graphics[]) {
      expect(t.blendMode).toBe('add');
      expect(t.children).toHaveLength(0);
    }
  });
});

describe('the ring carries ownership (amendments 153–154)', () => {
  it('own ring white, another’s on the shared alert tint', () => {
    const layer = new Container();
    const zones = new BurnZones(layer);
    zones.sync([burn('mine', 'me'), burn('theirs', 'foe')], 'me');
    zones.render(0, 1);
    zones.render(0, 1.3);
    expect(partsOf(layer, 0).ring.tint).toBe(0xffffff);
    expect(partsOf(layer, 1).ring.tint).toBe(alertTint(alertClock.phase, 'full'));
  });

  it('a spectator (no own id) owns nothing — every ring blends', () => {
    settings.set({ motion: 'off' });
    const layer = new Container();
    const zones = new BurnZones(layer);
    zones.sync([burn('z', 'me')], undefined);
    zones.render(0, 0);
    expect(partsOf(layer).ring.tint).toBe(CLIENT_CONFIG.colors.alertOrange);
  });

  it('own fire is pure white; another’s fire leans SLIGHTLY toward the ring’s blend (amendment 183)', () => {
    const layer = new Container();
    const zones = new BurnZones(layer);
    zones.sync([burn('own', 'me'), burn('foe', 'foe')], 'me');
    zones.render(0, 0);
    zones.render(0, 0.4);
    const own = partsOf(layer, 0);
    const foe = partsOf(layer, 1);
    expect(own.fire.tint).toBe(0xffffff);
    const ring = foe.ring.tint;
    expect(foe.fire.tint).toBe(mixColor(0xffffff, ring, CLIENT_CONFIG.burnZone.flameAlertMix));
    expect(foe.fire.tint).not.toBe(0xffffff); // it does lean
    expect(foe.fire.tint).not.toBe(ring); // but only part of the way — the flames stay mostly white
    for (const t of foe.fire.children as Graphics[]) expect(t.tint).toBe(0xffffff); // the lean rides the layer, tongues untouched
  });
});

describe('burnFlames — seeded from the zone id, denser toward the middle', () => {
  it('is deterministic per id across two renderers, and two ids differ', () => {
    expect(burnFlames('burn-7', 100)).toEqual(burnFlames('burn-7', 100));
    expect(burnFlames('burn-7', 100)).not.toEqual(burnFlames('burn-8', 100));
    // Two clients' renderers place the same tongues at the same places.
    const a = new Container();
    const b = new Container();
    new BurnZones(a).sync([burn('burn-7')], 'me');
    new BurnZones(b).sync([burn('burn-7')], 'other');
    const pos = (layer: Container): number[][] =>
      (partsOf(layer).fire.children as Graphics[]).map((t) => [t.position.x, t.position.y]);
    expect(pos(a)).toEqual(pos(b));
  });

  it('the count lies in [flameMin, flameMax] and grows with the radius', () => {
    let prev = 0;
    for (const r of [5, 40, 80, 120, 200, 2000]) {
      const n = flameCountFor(r);
      expect(n).toBeGreaterThanOrEqual(Z.flameMin);
      expect(n).toBeLessThanOrEqual(Z.flameMax);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
      expect(burnFlames(`r${r}`, r)).toHaveLength(n);
    }
    expect(flameCountFor(200)).toBeGreaterThan(flameCountFor(40));
    expect(flameCountFor(Number.NaN)).toBe(Z.flameMin);
  });

  it('every tongue stands inside the disc, and the middle is denser than the rim', () => {
    const r = 200;
    let inner = 0; // tongues inside half the radius = a quarter of the area
    let total = 0;
    for (let k = 0; k < 20; k++) {
      for (const f of burnFlames(`dense-${k}`, r)) {
        const d = Math.hypot(f.x, f.y);
        expect(d).toBeLessThanOrEqual(r + 1e-9);
        expect(f.scale).toBeGreaterThanOrEqual(Z.flameScaleMin);
        expect(f.scale).toBeLessThanOrEqual(Z.flameScaleMax);
        if (d < r / 2) inner++;
        total++;
      }
    }
    // Uniform-by-area would put ~25 % inside r/2; the center bias puts more.
    expect(inner / total).toBeGreaterThan(0.35);
  });
});

describe('the flicker — motion over information that never moves', () => {
  it('motion off: the tongues stand still at full strength and size', () => {
    settings.set({ motion: 'off' });
    const layer = new Container();
    const zones = new BurnZones(layer);
    zones.sync([burn('z')], 'me');
    const snap = (): number[][] =>
      (partsOf(layer).fire.children as Graphics[]).map((t) => [t.alpha, t.scale.x, t.scale.y]);
    zones.render(0, 0);
    const first = snap();
    for (let t = 37; t < 3000; t += 211) {
      zones.render(t, t / 1000);
      expect(snap()).toEqual(first);
    }
    for (const [alpha] of first) expect(alpha).toBe(1);
  });

  it('full motion: the tongues wobble, and burnFlicker is exactly 1 at intensity 0', () => {
    expect(burnFlicker(123, 0, 1)).toBe(1);
    const layer = new Container();
    const zones = new BurnZones(layer);
    zones.sync([burn('z')], 'me');
    zones.render(0, 0);
    const t0 = (partsOf(layer).fire.children[0] as Graphics).scale.x;
    zones.render(40, 0.04);
    expect((partsOf(layer).fire.children[0] as Graphics).scale.x).not.toBeCloseTo(t0, 6);
  });

  it('the expiry fade and the flicker never fight over one alpha', () => {
    // The fade rides the ROOT; the flicker rides each tongue CHILD, so a zone
    // dying mid-flicker fades out whole instead of flaring back up.
    const layer = new Container();
    const zones = new BurnZones(layer);
    zones.sync([burn('z', 'me', 1000)], 'me');
    zones.render(1000 - LIT_FADE_MS / 2, 1); // half-faded
    const { root, fire } = partsOf(layer);
    expect(root.alpha).toBeCloseTo(litZoneFade(LIT_FADE_MS / 2), 9);
    for (const t of fire.children) expect(t.alpha).toBeGreaterThan(0.5); // the child's own alpha is untouched
  });
});

describe('burnFlames — a degenerate radius (Edge Case Hunter, 2026-10-16)', () => {
  it('draws NO fire for r ≤ 0 or NaN instead of six tongues stacked on the center', () => {
    expect(burnFlames('z', 0)).toEqual([]);
    expect(burnFlames('z', -5)).toEqual([]);
    expect(burnFlames('z', Number.NaN)).toEqual([]);
  });
});
