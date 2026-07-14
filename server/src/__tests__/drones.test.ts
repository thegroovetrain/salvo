// Target-drone controller (game/drones.ts) + the drone-aware match win check
// (game/match.ts). Drones are ordinary ships driven only through the normal
// input path: the controller submits a sanitized InputMsg per drone per tick and
// NEVER fires. Steering is dumb-but-safe: waypoint sailing with island/boundary
// avoidance and a zone-recovery override. On the match side, a lone human + 5
// drones must NOT insta-finish, drones can hold placements, and a drone can
// never win.

import { describe, it, expect } from 'vitest';
import { CONFIG, dist, type ZoneTimeline } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { Match, type MatchHooks, type MatchTimings } from '../game/match.js';

const DT = CONFIG.tick.simDtMs;

/** A bare, island-free world unless the test adds islands back. */
function bareWorld(seed = 1, zone: ZoneTimeline = CONFIG.zone): World {
  const w = new World(seed, CONFIG.match.fillTo, zone);
  w.map.islands.length = 0;
  return w;
}

function addDrone(w: World, id: string): ShipRecord {
  return w.addShip(id, id.toUpperCase(), true);
}

function centerDist(s: ShipRecord): number {
  return Math.hypot(s.state.x, s.state.y);
}

describe('drones — inputs are the only interface', () => {
  it('never emits a click (fireSeq stays 0), always aim=0 / aimDist=0 / weapon=0, over 1000 ticks', () => {
    const w = bareWorld(7);
    const ids = ['d1', 'd2', 'd3'];
    for (const id of ids) addDrone(w, id);
    for (let t = 0; t < 1000; t++) {
      w.step();
      for (const id of ids) {
        const inp = w.inputs.get(id);
        expect(inp).toBeDefined();
        expect(inp!.fireSeq).toBe(0);
        expect(inp!.aimDist).toBe(0);
        expect(inp!.aim).toBe(0);
        expect(inp!.weapon).toBe(0);
      }
    }
    // Structural corollary: with no human firing, no drone ever spawns ordnance.
    expect(w.shells.size).toBe(0);
    expect(w.mines.size).toBe(0);
  });

  it('drives ships through submitInput (ack seq advances, ship actually moves)', () => {
    const w = bareWorld(3);
    const d = addDrone(w, 'd');
    const start = { x: d.state.x, y: d.state.y };
    for (let t = 0; t < 40; t++) w.step();
    expect(d.lastAckSeq).toBeGreaterThan(0);
    expect(dist(d.state, start)).toBeGreaterThan(10); // it sailed somewhere
  });

  it('a dead drone submits no input (idles until removed/respawned)', () => {
    const w = bareWorld(5);
    addDrone(w, 'd');
    w.step();
    const seqAlive = w.inputs.get('d')!.seq;
    w.sinkShip('d');
    // While dead (respawn pending) the controller submits nothing new.
    for (let t = 0; t < 3; t++) w.step();
    expect(w.inputs.get('d')!.seq).toBe(seqAlive);
  });
});

describe('drones — waypoint sailing', () => {
  it('reaches its waypoint neighborhood and retargets to a new one', () => {
    const w = bareWorld(11);
    const d = addDrone(w, 'd');
    w.step(); // controller picks the first waypoint
    const first = w.drones.waypointOf('d');
    expect(first).not.toBeNull();

    let retargeted = false;
    let closedToReach = false;
    for (let t = 0; t < 4000 && !retargeted; t++) {
      const before = w.drones.waypointOf('d')!;
      if (dist(d.state, before) < 60) closedToReach = true;
      w.step();
      const after = w.drones.waypointOf('d')!;
      if (after.x !== before.x || after.y !== before.y) retargeted = true;
    }
    expect(closedToReach).toBe(true); // it actually approached the waypoint
    expect(retargeted).toBe(true); // and then picked a fresh one
  });

  it('never picks a waypoint that sits inside an island', () => {
    const w = bareWorld(21);
    w.map.islands.push({ x: 120, y: 0, r: 80 }, { x: -200, y: 150, r: 60 });
    const ids = ['a', 'b', 'c', 'd'];
    for (const id of ids) addDrone(w, id);
    for (let t = 0; t < 500; t++) {
      w.step();
      for (const id of ids) {
        const wp = w.drones.waypointOf(id);
        if (!wp) continue;
        for (const isle of w.map.islands) {
          expect(dist(wp, isle)).toBeGreaterThan(isle.r);
        }
      }
    }
  });
});

describe('drones — avoidance', () => {
  it('never ends a tick inside an island (property over several seeds)', () => {
    for (const seed of [1, 2, 3, 7, 42, 99]) {
      const w = bareWorld(seed);
      w.map.islands.push({ x: 100, y: 0, r: 70 }, { x: -120, y: -80, r: 55 });
      const ids = ['a', 'b', 'c', 'd', 'e'];
      for (const id of ids) addDrone(w, id);
      for (let t = 0; t < 400; t++) {
        w.step();
        for (const id of ids) {
          const s = w.ships.get(id)!;
          for (const isle of w.map.islands) {
            expect(dist(s.state, isle)).toBeGreaterThan(isle.r);
          }
        }
      }
    }
  });

  it('stays inside the map boundary while free-sailing', () => {
    const w = bareWorld(33);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (const id of ids) addDrone(w, id);
    for (let t = 0; t < 800; t++) {
      w.step();
      for (const id of ids) {
        expect(centerDist(w.ships.get(id)!)).toBeLessThanOrEqual(w.map.radius + 1e-6);
      }
    }
  });

  it('turns back toward center when parked out near the boundary', () => {
    const w = bareWorld(4);
    const d = addDrone(w, 'd');
    // Force it out near the edge, pointing straight OUT.
    d.state.x = w.map.radius - 30;
    d.state.y = 0;
    d.state.heading = 0; // +x = outward
    d.state.speed = 0;
    const before = centerDist(d);
    for (let t = 0; t < 120; t++) w.step();
    expect(centerDist(d)).toBeLessThan(before); // it worked its way back inward
  });
});

