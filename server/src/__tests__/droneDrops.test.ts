// DRONE DROPS (Eric ruling 2026-10-01, CONFIG.droneDrops): the credited killer
// of a PvE drone rolls consumables — one 50 % roll for a small drone, two for a
// medium, three for a large — each a uniform pick over the consumable lines the
// ship could legally take right now by the refit card's own predicate
// (`pickRefusal`). Every row of the spec's I/O matrix is driven through the
// REAL kill path (`sinkShip(id, by)` → creditKill), with the world's private
// drop stream swapped for a scripted one so each coin and pick is chosen.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  CONSUMABLE_SLOTS,
  boonStackCount,
  isAfloat,
  type DropEvent,
  type GameEvent,
  type HullId,
  type Rng,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

/** Every live consumable line, in catalog order (DEPTH CHARGE is a stub). */
const LIVE_CONSUMABLES = Object.keys(CATALOG).filter((id) => CATALOG[id].kind === 'consumable' && CATALOG[id].stub !== true);

function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, x = 0, y = 0, hull: HullId = 'torpedoBoat', role: 'captain' | 'fleet' | 'bot' = 'captain'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), role, hull, undefined, undefined);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.speed = 0;
  return rec;
}

/**
 * A scripted drop stream: `coins` answers next() in order, `picks` answers
 * int() in order (each must lie in [min, max] — asserted). Records every call
 * so a test can pin exactly what was drawn.
 */
function scripted(coins: number[], picks: number[] = []) {
  const log: { coins: number; picks: { min: number; max: number }[] } = { coins: 0, picks: [] };
  const rng: Rng = {
    next() {
      if (log.coins >= coins.length) throw new Error('drop stream: unscripted coin');
      return coins[log.coins++];
    },
    float: () => {
      throw new Error('drop stream: float is never drawn');
    },
    int(min, max) {
      const i = log.picks.length;
      log.picks.push({ min, max });
      if (i >= picks.length) throw new Error('drop stream: unscripted pick');
      const v = picks[i];
      if (v < min || v > max) throw new Error(`drop stream: scripted pick ${v} outside [${min}, ${max}]`);
      return v;
    },
    pick: () => {
      throw new Error('drop stream: pick is never drawn');
    },
  };
  return { rng, log };
}

function scriptDrops(w: World, coins: number[], picks: number[] = []) {
  const s = scripted(coins, picks);
  (w as unknown as { dropRng: Rng }).dropRng = s.rng;
  return s.log;
}

const PASS = 0.1; // < CONFIG.droneDrops.chance
const FAIL = 0.9; // >= CONFIG.droneDrops.chance

/** The `dp` events queued by everything since the last step (published by the next one). */
function dropsAfterStep(w: World): DropEvent[] {
  w.step();
  return w.tickEvents.filter((e: GameEvent): e is DropEvent => e.k === 'dp');
}

const beltIds = (s: ShipRecord) => CONSUMABLE_SLOTS.map((i) => s.loadout[i].equipmentId);

describe('CONFIG.droneDrops — Eric\'s numbers', () => {
  it('chance 0.5; rolls small 1 / medium 2 / large 3', () => {
    expect(CONFIG.droneDrops.chance).toBe(0.5);
    expect(CONFIG.droneDrops.rolls).toEqual({ droneSmall: 1, droneMedium: 2, droneLarge: 3 });
  });
});

