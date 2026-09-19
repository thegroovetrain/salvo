// Effective per-ship stats — THE server/client desync firewall. One pure
// function turns (ship class, fitted CARDS) into every derived number the
// simulation and the HUD consume. The server computes it on grant/spawn
// (cached on ShipRecord.stats); the client recomputes it from you.cls +
// you.cards whenever either changes. Both sides MUST call this — nothing may
// re-derive a carded stat ad hoc, or the predictor/HUD silently drift from the
// authoritative sim.
//
// STORY 8.1 RESHAPED THE TREE. The seven hand-named equipment blocks
// (gun/torpedo/mine/boost/broadside/starShells/radarBuoy) became ONE TOTAL
// RECORD `equipment`, keyed by the widened `EquipmentId` (sim/loadout.ts), and
// every row carries `tier` and `reloadMs`. That is what lets catalog v3's
// per-equipment TIER ladders exist at all, and it is what
// `BOON_STAT_PATHS` is now GENERATED from (sim/effects.ts
// EQUIPMENT_STAT_FIELDS) rather than hand-listed. The shipped `torpedo` id is
// `heavyTorpedo` and `mine` is `navalMines`; the numbers did not move.
//
// Bases: the ship class for hull-ish stats (hp, kinematics); CONFIG.vision for
// radar/sweep/sight; the per-equipment CONFIG blocks for everything else
// (gun-family RANGE bases on CONFIG.vision.radar — range = radar range, Eric
// ruling 2026-07-21). The four STILL-UNBUILT v3 equipments take their tier-I
// rows from catalog-v3 §4 (see STUB_ROWS below); their modules land in Story
// 8.14 and promote those numbers into CONFIG blocks of their own, exactly as
// Story 8.13 did for the light torpedo and the captive/fouling mines.
//
// rangeU fields are DERIVED, not independently stat-addressable (brainstorm
// 2026-07-30: Radar Range quietly buffs gun/blast-torp reach too — Intel is a
// stealth offense category). They are re-pinned to the POST-FOLD `radarRange`
// every time, in both applyCardStats (sim/boons.ts — covers a radarRange fold
// mid-list) and clampStats below (the firewall's unconditional output pass) —
// a fold can never leave rangeU stale. THE TWO RE-PIN HOMES ARE FOLD + CLAMP,
// and there are no others.
//
// Defensive clamps + derivations (all inside this firewall, nowhere else):
//   - sweepRpm ≤ CONFIG.vision.sweepRpmMax (the ratified 30-RPM ceiling);
//   - the mine ring derivations (deriveMineRings): a CONTACT mine's trip ring
//     from its folded blastRadius, the CAPTIVE's from its TIER;
//   - gun.barrels clamped to 1..3 integer;
//   - EVERY integer equipment field (tubes/turrets/barrels/pools) FLOORED
//     ONCE here, after a fold that accumulated it as a float — catalog-v3 R17's
//     standing rule (a +0.5 tube step shows nothing until it completes a whole);
//   - THE EQUIPMENT RELOAD STEP, catalog-v3 §3/§4: −5 % per tier, additive
//     five-point steps, composed BEFORE the global Reload ladder.
//
// `cooldownScale` (Eric ruling 2026-08-04, retuned by catalog-v3 R12) is the
// ONE global cooldown lever: a base-1.0 scalar the universal RELOAD ladder
// drives DOWN additively (−0.05/copy, 5 copies -> 0.75), applied post-fold to
// EVERY equipment reloadMs in clampStats. One scalar, one multiply site.

import { CONFIG, type ShipClass } from '../constants.js';
import type { ShipConfig } from './ship.js';
import { applyCardStats } from './boons.js';
import { CATALOG, type Catalog } from './catalog.js';
import { EQUIPMENT_INT_FIELDS } from './effects.js';
import { EQUIPMENT_IDS, type EquipmentId } from './loadout.js';

/** ms per minute — the rpm -> period conversion for effective stats. Render-
 *  side BASE defaults (radar.ts, ambient.ts) derive 60000/CONFIG rpm at their
 *  own edges; only THIS conversion ever sees card-modified rpm. */
const MS_PER_MINUTE = 60000;

/**
 * What EVERY equipment row carries (Story 8.1).
 *
 * `tier` is the 1-based rung the line has reached — for an equipment line it is
 * the COPIES HELD (copy 1 IS the weapon, catalog-v3 §4), for the slotless deck
 * gun it is `1 + copies` because its tier I is already equipped. It is DERIVED
 * from the card counts in the fold, never writable by an effect, and it is what
 * the reload step below reads.
 */
export interface EquipmentRowCommon {
  tier: number; // 1-based ladder rung (1 = the bare weapon / the base fit)
  reloadMs: number; // ms per shot/charge — post-tier-step, post-cooldownScale
  maxAmmo: number; // pool size (charges/rounds ready)
}

