// WAKE DRAFTING on the server (Story 8.19, Eric rulings 2026-09-30, epic-8
// amendments 151–155) — world-level tests for the per-tick `ShipRecord.draft`
// stamp and its fold into stepShips. The lift FUNCTION itself (`draftLift`,
// the I/O matrix) is pinned in shared; this file pins what the WORLD does
// with it: which water it reads (every ribbon but the hull's own and any
// torpedo's, one tick old), who is lifted (afloat AND sinking), the pinned
// fold order, the life-boundary resets, and that draft = 0 changes nothing —
// and THE STERN RULE on the real World (Eric 2026-09-30, amendment 159): a
// same-class chaser holds nose-to-tail, the leader never drafts its follower,
// and hulls abreast or stacked never lift each other.

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
  return draftLift(
    ribbons, own, s.state.x, s.state.y, s.state.heading, s.cls.hull.length / 2, w.now + DT, CONFIG.wake.draft,
  );
}

/**
 * A spot on a ribbon's centre line `back` u of ARC LENGTH behind its newest
 * sample, with that segment's direction — the stern rule (amendment 159) cuts
 * the freshest `hullAheadU + riderHalfLenU` of arc, so a test that wants a
 * lifted rider places it past that cut with this.
 */
function laneSpot(r: WakeRibbon, back: number): { x: number; y: number; heading: number } {
  let left = back;
  for (let n = r.count - 1; n >= 1; n--) {
    const b = (r.head + n) % r.cap;
    const a = (r.head + n - 1) % r.cap;
    const dx = r.xs[b] - r.xs[a];
    const dy = r.ys[b] - r.ys[a];
    const len = Math.hypot(dx, dy);
    if (left <= len) {
      const f = 1 - left / len;
      return { x: r.xs[a] + f * dx, y: r.ys[a] + f * dy, heading: Math.atan2(dy, dx) };
    }
    left -= len;
  }
  throw new Error(`ribbon shorter than ${back} u`);
}

/** Just behind the lane head a `rider` would see on `r` (the cut plus 6 u). */
function behindHead(r: WakeRibbon, rider: ShipRecord): { x: number; y: number; heading: number } {
  return laneSpot(r, r.hullAheadU + rider.cls.hull.length / 2 + 6);
}

