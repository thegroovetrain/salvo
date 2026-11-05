// Effective per-ship stats — THE server/client desync firewall. One pure
// function turns (ship class, fitted CARDS) into every derived number the
// simulation and the HUD consume. The server computes it on grant/spawn
// (cached on ShipRecord.stats); the client recomputes it from you.cls +
// you.cards whenever either changes. Both sides MUST call this — nothing may
// re-derive a carded stat ad hoc, or the predictor/HUD silently drift from the
// authoritative sim.
//
// STORY 8.1 RESHAPED THE TREE. The seven hand-named equipment blocks
// (gun/torpedo/mine/boost/broadside/starShells/radarBuoy — the last deleted in
// Story 8.16) became ONE TOTAL
// RECORD `equipment`, keyed by the widened `EquipmentId` (sim/loadout.ts), and
// every row carries `tier` and `reloadMs`. That is what lets catalog v3's
// per-equipment TIER ladders exist at all, and it is what
// `BOON_STAT_PATHS` is now GENERATED from (sim/effects.ts
// EQUIPMENT_STAT_FIELDS) rather than hand-listed. The shipped `torpedo` id is
// `heavyTorpedo` and `mine` is `navalMines`; the numbers did not move.
//
// THE INDEX MODEL (Story 10.3, Eric 2026-11-04, epic-10 amendment 8). Every
// ship stat is an INDEX — a whole number around 100 — and the hull envelope
// seeds SEVEN of them (`INDEX_IDS`: armor, power, reload, engines, rudder,
// intel, range) as the AUTHORED top-level fields of this tree; the six ship
// ladders step six of them +20 a card and nothing else is authored. What they
// buy is DERIVED, in sim/indexStats.ts, from BOTH re-pin homes:
// `kinematics.maxSpeed` (30 u/s × ENGINES / 100), `kinematics.turnRate`
// (0.4 rad/s × RUDDER / 100), `sweepRpm` + `sweepPeriodMs` (15 RPM × INTEL /
// 100, capped at sweepRpmMax), `cooldownScale` (1 / (1 + (RELOAD − 100) /
// 100) — the haste law), and in clampStats alone the ONE-SHOT multiply of the
// four deck-gun rows' `rangeU` by RANGE / 100. `maxHp` is 1000 on every hull
// (HULL POINTS is deleted), ARMOR is also the ramming MASS (sim/contact.ts
// callers pass `stats.armor`), and `damageMultiplier` is published against an
// AVERAGE attacker (POWER = base) so a base hull reads ×1. The `regen` pair is
// GONE with PASSIVE HEALING and the out-of-combat regen.
//
// Bases: the ship class for hull-ish stats (hp, the seven indices, the four
// pass-through kinematics); CONFIG.vision for
// radar/sweep/sight; the per-equipment CONFIG blocks for everything else,
// including every weapon's RANGE (Story 9.8, epic-9 amendment 105 / ruling
// 125 — the 2026-07-21 "range = radar range" derivation is superseded). STORY 8.15 EMPTIED THE LAST STUB ROWS: missile and
// monitor are CUT (amendment 89e), and the MACHINE GUN and FLAK GUN became
// mountable guns with CONFIG blocks of their own (`CONFIG.machineGun` /
// `CONFIG.flak`, amendments 103–105), beside the two new class Shifts
// (`CONFIG.instantReload` / `CONFIG.hunker`, amendments 97–102). Every row
// is now built from a real CONFIG block.
//
// EVERY WEAPON `rangeU` IS A STAT-ADDRESSABLE DIAL (Story 9.8, Eric
// 2026-10-13, epic-9 amendment 105 + ruling 125). The row is seeded from
// `CONFIG.<weapon>.rangeU` — the Tier I reach on the twelfths ruler — and each
// of the line's four upgrade cards authors `+step` on
// `equipment.<weapon>.rangeU` (sim/catalog.ts), landing exactly on
// `CONFIG.<weapon>.rangeUAtV` at Tier V. The old post-fold re-pin to
// `radarRange` (and the broadside's `× muzzleFlashFactor`) is DELETED from
// both homes: no gun's reach is the radar rung any more. The remaining
// re-pins (the broadside spread geometry, sightRange, the mine rings) still
// live in exactly two homes, FOLD (sim/boons.ts rePinDerived) + CLAMP below.
//
// Defensive clamps + derivations (all inside this firewall, nowhere else):
//   - EVERY INDEX floored whole (Story 10.3): `armor` / `power` ≥ 0 (the 9.7
//     rule), `reload` / `engines` / `rudder` / `intel` / `range` ≥ 1 so no
//     derivation divides by or multiplies to zero; then the index derivations
//     (sim/indexStats.ts deriveIndexStats) re-run over the floored values;
//   - sweepRpm ≤ CONFIG.vision.sweepRpmMax (the ratified 30-RPM ceiling —
//     applied inside the INTEL derivation);
//   - the mine ring derivations (deriveMineRings): a CONTACT mine's trip ring
//     from its folded blastRadius, the CAPTIVE's from its TIER;
//   - gun.barrels clamped to 1..3 integer — barrels are a fixed 2 since
//     Story 9.12 (CONFIG.gun.barrels, Eric 2026-10-16; no barrel rungs, PvE
//     fleet envelopes keep 1); the clamp guards malformed data;
//   - EVERY integer equipment field (tubes/turrets/barrels/pools) FLOORED
//     ONCE here, after a fold that accumulated it as a float — catalog-v3 R17's
//     standing rule (a +0.5 tube step shows nothing until it completes a whole);
//   - THE EQUIPMENT RELOAD STEP, catalog-v3 §3/§4: −5 % per tier, additive
//     five-point steps, composed BEFORE the global Reload ladder;
//   - ARMOR (Story 9.7, epic-9 amendments 86–88): `armor` floored to a whole
//     number ≥ 0, and `damageMultiplier = damageMultiplierFor(armor − base)`
//     (K = CONFIG.armor.k, base = CONFIG.index.base) derived from it — the ONE
//     curve, which the server's damage gate also calls with the full effective
//     armor `armor + HUNKER bonus − attacker power` (Story 9.9, epic-9
//     amendments 144–146; both indices seed at 100 since Story 10.3, so E is
//     unchanged for every pair of today's hulls). Re-pinned in BOTH re-pin
//     homes. `power` (Story 9.9's `armorPiercing`, renamed by Story 10.3,
//     Eric 2026-11-04, epic-10 amendment 8) is floored the same way and
//     derives nothing here — it enters only at the server's gate.
//
// `cooldownScale` (Eric ruling 2026-08-04, retuned by catalog-v3 R12, re-cut
// as the RELOAD haste law by Story 10.3 ruling 14) is the ONE global cooldown
// lever: a base-1.0 scalar DERIVED from the RELOAD index (1 / (1 + (RELOAD −
// 100) / 100): 120 = ×0.833, 200 = ×0.5), applied post-fold to EVERY
// equipment reloadMs in clampStats. One scalar, one multiply site.

