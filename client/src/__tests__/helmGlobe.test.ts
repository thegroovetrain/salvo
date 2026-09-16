// THE HELM GLOBE (render/helmGlobe.ts, Story 8.6) — the HUD bar's right-hand
// disc: the nine-detent telegraph as a TICK ARC over the crown, the HDG/KTS
// readout inside it, the rudder track along its floor and the four W/S/A/D coach
// marks at its extremes.
//
// The detent maths, the speed-ladder fraction, the rudder tick clamp and the
// whole helm-glyph fade MOVED here from hud.test.ts when the vertical telegraph
// ladder became an arc. Their pins come with them unchanged — the grammar did
// not move, only the shape. What is NEW is the ARC itself: the tick angles, the
// ordered rung riding its own tick, and the needle's sign (astern LEFT, ahead
// RIGHT) and its clamp at the arc's end under boost.

import { describe, it, expect, afterEach } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, boostedKinematics, effectiveStats } from '@salvo/shared';
import {
  DETENT_LABELS,
  HELM_LETTER_OFFSETS,
  HelmGlobe,
  detentIndexOf,
  detentLabel,
  detentTickAngle,
  needleAngle,
  rudderTickCenter,
  speedLadderFraction,
  type HelmGlobeInput,
} from '../render/helmGlobe.js';
import { hudBarLayout, type Circle } from '../render/hudBar.js';
import {
  HELM_PAIRS,
  HelmGlyphStore,
  countHelmInput,
  glyphFadeAlpha,
  helmInputCounts,
  type HelmPair,
  loadHelmProgress,
  mergeHelmProgress,
  pairFaded,
  recordHelmInput,
  sanitizeHelmProgress,
  saveHelmProgress,
  zeroHelmProgress,
} from '../render/helmGlyphs.js';
import { KeyboardInput, type KeyboardHooks } from '../input/keyboard.js';
import { settings } from '../settings/store.js';
import { CLIENT_CONFIG } from '../config.js';

const V = CLIENT_CONFIG.vitals;
const B = CLIENT_CONFIG.hudBar;
const T = B.tick;

/** The globe the shipped bar actually lays out (r 52, epic-8 amendment 32). */
const GLOBE: Circle = hudBarLayout(1366, 768).helmGlobe;

describe('detentIndexOf — throttle order -> telegraph index', () => {
  it('maps each of the nine detents to 0..8 with STOP at 4', () => {
    const detents = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
    detents.forEach((v, i) => expect(detentIndexOf(v)).toBe(i));
  });

  it('clamps out-of-range throttle values to the end stops', () => {
    expect(detentIndexOf(-2)).toBe(0);
    expect(detentIndexOf(2)).toBe(8);
  });
});

describe('detentLabel — the ratified detent vocabulary', () => {
  it('labels the scale FULL/¾/½/¼/STOP symmetrically', () => {
    expect(DETENT_LABELS).toHaveLength(9);
    expect(detentLabel(0)).toBe('FULL'); // full astern
    expect(detentLabel(3)).toBe('¼');
    expect(detentLabel(4)).toBe('STOP');
    expect(detentLabel(5)).toBe('¼');
    expect(detentLabel(8)).toBe('FULL'); // full ahead
  });

  it('clamps an out-of-range index', () => {
    expect(detentLabel(-5)).toBe('FULL');
    expect(detentLabel(99)).toBe('FULL');
  });
});

