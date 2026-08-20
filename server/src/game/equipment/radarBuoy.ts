// THE RADAR BUOY (Story 7-5 wave 2, R2.7-R2.11) — replaces the decoy buoy
// OUTRIGHT. The decoy's deception is deleted end to end: nothing in the game
// fakes a SHIP CONTACT any more. What this file drops on the water is a real
// sensor — a stationary, destructible buoy carrying its OWN radar set whose
// returns are the buoy's OWN SCOPE, shown to its owner (Story 7-5 fix cycle,
// superseding R2.8's relay — Eric: "It gets its own returns. I just get to
// see them as the owner."; wire-tagged `src`, PV 44), painting on enemy radar
// with its OWN small profile and no owner identity (R2.9), with the GUN
// (R2.10) and JAMMING (R2.11) doctrines on top.
//
// This module owns the buoy's WORLD-STATE SHAPE (BuoyState), its placement
// row (the mine's click-placed rear-sector pattern, verbatim — R2.7), its
// collision silhouette (a small square HullTarget the World merges into the
// ballistic/blast target list so "destructible by anything that damages a
// ship" is literally the same code path a ship takes), and the JAMMING
// SCATTER — the deterministic per-(buoy, sweep-revolution) fake-return set.
// The perception-side rules (the buoy's own gate + scope, self-paint, fake
// emission and the carve-out they need) live in signals.ts beside the blip
// row; the per-tick
// driving (expiry, sweep advance, epoch refresh, gun fire) lives in
// World.tickBuoys.

