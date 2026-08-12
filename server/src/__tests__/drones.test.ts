// Target-drone controller (game/drones.ts) + the drone-aware match win check
// (game/match.ts). Drones are ordinary ships driven only through the normal
// input path: the controller submits a sanitized InputMsg per drone per tick and
// NEVER fires. Steering is dumb-but-safe: waypoint sailing with island/boundary
// avoidance and a zone-recovery override. On the match side (amendment 4, Eric
// ruling 2026-08-11): DRONES NO LONGER GATE THE WIN — a lone afloat captain wins
// immediately however many drones are still sailing — while two afloat captains
// keep fighting through a full drone fill, drones can still hold placements, and
// a drone can never win.

import { describe, it, expect } from 'vitest';
import { CONFIG, dist, isAfloat, pointPolygonDistance, type ZoneTimeline } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { Match, type MatchHooks, type MatchTimings } from '../game/match.js';
import { circleIsland } from './islandFixture.js';

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
  it('never emits a click (fireSeq stays 0), always aim=0 / aimDist=0 / slot=0, over 1000 ticks', () => {
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
        expect(inp!.slot).toBe(0);
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
    w.map.islands.push(circleIsland(120, 0, 80), circleIsland(-200, 150, 60));
    const ids = ['a', 'b', 'c', 'd'];
    for (const id of ids) addDrone(w, id);
    for (let t = 0; t < 500; t++) {
      w.step();
      for (const id of ids) {
        const wp = w.drones.waypointOf(id);
        if (!wp) continue;
        for (const isle of w.map.islands) {
          expect(pointPolygonDistance(wp, isle.poly)).toBeGreaterThan(0); // never ashore
        }
      }
    }
  });
});

