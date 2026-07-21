// THE ANTI-CHEAT INVARIANT (the plan's marquee test), property-style, plus
// directed boundary/LOS/paint-window cases. The property: for every observer,
// in every frame, every contact and every event references ONLY what that
// observer's sight bubble ∪ this-tick radar paints (plus the self-directed
// events: own dmg/sunk/spawn, own shells). The checks below are a deliberate
// test-local reimplementation of the visibility predicates so a refactor of
// perception.ts cannot silently agree with its own bug.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  UPGRADE_IDS,
  bearing,
  effectiveStats,
  mulberry32,
  segCircleHit,
  wrapPositive,
  type BallisticEvent,
  type BlipEvent,
  type BoomEvent,
  type BurstEvent,
  type Circle,
  type GameEvent,
  type FrameMsg,
  type SpawnEvent,
  type SunkEvent,
  type UpgradeEvent,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
// Registry symbols are imported ONLY to ENUMERATE keys/rows for the completeness
// block below — never as a behavior oracle. Every visibility predicate in this
// file stays independently reimplemented (see the header), so a perception
// refactor cannot silently agree with its own bug via a row's own visible().
import { SIGNAL_REGISTRY } from '../game/signals.js';

const TAU = Math.PI * 2;
const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;
const DT = CONFIG.tick.simDtMs;
const SWEEP_DELTA = (TAU * DT) / CONFIG.vision.sweepPeriod;
const TICKS_PER_REV = Math.round(CONFIG.vision.sweepPeriod / DT);

// ---------- test-local visibility reimplementation --------------------------