describe('drone drops — roll counts by drone size', () => {
  it('SMALL, coin passes: one live consumable stocked into the belt, one `dp` to the killer', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const d = place(w, 'd', 200, 0, 'droneSmall', 'fleet');
    const log = scriptDrops(w, [PASS], [1]);
    w.sinkShip(d.id, 'a');
    expect(log.coins).toBe(1);
    expect(log.picks).toEqual([{ min: 0, max: LIVE_CONSUMABLES.length - 1 }]);
    const picked = LIVE_CONSUMABLES[1];
    expect(a.cards).toEqual([picked]);
    expect(beltIds(a)).toContain(picked);
    expect(dropsAfterStep(w)).toEqual([{ k: 'dp', id: 'a', boon: picked }]);
  });

  it('SMALL, coin fails: nothing stocked, no event, no pick drawn — XP paid as today', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const d = place(w, 'd', 200, 0, 'droneSmall', 'fleet');
    const log = scriptDrops(w, [FAIL]);
    w.sinkShip(d.id, 'a');
    expect(log.coins).toBe(1);
    expect(log.picks).toEqual([]);
    expect(a.cards).toEqual([]);
    expect(a.xpMs).toBe(Math.round(CONFIG.xp.levelMs * CONFIG.xp.droneTierLevels.droneSmall));
    expect(dropsAfterStep(w)).toEqual([]);
  });

  it('MEDIUM draws exactly two coins (0 and 2 drops)', () => {
    for (const [coins, expected] of [[[FAIL, FAIL], 0], [[PASS, PASS], 2]] as const) {
      const w = bareWorld();
      const a = place(w, 'a');
      const d = place(w, 'd', 200, 0, 'droneMedium', 'fleet');
      const log = scriptDrops(w, [...coins], [0, 0]);
      w.sinkShip(d.id, 'a');
      expect(log.coins).toBe(2);
      expect(a.cards).toHaveLength(expected);
      expect(dropsAfterStep(w)).toHaveLength(expected);
    }
  });

  it('LARGE, three passes: three copies (a repeat stacks), three `dp` events, only in the killer\'s frame', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const b = place(w, 'b', 100, 0);
    const d = place(w, 'd', 200, 0, 'droneLarge', 'fleet');
    const log = scriptDrops(w, [PASS, PASS, PASS], [0, 0, 2]);
    w.sinkShip(d.id, 'a');
    expect(log.coins).toBe(3);
    expect(log.picks).toHaveLength(3);
    const [x, , z] = [LIVE_CONSUMABLES[0], LIVE_CONSUMABLES[0], LIVE_CONSUMABLES[2]];
    expect([...a.cards].sort()).toEqual([x, x, z].sort());
    expect(boonStackCount(a.cards, x)).toBe(2);
    const xSlot = CONSUMABLE_SLOTS.find((i) => a.loadout[i].equipmentId === x)!;
    expect(a.loadout[xSlot].state!.n).toBe(2);
    expect(beltIds(a).filter((id) => id !== null)).toHaveLength(2);
    const drops = dropsAfterStep(w);
    expect(drops).toEqual([
      { k: 'dp', id: 'a', boon: x },
      { k: 'dp', id: 'a', boon: x },
      { k: 'dp', id: 'a', boon: z },
    ]);
    // Self-private on the wire: the killer's frame carries all three, b's none.
    const frameDrops = (s: ShipRecord) => buildFrame(w, s.id).events.filter((e) => e.k === 'dp');
    expect(frameDrops(a)).toHaveLength(3);
    expect(frameDrops(b)).toHaveLength(0);
  });

  it('LARGE, no pass: three coins, zero picks, nothing', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const d = place(w, 'd', 200, 0, 'droneLarge', 'fleet');
    const log = scriptDrops(w, [FAIL, FAIL, FAIL]);
    w.sinkShip(d.id, 'a');
    expect(log.coins).toBe(3);
    expect(log.picks).toEqual([]);
    expect(a.cards).toEqual([]);
    expect(dropsAfterStep(w)).toEqual([]);
  });
});

