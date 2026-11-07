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

import { beforeAll, describe, it, expect } from 'vitest';
import { CONFIG, DEFAULT_CLASS_ID, DEFAULT_SHIFT, SHIFT_IDS, SHIP_CLASS_IDS, turretMounts, type Island } from '@salvo/shared';
import { World } from '../../../src/game/world.js';
import { circleIsland } from '../../../src/__tests__/islandFixture.js';
import { UsageError, parseArgs } from '../args.js';
import { applyOverrides } from '../overrides.js';
import { BotCollector, hullTouchesLand, layoutOf, lifeSamples, type BotSample } from '../botMetrics.js';
import { buildBotAggregate, renderBotReport } from '../botReport.js';
import { buildAggregate, histLine, renderBatchReport, sumHist } from '../report.js';
import type { GameEvent } from '@salvo/shared';
import { botProfileFor, runMatch, type BatchResult, type MatchSample } from '../runner.js';
import { TEST_PROFILE_IDS } from '../../../src/game/ai/profiles.js';
import { emptyBotReadouts, postureEdges } from '../botReadouts.js';

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

  // `--deck-only` and `--draws` are DELETED (Story 8.14, amendment 95b): the
  // deck-economy fast mode modelled a deck, and there is none. They are now
  // unknown flags, which is the strongest possible pin that they are gone.
  it('--deck-only and --draws are unknown flags now', () => {
    expect(() => parseArgs(['--captains', '0', '--deck-only'])).toThrow(UsageError);
    expect(() => parseArgs(['--bots', '4', '--deck-only'])).toThrow(/unknown argument/);
    expect(() => parseArgs(['--bots', '4', '--draws', '20000'])).toThrow(/unknown argument/);
  });

  it('rejects a negative bot count', () => {
    expect(() => parseArgs(['--bots', '-1'])).toThrow(UsageError);
  });
});

// --- land contact ------------------------------------------------------------

