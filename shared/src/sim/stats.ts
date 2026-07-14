// Effective per-ship stats — THE server/client desync firewall for upgrades.
// One pure function turns (ship class, upgrade counts) into every derived
// number the simulation and the HUD consume. The server computes it on grant/
// spawn (cached on ShipRecord.stats); the client recomputes it from you.cls +
// you.upg whenever either changes. Both sides MUST call this — nothing may
// re-derive an upgraded stat ad hoc, or the predictor/HUD silently drift from
// the authoritative sim.
//
// Bases: the ship class for hull-ish stats (hp, kinematics); CONFIG.vision for
// radar/sweep/sight; CONFIG.gun/torpedo/mine for weapons. Stacking per
// CONFIG.upgrades: multiplicative entries compound (base * mult^count), adds
// are linear. Uncapped by design (caps are a CONFIG tweak away).

import { CONFIG, UPGRADE_IDS, type ShipClass, type UpgradeId } from '../constants.js';
import type { WeaponId } from '../types.js';
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
  reloadMs: number; // ms per round
  maxAmmo: number; // pool size
  rangeU: number; // u — max shell travel (aimDist clamp)
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
      maxAmmo: CONFIG.gun.maxAmmo + u.gunAmmo.add * countOf(counts, 'gunAmmo'),
      rangeU: stack(CONFIG.gun.shellRange, u.gunRange.mult, countOf(counts, 'gunRange')),
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
  };
}

/** A fresh all-zeros upgrade counts array (UPGRADE_IDS order). */
export function zeroUpgrades(): number[] {
  return new Array<number>(UPGRADE_IDS.length).fill(0);
}

/** The effective pool size for a weapon index (0 gun / 1 torpedo / 2 mine). */
export function weaponMaxAmmo(stats: EffectiveStats, weapon: WeaponId): number {
  return [stats.gun.maxAmmo, stats.torpedo.maxAmmo, stats.mine.maxAmmo][weapon];
}

/** The effective reload (ms) for a weapon index (0 gun / 1 torpedo / 2 mine). */
export function weaponReloadMs(stats: EffectiveStats, weapon: WeaponId): number {
  return [stats.gun.reloadMs, stats.torpedo.reloadMs, stats.mine.reloadMs][weapon];
}
