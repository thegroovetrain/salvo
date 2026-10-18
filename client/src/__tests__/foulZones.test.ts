// FOULING SHELL foul-zone rendering (render/foulZones.ts, Story 9.4 — Eric
// ruling 2026-10-11, epic-9 amendments 61–69). The burn zone's twin in the
// lifecycle (reconcile by id, `litZoneFade` expiry, and since Story 9.11 the
// alert tint on the glow + net: own white, another's the shared blend) with its
// OWN inside treatment, Eric's "weed and net" (round-3 pick "bold",
// 2026-10-12): a faint lighter slick disc, a diagonal net clipped to it, and
// seeded weed squiggles on top that sway only when motion allows.

import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { FoulZoneView } from '@salvo/shared';
import { FoulZones, netSegments, weedStrokes } from '../render/foulZones.js';
import { LIT_FADE_MS, litZoneFade } from '../render/litZones.js';
import { alertClock, alertTint } from '../render/alertBlend.js';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';

beforeEach(() => alertClock.reset());

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
    zones.sync([foul('a'), foul('b', 'me')], 'me');
    expect(zones.size).toBe(2);
    expect(layer.children).toHaveLength(2);
    zones.sync([foul('b', 'me')], 'me'); // `a` expired / out of radar
    expect(zones.size).toBe(1);
    expect(layer.children).toHaveLength(1);
    zones.sync([], 'me'); // the frame omitted the key
    expect(zones.size).toBe(0);
    expect(layer.children).toHaveLength(0);
  });

  it('leaves a held zone untouched when the same id comes round again', () => {
    const layer = new Container();
    const zones = new FoulZones(layer);
    zones.sync([foul('a')], 'me');
    const first = layer.children[0];
    zones.sync([foul('a')], 'me');
    expect(layer.children[0]).toBe(first);
  });

  it('positions the sprite at the zone center', () => {
    const layer = new Container();
    new FoulZones(layer).sync([foul('z', 'foe', 20_000, 320, -140)], 'me');
    const { root } = layersOf(layer);
    expect([root.position.x, root.position.y]).toEqual([320, -140]);
  });

  afterEach(() => settings.reset());

  it('own glow + net white; another’s glow + net on the shared alert tint', () => {
    const layer = new Container();
    const zones = new FoulZones(layer);
    zones.sync([foul('mine', 'me'), foul('theirs', 'foe')], 'me');
    zones.render(0, 3);
    zones.render(0, 3.3);
    const own = layersOf(layer, 0);
    const other = layersOf(layer, 1);
    expect([own.glow.tint, own.net.tint]).toEqual([0xffffff, 0xffffff]);
    const t = alertTint(alertClock.phase, 'full');
    expect([other.glow.tint, other.net.tint]).toEqual([t, t]);
  });

  it('a spectator (no own id) owns nothing; motion off holds steady orange', () => {
    settings.set({ motion: 'off' });
    const layer = new Container();
    const zones = new FoulZones(layer);
    zones.sync([foul('z', 'me')], undefined);
    for (let t = 0; t < 2; t += 0.3) {
      zones.render(0, t);
      expect(layersOf(layer).net.tint).toBe(CLIENT_CONFIG.colors.alertOrange);
    }
  });

  it('the tint touches the glow and the net ONLY — slick and weed never tinted, never redrawn', () => {
    const layer = new Container();
    const zones = new FoulZones(layer);
    zones.sync([foul('z', 'foe')], 'me');
    const { slick, glow, net, weed } = layersOf(layer);
    const slickOps = [...slick.context.instructions];
    const weedOps = [...weed.context.instructions];
    const glowOps = [...glow.context.instructions];
    const netOps = [...net.context.instructions];
    for (let t = 0; t < 2; t += 0.21) zones.render(t * 1000, t);
    expect([slick.tint, weed.tint]).toEqual([0xffffff, 0xffffff]);
    expect(glow.tint).not.toBe(0xffffff);
    // Drawn once at spawn: the very same instruction objects, frame after frame.
    for (const [g, ops] of [[slick, slickOps], [weed, weedOps], [glow, glowOps], [net, netOps]] as const) {
      expect(g.context.instructions).toHaveLength(ops.length);
      g.context.instructions.forEach((ins, i) => expect(ins).toBe(ops[i]));
    }
  });

  it('the glow and the net are drawn in WHITE geometry', () => {
    const layer = new Container();
    new FoulZones(layer).sync([foul('z', 'foe')], 'me');
    const { glow, net } = layersOf(layer);
    const colors = [...glow.context.instructions, ...net.context.instructions].map(
      (i) => (i.data.style as { color: number }).color,
    );
    expect(colors).toEqual([0xffffff, 0xffffff, 0xffffff]);
  });
});

describe('the inside treatment — WEED AND NET (2026-10-12)', () => {
  it('stacks the layers slick → glow → net → weed', () => {
    const layer = new Container();
    new FoulZones(layer).sync([foul('z')], 'me');
    const { root, slick, glow, net, weed } = layersOf(layer);
    expect(root.children).toEqual([slick, glow, net, weed]);
  });

  it('wears the zone family identity glow (fill + ring, additive)', () => {
    const layer = new Container();
    new FoulZones(layer).sync([foul('z')], 'me');
    const { glow } = layersOf(layer);
    expect(glow.context.instructions).toHaveLength(2);
    expect(glow.blendMode).toBe('add');
  });

  it('nothing lights additively except the glow: slick, net and weed are normal-blend', () => {
    const layer = new Container();
    new FoulZones(layer).sync([foul('z')], 'me');
    const { slick, net, weed } = layersOf(layer);
    expect([slick.blendMode, net.blendMode, weed.blendMode]).toEqual(['normal', 'normal', 'normal']);
    expect(slick.context.instructions.some((i) => i.action === 'fill')).toBe(true);
  });

  it('draws the net and the weed each as ONE stroke', () => {
    const layer = new Container();
    new FoulZones(layer).sync([foul('z')], 'me');
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
    zones.sync([foul('z', 'me', 10_000)], 'me');
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
    zones.sync([foul('z', 'me', 100_000)], 'me');
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
    zones.sync([foul('z', 'me', 100_000)], 'me');
    zones.render(0);
    zones.render(400);
    const { weed } = layersOf(layer);
    expect([weed.position.x, weed.position.y]).toEqual([0, 0]);
  });

  it('sways the weed at motion full, and holds it still at motion off', () => {
    const layer = new Container();
    const zones = new FoulZones(layer);
    settings.set({ motion: 'full' });
    zones.sync([foul('z', 'me', 100_000)], 'me');
    zones.render(0, 0);
    zones.render(400, 0.4);
    const { weed } = layersOf(layer);
    expect(Math.hypot(weed.position.x, weed.position.y)).toBeGreaterThan(0);

    settings.set({ motion: 'off' });
    zones.render(800, 0.8);
    expect(Math.hypot(weed.position.x, weed.position.y)).toBe(0);
  });
});
