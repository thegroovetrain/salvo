// Unit tests for the BOT half of the batch-sim harness (Story 6.4, wave 4).
//
// PLACEMENT: beside the harness, exactly where batchSim.test.ts lives and for
// the same reason — vitest's default include picks up *.test.ts anywhere in the
// server workspace, while server/tsconfig.json (rootDir: ./src) never sees it,
// so the production type-check surface stays untouched. The wave's file list
// named server/src/__tests__/botHarness.test.ts; that placement would make a
// file under `src` import from `scripts`, inverting the dependency direction
// the harness header pins and breaking `tsc -p server/tsconfig.json`.
//
// NEVER import ../main.ts here — it runs the CLI (process.exit) at import time.

import { describe, it, expect } from 'vitest';
import { CONFIG, type Island } from '@salvo/shared';
import { World } from '../../../src/game/world.js';
import { circleIsland } from '../../../src/__tests__/islandFixture.js';
import { UsageError, parseArgs } from '../args.js';
import { applyOverrides } from '../overrides.js';
import { BotCollector, hullTouchesLand, lifeSamples, type BotSample } from '../botMetrics.js';
import { buildBotAggregate, renderBotReport } from '../botReport.js';
import { runMatch, type BatchResult, type MatchSample } from '../runner.js';

// --- args --------------------------------------------------------------------

describe('args — the --bots flag', () => {
  it('defaults to zero bots so every existing run key is unchanged', () => {
    expect(parseArgs([]).bots).toBe(0);
    expect(parseArgs(['--matches', '5']).captains).toBe(3);
  });

  it('parses a bot-only lobby', () => {
    const opts = parseArgs(['--captains', '0', '--bots', '20']);
    expect(opts.captains).toBe(0);
    expect(opts.bots).toBe(20);
  });

  it('parses a MIXED lobby (captains and bots on the same water)', () => {
    const opts = parseArgs(['--captains', '2', '--bots', '6']);
    expect(opts.captains).toBe(2);
    expect(opts.bots).toBe(6);
  });

  it('rejects an EMPTY lobby — no captains and no bots is not a run', () => {
    expect(() => parseArgs(['--captains', '0'])).toThrow(UsageError);
  });

  it('still allows --captains 0 in deck-only mode (no lobby exists there)', () => {
    expect(() => parseArgs(['--captains', '0', '--deck-only'])).not.toThrow();
  });

  it('rejects a negative bot count', () => {
    expect(() => parseArgs(['--bots', '-1'])).toThrow(UsageError);
  });
});

// --- land contact ------------------------------------------------------------

/** A ship record shaped just enough for hullTouchesLand (pose + hull id). */
function poseShip(x: number, y: number, heading = 0) {
  return { hullId: 'battleship' as const, state: { x, y, heading, speed: 0 } };
}

describe('botMetrics — the land-contact proxy', () => {
  const isle: Island = circleIsland(0, 0, 100);
  const islands = [isle];

  it('is FALSE in open water far from any coast', () => {
    expect(hullTouchesLand(poseShip(1000, 1000) as never, islands, [])).toBe(false);
  });

  it('is FALSE just clear of a coastline (a hull that is merely near land)', () => {
    // Battleship half-length is ~62u; put the bow ~30u off the coast.
    expect(hullTouchesLand(poseShip(200, 0) as never, islands, [])).toBe(false);
  });

  it('is TRUE when the hull silhouette overlaps land', () => {
    expect(hullTouchesLand(poseShip(120, 0) as never, islands, [])).toBe(true);
  });

  it('is TRUE for a hull sitting on the island centre', () => {
    expect(hullTouchesLand(poseShip(0, 0) as never, islands, [])).toBe(true);
  });

  it('respects HEADING — a hull broadside to a coast reads differently from bow-on', () => {
    // At 155u the battleship's 62u half-length reaches land bow-on (heading 0
    // points the long axis at the island) but its ~14u half-beam does not when
    // it lies across the approach.
    expect(hullTouchesLand(poseShip(155, 0, 0) as never, islands, [])).toBe(true);
    expect(hullTouchesLand(poseShip(155, 0, Math.PI / 2) as never, islands, [])).toBe(false);
  });

  it('never reports contact when there are no islands at all', () => {
    expect(hullTouchesLand(poseShip(0, 0) as never, [], [])).toBe(false);
  });
});

// --- aggregation -------------------------------------------------------------

function sample(over: Partial<BotSample> = {}): BotSample {
  return {
    id: 'bot-1',
    name: 'ALBATROSS',
    cls: 'torpedoBoat',
    profile: 'raider',
    kills: 0,
    pveKills: 0,
    end: 'sunkByShip',
    lifeS: 100,
    levelsEarned: 10,
    levelsUnspent: 0,
    boonsFitted: 10,
    shots: 20,
    damageDealt: 200,
    ticks: 2000,
    landTicks: 0,
    landEpisodes: 0,
    maxLandRunTicks: 0,
    ...over,
  };
}

