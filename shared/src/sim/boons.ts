// THE CARD FOLD (Story 2.5's boon effect engine, re-cut for catalog v3 in
// Story 8.1) — the ratified "two homes + hooks" law. Applying a card may touch
// exactly these lawful paths:
//   1. `stat` effects flow ONLY through effectiveStats() (sim/stats.ts calls
//      applyCardStats — the desync firewall stays intact);
//   2. `doctrine` effects fold ONLY into the per-equipment VERB BOOLEANS of
//      EffectiveStats (same fold, same firewall — HOOK_REGISTRY stays EMPTY);
//   3. `slotFill` effects mutate ONLY the one LoadoutSlot[] structure, through
//      applySlotEffect below — used INCREMENTALLY by the server and REPLAYED by
//      the client over loadoutFor output, into the equipment's FAMILY SLOT
//      (Story 10.5: `Q` torpedo, `E` mine, `R` special shell — one kind per
//      slot, sim/loadout.ts `familySlotFor`);
//   4. `behavior(hookId, params)` executes registered hooks (sim/hooks.ts)
//      per-tick on BOTH sides, so prediction survives.
// The fifth path, `stock` (a consumable copy into its kit slot), is DELETED
// with the kit (2026-11-05, Story 10.5, epic-10 amendment 11).
// Nothing else moves — a stat-only card leaves the loadout reference-equal, a
// slot-only card leaves stats byte-identical (property-pinned in tests).
//
// WHAT STORY 8.1 CHANGED. The fold no longer walks a list of resolved defs in
// PICK ORDER. It COUNTS COPIES PER LINE and then walks the CATALOG in its own
// fixed order, applying `tiers[0..copies-1]` of each line. Two consequences,
// both deliberate:
//   - ORDER-INDEPENDENCE IS STRUCTURAL. Permuting the card list cannot change
//     the fold, because the list's order is never read (property-pinned over
//     ≥200 seeded shuffles in catalog.test.ts). `validateCatalog` closes the
//     remaining hazard by refusing a stat path that takes `add` from one line
//     and `mult` from another.
//   - TIERS ARE DERIVED, NOT EFFECTS. `equipment[id].tier` is written from the
//     copy count (see applyLineTier), which is what lets the per-weapon RELOAD
//     bonus (Story 10.6, R5) live in ONE place (sim/stats.ts clampStats) instead of being
//     restated as an effect on every tier of every equipment line.
//
// THE TWO RE-PIN HOMES stay exactly two: this fold's tail (rePinDerived, which
// covers a mid-fold write to a path a derived number rides) and clampStats (the
// firewall's unconditional output pass). Nothing else re-derives.

import type { EquipmentId, LoadoutSlot, ShiftId } from './loadout.js';
import { deriveAbilityStats } from './abilityStats.js';
import { DEFAULT_SHIFT, equipmentMaxAmmo, familySlotFor, loadoutFor } from './loadout.js';
import {
  BOON_STAT_PATH_SET,
  DOCTRINE_MODES,
  type BoonBehaviorEffect,
  type BoonDoctrineEffect,
  type BoonEffect,
  type BoonStatEffect,
  type DoctrineWeapon,
} from './effects.js';
import {
  CATALOG,
  boonStackCount,
  cardCounts,
  lineForEquipment,
  tierTargetOf,
  type Catalog,
  type CatalogLine,
} from './catalog.js';
import {
  broadsideMountSpread,
  broadsideTraverse,
  clampSpreadRung,
  deriveMineRings,
  publishedDamageMultiplier,
  type EffectiveStats,
} from './stats.js';
import { deriveIndexStats } from './indexStats.js';

/** Write one stat effect onto the (freshly-built, mutation-safe) stats tree.
 *  Paths are one, two or three segments deep (`maxHp`, `kinematics.turnRate`,
 *  `equipment.gun.damage`); the walk is generic so widening the tree needs no
 *  change here. */
function applyStatEffect(stats: EffectiveStats, e: BoonStatEffect): void {
  if (!BOON_STAT_PATH_SET.has(e.path)) return; // off-whitelist (untyped effect): fail-closed
  const segs = e.path.split('.');
  let node = stats as unknown as Record<string, unknown>;
  for (let i = 0; i < segs.length - 1; i += 1) {
    const next = node[segs[i]];
    if (typeof next !== 'object' || next === null) return; // malformed path: fail-closed
    node = next as Record<string, unknown>;
  }
  const key = segs[segs.length - 1];
  const cur = node[key];
  if (typeof cur !== 'number') return;
  const v = cur * (e.mult ?? 1) + (e.add ?? 0);
  // Sanity gate: EVERY whitelisted stat is a strictly POSITIVE scalar. Zero,
  // negative, NaN and Infinity are all invalid effect data — skip the
  // assignment rather than poison the stats tree. Deterministic on both sides.
  if (!Number.isFinite(v) || v <= 0) return;
  node[key] = v;
}

