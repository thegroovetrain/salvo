// THE CATALOG (Story 8.1) — catalog v3, Eric's authored sheet
// (`_bmad-output/planning-artifacts/gdds/.../catalog-v3.md`) expressed as data,
// as amended by Eric's rulings (epic-8 amendments).
// 26 card LINES / 127 physical cards: 8 equipment lines (40), 8 universal
// ladders (40), the gun ladders (12 — CANNON, MACHINE GUN and FLAK, 4 each),
// 0 add-ons, 7 consumables (35).
//
// THE COUNT MOVED 25/122 -> 26/127 IN STORY 9.9 (Eric 2026-10-14/15, epic-9
// amendments 144–145): the new ARMOR PIERCING ladder (cap 5, +20 Armor
// Piercing per card) joins directly after ARMOR, whose step rose +1 -> +20
// with K 5 -> 100 (every 9.7 ratio preserved). Every other line keeps its
// relative order.
//
// THE COUNT MOVED 24/117 -> 25/122 IN STORY 9.7 (Eric 2026-10-13, epic-9
// amendments 86–89): the new ARMOR ladder (cap 5, +1 Armor per card) joins
// directly after HULL POINTS. Every other line keeps its relative order.
// ONE stub line remains since Story 8.18 (DEPTH CHARGE — SMOKE SCREEN went
// live); every other line is live, so 6 of the 7 consumables are live.
// Story 9.3 (Eric 2026-10-11): SMOKE SCREEN's slot is now `countermeasure`
// (MULTI-SPECTRAL COUNTERMEASURE, one cloud per press); counts unchanged.
// Story 9.4 (Eric 2026-10-11): FLASH SHELLS' slot is now `foulingShell`
// (FOULING SHELL, a stationary slowing zone); counts unchanged.
//
// THE COUNT MOVED 23/109 -> 24/117 IN STORY 9.6 (Eric 2026-10-11 / 2026-10-13,
// epic-9 amendments 27–29, 90–91): ARMOR is renamed `hullPoints` (HULL,
// +50 max hp ×5 — was `armor`, +25 ×4, until Story 9.6), SPEED and TURNING
// reach cap 5, and the new PASSIVE HEALING ladder (cap 5) joins LAST among the
// universal ladders. Every other line keeps its relative order.
//
// THE COUNT MOVED 24/114 -> 23/109 IN STORY 9.2 (Eric 2026-10-11, epic-9
// amendment 31): CHAFF is RETIRED so the key row is six keys. Every surviving
// line keeps its relative order.
//
// THE COUNT MOVED 26/117 -> 24/114 ON 2026-09-30 (Eric: "there are NO MORE
// one-off upgrades; EVERY upgrade is tiered"): DECK GUN TURRET and DECK GUN
// BARREL are DELETED. The second turret and the extra barrels are now rungs of
// the CANNON ladder (the turret at tier III; a barrel at tier II and tier IV
// since Eric's 2026-10-02 tables, epic-8 amendment 232), and the FLAK ladder
// gains a turret at tier II and tier IV (same tables). See `ladderSteps`.
//
// THE COUNT MOVED 109 -> 117 IN STORY 8.17 (Eric 2026-09-29, amendments
// 130–133), purely by re-cutting KINDS: the last two ADD-ONS are gone —
// PHOSPHOR SHELLS became its own tiered EQUIPMENT line (1 -> 5) and DAZZLE
// SHELLS the FLASH SHELLS CONSUMABLE (1 -> 5). The line count stays 26. The
// `addon` kind and the doctrine machinery stay in place, unused (amendment 134).
//
// THE COUNT MOVED 29/122 -> 26/109 IN STORY 8.15 (Eric rulings 2026-09-21/28,
// epic-8 amendments 89e and 103–105): MISSILE, MONITOR and HEAT SEEKING are
// CUT for good (−11 cards), and MACHINE GUN and FLAK changed KIND from stub
// equipment lines (5 copies each) to their guns' LADDERS (4 copies each, −2) —
// the guns themselves are the seat's pick, mounted in slot 0, never a card.
//
// `cap` IS THE COPY CAP AND NOTHING ELSE NOW (Story 8.14, amendment 89a). The
// "physical cards" figure is simply Σ cap: a count of how much ladder the
// catalog authors, not a supply. THE COMMON POOL holds every dealable line with
// UNLIMITED copies (sim/draw.ts), so nothing here is a per-player allocation.
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
// filled the five torpedo/mine ladders (`tieredWeapon` below); 8.15 built the
// two pickable guns' ladders; 8.17 authored the last three — STAR SHELLS,
// BROADSIDE and PHOSPHOR SHELLS (Eric 2026-09-29, amendments 130–133) — so NO
// equipment line has an empty tier any more. The
// −5 %/tier reload step is NEVER one of those effects — it is derived from the
// tier in sim/stats.ts clampStats, see there. Consumables stock and nothing
// else.
//
// STUB LINES (`stub: true`) are lines whose MECHANISM does not exist yet. They
// are authored in full shape so the catalog is complete and the ids are final,
// and they are EXCLUDED from the draw (Eric ruling 2026-09-15, epic-8
// amendment 11): sim/draw.ts `isDealable` is the single point at which
// "authored but unbuilt" becomes "unofferable", so a stub can never be offered
// (amendment 5: stay playable). A stub is also refused by the slot fold
// (sim/boons.ts) and by the server's grant, so an id that reaches a card list
// by any other route still fits nothing.
//
// NO DEAD CARD IN A LIVE OFFER is the rule the stub exclusion serves, and the
// draw's eligibility law (sim/draw.ts) is the rest of it: a line at its `cap`
// is not offered, copy 1 of a weapon is not offered with the row full, and a
// gun ladder is not offered unless that gun is mounted.
//
// CATALOG CONTENT IS WIRE CONTRACT: adding, removing or changing any entry
// REQUIRES a PROTOCOL_VERSION bump (shared/src/index.ts). Line ids ride the
// wire and both sides resolve them FAIL-CLOSED (unknown id silently dropped) —
// the PV join gate is the only desync guard.