describe('detentTickAngle — the nine ticks over the crown', () => {
  it('runs -70 to +70 in 17.5 steps, STOP at 12 o`clock', () => {
    const angles = Array.from({ length: 9 }, (_, i) => detentTickAngle(i));
    expect(angles).toEqual([-70, -52.5, -35, -17.5, 0, 17.5, 35, 52.5, 70]);
    expect(angles[4]).toBe(0); // STOP is the bright, longer tick straight up
    expect(angles).toHaveLength(DETENT_LABELS.length);
  });

  it('puts ASTERN on the LEFT and AHEAD on the RIGHT (the mock`s convention)', () => {
    // 0 deg = 12 o'clock, positive CLOCKWISE in Pixi's y-down space, so a
    // negative angle is the left half of the crown.
    expect(detentTickAngle(0)).toBeLessThan(0); // full astern
    expect(detentTickAngle(8)).toBeGreaterThan(0); // full ahead
    expect(detentTickAngle(0)).toBe(-detentTickAngle(8)); // symmetric about STOP
  });

  it('is the config arc, never a second set of literals', () => {
    expect(detentTickAngle(0)).toBe(-T.arcDeg);
    expect(detentTickAngle(8)).toBe(T.arcDeg);
    expect(detentTickAngle(5) - detentTickAngle(4)).toBeCloseTo(T.stepDeg, 9);
    expect(T.stepDeg * 8).toBe(T.arcDeg * 2); // the nine detents exactly fill the arc
  });

  it('clamps an out-of-range detent onto an end stop', () => {
    expect(detentTickAngle(-3)).toBe(-T.arcDeg);
    expect(detentTickAngle(42)).toBe(T.arcDeg);
  });
});

describe('speedLadderFraction — ACTUAL speed on the [-1,1] telegraph axis', () => {
  const KIN = CONFIG.shipClasses.torpedoBoat.kinematics;

  it('is 0 at rest, +1 at full ahead, -1 at full astern', () => {
    expect(speedLadderFraction(0, KIN)).toBe(0);
    expect(speedLadderFraction(KIN.maxSpeed, KIN)).toBe(1);
    expect(speedLadderFraction(-KIN.reverseSpeed, KIN)).toBe(-1);
  });

  it('scales ahead on maxSpeed and astern on reverseSpeed, clamped', () => {
    expect(speedLadderFraction(KIN.maxSpeed / 2, KIN)).toBeCloseTo(0.5, 9);
    expect(speedLadderFraction(-KIN.reverseSpeed / 2, KIN)).toBeCloseTo(-0.5, 9);
    expect(speedLadderFraction(KIN.maxSpeed * 3, KIN)).toBe(1);
    expect(speedLadderFraction(-KIN.reverseSpeed * 3, KIN)).toBe(-1);
  });

  it('uses the passed class denominators (battleship is slower per unit speed)', () => {
    const BB = CONFIG.shipClasses.battleship.kinematics;
    expect(speedLadderFraction(20, BB)).toBeGreaterThan(speedLadderFraction(20, KIN));
  });
});

describe('needleAngle — the solid amber pointer on the arc', () => {
  const KIN = CONFIG.shipClasses.torpedoBoat.kinematics;
  const BONUS = CONFIG.speedBoost.speedBonus;

  it('sits at STOP at rest and reaches the arc ends at full order', () => {
    expect(needleAngle(0, KIN)).toBe(0);
    expect(needleAngle(KIN.maxSpeed, KIN)).toBeCloseTo(T.arcDeg, 9);
    expect(needleAngle(-KIN.reverseSpeed, KIN)).toBeCloseTo(-T.arcDeg, 9);
  });

  it('carries the ASTERN SIGN — making sternway swings the needle LEFT', () => {
    // The sign is the whole shape channel here: an unsigned needle would read
    // "half ahead" while the hull was backing down at half astern.
    expect(needleAngle(-KIN.reverseSpeed / 2, KIN)).toBeLessThan(0);
    expect(needleAngle(KIN.maxSpeed / 2, KIN)).toBeGreaterThan(0);
    expect(needleAngle(-KIN.reverseSpeed / 2, KIN)).toBeCloseTo(-T.arcDeg / 2, 9);
  });

  it('CLAMPS at the arc`s end under boost — a boosted hull never swings off it', () => {
    const boosted = boostedKinematics(KIN, BONUS, true);
    // On the BASE denominators a boosted hull is over the cap: pinned at +70.
    expect(needleAngle(KIN.maxSpeed + BONUS, KIN)).toBe(T.arcDeg);
    // ...and on the boosted denominators it reads the full arc exactly, with the
    // unboosted cap now short of the end (the boost is visible as headroom).
    expect(needleAngle(KIN.maxSpeed + BONUS, boosted)).toBeCloseTo(T.arcDeg, 9);
    expect(needleAngle(KIN.maxSpeed, boosted)).toBeLessThan(T.arcDeg);
    expect(boostedKinematics(KIN, BONUS, false)).toBe(KIN); // inactive: same object
    for (const speed of [1e6, -1e6]) {
      expect(Math.abs(needleAngle(speed, boosted))).toBeLessThanOrEqual(T.arcDeg);
    }
  });

  // I/O matrix "Shape code": ORDERED and ACTUAL are two independent channels.
  it('ordered ¾ ahead with the hull only at ½ puts rung and needle apart', () => {
    const ordered = detentTickAngle(detentIndexOf(0.75));
    const actual = needleAngle(KIN.maxSpeed * 0.5, KIN);
    expect(ordered).not.toBeCloseTo(actual, 6);
    expect(ordered).toBeGreaterThan(actual); // ¾ sits further clockwise than ½
    // ...and the rung follows the ORDER alone, whatever the hull is doing.
    for (const speed of [0, KIN.maxSpeed, -KIN.reverseSpeed]) {
      expect(detentTickAngle(detentIndexOf(0.75)), `speed ${speed}`).toBe(detentTickAngle(7));
    }
  });
});