/** The universal standard gun's effective numbers. */
export interface EffectiveGun extends EquipmentRowCommon {
  rangeU: number; // u — max shell travel / aimDist clamp — DERIVED = radarRange post-fold (not stat-addressable)
  damage: number; // hp per burst victim
  contactDamage: number; // hp to an early interceptor outside the blast
  burstRadius: number; // u — blast radius around the clicked point
  barrels: number; // shells per click (1..3 — each a real shell, own burst point)
}

/**
 * The BROADSIDE BARRAGE's effective numbers (Story 7-5 wave 2). Every shell of
 * a barrage carries `damage` and `burstRadius`; `turrets` is how many fly.
 */
export interface EffectiveBroadside extends EquipmentRowCommon {
  // u — max shell travel / aimDist clamp. DERIVED post-fold as
  // `radarRange × CONFIG.vision.muzzleFlashFactor` — THE 5/8 RUNG, 412.5u base
  // (Eric: "This weapon's range is limited to 5/8"). Not stat-addressable.
  rangeU: number;
  damage: number; // hp per burst victim, PER SHELL
  burstRadius: number; // u — blast radius around each shell's own point
  turrets: number; // shells per barrage
  // The SPREAD LADDER RUNG: 1 = no spread step taken, 5 = the cap. 1-based so
  // every whitelisted stat stays strictly positive, the law applyStatEffect
  // enforces. Both arc ladders are DERIVED from it.
  spreadRung: number;
  traverseRad: number; // rad — each turret's traverse half-angle (DERIVED from spreadRung)
  mountSpreadRad: number; // rad — outermost mount bearings' half-spread (DERIVED from spreadRung)
}

// DOCTRINE IS A SET OF INDEPENDENT VERBS, NOT ONE ENUM (Story 7-5 wave 1).
// Every verb below is its own boolean, folded by sim/boons.ts — so an add-on
// stacks with another add-on on the same weapon (phosphor AND dazzle) instead
// of the second silently erasing the first.

/**
 * A TORPEDO LINE's effective numbers — the LIGHT and HEAVY fish (the
 * supercavitating one left for the consumable id space, epic-8 amendment 74,
 * and carries no row at all).
 *
 * `homingTurnRate` REPLACED the `homing` boolean on 2026-09-19 (Eric ruling,
 * amendment 80): ACOUSTIC HOMING is deleted and homing is a TIER STAT — 0
 * rad/s at tier I, +0.125 per tier, 0.5 at tier V. ZERO IS THE STRAIGHT-RUNNER
 * (no steering, no `torpU` update, no die-distance); anything above zero
 * steers under `CONFIG.torpedo`'s shared acquire/die/update rules.
 */
export interface EffectiveTorpedo extends EquipmentRowCommon {
  speed: number; // u/s — launch speed
  damage: number; // hp per contact hit
  homingTurnRate: number; // rad/s — 0 = a straight-runner (the tier-I base)
}

/**
 * A MINE LINE's effective numbers, shared by the THREE mine kinds — naval,
 * captive and fouling.
 *
 * THE KIND IS THE ROW IDENTITY (epic-8 amendments 76/81), never a flag: the
 * `captive` and `propFouling` booleans are DELETED, because `captiveMines` and
 * `foulingMines` are their own lines and every reader keys off which row (and,
 * on the water, which `MineKind`) it is holding.
 *
 * TWO FIELDS ARE KIND-SPECIFIC, and the rows that do not own one carry the
 * INERT IDENTITY rather than a lie (the `EffectiveRadarBuoy` precedent: a row
 * is TOTAL over the type and says so):
 *   - `homingTurnRate` is the CAPTIVE fish's (amendment 82: 0 → 0.3 rad/s
 *     across the five rungs); naval and fouling launch nothing and sit at 0,
 *     which is exactly "does not steer";
 *   - `slowFactor` is the FOULING mine's (amendment 81: 0.75 → 0.55); naval
 *     and captive sit at 1, which is exactly "does not slow". ONE, NOT ZERO —
 *     a stray read of zero would stop a hull dead, and every whitelisted stat
 *     is a strictly positive scalar by law (sim/boons.ts applyStatEffect).
 */
export interface EffectiveMine extends EquipmentRowCommon {
  // `maxLive` is DELETED (Story 8.4, FR57/AR48): mines have no per-player live
  // board cap and no room ceiling, so there is no such stat to derive.
  damage: number; // hp per blast victim
  blastRadius: number; // u — full damage to every non-owner hull within it
  triggerRadius: number; // u — detonation proximity (DERIVED — see deriveMineRings)
  homingTurnRate: number; // rad/s — the CAPTIVE fish's steering; 0 elsewhere
  slowFactor: number; // × both speed caps on a FOULING victim; 1 elsewhere
}

