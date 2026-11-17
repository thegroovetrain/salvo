// Per-equipment DISPLAY information for the hotbar + slot tooltip (Story 2.2).
// The single client-side seam between an EquipmentId and the words/numbers the
// player reads: display name, the interaction line (the TIER word only, amendment 203),
// and the numeric quick-info inputs.
//
// NO PROSE (Eric ruling 2026-09-30, epic-8 amendment 185): the per-equipment
// description sentences are DELETED — the slot tooltip prints the weapon's live
// stat table one number per line (ui/boonCopy.ts `equipmentStatRows`), and the
// weapon explanations will live in How-to-Play.
//
// Numbers rule: EVERY number comes from `effectiveStats()` (the desync
// firewall). Story 2.8 walked the documented migration seam: damage was
// promoted onto EffectiveStats when the catalog's damage ladders shipped, so
// equipmentDamage() now reads `stats.<id>.damage` and moves with the fitted
// boons exactly as reload/pool always have. Nothing here hand-copies a number.
//
// COPY STATUS: every name is DRAFT PLACEHOLDER (amendment 13, the boon-copy
// rule) — canon later.

import {
  CATALOG,
  EQUIPMENT_IS_WEAPON,
  LINE_IDS,
  SLOT_GUN,
  boonStackCount,
  equipmentMaxAmmo,
  equipmentReloadMs,
  tierTargetOf,
  type CatalogLine,
  type EffectiveStats,
  type EquipmentId,
} from '@salvo/shared';
import { ABILITY_KEY_GLYPHS, ABILITY_SQUARES } from './hotbarSquares.js';

/**
 * Hotbar square → bound key glyph, in square order (render/hotbarSquares.ts),
 * left to right on the HUD bar: Gun · Shift · Q · E · R · C · V.
 *
 * The GUN is KEYLESS (always selected — its chip renders as a ghost that keeps
 * the row's shared baseline). Slot 1 is the BOOST, and its chip spells the WORD
 * `Shift` (Eric ruling 2026-09-16, epic-8 amendment 33). That REVERSES
 * amendment 29's `⇧`, and the reason is the bar: 8.5's chip was a fixed 22px
 * mono square that held exactly one glyph, so the word did not fit; the bar's
 * chip is the mock's `.kc`, which WIDENS to its content (min-width 16px, 3px of
 * padding each side), and the arrow — which players read as "up" as often as
 * "shift" — no longer has to stand in for a key that has a name.
 *
 * Slots 2-4 are the three FAMILY weapon slots (torpedo / mine / special
 * shell); the two after them are the cooldown abilities HULL REPAIR (`C`) and
 * SMOKE (`V`) — 2026-11-05, Story 10.5, epic-10 amendment 11: the kit's digit
 * squares are gone with the kit.
 *
 * THE GUN'S CHIP SPELLS `LMB` (Eric 2026-11-05: *"LMB/RMB"* — the main battery
 * fires on the left mouse button), a TEXT chip exactly like `Shift`: it was a
 * keyless ghost until then. The SECONDARIES square's `RMB` is `SEC_KEY_GLYPH`
 * below — that square is outside this index space (render/hotbarSquares.ts).
 */
export const SLOT_KEY_GLYPHS: readonly string[] = [
  'LMB', 'Shift', 'Q', 'E', 'R',
  ...ABILITY_SQUARES.map((id) => ABILITY_KEY_GLYPHS[id]),
];

/** The SECONDARIES heat square's key chip (Eric 2026-11-05) — the right mouse
 *  button fires the secondaries. The square is slotless, so its chip lives
 *  beside the table rather than in it. */
export const SEC_KEY_GLYPH = 'RMB';

/**
 * Display name per equipment id. The BUILT ids keep their shipped names
 * verbatim (Story 8.1 renamed ids, never copy — the boost's legacy id was
 * deleted in Story 8.9 and its name came across to `boost` unchanged).
 *
 * STORY 8.15 (Eric rulings 2026-09-28): the plain gun reads `Cannon` everywhere
 * in match (amendment 108 — `DECK GUN` survives only as the class-select row's
 * category word); the two pickable guns are `Machine Gun` and `Flak`, and the
 * two new class Shifts `Instant Reload` and `Hunker` (amendment 107's
 * names, title-cased like every tooltip name). The missile and the monitor are
 * CUT (amendment 89e).
 */
