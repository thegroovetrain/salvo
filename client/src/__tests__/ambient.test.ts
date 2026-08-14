// THE HOME SCENE's pure composer (render/ambientScene.ts, cycle 82).
//
// The Story 1.14 suite this replaces pinned `ambientScale`/`ringLayout` — the
// viewport-FRACTION layout that fitted reference-authored ring radii to the
// screen. Both are RETIRED with the geometry they described: the scene is in
// world units under the real camera transform now, so there is no reference
// height and no ring stack to scale. `sweepAngleAt`/`sweepCrossed` survive
// unchanged (they were always the game's own paint rule) and are extended here.
//
// What is new is that the scene's COMPOSITION is testable at all: the seeded
// world build, the open-water helm, the two-tier perception split and the motion
// setting are pure functions over plain objects, so every row of the spec's
// I/O matrix is an assertion rather than a screenshot. The Pixi shell
// (render/ambient.ts) stays visual-QA only, per the repo pattern.

import { describe, it, expect } from 'vitest';
import { CONFIG, generateMap, islandFromPolygon, type Island } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  MAX_FRAME_MS,
  advanceAmbient,
  ambientCameraTarget,
  ambientContacts,
  ambientPaints,
  buildAmbientWorld,
  clampFrameMs,
  coastClearance,
  rangeTo,
  sighted,
  sweepAngleAt,
  sweepCrossed,
  type AmbientMapLike,
  type AmbientWorld,
} from '../render/ambientScene.js';

const A = CLIENT_CONFIG.home.ambient;
const TAU = Math.PI * 2;

/** An island-free ocean — the fixture for every perception assertion, where the
 *  question is a RANGE or a BEARING and terrain would only add noise. */
const OPEN: AmbientMapLike = { radius: 2400, islands: [] };

/** The real generated ocean the scene actually ships against. Built once: the
 *  fBm field is the expensive part of these tests, and it is deterministic. */
const REAL = generateMap(A.mapSeed, CONFIG.map.playerCap);

/** Every hull's pose as comparable data — the determinism probe. */
function poses(w: AmbientWorld): string {
  return w.hulls.map((h) => `${h.id}|${h.state.x}|${h.state.y}|${h.state.heading}|${h.state.speed}`).join('\n');
}

/** Put a hull at an exact bearing/range off the observer (perception fixtures
 *  drive the predicate, so the pose is set rather than sailed to). */
function place(w: AmbientWorld, i: number, bearing: number, range: number): void {
  const o = w.observer.state;
  w.hulls[i].state.x = o.x + Math.cos(bearing) * range;
  w.hulls[i].state.y = o.y + Math.sin(bearing) * range;
}

// --- the beam: the paint rule, unchanged since Story 1.14 ----------------------