import { CONFIG, type ShipClass } from '../constants.js';
import type { ShipConfig } from './ship.js';
import { applyCardStats } from './boons.js';
import { CATALOG, type Catalog } from './catalog.js';
import { EQUIPMENT_INT_FIELDS } from './effects.js';
import { EQUIPMENT_IDS, type EquipmentId } from './loadout.js';
import { deriveIndexStats, round3, scaleDeckGunRange } from './indexStats.js';
import { secondaryReachU } from './secondaries.js';

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
  rangeU: number; // u — max shell travel / aimDist clamp — Tier I in CONFIG.gun.rangeU, +step per CANNON card (ruling 125)
  damage: number; // hp per burst victim
  contactDamage: number; // hp to an early interceptor outside the blast
  burstRadius: number; // u — blast radius around the clicked point
  barrels: number; // shells per click (CONFIG.gun.barrels for a captain, 1 for a PvE envelope; clamped 1..3 — each a real shell, own burst point)
}

/**
 * The BROADSIDE BARRAGE's effective numbers (Story 7-5 wave 2). Every shell of
 * a barrage carries `damage` and `burstRadius`; `turrets` is how many fly.
 */
export interface EffectiveBroadside extends EquipmentRowCommon {
  // u — max shell travel / aimDist clamp. Tier I in CONFIG.broadside.rangeU,
  // +step per BROADSIDE upgrade card (Story 9.8, ruling 125: 5/12 → 6/12).
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
// Every verb is its own boolean, folded by sim/boons.ts — so an add-on stacks
// with another add-on on the same weapon instead of the second silently
// erasing the first. NO ROW CARRIES A VERB since Story 8.17 (amendment 134):
// the star shell's `phosphor`/`dazzle` were the last, and both are deleted.

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
 * INERT IDENTITY rather than a lie (a row is TOTAL over the type and says so —
 * the deleted `EffectiveRadarBuoy`'s precedent):
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

/**
 * THE MACHINE GUN's effective numbers (Story 8.15, amendments 103–104). The
 * pool IS THE MAGAZINE (`maxAmmo` shells) and `reloadMs` is the full-magazine
 * reload; `rateMs` is the stream cadence (the shot delay), which the ladder
 * steps (Eric 2026-09-30). Direct-hit shells with NO
 * burst, so there is no `burstRadius` and no `contactDamage` (a hull hit IS
 * the `damage`).
 */
export interface EffectiveMachineGun extends EquipmentRowCommon {
  rangeU: number; // u — Tier I in CONFIG.machineGun.rangeU, +step per MACHINE GUN card (ruling 125)
  damage: number; // hp per shell that strikes a hull
  rateMs: number; // ms — one shell per rateMs while held
}

/**
 * THE FLAK GUN's effective numbers (Story 8.15, amendment 105) — the cannon's
 * burst shape without barrels: one shell to the click, a FIXED `burstRadius`
 * blast, the bodyblock `contactDamage` to an early interceptor.
 */
export interface EffectiveFlak extends EquipmentRowCommon {
  rangeU: number; // u — Tier I in CONFIG.flak.rangeU, +step per FLAK card (ruling 125)
  damage: number; // hp per burst victim
  contactDamage: number; // hp to an early interceptor outside the blast
  burstRadius: number; // u — blast radius around the clicked point (FIXED by ruling)
}

/**
 * INSTANT RELOAD's effective numbers (Story 8.15, the Mine Layer's Shift,
 * amendments 97–98): a pool and a cooldown, nothing else — the effect itself
 * (finish each running reload once) has no number to carry.
 */
/**
 * THE MAIN BATTERY row (Story 10.4, Eric 2026-11-04, epic-10 amendment 9) — a
 * captain's slot 0. `reloadMs` is PER TURRET (post-RELOAD, like every row);
 * `maxAmmo` is the hull's TURRET COUNT (the slot's `n` is "turrets ready");
 * `damage` is the hull's per-shell `battery.shellDamage`. Guns per turret,
 * stations and train limits are hull geometry and stay on
 * `CONFIG.shipClasses.<id>.battery` (sim/turrets.ts reads them by hull id).
 * A hull with NO battery (a PvE drone envelope) carries an INERT row — zero
 * turrets, zero damage — because the record is total over `EquipmentId`; a
 * drone never mounts it.
 */
export interface EffectiveMainBattery extends EquipmentRowCommon {
  rangeU: number; // u — max shell travel from the firing turret's station — CONFIG.mainBattery.rangeU × RANGE / 100
  damage: number; // hp per shell (per burst victim)
  contactDamage: number; // hp to an early interceptor outside the blast
  burstRadius: number; // u — blast radius around each shell's own point
}

export type EffectiveInstantReload = EquipmentRowCommon;

/**
 * HUNKER's effective numbers (Story 8.15, the Battleship's Shift,
 * amendments 99–102, re-cut by Story 9.7): the boost's shape plus the
 * `armorBonus` the World adds to the victim's Armor inside the window (epic-9
 * amendment 88 — the flat ×0.5 `factor` is deleted). A CONFIG pass-through,
 * not card-addressable.
 */
export interface EffectiveHunker extends EquipmentRowCommon {
  durationMs: number; // ms — the active window per activation
  armorBonus: number; // temporary Armor added inside the window (stacks with the ARMOR ladder)
}

/**
 * STAR SHELLS' effective numbers. Story 8.17 (Eric ruling 2026-09-29, epic-8
 * amendments 130/134): the flare deals `damage` to every non-owner hull inside
 * the WHOLE lit circle at burst, and the `phosphor`/`dazzle` verbs are DELETED
 * (PHOSPHOR SHELLS is its own row below; DAZZLE is the FLASH SHELLS consumable).
 */
export interface EffectiveStarShells extends EquipmentRowCommon {
  rangeU: number; // u — max flare travel — Tier I in CONFIG.starShells.rangeU, +step per upgrade card (ruling 125)
  litRadius: number; // u — lit-zone radius (= the burst radius)
  litDurationMs: number; // ms — lit-zone lifetime
  damage: number; // hp per burst victim inside the whole lit circle (50 → 100 since Story 10.3)
}

/**
 * PHOSPHOR SHELLS' effective numbers (Story 8.17, Eric ruling 2026-09-29,
 * epic-8 amendment 131) — its own 360° weapon: one shell to the click, a burst
 * of `damage` over the whole `zoneRadius`, then a BURNING ZONE of that radius
 * for `zoneDurationMs` burning `dps` hp/s. The server stamps the zone's three
 * numbers from this row at spawn (amendment 135(e)).
 */
export interface EffectivePhosphorShells extends EquipmentRowCommon {
  rangeU: number; // u — max shell travel — Tier I in CONFIG.phosphorShells.rangeU, +step per upgrade card (ruling 125)
  damage: number; // hp per burst victim inside the zone (50 → 100 since Story 10.3)
  zoneRadius: number; // u — burst AND burning-zone radius (100 → 146.41)
  zoneDurationMs: number; // ms — burning-zone lifetime (8 → 10 s)
  dps: number; // hp/s — burn on every non-owner afloat hull inside (20 → 40 since Story 10.3)
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

/** Any one equipment row. */
export type EquipmentStatRow =
  | EffectiveGun
  | EffectiveBoost
  | EffectiveTorpedo
  | EffectiveMine
  | EffectiveMachineGun
  | EffectiveFlak
  | EffectiveBroadside
  | EffectiveStarShells
  | EffectivePhosphorShells
  | EffectiveInstantReload
  | EffectiveHunker
  | EffectiveMainBattery;

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
  machineGun: EffectiveMachineGun;
  flak: EffectiveFlak;
  broadside: EffectiveBroadside;
  starShells: EffectiveStarShells;
  phosphorShells: EffectivePhosphorShells;
  instantReload: EffectiveInstantReload;
  hunker: EffectiveHunker;
  mainBattery: EffectiveMainBattery;
}

/**
 * Everything (class, cards) resolves to. See effectiveStats().
 *
 * THE INDEX MODEL (Story 10.3): the seven AUTHORED fields are the indices —
 * `armor`, `power`, `reload`, `engines`, `rudder`, `intel`, `range` — seeded
 * from the hull envelope's `index` block and stepped by the ship ladders.
 * `maxHp` and `radarRange` are authored pass-throughs no card writes today.
 * EVERYTHING ELSE AT THE TOP LEVEL IS DERIVED and never stat-addressable:
 * `kinematics.maxSpeed` / `kinematics.turnRate` (sim/indexStats.ts; the other
 * four kinematics are per-class pass-throughs), `sweepRpm`, `sweepPeriodMs`,
 * `cooldownScale`, `sightRange`, `damageMultiplier`.
 */
export interface EffectiveStats {
  // The runtime kinematics stepShip and the predictor read. `maxSpeed` and
  // `turnRate` are DERIVED (CONFIG.index.engines × engines / 100, CONFIG.index
  // .rudder × rudder / 100); reverse / accel / decel / steerage are the
  // envelope's own.
  kinematics: ShipConfig;
  maxHp: number; // 1000 on every hull since Story 10.3 (shown as a percent, never raw)
  radarRange: number; // u
  sweepRpm: number; // rev/min — DERIVED: CONFIG.vision.sweepRpm × intel / 100, capped at sweepRpmMax
  sweepPeriodMs: number; // ms per radar revolution — DERIVED: 60000 / sweepRpm
  sightRange: number; // u — true-sight bubble — DERIVED: radarRange / 3 (the 4/12 rung)
  /**
   * u — THE SECONDARIES' reach (Story 10.4, R3): DERIVED post-fold as
   * `equipment.mainBattery.rangeU × CONFIG.secondaries.rangeFrac`, measured
   * from the ship centre. The secondaries have no slot and no equipment row
   * (heat, not ammo — sim/secondaries.ts); their damage, rate and heat times
   * are `CONFIG.secondaries` constants that no index touches.
   */
  secondaryRangeU: number;
  // Global cooldown multiplier applied to EVERY equipment reloadMs post-fold
  // (clampStats). DERIVED from the RELOAD index by the haste law (ruling 14):
  // 1 / (1 + (reload − 100) / 100), round3'd — 1 at base, 0.5 at RELOAD 200.
  cooldownScale: number;
  // ARMOR (Story 9.7, epic-9 amendments 86–88; +20 per card since Story 9.9,
  // amendment 144): an INDEX since Story 10.3 — 100 at base on every scaffold
  // hull, a whole number. It is ALSO the hull's ramming MASS (ruling 2) and
  // the gate's victim side (ruling 11). `damageMultiplier` is DERIVED from it
  // as damageMultiplierFor(armor − CONFIG.index.base) — the hull's multiplier
  // against an AVERAGE attacker (POWER = base): ×1 at base, ×0.5 at Tier V.
  // Never stat-addressable, and VICTIM-ONLY (amendment 120(e)): the attacker's
  // POWER enters only at the server's gate, which computes its own E.
  armor: number;
  damageMultiplier: number;
  // POWER (Story 9.9's ARMOR PIERCING, Eric 2026-10-14/15, epic-9 amendments
  // 144–146; renamed `armorPiercing` -> `power` by Story 10.3, Eric
  // 2026-11-04, epic-10 amendment 8): an INDEX, 100 at base, +20 per card, a
  // whole number. The ATTACKER's stat: the gate subtracts it from the victim's
  // effective Armor (E = victim armor + HUNKER − attacker power).
  power: number;
  // RELOAD (ruling 14): the haste law's input; `cooldownScale` derives from it.
  reload: number;
  // ENGINES (ruling 15): top speed = CONFIG.index.engines × engines / 100.
  engines: number;
  // RUDDER (ruling 3): turn rate = CONFIG.index.rudder × rudder / 100.
  rudder: number;
  // INTEL (ruling 14): sweep RPM = CONFIG.vision.sweepRpm × intel / 100.
  intel: number;
  // RANGE (ruling 14): the deck-gun rows' folded reach × range / 100 (the
  // one-shot multiply in clampStats). No card writes it after 10.3.
  range: number;
  equipment: EquipmentRows;
}

// THE STUB ROWS ARE GONE (Story 8.15). `STUB_ROWS` carried catalog-v3 §4's
// tier-I draft numbers for equipment with no module yet; Story 8.13 promoted
// three of its seven, and 8.15 drained the rest — `missile` and `monitor` are
// CUT (amendment 89e), and `machineGun`/`flak` are built from their own CONFIG
// blocks with Eric's 2026-09-28 numbers (amendments 103–105), which supersede
// the sheet's drafts. Consumable stubs (DEPTH CHARGE…) never had a row.

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
 * ×1.1 per rung to 175.7 u at tier V from the 120 u ring of 2026-10-08 (catalog-v3 R25 as amended by epic-8
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

/** The two PICKABLE GUNS' rows at CONFIG base (Story 8.15). `rangeU` is
 *  each gun's own Tier I dial (Story 9.8, ruling 125), stepped by its ladder. */
function pickableGunRows(): Pick<EquipmentRows, 'machineGun' | 'flak'> {
  const mg = CONFIG.machineGun;
  const flak = CONFIG.flak;
  return {
    machineGun: {
      tier: 1,
      reloadMs: mg.reloadMs,
      maxAmmo: mg.maxAmmo,
      rangeU: mg.rangeU,
      damage: mg.damage,
      rateMs: mg.rateMs,
    },
    flak: {
      tier: 1,
      reloadMs: flak.reloadMs,
      maxAmmo: flak.maxAmmo,
      rangeU: flak.rangeU,
      damage: flak.damage,
      contactDamage: flak.contactDamage,
      burstRadius: flak.burstRadius,
    },
  };
}

/** The two new CLASS SHIFT rows at CONFIG base (Story 8.15). Their `reloadMs`
 *  takes `cooldownScale` in clampStats like every row (amendments 97/99). */
function shiftRows(): Pick<EquipmentRows, 'instantReload' | 'hunker'> {
  return {
    instantReload: {
      tier: 1,
      reloadMs: CONFIG.instantReload.reloadMs,
      maxAmmo: CONFIG.instantReload.maxAmmo,
    },
    hunker: {
      tier: 1,
      reloadMs: CONFIG.hunker.reloadMs,
      maxAmmo: CONFIG.hunker.maxAmmo,
      durationMs: CONFIG.hunker.durationMs,
      armorBonus: CONFIG.hunker.armorBonus,
    },
  };
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
    // Tier I reach — its own dial since Story 9.8 (ruling 125), no longer the
    // radar rung; the CANNON ladder's cards step it (PvE envelopes share it).
    rangeU: CONFIG.gun.rangeU,
    damage: cls.gun?.damage ?? CONFIG.gun.damage,
    contactDamage: CONFIG.gun.contactDamage,
    burstRadius: CONFIG.gun.burstRadius,
    // TWO BARRELS AT EVERY TIER for a captain (CONFIG.gun.barrels, Eric
    // 2026-10-16, Story 9.12 — no barrel rungs). A PvE fleet envelope
    // (`cls.gun` present) keeps ONE 1-hp shell per click: its shots-to-kill
    // rule (epic-7 amendment 24) is untouched.
    barrels: cls.gun ? 1 : CONFIG.gun.barrels,
  };
}

/** The broadside, star-shell and phosphor rows — pure CONFIG pass-throughs,
 *  split out so baseEquipment stays lean. (The radar-buoy row left with the
 *  buoy, Story 8.16.) Every row starts at tier 1; its ladder's copies raise
 *  the tier in the fold and the −5 %/tier reload is derived in clampStats,
 *  exactly as for the torpedoes (Story 8.17). */
function shippedSkillshotRows(): Pick<EquipmentRows, 'broadside' | 'starShells' | 'phosphorShells'> {
  return {
    broadside: {
      tier: 1,
      reloadMs: CONFIG.broadside.reloadMs,
      maxAmmo: CONFIG.broadside.maxAmmo,
      rangeU: CONFIG.broadside.rangeU, // Tier I reach (ruling 125); the ladder steps it
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
      rangeU: CONFIG.starShells.rangeU, // Tier I reach (ruling 125); the ladder steps it
      litRadius: CONFIG.starShells.litRadius,
      litDurationMs: CONFIG.starShells.litDurationMs,
      damage: CONFIG.starShells.damage,
    },
    phosphorShells: {
      tier: 1,
      reloadMs: CONFIG.phosphorShells.reloadMs,
      maxAmmo: CONFIG.phosphorShells.maxAmmo,
      rangeU: CONFIG.phosphorShells.rangeU, // Tier I reach (ruling 125); the ladder steps it
      damage: CONFIG.phosphorShells.damage,
      zoneRadius: CONFIG.phosphorShells.zoneRadius,
      zoneDurationMs: CONFIG.phosphorShells.zoneDurationMs,
      dps: CONFIG.phosphorShells.dps,
    },
  };
}

/** THE total equipment record at base. Every id present, every tier 1. */
/**
 * THE MAIN BATTERY at zero cards (Story 10.4): the shared half from
 * `CONFIG.mainBattery`, the per-hull half (turret count, shell damage) from
 * the envelope's `battery`. An envelope without one (a PvE drone) gets the
 * inert row — see `EffectiveMainBattery`.
 */
function mainBatteryRow(cls: ShipClass): EffectiveMainBattery {
  return {
    tier: 1,
    reloadMs: CONFIG.mainBattery.reloadMs,
    maxAmmo: cls.battery?.turrets.length ?? 0,
    rangeU: CONFIG.mainBattery.rangeU,
    damage: cls.battery?.shellDamage ?? 0,
    contactDamage: CONFIG.mainBattery.contactDamage,
    burstRadius: CONFIG.mainBattery.burstRadius,
  };
}

function baseEquipment(cls: ShipClass): EquipmentRows {
  return {
    gun: gunRow(cls),
    mainBattery: mainBatteryRow(cls),
    // THE SPEED BOOST (Story 8.9; the Torpedo Boat's Shift since 8.15):
    // `CONFIG.boost` verbatim — the reload then takes `cooldownScale` in
    // clampStats like every row.
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
    ...pickableGunRows(),
    ...shippedSkillshotRows(),
    ...shiftRows(),
  };
}

/** The CONFIG-base stats tree for a class — every number a pure base. Split
 *  out so effectiveStats stays lean. The seven indices are COPIED off the
 *  envelope (never aliased — the fold mutates this tree); every derived field
 *  is then written by the same derivations the two re-pin homes run
 *  (sim/indexStats.ts), so a zero-card tree is already fully derived. */
function baseStats(cls: ShipClass): EffectiveStats {
  const stats: EffectiveStats = {
    // maxSpeed / turnRate are DERIVED below from ENGINES / RUDDER; the four
    // pass-through kinematics are the envelope's own.
    kinematics: { ...cls.kinematics, maxSpeed: 0, turnRate: 0 },
    maxHp: cls.hp,
    radarRange: CONFIG.vision.radar,
    sweepRpm: 0, // DERIVED below (INTEL)
    sweepPeriodMs: 0, // DERIVED below (INTEL)
    sightRange: CONFIG.vision.sight,
    secondaryRangeU: 0, // DERIVED in clampStats (the folded main reach × CONFIG.secondaries.rangeFrac)
    cooldownScale: 0, // DERIVED below (RELOAD)
    armor: cls.index.armor,
    damageMultiplier: 0, // DERIVED below (ARMOR)
    power: cls.index.power,
    reload: cls.index.reload,
    engines: cls.index.engines,
    rudder: cls.index.rudder,
    intel: cls.index.intel,
    range: cls.index.range,
    equipment: baseEquipment(cls),
  };
  deriveIndexStats(stats);
  stats.damageMultiplier = publishedDamageMultiplier(stats.armor);
  return stats;
}

/**
 * THE ARMOR DAMAGE MULTIPLIER (Story 9.7, Eric 2026-10-13, epic-9 amendments
 * 86–88; two branches since Story 9.9, Eric 2026-10-14/15, amendments
 * 144–146) — THE ONE CURVE, on EFFECTIVE armor E, which MAY BE NEGATIVE:
 *
 *   E ≥ 0  →  K / (K + E)          (×1 at 0, ×0.5 at 100, ×1/3 at 200)
 *   E < 0  →  2 − K / (K − E)      (×7/6 at −20, ×1.5 at −100, → 2 never reached)
 *
 * K = CONFIG.armor.k (100). Eric (amendment 146): *"the League style
 * equation ... Its just the opposite curve"* — the negative branch mirrors
 * the positive one through ×1, so the curve is smooth through 0 (both
 * branches are 1 there with slope −1/K) and bounded strictly under ×2 for
 * every E the fold can produce (|E| ≤ a few hundred; the numerator overflows
 * only near ±1e308, unreachable by any card or --tune). There is NO floor at E = 0 and raw K / (K + E) is never
 * used below zero (it would blow up at E = −K) — both rejected, amendment 146.
 *
 * The EXACT fractions, never rounded (review gate 2026-10-13, epic-9
 * amendment 120(a)): a rounded multiplier floored every blow whose exact
 * product is whole a point low; round only where a number is PRINTED. For
 * the same reason the negative branch is COMPUTED as the one fraction
 * `(K − 2E) / (K − E)` — algebraically identical to `2 − K / (K − E)`, but a
 * single correctly-rounded division: the subtraction form lands 7/6 a hair
 * low (12 × it = 13.999…, floored to 13, not Eric's 14). Both sides compute
 * the identical IEEE double from the same integers, so the value stays
 * deterministic.
 *
 * TWO CALLERS, one curve: both re-pin homes derive `stats.damageMultiplier =
 * publishedDamageMultiplier(stats.armor)` — the VICTIM-ONLY published number
 * (amendment 120(e)), never E — and the server's damage gate calls THIS with
 * `victim.armor + hunkerBonus − attacker.power` (the attacker read
 * live at impact, amendment 156).
 *
 * NON-FINITE E READS AS ×1 (the clampSpreadRung law): a NaN must never poison
 * the gate — it yields ×1, never NaN damage.
 */
export function damageMultiplierFor(effectiveArmor: number): number {
  if (!Number.isFinite(effectiveArmor)) return 1;
  const k = CONFIG.armor.k;
  // E < 0: 2 − K/(K − E), written as the one fraction (K − 2E)/(K − E).
  return effectiveArmor >= 0 ? k / (k + effectiveArmor) : (k - 2 * effectiveArmor) / (k - effectiveArmor);
}

/**
 * THE PUBLISHED DAMAGE MULTIPLIER of a hull with ARMOR index `armor` — the
 * one curve evaluated against an AVERAGE attacker (POWER = CONFIG.index.base),
 * so a base hull reads ×1, an ARMOR-capped one ×0.5 (Story 10.3 implementer
 * reading: with every index seeded at 100, `damageMultiplierFor(armor)` alone
 * would publish ×0.5 for an unupgraded hull — a number that means nothing to
 * a reader). VICTIM-ONLY (amendment 120(e)): the server's gate never reads it;
 * it computes E = victim armor + HUNKER − attacker power itself and calls
 * `damageMultiplierFor` directly. The harness and any HUD row print this.
 */
export function publishedDamageMultiplier(armor: number): number {
  return damageMultiplierFor(armor - CONFIG.index.base);
}

/** A whole number ≥ `floor` (non-finite → `floor`): the EQUIPMENT_INT_FIELDS rule. */
const wholeAtLeast = (v: number, floor: number): number => (Number.isFinite(v) ? Math.max(floor, Math.floor(v)) : floor);

/**
 * THE INDEX FLOOR (Story 10.3): every index is authored in whole numbers, so
 * each is floored to an integer — `armor` and `power` at 0 (the 9.7 / 9.9
 * rule: E may be negative only through the gate's subtraction), the five that
 * feed a derivation at 1, so the speed, turn rate, sweep period and cooldown
 * scale are always finite and non-zero whatever a fold hands them. Then the
 * victim-only multiplier is derived from ARMOR alone (amendment 120(e)).
 */
function clampIndices(stats: EffectiveStats): void {
  stats.armor = wholeAtLeast(stats.armor, 0);
  stats.power = wholeAtLeast(stats.power, 0);
  stats.reload = wholeAtLeast(stats.reload, 1);
  stats.engines = wholeAtLeast(stats.engines, 1);
  stats.rudder = wholeAtLeast(stats.rudder, 1);
  stats.intel = wholeAtLeast(stats.intel, 1);
  stats.range = wholeAtLeast(stats.range, 1);
  stats.damageMultiplier = publishedDamageMultiplier(stats.armor);
}

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

/** THE MACHINE GUN'S SHOT DELAY GUARD (review gate 2026-09-30). `rateMs` is
 *  ladder-stepped (−50 ms × 4, 300 → 100 ms at V, Eric 2026-10-02) and the server's
 *  stream reads it as the gap between shells, so a non-finite or ≤ 0 value
 *  would fire a shell every tick (or stall the clock on NaN). A PLUMBING
 *  guard like reloadTierScale's 0.1 floor — NOT a balance ceiling: every
 *  reachable tier passes through untouched; only malformed data falls back
 *  to the CONFIG base. Today the fold's own sanity gate (sim/boons.ts
 *  applyStatEffect skips any ≤ 0 / non-finite result) already stops a bad
 *  EFFECT, so this is the firewall's OUTPUT contract — it holds whatever
 *  path (a malformed base row, a future fold) hands it a bad number. */
function guardRateMs(rateMs: number): number {
  return Number.isFinite(rateMs) && rateMs > 0 ? rateMs : CONFIG.machineGun.rateMs;
}

/** The post-fold defensive clamps + derivations (see the header). Mutates in
 *  place. */
function clampStats(stats: EffectiveStats): void {
  const eq = stats.equipment;
  // THE INDICES FIRST (Story 10.3): floor every index whole, then re-run the
  // index derivations over the floored values — speed, turn rate, the sweep
  // (its ceiling is inside the INTEL derivation) and the cooldown scale. The
  // fold's rePinDerived already derived them, but the firewall's OUTPUT is
  // the contract — derive unconditionally.
  clampIndices(stats);
  deriveIndexStats(stats);
  // NO rangeU RE-PIN (Story 9.8, ruling 125): every weapon's reach is its own
  // CONFIG dial plus its ladder's folded steps — never the radar rung. The
  // RANGE index then scales the four deck-gun rows ONCE, below, beside the
  // reload multiply (the two one-shot multiplies of this firewall).
  // The spread ladder is a TABLE, not a step, so the card writes a 1-based RUNG
  // and BOTH halves of the arc geometry are derived from it.
  eq.broadside.spreadRung = clampSpreadRung(eq.broadside.spreadRung);
  eq.broadside.traverseRad = broadsideTraverse(eq.broadside.spreadRung);
  eq.broadside.mountSpreadRad = broadsideMountSpread(eq.broadside.spreadRung);
  // TRUESIGHT IS THE 4/12 RUNG OF INTEL RANGE (Eric ruling 2026-08-16; the
  // twelfths ruler since Story 9.8, epic-9 amendment 103) — derived, never
  // stat-addressable. At zero cards it is byte-identical to the
  // CONFIG.vision.sight seed, because CONFIG.vision.radar IS SIGHT*3.
  stats.sightRange = stats.radarRange / 3;
  deriveMineRings(eq);
  floorIntegerFields(eq);
  // Barrels are a fixed 2 since Story 9.12 (CONFIG.gun.barrels; no rung
  // authors them); the clamp guards malformed data (a hostile --tune, a test
  // catalog).
  eq.gun.barrels = Math.min(3, Math.max(1, eq.gun.barrels));
  eq.machineGun.rateMs = guardRateMs(eq.machineGun.rateMs);
  // THE global cooldown scale, applied ONCE, post-fold, to every equipment.
  // Since Story 10.3 it is DERIVED from the RELOAD index by the haste law
  // (sim/indexStats.ts reloadCooldownScale — round3'd there, because ammo.ts
  // ticks reloads down in 50ms steps and only refills at <= 0, so un-rounded
  // dust would silently cost a whole extra tick; floored at 0.1 there as the
  // malformed-data guard — RELOAD ≥ 1 above makes the law finite, and five
  // +20 cards land on exactly 0.5).
  const cd = stats.cooldownScale;
  // THE RANGE INDEX, applied ONCE, post-fold, to the four deck-gun rows (the
  // one-shot sibling of the reload multiply — never in rePinDerived).
  scaleDeckGunRange(stats);
  // THE SECONDARIES' REACH (Story 10.4, R3): half the hull's FOLDED main
  // reach — derived here, after the one-shot RANGE multiply, and nowhere
  // else. Not a stat path: no card addresses it.
  stats.secondaryRangeU = secondaryReachU(eq.mainBattery.rangeU);
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
