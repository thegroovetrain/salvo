// Unit tests for the batch-sim harness internals (Story 2.10, spec task 4).
//
// PLACEMENT: lives beside the harness under server/scripts/batchsim/ — vitest's
// default include picks up *.test.ts anywhere in the server workspace, while
// server/tsconfig.json (rootDir: ./src) never sees it, so the production
// type-check surface is untouched. Dependency direction: test -> scripts only;
// nothing in server/src imports from scripts.
//
// NEVER import ./main.ts here — it runs the CLI (process.exit) at import time.

import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { World } from '../../../src/game/world.js';
import { UsageError, buildVariants, parseArgs } from '../args.js';
import { TunableError, applyOverrides, validateTunableKey } from '../overrides.js';
import { mixSeed, percentile, summarize } from '../stats.js';
import { PILOT_REGISTRY, pickSpendChoice } from '../pilots.js';
import { runBatch, type CaptainSample, type MatchSample } from '../runner.js';
import { buildAggregate } from '../report.js';
import { runDeckSim } from '../deckSim.js';
import { mulberry32 } from '@salvo/shared';

describe('args — CLI parsing', () => {
  it('parses the full flag set', () => {
    const opts = parseArgs([
      '--matches', '20', '--seed', '7', '--captains', '2', '--drones', '4',
      '--set', 'xp.levelMs=45000', '--sweep', 'deck.rareWeightPerDryLevel=0.2,0.35',
      '--deck-only', '--draws', '5000', '--json', '/tmp/x.json', '--quiet',
    ]);
    expect(opts.matches).toBe(20);
    expect(opts.seed).toBe(7);
    expect(opts.captains).toBe(2);
    expect(opts.drones).toBe(4);
    expect(opts.set).toEqual({ 'xp.levelMs': 45000 });
    expect(opts.sweeps).toEqual([{ key: 'deck.rareWeightPerDryLevel', values: [0.2, 0.35] }]);
    expect(opts.deckOnly).toBe(true);
    expect(opts.draws).toBe(5000);
    expect(opts.json).toBe('/tmp/x.json');
    expect(opts.quiet).toBe(true);
  });

  it('rejects unknown flags, malformed pairs, and bad numbers', () => {
    expect(() => parseArgs(['--bogus', '1'])).toThrow(UsageError);
    expect(() => parseArgs(['--matches'])).toThrow(UsageError);
    expect(() => parseArgs(['--matches', 'many'])).toThrow(UsageError);
    expect(() => parseArgs(['--matches', '0'])).toThrow(UsageError);
    expect(() => parseArgs(['--set', 'xp.levelMs'])).toThrow(UsageError);
  });

  it('rejects a --set key outside the tunable dials with a clear error', () => {
    expect(() => parseArgs(['--set', 'gun.damage=99'])).toThrow(TunableError);
    expect(() => parseArgs(['--set', 'gun.damage=99'])).toThrow(/not a tunable dial/);
    expect(() => parseArgs(['--sweep', 'net.pingIntervalMs=1,2'])).toThrow(TunableError);
  });

  it('builds the cartesian sweep grid over the base --set', () => {
    const variants = buildVariants({
      set: { 'zone.stormDps': 8 },
      sweeps: [
        { key: 'xp.levelMs', values: [45000, 60000] },
        { key: 'deck.rareWeightBase', values: [1, 2] },
      ],
    });
    expect(variants).toHaveLength(4);
    expect(variants[0].label).toBe('xp.levelMs=45000 deck.rareWeightBase=1');
    expect(variants[3].set).toEqual({ 'zone.stormDps': 8, 'xp.levelMs': 60000, 'deck.rareWeightBase': 2 });
    // Every variant keeps the base --set override.
    for (const v of variants) expect(v.set['zone.stormDps']).toBe(8);
  });
});

