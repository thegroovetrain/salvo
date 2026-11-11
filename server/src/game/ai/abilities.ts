// THE TWO COOLDOWN ABILITIES' BOT ROWS (Story 10.5, Eric 2026-11-05,
// epic-10 amendment 11) — HULL REPAIR (`C`) and SMOKE (`V`). Every hull has
// both; neither sits in a slot, so they are NOT tactic-registry rows: the
// brain asks `chooseCooldownAbility` after the Shift (tactics.ts chooseAct)
// and the driver sends the ability's wire code on `InputMsg.act`.
//
// SMOKE fires on the 9.3 cloud's occasions; HULL REPAIR on the profile's
// REPAIR STYLE (Story 10.12, R3 — early or late, below). Each adds the shared
// refusal law (`repairRefusal` / `smokeRefusal`, sim/abilities.ts), so a bot
// never presses into its own cooldown or a full hull. No dial of its own.
//
// Every want() is AFLOAT-guarded, draws no rng and writes nothing.

import { isAfloat, repairRefusal, smokeRefusal, type CooldownAbilityId } from '@salvo/shared';
import type { BotMind, BotPosture } from './types.js';
import { brokenHull } from './posture.js';
import { anyHostileWithin, healthy, radarChaser, type TacticContext } from './tacticKit.js';

/** The postures a LATE repairer presses in whatever its hull reads — the
 *  break-off's own two. */
const LATE_PRESS_POSTURES: readonly BotPosture[] = ['disengage', 'ram'];

/** hp — the hull a HULL REPAIR press would still have to mend: missing hull
 *  less the paid pool already owed (`repairHp`). Counting the pool asks where
 *  the hull WILL be, so a bot never presses again for hp already on its way. */
function unmendedHp(ctx: TacticContext): number {
  return ctx.sit.maxHp - ctx.sit.hp - ctx.self.repairHp;
}

/** hp — everything ONE press heals: the instant half plus the paid pool, read
 *  off the bot's own folded stats (cards grow both — Story 10.6). */
function onePressHealHp(ctx: TacticContext): number {
  const { instantHp, regenHp } = ctx.self.stats.repair;
  return instantHp + regenHp;
}

/**
 * THE TWO REPAIR STYLES (Story 10.12, Eric 2026-11-11, epic-10 amendment 21,
 * R3 — the profile's `repairStyle`):
 *   EARLY — the whole heal of one press fits the unmended hull with no waste;
 *   LATE  — the bot breaks off: under its break-off line (posture.ts
 *           brokenHull, the profile's `disengageHpFrac`), or disengaging or
 *           ramming — and something is still unmended.
 * (`healHpFrac`, the one line every profile pressed under, retired here.)
 */
function wantsRepair(ctx: TacticContext): boolean {
  const unmended = unmendedHp(ctx);
  if (ctx.sit.profile.repairStyle === 'early') return unmended >= onePressHealHp(ctx);
  return unmended > 0 && (brokenHull(ctx.sit) || LATE_PRESS_POSTURES.includes(ctx.posture));
}

/** HULL REPAIR — pressed on the profile's style, the ability ready and not
 *  refused. */
function repairWant(ctx: TacticContext): boolean {
  if (!isAfloat(ctx.self.lifecycle) || ctx.sit.maxHp <= 0 || !wantsRepair(ctx)) return false;
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