/** A ship record shaped just enough for hullTouchesLand (pose + hull id). */
function poseShip(x: number, y: number, heading = 0) {
  return { hullId: 'bismarck' as const, state: { x, y, heading, speed: 0 } };
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
    cls: 'warspite',
    profile: 'raider',
    kills: 0,
    end: 'sunkByShip',
    lifeS: 100,
    levelsEarned: 10,
    levelsUnspent: 0,
    boonsFitted: 10,
    shots: 20,
    minesLaid: 0,
    damageDealt: 200,
    beaconXpLevels: 0,
    contactDamageTaken: 0,
    landDamageTaken: 0,
    ticks: 2000,
    landTicks: 0,
    draftTicks: 0,
    landEpisodes: 0,
    maxLandRunTicks: 0,
    boons: [],
    picks: [],
    offersSeen: {},
    offerHands: 0,
    placement: null,
    shift: DEFAULT_SHIFT,
    layout: layoutOf(DEFAULT_CLASS_ID),
    ...emptyBotReadouts(),
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
      winnerClass: 'warspite',
      stormDeaths: 0,
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

  it('land contact pools TICKS, not per-bot rates', () => {
    const agg = buildBotAggregate(
      result([[sample({ ticks: 1000, landTicks: 100 }), sample({ id: 'b2', ticks: 9000, landTicks: 0 })]]),
      2,
    );
    // 100 / 10000 = 1%, not the 5% a per-bot mean would report.
    expect(agg.landContactRate).toBeCloseTo(0.01, 6);
    expect(barByName(agg, 'land contact').pass).toBe(false); // bar is STRICTLY < 1%
  });

  it('wake drafting pools TICKS per group and the pooled rate reaches the rendered report (Story 8.19)', () => {
    const agg = buildBotAggregate(
      result([[
        sample({ ticks: 1000, draftTicks: 300 }),
        sample({ id: 'b2', ticks: 3000, draftTicks: 100 }),
        sample({ id: 'b3', profile: 'siege', cls: 'bismarck', ticks: 500, draftTicks: 0 }),
      ]]),
      3,
    );
    // 400 / 4000 = 10%, not the 16.7% a per-bot mean would report.
    expect(agg.byProfile.find((g) => g.key === 'raider')!.draftRate).toBeCloseTo(0.1, 6);
    expect(agg.byClass.find((g) => g.key === 'warspite')!.draftRate).toBeCloseTo(0.1, 6);
    expect(agg.byClass.find((g) => g.key === 'bismarck')!.draftRate).toBe(0);
    const text = renderBotReport('baseline', agg);
    expect(text.join('\n')).toContain('10.0%');
  });

  it('the collector counts afloat ticks whose ship.draft is positive (Story 8.19)', () => {
    const world = new World(7, 20);
    const bot = world.addBot(undefined, undefined);
    const collector = new BotCollector([bot.id]);
    bot.draft = 0;
    collector.observe(world, 1);
    bot.draft = 0.03;
    collector.observe(world, 1);
    collector.observe(world, 1);
    const [row] = collector.samples(world);
    expect(row.ticks).toBe(3);
    expect(row.draftTicks).toBe(2);
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
          sample({ profile: 'trapper', cls: 'iowa' }),
          sample({ id: 'b2', profile: 'raider', cls: 'warspite' }),
          sample({ id: 'b3', profile: 'raider', cls: 'warspite' }),
        ],
      ]),
      3,
    );
    expect(agg.byProfile.map((g) => g.key)).toEqual(['raider', 'trapper']);
    expect(agg.byProfile.find((g) => g.key === 'raider')!.n).toBe(2);
    expect(agg.byClass.map((g) => g.key)).toEqual(['iowa', 'warspite']);
  });

  it('renders a deterministic body (same aggregate => byte-identical lines)', () => {
    const r = result([[sample({ kills: 2 }), sample({ id: 'b2', profile: 'siege', cls: 'bismarck' })]]);
    const a = renderBotReport('baseline', buildBotAggregate(r, 2));
    const b = renderBotReport('baseline', buildBotAggregate(r, 2));
    expect(a).toEqual(b);
    // JSON-only (spec R3): lifeSamples must never surface in the rendered
    // text body, or the determinism contract this test guards is moot.
    expect(a.join('\n')).not.toContain('lifeSamples');
  });

  it('lifeSamples is the RAW per-bot-match lifeS column, sorted ascending, one group at a time', () => {
    const agg = buildBotAggregate(
      result([
        [
          sample({ id: 'b1', cls: 'warspite', lifeS: 42.3 }),
          sample({ id: 'b2', cls: 'warspite', lifeS: 10.5 }),
          sample({ id: 'b3', cls: 'bismarck', lifeS: 200 }),
        ],
      ]),
      3,
    );
    const tb = agg.byClass.find((g) => g.key === 'warspite')!;
    const bs = agg.byClass.find((g) => g.key === 'bismarck')!;
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
    const agg = buildBotAggregate(result([rows.map((r) => ({ ...r, cls: 'iowa' }))]), 3);
    expect(agg.byClass.find((g) => g.key === 'iowa')!.lifeSamples).toEqual([1, 3, 5]);
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
        expect(CONFIG.bots.profiles as readonly string[]).toContain(b.profile);
        expect(SHIP_CLASS_IDS as readonly string[]).toContain(b.cls);
        expect(b.ticks).toBeGreaterThan(0);
        expect(b.draftTicks).toBeGreaterThanOrEqual(0);
        expect(b.draftTicks).toBeLessThanOrEqual(b.ticks);
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
    const bot = world.addBot(undefined, undefined);
    expect(bot.role).toBe('bot');
    expect(world.bots.profileOf(bot.id)).not.toBeNull();
  });

  it('the collector reports nothing for an empty bot list', () => {
    expect(new BotCollector([]).empty).toBe(true);
  });
});

// --- the wave-4 test rig: --bot-profile / --bot-engage -----------------------