describe('drone drops — the eligible set is the refit card\'s predicate', () => {
  const FOUR = ['hullRepair', 'shieldBlock', 'chaff', 'decoyBuoy'];

  it('BELT FULL: the pick is limited to the four held lines, never a fifth', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (const id of FOUR) w.applyCard(a, id);
    const d = place(w, 'd', 200, 0, 'droneSmall', 'fleet');
    const log = scriptDrops(w, [PASS], [3]);
    w.sinkShip(d.id, 'a');
    // Eligible = the four held lines in catalog order.
    const eligible = LIVE_CONSUMABLES.filter((id) => FOUR.includes(id));
    expect(log.picks).toEqual([{ min: 0, max: 3 }]);
    expect(a.cards).toHaveLength(5);
    expect(boonStackCount(a.cards, eligible[3])).toBe(2);
    expect(new Set(beltIds(a))).toEqual(new Set(FOUR));
  });

  it('BELT FULL, every held line at cap 5: the roll is wasted — no pick drawn, no event, no throw', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (const id of FOUR) for (let i = 0; i < CATALOG[id].cap; i++) w.applyCard(a, id);
    const before = [...a.cards];
    const d = place(w, 'd', 200, 0, 'droneLarge', 'fleet');
    const log = scriptDrops(w, [PASS, PASS, PASS]);
    expect(() => w.sinkShip(d.id, 'a')).not.toThrow();
    expect(log.coins).toBe(3); // the coin is still drawn for every roll
    expect(log.picks).toEqual([]);
    expect(a.cards).toEqual(before);
    expect(dropsAfterStep(w)).toEqual([]);
  });

  it('LINE AT CAP, belt open: that line is excluded; the pick is among the other six live lines', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (let i = 0; i < CATALOG.hullRepair.cap; i++) w.applyCard(a, 'hullRepair');
    const d = place(w, 'd', 200, 0, 'droneSmall', 'fleet');
    const others = LIVE_CONSUMABLES.filter((id) => id !== 'hullRepair');
    expect(others).toHaveLength(6);
    const log = scriptDrops(w, [PASS], [others.length - 1]);
    w.sinkShip(d.id, 'a');
    expect(log.picks).toEqual([{ min: 0, max: 5 }]);
    expect(boonStackCount(a.cards, 'hullRepair')).toBe(CATALOG.hullRepair.cap);
    expect(boonStackCount(a.cards, others[5])).toBe(1);
  });

  it('DEPTH CHARGE (a stub) is never dropped: walking every pick index never lands it', () => {
    expect(CATALOG.depthCharge.kind).toBe('consumable');
    expect(LIVE_CONSUMABLES).not.toContain('depthCharge');
    expect(LIVE_CONSUMABLES).toHaveLength(7);
    for (let i = 0; i < LIVE_CONSUMABLES.length; i++) {
      const w = bareWorld();
      const a = place(w, 'a');
      const d = place(w, 'd', 200, 0, 'droneSmall', 'fleet');
      const log = scriptDrops(w, [PASS], [i]);
      w.sinkShip(d.id, 'a');
      expect(log.picks).toEqual([{ min: 0, max: 6 }]);
      expect(a.cards).toEqual([LIVE_CONSUMABLES[i]]);
    }
  });

  it('eligibility is recomputed PER ROLL: a first drop that fills the belt narrows the second', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (const id of ['hullRepair', 'shieldBlock', 'chaff']) w.applyCard(a, id);
    const d = place(w, 'd', 200, 0, 'droneMedium', 'fleet');
    // First pick: 7 eligible (three held + four open-slot lines). Pick decoyBuoy.
    const first = LIVE_CONSUMABLES.indexOf('decoyBuoy');
    const log = scriptDrops(w, [PASS, PASS], [first, 0]);
    w.sinkShip(d.id, 'a');
    expect(log.picks).toEqual([{ min: 0, max: 6 }, { min: 0, max: 3 }]);
    expect(new Set(beltIds(a))).toEqual(new Set(['hullRepair', 'shieldBlock', 'chaff', 'decoyBuoy']));
  });
});

