// THE CARD EFFECT VOCABULARY (Story 8.1) — the four things a catalog card may
// do, and the generated whitelist of stat paths it may address. Split out of
// sim/boons.ts so that sim/catalog.ts can author and validate lines without
// importing the fold (which imports sim/stats.ts): this module sits BELOW
// everything and imports nothing but types.
//
// The four effects (`BoonEffect`), unchanged in spirit from the 2.5 engine:
//   1. `stat`     — mutate ONE whitelisted EffectiveStats scalar (folded only
//                   inside effectiveStats(); the desync firewall holds);
//   2. `slotFill` — fit one piece of equipment into the loadout (copy 1 of an
//                   equipment line IS the weapon — catalog-v3 §4 standing rule);
//   3. `doctrine` — set one per-equipment VERB boolean (verbs stack);
//   4. `behavior` — run a registered shared hook per tick (HOOK_REGISTRY is
//                   empty and stays empty).
// The fifth, `stock` (one copy of a CONSUMABLE into its rack, Story 8.7), is
// DELETED with the consumable id space (2026-11-05, Story 10.5, epic-10
// amendment 11): the kit is retired and nothing stocks.
// `slotReplace` is DELETED (Story 8.1): nothing in catalog v3 swaps one piece
// of equipment for another — equipment lines fit, they never replace.

import type { EquipmentId } from './loadout.js';
import type { HookParams } from './hooks.js';

/** Catalog card id (camelCase string — the registry-id convention). Kept as a
 *  loose alias so wire-facing code can hold an unvalidated id; the authored
 *  vocabulary is `LineId` (sim/catalog.ts). */
export type BoonId = string;

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
 *   post-fold radar rung.)
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
 *     effect — a card writing it would break the per-weapon RELOAD bonus's
 *     arithmetic (Story 10.6, R5);
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
  // (`supercavTorpedo` left this table with amendment 74 and is back at its
  // foot since Story 10.5.)
  lightTorpedo: ['reloadMs', 'maxAmmo', 'speed', 'damage', 'homingTurnRate'],
  heavyTorpedo: ['reloadMs', 'maxAmmo', 'speed', 'damage', 'homingTurnRate'],
  navalMines: ['reloadMs', 'maxAmmo', 'damage', 'blastRadius'],
  // THE CAPTIVE ROW HAS NO RADIUS PATH AT ALL (amendment 84d): its trip ring
  // is derived from the tier and its 32 u burst is fixed, so neither
  // `blastRadius` nor `triggerRadius` is addressable. `homingTurnRate` is
  // (amendment 82: 0 → 0.3 across the five rungs).
  captiveMines: ['reloadMs', 'maxAmmo', 'damage', 'homingTurnRate'],
  // FOULING MINES (amendment 81) — its own line now, not an add-on. `damage`
  // was whitelisted-but-unwritten (10 hp fixed) until Story 10.3 gave the line
  // a +25 damage rung (Eric 2026-11-04, ruling 6: 100 → 200).
  foulingMines: ['reloadMs', 'maxAmmo', 'damage', 'blastRadius', 'slowFactor'],
  // THE TWO PICKABLE GUNS (Story 8.15, amendments 103–105). The MACHINE GUN
  // ladder steps the magazine and the shot delay (`rateMs`; Eric 2026-10-16,
  // Story 9.12); the FLAK ladder steps damage (+6 since Story 10.3's ×3
  // placeholders, Eric 2026-11-04, ruling 10).
  // `flak.burstRadius` and `flak.contactDamage` are deliberately ABSENT: the blast is FIXED by ruling (amendment 105) and
  // the bodyblock is a CONFIG constant, and this table is the authoring
  // gate — the captive's fixed-burst precedent (both still flow CONFIG ->
  // stats row as pass-throughs; a harness `--tune flak.*` reaches CONFIG).
  // The per-tier RELOAD bonus (Story 10.6, R5) is derived in clampStats, never an effect.
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
  // rows: no card addresses them today; `reloadMs` is a row field so the
  // reload law reads it (RELOAD no longer scales a Shift — Story 10.5, R10).
  instantReload: ['reloadMs', 'maxAmmo'],
  hunker: ['reloadMs', 'maxAmmo', 'durationMs'],
  // THE MAIN BATTERY (Story 10.4) — the cannon row's shape less `barrels`
  // (guns per turret is hull geometry, `CONFIG.shipClasses.<id>.battery`) and
  // less `maxAmmo` (the turret count, hull geometry too). No card addresses
  // it today; `reloadMs` and `rangeU` are row fields so RELOAD and RANGE reach
  // them through the one multiply each.
  mainBattery: ['reloadMs', 'rangeU', 'damage', 'contactDamage', 'burstRadius'],
  // THE THREE MOVED WEAPONS (2026-11-05, Story 10.5, epic-10 amendment 11).
  // SUPERCAV steps `damage` (+100 a rung, amendment 8(e)); `homingTurnRate` is
  // deliberately ABSENT — it never homes (amendment 74), so no card may ever
  // give it a turn rate. FLASH SHELLS and the FOULING SHELL step `radius`
  // (R7: +25 u a tier); `rangeU` is a row field no card writes (the reach is
  // fixed — the `maxHp` shape).
  supercavTorpedo: ['reloadMs', 'maxAmmo', 'speed', 'damage'],
  dazzleShells: ['reloadMs', 'maxAmmo', 'rangeU', 'radius'],
  foulingShell: ['reloadMs', 'maxAmmo', 'rangeU', 'radius'],
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
// ladder steps whole numbers (base 24; +6 / +3 / +3 / +3 → 24 / 30 / 33 / 36 /
// 39, the Story 10.3 ×3 placeholders of Eric's 2026-10-16 table), so the floor
// is a no-op on it.
export const EQUIPMENT_INT_FIELDS: readonly string[] = ['maxAmmo', 'barrels', 'turrets', 'damage', 'contactDamage'];

