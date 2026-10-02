// POOL READOUTS (Story 8.20, wave 1H) — MEASUREMENTS of how bots build now
// that every hull draws from the one common pool. Ruling R10: these are
// readouts, NOT bars — nothing here is judged PASS/FAIL and nothing here has a
// threshold.
//
// WHY A SEPARATE MODULE. botMetrics.ts / botReport.ts are shared with another
// story in flight; this file owns its own collector, its own per-match sample
// and its own aggregate + renderer, and is wired in with one call in the
// runner and one field + one render call in botReport.ts.
//
// READ-ONLY, exactly like BotCollector: every number is read off public World
// state (`ship.gun`, `ship.loadout`, `ship.level`, `world.mineCount` — the
// same getter the room's `/metrics` minesLivePeak feed reads — and
// `world.takes`, the weapon-weighting ledger itself). Nothing here writes to
// the sim, and nothing in server/src imports it.
//
// Determinism: pure over the collected samples, fixed iteration orders (GUN_IDS,
// ascending level, insertion-ordered bot ids), fixed-decimal formatting.

import { GUN_IDS, WEAPON_SLOTS } from '@salvo/shared';
import type { World, ShipRecord } from '../../src/game/world.js';
import type { MatchSample } from './runner.js';
import type { BotSample } from './botMetrics.js';
import { fmt } from './stats.js';

/** The HULL REPAIR line id (the heal-take readout's card). */
export const HULL_REPAIR_ID = 'hullRepair';

// --- collection --------------------------------------------------------------

/** One bot's pool-shaped reading for one match. */
export interface PoolBotSample {
  id: string;
  /** The gun this bot mounted (`ship.gun`). */
  gun: string;
  /** `levelEmpty[n - 1]` = EMPTY Q/E/R slots at the tick the bot reached level
   *  n (sampled when `ship.level` changes, before any pick at that level). A
   *  level RESET (`World.redeployEconomy` zeroes `ship.level` on a redeploy)
   *  truncates the series and starts a fresh one: the old series belonged to a
   *  life whose build the redeploy rebuilt, so only the latest series is kept. */
  levelEmpty: number[];
  /** EMPTY Q/E/R slots at the last reading (finish, or the frozen build of a
   *  sinking/sunk hull). Only SAMPLED bots are emitted, so this is never the
   *  unsampled seed. */
  finalEmpty: number;
}

/** One match's pool readings. */
export interface PoolMatchSample {
  /** Peak of `world.mineCount` over the active phase, sampled every tick. */
  peakMines: number;
  /** Weapon line id -> BOTS that took copy 1 of it this match (off
   *  `world.takes`, the weighting's own ledger), sorted by line id. */
  takes: Record<string, number>;
  bots: PoolBotSample[];
}

interface PoolTrack {
  levelEmpty: number[];
  /** null until the first active-phase reading (unsampled). */
  finalEmpty: number | null;
  /** `ship.level` at the previous reading — a drop below it is a level reset. */
  lastLevel: number;
}

/** Empty Q/E/R slots on a ship right now. */
export function emptyWeaponSlots(ship: Pick<ShipRecord, 'loadout'>): number {
  let empty = 0;
  for (const i of WEAPON_SLOTS) {
    if ((ship.loadout[i]?.equipmentId ?? null) === null) empty += 1;
  }
  return empty;
}

/** Fold one reading into a track: the latest slot count, and one level-reach
 *  sample per level gained since the previous reading (a multi-level jump in
 *  one tick stamps every level it crossed with the same reading). A level
 *  BELOW the previous reading's is a reset (redeployEconomy): the series
 *  restarts from empty, so the new life's levels are sampled from level 1. */
function notePoolTrack(track: PoolTrack, ship: Pick<ShipRecord, 'loadout' | 'level'>): void {
  const empty = emptyWeaponSlots(ship);
  if (ship.level < track.lastLevel) track.levelEmpty = [];
  track.lastLevel = ship.level;
  track.finalEmpty = empty;
  while (track.levelEmpty.length < ship.level) track.levelEmpty.push(empty);
}

/** Per-tick observer. Call once per tick after world.step() / match.update(),
 *  beside BotCollector. */
export class PoolCollector {
  private readonly tracks = new Map<string, PoolTrack>();
  private peakMines = 0;

  constructor(botIds: readonly string[]) {
    for (const id of botIds) this.tracks.set(id, { levelEmpty: [], finalEmpty: null, lastLevel: 0 });
  }

  observe(world: World, activatedAt: number): void {
    if (activatedAt === 0) return;
    this.peakMines = Math.max(this.peakMines, world.mineCount);
    // EVERY lifecycle, not just afloat: the harness observes after the whole
    // tick, so a weapon fitted or a level reached on the tick a bot SINKS is
    // only visible on the sinking hull. Its build is frozen from then on, so
    // re-reading it every later tick is idempotent (the level samples only
    // move when `ship.level` does).
    for (const [id, track] of this.tracks) {
      const ship = world.ships.get(id);
      if (ship !== undefined) notePoolTrack(track, ship);
    }
  }

