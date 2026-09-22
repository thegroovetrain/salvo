// Firing-arc descriptors — THE single arc-shape source (Story 1.10). The
// class-era geometry is RATIFIED as-is (Eric ruling 2026-07-23): the gun
// family (gun / starShells) is 360° with no mounts and no arc; the HEAVY
// torpedo launches in a bow sector (heading + CONFIG.torpedo.offset ±
// halfArc); the mine — a click-aimed weapon as of Story 2.8 (amendment 45) —
// places within a REAR sector (heading + CONFIG.mine.offset ±
// placeHalfArcDeg), and since Story 7-5 wave 2 the radar buoy is click-placed
// in that SAME rear sector; the BROADSIDE BARRAGE fires into one of two
// mirrored BEAM sectors (Story 7-5 wave 2, R2.1 — the class-era side arcs
// restored verbatim); the speed boost aims nothing.
//
// STORY 8.13 WIDENED IT PAST EQUIPMENT. `arcFor` now takes a `SlotItemId`,
// because the SUPERCAV TORPEDO is a click-aimed CONSUMABLE (epic-8 amendment
// 74) and must be arc-checked like any other aimed weapon. With it: the LIGHT
// TORPEDO declares a TWIN SECTOR (both beams, ±45°, catalog-v3 R18) and
// FOULING MINES joins the rear placement sector.
//
// Both sides consume THIS function — the server's launch checks and the
// client's arc classification (render/weaponArc.ts) — so the enforced arc and
// the rendered arc can never diverge. Pure over CONFIG: zero I/O,
// deterministic, no state.

import { CONFIG } from '../constants.js';
import { inArc, wrapAngle } from '../math/angle.js';
import { isConsumableId } from './loadout.js';
import type { EquipmentId, SlotItemId } from './loadout.js';
import type { ConsumableId } from './effects.js';
import type { MineKind } from '../types.js';

/**
 * One equipment id's firing-arc shape:
 * - `full`        — 360°, aimed to the clicked point, never out of arc
 *                   (the gun family).
 * - `sector`      — an aimed launch sector `heading + offset ± halfArc`
 *                   (the torpedo's bow arc; the mine's and the radar buoy's
 *                   rear placement arc — aim outside it is DENIED).
 * - `twin-sector` — TWO MIRRORED aimed sectors at `heading ± offset`, each
 *                   `halfArc` wide (the BROADSIDE BARRAGE's beams; the LIGHT
 *                   TORPEDO's two beam tubes since 8.13). The side
 *                   whose sector contains the click is the side that fires
 *                   (R2.2); a click in NEITHER sector — the bow and stern dead
 *                   zones — is denied out-of-arc, exactly like a `sector` miss.
 * - `none`        — nothing spatial is aimed or placed (the Shift boost).
 *
 * THE `stern-drop` SHAPE IS DELETED (Story 7-5 wave 2): the decoy buoy was its
 * only user, and the radar buoy replacing it is click-placed in the mine's rear
 * SECTOR. An un-aimed placement grammar with no equipment behind it is a dead
 * branch in every consumer's switch, so it goes with its user rather than
 * waiting for a hypothetical next one.
 */
export type ArcShape =
  | { kind: 'full' }
  | { kind: 'sector'; offset: number; halfArc: number }
  | { kind: 'twin-sector'; offset: number; halfArc: number }
  | { kind: 'none' };

/** deg -> rad (CONFIG.mine.placeHalfArcDeg and CONFIG.broadside's two arc
 *  fields are authored in degrees; the torpedo blocks already hold radians). */
const deg = (d: number): number => (d * Math.PI) / 180;

/**
 * The ratified arc shape for ANYTHING A SLOT MAY HOLD — equipment or a
 * CONSUMABLE (Story 8.13: the SUPERCAV TORPEDO is a click-aimed belt fish,
 * epic-8 amendment 74, so the arc grammar had to widen past `EquipmentId`).
 * Derived from CONFIG only, and compile-forced to cover every id: a new one
 * cannot ship without declaring its arc here.
 */
export function arcFor(id: SlotItemId): ArcShape {
  return isConsumableId(id) ? consumableArc(id) : equipmentArc(id);
}

/**
 * A CONSUMABLE's arc. Only the SUPERCAV TORPEDO aims today — the bow ±15°
 * sector of `CONFIG.supercavTorpedo` (amendment 74) — and every other line off
 * the `1`–`4` rail is an instant activation that aims nothing. THE DECOY
 * BUOY'S ARC IS STORY 8.15'S: it is `CONSUMABLE_IS_WEAPON`-true and
 * click-placed, but its module and its CONFIG block land there, and declaring
 * a literal for it here would put an uncited number in the arc grammar.
 */
