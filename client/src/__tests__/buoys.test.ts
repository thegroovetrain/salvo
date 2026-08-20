// RADAR-BUOY reconcile + render (render/buoys.ts) — the pure list -> sprite
// lifecycle diff, the own/enemy layer split, the own-spawn cue hook (the
// mines.ts precedent, Story 1.8), and the Story 7-5 wave-2 additions: a
// silhouette that shares NO primitive with a mine's, plus the owner-only
// coverage ring / doctrine styling / life arc.
//
// The OWN/ENEMY split rides BuoyView.own (mirroring MineView.own): an OWN buoy
// draws in the fog-immune chart layer, a truesighted ENEMY buoy in the fogged
// world layer — without it a truesighted enemy buoy would have read as YOURS.
// The own-spawn hook fires ONLY for newly-added OWN buoys (the audio placement
// cue), so it can never misfire on an enemy buoy we truesight.

import { describe, it, expect, vi } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { CONFIG, effectiveStats, resolveBoons, type BoonDef, type BuoyView } from '@salvo/shared';
import {
  BUOY_MARKER,
  Buoys,
  buoyDrawKey,
  buoyLifeFrac,
  ownBuoyRing,
  reconcileBuoys,
  type OwnBuoyState,
} from '../render/buoys.js';
import { Mines } from '../render/mines.js';

const buoy = (id: string, own = false, until = 5000, by = 'p1'): BuoyView => ({ id, x: 0, y: 0, until, own, by, sweep: 0 });

/** Stub owner-hue resolver for the render harness (Story 1.12). */
const HUE = (): number => 0x123456;

/** The owner-side buoy readout parameters, off REAL effective stats — never a
 *  hand-written radius, so a stats change moves this test with the game. */
function ownState(boons: readonly string[] = [], now = 0): OwnBuoyState {
  const s = effectiveStats(CONFIG.shipClasses.mineLayer, resolveBoons([...boons])).radarBuoy;
  return { radarRange: s.radarRange, gun: s.gun, jamming: s.jamming, durationMs: s.durationMs, now };
}

/** An INJECTED def that widens the OWNER's radar range. No shipped card writes
 *  `radarRange` since cycle 119 deleted the INTEL RANGE line, but the path is
 *  still whitelisted on BOON_STAT_PATHS for exactly this reason — and R2.7's
 *  contrast case is only meaningful while the owner's scope and the buoy's flat
 *  set are DIFFERENT numbers. Same shape as the server suite's `OMNI_BOON`. */
const WIDE_RADAR: BoonDef = {
  id: 'testWideRadar',
  category: 'test',
  rarity: 'common',
  copies: 1,
  effects: [{ kind: 'stat', path: 'radarRange', mult: 1.25 }],
};

/** The owner readout built on a WIDENED owner radar, alongside the folded owner
 *  radar range itself so the contrast can be asserted rather than assumed. */
function wideOwnState(): { own: OwnBuoyState; ownRadarRange: number } {
  const full = effectiveStats(CONFIG.shipClasses.mineLayer, [WIDE_RADAR]);
  const s = full.radarBuoy;
  return {
    own: { radarRange: s.radarRange, gun: s.gun, jamming: s.jamming, durationMs: s.durationMs, now: 0 },
    ownRadarRange: full.radarRange,
  };
}

