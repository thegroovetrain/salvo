// Per-equipment DISPLAY information for the hotbar + slot tooltip (Story 2.2).
// The single client-side seam between an EquipmentId and the words/numbers the
// player reads: display name, draft description copy, the interaction line
// ("WEAPON · Q · SWITCH-TO"), and the numeric quick-info inputs.
//
// Numbers rule: EVERY number comes from `effectiveStats()` (the desync
// firewall). Story 2.8 walked the documented migration seam: damage was
// promoted onto EffectiveStats when the catalog's damage ladders shipped, so
// equipmentDamage() now reads `stats.<id>.damage` and moves with the fitted
// boons exactly as reload/pool always have. Nothing here hand-copies a number.
//
// COPY STATUS: every name/description is DRAFT PLACEHOLDER (amendment 13, the
// boon-copy rule) — canon later.

import {
  CATALOG,
  CONSUMABLE_IS_WEAPON,
  EQUIPMENT_IS_WEAPON,
  LINE_IDS,
  SLOT_GUN,
  boonStackCount,
  equipmentMaxAmmo,
  equipmentReloadMs,
  isConsumableId,
  tierTargetOf,
  type CatalogLine,
  type ConsumableId,
  type EffectiveStats,
  type EquipmentId,
  type SlotItemId,
} from '@salvo/shared';

/**
 * Slot → bound key glyph, in slot order. The nine-slot spine, left to right on
 * the HUD bar: Gun · Shift · Q · E · R · 1 · 2 · 3 · 4.
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
 * Slots 2-4 are the three generic weapon slots; slots 5-8 are the consumable
 * belt, whose digits are REFIT-ONLY until Story 8.7 wires the rack (amendment
 * 27) — the chips are drawn now because the squares they label exist now.
 */
export const SLOT_KEY_GLYPHS: readonly string[] = ['', 'Shift', 'Q', 'E', 'R', '1', '2', '3', '4'];

/**
 * Display name per equipment id. The seven BUILT ids keep their shipped names
 * verbatim (Story 8.1 renamed ids, never copy — the boost's legacy id was
 * deleted in Story 8.9 and its name came across to `boost` unchanged); the seven
 * ids catalog v3 widened
 * `EquipmentId` with carry their catalog-v3 §1 sheet name and nothing else —
 * no description, no glyph, no tone, because their modules do not exist yet
 * (Stories 8.13-8.16) and their catalog lines are stubs excluded from every deck.
 */
export const EQUIPMENT_NAME: Record<EquipmentId, string> = {
  gun: 'Deck Gun',
  boost: 'Speed Boost',
  heavyTorpedo: 'Torpedoes',
  navalMines: 'Mines',
  broadside: 'Broadside Barrage',
  starShells: 'Star Shells',
  radarBuoy: 'Radar Buoy',
  // --- catalog-v3 §1 names for the ids no module answers to yet --------------
  lightTorpedo: 'Light Torpedo',
  supercavTorpedo: 'Supercavitating Torpedo',
  captiveMines: 'Captive Mines',
  missile: 'Horizontal Missile',
  machineGun: 'Machine Gun',
  flak: 'Flak Gun',
  monitor: 'Monitor Gun',
};

/**
 * One-to-two sentence tooltip description per equipment id (DRAFT copy).
 * PARTIAL by construction: the unbuilt ids get no description, because writing
 * one would be inventing copy for a weapon nobody has played. `equipmentDescription`
 * fails open to '' for them, exactly as the rest of the copy layer does.
 */
export const EQUIPMENT_DESCRIPTION: Partial<Record<EquipmentId, string>> = {
  gun: 'The deck gun you always have. It flies to the clicked point and bursts there, hitting every hull inside the blast.',
  heavyTorpedo: 'A bow-launched fish that runs flat and straight until it finds a hull. Slow to reload, brutal on contact.',
  navalMines: 'Lays an armed mine at a point off your stern quarter. It waits, silent, until an enemy hull comes close, then takes the whole blast out of whoever found it.',
  boost: 'Opens the throttle past its stops for a short burst of extra speed. Nothing else changes — you just leave sooner.',
  broadside: 'Every turret on the aimed beam fires at once. The shells fan out to either side of the point you clicked, every one of them running to that same range.',
  starShells: 'An illumination round. Where it bursts, a wide circle of ocean lights up for everyone — including the hulls in it.',
  radarBuoy: 'Drops an anchored buoy that runs its own radar sweep and relays what it finds back to you.',
};