export const EQUIPMENT_NAME: Record<EquipmentId, string> = {
  gun: 'Cannon',
  boost: 'Speed Boost',
  instantReload: 'Instant Reload',
  hunker: 'Hunker',
  heavyTorpedo: 'Torpedoes',
  navalMines: 'Mines',
  broadside: 'Broadside Barrage',
  starShells: 'Star Shells',
  // --- catalog-v3 §1 names ---------------------------------------------------
  // FOULING MINES arrived from the add-on space in Story 8.13 (amendment 81)
  // and takes its sheet name. (The SUPERCAV TORPEDO, a consumable from 8.13 to
  // 10.5, is back in this table below.)
  lightTorpedo: 'Light Torpedo',
  captiveMines: 'Captive Mines',
  foulingMines: 'Fouling Mines',
  machineGun: 'Machine Gun',
  flak: 'Flak',
  // STORY 8.17 (amendment 131): PHOSPHOR SHELLS is its own weapon now, no
  // longer a star-shell add-on — named from its card, title-cased.
  phosphorShells: 'Phosphor Shells',
  // STORY 10.4: the captain's MAIN BATTERY fires today's cannon shell from its
  // turrets — it reuses the cannon's shipped name (no new copy; the full UI
  // pass names it).
  mainBattery: 'Cannon',
  // STORY 10.5 (2026-11-05, epic-10 amendment 11): the three moved weapons are
  // slot equipment again — their card names (ui/boonCopy.ts), title-cased.
  supercavTorpedo: 'Supercav Torpedo',
  dazzleShells: 'Flash Shells',
  foulingShell: 'Fouling Shell',
};

/**
 * The slot tooltip's ONE interaction word: the TIER (Eric 2026-10-01, amendment
 * 203 — every instruction about how the weapon works is gone; the player knows
 * it is a weapon because it is in the weapon bar, which key because the square
 * is labelled, and how it works from How To Play). A gun or weapon square reads
 * `TIER II`; a Shift/ability square and a belt consumable read '' and the
 * callers SKIP an empty line (the belt badge already shows stock).
 *
 * Weapon-vs-ability comes ONLY from `isWeaponItem` (via `EQUIPMENT_IS_WEAPON`).
 * `cards` is the own fitted list; without it a weapon prints nothing rather
 * than a fabricated Tier I. The DECK GUN family is a base-tier line whose rung
 * is the server's own fold (`slotTier`), so a gun caller with no `stats` prints
 * no line.
 */
export function interactionLine(
  slot: number,
  id: EquipmentId,
  cards: readonly string[] = [],
  stats?: EffectiveStats,
): string {
  if (slot === SLOT_GUN) return tierSuffix(id, cards, stats);
  if (!EQUIPMENT_IS_WEAPON[id]) return '';
  return tierSuffix(id, cards);
}

/**
 * THE MOUNTED-GUN FAMILY (Story 8.15): the three modules slot 0 can hold — the
 * cannon (`gun`), the machine gun and the flak gun. Each climbs a slotless GUN
 * LADDER whose rung is `1 + copies` (the `deckGun` precedent, amendments 70/104/
 * 105), so `slotTier` (and, below, `tierSuffix`) reads it off the fold's own
 * row instead of off a catalog line's raw copy count. Replaces the single-id
 * `GUN_EQUIPMENT_ID` the deck gun alone once needed.
 */
const GUN_FAMILY: ReadonlySet<EquipmentId> = new Set<EquipmentId>(['gun', 'machineGun', 'flak']);

