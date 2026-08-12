// WOUNDED SMOKE emission (Story 4.4, amendments 40-50) — World.tickSmoke's
// band arithmetic, cadence throttle, and life-boundary timer resets. These are
// EMISSION tests (what the world queues into tickEvents); per-observer
// delivery — the muzzle-flash halo, island LOS, the anonymous {k,x,y,tier}
// wire shape — is the sm registry row's job, unit-tested in signals.test.ts
// and independently re-verified by the perception invariant suite.

import { describe, it, expect } from 'vitest';
import { isAfloat, CONFIG, type GameEvent, type SmokeEvent } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';

const INTERVAL = CONFIG.smoke.puffIntervalMs;
const DT = CONFIG.tick.simDtMs;

/** World whose islands are cleared, for exact-geometry cases. */
function bareWorld(seed = 1): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship and teleport it to an exact pose (speed 0). */
function place(w: World, id: string, x: number, y: number): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase());
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = 0;
  rec.state.speed = 0;
  return rec;
}

function smokes(events: readonly GameEvent[]): SmokeEvent[] {
  return events.filter((e): e is SmokeEvent => e.k === 'sm');
}

describe('world — wounded smoke band arithmetic (exclusive lower bounds, the hpColor() reading)', () => {
  it('a healthy hull emits nothing, and EXACTLY 0.5 is healthy (silent)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step();
    expect(smokes(w.tickEvents)).toHaveLength(0); // full hp
    a.hp = a.stats.maxHp * CONFIG.damageBands.amberBelow; // frac === 0.5 exactly
    w.step();
    expect(smokes(w.tickEvents)).toHaveLength(0); // frac >= amberBelow reads healthy
  });

  it('just below 0.5 emits tier 1 at the hull\'s true position', () => {
    const w = bareWorld();
    const a = place(w, 'a', 123, -456);
    a.hp = a.stats.maxHp * 0.49;
    w.step();
    const sm = smokes(w.tickEvents);
    expect(sm).toHaveLength(1);
    expect(sm[0]).toEqual({ k: 'sm', x: 123, y: -456, tier: 1 });
  });

  it('EXACTLY 0.25 is still tier 1 (the exclusive bound), 0.24 is tier 2', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp = a.stats.maxHp * CONFIG.damageBands.criticalBelow; // frac === 0.25 exactly
    w.step();
    expect(smokes(w.tickEvents)[0]?.tier).toBe(1);
    const w2 = bareWorld();
    const b = place(w2, 'b', 0, 0);
    b.hp = b.stats.maxHp * 0.24;
    w2.step();
    expect(smokes(w2.tickEvents)[0]?.tier).toBe(2);
  });

  it('the world payload is exactly {k,x,y,tier} — no ship id even at the emission site', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp = a.stats.maxHp * 0.1;
    w.step();
    const sm = smokes(w.tickEvents);
    expect(sm).toHaveLength(1);
    expect(Object.keys(sm[0])).toEqual(['k', 'x', 'y', 'tier']);
  });

  it('every wounded hull emits its own puff the same tick — no cross-ship dedupe', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 1000, 0);
    a.hp = a.stats.maxHp * 0.4;
    b.hp = b.stats.maxHp * 0.2;
    w.step();
    const sm = smokes(w.tickEvents);
    expect(sm).toHaveLength(2);
    expect(sm.map((e) => e.tier).sort()).toEqual([1, 2]);
  });

  it('drones smoke identically to captains (amendment 47)', () => {
    const w = bareWorld();
    const d = w.addShip('d1', 'DRONE-01', true, 'droneSmall');
    d.state.x = 0;
    d.state.y = 0;
    d.hp = d.stats.maxHp * 0.3;
    w.step();
    expect(smokes(w.tickEvents)).toHaveLength(1);
  });

  it('a dead hull emits nothing, whatever its hp reads', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.respawnEnabled = false;
    w.sinkShip('a');
    a.hp = a.stats.maxHp * 0.1; // force a band fraction onto the wreck
    w.step();
    expect(smokes(w.tickEvents)).toHaveLength(0);
  });

  it('healing above the band silences emission the same tick (no hysteresis)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp = a.stats.maxHp * 0.4;
    w.step();
    expect(smokes(w.tickEvents)).toHaveLength(1);
    a.hp = a.stats.maxHp; // healed past the band
    for (let i = 0; i < 10; i++) {
      w.step();
      expect(smokes(w.tickEvents)).toHaveLength(0);
    }
  });
});

describe('world — wounded smoke cadence (one puff per CONFIG.smoke.puffIntervalMs per hull)', () => {
  it('puffs immediately on entering a band, then throttles to the interval', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp = a.stats.maxHp * 0.4;
    const ticksPerInterval = INTERVAL / DT; // 250 / 50 = 5
    w.step();
    expect(smokes(w.tickEvents)).toHaveLength(1); // immediate first puff
    for (let i = 1; i < ticksPerInterval; i++) {
      w.step();
      expect(smokes(w.tickEvents)).toHaveLength(0); // throttled
    }
    w.step(); // the interval has elapsed
    expect(smokes(w.tickEvents)).toHaveLength(1);
  });

  it('a stale timer from an earlier wound does NOT delay a fresh wound (healthy hulls never advance it)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp = a.stats.maxHp * 0.4;
    w.step(); // puff — timer advanced
    a.hp = a.stats.maxHp; // fully healed
    for (let i = 0; i < 20; i++) w.step(); // timer expires far in the past
    a.hp = a.stats.maxHp * 0.3; // wounded again
    w.step();
    expect(smokes(w.tickEvents)).toHaveLength(1); // immediate — no leftover wait
  });
});

describe('world — wounded smoke timer resets at life boundaries', () => {
  it('respawn resets the timer: a fresh hull never inherits the old interval remainder', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp = a.stats.maxHp * 0.3;
    w.step(); // puff — nextSmokeAt = now + INTERVAL
    expect(smokes(w.tickEvents)).toHaveLength(1);
    w.sinkShip('a');
    a.respawnAt = w.now + DT; // accelerate the respawn inside the stale window
    w.step(); // respawns this tick (full hp — silent), timer must be zeroed
    expect(isAfloat(a.lifecycle)).toBe(true);
    expect(a.nextSmokeAt).toBe(0);
    a.hp = a.stats.maxHp * 0.3; // wounded again, still inside the OLD interval
    w.step();
    expect(smokes(w.tickEvents)).toHaveLength(1); // puffs immediately — no stale wait
  });

  it('the match-start redeploy resets the timer too', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp = a.stats.maxHp * 0.3;
    w.step(); // puff — timer advanced
    expect(a.nextSmokeAt).toBeGreaterThan(0);
    w.resetForMatchStart();
    expect(a.nextSmokeAt).toBe(0);
  });
});
