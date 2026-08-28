// The in-process batch runner (spec task: the engine, amendment 54).
//
// THE RUNNER SEAM (AR12): one match = build lobby -> drive to finished ->
// collect stats. World + Match are Colyseus-free and wall-clock-free, so the
// harness constructs them DIRECTLY (the drones.test.ts fillingHooks pattern):
// no sockets, no rooms, no frame/perception builds anywhere in the hot loop —
// the loop is exactly `controls(); world.step(); match.update(); observe()`.
// The later load-test duty reuses runMatch with a different ControlFactory
// (see controls.ts) and its own collectors; nothing here knows what a control
// is beyond the CaptainControl interface.
//
// Determinism: matchSeed = mixSeed(runSeed, matchIndex); every stream in the
// match (map, spawns, drones, decks, controls) derives from it. No Math.random,
// no Date.now — wall-clock metadata lives in main.ts, outside the run key.
//
// Timings: production CONFIG.match values EXCEPT a short 1000ms countdown,
// minHumans=1, and joinWindowMs=0. Documented choice: the economy only accrues
// in the ACTIVE phase (xpEnabled), so the 15s production countdown — and the
// 30s gathering join window, which only matters to real sockets piling into a
// room — would only burn batch budget in the ready room where nothing
// measurable happens; minHumans=1 lets the scripted-captain lobby arm without
// a second "human". All three ride the same MatchTimings dev seam the
// drone/solo tests use — no production code changes.

import {
  BOON_CATALOG,
  CONFIG,
  SHIP_CLASS_IDS,
  zoneClosedAtMs,
  zoneGroups,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord } from '../../src/game/world.js';
import { Match, type MatchEndCause, type MatchHooks, type MatchTimings } from '../../src/game/match.js';
import { isFleetHull } from '../../src/game/participants.js';
import { CONTROL_REGISTRY, type CaptainControl, type ControlFactory } from './controls.js';
import { BOT_PROFILE_SCHEME } from './args.js';
import { TEST_PROFILE_IDS } from '../../src/game/ai/profiles.js';
import type { BotEngageGate, TestProfileId } from '../../src/game/ai/types.js';
import { BotCollector, type BotSample } from './botMetrics.js';
import { CatalogCollector, type CatalogSample } from './catalogMetrics.js';
import { mixSeed, tally } from './stats.js';

/** ms of sim time each level-curve sample bucket spans. */
export const LEVEL_SAMPLE_MS = 30000;
/** Time-to-N-boons is tracked for N = 1..BOON_N_MAX. */
export const BOON_N_MAX = 10;
/** Sim-time slack past the storm timeline before a match is declared UNRESOLVED
 *  (see runMatch — the sample is still collected honestly, never thrown away). */
const ENDGAME_SLACK_MS = 600000;
/** Documented short countdown (see module header). */
const COUNTDOWN_MS = 1000;
/** mixSeed ordinal BAND reserved for a match's per-ring zone seeds (ordinal +
 *  ring index; captains use 0x100 + i — keep this band outside any
 *  roster-sized range). */
const ZONE_SEED_ORDINAL = 0x7a0e;