/**
 * Fold one doctrine effect into its equipment's verb state — fail-closed: an
 * unknown equipment or an unknown verb for that equipment moves nothing.
 *
 * The verb NAMES A BOOLEAN FIELD on the equipment's row and the fold SETS IT
 * TRUE, so two verbs on one weapon compose instead of the second silently
 * erasing the first. The DOCTRINE_MODES membership test is what makes the
 * dynamic field write safe — only declared verb names, which ARE the boolean
 * field names, can reach it.
 */
function applyDoctrineEffect(stats: EffectiveStats, e: BoonDoctrineEffect): void {
  if (!Object.hasOwn(DOCTRINE_MODES, e.weapon)) return;
  const weapon = e.weapon as DoctrineWeapon;
  if (!(DOCTRINE_MODES[weapon] as readonly string[]).includes(e.mode)) return;
  (stats.equipment[weapon] as unknown as Record<string, boolean>)[e.mode] = true;
}

/**
 * Write the LADDER RUNG a line's copies bought onto its target equipment row.
 * An `equipment` line's tier IS its copies held (copy 1 is the bare weapon);
 * the slotless DECK GUN ladder's is `1 + copies`, because its tier I ships
 * equipped. An add-on moves no tier (it bolts a verb or a mount on). See
 * sim/stats.ts applyReloadLaw for what the number then buys.
 */
function applyLineTier(stats: EffectiveStats, line: CatalogLine, copies: number): void {
  // A LINE NOBODY HOLDS WRITES NOTHING. Every row is already seeded at tier 1
  // by baseEquipment, so a zero-copy write could only ever restate that — or,
  // where two lines name one row, OVERWRITE the tier the held one just bought
  // with the base, making the result a fact about catalog order. Pinned in
  // stats.test.ts.
  if (copies <= 0) return;
  const target = tierTargetOf(line);
  if (target === undefined) return;
  // An UNFITTED equipment line sits at tier 1, not tier 0: tier I IS the bare
  // weapon, so the row's base numbers and its ×1.00 reload are what tier 1
  // means, whether or not the hull has actually fitted it.
  stats.equipment[target].tier = line.kind === 'ladder' ? 1 + copies : Math.max(1, copies);
}

/**
 * Run `visit` over every EFFECT the held cards actually buy: for each line in
 * CATALOG order, tiers 1..copies (capped at the line's `cap`). THE one
 * traversal — the stat fold, the slot replay and the behavior collection all
 * share it, so they can never disagree about what a hand of cards contains.
 */
function forEachHeldEffect(
  cards: readonly string[],
  catalog: Catalog,
  visit: (e: BoonEffect, line: CatalogLine, copies: number) => void,
): void {
  const counts = cardCounts(cards, catalog);
  for (const key of Object.keys(catalog)) {
    const line = catalog[key];
    if (line === undefined) continue;
    const copies = counts.get(key) ?? 0;
    if (copies <= 0) continue;
    for (let k = 0; k < copies; k += 1) {
      for (const e of line.tiers[k] ?? []) visit(e, line, copies);
    }
  }
}

/** Re-pin every DERIVED number that a mid-fold write could have left stale.
 *  The sibling of the clampStats pass; these two sites are the only ones. */
