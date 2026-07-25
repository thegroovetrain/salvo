// Per-equipment DISPLAY information for the hotbar + slot tooltip (Story 2.2).
// The single client-side seam between an EquipmentId and the words/numbers the
// player reads: display name, draft description copy, the interaction line
// ("WEAPON · Q · SWITCH-TO"), and the numeric quick-info inputs.
//
// Numbers rule: reload/pool come from `effectiveStats()` (the desync firewall —
// they move with upgrades), damage comes from `CONFIG.<id>.damage` through the
// ONE helper below. Damage is deliberately NOT part of EffectiveStats: no
// damage upgrade exists today, and this helper is the single seam to migrate
// when Story 2.5's boon path makes damage stat-driven. Nothing here hand-copies
// a number.
//
// COPY STATUS: every name/description is DRAFT PLACEHOLDER (amendment 13, the
// boon-copy rule) — canon later.

import {
  CONFIG,
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
  gun: 'Standard Gun',
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
  mine: 'Drops an armed mine off your stern. It waits, silent, until an enemy hull passes over it.',
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

/** Per-burst/per-hit damage (hp) for a piece of equipment, or null for the
 *  ones that deal none. THE single CONFIG damage read on the client. */
export function equipmentDamage(id: EquipmentId): number | null {
  return {
    gun: CONFIG.gun.damage,
    torpedo: CONFIG.torpedo.damage,
    mine: CONFIG.mine.damage,
    speedBoost: null,
    cannon: CONFIG.cannon.damage,
    starShells: CONFIG.starShells.damage,
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
    damage: equipmentDamage(id),
    reloadMs: equipmentReloadMs(stats, id),
    maxAmmo: equipmentMaxAmmo(stats, id),
  };
}
