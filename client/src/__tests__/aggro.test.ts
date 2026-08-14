// THE AGGRO BRACKET (Story 5.6, epic-5 amendment 40) — the three states, the
// two transitions, and the motion setting's contract.
//
// The ruling is short and every clause of it is pinned here: *"On aggro: the
// bracket snaps on with one flash and an audio sting. While held: static.
// Deliberately not animated... On de-aggro: the bracket visibly breaks at the
// corners and fades (~400 ms) with a distinct, softer descending cue."* — plus
// the accessibility clause the spec adds: at `motionIntensity() === 0`, snap on
// and snap off, because **`off` removes motion, never information**.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Container } from 'pixi.js';
import {
  AggroMark,
  aggroFrame,
  bracketArms,
  bracketHalfSize,
} from '../render/aggro.js';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';
import { TONES } from '../audio/tones.js';
import { TONE_TWINS } from '../audio/twinMap.js';

const A = CLIENT_CONFIG.aggro;

describe('aggroFrame — the pure look, one state at a time', () => {
  it('HELD is static: no spread, resting alpha, at any elapsed time', () => {
    // The whole point of the ruling — a pulse would claim photosensitivity
    // budget and need Story 4.8 tier arbitration, exactly the argument that
    // kept the kill-leader glow static.
    for (const t of [0, 500, 60_000]) {
      expect(aggroFrame('held', t, 1)).toEqual({ visible: true, spread: 0, alpha: A.holdAlpha });
    }
  });

  it('OFF draws nothing', () => {
    expect(aggroFrame('off', 0, 1).visible).toBe(false);
  });

  it('LOCK snaps the corners CLOSED and pops brighter, landing exactly on the hold', () => {
    const t0 = aggroFrame('lock', 0, 1);
    expect(t0.spread).toBeCloseTo(A.flashSpreadU, 9); // starts wide of the hull
    expect(t0.alpha).toBeCloseTo(1, 9); // ...and at full brightness
    // Monotone toward the resting look.
    const mid = aggroFrame('lock', A.flashMs / 2, 1);
    expect(mid.spread).toBeLessThan(t0.spread);
    expect(mid.alpha).toBeLessThan(t0.alpha);
    // At the end it IS the held look, byte for byte — so the handover to
    // `held` cannot pop by construction rather than by test.
    expect(aggroFrame('lock', A.flashMs, 1)).toEqual(aggroFrame('held', 0, 1));
    expect(aggroFrame('lock', A.flashMs * 3, 1)).toEqual(aggroFrame('held', 0, 1));
  });

  it('BREAK tears the corners APART and fades out over ~400ms', () => {
    const t0 = aggroFrame('break', 0, 1);
    expect(t0.spread).toBe(0); // it leaves from exactly where the hold sat
    expect(t0.alpha).toBeCloseTo(A.holdAlpha, 9);
    const mid = aggroFrame('break', A.breakMs / 2, 1);
    expect(mid.spread).toBeGreaterThan(0);
    expect(mid.alpha).toBeLessThan(A.holdAlpha);
    expect(mid.visible).toBe(true);
    expect(aggroFrame('break', A.breakMs, 1).visible).toBe(false);
    expect(A.breakMs).toBe(400); // the ratified duration
  });

  it('the BREAK is the bigger motion, so it can never read as a lock in reverse', () => {
    expect(A.breakSpreadU).toBeGreaterThan(A.flashSpreadU);
  });

  it('REDUCED motion halves the pop\'s AMPLITUDE and keeps its full DURATION', () => {
    // Story 2.3's standing rule for every flash in this client: a shorter flash
    // is easier to MISS, which is the opposite of an accessibility affordance.
    const full = aggroFrame('lock', 0, 1);
    const half = aggroFrame('lock', 0, 0.5);
    expect(half.spread).toBeCloseTo(full.spread / 2, 9);
    expect(half.alpha).toBeLessThan(full.alpha);
    expect(half.alpha).toBeGreaterThan(A.holdAlpha);
    // Same landing point at the same instant.
    expect(aggroFrame('lock', A.flashMs, 0.5)).toEqual(aggroFrame('held', 0, 1));
  });

  it('MOTION OFF snaps on and snaps off — information survives, motion does not', () => {
    // ON: the bracket is present at its resting look from the first frame, with
    // no travel and no brightness pop.
    expect(aggroFrame('lock', 0, 0)).toEqual({ visible: true, spread: 0, alpha: A.holdAlpha });
    expect(aggroFrame('lock', A.flashMs, 0)).toEqual({ visible: true, spread: 0, alpha: A.holdAlpha });
    // OFF: gone immediately rather than fading — and NOT lingering half-broken.
    for (const t of [0, A.breakMs / 2, A.breakMs]) {
      expect(aggroFrame('break', t, 0).visible).toBe(false);
    }
    // The HELD state is identical at every motion level: it never moved.
    expect(aggroFrame('held', 0, 0)).toEqual(aggroFrame('held', 0, 1));
  });

  it('never yields a negative or non-finite spread for a degenerate elapsed time', () => {
    for (const t of [-500, NaN, Infinity]) {
      for (const phase of ['lock', 'break'] as const) {
        const f = aggroFrame(phase, t, 1);
        expect(Number.isFinite(f.spread)).toBe(true);
        expect(f.spread).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(f.alpha)).toBe(true);
      }
    }
  });
});

