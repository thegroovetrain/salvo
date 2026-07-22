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
  loadoutFor,
  boostedKinematics,
  EQUIPMENT_IS_WEAPON,
} from '../index.js';

describe('shared barrel', () => {
  it('exposes the protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(8);
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

  it('re-exports the firing-under-latency wire contract (Story 1.5)', () => {
    expect(MSG.ping).toBe('p');
    expect(CONFIG.net.fireBackdateCeilingMs).toBe(150); // RATIFIED by AR3
    expect(CONFIG.net.fireJitterAllowanceMs).toBe(30); // PROPOSED
    expect(CONFIG.net.pingIntervalMs).toBe(1000); // PROPOSED
    expect(CONFIG.net.rttWindowMs).toBe(10000); // PROPOSED
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

  it('re-exports the torpedo-boat loadout system (Story 1.6)', () => {
    expect(typeof loadoutFor).toBe('function');
    expect(typeof boostedKinematics).toBe('function');
    expect(CONFIG.speedBoost).toEqual({ speedBonus: 10, durationMs: 6000, maxAmmo: 1, reloadMs: 18000 });
  });

  it('re-exports the battleship loadout system (Story 1.7)', () => {
    expect(EQUIPMENT_IS_WEAPON).toEqual({
      gun: true,
      torpedo: true,
      mine: true,
      speedBoost: false,
      cannon: true,
      starShells: true,
    });
    expect(CONFIG.cannon).toEqual({
      shellSpeed: 200,
      maxAmmo: 1,
      reloadMs: 15000,
      damage: 50,
      contactDamage: 20,
      burstRadius: 30,
      shellRadius: 2,
    });
    expect(CONFIG.starShells).toEqual({
      shellSpeed: 130,
      maxAmmo: 1,
      reloadMs: 20000,
      damage: 10,
      litRadius: 110,
      litDurationMs: 10000,
      shellRadius: 2,
    });
    // NO range fields: both ranges derive from CONFIG.vision.radar in
    // effectiveStats() (gun base parity — never a duplicated constant).
    expect('rangeU' in CONFIG.cannon).toBe(false);
    expect('rangeU' in CONFIG.starShells).toBe(false);
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
