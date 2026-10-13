// FOULING SHELL foul-zone rendering (render/foulZones.ts, Story 9.4 — Eric
// ruling 2026-10-11, epic-9 amendments 61–69). The burn zone's twin in the
// lifecycle (reconcile by id, firer-hue latch, `litZoneFade` expiry) with its
// OWN inside treatment, Eric's pick "MURK AND NET": a normal-blend murk disc
// that darkens the water under a diagonal net clipped to that disc. Nothing
// breathes.

import { describe, it, expect, vi } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { FoulZoneView } from '@salvo/shared';
import { FoulZones, netSegments } from '../render/foulZones.js';
import { LIT_FADE_MS, litZoneFade } from '../render/litZones.js';
import { CLIENT_CONFIG } from '../config.js';

const Z = CLIENT_CONFIG.foulZone;
const foul = (id: string, by = 'enemy', until = 20_000, x = 0, y = 0): FoulZoneView => ({ id, x, y, r: 150, until, by });

/** The zone root's three layers: [murk, glow, net]. */
function layersOf(layer: Container, i = 0): { root: Container; murk: Graphics; glow: Graphics; net: Graphics } {
  const root = layer.children[i] as Container;
  const [murk, glow, net] = root.children as Graphics[];
  return { root, murk, glow, net };
}

describe('FoulZones.sync — the foul-zone lifecycle (the burnZones twin)', () => {
  it('spawns one sprite per zone and despawns what left the list, by id', () => {
    const layer = new Container();
    const zones = new FoulZones(layer);
    zones.sync([foul('a'), foul('b', 'me')], () => 0x00ff00);
    expect(zones.size).toBe(2);
    expect(layer.children).toHaveLength(2);
    zones.sync([foul('b', 'me')], () => 0x00ff00); // `a` expired / out of radar
    expect(zones.size).toBe(1);
    expect(layer.children).toHaveLength(1);
    zones.sync([], () => 0x00ff00); // the frame omitted the key
    expect(zones.size).toBe(0);
    expect(layer.children).toHaveLength(0);
  });

  it('leaves a held zone untouched when the same id comes round again', () => {
    const layer = new Container();
    const zones = new FoulZones(layer);
    zones.sync([foul('a')], () => 0x00ff00);
    const first = layer.children[0];
    zones.sync([foul('a')], () => 0x00ff00);
    expect(layer.children[0]).toBe(first);
  });

  it('positions the sprite at the zone center', () => {
    const layer = new Container();
    new FoulZones(layer).sync([foul('z', 'foe', 20_000, 320, -140)], () => 0x00ff00);
    const { root } = layersOf(layer);
    expect([root.position.x, root.position.y]).toEqual([320, -140]);
  });

  it('tints by the FIRER (`by`) through the hue latch, retrying on a late roster', () => {
    const zones = new FoulZones(new Container());
    const hueFor = vi.fn((_by: string) => null as number | null);
    zones.sync([foul('z', 'late')], hueFor);
    expect(hueFor).toHaveBeenCalledWith('late'); // unresolved at spawn → fallback
    hueFor.mockReturnValue(0x00ff00);
    zones.sync([foul('z', 'late')], hueFor); // retry resolves + redraws
    const afterResolve = hueFor.mock.calls.length;
    zones.sync([foul('z', 'late')], hueFor); // latched — no more probes
    expect(hueFor.mock.calls.length).toBe(afterResolve);
  });

  it('a recolor redraws the glow and the net in place, never the murk', () => {
    const layer = new Container();
    const zones = new FoulZones(layer);
    let hue: number | null = null;
    zones.sync([foul('z', 'late')], () => hue);
    const { murk, glow, net } = layersOf(layer);
    const murkOps = murk.context.instructions.length;
    hue = 0x00ff00;
    zones.sync([foul('z', 'late')], () => hue);
    expect(glow.context.instructions).toHaveLength(2); // fill + ring, redrawn (not appended)
    expect(net.context.instructions).toHaveLength(1); // the one stroked path, redrawn
    expect(murk.context.instructions).toHaveLength(murkOps);
  });
});

