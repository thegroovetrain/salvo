// Structural unit tests for the SIGNAL_REGISTRY itself (Story 1.1). These are
// wire-shape and registry-mechanics tests, NOT the behavioral fog-of-war
// invariant suite (that lives in perception.test.ts, which reimplements the
// visibility predicates independently). Here we exercise each row's
// visible()/materialize() directly through the narrow SignalContext, the way
// perception.ts is the ONLY other caller.

import { describe, it, expect } from 'vitest';
import { CONFIG, wrapPositive, type BallisticEvent, type BoomEvent, type BurstEvent, type HealEvent, type HitCallEvent, type MuzzleEvent, type ShellState, type SmokeEvent, type SplashEvent, type SunkEvent } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import type { MineState } from '../game/equipment/index.js';
import {
  SIGNAL_REGISTRY,
  signalFor,
  type BurstSubject,
  type FoggedSignalContext,
  type SpectatorSignalContext,
} from '../game/signals.js';
import { circleIsland } from './islandFixture.js';

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

/** A fogged SignalContext for `me`, reading time/islands/ships/zones/decoys —
 *  and the radar modes + pseudonym resolver (radar realism cycle) — off the world. */
function foggedCtx(w: World, me: ShipRecord, now = w.now): FoggedSignalContext {
  return {
    mode: 'fogged', observerId: me.id, now, islands: w.map.islands, ships: w.ships,
    litZones: w.litZones, decoys: w.decoys, me,
    radarGrammar: w.radarGrammar, radarIdentity: w.radarIdentity, pseudonymOf: (id) => w.pseudonymFor(id),
  };
}

/** The spectator sibling of foggedCtx (the record-less 'ghost' observer). */
function specCtx(w: World, observerId = 'ghost'): SpectatorSignalContext {
  return {
    mode: 'spectator', observerId, now: w.now, islands: w.map.islands, ships: w.ships,
    litZones: w.litZones, decoys: w.decoys, me: undefined,
    radarGrammar: w.radarGrammar, radarIdentity: w.radarIdentity, pseudonymOf: (id) => w.pseudonymFor(id),
  };
}

/** Drop a lit zone directly into world state (Story 1.7). */
function injectZone(w: World, id: string, ownerId: string, x: number, y: number, r = CONFIG.starShells.litRadius, until = 999_999): void {
  w.litZones.set(id, { id, ownerId, x, y, r, until, mode: 'standard' });
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
  // 'upg' died with the legacy upgrade economy (Story 2.8 strip); 'torpU' is
  // the homing-track update row that entered in the same story.
  'torpU',
  'pt',
  'bn',
  // Story 4.3 — the gunnery conversation's three declared fog exceptions.
  'sp',
  'hc',
  'mz',
  // DAMAGE CONTROL (2026-08-04) — the heal spend's self-private toast; the
  // 'heal' key RETURNS to the registry after Story 2.1 retired it with REPAIR.
  'heal',
  // Story 4.4 — wounded smoke, the fifth declared fog exception (anonymous
  // {k,x,y,tier} pulse inside the constant muzzle-flash halo).
  'sm',
  // Story 4.5 — the foghorn, the sixth declared fog exception (bearing + tier
  // for fogged listeners; islands muffle by exactly one tier).
  'fh',
];

// ---------- row shape ----------------------------------------------------

