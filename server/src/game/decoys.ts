// THE DECOY BUOY's world state (Story 8.16, catalog-v3 R36/R41, epic-8
// amendments 119–124) — the `decoy` target kind's occupant since the RADAR
// BUOY was deleted end to end.
//
// A decoy is a stationary 50 hp float dropped in the mine's rear sector. It is
// world state, not a ship: it never enters `ships`, the roster, spawn
// clearance or any AI target set. It has NO tick — no lifetime, no sweep, no
// wake (amendment 123) — and it does NOT sink with its owner (amendment 122):
// it leaves the water only when enemy ordnance takes its hp to zero
// (World.damageDecoy). The owner's own ordnance never damages it (amendment
// 119): the shared sweep/acquire/burst math skips it by `Target.ownerId`, and
// damageDecoy refuses the owner again as defence in depth.
//
// Pure data + helpers: no World reference, no I/O.

import { CONFIG, type Target, type Vec2 } from '@salvo/shared';

/** One live decoy. Server-owned; reaches clients only as the contact-like
 *  `DecoyView` (signals.ts `decoy` pseudo-row) and its anonymous radar paint. */
export interface DecoyState {
  id: string; // `d${seq}`
  ownerId: string; // the dropping captain — the ONE ship whose ordnance passes it
  x: number; // u — fixed at drop; a decoy never moves
  y: number; // u
  hp: number; // hp left (CONFIG.decoyBuoy.hp at drop)
  /** World-space collision silhouette, frozen at drop — emitted as the
   *  `decoy` kind by the World's collector. */
  poly: readonly Vec2[];
}

/** The decoy's square world-space silhouette at its drop point — side
 *  `CONFIG.decoyBuoy.sizeU` (the deleted buoy's 12 u square, now CONFIG). */
export function decoyPoly(x: number, y: number): readonly Vec2[] {
  const h = CONFIG.decoyBuoy.sizeU / 2;
  return [
    { x: x - h, y: y - h },
    { x: x + h, y: y - h },
    { x: x + h, y: y + h },
    { x: x - h, y: y + h },
  ];
}

/** The decoy as an ordnance target. `ownerId` is what lets the shared
 *  sweep/acquire/burst math skip the OWNER's own decoy (amendment 119) —
 *  omitting it would let an owner's fish detonate on their own float. */
export function decoyTarget(d: DecoyState): Target {
  return { id: d.id, kind: 'decoy', poly: d.poly, ownerId: d.ownerId };
}

/** Mint one decoy into the store at an already-validated point. */
export function addDecoy(
  decoys: Map<string, DecoyState>,
  ownerId: string,
  x: number,
  y: number,
  id: string,
): DecoyState {
  const decoy: DecoyState = { id, ownerId, x, y, hp: CONFIG.decoyBuoy.hp, poly: decoyPoly(x, y) };
  decoys.set(id, decoy);
  return decoy;
}
