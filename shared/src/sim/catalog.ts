// THE CATALOG (Story 8.1) — catalog v3, Eric's authored sheet
// (`_bmad-output/planning-artifacts/gdds/.../catalog-v3.md`) expressed as data,
// as amended by Eric's rulings (epic-8 amendments) and RE-AUTHORED by Story
// 10.6 (Eric 2026-11-05, R1–R18).
// 27 card LINES / 116 physical cards: 11 equipment lines (55), 8 SHIP ladders
// (40), the gun ladders (12 — CANNON, MACHINE GUN and FLAK, 4 each — authored,
// never dealt to a captain), 4 one-off WEAPON add-ons (4) and the one STUB
// line (DEPTH CHARGE, 5). (Pinned by catalog.test.ts as Σ cap — computed,
// never typed.)
//
// THE COUNT MOVED 21/102 -> 27/116 IN STORY 10.6 (Eric 2026-11-05, R1–R4,
// R6–R10): RUDDER is DELETED (−1 line, −5 cards — R2, every hull turns at
// one baseline); RELOAD and ENGINES step +10 a card (was +20); three SHIP
// ladders are APPENDED — RANGE (+10 on the RANGE index), HULL REPAIR and
// SMOKE SCREEN (the `C` / `V` abilities' cards, R8 / R9) — and four cap-1
// one-off WEAPON cards that own ALL extra capacity: AFT TORPEDO LAUNCHER,
// SECOND LAUNCHER TUBE, SECOND MINE RACK, EXPANDED MINE RACKS (R6 / R7). No
// tier gives a tube, a mine or a shot any more (R4), and the −5 %-per-tier
// reload step is replaced by the per-weapon RELOAD bonus (R5, derived in
// sim/stats.ts). Every surviving line keeps its relative order.
//
// THE COUNT MOVED 28/137 -> 21/102 IN STORY 10.5 (Eric 2026-11-05, epic-10
// amendment 11): THE KIT IS RETIRED. Seven consumable lines are DELETED —
// HULL REPAIR and SMOKE (`countermeasure`) became the `C` / `V` cooldown
// abilities every ship carries (sim/abilities.ts), SHIELD BLOCK and the four
// buoys are gone outright — and three CHANGED KIND in their seats, consumable
// -> equipment: SUPERCAV TORPEDO, FOULING SHELL and FLASH SHELLS
// (`dazzleShells`) are reloading slot weapons with five tiers. The
// `consumable` kind and the `stock` effect are deleted; DEPTH CHARGE stays
// the one stub. BROADSIDE stays authored and LEAVES THE DEAL (R6). Every
// surviving line keeps its relative order.
//
// THE COUNT MOVED 30/147 -> 28/137 IN STORY 10.3 (Eric 2026-11-04, epic-10
// amendment 7): the HULL POINTS and PASSIVE HEALING ladders (cap 5 each) are
// DELETED, and four universal ladders are RENAMED in their seats —
// `armorPiercing` -> `power` (POWER), `speed` -> `engines` (ENGINES),
// `turning` -> `rudder` (RUDDER), `radarSweep` -> `intel` (INTEL). Every
// surviving line keeps its relative order. (The 30/147 figure is Story
// 10.9's: it deleted DECOY BUOY and appended FLASH SHELLS and four buoys,
// 26/127 -> 30/147; this header was not restated then.)
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
// BARREL are DELETED. The second turret is now a rung of the CANNON ladder
// (tier III); the extra barrels were rungs at tier II and IV (Eric's
// 2026-10-02 tables, epic-8 amendment 232) until the cannon went to a FIXED
// two barrels with no barrel rungs (Eric 2026-10-16, Story 9.12 (forge weapon-balance-math; epic-9 amendments 184–185)). The FLAK ladder carries a turret at
// tier II only since then (was II and IV). See `ladderSteps`.
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
// per-weapon RELOAD bonus (Story 10.6, R5 — it replaced the −5 %/tier step)
// is NEVER one of those effects — it is derived from the tier in sim/stats.ts
// clampStats, see there.
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
// is not offered, copy 1 of a weapon is not offered unless its FAMILY's slot is
// empty (Story 10.5 — one kind per slot), a gun ladder is not offered
// unless that gun is mounted, and a one-off add-on is not offered unless its
// FAMILY's slot is FILLED (Story 10.6, R10).
//
// CATALOG CONTENT IS WIRE CONTRACT: adding, removing or changing any entry
// REQUIRES a PROTOCOL_VERSION bump (shared/src/index.ts). Line ids ride the
// wire and both sides resolve them FAIL-CLOSED (unknown id silently dropped) —
// the PV join gate is the only desync guard.

import { CONFIG } from '../constants.js';
import type { EquipmentId, SlotFamily } from './loadout.js';
import { EQUIPMENT_IDS, familyMembers, familySlotFor } from './loadout.js';
import {
  BOON_STAT_PATH_SET,
  DOCTRINE_MODES,
  statEffect,
  type BoonBehaviorEffect,
  type BoonDoctrineEffect,
  type BoonEffect,
  type BoonStatEffect,
  type DoctrineWeapon,
} from './effects.js';

/**
 * THE 27 LINE IDS, in catalog order (Eric ruling 2026-09-15, amendment 7, as
 * amended by amendments 80/83 on 2026-09-19 and 89e on 2026-09-21). This order
 * IS the fold order, so it is part of the determinism contract — never
 * re-sort it.
 *
 * STORY 10.6 DELETED ONE AND APPENDED SEVEN (21 -> 27; Eric 2026-11-05):
 * `rudder` is GONE (R2) — no alias, its seat closes and every line after it
 * moves up one. APPENDED, in this order and never inserted: the three new
 * SHIP ladders `range`, `hullRepair`, `smokeScreen` (R1 / R8 / R9), then the
 * four one-off WEAPON cards `aftTorpedoLauncher`, `secondLauncherTube`,
 * `secondMineRack`, `expandedMineRacks` (R6 / R7). `hullRepair` and
 * `smokeScreen` REUSE ids retired in Stories 10.5 and 9.3 (both then named
 * consumables of the same abilities); neither collides with an
 * `EquipmentId`, an `AbilityId` or a stat path.
 *
 * STORY 10.5 DELETED SEVEN AND MOVED NOTHING (28 -> 21; Eric 2026-11-05,
 * epic-10 amendment 11): `hullRepair`, `shieldBlock`, `countermeasure`,
 * `radarBuoy`, `healingBuoy`, `shieldBuoy` and `speedBuoy` are GONE — no
 * alias, their seats close. `supercavTorpedo`, `foulingShell` and
 * `dazzleShells` KEEP their seats and change KIND to `equipment` (the
 * `foulingMines` precedent); `depthCharge` keeps its seat as the one stub.
 *
 * STORY 10.3 DELETED TWO AND RENAMED FOUR (30 -> 28; Eric 2026-11-04, epic-10
 * amendment 7): `hullPoints` (seat 1) and `passiveHealing` (seat 8) are GONE —
 * no alias, their slots close and every line after each moves up. RENAMED in
 * their seats, same kind, same cap (the `foulingMines` precedent):
 * `armorPiercing` -> `power`, `speed` -> `engines`, `turning` -> `rudder`,
 * `radarSweep` -> `intel`.
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
 *
 * STORY 10.9 (Eric 2026-10-27/28, epic-10 amendments 2 and 4) DELETED ONE AND
 * APPENDED FIVE: 26 → 30. The plain DECOY BUOY (`decoyBuoy`) is GONE — no
 * alias, its slot closes and every line after it moves up one. APPENDED, in
 * this order and never inserted: `dazzleShells` (FLASH SHELLS, back beside the
 * FOULING SHELL that replaced it in 9.4), then the four buoys `radarBuoy`,
 * `healingBuoy`, `shieldBuoy`, `speedBuoy` (sim/buoy.ts). All five are live
 * cap-5 consumables.
 */
