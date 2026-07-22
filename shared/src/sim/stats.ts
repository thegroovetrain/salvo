// Effective per-ship stats — THE server/client desync firewall for upgrades.
// One pure function turns (ship class, upgrade counts) into every derived
// number the simulation and the HUD consume. The server computes it on grant/
// spawn (cached on ShipRecord.stats); the client recomputes it from you.cls +
// you.upg whenever either changes. Both sides MUST call this — nothing may
// re-derive an upgraded stat ad hoc, or the predictor/HUD silently drift from
// the authoritative sim.
//
// Bases: the ship class for hull-ish stats (hp, kinematics); CONFIG.vision for
// radar/sweep/sight; CONFIG.gun/torpedo/mine for weapons (gun RANGE bases on
// CONFIG.vision.radar — range = radar range, Eric ruling 2026-07-21). Stacking per
// CONFIG.upgrades: multiplicative entries compound (base * mult^count), adds
// are linear. Uncapped by design (caps are a CONFIG tweak away).

import { CONFIG, UPGRADE_IDS, type ShipClass, type UpgradeId } from '../constants.js';
import type { ShipConfig } from './ship.js';

/** UpgradeId -> index into a counts array (UPGRADE_IDS order). */
const UPGRADE_INDEX: Readonly<Record<UpgradeId, number>> = Object.fromEntries(
  UPGRADE_IDS.map((id, i) => [id, i]),
) as Record<UpgradeId, number>;

/** Count of one upgrade type in a counts array (missing/short arrays read 0). */
function countOf(counts: readonly number[], id: UpgradeId): number {
  return counts[UPGRADE_INDEX[id]] ?? 0;
}

/** base * mult^count — the multiplicative stacking rule. */
function stack(base: number, mult: number, count: number): number {
  return base * Math.pow(mult, count);
}

/** One weapon's effective numbers (per-weapon extras live beside these). */
export interface EffectiveGun {
  reloadMs: number; // ms per shot (the gun cooldown)
  maxAmmo: number; // pool size — ALWAYS 1 (single-shot; gunAmmo neutralized)
  rangeU: number; // u — max shell travel / aimDist clamp (base = CONFIG.vision.radar)
}

export interface EffectiveTorpedo {
  reloadMs: number; // ms per fish
  maxAmmo: number; // tube pool size
  speed: number; // u/s — launch speed
}

export interface EffectiveMine {
  reloadMs: number; // ms per drop
  maxAmmo: number; // drop pool size
  maxLive: number; // max simultaneous live mines on the board
}

/**
 * The activated speed boost's effective numbers — a pure pass-through of
 * CONFIG.speedBoost. NO upgrade multiplies any of these: the legacy maxSpeed
 * upgrade multiplies the BASE kinematics cap (kinematics.maxSpeed above) BEFORE
 * this additive `speedBonus` is layered on, and that additive step happens
 * elsewhere, per-tick, via sim/boost.ts boostedKinematics — never here.
 */
export interface EffectiveBoost {
  speedBonus: number; // u/s added to the forward maxSpeed cap while active
  durationMs: number; // ms — active window per activation
  maxAmmo: number; // charge pool size
  reloadMs: number; // ms — cooldown between activations
}

/**
 * The long-range cannon's effective numbers (Story 1.7) — a pure pass-through
 * of CONFIG.cannon plus the radar-DERIVED base range. NO upgrade multiplies
 * any of these (the boost precedent): the legacy gun-category upgrades keep
 * applying to the standard gun ONLY, so a gunRange-stacked standard gun can
 * out-range the cannon — a known interregnum quirk that dies with the Epic 2
 * economy.
 */
export interface EffectiveCannon {
  reloadMs: number; // ms per shot (the cannon cooldown)
  maxAmmo: number; // pool size — always 1 (single-shot)
  rangeU: number; // u — max shell travel / aimDist clamp (= CONFIG.vision.radar, un-stacked)
}

/**
 * The star shells' effective numbers (Story 1.7) — a pure pass-through of
 * CONFIG.starShells plus the radar-DERIVED base range. NO upgrade multiplies
 * any of these (see EffectiveCannon's interregnum note — same rule).
 */
export interface EffectiveStarShells {
  reloadMs: number; // ms per flare (the star-shell cooldown)
  maxAmmo: number; // pool size — always 1 (single-shot)
  rangeU: number; // u — max shell travel / aimDist clamp (= CONFIG.vision.radar, un-stacked)
}

/**
 * The decoy buoy's effective numbers (Story 1.8) — a pure pass-through of
 * CONFIG.decoyBuoy (the boost precedent). NO upgrade touches any of these: the
 * decoy is a fixed-cost signature ability, and no legacy upgrade category
 * covers it.
 */
export interface EffectiveDecoy {
  reloadMs: number; // ms — cooldown between placements
  maxAmmo: number; // charge pool size (one live per owner)
  durationMs: number; // ms — buoy lifetime before natural expiry
}

/** Everything (class, upgrades) resolves to. See effectiveStats(). */
export interface EffectiveStats {
  kinematics: ShipConfig;
  maxHp: number;
  radarRange: number; // u
  sweepPeriodMs: number; // ms per radar revolution
  sightRange: number; // u — true-sight bubble
  gun: EffectiveGun;
  torpedo: EffectiveTorpedo;
  mine: EffectiveMine;
  boost: EffectiveBoost;
  cannon: EffectiveCannon;
  starShells: EffectiveStarShells;
  decoyBuoy: EffectiveDecoy;
}

