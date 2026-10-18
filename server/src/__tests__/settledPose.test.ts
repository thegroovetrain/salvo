// THE SETTLED-POSE SKIP (fix 2026-10-14 — the post-fleet-wave tick cost; see
// World.settledPoses). A hull whose candidate pose is exactly a pose the
// island resolver already returned untouched and contact-free skips the
// resolver — it would get the identical answer. These pins: a still hull far
// from land is not resolved again while a moving one is every tick; a still
// hull a hull push displaces IS resolved that tick; and a 20-hull scripted run
// on a real generated map is pose-for-pose identical with the skip on and off.

import { describe, it, expect, vi } from 'vitest';
import * as shared from '@salvo/shared';
import { CONFIG, type InputMsg, type ShipClassId, type ShipState } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { circleIsland, flatRaster } from './islandFixture.js';

// Count every resolver call per candidate-state object (the record's `state`).
const calls = new Map<ShipState, number>();
vi.mock('@salvo/shared', async (importOriginal) => {
  const real = await importOriginal<typeof shared>();
  return {
    ...real,
    resolveShipPose: (...args: Parameters<typeof real.resolveShipPose>) => {
      calls.set(args[1], (calls.get(args[1]) ?? 0) + 1);
      return real.resolveShipPose(...args);
    },
  };
});

const callsFor = (rec: ShipRecord): number => calls.get(rec.state) ?? 0;

function setInput(ship: ShipRecord, patch: Partial<InputMsg>): void {
  ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false, ...patch };
}

/** Open water but for one far rock. */
function farRockWorld(): World {
  const w = new World(3, CONFIG.map.playerCap, CONFIG.zone);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  w.map.islands.push(circleIsland(-1500, -1500, 80));
  return w;
}

function place(w: World, id: string, x: number, y: number, hull: ShipClassId = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = 0;
  rec.state.speed = 0;
  setInput(rec, {});
  return rec;
}

describe('settled-pose skip — the island resolver runs only for a hull whose pose changed', () => {
  it('a still hull far from land is not resolved again; a moving hull is resolved every tick', () => {
    const w = farRockWorld();
    const still = place(w, 'still', 0, 0);
    const moving = place(w, 'moving', 600, 0);
    setInput(moving, { throttle: 1, rudder: 0.3 });
    w.step(); // first sight of the still pose: resolved once, then cached
    calls.clear();
    for (let i = 0; i < 100; i++) w.step();
    expect(still.state.x).toBe(0);
    expect(still.state.y).toBe(0);
    expect(callsFor(still)).toBe(0);
    expect(still.landContact).toBe(false);
    expect(callsFor(moving)).toBe(100);
  });

  it('a still hull displaced by a hull push IS resolved that tick', () => {
    const w = farRockWorld();
    const still = place(w, 'still', 0, 0, 'battleship');
    for (let i = 0; i < 5; i++) w.step();
    calls.clear();
    w.step();
    expect(callsFor(still)).toBe(0); // settled
    // An overlapping hull arrives: the hull pass shoves the still hull this tick.
    place(w, 'rammer', 12, 0, 'battleship');
    w.step();
    expect(still.state.x).not.toBe(0);
    expect(callsFor(still)).toBe(1);
  });
});

describe('settled-pose skip — byte-identical poses', () => {
  interface Sample { x: number; y: number; heading: number; speed: number; land: boolean; headOn: number }

  /** 20 hulls on a real generated map for 500 ticks: every fourth sits still
   *  from the start, the rest drive scripted throttle/rudder patterns
   *  (including stops) into coasts and each other. */
  function run(skip: boolean): { samples: Sample[]; resolves: number } {
    calls.clear();
    const w = new World(0x9876, 20, CONFIG.zone);
    w.settledPoseSkip = skip;
    const ids = ['torpedoBoat', 'battleship', 'mineLayer'] as const;
    const recs: ShipRecord[] = [];
    for (let i = 0; i < 20; i++) {
      const rec = w.addShip(`c${i}`, `C${i}`, 'captain', ids[i % ids.length], undefined, undefined);
      setInput(rec, {});
      recs.push(rec);
    }
    const samples: Sample[] = [];
    for (let t = 0; t < 500; t++) {
      recs.forEach((rec, i) => {
        if (i % 4 === 0) return; // still hulls keep the neutral helm
        const phase = Math.floor(t / 60 + i) % 4;
        setInput(rec, { throttle: phase === 3 ? 0 : phase === 2 ? -1 : 1, rudder: ((i % 5) - 2) / 2 });
      });
      w.step();
      for (const r of recs) {
        samples.push({ x: r.state.x, y: r.state.y, heading: r.state.heading, speed: r.state.speed, land: r.landContact, headOn: r.landHeadOn });
      }
    }
    let resolves = 0;
    for (const n of calls.values()) resolves += n;
    return { samples, resolves };
  }

  it('20 hulls x 500 ticks: identical with and without the skip, and the skip really fired', () => {
    const slow = run(false);
    const fast = run(true);
    expect(fast.samples).toEqual(slow.samples);
    expect(fast.resolves).toBeLessThan(slow.resolves);
    expect(slow.samples.some((s) => s.land)).toBe(true); // coasts genuinely touched
  });
});
