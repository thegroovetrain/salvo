// Firing-arc descriptors — THE single arc-shape source (Story 1.10). The
// class-era geometry is RATIFIED as-is (Eric ruling 2026-07-23): the gun
// family (gun / starShells) is 360° with no mounts and no arc; the HEAVY
// torpedo launches in a bow sector (heading + CONFIG.torpedo.offset ±
// halfArc); the mine — a click-aimed weapon as of Story 2.8 (amendment 45) —
// places within a REAR sector (heading + CONFIG.mine.offset ±
// placeHalfArcDeg); the BROADSIDE BARRAGE fires into one of two
// mirrored BEAM sectors (Story 7-5 wave 2, R2.1 — the class-era side arcs
// restored verbatim); the class Shifts (boost, instant reload, hunker) aim
// nothing.
//
// STORY 8.15: NO GUN HAS AN ARC (Eric ruling 2026-09-28, epic-8 amendment 106,
// verbatim: "There is no 'arc.' All of these guns get a 360 degree arc."). The
// cannon, the machine gun and the flak gun all declare `arc: 'full'` in CONFIG,
// so no gun click or stream can ever be denied out-of-arc.
//
// STORY 8.13: the LIGHT TORPEDO declares a TWIN SECTOR (both beams, ±45°,
// catalog-v3 R18) and FOULING MINES joins the rear placement sector.
//
// STORY 10.5 (2026-11-05, epic-10 amendment 11): the consumable arcs are gone
// with the kit. The three moved weapons keep the arcs they had as consumables,
// declared as equipment now — the SUPERCAV TORPEDO's bow ±15° sector, the
// FOULING SHELL and FLASH SHELLS at 360° — and `arcFor` takes an `EquipmentId`
// again.
//
// STORY 10.6 (Eric 2026-11-05, R6, epic-10 amendment 12): THE THREE FIXED
// TORPEDO SECTORS ARE RETIRED — the light torpedo's twin beams, the heavy's
// bow ±30° and the supercav's bow ±15° (and their CONFIG `offset` / `halfArc`).
// A torpedo leaves a deck LAUNCHER that trains like a turret, so all three
// ids declare the new `launcher` shape and the geometry is sim/launchers.ts's:
// `launcherSectors(launchers)` (the union to draw / plan by) and
// `pickTube` (the enforced verdict). `sectorArcFor` / `twinSectorArcFor` now
// THROW on a torpedo id.
//
// Both sides consume THIS function — the server's launch checks and the
// client's arc classification (render/weaponArc.ts) — so the enforced arc and
// the rendered arc can never diverge. Pure over CONFIG: zero I/O,
// deterministic, no state.

import { CONFIG } from '../constants.js';
import { inArc, wrapAngle } from '../math/angle.js';
import type { EquipmentId } from './loadout.js';
import type { MineKind } from '../types.js';

/**
 * One equipment id's firing-arc shape:
 * - `full`        — 360°, aimed to the clicked point, never out of arc
 *                   (every gun — cannon, machine gun, flak — star shells,
 *                   phosphor shells, the FOULING SHELL and FLASH SHELLS).
 * - `sector`      — an aimed launch sector `heading + offset ± halfArc`
 *                   (the torpedo's bow arc; the mines' rear placement arc —
 *                   aim outside it is DENIED).
 * - `twin-sector` — TWO MIRRORED aimed sectors at `heading ± offset`, each
 *                   `halfArc` wide (the BROADSIDE BARRAGE's beams; the LIGHT
 *                   TORPEDO's two beam tubes since 8.13). The side
 *                   whose sector contains the click is the side that fires
 *                   (R2.2); a click in NEITHER sector — the bow and stern dead
 *                   zones — is denied out-of-arc, exactly like a `sector` miss.
 * - `launcher`    — a TORPEDO (Story 10.6, R6 / R28): the arc is the union of
 *                   the firing bands of the launchers the SHIP holds — each
 *                   from deadDeg to trainDeg off its own end, both sides —
 *                   which is per-ship state, so
 *                   it is not in this descriptor: read
 *                   `launcherSectors(stats.torpedoLaunchers)` (drawing,
 *                   planning) and `pickTube` (the verdict), sim/launchers.ts.
 * - `none`        — nothing spatial is aimed or placed (the three Shifts).
 *
 * THE `stern-drop` SHAPE IS DELETED (Story 7-5 wave 2) with its only user: an
 * un-aimed placement grammar with no equipment behind it is a dead branch in
 * every consumer's switch.
 */
export type ArcShape =
  | { kind: 'full' }
  | { kind: 'sector'; offset: number; halfArc: number }
  | { kind: 'twin-sector'; offset: number; halfArc: number }
  | { kind: 'launcher' }
  | { kind: 'none' };

