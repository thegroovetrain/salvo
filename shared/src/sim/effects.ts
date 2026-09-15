// THE CARD EFFECT VOCABULARY (Story 8.1) — the five things a catalog card may
// do, and the generated whitelist of stat paths it may address. Split out of
// sim/boons.ts so that sim/catalog.ts can author and validate lines without
// importing the fold (which imports sim/stats.ts): this module sits BELOW
// everything and imports nothing but types.
//
// The five effects (`BoonEffect`), unchanged in spirit from the 2.5 engine:
//   1. `stat`     — mutate ONE whitelisted EffectiveStats scalar (folded only
//                   inside effectiveStats(); the desync firewall holds);
//   2. `slotFill` — fit one piece of equipment into the loadout (copy 1 of an
//                   equipment line IS the weapon — catalog-v3 §4 standing rule);
//   3. `doctrine` — set one per-equipment VERB boolean (verbs stack);
//   4. `behavior` — run a registered shared hook per tick (HOOK_REGISTRY is
//                   empty and stays empty);
//   5. `stock`    — put one copy of a CONSUMABLE in its rack. Story 8.7 wires
//                   it; THE FOLD IGNORES IT ENTIRELY today.
// `slotReplace` is DELETED (Story 8.1): nothing in catalog v3 swaps one piece
// of equipment for another — equipment lines fit, they never replace.

import type { EquipmentId } from './loadout.js';
import type { HookParams } from './hooks.js';

/** Catalog card id (camelCase string — the registry-id convention). Kept as a
 *  loose alias so wire-facing code can hold an unvalidated id; the authored
 *  vocabulary is `LineId` (sim/catalog.ts). */
export type BoonId = string;

/**
 * The five launch CONSUMABLES (catalog-v3 §4). They are NOT slot equipment —
 * they fire off the `1`–`4` rail out of a rack — so they have their own id
 * space and never appear in `EquipmentId`.
 */
export const CONSUMABLE_IDS = [
  'hullRepair',
  'shieldBlock',
  'smokeScreen',
  'chaff',
  'decoyBuoy',
] as const;

/** One of the five consumables. */
export type ConsumableId = (typeof CONSUMABLE_IDS)[number];

/**
 * THE per-equipment stat fields a `stat` effect may address, keyed by
 * EquipmentId. BOON_STAT_PATHS is GENERATED from this table (Story 8.1) rather
 * than hand-listed, so widening `EffectiveStats.equipment` can never leave the
 * whitelist behind — but the DELIBERATE ABSENCES below are load-bearing and
 * are pinned absent by barrel.test.ts:
 *
 *   - every `rangeU` (gun / starShells / broadside): DERIVED from post-fold
 *     `radarRange` (the broadside one rung short, at the 5/8 muzzle rung), so a
 *     card addressing one would be a SECOND derivation;
 *   - `broadside.traverseRad` / `broadside.mountSpreadRad`: derived from the
 *     1-based `spreadRung`, which IS the addressable field;
 *   - every mine's `triggerRadius`: derived from the folded `blastRadius`
 *     (Eric ruling 2026-08-16);
 *   - every row's `tier`: it counts COPIES HELD (sim/boons.ts), never an
 *     effect — a card writing it would break the reload step's arithmetic;
 *   - every doctrine VERB boolean: `doctrine` effects are their only home.
 *
 * A field that merely has no card behind it today STAYS here (the established
 * shape): deleting a path is only correct when the stat stops being addressable
 * in principle.
 */