describe('args — value hygiene (review gate 2026-07-31)', () => {
  it('rejects empty / whitespace-only values before Number() coerces them to 0', () => {
    // Number('') === 0: an empty value would become a legitimate-looking zero dial.
    expect(() => parseArgs(['--set', 'xp.levelMs='])).toThrow(UsageError);
    expect(() => parseArgs(['--set', 'xp.levelMs='])).toThrow(/empty value/);
    expect(() => parseArgs(['--set', 'xp.levelMs=   '])).toThrow(/empty value/);
    expect(() => parseArgs(['--sweep', 'deck.rareWeightBase=1,,2'])).toThrow(/empty value/);
    expect(() => parseArgs(['--seed', ''])).toThrow(/empty value/);
  });

  it('rejects a repeated --sweep key (the later value would overwrite the earlier in every cell)', () => {
    expect(() => parseArgs(['--sweep', 'xp.levelMs=30000,45000', '--sweep', 'xp.levelMs=60000'])).toThrow(
      /duplicate sweep key: xp\.levelMs/,
    );
    // Distinct keys still stack into the cartesian grid.
    expect(parseArgs(['--sweep', 'xp.levelMs=30000', '--sweep', 'deck.rareWeightBase=1']).sweeps).toHaveLength(2);
  });

  it('rejects --json swallowing the following flag', () => {
    expect(() => parseArgs(['--json', '--quiet'])).toThrow(/--json requires a path/);
    const ok = parseArgs(['--json', '/tmp/r.json', '--quiet']);
    expect(ok.json).toBe('/tmp/r.json');
    expect(ok.quiet).toBe(true);
  });

  it('normalizes a >= 2^32 seed to the uint32 the rng streams actually use', () => {
    // Aliasing is unavoidable (mulberry32 is uint32); what matters is that the
    // printed run key equals the EFFECTIVE seed, so two runs cannot label
    // identical streams differently.
    expect(parseArgs(['--seed', String(2 ** 32 + 7)]).seed).toBe(7);
    expect(parseArgs(['--seed', String(2 ** 32)]).seed).toBe(0);
    expect(parseArgs(['--seed', '7']).seed).toBe(7);
  });
});

describe('overrides — per-key value floors (review gate 2026-07-31)', () => {
  it('rejects non-positive offer.size / xp.levelMs at parse time AND at apply time', () => {
    expect(() => parseArgs(['--set', 'offer.size=0'])).toThrow(TunableError);
    expect(() => parseArgs(['--set', 'offer.size=0'])).toThrow(/'offer\.size'.*>= 1/);
    expect(() => parseArgs(['--sweep', 'offer.size=3,0'])).toThrow(/'offer\.size'.*>= 1/);
    expect(() => parseArgs(['--set', 'xp.levelMs=0'])).toThrow(/'xp\.levelMs'.*>= 1/);
    expect(() => parseArgs(['--set', 'zone.stormDps=-1'])).toThrow(/'zone\.stormDps'.*>= 0/);
    expect(() => applyOverrides({ 'offer.size': 0 })).toThrow(TunableError);
  });

  it('keeps the legitimate ZERO sweep arms legal (they are real ratification evidence)', () => {
    expect(parseArgs(['--set', 'deck.rareWeightPerDryLevel=0']).set).toEqual({ 'deck.rareWeightPerDryLevel': 0 });
    const restore = applyOverrides({ 'zone.grace': 0, 'zone.endRadiusFraction': 0 });
    expect(CONFIG.zone.grace).toBe(0);
    restore();
  });
});

