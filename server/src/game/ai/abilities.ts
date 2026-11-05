// THE TWO COOLDOWN ABILITIES' BOT ROWS (Story 10.5, Eric 2026-11-05,
// epic-10 amendment 10) — HULL REPAIR (`C`) and SMOKE (`V`). Every hull has
// both; neither sits in a slot, so they are NOT tactic-registry rows: the
// brain asks `chooseCooldownAbility` after the Shift (tactics.ts chooseAct)
// and the driver sends the ability's wire code on `InputMsg.act`.
//
// FUNCTIONAL, NOT TUNED (tuning is Story 10.12): each row fires on the very
// condition its belt row fired on (HULL REPAIR's hurt read, the 9.3 cloud's
// occasions) and adds exactly one gate — the shared refusal law
// (`repairRefusal` / `smokeRefusal`, sim/abilities.ts) reads ready, so a bot
// never presses into its own cooldown or a full hull. No new dial.
//
// Every want() is AFLOAT-guarded, draws no rng and writes nothing.

import { isAfloat, repairRefusal, smokeRefusal, type CooldownAbilityId } from '@salvo/shared';
import type { BotMind, BotPosture } from './types.js';
import { anyHostileWithin, healthy, radarChaser, type TacticContext } from './tacticKit.js';

/** THE HURT READ (the belt row's, unchanged): the hull plus its paid pool
 *  under the profile's `healHpFrac` (which defaults to
 *  `CONFIG.bots.healHpFrac`). Counting the pool asks where the hull WILL be,
 *  so a bot never presses again for hp already on its way. */
function hurt(ctx: TacticContext): boolean {
  return ctx.sit.maxHp > 0 && (ctx.sit.hp + ctx.self.repairHp) / ctx.sit.maxHp < ctx.sit.profile.healHpFrac;
}

/** HULL REPAIR — pressed when hurt, the ability ready and not refused. */
function repairWant(ctx: TacticContext): boolean {
  if (!isAfloat(ctx.self.lifecycle) || !hurt(ctx)) return false;
  return repairRefusal(ctx.self.hp, ctx.self.stats.maxHp, ctx.sit.now, ctx.self.repairReadyAt) === null;
}

/**
 * Could one of this bot's OWN countermeasure clouds still be alive? A press
 * stamps `cloudUntil = now + lifeMs` (the world keeps the stamp after the
 * cloud expires and zeroes it only at a life boundary), so every own cloud
 * is gone once `now >= cloudUntil`. (`cloudUntil` arrives on the mind,
 * copied by the driver.)
 */
function ownCloudRunning(mind: BotMind, now: number): boolean {
  const until = mind.cloudUntil;
  if (until === undefined || until === 0) return false;
  return now < until;
}

/** The postures that DECLINE a fight (amendment 199): hiding, kiting, or
 *  repositioning with a hostile plot on the scope. */
const DECLINE_POSTURES: readonly BotPosture[] = ['hide', 'kite', 'reposition'];

/**
 * When does the smoke's occasion stand (the own-cloud rule aside)? The 9.3
 * countermeasure's occasions, unchanged:
 *   (a) on the way OUT — the disengage posture;
 *   (b) a break-off into HIDE from a radar chaser (amendment 199);
 *   (c) a DECLINED FIGHT by a HEALTHY bot: hide / kite / reposition with any
 *       fresh hostile inside own radar range (amendment 199).
 */
function smokeOccasion(ctx: TacticContext): boolean {
  if (ctx.posture === 'disengage') return true;
  if (ctx.posture === 'hide' && radarChaser(ctx)) return true;
  if (!DECLINE_POSTURES.includes(ctx.posture) || !healthy(ctx.sit)) return false;
  return anyHostileWithin(ctx, ctx.sit.stats.radarRange);
}

/** SMOKE — pressed on its occasion, ready, never while an own cloud is up
 *  (Eric ruling R12, 2026-09-30). */
function smokeWant(ctx: TacticContext): boolean {
  if (!isAfloat(ctx.self.lifecycle) || ownCloudRunning(ctx.mind, ctx.sit.now)) return false;
  if (smokeRefusal(ctx.sit.now, ctx.self.smokeReadyAt) !== null) return false;
  return smokeOccasion(ctx);
}

/** The two rows, in the order the brain asks them (repair first — the belt's
 *  HULL REPAIR sat left of the countermeasure). */
export const ABILITY_WANTS: Readonly<Record<CooldownAbilityId, (ctx: TacticContext) => boolean>> = Object.freeze({
  repair: repairWant,
  smoke: smokeWant,
});

/** The cooldown ability this bot presses this tick, or null. */
export function chooseCooldownAbility(ctx: TacticContext): CooldownAbilityId | null {
  if (ABILITY_WANTS.repair(ctx)) return 'repair';
  if (ABILITY_WANTS.smoke(ctx)) return 'smoke';
  return null;
}