/** The HORIZONTAL MISSILE (catalog-v3 R29) — Story 8.14 builds the module. */
export interface EffectiveMissile extends EquipmentRowCommon {
  damage: number; // hp on burst at the clicked point
  homing: boolean; // HEAT SEEKING verb (R32) — false unless held
}

/** MACHINE GUN / FLAK GUN / MONITOR GUN (catalog-v3 R20–R30) — the three
 *  unbuilt gun-family weapons. Story 8.14 builds their modules and widens
 *  these rows; today they carry only the fields the sheet states. */
export interface EffectiveOrdnanceGun extends EquipmentRowCommon {
  damage: number; // hp per hit/burst victim
}

export interface EffectiveStarShells extends EquipmentRowCommon {
  rangeU: number; // u — max flare travel — DERIVED = radarRange post-fold
  litRadius: number; // u — lit-zone radius
  litDurationMs: number; // ms — lit-zone lifetime
  phosphor: boolean; // PHOSPHOR SHELLS verb — false unless held
  dazzle: boolean; // DAZZLE SHELLS verb — false unless held; STACKS with phosphor
}

/**
 * THE SHIFT BOOST's effective numbers (Story 8.9) — the pool, the reload and
 * the active window, and NOTHING about the speed. There is no speed field
 * because the bonus is PROPORTIONAL and no card can address it: it is
 * `CONFIG.boost.factor × kinematics.maxSpeed`, layered per tick by
 * sim/boost.ts `boostedKinematics` and NEVER folded into `kinematics` — the
 * bots' `max(rated, actual)` deadband reads `kinematics.maxSpeed` as the RATED
 * cap (epic-8 amendment 55). `reloadMs` sits in the row so the ONE
 * `cooldownScale` multiply in clampStats reaches it (catalog-v3 R40).
 */
export interface EffectiveBoost extends EquipmentRowCommon {
  durationMs: number; // ms — active window per activation
}

/**
 * The RADAR BUOY's effective numbers. LEGACY (catalog-v3 R1 deletes the buoy;
 * Story 8.15 removes the module and the DECOY BUOY consumable takes the role),
 * so no v3 card addresses it and both verbs below are permanently false until
 * then.
 */
export interface EffectiveRadarBuoy extends EquipmentRowCommon {
  durationMs: number; // ms — buoy lifetime before natural expiry
  radarRange: number; // u — the buoy's own radar reach (flat, not observer-scaled)
  sweepRpm: number; // rev/min — the buoy's own sweep
  hp: number; // hp — destructible
  gunDamage: number; // hp per shot — GUN BUOY verb only
  gunReloadMs: number; // ms — cooldown between its shots — GUN BUOY verb only
  gun: boolean; // GUN BUOY verb — no v3 card grants it
  jamming: boolean; // JAMMING BUOY verb — no v3 card grants it
}

/** Any one equipment row. */
export type EquipmentStatRow =
  | EffectiveGun
  | EffectiveBoost
  | EffectiveTorpedo
  | EffectiveMine
  | EffectiveMissile
  | EffectiveOrdnanceGun
  | EffectiveBroadside
  | EffectiveStarShells
  | EffectiveRadarBuoy;

/**
 * THE TOTAL equipment record (Story 8.1) — one row per `EquipmentId`, present
 * whether or not the hull carries that equipment. Totality is what makes
 * `equipmentMaxAmmo`/`equipmentReloadMs` plain lookups and what lets
 * BOON_STAT_PATHS be generated. Extending `Record<EquipmentId, …>` is the
 * compile-time forcing function: a new EquipmentId cannot land without a row.
 */
export interface EquipmentRows extends Record<EquipmentId, EquipmentStatRow> {
  gun: EffectiveGun;
  boost: EffectiveBoost;
  lightTorpedo: EffectiveTorpedo;
  heavyTorpedo: EffectiveTorpedo;
  navalMines: EffectiveMine;
  captiveMines: EffectiveMine;
  foulingMines: EffectiveMine;
  missile: EffectiveMissile;
  machineGun: EffectiveOrdnanceGun;
  flak: EffectiveOrdnanceGun;
  monitor: EffectiveOrdnanceGun;
  broadside: EffectiveBroadside;
  starShells: EffectiveStarShells;
  radarBuoy: EffectiveRadarBuoy;
}

/** Everything (class, cards) resolves to. See effectiveStats(). */
export interface EffectiveStats {
  kinematics: ShipConfig;
  maxHp: number;
  radarRange: number; // u
  sweepRpm: number; // rev/min — THE tracked radar rotation rate (capped at sweepRpmMax)
  sweepPeriodMs: number; // ms per radar revolution — DERIVED: 60000 / sweepRpm
  sightRange: number; // u — true-sight bubble — DERIVED: radarRange / 2
  // Global cooldown multiplier applied to EVERY equipment reloadMs post-fold
  // (clampStats). Base 1.0 = a true no-op; the RELOAD ladder drives it down
  // additively (−0.05/copy) to exactly 0.75 at the 5-copy cap.
  cooldownScale: number;
  equipment: EquipmentRows;
}