describe('drones — avoidance', () => {
  it('never ends a tick inside an island (property over several seeds)', () => {
    for (const seed of [1, 2, 3, 7, 42, 99]) {
      const w = bareWorld(seed);
      w.map.islands.push(circleIsland(100, 0, 70), circleIsland(-120, -80, 55));
      const ids = ['a', 'b', 'c', 'd', 'e'];
      for (const id of ids) addDrone(w, id);
      for (let t = 0; t < 400; t++) {
        w.step();
        for (const id of ids) {
          const s = w.ships.get(id)!;
          for (const isle of w.map.islands) {
            expect(pointPolygonDistance(s.state, isle.poly)).toBeGreaterThan(0); // never ashore
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
  it('heads for the LIVE ring center when caught outside the safe ring', () => {
    // Fast zone: fully closed on a small OFFSET terminal ring within a few
    // ticks (offsetCap 1 exercises the Story 3.1 offset-center steering).
    const w = bareWorld(9, { beatMs: 1, ringSteps: [1 / 3, 2 / 3], offsetCap: 1, terminalSightFactor: 1 });
    const d = addDrone(w, 'd');
    w.startZone();
    for (let t = 0; t < 10; t++) w.step(); // zone now tiny
    const ring = w.zoneLiveRing;
    const ringDist = (s: ShipRecord): number => Math.hypot(s.state.x - ring.cx, s.state.y - ring.cy);
    // Strand the drone far outside the safe ring, pointing away from it.
    d.state.x = ring.cx + w.map.radius * 0.5;
    d.state.y = ring.cy;
    d.state.heading = 0;
    d.state.speed = 0;
    expect(ringDist(d)).toBeGreaterThan(ring.r);
    const before = ringDist(d);
    // Slow-turning hull with outward momentum: allow the U-turn to complete.
    for (let t = 0; t < 300; t++) w.step();
    expect(ringDist(d)).toBeLessThan(before - 100); // measurably converged on the ring
  });
});

// --- match integration: drones fill, can't win, hold placements ---------------

interface MatchCtx {
  w: World;
  m: Match;
  calls: string[];
  results: unknown[];
}

/**
 * DEV-ONLY timings that let a SOLO captain start the countdown and fill with
 * drones. `minHumans: 1` is unreachable in production — CONFIG.match.minHumans
 * is 2 and sanitizeRoomOptions gates matchOverride behind HC_DEV_OPTIONS —
 * which is precisely the premise amendment 4 rests on. Kept so the ruling can
 * be pinned in the one configuration where it is observable at activation.
 */
const SOLO_TIMINGS: MatchTimings = { countdownMs: 100, resultsMs: 200, joinWindowMs: 0, minHumans: 1 };

/** Production timings: the countdown needs CONFIG.match.minHumans (2) captains. */
const DUO_TIMINGS: MatchTimings = { countdownMs: 100, resultsMs: 200, joinWindowMs: 0 };

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

function buildMatch(ids: string[], timings: MatchTimings, seed: number): MatchCtx {
  const w = bareWorld(seed);
  const calls: string[] = [];
  const results: unknown[] = [];
  const m = new Match(w, timings, fillingHooks(w, calls, results));
  for (const id of ids) {
    w.addShip(id, id.toUpperCase());
    m.notifyRosterChanged();
  }
  return { w, m, calls, results };
}

/** One captain, dev minHumans=1 -> countdown. Finishes AT activation now. */
const soloMatch = (seed = 1): MatchCtx => buildMatch(['human'], SOLO_TIMINGS, seed);
/** Two captains — the production shape (minHumans 2) -> countdown. */
const duoMatch = (seed = 1): MatchCtx => buildMatch(['human', 'rival'], DUO_TIMINGS, seed);

function step(ctx: MatchCtx, ticks = 1): void {
  for (let i = 0; i < ticks; i++) {
    ctx.w.step();
    ctx.m.update();
  }
}

/** Run the countdown out. Leaves whatever phase the win check settled on —
 *  'active' for a duo, 'finished' for a solo captain (amendment 4). */
function runCountdown(ctx: MatchCtx): void {
  for (let i = 0; i < 100 && ctx.m.phase === 'countdown'; i++) step(ctx);
  expect(ctx.m.phase).not.toBe('countdown');
}

function activate(ctx: MatchCtx): void {
  runCountdown(ctx);
  expect(ctx.m.phase).toBe('active');
}

function afloatDroneIds(ctx: MatchCtx): string[] {
  return [...ctx.w.ships.values()].filter((s) => s.isDrone && isAfloat(s.lifecycle)).map((s) => s.id);
}

describe('match — drone fill + win exclusion', () => {
  it('fills exactly fillTo - humans drones at activation', () => {
    const ctx = duoMatch();
    activate(ctx);
    expect(ctx.calls).toContain('fill');
    expect(ctx.w.ships.size).toBe(CONFIG.match.fillTo);
    let drones = 0;
    for (const s of ctx.w.ships.values()) if (s.isDrone) drones += 1;
    expect(drones).toBe(CONFIG.match.fillTo - 2); // fillTo - humans
  });

  // THE RULING (amendment 4). This test FAILS against the old
  // `aliveDroneCount() > 0` gate, which held the match open at 'active'.
  it('a lone afloat captain wins IMMEDIATELY with every drone still afloat', () => {
    const ctx = soloMatch();
    runCountdown(ctx);
    expect(ctx.calls).toContain('fill'); // the fill seam still ran
    // The drones are genuinely in the water and genuinely afloat — this is not
    // "the field was empty", it is "drones no longer gate the win".
    expect(afloatDroneIds(ctx)).toHaveLength(CONFIG.match.fillTo - 1);
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('human');
    expect(ctx.m.placements.get('human')).toBe(1);
  });

  // THE PRODUCTION-SAFETY ARGUMENT the ruling rests on: CONFIG.match.minHumans
  // is 2, so a live match always opens with two captains, and the win check
  // stays quiet through a full drone fill until one of them is out.
  it('two afloat captains + a full drone fill: NO win fires (minHumans 2)', () => {
    const ctx = duoMatch();
    activate(ctx);
    expect(afloatDroneIds(ctx)).toHaveLength(CONFIG.match.fillTo - 2);
    step(ctx, 20);
    expect(ctx.m.phase).toBe('active');
    expect(ctx.calls).not.toContain('results');
    expect(ctx.results).toHaveLength(0);
  });

  it('the last captain wins once the other is sunk; drones hold placements', () => {
    const ctx = duoMatch();
    activate(ctx);
    const drones = afloatDroneIds(ctx);
    for (const id of drones) {
      ctx.w.sinkShip(id, 'human');
      step(ctx);
      expect(ctx.m.phase).toBe('active'); // two captains afloat: still fighting
    }
    ctx.w.sinkShip('rival', 'human');
    step(ctx);
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
    const ctx = duoMatch();
    activate(ctx);
    const drones = afloatDroneIds(ctx);
    // Sink one drone, then BOTH captains on the same tick (mutual destruction).
    // Drones survive it; the latest-sunk human still takes the win.
    ctx.w.sinkShip(drones[0], 'human');
    step(ctx);
    expect(ctx.m.phase).toBe('active'); // both captains afloat: no check trips
    ctx.w.sinkShip('rival'); // storm-style, unattributed
    ctx.w.sinkShip('human'); // same tick, sunk after rival
    step(ctx);
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('human'); // NOT a surviving drone
    expect(ctx.m.placements.get('human')).toBe(1);
    expect(afloatDroneIds(ctx).length).toBeGreaterThan(0); // drones outlived the match
  });
});