function consumableArc(id: ConsumableId): ArcShape {
  if (id !== 'supercavTorpedo') return { kind: 'none' };
  return { kind: 'sector', offset: CONFIG.supercavTorpedo.offset, halfArc: CONFIG.supercavTorpedo.halfArc };
}

/**
 * THE THREE MINE LINES — the ONE home for the list (Story 8.13). One hull may
 * fit naval, captive and fouling racks at once, so "is this a mine?" and "which
 * kind does this line lay?" are asked on BOTH sides: the server keys every
 * runtime number off the mine's kind, and the client keys the placement leash,
 * the rear wedge, the drop preview and the own rings off the same facts. They
 * lived in three places (this file's private chassis guard, the server's
 * `MINE_ROW_ID`, the client's `render/weaponArc.ts` list) with a cross-check
 * test holding them together; they live HERE now, and the cross-check survives
 * as the guard against a fourth kind.
 *
 * It sits in `arcs.ts` because the rear placement sector is what makes these
 * ids one family in the first place — `isMineChassis` below is this list plus
 * the legacy radar buoy, which shares the arc and the leash but lays nothing.
 */
export const MINE_EQUIPMENT_IDS = ['navalMines', 'captiveMines', 'foulingMines'] as const satisfies
  readonly EquipmentId[];

/** One of the three mine LINES (never the radar buoy). */
export type MineEquipmentId = (typeof MINE_EQUIPMENT_IDS)[number];

/** Pure: is this slot content one of the three MINE lines? Accepts a null so
 *  every "what is in this slot" caller can ask it directly. */
export function isMineEquipment(id: SlotItemId | null): id is MineEquipmentId {
  return id !== null && (MINE_EQUIPMENT_IDS as readonly string[]).includes(id);
}

/** The MINE LINE ↔ the `MineKind` a mine laid from it carries (stamped at drop
 *  on the server, and the own-only `MineView.c` on the wire — epic-8 amendment
 *  76). Two tiny TOTAL maps rather than a string-prefix trick, so a fourth kind
 *  fails to compile on both sides. */
const MINE_KIND_OF: Readonly<Record<MineEquipmentId, MineKind>> = {
  navalMines: 'naval',
  captiveMines: 'captive',
  foulingMines: 'fouling',
};

const MINE_ID_OF: Readonly<Record<MineKind, MineEquipmentId>> = {
  naval: 'navalMines',
  captive: 'captiveMines',
  fouling: 'foulingMines',
};

/** Pure: the kind a mine laid from this line is. */
export function mineKindOf(id: MineEquipmentId): MineKind {
  return MINE_KIND_OF[id];
}

/** Pure: the equipment row a mine of this kind reads its rings, its damage and
 *  its pool off — the OWNER's own stats row for that line, never `navalMines`
 *  standing in for all three (epic-8 amendment 76). */
export function mineEquipmentFor(kind: MineKind): MineEquipmentId {
  return MINE_ID_OF[kind];
}

/** The four ids that share the MINE's rear placement sector — the three mine
 *  lines plus the legacy click-placed radar buoy (Story 2.8 amendment 45,
 *  Story 7-5 wave 2 R2.7). A type guard, so the switch below still narrows its
 *  `default` down to the ids that genuinely declare no arc. */
function isMineChassis(id: EquipmentId): id is MineEquipmentId | 'radarBuoy' {
  return isMineEquipment(id) || id === 'radarBuoy';
}

/**
 * A piece of EQUIPMENT's arc: gun/starShells declare `arc: 'full'` in CONFIG;
 * the LIGHT torpedo fires into TWO mirrored beam sectors
 * (CONFIG.lightTorpedo.offset/halfArc — ±45° about both beams, 90° dead zones
 * fore and aft, catalog-v3 R18); the HEAVY torpedo keeps its bow sector
 * (CONFIG.torpedo.offset/halfArc); the three MINE kinds and the radar buoy
 * share the rear placement sector (CONFIG.mine.offset/placeHalfArcDeg); the
 * broadside's twin beams read CONFIG.broadside.arcOffsetDeg/arcHalfArcDeg.
 */
function equipmentArc(id: EquipmentId): ArcShape {
  if (isMineChassis(id)) {
    return { kind: 'sector', offset: CONFIG.mine.offset, halfArc: deg(CONFIG.mine.placeHalfArcDeg) };
  }
  switch (id) {
    case 'gun':
    case 'starShells':
      return { kind: CONFIG[id].arc };
    case 'lightTorpedo':
      return { kind: 'twin-sector', offset: CONFIG.lightTorpedo.offset, halfArc: CONFIG.lightTorpedo.halfArc };
    case 'heavyTorpedo':
      return { kind: 'sector', offset: CONFIG.torpedo.offset, halfArc: CONFIG.torpedo.halfArc };
    case 'broadside':
      return {
        kind: 'twin-sector',
        offset: deg(CONFIG.broadside.arcOffsetDeg),
        halfArc: deg(CONFIG.broadside.arcHalfArcDeg),
      };
    default:
      return unbuiltArc(id);
  }
}