function clearLos(a: { x: number; y: number }, b: { x: number; y: number }, islands: readonly Circle[]): boolean {
  return islands.every((isle) => segCircleHit(a, b, isle, isle.r) === null);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Per-observer EFFECTIVE ranges, recomputed here from the raw upgrade counts
// (deliberately NOT via me.stats / effectiveStats — the reimplementation rule).
function effSight(me: ShipRecord): number {
  return SIGHT * CONFIG.upgrades.sightRange.mult ** me.upgrades[UPGRADE_IDS.indexOf('sightRange')];
}

function effRadar(me: ShipRecord): number {
  return RADAR * CONFIG.upgrades.radarRange.mult ** me.upgrades[UPGRADE_IDS.indexOf('radarRange')];
}

function sighted(w: World, me: ShipRecord, p: { x: number; y: number }): boolean {
  return dist(me.state, p) <= effSight(me) && clearLos(me.state, p, w.map.islands);
}

function inPaintWindow(me: ShipRecord, brg: number): boolean {
  const window = wrapPositive(me.sweepAngle - me.prevSweepAngle);
  return wrapPositive(brg - me.prevSweepAngle) < window;
}

// ---------- world construction helpers ---------------------------------------

/** World whose islands are cleared for exact-geometry directed cases. */
function bareWorld(seed = 1): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship and teleport it to an exact pose (speed 0). */
function place(w: World, id: string, x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase());
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

/** Open the observer's paint window around a bearing (without stepping). */
function windowAround(me: ShipRecord, brg: number, halfWidth = 0.02): void {
  me.prevSweepAngle = wrapPositive(brg - halfWidth);
  me.sweepAngle = wrapPositive(brg + halfWidth);
}

function injectShell(
  w: World,
  id: string,
  ownerId: string,
  x: number,
  y: number,
  dir: number,
  distLeft: number,
  targeted = false,
): void {
  w.shells.set(id, {
    id,
    ownerId,
    x,
    y,
    vx: Math.cos(dir) * CONFIG.gun.shellSpeed,
    vy: Math.sin(dir) * CONFIG.gun.shellSpeed,
    distLeft,
    bornAt: w.now,
    kind: 'shell',
    damage: CONFIG.gun.damage,
    hitRadius: CONFIG.gun.shellRadius,
    // `targeted` mirrors the real gun: a burst point distLeft along the
    // bearing, so the invariant worlds exercise burst events too. Untargeted
    // is the contact-only legacy shape.
    targetX: targeted ? x + Math.cos(dir) * distLeft : null,
    targetY: targeted ? y + Math.sin(dir) * distLeft : null,
    burstRadius: targeted ? CONFIG.gun.burstRadius : 0,
    contactDamage: targeted ? CONFIG.gun.contactDamage : CONFIG.gun.damage,
  });
}

/** Drop a mine directly into world state (armed by default). */
function injectMine(w: World, id: string, ownerId: string, x: number, y: number, armedAt = 0): void {
  w.mines.set(id, { id, ownerId, x, y, armedAt });
}

/** Push a raw world-emitted event onto the world's tick-event list — the exact
 *  buffer perception.forwardedEvents() dispatches, reached the same way the
 *  world's own step does (the field is private only to production callers). */
function emitWorldEvent(w: World, e: GameEvent): void {
  (w as unknown as { events: GameEvent[] }).events.push(e);
}

const blipsOf = (f: FrameMsg) => f.events.filter((e): e is BlipEvent => e.k === 'blip');
const shellsOf = (f: FrameMsg) => f.events.filter((e): e is BallisticEvent => e.k === 'shell');
const boomsOf = (f: FrameMsg) => f.events.filter((e): e is BoomEvent => e.k === 'boom');

/**
 * Structural anti-cheat guard: a ballistic event may carry ONLY these keys. Any
 * extra field (a returning `ttl`/`distLeft`, or a launch position tag) is
 * range-derivable and would let a modified client solve back to the fogged
 * muzzle — so its mere PRESENCE fails the test. See BallisticEvent's note.
 */
const BALLISTIC_KEYS = ['id', 'k', 't', 'vx', 'vy', 'x', 'y'];
function assertBallisticShape(e: BallisticEvent): void {
  expect(Object.keys(e).sort()).toEqual(BALLISTIC_KEYS);
}

// ---------- directed cases: sight tier ---------------------------------------

describe('perception — sight tier boundaries (exact)', () => {
  it('a ship at exactly sight range is a contact (boundary inclusive)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', SIGHT, 0, 1.5);
    const f = buildFrame(w, 'a');
    expect(f.contacts).toEqual([
      { id: 'b', x: b.state.x, y: b.state.y, heading: 1.5, speed: 0, cls: 'torpedoBoat' },
    ]);
  });

  it('a ship just outside sight range is invisible', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', SIGHT + 0.01, 0);
    expect(buildFrame(w, 'a').contacts).toEqual([]);
  });

  it('a ship inside sight but behind an island is invisible (LOS rule)', () => {
    const w = bareWorld();
    w.map.islands.push({ x: 75, y: 0, r: 30 });
    place(w, 'a', 0, 0);
    place(w, 'b', 150, 0);
    expect(buildFrame(w, 'a').contacts).toEqual([]);
    // ...and stepping aside restores the contact.
    w.ships.get('b')!.state.y = 120;
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
  });

  it('dead ships are never contacts; a viewer with no ship sees nothing', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    w.sinkShip('b');
    expect(buildFrame(w, 'a').contacts).toEqual([]);
    const watcher = buildFrame(w, 'watcher');
    expect(watcher.contacts).toEqual([]);
    expect(watcher.events).toEqual([]);
  });
});

// ---------- directed cases: radar tier ---------------------------------------

describe('perception — radar paint window (exact)', () => {
  it('paints a ship in the annulus when the beam crosses its bearing', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0);
    windowAround(a, 0);
    const blips = blipsOf(buildFrame(w, 'a'));
    expect(blips).toEqual([{ k: 'blip', id: 'b', x: b.state.x, y: b.state.y, t: w.now }]);
  });

  it('does not paint outside the beam window', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 400, 0); // bearing 0
    windowAround(a, Math.PI); // beam on the far side
    expect(blipsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('radar boundary is exact: paints at dist == radar, not just beyond', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', RADAR, 0);
    windowAround(a, 0);
    expect(blipsOf(buildFrame(w, 'a')).map((e) => e.id)).toEqual(['b']);
    w.ships.get('b')!.state.x = RADAR + 0.01;
    windowAround(a, 0);
    expect(blipsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('inside sight there is no paint (sighted, not blipped) — even when swept', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', SIGHT, 0); // exactly at sight => sighted
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    expect(f.contacts.map((c) => c.id)).toEqual(['b']);
    expect(blipsOf(f)).toEqual([]);
  });

  it('an island blocks radar exactly like sight', () => {
    const w = bareWorld();
    w.map.islands.push({ x: 200, y: 0, r: 40 });
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 400, 0);
    windowAround(a, 0);
    expect(blipsOf(buildFrame(w, 'a'))).toEqual([]);
  });
});

