// WAKE DRAFTING on the server (Story 8.19, Eric rulings 2026-09-30, epic-8
// amendments 151–155) — world-level tests for the per-tick `ShipRecord.draft`
// stamp and its fold into stepShips. The lift FUNCTION itself (`draftLift`,
// the I/O matrix) is pinned in shared; this file pins what the WORLD does
// with it: which water it reads (every ribbon but the hull's own and any
// torpedo's, one tick old), who is lifted (afloat AND sinking), the pinned
// fold order, the life-boundary resets, and that draft = 0 changes nothing.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  HOOK_REGISTRY,
  applySinkingDecel,
  boostedKinematics,
  draftLift,
  draftedKinematics,
  hookKinematics,
  isAfloat,
  isSinking,
  isSunk,
  slowedKinematics,
  stepShip,
  type HullId,
  type WakeRibbon,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { flatRaster } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;
const LIFT = CONFIG.wake.draft.lift;

/** World with no islands and a flat raster (geometry stays out of the way). */
function bareWorld(seed = 1): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull: HullId = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

interface Helm { throttle: number; rudder?: number }

/** One tick with the given helm per ship id (ships not named hold their last input). */
function tick(w: World, helms: Record<string, Helm>): void {
  for (const [id, h] of Object.entries(helms)) {
    const seq = (w.ships.get(id)!.lastAckSeq ?? 0) + 1;
    w.submitInput(id, { seq, throttle: h.throttle, rudder: h.rudder ?? 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false });
  }
  w.step();
}

/** Midpoint and direction of a ribbon's NEWEST segment (the freshest water). */
function newestSegment(r: WakeRibbon): { x: number; y: number; heading: number } {
  expect(r.count).toBeGreaterThanOrEqual(2);
  const b = (r.head + r.count - 1) % r.cap;
  const a = (r.head + r.count - 2) % r.cap;
  return {
    x: (r.xs[a] + r.xs[b]) / 2,
    y: (r.ys[a] + r.ys[b]) / 2,
    heading: Math.atan2(r.ys[b] - r.ys[a], r.xs[b] - r.xs[a]),
  };
}

/** Teleport a hull to a pose, stopped (its own ribbon is irrelevant: own water never lifts). */
function setPose(s: ShipRecord, x: number, y: number, heading: number): void {
  s.state.x = x;
  s.state.y = y;
  s.state.heading = heading;
  s.state.speed = 0;
}

/** The lift stepShips WILL stamp on the next step, over `ribbons` only
 *  (computed before the step: pre-step pose, the step's clock). */
function liftNext(w: World, s: ShipRecord, ribbons: readonly WakeRibbon[], own: WakeRibbon | null = s.wake): number {
  return draftLift(ribbons, own, s.state.x, s.state.y, s.state.heading, w.now + DT, CONFIG.wake.draft);
}