export interface RunSpec {
  seed: number;
  matches: number;
  captains: number;
  /**
   * COMBAT BOTS in the lobby (Story 6.4, wave 4). Deliberately NOT a control:
   * bots drive themselves from World's `botsTick` STEP_ORDER row, so the lobby
   * only has to CONSTRUCT them (world.addBot()) and the per-tick control loop
   * stays empty for them. Default 0 => every existing run key is byte-identical.
   */
  bots?: number;
  /**
   * TEST-ONLY profile forcing (Story 7-6 wave 4): a TestProfileId forces every
   * bot onto that row; the 'random' scheme deals the three test rows
   * round-robin (TB, BS, ML). Validated upstream by args.ts — only test ids
   * ever arrive here, so the in-game rolled path (undefined) is the only way
   * an in-game profile is assigned. A forced profile governs the hull, so
   * addBot is called with the profile alone.
   */
  botProfile?: string;
  /** The controller-level engage gate; default 'always' (shipped behaviour). */
  botEngage?: BotEngageGate;
  /** SPEND MODE (balance campaign, 2026-08-24): 'random' makes every rolled
   *  in-game profile keep its temperament but pick cards uniformly at random
   *  (BotController.spend — the engage-gate seam's sibling). Default
   *  undefined = 'profile', the shipped weighted policy, byte-identical. */
  botSpend?: 'profile' | 'random';
  /** Force every rolled-path bot's hull (mono-class arms with tuned
   *  temperaments); profiles still roll among that hull's own rows. args.ts
   *  refuses the combinations this would contradict (--bot-profile, --roster
   *  even). */
  botHull?: ShipClassId;
  /** Scripted captain control factory; defaults to the storm-pacing pacifist
   *  (CONTROL_REGISTRY.pacifist — the only row there is). */
  control?: ControlFactory;
  /**
   * LOBBY HULL POLICY (see rotate/botHull). 'rolled' — the default and the
   * shipped behaviour — lets each bot roll its own class off the controller's
   * stream, and deals captains the un-offset `i % 3` rotation they have always
   * had. 'even' deals SHIP_CLASS_IDS round-robin across BOTH halves of the
   * lobby, OFFSET BY MATCH INDEX, so per-class win share measures balance
   * rather than representation.
   *
   * THE GUARANTEE, exactly: within one match the per-class spread is at most 1
   * (it cannot be better — 20 hulls over 3 classes is 7/7/6). Campaign totals
   * are EXACTLY even when the match count or the hull count is a multiple of 3;
   * otherwise the offset carries the shortfall around the classes and the
   * totals land within one hull per class (e.g. 20 bots x 4 matches = 27/27/26,
   * and at --matches 1 the offset buys nothing at all: 7/7/6).
   *
   * Undefined => 'rolled' => every existing run key is byte-identical.
   */
  roster?: 'even' | 'rolled';
}

/** The forced test profile for bot ordinal `i` of match `matchIndex`, or
 *  undefined for the shipped rolled path. Pure so the deal order is part of
 *  the reproducible run key.
 *
 *  THE `+ matchIndex` OFFSET IS THE SAME FIX `rotate()` CARRIES for --roster
 *  even (balance campaign, 2026-08-24): a forced test profile governs the
 *  hull, so without the offset a 20-bot `--bot-profile random` lobby deals
 *  7/7/6 with the SAME class short in every match — the exact representation
 *  artefact the even roster exists to remove, reproduced on the one path
 *  --roster even cannot reach. This CHANGES the deal for pre-existing
 *  `--bot-profile random` run keys (a measurement-validity fix, documented
 *  here rather than hidden behind a flag); a NAMED forced profile is
 *  offset-invariant and every such run key is byte-identical. */
export function botProfileFor(
  spec: Pick<RunSpec, 'botProfile'>,
  i: number,
  matchIndex = 0,
): TestProfileId | undefined {
  if (spec.botProfile === undefined) return undefined;
  if (spec.botProfile === BOT_PROFILE_SCHEME) {
    return TEST_PROFILE_IDS[(i + matchIndex) % TEST_PROFILE_IDS.length];
  }
  return spec.botProfile as TestProfileId;
}

/** THE BOT LOBBY (Story 6.4 wave 4; profile/engage forcing in 7-6 wave 4) —
 *  construction IS the whole job: addBot() enrolls off the controller's own
 *  seeded stream and the brain drives itself from World's `botsTick` row.
 *  The engage gate is set BEFORE any tick runs, so a gated lobby never fires
 *  a single pre-endgame shot; default undefined leaves the shipped 'always'. */
function buildBotLobby(world: World, spec: RunSpec, botCount: number, index: number): string[] {
  if (spec.botEngage !== undefined) world.bots.engage = spec.botEngage;
  // BEFORE any enrollment — the mode is stamped onto each mind at enroll.
  if (spec.botSpend !== undefined) world.bots.spend = spec.botSpend;
  const ids: string[] = [];
  for (let i = 0; i < botCount; i += 1) {
    const profile = botProfileFor(spec, i, index);
    // WHICH DEALER WINS THE HULL. A forced TEST profile is per-hull
    // (randomTorpedoBoat / randomBattleship / randomMineLayer), so it governs
    // the class and the roster policy must not fight it — passing a hull too
    // would let `--roster even` silently put a randomMineLayer row on a
    // battleship. On the rolled path (no forcing) a forced --bot-hull beats
    // the roster deal (args.ts refuses the ambiguous combinations), else the
    // roster policy deals as it does for captains.
    ids.push(world.addBot(profile === undefined ? (spec.botHull ?? botHull(spec, index, i)) : undefined, profile).id);
  }
  return ids;
}

