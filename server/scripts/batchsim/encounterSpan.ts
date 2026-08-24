// MEASUREMENT ONLY — how long is an engagement, and how much of a kill's damage
// is recent? Answers Eric's question (2026-08-23) about whether the assist
// window is the right size, which nothing in the harness instrumented. It is
// the run behind the shipped 60 s: median span 332 s, median SIX attackers per
// sink, only ~24 % of a hull's lifetime damage inside its last 30 s.
//
// WHY A STANDALONE SCRIPT rather than a botMetrics collector: the assist ledger
// (`ShipRecord.damageFrom`) is CLEARED inside `world.step()` at the instant of
// sinking, so anything reading it after the step sees an empty map. This
// snapshots every hull's ledger BEFORE each step and, on detecting a sink,
// reads that snapshot — the last state before the wipe.
//
// It changes no game code and adds no measurement to world.ts.
//
//   node_modules/.bin/tsx --tsconfig server/scripts/batchsim/tsconfig.json \
//     server/scripts/batchsim/encounterSpan.ts [matches] [seed]

import { CONFIG, SHIP_CLASS_IDS, isAfloat } from '@salvo/shared';
import { World } from '../../src/game/world.js';
import { Match } from '../../src/game/match.js';
import { isFleetHull } from '../../src/game/participants.js';
import { mixSeed } from './stats.js';

const MATCHES = Number(process.argv[2] ?? 40);
const SEED = Number(process.argv[3] ?? 90210);

// DELIBERATELY WIDER THAN ANY WINDOW UNDER TEST. Buckets are pruned to the live
// window, so a run at the shipped 60 s could only report fractions up to 60 s.
// Holding 150 s of history makes every candidate window below it EXACT rather
// than a lower bound — which is the whole point of this run. Widening the ONE
// dial also widens the per-attacker restart gap, so a tally survives the whole
// history too. Mutating CONFIG in-process is the same mechanism the harness's
// own overrides use.
const HISTORY_MS = 150000;
(CONFIG.xp as { assistWindowMs: number }).assistWindowMs = HISTORY_MS;

/** The candidate windows to report, in seconds. */
const WINDOWS = [10, 20, 30, 45, 60, 90, 120];

interface Per {
  amount: number;
  last: number;
  buckets: { at: number; amount: number }[];
}
interface Sink {
  attackers: number;
  total: number;
  spanS: number;
  lastGapS: number;
  frac: number[];
  qualifying: number[];
}

const sinks: Sink[] = [];

