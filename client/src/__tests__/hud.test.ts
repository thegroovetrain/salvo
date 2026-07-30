import { describe, it, expect, afterEach } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, boostedKinematics, effectiveStats, zeroUpgrades, type ShipState } from '@salvo/shared';
import type { MatchUx } from '../ui/phase.js';
import {
  Hud,
  type OwnStatus,
  hpColor,
  hullPulseHz,
  hullFillAlpha,
  hullHeaderValue,
  advancePulsePhase,
  railSig,
  rudderTickCenter,
  vitalsLayout,
  reloadFraction,
  detentIndexOf,
  detentLabel,
  rungY,
  speedLadderFraction,
  CLUSTER_CONTENT_BOTTOM,
  DETENT_LABELS,
} from '../render/hud.js';
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
import { abilityPressDenied } from '../sim/inputSampler.js';
import { DeniedPulse } from '../render/deniedFire.js';
import { motionScaled, settings } from '../settings/store.js';
import { CLIENT_CONFIG } from '../config.js';

const V = CLIENT_CONFIG.vitals;
const CAP_HZ = CLIENT_CONFIG.settings.pulseCapHz;
// Story 2.4 re-bands the rail (UX-DR15 + amendments 24–27): phosphor ≥ 50%,
// amber < 50%, and the brighter `damageMarker` < 25% — the `damage` crimson
// alias is retired from the HUD (it survives only as the sunk-hull tint).
const GREEN = CLIENT_CONFIG.colors.phosphor;
const AMBER = CLIENT_CONFIG.colors.amber;
const MARKER = CLIENT_CONFIG.colors.damageMarker;

describe('hpColor thresholds (Story 2.4 bands: 50% / 25%, damageMarker)', () => {
  it('is phosphor at/above 50%, amber at/above 25%, damageMarker below', () => {
    expect(hpColor(1)).toBe(GREEN);
    expect(hpColor(0.8)).toBe(GREEN); // I/O matrix: healthy 80/100
    expect(hpColor(0.49)).toBe(AMBER); // I/O matrix: wounded 49/100
    expect(hpColor(0.26)).toBe(AMBER);
    expect(hpColor(0.24)).toBe(MARKER); // I/O matrix: critical 24/100
    expect(hpColor(0)).toBe(MARKER); // I/O matrix: sunk
  });

  it('treats 0.5 and 0.25 as EXCLUSIVE lower bounds for the better color', () => {
    expect(hpColor(0.5)).toBe(GREEN); // exactly half hull still reads healthy
    expect(hpColor(0.25)).toBe(AMBER); // exactly a quarter still reads amber
    expect(hpColor(0.5 - 1e-9)).toBe(AMBER);
    expect(hpColor(0.25 - 1e-9)).toBe(MARKER);
  });

  it('never returns the retired crimson `damage` token', () => {
    const bands = [0, 0.1, 0.24, 0.25, 0.49, 0.5, 1].map(hpColor);
    expect(bands).not.toContain(CLIENT_CONFIG.colors.damage);
  });
});

describe('hullHeaderValue — the `HULL n/n` header', () => {
  it('renders whole hull points and floors at zero', () => {
    expect(hullHeaderValue(80, 100)).toBe('80/100');
    expect(hullHeaderValue(72.4, 100)).toBe('72/100');
    expect(hullHeaderValue(0, 100)).toBe('0/100');
    expect(hullHeaderValue(-5, 100)).toBe('0/100'); // an overkill hit never reads negative
  });

  it('FLOORS rather than rounds, so the number agrees with the rail band', () => {
    // 49.6 hp is an AMBER rail (the band uses the exact fraction) — rounding it
    // to "50" would put a healthy-looking number beside a wounded rail.
    expect(hullHeaderValue(49.6, 100)).toBe('49/100');
    expect(hullHeaderValue(50, 100)).toBe('50/100'); // exactly half still reads 50 (phosphor)
    expect(hullHeaderValue(24.9, 100)).toBe('24/100');
  });

  it('never reads 0 on a LIVE hull (storm damage leaves fractions)', () => {
    // A storm dot can leave 0.4 hp — still afloat, still fighting. `HULL 0/100`
    // on a ship that has not sunk is a lie the header must never tell.
    expect(hullHeaderValue(0.4, 100)).toBe('1/100');
    expect(hullHeaderValue(0.001, 100)).toBe('1/100');
    expect(hullHeaderValue(1, 100)).toBe('1/100');
    // ...and only a genuinely sunk hull reads zero.
    expect(hullHeaderValue(0, 100)).toBe('0/100');
    expect(hullHeaderValue(-0.2, 100)).toBe('0/100');
  });
});

