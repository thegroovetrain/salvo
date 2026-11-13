// Tick-cost probe (Story 11.2 follow-up) — a DIAGNOSTIC, never a verdict.
//
// One fixed scenario, offline (no sockets, no room): 1 idle captain + bots on
// one map seed, stepped the way ArenaRoom steps a solo room — `world.step()`,
// `match.update()`, then the captain's own frame (`buildFrame`, the one
// per-client `observe()` a solo room pays; every bot's `observe()` runs inside
// the step). It reports the wall cost of a tick over the first seconds of the
// ACTIVE phase beside the WORK counters the perception guard test bounds
// (fog lattice walks, island narrow-phase tests) and the live shell count.
//
// The milliseconds compare two builds ON ONE MACHINE and say nothing about a
// host; the counters are the portable half. Deterministic per (seed, hulls,
// seconds) except for the wall-clock columns.
//
// Run through ../tickCost.mjs (the HC_DEV_OPTIONS gate + tsx bootstrap).

import { performance } from 'node:perf_hooks';
import { CONFIG, zoneGroups } from '@salvo/shared';
import { World } from '../../src/game/world.js';
import { Match, type MatchHooks, type MatchTimings } from '../../src/game/match.js';
import { buildFrame } from '../../src/game/frames.js';

interface Args {
  seed: number;
  hulls: number;
  seconds: number;
}

/** Optional work counters — read structurally so the probe also runs on a
 *  build that predates one of them (it then prints `n/a`). */
interface WorkCounters {
  fogWalks?: number;
  losTests?: number;
}

function numArg(argv: readonly string[], flag: string, fallback: number): number {
  const i = argv.indexOf(flag);
  if (i < 0) return fallback;
  const v = Number(argv[i + 1]);
  if (!Number.isFinite(v) || v <= 0) throw new Error(`tickCost: ${flag} needs a positive number`);
  return v;
}

function parseArgs(argv: readonly string[]): Args {
  return {
    seed: numArg(argv, '--seed', 7),
    hulls: Math.floor(numArg(argv, '--hulls', CONFIG.map.playerCap)),
    // Capped: this is one short scenario, never a batch sim.
    seconds: Math.min(120, numArg(argv, '--seconds', 62)),
  };
}

function hooks(): MatchHooks {
  return { lock: () => {}, unlock: () => {}, broadcastResults: () => {}, requeue: () => {}, disconnect: () => {} };
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function mean(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return xs.length > 0 ? s / xs.length : 0;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function perTick(total: number | undefined, base: number | undefined, ticks: number): string {
  if (total === undefined || base === undefined) return 'n/a';
  return ((total - base) / ticks).toFixed(1);
}

function buildWorld(args: Args): { world: World; match: Match; captain: string } {
  const zoneSeeds = Array.from({ length: zoneGroups(CONFIG.zone) }, (_, i) => (args.seed * 7919 + i * 104729) >>> 0);
  const world = new World(args.seed, Math.max(CONFIG.map.playerCap, args.hulls), CONFIG.zone, {
    zoneSeeds,
    pseudonymSeed: 0x51ed270b,
    dispersionKey: new Uint8Array(32).fill(7),
  });
  const timings: MatchTimings = {
    countdownMs: 1000,
    resultsMs: CONFIG.match.resultsSeconds * 1000,
    joinWindowMs: 0,
    minHumans: 1,
  };
  const match = new Match(world, timings, hooks());
  const captain = 'cap-1';
  world.addShip(captain, 'CAP-01', 'captain', undefined, undefined, undefined);
  for (let i = 1; i < args.hulls; i += 1) world.addBot(undefined, undefined);
  match.notifyRosterChanged();
  return { world, match, captain };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const { world, match, captain } = buildWorld(args);
  const counters = world as unknown as WorkCounters;
  const dt = CONFIG.tick.simDtMs;
  const want = Math.ceil((args.seconds * 1000) / dt);
  const ms: number[] = [];
  const shells: number[] = [];
  let walks0: number | undefined;
  let los0: number | undefined;
  for (let guard = 0; guard < want + 2000 && ms.length < want; guard += 1) {
    const active = match.phase === 'active';
    if (active && ms.length === 0) {
      walks0 = counters.fogWalks;
      los0 = counters.losTests;
    }
    const t0 = performance.now();
    world.step();
    match.update();
    buildFrame(world, captain, match.phase);
    const cost = performance.now() - t0;
    if (!active) continue;
    ms.push(cost);
    shells.push(world.shells.size);
  }
  if (ms.length === 0) throw new Error('tickCost: the match never went active');
  const sorted = [...ms].sort((a, b) => a - b);
  const first = ms.slice(0, Math.ceil(10000 / dt));
  const shellsSorted = [...shells].sort((a, b) => a - b);
  console.log(`tickCost: seed ${args.seed}, ${args.hulls} hulls, ${ms.length} active ticks (${((ms.length * dt) / 1000).toFixed(0)} s), phase at end: ${match.phase}`);
  console.log(`ms/tick   mean ${fmt(mean(ms))}  p50 ${fmt(quantile(sorted, 0.5))}  p95 ${fmt(quantile(sorted, 0.95))}  p99 ${fmt(quantile(sorted, 0.99))}  max ${fmt(sorted[sorted.length - 1])}  first-10s mean ${fmt(mean(first))}`);
  console.log(`shells    mean ${mean(shells).toFixed(1)}  p50 ${quantile(shellsSorted, 0.5)}  peak ${shellsSorted[shellsSorted.length - 1]}`);
  console.log(`work/tick fog walks ${perTick(counters.fogWalks, walks0, ms.length)}  island narrow-phase tests ${perTick(counters.losTests, los0, ms.length)}`);
  const afloat = [...world.ships.values()].filter((s) => s.lifecycle.kind === 'alive').length;
  console.log(`end state ships ${world.ships.size} (afloat ${afloat}), fog cut ${world.fogCut}`);
}

main();
