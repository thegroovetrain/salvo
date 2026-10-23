// THE 9.13 READOUT BLOCK (Story 9.13 wave 3) — aggregation + deterministic
// rendering of botReadouts.ts, the sibling of botReport.ts's quality table.
//
// NO BAR. Every row is a measurement Eric reads before/after the workover;
// nothing here prints PASS or FAIL (spec AC: "no bar is invented").
//
// Determinism (NFR5, report.ts's contract): pure over the samples, sorted
// keys, fixed-decimal formatting, no wall clock.

import { fmt, fmtSummary, summarize, type Summary } from './stats.js';
import type { MatchSample } from './runner.js';
import type { BotSample } from './botMetrics.js';
import { emptyEdgeTally, emptyFamilyTally, emptyPostureTally } from './botReadouts.js';

/** One profile's posture split (POSTURE block rows). */
export interface PostureGroup {
  key: string;
  n: number;
  ticks: number;
  postureTicks: Record<string, number>;
  postureTransitions: Record<string, number>;
}

/** The pooled 9.13 readouts over a bot campaign (JSON: `variants[].bots.readouts`). */
export interface BotReadoutAggregate {
  /** Σ afloat bot-ticks — the denominator for every *Rate below. */
  ticks: number;
  /** Σ authoritative landContact ticks and its share of afloat ticks. */
  groundedTicks: number;
  groundedRate: number;
  /** Σ landContact runs ≥ CONFIG.bots.stuckMs. */
  stuckEpisodes: number;
  outsideRingTicks: number;
  outsideRingRate: number;
  /** Storm deaths whose last afloat tick was aground OR outside the ring / aground only. */
  stormDeathStuck: number;
  stormDeathAground: number;
  /** Participant kills by the victim's last damage source. */
  killsBySource: Record<string, number>;
  gunShells: number;
  shotsAtDecoy: number;
  shotsAtOwnDecoy: number;
  shotsBeyondRange: Record<string, number>;
  litShots: number;
  starShellsFired: number;
  postureTicks: Record<string, number>;
  postureTransitions: Record<string, number>;
  tacticCounts: Record<string, number>;
  fogTicks: number;
  fogRate: number;
  fogTicksByPosture: Record<string, number>;
  actPresses: number;
  pressesByItem: Record<string, number>;
  activations: Record<string, number>;
  /** Per-match endgame clock and stall (MatchSample.lastTwoS / endgameNoContactMaxS). */
  lastTwoS: Summary;
  endgameNoContactMaxS: Summary;
  droneGroundedTicks: number;
  droneStormDeaths: number;
  byProfile: PostureGroup[];
}

const ratio = (num: number, den: number): number => (den === 0 ? 0 : num / den);

/** Key-wise sum of numeric records onto `base` (keys present in base stay, zeros included). */
function sumRecords(base: Record<string, number>, recs: readonly Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = { ...base };
  for (const r of recs) for (const k of Object.keys(r)) out[k] = (out[k] ?? 0) + r[k];
  return out;
}

const sum = (rows: readonly BotSample[], f: (r: BotSample) => number): number => rows.reduce((a, r) => a + f(r), 0);
const matchSum = (ms: readonly MatchSample[], f: (m: MatchSample) => number | undefined): number =>
  ms.reduce((a, m) => a + (f(m) ?? 0), 0);

export function buildReadoutAggregate(matches: readonly MatchSample[]): BotReadoutAggregate {
  const rows = matches.flatMap((m) => m.bots ?? []);
  const ticks = sum(rows, (r) => r.ticks);
  const grounded = sum(rows, (r) => r.groundedTicks);
  const outside = sum(rows, (r) => r.outsideRingTicks);
  const fog = sum(rows, (r) => r.fogTicks);
  return {
    ticks,
    groundedTicks: grounded,
    groundedRate: ratio(grounded, ticks),
    stuckEpisodes: sum(rows, (r) => r.stuckEpisodes),
    outsideRingTicks: outside,
    outsideRingRate: ratio(outside, ticks),
    stormDeathStuck: sum(rows, (r) => r.stormDeathStuck),
    stormDeathAground: sum(rows, (r) => r.stormDeathAground),
    killsBySource: sumRecords({}, rows.map((r) => r.killsBySource)),
    ...shotReadouts(rows),
    postureTicks: sumRecords(emptyPostureTally(), rows.map((r) => r.postureTicks)),
    postureTransitions: sumRecords(emptyEdgeTally(), rows.map((r) => r.postureTransitions)),
    tacticCounts: sumRecords({}, rows.map((r) => r.tacticCounts)),
    fogTicks: fog,
    fogRate: ratio(fog, ticks),
    fogTicksByPosture: sumRecords(emptyPostureTally(), rows.map((r) => r.fogTicksByPosture)),
    actPresses: sum(rows, (r) => r.actPresses),
    pressesByItem: sumRecords({}, rows.map((r) => r.pressesByItem)),
    activations: sumRecords({}, rows.map((r) => r.activations)),
    lastTwoS: summarize(matches.flatMap((m) => (m.lastTwoS === undefined ? [] : [m.lastTwoS]))),
    endgameNoContactMaxS: summarize(
      matches.flatMap((m) => (m.endgameNoContactMaxS === undefined ? [] : [m.endgameNoContactMaxS])),
    ),
    droneGroundedTicks: matchSum(matches, (m) => m.droneGroundedTicks),
    droneStormDeaths: matchSum(matches, (m) => m.droneStormDeaths),
    byProfile: postureByProfile(rows),
  };
}

