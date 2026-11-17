// Aggregation + deterministic report rendering for the batch mode.
//
// Determinism contract (NFR5): every function here is pure over the collected
// samples — identical run key => byte-identical report body. All object keys
// are emitted in explicitly sorted order; all numbers go through fixed-decimal
// formatting. Wall-clock metadata NEVER enters this module (main.ts appends
// the one `meta:` line outside the diffable body).

import { CONFIG, zoneEndgameAtMs } from '@salvo/shared';
import { fmt, fmtSummary, summarize, type Summary } from './stats.js';
import { BOON_N_MAX, LEVEL_SAMPLE_MS, type BatchResult } from './runner.js';

export interface ReachAggregate {
  reachRate: number; // fraction of captain-matches that ever reached it
  timeS: Summary; // among reached
  level: Summary; // among reached
}

export interface BatchAggregate {
  matches: number;
  failures: number;
  captainsPerMatch: number;
  /** Captain-matches excluded from the per-captain rows because the captain's
   *  ship was gone at collection (quit-out path). Always 0 with today's
   *  never-leaving controls; reported only when non-zero so the omission from
   *  every per-captain statistic below can never be silent. */
  departedCaptains: number;
  durationS: Summary;
  /** Duration over RESOLVED matches only (`endedBy !== 'unresolved'`) — Story
   *  3.4. Cap-outs sit at the tick budget (~1321s at production timing) and
   *  would drag every conclusion percentile toward the budget edge, so the
   *  "how long does a match take to CONCLUDE" question gets its own summary.
   *  All-zeros (n=0) when nothing resolved; the renderer prints that as n=0. */
  resolvedDurationS: Summary;
  /** Fraction of RESOLVED matches that concluded past the ENDGAME RING
   *  (`durationS > zoneEndgameAtMs / 1000`) — the Endgame Guarantee evidence
   *  line. 0 when nothing resolved. Measured against the endgame ring rather
   *  than full closure because sudden death (Eric ruling 2026-08-14) separates
   *  the two by a whole ring group: against full closure a healthy campaign
   *  concluding at ~13:00 would score 0% past closure, which is the opposite
   *  of what this line evidences. Identical on a non-collapsing timeline. */
  pastEndgameRate: number;
  /** Winning hull class per match ('none' = no winner, incl. every
   *  unresolved cap-out). Tallied over ALL matches. */
  winnerClass: Record<string, number>;
  endedBy: Record<string, number>;
  stormDeathsTotal: number;
  stormDeaths: Summary;
  killsPerCaptain: Summary;
  deathsPerCaptain: Summary;
  finalLevel: Summary;
  picks: Summary;
  boonsFitted: Summary;
  cappedLines: Summary;
  anyCapRate: number;
  timeToNBoons: { n: number; reachRate: number; timeS: Summary }[];
  /** Story 7-5: the DOCTRINE reaches. Rarity — and with it the old
   *  first-exclusive pair — is deleted (Story 8.1); these are what is left. */
  doctrineOffered: ReachAggregate;
  doctrineFitted: ReachAggregate;
  levelCurve: { tS: number; n: number; mean: number; p50: number }[];
  /** RADIO BEACONS (Story 10.8): beacon XP levels per captain, by class. */
  beaconLevelsByClass: Record<string, Summary>;
  /** AIRDROPS (Story 10.9): drops taken per captain, by class. */
  dropsByClass: Record<string, Summary>;
  /** The index spread at end: bonus points per random-index stat summed over
   *  every captain (`CONFIG.drops.indices` order). */
  indexSpread: Record<string, number>;
  /** `[n]` = paying beacon-ticks with n hulls in range, summed over matches. */
  beaconInRangeHist: number[];
}

function reachAggregate(samples: readonly ({ s: number; level: number } | null)[]): ReachAggregate {
  const reached = samples.filter((r): r is { s: number; level: number } => r !== null);
  return {
    reachRate: samples.length === 0 ? 0 : reached.length / samples.length,
    timeS: summarize(reached.map((r) => r.s)),
    level: summarize(reached.map((r) => r.level)),
  };
}