describe('SIGNAL_REGISTRY — row shape', () => {
  it('has exactly the 21 known channels (Story 2.8: `upg` stripped, `torpU` added; Story 4.3: `sp`/`hc`/`mz` added; 2026-08-04: `heal` returns; Story 4.4: `sm` added; Story 4.5: `fh` added)', () => {
    expect(Object.keys(SIGNAL_REGISTRY).sort()).toEqual([...REGISTRY_KEYS].sort());
    expect(Object.keys(SIGNAL_REGISTRY)).toHaveLength(21);
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

  it('blip row: [k,id,x,y,t,cls,heading,speed] — Story 4.2 appends the LIVE pose after t', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', RADAR, 0, 1.2); // beyond sight, at the radar boundary, bearing 0
    b.state.speed = -4; // astern — the raw SIGNED scalar rides the wire
    a.prevSweepAngle = wrapPositive(-0.02);
    a.sweepAngle = wrapPositive(0.02); // beam just crossed bearing 0 this tick
    const row = signalFor('blip')!;
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, b)).toBe(true);
    const wire = row.materialize(ctx, b);
    expect(Object.keys(wire as object)).toEqual(['k', 'id', 'x', 'y', 't', 'cls', 'heading', 'speed']);
    expect(wire).toEqual({ k: 'blip', id: 'b', x: RADAR, y: 0, t: w.now, cls: 'torpedoBoat', heading: 1.2, speed: -4 });
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
    w.decoys.set('d1', { id: 'd1', ownerId: 'a', x: 40, y: 0, hullId: 'mineLayer', heading: 0, until: 30_000 }); // owner sees it always
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

  it('blip row counterIntel: the SAME [k,id,x,y,t,cls,heading,speed] shape — OWNER\'s ship id at the BUOY\'s position, FROZEN drop-time pose at speed 0', () => {
    const w = bareWorld();
    const b = place(w, 'b', 0, 0); // fogged non-owner observer
    // hullId/heading are the drop-time snapshot ON the record (Story 4.2,
    // amendment 11) — the owner needs no ship in the world at all.
    w.decoys.set('d1', { id: 'd1', ownerId: 'a', x: 400, y: 0, hullId: 'mineLayer', heading: 0.9, until: 999_999 }); // radar annulus, bearing 0
    b.prevSweepAngle = wrapPositive(-0.02);
    b.sweepAngle = wrapPositive(0.02); // beam just crossed bearing 0 this tick
    const row = SIGNAL_REGISTRY.blip;
    const lie = row.counterIntel!(foggedCtx(w, b), w.decoys.get('d1')!);
    expect(lie).not.toBeNull();
    expect(Object.keys(lie as object)).toEqual(['k', 'id', 'x', 'y', 't', 'cls', 'heading', 'speed']); // byte-identical to a real paint
    expect(lie).toEqual({ k: 'blip', id: 'a', x: 400, y: 0, t: w.now, cls: 'mineLayer', heading: 0.9, speed: 0 });
  });

  it('blip row counterIntel: SUPPRESSED while the owner is contact-visible (the FR10 coexistence guard)', () => {
    const w = bareWorld();
    const b = place(w, 'b', 0, 0);
    const a = place(w, 'a', 100, 0); // the owner, inside b's sight — a live contact
    w.decoys.set('d1', { id: 'd1', ownerId: 'a', x: 400, y: 0, hullId: 'mineLayer', heading: 0, until: 999_999 }); // swept annulus
    b.prevSweepAngle = wrapPositive(-0.02);
    b.sweepAngle = wrapPositive(0.02);
    const row = SIGNAL_REGISTRY.blip;
    const ctx = foggedCtx(w, b);
    expect(SIGNAL_REGISTRY.contact.visible(ctx, a)).toBe(true); // the exact predicate the guard reuses
    expect(row.counterIntel!(ctx, w.decoys.get('d1')!)).toBeNull(); // contact(a) + blip(a) can never coexist
    // Owner out of contact reach: the same call lies again (control).
    a.state.x = -400; // annulus, bearing π — invisible to the window around 0
    expect(SIGNAL_REGISTRY.contact.visible(ctx, a)).toBe(false);
    expect(row.counterIntel!(ctx, w.decoys.get('d1')!)).toEqual({ k: 'blip', id: 'a', x: 400, y: 0, t: w.now, cls: 'mineLayer', heading: 0, speed: 0 });
  });

  it('litzone row: [id,x,y,r,until,by,mode] — `by` is the firer\'s ship id, ownerId never leaks raw', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    injectZone(w, 'z1', 'a', 400, 0, 110, 12_345); // owner sees it always
    const row = SIGNAL_REGISTRY.litzone; // pseudo-row: direct access (not signalFor)
    const ctx = foggedCtx(w, a);
    const zone = w.litZones.get('z1')!;
    expect(row.visible(ctx, zone)).toBe(true);
    const wire = row.materialize(ctx, zone);
    expect(Object.keys(wire as object)).toEqual(['id', 'x', 'y', 'r', 'until', 'by', 'mode']);
    expect(wire).toEqual({ id: 'z1', x: 400, y: 0, r: 110, until: 12_345, by: 'a', mode: 'standard' });
    expect('ownerId' in (wire as object)).toBe(false); // the wire key is `by`, never the internal name
  });

  it('litzone row carries the zone\'s DOCTRINE mode verbatim (Story 2.9, amendment 50)', () => {
    const w = bareWorld();
    const b = place(w, 'b', 0, 0); // a NON-owner observer within radar range
    w.litZones.set('zi', { id: 'zi', ownerId: 'a', x: 400, y: 0, r: 130, until: 999_999, mode: 'incendiary' });
    w.litZones.set('zd', { id: 'zd', ownerId: 'a', x: 0, y: 400, r: 165, until: 999_999, mode: 'dazzle' });
    const row = SIGNAL_REGISTRY.litzone;
    const ctx = foggedCtx(w, b);
    for (const [id, mode] of [['zi', 'incendiary'], ['zd', 'dazzle']] as const) {
      const zone = w.litZones.get(id)!;
      expect(row.visible(ctx, zone)).toBe(true); // radar-gated non-owner sees the circle
      expect((row.materialize(ctx, zone) as { mode: string }).mode).toBe(mode);
    }
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
    const ctx = specCtx(w);
    expect(row.visible(ctx, e)).toBe(true);
    const wire = row.materialize(ctx, e) as BurstEvent;
    expect(Object.keys(wire)).toEqual(['k', 'id', 'x', 'y']);
    expect('own' in wire).toBe(false);
  });

  it("sp row (Story 4.3): [k,id,x,y] — shooter-private at ANY range; a sighted non-shooter NEVER receives it", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 850, 50); // sits right next to the splash — still never told
    const e: SplashEvent = { k: 'sp', id: 'a', x: 900, y: 0 }; // far beyond a's 330u sight
    const row = signalFor('sp')!;
    expect(row.visible(foggedCtx(w, a), e)).toBe(true); // the shooter, through any fog
    expect(row.visible(foggedCtx(w, b), e)).toBe(false); // self-private — proximity is irrelevant
    const wire = row.materialize(foggedCtx(w, a), e);
    expect(Object.keys(wire as object)).toEqual(['k', 'id', 'x', 'y']);
  });

  it('hc row (Story 4.3): [k,id,x,y] — `id` is the SHOOTER, and NO severity/victim field exists on the wire', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 850, 50); // near the impact — still never told
    const e: HitCallEvent = { k: 'hc', id: 'a', x: 900, y: 0 }; // a fogged hit, far beyond sight
    const row = signalFor('hc')!;
    expect(row.visible(foggedCtx(w, a), e)).toBe(true); // the shooter, through any fog
    expect(row.visible(foggedCtx(w, b), e)).toBe(false); // even the VICTIM's neighborhood learns nothing
    const wire = row.materialize(foggedCtx(w, a), e) as HitCallEvent;
    expect(Object.keys(wire)).toEqual(['k', 'id', 'x', 'y']);
    expect(wire.id).toBe('a'); // the shooter's own id — never a victim reference
    for (const forbidden of ['hit', 'amount', 'hp', 'kill', 'weapon']) {
      expect(forbidden in (wire as object)).toBe(false);
    }
  });

  it('sp/hc rows are spectator-public (the dmg precedent), materializing the same verbatim shape', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const ctx = specCtx(w);
    const sp: SplashEvent = { k: 'sp', id: 'a', x: 900, y: 0 };
    const hc: HitCallEvent = { k: 'hc', id: 'a', x: 900, y: 0 };
    expect(signalFor('sp')!.visible(ctx, sp)).toBe(true);
    expect(signalFor('hc')!.visible(ctx, hc)).toBe(true);
    expect(Object.keys(signalFor('sp')!.materialize(ctx, sp) as object)).toEqual(['k', 'id', 'x', 'y']);
    expect(Object.keys(signalFor('hc')!.materialize(ctx, hc) as object)).toEqual(['k', 'id', 'x', 'y']);
  });

  it('heal row (DAMAGE CONTROL 2026-08-04): [k,id] — self-private AND spectator-private, with no severity channel', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 20, 0); // hull-to-hull, fully sighted — still never told
    const e: HealEvent = { k: 'heal', id: 'a' };
    const row = signalFor('heal')!;
    expect(row.visible(foggedCtx(w, a), e)).toBe(true); // the healer alone
    expect(row.visible(foggedCtx(w, b), e)).toBe(false); // proximity is irrelevant — no observer cue
    const spec = specCtx(w);
    // The pt/bn terms, NOT dmg's: a spectator may watch hp move, but must never
    // learn a living hull converted a banked level into survival.
    expect(row.visible(spec, e)).toBe(false);
    const wire = row.materialize(foggedCtx(w, a), e) as HealEvent;
    expect(Object.keys(wire)).toEqual(['k', 'id']);
    for (const forbidden of ['hp', 'amount', 'repairHp', 'pool', 'maxHp']) {
      expect(forbidden in (wire as object)).toBe(false);
    }
  });

  it('mz row (Story 4.3): [k,x,y] with NO id for ANY observer — fogged, shooter, and spectator alike', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 400); // 400u from the flash — inside the 495u halo
    const e: MuzzleEvent = { k: 'mz', x: 0, y: 0 };
    const row = signalFor('mz')!;
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, e)).toBe(true);
    const wire = row.materialize(ctx, e) as MuzzleEvent;
    expect(Object.keys(wire)).toEqual(['k', 'x', 'y']);
    expect('id' in wire).toBe(false); // no identity channel, period (amendment 19)
    const spec = specCtx(w);
    expect(row.visible(spec, e)).toBe(true);
    expect(Object.keys(row.materialize(spec, e) as object)).toEqual(['k', 'x', 'y']);
  });

  it('mz row visibility: the CONSTANT SIGHT*1.5 halo (boundary inclusive), island LOS applies, dazzle does NOT shrink it', () => {
    const w = bareWorld();
    const at = place(w, 'at', CONFIG.vision.muzzleFlash, 0); // exactly at the halo — inclusive
    const past = place(w, 'past', CONFIG.vision.muzzleFlash + 0.01, 0); // a hair beyond
    const e: MuzzleEvent = { k: 'mz', x: 0, y: 0 };
    const row = signalFor('mz')!;
    expect(row.visible(foggedCtx(w, at), e)).toBe(true);
    expect(row.visible(foggedCtx(w, past), e)).toBe(false);
    // Dazzle shrinks the observer's SIGHT, never the flash halo: a flash is a
    // light source, not an illuminated object (deliberate sightOf bypass).
    at.dazzledUntil = w.now + 10_000;
    expect(row.visible(foggedCtx(w, at), e)).toBe(true);
    // Island LOS blocks the flash exactly like every other sensor
    // (Eric ruling 2026-08-02).
    w.map.islands.push(circleIsland(200, 0, 40));
    expect(row.visible(foggedCtx(w, at), e)).toBe(false);
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

// ---------- wounded smoke (Story 4.4) -----------------------------------------

describe('SIGNAL_REGISTRY — sm row (Story 4.4: wounded smoke, the fifth declared fog exception)', () => {
  const row = signalFor('sm')!;

  it('materializes exactly [k,x,y,tier] as a FRESH object — never the subject verbatim', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 100); // inside the halo
    const e: SmokeEvent = { k: 'sm', x: 0, y: 0, tier: 2 };
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, e)).toBe(true);
    const wire = row.materialize(ctx, e) as SmokeEvent;
    expect(wire).not.toBe(e); // fresh bare object — the mz/burst discipline
    expect(Object.keys(wire)).toEqual(['k', 'x', 'y', 'tier']);
    expect(wire).toEqual({ k: 'sm', x: 0, y: 0, tier: 2 });
    for (const forbidden of ['id', 'hue', 'cls', 'hp', 'frac', 'heading', 'by', 'own']) {
      expect(forbidden in (wire as object)).toBe(false);
    }
  });

  it('visibility is the CONSTANT muzzle-flash halo: inside passes, exactly at passes (inclusive), a hair beyond fails', () => {
    const w = bareWorld();
    const inside = place(w, 'in', 100, 0);
    const at = place(w, 'at', CONFIG.vision.muzzleFlash, 0);
    const past = place(w, 'past', CONFIG.vision.muzzleFlash + 0.01, 0);
    const e: SmokeEvent = { k: 'sm', x: 0, y: 0, tier: 1 };
    expect(row.visible(foggedCtx(w, inside), e)).toBe(true);
    expect(row.visible(foggedCtx(w, at), e)).toBe(true);
    expect(row.visible(foggedCtx(w, past), e)).toBe(false);
  });

  it('island LOS blocks the plume exactly like every other sensor; dazzle does NOT shrink the halo', () => {
    const w = bareWorld();
    const a = place(w, 'a', 400, 0); // inside the 495u halo
    const e: SmokeEvent = { k: 'sm', x: 0, y: 0, tier: 1 };
    // Dazzle shrinks the observer's SIGHT, never the smoke halo (the mz rule:
    // the halo is the raw constant, deliberately not sightOf).
    a.dazzledUntil = w.now + 10_000;
    expect(row.visible(foggedCtx(w, a), e)).toBe(true);
    w.map.islands.push(circleIsland(200, 0, 40)); // on the segment
    expect(row.visible(foggedCtx(w, a), e)).toBe(false);
  });

  it('an OWNED lit zone over the puff does NOT extend the halo (no ownZoneCovers term, the mz rule)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    injectZone(w, 'z1', 'a', 900, 0); // a's own zone, far beyond the 495u halo
    const e: SmokeEvent = { k: 'sm', x: 900, y: 0, tier: 2 }; // puff dead-center in a's zone
    expect(row.visible(foggedCtx(w, a), e)).toBe(false);
  });

  it('the smoking captain gets the SAME anonymous payload through the same gate (dist 0 — no special case)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const e: SmokeEvent = { k: 'sm', x: 0, y: 0, tier: 1 }; // a's own puff, at a's own position
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, e)).toBe(true); // dist 0 passes the halo trivially
    expect(row.materialize(ctx, e)).toEqual({ k: 'sm', x: 0, y: 0, tier: 1 }); // still no id
  });

  it('spectators see every puff, and the spectator payload carries no id either', () => {
    const w = bareWorld();
    const e: SmokeEvent = { k: 'sm', x: 9_000, y: 9_000, tier: 2 }; // absurdly far from everything
    const ctx = specCtx(w);
    expect(row.visible(ctx, e)).toBe(true);
    const wire = row.materialize(ctx, e) as SmokeEvent;
    expect(wire).not.toBe(e);
    expect(Object.keys(wire)).toEqual(['k', 'x', 'y', 'tier']);
    expect('id' in (wire as object)).toBe(false);
  });

  it('both tiers pass through verbatim — the enum, never a fraction', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const ctx = foggedCtx(w, a);
    expect((row.materialize(ctx, { k: 'sm', x: 1, y: 2, tier: 1 } as SmokeEvent) as SmokeEvent).tier).toBe(1);
    expect((row.materialize(ctx, { k: 'sm', x: 1, y: 2, tier: 2 } as SmokeEvent) as SmokeEvent).tier).toBe(2);
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
    w.map.islands.push(circleIsland(200, 0, 40)); // would block sight AND radar paint
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
    const ctx = specCtx(w);
    expect(SIGNAL_REGISTRY.litzone.visible(ctx, w.litZones.get('z1')!)).toBe(true);
  });
});