type ShotKeys = 'gunShells' | 'shotsAtDecoy' | 'shotsAtOwnDecoy' | 'shotsBeyondRange' | 'litShots' | 'starShellsFired';

function shotReadouts(rows: readonly BotSample[]): Pick<BotReadoutAggregate, ShotKeys> {
  return {
    gunShells: sum(rows, (r) => r.gunShells),
    shotsAtDecoy: sum(rows, (r) => r.shotsAtDecoy),
    shotsAtOwnDecoy: sum(rows, (r) => r.shotsAtOwnDecoy),
    shotsBeyondRange: sumRecords(emptyFamilyTally(), rows.map((r) => r.shotsBeyondRange)),
    litShots: sum(rows, (r) => r.litShots),
    starShellsFired: sum(rows, (r) => r.starShellsFired),
  };
}

function postureByProfile(rows: readonly BotSample[]): PostureGroup[] {
  const by = new Map<string, BotSample[]>();
  for (const r of rows) {
    const list = by.get(r.profile);
    if (list === undefined) by.set(r.profile, [r]);
    else list.push(r);
  }
  return [...by.keys()].sort().map((key) => {
    const list = by.get(key)!;
    return {
      key,
      n: list.length,
      ticks: sum(list, (r) => r.ticks),
      postureTicks: sumRecords(emptyPostureTally(), list.map((r) => r.postureTicks)),
      postureTransitions: sumRecords(emptyEdgeTally(), list.map((r) => r.postureTransitions)),
    };
  });
}

const pct = (f: number): string => `${fmt(f * 100, 1)}%`;

/** `k=v` in sorted key order. */
function countLine(rec: Record<string, number>): string {
  const keys = Object.keys(rec).sort();
  if (keys.length === 0) return '(none)';
  return keys.map((k) => `${k}=${rec[k]}`).join(' ');
}

/** The readout lines printed beside the quality bars (no bar, no verdict). */
export function renderReadoutLines(a: BotReadoutAggregate): string[] {
  return [
    'READOUTS (Story 9.13 — measured, never judged):',
    `  grounded (sim landContact): ${a.groundedTicks} ticks = ${pct(a.groundedRate)} of afloat | stuck episodes (>= CONFIG.bots.stuckMs): ${a.stuckEpisodes}`,
    `  outside the live ring: ${a.outsideRingTicks} ticks = ${pct(a.outsideRingRate)} | storm deaths aground-or-outside: ${a.stormDeathStuck} (aground: ${a.stormDeathAground})`,
    `  kills by source: ${countLine(a.killsBySource)}`,
    `  deck-gun shells: ${a.gunShells} | beyond full range: ${countLine(a.shotsBeyondRange)} | into own light: ${a.litShots} | star shells: ${a.starShellsFired}`,
    `  shells aimed at a decoy: enemy ${a.shotsAtDecoy} | own ${a.shotsAtOwnDecoy}`,
    `  solid fog: ${a.fogTicks} ticks = ${pct(a.fogRate)} of afloat`,
    `  ability presses: ${a.actPresses} | by item: ${countLine(a.pressesByItem)}`,
    `  activations (took effect): ${countLine(a.activations)}`,
    `  endgame (<= 2 hulls) s per match: ${fmtSummary(a.lastTwoS)}`,
    `  endgame longest no-hit gap s: ${fmtSummary(a.endgameNoContactMaxS)}`,
    `  drones: grounded ${a.droneGroundedTicks} ticks | storm deaths ${a.droneStormDeaths}`,
  ];
}

/** The POSTURE block: campaign share per posture, edges, tactics, and the
 *  per-profile split (share of that profile's afloat ticks). */
export function renderPostureBlock(a: BotReadoutAggregate): string[] {
  const postures = Object.keys(a.postureTicks).sort();
  const share = (rec: Record<string, number>, den: number): string =>
    postures.map((p) => `${p}=${pct(ratio(rec[p] ?? 0, den))}`).join(' ');
  const lines = [
    'POSTURE (share of afloat bot-ticks, BotController.postureOf each tick):',
    `  all: ${share(a.postureTicks, a.ticks)}`,
    `  transitions: ${countLine(a.postureTransitions)}`,
    `  in solid fog by posture (ticks): ${countLine(a.fogTicksByPosture)}`,
    `  tactics (changes of lastTacticOf): ${countLine(a.tacticCounts)}`,
  ];
  const keyW = Math.max(8, ...a.byProfile.map((g) => g.key.length));
  for (const g of a.byProfile) {
    lines.push(`  ${g.key.padEnd(keyW)} n=${g.n} ${share(g.postureTicks, g.ticks)} | ${countLine(g.postureTransitions)}`);
  }
  return lines;
}
