// THE MACHINE GUN'S FLASH COST (Story 8.15 acceptance criterion, epic-8
// amendments 89(i) / 103 / 109): twenty machine-gun bots streaming at each
// other in ONE World, driven through the real BotController (the bots' own
// `held` level through the ordinary input pipeline — no privileged path), with
// every stream shell emitting its OWN `mz`. The question is whether the per-shell
// flash (and the shells behind it) fits the 50 ms server tick.
//
// THE PATTERN is hitTargets.test.ts's perf pin: a fresh fixture per run, built
// OUTSIDE the clock, `performance.now()` around the work, best-of-5, the
// numbers printed under `HC_PERF_LOG=1`, and the ASSERTION is the tick budget.
// Here the timed work is `world.step()` over a 200-tick window after a warm-up
// in which the bots acquire each other (the reaction gate) and open fire.
//
// RECORDED 2026-09-28 on the dev machine (Darwin 25.4, Node v22.19.0), seed 815,
// 200-tick window after a 60-tick warm-up, at the 500 ms cadence: mz/tick mean
// 1.35, max 6 (270 stream shells); world.step() best-of-5 mean 1.024 ms/tick.
// RE-MEASURED 2026-09-30 at Eric's 350 ms cadence and 10 s swap (same machine,
// seed and window, the swap starting the tick a stream stops):
//   mz per tick        mean 1.31, max 6 (exactly one per stream shell: 263
//                      stream shells spawned in the window, 263 flashes; 20
//                      guns × one shell per 350 ms is ~2.9/tick at full
//                      stream, but a 16-shell magazine now empties in 5.25 s
//                      and the 10 s swap then holds the gun silent — the
//                      faster cadence did NOT raise the window's flash count)
//   shells in flight   mean 2.76, max 10 (a 500 u/s shell over <= 440 u
//                      lives about a second)
//   world.step()       best-of-5 mean 1.039 ms/tick run alone; worst tick of
//                      that run 1.742 ms (inside the full parallel suite, a
//                      loaded box: mean 1.7–2.6 ms, worst tick 14–22 ms)
// Against the 50 ms tick that is ~2 % of the budget on average. The log line
// (HC_PERF_LOG=1) re-measures on the machine that runs it.

import { describe, it, expect } from 'vitest';
import { SHIP_CLASS_IDS, wrapAngle } from '@salvo/shared';
import { World } from '../game/world.js';

const BOTS = 20;
const RING_U = 220; // every bot within 440 u of every other — inside the 660 u reach
const WARMUP_TICKS = 60; // 3 s: acquire (reaction gate) and open the streams
const WINDOW_TICKS = 200; // 10 s: a full 16-shell magazine (5.25 s at 350 ms) and the 10 s swap after it

interface RunStats {
  meanStepMs: number;
  maxStepMs: number;
  mzPerTick: number[];
  shellsPerTick: number[];
  streamedShells: number;
}

/** Twenty MG bots on a ring in open water, bows at the centre. Built outside
 *  the clock; deterministic per seed. */
function streamingField(seed: number): World {
  const w = new World(seed, BOTS + 4);
  w.map.islands.length = 0; // open water: the cost under test is the guns', not the coastline's
  for (let i = 0; i < BOTS; i += 1) {
    const rec = w.addBot(SHIP_CLASS_IDS[i % SHIP_CLASS_IDS.length], undefined, 'machineGun');
    const a = (i / BOTS) * Math.PI * 2;
    rec.state.x = Math.cos(a) * RING_U;
    rec.state.y = Math.sin(a) * RING_U;
    rec.state.heading = wrapAngle(a + Math.PI);
    rec.prevPose = { ...rec.state };
  }
  return w;
}

function measure(seed: number): RunStats {
  const w = streamingField(seed);
  for (let t = 0; t < WARMUP_TICKS; t += 1) w.step();
  const seen = new Set(w.shells.keys());
  const mzPerTick: number[] = [];
  const shellsPerTick: number[] = [];
  let total = 0;
  let max = 0;
  let streamed = 0;
  for (let t = 0; t < WINDOW_TICKS; t += 1) {
    const t0 = performance.now();
    w.step();
    const dt = performance.now() - t0;
    total += dt;
    max = Math.max(max, dt);
    mzPerTick.push(w.tickEvents.filter((e) => e.k === 'mz').length);
    shellsPerTick.push(w.shells.size);
    for (const [id, s] of w.shells) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (s.family === 'mg') streamed += 1;
    }
  }
  return { meanStepMs: total / WINDOW_TICKS, maxStepMs: max, mzPerTick, shellsPerTick, streamedShells: streamed };
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('the machine gun flash cost — 20 streaming MG bots in one World (Story 8.15 AC)', () => {
  it('world.step() best-of-5 stays under the 50 ms tick with every stream shell flashing', () => {
    const runs: RunStats[] = [];
    for (let run = 0; run < 5; run += 1) runs.push(measure(815));
    const best = runs.reduce((a, b) => (b.meanStepMs < a.meanStepMs ? b : a));
    const bestWorst = Math.min(...runs.map((r) => r.maxStepMs));
    // Same seed, same water: every run fired the identical stream.
    for (const r of runs) {
      expect(r.mzPerTick).toEqual(runs[0].mzPerTick);
      expect(r.streamedShells).toBe(runs[0].streamedShells);
    }
    // The fixture really is 20 guns streaming: shells spawned and flashed.
    expect(best.streamedShells).toBeGreaterThan(BOTS);
    expect(Math.max(...best.mzPerTick)).toBeGreaterThan(0);
    if (process.env.HC_PERF_LOG) {
      console.log(
        `mg-flash best-of-5: mean step ${best.meanStepMs.toFixed(3)} ms, worst tick of that run ` +
          `${best.maxStepMs.toFixed(3)} ms, best worst-tick ${bestWorst.toFixed(3)} ms | ` +
          `mz/tick mean ${mean(best.mzPerTick).toFixed(2)} max ${Math.max(...best.mzPerTick)} | ` +
          `shells in flight mean ${mean(best.shellsPerTick).toFixed(2)} max ${Math.max(...best.shellsPerTick)} | ` +
          `stream shells spawned ${best.streamedShells} over ${WINDOW_TICKS} ticks | node ${process.version}`,
      );
    }
    expect(best.meanStepMs).toBeLessThan(50);
    expect(bestWorst).toBeLessThan(50);
  });
});
