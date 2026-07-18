// Structural unit tests for the SIGNAL_REGISTRY itself (Story 1.1). These are
// wire-shape and registry-mechanics tests, NOT the behavioral fog-of-war
// invariant suite (that lives in perception.test.ts, which reimplements the
// visibility predicates independently). Here we exercise each row's
// visible()/materialize() directly through the narrow SignalContext, the way
// perception.ts is the ONLY other caller.

import { describe, it, expect } from 'vitest';
import { CONFIG, wrapPositive, type BallisticEvent, type BoomEvent, type ShellState } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import type { MineState } from '../game/weapons/index.js';
import { SIGNAL_REGISTRY, signalFor, type FoggedSignalContext } from '../game/signals.js';

const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;

// ---------- construction helpers ---------------------------------------------

/** World whose islands are cleared, for exact-geometry cases. */
function bareWorld(seed = 1): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship and teleport it to an exact pose (speed 0 unless overridden). */
function place(w: World, id: string, x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase());
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

/** A fogged SignalContext for `me`, reading time/islands/ships off the world. */
function foggedCtx(w: World, me: ShipRecord, now = w.now): FoggedSignalContext {
  return { mode: 'fogged', observerId: me.id, now, islands: w.map.islands, ships: w.ships, me };
}

function makeShell(overrides: Partial<ShellState> = {}): ShellState {
  return {
    id: 's1',
    ownerId: 'a',
    x: 0,
    y: 0,
    vx: 10,
    vy: 0,
    distLeft: 100,
    bornAt: 0,
    kind: 'shell',
    damage: 10,
    hitRadius: 5,
    graceMs: 0,
    ...overrides,
  };
}

function makeMine(overrides: Partial<MineState> = {}): MineState {
  return { id: 'm1', ownerId: 'a', x: 0, y: 0, armedAt: 0, ...overrides };
}

const REGISTRY_KEYS = [
  'contact',
  'mine',
  'blip',
  'shell',
  'torp',
  'boom',
  'sunk',
  'spawn',
  'dmg',
  'upg',
  'pt',
  'heal',
];

// ---------- row shape ----------------------------------------------------

describe('SIGNAL_REGISTRY — row shape', () => {
  it('has exactly the 12 known channels', () => {
    expect(Object.keys(SIGNAL_REGISTRY).sort()).toEqual([...REGISTRY_KEYS].sort());
  });

  it('every row: eventType matches its registry key, visible/materialize are callable, counterIntel is not yet implemented', () => {
    for (const [key, row] of Object.entries(SIGNAL_REGISTRY)) {
      expect(row.eventType).toBe(key);
      expect(typeof row.visible).toBe('function');
      expect(typeof row.materialize).toBe('function');
      // First counterIntel row arrives in Story 1.8 — the slot exists but no
      // row implements it yet.
      expect(row.counterIntel).toBeUndefined();
    }
  });
});

// ---------- key-order guards (the load-bearing msgpack rule) -----------------

describe('SIGNAL_REGISTRY — materialized key order (msgpack wire shape)', () => {
  it('contact row: [id,x,y,heading,speed,cls]', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 100, 0, 1.2);
    b.state.speed = 12;
    const row = signalFor('contact')!;
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, b)).toBe(true);
    const wire = row.materialize(ctx, b);
    expect(Object.keys(wire as object)).toEqual(['id', 'x', 'y', 'heading', 'speed', 'cls']);
  });

  it('blip row: [k,id,x,y,t]', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', RADAR, 0); // beyond sight, at the radar boundary, bearing 0
    a.prevSweepAngle = wrapPositive(-0.02);
    a.sweepAngle = wrapPositive(0.02); // beam just crossed bearing 0 this tick
    const row = signalFor('blip')!;
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, b)).toBe(true);
    const wire = row.materialize(ctx, b);
    expect(Object.keys(wire as object)).toEqual(['k', 'id', 'x', 'y', 't']);
  });

  it('shell row: [k,id,x,y,vx,vy,t]', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const shell = makeShell({ id: 's1', ownerId: 'a', kind: 'shell' }); // owner always sees it
    const row = signalFor('shell')!;
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, shell)).toBe(true);
    const wire = row.materialize(ctx, shell);
    expect(Object.keys(wire as object)).toEqual(['k', 'id', 'x', 'y', 'vx', 'vy', 't']);
  });

  it('torp row: [k,id,x,y,vx,vy,t]', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const torp = makeShell({ id: 't1', ownerId: 'a', kind: 'torp' });
    const row = signalFor('torp')!;
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, torp)).toBe(true);
    const wire = row.materialize(ctx, torp);
    expect(Object.keys(wire as object)).toEqual(['k', 'id', 'x', 'y', 'vx', 'vy', 't']);
  });

  it('mine row: [id,x,y,own]', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const mine = makeMine({ ownerId: 'a', x: 50, y: 0 }); // owner sees it always
    const row = signalFor('mine')!;
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, mine)).toBe(true);
    const wire = row.materialize(ctx, mine);
    expect(Object.keys(wire as object)).toEqual(['id', 'x', 'y', 'own']);
  });

  it('boom row, STRIPPED variant: [k,id,x,y], no "hit" key — fogged observer sights the impact but not the victim center', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', SIGHT + 50, 0); // victim's center is OUTSIDE a's sight
    const e: BoomEvent = { k: 'boom', id: 's1', hit: 'b', x: 10, y: 0 }; // impact point WELL INSIDE a's sight
    const row = signalFor('boom')!;
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, e)).toBe(true); // impact point is sighted
    const wire = row.materialize(ctx, e) as BoomEvent;
    expect(Object.keys(wire)).toEqual(['k', 'id', 'x', 'y']);
    expect('hit' in wire).toBe(false); // stripped, not merely undefined
  });

  it('boom row, UNSTRIPPED variant keeps hit when the victim center is also sighted', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 10, 0); // victim's center is well inside a's sight too
    const e: BoomEvent = { k: 'boom', id: 's1', hit: 'b', x: 10, y: 0 };
    const row = signalFor('boom')!;
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, e)).toBe(true);
    const wire = row.materialize(ctx, e) as BoomEvent;
    expect(wire.hit).toBe('b');
  });
});