function rePinDerived(stats: EffectiveStats): void {
  const eq = stats.equipment;
  // THE INDEX DERIVATIONS (Story 10.3, sim/indexStats.ts): speed from ENGINES,
  // sweep (and its period, capped) from INTEL, the cooldown scale from RELOAD
  // (the turn rate is the one baseline since Story 10.6 — R2) — idempotent in
  // the authored indices, so a mid-fold index write can never leave a derived
  // number stale. The ONE-SHOT RANGE, RELOAD-LAW and MOUNT-CAPACITY multiplies
  // are NOT here (they would double-apply); they live in clampStats alone.
  deriveIndexStats(stats);
  // THE TWO ABILITIES' DERIVED NUMBERS (Story 10.6, sim/abilityStats.ts):
  // each cooldown from its own score, the smoke disc from its rung —
  // idempotent, so a mid-fold score write never leaves them stale.
  deriveAbilityStats(stats);
  // NO rangeU RE-PIN (Story 9.8, ruling 125): every weapon's reach is a
  // stat-addressable dial the cards step, so it is folded, never derived.
  // The broadside TRAVERSE and MOUNT SPREAD both read their authored ladders
  // off the folded SPREAD rung — derived for the same reason.
  eq.broadside.spreadRung = clampSpreadRung(eq.broadside.spreadRung);
  eq.broadside.traverseRad = broadsideTraverse(eq.broadside.spreadRung);
  eq.broadside.mountSpreadRad = broadsideMountSpread(eq.broadside.spreadRung);
  // THE LADDER IS ONE NUMBER (Eric ruling 2026-08-16): truesight is the 4/12
  // rung of intel range (Story 9.8, epic-9 amendment 103 — was 4/8, radar / 2).
  stats.sightRange = stats.radarRange / 3;
  // ARMOR'S DAMAGE MULTIPLIER (Story 9.7, epic-9 amendments 86–88) rides the
  // whitelisted `armor` path through the one formula, so a mid-fold Armor
  // write can never leave it stale (clampStats floors Armor and re-derives).
  // Victim-only (amendment 120(e)): `power` never enters it here.
  stats.damageMultiplier = publishedDamageMultiplier(stats.armor);
  // EVERY MINE RING, all three kinds, through the one derivation
  // (sim/stats.ts deriveMineRings). A contact mine's trip ring rides its blast
  // radius; the captive's rides its TIER and its burst is pinned.
  //
  // IT MAY RUN HERE NOW. The captive chassis used to be excluded from this
  // pass because its old "swap and triple" derivation CONSUMED the blast
  // radius it overwrote — non-idempotent, so exactly one home. Story 8.13
  // replaced that with a tier-driven trip ring and a fixed burst (epic-8
  // amendment 84d), which reads nothing it writes, so both re-pin homes may
  // call it and a mid-fold blast write can never leave a ring stale.
  deriveMineRings(eq);
}

/**
 * Fold every `stat` and `doctrine` effect the held `cards` buy into `stats` IN
 * PLACE, plus each line's derived TIER. Consumed ONLY by effectiveStats()
 * (sim/stats.ts): the one legal path from cards to derived numbers, so the
 * desync firewall holds. `slotFill` and `behavior` effects are no-ops here —
 * their homes are the loadout and the hook registry.
 */
export function applyCardStats(
  stats: EffectiveStats,
  cards: readonly string[],
  catalog: Catalog = CATALOG,
): void {
  const counts = cardCounts(cards, catalog);
  for (const key of Object.keys(catalog)) {
    const line = catalog[key];
    if (line === undefined) continue;
    applyLineTier(stats, line, counts.get(key) ?? 0);
  }
  forEachHeldEffect(cards, catalog, (e) => {
    if (e.kind === 'stat') applyStatEffect(stats, e);
    else if (e.kind === 'doctrine') applyDoctrineEffect(stats, e);
  });
  rePinDerived(stats);
}

/** Every `behavior` effect the held cards buy, in fold order — the per-tick
 *  hook workload for hookKinematics (callers cache it beside their stats). */
export function cardBehaviors(cards: readonly string[], catalog: Catalog = CATALOG): BoonBehaviorEffect[] {
  const out: BoonBehaviorEffect[] = [];
  forEachHeldEffect(cards, catalog, (e) => {
    if (e.kind === 'behavior') out.push(e);
  });
  return out;
}

/** A fitted slot with a fresh full pool at current stats — exactly the
 *  loadoutFor / server freshAmmo semantics. */
function freshSlotState(stats: EffectiveStats, id: EquipmentId): LoadoutSlot['state'] {
  return { n: equipmentMaxAmmo(stats, id), reloadMsLeft: 0 };
}

