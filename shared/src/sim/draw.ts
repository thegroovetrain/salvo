// THE COMMON POOL DRAW (Story 8.14, epic-8 amendments 89–94; the offer
// composition re-cut by Story 10.7, epic-10 amendment 13) — the pure
// per-ship draw engine behind every offer. It REPLACES sim/deck.ts,
// sim/deckRules.ts and sim/pool.ts wholesale.
//
// THERE IS NO DECK ANY MORE (Eric ruling 2026-09-21, amendment 89a). No card is
// class-locked, no card is brought to the match, nothing is frozen at a door,
// and Story 8.11's hidden match pool is retired. EVERY DEALABLE CATALOG LINE IS
// IN THE POOL FOR EVERY CAPTAIN, with UNLIMITED copies — what a ship may be
// dealt is bounded only by the line's `cap`, by the three FAMILY slots (one
// kind per slot — Story 10.5), and by the mounted gun. A draw is therefore a pure function of the SHIP'S STATE and
// the catalog, never of a per-player card list.
//
// WHAT "ELIGIBLE" MEANS, line by line (`eligibleLines`):
//   - a STUB line — one whose mechanism is not built yet — is never dealt
//     (amendment 11, carried over verbatim: `isDealable` is still the single
//     point at which "authored but unbuilt" becomes "unofferable");
//   - an `equipment` line the ship holds NO copy of is copy 1, i.e. THE BARE
//     WEAPON, so it is eligible only while ITS FAMILY'S SLOT is empty — an
//     `equipment` card flagged `bareWeapon`. ONE KIND PER SLOT FOR THE MATCH
//     (Story 10.5, Eric 2026-11-05, epic-10 amendment 11): once LIGHT TORPEDO
//     holds `Q`, HEAVY and SUPERCAV are never eligible again, and the same for
//     the mine and special-shell families. Held 1..cap-1 it is a TIER card (an
//     `equipment` card, not a bare weapon). At `cap` it is out (a sixth copy is
//     not a card). A weapon with NO family slot — BROADSIDE, which left the
//     deal (R6) — is never eligible at any count;
//   - a `ladder` below its cap is a `ship` card; a ladder with a HOST equipment
//     row — named in `appliesTo`, or addressed by its tier's `equipment.<row>.`
//     stat path — is a GUN ladder and is eligible only while that row is the
//     mounted gun (amendment 89d — each gun's ladder is offered only while it
//     is mounted). See `ladderHost`;
//   - an `addon` (cap 1, so eligible only unheld) is an `equipment` card iff
//     its host is ABOARD — some equipment it names sits in its family slot
//     (Story 10.6, Eric 2026-11-05, R10 / I8: the four one-off WEAPON cards are
//     "dealt only once their family slot is filled"). The old "or any weapon
//     slot still open" held-ahead rule (amendment 89b) is retired;
//
// THE `consumable` KIND IS GONE (2026-11-05, Story 10.5): the kit is retired.
// With it went amendment 94's "the offer is never empty": that rested on
// consumables being dealt at their cap. An offer is now SHORT when fewer than
// `CONFIG.offer.size` lines are eligible and EMPTY when none is (a hull holding
// every ladder, its three slotted weapons at cap and every add-on it can
// host); `drawOffer` returns what
// there is, never a throw.
//
// EVERY ELIGIBLE LINE HAS AN OFFER TYPE (Story 10.7, Eric 2026-11-06, epic-10
// amendment 13; the mapping is catalog fact, amendment 12 R10 / R11):
//   - `ship` — a `ladder` line (the eight universal ship ladders, and a gun
//     ladder while its gun is mounted);
//   - `equipment` — an `equipment` line (the BARE WEAPON, copy 1, and every
//     tier card of a held weapon) and an `addon` line (the one-off weapon
//     cards).
// The eligibility law above decides WHETHER a line may be dealt; the type only
// decides WHICH SLOT of the offer it can fill.
//
// THE OFFER IS A FOUR-SLOT TYPE PLAN (Eric's law, 2026-10-25, re-cut
// 2026-11-04; rulings R1–R4 2026-11-06): `[ship, equipment, wildcard,
// wildcard]` — slot 0 is a Ship card, slot 1 an Equipment card, and every
// later slot up to `CONFIG.offer.size` a WILDCARD. Per slot, over the eligible
// lines not yet dealt:
//   1. the wanted type — fixed for slots 0 and 1; a wildcard flips a 50 / 50
//      coin (R1, one `rng.next()`, `< 0.5` → ship) ONLY while BOTH types still
//      have an undealt line, and otherwise takes the type that has lines and
//      spends no flip;
//   2. a fixed slot whose type is dry takes the OTHER type; neither type has a
//      line → the offer stops there (short, or empty);
//   3. one `rng.next()` picks the LINE by a weighted walk in catalog key order.
// So the rng cost is ONE per dealt card plus ONE per wildcard slot that had
// both types to choose from, and an empty eligible set spends NOTHING. A dealt
// line leaves the undealt set, so the cards are always DIFFERENT lines. A
// REDRAW is simply this draw run again (R2) — there is no remembered plan.
//
// AN EMPTY DRAW IS A BONUS POINT (Story 10.7, R5, Eric 2026-11-06, epic-10
// amendment 13 — it replaces R3's "a hull with nothing dealable banks
// nothing"): when the draw has nothing to deal, every level waiting on it
// becomes `CONFIG.offer.exhausted.indexPoints` on one index, picked by
// `drawBonusIndex` below — ONE `rng.next()` per converted level, off the same
// per-ship stream. The World does the converting (materializeOffer); the
// points enter the stats only through `effectiveStats()`.
//
// RETIRED 2026-11-06 (Story 10.7, epic-10 amendment 13): the two-stage
// KIND-SHARE draw (epic-8 amendment 92 — stage 1 picked `weapon` or `upgrade`
// at each kind's share of the eligible lines) and the LEVEL-ZERO WEAPON
// GUARANTEE (amendment 93 — card 0 of the opening and its redraw was a uniform
// pick over the slot-filling weapons). The Equipment slot supersedes the
// guarantee: on a bare hull every eligible equipment line IS a bare weapon (no
// weapon is held, so there is no tier card, and no add-on host is aboard), so
// card 1 of a level-zero offer is a weapon the hull can take.
//
// THE MECHANISM IS CALLED WEIGHTING and nothing else (Eric ruling 2026-09-22,
// amendment 91 — no other word for it appears anywhere). `lineWeight(n)` =
// `max(floor, factor ** n)` where `n` counts the OTHER participants who have
// taken copy 1 of that line this match. It bends only WHICH BARE WEAPON is
// drawn (amendment 90; and amendment 92's standing law, "the odds of drawing A
// weapon are the same, but WHICH weapon it is gets weighted"). In the line walk
// every non-bare line — a tier card, a ladder, an add-on — weighs 1, and the
// BARE WEAPONS' raw weights (`weights.get(id) ?? 1`) are RESCALED TO SUM TO
// THEIR COUNT: bare weapon i weighs w_i × nBare / sumBare (2026-11-06, Story
// 10.7 review gate). So the chance a line pick lands on SOME bare weapon is
// exactly their unweighted share, nBare / candidates, whatever the weights —
// the weighting only moves WHICH bare weapon it is. Copies 2+ never move anyone's weight, the taker's own weight is untouched,
// and a take is permanent for the match (the taker sinking restores nothing).
// The take ledger itself lives on the World, server-side: this file only ever
// receives the finished per-line weights.
//
// Determinism: every function is pure over (ship, weights, rng, catalog) —
// same inputs, same outputs, zero I/O — and every walk is in CATALOG KEY
// ORDER, which is the determinism contract. The server drives it with a
// per-ship decorrelated mulberry32 stream. Nothing here rides the wire: only
// the offered line ids leave the server (the slot types never do).

