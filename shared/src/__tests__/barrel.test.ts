import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION,
  CONFIG,
  MSG,
  UPGRADE_IDS,
  WEAPON,
  effectiveStats,
  mapRadius,
  stepShip,
  generateMap,
  wrapAngle,
  mulberry32,
  segCircleHit,
  zeroUpgrades,
} from '../index.js';

describe('shared barrel', () => {
  it('exposes the protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(2);
  });

  it('re-exports config, wire tags, and functions', () => {
    expect(CONFIG.tick.simDtMs).toBe(50);
    expect(MSG.input).toBe('i');
    expect(WEAPON.torpedo).toBe(1);
    expect(typeof mapRadius).toBe('function');
    expect(typeof stepShip).toBe('function');
    expect(typeof generateMap).toBe('function');
    expect(typeof wrapAngle).toBe('function');
    expect(typeof mulberry32).toBe('function');
    expect(typeof segCircleHit).toBe('function');
  });

  it('re-exports the upgrade system (Stage D)', () => {
    expect(UPGRADE_IDS).toHaveLength(14);
    expect(typeof effectiveStats).toBe('function');
    expect(typeof zeroUpgrades).toBe('function');
    expect(CONFIG.upgrades.gunAmmo.add).toBe(1);
  });
});
