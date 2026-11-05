// THE TWO BURST SHELLS — FLASH SHELLS (id `dazzleShells`) and the FOULING
// SHELL — as SLOT WEAPONS (Story 10.5, Eric 2026-11-05, epic-10 amendment 11,
// R4 / R7). Both were belt consumables (Story 8.17 / 9.4 / 10.9); both now sit
// in the special-shell slot (`R`) on the standard reload pool (equipment/
// ammo.ts): one round, R4's reload, the −5 %/tier step and RELOAD's scale
// folded into the row by `effectiveStats`, like every slot weapon (Story
// 10.5, R11).
//
// THE FIRE FLOW IS UNCHANGED: a CLICK fires ONE 360° gun-pattern shell to the
// click, clamped at the row's `rangeU` (the fouling shell's reach — one dial
// for both, epic-10 amendment 4 ruling 2). Neither deals damage (`damage 0` /
// `contactDamage 0`) and neither ever detonates a mine (the star shell's hull
// mask). THE BURST RADIUS IS THE ROW'S, STAMPED AT LAUNCH (R7: +25 u a tier):
// a card taken while a shell is in the air never changes that shell.
//   - FLASH: the burst carries the server-internal `flash` tag — every
//     non-owner afloat hull whose centre is inside the stamped radius gets the
//     whiteout (World.applyFlash, amendment 5 unchanged); an interception en
//     route flashes at the stop point.
//   - FOULING: the burst carries the `foul` tag — the World spawns a foul zone
//     of the stamped radius where the shell stops (World.spawnFoulZone).
//
// Pure adapter: the fire geometry is the star shell's (burstPoint /
// muzzleOrTarget / makeBallistic with D1 fireT); the World owns shell storage,
// the dazzle mark, the zone store and event emission.

import {
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  FLASH_WINDOW_MS,
  type EffectiveBurstShell,
  type ShellState,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationContext, ActivationResult, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';
import { makeBallistic, type BallisticParams } from './ballistics.js';
import { burstPoint, muzzleOrTarget } from './guns.js';

/** The two lines this module fits. */
export type BurstShellLineId = 'dazzleShells' | 'foulingShell';

/** The shell-flight constants of a line's own CONFIG block (no tier steps them). */
function flightOf(id: BurstShellLineId): { shellSpeed: number; shellRadius: number; hits: BallisticParams['hits'] } {
  return id === 'dazzleShells' ? CONFIG.flashShells : CONFIG.foulingShell;
}

/** The payload tag a line's burst carries — the radius is the launched row's. */
function payloadOf(id: BurstShellLineId, row: EffectiveBurstShell): Pick<BallisticParams, 'flash' | 'foul'> {
  if (id === 'dazzleShells') return { flash: { radius: row.radius, durationMs: FLASH_WINDOW_MS } };
  return { foul: { radius: row.radius, durationMs: CONFIG.foulingShell.durationMs } };
}

/** Build ONE burst shell of `id` from `ship` to the click (no pool read). */
export function makeBurstShell(
  id: BurstShellLineId,
  ship: ShipRecord,
  fireT: number,
  mapRadius: number,
  mkId: () => string,
): ShellState {
  const row = ship.stats.equipment[id];
  const flight = flightOf(id);
  const dir = ship.input.aim;
  const target = burstPoint(ship, mapRadius, row.rangeU);
  const origin = muzzleOrTarget(ship, dir, target, flight.shellRadius);
  return makeBallistic(mkId(), ship, dir, fireT, {
    speed: flight.shellSpeed,
    range: Math.hypot(target.x - origin.x, target.y - origin.y) + flight.shellRadius,
    damage: 0, // no damage, ever
    hitRadius: flight.shellRadius,
    kind: 'shell', // rides the existing shell wire kind
    origin,
    targetX: target.x,
    targetY: target.y,
    burstRadius: row.radius, // the one-time burst — stamped at launch (R7)
    contactDamage: 0, // an interception does 0 — and still bursts there (World.resolveInterception)
    hits: flight.hits, // the star shell's mask — never a mine
    family: 'cannon', // a gun-pattern shell — `w: 'cannon'`
    ...payloadOf(id, row),
  });
}

/** Build one burst-shell line's Equipment row over its slot pool. */
function burstShellLine(id: BurstShellLineId): Equipment {
  return {
    id,
    isWeapon: EQUIPMENT_IS_WEAPON[id],
    tick(ship, slot, dtMs): void {
      const row = ship.stats.equipment[id];
      tickReload(slot.state!, row.maxAmmo, row.reloadMs, dtMs);
    },
    activate(ctx: ActivationContext, slot): ActivationResult {
      // 360°: no arc denial is possible; the only refusal is an empty pool.
      if (!consume(slot.state!, ctx.ship.stats.equipment[id].reloadMs)) return { ok: false, reason: 'no-ammo' };
      ctx.spawnBallistic(makeBurstShell(id, ctx.ship, ctx.fireT, ctx.mapRadius, ctx.mkId));
      return { ok: true };
    },
  };
}

/** FLASH SHELLS (Story 8.17 / 10.9; a slot weapon since 10.5). */
export const dazzleShellsEquipment: Equipment = burstShellLine('dazzleShells');

/** The FOULING SHELL (Story 9.4; a slot weapon since 10.5). */
export const foulingShellEquipment: Equipment = burstShellLine('foulingShell');
