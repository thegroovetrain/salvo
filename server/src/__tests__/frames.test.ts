import { describe, it, expect } from 'vitest';
import { CONFIG, zeroUpgrades } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const input = (seq: number, extra = {}) => ({
  seq,
  throttle: 1,
  rudder: 0,
  aim: 0,
  fireSeq: 0,
  aimDist: 0,
  weapon: 0,
  ...extra,
});

/** Add a ship and teleport it to an exact pose (speed 0). */
function place(w: World, id: string, x: number, y: number): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase());
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = 0;
  rec.state.speed = 0;
  return rec;
}

/** Two ships well inside each other's sight, no islands (fog stays out of the way). */
function makeWorld(): World {
  const w = new World(42);
  w.map.islands.length = 0;
  place(w, 'a', 0, 0);
  place(w, 'b', 100, 0);
  return w;
}

describe('buildFrame — shape and clock', () => {
  it('carries the world clock and tick', () => {
    const w = makeWorld();
    w.step();
    w.step();
    const f = buildFrame(w, 'a');
    expect(f.t).toBe(w.now);
    expect(f.tick).toBe(2);
  });

  it('you is the full own-ship view with full ammo pools and sweep', () => {
    const w = makeWorld();
    w.submitInput('a', input(1, { weapon: 2 }));
    w.step();
    const f = buildFrame(w, 'a');
    const ship = w.ships.get('a')!;
    expect(f.you).toEqual({
      id: 'a',
      x: ship.state.x,
      y: ship.state.y,
      heading: ship.state.heading,
      speed: ship.state.speed,
      hp: CONFIG.shipClasses.cruiser.hp,
      alive: true,
      weapon: 2,
      ammo: [
        { n: CONFIG.gun.maxAmmo, reloadMsLeft: 0 },
        { n: CONFIG.torpedo.maxAmmo, reloadMsLeft: 0 },
        { n: CONFIG.mine.maxAmmo, reloadMsLeft: 0 },
      ],
      sweep: ship.sweepAngle,
      cls: 'cruiser',
      upg: zeroUpgrades(), // 14 zero counts — no upgrades granted yet
    });
    expect(f.spec).toBeUndefined();
  });

  it('omits you for an unknown viewer, who sees nothing (fail-closed)', () => {
    const w = makeWorld();
    w.step();
    const f = buildFrame(w, 'watcher');
    expect(f.you).toBeUndefined();
    expect(f.contacts).toEqual([]);
    expect(f.events).toEqual([]);
  });
});

describe('buildFrame — ackSeq', () => {
  it('echoes the highest accepted input seq, 0 before any input', () => {
    const w = makeWorld();
    expect(buildFrame(w, 'a').ackSeq).toBe(0);
    w.submitInput('a', input(5));
    w.submitInput('a', input(9));
    w.submitInput('a', input(3)); // stale — ignored
    w.step();
    expect(buildFrame(w, 'a').ackSeq).toBe(9);
    expect(buildFrame(w, 'b').ackSeq).toBe(0); // per-client
  });
});

describe('buildFrame — contacts (fogged via perception)', () => {
  it('excludes self and includes other living ships inside sight', () => {
    const w = makeWorld();
    place(w, 'c', 0, 150);
    w.step();
    const f = buildFrame(w, 'a');
    expect(f.contacts.map((c) => c.id).sort()).toEqual(['b', 'c']);
    const b = w.ships.get('b')!;
    expect(f.contacts.find((c) => c.id === 'b')).toEqual({
      id: 'b',
      x: b.state.x,
      y: b.state.y,
      heading: b.state.heading,
      speed: b.state.speed,
      cls: 'cruiser',
    });
  });

  it('excludes ships beyond sight range (fog)', () => {
    const w = makeWorld();
    place(w, 'far', CONFIG.vision.sight + 50, 0);
    w.step();
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
  });

  it('excludes dead ships; a respawned ship reappears once back in sight', () => {
    const w = makeWorld();
    w.sinkShip('b');
    w.step();
    expect(buildFrame(w, 'a').contacts).toEqual([]);
    for (let i = 0; i < CONFIG.ship.respawnDelay / CONFIG.tick.simDtMs; i++) w.step();
    const b = w.ships.get('b')!;
    expect(b.alive).toBe(true); // respawned on the ring, far outside a's sight
    expect(buildFrame(w, 'a').contacts).toEqual([]);
    b.state.x = 100; // steam back into a's bubble
    b.state.y = 0;
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
  });
});

describe('buildFrame — events (fogged via perception)', () => {
  it('emits your own spawn event on the tick after a join, then goes quiet', () => {
    const w = new World(7);
    w.addShip('a', 'ALPHA');
    w.step();
    const f = buildFrame(w, 'a');
    expect(f.events).toEqual([expect.objectContaining({ k: 'spawn', id: 'a' })]);
    w.step();
    expect(buildFrame(w, 'a').events).toEqual([]);
  });

  it('emits sunk events to the victim and to viewers who can see the wreck', () => {
    const w = makeWorld();
    w.step(); // flush join spawns
    w.sinkShip('b', 'a');
    w.step();
    const sunk = { k: 'sunk', id: 'b', by: 'a' };
    // The killer additionally gets its killer-private kill-reward upg event.
    const aEvents = buildFrame(w, 'a').events;
    expect(aEvents.filter((e) => e.k === 'sunk')).toEqual([sunk]); // wreck 100u away — visible
    expect(aEvents.filter((e) => e.k === 'upg')).toHaveLength(1);
    expect(buildFrame(w, 'b').events).toEqual([sunk]); // victim always told, never the killer's grant
  });

  it('spawn events carry the spawn position', () => {
    const w = new World(11);
    const rec = w.addShip('a', 'ALPHA');
    w.step();
    expect(buildFrame(w, 'a').events[0]).toEqual({
      k: 'spawn',
      id: 'a',
      x: rec.state.x,
      y: rec.state.y,
    });
  });
});