describe('overrides — tunable CONFIG dials', () => {
  it('applies and restores a top-level dial (xp.levelMs)', () => {
    const before = CONFIG.xp.levelMs;
    const restore = applyOverrides({ 'xp.levelMs': 45000 });
    expect(CONFIG.xp.levelMs).toBe(45000);
    restore();
    expect(CONFIG.xp.levelMs).toBe(before);
  });

  it('applies and restores a nested dial (xp.droneTierLevels.droneSmall)', () => {
    const before = CONFIG.xp.droneTierLevels.droneSmall;
    const restore = applyOverrides({ 'xp.droneTierLevels.droneSmall': 0.5 });
    expect(CONFIG.xp.droneTierLevels.droneSmall).toBe(0.5);
    restore();
    expect(CONFIG.xp.droneTierLevels.droneSmall).toBe(before);
  });

  it('rejects non-tunable keys, unknown paths, and non-numeric leaves', () => {
    expect(() => validateTunableKey('gun.damage')).toThrow(TunableError); // real CONFIG, not a dial
    expect(() => validateTunableKey('xp.nope')).toThrow(TunableError); // dial family, no such leaf
    expect(() => validateTunableKey('xp.droneTierLevels')).toThrow(TunableError); // object, not a number
    expect(() => applyOverrides({ 'match.countdown': 1 })).toThrow(TunableError); // match.* is NOT open — only fillTo
  });
});

describe('stats — aggregation helpers', () => {
  it('summarize: nearest-rank percentiles over 1..100', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const s = summarize(values);
    expect(s).toEqual({ n: 100, mean: 50.5, min: 1, p25: 25, p50: 50, p75: 75, p95: 95, max: 100 });
  });

  it('summarize/percentile: empty input is all zeros, never NaN', () => {
    expect(summarize([])).toEqual({ n: 0, mean: 0, min: 0, p25: 0, p50: 0, p75: 0, p95: 0, max: 0 });
    expect(percentile([], 0.5)).toBe(0);
  });

  it('mixSeed is a uint32 and varies by ordinal', () => {
    expect(mixSeed(7, 0)).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(mixSeed(7, 0))).toBe(true);
    expect(mixSeed(7, 0)).not.toBe(mixSeed(7, 1));
  });
});

describe('pilots — determinism', () => {
  /** Drive one gunner against a drone target; serialize its accepted inputs. */
  function inputStream(worldSeed: number, pilotSeed: number, ticks: number, withTarget: boolean): string {
    const w = new World(worldSeed, CONFIG.match.fillTo);
    w.addShip('cap-1', 'CAP-01', false, 'torpedoBoat');
    if (withTarget) w.addShip('drone-1', 'DRONE-01', true, 'droneSmall');
    const pilot = PILOT_REGISTRY.gunner('cap-1', pilotSeed);
    const lines: string[] = [];
    for (let t = 0; t < ticks; t += 1) {
      pilot.tick(w);
      lines.push(JSON.stringify(w.inputs.get('cap-1') ?? null));
      w.step();
    }
    return lines.join('\n');
  }

  it('same (world seed, pilot seed) => byte-identical input stream', () => {
    expect(inputStream(7, 42, 120, true)).toBe(inputStream(7, 42, 120, true));
  });

  it('the pin discriminates: a different world seed changes the stream', () => {
    // Fail-proof for the identity test above — a serializer that ignored the
    // inputs (or a constant stream) would make this assertion fail.
    expect(inputStream(7, 42, 120, true)).not.toBe(inputStream(8, 42, 120, true));
  });

  it('the pilot rng stream matters: wander differs by pilot seed (no target)', () => {
    expect(inputStream(7, 42, 200, false)).not.toBe(inputStream(7, 43, 200, false));
  });

  it('spend policy is deterministic and prefers the highest rarity', () => {
    const offer = ['gunDamage', 'gunBarrel', 'intelSweep', 'shipHull']; // one rare among commons
    const picks = new Set<number>();
    for (let i = 0; i < 50; i += 1) picks.add(pickSpendChoice(offer, mulberry32(i), []));
    expect(picks.has(1)).toBe(true); // the rare gets picked
    const a = Array.from({ length: 20 }, (_, i) => pickSpendChoice(offer, mulberry32(i), []));
    const b = Array.from({ length: 20 }, (_, i) => pickSpendChoice(offer, mulberry32(i), []));
    expect(a).toEqual(b);
  });
});

