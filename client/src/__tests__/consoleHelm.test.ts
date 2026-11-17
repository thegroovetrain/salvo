// THE HELM INSTRUMENT'S PURE CORE (Story 10.10) — the helm globe's detent,
// speed and rudder math, MOVED to render/console/helm.ts with their tests
// (helmGlobe.test.ts keeps the originals until W3 deletes the globe) and the
// arc re-expressed as a straight 200 px ladder.

import { describe, it, expect } from 'vitest';
import { CONFIG, DEFAULT_CLASS_ID, SHIP_CLASS_IDS, boostedKinematics } from '@salvo/shared';
import { hullBaseKinematics } from '../sim/hullKinematics.js';
import {
  DETENTS,
  DETENT_LABELS,
  STOP_DETENT,
  detentIndexOf,
  detentLabel,
  detentTickX,
  headingText,
  helmKinematics,
  needleX,
  rudderTickCenter,
  speedLadderFraction,
  speedText,
} from '../render/console/helm.js';
import { CLIENT_CONFIG } from '../config.js';

const S = CLIENT_CONFIG.console.ship;
const T = CLIENT_CONFIG.console.tick;
const X0 = 40;
const W = S.ladderW;

describe('detentIndexOf / detentLabel', () => {
  it('maps the nine detents to 0..8 with STOP in the middle, clamped', () => {
    [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].forEach((v, i) => expect(detentIndexOf(v)).toBe(i));
    expect(detentIndexOf(0)).toBe(STOP_DETENT);
    expect(detentIndexOf(-2)).toBe(0);
    expect(detentIndexOf(2)).toBe(DETENTS - 1);
  });

  it('labels symmetrically about STOP, clamped', () => {
    for (let i = 0; i < DETENTS; i++) expect(detentLabel(i)).toBe(detentLabel(DETENTS - 1 - i));
    expect(detentLabel(-5)).toBe(detentLabel(0));
    expect(DETENT_LABELS).toHaveLength(DETENTS);
  });
});

describe('detentTickX — the nine ticks along the ladder', () => {
  it('spans the ladder end to end, evenly, STOP dead centre, astern LEFT', () => {
    expect(detentTickX(0, X0, W)).toBe(X0);
    expect(detentTickX(DETENTS - 1, X0, W)).toBe(X0 + W);
    expect(detentTickX(STOP_DETENT, X0, W)).toBe(X0 + W / 2);
    for (let i = 1; i < DETENTS; i++) expect(detentTickX(i, X0, W) - detentTickX(i - 1, X0, W)).toBeCloseTo(W / (DETENTS - 1), 9);
  });

  it('clamps an out-of-range detent onto an end stop', () => {
    expect(detentTickX(-3, X0, W)).toBe(X0);
    expect(detentTickX(42, X0, W)).toBe(X0 + W);
  });
});

describe('the needle — actual speed on the same scale', () => {
  const KIN = hullBaseKinematics(DEFAULT_CLASS_ID);

  it('sits at STOP at rest and reaches the ladder`s ends at full ahead / astern', () => {
    expect(needleX(0, KIN, X0, W)).toBe(detentTickX(STOP_DETENT, X0, W));
    expect(needleX(KIN.maxSpeed, KIN, X0, W)).toBeCloseTo(X0 + W, 9);
    expect(needleX(-KIN.reverseSpeed, KIN, X0, W)).toBeCloseTo(X0, 9);
  });

  it('scales ahead on maxSpeed, astern on reverseSpeed, and saturates', () => {
    expect(speedLadderFraction(KIN.maxSpeed / 2, KIN)).toBeCloseTo(0.5, 9);
    expect(speedLadderFraction(-KIN.reverseSpeed / 2, KIN)).toBeCloseTo(-0.5, 9);
    for (const v of [1e6, -1e6]) {
      const x = needleX(v, KIN, X0, W);
      expect(x).toBeGreaterThanOrEqual(X0);
      expect(x).toBeLessThanOrEqual(X0 + W);
    }
  });

  it('a slower hull reads further along per unit speed', () => {
    const bySpeed = SHIP_CLASS_IDS.map((id) => hullBaseKinematics(id)).sort((a, b) => a.maxSpeed - b.maxSpeed);
    const v = bySpeed[0].maxSpeed / 2;
    if (bySpeed[0].maxSpeed < bySpeed[bySpeed.length - 1].maxSpeed) {
      expect(speedLadderFraction(v, bySpeed[0])).toBeGreaterThan(speedLadderFraction(v, bySpeed[bySpeed.length - 1]));
    }
  });

  it('the boosted denominators are the shared mutator`s (a proportion of the cap)', () => {
    const boosted = helmKinematics(KIN, CONFIG.boost.factor, true);
    expect(boosted).toEqual(boostedKinematics(KIN, CONFIG.boost.factor, true));
    expect(helmKinematics(KIN, CONFIG.boost.factor, false)).toBe(KIN);
    expect(needleX(KIN.maxSpeed, boosted, X0, W)).toBeLessThan(X0 + W);
  });

  it('ordered and actual are independent: the rung follows the order whatever the hull does', () => {
    const ordered = detentTickX(detentIndexOf(0.75), X0, W);
    expect(needleX(KIN.maxSpeed * 0.5, KIN, X0, W)).toBeLessThan(ordered);
  });
});

describe('the rudder tick stays inside its track', () => {
  const TRACK_X = 100;
  const TW = S.rudderTrack;
  const INSET = T.rudderW / 2;

  it('never overhangs at full deflection, centred amidships', () => {
    for (const r of [-2, -1, 1, 2]) {
      const c = rudderTickCenter(r, TRACK_X, TW, INSET);
      expect(c - INSET).toBeGreaterThanOrEqual(TRACK_X);
      expect(c + INSET).toBeLessThanOrEqual(TRACK_X + TW);
    }
    expect(rudderTickCenter(0, TRACK_X, TW, INSET)).toBe(TRACK_X + TW / 2);
    expect(rudderTickCenter(0.5, TRACK_X, TW, INSET)).toBe(TRACK_X + TW / 2 + TW / 4);
  });
});

describe('the readouts', () => {
  it('heading is three wrapped digits; a full turn reads the same as none', () => {
    expect(headingText(0)).toBe(headingText(Math.PI * 2));
    expect(headingText(Math.PI / 4)).toMatch(/^045/);
    expect(headingText(-Math.PI / 2)).toMatch(/^270/);
    expect(headingText(Math.PI * 2 - 1e-6)).toBe(headingText(0));
  });

  it('speed is the one-decimal magnitude, astern unsigned', () => {
    expect(speedText(-4.24)).toBe(speedText(4.24));
    expect(speedText(18)).toBe((18).toFixed(1));
  });
});