describe('bracketArms — the SHAPE is the channel (DESIGN.md dual-coding floor)', () => {
  it('is four corners of two arms each, and the elbows MEET at spread 0', () => {
    const arms = bracketArms(20, 8, 0);
    expect(arms).toHaveLength(8); // 4 corners x 2 arms
    // Every corner point (±half, ±half) is shared by exactly two arms, which is
    // what makes the closed state read as four unbroken Ls.
    const corners = arms.map(([p0]) => `${p0.x},${p0.y}`);
    const unique = new Set(corners);
    expect(unique.size).toBe(4);
    for (const c of unique) expect(corners.filter((x) => x === c)).toHaveLength(2);
  });

  it('TEARS the elbow open on a positive spread — the "breaks at the corners" beat', () => {
    const open = bracketArms(20, 8, 6);
    const corners = new Set(open.map(([p0]) => `${p0.x},${p0.y}`));
    expect(corners.size).toBe(8); // no two arms share a start any more
    // Each arm has moved straight OUTWARD by exactly the spread.
    for (const [p0] of open) expect(Math.max(Math.abs(p0.x), Math.abs(p0.y))).toBeCloseTo(26, 9);
  });

  it('stays inside the box: an arm can never overrun the far corner', () => {
    // A mistuned armFrac must still draw a bracket, not a solid square.
    for (const arm of [0, 8, 400]) {
      for (const [p0, p1] of bracketArms(20, arm, 0)) {
        expect(Math.abs(p1.x)).toBeLessThanOrEqual(20);
        expect(Math.abs(p1.y)).toBeLessThanOrEqual(20);
        expect(Number.isFinite(p0.x + p0.y + p1.x + p1.y)).toBe(true);
      }
    }
  });

  it('is drawn AXIS-ALIGNED, so it never repeats the hull silhouette\'s language', () => {
    // Every arm runs parallel to an axis: the bracket is a reticle around the
    // chevron, not a second outline of it.
    for (const [p0, p1] of bracketArms(20, 8, 3)) {
      expect(p0.x === p1.x || p0.y === p1.y).toBe(true);
    }
  });
});

describe('bracketHalfSize — the mark stands clear of the hull it wraps', () => {
  it('clears every hull\'s own bounding radius, and scales with the hull', () => {
    const small = bracketHalfSize('droneSmall');
    const large = bracketHalfSize('droneLarge');
    const battleship = bracketHalfSize('battleship');
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small);
    expect(battleship).toBeGreaterThan(large);
  });

  it('is memoized — the same hull id returns the identical number', () => {
    expect(bracketHalfSize('droneMedium')).toBe(bracketHalfSize('droneMedium'));
  });
});

