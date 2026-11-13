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
// FIVE PERSONALITIES, ANY HULL (Story 8.20, Eric ruling 2026-09-30, R6). They
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
//   siege   — standoff. Gun-led; star shells to resolve stale contacts
//             into live sight.
//   trapper — mines astern while withdrawing; prepares its field from
//             standoff and lets the traps do the closing.
//
// (`forager` — beacon farming for a level lead — was RETIRED by Story 10.12,
// Eric 2026-11-11, R6: "hunting drones is no longer a thing".)
//
// THREE PERSONALITY TRAITS (Story 10.12, Eric 2026-11-11, epic-10 amendment
// 21): `repairStyle` (R3 — when HULL REPAIR is pressed, ai/abilities.ts),
// `contestsBeacon` (R4 — whether a target pulls the bot off a beacon,
// ai/posture.ts) and `shiftFit` (R5 — the Shift its weighted roll favors,
// `rollShift` below).
//
// Each row also carries a build TASTE (Eric ruling 2026-09-30, R5, approved
// verbatim) — the only thing the card scorer in ai/spending.ts reads from a
// profile, scored against CONFIG.bots.cardPoints (R3).
//
// THE GUN OWNS ITS BAND; THE PROFILE ONLY NUDGES IT (Story 9.13, epic-9
// amendment 198, Eric 2026-10-17). Each deck gun's doctrine band is a pair of
// fractions of its own FULL-DAMAGE reach (CONFIG.bots.gunBand — cannon stands
// off, machine gun and flak close first), resolved by ai/doctrine.ts; a
// profile carries only `bandNudge`, a signed fraction of that reach moving
// the band in (−) or out (+). HISTORY: from Story 9.8 (epic-9 ruling 126) to
// Story 9.13 each profile carried its own `bandMinFrac`/`bandMaxFrac` of the
// mounted gun's reach — a stopgap so a band never parked a bot past a gun the
// twelfths ruler had shortened under radar; amendment 198 retired them. The
// plot horizon (utility.ts TARGET_HORIZON_FACTOR) stays on radar: it is
// intel, not reach.
//
// THE ODDS GATE'S FLAVOR (Story 9.13, epic-9 amendments 194–195): each row
// also carries the `oddsThreshold` the posture chain (ai/posture.ts oddsFor)
// must clear before it closes on a contact beyond its reach, `leansIn` (the
// raider and duelist close on slightly worse odds) and `holdsInCover` (siege
// and trapper lie in wait in fog or island shadow — amendments 199/202).
//
// THE HUMAN GETS NO SPECIAL WEIGHT (Eric ruling B3). `targetWeights.captain`
// covers human captains and other bots IDENTICALLY — a bot cannot even tell
// them apart, since both arrive as an ordinary `Contact` carrying a ship
// class. (The one kind distinction a profile drew — participant vs PvE fleet
// hull — retired with the fleet at Story 10.8.)

import { CONFIG, SHIFT_IDS, type EquipmentId, type Rng, type ShiftId, type ShipClassId } from '@salvo/shared';
import type { AnyProfileId, BotProfileId, TestProfileId } from './types.js';

/** How much a profile wants one KIND of target, relative to the others.
 *  `captain` is a multiplicative weight on the whole score; `damaged`
 *  and `isolated` are additive bonus coefficients on a 0..1 estimate. */
export interface BotTargetWeights {
  /** A participant hull — human captain or another bot, indistinguishable by
   *  ruling B3 and by construction. */
  captain: number;
  /** Coefficient on the 0..1 estimated-damage term (built from the bot's own
   *  self-private Hit Calls — see ai/utility.ts). */
  damaged: number;
  /** Coefficient on the 0..1 isolation term (no other tracked contact
   *  nearby). */
  isolated: number;
}

