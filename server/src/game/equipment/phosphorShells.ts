// PHOSPHOR SHELLS fire control — the phosphorShells Equipment row (Story 8.17,
// Eric ruling 2026-09-29, epic-8 amendment 131). Its OWN tiered 360° weapon
// line, no longer a verb on the star shell: one shell to the click at the
// radar rung (`rangeU` = radarRange post-fold, like the flare), 500 u/s, a
// 1-round pool presented as a 20 s cooldown (−5 %/tier derived). At burst it
// deals the row's `damage` (20 / 22 / 25 / 27 / 30) to every non-owner hull
// inside the WHOLE `zoneRadius`, then the World spawns a BURNING ZONE of that
// radius for `zoneDurationMs` burning `dps` hp/s — all three STAMPED on the
// shell's server-internal `burn` tag from the OWNER's effective row at
// launch (amendment 135(e)), so a later tier card never changes a live zone.
// An interception en route burns where the shell stopped, exactly as a flare
// lights there (World.resolveInterception).
//
// A DAMAGE WEAPON with the `hull | decoy` mask — NEVER a mine (amendment 200,
// Eric 2026-10-01, superseding 135(c)): only a deck gun's shell landing on a
// mine damages one, so a phosphor burst over a minefield leaves it. The zone it leaves is a HAZARD ONLY — it reveals nothing and
// extends no gun's reach; that is the World's and perception's concern
// (`World.burnZones`, `signals.burnZoneSignal`), never this row's.
//
// Same fire flow as the star shell (360°, clamp at the row's effective range,
// muzzle-or-target spawn, makeBallistic with D1 fireT). Pure over a
// ShipRecord's input + pose + slot pool; the World owns shell storage, zone
// spawn, and event emission.

import { CONFIG, EQUIPMENT_IS_WEAPON, type EquipmentState, type ShellState } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationDenial, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';
import { makeBallistic } from './ballistics.js';
import { burstPoint, muzzleOrTarget } from './guns.js';

/**
 * Phosphor fire control against one slot pool: 0 or 1 shell. The ONLY denial
 * is an empty pool ('no-ammo' — the cooldown); there is no arc. The burst
 * radius IS the zone radius, so an interceptor already inside the would-be
 * zone still bursts the shell at its target (zone where aimed).
 */
function firePhosphorShell(
  ship: ShipRecord,
  pool: EquipmentState,
  now: number,
  mapRadius: number,
  mkId: () => string,
): { shell: ShellState | null; denial: ActivationDenial | null } {
  const row = ship.stats.equipment.phosphorShells;
  if (!consume(pool, row.reloadMs)) return { shell: null, denial: 'no-ammo' }; // pool empty
  const dir = ship.input.aim;
  const target = burstPoint(ship, mapRadius, row.rangeU);
  const origin = muzzleOrTarget(ship, dir, target, CONFIG.phosphorShells.shellRadius);
  const shell = makeBallistic(mkId(), ship, dir, now, {
    speed: CONFIG.phosphorShells.shellSpeed,
    range: Math.hypot(target.x - origin.x, target.y - origin.y) + CONFIG.phosphorShells.shellRadius,
    damage: row.damage, // the tier's number to every hull inside the whole zone
    hitRadius: CONFIG.phosphorShells.shellRadius,
    kind: 'shell', // rides the existing shell wire kind
    origin,
    targetX: target.x,
    targetY: target.y,
    burstRadius: row.zoneRadius, // the burst IS the zone
    contactDamage: row.damage, // an interceptor takes the tier damage (the broadside precedent) — and it still burns there
    hits: CONFIG.phosphorShells.hits, // AR44 target mask — the gun's, mine bit included (amendment 135(c))
    family: 'cannon', // a gun-pattern shell — `w: 'cannon'`
    burn: { radius: row.zoneRadius, durationMs: row.zoneDurationMs, dps: row.dps }, // stamped at launch (135(e))
  });
  return { shell, denial: null };
}

/** The phosphorShells Equipment row. Pool size + reload come from the ship's
 *  cached effective stats (the PHOSPHOR SHELLS ladder over CONFIG.phosphorShells).
 *  Slot state is non-null by the loadout invariant (see index.ts). */
export const phosphorShellsEquipment: Equipment = {
  id: 'phosphorShells',
  isWeapon: EQUIPMENT_IS_WEAPON.phosphorShells, // shared weapon/ability split — single source
  tick(ship, slot, dtMs): void {
    const row = ship.stats.equipment.phosphorShells;
    tickReload(slot.state!, row.maxAmmo, row.reloadMs, dtMs);
  },
  activate(ctx, slot) {
    // bornAt = the VALIDATED fire time (D1), the star shell's exact posture.
    const { shell, denial } = firePhosphorShell(ctx.ship, slot.state!, ctx.fireT, ctx.mapRadius, ctx.mkId);
    if (shell) ctx.spawnBallistic(shell);
    return denial === null ? { ok: true } : { ok: false, reason: denial };
  },
};
