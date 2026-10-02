// THE BOT QUALITY TABLE (Story 6.4, wave 4) — aggregation + deterministic
// rendering for a bot lobby, the sibling of report.ts's captain-economy block.
//
// Story 6.4 ships NO PLAYABLE PATH (Eric ruling A1: harness + tests only, 6-5
// wires the mode), so this table is the ENTIRE verification instrument for bot
// quality and the story's "measured, not felt" acceptance criterion rests on
// it. Every row is stated with the bar it is judged against and a PASS/FAIL, so
// a campaign either clears the spec or visibly does not.
//
// Determinism contract (NFR5), inherited verbatim from report.ts: pure over the
// collected samples, explicitly sorted keys, fixed-decimal formatting, no wall
// clock. Identical run key => byte-identical body.
//
// READING THE KILL-SHARE BAR. The spec writes it absolutely — "no single bot
// takes > 40% of a match's kills" — but that is a statement about ONE match,
// and per-match max-share is a random variable: across 50 matches a lucky bot
// will breach 40% by chance without the brain being lopsided. The judged row is
// therefore the MEAN per-match max share, and the breach RATE is printed beside
// it as unjudged colour, so the strict reading is never hidden.

import { CONFIG, zoneClosedAtMs } from '@salvo/shared';
import { fmt, fmtSummary, summarize, type Summary } from './stats.js';
import type { BatchResult, MatchSample } from './runner.js';
import { emptyKillsByTier, lifeSamples, type BotSample } from './botMetrics.js';
import { buildPoolReadouts, renderPoolReadouts, type PoolReadouts } from './poolReadouts.js';

/** The spec's Verification bars, as data (one place to read them off). */
const BARS = {
  /** Matches resolving before the 16:00 sudden-death collapse. */
  resolutionRate: 0.95,
  /** Mean per-match share of participant kills taken by the top bot. */
  maxKillShare: 0.4,
  /** Bot-matches scoring at least one participant kill. */
  anyKillRate: 0.6,
  /** Storm deaths as a fraction of ALL bot deaths (a band, not a floor). */
  stormDeathLo: 0.05,
  stormDeathHi: 0.2,
  /** Afloat bot-ticks spent in land contact. */
  landContactRate: 0.01,
  /** Banked levels spent before death. */
  levelsSpentRate: 0.9,
} as const;

/** One judged row of the quality table. */
export interface BotBar {
  name: string;
  measured: string;
  bar: string;
  pass: boolean;
}

/** A per-profile / per-class slice. Every field is over BOT-MATCHES (one bot
 *  in one match = one row), never over matches. */
export interface BotGroup {
  key: string;
  n: number;
  kills: Summary;
  pveKills: Summary;
  levels: Summary;
  boons: Summary;
  shots: Summary;
  /** Placeables that actually reached the water, per bot-match. Distinct from
   *  `shots`, which counts REQUESTS including denied ones — see BotSample. */
  decoys: Summary;
  mines: Summary;
  damage: Summary;
  lifeS: Summary;
  /** Fraction of this group's bot-matches that ended still afloat (the group's
   *  win rate — a bot alive at the finish in a bot-only lobby IS the winner,
   *  except in an unresolved cap-out where several may survive). */
  aliveRate: number;
  anyKillRate: number;
  stormShareOfDeaths: number;
  landRate: number;
  /** Afloat bot-ticks spent riding another hull's wake (Story 8.19), pooled
   *  over the group: Σ draftTicks / Σ ticks — the landRate shape. */
  draftRate: number;
  spentRate: number;
  /** Land-contact episodes per bot-match, and the longest single run in
   *  SIM-SECONDS — the diagnosis half of the land bar (see BotSample). */
  landEpisodes: Summary;
  maxLandRunS: Summary;
  /** hp of damage dealt per fire request issued — a cheap marksmanship proxy
   *  (see BotSample.shots: it counts clicks the sim consumed, including ones
   *  the equipment refused, so this is a LOWER bound on damage per shot). */
  damagePerShot: number;
}

