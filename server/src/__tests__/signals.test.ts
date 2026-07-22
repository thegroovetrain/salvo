// Structural unit tests for the SIGNAL_REGISTRY itself (Story 1.1). These are
// wire-shape and registry-mechanics tests, NOT the behavioral fog-of-war
// invariant suite (that lives in perception.test.ts, which reimplements the
// visibility predicates independently). Here we exercise each row's
// visible()/materialize() directly through the narrow SignalContext, the way
// perception.ts is the ONLY other caller.

import { describe, it, expect } from 'vitest';
import { CONFIG, wrapPositive, type BallisticEvent, type BoomEvent, type BurstEvent, type ShellState } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import type { MineState } from '../game/equipment/index.js';
import {
  SIGNAL_REGISTRY,
  signalFor,
  type BurstSubject,
  type FoggedSignalContext,
  type SpectatorSignalContext,
} from '../game/signals.js';

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

/** A fogged SignalContext for `me`, reading time/islands/ships/zones off the world. */
function foggedCtx(w: World, me: ShipRecord, now = w.now): FoggedSignalContext {
  return { mode: 'fogged', observerId: me.id, now, islands: w.map.islands, ships: w.ships, litZones: w.litZones, me };
}

/** Drop a lit zone directly into world state (Story 1.7). */
function injectZone(w: World, id: string, ownerId: string, x: number, y: number, r = CONFIG.starShells.litRadius, until = 999_999): void {
  w.litZones.set(id, { id, ownerId, x, y, r, until });
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
    targetX: null,
    targetY: null,
    burstRadius: 0,
    contactDamage: 10,
    ...overrides,
  };
}

function makeMine(overrides: Partial<MineState> = {}): MineState {
  return { id: 'm1', ownerId: 'a', x: 0, y: 0, armedAt: 0, ...overrides };
}

const REGISTRY_KEYS = [
  'contact',
  'mine',
  'litzone',
  'blip',
  'shell',
  'torp',
  'boom',
  'burst',
  'sunk',
  'spawn',
  'dmg',
  'upg',
  'pt',
  'heal',
];

// ---------- row shape ----------------------------------------------------

describe('SIGNAL_REGISTRY — row shape', () => {
  it('has exactly the 14 known channels', () => {
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
    const row = SIGNAL_REGISTRY.contact; // pseudo-row: direct access (not signalFor)
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
    const row = SIGNAL_REGISTRY.mine; // pseudo-row: direct access (not signalFor)
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, mine)).toBe(true);
    const wire = row.materialize(ctx, mine);
    expect(Object.keys(wire as object)).toEqual(['id', 'x', 'y', 'own']);
  });

  it('litzone row: [id,x,y,r,until,by] — `by` is the firer\'s ship id, ownerId never leaks raw', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    injectZone(w, 'z1', 'a', 400, 0, 110, 12_345); // owner sees it always
    const row = SIGNAL_REGISTRY.litzone; // pseudo-row: direct access (not signalFor)
    const ctx = foggedCtx(w, a);
    const zone = w.litZones.get('z1')!;
    expect(row.visible(ctx, zone)).toBe(true);
    const wire = row.materialize(ctx, zone);
    expect(Object.keys(wire as object)).toEqual(['id', 'x', 'y', 'r', 'until', 'by']);
    expect(wire).toEqual({ id: 'z1', x: 400, y: 0, r: 110, until: 12_345, by: 'a' });
    expect('ownerId' in (wire as object)).toBe(false); // the wire key is `by`, never the internal name
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

  it("burst row: [k,id,x,y] — the server-internal `own` field NEVER materializes (fogged)", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const e: BurstSubject = { k: 'burst', id: 's1', x: 500, y: 0, own: 'a' };
    const row = signalFor('burst')!;
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, e)).toBe(true); // owner-visible far beyond sight
    const wire = row.materialize(ctx, e) as BurstEvent;
    expect(Object.keys(wire)).toEqual(['k', 'id', 'x', 'y']);
    expect('own' in wire).toBe(false); // never on the wire
  });

  it('burst row: spectator materialize ALSO rebuilds the bare shape (no `own` leak unfogged)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const e: BurstSubject = { k: 'burst', id: 's1', x: 500, y: 0, own: 'a' };
    const row = signalFor('burst')!;
    const ctx: SpectatorSignalContext = {
      mode: 'spectator', observerId: 'ghost', now: w.now, islands: w.map.islands, ships: w.ships, litZones: w.litZones, me: undefined,
    };
    expect(row.visible(ctx, e)).toBe(true);
    const wire = row.materialize(ctx, e) as BurstEvent;
    expect(Object.keys(wire)).toEqual(['k', 'id', 'x', 'y']);
    expect('own' in wire).toBe(false);
  });

  it('burst row visibility: owner anywhere; non-owner needs the burst point sighted', () => {
    const w = bareWorld();
    const owner = place(w, 'a', 0, 0);
    const near = place(w, 'b', 480, 0); // burst point 20u away — sighted
    const far = place(w, 'c', -900, 0); // burst point 1400u away — fogged
    const e: BurstSubject = { k: 'burst', id: 's1', x: 500, y: 0, own: 'a' };
    const row = signalFor('burst')!;
    expect(row.visible(foggedCtx(w, owner), e)).toBe(true); // the firer authored the point
    expect(row.visible(foggedCtx(w, near), e)).toBe(true); // point sighted
    expect(row.visible(foggedCtx(w, far), e)).toBe(false); // fogged — never delivered
  });
});

