import { describe, it, expect } from 'vitest';
import {
  isAfloat,
  CONFIG,
  isOutside,
  rollZoneRings,
  zoneStateAt,
  type ZoneRing,
  type ZoneTimeline,
  pointPolygonDistance,
} from '@salvo/shared';
import { World } from '../game/world.js';

// A collapsed timeline (1ms beats — fully closed inside the first 50ms step)
// so the terminal ring's storm effects are observable in one tick. offsetCap 0
// keeps it concentric where a test positions ships by distance-from-origin.
const instant = (terminalSightFactor: number, offsetCap = 0): ZoneTimeline => ({
  beatMs: 1,
  ringSteps: [1 / 3, 2 / 3],
  offsetCap,
  terminalSightFactor,
});

// A tick-aligned rhythm for boundary pins: 1000ms beats = 20 ticks per beat,
// 80 ticks per group; every beat boundary lands exactly on a step.
const BEAT_MS = 1000;
const paced = (offsetCap = 1): ZoneTimeline => ({
  beatMs: BEAT_MS,
  ringSteps: [1 / 3, 2 / 3],
  offsetCap,
  terminalSightFactor: 2,
});

const TICKS_PER_BEAT = BEAT_MS / CONFIG.tick.simDtMs;

/** Place a ship at distance `d` from center on a bearing clear of all islands. */
function placeClear(world: World, id: string, d: number): void {
  const ship = world.ships.get(id)!;
  for (let i = 0; i < 360; i++) {
    const a = (i * Math.PI) / 180;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    const clear = world.map.islands.every(
      (is) => pointPolygonDistance({ x, y }, is.poly) > CONFIG.shipClasses.torpedoBoat.hull.length,
    );
    if (clear) {
      ship.state.x = x;
      ship.state.y = y;
      ship.state.speed = 0;
      return;
    }
  }
  throw new Error('no island-clear bearing found');
}

describe('zone lifecycle — starts ONLY via startZone', () => {
  it('is idle (full map, no storm) until startZone is called', () => {
    const w = new World(1, CONFIG.match.fillTo, instant(1));
    const rec = w.addShip('a', 'ALPHA');
    placeClear(w, 'a', w.map.radius * 0.8); // well outside the eventual terminal ring
    expect(w.zonePhase).toBe('idle');
    expect(w.zoneStartMs).toBe(0);
    expect(w.zoneLiveRing).toEqual({ cx: 0, cy: 0, r: w.map.radius });
    expect(w.zoneCurrentRing).toEqual({ cx: 0, cy: 0, r: w.map.radius });
    expect(w.zoneRevealedNextRing).toBeNull();
    for (let i = 0; i < 10; i++) w.step();
    expect(rec.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp); // idle zone deals no storm damage
  });

  it('startZone anchors the timeline and is idempotent (rings roll once)', () => {
    const w = new World(2, CONFIG.match.fillTo, instant(1, 1));
    w.addShip('a', 'ALPHA');
    w.step(); // now = 50
    w.startZone(); // anchors at now = 50, rolls the ring set
    expect(w.zoneStartMs).toBe(50);
    w.step(); // 1ms beats => the whole timeline is closed by now
    expect(w.zonePhase).toBe('closed');
    const ring = w.zoneLiveRing; // the rolled (offset) terminal ring
    w.startZone(); // second call must NOT re-anchor nor re-roll
    w.step();
    expect(w.zoneStartMs).toBe(50);
    expect(w.zonePhase).toBe('closed');
    expect(w.zoneLiveRing).toEqual(ring);
  });

  it('rings are deterministic per zone seed set (harness reproducibility)', () => {
    const roll = (seed: number, zoneSeeds?: number[]): ZoneRing => {
      const w = new World(seed, CONFIG.match.fillTo, instant(1, 1), { zoneSeeds });
      w.startZone();
      w.step();
      return w.zoneLiveRing;
    };
    expect(roll(7, [42, 43, 44])).toEqual(roll(7, [42, 43, 44]));
    expect(roll(7, [42, 43, 44])).not.toEqual(roll(7, [42, 43, 45])); // the pin discriminates
    // The standalone fallback (no zoneSeeds) stays deterministic per map seed.
    expect(roll(7)).toEqual(roll(7));
  });

  it('the ring streams are INDEPENDENT of the client-known map seed (amendment 10)', () => {
    // Same map seed, different private per-ring seeds => different rings:
    // nothing a client can derive from the welcome's mapSeed pins where rings
    // land when the room supplies its private nonces (ArenaRoom always does).
    const roll = (zoneSeeds: number[]): ZoneRing => {
      const w = new World(7, CONFIG.match.fillTo, instant(1, 1), { zoneSeeds });
      w.startZone();
      w.step();
      return w.zoneLiveRing;
    };
    const a = roll([1001, 1002, 1003]);
    const b = roll([2001, 2002, 2003]);
    expect(a).not.toEqual(b); // centers moved — the map seed alone decides nothing
    expect(a.r).toBeCloseTo(b.r, 9); // radii are cfg-derived, only CENTERS are private
    expect(roll([1001, 1002, 1003])).toEqual(a); // same nonces => identical rings
  });
});