export interface ReachSample {
  s: number; // sim-seconds since activation
  level: number; // the captain's level at the moment
}

export interface CaptainSample {
  id: string;
  cls: string;
  finalLevel: number;
  kills: number;
  deaths: number;
  picks: number;
  boonsFitted: number;
  deckRemaining: number;
  cappedLines: number;
  /** boonTimesS[n-1] = sim-seconds to the n-th fitted boon (null = never). */
  boonTimesS: (number | null)[];
  firstExclusiveOffered: ReachSample | null;
  firstExclusiveFitted: ReachSample | null;
  /** Story 7-5: the same two reaches over DOCTRINE lines (see isDoctrineId). */
  firstDoctrineOffered: ReachSample | null;
  firstDoctrineFitted: ReachSample | null;
  /** levelCurve[k] = level at k*LEVEL_SAMPLE_MS since activation. */
  levelCurve: number[];
}

/**
 * How a harness match concluded: a real MatchEndCause, or 'unresolved' — the
 * tick budget (full storm timeline + endgame slack) elapsed with the match
 * still active. Unresolved matches are COLLECTED, not failed (Story 3.1): the
 * pacifist control's whole point is to run the full ring rhythm, and until
 * Story 3.4's endgame guarantee lands, mutual avoidance at the terminal ring
 * is a real, reportable outcome — the endedBy split keeps it visible.
 */
export type HarnessEndCause = MatchEndCause | 'unresolved';

export interface MatchSample {
  index: number;
  seed: number;
  durationS: number;
  endedBy: HarnessEndCause;
  /** Hull class of the winning captain, or null when there is no winner (an
   *  'unresolved' cap-out, or a conclusion with no surviving winner). Story
   *  3.4 evidence: a resolved endgame match must name a real winner class. */
  winnerClass: string | null;
  stormDeaths: number;
  /** Victims of CAPTAIN killers, by tier: captain / droneSmall / droneMedium / droneLarge. */
  killsByVictimTier: Record<string, number>;
  /** Captains still in world.ships at the finish — the ONLY rows that feed the
   *  per-captain aggregates (see departedCaptains). */
  captains: CaptainSample[];
  /** Captain ids whose ship was gone at collection time (Match.onPlayerLeave
   *  removes the ship). Today's scripted control never leaves, so this is
   *  always empty; it exists so a leave-capable control cannot crash the batch, and so
   *  the exclusion is REPORTED rather than silent. */
  departedCaptains: string[];
  /** One row per COMBAT BOT in the lobby (Story 6.4, wave 4). OPTIONAL for the
   *  same reason `departedCaptains` is read defensively in report.ts: sample
   *  literals predating the field exist in the harness's own tests, and a bots=0
   *  run has nothing to say here. Read it as `?? []`. */
  bots?: BotSample[];
  /** The per-line catalog + ordnance + guardrail ledger (Story 7-5 evidence
   *  pass). OPTIONAL for the same reason `bots` is: sample literals predating
   *  the field exist in the harness's own tests. Read it defensively. */
  catalog?: CatalogSample;
}

export interface BatchResult {
  matches: MatchSample[];
  failures: { index: number; seed: number; error: string }[];
}

const isExclusiveId = (id: string): boolean => BOON_CATALOG[id]?.rarity === 'exclusive';

/** A DOCTRINE line — a card carrying a `doctrine` effect (Story 7-5 evidence
 *  pass). The `exclusive` RARITY is extinct as of Story 7-5 wave 2 (R2.6
 *  deleted exclusivity outright), so both `firstExclusive*` rows above now read
 *  0% structurally and no longer answer "how long until a build commits". These
 *  two rows are their honest replacement: a doctrine is still the shape-changing
 *  pick, it is just an ordinary `rare` now, and doctrines STACK. */
const isDoctrineId = (id: string): boolean =>
  BOON_CATALOG[id]?.effects.some((e) => e.kind === 'doctrine') ?? false;

/** Lines whose fitted stack has physically consumed every copy in the catalog. */
function cappedLineCount(boons: readonly string[]): number {
  let capped = 0;
  for (const [id, n] of tally(boons)) {
    const def = BOON_CATALOG[id];
    if (def !== undefined && n >= def.copies) capped += 1;
  }
  return capped;
}