describe('rudderTickCenter — the tick stays inside the bar`s 48px track', () => {
  const TRACK_X = 100;
  const W = B.rudder.track;
  const INSET = B.rudder.tickW / 2;

  it('never lets the painted tick overhang either end at full deflection', () => {
    for (const rudder of [-1, 1, -2, 2]) {
      const c = rudderTickCenter(rudder, TRACK_X, W, INSET);
      expect(c - INSET, `rudder ${rudder}`).toBeGreaterThanOrEqual(TRACK_X);
      expect(c + INSET, `rudder ${rudder}`).toBeLessThanOrEqual(TRACK_X + W);
    }
  });

  it('is the track center amidships and tracks the axis in between', () => {
    expect(rudderTickCenter(0, TRACK_X, W, INSET)).toBe(TRACK_X + W / 2);
    expect(rudderTickCenter(0.5, TRACK_X, W, INSET)).toBe(TRACK_X + W / 2 + W / 4);
    expect(rudderTickCenter(-0.5, TRACK_X, W, INSET)).toBe(TRACK_X + W / 2 - W / 4);
  });
});

describe('the four coach marks sit where the mock puts them', () => {
  it('S left / W right at the crown, A / D at the rudder track`s ends', () => {
    // The mock's 104 viewBox coordinates, measured from its (52,52) centre:
    // S x13 y32, W x91 y32, A x17 y91, D x87 y91.
    expect(HELM_LETTER_OFFSETS.S).toEqual({ x: -39, y: -20 });
    expect(HELM_LETTER_OFFSETS.W).toEqual({ x: 39, y: -20 });
    expect(HELM_LETTER_OFFSETS.A).toEqual({ x: -35, y: 39 });
    expect(HELM_LETTER_OFFSETS.D).toEqual({ x: 35, y: 39 });
  });

  it('keeps all four inside the globe`s own 104px box', () => {
    const half = B.globe / 2;
    for (const [glyph, at] of Object.entries(HELM_LETTER_OFFSETS)) {
      expect(Math.abs(at.x), `${glyph} x`).toBeLessThanOrEqual(half);
      expect(Math.abs(at.y), `${glyph} y`).toBeLessThanOrEqual(half);
    }
  });
});

// --- helm key glyphs (amendment 26) -------------------------------------------
// Each PAIR fades permanently after 3 successful inputs, persisted under its own
// standalone localStorage key that RESET SETTINGS must never touch.