import { CONFIG, INDEX_IDS, type IndexId } from '../constants.js';
import type { Rng } from '../math/rng.js';
import {
  boonStackCount,
  CATALOG,
  tierTargetOf,
  type Catalog,
  type CatalogLine,
  type LineId,
} from './catalog.js';
import { familySlotFor, type EquipmentId } from './loadout.js';
import { addonHosted } from './boons.js';

/**
 * The two OFFER TYPES a dealt card can be (Story 10.7, epic-10 amendment 13 —
 * they replaced amendment 92's `weapon` / `upgrade` kinds):
 *   - `ship` — a `ladder` line;
 *   - `equipment` — an `equipment` line (the bare weapon or one of its tier
 *     cards) or an `addon` line.
 * The type decides which slot of the four-slot plan a line can fill; it never
 * rides the wire (an offer is line ids only).
 */
export type OfferType = 'ship' | 'equipment';

/**
 * Everything the draw needs to know about a ship — nothing else about it is
 * ever consulted, which is what keeps this file pure over plain data.
 *
 * `held` is the ship's fitted card ids, ONE ENTRY PER COPY (the shape of
 * `ShipRecord.cards`, passed straight through); `slotIds` is the ship's SLOT
 * CONTENTS (`loadout.map(s => s.equipmentId)` — the same array `pickRefusal`
 * takes); `mountedGun` is the EQUIPMENT row in the ship's
 * slot 0, which is what a gun ladder's host is matched against. SINCE STORY
 * 10.4 A CAPTAIN'S IS ALWAYS `'mainBattery'` — no ladder hosts on that row, so
 * the CANNON, MACHINE GUN and FLAK ladders are NEVER eligible for a captain
 * (their catalog lines stay for reference; the PvE fleet that mounted the
 * gun retired at Story 10.8, 2026-11-06). There is no `kit` since Story 10.5.
 *
 * THE SLOT IDS REPLACED A `weaponSlotOpen` BOOLEAN (Story 8.14 review, F2).
 * Carrying both a derived boolean and the array it is derived from let the
 * two disagree, so the array is the only input.
 */