import { CONFIG } from '../constants.js';
import type { EquipmentId } from './loadout.js';
import { EQUIPMENT_IDS, isConsumableId } from './loadout.js';
import {
  BOON_STAT_PATH_SET,
  DOCTRINE_MODES,
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
 * THE 26 LINE IDS, in catalog order (Eric ruling 2026-09-15, amendment 7, as
 * amended by amendments 80/83 on 2026-09-19 and 89e on 2026-09-21). This order
 * IS the fold order, so it is part of the determinism contract — never
 * re-sort it.
 *
 * STORY 9.9 ADDED ONE (25 -> 26; Eric 2026-10-14/15, epic-9 amendments
 * 144–145): `armorPiercing` — the attacker's half of the Armor curve — sits
 * directly after `armor` (seat 2), so every line below it moves down one place.
 *
 * STORY 9.7 ADDED ONE (24 -> 25; Eric 2026-10-13, epic-9 amendments 86–89):
 * `armor` — the NEW Armor ladder, not the old +hp line, which 9.6 renamed
 * `hullPoints` — sits directly after `hullPoints` (seat 1), so every line
 * below it moves down one place.
 *
 * STORY 9.6 RENAMED ONE SLOT AND ADDED ONE (23 -> 24; Eric 2026-10-13, epic-9
 * amendments 90–93): `armor` reads `hullPoints` in the same seat, and
 * `passiveHealing` joins LAST among the universal ladders (after `reload`), so
 * every line below it moves down one place.
 *
 * STORY 9.4 CHANGED ONE SLOT'S STRING AND MOVED NOTHING (Eric 2026-10-11,
 * epic-9 amendments 61–68): the slot `dazzleShells` (FLASH SHELLS) now reads
 * `foulingShell` (FOULING SHELL) — the 9.3 `smokeScreen` -> `countermeasure`
 * precedent. Same position, same kind, same cap; the count stays 23.
 *
 * STORY 9.2 DELETED ONE ID AND MOVED NOTHING (24 -> 23): `chaff` is retired
 * (Eric 2026-10-11, epic-9 amendment 31).
 *
 * 2026-09-30 DELETED TWO IDS AND MOVED NOTHING (26 -> 24): `deckGunTurret`
 * and `deckGunBarrel` folded into the CANNON ladder's rungs (Eric). Every
 * surviving line keeps its relative order.
 *
 * STORY 8.17 MOVED NOTHING AND CHANGED TWO KINDS (Eric 2026-09-29, amendments
 * 131/132): `dazzleShells` became a `consumable` (FLASH SHELLS) and
 * `phosphorShells` an `equipment` line. Both KEEP their positions at the foot
 * of the list — the `foulingMines` precedent.
 *
 * STORY 8.15 DELETED THREE IDS AND MOVED NOTHING (29 -> 26): `missile`,
 * `monitor` and `heatSeeking` are CUT (amendment 89e). `machineGun` and `flak`
 * KEEP their locked ids and their positions below, but their KIND is now
 * `ladder` — each is its gun's ladder, offered only while that gun is mounted
 * (amendments 89d/104/105). The surviving lines keep their relative order.
 *
 * STORY 8.13 SWAPPED EXACTLY ONE ID AND MOVED NOTHING. `acousticHoming` is
 * deleted (homing became a tier stat) and `depthCharge` joins; the count stays
 * 29. TWO LINES CHANGED KIND WITHOUT CHANGING SLOT — `supercavTorpedo` became
 * a `consumable` and `foulingMines` became `equipment` — and they KEEP the
 * positions they hold below, because this list's order is the contract and a
 * re-sort would silently re-cut the fold order. The
 * section headings therefore describe where a line SITS, not what kind it is;
 * the kind is in CATALOG.
 */
