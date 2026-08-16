import { describe, it, expect } from 'vitest';
import { isAfloat, CONFIG, hullSilhouette, polygonMaxRadius, transformPolygon, wrapPositive } from '@salvo/shared';
import { World } from '../game/world.js';

const SIM_DT = CONFIG.tick.simDtMs;

const input = (seq: number, throttle = 1, rudder = 0, extra = {}) => ({
  seq,
  throttle,
  rudder,
  aim: 0,
  fireSeq: 0,
  aimDist: 0,
  slot: 0,
  fireT: 0,
  actSeq: 0,
  actSlot: 0, hornSeq: 0,
  ...extra,
});

function stepN(world: World, n: number): void {
  for (let i = 0; i < n; i++) world.step();
}

describe('World clock + lifecycle', () => {
  it('owns the clock: now/tick advance per fixed step', () => {
    const w = new World(1);
    expect(w.now).toBe(0);
    expect(w.tick).toBe(0);
    stepN(w, 3);
    expect(w.now).toBe(3 * SIM_DT);
    expect(w.tick).toBe(3);
  });

  it('addShip creates a full-hp living ship and removeShip forgets it', () => {
    const w = new World(1);
    const rec = w.addShip('a', 'ALPHA');
    expect(rec.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp);
    expect(isAfloat(rec.lifecycle)).toBe(true);
    expect(rec.isDrone).toBe(false);
    expect(w.ships.size).toBe(1);
    w.removeShip('a');
    expect(w.ships.size).toBe(0);
  });

  it('addShip defaults to the torpedoBoat class', () => {
    const rec = new World(1).addShip('a', 'ALPHA');
    expect(rec.hullId).toBe('torpedoBoat');
    expect(rec.cls).toBe(CONFIG.shipClasses.torpedoBoat);
  });

  it('addShip applies the requested class (id, cached cls, and hp)', () => {
    const w = new World(1);
    const bb = w.addShip('b', 'BRAVO', false, 'battleship');
    expect(bb.hullId).toBe('battleship');
    expect(bb.cls).toBe(CONFIG.shipClasses.battleship);
    expect(bb.hp).toBe(CONFIG.shipClasses.battleship.hp);
  });

  it('addShip resolves a drone hull id to its CONFIG.drones envelope', () => {
    const w = new World(1);
    const d = w.addShip('d1', 'DRONE-01', true, 'droneMedium');
    expect(d.hullId).toBe('droneMedium');
    expect(d.cls).toBe(CONFIG.drones.medium);
    // effectiveStats accepts the drone envelope: hp/kinematics flow through.
    expect(d.hp).toBe(CONFIG.drones.medium.hp);
    expect(d.stats.maxHp).toBe(CONFIG.drones.medium.hp);
    expect(d.stats.kinematics.maxSpeed).toBe(CONFIG.drones.medium.kinematics.maxSpeed);
  });
});

describe('World step — per-class kinematics', () => {
  it('a torpedo boat out-accelerates a battleship under full throttle', () => {
    const w = new World(1);
    const dd = w.addShip('dd', 'DD', false, 'torpedoBoat');
    const bb = w.addShip('bb', 'BB', false, 'battleship');
    // Same fresh pose so only kinematics differ.
    dd.state = { x: 0, y: 0, heading: 0, speed: 0 };
    bb.state = { x: 0, y: 0, heading: 0, speed: 0 };
    w.submitInput('dd', input(1, 1, 0));
    w.submitInput('bb', input(1, 1, 0));
    w.step();
    // One tick of accel: torpedoBoat accel 12 > battleship accel 5.
    expect(dd.state.speed).toBeGreaterThan(bb.state.speed);
    expect(dd.state.speed).toBeCloseTo(CONFIG.shipClasses.torpedoBoat.kinematics.accel * (SIM_DT / 1000), 9);
    expect(bb.state.speed).toBeCloseTo(CONFIG.shipClasses.battleship.kinematics.accel * (SIM_DT / 1000), 9);
  });
});

