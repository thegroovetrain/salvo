// THE THROTTLE GAUGE'S PURE CORE (Story 12.3 Part B, AC 33; Story 10.10 before
// it) — the detent math, the vertical ladder (ahead on TOP), the actual-speed
// arrow on the same scale, and the word under the gauge.

import { describe, it, expect } from 'vitest';
import { CONFIG, DEFAULT_CLASS_ID, SHIP_CLASS_IDS, boostedKinematics } from '@salvo/shared';
import { hullBaseKinematics } from '../sim/hullKinematics.js';
import {
  DETENTS,
  DETENT_LABELS,
  STOP_DETENT,
  detentIndexOf,
  detentLabel,
  detentY,
  helmKinematics,
  labelledDetent,
  speedLadderFraction,
  speedY,
  throttleWord,
} from '../render/console/helm.js';

const TOP = 900;
const H = 112;
const INSET = 8;

describe('detentIndexOf / detentLabel', () => {
  it('maps the nine detents to 0..8 with STOP in the middle, clamped', () => {
    expect(DETENTS).toBe(DETENT_LABELS.length);
    expect(detentIndexOf(0)).toBe(STOP_DETENT);
    expect(detentIndexOf(1)).toBe(DETENTS - 1);
    expect(detentIndexOf(-1)).toBe(0);
    expect(detentIndexOf(5)).toBe(DETENTS - 1);
    expect(detentIndexOf(-5)).toBe(0);
  });

  it('labels symmetrically about STOP, clamped', () => {
    for (let i = 0; i < DETENTS; i++) expect(detentLabel(i)).toBe(detentLabel(DETENTS - 1 - i));
    expect(detentLabel(-3)).toBe(detentLabel(0));
    expect(detentLabel(99)).toBe(detentLabel(DETENTS - 1));
  });
});

describe('the vertical ladder — ahead on top', () => {
  it('spans the gauge inside its inset, evenly, STOP dead centre, full ahead at the TOP', () => {
    expect(detentY(DETENTS - 1, TOP, H, INSET)).toBe(TOP + INSET);
    expect(detentY(0, TOP, H, INSET)).toBe(TOP + H - INSET);
    expect(detentY(STOP_DETENT, TOP, H, INSET)).toBeCloseTo(TOP + H / 2, 9);
    const steps = Array.from({ length: DETENTS - 1 }, (_, i) => detentY(i, TOP, H, INSET) - detentY(i + 1, TOP, H, INSET));
    for (const s of steps) expect(s).toBeCloseTo(steps[0], 9);
  });

  it('clamps an out-of-range detent onto an end stop', () => {
    expect(detentY(-4, TOP, H, INSET)).toBe(detentY(0, TOP, H, INSET));
    expect(detentY(40, TOP, H, INSET)).toBe(detentY(DETENTS - 1, TOP, H, INSET));
  });

  it('labels every other detent from full astern — the two FULLs and STOP included', () => {
    const labelled = Array.from({ length: DETENTS }, (_, i) => i).filter(labelledDetent);
    expect(labelled).toContain(0);
    expect(labelled).toContain(STOP_DETENT);
    expect(labelled).toContain(DETENTS - 1);
    for (let i = 0; i < DETENTS - 1; i++) expect(labelledDetent(i)).not.toBe(labelledDetent(i + 1));
  });
});

describe('the word under the gauge', () => {
  it('is the detent label alone at STOP, and the label with its direction elsewhere', () => {
    expect(throttleWord(STOP_DETENT)).toBe(detentLabel(STOP_DETENT));
    for (let i = 0; i < DETENTS; i++) {
      if (i === STOP_DETENT) continue;
      expect(throttleWord(i).startsWith(detentLabel(i))).toBe(true);
      // the mirror detent reads the same fraction in the other direction
      expect(throttleWord(i)).not.toBe(throttleWord(DETENTS - 1 - i));
    }
  });
});

describe('the arrow — actual speed on the same scale', () => {
  const KIN = hullBaseKinematics(DEFAULT_CLASS_ID);

  it('sits at STOP at rest and reaches the end detents at full ahead / astern', () => {
    expect(speedY(0, KIN, TOP, H, INSET)).toBeCloseTo(detentY(STOP_DETENT, TOP, H, INSET), 9);
    expect(speedY(KIN.maxSpeed, KIN, TOP, H, INSET)).toBeCloseTo(detentY(DETENTS - 1, TOP, H, INSET), 9);
    expect(speedY(-KIN.reverseSpeed, KIN, TOP, H, INSET)).toBeCloseTo(detentY(0, TOP, H, INSET), 9);
  });

  it('scales ahead on maxSpeed, astern on reverseSpeed, and saturates inside the ladder', () => {
    expect(speedLadderFraction(KIN.maxSpeed / 2, KIN)).toBeCloseTo(0.5, 9);
    expect(speedLadderFraction(-KIN.reverseSpeed / 2, KIN)).toBeCloseTo(-0.5, 9);
    for (const v of [1e6, -1e6]) {
      const y = speedY(v, KIN, TOP, H, INSET);
      expect(y).toBeGreaterThanOrEqual(TOP + INSET - 1e-9);
      expect(y).toBeLessThanOrEqual(TOP + H - INSET + 1e-9);
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
    expect(speedY(KIN.maxSpeed, boosted, TOP, H, INSET)).toBeGreaterThan(TOP + INSET);
  });
});
