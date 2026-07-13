import { describe, it, expect } from 'vitest';
import { CONFIG, isOutside, type ZoneTimeline } from '@salvo/shared';
import { World } from '../game/world.js';

// A collapsed timeline (grace 0, shrink 0) so the zone is CLOSED at its end
// radius from the very first step — storm effects are observable in one tick.
const closed = (fraction: number): ZoneTimeline => ({
  grace: 0,
  shrinkDuration: 0,
  endRadiusFraction: fraction,
});

/** Place a ship at distance `d` from center on a bearing clear of all islands. */
function placeClear(world: World, id: string, d: number): void {
  const ship = world.ships.get(id)!;
  for (let i = 0; i < 360; i++) {
    const a = (i * Math.PI) / 180;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    const clear = world.map.islands.every((is) => Math.hypot(x - is.x, y - is.y) > is.r + CONFIG.shipClasses.cruiser.hull.length);
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
    const w = new World(1, CONFIG.match.fillTo, closed(0.15));
    const rec = w.addShip('a', 'ALPHA');
    placeClear(w, 'a', w.map.radius * 0.8); // well outside the eventual end radius
    expect(w.zonePhase).toBe('idle');
    expect(w.zoneStartMs).toBe(0);
    expect(w.zoneRadius).toBe(w.map.radius);
    for (let i = 0; i < 10; i++) w.step();
    expect(rec.hp).toBe(CONFIG.shipClasses.cruiser.hp); // idle zone deals no storm damage
  });

  it('startZone anchors the timeline and is idempotent', () => {
    const w = new World(2, CONFIG.match.fillTo, closed(0.15));
    w.addShip('a', 'ALPHA');
    w.step(); // now = 50
    w.startZone(); // anchors at now = 50
    expect(w.zoneStartMs).toBe(50);
    w.startZone(); // second call must NOT re-anchor
    w.step();
    expect(w.zoneStartMs).toBe(50);
    expect(w.zonePhase).toBe('closed'); // grace 0 + shrink 0 => closed immediately
  });
});

describe('storm damage', () => {
  it('accumulates at stormDps granularity (4 HP/s => 0.2 per 50ms tick) outside', () => {
    const w = new World(3, CONFIG.match.fillTo, closed(0.15));
    const rec = w.addShip('a', 'ALPHA');
    placeClear(w, 'a', w.map.radius * 0.8);
    w.startZone();
    const perTick = CONFIG.zone.stormDps * (CONFIG.tick.simDtMs / 1000);
    expect(perTick).toBeCloseTo(0.2, 9);
    w.step();
    expect(isOutside(rec.state, w.zoneRadius)).toBe(true);
    expect(rec.hp).toBeCloseTo(CONFIG.shipClasses.cruiser.hp - perTick, 6);
    w.step();
    expect(rec.hp).toBeCloseTo(CONFIG.shipClasses.cruiser.hp - 2 * perTick, 6);
  });

  it('deals NO damage to a ship inside the safe radius', () => {
    const w = new World(4, CONFIG.match.fillTo, closed(0.95)); // end radius > spawn ring
    const rec = w.addShip('a', 'ALPHA');
    placeClear(w, 'a', w.map.radius * 0.5); // comfortably inside
    w.startZone();
    for (let i = 0; i < 20; i++) w.step();
    expect(isOutside(rec.state, w.zoneRadius)).toBe(false);
    expect(rec.hp).toBe(CONFIG.shipClasses.cruiser.hp);
  });

  it('deals NO damage to a ship exactly ON the ring (boundary inclusive-safe)', () => {
    const w = new World(5, CONFIG.match.fillTo, closed(0.5));
    const rec = w.addShip('a', 'ALPHA');
    w.startZone();
    w.step(); // establish the closed radius
    placeClear(w, 'a', w.zoneRadius); // exactly on the ring
    const hp0 = rec.hp;
    w.step();
    expect(rec.hp).toBe(hp0);
  });

  it('storm kill sinks with NO killer (by=undefined) and no kill credited', () => {
    const w = new World(6, CONFIG.match.fillTo, closed(0.15));
    const rec = w.addShip('a', 'ALPHA');
    const other = w.addShip('b', 'BRAVO'); // must not be credited a kill
    placeClear(w, 'a', w.map.radius * 0.8);
    w.startZone();
    rec.hp = 0.1; // one storm tick will finish it
    w.step();
    expect(rec.alive).toBe(false);
    expect(rec.deaths).toBe(1);
    expect(other.kills).toBe(0);
    const sunk = w.tickEvents.find((e) => e.k === 'sunk');
    expect(sunk).toEqual({ k: 'sunk', id: 'a', by: undefined });
  });

  it('emits no per-tick dmg event for storm damage (relies on OwnShip.hp)', () => {
    const w = new World(7, CONFIG.match.fillTo, closed(0.15));
    const rec = w.addShip('a', 'ALPHA');
    placeClear(w, 'a', w.map.radius * 0.8);
    w.startZone();
    w.step();
    expect(rec.hp).toBeLessThan(CONFIG.shipClasses.cruiser.hp); // took storm damage
    expect(w.tickEvents.some((e) => e.k === 'dmg')).toBe(false); // but emitted no dmg spam
  });
});
