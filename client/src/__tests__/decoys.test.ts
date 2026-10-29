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

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { BUOY_KINDS, BUOY_LINE_IDS, CONFIG, buoyKindOf, type BuoyKind, type DecoyView } from '@salvo/shared';
import { Decoys, buoyLifeFrac, buoyLineOf, decoyHpFrac, reconcileDecoys } from '../render/decoys.js';
import { BUOY_HEADS } from '../render/buoyMarks.js';
import { ringModelFor } from '../render/buoyRings.js';
import { alertClock, alertTint } from '../render/alertBlend.js';
import { Mines } from '../render/mines.js';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';

/** The amber fallback the hue latch paints while an owner hue is unresolved. */
const CONFIG_AMBER = CLIENT_CONFIG.colors.amber;

const decoy = (id: string, own = false, by = 'p1', hp?: number, kind: BuoyKind = 'healing'): DecoyView => ({
  id,
  x: 0,
  y: 0,
  own,
  by,
  kind,
  ...(hp === undefined ? {} : { hp }),
});

/** Stub owner-hue resolver for the render harness (Story 1.12). */
const HUE = (): number => 0x123456;

/** Every fill colour one sprite's Graphics painted. */
function fillColors(g: Graphics): number[] {
  return g.context.instructions.flatMap((ins) => {
    if (ins.action !== 'fill') return [];
    const style = (ins.data as { style?: { color?: number } }).style;
    return style?.color === undefined ? [] : [style.color];
  });
}

/** Every path action one sprite's Graphics emitted, flattened. */
function pathActions(g: Graphics): string[] {
  return g.context.instructions.flatMap((ins) => {
    const path = (ins.data as { path?: { instructions: { action: string }[] } }).path;
    return path === undefined ? [] : path.instructions.map((p) => p.action);
  });
}

/** The single buoy's MARKER in a layer — each buoy puts two Graphics there:
 *  its effect ring first (beneath), then its marker. */
function soleSprite(layer: Container): Graphics {
  expect(layer.children).toHaveLength(2);
  return layer.children[1] as Graphics;
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

  it('routes an OWN decoy (marker + ring) to the chart layer and anyone else’s to the world layer', () => {
    const { ownLayer, otherLayer, decoys } = harness();
    decoys.sync([decoy('mine', true, 'me', 50), decoy('theirs', false)], HUE);
    expect(ownLayer.children).toHaveLength(2);
    expect(otherLayer.children).toHaveLength(2);
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
    new Mines(new Container(), mineLayer).sync([{ id: 'm', x: 0, y: 0, own: false, by: 'p1' }]);
    return { decoy: pathActions(soleSprite(decoyLayer)), mine: pathActions(mineLayer.children[0] as Graphics) };
  }

  it('the buoy marker is the tinted beacon: hull strokes plus a filled head polygon', () => {
    const { decoy: b } = markers();
    expect(b).toContain('poly'); // the filled head
    expect(b.filter((a) => a === 'lineTo').length).toBeGreaterThanOrEqual(3); // waterline + can + mast
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
    expect(b).toContain('poly'); // the buoy's filled head
    expect(m).not.toContain('poly');
    expect(b.join(',')).not.toBe(m.join(','));
  });
});

// --- THE OWNER-ONLY HP ARC (amendment 124(f) — IMPLEMENTER DRAFT) -----------

describe('decoyHpFrac — the owner’s readout of its decoy’s hull', () => {
  it('is hp / CONFIG.buoy.hp for an own decoy: full at the drop, shrinking under fire', () => {
    expect(decoyHpFrac({ own: true, hp: CONFIG.buoy.hp })).toBe(1);
    expect(decoyHpFrac({ own: true, hp: CONFIG.buoy.hp / 2 })).toBeCloseTo(0.5, 9);
  });

  it('is null for someone else’s decoy, and for an own view without `hp`', () => {
    expect(decoyHpFrac({ own: false })).toBeNull();
    expect(decoyHpFrac({ own: false, hp: 50 })).toBeNull(); // defensive: never an enemy’s number
    expect(decoyHpFrac({ own: true })).toBeNull();
  });

  it('clamps rather than running negative or past full', () => {
    expect(decoyHpFrac({ own: true, hp: -5 })).toBe(0);
    expect(decoyHpFrac({ own: true, hp: CONFIG.buoy.hp * 3 })).toBe(1);
  });
});

