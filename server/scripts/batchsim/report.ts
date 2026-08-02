// Aggregation + deterministic report rendering for the batch mode.
//
// Determinism contract (NFR5): every function here is pure over the collected
// samples — identical run key => byte-identical report body. All object keys
// are emitted in explicitly sorted order; all numbers go through fixed-decimal
// formatting. Wall-clock metadata NEVER enters this module (main.ts appends
// the one `meta:` line outside the diffable body).

import { CONFIG, zoneClosedAtMs } from '@salvo/shared';
import { fmt, fmtSummary, summarize, type Summary } from './stats.js';
import { BOON_N_MAX, LEVEL_SAMPLE_MS, type BatchResult } from './runner.js';
import type { DeckAggregate } from './deckSim.js';

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
   *  never-leaving pilots; reported only when non-zero so the omission from
   *  every per-captain statistic below can never be silent. */
  departedCaptains: number;
  durationS: Summary;
  /** Duration over RESOLVED matches only (`endedBy !== 'unresolved'`) — Story
   *  3.4. Cap-outs sit at the tick budget (~1321s at production timing) and
   *  would drag every conclusion percentile toward the budget edge, so the
   *  "how long does a match take to CONCLUDE" question gets its own summary.
   *  All-zeros (n=0) when nothing resolved; the renderer prints that as n=0. */
  resolvedDurationS: Summary;
  /** Fraction of RESOLVED matches that concluded past full zone closure
   *  (`durationS > zoneClosedAtMs / 1000`) — the Endgame Guarantee evidence
   *  line. 0 when nothing resolved. */
  pastClosureRate: number;
  /** Winning hull class per match ('none' = no winner, incl. every
   *  unresolved cap-out). Tallied over ALL matches. */
  winnerClass: Record<string, number>;
  endedBy: Record<string, number>;
  stormDeathsTotal: number;
  stormDeaths: Summary;
  killsByVictimTier: Record<string, number>;
  killsPerCaptain: Summary;
  deathsPerCaptain: Summary;
  finalLevel: Summary;
  picks: Summary;
  boonsFitted: Summary;
  deckRemaining: Summary;
  cappedLines: Summary;
  anyCapRate: number;
  timeToNBoons: { n: number; reachRate: number; timeS: Summary }[];
  exclusiveOffered: ReachAggregate;
  exclusiveFitted: ReachAggregate;
  levelCurve: { tS: number; n: number; mean: number; p50: number }[];
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

function sumByKey(records: readonly Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rec of records) {
    for (const key of Object.keys(rec)) out[key] = (out[key] ?? 0) + rec[key];
  }
  return out;
}

/** Resolved-only conclusion evidence (Story 3.4): the duration summary and the
 *  past-closure rate, both over matches that actually CONCLUDED. Reads the LIVE
 *  CONFIG.zone (so a --set zone.* override moves the closure threshold with the
 *  run it describes). */