function aggregateBoonTimes(captains: readonly { boonTimesS: (number | null)[] }[]): BatchAggregate['timeToNBoons'] {
  const out: BatchAggregate['timeToNBoons'] = [];
  for (let n = 1; n <= BOON_N_MAX; n += 1) {
    const times = captains.map((c) => c.boonTimesS[n - 1]);
    const reached = times.filter((t): t is number => t !== null);
    out.push({
      n,
      reachRate: times.length === 0 ? 0 : reached.length / times.length,
      timeS: summarize(reached),
    });
  }
  return out;
}

function aggregateLevelCurve(captains: readonly { levelCurve: number[] }[]): BatchAggregate['levelCurve'] {
  // reduce, never Math.max(...arr): the captain array is unbounded (matches x
  // captains) and an argument spread over ~100k+ entries throws RangeError.
  const buckets = captains.reduce((m, c) => Math.max(m, c.levelCurve.length), 0);
  const out: BatchAggregate['levelCurve'] = [];
  for (let k = 0; k < buckets; k += 1) {
    const values = captains.filter((c) => c.levelCurve.length > k).map((c) => c.levelCurve[k]);
    const s = summarize(values);
    out.push({ tS: (k * LEVEL_SAMPLE_MS) / 1000, n: s.n, mean: s.mean, p50: s.p50 });
  }
  return out;
}

/** Element-wise sum of the per-match hulls-in-range histograms. */
export function sumHist(hists: readonly (readonly number[] | undefined)[]): number[] {
  const out: number[] = [];
  for (const h of hists) {
    if (h === undefined) continue;
    for (let n = 0; n < h.length; n += 1) out[n] = (out[n] ?? 0) + (h[n] ?? 0);
  }
  return Array.from(out, (v) => v ?? 0);
}

/** The hist as one compact row: `0=… 1=… 2=…` (or `(none)`). */
export function histLine(hist: readonly number[]): string {
  return hist.length === 0 ? '(none)' : hist.map((v, n) => `${n}=${v}`).join(' ');
}

/** One per-captain number, summarized per hull class (sorted keys). */
function byClass<C extends { cls: string }>(captains: readonly C[], value: (c: C) => number): Record<string, Summary> {
  const byCls = new Map<string, number[]>();
  for (const c of captains) {
    const rows = byCls.get(c.cls) ?? [];
    rows.push(value(c));
    byCls.set(c.cls, rows);
  }
  const out: Record<string, Summary> = {};
  for (const cls of [...byCls.keys()].sort()) out[cls] = summarize(byCls.get(cls)!);
  return out;
}

/** THE INDEX SPREAD (Story 10.9): every captain's bonus points per
 *  random-index stat, summed — one entry per `CONFIG.drops.indices` stat, in
 *  that order (a stat nobody got reads 0). */
export function indexSpread(captains: readonly { indexBonus: Record<string, number> }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of CONFIG.drops.indices) out[id] = captains.reduce((n, c) => n + (c.indexBonus[id] ?? 0), 0);
  return out;
}

/** `cls=mean` per class (sorted keys), or `(none)`. */
function meansLine(rec: Record<string, Summary>): string {
  const rows = Object.entries(rec).map(([cls, s]) => `${cls}=${fmt(s.mean, 2)}`);
  return rows.length === 0 ? '(none)' : rows.join(' ');
}

/** Resolved-only conclusion evidence (Story 3.4): the duration summary and the
 *  past-closure rate, both over matches that actually CONCLUDED. Reads the LIVE
 *  CONFIG.zone (so a --set zone.* override moves the closure threshold with the
 *  run it describes). */
function resolvedEvidence(
  matches: readonly { durationS: number; endedBy: string }[],
): Pick<BatchAggregate, 'resolvedDurationS' | 'pastEndgameRate'> {
  const resolved = matches.filter((m) => m.endedBy !== 'unresolved');
  const closureS = zoneEndgameAtMs(CONFIG.zone) / 1000;
  // durationS arrives rounded to 0.1s, so this classification has a ±50ms
  // band at exactly-closure; strict `>` keeps the claim conservative (a
  // borderline match counts as NOT past), and the endgame instrument
  // structurally lands well past the boundary, so the band is never the
  // deciding factor in practice.
  const past = resolved.filter((m) => m.durationS > closureS).length;
  return {
    resolvedDurationS: summarize(resolved.map((m) => m.durationS)),
    pastEndgameRate: resolved.length === 0 ? 0 : past / resolved.length,
  };
}