describe('reconcileBuoys — buoy list → sprite lifecycle diff', () => {
  it('adds every buoy when starting from nothing', () => {
    const { add, remove } = reconcileBuoys(new Set(), [buoy('d1'), buoy('d2')]);
    expect(add.map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(remove).toEqual([]);
  });

  it('removes sprites whose buoy dropped out of the list (expired, destroyed or out of view)', () => {
    const { add, remove } = reconcileBuoys(new Set(['d1', 'd2']), [buoy('d1')]);
    expect(add).toEqual([]);
    expect(remove).toEqual(['d2']);
  });

  it('leaves buoys present in both untouched (static — only the life arc moves)', () => {
    const { add, remove } = reconcileBuoys(new Set(['d1']), [buoy('d1'), buoy('d3')]);
    expect(add.map((d) => d.id)).toEqual(['d3']);
    expect(remove).toEqual([]);
  });

  it('a REPLACE (owner drops a second buoy: old id leaves, new id joins) is one remove + one add', () => {
    // The server evicts the owner's prior buoy and spawns a new one with a fresh
    // id — the truth list swaps 'd1' for 'd2' in a single tick.
    const { add, remove } = reconcileBuoys(new Set(['d1']), [buoy('d2')]);
    expect(add.map((d) => d.id)).toEqual(['d2']);
    expect(remove).toEqual(['d1']);
  });

  it('empty incoming clears everything (natural expiry / match reset / despawn-all)', () => {
    const { add, remove } = reconcileBuoys(new Set(['a', 'b']), []);
    expect(add).toEqual([]);
    expect(remove.sort()).toEqual(['a', 'b']);
  });

  it('the add list carries `own` through (the split data for the renderer)', () => {
    const { add } = reconcileBuoys(new Set(), [buoy('mine', true), buoy('theirs', false)]);
    expect(add.map((d) => ({ id: d.id, own: d.own }))).toEqual([
      { id: 'mine', own: true },
      { id: 'theirs', own: false },
    ]);
  });
});

describe('Buoys — own/enemy layer split + own-spawn cue hook (mines precedent)', () => {
  function harness() {
    const ownLayer = new Container();
    const enemyLayer = new Container();
    const onOwnBuoySpawn = vi.fn();
    const buoys = new Buoys(ownLayer, enemyLayer, onOwnBuoySpawn);
    return { ownLayer, enemyLayer, onOwnBuoySpawn, buoys };
  }

  it('resolves each new buoy’s tint from its owner id (`by`) via hueFor', () => {
    const { buoys } = harness();
    const hueFor = vi.fn((_by: string) => 0x123456 as number | null);
    buoys.sync([buoy('d1', true, 5000, 'alice'), buoy('d2', false, 5000, 'bob')], hueFor);
    expect(hueFor.mock.calls.map((c) => c[0]).sort()).toEqual(['alice', 'bob']);
  });

  it('routes an OWN buoy to the chart layer and an ENEMY buoy to the world layer', () => {
    const { ownLayer, enemyLayer, buoys } = harness();
    buoys.sync([buoy('mine', true), buoy('theirs', false)], HUE);
    expect(ownLayer.children).toHaveLength(1);
    expect(enemyLayer.children).toHaveLength(1);
  });

  it('recolors a buoy that booted on the amber fallback once its owner hue later resolves, then latches', () => {
    const { buoys } = harness();
    const hueFor = vi.fn((_by: string) => null as number | null);
    buoys.sync([buoy('d1', true, 5000, 'late')], hueFor);
    expect(hueFor).toHaveBeenCalled(); // unresolved at spawn → amber fallback
    hueFor.mockReturnValue(0x00ff00);
    buoys.sync([buoy('d1', true, 5000, 'late')], hueFor); // retry resolves + redraws
    const afterResolve = hueFor.mock.calls.length;
    buoys.sync([buoy('d1', true, 5000, 'late')], hueFor); // latched — no more probes
    expect(hueFor.mock.calls.length).toBe(afterResolve);
  });

  it('fires the own-spawn hook ONLY for newly-added OWN buoys (never for enemy)', () => {
    const { onOwnBuoySpawn, buoys } = harness();
    buoys.sync([buoy('mine', true), buoy('theirs', false)], HUE);
    expect(onOwnBuoySpawn).toHaveBeenCalledTimes(1);
    expect(onOwnBuoySpawn.mock.calls[0][0].id).toBe('mine');
  });

  it('fires the hook once per placement, not every tick a buoy persists', () => {
    const { onOwnBuoySpawn, buoys } = harness();
    buoys.sync([buoy('mine', true)], HUE);
    buoys.sync([buoy('mine', true)], HUE); // still present — no re-add, no re-cue
    expect(onOwnBuoySpawn).toHaveBeenCalledTimes(1);
  });

  it('clears both layers when the incoming list empties', () => {
    const { ownLayer, enemyLayer, buoys } = harness();
    buoys.sync([buoy('mine', true), buoy('theirs', false)], HUE);
    buoys.sync([], HUE);
    expect(ownLayer.children).toHaveLength(0);
    expect(enemyLayer.children).toHaveLength(0);
  });
});

// --- THE HOTBAR'S ACTIVE WINDOW (wave-2 review gate) ------------------------
//
// `ownUntil()` is what main.ts's activeWindows reads for the buoy slot. It is
// DERIVED from the reconciled sprite set rather than latched at drop, because a
// buoy is destructible (R2.7, 50 hp) and its removal is SILENT on the wire — it
// simply stops appearing in the frame's list. Latching `until` at placement kept
// the slot reading ACTIVE for the buoy's full nominal life after it had been
// shot off the water a second later.

describe('Buoys.ownUntil — the buoy slot’s ACTIVE window follows the water', () => {
  const buoys = (): Buoys => new Buoys(new Container(), new Container());

  it('is 0 before anything is placed', () => {
    expect(buoys().ownUntil()).toBe(0);
  });

  it('reports our own buoy’s expiry while it is on the water', () => {
    const b = buoys();
    b.sync([buoy('mine', true, 20000)], HUE);
    expect(b.ownUntil()).toBe(20000);
  });

  it('DROPS TO 0 the tick our buoy leaves the frame — destroyed, not just expired', () => {
    const b = buoys();
    b.sync([buoy('mine', true, 20000)], HUE); // dropped at t=0, nominal life to 20s
    b.sync([], HUE); // shot off the water at t≈1s: silent removal, no event
    expect(b.ownUntil()).toBe(0);
  });

  it('never lights the slot for somebody ELSE’s buoy we happen to truesight', () => {
    const b = buoys();
    b.sync([buoy('theirs', false, 20000)], HUE);
    expect(b.ownUntil()).toBe(0);
  });

  it('follows a REPLACE to the new buoy’s expiry (one remove + one add, same sync)', () => {
    const b = buoys();
    b.sync([buoy('first', true, 20000)], HUE);
    b.sync([buoy('second', true, 45000)], HUE);
    expect(b.ownUntil()).toBe(45000);
  });
});

// --- THE SILHOUETTE ---------------------------------------------------------
//
// Eric, 7-5-decks.md: *"The icon needs to be distinguished from the mines a bit
// more."* The decoy's mark was two concentric rings + a stub mast and a mine's
// is a ring + a dot, so at chart scale they were the same mark. The buoy's mark
// now shares NO drawing primitive with a mine's: a mine is CIRCLES, the buoy is
// LINES AND A POLYGON. These assertions go through the real renderers and read
// the Pixi path instructions the adapters actually emitted, so redrawing the
// buoy as a ring — the exact regression Eric asked to be told apart from — fails
// here rather than on the water.

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

describe('the buoy silhouette is distinct from a mine marker (Eric, 7-5-decks.md)', () => {
  /** An ENEMY marker of each kind: no owner rings, so what is compared is the
   *  MARKER itself and nothing else. */
  function markers() {
    const buoyLayer = new Container();
    new Buoys(new Container(), buoyLayer).sync([buoy('b', false)], HUE);
    const mineLayer = new Container();
    new Mines(new Container(), mineLayer).sync(
      [{ id: 'm', x: 0, y: 0, own: false, by: 'p1' }],
      HUE,
    );
    return { buoy: pathActions(soleSprite(buoyLayer)), mine: pathActions(soleSprite(mineLayer)) };
  }

  it('the mine marker is circles and the buoy marker has none', () => {
    const { buoy: b, mine: m } = markers();
    expect(m).toContain('circle');
    expect(b).not.toContain('circle');
    expect(b).not.toContain('arc');
  });

  it('the buoy marker is the spar-buoy linework: strokes plus a polygon topmark', () => {
    const { buoy: b } = markers();
    expect(b).toContain('poly'); // the diamond radar-reflector daymark
    expect(b.filter((a) => a === 'lineTo').length).toBeGreaterThanOrEqual(2); // waterline + spar
  });

  it('the two markers share no drawing primitive at all', () => {
    const { buoy: b, mine: m } = markers();
    const shared = new Set(b.filter((a) => m.includes(a)));
    // `moveTo` is unavoidable path bookkeeping; nothing that DRAWS may overlap.
    shared.delete('moveTo');
    expect([...shared]).toEqual([]);
  });

  it('the exported geometry is a waterline, a spar and a 4-point diamond', () => {
    expect(BUOY_MARKER.topmark).toHaveLength(4);
    expect(BUOY_MARKER.spar[0]).toEqual({ x: 0, y: 0 });
    expect(BUOY_MARKER.spar[1].y).toBeLessThan(0); // the mast rises above the water
    // The topmark is centred ON the masthead, above the waterline tick.
    for (const p of BUOY_MARKER.topmark) expect(p.y).toBeLessThan(BUOY_MARKER.waterline[0].y);
  });
});

// --- THE OWNER'S READOUT ----------------------------------------------------

describe('ownBuoyRing — the owner-only coverage ring and its doctrine channels', () => {
  it('reads the BUOY’s own flat radar reach, not the owner’s radar range', () => {
    const ring = ownBuoyRing(ownState());
    expect(ring.r).toBe(CONFIG.radarBuoy.radarRange);
    // The buoy's set is flat by ruling (R2.7): widening the OWNER's scope must
    // not touch the buoy's circle. Driven by an injected def, and the widening
    // is asserted first — otherwise the pin degenerates into comparing a number
    // with itself.
    const wide = wideOwnState();
    expect(wide.ownRadarRange).toBeGreaterThan(effectiveStats(CONFIG.shipClasses.mineLayer).radarRange);
    expect(ownBuoyRing(wide.own).r).toBe(ring.r);
  });

  it('draws DASHED with no fill on a plain buoy (a sensor circle, nothing more)', () => {
    const ring = ownBuoyRing(ownState());
    expect(ring.style).toBe('dashed');
    expect(ring.fill).toBe(0);
  });

  it('GUN BUOY strokes the ring SOLID — the circle is now a weapon envelope', () => {
    expect(ownBuoyRing(ownState(['buoyGun'])).style).toBe('solid');
  });

  it('JAMMING BUOY washes the disc — the water inside it is unreadable to everyone else', () => {
    expect(ownBuoyRing(ownState(['buoyJamming'])).fill).toBeGreaterThan(0);
  });

  it('the two verbs COMPOSE (both are rare ×1 and neither excludes the other)', () => {
    const ring = ownBuoyRing(ownState(['buoyGun', 'buoyJamming']));
    expect(ring.style).toBe('solid');
    expect(ring.fill).toBeGreaterThan(0);
  });
});

describe('buoyLifeFrac — how much of its window an own buoy has left', () => {
  it('is 1 at the drop and 0 at expiry, on the FRAME clock', () => {
    const d = CONFIG.radarBuoy.durationMs;
    expect(buoyLifeFrac(10_000 + d, 10_000, d)).toBe(1);
    expect(buoyLifeFrac(10_000 + d, 10_000 + d, d)).toBe(0);
    expect(buoyLifeFrac(10_000 + d, 10_000 + d / 2, d)).toBeCloseTo(0.5, 6);
  });

  it('clamps rather than running negative or past full (clock skew, a stale frame)', () => {
    expect(buoyLifeFrac(0, 60_000, 20_000)).toBe(0);
    expect(buoyLifeFrac(999_999, 0, 20_000)).toBe(1);
  });

  it('a non-positive duration reads as spent rather than dividing by zero', () => {
    expect(buoyLifeFrac(5000, 0, 0)).toBe(0);
  });

  it('BUOY I–IV lengthens the window, so the same age reads FULLER at a bigger stack', () => {
    const base = ownState();
    const maxed = ownState(['buoyDuration', 'buoyDuration', 'buoyDuration', 'buoyDuration']);
    expect(maxed.durationMs).toBeGreaterThan(base.durationMs);
    const age = 15_000;
    expect(buoyLifeFrac(base.durationMs, age, base.durationMs)).toBeLessThan(
      buoyLifeFrac(maxed.durationMs, age, maxed.durationMs),
    );
  });
});

describe('buoyDrawKey — the sprite redraws on change, never per frame', () => {
  it('is stable while nothing moves', () => {
    const ring = ownBuoyRing(ownState());
    expect(buoyDrawKey(ring, 0.5)).toBe(buoyDrawKey(ring, 0.5));
  });

  it('changes when a doctrine lands', () => {
    expect(buoyDrawKey(ownBuoyRing(ownState()), 1)).not.toBe(
      buoyDrawKey(ownBuoyRing(ownState(['buoyGun'])), 1),
    );
  });

  it('quantizes the life arc — a hair of decay does not force a redraw, a real step does', () => {
    const ring = ownBuoyRing(ownState());
    expect(buoyDrawKey(ring, 0.5)).toBe(buoyDrawKey(ring, 0.5001));
    expect(buoyDrawKey(ring, 0.5)).not.toBe(buoyDrawKey(ring, 0.2));
  });
});

describe('Buoys — the owner-only readout is owner-only', () => {
  function harness() {
    const ownLayer = new Container();
    const enemyLayer = new Container();
    return { ownLayer, enemyLayer, buoys: new Buoys(ownLayer, enemyLayer) };
  }

  it('an OWN buoy draws its coverage ring and life arc', () => {
    const { buoys, ownLayer } = harness();
    buoys.sync([buoy('mine', true, 20_000)], HUE, ownState([], 0));
    expect(buoys.ringAt('mine')?.r).toBe(CONFIG.radarBuoy.radarRange);
    expect(buoys.lifeAt('mine')).toBeGreaterThan(0);
    expect(pathActions(soleSprite(ownLayer))).toContain('arc'); // dashed ring + life arc
  });

  it('an ENEMY buoy draws NO ring and NO life arc — their numbers are theirs', () => {
    const { buoys, enemyLayer } = harness();
    buoys.sync([buoy('theirs', false, 20_000)], HUE, ownState([], 0));
    expect(buoys.ringAt('theirs')).toBeNull();
    expect(buoys.lifeAt('theirs')).toBeNull();
    expect(pathActions(soleSprite(enemyLayer))).not.toContain('arc');
  });

  it('no owner stats yet (spectator, pre-join) = markers only, never a crash', () => {
    const { buoys } = harness();
    buoys.sync([buoy('mine', true)], HUE);
    expect(buoys.ringAt('mine')).toBeNull();
  });

  it('the life arc empties as the frame clock advances', () => {
    const { buoys } = harness();
    const d = CONFIG.radarBuoy.durationMs;
    buoys.sync([buoy('mine', true, d)], HUE, ownState([], 0));
    const full = buoys.lifeAt('mine')!;
    buoys.sync([buoy('mine', true, d)], HUE, ownState([], d * 0.75));
    expect(buoys.lifeAt('mine')!).toBeLessThan(full);
  });
});