describe('hullPulseHz — the accelerating, hard-capped rail pulse', () => {
  it('starts at ~0.5 Hz where the pulse begins (50% hull)', () => {
    expect(hullPulseHz(V.amberBelow)).toBeCloseTo(V.pulseMinHz, 9);
    expect(hullPulseHz(0.49)).toBeGreaterThan(V.pulseMinHz);
    expect(hullPulseHz(0.49)).toBeLessThan(0.6); // "breathing ~0.5 Hz" at 49/100
  });

  it('accelerates monotonically as the hull burns down', () => {
    const rates = [0.5, 0.4, 0.3, 0.24, 0.15, 0.1].map(hullPulseHz);
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    // I/O matrix: critical 24/100 sits strictly between the endpoints.
    expect(hullPulseHz(0.24)).toBeGreaterThan(V.pulseMinHz);
    expect(hullPulseHz(0.24)).toBeLessThan(CAP_HZ);
  });

  it('hits the 1.1 Hz photosensitivity ceiling at 10% and NEVER exceeds it', () => {
    expect(hullPulseHz(V.pulseFloorFrac)).toBeCloseTo(CAP_HZ, 9);
    expect(hullPulseHz(0.05)).toBeCloseTo(CAP_HZ, 9);
    expect(hullPulseHz(0.01)).toBeCloseTo(CAP_HZ, 9);
    expect(hullPulseHz(0)).toBeCloseTo(CAP_HZ, 9);
    expect(hullPulseHz(-1)).toBeCloseTo(CAP_HZ, 9); // clamped, not extrapolated
  });

  it('shares ONE ceiling with the storm vignette (no second 1.1 literal)', () => {
    for (const frac of [0, 0.05, 0.1, 0.2, 0.35, 0.5, 1]) {
      expect(hullPulseHz(frac)).toBeLessThanOrEqual(CAP_HZ);
    }
  });
});