export interface DrawShip {
  readonly held: readonly LineId[];
  readonly slotIds: readonly (EquipmentId | null)[];
  readonly mountedGun: EquipmentId;
}

/**
 * One line the ship could be dealt right now: its OFFER TYPE, and whether it
 * is a BARE WEAPON (copy 1 of an `equipment` line) — the only cards the
 * WEIGHTING ever touches (amendment 90).
 */
export interface Eligible {
  readonly id: LineId;
  readonly type: OfferType;
  readonly bareWeapon: boolean;
}

/**
 * Per-line draw weights, as the World computes them from its take ledger. An
 * ABSENT id weighs 1.0 (the base weight), so an empty map is "nobody has taken
 * anything yet" and every line walk is even.
 */
export type Weights = ReadonlyMap<LineId, number>;

/** The weighting's two dials, as `CONFIG.offer.weighting` supplies them — its
 *  own shape so the harness can pass tuned values (both are `[DRAFT]`). */
export interface WeightingConfig {
  readonly factor: number;
  readonly floor: number;
}

/** A slot of the offer plan: a fixed type, or a wildcard that flips for one. */
type SlotPlan = OfferType | 'wildcard';

/** THE WILDCARD COIN (R1, Eric 2026-11-06): a wildcard slot is a 50 / 50 flip
 *  between Ship and Equipment — an `rng.next()` below this is Ship. */
const WILDCARD_SHIP_CHANCE = 0.5;

/** What the eligibility law learns about one line besides its id. */
type Deal = Omit<Eligible, 'id'>;

/** Every ladder deals as a Ship card. */
const SHIP_DEAL: Deal = { type: 'ship', bareWeapon: false };

/** A tier card of a held weapon, or an add-on: Equipment, not a bare weapon. */
const EQUIPMENT_DEAL: Deal = { type: 'equipment', bareWeapon: false };

/** Copy 1 of an equipment line: the bare weapon itself. */
const BARE_WEAPON_DEAL: Deal = { type: 'equipment', bareWeapon: true };

/** A known, NON-STUB line — the only kind the pool may deal (amendment 11). */
function isDealable(id: string, catalog: Catalog): boolean {
  if (!Object.hasOwn(catalog, id)) return false;
  const line = catalog[id];
  return line !== undefined && line.stub !== true;
}