// ---------- owned-zone parity on the point-gated event rows (Story 1.7) ------

describe('SIGNAL_REGISTRY — owned-zone parity: boom/burst/sunk/spawn see into an OWNED zone', () => {
  /** Observer `a` owning a zone at (900,0) — far beyond its 220u sight. */
  function zoneWorld(): { w: World; a: ShipRecord } {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 900, y: 0, r: CONFIG.starShells.litRadius, until: 999_999, mode: 'standard' });
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

  it('sunk: a wreck inside the owned zone is visible — and WITNESSED (seen: true)', () => {
    const { w, a } = zoneWorld();
    // A DRONE wreck isolates the zone clause: a human wreck would be visible
    // via the public register regardless (PV 23), a drone only when witnessed.
    const d = w.addShip('db', 'DRONE-01', true, 'droneSmall');
    d.state.x = 900;
    d.state.y = 0;
    w.sinkShip('db');
    const row = signalFor('sunk')!;
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, { k: 'sunk', id: 'db' })).toBe(true);
    expect((row.materialize(ctx, { k: 'sunk', id: 'db' }) as SunkEvent).seen).toBe(true);
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
    // The sunk row's zone clause is probed with a DRONE wreck: a human wreck
    // is now visible everywhere via the public-register clause (PV 23 — see
    // the dedicated suite below), so only a drone still isolates the zone term.
    const d = w.addShip('db', 'DRONE-01', true, 'droneSmall');
    d.state.x = 900;
    d.state.y = 0;
    w.sinkShip('db');
    const ctx = foggedCtx(w, c);
    expect(signalFor('boom')!.visible(ctx, { k: 'boom', id: 's1', hit: 'b', x: 890, y: 0 })).toBe(false);
    expect(signalFor('burst')!.visible(ctx, { k: 'burst', id: 's1', x: 900, y: 0, own: 'a' } as BurstSubject)).toBe(false);
    expect(signalFor('sunk')!.visible(ctx, { k: 'sunk', id: 'db' })).toBe(false);
    expect(signalFor('spawn')!.visible(ctx, { k: 'spawn', id: 'b', x: 890, y: 0 })).toBe(false);
  });

  it('mz: an OWNED zone over the flash point does NOT extend the halo (Story 4.3 — deliberate absence: a flare does not help you see a distant flash)', () => {
    const { w, a } = zoneWorld(); // a owns a zone at (900,0), far beyond the 495u halo
    const e: MuzzleEvent = { k: 'mz', x: 900, y: 0 }; // flash dead-center in a's own zone
    expect(signalFor('mz')!.visible(foggedCtx(w, a), e)).toBe(false); // no ownZoneCovers term, by ruling
  });

  it('blip: a zone-covered annulus ship fails the blip row even when swept (already a full contact)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0); // radar annulus, bearing 0
    a.prevSweepAngle = wrapPositive(-0.02);
    a.sweepAngle = wrapPositive(0.02); // beam crossing bearing 0 this tick
    const row = signalFor('blip')!;
    expect(row.visible(foggedCtx(w, a), b)).toBe(true); // sanity: paints without a zone
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 400, y: 0, r: CONFIG.starShells.litRadius, until: 999_999, mode: 'standard' });
    expect(row.visible(foggedCtx(w, a), b)).toBe(false); // contact tier now — never a blip
  });
});