describe('perception — exactly once per revolution (incl. 2π wrap)', () => {
  it('each target paints exactly once per revolution, wrap tick included', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    // Mid-window bearings (δ/2 margin from window seams) so FP accumulation
    // over 160 wrapPositive additions cannot shift a paint across a seam.
    const firstBrg = SWEEP_DELTA / 2; // painted by the first window [0, δ)
    place(w, 'b', 400 * Math.cos(firstBrg), 400 * Math.sin(firstBrg));
    const wrapBrg = -SWEEP_DELTA / 2; // painted by the wrap window [2π−δ, 2π)
    place(w, 'c', 400 * Math.cos(wrapBrg), 400 * Math.sin(wrapBrg));

    const paints = new Map<string, number[]>([['b', []], ['c', []]]);
    let expectedSweep = 0;
    for (let tick = 1; tick <= 2 * TICKS_PER_REV; tick++) {
      w.step();
      expectedSweep = wrapPositive(expectedSweep + SWEEP_DELTA);
      const f = buildFrame(w, 'a');
      // OwnShip.sweep is the post-advance angle == this tick's window end
      // (identical accumulation => exact equality expected).
      expect(f.you!.sweep).toBe(expectedSweep);
      for (const e of blipsOf(f)) paints.get(e.id)!.push(tick);
    }
    expect(paints.get('b')).toEqual([1, 1 + TICKS_PER_REV]);
    expect(paints.get('c')).toEqual([TICKS_PER_REV, 2 * TICKS_PER_REV]);
  });
});

// ---------- directed cases: event visibility ---------------------------------

describe('perception — shell events (per-observer, exactly once)', () => {
  it('the owner always gets its shell event, even far away; others do not', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    injectShell(w, 's1', 'a', 600, 600, 0, 300);
    const fa = buildFrame(w, 'a');
    expect(shellsOf(fa).map((e) => e.id)).toEqual(['s1']);
    expect(shellsOf(buildFrame(w, 'b'))).toEqual([]);
    // exactly once: the owner is not re-sent the same shell.
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('a shell first entering sight arrives with CURRENT params, once', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 600, 0);
    injectShell(w, 's1', 'b', 500, 0, Math.PI, 480); // flying toward a, out of sight
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]);
    // Advance the sim until the shell crosses into a's sight bubble.
    let ev = null;
    for (let i = 0; i < 100 && !ev; i++) {
      w.step();
      ev = shellsOf(buildFrame(w, 'a'))[0] ?? null;
    }
    expect(ev).not.toBeNull();
    const sh = w.shells.get('s1')!;
    expect(ev!.x).toBe(sh.x); // current position, NOT the hidden launch point
    expect(Math.hypot(ev!.x, ev!.y)).toBeLessThanOrEqual(SIGHT);
    expect(ev!.t).toBe(w.now);
    assertBallisticShape(ev!); // no range-derivable field (no ttl) leaks the muzzle
    w.step();
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]); // never re-sent
  });

  it('a shell behind an island is not visible', () => {
    const w = bareWorld();
    w.map.islands.push({ x: 100, y: 0, r: 40 });
    place(w, 'a', 0, 0);
    place(w, 'b', 600, 0);
    injectShell(w, 's1', 'b', 200, 0, Math.PI / 2, 10); // in range but behind the rock
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('a shell event carries ONLY {k,id,x,y,vx,vy,t} — no range-derivable field', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 's1', 'a', 10, 0, 0, 300);
    const ev = shellsOf(buildFrame(w, 'a'))[0];
    expect(ev).toBeDefined();
    assertBallisticShape(ev); // fails if `ttl`/`distLeft`/anything extra returns
  });
});

// ---------- fail-closed shape guards (Wave B) --------------------------------

