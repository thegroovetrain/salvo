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
 * The SEVEN CONSUMABLES (catalog-v3 §4, as amended). They are NOT slot
 * EQUIPMENT — they fire off their fixed number keys as stacks of copies, with
 * no module, no stats row and no reload — so they keep their OWN id space and
 * never appear in `EquipmentId`.
 *
 * Since Story 8.7 a copy does hold a SLOT — since Story 9.2 its kind's OWN
 * fixed slot (`CONSUMABLE_SLOTS` / `consumableSlotFor`, sim/loadout.ts; the
 * DEPTH CHARGE stub has none), which is why a slot's content is typed
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
 *
 * STORY 8.17 ADDED ONE MORE (Eric ruling 2026-09-29, epic-8 amendment 132):
 * `dazzleShells` MOVED here out of the add-on space — FLASH SHELLS (its display
 * name) is a prime-and-click belt shell with no reload and no tiers. It keeps
 * its locked `LINE_IDS` id and slot.
 *
 * STORY 9.2 RETIRED ONE (Eric 2026-10-11, epic-9 amendment 31): CHAFF left the
 * pool so the key row is six keys; its role passes to 9.3's countermeasure.
 *
 * STORY 9.3 (Eric 2026-10-11): `smokeScreen` is REPLACED by `countermeasure`
 * (MULTI-SPECTRAL COUNTERMEASURE) in the same place; still seven.
 *
 * STORY 9.4 (Eric 2026-10-11, epic-9 amendments 61–68): `dazzleShells` (FLASH
 * SHELLS) is REPLACED by `foulingShell` (FOULING SHELL) in the same place;
 * still seven.
 */
export const CONSUMABLE_IDS = [
  'hullRepair',
  'shieldBlock',
  'countermeasure',
  'decoyBuoy',
  'depthCharge',
  'supercavTorpedo',
  'foulingShell',
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
 *   (every weapon `rangeU` LEFT this list with Story 9.8 — ruling 125, Eric
 *   2026-10-13: reach is a per-weapon TIERED dial, seeded from
 *   `CONFIG.<weapon>.rangeU` and stepped by each upgrade card, never the
 *   post-fold radar rung. The FOULING SHELL's reach stays a CONFIG read: a
 *   consumable has no stats row.)
 *
 *   - `flak.burstRadius` / `flak.contactDamage`: FIXED by ruling (amendment
 *     105 — the blast never grows; the bodyblock is a CONFIG constant);
 *   - `hunker.armorBonus`: Eric's fixed number (the HUNKER's +100 temporary
 *     Armor, epic-9 amendments 88 / 144; the flat ×0.5 `factor` it replaced is
 *     deleted) that no ladder steps — a CONFIG pass-through, not
 *     card-addressable (a harness `--tune` reaches CONFIG);
 *     `machineGun.rateMs` LEFT this list on 2026-09-30 (the ladder steps it);
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
  gun: ['reloadMs', 'maxAmmo', 'rangeU', 'damage', 'contactDamage', 'burstRadius', 'barrels'],
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
  // THE TWO PICKABLE GUNS (Story 8.15, amendments 103–105). The MACHINE GUN
  // ladder steps the magazine (+4), the per-shell damage (+1 on the rungs to
  // II and IV) and the shot delay (`rateMs` −50 ms × 4, 300 → 100 ms; Eric
  // 2026-10-02, amendment 232); the FLAK ladder steps damage (+8).
  // `flak.burstRadius` and `flak.contactDamage` are deliberately ABSENT: the blast is FIXED by ruling (amendment 105) and
  // the 4 hp bodyblock is a CONFIG constant, and this table is the authoring
  // gate — the captive's fixed-burst precedent (both still flow CONFIG ->
  // stats row as pass-throughs; a harness `--tune flak.*` reaches CONFIG).
  // The −5 %/tier reload is the tier step in clampStats, never an effect.
  machineGun: ['reloadMs', 'maxAmmo', 'rangeU', 'damage', 'rateMs'],
  flak: ['reloadMs', 'maxAmmo', 'rangeU', 'damage'],
  broadside: ['reloadMs', 'maxAmmo', 'rangeU', 'damage', 'burstRadius', 'turrets', 'spreadRung'],
  // STAR SHELLS (Story 8.17, amendment 130): the flare deals burst damage
  // again, so `damage` is addressable (10 → 20 across the ladder).
  starShells: ['reloadMs', 'maxAmmo', 'rangeU', 'litRadius', 'litDurationMs', 'damage'],
  // PHOSPHOR SHELLS (Story 8.17, amendment 131) — its own weapon row. Every
  // number its ladder steps is addressable, `rangeU` included (Story 9.8).
  phosphorShells: ['reloadMs', 'maxAmmo', 'rangeU', 'damage', 'zoneRadius', 'zoneDurationMs', 'dps'],
  // THE TWO NEW CLASS SHIFTS (Story 8.15, amendments 97–102) — boost-shaped
  // rows: no card addresses them today, but `reloadMs` must be a row field so
  // RELOAD's `cooldownScale` reaches it through the one multiply.
  instantReload: ['reloadMs', 'maxAmmo'],
  hunker: ['reloadMs', 'maxAmmo', 'durationMs'],
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
// ladder steps whole numbers (base 8; +2 / +1 / +1 / +1 → 8 / 10 / 11 / 12 /
// 13, Eric 2026-10-16, Story 9.12), so the floor is a no-op on it.
export const EQUIPMENT_INT_FIELDS: readonly string[] = ['maxAmmo', 'barrels', 'turrets', 'damage', 'contactDamage'];