describe('AggroMark — the driver: one cue per transition, and no self-firing', () => {
  let layer: Container;

  beforeEach(() => {
    layer = new Container();
    settings.set({ motion: 'full' });
  });
  afterEach(() => {
    settings.set({ motion: 'full' });
  });

  const mark = (): AggroMark => new AggroMark(layer, 20);

  it('fires `acquired` exactly ONCE on the rising edge, never while held', () => {
    const m = mark();
    expect(m.set(true, 0)).toBe('acquired');
    expect(m.set(true, 16)).toBe(null);
    expect(m.set(true, 5_000)).toBe(null);
    expect(m.active).toBe(true);
  });

  it('fires `released` exactly ONCE on the falling edge, and nothing while off', () => {
    const m = mark();
    m.set(true, 0);
    expect(m.set(false, 1_000)).toBe('released');
    expect(m.set(false, 1_016)).toBe(null);
    m.render(1_016 + A.breakMs, 1);
    expect(m.active).toBe(false);
    expect(m.set(false, 9_000)).toBe(null);
  });

  it('a RE-ACQUIRE mid-break fires a fresh `acquired` and re-arms the bracket', () => {
    const m = mark();
    m.set(true, 0);
    m.set(false, 100);
    expect(m.set(true, 200)).toBe('acquired');
    m.render(200, 1);
    expect(m.gfx.visible).toBe(true);
  });

  it('walks lock -> held -> break -> off as its own render advances the clock', () => {
    const m = mark();
    m.set(true, 0);
    m.render(0, 1);
    expect(m.gfx.visible).toBe(true);
    m.render(A.flashMs + 1, 1); // the lock window closes -> held
    expect(m.active).toBe(true);
    m.set(false, A.flashMs + 1);
    m.render(A.flashMs + 1 + A.breakMs / 2, 1);
    expect(m.gfx.visible).toBe(true); // still fading
    m.render(A.flashMs + 1 + A.breakMs, 1);
    expect(m.gfx.visible).toBe(false);
    expect(m.active).toBe(false);
  });

  it('at motion OFF it snaps on and snaps off — with the cues still firing', () => {
    settings.set({ motion: 'off' });
    const m = mark();
    expect(m.set(true, 0)).toBe('acquired'); // the STING is not motion
    m.render(0, 1);
    expect(m.gfx.visible).toBe(true); // present on the very first frame
    expect(m.set(false, 1_000)).toBe('released');
    m.render(1_000, 1); // ...and gone on the very first frame after release
    expect(m.gfx.visible).toBe(false);
    expect(m.active).toBe(false);
  });

  it('hides with its hull: a zero sight-fade draws nothing even while locked', () => {
    const m = mark();
    m.set(true, 0);
    m.render(0, 0);
    expect(m.gfx.visible).toBe(false);
    m.render(0, 1);
    expect(m.gfx.visible).toBe(true);
    expect(m.gfx.alpha).toBe(1);
    m.render(0, 0.4);
    expect(m.gfx.alpha).toBeCloseTo(0.4, 9);
  });

  it('places on the pose it is given', () => {
    const m = mark();
    m.place(120, -40);
    expect(m.gfx.position.x).toBe(120);
    expect(m.gfx.position.y).toBe(-40);
  });
});

describe('the aggro cues carry their ratified grammar and their visual twins', () => {
  it('release DESCENDS and lock RISES — the matched pair (amendment 40)', () => {
    const lock = TONES.aggroLock;
    const release = TONES.aggroRelease;
    expect(lock.freqEnd).toBeGreaterThan(lock.freqStart); // rises
    expect(release.freqEnd).toBeLessThan(release.freqStart); // ...and descends
  });

  it('the release is SOFTER than the lock, and differs in TIMBRE too', () => {
    expect(TONES.aggroRelease.volume).toBeLessThan(TONES.aggroLock.volume);
    expect(TONES.aggroRelease.type).not.toBe(TONES.aggroLock.type);
  });

  it('neither cue can be mistaken for the damage it is NOT', () => {
    // Being aimed at is not being hit: the lock must not out-shout `damage`.
    expect(TONES.aggroLock.volume).toBeLessThan(TONES.damage.volume);
  });

  it('both name a real visual twin (EXPERIENCE.md\'s accessibility floor)', () => {
    for (const id of ['aggroLock', 'aggroRelease'] as const) {
      expect(TONE_TWINS[id]).toMatch(/bracket/);
      expect(TONE_TWINS[id].length).toBeGreaterThan(20);
    }
  });
});