describe('perception — world-emitted ballistics never forward (fail-closed)', () => {
  // A ballistic reveal is re-issued PER OBSERVER by the scan over live
  // world.shells (records that carry ownerId). A raw BallisticEvent riding the
  // tickEvents forwarding path has the WIRE shape (no ownerId), so the ballistic
  // row's shape guard (`'ownerId' in shell`) must drop it — otherwise a client
  // could be fed a projectile the scan never legitimately revealed to it.
  for (const kind of ['shell', 'torp'] as const) {
    it(`a world-emitted ${kind} GameEvent (no ownerId) reaches no frame — fogged or spectator`, () => {
      const w = bareWorld();
      place(w, 'a', 0, 0); // observer sitting ON the event's location (max exposure)
      emitWorldEvent(w, { k: kind, id: 'ghost', x: 0, y: 0, vx: 1, vy: 0, t: w.now });
      // Fogged path: dropped even point-blank on the observer.
      expect(buildFrame(w, 'a').events.filter((e) => e.k === kind)).toEqual([]);
      // Unfogged spectator path (finished phase): also dropped — the shape guard
      // fires before the mode check, so fog relaxation cannot resurrect it.
      expect(buildFrame(w, 'a', 'finished').events.filter((e) => e.k === kind)).toEqual([]);
    });
  }
});

describe('perception — boom / dmg / sunk / spawn visibility', () => {
  it('an out-of-sight boom is hidden from everyone but the struck ship', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0);
    b.hp = 15; // next hit sinks
    // a's shell, one tick from striking b — b is far outside a's sight.
    injectShell(w, 's1', 'a', 380, 0, 0, 100);
    w.step();
    const fa = buildFrame(w, 'a');
    const fb = buildFrame(w, 'b');
    // b (victim) sees the boom, its dmg, and its own sinking.
    expect(fb.events.filter((e) => e.k === 'boom')).toHaveLength(1);
    expect(fb.events.filter((e) => e.k === 'dmg')).toEqual([
      { k: 'dmg', id: 'b', amount: CONFIG.gun.damage, hp: 0 },
    ]);
    expect(fb.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a' }]);
    // a (owner, out of sight) gets NONE of it — no hit confirmation leak.
    expect(fa.events.filter((e) => e.k === 'boom')).toEqual([]);
    expect(fa.events.filter((e) => e.k === 'dmg')).toEqual([]);
    expect(fa.events.filter((e) => e.k === 'sunk')).toEqual([]);
  });

  it('a boom within sight is visible; a sinking within sight is visible', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', 150, 0);
    b.hp = 15;
    place(w, 'c', 0, 800); // far-away third party sees none of it
    injectShell(w, 's1', 'a', 130, 0, 0, 100); // a's shell, point-blank on b
    w.step();
    const fa = buildFrame(w, 'a');
    expect(fa.events.filter((e) => e.k === 'boom')).toHaveLength(1);
    expect(fa.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a' }]);
    // dmg stays victim-private even when the boom is visible.
    expect(fa.events.filter((e) => e.k === 'dmg')).toEqual([]);
    const fc = buildFrame(w, 'c');
    expect(fc.events.filter((e) => e.k === 'boom' || e.k === 'sunk')).toEqual([]);
  });

  it('a boom whose victim center is out of sight arrives WITHOUT hit (straddle)', () => {
    // b's center sits just OUTSIDE a's sight; its hull reaches INSIDE, so a's
    // shell strikes at a point a can see. a must get the boom (impact sighted)
    // but never the victim's id (center fogged) — reviewer finding 2.
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', SIGHT + 12, 0, 0); // center 232u, hull axis along x
    b.hp = 100; // survives, so it straddles as a live (but unsighted) hull
    injectShell(w, 's1', 'a', 205, 0, 0, 40); // a's shell closing on b's near hull edge
    let boomB: BoomEvent | undefined;
    for (let i = 0; i < 20 && !boomB; i++) {
      w.step();
      boomB = boomsOf(buildFrame(w, 'b')).find((e) => e.id === 's1');
    }
    // The straddle actually happened: impact point inside a's sight, center outside.
    expect(boomB).toBeDefined();
    expect(dist({ x: 0, y: 0 }, boomB!)).toBeLessThanOrEqual(SIGHT);
    expect(dist({ x: 0, y: 0 }, b.state)).toBeGreaterThan(SIGHT);
    // Victim sees its own hit; the far owner sees the impact but NOT the id.
    expect(boomB!.hit).toBe('b');
    const boomA = boomsOf(buildFrame(w, 'a')).find((e) => e.id === 's1');
    expect(boomA).toBeDefined();
    expect(boomA!.hit).toBeUndefined();
    expect('hit' in boomA!).toBe(false); // stripped, not just undefined
    // a is not otherwise leaking b: b never appears as a contact.
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).not.toContain('b');
  });

  it('spawns are visible to the spawner and to observers who can see the point', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    w.step(); // flush a's own join spawn
    const c = w.addShip('c', 'CHARLIE'); // ring spawn, far from a
    w.step();
    const fa = buildFrame(w, 'a');
    expect(fa.events.filter((e) => e.k === 'spawn')).toEqual([]);
    const fc = buildFrame(w, 'c');
    expect(fc.events.filter((e) => e.k === 'spawn')).toEqual([
      { k: 'spawn', id: 'c', x: c.state.x, y: c.state.y },
    ]);
  });
});