/** `TIER n` for a slot standing on a rung, '' otherwise — an unfitted-but-
 *  somehow-present weapon reads 0, which prints nothing rather than a fake
 *  Tier I. With `stats` the number is `slotTier`'s (so the deck gun reads its
 *  own fold); without them only a line-keyed weapon can answer.
 *
 *  THE GUN, WITHOUT STATS, IS REFUSED OUTRIGHT rather than falling into the
 *  `lineTier` branch below: `lineForEquipment('gun')` resolves to `'deckGun'`
 *  (the slotless ladder `tierTargetOf` reads off its `appliesTo`), and
 *  `lineTier(cards, 'deckGun')` would then read the RAW deckGun copy count —
 *  one short of the fold's `1 + copies` (`slotTier`, `sim/stats.ts`
 *  `applyLineTier`). The fold is the only place the gun's true rung lives, so
 *  a caller with no stats gets silence, never a plausible-looking wrong
 *  number. */
function tierSuffix(id: EquipmentId, cards: readonly string[], stats?: EffectiveStats): string {
  if (GUN_FAMILY.has(id) && stats === undefined) return '';
  const tier = stats === undefined ? lineTier(cards, lineForEquipment(id) ?? id) : slotTier(stats, cards, id);
  return tier > 0 ? `TIER ${TIER_WORDS[Math.min(tier, TIER_WORDS.length) - 1]}` : '';
}

/** The Roman tier words the interaction line prints — the SAME ramp the bar's
 *  bottom-right numeral uses, so the hover and the square agree. */
const TIER_WORDS: readonly string[] = ['I', 'II', 'III', 'IV', 'V'];

/**
 * THE CATALOG LINE THAT FITS A PIECE OF EQUIPMENT — the reverse of
 * `tierTargetOf`. Catalog v3 keys an equipment line by the weapon it fits, so
 * this is very nearly the identity today; it is derived rather than assumed so
 * that a future line which fits a weapon under another name still resolves.
 *
 * Null for equipment NO line fits — the two legacy modules. THE DECK GUN
 * ladder's `appliesTo` DOES map `gun → deckGun` here (it is a `ladder`, and
 * `tierTargetOf` reads a ladder's `appliesTo[0]` same as any other), so
 * `lineForEquipment('gun')` returns `'deckGun'`, not null — but that mapping
 * is never used to ANSWER a tier for the gun, because the gun's rung is the
 * fold's `1 + copies`, not its raw copy count (`slotTier`, and the guard in
 * `tierSuffix` above, both refuse it explicitly rather than reading through
 * this map). Built ONCE at module load off the frozen CATALOG.
 */
const EQUIPMENT_LINE: ReadonlyMap<string, string> = new Map(
  LINE_IDS.flatMap((id) => {
    const target = tierTargetOf(CATALOG[id]);
    return target === undefined ? [] : [[target as string, id as string] as const];
  }),
);

/** Pure: the catalog line whose first copy FITS this equipment, or null. */
export function lineForEquipment(id: EquipmentId): string | null {
  return EQUIPMENT_LINE.get(id) ?? null;
}

/**
 * THE EQUIPMENT A CATALOG LINE ADDRESSES (Story 8.1). Categories are gone with
 * the v2 catalog, so "which slot does this card belong to?" is answered from the
 * LINE ITSELF: its slotFill target, the equipment its stat effects write into
 * (`equipment.<id>.<field>`), and the equipment an add-on bolts its verb onto.
 *
 * An EMPTY list means SHIPWIDE - the six universal ladders (ARMOR, POWER,
 * ENGINES, RUDDER, INTEL, RELOAD — Stories 9.7/9.9, re-cut by Story 10.3,
 * Eric 2026-11-04, epic-10 amendment 8) move the whole vessel and belong to no weapon.
 * Their fit flash is rank-wide rather than slot-local (amendment 51), and
 * since cycle 158 their numbers read on the HP globe's SHIP tooltip
 * (amendment 186).
 *
 * Built ONCE at module load off the frozen CATALOG - it is authored data, not
 * per-frame state.
 */
function statPathEquipment(path: string): EquipmentId | null {
  const seg = path.split('.');
  return seg[0] === 'equipment' && seg[1] !== undefined ? (seg[1] as EquipmentId) : null;
}