describe('args — the --bot-profile and --bot-engage flags (wave 4)', () => {
  it('defaults leave every existing run key byte-identical', () => {
    const opts = parseArgs([]);
    expect(opts.botProfile).toBeNull();
    expect(opts.botEngage).toBe('always');
  });

  it('accepts each TEST id and the round-robin scheme — with --bots', () => {
    for (const id of TEST_PROFILE_IDS) {
      expect(parseArgs(['--bots', '3', '--bot-profile', id]).botProfile).toBe(id);
    }
    expect(parseArgs(['--bots', '3', '--bot-profile', 'random']).botProfile).toBe('random');
  });

  it('REJECTS an in-game profile id, with a message naming the boundary', () => {
    // The safety property at the CLI door: the harness can only force the
    // test-only rows, never deal an in-game row (or vice versa).
    expect(() => parseArgs(['--bots', '3', '--bot-profile', 'raider'])).toThrow(UsageError);
    expect(() => parseArgs(['--bots', '3', '--bot-profile', 'raider'])).toThrow(/IN-GAME profile/);
    expect(() => parseArgs(['--bots', '3', '--bot-profile', 'notAProfile'])).toThrow(/available: random,/);
  });

  it('rejects --bot-profile without bots, and a bad --bot-engage value', () => {
    expect(() => parseArgs(['--bot-profile', 'random'])).toThrow(/needs --bots/);
    expect(() => parseArgs(['--bots', '2', '--bot-engage', 'sometimes'])).toThrow(UsageError);
    expect(parseArgs(['--bots', '2', '--bot-engage', 'endgame']).botEngage).toBe('endgame');
    expect(parseArgs(['--bots', '2', '--bot-engage', 'always']).botEngage).toBe('always');
  });
});

describe('runner — forced test profiles and the engage gate (wave 4)', () => {
  it('botProfileFor: a named id forces every bot; the scheme deals round-robin', () => {
    for (let i = 0; i < 6; i += 1) {
      expect(botProfileFor({ botProfile: 'randomBismarck' }, i)).toBe('randomBismarck');
      expect(botProfileFor({ botProfile: 'random' }, i)).toBe(TEST_PROFILE_IDS[i % TEST_PROFILE_IDS.length]);
      expect(botProfileFor({}, i)).toBeUndefined();
    }
  });

  it('the scheme deal is OFFSET BY MATCH INDEX, so no class is short in every match', () => {
    // A lobby that is not a multiple of the row count deals one row short —
    // without the offset the SAME test row is short in every match (the rotate() representation artefact, on the
    // one path --roster even cannot reach because the forced profile governs
    // the hull). A named id stays offset-invariant.
    for (let i = 0; i < 6; i += 1) {
      for (let index = 0; index < 4; index += 1) {
        expect(botProfileFor({ botProfile: 'random' }, i, index)).toBe(TEST_PROFILE_IDS[(i + index) % TEST_PROFILE_IDS.length]);
        expect(botProfileFor({ botProfile: 'randomIowa' }, i, index)).toBe('randomIowa');
      }
    }
    // Across one full rotation of consecutive matches (as many as there are
    // rows) of a lobby one bot over a multiple, every row totals the same.
    const rows = TEST_PROFILE_IDS.length;
    const lobby = rows * 4 + 1;
    const totals = new Map<string, number>();
    for (let index = 0; index < rows; index += 1) {
      for (let i = 0; i < lobby; i += 1) {
        const p = botProfileFor({ botProfile: 'random' }, i, index)!;
        totals.set(p, (totals.get(p) ?? 0) + 1);
      }
    }
    expect([...totals.values()]).toEqual(Array(rows).fill(lobby));
  });

  it('a forced run carries ONLY test profiles in its bot rows, one hull per row', () => {
    const restore = applyOverrides({ 'zone.beatMs': 4000 });
    try {
      const n = TEST_PROFILE_IDS.length;
      const m = runMatch(0, { seed: 4242, matches: 1, captains: 0, bots: n, botProfile: 'random' });
      expect(m.bots).toHaveLength(n);
      const profiles = m.bots!.map((b) => b.profile).sort();
      expect(profiles).toEqual([...TEST_PROFILE_IDS].sort());
      for (const b of m.bots!) {
        // A test id can NEVER be an in-game id (the disjointness pin lives in
        // botPolicy.test.ts); here: the forced row governed the hull.
        expect(CONFIG.bots.profiles as readonly string[]).not.toContain(b.profile);
      }
    } finally {
      restore();
    }
  });

  it('an endgame-gated bot lobby still RESOLVES (the gate releases and they fight)', () => {
    const restore = applyOverrides({ 'zone.beatMs': 2000 });
    try {
      const m = runMatch(0, { seed: 77, matches: 1, captains: 0, bots: 4, botEngage: 'endgame' });
      // The match ends: either someone won after the release, or the collapse
      // sank the field — never a budget cap-out with everyone idling.
      expect(m.endedBy).not.toBe('unresolved');
    } finally {
      restore();
    }
  });
});

