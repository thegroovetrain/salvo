// THE MAIN BATTERY (Story 10.4, Eric rulings 2026-11-04, epic-10 amendment 9
// R2/R4) — slot 0 on every captain hull, in the deck gun's place. The hull's
// turrets ARE the weapon: each one reloads on its own clock, and its angle is
// DERIVED from the aim (no traverse — Eric 2026-11-12, Story 11.1, R16).
// Their state lives on the ShipRecord (`ship.turrets`); it is stepped by the
// World's `stepTurrets` STEP_ORDER row through the SHARED stepper
// (sim/turrets.ts) — the very calls the client predicts with — so nothing
// here re-derives a turret's geometry.
//
// A CLICK (arc-only fire, Eric 2026-11-05, epic-10 amendment 10; bow first,
// R16): the shared `pickTurret` chooses the LOWEST-INDEX READY turret whose
// arc holds the aim point, and `turretSalvo` lays its barrels' muzzles and
// the ONE salvo center they all aim at (CONVERGE, R13). The reach is the
// row's folded `rangeU`, lifted by the firer's OWN live lit zones exactly as
// the cannon's was (shared `gunReachU`, measured from the chosen turret's
// station). Only the fired turret's reload starts (`fireTurret`). No ready
// turret bears → 'no-ammo', which the World's wire mapping sends as `cooling`;
// nothing fires and no reload starts.
//
// REAL DISPERSION (Story 11.1, R5 / R8): EVERY shell rolls its own landing —
// `dispersedLanding` from ITS muzzle around the salvo center, seeded per shell
// from the room-private dispersion stream (`ctx.mintShell()`), kept inside the
// water disk; it may land past the gun's reach. Each shell then flies STRAIGHT
// from its muzzle to its landing (bearing and travel recomputed per shell —
// never a sideways snap on arrival). The landing is server-private until the
// shell gets there.
//
// THE SHELL IS TODAY'S CANNON SHELL (reading of record): family `'cannon'`,
// a burst of `burstRadius`, the contact damage, the mask
// `CONFIG.mainBattery.hits` (hull only, NO mine bit: a main shell never
// hurts a mine — R3; the World's mask-driven `landOnMines` honours that
// without a special case). Damage is flat with range (range attenuation
// retired 2026-11-12, Story 11.1). One `mz` per salvo (the cannon's dedupe).
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
import { dispersedFlight, makeBallistic } from './ballistics.js';

/** Write slot 0's derived hotbar pair from the turrets (see the header). */
export function syncBatterySlot(ship: ShipRecord, slot: LoadoutSlot): void {
  if (slot.state === null) return;
  const sum = batterySummary(ship.turrets);
  slot.state.n = sum.n;
  slot.state.reloadMsLeft = sum.reloadMsLeft;
}

/** Fire ONE turret's salvo for the click under `ctx.ship.input` (the World
 *  installs the click's own input), or refuse when no ready turret bears. */
function fireSalvo(ctx: ActivationContext): ActivationResult {
  const ship = ctx.ship;
  const pose = ship.state;
  // NO AIM (gate S2): a click whose aimDist is not positive names no point.
  // A real client always sends a positive aimDist when it clicks, so this is
  // refused exactly as nothing-ready is, consuming nothing.
  const aimPt = batteryAimPoint(pose, ship.input.aim, ship.input.aimDist);
  if (aimPt === null) return { ok: false, reason: 'no-ammo' };
  const pick = pickTurret(ship.turrets, ship.hullId, pose, aimPt);
  if (pick === null) return { ok: false, reason: 'no-ammo' }; // no ready turret bears → `cooling` on the wire
  const row = ship.stats.equipment.mainBattery;
  const reachU = sharedGunReachU(pick.station, pick.bearing, pick.aimDistU, row.rangeU, ctx.mapRadius, ctx.ownLitZones());
  const salvo = turretSalvo(pick, ship.hullId, pose, reachU, ctx.mapRadius);
  const cfg = CONFIG.mainBattery;
  for (const sh of salvo.shells) {
    const { id, seed } = ctx.mintShell();
    const f = dispersedFlight(sh.origin, sh.target, seed, ctx.mapRadius, salvo.bearing);
    ctx.spawnBallistic(
      makeBallistic(id, ship, f.dir, ctx.fireT, {
        speed: cfg.shellSpeed,
        range: f.distU + cfg.shellRadius,
        damage: row.damage,
        hitRadius: cfg.shellRadius,
        kind: 'shell',
        origin: sh.origin,
        targetX: f.landing.x,
        targetY: f.landing.y,
        burstRadius: row.burstRadius,
        contactDamage: row.contactDamage,
        hits: cfg.hits, // AR44 mask — hull only, NO mine bit (R3; the decoy bit left with Story 10.5)
        family: 'cannon', // the reveal's `w`: today's cannon shell
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