describe('the inside treatment — MURK AND NET (amendment 69)', () => {
  it('wears the zone family identity glow (fill + ring, additive)', () => {
    const layer = new Container();
    new FoulZones(layer).sync([foul('z')], () => 0x00ff00);
    const { glow } = layersOf(layer);
    expect(glow.context.instructions).toHaveLength(2);
    expect(glow.blendMode).toBe('add');
  });

  it('draws the murk NORMAL-blend (it darkens), filled, under the glow', () => {
    const layer = new Container();
    new FoulZones(layer).sync([foul('z')], () => 0x00ff00);
    const { root, murk, glow } = layersOf(layer);
    expect(murk.blendMode).toBe('normal');
    expect(root.getChildIndex(murk)).toBeLessThan(root.getChildIndex(glow));
    expect(murk.context.instructions.some((i) => i.action === 'fill')).toBe(true);
  });

  it('draws the net as ONE stroke over both other layers', () => {
    const layer = new Container();
    new FoulZones(layer).sync([foul('z')], () => 0x00ff00);
    const { root, net } = layersOf(layer);
    expect(root.getChildIndex(net)).toBe(root.children.length - 1);
    expect(net.context.instructions.map((i) => i.action)).toEqual(['stroke']);
  });
});

describe('netSegments — the net is clipped analytically to the murk disc', () => {
  const R = 150 * Z.murkFrac;
  const segs = netSegments(R, Z.netSpacingU);

  it('every segment endpoint lies ON the circle — a chord, never past it', () => {
    expect(segs.length).toBeGreaterThan(0);
    for (const s of segs) {
      expect(Math.hypot(s.x1, s.y1)).toBeCloseTo(R, 9);
      expect(Math.hypot(s.x2, s.y2)).toBeCloseTo(R, 9);
    }
  });

  it('every segment runs at +45° or −45°, and both diagonals are present', () => {
    let plus = 0;
    let minus = 0;
    for (const s of segs) {
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      expect(Math.abs(Math.abs(dx) - Math.abs(dy))).toBeLessThan(1e-9);
      if (Math.sign(dx) === Math.sign(dy)) plus++;
      else minus++;
    }
    expect(plus).toBeGreaterThan(0);
    expect(plus).toBe(minus);
  });

  it('parallel lines are `spacing` apart (perpendicular offset steps)', () => {
    const offsets = segs
      .filter((s) => Math.sign(s.x2 - s.x1) === Math.sign(s.y2 - s.y1))
      .map((s) => (s.y1 - s.x1) / Math.SQRT2) // signed distance from the +45° line through 0
      .sort((a, b) => a - b);
    for (let i = 1; i < offsets.length; i++) expect(offsets[i] - offsets[i - 1]).toBeCloseTo(Z.netSpacingU, 9);
  });

  it('returns nothing for a degenerate disc or spacing', () => {
    expect(netSegments(0, 14)).toEqual([]);
    expect(netSegments(100, 0)).toEqual([]);
  });
});

describe('FoulZones.render — the fade, and nothing breathes', () => {
  it('fades the whole sprite by litZoneFade(until − serverNow)', () => {
    const layer = new Container();
    const zones = new FoulZones(layer);
    zones.sync([foul('z', 'me', 10_000)], () => 0x00ff00);
    zones.render(0);
    expect(layer.children[0].alpha).toBe(1);
    zones.render(10_000 - LIT_FADE_MS / 2);
    expect(layer.children[0].alpha).toBeCloseTo(litZoneFade(LIT_FADE_MS / 2), 9);
    zones.render(10_000);
    expect(layer.children[0].alpha).toBe(0);
  });

  it('nothing animates: every layer alpha is constant across frames before the fade', () => {
    const layer = new Container();
    const zones = new FoulZones(layer);
    zones.sync([foul('z', 'me', 100_000)], () => 0x00ff00);
    const snap = (): number[] => {
      const { root, murk, glow, net } = layersOf(layer);
      return [root.alpha, murk.alpha, glow.alpha, net.alpha];
    };
    zones.render(0);
    const first = snap();
    for (let t = 50; t < 5000; t += 333) {
      zones.render(t);
      expect(snap()).toEqual(first);
    }
  });
});