describe('botMetrics/botReport — hull layout and Shift (Story 10.4)', () => {
  it('a bot row carries its seat\'s Shift and its hull\'s layout off the shared turret mounts', () => {
    const world = new World(31, 20);
    for (const hull of SHIP_CLASS_IDS) {
      for (const shift of SHIFT_IDS) {
        const bot = world.addBot(hull, undefined, shift);
        const col = new BotCollector([bot.id]);
        col.observe(world, 1);
        const mounts = turretMounts(hull);
        expect(col.samples(world)[0]).toMatchObject({ shift, layout: `${mounts.length}x${mounts[0].guns}` });
      }
    }
  });

  it('layoutOf is turrets x guns, and every hull has a uniform layout', () => {
    for (const hull of SHIP_CLASS_IDS) {
      const mounts = turretMounts(hull);
      expect(new Set(mounts.map((m) => m.guns)).size).toBe(1);
      expect(layoutOf(hull)).toBe(`${mounts.length}x${mounts[0].guns}`);
    }
  });

  it('byLayout / byShift group by their key; a draw\'s placement 1 is not a win', () => {
    const [s0, s1] = SHIFT_IDS;
    const agg = buildBotAggregate(
      {
        ...result([
          [
            sample({ shift: s1, layout: 'L2', placement: 1, end: 'alive', kills: 2 }),
            sample({ id: 'b2', shift: s0, layout: 'L1', placement: 2 }),
          ],
        ]),
      },
      2,
    );
    const draw = buildBotAggregate(result([[sample({ shift: s1, layout: 'L2', placement: 1 })]], { winnerClass: null }), 1);
    expect(agg.byLayout.map((g) => g.key)).toEqual(['L1', 'L2']);
    expect(agg.byShift.map((g) => g.key)).toEqual([s0, s1].sort());
    const won = agg.byLayout.find((g) => g.key === 'L2')!;
    expect(won).toMatchObject({ n: 1, wins: 1, winRate: 1, meanPlacement: 1 });
    expect(agg.byShift.find((g) => g.key === s1)!.wins).toBe(1);
    expect(agg.byShift.find((g) => g.key === s0)!.wins).toBe(0);
    expect(draw.byLayout[0].wins).toBe(0);
    expect(draw.byShift[0].wins).toBe(0);
    const text = renderBotReport('x', agg).join('\n');
    expect(text).toContain('L2');
    expect(text).toContain(s1);
  });
});


describe('Story 9.5 — contact deaths and land-contact damage in the bot aggregate', () => {
  it('counts ram kills and groundings off BotEnd, sums the land damage and means it per bot-match', () => {
    const rows: BotSample[] = [
      sample({ id: 'r1', end: 'sunkByContact', landDamageTaken: 10 }),
      sample({ id: 'g1', end: 'ranAground', landDamageTaken: 30 }),
      sample({ id: 'g2', end: 'ranAground', landDamageTaken: 0 }),
      sample({ id: 's1', end: 'sunkByStorm' }),
      sample({ id: 'p1', end: 'sunkByShip' }),
      sample({ id: 'a1', end: 'alive' }),
    ];
    const agg = buildBotAggregate(result([rows]), rows.length);
    expect(agg.deaths).toBe(5);
    expect(agg.contactDeaths).toBe(1);
    expect(agg.groundingDeaths).toBe(2);
    expect(agg.stormDeaths).toBe(1);
    expect(agg.landDamage).toBe(40);
    expect(agg.landDamagePerBotMatch).toBeCloseTo(40 / 6, 9);
  });
});

// --- Story 9.13 wave 3: the posture-workover readouts --------------------------

/** A shell literal shaped just enough for the readout pass (never stepped). */
function stagedShell(id: string, ownerId: string, over: Record<string, unknown>): never {
  return {
    id,
    ownerId,
    x: 0,
    y: 0,
    kind: 'shell',
    family: 'cannon',
    hits: CONFIG.gun.hits,
    targetX: 0,
    targetY: 0,
    ...over,
  } as never;
}

/** Replace this tick's event list (the killsByTier test's seam). */
function stageEvents(world: World, events: GameEvent[]): void {
  Object.defineProperty(world, 'tickEvents', { value: events, configurable: true });
}

const NUMERIC_FIELDS = [
  'groundedTicks', 'stuckEpisodes', 'outsideRingTicks', 'stormDeathStuck', 'stormDeathAground',
  'gunShells', 'litShots', 'starShellsFired', 'fogTicks', 'actPresses',
] as const;
const RECORD_FIELDS = [
  'killsBySource', 'shotsBeyondRange', 'postureTicks', 'postureTransitions', 'tacticCounts',
  'fogTicksByPosture', 'pressesByAbility', 'activations',
] as const;
const MATCH_FIELDS = ['lastTwoS', 'endgameNoContactMaxS'] as const;

