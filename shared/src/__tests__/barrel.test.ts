import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION,
  CONFIG,
  MSG,
  UPGRADE_IDS,
  UPGRADE_CATEGORY_IDS,
  UPGRADE_CATEGORIES,
  HEAL_CHOICE,
  SLOT_COUNT,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  burstVictims,
  rollOffer,
  categoryOf,
  offerableIds,
  OFFER_EXCLUDED_IDS,
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
    expect(PROTOCOL_VERSION).toBe(5);
  });

  it('re-exports config, wire tags, and functions', () => {
    expect(CONFIG.tick.simDtMs).toBe(50);
    expect(MSG.input).toBe('i');
    expect(SLOT_COUNT).toBe(4);
    expect(typeof mapRadius).toBe('function');
    expect(typeof stepShip).toBe('function');
    expect(typeof generateMap).toBe('function');
    expect(typeof wrapAngle).toBe('function');
    expect(typeof mulberry32).toBe('function');
    expect(typeof segCircleHit).toBe('function');
  });

  it('re-exports the upgrade system (Stage D)', () => {
    expect(UPGRADE_IDS).toHaveLength(14); // gunAmmo stays (wire-order append-only), though neutralized
    expect(typeof effectiveStats).toBe('function');
    expect(typeof zeroUpgrades).toBe('function');
    expect(typeof equipmentMaxAmmo).toBe('function');
    expect(typeof equipmentReloadMs).toBe('function');
    expect(CONFIG.upgrades.gunAmmo.add).toBe(1);
  });

  it('re-exports the universal standard gun model (Story 1.4)', () => {
    expect(CONFIG.gun.maxAmmo).toBe(1); // single shot
    expect(CONFIG.gun.burstRadius).toBe(15);
    expect(CONFIG.gun.contactDamage).toBe(10);
    expect(typeof burstVictims).toBe('function');
    // Base gun range is DERIVED from radar range — no gun-range constant exists.
    expect('shellRange' in CONFIG.gun).toBe(false);
    expect('mounts' in CONFIG.gun).toBe(false);
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
    expect(typeof offerableIds).toBe('function');
    expect(OFFER_EXCLUDED_IDS).toEqual(['gunAmmo']);
    expect(MSG.spend).toBe('u');
    expect(HEAL_CHOICE).toBe(3);
    expect(CONFIG.upgradePoints.healHp).toBe(25);
  });
});
