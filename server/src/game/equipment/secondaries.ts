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
// Damage is flat with range (range attenuation retired 2026-11-12, Story
// 11.1).
//
// REAL DISPERSION (Story 11.1, R5 / R6 / R8): the round's target is
// DISPERSED around that clamped aim point from its own muzzle
// (`dispersedFlight` — the shared `dispersedLanding`, seeded per round off the
// room-private stream through `ctx.mintShell()`, kept inside the water disk,
// possibly past the reach), and the round flies STRAIGHT from its muzzle to
// it.
//
// ISLANDS (Eric 2026-11-13, epic-11 amendment 8): the main battery's terrain
// rule — the chart's lowest land band is passed over, the first higher ground
// stops the round (resolved at launch, `terrainFlightEnd`); a landing on land
// is spent and does nothing. Against SHIPS the round is unchanged.

import { CONFIG } from '@salvo/shared';
import type { ActivationContext } from './index.js';
import { burstPointAlong, muzzleOrTarget } from './guns.js';
import { dispersedFlight, makeBallistic, terrainFlightEnd } from './ballistics.js';

/** Spawn ONE secondaries round along the ship's aim (see the header). */
export function fireSecondaryRound(ctx: ActivationContext): void {
  const ship = ctx.ship;
  const cfg = CONFIG.secondaries;
  const reachU = ship.stats.secondaryRangeU;
  const dir = ship.input.aim;
  const aimPt = burstPointAlong(ship, ctx.mapRadius, reachU, dir);
  const origin = muzzleOrTarget(ship, dir, aimPt, cfg.shellRadius);
  const { id, seed } = ctx.mintShell();
  const f = dispersedFlight(origin, aimPt, seed, ctx.mapRadius, dir);
  // ISLANDS (Eric 2026-11-13, epic-11 amendment 8 — "the same rule with
  // firing over islands"): the round clears the lowest land band and the
  // first higher ground on its path stops it, decided once at launch. SHIPS
  // are unchanged: it still strikes the first hull on its path.
  const end = terrainFlightEnd(ctx.heightRaster, origin, f.landing);
  const target = end.point;
  const shell = makeBallistic(id, ship, f.dir, ctx.now, {
    speed: cfg.shellSpeed,
    range: Math.hypot(target.x - origin.x, target.y - origin.y) + cfg.shellRadius,
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
    overLand: true, // the coastline alone never stops it; high ground does (terrainStop)
    ...end.tag,
  });
  ctx.spawnBallistic(shell, { perShellFlash: true }); // one `mz` per round, the machine gun's rule
}