describe('sweepAngleAt — continuous full revolution', () => {
  it('maps elapsed/period onto [0, 2π)', () => {
    expect(sweepAngleAt(0, 8000)).toBe(0);
    expect(sweepAngleAt(2000, 8000)).toBeCloseTo(Math.PI / 2, 9);
    expect(sweepAngleAt(4000, 8000)).toBeCloseTo(Math.PI, 9);
  });

  it('wraps at a full period (no flash/jump — modular)', () => {
    expect(sweepAngleAt(8000, 8000)).toBe(0);
    expect(sweepAngleAt(10000, 8000)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('guards a degenerate period', () => {
    expect(sweepAngleAt(1234, 0)).toBe(0);
  });
});

describe('sweepCrossed — the paint rule: light ONLY when the beam crosses', () => {
  it('paints a bearing inside the advanced interval', () => {
    expect(sweepCrossed(0.1, 0.3, 0.2)).toBe(true);
  });

  it('does not paint a bearing ahead of or behind the interval', () => {
    expect(sweepCrossed(0.1, 0.3, 0.5)).toBe(false); // beam hasn't reached it
    expect(sweepCrossed(0.1, 0.3, 0.05)).toBe(false); // beam already passed it
  });

  it('is half-open (prev, cur]: exactly-at-new-beam paints, exactly-at-prev does not', () => {
    expect(sweepCrossed(0.1, 0.3, 0.3)).toBe(true);
    expect(sweepCrossed(0.1, 0.3, 0.1)).toBe(false);
  });

  it('handles the 2π wrap (beam passing through zero)', () => {
    expect(sweepCrossed(TAU - 0.1, 0.1, 0.0)).toBe(true);
    expect(sweepCrossed(TAU - 0.1, 0.1, TAU - 0.05)).toBe(true);
    expect(sweepCrossed(TAU - 0.1, 0.1, 0.2)).toBe(false);
  });

  it('a stationary beam never paints', () => {
    expect(sweepCrossed(1.0, 1.0, 1.0)).toBe(false);
    expect(sweepCrossed(1.0, 1.0, 2.0)).toBe(false);
  });

  it('one revolution paints each bearing exactly once (no double-paint across steps)', () => {
    // Walk a full revolution in uneven steps; a fixed bearing must paint once.
    const bearing = 4.0;
    const steps = [0, 0.9, 1.7, 2.6, 3.4, 4.4, 5.1, 6.0, TAU];
    let paints = 0;
    for (let i = 1; i < steps.length; i++) {
      if (sweepCrossed(steps[i - 1] % TAU, steps[i] % TAU, bearing)) paints++;
    }
    expect(paints).toBe(1);
  });
});

// --- the dt clamp: the trap `Ticker.deltaMS` sets ------------------------------

describe('clampFrameMs — a backgrounded tab must not teleport the fleet', () => {
  it('passes an ordinary frame through untouched', () => {
    expect(clampFrameMs(16.7)).toBe(16.7);
  });

  it('clamps a tab-stall frame to the ceiling', () => {
    expect(clampFrameMs(30_000)).toBe(MAX_FRAME_MS);
  });

  it('answers 0 for anything non-finite or non-positive', () => {
    expect(clampFrameMs(0)).toBe(0);
    expect(clampFrameMs(-5)).toBe(0);
    expect(clampFrameMs(Number.NaN)).toBe(0);
  });

  it('and a stalled frame really is bounded IN THE WORLD, not just in the number', () => {
    const stalled = buildAmbientWorld(OPEN);
    const steady = buildAmbientWorld(OPEN);
    advanceAmbient(stalled, OPEN, 30_000, 'full');
    advanceAmbient(steady, OPEN, MAX_FRAME_MS, 'full');
    expect(poses(stalled)).toBe(poses(steady));
  });
});

// --- the seeded world build ---------------------------------------------------

describe('buildAmbientWorld — one seed, one picture', () => {
  it('is deterministic: the same (map, seed) builds byte-identical hulls', () => {
    expect(poses(buildAmbientWorld(REAL))).toBe(poses(buildAmbientWorld(REAL)));
    expect(buildAmbientWorld(REAL).anchor).toEqual(buildAmbientWorld(REAL).anchor);
  });

  it('a different seed builds a different picture (the seed is really consumed)', () => {
    expect(poses(buildAmbientWorld(REAL, A.seed + 1))).not.toBe(poses(buildAmbientWorld(REAL)));
  });

  it('and stepping is deterministic too — same world, same dt sequence, same poses', () => {
    const a = buildAmbientWorld(REAL);
    const b = buildAmbientWorld(REAL);
    for (const dt of [16, 17, 33, 16, 50, 16]) {
      advanceAmbient(a, REAL, dt, 'full');
      advanceAmbient(b, REAL, dt, 'full');
    }
    expect(poses(a)).toBe(poses(b));
  });

  it('seats one rival inside the bubble and the rest out in the radar annulus — '
    + 'both tiers of the vision model are on screen', () => {
    const w = buildAmbientWorld(REAL);
    const near = w.hulls.slice(1).filter((h) => rangeTo(w, h) <= w.stats.sightRange);
    const annulus = w.hulls
      .slice(1)
      .filter((h) => rangeTo(w, h) > w.stats.sightRange && rangeTo(w, h) <= w.stats.radarRange);
    expect(near.length, 'a truesighted hull').toBeGreaterThanOrEqual(1);
    expect(annulus.length, 'hulls that exist only as returns').toBeGreaterThanOrEqual(1);
    expect(near.length + annulus.length, 'and nothing is off the scope').toBe(w.hulls.length - 1);
  });

  it('the outermost band can never outrun the scope, by construction', () => {
    // The reach the config promises: the farthest a rival may hold from the
    // anchor, plus the farthest the observer may hold from it.
    const reach = Math.max(...A.rivalBands.map((b) => b.maxU)) + A.observerRoamU;
    expect(reach).toBeLessThanOrEqual(CONFIG.vision.radar);
  });

  it('ranges and the sweep period come from effectiveStats, never a literal', () => {
    const w = buildAmbientWorld(OPEN);
    expect(w.stats.sightRange).toBe(CONFIG.vision.sight);
    expect(w.stats.radarRange).toBe(CONFIG.vision.radar);
    expect(w.stats.sweepPeriodMs).toBe(60_000 / CONFIG.vision.sweepRpm);
  });
});

// --- the helm: open water, by construction ------------------------------------

describe('the helm keeps every hull in open water', () => {
  it('never puts a hull ashore, over a long run on the REAL generated ocean', () => {
    const w = buildAmbientWorld(REAL);
    // 150s of scene time at the sim cadence — many laps of every band, and long
    // enough for a hull to have wandered into any coast its route passes.
    for (let i = 0; i < 3000; i += 1) {
      advanceAmbient(w, REAL, 50, 'full');
      for (const h of w.hulls) {
        expect(coastClearance(h.state, REAL.islands), `${h.id} at step ${i}`).toBeGreaterThan(0);
      }
    }
    // ...and nowhere near the map boundary either: the formation is held about
    // an anchor well inside the disc, so the rim is never a factor.
    for (const h of w.hulls) {
      expect(Math.hypot(h.state.x, h.state.y)).toBeLessThan(REAL.radius * 0.9);
    }
  });

  it('holds each hull inside the annulus it was given', () => {
    const w = buildAmbientWorld(REAL);
    for (let i = 0; i < 1200; i += 1) advanceAmbient(w, REAL, 50, 'full');
    for (const h of w.hulls) {
      const r = Math.hypot(h.state.x - w.anchor.x, h.state.y - w.anchor.y);
      // Slack for the band spring's overshoot and for a coast detour; the point
      // is that a hull never simply sails away from the scene.
      expect(r, `${h.id} inside its band`).toBeLessThan(h.maxU + A.avoidU * 2);
    }
  });

  it('gets hulls actually under way (a still picture is not the ask)', () => {
    const w = buildAmbientWorld(OPEN);
    for (let i = 0; i < 200; i += 1) advanceAmbient(w, OPEN, 50, 'full');
    for (const h of w.hulls) expect(h.state.speed, h.id).toBeGreaterThan(1);
  });
});

// --- the motion setting: the gap Story 1.14 left open --------------------------

describe('the motion setting is honoured (settings/store: off removes MOTION, never information)', () => {
  it('motion: off freezes hull travel and the camera with it', () => {
    const w = buildAmbientWorld(OPEN);
    for (let i = 0; i < 40; i += 1) advanceAmbient(w, OPEN, 50, 'full');
    const held = poses(w);
    const camera = ambientCameraTarget(w);
    for (let i = 0; i < 40; i += 1) advanceAmbient(w, OPEN, 50, 'off');
    expect(poses(w), 'not one hull moved').toBe(held);
    expect(ambientCameraTarget(w), 'so the camera target did not either').toEqual(camera);
  });

  it('...but the clock and the BEAM keep running, so the picture stays whole', () => {
    const w = buildAmbientWorld(OPEN);
    const t0 = w.elapsedMs;
    const beam0 = w.sweepAngle;
    for (let i = 0; i < 10; i += 1) advanceAmbient(w, OPEN, 50, 'off');
    expect(w.elapsedMs, 'phosphor still decays against a running clock').toBe(t0 + 500);
    expect(w.sweepAngle, 'and the scope still sweeps').not.toBe(beam0);
  });

  it('motion: reduced is half amplitude — half the travel over the same time', () => {
    const start = buildAmbientWorld(OPEN).observer.state;
    const full = buildAmbientWorld(OPEN);
    const half = buildAmbientWorld(OPEN);
    // One step from rest, so the comparison is a clean function of the scaled
    // dt (acceleration has not yet had time to make the two paths diverge).
    advanceAmbient(full, OPEN, 100, 'full');
    advanceAmbient(half, OPEN, 100, 'reduced');
    const moved = (w: AmbientWorld): number =>
      Math.hypot(w.observer.state.x - start.x, w.observer.state.y - start.y);
    expect(half.observer.state.speed).toBeCloseTo(full.observer.state.speed / 2, 6);
    expect(moved(half)).toBeLessThan(moved(full));
    expect(moved(full)).toBeGreaterThan(0);
  });
});

// --- perception: the two-tier split -------------------------------------------

describe('ambientPaints — the beyond-truesight paint decision', () => {
  it('paints a hull in the annulus exactly when the beam crosses its bearing', () => {
    const w = buildAmbientWorld(OPEN);
    place(w, 1, 0.2, w.stats.sightRange + 100);
    // The other rivals are put off the scope entirely, so the count below is
    // this one hull's paints and nothing else's.
    place(w, 2, 1.0, w.stats.radarRange + 200);
    place(w, 3, 2.0, w.stats.radarRange + 200);
    // The beam has to actually advance ONTO the bearing; drive the clock until
    // it does and count how many advances painted.
    let paints = 0;
    let sweeps = 0;
    for (let i = 0; i < 200; i += 1) {
      const tick = advanceAmbient(w, OPEN, 50, 'off');
      if (sweepCrossed(tick.prevSweep, tick.sweep, 0.2)) sweeps += 1;
      paints += ambientPaints(w, tick).length;
    }
    expect(sweeps, 'the beam did pass it').toBeGreaterThan(0);
    expect(paints, 'and it painted on exactly those advances').toBe(sweeps);
  });

  it('a hull INSIDE truesight never paints — it is a contact, not a return', () => {
    const w = buildAmbientWorld(OPEN);
    for (const h of w.hulls.slice(1)) {
      h.state.x = w.observer.state.x + 10;
      h.state.y = w.observer.state.y + 10;
    }
    let paints = 0;
    for (let i = 0; i < 200; i += 1) paints += ambientPaints(w, advanceAmbient(w, OPEN, 50, 'off')).length;
    expect(paints).toBe(0);
  });

  it('a hull BEYOND radar range never paints either', () => {
    const w = buildAmbientWorld(OPEN);
    for (const h of w.hulls.slice(1)) place(w, w.hulls.indexOf(h), 1.0, w.stats.radarRange + 50);
    let paints = 0;
    for (let i = 0; i < 200; i += 1) paints += ambientPaints(w, advanceAmbient(w, OPEN, 50, 'off')).length;
    expect(paints).toBe(0);
  });
});

describe('ambientContacts — the truesight source, with the shipped LOS rule', () => {
  it('reports a hull inside the bubble and nothing outside it', () => {
    const w = buildAmbientWorld(OPEN);
    place(w, 1, 0, w.stats.sightRange * 0.5);
    place(w, 2, 1, w.stats.sightRange + 60);
    place(w, 3, 2, w.stats.sightRange + 120);
    const ids = ambientContacts(w, []).map((c) => c.id);
    expect(ids).toEqual([w.hulls[1].id]);
  });

  it('never reports the observer itself', () => {
    const w = buildAmbientWorld(OPEN);
    for (const h of w.hulls.slice(1)) place(w, w.hulls.indexOf(h), 0, 50);
    expect(ambientContacts(w, []).some((c) => c.id === w.observer.id)).toBe(false);
  });

  it('an island between them hides a hull that is otherwise in plain sight — '
    + 'islands block every sensor, at every range (Eric ruling 2026-08-02)', () => {
    const w = buildAmbientWorld(OPEN);
    place(w, 1, 0, w.stats.sightRange * 0.6);
    const o = w.observer.state;
    const mid = { x: (o.x + w.hulls[1].state.x) / 2, y: (o.y + w.hulls[1].state.y) / 2 };
    const blocker: Island = islandFromPolygon([
      { x: mid.x - 40, y: mid.y - 40 },
      { x: mid.x + 40, y: mid.y - 40 },
      { x: mid.x + 40, y: mid.y + 40 },
      { x: mid.x - 40, y: mid.y + 40 },
    ]);
    expect(sighted(w, w.hulls[1], [])).toBe(true);
    expect(sighted(w, w.hulls[1], [blocker])).toBe(false);
    expect(ambientContacts(w, [blocker])).toEqual([]);
  });
});

// --- the camera: DOM legibility is a gate -------------------------------------

describe('ambientCameraTarget — the observer is seated OFF-CENTRE', () => {
  it('looks left of the hull, so the bright sight bubble lands on the right flank', () => {
    const w = buildAmbientWorld(OPEN);
    const t = ambientCameraTarget(w);
    expect(t.x - w.observer.state.x).toBeCloseTo(A.observerOffset.x, 9);
    expect(t.y - w.observer.state.y).toBeCloseTo(A.observerOffset.y, 9);
    expect(A.observerOffset.x, 'negative: the camera sits to port of the hull').toBeLessThan(0);
  });

  it('pushes the whole sight bubble clear of a half-column of centred DOM', () => {
    // The offset is what keeps the one BRIGHT region off the ~480px home column.
    // Measured in world units against the bubble's own radius, so the check
    // holds at every zoom: the bubble's near edge must clear screen centre.
    expect(Math.abs(A.observerOffset.x)).toBeGreaterThan(CONFIG.vision.sight);
  });

  it('carries the hull own heading and speed, so the follow smoother behaves', () => {
    const w = buildAmbientWorld(OPEN);
    for (let i = 0; i < 20; i += 1) advanceAmbient(w, OPEN, 50, 'full');
    const t = ambientCameraTarget(w);
    expect(t.heading).toBe(w.observer.state.heading);
    expect(t.speed).toBe(w.observer.state.speed);
  });
});