// ---------- directed cases: mine visibility (contact-like) -------------------

describe('perception — burst visibility (owner always, else burst point sighted)', () => {
  /** Route an internal burst subject through the real pending-events choke,
   *  the way World.resolveBurst emits it (wire BurstEvent + internal `own`). */
  function emitBurst(w: World, id: string, own: string, x: number, y: number): void {
    interface Pendable { pending: GameEvent[] }
    (w as unknown as Pendable).pending.push({ k: 'burst', id, x, y, own } as GameEvent);
    w.step();
  }

  it('the OWNER gets its burst even far beyond sight (the point is its own click)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    emitBurst(w, 'b1', 'a', 600, 0); // 600u away — far outside a's 220u sight
    const bursts = buildFrame(w, 'a').events.filter((e) => e.k === 'burst');
    expect(bursts).toEqual([{ k: 'burst', id: 'b1', x: 600, y: 0 }]); // bare shape, no `own`
  });

  it('a non-owner outside sight of the burst point NEVER receives it (fogged)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'c', -900, 0); // 1500u from the burst point
    emitBurst(w, 'b1', 'a', 600, 0);
    expect(buildFrame(w, 'c').events.filter((e) => e.k === 'burst')).toEqual([]);
  });

  it('a non-owner WITH the burst point sighted receives the bare event', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'c', 580, 0); // 20u from the burst point — sighted
    emitBurst(w, 'b1', 'a', 600, 0);
    const bursts = buildFrame(w, 'c').events.filter((e) => e.k === 'burst');
    expect(bursts).toEqual([{ k: 'burst', id: 'b1', x: 600, y: 0 }]);
  });

  it('a non-owner behind an island never receives it (LOS rule)', () => {
    const w = bareWorld();
    w.map.islands.push({ x: 100, y: 0, r: 40 });
    place(w, 'c', 0, 0);
    emitBurst(w, 'b1', 'a', 200, 0); // inside sight range but behind the rock
    expect(buildFrame(w, 'c').events.filter((e) => e.k === 'burst')).toEqual([]);
  });

  it('END-TO-END: a real gun burst reaches the fogged owner as {k,id,x,y} only', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 600, slot: 0 };
    let burst: GameEvent | undefined;
    for (let i = 0; i < 120 && !burst; i++) {
      w.step();
      burst = buildFrame(w, 'a').events.find((e) => e.k === 'burst');
    }
    expect(burst).toBeDefined(); // owner-visible at 600u — nearly 3× sight range
    expect(Object.keys(burst!).sort()).toEqual(['id', 'k', 'x', 'y']); // no own/radius/range field
    expect((burst as BurstEvent).x).toBeCloseTo(600, 4); // bursts AT the clicked point
  });
});

describe('perception — mine visibility (owner-always, else sight+LOS, never radar)', () => {
  it('the owner sees all its own mines everywhere; the enemy never radar-paints them', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 0, 0); // b co-located briefly; we only read its frame's mines
    injectMine(w, 'm1', 'a', 900, 900); // owner's mine, far outside any range
    const fa = buildFrame(w, 'a');
    expect(fa.mines).toEqual([{ id: 'm1', x: 900, y: 900, own: true }]);
    // b sits at the origin — the mine is 1273u away, far beyond radar(650).
    expect(buildFrame(w, 'b').mines).toEqual([]);
  });

  it('an enemy mine is visible inside sight, invisible just outside it', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', SIGHT, 0); // exactly at sight — inclusive
    expect(buildFrame(w, 'a').mines).toEqual([{ id: 'm1', x: SIGHT, y: 0, own: false }]);
    w.mines.clear();
    injectMine(w, 'm2', 'b', SIGHT + 0.01, 0); // a hair beyond sight
    expect(buildFrame(w, 'a').mines).toEqual([]);
  });

  it('an enemy mine behind an island is invisible (LOS rule)', () => {
    const w = bareWorld();
    w.map.islands.push({ x: 60, y: 0, r: 25 });
    place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', 120, 0); // inside sight range but behind the rock
    expect(buildFrame(w, 'a').mines).toEqual([]);
  });

  it('arm state makes no difference to visibility', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectMine(w, 'armed', 'b', 100, 0, 0);
    injectMine(w, 'unarmed', 'b', 100, 20, w.now + CONFIG.mine.armDelay);
    expect(buildFrame(w, 'a').mines.map((m) => m.id).sort()).toEqual(['armed', 'unarmed']);
  });
});

