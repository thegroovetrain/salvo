// Balance guardrails (HULLCRACKER_NOTES "PROBLEMS SO FAR"): no single hit may
// ever kill an undamaged hull, and a torpedo must always outrun every hull —
// ship classes AND drones. The chase guardrail is now purely a CHASE/DODGE
// balance pin (targets can't trivially outrun a fish); it is NO LONGER about
// self-hit safety — own weapons never damage the owner (permanent owner
// immunity, Eric ruling 2026-07-19). Pure CONFIG pins — they fail the moment a
// retune drifts across either line.

import { describe, it, expect } from 'vitest';
import { CONFIG, DRONE_SIZE_IDS, SHIP_CLASS_IDS } from '../index.js';

const classHps = SHIP_CLASS_IDS.map((c) => CONFIG.shipClasses[c].hp);
const droneHps = DRONE_SIZE_IDS.map((d) => CONFIG.drones[d].hp);
const minHullHp = Math.min(...classHps, ...droneHps);

const classSpeeds = SHIP_CLASS_IDS.map((c) => CONFIG.shipClasses[c].kinematics.maxSpeed);
const droneSpeeds = DRONE_SIZE_IDS.map((d) => CONFIG.drones[d].kinematics.maxSpeed);
const maxHullSpeed = Math.max(...classSpeeds, ...droneSpeeds);

describe('one-hit-kill guardrail (classes AND drones)', () => {
  it('gun BURST damage cannot one-hit the lightest hull', () => {
    expect(CONFIG.gun.damage).toBeLessThan(minHullHp);
  });

  it('gun CONTACT (bodyblock) damage cannot one-hit the lightest hull', () => {
    expect(CONFIG.gun.contactDamage).toBeLessThan(minHullHp);
  });

  it('bodyblocking is the lighter outcome: contactDamage does not exceed burst damage', () => {
    expect(CONFIG.gun.contactDamage).toBeLessThanOrEqual(CONFIG.gun.damage);
  });

  it('torpedo damage cannot one-hit the lightest hull', () => {
    expect(CONFIG.torpedo.damage).toBeLessThan(minHullHp);
  });

  it('mine damage cannot one-hit the lightest hull', () => {
    expect(CONFIG.mine.damage).toBeLessThan(minHullHp);
  });

  it('cannon BURST damage cannot one-hit the lightest hull (Story 1.7)', () => {
    expect(CONFIG.cannon.damage).toBeLessThan(minHullHp);
  });

  it('cannon CONTACT (bodyblock) damage cannot one-hit the lightest hull', () => {
    expect(CONFIG.cannon.contactDamage).toBeLessThan(minHullHp);
  });

  it('cannon bodyblocking is the lighter outcome: contactDamage does not exceed burst damage', () => {
    expect(CONFIG.cannon.contactDamage).toBeLessThanOrEqual(CONFIG.cannon.damage);
  });

  it('star-shell damage is minor: cannot one-hit the lightest hull, and stays below every other burster', () => {
    expect(CONFIG.starShells.damage).toBeLessThan(minHullHp);
    expect(CONFIG.starShells.damage).toBeLessThanOrEqual(CONFIG.gun.damage);
    expect(CONFIG.starShells.damage).toBeLessThanOrEqual(CONFIG.cannon.damage);
  });

  it('the lightest hull is the 70hp torpedoBoat (drones are all heavier)', () => {
    expect(minHullHp).toBe(70);
    expect(Math.min(...droneHps)).toBeGreaterThan(CONFIG.torpedo.damage);
  });
});

describe('torpedo chase/dodge guardrail (classes AND drones)', () => {
  it('a base torpedo outruns the fastest hull', () => {
    expect(CONFIG.torpedo.speed).toBeGreaterThan(maxHullSpeed);
  });

  it('a base torpedo outruns every ship class individually', () => {
    for (const speed of classSpeeds) expect(CONFIG.torpedo.speed).toBeGreaterThan(speed);
  });

  it('a base torpedo outruns every drone individually', () => {
    for (const speed of droneSpeeds) expect(CONFIG.torpedo.speed).toBeGreaterThan(speed);
  });
});