/**
 * TIER-I BASE ROWS FOR THE FOUR REMAINING UNBUILT EQUIPMENTS, transcribed from
 * catalog-v3 §4 — nothing here is invented, and every `[D]` cell is Eric's
 * own [DRAFT] tag carried through verbatim. These are NOT CONFIG blocks yet:
 * no module reads them, so promoting them would put blocks of harness-untuned
 * draft numbers into the gameplay source of truth. Each of Stories 8.13–8.16
 * promotes its own lines' rows into real CONFIG blocks when the weapon lands.
 *
 * STORY 8.13 EMPTIED THREE OF THE SEVEN. `lightTorpedo` and `captiveMines`
 * have CONFIG blocks of their own now (`CONFIG.lightTorpedo`,
 * `CONFIG.captiveMines`), and `supercavTorpedo` has no row at all — it became
 * a CONSUMABLE (epic-8 amendment 74), and consumables carry no stat row. The
 * four left are Story 8.14's.
 */
const STUB_ROWS = {
  // HORIZONTAL MISSILE (R29): bow ±50°, 250 u/s, 40 dmg, 1 missile, 30 s.
  missile: { reloadMs: 30000, maxAmmo: 1, damage: 40 },
  // MACHINE GUN (R20/R21): 4 dmg/shell, 15 s reload, one pool of fire. Every
  // number but the arc is `[D]`.
  machineGun: { reloadMs: 15000, maxAmmo: 1, damage: 4 },
  // FLAK GUN (R27): air-burst at the click, 10 dmg in r40u, 1 shell, 8 s. All
  // base numbers `[D]`.
  flak: { reloadMs: 8000, maxAmmo: 1, damage: 10 },
  // MONITOR GUN (R30): bow ±10°, arcing, 75 dmg, NO burst, 1 shell, 50 s.
  monitor: { reloadMs: 50000, maxAmmo: 1, damage: 75 },
  // THE SHIFT BOOST IS NOT A STUB (Story 8.9): it is live equipment in slot 1
  // on every captain hull and its row is built from `CONFIG.boost` in
  // baseEquipment, like the gun. Nothing is authored here.
} as const;

/** deg -> rad (CONFIG.broadside's two ladders are authored in degrees).
 *  SAME ASSOCIATION as sim/arcs.ts's `deg` — `(d * PI) / 180`, never
 *  `d * (PI / 180)`: the two round differently in the last bit, and both sides
 *  must land on the identical double. */
const deg = (d: number): number => (d * Math.PI) / 180;

/**
 * THE PAIRED-LADDER CONTRACT, CHECKED AT LOAD. `traverseDeg` and
 * `turretMountSpreadDeg` are indexed by the SAME rung, so `clampSpreadRung` may
 * clamp against either only while they are the same length. A test pins it
 * (barrel.test.ts, aim.test.ts), but a CONFIG edit that desynced them would let
 * a valid rung index one ladder into `undefined` and `deg()` it into NaN — a
 * silent NaN arc rather than a failure. Same fail-at-load law as sim/arcs.ts's
 * `sectorArcFor`: an authoring error throws where it is authored.
 */
if (CONFIG.broadside.turretMountSpreadDeg.length !== CONFIG.broadside.traverseDeg.length) {
  throw new Error(
    `broadside ladder mismatch: turretMountSpreadDeg has ${CONFIG.broadside.turretMountSpreadDeg.length} rungs, `
    + `traverseDeg has ${CONFIG.broadside.traverseDeg.length} (sim/stats.ts — the two are index-paired)`,
  );
}

/**
 * The BROADSIDE SPREAD rung, clamped to the authored ladder: 1 (base) ..
 * traverseDeg.length. Integer — a fractional value can only come from
 * malformed effect data.
 *
 * NON-FINITE CLAMPS TO 1. `Math.round(NaN)` is NaN and every comparison against
 * it is false, so `min/max` would pass NaN straight through and index the
 * ladders into `undefined` → a NaN traverse/mount spread on a live ship.
 *
 * ONE LENGTH FOR BOTH LADDERS: asserted at module load above.
 */
export function clampSpreadRung(rung: number): number {
  if (!Number.isFinite(rung)) return 1;
  const top = CONFIG.broadside.traverseDeg.length;
  return Math.min(top, Math.max(1, Math.round(rung)));
}

/**
 * rad — each broadside turret's TRAVERSE half-angle at a given SPREAD rung
 * (1-based). THE single derivation of the authored ladder; both re-pin sites
 * call it, and no consumer indexes CONFIG.broadside.traverseDeg directly.
 */