export const LINE_IDS = [
  // --- the eight universal ladders (catalog-v3 §4 + Stories 9.6 / 9.7 / 9.9)
  'hullPoints', // was `armor` until Story 9.6 (Eric 2026-10-13, amendment 93) — same seat
  'armor', // Story 9.7 (Eric 2026-10-13, amendments 86–89): the new Armor ladder, right after HULL
  'armorPiercing', // Story 9.9 (Eric 2026-10-14/15, amendments 144–145): right after ARMOR
  'speed',
  'turning',
  'radarSweep',
  'reload',
  'passiveHealing', // Story 9.6 (Eric 2026-10-13, amendments 90–91): last universal ladder
  // --- the CANNON ladder (the deck gun: slotless, always fitted) ------------
  'deckGun',
  // --- the eleven equipment lines (+ one consumable that kept its slot) -----
  'lightTorpedo',
  'heavyTorpedo',
  'supercavTorpedo', // a CONSUMABLE since amendment 74 — slot locked, kind changed
  'navalMines',
  'captiveMines',
  'machineGun', // a LADDER since 8.15 — the machine gun's, slot locked, kind changed
  'flak', // a LADDER since 8.15 — the flak gun's, slot locked, kind changed
  'broadside',
  'starShells',
  // --- the consumables ------------------------------------------------------
  // (plus `supercavTorpedo` above, which KEPT ITS SLOT in this list when its
  // kind changed — see the note on the eleven-equipment block.)
  'hullRepair',
  'shieldBlock',
  'countermeasure', // Story 9.3 (Eric 2026-10-11): replaces smokeScreen in its slot
  'decoyBuoy',
  // DEPTH CHARGE takes ACOUSTIC HOMING's place in the 29 (Eric ruling
  // 2026-09-19, epic-8 amendments 80/83): a new STUB consumable, and the Mine
  // Layer's 40th default card.
  'depthCharge',
  // --- the former add-ons (NONE remains since Story 8.17) -------------------
  // Each slot is locked and each KIND changed: `foulingMines` to `equipment`
  // in Story 8.13; `dazzleShells` to `consumable` (FLASH SHELLS) and
  // `phosphorShells` to `equipment` in Story 8.17 (amendments 131/132). Story
  // 9.4 replaced FLASH SHELLS with the FOULING SHELL in the same slot.
  'foulingMines',
  'foulingShell', // Story 9.4 (Eric 2026-10-11): replaces dazzleShells (FLASH SHELLS) in its slot
  'phosphorShells', // an EQUIPMENT line since 8.17
] as const;

/** One of the 26 authored card lines. */
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
 *   "this step exists but its content is not authored" (Story 8.1's interim
 *   for every equipment line's tiers II–V; since Story 8.17 no production
 *   line carries one).
 * - `appliesTo` — for an `addon`, the equipment it bolts onto; for a GUN
 *   LADDER (`deckGun`, `machineGun`, `flak`), the single equipment row whose
 *   TIER its copies advance (a mounted gun is slotless in the card sense, so it
 *   has no `slotFill` to read the target off).
 * - `stub` — the mechanism does not exist yet: never dealt (sim/draw.ts).
 * - `healOnGrant` — the grant heals the granted maxHp delta (HULL POINTS only).
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
 * `CATALOG.hullPoints.tiers[0][0].add` is a permanent, silent, cross-match stat
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
 * A ladder whose rungs are NOT UNIFORM (Eric 2026-09-30): the `ladder` twin of
 * `tieredWeaponSteps`. `steps[k]` is the effect list of the rung copy k+1
 * buys, and `cap` is `steps.length`. A rung may carry more than one authored
 * effect — CANNON's tier-III rung is its +3 damage step AND the second turret,
 * its rungs to II and IV are a barrel each with no damage step, and its rung
 * to V is +3 damage alone (12 / 12 / 15 / 15 / 18, Eric 2026-10-13); the MACHINE GUN takes +1
 * damage only on the rungs to II and IV beside its uniform +4 shells / −50 ms
 * (Eric 2026-10-02, epic-8 amendment 232) — shapes one repeated list cannot say. The `ladder`
 * law holds: a FRESH ARRAY PER RUNG, copied from the caller's lists, so no
 * rung aliases another or the caller's array; the effect objects are
 * deep-frozen with the catalog.
 */
export function ladderSteps(
  id: LineId,
  steps: readonly (readonly BoonEffect[])[],
  extra: { healOnGrant?: true; appliesTo?: readonly EquipmentId[] } = {},
): CatalogLine {
  const tiers = steps.map((step) => [...step] as readonly BoonEffect[]);
  return { id, kind: 'ladder', cap: tiers.length, tiers, ...extra };
}

