// WOUNDED SMOKE puff math (render/smoke.ts) — the pure core the Pixi adapter
// animates: alpha and radius over a puff's AGE, the motion-scaled drift and
// billow, the tier split, and the global-only cap.
//
// Three things in here are contract, not coverage:
//   • `puffLifeMs` is DESIGN-LOAD-BEARING (amendment 43). Puffs are emitted at
//     the hull's position, so a moving ship necessarily leaves them behind, and
//     the lifetime is the only thing separating the attached plume Eric ratified
//     from the decaying TRACK he explicitly rejected. The tail-length pin below
//     is what makes a silent creep of that value fail CI.
//   • `motion: 'off'` must remove MOTION and never INFORMATION
//     (effects.ts:44-53). Presence, extent and tier survive intact; only drift
//     and billow go to zero. This is the OPPOSITE of `isJuiceEffect` gating.
//   • The cap is GLOBAL ONLY. Amendment 45 forbids any correlation handle on
//     the wire, so puffs cannot be grouped by source and no per-source cap can
//     exist. There is deliberately no key here to test.

import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, type SmokeEvent } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  puffAlpha,
  puffBillow,
  puffDrift,
  puffRadius,
  puffSpawnTimes,
  smokeTier,
  Smoke,
} from '../render/smoke.js';
import { capOldest } from '../util/pool.js';
import { motionIntensity } from '../settings/store.js';

const S = CLIENT_CONFIG.smoke;
const LIFE = S.puffLifeMs;
const LIGHT = S.light;
const HEAVY = S.heavy;

/** A drift of exactly nothing. Asserted per-axis rather than by deep equality
 *  because a wind component times an intensity of 0 lands on IEEE `-0`, which
 *  `toEqual` distinguishes from `0` and a rendered position does not. */
function expectStill(d: { dx: number; dy: number }): void {
  expect(d.dx).toBeCloseTo(0, 12);
  expect(d.dy).toBeCloseTo(0, 12);
}

// --- the bands are ONE set of numbers (amendment 41) --------------------------

describe('the damage bands are single-sourced from shared CONFIG', () => {
  it('CLIENT_CONFIG.vitals bands ARE CONFIG.damageBands, not a copy of them', () => {
    // The rail (hpColor/railPulsing) and the smoke tier must never be able to
    // fork: exactly one set of band numbers may exist in the codebase, so a
    // future retune of the rail moves the plume with it. This test pins the
    // IDENTITY; the comment in config.ts pins the intent.
    expect(CLIENT_CONFIG.vitals.amberBelow).toBe(CONFIG.damageBands.amberBelow);
    expect(CLIENT_CONFIG.vitals.criticalBelow).toBe(CONFIG.damageBands.criticalBelow);
  });

  it('leaves the rail byte-identical to its shipped values', () => {
    expect(CLIENT_CONFIG.vitals.amberBelow).toBe(0.5);
    expect(CLIENT_CONFIG.vitals.criticalBelow).toBe(0.25);
  });
});

// --- tier selection (amendment 41: an ENUM, never a fraction) -----------------

describe('smokeTier — the wire enum picks a presentation, nothing else', () => {
  it('maps 1 → light and 2 → heavy', () => {
    expect(smokeTier(1)).toBe(LIGHT);
    expect(smokeTier(2)).toBe(HEAVY);
  });

  it('makes the two tiers unmistakable in COUNT, EXTENT and OPACITY at once', () => {
    // Severity must survive a glance and a colorblind read alike, so it rides
    // three non-hue channels rather than one. Both tiers draw in the same
    // woundedSmoke colour on purpose — nothing about severity is hue-coded.
    expect(HEAVY.puffs).toBeGreaterThan(LIGHT.puffs);
    expect(HEAVY.r1).toBeGreaterThan(LIGHT.r1 * 1.5);
    expect(HEAVY.peakAlpha).toBeGreaterThan(LIGHT.peakAlpha * 1.5);
  });

  it('carries no identity channel of any kind in the tier table', () => {
    // Amendment 45: position and severity, never identity. If a hue, id or
    // class ever appears in a tier spec, the renderer has grown a channel the
    // wire deliberately refuses to feed it.
    for (const t of [LIGHT, HEAVY]) {
      expect(Object.keys(t).sort()).toEqual(['peakAlpha', 'puffs', 'r0', 'r1', 'stagger']);
    }
  });
});

// --- alpha ----------------------------------------------------------------------