  result(world: World): PoolMatchSample {
    const bots: PoolBotSample[] = [];
    // An UNSAMPLED track (never read in the active phase) is skipped outright,
    // so every readout — the gun mix and the pure-gunboat share alike — counts
    // over the same population of bots that were actually read.
    for (const [id, track] of this.tracks) {
      const ship = world.ships.get(id);
      if (ship === undefined || track.finalEmpty === null) continue;
      bots.push({ id, gun: ship.gun, levelEmpty: track.levelEmpty.slice(), finalEmpty: track.finalEmpty });
    }
    return { peakMines: this.peakMines, takes: this.botTakes(world), bots };
  }

  /** `world.takes` restricted to this lobby's bots (a captain in a mixed lobby
   *  is not a bot build), as sorted line id -> taker count. */
  private botTakes(world: World): Record<string, number> {
    const out: Record<string, number> = {};
    for (const line of [...world.takes.keys()].sort()) {
      let n = 0;
      for (const taker of world.takes.get(line)!) if (this.tracks.has(taker)) n += 1;
      if (n > 0) out[line] = n;
    }
    return out;
  }
}

// --- aggregation -------------------------------------------------------------

export interface GunMixRow {
  gun: string;
  bots: number;
  /** Share of all bots that mounted this gun. */
  share: number | null;
  /** Mean final placement over this gun's bots that HAVE one (null if none). */
  meanPlacement: number | null;
  wins: number;
  /** This gun's wins over ALL wins in the run. */
  winShare: number | null;
  /** This gun's wins over this gun's bots. */
  winRate: number | null;
}

export interface LevelEmptyRow {
  level: number;
  /** Bots that reached this level. */
  bots: number;
  /** Share with at least one empty Q/E/R slot at the moment they reached it. */
  anyEmptyShare: number | null;
  /** Share with all three Q/E/R slots empty at that moment. */
  allEmptyShare: number | null;
}

export interface PoolReadouts {
  matches: number;
  bots: number;
  gunMix: GunMixRow[];
  weaponlessAtLevel: LevelEmptyRow[];
  pureGunboat: { bots: number; share: number | null };
  heal: { hands: number; offeredHands: number; taken: number; takeRate: number | null };
  levelsWasted: { earned: number; wasted: number; share: number | null };
  weaponSpread: { matches: number; meanDistinctLines: number | null; meanTopLineShare: number | null };
  peakMines: { matches: number; mean: number | null; max: number | null };
}

/** A ratio that is honestly UNDEFINED on an empty denominator (never NaN). */
export const shareOf = (num: number, den: number): number | null => (den === 0 ? null : num / den);

