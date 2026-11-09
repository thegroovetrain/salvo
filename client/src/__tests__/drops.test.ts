// Story 10.9 — the airdrop renderer (render/drops.ts): the kind → color/glyph
// core and the add/remove reconcile of the adapter.
import { describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { INDEX_IDS, type DropKind, type DropView } from '@salvo/shared';
import { Drops, crateStyleFor, drawCrate } from '../render/drops.js';
import { glyphPaths } from '../render/equipmentIcons.js';
import { CLIENT_CONFIG } from '../config.js';

const KINDS: DropKind[] = [...INDEX_IDS, 'wreck'];
const crate = (id: string, x = 0, y = 0, c: DropKind = 'armor'): DropView => ({ id, x, y, c });

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

  it('armor is pink (Eric 2026-11-09)', () => {
    expect(crateStyleFor('armor')).toEqual({ color: CLIENT_CONFIG.colors.pink, glyphId: 'armor' });
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
      drawCrate(g, 'power', 0.9);
      const color = CLIENT_CONFIG.drops.kindColors.power;
      const body = strokes[2];
      expect(body).toMatchObject({ alpha: 0.9, color });
      expect(strokes[0]).toMatchObject({ width: body.width + 2 * 3, alpha: 0.2, color });
      expect(strokes[1]).toMatchObject({ width: body.width + 3, alpha: 0.4, color });
    } finally {
      Object.assign(cfg, was);
    }
  });
});
