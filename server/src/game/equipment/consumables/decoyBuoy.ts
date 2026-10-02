// DECOY BUOY (Story 8.16, catalog-v3 R36/R41, epic-8 amendments 119–124) — a
// click-placed consumable: the digit PRIMES the belt slot and a CLICK in the
// MINE's rear sector (`CONFIG.mine.offset` ± `placeHalfArcDeg`, out to
// `CONFIG.mine.placeRange` — shared `consumableArc('decoyBuoy')`) drops one
// 50 hp decoy at the clicked point.
//
// The mine rack's exact denial matrix (`mineLine.activate`): outside the sector
// or past placeRange → 'out-of-arc'; the point ashore or off the water disk →
// 'blocked'. NOTHING is spent on any denial — the ONE SPEND LAW (row.ts) takes
// the copy only when this effect answers `ok`.

import { CONFIG, blockedWater, inArc, sectorArcFor, wrapAngle, type LoadoutSlot } from '@salvo/shared';
import type { ActivationContext, ActivationResult } from '../index.js';
import { minePlacePoint } from '../mines.js';
import { consumableRow, type ConsumableRow } from './row.js';

// The mine's rear sector, read from the shared single source (arcs.ts). A
// non-sector arc is an authoring error failed loudly at module load.
const REAR_SECTOR = sectorArcFor('decoyBuoy');

function decoyBuoyEffect(ctx: ActivationContext, _slot: LoadoutSlot): ActivationResult {
  const ship = ctx.ship;
  const center = wrapAngle(ship.state.heading + REAR_SECTOR.offset); // astern-centered
  if (!inArc(ship.input.aim, center, REAR_SECTOR.halfArc)) return { ok: false, reason: 'out-of-arc' };
  if (ship.input.aimDist > CONFIG.mine.placeRange) return { ok: false, reason: 'out-of-arc' };
  const p = minePlacePoint(ship); // the clicked point, the mine's rule verbatim
  if (blockedWater(p, ctx.islands, ctx.mapRadius)) return { ok: false, reason: 'blocked' };
  ctx.dropDecoy(p.x, p.y);
  return { ok: true };
}

export const decoyBuoyRow: ConsumableRow = consumableRow('decoyBuoy', decoyBuoyEffect);