/** A per-CLASS slice: a BotGroup plus the RAW life column. The documented
 *  `--json` contract is `bots.byClass[].lifeSamples` and nothing else, so the
 *  field lives on its own type rather than on BotGroup — `byProfile` and
 *  `byClass` are built by the same code, so a field on the shared type is
 *  emitted TWICE, doubling the JSON for a column only one of them contracts to
 *  carry. JSON-ONLY either way: never rendered by `renderBotReport`/
 *  `groupTable`, so the deterministic text body stays byte-identical. It exists
 *  for `/balance-sim`'s attrition curve, which needs the true alive-at-T
 *  reading rather than a quantile-pooled one. */
export interface BotClassGroup extends BotGroup {
  /** Raw per-bot-match `lifeS` values, sorted ascending — the EXACT sibling of
   *  `BotGroup.lifeS` (see botMetrics.lifeSamples). */
  lifeSamples: number[];
}

/** A per-GUN or per-GUN×TIER slice: a BotGroup plus the outcome columns that
 *  need the MATCH (a win is read against the match's winnerClass). JSON-first;
 *  the text report prints only a compact gun×tier table off it. */
export interface BotGunGroup extends BotGroup {
  /** Bot-matches this group WON: placement 1 in a match whose winnerClass is
   *  not null — a mutual-destruction DRAW still hands someone placement 1
   *  (match.ts computePlacements walks the sink order), so it is not a win. */
  wins: number;
  winRate: number;
  /** Mean final placement over this group's rows that HAVE one (null if none). */
  meanPlacement: number | null;
  /** Σ BotSample.killsByTier over the group (length 6, index = killer tier). */
  killsByTierTotal: number[];
}

export interface BotAggregate {
  matches: number;
  botsPerMatch: number;
  botMatches: number;
  durationS: Summary;
  /** endedBy tally over the bot campaign's matches. */
  endedBy: Record<string, number>;
  resolutionRate: number;
  maxKillShare: Summary;
  killShareBreachRate: number;
  anyKillRate: number;
  stormDeathRate: number;
  deaths: number;
  stormDeaths: number;
  /** Deaths at the hands of a PvE FLEET hull — armed, and not the brain's
   *  peers, so they are visible rather than folded into the bot-vs-bot column. */
  fleetDeaths: number;
  landContactRate: number;
  /** Longest UNBROKEN land-contact run over the whole campaign, sim-seconds —
   *  the "did a bot beach permanently" reading the rate alone cannot give. */
  worstLandRunS: number;
  levelsSpentRate: number;
  levelsEarned: number;
  levelsUnspent: number;
  participantKills: number;
  pveKills: number;
  byProfile: BotGroup[];
  byClass: BotClassGroup[];
  /** Keyed by `gun` (the bot's mounted gun). */
  byGun: BotGunGroup[];
  /** Keyed `${gun}/T${tier}` — tier is the gun rung at the last afloat reading. */
  byGunTier: BotGunGroup[];
  bars: BotBar[];
  /** POOL READOUTS (Story 8.20, R10): measurements, never judged. */
  pool: PoolReadouts;
}

const ratio = (num: number, den: number): number => (den === 0 ? 0 : num / den);

/** Per-match max share of that match's PARTICIPANT kills taken by one bot.
 *  A match with no bot-vs-bot kills at all contributes no sample — a share of
 *  0/0 is not "well distributed", it is "nothing happened". */
function killShares(matches: readonly MatchSample[]): number[] {
  const out: number[] = [];
  for (const m of matches) {
    const bots = m.bots ?? [];
    const total = bots.reduce((a, b) => a + b.kills, 0);
    if (total === 0) continue;
    out.push(bots.reduce((a, b) => Math.max(a, b.kills), 0) / total);
  }
  return out;
}

