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
// gun/starShells rangeU are DERIVED, not independently stat-addressable
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
//   - mine trip ring / blast radius are DERIVED from the folded blastRadius
//     and the CAPTIVE verb (Story 7-5 wave 2 — see clampStats);
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

/**
 * The BROADSIDE BARRAGE's effective numbers (Story 7-5 wave 2 — replaces the
 * cannon outright, along with its `CannonMode` enum and both doctrine cards).
 * Every shell of a barrage carries `damage` and `burstRadius`; `turrets` is how
 * many fly.
 */
export interface EffectiveBroadside {
  reloadMs: number; // ms per barrage
  maxAmmo: number; // pool size (barrages held)
  // u — max shell travel / aimDist clamp. DERIVED post-fold as
  // `radarRange × CONFIG.vision.muzzleFlashFactor` — THE 5/8 RUNG, 412.5u base
  // (Eric: "This weapon's range is limited to 5/8"). The first and only weapon
  // that does not reach the full radar horizon. Not stat-addressable.
  rangeU: number;
  damage: number; // hp per burst victim, PER SHELL
  burstRadius: number; // u — blast radius around each shell's own point
  turrets: number; // shells per barrage (3 base .. 5 at the BROADSIDE TURRETS cap)
  // The SPREAD LADDER RUNG: 1 = no BROADSIDE SPREAD cards held, 5 = the ×4 cap.
  // This is the stat-addressable field the card writes (+1/card); the traverse
  // itself is derived from it, because the ladder is a table of authored
  // degrees rather than a multiplicative step. 1-based so every whitelisted
  // stat stays strictly positive, the law applyStatEffect enforces.
  spreadRung: number;
  // rad — EACH TURRET'S TRAVERSE half-angle about its own mount bearing (Eric
  // ruling 2026-08-20: the SPREAD card widens every gun's arc; the salvo's
  // spread is emergent, not designed). DERIVED post-fold from `spreadRung`
  // against CONFIG.broadside.traverseDeg; never stat-addressable (a card
  // writing it would be a second derivation).
  traverseRad: number;
}

// STORY 7-5 WAVE 1 — DOCTRINE IS A SET OF INDEPENDENT VERBS, NOT ONE ENUM.
// Eric's retooling stacks verbs on the same weapon (PHOSPHOR *and* DAZZLE
// shells; PROP FOULING beside SELF-PROPELLED), which a single-valued `mode`
// field structurally cannot hold — the last card granted would silently erase
// the earlier one. So the three weapons whose verbs now stack carry one
// INDEPENDENT BOOLEAN PER VERB, folded by sim/boons.ts applyDoctrineEffect.
// STORY 7-5 WAVE 2 finished the job: the cannon's single-valued `mode` enum
// was the last one standing, and it died with the weapon (the BROADSIDE BARRAGE
// has no doctrine cards at all). EVERY doctrine verb in the game is now an
// independent boolean, so the fold has no special cases left — see
// sim/boons.ts applyDoctrineEffect.

export interface EffectiveTorpedo {
  reloadMs: number; // ms per fish
  maxAmmo: number; // tube pool size
  speed: number; // u/s — launch speed
  damage: number; // hp per contact hit
  homing: boolean; // ACOUSTIC HOMING verb (doctrine fold) — false unless held
}

export interface EffectiveMine {
  reloadMs: number; // ms per drop
  maxAmmo: number; // drop pool size
  maxLive: number; // max simultaneous live mines on the board
  damage: number; // hp per blast victim
  blastRadius: number; // u — full damage to every non-owner hull within it
  triggerRadius: number; // u — detonation proximity (DERIVED = blastRadius × triggerFactor)
  propFouling: boolean; // PROP FOULING verb (doctrine fold) — false unless held
  // CAPTIVE MINES verb (doctrine fold) — false unless held. REPLACES the
  // deleted SELF-PROPELLED verb. A captive mine never detonates on contact: it
  // fires ONE un-upgraded torpedo doing `damage` at `blastRadius` and is
  // expended. It also SWAPS the two radii and triples the trigger (derived in
  // clampStats), which is why holding it changes the two numbers above rather
  // than adding a third pair.
  captive: boolean;
}