export function buildAggregate(result: BatchResult, captainsPerMatch: number): BatchAggregate {
  const matches = result.matches;
  const captains = matches.flatMap((m) => m.captains);
  const endedBy: Record<string, number> = {};
  const winnerClass: Record<string, number> = {};
  for (const m of matches) {
    endedBy[m.endedBy] = (endedBy[m.endedBy] ?? 0) + 1;
    const cls = m.winnerClass ?? 'none';
    winnerClass[cls] = (winnerClass[cls] ?? 0) + 1;
  }
  const stormDeaths = matches.map((m) => m.stormDeaths);
  return {
    matches: matches.length,
    failures: result.failures.length,
    captainsPerMatch,
    departedCaptains: matches.reduce((n, m) => n + (m.departedCaptains?.length ?? 0), 0),
    durationS: summarize(matches.map((m) => m.durationS)),
    ...resolvedEvidence(matches),
    winnerClass,
    endedBy,
    stormDeathsTotal: stormDeaths.reduce((a, b) => a + b, 0),
    stormDeaths: summarize(stormDeaths),
    killsPerCaptain: summarize(captains.map((c) => c.kills)),
    deathsPerCaptain: summarize(captains.map((c) => c.deaths)),
    finalLevel: summarize(captains.map((c) => c.finalLevel)),
    picks: summarize(captains.map((c) => c.picks)),
    boonsFitted: summarize(captains.map((c) => c.boonsFitted)),
    cappedLines: summarize(captains.map((c) => c.cappedLines)),
    anyCapRate: captains.length === 0 ? 0 : captains.filter((c) => c.cappedLines > 0).length / captains.length,
    timeToNBoons: aggregateBoonTimes(captains),
    doctrineOffered: reachAggregate(captains.map((c) => c.firstDoctrineOffered)),
    doctrineFitted: reachAggregate(captains.map((c) => c.firstDoctrineFitted)),
    levelCurve: aggregateLevelCurve(captains),
    beaconLevelsByClass: byClass(captains, (c) => c.beaconXpLevels),
    dropsByClass: byClass(captains, (c) => c.dropsTaken),
    indexSpread: indexSpread(captains),
    beaconInRangeHist: sumHist(matches.map((m) => m.beaconInRangeHist)),
  };
}

// --- rendering ---------------------------------------------------------------

const pct = (f: number): string => `${fmt(f * 100, 1)}%`;

function countLine(rec: Record<string, number>): string {
  const keys = Object.keys(rec).sort();
  if (keys.length === 0) return '(none)';
  return keys.map((k) => `${k}=${rec[k]}`).join(' ');
}

function reachLine(label: string, r: ReachAggregate): string {
  return `${label}: reach=${pct(r.reachRate)} timeS[${fmtSummary(r.timeS)}] level[${fmtSummary(r.level)}]`;
}

/** The full human-readable report body for one variant, as lines. */
export function renderBatchReport(label: string, agg: BatchAggregate): string[] {
  const lines: string[] = [];
  lines.push(`== BATCH ${label} ==`);
  lines.push(`matches: ${agg.matches} completed, ${agg.failures} failed | captains/match: ${agg.captainsPerMatch}`);
  if (agg.departedCaptains > 0) {
    lines.push(`departed captains EXCLUDED from per-captain rows: ${agg.departedCaptains}`);
  }
  lines.push(`match length s: ${fmtSummary(agg.durationS)}`);
  // Story 3.4: conclusions, separated from cap-outs (see BatchAggregate).
  const resolvedN = agg.resolvedDurationS.n;
  lines.push(`resolved match length s: ${resolvedN === 0 ? 'n=0' : fmtSummary(agg.resolvedDurationS)}`);
  lines.push(`resolved past endgame ring: ${resolvedN === 0 ? 'n=0' : pct(agg.pastEndgameRate)}`);
  lines.push(`endedBy: ${countLine(agg.endedBy)}`);
  lines.push(`winner class: ${countLine(agg.winnerClass)}`);
  lines.push(`storm deaths: total=${agg.stormDeathsTotal} per-match[${fmtSummary(agg.stormDeaths)}]`);
  lines.push(`beacon hulls-in-range (paying beacon-ticks): ${histLine(agg.beaconInRangeHist)}`);
  // A BOT-ONLY LOBBY has no captain rows at all, and printing 20 lines of
  // all-zero economy summaries under a bot campaign would read as evidence
  // about bots. Suppressed entirely; every captain run is byte-unchanged.
  if (agg.captainsPerMatch > 0) lines.push(...captainEconomyLines(agg));
  return lines;
}

