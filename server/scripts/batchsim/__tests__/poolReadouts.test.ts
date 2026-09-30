// POOL READOUTS (Story 8.20, wave 1H) — the arithmetic of each readout on
// hand-built samples, the empty cases (no NaN anywhere), and one tiny
// end-to-end lobby: the section is present in text and JSON, internally
// consistent, and byte-identical on a fixed seed.
//
// NEVER import ../main.ts here — it runs the CLI (process.exit) at import time.

import { describe, it, expect } from 'vitest';
import { GUN_IDS } from '@salvo/shared';
import { applyOverrides } from '../overrides.js';
import type { BotSample } from '../botMetrics.js';
import { buildBotAggregate, renderBotReport } from '../botReport.js';
import { runBatch, type BatchResult, type MatchSample } from '../runner.js';
import type { World } from '../../../src/game/world.js';
import {
  HULL_REPAIR_ID,
  PoolCollector,
  buildPoolReadouts,
  emptyWeaponSlots,
  renderPoolReadouts,
  type PoolBotSample,
  type PoolMatchSample,
} from '../poolReadouts.js';

/** A BotSample carrying only what the readouts read (cast: the collector's
 *  row may gain fields this test has no opinion on). */
function bot(over: Partial<BotSample> = {}): BotSample {
  return {
    id: 'bot-1',
    levelsEarned: 0,
    levelsUnspent: 0,
    picks: [],
    offersSeen: {},
    offerHands: 0,
    placement: null,
    ...over,
  } as BotSample;
}

function poolBot(over: Partial<PoolBotSample> = {}): PoolBotSample {
  return { id: 'bot-1', gun: 'deckGun', levelEmpty: [], finalEmpty: 0, ...over };
}

function match(bots: BotSample[], pool: PoolMatchSample | undefined, index = 0): MatchSample {
  return {
    index,
    seed: index,
    durationS: 300,
    endedBy: 'fieldCleared',
    winnerClass: null,
    stormDeaths: 0,
    killsByVictimTier: {},
    captains: [],
    departedCaptains: [],
    bots,
    ...(pool === undefined ? {} : { pool }),
  };
}

const allFinite = (v: unknown): boolean => {
  if (typeof v === 'number') return Number.isFinite(v);
  if (v === null || typeof v !== 'object') return true;
  return Object.values(v).every(allFinite);
};

describe('poolReadouts — empty cases', () => {
  it('zero matches: every ratio is null (n/a), nothing is NaN', () => {
    const p = buildPoolReadouts([]);
    expect(p.bots).toBe(0);
    expect(allFinite(p)).toBe(true);
    expect(p.gunMix.map((g) => g.gun)).toEqual([...GUN_IDS]);
    for (const g of p.gunMix) {
      expect(g.bots).toBe(0);
      expect(g.share).toBeNull();
      expect(g.meanPlacement).toBeNull();
    }
    expect(p.weaponlessAtLevel).toEqual([]);
    expect(p.pureGunboat.share).toBeNull();
    expect(p.heal.takeRate).toBeNull();
    expect(p.levelsWasted.share).toBeNull();
    expect(p.weaponSpread.meanDistinctLines).toBeNull();
    expect(p.peakMines.max).toBeNull();
    const text = renderPoolReadouts(p).join('\n');
    expect(text).not.toContain('NaN');
    expect(text).toContain('n/a');
  });

  it('samples without a pool block (pre-8.20 literals) contribute nothing', () => {
    const p = buildPoolReadouts([match([bot()], undefined)]);
    expect(p.matches).toBe(0);
    expect(p.bots).toBe(0);
  });

  it('zero offers: heal take rate is n/a, not 0/0', () => {
    const p = buildPoolReadouts([match([bot()], { peakMines: 0, takes: {}, bots: [poolBot()] })]);
    expect(p.heal).toEqual({ hands: 0, offeredHands: 0, taken: 0, takeRate: null });
    // A lobby with no weapon take has 0 distinct lines and NO top-line share.
    expect(p.weaponSpread.meanDistinctLines).toBe(0);
    expect(p.weaponSpread.meanTopLineShare).toBeNull();
  });
});

