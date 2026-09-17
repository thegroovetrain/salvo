// THE CARD FOLD (Story 2.5's boon effect engine, re-cut for catalog v3 in
// Story 8.1) — the ratified "two homes + hooks" law. Applying a card may touch
// exactly these lawful paths:
//   1. `stat` effects flow ONLY through effectiveStats() (sim/stats.ts calls
//      applyCardStats — the desync firewall stays intact);
//   2. `doctrine` effects fold ONLY into the per-equipment VERB BOOLEANS of
//      EffectiveStats (same fold, same firewall — HOOK_REGISTRY stays EMPTY);
//   3. `slotFill` effects mutate ONLY the one LoadoutSlot[] structure, through
//      applySlotEffect below — used INCREMENTALLY by the server and REPLAYED by
//      the client over loadoutFor output, taking the first empty WEAPON slot;
//   4. `behavior(hookId, params)` executes registered hooks (sim/hooks.ts)
//      per-tick on BOTH sides, so prediction survives;
//   5. `stock` effects mutate the same LoadoutSlot[] through the same
//      applySlotEffect, in the four-wide BELT (Story 8.7): the slot that
//      already holds the line, else the first empty belt slot, else nowhere.
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
//     copy count (see applyLineTier), which is what lets the −5 %/tier reload
//     step live in ONE place (sim/stats.ts clampStats) instead of being
//     restated as an effect on every tier of every equipment line.
//
// THE TWO RE-PIN HOMES stay exactly two: this fold's tail (rePinDerived, which
// covers a mid-fold write to a path a derived number rides) and clampStats (the
// firewall's unconditional output pass). Nothing else re-derives.

import type { EquipmentId, LoadoutSlot, SlotItemId } from './loadout.js';
import { CONSUMABLE_SLOTS, WEAPON_SLOTS, equipmentMaxAmmo, isConsumableId, loadoutFor } from './loadout.js';
import { CONFIG } from '../constants.js';
import {
  BOON_STAT_PATH_SET,
  DOCTRINE_MODES,
  type BoonBehaviorEffect,
  type BoonDoctrineEffect,
  type BoonEffect,
  type BoonStatEffect,
  type BoonStockEffect,
  type ConsumableId,
  type DoctrineWeapon,
} from './effects.js';
import { CATALOG, cardCounts, lineForEquipment, tierTargetOf, type Catalog, type CatalogLine } from './catalog.js';
import {
  broadsideMountSpread,
  broadsideTraverse,
  clampSpreadRung,
  mineTriggerRadius,
  type EffectiveStats,
} from './stats.js';

/** ms per minute — sweepRpm -> sweepPeriodMs re-derivation after the fold. */
const MS_PER_MINUTE = 60000;

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
 * equipped. Every other kind moves no tier (an add-on bolts a verb on; a
 * consumable stocks a rack). See sim/stats.ts reloadTierScale for what the
 * number then buys.
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
  stats.sweepRpm = Math.min(stats.sweepRpm, CONFIG.vision.sweepRpmMax);
  stats.sweepPeriodMs = MS_PER_MINUTE / stats.sweepRpm;
  // Gun/star-shell range is radarRange, always; the broadside rides the same
  // number one rung short (the 5/8 muzzle rung). None is stat-addressable, so
  // a FUTURE fold writing the whitelisted `radarRange` path can never leave
  // them stale.
  eq.gun.rangeU = stats.radarRange;
  eq.starShells.rangeU = stats.radarRange;
  eq.broadside.rangeU = stats.radarRange * CONFIG.vision.muzzleFlashFactor;
  // The broadside TRAVERSE and MOUNT SPREAD both read their authored ladders
  // off the folded SPREAD rung — derived for the same reason.
  eq.broadside.spreadRung = clampSpreadRung(eq.broadside.spreadRung);
  eq.broadside.traverseRad = broadsideTraverse(eq.broadside.spreadRung);
  eq.broadside.mountSpreadRad = broadsideMountSpread(eq.broadside.spreadRung);
  // THE EIGHTHS LADDER IS ONE NUMBER (Eric ruling 2026-08-16): truesight is the
  // 4/8 rung of intel range.
  stats.sightRange = stats.radarRange / 2;
  // The mine trip ring rides the blast radius — pure and idempotent, so
  // re-pinning it here as often as the fold likes changes nothing.
  //
  // THE CAPTIVE CHASSIS IS DELIBERATELY NOT RE-PINNED HERE. Its derivation is
  // the swap-and-triple pair, and the BLAST half of that pair CONSUMES the
  // value it overwrites — so the pair is non-idempotent and has exactly ONE
  // home, clampStats, which runs exactly once per effectiveStats() call.
  // Re-deriving the captive trigger from an already-swapped blast would shrink
  // it on every extra pass. Both halves are still linear in the one folded
  // blast radius, so card ORDER still cannot matter.
  eq.navalMines.triggerRadius = mineTriggerRadius(eq.navalMines.blastRadius, eq.navalMines.captive);
}