describe('runner — reproducibility + endedBy (fast-zone overrides)', () => {
  it('same run key => deep-equal batch results; different seed differs', () => {
    const restore = applyOverrides({
      'zone.grace': 5000,
      'zone.shrinkDuration': 20000,
      'zone.endRadiusFraction': 0.02,
      'zone.stormDps': 40,
    });
    try {
      const spec = { seed: 5, matches: 2, captains: 2, drones: 2 };
      const a = runBatch(spec);
      const b = runBatch(spec);
      expect(a.matches.length).toBe(2);
      expect(a.failures).toEqual([]);
      expect(b).toEqual(a); // NFR5: identical run key, identical result
      // Fail-proof: the equality has discriminating power — a different seed
      // must NOT produce the same result.
      const c = runBatch({ ...spec, seed: 6 });
      expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
    } finally {
      restore();
    }
  });

  it('endedBy fieldCleared: a lone captain with zero drones wins at activation', () => {
    const result = runBatch({ seed: 3, matches: 1, captains: 1, drones: 0 });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].endedBy).toBe('fieldCleared');
    const agg = buildAggregate(result, 1);
    expect(agg.endedBy).toEqual({ fieldCleared: 1 });
  });

  it('endedBy lastHumanSunk: an instant lethal storm sinks the last captain', () => {
    const restore = applyOverrides({
      'zone.grace': 0,
      'zone.shrinkDuration': 100,
      'zone.endRadiusFraction': 0,
      'zone.stormDps': 100000,
    });
    try {
      const result = runBatch({ seed: 3, matches: 1, captains: 1, drones: 1 });
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].endedBy).toBe('lastHumanSunk');
      expect(result.matches[0].stormDeaths).toBeGreaterThan(0);
      const agg = buildAggregate(result, 1);
      expect(agg.endedBy).toEqual({ lastHumanSunk: 1 });
      expect(agg.stormDeathsTotal).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  it('the aggregate splits endedBy across a mixed batch', () => {
    // One fieldCleared sample + one lastHumanSunk sample, merged by hand into
    // a single aggregate — proves the split surfaces per cause, not as a blob.
    const cleared = runBatch({ seed: 3, matches: 1, captains: 1, drones: 0 });
    const restore = applyOverrides({
      'zone.grace': 0,
      'zone.shrinkDuration': 100,
      'zone.endRadiusFraction': 0,
      'zone.stormDps': 100000,
    });
    let sunk;
    try {
      sunk = runBatch({ seed: 4, matches: 1, captains: 1, drones: 1 });
    } finally {
      restore();
    }
    const agg = buildAggregate(
      { matches: [...cleared.matches, ...sunk.matches], failures: [] },
      1,
    );
    expect(agg.endedBy).toEqual({ fieldCleared: 1, lastHumanSunk: 1 });
  });
});

describe('runner — a captain who leaves mid-match (review gate 2026-07-31)', () => {
  /** A pilot that quits: at `atTick` it removes its own ship exactly the way
   *  Match.onPlayerLeave does (world.removeShip), the quit-out path a future
   *  leave-capable pilot will drive for real. */
  function quitterFactory(quitId: string, atTick: number) {
    return (id: string, seed: number) => {
      const inner = PILOT_REGISTRY.gunner(id, seed);
      let t = 0;
      return {
        id,
        tick(world: World): void {
          t += 1;
          if (id === quitId && t >= atTick) {
            if (world.ships.has(id)) world.removeShip(id);
            return;
          }
          inner.tick(world);
        },
      };
    };
  }

  it('records the departed captain and excludes it from the aggregates, never throwing', () => {
    const result = runBatch({ seed: 5, matches: 1, captains: 2, drones: 0, pilot: quitterFactory('cap-2', 60) });
    // FAIL-PROOF: with the old `world.ships.get(id)!` collection this is a
    // recorded failure ("Cannot read properties of undefined"), not a match.
    expect(result.failures).toEqual([]);
    expect(result.matches).toHaveLength(1);
    const m = result.matches[0];
    expect(m.departedCaptains).toEqual(['cap-2']);
    expect(m.captains.map((c) => c.id)).toEqual(['cap-1']);
    const agg = buildAggregate(result, 2);
    expect(agg.departedCaptains).toBe(1);
    expect(agg.finalLevel.n).toBe(1); // the survivor only — sane, not NaN, not 2
    expect(Number.isFinite(agg.killsPerCaptain.mean)).toBe(true);
  });
});

