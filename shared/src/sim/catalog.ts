// THE CATALOG (Story 8.1) — catalog v3, Eric's authored sheet
// (`_bmad-output/planning-artifacts/gdds/.../catalog-v3.md`) expressed as data,
// as amended by Eric's rulings (epic-8 amendments).
// 29 card LINES / 122 physical cards: 11 equipment lines (55), 5 universal
// ladders (22), the deck-gun family (7), 3 add-ons (3), 7 consumables (35).
//
// THE COUNT MOVED 114 -> 122 IN STORY 8.13 (amendments 74/80/81/83), purely by
// re-cutting KINDS: ACOUSTIC HOMING (a 1-card add-on) is deleted, DEPTH CHARGE
// (a 5-card consumable) joins, SUPERCAV TORPEDO moves equipment -> consumable
// (still 5) and FOULING MINES moves add-on -> equipment (1 -> 5).
//
// A LINE is `{ id, kind, cap, tiers[] }`. `cap` is BOTH the physical copy count
// and the number of tiers, pinned equal by validateCatalog: holding copy k
// (1-based) applies `tiers[k-1]`, so a line's whole ladder is authored in one
// place and the fold needs no per-line arithmetic.
//
// THE TIER CONVENTION (catalog-v3 §4): for an EQUIPMENT line, copy 1 IS the
// weapon (tier I, the bare fit) and copies 2–5 are the four upgrade steps;
// for the DECK GUN, which is slotless and always fitted, tier I is already
// equipped and copy 1 is a real upgrade step.
//
// WHAT 8.1 AUTHORS AND WHAT IT DOES NOT. The five universal ladders and the
// deck-gun family carry REAL content, because they replace shipped v2 lines.
// Every equipment line carries copy 1 (`slotFill`); its FOUR UPGRADE TIERS are
// filled by the story that builds the weapon, from catalog-v3 §4. Story 8.13
// filled the five torpedo/mine ladders (`tieredWeapon` below); the gun family
// is 8.14's and the broadside/star shells 8.16's, so those stay empty. The
// −5 %/tier reload step is NEVER one of those effects — it is derived from the
// tier in sim/stats.ts clampStats, see there. Consumables stock and nothing
// else.
//
// STUB LINES (`stub: true`) are lines whose MECHANISM does not exist yet. They
// are authored in full shape so the catalog is complete and the ids are final,
// and they are EXCLUDED by `buildDeckState()` — a stub stays in a hull's frozen
// 40-card list (Eric ruling 2026-09-15, epic-8 amendment 11) but is never dealt
// into the drawable DeckState, so it can never be offered (amendment 5: stay
// playable). A stub is also refused by the slot fold (sim/boons.ts) and by the
// server's grant, so an id that reaches a card list by any other route still
// fits nothing.
//
// NO DEAD CARD IN A LIVE DECK is the rule the stub exclusion serves, and it
// takes one more thing: a hull spawns HOLDING copy 1 of every equipment line
// whose weapon it already carries, and `buildDeckState(list, carried)` deals
// that copy one short (see sim/deck.ts).
//
// THE DEFAULT DECKS (Story 8.2, Eric ruling 2026-09-15, amendment 10) live at
// the foot of this file: three 40-card lists, one per hull, authored as COUNTS
// through `deckFromCounts` and expanded in LINE_IDS order. With no account
// module they are THE deck every captain and bot sails (server/src/game/
// decks.ts `loadDeckFor`); Epic 9 layers named decks on top. Their legality
// against the four deck rules is checked at load in sim/deckRules.ts.
//
// CATALOG CONTENT IS WIRE CONTRACT: adding, removing or changing any entry
// REQUIRES a PROTOCOL_VERSION bump (shared/src/index.ts). Line ids ride the
// wire and both sides resolve them FAIL-CLOSED (unknown id silently dropped) —
// the PV join gate is the only desync guard.

import { CONFIG, type ShipClassId } from '../constants.js';
import type { EquipmentId } from './loadout.js';
import { EQUIPMENT_IDS, isConsumableId } from './loadout.js';
import {
  BOON_STAT_PATH_SET,
  DOCTRINE_MODES,
  doctrineEffect,
  statEffect,
  type BoonBehaviorEffect,
  type BoonDoctrineEffect,
  type BoonEffect,
  type BoonStatEffect,
  type BoonStockEffect,
  type ConsumableId,
  type DoctrineWeapon,
} from './effects.js';

/**
 * THE 29 LINE IDS, in catalog order (Eric ruling 2026-09-15, amendment 7, as
 * amended by amendments 80/83 on 2026-09-19). This order IS the fold order and
 * the default decks' composition order (`deckFromCounts` expands in it), so it
 * is part of the determinism contract — never re-sort it.
 *
 * STORY 8.13 SWAPPED EXACTLY ONE ID AND MOVED NOTHING. `acousticHoming` is
 * deleted (homing became a tier stat) and `depthCharge` joins; the count stays
 * 29. TWO LINES CHANGED KIND WITHOUT CHANGING SLOT — `supercavTorpedo` became
 * a `consumable` and `foulingMines` became `equipment` — and they KEEP the
 * positions they hold below, because this list's order is the contract and a
 * re-sort would silently re-cut every default deck's composition order. The
 * section headings therefore describe where a line SITS, not what kind it is;
 * the kind is in CATALOG.
 */
