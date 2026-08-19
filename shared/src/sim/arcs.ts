// Firing-arc descriptors — THE single arc-shape source (Story 1.10). The
// class-era geometry is RATIFIED as-is (Eric ruling 2026-07-23): the gun
// family (gun / starShells) is 360° with no mounts and no arc; the torpedo
// launches in a bow sector (heading + CONFIG.torpedo.offset ± halfArc); the
// mine — a click-aimed weapon as of Story 2.8 (amendment 45) — places within a
// REAR sector (heading + CONFIG.mine.offset ± placeHalfArcDeg), and since
// Story 7-5 wave 2 the radar buoy is click-placed in that SAME rear sector; the
// BROADSIDE BARRAGE fires into one of two mirrored BEAM sectors (Story 7-5
// wave 2, R2.1 — the class-era side arcs restored verbatim); the speed boost
// aims nothing. Both sides consume THIS function — the server's launch checks
// and the client's arc classification (render/weaponArc.ts) — so the enforced
// arc and the rendered arc can never diverge. Pure over CONFIG: zero I/O,
// deterministic, no state.

import { CONFIG } from '../constants.js';
import type { EquipmentId } from './loadout.js';

/**
 * One equipment id's firing-arc shape:
 * - `full`        — 360°, aimed to the clicked point, never out of arc
 *                   (the gun family).
 * - `sector`      — an aimed launch sector `heading + offset ± halfArc`
 *                   (the torpedo's bow arc; the mine's and the radar buoy's
 *                   rear placement arc — aim outside it is DENIED).
 * - `twin-sector` — TWO MIRRORED aimed sectors at `heading ± offset`, each
 *                   `halfArc` wide (the BROADSIDE BARRAGE's beams). The side
 *                   whose sector contains the click is the side that fires
 *                   (R2.2); a click in NEITHER sector — the bow and stern dead
 *                   zones — is denied out-of-arc, exactly like a `sector` miss.
 * - `none`        — nothing spatial is aimed or placed (speedBoost).
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
 *  fields are authored in degrees). */
const deg = (d: number): number => (d * Math.PI) / 180;

/**
 * The ratified arc shape for a fitted equipment id, derived from CONFIG only
 * (gun/starShells declare `arc: 'full'`; the torpedo sector reads
 * CONFIG.torpedo.offset/halfArc; the mine's AND the radar buoy's rear
 * placement sector reads CONFIG.mine.offset/placeHalfArcDeg — Story 2.8
 * amendment 45, Story 7-5 wave 2 R2.7; the broadside's twin beams read
 * CONFIG.broadside.arcOffsetDeg/arcHalfArcDeg). Compile-forced to cover every
 * EquipmentId; a new id cannot ship without declaring its arc here.
 */
export function arcFor(id: EquipmentId): ArcShape {
  switch (id) {
    case 'gun':
    case 'starShells':
      return { kind: CONFIG[id].arc };
    case 'torpedo':
      return { kind: 'sector', offset: CONFIG.torpedo.offset, halfArc: CONFIG.torpedo.halfArc };
    case 'mine':
    case 'radarBuoy':
      return { kind: 'sector', offset: CONFIG.mine.offset, halfArc: deg(CONFIG.mine.placeHalfArcDeg) };
    case 'broadside':
      return {
        kind: 'twin-sector',
        offset: deg(CONFIG.broadside.arcOffsetDeg),
        halfArc: deg(CONFIG.broadside.arcHalfArcDeg),
      };
    case 'speedBoost':
      return { kind: 'none' };
  }
}

/**
 * The narrowed `sector` descriptor for an id DECLARED a sector (the torpedo's
 * bow arc; the mine's and radar buoy's rear placement arc). Throws on any
 * other shape — a CONFIG/arcs authoring error, failed loudly at module load
 * rather than mid-tick. Pure (a throw, never I/O).
 */
export function sectorArcFor(id: EquipmentId): Extract<ArcShape, { kind: 'sector' }> {
  const arc = arcFor(id);
  if (arc.kind !== 'sector') throw new Error(`'${id}' arc must be a sector (sim/arcs.ts)`);
  return arc;
}

/**
 * The narrowed `twin-sector` descriptor for an id DECLARED twin sectors (the
 * BROADSIDE BARRAGE's two beams). Throws on any other shape — same
 * authoring-error law as sectorArcFor.
 */
export function twinSectorArcFor(id: EquipmentId): Extract<ArcShape, { kind: 'twin-sector' }> {
  const arc = arcFor(id);
  if (arc.kind !== 'twin-sector') throw new Error(`'${id}' arc must be a twin-sector (sim/arcs.ts)`);
  return arc;
}