const allNumbers = (rec: unknown): boolean =>
  typeof rec === 'object' && rec !== null && Object.values(rec).every((v) => typeof v === 'number' && Number.isFinite(v));

describe('Story 9.13 — the bot readouts on a real match', () => {
  const run = (): MatchSample => {
    const restore = applyOverrides({ 'zone.beatMs': 4000 });
    try {
      return runMatch(0, { seed: 913, matches: 1, captains: 0, bots: 4 });
    } finally {
      restore();
    }
  };
  let first: MatchSample;
  beforeAll(() => {
    first = run();
  });

  it('every new BotSample / MatchSample field is present and numeric (the JSON shape)', () => {
    expect(first.bots).toHaveLength(4);
    for (const b of first.bots!) {
      for (const f of NUMERIC_FIELDS) expect(typeof b[f], f).toBe('number');
      for (const f of RECORD_FIELDS) expect(allNumbers(b[f]), f).toBe(true);
      expect(Object.keys(b.shotsBeyondRange).sort()).toEqual(['cannon', 'flak', 'mg']);
      expect(Object.keys(b.postureTransitions).sort()).toEqual(['brokenOff', 'held', 'hid', 'kited', 'opened', 'rammed']);
    }
    for (const f of MATCH_FIELDS) expect(typeof first[f], f).toBe('number');
    const agg = buildBotAggregate({ matches: [first], failures: [] }, 4);
    expect(agg.readouts.ticks).toBe(first.bots!.reduce((a, b) => a + b.ticks, 0));
    const text = renderBotReport('x', agg);
    // Measured, never judged: no PASS/FAIL row is printed for a 9.13 readout.
    for (const line of text.filter((l) => /^ {2}(PASS|FAIL) /.test(l))) {
      expect(line).not.toMatch(/posture|grounded|decoy|endgame|fog/i);
    }
  });

  it('the posture tally sums to the afloat bot ticks, bot by bot', () => {
    for (const b of first.bots!) {
      expect(Object.values(b.postureTicks).reduce((a, n) => a + n, 0)).toBe(b.ticks);
      expect(b.fogTicks).toBe(Object.values(b.fogTicksByPosture).reduce((a, n) => a + n, 0));
      expect(b.groundedTicks).toBeLessThanOrEqual(b.ticks);
    }
  });

  it('is deterministic: the same seed gives identical readouts', () => {
    expect(run()).toEqual(first);
  });

  it('Story 10.8: beacon levels per bot and the field-wide hulls-in-range hist ride the sample and the reports', () => {
    for (const b of first.bots!) {
      expect(Number.isFinite(b.beaconXpLevels)).toBe(true);
      expect(b.beaconXpLevels).toBeGreaterThanOrEqual(0);
    }
    const hist = first.beaconInRangeHist!;
    expect(Array.isArray(hist)).toBe(true);
    for (const n of hist) expect(Number.isInteger(n) && n >= 0).toBe(true);
    const agg = buildBotAggregate({ matches: [first], failures: [] }, 4);
    for (const g of agg.byClass) {
      const rows = first.bots!.filter((b) => b.cls === g.key);
      expect(g.beaconLevels.mean).toBeCloseTo(rows.reduce((a, b) => a + b.beaconXpLevels, 0) / rows.length, 9);
    }
    expect(sumHist([hist, hist])).toEqual(hist.map((n) => 2 * n));
    const batch = buildAggregate({ matches: [first], failures: [] }, 0);
    expect(batch.beaconInRangeHist).toEqual(hist);
    expect(renderBatchReport('x', batch).some((l) => l.endsWith(histLine(hist)))).toBe(true);
  });
});