export const LINE_IDS = [
  // --- the five universal ladders (catalog-v3 §4) --------------------------
  'armor',
  'speed',
  'turning',
  'radarSweep',
  'reload',
  // --- the deck-gun family (slotless, always fitted) -----------------------
  'deckGun',
  'deckGunTurret',
  'deckGunBarrel',
  // --- the eleven equipment lines (+ one consumable that kept its slot) -----
  'lightTorpedo',
  'heavyTorpedo',
  'supercavTorpedo', // a CONSUMABLE since amendment 74 — slot locked, kind changed
  'navalMines',
  'captiveMines',
  'missile',
  'machineGun',
  'flak',
  'monitor',
  'broadside',
  'starShells',
  // --- the consumables ------------------------------------------------------
  // (plus `supercavTorpedo` above, which KEPT ITS SLOT in this list when its
  // kind changed — see the note on the eleven-equipment block.)
  'hullRepair',
  'shieldBlock',
  'smokeScreen',
  'chaff',
  'decoyBuoy',
  // DEPTH CHARGE takes ACOUSTIC HOMING's place in the 29 (Eric ruling
  // 2026-09-19, epic-8 amendments 80/83): a new STUB consumable, and the Mine
  // Layer's 40th default card.
  'depthCharge',
  // --- the add-ons ----------------------------------------------------------
  // (`foulingMines` sits here too — same reason: its slot is locked, its KIND
  // changed to `equipment` in Story 8.13.)
  'foulingMines',
  'heatSeeking',
  'dazzleShells',
  'phosphorShells',
] as const;

/** One of the 29 authored card lines. */
export type LineId = (typeof LINE_IDS)[number];

/**
 * The four card KINDS of catalog v3 (the refit card's meta word, Eric ruling
 * 2026-09-15 amendment 8): an `equipment` line whose copy 1 fits a weapon, a
 * universal `ladder` of stat steps, an `addon` that bolts a verb onto equipment
 * it names, a `consumable` whose copies stock a rack.
 */
export type LineKind = 'equipment' | 'ladder' | 'addon' | 'consumable';

/**
 * One catalog card LINE.
 *
 * - `cap` — physical copies in the catalog AND `tiers.length` (pinned equal).
 * - `tiers` — copy k applies `tiers[k-1]`. An EMPTY tier is legal and means
 *   "this step exists but 8.1 does not author its content" (every equipment
 *   line's tiers II–V).
 * - `appliesTo` — for an `addon`, the equipment it bolts onto; for the
 *   `deckGun` LADDER, the single equipment row whose TIER its copies advance
 *   (the deck gun is slotless, so it has no `slotFill` to read the target off).
 * - `stub` — the mechanism does not exist yet: never dealt by `buildDeckState()`.
 * - `healOnGrant` — the grant heals the granted maxHp delta (ARMOR only).
 */
export interface CatalogLine {
  id: LineId;
  kind: LineKind;
  cap: number;
  tiers: readonly (readonly BoonEffect[])[];
  appliesTo?: readonly EquipmentId[];
  stub?: true;
  healOnGrant?: true;
}

/** A catalog, keyed by line id. Injectable wherever ids resolve to lines
 *  (tests inject their own); production passes CATALOG. */
export type Catalog = Readonly<Record<string, CatalogLine>>;

/**
 * Freeze the catalog AND EVERY DEPTH BELOW IT (the HOOK_REGISTRY /
 * SIGNAL_REGISTRY deep-freeze discipline, carried all the way down).
 *
 * Freezing the LINE ROWS alone was not enough: `effectiveStats` reads these
 * effect objects on every fold, on BOTH sides, so a single stray write to
 * `CATALOG.armor.tiers[0][0].add` is a permanent, silent, cross-match stat
 * change — and a desync, because only the side that ran the write has it. The
 * whole tree is shared read-only data; it is frozen as such.
 */
function deepFreezeLine(line: CatalogLine): CatalogLine {
  for (const tier of line.tiers) {
    for (const effect of tier) Object.freeze(effect);
    Object.freeze(tier);
  }
  Object.freeze(line.tiers);
  if (line.appliesTo !== undefined) Object.freeze(line.appliesTo);
  return Object.freeze(line);
}

/** Deep-freeze every line of a built catalog, then the catalog itself. */
const deepFreezeRows = (rows: Record<string, CatalogLine>): Catalog => {
  for (const key of Object.keys(rows)) {
    const line = rows[key];
    if (line !== undefined) deepFreezeLine(line);
  }
  return Object.freeze(rows);
};

// ---------------------------------------------------------------------------
// Authoring helpers. Every NUMBER below cites its catalog-v3 line; nothing is
// invented (Story 8.1 block condition).
// ---------------------------------------------------------------------------

/** A universal ladder: `cap` identical steps of `effects`. */
function ladder(
  id: LineId,
  cap: number,
  effects: readonly BoonEffect[],
  extra: { healOnGrant?: true; appliesTo?: readonly EquipmentId[] } = {},
): CatalogLine {
  // A FRESH ARRAY PER TIER (never one shared `effects` reference repeated):
  // shared tier arrays make `tiers[0] === tiers[1]`, so any future per-tier
  // edit — or any deep-freeze reasoning — silently applies to all of them.
  const tiers = Array.from({ length: cap }, () => [...effects] as readonly BoonEffect[]);
  return { id, kind: 'ladder', cap, tiers, ...extra };
}

/**
 * An equipment line with NO authored ladder: copy 1 fits `equipmentId` (tier I
 * = the bare weapon, catalog-v3 §4 standing rule) and tiers II–V are EMPTY
 * until the line's own story authors them. `stub` marks a weapon whose module
 * does not exist yet.
 */
function weapon(id: LineId, equipmentId: EquipmentId, stub?: true): CatalogLine {
  const tiers: readonly BoonEffect[][] = [[{ kind: 'slotFill', equipmentId }], [], [], [], []];
  const line: CatalogLine = { id, kind: 'equipment', cap: 5, tiers };
  return stub === undefined ? line : { ...line, stub };
}

/**
 * An equipment line WITH its ladder: copy 1 fits the weapon and tiers II–V
 * each apply `step` — which is exactly how catalog-v3 §4 writes an equipment
 * row ("Tiers II–V, each: …"), so the sheet's one line is one line here.
 *
 * THE RELOAD STEP IS NOT IN `step` AND NEVER WILL BE. Every equipment line
 * drops −5 % of its own base reload per tier, and that is DERIVED from the
 * row's tier in sim/stats.ts `reloadTierScale` — one derivation in the engine
 * rather than the same effect restated on four tiers of five lines.
 *
 * A FRESH ARRAY PER TIER (the `ladder` law, and for the same reason); the
 * effect objects themselves are shared and deep-frozen, like a ladder's.
 */