describe('report — unbounded per-captain arrays (review gate 2026-07-31)', () => {
  it('aggregates a 200k-captain batch without an argument-spread RangeError', () => {
    const captain: CaptainSample = {
      id: 'cap-1', cls: 'torpedoBoat', finalLevel: 2, kills: 1, deaths: 0, picks: 2,
      boonsFitted: 2, deckRemaining: 30, cappedLines: 0,
      boonTimesS: new Array<number | null>(10).fill(null),
      firstExclusiveOffered: null, firstExclusiveFitted: null, levelCurve: [1, 2],
    };
    const match: MatchSample = {
      index: 0, seed: 1, durationS: 60, endedBy: 'fieldCleared', stormDeaths: 0,
      killsByVictimTier: {}, captains: new Array<CaptainSample>(200000).fill(captain),
      departedCaptains: [],
    };
    // FAIL-PROOF: `Math.max(0, ...captains.map(...))` over 200k entries throws
    // RangeError: Maximum call stack size exceeded.
    const agg = buildAggregate({ matches: [match], failures: [] }, 200000);
    expect(agg.levelCurve).toHaveLength(2);
    expect(agg.levelCurve[1].n).toBe(200000);
  });
});

describe('deck-only mode', () => {
  it('is deterministic per seed and structurally sound', () => {
    const a = runDeckSim({ seed: 7, draws: 3000 });
    const b = runDeckSim({ seed: 7, draws: 3000 });
    expect(b).toEqual(a);
    expect(a.totalDraws).toBeGreaterThanOrEqual(3000);
    expect(a.economies).toBeGreaterThan(10);
    // Economies terminate for real (not via the 300-draw backstop).
    expect(a.drawsPlayed.max).toBeLessThan(300);
    expect(a.deckExhaustedRate).toBe(1);
    // Pity table integrity: dry buckets partition all draws.
    expect(a.pity.reduce((n, row) => n + row.draws, 0)).toBe(a.totalDraws);
    // Fail-proof for the determinism pin: a different seed diverges.
    expect(JSON.stringify(runDeckSim({ seed: 8, draws: 3000 }))).not.toBe(JSON.stringify(a));
  });

  it('refuses to spin when an economy can play no draws (zero-progress guard)', () => {
    // Deliberately bypass the CLI floor by mutating CONFIG directly — this is
    // the defense-in-depth layer. FAIL-PROOF: without the guard this call never
    // returns (the budget loop only advances on draws played), so the missing
    // fix shows up as a hung test / vitest timeout rather than a bad assertion.
    const before = CONFIG.offer.size;
    (CONFIG.offer as { size: number }).size = 0;
    try {
      expect(() => runDeckSim({ seed: 7, draws: 100 })).toThrow(/played 0 draws/);
    } finally {
      (CONFIG.offer as { size: number }).size = before;
    }
  });

  it('a deck.rareWeightPerDryLevel override bites the pity curve', () => {
    const base = runDeckSim({ seed: 7, draws: 4000 });
    const restore = applyOverrides({ 'deck.rareWeightPerDryLevel': 50 });
    let boosted;
    try {
      boosted = runDeckSim({ seed: 7, draws: 4000 });
    } finally {
      restore();
    }
    // With an absurd escalation, one dry level makes a rare landing near
    // certain — the dry=1 rate must exceed the production dial's.
    expect(boosted.pity[1].rareRate).toBeGreaterThan(base.pity[1].rareRate);
    expect(boosted.pity[1].rareRate).toBeGreaterThan(0.95);
  });
});