export function broadsideTraverse(rung: number): number {
  return deg(CONFIG.broadside.traverseDeg[clampSpreadRung(rung) - 1]);
}

/**
 * rad — the outermost MOUNT BEARINGS' half-spread about the firing beam at a
 * given SPREAD rung (1-based). The exact sibling of `broadsideTraverse`, on the
 * same rung, through the same `deg` association.
 */
export function broadsideMountSpread(rung: number): number {
  return deg(CONFIG.broadside.turretMountSpreadDeg[clampSpreadRung(rung) - 1]);
}

/**
 * u — the TRIP RING of a CONTACT mine (naval or fouling) for a folded blast
 * radius: a fixed fraction of the blast (Eric ruling 2026-08-16), so a
 * blast-widening card carries the trip ring out with it. ONE fraction for both
 * kinds — `CONFIG.mine.triggerFactor` — so the two can never drift apart.
 *
 * Pure, linear and IDEMPOTENT in `blastRadius`, which is what makes mine-line
 * card ORDER irrelevant and what lets both re-pin homes call it. The captive
 * mine does NOT come through here: its trip ring is derived from its TIER
 * (`captiveTriggerRadius` below, epic-8 amendment 84d).
 */
export function mineTriggerRadius(blastRadius: number): number {
  return blastRadius * CONFIG.mine.triggerFactor;
}

/**
 * u — the CAPTIVE mine's TRIP RING at a 1-based tier: 144 u at tier I, stepping
 * ×1.1 per rung to 210.8 u at tier V (catalog-v3 R25 as amended by epic-8
 * amendment 84d). It reads the TIER, not the blast radius, for two reasons:
 * trigger radii are deliberately off the stat whitelist, and the captive's
 * 32 u burst is FIXED — the line's tiers grow the reach of the trap, never the
 * size of the bang.
 *
 * A non-finite or sub-1 tier clamps to the tier-I ring rather than producing a
 * NaN trip ring on a live mine (the `clampSpreadRung` law).
 */
export function captiveTriggerRadius(tier: number): number {
  const steps = Number.isFinite(tier) ? Math.max(0, tier - 1) : 0;
  return CONFIG.captiveMines.triggerRadius * CONFIG.captiveMines.triggerStepPerTier ** steps;
}

/** A torpedo row at CONFIG base. `homingTurnRate` starts at ZERO on EVERY
 *  line — a tier-I fish is a straight-runner, and the lines' tiers II–V buy
 *  the steering (epic-8 amendment 80). */
function torpedoRow(src: { reloadMs: number; maxAmmo: number; speed: number; damage: number }): EffectiveTorpedo {
  return {
    tier: 1,
    reloadMs: src.reloadMs,
    maxAmmo: src.maxAmmo,
    speed: src.speed,
    damage: src.damage,
    homingTurnRate: 0,
  };
}

/** One of the three MINE rows at CONFIG base. The kind-specific fields default
 *  to their INERT identities and the owning row overrides its own (see
 *  `EffectiveMine`): homing 0 = does not steer, slow 1 = does not slow. */
function mineRow(src: {
  reloadMs: number;
  maxAmmo: number;
  damage: number;
  blastRadius: number;
  triggerRadius: number;
  slowFactor?: number;
}): EffectiveMine {
  return {
    tier: 1,
    reloadMs: src.reloadMs,
    maxAmmo: src.maxAmmo,
    damage: src.damage,
    blastRadius: src.blastRadius,
    triggerRadius: src.triggerRadius,
    homingTurnRate: 0,
    slowFactor: src.slowFactor ?? 1,
  };
}

/** One of the three unbuilt gun-family rows (machineGun / flak / monitor). */
function ordnanceGunRow(src: { reloadMs: number; maxAmmo: number; damage: number }): EffectiveOrdnanceGun {
  return { tier: 1, reloadMs: src.reloadMs, maxAmmo: src.maxAmmo, damage: src.damage };
}

/** THE SHIFT BOOST's row (Story 8.9) — pool, reload and window straight out of
 *  `CONFIG.boost`. `factor` is deliberately absent: the bonus is proportional
 *  and no card addresses it, so it is read from CONFIG at the one hook
 *  (sim/boost.ts) rather than carried here (epic-8 amendment 55). */
function boostRow(src: { reloadMs: number; maxAmmo: number; durationMs: number }): EffectiveBoost {
  return {
    tier: 1,
    reloadMs: src.reloadMs,
    maxAmmo: src.maxAmmo,
    durationMs: src.durationMs,
  };
}

/** The gun row — the ONE row a ship class may override (PvE fleet envelopes
 *  carry their own weaker gun: Story 5.6, epic-5 amendments 34/45). */
