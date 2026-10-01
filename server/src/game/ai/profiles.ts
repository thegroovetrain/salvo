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
// SIX PERSONALITIES, ANY HULL (Story 8.20, Eric ruling 2026-09-30, R6). They
// were two per class until 8.20; a hull is now only stats plus a special, and
// enrollment deals any personality onto any hull off the seeded stream. The
// names keep their historical flavor, but NOTHING here is keyed by hull any
// more, and the fighting-style numbers (band, target weights, disengage/heal
// fractions, appetite values) are carried over UNCHANGED. The list matches
// CONFIG.bots.profiles exactly (the Record<BotProfileId, BotProfile> below
// fails to type-check the moment the two lists disagree, which is the whole
// reason BotProfileId is derived from CONFIG rather than written twice):
//
//   raider  — isolated/damaged targets; torpedo opener at credible range;
//             boost out. Avoids sustained fights (hit-and-run).
//   duelist — vs a peer, turn-fight for the REAR QUARTER; guns through the
//             torpedo reload (a dogfighter).
//   bulwark — attrition. Holds ground, trades on HP, disengages late.
//   siege   — standoff. Cannon-led; star shells to resolve stale contacts
//             into live sight.
//   forager — clears PvE fleet groups for a level lead; avoids captains
//             early. Hangs BACK doing it (Eric ruling 2026-08-20).
//   trapper — mines astern while withdrawing; prepares its field from
//             standoff and lets the traps do the closing.
//
// Each row also carries a build TASTE (Eric ruling 2026-09-30, R5, approved
// verbatim) — the only thing the card scorer in ai/spending.ts reads from a
// profile, scored against CONFIG.bots.cardPoints (R3).
//
// RANGES ARE FRACTIONS OF INTEL RANGE, NEVER LITERALS. `bandMinFrac`/
// `bandMaxFrac` multiply the bot's OWN `stats.radarRange`, so a profile's
// engagement band moves with its INTEL RANGE cards exactly as the eighths
// ladder does (detect 0.375R, sight 0.5R, muzzle/smoke 0.625R, farRadar
// 0.875R, radar R) — and gun/cannon/star-shell `rangeU` all ARE radarRange,
// so a band fraction is simultaneously a fraction of weapon reach. No card
// writes `stats.radarRange` today (the INTEL RANGE line was deleted
// 2026-08-20), but a literal here would silently stop tracking the ruler if
// one ever lands again.
//
// THE HUMAN GETS NO SPECIAL WEIGHT (Eric ruling B3). `targetWeights.captain`
// covers human captains and other bots IDENTICALLY — a bot cannot even tell
// them apart, since both arrive as an ordinary `Contact` carrying a ship
// class. The only kind distinction any profile draws is participant-vs-PvE
// fleet hull, which is a real difference in what the target is worth.

import { CONFIG, type ConsumableId, type EffectiveStats, type EquipmentId, type ShipClassId } from '@salvo/shared';
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

/**
 * A favorite UPGRADE line family (Eric ruling 2026-09-30, R5). The five ship
 * ladders are named by what they raise; `gun` = any gun-ladder line (deckGun —
 * CANNON's own ladder, its turret and barrel are rungs of it — machineGun, flak;
 * the draw only ever offers the mounted gun's); `weapons` = a tier copy (2..cap) of an equipment line
 * the bot already holds (the spec's "Scorer definitions").
 */
export type UpgradeFavorite = 'armor' | 'speed' | 'turning' | 'radarSweep' | 'reload' | 'gun' | 'weapons';

/**
 * A personality's BUILD TASTE (Story 8.20, Eric ruling 2026-09-30, R5) — read
 * only by the card scorer (ai/spending.ts) against CONFIG.bots.cardPoints.
 * `style`: 'rounded' favors raising its lowest upgradeable line, 'specialist'
 * its highest. `beltHunger` keys CONFIG.bots.cardPoints.beltHunger (applied to
 * a consumable it carries none of). The favorites add points to a matching
 * card; `favoriteWeapons` decides among weapons for an empty Q/E/R slot only.
 */
export interface BotTaste {
  style: 'rounded' | 'specialist';
  favoriteUpgrades: readonly UpgradeFavorite[];
  favoriteConsumables: readonly ConsumableId[];
  favoriteWeapons: readonly EquipmentId[];
  beltHunger: 'low' | 'medium' | 'high';
}

/** One priority profile — the tunable surface ai/utility.ts (targeting +
 *  posture), ai/spending.ts (cards) and ai/tactics.ts (steering + weapons)
 *  read. Everything here is WANT, never SKILL — and every field here HAS a
 *  consumer: the review gate deleted an unconsumed `aggression` dial (its doc
 *  claimed throttle/marginality scaling that was never built) rather than
 *  invent behavior for it late in the cycle; re-adding it means building its
 *  consumer in the same change. No field names a hull (Story 8.20). */