function result(bots: BotSample[][], over: Partial<MatchSample> = {}): BatchResult {
  return {
    failures: [],
    matches: bots.map((rows, index) => ({
      index,
      seed: index,
      durationS: 400,
      endedBy: 'fieldCleared' as const,
      winnerClass: 'torpedoBoat',
      stormDeaths: 0,
      killsByVictimTier: {},
      captains: [],
      departedCaptains: [],
      bots: rows,
      ...over,
    })),
  };
}

const barByName = (agg: ReturnType<typeof buildBotAggregate>, name: string) =>
  agg.bars.find((b) => b.name.includes(name))!;

describe('botReport — the quality bars', () => {
  it('resolution counts BOTH clauses: a real conclusion inside the 16:00 collapse', () => {
    const conclusive = result([[sample()]]);
    const capped = result([[sample()]], { endedBy: 'unresolved', durationS: 1500 });
    const late = result([[sample()]], { durationS: 1500 });
    expect(buildBotAggregate(conclusive, 1).resolutionRate).toBe(1);
    expect(buildBotAggregate(capped, 1).resolutionRate).toBe(0);
    // A conclusion PAST full closure is not a resolution for this bar either.
    expect(buildBotAggregate(late, 1).resolutionRate).toBe(0);
  });

  it('kill share is per match, and a match with no bot-vs-bot kills is NOT a 0% sample', () => {
    const agg = buildBotAggregate(
      result([
        [sample({ kills: 3 }), sample({ id: 'bot-2', kills: 1 })],
        [sample({ kills: 0 }), sample({ id: 'bot-2', kills: 0 })],
      ]),
      2,
    );
    // Only the first match contributes: 3 / 4 = 0.75.
    expect(agg.maxKillShare.n).toBe(1);
    expect(agg.maxKillShare.mean).toBeCloseTo(0.75, 6);
    expect(agg.killShareBreachRate).toBe(1);
    expect(barByName(agg, 'kill share').pass).toBe(false);
  });

  it('storm-death share is a BAND — below it fails exactly as above it does', () => {
    const deaths = (storm: number, ship: number): BotSample[] => [
      ...Array.from({ length: storm }, (_, i) => sample({ id: `s${i}`, end: 'sunkByStorm' })),
      ...Array.from({ length: ship }, (_, i) => sample({ id: `k${i}`, end: 'sunkByShip' })),
    ];
    expect(barByName(buildBotAggregate(result([deaths(1, 99)]), 100), 'storm deaths').pass).toBe(false);
    expect(barByName(buildBotAggregate(result([deaths(10, 90)]), 100), 'storm deaths').pass).toBe(true);
    expect(barByName(buildBotAggregate(result([deaths(50, 50)]), 100), 'storm deaths').pass).toBe(false);
  });

  it('land contact pools TICKS, not per-bot rates', () => {
    const agg = buildBotAggregate(
      result([[sample({ ticks: 1000, landTicks: 100 }), sample({ id: 'b2', ticks: 9000, landTicks: 0 })]]),
      2,
    );
    // 100 / 10000 = 1%, not the 5% a per-bot mean would report.
    expect(agg.landContactRate).toBeCloseTo(0.01, 6);
    expect(barByName(agg, 'land contact').pass).toBe(false); // bar is STRICTLY < 1%
  });

  it('levels spent is earned-minus-still-banked, pooled', () => {
    const agg = buildBotAggregate(
      result([[sample({ levelsEarned: 10, levelsUnspent: 1 }), sample({ id: 'b2', levelsEarned: 10, levelsUnspent: 0 })]]),
      2,
    );
    expect(agg.levelsSpentRate).toBeCloseTo(0.95, 6);
    expect(barByName(agg, 'banked levels spent').pass).toBe(true);
  });

  it('reports the longest unbroken land run in sim-seconds (beaching, not brushing)', () => {
    const agg = buildBotAggregate(
      result([[sample({ landTicks: 40, landEpisodes: 4, maxLandRunTicks: 20 })]]),
      1,
    );
    expect(agg.worstLandRunS).toBeCloseTo((20 * CONFIG.tick.simDtMs) / 1000, 6);
  });

  it('an empty campaign produces zeros rather than NaN', () => {
    const agg = buildBotAggregate({ matches: [], failures: [] }, 20);
    for (const bar of agg.bars) expect(bar.measured).not.toContain('NaN');
    expect(agg.levelsSpentRate).toBe(0);
    expect(agg.landContactRate).toBe(0);
  });

  it('slices by profile AND by class, in sorted key order', () => {
    const agg = buildBotAggregate(
      result([
        [
          sample({ profile: 'trapper', cls: 'mineLayer' }),
          sample({ id: 'b2', profile: 'raider', cls: 'torpedoBoat' }),
          sample({ id: 'b3', profile: 'raider', cls: 'torpedoBoat' }),
        ],
      ]),
      3,
    );
    expect(agg.byProfile.map((g) => g.key)).toEqual(['raider', 'trapper']);
    expect(agg.byProfile.find((g) => g.key === 'raider')!.n).toBe(2);
    expect(agg.byClass.map((g) => g.key)).toEqual(['mineLayer', 'torpedoBoat']);
  });

  it('renders a deterministic body (same aggregate => byte-identical lines)', () => {
    const r = result([[sample({ kills: 2 }), sample({ id: 'b2', profile: 'siege', cls: 'battleship' })]]);
    const a = renderBotReport('baseline', buildBotAggregate(r, 2));
    const b = renderBotReport('baseline', buildBotAggregate(r, 2));
    expect(a).toEqual(b);
    expect(a.join('\n')).toContain('QUALITY BAR');
    // JSON-only (spec R3): lifeSamples must never surface in the rendered
    // text body, or the determinism contract this test guards is moot.
    expect(a.join('\n')).not.toContain('lifeSamples');
  });

  it('lifeSamples is the RAW per-bot-match lifeS column, sorted ascending, one group at a time', () => {
    const agg = buildBotAggregate(
      result([
        [
          sample({ id: 'b1', cls: 'torpedoBoat', lifeS: 42.3 }),
          sample({ id: 'b2', cls: 'torpedoBoat', lifeS: 10.5 }),
          sample({ id: 'b3', cls: 'battleship', lifeS: 200 }),
        ],
      ]),
      3,
    );
    const tb = agg.byClass.find((g) => g.key === 'torpedoBoat')!;
    const bs = agg.byClass.find((g) => g.key === 'battleship')!;
    // Present, an array of raw numbers, length === the group's n.
    expect(Array.isArray(tb.lifeSamples)).toBe(true);
    expect(tb.lifeSamples).toHaveLength(tb.n);
    expect(bs.lifeSamples).toHaveLength(bs.n);
    // Values correspond to the input rows' lifeS exactly (not re-summarized
    // or re-quantized), sorted ascending.
    expect(tb.lifeSamples).toEqual([10.5, 42.3]);
    expect(bs.lifeSamples).toEqual([200]);
    // The existing quantile summary is untouched and lives alongside it.
    expect(tb.lifeS.mean).toBeCloseTo((42.3 + 10.5) / 2, 6);
    // BY CLASS ONLY. groupOf builds both slices, so populating it there emitted
    // every value TWICE; the documented --json contract is byClass[].lifeSamples.
    expect(agg.byProfile.length).toBeGreaterThan(0);
    for (const g of agg.byProfile) expect(g).not.toHaveProperty('lifeSamples');
  });

  it('the lifeSamples helper (botMetrics.ts) is what reaches the report groups', () => {
    const rows: BotSample[] = [sample({ lifeS: 5 }), sample({ id: 'b2', lifeS: 1 }), sample({ id: 'b3', lifeS: 3 })];
    // Both sides assert a HAND-WRITTEN literal. Comparing the helper's output
    // against another call of the same helper would pass even if groupOf were
    // wired to something else entirely — the expectation has to be independent
    // of the code under test to be able to fail at all.
    expect(lifeSamples(rows)).toEqual([1, 3, 5]);
    const agg = buildBotAggregate(result([rows.map((r) => ({ ...r, cls: 'mineLayer' }))]), 3);
    expect(agg.byClass.find((g) => g.key === 'mineLayer')!.lifeSamples).toEqual([1, 3, 5]);
  });
});

