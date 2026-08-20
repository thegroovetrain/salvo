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
//      The geometry is NOT re-derived here: shared sim/aim.ts `fanBurstPoints`
//      (spread.ts's straddle law + the water-disk clamp) owns it, so an ODD
//      turret count puts one shell exactly on the click bearing, an EVEN count
//      straddles it with none on it, a fan extreme that would swing off the
//      water disk is pulled back rather than expiring unfired, and the server
//      and the client's aim preview cannot disagree about where the shells go.
//
//      AND EACH SHELL FIRES FROM ITS OWN TURRET (Eric's correction
//      2026-08-19): `turrets` separate, evenly-spaced muzzle points along the
//      hull's midship section on the engaged beam, from shared sim/aim.ts
//      `turretMuzzles`. Extra turrets RE-SPACE that fixed span into 4 then 5
//      points — the same ship with more guns, not a longer line of guns. The
//      client's aim preview calls the same function, so the muzzle flashes it
//      draws are the muzzles the server fires from.
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
  fanBurstPoints,
  turretMuzzles,
  twinSectorArcFor,
  twinSectorSide,
  type EquipmentState,
  type ShellState,
  type Vec2,
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
 * The barrage's per-shell target points: the CLICKED burst point (aim bearing,
 * clicked distance, clamped to the broadside's effective range AND to the water
 * disk — the gun's own `burstPointAlong`) fanned into `turrets` points at that
 * SAME range by shared `fanBurstPoints`. Exported for tests: the fan is the
 * feature, so its geometry is directly assertable without spawning shells.
 *
 * `fanBurstPoints` — not the raw `fanTargets` — because a fan EXTREME can swing
 * out of the water disk on a shot whose click stayed inside it, and a target
 * outside the disk expires with no burst and no damage. The shared helper pulls
 * every point back exactly as the click was pulled back, so the client's aim
 * preview and this fire path read ONE answer (wave-2 review gate).
 */
export function broadsideTargets(ship: ShipRecord, mapRadius: number): Vec2[] {
  const bs = ship.stats.broadside;
  const click = burstPointAlong(ship, mapRadius, bs.rangeU, ship.input.aim);
  return fanBurstPoints(ship.state, click, bs.turrets, bs.fanHalfAngleRad, mapRadius);
}

/**
 * The barrage's per-shell MUZZLE POINTS — `turrets` separate, evenly-spaced
 * guns along the hull on the FIRING beam (Eric's correction 2026-08-19). The
 * ShipRecord-shaped wrapper around shared `turretMuzzles` (sim/aim.ts, where
 * the span/straddle/pairing rules live); `side` is `twinSectorSide`'s answer,
 * never re-derived here. Exported for tests beside `broadsideTargets`: muzzle
 * `i` fires at target `i`, so the two arrays ARE the barrage's geometry.
 */
export function broadsideMuzzles(ship: ShipRecord, side: 1 | -1): Vec2[] {
  return turretMuzzles(ship.state, ship.hullId, ship.stats.broadside.turrets, side);
}

/**
 * Broadside fire control against one slot pool: the ARC IS TESTED FIRST (an
 * arc miss consumes nothing), then one consumed round launches `turrets`
 * shells, each a REAL gun-pattern shell flying to its own point on the fan arc
 * and bursting there in `burstRadius`. Damage/blast/turret count/fan angle all
 * come from the OWNER'S effective stats (the BROADSIDE TURRETS and BROADSIDE
 * SPREAD ladders), never raw CONFIG. distLeft slack mirrors fireGunShells
 * (guards float drift, never extends reach).
 *
 * EACH SHELL LEAVES ITS OWN TURRET (Eric's correction 2026-08-19). Shell `i`
 * spawns at muzzle `i` and its bearing is MUZZLE→target, not centre→target —
 * which is what actually puts the round on its point from an off-centre gun.
 * The clicked shell of an odd barrage still lands EXACTLY on the click: its
 * target is the click (fan offset 0) and stepShell stops it there; only the
 * line it flies in on moved, from the shared muzzle to the middle turret.
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
  const muzzles = broadsideMuzzles(ship, side);
  const shells: ShellState[] = [];
  broadsideTargets(ship, mapRadius).forEach((target, i) => {
    const origin = muzzles[i];
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
