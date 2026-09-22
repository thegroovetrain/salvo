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
//   5. `stock`    — put one copy of a CONSUMABLE in its rack: the belt slot
//                   that already holds the line, else the first empty one
//                   (Story 8.7, sim/boons.ts applySlotEffect). The STAT fold
//                   still ignores it entirely — a stack moves no number.
// `slotReplace` is DELETED (Story 8.1): nothing in catalog v3 swaps one piece
// of equipment for another — equipment lines fit, they never replace.

import type { EquipmentId } from './loadout.js';
import type { HookParams } from './hooks.js';

/** Catalog card id (camelCase string — the registry-id convention). Kept as a
 *  loose alias so wire-facing code can hold an unvalidated id; the authored
 *  vocabulary is `LineId` (sim/catalog.ts). */
export type BoonId = string;

/**
 * The SEVEN launch CONSUMABLES (catalog-v3 §4, as amended). They are NOT slot
 * EQUIPMENT — they fire off the `1`–`4` rail as stacks of copies, with no
 * module, no stats row and no reload — so they keep their OWN id space and
 * never appear in `EquipmentId`.
 *
 * Since Story 8.7 a copy does hold a SLOT: one of the four BELT slots
 * (`CONSUMABLE_SLOTS`, sim/loadout.ts), which is why a slot's content is typed
 * `SlotItemId = EquipmentId | ConsumableId`. That union is the ONLY place the
 * two spaces meet: no EquipmentId-keyed record ever gains a consumable key, and
 * every read of one narrows through `isConsumableId` first.
 *
 * STORY 8.13 ADDED TWO (Eric rulings 2026-09-19, epic-8 amendments 74 and 83):
 *   - `supercavTorpedo` MOVED here out of `EquipmentId` — it is a
 *     prime-and-click belt fish with no reload and no tiers, so its stat row,
 *     its arc case and its appetite moved with it (amendment 74);
 *   - `depthCharge` is NEW and STUB — Eric's line, mechanism a later story
 *     (amendment 83) — and it is the Mine Layer's 40th default card.
 * Both keep their locked `LINE_IDS` ids; `acousticHoming` left the catalog
 * entirely (amendment 80).
 */
export const CONSUMABLE_IDS = [
  'hullRepair',
  'shieldBlock',
  'smokeScreen',
  'chaff',
  'decoyBuoy',
  'depthCharge',
  'supercavTorpedo',
] as const;

/** One of the seven consumables. */
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
 *   - every mine's `triggerRadius`: derived post-fold (naval and fouling from
 *     the folded `blastRadius` — Eric ruling 2026-08-16; the CAPTIVE's from
 *     its row's TIER — epic-8 amendment 84d);
 *   - `captiveMines.blastRadius`: FIXED at 32 u by ruling (amendment 84d) —
 *     the captive's tier steps the TRIP RING, never the fish's burst;
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
  boost: ['durationMs', 'maxAmmo', 'reloadMs'],
  // The two torpedo LINES (Story 8.13). `homingTurnRate` is addressable
  // because homing stopped being a card and became a TIER STAT (epic-8
  // amendment 80): both lines step it +0.125/tier off a 0 base.
  // `supercavTorpedo` LEFT this table with `EquipmentId` — it is a consumable
  // now (amendment 74) and consumables carry no stat row.
  lightTorpedo: ['reloadMs', 'maxAmmo', 'speed', 'damage', 'homingTurnRate'],
  heavyTorpedo: ['reloadMs', 'maxAmmo', 'speed', 'damage', 'homingTurnRate'],
  navalMines: ['reloadMs', 'maxAmmo', 'damage', 'blastRadius'],
  // THE CAPTIVE ROW HAS NO RADIUS PATH AT ALL (amendment 84d): its trip ring
  // is derived from the tier and its 32 u burst is fixed, so neither
  // `blastRadius` nor `triggerRadius` is addressable. `homingTurnRate` is
  // (amendment 82: 0 → 0.3 across the five rungs).
  captiveMines: ['reloadMs', 'maxAmmo', 'damage', 'homingTurnRate'],
  // FOULING MINES (amendment 81) — its own line now, not an add-on. `damage`
  // is whitelisted although no tier steps it (10 hp is fixed): the table says
  // what is addressable in principle, not what a card writes today.
  foulingMines: ['reloadMs', 'maxAmmo', 'damage', 'blastRadius', 'slowFactor'],
  missile: ['reloadMs', 'maxAmmo', 'damage'],
  machineGun: ['reloadMs', 'maxAmmo', 'damage'],
  flak: ['reloadMs', 'maxAmmo', 'damage'],
  monitor: ['reloadMs', 'maxAmmo', 'damage'],
  broadside: ['reloadMs', 'maxAmmo', 'damage', 'burstRadius', 'turrets', 'spreadRung'],
  starShells: ['reloadMs', 'maxAmmo', 'litRadius', 'litDurationMs'],
  radarBuoy: ['reloadMs', 'maxAmmo', 'durationMs', 'radarRange', 'sweepRpm', 'hp', 'gunDamage', 'gunReloadMs'],
} as const satisfies Record<EquipmentId, readonly string[]>;

