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
  bearing,
  mulberry32,
  segCircleHit,
  wrapPositive,
  type BallisticEvent,
  type BlipEvent,
  type BoomEvent,
  type Circle,
  type GameEvent,
  type FrameMsg,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

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

function sighted(w: World, me: ShipRecord, p: { x: number; y: number }): boolean {
  return dist(me.state, p) <= SIGHT && clearLos(me.state, p, w.map.islands);
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
  });
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
      { id: 'b', x: b.state.x, y: b.state.y, heading: 1.5, speed: 0 },
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

// ---------- THE INVARIANT (property-style over random worlds) ----------------

/** Assert one frame leaks nothing beyond the observer's vision. */
function verifyFrame(w: World, viewerId: string, f: FrameMsg): void {
  const me = w.ships.get(viewerId)!;
  for (const c of f.contacts) {
    const target = w.ships.get(c.id)!;
    expect(target).toBeDefined();
    expect(target.alive).toBe(true);
    expect(c.id).not.toBe(viewerId);
    expect(dist(me.state, target.state)).toBeLessThanOrEqual(SIGHT);
    expect(clearLos(me.state, target.state, w.map.islands)).toBe(true);
    expect({ x: c.x, y: c.y }).toEqual({ x: target.state.x, y: target.state.y });
  }
  for (const e of f.events) verifyEvent(w, me, e);
}

function verifyEvent(w: World, me: ShipRecord, e: GameEvent): void {
  switch (e.k) {
    case 'blip': {
      const target = w.ships.get(e.id)!;
      expect(target.alive).toBe(true);
      const d = dist(me.state, target.state);
      expect(d).toBeGreaterThan(SIGHT);
      expect(d).toBeLessThanOrEqual(RADAR);
      expect(clearLos(me.state, target.state, w.map.islands)).toBe(true);
      expect(inPaintWindow(me, bearing(me.state, target.state))).toBe(true);
      expect(e.t).toBe(w.now);
      return;
    }
    case 'shell': {
      const sh = w.shells.get(e.id)!;
      expect(sh).toBeDefined();
      expect({ x: e.x, y: e.y }).toEqual({ x: sh.x, y: sh.y }); // current pos, never launch pos
      assertBallisticShape(e); // no range-derivable field ever leaks
      if (sh.ownerId !== me.id) expect(sighted(w, me, e)).toBe(true);
      return;
    }
    case 'boom':
      if (e.hit !== me.id) expect(sighted(w, me, e)).toBe(true);
      // `hit` may name a victim only when that victim's CENTER is sighted (or
      // the observer is the victim) — a straddling hull must not leak its id.
      if (e.hit !== undefined && e.hit !== me.id) {
        expect(sighted(w, me, w.ships.get(e.hit)!.state)).toBe(true);
      }
      return;
    case 'dmg':
      expect(e.id).toBe(me.id);
      return;
    case 'sunk': {
      if (e.id === me.id) return;
      const wreck = w.ships.get(e.id)!;
      expect(wreck).toBeDefined();
      expect(sighted(w, me, wreck.state)).toBe(true);
      return;
    }
    case 'spawn':
      if (e.id !== me.id) expect(sighted(w, me, e)).toBe(true);
      return;
    default:
      throw new Error(`unexpected event kind leaked into a frame: ${(e as GameEvent).k}`);
  }
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
          rng.float(20, CONFIG.gun.shellRange),
        );
      }
      for (let tick = 1; tick <= 6; tick++) {
        for (const id of ids) {
          w.submitInput(id, {
            seq: tick,
            throttle: rng.float(-1, 1),
            rudder: rng.float(-1, 1),
            aim: rng.float(-Math.PI, Math.PI),
            fire: rng.float(0, 1) < 0.4,
            weapon: 0,
          });
        }
        w.step();
        // Build each observer's frame exactly once per tick (wire semantics).
        for (const id of ids) verifyFrame(w, id, buildFrame(w, id));
      }
    }
  });
});