/**
 * THE PER-CARD RANGE STEPS (Story 9.8, Eric 2026-10-13, epic-9 ruling 125):
 * every tiered weapon's reach climbs from its Tier I dial `CONFIG.<w>.rangeU`
 * to its Tier V dial `CONFIG.<w>.rangeUAtV` in an EVEN split over the line's
 * four upgrade cards — cannon and phosphor +62.5 u, machine gun, flak,
 * broadside and star shells +31.25 u at the shipped ruler (all exact in
 * binary, so four steps land on Tier V with no dust; `rangeU` is not an
 * integer field, so nothing floors it).
 *
 * COMPUTED ONCE, AT MODULE LOAD, from the two CONFIG numbers — the catalog is
 * frozen at load (the 9.7 precedent, epic-9 amendment 110), so a harness
 * `--tune gun.rangeU` moves the Tier I BASE only and the step stays where it
 * was authored, exactly like every other authored step.
 */
const rangeStep = (w: { rangeU: number; rangeUAtV: number }): number => (w.rangeUAtV - w.rangeU) / 4;
const GUN_RANGE_STEP = rangeStep(CONFIG.gun);
const MACHINE_GUN_RANGE_STEP = rangeStep(CONFIG.machineGun);
const FLAK_RANGE_STEP = rangeStep(CONFIG.flak);
const BROADSIDE_RANGE_STEP = rangeStep(CONFIG.broadside);
const STAR_SHELLS_RANGE_STEP = rangeStep(CONFIG.starShells);
const PHOSPHOR_SHELLS_RANGE_STEP = rangeStep(CONFIG.phosphorShells);
/** One CANNON rung's range step (ruling 125: 8/12 → 10/12 over four cards). */
const cannonRange = (): BoonEffect => statEffect('equipment.gun.rangeU', { add: GUN_RANGE_STEP });
/** One FLAK rung's range step (ruling 125: 5/12 → 6/12 over four cards). */
const flakRange = (): BoonEffect => statEffect('equipment.flak.rangeU', { add: FLAK_RANGE_STEP });

/** One CANNON rung's whole-number damage step (Eric 2026-10-13, experiment:
 *  base 12; +3 on the rung to III, +3 on the rung to V → 12 / 12 / 15 / 15 /
 *  18; the rungs to II and IV carry no damage effect. Was base 16, +2 / +3 →
 *  16 / 16 / 18 / 18 / 21, 2026-10-02, epic-8 amendment 232). */
const cannonDamage = (step: number): BoonEffect => statEffect('equipment.gun.damage', { add: step });
/** One FLAK rung's damage step (Eric 2026-10-02, epic-8 amendment 232: +8;
 *  on the base 20 since Eric 2026-10-13, experiment → 20 / 28 / 36 / 44 / 52). */
const flakDamage = (): BoonEffect => statEffect('equipment.flak.damage', { add: 8 });

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

/**
 * An equipment line whose ladder is NOT UNIFORM (Story 8.17): copy 1 fits the
 * weapon and tiers II–V apply the FOUR EXPLICIT step lists given, in order.
 * STAR SHELLS and PHOSPHOR SHELLS step damage +2, +3, +2, +3 (Eric's whole
 * numbers, amendment 39) and phosphor's burn +1, +1, +1, +2 and its duration
 * +0, +1, +0, +1 s — shapes one repeated `step` cannot say. A ZERO step is
 * simply omitted from that tier's list.
 *
 * The reload step is derived, never authored (see `tieredWeapon`). A FRESH
 * ARRAY PER TIER, copied from the caller's lists, so no tier aliases another
 * or the caller's array (the `ladder` law).
 */
export function tieredWeaponSteps(
  id: LineId,
  equipmentId: EquipmentId,
  steps: readonly [
    readonly BoonEffect[],
    readonly BoonEffect[],
    readonly BoonEffect[],
    readonly BoonEffect[],
  ],
): CatalogLine {
  const slotFill: BoonEffect = { kind: 'slotFill', equipmentId };
  const tiers: readonly (readonly BoonEffect[])[] = [
    [slotFill],
    ...steps.map((step) => [...step] as readonly BoonEffect[]),
  ];
  return { id, kind: 'equipment', cap: 5, tiers };
}

/** One upgrade tier of the MACHINE GUN ladder (Eric 2026-10-02, epic-8
 *  amendment 232): +4 shells and −50 ms of shot delay on every rung, and +1
 *  damage ONLY when `damageUp` (the rungs to II and IV). The rungs to III and
 *  V author NO damage effect at all — the validator refuses `add: 0`, and a
 *  rung carrying the magazine and delay steps is not empty. */
function machineGunTier(damageUp: boolean): BoonEffect[] {
  return [
    statEffect('equipment.machineGun.maxAmmo', { add: 4 }),
    ...(damageUp ? [statEffect('equipment.machineGun.damage', { add: 1 })] : []),
    statEffect('equipment.machineGun.rateMs', { add: -50 }),
    statEffect('equipment.machineGun.rangeU', { add: MACHINE_GUN_RANGE_STEP }), // ruling 125: 6/12 → 7/12
  ];
}

