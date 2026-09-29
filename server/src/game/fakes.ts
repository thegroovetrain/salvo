// SERVER-GENERATED FALSE RADAR RETURNS (Story 8.16, catalog-v3 R39, epic-8
// amendment 124(b)(c)) — the CHAFF scatter.
//
// This is the RADAR BUOY's jamming scatter (`scatterJamFakes`, deleted with the
// buoy in Story 8.16), generalized to any circular source and WATER-FILTERED:
// the buoy's fakes could land on an island or off the rim (`deferred-work.md`
// :1451), a tell a sharp player could read. CHAFF is its only source today.
//
// A fake is a (pose, hull class) that signals.ts shapes through the ONE blip
// shaper and gates through each observer's OWN blipGate — so it appears
// exactly when a real hull at that pose would, and nothing on the wire tells
// it from one. SERVER-PRIVATE: no `Fake` ever rides the wire as such.
//
// DETERMINISM IS THE CONTRACT: the fake set is a pure function of
// (seed, epoch, circle, islands, mapRadius). The seed comes off the World's
// server-private stream at activation, so a client can predict none of it,
// while the perception oracle re-derives every fake byte-for-byte.

import {
  HULL_IDS,
  blockedWater,
  mulberry32,
  wrapPositive,
  type HullId,
  type Island,
  type Rng,
} from '@salvo/shared';

/**
 * One live false-return SOURCE (a CHAFF burst). Fixed at the OWNER's position
 * at activation (R39 "bursts at your own position") — it does not follow the
 * ship. `at` is the activation time the rescatter epoch counts from; `until`
 * the server time it stops painting.
 */
export interface FakeSource {
  x: number; // u — the burst point
  y: number; // u
  radius: number; // u — scatter circle
  count: number; // fakes per scatter (fewer is legal beside land)
  until: number; // ms — server time the fakes stop
  seed: number; // server-private scatter seed
  at: number; // ms — activation time (the epoch origin)
}

/** One fabricated radar subject. */
export interface Fake {
  x: number; // u
  y: number; // u
  heading: number; // rad
  /** The hull profile this fake paints as — drawn from ALL six HullIds so the
   *  clutter spans every footprint size a real return could have. */
  cls: HullId;
}

/** Draw attempts per fake before it is DROPPED (amendment 124(c)). */
export const FAKE_MAX_ATTEMPTS = 16;

/**
 * The rescatter epoch (amendment 124(b)): how many of the OWNER's sweep
 * periods have elapsed since activation. Ships keep no revolution counter, so
 * "re-scattered per sweep" is time over the owner's own `sweepPeriodMs` — the
 * same quantity, recomputable by the oracle from the frame time.
 */
export function fakeEpoch(source: FakeSource, now: number, sweepPeriodMs: number): number {
  return Math.floor((now - source.at) / sweepPeriodMs);
}

/** One candidate pose: the four draws, in THE contract order. */
function drawFake(rng: Rng, cx: number, cy: number, radius: number): Fake {
  const r = radius * Math.sqrt(rng.next()); // 1. disc radius, area-uniform
  const theta = Math.PI * 2 * rng.next(); // 2. bearing
  const heading = wrapPositive(Math.PI * 2 * rng.next()); // 3. heading
  const cls = HULL_IDS[Math.floor(rng.next() * HULL_IDS.length)]; // 4. hull profile
  return { x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r, heading, cls };
}

/**
 * THE SCATTER — the fake set for one (source, epoch), as a PURE deterministic
 * function. THE DRAW ORDER IS THE CONTRACT (the perception oracle re-derives
 * the RNG sequence itself): the stream is
 * `mulberry32((seed ^ imul(epoch + 1, 0x9e3779b9)) >>> 0)` (consecutive epochs
 * share nothing), and per fake, four draws — r = R·√u, θ = 2π·a,
 * heading = 2π·h, cls = HULL_IDS[floor(c·6)] — REJECTED when the pose is not
 * legal water (`blockedWater`: ashore or off the disk) and re-drawn from the
 * SAME stream, at most FAKE_MAX_ATTEMPTS draws per fake. A fake that fails
 * every attempt is DROPPED, so fewer than `count` fakes is legal beside an
 * island (amendment 124(c)). No fake ever lies on land.
 */
export function scatterFakes(
  seed: number,
  epoch: number,
  cx: number,
  cy: number,
  radius: number,
  count: number,
  islands: readonly Island[],
  mapRadius: number,
): Fake[] {
  const rng = mulberry32((seed ^ Math.imul(epoch + 1, 0x9e3779b9)) >>> 0);
  const out: Fake[] = [];
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < FAKE_MAX_ATTEMPTS; attempt++) {
      const fake = drawFake(rng, cx, cy, radius);
      if (blockedWater(fake, islands, mapRadius)) continue;
      out.push(fake);
      break;
    }
  }
  return out;
}