export const EQUIPMENT_STAT_FIELDS = {
  gun: ['reloadMs', 'maxAmmo', 'damage', 'contactDamage', 'burstRadius', 'barrels'],
  boost: ['speedBonus', 'durationMs', 'maxAmmo', 'reloadMs'],
  lightTorpedo: ['reloadMs', 'maxAmmo', 'speed', 'damage'],
  heavyTorpedo: ['reloadMs', 'maxAmmo', 'speed', 'damage'],
  supercavTorpedo: ['reloadMs', 'maxAmmo', 'speed', 'damage'],
  navalMines: ['reloadMs', 'maxAmmo', 'maxLive', 'damage', 'blastRadius'],
  captiveMines: ['reloadMs', 'maxAmmo', 'maxLive', 'damage', 'blastRadius'],
  missile: ['reloadMs', 'maxAmmo', 'damage'],
  machineGun: ['reloadMs', 'maxAmmo', 'damage'],
  flak: ['reloadMs', 'maxAmmo', 'damage'],
  monitor: ['reloadMs', 'maxAmmo', 'damage'],
  broadside: ['reloadMs', 'maxAmmo', 'damage', 'burstRadius', 'turrets', 'spreadRung'],
  starShells: ['reloadMs', 'maxAmmo', 'litRadius', 'litDurationMs'],
  speedBoost: ['speedBonus', 'durationMs', 'maxAmmo', 'reloadMs'],
  radarBuoy: ['reloadMs', 'maxAmmo', 'durationMs', 'radarRange', 'sweepRpm', 'hp', 'gunDamage', 'gunReloadMs'],
} as const satisfies Record<EquipmentId, readonly string[]>;

/**
 * The INTEGER equipment fields (catalog-v3 §3, R17's standing rule — FRACTIONAL
 * STEPS ACCUMULATE AND FLOOR). A per-tier step may be fractional on one of
 * these (+0.5 tubes); the fold accumulates the float and sim/stats.ts
 * clampStats floors ONCE, so nothing appears until the fraction completes a
 * whole. `spreadRung` is absent deliberately: it rounds through
 * clampSpreadRung against its authored ladder.
 */
export const EQUIPMENT_INT_FIELDS: readonly string[] = ['maxAmmo', 'maxLive', 'barrels', 'turrets'];

/**
 * The top-level (non-equipment) stat paths. `sightRange` and `sweepPeriodMs`
 * are DELIBERATELY ABSENT — both are derived post-fold (radarRange/2 and
 * 60000/sweepRpm), pinned absent in barrel.test.ts.
 */
export const TOP_LEVEL_STAT_PATHS = [
  'maxHp',
  'radarRange',
  'sweepRpm',
  // The ONE global cooldown lever (Eric ruling 2026-08-04, retuned by
  // catalog-v3 R12): a top-level base-1 scalar multiplied into EVERY
  // equipment reloadMs post-fold. The RELOAD ladder drives it with
  // add: -0.05 per copy, so five copies land on exactly 0.75.
  'cooldownScale',
  'kinematics.maxSpeed',
  'kinematics.reverseSpeed',
  'kinematics.accel',
  'kinematics.decel',
  'kinematics.turnRate',
  'kinematics.steerageSpeed',
] as const;

/** Every `equipment.<id>.<field>` path the table above generates. */
type EquipmentStatPath = {
  [K in EquipmentId]: `equipment.${K}.${(typeof EQUIPMENT_STAT_FIELDS)[K][number]}`;
}[EquipmentId];

/** A stat-addressable EffectiveStats scalar path. */
export type BoonStatPath = (typeof TOP_LEVEL_STAT_PATHS)[number] | EquipmentStatPath;

/** Build the generated whitelist once, in EQUIPMENT_STAT_FIELDS key order. */
function generateStatPaths(): readonly BoonStatPath[] {
  const paths: string[] = [...TOP_LEVEL_STAT_PATHS];
  for (const id of Object.keys(EQUIPMENT_STAT_FIELDS)) {
    const fields = EQUIPMENT_STAT_FIELDS[id as EquipmentId] as readonly string[];
    for (const field of fields) paths.push(`equipment.${id}.${field}`);
  }
  return Object.freeze(paths) as readonly BoonStatPath[];
}

/**
 * THE generated stat whitelist: the top-level paths plus every
 * `equipment.<id>.<field>` from EQUIPMENT_STAT_FIELDS. Generated, never
 * hand-listed (Story 8.1) — see the absences documented above.
 */
export const BOON_STAT_PATHS: readonly BoonStatPath[] = generateStatPaths();

/** Runtime fail-closed guard for the fold (an effect built outside the type
 *  system — e.g. deserialized — can never write off-whitelist). */
export const BOON_STAT_PATH_SET: ReadonlySet<string> = new Set(BOON_STAT_PATHS);