/**
 * An EQUIPMENT line's deal (Story 10.5 — one kind per family slot): a weapon
 * with no family slot (BROADSIDE) is never dealt; copy 1 IS the bare weapon,
 * dealt only while its family's slot is EMPTY — so a second kind of a filled
 * family never appears; every later copy is a tier bump on the weapon already
 * holding that slot. Fail-closed on a short slot array (a missing slot is
 * never "empty").
 */
function equipmentDeal(line: CatalogLine, copies: number, ship: DrawShip): Deal | undefined {
  const weapon = tierTargetOf(line);
  const slot = weapon === undefined ? null : familySlotFor(weapon);
  if (slot === null) return undefined;
  if (copies > 0) return EQUIPMENT_DEAL;
  return ship.slotIds[slot] === null ? BARE_WEAPON_DEAL : undefined;
}

/** An `equipment.<row>.<field>` stat path, as a ladder's tier effects write
 *  it — the only structural trace a slotless ladder leaves of the equipment row
 *  it steps. */
const EQUIPMENT_STAT_PATH = /^equipment\.([^.]+)\./;

/**
 * THE EQUIPMENT ROW A LADDER SERVES, or undefined for a UNIVERSAL ladder
 * (Story 8.14 review, F3).
 *
 * Two sources, in order, and the order is load-bearing:
 *   1. `appliesTo[0]`, when the ladder names one. That field is ALSO what
 *      `catalog.tierTargetOf` advances the equipment TIER for. Every gun
 *      ladder in production — CANNON (`deckGun` -> `gun`), MACHINE GUN and
 *      FLAK (`flak` -> `flak`) — names its row here, so each is gated to its
 *      own mounted gun by this source alone.
 *   2. Otherwise the row its FIRST tier's first `stat` effect addresses —
 *      an `equipment.gun.*` path -> `gun`. No production line reaches this
 *      source since the one-off DECK GUN TURRET and DECK GUN BARREL cards were
 *      deleted (Eric 2026-09-30); it stays as the guard for an injected
 *      catalog. The seven universal ship ladders (ARMOR, POWER, ENGINES,
 *      INTEL, RELOAD, HULL REPAIR, SMOKE SCREEN — Story 10.6, R1; RANGE was
 *      deleted by Story 11.2, R9) each
 *      write top-level paths, none of which is an `equipment.` path, so they
 *      stay universal.
 *
 * Without this, a seat that mounts the flak gun would be dealt CANNON cards
 * that step a module it is not carrying, and vice versa.
 * Exported so the gating is pinned directly (draw.test.ts).
 */
export function ladderHost(line: CatalogLine): EquipmentId | undefined {
  const named = line.appliesTo?.[0];
  if (named !== undefined) return named;
  for (const e of line.tiers[0] ?? []) {
    if (e.kind !== 'stat') continue;
    const m = EQUIPMENT_STAT_PATH.exec(e.path);
    if (m !== null) return m[1] as EquipmentId;
  }
  return undefined;
}

/** A LADDER's deal: a Ship card. A ladder with a HOST equipment row is a GUN
 *  ladder (the CANNON's, the machine gun's and the flak gun's — Story 8.15),
 *  offered only while that row is the mounted gun (amendment 89d); a universal
 *  ladder is always offered. */
function ladderDeal(line: CatalogLine, ship: DrawShip): Deal | undefined {
  const host = ladderHost(line);
  return host === undefined || host === ship.mountedGun ? SHIP_DEAL : undefined;
}

/** An ADD-ON's deal (Story 10.6, R10 / I8): an Equipment card (the four
 *  one-offs are WEAPON cards — R11) while its host is ABOARD — some equipment
 *  it names sits in its family slot (sim/boons.ts `addonHosted`, the same
 *  predicate `pickRefusal` runs) — and not dealt otherwise. */
function addonDeal(line: CatalogLine, ship: DrawShip): Deal | undefined {
  return addonHosted(line, ship.slotIds) ? EQUIPMENT_DEAL : undefined;
}

/**
 * The deal an ELIGIBLE line would be, or undefined if the ship cannot be dealt
 * it at all. One clause per catalog kind, above.
 */
