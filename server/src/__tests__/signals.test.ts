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

/** A fogged SignalContext for `me`, reading time/islands/ships/zones/decoys off the world. */
function foggedCtx(w: World, me: ShipRecord, now = w.now): FoggedSignalContext {
  return { mode: 'fogged', observerId: me.id, now, islands: w.map.islands, ships: w.ships, litZones: w.litZones, decoys: w.decoys, me };
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
  'decoy',
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
  it('has exactly the 15 known channels', () => {
    expect(Object.keys(SIGNAL_REGISTRY).sort()).toEqual([...REGISTRY_KEYS].sort());
    expect(Object.keys(SIGNAL_REGISTRY)).toHaveLength(15);
  });

  it('every row: eventType matches its registry key, visible/materialize are callable; counterIntel lives ONLY on the blip row (Story 1.8)', () => {
    for (const [key, row] of Object.entries(SIGNAL_REGISTRY)) {
      expect(row.eventType).toBe(key);
      expect(typeof row.visible).toBe('function');
      expect(typeof row.materialize).toBe('function');
      // Story 1.8 lands the FIRST counterIntel implementation — the blip row's
      // decoy radar-double. Every other row keeps the slot empty.
      if (key === 'blip') expect(typeof row.counterIntel).toBe('function');
      else expect(row.counterIntel).toBeUndefined();
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

  it('mine row: [id,x,y,own,by] — `by` (dropper id) appended LAST (Story 1.12)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const mine = makeMine({ ownerId: 'a', x: 50, y: 0 }); // owner sees it always
    const row = SIGNAL_REGISTRY.mine; // pseudo-row: direct access (not signalFor)
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, mine)).toBe(true);
    const wire = row.materialize(ctx, mine);
    expect(Object.keys(wire as object)).toEqual(['id', 'x', 'y', 'own', 'by']);
    expect((wire as { by: string }).by).toBe('a'); // the dropper's ship id
  });

  it('decoy row: [id,x,y,until,own,by] — DECOY id, `by` = owner ship id appended LAST (Story 1.12)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.decoys.set('d1', { id: 'd1', ownerId: 'a', x: 40, y: 0, until: 30_000 }); // owner sees it always
    const row = SIGNAL_REGISTRY.decoy; // pseudo-row: direct access (not signalFor)
    const ctx = foggedCtx(w, a);
    const decoy = w.decoys.get('d1')!;
    expect(row.visible(ctx, decoy)).toBe(true);
    const wire = row.materialize(ctx, decoy);
    expect(Object.keys(wire as object)).toEqual(['id', 'x', 'y', 'until', 'own', 'by']);
    // `id` is the DECOY's own id; `by` is the OWNER's ship id (the personal-hue +
    // roster attribution hook — the deceiving blip carries the owner id separately).
    expect(wire).toEqual({ id: 'd1', x: 40, y: 0, until: 30_000, own: true, by: 'a' });
  });

  it('blip row counterIntel: the SAME [k,id,x,y,t] shape, id = the OWNER\'s ship id at the BUOY\'s position', () => {
    const w = bareWorld();
    const b = place(w, 'b', 0, 0); // fogged non-owner observer
    w.decoys.set('d1', { id: 'd1', ownerId: 'a', x: 400, y: 0, until: 999_999 }); // radar annulus, bearing 0
    b.prevSweepAngle = wrapPositive(-0.02);
    b.sweepAngle = wrapPositive(0.02); // beam just crossed bearing 0 this tick
    const row = SIGNAL_REGISTRY.blip;
    const lie = row.counterIntel!(foggedCtx(w, b), w.decoys.get('d1')!);
    expect(lie).not.toBeNull();
    expect(Object.keys(lie as object)).toEqual(['k', 'id', 'x', 'y', 't']); // byte-identical to a real paint
    expect(lie).toEqual({ k: 'blip', id: 'a', x: 400, y: 0, t: w.now });
  });

  it('blip row counterIntel: SUPPRESSED while the owner is contact-visible (the FR10 coexistence guard)', () => {
    const w = bareWorld();
    const b = place(w, 'b', 0, 0);
    const a = place(w, 'a', 100, 0); // the owner, inside b's sight — a live contact
    w.decoys.set('d1', { id: 'd1', ownerId: 'a', x: 400, y: 0, until: 999_999 }); // swept annulus
    b.prevSweepAngle = wrapPositive(-0.02);
    b.sweepAngle = wrapPositive(0.02);
    const row = SIGNAL_REGISTRY.blip;
    const ctx = foggedCtx(w, b);
    expect(SIGNAL_REGISTRY.contact.visible(ctx, a)).toBe(true); // the exact predicate the guard reuses
    expect(row.counterIntel!(ctx, w.decoys.get('d1')!)).toBeNull(); // contact(a) + blip(a) can never coexist
    // Owner out of contact reach: the same call lies again (control).
    a.state.x = -400; // annulus, bearing π — invisible to the window around 0
    expect(SIGNAL_REGISTRY.contact.visible(ctx, a)).toBe(false);
    expect(row.counterIntel!(ctx, w.decoys.get('d1')!)).toEqual({ k: 'blip', id: 'a', x: 400, y: 0, t: w.now });
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
      mode: 'spectator', observerId: 'ghost', now: w.now, islands: w.map.islands, ships: w.ships, litZones: w.litZones, decoys: w.decoys, me: undefined,
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
      mode: 'spectator', observerId: 'ghost', now: w.now, islands: w.map.islands, ships: w.ships, litZones: w.litZones, decoys: w.decoys, me: undefined,
    };
    expect(SIGNAL_REGISTRY.litzone.visible(ctx, w.litZones.get('z1')!)).toBe(true);
  });
});