/** deg -> rad (CONFIG.mine.placeHalfArcDeg and CONFIG.broadside's two arc
 *  fields are authored in degrees). */
const deg = (d: number): number => (d * Math.PI) / 180;

/**
 * The ratified arc shape of a piece of equipment. Derived from CONFIG only,
 * and compile-forced to cover every id: a new one cannot ship without
 * declaring its arc here.
 */
export function arcFor(id: EquipmentId): ArcShape {
  return equipmentArc(id);
}

/** The MINE's rear placement sector — shared by the three mine lines. */
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
 * ids one family in the first place — the same three ids `EQUIPMENT_FAMILY`
 * (sim/loadout.ts) files under the `mine` slot family.
 */
export const MINE_EQUIPMENT_IDS = ['navalMines', 'captiveMines', 'foulingMines'] as const satisfies
  readonly EquipmentId[];

/** One of the three mine LINES. */
export type MineEquipmentId = (typeof MINE_EQUIPMENT_IDS)[number];

/** Pure: is this slot content one of the three MINE lines? Accepts a null so
 *  every "what is in this slot" caller can ask it directly. */
export function isMineEquipment(id: EquipmentId | null): id is MineEquipmentId {
  return id !== null && (MINE_EQUIPMENT_IDS as readonly string[]).includes(id);
}

/** The MINE LINE ↔ the `MineKind` a mine laid from it carries (stamped at drop
 *  on the server, and `MineView.c` on the wire for every observer who receives
 *  the mine — Eric 2026-10-01, superseding epic-8 amendment 76's own-only
 *  rule). Two tiny TOTAL maps rather than a string-prefix trick, so a fourth kind
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
 * the three TORPEDOES declare `launcher` (Story 10.6, R6 — their fixed
 * sectors are retired); the three MINE kinds share the rear
 * placement sector (CONFIG.mine.offset/placeHalfArcDeg — `isMineEquipment` is
 * a type guard, so the switch still narrows its `default` down to the ids that
 * genuinely declare no arc); the
 * broadside's twin beams read CONFIG.broadside.arcOffsetDeg/arcHalfArcDeg.
 */
/**
 * The equipment rows whose arc is the `arc` field of their own CONFIG block
 * (all `'full'` today). THE MAIN BATTERY is one (Story 10.4): every bearing is
 * inside SOME turret's arc on every hull and a click always fires (R4), so the
 * weapon's arc is 360° — which turrets bear on a bearing is sim/turrets.ts
 * `gunsBearing`, never this grammar.
 */
const CONFIG_ARC_ROWS = [
  'gun',
  'machineGun',
  'flak',
  'starShells',
  'phosphorShells',
  'mainBattery',
  'foulingShell', // 360° gun-pattern shell (Story 9.4; equipment since 10.5)
] as const satisfies readonly EquipmentId[];

function isConfigArcRow(id: EquipmentId): id is (typeof CONFIG_ARC_ROWS)[number] {
  return (CONFIG_ARC_ROWS as readonly EquipmentId[]).includes(id);
}

function equipmentArc(id: EquipmentId): ArcShape {
  if (isMineEquipment(id)) return mineSector();
  if (isConfigArcRow(id)) return { kind: CONFIG[id].arc };
  switch (id) {
    case 'lightTorpedo':
    case 'heavyTorpedo':
    case 'supercavTorpedo': // one arc for all three: the held launchers' (Story 10.6, R6)
      return { kind: 'launcher' };
    case 'dazzleShells': // FLASH SHELLS: 360°, its arc lives on `CONFIG.flashShells` (the id and the block differ)
      return { kind: CONFIG.flashShells.arc };
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
 * 97–102): SPEED BOOST, INSTANT RELOAD and HUNKER (was DAMAGE CUT until Story 9.9) are instant activations
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
function unbuiltArc(_id: 'boost' | 'instantReload' | 'hunker'): ArcShape {
  return { kind: 'none' };
}

/**
 * The narrowed `sector` descriptor for an id DECLARED a sector (the three
 * mines' rear placement arc — no torpedo since Story 10.6). Throws on any other shape — a CONFIG/arcs authoring
 * error, failed loudly at module load rather than mid-tick. Pure (a throw,
 * never I/O).
 */
export function sectorArcFor(id: EquipmentId): Extract<ArcShape, { kind: 'sector' }> {
  const arc = arcFor(id);
  if (arc.kind !== 'sector') throw new Error(`'${id}' arc must be a sector (sim/arcs.ts)`);
  return arc;
}

/**
 * The narrowed `twin-sector` descriptor for an id DECLARED twin sectors (the
 * BROADSIDE BARRAGE's two beams — no torpedo since Story 10.6). Throws
 * on any other shape — same authoring-error law as sectorArcFor.
 */
export function twinSectorArcFor(id: EquipmentId): Extract<ArcShape, { kind: 'twin-sector' }> {
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