/** The per-captain economy block — see renderBatchReport's suppression note. */
function captainEconomyLines(agg: BatchAggregate): string[] {
  const lines: string[] = [];
  lines.push(`kills per captain: ${fmtSummary(agg.killsPerCaptain)}`);
  lines.push(`deaths per captain: ${fmtSummary(agg.deathsPerCaptain)}`);
  lines.push(`final level per captain: ${fmtSummary(agg.finalLevel)}`);
  lines.push(`picks per captain: ${fmtSummary(agg.picks)}`);
  lines.push(`boons fitted per captain: ${fmtSummary(agg.boonsFitted)}`);
  lines.push(`beacon levels per captain (mean by class): ${meansLine(agg.beaconLevelsByClass)}`);
  lines.push(`drops taken per captain (mean by class): ${meansLine(agg.dropsByClass)}`);
  lines.push('index spread at end (bonus points per stat, summed over captains):');
  for (const [stat, n] of Object.entries(agg.indexSpread)) lines.push(`  ${stat.padEnd(8)} ${n}`);
  lines.push(`copy-capped lines per captain: ${fmtSummary(agg.cappedLines)} | captains with >=1 cap: ${pct(agg.anyCapRate)}`);
  lines.push(reachLine('first doctrine OFFERED ', agg.doctrineOffered));
  lines.push(reachLine('first doctrine FITTED  ', agg.doctrineFitted));
  lines.push('time-to-N-boons (sim-s):');
  for (const row of agg.timeToNBoons) {
    lines.push(`  N=${String(row.n).padStart(2)} reach=${pct(row.reachRate).padStart(6)} ${fmtSummary(row.timeS)}`);
  }
  lines.push('level curve (level vs sim-time since activation):');
  for (const row of agg.levelCurve) {
    lines.push(`  t=${String(row.tS).padStart(4)}s n=${String(row.n).padStart(3)} mean=${fmt(row.mean, 2)} p50=${fmt(row.p50, 1)}`);
  }
  return lines;
}

/** Side-by-side comparison of key rows across sweep variants. */
export function renderComparison(variants: readonly { label: string; agg: BatchAggregate }[]): string[] {
  const rows: { name: string; value: (a: BatchAggregate) => string }[] = [
    { name: 'match length p50 s', value: (a) => fmt(a.durationS.p50) },
    { name: 'final level p50', value: (a) => fmt(a.finalLevel.p50) },
    { name: 'final level mean', value: (a) => fmt(a.finalLevel.mean, 2) },
    { name: 'picks p50', value: (a) => fmt(a.picks.p50) },
    { name: 'boons fitted p50', value: (a) => fmt(a.boonsFitted.p50) },
    { name: 'doctrine OFFERED reach', value: (a) => pct(a.doctrineOffered.reachRate) },
    { name: 'doctrine FITTED reach', value: (a) => pct(a.doctrineFitted.reachRate) },
    { name: 'doctrine FITTED p50 s', value: (a) => fmt(a.doctrineFitted.timeS.p50) },
    { name: 'kills/captain mean', value: (a) => fmt(a.killsPerCaptain.mean, 2) },
    { name: 'storm deaths total', value: (a) => String(a.stormDeathsTotal) },
    { name: 'endedBy', value: (a) => countLine(a.endedBy) },
  ];
  const nameW = Math.max(...rows.map((r) => r.name.length));
  const colW = Math.max(18, ...variants.map((v) => v.label.length));
  const lines: string[] = ['== SWEEP COMPARISON =='];
  lines.push(`${' '.repeat(nameW)} | ${variants.map((v) => v.label.padEnd(colW)).join(' | ')}`);
  for (const row of rows) {
    lines.push(`${row.name.padEnd(nameW)} | ${variants.map((v) => row.value(v.agg).padEnd(colW)).join(' | ')}`);
  }
  return lines;
}