describe('poolReadouts — arithmetic', () => {
  it('gun mix: counts, mean placement over placed bots only, wins and shares', () => {
    const bots = [
      bot({ id: 'a', placement: 1 }),
      bot({ id: 'b', placement: 3 }),
      bot({ id: 'c', placement: null }),
      bot({ id: 'd', placement: 2 }),
    ];
    const pool: PoolMatchSample = {
      peakMines: 0,
      takes: {},
      bots: [
        poolBot({ id: 'a', gun: 'flak' }),
        poolBot({ id: 'b', gun: 'flak' }),
        poolBot({ id: 'c', gun: 'flak' }),
        poolBot({ id: 'd', gun: 'machineGun' }),
      ],
    };
    const p = buildPoolReadouts([match(bots, pool)]);
    const flak = p.gunMix.find((g) => g.gun === 'flak')!;
    expect(flak).toEqual({ gun: 'flak', bots: 3, share: 0.75, meanPlacement: 2, wins: 1, winShare: 1, winRate: 1 / 3 });
    const mg = p.gunMix.find((g) => g.gun === 'machineGun')!;
    expect(mg.meanPlacement).toBe(2);
    expect(mg.wins).toBe(0);
    expect(mg.winShare).toBe(0);
    expect(p.gunMix.find((g) => g.gun === 'deckGun')!.bots).toBe(0);
  });

  it('weaponless at level: per-level shares over the bots that reached it', () => {
    const pool: PoolMatchSample = {
      peakMines: 0,
      takes: {},
      bots: [
        poolBot({ id: 'a', levelEmpty: [3, 2, 0] }),
        poolBot({ id: 'b', levelEmpty: [1] }),
      ],
    };
    const p = buildPoolReadouts([match([bot({ id: 'a' }), bot({ id: 'b' })], pool)]);
    expect(p.weaponlessAtLevel).toEqual([
      { level: 1, bots: 2, anyEmptyShare: 1, allEmptyShare: 0.5 },
      { level: 2, bots: 1, anyEmptyShare: 1, allEmptyShare: 0 },
      { level: 3, bots: 1, anyEmptyShare: 0, allEmptyShare: 0 },
    ]);
  });

  it('pure gunboat, heal take and levels wasted', () => {
    const bots = [
      bot({
        id: 'a',
        levelsEarned: 10,
        levelsUnspent: 2,
        offerHands: 8,
        offersSeen: { [HULL_REPAIR_ID]: 4, armor: 3 },
        picks: [{ id: HULL_REPAIR_ID, s: 10 }, { id: 'armor', s: 20 }, { id: HULL_REPAIR_ID, s: 30 }],
      }),
      bot({ id: 'b', levelsEarned: 6, levelsUnspent: 0, offerHands: 5, offersSeen: { [HULL_REPAIR_ID]: 1 } }),
    ];
    const pool: PoolMatchSample = {
      peakMines: 0,
      takes: {},
      bots: [poolBot({ id: 'a', finalEmpty: 3 }), poolBot({ id: 'b', finalEmpty: 1 })],
    };
    const p = buildPoolReadouts([match(bots, pool)]);
    expect(p.pureGunboat).toEqual({ bots: 1, share: 0.5 });
    expect(p.heal).toEqual({ hands: 13, offeredHands: 5, taken: 2, takeRate: 0.4 });
    expect(p.levelsWasted).toEqual({ earned: 16, wasted: 2, share: 0.125 });
  });

  it('weapon-line spread and peak mines: per-match readings averaged across matches', () => {
    const m0 = match([], { peakMines: 4, takes: { heavyTorpedo: 3, navalMines: 1 }, bots: [] }, 0);
    const m1 = match([], { peakMines: 10, takes: { broadside: 1, flak: 1, starShells: 2 }, bots: [] }, 1);
    const p = buildPoolReadouts([m0, m1]);
    expect(p.weaponSpread.matches).toBe(2);
    expect(p.weaponSpread.meanDistinctLines).toBe(2.5);
    expect(p.weaponSpread.meanTopLineShare).toBeCloseTo((0.75 + 0.5) / 2, 12);
    expect(p.peakMines).toEqual({ matches: 2, mean: 7, max: 10 });
  });

  it('emptyWeaponSlots reads the Q/E/R slots only (never the gun, Shift or belt)', () => {
    const slot = (id: string | null) => ({ equipmentId: id, state: null });
    const loadout = [slot('gun'), slot('boost'), slot(null), slot('heavyTorpedo'), slot(null), slot(null), slot(null), slot(null), slot(null)];
    expect(emptyWeaponSlots({ loadout } as never)).toBe(2);
  });
});

// --- the collector on a hand-built world ---------------------------------------