// ---------- THE INVARIANT (property-style over random worlds) ----------------

/** Assert one frame leaks nothing beyond the observer's vision. */
function verifyFrame(w: World, viewerId: string, f: FrameMsg): void {
  const me = w.ships.get(viewerId)!;
  // Upgrade counts ride ONLY on the observer's own ship — never on a contact.
  if (f.you) expect(f.you.upg).toEqual(me.upgrades);
  for (const c of f.contacts) {
    const target = w.ships.get(c.id)!;
    expect(target).toBeDefined();
    expect(target.alive).toBe(true);
    expect(c.id).not.toBe(viewerId);
    expect('upg' in c).toBe(false); // enemy builds are hidden (anti-cheat)
    expect('stats' in c).toBe(false);
    expect(dist(me.state, target.state)).toBeLessThanOrEqual(effSight(me));
    expect(clearLos(me.state, target.state, w.map.islands)).toBe(true);
    expect({ x: c.x, y: c.y }).toEqual({ x: target.state.x, y: target.state.y });
  }
  for (const e of f.events) verifyEvent(w, me, e);
  for (const m of f.mines) verifyMine(w, me, m);
}

/** A mine may reach a frame only if the viewer owns it OR it is sighted. */
function verifyMine(w: World, me: ShipRecord, m: { id: string; own: boolean }): void {
  const mine = w.mines.get(m.id)!;
  expect(mine).toBeDefined();
  const own = mine.ownerId === me.id;
  expect(m.own).toBe(own);
  if (!own) expect(sighted(w, me, mine)).toBe(true); // never radar, never fogged
}

// ---------- per-kind event verifiers (the independent oracle) ----------------
//
// One test-local verifier per GameEvent kind — the deliberately reimplemented
// visibility oracle (NEVER a row's own visible()/materialize(), per the header).
// verifyEvent() dispatches through EVENT_VERIFIERS; a kind with no entry throws
// ("unexpected event kind leaked"). The completeness suite below pins this map's
// KEY SET to the registry's event-kind rows, so a future registry row without a
// verifier fails CI by construction (the story's marquee AC).

type EventVerifier = (w: World, me: ShipRecord, e: GameEvent) => void;

function verifyBlip(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as BlipEvent;
  const target = w.ships.get(ev.id)!;
  expect(target.alive).toBe(true);
  const d = dist(me.state, target.state);
  expect(d).toBeGreaterThan(effSight(me));
  expect(d).toBeLessThanOrEqual(effRadar(me));
  expect(clearLos(me.state, target.state, w.map.islands)).toBe(true);
  expect(inPaintWindow(me, bearing(me.state, target.state))).toBe(true);
  expect(ev.t).toBe(w.now);
}

// shell AND torp share one verifier: torpedoes ride the same first-sight
// ballistic reveal as shells (both live in world.shells, keyed by projectile id).
function verifyBallistic(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as BallisticEvent;
  const sh = w.shells.get(ev.id)!;
  expect(sh).toBeDefined();
  expect({ x: ev.x, y: ev.y }).toEqual({ x: sh.x, y: sh.y }); // current pos, never launch pos
  assertBallisticShape(ev); // no range-derivable field ever leaks
  if (sh.ownerId !== me.id) expect(sighted(w, me, ev)).toBe(true);
}

function verifyBoom(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as BoomEvent;
  if (ev.hit !== me.id) expect(sighted(w, me, ev)).toBe(true);
  // `hit` may name a victim only when that victim's CENTER is sighted (or the
  // observer is the victim) — a straddling hull must not leak its id.
  if (ev.hit !== undefined && ev.hit !== me.id) {
    expect(sighted(w, me, w.ships.get(ev.hit)!.state)).toBe(true);
  }
}

