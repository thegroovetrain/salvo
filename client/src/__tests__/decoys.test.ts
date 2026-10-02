// DECOY-BUOY reconcile + render (render/decoys.ts, Story 8.16 — replacing the
// deleted radar buoy's render/buoys.ts) — the pure list -> sprite lifecycle
// diff, the own/other layer split, the owner-hue latch keyed on `by` for EVERY
// observer (amendment 124(a)), the own-spawn cue hook (the mines.ts precedent),
// the silhouette that shares NO primitive with a mine's, and the OWNER-ONLY hp
// arc (the amendment 124(f) implementer draft).
//
// The OWN/OTHER split rides DecoyView.own (mirroring MineView.own): an OWN decoy
// draws in the fog-immune chart layer, anyone else's in the fogged world layer.
// The own-spawn hook fires ONLY for newly-added OWN decoys (the `placeDecoy`
// cue), so it can never misfire on someone else's decoy.

import { describe, it, expect, vi } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { CONFIG, type DecoyView } from '@salvo/shared';
import { BUOY_MARKER, Decoys, decoyHpFrac, reconcileDecoys } from '../render/decoys.js';
import { Mines } from '../render/mines.js';
import { CLIENT_CONFIG } from '../config.js';

/** The amber fallback the hue latch paints while an owner hue is unresolved. */
const CONFIG_AMBER = CLIENT_CONFIG.colors.amber;

const decoy = (id: string, own = false, by = 'p1', hp?: number): DecoyView => ({
  id,
  x: 0,
  y: 0,
  own,
  by,
  ...(hp === undefined ? {} : { hp }),
});

/** Stub owner-hue resolver for the render harness (Story 1.12). */
const HUE = (): number => 0x123456;

/** Every path action one sprite's Graphics emitted, flattened. */
function pathActions(g: Graphics): string[] {
  return g.context.instructions.flatMap((ins) => {
    const path = (ins.data as { path?: { instructions: { action: string }[] } }).path;
    return path === undefined ? [] : path.instructions.map((p) => p.action);
  });
}

/** The single sprite one marker renderer put in a layer. */
function soleSprite(layer: Container): Graphics {
  expect(layer.children).toHaveLength(1);
  return layer.children[0] as Graphics;
}