/** One upgrade tier of STAR SHELLS (catalog-v3 R31 as ruled by Eric
 *  2026-09-29, amendment 130): +2.5 s lit, ×1.1 lit radius, +0.5 flares, plus
 *  the tier's damage step (+2, +3, +2, +3 → 20 / 22 / 25 / 27 / 30). */
function starShellTier(damageStep: number): BoonEffect[] {
  return [
    statEffect('equipment.starShells.litDurationMs', { add: 2500 }),
    statEffect('equipment.starShells.litRadius', { mult: 1.1 }),
    statEffect('equipment.starShells.maxAmmo', { add: 0.5 }),
    statEffect('equipment.starShells.damage', { add: damageStep }),
    statEffect('equipment.starShells.rangeU', { add: STAR_SHELLS_RANGE_STEP }), // ruling 125: 11/12 → 12/12
  ];
}

/** One upgrade tier of PHOSPHOR SHELLS (amendment 131): the damage and burn
 *  steps, ×1.1 zone radius, and the duration step when it is non-zero (a zero
 *  step is omitted — the validator refuses an `add: 0`). */
function phosphorTier(damageStep: number, dpsStep: number, durationStepMs: number): BoonEffect[] {
  const tier: BoonEffect[] = [
    statEffect('equipment.phosphorShells.damage', { add: damageStep }),
    statEffect('equipment.phosphorShells.dps', { add: dpsStep }),
    statEffect('equipment.phosphorShells.zoneRadius', { mult: 1.1 }),
    statEffect('equipment.phosphorShells.rangeU', { add: PHOSPHOR_SHELLS_RANGE_STEP }), // ruling 125: 8/12 → 10/12
  ];
  if (durationStepMs !== 0) tier.push(statEffect('equipment.phosphorShells.zoneDurationMs', { add: durationStepMs }));
  return tier;
}

/** A cap-5 consumable: every copy stocks one use. `stub` marks a consumable
 *  whose EFFECT does not exist yet — the slots are built (Story 8.7) and
 *  HULL REPAIR's effect landed with Story 8.8, so the flag is passed
 *  line-by-line. (The `weapon()` and `addon()` helpers that took the same
 *  flag were deleted in Story 8.17 with their last users.) */
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
 *   HULL POINTS R8 — +50 max hp per tier, 5 tiers, heals on grant (was ARMOR
 *                  +25 ×4; epic-9 amendments 27–29, 90–91).
 *   ARMOR   — +20 Armor per tier, 5 tiers; damage × K / (K + Armor), K = 100
 *                  (Eric 2026-10-13, epic-9 amendments 86–88; rescaled
 *                  +1/K 5 -> +20/K 100 by amendment 144).
 *   ARMOR PIERCING — +20 Armor Piercing per tier, 5 tiers; subtracted from
 *                  the victim's Armor at the damage gate, the curve going
 *                  2 − K / (K − E) below zero (Eric 2026-10-14/15, epic-9
 *                  amendments 144–146).
 *   SPEED   R10 — +2.5 u/s forward max per tier, 5 tiers, reverse untouched.
 *   TURNING R6  — flat +0.05 rad/s per tier, 5 tiers.
 *   RADAR SWEEP R11 — +3 rpm per tier, 5 tiers (the 30 rpm clamp stays).
 *   RELOAD  R12 — −5 % per tier, 5 tiers, cap 25 % (cooldownScale 1.0 → 0.75).
 *   PASSIVE HEALING — +0.6 %/s missing hull and −1 s wait per tier, 5 tiers
 *                  (Eric 2026-10-13, epic-9 amendments 90–91).
 *   DECK GUN R14 — damage 12/12/15/15/18 (base 12; +3 at III, +3 at V; Eric 2026-10-13, experiment) AND −5 % own reload per
 *                  tier, 4 tiers (Eric 2026-10-02, amendment 232); the
 *                  reload half is DERIVED from the tier in clampStats.
 *                  R15 (turret) / R16 (barrel) folded into the CANNON rungs:
 *                  +1 pool at tier III (2026-09-30), +1 barrel at tier II
 *                  and tier IV (2026-10-02, amendment 232).
 *   MACHINE GUN — +4 shells and −50 ms per tier, +1 damage at tiers II and
 *                  IV only, 4 tiers (Eric 2026-10-02, amendment 232).
 *   FLAK — damage +8 per tier (20 → 52 since 2026-10-13, experiment), 4 tiers, blast fixed (Eric
 *                  2026-10-02, amendment 232); +1 pool at tier II and
 *                  tier IV (1/2/2/3/3, same tables; was III and V).
 *   BROADSIDE R35 · STAR SHELLS R31 · PHOSPHOR SHELLS · FLASH SHELLS — as
 *                  ruled by Eric 2026-09-29, amendments 130–133 (Story 8.17).
 *   LIGHT TORPEDO R18 · HEAVY TORPEDO R17 · NAVAL MINES R23/R24 ·
 *   CAPTIVE MINES R25 · FOULING MINES R28 (as amended) — Story 8.13.
 */
