// Effective per-ship stats — THE server/client desync firewall. One pure
// function turns (ship class, fitted boons) into every derived number the
// simulation and the HUD consume. The server computes it on grant/spawn
// (cached on ShipRecord.stats); the client recomputes it from you.cls +
// you.boons whenever either changes. Both sides MUST call this — nothing may
// re-derive a boosted stat ad hoc, or the predictor/HUD silently drift from
// the authoritative sim.
//
// Story 2.8: the 14-entry legacy upgrade system (counts param, CONFIG.upgrades
// stacking) died wholesale — boons are the ONLY stat modifier. Bases: the ship
// class for hull-ish stats (hp, kinematics); CONFIG.vision for radar/sweep/
// sight; the per-equipment CONFIG blocks for everything else (gun-family RANGE
// bases on CONFIG.vision.radar — range = radar range, Eric ruling 2026-07-21).
// Damage/blast/trigger/lit numbers are now PROMOTED onto EffectiveStats so the
// catalog's stat ladders can move them through the one firewall.
//
// gun/cannon/starShells rangeU are DERIVED, not independently stat-addressable
// (brainstorm 2026-07-30: Radar Range quietly buffs gun/cannon/blast-torp
// reach too — Intel is a stealth offense category). They are re-pinned to the
// POST-FOLD `radarRange` every time, in both applyBoonStats (sim/boons.ts —
// covers an intelRadar fold mid-list) and clampStats below (the firewall's
// unconditional output pass, the sweepPeriodMs precedent) — a boon fold can
// never leave rangeU stale.
//
// Defensive clamps (all inside this firewall, nowhere else):
//   - sweepRpm ≤ CONFIG.vision.sweepRpmMax (the ratified 30-RPM ceiling —
//     re-applied over the boon fold in sim/boons.ts applyBoonStats, its only
//     sibling site);
//   - mine.triggerRadius ≤ mine.blastRadius (the trip ring never outgrows the
//     blast);
//   - gun.barrels clamped to 1..3 integer (TWIN/TRIPLE MOUNT ladder bounds).
//
// `cooldownScale` (Eric ruling 2026-08-04) is the ONE global cooldown lever:
// a base-1.0 scalar the universal `shipCooldown` line drives DOWN additively
// (-0.10/card, 5 copies -> 0.50), applied post-fold to EVERY equipment's
// reloadMs in clampStats. One scalar, one multiply site — so per-weapon reload
// effects (still whitelisted, none in the catalog today) compose BEFORE the
// global scale, and stacking stays additive-linear rather than 0.9^N.

import { CONFIG, type ShipClass } from '../constants.js';
import type { ShipConfig } from './ship.js';
import { applyBoonStats, type BoonDef } from './boons.js';

/** ms per minute — the rpm -> period conversion for effective stats. Render-
 *  side BASE defaults (radar.ts, ambient.ts) derive 60000/CONFIG rpm at their
 *  own edges; only THIS conversion ever sees boon-modified rpm. */
const MS_PER_MINUTE = 60000;

/** The universal standard gun's effective numbers (Story 2.8: damage/burst
 *  promoted; the single-shot maxAmmo pin is deliberately retired — AFT TURRET
 *  raises the pool; TWIN/TRIPLE MOUNT raise `barrels`). */
export interface EffectiveGun {
  reloadMs: number; // ms per shot (the gun cooldown)
  maxAmmo: number; // pool size — base 1; gunTurret (AFT TURRET) raises it
  rangeU: number; // u — max shell travel / aimDist clamp — DERIVED = radarRange post-fold (not stat-addressable)
  damage: number; // hp per burst victim
  contactDamage: number; // hp to an early interceptor outside the blast
  burstRadius: number; // u — blast radius around the clicked point
  barrels: number; // shells per click (1..3 — each a real shell, own burst point)
}

/** Cannon doctrine modes (PLUNGING FIRE ⚔ ARMOR-PIERCING SHELLS). */
export type CannonMode = 'standard' | 'arcing' | 'ap';

export interface EffectiveCannon {
  reloadMs: number; // ms per shot (the cannon cooldown)
  maxAmmo: number; // pool size
  rangeU: number; // u — max shell travel / aimDist clamp — DERIVED = radarRange post-fold (not stat-addressable)
  damage: number; // hp per burst victim
  contactDamage: number; // hp to an early interceptor outside the blast
  burstRadius: number; // u — blast radius around the clicked point
  mode: CannonMode; // doctrine fold (sim/boons.ts) — 'standard' unless an exclusive is held
}

/** Torpedo doctrine modes (ACOUSTIC HOMING ⚔ COMMAND DETONATION). */
export type TorpedoMode = 'standard' | 'homing' | 'command';

export interface EffectiveTorpedo {
  reloadMs: number; // ms per fish
  maxAmmo: number; // tube pool size
  speed: number; // u/s — launch speed
  damage: number; // hp per contact hit
  mode: TorpedoMode; // doctrine fold — 'standard' unless an exclusive is held
}