describe('wake drafting — the stepShips stamp and fold (Story 8.19)', () => {
  it('(a) a same-class rider on a leader\'s trail drafts above its rated cap, never above cap + cap × 0.05, and falls back to the cap once out of the lane', () => {
    const w = bareWorld();
    const L = place(w, 'L', 0, 0);
    const R = place(w, 'R', -80, 0);
    const cap = R.stats.kinematics.maxSpeed;
    const ceiling = cap + cap * LIFT;
    let drafted = 0;
    let top = 0;
    for (let i = 0; i < 160; i++) {
      tick(w, { L: { throttle: 1 }, R: { throttle: 1 } });
      expect(R.state.speed).toBeLessThanOrEqual(ceiling);
      expect(R.draft).toBeGreaterThanOrEqual(0);
      expect(R.draft).toBeLessThanOrEqual(LIFT);
      expect(L.draft).toBe(0); // the leader sails clean water
      if (R.draft > 0) drafted += 1;
      top = Math.max(top, R.state.speed);
    }
    expect(drafted).toBeGreaterThan(50); // from the tick the rider first crosses the leader's start line
    expect(top).toBeGreaterThan(cap);
    expect(L.state.speed).toBe(cap);
    // Leave the lane: hard over, then straight — the lift dies and the hull
    // decays back to its rated cap at class decel.
    for (let i = 0; i < 40; i++) tick(w, { L: { throttle: 1 }, R: { throttle: 1, rudder: 1 } });
    for (let i = 0; i < 80; i++) tick(w, { L: { throttle: 1 }, R: { throttle: 1 } });
    expect(R.draft).toBe(0);
    expect(R.state.speed).toBe(cap);
  });

  it('(b) ONE TICK OLD: on the tick a leader\'s first segment comes into existence the rider\'s draft is still 0; it first rises on the next tick', () => {
    const w = bareWorld();
    const L = place(w, 'L', 0, 0);
    const R = place(w, 'R', 2, 4); // inside the first segment's lane, heading the same way, stopped
    let n = 0;
    while (L.wake.count < 2) {
      expect(n++).toBeLessThan(200);
      tick(w, { L: { throttle: 1 }, R: { throttle: 0 } });
      // Every tick up to and INCLUDING tick N (the one whose sampleWakes
      // appended the second sample) read a ribbon with no segment.
      expect(R.draft).toBe(0);
    }
    expect(L.wake.count).toBe(2);
    tick(w, { L: { throttle: 1 }, R: { throttle: 0 } }); // tick N + 1
    expect(R.draft).toBeGreaterThan(0);
  });

  it('(c) overlapping wakes take the MAX, never the sum', () => {
    const w = bareWorld();
    const A = place(w, 'A', 0, 0);
    const B = place(w, 'B', -30, 5);
    const R = place(w, 'R', -900, 0);
    for (let i = 0; i < 80; i++) tick(w, { A: { throttle: 1 }, B: { throttle: 1 } });
    const s = newestSegment(B.wake);
    setPose(R, s.x - 20, 2.5, 0); // inside both 9 u lanes (y = 0 and y = 5)
    const a = liftNext(w, R, [A.wake]);
    const b = liftNext(w, R, [B.wake]);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    tick(w, { A: { throttle: 1 }, B: { throttle: 1 }, R: { throttle: 0 } });
    expect(Object.is(R.draft, Math.max(a, b))).toBe(true);
    expect(R.draft).toBeLessThan(a + b);
  });

  it('(d) a hull\'s OWN attached ribbon never lifts it — even sailing right along its own freshest water', () => {
    const w = bareWorld();
    const S = place(w, 'S', 0, 0);
    let ownWouldLift = 0;
    for (let i = 0; i < 300; i++) {
      if (liftNext(w, S, w.wakeRibbons, null) > 0) ownWouldLift += 1;
      tick(w, { S: { throttle: 1, rudder: i < 100 ? 0 : 1 } }); // straight, then circling back over its trail
      expect(S.draft).toBe(0);
    }
    expect(ownWouldLift).toBeGreaterThan(0); // non-vacuous: the water WAS there
  });

  it('(e) torpedo water never lifts', () => {
    const w = bareWorld();
    place(w, 'o', -800, 400);
    const R = place(w, 'R', -800, -400);
    w.shells.set('fish', {
      id: 'fish', ownerId: 'o', x: 300, y: 0,
      vx: CONFIG.torpedo.speed, vy: 0, distLeft: 300, bornAt: w.now, kind: 'torp', family: null,
      damage: CONFIG.torpedo.damage, hitRadius: CONFIG.torpedo.hitRadius,
      targetX: null, targetY: null, burstRadius: 0, contactDamage: CONFIG.torpedo.damage, hits: CONFIG.torpedo.hits,
    });
    for (let i = 0; i < 20; i++) tick(w, { R: { throttle: 0 } });
    const fishWater = w.torpWakes.get('fish')!;
    expect(fishWater.count).toBeGreaterThan(2);
    const s = newestSegment(fishWater);
    setPose(R, s.x, s.y + 2, s.heading);
    // Non-vacuity: the same water, NOT flagged torpedo, would lift.
    expect(liftNext(w, R, [{ ...fishWater, torp: false }])).toBeGreaterThan(0);
    tick(w, { R: { throttle: 0 } });
    expect(R.draft).toBe(0);
  });

  it('(f) leftover water lifts: a wreck\'s attached ribbon', () => {
    const w = bareWorld();
    w.respawnEnabled = false;
    const L = place(w, 'L', 0, 0);
    const R = place(w, 'R', -900, 0);
    for (let i = 0; i < 60; i++) tick(w, { L: { throttle: 1 } });
    w.sinkShip('L');
    let n = 0;
    while (!isSunk(L.lifecycle)) {
      expect(n++).toBeLessThan(400);
      tick(w, { R: { throttle: 0 } });
    }
    const s = newestSegment(L.wake);
    setPose(R, s.x, s.y, s.heading);
    tick(w, { R: { throttle: 0 } });
    expect(R.draft).toBeGreaterThan(0);
  });

  it('(f) leftover water lifts: an orphan ribbon after removeShip, and after a respawn', () => {
    const w = bareWorld();
    const L = place(w, 'L', 0, 0);
    const M = place(w, 'M', 0, 300);
    const R = place(w, 'R', -900, 0);
    for (let i = 0; i < 60; i++) tick(w, { L: { throttle: 1 }, M: { throttle: 1 } });
    // removeShip: the departed hull's water is in the orphan store.
    const left = L.wake;
    w.removeShip('L');
    expect(w.wakeRibbons).toContain(left);
    let s = newestSegment(left);
    setPose(R, s.x, s.y, s.heading);
    tick(w, { M: { throttle: 1 }, R: { throttle: 0 } });
    expect(R.draft).toBeGreaterThan(0);
    // respawn: the old life's water detaches at the teleport and still lifts.
    const laid = M.wake;
    w.sinkShip('M');
    let n = 0;
    while (!isAfloat(M.lifecycle)) {
      expect(n++).toBeLessThan(400);
      tick(w, { R: { throttle: 0 } });
    }
    expect(M.wake).not.toBe(laid);
    expect(w.wakeRibbons).toContain(laid);
    s = newestSegment(laid);
    setPose(R, s.x, s.y, s.heading);
    tick(w, { R: { throttle: 0 } });
    expect(R.draft).toBeGreaterThan(0);
  });

  it('(g) a SINKING rider is lifted, and its step (the sinking ramp included) used the drafted cap', () => {
    const w = bareWorld();
    const L = place(w, 'L', 0, 0);
    const R = place(w, 'R', -60, 0);
    for (let i = 0; i < 120; i++) tick(w, { L: { throttle: 1 }, R: { throttle: 1 } });
    expect(R.draft).toBeGreaterThan(0);
    w.sinkShip('R');
    expect(isSinking(R.lifecycle)).toBe(true);
    for (let i = 0; i < 5; i++) {
      // Replay stepShips' own composition by hand, with the lift folded.
      const lift = liftNext(w, R, w.wakeRibbons);
      expect(lift).toBeGreaterThan(0);
      const now = w.now + DT;
      const kin = hookKinematics(
        draftedKinematics(
          slowedKinematics(boostedKinematics(R.stats.kinematics, CONFIG.boost.factor, now < R.boostUntil), R.slowFactor, now < R.slowedUntil),
          lift, true,
        ),
        R.cardBehaviors, HOOK_REGISTRY,
      );
      expect(kin.maxSpeed).toBeGreaterThan(R.stats.kinematics.maxSpeed);
      const ghost = { ...R.state };
      stepShip(ghost, R.input, kin, DT / 1000);
      if (R.lifecycle.kind !== 'sinking') throw new Error('expected sinking');
      applySinkingDecel(ghost, kin.maxSpeed, R.lifecycle.since, now);
      tick(w, { L: { throttle: 1 } });
      expect(Object.is(R.draft, lift)).toBe(true);
      expect(Object.is(R.state.x, ghost.x)).toBe(true);
      expect(Object.is(R.state.y, ghost.y)).toBe(true);
      expect(Object.is(R.state.speed, ghost.speed)).toBe(true);
    }
  });

  it('(h) crossing (90°) and opposed (180°) headings get nothing; the same spot sailed WITH the water lifts', () => {
    const w = bareWorld();
    const L = place(w, 'L', 0, 0);
    const R = place(w, 'R', -900, 0);
    for (let i = 0; i < 60; i++) tick(w, { L: { throttle: 1 } });
    const s = newestSegment(L.wake);
    setPose(R, s.x, s.y, s.heading);
    tick(w, { L: { throttle: 1 }, R: { throttle: 0 } });
    expect(R.draft).toBeGreaterThan(0);
    // Crossing: the heading factor is cos(90°), which the shared cos/sin
    // leave as float dust (~1e-18) — draftLift's dust floor reports that as
    // a literal 0. Opposed is a clean 0: the negative dot product clamps.
    for (const turn of [Math.PI / 2, -Math.PI / 2]) {
      setPose(R, s.x, s.y, s.heading + turn);
      tick(w, { L: { throttle: 1 }, R: { throttle: 0 } });
      expect(R.draft).toBe(0); // exact: the shared dust floor zeroes the ~1e-18 cos(π/2) residue
    }
    setPose(R, s.x, s.y, s.heading + Math.PI);
    tick(w, { L: { throttle: 1 }, R: { throttle: 0 } });
    expect(R.draft).toBe(0);
  });

  it('(i) the lane is the MAKER\'s hull width: a battleship trail lifts 20 u off its line, a torpedo-boat trail does not', () => {
    const offsetLift = (hull: HullId): number => {
      const w = bareWorld();
      const L = place(w, 'L', 0, 0, 0, hull);
      const R = place(w, 'R', -900, 0);
      for (let i = 0; i < 100; i++) tick(w, { L: { throttle: 1 } });
      const s = newestSegment(L.wake);
      setPose(R, s.x, s.y + 20, s.heading);
      tick(w, { L: { throttle: 1 }, R: { throttle: 0 } });
      return R.draft;
    };
    expect(offsetLift('battleship')).toBeGreaterThan(0); // 20 u < 32 u half-width
    expect(offsetLift('torpedoBoat')).toBe(0); // 20 u > 9 u half-width
  });

  it('(j) draft is 0 after a match-start redeploy, after a respawn, and for a dead hull', () => {
    const drafting = (): { w: World; R: ShipRecord } => {
      const w = bareWorld();
      place(w, 'L', 0, 0);
      const R = place(w, 'R', -60, 0);
      for (let i = 0; i < 120; i++) tick(w, { L: { throttle: 1 }, R: { throttle: 1 } });
      expect(R.draft).toBeGreaterThan(0);
      return { w, R };
    };
    // match reset (redeployShip)
    {
      const { w, R } = drafting();
      w.resetForMatchStart();
      expect(R.draft).toBe(0);
    }
    // respawn — and every sunk tick before it
    {
      const { w, R } = drafting();
      w.sinkShip('R');
      let n = 0;
      while (!isAfloat(R.lifecycle)) {
        expect(n++).toBeLessThan(400);
        tick(w, { L: { throttle: 1 } });
        if (isSunk(R.lifecycle)) expect(R.draft).toBe(0);
      }
      expect(R.draft).toBe(0);
    }
    // a dead hull never carries a stale lift (the stepShips skip branch)
    {
      const { w, R } = drafting();
      w.respawnEnabled = false;
      w.sinkShip('R');
      let n = 0;
      while (!isSunk(R.lifecycle)) {
        expect(n++).toBeLessThan(400);
        tick(w, { L: { throttle: 1 } });
      }
      expect(R.draft).toBe(0); // founderSinking zeroed it
      R.draft = 0.04; // a stale stamp planted by hand...
      tick(w, { L: { throttle: 1 } });
      expect(R.draft).toBe(0); // ...is cleared by the next stepShips
    }
  });

  it('(k) PARITY: with no other water, a boosted + slowed hull steps byte-identically to the pre-8.19 composition — draft 0 changes nothing', () => {
    const w = bareWorld();
    const S = place(w, 'S', 0, 0, 0.3);
    S.boostUntil = w.now + 60_000;
    S.slowedUntil = w.now + 60_000;
    S.slowFactor = 0.75;
    const ghost = { ...S.state };
    for (let i = 0; i < 120; i++) {
      const now = w.now + DT;
      const helm = { throttle: 1, rudder: i % 40 < 20 ? 0.6 : -0.4 };
      tick(w, { S: helm });
      const kin = hookKinematics(
        slowedKinematics(boostedKinematics(S.stats.kinematics, CONFIG.boost.factor, now < S.boostUntil), S.slowFactor, now < S.slowedUntil),
        S.cardBehaviors, HOOK_REGISTRY,
      );
      stepShip(ghost, S.input, kin, DT / 1000);
      expect(S.draft).toBe(0);
      expect(Object.is(S.state.x, ghost.x)).toBe(true);
      expect(Object.is(S.state.y, ghost.y)).toBe(true);
      expect(Object.is(S.state.heading, ghost.heading)).toBe(true);
      expect(Object.is(S.state.speed, ghost.speed)).toBe(true);
    }
    expect(ghost.speed).toBeGreaterThan(0);
  });
});