export const CATALOG: Catalog = deepFreezeRows({
  // --- the eight universal ladders -----------------------------------------
  // HULL POINTS (R8 as re-cut by Eric 2026-10-11 / 2026-10-13, epic-9
  // amendments 27–29, 90–91): +50 max hp per tier, 5 tiers (dreadnought 350 →
  // 600 at cap); the grant HEALS the granted delta. Was `armor` (+25 ×4) until
  // Story 9.6.
  hullPoints: ladder('hullPoints', 5, [statEffect('maxHp', { add: 50 })], { healOnGrant: true }),
  // ARMOR (Story 9.7, Eric 2026-10-13, epic-9 amendments 86–88; rescaled by
  // Story 9.9, amendment 144): +20 Armor per tier, 5 tiers (0 → 100);
  // effectiveStats derives damageMultiplier = K / (K + Armor) from it
  // (×1 → ×0.5 at K 100). Adds no hull and no ramming mass. The step is
  // authored literally like every ladder's (CONFIG.armor holds only Eric's K;
  // amendment 110's reason — the catalog is frozen at module load).
  armor: ladder('armor', 5, [statEffect('armor', { add: 20 })]),
  // ARMOR PIERCING (Story 9.9, Eric 2026-10-14/15, epic-9 amendments 144–146):
  // +20 Armor Piercing per tier, 5 tiers (0 → 100). The ATTACKER's stat: the
  // server's damage gate subtracts it from the victim's Armor (+ HUNKER), so
  // it never moves the holder's own damageMultiplier. Authored literally.
  armorPiercing: ladder('armorPiercing', 5, [statEffect('armorPiercing', { add: 20 })]),
  // SPEED (R10; cap 5 since Eric 2026-10-11 / 2026-10-13, epic-9 amendments
  // 27–29, 90–91): +2.5 u/s of FORWARD top speed per tier, 5 tiers. Reverse is
  // explicitly untouched — no constant add preserves the reverse:forward ratio
  // across three hulls.
  speed: ladder('speed', 5, [statEffect('kinematics.maxSpeed', { add: 2.5 })]),
  // TURNING (R6; cap 5 since Eric 2026-10-11 / 2026-10-13, epic-9 amendments
  // 27–29, 90–91): flat +0.05 rad/s per tier, 5 tiers (+0.25 at the cap —
  // flat, not proportional, so it helps the slow hulls most).
  turning: ladder('turning', 5, [statEffect('kinematics.turnRate', { add: 0.05 })]),
  // RADAR SWEEP (R11): +3 rpm per tier, 5 tiers, 15 → 30 rpm. The ratified
  // 30 rpm ceiling stays in clampStats and is what makes a 6th copy impossible
  // to exploit even if one existed.
  radarSweep: ladder('radarSweep', 5, [statEffect('sweepRpm', { add: 3 })]),
  // RELOAD (R12): −5 % per tier, 5 tiers, cap 25 % — cooldownScale 1.0 → 0.75
  // exactly (round3 in clampStats kills the additive float dust). ADDITIVE, so
  // stacking is linear rather than 0.95^N. Scope (R40): every equipment reload
  // AND the Shift boost cooldown; consumables have no reload.
  reload: ladder('reload', 5, [statEffect('cooldownScale', { add: -0.05 })]),
  // PASSIVE HEALING (Eric 2026-10-11 / 2026-10-13, epic-9 amendments 27–29,
  // 90–91): +0.6 %/s of MISSING hull and −1 s of out-of-combat wait per tier,
  // 5 tiers — base 2 %/s after 15 s (CONFIG.regen) → 5 %/s after 10 s at cap.
  // round3 in clampStats kills the additive float dust on the rate.
  passiveHealing: ladder('passiveHealing', 5, [
    statEffect('regen.missingPctPerS', { add: 0.006 }),
    statEffect('regen.outOfCombatMs', { add: -1000 }),
  ]),
  // --- the CANNON ladder ----------------------------------------------------
  // DECK GUN (R14 as retuned by Eric 2026-10-13, experiment; was 2026-10-02,
  // epic-8 amendment 232): base 12, damage steps +3 (to III) and +3 (to V) —
  // whole numbers — so the gun deals Eric's scale 12 → 12 → 15 → 15 → 18
  // exactly (amendment 39: his integers
  // ARE the scale; the fold is still floored once by effects.ts
  // EQUIPMENT_INT_FIELDS, a no-op on integer steps). The OTHER half of
  // the line — −5 % own reload per tier — is NOT an effect: it is derived from
  // `equipment.gun.tier` in clampStats, exactly as every equipment line's step
  // is, so there is one reload derivation in the engine rather than two.
  // `appliesTo: ['gun']` is how this ladder names the row whose tier it moves.
  // THE ONE-OFF TURRET AND BARREL CARDS ARE RUNGS NOW (Eric 2026-09-30, "EVERY
  // upgrade is tiered"; R15/R16 folded in): the rung that reaches tier III
  // (copy 2) adds the second turret (gun pool 1 → 2), and the rungs that
  // reach tier II (copy 1) and tier IV (copy 3) each add a barrel per turret
  // (parallel shells per click; Eric 2026-10-02, amendment 232). Pool by
  // copies 0..4: 1,1,2,2,2; barrels: 1,2,2,3,3.
  deckGun: ladderSteps(
    'deckGun',
    [
      [statEffect('equipment.gun.barrels', { add: 1 }), cannonRange()], // I → II — a second barrel (no damage step: 12 → 12)
      [cannonDamage(3), statEffect('equipment.gun.maxAmmo', { add: 1 }), cannonRange()], // II → III — 12 → 15 and the second turret
      [statEffect('equipment.gun.barrels', { add: 1 }), cannonRange()], // III → IV — a third barrel (no damage step: 15 → 15)
      [cannonDamage(3), cannonRange()], // IV → V — 15 → 18
    ],
    { appliesTo: ['gun'] },
  ),
  // --- the eleven equipment lines (+ supercavTorpedo, which kept its slot) ---
  // Copy 1 fits the weapon. The TORPEDO AND MINE ladders below are Story
  // 8.13's (catalog-v3 §4 as amended by Eric's 2026-09-19 rulings, epic-8
  // amendments 74/77/80/81/82); the BROADSIDE and STAR SHELLS ones are Story
  // 8.17's (Eric 2026-09-29, amendments 130/133). The two GUN LADDERS that sit
  // in this block (machineGun, flak) are Story 8.15's.
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
  // row's tier in sim/stats.ts (120 → 175.7 u since 2026-10-08; 144 → 210.8 before), and the 32 u burst is fixed.
  captiveMines: tieredWeapon('captiveMines', 'captiveMines', [
    statEffect('equipment.captiveMines.damage', { add: 5 }),
    statEffect('equipment.captiveMines.maxAmmo', { add: 0.5 }),
    statEffect('equipment.captiveMines.homingTurnRate', { add: 0.075 }),
  ]),
  // MACHINE GUN (amendment 104; the numbers Eric 2026-10-02, amendment 232):
  // the machine gun's LADDER — offered only while it is mounted (sim/draw.ts
  // ladderHost reads `appliesTo`). Tiers II–V each +4 shells to the magazine
  // (12 / 16 / 20 / 24 / 28) and −50 ms of shot delay (0.30 / 0.25 / 0.20 /
  // 0.15 / 0.10 s); +1 damage per shell only on the rungs to II and IV
  // (5 / 6 / 6 / 7 / 7). The −5 % reload per tier (12 s -> 9.6 s at V) is NOT
  // an effect: it is derived from
  // `equipment.machineGun.tier`, which `appliesTo` makes this line advance —
  // the `deckGun` precedent exactly.
  machineGun: ladderSteps(
    'machineGun',
    [machineGunTier(true), machineGunTier(false), machineGunTier(true), machineGunTier(false)],
    { appliesTo: ['machineGun'] },
  ),
  // FLAK (amendment 105; the numbers Eric 2026-10-02, amendment 232): the
  // flak gun's LADDER, offered only while mounted. Tiers II–V step damage
  // +8 per rung (20 / 28 / 36 / 44 / 52 since Eric 2026-10-13, experiment;
  // was 12 / … / 44); the blast radius does NOT grow;
  // the −5 % reload per tier is the derived tier step (3.5 s -> 2.8 s at V).
  // The rungs reaching tier II and tier IV each add a TURRET (Eric
  // 2026-10-02, amendment 232; was III and V): flak pool by copies 0..4 is
  // 1,2,2,3,3.
  flak: ladderSteps(
    'flak',
    [
      [flakDamage(), statEffect('equipment.flak.maxAmmo', { add: 1 }), flakRange()], // I → II — the second turret (Eric 2026-10-02)
      [flakDamage(), flakRange()], // II → III
      [flakDamage(), statEffect('equipment.flak.maxAmmo', { add: 1 }), flakRange()], // III → IV — the third turret
      [flakDamage(), flakRange()], // IV → V
    ],
    { appliesTo: ['flak'] },
  ),
  // BROADSIDE (R35 as ruled by Eric 2026-09-29, amendment 133): tiers II–V
  // each +1 SPREAD rung (the shipped mount/traverse ladders, rung 1 → 5) and
  // +0.5 turret (5 at III, 6 at V). Damage stays 15 per shell at every tier;
  // there is no separate damage / turret / spread card. −5 %/tier reload is
  // derived (18 s → 14.4 s at V).
  broadside: tieredWeapon('broadside', 'broadside', [
    statEffect('equipment.broadside.spreadRung', { add: 1 }),
    statEffect('equipment.broadside.turrets', { add: 0.5 }),
    statEffect('equipment.broadside.rangeU', { add: BROADSIDE_RANGE_STEP }), // ruling 125: 5/12 → 6/12
  ]),
  // STAR SHELLS (R31 as ruled by Eric 2026-09-29, amendment 130): tiers II–V
  // each +2.5 s lit, ×1.1 lit radius, +0.5 flares — 20 s lit, r241.6, 3 flares
  // at V — and the flare's burst damage 10 / 12 / 15 / 17 / 20 (amendment 39's
  // "structurally damageless" is SUPERSEDED). −5 %/tier reload derived.
  starShells: tieredWeaponSteps('starShells', 'starShells', [
    starShellTier(2),
    starShellTier(3),
    starShellTier(2),
    starShellTier(3),
  ]),
  // --- the consumables (R13, R36–R39, + amendments 74/83) -------------------
  // The consumable slots are built (Story 8.7). HULL REPAIR (R13) was
  // the first LIVE line — its effect is Story 8.8's — and SUPERCAV TORPEDO
  // (above) is the second. Story 8.16 flipped SHIELD BLOCK and DECOY BUOY
  // live (catalog-v3 R37/R36, epic-8 amendments 116–124), and Story 8.18
  // flipped SMOKE SCREEN (R38, amendments 138–145), leaving ONE stub — DEPTH
  // CHARGE — until its effect lands (6 live consumables). Story 9.3 (Eric
  // 2026-10-11) replaced SMOKE SCREEN with the COUNTERMEASURE line. The
  // FOULING SHELL (Story 9.4, replacing Story 8.17's FLASH SHELLS) is a live
  // consumable that sits at the foot of the list with the former add-ons. CHAFF (R39) is RETIRED since Story 9.2 (epic-9 amendment
  // 31). Since 9.2 every live consumable owns a fixed key (sim/loadout.ts
  // CONSUMABLE_KEY_ORDER) — the belt and its `1`–`4` keys are gone.
  hullRepair: consumable('hullRepair'), // R13 — 50 instant + 50 pooled (CONFIG.hullRepair)
  shieldBlock: consumable('shieldBlock'), // R37 — absorbs 100 hp for 10 s (CONFIG.shieldBlock)
  countermeasure: consumable('countermeasure'), // Story 9.3 (Eric 2026-10-11) — one cloud per press, 15 s life (CONFIG.countermeasure)
  decoyBuoy: consumable('decoyBuoy'), // R36 — a 50 hp rear-dropped decoy (CONFIG.decoyBuoy)
  // DEPTH CHARGE (amendment 83): Eric's line, mechanism a later story — a STUB
  // in full shape so the id is final, and the Mine Layer's 40th default card.
  depthCharge: consumable('depthCharge', true),
  // --- the former add-ons (NONE remains since Story 8.17) -------------------
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
  // HEAT SEEKING (R32) is CUT with the missile (Story 8.15, amendment 89e).
  // FOULING SHELL (Story 9.4, Eric 2026-10-11, epic-9 amendments 61–68;
  // replaces FLASH SHELLS in its slot): a CONSUMABLE — one 360° shell whose
  // burst leaves a stationary zone that slows every hull whose outline
  // touches it, the firer's included. CONFIG.foulingShell.
  foulingShell: consumable('foulingShell'),
  // PHOSPHOR SHELLS (R33/R34 as ruled by Eric 2026-09-29, amendment 131): its
  // OWN tiered 360° weapon, no longer a star-shell add-on. Tiers II–V: damage
  // +2/+3/+2/+3 (20 → 30), burn +1/+1/+1/+2 hp/s (5 → 10), zone radius ×1.1
  // each (100 → 146.41 u), duration +0/+1/+0/+1 s (8 / 8 / 9 / 9 / 10 s).
  // −5 %/tier reload derived (20 s → 16 s at V).
  phosphorShells: tieredWeaponSteps('phosphorShells', 'phosphorShells', [
    phosphorTier(2, 1, 0),
    phosphorTier(3, 1, 1000),
    phosphorTier(2, 1, 0),
    phosphorTier(3, 2, 1000),
  ]),
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
 * `equipment` line reads it off copy 1's `slotFill`; a GUN ladder (DECK GUN,
 * MACHINE GUN, FLAK) names it in `appliesTo` (a mounted gun is never a card,
 * so there is no slotFill to read). Add-ons
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
 * equipment no card fits (the three mounted guns and the three Shifts; the
 * legacy `radarBuoy` was deleted in Story 8.16).
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
 *     never dealt either.
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

/** Total physical cards in a catalog (Σ cap) — 122 since Story 9.7. */
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
