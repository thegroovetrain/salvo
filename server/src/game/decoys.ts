// THE BUOY BODY's world state — the retired DECOY BUOY's (Story 8.16,
// catalog-v3 R36/R41, epic-8 amendments 119–124), shared since Story 10.9
// (Eric 2026-10-27/28, epic-10 amendments 2 and 4) by the four buoy lines:
// RADAR, HEALING, SHIELD and SPEED. The `decoy` target kind's occupant.
//
// THE NAME: the internal machinery name `decoy` (this state, the World's
// `decoys` map, the `decoy` signal row, `DecoyView`, the client renderer) is
// KEPT for the physical sponge body in Story 10.9 — a documented implementer
// reading: a 1,500-reference rename is not that story's work. The CATALOG ids
// are the four buoys (`radarBuoy` / `healingBuoy` / `shieldBuoy` /
// `speedBuoy`); the plain `decoyBuoy` line is gone.
//
// A buoy is a stationary 50 hp float (`CONFIG.buoy.hp`) dropped at any bearing
// out to `CONFIG.mine.placeRange` (ruling 9). It is world state, not a ship:
// it never enters `ships`, the roster, spawn clearance or any AI target set.
// It has no wake (amendment 123) and it does NOT sink with its owner
// (amendment 122): it leaves the water when enemy ordnance takes its hp to
// zero (World.damageDecoy) or — new with 10.9 — at `expiresAt`
// (`CONFIG.buoy.lifetimeMs` after the drop, World.expireBuoys). The owner's
// own ordnance never damages it (amendment 119): the shared
// sweep/acquire/burst math skips it by `Target.ownerId`, and damageDecoy
// refuses the owner again as defence in depth.
//
// A RADAR buoy also carries its OWN sweep window (`sweep`), seeded to the
// owner's heading at the drop and turned by World.advanceSweeps at the
// OWNER's `sweepPeriodMs` — the paint source signals.ts `buoyRadarBlips`
// reads. Every other kind carries `sweep: null`.
//
// Pure data + helpers: no World reference, no I/O.

import { CONFIG, type BuoyKind, type Target, type Vec2 } from '@salvo/shared';

/** A radar buoy's own beam — the `SweepWindow` shape (signals.ts) plus the
 *  revolution counter the dropout roll keys on, exactly the ShipRecord's
 *  three sweep fields. */
export interface BuoySweep {
  sweepAngle: number; // rad, wrapped [0, 2π) — the beam's bearing now
  prevSweepAngle: number; // rad — the bearing at the start of this tick
  sweepRev: number; // full revolutions completed (the dropout roll's `rev`)
  /** ms per revolution — the OWNER's `stats.sweepPeriodMs`, re-read every
   *  tick while the owner's record exists (World.advanceSweeps) and KEPT at
   *  its last value once it is gone (the beam still turns; its paints go to
   *  nobody). 0 = not yet stamped (a beam that does not turn). */
  periodMs: number;
}

/** One live buoy. Server-owned; reaches clients only as the contact-like
 *  `DecoyView` (signals.ts `decoy` pseudo-row), its anonymous radar paint and
 *  — radar kind, owner only — the paints its own sweep makes. */
export interface DecoyState {
  id: string; // `d${seq}`
  ownerId: string; // the dropping captain — the ONE ship whose ordnance passes it
  x: number; // u — fixed at drop; a buoy never moves
  y: number; // u
  hp: number; // hp left (CONFIG.buoy.hp at drop)
  /** World-space collision silhouette, frozen at drop — emitted as the
   *  `decoy` kind by the World's collector. */
  poly: readonly Vec2[];
  /** What the buoy DOES (Story 10.9) — stamped from the dropping line. */
  kind: BuoyKind;
  /** Server time (ms) the buoy leaves the water (drop + lifetimeMs). */
  expiresAt: number;
  /** The radar kind's own beam; null for every other kind. */
  sweep: BuoySweep | null;
}

/** The buoy's square world-space silhouette at its drop point — side
 *  `CONFIG.buoy.sizeU` (the deleted radar buoy's 12 u square, now CONFIG). */
export function decoyPoly(x: number, y: number): readonly Vec2[] {
  const h = CONFIG.buoy.sizeU / 2;
  return [
    { x: x - h, y: y - h },
    { x: x + h, y: y - h },
    { x: x + h, y: y + h },
    { x: x - h, y: y + h },
  ];
}

/** The buoy as an ordnance target. `ownerId` is what lets the shared
 *  sweep/acquire/burst math skip the OWNER's own buoy (amendment 119) —
 *  omitting it would let an owner's fish detonate on their own float. */
export function decoyTarget(d: DecoyState): Target {
  return { id: d.id, kind: 'decoy', poly: d.poly, ownerId: d.ownerId };
}

/** Mint one buoy into the store at an already-validated point. A radar buoy's
 *  beam starts at `headingSeed` (the owner's heading at the drop, wrapped to
 *  [0, 2π) by the caller — never a random: the sim stays deterministic); its
 *  period is stamped by the World (spawnDecoy / advanceSweeps). */
export function addDecoy(
  decoys: Map<string, DecoyState>,
  ownerId: string,
  x: number,
  y: number,
  id: string,
  kind: BuoyKind,
  expiresAt: number,
  headingSeed: number,
): DecoyState {
  const sweep: BuoySweep | null =
    kind === 'radar' ? { sweepAngle: headingSeed, prevSweepAngle: headingSeed, sweepRev: 0, periodMs: 0 } : null;
  const decoy: DecoyState = { id, ownerId, x, y, hp: CONFIG.buoy.hp, poly: decoyPoly(x, y), kind, expiresAt, sweep };
  decoys.set(id, decoy);
  return decoy;
}
