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
  EQUIPMENT_CATEGORY,
  EQUIPMENT_IS_WEAPON,
  SLOT_GUN,
  equipmentMaxAmmo,
  equipmentReloadMs,
  type EffectiveStats,
  type EquipmentId,
} from '@salvo/shared';

/** Slot → bound key glyph (amendment 10): the gun is KEYLESS (always selected —
 *  its chip renders as a ghost that keeps the row alignment), Q/E are the two
 *  class specials, R the pickup/extra slot. Top-to-bottom Gun – Q – E – R. */
export const SLOT_KEY_GLYPHS: readonly string[] = ['', 'Q', 'E', 'R'];

/** Display name per equipment id (DRAFT copy). */
export const EQUIPMENT_NAME: Record<EquipmentId, string> = {
  gun: 'Deck Gun',
  torpedo: 'Torpedoes',
  mine: 'Mines',
  speedBoost: 'Speed Boost',
  cannon: 'Heavy Cannon',
  starShells: 'Star Shells',
  decoyBuoy: 'Decoy Buoy',
};

/** One-to-two sentence tooltip description per equipment id (DRAFT copy). */
export const EQUIPMENT_DESCRIPTION: Record<EquipmentId, string> = {
  gun: 'The deck gun you always have. It flies to the clicked point and bursts there, hitting every hull inside the blast.',
  torpedo: 'A bow-launched fish that runs flat and straight until it finds a hull. Slow to reload, brutal on contact.',
  mine: 'Lays an armed mine at a point off your stern quarter. It waits, silent, until an enemy hull comes close, then takes the whole blast out of whoever found it.',
  speedBoost: 'Opens the throttle past its stops for a short burst of extra speed. Nothing else changes — you just leave sooner.',
  cannon: 'A main-battery shell for long work. It bursts at the aimed point and hits hard enough to be worth the wait.',
  starShells: 'An illumination round. Where it bursts, a wide circle of ocean lights up for everyone — including the hulls in it.',
  decoyBuoy: 'Drops an anchored buoy that paints a false radar contact exactly where you no longer are.',
};

/** The label a slot's tooltip uses for how the equipment is operated: the gun is
 *  keyless and permanently selected, weapons switch-to on their key, abilities
 *  activate immediately. Weapon-vs-ability comes ONLY from EQUIPMENT_IS_WEAPON. */
export function interactionLine(slot: number, id: EquipmentId): string {
  if (slot === SLOT_GUN) return 'WEAPON · ALWAYS SELECTED';
  const key = SLOT_KEY_GLYPHS[slot] ?? '';
  return EQUIPMENT_IS_WEAPON[id]
    ? `WEAPON · ${key} · SWITCH-TO`
    : `ABILITY · ${key} · ACTIVATES`;
}

/**
 * The two catalog categories that belong to no single slot: INTEL (sight/radar/
 * sweep) and SHIP (speed/hull) upgrade the whole vessel. Amendment 51 makes the
 * hotbar the ONLY place a boon becomes visible, so these need a home that is not
 * a weapon — the gun slot's tooltip carries them under a `— SHIP —` divider (the
 * gun is the permanent top slot, i.e. the natural ship card) and their fit flash
 * is rank-wide rather than slot-local.
 */
export const SHIPWIDE_CATEGORIES: readonly string[] = ['intel', 'ship'];

/**
 * Pure: the loadout slot a fitted boon's CATEGORY belongs to, or null when no
 * fitted slot owns it — a shipwide category (INTEL/SHIP), or an equipment
 * category for a piece of kit this hull does not carry (defensive: the server
 * only offers a subdeck's cards while its equipment is fitted).
 *
 * THE routing behind the fit flash (amendment 51): the boon lands on ITS slot.
 */
export function slotForBoonCategory(
  loadout: readonly (EquipmentId | null)[],
  category: string,
): number | null {
  for (let slot = 0; slot < loadout.length; slot += 1) {
    const id = loadout[slot];
    if (id !== null && EQUIPMENT_CATEGORY[id] === category) return slot;
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
 * speed boost and the decoy buoy on the null branch.
 */
export function equipmentDamage(stats: EffectiveStats, id: EquipmentId): number | null {
  return {
    gun: stats.gun.damage,
    torpedo: stats.torpedo.damage,
    mine: stats.mine.damage,
    speedBoost: null,
    cannon: stats.cannon.damage,
    starShells: null,
    decoyBuoy: null,
  }[id];
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
    description: EQUIPMENT_DESCRIPTION[id],
    isWeapon: EQUIPMENT_IS_WEAPON[id],
    damage: equipmentDamage(stats, id),
    reloadMs: equipmentReloadMs(stats, id),
    maxAmmo: equipmentMaxAmmo(stats, id),
  };
}