// ---------- litzone visibility (Story 1.7) ------------------------------------

describe('SIGNAL_REGISTRY — litzone row visibility (owner always, else radar-gated, no LOS/sweep)', () => {
  it('the OWNER sees its zone anywhere — even with the center beyond its own radar', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    injectZone(w, 'z1', 'a', RADAR + 500, 0); // far beyond a's radar
    expect(SIGNAL_REGISTRY.litzone.visible(foggedCtx(w, a), w.litZones.get('z1')!)).toBe(true);
  });

  it('a non-owner sees the circle iff the zone CENTER is within effective radar range (boundary inclusive)', () => {
    const w = bareWorld();
    const b = place(w, 'b', 0, 0);
    injectZone(w, 'at', 'a', RADAR, 0); // exactly at radar — inclusive
    injectZone(w, 'past', 'a', RADAR + 0.01, 0); // a hair beyond — invisible
    const ctx = foggedCtx(w, b);
    expect(SIGNAL_REGISTRY.litzone.visible(ctx, w.litZones.get('at')!)).toBe(true);
    expect(SIGNAL_REGISTRY.litzone.visible(ctx, w.litZones.get('past')!)).toBe(false);
  });

  it('no LOS gate: an island between observer and zone center never hides the circle', () => {
    const w = bareWorld();
    w.map.islands.push({ x: 200, y: 0, r: 40 }); // would block sight AND radar paint
    const b = place(w, 'b', 0, 0);
    injectZone(w, 'z1', 'a', 400, 0);
    expect(SIGNAL_REGISTRY.litzone.visible(foggedCtx(w, b), w.litZones.get('z1')!)).toBe(true);
  });

  it('no sweep gate: visibility never consults the paint window', () => {
    const w = bareWorld();
    const b = place(w, 'b', 0, 0);
    b.prevSweepAngle = Math.PI; // beam on the far side of the zone's bearing (0)
    b.sweepAngle = Math.PI + 0.02;
    injectZone(w, 'z1', 'a', 400, 0);
    expect(SIGNAL_REGISTRY.litzone.visible(foggedCtx(w, b), w.litZones.get('z1')!)).toBe(true);
  });

  it('spectators see every zone', () => {
    const w = bareWorld();
    injectZone(w, 'z1', 'a', 9_000, 9_000); // absurdly far from everything
    const ctx: SpectatorSignalContext = {
      mode: 'spectator', observerId: 'ghost', now: w.now, islands: w.map.islands, ships: w.ships, litZones: w.litZones, me: undefined,
    };
    expect(SIGNAL_REGISTRY.litzone.visible(ctx, w.litZones.get('z1')!)).toBe(true);
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
  it('materialize is PURE (no mutation); marking the id is what flips visible()', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const shell = makeShell({ id: 's1', ownerId: 'a', kind: 'shell' });
    const row = signalFor('shell')!;
    const ctx = foggedCtx(w, a);
    expect(a.seenBallistics.has('s1')).toBe(false);
    expect(row.visible(ctx, shell)).toBe(true);
    row.materialize(ctx, shell);
    // The reveal mark is the SCAN's job, never materialize: shaping the wire
    // object must NOT mutate seenBallistics (a mutating materialize on a public
    // registry would let counter-intel wiring consume reveals by accident).
    expect(a.seenBallistics.has('s1')).toBe(false);
    expect(row.visible(ctx, shell)).toBe(true); // still visible — nothing marked
    // Manually mark the id (what perception.ballisticScan does) => now hidden.
    a.seenBallistics.add('s1');
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
    expect(a.seenBallistics.has('t1')).toBe(false); // pure — no mutation
    a.seenBallistics.add('t1'); // the scan marks it
    expect(row.visible(ctx, torp)).toBe(false);
  });
});

