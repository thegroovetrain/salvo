// THE PERCEPTION WORK GUARD (Story 11.2 follow-up).
//
// Story 11.2 grew every eye reach about tenfold and the 20 Hz tick went from
// ~6 ms to ~49 ms on a 16-hull match: every observer paid a fog lattice walk
// AND an every-island scan for every hull and every shell inside geometric
// reach, every tick — walks for rays an island already blocked, walks for
// rays so short no fog could hide them. This suite keeps that from coming
// back silently, and it does so by counting WORK, never by timing it (the
// weather is the storm-eye RAIN since Story 11.6 — an optical-depth gate
// `τ ≤ T`, and a hull is asked over its sight grid):
//
//   - `World.fogWalks`  — rain lattice walks started;
//   - `World.losTests`  — islands a sight ray took past the bounding circle
//                         to the core / coastline test.
//
// THE CONTRACT, per observer pass (`observe()` — what one tick costs one
// client or one bot), against an independent count of what the rules need:
//   1. a subject outside geometric reach costs NOTHING — no walk, no island;
//   2. a rain walk is paid only for a question whose answer rain can change:
//      the subject in reach, the ray island-clear, and the ray longer than T
//      (a shorter ray's whole length at full density is still under the
//      threshold) — and a HULL, asked over its sight grid, costs at most one
//      walk per grid point per pass however many rows ask about it;
//   3. a sight ray asks the coastline only of islands whose bounding circle
//      it actually meets.
// The bounds are sums over this scene's own subjects, computed here from the
// rules (the reference island scan, the reach facts) — never a pinned count.
// The scene must also be DISCRIMINATING: it holds in-reach subjects that are
// island-blocked or nearer than T, so a pass that walked every in-reach ray
// (the regression) breaks bound 2 here.

import { describe, it, expect } from 'vitest';
import { CONFIG, hullEnvelope, mulberry32, pointInIsland, segCircleHit, type Vec2 } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { observe } from '../game/perception.js';
import { hullSightOf, losClear, sightOf } from '../game/signals.js';
import { RAIN_T, stormFrame } from './rainFixture.js';

const HULLS = CONFIG.map.playerCap; // a full lobby
const SHELLS = 200;
/** Walks one hull question may cost: one per point of its sight grid. */
const GRID = CONFIG.fog.hullGridCols * CONFIG.fog.hullGridRows;

/** The most island-line questions one pass asks about one hull: the `contact`
 *  row, the `plain` row's "not already a full contact" re-ask, and the
 *  `plain` row's own. */
const HULL_ASKS = 3;
/** ...and about one projectile: its reveal gate, once (the reveal row for an
 *  unseen one, the per-visit clear step for a seen one — never both). */
const SHELL_ASKS = 1;

function onWater(w: World, p: Vec2): boolean {
  return w.map.islands.every((isle) => !pointInIsland(p, isle));
}

/** A point of the ring of radius `r`, walked outward off any land. */
function ringPoint(w: World, r: number, k: number, n: number): Vec2 {
  const a = (k / n) * 6.283185307179586;
  for (let grow = 0; grow < 400; grow += 10) {
    const p = { x: Math.cos(a) * (r + grow), y: Math.sin(a) * (r + grow) };
    if (onWater(w, p)) return p;
  }
  throw new Error('no water on this bearing');
}

function scene(seed: number): { w: World; ids: string[] } {
  const w = new World(seed, HULLS);
  // The real storm: rain bands with clear water between and a clear eye.
  w.setFogFrameForTest(stormFrame(w));
  const ids: string[] = [];
  // Every hull inside every other's plain-hull reach: a ring a third of that reach across.
  const ringR = CONFIG.vision.hullSight / 3;
  for (let k = 0; k < HULLS; k++) {
    const id = `h${k}`;
    const rec = w.addShip(id, id.toUpperCase(), 'captain', undefined, undefined, undefined);
    Object.assign(rec.state, ringPoint(w, ringR, k, HULLS), { heading: 0, speed: 0 });
    ids.push(id);
  }
  // Shells in flight all over the ring's disc — some a few hulls' length from
  // an observer (inside the free radius), some across the fleet.
  const rng = mulberry32(seed ^ 0x5e11);
  for (let n = 0; n < SHELLS; n++) {
    const near = w.ships.get(ids[n % HULLS])!.state;
    const spread = n % 3 === 0 ? 150 : ringR;
    const x = (n % 3 === 0 ? near.x : 0) + (rng.next() * 2 - 1) * spread;
    const y = (n % 3 === 0 ? near.y : 0) + (rng.next() * 2 - 1) * spread;
    const dir = rng.next() * 6.283185307179586;
    w.shells.set(`s${n}`, {
      id: `s${n}`, ownerId: ids[(n + 1) % HULLS], x, y,
      vx: Math.cos(dir) * CONFIG.gun.shellSpeed, vy: Math.sin(dir) * CONFIG.gun.shellSpeed,
      distLeft: 5000, bornAt: w.now, kind: 'shell', family: 'cannon',
      damage: CONFIG.gun.damage, hitRadius: CONFIG.gun.shellRadius,
      targetX: null, targetY: null, burstRadius: 0, contactDamage: CONFIG.gun.damage, hits: CONFIG.gun.hits,
    });
  }
  return { w, ids };
}