function dealOf(line: CatalogLine, copies: number, ship: DrawShip): Deal | undefined {
  if (copies >= line.cap) return undefined; // at cap: a further copy is not a card
  if (line.kind === 'equipment') return equipmentDeal(line, copies, ship);
  if (line.kind === 'ladder') return ladderDeal(line, ship);
  return addonDeal(line, ship);
}

/**
 * EVERY LINE THIS SHIP COULD BE DEALT RIGHT NOW, in CATALOG KEY ORDER (the
 * determinism contract — never re-sorted), each tagged with its offer type and
 * whether it is a bare weapon. This is the whole eligibility law; see the file
 * header.
 *
 * FAIL-CLOSED at every edge: an id the catalog does not know never appears, a
 * stub never appears, and a malformed hold (junk ids, repeats past cap) is
 * counted by `boonStackCount` and bounded by the same `cap` test. Never throws.
 */
export function eligibleLines(ship: DrawShip, catalog: Catalog = CATALOG): Eligible[] {
  const out: Eligible[] = [];
  for (const key of Object.keys(catalog)) {
    if (!isDealable(key, catalog)) continue;
    const line = catalog[key];
    if (line === undefined) continue;
    const id = key as LineId;
    const deal = dealOf(line, boonStackCount(ship.held, id), ship);
    if (deal !== undefined) out.push({ id, ...deal });
  }
  return out;
}

/**
 * THE WEAPON WEIGHTING (amendment 90, named by amendment 91): a line's draw
 * weight after `takesByOthers` OTHER participants have taken copy 1 of it this
 * match — `max(floor, factor ** n)`, so 1.0 at zero takes, 0.75 at one, 0.5625
 * at two, and floored at 0.25 from five takes on. Never zero: a line another
 * captain took is less likely, never impossible.
 *
 * It applies ONLY to BARE WEAPONS in the line walk, and only RELATIVE to one
 * another (`pickLine` rescales them to sum to their count): it never changes a
 * slot's type, never changes the odds that a pick is a bare weapon at all,
 * never touches a tier card, a ladder or an add-on, and never touches the
 * taker's own weight (the World excludes the taker when it counts).
 */
export function lineWeight(takesByOthers: number, cfg: WeightingConfig = CONFIG.offer.weighting): number {
  return Math.max(cfg.floor, cfg.factor ** takesByOthers);
}

/** The plan for slot `i` of an offer: slot 0 Ship, slot 1 Equipment, every
 *  later slot a wildcard — so a different `CONFIG.offer.size` still deals the
 *  two fixed slots first and wildcards after. */
function slotPlan(i: number): SlotPlan {
  if (i === 0) return 'ship';
  if (i === 1) return 'equipment';
  return 'wildcard';
}

/**
 * THE TYPE ONE SLOT DEALS, over the lines not yet dealt, or undefined when
 * neither type has a line left (the offer stops). A dry type yields to the
 * other; a wildcard spends its ONE coin flip only while both types have lines.
 */
function slotType(plan: SlotPlan, remaining: readonly Eligible[], rng: Rng): OfferType | undefined {
  const hasShip = remaining.some((e) => e.type === 'ship');
  const hasEquipment = remaining.some((e) => e.type === 'equipment');
  if (!hasShip) return hasEquipment ? 'equipment' : undefined;
  if (!hasEquipment) return 'ship';
  if (plan !== 'wildcard') return plan;
  return rng.next() < WILDCARD_SHIP_CHANCE ? 'ship' : 'equipment';
}

/**
 * THE WALK WEIGHTS of a slot's candidates (2026-11-06, Story 10.7 review gate
 * — amendment 92's law: the odds of A weapon are fixed, the weighting picks
 * WHICH). Every non-bare line weighs 1. The bare weapons' raw weights
 * (`weights.get(id) ?? 1`) are rescaled so they SUM TO THEIR COUNT — bare
 * weapon i weighs w_i × nBare / sumBare — so the bare weapons together hold
 * exactly their unweighted share of the walk. Defensive: if `sumBare` is not a
 * finite positive number, every bare weapon weighs 1 (`lineWeight` has a
 * positive floor, so the World never sends one).
 */
