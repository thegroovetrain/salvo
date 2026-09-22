// THE COMMON POOL DRAW (Story 8.14, epic-8 amendments 89–94) — the pure
// per-ship draw engine behind every offer. It REPLACES sim/deck.ts,
// sim/deckRules.ts and sim/pool.ts wholesale.
//
// THERE IS NO DECK ANY MORE (Eric ruling 2026-09-21, amendment 89a). No card is
// class-locked, no card is brought to the match, nothing is frozen at a door,
// and Story 8.11's hidden match pool is retired. EVERY DEALABLE CATALOG LINE IS
// IN THE POOL FOR EVERY CAPTAIN, with UNLIMITED copies — what a ship may be
// dealt is bounded only by the line's `cap`, by the three weapon slots, and by
// the mounted gun. A draw is therefore a pure function of the SHIP'S STATE and
// the catalog, never of a per-player card list.
//
// WHAT "ELIGIBLE" MEANS, line by line (`eligibleLines`):
//   - a STUB line — one whose mechanism is not built yet — is never dealt
//     (amendment 11, carried over verbatim: `isDealable` is still the single
//     point at which "authored but unbuilt" becomes "unofferable");
//   - an `equipment` line the ship holds NO copy of is copy 1, i.e. THE BARE
//     WEAPON, so it is eligible only while a weapon slot is open — and its
//     kind is `weapon`. Held 1..cap-1 it is a TIER card: kind `upgrade`. At
//     `cap` it is out (a sixth copy is not a card);
//   - a `ladder` below its cap is an `upgrade`; a ladder with a HOST equipment
//     row — named in `appliesTo`, or addressed by its tier's `equipment.<row>.`
//     stat path — is a GUN ladder and is eligible only while that row is the
//     mounted gun (amendment 89d — each gun's ladder is offered only while it
//     is mounted). See `ladderHost`;
//   - an `addon` (cap 1, so eligible only unheld) is an `upgrade` iff a host
//     it names is already held OR a weapon slot is still open — holding an
//     add-on ahead of its host is allowed while the ship can still fit one;
//   - a `consumable` is ALWAYS eligible (amendment 94: at its cap, or with a
//     full belt, it is dealt anyway — the card greys client-side through the
//     existing SLOTS FULL treatment and the server refuses the pick as a
//     silent no-op). THAT is what makes "the offer is never empty" structural:
//     there is no exhaustion, no latch, no banked-empty branch.
//
// THE DRAW IS TWO-STAGE (Eric ruling 2026-09-22, amendment 92). For each card:
// stage 1 picks the KIND, with each kind's odds equal to its SHARE of the
// lines still eligible for this ship — exactly what an undiscounted uniform
// draw over lines would give; stage 2 picks a LINE within that kind, weapons
// by the match-wide WEIGHTING (amendment 90) and upgrades and consumables
// evenly. Eric's requirement, verbatim: *"the odds of drawing A weapon are the
// same, but WHICH weapon it is gets weighted."* A dealt line leaves the
// eligible set and the shares recompute, so the cards are always DIFFERENT
// lines. Cost: exactly TWO `rng.next()` per dealt card (one per stage).
//
// THE MECHANISM IS CALLED WEIGHTING and nothing else (Eric ruling 2026-09-22,
// amendment 91 — no other word for it appears anywhere). `lineWeight(n)` =
// `max(floor, factor ** n)` where `n` counts the OTHER participants who have
// taken copy 1 of that line this match.
// Copies 2+ never move anyone's weight, the taker's own weight is untouched,
// and a take is permanent for the match (the taker sinking restores nothing).
// The take ledger itself lives on the World, server-side: this file only ever
// receives the finished per-line weights.
//
// THE LEVEL-ZERO GUARANTEE IS LEVEL ZERO ONLY (amendment 93). `guarantee` is
// passed for the opening offer and its REDRAW and NOWHERE ELSE; card 0 is then
// Story 8.10's uniform pick over `usableLines`, carried over byte-identical —
// no weighting on it, and vacuous (not a reroll) when nothing is usable.
//
// Determinism: every function is pure over (ship, weights, rng, catalog) —
// same inputs, same outputs, zero I/O — and every walk is in CATALOG KEY
// ORDER, which is the determinism contract. The server drives it with a
// per-ship decorrelated mulberry32 stream. Nothing here rides the wire: only
// the offered line ids leave the server.

import { CONFIG } from '../constants.js';
import type { Rng } from '../math/rng.js';
import {
  boonStackCount,
  CATALOG,
  lineForEquipment,
  type Catalog,
  type CatalogLine,
  type LineId,
} from './catalog.js';
import { WEAPON_SLOTS, type EquipmentId, type SlotItemId } from './loadout.js';
import { pickRefusal } from './boons.js';