/** Per-captain progression tracking over the active phase. */
class CaptainTracker {
  readonly boonTimesS: (number | null)[] = new Array<number | null>(BOON_N_MAX).fill(null);
  firstExclusiveOffered: ReachSample | null = null;
  firstExclusiveFitted: ReachSample | null = null;
  firstDoctrineOffered: ReachSample | null = null;
  firstDoctrineFitted: ReachSample | null = null;
  readonly levelCurve: number[] = [];
  picks = 0;

  observe(ship: ShipRecord, tS: number): void {
    for (let n = 0; n < BOON_N_MAX; n += 1) {
      if (this.boonTimesS[n] === null && ship.boons.length >= n + 1) this.boonTimesS[n] = tS;
    }
    const offer = ship.offer ?? [];
    const at = { s: tS, level: ship.level };
    this.firstExclusiveOffered = firstReach(this.firstExclusiveOffered, offer.some(isExclusiveId), at);
    this.firstExclusiveFitted = firstReach(this.firstExclusiveFitted, ship.boons.some(isExclusiveId), at);
    this.firstDoctrineOffered = firstReach(this.firstDoctrineOffered, offer.some(isDoctrineId), at);
    this.firstDoctrineFitted = firstReach(this.firstDoctrineFitted, ship.boons.some(isDoctrineId), at);
  }
}

/** Latch a reach sample the first time its predicate holds (never re-stamps). */
function firstReach(cur: ReachSample | null, hit: boolean, at: ReachSample): ReachSample | null {
  if (cur !== null || !hit) return cur;
  return at;
}

/** Per-match stats collection: tick events + captain trackers + level curve.
 *  Exported only for the capSample pin (see capSample). */
export class MatchCollector {
  readonly killsByVictimTier: Record<string, number> = {};
  private readonly trackers = new Map<string, CaptainTracker>();
  private nextBucket = 0;

  constructor(captainIds: readonly string[]) {
    for (const id of captainIds) this.trackers.set(id, new CaptainTracker());
  }

  observe(world: World, match: Match): void {
    if (match.activatedAt === 0) return;
    const elapsedMs = world.now - match.activatedAt;
    const tS = elapsedMs / 1000;
    this.consumeEvents(world);
    for (const [id, tracker] of this.trackers) {
      const ship = world.ships.get(id);
      if (ship) tracker.observe(ship, tS);
    }
    while (elapsedMs >= this.nextBucket * LEVEL_SAMPLE_MS) {
      for (const [id, tracker] of this.trackers) {
        tracker.levelCurve.push(world.ships.get(id)?.level ?? 0);
      }
      this.nextBucket += 1;
    }
  }

  private consumeEvents(world: World): void {
    for (const e of world.tickEvents) {
      if (e.k === 'bn') this.recordPick(e.id);
      else if (e.k === 'sunk' && e.by !== undefined) this.recordKill(world, e.by, e.id);
    }
  }

  private recordPick(id: string): void {
    const t = this.trackers.get(id);
    if (t) t.picks += 1;
  }

  /** Tally a CAPTAIN's kill by victim tier (drone killers cannot happen —
   *  drones are weaponless — but stay fail-closed on the lookup anyway). */
  private recordKill(world: World, by: string, victimId: string): void {
    const killer = world.ships.get(by);
    const victim = world.ships.get(victimId);
    if (!killer || isFleetHull(killer) || !victim) return;
    const tier = isFleetHull(victim) ? victim.hullId : 'captain';
    this.killsByVictimTier[tier] = (this.killsByVictimTier[tier] ?? 0) + 1;
  }

  captainSample(ship: ShipRecord): CaptainSample {
    const t = this.trackers.get(ship.id)!;
    return {
      id: ship.id,
      cls: ship.hullId,
      finalLevel: ship.level,
      kills: ship.kills,
      deaths: ship.deaths,
      picks: t.picks,
      boonsFitted: ship.boons.length,
      deckRemaining: ship.deck.cards.length,
      cappedLines: cappedLineCount(ship.boons),
      boonTimesS: t.boonTimesS,
      firstExclusiveOffered: t.firstExclusiveOffered,
      firstExclusiveFitted: t.firstExclusiveFitted,
      firstDoctrineOffered: t.firstDoctrineOffered,
      firstDoctrineFitted: t.firstDoctrineFitted,
      levelCurve: t.levelCurve,
    };
  }
}

