// Story 10.9 — the airdrop renderer (render/drops.ts): the kind → color/glyph
// core and the add/remove reconcile of the adapter. Story 12.4: two kinds,
// the XP crate (+XP linework) and the wreck.
import { describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { isDropKind, type DropKind, type DropView } from '@salvo/shared';
import { Drops, crateStyleFor, drawCrate } from '../render/drops.js';
import { drawEquipmentIcon, glyphPaths } from '../render/equipmentIcons.js';
import { CLIENT_CONFIG } from '../config.js';

const KINDS = Object.keys(CLIENT_CONFIG.drops.kindColors) as DropKind[];
const crate = (id: string, x = 0, y = 0, c: DropKind = 'xp'): DropView => ({ id, x, y, c });

describe('Drops — the add/remove reconcile', () => {
  it('adds one child per view, positioned at its (x, y)', () => {
    const layer = new Container();
    const d = new Drops(layer);
    d.sync([crate('a', 10, 20), crate('b', -30, 40, 'wreck')]);
    expect(layer.children).toHaveLength(2);
    expect(d.spriteOf('a')?.position).toMatchObject({ x: 10, y: 20 });
    expect(d.spriteOf('b')?.position).toMatchObject({ x: -30, y: 40 });
  });

  it('removes vanished ids and keeps the survivors (no re-create)', () => {
    const layer = new Container();
    const d = new Drops(layer);
    d.sync([crate('a'), crate('b')]);
    const a = d.spriteOf('a');
    d.sync([crate('a'), crate('c')]);
    expect(d.spriteOf('a')).toBe(a);
    expect(d.spriteOf('b')).toBeNull();
    expect(d.spriteOf('c')).not.toBeNull();
    expect(layer.children).toHaveLength(2);
    d.sync([]);
    expect(layer.children).toHaveLength(0);
  });

  it('render and destroy are safe', () => {
    const layer = new Container();
    const d = new Drops(layer);
    d.sync([crate('a')]);
    d.render(1.5);
    d.destroy();
    expect(layer.children).toHaveLength(0);
  });
});

describe('the crate core', () => {
  it.each(KINDS)('kind %s has a glyph and draws without throwing', (kind) => {
    expect(glyphPaths(crateStyleFor(kind).glyphId)).not.toBeNull();
    expect(() => drawCrate(new Graphics(), kind)).not.toThrow();
  });

  it.each(KINDS)('kind %s is drawn in its configured color', (kind) => {
    expect(crateStyleFor(kind).color).toBe(CLIENT_CONFIG.drops.kindColors[kind]);
  });

  it('kindColors holds exactly the drop kinds (xp + wreck), each one a shared DropKind', () => {
    expect([...KINDS].sort()).toEqual(['wreck', 'xp']);
    for (const k of KINDS) expect(isDropKind(k)).toBe(true);
  });

  it('each kind wears its own glyph id (the XP crate the +XP, the wreck the salvage mark)', () => {
    expect(crateStyleFor('xp').glyphId).toBe('xp');
    expect(crateStyleFor('wreck').glyphId).toBe('wreck');
  });

  it('the glow reads its dials: two underlay passes in the kind color, then the body', () => {
    const cfg = CLIENT_CONFIG.drops.glow as { widthU: number; alpha: number };
    const was = { ...cfg };
    try {
      cfg.widthU = 3;
      cfg.alpha = 0.4;
      const g = new Graphics();
      const strokes: { width: number; alpha: number; color: number }[] = [];
      const orig = g.stroke.bind(g);
      g.stroke = ((s: { width: number; alpha: number; color: number }) => {
        strokes.push(s);
        return orig(s);
      }) as typeof g.stroke;
      drawCrate(g, 'xp', 0.9);
      const color = CLIENT_CONFIG.drops.kindColors.xp;
      const body = strokes[2];
      expect(body).toMatchObject({ alpha: 0.9, color });
      expect(strokes[0]).toMatchObject({ width: body.width + 2 * 3, alpha: 0.2, color });
      expect(strokes[1]).toMatchObject({ width: body.width + 3, alpha: 0.4, color });
    } finally {
      Object.assign(cfg, was);
    }
  });
});

describe('the +XP glyph (Story 12.4) — linework, not text', () => {
  /** A Graphics stand-in that records every path call. */
  function recorder(): { g: Graphics; calls: string[] } {
    const calls: string[] = [];
    const g = new Graphics();
    for (const m of ['moveTo', 'lineTo', 'circle', 'stroke', 'fill', 'poly'] as const) {
      const orig = (g[m] as (...a: unknown[]) => unknown).bind(g);
      (g as unknown as Record<string, unknown>)[m] = (...a: unknown[]) => {
        calls.push(m);
        return orig(...a);
      };
    }
    return { g, calls };
  }

  it('is a set of open polylines inside the unit frame, with no fills and no inks', () => {
    const parts = glyphPaths('xp');
    expect(parts).not.toBeNull();
    expect(parts!.length).toBeGreaterThan(0);
    for (const p of parts!) {
      expect(p.kind).toBe('path');
      if (p.kind !== 'path') continue;
      expect(p.fill).toBeUndefined();
      expect(p.ink).toBeUndefined();
      expect(p.pts.length).toBeGreaterThanOrEqual(2);
      for (const [x, y] of p.pts) {
        expect(Math.abs(x)).toBeLessThanOrEqual(1);
        expect(Math.abs(y)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is its own drawing (never the wreck`s)', () => {
    expect(glyphPaths('xp')).not.toEqual(glyphPaths('wreck'));
  });

  it('strokes one moveTo per polyline and one lineTo per further point, in a single stroke', () => {
    const parts = glyphPaths('xp')!;
    const { g, calls } = recorder();
    drawEquipmentIcon(g, 'xp', 0, 0, 20, { width: 1.5, color: 0xffffff });
    const pts = parts.reduce((n, p) => n + (p.kind === 'path' ? p.pts.length : 0), 0);
    expect(calls.filter((c) => c === 'moveTo')).toHaveLength(parts.length);
    expect(calls.filter((c) => c === 'lineTo')).toHaveLength(pts - parts.length);
    expect(calls.filter((c) => c === 'stroke')).toHaveLength(1);
    expect(calls).not.toContain('fill');
  });
});