// A burst may reach an observer ONLY when it fired the shell (the point is its
// own click) or the burst point is sighted; and the wire shape is exactly
// {k,id,x,y} — the server-internal owner field (and any radius/range field)
// must never ride it. The owner is recovered INDEPENDENTLY from the world's
// internal tick-event buffer (where `own` legitimately lives), never from the
// registry row.
function verifyBurst(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as BurstEvent;
  expect(Object.keys(ev).sort()).toEqual(['id', 'k', 'x', 'y']);
  const src = w.tickEvents.find((t) => t.k === 'burst' && t.id === ev.id) as
    | (BurstEvent & { own?: string })
    | undefined;
  expect(src).toBeDefined();
  if (src!.own !== me.id) expect(sighted(w, me, ev)).toBe(true);
}

function verifySunk(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as SunkEvent;
  if (ev.id === me.id) return;
  const wreck = w.ships.get(ev.id)!;
  expect(wreck).toBeDefined();
  expect(sighted(w, me, wreck.state)).toBe(true);
}

const EVENT_VERIFIERS: Record<string, EventVerifier> = {
  blip: verifyBlip,
  shell: verifyBallistic,
  torp: verifyBallistic,
  boom: verifyBoom,
  burst: verifyBurst,
  sunk: verifySunk,
  // Self-private kinds: each may only ever reach the ship its `id` names.
  dmg: (_w, me, e) => expect(e.id).toBe(me.id), // victim-private
  pt: (_w, me, e) => expect(e.id).toBe(me.id), // earner-private
  heal: (_w, me, e) => expect(e.id).toBe(me.id), // healed-ship-private
  upg: (_w, me, e) => {
    // Self-private, and a valid upgrade id (never a fabricated type).
    expect(e.id).toBe(me.id);
    expect(UPGRADE_IDS).toContain((e as UpgradeEvent).type);
  },
  spawn: (w, me, e) => {
    if (e.id !== me.id) expect(sighted(w, me, e as SpawnEvent)).toBe(true);
  },
};

function verifyEvent(w: World, me: ShipRecord, e: GameEvent): void {
  // OWN-property lookup: a leaked inherited key like 'constructor' must throw
  // "unexpected event kind leaked", never resolve an inherited Function off the
  // map's prototype. No verifier == no registry row we recognize: fail-closed,
  // exactly as the old `default: throw` did. Two ways this fires as a HARD
  // failure: a kind with no registry row at all, and — because the completeness
  // suite keeps this map and the registry in lockstep — a kind whose row exists
  // but lacks a verifier.
  if (!Object.hasOwn(EVENT_VERIFIERS, e.k)) {
    throw new Error(`unexpected event kind leaked into a frame: ${(e as GameEvent).k}`);
  }
  EVENT_VERIFIERS[e.k](w, me, e);
}