/**
 * WHY A PICK IS REFUSED, or `null` when it is legal (Story 8.14 review, F1/F2).
 *
 * THE ONE PREDICATE behind every "can this ship take this card" question in the
 * engine: `World.refusesCard` (and therefore `applyCard`, the dev spawn fit and
 * every directed grant), `World.spendCard` (which returns BEFORE consuming the
 * level, so a refused pick leaves the offer byte-identical), the client's
 * greyed refit card, the bot spend scorer and the batch-sim spend instrument.
 * (The level-zero guarantee's `usableLines` that also ran it was retired with
 * the guarantee — Story 10.7, 2026-11-06, epic-10 amendment 13.)
 *
 * The four refusals, in the order they are decided:
 *   - `stub` — the line's mechanism is not built (amendment 11), or the id is
 *     not an OWN PROPERTY of the catalog at all (fail closed: an unknown id and
 *     a prototype key are both refusals, never a grant).
 *   - `atCap` — the ship already holds `cap` copies.
 *   - `noWeaponSlot` — copy 1 of an equipment line (the bare weapon) with
 *     NOWHERE TO GO. Since Story 10.5 (Eric 2026-11-05, epic-10 amendment 11 —
 *     one kind per slot for the match) that means: the weapon's FAMILY slot
 *     already holds a DIFFERENT kind (HEAVY or SUPERCAV after LIGHT is
 *     slotted), or the weapon has no family slot at all (BROADSIDE, which left
 *     the deal — R6), or the slot is missing from a malformed array. Before
 *     10.5 it meant "all three of Q/E/R occupied". The draw never offers such
 *     a line (sim/draw.ts), so this is the forced-pick gate.
 *   - `noHost` — an ADD-ON (since Story 10.6: the four one-off WEAPON cards,
 *     AFT TORPEDO LAUNCHER, SECOND LAUNCHER TUBE, SECOND MINE RACK and
 *     EXPANDED MINE RACKS) whose FAMILY SLOT holds none of the equipment it
 *     names (Eric 2026-11-05, R10: "dealt only once their family slot is
 *     filled"). The draw never offers one either (`addonHosted`).
 *
 * A TIER-UP IS NEVER A SLOT QUESTION: copies 2..cap of a held line are legal
 * whatever the row holds — the weapon is already aboard.
 *
 * Pure over plain data — the held card ids (one entry per copy) and the
 * replayed slot ids — so both sides evaluate one function over one set of
 * facts and can never disagree about whether a pick is legal. A short or
 * malformed slot array is fail-closed: a missing slot is never "empty".
 *
 * This enum is a reason for the ENGINE, not player-facing text.
 */
export type PickRefusal = 'stub' | 'atCap' | 'noWeaponSlot' | 'noHost';

export function pickRefusal(
  held: readonly string[],
  slotIds: readonly (EquipmentId | null)[],
  lineId: string,
  catalog: Catalog = CATALOG,
): PickRefusal | null {
  const line = Object.hasOwn(catalog, lineId) ? catalog[lineId] : undefined;
  if (line === undefined || line.stub === true) return 'stub';
  const copies = boonStackCount(held, lineId);
  if (copies >= line.cap) return 'atCap';
  if (line.kind === 'equipment' && copies === 0) return familySlotRefusal(line, slotIds);
  if (line.kind === 'addon' && !addonHosted(line, slotIds)) return 'noHost';
  return null;
}

/**
 * IS AN ADD-ON'S HOST ABOARD? True iff some equipment the line names in
 * `appliesTo` sits in its own FAMILY SLOT (Story 10.6, Eric 2026-11-05, R10 /
 * I8): the torpedo one-offs name every torpedo, so any torpedo in `Q` hosts
 * them; the mine one-offs, any mine in `E`. Read off the SLOT IDS — the
 * replayed loadout — so the draw, the pick and the client's greyed card ask
 * the one question over one set of facts. Fail-closed: no `appliesTo`, a
 * slotless target or a short array is "not hosted". It REPLACES the add-on
 * rule "a host held OR any weapon slot still open" (amendment 89b), which
 * let an add-on be dealt ahead of its host.
 */
export function addonHosted(line: CatalogLine, slotIds: readonly (EquipmentId | null)[]): boolean {
  return (line.appliesTo ?? []).some((eq) => {
    const slot = familySlotFor(eq);
    return slot !== null && slotIds[slot] === eq;
  });
}

/** The slot half of `pickRefusal`: copy 1 needs its weapon's FAMILY slot
 *  EMPTY. No family slot (BROADSIDE), a missing slot or any occupant — it can
 *  only be a different kind, since `copies === 0` — is a refusal. */
function familySlotRefusal(line: CatalogLine, slotIds: readonly (EquipmentId | null)[]): PickRefusal | null {
  const weapon = tierTargetOf(line);
  const slot = weapon === undefined ? null : familySlotFor(weapon);
  return slot !== null && slotIds[slot] === null ? null : 'noWeaponSlot';
}