function groupOf(key: string, rows: readonly BotSample[]): BotGroup {
  const deaths = rows.filter((r) => r.end !== 'alive').length;
  const shots = rows.reduce((a, r) => a + r.shots, 0);
  const damage = rows.reduce((a, r) => a + r.damageDealt, 0);
  return {
    key,
    n: rows.length,
    kills: summarize(rows.map((r) => r.kills)),
    pveKills: summarize(rows.map((r) => r.pveKills)),
    levels: summarize(rows.map((r) => r.levelsEarned)),
    boons: summarize(rows.map((r) => r.boonsFitted)),
    shots: summarize(rows.map((r) => r.shots)),
    decoys: summarize(rows.map((r) => r.decoysDeployed)),
    mines: summarize(rows.map((r) => r.minesLaid)),
    damage: summarize(rows.map((r) => r.damageDealt)),
    lifeS: summarize(rows.map((r) => r.lifeS)),
    aliveRate: ratio(rows.filter((r) => r.end === 'alive').length, rows.length),
    anyKillRate: ratio(rows.filter((r) => r.kills > 0).length, rows.length),
    stormShareOfDeaths: ratio(rows.filter((r) => r.end === 'sunkByStorm').length, deaths),
    landRate: ratio(
      rows.reduce((a, r) => a + r.landTicks, 0),
      rows.reduce((a, r) => a + r.ticks, 0),
    ),
    draftRate: ratio(
      rows.reduce((a, r) => a + r.draftTicks, 0),
      rows.reduce((a, r) => a + r.ticks, 0),
    ),
    spentRate: spentRate(rows),
    landEpisodes: summarize(rows.map((r) => r.landEpisodes)),
    maxLandRunS: summarize(rows.map((r) => (r.maxLandRunTicks * CONFIG.tick.simDtMs) / 1000)),
    damagePerShot: ratio(damage, shots),
  };
}

/** Banked levels SPENT before death: a level is earned (ShipRecord.level) and
 *  leaves the bank on a card pick or a heal, so `earned - stillBanked` is the
 *  spend count exactly. Pooled over the group rather than averaged per bot, so
 *  a bot that earned nothing cannot score a spurious 0% or 100%. */
function spentRate(rows: readonly BotSample[]): number {
  const earned = rows.reduce((a, r) => a + r.levelsEarned, 0);
  const unspent = rows.reduce((a, r) => a + r.levelsUnspent, 0);
  return ratio(earned - unspent, earned);
}

/** Bucket bot-matches by a key, in sorted key order. */
function bucket(rows: readonly BotSample[], key: (r: BotSample) => string): [string, BotSample[]][] {
  const buckets = new Map<string, BotSample[]>();
  for (const r of rows) {
    const k = key(r);
    const list = buckets.get(k);
    if (list === undefined) buckets.set(k, [r]);
    else list.push(r);
  }
  return [...buckets.keys()].sort().map((k) => [k, buckets.get(k)!]);
}

/** Slice bot-matches by a key, returning groups in sorted key order. */
function groupBy(rows: readonly BotSample[], key: (r: BotSample) => string): BotGroup[] {
  return bucket(rows, key).map(([k, list]) => groupOf(k, list));
}

/** The per-CLASS slice — groupBy plus the raw life column, which the `--json`
 *  contract carries on THIS axis only (see BotClassGroup). */
function groupByClass(rows: readonly BotSample[]): BotClassGroup[] {
  return bucket(rows, (r) => r.cls).map(([k, list]) => ({ ...groupOf(k, list), lifeSamples: lifeSamples(list) }));
}

/** One bot-match row paired with whether it won (see BotGunGroup.wins). */
interface ScoredRow {
  row: BotSample;
  won: boolean;
}

/** True iff this row is a real win: placement 1 AND the match named a winner. */
export function isBotWin(row: BotSample, match: Pick<MatchSample, 'winnerClass'>): boolean {
  return row.placement === 1 && match.winnerClass !== null && match.winnerClass !== '';
}

function scoredRows(matches: readonly MatchSample[]): ScoredRow[] {
  return matches.flatMap((m) => (m.bots ?? []).map((row) => ({ row, won: isBotWin(row, m) })));
}

function sumKillsByTier(rows: readonly BotSample[]): number[] {
  const out = emptyKillsByTier();
  for (const r of rows) r.killsByTier.forEach((k, i) => { out[i] = (out[i] ?? 0) + k; });
  return out;
}

