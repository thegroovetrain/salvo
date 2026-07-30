import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION,
  CONFIG,
  DRONE_HULL_IDS,
  MSG,
  UPGRADE_IDS,
  UPGRADE_CATEGORY_IDS,
  UPGRADE_CATEGORIES,
  SLOT_COUNT,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  burstVictims,
  rollBoonOffer,
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
  BOON_CATALOG,
  BOON_STAT_PATHS,
  HOOK_REGISTRY,
  NO_BOONS,
  applyBoonStats,
  applySlotEffect,
  boonBehaviors,
  hookKinematics,
  resolveBoons,
  slotsWithBoons,
} from '../index.js';

describe('shared barrel', () => {
  it('exposes the protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(15); // Story 2.7: OwnShip.offer re-typed to boon ids; `bn` event; dummy catalog
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

  it('carries the XP economy block (Story 2.6) — the shape, tiers included', () => {
    // Every NUMBER here is a declared handwave (2.10 retunes); the SHAPE is the
    // commitment: a flat ms cost per level, a full level for a human kill, and
    // the PvE size tiers ¼ / ⅓ / ½ keyed by DRONE HULL ID (the fleets epic reuses
    // them verbatim).
    expect(CONFIG.xp.levelMs).toBe(60000);
    expect(CONFIG.xp.levelMs % CONFIG.tick.simDtMs).toBe(0); // a whole number of ticks
    expect(CONFIG.xp.killLevels).toBe(1);
    expect(CONFIG.xp.droneTierLevels.droneSmall).toBe(0.25);
    expect(CONFIG.xp.droneTierLevels.droneMedium).toBeCloseTo(1 / 3, 12);
    expect(CONFIG.xp.droneTierLevels.droneLarge).toBe(0.5);
    for (const id of DRONE_HULL_IDS) {
      expect(CONFIG.xp.droneTierLevels[id]).toBeGreaterThan(0);
      expect(CONFIG.xp.droneTierLevels[id]).toBeLessThan(CONFIG.xp.killLevels); // a drone is never a human
    }
    // DAMAGE PAYS NOTHING — the Rat Covenant's price. There is deliberately no
    // damage entry to tune.
    expect(Object.keys(CONFIG.xp).sort()).toEqual(['droneTierLevels', 'killLevels', 'levelMs']);
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
      mine: false, // flipped to activateable in Story 1.8
      speedBoost: false,
      cannon: true,
      starShells: true,
      decoyBuoy: false, // added in Story 1.8
    });
    expect(CONFIG.cannon).toEqual({
      arc: 'full', // Story 1.10: ratified 360° declaration (sim/arcs.ts)
      shellSpeed: 500, // standardized gun-family muzzle velocity (Eric ruling 2026-07-25, retuned 300→500)
      maxAmmo: 1,
      reloadMs: 15000,
      damage: 50,
      contactDamage: 20,
      burstRadius: 30,
      shellRadius: 2,
    });
    expect(CONFIG.starShells).toEqual({
      arc: 'full', // Story 1.10: ratified 360° declaration (sim/arcs.ts)
      shellSpeed: 500, // standardized gun-family muzzle velocity (Eric ruling 2026-07-25, retuned 300→500)
      maxAmmo: 1,
      reloadMs: 20000,
      damage: 10,
      litRadius: 165,
      litDurationMs: 10000,
      shellRadius: 2,
    });
    // NO range fields: both ranges derive from CONFIG.vision.radar in
    // effectiveStats() (gun base parity — never a duplicated constant).
    expect('rangeU' in CONFIG.cannon).toBe(false);
    expect('rangeU' in CONFIG.starShells).toBe(false);
    // Eric ruling 2026-07-23: star shells always light exactly half the BASE
    // truesight range, structurally — independent of any sightRange upgrade
    // stacks. This must hold even if SIGHT is retuned again.
    expect(CONFIG.starShells.litRadius).toBe(CONFIG.vision.sight / 2);
  });

  it('re-exports the mine-layer loadout system (Story 1.8)', () => {
    // Mine rework: bigger detection + a strictly-larger blast, deeper live cap.
    expect(CONFIG.mine.triggerRadius).toBe(32);
    expect(CONFIG.mine.blastRadius).toBe(48);
    expect(CONFIG.mine.blastRadius).toBeGreaterThan(CONFIG.mine.triggerRadius);
    expect(CONFIG.mine.maxLive).toBe(5);
    expect(CONFIG.mine.damage).toBe(45); // unchanged reference value
    // The decoy buoy: a pure-pass-through ability block on the wire config.
    expect(CONFIG.decoyBuoy).toEqual({ durationMs: 30000, reloadMs: 20000, maxAmmo: 1 });
  });

  it('re-exports the boon effect engine (Story 2.5)', () => {
    // Story 2.7 (amendment 35) flipped the CATALOG from empty to the interim
    // dummy set; HOOK_REGISTRY still ships EMPTY (amendments 29/30 intact —
    // the dummy boons are stat-only). Both stay deep-frozen; the engine
    // functions are the shared two-homes-plus-hooks API.
    expect(Object.keys(BOON_CATALOG).length).toBeGreaterThan(0);
    expect(Object.keys(HOOK_REGISTRY)).toHaveLength(0);
    expect(Object.isFrozen(BOON_CATALOG)).toBe(true);
    expect(Object.isFrozen(HOOK_REGISTRY)).toBe(true);
    expect(Object.isFrozen(NO_BOONS)).toBe(true);
    expect(BOON_STAT_PATHS.length).toBeGreaterThan(0);
    expect(BOON_STAT_PATHS).not.toContain('sweepPeriodMs'); // derived — never addressable
    expect(typeof resolveBoons).toBe('function');
    expect(typeof applyBoonStats).toBe('function');
    expect(typeof applySlotEffect).toBe('function');
    expect(typeof slotsWithBoons).toBe('function');
    expect(typeof boonBehaviors).toBe('function');
    expect(typeof hookKinematics).toBe('function');
  });

  it('re-exports the offer/spend system', () => {
    // Story 2.7: offers are BOON offers. The legacy upgrade-offer exports
    // (rollOffer/categoryOf/offerableIds/OFFER_EXCLUDED_IDS) are gone; the
    // UPGRADE_* tables survive because the counts array is still wire contract.
    expect(UPGRADE_CATEGORY_IDS).toHaveLength(5);
    expect(Object.keys(UPGRADE_CATEGORIES)).toHaveLength(5);
    expect(typeof rollBoonOffer).toBe('function');
    expect(CONFIG.offer.size).toBe(4); // four cards, four distinct categories
    expect(MSG.spend).toBe('u');
    // Story 2.1: the REPAIR/heal spend is gone — no HEAL_CHOICE, no upgradePoints block.
    expect('upgradePoints' in CONFIG).toBe(false);
  });
});