function tieredWeapon(id: LineId, equipmentId: EquipmentId, step: readonly BoonEffect[]): CatalogLine {
  const slotFill: BoonEffect = { kind: 'slotFill', equipmentId };
  const tiers: readonly (readonly BoonEffect[])[] = [
    [slotFill],
    ...Array.from({ length: 4 }, () => [...step] as readonly BoonEffect[]),
  ];
  return { id, kind: 'equipment', cap: 5, tiers };
}

/** A one-copy add-on: one `doctrine` verb per equipment it applies to. */
function addon(id: LineId, appliesTo: readonly DoctrineWeapon[], mode: string, stub?: true): CatalogLine {
  const tiers = [appliesTo.map((eq) => doctrineEffect(eq, mode))];
  const line: CatalogLine = { id, kind: 'addon', cap: 1, tiers, appliesTo };
  return stub === undefined ? line : { ...line, stub };
}

/** A cap-5 consumable: every copy stocks one use. `stub` marks a consumable
 *  whose EFFECT does not exist yet — the belt itself is built (Story 8.7) and
 *  HULL REPAIR's effect landed with Story 8.8, so the flag is now passed
 *  line-by-line exactly as `weapon()`/`addon()` pass it. */
function consumable(id: LineId & ConsumableId, stub?: true): CatalogLine {
  const stock: BoonStockEffect = { kind: 'stock', equipmentId: id };
  // A fresh tier array AND a fresh effect object per copy (see `ladder`).
  const tiers = Array.from({ length: 5 }, () => [{ ...stock }] as readonly BoonEffect[]);
  const line: CatalogLine = { id, kind: 'consumable', cap: 5, tiers };
  return stub === undefined ? line : { ...line, stub };
}

/**
 * THE production catalog — catalog v3. Key order IS `LINE_IDS` order (pinned).
 *
 * Every authored number cites its ruling:
 *   ARMOR   R8  — +25 max hp per tier, 4 tiers, heals on grant.
 *   SPEED   R10 — +2.5 u/s forward max per tier, 4 tiers, reverse untouched.
 *   TURNING R6  — flat +0.05 rad/s per tier, 4 tiers. [DRAFT]
 *   RADAR SWEEP R11 — +3 rpm per tier, 5 tiers (the 30 rpm clamp stays).
 *   RELOAD  R12 — −5 % per tier, 5 tiers, cap 25 % (cooldownScale 1.0 → 0.75).
 *   DECK GUN R14 — +1.25 damage AND −5 % own reload per tier, 4 tiers; the
 *                  reload half is DERIVED from the tier in clampStats.
 *   DECK GUN TURRET R15 — pool 1 → 2, one copy.
 *   DECK GUN BARREL R16 — +1 barrel per copy, two copies.
 *   HEAT SEEKING R32 · DAZZLE / PHOSPHOR SHELLS R33.
 *   LIGHT TORPEDO R18 · HEAVY TORPEDO R17 · NAVAL MINES R23/R24 ·
 *   CAPTIVE MINES R25 · FOULING MINES R28 (as amended) — Story 8.13.
 */