/** Inert lobby hooks. The round-robin drone fill they used to carry died
 *  with the fill itself (Story 5.6, amendment 41) — the harness's committed
 *  drone-lobby tuning method loses its implementation with it, homed at Epic
 *  6's combat bots (see deferred-work.md). */
function harnessHooks(): MatchHooks {
  return {
    lock: () => {},
    unlock: () => {},
    broadcastResults: () => {},
    // The amendment-15 requeue signal: inert here — the harness has no queue
    // to return anyone to, and it never drives the sealed-collapse branch.
    requeue: () => {},
    disconnect: () => {},
  };
}

/**
 * The hull for lobby slot `i` of match `index`.
 *
 * `undefined` under the default 'rolled' policy — passing undefined to
 * World.addBot is behaviourally identical to omitting the argument (the roll
 * comes off the same stream position), so the default run key is unchanged.
 *
 * THE `+ index` OFFSET IS LOAD-BEARING under 'even': 20 bots over 3 classes is
 * 7/7/6 at best, so without rotating by match index the SAME class is short in
 * every match and a campaign stays ~14% skewed — which is precisely the
 * representation artefact the even roster exists to remove.
 */
/** THE ONE ROUND-ROBIN DEAL, shared by both halves of the lobby: slot `i` of
 *  the SHIP_CLASS_IDS rotation, started at `offset`. A match-index offset is
 *  what makes the campaign totals even — without it the SAME class is short in
 *  every match and a 20-hull lobby stays ~14% skewed forever, which is the
 *  representation artefact --roster even exists to remove. */
function rotate(offset: number, i: number): ShipClassId {
  return SHIP_CLASS_IDS[(i + offset) % SHIP_CLASS_IDS.length];
}

/** The rotation offset for this match: the match index under 'even', and ZERO
 *  under 'rolled' — which is what keeps the captain deal (`i % 3`, dealt since
 *  the harness shipped) byte-identical on every pre-existing run key. */
function rosterOffset(spec: RunSpec, index: number): number {
  return spec.roster === 'even' ? index : 0;
}

function botHull(spec: RunSpec, index: number, i: number): ShipClassId | undefined {
  if (spec.roster !== 'even') return undefined;
  return rotate(index, i);
}

/** Run ONE match and collect its sample: to `finished`, or to the tick budget
 *  (full storm timeline via the shared zoneClosedAtMs + endgame slack), which
 *  collects an honest endedBy 'unresolved' sample instead. Throws only on the
 *  structural impossibility of a match that never even ACTIVATED in budget. */