function gunRow(cls: ShipClass): EffectiveGun {
  return {
    tier: 1, // tier I is EQUIPPED at zero cards — the deck gun is slotless
    reloadMs: cls.gun?.reloadMs ?? CONFIG.gun.reloadMs,
    maxAmmo: CONFIG.gun.maxAmmo,
    // Gun range IS radar range (Eric ruling 2026-07-21) — derived, never
    // duplicated; re-pinned post-fold regardless of this seed.
    rangeU: CONFIG.vision.radar,
    damage: cls.gun?.damage ?? CONFIG.gun.damage,
    contactDamage: CONFIG.gun.contactDamage,
    burstRadius: CONFIG.gun.burstRadius,
    barrels: 1, // base single mount — the DECK GUN BARREL ladder adds
  };
}

/** The broadside + star-shell + radar-buoy rows — pure CONFIG pass-throughs,
 *  split out so baseEquipment stays lean. */
function shippedSkillshotRows(): Pick<EquipmentRows, 'broadside' | 'starShells' | 'radarBuoy'> {
  return {
    broadside: {
      tier: 1,
      reloadMs: CONFIG.broadside.reloadMs,
      maxAmmo: CONFIG.broadside.maxAmmo,
      // rangeU base — re-derived from radarRange × muzzleFlashFactor post-fold.
      rangeU: CONFIG.vision.radar * CONFIG.vision.muzzleFlashFactor,
      damage: CONFIG.broadside.damage,
      burstRadius: CONFIG.broadside.burstRadius,
      turrets: CONFIG.broadside.turrets,
      spreadRung: 1,
      traverseRad: broadsideTraverse(1),
      mountSpreadRad: broadsideMountSpread(1),
    },
    starShells: {
      tier: 1,
      reloadMs: CONFIG.starShells.reloadMs,
      maxAmmo: CONFIG.starShells.maxAmmo,
      rangeU: CONFIG.vision.radar, // re-derived post-fold
      litRadius: CONFIG.starShells.litRadius,
      litDurationMs: CONFIG.starShells.litDurationMs,
      phosphor: false,
      dazzle: false,
    },
    radarBuoy: {
      tier: 1,
      reloadMs: CONFIG.radarBuoy.reloadMs,
      maxAmmo: CONFIG.radarBuoy.maxAmmo,
      durationMs: CONFIG.radarBuoy.durationMs,
      radarRange: CONFIG.radarBuoy.radarRange,
      sweepRpm: CONFIG.radarBuoy.sweepRpm,
      hp: CONFIG.radarBuoy.hp,
      gunDamage: CONFIG.radarBuoy.gunDamage,
      gunReloadMs: CONFIG.radarBuoy.gunReloadMs,
      gun: false,
      jamming: false,
    },
  };
}

/** THE total equipment record at base. Every id present, every tier 1. */
function baseEquipment(cls: ShipClass): EquipmentRows {
  return {
    gun: gunRow(cls),
    // THE SHIFT BOOST (Story 8.9): live equipment, `CONFIG.boost` verbatim —
    // the reload then takes `cooldownScale` in clampStats like every row.
    boost: boostRow(CONFIG.boost),
    // LIGHT TORPEDO (catalog-v3 R18) — its own CONFIG block since Story 8.13.
    lightTorpedo: torpedoRow(CONFIG.lightTorpedo),
    // THE LEGACY RENAME: `heavyTorpedo` IS the shipped torpedo, CONFIG.torpedo
    // verbatim — including catalog-v3 R17's 65 u/s tier-I speed, which Story
    // 8.1 landed in CONFIG itself (epic-8 amendment 6).
    heavyTorpedo: torpedoRow(CONFIG.torpedo),
    // ...and `navalMines` IS the shipped mine, CONFIG.mine verbatim. It NO
    // LONGER FOULS (amendment 81), so its `slowFactor` is the inert 1.
    navalMines: mineRow({
      reloadMs: CONFIG.mine.reloadMs,
      maxAmmo: CONFIG.mine.maxAmmo,
      damage: CONFIG.mine.damage,
      blastRadius: CONFIG.mine.blastRadius,
      triggerRadius: CONFIG.mine.triggerRadius,
    }),
    // CAPTIVE MINES (R25) — its OWN ring pair: the 144 u TRIP ring is the big
    // one and the fish's 32 u burst is the small one (amendment 84d).
    captiveMines: mineRow({
      reloadMs: CONFIG.captiveMines.reloadMs,
      maxAmmo: CONFIG.captiveMines.maxAmmo,
      damage: CONFIG.captiveMines.damage,
      blastRadius: CONFIG.captiveMines.blastRadius,
      triggerRadius: CONFIG.captiveMines.triggerRadius,
    }),
    // FOULING MINES (amendment 81) — the naval chassis with a bigger, weaker
    // blast and the victim slow the naval mine gave up.
    foulingMines: mineRow({
      reloadMs: CONFIG.foulingMines.reloadMs,
      maxAmmo: CONFIG.foulingMines.maxAmmo,
      damage: CONFIG.foulingMines.damage,
      blastRadius: CONFIG.foulingMines.blastRadius,
      triggerRadius: mineTriggerRadius(CONFIG.foulingMines.blastRadius),
      slowFactor: CONFIG.foulingMines.slowFactor,
    }),
    missile: { tier: 1, ...STUB_ROWS.missile, homing: false },
    machineGun: ordnanceGunRow(STUB_ROWS.machineGun),
    flak: ordnanceGunRow(STUB_ROWS.flak),
    monitor: ordnanceGunRow(STUB_ROWS.monitor),
    ...shippedSkillshotRows(),
  };
}

