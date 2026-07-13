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

describe('weaponReadyFraction — aim-relevant per-mount cooldown mapping', () => {
  const HALF_PI = Math.PI / 2;

  it('guns read the mount bearing on aim, against the gun reload', () => {
    // heading 0: aim to port (+90°) bears on mount 0, starboard (-90°) on mount 1.
    const cooldowns = [[CONFIG.gun.reload / 2, 0], [0], [0]];
    expect(weaponReadyFraction(cooldowns, WEAPON.gun, 0, HALF_PI)).toBeCloseTo(0.5, 9); // port, half-reload
    expect(weaponReadyFraction(cooldowns, WEAPON.gun, 0, -HALF_PI)).toBe(1); // starboard, ready
  });

  it('guns fall back to the soonest-ready mount when neither broadside bears', () => {
    // Aim dead ahead (0) over the bow — neither arc covers it -> min(port, stbd).
    const cooldowns = [[1200, 700], [0], [0]];
    expect(weaponReadyFraction(cooldowns, WEAPON.gun, 0, 0)).toBeCloseTo(
      cooldownReadyFraction(700, CONFIG.gun.reload),
      9,
    );
  });

  it('torpedoes/mines read their single mount against their own reload', () => {
    const cooldowns = [[0, 0], [CONFIG.torpedo.reload / 2], [CONFIG.mine.dropCooldown / 2]];
    expect(weaponReadyFraction(cooldowns, WEAPON.torpedo, 0, 0)).toBeCloseTo(0.5, 9);
    expect(weaponReadyFraction(cooldowns, WEAPON.mine, 0, 0)).toBeCloseTo(0.5, 9);
  });

  it('is ready (1) at zero remaining and empty at full reload', () => {
    expect(weaponReadyFraction([[0, 0], [0], [0]], WEAPON.torpedo, 0, 0)).toBe(1);
    expect(weaponReadyFraction([[0, 0], [CONFIG.torpedo.reload], [0]], WEAPON.torpedo, 0, 0)).toBe(0);
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
  const KIN = CONFIG.shipClasses.cruiser.kinematics;

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