/**
 * The top-level (non-equipment) stat paths. `sightRange`, `sweepPeriodMs` and
 * `damageMultiplier` are DELIBERATELY ABSENT — all three are derived post-fold
 * (radarRange/3, 60000/sweepRpm and damageMultiplierFor(armor)), pinned absent in
 * barrel.test.ts.
 */
export const TOP_LEVEL_STAT_PATHS = [
  'maxHp',
  // ARMOR (Story 9.7, Eric 2026-10-13, epic-9 amendments 86–88): 0 at base,
  // +20 per ARMOR card since Story 9.9 (amendment 144); clampStats derives
  // `damageMultiplier` from it.
  'armor',
  // ARMOR PIERCING (Story 9.9, Eric 2026-10-14/15, epic-9 amendments
  // 144–146): 0 at base, +20 per card. The ATTACKER's stat — the server's
  // damage gate subtracts it from the victim's Armor; it derives nothing here.
  'armorPiercing',
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
  // OUT-OF-COMBAT REGEN (Story 9.6, Eric 2026-10-13, epic-9 amendments 90–91):
  // seeded from CONFIG.regen in baseStats; the PASSIVE HEALING ladder adds
  // +0.006 to the rate and −1000 ms to the wait per copy.
  'regen.missingPctPerS',
  'regen.outOfCombatMs',
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
 * equipment's stat row which the fold sets true; verbs STACK. Catalog v3
 * re-keyed it onto the widened EquipmentId; STORY 8.13 CUT IT TO THE THREE
 * SURVIVING ADD-ONS' targets, STORY 8.15 TO ONE (HEAT SEEKING, R32, is CUT with
 * the missile — Eric ruling 2026-09-21, epic-8 amendment 89e), and STORY 8.17
 * EMPTIED IT (Eric ruling 2026-09-29, epic-8 amendments 131–134): PHOSPHOR
 * SHELLS became its own tiered weapon line and DAZZLE the FLASH SHELLS
 * consumable (itself replaced by the FOULING SHELL in Story 9.4), so the star shell's `phosphor`/`dazzle` verbs are DELETED and no
 * add-on line remains in the catalog. THE MACHINERY STAYS IN PLACE, UNUSED
 * (amendment 134 — ledgered for Eric): the `addon` kind, the `doctrine`
 * effect and this table, empty, so a future add-on needs no engine work.
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
export const DOCTRINE_MODES: Readonly<Partial<Record<EquipmentId, readonly string[]>>> = {};

/** An equipment that may carry doctrine verb state on its stat row. Widened to
 *  `EquipmentId` when the table emptied (Story 8.17): membership is the
 *  RUNTIME `Object.hasOwn(DOCTRINE_MODES, …)` gate, which refuses every id
 *  today. */
export type DoctrineWeapon = EquipmentId;

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
