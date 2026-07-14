// Balance guardrails (HULLCRACKER_NOTES "PROBLEMS SO FAR"): no single hit may
// ever kill an undamaged ship, and a torpedo must always outrun every ship
// class so a full-speed firer cannot re-catch its own fish. Pure CONFIG pins —
// they fail the moment a retune drifts across either line.

import { describe, it, expect } from 'vitest';
import { CONFIG, SHIP_CLASS_IDS } from '../index.js';

const minClassHp = Math.min(...SHIP_CLASS_IDS.map((c) => CONFIG.shipClasses[c].hp));
const maxClassSpeed = Math.max(...SHIP_CLASS_IDS.map((c) => CONFIG.shipClasses[c].kinematics.maxSpeed));

describe('one-hit-kill guardrail', () => {
  it('gun damage cannot one-hit the lightest hull', () => {
    expect(CONFIG.gun.damage).toBeLessThan(minClassHp);
  });

  it('torpedo damage cannot one-hit the lightest hull', () => {
    expect(CONFIG.torpedo.damage).toBeLessThan(minClassHp);
  });

  it('mine damage cannot one-hit the lightest hull', () => {
    expect(CONFIG.mine.damage).toBeLessThan(minClassHp);
  });
});

describe('torpedo chase guardrail', () => {
  it('a base torpedo outruns the fastest ship class', () => {
    expect(CONFIG.torpedo.speed).toBeGreaterThan(maxClassSpeed);
  });
});