describe('hullFillAlpha — opacity breathing, only below 50%', () => {
  const AMP = V.pulseAmp;
  const PEAK = Math.PI / 2; // crest of the breath
  const TROUGH = (3 * Math.PI) / 2;

  it('holds the steady base alpha at/above 50% hull (healthy never breathes)', () => {
    const samples = [0, PEAK, Math.PI, TROUGH].map((p) => hullFillAlpha(0.8, p));
    expect(new Set(samples).size).toBe(1);
    expect(samples[0]).toBe(V.railFillAlpha);
    expect(hullFillAlpha(0.5, PEAK)).toBe(V.railFillAlpha);
  });

  it('breathes around the base below 50%, never to nothing', () => {
    const peak = hullFillAlpha(0.2, PEAK);
    const trough = hullFillAlpha(0.2, TROUGH);
    expect(peak).toBeCloseTo(V.railFillAlpha + AMP, 6);
    expect(trough).toBeCloseTo(V.railFillAlpha - AMP, 6);
    expect(trough).toBeGreaterThan(0.5); // the fill is always clearly there
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('is motion-gated in the vignette shape: off holds the base, reduced halves the swing', () => {
    const off = [0, PEAK, Math.PI, TROUGH].map((p) => hullFillAlpha(0.2, p, motionScaled(AMP, 'off')));
    expect(new Set(off).size).toBe(1);
    expect(off[0]).toBe(V.railFillAlpha); // information intact at motion=off
    const full = hullFillAlpha(0.2, PEAK, motionScaled(AMP, 'full')) - V.railFillAlpha;
    const half = hullFillAlpha(0.2, PEAK, motionScaled(AMP, 'reduced')) - V.railFillAlpha;
    expect(half).toBeCloseTo(full / 2, 9);
  });
});

// The phase is INTEGRATED, never derived from absolute time: `sin(t · hz)` only
// looks right while hz is constant, and hz changes with every point of hull. A
// ship burning down in the storm at minute ten would re-roll its rail alpha ~20
// times a second — a strobe, in the exact scenario the 1.1 Hz cap exists for.
describe('pulse phase integration — the rail can never strobe on a changing hull', () => {
  it('advances at the fraction`s rate and wraps into [0, 2π)', () => {
    const hz = hullPulseHz(0.2);
    expect(advancePulsePhase(0, 0.2, 0.4)).toBeCloseTo(hz * 0.4 * Math.PI * 2, 9);
    expect(advancePulsePhase(0, 0.2, 0)).toBe(0); // a zero-length frame moves nothing
    for (let p = 0, i = 0; i < 200; i++) {
      p = advancePulsePhase(p, 0.05, 0.5);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(Math.PI * 2);
    }
  });

  it('holds at zero above the band, so the first breath starts from the steady rail', () => {
    expect(advancePulsePhase(3, 0.8, 0.05)).toBe(0); // healthy: no wave at all
    expect(advancePulsePhase(3, V.amberBelow, 0.05)).toBe(0); // exactly 50% is still flat
    // Entering the band the alpha is continuous: sin(0) leaves the base alpha.
    const first = advancePulsePhase(0, V.amberBelow - 0.001, 0.05);
    expect(hullFillAlpha(V.amberBelow - 0.001, 0)).toBe(V.railFillAlpha);
    expect(first).toBeGreaterThan(0);
  });

  it('clamps a hitching / backgrounded frame (and a negative clock step)', () => {
    const capped = advancePulsePhase(0, 0.05, 30); // 30s away from the tab
    expect(capped).toBe(advancePulsePhase(0, 0.05, 0.5));
    expect(advancePulsePhase(1, 0.05, -5)).toBe(1); // a clock correction never rewinds the wave
  });

  it('keeps the per-frame alpha step under the 1.1 Hz ceiling while the hull DRAINS at minute ten', () => {
    // The storm drains ~0.002 of the bar per 50ms tick; `now` is ~600s in, which
    // is where an absolute-time phase (t · Δhz · 2π) goes wild.
    const DT = 0.05;
    const AMP = V.pulseAmp;
    // Fastest the breath can move: amp · dθ/dt = amp · capHz · 2π.
    const MAX_STEP = AMP * CAP_HZ * Math.PI * 2 * DT + 1e-9;
    let phase = 0;
    let frac = 0.45;
    let prev = hullFillAlpha(frac, phase, AMP);
    for (let i = 0; i < 200 && frac > 0; i++) {
      frac = Math.max(0, frac - 0.002);
      phase = advancePulsePhase(phase, frac, DT);
      const alpha = hullFillAlpha(frac, phase, AMP);
      expect(Math.abs(alpha - prev), `frame ${i} at frac ${frac.toFixed(3)}`).toBeLessThanOrEqual(MAX_STEP);
      prev = alpha;
    }
  });
});

describe('railSig — the rail geometry redraw guard', () => {
  it('forces a redraw across the band/gate transition that the quantized fraction hides', () => {
    // Both quantize to "0.500", but 0.4996 is amber AND breathing while 0.5 is a
    // steady phosphor rail: sharing a signature would leave a pulsing green rail.
    expect((0.5).toFixed(3)).toBe((0.4996).toFixed(3));
    expect(railSig(0.4996)).not.toBe(railSig(0.5));
    // The mirror at the critical band.
    expect((0.25).toFixed(3)).toBe((0.2496).toFixed(3));
    expect(railSig(0.2496)).not.toBe(railSig(0.25));
  });

  it('still skips the redraw while the hull is steady', () => {
    expect(railSig(0.8)).toBe(railSig(0.8));
    expect(railSig(0.8)).toBe(railSig(0.80004)); // sub-quantum jitter, same band
  });
});

describe('rudderTickCenter — the tick + halo stay inside the track', () => {
  const TRACK_X = 40;
  const W = V.rudderTrack;
  const INSET = V.rudderTickW / 2 + V.rudderTickHaloPx;

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

// I/O matrix "Shape code": the ORDERED order and the ACTUAL speed are two
// independent channels — the hollow rung outline sits at the ordered detent
// while the solid amber needle sits wherever the hull actually is.
describe('telegraph shape-coding — ordered and actual are separate channels', () => {
  const KIN = CONFIG.shipClasses.torpedoBoat.kinematics;

  it('ordered ¾ ahead with the hull only at ½ puts marker and needle apart', () => {
    const orderedY = rungY(detentIndexOf(0.75));
    const needleFrac = speedLadderFraction(KIN.maxSpeed * 0.5, KIN);
    const halfRungY = rungY(detentIndexOf(needleFrac));
    expect(orderedY).not.toBe(halfRungY);
    expect(orderedY).toBeLessThan(halfRungY); // ¾ sits ABOVE ½ on the ladder
  });

  it('the marker follows the ORDER alone — the needle never moves it', () => {
    for (const speed of [0, KIN.maxSpeed, -KIN.reverseSpeed]) {
      expect(rungY(detentIndexOf(0.75)), `speed ${speed}`).toBe(rungY(7));
    }
  });
});

describe('reloadFraction — reload progress from reloadMsLeft', () => {
  it('is 0 when idle (no reload running) and just after firing', () => {
    expect(reloadFraction(0, CONFIG.gun.reloadMs)).toBe(0); // idle / fully loaded
    expect(reloadFraction(CONFIG.gun.reloadMs, CONFIG.gun.reloadMs)).toBe(0); // just fired
  });

  it('progresses toward 1 as the reload completes', () => {
    expect(reloadFraction(CONFIG.gun.reloadMs / 2, CONFIG.gun.reloadMs)).toBeCloseTo(0.5, 9);
    expect(reloadFraction(300, 3000)).toBeCloseTo(0.9, 9); // nearly ready
  });

  it('clamps out-of-range inputs and guards a zero reload', () => {
    expect(reloadFraction(9000, 3000)).toBe(0); // over-full remaining
    expect(reloadFraction(-10, 3000)).toBe(0); // idle
    expect(reloadFraction(100, 0)).toBe(0); // zero reload -> no progress bar
  });
});

describe('detentIndexOf — throttle order -> telegraph ladder index', () => {
  it('maps each of the nine detents to 0..8 with STOP at 4', () => {
    const detents = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
    detents.forEach((v, i) => expect(detentIndexOf(v)).toBe(i));
  });

  it('clamps out-of-range throttle values to the end stops', () => {
    expect(detentIndexOf(-2)).toBe(0);
    expect(detentIndexOf(2)).toBe(8);
  });
});

describe('detentLabel — compact rung labels', () => {
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

// The banked-points prompt ("PTS ×N — TAB") and its vitalsLayout slot were
// DELETED by Story 2.6 (amendment 33): the economy readout moved bottom-LEFT
// into the hotbar's reserved gutter (render/xpRail.ts — see xpRail.test.ts,
// which owns the replacement pins: hidden-at-zero, chip states, cue copy).
// What survives here is the reflow proof below — IN STORM now sits in the slot
// the prompt used to occupy, and the vitals cluster carries no economy field.

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
    // At the same absolute speed the battleship reads a HIGHER fraction (smaller max).
    expect(speedLadderFraction(20, BB)).toBeGreaterThan(speedLadderFraction(20, KIN));
  });
});

describe('speed needle under boost — the denominator is the boosted cap while active', () => {
  const KIN = CONFIG.shipClasses.torpedoBoat.kinematics;
  const BONUS = CONFIG.speedBoost.speedBonus;

  it('at base max speed the boosted ladder reads below full; the boosted cap reads full', () => {
    const boosted = boostedKinematics(KIN, BONUS, true);
    expect(speedLadderFraction(KIN.maxSpeed, boosted)).toBeCloseTo(KIN.maxSpeed / (KIN.maxSpeed + BONUS), 9);
    expect(speedLadderFraction(KIN.maxSpeed + BONUS, boosted)).toBe(1);
  });

  it('inactive boost leaves the ladder denominators untouched (same kin object)', () => {
    expect(boostedKinematics(KIN, BONUS, false)).toBe(KIN);
    expect(speedLadderFraction(KIN.maxSpeed, boostedKinematics(KIN, BONUS, false))).toBe(1);
  });
});

describe('ability denied feedback — a cooling press drives the EXISTING pulse grammar', () => {
  it('a press while the boost is cooling (or while dead) predicts denied and pulses; never silence', () => {
    expect(abilityPressDenied(true, false)).toBe(true); // cooling: charge consumed
    expect(abilityPressDenied(false, true)).toBe(true); // dead
    // The denied press feeds the same rate-limited DeniedPulse vocabulary the
    // weapon click uses (80ms flash / 300ms floor — render/deniedFire.ts).
    const pulse = new DeniedPulse();
    expect(pulse.update(true, 1000)).toBe(true); // flash on
    expect(pulse.update(false, 1050)).toBe(true); // still inside the 80ms window
    expect(pulse.update(false, 1100)).toBe(false); // pulse over
  });

  it('a ready press is not denied (it opens the optimistic window instead)', () => {
    expect(abilityPressDenied(true, true)).toBe(false);
  });
});

// --- the bottom-right own-vitals cluster --------------------------------------
// Story 2.2 moved it bottom-LEFT -> bottom-RIGHT (amendment 12); Story 2.4
// restyled it in place into the v2-composite anatomy. The HP rail is now
// CLUSTER-LOCAL — a 6px column abutting the body's right edge — so the old
// "HP bar sits below the cluster" pin is superseded, but all four ratified
// layout properties (right half, no overlap, hotbar clearance, viewport
// tracking) still hold and are pinned here.

/** Do two screen boxes overlap? Touching edges do NOT count (the rail abuts). */
function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('vitalsLayout — the bottom-right own-vitals cluster (Story 2.4 anatomy)', () => {
  const FLOOR = { w: 1366, h: 768 }; // the supported viewport floor

  it('anchors every element in the RIGHT half of the viewport', () => {
    const L = vitalsLayout(FLOOR.w, FLOOR.h);
    for (const x of [L.hp.x, L.cluster.x, L.storm.x]) {
      expect(x).toBeGreaterThan(FLOOR.w / 2);
    }
    // ...and nothing runs off the right edge.
    expect(L.hp.x + L.hp.w).toBeLessThanOrEqual(FLOOR.w);
    expect(L.cluster.x + L.cluster.w).toBeLessThanOrEqual(FLOOR.w);
  });

  it('keeps HP rail / cluster / IN STORM from overlapping each other', () => {
    const L = vitalsLayout(FLOOR.w, FLOOR.h);
    expect(L.hp.y + L.hp.h).toBeLessThanOrEqual(FLOOR.h); // inside the viewport
    expect(L.cluster.y + L.cluster.h).toBeLessThanOrEqual(FLOOR.h);
    // The rail ABUTS the cluster body's right edge and climbs the body only
    // (the header band sits above it) — adjacent, never overlapping.
    expect(L.hp.x).toBe(L.cluster.x + L.cluster.w);
    expect(overlaps(L.hp, L.cluster)).toBe(false);
    expect(L.hp.y).toBeGreaterThan(L.cluster.y);
    expect(L.hp.y + L.hp.h).toBe(L.cluster.y + L.cluster.h);
    // IN STORM is now the ONLY line above the cluster (Story 2.6 deleted the PTS
    // prompt that used to sit between them) and it REFLOWED down into the freed
    // slot: it clears the cluster's top edge and still starts on screen.
    const lineH = 22; // generous line box for the 19px readout
    expect(L.storm.y + lineH).toBeLessThanOrEqual(L.cluster.y);
    expect(L.storm.y).toBeGreaterThan(0);
    expect(L.cluster.y - L.storm.y).toBe(CLIENT_CONFIG.vitals.stormAbove);
  });

  it('keeps the whole stack clear of the bottom-LEFT hotbar corner at the floor viewport', () => {
    const L = vitalsLayout(FLOOR.w, FLOOR.h);
    const hb = CLIENT_CONFIG.hotbar;
    // Widest the hotbar zone can get: gutter + key chip + gap + slot + label
    // column. Reads the REAL label width so the Story 2.3 growth (168 -> 268 for
    // the lifted type) is checked rather than approximated.
    const hotbarRight = hb.left + hb.keyChip + hb.keyGap + hb.slot + hb.labelGap + hb.labelWidth;
    expect(Math.min(L.hp.x, L.cluster.x, L.storm.x)).toBeGreaterThan(hotbarRight);
  });

  it('tracks the viewport (a taller/wider screen moves the whole stack with it)', () => {
    const a = vitalsLayout(1366, 768);
    const b = vitalsLayout(1920, 1080);
    expect(b.hp.x - a.hp.x).toBe(1920 - 1366);
    expect(b.hp.y - a.hp.y).toBe(1080 - 768);
    expect(b.cluster.y - a.cluster.y).toBe(1080 - 768);
    expect(b.storm.y - a.storm.y).toBe(1080 - 768);
  });

  // I/O matrix "UI scale": the cluster scales through the HUD-root seam, so
  // vitalsLayout is handed the LOGICAL (pre-divided) viewport. The taller v2
  // cluster must still fit the smallest logical box either tier can produce.
  it('fits the 125%-tier logical viewport (the gate floor: 1600x768 -> 1280x614)', () => {
    const L = vitalsLayout(1600 / 1.25, Math.floor(768 / 1.25));
    expect(L.storm.y).toBeGreaterThan(0); // the whole stack still starts on screen
    expect(L.cluster.x).toBeGreaterThan(0);
    expect(L.hp.y + L.hp.h).toBeLessThanOrEqual(Math.floor(768 / 1.25));
  });

  // The declared box is what every no-overlap proof above measures, so it has to
  // CONTAIN what the cluster paints. The lowest mark is the ASTERN caption's
  // line box under the ladder — which used to hang ~3px below the declared
  // bottom edge, making those proofs true about a box the HUD didn't fill.
  it('declares a body tall enough to contain the ASTERN caption it paints', () => {
    expect(CLUSTER_CONTENT_BOTTOM).toBeLessThanOrEqual(V.height);
    const L = vitalsLayout(1366, 768);
    expect(L.cluster.y + CLUSTER_CONTENT_BOTTOM).toBeLessThanOrEqual(L.cluster.y + L.cluster.h);
    expect(L.cluster.y + CLUSTER_CONTENT_BOTTOM).toBeLessThanOrEqual(768); // and stays on screen
  });

  it('keeps every cluster mono size above the 9px post-scale floor at the 90% tier', () => {
    // Smallest mono in the cluster is the micro caption register (14px after
    // amendment 15's lift) — 14 * 0.9 = 12.6, comfortably over the floor.
    expect(CLIENT_CONFIG.type.registers.hudMicro.size * 0.9).toBeGreaterThanOrEqual(
      CLIENT_CONFIG.settings.monoFloorPx,
    );
  });
});

// --- helm key glyphs (amendment 26) -------------------------------------------
// W/S at the ladder's extremes, A/D at the rudder track's — each PAIR fades
// permanently after 3 successful inputs, persisted under its own standalone
// localStorage key that RESET SETTINGS must never touch.

describe('helm glyph fade — the counter, per pair', () => {
  const N = V.glyphFadeCount;

  it('a fresh captain sees all four chips (I/O matrix: weapons-safe waiting room)', () => {
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
      const p = sanitizeHelmProgress(raw);
      expect(p, JSON.stringify(raw)).toEqual({ ws: 0, ad: 0 });
    }
    // A partially-valid payload keeps only what is sane.
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
    expect(glyphFadeAlpha(true, t0, t0 + 99, true)).toBe(0); // and stays gone
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
    // A "reload" = a fresh store reading the same key.
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

  it('a corrupt stored value reads as UNFADED (chips visible), no throw', () => {
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

  // Two tabs of the same game share one key. Progress only ever moves forward,
  // so a write must MERGE: a blind last-writer-wins would let the tab that only
  // used the telegraph roll the other tab's rudder progress back to zero.
  it('merges per pair rather than letting the last writer win', () => {
    expect(mergeHelmProgress({ ws: 3, ad: 0 }, { ws: 1, ad: 2 })).toEqual({ ws: 3, ad: 2 });
    expect(mergeHelmProgress({ ws: 0, ad: 0 }, { ws: 2, ad: 1 })).toEqual({ ws: 2, ad: 1 });
    expect(mergeHelmProgress({ ws: 1, ad: 1 }, { ws: 1, ad: 1 })).toEqual({ ws: 1, ad: 1 });
  });

  it('a save never regresses what another tab already stored', () => {
    saveHelmProgress({ ws: V.glyphFadeCount, ad: 0 }); // the other tab faded W/S
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

  /** The live-helm state main.ts's conningLive() reads (mutable per test). */
  const helm = { spectating: false, alive: true as boolean | undefined };

  function drive(hooks: KeyboardHooks): { ws: number; ad: number } {
    helm.spectating = false;
    helm.alive = true;
    const seen = { ws: 0, ad: 0 };
    // An UNCAPPED tally standing in for the store, so these tests count raw
    // signals (the 3-input cap is pinned by the counter suite above).
    const tally = { record: (pair: HelmPair) => (seen[pair] += 1) } as unknown as HelmGlyphStore;
    // The hook bodies below are main.ts keyboardHooks()' bodies verbatim: a
    // changed detent on a LABELED key, and a labeled rudder activation, each
    // gated on a LIVE helm.
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
    press('KeyW'); // already at the stop: no detent change, no count
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
    press('KeyD', { repeat: true }); // auto-repeat
    press('KeyD'); // a stray keydown while still latched down
    expect(seen.ad).toBe(1);
    release('KeyD');
    press('KeyD'); // a genuine second press
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

  // A rudder key held while the settings overlay swallowed input arrives back as
  // an auto-REPEAT keydown when the overlay closes — and that keydown is what
  // re-latches the rudder and starts steering. It is a real activation.
  it('counts the keydown that RE-LATCHES a rudder key, repeat flag or not', () => {
    const seen = drive({});
    press('KeyA', { repeat: true }); // first event this key has landed: it latches
    expect(seen.ad).toBe(1);
    press('KeyA', { repeat: true }); // now genuinely held: auto-repeat, no count
    press('KeyA', { repeat: true });
    expect(seen.ad).toBe(1);
    release('KeyA');
    press('KeyA', { repeat: true }); // re-latch after the overlay ate the keyup
    expect(seen.ad).toBe(2);
  });

  // The chips teach the LABELED keys. The arrows steer identically and always
  // will — but an arrows-only captain has learned nothing the chips show, so
  // they must keep them.
  it('does NOT count arrow-key helm input, while the steering itself is unchanged', () => {
    const seen = drive({});
    press('ArrowUp');
    press('ArrowUp');
    press('ArrowDown');
    press('ArrowLeft');
    press('ArrowRight');
    expect(seen).toEqual({ ws: 0, ad: 0 });
    // ...and the arrows still drove the ship: +2 detents, -1, and both rudder
    // keys latched (the axis reads 0 with LEFT and RIGHT both held).
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

// The gate: a helm key only counts when it DROVE A LIVE SHIP. Spectator WASD
// pans the camera and a dead captain's mash reaches no engine room — neither
// may burn a coach mark the player never got to use.
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
    const store = driveLive(false, false);
    expect(store.current).toEqual({ ws: 0, ad: 0 });
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
// The cluster's drawing code is a thin shell over the pure functions above, but
// it is the piece the restyle rewrote most — one smoke frame proves the shell
// composes (rail + header + readouts + rudder + telegraph + key chips) and that
// the vitals still die with the hull through the existing visibility path.

describe('Hud shell — a live frame, a sunk frame, and a spectate frame', () => {
  const stats = effectiveStats(CONFIG.shipClasses.torpedoBoat, zeroUpgrades());
  const status: OwnStatus = {
    hp: 40,
    ammo: [null, null, null, null],
    primedSlot: 0,
    alive: true,
    respawnInMs: 0,
    cls: 'torpedoBoat',
    stats,
    loadout: ['gun', 'torpedo', null, null],
    boostActive: false,
  };
  const ship = { x: 0, y: 0, heading: 1, speed: 4.2 } as ShipState;
  const match = { topLine: '', tag: '', countdown: '' } as MatchUx;
  const quiet = { line: '', inStorm: false };

  function build(glyphs?: HelmGlyphStore): { layer: Container; hud: Hud } {
    const layer = new Container();
    return { layer, hud: glyphs ? new Hud(layer, glyphs) : new Hud(layer) };
  }

  afterEach(() => {
    localStorage.removeItem(V.glyphKey);
    settings.reset();
  });

  it('renders a wounded (pulsing) frame and a healthy frame without throwing', () => {
    const { hud } = build();
    expect(() => hud.update(ship, { throttle: 0.5, rudder: -1 }, status, quiet, match, 1366, 768, 12.5)).not.toThrow();
    expect(() =>
      hud.update(ship, { throttle: -1, rudder: 1 }, { ...status, hp: 100 }, quiet, match, 1366, 768, 13.1),
    ).not.toThrow();
  });

  it('renders a ZERO-HP frame (empty rail, `HULL 0/n` header) without throwing', () => {
    const { hud } = build();
    expect(() =>
      hud.update(ship, { throttle: 0, rudder: 0 }, { ...status, hp: 0, alive: false, respawnInMs: 3000 }, { line: 'STORM CLOSING', inStorm: true }, match, 1366, 768, 20),
    ).not.toThrow();
  });

  // THE strobe regression, driven through the real instrument: a hull draining
  // in the storm at minute ten, one 50ms frame at a time. The rail's alpha may
  // only move as fast as the 1.1 Hz ceiling allows.
  it('never jumps the rail alpha while the hull drains ten minutes into a match', () => {
    const { hud } = build();
    const MAX_STEP = V.pulseAmp * CAP_HZ * Math.PI * 2 * 0.05 + 1e-9;
    let hp = 45; // 45/100 — inside the pulsing band
    let now = 600; // seconds: where an absolute-time phase goes wild
    hud.update(ship, { throttle: 0, rudder: 0 }, { ...status, hp }, quiet, match, 1366, 768, now);
    let prev = hud.railFillAlpha;
    for (let i = 0; i < 200 && hp > 0; i++) {
      hp = Math.max(0, hp - 0.2); // the storm dot's per-tick bite
      now += 0.05;
      hud.update(ship, { throttle: 0, rudder: 0 }, { ...status, hp }, quiet, match, 1366, 768, now);
      const alpha = hud.railFillAlpha;
      expect(Math.abs(alpha - prev), `frame ${i} at hp ${hp.toFixed(1)}`).toBeLessThanOrEqual(MAX_STEP);
      prev = alpha;
    }
  });

  // A pair whose 3rd input landed just before death has already been retired as
  // far as the player is concerned: the fade must not replay on the next life.
  it('does not replay the glyph fade for a pair that crossed while the instruments were hidden', () => {
    const glyphs = new HelmGlyphStore(zeroHelmProgress());
    const { hud } = build(glyphs);
    hud.update(ship, { throttle: 0, rudder: 0 }, status, quiet, match, 1366, 768, 10);
    expect(hud.chipAlpha('ws')).toBe(1); // still learning
    hud.updateSpectate(quiet, match, 1366, 768, 'SUNK — SPECTATING'); // instruments hidden
    for (let i = 0; i < V.glyphFadeCount; i++) glyphs.record('ws'); // the 3rd input, off screen
    hud.update(ship, { throttle: 0, rudder: 0 }, status, quiet, match, 1366, 768, 11);
    expect(hud.chipAlpha('ws')).toBe(0); // gone immediately, no ghost fade
    expect(hud.chipAlpha('ad')).toBe(1); // ...and the untouched pair is unaffected
  });

  it('still ANIMATES the fade for a pair that crosses while on screen', () => {
    const glyphs = new HelmGlyphStore(zeroHelmProgress());
    const { hud } = build(glyphs);
    hud.update(ship, { throttle: 0, rudder: 0 }, status, quiet, match, 1366, 768, 10);
    for (let i = 0; i < V.glyphFadeCount; i++) glyphs.record('ad');
    hud.update(ship, { throttle: 0, rudder: 0 }, status, quiet, match, 1366, 768, 10);
    expect(hud.chipAlpha('ad')).toBe(1); // the fade STARTS here
    hud.update(ship, { throttle: 0, rudder: 0 }, status, quiet, match, 1366, 768, 10 + V.glyphFadeSec / 2);
    expect(hud.chipAlpha('ad')).toBeCloseTo(0.5, 6);
    hud.update(ship, { throttle: 0, rudder: 0 }, status, quiet, match, 1366, 768, 10 + V.glyphFadeSec);
    expect(hud.chipAlpha('ad')).toBeCloseTo(0, 12);
  });

  it('hides the whole cluster (rail included) on the spectate path, and re-shows it alive', () => {
    const { layer, hud } = build();
    const root = layer.children[0];
    hud.update(ship, { throttle: 0, rudder: 0 }, status, quiet, match, 1366, 768, 1);
    expect(root.visible).toBe(true);
    hud.updateSpectate(quiet, match, 1366, 768, 'SUNK — SPECTATING');
    expect(root.visible).toBe(false); // the HP rail died with the hull too
    hud.update(ship, { throttle: 0, rudder: 0 }, status, quiet, match, 1366, 768, 2);
    expect(root.visible).toBe(true);
  });
});