export function runMatch(index: number, spec: RunSpec): MatchSample {
  const matchSeed = mixSeed(spec.seed, index);
  const botCount = spec.bots ?? 0;
  const playerCap = Math.max(CONFIG.map.playerCap, spec.captains + botCount);
  // zoneSeeds: production rooms roll independent per-ring nonces (amendment
  // 10); the harness instead derives one per ring from the match seed on its
  // own ordinal band so ring rolls are part of the reproducible run key
  // (byte-identical reruns). Server-side only — nothing rides a wire, so the
  // derivation leaks nothing.
  const zoneSeeds = Array.from({ length: zoneGroups(CONFIG.zone) }, (_, i) => mixSeed(matchSeed, ZONE_SEED_ORDINAL + i));
  const world = new World(matchSeed, playerCap, CONFIG.zone, { zoneSeeds });
  const timings: MatchTimings = {
    countdownMs: COUNTDOWN_MS,
    resultsMs: CONFIG.match.resultsSeconds * 1000,
    // No gathering window in the harness (see module header): the lobby is
    // fully scripted, so the 30s socket-pile-in window is pure budget burn.
    joinWindowMs: 0,
    // CAVEAT: production is CONFIG.match.minHumans = 2. A `--captains 1` run
    // therefore models the FUTURE solo-vs-AI shape (Epic 6) / this dev seam,
    // NOT a lobby that ships today — a real solo captain never leaves the
    // weapons-safe ready room. Read 1vN rows as forward-looking, not current.
    // SINCE AMENDMENT 4 a `--captains 1 --bots 0` run is DEGENERATE: drones
    // no longer gate the win, so the lone captain wins on the activation tick
    // and the sample carries no combat at all. A `--captains 1 --bots N` run
    // is NOT (Story 6.4): bots are participants, so the match runs and the
    // fighting is real — that IS the solo-vs-AI shape. Story 6-5 still owes
    // the ratified termination rule; until then, batch COMBAT evidence needs
    // >= 1 bot in the lobby (the scripted control never fires).
    //
    // A BOT-ONLY LOBBY NEEDS ZERO (wave 4). `humanCount()` counts role
    // 'captain' ONLY — by design, FR34 — so a `--captains 0 --bots N` run would
    // sit in `waiting` forever at minHumans 1, and every bot metric would then
    // be measured on a match that never started (World respawns in the waiting
    // phase, so kills and deaths would be nonsense). 0 is the honest minimum
    // for a lobby with no people in it, and it changes nothing for a run that
    // has captains.
    minHumans: spec.captains > 0 ? 1 : 0,
  };
  const match = new Match(world, timings, harnessHooks());
  const factory = spec.control ?? CONTROL_REGISTRY.pacifist;
  const controls: CaptainControl[] = [];
  const captainIds: string[] = [];
  // CAPTAINS TAKE THE SAME ROTATION AS THE BOTS under 'even'. Dealing them the
  // un-offset `i % 3` while the bots rotate leaves the captain half of a mixed
  // lobby (`--captains 2 --bots 18`) short the SAME class in every single
  // match — the exact representation artefact the flag exists to remove, and
  // it matters because BatchAggregate.winnerClass pools captains and bots into
  // one tally. Under 'rolled' rosterOffset is 0, so this line deals exactly
  // what it always dealt.
  const offset = rosterOffset(spec, index);
  for (let i = 0; i < spec.captains; i += 1) {
    const id = `cap-${i + 1}`;
    captainIds.push(id);
    world.addShip(id, `CAP-${String(i + 1).padStart(2, '0')}`, 'captain', rotate(offset, i));
    controls.push(factory(id, mixSeed(matchSeed, 0x100 + i)));
  }
  // THE BOT LOBBY — see buildBotLobby: there is no bot control and nothing
  // bot-shaped in the per-tick loop below. The roster policy deals the hull
  // and the test rig deals the profile; buildBotLobby resolves which wins.
  const botIds = buildBotLobby(world, spec, botCount, index);
  match.notifyRosterChanged();
  const collector = new MatchCollector(captainIds);
  const bots = new BotCollector(botIds);
  const catalog = new CatalogCollector();
  // Tick budget from the SHARED time-to-closed helper: the full phased
  // timeline (12:00 at production CONFIG — ~14400 ticks) + countdown + endgame
  // slack. Honest but bounded: a full control run fits comfortably; nothing
  // spins forever on a degenerate override (zoneClosedAtMs fails closed to 0).
  const tickCap = Math.ceil((COUNTDOWN_MS + zoneClosedAtMs(CONFIG.zone) + ENDGAME_SLACK_MS) / CONFIG.tick.simDtMs);
  for (let tick = 0; tick < tickCap; tick += 1) {
    for (const c of controls) c.tick(world);
    world.step();
    match.update();
    collector.observe(world, match);
    bots.observe(world, match.activatedAt);
    catalog.observe(world, match.activatedAt !== 0);
    if (match.phase === 'finished') return finishSample(index, matchSeed, world, match, collector, captainIds, bots, catalog);
  }
  if (match.activatedAt === 0) {
    throw new Error(`match ${index} (seed ${matchSeed}) never activated within ${tickCap} ticks`);
  }
  return capSample(index, matchSeed, world, match, collector, captainIds, bots, catalog);
}

/**
 * The at-cap classification (review FIX 5): a match that GENUINELY concluded
 * at the budget edge keeps its real cause — 'unresolved' is only for a match
 * still contested at the cap. Today the in-loop finished-check returns on the
 * very tick finish() flips the phase, so runMatch reaches this only for
 * unfinished matches; the guard exists (and is pinned by a direct test) so no
 * future reordering of the loop can mislabel a real conclusion as unresolved.
 * Exported for that pin only.
 */
export function capSample(
  index: number,
  seed: number,
  world: World,
  match: Match,
  collector: MatchCollector,
  captainIds: readonly string[],
  bots?: BotCollector,
  catalog?: CatalogCollector,
): MatchSample {
  if (match.phase === 'finished') return finishSample(index, seed, world, match, collector, captainIds, bots, catalog);
  return unresolvedSample(index, seed, world, match, collector, captainIds, bots, catalog);
}