/**
 * THE MINE'S TOOLTIP UNDER CAPTIVE MINES (Story 7-5 wave 2, R2.12). The shipped
 * line ends "takes the whole blast out of whoever found it", which is a straight
 * statement of contact detonation — the ONE thing this verb deletes. A captive
 * mine never detonates on contact; it launches a torpedo and is expended. The
 * rest of the sentence is unchanged, deliberately: placement, the arming wait
 * and the silence are all still true, and rewording settled copy that a ruling
 * did not touch is exactly what the naming law forbids.
 */
const CAPTIVE_MINE_DESCRIPTION =
  'Lays an armed mine at a point off your stern quarter. It waits, silent, until an enemy hull comes close, then spends itself firing one torpedo at it.';

/**
 * The tooltip description for a fitted piece of equipment, against the OWNER's
 * effective stats — the one path, so a verb that changes what a weapon DOES
 * cannot leave the tooltip describing the weapon it replaced. Only the mine
 * forks today (CAPTIVE MINES); every other id reads its static line.
 */
export function equipmentDescription(stats: EffectiveStats, id: EquipmentId): string {
  if (id === 'navalMines' && stats.equipment.navalMines.captive) return CAPTIVE_MINE_DESCRIPTION;
  return EQUIPMENT_DESCRIPTION[id] ?? '';
}

/**
 * The label a slot's tooltip uses for how its content is operated: the gun is
 * keyless and permanently selected, weapons switch-to on their key, abilities
 * activate immediately, and a BELT slot states the consumable's whole shape.
 * Weapon-vs-ability comes ONLY from `isWeaponItem` (the one predicate both
 * dispatch channels read), and the key comes ONLY from SLOT_KEY_GLYPHS — so the
 * boost in slot 1 reads `ABILITY · Shift · ACTIVATES` without this function
 * knowing what a boost is.
 *
 * STORY 8.7 (ruling 13) adds the two facts UX-DR43 says are learned HERE and
 * never on the card face:
 *
 *   • a WEAPON slot carries its line's TIER — `WEAPON · Q · TIER II` — which is
 *     the word behind the bar's bottom-right numeral. `cards` is the own fitted
 *     list; without it (a caller with no build) the suffix is simply absent
 *     rather than a fabricated Tier I.
 *
 *     STORY 8.12 (epic-8 amendment 70) puts the DECK GUN on that same line.
 *     The deck gun is a BASE-TIER line: a hull sails with it already fitted, so
 *     TIER I is the truth at spawn, not a fabrication — and the number is not
 *     ours to invent, it is `stats.equipment.gun.tier`, the server's own fold
 *     of `1 + DECK GUN copies` (`slotTier`). A caller with no stats prints no
 *     suffix, because the fold is the only place that number lives.
 *   • a BELT slot carries the consumable's ACTIVATION SHAPE and its STOCK —
 *     `CONSUMABLE · 1 · KEY FIRES · ×2`, or `KEY PRIMES · CLICK FIRES` for the
 *     click-placed ones (`CONSUMABLE_IS_WEAPON`). The shape is the thing a
 *     player cannot guess, so it is stated in words, once, where they hover.
 */
export function interactionLine(
  slot: number,
  id: SlotItemId,
  cards: readonly string[] = [],
  stock = 0,
  stats?: EffectiveStats,
): string {
  if (slot === SLOT_GUN) return `WEAPON · ALWAYS SELECTED${gunTierSuffix(id, cards, stats)}`;
  const key = SLOT_KEY_GLYPHS[slot] ?? '';
  if (isConsumableId(id)) return consumableLine(id, key, stock);
  return EQUIPMENT_IS_WEAPON[id]
    ? `WEAPON · ${key} · SWITCH-TO${tierSuffix(id, cards)}`
    : `ABILITY · ${key} · ACTIVATES`;
}

/** ` · TIER n` for a slot standing on a rung, '' otherwise — an unfitted-but-
 *  somehow-present weapon reads 0, which prints nothing rather than a fake
 *  Tier I. With `stats` the number is `slotTier`'s (so the deck gun reads its
 *  own fold); without them only a line-keyed weapon can answer. */
function tierSuffix(id: EquipmentId, cards: readonly string[], stats?: EffectiveStats): string {
  const tier = stats === undefined ? lineTier(cards, lineForEquipment(id) ?? id) : slotTier(stats, cards, id);
  return tier > 0 ? ` · TIER ${TIER_WORDS[Math.min(tier, TIER_WORDS.length) - 1]}` : '';
}

/** The GUN slot's suffix. The deck gun's rung lives ONLY in the fold, so a
 *  caller without stats — or a belt id handed to the top slot, which cannot
 *  happen — prints nothing rather than guessing from the card list. */