describe('perception — THE INVARIANT (random worlds, seeded)', () => {
  it('no frame ever references anything outside sight ∪ this-tick paints', () => {
    const rng = mulberry32(0x5eed_f0f0);
    for (let world = 0; world < 20; world++) {
      const w = new World(rng.int(0, 2 ** 31 - 1));
      const ids: string[] = [];
      const shipCount = rng.int(3, 6);
      for (let i = 0; i < shipCount; i++) {
        const id = `p${i}`;
        ids.push(id);
        const ang = rng.float(0, TAU);
        const r = rng.float(0, w.map.radius * 0.85);
        const rec = place(w, id, Math.cos(ang) * r, Math.sin(ang) * r, rng.float(0, TAU));
        rec.sweepAngle = rng.float(0, TAU); // decorrelate paint windows
        // Random vision upgrades so the invariant is exercised at WIDENED
        // per-observer radii too. Counts are set directly and the world-side
        // cache recomputed the way World does (effectiveStats); the CHECKS
        // recompute ranges independently from the raw counts (effSight/effRadar).
        rec.upgrades[UPGRADE_IDS.indexOf('sightRange')] = rng.int(0, 2);
        rec.upgrades[UPGRADE_IDS.indexOf('radarRange')] = rng.int(0, 2);
        rec.upgrades[UPGRADE_IDS.indexOf('sweepSpeed')] = rng.int(0, 2);
        rec.stats = effectiveStats(rec.cls, rec.upgrades);
      }
      for (let s = 0; s < rng.int(0, 5); s++) {
        const ang = rng.float(0, TAU);
        const r = rng.float(0, w.map.radius * 0.9);
        injectShell(
          w,
          `inj${s}`,
          ids[rng.int(0, ids.length - 1)],
          Math.cos(ang) * r,
          Math.sin(ang) * r,
          rng.float(0, TAU),
          rng.float(20, CONFIG.vision.radar), // gun range base = radar range (shellRange retired)
          rng.float(0, 1) < 0.5, // half the shells are targeted bursters (real gun shape)
        );
      }
      for (let s = 0; s < rng.int(0, 4); s++) {
        const ang = rng.float(0, TAU);
        const r = rng.float(0, w.map.radius * 0.9);
        injectMine(w, `mine${s}`, ids[rng.int(0, ids.length - 1)], Math.cos(ang) * r, Math.sin(ang) * r);
      }
      for (let tick = 1; tick <= 6; tick++) {
        for (const id of ids) {
          w.submitInput(id, {
            seq: tick,
            throttle: rng.float(-1, 1),
            rudder: rng.float(-1, 1),
            aim: rng.float(-Math.PI, Math.PI),
            fireSeq: rng.float(0, 1) < 0.4 ? tick : 0, // ~40% of ticks land a fresh click
            aimDist: rng.float(0, 900),
            slot: 0,
          });
        }
        w.step();
        // Build each observer's frame exactly once per tick (wire semantics).
        for (const id of ids) verifyFrame(w, id, buildFrame(w, id));
      }
    }
  });
});

// ---------- SIGNAL REGISTRY completeness (CI-by-construction) -----------------
//
// These assertions make "a signal without a passing invariant case fails CI by
// construction" a structural property, not a discipline. SIGNAL_REGISTRY is
// enumerated here ONLY to compare key sets — never called as a visibility
// oracle (the reimplemented predicates above stay the sole oracle). A future
// dev adding a 13th row sees this block fail until they add its verifier.

describe('perception — SIGNAL REGISTRY completeness', () => {
  // The two contact-like pseudo-rows are verified through the contacts/mines
  // frame channels (verifyFrame/verifyMine), not through EVENT_VERIFIERS.
  const CONTACT_LIKE = ['contact', 'mine'];
  // The 11 GameEvent kinds — each MUST have an EVENT_VERIFIERS entry.
  const EVENT_KINDS = ['blip', 'shell', 'torp', 'boom', 'burst', 'sunk', 'spawn', 'dmg', 'upg', 'pt', 'heal'];
  const EXPECTED_KEYS = [...CONTACT_LIKE, ...EVENT_KINDS];

  it('has exactly the 13 expected channel keys (11 event kinds + contact + mine)', () => {
    expect(Object.keys(SIGNAL_REGISTRY).sort()).toEqual([...EXPECTED_KEYS].sort());
    expect(Object.keys(SIGNAL_REGISTRY)).toHaveLength(13);
  });

  it('every row keys itself: row.eventType === its registry key', () => {
    for (const [key, row] of Object.entries(SIGNAL_REGISTRY)) {
      expect(row.eventType).toBe(key);
    }
  });

  it('the two contact-like pseudo-rows exist (verified via the contacts/mines channels)', () => {
    expect(SIGNAL_REGISTRY.contact).toBeDefined();
    expect(SIGNAL_REGISTRY.mine).toBeDefined();
  });

  it('every event-kind row has a test-local verifier — a row without one FAILS HERE', () => {
    const rowEventKinds = Object.keys(SIGNAL_REGISTRY).filter((k) => !CONTACT_LIKE.includes(k));
    // Key-set equality both ways: a registry row lacking a verifier AND a stray
    // verifier with no row are each a hard failure. THIS is the CI-by-construction
    // gate — a new 13th event row turns this red until its verifier lands.
    expect(Object.keys(EVENT_VERIFIERS).sort()).toEqual(rowEventKinds.sort());
  });

  it('the registry AND every row are frozen (rows are added at authoring time only)', () => {
    expect(Object.isFrozen(SIGNAL_REGISTRY)).toBe(true);
    for (const row of Object.values(SIGNAL_REGISTRY)) {
      expect(Object.isFrozen(row)).toBe(true);
    }
  });
});