// --- the lobby ---------------------------------------------------------------

describe('runner — the bot lobby', () => {
  it('a bot-only lobby ACTIVATES, runs and finishes (minHumans drops to 0)', () => {
    // Compress the whole storm timeline so the match concludes in a few
    // sim-minutes even if the bots never find each other.
    const restore = applyOverrides({ 'zone.beatMs': 4000 });
    try {
      const m = runMatch(0, { seed: 4242, matches: 1, captains: 0, bots: 4 });
      expect(m.endedBy).not.toBe('unresolved');
      expect(m.bots).toHaveLength(4);
      for (const b of m.bots!) {
        expect(b.id).toMatch(/^bot-\d+$/);
        expect(Object.values(CONFIG.bots.profiles).flat() as string[]).toContain(b.profile);
        expect(Object.keys(CONFIG.bots.profiles)).toContain(b.cls);
        expect(b.ticks).toBeGreaterThan(0);
      }
    } finally {
      restore();
    }
  });

  it('a captains-only run carries NO bot rows (the default path is untouched)', () => {
    const restore = applyOverrides({ 'zone.beatMs': 4000 });
    try {
      const m = runMatch(0, { seed: 99, matches: 1, captains: 2 });
      expect(m.bots).toEqual([]);
    } finally {
      restore();
    }
  });

  it('bots are participants: they are NOT humans and never arm a countdown', () => {
    const world = new World(7, 20);
    const bot = world.addBot();
    expect(bot.role).toBe('bot');
    expect(world.bots.profileOf(bot.id)).not.toBeNull();
  });

  it('the collector reports nothing for an empty bot list', () => {
    expect(new BotCollector([]).empty).toBe(true);
  });
});
