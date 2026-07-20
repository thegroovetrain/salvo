import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION,
  CONFIG,
  MSG,
  UPGRADE_IDS,
  UPGRADE_CATEGORY_IDS,
  UPGRADE_CATEGORIES,
  HEAL_CHOICE,
  WEAPON,
  effectiveStats,
  rollOffer,
  categoryOf,
  mapRadius,
  stepShip,
  generateMap,
  wrapAngle,
  mulberry32,
  segCircleHit,
  zeroUpgrades,
  HULL_IDS,
  hullEnvelope,
  hullSilhouette,
  transformPolygon,
  segPolygonHit,
  polygonMaxRadius,
} from '../index.js';

describe('shared barrel', () => {
  it('exposes the protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(4);
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

  it('re-exports the silhouette system (Story 1.3)', () => {
    expect(HULL_IDS).toHaveLength(6);
    expect(typeof hullEnvelope).toBe('function');
    expect(typeof hullSilhouette).toBe('function');
    expect(typeof transformPolygon).toBe('function');
    expect(typeof segPolygonHit).toBe('function');
    expect(typeof polygonMaxRadius).toBe('function');
    expect(CONFIG.drones.medium.hp).toBe(100);
  });

  it('re-exports the offer/spend system', () => {
    expect(UPGRADE_CATEGORY_IDS).toHaveLength(5);
    expect(Object.keys(UPGRADE_CATEGORIES)).toHaveLength(5);
    expect(typeof rollOffer).toBe('function');
    expect(typeof categoryOf).toBe('function');
    expect(MSG.spend).toBe('u');
    expect(HEAL_CHOICE).toBe(3);
    expect(CONFIG.upgradePoints.healHp).toBe(25);
  });
});