/**
 * A favorite UPGRADE line family (Eric ruling 2026-09-30, R5). The ship
 * ladders (ARMOR, POWER, ENGINES, INTEL, RELOAD) are named by their line id —
 * RUDDER left the catalog in Story 10.6 (Eric 2026-11-05, R2) and its favorite
 * with it; the Story 10.6 ladders (HULL REPAIR, SMOKE SCREEN — RANGE, the
 * third, left the catalog in Story 11.2, Eric 2026-11-12, R9) are
 * ship ladders too but no taste favors them (no new dial, I8). Story 10.3 (Eric 2026-11-04, epic-10 amendment 8) DELETED
 * `hullPoints` and `passiveHealing` and RENAMED `armorPiercing` -> `power`
 * (joined in 9.9, epic-9 amendment 157), `speed` -> `engines`, `turning` ->
 * `rudder`, `radarSweep` -> `intel`; `weapons` = a tier copy (2..cap) of an
 * equipment line the bot already holds (the spec's "Scorer definitions").
 * (`gun` — any deck-gun ladder — left with those ladders' reach on a captain,
 * Story 10.4; Story 10.12 deleted the dead favorite.)
 */
export type UpgradeFavorite =
  | 'armor'
  | 'power'
  | 'engines'
  | 'intel'
  | 'reload'
  | 'weapons';

/**
 * A personality's BUILD TASTE (Story 8.20, Eric ruling 2026-09-30, R5) — read
 * only by the card scorer (ai/spending.ts) against CONFIG.bots.cardPoints.
 * `style`: 'rounded' favors raising its lowest upgradeable line, 'specialist'
 * its highest. The favorites add points to a matching card; `favoriteWeapons`
 * decides among weapons for an empty family slot only. (`favoriteConsumables`
 * and `beltHunger` left with the kit, Story 10.5.)
 */