/** The CONFIG-base stats tree for a class — every number a pure base, every
 *  doctrine verb false. Split out so effectiveStats stays lean. */
function baseStats(cls: ShipClass): EffectiveStats {
  return {
    kinematics: { ...cls.kinematics },
    maxHp: cls.hp,
    radarRange: CONFIG.vision.radar,
    sweepRpm: Math.min(CONFIG.vision.sweepRpm, CONFIG.vision.sweepRpmMax),
    sweepPeriodMs: MS_PER_MINUTE / Math.min(CONFIG.vision.sweepRpm, CONFIG.vision.sweepRpmMax),
    sightRange: CONFIG.vision.sight,
    cooldownScale: 1, // base: the global cooldown scale is a no-op until RELOAD stacks
    equipment: baseEquipment(cls),
  };
}

/** Round to 3 decimals — far finer than any authored step, and enough to kill
 *  the additive float dust a −0.05 ladder accumulates (five steps land on
 *  0.7500000000000001 without it). */
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * THE EQUIPMENT RELOAD STEP (catalog-v3 §3 standing rule, §4 conventions):
 * **−5 % of base reload per tier, in ADDITIVE five-point steps** —
 * 100 → 95 → 90 → 85 → 80 % — composed BEFORE the global RELOAD ladder, so a
 * maxed weapon under a maxed Reload runs at 0.80 × 0.75 = 60 % of base.
 *
 * THE READING PINNED HERE, and it is ONE formula for every equipment including
 * the deck gun. §3's standing rule writes `1 − 0.05 × equipmentTier` where its
 * `equipmentTier` counts UPGRADE STEPS TAKEN, not the 1-based rung: §4's deck
 * gun row states "at cap (4 copies): 80 %", and its equipment rows state
 * "tier I = the bare weapon at 100 %, tier V = 80 %". Both are
 * `1 − 0.05 × (tier − 1)` on our 1-based `tier`, because `equipment.gun.tier`
 * is `1 + deckGun copies` (tier I equipped at zero cards) while an equipment
 * line's tier is its copies held (copy 1 IS tier I). So the deck gun reads
 * ×1.00 at zero copies and ×0.80 at four, and a weapon reads ×1.00 at copy 1
 * and ×0.80 at copy 5 — no special case, no off-by-one.
 */
function reloadTierScale(tier: number): number {
  const steps = Math.max(0, tier - 1);
  // FLOORED AT 0.1, exactly like cooldownScale below. By CONSTRUCTION the
  // deepest reachable tier is V (x0.80) — but this multiplier is applied to
  // EVERY equipment row unconditionally, and an injected or future line with
  // a cap past 20 would drive it to zero (unlimited fire — and
  // rescaleReloadTimers multiplying an in-flight timer by 0) and then
  // negative (a reload that never completes). Defence against malformed data,
  // not a reachable configuration.
  return Math.max(0.1, round3(1 - CONFIG.catalog.reloadStepPerTier * steps));
}

/** Floor every INTEGER equipment field once, after a fold that accumulated it
 *  as a float (catalog-v3 R17's standing rule). Non-finite values are left
 *  alone — applyStatEffect already refuses to write one. */
function floorIntegerFields(rows: EquipmentRows): void {
  for (const id of EQUIPMENT_IDS) {
    const row = rows[id] as unknown as Record<string, number>;
    for (const field of EQUIPMENT_INT_FIELDS) {
      const v = row[field];
      if (typeof v === 'number' && Number.isFinite(v)) row[field] = Math.floor(v);
    }
  }
}

/**
 * THE MINE RING DERIVATIONS, for all THREE mine rows — the one home for "what
 * radii does this kind actually have".
 *
 * A CONTACT mine (naval, fouling) trips at a fixed fraction of its own folded
 * blast, so a blast card carries the trip ring out with it. The CAPTIVE mine
 * does neither: its trip ring steps off its TIER and its burst is pinned at
 * `CONFIG.captiveMines.blastRadius` (epic-8 amendment 84d).
 *
 * IT IS NOW FULLY IDEMPOTENT, which is why it may run in BOTH re-pin homes
 * (this is called from `clampStats` and from sim/boons.ts `rePinDerived`).
 * The old captive "swap and triple" CONSUMED the blast radius it overwrote and
 * so had to live in clampStats alone; nothing here reads a value it writes.
 */