describe('PoolCollector — reading a hand-built world tick by tick', () => {
  const slot = (id: string | null) => ({ equipmentId: id, state: null });
  /** Q/E/R filled with `weapons` ids, the rest of the loadout empty. */
  const loadoutWith = (...weapons: string[]) => [
    slot('deckGun'),
    slot('boost'),
    slot(weapons[0] ?? null),
    slot(weapons[1] ?? null),
    slot(weapons[2] ?? null),
    slot(null),
    slot(null),
    slot(null),
    slot(null),
  ];
  interface FakeShip {
    gun: string;
    level: number;
    lifecycle: string;
    loadout: ReturnType<typeof loadoutWith>;
  }
  function fakeWorld(ship: FakeShip): World {
    return { mineCount: 0, ships: new Map([['bot-1', ship]]), takes: new Map() } as unknown as World;
  }
  const ACTIVE = 1;

  it('a weapon fitted and a level reached on the tick the bot SINKS are in the sample', () => {
    const ship: FakeShip = { gun: 'deckGun', level: 1, lifecycle: 'alive', loadout: loadoutWith() };
    const world = fakeWorld(ship);
    const c = new PoolCollector(['bot-1']);
    c.observe(world, ACTIVE);
    // The final tick: a pick and a level land, and the hull goes down, all
    // before the harness observes.
    ship.level = 2;
    ship.loadout = loadoutWith('heavyTorpedo');
    ship.lifecycle = 'sinking';
    c.observe(world, ACTIVE);
    ship.lifecycle = 'sunk';
    c.observe(world, ACTIVE); // frozen build: re-reading is idempotent
    expect(c.result(world).bots).toEqual([{ id: 'bot-1', gun: 'deckGun', levelEmpty: [3, 2], finalEmpty: 2 }]);
  });

  it('a level RESET (redeployEconomy) starts a fresh series: 0 -> 3 -> 0 -> 2', () => {
    const ship: FakeShip = { gun: 'deckGun', level: 0, lifecycle: 'alive', loadout: loadoutWith() };
    const world = fakeWorld(ship);
    const c = new PoolCollector(['bot-1']);
    c.observe(world, ACTIVE);
    ship.level = 3; // three levels in one reading, all three slots empty
    c.observe(world, ACTIVE);
    ship.level = 0; // the redeploy
    ship.loadout = loadoutWith('heavyTorpedo');
    c.observe(world, ACTIVE);
    ship.level = 1;
    c.observe(world, ACTIVE);
    ship.level = 2;
    ship.loadout = loadoutWith('heavyTorpedo', 'navalMines');
    c.observe(world, ACTIVE);
    expect(c.result(world).bots[0].levelEmpty).toEqual([2, 1]);
  });

  it('zero samples: an unobserved bot is skipped, and every readout stays n/a', () => {
    const ship: FakeShip = { gun: 'deckGun', level: 0, lifecycle: 'alive', loadout: loadoutWith() };
    const world = fakeWorld(ship);
    const c = new PoolCollector(['bot-1']);
    c.observe(world, 0); // pre-activation: not a sample
    const pool = c.result(world);
    expect(pool.bots).toEqual([]);
    const p = buildPoolReadouts([match([bot()], pool)]);
    expect(p.bots).toBe(0);
    expect(p.pureGunboat).toEqual({ bots: 0, share: null });
    expect(p.gunMix.every((g) => g.bots === 0 && g.share === null)).toBe(true);
    expect(allFinite(p)).toBe(true);
  });
});

// --- end to end ----------------------------------------------------------------

function tinyRun(): BatchResult {
  // The --json contract pin's sizing: a compressed, lethal storm so a 4-bot
  // lobby concludes in a few sim-seconds.
  const restore = applyOverrides({ 'zone.beatMs': 1, 'zone.terminalSightFactor': 0, 'zone.stormDps': 100000 });
  try {
    return runBatch({ seed: 9, matches: 2, captains: 0, bots: 4 });
  } finally {
    restore();
  }
}

describe('poolReadouts — end to end on a tiny bot lobby', () => {
  it('appears in text and JSON, is internally consistent, and is seed-deterministic', () => {
    const a = tinyRun();
    const b = tinyRun();
    const aggA = buildBotAggregate(a, 4);
    const aggB = buildBotAggregate(b, 4);
    const p = aggA.pool;

    // JSON: the section rides variants[].bots.pool and survives stringify.
    const json = JSON.parse(JSON.stringify(aggA)) as { pool: typeof p };
    expect(json.pool).toEqual(p);
    expect(JSON.stringify(aggA.pool)).not.toContain('NaN');

    // Text: the section is in the bot report.
    const text = renderBotReport('baseline', aggA).join('\n');
    expect(text).toContain('POOL READOUTS');
    expect(text).not.toContain('NaN');

    // Consistency.
    expect(p.matches).toBe(2);
    expect(p.bots).toBe(8);
    expect(p.gunMix.reduce((n, g) => n + g.bots, 0)).toBe(p.bots);
    for (const g of p.gunMix) expect((GUN_IDS as readonly string[]).includes(g.gun)).toBe(true);
    const shares = [
      ...p.gunMix.flatMap((g) => [g.share, g.winShare, g.winRate]),
      ...p.weaponlessAtLevel.flatMap((r) => [r.anyEmptyShare, r.allEmptyShare]),
      p.pureGunboat.share,
      p.heal.takeRate,
      p.levelsWasted.share,
      p.weaponSpread.meanTopLineShare,
    ];
    for (const s of shares) {
      if (s === null) continue;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
    expect(p.heal.taken).toBeLessThanOrEqual(p.heal.offeredHands);
    expect(p.levelsWasted.earned).toBe(aggA.levelsEarned);
    expect(p.levelsWasted.wasted).toBe(aggA.levelsUnspent);
    expect(p.peakMines.matches).toBe(2);

    // Determinism: same seed => identical readouts and identical text.
    expect(aggB.pool).toEqual(p);
    expect(renderPoolReadouts(aggB.pool)).toEqual(renderPoolReadouts(p));
  });

  it('a captains-only run carries no pool block (the default path is untouched)', () => {
    const restore = applyOverrides({ 'zone.beatMs': 4000 });
    try {
      const r = runBatch({ seed: 99, matches: 1, captains: 2 });
      expect(r.matches[0].pool).toBeUndefined();
    } finally {
      restore();
    }
  });
});