describe('Story 9.13 — the readout counters on a staged world', () => {
  it('classifies deck-gun shells: own-light (no attenRangeU), beyond range per family, star shells; broadside and tagged shells stay out', () => {
    // The classifier keys the cannon row on its own `hits` — the broadside's must differ.
    expect(CONFIG.gun.hits).not.toBe(CONFIG.broadside.hits);
    const world = new World(42, 20);
    const bot = world.addBot(undefined, undefined);
    const col = new BotCollector([bot.id]);
    const far = { originX: 0, originY: 0, targetX: 400, targetY: 0, attenRangeU: 300 };
    world.shells.set('a', stagedShell('a', bot.id, {})); // cannon row, no attenRangeU = into own light
    world.shells.set('b', stagedShell('b', bot.id, { hits: CONFIG.broadside.hits })); // broadside
    world.shells.set('c', stagedShell('c', bot.id, { lit: { radius: 1, durationMs: 1 } })); // star shell
    world.shells.set('d', stagedShell('d', bot.id, { burn: { radius: 1, durationMs: 1, dps: 1 } })); // phosphor
    world.shells.set('e', stagedShell('e', bot.id, { family: 'mg', ...far })); // MG past full range
    world.shells.set('f', stagedShell('f', bot.id, { family: 'flak', ...far, targetX: 200 })); // flak inside it
    world.shells.set('g', stagedShell('g', bot.id, { kind: 'torp', family: null, targetX: null, targetY: null }));
    col.observe(world, 1);
    const row = col.samples(world)[0];
    expect(row.gunShells).toBe(3);
    expect(row.litShots).toBe(1);
    expect(row.starShellsFired).toBe(1);
    expect(row.shotsBeyondRange).toEqual({ cannon: 0, mg: 1, flak: 0 });
  });

  it('stuckEpisodes counts a staged 2 s landContact run once; groundedTicks counts every contact tick', () => {
    expect(2000).toBeGreaterThanOrEqual(CONFIG.bots.stuckMs); // the staged run really is a stuck one
    const world = new World(43, 20);
    const bot = world.addBot(undefined, undefined);
    const col = new BotCollector([bot.id]);
    const twoS = 2000 / CONFIG.tick.simDtMs;
    const brief = Math.floor(CONFIG.bots.stuckMs / CONFIG.tick.simDtMs) - 1;
    bot.landContact = true;
    for (let i = 0; i < twoS; i += 1) col.observe(world, 1);
    bot.landContact = false;
    col.observe(world, 1);
    bot.landContact = true;
    for (let i = 0; i < brief; i += 1) col.observe(world, 1); // a brush shorter than stuckMs
    const row = col.samples(world)[0];
    expect(row.stuckEpisodes).toBe(1);
    expect(row.groundedTicks).toBe(twoS + brief);
  });

  it('a storm death while aground stamps stormDeathStuck and stormDeathAground', () => {
    const world = new World(44, 20);
    const bot = world.addBot(undefined, undefined);
    const col = new BotCollector([bot.id]);
    bot.landContact = true;
    col.observe(world, 1);
    bot.lastDamageSrc = 'storm';
    stageEvents(world, [{ k: 'sunk', id: bot.id } as GameEvent]);
    col.observe(world, 1);
    const row = col.samples(world)[0];
    expect(row.end).toBe('sunkByStorm');
    expect(row.stormDeathStuck).toBe(1);
    expect(row.stormDeathAground).toBe(1);
  });

  it('killsBySource buckets a participant kill by the victim\'s last blow', () => {
    const world = new World(45, 20);
    const killer = world.addBot(undefined, undefined);
    const victim = world.addBot(undefined, undefined);
    const col = new BotCollector([killer.id, victim.id]);
    victim.lastDamageSrc = 'torpedo';
    stageEvents(world, [{ k: 'sunk', id: victim.id, by: killer.id } as GameEvent]);
    col.observe(world, 1);
    expect(col.samples(world).find((r) => r.id === killer.id)!.killsBySource).toEqual({ torpedo: 1 });
  });

  it('lastTwoS clocks a 2-bot world; a non-storm hit on a survivor breaks the no-contact run, a storm tick does not', () => {
    const world = new World(46, 20);
    const a = world.addBot(undefined, undefined);
    const b = world.addBot(undefined, undefined);
    const col = new BotCollector([a.id, b.id]);
    for (let i = 0; i < 10; i += 1) col.observe(world, 1);
    a.lastDamageSrc = 'shell';
    stageEvents(world, [{ k: 'dmg', id: a.id, amount: 1, hp: 99 } as GameEvent]);
    col.observe(world, 1);
    b.lastDamageSrc = 'storm';
    stageEvents(world, [{ k: 'dmg', id: b.id, amount: 1, hp: 99 } as GameEvent]);
    for (let i = 0; i < 4; i += 1) col.observe(world, 1);
    const m = col.matchReadouts();
    const s = (ticks: number): number => Math.round((ticks * CONFIG.tick.simDtMs) / 100) / 10;
    expect(m.lastTwoS).toBe(s(15));
    expect(m.endgameNoContactMaxS).toBe(s(10));
  });

  it('three hulls afloat is not the endgame', () => {
    const world = new World(47, 20);
    const ids = [0, 1, 2].map(() => world.addBot(undefined, undefined).id);
    const col = new BotCollector(ids);
    for (let i = 0; i < 5; i += 1) col.observe(world, 1);
    expect(col.matchReadouts().lastTwoS).toBe(0);
  });
});

