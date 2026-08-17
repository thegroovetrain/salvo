// COMBAT-BOT PRIORITY PROFILES (Story 6.4, wave 2) — WHAT a bot wants.
//
// THIS IS NOT A DIFFICULTY LADDER (Eric rulings E1/E2, 2026-08-16: *"Each
// ship should just get 2-3 different 'priority profiles'"*). Every bot in the
// game sails at ONE competence level — competence is set by exactly two
// CONFIG knobs, `aimScatterU` (marksmanship) and `reactionMs` (reflexes), and
// neither appears in this file. What a profile changes is PRIORITY: which
// target looks worth chasing, how far out it wants to fight, when it breaks
// off, and which cards it buys. Two Battleships at identical competence, one
// `bulwark` and one `siege`, play completely differently and neither is the
// harder one.
//
// Six profiles, two per class, matching CONFIG.bots.profiles exactly (the
// Record<BotProfileId, BotProfile> below fails to type-check the moment the
// two lists disagree, which is the whole reason BotProfileId is derived from
// CONFIG rather than written twice):
//
//   TB raider  — isolated/damaged targets; torpedo opener at credible range;
//                boost out. Avoids sustained fights (C1: hit-and-run).
//   TB duelist — vs a peer, turn-fight for the REAR QUARTER; guns through the
//                30s torpedo reload (C1: TB-vs-TB is a dogfight). The
//                geometry already rewards it — behind a TB denies its bow
//                ±30° torpedo arc while your own guns stay 360°.
//   BS bulwark — attrition. Holds ground, trades on HP, disengages late (C2:
//                maximize survivability).
//   BS siege   — standoff. Cannon-led; star shells to resolve stale contacts
//                into live sight (C2: the BS DOES use star shells).
//   ML forager — clears PvE fleet groups for a level lead; avoids captains
//                early (C3).
//   ML trapper — mines astern while withdrawing; decoy to break locks; fights
//                near its own field.
//
// RANGES ARE FRACTIONS OF INTEL RANGE, NEVER LITERALS. `bandMinFrac`/
// `bandMaxFrac` multiply the bot's OWN `stats.radarRange`, so a profile's
// engagement band moves with its INTEL RANGE cards exactly as the eighths
// ladder does (detect 0.375R, sight 0.5R, muzzle/smoke 0.625R, farRadar
// 0.875R, radar R) — and gun/cannon/star-shell `rangeU` all ARE radarRange,
// so a band fraction is simultaneously a fraction of weapon reach. A literal
// here would silently stop tracking a boon-widened hull.
//
// THE HUMAN GETS NO SPECIAL WEIGHT (Eric ruling B3). `targetWeights.captain`
// covers human captains and other bots IDENTICALLY — a bot cannot even tell
// them apart, since both arrive as an ordinary `Contact` carrying a ship
// class. The only kind distinction any profile draws is participant-vs-PvE
// fleet hull, which is a real difference in what the target is worth.

import { CONFIG, type EffectiveStats, type ShipClassId } from '@salvo/shared';
import type { BotProfileId } from './types.js';

/** How much a profile wants one KIND of target, relative to the others.
 *  `captain`/`fleet` are multiplicative weights on the whole score; `damaged`
 *  and `isolated` are additive bonus coefficients on a 0..1 estimate. */
export interface BotTargetWeights {
  /** A participant hull — human captain or another bot, indistinguishable by
   *  ruling B3 and by construction. */
  captain: number;
  /** A PvE fleet hull (world content: cheaper XP, no return fire worth
   *  fearing, but it is what `forager` is FOR). */
  fleet: number;
  /** Coefficient on the 0..1 estimated-damage term (built from the bot's own
   *  self-private Hit Calls — see ai/utility.ts). */
  damaged: number;
  /** Coefficient on the 0..1 isolation term (no other tracked contact
   *  nearby). */
  isolated: number;
}

/** One priority profile — the tunable surface ai/utility.ts (targeting +
 *  posture), ai/spending.ts (boons) and wave-3 ai/tactics.ts (steering +
 *  weapons) read. Everything here is WANT, never SKILL — and every field
 *  here HAS a consumer: the review gate deleted an unconsumed `aggression`
 *  dial (its doc claimed throttle/marginality scaling that was never built)
 *  rather than invent behaviour for it late in the cycle; re-adding it means
 *  building its consumer in the same change. */
export interface BotProfile {
  id: BotProfileId;
  /** The hull this profile is only ever assigned to (CONFIG.bots.profiles). */
  hullId: ShipClassId;
  /** Preferred engagement band, as fractions of the bot's own intel range —
   *  resolve with engagementBand(), never read raw. */
  bandMinFrac: number;
  bandMaxFrac: number;
  targetWeights: BotTargetWeights;
  /** hp fraction below which this profile breaks off. Defaults to
   *  CONFIG.bots.disengageHpFrac; overridden where the profile's identity
   *  demands it (bulwark trades far longer, raider leaves far earlier). */
  disengageHpFrac: number;
  /** hp fraction below which a banked level buys DAMAGE CONTROL instead of a
   *  card. Defaults to CONFIG.bots.healHpFrac. */
  healHpFrac: number;
  /** Fires star shells to resolve stale contacts into live sight (C2). */
  usesStarShells: boolean;
  /** Lays mines as a plan (ahead of a withdrawal, across a likely track)
   *  rather than only when cornered. */
  usesMinesProactively: boolean;
  /** Spends boost to open or close range as a tactic. */
  usesBoost: boolean;
  /** Drops decoy buoys to break a lock. */
  usesDecoy: boolean;
}