describe('helm glyph fade — the counter, per pair', () => {
  const N = V.glyphFadeCount;

  it('a fresh captain sees all four marks (I/O matrix: weapons-safe waiting room)', () => {
    const p = zeroHelmProgress();
    expect(HELM_PAIRS.every((pair) => !pairFaded(p, pair))).toBe(true);
    expect(HELM_PAIRS.every((pair) => glyphFadeAlpha(pairFaded(p, pair), null, 0, true) === 1)).toBe(true);
  });

  it('fades a pair on its Nth successful input, and NOT before', () => {
    let p = zeroHelmProgress();
    for (let i = 1; i < N; i++) {
      p = countHelmInput(p, 'ws');
      expect(pairFaded(p, 'ws'), `after ${i}`).toBe(false);
    }
    p = countHelmInput(p, 'ws');
    expect(pairFaded(p, 'ws')).toBe(true);
  });

  it('counts the two pairs INDEPENDENTLY (W/S fading leaves A/D alone)', () => {
    let p = zeroHelmProgress();
    for (let i = 0; i < N; i++) p = countHelmInput(p, 'ws');
    expect(pairFaded(p, 'ws')).toBe(true);
    expect(pairFaded(p, 'ad')).toBe(false);
    for (let i = 0; i < N; i++) p = countHelmInput(p, 'ad');
    expect(pairFaded(p, 'ad')).toBe(true);
  });

  it('caps the stored count so a veteran never overflows it', () => {
    let p = zeroHelmProgress();
    for (let i = 0; i < N * 10; i++) p = countHelmInput(p, 'ad');
    expect(p.ad).toBe(N);
  });

  it('sanitizes ANY corrupt payload to UNFADED, without throwing', () => {
    for (const raw of [null, undefined, 'garbage', 42, [], { ws: 'three' }, { ws: NaN, ad: -5 }, { ws: Infinity }]) {
      expect(sanitizeHelmProgress(raw), JSON.stringify(raw)).toEqual({ ws: 0, ad: 0 });
    }
    expect(sanitizeHelmProgress({ ws: 2, ad: 'x' })).toEqual({ ws: 2, ad: 0 });
    expect(sanitizeHelmProgress({ ws: 99, ad: 1.7 })).toEqual({ ws: N, ad: 1 });
  });
});

describe('helm glyph fade — the fade ALPHA', () => {
  it('is 1 while unfaded, at every clock value', () => {
    expect(glyphFadeAlpha(false, null, 0, true)).toBe(1);
    expect(glyphFadeAlpha(false, 5, 99, true)).toBe(1);
  });

  it('ramps 1 -> 0 over the fade window once the pair crosses', () => {
    const t0 = 10;
    expect(glyphFadeAlpha(true, t0, t0, true)).toBe(1);
    expect(glyphFadeAlpha(true, t0, t0 + V.glyphFadeSec / 2, true)).toBeCloseTo(0.5, 9);
    expect(glyphFadeAlpha(true, t0, t0 + V.glyphFadeSec, true)).toBeCloseTo(0, 12);
    expect(glyphFadeAlpha(true, t0, t0 + V.glyphFadeSec * 1.01, true)).toBe(0);
    expect(glyphFadeAlpha(true, t0, t0 + 99, true)).toBe(0);
  });

  it('is INSTANT at motion=off (the fade itself is motion)', () => {
    expect(glyphFadeAlpha(true, 10, 10, false)).toBe(0);
    expect(glyphFadeAlpha(true, 10, 10.1, false)).toBe(0);
  });

  it('never replays the fade for a pair that was ALREADY faded on load', () => {
    expect(glyphFadeAlpha(true, null, 0, true)).toBe(0);
    expect(glyphFadeAlpha(true, null, 1234, true)).toBe(0);
  });
});