function gunGroupOf(key: string, scored: readonly ScoredRow[]): BotGunGroup {
  const rows = scored.map((s) => s.row);
  const placed = rows.flatMap((r) => (r.placement === null ? [] : [r.placement]));
  const wins = scored.filter((s) => s.won).length;
  return {
    ...groupOf(key, rows),
    wins,
    winRate: ratio(wins, rows.length),
    meanPlacement: placed.length === 0 ? null : placed.reduce((a, p) => a + p, 0) / placed.length,
    killsByTierTotal: sumKillsByTier(rows),
  };
}

/** Slice scored rows by a key, in sorted key order (bucket's rule). */
function groupGunBy(scored: readonly ScoredRow[], key: (r: BotSample) => string): BotGunGroup[] {
  const byKey = new Map<string, ScoredRow[]>();
  for (const s of scored) {
    const k = key(s.row);
    const list = byKey.get(k);
    if (list === undefined) byKey.set(k, [s]);
    else list.push(s);
  }
  return [...byKey.keys()].sort().map((k) => gunGroupOf(k, byKey.get(k)!));
}

export const gunTierKey = (r: Pick<BotSample, 'gun' | 'gunTier'>): string => `${r.gun}/T${r.gunTier}`;

export function buildBotAggregate(result: BatchResult, botsPerMatch: number): BotAggregate {
  const matches = result.matches;
  const rows = matches.flatMap((m) => m.bots ?? []);
  const shares = killShares(matches);
  // RESOLUTION is the spec's own wording — "resolving before the 16:00
  // collapse" — so it is BOTH clauses: a real conclusion (not a tick-cap
  // 'unresolved') AND a duration inside full closure, read off the shared
  // zone helper so a --set zone.* override moves it with the run.
  const collapseS = zoneClosedAtMs(CONFIG.zone) / 1000;
  const resolved = matches.filter((m) => m.endedBy !== 'unresolved' && m.durationS <= collapseS).length;
  const deaths = rows.filter((r) => r.end !== 'alive').length;
  const stormDeaths = rows.filter((r) => r.end === 'sunkByStorm').length;
  const fleetDeaths = rows.filter((r) => r.end === 'sunkByFleet').length;
  const levelsEarned = rows.reduce((a, r) => a + r.levelsEarned, 0);
  const levelsUnspent = rows.reduce((a, r) => a + r.levelsUnspent, 0);
  const agg: BotAggregate = {
    matches: matches.length,
    botsPerMatch,
    botMatches: rows.length,
    durationS: summarize(matches.map((m) => m.durationS)),
    endedBy: tallyEndedBy(matches),
    resolutionRate: ratio(resolved, matches.length),
    maxKillShare: summarize(shares),
    killShareBreachRate: ratio(shares.filter((s) => s > BARS.maxKillShare).length, shares.length),
    anyKillRate: ratio(rows.filter((r) => r.kills > 0).length, rows.length),
    stormDeathRate: ratio(stormDeaths, deaths),
    deaths,
    stormDeaths,
    fleetDeaths,
    landContactRate: ratio(
      rows.reduce((a, r) => a + r.landTicks, 0),
      rows.reduce((a, r) => a + r.ticks, 0),
    ),
    worstLandRunS: rows.reduce((a, r) => Math.max(a, r.maxLandRunTicks), 0) * CONFIG.tick.simDtMs / 1000,
    levelsSpentRate: ratio(levelsEarned - levelsUnspent, levelsEarned),
    levelsEarned,
    levelsUnspent,
    participantKills: rows.reduce((a, r) => a + r.kills, 0),
    pveKills: rows.reduce((a, r) => a + r.pveKills, 0),
    byProfile: groupBy(rows, (r) => r.profile),
    byClass: groupByClass(rows),
    byGun: groupGunBy(scoredRows(matches), (r) => r.gun),
    byGunTier: groupGunBy(scoredRows(matches), gunTierKey),
    bars: [],
    pool: buildPoolReadouts(matches),
  };
  agg.bars = buildBars(agg);
  return agg;
}

