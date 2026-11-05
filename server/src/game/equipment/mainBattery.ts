// THE MAIN BATTERY (Story 10.4, Eric rulings 2026-11-04, epic-10 amendment 9
// R2/R4) — slot 0 on every captain hull, in the deck gun's place. The hull's
// turrets ARE the weapon: each one traverses at CONFIG.mainBattery's rate,
// inside its own train limits, and reloads on its own clock. Their state lives
// on the ShipRecord (`ship.turrets`); the angles are stepped by the World's
// `stepTurrets` STEP_ORDER row through the SHARED stepper (sim/turrets.ts) —
// the very calls the client predicts with — so nothing here re-derives a
// turret's geometry.
//
// A CLICK (R4, "The turret fires wherever it is currently pointing, even if it
// is the wrong direction. However if *any* turret is ready and pointed that
// way, it should fire instead."): the shared `pickTurret` chooses the turret —
// a ready one ON the aim point first (lowest index), else the ready one with
// the smallest angular error, firing along its CURRENT bearing — and
// `turretSalvo` lays its shells on parallel tracks. The reach is the row's
// folded `rangeU`, lifted by the firer's OWN live lit zones exactly as the
// cannon's was (shared `gunReachU`, measured from the chosen turret's
// station). Only the fired turret's reload starts (`fireTurret`). No turret
// ready → 'no-ammo', which the World's wire mapping sends as `cooling`.
//
// THE SHELL IS TODAY'S CANNON SHELL (reading of record): family `'cannon'`,
// a burst of `burstRadius`, the contact damage, the attenuation reference
// (the row's `rangeU`, none into own light — `attenRangeFor`), the mask
// `CONFIG.mainBattery.hits` (hull + decoy, NO mine bit: a main shell never
// hurts a mine — R3; the World's mask-driven `landOnMines` honours that
// without a special case). One `mz` per salvo (the cannon's dedupe).
//
// THE HOTBAR PAIR. Slot 0's `{n, reloadMsLeft}` is DERIVED — `batterySummary`
// over the turrets (n = turrets ready, reloadMsLeft = the soonest running
// reload) — written by `tick` every tick and again after a salvo. The generic
// per-round reload (`tickReload`) never runs on it: the turrets are the truth.

import {
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  batteryAimPoint,
  batterySummary,
  fireTurret,
  gunReachU as sharedGunReachU,
  pickTurret,
  turretSalvo,
  type LoadoutSlot,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationContext, ActivationResult, Equipment } from './index.js';
import { attenRangeFor } from './guns.js';
import { makeBallistic } from './ballistics.js';

/** Write slot 0's derived hotbar pair from the turrets (see the header). */
export function syncBatterySlot(ship: ShipRecord, slot: LoadoutSlot): void {
  if (slot.state === null) return;
  const sum = batterySummary(ship.turrets);
  slot.state.n = sum.n;
  slot.state.reloadMsLeft = sum.reloadMsLeft;
}

/** Fire ONE turret's salvo for the click under `ctx.ship.input` (the World
 *  installs the click's own input), or refuse when no turret is ready. */
function fireSalvo(ctx: ActivationContext): ActivationResult {
  const ship = ctx.ship;
  const pose = ship.state;
  // NO AIM (gate S2): a click whose aimDist is not positive names no point.
  // A real client always sends a positive aimDist when it clicks, so this is
  // refused exactly as nothing-ready is, consuming nothing.
  const aimPt = batteryAimPoint(pose, ship.input.aim, ship.input.aimDist);
  if (aimPt === null) return { ok: false, reason: 'no-ammo' };
  const pick = pickTurret(ship.turrets, ship.hullId, pose, aimPt);
  if (pick === null) return { ok: false, reason: 'no-ammo' }; // every turret reloading → `cooling` on the wire
  const row = ship.stats.equipment.mainBattery;
  const reachU = sharedGunReachU(pick.station, pick.bearing, pick.aimDistU, row.rangeU, ctx.mapRadius, ctx.ownLitZones());
  const salvo = turretSalvo(pick, ship.hullId, pose, reachU, ctx.mapRadius);
  const attenRangeU = attenRangeFor(ctx, row.rangeU, salvo.center); // amendment 187: one decision per salvo
  const cfg = CONFIG.mainBattery;
  for (const sh of salvo.shells) {
    const range = Math.hypot(sh.target.x - sh.origin.x, sh.target.y - sh.origin.y) + cfg.shellRadius;
    ctx.spawnBallistic(
      makeBallistic(ctx.mkId(), ship, salvo.bearing, ctx.fireT, {
        speed: cfg.shellSpeed,
        range,
        damage: row.damage,
        hitRadius: cfg.shellRadius,
        kind: 'shell',
        origin: sh.origin,
        targetX: sh.target.x,
        targetY: sh.target.y,
        burstRadius: row.burstRadius,
        contactDamage: row.contactDamage,
        hits: cfg.hits, // AR44 mask — hull + decoy, NO mine bit (R3)
        family: 'cannon', // the reveal's `w`: today's cannon shell
        attenRangeU,
      }),
    );
  }
  fireTurret(ship.turrets, pick.index, row.reloadMs); // the FOLDED reload, applied at fire time
  return { ok: true };
}

/** The main battery Equipment row. Slot state is non-null by the loadout
 *  invariant (see index.ts). */
export const mainBatteryEquipment: Equipment = {
  id: 'mainBattery',
  isWeapon: EQUIPMENT_IS_WEAPON.mainBattery, // shared weapon/ability split — single source
  tick(ship, slot): void {
    // The turrets were stepped (reloads counted down) by the `stepTurrets`
    // row; here the hotbar pair is re-derived from them.
    syncBatterySlot(ship, slot);
  },
  activate(ctx, slot) {
    const result = fireSalvo(ctx);
    syncBatterySlot(ctx.ship, slot);
    return result;
  },
};