describe('zone phases — beat boundaries are tick-exact', () => {
  /** Explicit per-ring zone seeds so the streams are reconstructable below. */
  const ZONE_SEEDS = [0xbee1, 0xbee2, 0xbee3];

  /** A started world plus its private ring set read back through the getters. */
  function started(seed = 3): World {
    const w = new World(seed, CONFIG.match.fillTo, paced(), { zoneSeeds: ZONE_SEEDS });
    w.startZone(0);
    return w;
  }

  function stepTo(w: World, tick: number): void {
    while (w.tick < tick) w.step();
  }

  it('walks clear -> supply -> reveal -> closing through group 0', () => {
    const w = started();
    stepTo(w, 1);
    expect(w.zonePhase).toBe('clear');
    stepTo(w, TICKS_PER_BEAT); // elapsed = exactly 1 beat
    expect(w.zonePhase).toBe('supply');
    stepTo(w, 2 * TICKS_PER_BEAT);
    expect(w.zonePhase).toBe('reveal');
    stepTo(w, 3 * TICKS_PER_BEAT);
    expect(w.zonePhase).toBe('closing');
    stepTo(w, 4 * TICKS_PER_BEAT);
    expect(w.zonePhase).toBe('clear'); // group 1
  });

  it('reveals the next ring EXACTLY at the reveal beat, never before', () => {
    const w = started();
    stepTo(w, 2 * TICKS_PER_BEAT - 1); // last supply tick
    expect(w.zoneRevealedNextRing).toBeNull();
    w.step(); // elapsed = 2 beats: the reveal boundary tick
    const next = w.zoneRevealedNextRing;
    expect(next).not.toBeNull();
    expect(next!.r).toBeLessThan(w.zoneCurrentRing.r);
    // Containment: the revealed ring lies fully inside the current one.
    const cur = w.zoneCurrentRing;
    expect(Math.hypot(next!.cx - cur.cx, next!.cy - cur.cy) + next!.r).toBeLessThanOrEqual(cur.r + 1e-6);
  });

  it('holds ring g exactly through clear/supply/reveal, then interpolates the close', () => {
    const w = started();
    const ring0 = { ...w.zoneCurrentRing };
    stepTo(w, 3 * TICKS_PER_BEAT - 1);
    expect(w.zoneLiveRing).toEqual(ring0); // still held at the last pre-close tick
    w.step(); // close start: f = 0, live ring still ring 0
    expect(w.zoneLiveRing).toEqual(ring0);
    const next = w.zoneRevealedNextRing!;
    stepTo(w, 3 * TICKS_PER_BEAT + TICKS_PER_BEAT / 2); // f = 0.5
    const live = w.zoneLiveRing;
    expect(live.cx).toBeCloseTo((ring0.cx + next.cx) / 2, 6);
    expect(live.cy).toBeCloseTo((ring0.cy + next.cy) / 2, 6);
    expect(live.r).toBeCloseTo((ring0.r + next.r) / 2, 6);
  });

  it('flips ring g+1 to current at the close-completion tick, next zeroes again', () => {
    const w = started();
    stepTo(w, 2 * TICKS_PER_BEAT);
    const revealed = { ...w.zoneRevealedNextRing! };
    stepTo(w, 4 * TICKS_PER_BEAT); // exactly the group boundary
    expect(w.zonePhase).toBe('clear');
    expect(w.zoneCurrentRing).toEqual(revealed); // no off-by-one-tick divergence
    expect(w.zoneLiveRing).toEqual(revealed);
    expect(w.zoneRevealedNextRing).toBeNull();
  });

  it('the getters agree with the shared zoneStateAt over the same stream every tick', () => {
    // Reconstruct the world's private ring roll from the SAME supplied zone
    // seeds and pin that every getter is exactly the shared function over
    // those rings: no forked math, no off-by-one-tick divergence between
    // phase and geometry.
    const w = started(3);
    const rings = rollZoneRings(w.map.radius, paced(), ZONE_SEEDS);
    for (let t = 0; t < 12 * TICKS_PER_BEAT + 20; t++) {
      w.step();
      const s = zoneStateAt(w.now, w.zoneStartMs, rings, paced());
      expect(w.zonePhase).toBe(s.phase);
      expect(w.zoneLiveRing).toEqual(s.current);
      expect(w.zoneRevealedNextRing).toEqual(s.next);
    }
    expect(w.zonePhase).toBe('closed');
    expect(w.zoneLiveRing.r).toBeCloseTo(2 * CONFIG.vision.sight, 5);
  });
});