/**
 * The known doctrine VERBS per equipment — the fold's fail-closed vocabulary
 * AND the authoring gate. EVERY entry names a BOOLEAN FIELD on that
 * equipment's stat row which the fold sets true; verbs STACK (a star shell may
 * be both phosphor and dazzle). Catalog v3 re-keys it onto the widened
 * EquipmentId and cuts it to the five add-ons' targets:
 *   - ACOUSTIC HOMING (R22) homes BOTH torpedoes, never the supercavitating;
 *   - FOULING MINES (R28) is naval mines ONLY — never the captive's fish;
 *   - HEAT SEEKING (R32) is the acoustic-homing numbers on the missile;
 *   - DAZZLE / PHOSPHOR SHELLS (R33) both ride the star shell and stack.
 * The radar buoy's `gun`/`jamming` verbs are GONE from the vocabulary (R1
 * deletes the buoy; no v3 line grants them), and `captive` is gone because
 * CAPTIVE MINES became its own equipment line (R25) whose row carries the flag
 * at base rather than a card setting it.
 */
export const DOCTRINE_MODES = {
  lightTorpedo: ['homing'],
  heavyTorpedo: ['homing'],
  navalMines: ['propFouling'],
  missile: ['homing'],
  starShells: ['phosphor', 'dazzle'],
} as const satisfies Partial<Record<EquipmentId, readonly string[]>>;

/** An equipment that carries doctrine verb state on its stat row. */
export type DoctrineWeapon = keyof typeof DOCTRINE_MODES;

/**
 * Derived-stat mutation: `value * (mult ?? 1) + (add ?? 0)` on one whitelisted
 * EffectiveStats scalar. Only ever applied inside effectiveStats().
 */
export interface BoonStatEffect {
  kind: 'stat';
  path: BoonStatPath;
  mult?: number;
  add?: number;
}

/** Fit `equipmentId` into the loadout's extra slot — fresh full pool at current
 *  stats. No-op (silent) when the slot is occupied or the id already fitted. */
export interface BoonSlotFillEffect {
  kind: 'slotFill';
  equipmentId: EquipmentId;
}

/** Execute the registered hook `hookId` with `params` at its attachment point
 *  (v1: per-tick kinematics — sim/hooks.ts). Unknown hookId = silent no-op. */
export interface BoonBehaviorEffect {
  kind: 'behavior';
  hookId: string;
  params: HookParams;
}

/**
 * Set an equipment's doctrine VERB on its stat row. `mode` names a verb from
 * that equipment's DOCTRINE_MODES vocabulary, which IS the name of a boolean
 * field, so two verbs on one weapon compose. Fail-closed: an unknown
 * equipment/verb combination moves nothing.
 */
export interface BoonDoctrineEffect {
  kind: 'doctrine';
  weapon: EquipmentId;
  mode: string;
}

/**
 * Put ONE copy of a consumable in its rack (catalog-v3 §4 — consumables are
 * cap-5 lines and every copy stocks one use). Story 8.7 owns the rack; THE
 * STAT FOLD IGNORES `stock` ENTIRELY, which is why a consumable line can ship
 * today without touching a single derived number.
 */
export interface BoonStockEffect {
  kind: 'stock';
  /** The CONSUMABLE line stocked — not an EquipmentId (consumables hold no slot). */
  equipmentId: ConsumableId;
}

/** The five-effect vocabulary — the ONLY ways a card may touch the sim. */
export type BoonEffect =
  | BoonStatEffect
  | BoonSlotFillEffect
  | BoonBehaviorEffect
  | BoonDoctrineEffect
  | BoonStockEffect;

/** Authoring sugar for sim/catalog.ts (and for tests building test catalogs). */
export const statEffect = (path: BoonStatPath, over: { mult?: number; add?: number }): BoonStatEffect => ({
  kind: 'stat',
  path,
  ...over,
});

/** Authoring sugar: one doctrine verb on one equipment. */
export const doctrineEffect = (weapon: DoctrineWeapon, mode: string): BoonDoctrineEffect => ({
  kind: 'doctrine',
  weapon,
  mode,
});