// ---------- fail-closed lookups -----------------------------------------------

describe('SIGNAL_REGISTRY — fail-closed lookup + registry integrity', () => {
  // signalFor is the WORLD-EVENT dispatcher: it resolves ONLY the 11 GameEvent
  // kinds. The three contact/mine/litzone pseudo-rows are unreachable from it
  // (a fabricated k:'mine' or k:'litzone' world event can never materialize),
  // and inherited prototype keys resolve to nothing (Object.hasOwn lookup).
  const EVENT_KINDS = ['blip', 'shell', 'torp', 'boom', 'burst', 'sunk', 'spawn', 'dmg', 'upg', 'pt', 'heal'];

  it('signalFor returns undefined for an unknown kind', () => {
    expect(signalFor('nonexistent')).toBeUndefined();
    expect(signalFor('')).toBeUndefined();
    expect(signalFor('CONTACT')).toBeUndefined(); // case-sensitive, not fuzzy
  });

  it('signalFor resolves exactly the 11 event kinds to their registry rows', () => {
    for (const key of EVENT_KINDS) {
      expect(signalFor(key)).toBe(SIGNAL_REGISTRY[key as keyof typeof SIGNAL_REGISTRY]);
    }
  });

  it('signalFor excludes the contact/mine/litzone pseudo-rows (world-event dispatch only)', () => {
    expect(signalFor('contact')).toBeUndefined();
    expect(signalFor('mine')).toBeUndefined();
    expect(signalFor('litzone')).toBeUndefined();
    // ...but the rows themselves still exist for direct scan-driven access.
    expect(SIGNAL_REGISTRY.contact).toBeDefined();
    expect(SIGNAL_REGISTRY.mine).toBeDefined();
    expect(SIGNAL_REGISTRY.litzone).toBeDefined();
  });

  it('signalFor never resolves an inherited prototype key to a Function', () => {
    expect(signalFor('constructor')).toBeUndefined();
    expect(signalFor('toString')).toBeUndefined();
    expect(signalFor('hasOwnProperty')).toBeUndefined();
    expect(signalFor('__proto__')).toBeUndefined();
  });

  it('SIGNAL_REGISTRY AND every row are frozen', () => {
    expect(Object.isFrozen(SIGNAL_REGISTRY)).toBe(true);
    for (const row of Object.values(SIGNAL_REGISTRY)) {
      expect(Object.isFrozen(row)).toBe(true);
    }
  });
});
