// Story 11.8 — the strategic-zoom chart marks: the band fade (brackets and
// chart icons), the corner brackets on hulls, the mine / crate icon handover
// and the splash pegs.
import { describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { CONFIG, DEFAULT_CLASS_ID, type EffectiveMine, type MineView } from '@salvo/shared';
import { bandAlpha, bracketAlpha, chartIconAlpha, renderChartMarks, screenScale } from '../render/chartMarks.js';
import { HullBrackets, bracketTicks } from '../render/brackets.js';
import { SplashPegs, pegAlpha, pegKindFor } from '../render/pegs.js';
import { ShipView } from '../render/ships.js';
import { Mines, GLYPH_R } from '../render/mines.js';
import { CRATE_SIDE_U, Drops } from '../render/drops.js';
import { CLIENT_CONFIG } from '../config.js';

const M = CLIENT_CONFIG.chartMarks;
const OWN_STYLE = { stroke: 0x00e5ff, fill: null };

describe('bandAlpha — the linear fade across a band centered on a threshold', () => {
  it('is 1 at and below the low edge, 0 at and above the high edge, linear between', () => {
    expect(bandAlpha(10, 24, 0.3)).toBe(1);
    expect(bandAlpha(20.4, 24, 0.3)).toBeCloseTo(1, 9);
    expect(bandAlpha(24, 24, 0.3)).toBeCloseTo(0.5, 9);
    expect(bandAlpha(27.6, 24, 0.3)).toBeCloseTo(0, 9);
    expect(bandAlpha(30, 24, 0.3)).toBe(0);
    expect(bandAlpha(22.2, 24, 0.3)).toBeCloseTo(0.75, 9);
  });

  it('is a hard step with no band, and 0 for a non-finite size', () => {
    expect(bandAlpha(23.9, 24, 0)).toBe(1);
    expect(bandAlpha(24, 24, 0)).toBe(0);
    expect(bandAlpha(Number.NaN, 24, 0.3)).toBe(0);
    expect(bandAlpha(Number.POSITIVE_INFINITY, 24, 0.3)).toBe(0);
  });

  it('brackets follow the hull-length threshold and icons the icon size, both on the shared band', () => {
    expect(bracketAlpha(M.bracketThresholdPx)).toBeCloseTo(0.5, 9);
    expect(chartIconAlpha(M.iconPx)).toBeCloseTo(0.5, 9);
    expect(bracketAlpha(M.bracketThresholdPx * (1 + M.bandFrac / 2))).toBeCloseTo(0, 9);
    expect(chartIconAlpha(M.iconPx * (1 - M.bandFrac / 2))).toBeCloseTo(1, 9);
  });

  it('screenScale undoes the zoom, and falls back to 1 for a degenerate zoom', () => {
    expect(screenScale(0.25)).toBe(4);
    expect(screenScale(0)).toBe(1);
    expect(screenScale(Number.NaN)).toBe(1);
  });
});

describe('bracketTicks — four corner ticks of the half-box', () => {
  it('puts each tick on a corner with both arms the tick length, axis-aligned', () => {
    const ticks = bracketTicks(16, 6);
    expect(ticks).toHaveLength(4);
    for (const [x0, y0, x1, y1, x2, y2] of ticks) {
      expect(Math.abs(x1)).toBe(16);
      expect(Math.abs(y1)).toBe(16);
      expect(Math.hypot(x0 - x1, y0 - y1)).toBe(6);
      expect(Math.hypot(x2 - x1, y2 - y1)).toBe(6);
      expect(y0).toBe(y1); // one arm horizontal
      expect(x2).toBe(x1); // the other vertical
      expect(Math.abs(x0)).toBeLessThan(16); // both arms point inward
      expect(Math.abs(y2)).toBeLessThan(16);
    }
  });
});

describe('HullBrackets — on hulls drawing small, in the relation color, at screen size', () => {
  const lengthU = CONFIG.shipClasses[DEFAULT_CLASS_ID].hull.length;
  const zoomFor = (px: number): number => px / lengthU;
  function setup() {
    const layer = new Container();
    const own = new ShipView(OWN_STYLE, DEFAULT_CLASS_ID);
    own.update(100, -50, 1);
    return { layer, own, brackets: new HullBrackets(layer) };
  }
  const shownBrackets = (layer: Container): Container[] => layer.children.filter((c) => c.visible);

  it('a hull 10 px long wears its brackets at full alpha; at 30 px none show', () => {
    const { layer, own, brackets } = setup();
    brackets.render(own, [], zoomFor(10));
    expect(brackets.shown).toBe(1);
    const [b] = shownBrackets(layer);
    expect(b.alpha).toBeCloseTo(1, 9);
    expect(b.tint).toBe(OWN_STYLE.stroke);
    expect(b.position.x).toBe(100);
    expect(b.position.y).toBe(-50);
    expect(b.rotation).toBe(0); // axis-aligned, whatever the heading
    expect(b.scale.x).toBeCloseTo(1 / zoomFor(10), 9); // screen size
    brackets.render(own, [], zoomFor(30));
    expect(brackets.shown).toBe(0);
    expect(shownBrackets(layer)).toHaveLength(0);
  });

  it('frames every passed contact in ITS relation color, and multiplies in the hull\'s own alpha', () => {
    const { own, brackets, layer } = setup();
    const enemy = new ShipView({ stroke: 0xff3355, fill: null }, DEFAULT_CLASS_ID);
    enemy.update(0, 0, 0);
    enemy.setFade(0.5);
    brackets.render(own, [enemy], zoomFor(10));
    expect(brackets.shown).toBe(2);
    const tints = shownBrackets(layer).map((c) => [c.tint, c.alpha]);
    expect(tints).toContainEqual([0xff3355, expect.closeTo(0.5, 9)]);
  });

  it('a hidden or never-posed hull gets no bracket', () => {
    const { own, brackets } = setup();
    own.gfx.visible = false;
    const unposed = new ShipView(OWN_STYLE, DEFAULT_CLASS_ID);
    brackets.render(own, [unposed], zoomFor(10));
    expect(brackets.shown).toBe(0);
  });
});

describe('the chart icon handover — mines', () => {
  const zoomFor = (truePx: number): number => truePx / (2 * GLYPH_R);
  const row = (blastRadius: number, triggerRadius: number): EffectiveMine => ({
    tier: 1, reloadMs: 15_000, maxAmmo: 2, damage: 55, blastRadius, triggerRadius, homingTurnRate: 0, slowFactor: 1,
  });
  const rings = { rows: { naval: row(48, 32), captive: row(32, 144), fouling: row(72, 48) }, now: 0 };
  const mine = (id: string, own: boolean): MineView => ({ id, x: 5, y: 7, own, by: 'p', c: 'naval' });

  it('a mine drawing 5 px true shows its 10 px icon in full and hides the true marker; at 20 px only the true marker', () => {
    const own = new Container();
    const enemy = new Container();
    const mines = new Mines(own, enemy);
    mines.sync([mine('a', true), mine('b', false)], rings);
    mines.renderIcons(zoomFor(5));
    expect(mines.iconAlphaAt('a')).toBeCloseTo(1, 9);
    expect(mines.iconAlphaAt('b')).toBeCloseTo(1, 9);
    mines.renderIcons(zoomFor(20));
    expect(mines.iconAlphaAt('a')).toBe(0);
    expect(mines.iconAlphaAt('b')).toBe(0);
  });

  it('cross-fades at the threshold, and the own rings stay true size and full strength', () => {
    const own = new Container();
    const mines = new Mines(own, new Container());
    mines.sync([mine('a', true)], rings);
    const before = mines.ringsAt('a');
    mines.renderIcons(zoomFor(M.iconPx));
    expect(mines.iconAlphaAt('a')).toBeCloseTo(0.5, 9);
    const [marker, ringG, icon] = own.children;
    expect(marker.alpha).toBeCloseTo(0.5, 9);
    expect(ringG.alpha).toBe(1);
    expect(ringG.scale.x).toBe(1);
    expect(icon.scale.x).toBeCloseTo(1 / zoomFor(M.iconPx), 9);
    expect(icon.position.x).toBe(5);
    expect(mines.ringsAt('a')).toEqual(before);
  });
});

describe('the chart icon handover — airdrops and the salvage wreck', () => {
  const zoomFor = (truePx: number): number => truePx / CRATE_SIDE_U;
  it('every crate kind hands over to its icon below 10 px and back above', () => {
    const layer = new Container();
    const d = new Drops(layer);
    d.sync([{ id: 'w', x: 1, y: 2, c: 'wreck' }, { id: 'a', x: 3, y: 4, c: 'armor' }]);
    d.renderIcons(zoomFor(4));
    expect(d.iconAlphaAt('w')).toBeCloseTo(1, 9);
    expect(d.iconAlphaAt('a')).toBeCloseTo(1, 9);
    expect(d.spriteOf('w')?.visible).toBe(false);
    d.renderIcons(zoomFor(M.iconPx));
    expect(d.iconAlphaAt('w')).toBeCloseTo(0.5, 9);
    expect(d.spriteOf('w')?.alpha).toBeCloseTo(0.5, 9);
    d.renderIcons(zoomFor(40));
    expect(d.iconAlphaAt('w')).toBe(0);
    expect(d.spriteOf('w')?.visible).toBe(true);
    expect(d.spriteOf('w')?.alpha).toBe(1);
  });
});

describe('splash pegs', () => {
  it('pegKindFor: an own sp is a miss, an own hc a hit; another captain\'s rows and other kinds lay nothing', () => {
    expect(pegKindFor({ k: 'sp', id: 'me' }, 'me')).toBe('miss');
    expect(pegKindFor({ k: 'hc', id: 'me' }, 'me')).toBe('hit');
    expect(pegKindFor({ k: 'hc', id: 'them' }, 'me')).toBeNull();
    expect(pegKindFor({ k: 'sp', id: 'them' }, 'me')).toBeNull();
    expect(pegKindFor({ k: 'boom', id: 'me' }, 'me')).toBeNull();
    expect(pegKindFor({ k: 'sp', id: '' }, '')).toBeNull();
  });

  it('pegAlpha falls linearly 1 → 0 over the fade, and is 0 after', () => {
    expect(pegAlpha(0, 15_000)).toBe(1);
    expect(pegAlpha(-200, 15_000)).toBe(1);
    expect(pegAlpha(7_500, 15_000)).toBeCloseTo(0.5, 9);
    expect(pegAlpha(15_000, 15_000)).toBe(0);
    expect(pegAlpha(20_000, 15_000)).toBe(0);
    expect(pegAlpha(Number.NaN, 15_000)).toBe(0);
  });

  it('a peg shows at its point at screen size, fades, and is removed once the fade is done', () => {
    const layer = new Container();
    const pegs = new SplashPegs(layer);
    pegs.add('miss', 10, 20, 1_000);
    pegs.add('hit', -5, 3, 1_000);
    pegs.render(1_000 + M.pegFadeMs / 2, 0.5);
    expect(pegs.count).toBe(2);
    const drawn = layer.children.flatMap((c) => c.children) as Graphics[];
    expect(drawn.map((g) => g.alpha)).toEqual([expect.closeTo(0.5, 9), expect.closeTo(0.5, 9)]);
    expect(drawn[0].scale.x).toBe(2);
    expect(drawn[0].position.x).toBe(10);
    pegs.render(1_000 + M.pegFadeMs, 0.5);
    expect(pegs.count).toBe(0);
  });

  it('hits draw above misses, and the pool recycles the oldest past its cap', () => {
    const layer = new Container();
    const pegs = new SplashPegs(layer);
    const [misses, hits] = layer.children;
    pegs.add('hit', 0, 0, 0);
    pegs.add('miss', 0, 0, 0);
    expect(hits.children).toHaveLength(1);
    expect(misses.children).toHaveLength(1);
    expect(layer.getChildIndex(hits)).toBeGreaterThan(layer.getChildIndex(misses));
    for (let i = 0; i < M.pegCap; i++) pegs.add('miss', i, 0, 1);
    expect(pegs.count).toBe(M.pegCap);
    expect(pegs.kinds()).not.toContain('hit');
  });
});

describe('teardown releases the chart marks (Story 11.8 review)', () => {
  it('SplashPegs.destroy frees live and spare Graphics and both shared contexts', () => {
    const layer = new Container();
    const pegs = new SplashPegs(layer);
    pegs.add('miss', 0, 0, 0);
    pegs.add('hit', 1, 1, 0);
    pegs.add('miss', 2, 2, 0);
    pegs.render(M.pegFadeMs / 2, 1);
    const live = layer.children.flatMap((c) => c.children) as Graphics[];
    const contexts = new Set(live.map((g) => g.context));
    pegs.render(M.pegFadeMs + 1, 1); // all retire to the spare pool
    pegs.add('hit', 3, 3, M.pegFadeMs + 1); // one live again
    pegs.destroy();
    expect(pegs.count).toBe(0);
    expect(live.every((g) => g.destroyed)).toBe(true);
    expect(contexts.size).toBe(2);
    for (const ctx of contexts) expect(ctx.destroyed).toBe(true);
    expect(layer.children.flatMap((c) => c.children)).toHaveLength(0);
  });

  it('HullBrackets.destroy frees every pooled bracket', () => {
    const layer = new Container();
    const own = new ShipView(OWN_STYLE, DEFAULT_CLASS_ID);
    own.update(0, 0, 0);
    const brackets = new HullBrackets(layer);
    brackets.render(own, [], 10 / CONFIG.shipClasses[DEFAULT_CLASS_ID].hull.length);
    const pooled = [...layer.children] as Graphics[];
    expect(pooled).toHaveLength(1);
    brackets.destroy();
    expect(pooled[0].destroyed).toBe(true);
    expect(layer.children).toHaveLength(0);
    expect(brackets.shown).toBe(0);
  });
});

describe('renderChartMarks — one driver per frame', () => {
  it('brackets the hulls, hands the zoom to the icons, and ages the pegs to the frame time', () => {
    const layer = new Container();
    const ownView = new ShipView(OWN_STYLE, DEFAULT_CLASS_ID);
    ownView.update(0, 0, 0);
    const calls: string[] = [];
    const pegs = new SplashPegs(layer);
    pegs.add('hit', 0, 0, 0);
    const brackets = new HullBrackets(layer);
    renderChartMarks({
      brackets, pegs, ownView,
      mines: { renderIcons: (z) => calls.push(`mines:${z}`) },
      drops: { renderIcons: (z) => calls.push(`drops:${z}`) },
      contactViews: { shipViews: () => [] },
    }, 0.01, M.pegFadeMs + 1);
    expect(calls).toEqual(['mines:0.01', 'drops:0.01']);
    expect(brackets.shown).toBe(1);
    expect(pegs.count).toBe(0);
  });
});