describe('drone drops — who rolls', () => {
  it('a BOT killer gets the copy by the same rule', () => {
    const w = bareWorld();
    const bot = place(w, 'bot1', 0, 0, 'torpedoBoat', 'bot');
    const before = [...bot.cards];
    const d = place(w, 'd', 200, 0, 'droneSmall', 'fleet');
    scriptDrops(w, [PASS], [0]);
    w.sinkShip(d.id, 'bot1');
    expect(bot.cards).toEqual([...before, LIVE_CONSUMABLES[0]]);
  });

  it('a SINKING killer (mutual destruction) gets the XP but NO roll', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 100, 0);
    const d = place(w, 'd', 200, 0, 'droneSmall', 'fleet');
    w.sinkShip('a', 'b');
    expect(isAfloat(a.lifecycle)).toBe(false);
    const log = scriptDrops(w, []);
    w.sinkShip(d.id, 'a');
    expect(log.coins).toBe(0);
    expect(a.cards).toEqual([]);
    expect(a.xpMs).toBe(Math.round(CONFIG.xp.levelMs * CONFIG.xp.droneTierLevels.droneSmall));
    expect(dropsAfterStep(w)).toEqual([]);
  });

  it('a STORM / unattributed sink, a self sink and a FLEET killer roll nothing', () => {
    for (const by of [undefined, 'd', 'f'] as const) {
      const w = bareWorld();
      place(w, 'a');
      const f = place(w, 'f', 300, 0, 'droneLarge', 'fleet');
      const d = place(w, 'd', 200, 0, 'droneLarge', 'fleet');
      const log = scriptDrops(w, []);
      w.sinkShip(d.id, by);
      expect(log.coins).toBe(0);
      expect(f.cards).toEqual([]);
      expect(dropsAfterStep(w)).toEqual([]);
    }
  });

  it('a CAPTAIN victim rolls nothing (kill XP only)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 100, 0);
    const log = scriptDrops(w, []);
    w.sinkShip('b', 'a');
    expect(log.coins).toBe(0);
    expect(a.cards).toEqual([]);
    expect(dropsAfterStep(w)).toEqual([]);
  });

  it('a BOT victim rolls nothing either', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'bot1', 100, 0, 'torpedoBoat', 'bot');
    const log = scriptDrops(w, []);
    w.sinkShip('bot1', 'a');
    expect(log.coins).toBe(0);
    expect(dropsAfterStep(w)).toEqual([]);
  });
});

describe('drone drops — determinism and stream isolation', () => {
  /** Sink a large drone credited to `a` on the REAL (unscripted) drop stream. */
  function realDrops(seed: number): string[] {
    const w = bareWorld(seed);
    const a = place(w, 'a');
    const d = place(w, 'd', 200, 0, 'droneLarge', 'fleet');
    w.sinkShip(d.id, 'a');
    return [...a.cards];
  }

  it('the same seed yields the same drops; the real stream draws through mulberry32', () => {
    let anyDrop = false;
    for (const seed of [1, 2, 3, 7, 42, 1234]) {
      const first = realDrops(seed);
      expect(realDrops(seed)).toEqual(first);
      for (const id of first) expect(LIVE_CONSUMABLES).toContain(id);
      if (first.length > 0) anyDrop = true;
    }
    expect(anyDrop).toBe(true);
  });

  it('a drop consumes neither the spawn stream nor any ship\'s draw stream: the next spawn and a later offer match a twin world with no drop', () => {
    function run(credit: boolean) {
      const w = bareWorld(11);
      const a = place(w, 'a');
      const c = place(w, 'c', 400, 0);
      place(w, 'v', 500, 0);
      const d = place(w, 'd', 200, 0, 'droneLarge', 'fleet');
      scriptDrops(w, credit ? [PASS, PASS, PASS] : [], [0, 1, 2]);
      w.sinkShip(d.id, credit ? 'a' : undefined);
      // The killer's own draw stream: three draws off it now must match the twin.
      const aDraws = [a.drawRng.next(), a.drawRng.next(), a.drawRng.next()];
      // The spawn stream: a fresh join lands where it would have.
      const late = w.addShip('late', 'LATE', 'captain', 'torpedoBoat', undefined, undefined);
      // Another captain's first offer (a human kill banks a level).
      w.sinkShip('v', 'c');
      return { cards: [...a.cards], aDraws, spawn: { x: late.state.x, y: late.state.y }, offer: c.offer };
    }
    const withDrop = run(true);
    const without = run(false);
    expect(withDrop.cards).toHaveLength(3);
    expect(without.cards).toEqual([]);
    expect(withDrop.spawn).toEqual(without.spawn);
    expect(withDrop.aDraws).toEqual(without.aDraws);
    expect(withDrop.offer).not.toBeNull();
    expect(withDrop.offer).toEqual(without.offer);
  });

  it('the drop path never touches the spawn stream (spy)', () => {
    const w = bareWorld(5);
    place(w, 'a');
    const d = place(w, 'd', 200, 0, 'droneLarge', 'fleet');
    const spawn = (w as unknown as { rng: Rng }).rng;
    let spawnCalls = 0;
    (w as unknown as { rng: Rng }).rng = {
      next: () => (spawnCalls++, spawn.next()),
      float: (a, b) => (spawnCalls++, spawn.float(a, b)),
      int: (a, b) => (spawnCalls++, spawn.int(a, b)),
      pick: (arr) => (spawnCalls++, spawn.pick(arr)),
    };
    scriptDrops(w, [PASS, PASS, PASS], [0, 1, 2]);
    w.sinkShip(d.id, 'a');
    expect(spawnCalls).toBe(0);
  });
});