describe('reconcileDecoys — decoy list → sprite lifecycle diff', () => {
  it('adds every decoy when starting from nothing', () => {
    const { add, remove } = reconcileDecoys(new Set(), [decoy('d1'), decoy('d2')]);
    expect(add.map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(remove).toEqual([]);
  });

  it('removes sprites whose decoy dropped out of the list (destroyed or out of view)', () => {
    const { add, remove } = reconcileDecoys(new Set(['d1', 'd2']), [decoy('d1')]);
    expect(add).toEqual([]);
    expect(remove).toEqual(['d2']);
  });

  it('leaves decoys present in both untouched (static — only the own hp arc moves)', () => {
    const { add, remove } = reconcileDecoys(new Set(['d1']), [decoy('d1'), decoy('d3')]);
    expect(add.map((d) => d.id)).toEqual(['d3']);
    expect(remove).toEqual([]);
  });

  it('empty incoming clears everything (match reset)', () => {
    const { add, remove } = reconcileDecoys(new Set(['d1', 'd2']), []);
    expect(add).toEqual([]);
    expect(remove.sort()).toEqual(['d1', 'd2']);
  });
});

describe('Decoys — own/other layer split, owner hue by `by`, own-spawn cue hook', () => {
  function harness() {
    const ownLayer = new Container();
    const otherLayer = new Container();
    const onOwnDecoySpawn = vi.fn();
    const decoys = new Decoys(ownLayer, otherLayer, onOwnDecoySpawn);
    return { ownLayer, otherLayer, onOwnDecoySpawn, decoys };
  }

  it('resolves each decoy’s tint from its OWNER id (`by`) for every observer — own and not', () => {
    const { decoys } = harness();
    const hueFor = vi.fn((by: string) => (by === 'alice' ? 0x111111 : 0x222222) as number | null);
    decoys.sync([decoy('d1', true, 'alice', 50), decoy('d2', false, 'bob')], hueFor);
    expect(hueFor.mock.calls.map((c) => c[0]).sort()).toEqual(['alice', 'bob']);
    expect(decoys.colorAt('d1')).toBe(0x111111);
    // Someone else's decoy is painted in ITS OWNER's hue, not ours and not amber.
    expect(decoys.colorAt('d2')).toBe(0x222222);
  });

  it('routes an OWN decoy to the chart layer and anyone else’s to the world layer', () => {
    const { ownLayer, otherLayer, decoys } = harness();
    decoys.sync([decoy('mine', true, 'me', 50), decoy('theirs', false)], HUE);
    expect(ownLayer.children).toHaveLength(1);
    expect(otherLayer.children).toHaveLength(1);
  });

  it('recolors a decoy that booted on the amber fallback once its owner hue resolves, then latches', () => {
    const { decoys } = harness();
    const hueFor = vi.fn((_by: string) => null as number | null);
    decoys.sync([decoy('d1', false, 'late')], hueFor);
    expect(decoys.colorAt('d1')).toBe(CONFIG_AMBER);
    hueFor.mockReturnValue(0x00ff00);
    decoys.sync([decoy('d1', false, 'late')], hueFor); // retry resolves + redraws
    expect(decoys.colorAt('d1')).toBe(0x00ff00);
    const afterResolve = hueFor.mock.calls.length;
    decoys.sync([decoy('d1', false, 'late')], hueFor); // latched — no more probes
    expect(hueFor.mock.calls.length).toBe(afterResolve);
  });

  it('fires the own-spawn hook ONLY for newly-added OWN decoys (never for anyone else’s)', () => {
    const { onOwnDecoySpawn, decoys } = harness();
    decoys.sync([decoy('mine', true, 'me', 50), decoy('theirs', false)], HUE);
    expect(onOwnDecoySpawn).toHaveBeenCalledTimes(1);
    expect(onOwnDecoySpawn.mock.calls[0][0].id).toBe('mine');
  });

  it('fires the hook once per drop, not every tick a decoy persists', () => {
    const { onOwnDecoySpawn, decoys } = harness();
    decoys.sync([decoy('mine', true, 'me', 50)], HUE);
    decoys.sync([decoy('mine', true, 'me', 35)], HUE); // still present (and hit) — no re-cue
    expect(onOwnDecoySpawn).toHaveBeenCalledTimes(1);
  });

  it('clears both layers when the incoming list empties', () => {
    const { ownLayer, otherLayer, decoys } = harness();
    decoys.sync([decoy('mine', true, 'me', 50), decoy('theirs', false)], HUE);
    decoys.sync([], HUE);
    expect(ownLayer.children).toHaveLength(0);
    expect(otherLayer.children).toHaveLength(0);
  });
});

describe('the decoy silhouette is distinct from a mine marker (Eric, 7-5-decks.md)', () => {
  /** Someone else's marker of each kind: no owner readout, so what is compared
   *  is the MARKER itself and nothing else. */
  function markers() {
    const decoyLayer = new Container();
    new Decoys(new Container(), decoyLayer).sync([decoy('b', false)], HUE);
    const mineLayer = new Container();
    new Mines(new Container(), mineLayer).sync([{ id: 'm', x: 0, y: 0, own: false, by: 'p1' }], HUE);
    return { decoy: pathActions(soleSprite(decoyLayer)), mine: pathActions(soleSprite(mineLayer)) };
  }

  it('the mine marker has a circle and the decoy marker has none', () => {
    const { decoy: b, mine: m } = markers();
    expect(m).toContain('circle');
    expect(b).not.toContain('circle');
    expect(b).not.toContain('arc');
  });

  it('the decoy marker is the spar-buoy linework: strokes plus a polygon topmark', () => {
    const { decoy: b } = markers();
    expect(b).toContain('poly'); // the diamond radar-reflector daymark
    expect(b.filter((a) => a === 'lineTo').length).toBeGreaterThanOrEqual(2); // waterline + spar
  });

  // Re-pinned in cycle 162: the mine marker became the naval mine's GLYPH
  // (a spiked sphere — a circle plus eight `lineTo` spikes), so both markers
  // now stroke straight lines and "no shared primitive" no longer holds. What
  // must hold is that neither can be mistaken for the other: each draws a
  // shape the other never does, and the full drawing sequences differ.
  it('each marker draws a shape the other never does, and the drawings differ', () => {
    const { decoy: b, mine: m } = markers();
    expect(m).toContain('circle'); // the mine's sphere
    expect(b).not.toContain('circle');
    expect(b).toContain('poly'); // the decoy's diamond daymark
    expect(m).not.toContain('poly');
    expect(b.join(',')).not.toBe(m.join(','));
  });

  it('the exported geometry is a waterline, a spar and a 4-point diamond', () => {
    expect(BUOY_MARKER.topmark).toHaveLength(4);
    expect(BUOY_MARKER.spar[0]).toEqual({ x: 0, y: 0 });
    expect(BUOY_MARKER.spar[1].y).toBeLessThan(0);
    for (const p of BUOY_MARKER.topmark) expect(p.y).toBeLessThan(BUOY_MARKER.waterline[0].y);
  });
});

// --- THE OWNER-ONLY HP ARC (amendment 124(f) — IMPLEMENTER DRAFT) -----------

describe('decoyHpFrac — the owner’s readout of its decoy’s hull', () => {
  it('is hp / CONFIG.decoyBuoy.hp for an own decoy: full at the drop, shrinking under fire', () => {
    expect(decoyHpFrac({ own: true, hp: CONFIG.decoyBuoy.hp })).toBe(1);
    expect(decoyHpFrac({ own: true, hp: CONFIG.decoyBuoy.hp / 2 })).toBeCloseTo(0.5, 9);
  });

  it('is null for someone else’s decoy, and for an own view without `hp`', () => {
    expect(decoyHpFrac({ own: false })).toBeNull();
    expect(decoyHpFrac({ own: false, hp: 50 })).toBeNull(); // defensive: never an enemy’s number
    expect(decoyHpFrac({ own: true })).toBeNull();
  });

  it('clamps rather than running negative or past full', () => {
    expect(decoyHpFrac({ own: true, hp: -5 })).toBe(0);
    expect(decoyHpFrac({ own: true, hp: CONFIG.decoyBuoy.hp * 3 })).toBe(1);
  });
});

describe('Decoys — the hp arc is owner-only and follows the wire', () => {
  it('an OWN decoy with `hp` draws its masthead arc; someone else’s draws none', () => {
    const ownLayer = new Container();
    const otherLayer = new Container();
    const d = new Decoys(ownLayer, otherLayer);
    d.sync([decoy('mine', true, 'me', CONFIG.decoyBuoy.hp), decoy('theirs', false)], HUE);
    expect(d.hpFracAt('mine')).toBe(1);
    expect(d.hpFracAt('theirs')).toBeNull();
    expect(pathActions(soleSprite(ownLayer))).toContain('arc');
    expect(pathActions(soleSprite(otherLayer))).not.toContain('arc');
  });

  it('the arc shrinks as the owner’s decoy takes damage (35 of 50 hp)', () => {
    const d = new Decoys(new Container(), new Container());
    d.sync([decoy('mine', true, 'me', 50)], HUE);
    d.sync([decoy('mine', true, 'me', 35)], HUE);
    expect(d.hpFracAt('mine')).toBeCloseTo(35 / CONFIG.decoyBuoy.hp, 9);
  });

  it('an own view that somehow lacks `hp` draws the marker alone, never a crash', () => {
    const ownLayer = new Container();
    const d = new Decoys(ownLayer, new Container());
    d.sync([decoy('mine', true, 'me')], HUE);
    expect(d.hpFracAt('mine')).toBeNull();
    expect(pathActions(soleSprite(ownLayer))).not.toContain('arc');
  });
});
