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
  perpendicularExtent,
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
    // Class-legible blips (Story 4.2): BlipEvent gains cls/heading/speed,
    // appended after `t` so the historical {k,id,x,y,t} prefix stays
    // byte-stable.
    // Global cooldown reduction (Eric rulings 2026-08-04): BOON_CATALOG
    // content changed — the seven per-equipment reload lines died and the
    // universal shipCooldown line replaced them (42 → 36) — and catalog
    // content IS wire contract. CONFIG.gun/cannon reloadMs retunes ride the
    // welcome config snapshot with it.
    // The gunnery conversation (Story 4.3, amendments 15-20): three new
    // GameEvent kinds — sp (fall of shot, self-private, gun family only),
    // hc (Hit Call, shooter-only, all ordnance, never severity/victim), mz
    // (neutral muzzle flash, no identity for anyone) — plus the derived
    // CONFIG.vision.muzzleFlash halo in the welcome config snapshot.
    // The public register (PV 23): SunkEvent gains the optional per-observer
    // seen?: true flag (key order k,id,by?,seen?) and the sunk row widens to
    // witnessed / credited-killer / human-victim-public — the 4th declared
    // perception exception.
    // DAMAGE CONTROL (PV 24, Eric rulings 2026-08-04): the heal returns as an
    // always-available spend (NOT a card) — HEAL_CHOICE (-1) on
    // SpendMsg.choice, required self-private OwnShip.repairHp, the
    // self-private 'heal' GameEvent, and CONFIG.damageControl in the
    // welcome config snapshot.
    // WOUNDED SMOKE (PV 25, Eric rulings 2026-08-05, amendments 40-49): the
    // new 'sm' GameEvent ({k,x,y,tier} — no identity for ANY observer, tier a
    // two-value enum) plus CONFIG.damageBands and CONFIG.smoke in the welcome
    // config snapshot. Reach reuses CONFIG.vision.muzzleFlash — no new vision
    // constant.
    // THE HEIGHT FIELD (PV 29, cycle 59, Eric ruling 2026-08-06): the capsule
    // generator is replaced by a genuine fBm height field — Island loses
    // `skeleton`, gains `pole`/`contours`, coverage retunes 3-5% -> 2-3%, and
    // GameMap gains the retained height raster + max pyramid. The SAME
    // mapSeed builds a COMPLETELY different ocean, so an un-bumped client
    // would desync catastrophically. Map geometry still never travels on the
    // wire.
    // FRACTAL ISLANDS (PV 28, cycle 52): islands became polygon coastlines, so
    // the SAME mapSeed now builds a different ocean — an un-bumped old client
    // would generate circles where the server has coastlines and desync
    // catastrophically. Map geometry still never travels on the wire. Every
    // LOS-gated sensor (radar paint, truesight, muzzle flash, wounded smoke,
    // the foghorn's one-tier muffle) is now polygon-EXACT where it was
    // bounding-circle conservative, so islands block strictly less.
    // THE EIGHTHS LADDER (PV 30, Story 4.9, Eric rulings 2026-08-06,
    // amendments 113/118/119/121/122/123): CONFIG.vision becomes one ruler of
    // SIGHT-derived eighths — new `detect` (3/8) + `detectFactor` and new
    // `farRadar` (7/8, deliberately unconsumed), `muzzleFlash` moves 6/8 -> 5/8
    // (dragging wounded-smoke reach with it), `sight`/`radar` untouched. The
    // bump is required on two independent grounds: FoghornEvent.v widens from a
    // 3-value tier to an 8-value band, and the client's torpedo dead-reckoning
    // cull becomes detect-derived — a stale client would MISRENDER either way.
    // THE SERVER RASTERIZES THE HULL (PV 31, cycle 63, Eric ruling
    // 2026-08-07, amendments 151-155): the `return`-grammar blip payload is
    // REPLACED — {k,id,x,y,t,ext} becomes {k,t,gx,gy,w,h,bits}, a
    // world-anchored coverage footprint rasterized server-side from the true
    // hull polygon on the shared radar grid (new CONFIG.vision.radarCellU +
    // sim/radarRaster.ts). Disclosure REDUCES: no id, no ext, no exact
    // position — a stale client would read the old fields as undefined and
    // paint nothing, so the bump is a hard gate.
    // RADAR WAKES (PV 32, Story 4.12, Eric rulings 2026-08-08, amendments
    // 194-196): new `wk` GameEvent (WakeBlipEvent {k,t,a,gx,gy,w,h,bits}) —
    // a wake ribbon segment the observer's sweep crossed this tick, geometry
    // plus a quantized water-age bucket and NO identity of any kind; CONFIG
    // gains vision.wakeLifeMs/wakeSampleU/wakeTorpLifeFactor (ride the
    // welcome snapshot). A stale client would drop `wk` events and draw a
    // scope disagreeing with the server's disclosure, so the bump is a hard
    // gate.
    // THE BOUNTY (PV 33, Story 4.6, Eric ruling 2026-08-10): ArenaState gains
    // `bountyId` (the throne holder's session id, appended after winnerId —
    // IDENTITY ONLY, '' while vacant) and SunkEvent gains an optional trailing
    // `bty?: true` (the victim held the bounty at the instant of sinking).
    // CONFIG gains the `bounty` block (killLevels / minCaptainKills), riding
    // the welcome config snapshot. A stale client would miss the schema field
    // and drop `bty`, silently mis-rendering the bounty registers.
    // THE SINKING WINDOW (PV 34, Story 5.2, Eric rulings 2026-08-12,
    // amendments 10-17): OwnShip gains the optional SELF-PRIVATE trailing
    // `sinkingUntil` (absolute server-clock ms the hull founders; omitted when
    // not sinking — the slowedUntil precedent, rides `you` and nothing else,
    // master perception invariant stays at exactly SIX exceptions). Needed
    // because `alive` goes false at sink-entry (amendment 11) while every
    // weapon and the horn stay live for the flat 5 s window (amendment 10) —
    // a stale client would read a sinking captain as plain dead and snap to
    // spectate five seconds early. CONFIG.ship.sinkingWindowMs (5000, all
    // classes — amendment 13) rides the welcome config snapshot; new shared
    // sim/sinking.ts rides the barrel.
    expect(PROTOCOL_VERSION).toBe(34);
    // THE RADAR REALISM CYCLE (PV 27, Eric rulings 2026-08-05, amendments
    // 62-75): BlipEvent becomes the tagless SilhouetteBlipEvent |
    // ReturnBlipEvent union ({k,id,x,y,t,ext} — ext pure aspect geometry, no
    // range term, amendment 66's anti-cheat bound) and WelcomeMsg gains
    // required radarGrammar/radarIdentity, the room-wide mode announcement
    // the client narrows on. One bump covers "a blip may carry either shape"
    // (amendment 72). Landed in parallel with the foghorn below: both branched
    // from PV 25 and claimed 26; 4.5 merged first, so this cycle took 27.
    // THE FOGHORN (PV 26, Eric rulings 2026-08-05, amendments 51-58): the new
    // 'fh' GameEvent ({k,h,self?,b?,v?,x?,y?} — bearing + volume tier for a
    // fogged listener, NEVER a position or ship id; the 6th declared
    // perception exception and the first per-observer-varying payload) plus
    // required InputMsg.hornSeq, the shared HORN_IDS catalog, and
    // CONFIG.foghorn in the welcome config snapshot. No vision constant added.
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

  it('carries the bounty block (Story 4.6, Eric ruling 2026-08-10) — identity-only economy, no location knob', () => {
    expect(CONFIG.bounty.killLevels).toBe(1); // on top of the standard captain kill
    expect(CONFIG.bounty.minCaptainKills).toBe(1); // a zero-kill field has no bounty
    // The shape pin doubles as the no-location guard: any radius/range/bloom
    // tunable appearing here would violate the 2026-08-10 ruling by its key
    // alone.
    expect(Object.keys(CONFIG.bounty).sort()).toEqual(['killLevels', 'minCaptainKills']);
  });

  it('re-exports the universal standard gun model (single-shot pin retired in 2.8)', () => {
    expect(CONFIG.gun.maxAmmo).toBe(1); // still the BASE — gunTurret raises it via stats
    expect(CONFIG.gun.burstRadius).toBe(15);
    expect(CONFIG.gun.contactDamage).toBe(6); // RETUNED 10 -> 6 (Eric ruling 2026-08-04)
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
    // The return-grammar echo-size primitive (radar realism cycle, PV 26).
    expect(typeof perpendicularExtent).toBe('function');
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
      // RETUNED 15000 -> 50000 -> 45000 (Eric rulings 2026-08-04: the
      // global-cooldown cycle, then the weapon balance pass).
      reloadMs: 45000,
      damage: 65, // RETUNED 50 -> 65 (Eric ruling 2026-08-04, balance pass)
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
    expect(CONFIG.mine.damage).toBe(55); // RETUNED 45 -> 55 (Eric ruling 2026-08-04)
    // The placement leash (Eric ruling 2026-08-02): 90u put the drop point
    // inside your own wake; 150u lets a Mine Layer actually seed water.
    expect(CONFIG.mine.placeRange).toBe(150);
    expect(CONFIG.mine.placeHalfArcDeg).toBe(60);
    expect(CONFIG.mine.foulFactor).toBe(0.5);
    expect(CONFIG.mine.foulDurationMs).toBe(4000);
    // The tracking-mine fix (Eric ruling 2026-08-02): acquisition is measured
    // mine→hull SILHOUETTE (world.ts nearestEnemyHull, the trigger's metric),
    // so the range is a silhouette reach and must clear the widest trip ring —
    // a max-mineTrigger 51.5u — with room to close.
    expect(CONFIG.mine.creepSpeed).toBe(14);
    expect(CONFIG.mine.creepAcquireRange).toBe(150);
    expect(CONFIG.mine.creepAcquireRange).toBeGreaterThan(CONFIG.mine.blastRadius);
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
    expect(Object.keys(BOON_CATALOG)).toHaveLength(36); // 42 - 7 reload lines + shipCooldown (Eric 2026-08-04)
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