describe('helm glyph fade — standalone persistence (RESET SETTINGS must not touch it)', () => {
  afterEach(() => {
    localStorage.removeItem(V.glyphKey);
    settings.reset();
  });

  it('round-trips through localStorage: a faded pair stays gone after a reload', () => {
    const store = new HelmGlyphStore(zeroHelmProgress());
    for (let i = 0; i < V.glyphFadeCount; i++) store.record('ws');
    expect(store.faded('ws')).toBe(true);
    const reloaded = new HelmGlyphStore(loadHelmProgress());
    expect(reloaded.faded('ws')).toBe(true);
    expect(reloaded.faded('ad')).toBe(false);
  });

  it('survives RESET SETTINGS — learned anatomy is not a setting', () => {
    const store = new HelmGlyphStore(zeroHelmProgress());
    for (let i = 0; i < V.glyphFadeCount; i++) store.record('ad');
    settings.reset(); // the settings overlay's RESET button
    expect(loadHelmProgress().ad).toBe(V.glyphFadeCount);
    expect(new HelmGlyphStore(loadHelmProgress()).faded('ad')).toBe(true);
  });

  it('lives under its OWN hullcracker.* key, never inside the settings blob', () => {
    expect(V.glyphKey.startsWith('hullcracker.')).toBe(true);
    expect(V.glyphKey).not.toBe(CLIENT_CONFIG.settings.storeKey);
    saveHelmProgress({ ws: 1, ad: 2 });
    expect(localStorage.getItem(CLIENT_CONFIG.settings.storeKey) ?? '').not.toContain('"ws"');
  });

  it('a corrupt stored value reads as UNFADED (marks visible), no throw', () => {
    localStorage.setItem(V.glyphKey, '{not json');
    expect(() => loadHelmProgress()).not.toThrow();
    expect(loadHelmProgress()).toEqual({ ws: 0, ad: 0 });
    localStorage.setItem(V.glyphKey, '"ws"');
    expect(loadHelmProgress()).toEqual({ ws: 0, ad: 0 });
  });

  it('stops writing once a pair is faded (a veteran does not churn storage)', () => {
    const store = new HelmGlyphStore(zeroHelmProgress());
    for (let i = 0; i < V.glyphFadeCount + 5; i++) store.record('ws');
    expect(store.current.ws).toBe(V.glyphFadeCount);
  });

  it('merges per pair rather than letting the last writer win', () => {
    expect(mergeHelmProgress({ ws: 3, ad: 0 }, { ws: 1, ad: 2 })).toEqual({ ws: 3, ad: 2 });
    expect(mergeHelmProgress({ ws: 0, ad: 0 }, { ws: 2, ad: 1 })).toEqual({ ws: 2, ad: 1 });
    expect(mergeHelmProgress({ ws: 1, ad: 1 }, { ws: 1, ad: 1 })).toEqual({ ws: 1, ad: 1 });
  });

  it('a save never regresses what another tab already stored', () => {
    saveHelmProgress({ ws: V.glyphFadeCount, ad: 0 });
    expect(saveHelmProgress({ ws: 1, ad: 2 })).toEqual({ ws: V.glyphFadeCount, ad: 2 });
    expect(loadHelmProgress()).toEqual({ ws: V.glyphFadeCount, ad: 2 });
  });
});