export interface EffectiveStarShells {
  reloadMs: number; // ms per flare (the star-shell cooldown)
  maxAmmo: number; // pool size
  rangeU: number; // u — max flare travel — DERIVED = radarRange post-fold (not stat-addressable)
  litRadius: number; // u — lit-zone radius (base = the ratified SIGHT/2 CONFIG derivation)
  litDurationMs: number; // ms — lit-zone lifetime
  phosphor: boolean; // PHOSPHOR SHELLS verb (the burning zone) — false unless held
  dazzle: boolean; // DAZZLE SHELLS verb — false unless held; STACKS with phosphor
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

/**
 * The RADAR BUOY's effective numbers (Story 7-5 wave 2 — replaces the decoy
 * buoy; the decoy role is deleted, nothing fakes a ship contact any more).
 * `radarRange` is the BUOY'S OWN SET, flat and never observer-scaled: it is the
 * equipment's reach, not the owner's intel build (R2.7).
 */
export interface EffectiveRadarBuoy {
  reloadMs: number; // ms — cooldown between placements
  maxAmmo: number; // charge pool size
  durationMs: number; // ms — buoy lifetime before natural expiry
  radarRange: number; // u — the buoy's own radar reach (flat, not observer-scaled)
  sweepRpm: number; // rev/min — the buoy's own sweep (BUOY ×4: +1.25/card)
  hp: number; // hp — destructible; killing one pays no XP and prints no feed line
  gunDamage: number; // hp per shot — GUN BUOY verb only
  gunReloadMs: number; // ms — cooldown between its shots — GUN BUOY verb only
  gun: boolean; // GUN BUOY verb (doctrine fold) — false unless held
  jamming: boolean; // JAMMING BUOY verb (doctrine fold) — false unless held
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
  broadside: EffectiveBroadside;
  starShells: EffectiveStarShells;
  radarBuoy: EffectiveRadarBuoy;
}

/** The count-independent ability blocks + the broadside/starShells skillshots
 *  — pure CONFIG pass-throughs, split out so baseStats stays lean. */
function baseEquipment(): Pick<EffectiveStats, 'boost' | 'broadside' | 'starShells' | 'radarBuoy'> {
  return {
    boost: {
      speedBonus: CONFIG.speedBoost.speedBonus,
      durationMs: CONFIG.speedBoost.durationMs,
      maxAmmo: CONFIG.speedBoost.maxAmmo,
      reloadMs: CONFIG.speedBoost.reloadMs,
    },
    broadside: {
      reloadMs: CONFIG.broadside.reloadMs,
      maxAmmo: CONFIG.broadside.maxAmmo,
      // rangeU base — re-derived from radarRange × muzzleFlashFactor post-fold
      // in clampStats/applyBoonStats regardless of this seed.
      rangeU: CONFIG.vision.radar * CONFIG.vision.muzzleFlashFactor,
      damage: CONFIG.broadside.damage,
      burstRadius: CONFIG.broadside.burstRadius,
      turrets: CONFIG.broadside.turrets,
      spreadRung: 1, // no BROADSIDE SPREAD cards held
      // traverseRad base — re-derived from spreadRung post-fold, same law.
      traverseRad: broadsideTraverse(1),
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
      phosphor: false,
      dazzle: false,
    },
    radarBuoy: {
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

/** deg -> rad (CONFIG.broadside.traverseDeg is authored in degrees).
 *  SAME ASSOCIATION as sim/arcs.ts's `deg` — `(d * PI) / 180`, never
 *  `d * (PI / 180)`: the two round differently in the last bit, and both sides
 *  must land on the identical double. */
const deg = (d: number): number => (d * Math.PI) / 180;

/**
 * The BROADSIDE SPREAD rung, clamped to the authored ladder: 1 (no cards) ..
 * traverseDeg.length (the ×4 cap). Integer — the card adds exactly 1, so a
 * fractional value can only come from malformed effect data.
 */
export function clampSpreadRung(rung: number): number {
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
 * u — the mine's TRIP RING for a folded blast radius, under the CAPTIVE verb.
 * An ordinary mine trips at a fixed fraction of its blast; a CAPTIVE mine swaps
 * the two rings and triples the trip (Story 7-5 wave 2, R2.12), so its trigger
 * is the folded blast × `captiveTriggerFactor`. Pure and linear in
 * `blastRadius`, which is what makes MINES card ORDER irrelevant. Shared by
 * clampStats and sim/boons.ts applyBoonStats — the only two sites.
 */
export function mineTriggerRadius(blastRadius: number, captive: boolean): number {
  return blastRadius * (captive ? CONFIG.mine.captiveTriggerFactor : CONFIG.mine.triggerFactor);
}

/** The CONFIG-base stats tree for a class — every number a pure base, every
 *  doctrine verb false (and the cannon's enum 'standard'). Split out so
 *  effectiveStats stays lean. */
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
      // A PvE fleet envelope carries its own weaker gun (Story 5.6, epic-5
      // amendment 34, retuned by 45): damage 1/2/3 by size against a captain's 15, on a flat
      // 5s cooldown. Read from the ENVELOPE so effectiveStats() stays the one
      // derivation path — no hull id parameter, no post-construction mutation
      // of ship.stats. Every real ship class omits `cls.gun` and so keeps
      // CONFIG.gun verbatim, byte-identical to before this story.
      reloadMs: cls.gun?.reloadMs ?? CONFIG.gun.reloadMs,
      maxAmmo: CONFIG.gun.maxAmmo,
      // Gun range IS radar range (Eric ruling 2026-07-21) — derived, never
      // duplicated; re-derived from radarRange post-fold in clampStats/
      // applyBoonStats regardless of this seed. Fleet ships are NOT clamped
      // shorter here: they only ever fire at an acquired target, and
      // acquisition already requires sight (330u) plus LOS, so their effective
      // reach is bounded by the AI rather than by a second range constant.
      rangeU: CONFIG.vision.radar,
      damage: cls.gun?.damage ?? CONFIG.gun.damage,
      contactDamage: CONFIG.gun.contactDamage,
      burstRadius: CONFIG.gun.burstRadius,
      barrels: 1, // base single mount — the TWIN/TRIPLE MOUNT ladder adds
    },
    torpedo: {
      reloadMs: CONFIG.torpedo.reloadMs,
      maxAmmo: CONFIG.torpedo.maxAmmo,
      speed: CONFIG.torpedo.speed,
      damage: CONFIG.torpedo.damage,
      homing: false,
    },
    mine: {
      reloadMs: CONFIG.mine.reloadMs,
      maxAmmo: CONFIG.mine.maxAmmo,
      maxLive: CONFIG.mine.maxLive,
      damage: CONFIG.mine.damage,
      blastRadius: CONFIG.mine.blastRadius,
      triggerRadius: CONFIG.mine.triggerRadius,
      propFouling: false,
      captive: false,
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
  // gun/starShells range is radarRange, always — the boon fold already
  // re-derives it (applyBoonStats), but the firewall's OUTPUT is the contract
  // — re-pin unconditionally so a boonless call is byte-consistent too.
  stats.gun.rangeU = stats.radarRange;
  stats.starShells.rangeU = stats.radarRange;
  // THE BROADSIDE IS THE 5/8 RUNG (Story 7-5 wave 2, Eric: "This weapon's range
  // is limited to 5/8") — the same re-pin law as its two siblings above, one
  // rung short of the horizon. It rides `radarRange` rather than a literal, so
  // there is ONE derivation of the rung rather than two — and a future card on
  // the whitelisted `radarRange` path would carry it out for free.
  stats.broadside.rangeU = stats.radarRange * CONFIG.vision.muzzleFlashFactor;
  // The spread ladder is a TABLE, not a step, so the card writes a 1-based RUNG
  // and the traverse is derived from it (clamped inside the helper) — the
  // sweepPeriodMs pattern applied to an authored ladder.
  stats.broadside.spreadRung = clampSpreadRung(stats.broadside.spreadRung);
  stats.broadside.traverseRad = broadsideTraverse(stats.broadside.spreadRung);
  // TRUESIGHT IS THE 4/8 RUNG OF INTEL RANGE (Eric ruling 2026-08-16) — derived,
  // never stat-addressable. `sightRange` left BOON_STAT_PATHS, so this is the
  // firewall's authoritative answer and applyBoonStats holds the sibling copy.
  // No card writes `radarRange` since RANGE I–IV was deleted (2026-08-20), so
  // today this resolves the BASE ladder for every observer; it stays derived so
  // there is one derivation rather than two, and so a future card on that
  // whitelisted path needs no re-scaling work. At zero boons it is
  // byte-identical to the old CONFIG.vision.sight seed, because
  // CONFIG.vision.radar IS SIGHT*2.
  stats.sightRange = stats.radarRange / 2;
  // THE TRIP RING IS A FIXED FRACTION OF THE BLAST (Eric ruling 2026-08-16) —
  // derived, not clamped. This REPLACES the old
  // `min(triggerRadius, blastRadius)` clamp: that clamp existed to stop the trip
  // ring outgrowing the blast, but it did so by silently eating most of the 5th
  // trigger card whenever no blast card was held. A fraction of the ceiling can
  // never cross the ceiling, so the invariant now holds by construction and the
  // clamp has nothing left to do. At zero boons this is byte-identical to the
  // old base: 48 × 2/3 = 32 exactly.
  //
  // CAPTIVE MINES (Story 7-5 wave 2) then SWAP the two radii and triple the
  // trigger: 144u trip / 32u blast at base, 210.8u / 46.9u at a maxed MINES
  // ladder. Both outputs are linear in the ONE folded `blastRadius`, so MINES
  // cards apply on top and card ORDER CANNOT MATTER. The blast write is the one
  // NON-idempotent line here — it consumes `blastRadius` and rewrites it — which
  // is exactly the shape of the `cooldownScale` multiply below and is safe for
  // the same reason: clampStats is the firewall's single OUTPUT pass and runs
  // exactly once per effectiveStats() call. applyBoonStats therefore re-pins the
  // TRIGGER only (pure in blastRadius, idempotent) and never the swap.
  const blast = stats.mine.blastRadius;
  stats.mine.triggerRadius = mineTriggerRadius(blast, stats.mine.captive);
  if (stats.mine.captive) stats.mine.blastRadius = blast * CONFIG.mine.triggerFactor;
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
  stats.broadside.reloadMs *= cd;
  stats.torpedo.reloadMs *= cd;
  stats.mine.reloadMs *= cd;
  stats.starShells.reloadMs *= cd;
  stats.boost.reloadMs *= cd;
  stats.radarBuoy.reloadMs *= cd;
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
