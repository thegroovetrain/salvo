import { describe, it, expect } from 'vitest';
import { CONFIG, WEAPON } from '@salvo/shared';
import {
  hpColor,
  cooldownReadyFraction,
  weaponReadyFraction,
  detentIndexOf,
  detentLabel,
  speedLadderFraction,
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

describe('cooldownReadyFraction', () => {
  it('maps ms-remaining to a 0..1 ready fraction', () => {
    expect(cooldownReadyFraction(0, 3000)).toBe(1); // ready
    expect(cooldownReadyFraction(3000, 3000)).toBe(0); // just fired
    expect(cooldownReadyFraction(1500, 3000)).toBeCloseTo(0.5, 9);
  });

  it('clamps out-of-range inputs', () => {
    expect(cooldownReadyFraction(9000, 3000)).toBe(0); // over-full remaining
    expect(cooldownReadyFraction(-10, 3000)).toBe(1);
    expect(cooldownReadyFraction(100, 0)).toBe(1); // zero reload is always ready
  });
});

describe('weaponReadyFraction — per-slot cooldown mapping', () => {
  it('reads cooldowns[weapon] against that weapon’s own reload', () => {
    // Each slot at half its reload => 0.5, proving the correct reload is used.
    const cooldowns = [
      CONFIG.gun.reload / 2,
      CONFIG.torpedo.reload / 2,
      CONFIG.mine.dropCooldown / 2,
    ];
    expect(weaponReadyFraction(cooldowns, WEAPON.gun)).toBeCloseTo(0.5, 9);
    expect(weaponReadyFraction(cooldowns, WEAPON.torpedo)).toBeCloseTo(0.5, 9);
    expect(weaponReadyFraction(cooldowns, WEAPON.mine)).toBeCloseTo(0.5, 9);
  });

  it('is ready (1) at zero remaining and empty at full reload', () => {
    expect(weaponReadyFraction([0, 0, 0], WEAPON.torpedo)).toBe(1);
    expect(weaponReadyFraction([0, CONFIG.torpedo.reload, 0], WEAPON.torpedo)).toBe(0);
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

describe('speedLadderFraction — ACTUAL speed on the [-1,1] telegraph axis', () => {
  it('is 0 at rest, +1 at full ahead, -1 at full astern', () => {
    expect(speedLadderFraction(0)).toBe(0);
    expect(speedLadderFraction(CONFIG.ship.maxSpeed)).toBe(1);
    expect(speedLadderFraction(-CONFIG.ship.reverseSpeed)).toBe(-1);
  });

  it('scales ahead on maxSpeed and astern on reverseSpeed, clamped', () => {
    expect(speedLadderFraction(CONFIG.ship.maxSpeed / 2)).toBeCloseTo(0.5, 9);
    expect(speedLadderFraction(-CONFIG.ship.reverseSpeed / 2)).toBeCloseTo(-0.5, 9);
    expect(speedLadderFraction(CONFIG.ship.maxSpeed * 3)).toBe(1);
    expect(speedLadderFraction(-CONFIG.ship.reverseSpeed * 3)).toBe(-1);
  });
});