function gunTierSuffix(id: SlotItemId, cards: readonly string[], stats?: EffectiveStats): string {
  if (stats === undefined || isConsumableId(id)) return '';
  return tierSuffix(id, cards, stats);
}

/** The belt's whole shape in one line (ruling 13). */
function consumableLine(id: ConsumableId, key: string, stock: number): string {
  const fires = CONSUMABLE_IS_WEAPON[id] ? 'KEY PRIMES · CLICK FIRES' : 'KEY FIRES';
  return `CONSUMABLE · ${key} · ${fires} · ×${Math.max(0, Math.trunc(stock))}`;
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
 * Null for equipment NO line fits — the permanent deck gun (whose ladders are
 * the deckGun family, which climb a slotless weapon) and the two legacy modules.
 * Built ONCE at module load off the frozen CATALOG.
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
 * An EMPTY list means SHIPWIDE - the five universal ladders (ARMOR, SPEED,
 * TURNING, RADAR SWEEP, RELOAD) move the whole vessel and belong to no weapon.
 * Amendment 51 makes the hotbar the only place a fitted card becomes visible, so
 * those need a home that is not a weapon: the gun slot's tooltip carries them
 * under a `- SHIP -` divider (the gun is the permanent top slot, i.e. the
 * natural ship card) and their fit flash is rank-wide rather than slot-local.
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

/** Pure: true iff this card belongs to no weapon - one of the five universal
 *  ladders (or an id this build cannot resolve). */
export function isShipwideCard(id: string): boolean {
  return cardEquipmentIds(id).length === 0;
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
 * colour. Fail-closed on an unknown id (0), the same discipline as slotBoonIds.
 */
export function lineTier(cards: readonly string[], lineId: string): number {
  const line = (CATALOG as Record<string, CatalogLine | undefined>)[lineId];
  if (line === undefined) return 0;
  return Math.min(boonStackCount(cards, lineId), line.cap);
}

/** The permanent deck gun's equipment id — the one row `slotTier` reads off the
 *  fold instead of off a catalog line. */
const GUN_EQUIPMENT_ID: EquipmentId = 'gun';

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
 * keyed by the line that fits the equipment, which for catalog v3 is the id
 * itself.
 */
export function slotTier(stats: EffectiveStats, cards: readonly string[], id: EquipmentId): number {
  if (id === GUN_EQUIPMENT_ID) return Math.min(stats.equipment.gun.tier, TIER_WORDS.length);
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
  loadout: readonly (SlotItemId | null)[],
  cardId: string,
): number | null {
  const targets = cardEquipmentIds(cardId);
  if (targets.length === 0) return null;
  for (let slot = 0; slot < loadout.length; slot += 1) {
    const id = loadout[slot];
    // A BELT slot's content is a consumable line id, which `cardEquipmentIds`
    // never yields (it lists EQUIPMENT a card addresses) — narrowed away rather
    // than compared, so the two id spaces never meet (ruling 1).
    if (id !== null && !isConsumableId(id) && targets.includes(id)) return slot;
  }
  return null;
}

/**
 * EFFECTIVE per-burst/per-hit damage (hp) for a piece of equipment, or null for
 * the ones that deal none. THE single damage read on the client — it comes off
 * the effective stats (Story 2.8: damage is stat-driven now, so a HEAVY SHELLS
 * / RDX FILLER stack moves this number), never off CONFIG.
 *
 * Star shells deal NO damage as of Story 2.8 (amendment 39 — pure illumination;
 * the INCENDIARY doctrine's DoT is a zone effect, not a hit), so they join the
 * speed boost and the radar buoy on the null branch.
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
    starShells: null,
    radarBuoy: null,
    // The widened ids carry real rows (catalog-v3 §4 base numbers, sim/stats.ts
    // STUB_ROWS) even though no module fires them yet, so the table stays TOTAL
    // and reads the same one place every other number comes from.
    lightTorpedo: e.lightTorpedo.damage,
    supercavTorpedo: e.supercavTorpedo.damage,
    captiveMines: e.captiveMines.damage,
    missile: e.missile.damage,
    machineGun: e.machineGun.damage,
    flak: e.flak.damage,
    monitor: e.monitor.damage,
  };
  return table[id];
}

/** Everything the hotbar row + tooltip need about one fitted slot's equipment. */
export interface EquipmentInfo {
  id: EquipmentId;
  name: string;
  description: string;
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
    description: equipmentDescription(stats, id),
    isWeapon: EQUIPMENT_IS_WEAPON[id],
    damage: equipmentDamage(stats, id),
    reloadMs: equipmentReloadMs(stats, id),
    maxAmmo: equipmentMaxAmmo(stats, id),
  };
}
