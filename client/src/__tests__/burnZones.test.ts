// PHOSPHOR SHELLS burning-zone rendering (render/burnZones.ts, Story 8.17 —
// Eric ruling 2026-09-29, epic-8 amendments 131 and 135(f)/(i)). The ember
// treatment MOVED here from render/litZones.ts's retired `phos` verb, and its
// pins moved with it: the breath is motion over information that never moves,
// the expiry fade and the breath never share one alpha, and every burning zone
// — own or enemy — wears the ember (counterplay over concealment).

import { afterEach, describe, it, expect, vi } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { BurnZoneView } from '@salvo/shared';
import { BurnZones, EMBER_HZ, advanceEmberPhase, emberAlpha } from '../render/burnZones.js';
import { LIT_FADE_MS, litZoneFade } from '../render/litZones.js';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';

const burn = (id: string, by = 'enemy', until = 10_000): BurnZoneView => ({ id, x: 0, y: 0, r: 100, until, by });

describe('BurnZones.sync — the burning-zone lifecycle', () => {
  it('spawns one glow per zone, each carrying an ember CHILD, and despawns what left the list', () => {
    const layer = new Container();
    const zones = new BurnZones(layer);
    zones.sync([burn('a'), burn('b', 'me')], () => 0x00ff00);
    expect(zones.size).toBe(2);
    expect(layer.children).toHaveLength(2);
    for (const g of layer.children as Graphics[]) expect(g.children).toHaveLength(1);
    zones.sync([burn('b', 'me')], () => 0x00ff00); // `a` expired / out of radar
    expect(zones.size).toBe(1);
    expect(layer.children).toHaveLength(1);
    zones.sync([], () => 0x00ff00); // the frame omitted the key
    expect(zones.size).toBe(0);
  });

  it('tints by the FIRER (`by`) through the hue latch — the lit-zone precedent', () => {
    const zones = new BurnZones(new Container());
    const hueFor = vi.fn((_by: string) => null as number | null);
    zones.sync([burn('z', 'late')], hueFor);
    expect(hueFor).toHaveBeenCalledWith('late'); // unresolved at spawn → fallback
    hueFor.mockReturnValue(0x00ff00);
    zones.sync([burn('z', 'late')], hueFor); // retry resolves + redraws
    const afterResolve = hueFor.mock.calls.length;
    zones.sync([burn('z', 'late')], hueFor); // latched — no more probes
    expect(hueFor.mock.calls.length).toBe(afterResolve);
  });

  it('wears the lit zone’s identity glow (fill + ring) under its ember', () => {
    const layer = new Container();
    new BurnZones(layer).sync([burn('z', 'foe')], () => 0x00ff00);
    const g = layer.children[0] as Graphics;
    expect(g.context.instructions).toHaveLength(2);
    expect(g.blendMode).toBe('add');
  });
});

describe('the ember breath — motion, over information that never moves', () => {
  afterEach(() => settings.reset());

  it('breathes the ember alpha over time, under the photosensitivity ceiling', () => {
    const zones = new BurnZones(new Container());
    zones.sync([burn('burn')], () => 0x00ff00);
    zones.render(0, 0);
    const base = zones.emberAlphaOf('burn') ?? 0;
    zones.render(0, 0.5); // a quarter-cycle at 0.5Hz
    expect(zones.emberAlphaOf('burn')).not.toBeCloseTo(base, 6);
    expect(EMBER_HZ).toBeLessThanOrEqual(CLIENT_CONFIG.settings.pulseCapHz);
  });

  it('holds the ember at its BASE alpha with motion off — the fire is still there', () => {
    settings.set({ motion: 'off' });
    const zones = new BurnZones(new Container());
    zones.sync([burn('burn')], () => 0x00ff00);
    const seen = new Set<number>();
    for (let t = 0; t < 4; t += 0.25) {
      zones.render(0, t);
      seen.add(zones.emberAlphaOf('burn') ?? -1);
    }
    expect([...seen]).toEqual([emberAlpha(0, 0)]); // one value, all frame long
    expect(emberAlpha(0, 0)).toBeGreaterThan(0); // ...and it is VISIBLE, not off
  });

  it('advanceEmberPhase integrates and clamps a wild frame gap (the hud precedent)', () => {
    expect(advanceEmberPhase(0, 0)).toBe(0);
    expect(advanceEmberPhase(0, -5)).toBe(0); // never runs backwards
    // A backgrounded tab returning after a minute advances by the clamp, not 60s.
    expect(advanceEmberPhase(0, 60)).toBeCloseTo(advanceEmberPhase(0, 0.5), 9);
    expect(advanceEmberPhase(0, 0.5)).toBeLessThan(Math.PI * 2); // wrapped
  });

  it('the expiry fade and the ember breath never fight over one alpha', () => {
    // The glow's fade rides the parent's alpha; the ember is a CHILD, so a zone
    // dying mid-breath fades out whole instead of the fire flaring back up.
    const layer = new Container();
    const zones = new BurnZones(layer);
    zones.sync([burn('burn', 'me', 1000)], () => 0x00ff00);
    zones.render(1000 - LIT_FADE_MS / 2, 1); // half-faded
    expect(zones.emberAlphaOf('burn') ?? 0).toBeGreaterThan(0); // the child's own alpha is untouched...
    expect(layer.children[0].alpha).toBeCloseTo(litZoneFade(LIT_FADE_MS / 2), 9); // ...the parent carries the fade
  });
});
