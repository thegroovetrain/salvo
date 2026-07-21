import { describe, it, expect } from 'vitest';
import { CONFIG, hullSilhouette, polygonMaxRadius } from '@salvo/shared';
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
    expect(rec.alive).toBe(true);
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
    w.sinkShip('a');
    w.submitInput('a', input(1));
    const before = { ...rec.state };
    w.step();
    expect(rec.lastAckSeq).toBe(1);
    expect(rec.state.x).toBe(before.x);
    expect(rec.state.y).toBe(before.y);
  });
});

describe('World step — boundary', () => {
  it('clamps a ship at the map edge and damps its speed', () => {
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
    // The clamp keeps the whole silhouette inside: center stops at
    // radius - the hull's bounding-circle radius (silhouette max radius).
    const limit = w.map.radius - polygonMaxRadius(hullSilhouette('torpedoBoat'));
    expect(d).toBeLessThanOrEqual(limit + 1e-9);
    expect(d).toBeCloseTo(limit, 6);
    expect(rec.state.speed).toBeLessThan(CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed * 0.5);
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
  it('advances the radar sweep one revolution per sweepPeriod', () => {
    const w = new World(6);
    const rec = w.addShip('a', 'ALPHA');
    const ticksPerRev = CONFIG.vision.sweepPeriod / SIM_DT;
    stepN(w, ticksPerRev);
    expect(rec.sweepAngle).toBeCloseTo(0, 6); // full 2*pi wrap back to start
    stepN(w, ticksPerRev / 2);
    expect(rec.sweepAngle).toBeCloseTo(Math.PI, 6);
  });

  it('sinkShip kills, schedules respawn, and step revives after the delay', () => {
    const w = new World(7);
    const rec = w.addShip('a', 'ALPHA');
    w.sinkShip('a', 'b');
    expect(rec.alive).toBe(false);
    expect(rec.hp).toBe(0);
    expect(rec.respawnAt).toBe(CONFIG.ship.respawnDelay);

    const ticksToRespawn = CONFIG.ship.respawnDelay / SIM_DT;
    stepN(w, ticksToRespawn - 1);
    expect(rec.alive).toBe(false);
    w.step();
    expect(rec.alive).toBe(true);
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
    for (let i = 0; i < CONFIG.ship.respawnDelay / SIM_DT + 5; i++) {
      w.step();
      seen.push(...w.tickEvents);
    }
    expect(seen).toEqual([expect.objectContaining({ k: 'spawn', id: 'a' })]);
    expect(w.tickEvents).toEqual([]); // events do not leak across ticks
  });
});
