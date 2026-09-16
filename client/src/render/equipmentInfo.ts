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
  EQUIPMENT_IS_WEAPON,
  LINE_IDS,
  SLOT_GUN,
  equipmentMaxAmmo,
  equipmentReloadMs,
  tierTargetOf,
  type CatalogLine,
  type EffectiveStats,
  type EquipmentId,
} from '@salvo/shared';

/**
 * Slot → bound key glyph, in slot order. Story 8.5's nine-slot spine:
 * Gun · ⇧ · Q · E · R · 1 · 2 · 3 · 4, top-to-bottom.
 *
 * The GUN is KEYLESS (always selected — its chip renders as a ghost that keeps
 * the row alignment). Slot 1 is the BOOST and its glyph is `⇧` (U+21E7, the
 * platform-conventional Shift mark — Eric ruling 2026-09-16, epic-8 amendment
 * 29: the 22px mono chip holds exactly one glyph, so a SHIFT word chip was
 * rejected). Slots 2-4 are the three generic weapon slots; slots 5-8 are the
 * consumable belt, whose digits are REFIT-ONLY until Story 8.7 wires the rack
 * (amendment 27) — the chips are drawn now because the row they label exists
 * now, and a labelled row the player cannot yet use is Story 8.6's problem.
 */
export const SLOT_KEY_GLYPHS: readonly string[] = ['', '⇧', 'Q', 'E', 'R', '1', '2', '3', '4'];

/**
 * Display name per equipment id. The seven BUILT ids keep their shipped names
 * verbatim (Story 8.1 renamed ids, never copy); the eight ids catalog v3 widened
 * `EquipmentId` with carry their catalog-v3 §1 sheet name and nothing else —
 * no description, no glyph, no tone, because their modules do not exist yet
 * (Stories 8.13-8.16) and their catalog lines are stubs excluded from every deck.
 */
export const EQUIPMENT_NAME: Record<EquipmentId, string> = {
  gun: 'Deck Gun',
  heavyTorpedo: 'Torpedoes',
  navalMines: 'Mines',
  speedBoost: 'Speed Boost',
  broadside: 'Broadside Barrage',
  starShells: 'Star Shells',
  radarBuoy: 'Radar Buoy',
  // --- catalog-v3 §1 names for the ids no module answers to yet --------------
  boost: 'Speed Boost',
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
  speedBoost: 'Opens the throttle past its stops for a short burst of extra speed. Nothing else changes — you just leave sooner.',
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

/** The label a slot's tooltip uses for how the equipment is operated: the gun is
 *  keyless and permanently selected, weapons switch-to on their key, abilities
 *  activate immediately. Weapon-vs-ability comes ONLY from EQUIPMENT_IS_WEAPON,
 *  and the key comes ONLY from SLOT_KEY_GLYPHS — so the boost in slot 1 reads
 *  `ABILITY · ⇧ · ACTIVATES` without this function knowing what a boost is. */
export function interactionLine(slot: number, id: EquipmentId): string {
  if (slot === SLOT_GUN) return 'WEAPON · ALWAYS SELECTED';
  const key = SLOT_KEY_GLYPHS[slot] ?? '';
  return EQUIPMENT_IS_WEAPON[id]
    ? `WEAPON · ${key} · SWITCH-TO`
    : `ABILITY · ${key} · ACTIVATES`;
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
    speedBoost: null,
    broadside: e.broadside.damage,
    starShells: null,
    radarBuoy: null,
    // The widened ids carry real rows (catalog-v3 §4 base numbers, sim/stats.ts
    // STUB_ROWS) even though no module fires them yet, so the table stays TOTAL
    // and reads the same one place every other number comes from.
    boost: null,
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