function resolvedEvidence(
  matches: readonly { durationS: number; endedBy: string }[],
): Pick<BatchAggregate, 'resolvedDurationS' | 'pastClosureRate'> {
  const resolved = matches.filter((m) => m.endedBy !== 'unresolved');
  const closureS = zoneClosedAtMs(CONFIG.zone) / 1000;
  const past = resolved.filter((m) => m.durationS > closureS).length;
  return {
    resolvedDurationS: summarize(resolved.map((m) => m.durationS)),
    pastClosureRate: resolved.length === 0 ? 0 : past / resolved.length,
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
    killsByVictimTier: sumByKey(matches.map((m) => m.killsByVictimTier)),
    killsPerCaptain: summarize(captains.map((c) => c.kills)),
    deathsPerCaptain: summarize(captains.map((c) => c.deaths)),
    finalLevel: summarize(captains.map((c) => c.finalLevel)),
    picks: summarize(captains.map((c) => c.picks)),
    boonsFitted: summarize(captains.map((c) => c.boonsFitted)),
    deckRemaining: summarize(captains.map((c) => c.deckRemaining)),
    cappedLines: summarize(captains.map((c) => c.cappedLines)),
    anyCapRate: captains.length === 0 ? 0 : captains.filter((c) => c.cappedLines > 0).length / captains.length,
    timeToNBoons: aggregateBoonTimes(captains),
    exclusiveOffered: reachAggregate(captains.map((c) => c.firstExclusiveOffered)),
    exclusiveFitted: reachAggregate(captains.map((c) => c.firstExclusiveFitted)),
    levelCurve: aggregateLevelCurve(captains),
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
  lines.push(`resolved past full closure: ${resolvedN === 0 ? 'n=0' : pct(agg.pastClosureRate)}`);
  lines.push(`endedBy: ${countLine(agg.endedBy)}`);
  lines.push(`winner class: ${countLine(agg.winnerClass)}`);
  lines.push(`storm deaths: total=${agg.stormDeathsTotal} per-match[${fmtSummary(agg.stormDeaths)}]`);
  lines.push(`captain kills by victim tier: ${countLine(agg.killsByVictimTier)}`);
  lines.push(`kills per captain: ${fmtSummary(agg.killsPerCaptain)}`);
  lines.push(`deaths per captain: ${fmtSummary(agg.deathsPerCaptain)}`);
  lines.push(`final level per captain: ${fmtSummary(agg.finalLevel)}`);
  lines.push(`picks per captain: ${fmtSummary(agg.picks)}`);
  lines.push(`boons fitted per captain: ${fmtSummary(agg.boonsFitted)}`);
  lines.push(`deck cards remaining: ${fmtSummary(agg.deckRemaining)}`);
  lines.push(`copy-capped lines per captain: ${fmtSummary(agg.cappedLines)} | captains with >=1 cap: ${pct(agg.anyCapRate)}`);
  lines.push(reachLine('first exclusive OFFERED', agg.exclusiveOffered));
  lines.push(reachLine('first exclusive FITTED ', agg.exclusiveFitted));
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

/** The deck-only mode's report body (pity curve + exclusive/cap evidence).
 *  The stopping-rule caveat is printed IN the report, not just in the code:
 *  see deckSim.ts's header — production never terminates an economy. */
export function renderDeckReport(label: string, agg: DeckAggregate): string[] {
  const lines: string[] = [];
  lines.push(`== DECK-ONLY ${label} ==`);
  lines.push('stopping rule (harness model, NOT production): an economy ends when the deck is');
  lines.push('EMPTY OR holds only terminal rival cards. Production has no economy termination —');
  lines.push('a fitted doctrine returns its rival to the deck forever. All variants share this');
  lines.push('rule, so cross-variant deltas are comparable; per-economy totals are model numbers.');
  lines.push(`economies: ${agg.economies} | total draws: ${agg.totalDraws}`);
  lines.push(`draws played per economy: ${fmtSummary(agg.drawsPlayed)} | decks empty-or-rivals-only at stop: ${pct(agg.deckExhaustedRate)}`);
  lines.push('pity curve (rare/exclusive landing rate vs pre-draw levelsSinceRare):');
  for (const row of agg.pity) {
    if (row.draws === 0) continue;
    const dry = row.dry === 15 ? '15+' : String(row.dry);
    lines.push(`  dry=${dry.padStart(3)} draws=${String(row.draws).padStart(6)} rareRate=${pct(row.rareRate)}`);
  }
  lines.push(`first exclusive OFFERED: reach=${pct(agg.exclusiveOfferedReach)} drawIndex[${fmtSummary(agg.exclusiveOfferedDraw)}]`);
  lines.push(`first exclusive PICKED : reach=${pct(agg.exclusivePickedReach)} drawIndex[${fmtSummary(agg.exclusivePickedDraw)}]`);
  lines.push(`copy-capped lines per economy: ${fmtSummary(agg.cappedLines)} | economies with >=1 cap: ${pct(agg.anyCapRate)}`);
  lines.push('deck depletion (mean cards remaining after draw k AND its immediate spend, give-backs included):');
  for (const row of agg.depletion) {
    lines.push(`  k=${String(row.draw).padStart(3)} n=${String(row.n).padStart(6)} meanRemaining=${fmt(row.meanRemaining, 1)}`);
  }
  return lines;
}

/** Side-by-side comparison across sweep variants — deck-only mode. */
export function renderDeckComparison(variants: readonly { label: string; agg: DeckAggregate }[]): string[] {
  const rows: { name: string; value: (a: DeckAggregate) => string }[] = [
    { name: 'draws played p50', value: (a) => fmt(a.drawsPlayed.p50) },
    { name: 'empty-or-rivals-only', value: (a) => pct(a.deckExhaustedRate) },
    { name: 'rareRate dry=0', value: (a) => pct(a.pity[0]?.rareRate ?? 0) },
    { name: 'rareRate dry=3', value: (a) => pct(a.pity[3]?.rareRate ?? 0) },
    { name: 'rareRate dry=6', value: (a) => pct(a.pity[6]?.rareRate ?? 0) },
    { name: 'excl OFFERED reach', value: (a) => pct(a.exclusiveOfferedReach) },
    { name: 'excl OFFERED p50 draw', value: (a) => fmt(a.exclusiveOfferedDraw.p50) },
    { name: 'excl PICKED p50 draw', value: (a) => fmt(a.exclusivePickedDraw.p50) },
    { name: 'capped lines mean', value: (a) => fmt(a.cappedLines.mean, 2) },
  ];
  const nameW = Math.max(...rows.map((r) => r.name.length));
  const colW = Math.max(18, ...variants.map((v) => v.label.length));
  const lines: string[] = ['== SWEEP COMPARISON (deck-only) =='];
  lines.push(`${' '.repeat(nameW)} | ${variants.map((v) => v.label.padEnd(colW)).join(' | ')}`);
  for (const row of rows) {
    lines.push(`${row.name.padEnd(nameW)} | ${variants.map((v) => row.value(v.agg).padEnd(colW)).join(' | ')}`);
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
    { name: 'excl OFFERED reach', value: (a) => pct(a.exclusiveOffered.reachRate) },
    { name: 'excl FITTED reach', value: (a) => pct(a.exclusiveFitted.reachRate) },
    { name: 'excl FITTED p50 s', value: (a) => fmt(a.exclusiveFitted.timeS.p50) },
    { name: 'deck remaining p50', value: (a) => fmt(a.deckRemaining.p50) },
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