const mean = (xs: readonly number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

/** One bot joined across the two per-match samples. */
export interface Joined {
  pool: PoolBotSample;
  bot: BotSample | undefined;
}

export function joinBots(matches: readonly MatchSample[]): Joined[] {
  const out: Joined[] = [];
  for (const m of matches) {
    if (m.pool === undefined) continue;
    const byId = new Map((m.bots ?? []).map((b) => [b.id, b]));
    for (const pool of m.pool.bots) out.push({ pool, bot: byId.get(pool.id) });
  }
  return out;
}

function gunOrder(rows: readonly Joined[]): string[] {
  const extra = [...new Set(rows.map((r) => r.pool.gun))].filter((g) => !(GUN_IDS as readonly string[]).includes(g)).sort();
  return [...GUN_IDS, ...extra];
}

export function gunMix(rows: readonly Joined[]): GunMixRow[] {
  const totalWins = rows.filter((r) => r.bot?.placement === 1).length;
  return gunOrder(rows).map((gun) => {
    const mine = rows.filter((r) => r.pool.gun === gun);
    const placed = mine.flatMap((r) => (r.bot?.placement == null ? [] : [r.bot.placement]));
    const wins = placed.filter((p) => p === 1).length;
    return {
      gun,
      bots: mine.length,
      share: shareOf(mine.length, rows.length),
      meanPlacement: mean(placed),
      wins,
      winShare: shareOf(wins, totalWins),
      winRate: shareOf(wins, mine.length),
    };
  });
}

export function weaponlessAtLevel(rows: readonly Joined[]): LevelEmptyRow[] {
  const top = rows.reduce((a, r) => Math.max(a, r.pool.levelEmpty.length), 0);
  const out: LevelEmptyRow[] = [];
  for (let level = 1; level <= top; level += 1) {
    const at = rows.flatMap((r) => (r.pool.levelEmpty.length >= level ? [r.pool.levelEmpty[level - 1]] : []));
    out.push({
      level,
      bots: at.length,
      anyEmptyShare: shareOf(at.filter((e) => e >= 1).length, at.length),
      allEmptyShare: shareOf(at.filter((e) => e >= WEAPON_SLOTS.length).length, at.length),
    });
  }
  return out;
}

function healTake(rows: readonly Joined[]): PoolReadouts['heal'] {
  let hands = 0;
  let offeredHands = 0;
  let taken = 0;
  for (const { bot } of rows) {
    if (bot === undefined) continue;
    hands += bot.offerHands;
    offeredHands += bot.offersSeen[HULL_REPAIR_ID] ?? 0;
    // The `bn` pick stream, NOT the fitted list: a used HULL REPAIR leaves
    // `cards` (the belt spends it), so the fitted list under-counts takes.
    taken += bot.picks.filter((p) => p.id === HULL_REPAIR_ID).length;
  }
  return { hands, offeredHands, taken, takeRate: shareOf(taken, offeredHands) };
}

function levelsWasted(rows: readonly Joined[]): PoolReadouts['levelsWasted'] {
  const earned = rows.reduce((a, r) => a + (r.bot?.levelsEarned ?? 0), 0);
  const wasted = rows.reduce((a, r) => a + (r.bot?.levelsUnspent ?? 0), 0);
  return { earned, wasted, share: shareOf(wasted, earned) };
}

export function weaponSpread(pools: readonly PoolMatchSample[]): PoolReadouts['weaponSpread'] {
  const distinct: number[] = [];
  const topShares: number[] = [];
  for (const p of pools) {
    const counts = Object.values(p.takes);
    distinct.push(counts.length);
    const total = counts.reduce((a, b) => a + b, 0);
    // A lobby with no first-copy take at all has no "most-taken line".
    if (total > 0) topShares.push(Math.max(...counts) / total);
  }
  return { matches: pools.length, meanDistinctLines: mean(distinct), meanTopLineShare: mean(topShares) };
}

function peakMines(pools: readonly PoolMatchSample[]): PoolReadouts['peakMines'] {
  const peaks = pools.map((p) => p.peakMines);
  return { matches: peaks.length, mean: mean(peaks), max: peaks.length === 0 ? null : Math.max(...peaks) };
}

export function buildPoolReadouts(matches: readonly MatchSample[]): PoolReadouts {
  const pools = matches.flatMap((m) => (m.pool === undefined ? [] : [m.pool]));
  const rows = joinBots(matches);
  const gunboats = rows.filter((r) => r.pool.finalEmpty >= WEAPON_SLOTS.length).length;
  return {
    matches: pools.length,
    bots: rows.length,
    gunMix: gunMix(rows),
    weaponlessAtLevel: weaponlessAtLevel(rows),
    pureGunboat: { bots: gunboats, share: shareOf(gunboats, rows.length) },
    heal: healTake(rows),
    levelsWasted: levelsWasted(rows),
    weaponSpread: weaponSpread(pools),
    peakMines: peakMines(pools),
  };
}

// --- rendering ---------------------------------------------------------------

const pct = (f: number | null): string => (f === null ? 'n/a' : `${fmt(f * 100, 1)}%`);
const num = (f: number | null, digits: number): string => (f === null ? 'n/a' : fmt(f, digits));

/** The POOL READOUTS block, as lines. Measurements only — no PASS/FAIL. */
export function renderPoolReadouts(p: PoolReadouts): string[] {
  const lines = [
    `POOL READOUTS (measurements, no bars; ${p.bots} bot-matches over ${p.matches} matches):`,
    '  gun mix:',
  ];
  const gunW = Math.max(...p.gunMix.map((g) => g.gun.length));
  for (const g of p.gunMix) {
    lines.push(
      `    ${g.gun.padEnd(gunW)}  bots ${String(g.bots).padStart(4)} (${pct(g.share)})  mean placement ${num(g.meanPlacement, 2)}  wins ${g.wins} (${pct(g.winShare)} of wins, ${pct(g.winRate)} win rate)`,
    );
  }
  lines.push('  weaponless at level (share of bots reaching level n with >=1 | all 3 Q/E/R slots empty):');
  if (p.weaponlessAtLevel.length === 0) lines.push('    (no level reached)');
  for (const r of p.weaponlessAtLevel) {
    lines.push(`    L${String(r.level).padEnd(3)} bots ${String(r.bots).padStart(4)}  >=1 empty ${pct(r.anyEmptyShare).padStart(6)}  all empty ${pct(r.allEmptyShare).padStart(6)}`);
  }
  lines.push(
    `  pure gunboat (no Q/E/R weapon at death/finish): ${p.pureGunboat.bots} of ${p.bots} (${pct(p.pureGunboat.share)})`,
    `  HULL REPAIR: offered in ${p.heal.offeredHands} of ${p.heal.hands} hands, taken ${p.heal.taken} (${pct(p.heal.takeRate)} of offers)`,
    `  levels wasted (banked, never spent): ${p.levelsWasted.wasted} of ${p.levelsWasted.earned} earned (${pct(p.levelsWasted.share)})`,
    `  weapon-line spread per lobby: mean distinct lines taken ${num(p.weaponSpread.meanDistinctLines, 2)} | mean top-line share of first-copy takes ${pct(p.weaponSpread.meanTopLineShare)}`,
    `  peak live mines per match: mean ${num(p.peakMines.mean, 2)} | max ${num(p.peakMines.max, 0)}`,
  );
  return lines;
}