// The "successful input" definition lives in the input pipeline, so it is pinned
// against the REAL chokepoint: only a step that moved the detent counts, a held
// rudder key counts once per activation, and a suppressed press counts never.
describe('helm glyph fade — what counts as a successful input', () => {
  let kb: KeyboardInput | null = null;
  afterEach(() => {
    kb?.detach();
    kb = null;
    localStorage.removeItem(V.glyphKey);
  });

  const helm = { spectating: false, alive: true as boolean | undefined };

  function drive(hooks: KeyboardHooks): { ws: number; ad: number } {
    helm.spectating = false;
    helm.alive = true;
    const seen = { ws: 0, ad: 0 };
    const tally = { record: (pair: HelmPair) => (seen[pair] += 1) } as unknown as HelmGlyphStore;
    const live = (): boolean => helmInputCounts(helm.spectating, helm.alive);
    kb = new KeyboardInput({
      ...hooks,
      onDetent: (_dir, changed, labeled) => {
        if (!changed || !labeled) return;
        recordHelmInput('ws', live(), tally);
      },
      onRudder: () => recordHelmInput('ad', live(), tally),
    });
    kb.attach();
    return seen;
  }

  function press(code: string, init: KeyboardEventInit = {}): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true, ...init }));
  }

  function release(code: string): void {
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
  }

  it('counts telegraph steps that CHANGED the detent', () => {
    const seen = drive({});
    press('KeyW');
    press('KeyW');
    expect(seen.ws).toBe(2);
  });

  it('does NOT count a no-op step at the end stop (W at FULL ahead)', () => {
    const seen = drive({});
    for (let i = 0; i < 4; i++) press('KeyW'); // STOP -> FULL AHEAD
    expect(seen.ws).toBe(4);
    press('KeyW');
    press('KeyW');
    expect(seen.ws).toBe(4);
  });

  it('does NOT count OS auto-repeat while W is held', () => {
    const seen = drive({});
    press('KeyW');
    press('KeyW', { repeat: true });
    press('KeyW', { repeat: true });
    expect(seen.ws).toBe(1);
  });

  it('counts ONE rudder activation per physical press, not per held frame', () => {
    const seen = drive({});
    press('KeyD');
    press('KeyD', { repeat: true });
    press('KeyD');
    expect(seen.ad).toBe(1);
    release('KeyD');
    press('KeyD');
    expect(seen.ad).toBe(2);
  });

  it('never counts a SUPPRESSED input (a focused overlay swallows the key)', () => {
    const seen = drive({ isOverlayFocused: () => true });
    press('KeyW');
    press('KeyS');
    press('KeyA');
    press('KeyD');
    expect(seen).toEqual({ ws: 0, ad: 0 });
  });

  it('counts the keydown that RE-LATCHES a rudder key, repeat flag or not', () => {
    const seen = drive({});
    press('KeyA', { repeat: true });
    expect(seen.ad).toBe(1);
    press('KeyA', { repeat: true });
    press('KeyA', { repeat: true });
    expect(seen.ad).toBe(1);
    release('KeyA');
    press('KeyA', { repeat: true });
    expect(seen.ad).toBe(2);
  });

  it('does NOT count arrow-key helm input, while the steering itself is unchanged', () => {
    const seen = drive({});
    press('ArrowUp');
    press('ArrowUp');
    press('ArrowDown');
    press('ArrowLeft');
    press('ArrowRight');
    expect(seen).toEqual({ ws: 0, ad: 0 });
    expect(kb?.throttleIndex).toBe(5);
    expect(kb?.axes().rudder).toBe(0);
    release('ArrowLeft');
    expect(kb?.axes().rudder).toBe(1);
  });

  it('counts the LABELED keys in the same session (the pair is not dead, just arrow-blind)', () => {
    const seen = drive({});
    press('ArrowUp');
    press('KeyW');
    press('KeyD');
    expect(seen).toEqual({ ws: 1, ad: 1 });
  });
});

describe('helm glyph fade — only a LIVE helm counts', () => {
  let kb: KeyboardInput | null = null;
  afterEach(() => {
    kb?.detach();
    kb = null;
    localStorage.removeItem(V.glyphKey);
  });

  function driveLive(spectating: boolean, alive: boolean | undefined): HelmGlyphStore {
    const store = new HelmGlyphStore(zeroHelmProgress());
    const live = (): boolean => helmInputCounts(spectating, alive);
    kb = new KeyboardInput({
      onDetent: (_dir, changed, labeled) => {
        if (changed && labeled) recordHelmInput('ws', live(), store);
      },
      onRudder: () => recordHelmInput('ad', live(), store),
    });
    kb.attach();
    for (let i = 0; i < V.glyphFadeCount + 1; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
    }
    return store;
  }

  it('accrues nothing while SPECTATING (W/S/A/D pan the camera there)', () => {
    const store = driveLive(true, true);
    expect(store.current).toEqual({ ws: 0, ad: 0 });
    expect(HELM_PAIRS.every((p) => !store.faded(p))).toBe(true);
  });

  it('accrues nothing while DEAD and awaiting respawn', () => {
    expect(driveLive(false, false).current).toEqual({ ws: 0, ad: 0 });
  });

  it('accrues nothing before the first frame (no own ship yet)', () => {
    expect(driveLive(false, undefined).current).toEqual({ ws: 0, ad: 0 });
  });

  it('still counts a LIVE helm (the gate lets the real thing through)', () => {
    const store = driveLive(false, true);
    expect(store.faded('ws')).toBe(true);
    expect(store.faded('ad')).toBe(true);
  });

  it('pins the predicate itself (the shape camera.ts canUserZoom uses)', () => {
    expect(helmInputCounts(false, true)).toBe(true);
    expect(helmInputCounts(true, true)).toBe(false); // spectating
    expect(helmInputCounts(false, false)).toBe(false); // sunk
    expect(helmInputCounts(false, undefined)).toBe(false); // no own ship yet
  });
});

