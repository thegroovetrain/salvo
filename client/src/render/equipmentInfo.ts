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
  broadside: 'Broadside Barrage',
  starShells: 'Star Shells',
  radarBuoy: 'Radar Buoy',
};

/** One-to-two sentence tooltip description per equipment id (DRAFT copy). */
export const EQUIPMENT_DESCRIPTION: Record<EquipmentId, string> = {
  gun: 'The deck gun you always have. It flies to the clicked point and bursts there, hitting every hull inside the blast.',
  torpedo: 'A bow-launched fish that runs flat and straight until it finds a hull. Slow to reload, brutal on contact.',
  mine: 'Lays an armed mine at a point off your stern quarter. It waits, silent, until an enemy hull comes close, then takes the whole blast out of whoever found it.',
  speedBoost: 'Opens the throttle past its stops for a short burst of extra speed. Nothing else changes — you just leave sooner.',
  broadside: 'Every turret on the aimed beam fires at once. One shell runs to the point you clicked; the rest fan out to either side of it at the same range.',
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
  if (id === 'mine' && stats.mine.captive) return CAPTIVE_MINE_DESCRIPTION;
  return EQUIPMENT_DESCRIPTION[id];
}

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
 * speed boost and the radar buoy on the null branch.
 *
 * The BROADSIDE reports its PER-SHELL damage (Story 7-5 wave 2): every shell of
 * a barrage carries the same number and each bursts independently, so a
 * turret-count multiple would report a total no single hull can take.
 */
export function equipmentDamage(stats: EffectiveStats, id: EquipmentId): number | null {
  const table: Record<EquipmentId, number | null> = {
    gun: stats.gun.damage,
    torpedo: stats.torpedo.damage,
    mine: stats.mine.damage,
    speedBoost: null,
    broadside: stats.broadside.damage,
    starShells: null,
    radarBuoy: null,
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
