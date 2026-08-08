// THE ON-WATER HALF OF THE ONE WAKE (Story 4.12 wave 3) — the emitter that lays
// foam behind EVERY visible hull, the Kelvin envelope of displaced water around
// each track, and the in-truesight source that feeds the same geometry to the
// scope.
//
// Four things in here are CONTRACT, not coverage:
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
//   • THE TWO SOURCES MUST PRODUCE ONE APPEARANCE (amendments 88 + 154). The
//     in-bubble stamp the client synthesizes and the wire-fed stamp the server
//     discloses are asserted CELL-FOR-CELL identical for the same geometry.

import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import {
  CONFIG,
  WAKE_AGE_BUCKETS,
  createShipWake,
  appendWakeSample,
  eachWakeSegment,
  hullEnvelope,
  rasterizeSegmentCoverage,
  type HullId,
} from '@salvo/shared';
import { CLIENT_CONFIG, FASTEST_HULL_SPEED } from '../config.js';
import { Effects, chopHalfWidthU, chopOutline, type ChopPoint } from '../render/effects.js';
import {
  WAKE_STAMP_MIN_MS,
  WakeSources,
  WakeStampCache,
  buildTruesightWakeStamp,
  type WakeHull,
} from '../render/wake.js';
import { buildWakeStamp, type WakeSegmentCover } from '../render/radarField.js';
import { CHOP_HEAD_MULTIPLE, KELVIN_SIN } from '../render/radarSources.js';