/** Mine doctrine modes (SELF-PROPELLED ⚔ PROP-FOULING). */
export type MineMode = 'standard' | 'selfPropelled' | 'propFouling';

export interface EffectiveMine {
  reloadMs: number; // ms per drop
  maxAmmo: number; // drop pool size
  maxLive: number; // max simultaneous live mines on the board
  damage: number; // hp per blast victim
  blastRadius: number; // u — full damage to every non-owner hull within it
  triggerRadius: number; // u — detonation proximity (clamped ≤ blastRadius)
  mode: MineMode; // doctrine fold — 'standard' unless an exclusive is held
}

/** Star-shell doctrine modes (INCENDIARY COMPOUND ⚔ DAZZLE BURST). */
export type StarShellsMode = 'standard' | 'incendiary' | 'dazzle';

export interface EffectiveStarShells {
  reloadMs: number; // ms per flare (the star-shell cooldown)
  maxAmmo: number; // pool size
  rangeU: number; // u — max flare travel — DERIVED = radarRange post-fold (not stat-addressable)
  litRadius: number; // u — lit-zone radius (base = the ratified SIGHT/2 CONFIG derivation)
  litDurationMs: number; // ms — lit-zone lifetime
  mode: StarShellsMode; // doctrine fold — 'standard' unless an exclusive is held
}

/**
 * The activated speed boost's effective numbers. The additive `speedBonus` is
 * layered per-tick via sim/boost.ts boostedKinematics — never folded into
 * kinematics here.
 */
export interface EffectiveBoost {
  speedBonus: number; // u/s added to the forward maxSpeed cap while active
  durationMs: number; // ms — active window per activation
  maxAmmo: number; // charge pool size
  reloadMs: number; // ms — cooldown between activations
}

/** The decoy buoy's effective numbers. */
export interface EffectiveDecoy {
  reloadMs: number; // ms — cooldown between placements
  maxAmmo: number; // charge pool size (one live per owner)
  durationMs: number; // ms — buoy lifetime before natural expiry
}

/** Everything (class, boons) resolves to. See effectiveStats(). */
export interface EffectiveStats {
  kinematics: ShipConfig;
  maxHp: number;
  radarRange: number; // u
  sweepRpm: number; // rev/min — THE tracked radar rotation rate (capped at sweepRpmMax)
  sweepPeriodMs: number; // ms per radar revolution — DERIVED: 60000 / sweepRpm
  sightRange: number; // u — true-sight bubble
  // Global cooldown multiplier applied to EVERY equipment reloadMs post-fold
  // (clampStats). Base 1.0 = a true no-op; shipCooldown drives it down
  // additively (-0.1/card) to 0.5 at the 5-copy cap. Floored at 0.1.
  cooldownScale: number;
  gun: EffectiveGun;
  torpedo: EffectiveTorpedo;
  mine: EffectiveMine;
  boost: EffectiveBoost;
  cannon: EffectiveCannon;
  starShells: EffectiveStarShells;
  decoyBuoy: EffectiveDecoy;
}

/** The count-independent ability blocks + the cannon/starShells skillshots —
 *  pure CONFIG pass-throughs, split out so baseStats stays lean. */
function baseEquipment(): Pick<EffectiveStats, 'boost' | 'cannon' | 'starShells' | 'decoyBuoy'> {
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
      // rangeU base — re-derived from radarRange post-fold in clampStats/
      // applyBoonStats regardless of this seed.
      rangeU: CONFIG.vision.radar,
      damage: CONFIG.cannon.damage,
      contactDamage: CONFIG.cannon.contactDamage,
      burstRadius: CONFIG.cannon.burstRadius,
      mode: 'standard',
    },
    starShells: {
      reloadMs: CONFIG.starShells.reloadMs,
      maxAmmo: CONFIG.starShells.maxAmmo,
      // rangeU base — re-derived from radarRange post-fold in clampStats/
      // applyBoonStats regardless of this seed.
      rangeU: CONFIG.vision.radar,
      // Base stays the ratified SIGHT/2-derived CONFIG value (Eric 2026-07-23).
      litRadius: CONFIG.starShells.litRadius,
      litDurationMs: CONFIG.starShells.litDurationMs,
      mode: 'standard',
    },
    decoyBuoy: {
      reloadMs: CONFIG.decoyBuoy.reloadMs,
      maxAmmo: CONFIG.decoyBuoy.maxAmmo,
      durationMs: CONFIG.decoyBuoy.durationMs,
    },
  };
}

/** The CONFIG-base stats tree for a class — every number a pure base, every
 *  mode 'standard'. Split out so effectiveStats stays lean. */
