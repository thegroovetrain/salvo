import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { World } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const input = (seq: number, extra = {}) => ({
  seq,
  throttle: 1,
  rudder: 0,
  aim: 0,
  fire: false,
  weapon: 0,
  ...extra,
});

function makeWorld(): World {
  const w = new World(42);
  w.addShip('a', 'ALPHA');
  w.addShip('b', 'BRAVO');
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

  it('you is the full own-ship view with stub cooldowns and sweep', () => {
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
      hp: CONFIG.ship.hp,
      alive: true,
      weapon: 2,
      cooldowns: [0, 0, 0],
      sweep: ship.sweepAngle,
    });
    expect(f.spec).toBeUndefined();
  });

  it('omits you for an unknown viewer (spectator seam)', () => {
    const w = makeWorld();
    w.step();
    const f = buildFrame(w, 'watcher');
    expect(f.you).toBeUndefined();
    expect(f.contacts.map((c) => c.id).sort()).toEqual(['a', 'b']);
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

describe('buildFrame — contacts (STEP 9 SEAM: currently unfogged)', () => {
  it('excludes self and includes every other living ship', () => {
    const w = makeWorld();
    w.addShip('c', 'CHARLIE');
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
    });
  });

  it('excludes dead ships until they respawn', () => {
    const w = makeWorld();
    w.sinkShip('b');
    w.step();
    expect(buildFrame(w, 'a').contacts).toEqual([]);
    for (let i = 0; i < CONFIG.ship.respawnDelay / CONFIG.tick.simDtMs; i++) w.step();
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
  });
});

describe('buildFrame — events', () => {
  it('emits spawn events on the tick after a join, then goes quiet', () => {
    const w = new World(7);
    w.addShip('a', 'ALPHA');
    w.step();
    const f = buildFrame(w, 'a');
    expect(f.events).toEqual([expect.objectContaining({ k: 'spawn', id: 'a' })]);
    w.step();
    expect(buildFrame(w, 'a').events).toEqual([]);
  });

  it('emits sunk events to every viewer on the sink tick', () => {
    const w = makeWorld();
    w.step(); // flush join spawns
    w.sinkShip('b', 'a');
    w.step();
    const sunk = { k: 'sunk', id: 'b', by: 'a' };
    expect(buildFrame(w, 'a').events).toEqual([sunk]);
    expect(buildFrame(w, 'b').events).toEqual([sunk]);
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