/**
 * Fold every `stat` and `doctrine` effect the held `cards` buy into `stats` IN
 * PLACE, plus each line's derived TIER. Consumed ONLY by effectiveStats()
 * (sim/stats.ts): the one legal path from cards to derived numbers, so the
 * desync firewall holds. `stock`, `slotFill` and `behavior` effects are no-ops
 * here — their homes are the rack, the loadout and the hook registry.
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
 * The effective pool size for ANYTHING a slot may hold (Story 8.7). Equipment
 * goes to `equipmentMaxAmmo` unchanged; a CONSUMABLE's ceiling is its LINE's
 * `cap` — five copies of a cap-5 line is five uses, and a stack has no stats
 * row to read a pool off. An id no line in the given catalog names caps at 0
 * (fail-closed: nothing can be stocked, nothing can be fired).
 *
 * IT LIVES HERE, NOT IN sim/loadout.ts, for one mechanical reason: it needs the
 * CATALOG, and sim/catalog.ts validates itself at import while reading
 * loadout's `EQUIPMENT_IDS` — so a catalog import in loadout.ts closes a module
 * cycle that makes the catalog validate against an empty id set (observed:
 * `deckGun: appliesTo unknown equipment 'gun'`). loadout.ts stays a leaf; this
 * module already owns both sides of the belt.
 */
export function slotMaxAmmo(stats: EffectiveStats, id: SlotItemId, catalog: Catalog = CATALOG): number {
  if (!isConsumableId(id)) return equipmentMaxAmmo(stats, id);
  return Object.hasOwn(catalog, id) ? catalog[id].cap : 0;
}

/**
 * THE BELT SLOT a copy of `lineId` would go into: the slot that ALREADY HOLDS
 * that line (a second copy deepens the stack it is already carrying), else the
 * FIRST EMPTY belt slot, else `null` — the belt is full of four other lines and
 * this copy has nowhere to go.
 *
 * Pure over the slot ids alone, so both sides call the same function over the
 * same data: the server passes `loadout.map(s => s.equipmentId)` and the client
 * passes the ids it replayed from `OwnShip.cards`. A short or malformed array
 * is fail-closed (a missing slot is never "empty").
 */
export function stockSlotFor(slotIds: readonly (SlotItemId | null)[], lineId: ConsumableId): number | null {
  for (const i of CONSUMABLE_SLOTS) {
    if (slotIds[i] === lineId) return i;
  }
  for (const i of CONSUMABLE_SLOTS) {
    if (slotIds[i] === null) return i;
  }
  return null;
}

/**
 * Can this belt take another copy of `lineId`? Exactly "the belt already holds
 * the line ∨ a belt slot is empty" — ONE derivation, shared by the server's
 * spend refusal (which returns false BEFORE mutating anything, so the offer is
 * byte-identical next frame) and the client's greyed `SLOTS FULL` card, so the
 * two can never disagree about whether a pick is legal.
 */
export function canStock(slotIds: readonly (SlotItemId | null)[], lineId: ConsumableId): boolean {
  return stockSlotFor(slotIds, lineId) !== null;
}

/**
 * Stock ONE copy: `n += 1` in the slot already holding the line, or a fresh
 * `{ n: 1, reloadMsLeft: 0 }` stack in the first empty belt slot. A STUB line
 * is refused by the same catalog-driven gate `slotFill` uses; a full belt is a
 * SILENT no-op that leaves the loadout byte-identical.
 */
function applyStock(loadout: LoadoutSlot[], effect: BoonStockEffect, catalog: Catalog): void {
  // The consumable's line IS its id (a consumable line fills its own rack), so
  // the stub gate reads the catalog row directly rather than through
  // `lineForEquipment`, which maps equipment rows to the lines that FIT them.
  const line = catalog[effect.equipmentId];
  if (line?.stub === true) return;
  const index = stockSlotFor(loadout.map((s) => s.equipmentId), effect.equipmentId);
  if (index === null) return; // belt full of other lines: nothing moves
  const slot = loadout[index];
  if (slot === undefined) return;
  if (slot.equipmentId === effect.equipmentId && slot.state !== null) {
    slot.state.n += 1; // the SAME state object: a stack deepens, it is never rebuilt
    return;
  }
  slot.equipmentId = effect.equipmentId;
  // A STACK NEVER RELOADS (catalog-v3 R40): reloadMsLeft is 0 for its whole life.
  slot.state = { n: 1, reloadMsLeft: 0 };
}