describe('puffAlpha — bloom in, then fade to nothing across the life', () => {
  it('is dead at exactly one life and beyond', () => {
    expect(puffAlpha(LIFE, LIFE, 1)).toBe(0);
    expect(puffAlpha(LIFE * 3, LIFE, 1)).toBe(0);
  });

  it('blooms from ~nothing just after birth to the tier peak at the top of the rise', () => {
    // Age 0 itself is the non-positive floor (see the next describe block) and
    // reads as fully risen; the ascending ramp is only visible strictly after it.
    expect(puffAlpha(1, LIFE, 1)).toBeCloseTo(0, 1);
    const top = LIFE * S.riseFraction;
    // At the top of the rise the only remaining factor is the linear fade.
    expect(puffAlpha(top, LIFE, 1)).toBeCloseTo(1 - S.riseFraction, 12);
  });

  it('never exceeds the tier peak, and scales linearly with it', () => {
    for (const age of [0, 100, 400, LIFE / 2, LIFE - 1]) {
      expect(puffAlpha(age, LIFE, LIGHT.peakAlpha)).toBeLessThanOrEqual(LIGHT.peakAlpha);
      expect(puffAlpha(age, LIFE, HEAVY.peakAlpha)).toBeCloseTo(
        puffAlpha(age, LIFE, LIGHT.peakAlpha) * (HEAVY.peakAlpha / LIGHT.peakAlpha),
        12,
      );
    }
  });

  it('decays monotonically once the bloom is over — a plume never re-brightens', () => {
    const top = LIFE * S.riseFraction;
    let prev = puffAlpha(top, LIFE, 1);
    for (let age = top + 50; age < LIFE; age += 50) {
      const a = puffAlpha(age, LIFE, 1);
      expect(a).toBeLessThan(prev);
      prev = a;
    }
  });

  it('treats a negative age (clock jitter) as exactly newborn, and finite', () => {
    // See the dedicated regression describe block below for the full story.
    // The alpha at a non-positive age is legitimately 0 — it is the foot of
    // the bloom-in ramp. What must NEVER happen is that 0 being read as
    // "dead": `render()` retires on AGE, so a newborn puff survives to rise.
    expect(puffAlpha(-200, LIFE, 1)).toBe(puffAlpha(0, LIFE, 1));
    expect(Number.isFinite(puffAlpha(-200, LIFE, 1))).toBe(true);
  });
});

// --- REGRESSION: a puff born at non-positive age must not be destroyed forever --
//
// The server-clock estimate slews toward a rolling-min offset; whenever
// network transit improves mid-match, an incoming `sm` pulse's spawn
// timestamp can briefly read AHEAD of the observer's own serverNow, which is
// a NEGATIVE age on that puff's first render. `puffAlpha` collapsing that to
// exactly 0 combined with `render()` retiring on `alpha <= 0` deleted the
// puff permanently — losing its entire disclosure window rather than one
// frame of it. See the file header of render/smoke.ts.

describe('a puff born at non-positive age is disclosed, not deleted (adjudicated fix)', () => {
  it('puffAlpha treats a negative age as exactly newborn — continuous at the origin', () => {
    // The fix is a CLAMP, not a special case: a jitter-negative age must land
    // on exactly the same point of the bloom-in ramp as age 0, so the curve has
    // no discontinuity at the origin. Returning FULL alpha for age <= 0 (the
    // `blipAlpha` shape) would pop the puff bright for one frame and then drop
    // it to near-nothing a millisecond later, which is a visible artifact
    // precisely when the clock is already slewing.
    const atZero = puffAlpha(0, LIFE, HEAVY.peakAlpha);
    expect(puffAlpha(-30, LIFE, HEAVY.peakAlpha)).toBe(atZero);
    expect(puffAlpha(-5_000, LIFE, HEAVY.peakAlpha)).toBe(atZero);
    // ...and the ramp still ASCENDS out of the origin rather than starting lit.
    expect(puffAlpha(LIFE * 0.05, LIFE, HEAVY.peakAlpha)).toBeGreaterThan(atZero);
  });

  it('a puff whose first render lands at a negative age survives that frame instead of being retired', () => {
    const smoke = new Smoke(new Container());
    const e: SmokeEvent = { k: 'sm', x: 100, y: -40, tier: 2 };
    const spawnT = 10_000;
    smoke.onSmoke(e, spawnT);
    const spawnedCount = smoke.livePuffs;
    expect(spawnedCount).toBeGreaterThan(0);

    // The observer's serverNow is BEHIND the pulse's own spawn timestamp on
    // its first render — exactly the clock-slew scenario this fix covers.
    smoke.render(spawnT - 30);
    expect(smoke.livePuffs).toBe(spawnedCount); // nothing deleted for one bad frame

    // It keeps aging normally afterward...
    smoke.render(spawnT + LIFE / 2);
    expect(smoke.livePuffs).toBeGreaterThan(0);

    // ...and still retires on schedule once its life is actually up.
    smoke.render(spawnT + LIFE + 1);
    expect(smoke.livePuffs).toBe(0);
  });
});

// --- radius ---------------------------------------------------------------------