export function deriveMineRings(eq: EquipmentRows): void {
  eq.navalMines.triggerRadius = mineTriggerRadius(eq.navalMines.blastRadius);
  eq.foulingMines.triggerRadius = mineTriggerRadius(eq.foulingMines.blastRadius);
  // The captive's burst NEVER steps — re-pinned from CONFIG so no injected or
  // future line can grow it by the back door.
  eq.captiveMines.blastRadius = CONFIG.captiveMines.blastRadius;
  eq.captiveMines.triggerRadius = captiveTriggerRadius(eq.captiveMines.tier);
}

/** The post-fold defensive clamps + derivations (see the header). Mutates in
 *  place. */
function clampStats(stats: EffectiveStats): void {
  const eq = stats.equipment;
  // Sweep ceiling: the fold already clamps, but the firewall's OUTPUT is the
  // contract — clamp unconditionally.
  stats.sweepRpm = Math.min(stats.sweepRpm, CONFIG.vision.sweepRpmMax);
  stats.sweepPeriodMs = MS_PER_MINUTE / stats.sweepRpm;
  // Gun/star-shell range IS radarRange, always; the broadside rides the same
  // number one rung short (the 5/8 muzzle rung, Eric: "limited to 5/8").
  eq.gun.rangeU = stats.radarRange;
  eq.starShells.rangeU = stats.radarRange;
  eq.broadside.rangeU = stats.radarRange * CONFIG.vision.muzzleFlashFactor;
  // The spread ladder is a TABLE, not a step, so the card writes a 1-based RUNG
  // and BOTH halves of the arc geometry are derived from it.
  eq.broadside.spreadRung = clampSpreadRung(eq.broadside.spreadRung);
  eq.broadside.traverseRad = broadsideTraverse(eq.broadside.spreadRung);
  eq.broadside.mountSpreadRad = broadsideMountSpread(eq.broadside.spreadRung);
  // TRUESIGHT IS THE 4/8 RUNG OF INTEL RANGE (Eric ruling 2026-08-16) — derived,
  // never stat-addressable. At zero cards it is byte-identical to the old
  // CONFIG.vision.sight seed, because CONFIG.vision.radar IS SIGHT*2.
  stats.sightRange = stats.radarRange / 2;
  deriveMineRings(eq);
  floorIntegerFields(eq);
  eq.gun.barrels = Math.min(3, Math.max(1, eq.gun.barrels));
  // THE global cooldown scale, applied ONCE, post-fold, to every equipment.
  // Additive folding accumulates float dust, and because ammo.ts ticks reloads
  // down in 50ms steps and only refills at <= 0, un-rounded dust silently costs
  // a whole extra 50ms tick on every affected weapon. Round to 3 decimals so
  // every reachable stack lands on the exact ruled number (five RELOAD copies
  // land on 0.75 exactly), THEN floor so hostile or over-stacked data can never
  // reach zero/negative cadence. By CONSTRUCTION the reachable floor is 0.75 —
  // the ladder caps at 5 copies — and the 0.1 guard below is defence against
  // malformed data, not a reachable configuration.
  const cd = Math.max(0.1, round3(stats.cooldownScale));
  stats.cooldownScale = cd;
  // THE EQUIPMENT RELOAD STEP then the global scale, in that order, for EVERY
  // row — one site, no per-weapon special case (see reloadTierScale).
  for (const id of EQUIPMENT_IDS) {
    const row = eq[id];
    row.reloadMs = row.reloadMs * reloadTierScale(row.tier) * cd;
  }
}

/**
 * Resolve the effective stats for a ship class + fitted CARD IDS. Zero cards ≙
 * the class/CONFIG bases exactly. Pure and allocation-fresh (callers cache the
 * result and swap it on change).
 *
 * `cards` is the raw id list off the wire. It is resolved through `catalog`
 * INTERNALLY (sim/boons.ts applyCardStats), which counts copies per line and
 * folds the lines in CATALOG order — never card-list order. That is what makes
 * this function byte-identical under any permutation of the same multiset, and
 * it is why there is no exported "resolve then fold" two-step to get wrong.
 * Unknown ids fail closed (ignored). `catalog` is the test seam.
 */
export function effectiveStats(
  cls: ShipClass,
  cards: readonly string[] = [],
  catalog: Catalog = CATALOG,
): EffectiveStats {
  const stats = baseStats(cls);
  if (cards.length > 0) applyCardStats(stats, cards, catalog);
  clampStats(stats);
  return stats;
}

// The per-equipment pool/reload lookups (equipmentMaxAmmo / equipmentReloadMs)
// live in sim/loadout.ts beside EquipmentId.
