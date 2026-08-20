// BOT-VS-BOT MEASUREMENT (Story 6.4, wave 4) — the instrument the story's
// acceptance criterion ("bot quality is measured, not felt") rests on.
//
// WHY A SEPARATE COLLECTOR FROM MatchCollector. The captain collector measures
// the ECONOMY (levels, boon timing, deck depletion) for a scripted control
// that never fires and never dies of anything interesting. The bot collector
// measures COMBAT QUALITY for a brain that steers itself: who killed whom,
// what killed them, how long they lived, whether they spent what they earned,
// and whether they spent the match scraping a coastline. Mixing the two would
// have made every captain row conditional on a mode it knows nothing about.
//
// NO CONTROL FUNCTION EXISTS FOR A BOT, and that is not an omission: bots drive
// themselves from the `botsTick` STEP_ORDER row inside World.step(). The
// harness's "bot mode" is therefore a LOBBY CONSTRUCTOR (world.addBot() x N)
// plus this observer — the runner's per-tick control loop stays empty for them.
//
// EVERY NUMBER HERE IS READ-ONLY OFF ShipRecord AND world.tickEvents. Nothing
// in this module can influence a bot's behaviour, and nothing in server/src
// imports it.

import {
  hullSilhouette,
  islandDistance,
  isAfloat,
  transformPolygon,
  type Island,
  type Vec2,
} from '@salvo/shared';
import type { World, ShipRecord } from '../../src/game/world.js';
import { isFleetHull } from '../../src/game/participants.js';

/**
 * u — clearance below which a hull counts as IN LAND CONTACT.
 *
 * THIS IS A PROXY AND IS REPORTED AS ONE. It re-derives contact GEOMETRICALLY
 * from the resolved pose: the hull silhouette is transformed at the post-step
 * pose and counted as touching when any vertex sits within this clearance of a
 * coastline.
 *
 * The proxy is a slight OVER-count, never an under-count: push-out clears a
 * grounded hull by PUSH_EPS (1e-6 u), so a hull that really did touch this tick
 * reads ~0 clearance and is always caught, while a hull that merely sailed past
 * a coast inside 1u is counted as contact although the resolver saw none. Any
 * bar this proxy passes, the true figure passes by more.
 *
 * THE AUTHORITATIVE ANSWER NOW EXISTS — `ShipRecord.landContact`, the stored
 * `resolveShipPose().contact` (the un-beach defect fix put it there so the bot
 * brain could read its own grounding instead of guessing at it from speed). The
 * proxy is KEPT ANYWAY, deliberately and on two grounds: it is the STRICTER of
 * the two readings, so the campaign's land bar stays conservative; and it is
 * the reading every previously-published bot campaign was measured with, so
 * before/after numbers across the fix compare like with like. Swap it for
 * `ship.landContact` only alongside a fresh baseline run.
 */
const LAND_CONTACT_SLACK = 1;

/**
 * How a bot's match ended. `sunkByShip` is a PARTICIPANT killer (another bot,
 * or a captain in a mixed lobby); `sunkByFleet` is a PvE fleet hull — those are
 * gun-armed (drones.ts) and really do sink bots, and folding them into the
 * bot-vs-bot column would overstate how lethal the brain is to its peers.
 */
export type BotEnd = 'alive' | 'sunkByShip' | 'sunkByFleet' | 'sunkByStorm';

export interface BotSample {
  id: string;
  name: string;
  cls: string;
  profile: string;
  /** Kills against PARTICIPANTS (other bots/captains) — the kill-distribution
   *  numerator. Counted from `sunk` events, not ShipRecord.kills, because that
   *  field deliberately counts PvE fleet hulls too (amendment 38). */
  kills: number;
  /** Kills against PvE fleet hulls (the `forager` profile's whole thesis). */
  pveKills: number;
  end: BotEnd;
  /** sim-seconds from activation to this bot's sinking (or to the finish). */
  lifeS: number;
  /** Total levels EARNED over the match (ShipRecord.level). */
  levelsEarned: number;
  /** Levels still banked and unspent at death (or at the finish, if alive). */
  levelsUnspent: number;
  boonsFitted: number;
  /** Fire requests the bot issued (lastFireSeq — clicks the sim consumed;
   *  includes shots the equipment refused for reload/arc/ammo). */
  shots: number;
  /** hp dealt to other hulls (self-hits and storm excluded). */
  damageDealt: number;
  /** Ticks this bot was afloat, and how many of them were in land contact. */
  ticks: number;
  landTicks: number;
  /** Distinct land-contact EPISODES (an unbroken run of contact ticks) and the
   *  longest one, in ticks. A raw contact RATE cannot tell "brushed a headland
   *  forty times" from "beached once and never got off", and the I/O contract
   *  the spec pins is about the second (a grounded bot clears within
   *  CONFIG.bots.stuckMs). Reporting both makes a failing land bar diagnosable
   *  instead of merely red. */
  landEpisodes: number;
  maxLandRunTicks: number;
}