// ---------- the public register (PV 23): the widened sunk row -----------------

describe('SIGNAL_REGISTRY — sunk: the public register (PV 23, 4th declared exception)', () => {
  const row = signalFor('sunk')!;

  /** A drone wreck teleported far outside every range, sunk by `by`. */
  function sinkDroneFar(w: World, by?: string): void {
    const d = w.addShip('d1', 'DRONE-01', true, 'droneSmall');
    d.state.x = 2000;
    d.state.y = 0;
    w.sinkShip('d1', by);
  }

  it('a HUMAN victim beyond sight is visible to ANY bystander (identity-only public)', () => {
    const w = bareWorld();
    const c = place(w, 'c', 0, 0);
    place(w, 'b', 2000, 0); // far outside sight AND radar
    w.sinkShip('b', 'a');
    expect(row.visible(foggedCtx(w, c), { k: 'sunk', id: 'b', by: 'a' })).toBe(true);
  });

  it('a DRONE victim beyond sight stays INVISIBLE to a bystander (not a combatant)', () => {
    const w = bareWorld();
    const c = place(w, 'c', 0, 0);
    sinkDroneFar(w, 'a');
    expect(row.visible(foggedCtx(w, c), { k: 'sunk', id: 'd1', by: 'a' })).toBe(false);
  });

  it('...but the SAME drone sinking IS visible to its credited killer (amendment 17 principle)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    sinkDroneFar(w, 'a');
    expect(row.visible(foggedCtx(w, a), { k: 'sunk', id: 'd1', by: 'a' })).toBe(true);
  });

  it('a missing wreck record fails closed for a bystander (not visible, never a seen)', () => {
    const w = bareWorld();
    const c = place(w, 'c', 0, 0);
    expect(row.visible(foggedCtx(w, c), { k: 'sunk', id: 'ghost', by: 'a' })).toBe(false);
  });

  it('materialize pins the WITNESSED key order: [k,id,by,seen]', () => {
    const w = bareWorld();
    const c = place(w, 'c', 0, 0);
    place(w, 'b', 100, 0); // wreck inside c's sight
    w.sinkShip('b', 'a');
    const ctx = foggedCtx(w, c);
    const wire = row.materialize(ctx, { k: 'sunk', id: 'b', by: 'a' }) as SunkEvent;
    expect(Object.keys(wire)).toEqual(['k', 'id', 'by', 'seen']);
    expect(wire).toEqual({ k: 'sunk', id: 'b', by: 'a', seen: true });
  });

  it('materialize pins the witnessed NO-KILLER shape: [k,id,seen] — `by: undefined` leaves the wire', () => {
    const w = bareWorld();
    const c = place(w, 'c', 0, 0);
    place(w, 'b', 100, 0);
    w.sinkShip('b'); // storm death — the world's tick event carries by: undefined
    const ctx = foggedCtx(w, c);
    const wire = row.materialize(ctx, { k: 'sunk', id: 'b', by: undefined } as SunkEvent) as SunkEvent;
    expect(Object.keys(wire)).toEqual(['k', 'id', 'seen']);
    expect('by' in wire).toBe(false); // msgpack encodes an undefined value — the key must be ABSENT
  });

  it('materialize pins the UNWITNESSED shapes: [k,id,by] and [k,id] — no seen key of any kind', () => {
    const w = bareWorld();
    const c = place(w, 'c', 0, 0);
    place(w, 'b', 2000, 0); // far beyond c's sight — public delivery, unseen
    w.sinkShip('b', 'a');
    const ctx = foggedCtx(w, c);
    const withKiller = row.materialize(ctx, { k: 'sunk', id: 'b', by: 'a' }) as SunkEvent;
    expect(Object.keys(withKiller)).toEqual(['k', 'id', 'by']);
    expect('seen' in withKiller).toBe(false);
    const noKiller = row.materialize(ctx, { k: 'sunk', id: 'b' }) as SunkEvent;
    expect(Object.keys(noKiller)).toEqual(['k', 'id']);
    expect('seen' in noKiller).toBe(false);
  });

  it('materialize builds a FRESH object and a SPECTATOR always gets seen: true', () => {
    const w = bareWorld();
    place(w, 'b', 2000, 0);
    w.sinkShip('b', 'a');
    const ctx = specCtx(w);
    const e: SunkEvent = { k: 'sunk', id: 'b', by: 'a' };
    expect(row.visible(ctx, e)).toBe(true);
    const wire = row.materialize(ctx, e) as SunkEvent;
    expect(wire).not.toBe(e); // never the subject verbatim — the burst-row discipline
    expect(Object.keys(wire)).toEqual(['k', 'id', 'by', 'seen']);
    expect(wire.seen).toBe(true);
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
  // signalFor is the WORLD-EVENT dispatcher: it resolves ONLY the 16 GameEvent
  // kinds. The four contact/mine/litzone/decoy pseudo-rows are unreachable from
  // it (a fabricated k:'mine'/'litzone'/'decoy' world event can never
  // materialize), and inherited prototype keys resolve to nothing (Object.hasOwn).
  const EVENT_KINDS = ['blip', 'shell', 'torp', 'torpU', 'boom', 'burst', 'sunk', 'spawn', 'dmg', 'pt', 'bn', 'sp', 'hc', 'mz', 'heal', 'sm'];

  it('signalFor returns undefined for an unknown kind', () => {
    expect(signalFor('nonexistent')).toBeUndefined();
    expect(signalFor('')).toBeUndefined();
    expect(signalFor('CONTACT')).toBeUndefined(); // case-sensitive, not fuzzy
  });

  it('signalFor resolves exactly the 16 event kinds to their registry rows', () => {
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