function baseStats(cls: ShipClass): EffectiveStats {
  return {
    kinematics: { ...cls.kinematics },
    maxHp: cls.hp,
    radarRange: CONFIG.vision.radar,
    sweepRpm: Math.min(CONFIG.vision.sweepRpm, CONFIG.vision.sweepRpmMax),
    sweepPeriodMs: MS_PER_MINUTE / Math.min(CONFIG.vision.sweepRpm, CONFIG.vision.sweepRpmMax),
    sightRange: CONFIG.vision.sight,
    cooldownScale: 1, // base: the global cooldown scale is a no-op until shipCooldown stacks
    gun: {
      reloadMs: CONFIG.gun.reloadMs,
      maxAmmo: CONFIG.gun.maxAmmo,
      // Gun range IS radar range (Eric ruling 2026-07-21) — derived, never
      // duplicated; re-derived from radarRange post-fold in clampStats/
      // applyBoonStats regardless of this seed.
      rangeU: CONFIG.vision.radar,
      damage: CONFIG.gun.damage,
      contactDamage: CONFIG.gun.contactDamage,
      burstRadius: CONFIG.gun.burstRadius,
      barrels: 1, // base single mount — the TWIN/TRIPLE MOUNT ladder adds
    },
    torpedo: {
      reloadMs: CONFIG.torpedo.reloadMs,
      maxAmmo: CONFIG.torpedo.maxAmmo,
      speed: CONFIG.torpedo.speed,
      damage: CONFIG.torpedo.damage,
      mode: 'standard',
    },
    mine: {
      reloadMs: CONFIG.mine.reloadMs,
      maxAmmo: CONFIG.mine.maxAmmo,
      maxLive: CONFIG.mine.maxLive,
      damage: CONFIG.mine.damage,
      blastRadius: CONFIG.mine.blastRadius,
      triggerRadius: CONFIG.mine.triggerRadius,
      mode: 'standard',
    },
    ...baseEquipment(),
  };
}

/** The post-fold defensive clamps + derivations (see the header). Mutates in
 *  place. */
function clampStats(stats: EffectiveStats): void {
  // Sweep ceiling: the boon fold already clamps (applyBoonStats), but the
  // firewall's OUTPUT is the contract — clamp unconditionally.
  stats.sweepRpm = Math.min(stats.sweepRpm, CONFIG.vision.sweepRpmMax);
  stats.sweepPeriodMs = MS_PER_MINUTE / stats.sweepRpm;
  // gun/cannon/starShells range is radarRange, always — the boon fold already
  // re-derives it (applyBoonStats), but the firewall's OUTPUT is the contract
  // — re-pin unconditionally so a boonless call is byte-consistent too.
  stats.gun.rangeU = stats.radarRange;
  stats.cannon.rangeU = stats.radarRange;
  stats.starShells.rangeU = stats.radarRange;
  stats.mine.triggerRadius = Math.min(stats.mine.triggerRadius, stats.mine.blastRadius);
  stats.gun.barrels = Math.min(3, Math.max(1, Math.round(stats.gun.barrels)));
  // THE global cooldown scale, applied ONCE, post-fold, to every equipment —
  // the sibling of the rangeU re-derivations above. Additive folding
  // (-0.1/card) accumulates float dust (a 5-stack lands on
  // 0.5000000000000001, not 0.5; a 4-stack on 0.6000000000000001), and
  // because ammo.ts ticks reloads down in 50ms steps and only refills at
  // <= 0, un-rounded dust silently costs a whole extra 50ms tick on every
  // affected weapon (e.g. the 5-stack gun ruling of 5s -> 2.5s would land 51
  // ticks instead of 50). Round to 3 decimals — far
  // finer than any card's 0.1 step — so every reachable stack lands on the
  // exact ruled number, THEN floor so a hostile or over-stacked list can
  // never reach zero/negative cadence (applyStatEffect's own positive gate is
  // per-effect, not per-total).
  const cd = Math.max(0.1, Math.round(stats.cooldownScale * 1000) / 1000);
  stats.cooldownScale = cd;
  stats.gun.reloadMs *= cd;
  stats.cannon.reloadMs *= cd;
  stats.torpedo.reloadMs *= cd;
  stats.mine.reloadMs *= cd;
  stats.starShells.reloadMs *= cd;
  stats.boost.reloadMs *= cd;
  stats.decoyBuoy.reloadMs *= cd;
}

/**
 * Resolve the effective stats for a ship class + fitted boons. Zero boons ≙
 * the class/CONFIG bases exactly. Pure and allocation-fresh (callers cache the
 * result and swap it on change).
 *
 * `boons` are resolved boon defs whose `stat` and `doctrine` effects fold in
 * over the bases, in boon-list order (sim/boons.ts applyBoonStats — the ONE
 * legal path from boons to derived numbers, so this function stays THE desync
 * firewall). A REPEATED def stacks by occurrence (the deck's copy-count law).
 */
export function effectiveStats(cls: ShipClass, boons: readonly BoonDef[] = []): EffectiveStats {
  const stats = baseStats(cls);
  if (boons.length > 0) applyBoonStats(stats, boons);
  clampStats(stats);
  return stats;
}

// The per-equipment pool/reload lookups (equipmentMaxAmmo / equipmentReloadMs)
// live in sim/loadout.ts beside EquipmentId.
