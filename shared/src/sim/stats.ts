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
// ruling 2026-07-21). The seven UNBUILT v3 equipments take their tier-I rows
// from catalog-v3 §4 (see STUB_ROWS below); their modules land in Stories
// 8.13–8.16 and promote those numbers into CONFIG blocks of their own.
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
//   - mine trip ring / blast radius derived from the folded blastRadius and
//     the CAPTIVE flag;
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

export interface EffectiveTorpedo extends EquipmentRowCommon {
  speed: number; // u/s — launch speed
  damage: number; // hp per contact hit
  homing: boolean; // ACOUSTIC HOMING verb — false unless the add-on is held
}

export interface EffectiveMine extends EquipmentRowCommon {
  maxLive: number; // max simultaneous live mines on the board
  damage: number; // hp per blast victim
  blastRadius: number; // u — full damage to every non-owner hull within it
  triggerRadius: number; // u — detonation proximity (DERIVED from blastRadius)
  propFouling: boolean; // FOULING MINES verb — false unless held
  /**
   * THE CAPTIVE CHASSIS. Catalog v3 (R25) made CAPTIVE MINES its OWN equipment
   * line rather than a doctrine on the naval mine, so this is no longer a card
   * verb: it is a property of the `captiveMines` row, true at base and false on
   * `navalMines`. It still drives the same derivation in clampStats — the two
   * radii swap and the trip ring triples (144u trip / 32u blast at base) — so
   * the plumbing did not move, only what sets it.
   */
  captive: boolean;
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
 * The activated speed boost's effective numbers. The additive `speedBonus` is
 * layered per-tick via sim/boost.ts boostedKinematics — never folded into
 * kinematics here. Two ids share this row type: the LEGACY `speedBoost`
 * equipment (shipped numbers) and the v3 `boost` placeholder (Story 8.9).
 */
export interface EffectiveBoost extends EquipmentRowCommon {
  speedBonus: number; // u/s added to the forward maxSpeed cap while active
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
  supercavTorpedo: EffectiveTorpedo;
  navalMines: EffectiveMine;
  captiveMines: EffectiveMine;
  missile: EffectiveMissile;
  machineGun: EffectiveOrdnanceGun;
  flak: EffectiveOrdnanceGun;
  monitor: EffectiveOrdnanceGun;
  broadside: EffectiveBroadside;
  starShells: EffectiveStarShells;
  speedBoost: EffectiveBoost;
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
 * TIER-I BASE ROWS FOR THE SEVEN UNBUILT EQUIPMENTS, transcribed from
 * catalog-v3 §4 — nothing here is invented, and every `[D]` cell is Eric's
 * own [DRAFT] tag carried through verbatim. These are NOT CONFIG blocks yet:
 * no module reads them, so promoting them would put seven blocks of
 * harness-untuned draft numbers into the gameplay source of truth. Stories
 * 8.13–8.16 each promote their own line's row into a real CONFIG block when
 * the weapon lands.
 */
const STUB_ROWS = {
  // LIGHT TORPEDO (R18): twin sector both beams ±45° about 90°, 45 u/s,
  // 40 dmg, 1 tube, 25 s.
  lightTorpedo: { reloadMs: 25000, maxAmmo: 1, speed: 45, damage: 40 },
  // SUPERCAVITATING TORPEDO (R19): bow ±15°, 195 u/s, 50 dmg, 1 fish, 45 s.
  supercavTorpedo: { reloadMs: 45000, maxAmmo: 1, speed: 195, damage: 50 },
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
  // CAPTIVE MINES (R25): the mine chassis on a longer clock — one un-upgraded
  // fish at mine damage (55) and mine blast radius; pool 1, 20 s, both `[D]`.
  // The 144u trip / 32u blast pair is DERIVED by the `captive` flag in
  // clampStats out of the SAME CONFIG.mine.blastRadius, so it is not restated
  // here.
  captiveMines: { reloadMs: 20000, maxAmmo: 1 },
  // SHIFT BOOST (R9/R40): 10 s active, 20 s reload, both `[D]`. Its speed
  // bonus is "+25 % of the hull's max speed" — a PROPORTIONAL model this flat
  // u/s field cannot express — so `speedBonus` stays 0 and Story 8.9 authors
  // it. Nothing fits `boost` today (it is not slot equipment), so the zero row
  // is unreachable rather than wrong. Its reload IS scaled by the global
  // RELOAD ladder (R40 puts the Shift cooldown in scope): 20 s → 15 s at the
  // cap, exactly as §4 states.
  boost: { reloadMs: 20000, maxAmmo: 0, durationMs: 10000, speedBonus: 0 },
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
 * u — a mine's TRIP RING for a folded blast radius, under the CAPTIVE chassis.
 * An ordinary mine trips at a fixed fraction of its blast; a CAPTIVE mine swaps
 * the two rings and triples the trip (catalog-v3 R25), so its trigger is the
 * folded blast × `captiveTriggerFactor`. Pure and linear in `blastRadius`,
 * which is what makes mine-line card ORDER irrelevant. Shared by clampStats and
 * sim/boons.ts — the only two sites.
 */
export function mineTriggerRadius(blastRadius: number, captive: boolean): number {
  return blastRadius * (captive ? CONFIG.mine.captiveTriggerFactor : CONFIG.mine.triggerFactor);
}

/** A torpedo row at CONFIG-or-stub base (three ids share the shape). */
function torpedoRow(src: { reloadMs: number; maxAmmo: number; speed: number; damage: number }): EffectiveTorpedo {
  return { tier: 1, reloadMs: src.reloadMs, maxAmmo: src.maxAmmo, speed: src.speed, damage: src.damage, homing: false };
}

/** A mine row on the shipped chassis. `captive` is the chassis flag, not a
 *  card verb (catalog-v3 R25). */
function mineRow(reloadMs: number, maxAmmo: number, captive: boolean): EffectiveMine {
  return {
    tier: 1,
    reloadMs,
    maxAmmo,
    maxLive: CONFIG.mine.maxLive,
    damage: CONFIG.mine.damage,
    blastRadius: CONFIG.mine.blastRadius,
    triggerRadius: CONFIG.mine.triggerRadius,
    propFouling: false,
    captive,
  };
}

/** One of the three unbuilt gun-family rows (machineGun / flak / monitor). */
function ordnanceGunRow(src: { reloadMs: number; maxAmmo: number; damage: number }): EffectiveOrdnanceGun {
  return { tier: 1, reloadMs: src.reloadMs, maxAmmo: src.maxAmmo, damage: src.damage };
}

/** A speed-boost row (the legacy `speedBoost` equipment and the v3 `boost`
 *  placeholder share the shape). */
function boostRow(src: { reloadMs: number; maxAmmo: number; durationMs: number; speedBonus: number }): EffectiveBoost {
  return {
    tier: 1,
    reloadMs: src.reloadMs,
    maxAmmo: src.maxAmmo,
    durationMs: src.durationMs,
    speedBonus: src.speedBonus,
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
    boost: boostRow(STUB_ROWS.boost),
    lightTorpedo: torpedoRow(STUB_ROWS.lightTorpedo),
    // THE LEGACY RENAME: `heavyTorpedo` IS the shipped torpedo, CONFIG.torpedo
    // verbatim — including catalog-v3 R17's 65 u/s tier-I speed, which Story
    // 8.1 landed in CONFIG itself (epic-8 amendment 6). The line's tiers II-V
    // are still Story 8.13's to author.
    heavyTorpedo: torpedoRow(CONFIG.torpedo),
    supercavTorpedo: torpedoRow(STUB_ROWS.supercavTorpedo),
    // ...and `navalMines` IS the shipped mine, CONFIG.mine verbatim.
    navalMines: mineRow(CONFIG.mine.reloadMs, CONFIG.mine.maxAmmo, false),
    captiveMines: mineRow(STUB_ROWS.captiveMines.reloadMs, STUB_ROWS.captiveMines.maxAmmo, true),
    missile: { tier: 1, ...STUB_ROWS.missile, homing: false },
    machineGun: ordnanceGunRow(STUB_ROWS.machineGun),
    flak: ordnanceGunRow(STUB_ROWS.flak),
    monitor: ordnanceGunRow(STUB_ROWS.monitor),
    speedBoost: boostRow({
      reloadMs: CONFIG.speedBoost.reloadMs,
      maxAmmo: CONFIG.speedBoost.maxAmmo,
      durationMs: CONFIG.speedBoost.durationMs,
      speedBonus: CONFIG.speedBoost.speedBonus,
    }),
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

/** The mine chassis derivations, for BOTH mine rows (see mineTriggerRadius).
 *  The blast rewrite is NON-idempotent — it consumes the value it overwrites —
 *  so it lives in clampStats ALONE, which runs exactly once per call. */
function deriveMineRings(mine: EffectiveMine): void {
  const blast = mine.blastRadius;
  mine.triggerRadius = mineTriggerRadius(blast, mine.captive);
  if (mine.captive) mine.blastRadius = blast * CONFIG.mine.triggerFactor;
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
  deriveMineRings(eq.navalMines);
  deriveMineRings(eq.captiveMines);
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
