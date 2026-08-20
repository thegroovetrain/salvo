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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Container } from 'pixi.js';
import {
  CONFIG,
  WAKE_AGE_BUCKETS,
  createShipWake,
  appendWakeSample,
  eachWakeSegment,
  hullEnvelope,
  islandFromPolygon,
  paintSegmentCoverage,
  torpWakeLifeMs,
  type HullId,
  type Island,
} from '@salvo/shared';
import { CLIENT_CONFIG, FASTEST_HULL_SPEED } from '../config.js';
import { Effects, chopHalfWidthU, chopOutline, type ChopPoint } from '../render/effects.js';
import {
  FASTEST_AFLOAT_SPEED,
  WAKE_OBSERVE_GRACE_MS,
  WAKE_STAMP_MIN_MS,
  WAKE_STAMP_REBUILD_MS,
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
const NO_ISLES: readonly Island[] = [];

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
    expect(slowest).toBeCloseTo(STEP_U / 5.5, 6);
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
    expect(LIFE_MS).toBe(5500);
  });

  it('runs 247.5u / 220u / 192.5u at full ahead for the three captain classes', () => {
    const at = (cls: HullId): number => hullEnvelope(cls).kinematics.maxSpeed * (LIFE_MS / 1000);
    // Cut from 540 / 480 / 420 by amendment 213. The torpedo boat's figure is
    // the ruled one and is EXACTLY the 3/8 detect rung — the other two fall out
    // of it, since length is `speed x life` and only speed differs.
    expect(at('torpedoBoat')).toBeCloseTo(247.5, 6);
    expect(at('torpedoBoat')).toBeCloseTo(CONFIG.vision.detect, 6);
    expect(at('mineLayer')).toBeCloseTo(220, 6);
    expect(at('battleship')).toBeCloseTo(192.5, 6);
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

  // THE MASK MUST BE THE *PAINT* PIPELINE'S, NOT THE SHARP RASTERIZER'S
  // (cycle-69 review gate, follow-up to P3). The wire's `wk` shaper runs
  // `paintSegmentCoverage`, which glints the ribbon's FLANKS per paint precisely
  // so the lit-row count stops being a class lookup table (a segment's `widthU`
  // is its source's exact beam). If this synthesis kept the sharp
  // `rasterizeSegmentCoverage`, in-bubble water would sit crisp beside
  // scintillating wire water — amendment 154's "two sources, one appearance"
  // broken — and the class fingerprint P3 closed would be re-opened on the very
  // path where the observer is closest to the hull.
  it('produces exactly what buildWakeStamp produces for the same geometry — through the GLINTED pipeline', () => {
    const { sources, ax, ay, bx, by, width } = oneSegmentSources();
    const seedT = 7;
    const mine = buildTruesightWakeStamp(sources, own, CONFIG.vision.sight, 100, CELL, MODEL, NO_ISLES, seedT);

    const wire: WakeSegmentCover[] = [
      { cov: paintSegmentCoverage(ax, ay, bx, by, width, CELL, seedT), a: 0 },
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

  it('re-glints on a new revolution seed, exactly as buildShipStamp does', () => {
    // Not "different every frame" — different every REVOLUTION. The seed the
    // radar passes is the sweep revolution index, so a stationary track holds
    // one mask through a whole beam crossing and scintillates between them.
    const { sources } = oneSegmentSources();
    const keys = (seedT: number): string =>
      [...buildTruesightWakeStamp(sources, own, CONFIG.vision.sight, 100, CELL, MODEL, NO_ISLES, seedT).keys()]
        .sort((a, b) => a - b)
        .join(',');
    expect(keys(1)).toBe(keys(1));
    // At least one of a handful of revolutions must differ; the spine never
    // drops, so the ribbon can never empty out whatever the draw.
    const seeds = [1, 2, 3, 4, 5, 6].map(keys);
    expect(new Set(seeds).size).toBeGreaterThan(1);
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
    // Keep OBSERVING the source as its water ages (P5): the age channel is what
    // is under test here, not the observation gate.
    const src = sources.get('a')!;
    const agedAt = LIFE_MS * 0.8;
    src.seenMs = agedAt;
    const aged = buildTruesightWakeStamp(sources, own, CONFIG.vision.sight, agedAt, CELL, MODEL);
    const peak = (m: Map<number, { refl: number }>): number =>
      Math.max(...[...m.values()].map((s) => s.refl));
    expect(peak(aged)).toBeLessThan(peak(fresh));
  });

  it('holds nothing after the water has aged out', () => {
    const { sources } = oneSegmentSources();
    expect(buildTruesightWakeStamp(sources, own, CONFIG.vision.sight, LIFE_MS + 1000, CELL, MODEL).size).toBe(0);
  });
});

// --- P5: REMEMBER vs REVEAL -----------------------------------------------------
//
// The client synthesizes in-bubble wake as a STAND-IN for a disclosure the
// server withholds, and the server withholds it for one stated reason: the
// height-aware shadow march must never reveal water that BINARY island LOS is
// hiding. The synthesis therefore owes both halves of that reason — the source
// must be observed right now, and the segment must be binary-LOS clear.
//
// WHAT IT DOES *NOT* GATE is what the client REMEMBERS. The ribbon survives, the
// foam on the water survives and ages out on its own clock (amendment 200), and
// phosphor already lit keeps fading (amendment 83). Only new REVEAL stops.

describe('the in-bubble stamp reveals only water the client is currently earning', () => {
  const own = { x: 0, y: 0 };

  /** A battleship under way near the observer, observed up to `t`. */
  function tracked(): { sources: WakeSources; h: WakeHull; t: number } {
    const sources = new WakeSources();
    const h = hull('a', 'battleship', 60, 30);
    h.y = 40;
    let t = 0;
    for (let i = 0; i < 8; i++) {
      sources.observe(h, t);
      h.x += STEP_U + 1;
      t += 50;
    }
    return { sources, h, t };
  }

  it('stops stamping once the hull stops being observed — but keeps the water', () => {
    const { sources, t } = tracked();
    expect(buildTruesightWakeStamp(sources, own, CONFIG.vision.sight, t, CELL, MODEL).size).toBeGreaterThan(0);
    // The hull slips behind an island: still inside `sightU`, but no longer a
    // contact (truesight is binary-LOS gated), so the emitter stops passing it.
    // Its contact drops after `interpDelay + 300ms`; before this patch the wake
    // went on painting for up to a FULL WATER LIFE past that.
    const after = t + WAKE_OBSERVE_GRACE_MS + 1;
    expect(buildTruesightWakeStamp(sources, own, CONFIG.vision.sight, after, CELL, MODEL).size).toBe(0);
    // REMEMBERED, not deleted: the ribbon is intact and its water is still live,
    // so the moment the hull is observed again the same track reappears.
    const src = sources.get('a')!;
    expect(src.ribbon.count).toBeGreaterThan(1);
    src.seenMs = after;
    expect(buildTruesightWakeStamp(sources, own, CONFIG.vision.sight, after, CELL, MODEL).size).toBeGreaterThan(0);
  });

  it('and the observation edge moves `version`, so the cache cannot serve the stale answer', () => {
    const { sources, t } = tracked();
    const before = sources.version;
    sources.prune(t + WAKE_OBSERVE_GRACE_MS + 1);
    expect(sources.version).toBeGreaterThan(before);
  });

  it('does not reveal a segment binary island LOS is hiding, however low the terrain', () => {
    const { sources, t } = tracked();
    const clear = buildTruesightWakeStamp(sources, own, CONFIG.vision.sight, t, CELL, MODEL, NO_ISLES);
    expect(clear.size).toBeGreaterThan(0);
    // A headland squarely between the observer and the track. The march's
    // height-aware accumulator alone would let a LOW island pass this water;
    // binary LOS — the rule `pointSighted`/`pointDetected` run, and the rule the
    // server's whole in-bubble exclusion is justified by — does not.
    const isle = blockingIsland(own, sources);
    const hidden = buildTruesightWakeStamp(sources, own, CONFIG.vision.sight, t, CELL, MODEL, [isle]);
    expect(hidden.size).toBe(0);
  });
});

/** A near-circular island centred halfway between the observer and the mean of
 *  a source's live water — big enough to block every segment's bearing. */
function blockingIsland(own: { x: number; y: number }, sources: WakeSources): Island {
  let cx = 0;
  let cy = 0;
  let n = 0;
  sources.each((src) => {
    eachWakeSegment(src.ribbon, src.seenMs, (s) => {
      cx += s.mx;
      cy += s.my;
      n += 1;
    });
  });
  const tx = cx / n;
  const ty = cy / n;
  const mx = (tx + own.x) / 2;
  const my = (ty + own.y) / 2;
  const r = Math.hypot(tx - own.x, ty - own.y) / 2 + 30;
  const sides = 64;
  const phase = Math.PI / sides;
  const circum = r / Math.cos(phase);
  return islandFromPolygon(
    Array.from({ length: sides }, (_, i) => {
      const a = phase + (i * 2 * Math.PI) / sides;
      return { x: mx + Math.cos(a) * circum, y: my + Math.sin(a) * circum };
    }),
  );
}

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
    // 2.19 ms against the 2.5 ms bar at 0.5× zoom, versus 1.89 ms with it.
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

  // P7 — THE FLOOR'S OWN JUSTIFICATION, MADE MECHANICAL. The comment says
  // nothing can have moved by more than the lattice can express while the floor
  // holds. That was FALSE at the shipped derivation: it used
  // `FASTEST_HULL_SPEED`, the BASE kinematics maximum, so a boosted Torpedo Boat
  // (55 u/s) and a torpedo (60 u/s — a wake source in its own right since P10)
  // both crossed a 9u cell INSIDE the 200ms floor. The property, not the number:
  // no source may cross a lattice cell faster than the floor.
  it('the rebuild floor is shorter than a lattice-cell crossing for EVERY source, boost and fish included', () => {
    const cellCrossMs = (speed: number): number => (CONFIG.vision.radarCellU / speed) * 1000;
    expect(WAKE_STAMP_MIN_MS).toBeCloseTo(cellCrossMs(FASTEST_AFLOAT_SPEED), 9);
    const boostedHull = FASTEST_HULL_SPEED + CONFIG.speedBoost.speedBonus;
    for (const speed of [FASTEST_HULL_SPEED, boostedHull, CONFIG.torpedo.speed]) {
      expect(WAKE_STAMP_MIN_MS, `a source at ${speed} u/s`).toBeLessThanOrEqual(cellCrossMs(speed) + 1e-9);
    }
    // And it is a TRUE attainable bound, not the base envelope's.
    expect(FASTEST_AFLOAT_SPEED).toBeGreaterThan(FASTEST_HULL_SPEED);
  });

  // P6 — THE SIGHT RADIUS IS PART OF THE KEY. A dazzle onset/end moves
  // `sightHoleU` with nothing else changing:
  // same observer, same segment set, same clock. Without it in the key, a
  // stationary observer double-painted (or blanked) the sight-delta band for up
  // to a full rebuild interval. It is checked AHEAD of the rate floor because a
  // step function of dazzle cannot churn.
  it('rebuilds the instant the sight radius moves, even inside the rate floor', () => {
    const sources = new WakeSources();
    const h = hull('a', 'battleship', 200, 30);
    sources.observe(h, 0);
    h.x += STEP_U + 1;
    sources.observe(h, 50);
    const cache = new WakeStampCache();
    const own = { x: 0, y: 0 };
    // Dazzled: the segment at ~200u is OUTSIDE a halved bubble, so the wire owns
    // it and this stamp is empty.
    const dazzled = cache.stampFor(sources, own, CONFIG.vision.sight / 2, 50, CELL, MODEL);
    expect(dazzled.size).toBe(0);
    // The dazzle ends one frame later — well inside the rate floor.
    const clear = cache.stampFor(sources, own, CONFIG.vision.sight, 60, CELL, MODEL);
    expect(clear).not.toBe(dazzled);
    expect(clear.size).toBeGreaterThan(0);
    // ...and back again, so the key is bidirectional rather than a ratchet.
    const again = cache.stampFor(sources, own, CONFIG.vision.sight / 2, 70, CELL, MODEL);
    expect(again.size).toBe(0);
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
  // THE GUARANTEE HOLDS AT THE BASE SWEEP RATE ONLY, and that is a RULING rather
  // than an oversight (cycle-69 review gate, P4). The phosphor window is three
  // REVOLUTIONS, not a fixed span, so a maxed `intelSweep` build halves it: 3 ×
  // 2s = 6s against 12s water. Ruled ACCEPTED because amendment 195 forbids a
  // wake-specific paint lifetime and a global fixed-ms window would re-price
  // intelSweep for EVERY paint (an Eric decision, not a patch) — and because the
  // degradation is partial: a maxed sweep repaints every DISCLOSED stretch twice
  // as often, so only water that has STOPPED disclosing (the handover stretch)
  // fades early. These mirror the ruled pin pair in shared zone.test.ts; this
  // side additionally pins `persistSweeps` itself, because the shared oracle has
  // to write that 3 as a LITERAL (shared may not import client config) and a
  // silent drift there would leave both sides agreeing about nothing.
  it('pins the phosphor window at three paints, the literal the shared oracle assumes', () => {
    expect(CLIENT_CONFIG.blip.persistSweeps).toBe(3);
  });

  it('phosphor exactly covers the water clock AT THE BASE SWEEP RATE', () => {
    const sweepMs = 60_000 / CONFIG.vision.sweepRpm;
    const phosphorMs = CLIENT_CONFIG.blip.persistSweeps * sweepMs;
    // Worst case: a stretch is painted a full revolution after it was laid, and
    // must still be lit when the water finally dissipates.
    expect(phosphorMs).toBeGreaterThanOrEqual(LIFE_MS);
  });

  it('and AT sweepRpmMax TOO — cycle 69\'s accepted shortfall is resolved by the 5.5s clock (amendment 213)', () => {
    // Was `=== LIFE_MS / 2`, documenting a hole: 6s of phosphor against 12s of
    // water on a maxed intelSweep build. The shorter clock closes it, so the
    // handover guarantee now holds at EVERY sweep rate rather than only the
    // base one, and this asserts the covering instead of the shortfall.
    const sweepMs = 60_000 / CONFIG.vision.sweepRpmMax;
    expect(CLIENT_CONFIG.blip.persistSweeps * sweepMs).toBeGreaterThanOrEqual(LIFE_MS);
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

  it('and the hull sailing back OUT hands its track back to the wire — and to phosphor', () => {
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
    // Out of the bubble it stops being a contact, so the client stops EARNING
    // that water and stops synthesizing it (cycle-69 review gate, P5 — this used
    // to keep stamping for up to a full water life, which is the same mechanism
    // that revealed a hull hiding behind an island inside the bubble).
    for (let i = 0; i < 20; i++) {
      t += 50;
      effects.update(0.05, t, []);
    }
    expect(buildTruesightWakeStamp(effects.wakeSources, own, sight, t, CELL, MODEL).size).toBe(0);
    // NOTHING GOES DARK, and the three clocks are why: every stretch of that
    // water was painted within one revolution of being laid, and a paint lasts
    // three — so a stretch still alive necessarily still has a live paint behind
    // it (the inequality pinned above). The client REMEMBERS the water too: the
    // ribbon and its foam are intact and age out on their own clock (amendment
    // 200), so the track reappears the instant the hull is observed again.
    expect(effects.wakeSources.get('outbound')?.ribbon.count ?? 0).toBeGreaterThan(1);
    expect(effects.liveWakeDots).toBeGreaterThan(0);
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

  // FOLLOW-UP 2, RULED: the truesight emitter DOES synthesize a fish's water
  // inside the detect rung. The server's inner bound for torpedo water is
  // `sight × detectFactor` (review-gate P2), so the client's complement must be
  // the same radius or the (detect, sight] band double-paints against the wire
  // — and inside detect the fish is revealed, so the client holds exactly the
  // pose the synthesis needs. "The visible fish is the track's legitimate end"
  // was the alternative and it loses: the track would visibly stop growing at
  // 247.5u while its foam ran on, which is the same class of split amendment
  // 154 exists to forbid.
  it('is synthesized inside the DETECT rung and left to the wire beyond it', () => {
    const detect = CONFIG.vision.sight * CONFIG.vision.detectFactor;
    const own = { x: 0, y: 0 };

    const near = new WakeSources();
    const a = fish('near', detect * 0.5);
    near.observe(a, 0);
    a.x += STEP_U + 1;
    near.observe(a, 50);
    expect(buildTruesightWakeStamp(near, own, CONFIG.vision.sight, 50, CELL, MODEL).size).toBeGreaterThan(0);

    // Between detect and sight: the SERVER discloses this water, so the client
    // must not — one cell claimed twice would be a double paint.
    const mid = new WakeSources();
    const b = fish('mid', (detect + CONFIG.vision.sight) / 2);
    mid.observe(b, 0);
    b.x += STEP_U + 1;
    mid.observe(b, 50);
    expect(buildTruesightWakeStamp(mid, own, CONFIG.vision.sight, 50, CELL, MODEL).size).toBe(0);

    // ...while a HULL at that same range IS the client's, because its inner
    // bound is the sight bubble. The two bounds are per source, not one radius.
    const hulls = new WakeSources();
    const c = hull('hull', 'battleship', (detect + CONFIG.vision.sight) / 2, 30);
    hulls.observe(c, 0);
    c.x += STEP_U + 1;
    hulls.observe(c, 50);
    expect(buildTruesightWakeStamp(hulls, own, CONFIG.vision.sight, 50, CELL, MODEL).size).toBeGreaterThan(0);
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
    // stampable on the next life's scope.
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

// --- P8: THE DOC-DRIFT GUARD ----------------------------------------------------
//
// The wake comments cited `World.stepWakes`, a method that has never existed
// (the server's is `sampleWakes`). A wrong cross-reference is worse than none:
// it is what sends the next agent looking in the wrong file for the contract
// the comment claims to mirror. This is the mechanical half — the other two P8
// drifts are pinned by behaviour instead (`maxDots`' derivation against
// `CONFIG.map.playerCap` above, and the rebuild cadence's honest one-bucket
// bound below).

describe('the wake comments name methods that exist', () => {
  // Resolved rather than assumed, so the scan is correct whichever root vitest
  // was invoked from (`npm test -w client` puts cwd at client/; a repo-root
  // invocation does not).
  const SRC = existsSync(join(process.cwd(), 'src', 'render'))
    ? join(process.cwd(), 'src')
    : join(process.cwd(), 'client', 'src');

  function bodies(dir: string, out: { path: string; body: string }[]): { path: string; body: string }[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__') bodies(full, out);
      } else if (/\.ts$/.test(e.name)) {
        out.push({ path: full, body: readFileSync(full, 'utf8') });
      }
    }
    return out;
  }

  it('no client source cites the non-existent World.stepWakes', () => {
    const offenders = bodies(SRC, []).filter((f) => f.body.includes('stepWakes'));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });
});

describe('the cached stamp is at most ONE bucket stale, which is what its comment now claims', () => {
  it('holds a bucket-boundary crossing for less than one bucket width', () => {
    // The retired claim was that the rebuild cadence "cannot show a stale
    // intensity". It can: a segment that crosses a bucket boundary just after a
    // rebuild keeps its previous bucket until the next one. What is TRUE — and
    // what the corrected comment says — is that the staleness is bounded by one
    // bucket width, a quarter of the water's whole life.
    expect(WAKE_STAMP_REBUILD_MS).toBe(LIFE_MS / WAKE_AGE_BUCKETS);
    const sources = new WakeSources();
    const h = hull('a', 'battleship', 30, 30);
    sources.observe(h, 0);
    h.x += STEP_U + 1;
    sources.observe(h, 50);
    const cache = new WakeStampCache();
    const own = { x: 0, y: 0 };
    const peak = (m: Map<number, { refl: number }>): number =>
      m.size === 0 ? 0 : Math.max(...[...m.values()].map((s) => s.refl));
    const src = sources.get('a')!;

    const first = cache.stampFor(sources, own, CONFIG.vision.sight, 50, CELL, MODEL);
    const p0 = peak(first);
    // Just under one bucket later the water has aged a whole bucket, and the
    // cache is still allowed to be showing the old intensity...
    const nearly = 50 + WAKE_STAMP_REBUILD_MS - 1;
    src.seenMs = nearly;
    expect(peak(cache.stampFor(sources, own, CONFIG.vision.sight, nearly, CELL, MODEL))).toBe(p0);
    // ...but no longer than that.
    const past = 50 + WAKE_STAMP_REBUILD_MS + 1;
    src.seenMs = past;
    expect(peak(cache.stampFor(sources, own, CONFIG.vision.sight, past, CELL, MODEL))).toBeLessThan(p0);
  });
});
