import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import type { MineView } from '@salvo/shared';
import { reconcileMines, mineMoved, Mines, type MinePos } from '../render/mines.js';

const mine = (id: string, own = false, by = 'p1'): MineView => ({ id, x: 0, y: 0, own, by });
/** A mine at a world point (the SELF-PROPELLED cases move them around). */
const at = (id: string, x: number, y: number): MineView => ({ id, x, y, own: false, by: 'p1' });
/** Sprites we currently hold, id → where we last drew them. */
const held = (...entries: [string, number, number][]): Map<string, MinePos> =>
  new Map(entries.map(([id, x, y]) => [id, { x, y }]));
/** Sprites held at the origin (the pre-2.9 "just these ids" shorthand). */
const heldAtOrigin = (...ids: string[]): Map<string, MinePos> =>
  held(...ids.map((id) => [id, 0, 0] as [string, number, number]));

describe('reconcileMines — mine list → sprite lifecycle diff', () => {
  it('adds every mine when starting from nothing', () => {
    const { add, move, remove } = reconcileMines(new Map(), [mine('m1'), mine('m2', true)]);
    expect(add.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(move).toEqual([]);
    expect(remove).toEqual([]);
  });

  it('removes sprites whose mine dropped out of the list (triggered or fogged)', () => {
    const { add, remove } = reconcileMines(heldAtOrigin('m1', 'm2'), [mine('m1')]);
    expect(add).toEqual([]);
    expect(remove).toEqual(['m2']);
  });

  it('leaves a mine present in both AT THE SAME POINT untouched (moored)', () => {
    const { add, move, remove } = reconcileMines(heldAtOrigin('m1'), [mine('m1'), mine('m3')]);
    expect(add.map((m) => m.id)).toEqual(['m3']);
    expect(move).toEqual([]);
    expect(remove).toEqual([]);
  });

  it('handles a full swap (all gone, all new)', () => {
    const { add, remove } = reconcileMines(heldAtOrigin('a', 'b'), [mine('c')]);
    expect(add.map((m) => m.id)).toEqual(['c']);
    expect(remove.sort()).toEqual(['a', 'b']);
  });

  it('empty incoming clears everything', () => {
    const { add, remove } = reconcileMines(heldAtOrigin('a', 'b'), []);
    expect(add).toEqual([]);
    expect(remove.sort()).toEqual(['a', 'b']);
  });
});

// --- STORY 2.9: THE FROZEN-RENDERER DEFECT ------------------------------------
//
// Story 2.8's SELF-PROPELLED doctrine put mines under power: the server creeps
// them and re-sends their positions every tick. The renderer's "mines are
// static" assumption silently discarded every one of those updates, so the
// marker sat at the drop point while the live mine walked away — the player was
// shown a lie about where the lethal thing was. reconcile() now reports MOVES.

describe('reconcileMines — the creep (move) path', () => {
  it('reports a held mine that TRAVELLED as a move, not an add and not a removal', () => {
    const { add, move, remove } = reconcileMines(held(['m1', 0, 0]), [at('m1', 12, 0)]);
    expect(add).toEqual([]);
    expect(remove).toEqual([]);
    expect(move.map((m) => [m.id, m.x, m.y])).toEqual([['m1', 12, 0]]);
  });

  it('separates the creepers from the moored ones in one sync', () => {
    const { add, move, remove } = reconcileMines(
      held(['moored', 5, 5], ['creeper', 0, 0], ['gone', 9, 9]),
      [at('moored', 5, 5), at('creeper', 0, 30), at('fresh', 1, 1)],
    );
    expect(add.map((m) => m.id)).toEqual(['fresh']);
    expect(move.map((m) => m.id)).toEqual(['creeper']);
    expect(remove).toEqual(['gone']);
  });

  it('mineMoved ignores float noise but catches a real crawl', () => {
    expect(mineMoved({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(false);
    expect(mineMoved({ x: 0, y: 0 }, { x: 0.001, y: 0 })).toBe(false);
    expect(mineMoved({ x: 0, y: 0 }, { x: 0, y: 0.5 })).toBe(true);
  });
});

describe('Mines.sync — a creeping mine MOVES on screen (the defect fix)', () => {
  it('walks the sprite with the wire position instead of freezing it at the drop point', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([at('m1', 0, 0)], () => 0x00ff00);
    expect(mines.spriteAt('m1')).toEqual({ x: 0, y: 0, bearing: null });
    // Three ticks of creep down +x. Before Story 2.9 the sprite stayed at 0,0.
    for (const x of [10, 20, 30]) mines.sync([at('m1', x, 0)], () => 0x00ff00);
    expect(mines.spriteAt('m1')?.x).toBe(30);
  });

  it('turns the creep tick onto the course made good (a STATIC tell — reads at motion=off)', () => {
    const mines = new Mines(new Container(), new Container());
    mines.sync([at('m1', 0, 0)], () => 0x00ff00);
    expect(mines.spriteAt('m1')?.bearing).toBeNull(); // a moored mine has no course
    mines.sync([at('m1', 0, 20)], () => 0x00ff00); // due +y
    expect(mines.spriteAt('m1')?.bearing).toBeCloseTo(Math.PI / 2, 9);
    mines.sync([at('m1', -20, 20)], () => 0x00ff00); // turned onto -x
    expect(mines.spriteAt('m1')?.bearing).toBeCloseTo(Math.PI, 9);
  });

  it('lays a wake behind the creep — one dot per spacing interval, none while moored', () => {
    const wake = vi.fn();
    const mines = new Mines(new Container(), new Container(), undefined, wake);
    mines.sync([at('m1', 0, 0)], () => 0x00ff00);
    expect(wake).not.toHaveBeenCalled(); // a drop is not a creep
    mines.sync([at('m1', 0, 0)], () => 0x00ff00); // re-sent verbatim: still moored
    expect(wake).not.toHaveBeenCalled();
    mines.sync([at('m1', 100, 0)], () => 0x00ff00); // a long leg pays out several
    const afterLeg = wake.mock.calls.length;
    expect(afterLeg).toBeGreaterThan(1);
    mines.sync([at('m1', 100, 0)], () => 0x00ff00); // stopped again — nothing more
    expect(wake.mock.calls.length).toBe(afterLeg);
  });
});

describe('Mines — firer-hue tint (Story 1.12) + own/enemy layer split', () => {
  function harness() {
    const ownLayer = new Container();
    const enemyLayer = new Container();
    const mines = new Mines(ownLayer, enemyLayer);
    return { ownLayer, enemyLayer, mines };
  }

  it('resolves each new mine’s tint from its dropper id (`by`) via hueFor', () => {
    const { mines } = harness();
    const hueFor = vi.fn((_by: string) => 0x123456);
    mines.sync([mine('m1', true, 'alice'), mine('m2', false, 'bob')], hueFor);
    expect(hueFor.mock.calls.map((c) => c[0]).sort()).toEqual(['alice', 'bob']);
  });

  it('routes own mines to the chart layer and enemy mines to the world layer', () => {
    const { ownLayer, enemyLayer, mines } = harness();
    mines.sync([mine('m1', true, 'me'), mine('m2', false, 'foe')], () => 0x00ff00);
    expect(ownLayer.children).toHaveLength(1);
    expect(enemyLayer.children).toHaveLength(1);
  });

  it('recolors a mine that booted on the amber fallback once its firer hue later resolves, then latches', () => {
    const { mines } = harness();
    // hueFor returns null at spawn (roster hue not yet synced) → amber fallback.
    const hueFor = vi.fn((_by: string) => null as number | null);
    mines.sync([mine('m1', true, 'late')], hueFor);
    expect(hueFor).toHaveBeenCalled(); // probed at spawn + retry, still unresolved
    // The roster hue lands: the next sync's retry resolves + redraws once.
    hueFor.mockReturnValue(0x00ff00);
    mines.sync([mine('m1', true, 'late')], hueFor);
    const afterResolve = hueFor.mock.calls.length;
    // Latched now — a further sync must NOT probe the resolved marker again.
    mines.sync([mine('m1', true, 'late')], hueFor);
    expect(hueFor.mock.calls.length).toBe(afterResolve);
  });
});
