// THE MACHINE GUN (Story 8.15, Eric rulings 2026-09-28, epic-8 amendments 103,
// 104 and 106) — a pickable deck gun mounted in slot 0 from the seat's `gun`,
// and the game's first LEVEL weapon: it fires off `InputMsg.held`, never off a
// click. While the button is down it streams one DIRECT shell every `rateMs`
// at `now` — no fire-time claim, no back-date, no pre-step — draining a
// `maxAmmo`-shell MAGAZINE; a click edge (`fireSeq`) on a mounted machine gun
// does NOTHING (World.consumeClick skips a row that declares `stream`).
//
// THE MAGAZINE MODEL (amendment 103, verbatim reading of record): the pool IS
// the magazine (`slot.state.n` = shells left) and `reloadMsLeft` is the running
// magazine SWAP — always the full `reloadMs`, whatever was left. The swap starts
// the moment the magazine is EMPTY, or once `idleReloadMs` have passed without
// a shot while shells remain; a shot during a partial-magazine swap CANCELS it
// (the shells left fire; the idle clock restarts from that shot); a completed
// swap always FILLS the magazine. Two server-private timestamps on the
// ShipRecord carry the stream's clock (`streamNextAt`) and the idle clock
// (`streamLastShotAt`); the wire `WeaponAmmo` stays `{n, reloadMsLeft}` and the
// HUD draws the drain from n / maxAmmo.
//
// A DIRECT SHELL HAS NO BURST: a hull it strikes takes the full `damage` on
// contact; a shell reaching its aim point simply EXPIRES there (the shooter's
// self-private `sp` splash, no `burst` event), so it can never detonate a mine
// — its mask omits `mine` — and a shell in flight never touches one either
// (amendment 20). 360°, no arc (amendment 106). Every shell emits its OWN `mz`
// (amendment 89(i): the stream IS the spectacle, like the broadside's barrage).
//
// Every number is read off the ship's cached EFFECTIVE stats row
// (`stats.equipment.machineGun` — the ladder moves maxAmmo/damage/reloadMs),
// never CONFIG, except the family constants (shell speed / radius / mask).

import { CONFIG, EQUIPMENT_IS_WEAPON, type LoadoutSlot, type WeaponAmmo } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationContext, ActivationResult, Equipment } from './index.js';
import { burstPointAlong, muzzleOrTarget } from './guns.js';
import { makeBallistic } from './ballistics.js';

/** Advance a running magazine swap by `dtMs`; on completion the magazine is
 *  FULL and the timer idle. Returns true iff a swap was running. A FULL
 *  magazine never swaps: a timer left running when a ladder grant topped the
 *  magazine up to its new cap (reconcilePools — everything arrives loaded) is
 *  pinned to 0 here, tickReload's `n >= maxAmmo` rule for the per-round pools. */
function tickSwap(state: WeaponAmmo, maxAmmo: number, dtMs: number): boolean {
  if (state.n >= maxAmmo) state.reloadMsLeft = 0;
  if (state.reloadMsLeft <= 0) return false;
  state.reloadMsLeft -= dtMs;
  if (state.reloadMsLeft <= 0) {
    state.reloadMsLeft = 0;
    state.n = maxAmmo;
  }
  return true;
}

/** Spawn ONE direct shell along the ship's aim to the clicked point, clamped
 *  to the gun's effective range and the water disk (the cannon's exact aim
 *  flow: `burstPointAlong` + `muzzleOrTarget`), born at `now`. */
function fireStreamShell(ctx: ActivationContext): void {
  const ship = ctx.ship;
  const mg = ship.stats.equipment.machineGun;
  const dir = ship.input.aim;
  const target = burstPointAlong(ship, ctx.mapRadius, mg.rangeU, dir);
  const origin = muzzleOrTarget(ship, dir, target, CONFIG.machineGun.shellRadius);
  const range = Math.hypot(target.x - origin.x, target.y - origin.y) + CONFIG.machineGun.shellRadius;
  const shell = makeBallistic(ctx.mkId(), ship, dir, ctx.now, {
    speed: CONFIG.machineGun.shellSpeed,
    range,
    damage: mg.damage,
    hitRadius: CONFIG.machineGun.shellRadius,
    kind: 'shell',
    origin,
    targetX: target.x,
    targetY: target.y,
    burstRadius: 0, // no blast — a direct shell
    contactDamage: mg.damage, // a direct hit deals the full damage
    hits: CONFIG.machineGun.hits, // AR44 target mask (hull | decoy — never a mine)
    family: 'mg',
    direct: true,
  });
  ctx.spawnBallistic(shell, { perShellFlash: true }); // one `mz` per shell (amendment 89(i))
}

/** The machine gun Equipment row. Slot state is non-null by the loadout
 *  invariant (see index.ts). */
export const machineGunEquipment: Equipment = {
  id: 'machineGun',
  isWeapon: EQUIPMENT_IS_WEAPON.machineGun, // shared weapon/ability split — single source
  tick(ship: ShipRecord, slot: LoadoutSlot, dtMs: number, now: number): void {
    const mg = ship.stats.equipment.machineGun;
    const state = slot.state!;
    if (tickSwap(state, mg.maxAmmo, dtMs)) return; // a running swap counts down
    if (state.n >= mg.maxAmmo) return; // full: nothing to do
    // EMPTY, or IDLE with shells left (amendment 103): start the full swap.
    if (state.n === 0 || now - ship.streamLastShotAt >= mg.idleReloadMs) state.reloadMsLeft = mg.reloadMs;
  },
  activate(): ActivationResult {
    // A CLICK EDGE FIRES NOTHING (amendment 103: the level alone fires). The
    // World never routes a click here (consumeClick skips a `stream` row), so
    // this is reached only by a directed caller — and it stays a no-op with
    // no denial and no state change either way.
    return { ok: true };
  },
  stream(ctx: ActivationContext, slot: LoadoutSlot, held: boolean): void {
    const ship = ctx.ship;
    const state = slot.state!;
    if (!held || state.n <= 0 || ctx.now < ship.streamNextAt) return;
    // A SHOT CANCELS A RUNNING PARTIAL SWAP (amendment 103): the shells left
    // fire, and the idle clock restarts from this shot. The next swap is again
    // the full reloadMs.
    state.reloadMsLeft = 0;
    state.n -= 1;
    ship.streamLastShotAt = ctx.now;
    ship.streamNextAt = ctx.now + ship.stats.equipment.machineGun.rateMs;
    fireStreamShell(ctx);
  },
};