describe('puffRadius — smoke disperses as it ages', () => {
  it('runs r0 at birth to r1 at death, linearly', () => {
    expect(puffRadius(0, LIFE, 5, 25)).toBe(5);
    expect(puffRadius(LIFE, LIFE, 5, 25)).toBe(25);
    expect(puffRadius(LIFE / 2, LIFE, 5, 25)).toBeCloseTo(15, 12);
  });

  it('clamps past a full life instead of growing without bound', () => {
    expect(puffRadius(LIFE * 10, LIFE, 5, 25)).toBe(25);
  });

  it('keeps a heavy puff wider than a light one at every age', () => {
    for (const age of [0, 300, 700, LIFE]) {
      const light = puffRadius(age, LIFE, LIGHT.r0, LIGHT.r1);
      const heavy = puffRadius(age, LIFE, HEAVY.r0, HEAVY.r1);
      expect(heavy).toBeGreaterThan(light);
    }
  });
});

// --- THE COLUMN IS NOT A TRACK (amendment 43) -----------------------------------

describe('puffLifeMs keeps the plume an ATTACHED COLUMN, never a track', () => {
  // Eric explicitly REJECTED a decaying trail of puffs left in the water: it
  // would encode course, speed and origin — continuous ghost blips, a strictly
  // larger disclosure than "a hull is hurt, right there". Puff lifetime is the
  // ONLY knob deciding which of the two ships, so it is pinned here.
  const CLASSES = ['torpedoBoat', 'battleship', 'mineLayer'] as const;
  const FASTEST = Math.max(...CLASSES.map((id) => CONFIG.shipClasses[id].kinematics.maxSpeed));

  it('leaves a tail shorter than one hull length at flank speed', () => {
    const tailU = FASTEST * (LIFE / 1000);
    const shortestHullU = Math.min(...CLASSES.map((id) => CONFIG.shipClasses[id].hull.length));
    // ~63u behind a ~100u hull: smoke off the stern, not a line to follow.
    expect(tailU).toBeLessThan(shortestHullU);
  });

  it('holds enough live puffs at the server cadence to read as a column', () => {
    const live = LIFE / CONFIG.smoke.puffIntervalMs;
    expect(live).toBeGreaterThanOrEqual(4); // fewer and it is a blinking dot
    expect(live).toBeLessThanOrEqual(8); // more and the tail has outgrown the hull
  });
});

// --- drift ----------------------------------------------------------------------

describe('puffDrift — a fixed wind, scaled by the MOTION setting only', () => {
  it('is zero at birth and linear in age', () => {
    expectStill(puffDrift(0, S.wind, 1));
    const a = puffDrift(1000, S.wind, 1);
    expect(a.dx).toBeCloseTo(S.wind.x, 12);
    expect(a.dy).toBeCloseTo(S.wind.y, 12);
    const b = puffDrift(2000, S.wind, 1);
    expect(b.dx).toBeCloseTo(S.wind.x * 2, 12);
    expect(b.dy).toBeCloseTo(S.wind.y * 2, 12);
  });

  it('halves at `reduced` and stills completely at `off`', () => {
    const full = puffDrift(1000, S.wind, motionIntensity('full'));
    const reduced = puffDrift(1000, S.wind, motionIntensity('reduced'));
    const off = puffDrift(1000, S.wind, motionIntensity('off'));
    expect(reduced.dx).toBeCloseTo(full.dx / 2, 12);
    expectStill(off);
  });

  it('never runs the wind backwards for a negative age', () => {
    expectStill(puffDrift(-500, S.wind, 1));
  });
});

// --- billow ---------------------------------------------------------------------

describe('puffBillow — a wobble on the radius, never a change of extent', () => {
  it('is exactly 1 at motion=off: the puff holds its TRUE size, motionless', () => {
    for (const age of [0, 200, 700, LIFE]) {
      expect(puffBillow(age, motionIntensity('off'), 0.3)).toBe(1);
    }
  });

  it('stays inside ±billowAmp at full motion, so extent is never distorted away', () => {
    for (let age = 0; age <= LIFE; age += 25) {
      const m = puffBillow(age, 1, 0);
      expect(m).toBeGreaterThanOrEqual(1 - S.billowAmp - 1e-9);
      expect(m).toBeLessThanOrEqual(1 + S.billowAmp + 1e-9);
    }
  });

  it('halves its amplitude at `reduced`', () => {
    const phase = 0.25 / S.billowHz; // sin at its peak — hz-independent
    const full = puffBillow(phase * 1000, 1, 0) - 1;
    const reduced = puffBillow(phase * 1000, motionIntensity('reduced'), 0) - 1;
    expect(reduced).toBeCloseTo(full / 2, 12);
  });

  it('decorrelates puffs by phase, so a column does not pulse in unison', () => {
    expect(puffBillow(500, 1, 0)).not.toBeCloseTo(puffBillow(500, 1, 0.5), 6);
  });
});