export const CATALOG: Catalog = deepFreezeRows({
  // --- the five universal ladders ------------------------------------------
  // ARMOR (R8): +25 max hp per tier, 4 tiers (TB 350 / ML 400 / BS 450 at cap);
  // the grant HEALS the granted delta — still the ONLY heal path.
  armor: ladder('armor', 4, [statEffect('maxHp', { add: 25 })], { healOnGrant: true }),
  // SPEED (R10): +2.5 u/s of FORWARD top speed per tier, 4 tiers. Reverse is
  // explicitly untouched — no constant add preserves the reverse:forward ratio
  // across three hulls.
  speed: ladder('speed', 4, [statEffect('kinematics.maxSpeed', { add: 2.5 })]),
  // TURNING (R6): flat +0.05 rad/s per tier, 4 tiers (+0.2 at the cap — flat,
  // not proportional, so it helps the slow hulls most). // [DRAFT] — first-pass
  // value, harness-tuned once bots run v3 decks.
  turning: ladder('turning', 4, [statEffect('kinematics.turnRate', { add: 0.05 })]),
  // RADAR SWEEP (R11): +3 rpm per tier, 5 tiers, 15 → 30 rpm. The ratified
  // 30 rpm ceiling stays in clampStats and is what makes a 6th copy impossible
  // to exploit even if one existed.
  radarSweep: ladder('radarSweep', 5, [statEffect('sweepRpm', { add: 3 })]),
  // RELOAD (R12): −5 % per tier, 5 tiers, cap 25 % — cooldownScale 1.0 → 0.75
  // exactly (round3 in clampStats kills the additive float dust). ADDITIVE, so
  // stacking is linear rather than 0.95^N. Scope (R40): every equipment reload
  // AND the Shift boost cooldown; consumables have no reload.
  reload: ladder('reload', 5, [statEffect('cooldownScale', { add: -0.05 })]),
  // --- the deck-gun family --------------------------------------------------
  // DECK GUN (R14): +1.25 damage per tier, 4 tiers, FLOORED once after the fold
  // (effects.ts EQUIPMENT_INT_FIELDS) so the gun deals Eric's whole-number
  // scale 15 → 16 → 17 → 18 → 20 — never 16.25 / 17.5 / 18.75 (epic-8
  // amendment 39: catalog-v3 R14's "Eric wrote it rounded" was the error; his
  // integers ARE the scale). The OTHER half of
  // the line — −5 % own reload per tier — is NOT an effect: it is derived from
  // `equipment.gun.tier` in clampStats, exactly as every equipment line's step
  // is, so there is one reload derivation in the engine rather than two.
  // `appliesTo: ['gun']` is how this ladder names the row whose tier it moves.
  deckGun: ladder('deckGun', 4, [statEffect('equipment.gun.damage', { add: 1.25 })], { appliesTo: ['gun'] }),
  // DECK GUN TURRET (R15): the gun pool 1 → 2, one copy.
  deckGunTurret: ladder('deckGunTurret', 1, [statEffect('equipment.gun.maxAmmo', { add: 1 })]),
  // DECK GUN BARREL (R16): +1 barrel per copy, two copies (1 → 3 parallel
  // shells 12u apart, full damage each).
  deckGunBarrel: ladder('deckGunBarrel', 2, [statEffect('equipment.gun.barrels', { add: 1 })]),
  // --- the eleven equipment lines (+ supercavTorpedo, which kept its slot) ---
  // Copy 1 fits the weapon. The TORPEDO AND MINE ladders below are Story
  // 8.13's (catalog-v3 §4 as amended by Eric's 2026-09-19 rulings, epic-8
  // amendments 74/77/80/81/82); the gun family's are Story 8.14's and the
  // broadside/star-shell ones Story 8.16's, so those tiers are still empty.
  //
  // LIGHT TORPEDO (R18): tiers II–V each +5 damage, +2.5 u/s, +0.5 tubes and
  // +0.125 rad/s of homing — 60 dmg / 55 u/s / 3 tubes / 0.5 rad/s at V, on a
  // 20 s reload. HOMING IS A TIER STAT, NOT A CARD (amendment 80).
  lightTorpedo: tieredWeapon('lightTorpedo', 'lightTorpedo', [
    statEffect('equipment.lightTorpedo.damage', { add: 5 }),
    statEffect('equipment.lightTorpedo.speed', { add: 2.5 }),
    statEffect('equipment.lightTorpedo.maxAmmo', { add: 0.5 }),
    statEffect('equipment.lightTorpedo.homingTurnRate', { add: 0.125 }),
  ]),
  // HEAVY TORPEDO (R17): the shipped torpedo, renamed — the SAME four steps on
  // its own paths: 70 dmg / 75 u/s / 3 tubes / 0.5 rad/s at V, 24 s reload.
  heavyTorpedo: tieredWeapon('heavyTorpedo', 'heavyTorpedo', [
    statEffect('equipment.heavyTorpedo.damage', { add: 5 }),
    statEffect('equipment.heavyTorpedo.speed', { add: 2.5 }),
    statEffect('equipment.heavyTorpedo.maxAmmo', { add: 0.5 }),
    statEffect('equipment.heavyTorpedo.homingTurnRate', { add: 0.125 }),
  ]),
  // SUPERCAV TORPEDO (R19 as superseded by amendment 74): a CONSUMABLE, not an
  // equipment line — a prime-and-click belt fish with no reload and no tiers.
  // It keeps its LINE_IDS slot (see there) and its five copies are five uses.
  supercavTorpedo: consumable('supercavTorpedo'),
  // NAVAL MINES (R23/R24): the shipped mine, renamed — tiers II–V each +5
  // damage, ×1.1 blast (the 2/3 trip ring follows it) and +1 held: 75 dmg,
  // 70.3 u blast / 46.9 u trip, 6 held, 12 s at V. IT NO LONGER FOULS
  // (amendment 81).
  navalMines: tieredWeapon('navalMines', 'navalMines', [
    statEffect('equipment.navalMines.damage', { add: 5 }),
    statEffect('equipment.navalMines.blastRadius', { mult: 1.1 }),
    statEffect('equipment.navalMines.maxAmmo', { add: 1 }),
  ]),
  // CAPTIVE MINES (R25, amendments 77/82/84d): tiers II–V each +5 fish damage,
  // +0.5 held and +0.075 rad/s of homing — 75 dmg, 3 held, 0.3 rad/s, 16 s at
  // V. THE TRIP RING'S ×1.1 STEP IS NOT AN EFFECT: it is derived from the
  // row's tier in sim/stats.ts (144 → 210.8 u), and the 32 u burst is fixed.
  captiveMines: tieredWeapon('captiveMines', 'captiveMines', [
    statEffect('equipment.captiveMines.damage', { add: 5 }),
    statEffect('equipment.captiveMines.maxAmmo', { add: 0.5 }),
    statEffect('equipment.captiveMines.homingTurnRate', { add: 0.075 }),
  ]),
  missile: weapon('missile', 'missile', true), // R29 — Story 8.14
  machineGun: weapon('machineGun', 'machineGun', true), // R20/R21 — Story 8.14
  flak: weapon('flak', 'flak', true), // R26/R27 — Story 8.14
  monitor: weapon('monitor', 'monitor', true), // R30 — Story 8.14
  broadside: weapon('broadside', 'broadside'), // R35 — shipped
  starShells: weapon('starShells', 'starShells'), // R31 — shipped
  // --- the consumables (R13, R36–R39, + amendments 74/83) -------------------
  // The belt and the `1`–`4` keys are built (Story 8.7). HULL REPAIR (R13) was
  // the first LIVE line — its effect is Story 8.8's — and SUPERCAV TORPEDO
  // (above) is the second; the rest are still stubs until their effects land.
  hullRepair: consumable('hullRepair'), // R13 — 50 instant + 50 pooled (CONFIG.hullRepair)
  shieldBlock: consumable('shieldBlock', true),
  smokeScreen: consumable('smokeScreen', true),
  chaff: consumable('chaff', true),
  decoyBuoy: consumable('decoyBuoy', true),
  // DEPTH CHARGE (amendment 83): Eric's line, mechanism a later story — a STUB
  // in full shape so the id is final, and the Mine Layer's 40th default card.
  depthCharge: consumable('depthCharge', true),
  // --- the add-ons (+ foulingMines, which kept its slot) --------------------
  // FOULING MINES (R28 as superseded by amendment 81): its OWN tiered
  // EQUIPMENT line now, not an add-on — tiers II–V each ×1.1 blast (the trip
  // ring follows), +1 held and −0.05 slow factor. Damage is FIXED at 10 and
  // the 5 s window never moves; only the depth of the slow does (×0.55 at V).
  // UNHOMED: it sits in no default deck.
  foulingMines: tieredWeapon('foulingMines', 'foulingMines', [
    statEffect('equipment.foulingMines.blastRadius', { mult: 1.1 }),
    statEffect('equipment.foulingMines.maxAmmo', { add: 1 }),
    statEffect('equipment.foulingMines.slowFactor', { add: -0.05 }),
  ]),
  // HEAT SEEKING (R32): the homing verb on the missile. Stub — the missile
  // itself is Story 8.14, which is also where Eric rules on this card
  // (*"I will revisit this when we get back to missiles."*, amendment 80).
  heatSeeking: addon('heatSeeking', ['missile'], 'homing', true),
  // DAZZLE (R33): enemies inside the lit zone see at ×0.5; never changes the
  // lit radius. Stacks with phosphor on one flare.
  dazzleShells: addon('dazzleShells', ['starShells'], 'dazzle'),
  // PHOSPHOR (R33/R34): 5 hp/s burn inside 0.8× the lit radius; never changes
  // the lit radius.
  phosphorShells: addon('phosphorShells', ['starShells'], 'phosphor'),
});

