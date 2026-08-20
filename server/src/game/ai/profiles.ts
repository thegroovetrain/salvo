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
//                early (C3). Hangs BACK doing it (Eric ruling 2026-08-20).
//   ML trapper — mines astern while withdrawing; prepares its field from
//                standoff and lets the traps do the closing.
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

import { CONFIG, type EffectiveStats, type EquipmentId, type ShipClassId } from '@salvo/shared';
import type { AnyProfileId, BotProfileId, TestProfileId } from './types.js';

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
  id: AnyProfileId;
  /** The hull this profile is only ever assigned to (CONFIG.bots.profiles
   *  for the six in-game rows; the harness's explicit override for the three
   *  test-only rows). */
  hullId: ShipClassId;
  /**
   * HOW A BANKED LEVEL IS SPENT (Story 7-6 wave 4). 'weighted' — the shipped
   * deterministic, rng-free doctrine-weight scoring in ai/spending.ts; every
   * in-game row is 'weighted' and that path is byte-identical to before this
   * field existed. 'random' — a UNIFORM pick over the offer off the mind's
   * decorrelated spendRng stream, for the blind-vacuum test rows only. The
   * heal rule is NOT randomized in either mode (Eric ruling: card pick only),
   * so damage control never becomes a confound in the survival data.
   */
  spend: 'weighted' | 'random';
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
  /**
   * THE APPETITE TABLE (Eric ruling 2026-08-20) — how PROACTIVELY this
   * captain reaches for each equipment, and the ONLY thing a profile may say
   * about a weapon. It replaces the retired usesStarShells /
   * usesMinesProactively / usesBoost capability flags, which keyed weapon
   * knowledge by HULL (a Battleship acquiring mines knew nothing about mines;
   * `bulwark` carried star shells it was flagged never to fire). HOW a weapon
   * is used — placement geometry, doctrine branches, target selection — lives
   * with the weapon in ai/equipment.ts and may NOT be overridden here.
   *
   * Consumers (every entry has at least one — the deleted-`aggression` rule):
   * the slot ORDERING in tactics.ts (all entries) and each tactic's want()
   * PROACTIVITY gate against equipment.ts's APPETITE_NEUTRAL (1) /
   * APPETITE_EAGER (2) thresholds (mine, starShells, radarBuoy, speedBoost).
   * Unlisted equipment resolves to the neutral base (gun deliberately lowest:
   * the fallback weapon is tried last). Values are eagerness, NEVER ranges —
   * ranges stay fractions of the bot's own stats in the tactics.
   */
  appetite: Partial<Record<EquipmentId, number>>;
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
    spend: 'weighted',
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
    // The opener weapon leads every tick; boost is spent eagerly on the way
    // out (the old usesBoost: true, now a number the ordering also reads).
    appetite: { torpedo: 2.5, speedBoost: 2.0 },
  },
  duelist: {
    id: 'duelist',
    spend: 'weighted',
    hullId: 'torpedoBoat',
    // Knife range: inside 0.3R the rear-quarter turn-fight is decided by
    // rudder and gun cooldown, which is exactly where this profile wins.
    bandMinFrac: 0.08,
    bandMaxFrac: 0.3,
    // Wants a PEER, and does not care whether it is hurt or alone.
    targetWeights: { captain: 1.4, fleet: 0.6, damaged: 0.9, isolated: 0.5 },
    disengageHpFrac: 0.3,
    healHpFrac: DEFAULT_HEAL,
    // Gun-led by BAND, not by ordering: the tube is still tried first when a
    // credible opening exists (mid appetite), and the boost breaks a bad fight.
    appetite: { torpedo: 1.5, speedBoost: 1.5 },
  },
  bulwark: {
    id: 'bulwark',
    spend: 'weighted',
    hullId: 'battleship',
    // Holds ground at gun-trade range and refuses to be kited out of it.
    bandMinFrac: 0.15,
    bandMaxFrac: 0.4,
    targetWeights: { captain: 1.2, fleet: 0.9, damaged: 1.0, isolated: 0.4 },
    disengageHpFrac: 0.22, // trades far longer than any other profile
    healHpFrac: 0.6, // and tops off sooner, because HP IS its plan
    // Bulwark CARRIES star shells and now genuinely uses them — reluctantly
    // (above neutral, below eager: it waits for a plot to go properly cold
    // before spending a 20s flare). The old usesStarShells: false was the
    // capability-keyed-by-hull defect the equipment axis retires.
    appetite: { broadside: 2.0, starShells: 1.2 },
  },
  siege: {
    id: 'siege',
    spend: 'weighted',
    hullId: 'battleship',
    // Standoff — RE-BANDED IN STORY 7-5 WAVE 2, forced by the weapon swap
    // rather than chosen: the cannon reached the full radar horizon, so this
    // profile stood out past the muzzle/smoke rung (0.625R) where the reply
    // mostly did not. The BROADSIDE BARRAGE that replaced it is capped AT that
    // rung (`broadside.rangeU` = 0.625R), so the old 0.55–0.95 band put its
    // heavy weapon out of range for most of its own preferred water. The band
    // now sits just INSIDE the rung — still the longest standoff of any
    // profile, still star-shell-led — and is a TUNING TARGET, not a ruling.
    bandMinFrac: 0.4,
    bandMaxFrac: 0.6,
    targetWeights: { captain: 1.2, fleet: 0.8, damaged: 1.1, isolated: 0.6 },
    disengageHpFrac: 0.4,
    healHpFrac: DEFAULT_HEAL,
    // EAGER flares (C2 — the BS DOES use star shells: the eager tier keeps
    // the shipped 1.5s staleness trigger) leading the broadside; an acquired
    // mine stays at the neutral base, so siege lays only against something
    // CLOSING — never as trapper's standing plan.
    appetite: { starShells: 2.4, broadside: 2.2 },
  },
  forager: {
    id: 'forager',
    spend: 'weighted',
    hullId: 'mineLayer',
    // HANGS BACK TO SURVIVE TO THE PAYOFF (Eric ruling 2026-08-20, cycle
    // 111). The ML *"wants certain things, and when it gets them it is a
    // powerhouse, it just needs to survive until then"* — and cycle 110's A/B
    // measured the old 0.20–0.45 band dying for it (181.1s afloat vs the
    // random control's 264.0s, 1.97 boons vs 2.96). The band now sits from
    // just under truesight out to the 0.80R standoff: the whole of it is
    // inside the ML's own gun reach (gun rangeU IS radarRange), so hanging
    // back costs no firepower, only exposure.
    bandMinFrac: 0.45,
    bandMaxFrac: 0.8,
    // THE ONLY profile that would rather shoot world content than a captain
    // (C3: clear fleet groups for the level lead, avoid captains early).
    targetWeights: { captain: 0.5, fleet: 2.0, damaged: 0.8, isolated: 0.6 },
    disengageHpFrac: 0.55, // the EARLIEST break-off in the game — see above
    healHpFrac: 0.6, // and tops off early: boons are its plan, hp buys them
    // A farmer, not a layer: the mine sits barely above neutral (reactive —
    // it answers a closing chaser, not trapper's standing plan; holding the
    // CAPTIVE doctrine opens the prepared lay at this tier, but that lives
    // with the weapon in ai/equipment.ts), and the buoy is plain recon
    // between fleet groups.
    appetite: { mine: 1.4, radarBuoy: 1.1 },
  },
  trapper: {
    id: 'trapper',
    spend: 'weighted',
    hullId: 'mineLayer',
    // RE-BANDED OUTWARD (Eric ruling 2026-08-20, cycle 111): the old
    // 0.12–0.35 "fights near its own field" band was the closest in the game
    // and the A/B measured it as the death of the hull that most needs to
    // live to its payoff. The field does the close fighting now — mines are
    // laid PREPARED from safety (ai/equipment.ts) and a captive mine's 144u
    // trip does its own chasing — so the hull itself stands off at knife-to-
    // truesight range and breaks away sooner.
    bandMinFrac: 0.25,
    bandMaxFrac: 0.5,
    targetWeights: { captain: 1.0, fleet: 1.0, damaged: 1.0, isolated: 0.8 },
    disengageHpFrac: 0.45, // breaks off early — the trap fights on without it
    healHpFrac: 0.6, // and heals early, for the same survive-to-payoff reason
    // EAGER mines — the standing plan (the old usesMinesProactively: true,
    // now the eager tier of the ONE shared mine tactic) — and the mine
    // outranks the buoy, so a threatened tick answers with the trap first.
    appetite: { mine: 2.6, radarBuoy: 1.6 },
  },
});