// --- THE MOTION CONTRACT (amendment 49 / effects.ts:44-53) ----------------------

describe("motion: 'off' removes MOTION, never INFORMATION", () => {
  // DO NOT "FIX" THIS BY GATING THE SPAWN. Wounded smoke is the game's fifth
  // declared perception exception and the FIRST enemy-hp-derived information
  // ever put on the wire; suppressing it for a player who turned animation down
  // would delete the disclosure the whole story exists to make. Smoke is
  // information, so it is the opposite of an `isJuiceEffect` kind.
  const off = motionIntensity('off');

  it('keeps PRESENCE: alpha is identical at off and at full', () => {
    for (const age of [0, 300, 700, LIFE - 1]) {
      // Alpha takes no intensity argument AT ALL — the motion level is
      // structurally unable to dim a plume.
      expect(puffAlpha(age, LIFE, HEAVY.peakAlpha)).toBeGreaterThanOrEqual(0);
      expect(puffAlpha(age, LIFE, HEAVY.peakAlpha)).toBe(puffAlpha(age, LIFE, HEAVY.peakAlpha));
    }
    expect(puffAlpha(LIFE / 2, LIFE, HEAVY.peakAlpha)).toBeGreaterThan(0);
  });

  it('keeps EXTENT: the radius at off equals the un-billowed true radius', () => {
    for (const age of [0, 400, LIFE]) {
      const base = puffRadius(age, LIFE, HEAVY.r0, HEAVY.r1);
      expect(base * puffBillow(age, off, 0.4)).toBe(base);
    }
  });

  it('keeps TIER: light and heavy stay fully distinguishable at off', () => {
    const age = LIFE / 2;
    const light = puffRadius(age, LIFE, LIGHT.r0, LIGHT.r1) * puffBillow(age, off, 0);
    const heavy = puffRadius(age, LIFE, HEAVY.r0, HEAVY.r1) * puffBillow(age, off, 0);
    expect(heavy).toBeGreaterThan(light);
    expect(puffAlpha(age, LIFE, HEAVY.peakAlpha)).toBeGreaterThan(puffAlpha(age, LIFE, LIGHT.peakAlpha));
    expect(smokeTier(2).puffs).toBeGreaterThan(smokeTier(1).puffs); // count survives too
  });

  it('removes exactly the two MOTION channels and nothing else', () => {
    expectStill(puffDrift(LIFE, S.wind, off));
    expect(puffBillow(LIFE / 3, off, 0.7)).toBe(1);
  });
});

// --- spawn times ----------------------------------------------------------------

describe('puffSpawnTimes — one pulse, `puffs` timestamps, back-dated by stagger', () => {
  it('gives a light pulse exactly one puff at the frame timestamp', () => {
    expect(puffSpawnTimes(10_000, LIGHT)).toEqual([10_000]);
  });

  it('gives a heavy pulse a staggered stack so the column reads as depth', () => {
    const ts = puffSpawnTimes(10_000, HEAVY);
    expect(ts).toHaveLength(HEAVY.puffs);
    expect(ts[0]).toBe(10_000);
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBe(10_000 - i * HEAVY.stagger);
  });

  it('never back-dates a puff past its own life (it would be born dead)', () => {
    for (const t of puffSpawnTimes(0, HEAVY)) expect(-t).toBeLessThan(LIFE);
  });
});

// --- capping (GLOBAL ONLY — amendment 45) ---------------------------------------

describe('the puff cap is GLOBAL ONLY, because no correlation handle exists', () => {
  it('evicts oldest-first once maxPuffs is exceeded', () => {
    const list = Array.from({ length: S.maxPuffs + 3 }, (_, i) => i);
    const gone = capOldest(list, S.maxPuffs);
    expect(gone).toEqual([0, 1, 2]);
    expect(list).toHaveLength(S.maxPuffs);
    expect(list[0]).toBe(3);
  });

  it('is a BACKSTOP: a full room of heavy smokers never reaches it', () => {
    // 20 hulls × the live puffs one hull holds at the server cadence × the
    // heavy tier's puff count. If the cap ever dipped under this it would start
    // trimming legitimate plumes instead of guarding a backgrounded tab.
    const perHull = (LIFE / CONFIG.smoke.puffIntervalMs) * HEAVY.puffs;
    expect(S.maxPuffs).toBeGreaterThan(20 * perHull);
  });

  it('has no per-source key to cap by — the wire payload carries no id', () => {
    // Amendment 45, structurally: `sm` is {k,x,y,tier} and nothing else, so
    // there is no field a per-source cap could group on. If a correlation
    // handle ever appears on this row, this test is the tripwire.
    const e: SmokeEvent = { k: 'sm', x: 100, y: -40, tier: 2 };
    expect(Object.keys(e).sort()).toEqual(['k', 'tier', 'x', 'y']);
  });
});