describe('wake drafting — the stepShips stamp and fold (Story 8.19)', () => {
  /** A same-class stern chase run to its STEADY STATE (amendment 159's
   *  stern rule): the leader starts `startGap` u ahead of the rider on the
   *  same line, both full ahead for `ticks`. Returns the per-run census. */
  const sternChase = (hull: HullId, startGap: number, ticks: number) => {
    const w = bareWorld();
    const L = place(w, 'L', -1600, 0, 0, hull);
    const R = place(w, 'R', -1600 - startGap, 0, 0, hull);
    const cap = R.stats.kinematics.maxSpeed;
    const ceiling = cap + cap * LIFT;
    let firstDraft = -1;
    let drafted = 0;
    let leaderDrafted = 0;
    let minGap = Infinity;
    let topSpeed = 0;
    let tailGap = 0;
    let tailLift = 0;
    let tailN = 0;
    for (let i = 0; i < ticks; i++) {
      tick(w, { L: { throttle: 1 }, R: { throttle: 1 } });
      expect(R.state.speed).toBeLessThanOrEqual(ceiling);
      expect(R.draft).toBeGreaterThanOrEqual(0);
      expect(R.draft).toBeLessThanOrEqual(LIFT);
      if (L.draft !== 0) leaderDrafted += 1;
      if (R.draft > 0) {
        drafted += 1;
        if (firstDraft < 0) firstDraft = i;
      }
      const gap = Math.hypot(L.state.x - R.state.x, L.state.y - R.state.y);
      minGap = Math.min(minGap, gap);
      topSpeed = Math.max(topSpeed, R.state.speed);
      if (i >= ticks - 400) {
        tailGap += gap;
        tailLift += R.draft;
        tailN += 1;
      }
    }
    return {
      w, L, R, cap, ceiling, firstDraft, drafted, leaderDrafted, minGap, topSpeed,
      tailGap: tailGap / tailN, tailLift: tailLift / tailN, length: R.cls.hull.length,
    };
  };

  for (const hull of ['torpedoBoat', 'battleship'] as const) {
    it(`(a) STERN CHASE to steady state (${hull}): the rider drafts and closes to NOSE-TO-TAIL and holds there; the leader NEVER drafts its follower; they never stack`, () => {
      const run = sternChase(hull, 150, 1500);
      // Measured at this fix (1500 ticks from a 150 u start gap): torpedo
      // boat first drafts at tick 104, holds a ~94 u centre gap (min ~92.3)
      // at a mean lift ~0.008; battleship first drafts at tick 170, holds
      // ~123 u (min ~117.9) at ~0.016. The leader's draft was 0 on every tick.
      expect(run.firstDraft).toBeGreaterThanOrEqual(0);
      expect(run.drafted).toBeGreaterThan(1500 / 2); // the bulk of the run
      expect(run.leaderDrafted).toBe(0); // THE finding: the leader never rides its follower's water
      // Nose-to-tail, bow clear: the centres never close inside one hull
      // length, less one sample cadence of tolerance.
      expect(run.minGap).toBeGreaterThanOrEqual(run.length - CONFIG.vision.wakeSampleU);
      expect(run.topSpeed).toBeGreaterThan(run.cap);
      expect(run.topSpeed).toBeLessThanOrEqual(run.ceiling);
      expect(run.L.state.speed).toBe(run.cap);
    });
  }

  it('(a) out of the lane the lift dies and the rider decays back to its rated cap', () => {
    const { w, R, cap } = sternChase('torpedoBoat', 150, 300);
    expect(R.draft).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) tick(w, { L: { throttle: 1 }, R: { throttle: 1, rudder: 1 } });
    for (let i = 0; i < 80; i++) tick(w, { L: { throttle: 1 }, R: { throttle: 1 } });
    expect(R.draft).toBe(0);
    expect(R.state.speed).toBe(cap);
  });

  it('(a) two hulls ABREAST 25 u apart, same heading, full ahead: neither ever lifts the other', () => {
    const w = bareWorld();
    const A = place(w, 'A', -1000, 0);
    const B = place(w, 'B', -1000, 25);
    for (let i = 0; i < 400; i++) {
      tick(w, { A: { throttle: 1 }, B: { throttle: 1 } });
      expect(A.draft).toBe(0);
      expect(B.draft).toBe(0);
    }
    // ...and the same pair abreast 25 u apart as battleships (lane half-width 32 u).
    const v = bareWorld();
    const C = place(v, 'C', -1000, 0, 0, 'battleship');
    const D = place(v, 'D', -1000, 25, 0, 'battleship');
    for (let i = 0; i < 400; i++) {
      tick(v, { C: { throttle: 1 }, D: { throttle: 1 } });
      expect(C.draft).toBe(0);
      expect(D.draft).toBe(0);
    }
  });

  it('(a) two hulls STACKED at the same point: neither lifts the other', () => {
    const w = bareWorld();
    const A = place(w, 'A', -1000, 0);
    const B = place(w, 'B', -1000, 0);
    for (let i = 0; i < 400; i++) {
      tick(w, { A: { throttle: 1 }, B: { throttle: 1 } });
      expect(A.draft).toBe(0);
      expect(B.draft).toBe(0);
    }
  });

  it('(b) ONE TICK OLD: on the tick the leader\'s ribbon first makes the rider\'s spot draftable the rider\'s draft is still 0; it first rises on the next tick', () => {
    const w = bareWorld();
    const L = place(w, 'L', 0, 0);
    const R = place(w, 'R', 2, 4); // on the leader's line, heading the same way, stopped
    let n = 0;
    // Until the water under R clears the stern-rule cut, every tick — up to
    // and INCLUDING tick N, whose sampleWakes appended the sample that put R
    // behind the lane head — reads a ribbon with no draftable water at R.
    while (liftNext(w, R, w.wakeRibbons) === 0) {
      expect(n++).toBeLessThan(400);
      tick(w, { L: { throttle: 1 }, R: { throttle: 0 } });
      expect(R.draft).toBe(0);
    }
    expect(L.wake.count).toBeGreaterThan(2);
    tick(w, { L: { throttle: 1 }, R: { throttle: 0 } }); // tick N + 1
    expect(R.draft).toBeGreaterThan(0);
  });

  it('(c) overlapping wakes take the MAX, never the sum', () => {
    const w = bareWorld();
    const A = place(w, 'A', 0, 0);
    const B = place(w, 'B', -30, 5);
    const R = place(w, 'R', -900, 0);
    for (let i = 0; i < 140; i++) tick(w, { A: { throttle: 1 }, B: { throttle: 1 } });
    const s = behindHead(B.wake, R); // behind B's lane head (and A's, 30 u further on)
    setPose(R, s.x, 2.5, 0); // inside both 9 u lanes (y = 0 and y = 5)
    const a = liftNext(w, R, [A.wake]);
    const b = liftNext(w, R, [B.wake]);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    tick(w, { A: { throttle: 1 }, B: { throttle: 1 }, R: { throttle: 0 } });
    expect(Object.is(R.draft, Math.max(a, b))).toBe(true);
    expect(R.draft).toBeLessThan(a + b);
  });

  it('(d) a hull\'s OWN attached ribbon never lifts it — even set down on its own draftable water', () => {
    const w = bareWorld();
    const S = place(w, 'S', 0, 0);
    for (let i = 0; i < 300; i++) {
      tick(w, { S: { throttle: 1, rudder: i < 100 ? 0 : 1 } }); // straight, then circling back over its trail
      expect(S.draft).toBe(0);
    }
    // Set it down behind its own lane head, sailing with the water: the same
    // ribbon under any OTHER reference would lift it (non-vacuous) — its own does not.
    for (let i = 0; i < 100; i++) tick(w, { S: { throttle: 1 } });
    const spot = behindHead(S.wake, S);
    setPose(S, spot.x, spot.y, spot.heading);
    expect(liftNext(w, S, w.wakeRibbons, null)).toBeGreaterThan(0);
    tick(w, { S: { throttle: 0 } });
    expect(S.draft).toBe(0);
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
    for (let i = 0; i < 30; i++) tick(w, { R: { throttle: 0 } });
    const fishWater = w.torpWakes.get('fish')!;
    expect(fishWater.count).toBeGreaterThan(2);
    expect(fishWater.hullAheadU).toBe(0);
    const s = behindHead(fishWater, R);
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
    // The wreck still sits at the head of its still-attached ribbon.
    expect(L.wake.hullAheadU).toBe(L.cls.hull.length / 2);
    const s = behindHead(L.wake, R);
    setPose(R, s.x, s.y, s.heading);
    tick(w, { R: { throttle: 0 } });
    expect(R.draft).toBeGreaterThan(0);
  });

  it('(f) leftover water lifts: an orphan ribbon after removeShip, and after a respawn', () => {
    const w = bareWorld();
    const L = place(w, 'L', 0, 0);
    const M = place(w, 'M', 0, 300);
    const R = place(w, 'R', -900, 0);
    for (let i = 0; i < 140; i++) tick(w, { L: { throttle: 1 }, M: { throttle: 1 } });
    // removeShip: the departed hull's water is in the orphan store.
    const left = L.wake;
    w.removeShip('L');
    expect(w.wakeRibbons).toContain(left);
    // Detached water has no hull ahead of it: only the rider's own half
    // length is cut, so a rider standing just behind the maker's last sample
    // minus its own half length is lifted...
    expect(left.hullAheadU).toBe(0);
    const riderHalf = R.cls.hull.length / 2;
    let s = laneSpot(left, riderHalf + 1);
    setPose(R, s.x, s.y, s.heading);
    tick(w, { M: { throttle: 1 }, R: { throttle: 0 } });
    expect(R.draft).toBeGreaterThan(0);
    // ...and one well inside its own half length (more than a lane half-width
    // past the head) is not.
    s = laneSpot(left, riderHalf - 15);
    setPose(R, s.x, s.y, s.heading);
    tick(w, { M: { throttle: 1 }, R: { throttle: 0 } });
    expect(R.draft).toBe(0);
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
    expect(laid.hullAheadU).toBe(0); // detached at the teleport
    // What survives the 5 s sinking window of a 5.5 s water life is a sliver
    // shorter than any hull's half length, so no real rider fits on it — the
    // water itself still counts: a zero-length rider (the pure function, the
    // world's ribbon list, M's new attached ribbon excluded) is lifted there.
    s = laneSpot(laid, 1);
    expect(draftLift(w.wakeRibbons, M.wake, s.x, s.y, s.heading, 0, w.now + DT, CONFIG.wake.draft)).toBeGreaterThan(0);
  });

  it('(g) a SINKING rider is lifted, and its step (the sinking ramp included) used the drafted cap', () => {
    const w = bareWorld();
    const L = place(w, 'L', 0, 0);
    const R = place(w, 'R', -900, 0);
    for (let i = 0; i < 100; i++) tick(w, { L: { throttle: 1 } });
    const spot = behindHead(L.wake, R);
    setPose(R, spot.x, spot.y, spot.heading);
    tick(w, { L: { throttle: 1 }, R: { throttle: 1 } });
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
    for (let i = 0; i < 100; i++) tick(w, { L: { throttle: 1 } });
    const s = behindHead(L.wake, R);
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
      for (let i = 0; i < 200; i++) tick(w, { L: { throttle: 1 } });
      const s = behindHead(L.wake, R);
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
      const L = place(w, 'L', 0, 0);
      const R = place(w, 'R', -900, 0);
      for (let i = 0; i < 100; i++) tick(w, { L: { throttle: 1 } });
      const spot = behindHead(L.wake, R);
      setPose(R, spot.x, spot.y, spot.heading);
      tick(w, { L: { throttle: 1 }, R: { throttle: 1 } });
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
