// THE SUPPLY DROPS AND THE ANTI-CHEAT CHOKEPOINT (Story 12.4, Eric
// 2026-11-19, epic-12 amendment 5(f)/(g), AC 22 / 28; ported from Story
// 10.8's beaconPerception.test.ts).
//
// A charted spot is PUBLIC — it rides the Colyseus schema, never a frame —
// and a landed supply crate is an ORDINARY crate. Two properties over real
// frames, with the perception exception count untouched (the registry pin
// in perception.test.ts still names exactly six):
//
//   1. NO FRAME CARRIES A CHARTED SPOT. Before and after the landing, no
//      frame of any observer — fogged or spectator — carries anything
//      positioned on a charted spot's centre, and before the landing no
//      supply crate (`sup-` id) rides any frame at all.
//
//   2. A SUPPLY CRATE IS DELIVERED EXACTLY LIKE A MINUTE CRATE. After the
//      landing, the same world's frames with every supply crate swapped for
//      a minute-schedule crate at the same point (same kind, a `drp-` id) are
//      identical once the ids are mapped back: the id prefix is the only
//      difference perception ever sees.

import { describe, it, expect } from 'vitest';
import { CONFIG, mulberry32, sunkAt, type FrameMsg, type Vec2 } from '@salvo/shared';
import type { World } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { DT, bareWorld, captain, openCycle } from './worldFixture.js';

const S = CONFIG.supplyDrops;
const TAU = Math.PI * 2;

/** Every object anywhere in `value` that carries a numeric x and y. */
function positioned(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const v of value) positioned(v, out);
  } else if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.x === 'number' && typeof o.y === 'number') out.push(o);
    for (const v of Object.values(o)) positioned(v, out);
  }
  return out;
}

const on = (o: Record<string, unknown>, p: Vec2): boolean =>
  Math.abs((o.x as number) - p.x) < 1e-6 && Math.abs((o.y as number) - p.y) < 1e-6;

/** A world in the first cycle `intoMs` in, with captains scattered around
 *  the charted spots (inside the scatter disc and just past it) and one
 *  spectator. Returns the world and every observer id. */
function seeded(seed: number, intoMs: number): { w: World; ids: string[] } {
  const w = bareWorld(seed, { pseudonymSeed: 300 + seed, drops: false });
  const rng = mulberry32(seed);
  for (let i = 0; i < 5; i += 1) captain(w, `p${i}`, i * 600 - 1200, -3500); // parked; moved below
  const dead = captain(w, 'dead', 0, 3500);
  w.respawnEnabled = false;
  w.sinkShip('dead');
  dead.lifecycle = sunkAt(w.now); // past its sinking window: a spectator from the first frame
  openCycle(w, intoMs);
  const spots = w.supplyChart;
  expect(spots.length).toBeGreaterThan(0);
  for (let i = 0; i < 5; i += 1) {
    const spot = spots[i % spots.length];
    const a = rng.float(0, TAU);
    const d = rng.float(0, S.scatterU * 1.5);
    w.ships.get(`p${i}`)!.state = { x: spot.x + Math.cos(a) * d, y: spot.y + Math.sin(a) * d, heading: rng.float(0, TAU), speed: 0 };
  }
  return { w, ids: ['p0', 'p1', 'p2', 'p3', 'p4', dead.id] };
}

describe('supply drops — no frame carries a charted spot', () => {
  it('fogged and spectator frames alike, through the landing: nothing on a spot centre, no supply crate before it lands', () => {
    const ledger = { frames: 0, spectator: 0, supplyRows: 0 };
    for (let world = 0; world < 2; world += 1) {
      const { w, ids } = seeded(7200 + world, S.surfaceMs - 30 * DT);
      const spots = w.supplyChart;
      for (let tick = 0; tick < 60; tick += 1) {
        w.step();
        const landed = w.now >= spots[0].cycleStartT + S.surfaceMs;
        for (const id of ids) {
          const frame = buildFrame(w, id, 'active');
          ledger.frames += 1;
          if (frame.spec) ledger.spectator += 1;
          const text = JSON.stringify(frame);
          if (!landed) expect(text.includes('sup-'), `world ${world} tick ${tick} ${id}: a supply crate before the landing`).toBe(false);
          ledger.supplyRows += (frame.drops ?? []).filter((d) => d.id.startsWith('sup-')).length;
          const { you: _own, ...rest } = frame;
          for (const o of positioned(rest)) {
            for (const s of spots) expect(on(o, s), `world ${world} tick ${tick} ${id}: a ${String(o.k ?? 'row')} on a charted spot`).toBe(false);
          }
        }
      }
    }
    // NON-VACUITY: spectators were asked, and landed supply crates were delivered.
    expect(ledger.spectator).toBeGreaterThan(0);
    expect(ledger.supplyRows).toBeGreaterThan(0);
  });
});

/** A frame with every `sup-` id renamed through `alias` (the swap's map). */
function unaliased(frame: FrameMsg, alias: ReadonlyMap<string, string>): string {
  let text = JSON.stringify(frame);
  for (const [minute, sup] of alias) text = text.split(`"${minute}"`).join(`"${sup}"`);
  return text;
}

describe('supply drops — a landed supply crate is delivered exactly like a minute crate', () => {
  it('swapping every supply crate for a minute crate at the same point changes no frame but the ids', () => {
    const { w, ids } = seeded(7300, S.surfaceMs - DT);
    w.step(); // the landing tick
    const supply = [...w.drops.values()].filter((d) => d.id.startsWith('sup-'));
    expect(supply.length).toBeGreaterThan(0);
    for (const d of supply) expect(d.kind).toBe('xp');
    const real = ids.map((id) => buildFrame(w, id, 'active'));
    // The swap: the same crates, under the minute schedule's id shape.
    const alias = new Map<string, string>();
    supply.forEach((d, n) => {
      const id = `drp-99-${n}`;
      alias.set(id, d.id);
      w.drops.delete(d.id);
      w.drops.set(id, { id, x: d.x, y: d.y, kind: d.kind });
    });
    const swapped = ids.map((id) => buildFrame(w, id, 'active'));
    let delivered = 0;
    ids.forEach((id, i) => {
      expect(unaliased(swapped[i], alias), id).toBe(JSON.stringify(real[i]));
      delivered += (real[i].drops ?? []).length;
    });
    expect(delivered).toBeGreaterThan(0); // NON-VACUITY: some observer saw a crate
  });
});