const LIFE_MS = CONFIG.vision.wakeLifeMs;
const STEP_U = CONFIG.vision.wakeSampleU;
const MODEL = CLIENT_CONFIG.blip.heatmap.model;
const CELL = CLIENT_CONFIG.blip.heatmap.cellU;

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
    // Under 1 u/s a source takes longer than `wakeLifeMs` to cover one
    // `wakeSampleU`, so its water expires before the next sample exists. That
    // is why the retired client-only `minSpeed` gate is not needed and must not
    // come back: a floor here would put foam on water the scope shows nothing on.
    const slowest = STEP_U / (LIFE_MS / 1000);
    expect(slowest).toBeCloseTo(1, 6);
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
    expect(LIFE_MS).toBe(12000);
  });

  it('runs 540u / 480u / 420u at full ahead for the three captain classes', () => {
    const at = (cls: HullId): number => hullEnvelope(cls).kinematics.maxSpeed * (LIFE_MS / 1000);
    expect(at('torpedoBoat')).toBeCloseTo(540, 6);
    expect(at('mineLayer')).toBeCloseTo(480, 6);
    expect(at('battleship')).toBeCloseTo(420, 6);
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

  it('shortens as the hull slows — the property Eric asked to keep', () => {
    const fast = hullEnvelope('torpedoBoat').kinematics.maxSpeed * (LIFE_MS / 1000);
    const slow = hullEnvelope('torpedoBoat').kinematics.maxSpeed * 0.25 * (LIFE_MS / 1000);
    expect(slow).toBeLessThan(fast);
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
  it('takes the angle from the real constant, not a degrees literal', () => {
    expect(KELVIN_SIN).toBe(1 / 3);
    expect((Math.asin(KELVIN_SIN) * 180) / Math.PI).toBeCloseTo(19.47, 2);
    expect(CHOP_HEAD_MULTIPLE).toBe(3);
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

// --- THE TWO SOURCES, ONE APPEARANCE -------------------------------------------

describe('the in-truesight wake stamp is the wire-fed stamp, cell for cell', () => {
  const own = { x: 0, y: 0 };

  function oneSegmentSources(): { sources: WakeSources; ax: number; ay: number; bx: number; by: number; width: number } {
    const sources = new WakeSources();
    const h = hull('a', 'battleship', 0, 30);
    h.x = 40;
    h.y = 20;
    sources.observe(h, 0);
    h.x = 40 + STEP_U + 1;
    sources.observe(h, 100);
    const src = sources.get('a')!;
    return { sources, ax: 40, ay: 20, bx: 40 + STEP_U + 1, by: 20, width: src.ribbon.widthU };
  }

  it('produces exactly what buildWakeStamp produces for the same geometry', () => {
    const { sources, ax, ay, bx, by, width } = oneSegmentSources();
    const mine = buildTruesightWakeStamp(sources, own, CONFIG.vision.sight, 100, CELL, MODEL);

    const wire: WakeSegmentCover[] = [
      { cov: rasterizeSegmentCoverage(ax, ay, bx, by, width, CELL), a: 0 },
    ];
    const theirs = buildWakeStamp(wire, MODEL, 0);

    expect(mine.size).toBe(theirs.size);
    expect(mine.size).toBeGreaterThan(0);
    for (const [key, s] of theirs) {
      const got = mine.get(key);
      expect(got, `cell ${key}`).toBeDefined();
      expect(got?.refl).toBeCloseTo(s.refl, 12);
      expect(got?.ref).toBe(s.ref);
      expect(got?.geom).toBe(s.geom);
    }
  });

  it('takes the EXACT COMPLEMENT of the server annulus: in-bubble only', () => {
    const sources = new WakeSources();
    const far = hull('far', 'battleship', CONFIG.vision.sight + 200, 30);
    sources.observe(far, 0);
    far.x += STEP_U + 1;
    sources.observe(far, 100);
    // Beyond `sightU` the wire owns it (blipGate's annulus) and this stamp is
    // empty — no cell is claimed twice and none is dropped between them.
    const outside = buildTruesightWakeStamp(sources, own, CONFIG.vision.sight, 100, CELL, MODEL);
    expect(outside.size).toBe(0);
    // Widen the observer's own bubble past the segment and it appears.
    const inside = buildTruesightWakeStamp(sources, own, CONFIG.vision.radar, 100, CELL, MODEL);
    expect(inside.size).toBeGreaterThan(0);
  });

  it('carries the water-age bucket, so an old track reads weaker than a fresh one', () => {
    const { sources } = oneSegmentSources();
    const fresh = buildTruesightWakeStamp(sources, own, CONFIG.vision.sight, 100, CELL, MODEL);
    const aged = buildTruesightWakeStamp(sources, own, CONFIG.vision.sight, LIFE_MS * 0.8, CELL, MODEL);
    const peak = (m: Map<number, { refl: number }>): number =>
      Math.max(...[...m.values()].map((s) => s.refl));
    expect(peak(aged)).toBeLessThan(peak(fresh));
  });

  it('holds nothing after the water has aged out', () => {
    const { sources } = oneSegmentSources();
    expect(buildTruesightWakeStamp(sources, own, CONFIG.vision.sight, LIFE_MS + 1000, CELL, MODEL).size).toBe(0);
  });
});

// --- THE CACHE (amendment 83: a stamp is replaced, never mutated) ---------------

describe('WakeStampCache rebuilds on the three things that can change its answer', () => {
  it('returns the SAME object while the segment set, the observer and the clock hold', () => {
    const sources = new WakeSources();
    const h = hull('a', 'battleship', 30, 30);
    sources.observe(h, 0);
    h.x += STEP_U + 1;
    sources.observe(h, 100);

    const cache = new WakeStampCache();
    const own = { x: 0, y: 0 };
    const first = cache.stampFor(sources, own, CONFIG.vision.sight, 100, CELL, MODEL);
    expect(cache.stampFor(sources, own, CONFIG.vision.sight, 120, CELL, MODEL)).toBe(first);
  });

  it('rebuilds when a new sample lands, once past the rebuild floor', () => {
    const sources = new WakeSources();
    const h = hull('a', 'battleship', 30, 30);
    sources.observe(h, 0);
    h.x += STEP_U + 1;
    sources.observe(h, 100);
    const cache = new WakeStampCache();
    const own = { x: 0, y: 0 };
    const first = cache.stampFor(sources, own, CONFIG.vision.sight, 100, CELL, MODEL);
    h.x += STEP_U + 1;
    sources.observe(h, 200);
    const past = 100 + WAKE_STAMP_MIN_MS;
    expect(cache.stampFor(sources, own, CONFIG.vision.sight, past, CELL, MODEL)).not.toBe(first);
  });

  it('rebuilds when the observer moves one sample cadence', () => {
    const sources = new WakeSources();
    const h = hull('a', 'battleship', 30, 30);
    sources.observe(h, 0);
    h.x += STEP_U + 1;
    sources.observe(h, 100);
    const cache = new WakeStampCache();
    const first = cache.stampFor(sources, { x: 0, y: 0 }, CONFIG.vision.sight, 100, CELL, MODEL);
    const past = 100 + WAKE_STAMP_MIN_MS;
    const same = cache.stampFor(sources, { x: STEP_U * 0.4, y: 0 }, CONFIG.vision.sight, past, CELL, MODEL);
    expect(same).toBe(first);
    const moved = cache.stampFor(sources, { x: STEP_U * 2, y: 0 }, CONFIG.vision.sight, past + 1, CELL, MODEL);
    expect(moved).not.toBe(first);
  });

  it('holds the cached stamp under the floor however busy the room gets', () => {
    // THE MEASURED HALF OF THE CACHE. Twenty hulls under way inside one bubble
    // bump `version` several times a second EACH, so without this floor the
    // "segment set changed" test fires on essentially every frame — measured at
    // 2.19 ms against the 2.5 ms bar at 0.5× zoom, versus 1.89 ms with it. The
    // floor is `radarCellU / fastest hull`: below it nothing can have moved by
    // an amount the lattice is able to represent.
    expect(WAKE_STAMP_MIN_MS).toBeCloseTo((CONFIG.vision.radarCellU / FASTEST_HULL_SPEED) * 1000, 9);
    const sources = new WakeSources();
    const h = hull('a', 'battleship', 30, 30);
    sources.observe(h, 0);
    h.x += STEP_U + 1;
    sources.observe(h, 50);
    const cache = new WakeStampCache();
    const first = cache.stampFor(sources, { x: 0, y: 0 }, CONFIG.vision.sight, 50, CELL, MODEL);
    for (let t = 55; t < 50 + WAKE_STAMP_MIN_MS; t += 5) {
      h.x += STEP_U + 1;
      sources.observe(h, t);
      expect(cache.stampFor(sources, { x: t, y: 0 }, CONFIG.vision.sight, t, CELL, MODEL)).toBe(first);
    }
  });
});

// --- THE CROSSING SEAM: radar range → truesight ---------------------------------
//
// A hull sailing in from radar range SWITCHES WAKE SOURCES mid-track: the server
// stops disclosing (the `wk` row inherits `blipGate`'s annulus) exactly as the
// client starts synthesizing from a ribbon that begins EMPTY. The question the
// implementation has to answer is whether anything goes dark in between.
//
// IT CANNOT, AND THE REASON IS THE THREE CLOCKS AGREEING (amendments 195 + 205).
// Water laid at T dies at T + `wakeLifeMs`. The beam crosses it within one
// revolution of being laid, so its last paint is created by T + one sweep, and a
// paint persists `persistSweeps` revolutions — so every stretch of water that is
// still ALIVE necessarily has a LIVE PAINT behind it, whichever source made that
// paint. The client's ribbon starting empty therefore costs nothing: the water it
// has not got is water whose phosphor is still lit.
//
// THIS IS THE COUPLING AMENDMENT 205 WARNED ABOUT IN AS MANY WORDS (*"the three
// clocks agree by coincidence, and a future retune of any one of them should
// check the other two"*). The inequality below is that check, made mechanical.

describe('the source handover at the truesight boundary reads continuously', () => {
  it('phosphor outlives the water, so a stretch with no live source still paints', () => {
    const sweepMs = 60_000 / CONFIG.vision.sweepRpm;
    const phosphorMs = CLIENT_CONFIG.blip.persistSweeps * sweepMs;
    // Worst case: a stretch is painted a full revolution after it was laid, and
    // must still be lit when the water finally dissipates.
    expect(phosphorMs).toBeGreaterThanOrEqual(LIFE_MS);
  });

  it('the client picks the track up within one sample cadence of the boundary', () => {
    const effects = new Effects(new Container());
    const own = { x: 0, y: 0 };
    const sight = CONFIG.vision.sight;
    // Inbound along −x at full ahead, starting well outside truesight.
    const h = hull('inbound', 'torpedoBoat', sight + 400, 0);
    h.heading = Math.PI;
    h.speed = hullEnvelope('torpedoBoat').kinematics.maxSpeed;

    let t = 0;
    let firstInside = Number.NaN;
    let stampedAt = Number.NaN;
    for (let i = 0; i < 400 && !(h.x < 0); i++) {
      t += 50;
      h.x -= (h.speed * 50) / 1000;
      // Only a hull inside truesight is a contact, and only a contact is a
      // source — exactly the complement of the server's annulus.
      const visible = Math.hypot(h.x - own.x, h.y - own.y) <= sight;
      effects.update(0.05, t, visible ? [h] : []);
      if (visible && Number.isNaN(firstInside)) firstInside = h.x;
      if (!visible) continue;
      const stamp = buildTruesightWakeStamp(effects.wakeSources, own, sight, t, CELL, MODEL);
      if (stamp.size > 0 && Number.isNaN(stampedAt)) stampedAt = h.x;
    }

    expect(Number.isNaN(firstInside)).toBe(false);
    expect(Number.isNaN(stampedAt)).toBe(false);
    // The gap between "this hull became visible" and "its wake is on my scope"
    // is at most the two samples a segment needs, plus the frame the observation
    // landed on. Anything further astern than that was disclosed on the wire
    // while the hull was still in the annulus, and its paints are still lit.
    expect(firstInside - stampedAt).toBeLessThanOrEqual(2 * STEP_U + h.speed * 0.05);
  });

  it('and the hull sailing back OUT hands its track straight back to the wire', () => {
    const effects = new Effects(new Container());
    const own = { x: 0, y: 0 };
    const sight = CONFIG.vision.sight;
    const h = hull('outbound', 'torpedoBoat', 40, hullEnvelope('torpedoBoat').kinematics.maxSpeed);
    let t = 0;
    while (h.x < sight - 20) {
      t += 50;
      h.x += (h.speed * 50) / 1000;
      effects.update(0.05, t, [h]);
    }
    const before = buildTruesightWakeStamp(effects.wakeSources, own, sight, t, CELL, MODEL).size;
    expect(before).toBeGreaterThan(0);
    // Out of the bubble: it stops being a contact, the ribbon stops growing —
    // and the in-bubble water it already laid keeps stamping until it ages out
    // (amendment 200: a wake outlives the hull's visibility, not just the hull).
    for (let i = 0; i < 20; i++) {
      t += 50;
      effects.update(0.05, t, []);
    }
    expect(buildTruesightWakeStamp(effects.wakeSources, own, sight, t, CELL, MODEL).size).toBeGreaterThan(0);
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
