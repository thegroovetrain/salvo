// THE ON-WATER HALF OF THE ONE WAKE (Story 4.12 wave 3) — the emitter that lays
// foam behind EVERY visible hull, the Kelvin envelope of displaced water around
// each track. (The in-truesight source that once fed the same geometry to the
// scope is retired — epic-9 amendment 210: the scope paints wire `wk` rows only.)
//
// Three things in here are CONTRACT, not coverage:
//
//   • ONE WAKE, ONE LENGTH (amendment 204). The on-water trail and the radar
//     ribbon are two renderings of one geometry, and the length constant lives
//     in SHARED `CONFIG.vision.wakeLifeMs` precisely so no client-only knob can
//     fork them. The length pins below are what make a silent re-introduction of
//     a client `life` fail CI.
//   • EVERY VISIBLE HULL LAYS ONE (amendment 199) — own ship, contacts, drones.
//     Before this cycle the emitter was driven from the own predicted pose alone
//     and enemy hulls glided across the water leaving nothing.
//   • NO DECOY SPECIAL-CASING, IN EITHER DIRECTION (amendment 201, Eric: *"Decoy
//     will get major changes soon so lets not worry about it for now"*). A decoy
//     lays no wake because it does not move. The test below proves the ABSENCE
//     of a branch, so a future agent who reads the gap as an oversight and
//     "fixes" it breaks a test that says why not to.