/**
 * Apply ONE effect's slot consequence to a live loadout IN PLACE — THE single
 * slot-mutation path of the engine, shared verbatim by the server (incremental,
 * on grant) and the client (slotsWithCards, replayed over loadoutFor output).
 * `stat`/`behavior`/`doctrine` effects are structural no-ops here.
 *
 * TWO HOMES INSIDE THE ONE ARRAY: a `slotFill` takes the first empty WEAPON
 * slot, a `stock` takes its BELT slot (applyStock above). Neither can reach the
 * other's row, which is why a full weapon row never spills into the belt and a
 * fifth consumable line never displaces a weapon.
 *
 * THE FILL RULE (Story 8.5): a `slotFill` takes the FIRST slot in
 * `WEAPON_SLOTS` (2, 3, 4) that is still empty, and touches NOTHING else — no
 * other slot's state object is even re-read, let alone rewritten, so fitting a
 * weapon can never disturb another slot's reload timer (pinned by identity in
 * boons.test.ts). Three silent no-ops, each leaving the loadout untouched: a
 * STUB line, equipment ALREADY fitted anywhere, and a full weapon row.
 *
 * `slotReplace` is DELETED (Story 8.1) — no catalog-v3 line swaps one piece of
 * equipment for another, so the branch and its degenerate-self-replace guard
 * went with the mechanism.
 */
export function applySlotEffect(
  loadout: LoadoutSlot[],
  effect: BoonEffect,
  stats: EffectiveStats,
  catalog: Catalog = CATALOG,
): void {
  if (effect.kind === 'stock') {
    applyStock(loadout, effect, catalog); // the belt (Story 8.7)
    return;
  }
  if (effect.kind !== 'slotFill') return; // not a slot home
  // NEVER FIT A STUB WEAPON. A stub line carries a real `slotFill` on copy 1
  // with NO module behind it, and this is the ONE gate both sides share: the
  // client replays cards through slotsWithCards and the server replays them
  // again on respawn, so a guard living only in the server's grant path leaves
  // a phantom weapon fittable on both of those routes. Catalog-driven, so a
  // line stops being guarded the moment its `stub` flag comes off.
  const line = lineForEquipment(effect.equipmentId, catalog);
  if (line?.stub === true) return;
  if (loadout.some((s) => s.equipmentId === effect.equipmentId)) return; // already fitted: no-op
  for (const i of WEAPON_SLOTS) {
    const slot = loadout[i];
    if (slot === undefined || slot.equipmentId !== null) continue; // occupied (or malformed)
    slot.equipmentId = effect.equipmentId;
    slot.state = freshSlotState(stats, effect.equipmentId);
    return;
  }
  // Every weapon slot is full: a silent no-op, loadout untouched. A LEGAL deck
  // can never reach this (deck rule `equipmentLines` caps a deck at three
  // equipment lines, and three is exactly the row's width) — property-pinned
  // over random legal decks in nineSlots.test.ts.
}

/**
 * The client-side loadout derivation (ONE derivation, both sides): the
 * universal nine-slot loadoutFor fit with every held card's slot effects
 * replayed over it, IN FIT ORDER. `fleet` selects the gun-only drone fit.
 *
 * THIS REPLAY IS IN FIT ORDER, NOT FOLD ORDER, and that is the one place the
 * two diverge on purpose. The weapon row fills FIRST-EMPTY-FIRST, so WHICH
 * weapon sits in Q, E and R is a fact about the order a captain took the
 * cards in, not about the catalog. The server applies each grant as it
 * happens, so the client must replay `OwnShip.cards` (which rides the wire IN
 * FIT ORDER) the same way, or the two would disagree about the row.
 * Property-pinned in boons.test.ts. Stats, by contrast, are order-INDEPENDENT
 * by construction.
 *
 * Pool STATE here is the fresh full-pool baseline (the live counts ride
 * OwnShip.ammo, slot-aligned).
 *
 * THE BELT NEEDS NO CODE HERE (Story 8.7). Every copy of a consumable line is
 * replayed like any other card, and each one runs the same `stock` branch the
 * server ran on grant — so k copies held IS `n = k` in that line's belt slot,
 * with no wire field to carry the count. A copy SPENT in play leaves
 * `ship.cards` server-side, so the next replay lands on `n − 1` by itself.
 */
export function slotsWithCards(
  stats: EffectiveStats,
  cards: readonly string[],
  catalog: Catalog = CATALOG,
  fleet = false,
): LoadoutSlot[] {
  const loadout = loadoutFor(stats, fleet);
  const seen = new Map<string, number>();
  for (const id of cards) {
    if (!Object.hasOwn(catalog, id)) continue;
    const line = catalog[id];
    if (line === undefined) continue;
    const copy = (seen.get(id) ?? 0) + 1;
    seen.set(id, copy);
    if (copy > line.cap) continue; // past the physical cap: buys nothing
    for (const e of line.tiers[copy - 1] ?? []) applySlotEffect(loadout, e, stats, catalog);
  }
  return loadout;
}