/**
 * THE THREE TEST-ONLY ROWS (Story 7-6 wave 4, ruled values) — the blind-vacuum
 * balance instrument, one per hull. Every number here is chosen so the read is
 * NOT shaped by a doctrine preference: band 0.15–0.55 (knife range to just
 * inside the broadside rung) for all three, flat target weights, CONFIG
 * default disengage/heal, EVERY appetite entry at or above APPETITE_EAGER (2)
 * so every equipment verb is exercised (the gun sits at exactly 2 — still the
 * lowest entry, preserving the universal fallback ordering without ever
 * dropping below the ruled floor), and `spend: 'random'` so card performance
 * is measured with the picker's taste removed.
 *
 * SEPARATE ID SPACE, ON PURPOSE (safety, not style): these ids are NOT in
 * CONFIG.bots.profiles, which is the ONLY table the in-game enrollment roll
 * draws from — so ArenaRoom.buildBotFleet can never deal one to a real
 * player's Solo vs AI opponents. They are reachable solely through the
 * explicit profile override the batch-sim harness passes to world.addBot.
 */
const TEST_APPETITE: Readonly<Partial<Record<EquipmentId, number>>> = Object.freeze({
  gun: 2.0,
  torpedo: 2.2,
  mine: 2.2,
  speedBoost: 2.2,
  broadside: 2.2,
  starShells: 2.2,
  radarBuoy: 2.2,
});