function tallyEndedBy(matches: readonly MatchSample[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of matches) out[m.endedBy] = (out[m.endedBy] ?? 0) + 1;
  return out;
}

const pct = (f: number): string => `${fmt(f * 100, 1)}%`;

/** The judged rows, in the order the spec's Verification section lists them. */
export function buildBars(a: BotAggregate): BotBar[] {
  return [
    {
      name: 'matches resolving before 16:00 collapse',
      measured: pct(a.resolutionRate),
      bar: `> ${pct(BARS.resolutionRate)}`,
      pass: a.resolutionRate > BARS.resolutionRate,
    },
    {
      name: 'mean per-match max single-bot kill share',
      measured: pct(a.maxKillShare.mean),
      bar: `<= ${pct(BARS.maxKillShare)}`,
      pass: a.maxKillShare.mean <= BARS.maxKillShare,
    },
    {
      name: 'bots scoring >= 1 participant kill',
      measured: pct(a.anyKillRate),
      bar: `>= ${pct(BARS.anyKillRate)}`,
      pass: a.anyKillRate >= BARS.anyKillRate,
    },
    {
      name: 'storm deaths as a share of all bot deaths',
      measured: pct(a.stormDeathRate),
      bar: `${pct(BARS.stormDeathLo)}-${pct(BARS.stormDeathHi)}`,
      pass: a.stormDeathRate >= BARS.stormDeathLo && a.stormDeathRate <= BARS.stormDeathHi,
    },
    {
      name: 'afloat bot-ticks in land contact',
      measured: pct(a.landContactRate),
      bar: `< ${pct(BARS.landContactRate)}`,
      pass: a.landContactRate < BARS.landContactRate,
    },
    {
      name: 'banked levels spent before death',
      measured: pct(a.levelsSpentRate),
      bar: `> ${pct(BARS.levelsSpentRate)}`,
      pass: a.levelsSpentRate > BARS.levelsSpentRate,
    },
  ];
}

function countLine(rec: Record<string, number>): string {
  const keys = Object.keys(rec).sort();
  if (keys.length === 0) return '(none)';
  return keys.map((k) => `${k}=${rec[k]}`).join(' ');
}

/** The full bot section for one variant, as lines. */
export function renderBotReport(label: string, a: BotAggregate): string[] {
  const lines = [
    `== BOTS ${label} ==`,
    `bot-matches: ${a.botMatches} (${a.botsPerMatch} bots x ${a.matches} matches)`,
    `match length s: ${fmtSummary(a.durationS)}`,
    `endedBy: ${countLine(a.endedBy)}`,
    `bot-vs-bot kills: ${a.participantKills} | PvE fleet kills: ${a.pveKills}`,
    `deaths: ${a.deaths} = ${a.deaths - a.stormDeaths - a.fleetDeaths} by participant + ${a.fleetDeaths} by PvE fleet + ${a.stormDeaths} by storm`,
    `levels earned: ${a.levelsEarned} | still banked at death/finish: ${a.levelsUnspent}`,
    `longest unbroken land-contact run: ${fmt(a.worstLandRunS, 1)}s (CONFIG.bots.stuckMs = ${CONFIG.bots.stuckMs}ms)`,
    `per-match max kill share: ${fmtSummary(a.maxKillShare)} | matches breaching 40%: ${pct(a.killShareBreachRate)}`,
    '',
    'QUALITY BAR (spec 6-4 Verification):',
  ];
  const nameW = Math.max(...a.bars.map((b) => b.name.length));
  for (const b of a.bars) {
    lines.push(`  ${b.pass ? 'PASS' : 'FAIL'}  ${b.name.padEnd(nameW)}  measured ${b.measured.padStart(7)}  bar ${b.bar}`);
  }
  lines.push('', 'BY PROFILE (the six priority profiles — the story\'s core design claim):');
  lines.push(...groupTable(a.byProfile));
  lines.push('', 'BY CLASS:');
  lines.push(...groupTable(a.byClass));
  lines.push('', 'BY GUN x TIER (tier = gun rung at death/finish; win = placement 1 with a named winner):');
  lines.push(...gunTierTable(a.byGunTier));
  lines.push('', ...renderPoolReadouts(a.pool));
  return lines;
}