/** The immutable zero-cards list — the shared allocation-free identity for
 *  every zero-card fast path (server record cache, client resolve). */
export const NO_CARDS: readonly LineId[] = Object.freeze([]);

/** True iff `id` names a STUB line — authored in shape, mechanism not built,
 *  never dealt into a deck (and therefore never offered). */
export function isStubLine(id: string, catalog: Catalog = CATALOG): boolean {
  if (!Object.hasOwn(catalog, id)) return false;
  return catalog[id]?.stub === true;
}

/**
 * Resolve a card-id list to its catalog lines, FAIL-CLOSED: an unknown id is
 * silently dropped (never a throw — a junk id on the wire must not take the
 * client down), known ids keep list order, REPEATED ids resolve each time
 * (that is how copies stack).
 */
export function resolveCards(ids: readonly string[], catalog: Catalog = CATALOG): readonly CatalogLine[] {
  const out: CatalogLine[] = [];
  for (const id of ids) {
    // OWN-PROPERTY ONLY: a plain-object catalog answers `catalog['constructor']`
    // with Object.prototype.constructor. Object.hasOwn is the fail-closed gate
    // on EVERY catalog/registry lookup in the engine.
    if (!Object.hasOwn(catalog, id)) continue;
    const line = catalog[id];
    if (line !== undefined) out.push(line);
  }
  return out;
}

/**
 * Copies held per LINE, capped at each line's `cap`, in CATALOG key order —
 * THE structure the stat fold consumes. Counting first and folding in catalog
 * order (never card-list order) is what makes `effectiveStats` byte-identical
 * under any permutation of the same multiset. Unknown ids are dropped.
 */
export function cardCounts(ids: readonly string[], catalog: Catalog = CATALOG): Map<string, number> {
  const raw = new Map<string, number>();
  for (const id of ids) {
    if (!Object.hasOwn(catalog, id)) continue;
    raw.set(id, (raw.get(id) ?? 0) + 1);
  }
  const counts = new Map<string, number>();
  for (const key of Object.keys(catalog)) {
    const n = raw.get(key);
    const line = catalog[key];
    if (n === undefined || line === undefined) continue;
    counts.set(key, Math.min(n, line.cap));
  }
  return counts;
}

/** Occurrences of `id` in a fitted-card list — THE stack count (repeats are
 *  legal; `cap` caps them physically via the deck). */
export function boonStackCount(cards: readonly string[], id: string): number {
  let n = 0;
  for (const c of cards) if (c === id) n += 1;
  return n;
}

/**
 * The equipment row whose TIER a line's copies advance, or undefined. An
 * `equipment` line reads it off copy 1's `slotFill`; the DECK GUN ladder names
 * it in `appliesTo` (it is slotless, so it has no slotFill to read). Add-ons
 * have `appliesTo` too and deliberately do NOT advance any tier — they bolt a
 * verb on, they are not a rung.
 */
export function tierTargetOf(line: CatalogLine): EquipmentId | undefined {
  if (line.kind === 'equipment') {
    const fill = line.tiers[0]?.find((e) => e.kind === 'slotFill');
    return fill?.kind === 'slotFill' ? fill.equipmentId : undefined;
  }
  if (line.kind === 'ladder') return line.appliesTo?.[0];
  return undefined;
}

/**
 * The EQUIPMENT LINE that fits a piece of equipment — the inverse of
 * `tierTargetOf` over the `equipment` lines, and the ONE place the
 * (EquipmentId -> LineId) mapping is derived. Undefined for a piece of
 * equipment no card fits (`gun`, `boost`, and the legacy `radarBuoy`).
 *
 * It is what lets the spawn seed know which cards a hull is ALREADY holding,
 * and what lets the shared slot fold refuse to fit a STUB weapon, without
 * either of them restating the mapping. `validateCatalog` pins it single-valued
 * (no two lines may target one row), so the first match is the only match.
 */