/**
 * Apply ONE effect's slot consequence to a live loadout IN PLACE — THE single
 * slot-mutation path of the engine, shared verbatim by the server (incremental,
 * on grant) and the client (slotsWithCards, replayed over loadoutFor output).
 * `stat`/`behavior`/`doctrine` effects are structural no-ops here.
 *
 * THE FILL RULE (Story 10.5, Eric 2026-11-05, epic-10 amendment 11): a
 * `slotFill` goes into the equipment's FAMILY SLOT — a torpedo into `Q`, a
 * mine into `E`, a special shell into `R` (sim/loadout.ts `familySlotFor`) —
 * and ONLY while that slot is empty. It touches NOTHING else: no other slot's
 * state object is even re-read, so fitting a weapon can never disturb another
 * slot's reload timer (pinned by identity in boons.test.ts). Which slot a
 * weapon lands in is therefore a fact about its KIND, never about the order
 * the cards arrived in (the first-empty-slot rule of Story 8.5 is retired).
 *
 * Silent no-ops, each leaving the loadout untouched: a STUB line, equipment
 * with NO family slot (BROADSIDE — R6), a family slot that is already
 * occupied (the same kind: already fitted; another kind: one kind per slot),
 * and a malformed array missing the slot.
 */
export function applySlotEffect(
  loadout: LoadoutSlot[],
  effect: BoonEffect,
  stats: EffectiveStats,
  catalog: Catalog = CATALOG,
): void {
  if (effect.kind !== 'slotFill') return; // not a slot home
  // NEVER FIT A STUB WEAPON. A stub line carries a real `slotFill` on copy 1
  // with NO module behind it, and this is the ONE gate both sides share: the
  // client replays cards through slotsWithCards and the server replays them
  // again on respawn, so a guard living only in the server's grant path leaves
  // a phantom weapon fittable on both of those routes. Catalog-driven, so a
  // line stops being guarded the moment its `stub` flag comes off.
  const line = lineForEquipment(effect.equipmentId, catalog);
  if (line?.stub === true) return;
  const index = familySlotFor(effect.equipmentId);
  if (index === null) return; // no family slot (BROADSIDE left the deal — R6)
  const slot = loadout[index];
  if (slot === undefined || slot.equipmentId !== null) return; // occupied (or malformed): one kind per slot
  slot.equipmentId = effect.equipmentId;
  slot.state = freshSlotState(stats, effect.equipmentId);
}

/**
 * The client-side loadout derivation (ONE derivation, both sides): the
 * universal loadoutFor fit with every held card's slot effects replayed over
 * it. `shift` is the SEAT'S pick
 * (slot 1 — Story 10.4; `OwnShip.shift` off the wire client-side). Slot 0 is
 * the main battery on every captain. There is no kit parameter since Story
 * 10.5 (the kit is retired).
 *
 * THE REPLAY WALKS THE CARDS IN FIT ORDER, and since Story 10.5 the order only
 * matters between two KINDS OF ONE FAMILY — the first one fitted holds the
 * slot for the match, exactly as the server's incremental grants decided it
 * (a legal hand never holds two, `pickRefusal` refuses the second). Between
 * families the order is irrelevant: each kind lands in its own family's slot.
 * Stats are order-INDEPENDENT by construction.
 *
 * Pool STATE here is the fresh full-pool baseline (the live counts ride
 * OwnShip.ammo, slot-aligned).
 */
export function slotsWithCards(
  stats: EffectiveStats,
  cards: readonly string[],
  catalog: Catalog = CATALOG,
  shift: ShiftId = DEFAULT_SHIFT,
): LoadoutSlot[] {
  // Slot 0 is the MAIN BATTERY and slot 1 the SEAT'S Shift (Story 10.4): the
  // same `loadoutFor` the spawn ran, so a replay on either side re-mounts what
  // the captain picked, never a literal.
  const loadout = loadoutFor(stats, shift);
  const seen = new Map<string, number>();
  for (const id of cards) {
    for (const e of copyEffects(id, seen, catalog)) applySlotEffect(loadout, e, stats, catalog);
  }
  return loadout;
}

/** The effects the NEXT copy of `id` buys (empty past the cap or off-catalog); counts the copy in `seen`. */
function copyEffects(id: string, seen: Map<string, number>, catalog: Catalog): readonly BoonEffect[] {
  if (!Object.hasOwn(catalog, id)) return [];
  const line = catalog[id];
  if (line === undefined) return [];
  const copy = (seen.get(id) ?? 0) + 1;
  seen.set(id, copy);
  if (copy > line.cap) return []; // past the physical cap: buys nothing
  return line.tiers[copy - 1] ?? [];
}