const testRow = (id: TestProfileId, hullId: ShipClassId): BotProfile => ({
  id,
  spend: 'random',
  hullId,
  bandMinFrac: 0.15,
  bandMaxFrac: 0.55,
  targetWeights: { captain: 1.0, fleet: 1.0, damaged: 1.0, isolated: 1.0 },
  disengageHpFrac: DEFAULT_DISENGAGE,
  healHpFrac: DEFAULT_HEAL,
  appetite: { ...TEST_APPETITE },
});

/** `Record<TestProfileId, …>` is the same completeness gate BOT_PROFILES
 *  uses: a new test id in types.ts cannot ship without a row here. */
export const TEST_PROFILES: Readonly<Record<TestProfileId, BotProfile>> = Object.freeze({
  randomTorpedoBoat: testRow('randomTorpedoBoat', 'torpedoBoat'),
  randomBattleship: testRow('randomBattleship', 'battleship'),
  randomMineLayer: testRow('randomMineLayer', 'mineLayer'),
});

/** The test ids in hull-class order (TB, BS, ML) — the harness's round-robin
 *  deal order for `--bot-profile random`. */
export const TEST_PROFILE_IDS: readonly TestProfileId[] = Object.freeze([
  'randomTorpedoBoat',
  'randomBattleship',
  'randomMineLayer',
]);

/** The profile table for an id — in-game or test-only. Total by construction
 *  (AnyProfileId is exactly the union of the two Records' key sets), so no
 *  fallback is needed or offered. */
export function profileOf(id: AnyProfileId): BotProfile {
  return Object.hasOwn(BOT_PROFILES, id)
    ? BOT_PROFILES[id as BotProfileId]
    : TEST_PROFILES[id as TestProfileId];
}

/** The engagement band in WORLD UNITS for a profile at these stats — the one
 *  place the fractions are resolved. Anchored on `radarRange` (intel range,
 *  the one ruler), so boons widen the band for free. */
export function engagementBand(profile: BotProfile, stats: EffectiveStats): { min: number; max: number } {
  return { min: profile.bandMinFrac * stats.radarRange, max: profile.bandMaxFrac * stats.radarRange };
}