/** Columns of the per-profile / per-class table (one place, both tables). */
const GROUP_COLS: { head: string; w: number; value: (g: BotGroup) => string }[] = [
  { head: 'n', w: 5, value: (g) => String(g.n) },
  { head: 'kills', w: 6, value: (g) => fmt(g.kills.mean, 2) },
  { head: 'pve', w: 6, value: (g) => fmt(g.pveKills.mean, 2) },
  { head: 'kill%', w: 6, value: (g) => pct(g.anyKillRate) },
  { head: 'alive%', w: 7, value: (g) => pct(g.aliveRate) },
  { head: 'lifeS', w: 7, value: (g) => fmt(g.lifeS.mean, 1) },
  { head: 'lvl', w: 6, value: (g) => fmt(g.levels.mean, 2) },
  { head: 'boons', w: 6, value: (g) => fmt(g.boons.mean, 2) },
  { head: 'spent%', w: 7, value: (g) => pct(g.spentRate) },
  { head: 'shots', w: 7, value: (g) => fmt(g.shots.mean, 1) },
  // DEPLOYED, not requested — `shots` above counts denied requests too, so
  // these two are the only columns that can answer "is this equipment being
  // USED?" (the question that motivated them: do bots deploy the radar buoy —
  // the DECOY BUOY since Story 8.16).
  { head: 'decoys', w: 6, value: (g) => fmt(g.decoys.mean, 2) },
  { head: 'mines', w: 6, value: (g) => fmt(g.mines.mean, 2) },
  { head: 'dmg', w: 8, value: (g) => fmt(g.damage.mean, 1) },
  { head: 'dmg/shot', w: 9, value: (g) => fmt(g.damagePerShot, 2) },
  { head: 'storm%', w: 7, value: (g) => pct(g.stormShareOfDeaths) },
  { head: 'land%', w: 7, value: (g) => pct(g.landRate) },
  { head: 'landRuns', w: 9, value: (g) => fmt(g.landEpisodes.mean, 1) },
  { head: 'maxRunS', w: 8, value: (g) => fmt(g.maxLandRunS.max, 1) },
  // Story 8.19: afloat ticks riding another hull's wake (observation only).
  { head: 'draft%', w: 7, value: (g) => pct(g.draftRate) },
];

function groupTable(groups: readonly BotGroup[]): string[] {
  const keyW = Math.max(8, ...groups.map((g) => g.key.length));
  const head = `  ${'group'.padEnd(keyW)} ${GROUP_COLS.map((c) => c.head.padStart(c.w)).join('')}`;
  const rows = groups.map((g) => `  ${g.key.padEnd(keyW)} ${GROUP_COLS.map((c) => c.value(g).padStart(c.w)).join('')}`);
  return [head, ...rows];
}

/** Compact gun×tier table: n, wins, win%, mean placement, kills, alive%, lifeS,
 *  and participant kills by the killer's tier at the moment of the kill. */
function gunTierTable(groups: readonly BotGunGroup[]): string[] {
  const keyW = Math.max(14, ...groups.map((g) => g.key.length));
  const head = `  ${'gun/tier'.padEnd(keyW)} ${'n'.padStart(5)}${'wins'.padStart(6)}${'win%'.padStart(7)}${'place'.padStart(7)}${'kills'.padStart(7)}${'alive%'.padStart(8)}${'lifeS'.padStart(8)}  killsAtT1..T5`;
  const rows = groups.map((g) => [
    `  ${g.key.padEnd(keyW)} ${String(g.n).padStart(5)}${String(g.wins).padStart(6)}${pct(g.winRate).padStart(7)}`,
    `${(g.meanPlacement === null ? '-' : fmt(g.meanPlacement, 1)).padStart(7)}${fmt(g.kills.mean, 2).padStart(7)}`,
    `${pct(g.aliveRate).padStart(8)}${fmt(g.lifeS.mean, 1).padStart(8)}  ${g.killsByTierTotal.slice(1).join('/')}`,
  ].join(''));
  return [head, ...rows];
}
