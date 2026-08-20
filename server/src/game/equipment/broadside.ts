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
//   2. ONE CLICK FIRES `turrets` SHELLS, EACH FROM ITS OWN TURRET AND EACH AS
//      CLOSE TO THE CLICK AS ITS OWN ARC ALLOWS (Eric ruling 2026-08-20,
//      replacing the designed fan of R2.3). Every turret has its own muzzle —
//      evenly-spaced along the hull's midship section on the engaged beam
//      (Eric's correction 2026-08-19; extra turrets RE-SPACE the fixed span
//      into 4 then 5 points) — AND its own firing arc: a mount bearing
//      straddled across the beam sector, ± the boon-scaled traverse. A turret
//      whose arc contains the click fires EXACTLY at it; one that cannot bear
//      fires at its arc LIMIT at the click's range, so the pattern stays an
//      arc at constant radius and the salvo's spread EMERGES from geometry
//      instead of being designed. None of it is re-derived here: shared
//      sim/aim.ts `turretAimPoints` (muzzles + mounts + the parallax-true
//      bearing clamp + the water-disk clamp) owns it, so the server and the
//      client's aim preview cannot disagree about where the shells go, and a
//      limit shot that would swing off the water disk is pulled back rather
//      than expiring unfired.
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
  turretAimPoints,
  twinSectorArcFor,
  twinSectorSide,
  type EquipmentState,
  type ShellState,
  type TurretAim,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationDenial, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';
import { makeBallistic } from './ballistics.js';
import { burstPointAlong } from './guns.js';

/** The two beam sectors, resolved ONCE at module load — an authoring error in
 *  CONFIG/arcs fails at boot (twinSectorArcFor throws), never mid-tick. */
const BEAMS = twinSectorArcFor('broadside');

/**
 * The barrage's full aim solution: the CLICKED burst point (aim bearing,
 * clicked distance, clamped to the broadside's effective range AND to the
 * water disk — the gun's own `burstPointAlong`) resolved per turret by shared
 * `turretAimPoints` (sim/aim.ts): muzzle `i`, arc `i`, and the target that
 * turret can actually reach — the click exactly when its arc bears, its arc
 * limit at the click's range when it cannot. The ShipRecord-shaped wrapper;
 * `side` is `twinSectorSide`'s answer, never re-derived here. Exported for
 * tests: the returned array IS the barrage's geometry, directly assertable
 * without spawning shells, and it is the same call the client's aim preview
 * makes (one answer, never two).
 */
export function broadsideAim(ship: ShipRecord, side: 1 | -1, mapRadius: number): TurretAim[] {
  const bs = ship.stats.broadside;
  const click = burstPointAlong(ship, mapRadius, bs.rangeU, ship.input.aim);
  return turretAimPoints(ship.state, ship.hullId, bs.turrets, side, click, bs.traverseRad, mapRadius);
}

/**
 * Broadside fire control against one slot pool: the ARC IS TESTED FIRST (an
 * arc miss consumes nothing), then one consumed round launches `turrets`
 * shells, each a REAL gun-pattern shell flying to the point ITS OWN turret arc
 * can reach and bursting there in `burstRadius`. Damage/blast/turret
 * count/traverse all come from the OWNER'S effective stats (the BROADSIDE
 * TURRETS and BROADSIDE SPREAD ladders), never raw CONFIG. distLeft slack
 * mirrors fireGunShells (guards float drift, never extends reach).
 *
 * EACH SHELL LEAVES ITS OWN TURRET (Eric's correction 2026-08-19). Shell `i`
 * spawns at muzzle `i` and its bearing is MUZZLE→target, not centre→target —
 * which is what actually puts the round on its point from an off-centre gun.
 * Every shell whose turret BEARS lands EXACTLY on the click: its target IS the
 * click (turretAimPoints returns it byte-identical) and stepShell stops it
 * there; a turret that cannot bear flies to its arc limit instead.
 *
 * `muzzleOrTarget` is GONE from this path and its absence is deliberate: it
 * existed to stop a point-blank click spawning the shell PAST its own target
 * on a bearing taken from the ship CENTRE, and that failure mode cannot occur
 * once the bearing is taken from the muzzle itself (the shell always faces its
 * target, however close). Owner immunity is permanent, so a bow-most turret
 * whose line grazes the ship's own silhouette can never self-hit.
 */
function fireBroadside(
  ship: ShipRecord,
  pool: EquipmentState,
  now: number,
  mapRadius: number,
  mkId: () => string,
): { shells: ShellState[]; denial: ActivationDenial | null } {
  const side = twinSectorSide(ship.state.heading, ship.input.aim, BEAMS);
  if (side === null) {
    return { shells: [], denial: 'out-of-arc' }; // bow/stern dead zone — pool untouched
  }
  if (!consume(pool, ship.stats.broadside.reloadMs)) return { shells: [], denial: 'no-ammo' };
  const bs = ship.stats.broadside;
  const shells: ShellState[] = [];
  broadsideAim(ship, side, mapRadius).forEach(({ muzzle: origin, target }) => {
    const dir = Math.atan2(target.y - origin.y, target.x - origin.x);
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
  });
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