describe('storm damage', () => {
  it('accumulates at stormDps granularity (4 HP/s => 0.2 per 50ms tick) outside', () => {
    const w = new World(3, CONFIG.match.fillTo, instant(1));
    const rec = w.addShip('a', 'ALPHA');
    placeClear(w, 'a', w.map.radius * 0.8);
    w.startZone();
    const perTick = CONFIG.zone.stormDps * (CONFIG.tick.simDtMs / 1000);
    expect(perTick).toBeCloseTo(0.2, 9);
    w.step();
    const ring = w.zoneLiveRing;
    expect(isOutside(rec.state, ring.cx, ring.cy, ring.r)).toBe(true);
    expect(rec.hp).toBeCloseTo(CONFIG.shipClasses.torpedoBoat.hp - perTick, 6);
    w.step();
    expect(rec.hp).toBeCloseTo(CONFIG.shipClasses.torpedoBoat.hp - 2 * perTick, 6);
  });

  it('bites in EVERY phase — a holding (clear) beat is no safe harbor outside the ring', () => {
    // Group 0's clear beat can't show this (ring 0 IS the map), so pin it on
    // group 1's clear beat: ring 1 is held, smaller than the map, and a ship
    // stranded outside it must bleed even though nothing is closing.
    const w = new World(5, CONFIG.match.fillTo, paced(0));
    const rec = w.addShip('a', 'ALPHA');
    w.startZone(0);
    // Advance to group 1 CLEAR (ring 1 held, radius < map) — a holding beat.
    while (w.tick < 4 * TICKS_PER_BEAT) w.step();
    expect(w.zonePhase).toBe('clear');
    const ring = w.zoneLiveRing;
    expect(ring.r).toBeLessThan(w.map.radius);
    placeClear(w, 'a', ring.r + 200); // outside the held ring (concentric cfg)
    const hp0 = rec.hp;
    w.step();
    expect(rec.hp).toBeLessThan(hp0); // the clear beat still bites outside
  });

  it('bites against the LIVE interpolated ring MID-CLOSE (not the boundary ring)', () => {
    // Half-way through close 1 the live ring sits between ring 0 (the map) and
    // ring 1: a ship outside the live radius but INSIDE ring 0 must bleed —
    // and one just inside the live radius must not. Concentric cfg so the
    // boundary is a pure radius; positions are set after the ring is known.
    const w = new World(8, CONFIG.match.fillTo, paced(0));
    const outside = w.addShip('a', 'ALPHA');
    const inside = w.addShip('b', 'BRAVO');
    w.startZone(0);
    while (w.tick < 3 * TICKS_PER_BEAT + TICKS_PER_BEAT / 2) w.step(); // f = 0.5 of close 1
    expect(w.zonePhase).toBe('closing');
    const live = w.zoneLiveRing;
    expect(live.r).toBeLessThan(w.map.radius);
    expect(live.r).toBeGreaterThan(w.zoneRevealedNextRing!.r);
    placeClear(w, 'a', live.r + 100); // outside live, inside ring 0
    placeClear(w, 'b', live.r - 150); // inside live (margin: it shrinks ~21u/tick)
    const hpOut = outside.hp;
    const hpIn = inside.hp;
    w.step();
    expect(outside.hp).toBeLessThan(hpOut); // the close bites at the LIVE boundary
    expect(inside.hp).toBe(hpIn);
  });

  it('deals NO damage to a ship inside the safe radius', () => {
    const w = new World(4, CONFIG.match.fillTo, instant(4)); // terminal 1320 > test position
    const rec = w.addShip('a', 'ALPHA');
    // 1200u — comfortably inside the 1320u terminal ring. An ABSOLUTE radius,
    // not a fraction of the map: since Story 5.6 grew baseRadius to 2800 the
    // old `radius * 0.5` (1400) sat OUTSIDE the terminal ring, which the
    // terminal radius never tracks (it derives from truesight, not from R).
    placeClear(w, 'a', 1200);
    w.startZone();
    for (let i = 0; i < 20; i++) w.step();
    const ring = w.zoneLiveRing;
    expect(isOutside(rec.state, ring.cx, ring.cy, ring.r)).toBe(false);
    expect(rec.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp);
  });

  it('deals NO damage to a ship exactly ON the ring (boundary inclusive-safe)', () => {
    const w = new World(5, CONFIG.match.fillTo, instant(2));
    const rec = w.addShip('a', 'ALPHA');
    w.startZone();
    w.step(); // establish the closed terminal ring
    placeClear(w, 'a', w.zoneLiveRing.r); // exactly on the (concentric) ring
    const hp0 = rec.hp;
    w.step();
    expect(rec.hp).toBe(hp0);
  });

  it('is center-aware: outside an OFFSET ring bites even nearer the map center', () => {
    const w = new World(11, CONFIG.match.fillTo, instant(1, 1));
    const rec = w.addShip('a', 'ALPHA');
    w.startZone();
    w.step();
    const ring = w.zoneLiveRing;
    // Safe AT the ring center, regardless of where the offset landed.
    rec.state.x = ring.cx;
    rec.state.y = ring.cy;
    rec.state.speed = 0;
    const hp0 = rec.hp;
    w.step();
    expect(rec.hp).toBe(hp0);
    // Strictly outside the ring (measured from ITS center) bleeds.
    rec.state.x = ring.cx + ring.r + 200;
    rec.state.y = ring.cy;
    w.step();
    expect(rec.hp).toBeLessThan(hp0);
  });

  it('storm kill sinks with NO killer (by=undefined) and no kill credited', () => {
    const w = new World(6, CONFIG.match.fillTo, instant(1));
    const rec = w.addShip('a', 'ALPHA');
    const other = w.addShip('b', 'BRAVO'); // must not be credited a kill
    placeClear(w, 'a', w.map.radius * 0.8);
    w.startZone();
    rec.hp = 0.1; // one storm tick will finish it
    w.step();
    expect(isAfloat(rec.lifecycle)).toBe(false);
    expect(rec.deaths).toBe(1);
    expect(other.kills).toBe(0);
    const sunk = w.tickEvents.find((e) => e.k === 'sunk');
    expect(sunk).toEqual({ k: 'sunk', id: 'a', by: undefined });
  });

  it('emits no per-tick dmg event for storm damage (relies on OwnShip.hp)', () => {
    const w = new World(7, CONFIG.match.fillTo, instant(1));
    const rec = w.addShip('a', 'ALPHA');
    placeClear(w, 'a', w.map.radius * 0.8);
    w.startZone();
    w.step();
    expect(rec.hp).toBeLessThan(CONFIG.shipClasses.torpedoBoat.hp); // took storm damage
    expect(w.tickEvents.some((e) => e.k === 'dmg')).toBe(false); // but emitted no dmg spam
  });
});