describe('World step — inputs and motion', () => {
  it('applies the latest stored input and acks its seq', () => {
    const w = new World(2);
    const rec = w.addShip('a', 'ALPHA');
    const before = { ...rec.state };
    expect(w.submitInput('a', input(7))).toBe(true);
    w.step();
    expect(rec.lastAckSeq).toBe(7);
    expect(rec.state.speed).toBeGreaterThan(0);
    const moved = Math.hypot(rec.state.x - before.x, rec.state.y - before.y);
    expect(moved).toBeGreaterThan(0);
  });

  it('is deterministic: same seed + same scripted inputs => identical state', () => {
    const script = [input(1, 1, 0), input(2, 1, 1), input(3, -0.5, -1), input(4, 1, 0.3)];
    const run = () => {
      const w = new World(1234);
      w.addShip('a', 'ALPHA');
      w.addShip('b', 'BRAVO');
      for (const msg of script) {
        w.submitInput('a', msg);
        w.submitInput('b', { ...msg, rudder: -msg.rudder });
        stepN(w, 10);
      }
      const a = w.ships.get('a')!;
      const b = w.ships.get('b')!;
      return [a.state, b.state, a.sweepAngle, w.now, w.tick];
    };
    expect(run()).toEqual(run());
  });

  it('setRtt stores the estimate on the ship (null = never measured); unknown ids are a no-op', () => {
    const w = new World(11);
    const rec = w.addShip('a', 'ALPHA');
    expect(rec.rttMs).toBeNull(); // drones and fresh joins alike start unmeasured
    w.setRtt('a', 42);
    expect(rec.rttMs).toBe(42);
    w.setRtt('a', null);
    expect(rec.rttMs).toBeNull();
    expect(() => w.setRtt('ghost', 10)).not.toThrow();
  });

  it('dead ships do not move but still ack inputs', () => {
    const w = new World(3);
    const rec = w.addShip('a', 'ALPHA');
    w.respawnEnabled = false; // the window now outlasts the respawn delay
    w.sinkShip('a');
    // Story 5.2: sinkShip opens the five-second window (a SINKING hull still
    // steers — the motion seam), so ride it out to a genuinely SUNK hull
    // before asserting the parked wreck.
    w.step(CONFIG.ship.sinkingWindowMs);
    w.submitInput('a', input(1));
    const before = { ...rec.state };
    w.step();
    expect(rec.lastAckSeq).toBe(1);
    expect(rec.state.x).toBe(before.x);
    expect(rec.state.y).toBe(before.y);
  });
});

describe('World step — boundary', () => {
  // CYCLE 59 (Eric ruling 2026-08-06): the map edge is a WALL, not ground. This
  // test previously asserted the clamp at `radius − polygonMaxRadius` (the
  // heading-INDEPENDENT bounding radius — an invisible wall up to 62u inside
  // the drawn edge) AND a speed damp on the press. Both assertions are
  // DELIBERATELY inverted: they were the "pinned in open ocean" bug.
  it('clamps a ship at the map edge by its bow, and never damps its speed there', () => {
    const w = new World(4);
    const rec = w.addShip('a', 'ALPHA');
    // Aim the ship straight out from center and place it near the edge, fast.
    rec.state.x = w.map.radius - 1;
    rec.state.y = 0;
    rec.state.heading = 0;
    rec.state.speed = CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed;
    w.submitInput('a', input(1, 1, 0));
    w.step();
    const d = Math.hypot(rec.state.x, rec.state.y);
    // Bow-on, the hull stops with its BOW on the boundary — strictly further
    // out than the old bounding-circle wall, and the silhouette still fits.
    const local = hullSilhouette('torpedoBoat');
    const bow = Math.max(...local.map((p) => p.x));
    expect(d).toBeCloseTo(w.map.radius - bow, 6);
    expect(d).toBeGreaterThan(w.map.radius - polygonMaxRadius(local));
    for (const v of transformPolygon(local, rec.state.x, rec.state.y, rec.state.heading)) {
      expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(w.map.radius + 1e-6);
    }
    // Full way kept, so full rudder authority: the edge costs nothing.
    expect(rec.state.speed).toBeCloseTo(CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed, 9);
  });

  it('never lets a ship escape the map over a long full-throttle run', () => {
    const w = new World(5);
    const rec = w.addShip('a', 'ALPHA');
    w.submitInput('a', input(1, 1, 0.1));
    stepN(w, 600); // 30s of sailing
    expect(Math.hypot(rec.state.x, rec.state.y)).toBeLessThanOrEqual(w.map.radius + 1e-9);
  });
});

