// Story 10.9 — the airdrop renderer (render/drops.ts): the pure layout core,
// the three candidate bodies, and the add/remove reconcile of the adapter.
import { describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { CONFIG, type DropView } from '@salvo/shared';
import { Drops, buildCrate, crateLayout, crateStyle, drawCrate, type CrateVariant } from '../render/drops.js';
import { glyphPaths } from '../render/equipmentIcons.js';

const crate = (id: string, x = 0, y = 0): DropView => ({ id, x, y, g: [['armor', 3]] });
const bundle: DropView = { id: 'w', x: 5, y: 6, g: [['armor', 3], ['intel', 1], ['range', 5]] };
const VARIANTS: CrateVariant[] = ['A', 'B', 'C'];

describe('Drops — the add/remove reconcile', () => {
  it('adds one child per view, positioned at its (x, y)', () => {
    const layer = new Container();
    const d = new Drops(layer);
    d.sync([crate('a', 10, 20), crate('b', -30, 40)]);
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
  it('every stat a roll may land on has a glyph to draw', () => {
    for (const stat of CONFIG.drops.indices) expect(glyphPaths(stat), stat).not.toBeNull();
  });

  it.each(VARIANTS)('variant %s draws a crate and a 3-roll bundle without throwing', (v) => {
    for (const view of [crate('a'), bundle]) {
      const g = new Graphics();
      expect(() => drawCrate(g, view, crateStyle(v))).not.toThrow();
      const root = buildCrate(view, crateStyle(v));
      expect(root.children[0]).toBeInstanceOf(Graphics);
      expect(root.children).toHaveLength(1 + view.g.length); // the body + one numeral per roll
    }
  });

  it('a single crate fits the pickup disc; a bundle is one cell per roll, in a wider body', () => {
    for (const v of VARIANTS) {
      const one = crateLayout(crate('a'), crateStyle(v));
      expect(one.halfW).toBeLessThanOrEqual(CONFIG.drops.radiusU);
      expect(one.cells).toHaveLength(1);
      const three = crateLayout(bundle, crateStyle(v));
      expect(three.cells.map((c) => c.stat)).toEqual(bundle.g.map(([s]) => s));
      expect(three.halfW).toBeGreaterThan(one.halfW);
      expect(three.halfH).toBe(one.halfH);
    }
  });

  it('prints each roll\'s amount — beside a crate, under each glyph of a bundle', () => {
    const style = crateStyle('A');
    const one = crateLayout(crate('a'), style);
    expect(one.numerals.map((n) => n.text)).toEqual(['+3']);
    const three = crateLayout(bundle, style);
    expect(three.numerals.map((n) => n.text)).toEqual(bundle.g.map(([, n]) => `+${n}`));
    three.numerals.forEach((n, i) => {
      expect(n.x).toBe(three.cells[i].cx);
      expect(n.y).toBeGreaterThan(three.halfH);
    });
  });
});
