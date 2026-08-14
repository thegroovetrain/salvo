// The in-process batch runner (spec task: the engine, amendment 54).
//
// THE RUNNER SEAM (AR12): one match = build lobby -> drive to finished ->
// collect stats. World + Match are Colyseus-free and wall-clock-free, so the
// harness constructs them DIRECTLY (the drones.test.ts fillingHooks pattern):
// no sockets, no rooms, no frame/perception builds anywhere in the hot loop —
// the loop is exactly `pilots(); world.step(); match.update(); observe()`.
// The later load-test / bot-vs-bot duties reuse runMatch with a different
// PilotFactory (see pilots.ts) and their own collectors; nothing here knows
// what a pilot is beyond the CaptainPilot interface.
//
// Determinism: matchSeed = mixSeed(runSeed, matchIndex); every stream in the
// match (map, spawns, drones, decks, pilots) derives from it. No Math.random,
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
} from '@salvo/shared';
import { World, type ShipRecord } from '../../src/game/world.js';
import { Match, type MatchEndCause, type MatchHooks, type MatchTimings } from '../../src/game/match.js';
import { PILOT_REGISTRY, type CaptainPilot, type PilotFactory } from './pilots.js';
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
  /** Pilot factory; defaults to the v1 gunner (PILOT_REGISTRY.gunner). */
  pilot?: PilotFactory;
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
   *  removes the ship). Today's scripted pilots never leave, so this is always
   *  empty; it exists so a leave-capable pilot cannot crash the batch, and so
   *  the exclusion is REPORTED rather than silent. */
  departedCaptains: string[];
}

export interface BatchResult {
  matches: MatchSample[];
  failures: { index: number; seed: number; error: string }[];
}

const isExclusiveId = (id: string): boolean => BOON_CATALOG[id]?.rarity === 'exclusive';

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
  readonly levelCurve: number[] = [];
  picks = 0;

  observe(ship: ShipRecord, tS: number): void {
    for (let n = 0; n < BOON_N_MAX; n += 1) {
      if (this.boonTimesS[n] === null && ship.boons.length >= n + 1) this.boonTimesS[n] = tS;
    }
    if (this.firstExclusiveOffered === null && (ship.offer?.some(isExclusiveId) ?? false)) {
      this.firstExclusiveOffered = { s: tS, level: ship.level };
    }
    if (this.firstExclusiveFitted === null && ship.boons.some(isExclusiveId)) {
      this.firstExclusiveFitted = { s: tS, level: ship.level };
    }
  }
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
    if (!killer || killer.isDrone || !victim) return;
    const tier = victim.isDrone ? victim.hullId : 'captain';
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
    disconnect: () => {},
  };
}

/** Run ONE match and collect its sample: to `finished`, or to the tick budget
 *  (full storm timeline via the shared zoneClosedAtMs + endgame slack), which
 *  collects an honest endedBy 'unresolved' sample instead. Throws only on the
 *  structural impossibility of a match that never even ACTIVATED in budget. */
export function runMatch(index: number, spec: RunSpec): MatchSample {
  const matchSeed = mixSeed(spec.seed, index);
  const playerCap = Math.max(CONFIG.map.playerCap, spec.captains);
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
    // SINCE AMENDMENT 4 a `--captains 1` run is also DEGENERATE: drones no
    // longer gate the win, so the lone captain wins on the activation tick and
    // the sample carries no combat at all. Story 6-5 owes the termination rule
    // that makes 1vN meaningful again; until then, batch evidence needs >= 2.
    minHumans: 1,
  };
  const match = new Match(world, timings, harnessHooks());
  const factory = spec.pilot ?? PILOT_REGISTRY.gunner;
  const pilots: CaptainPilot[] = [];
  const captainIds: string[] = [];
  for (let i = 0; i < spec.captains; i += 1) {
    const id = `cap-${i + 1}`;
    captainIds.push(id);
    world.addShip(id, `CAP-${String(i + 1).padStart(2, '0')}`, false, SHIP_CLASS_IDS[i % SHIP_CLASS_IDS.length]);
    pilots.push(factory(id, mixSeed(matchSeed, 0x100 + i)));
  }
  match.notifyRosterChanged();
  const collector = new MatchCollector(captainIds);
  // Tick budget from the SHARED time-to-closed helper: the full phased
  // timeline (12:00 at production CONFIG — ~14400 ticks) + countdown + endgame
  // slack. Honest but bounded: a pacifist full run fits comfortably; nothing
  // spins forever on a degenerate override (zoneClosedAtMs fails closed to 0).
  const tickCap = Math.ceil((COUNTDOWN_MS + zoneClosedAtMs(CONFIG.zone) + ENDGAME_SLACK_MS) / CONFIG.tick.simDtMs);
  for (let tick = 0; tick < tickCap; tick += 1) {
    for (const p of pilots) p.tick(world);
    world.step();
    match.update();
    collector.observe(world, match);
    if (match.phase === 'finished') return finishSample(index, matchSeed, world, match, collector, captainIds);
  }
  if (match.activatedAt === 0) {
    throw new Error(`match ${index} (seed ${matchSeed}) never activated within ${tickCap} ticks`);
  }
  return capSample(index, matchSeed, world, match, collector, captainIds);
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
): MatchSample {
  if (match.phase === 'finished') return finishSample(index, seed, world, match, collector, captainIds);
  return unresolvedSample(index, seed, world, match, collector, captainIds);
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
): MatchSample {
  const summary = match.endSummary();
  return buildSample(index, seed, world, collector, captainIds, {
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
): MatchSample {
  const durationS = Math.round((world.now - match.activatedAt) / 100) / 10;
  return buildSample(index, seed, world, collector, captainIds, {
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
  collector: MatchCollector,
  captainIds: readonly string[],
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