/** Mutable per-bot accumulation; frozen into a BotSample at the finish. */
interface BotTrack {
  kills: number;
  pveKills: number;
  end: BotEnd;
  lifeS: number;
  ticks: number;
  landTicks: number;
  /** Last reading taken while the bot was still AFLOAT — so a bot's economy is
   *  reported as it stood at death, not after the corpse sat out the match. */
  levelsEarned: number;
  levelsUnspent: number;
  boonsFitted: number;
  shots: number;
  damageDealt: number;
  landEpisodes: number;
  maxLandRunTicks: number;
  curLandRun: number;
}

function newTrack(): BotTrack {
  return {
    kills: 0,
    pveKills: 0,
    end: 'alive',
    lifeS: 0,
    ticks: 0,
    landTicks: 0,
    levelsEarned: 0,
    levelsUnspent: 0,
    boonsFitted: 0,
    shots: 0,
    damageDealt: 0,
    landEpisodes: 0,
    maxLandRunTicks: 0,
    curLandRun: 0,
  };
}

/** Fold one tick's contact reading into the episode counters. */
function noteLand(track: BotTrack, touching: boolean): void {
  if (!touching) {
    track.curLandRun = 0;
    return;
  }
  track.landTicks += 1;
  if (track.curLandRun === 0) track.landEpisodes += 1;
  track.curLandRun += 1;
  track.maxLandRunTicks = Math.max(track.maxLandRunTicks, track.curLandRun);
}

/**
 * True iff this hull's silhouette is touching a coastline at its CURRENT pose
 * (see LAND_CONTACT_SLACK for why this is a re-derivation and what it costs).
 *
 * Broadphase first, exactly as the island seam requires: the hull's bounding
 * circle against the island's, squared, no sqrt — 18 islands x 20 bots x 20Hz
 * is 7M cheap tests per match, and the polygon walk runs only on a real
 * near-miss.
 */
export function hullTouchesLand(
  ship: ShipRecord,
  islands: readonly Island[],
  scratch: Vec2[],
): boolean {
  const local = hullSilhouette(ship.hullId);
  const hullR = hullRadius(local);
  const reach = hullR + LAND_CONTACT_SLACK;
  let world: readonly Vec2[] | null = null;
  for (const isle of islands) {
    const dx = ship.state.x - isle.x;
    const dy = ship.state.y - isle.y;
    const sum = isle.r + reach;
    if (dx * dx + dy * dy > sum * sum) continue;
    world ??= transformPolygon(local, ship.state.x, ship.state.y, ship.state.heading, scratch);
    for (const v of world) {
      if (islandDistance(v, isle) <= LAND_CONTACT_SLACK) return true;
    }
  }
  return false;
}

/** Max vertex radius of a local silhouette (its bounding-circle radius). */
function hullRadius(local: readonly Vec2[]): number {
  let r2 = 0;
  for (const v of local) r2 = Math.max(r2, v.x * v.x + v.y * v.y);
  return Math.sqrt(r2);
}

/**
 * Per-tick observer over a bot lobby. Call once per tick AFTER world.step()
 * and match.update(), exactly where MatchCollector is called.
 */
export class BotCollector {
  private readonly tracks = new Map<string, BotTrack>();
  /** Reused polygon scratch — the 20Hz loop stays allocation-light. */
  private readonly scratch: Vec2[] = [];

  constructor(botIds: readonly string[]) {
    for (const id of botIds) this.tracks.set(id, newTrack());
  }

  /** No bots enrolled — the runner skips every bot code path. */
  get empty(): boolean {
    return this.tracks.size === 0;
  }