describe('drones — zone recovery', () => {
  it('heads for the center when caught outside the safe zone', () => {
    // Fast zone: fully closed to 10% within a few ticks.
    const w = bareWorld(9, { grace: 0, shrinkDuration: 100, endRadiusFraction: 0.1 });
    const d = addDrone(w, 'd');
    w.startZone();
    for (let t = 0; t < 10; t++) w.step(); // zone now tiny
    // Strand the drone far outside the safe ring, pointing outward.
    d.state.x = w.map.radius * 0.85;
    d.state.y = 0;
    d.state.heading = 0;
    d.state.speed = 0;
    expect(centerDist(d)).toBeGreaterThan(w.zoneRadius);
    const before = centerDist(d);
    // Slow-turning hull with outward momentum: allow the U-turn to complete.
    for (let t = 0; t < 300; t++) w.step();
    expect(centerDist(d)).toBeLessThan(before - 100); // measurably converged inward
  });
});

// --- match integration: drones fill, can't win, hold placements ---------------

interface MatchCtx {
  w: World;
  m: Match;
  calls: string[];
  results: unknown[];
}

/** Timings that let a SOLO human start the countdown and fill with drones. */
const SOLO_TIMINGS: MatchTimings = { countdownMs: 100, resultsMs: 200, minHumans: 1 };

/** A hooks impl whose fillToCapacity tops the world up to CONFIG.match.fillTo. */
function fillingHooks(w: World, calls: string[], results: unknown[]): MatchHooks {
  let filled = 0;
  return {
    lock: () => calls.push('lock'),
    unlock: () => calls.push('unlock'),
    fillToCapacity: () => {
      const need = CONFIG.match.fillTo - w.ships.size;
      for (let i = 0; i < need; i++) w.addShip(`drone-${++filled}`, `DRONE-0${filled}`, true);
      calls.push('fill');
    },
    broadcastResults: (msg) => results.push(msg),
    disconnect: () => calls.push('disconnect'),
  };
}

function soloMatch(seed = 1): MatchCtx {
  const w = bareWorld(seed);
  const calls: string[] = [];
  const results: unknown[] = [];
  const m = new Match(w, SOLO_TIMINGS, fillingHooks(w, calls, results));
  w.addShip('human', 'HUMAN');
  m.notifyRosterChanged(); // solo -> countdown (minHumans=1)
  return { w, m, calls, results };
}

function step(ctx: MatchCtx, ticks = 1): void {
  for (let i = 0; i < ticks; i++) {
    ctx.w.step();
    ctx.m.update();
  }
}

function activate(ctx: MatchCtx): void {
  for (let i = 0; i < 100 && ctx.m.phase !== 'active'; i++) step(ctx);
  expect(ctx.m.phase).toBe('active');
}

describe('match — drone fill + win exclusion', () => {
  it('fills exactly fillTo - humans drones at activation', () => {
    const ctx = soloMatch();
    activate(ctx);
    expect(ctx.calls).toContain('fill');
    expect(ctx.w.ships.size).toBe(CONFIG.match.fillTo);
    let drones = 0;
    for (const s of ctx.w.ships.values()) if (s.isDrone) drones += 1;
    expect(drones).toBe(CONFIG.match.fillTo - 1);
  });

  it('does NOT insta-finish a lone human against fresh drones', () => {
    const ctx = soloMatch();
    activate(ctx);
    // The bug this guards: aliveHumans===1 at activation would end the match.
    step(ctx, 20);
    expect(ctx.m.phase).toBe('active');
    expect(ctx.calls).not.toContain('results');
  });

  it('the lone human wins once every drone is sunk; drones hold placements', () => {
    const ctx = soloMatch();
    activate(ctx);
    const drones = [...ctx.w.ships.values()].filter((s) => s.isDrone).map((s) => s.id);
    for (const id of drones) {
      ctx.w.sinkShip(id, 'human');
      step(ctx);
    }
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('human');
    expect(ctx.m.placements.get('human')).toBe(1);
    // Every drone placed (2..fillTo); none placed 1st.
    for (const id of drones) {
      const p = ctx.m.placements.get(id);
      expect(p).toBeGreaterThan(1);
    }
    const msg = ctx.results[0] as { winnerId: string; rows: { id: string }[] };
    expect(msg.winnerId).toBe('human');
    expect(msg.rows.some((r) => r.id === drones[0])).toBe(true); // drones in results
  });

  it('a drone can NEVER win — human sinking last still wins', () => {
    const ctx = soloMatch();
    activate(ctx);
    const drones = [...ctx.w.ships.values()].filter((s) => s.isDrone).map((s) => s.id);
    // Sink one drone, then the human. Drones survive; human is the LAST human.
    ctx.w.sinkShip(drones[0], 'human');
    step(ctx);
    expect(ctx.m.phase).toBe('active'); // drones still afloat, but no human check trips yet
    ctx.w.sinkShip('human'); // storm-style, unattributed
    step(ctx);
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('human'); // NOT a surviving drone
    expect(ctx.m.placements.get('human')).toBe(1);
  });
});
