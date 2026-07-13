// Spectator frames (step 14) — the perception/anti-cheat boundary extension.
// Directed cases pin the spec-frame contract (spec: true, you omitted, ALL
// alive ships unfogged, ALL mines with own flags, this tick's events
// unfiltered, exactly-once ballistic adoption); the property test extends THE
// INVARIANT: over random worlds with randomly-killed ships, spec frames go
// ONLY to dead-in-active or finished-phase observers, and every alive
// observer's frame still obeys the fogged rules airtight. The fogged checks
// are a deliberate test-local reimplementation (a perception.ts refactor must
// not be able to agree with its own bug).

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  bearing,
  mulberry32,
  segCircleHit,
  wrapPositive,
  type Circle,
  type FrameMsg,
  type GameEvent,
  type MatchPhase,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const TAU = Math.PI * 2;
const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;

// ---------- test-local visibility reimplementation ---------------------------

function clearLos(a: { x: number; y: number }, b: { x: number; y: number }, islands: readonly Circle[]): boolean {
  return islands.every((isle) => segCircleHit(a, b, isle, isle.r) === null);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function sighted(w: World, me: ShipRecord, p: { x: number; y: number }): boolean {
  return dist(me.state, p) <= SIGHT && clearLos(me.state, p, w.map.islands);
}

function bareWorld(seed = 1): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase());
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

function injectShell(w: World, id: string, ownerId: string, x: number, y: number): void {
  w.shells.set(id, {
    id,
    ownerId,
    x,
    y,
    vx: CONFIG.gun.shellSpeed,
    vy: 0,
    distLeft: 300,
    bornAt: w.now,
  });
}

// ---------- directed cases ----------------------------------------------------

describe('spectator frames — dead observer in the active phase', () => {
  function deadObserverWorld(): World {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 2 * SIGHT, 0); // far outside a fogged observer's sight
    // Inside the water disk (r=900) — projectiles outside it splash instantly —
    // but still far outside a fogged observer's sight bubble.
    place(w, 'c', -600, 400, 1.2);
    w.respawnEnabled = false; // active-phase policy
    w.sinkShip('a', 'b');
    w.step();
    return w;
  }

  it('sets spec, omits you, and carries EVERY alive ship as a live contact', () => {
    const w = deadObserverWorld();
    const f = buildFrame(w, 'a', 'active');
    expect(f.spec).toBe(true);
    expect(f.you).toBeUndefined();
    const ids = f.contacts.map((c) => c.id).sort();
    expect(ids).toEqual(['b', 'c']); // unfogged: both far beyond sight
    const c = w.ships.get('c')!;
    expect(f.contacts.find((x) => x.id === 'c')).toEqual({
      id: 'c',
      x: c.state.x,
      y: c.state.y,
      heading: c.state.heading,
      speed: c.state.speed,
    });
  });

  it('carries every mine, flagging only the observer-owned ones', () => {
    const w = deadObserverWorld();
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 800, y: 800, armedAt: 0 });
    w.mines.set('m2', { id: 'm2', ownerId: 'b', x: -800, y: -800, armedAt: 0 });
    const f = buildFrame(w, 'a', 'active');
    expect(f.mines.sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: 'm1', x: 800, y: 800, own: true },
      { id: 'm2', x: -800, y: -800, own: false },
    ]);
  });

  it("passes this tick's events unfiltered (even another ship's private dmg)", () => {
    // dmg is victim-private in fogged frames; a spectator hears it anyway,
    // even when the victim is far outside the wreck's old sight bubble.
    const w = deadObserverWorld();
    const c = w.ships.get('c')!;
    const before = c.hp;
    injectShell(w, 's2', 'b', c.state.x - 15, c.state.y); // b's shell, point blank on c
    let dmgSeen: GameEvent | undefined;
    for (let i = 0; i < 10 && !dmgSeen; i++) {
      w.step();
      dmgSeen = buildFrame(w, 'a', 'active').events.find((e) => e.k === 'dmg');
    }
    expect(dmgSeen).toEqual({
      k: 'dmg',
      id: 'c',
      amount: CONFIG.gun.damage,
      hp: before - CONFIG.gun.damage,
    });
  });

  it('adopts in-flight ballistics exactly once, with CURRENT params', () => {
    const w = deadObserverWorld();
    injectShell(w, 's1', 'b', 500, 300); // in-disk, launched before death, never sighted by a
    w.step();
    const sh = w.shells.get('s1')!;
    const f1 = buildFrame(w, 'a', 'active');
    const ev = f1.events.filter((e) => e.k === 'shell');
    expect(ev).toEqual([
      { k: 'shell', id: 's1', x: sh.x, y: sh.y, vx: sh.vx, vy: sh.vy, t: w.now },
    ]);
    // Exactly once: the next spec frame does not re-send it.
    const f2 = buildFrame(w, 'a', 'active');
    expect(f2.events.filter((e) => e.k === 'shell')).toEqual([]);
  });
});