describe('Decoys — the hp arc is owner-only and follows the wire', () => {
  it('an OWN decoy with `hp` draws its masthead arc; someone else’s draws none', () => {
    const ownLayer = new Container();
    const otherLayer = new Container();
    const d = new Decoys(ownLayer, otherLayer);
    d.sync([decoy('mine', true, 'me', CONFIG.buoy.hp), decoy('theirs', false)], HUE);
    expect(d.hpFracAt('mine')).toBe(1);
    expect(d.hpFracAt('theirs')).toBeNull();
    expect(pathActions(soleSprite(ownLayer))).toContain('arc');
    expect(pathActions(soleSprite(otherLayer))).not.toContain('arc');
  });

  it('the arc shrinks as the owner’s buoy takes damage', () => {
    const d = new Decoys(new Container(), new Container());
    d.sync([decoy('mine', true, 'me', CONFIG.buoy.hp)], HUE);
    d.sync([decoy('mine', true, 'me', CONFIG.buoy.hp * 0.7)], HUE);
    expect(d.hpFracAt('mine')).toBeCloseTo(0.7, 9);
  });

  it('an own view that somehow lacks `hp` draws the marker alone, never a crash', () => {
    const ownLayer = new Container();
    const d = new Decoys(ownLayer, new Container());
    d.sync([decoy('mine', true, 'me')], HUE);
    expect(d.hpFracAt('mine')).toBeNull();
    expect(pathActions(soleSprite(ownLayer))).not.toContain('arc');
  });
});

// --- STORY 10.9: THE FOUR BUOYS — kind mark, own life arc, enemy shows no timer --

const withLife = (d: DecoyView, until: number): DecoyView => ({ ...d, until });

describe('the tinted beacon on the chart — hull in the owner hue, head in the kind colour', () => {
  it('own AND sighted enemy markers draw hull + head per kind, the head filled in the kind’s colour', () => {
    for (const own of [true, false]) {
      const drawn = BUOY_KINDS.map((k) => {
        const layer = new Container();
        const d = new Decoys(own ? layer : new Container(), own ? new Container() : layer);
        d.sync([decoy('b', own, 'p1', own ? CONFIG.buoy.hp : undefined, k)], HUE);
        expect(d.kindAt('b')).toBe(k);
        const g = soleSprite(layer);
        expect(pathActions(g), `${k} own=${own}`).not.toContain('circle');
        expect(fillColors(g), `${k} own=${own}`).toContain(BUOY_HEADS[k].color);
        return `${pathActions(g).join(',')}|${fillColors(g).join(',')}`;
      });
      expect(new Set(drawn).size).toBe(BUOY_KINDS.length);
    }
  });

  it('the marker draws the buoy line’s own glyph (the belt’s vocabulary): the line ↔ kind map is total', () => {
    for (const line of BUOY_LINE_IDS) expect(buoyLineOf(buoyKindOf(line))).toBe(line);
  });
});

// --- STORY 10.9 (Eric 2026-10-29): THE EFFECT RINGS --------------------------

