// FOULING SHELL foul-zone rendering (render/foulZones.ts, Story 9.4 — Eric
// ruling 2026-10-11, epic-9 amendments 61–69). The burn zone's twin in the
// lifecycle (reconcile by id, firer-hue latch, `litZoneFade` expiry) with its
// OWN inside treatment, Eric's "weed and net" (round-3 pick "bold",
// 2026-10-12): a faint lighter slick disc, a diagonal net clipped to it, and
// seeded weed squiggles on top that sway only when motion allows.

import { afterEach, describe, it, expect, vi } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { FoulZoneView } from '@salvo/shared';
import { FoulZones, netSegments, weedStrokes } from '../render/foulZones.js';
import { LIT_FADE_MS, litZoneFade } from '../render/litZones.js';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';

const Z = CLIENT_CONFIG.foulZone;
const foul = (id: string, by = 'enemy', until = 20_000, x = 0, y = 0): FoulZoneView => ({ id, x, y, r: 150, until, by });

/** The zone root's four layers: [slick, glow, net, weed]. */
function layersOf(layer: Container, i = 0): { root: Container; slick: Graphics; glow: Graphics; net: Graphics; weed: Graphics } {
  const root = layer.children[i] as Container;
  const [slick, glow, net, weed] = root.children as Graphics[];
  return { root, slick, glow, net, weed };
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

  it('a recolor redraws the glow and the net in place, never the slick or the weed', () => {
    const layer = new Container();
    const zones = new FoulZones(layer);
    let hue: number | null = null;
    zones.sync([foul('z', 'late')], () => hue);
    const { slick, glow, net, weed } = layersOf(layer);
    const slickOps = slick.context.instructions.length;
    const weedOps = [...weed.context.instructions];
    hue = 0x00ff00;
    zones.sync([foul('z', 'late')], () => hue);
    expect(glow.context.instructions).toHaveLength(2); // fill + ring, redrawn (not appended)
    expect(net.context.instructions).toHaveLength(1); // the one stroked path, redrawn
    expect(slick.context.instructions).toHaveLength(slickOps);
    expect(weed.context.instructions).toHaveLength(weedOps.length);
    weed.context.instructions.forEach((ins, i) => expect(ins).toBe(weedOps[i])); // same objects — never redrawn
  });
});

describe('the inside treatment — WEED AND NET (2026-10-12)', () => {
  it('stacks the layers slick → glow → net → weed', () => {
    const layer = new Container();
    new FoulZones(layer).sync([foul('z')], () => 0x00ff00);
    const { root, slick, glow, net, weed } = layersOf(layer);
    expect(root.children).toEqual([slick, glow, net, weed]);
  });

  it('wears the zone family identity glow (fill + ring, additive)', () => {
    const layer = new Container();
    new FoulZones(layer).sync([foul('z')], () => 0x00ff00);
    const { glow } = layersOf(layer);
    expect(glow.context.instructions).toHaveLength(2);
    expect(glow.blendMode).toBe('add');
  });

  it('nothing lights additively except the glow: slick, net and weed are normal-blend', () => {
    const layer = new Container();
    new FoulZones(layer).sync([foul('z')], () => 0x00ff00);
    const { slick, net, weed } = layersOf(layer);
    expect([slick.blendMode, net.blendMode, weed.blendMode]).toEqual(['normal', 'normal', 'normal']);
    expect(slick.context.instructions.some((i) => i.action === 'fill')).toBe(true);
  });

  it('draws the net and the weed each as ONE stroke', () => {
    const layer = new Container();
    new FoulZones(layer).sync([foul('z')], () => 0x00ff00);
    const { net, weed } = layersOf(layer);
    expect(net.context.instructions.map((i) => i.action)).toEqual(['stroke']);
    expect(weed.context.instructions.map((i) => i.action)).toEqual(['stroke']);
  });
});

describe('netSegments — the net is clipped analytically to the slick disc', () => {
  const R = 150 * Z.slickFrac;
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

describe('weedStrokes — the squiggles are seeded from the zone id', () => {
  it('is deterministic per id, and two ids differ', () => {
    expect(weedStrokes('foul-7', 150)).toEqual(weedStrokes('foul-7', 150));
    expect(weedStrokes('foul-7', 150)).not.toEqual(weedStrokes('foul-8', 150));
  });

  it('yields exactly `weedCount` strokes, each midpoint inside the slick less half a stroke', () => {
    for (const r of [60, 150, 400]) {
      const strokes = weedStrokes(`z${r}`, r);
      expect(strokes).toHaveLength(Z.weedCount);
      const reach = Math.max(0, r * Z.slickFrac - Z.weedLenU / 2);
      for (const w of strokes) {
        expect(Math.hypot(w.x, w.y)).toBeLessThanOrEqual(reach + 1e-9);
        expect(Number.isFinite(w.heading)).toBe(true);
        expect(Number.isFinite(w.phase)).toBe(true);
      }
    }
  });
});

describe('FoulZones.render — the fade, and the weed sway', () => {
  afterEach(() => settings.reset());

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

  it('every layer alpha is constant across frames before the fade (only the weed position moves)', () => {
    const layer = new Container();
    const zones = new FoulZones(layer);
    zones.sync([foul('z', 'me', 100_000)], () => 0x00ff00);
    const snap = (): number[] => {
      const { root, slick, glow, net, weed } = layersOf(layer);
      return [root.alpha, slick.alpha, glow.alpha, net.alpha, weed.alpha];
    };
    zones.render(0, 0);
    const first = snap();
    for (let t = 50; t < 5000; t += 333) {
      zones.render(t, t / 1000);
      expect(snap()).toEqual(first);
    }
  });

  it('holds the weed at offset 0 when render is called without nowSec', () => {
    const layer = new Container();
    const zones = new FoulZones(layer);
    zones.sync([foul('z', 'me', 100_000)], () => 0x00ff00);
    zones.render(0);
    zones.render(400);
    const { weed } = layersOf(layer);
    expect([weed.position.x, weed.position.y]).toEqual([0, 0]);
  });

  it('sways the weed at motion full, and holds it still at motion off', () => {
    const layer = new Container();
    const zones = new FoulZones(layer);
    settings.set({ motion: 'full' });
    zones.sync([foul('z', 'me', 100_000)], () => 0x00ff00);
    zones.render(0, 0);
    zones.render(400, 0.4);
    const { weed } = layersOf(layer);
    expect(Math.hypot(weed.position.x, weed.position.y)).toBeGreaterThan(0);

    settings.set({ motion: 'off' });
    zones.render(800, 0.8);
    expect(Math.hypot(weed.position.x, weed.position.y)).toBe(0);
  });
});