describe('spectator frames — phase gating', () => {
  it('an ALIVE observer in active gets a fogged, non-spec frame', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 2 * SIGHT, 0);
    const f = buildFrame(w, 'a', 'active');
    expect(f.spec).toBeUndefined();
    expect(f.you).toBeDefined();
    expect(f.contacts).toEqual([]); // b is beyond sight — still fogged
  });

  it('finished phase: EVERYONE spectates, the alive winner included', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 400, 0);
    w.sinkShip('b', 'a');
    w.step();
    const winner = buildFrame(w, 'a', 'finished');
    expect(winner.spec).toBe(true);
    expect(winner.you).toBeUndefined();
    // The winner's own (alive) hull rides the contact pipeline now.
    expect(winner.contacts).toEqual([
      { id: 'a', x: a.state.x, y: a.state.y, heading: a.state.heading, speed: a.state.speed },
    ]);
    const loser = buildFrame(w, 'b', 'finished');
    expect(loser.spec).toBe(true);
    expect(loser.contacts.map((c) => c.id)).toEqual(['a']);
  });

  it('a dead observer in WAITING stays fogged (lobby keeps one code path)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 2 * SIGHT, 0);
    w.sinkShip('a');
    w.step();
    const f = buildFrame(w, 'a', 'waiting');
    expect(f.spec).toBeUndefined();
    expect(f.you).toBeDefined();
    expect(f.you!.alive).toBe(false);
    expect(f.contacts).toEqual([]); // b beyond sight: fog still applies
  });

  it('a viewer with no ship never gets a spec frame in active (fail-closed)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const f = buildFrame(w, 'ghost', 'active');
    expect(f.spec).toBeUndefined();
    expect(f.you).toBeUndefined();
    expect(f.contacts).toEqual([]);
    expect(f.events).toEqual([]);
  });
});

// ---------- THE INVARIANT, extended (property-style over random worlds) ------

/** Compact fogged-frame audit for an ALIVE observer (see perception.test.ts). */
function verifyFoggedFrame(w: World, me: ShipRecord, f: FrameMsg): void {
  expect(f.spec).toBeUndefined();
  expect(f.you).toBeDefined();
  for (const c of f.contacts) {
    const target = w.ships.get(c.id)!;
    expect(target.alive).toBe(true);
    expect(c.id).not.toBe(me.id);
    expect(sighted(w, me, target.state)).toBe(true);
  }
  for (const e of f.events) verifyFoggedEvent(w, me, e);
  for (const m of f.mines) {
    const mine = w.mines.get(m.id)!;
    if (mine.ownerId !== me.id) expect(sighted(w, me, mine)).toBe(true);
  }
}

function verifyFoggedEvent(w: World, me: ShipRecord, e: GameEvent): void {
  switch (e.k) {
    case 'blip': {
      const target = w.ships.get(e.id)!;
      const d = dist(me.state, target.state);
      expect(target.alive).toBe(true);
      expect(d).toBeGreaterThan(SIGHT);
      expect(d).toBeLessThanOrEqual(RADAR);
      expect(clearLos(me.state, target.state, w.map.islands)).toBe(true);
      return;
    }
    case 'shell':
    case 'torp': {
      const sh = w.shells.get(e.id)!;
      if (sh.ownerId !== me.id) expect(sighted(w, me, e)).toBe(true);
      return;
    }
    case 'boom':
      if (e.hit !== me.id) expect(sighted(w, me, e)).toBe(true);
      return;
    case 'dmg':
      expect(e.id).toBe(me.id);
      return;
    case 'sunk':
      if (e.id !== me.id) expect(sighted(w, me, w.ships.get(e.id)!.state)).toBe(true);
      return;
    case 'spawn':
      if (e.id !== me.id) expect(sighted(w, me, e)).toBe(true);
      return;
  }
}

describe('THE INVARIANT extension — spec frames only for the dead/finished', () => {
  it('random worlds, random deaths: alive observers NEVER get spec or unfogged data', () => {
    const rng = mulberry32(0xdead_5eed >>> 0);
    for (let world = 0; world < 15; world++) {
      const w = new World(rng.int(0, 2 ** 31 - 1));
      w.respawnEnabled = false; // active-phase policy: the dead stay dead
      const ids: string[] = [];
      const shipCount = rng.int(3, 6);
      for (let i = 0; i < shipCount; i++) {
        const id = `p${i}`;
        ids.push(id);
        const ang = rng.float(0, TAU);
        const r = rng.float(0, w.map.radius * 0.85);
        const rec = place(w, id, Math.cos(ang) * r, Math.sin(ang) * r, rng.float(0, TAU));
        rec.sweepAngle = rng.float(0, TAU);
      }
      for (let tick = 1; tick <= 6; tick++) {
        // Flip a random ship dead mid-run (sinkShip: the real death path).
        if (rng.float(0, 1) < 0.5) w.sinkShip(ids[rng.int(0, ids.length - 1)]);
        for (const id of ids) {
          w.submitInput(id, {
            seq: tick,
            throttle: rng.float(-1, 1),
            rudder: rng.float(-1, 1),
            aim: rng.float(-Math.PI, Math.PI),
            fireSeq: rng.float(0, 1) < 0.4 ? tick : 0, // ~40% of ticks land a fresh click
            aimDist: rng.float(0, 900),
            weapon: 0,
          });
        }
        w.step();
        for (const id of ids) {
          const me = w.ships.get(id)!;
          const phases: MatchPhase[] = ['active', 'finished', 'waiting'];
          const phase = phases[rng.int(0, 2)];
          const f = buildFrame(w, id, phase);
          if (phase === 'finished' || (phase === 'active' && !me.alive)) {
            expect(f.spec).toBe(true);
            expect(f.you).toBeUndefined();
          } else {
            verifyFoggedFrame(w, me, f); // fogged rules stay airtight
          }
        }
      }
    }
  });
});