for (let m = 0; m < MATCHES; m++) {
  const world = new World(mixSeed(SEED, m));
  // No-op hooks: the room-layer side effects (lock, results broadcast,
  // disconnect) have no meaning in a headless measurement run.
  const match = new Match(
    world,
    { joinWindowMs: 0, countdownMs: 1000, minHumans: 0, resultsMs: 1000 },
    { lock: () => {}, unlock: () => {}, broadcastResults: () => {}, requeue: () => {}, disconnect: () => {} },
  );
  // Even roster, offset by match index — the same deal the campaigns use via
  // `--roster even`, so an over-represented class cannot skew the reading.
  for (let i = 0; i < 20; i++) world.addBot(SHIP_CLASS_IDS[(i + m) % SHIP_CLASS_IDS.length]);
  match.notifyRosterChanged();

  let prev = new Map<string, Per[]>();
  const wasAfloat = new Set<string>();
  // TRUE first-damage time per hull. It cannot come from the buckets: those are
  // pruned to the window, so an engagement longer than 30 s would read as
  // exactly 30 s. Cleared when a hull's ledger empties, which is what a sink or
  // redeploy does.
  const firstDmg = new Map<string, number>();
  const cap = CONFIG.zone.beatMs * 4 * 4 + 300000;

  while (world.now < cap && match.phase !== 'results' && match.phase !== 'finished') {
    const snap = new Map<string, Per[]>();
    for (const s of world.ships.values()) {
      if (isFleetHull(s)) continue;
      if (isAfloat(s.lifecycle)) wasAfloat.add(s.id);
      if (s.damageFrom.size === 0) {
        firstDmg.delete(s.id);
        continue;
      }
      if (!firstDmg.has(s.id)) firstDmg.set(s.id, world.now);
      const per: Per[] = [];
      for (const rec of s.damageFrom.values()) {
        per.push({ amount: rec.amount, last: rec.at, buckets: rec.buckets.map((b) => ({ ...b })) });
      }
      snap.set(s.id, per);
    }

    world.step();
    match.update();

    for (const s of world.ships.values()) {
      if (isFleetHull(s) || !wasAfloat.has(s.id) || isAfloat(s.lifecycle)) continue;
      wasAfloat.delete(s.id);
      const per = snap.get(s.id) ?? prev.get(s.id);
      if (per === undefined || per.length === 0) continue;
      const now = world.now;
      let total = 0;
      for (const p of per) total += p.amount;
      const firstSeen = firstDmg.get(s.id) ?? now;
      firstDmg.delete(s.id);
      if (total <= 0) continue;
      // Buckets are pruned to roughly the LIVE window, so windows longer than
      // CONFIG.xp.assistWindowMs read as lower bounds. `total` is the true
      // lifetime figure, which is what makes the fractions meaningful.
      const within = (ms: number): number => {
        const cutoff = now - ms;
        let sum = 0;
        for (const p of per) for (const b of p.buckets) if (b.at >= cutoff) sum += b.amount;
        return sum;
      };
      sinks.push({
        attackers: per.length,
        total,
        spanS: (now - firstSeen) / 1000,
        lastGapS: (now - Math.max(...per.map((p) => p.last))) / 1000,
        frac: WINDOWS.map((w) => Math.min(1, within(w * 1000) / total)),
        // How many of this hull's attackers would still QUALIFY at that window
        // — the sliding rule pays anyone with damage inside it.
        qualifying: WINDOWS.map((w) => per.filter((x) => x.buckets.some((b) => b.at >= now - w * 1000)).length),
      });
    }
    prev = snap;
  }
  if ((m + 1) % 10 === 0) process.stderr.write(`  ${m + 1}/${MATCHES} matches\n`);
}

const q = (arr: number[], p: number): number => {
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p * a.length))];
};
const col = (k: 'attackers' | 'total' | 'spanS' | 'lastGapS'): number[] => sinks.map((s) => s[k]);
const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const line = (name: string, arr: number[], unit = ''): void =>
  console.log(
    `  ${name.padEnd(32)} p25 ${q(arr, 0.25).toFixed(2)}${unit}  p50 ${q(arr, 0.5).toFixed(2)}${unit}  p75 ${q(arr, 0.75).toFixed(2)}${unit}  p95 ${q(arr, 0.95).toFixed(2)}${unit}`,
  );

if (sinks.length === 0) {
  console.log('\nNo participant sinks recorded — nothing to report.\n');
  process.exit(0);
}

console.log(`\nENCOUNTER SPAN — ${sinks.length} participant sinks over ${MATCHES} matches`);
console.log(`(assistWindowMs = ${CONFIG.xp.assistWindowMs})\n`);
line('damage span, first hit to sink', col('spanS'), 's');
line('gap, last hit to sink', col('lastGapS'), 's');
line('attackers per sink', col('attackers'));
console.log('');
console.log('  window    mean % of a kill\'s damage captured    mean attackers qualifying    all-damage-captured');
for (let i = 0; i < WINDOWS.length; i++) {
  const f = sinks.map((x) => x.frac[i]);
  const qn = sinks.map((x) => x.qualifying[i]);
  const whole = (f.filter((v) => v > 0.999).length / sinks.length) * 100;
  console.log(
    `   ${String(WINDOWS[i]).padStart(3)}s${(mean(f) * 100).toFixed(1).padStart(23)}%${mean(qn).toFixed(2).padStart(28)}${whole.toFixed(1).padStart(21)}%`,
  );
}
console.log(`  mean span ${mean(col('spanS')).toFixed(1)}s   mean attackers ${mean(col('attackers')).toFixed(2)}\n`);