/** Every equipment id one line addresses, deduped, in first-seen order. */
function lineTargets(line: CatalogLine): EquipmentId[] {
  const ids = new Set<EquipmentId>();
  const tier = tierTargetOf(line);
  if (tier !== undefined) ids.add(tier);
  for (const eq of line.appliesTo ?? []) ids.add(eq);
  for (const tierEffects of line.tiers) {
    for (const e of tierEffects) {
      if (e.kind === 'stat') {
        const eq = statPathEquipment(e.path);
        if (eq !== null) ids.add(eq);
      } else if (e.kind === 'slotFill') ids.add(e.equipmentId);
      else if (e.kind === 'doctrine') ids.add(e.weapon);
    }
  }
  return [...ids];
}

const LINE_TARGETS: ReadonlyMap<string, readonly EquipmentId[]> = new Map(
  LINE_IDS.map((id) => [id as string, lineTargets(CATALOG[id]) as readonly EquipmentId[]]),
);

/** Pure: the equipment a fitted card addresses ([] = shipwide, or an unknown id
 *  - fail-open, since an unresolvable card must still get a rank-wide flash). */
export function cardEquipmentIds(id: string): readonly EquipmentId[] {
  return LINE_TARGETS.get(id) ?? [];
}

/**
 * Pure: the TIER a fitted catalog line is standing at — how many copies of it
 * the build holds, capped by the line's own cap.
 *
 * THE HUD BAR'S bottom-right numeral (Story 8.6, ruling 4) for every slot but
 * the gun. A slot reads its own EQUIPMENT id as a line id, which is exactly
 * right for catalog v3: an equipment line is keyed by the weapon it fits, so
 * `lineTier(cards, 'heavyTorpedo')` is "how far up the torpedo's ladder this
 * hull has climbed". The permanent deck gun is NOT one of these — it climbs the
 * slotless DECK GUN ladder, whose rung is `1 + copies`, so `slotTier` answers
 * for it off the fold rather than off any lookup here.
 *
 * CAPPED, not raw: the ramp is five rungs and the caps are the catalog's, so a
 * duplicate that the server should never have granted cannot paint a sixth
 * colour. Fail-closed on an unknown id (0).
 */
export function lineTier(cards: readonly string[], lineId: string): number {
  const line = (CATALOG as Record<string, CatalogLine | undefined>)[lineId];
  if (line === undefined) return 0;
  return Math.min(boonStackCount(cards, lineId), line.cap);
}

/**
 * Pure: the TIER A SQUARE PRINTS — the one number the bar's numeral and the
 * slot tooltip's ` · TIER n` both read (Story 8.12, epic-8 amendment 70).
 *
 * THE DECK GUN IS A BASE-TIER LINE. A hull sails with it fitted, so tier I is
 * what it HAS at spawn and the square owes the player that numeral — the old
 * silence was the honest reading of a slot with no line, not of this one. The
 * rung is `stats.equipment.gun.tier`, which `applyLineTier` wrote as
 * `1 + DECK GUN copies`: the SAME number the reload step is priced off, so the
 * bar cannot drift from the sim. Re-deriving `1 + copies` here would be a
 * second copy of the rule and the place a drift would start.
 *
 * Clamped to the ramp's five words: the fold already caps the copies, and this
 * is the fail-closed second stop, so nothing can paint a sixth rung.
 *
 * Every other id is `lineTier` exactly as the bar has always computed it —
 * keyed by the line that fits the equipment, which for every line-fitted
 * weapon is the id itself (the gun is the one id whose line, `deckGun`, is
 * not itself — and it is answered above, off the fold).
 */
export function slotTier(stats: EffectiveStats, cards: readonly string[], id: EquipmentId): number {
  if (GUN_FAMILY.has(id)) return Math.min(stats.equipment[id].tier, TIER_WORDS.length);
  return lineTier(cards, lineForEquipment(id) ?? id);
}

/**
 * Pure: the loadout slot a fitted card belongs to, or null when no fitted slot
 * owns it - a shipwide ladder, or a card for a piece of kit this hull does not
 * carry.
 *
 * THE routing behind the fit flash (amendment 51): the card lands on ITS slot.
 */
