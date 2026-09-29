// Firing-arc descriptors — THE single arc-shape source (Story 1.10). The
// class-era geometry is RATIFIED as-is (Eric ruling 2026-07-23): the gun
// family (gun / starShells) is 360° with no mounts and no arc; the HEAVY
// torpedo launches in a bow sector (heading + CONFIG.torpedo.offset ±
// halfArc); the mine — a click-aimed weapon as of Story 2.8 (amendment 45) —
// places within a REAR sector (heading + CONFIG.mine.offset ±
// placeHalfArcDeg), and since Story 8.16 the DECOY BUOY consumable is
// click-placed in that SAME rear sector (the radar buoy that used it before is
// deleted); the BROADSIDE BARRAGE fires into one of two
// mirrored BEAM sectors (Story 7-5 wave 2, R2.1 — the class-era side arcs
// restored verbatim); the class Shifts (boost, instant reload, damage cut) aim
// nothing.
//
// STORY 8.15: NO GUN HAS AN ARC (Eric ruling 2026-09-28, epic-8 amendment 106,
// verbatim: "There is no 'arc.' All of these guns get a 360 degree arc."). The
// cannon, the machine gun and the flak gun all declare `arc: 'full'` in CONFIG,
// so no gun click or stream can ever be denied out-of-arc.
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
 *                   (every gun — cannon, machine gun, flak — star shells,
 *                   phosphor shells and the FLASH SHELLS consumable).
 * - `sector`      — an aimed launch sector `heading + offset ± halfArc`
 *                   (the torpedo's bow arc; the mine's and the decoy buoy's
 *                   rear placement arc — aim outside it is DENIED).
 * - `twin-sector` — TWO MIRRORED aimed sectors at `heading ± offset`, each
 *                   `halfArc` wide (the BROADSIDE BARRAGE's beams; the LIGHT
 *                   TORPEDO's two beam tubes since 8.13). The side
 *                   whose sector contains the click is the side that fires
 *                   (R2.2); a click in NEITHER sector — the bow and stern dead
 *                   zones — is denied out-of-arc, exactly like a `sector` miss.
 * - `none`        — nothing spatial is aimed or placed (the three Shifts).
 *
 * THE `stern-drop` SHAPE IS DELETED (Story 7-5 wave 2): the decoy buoy was its
 * only user, and the buoys that followed it (the radar buoy, then the 8.16
 * DECOY BUOY consumable) are click-placed in the mine's rear SECTOR. An un-aimed placement grammar with no equipment behind it is a dead
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
 * A CONSUMABLE's arc. THREE lines aim: the SUPERCAV TORPEDO's bow ±15° sector
 * (`CONFIG.supercavTorpedo`, amendment 74); the DECOY BUOY, which is
 * click-placed in the MINE's rear sector (`CONFIG.mine.offset` ±
 * `placeHalfArcDeg`, out to `placeRange` — Story 8.16, catalog-v3 R36); and
 * FLASH SHELLS (`dazzleShells`, Story 8.17, Eric ruling 2026-09-29, epic-8
 * amendment 132), a 360° gun-pattern shell (`CONFIG.flashShells.arc`) whose
 * reach is the star shell's — the post-fold `radarRange`. Every other line off
 * the `1`–`4` rail is an instant activation that aims nothing.
 */
function consumableArc(id: ConsumableId): ArcShape {
  if (id === 'dazzleShells') return { kind: CONFIG.flashShells.arc };
  if (id === 'decoyBuoy') return mineSector();
  if (id !== 'supercavTorpedo') return { kind: 'none' };
  return { kind: 'sector', offset: CONFIG.supercavTorpedo.offset, halfArc: CONFIG.supercavTorpedo.halfArc };
}

/** The MINE's rear placement sector — shared by the three mine lines and the
 *  DECOY BUOY consumable. */
function mineSector(): ArcShape {
  return { kind: 'sector', offset: CONFIG.mine.offset, halfArc: deg(CONFIG.mine.placeHalfArcDeg) };
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
 * ids one family in the first place. (The legacy radar buoy shared it until
 * Story 8.16 deleted the buoy; the DECOY BUOY consumable shares it now, via
 * `consumableArc`, but it is not a mine line.)
 */
export const MINE_EQUIPMENT_IDS = ['navalMines', 'captiveMines', 'foulingMines'] as const satisfies
  readonly EquipmentId[];

/** One of the three mine LINES (never the decoy buoy). */
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

/**
 * A piece of EQUIPMENT's arc: the three guns (gun/machineGun/flak),
 * starShells and phosphorShells (Story 8.17, amendment 131) declare
 * `arc: 'full'` in CONFIG (amendment 106 for the guns);
 * the LIGHT torpedo fires into TWO mirrored beam sectors
 * (CONFIG.lightTorpedo.offset/halfArc — ±45° about both beams, 90° dead zones
 * fore and aft, catalog-v3 R18); the HEAVY torpedo keeps its bow sector
 * (CONFIG.torpedo.offset/halfArc); the three MINE kinds share the rear
 * placement sector (CONFIG.mine.offset/placeHalfArcDeg — `isMineEquipment` is
 * a type guard, so the switch still narrows its `default` down to the ids that
 * genuinely declare no arc); the
 * broadside's twin beams read CONFIG.broadside.arcOffsetDeg/arcHalfArcDeg.
 */
function equipmentArc(id: EquipmentId): ArcShape {
  if (isMineEquipment(id)) return mineSector();
  switch (id) {
    case 'gun':
    case 'machineGun':
    case 'flak':
    case 'starShells':
    case 'phosphorShells':
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
 * THE THREE CLASS SHIFTS declare NO aimed arc (Story 8.15, amendments 89c and
 * 97–102): SPEED BOOST, INSTANT RELOAD and DAMAGE CUT are instant activations
 * that aim nothing (the Story 8.9 boost answer, now for all three).
 *
 * THE UNBUILT WEAPONS ARE GONE FROM THIS DEFAULT. It shrank from seven to four
 * in Story 8.13 (the light and supercav torpedoes and fouling mines declared
 * theirs), and Story 8.15 emptied it of weapons: MISSILE and MONITOR are CUT
 * (amendment 89e), and the MACHINE GUN and FLAK GUN are 360° guns declared
 * above — their catalog-v3 arcs (bow ±90° for the machine gun) are VOID by
 * amendment 106.
 *
 * The narrow parameter type is the COMPILE FORCE: a new EquipmentId is not
 * assignable to it, so it cannot reach this default without declaring an arc.
 */
function unbuiltArc(_id: 'boost' | 'instantReload' | 'damageCut'): ArcShape {
  return { kind: 'none' };
}

/**
 * The narrowed `sector` descriptor for an id DECLARED a sector (the heavy
 * torpedo's bow arc; the supercav's; the three mines' and the decoy buoy's
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