describe('ringModelFor — the effect ring view-model', () => {
  const L = CONFIG.buoy.lifetimeMs;
  const ALERT = 0xabcdef;

  it('own RADAR: a silver dashed ring with NO interior wash (the sweep is its interior)', () => {
    const m = ringModelFor(withLife(decoy('r', true, 'me', 50, 'radar'), L), 0, ALERT)!;
    expect(m.color).toBe(CLIENT_CONFIG.colors.silver);
    expect(m.color).toBe(BUOY_HEADS.radar.color);
    expect(m.fillAlpha).toBe(0);
    expect(m.dashed).toBe(true);
    expect(m.alpha).toBeGreaterThan(0);
  });

  it('own HEALING / SHIELD / SPEED: the kind’s colour with a light interior wash', () => {
    for (const kind of ['healing', 'shield', 'speed'] as const) {
      const m = ringModelFor(withLife(decoy('k', true, 'me', 50, kind), L), 0, ALERT)!;
      expect(m.color, kind).toBe(BUOY_HEADS[kind].color);
      expect(m.fillAlpha, kind).toBeGreaterThan(0);
      expect(m.fillAlpha, kind).toBeLessThan(m.alpha);
      expect(m.dashed).toBe(true);
      expect(m.layer, kind).toBe('chart');
    }
  });

  it('the radius is CONFIG.buoy.radiusU, every kind, own and enemy', () => {
    for (const k of BUOY_KINDS) {
      expect(ringModelFor(withLife(decoy('a', true, 'me', 50, k), L), 0, ALERT)!.radiusU).toBe(CONFIG.buoy.radiusU);
      expect(ringModelFor(decoy('b', false, 'them', undefined, k), 0, ALERT)!.radiusU).toBe(CONFIG.buoy.radiusU);
    }
  });

  it('an own ring’s alpha (and wash) follows the life left — half life, half strength; expired, gone', () => {
    const v = withLife(decoy('h', true, 'me', 50, 'healing'), L);
    const full = ringModelFor(v, 0, ALERT)!;
    const half = ringModelFor(v, L / 2, ALERT)!;
    const done = ringModelFor(v, L, ALERT)!;
    expect(half.alpha).toBeCloseTo(full.alpha / 2, 9);
    expect(half.fillAlpha).toBeCloseTo(full.fillAlpha / 2, 9);
    expect(done.alpha).toBe(0);
    expect(half.alpha / full.alpha).toBeCloseTo(buoyLifeFrac(v, L / 2)!, 9);
  });

  it('a sighted ENEMY ring: the alert colour, no wash, on the world layer — not the chart', () => {
    for (const k of BUOY_KINDS) {
      const m = ringModelFor(decoy('e', false, 'them', undefined, k), 0, ALERT)!;
      expect(m.color, k).toBe(ALERT);
      expect(m.fillAlpha, k).toBe(0);
      expect(m.layer, k).toBe('world');
      expect(m.dashed).toBe(true);
    }
  });

  it('defaults the enemy colour to the shared alert clock (steady orange at motion off)', () => {
    settings.set({ motion: 'off' });
    try {
      expect(ringModelFor(decoy('e', false), 0)!.color).toBe(CLIENT_CONFIG.colors.alertOrange);
    } finally {
      settings.reset();
    }
  });

  it('no ring for a view without a finite position', () => {
    expect(ringModelFor({ ...decoy('n', true, 'me', 50), x: Number.NaN }, 0, ALERT)).toBeNull();
    expect(ringModelFor({ ...decoy('n', false), y: Number.POSITIVE_INFINITY }, 0, ALERT)).toBeNull();
  });
});

describe('Decoys — the rings on the water', () => {
  beforeEach(() => alertClock.reset());
  afterEach(() => settings.reset());

  it('an own ring sits on the chart layer beneath its marker, an enemy’s on the world layer', () => {
    const ownLayer = new Container();
    const otherLayer = new Container();
    const d = new Decoys(ownLayer, otherLayer);
    d.render(0);
    d.sync([withLife(decoy('mine', true, 'me', 50, 'shield'), CONFIG.buoy.lifetimeMs), decoy('theirs', false)], HUE);
    expect(d.ringGraphicsAt('mine')!.parent).toBe(ownLayer);
    expect(ownLayer.children.indexOf(d.ringGraphicsAt('mine')!)).toBe(0); // beneath the marker
    expect(d.ringGraphicsAt('theirs')!.parent).toBe(otherLayer);
    expect(d.ringAt('mine')!.layer).toBe('chart');
    expect(d.ringAt('theirs')!.layer).toBe('world');
    // both rings are dashed arcs; the own shield ring also washes its interior
    expect(pathActions(d.ringGraphicsAt('mine')!)).toContain('arc');
    expect(pathActions(d.ringGraphicsAt('theirs')!)).not.toContain('circle');
    expect(pathActions(d.ringGraphicsAt('mine')!)).toContain('circle');
  });

  it('the own ring dims with the life arc (alpha tracks lifeFracAt)', () => {
    const d = new Decoys(new Container(), new Container());
    const L = CONFIG.buoy.lifetimeMs;
    d.render(0);
    d.sync([withLife(decoy('mine', true, 'me', 50, 'speed'), L)], HUE);
    const full = d.ringAt('mine')!.alpha;
    d.render(L / 2);
    expect(d.ringAt('mine')!.alpha / full).toBeCloseTo(d.lifeFracAt('mine')!, 2);
    d.render(L);
    expect(d.ringAt('mine')!.alpha).toBe(0);
  });

  it('the enemy ring wears the alert tint (steady orange at motion off); the own ring none', () => {
    settings.set({ motion: 'off' });
    const d = new Decoys(new Container(), new Container());
    d.sync([withLife(decoy('mine', true, 'me', 50, 'radar'), CONFIG.buoy.lifetimeMs), decoy('theirs', false)], HUE);
    for (let t = 0; t < 2000; t += 230) {
      d.render(t);
      expect(d.ringGraphicsAt('theirs')!.tint).toBe(CLIENT_CONFIG.colors.alertOrange);
      expect(d.ringGraphicsAt('mine')!.tint).toBe(CLIENT_CONFIG.colors.white);
    }
    expect(alertTint(alertClock.phase, 'off')).toBe(CLIENT_CONFIG.colors.alertOrange);
  });

  it('the ring leaves with the buoy (out of view, sunk or expired)', () => {
    const otherLayer = new Container();
    const d = new Decoys(new Container(), otherLayer);
    d.sync([decoy('theirs', false)], HUE);
    d.sync([], HUE);
    expect(d.ringAt('theirs')).toBeNull();
    expect(otherLayer.children).toHaveLength(0);
  });
});