export interface BotProfile {
  id: AnyProfileId;
  /**
   * HOW A BANKED LEVEL IS SPENT (Story 7-6 wave 4). 'weighted' — the
   * deterministic points scorer in ai/spending.ts (ties by the seeded spend
   * stream); every in-game row is 'weighted'. 'random' — a UNIFORM pick over
   * the offer off the mind's decorrelated spendRng stream, for the
   * blind-vacuum test rows only. The heal rule is NOT randomized in either
   * mode (Eric ruling: card pick only), so damage control never becomes a
   * confound in the survival data.
   */
  spend: 'weighted' | 'random';
  /** The build taste the 'weighted' scorer reads (see BotTaste). */
  taste: BotTaste;
  /** Preferred engagement band, as fractions of the bot's own intel range —
   *  resolve with engagementBand(), never read raw. */
  bandMinFrac: number;
  bandMaxFrac: number;
  targetWeights: BotTargetWeights;
  /** hp fraction below which this profile breaks off. Defaults to
   *  CONFIG.bots.disengageHpFrac; overridden where the profile's identity
   *  demands it (bulwark trades far longer, raider leaves far earlier). */
  disengageHpFrac: number;
  /** hp fraction below which this bot FIRES a stocked HULL REPAIR from its
   *  belt (epic-8 amendment 49 — it gated the retired -1 heal spend until
   *  Story 8.8). Defaults to CONFIG.bots.healHpFrac. */
  healHpFrac: number;
  /**
   * THE APPETITE TABLE (Eric ruling 2026-08-20) — how PROACTIVELY this
   * captain reaches for each equipment, and the ONLY thing a profile may say
   * about a weapon. It replaces the retired usesStarShells /
   * usesMinesProactively / usesBoost capability flags, which keyed weapon
   * knowledge by HULL. HOW a weapon is used — placement geometry, doctrine
   * branches, target selection — lives with the weapon in ai/equipment.ts and
   * may NOT be overridden here.
   *
   * Consumers (every entry has at least one — the deleted-`aggression` rule):
   * the slot ORDERING in tactics.ts (all entries) and each tactic's want()
   * PROACTIVITY gate against tacticKit.ts's APPETITE_NEUTRAL (1) /
   * APPETITE_EAGER (2) thresholds. EVERY LINE IS WRITTEN EXPLICITLY (Story
   * 8.20 deleted the old family fallback by writing the very numbers it used
   * to resolve: a light torpedo reads as the heavy, the captive and fouling
   * racks as the naval rack, phosphor as star shells, the two Shifts as the
   * boost, the two pickable guns as the gun). Unlisted equipment resolves to
   * the neutral base (gun deliberately lowest: the fallback weapon is tried
   * last). Values are eagerness, NEVER ranges — ranges stay fractions of the
   * bot's own stats in the tactics.
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
    taste: {
      style: 'specialist',
      favoriteUpgrades: ['speed', 'weapons'],
      favoriteConsumables: ['smokeScreen', 'chaff'],
      favoriteWeapons: ['heavyTorpedo', 'lightTorpedo'],
      beltHunger: 'medium',
    },
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
    appetite: { heavyTorpedo: 2.5, lightTorpedo: 2.5, boost: 2.0, instantReload: 2.0, damageCut: 2.0 },
  },
  duelist: {
    id: 'duelist',
    spend: 'weighted',
    taste: {
      style: 'specialist',
      favoriteUpgrades: ['gun', 'turning', 'reload'],
      favoriteConsumables: ['shieldBlock', 'dazzleShells'],
      favoriteWeapons: ['heavyTorpedo', 'lightTorpedo'],
      beltHunger: 'low',
    },
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
    appetite: { heavyTorpedo: 1.5, lightTorpedo: 1.5, boost: 1.5, instantReload: 1.5, damageCut: 1.5 },
  },
  bulwark: {
    id: 'bulwark',
    spend: 'weighted',
    taste: {
      style: 'rounded',
      favoriteUpgrades: ['armor'],
      favoriteConsumables: ['hullRepair', 'shieldBlock'],
      favoriteWeapons: ['broadside', 'starShells'],
      beltHunger: 'high',
    },
    // Holds ground at gun-trade range and refuses to be kited out of it.
    bandMinFrac: 0.15,
    bandMaxFrac: 0.4,
    targetWeights: { captain: 1.2, fleet: 0.9, damaged: 1.0, isolated: 0.4 },
    disengageHpFrac: 0.22, // trades far longer than any other profile
    healHpFrac: 0.6, // and repairs sooner, because HP IS its plan
    // Bulwark CARRIES star shells and now genuinely uses them — reluctantly
    // (above neutral, below eager: it waits for a plot to go properly cold
    // before spending a 20s flare). The old usesStarShells: false was the
    // capability-keyed-by-hull defect the equipment axis retires.
    appetite: { broadside: 2.0, starShells: 1.2, phosphorShells: 1.2 },
  },
  siege: {
    id: 'siege',
    spend: 'weighted',
    taste: {
      style: 'specialist',
      favoriteUpgrades: ['weapons', 'radarSweep'],
      favoriteConsumables: ['dazzleShells', 'supercavTorpedo'],
      favoriteWeapons: ['starShells', 'phosphorShells', 'broadside'],
      beltHunger: 'low',
    },
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
    appetite: { starShells: 2.4, phosphorShells: 2.4, broadside: 2.2 },
  },
  forager: {
    id: 'forager',
    spend: 'weighted',
    taste: {
      style: 'rounded',
      favoriteUpgrades: ['gun', 'reload'],
      favoriteConsumables: ['hullRepair', 'decoyBuoy'],
      favoriteWeapons: ['navalMines', 'captiveMines', 'foulingMines'],
      beltHunger: 'medium',
    },
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
    healHpFrac: 0.6, // and repairs early: boons are its plan, hp buys the time
    // A farmer, not a layer: the mine sits barely above neutral (reactive —
    // it answers a closing chaser, not trapper's standing plan; holding the
    // CAPTIVE doctrine opens the prepared lay at this tier, but that lives
    // with the weapon in ai/equipment.ts). (Its radar-buoy entry went with
    // the buoy in Story 8.16.)
    appetite: { navalMines: 1.4, captiveMines: 1.4, foulingMines: 1.4 },
  },
  trapper: {
    id: 'trapper',
    spend: 'weighted',
    taste: {
      style: 'rounded',
      favoriteUpgrades: ['weapons', 'speed'],
      favoriteConsumables: ['smokeScreen', 'decoyBuoy', 'chaff'],
      favoriteWeapons: ['navalMines', 'captiveMines', 'foulingMines'],
      beltHunger: 'high',
    },
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
    // now the eager tier of the ONE shared mine tactic). (Its radar-buoy entry
    // went with the buoy in Story 8.16.)
    appetite: { navalMines: 2.6, captiveMines: 2.6, foulingMines: 2.6 },
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
  machineGun: 2.0,
  flak: 2.0,
  heavyTorpedo: 2.2,
  lightTorpedo: 2.2,
  navalMines: 2.2,
  captiveMines: 2.2,
  foulingMines: 2.2,
  boost: 2.2,
  instantReload: 2.2,
  damageCut: 2.2,
  broadside: 2.2,
  starShells: 2.2,
  phosphorShells: 2.2,
});

/** A neutral taste for the test rows — never read (they spend at random), but
 *  every row carries one so BotProfile stays a single shape. */
const TEST_TASTE: BotTaste = Object.freeze({
  style: 'rounded',
  favoriteUpgrades: [],
  favoriteConsumables: [],
  favoriteWeapons: [],
  beltHunger: 'medium',
});

const testRow = (id: TestProfileId): BotProfile => ({
  id,
  spend: 'random',
  taste: TEST_TASTE,
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
  randomTorpedoBoat: testRow('randomTorpedoBoat'),
  randomBattleship: testRow('randomBattleship'),
  randomMineLayer: testRow('randomMineLayer'),
});

/** THE TEST ROWS STAY HULL-BOUND (Story 8.20): the harness's
 *  `--bot-profile random*` contract is one row per hull, so a forced test row
 *  still governs its bot's hull. The six in-game personalities have none. */
export const TEST_PROFILE_HULL: Readonly<Record<TestProfileId, ShipClassId>> = Object.freeze({
  randomTorpedoBoat: 'torpedoBoat',
  randomBattleship: 'battleship',
  randomMineLayer: 'mineLayer',
});

/** True iff `id` is one of the three test-only rows. */
export function isTestProfileId(id: AnyProfileId): id is TestProfileId {
  return Object.hasOwn(TEST_PROFILES, id);
}

/** The hull a FORCED profile binds its bot to: a test row's hull, or null for
 *  an in-game personality (which never decides the hull — the rolled or
 *  caller-passed hull stands). */
export function testProfileHull(id: AnyProfileId): ShipClassId | null {
  return isTestProfileId(id) ? TEST_PROFILE_HULL[id] : null;
}

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
 *  the one ruler), so any future widening of it moves the band for free. */
export function engagementBand(profile: BotProfile, stats: EffectiveStats): { min: number; max: number } {
  return { min: profile.bandMinFrac * stats.radarRange, max: profile.bandMaxFrac * stats.radarRange };
}
