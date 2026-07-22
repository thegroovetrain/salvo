import { describe, it, expect } from 'vitest';
import { CONFIG, boostedKinematics, effectiveStats, loadoutFor, zeroUpgrades } from '@salvo/shared';
import {
  chipLabel,
  chipUsesCooldownGrammar,
  hpColor,
  reloadFraction,
  detentIndexOf,
  detentLabel,
  speedLadderFraction,
  pointsLine,
  DETENT_LABELS,
} from '../render/hud.js';
import { abilityPressDenied } from '../sim/inputSampler.js';
import { DeniedPulse } from '../render/deniedFire.js';

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

// --- Story 1.6: loadout-driven chip labels + boost HUD grammar ---

describe('chipLabel — the LOADOUT-driven chip row', () => {
  /** The chip labels a hull's loadout produces, in slot order (empty slots skipped). */
  function labelsFor(cls: 'torpedoBoat' | 'battleship' | 'mineLayer'): string[] {
    const stats = effectiveStats(CONFIG.shipClasses[cls], zeroUpgrades());
    return loadoutFor(cls, stats)
      .map((slot, i) => (slot.equipmentId === null ? null : chipLabel(i, slot.equipmentId)))
      .filter((t): t is string => t !== null);
  }

  it('each hull labels its own fit: TB boost, BB cannon/flare, ML the universal mine', () => {
    expect(labelsFor('torpedoBoat')).toEqual(['1 GUNS', '2 TORP', '3 BOOST']);
    expect(labelsFor('battleship')).toEqual(['1 GUNS', '2 CANNON', '3 FLARE']); // Story 1.7
    expect(labelsFor('mineLayer')).toEqual(['1 GUNS', '2 TORP', '3 MINE']);
  });
});

describe('chip grammar — cooldown sweep vs segmented pool, keyed on equipment identity', () => {
  it('the gun and the boost ability read as pure cooldowns', () => {
    expect(chipUsesCooldownGrammar('gun')).toBe(true);
    expect(chipUsesCooldownGrammar('speedBoost')).toBe(true); // ability charge
  });

  it('the Battleship cannon + star shells read as pure cooldowns (Story 1.7: 1-round skillshots)', () => {
    // Gun-style 1-round long-cooldown skillshots that no ammo grant grows —
    // cooldown grammar, unlike the growable torpedo/mine pools below.
    expect(chipUsesCooldownGrammar('cannon')).toBe(true);
    expect(chipUsesCooldownGrammar('starShells')).toBe(true);
  });

  it('WEAPON pools keep the segmented-pool grammar regardless of pool size', () => {
    // The torpedo pool is maxAmmo 1 at base and grows on a torpedoAmmo grant:
    // its chip must stay a segmented pool (pre-story grammar), never flip to
    // the cooldown sweep — grammar keys on identity, not on pool size.
    expect(CONFIG.torpedo.maxAmmo).toBe(1); // the trap this pins against
    expect(chipUsesCooldownGrammar('torpedo')).toBe(false);
    expect(chipUsesCooldownGrammar('mine')).toBe(false);
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
