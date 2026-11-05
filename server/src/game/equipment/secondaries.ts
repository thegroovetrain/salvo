// THE SECONDARIES (Story 10.4, Eric rulings 2026-11-04, epic-10 amendment 9
// R3) — a uniform, slotless, 360° stream on RIGHT MOUSE HELD (`InputMsg.sec`),
// identical on every captain hull, limited by HEAT, not ammo. The heat machine
// is the SHARED stepper (sim/secondaries.ts `stepSecondaries`) — the World's
// `secondariesControl` STEP_ORDER row steps it once per tick per afloat-or-
// sinking captain hull and fires whatever rounds it returns through here.
//
// A ROUND IS TODAY'S MACHINE-GUN ROUND (reading of record): a DIRECT shell —
// no burst; a hull it strikes takes `CONFIG.secondaries.damage` through the
// one damage gate, a shell reaching its aim point expires there and a mine
// within the marker radius of that point takes the round's damage (the
// World's mask-driven `landOnMines` — the secondaries' mask carries the mine
// bit; they are the ONLY captain weapon that hurts a mine). Family `'mg'`, one
// `mz` per round, born at `now` (no fire-time claim — a level has no click to
// back-date). Aim: the latest input's `aim` / `aimDist`, the point clamped to
// `stats.secondaryRangeU` (half the FOLDED main reach) and the water disk,
// measured from the ship CENTRE and NOT lifted by lit zones (contract §5).
// Range attenuation is the machine gun's: against the secondaries' own reach,
// none for a round aimed into the firer's own light (`attenRangeFor`).

import { CONFIG } from '@salvo/shared';
import type { ActivationContext } from './index.js';
import { attenRangeFor, burstPointAlong, muzzleOrTarget } from './guns.js';
import { makeBallistic } from './ballistics.js';

/** Spawn ONE secondaries round along the ship's aim (see the header). */
export function fireSecondaryRound(ctx: ActivationContext): void {
  const ship = ctx.ship;
  const cfg = CONFIG.secondaries;
  const reachU = ship.stats.secondaryRangeU;
  const dir = ship.input.aim;
  const target = burstPointAlong(ship, ctx.mapRadius, reachU, dir);
  const origin = muzzleOrTarget(ship, dir, target, cfg.shellRadius);
  const range = Math.hypot(target.x - origin.x, target.y - origin.y) + cfg.shellRadius;
  const shell = makeBallistic(ctx.mkId(), ship, dir, ctx.now, {
    speed: cfg.shellSpeed,
    range,
    damage: cfg.damage,
    hitRadius: cfg.shellRadius,
    kind: 'shell',
    origin,
    targetX: target.x,
    targetY: target.y,
    burstRadius: 0, // no blast — a direct round
    contactDamage: cfg.damage, // a direct hit deals the full damage
    hits: cfg.hits, // hull | mine — a mine only where the round lands
    family: 'mg',
    direct: true,
    attenRangeU: attenRangeFor(ctx, reachU, target),
  });
  ctx.spawnBallistic(shell, { perShellFlash: true }); // one `mz` per round, the machine gun's rule
}