// --- the Pixi shell ------------------------------------------------------------

describe('HelmGlobe shell — a live frame and the coach-mark fade', () => {
  const stats = effectiveStats(CONFIG.shipClasses.torpedoBoat);

  function input(over: Partial<HelmGlobeInput> = {}): HelmGlobeInput {
    return {
      headingRad: 1,
      speed: 4.2,
      orderedDetent: 6,
      rudder: -0.5,
      kin: stats.kinematics,
      speedBonus: stats.equipment.speedBoost.speedBonus,
      boostActive: false,
      ...over,
    };
  }

  afterEach(() => {
    localStorage.removeItem(V.glyphKey);
    settings.reset();
  });

  it('draws every detent, both rudder stops and a boosted needle without throwing', () => {
    const globe = new HelmGlobe(new Container(), new HelmGlyphStore(zeroHelmProgress()));
    for (let d = 0; d <= 8; d++) {
      expect(() => globe.update(input({ orderedDetent: d }), GLOBE, 1, 1)).not.toThrow();
    }
    for (const rudder of [-1, 0, 1]) {
      expect(() => globe.update(input({ rudder }), GLOBE, 2, 1)).not.toThrow();
    }
    expect(() =>
      globe.update(input({ speed: stats.kinematics.maxSpeed * 2, boostActive: true }), GLOBE, 3, 1),
    ).not.toThrow();
    expect(() => globe.update(input({ speed: -3 }), GLOBE, 4, 0.9)).not.toThrow(); // 90% tier
  });

  it('reads out the heading (3 digits + degree sign) and the speed', () => {
    const globe = new HelmGlobe(new Container(), new HelmGlyphStore(zeroHelmProgress()));
    globe.update(input({ headingRad: 0, speed: 0 }), GLOBE, 1, 1);
    expect(globe.readoutText()).toBe('000° HDG 0.0 KTS');
    globe.update(input({ headingRad: Math.PI, speed: -4.25 }), GLOBE, 2, 1);
    expect(globe.readoutText()).toBe('180° HDG 4.3 KTS'); // the readout is a magnitude
  });

  it('does not replay the fade for a pair that crossed while the globe was hidden', () => {
    const glyphs = new HelmGlyphStore(zeroHelmProgress());
    const globe = new HelmGlobe(new Container(), glyphs);
    globe.update(input(), GLOBE, 10, 1);
    expect(globe.letterAlpha('ws')).toBe(1); // still learning
    globe.hide();
    for (let i = 0; i < V.glyphFadeCount; i++) glyphs.record('ws'); // the 3rd input, off screen
    globe.update(input(), GLOBE, 11, 1);
    expect(globe.letterAlpha('ws')).toBe(0); // gone immediately, no ghost fade
    expect(globe.letterAlpha('ad')).toBe(1); // ...and the untouched pair is unaffected
  });

  it('still ANIMATES the fade for a pair that crosses while on screen', () => {
    const glyphs = new HelmGlyphStore(zeroHelmProgress());
    const globe = new HelmGlobe(new Container(), glyphs);
    globe.update(input(), GLOBE, 10, 1);
    for (let i = 0; i < V.glyphFadeCount; i++) glyphs.record('ad');
    globe.update(input(), GLOBE, 10, 1);
    expect(globe.letterAlpha('ad')).toBe(1); // the fade STARTS here
    globe.update(input(), GLOBE, 10 + V.glyphFadeSec / 2, 1);
    expect(globe.letterAlpha('ad')).toBeCloseTo(0.5, 6);
    globe.update(input(), GLOBE, 10 + V.glyphFadeSec, 1);
    expect(globe.letterAlpha('ad')).toBeCloseTo(0, 12);
  });

  it('hides and re-shows as one object', () => {
    const layer = new Container();
    const globe = new HelmGlobe(layer, new HelmGlyphStore(zeroHelmProgress()));
    globe.update(input(), GLOBE, 1, 1);
    expect(layer.children[0].visible).toBe(true);
    globe.hide();
    expect(layer.children[0].visible).toBe(false);
    globe.update(input(), GLOBE, 2, 1);
    expect(layer.children[0].visible).toBe(true);
  });
});