/**
 * The top-level (non-equipment) stat paths — THE INDEX MODEL's authored
 * surface (Story 10.3, Eric 2026-11-04, epic-10 amendment 8). The SIX
 * INDICES are what a ship ladder may write (RUDDER, the seventh, is DELETED
 * by Story 10.6 — R2); everything they buy is DERIVED post-fold in
 * sim/indexStats.ts and is DELIBERATELY ABSENT here, pinned absent in
 * barrel.test.ts: `kinematics.maxSpeed` (ENGINES), `kinematics.turnRate` (the
 * one baseline since 10.6), `sweepRpm` + `sweepPeriodMs` (INTEL),
 * `cooldownScale` (RELOAD), `damageMultiplier` (ARMOR), `sightRange`
 * (radarRange / 3). The `regen.*` pair LEFT with PASSIVE HEALING and the
 * out-of-combat regen (both deleted); `armorPiercing` is `power`.
 *
 * STORY 10.6 (Eric 2026-11-05) ADDS the card-written halves of the two
 * cooldown abilities (R8 / R9 — sim/abilityStats.ts) and the four MOUNT
 * counts of the one-off WEAPON cards (R6 / R7 — sim/mountStats.ts). Their
 * derived halves — `repair.cooldownMs` / `regenMs`, `smoke.cooldownMs` /
 * `r0` / `r1` — are DELIBERATELY ABSENT, like every derived number.
 */
export const TOP_LEVEL_STAT_PATHS = [
  // `maxHp` keeps its seat with no writer: HULL POINTS is deleted (Story 10.3)
  // and every hull is 1000, but a hull size is addressable in principle (the
  // established shape — a path leaves only when the stat stops being a stat).
  'maxHp',
  // ARMOR (Story 9.7, Eric 2026-10-13, epic-9 amendments 86–88; +20 per card
  // since Story 9.9, amendment 144): an INDEX since Story 10.3 — 100 at base
  // on every scaffold hull, the ramming MASS (ruling 2) and the gate's victim
  // side (ruling 11); clampStats derives `damageMultiplier` from it.
  'armor',
  // POWER (Story 9.9's ARMOR PIERCING, Eric 2026-10-14/15, epic-9 amendments
  // 144–146; renamed `armorPiercing` -> `power` by Story 10.3): an INDEX, 100
  // at base, +20 per card. The ATTACKER's stat — the server's damage gate
  // subtracts it from the victim's Armor; it derives nothing here.
  'power',
  // RELOAD (ruling 14): the haste law's input — `cooldownScale` is derived
  // from it (the ladder used to write the scale −0.05 a copy; now +20 index).
  'reload',
  // ENGINES (ruling 15): top speed = CONFIG.index.engines × this / 100.
  'engines',
  // (`rudder` sat here until Story 10.6 deleted RUDDER — R2.)
  // INTEL (ruling 14): sweep RPM = CONFIG.vision.sweepRpm × this / 100.
  'intel',
  // RANGE (ruling 14): the deck-gun rows' reach × this / 100 — the main
  // battery and, through it, the secondaries. The RANGE card writes it
  // (+10, Story 10.6, R1).
  'range',
  'radarRange',
  // The four kinematics that stay per-class pass-throughs (ruling 3: "accel /
  // decel / reverse / steerage stay per-class kinematics") — addressable in
  // principle, no card writes them.
  'kinematics.reverseSpeed',
  'kinematics.accel',
  'kinematics.decel',
  'kinematics.steerageSpeed',
  // HULL REPAIR (Story 10.6, R8): the ability's own haste score (CONFIG.index
  // .base + 5 a card) and its two heal amounts (+20 each a card).
  'repair.reload',
  'repair.instantHp',
  'repair.regenHp',
  // SMOKE SCREEN (Story 10.6, R9): the ability's own haste score (+5 a card),
  // the cloud's life (+1 s a card) and the 1-based SIZE rung the disc is
  // derived from (the `spreadRung` precedent — every whitelisted stat stays
  // strictly positive).
  'smoke.reload',
  'smoke.lifeMs',
  'smoke.sizeRung',
  // THE MOUNTS (Story 10.6, R6 / R7): one `add: 1` each, from the four cap-1
  // one-off WEAPON cards — family-wide, read in clampStats as the torpedo and
  // mine rows' capacity. `rackBonus` is the one that seeds at 0 (EXPANDED
  // MINE RACKS adds a seat to a rack that has no bonus).
  'torpedoLaunchers',
  'tubesPerLauncher',
  'mineRacks',
  'rackBonus',
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
 * line, so the star shell's `phosphor`/`dazzle` verbs are DELETED and no
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

/** Fit `equipmentId` into its FAMILY's slot (sim/loadout.ts `familySlotFor`) —
 *  fresh full pool at current stats. No-op (silent) when that slot is occupied
 *  or the id has no family slot. */
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

/** The four-effect vocabulary — the ONLY ways a card may touch the sim. */
export type BoonEffect = BoonStatEffect | BoonSlotFillEffect | BoonBehaviorEffect | BoonDoctrineEffect;

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