export function lineForEquipment(eq: EquipmentId, catalog: Catalog = CATALOG): CatalogLine | undefined {
  for (const key of Object.keys(catalog)) {
    const line = catalog[key];
    if (line !== undefined && line.kind === 'equipment' && tierTargetOf(line) === eq) return line;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Authoring-time validation. Pure and throw-free: every validator returns a
// list of human-readable problems (empty = valid). Run over CATALOG in tests,
// and available to any tool that authors an injected catalog.
// ---------------------------------------------------------------------------

const EQUIPMENT_ID_SET: ReadonlySet<string> = new Set(EQUIPMENT_IDS);
// The consumable membership test is `isConsumableId` (sim/loadout.ts, Story
// 8.7) — the ONE guard every reader of a slot's content already narrows
// through, over the same CONSUMABLE_IDS list. No second set here.
const LINE_KINDS: readonly string[] = ['equipment', 'ladder', 'addon', 'consumable'];

/** Problems with one STAT effect. */
function validateStatEffect(e: BoonStatEffect, tag: string): string[] {
  const errs: string[] = [];
  if (!BOON_STAT_PATH_SET.has(e.path)) errs.push(`${tag}: off-whitelist stat path '${e.path}'`);
  if (e.mult === undefined && e.add === undefined) errs.push(`${tag}: stat effect moves nothing`);
  if (e.mult !== undefined && (!Number.isFinite(e.mult) || e.mult <= 0)) errs.push(`${tag}: mult must be finite and > 0`);
  if (e.add !== undefined && (!Number.isFinite(e.add) || e.add === 0)) errs.push(`${tag}: add must be finite and non-zero`);
  return errs;
}

/** Problems with one DOCTRINE effect. */
function validateDoctrineEffect(e: BoonDoctrineEffect, tag: string): string[] {
  if (!Object.hasOwn(DOCTRINE_MODES, e.weapon)) return [`${tag}: doctrine on non-doctrine equipment '${e.weapon}'`];
  const modes = DOCTRINE_MODES[e.weapon as DoctrineWeapon] as readonly string[];
  if (!modes.includes(e.mode)) return [`${tag}: unknown doctrine mode '${e.mode}' for '${e.weapon}'`];
  return [];
}

/** Problems with one BEHAVIOR effect. */
function validateBehaviorEffect(e: BoonBehaviorEffect, tag: string): string[] {
  if (typeof e.hookId !== 'string' || e.hookId.length === 0) return [`${tag}: behavior needs a hookId`];
  return [];
}

/** Problems with one EFFECT of a line. */
function validateEffect(e: BoonEffect, tag: string): string[] {
  if (e.kind === 'stat') return validateStatEffect(e, tag);
  if (e.kind === 'slotFill') {
    return EQUIPMENT_ID_SET.has(e.equipmentId) ? [] : [`${tag}: slotFill of unknown equipment '${e.equipmentId}'`];
  }
  if (e.kind === 'doctrine') return validateDoctrineEffect(e, tag);
  if (e.kind === 'stock') {
    return isConsumableId(e.equipmentId) ? [] : [`${tag}: stock of unknown consumable '${e.equipmentId}'`];
  }
  if (e.kind === 'behavior') return validateBehaviorEffect(e, tag);
  return [`${tag}: unknown effect kind`];
}

/** Problems with a line's optional flags (helper of validateShape). */
function validateFlags(line: CatalogLine): string[] {
  const errs: string[] = [];
  if (line.stub !== undefined && line.stub !== true) errs.push(`${line.id}: stub may only be true`);
  for (const eq of line.appliesTo ?? []) {
    if (!EQUIPMENT_ID_SET.has(eq)) errs.push(`${line.id}: appliesTo unknown equipment '${eq}'`);
  }
  if (line.healOnGrant !== undefined && line.healOnGrant !== true) errs.push(`${line.id}: healOnGrant may only be true`);
  if (line.healOnGrant === true) {
    const heals = line.tiers.some((t) => t.some((e) => e.kind === 'stat' && e.path === 'maxHp' && (e.add ?? 0) > 0));
    if (!heals) errs.push(`${line.id}: healOnGrant requires a positive maxHp add effect`);
  }
  return errs;
}

/** The two per-KIND shape rules (helper of validateShape).
 *
 *  A LADDER's `appliesTo` names the ONE equipment row whose tier its copies
 *  advance, and `tierTargetOf` reads `appliesTo[0]` — so a second entry is
 *  silently ignored, which is how a reader comes to believe a ladder moves two
 *  weapons' tiers when it moves one.
 *
 *  Copy 1 of an EQUIPMENT line IS the weapon (catalog-v3 §4). Without a
 *  slotFill on tier I the line fits nothing, has no tier target, and every copy
 *  of it is a dead card. */
function validateKindShape(line: CatalogLine): string[] {
  if (line.kind === 'ladder' && (line.appliesTo?.length ?? 0) > 1) {
    return [`${line.id}: a ladder may name at most ONE appliesTo equipment`];
  }
  if (line.kind === 'equipment' && !(line.tiers[0] ?? []).some((e) => e.kind === 'slotFill')) {
    return [`${line.id}: an equipment line needs a slotFill on copy 1`];
  }
  return [];
}

/** Problems with a line's kind/cap/tiers row. THE `tiers.length === cap` PIN
 *  lives here: copy k applies tiers[k-1], so a short ladder would silently give
 *  the last copies nothing and a long one would author unreachable steps. */
function validateShape(line: CatalogLine): string[] {
  const errs: string[] = [];
  if (!LINE_KINDS.includes(line.kind)) errs.push(`${line.id}: unknown kind '${line.kind}'`);
  if (!Number.isInteger(line.cap) || line.cap < 1) errs.push(`${line.id}: cap must be an integer ≥ 1`);
  if (line.tiers.length !== line.cap) errs.push(`${line.id}: tiers.length ${line.tiers.length} ≠ cap ${line.cap}`);
  errs.push(...validateKindShape(line));
  errs.push(...validateFlags(line));
  return errs;
}

/**
 * Validate ONE catalog line (authoring-time). Returns problems, empty = valid:
 * camelCase id, known kind, `tiers.length === cap`, valid effects, coherent
 * `healOnGrant`, real `appliesTo` equipment.
 */
export function validateLine(line: CatalogLine): string[] {
  const errs: string[] = [];
  if (typeof line.id !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(line.id)) errs.push(`'${String(line.id)}': id must be camelCase`);
  line.tiers.forEach((tier, t) => {
    tier.forEach((e, i) => errs.push(...validateEffect(e, `${line.id} tier ${t + 1}[${i}]`)));
  });
  errs.push(...validateShape(line));
  return errs;
}

/**
 * THE ORDER-INDEPENDENCE RULE (Story 8.1). `effectiveStats` folds lines in
 * CATALOG order, so a permutation of the CARD LIST can never change the
 * result — but a path that takes `add` from one line and `mult` from another
 * is still a latent order hazard the moment anything reorders the catalog, and
 * it makes the two ladders' interaction impossible to reason about. So it is
 * refused at authoring time, across lines AND across tiers.
 */
function validateNoAddMultCollision(catalog: Catalog): string[] {
  const adders = new Map<string, string>();
  const multipliers = new Map<string, string>();
  for (const [line, e] of everyStatEffect(catalog)) {
    if (e.add !== undefined) adders.set(e.path, adders.get(e.path) ?? line.id);
    if (e.mult !== undefined) multipliers.set(e.path, multipliers.get(e.path) ?? line.id);
  }
  const errs: string[] = [];
  for (const [path, addLine] of adders) {
    const multLine = multipliers.get(path);
    if (multLine !== undefined) {
      errs.push(`stat path '${path}' takes add (${addLine}) and mult (${multLine}) — order-dependent, refused`);
    }
  }
  return errs;
}

/** Every `stat` effect in a catalog, paired with the line that authored it. */
function everyStatEffect(catalog: Catalog): [CatalogLine, BoonStatEffect][] {
  const out: [CatalogLine, BoonStatEffect][] = [];
  for (const key of Object.keys(catalog)) {
    const line = catalog[key];
    if (line === undefined) continue;
    for (const tier of line.tiers) {
      for (const e of tier) if (e.kind === 'stat') out.push([line, e]);
    }
  }
  return out;
}

/**
 * THE CROSS-LINE RULES — the two mistakes no single line can see.
 *
 *  1. ONE TIER OWNER PER EQUIPMENT ROW. `equipment[id].tier` is written by
 *     whichever line claims that row, and the fold walks the catalog in key
 *     order — so two claimants means the LATER one overwrites the earlier, and
 *     which card actually moves the tier becomes a fact about catalog order.
 *     It also makes `lineForEquipment` ambiguous.
 *  2. NO LIVE ADD-ON ON DEAD EQUIPMENT. An add-on bolts a verb onto the
 *     equipment it names; if EVERY line it names is a stub, the card is dealt
 *     into live decks (it is not a stub itself) and buys nothing. An add-on
 *     with at least one live target is fine. A STUB add-on is exempt — it is
 *     never dealt either, so HEAT SEEKING may name the still-stub missile.
 */
function validateCrossLine(catalog: Catalog): string[] {
  const errs: string[] = [];
  const owners = new Map<string, string>();
  for (const key of Object.keys(catalog)) {
    const line = catalog[key];
    if (line === undefined) continue;
    const target = tierTargetOf(line);
    if (target !== undefined) {
      const owner = owners.get(target);
      if (owner !== undefined) errs.push(`two lines advance the tier of '${target}' (${owner}, ${line.id})`);
      else owners.set(target, line.id);
    }
    if (line.kind !== 'addon' || line.stub === true) continue;
    const targets = line.appliesTo ?? [];
    const live = targets.filter((eq) => {
      const owner = lineForEquipment(eq, catalog);
      return owner === undefined || owner.stub !== true;
    });
    if (targets.length > 0 && live.length === 0) {
      errs.push(`${line.id}: live add-on applies only to STUB equipment (${targets.join(', ')})`);
    }
  }
  return errs;
}

/**
 * Validate a whole catalog: every line valid, every key equal to its line's id,
 * NO stat path receiving both `add` and `mult`, and the cross-line rules above.
 * Returns problems, empty = valid. The production CATALOG passes — pinned in
 * catalog.test.ts AND enforced AT MODULE LOAD at the foot of this file.
 */
export function validateCatalog(catalog: Catalog = CATALOG): string[] {
  const errs: string[] = [];
  for (const key of Object.keys(catalog)) {
    const line = catalog[key];
    if (line === undefined) continue;
    if (line.id !== key) errs.push(`catalog key '${key}' does not match line id '${line.id}'`);
    errs.push(...validateLine(line));
  }
  errs.push(...validateNoAddMultCollision(catalog));
  errs.push(...validateCrossLine(catalog));
  return errs;
}

/** Total physical cards in a catalog (Σ cap) — 114 for catalog v3. */
export function catalogCardCount(catalog: Catalog = CATALOG): number {
  let n = 0;
  for (const key of Object.keys(catalog)) n += catalog[key]?.cap ?? 0;
  return n;
}

/**
 * THE CATALOG IS VALIDATED AT LOAD (the sim/arcs.ts `sectorArcFor` and
 * sim/stats.ts broadside-ladder convention): an authoring error throws where it
 * is authored, on the first import, on BOTH sides — rather than surfacing as a
 * dead card, a silently overwritten tier or a desync in a live match. The test
 * suite pins the same call, so a broken edit fails the gate twice.
 */
const CATALOG_PROBLEMS = validateCatalog(CATALOG);
if (CATALOG_PROBLEMS.length > 0) throw new Error(CATALOG_PROBLEMS.join('\n'));

// ---------------------------------------------------------------------------
// THE DEFAULT DECKS (Story 8.2 — Eric ruling 2026-09-15, epic-8 amendment 10,
// delivered as a spreadsheet and transcribed count for count). Authored as
// COUNTS so the file reads like the sheet; `deckFromCounts` expands them into
// the frozen 40-id list the door freezes into a seat reservation.
// ---------------------------------------------------------------------------

/** Copies per line, the authoring shape of a deck (absent = 0). */
export type DeckCounts = Partial<Readonly<Record<LineId, number>>>;

/** LINE_IDS as a set — the membership test `deckFromCounts` expands against. */
const LINE_ID_SET: ReadonlySet<string> = new Set<string>(LINE_IDS);

/**
 * Expand a counts table into a frozen card list in LINE_IDS order. Refuses,
 * AT MODULE LOAD, a count that is not a non-negative integer, a count over the
 * line's cap, and a total other than CONFIG.deck.size — the three authoring
 * slips a spreadsheet transcription can make. (The full four-rule legality
 * check, which also needs the OWNED set, runs in sim/deckRules.ts.)
 *
 * THE UNKNOWN-KEY CHECK IS AGAINST `LINE_IDS`, NOT THE CATALOG, because the
 * EXPANSION is: the loop below walks LINE_IDS, so a count keyed by anything
 * outside it can never become a card. Checking an INJECTED catalog instead
 * (which a test may give a line LINE_IDS does not list) admitted such a key
 * and then silently dropped its copies — the deck came back short rather than
 * wrong, which is exactly the kind of quiet transcription slip this helper
 * exists to refuse.
 */
export function deckFromCounts(counts: DeckCounts, catalog: Catalog = CATALOG): readonly LineId[] {
  for (const id of Object.keys(counts)) {
    if (!LINE_ID_SET.has(id)) throw new Error(`deckFromCounts: unknown line '${id}' (not in LINE_IDS)`);
  }
  const out: LineId[] = [];
  for (const id of LINE_IDS) {
    const n = checkedCount(id, counts[id] ?? 0, catalog);
    for (let i = 0; i < n; i += 1) out.push(id);
  }
  if (out.length !== CONFIG.deck.size) {
    throw new Error(`deckFromCounts: ${out.length} cards, a deck is ${CONFIG.deck.size}`);
  }
  return Object.freeze(out);
}

/** One authored count, validated: a non-negative integer at or under cap. */
function checkedCount(id: LineId, n: number, catalog: Catalog): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`deckFromCounts: ${id} count ${String(n)} is not a non-negative integer`);
  }
  const cap = catalog[id]?.cap ?? 0;
  if (n > cap) throw new Error(`deckFromCounts: ${id} ×${n} exceeds its cap ${cap}`);
  return n;
}

