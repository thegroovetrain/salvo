import { describe, it, expect } from 'vitest';
import * as shared from '../index.js';
import type { EquipmentId } from '../index.js';

// ONE RUNG OF THE TWELFTHS RULER (Story 9.8, epic-9 amendment 103): a twelfth
// of radar, which is `sight / 4` because radar = sight × 3 — derived, never the
// literal 125 (epic-9 amendment 8).
const TWELFTH = CONFIG.vision.sight / 4;
import {
  damageMultiplierFor,
  FLASH_WINDOW_MS,
  CONFIG,
  DRONE_HULL_IDS,
  fleetHullIds,
  fleetLevels,
  MSG,
  SLOT_COUNT,
  WEAPON_SLOTS,
  CONSUMABLE_SLOTS,
  consumableSlotFor,
  consumableKindAt,
  DEFAULT_KIT,
  KIT_SIZE,
  dealableConsumables,
  isConsumableKit,
  rollKit,
  MULLIGAN_CHOICE,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  burstVictims,
  parallelOffsets,
  straddleOffsets,
  mapRadius,
  stepShip,
  generateMap,
  wrapAngle,
  mulberry32,
  segCircleHit,
  hullEnvelope,
  hullIsFull,
  hullSilhouette,
  transformPolygon,
  segPolygonHit,
  polygonMaxRadius,
  perpendicularExtent,
  loadoutFor,
  boostedKinematics,
  slowedKinematics,
  CONSUMABLE_IDS,
  CONSUMABLE_IS_WEAPON,
  isConsumableId,
  isWeaponItem,
  slotMaxAmmo,
  stockSlotFor,
  EQUIPMENT_IS_WEAPON,
  BOON_STAT_PATHS,
  CATALOG,
  DOCTRINE_MODES,
  EQUIPMENT_IDS,
  EQUIPMENT_STAT_FIELDS,
  HOOK_REGISTRY,
  LINE_IDS,
  NO_CARDS,
  applyCardStats,
  applySlotEffect,
  cardBehaviors,
  cardCounts,
  catalogCardCount,
  DEFAULT_GUN,
  GUN_IDS,
  MOUNTED_GUN,
  SHIFT_IDS,
  DEFAULT_SHIFT,
  SHELL_FAMILIES,
  classShift,
  drawOffer,
  eligibleLines,
  isGunId,
  lineWeight,
  usableLines,
  hookKinematics,
  isStubLine,
  resolveCards,
  slotsWithCards,
  validateCatalog,
  validateLine,
  captiveTriggerRadius,
  mineTriggerRadius,
  type MineKind,
  type MineView,
  type SlotItemId,
  type DecoyView,
  type FrameMsg,
  type CloudRecord,
  type CloudView,
  cloudScale,
  cloudOutlineRadius,
  type OwnShip,
  type ReturnBlipEvent,
  type GhostPaint,
} from '../index.js';

/** deg -> rad, the SAME association shared/src uses (`(d * PI) / 180`) — the
 *  two round differently in the last bit, and these are exact-equality pins. */
const deg = (d: number): number => (d * Math.PI) / 180;