export const LINE_IDS = [
  // --- the universal ladders (catalog-v3 §4 + Stories 9.7 / 9.9 / 10.3 / 10.6)
  // `hullPoints` sat here (seat 1) until Story 10.3 DELETED it (Eric
  // 2026-11-04, epic-10 amendment 8): HULL POINTS is gone from the catalog.
  'armor', // Story 9.7 (Eric 2026-10-13, amendments 86–89): the new Armor ladder
  'power', // was `armorPiercing` (Story 9.9) until Story 10.3 (Eric 2026-11-04, epic-10 amendment 8) — same seat
  'engines', // was `speed` until Story 10.3 (Eric 2026-11-04, epic-10 amendment 8) — same seat
  // `rudder` (was `turning`) sat here until Story 10.6 DELETED it (Eric
  // 2026-11-05, R2: "lets remove rudder, and just give everyone the same turn rate").
  'intel', // was `radarSweep` until Story 10.3 (Eric 2026-11-04, epic-10 amendment 8) — same seat
  'reload',
  // `passiveHealing` sat here (after `reload`) until Story 10.3 DELETED it
  // (Eric 2026-11-04, epic-10 amendment 8): PASSIVE HEALING is gone.
  // --- the CANNON ladder (the deck gun: slotless, always fitted) ------------
  'deckGun',
  // --- the equipment lines and the two gun ladders that sit among them ------
  'lightTorpedo',
  'heavyTorpedo',
  'supercavTorpedo', // an EQUIPMENT line again since Story 10.5 (a consumable from amendment 74 until then) — seat locked
  'navalMines',
  'captiveMines',
  'machineGun', // a LADDER since 8.15 — the machine gun's, slot locked, kind changed
  'flak', // a LADDER since 8.15 — the flak gun's, slot locked, kind changed
  'broadside',
  'starShells',
  // --- the one STUB ----------------------------------------------------------
  // `hullRepair`, `shieldBlock` and `countermeasure` sat here until Story 10.5
  // DELETED them with the kit (Eric 2026-11-05, epic-10 amendment 11).
  // DEPTH CHARGE (Eric ruling 2026-09-19, epic-8 amendments 80/83): Eric's
  // line, mechanism a later story — never dealt.
  'depthCharge',
  // --- the former add-ons (NONE remains since Story 8.17) -------------------
  // Each slot is locked and each KIND changed: `foulingMines` to `equipment`
  // in Story 8.13; `dazzleShells` to `consumable` (FLASH SHELLS) and
  // `phosphorShells` to `equipment` in Story 8.17 (amendments 131/132). Story
  // 9.4 replaced FLASH SHELLS with the FOULING SHELL in the same slot.
  'foulingMines',
  'foulingShell', // Story 9.4 (Eric 2026-10-11); an EQUIPMENT line since Story 10.5
  'phosphorShells', // an EQUIPMENT line since 8.17
  // --- Story 10.9 (Eric 2026-10-27/28, epic-10 amendments 2 and 4) ----------
  // FLASH SHELLS, beside the FOULING SHELL; an EQUIPMENT line since Story
  // 10.5. The four buoys appended after it were DELETED by Story 10.5.
  'dazzleShells',
  // --- Story 10.6 (Eric 2026-11-05): three SHIP ladders ----------------------
  'range', // R1: +10 RANGE a card — the main gun and the secondaries only
  'hullRepair', // R8: the `C` ability's card (was a consumable id until Story 10.5)
  'smokeScreen', // R9: the `V` ability's card (was SMOKE SCREEN's consumable id until Story 9.3)
  // --- Story 10.6: the four one-off WEAPON cards (cap 1, `addon` kind) -------
  'aftTorpedoLauncher', // R6: a second launcher, centered dead astern
  'secondLauncherTube', // R6: +1 tube on EVERY launcher held
  'secondMineRack', // R7: a whole second rack, its own mines and reload
  'expandedMineRacks', // R7: +1 capacity on EACH rack
] as const;

/** One of the 27 authored card lines. */
export type LineId = (typeof LINE_IDS)[number];

/**
 * The three card KINDS (the refit card's meta word, Eric ruling 2026-09-15
 * amendment 8): an `equipment` line whose copy 1 fits a weapon, a universal
 * `ladder` of stat steps, an `addon` that bolts onto equipment it names. The
 * fourth, `consumable` (copies stocked a rack), is DELETED with the kit
 * (2026-11-05, Story 10.5, epic-10 amendment 11).
 *
 * THE ADD-ON KIND IS LIVE AGAIN (Story 10.6, Eric 2026-11-05, R6 / R7 / R10):
 * the four one-off WEAPON cards are cap-1 add-ons whose `appliesTo` names
 * every weapon of their FAMILY (the three torpedoes, the three mines) — they
 * are dealt and pickable only while that family's slot holds one of them
 * (sim/boons.ts `addonHosted`), advance no tier, and carry a stat effect on a
 * family-wide MOUNT count (sim/mountStats.ts). Story 10.7's law reads them as
 * WEAPON upgrades (R11). The DEPTH CHARGE stub is also typed `addon`.
 */
export type LineKind = 'equipment' | 'ladder' | 'addon';

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
 *
 * The `healOnGrant` flag (the grant healed the granted maxHp delta) was
 * DELETED with its only user, HULL POINTS, in Story 10.3 (Eric 2026-11-04,
 * epic-10 amendment 8), together with its validator and the server's
 * heal-on-grant branch.
 */