/**
 * The count-independent activated-ability + skillshot blocks — pure CONFIG
 * pass-throughs that NO upgrade touches (boost precedent). rangeU on the
 * cannon/star shells is the gun's BASE range (CONFIG.vision.radar), deliberately
 * WITHOUT the gunRange stack: gun-category upgrades apply to the standard gun
 * only, so an upgraded gun can out-range the cannon (a known interregnum quirk,
 * dies with Epic 2). Split out of effectiveStats so that function stays lean.
 */
function passThroughEquipment(): Pick<EffectiveStats, 'boost' | 'cannon' | 'starShells' | 'decoyBuoy'> {
  return {
    boost: {
      speedBonus: CONFIG.speedBoost.speedBonus,
      durationMs: CONFIG.speedBoost.durationMs,
      maxAmmo: CONFIG.speedBoost.maxAmmo,
      reloadMs: CONFIG.speedBoost.reloadMs,
    },
    cannon: {
      reloadMs: CONFIG.cannon.reloadMs,
      maxAmmo: CONFIG.cannon.maxAmmo,
      rangeU: CONFIG.vision.radar,
    },
    starShells: {
      reloadMs: CONFIG.starShells.reloadMs,
      maxAmmo: CONFIG.starShells.maxAmmo,
      rangeU: CONFIG.vision.radar,
    },
    decoyBuoy: {
      reloadMs: CONFIG.decoyBuoy.reloadMs,
      maxAmmo: CONFIG.decoyBuoy.maxAmmo,
      durationMs: CONFIG.decoyBuoy.durationMs,
    },
  };
}

/**
 * Resolve the effective stats for a ship class + upgrade counts (indexed by
 * UPGRADE_IDS order). Zero counts ≙ the class/CONFIG bases exactly. Pure and
 * allocation-fresh (callers cache the result and swap it on change).
 */
export function effectiveStats(cls: ShipClass, counts: readonly number[]): EffectiveStats {
  const u = CONFIG.upgrades;
  const speedMult = Math.pow(u.maxSpeed.mult, countOf(counts, 'maxSpeed'));
  const k = cls.kinematics;
  return {
    kinematics: {
      maxSpeed: k.maxSpeed * speedMult,
      reverseSpeed: k.reverseSpeed * speedMult, // scaled WITH maxSpeed by design
      accel: k.accel,
      decel: k.decel,
      turnRate: k.turnRate,
      steerageSpeed: k.steerageSpeed,
    },
    maxHp: cls.hp + u.hullPoints.add * countOf(counts, 'hullPoints'),
    radarRange: stack(CONFIG.vision.radar, u.radarRange.mult, countOf(counts, 'radarRange')),
    sweepPeriodMs: stack(CONFIG.vision.sweepPeriod, u.sweepSpeed.periodMult, countOf(counts, 'sweepSpeed')),
    sightRange: stack(CONFIG.vision.sight, u.sightRange.mult, countOf(counts, 'sightRange')),
    gun: {
      reloadMs: stack(CONFIG.gun.reloadMs, u.gunReload.mult, countOf(counts, 'gunReload')),
      // Single-shot gun: PINNED to the CONFIG pool size (1) regardless of any
      // gunAmmo count — the id survives on the wire (append-only UPGRADE_IDS)
      // but is neutralized here AND excluded from offers (interregnum, dies in
      // Epic 2). A pre-rolled legacy offer spent on gunAmmo increments the
      // count with zero effect.
      maxAmmo: CONFIG.gun.maxAmmo,
      // Base gun range IS radar range (Eric ruling 2026-07-21) — derived, never
      // duplicated. gunRange stacks can briefly outrange an unupgraded radar
      // (known-ugly interregnum artifact, dies in Epic 2).
      rangeU: stack(CONFIG.vision.radar, u.gunRange.mult, countOf(counts, 'gunRange')),
    },
    torpedo: {
      reloadMs: stack(CONFIG.torpedo.reloadMs, u.torpedoReload.mult, countOf(counts, 'torpedoReload')),
      maxAmmo: CONFIG.torpedo.maxAmmo + u.torpedoAmmo.add * countOf(counts, 'torpedoAmmo'),
      speed: stack(CONFIG.torpedo.speed, u.torpedoSpeed.mult, countOf(counts, 'torpedoSpeed')),
    },
    mine: {
      reloadMs: stack(CONFIG.mine.reloadMs, u.mineReload.mult, countOf(counts, 'mineReload')),
      maxAmmo: CONFIG.mine.maxAmmo + u.mineAmmo.add * countOf(counts, 'mineAmmo'),
      maxLive: CONFIG.mine.maxLive + u.maxMines.add * countOf(counts, 'maxMines'),
    },
    // The count-independent ability/skillshot pass-throughs (boost, cannon,
    // star shells, decoy) — see passThroughEquipment().
    ...passThroughEquipment(),
  };
}

/** A fresh all-zeros upgrade counts array (UPGRADE_IDS order). */
export function zeroUpgrades(): number[] {
  return new Array<number>(UPGRADE_IDS.length).fill(0);
}

// The per-equipment pool/reload lookups (equipmentMaxAmmo / equipmentReloadMs)
// live in sim/loadout.ts beside EquipmentId — the WeaponId-indexed
// weaponMaxAmmo/weaponReloadMs helpers are retired with the weapon selector.