/** DEPARTED CAPTAINS: a captain's ship is gone from world.ships if the match
 *  ended through Match.onPlayerLeave (the quit-out path — it calls
 *  world.removeShip). The end-of-match sample must not assume presence.
 *  RULING (minimal honest option): a departed captain is RECORDED by id and
 *  EXCLUDED from the per-captain rows. The alternative — reconstructing a row
 *  from the Match participant snapshot — would emit final-level / deck /
 *  boon numbers that Match never snapshots (it keeps only name/kills/damage),
 *  i.e. fabricated economy evidence. An honest omission beats an invented row;
 *  the id list keeps the omission visible. */
function finishSample(
  index: number,
  seed: number,
  world: World,
  match: Match,
  collector: MatchCollector,
  captainIds: readonly string[],
  bots?: BotCollector,
  catalog?: CatalogCollector,
): MatchSample {
  const summary = match.endSummary();
  return buildSample(index, seed, world, match, collector, captainIds, bots, catalog, {
    durationS: summary.durationS,
    endedBy: summary.endedBy,
    // Keep the field HONEST: match.ts today emits `?.hullId ?? null`, so ''
    // is unreachable — this '' collapse is a defensive guard against a FUTURE
    // '' emitter, not a current contract; an empty string is not a class, so
    // it collapses to null same as the real null case.
    winnerClass: summary.winnerClass === null || summary.winnerClass === '' ? null : summary.winnerClass,
    stormDeaths: summary.stormDeaths,
  });
}

/** The tick-budget outcome: the match is still 'active', so endSummary would
 *  report zeros — duration is measured directly and endedBy is the honest
 *  harness-only 'unresolved' (see HarnessEndCause). Captain economy rows are
 *  collected exactly like a finished match: for the pacifist control these
 *  full-timeline rows ARE the evidence. */
function unresolvedSample(
  index: number,
  seed: number,
  world: World,
  match: Match,
  collector: MatchCollector,
  captainIds: readonly string[],
  bots?: BotCollector,
  catalog?: CatalogCollector,
): MatchSample {
  const durationS = Math.round((world.now - match.activatedAt) / 100) / 10;
  return buildSample(index, seed, world, match, collector, captainIds, bots, catalog, {
    durationS,
    endedBy: 'unresolved',
    // No conclusion => no winner, ever. Never borrow a class from the roster.
    winnerClass: null,
    stormDeaths: match.endSummary().stormDeaths,
  });
}

/** The outcome fields a sample carries beyond its collected economy rows. */
interface SampleOutcome {
  durationS: number;
  endedBy: HarnessEndCause;
  winnerClass: string | null;
  stormDeaths: number;
}

function buildSample(
  index: number,
  seed: number,
  world: World,
  match: Match,
  collector: MatchCollector,
  captainIds: readonly string[],
  bots: BotCollector | undefined,
  catalog: CatalogCollector | undefined,
  outcome: SampleOutcome,
): MatchSample {
  const captains: CaptainSample[] = [];
  const departedCaptains: string[] = [];
  for (const id of captainIds) {
    const ship = world.ships.get(id);
    if (ship === undefined) departedCaptains.push(id);
    else captains.push(collector.captainSample(ship));
  }
  return {
    index,
    seed,
    durationS: outcome.durationS,
    endedBy: outcome.endedBy,
    winnerClass: outcome.winnerClass,
    stormDeaths: outcome.stormDeaths,
    killsByVictimTier: collector.killsByVictimTier,
    // Match.placements is only computed at finish — on an 'unresolved' sample
    // it is empty and every bot's placement honestly reads null.
    bots: bots?.samples(world, match.placements) ?? [],
    catalog: catalog?.result(),
    captains,
    departedCaptains,
  };
}

/** Run the whole batch; per-match failures are recorded and skipped (spec).
 *  `onMatchDone` is a progress hook (stderr logging lives in main). */
export function runBatch(spec: RunSpec, onMatchDone?: (i: number) => void): BatchResult {
  const result: BatchResult = { matches: [], failures: [] };
  for (let i = 0; i < spec.matches; i += 1) {
    try {
      result.matches.push(runMatch(i, spec));
    } catch (err) {
      result.failures.push({ index: i, seed: mixSeed(spec.seed, i), error: (err as Error).message });
    }
    onMatchDone?.(i);
  }
  return result;
}