function walkWeights(candidates: readonly Eligible[], weights: Weights): number[] {
  const raw = candidates.map((e) => (e.bareWeapon ? weights.get(e.id) ?? 1 : 1));
  let nBare = 0;
  let sumBare = 0;
  candidates.forEach((e, i) => {
    if (!e.bareWeapon) return;
    nBare += 1;
    sumBare += raw[i];
  });
  const scale = Number.isFinite(sumBare) && sumBare > 0 ? nBare / sumBare : undefined;
  return candidates.map((e, i) => {
    if (!e.bareWeapon) return 1;
    return scale === undefined ? 1 : raw[i] * scale;
  });
}

/**
 * WHICH line, within the slot's type. One `rng.next()`, a weighted walk in
 * catalog key order over `walkWeights`: every non-bare line 1, the bare
 * weapons rescaled to sum to their count — so the weighting bends WHICH bare
 * weapon, never WHETHER the pick is one. `candidates` is never empty here.
 */
function pickLine(candidates: readonly Eligible[], weights: Weights, rng: Rng): LineId {
  const ws = walkWeights(candidates, weights);
  const total = ws.reduce((a, w) => a + w, 0);
  let r = rng.next() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    r -= ws[i];
    if (r < 0) return candidates[i].id;
  }
  return candidates[candidates.length - 1].id; // float-dust fallback
}

/**
 * DRAW ONE LEVEL'S OFFER: up to `CONFIG.offer.size` DIFFERENT card lines from
 * the common pool, by the four-slot type plan `[ship, equipment, wildcard,
 * wildcard]` (Story 10.7, epic-10 amendment 13 — see the file header).
 *
 * NON-CONSUMING and stateless: there is no pool object to thin, so a draw is a
 * read of the ship's state and nothing else, and a REDRAW is the same call
 * again (R2). Fewer eligible lines than `CONFIG.offer.size` gives a SHORTER
 * offer — never padded, never repeated, never a throw — and NO eligible line
 * gives an EMPTY one with no rng spent.
 *
 * `weights` is the World's per-line weighting for THIS ship (absent = 1.0); it
 * bends only which BARE WEAPON a line walk lands on — never a slot's type, and
 * never the odds that the walk lands on a bare weapon at all (`walkWeights`).
 */
export function drawOffer(ship: DrawShip, weights: Weights, rng: Rng, catalog: Catalog = CATALOG): LineId[] {
  const eligible = eligibleLines(ship, catalog);
  const offer: LineId[] = [];
  const dealt = new Set<LineId>();
  for (let i = 0; i < CONFIG.offer.size; i += 1) {
    const remaining = eligible.filter((e) => !dealt.has(e.id));
    const type = slotType(slotPlan(i), remaining, rng);
    if (type === undefined) break; // nothing undealt of either type: short, or empty
    const id = pickLine(remaining.filter((e) => e.type === type), weights, rng);
    offer.push(id);
    dealt.add(id); // DIFFERENT lines per draw
  }
  return offer;
}

/** The index ids — what a bonus pick must be one of (P4 below). */
const INDEX_ID_SET: ReadonlySet<string | undefined> = new Set<string>(INDEX_IDS);

/**
 * THE EXHAUSTED HULL'S PICK (Story 10.7, R5, Eric 2026-11-06, epic-10
 * amendment 13): which index one converted level lands on — uniform over
 * `CONFIG.offer.exhausted.indices`, ONE `rng.next()`. Never HULL REPAIR or
 * SMOKE SCREEN: only the listed indices can come out. The `min` is the guard
 * against an rng that returns exactly 1 (a stub; mulberry32 never does).
 *
 * FAIL-CLOSED (review gate P4): the answer is `undefined` — the caller skips
 * that level's point — whenever the pick is not one of the `INDEX_IDS`
 * (an empty or misconfigured list, or an rng returning NaN / a negative), so
 * no junk key is ever written onto a ship. The rng value is spent either way.
 * `indices` is the test seam.
 */
export function drawBonusIndex(
  rng: Rng,
  indices: readonly string[] = CONFIG.offer.exhausted.indices,
): IndexId | undefined {
  const pick = indices[Math.min(indices.length - 1, Math.floor(rng.next() * indices.length))];
  return INDEX_ID_SET.has(pick) ? (pick as IndexId) : undefined;
}
