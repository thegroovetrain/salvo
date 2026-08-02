import { describe, it, expect } from 'vitest';
import * as shared from '../index.js';
import {
  PROTOCOL_VERSION,
  CONFIG,
  DRONE_HULL_IDS,
  MSG,
  SLOT_COUNT,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  burstVictims,
  pierceDamage,
  mapRadius,
  stepShip,
  generateMap,
  wrapAngle,
  mulberry32,
  segCircleHit,
  HULL_IDS,
  hullEnvelope,
  hullSilhouette,
  transformPolygon,
  segPolygonHit,
  polygonMaxRadius,
  loadoutFor,
  boostedKinematics,
  slowedKinematics,
  EQUIPMENT_IS_WEAPON,
  BOON_CATALOG,
  BOON_STAT_PATHS,
  DOCTRINE_MODES,
  EQUIPMENT_CATEGORY,
  HOOK_REGISTRY,
  NO_BOONS,
  UNIVERSAL_CATEGORIES,
  applyBoonStats,
  applySlotEffect,
  boonBehaviors,
  boonStackCount,
  buildDeck,
  consumeAcquisition,
  drawOffer,
  hookKinematics,
  isAcquisitionDef,
  resolveBoons,
  returnCards,
  scrubAcquisitions,
  slotsWithBoons,
  validateBoonDef,
  validateCatalog,
} from '../index.js';