  observe(world: World, activatedAt: number): void {
    if (activatedAt === 0) return;
    const tS = (world.now - activatedAt) / 1000;
    this.consumeEvents(world, tS);
    for (const [id, track] of this.tracks) {
      const ship = world.ships.get(id);
      if (ship === undefined || !isAfloat(ship.lifecycle)) continue;
      track.ticks += 1;
      noteLand(track, hullTouchesLand(ship, world.map.islands, this.scratch));
      track.lifeS = tS;
      readEconomy(track, ship);
    }
  }

  /** Kill credit and death cause, both off the same `sunk` event stream the
   *  captain collector reads (`by === undefined` IS the storm/no-killer case). */
  private consumeEvents(world: World, tS: number): void {
    for (const e of world.tickEvents) {
      if (e.k !== 'sunk') continue;
      this.recordVictim(world, e.id, e.by, tS);
      if (e.by !== undefined) this.recordKill(world, e.by, e.id);
    }
  }

  private recordVictim(world: World, id: string, by: string | undefined, tS: number): void {
    const track = this.tracks.get(id);
    if (track === undefined) return;
    track.end = endCause(world, by);
    track.lifeS = tS;
  }

  private recordKill(world: World, by: string, victimId: string): void {
    const track = this.tracks.get(by);
    const victim = world.ships.get(victimId);
    if (track === undefined || victim === undefined) return;
    if (isFleetHull(victim)) track.pveKills += 1;
    else track.kills += 1;
  }

  /** Freeze every track into a report row. `profileOf` comes from the live
   *  BotController (the only place a bot's rolled profile is knowable). */
  samples(world: World): BotSample[] {
    const out: BotSample[] = [];
    for (const [id, track] of this.tracks) {
      const ship = world.ships.get(id);
      if (ship === undefined) continue;
      out.push({
        id,
        name: ship.name,
        cls: ship.hullId,
        profile: world.bots.profileOf(id) ?? 'unknown',
        kills: track.kills,
        pveKills: track.pveKills,
        end: track.end,
        lifeS: Math.round(track.lifeS * 10) / 10,
        levelsEarned: track.levelsEarned,
        levelsUnspent: track.levelsUnspent,
        boonsFitted: track.boonsFitted,
        shots: track.shots,
        damageDealt: track.damageDealt,
        ticks: track.ticks,
        landTicks: track.landTicks,
        landEpisodes: track.landEpisodes,
        maxLandRunTicks: track.maxLandRunTicks,
      });
    }
    return out;
  }
}

/**
 * Raw per-bot `lifeS` values off a list of BotSample rows, sorted ascending.
 *
 * This is the EXACT sibling of `summarize(rows.map((r) => r.lifeS))` —
 * `botReport.ts`'s `groupOf` already pools that quantile summary; this
 * returns the same underlying values UNSUMMARIZED so a downstream consumer
 * (the `/balance-sim` attrition curve) can read the true alive-at-T curve
 * instead of an approximation reconstructed from p25/p50/p75/p95.
 *
 * Sorted ascending rather than left in row order: the values already carry
 * no positional meaning (a row is one bot-match, and BotCollector iterates
 * its tracks Map in insertion order, which is an implementation detail of
 * lobby construction, not a report contract) and a sorted array is directly
 * usable for the curve's own percentile/threshold reads without forcing the
 * consumer to re-sort. Values are emitted exactly as stored on the row (see
 * BotSample.lifeS: already rounded to 1 decimal by `samples()`) — no
 * re-rounding here.
 */
export function lifeSamples(rows: readonly BotSample[]): number[] {
  return rows.map((r) => r.lifeS).sort((a, b) => a - b);
}

/** Classify a sinking by its killer: none = the storm, a fleet hull = PvE,
 *  anything else = a participant. A killer whose record has already gone is
 *  treated as a participant — only fleet hulls are ever removed early. */
function endCause(world: World, by: string | undefined): BotEnd {
  if (by === undefined) return 'sunkByStorm';
  const killer = world.ships.get(by);
  return killer !== undefined && isFleetHull(killer) ? 'sunkByFleet' : 'sunkByShip';
}

/** The last-afloat economy reading (see BotTrack.levelsEarned). */
function readEconomy(track: BotTrack, ship: ShipRecord): void {
  track.levelsEarned = ship.level;
  track.levelsUnspent = ship.bankedLevels;
  track.boonsFitted = ship.boons.length;
  track.shots = ship.lastFireSeq;
  track.damageDealt = Math.round(ship.damageDealt * 10) / 10;
}