describe('Story 9.13 — postureEdges names the transitions', () => {
  it('maps each posture change to the transitions it names, and an unnamed change to none', () => {
    expect(postureEdges('reposition', 'pursue')).toEqual(['opened']);
    expect(postureEdges('pursue', 'engage')).toEqual([]);
    expect(postureEdges('engage', 'hide')).toEqual(['brokenOff', 'hid']);
    expect(postureEdges('disengage', 'hide')).toEqual(['hid']);
    expect(postureEdges('engage', 'kite')).toEqual(['kited']);
    expect(postureEdges('farm', 'hold')).toEqual(['held']);
    expect(postureEdges('disengage', 'ram')).toEqual(['rammed']);
  });
});

describe('Story 9.13 — the --tune bots.* family', () => {
  it('accepts the bot dials, each inside its own range', () => {
    const opts = parseArgs([
      '--bots', '4',
      '--tune', 'bots.stuckMs=1000',
      '--tune', 'bots.disengageHysteresis=0.2',
      '--tune', 'bots.gunBand.cannon.0=0.4',
      '--tune', 'bots.nav.avoidRays=7',
      '--tune', 'bots.nav.clearancePenalty=0',
      '--tune', 'bots.cardPoints.base=-2', // a card score takes any finite number, negatives included
    ]);
    expect(opts.tune['bots.gunBand.cannon.0']).toBe(0.4);
    const before = CONFIG.bots.gunBand.cannon[0];
    const restore = applyOverrides({}, { 'bots.gunBand.cannon.0': 0.4 });
    try {
      expect(CONFIG.bots.gunBand.cannon[0]).toBe(0.4);
    } finally {
      restore();
    }
    expect(CONFIG.bots.gunBand.cannon[0]).toBe(before);
  });

  it('refuses unknown keys, out-of-range values, an inverted band and the load-time snapshots', () => {
    expect(() => parseArgs(['--bots', '4', '--tune', 'bots.nonsense=1'])).toThrow(/does not exist|not a numeric/);
    expect(() => parseArgs(['--bots', '4', '--tune', 'bots.profiles.0=1'])).toThrow(/not a numeric/);
    expect(() => parseArgs(['--bots', '4', '--tune', 'bots.disengageHysteresis=1.5'])).toThrow(/\[0, 1\]/);
    expect(() => parseArgs(['--bots', '4', '--tune', 'bots.secReleaseHeat=1.5'])).toThrow(/\[0, 1\]/);
    expect(() => parseArgs(['--bots', '4', '--tune', 'bots.secRepressHeat=-0.1'])).toThrow(/\[0, 1\]/);
    expect(() => parseArgs(['--bots', '4', '--tune', 'bots.gunBand.flak.1=-0.1'])).toThrow(/\[0, 1\]/);
    expect(() => parseArgs(['--bots', '4', '--tune', 'bots.nav.avoidRays=0'])).toThrow(/>= 1/);
    expect(() => parseArgs(['--bots', '4', '--tune', 'bots.stuckMs=-1'])).toThrow(/>= 0/);
    expect(() => parseArgs(['--bots', '4', '--tune', 'bots.nav.cellU=16'])).toThrow(/NAV_CELL/);
    expect(() => parseArgs(['--bots', '4', '--tune', 'bots.disengageHpFrac=0.2'])).toThrow(/module load/);
    const lo = CONFIG.bots.gunBand.cannon[0];
    expect(() => applyOverrides({}, { 'bots.gunBand.cannon.0': 0.95 })).toThrow(/min <= max/);
    expect(CONFIG.bots.gunBand.cannon[0]).toBe(lo); // rolled back
  });
});