// ---------- owned-zone parity on the point-gated event rows (Story 1.7) ------

describe('SIGNAL_REGISTRY — owned-zone parity: boom/burst/sunk/spawn see into an OWNED zone', () => {
  /** Observer `a` owning a zone at (900,0) — far beyond its 220u sight. */
  function zoneWorld(): { w: World; a: ShipRecord } {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 900, y: 0, r: CONFIG.starShells.litRadius, until: 999_999 });
    return { w, a };
  }

  it('boom: visible at a zone-covered point, and the victim id is KEPT when the victim center is zone-covered', () => {
    const { w, a } = zoneWorld();
    place(w, 'b', 900, 0); // victim center inside the zone
    const e: BoomEvent = { k: 'boom', id: 's1', hit: 'b', x: 890, y: 0 };
    const row = signalFor('boom')!;
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, e)).toBe(true); // pre-1.7 this was invisible (out of sight)
    expect((row.materialize(ctx, e) as BoomEvent).hit).toBe('b'); // un-stripped under the zone
  });

  it('boom: still STRIPPED when the impact is zone-covered but the victim center is outside the zone', () => {
    const { w, a } = zoneWorld();
    place(w, 'b', 900 + CONFIG.starShells.litRadius + 10, 0); // center past the zone edge
    const e: BoomEvent = { k: 'boom', id: 's1', hit: 'b', x: 990, y: 0 }; // impact inside the zone
    const row = signalFor('boom')!;
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, e)).toBe(true);
    const wire = row.materialize(ctx, e) as BoomEvent;
    expect(Object.keys(wire)).toEqual(['k', 'id', 'x', 'y']);
    expect('hit' in wire).toBe(false);
  });

  it('burst: a non-shell-owner whose OWN zone covers the point receives it', () => {
    const { w, a } = zoneWorld();
    const e: BurstSubject = { k: 'burst', id: 's1', x: 900, y: 0, own: 'x' }; // someone else's shell
    expect(signalFor('burst')!.visible(foggedCtx(w, a), e)).toBe(true);
  });

  it('sunk: a wreck inside the owned zone is visible', () => {
    const { w, a } = zoneWorld();
    place(w, 'b', 900, 0);
    w.sinkShip('b');
    expect(signalFor('sunk')!.visible(foggedCtx(w, a), { k: 'sunk', id: 'b' })).toBe(true);
  });

  it('spawn: a spawn point inside the owned zone is visible', () => {
    const { w, a } = zoneWorld();
    const e = { k: 'spawn', id: 'b', x: 890, y: 0 } as const;
    expect(signalFor('spawn')!.visible(foggedCtx(w, a), e)).toBe(true);
  });

  it("NON-owners gain none of it from someone else's zone (all four rows)", () => {
    const { w } = zoneWorld(); // the zone belongs to 'a'
    const c = place(w, 'c', 0, 300); // never the owner
    place(w, 'b', 900, 0);
    w.sinkShip('b');
    const ctx = foggedCtx(w, c);
    expect(signalFor('boom')!.visible(ctx, { k: 'boom', id: 's1', hit: 'b', x: 890, y: 0 })).toBe(false);
    expect(signalFor('burst')!.visible(ctx, { k: 'burst', id: 's1', x: 900, y: 0, own: 'a' } as BurstSubject)).toBe(false);
    expect(signalFor('sunk')!.visible(ctx, { k: 'sunk', id: 'b' })).toBe(false);
    expect(signalFor('spawn')!.visible(ctx, { k: 'spawn', id: 'b', x: 890, y: 0 })).toBe(false);
  });

  it('blip: a zone-covered annulus ship fails the blip row even when swept (already a full contact)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0); // radar annulus, bearing 0
    a.prevSweepAngle = wrapPositive(-0.02);
    a.sweepAngle = wrapPositive(0.02); // beam crossing bearing 0 this tick
    const row = signalFor('blip')!;
    expect(row.visible(foggedCtx(w, a), b)).toBe(true); // sanity: paints without a zone
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 400, y: 0, r: CONFIG.starShells.litRadius, until: 999_999 });
    expect(row.visible(foggedCtx(w, a), b)).toBe(false); // contact tier now — never a blip
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
  // kinds. The four contact/mine/litzone/decoy pseudo-rows are unreachable from
  // it (a fabricated k:'mine'/'litzone'/'decoy' world event can never
  // materialize), and inherited prototype keys resolve to nothing (Object.hasOwn).
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

  it('signalFor excludes the contact/mine/litzone/decoy pseudo-rows (world-event dispatch only)', () => {
    expect(signalFor('contact')).toBeUndefined();
    expect(signalFor('mine')).toBeUndefined();
    expect(signalFor('litzone')).toBeUndefined();
    expect(signalFor('decoy')).toBeUndefined();
    // ...but the rows themselves still exist for direct scan-driven access.
    expect(SIGNAL_REGISTRY.contact).toBeDefined();
    expect(SIGNAL_REGISTRY.mine).toBeDefined();
    expect(SIGNAL_REGISTRY.litzone).toBeDefined();
    expect(SIGNAL_REGISTRY.decoy).toBeDefined();
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
