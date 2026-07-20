import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import {
  hpColor,
  reloadFraction,
  detentIndexOf,
  detentLabel,
  speedLadderFraction,
  pointsLine,
  DETENT_LABELS,
} from '../render/hud.js';

const GREEN = 0x00ff88;
const AMBER = 0xffb800;
const CRIMSON = 0x8b0000;

describe('hpColor thresholds (DESIGN.md green/amber/crimson)', () => {
  it('is green above 60%, amber 30-60%, crimson below 30%', () => {
    expect(hpColor(1)).toBe(GREEN);
    expect(hpColor(0.61)).toBe(GREEN);
    expect(hpColor(0.6)).toBe(AMBER);
    expect(hpColor(0.31)).toBe(AMBER);
    expect(hpColor(0.3)).toBe(CRIMSON);
    expect(hpColor(0)).toBe(CRIMSON);
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

describe('pointsLine — banked-points HUD prompt', () => {
  it('hides (empty string) at zero and shows "PTS ×N — CTRL" otherwise', () => {
    expect(pointsLine(0)).toBe('');
    expect(pointsLine(2)).toBe('PTS ×2 — CTRL');
    expect(pointsLine(1)).toBe('PTS ×1 — CTRL');
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
    // At the same absolute speed the battleship reads a HIGHER fraction (smaller max).
    expect(speedLadderFraction(20, BB)).toBeGreaterThan(speedLadderFraction(20, KIN));
  });
});