/** CONFIG defaults, named once so a profile row reads as "the default" rather
 *  than as a number that happens to match. */
const DEFAULT_DISENGAGE = CONFIG.bots.disengageHpFrac;
const DEFAULT_HEAL = CONFIG.bots.healHpFrac;

/**
 * THE SIX PROFILES. `Record<BotProfileId, BotProfile>` is the completeness
 * gate: BotProfileId is derived from CONFIG.bots.profiles, so adding a
 * profile id there without a row here fails to type-check right at this line.
 */
export const BOT_PROFILES: Readonly<Record<BotProfileId, BotProfile>> = Object.freeze({
  raider: {
    id: 'raider',
    hullId: 'torpedoBoat',
    // Strikes from around the truesight boundary (0.5R) and does not loiter
    // inside knife range — the torpedo opener needs run-out room, and a TB
    // that stays close is in the fight it is trying to avoid.
    bandMinFrac: 0.3,
    bandMaxFrac: 0.55,
    // Isolation and damage dominate: a raider picks off stragglers.
    targetWeights: { captain: 1.0, fleet: 0.8, damaged: 1.6, isolated: 1.8 },
    disengageHpFrac: 0.5, // leaves EARLY — a hit torpedo boat is a dead one
    healHpFrac: DEFAULT_HEAL,
    usesStarShells: false,
    usesMinesProactively: false,
    usesBoost: true,
    usesDecoy: false,
  },
  duelist: {
    id: 'duelist',
    hullId: 'torpedoBoat',
    // Knife range: inside 0.3R the rear-quarter turn-fight is decided by
    // rudder and gun cooldown, which is exactly where this profile wins.
    bandMinFrac: 0.08,
    bandMaxFrac: 0.3,
    // Wants a PEER, and does not care whether it is hurt or alone.
    targetWeights: { captain: 1.4, fleet: 0.6, damaged: 0.9, isolated: 0.5 },
    disengageHpFrac: 0.3,
    healHpFrac: DEFAULT_HEAL,
    usesStarShells: false,
    usesMinesProactively: false,
    usesBoost: true,
    usesDecoy: false,
  },
  bulwark: {
    id: 'bulwark',
    hullId: 'battleship',
    // Holds ground at gun-trade range and refuses to be kited out of it.
    bandMinFrac: 0.15,
    bandMaxFrac: 0.4,
    targetWeights: { captain: 1.2, fleet: 0.9, damaged: 1.0, isolated: 0.4 },
    disengageHpFrac: 0.22, // trades far longer than any other profile
    healHpFrac: 0.6, // and tops off sooner, because HP IS its plan
    usesStarShells: false,
    usesMinesProactively: false,
    usesBoost: false,
    usesDecoy: false,
  },
  siege: {
    id: 'siege',
    hullId: 'battleship',
    // Standoff: out past the muzzle/smoke rung (0.625R), where the cannon
    // still reaches (cannon rangeU IS radarRange) and the reply mostly does
    // not. Star shells are what make a contact out there shootable.
    bandMinFrac: 0.55,
    bandMaxFrac: 0.95,
    targetWeights: { captain: 1.2, fleet: 0.8, damaged: 1.1, isolated: 0.6 },
    disengageHpFrac: 0.4,
    healHpFrac: DEFAULT_HEAL,
    usesStarShells: true, // C2 — the BS DOES use star shells
    usesMinesProactively: false,
    usesBoost: false,
    usesDecoy: false,
  },
  forager: {
    id: 'forager',
    hullId: 'mineLayer',
    bandMinFrac: 0.2,
    bandMaxFrac: 0.45,
    // THE ONLY profile that would rather shoot world content than a captain
    // (C3: clear fleet groups for the level lead, avoid captains early).
    targetWeights: { captain: 0.5, fleet: 2.0, damaged: 0.8, isolated: 0.6 },
    disengageHpFrac: 0.4,
    healHpFrac: DEFAULT_HEAL,
    usesStarShells: false,
    usesMinesProactively: false,
    usesBoost: false,
    usesDecoy: false,
  },
  trapper: {
    id: 'trapper',
    hullId: 'mineLayer',
    // Fights near its own field, so its band sits close: the mine's astern
    // ±60° arc only pays off with something following you.
    bandMinFrac: 0.12,
    bandMaxFrac: 0.35,
    targetWeights: { captain: 1.0, fleet: 1.0, damaged: 1.0, isolated: 0.8 },
    disengageHpFrac: DEFAULT_DISENGAGE,
    healHpFrac: DEFAULT_HEAL,
    usesStarShells: false,
    usesMinesProactively: true,
    usesBoost: false,
    usesDecoy: true,
  },
});

/** The profile table for an id. Total by construction (the Record above is
 *  keyed by the same union), so no fallback is needed or offered. */
export function profileOf(id: BotProfileId): BotProfile {
  return BOT_PROFILES[id];
}

/** The engagement band in WORLD UNITS for a profile at these stats — the one
 *  place the fractions are resolved. Anchored on `radarRange` (intel range,
 *  the one ruler), so boons widen the band for free. */
export function engagementBand(profile: BotProfile, stats: EffectiveStats): { min: number; max: number } {
  return { min: profile.bandMinFrac * stats.radarRange, max: profile.bandMaxFrac * stats.radarRange };
}