export interface BotTaste {
  style: 'rounded' | 'specialist';
  favoriteUpgrades: readonly UpgradeFavorite[];
  favoriteWeapons: readonly EquipmentId[];
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
   * confound in the survival data. (The harness-only 'gunFirst' mode died
   * with the deck-gun ladders' reach on a captain — Story 10.4.)
   */
  spend: 'weighted' | 'random';
  /** The build taste the 'weighted' scorer reads (see BotTaste). */
  taste: BotTaste;
  /** THE BAND NUDGE (Story 9.13, epic-9 amendment 198): a signed fraction of
   *  the mounted gun's reach by which this profile moves the gun's own
   *  doctrine band (CONFIG.bots.gunBand) in (−) or out (+). Read by
   *  ai/doctrine.ts; replaces the retired bandMinFrac/bandMaxFrac. */
  bandNudge: number;
  /** THE ODDS GATE's pass mark (amendment 195): the posture chain closes on a
   *  contact beyond its own reach only when ai/posture.ts oddsFor() reaches
   *  this. Higher = more cautious. */
  oddsThreshold: number;
  /** Leans in (amendment 194: raider and duelist): a failed gate still closes
   *  when the odds reach 0.75 of the threshold. */
  leansIn: boolean;
  /** Lies in wait (amendments 199/202: siege and trapper): with no target,
   *  a bot standing at its cover point HOLDS there at zero throttle. */
  holdsInCover: boolean;
  targetWeights: BotTargetWeights;
  /** hp fraction below which this profile breaks off. Defaults to
   *  CONFIG.bots.disengageHpFrac; overridden where the profile's identity
   *  demands it (bulwark trades far longer, raider leaves far earlier). Also
   *  the LATE repair style's press line (ai/abilities.ts) and the HEALTHY
   *  read (tacticKit.ts). (`healHpFrac`, the old one-line repair gate,
   *  retired with Story 10.12, R3.) */
  disengageHpFrac: number;
  /** WHEN HULL REPAIR IS PRESSED (Story 10.12, Eric 2026-11-11, R3) — read by
   *  ai/abilities.ts. 'early': the moment the whole heal of one press fits
   *  the missing hull with no waste. 'late': when the bot breaks off. */
  repairStyle: 'early' | 'late';
  /** DOES A TARGET PULL IT OFF A BEACON (Story 10.12, Eric 2026-11-11, R4) —
   *  read by ai/posture.ts. true: it leaves station to fight (raider,
   *  duelist). false: it stays parked in `farm`, collecting and shooting from
   *  where it sits. */
  contestsBeacon: boolean;
  /** THE FITTING SHIFT (Story 10.12, Eric 2026-11-11, R5): the Shift
   *  `rollShift` deals with probability CONFIG.bots.shiftFitWeight. */
  shiftFit: ShiftId;
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

/**
 * THE FIVE PROFILES. `Record<BotProfileId, BotProfile>` is the completeness
 * gate: BotProfileId is derived from CONFIG.bots.profiles, so adding a
 * profile id there without a row here fails to type-check right at this line.
 */
export const BOT_PROFILES: Readonly<Record<BotProfileId, BotProfile>> = Object.freeze({
  raider: {
    id: 'raider',
    spend: 'weighted',
    taste: {
      style: 'specialist',
      // 'power' (was 'armorPiercing') — epic-9 amendment 157 (Eric 2026-10-15);
      // ids renamed by Story 10.3 (Eric 2026-11-04, epic-10 amendment 8)
      favoriteUpgrades: ['engines', 'weapons', 'power'],
      favoriteWeapons: ['heavyTorpedo', 'lightTorpedo', 'supercavTorpedo'],
    },
    // Strikes from around half its gun's reach and does not loiter
    // inside knife range — the torpedo opener needs run-out room, and a TB
    // that stays close is in the fight it is trying to avoid.
    // (9.8 fractions retired by amendment 198: were 0.3–0.55)
    bandNudge: -0.05,
    oddsThreshold: 0.8,
    leansIn: true,
    holdsInCover: false,
    // Isolation and damage dominate: a raider picks off stragglers.
    targetWeights: { captain: 1.0, damaged: 1.6, isolated: 1.8 },
    disengageHpFrac: 0.5, // leaves EARLY — a hit torpedo boat is a dead one
    repairStyle: 'early',
    contestsBeacon: true,
    shiftFit: 'boost',
    // The opener weapon leads every tick; boost is spent eagerly on the way
    // out (the old usesBoost: true, now a number the ordering also reads).
    // The supercav torpedo reads as the row's torpedo (Story 10.12).
    appetite: { heavyTorpedo: 2.5, lightTorpedo: 2.5, supercavTorpedo: 2.5, boost: 2.0, instantReload: 2.0, hunker: 2.0 },
  },
  duelist: {
    id: 'duelist',
    spend: 'weighted',
    taste: {
      style: 'specialist',
      // 'power' (was 'armorPiercing') — epic-9 amendment 157 (Eric 2026-10-15);
      // ids renamed by Story 10.3 (Eric 2026-11-04, epic-10 amendment 8)
      // 'rudder' dropped with the RUDDER ladder (Story 10.6, Eric 2026-11-05, R2 / I8).
      // The dead 'gun' favorite deleted (Story 10.12).
      favoriteUpgrades: ['reload', 'power'],
      favoriteWeapons: ['heavyTorpedo', 'lightTorpedo', 'supercavTorpedo'],
    },
    // Knife range: inside 0.3 of gun reach the rear-quarter turn-fight is decided by
    // turning and gun cooldown, which is exactly where this profile wins.
    // (9.8 fractions retired by amendment 198: were 0.08–0.3)
    bandNudge: -0.1,
    oddsThreshold: 0.7,
    leansIn: true,
    holdsInCover: false,
    // Wants a PEER, and does not care whether it is hurt or alone.
    targetWeights: { captain: 1.4, damaged: 0.9, isolated: 0.5 },
    disengageHpFrac: 0.3,
    repairStyle: 'early',
    contestsBeacon: true,
    shiftFit: 'boost',
    // Gun-led by BAND, not by ordering: the tube is still tried first when a
    // credible opening exists (mid appetite), and the boost breaks a bad fight.
    appetite: { heavyTorpedo: 1.5, lightTorpedo: 1.5, supercavTorpedo: 1.5, boost: 1.5, instantReload: 1.5, hunker: 1.5 },
  },
  bulwark: {
    id: 'bulwark',
    spend: 'weighted',
    taste: {
      style: 'rounded',
      // 'armor' — epic-9 amendment 115 (Eric 2026-10-13). 'hullPoints' and
      // 'passiveHealing' (epic-9 amendment 97) left with their lines, Story
      // 10.3 (Eric 2026-11-04, epic-10 amendment 8).
      favoriteUpgrades: ['armor'],
      // The never-dealt 'broadside' deleted (Story 10.12); the FOULING and
      // FLASH shells read as the row's shells.
      favoriteWeapons: ['starShells', 'foulingShell', 'dazzleShells'],
    },
    // Holds ground at gun-trade range and refuses to be kited out of it.
    // (9.8 fractions retired by amendment 198: were 0.15–0.4)
    bandNudge: 0,
    oddsThreshold: 1.0,
    leansIn: false,
    holdsInCover: false,
    targetWeights: { captain: 1.2, damaged: 1.0, isolated: 0.4 },
    disengageHpFrac: 0.22, // trades far longer than any other profile
    repairStyle: 'early', // HP IS its plan
    contestsBeacon: false,
    shiftFit: 'hunker',
    // Bulwark CARRIES star shells and now genuinely uses them — reluctantly
    // (above neutral, below eager: it waits for a plot to go properly cold
    // before spending a 20s flare). The old usesStarShells: false was the
    // capability-keyed-by-hull defect the equipment axis retires.
    appetite: { starShells: 1.2, phosphorShells: 1.2, foulingShell: 1.2, dazzleShells: 1.2 },
  },
  siege: {
    id: 'siege',
    spend: 'weighted',
    taste: {
      style: 'specialist',
      favoriteUpgrades: ['weapons', 'intel'], // 'radarSweep' until Story 10.3
      // The never-dealt 'broadside' deleted (Story 10.12); the FOULING and
      // FLASH shells read as the row's shells.
      favoriteWeapons: ['starShells', 'phosphorShells', 'foulingShell', 'dazzleShells'],
    },
    // Standoff — RE-BANDED IN STORY 7-5 WAVE 2, forced by the weapon swap
    // rather than chosen: the old 0.55–0.95 band put the BROADSIDE BARRAGE
    // (then capped at the muzzle/smoke rung, 0.625 of the old radar) out of
    // range for most of its own preferred water. The band sits well inside
    // the mounted gun's reach (fractions of gun `rangeU` since Story 9.8,
    // ruling 126) — still the longest standoff of any profile, still
    // star-shell-led — and is a TUNING TARGET, not a ruling.
    // (9.8 fractions retired by amendment 198: were 0.4–0.6)
    bandNudge: 0.1,
    oddsThreshold: 1.0,
    leansIn: false,
    holdsInCover: true,
    targetWeights: { captain: 1.2, damaged: 1.1, isolated: 0.6 },
    disengageHpFrac: 0.4,
    repairStyle: 'late',
    contestsBeacon: false,
    shiftFit: 'instantReload',
    // EAGER flares (C2 — the BS DOES use star shells: the eager tier keeps
    // the shipped 1.5s staleness trigger); an acquired
    // mine stays at the neutral base, so siege lays only against something
    // CLOSING — never as trapper's standing plan. (The never-dealt
    // broadside's 2.2 deleted, Story 10.12.)
    appetite: { starShells: 2.4, phosphorShells: 2.4, foulingShell: 2.4, dazzleShells: 2.4 },
  },
  trapper: {
    id: 'trapper',
    spend: 'weighted',
    taste: {
      style: 'rounded',
      favoriteUpgrades: ['weapons', 'engines'], // 'speed' until Story 10.3
      favoriteWeapons: ['navalMines', 'captiveMines', 'foulingMines'],
    },
    // RE-BANDED OUTWARD (Eric ruling 2026-08-20, cycle 111): the old
    // 0.12–0.35 "fights near its own field" band was the closest in the game
    // and the A/B measured it as the death of the hull that most needs to
    // live to its payoff. The field does the close fighting now — mines are
    // laid PREPARED from safety (ai/equipment.ts) and a captive mine's 144u
    // trip does its own chasing — so the hull itself stands off at knife-to-
    // truesight range and breaks away sooner.
    // (9.8 fractions retired by amendment 198: were 0.25–0.5)
    bandNudge: 0.05,
    oddsThreshold: 1.1,
    leansIn: false,
    holdsInCover: true,
    targetWeights: { captain: 1.0, damaged: 1.0, isolated: 0.8 },
    disengageHpFrac: 0.45, // breaks off early — the trap fights on without it
    repairStyle: 'late',
    contestsBeacon: false,
    shiftFit: 'hunker',
    // EAGER mines — the standing plan (the old usesMinesProactively: true,
    // now the eager tier of the ONE shared mine tactic). (Its radar-buoy entry
    // went with the buoy in Story 8.16.)
    appetite: { navalMines: 2.6, captiveMines: 2.6, foulingMines: 2.6 },
  },
});

/**
 * THE THREE TEST-ONLY ROWS (Story 7-6 wave 4, ruled values) — the blind-vacuum
 * balance instrument, one per hull. Every number here is chosen so the read is
 * NOT shaped by a doctrine preference: no band nudge, a neutral odds
 * threshold (1.0), no lean-in, no hold (Story 9.13 — the band 0.15–0.55 they
 * carried until amendment 198 retired the fractions), flat target weights, CONFIG
 * default disengage, the EARLY repair style (Story 10.12: the no-waste press
 * reads only the hull's own folded heal — no profile line), contesting a
 * beacon (the chain as it stood before Story 10.12) and SPEED BOOST as the
 * fitting Shift (the DEFAULT_SHIFT — a row has to name one; the harness deals
 * a test row's Shift by the same weighted roll unless `--shift` forces one),
 * EVERY appetite entry at or above APPETITE_EAGER (2)
 * so every equipment verb is exercised (the guns — main battery, machine gun,
 * flak — sit at exactly 2, still the lowest entries, preserving the universal
 * fallback ordering without ever dropping below the ruled floor; Story 10.12
 * dropped the dead deck `gun` and the never-dealt `broadside` and added the
 * SUPERCAV torpedo, FOULING and FLASH shells at the table's 2.2), and
 * `spend: 'random'` so card performance
 * is measured with the picker's taste removed.
 *
 * SEPARATE ID SPACE, ON PURPOSE (safety, not style): these ids are NOT in
 * CONFIG.bots.profiles, which is the ONLY table the in-game enrollment roll
 * draws from — so ArenaRoom.buildBotFleet can never deal one to a real
 * player's Solo vs AI opponents. They are reachable solely through the
 * explicit profile override the batch-sim harness passes to world.addBot.
 */
const TEST_APPETITE: Readonly<Partial<Record<EquipmentId, number>>> = Object.freeze({
  machineGun: 2.0,
  flak: 2.0,
  mainBattery: 2.0,
  heavyTorpedo: 2.2,
  lightTorpedo: 2.2,
  supercavTorpedo: 2.2,
  navalMines: 2.2,
  captiveMines: 2.2,
  foulingMines: 2.2,
  boost: 2.2,
  instantReload: 2.2,
  hunker: 2.2,
  starShells: 2.2,
  phosphorShells: 2.2,
  foulingShell: 2.2,
  dazzleShells: 2.2,
});

/** A neutral taste for the test rows — never read (they spend at random), but
 *  every row carries one so BotProfile stays a single shape. */
const TEST_TASTE: BotTaste = Object.freeze({
  style: 'rounded',
  favoriteUpgrades: [],
  favoriteWeapons: [],
});

const testRow = (id: TestProfileId): BotProfile => ({
  id,
  spend: 'random',
  taste: TEST_TASTE,
  bandNudge: 0,
  oddsThreshold: 1.0,
  leansIn: false,
  holdsInCover: false,
  targetWeights: { captain: 1.0, damaged: 1.0, isolated: 1.0 },
  disengageHpFrac: DEFAULT_DISENGAGE,
  repairStyle: 'early',
  contestsBeacon: true,
  shiftFit: 'boost',
  appetite: { ...TEST_APPETITE },
});

/** `Record<TestProfileId, …>` is the same completeness gate BOT_PROFILES
 *  uses: a new test id in types.ts cannot ship without a row here. */
export const TEST_PROFILES: Readonly<Record<TestProfileId, BotProfile>> = Object.freeze({
  randomYamato: testRow('randomYamato'),
  randomBismarck: testRow('randomBismarck'),
  randomWarspite: testRow('randomWarspite'),
  randomIowa: testRow('randomIowa'),
});

/** THE TEST ROWS STAY HULL-BOUND (Story 8.20): the harness's
 *  `--bot-profile random*` contract is one row per hull, so a forced test row
 *  still governs its bot's hull. The five in-game personalities have none. */
export const TEST_PROFILE_HULL: Readonly<Record<TestProfileId, ShipClassId>> = Object.freeze({
  randomYamato: 'yamato',
  randomBismarck: 'bismarck',
  randomWarspite: 'warspite',
  randomIowa: 'iowa',
});

/** True iff `id` is one of the test-only rows (one per hull, Story 10.4). */
export function isTestProfileId(id: AnyProfileId): id is TestProfileId {
  return Object.hasOwn(TEST_PROFILES, id);
}

/** The hull a FORCED profile binds its bot to: a test row's hull, or null for
 *  an in-game personality (which never decides the hull — the rolled or
 *  caller-passed hull stands). */
export function testProfileHull(id: AnyProfileId): ShipClassId | null {
  return isTestProfileId(id) ? TEST_PROFILE_HULL[id] : null;
}

/** The test ids in hull-class order (SHIP_CLASS_IDS) — the harness's
 *  round-robin deal order for `--bot-profile random`. */
export const TEST_PROFILE_IDS: readonly TestProfileId[] = Object.freeze([
  'randomYamato',
  'randomBismarck',
  'randomWarspite',
  'randomIowa',
]);

/** The profile table for an id — in-game or test-only. Total by construction
 *  (AnyProfileId is exactly the union of the two Records' key sets), so no
 *  fallback is needed or offered. */
export function profileOf(id: AnyProfileId): BotProfile {
  return Object.hasOwn(BOT_PROFILES, id)
    ? BOT_PROFILES[id as BotProfileId]
    : TEST_PROFILES[id as TestProfileId];
}

/**
 * THE WEIGHTED SHIFT ROLL (Story 10.12, Eric 2026-11-11, epic-10 amendment
 * 21, R5): the profile's fitting Shift with probability
 * CONFIG.bots.shiftFitWeight, else one of the OTHER Shifts uniformly. ONE
 * draw off `rng`: a draw under the weight deals the fit; the rest of the unit
 * interval is cut into equal parts, one per other Shift (SHIFT_IDS order).
 * Pure over the injected stream.
 */
export function rollShift(profile: Pick<BotProfile, 'shiftFit'>, rng: Pick<Rng, 'next'>): ShiftId {
  const w = CONFIG.bots.shiftFitWeight;
  const u = rng.next();
  if (u < w) return profile.shiftFit;
  const others = SHIFT_IDS.filter((id) => id !== profile.shiftFit);
  const k = Math.floor(((u - w) / (1 - w)) * others.length);
  return others[Math.min(others.length - 1, Math.max(0, k))];
}