/**
 * The three KINDS a dealt card can be (amendment 92's stage 1):
 *   - `weapon` — copy 1 of an equipment line, the bare weapon itself;
 *   - `upgrade` — a tier card of a held line, a ladder rung, the mounted gun's
 *     ladder, or an add-on;
 *   - `consumable` — a copy that stocks the belt.
 */
export type DrawKind = 'weapon' | 'upgrade' | 'consumable';

/**
 * Everything the draw needs to know about a ship — nothing else about it is
 * ever consulted, which is what keeps this file pure over plain data.
 *
 * `held` is the ship's fitted card ids, ONE ENTRY PER COPY (the shape of
 * `ShipRecord.cards`, passed straight through); `slotIds` is the ship's NINE
 * SLOT CONTENTS (`loadout.map(s => s.equipmentId)` — the same array `canStock`
 * and `pickRefusal` take); `mountedGun` is the EQUIPMENT row the seat's gun
 * mounts (sim/loadout.ts MOUNTED_GUN), which is what a gun ladder's host is
 * matched against.
 *
 * THE SLOT IDS REPLACED A `weaponSlotOpen` BOOLEAN (Story 8.14 review, F2).
 * The draw needs the weapon row for eligibility and the level-zero guarantee
 * needs the whole nine-slot array for `pickRefusal`; carrying both a derived
 * boolean and the array it is derived from let the two disagree, so the array
 * is the only input and `weaponRowOpen` below is the one derivation.
 */
export interface DrawShip {
  readonly held: readonly LineId[];
  readonly slotIds: readonly (SlotItemId | null)[];
  readonly mountedGun: EquipmentId;
}

/** Is ANY of Q/E/R still empty — the one derivation of "a bare weapon has
 *  somewhere to go", fail-closed on a short array exactly like `stockSlotFor`
 *  (a missing slot is never "empty"). */
function weaponRowOpen(ship: DrawShip): boolean {
  return WEAPON_SLOTS.some((i) => ship.slotIds[i] === null);
}

/** One line the ship could be dealt right now, with the kind it would be. */
export interface Eligible {
  readonly id: LineId;
  readonly kind: DrawKind;
}

/**
 * Per-line draw weights, as the World computes them from its take ledger. An
 * ABSENT id weighs 1.0 (the base weight), so an empty map is "nobody has taken
 * anything yet" and the draw is even within every kind.
 */
export type Weights = ReadonlyMap<LineId, number>;

/** The weighting's two dials, as `CONFIG.offer.weighting` supplies them — its
 *  own shape so the harness can pass tuned values (both are `[DRAFT]`). */
export interface WeightingConfig {
  readonly factor: number;
  readonly floor: number;
}

/** The kind walk order — fixed, because stage 1's cumulative walk must be
 *  deterministic for a given rng value. */
const KIND_ORDER: readonly DrawKind[] = ['weapon', 'upgrade', 'consumable'];

/** A known, NON-STUB line — the only kind the pool may deal (amendment 11). */
function isDealable(id: string, catalog: Catalog): boolean {
  if (!Object.hasOwn(catalog, id)) return false;
  const line = catalog[id];
  return line !== undefined && line.stub !== true;
}

/** Does the ship hold at least one copy of the line that FITS `eq`? */
function holdsHost(held: readonly LineId[], eq: EquipmentId, catalog: Catalog): boolean {
  const host = lineForEquipment(eq, catalog);
  return host !== undefined && boonStackCount(held, host.id) > 0;
}

/** An EQUIPMENT line's kind: copy 1 IS the bare weapon, so it needs somewhere
 *  to go; every later copy is a tier bump on a weapon already aboard. */