interface Need {
  inReach: number; // questions whose subject is inside the reach asked
  decidable: number; // ...of which rain can change the answer
  walks: number; // the walks those may cost (bound 2): one per point ray, one per grid point per hull
  islands: number; // island circles the in-reach rays meet, × asks (bound 3)
}

/** Can rain decide a ray of length `d`? Not when its whole length at density 1 is still under T. */
const rainCanDecide = (d: number): boolean => d > RAIN_T - 1e-3;

/** The island half of ONE eye question — "is `p` held at `reach`?" — by the
 *  rules; returns whether the question is in reach at all (bound 1: outside
 *  reach it costs nothing). */
function islandsOf(w: World, me: ShipRecord, p: Vec2, reach: number, asks: number, need: Need): boolean {
  const d = Math.hypot(p.x - me.state.x, p.y - me.state.y);
  if (!(d <= reach)) return false;
  need.inReach += 1;
  need.islands += asks * w.map.islands.filter((isle) => segCircleHit(me.state, p, isle, isle.r) !== null).length;
  return true;
}

/** What a POINT question may cost: its islands, and one walk when rain can decide an island-clear ray. */
function pointQuestion(w: World, me: ShipRecord, p: Vec2, reach: number, asks: number, need: Need): void {
  if (!islandsOf(w, me, p, reach, asks, need)) return;
  const d = Math.hypot(p.x - me.state.x, p.y - me.state.y);
  if (!rainCanDecide(d) || !losClear(me.state, p, w.map.islands)) return;
  need.decidable += 1;
  need.walks += 1;
}

/** What a HULL may cost one pass: the island tests of the contact row, the
 *  plain row's re-ask and the plain row's own — and ONE grid of walks, when
 *  the hull is inside the outer reach on an island-clear center ray and far
 *  enough that rain can decide some grid point (the rows share the answer). */
function hullQuestion(w: World, me: ShipRecord, other: ShipRecord, need: Need): void {
  islandsOf(w, me, other.state, sightOf(me, w.now), 2, need);
  if (!islandsOf(w, me, other.state, hullSightOf(me, w.now), HULL_ASKS - 2, need)) return;
  const d = Math.hypot(other.state.x - me.state.x, other.state.y - me.state.y);
  const hull = hullEnvelope(other.hullId).hull;
  const farthestPoint = d + Math.hypot(hull.length, hull.beam) / 2;
  if (!rainCanDecide(farthestPoint) || !losClear(me.state, other.state, w.map.islands)) return;
  need.decidable += 1;
  need.walks += GRID;
}

/** Everything one fogged pass of `me` may ask, by the rules. */
function needOf(w: World, me: ShipRecord): Need {
  const need: Need = { inReach: 0, decidable: 0, walks: 0, islands: 0 };
  for (const other of w.ships.values()) {
    if (other.id !== me.id) hullQuestion(w, me, other, need);
  }
  for (const shell of w.shells.values()) {
    if (shell.ownerId === me.id) continue; // the owner's gate never looks
    pointQuestion(w, me, shell, CONFIG.vision.shellSight, SHELL_ASKS, need);
  }
  return need;
}

function passCost(w: World, id: string): { walks: number; islands: number } {
  const walks = w.fogWalks;
  const islands = w.losTests;
  observe(w, id);
  return { walks: w.fogWalks - walks, islands: w.losTests - islands };
}

describe('perception work per observer pass — bounded by what the rules need, never by entity products', () => {
  it('a full lobby in mutual reach with 200 shells in flight: every pass walks rain only where rain can decide and asks only the islands its rays meet — on the first pass (every shell unseen) and on the next (the seen ones re-checked)', () => {
    for (const seed of [7, 21]) {
      const { w, ids } = scene(seed);
      const total: Need = { inReach: 0, decidable: 0, walks: 0, islands: 0 };
      for (let pass = 0; pass < 2; pass++) {
        for (const id of ids) {
          const need = needOf(w, w.ships.get(id)!);
          const cost = passCost(w, id);
          expect(cost.walks, `seed ${seed} pass ${pass} ${id}: fog walks`).toBeLessThanOrEqual(need.walks);
          expect(cost.islands, `seed ${seed} pass ${pass} ${id}: island tests`).toBeLessThanOrEqual(need.islands);
          total.inReach += need.inReach;
          total.decidable += need.decidable;
          total.walks += need.walks;
          total.islands += need.islands;
        }
      }
      // THE SCENE DISCRIMINATES: many in-reach questions are decided without
      // rain (an island in the way, or too close for rain to matter), so a
      // pass that walked every in-reach ray would break the bound above; and
      // the scene really does exercise both kinds of work.
      expect(total.inReach).toBeGreaterThan(total.decidable);
      expect(total.walks).toBeGreaterThan(0);
      expect(total.islands).toBeGreaterThan(0);
    }
  });

  it('subjects outside every reach cost nothing, however many there are: an eye far from the fleet asks no island and walks no rain', () => {
    const { w, ids } = scene(7);
    // Move one hull out past the plain-hull reach of every other hull and
    // every shell (the fleet sits within a third of that reach of the centre).
    const far = w.ships.get(ids[0])!;
    const out = CONFIG.vision.hullSight * 1.5;
    Object.assign(far.state, { x: out, y: 0 });
    const need = needOf(w, far);
    expect(need.inReach).toBe(0); // the scene: nothing is in reach of it
    expect(w.shells.size).toBe(SHELLS);
    expect(passCost(w, far.id)).toEqual({ walks: 0, islands: 0 });
  });
});
