import { describe, it, expect } from 'vitest';
import { CONFIG, WEAPON } from '@salvo/shared';
import { hpColor, cooldownReadyFraction, weaponReadyFraction } from '../render/hud.js';

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