function equipmentKind(copies: number, ship: DrawShip): DrawKind | undefined {
  if (copies > 0) return 'upgrade';
  return weaponRowOpen(ship) ? 'weapon' : undefined;
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
 *      `catalog.tierTargetOf` advances the equipment TIER for, which is why
 *      DECK GUN TURRET and DECK GUN BARREL must NOT grow one: they are gun
 *      cards, but they are not rungs of the gun's tier ladder.
 *   2. Otherwise the row its FIRST tier's first `stat` effect addresses —
 *      `equipment.gun.maxAmmo` -> `gun`, `equipment.gun.barrels` -> `gun`. The
 *      five universal ladders (ARMOR, SPEED, TURNING, RADAR SWEEP, RELOAD)
 *      write `maxHp`, `kinematics.*`, `sweepRpm` and `cooldownScale`, none of
 *      which is an `equipment.` path, so they stay universal.
 *
 * Without this, a seat that mounts anything but the deck gun (Story 8.15) is
 * dealt DECK GUN TURRET and DECK GUN BARREL as live cards that step a module it
 * is not carrying.
 */
function ladderHost(line: CatalogLine): EquipmentId | undefined {
  const named = line.appliesTo?.[0];
  if (named !== undefined) return named;
  for (const e of line.tiers[0] ?? []) {
    if (e.kind !== 'stat') continue;
    const m = EQUIPMENT_STAT_PATH.exec(e.path);
    if (m !== null) return m[1] as EquipmentId;
  }
  return undefined;
}

/** A LADDER's kind: a ladder with a HOST equipment row is a GUN ladder (today
 *  the only hosted ladders are the deck gun's three), offered only while that
 *  row is the mounted gun (amendment 89d); a universal ladder is always an
 *  upgrade. */
function ladderKind(line: CatalogLine, ship: DrawShip): DrawKind | undefined {
  const host = ladderHost(line);
  if (host === undefined) return 'upgrade';
  return host === ship.mountedGun ? 'upgrade' : undefined;
}

/** An ADD-ON's kind: it bolts a verb onto equipment it names, so held-ahead is
 *  allowed while a weapon slot is still open (amendment 89b); with the row full
 *  and no host aboard the card would be dead, so it is not dealt. */
function addonKind(line: CatalogLine, ship: DrawShip, catalog: Catalog): DrawKind | undefined {
  const hosted = (line.appliesTo ?? []).some((eq) => holdsHost(ship.held, eq, catalog));
  return hosted || weaponRowOpen(ship) ? 'upgrade' : undefined;
}

/**
 * The kind an ELIGIBLE non-consumable line would be dealt as, or undefined if
 * the ship cannot be dealt it at all. One clause per catalog kind, above.
 */
function upgradeKindOf(line: CatalogLine, copies: number, ship: DrawShip, catalog: Catalog): DrawKind | undefined {
  if (copies >= line.cap) return undefined; // at cap: a further copy is not a card
  if (line.kind === 'equipment') return equipmentKind(copies, ship);
  if (line.kind === 'ladder') return ladderKind(line, ship);
  return addonKind(line, ship, catalog);
}

/**
 * EVERY LINE THIS SHIP COULD BE DEALT RIGHT NOW, in CATALOG KEY ORDER (the
 * determinism contract — never re-sorted), each tagged with the kind it would
 * be dealt as. This is the whole eligibility law; see the file header.
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
    // A CONSUMABLE IS ALWAYS ELIGIBLE (amendment 94) — at cap, with a full
    // belt, whatever the ship holds. That is what makes the offer never empty.
    if (line.kind === 'consumable') {
      out.push({ id, kind: 'consumable' });
      continue;
    }
    const kind = upgradeKindOf(line, boonStackCount(ship.held, id), ship, catalog);
    if (kind !== undefined) out.push({ id, kind });
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
 * It applies ONLY to stage 2 within the `weapon` kind: it never changes the
 * odds of drawing A weapon (amendment 92), never touches copies 2+, and never
 * touches the taker's own weight (the World excludes the taker when it counts).
 */
export function lineWeight(takesByOthers: number, cfg: WeightingConfig = CONFIG.offer.weighting): number {
  return Math.max(cfg.floor, cfg.factor ** takesByOthers);
}

/**
 * THE USABLE LINES for the level-zero guarantee, carried over from Story 8.10
 * byte-identical except for its source (the common pool rather than a deck):
 * the dealable lines, in CATALOG order, that would give the ship something it
 * can USE right now —
 *
 *   - every `consumable` line (a copy stocks a rack the ship can fire), and
 *   - every `equipment` line the ship holds NO copy of, whose next tier is
 *     therefore tier I: the bare weapon itself.
 *
 * An `equipment` line already held is excluded because its next copy is a tier
 * bump, not a new verb; `ladder` and `addon` lines are excluded because a stat
 * step or a bolt-on verb is not something a bare hull can put to sea with. A
 * line held AT CAP is never usable.
 *
 * IT READS THE SLOT IDS (Story 8.14 review, F2). At level zero the whole row is
 * empty and the belt is empty, so this is still byte-identical to the pick 8.10
 * shipped — but `grantOpening` also fires on a REDRAW after a dev spawn fit has
 * filled the row, and there the guarantee could hand a hull copy 1 of a weapon
 * with nowhere to put it. A line is usable only when `pickRefusal` says the
 * ship could actually TAKE it, which is the same gate the pick itself runs. The
 * guarantee stays uniform and unweighted over whatever survives.
 */
export function usableLines(
  held: readonly LineId[],
  slotIds: readonly (SlotItemId | null)[],
  catalog: Catalog = CATALOG,
): LineId[] {
  const out: LineId[] = [];
  for (const key of Object.keys(catalog)) {
    if (!isDealable(key, catalog)) continue;
    const line = catalog[key];
    if (line === undefined) continue;
    const copies = boonStackCount(held, key);
    const usable = line.kind === 'consumable' || (line.kind === 'equipment' && copies === 0);
    if (usable && pickRefusal(held, slotIds, key, catalog) === null) out.push(key as LineId);
  }
  return out;
}

/** The guaranteed FIRST card: one uniform pick over `usableLines`, costing
 *  exactly ONE rng.next(). Undefined — and NO rng value spent — when nothing is
 *  usable, which is what keeps the guarantee vacuous instead of a reroll. */
function pickUsable(ship: DrawShip, catalog: Catalog, rng: Rng): LineId | undefined {
  const usable = usableLines(ship.held, ship.slotIds, catalog);
  if (usable.length === 0) return undefined;
  const i = Math.min(Math.floor(rng.next() * usable.length), usable.length - 1); // clamp: float dust
  return usable[i];
}

/**
 * STAGE 1 — the KIND of one card, with each kind's odds equal to its SHARE of
 * the lines still eligible. One `rng.next()`. `remaining` is never empty here.
 */
function pickKind(remaining: readonly Eligible[], rng: Rng): DrawKind {
  let r = rng.next() * remaining.length;
  for (const kind of KIND_ORDER) {
    const share = remaining.reduce((n, e) => (e.kind === kind ? n + 1 : n), 0);
    r -= share;
    if (r < 0 && share > 0) return kind;
  }
  // Float-dust fallback: the kind of the last remaining line.
  return remaining[remaining.length - 1].kind;
}

/**
 * STAGE 2 — WHICH line, within the chosen kind. One `rng.next()`. Weapons are
 * weighted (amendment 90); upgrades and consumables are even, which is the
 * same walk with every weight 1. `candidates` is never empty here.
 */
function pickLine(candidates: readonly Eligible[], weights: Weights, weighted: boolean, rng: Rng): LineId {
  let total = 0;
  const ws = candidates.map((e) => {
    const w = weighted ? weights.get(e.id) ?? 1 : 1;
    total += w;
    return w;
  });
  let r = rng.next() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    r -= ws[i];
    if (r < 0) return candidates[i].id;
  }
  return candidates[candidates.length - 1].id; // float-dust fallback
}