/**
 * The INTEGER equipment fields (catalog-v3 §3, R17's standing rule — FRACTIONAL
 * STEPS ACCUMULATE AND FLOOR). A per-tier step may be fractional on one of
 * these (+0.5 tubes); the fold accumulates the float and sim/stats.ts
 * clampStats floors ONCE, so nothing appears until the fraction completes a
 * whole. `spreadRung` is absent deliberately: it rounds through
 * clampSpreadRung against its authored ladder. `maxLive` left this list with
 * the mine caps themselves (Story 8.4, FR57/AR48).
 */
// `damage` and `contactDamage` are integers too (Eric 2026-09-17, epic-8
// amendment 39): a shell NEVER deals a fractional hit point. The deck-gun
// ladder accumulates +1.25 per tier and the floor lands it on Eric's own scale
// 15 → 16 → 17 → 18 → 20.
export const EQUIPMENT_INT_FIELDS: readonly string[] = ['maxAmmo', 'barrels', 'turrets', 'damage', 'contactDamage'];

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
 * be both phosphor and dazzle). Catalog v3 re-keyed it onto the widened
 * EquipmentId; STORY 8.13 CUT IT TO THE THREE SURVIVING ADD-ONS' targets:
 *   - HEAT SEEKING (R32) is the homing verb on the missile — both are CUT in
 *     Story 8.15 (Eric ruling 2026-09-21, epic-8 amendment 89e);
 *   - DAZZLE / PHOSPHOR SHELLS (R33) both ride the star shell and stack.
 *
 * TWO VERBS LEFT THE VOCABULARY on 2026-09-19 (Eric rulings, epic-8
 * amendments 80 and 81), because the CARDS that granted them are deleted:
 *   - `homing` on the two TORPEDOES — ACOUSTIC HOMING is gone and the turn
 *     rate is now a NUMERIC TIER STAT (`homingTurnRate`) on each line, so
 *     there is no boolean left to set;
 *   - `propFouling` on NAVAL MINES — FOULING MINES is its own equipment line
 *     now and a naval mine never fouls, so there is no verb left to grant.
 * The radar buoy's `gun`/`jamming` verbs went with the buoy (R1), and
 * `captive` went when CAPTIVE MINES became its own line (R25) — a mine's KIND
 * is its ROW IDENTITY, never a flag a card writes.
 */
export const DOCTRINE_MODES = {
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
 * cap-5 lines and every copy stocks one use). Story 8.7 built the rack in
 * sim/boons.ts `applySlotEffect`; THE STAT FOLD IGNORES `stock` ENTIRELY, which
 * is why a consumable line can ship without touching a single derived number.
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
