// BROADSIDE BARRAGE fire control — the broadside Equipment row (Story 7-5
// wave 2, R2.1–R2.5). REPLACES the long-range cannon outright: same slot on
// the Battleship, nothing of the cannon's moded fire (PLUNGING FIRE's arcing
// overflight, ARMOR-PIERCING's direction shot) survives.
//
// The flow is the gun's, with two differences and nothing else:
//
//   1. THE ARC IS A TWIN SECTOR (R2.1/R2.2). The click bearing must fall inside
//      ONE of the two mirrored beam sectors (`heading ± offset`, each `halfArc`
//      wide — sim/arcs.ts twinSectorArcFor, values from CONFIG.broadside). Only
//      the containing side's turrets fire; a click in NEITHER sector — the bow
//      and stern dead zones — is an 'out-of-arc' denial through the ordinary
//      denial path (FR12: never silent). The pool is NOT consumed by an arc
//      miss, exactly as the torpedo's bow arc behaves.
//
//   2. ONE CLICK FIRES `turrets` SHELLS ON AN ARC (R2.3). Every shell ends its
//      run at the CLICK'S OWN RANGE — the pattern is an arc at constant radius
//      from the ship, spread ANGULARLY about the click bearing, NOT a cone.
//      The geometry is NOT re-derived here: shared sim/spread.ts `fanTargets`
//      owns the straddle law, so an ODD turret count puts one shell exactly on
//      the click bearing and an EVEN count straddles it with none on it, and
//      the server and the client's aim preview cannot disagree about where the
//      shells go.
//
// SIGNALS ARE PER SHELL (R2.5, Eric A2): each shell is an ordinary gun-family
// `shell` and emits its OWN mz / sp / hc through the unchanged World paths.
// There is no salvo aggregation anywhere — a 5-turret barrage legitimately
// produces 5 muzzle flashes and up to 5 Hit Calls, and epic-4 amendment 17's
// "exactly one `hc` per shell resolution" keeps holding per SHELL.
//
// Range is `stats.broadside.rangeU` — THE 5/8 RUNG, derived post-fold in
// effectiveStats() (`radarRange × CONFIG.vision.muzzleFlashFactor`) and read
// here, never re-derived. Pure over a ShipRecord's input + pose + slot pool;
// the World owns shell storage + event emission.

import {
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  fanTargets,
  inArc,
  twinSectorArcFor,
  wrapAngle,
  type EquipmentState,
  type ShellState,
  type Vec2,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationDenial, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';
import { makeBallistic } from './ballistics.js';
import { burstPointAlong, muzzleOrTarget } from './guns.js';

/** The two beam sectors, resolved ONCE at module load — an authoring error in
 *  CONFIG/arcs fails at boot (twinSectorArcFor throws), never mid-tick. */
const BEAMS = twinSectorArcFor('broadside');

/**
 * Which beam contains the click, as its sector CENTER bearing — or null when
 * the click sits in the bow/stern dead zone (R2.2: the side whose sector holds
 * the bearing is the side that fires; there is no "both sides at once", and
 * `offset` is 90° with a 60° half-arc, so the two sectors cannot overlap).
 */
function firingBeam(heading: number, aim: number): number | null {
  for (const sign of [1, -1]) {
    const center = wrapAngle(heading + sign * BEAMS.offset);
    if (inArc(aim, center, BEAMS.halfArc)) return center;
  }
  return null;
}

/**
 * The barrage's per-shell target points: the CLICKED burst point (aim bearing,
 * clicked distance, clamped to the broadside's effective range AND to the water
 * disk — the gun's own `burstPointAlong`) fanned into `turrets` points at that
 * SAME range by shared `fanTargets`. Exported for tests: the fan is the feature,
 * so its geometry is directly assertable without spawning shells.
 */
export function broadsideTargets(ship: ShipRecord, mapRadius: number): Vec2[] {
  const bs = ship.stats.broadside;
  const click = burstPointAlong(ship, mapRadius, bs.rangeU, ship.input.aim);
  return fanTargets(ship.state, click, bs.turrets, bs.fanHalfAngleRad);
}

/**
 * Broadside fire control against one slot pool: the ARC IS TESTED FIRST (an
 * arc miss consumes nothing), then one consumed round launches `turrets`
 * shells, each a REAL gun-pattern shell flying to its own point on the fan arc
 * and bursting there in `burstRadius`. Damage/blast/turret count/fan angle all
 * come from the OWNER'S effective stats (the BROADSIDE TURRETS and BROADSIDE
 * SPREAD ladders), never raw CONFIG. distLeft slack mirrors fireGunShells
 * (guards float drift, never extends reach).
 */
function fireBroadside(
  ship: ShipRecord,
  pool: EquipmentState,
  now: number,
  mapRadius: number,
  mkId: () => string,
): { shells: ShellState[]; denial: ActivationDenial | null } {
  if (firingBeam(ship.state.heading, ship.input.aim) === null) {
    return { shells: [], denial: 'out-of-arc' }; // bow/stern dead zone — pool untouched
  }
  if (!consume(pool, ship.stats.broadside.reloadMs)) return { shells: [], denial: 'no-ammo' };
  const bs = ship.stats.broadside;
  const shells: ShellState[] = [];
  for (const target of broadsideTargets(ship, mapRadius)) {
    const dir = Math.atan2(target.y - ship.state.y, target.x - ship.state.x);
    const origin = muzzleOrTarget(ship, dir, target, CONFIG.broadside.shellRadius);
    shells.push(
      makeBallistic(mkId(), ship, dir, now, {
        speed: CONFIG.broadside.shellSpeed,
        range: Math.hypot(target.x - origin.x, target.y - origin.y) + CONFIG.broadside.shellRadius,
        damage: bs.damage,
        hitRadius: CONFIG.broadside.shellRadius,
        kind: 'shell', // the gun-family wire kind — per-shell mz/sp/hc ride it unchanged
        origin,
        targetX: target.x,
        targetY: target.y,
        burstRadius: bs.burstRadius,
        // The broadside has no separate interceptor number: a shell stopped
        // early deals what it would have dealt at its burst (R2.4 names ONE
        // damage figure), so contactDamage is the same 20.
        contactDamage: bs.damage,
      }),
    );
  }
  return { shells, denial: null };
}

/** The broadside Equipment row. Pool size + reload come from the ship's cached
 *  effective stats (maxAmmo 1 — one barrage, presented as a pure 30s cooldown).
 *  Slot state is non-null by the loadout invariant (see index.ts). */
export const broadsideEquipment: Equipment = {
  id: 'broadside',
  isWeapon: EQUIPMENT_IS_WEAPON.broadside, // shared weapon/ability split — single source
  tick(ship, slot, dtMs): void {
    tickReload(slot.state!, ship.stats.broadside.maxAmmo, ship.stats.broadside.reloadMs, dtMs);
  },
  activate(ctx, slot) {
    // bornAt = the VALIDATED fire time (D1): a back-dated shell is then
    // pre-stepped by the World to where it belongs this tick.
    const { shells, denial } = fireBroadside(ctx.ship, slot.state!, ctx.fireT, ctx.mapRadius, ctx.mkId);
    // PER-SHELL SIGNALS (R2.5): every shell of the barrage emits its own mz —
    // sp and hc are already per shell by construction (each resolves alone).
    for (const shell of shells) ctx.spawnBallistic(shell, { perShellFlash: true });
    return denial === null ? { ok: true } : { ok: false, reason: denial };
  },
};
