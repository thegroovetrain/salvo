import { describe, it, expect } from 'vitest';
import { CONFIG, boostedKinematics } from '@salvo/shared';
import {
  hpColor,
  vitalsLayout,
  reloadFraction,
  detentIndexOf,
  detentLabel,
  speedLadderFraction,
  pointsLine,
  DETENT_LABELS,
} from '../render/hud.js';
import { abilityPressDenied } from '../sim/inputSampler.js';
import { DeniedPulse } from '../render/deniedFire.js';
import { CLIENT_CONFIG } from '../config.js';

// hpColor bands read from the design tokens (values unchanged): phosphor / amber /
// damage. The third band keeps `damage` (the HP-rail redesign is a later story).
const GREEN = CLIENT_CONFIG.colors.phosphor;
const AMBER = CLIENT_CONFIG.colors.amber;
const CRIMSON = CLIENT_CONFIG.colors.damage;

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
  it('hides (empty string) at zero and shows "PTS ×N — TAB" otherwise (Story 2.1: TAB is the refit key)', () => {
    expect(pointsLine(0)).toBe('');
    expect(pointsLine(2)).toBe('PTS ×2 — TAB');
    expect(pointsLine(1)).toBe('PTS ×1 — TAB');
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

// --- Story 2.2: the own-vitals cluster moved bottom-LEFT -> bottom-RIGHT ---
// (amendment 12 — relocation only, freeing the ratified hotbar corner). The
// stack is laid out bottom-up: HP bar, telegraph cluster, PTS prompt, IN STORM.

describe('vitalsLayout — the bottom-right own-vitals stack (amendment 12)', () => {
  const FLOOR = { w: 1366, h: 768 }; // the supported viewport floor

  it('anchors every element in the RIGHT half of the viewport', () => {
    const L = vitalsLayout(FLOOR.w, FLOOR.h);
    for (const x of [L.hp.x, L.cluster.x, L.pts.x, L.storm.x]) {
      expect(x).toBeGreaterThan(FLOOR.w / 2);
    }
    // ...and nothing runs off the right edge.
    expect(L.hp.x + L.hp.w).toBeLessThanOrEqual(FLOOR.w);
    expect(L.cluster.x + L.cluster.w).toBeLessThanOrEqual(FLOOR.w);
  });

  it('stacks HP bar / cluster / PTS / IN STORM bottom-up with NO overlap', () => {
    const L = vitalsLayout(FLOOR.w, FLOOR.h);
    expect(L.hp.y + L.hp.h).toBeLessThanOrEqual(FLOOR.h); // inside the viewport
    expect(L.cluster.y + L.cluster.h).toBeLessThan(L.hp.y); // cluster clears the bar
    expect(L.pts.y).toBeLessThan(L.cluster.y); // prompt above the cluster
    expect(L.storm.y).toBeLessThan(L.pts.y); // warning above the prompt
    expect(L.storm.y).toBeGreaterThan(0);
  });

  it('keeps the whole stack clear of the bottom-LEFT hotbar corner at the floor viewport', () => {
    const L = vitalsLayout(FLOOR.w, FLOOR.h);
    const hb = CLIENT_CONFIG.hotbar;
    // Widest the hotbar zone can get: gutter + key chip + gap + slot + label
    // column. Reads the REAL label width so the Story 2.3 growth (168 -> 268 for
    // the lifted type) is checked rather than approximated.
    const hotbarRight = hb.left + hb.keyChip + hb.keyGap + hb.slot + hb.labelGap + hb.labelWidth;
    expect(Math.min(L.hp.x, L.cluster.x, L.pts.x, L.storm.x)).toBeGreaterThan(hotbarRight);
  });

  it('tracks the viewport (a taller/wider screen moves the whole stack with it)', () => {
    const a = vitalsLayout(1366, 768);
    const b = vitalsLayout(1920, 1080);
    expect(b.hp.x - a.hp.x).toBe(1920 - 1366);
    expect(b.hp.y - a.hp.y).toBe(1080 - 768);
    expect(b.cluster.y - a.cluster.y).toBe(1080 - 768);
  });
});
