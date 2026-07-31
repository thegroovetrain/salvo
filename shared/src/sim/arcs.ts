// Firing-arc descriptors — THE single arc-shape source (Story 1.10). The
// class-era geometry is RATIFIED as-is (Eric ruling 2026-07-23): the gun
// family (gun / cannon / starShells) is 360° with no mounts and no arc; the
// torpedo launches in a bow sector (heading + CONFIG.torpedo.offset ±
// halfArc); the mine — a click-aimed weapon as of Story 2.8 (amendment 45) —
// places within a REAR sector (heading + CONFIG.mine.offset ±
// placeHalfArcDeg); the decoyBuoy still drops astern at CONFIG.mine.offset
// regardless of aim; the speed boost aims nothing. Both sides consume THIS
// function — the server's launch checks and the client's arc classification
// (render/weaponArc.ts) — so the enforced arc and the rendered arc can never
// diverge. Pure over CONFIG: zero I/O, deterministic, no state.

import { CONFIG } from '../constants.js';
import type { EquipmentId } from './loadout.js';

/**
 * One equipment id's firing-arc shape:
 * - `full`       — 360°, aimed to the clicked point, never out of arc
 *                  (the gun family).
 * - `sector`     — an aimed launch sector `heading + offset ± halfArc`
 *                  (the torpedo's bow arc; the mine's rear placement arc as of
 *                  Story 2.8 — aim outside it is DENIED).
 * - `stern-drop` — an un-aimed placement astern at `heading + offset`
 *                  (decoyBuoy — the stern rack).
 * - `none`       — nothing spatial is aimed or placed (speedBoost).
 */
export type ArcShape =
  | { kind: 'full' }
  | { kind: 'sector'; offset: number; halfArc: number }
  | { kind: 'stern-drop'; offset: number }
  | { kind: 'none' };

/** deg -> rad (CONFIG.mine.placeHalfArcDeg is authored in degrees). */
const deg = (d: number): number => (d * Math.PI) / 180;

/**
 * The ratified arc shape for a fitted equipment id, derived from CONFIG only
 * (gun/cannon/starShells declare `arc: 'full'`; the torpedo sector reads
 * CONFIG.torpedo.offset/halfArc; the mine's rear placement sector reads
 * CONFIG.mine.offset/placeHalfArcDeg — Story 2.8, amendment 45; the decoy's
 * stern drop still reads CONFIG.mine.offset). Compile-forced to cover every
 * EquipmentId; a new id cannot ship without declaring its arc here.
 */
export function arcFor(id: EquipmentId): ArcShape {
  switch (id) {
    case 'gun':
    case 'cannon':
    case 'starShells':
      return { kind: CONFIG[id].arc };
    case 'torpedo':
      return { kind: 'sector', offset: CONFIG.torpedo.offset, halfArc: CONFIG.torpedo.halfArc };
    case 'mine':
      return { kind: 'sector', offset: CONFIG.mine.offset, halfArc: deg(CONFIG.mine.placeHalfArcDeg) };
    case 'decoyBuoy':
      return { kind: 'stern-drop', offset: CONFIG.mine.offset };
    case 'speedBoost':
      return { kind: 'none' };
  }
}

/**
 * The narrowed `sector` descriptor for an id DECLARED a sector (the torpedo's
 * bow arc; the mine's rear placement arc). Throws on any other shape — a
 * CONFIG/arcs authoring error, failed loudly at module load rather than
 * mid-tick. Pure (a throw, never I/O).
 */
export function sectorArcFor(id: EquipmentId): Extract<ArcShape, { kind: 'sector' }> {
  const arc = arcFor(id);
  if (arc.kind !== 'sector') throw new Error(`'${id}' arc must be a sector (sim/arcs.ts)`);
  return arc;
}

/**
 * The narrowed `stern-drop` descriptor for an id DECLARED a stern drop (the
 * decoy rack — the mine left it for the aimed rear sector in Story 2.8).
 * Throws on any other shape — same authoring-error law.
 */
export function sternDropArcFor(id: EquipmentId): Extract<ArcShape, { kind: 'stern-drop' }> {
  const arc = arcFor(id);
  if (arc.kind !== 'stern-drop') throw new Error(`'${id}' arc must be a stern-drop (sim/arcs.ts)`);
  return arc;
}