/**
 * DRAW ONE LEVEL'S OFFER: up to `CONFIG.offer.size` DIFFERENT card lines from
 * the common pool, by the two-stage draw (amendment 92).
 *
 * NON-CONSUMING and stateless: there is no pool object to thin, so a draw is a
 * read of the ship's state and nothing else. Fewer eligible lines than
 * `CONFIG.offer.size` gives a SHORTER offer — never padded, never repeated,
 * never a throw. And it is never EMPTY in practice, because a consumable line
 * is always eligible (amendment 94).
 *
 * `weights` is the World's per-line weighting for THIS ship (absent = 1.0); it
 * is consulted only inside the `weapon` kind, so the odds of the card being a
 * weapon at all are identical with and without it.
 *
 * `opts.guarantee` is the LEVEL-ZERO guarantee and is passed at level zero and
 * its REDRAW only (amendment 93): card 0 becomes Story 8.10's uniform pick over
 * `usableLines` — unweighted, one rng.next(), vacuous when nothing is usable —
 * and every remaining card is the ordinary two-stage draw with that line
 * already dealt.
 */
export function drawOffer(
  ship: DrawShip,
  weights: Weights,
  rng: Rng,
  catalog: Catalog = CATALOG,
  opts: { guarantee?: boolean } = {},
): LineId[] {
  const eligible = eligibleLines(ship, catalog);
  const offer: LineId[] = [];
  const dealt = new Set<LineId>();
  const first = opts.guarantee === true ? pickUsable(ship, catalog, rng) : undefined;
  if (first !== undefined) {
    offer.push(first);
    dealt.add(first);
  }
  while (offer.length < CONFIG.offer.size) {
    const remaining = eligible.filter((e) => !dealt.has(e.id));
    if (remaining.length === 0) break; // fewer eligible lines than the offer size
    const kind = pickKind(remaining, rng);
    const id = pickLine(remaining.filter((e) => e.kind === kind), weights, kind === 'weapon', rng);
    offer.push(id);
    dealt.add(id); // DIFFERENT lines per draw, and the shares recompute
  }
  return offer;
}