/**
 * THE FOUR STILL-UNBUILT v3 WEAPONS and the SHIFT BOOST declare NO aimed arc.
 * For the boost that is the shipped answer (an instant activation aims nothing
 * — Story 8.9); for the four it is the honest one: no module aims them and
 * their catalog lines are STUBS that can never be dealt, so no loadout can
 * hold one. Their arcs are already RULED and each lands with its module —
 * catalog-v3 §4: MISSILE bow ±50°, MACHINE GUN bow ±90°, FLAK 360°, MONITOR
 * bow ±10° (Story 8.15, which CUTS missile and monitor — amendment 89e).
 * Declaring them here before their CONFIG blocks exist
 * would put four uncited literals in the arc grammar.
 *
 * It shrank from seven to four in Story 8.13: the LIGHT TORPEDO declares its
 * twin sector above, the SUPERCAV TORPEDO declares its bow sector as a
 * consumable, and FOULING MINES joined the mine chassis.
 *
 * The narrow parameter type is the COMPILE FORCE: a new EquipmentId is not
 * assignable to it, so it cannot reach this default without declaring an arc.
 */
function unbuiltArc(_id: 'boost' | 'missile' | 'machineGun' | 'flak' | 'monitor'): ArcShape {
  return { kind: 'none' };
}

/**
 * The narrowed `sector` descriptor for an id DECLARED a sector (the heavy
 * torpedo's bow arc; the supercav's; the three mines' and the radar buoy's
 * rear placement arc). Throws on any other shape — a CONFIG/arcs authoring
 * error, failed loudly at module load rather than mid-tick. Pure (a throw,
 * never I/O).
 */
export function sectorArcFor(id: SlotItemId): Extract<ArcShape, { kind: 'sector' }> {
  const arc = arcFor(id);
  if (arc.kind !== 'sector') throw new Error(`'${id}' arc must be a sector (sim/arcs.ts)`);
  return arc;
}

/**
 * The narrowed `twin-sector` descriptor for an id DECLARED twin sectors (the
 * BROADSIDE BARRAGE's two beams; the LIGHT TORPEDO's two beam tubes). Throws
 * on any other shape — same authoring-error law as sectorArcFor.
 */
export function twinSectorArcFor(id: SlotItemId): Extract<ArcShape, { kind: 'twin-sector' }> {
  const arc = arcFor(id);
  if (arc.kind !== 'twin-sector') throw new Error(`'${id}' arc must be a twin-sector (sim/arcs.ts)`);
  return arc;
}

/**
 * WHICH beam of a `twin-sector` descriptor contains `aim` — `+1` for the
 * `heading + offset` sector, `-1` for the mirrored `heading - offset` one, and
 * `null` when the aim falls in neither (the bow/stern dead zones, DENIED —
 * R2.1). This IS R2.2's "the side whose sector contains the click is the side
 * that fires", and it is the ONE answer three consumers now read: the server's
 * broadside fire control (which side's turrets fire), the client's firing UX
 * (which wedge lights) and the client's aim preview (which side the muzzles sit
 * on). It was CLIENT-ONLY until Eric's 2026-08-19 turret correction gave the
 * side a GEOMETRIC consequence — the muzzle points themselves — at which point
 * a server copy of the rule became the desync class `shared/` exists to
 * prevent, so it was promoted here beside the descriptor it reads.
 *
 * The two sectors cannot overlap at the ratified 90°/60° geometry, and the `+`
 * side is tested first so a hypothetical retune that made them overlap would
 * still resolve to ONE side rather than an ambiguous both.
 *
 * SIGN CONVENTION, load-bearing for `turretMuzzles`: `+1` is the
 * `heading + offset` beam, i.e. 90° COUNTER-CLOCKWISE of the bow at the
 * ratified offset — the direction `(-sin heading, cos heading)`.
 */
export function twinSectorSide(
  heading: number,
  aim: number,
  arc: { offset: number; halfArc: number },
): 1 | -1 | null {
  if (inArc(aim, wrapAngle(heading + arc.offset), arc.halfArc)) return 1;
  if (inArc(aim, wrapAngle(heading - arc.offset), arc.halfArc)) return -1;
  return null;
}