// ---------- reveal timestamps -------------------------------------------------

describe('SIGNAL_REGISTRY — ballistic reveal timestamps', () => {
  it('shell row stamps t = ctx.now (reveal time), never the shell\'s bornAt', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const shell = makeShell({ id: 's1', ownerId: 'a', kind: 'shell', bornAt: -999_999 });
    const ctx = foggedCtx(w, a, 42_424);
    const row = signalFor('shell')!;
    expect(row.visible(ctx, shell)).toBe(true);
    const wire = row.materialize(ctx, shell) as BallisticEvent;
    expect(wire.t).toBe(42_424);
    expect(wire.t).not.toBe(shell.bornAt);
  });

  it('torp row stamps t = ctx.now (reveal time), never the torp\'s bornAt', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const torp = makeShell({ id: 't1', ownerId: 'a', kind: 'torp', bornAt: -999_999 });
    const ctx = foggedCtx(w, a, 13_579);
    const row = signalFor('torp')!;
    expect(row.visible(ctx, torp)).toBe(true);
    const wire = row.materialize(ctx, torp) as BallisticEvent;
    expect(wire.t).toBe(13_579);
    expect(wire.t).not.toBe(torp.bornAt);
  });
});

// ---------- exactly-once side effect ------------------------------------------

describe('SIGNAL_REGISTRY — ballistic reveal is exactly-once per observer', () => {
  it('materializing marks the id seen; visible() then reports false for it', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const shell = makeShell({ id: 's1', ownerId: 'a', kind: 'shell' });
    const row = signalFor('shell')!;
    const ctx = foggedCtx(w, a);
    expect(a.seenBallistics.has('s1')).toBe(false);
    expect(row.visible(ctx, shell)).toBe(true);
    row.materialize(ctx, shell);
    expect(a.seenBallistics.has('s1')).toBe(true);
    expect(row.visible(ctx, shell)).toBe(false);
  });

  it('the same holds for torp reveals, independently keyed by id', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const torp = makeShell({ id: 't1', ownerId: 'a', kind: 'torp' });
    const row = signalFor('torp')!;
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, torp)).toBe(true);
    row.materialize(ctx, torp);
    expect(a.seenBallistics.has('t1')).toBe(true);
    expect(row.visible(ctx, torp)).toBe(false);
  });
});

// ---------- fail-closed lookups -----------------------------------------------

describe('SIGNAL_REGISTRY — fail-closed lookup + registry integrity', () => {
  it('signalFor returns undefined for an unknown kind', () => {
    expect(signalFor('nonexistent')).toBeUndefined();
    expect(signalFor('')).toBeUndefined();
    expect(signalFor('CONTACT')).toBeUndefined(); // case-sensitive, not fuzzy
  });

  it('signalFor resolves every one of the 12 known keys to its registry row', () => {
    for (const key of REGISTRY_KEYS) {
      expect(signalFor(key)).toBe(SIGNAL_REGISTRY[key as keyof typeof SIGNAL_REGISTRY]);
    }
  });

  it('SIGNAL_REGISTRY is frozen', () => {
    expect(Object.isFrozen(SIGNAL_REGISTRY)).toBe(true);
  });
});