export interface CatalogLine {
  id: LineId;
  kind: LineKind;
  cap: number;
  tiers: readonly (readonly BoonEffect[])[];
  appliesTo?: readonly EquipmentId[];
  stub?: true;
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
  extra: { appliesTo?: readonly EquipmentId[] } = {},
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
 * effect — CANNON's rung to II is +2 damage, its tier-III rung is +1 damage
 * AND the second turret, its rungs to IV and V are +1 damage each
 * (8 / 10 / 11 / 12 / 13); the MACHINE GUN's magazine steps +3 / +3 / +2 / +3
 * beside its uniform −25 ms (Eric 2026-10-16, Story 9.12 (forge weapon-balance-math; epic-9 amendments 184–185)) — shapes one repeated list cannot say. The `ladder`
 * law holds: a FRESH ARRAY PER RUNG, copied from the caller's lists, so no
 * rung aliases another or the caller's array; the effect objects are
 * deep-frozen with the catalog.
 */
export function ladderSteps(
  id: LineId,
  steps: readonly (readonly BoonEffect[])[],
  extra: { appliesTo?: readonly EquipmentId[] } = {},
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

/** One CANNON rung's whole-number damage step. ×3 PLACEHOLDERS since Story
 *  10.3 (Eric 2026-11-04, epic-10 amendment 8, ruling 10 — the deck guns
 *  retire at 10.4 / 10.5): base 24; +6 on the rung to II, +3 on each of the
 *  rungs to III, IV and V → 24 / 30 / 33 / 36 / 39. (Eric's 2026-10-16 table,
 *  Story 9.12: base 8, +2 / +1 / +1 / +1 → 8 / 10 / 11 / 12 / 13; before it
 *  base 12, +3 at III and V, the 2026-10-13 experiment; base 16 →
 *  16 / 16 / 18 / 18 / 21, 2026-10-02, epic-8 amendment 232). */
const cannonDamage = (step: number): BoonEffect => statEffect('equipment.gun.damage', { add: step });
/** One FLAK rung's damage step: +6 on the base 48 → 48 / 54 / 60 / 66 / 72
 *  (×3 placeholder, Story 10.3 ruling 10; was +2 on 16 → 16 / … / 24, Eric
 *  2026-10-16, Story 9.12; +8 on base 20 → 20 / … / 52, the 2026-10-13
 *  experiment). */
const flakDamage = (): BoonEffect => statEffect('equipment.flak.damage', { add: 6 });

/**
 * An equipment line WITH its ladder: copy 1 fits the weapon and tiers II–V
 * each apply `step` — which is exactly how catalog-v3 §4 writes an equipment
 * row ("Tiers II–V, each: …"), so the sheet's one line is one line here.
 *
 * THE RELOAD BONUS IS NOT IN `step` AND NEVER WILL BE. Every equipment line
 * adds +10 RELOAD a tier to its own reload (Story 10.6, R5 — it replaced the
 * −5 %-per-tier step), and that is DERIVED from the row's tier in
 * sim/stats.ts `applyReloadLaw` — one derivation in the engine rather than
 * the same effect restated on four tiers of every line.
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

/** One upgrade tier of the MACHINE GUN ladder (Eric 2026-10-16, Story 9.12 (forge weapon-balance-math; epic-9 amendments 184–185)): `magStep` shells to
 *  the magazine (+3 / +3 / +2 / +3 → 12 / 15 / 18 / 20 / 23) and −25 ms of
 *  shot delay on every rung (0.30 → 0.20 s). NO damage effect on any rung —
 *  the damage is 5 flat (was +1 at II and IV, 2026-10-02, epic-8 amendment
 *  232); the validator refuses `add: 0`, and a rung carrying the magazine and
 *  delay steps is not empty. */
function machineGunTier(magStep: number): BoonEffect[] {
  return [
    statEffect('equipment.machineGun.maxAmmo', { add: magStep }),
    statEffect('equipment.machineGun.rateMs', { add: -25 }),
    statEffect('equipment.machineGun.rangeU', { add: MACHINE_GUN_RANGE_STEP }), // ruling 125: 6/12 → 7/12
  ];
}

/** One upgrade tier of a TORPEDO line: the tier's whole-number damage step,
 *  +2.5 u/s and +0.125 rad/s of homing on every rung. NO TUBE STEP since
 *  Story 10.6 (Eric 2026-11-05, R4 — it was +0.5 tubes on the rungs to II
 *  and III): extra tubes are the one-off cards' (R6). Damage since Story 10.3
 *  (Eric 2026-11-04, epic-10 amendment 8, ruling 5): light +50 ×4
 *  (200 → 400), heavy +75 ×4 (300 → 600). (Eric 2026-10-16, Story 9.12:
 *  light +10 ×4, 80 → 120; heavy +11 / +11 / +11 / +12, 90 → 135.) */
function torpedoTier(line: 'lightTorpedo' | 'heavyTorpedo', damageStep: number): BoonEffect[] {
  return [
    statEffect(`equipment.${line}.damage`, { add: damageStep }),
    statEffect(`equipment.${line}.speed`, { add: 2.5 }),
    statEffect(`equipment.${line}.homingTurnRate`, { add: 0.125 }),
  ];
}

/** One upgrade tier of NAVAL MINES: the tier's damage step (+25 ×4, 200 → 300
 *  since Story 10.3, Eric 2026-11-04, ruling 6; was +11 / +11 / +11 / +12,
 *  90 → 135, Eric 2026-10-16, Story 9.12) and ×1.1 blast every rung. NO
 *  HELD STEP since Story 10.6 (R4 — it was +1 a rung): the rack's size is the
 *  one-off cards' (R7). */
function navalMineTier(damageStep: number): BoonEffect[] {
  return [
    statEffect('equipment.navalMines.damage', { add: damageStep }),
    statEffect('equipment.navalMines.blastRadius', { mult: 1.1 }),
  ];
}

/** One upgrade tier of CAPTIVE MINES: the captive torpedo's damage step (+25
 *  ×4, 100 → 200 since Story 10.3, Eric 2026-11-04, ruling 6; was +11 / +11 /
 *  +11 / +12, 90 → 135, Eric 2026-10-16, Story 9.12) and +0.075 rad/s of
 *  homing every rung. NO HELD STEP since Story 10.6 (R4 — it was +0.5 on the
 *  rungs to II and III). */
function captiveMineTier(damageStep: number): BoonEffect[] {
  return [
    statEffect('equipment.captiveMines.damage', { add: damageStep }),
    statEffect('equipment.captiveMines.homingTurnRate', { add: 0.075 }),
  ];
}

/** One upgrade tier of STAR SHELLS (catalog-v3 R31 as ruled by Eric
 *  2026-09-29, amendment 130): +2.5 s lit, ×1.1 lit radius, plus the tier's
 *  damage step (+12, +13, +12, +13 → 50 / 62 / 75 / 87 / 100 since Story
 *  10.3, Eric 2026-11-04, ruling 9 — the split is the implementer's; was +2,
 *  +3, +2, +3 → 20 / 22 / 25 / 27 / 30). NO FLARE STEP since Story 10.6
 *  (R4: "Special shells are ONE shot for good" — it was +0.5 flares a rung). */
function starShellTier(damageStep: number): BoonEffect[] {
  return [
    statEffect('equipment.starShells.litDurationMs', { add: 2500 }),
    statEffect('equipment.starShells.litRadius', { mult: 1.1 }),
    statEffect('equipment.starShells.damage', { add: damageStep }),
    statEffect('equipment.starShells.rangeU', { add: STAR_SHELLS_RANGE_STEP }), // ruling 125: 11/12 → 12/12
  ];
}

/** One upgrade tier of PHOSPHOR SHELLS (amendment 131): the damage and burn
 *  steps (since Story 10.3, Eric 2026-11-04, ruling 9: burst +12 / +13 / +12 /
 *  +13 → 50 → 100, burn +5 ×4 → 20 → 40 hp/s — the splits the implementer's),
 *  ×1.1 zone radius, and the duration step when it is non-zero (a zero step
 *  is omitted — the validator refuses an `add: 0`). */
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

/**
 * One upgrade tier of FLASH SHELLS or the FOULING SHELL (Eric 2026-11-05,
 * Story 10.5, epic-10 amendment 11, R7): the burst radius +`radiusStepPerTier`
 * (25 u — 150 → 250 at V). The step is read from CONFIG ONCE, at module load
 * (the `rangeStep` precedent above): the catalog is frozen at load, so a
 * harness `--tune` moves the Tier I base only. The reload's tier half is the
 * derived per-weapon RELOAD bonus (Story 10.6, R5), never authored.
 */
function shellRadiusTier(line: 'dazzleShells' | 'foulingShell', step: number): BoonEffect[] {
  return [statEffect(`equipment.${line}.radius`, { add: step })];
}

/**
 * A ONE-OFF WEAPON CARD (Story 10.6, Eric 2026-11-05, R6 / R7 / R10): a cap-1
 * `addon` naming EVERY weapon of its family in `appliesTo` (so it serves
 * whichever torpedo or mine is held, in either card order), whose one tier is
 * `add: 1` on a family-wide MOUNT count (sim/mountStats.ts). It advances no
 * tier and is dealt / pickable only while the family's slot is filled.
 */
function oneOff(id: LineId, family: SlotFamily, mount: 'torpedoLaunchers' | 'tubesPerLauncher' | 'mineRacks' | 'rackBonus'): CatalogLine {
  return { id, kind: 'addon', cap: 1, tiers: [[statEffect(mount, { add: 1 })]], appliesTo: familyMembers(family) };
}

/** HULL REPAIR's per-card steps (R8), read ONCE at module load (the
 *  `rangeStep` precedent): +hp at once, +hp over time, +score on the
 *  ability's own haste. */
const HULL_REPAIR_CARD: readonly BoonEffect[] = [
  statEffect('repair.instantHp', { add: CONFIG.hullRepair.hpPerCard }),
  statEffect('repair.regenHp', { add: CONFIG.hullRepair.hpPerCard }),
  statEffect('repair.reload', { add: CONFIG.hullRepair.reloadPerCard }),
];

/** SMOKE SCREEN's per-card steps (R9), read ONCE at module load: +score on
 *  the ability's own haste, +life, and one SIZE rung (the disc is derived from
 *  it — sim/abilityStats.ts). */
const SMOKE_SCREEN_CARD: readonly BoonEffect[] = [
  statEffect('smoke.reload', { add: CONFIG.countermeasure.reloadPerCard }),
  statEffect('smoke.lifeMs', { add: CONFIG.countermeasure.lifeMsPerCard }),
  statEffect('smoke.sizeRung', { add: 1 }),
];

/**
 * A STUB line: authored in full shape so the id is final, with EMPTY tiers
 * (nothing to buy) and no mechanism behind it — never dealt, never fitted,
 * refused by every pick (sim/draw.ts `isDealable`, sim/boons.ts
 * `pickRefusal`). It is typed `addon` — the one kind whose shape asks for
 * nothing (no slotFill, no tier target) — because the `consumable` kind it
 * used to carry is deleted (2026-11-05, Story 10.5); the story that builds
 * the mechanism re-types it.
 */
function stubLine(id: LineId): CatalogLine {
  const tiers = Array.from({ length: 5 }, () => [] as readonly BoonEffect[]);
  return { id, kind: 'addon', cap: 5, tiers, stub: true };
}

/**
 * THE production catalog — catalog v3. Key order IS `LINE_IDS` order (pinned).
 *
 * Every authored number cites its ruling:
 *   (HULL POINTS and PASSIVE HEALING were DELETED by Story 10.3, Eric
 *                  2026-11-04, epic-10 amendment 8.)
 *   ARMOR   — +20 Armor per tier, 5 tiers; damage × K / (K + Armor), K = 100
 *                  (Eric 2026-10-13, epic-9 amendments 86–88; rescaled
 *                  +1/K 5 -> +20/K 100 by amendment 144).
 *   POWER (was ARMOR PIERCING until Story 10.3) — +20 Power per tier, 5 tiers; subtracted from
 *                  the victim's Armor at the damage gate, the curve going
 *                  2 − K / (K − E) below zero (Eric 2026-10-14/15, epic-9
 *                  amendments 144–146).
 *   THE EIGHT SHIP LADDERS (Story 10.6, Eric 2026-11-05, R1 — "five cards
 *                  each, identical on every hull"): ARMOR, POWER, INTEL +20 on
 *                  their own index; RELOAD and ENGINES +10 (were +20, Story
 *                  10.3 ruling 4); RANGE +10 (new); HULL REPAIR (R8) and
 *                  SMOKE SCREEN (R9) on the two abilities. RUDDER is DELETED
 *                  (R2). What an index BUYS is derived in sim/indexStats.ts:
 *                  ENGINES 30 u/s × /100 (ruling 15), INTEL 15 RPM × /100
 *                  (uncapped since Story 10.7 R6), RELOAD the haste law
 *                  1 / (1 + (RELOAD − 100) / 100) (ruling 14), RANGE the
 *                  main-gun reach × /100 (the secondaries follow).
 *   THE FOUR ONE-OFFS (Story 10.6, R6 / R7) — AFT TORPEDO LAUNCHER, SECOND
 *                  LAUNCHER TUBE, SECOND MINE RACK, EXPANDED MINE RACKS:
 *                  cap 1 each, the only cards that add capacity.
 *   DECK GUN R14 — damage 24/30/33/36/39 (base 24; +6, +3, +3, +3 — the ×3
 *                  placeholders of Story 10.3 ruling 10 on Eric's 2026-10-16
 *                  8/10/11/12/13) on a FIXED two barrels (CONFIG.gun.barrels,
 *                  no barrel rungs) AND the per-weapon RELOAD bonus per tier,
 *                  4 tiers; the reload half is DERIVED from the tier in
 *                  clampStats (Story 10.6, R5; the −5 % step until then).
 *                  R15 (turret) folded into the CANNON rungs: +1 pool at tier
 *                  III (2026-09-30).
 *   MACHINE GUN — magazine +3/+3/+2/+3 and −25 ms per tier, damage 15 flat
 *                  (×3 of 5, Story 10.3), 4 tiers (Eric 2026-10-16, Story 9.12).
 *   FLAK — damage +6 per tier (48 → 72; ×3 of +2 on 16, Story 10.3), 4
 *                  tiers, blast fixed; +1 pool at tier II only (1/2/2/2/2;
 *                  Eric 2026-10-16, Story 9.12).
 *   BROADSIDE R35 · STAR SHELLS R31 · PHOSPHOR SHELLS · FLASH SHELLS — as
 *                  ruled by Eric 2026-09-29, amendments 130–133 (Story 8.17);
 *                  STAR 50 → 100 and PHOSPHOR 50 + 20/s → 100 + 40/s since
 *                  Story 10.3 (ruling 9).
 *   LIGHT TORPEDO R18 · HEAVY TORPEDO R17 · NAVAL MINES R23/R24 ·
 *   CAPTIVE MINES R25 · FOULING MINES R28 (as amended) — Story 8.13; the
 *                  damage rungs re-ruled by Story 10.3 (rulings 5–6): 200 →
 *                  400, 300 → 600, 200 → 300, 100 → 200, 100 → 200 (FOULING
 *                  MINES gains its first damage step).
 */
export const CATALOG: Catalog = deepFreezeRows({
  // --- the five index ladders that sit at the head (RANGE, HULL REPAIR and
  // SMOKE SCREEN — the other three SHIP ladders — are appended at the foot) --
  // HULL POINTS (+50 max hp ×5, heal on grant) sat here until Story 10.3
  // DELETED it (Eric 2026-11-04, epic-10 amendment 8).
  // THE INDEX CARDS (Story 10.3, Eric 2026-11-04, epic-10 amendment 8,
  // ruling 4; re-stepped by Story 10.6, R1): each is a flat step on ITS OWN
  // INDEX — +20 ARMOR / POWER / INTEL, +10 RELOAD / ENGINES / RANGE — 5 tiers, authored literally (the
  // catalog is frozen at module load — amendment 110's reason). The index
  // seeds at the hull's envelope value (100 on every scaffold hull; the
  // battleship IS the 100 — ruling 3) and the fold derives what it buys
  // (sim/indexStats.ts); no card writes a derived path any more.
  //
  // ARMOR (Story 9.7, Eric 2026-10-13, epic-9 amendments 86–88; rescaled by
  // Story 9.9, amendment 144): +20 Armor per tier (100 → 200 at the cap);
  // effectiveStats derives the published damageMultiplier = K / (K + (Armor −
  // 100)) from it (×1 → ×0.5 at K 100 against an average attacker), and
  // ARMOR is the hull's ramming MASS since Story 10.3 (ruling 2) — a card
  // adds weight now; it still adds no hull (CONFIG.armor holds only Eric's K).
  armor: ladder('armor', 5, [statEffect('armor', { add: 20 })]),
  // POWER (was ARMOR PIERCING, Story 9.9, Eric 2026-10-14/15, epic-9
  // amendments 144–146; renamed `armorPiercing` -> `power`, line AND stat, by
  // Story 10.3): +20 Power per tier (100 → 200). The ATTACKER's stat: the
  // server's damage gate subtracts it from the victim's Armor (+ HUNKER), so
  // it never moves the holder's own damageMultiplier (ruling 11: POWER works
  // in the GATE ONLY — a +20 card is ~+17 % against an average hull).
  power: ladder('power', 5, [statEffect('power', { add: 20 })]),
  // ENGINES (was SPEED, +2.5 u/s of forward top speed, R10; cap 5 since Eric
  // 2026-10-11 / 2026-10-13, epic-9 amendments 27–29, 90–91): +10 ENGINES per
  // tier since Story 10.6 (Eric 2026-11-05, R1 — was +20, the Story 10.3
  // scaffold); top speed = 30 u/s × ENGINES / 100 (ruling 15), so a card is
  // +3 u/s on every hull. Reverse is explicitly untouched (a per-class
  // pass-through).
  engines: ladder('engines', 5, [statEffect('engines', { add: 10 })]),
  // RUDDER (was TURNING) sat here until Story 10.6 DELETED it (Eric
  // 2026-11-05, R2): every captain hull turns at CONFIG.index.turnRate.
  // INTEL (was RADAR SWEEP, +3 rpm, R11 — already exactly +20): +20 INTEL per
  // tier; sweep = 15 RPM × INTEL / 100 (ruling 14), +15 rpm over the five
  // copies. UNCAPPED since Story 10.7, R6 (2026-11-06, epic-10 amendment 13 —
  // Eric: there is no INTEL cap any more, for any reason).
  intel: ladder('intel', 5, [statEffect('intel', { add: 20 })]),
  // RELOAD (R12, re-cut by ruling 14 — "the standard ability haste formula"):
  // +10 RELOAD per tier since Story 10.6 (Eric 2026-11-05, R1 — was +20);
  // cooldownScale = 1 / (1 + (RELOAD − 100) / 100), so 150 = ×0.667 at the
  // cap on a base hull. MULTIPLICATIVE on the index: each card buys a little
  // less than the last. Scope (Story 10.5, R10 / R11; Story 10.6, R1): the
  // main gun, torpedo, mine and special shell — each weapon adding its own
  // tier bonus (R5) — plus the legacy deck-gun rows. NEVER the secondary
  // gun, the Shifts (`RELOAD_UNSCALED_ROWS` in sim/stats.ts), HULL REPAIR
  // or SMOKE SCREEN.
  reload: ladder('reload', 5, [statEffect('reload', { add: 10 })]),
  // PASSIVE HEALING (+0.6 %/s missing hull, −1 s wait ×5) sat here until
  // Story 10.3 DELETED it (Eric 2026-11-04, epic-10 amendment 8) together
  // with the out-of-combat regen itself. THE REGEN IS BACK, the ladder is not
  // (Eric 2026-11-05, Story 10.5, R8): a fixed 2 % of missing hp per second
  // after 15 s unhurt (first 30 s, then "Make it 15, 30 was too long.") —
  // `CONFIG.regen`, sim/regen.ts — with no card.
  // --- the CANNON ladder ----------------------------------------------------
  // DECK GUN (R14 as retuned by Eric 2026-10-16, Story 9.12, then ×3 as a
  // PLACEHOLDER by Story 10.3 ruling 10): base 24, damage steps +6 (to II) and
  // +3 (to III, IV and V) — whole numbers — so the gun deals
  // 24 → 30 → 33 → 36 → 39 exactly (amendment 39: Eric's integers
  // ARE the scale; the fold is still floored once by effects.ts
  // EQUIPMENT_INT_FIELDS, a no-op on integer steps). The OTHER half of
  // the line — the per-weapon RELOAD bonus per tier (Story 10.6, R5) — is NOT an effect: it is derived from
  // `equipment.gun.tier` in clampStats, exactly as every equipment line's step
  // is, so there is one reload derivation in the engine rather than two.
  // `appliesTo: ['gun']` is how this ladder names the row whose tier it moves.
  // THE ONE-OFF TURRET AND BARREL CARDS ARE RUNGS NOW (Eric 2026-09-30, "EVERY
  // upgrade is tiered"; R15/R16 folded in): the rung that reaches tier III
  // (copy 2) adds the second turret (gun pool 1 → 2). The barrel rungs are
  // GONE (Story 9.12): two barrels at every tier, `CONFIG.gun.barrels`, read
  // by sim/stats.ts gunRow. Pool by copies 0..4: 1,1,2,2,2; barrels 2 flat.
  deckGun: ladderSteps(
    'deckGun',
    [
      [cannonDamage(6), cannonRange()], // I → II — 24 → 30
      [cannonDamage(3), statEffect('equipment.gun.maxAmmo', { add: 1 }), cannonRange()], // II → III — 30 → 33 and the second turret
      [cannonDamage(3), cannonRange()], // III → IV — 33 → 36
      [cannonDamage(3), cannonRange()], // IV → V — 36 → 39
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
  // LIGHT TORPEDO (R18; damage re-ruled by Story 10.3, Eric 2026-11-04,
  // ruling 5 — "LIGHT 200 → 400"): tiers II–V each +50 damage, +2.5 u/s and
  // +0.125 rad/s of homing — 400 dmg / 55 u/s / 0.5 rad/s at V (was 80 → 120,
  // +10 ×4, Eric 2026-10-16, Story 9.12). No tube step since Story 10.6 (R4).
  // HOMING IS A TIER STAT, NOT A CARD (amendment 80).
  lightTorpedo: tieredWeaponSteps('lightTorpedo', 'lightTorpedo', [
    torpedoTier('lightTorpedo', 50),
    torpedoTier('lightTorpedo', 50),
    torpedoTier('lightTorpedo', 50),
    torpedoTier('lightTorpedo', 50),
  ]),
  // HEAVY TORPEDO (R17; damage re-ruled by Story 10.3, ruling 5 — "HEAVY
  // 300 → 600"): the shipped torpedo, renamed — damage +75 every rung
  // (300/375/450/525/600; was +11 / +11 / +11 / +12, 90 → 135, Story 9.12
  // ruling 184(d)), +2.5 u/s and +0.125 rad/s every rung: 600 dmg / 75 u/s /
  // 0.5 rad/s at V. No tube step since Story 10.6 (R4).
  heavyTorpedo: tieredWeaponSteps('heavyTorpedo', 'heavyTorpedo', [
    torpedoTier('heavyTorpedo', 75),
    torpedoTier('heavyTorpedo', 75),
    torpedoTier('heavyTorpedo', 75),
    torpedoTier('heavyTorpedo', 75),
  ]),
  // SUPERCAVITATING TORPEDO (Eric 2026-11-05, Story 10.5, epic-10 amendment
  // 11, R4): a TORPEDO-SLOT equipment line again (a consumable from amendment
  // 74 until then) — one tube, 45 s reload. Tiers II–V each +100 damage
  // (400/500/600/700/800 — epic-10 amendment 8(e): "SUPERCAVITATING 400 → 800
  // over their tiers") and nothing else: it never homes, the speed and the
  // single tube are fixed. The per-weapon RELOAD bonus is derived (R5).
  supercavTorpedo: tieredWeapon('supercavTorpedo', 'supercavTorpedo', [
    statEffect('equipment.supercavTorpedo.damage', { add: 100 }),
  ]),
  // NAVAL MINES (R23/R24; damage re-ruled by Story 10.3, Eric 2026-11-04,
  // ruling 6 — "NAVAL 200 → 300 (+25 a rung)"): the shipped mine, renamed —
  // damage +25 every rung (200/225/250/275/300; was +11 / +11 / +11 / +12,
  // 90 → 135, Story 9.12 ruling 184(d)), and every rung ×1.1 blast (the 2/3
  // trip ring follows it): 300 dmg, 70.3 u blast / 46.9 u trip at V. No held
  // step since Story 10.6 (R4 — it was +1 a rung). IT NO LONGER FOULS
  // (amendment 81).
  navalMines: tieredWeaponSteps('navalMines', 'navalMines', [
    navalMineTier(25),
    navalMineTier(25),
    navalMineTier(25),
    navalMineTier(25),
  ]),
  // CAPTIVE MINES (R25, amendments 77/82/84d; damage re-ruled by Story 10.3,
  // ruling 6 — "CAPTIVE 100 → 200 (+25)"): fish damage +25 every rung
  // (100/125/150/175/200; was +11 / +11 / +11 / +12, 90 → 135, Story 9.12),
  // +0.075 rad/s of homing every rung — 200 dmg, 0.3 rad/s at V (no held
  // step since Story 10.6, R4). THE TRIP RING'S ×1.1 STEP
  // IS NOT AN EFFECT: it is derived from the row's tier in sim/stats.ts
  // (120 → 175.7 u since 2026-10-08; 144 → 210.8 before), and the 32 u burst
  // is fixed.
  captiveMines: tieredWeaponSteps('captiveMines', 'captiveMines', [
    captiveMineTier(25),
    captiveMineTier(25),
    captiveMineTier(25),
    captiveMineTier(25),
  ]),
  // MACHINE GUN (amendment 104; the numbers Eric 2026-10-16, Story 9.12 (forge weapon-balance-math; epic-9 amendments 184–185)): the machine gun's LADDER —
  // offered only while it is mounted (sim/draw.ts ladderHost reads
  // `appliesTo`). Tiers II–V step the magazine +3 / +3 / +2 / +3
  // (12 / 15 / 18 / 20 / 23) and −25 ms of shot delay each (0.30 / 0.275 /
  // 0.25 / 0.225 / 0.20 s); damage is 5 FLAT, no damage rungs. The per-weapon
  // RELOAD bonus per tier (Story 10.6, R5) is NOT an effect: it is derived from
  // `equipment.machineGun.tier`, which `appliesTo` makes this line advance —
  // the `deckGun` precedent exactly.
  machineGun: ladderSteps(
    'machineGun',
    [machineGunTier(3), machineGunTier(3), machineGunTier(2), machineGunTier(3)],
    { appliesTo: ['machineGun'] },
  ),
  // FLAK (amendment 105; the numbers Eric 2026-10-16, Story 9.12, ×3 as a
  // PLACEHOLDER by Story 10.3 ruling 10): the flak gun's LADDER, offered
  // only while mounted. Tiers II–V step damage +6 per rung
  // (48 / 54 / 60 / 66 / 72; was +2 on 16 → 24; +8 → 20 / … / 52, the
  // 2026-10-13 experiment); the blast radius does NOT grow; the reload's tier
  // half is the derived per-weapon RELOAD bonus (R5). The rung reaching tier II
  // adds the second TURRET and turrets are CAPPED AT TWO (the third, at IV,
  // is cut): flak pool by copies 0..4 is 1,2,2,2,2.
  flak: ladderSteps(
    'flak',
    [
      [flakDamage(), statEffect('equipment.flak.maxAmmo', { add: 1 }), flakRange()], // I → II — the second turret (Eric 2026-10-02)
      [flakDamage(), flakRange()], // II → III
      [flakDamage(), flakRange()], // III → IV (the third turret cut, Story 9.12)
      [flakDamage(), flakRange()], // IV → V
    ],
    { appliesTo: ['flak'] },
  ),
  // BROADSIDE (R35 as ruled by Eric 2026-09-29, amendment 133): tiers II–V
  // each +1 SPREAD rung (the shipped mount/traverse ladders, rung 1 → 5) and
  // +0.5 turret (5 at III, 6 at V). Damage stays 45 per shell at every tier
  // (the ×3 placeholder of Story 10.3 ruling 10 on the ruled 15);
  // there is no separate damage / turret / spread card. The per-weapon RELOAD
  // bonus is derived (Story 10.6, R5). Its +0.5 turret steps STAY: the line is
  // never dealt (below), so R4's capacity strip does not reach it.
  //
  // BROADSIDE LEAVES THE DEAL (2026-11-05, Story 10.5, Eric, R6: "Leaves the
  // deal"; a special-shell option was rejected). The line stays authored for
  // reference, like the deck-gun ladders, and is never eligible for anyone:
  // its equipment has NO family slot (sim/loadout.ts `EQUIPMENT_FAMILY`), so
  // the draw never deals it, `pickRefusal` refuses it and the slot fold fits
  // it nowhere.
  broadside: tieredWeapon('broadside', 'broadside', [
    statEffect('equipment.broadside.spreadRung', { add: 1 }),
    statEffect('equipment.broadside.turrets', { add: 0.5 }),
    statEffect('equipment.broadside.rangeU', { add: BROADSIDE_RANGE_STEP }), // ruling 125: 5/12 → 6/12
  ]),
  // STAR SHELLS (R31 as ruled by Eric 2026-09-29, amendment 130): tiers II–V
  // each +2.5 s lit, ×1.1 lit radius — 20 s lit, r241.6 at V, ONE flare at
  // every tier since Story 10.6 (R4; was +0.5 flares a rung) — and the flare's burst damage 50 / 62 / 75 / 87 / 100 (Story 10.3,
  // Eric 2026-11-04, ruling 9: "STAR SHELLS 50 → 100", the +12/+13/+12/+13
  // split the implementer's; was 20 → 30; amendment 39's "structurally
  // damageless" is SUPERSEDED). The per-weapon RELOAD bonus is derived (R5).
  starShells: tieredWeaponSteps('starShells', 'starShells', [
    starShellTier(12),
    starShellTier(13),
    starShellTier(12),
    starShellTier(13),
  ]),
  // --- the one STUB ----------------------------------------------------------
  // HULL REPAIR, SHIELD BLOCK and the COUNTERMEASURE line sat here until Story
  // 10.5 deleted them with the kit (Eric 2026-11-05, epic-10 amendment 11):
  // HULL REPAIR and SMOKE are the `C` / `V` abilities (sim/abilities.ts,
  // CONFIG.hullRepair / CONFIG.countermeasure), the shield is gone.
  // DEPTH CHARGE (amendment 83): Eric's line, mechanism a later story — a STUB
  // so the id is final.
  depthCharge: stubLine('depthCharge'),
  // --- the former add-ons (NONE remains since Story 8.17) -------------------
  // FOULING MINES (R28 as superseded by amendment 81): its OWN tiered
  // EQUIPMENT line now, not an add-on — tiers II–V each ×1.1 blast (the trip
  // ring follows), −0.05 slow factor (the +1 held step is GONE since Story
  // 10.6, R4) AND, since Story 10.3 (Eric
  // 2026-11-04, ruling 6: "FOULING 100 → 200 (+25 — the fouling mine's damage
  // was FIXED at 10 with no step; it now has one)"), +25 damage. The 5 s
  // window never moves. UNHOMED: it sat in no default deck.
  foulingMines: tieredWeapon('foulingMines', 'foulingMines', [
    statEffect('equipment.foulingMines.damage', { add: 25 }),
    statEffect('equipment.foulingMines.blastRadius', { mult: 1.1 }),
    statEffect('equipment.foulingMines.slowFactor', { add: -0.05 }),
  ]),
  // HEAT SEEKING (R32) is CUT with the missile (Story 8.15, amendment 89e).
  // FOULING SHELL (Story 9.4, Eric 2026-10-11, epic-9 amendments 61–68): one
  // 360° shell whose burst leaves a stationary zone that slows every hull
  // whose outline touches it, the firer's included. A SPECIAL-SHELL-SLOT
  // equipment line since Story 10.5 (Eric 2026-11-05, epic-10 amendment 11,
  // R4 / R7): 30 s reload; tiers II–V each +25 u of zone radius (150 → 250).
  // CONFIG.foulingShell.
  foulingShell: tieredWeapon(
    'foulingShell',
    'foulingShell',
    shellRadiusTier('foulingShell', CONFIG.foulingShell.radiusStepPerTier),
  ),
  // PHOSPHOR SHELLS (R33/R34 as ruled by Eric 2026-09-29, amendment 131): its
  // OWN tiered 360° weapon, no longer a star-shell add-on. Tiers II–V: damage
  // +12/+13/+12/+13 (50 → 100) and burn +5 ×4 hp/s (20 → 40) since Story 10.3
  // (Eric 2026-11-04, ruling 9: "PHOSPHOR 50 burst + 20/s burn → 100 + 40/s";
  // was +2/+3/+2/+3, 10 → 20 and +1/+1/+1/+2, 5 → 10), zone radius ×1.1 each
  // (100 → 146.41 u), duration +0/+1/+0/+1 s (8 / 8 / 9 / 9 / 10 s).
  // The per-weapon RELOAD bonus is derived (Story 10.6, R5).
  phosphorShells: tieredWeaponSteps('phosphorShells', 'phosphorShells', [
    phosphorTier(12, 5, 0),
    phosphorTier(13, 5, 1000),
    phosphorTier(12, 5, 0),
    phosphorTier(13, 5, 1000),
  ]),
  // --- Story 10.9 (Eric 2026-10-27/28, epic-10 amendments 2 and 4) ----------
  // FLASH SHELLS (epic-8 amendment 132, restored by 10.9): one 360° shell on
  // the FOULING SHELL's click path (same reach) whose burst whites out every
  // non-owner hull inside it. A SPECIAL-SHELL-SLOT equipment line since Story
  // 10.5 (Eric 2026-11-05, epic-10 amendment 11, R4 / R7): 30 s reload; tiers
  // II–V each +25 u of burst radius (150 → 250). CONFIG.flashShells.
  // (The four buoys that followed it here are DELETED by Story 10.5.)
  dazzleShells: tieredWeapon(
    'dazzleShells',
    'dazzleShells',
    shellRadiusTier('dazzleShells', CONFIG.flashShells.radiusStepPerTier),
  ),
  // --- Story 10.6 (Eric 2026-11-05): three SHIP ladders ----------------------
  // RANGE (R1): +10 RANGE per tier — the main gun's reach × RANGE / 100 and,
  // through it, the secondaries' (+100 u / +50 u a card at today's scale).
  // Star / phosphor / flash / fouling-shell reach is untouched.
  range: ladder('range', 5, [statEffect('range', { add: 10 })]),
  // HULL REPAIR (R8, R15): the `C` ability's card. Each +20 hp at once and +20
  // over the FIXED 5 s window (100 + 100 → 200 + 200 at five), and +5 to the
  // ability's own score of 100 — cooldown 75 × 100 ÷ (100 + 5 × cards), 60 s
  // at five. The ship's RELOAD is never applied (sim/abilityStats.ts).
  hullRepair: ladder('hullRepair', 5, HULL_REPAIR_CARD),
  // SMOKE SCREEN (R9): the `V` ability's card. Each +5 to the ability's own
  // score of 100 (60 s → 48 s at five), +1 s of cloud life (15 → 20 s) and
  // one size rung (×1.1 — today's 150 → 300 u is the two-card size).
  smokeScreen: ladder('smokeScreen', 5, SMOKE_SCREEN_CARD),
  // --- Story 10.6: the four one-off WEAPON cards (R6 / R7 / R10) -------------
  // Cap 1 each, dealt only once their family slot is filled, applying to
  // whichever torpedo or mine is held, in either order.
  aftTorpedoLauncher: oneOff('aftTorpedoLauncher', 'torpedo', 'torpedoLaunchers'), // the fore launcher's twin, dead astern
  secondLauncherTube: oneOff('secondLauncherTube', 'torpedo', 'tubesPerLauncher'), // +1 tube on EVERY launcher (max four tubes)
  secondMineRack: oneOff('secondMineRack', 'mine', 'mineRacks'), // a whole second rack, its own mines and reload
  expandedMineRacks: oneOff('expandedMineRacks', 'mine', 'rackBonus'), // +1 capacity on EACH rack (max 8 naval / fouling, 4 captive)
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
 * equipment no card fits (the mounted guns and the three Shifts).
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
const LINE_KINDS: readonly string[] = ['equipment', 'ladder', 'addon'];

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
  // The `healOnGrant` rules lived here until Story 10.3 deleted the flag with
  // HULL POINTS (Eric 2026-11-04, epic-10 amendment 8).
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
 * camelCase id, known kind, `tiers.length === cap`, valid effects, real
 * `appliesTo` equipment.
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
 *  2. NO LIVE ADD-ON ON DEAD EQUIPMENT. An add-on bolts onto the equipment
 *     it names; if EVERY line it names is a stub, the card is dealt into live
 *     decks (it is not a stub itself) and buys nothing. An add-on with at
 *     least one live target is fine. A STUB add-on is exempt — it is never
 *     dealt either.
 *  3. A LIVE ADD-ON NAMES A HOST THAT CAN BE ABOARD (Story 10.6, R10). An
 *     add-on is dealt and pickable only while a named equipment sits in its
 *     FAMILY slot (sim/boons.ts `addonHosted`), so one that names nothing, or
 *     only equipment with no family slot (a mounted gun, a Shift, BROADSIDE),
 *     could never be dealt — authored dead. Refused.
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
    if (line.kind === 'addon' && line.stub !== true) errs.push(...validateLiveAddon(line, catalog));
  }
  return errs;
}

/** Rules 2 and 3 of `validateCrossLine`, for one NON-STUB add-on. */
function validateLiveAddon(line: CatalogLine, catalog: Catalog): string[] {
  const targets = line.appliesTo ?? [];
  const live = targets.filter((eq) => {
    const owner = lineForEquipment(eq, catalog);
    return owner === undefined || owner.stub !== true;
  });
  if (targets.length > 0 && live.length === 0) {
    return [`${line.id}: live add-on applies only to STUB equipment (${targets.join(', ')})`];
  }
  if (!targets.some((eq) => familySlotFor(eq) !== null)) {
    return [`${line.id}: live add-on names no equipment a family slot can hold — it could never be dealt`];
  }
  return [];
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

/** Total physical cards in a catalog (Σ cap) — 116 since Story 10.6 (102 after 10.5, 137 after 10.3, 147 after 10.9). */
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