/** The 30 cards every default deck carries (amendment 10). */
const UNIVERSAL_COUNTS: DeckCounts = {
  armor: 3,
  speed: 3,
  turning: 3,
  radarSweep: 3,
  reload: 3,
  hullRepair: 3,
  shieldBlock: 3,
  smokeScreen: 2,
  chaff: 2,
  deckGun: 2,
  deckGunTurret: 1,
  deckGunBarrel: 2,
};

/**
 * THE THREE DEFAULT DECKS, keyed by hull (amendment 10, re-cut for the Torpedo
 * Boat and the Mine Layer by amendments 80 and 83): the 30 universal cards
 * plus ten per hull — three equipment lines at three copies, then ONE last
 * card. 40 cards each, exactly three equipment lines (so
 * `CONFIG.deck.maxEquipmentLines` stays 3), every count at or under cap.
 *
 * THE FORTIETH CARD IS NO LONGER ALWAYS AN ADD-ON. The Torpedo Boat's was
 * ACOUSTIC HOMING, which is deleted — Eric: *"Give them one supercavitating
 * torpedo."* — and the Mine Layer's was the FOULING MINES add-on, which became
 * its own (unhomed) equipment line — Eric: *"just stub a fucking depth
 * charge"*, then *"WOAH. Depth charge will be a CONSUMABLE. not a line."* So
 * both hulls now close their deck with a single CONSUMABLE copy.
 *
 * UNHOMED (in no default): `foulingMines`, `broadside`, `decoyBuoy`,
 * `heatSeeking`, `phosphorShells`. Frozen at every depth.
 */