export function slotForCard(
  loadout: readonly (EquipmentId | null)[],
  cardId: string,
): number | null {
  const targets = cardEquipmentIds(cardId);
  if (targets.length === 0) return null;
  for (let slot = 0; slot < loadout.length; slot += 1) {
    const id = loadout[slot];
    if (id !== null && targets.includes(id)) return slot;
  }
  return null;
}

/**
 * EFFECTIVE per-burst/per-hit damage (hp) for a piece of equipment, or null for
 * the ones that deal none. THE single damage read on the client — it comes off
 * the effective stats (Story 2.8: damage is stat-driven now, so a HEAVY SHELLS
 * / RDX FILLER stack moves this number), never off CONFIG.
 *
 * Star shells DEAL DAMAGE AGAIN since Story 8.17 (Eric ruling 2026-09-29,
 * amendment 130 — amendment 39's "structurally damageless" is superseded): the
 * tier's number to every hull inside the whole lit circle, so they left the
 * null branch. PHOSPHOR SHELLS reports its BURST damage (its burn is a
 * per-second zone effect, not a hit).
 *
 * The BROADSIDE reports its PER-SHELL damage (Story 7-5 wave 2): every shell of
 * a barrage carries the same number and each bursts independently, so a
 * turret-count multiple would report a total no single hull can take.
 */
export function equipmentDamage(stats: EffectiveStats, id: EquipmentId): number | null {
  const e = stats.equipment;
  const table: Record<EquipmentId, number | null> = {
    gun: e.gun.damage,
    heavyTorpedo: e.heavyTorpedo.damage,
    navalMines: e.navalMines.damage,
    boost: null,
    broadside: e.broadside.damage,
    starShells: e.starShells.damage,
    phosphorShells: e.phosphorShells.damage,
    // The widened ids carry real rows (catalog-v3 §4 base numbers, sim/stats.ts
    // STUB_ROWS) even though no module fires them yet, so the table stays TOTAL
    // and reads the same one place every other number comes from.
    //
    // LIGHT TORPEDO, CAPTIVE MINES and FOULING MINES are LIVE lines as of Story
    // 8.13 and read the same way they always did. A CAPTIVE mine's number is its
    // FISH's warhead (the mine itself never detonates), which is exactly what
    // its row's `damage` is.
    lightTorpedo: e.lightTorpedo.damage,
    captiveMines: e.captiveMines.damage,
    foulingMines: e.foulingMines.damage,
    // THE TWO PICKABLE GUNS (Story 8.15): the machine gun's number is PER SHELL
    // (a direct hit), the flak gun's per hull inside its burst.
    machineGun: e.machineGun.damage,
    flak: e.flak.damage,
    instantReload: null,
    hunker: null,
    // STORY 10.4: per SHELL, like the broadside — a turret's salvo is several.
    mainBattery: e.mainBattery.damage,
    // STORY 10.5: the SUPERCAV TORPEDO has a stat row again (its tiers step the
    // damage); the two special shells deal none — they blind or foul.
    supercavTorpedo: e.supercavTorpedo.damage,
    dazzleShells: null,
    foulingShell: null,
  };
  return table[id];
}

/** Everything the hotbar row + tooltip need about one fitted slot's equipment. */
export interface EquipmentInfo {
  id: EquipmentId;
  name: string;
  /** Mechanically aimed-and-fired (EQUIPMENT_IS_WEAPON) vs instant activation. */
  isWeapon: boolean;
  /** hp per burst/hit, or null when the equipment deals none. */
  damage: number | null;
  /** EFFECTIVE reload/cooldown (ms) — moves with upgrades. */
  reloadMs: number;
  /** EFFECTIVE pool size — the ammo badge shows only when this exceeds 1. */
  maxAmmo: number;
}

/** Resolve one equipment id against the own effective stats (the one path). */
export function equipmentInfo(stats: EffectiveStats, id: EquipmentId): EquipmentInfo {
  return {
    id,
    name: EQUIPMENT_NAME[id],
    isWeapon: EQUIPMENT_IS_WEAPON[id],
    damage: equipmentDamage(stats, id),
    reloadMs: equipmentReloadMs(stats, id),
    maxAmmo: equipmentMaxAmmo(stats, id),
  };
}
