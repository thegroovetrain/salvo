// THE THREE MOVED WEAPONS' BOT ROWS (Story 10.5, Eric 2026-11-05, epic-10
// amendment 11) — the SUPERCAVITATING TORPEDO, FLASH SHELLS (`dazzleShells`)
// and the FOULING SHELL were belt consumables; they are slot weapons now (`Q`
// torpedo, `R` special shell) on the standard reload pool, so their rows sit
// in the WEAPON table (ai/equipment.ts `WEAPON_TACTICS`) and fire through the
// ordinary slot path (tactics.ts firePass). Each row keeps the condition its
// belt row fired on; only the numbers now come off the bot's own effective
// row (`stats.equipment.<id>`) — the server's launch reads the same row.
//
// No rng is drawn anywhere in a want() — the mind's stream feeds aim scatter
// and nothing else (the determinism pin).

import { CONFIG, isAfloat } from '@salvo/shared';
import { hasPersistence, type BotTrack } from './utility.js';
import {
  burstOnLiveContact,
  movingAway,
  nearestLiveAstern,
  nearestLiveInSight,
  solveTorpedoShot,
  stamped,
  type EquipmentTactic,
  type TacticContext,
} from './tacticKit.js';

/**
 * SUPERCAV TORPEDO — the torpedo tactic with three substitutions and nothing
 * else (epic-8 amendments 74/79): the bow ±15° sector, its own speed (the
 * effective row's — amendment 8(e) tiers step its damage, never its speed),
 * and its OWN credible range — `CONFIG.bots.supercavCredibleU` (epic-9
 * amendment 199). It never homes, so the gate never widens.
 */
export const supercavTorpedoTactic: EquipmentTactic = {
  id: 'supercavTorpedo',
  kind: 'shot',
  reachU: () => CONFIG.bots.supercavCredibleU,
  want: (ctx) => ctx.target !== null && hasPersistence(ctx.target, ctx.sit.now),
  solve: (ctx) =>
    stamped(
      ctx,
      'supercavTorpedo',
      solveTorpedoShot(
        ctx,
        'supercavTorpedo',
        ctx.sit.stats.equipment.supercavTorpedo.speed,
        CONFIG.bots.supercavCredibleU,
      ),
    ),
};

/**
 * FLASH SHELLS (`dazzleShells`) — a 'shot' row with the row's own reach
 * (`rangeU` — the fouling shell's dial, one for both): fired ENGAGED at the
 * nearest live contact in sight (the 8.17 rule — blind the target), afloat
 * only.
 */
export const dazzleShellsTactic: EquipmentTactic = {
  id: 'dazzleShells',
  kind: 'shot',
  reachU: (stats) => stats.equipment.dazzleShells.rangeU,
  want: (ctx) => isAfloat(ctx.self.lifecycle) && dazzleShellsTarget(ctx) !== null,
  solve: (ctx) =>
    stamped(
      ctx,
      'dazzleShells',
      burstOnLiveContact(ctx, ctx.sit.stats.equipment.dazzleShells.rangeU, dazzleShellsTarget(ctx)),
    ),
};

/** The flash's target: engaged → the nearest live contact in sight; else none. */
function dazzleShellsTarget(ctx: TacticContext): BotTrack | null {
  return ctx.posture === 'engage' ? nearestLiveInSight(ctx) : null;
}

/**
 * FOULING SHELL — a 'shot' row at a live contact in sight, afloat only, on
 * its three cues (epic-9 amendments 65 / 199): ENGAGING → the nearest live
 * contact in sight; DISENGAGING → the nearest live contact in sight ASTERN
 * (pin the chaser); PURSUING → the nearest live contact in sight that is
 * MOVING AWAY (stall the runner). Reach is the row's own `rangeU`.
 */
export const foulingShellTactic: EquipmentTactic = {
  id: 'foulingShell',
  kind: 'shot',
  reachU: (stats) => stats.equipment.foulingShell.rangeU,
  want: (ctx) => isAfloat(ctx.self.lifecycle) && foulingShellTarget(ctx) !== null,
  solve: (ctx) =>
    stamped(
      ctx,
      'foulingShell',
      burstOnLiveContact(ctx, ctx.sit.stats.equipment.foulingShell.rangeU, foulingShellTarget(ctx)),
    ),
};

/** The FOULING SHELL's target under the bot's posture, or null. */
function foulingShellTarget(ctx: TacticContext): BotTrack | null {
  if (ctx.posture === 'engage') return nearestLiveInSight(ctx);
  if (ctx.posture === 'disengage') return nearestLiveAstern(ctx);
  if (ctx.posture === 'pursue') return nearestLiveInSight(ctx, (t) => movingAway(ctx.sit, t));
  return null;
}