describe('buoyLifeFrac — the owner’s clock, never an enemy’s', () => {
  it('is (until − now) / CONFIG.buoy.lifetimeMs for an own buoy, clamped to [0, 1]', () => {
    const L = CONFIG.buoy.lifetimeMs;
    expect(buoyLifeFrac({ own: true, until: 1000 + L }, 1000)).toBe(1);
    expect(buoyLifeFrac({ own: true, until: 1000 + L / 2 }, 1000)).toBeCloseTo(0.5, 9);
    expect(buoyLifeFrac({ own: true, until: 1000 }, 2000)).toBe(0);
    expect(buoyLifeFrac({ own: true, until: 1000 + 3 * L }, 1000)).toBe(1);
  });

  it('is null for an enemy buoy (even a defensive `until`) and for an own view without one', () => {
    expect(buoyLifeFrac({ own: false, until: 99_999 }, 0)).toBeNull();
    expect(buoyLifeFrac({ own: true }, 0)).toBeNull();
  });
});

describe('Decoys — the owner-only LIFE arc runs down on the server clock', () => {
  it('an own buoy draws a second masthead arc that shrinks as `until` nears; an enemy draws none', () => {
    const ownLayer = new Container();
    const otherLayer = new Container();
    const d = new Decoys(ownLayer, otherLayer);
    const L = CONFIG.buoy.lifetimeMs;
    d.render(0);
    d.sync([withLife(decoy('mine', true, 'me', CONFIG.buoy.hp), L), decoy('theirs', false)], HUE);
    expect(d.lifeFracAt('mine')).toBe(1);
    expect(d.lifeFracAt('theirs')).toBeNull();
    const arcs = (g: Graphics) => pathActions(g).filter((a) => a === 'arc').length;
    expect(arcs(soleSprite(ownLayer))).toBe(2); // hp + life
    expect(arcs(soleSprite(otherLayer))).toBe(0); // an enemy's hull and clock are not ours
    d.render(L / 2);
    expect(d.lifeFracAt('mine')).toBeCloseTo(0.5, 2);
    d.render(L);
    expect(d.lifeFracAt('mine')).toBe(0);
    expect(arcs(soleSprite(ownLayer))).toBe(1); // the life arc has run out; the hull remains
  });

  it('does not redraw on every frame — the snapped fraction only moves in steps', () => {
    const ownLayer = new Container();
    const d = new Decoys(ownLayer, new Container());
    d.render(0);
    d.sync([withLife(decoy('mine', true, 'me', CONFIG.buoy.hp), CONFIG.buoy.lifetimeMs)], HUE);
    const g = soleSprite(ownLayer);
    const clear = vi.spyOn(g, 'clear');
    d.render(1);
    d.render(2);
    expect(clear.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