export const DEFAULT_DECKS: Readonly<Record<ShipClassId, readonly LineId[]>> = Object.freeze({
  torpedoBoat: deckFromCounts({ ...UNIVERSAL_COUNTS, lightTorpedo: 3, heavyTorpedo: 3, machineGun: 3, supercavTorpedo: 1 }),
  mineLayer: deckFromCounts({ ...UNIVERSAL_COUNTS, navalMines: 3, captiveMines: 3, flak: 3, depthCharge: 1 }),
  battleship: deckFromCounts({ ...UNIVERSAL_COUNTS, missile: 3, monitor: 3, starShells: 3, dazzleShells: 1 }),
});

/**
 * A FRESH ACCOUNT'S UNLOCKS: the union of the three default decks' line ids
 * (24 of the 29 lines — it gained `supercavTorpedo` and `depthCharge` and lost
 * `acousticHoming` and `foulingMines` in Story 8.13; the count did not move). With no account module this is the `owned` set every
 * door checks a deck against (server/src/game/decks.ts); Epic 9's collection
 * grows it per account.
 *
 * IMMUTABLE FOR REAL, NOT JUST BY TYPE. `ReadonlySet<LineId>` is a
 * compile-time promise and `Object.freeze` does NOT close a Set: freezing
 * locks the object's own properties, while `add`/`delete`/`clear` mutate
 * INTERNAL slots and go on working. This is the legality authority `checkDeck`
 * consults at the door, so one `DEFAULT_OWNED.add(...)` anywhere — a stray
 * line in a test, a JS caller with no types — would silently unlock a line for
 * every captain on the server for the rest of the process. The three mutators
 * are therefore replaced with throwing own properties BEFORE the freeze; every
 * read path (`has`, iteration, `size`) is untouched.
 */
export const DEFAULT_OWNED: ReadonlySet<LineId> = sealOwnedSet(
  new Set<LineId>(Object.values(DEFAULT_DECKS).flat()),
);

/** Replace a Set's mutators with throwers, then freeze it (see DEFAULT_OWNED). */
function sealOwnedSet(set: Set<LineId>): ReadonlySet<LineId> {
  const refuse = (): never => {
    throw new Error('DEFAULT_OWNED is immutable');
  };
  for (const name of ['add', 'delete', 'clear'] as const) {
    Object.defineProperty(set, name, { value: refuse, writable: false, configurable: false, enumerable: false });
  }
  return Object.freeze(set);
}