describe('World step — sweep + respawn', () => {
  it('advances the radar sweep one revolution per sweep period (60000/rpm)', () => {
    const w = new World(6);
    const rec = w.addShip('a', 'ALPHA');
    const ticksPerRev = Math.round(60000 / CONFIG.vision.sweepRpm / SIM_DT);
    // The RATE is the property, and it is now asserted as a DELTA from wherever
    // the beam started: a fresh hull's sweep is anchored to its spawn heading
    // (Eric ruling 2026-08-16), so an absolute 0 was only ever true by the old
    // construction. Reading the start makes the same statement independent of
    // where mapgen dropped this hull.
    const start = rec.sweepAngle;
    stepN(w, ticksPerRev);
    expect(rec.sweepAngle).toBeCloseTo(start, 6); // full 2*pi wrap back to start
    stepN(w, ticksPerRev / 2);
    expect(rec.sweepAngle).toBeCloseTo(wrapPositive(start + Math.PI), 6);
  });

  it('sinkShip kills, schedules respawn, and step revives after the delay', () => {
    const w = new World(7);
    const rec = w.addShip('a', 'ALPHA');
    w.sinkShip('a', 'b');
    expect(isAfloat(rec.lifecycle)).toBe(false);
    expect(rec.hp).toBe(0);
    expect(rec.respawnAt).toBe(CONFIG.ship.respawnDelay);

    // Story 5.2: the respawn delay (3000ms) now elapses INSIDE the sinking
    // window (5000ms), and processRespawns revives only the SUNK — so the
    // revive lands on the FOUNDER tick, where founderSinking runs earlier in
    // the same step order.
    const ticksToFounder = CONFIG.ship.sinkingWindowMs / SIM_DT;
    stepN(w, ticksToFounder - 1);
    expect(isAfloat(rec.lifecycle)).toBe(false);
    w.step();
    expect(isAfloat(rec.lifecycle)).toBe(true);
    expect(rec.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp);
    expect(rec.respawnAt).toBe(0);
    expect(Math.hypot(rec.state.x, rec.state.y)).toBeCloseTo(w.map.spawnRing, 6);
  });

  it('sinkShip on a dead or unknown ship is a no-op', () => {
    const w = new World(8);
    w.addShip('a', 'ALPHA');
    w.sinkShip('a');
    const at = w.ships.get('a')!.respawnAt;
    w.step();
    w.sinkShip('a'); // already dead — must not reschedule
    expect(w.ships.get('a')!.respawnAt).toBe(at);
    expect(() => w.sinkShip('ghost')).not.toThrow();
  });

  it('emits sunk then spawn events across the sink/respawn transition', () => {
    const w = new World(9);
    w.addShip('a', 'ALPHA');
    w.step(); // flush the join spawn event
    w.sinkShip('a', 'k');
    w.step();
    expect(w.tickEvents).toEqual([{ k: 'sunk', id: 'a', by: 'k' }]);
    const seen: unknown[] = [];
    // Story 5.2: the window (5000ms) outlasts the respawn delay (3000ms), so
    // cover through the founder tick — the spawn fires there, and CRUCIALLY
    // no second `sunk` ever does (the toEqual below pins exactly one event).
    for (let i = 0; i < CONFIG.ship.sinkingWindowMs / SIM_DT + 5; i++) {
      w.step();
      seen.push(...w.tickEvents);
    }
    expect(seen).toEqual([expect.objectContaining({ k: 'spawn', id: 'a' })]);
    expect(w.tickEvents).toEqual([]); // events do not leak across ticks
  });
});