describe('drone drops — a drop landing while a refit hand is open (Eric 2026-10-01, amendment 227)', () => {
  const HELD = ['hullRepair', 'shieldBlock', 'chaff'];
  const spendStock = (w: World, s: ShipRecord, id: string) =>
    (w as unknown as { spendStock(ship: ShipRecord, line: string): void }).spendStock(s, id);

  it('the hand is NOT rerolled; a card the drop made illegal is refused like any full-belt pick; firing a stack to zero frees room', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (const id of HELD) w.applyCard(a, id);
    a.bankedLevels = 1;
    a.offer = ['decoyBuoy', 'speed', 'reload', 'radarSweep'];
    const offer = a.offer;
    const offerBefore = [...offer];
    // The drop lands a DIFFERENT fourth line, so the offered decoyBuoy is now unstockable.
    const fourth = LIVE_CONSUMABLES.find((id) => !HELD.includes(id) && id !== 'decoyBuoy')!;
    const d = place(w, 'd', 200, 0, 'droneSmall', 'fleet');
    scriptDrops(w, [PASS], [LIVE_CONSUMABLES.indexOf(fourth)]);
    w.sinkShip(d.id, 'a');
    expect(new Set(beltIds(a).filter((id) => id !== null))).toEqual(new Set([...HELD, fourth]));
    // Accepted as designed: same hand, same object, same bank.
    expect(a.offer).toBe(offer);
    expect([...a.offer!]).toEqual(offerBefore);
    expect(a.bankedLevels).toBe(1);
    // The now-illegal pick is refused and nothing moves.
    const cardsBefore = [...a.cards];
    expect(w.spendPoint('a', 0)).toBe(false);
    expect(a.offer).toBe(offer);
    expect([...a.offer!]).toEqual(offerBefore);
    expect(a.bankedLevels).toBe(1);
    expect(a.cards).toEqual(cardsBefore);
    // Fire one stack to zero: a slot frees and the same pick now succeeds.
    spendStock(w, a, 'hullRepair');
    expect(boonStackCount(a.cards, 'hullRepair')).toBe(0);
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.bankedLevels).toBe(0);
    expect(boonStackCount(a.cards, 'decoyBuoy')).toBe(1);
  });

  it('a drop that tops a held line to its cap while the hand offers it: that pick is refused (at cap), nothing throws', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const cap = CATALOG.hullRepair.cap;
    for (let i = 0; i < cap - 1; i++) w.applyCard(a, 'hullRepair');
    a.bankedLevels = 1;
    a.offer = ['hullRepair', 'speed', 'reload', 'radarSweep'];
    const offer = a.offer;
    const offerBefore = [...offer];
    const d = place(w, 'd', 200, 0, 'droneSmall', 'fleet');
    scriptDrops(w, [PASS], [LIVE_CONSUMABLES.indexOf('hullRepair')]);
    expect(() => w.sinkShip(d.id, 'a')).not.toThrow();
    expect(boonStackCount(a.cards, 'hullRepair')).toBe(cap);
    expect(a.offer).toBe(offer);
    let result: boolean | undefined;
    expect(() => {
      result = w.spendPoint('a', 0);
    }).not.toThrow();
    expect(result).toBe(false);
    expect([...a.offer!]).toEqual(offerBefore);
    expect(a.bankedLevels).toBe(1);
    expect(boonStackCount(a.cards, 'hullRepair')).toBe(cap);
  });
});