describe('shared barrel', () => {
  it('exposes the attenuation, fog-field and dropout functions and the FOG_NO_CUT sentinel', () => {
    for (const fn of [shared.rangeAttenuation, shared.flakRimFactor, shared.settleBlow]) {
      expect(typeof fn).toBe('function');
    }
    for (const fn of [shared.makeFogField, shared.fogNoiseAt, shared.fogDensityAt, shared.fogTollAlong, shared.fogCutForTarget, shared.fogLattice, shared.fogEyeReach, shared.fogEyeReachFan]) {
      expect(typeof fn).toBe('function');
    }
    expect(shared.FOG_NO_CUT).toBe(9);
    for (const fn of [shared.dropoutPaintP, shared.dropoutRoll, shared.dropoutPaints]) {
      expect(typeof fn).toBe('function');
    }
  });

  it('re-exports config, wire tags, and functions', () => {
    expect(MSG.input).toBe('i');
    expect(SLOT_COUNT).toBe(2 + WEAPON_SLOTS.length + CONSUMABLE_SLOTS.length); // gun, Shift, Q/E/R, one per carried consumable
    expect(CONSUMABLE_SLOTS).toHaveLength(KIT_SIZE); // Story 10.1: four, per ship, by its kit
    expect(SLOT_COUNT).toBe(2 + WEAPON_SLOTS.length + KIT_SIZE);
    expect(typeof mapRadius).toBe('function');
    expect(typeof stepShip).toBe('function');
    expect(typeof generateMap).toBe('function');
    expect(typeof wrapAngle).toBe('function');
    expect(typeof mulberry32).toBe('function');
    expect(typeof segCircleHit).toBe('function');
    // Story 9.5 — the shared hull-contact resolver and its damage math.
    expect(typeof shared.resolveHullContacts).toBe('function');
    expect(typeof shared.contactHitDamage).toBe('function');
    expect(typeof shared.contactGrindRate).toBe('function');
    expect(typeof shared.landHitDamage).toBe('function');
    expect(typeof shared.landGrindRate).toBe('function');
    expect(typeof shared.solidEscape).toBe('function');
    expect(typeof shared.polygonOverlapsSolid).toBe('function');
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
    expect(CONFIG.vision.sweepRpm).toBeLessThanOrEqual(CONFIG.vision.sweepRpmMax);
  });

  it('carries the XP economy block (Story 2.6) — the shape, tiers included', () => {
    expect(CONFIG.xp.levelMs % CONFIG.tick.simDtMs).toBe(0);
    for (const id of DRONE_HULL_IDS) {
      expect(CONFIG.xp.droneTierLevels[id]).toBeGreaterThan(0);
      expect(CONFIG.xp.droneTierLevels[id]).toBeLessThan(CONFIG.xp.killLevels);
    }
    // THE ASSIST SPLIT IS ONE DIAL (Eric answer A1, 2026-08-23): the same
    // number is the per-attacker restart gap, the eligibility window at the
    // sink, and the on-switch, so a second gap dial appearing here would fail
    // the shape pin by its key alone.
    // 60 s clears every weapon cycle with room — the reason it beat the
    // first-ruled 30 s, which left the torpedo exactly at the boundary.
    // STRUCTURAL SWEEP over the weapon registry (EQUIPMENT_IS_WEAPON), not a
    // hand-enumerated list, so a future weapon's reload is covered
    // automatically. This also now covers the radar buoy's 30s reload, which
    // the old five-reload enumeration omitted.
    // Read off the FIREWALL rather than a hand-built CONFIG table (Story 8.1:
    // `EffectiveStats.equipment` is total over EquipmentId), so every weapon is
    // covered the day its module lands. The MONITOR GUN's 50 s was the tightest
    // margin until Story 8.15 cut it (amendment 89e); the tightest now is the
    // radar buoy's / heavy torpedo's 30 s class, far inside the window.
    const stats = effectiveStats(CONFIG.shipClasses.battleship);
    for (const id of EQUIPMENT_IDS) {
      if (!EQUIPMENT_IS_WEAPON[id]) continue;
      expect(CONFIG.xp.assistWindowMs, id).toBeGreaterThan(stats.equipment[id].reloadMs);
    }
    expect(Object.keys(CONFIG.xp).sort()).toEqual(['assistWindowMs', 'droneTierLevels', 'killLevels', 'killerShare', 'levelMs']);
  });

  it('carries the bounty block (Story 4.6, Eric ruling 2026-08-10) — identity-only economy, no location knob', () => {
    expect(CONFIG.bounty.minCaptainKills).toBeGreaterThanOrEqual(1); // a zero-kill field has no bounty
    // The shape pin doubles as the no-location guard: any radius/range/bloom
    // tunable appearing here would violate the 2026-08-10 ruling by its key
    // alone.
    expect(Object.keys(CONFIG.bounty).sort()).toEqual(['killLevels', 'minCaptainKills']);
  });

  it('re-exports burstVictims; the deck gun block carries no shellRange or mounts field', () => {
    expect(typeof burstVictims).toBe('function');
    expect('shellRange' in CONFIG.gun).toBe(false);
    expect('mounts' in CONFIG.gun).toBe(false);
  });

  it('re-exports the firing-under-latency wire contract (Story 1.5)', () => {
    expect(MSG.ping).toBe('p');
  });

  it('re-exports the silhouette system (Story 1.3)', () => {
    expect(typeof hullEnvelope).toBe('function');
    expect(typeof hullSilhouette).toBe('function');
    expect(typeof transformPolygon).toBe('function');
    expect(typeof segPolygonHit).toBe('function');
    expect(typeof polygonMaxRadius).toBe('function');
    // The return-grammar echo-size primitive (radar realism cycle, PV 26).
    expect(typeof perpendicularExtent).toBe('function');
  });

  it('re-exports `hullIsFull` — the ONE definition of a full hull (amendment 53)', () => {
    // Three callers across two workspaces read it (the HULL REPAIR row's
    // refusal, the out-of-combat regen's snap, the client's belt pre-denial),
    // so it has to be on the barrel or one of them re-derives it.
    expect(typeof hullIsFull).toBe('function');
    expect(hullIsFull(349, 350)).toBe(false);
    expect(hullIsFull(349.5, 350)).toBe(true);
  });

  it('re-exports MULLIGAN_CHOICE — the one legal negative on the spend channel (Story 8.10)', () => {
    expect(MULLIGAN_CHOICE).toBe(-2);
    // A NEGATIVE INTEGER STRICTLY BELOW -1, and outside every offer slot: -1
    // stays malformed (the DAMAGE CONTROL sentinel left the wire at PV 53,
    // epic-8 amendment 46) and no offer index can ever collide with it.
    expect(Number.isInteger(MULLIGAN_CHOICE)).toBe(true);
    expect(MULLIGAN_CHOICE).toBeLessThan(-1);
    expect(MULLIGAN_CHOICE >= 0 && MULLIGAN_CHOICE < CONFIG.offer.size).toBe(false);
    expect(typeof usableLines).toBe('function'); // the guarantee's one shared helper
  });

  it('re-exports the loadout + kinematics-fold systems (boost AND the 2.8 slow)', () => {
    expect(typeof loadoutFor).toBe('function');
    expect(typeof boostedKinematics).toBe('function');
    expect(typeof slowedKinematics).toBe('function');
    // THE SHIFT BOOST (Story 8.9, epic-8 amendment 54 — Eric verbatim: "Build
    // as-written, except 25s reload"). The legacy flat `CONFIG.speedBoost`
    // block is DELETED; `factor` is a FRACTION of the post-fold max speed.
    expect((CONFIG as Record<string, unknown>).speedBoost).toBeUndefined();
  });

  it('EQUIPMENT_IS_WEAPON: mine FLIPPED to a click-aimed weapon (Story 2.8, amendment 45)', () => {
    // WIDENED to catalog v3 (Story 8.1): 7 ids -> 15, the shipped torpedo/mine
    // renamed heavyTorpedo/navalMines. The per-id pins live in loadout.test.ts;
    // here the barrel pins TOTALITY and the split's shape.
    expect(Object.keys(EQUIPMENT_IS_WEAPON)).toEqual([...EQUIPMENT_IDS]);
    // 15 -> 14 (Story 8.9): the legacy flat-bonus boost id is gone and the v3
    // `boost` id IS the Shift boost. STORY 8.15 (amendments 89c/97–102): the
    // non-weapons are the THREE class Shifts, and nothing else.
    expect(EQUIPMENT_IDS.filter((id) => !EQUIPMENT_IS_WEAPON[id])).toEqual(['boost', 'instantReload', 'hunker']);
    expect(EQUIPMENT_IS_WEAPON.navalMines).toBe(true); // aimed rear-arc placement (2.8, a45)
    // The radar buoy is DELETED (Story 8.16) — its click-placed slot is gone.
    expect('radarBuoy' in EQUIPMENT_IS_WEAPON).toBe(false);
  });

  it('the CONSUMABLE-SLOT surface (Story 8.7, fixed slots since 9.2): the stock slot, the slot-item guard and the two split tables', () => {
    // Story 8.7 adds the consumable half of the slot vocabulary. It is a
    // WIRE-NEUTRAL addition — PROTOCOL_VERSION stayed 52 at 8.7 (no new field,
    // no catalog content change; every consumable line was still a stub then,
    // epic-8 amendment 41; Story 8.8 flipped hullRepair live and took the
    // bump) — but both sides import these names, so the barrel pins them here.
    expect(typeof stockSlotFor).toBe('function');
    expect(typeof isConsumableId).toBe('function');
    expect(typeof isWeaponItem).toBe('function');
    expect(typeof slotMaxAmmo).toBe('function');
    expect(Object.keys(CONSUMABLE_IS_WEAPON)).toEqual([...CONSUMABLE_IDS]);
    // THE TWO ID SPACES STAY DISJOINT: EquipmentId is never widened, so every
    // EquipmentId-keyed record (EQUIPMENT_IS_WEAPON, EQUIPMENT_STAT_FIELDS,
    // the server rows, the glyphs) stays honest and each read of one narrows
    // through the guard.
    for (const id of CONSUMABLE_IDS) expect((EQUIPMENT_IDS as readonly string[]).includes(id), id).toBe(false);
    for (const id of EQUIPMENT_IDS) expect(isConsumableId(id), id).toBe(false);
    // A kind stocks at its OWN fixed slot under the ship's KIT (Story 9.2 /
    // 10.1) and nowhere else.
    const empty: (SlotItemId | null)[] = Array.from({ length: SLOT_COUNT }, () => null);
    expect(stockSlotFor(empty, 'hullRepair', DEFAULT_KIT)).toBe(consumableSlotFor(DEFAULT_KIT, 'hullRepair'));
    // THE KIT LAW (Story 10.1): the validator, the roll, the pool and the
    // default ride the barrel for both sides.
    for (const fn of [isConsumableKit, rollKit, dealableConsumables, consumableKindAt]) expect(typeof fn).toBe('function');
    expect(isConsumableKit(DEFAULT_KIT)).toBe(true);
    expect(DEFAULT_KIT).toHaveLength(KIT_SIZE);
    // `canStock` and the `beltFull` refusal are DELETED with the belt; the
    // global key row `CONSUMABLE_KEY_ORDER` is DELETED with Story 10.1 (no alias).
    const ns = shared as Record<string, unknown>;
    expect(ns.canStock).toBeUndefined();
    expect(ns.CONSUMABLE_KEY_ORDER).toBeUndefined();
  });

  it('CONFIG.broadside never hits a mine, carries its own range dial and no arc field, and both arc ladders are cap-long', () => {
    expect(CONFIG.broadside.hits).toEqual(['hull', 'decoy']); // AR44 — never a mine since amendment 200 (only deck guns, by landing)
    // A range field of its own since Story 9.8 (ruling 125) — and still NO
    // arc field: the beams are a twin-sector descriptor, not 'full'.
    expect('rangeU' in CONFIG.broadside).toBe(true);
    expect('arc' in CONFIG.broadside).toBe(false);
    // One entry per reachable SPREAD rung: 0..4 copies of a ×4 card. BOTH
    // ladders, and the SAME length — one rung indexes them together
    // (effectiveStats pairs them by index; a length mismatch would silently
    // clamp one and run off the other).
    //
    // RE-PINNED AGAINST THE BROADSIDE LINE (Story 8.1). The v2 `broadsideSpread`
    // card the old coupling counted is gone; catalog v3 folds the spread rung
    // into the BROADSIDE equipment line's tiers II-V (catalog-v3 R35, "+1 spread
    // rung" per tier), which Story 8.16 authors. Five rungs = the line's tier I
    // plus its four upgrade steps, so the ladder length is `cap`, not `copies+1`.
    expect(CATALOG.broadside.cap).toBe(5);
    expect(CONFIG.broadside.traverseDeg).toHaveLength(CATALOG.broadside.cap);
    expect(CONFIG.broadside.turretMountSpreadDeg).toHaveLength(CATALOG.broadside.cap);
    expect(CONFIG.broadside.turretMountSpreadDeg).toHaveLength(CONFIG.broadside.traverseDeg.length);
  });

  it('CONFIG has no radar buoy or chaff block (both retired)', () => {
    // CHAFF is RETIRED (Story 9.2, epic-9 amendment 31): its block is gone.
    expect((CONFIG as Record<string, unknown>).chaff).toBeUndefined();
    // THE RADAR BUOY IS DELETED END TO END (Story 8.16): its CONFIG block (the
    // sensor, the gun buoy, the jamming fakes) went with it.
    expect((CONFIG as Record<string, unknown>).radarBuoy).toBeUndefined();
  });

  it('CONFIG.starShells: the flare DEALS DAMAGE again and its doctrine fields are gone (Story 8.17)', () => {
    // Eric ruling 2026-09-29, epic-8 amendments 130/134: `damage: 20` (tier I; swapped with phosphor 2026-10-01, amendment 208)
    // arrives — amendment 39's "structurally damageless" is SUPERSEDED — and
    // `incendiaryRadiusFactor`, `incendiaryDps` and `dazzleSightFactor` are
    // DELETED with the star-shell verbs.
    // AR44 (Story 8.4): NO 'mine' bit — illumination detonates nothing.
    expect(CONFIG.starShells.hits).toEqual(['hull', 'decoy']);
    expect(CONFIG.starShells.arc).toBe('full');
    expect(CONFIG.starShells.damage).toBeGreaterThan(0);
    for (const gone of ['incendiaryRadiusFactor', 'incendiaryDps', 'dazzleSightFactor']) {
      expect(gone in CONFIG.starShells, gone).toBe(false);
    }
    expect('rangeU' in CONFIG.starShells).toBe(true); // its own tiered dial (Story 9.8, ruling 125)
    // The ratified SIGHT/2 structural derivation survives.
    expect(CONFIG.starShells.litRadius).toBe(CONFIG.vision.sight / 2);
  });

  it('CONFIG.phosphorShells fires 360° and never hits a mine; its range is its own tiered dial', () => {
    expect(CONFIG.phosphorShells.arc).toBe('full');
    // Never a mine (amendment 200, superseding 135(c)): only a deck gun's
    // shell landing on a mine damages one.
    expect(CONFIG.phosphorShells.hits).toEqual(['hull', 'decoy']);
    expect('rangeU' in CONFIG.phosphorShells).toBe(true); // its own tiered dial (Story 9.8, ruling 125)
  });

  it('CONFIG.foulingShell: no damage, no tiers, and a slow that leaves the hull moving (Story 9.4, epic-9 amendments 61–68)', () => {
    // FLASH SHELLS' block left with Story 9.4 and is BACK beside this one since
    // Story 10.9 (its own pin below); the two click shells share this reach.
    expect('flashShells' in CONFIG).toBe(true);
    const fs = CONFIG.foulingShell;
    expect('damage' in fs).toBe(false); // zero damage — a slow is not damage
    // Its reach is its own FIXED dial since Story 9.8 (ruling 125: 8/12, no
    // tiers — a consumable has no stats row, so no Tier V dial either).
    expect(fs.rangeU).toBe(TWELFTH * 8);
    expect('rangeUAtV' in fs).toBe(false);
    expect(fs.hits).toEqual(['hull', 'decoy']); // the star shell's mask — never a mine
    expect(fs.slowFactor).toBeGreaterThan(0); // never a full stop
    expect(fs.slowFactor).toBeLessThan(1); // it does slow
    expect(fs.lingerMs).toBeGreaterThan(0);
  });

  it('CONFIG.mine: aimed-placement + chain-era fields (Story 2.8) over the 1.8 geometry', () => {
    expect(CONFIG.mine.blastRadius).toBeGreaterThan(CONFIG.mine.triggerRadius);
    // RETIRED (Story 8.4, FR57/AR48): `CONFIG.mine.maxLive` and
    // `CONFIG.mine.globalCap` are DELETED — mines have no cap at all. The pin
    // is inverted so the fields can never quietly come back.
    expect('maxLive' in CONFIG.mine).toBe(false);
    expect('globalCap' in CONFIG.mine).toBe(false);
    expect(CONFIG.mine.hits).toEqual(['hull']);
    // PROP FOULING LEFT CONFIG.mine (Eric ruling 2026-09-19, epic-8 amendment
    // 81): FOULING MINES is its own tiered EQUIPMENT line now and a naval mine
    // no longer slows anything, so `foulFactor`/`foulDurationMs` moved into
    // `CONFIG.foulingMines` as `slowFactor`/`slowDurationMs` (same values).
    // The pin is INVERTED so they can never quietly come back here.
    expect('foulFactor' in CONFIG.mine).toBe(false);
    expect('foulDurationMs' in CONFIG.mine).toBe(false);
    // RETIRED (Story 7-5 wave 2): the three creep pins — creepSpeed 14 u/s,
    // creepAcquireRange 150u, and acquire > blast. They pinned the SELF-
    // PROPELLED doctrine's tuning, and that doctrine left the game with its
    // card; the constants are deleted, so the pins go with them rather than
    // being adapted. Their ABSENCE is what is pinned now — a mine cannot move.
    expect((CONFIG.mine as Record<string, unknown>).creepSpeed).toBeUndefined();
    expect((CONFIG.mine as Record<string, unknown>).creepAcquireRange).toBeUndefined();
    // THE CAPTIVE TRANSFORM LEFT TOO (epic-8 amendment 84d): CAPTIVE MINES has
    // its own `CONFIG.captiveMines` ring pair (144 u trip / 32 u fixed burst,
    // the trip stepping x1.1 per tier off the ROW'S TIER), so the old
    // swap-and-triple multiplier has no consumer. Inverted pin, same reason.
    expect('captiveTriggerFactor' in CONFIG.mine).toBe(false);
    expect((CONFIG as Record<string, unknown>).cannon).toBeUndefined();
    // The LEGACY decoy-buoy EQUIPMENT block stays gone, and so does the 8.16
    // CONSUMABLE's `CONFIG.decoyBuoy` (Story 10.9): the four buoys share ONE
    // `CONFIG.buoy` block — the body's two numbers plus the life, the effect
    // radius, the two tail dials and one sub-block per effect kind.
    expect((CONFIG as Record<string, unknown>).decoyBuoy).toBeUndefined();
    expect(Object.keys(CONFIG.buoy).sort()).toEqual(
      ['heal', 'hp', 'lifetimeMs', 'radiusU', 'shield', 'sizeU', 'speed', 'tailHoldMs', 'tailRampMs'],
    );
    expect(Object.keys(CONFIG.buoy.heal)).toEqual(['missingPctPerS']);
    expect(Object.keys(CONFIG.buoy.shield)).toEqual(['maxHpPctPerS']);
    expect(Object.keys(CONFIG.buoy.speed)).toEqual(['factor']);
    // RELATIONS, not values: a buoy lives, reaches, and every rate is a
    // positive fraction; the tail dials are non-negative.
    expect(CONFIG.buoy.lifetimeMs).toBeGreaterThan(0);
    expect(CONFIG.buoy.radiusU).toBeGreaterThan(CONFIG.buoy.sizeU);
    expect(CONFIG.buoy.tailHoldMs).toBeGreaterThanOrEqual(0);
    expect(CONFIG.buoy.tailRampMs).toBeGreaterThanOrEqual(0);
    for (const pct of [CONFIG.buoy.heal.missingPctPerS, CONFIG.buoy.shield.maxHpPctPerS, CONFIG.buoy.speed.factor]) {
      expect(pct).toBeGreaterThan(0);
      expect(pct).toBeLessThan(1);
    }
  });

  it('CONFIG.flashShells: back beside the fouling shell — no damage, no reach of its own, a three-phase whiteout window (Story 10.9; Eric 2026-10-29)', () => {
    const fl = CONFIG.flashShells;
    expect(Object.keys(fl).sort()).toEqual(
      ['arc', 'clearMs', 'hits', 'holdMs', 'radius', 'rampMs', 'shellRadius', 'shellSpeed'],
    );
    expect('damage' in fl).toBe(false); // a dazzle is not damage
    // ONE reach for the two click shells (ruling 2): the flash has NO rangeU
    // of its own — the server reads CONFIG.foulingShell.rangeU for both.
    expect('rangeU' in fl).toBe(false);
    expect(fl.hits).toEqual(['hull', 'decoy']); // the star shell's mask — never a mine
    expect(fl.arc).toBe('full');
    expect(fl.radius).toBeGreaterThan(0);
    // THE WHITEOUT LAW: three finite non-negative phases whose SUM is the
    // window (sim/sight.ts FLASH_WINDOW_MS — never a fourth literal).
    for (const ms of [fl.rampMs, fl.holdMs, fl.clearMs]) {
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeGreaterThanOrEqual(0);
    }
    expect(fl.rampMs + fl.holdMs + fl.clearMs).toBeGreaterThan(0);
    expect(FLASH_WINDOW_MS).toBe(fl.rampMs + fl.holdMs + fl.clearMs);
  });

  it('CONFIG.torpedo: the homing travel budget is finite and positive, so a fish can never orbit forever', () => {
    // `commandBurstRadius` is RETIRED with COMMAND DETONATION (Story 7-5).
    expect('commandBurstRadius' in CONFIG.torpedo).toBe(false);
    // The homing travel budget (review P8): finite, so a fish can never orbit
    // forever.
    expect(Number.isFinite(CONFIG.torpedo.homingMaxRangeU)).toBe(true);
    expect(CONFIG.torpedo.homingMaxRangeU).toBeGreaterThan(0);
  });

  it('CONFIG.lightTorpedo (R18): a beam-centred twin-sector fish that runs under mines and carries no chassis duplicate', () => {
    expect(CONFIG.lightTorpedo.offset).toBe(deg(90)); // the twin sector's centre: BOTH beams
    expect(CONFIG.lightTorpedo.hits).toEqual(['hull', 'decoy']); // AR44 — it runs UNDER a minefield
    // NO MAX RANGE, and no chassis duplication: hit radius, spawn clearance
    // and the homing acquire/die/update thresholds are the FAMILY's, read from
    // CONFIG.torpedo (epic-8 amendments 84e/84f).
    for (const k of ['hitRadius', 'spawnClearance', 'homingAcquireRange', 'homingMaxRangeU', 'rangeU']) {
      expect(k in CONFIG.lightTorpedo, k).toBe(false);
    }
  });

  it('CONFIG.supercavTorpedo (amendment 74): a CONSUMABLE — no reload, no pool, no tiers', () => {
    expect(CONFIG.supercavTorpedo.offset).toBe(deg(0)); // bow-centered
    expect(CONFIG.supercavTorpedo.hits).toEqual(['hull', 'decoy']);
    // THE ABSENCES ARE THE RULING (Eric 2026-09-19): a consumable never
    // reloads (catalog-v3 R40) and its copies STOCK rather than step, so R19's
    // 45 s reload and its tiers II-V are VOID.
    for (const k of ['reloadMs', 'maxAmmo', 'homingTurnRate']) {
      expect(k in CONFIG.supercavTorpedo, k).toBe(false);
    }
  });

  it('CONFIG.captiveMines (R25, amendments 77/84d): the trip ring is bigger than the burst and steps up per tier', () => {
    expect(CONFIG.captiveMines.triggerStepPerTier).toBeGreaterThan(1);
    // The trip ring is the big one and the burst the small one — the reverse
    // of a contact mine.
    expect(CONFIG.captiveMines.triggerRadius).toBeGreaterThan(CONFIG.captiveMines.blastRadius);
  });

  it('CONFIG.foulingMines (amendment 81): trips on hulls only, outblasts the naval mine, and reuses its trip fraction and none of its chassis', () => {
    expect(CONFIG.foulingMines.hits).toEqual(['hull']); // AR44 — a mine trips on hulls only
    // ONE SOURCE FOR THE TRIP FRACTION: it reuses CONFIG.mine.triggerFactor
    // rather than restating 2/3, so the naval and fouling rings cannot drift.
    expect('triggerFactor' in CONFIG.foulingMines).toBe(false);
    expect(CONFIG.foulingMines.blastRadius).toBeGreaterThan(CONFIG.mine.blastRadius);
    // ...and the naval chassis (rear sector, leash, arm delay) is NOT copied.
    for (const k of ['offset', 'placeHalfArcDeg', 'placeRange', 'armDelay']) {
      expect(k in CONFIG.foulingMines, k).toBe(false);
    }
  });

  it('re-exports the mine WIRE shape: MineKind + MineView.c for every observer (Eric 2026-10-01, supersedes amendment 76)', () => {
    // A TYPE-LEVEL PIN as much as a runtime one — this file type-checks in the
    // gate, so a `MineKind` the barrel does not export fails to compile here.
    // `c` stays OPTIONAL on the type (a pre-68 frame carried none for others).
    const kinds: MineKind[] = ['naval', 'captive', 'fouling'];
    expect(kinds).toHaveLength(3);
    // The OWNER's marker carries the kind...
    const own: MineView = { id: 'm1', x: 10, y: 20, own: true, by: 'ship1', c: 'captive' };
    expect(own.c).toBe('captive');
    expect(Object.keys(own)).toEqual(['id', 'x', 'y', 'own', 'by', 'c']);
    // ...and so does EVERY OTHER OBSERVER's ("Everyone sees the kind").
    const seen: MineView = { id: 'm1', x: 10, y: 20, own: false, by: 'ship1', c: 'fouling' };
    expect(seen.c).toBe('fouling');
    expect(Object.keys(seen)).toEqual(['id', 'x', 'y', 'own', 'by', 'c']);
  });

  it('re-exports GhostPaint (cycle 162): the blip rect minus k and t', () => {
    // TYPE-LEVEL PINS: a ghost rect is exactly the blip payload's rect, and a
    // blip is assignable to it (ReturnBlipEvent extends GhostPaint), so the
    // two shapes cannot drift. The blip itself keeps its seven keys. (The
    // chaff owner's OwnShip.chaffGhosts that first used it is retired with
    // CHAFF in Story 9.2.)
    const blip: ReturnBlipEvent = { k: 'blip', t: 1000, gx: 3, gy: -4, w: 2, h: 1, bits: [3] };
    expect(Object.keys(blip)).toEqual(['k', 't', 'gx', 'gy', 'w', 'h', 'bits']);
    const { k: _k, t: _t, ...rect } = blip;
    const ghost: GhostPaint = rect;
    expect(Object.keys(ghost)).toEqual(['gx', 'gy', 'w', 'h', 'bits']);
  });

  it('re-exports the 8.16 WIRE shapes: DecoyView (by for all, hp own-only), FrameMsg.decoys, OwnShip.shield', () => {
    // TYPE-LEVEL PINS as much as runtime ones — this file type-checks in the
    // gate, so a missing `DecoyView` export, a required `hp`, a missing
    // `FrameMsg.decoys` or `OwnShip.shield` fails to compile here.
    // Story 10.9: `kind` rides every view; `sweep` (radar kind) and `until`
    // are own-only, like `hp`.
    const own: DecoyView = { id: 'd1', x: 10, y: 20, own: true, by: 'ship1', kind: 'radar', hp: 50, sweep: 0.5, until: 30000 };
    expect(own.hp).toBe(50);
    expect(own.kind).toBe('radar');
    // Every other observer: `by` (the hue latch, amendment 124(a)) and `kind`,
    // NO `hp`, NO `sweep`, NO `until`.
    const seen: DecoyView = { id: 'd1', x: 10, y: 20, own: false, by: 'ship1', kind: 'healing' };
    expect(seen.hp).toBeUndefined();
    expect(seen.sweep).toBeUndefined();
    expect(seen.until).toBeUndefined();
    expect(Object.keys(seen)).toEqual(['id', 'x', 'y', 'own', 'by', 'kind']);
    const frame: Pick<FrameMsg, 'decoys'> = { decoys: [own] };
    expect(frame.decoys).toHaveLength(1);
    const shield: NonNullable<OwnShip['shield']> = { hp: 100, until: 10000 };
    expect(shield.hp).toBe(CONFIG.shieldBlock.hp);
    // Story 10.9's three self-private own-ship fields compile in their shapes.
    const you: Pick<OwnShip, 'dazzledUntil' | 'buoyShield' | 'speedBuoyAt'> = {
      dazzledUntil: 12000,
      buoyShield: { hp: 7 },
      speedBuoyAt: 11000,
    };
    expect(you.buoyShield?.hp).toBe(7);
  });

  it('re-exports the 9.3 COUNTERMEASURE shapes: the cloud.ts disc functions, CloudRecord (server store), CloudView + FrameMsg.clouds (wire)', () => {
    // TYPE-LEVEL PINS as much as runtime ones: the wire view is exactly
    // id,x,y,t0 — a radius, owner, count or expiry would be an excess property.
    for (const fn of [cloudScale, cloudOutlineRadius]) {
      expect(typeof fn).toBe('function');
    }
    const rec: CloudRecord = { id: 'cl1', ownerId: 'ship1', x: 1, y: 2, bornAt: 1000, until: 16000 };
    const view: CloudView = { id: rec.id, x: rec.x, y: rec.y, t0: rec.bornAt };
    expect(Object.keys(view)).toEqual(['id', 'x', 'y', 't0']);
    const frame: Pick<FrameMsg, 'clouds'> = { clouds: [view] };
    expect(frame.clouds).toHaveLength(1);
    expect(cloudOutlineRadius(0)).toBe(CONFIG.countermeasure.r0);
    // The retired 8.18 smoke symbols and cycle 174's pixel machinery are gone
    // from the barrel (Story 9.3 session 2: the cloud is a client overlay).
    for (const gone of ['puffRadius', 'cloudBase', 'cloudBlocks', 'forEachLivingPixel']) {
      expect((shared as Record<string, unknown>)[gone], gone).toBeUndefined();
    }
  });

  it('the radar buoy wire is GONE (Story 8.16): no BuoyView export, no FrameMsg.buoys, no blip `src`', () => {
    // Runtime half: no value named after the buoy leaks from the barrel.
    for (const gone of ['BuoyView', 'buoyGate', 'scatterJamFakes']) {
      expect((shared as Record<string, unknown>)[gone], gone).toBeUndefined();
    }
    // Type half: a blip is exactly k,t,gx,gy,w,h,bits — `src` would be an
    // excess property and fail to compile.
    const blip: ReturnBlipEvent = { k: 'blip', t: 0, gx: 0, gy: 0, w: 1, h: 1, bits: [1] };
    expect(Object.keys(blip)).toEqual(['k', 't', 'gx', 'gy', 'w', 'h', 'bits']);
    // @ts-expect-error — `buoys` is no longer a FrameMsg key
    const stale: Pick<FrameMsg, 'buoys'> = {};
    expect(stale).toEqual({});
  });

  it('re-exports the mine RING derivations (sim/stats.ts — the one home for both)', () => {
    // A CONTACT mine's trip ring is a fixed fraction of its blast...
    expect(mineTriggerRadius(CONFIG.mine.blastRadius)).toBe(CONFIG.mine.triggerRadius);
    expect(mineTriggerRadius(72)).toBeCloseTo(48, 9);
    // ...and the CAPTIVE's rides its TIER instead (epic-8 amendment 84d).
    expect(captiveTriggerRadius(1)).toBe(CONFIG.captiveMines.triggerRadius);
    expect(captiveTriggerRadius(5)).toBeCloseTo(CONFIG.captiveMines.triggerRadius * CONFIG.captiveMines.triggerStepPerTier ** 4, 6); // 175.692 u at the 2026-10-08 ring
    // Non-finite / sub-1 tiers clamp to the tier-I ring, never NaN.
    for (const bad of [NaN, Infinity, -Infinity, 0, -3]) {
      expect(Number.isFinite(captiveTriggerRadius(bad)), `${bad}`).toBe(true);
    }
    expect(captiveTriggerRadius(NaN)).toBe(CONFIG.captiveMines.triggerRadius);
  });

  it('re-exports THE CATALOG + the card fold engine (Story 8.1, catalog v3)', () => {
    expect(Object.keys(HOOK_REGISTRY)).toHaveLength(0); // still EMPTY (amendment 30 satisfied data-side)
    expect(Object.isFrozen(CATALOG)).toBe(true);
    expect(Object.isFrozen(HOOK_REGISTRY)).toBe(true);
    expect(Object.isFrozen(NO_CARDS)).toBe(true);
    // 1 of the 26 lines is a STUB — authored in shape, mechanism unbuilt,
    // never dealt (Eric ruling 2026-09-15, amendment 5). 13 until Story 8.8
    // gave HULL REPAIR its effect; 12 until Story 8.13 built the LIGHT
    // TORPEDO, the CAPTIVE MINE and the SUPERCAV TORPEDO and added the one new
    // stub, DEPTH CHARGE; 10 until Story 8.15 cut three and built two; 5 until
    // Story 8.16 built SHIELD BLOCK, CHAFF and DECOY BUOY; 2 until Story 8.18
    // built SMOKE SCREEN.
    expect(LINE_IDS.filter((id) => isStubLine(id))).toEqual(['depthCharge']);
    // THE GENERATED WHITELIST, and its deliberate absences (see sim/effects.ts).
    expect(BOON_STAT_PATHS.length).toBeGreaterThan(0);
    expect(Object.keys(EQUIPMENT_STAT_FIELDS).sort()).toEqual([...EQUIPMENT_IDS].sort());
    // The machine gun's shot delay is card-addressable (Eric 2026-09-30: its
    // ladder steps it, and the refit tier card prints a RATE row off it).
    // Story 9.8 (ruling 125): its reach is a card-addressable tiered dial too.
    expect(EQUIPMENT_STAT_FIELDS.machineGun).toEqual(['reloadMs', 'maxAmmo', 'rangeU', 'damage', 'rateMs']);
    for (const w of ['gun', 'machineGun', 'flak', 'broadside', 'starShells', 'phosphorShells'] as const) {
      expect(BOON_STAT_PATHS, w).toContain(`equipment.${w}.rangeU`);
    }
    expect(BOON_STAT_PATHS).toContain('equipment.machineGun.rateMs');
    for (const path of [
      'sweepPeriodMs', 'sightRange',
      // Story 9.7 (epic-9 amendments 86–88 / 110–117): the Armor multiplier
      // is DERIVED from `armor` (which IS addressable) — never a card path.
      'damageMultiplier',
      // Every weapon `rangeU` LEFT this list with Story 9.8 (ruling 125 — a
      // tiered dial the cards step, pinned PRESENT above).
      'equipment.phosphorShells.tier',
      // The cut's Armor bonus is fixed (Story 9.7, epic-9 amendment 88 — it
      // replaced the deleted factor). (`machineGun.rateMs` is ADDRESSABLE since
      // 2026-09-30 — its ladder steps it; the idle clock is deleted.)
      'equipment.machineGun.idleReloadMs', 'equipment.hunker.armorBonus',
      'equipment.broadside.traverseRad', 'equipment.broadside.mountSpreadRad',
      'equipment.navalMines.triggerRadius', 'equipment.gun.tier',
      // THE CAPTIVE MINE HAS NEITHER RADIUS PATH (epic-8 amendment 84d): its
      // trip ring is derived from its TIER and its 32 u burst is fixed.
      'equipment.captiveMines.triggerRadius', 'equipment.captiveMines.blastRadius',
      'equipment.foulingMines.triggerRadius',
    ]) expect(BOON_STAT_PATHS, path).not.toContain(path);
    // ...and `supercavTorpedo` has no paths at all — it is a CONSUMABLE now
    // (amendment 74), so it has no stat row to address.
    for (const path of BOON_STAT_PATHS) expect(path.startsWith('equipment.supercavTorpedo.')).toBe(false);
    // CUT FROM FIVE ENTRIES TO TWO (amendments 80/81): the torpedoes' `homing`
    // and the naval mine's `propFouling` went with the cards that granted them;
    // and TO ONE in Story 8.15: the missile's `homing` went with HEAT SEEKING;
    // and TO NONE in Story 8.17 (amendment 134): the star shell's
    // `phosphor`/`dazzle` went with their add-ons. The table itself stays,
    // empty — the machinery is kept for a future add-on.
    expect(Object.keys(DOCTRINE_MODES)).toEqual([]);
    // ...and `foulingShell` has no paths — the FOULING SHELL is a CONSUMABLE.
    for (const path of BOON_STAT_PATHS) expect(path.startsWith('equipment.foulingShell.')).toBe(false);
    // DELETED WITH RARITY AND THE SUBDECK WALK (Story 8.1): there is no card
    // scarcity tier, no offer category and no acquisition card left anywhere.
    for (const gone of [
      'BOON_CATALOG', 'UNIVERSAL_CATEGORIES', 'EQUIPMENT_CATEGORY', 'isAcquisitionDef',
      'consumeAcquisition', 'resolveBoons', 'applyBoonStats', 'slotsWithBoons',
      'boonBehaviors', 'validateBoonDef', 'NO_BOONS',
    ]) expect((shared as Record<string, unknown>)[gone], gone).toBeUndefined();
    // sim/spread.ts — the ONE straddle rule both sides call (Story 7-5 wave 2).
    for (const fn of [straddleOffsets, parallelOffsets]) {
      expect(typeof fn).toBe('function');
    }
    for (const fn of [
      resolveCards,
      cardCounts,
      applyCardStats,
      applySlotEffect,
      slotsWithCards,
      cardBehaviors,
      hookKinematics,
      isStubLine,
      catalogCardCount,
      validateLine,
      validateCatalog,
    ]) {
      expect(typeof fn).toBe('function');
    }
    expect(validateCatalog()).toEqual([]);
  });

  it('re-exports THE COMMON POOL DRAW + the offer/spend wire shape (Story 8.14)', () => {
    for (const fn of [drawOffer, eligibleLines, lineWeight, usableLines]) {
      expect(typeof fn).toBe('function');
    }
    // THE DECK AND THE MATCH POOL ARE GONE (Eric ruling 2026-09-21, epic-8
    // amendment 89a): no deck engine, no legality rules, no default decks, no
    // ownership set, no hidden match pool. sim/draw.ts is the whole draw.
    for (const name of [
      'buildDeck',
      'buildDeckState',
      'consumeCard',
      'DeckState',
      'checkDeck',
      'equipmentLineCount',
      'deckFromCounts',
      'DEFAULT_DECKS',
      'DEFAULT_OWNED',
      'rollMatchPool',
      'sanitizePool',
      'consumableLines',
    ]) {
      expect((shared as Record<string, unknown>)[name], name).toBeUndefined();
    }
    // RETIRED with the exclusivity mechanism (Story 7-5 wave 2, R2.6):
    // `returnCards` was the doctrine swap-out's give-back and the cannon pair
    // was the mechanism's last user, so nothing ever hands a card back.
    expect((shared as Record<string, unknown>).returnCards).toBeUndefined();
    // ...and the AP sweep it sat beside is gone the same way.
    expect((shared as Record<string, unknown>).pierceDamage).toBeUndefined();
    expect((shared as Record<string, unknown>).PIERCE_FALLOFF).toBeUndefined();
    // The BARREL fan step is retired for a LATERAL spacing (R2.16).
    expect((shared as Record<string, unknown>).BARREL_FAN_STEP_RAD).toBeUndefined();
    // RETIRED by the lazy-draw bugfix (cycle 69/72 house style — no dead knob
    // survives): only the FRONT offer is ever materialized, so there is no
    // second banked offer to scrub stale acquisition cards out of.
    expect((shared as Record<string, unknown>).scrubAcquisitions).toBeUndefined();
    // CONFIG.deck AND CONFIG.pool ARE DELETED (Story 8.14): the draw's only
    // dials are the offer size and the weighting pair, and CONFIG.catalog still
    // carries the one engine dial the fold needs.
    expect((CONFIG as Record<string, unknown>).deck).toBeUndefined();
    expect((CONFIG as Record<string, unknown>).pool).toBeUndefined();
    expect(Object.keys(CONFIG.catalog)).toEqual(['reloadStepPerTier']);
    // THE WEIGHTING (amendments 90/91): the offer size and the factor/floor
    // pair are the draw's only dials.
    expect(Object.keys(CONFIG.offer).sort()).toEqual(['size', 'weighting']);
    expect(Object.keys(CONFIG.offer.weighting).sort()).toEqual(['factor', 'floor']);
    expect(MSG.spend).toBe('u');
    expect('upgradePoints' in CONFIG).toBe(false);
  });

  it("re-exports THE SEAT'S GUN (Story 8.14, amendments 89d/95)", () => {
    expect(GUN_IDS).toEqual(['deckGun', 'machineGun', 'flak']);
    expect(DEFAULT_GUN).toBe('deckGun');
    expect(typeof isGunId).toBe('function');
    // STORY 8.15 gave each gun its OWN module (amendments 103–105): the 8.14
    // interim, where every seat gun mounted the deck-gun module, is over.
    expect(MOUNTED_GUN).toEqual({ deckGun: 'gun', machineGun: 'machineGun', flak: 'flak' });
  });

  it('re-exports THE CLASS SHIFTS and the gun-family wire vocabulary (Story 8.15)', () => {
    expect(SHIFT_IDS).toEqual(['boost', 'instantReload', 'hunker']);
    expect(DEFAULT_SHIFT).toBe('boost');
    expect(SHELL_FAMILIES).toEqual(['cannon', 'mg', 'flak']);
    expect(classShift('torpedoBoat')).toBe('boost');
    expect(classShift('mineLayer')).toBe('instantReload');
    expect(classShift('battleship')).toBe('hunker');
    expect(CONFIG.machineGun.hits).toEqual(['hull', 'mine', 'decoy']);
    expect(CONFIG.flak.hits).toEqual(['hull', 'mine', 'decoy', 'ordnance']);
    expect([CONFIG.machineGun.arc, CONFIG.flak.arc]).toEqual(['full', 'full']);
    // The retired flat D − 10 dial never comes back under its old name.
    expect('edgeFalloff' in CONFIG.flak).toBe(false);
    // Story 9.7: the HUNKER's flat damage factor is DELETED, not kept beside
    // its Armor bonus.
    expect(Object.keys(CONFIG.hunker).sort()).toEqual(['armorBonus', 'durationMs', 'maxAmmo', 'reloadMs']);
    expect(typeof damageMultiplierFor).toBe('function');
    // Both pickable guns carry their own range dials since Story 9.8 (ruling
    // 125) — no longer the radar rung.
    expect('rangeU' in CONFIG.machineGun).toBe(true);
    expect('rangeU' in CONFIG.flak).toBe(true);
    expect('burstRadius' in CONFIG.machineGun).toBe(false); // direct hit, NO burst
  });

  // NO HARDCODED XP TOTAL (Eric ruling 2026-08-16, epic-6 amendment 24: *"XP
  // is calculated from fleet comp. No need to hardcode any amount of xp into
  // the contract."*).
  //
  // Amendment 33's `expect(fleetLevels()).toBe(3)` is RETIRED, and it had gone
  // vacuous on its own terms. It existed because droneMedium paid 1/3 — a
  // NON-DYADIC rational — so a composition edit could quietly start paying
  // float dust. The current tiers are 1/4, 1/2, 3/4: all dyadic, so EVERY
  // integer composition is exactly representable and no total can carry dust.
  //
  // So the invariant moves up a level and is pinned where it can still bite:
  // the TIERS must stay exactly representable. A future tier that is not a
  // power-of-two fraction (1/3, 1/5, 0.1) reintroduces the exact hazard 33 was
  // written against, and THIS test is what fails.
  it('CONFIG.fleet block + the tier-exactness invariant (amendment 24 retires the total pin)', () => {
    for (const tier of Object.values(CONFIG.xp.droneTierLevels)) {
      // Dyadic <=> some power-of-two multiple is a whole number. 2^10 is far
      // past any plausible tier denominator and keeps the check cheap.
      expect(Number.isInteger(tier * 1024)).toBe(true);
    }
    // ...and therefore the derived total is exact, whatever it happens to be.
    expect(Number.isInteger(fleetLevels() * 1024)).toBe(true);
    expect(fleetLevels()).toBeGreaterThan(0);

    // fleetHullIds() is the SPAWN ORDER, generated from the composition and
    // largest-first by contract, so the biggest hull always gets the first
    // (least-constrained) scatter slot.
    const hulls = fleetHullIds();
    const { large, medium, small } = CONFIG.fleet.composition;
    expect(hulls).toEqual([
      ...new Array<string>(large).fill('droneLarge'),
      ...new Array<string>(medium).fill('droneMedium'),
      ...new Array<string>(small).fill('droneSmall'),
    ]);

    expect(Object.keys(CONFIG.fleet).sort()).toEqual([
      'aimScatterU',
      'composition',
      'memoryMs',
      'spawnRetryTicks',
      'spreadU',
      'waves',
    ]);
    // The wave sizes are a RATIO held against a shrinking field, so each later
    // wave lands fewer fleets than the one before it — the ratio itself (today
    // halving) is Eric's dial, not a contract (9.14 gate P2).
    const waves = CONFIG.fleet.waves;
    for (let i = 1; i < waves.length; i += 1) {
      expect(waves[i].atMs, `wave ${i}`).toBeGreaterThan(waves[i - 1].atMs);
      expect(waves[i].fleets, `wave ${i}`).toBeLessThan(waves[i - 1].fleets);
      expect(waves[i].fleets, `wave ${i}`).toBeGreaterThan(0);
    }
  });
});