import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import {
  CONFIG,
  WAKE_AGE_BUCKETS,
  createShipWake,
  appendWakeSample,
  eachWakeSegment,
  hullEnvelope,
  torpWakeLifeMs,
  type HullId,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { Effects, chopHalfWidthU, chopOutline, type ChopPoint } from '../render/effects.js';
import { WakeSources, type WakeHull } from '../render/wake.js';
import { CHOP_HEAD_MULTIPLE, KELVIN_SIN } from '../render/radarSources.js';

const LIFE_MS = CONFIG.vision.wakeLifeMs;
const STEP_U = CONFIG.vision.wakeSampleU;

/** A hull under way along +x at `speed`, at time `t`. */
function hull(id: string, cls: HullId, x: number, speed: number, t = 0): WakeHull {
  return { id, x, y: 0, heading: 0, speed, cls, color: 0xffffff, maxSpeedU: hullEnvelope(cls).kinematics.maxSpeed + t * 0 };
}

/** Drive `effects` for `frames` frames at `dt` seconds, advancing each moving
 *  hull along its own heading at its own speed. Returns the final server time. */
function sail(effects: Effects, hulls: WakeHull[], frames: number, dt: number, t0 = 0): number {
  let t = t0;
  for (let i = 0; i < frames; i++) {
    t += dt * 1000;
    for (const h of hulls) {
      h.x += Math.cos(h.heading) * h.speed * dt;
      h.y += Math.sin(h.heading) * h.speed * dt;
    }
    effects.update(dt, t, hulls);
  }
  return t;
}

// --- AMENDMENT 199: every visible hull lays a wake ------------------------------

describe('the emitter lays wake behind EVERY visible hull, not just the own one', () => {
  it('tracks own ship, an enemy captain and a drone alike', () => {
    const effects = new Effects(new Container());
    const hulls = [
      hull('me', 'torpedoBoat', 0, 40),
      hull('enemy', 'battleship', 500, 30),
      hull('drone', 'droneLarge', -500, 20),
    ];
    sail(effects, hulls, 60, 1 / 20);

    for (const h of hulls) {
      const src = effects.wakeSources.get(h.id);
      expect(src, `${h.id} must be tracked`).toBeDefined();
      // Two samples is one segment: the source has actually laid water.
      expect(src?.ribbon.count ?? 0).toBeGreaterThan(1);
    }
    expect(effects.wakeSources.size).toBe(3);
    expect(effects.liveWakeDots).toBeGreaterThan(0);
    expect(effects.liveChopEnvelopes).toBe(3);
  });

  it('clearWake drops every ribbon, dot and envelope (return-to-port teardown)', () => {
    const effects = new Effects(new Container());
    const hulls = [hull('me', 'torpedoBoat', 0, 40), hull('enemy', 'battleship', 500, 30)];
    sail(effects, hulls, 60, 1 / 20);
    expect(effects.liveWakeDots).toBeGreaterThan(0);
    effects.clearWake();
    expect(effects.liveWakeDots).toBe(0);
    expect(effects.liveChopEnvelopes).toBe(0);
    expect(effects.wakeSources.size).toBe(0);
  });

  it('a hull that is not visible this frame is not tracked at all', () => {
    const effects = new Effects(new Container());
    const only = [hull('me', 'torpedoBoat', 0, 40)];
    sail(effects, only, 30, 1 / 20);
    expect(effects.wakeSources.get('someone-else')).toBeUndefined();
  });
});

// --- AMENDMENT 201: the decoy, BY CONSTRUCTION rather than by a branch ----------

describe('a source that does not move lays no wake, and there is no branch saying so', () => {
  it('a frozen drop pose never travels one sample cadence, so it produces no segment', () => {
    const effects = new Effects(new Container());
    // A decoy reaches the water as an ordinary hull frozen at its drop pose:
    // speed 0, position unchanged for as long as it stands. Nothing here names
    // it, which is the point — amendment 201 forbids a decoy branch in either
    // direction, and the rework will delete the entity, not a special case.
    const frozen: WakeHull = { id: 'decoy', x: 200, y: -80, heading: 1, speed: 0, cls: 'torpedoBoat', color: 0xffffff };
    sail(effects, [frozen], 200, 1 / 20);

    const src = effects.wakeSources.get('decoy');
    expect(src).toBeDefined();
    // Exactly ONE stored sample (the first), and one sample is not a segment.
    expect(src?.ribbon.count).toBe(1);
    let segments = 0;
    eachWakeSegment(src!.ribbon, 200 * 50, () => {
      segments += 1;
    });
    expect(segments).toBe(0);
    expect(effects.liveWakeDots).toBe(0);
  });

  it('and a hull too slow to outrun its own dissipation clock lays nothing either', () => {
    // Under this speed a source takes longer than `wakeLifeMs` to cover one
    // `wakeSampleU`, so its water expires before the next sample exists. That
    // is why the retired client-only `minSpeed` gate is not needed and must not
    // come back: a floor here would put foam on water the scope shows nothing on.
    //
    // The threshold ROSE 1.0 -> 2.18 u/s at the cycle-71 clock cut (amendment
    // 213): a shorter dissipation clock means a source has to be making more
    // way to keep a track alive at all. Still far below `steerageSpeed` (8-12
    // u/s) for every class, so no hull under helm can fall through it.
    const slowest = STEP_U / (LIFE_MS / 1000);
    for (const cls of ['torpedoBoat', 'mineLayer', 'battleship'] as const) {
      expect(slowest).toBeLessThan(hullEnvelope(cls).kinematics.steerageSpeed);
    }
  });
});

// --- AMENDMENT 205: ONE length, speed-derived -----------------------------------

describe('wake length is speed × the SHARED life, per class', () => {
  it('has no client-only length knob left to fork the shared one', () => {
    // `life` and `spacing` promoted to shared CONFIG when the server started
    // rasterizing the same ribbon (amendment 204). If either reappears here,
    // the on-water render and the radar wake can drift to different lengths —
    // which is precisely the fork Eric corrected.
    const knobs = Object.keys(CLIENT_CONFIG.wake);
    expect(knobs).not.toContain('life');
    expect(knobs).not.toContain('spacing');
    expect(knobs).not.toContain('minSpeed');
  });

  it('measures out on the ribbon itself, at full ahead and at half', () => {
    for (const cls of ['torpedoBoat', 'mineLayer', 'battleship'] as const) {
      const top = hullEnvelope(cls).kinematics.maxSpeed;
      for (const frac of [1, 0.5]) {
        const speed = top * frac;
        const r = createShipWake(cls, top);
        // Sail two full lives so the tail is in steady state (the oldest live
        // water is exactly `life` old), sampling at the sim's own 50ms tick.
        const dt = CONFIG.tick.simDtMs;
        const ticks = Math.ceil((2 * LIFE_MS) / dt);
        let t = 0;
        for (let i = 0; i <= ticks; i++) {
          appendWakeSample(r, (speed * t) / 1000, 0, t);
          t += dt;
        }
        let oldest = Infinity;
        let newest = -Infinity;
        eachWakeSegment(r, t - dt, (s) => {
          oldest = Math.min(oldest, s.ax);
          newest = Math.max(newest, s.bx);
        });
        const measured = newest - oldest;
        const expected = speed * (LIFE_MS / 1000);
        // Within one sample cadence: the tail expires sample by sample, so the
        // visible track is the ideal length minus at most one step.
        expect(measured).toBeGreaterThan(expected - 2 * STEP_U);
        expect(measured).toBeLessThanOrEqual(expected + STEP_U);
      }
    }
  });
});

// --- THE PARTICLE BUDGET --------------------------------------------------------

describe('the foam pool is bounded, across every hull on the water', () => {
  it('derives its ceiling from the clock, the cadence, the fastest hull and the room', () => {
    const fastest = Math.max(
      ...(['torpedoBoat', 'mineLayer', 'battleship', 'droneSmall', 'droneMedium', 'droneLarge'] as HullId[]).map(
        (id) => hullEnvelope(id).kinematics.maxSpeed,
      ),
    );
    const perHull = Math.ceil(((LIFE_MS / 1000) * fastest) / STEP_U);
    expect(CLIENT_CONFIG.wake.maxDots).toBe(perHull * CONFIG.map.playerCap);
  });

  it('a FULL ROOM at top speed stays under the cap for a whole wake life', () => {
    const effects = new Effects(new Container());
    const hulls: WakeHull[] = [];
    for (let i = 0; i < CONFIG.map.playerCap; i++) {
      const h = hull(`s${i}`, 'torpedoBoat', i * 40, hullEnvelope('torpedoBoat').kinematics.maxSpeed);
      h.y = i * 40;
      hulls.push(h);
    }
    // One and a half wake lives at the sim tick — long enough that every ribbon
    // is in steady state and the oldest dots have begun retiring.
    sail(effects, hulls, Math.ceil((1.5 * LIFE_MS) / 50), 0.05);
    expect(effects.liveWakeDots).toBeGreaterThan(0);
    expect(effects.liveWakeDots).toBeLessThanOrEqual(CLIENT_CONFIG.wake.maxDots);
  });

  it('and the cap actually evicts when something floods the pool', () => {
    const effects = new Effects(new Container());
    for (let i = 0; i < CLIENT_CONFIG.wake.maxDots + 250; i++) {
      effects.spawnEffect('wake', i, 0, 1);
    }
    expect(effects.liveWakeDots).toBe(CLIENT_CONFIG.wake.maxDots);
  });
});

// --- AMENDMENT 205/206: the Kelvin envelope -------------------------------------

describe('hull-side displaced water rides the Kelvin half-angle', () => {
  it('takes the angle from the real constant, not a degrees literal, and the head width from it', () => {
    expect(KELVIN_SIN).toBe(1 / 3);
    expect((Math.asin(KELVIN_SIN) * 180) / Math.PI).toBeCloseTo(19.47, 2);
    expect(CHOP_HEAD_MULTIPLE).toBe(1 / KELVIN_SIN);
  });

  it('runs three half-beams wide at the head and one at the tail', () => {
    const beam = hullEnvelope('battleship').hull.beam;
    expect(chopHalfWidthU(beam, 0)).toBeCloseTo((beam / 2) * CHOP_HEAD_MULTIPLE, 9);
    expect(chopHalfWidthU(beam, WAKE_AGE_BUCKETS - 1)).toBeCloseTo(beam / 2, 9);
    // Monotone narrowing astern — amendment 206's "widest at the head".
    for (let b = 1; b < WAKE_AGE_BUCKETS; b++) {
      expect(chopHalfWidthU(beam, b)).toBeLessThan(chopHalfWidthU(beam, b - 1));
    }
  });

  it('scales with the hull, which is what keeps a torpedo track naked', () => {
    // A battleship's 32u beam pushes a real patch; a mine layer's 20u less; a
    // torpedo's one-cell ribbon barely a cell — amendment 197's accepted
    // consequence (*"a lone torpedo track reads plainly"*) holding by
    // construction, with no identity to branch on. A torpedo boat's 9u beam is
    // the cell width, so the fish and the smallest captain push the same water:
    // that is the floor of the scale, not a bug.
    const big = chopHalfWidthU(hullEnvelope('battleship').hull.beam, 0);
    const mid = chopHalfWidthU(hullEnvelope('mineLayer').hull.beam, 0);
    const fish = chopHalfWidthU(CONFIG.vision.radarCellU, 0);
    expect(big).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(fish);
    expect(chopHalfWidthU(hullEnvelope('torpedoBoat').hull.beam, 0)).toBeCloseTo(fish, 9);
  });

  it('is the SAME expression the scope draws, in world units instead of cells', () => {
    // `chopHaloCells` computes core + (M − 1) × core × taper in cells; this
    // computes the identical quantity in u. Two spellings of one envelope is how
    // the water and the scope drift apart, so the algebra is pinned here.
    const beam = 20;
    for (let b = 0; b < WAKE_AGE_BUCKETS; b++) {
      const taper = 1 - b / (WAKE_AGE_BUCKETS - 1);
      const core = beam / 2;
      expect(chopHalfWidthU(beam, b)).toBeCloseTo(core + (CHOP_HEAD_MULTIPLE - 1) * core * taper, 9);
    }
  });

  it('degrades rather than throwing on a degenerate width or bucket', () => {
    expect(chopHalfWidthU(Number.NaN, 0)).toBe(0);
    expect(chopHalfWidthU(0, 0)).toBe(0);
    expect(chopHalfWidthU(-5, 0)).toBe(0);
    // A non-finite bucket fails toward the OLDEST — narrowest, "about to be
    // gone" — the same direction `wakeAgeBucket` fails in.
    expect(chopHalfWidthU(20, Number.NaN)).toBeCloseTo(10, 9);
    expect(chopHalfWidthU(20, 99)).toBeCloseTo(10, 9);
  });

  it('outlines a closed, symmetric wedge around a straight track', () => {
    const pts: ChopPoint[] = [
      { x: 0, y: 0, hw: 5 },
      { x: 100, y: 0, hw: 15 },
    ];
    const poly = chopOutline(pts);
    expect(poly.length).toBe(pts.length * 4); // two sides, two numbers per vertex
    // Left side first, head to tail: +hw in y for a +x heading.
    expect(poly[0]).toBeCloseTo(0, 9);
    expect(poly[1]).toBeCloseTo(5, 9);
    expect(poly[2]).toBeCloseTo(100, 9);
    expect(poly[3]).toBeCloseTo(15, 9);
    // ...then the right side back again, mirrored.
    expect(poly[4]).toBeCloseTo(100, 9);
    expect(poly[5]).toBeCloseTo(-15, 9);
    expect(poly[6]).toBeCloseTo(0, 9);
    expect(poly[7]).toBeCloseTo(-5, 9);
  });

  it('never divides by zero on two coincident samples', () => {
    const poly = chopOutline([
      { x: 7, y: 7, hw: 4 },
      { x: 7, y: 7, hw: 4 },
    ]);
    for (const v of poly) expect(Number.isFinite(v)).toBe(true);
  });

  it('draws for a moving hull and survives a hull that has gone (amendment 200)', () => {
    const effects = new Effects(new Container());
    const h = hull('me', 'battleship', 0, 30);
    const t = sail(effects, [h], 40, 1 / 20);
    expect(effects.liveChopEnvelopes).toBe(1);
    // The hull stops being visible; its water keeps ageing on its own clock and
    // the envelope stays until the ribbon is spent.
    effects.update(1 / 20, t + 50, []);
    expect(effects.liveChopEnvelopes).toBe(1);
    effects.update(1 / 20, t + LIFE_MS * 2, []);
    expect(effects.liveChopEnvelopes).toBe(0);
    expect(effects.wakeSources.size).toBe(0);
  });
});

describe('phosphor covers the water clock at every sweep rate', () => {
  // The phosphor window is three REVOLUTIONS, not a fixed span, so a stretch of
  // water painted a revolution after it was laid must still be lit when it
  // dissipates — at the base sweep rate and at `sweepRpmMax` alike (cycle-69
  // review gate P4; epic-4 amendment 213's shorter clock closed the maxed-sweep gap).
  // These mirror the ruled pin pair in shared zone.test.ts, read here against
  // the live client `persistSweeps`.
  it('phosphor exactly covers the water clock AT THE BASE SWEEP RATE', () => {
    const sweepMs = 60_000 / CONFIG.vision.sweepRpm;
    const phosphorMs = CLIENT_CONFIG.blip.persistSweeps * sweepMs;
    // Worst case: a stretch is painted a full revolution after it was laid, and
    // must still be lit when the water finally dissipates.
    expect(phosphorMs).toBeGreaterThanOrEqual(LIFE_MS);
  });

  it('and AT sweepRpmMax TOO — cycle 69\'s accepted shortfall is resolved by the 5.5s clock (epic-4 amendment 213)', () => {
    // Was `=== LIFE_MS / 2`, documenting a hole: 6s of phosphor against 12s of
    // water on a maxed intelSweep build. The shorter clock closes it, so the
    // handover guarantee now holds at EVERY sweep rate rather than only the
    // base one, and this asserts the covering instead of the shortfall.
    const sweepMs = 60_000 / CONFIG.vision.sweepRpmMax;
    expect(CLIENT_CONFIG.blip.persistSweeps * sweepMs).toBeGreaterThanOrEqual(LIFE_MS);
  });
});

// --- P9: A BURST OF BAD FRAMES MAY NOT DESTROY THE RIBBON -----------------------

describe('the impossible-travel guard measures time from the sample it measures distance from', () => {
  it('survives a burst of non-finite frames instead of resetting on the next good one', () => {
    const sources = new WakeSources();
    const h = hull('a', 'torpedoBoat', 0, 45);
    sources.observe(h, 0);
    h.x = STEP_U + 1;
    sources.observe(h, 50); // last STORED sample: x = 13 at t = 50
    expect(sources.get('a')?.ribbon.count).toBe(2);

    // 400ms of corrupt frames. Each is an OBSERVATION (so `seenMs` advances and
    // the liveness clause is happy) but `appendWakeSample` drops every one, so
    // the ribbon's newest sample stays at t = 50 while the hull keeps sailing.
    for (let t = 100; t <= 450; t += 50) sources.observe({ ...h, x: Number.NaN }, t);

    // A good frame 20u on. That is well inside 45 u/s × 400ms + one cadence
    // (30u) from the last STORED sample — a perfectly ordinary run — but it is
    // NOT inside 45 u/s × 50ms + a cadence (14.25u) from the last FRAME, which
    // is the window the shipped guard measured against. It used to throw the
    // whole ribbon away here, which is the exact outcome its own comment says
    // it prevents.
    sources.observe({ ...h, x: 33 }, 500);
    expect(sources.get('a')?.ribbon.count).toBe(3);
  });

  it('still resets across a genuine teleport that no elapsed time can excuse', () => {
    const sources = new WakeSources();
    const h = hull('a', 'torpedoBoat', 0, 45);
    sources.observe(h, 0);
    h.x = STEP_U + 1;
    sources.observe(h, 50);
    sources.observe({ ...h, x: 4000 }, 100);
    expect(sources.get('a')?.ribbon.count).toBe(1);
  });
});

// --- LIFECYCLE: the ribbon may never invent water -------------------------------

describe('a source only chains onto water the client actually watched being made', () => {
  it('resets across a teleport rather than drawing a line across the map', () => {
    const sources = new WakeSources();
    const h = hull('a', 'torpedoBoat', 0, 40);
    sources.observe(h, 0);
    h.x = STEP_U + 1;
    sources.observe(h, 50);
    expect(sources.get('a')?.ribbon.count).toBe(2);
    // A respawn: same id, same class, 2000u away one tick later. No hull could
    // have got there, so the ribbon starts over.
    h.x = 2000;
    sources.observe(h, 100);
    expect(sources.get('a')?.ribbon.count).toBe(1);
  });

  it('resets after a gap longer than the contact store considers alive', () => {
    const sources = new WakeSources();
    const h = hull('a', 'torpedoBoat', 0, 40);
    sources.observe(h, 0);
    h.x = STEP_U + 1;
    sources.observe(h, 50);
    // Out of sight for seconds, then back: the water in between was never
    // observed, so chaining would paint a track the player never saw.
    h.x = 60;
    sources.observe(h, 10_000);
    expect(sources.get('a')?.ribbon.count).toBe(1);
  });

  it('re-provisions when a hull comes back as a different class', () => {
    const sources = new WakeSources();
    const h = hull('a', 'torpedoBoat', 0, 40);
    sources.observe(h, 0);
    const before = sources.get('a');
    const swapped: WakeHull = { ...h, cls: 'battleship' };
    sources.observe(swapped, 50);
    expect(sources.get('a')).not.toBe(before);
    expect(sources.get('a')?.cls).toBe('battleship');
  });

  it('never throws on a non-finite pose, and closes the ribbon across it', () => {
    const sources = new WakeSources();
    const h = hull('a', 'torpedoBoat', 0, 40);
    sources.observe(h, 0);
    h.x = STEP_U + 1;
    sources.observe(h, 50);
    const poisoned: WakeHull = { ...h, x: Number.NaN };
    expect(() => sources.observe(poisoned, 100)).not.toThrow();
    h.x = 2 * (STEP_U + 1);
    sources.observe(h, 150);
    expect(sources.get('a')?.ribbon.count).toBe(3);
  });
});

// --- P10: AMENDMENT 204 FOR THE TORPEDO -----------------------------------------
//
// The ship side of this ruling landed in wave 3; the FISH side did not. A
// torpedo's on-water trail stayed the pre-4.12 client one-shot (`torpwake`,
// `life: 0.7`s, dead-reckoned inside `Projectiles`) while the same fish's radar
// ribbon was server-owned 6s water — two objects, two lifetimes, ~8× apart.
// That is the fork Eric struck by name: *"I didn't tell you that the on-water
// render and the radar wake are deliberately different lengths... I didn't say
// shit about the lengths being different here."*
//
// It is now ONE source on ONE shared ribbon, and these pin that there is no
// second length left anywhere to drift.

describe('a torpedo lays the same one wake the scope paints', () => {
  /** A fish under way along +x at the fixed torpedo speed. */
  function fish(id: string, x: number): WakeHull {
    return { id, x, y: 0, heading: 0, speed: CONFIG.torpedo.speed, cls: 'torp', color: 0xffffff };
  }

  it('provisions the SHARED torpedo ribbon: half life, one cell wide, torp-gated', () => {
    const sources = new WakeSources();
    sources.observe(fish('t1', 0), 0);
    const r = sources.get('t1')!.ribbon;
    expect(r.lifeMs).toBe(torpWakeLifeMs());
    expect(r.lifeMs).toBe(LIFE_MS * CONFIG.vision.wakeTorpLifeFactor);
    expect(r.widthU).toBe(CONFIG.vision.radarCellU);
    // The per-source disclosure bound travels with the ribbon (review-gate P2).
    expect(r.torp).toBe(true);
  });

  it('its FOAM runs the ribbon own life — not the 0.7s one-shot it replaced', () => {
    const effects = new Effects(new Container());
    const f = fish('t1', 0);
    let t = 0;
    // Several cadences of travel: enough for segments, so foam is laid.
    for (let i = 0; i < 12; i++) {
      t += 50;
      f.x += (CONFIG.torpedo.speed * 50) / 1000;
      effects.update(0.05, t, [f]);
    }
    expect(effects.liveWakeDots).toBeGreaterThan(0);
    // Alive well past the retired 0.7s spec...
    effects.update(2, t + 2000, []);
    expect(effects.liveWakeDots).toBeGreaterThan(0);
    // ...and gone at the ribbon's own half life, not the hull's full one.
    const rest = torpWakeLifeMs() / 1000 - 2 + 0.2;
    effects.update(rest, t + torpWakeLifeMs() + 200, []);
    expect(effects.liveWakeDots).toBe(0);
  });

  it('a hull foam still runs the FULL life, so the two lengths are the ribbons and nothing else', () => {
    const effects = new Effects(new Container());
    const h = hull('a', 'battleship', 0, 30);
    const t = sail(effects, [h], 30, 1 / 20);
    expect(effects.liveWakeDots).toBeGreaterThan(0);
    // Past a fish's life but inside a hull's: still there.
    const fishLife = torpWakeLifeMs() / 1000 + 0.2;
    effects.update(fishLife, t + torpWakeLifeMs() + 200, []);
    expect(effects.liveWakeDots).toBeGreaterThan(0);
    effects.update(LIFE_MS / 1000, t + LIFE_MS * 2, []);
    expect(effects.liveWakeDots).toBe(0);
  });
});

// --- P11: THE WAKE STORE MAY NOT CROSS A VISIBILITY REGIME ----------------------

describe('spectate water never carries into a fogged life', () => {
  it('drops every ribbon on either edge of the spectate boundary', () => {
    const effects = new Effects(new Container());
    const h = hull('enemy', 'battleship', 0, 30);
    sail(effects, [h], 30, 1 / 20);
    expect(effects.wakeSources.size).toBe(1);

    // Alive -> spectate. Spectator frames are UNFOGGED (frames.ts hands a dead
    // observer every hull with no sight bubble and no island LOS), so the
    // regime the store was filled under no longer applies.
    effects.setSpectating(true);
    expect(effects.wakeSources.size).toBe(0);
    expect(effects.liveWakeDots).toBe(0);

    // Fill it again from omniscient frames...
    const far = hull('far', 'battleship', 4000, 30);
    sail(effects, [far], 30, 1 / 20, 10_000);
    expect(effects.wakeSources.size).toBe(1);

    // ...and back to a fogged life: none of that omniscient water may be
    // carried into the next life.
    effects.setSpectating(false);
    expect(effects.wakeSources.size).toBe(0);
    expect(effects.liveWakeDots).toBe(0);
  });

  it('is idempotent — a repeated regime does not drop live water', () => {
    const effects = new Effects(new Container());
    const h = hull('me', 'battleship', 0, 30);
    sail(effects, [h], 30, 1 / 20);
    effects.setSpectating(false); // already fogged: no-op
    expect(effects.wakeSources.size).toBe(1);
    expect(effects.liveWakeDots).toBeGreaterThan(0);
  });
});
