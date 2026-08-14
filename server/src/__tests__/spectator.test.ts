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
  isAfloat,
  isSinking,
  isSunk,
  CONFIG,
  bearing,
  mulberry32,
  segPolygonHit,
  wrapPositive,
  type Island,
  type FrameMsg,
  type GameEvent,
  type MatchPhase,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { flatRaster } from './islandFixture.js';

const TAU = Math.PI * 2;
const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;

// ---------- test-local visibility reimplementation ---------------------------

/** THE anti-cheat oracle for island LOS, INDEPENDENTLY REIMPLEMENTED: the raw
 *  concave-safe polygon test with NONE of islandBlocksSegment's broadphase or
 *  `core` early-outs. If either optimization ever changed an answer, this
 *  oracle would disagree and the invariant suite would fail. */
function clearLos(a: { x: number; y: number }, b: { x: number; y: number }, islands: readonly Island[]): boolean {
  return islands.every((isle) => segPolygonHit(a, b, isle.poly, 0) === null);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function sighted(w: World, me: ShipRecord, p: { x: number; y: number }): boolean {
  return dist(me.state, p) <= SIGHT && clearLos(me.state, p, w.map.islands);
}

/** Islands cleared AND the raster flattened (Story 4.11): real terrain must
 *  not radar-shadow a world the test built as empty water. */
function bareWorld(seed = 1): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
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
    kind: 'shell',
    damage: CONFIG.gun.damage,
    hitRadius: CONFIG.gun.shellRadius,
    targetX: null,
    targetY: null,
    burstRadius: 0,
    contactDamage: CONFIG.gun.damage, // contact-only injection: legacy full-damage hit
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
    // Story 5.2: spectate begins at FOUNDER (a sinking captain stays fogged
    // with `you`), so one oversized step crosses the window. The `sunk` event
    // (emitted at sink-entry) still publishes on this very step, so the
    // sunk-carries-seen case below keeps reading it off tickEvents.
    w.step(CONFIG.ship.sinkingWindowMs);
    return w;
  }

  it('sets spec, omits you, and carries EVERY alive ship as a live contact', () => {
    const w = deadObserverWorld();
    const f = buildFrame(w, 'a', 'active');
    expect(f.spec).toBe(true);
    expect(f.you).toBeUndefined();
    const ids = f.contacts.map((c) => c.id).sort();
    expect(ids).toEqual(['b', 'c']); // unfogged: both far beyond sight
    // Even unfogged, spectator contacts never carry upgrade data (anti-cheat) —
    // nor, as of Story 2.6, level or XP progress. And with `you` omitted, a
    // spectator frame carries no economy field at all.
    for (const c of f.contacts) {
      expect('upg' in c).toBe(false);
      expect('stats' in c).toBe(false);
      expect('lvl' in c).toBe(false);
      expect('xp' in c).toBe(false);
    }
    expect(JSON.stringify(f)).not.toContain('"lvl"');
    const c = w.ships.get('c')!;
    expect(f.contacts.find((x) => x.id === 'c')).toEqual({
      id: 'c',
      x: c.state.x,
      y: c.state.y,
      heading: c.state.heading,
      speed: c.state.speed,
      cls: 'torpedoBoat',
    });
  });

  it('carries every mine, flagging only the observer-owned ones', () => {
    const w = deadObserverWorld();
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 800, y: 800, armedAt: 0 });
    w.mines.set('m2', { id: 'm2', ownerId: 'b', x: -800, y: -800, armedAt: 0 });
    const f = buildFrame(w, 'a', 'active');
    expect(f.mines.sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: 'm1', x: 800, y: 800, own: true, by: 'a' },
      { id: 'm2', x: -800, y: -800, own: false, by: 'b' },
    ]);
  });

  it('carries every decoy buoy (the truth — a spectator is never lied to, so no blips either)', () => {
    const w = deadObserverWorld();
    w.decoys.set('d1', { id: 'd1', ownerId: 'b', x: 700, y: -700, hullId: 'mineLayer', heading: 0, until: 42_000 });
    const f = buildFrame(w, 'a', 'active');
    // DecoyView carries the decoy's own id; own:false — spectator 'a' does not own 'b's buoy.
    expect(f.decoys).toEqual([{ id: 'd1', x: 700, y: -700, until: 42_000, own: false, by: 'b' }]);
    expect(f.events.filter((e) => e.k === 'blip')).toEqual([]); // counterIntel never fires unfogged
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

  it("a spectator's sunk ALWAYS carries seen: true (PV 23 — spectators witness everything)", () => {
    const w = deadObserverWorld(); // a died this very tick — the sunk rides tickEvents
    const own = buildFrame(w, 'a', 'active');
    expect(own.events.filter((e) => e.k === 'sunk')).toEqual([
      { k: 'sunk', id: 'a', by: 'b', seen: true },
    ]);
    // A later sinking far from the wreck's old bubble: still seen for the
    // spectator — the unfogged path stamps the spatial license unconditionally.
    // b became the KILL LEADER by sinking a (1 captain kill, strict unique
    // max), so this kill also carries the killer-case mark (Story 4.6 rework:
    // bty 'k' — observer-independent, spectators included).
    w.sinkShip('c', 'b');
    w.step();
    expect(buildFrame(w, 'a', 'active').events.filter((e) => e.k === 'sunk')).toEqual([
      { k: 'sunk', id: 'c', by: 'b', seen: true, bty: 'k' },
    ]);
  });

  it("filters another ship's self-private pt/bn out of spec frames; own points still arrive", () => {
    const w = deadObserverWorld(); // a is dead (sunk by b)
    place(w, 'd', 600, 0);
    w.sinkShip('c', 'b'); // b's kills → self-private pt events for b only
    w.sinkShip('d', 'b');
    const b = w.ships.get('b')!;
    b.hp -= 30;
    expect(w.spendPoint('b', 0)).toBe(true); // bn ("boon fitted") event, b only
    expect(w.spendPoint('b', 1)).toBe(true); // a second spend — still b only
    w.step();
    // The SPENDER's own frame carries both bn events (self-private ≠ invisible):
    // this is what makes the spectator assertion below non-vacuous.
    const fb = buildFrame(w, 'b', 'active');
    const bnB = fb.events.filter((e) => e.k === 'bn');
    expect(bnB).toHaveLength(2);
    expect(bnB.every((e) => e.k === 'bn' && e.id === 'b')).toBe(true);
    const fa = buildFrame(w, 'a', 'active');
    // b's point bank and FITTED BOONS all stay hidden from spectators (the
    // 'upg' event died with the legacy economy — Story 2.8 strip).
    expect(fa.events.filter((e) => e.k === 'pt' || e.k === 'bn')).toEqual([]);
    // The DEAD killer still banks its own point (mutual-destruction rule), and
    // the spec-frame pass-through delivers its pt to the owning spectator.
    // TWO pts since Story 4.6: b's three captain kills above crowned it the
    // bounty holder, so sinking b stacks CONFIG.bounty.killLevels on the
    // standard captain level — both banked points ride a's own frame.
    w.sinkShip('b', 'a');
    w.step();
    expect(buildFrame(w, 'a', 'active').events.filter((e) => e.k === 'pt')).toEqual([
      { k: 'pt', id: 'a' },
      { k: 'pt', id: 'a' },
    ]);
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
    w.respawnEnabled = false;
    w.sinkShip('b', 'a');
    // Story 5.2: a SINKING b would still (correctly) be a spectator contact —
    // this test pins the sunk-wreck shape, so cross the window first.
    w.step(CONFIG.ship.sinkingWindowMs);
    const winner = buildFrame(w, 'a', 'finished');
    expect(winner.spec).toBe(true);
    expect(winner.you).toBeUndefined();
    // The winner's own (alive) hull rides the contact pipeline now.
    expect(winner.contacts).toEqual([
      { id: 'a', x: a.state.x, y: a.state.y, heading: a.state.heading, speed: a.state.speed, cls: 'torpedoBoat' },
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
    // Story 5.2 (amendment 15 seam 3): a SINKING hull is still a legitimate
    // contact — only the sunk vanish. And amendment 16: the contact shape
    // must disclose NOTHING about the window, so pin the exact key set.
    expect(isAfloat(target.lifecycle) || isSinking(target.lifecycle)).toBe(true);
    // THE EXACT CONTACT KEY SET, updated deliberately for Story 5.6 (epic-5
    // amendment 40). `aggro` is the ONE optional key a contact may now carry,
    // and only when it is a PvE fleet hull that has acquired THIS observer —
    // so a contact that is not a fleet hull hunting `me` must still be
    // byte-identical to the shipped six. Both shapes are enumerated rather
    // than allowed loosely: a stray seventh key still fails.
    const keys = Object.keys(c).sort();
    if (c.aggro === undefined) {
      expect(keys).toEqual(['cls', 'heading', 'id', 'speed', 'x', 'y']);
    } else {
      expect(keys).toEqual(['aggro', 'cls', 'heading', 'id', 'speed', 'x', 'y']);
      expect(c.aggro).toBe(true); // never `false` — omitted is the negative
      expect(w.drones.isTargeting(c.id, me.id)).toBe(true); // the independent oracle
    }
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
      // Silhouette-grammar worlds only in this suite (the default), so the
      // paint carries the 4.2 id/position shape.
      const target = w.ships.get((e as import('@salvo/shared').SilhouetteBlipEvent).id)!;
      const d = dist(me.state, target.state);
      // Story 5.2: a sinking hull still paints (amendment 15 seam 3).
      expect(isAfloat(target.lifecycle) || isSinking(target.lifecycle)).toBe(true);
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
    case 'pt':
    case 'bn':
      expect(e.id).toBe(me.id); // self-private, even under fog
      return;
    case 'sunk': {
      // PV 23 (the public register): a HUMAN victim's sinking reaches every
      // fogged observer (identity only); a DRONE victim only a witness or its
      // killer; and the spatial license `seen` may be present ONLY when the
      // wreck was genuinely sighted (these worlds inject no lit zones).
      if (e.id === me.id) return;
      const wreck = w.ships.get(e.id);
      if (wreck === undefined) {
        // No wreck record this tick: production delivers only to the CREDITED
        // KILLER (sunkCreditedTo needs no record; witness and public clauses
        // fail-close), and the witness predicate fail-closes too — no `seen`.
        expect(e.by).toBe(me.id);
        expect(e.seen).toBeUndefined();
        return;
      }
      const witnessed = sighted(w, me, wreck.state);
      if (wreck.isDrone) expect(witnessed || e.by === me.id).toBe(true);
      if (e.seen !== undefined) {
        expect(e.seen).toBe(true);
        expect(witnessed).toBe(true);
      }
      // `vcls` (Story 5.6, amendment 43): the victim's hull id, to the
      // CREDITED KILLER alone — one gate, the view mode is not a second one
      // (see perception.test.ts's verifySunk). A witness who did not fire
      // never gets it; a spectating killer does. Biconditional: a killer with
      // a live wreck record MUST get it.
      if (e.vcls !== undefined) {
        expect(e.by).toBe(me.id);
        expect(e.vcls).toBe(wreck.hullId);
      } else {
        expect(e.by === me.id).toBe(false);
      }
      return;
    }
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
            fireT: 0,
            slot: 0,
            actSeq: 0,
            actSlot: 0, hornSeq: 0,
          });
        }
        w.step();
        for (const id of ids) {
          const me = w.ships.get(id)!;
          const phases: MatchPhase[] = ['active', 'finished', 'waiting'];
          const phase = phases[rng.int(0, 2)];
          const f = buildFrame(w, id, phase);
          // Story 5.2 (amendment 7 discharged): the spectator gate keys on
          // isSunk — a SINKING observer in the active phase stays on the
          // FOGGED branch below, with `you` and no unfogged data. Within
          // this 6-tick run a sinkShip'd hull never founders (window 5000ms),
          // so every "death" here exercises the sinking case.
          if (phase === 'finished' || (phase === 'active' && isSunk(me.lifecycle))) {
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