import {
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  HULL_IDS,
  blockedWater,
  inArc,
  mulberry32,
  sectorArcFor,
  wrapAngle,
  wrapPositive,
  type HullId,
  type HullTarget,
  type Vec2,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';

/**
 * The buoy's physical size (u, full width of its square silhouette). An
 * implementer handwave inside R2.7's ratified shape (the plan specifies hp/
 * life/reload but no hull dimension — SOMETHING must give shells a surface to
 * hit): 12u is comfortably smaller than any hull and ~1.3 radar cells
 * (CONFIG.vision.radarCellU = 9), so its radar paint (a degenerate-segment
 * square at this width — see signals.buoyPaintBlip) reads as a compact dot,
 * visibly NOT a ship. Tunable; flagged in the wave-2 report.
 */
export const BUOY_SIZE_U = 12;

/** One JAMMING fake return: a fabricated radar subject at a scattered pose.
 *  SERVER-PRIVATE — never on the wire as such; what travels is an ordinary
 *  blip mask rasterized from this pose through the ONE shared shaper. */
export interface JamFake {
  x: number; // u
  y: number; // u
  heading: number; // rad
  /** The hull profile this fake paints as — drawn from ALL six HullIds so the
   *  clutter spans every footprint size a real return could have. */
  cls: HullId;
}

/**
 * One live radar buoy. Server-owned world state (the MineState/LitZone
 * precedent); synced to clients only as the contact-like BuoyView (owner
 * always, enemies at sight/owned-zone, spectators) plus its anonymous radar
 * paint. NOTHING here reaches the wire directly.
 */
export interface BuoyState {
  id: string;
  ownerId: string; // the placing captain — the scope's one recipient; enemies never learn it (R2.9)
  x: number; // u — fixed at drop; a buoy never moves
  y: number; // u
  until: number; // ms — server time it expires (drop + owner's effective durationMs)
  hp: number; // destructible by anything that damages a ship (R2.7); no XP, no feed line
  /** u — the buoy's OWN radar reach. FLAT by ruling (R2.7): stamped from the
   *  owner's stats at drop, which no card writes — never observer-scaled. */
  radarRange: number;
  /** rad — current (post-advance) sweep angle of the buoy's OWN radar. */
  sweepAngle: number;
  /** rad — sweep angle before this tick's advance (paint window start). The
   *  half-open [prev, cur) window, exactly a ship's. */
  prevSweepAngle: number;
  /** rad — TOTAL sweep turned since drop (unwrapped). floor(total / 2π) is the
   *  JAMMING EPOCH: the fake set re-scatters once per completed revolution
   *  ("re-scattered each sweep", R2.11). */
  sweepTotalRad: number;
  /** SERVER-PRIVATE per-buoy jam seed, minted off the World's decorrelated jam
   *  stream at drop (the zone-nonce posture: with a production pseudonymSeed
   *  it is never derivable from the client-known map seed). */
  jamSeed: number;
  /** The revolution index jamFakes was scattered for. */
  jamEpoch: number;
  /** The CURRENT epoch's fake set — a pure function of (jamSeed, jamEpoch,
   *  buoy circle), recomputed only on an epoch change. Emission is gated
   *  per-observer in signals.ts; owner exempt. */
  jamFakes: readonly JamFake[];
  /** ms — GUN BUOY cooldown remaining; 0 = ready. Held at 0 while no hostile
   *  is in reach, armed to the owner's effective gunReloadMs on each shot. */
  gunReloadMsLeft: number;
  /** World-space collision silhouette (frozen at drop — the buoy never
   *  moves), merged into the ballistic/blast HullTarget list by the World. */
  poly: readonly Vec2[];
}

/** The buoy's square world-space silhouette at its drop point. */
export function buoySilhouette(x: number, y: number): readonly Vec2[] {
  const h = BUOY_SIZE_U / 2;
  return [
    { x: x - h, y: y - h },
    { x: x + h, y: y - h },
    { x: x + h, y: y + h },
    { x: x - h, y: y + h },
  ];
}

/** The buoy as a ballistic/blast target (HullTarget) — id + frozen square. */
export function buoyTarget(b: BuoyState): HullTarget {
  return { id: b.id, poly: b.poly };
}

/**
 * THE JAMMING SCATTER (R2.11): the fake set for one (buoy, revolution), as a
 * PURE deterministic function of (jamSeed, epoch, circle) — never
 * Math.random(), so it is reproducible in tests, byte-stable across replays,
 * and (because jamSeed comes off a server-private stream) unpredictable to a
 * client.
 *
 * THE DRAW ORDER IS THE CONTRACT (the paintSeed/mulberry32 precedent — the
 * RNG sequence itself is what the perception oracle re-derives): per fake, in
 * this exact order, four rng.next() draws —
 *   1. u  → disc radius, r = R·√u (area-uniform in the buoy's circle);
 *   2. a  → bearing, θ = 2π·a;
 *   3. hd → heading, 2π·hd;
 *   4. c  → hull profile, HULL_IDS[floor(c · HULL_IDS.length)] — all SIX
 *           hulls, ships and drones, so the clutter spans every real
 *           footprint size and the small buoy dot has small company too.
 * The epoch enters as (jamSeed ^ imul(epoch + 1, 0x9e3779b9)) >>> 0 — the
 * zoneRingSeed mixing shape, so consecutive revolutions share nothing.
 *
 * Deliberately NO water-legality filter: a fake may land on an island or off
 * the rim. Rare (land is 2-3% of the disc), and rejecting would complicate
 * the contract for a tell a sharp player has honestly earned. Ledgered.
 */
export function scatterJamFakes(
  jamSeed: number,
  epoch: number,
  cx: number,
  cy: number,
  radius: number,
  count: number = CONFIG.radarBuoy.jamFakes,
): JamFake[] {
  const rng = mulberry32((jamSeed ^ Math.imul(epoch + 1, 0x9e3779b9)) >>> 0);
  const out: JamFake[] = [];
  for (let i = 0; i < count; i++) {
    const r = radius * Math.sqrt(rng.next());
    const theta = Math.PI * 2 * rng.next();
    const heading = wrapPositive(Math.PI * 2 * rng.next());
    const cls = HULL_IDS[Math.floor(rng.next() * HULL_IDS.length)];
    out.push({ x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r, heading, cls });
  }
  return out;
}

/**
 * Mint one live buoy into the store at an already-validated point. The sweep
 * anchors to the drop BEARING from the owner (deterministic, decorrelated
 * from other buoys — the addShip spawn-heading rule applied to the one
 * heading a buoy has), with prev === cur so the first tick's paint window is
 * zero-width, exactly a fresh ship's. Epoch-0 fakes are scattered EAGERLY so
 * a jamming buoy jams from its first revolution, not its second.
 *
 * No per-player cap is enforced: R2.7's life-shorter-than-reload ordering
 * (20s life on a 30s reload, pool 1) makes a second live buoy structurally
 * impossible in production, and the store is id-keyed so a directed test
 * placing two simply has two.
 */
export function addBuoy(
  buoys: Map<string, BuoyState>,
  owner: ShipRecord,
  x: number,
  y: number,
  droppedAt: number,
  id: string,
  jamSeed: number,
): BuoyState {
  const stats = owner.stats.radarBuoy;
  const sweepAnchor = wrapPositive(Math.atan2(y - owner.state.y, x - owner.state.x));
  const buoy: BuoyState = {
    id,
    ownerId: owner.id,
    x,
    y,
    until: droppedAt + stats.durationMs,
    hp: stats.hp,
    radarRange: stats.radarRange, // flat by ruling (R2.7) — no card writes it
    sweepAngle: sweepAnchor,
    prevSweepAngle: sweepAnchor,
    sweepTotalRad: 0,
    jamSeed,
    jamEpoch: 0,
    jamFakes: scatterJamFakes(jamSeed, 0, x, y, stats.radarRange),
    gunReloadMsLeft: 0,
    poly: buoySilhouette(x, y),
  };
  buoys.set(id, buoy);
  return buoy;
}

// The buoy's ratified placement sector: THE MINE'S rear sector, shared
// verbatim (R2.7 — sectorArcFor('radarBuoy') === sectorArcFor('mine'), pinned
// in shared arcs.test.ts). Resolved at module load; a non-sector arc is an
// authoring error failed loudly at boot (the mines.ts precedent).
const REAR_SECTOR = sectorArcFor('radarBuoy');

/** The clicked placement point — the mine's minePlacePoint rule verbatim:
 *  along the aim bearing at the clicked distance from the ship CENTER. */
function buoyPlacePoint(ship: ShipRecord): Vec2 {
  const dist = Math.max(0, ship.input.aimDist);
  return {
    x: ship.state.x + Math.cos(ship.input.aim) * dist,
    y: ship.state.y + Math.sin(ship.input.aim) * dist,
  };
}

/**
 * The radar-buoy Equipment row — a click-aimed WEAPON on the fireSeq channel
 * (R2.7; the decoy it replaces was an un-aimed actSeq ability). The mine
 * row's exact denial matrix: click outside the rear sector OR past the
 * shared placeRange → 'out-of-arc' (nothing consumed); clicked point ashore /
 * off the water → 'blocked' (nothing consumed); empty pool → 'no-ammo'
 * (wire 'cooling' on the weapon channel). placeRange is CONFIG.mine's — the
 * plan reuses the mine's whole placement envelope ("±60° at placeRange
 * 150u"), not a buoy-owned copy of the number.
 */
export const radarBuoyEquipment: Equipment = {
  id: 'radarBuoy',
  isWeapon: EQUIPMENT_IS_WEAPON.radarBuoy, // shared weapon/ability split — single source
  tick(ship, slot, dtMs): void {
    tickReload(slot.state!, ship.stats.radarBuoy.maxAmmo, ship.stats.radarBuoy.reloadMs, dtMs);
  },
  activate(ctx, slot) {
    const ship = ctx.ship;
    const center = wrapAngle(ship.state.heading + REAR_SECTOR.offset); // astern-centered
    if (!inArc(ship.input.aim, center, REAR_SECTOR.halfArc)) return { ok: false, reason: 'out-of-arc' };
    if (ship.input.aimDist > CONFIG.mine.placeRange) return { ok: false, reason: 'out-of-arc' };
    const p = buoyPlacePoint(ship);
    if (blockedWater(p, ctx.islands, ctx.mapRadius)) return { ok: false, reason: 'blocked' }; // nothing consumed
    if (!consume(slot.state!, ship.stats.radarBuoy.reloadMs)) return { ok: false, reason: 'no-ammo' }; // pool empty
    ctx.dropBuoy(p.x, p.y);
    return { ok: true };
  },
};