describe('shared barrel', () => {
  it('exposes the protocol version', () => {
    // Join window before the countdown: MatchPhase gains 'gathering',
    // ArenaState.countdownEndT is redefined as the current-phase deadline,
    // and CONFIG.match.joinWindow rides the welcome config snapshot.
    expect(PROTOCOL_VERSION).toBe(19);
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
    expect(typeof effectiveStats).toBe('function');
    expect(typeof equipmentMaxAmmo).toBe('function');
    expect(typeof equipmentReloadMs).toBe('function');
  });

  it('the legacy upgrade system is STRIPPED (Story 2.8, FR20)', () => {
    // The 14-id vocabulary is gone from CONFIG and from the barrel namespace.
    expect('upgrades' in CONFIG).toBe(false);
    const ns = shared as Record<string, unknown>;
    for (const gone of ['UPGRADE_IDS', 'UPGRADE_CATEGORY_IDS', 'UPGRADE_CATEGORIES', 'zeroUpgrades', 'rollBoonOffer']) {
      expect(ns[gone], gone).toBeUndefined();
    }
    // The sweep ceiling SURVIVES the strip at its new home.
    expect(CONFIG.vision.sweepRpmMax).toBe(30);
    expect(CONFIG.vision.sweepRpm).toBeLessThanOrEqual(CONFIG.vision.sweepRpmMax);
  });

  it('carries the XP economy block (Story 2.6) — the shape, tiers included', () => {
    expect(CONFIG.xp.levelMs).toBe(60000);
    expect(CONFIG.xp.levelMs % CONFIG.tick.simDtMs).toBe(0);
    expect(CONFIG.xp.killLevels).toBe(1);
    for (const id of DRONE_HULL_IDS) {
      expect(CONFIG.xp.droneTierLevels[id]).toBeGreaterThan(0);
      expect(CONFIG.xp.droneTierLevels[id]).toBeLessThan(CONFIG.xp.killLevels);
    }
    expect(Object.keys(CONFIG.xp).sort()).toEqual(['droneTierLevels', 'killLevels', 'levelMs']);
  });

  it('re-exports the universal standard gun model (single-shot pin retired in 2.8)', () => {
    expect(CONFIG.gun.maxAmmo).toBe(1); // still the BASE — gunTurret raises it via stats
    expect(CONFIG.gun.burstRadius).toBe(15);
    expect(CONFIG.gun.contactDamage).toBe(10);
    expect(typeof burstVictims).toBe('function');
    expect(typeof pierceDamage).toBe('function');
    expect('shellRange' in CONFIG.gun).toBe(false);
    expect('mounts' in CONFIG.gun).toBe(false);
  });

  it('re-exports the firing-under-latency wire contract (Story 1.5)', () => {
    expect(MSG.ping).toBe('p');
    expect(CONFIG.net.fireBackdateCeilingMs).toBe(150);
    expect(CONFIG.net.fireJitterAllowanceMs).toBe(30);
    expect(CONFIG.net.pingIntervalMs).toBe(1000);
    expect(CONFIG.net.rttWindowMs).toBe(10000);
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

  it('re-exports the loadout + kinematics-fold systems (boost AND the 2.8 slow)', () => {
    expect(typeof loadoutFor).toBe('function');
    expect(typeof boostedKinematics).toBe('function');
    expect(typeof slowedKinematics).toBe('function');
    expect(CONFIG.speedBoost).toEqual({ speedBonus: 10, durationMs: 6000, maxAmmo: 1, reloadMs: 18000 });
  });

  it('EQUIPMENT_IS_WEAPON: mine FLIPPED to a click-aimed weapon (Story 2.8, amendment 45)', () => {
    expect(EQUIPMENT_IS_WEAPON).toEqual({
      gun: true,
      torpedo: true,
      mine: true, // FLIPPED (was false since 1.8): aimed rear-arc placement
      speedBoost: false,
      cannon: true,
      starShells: true,
      decoyBuoy: false,
    });
  });

  it('CONFIG.cannon carries the burst block; doctrine ranges stay radar-derived', () => {
    expect(CONFIG.cannon).toEqual({
      arc: 'full',
      shellSpeed: 500,
      maxAmmo: 1,
      reloadMs: 15000,
      damage: 50,
      contactDamage: 20,
      burstRadius: 30,
      shellRadius: 2,
    });
    expect('rangeU' in CONFIG.cannon).toBe(false);
  });

  it('CONFIG.starShells: DAMAGELESS (amendment 39) + the incendiary/dazzle doctrine fields', () => {
    expect(CONFIG.starShells).toEqual({
      arc: 'full',
      shellSpeed: 500,
      maxAmmo: 1,
      reloadMs: 20000,
      litRadius: 165,
      litDurationMs: 10000,
      shellRadius: 2,
      incendiaryRadiusFactor: 0.8,
      incendiaryDps: 5,
      dazzleSightFactor: 0.5,
    });
    expect('damage' in CONFIG.starShells).toBe(false);
    expect('rangeU' in CONFIG.starShells).toBe(false);
    // The ratified SIGHT/2 structural derivation survives.
    expect(CONFIG.starShells.litRadius).toBe(CONFIG.vision.sight / 2);
  });

  it('CONFIG.mine: aimed-placement + chain-era fields (Story 2.8) over the 1.8 geometry', () => {
    expect(CONFIG.mine.triggerRadius).toBe(32);
    expect(CONFIG.mine.blastRadius).toBe(48);
    expect(CONFIG.mine.blastRadius).toBeGreaterThan(CONFIG.mine.triggerRadius);
    expect(CONFIG.mine.maxLive).toBe(5);
    expect(CONFIG.mine.damage).toBe(45);
    expect(CONFIG.mine.placeRange).toBe(90);
    expect(CONFIG.mine.placeHalfArcDeg).toBe(60);
    expect(CONFIG.mine.foulFactor).toBe(0.5);
    expect(CONFIG.mine.foulDurationMs).toBe(4000);
    expect(CONFIG.mine.creepSpeed).toBe(8);
    expect(CONFIG.mine.creepAcquireRange).toBe(60);
    expect(CONFIG.decoyBuoy).toEqual({ durationMs: 30000, reloadMs: 20000, maxAmmo: 1 });
  });

  it('CONFIG.torpedo: the homing/command doctrine fields (Story 2.8)', () => {
    expect(CONFIG.torpedo.homingTurnRate).toBe(0.5);
    expect(CONFIG.torpedo.homingAcquireRange).toBe(120);
    expect(CONFIG.torpedo.homingUpdateAngleDeg).toBe(5);
    expect(CONFIG.torpedo.commandBurstRadius).toBe(60);
    // The homing travel budget (review P8): finite, so a fish can never orbit
    // forever — and long enough to cross the map twice over.
    expect(CONFIG.torpedo.homingMaxRangeU).toBe(1300);
  });

  it('re-exports the boon effect engine + Catalog v1 (Stories 2.5/2.8)', () => {
    expect(Object.keys(BOON_CATALOG)).toHaveLength(42);
    expect(Object.keys(HOOK_REGISTRY)).toHaveLength(0); // still EMPTY (amendment 30 satisfied data-side)
    expect(Object.isFrozen(BOON_CATALOG)).toBe(true);
    expect(Object.isFrozen(HOOK_REGISTRY)).toBe(true);
    expect(Object.isFrozen(NO_BOONS)).toBe(true);
    expect(BOON_STAT_PATHS.length).toBeGreaterThan(0);
    expect(BOON_STAT_PATHS).not.toContain('sweepPeriodMs');
    expect(UNIVERSAL_CATEGORIES).toEqual(['intel', 'ship', 'guns']);
    expect(Object.keys(EQUIPMENT_CATEGORY)).toHaveLength(7);
    expect(Object.keys(DOCTRINE_MODES)).toHaveLength(4);
    for (const fn of [
      resolveBoons,
      applyBoonStats,
      applySlotEffect,
      slotsWithBoons,
      boonBehaviors,
      boonStackCount,
      hookKinematics,
      isAcquisitionDef,
      validateBoonDef,
      validateCatalog,
    ]) {
      expect(typeof fn).toBe('function');
    }
  });

  it('re-exports THE DECK MODEL engine + the offer/spend wire shape (Story 2.8)', () => {
    for (const fn of [buildDeck, drawOffer, returnCards, consumeAcquisition, scrubAcquisitions]) {
      expect(typeof fn).toBe('function');
    }
    // dial ratified 0.35 -> 0.7 by Eric from 2-10 batch-sim evidence (amendment 57)
    expect(CONFIG.deck).toEqual({ rareWeightBase: 1, rareWeightPerDryLevel: 0.7 });
    expect(CONFIG.offer.size).toBe(4); // four cards, four DIFFERENT lines
    expect(MSG.spend).toBe('u');
    expect('upgradePoints' in CONFIG).toBe(false);
  });
});
