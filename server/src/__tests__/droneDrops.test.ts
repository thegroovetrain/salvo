// DRONE DROPS (Eric ruling 2026-10-01, CONFIG.droneDrops): the credited killer
// of a PvE drone rolls consumables — one 50 % roll for a small drone, two for a
// medium, three for a large — each a uniform pick over the consumable lines the
// ship could legally take right now by the refit card's own predicate
// (`pickRefusal`). Every row of the spec's I/O matrix is driven through the
// REAL kill path (`sinkShip(id, by)` → creditKill), with the world's private
// drop stream swapped for a scripted one so each coin and pick is chosen.
//
// STORY 10.1 (Eric ruling 8): the eligible set is CONFINED TO THE CAPTAIN'S
// FOUR — a consumable outside the ship's kit has no slot, so `pickRefusal`
// refuses it (`stub`) and `pickDrop` never offers it. No second filter: the
// confinement suite at the bottom proves it through the real `pickDrop` path.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  CONSUMABLE_SLOTS,
  DEFAULT_KIT,
  consumableSlotFor,
  dealableConsumables,
  type ConsumableId,
  type ConsumableKit,
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

/** The test captains' kit (Story 10.1) — deliberately NOT the default four, so
 *  nothing here silently rides DEFAULT_KIT. Carries the decoy (the refit-hand
 *  suite offers it) and HULL REPAIR + SHIELD BLOCK (the cap matrix). */
const KIT: ConsumableKit = ['hullRepair', 'shieldBlock', 'decoyBuoy', 'supercavTorpedo'];

/** The lines a KIT captain can be dropped, in the CATALOG order `pickDrop`
 *  walks — the live lines the kit carries. */
const CARRIED = LIVE_CONSUMABLES.filter((id) => (KIT as readonly string[]).includes(id));

function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

function place(
  w: World,
  id: string,
  x = 0,
  y = 0,
  hull: HullId = 'torpedoBoat',
  role: 'captain' | 'fleet' | 'bot' = 'captain',
  kit: ConsumableKit = KIT,
): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), role, hull, undefined, undefined, undefined, kit);
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

describe('CONFIG.droneDrops — the shape the scripted coins rely on', () => {
  it('the chance is a probability the PASS / FAIL coins straddle, and a bigger drone rolls more', () => {
    const { chance, rolls } = CONFIG.droneDrops;
    expect(PASS).toBeLessThan(chance);
    expect(FAIL).toBeGreaterThanOrEqual(chance);
    expect(chance).toBeGreaterThan(0);
    expect(chance).toBeLessThanOrEqual(1);
    expect(rolls.droneSmall).toBeGreaterThan(0);
    expect(rolls.droneMedium).toBeGreaterThan(rolls.droneSmall);
    expect(rolls.droneLarge).toBeGreaterThan(rolls.droneMedium);
  });
});

describe('drone drops — roll counts by drone size', () => {
  it('SMALL, coin passes: one carried consumable stocked into its own slot, one `dp` to the killer', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const d = place(w, 'd', 200, 0, 'droneSmall', 'fleet');
    const log = scriptDrops(w, [PASS], [1]);
    w.sinkShip(d.id, 'a');
    expect(log.coins).toBe(1);
    expect(log.picks).toEqual([{ min: 0, max: CARRIED.length - 1 }]);
    const picked = CARRIED[1];
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
    const [x, , z] = [CARRIED[0], CARRIED[0], CARRIED[2]];
    expect([...a.cards].sort()).toEqual([x, x, z].sort());
    expect(boonStackCount(a.cards, x)).toBe(2);
    const xSlot = consumableSlotFor(KIT, x as ConsumableId)!;
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
  // Since Story 9.2 (epic-9 amendment 21; amendment 226 without its belt
  // branch) every carried kind owns its own slot — and since Story 10.1 only
  // the KIT's kinds have one — so the eligible set is every kind the captain
  // carries that is under its cap.
  const HELD3 = KIT.slice(0, 3) as readonly string[];

  it('HOLDING THREE CARRIED KINDS narrows nothing: every carried kind under cap stays eligible, and the fourth lands in its own slot', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (const id of HELD3) w.applyCard(a, id);
    const d = place(w, 'd', 200, 0, 'droneSmall', 'fleet');
    const fresh = CARRIED.find((id) => !HELD3.includes(id))!;
    const log = scriptDrops(w, [PASS], [CARRIED.indexOf(fresh)]);
    w.sinkShip(d.id, 'a');
    expect(log.picks).toEqual([{ min: 0, max: CARRIED.length - 1 }]);
    expect(boonStackCount(a.cards, fresh)).toBe(1);
    expect(a.loadout[consumableSlotFor(KIT, fresh as ConsumableId)!].equipmentId).toBe(fresh);
    for (const id of HELD3) expect(a.loadout[consumableSlotFor(KIT, id as ConsumableId)!].equipmentId, id).toBe(id); // nothing moved
  });

  it('EVERY carried kind at cap 5: the roll is wasted — no pick drawn, no event, no throw', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (const id of CARRIED) for (let i = 0; i < CATALOG[id].cap; i++) w.applyCard(a, id);
    const before = [...a.cards];
    const d = place(w, 'd', 200, 0, 'droneLarge', 'fleet');
    const log = scriptDrops(w, [PASS, PASS, PASS]);
    expect(() => w.sinkShip(d.id, 'a')).not.toThrow();
    expect(log.coins).toBe(3); // the coin is still drawn for every roll
    expect(log.picks).toEqual([]);
    expect(a.cards).toEqual(before);
    expect(dropsAfterStep(w)).toEqual([]);
  });

  it('LINE AT CAP: that line is excluded; the pick is among the other carried lines', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (let i = 0; i < CATALOG.hullRepair.cap; i++) w.applyCard(a, 'hullRepair');
    const d = place(w, 'd', 200, 0, 'droneSmall', 'fleet');
    const others = CARRIED.filter((id) => id !== 'hullRepair');
    expect(others).toHaveLength(CARRIED.length - 1);
    const log = scriptDrops(w, [PASS], [others.length - 1]);
    w.sinkShip(d.id, 'a');
    expect(log.picks).toEqual([{ min: 0, max: others.length - 1 }]);
    expect(boonStackCount(a.cards, 'hullRepair')).toBe(CATALOG.hullRepair.cap);
    expect(boonStackCount(a.cards, others[others.length - 1])).toBe(1);
  });

  it('REPAIR x5 + SHIELD x2, nothing else: eligible = every other carried kind, the shield included (the spec matrix)', () => {
    const eligible = CARRIED.filter((id) => id !== 'hullRepair');
    expect(eligible).toContain('shieldBlock');
    for (let i = 0; i < eligible.length; i++) {
      const wi = bareWorld();
      const ai = place(wi, 'a');
      for (let k = 0; k < CATALOG.hullRepair.cap; k++) wi.applyCard(ai, 'hullRepair');
      for (let k = 0; k < 2; k++) wi.applyCard(ai, 'shieldBlock');
      const d = place(wi, 'd', 200, 0, 'droneSmall', 'fleet');
      const log = scriptDrops(wi, [PASS], [i]);
      wi.sinkShip(d.id, 'a');
      expect(log.picks).toEqual([{ min: 0, max: eligible.length - 1 }]);
      expect(boonStackCount(ai.cards, eligible[i]), eligible[i]).toBe(eligible[i] === 'shieldBlock' ? 3 : 1);
      expect(dropsAfterStep(wi)).toEqual([{ k: 'dp', id: 'a', boon: eligible[i] }]);
      expect(boonStackCount(ai.cards, 'hullRepair')).toBe(CATALOG.hullRepair.cap);
    }
  });

  it('DEPTH CHARGE (a stub) is never dropped: walking every pick index never lands it', () => {
    expect(CATALOG.depthCharge.kind).toBe('consumable');
    expect(LIVE_CONSUMABLES).not.toContain('depthCharge');
    // The live set is exactly the kit-eligible pool (Story 10.1).
    expect([...LIVE_CONSUMABLES].sort()).toEqual([...dealableConsumables()].sort());
    for (let i = 0; i < CARRIED.length; i++) {
      const w = bareWorld();
      const a = place(w, 'a');
      const d = place(w, 'd', 200, 0, 'droneSmall', 'fleet');
      const log = scriptDrops(w, [PASS], [i]);
      w.sinkShip(d.id, 'a');
      expect(log.picks).toEqual([{ min: 0, max: CARRIED.length - 1 }]);
      expect(a.cards).toEqual([CARRIED[i]]);
    }
  });

  it('eligibility is recomputed PER ROLL: a first drop that brings a line to its cap narrows the second', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (let i = 0; i < CATALOG.hullRepair.cap - 1; i++) w.applyCard(a, 'hullRepair');
    const d = place(w, 'd', 200, 0, 'droneMedium', 'fleet');
    // First pick: every carried kind (hullRepair one short of its cap). Pick it.
    const first = CARRIED.indexOf('hullRepair');
    const log = scriptDrops(w, [PASS, PASS], [first, 0]);
    w.sinkShip(d.id, 'a');
    expect(log.picks).toEqual([
      { min: 0, max: CARRIED.length - 1 },
      { min: 0, max: CARRIED.length - 2 },
    ]);
    expect(boonStackCount(a.cards, 'hullRepair')).toBe(CATALOG.hullRepair.cap);
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
    expect(bot.cards).toEqual([...before, CARRIED[0]]);
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
      for (const id of first) expect(CARRIED).toContain(id);
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
  const HELD = ['hullRepair', 'shieldBlock'];
  const spendStock = (w: World, s: ShipRecord, id: string) =>
    (w as unknown as { spendStock(ship: ShipRecord, line: string): void }).spendStock(s, id);

  it('the hand is NOT rerolled; a drop of a DIFFERENT kind leaves an offered consumable legal (its own slot — Story 9.2)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (const id of HELD) w.applyCard(a, id);
    a.bankedLevels = 1;
    a.offer = ['decoyBuoy', 'speed', 'reload', 'radarSweep'];
    const offer = a.offer;
    const offerBefore = [...offer];
    const fourth = CARRIED.find((id) => !HELD.includes(id) && id !== 'decoyBuoy')!;
    const d = place(w, 'd', 200, 0, 'droneSmall', 'fleet');
    scriptDrops(w, [PASS], [CARRIED.indexOf(fourth)]);
    w.sinkShip(d.id, 'a');
    expect(new Set(beltIds(a).filter((id) => id !== null))).toEqual(new Set([...HELD, fourth]));
    // Accepted as designed: same hand, same object, same bank.
    expect(a.offer).toBe(offer);
    expect([...a.offer!]).toEqual(offerBefore);
    expect(a.bankedLevels).toBe(1);
    // No full belt exists: the offered decoy still lands, in its own slot.
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.bankedLevels).toBe(0);
    expect(a.loadout[consumableSlotFor(KIT, 'decoyBuoy')!].equipmentId).toBe('decoyBuoy');
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
    scriptDrops(w, [PASS], [CARRIED.indexOf('hullRepair')]);
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
    // Firing one copy brings the line back under its cap: the same pick now succeeds.
    spendStock(w, a, 'hullRepair');
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.bankedLevels).toBe(0);
    expect(boonStackCount(a.cards, 'hullRepair')).toBe(cap);
  });
});

describe('drone drops — confined to the captain\'s four (Story 10.1, Eric ruling 8)', () => {
  const ROLLS = 600;
  const pickDrop = (w: World, s: ShipRecord) => (w as unknown as { pickDrop(ship: ShipRecord): void }).pickDrop(s);
  const spendStock = (w: World, s: ShipRecord, id: string) =>
    (w as unknown as { spendStock(ship: ShipRecord, line: string): void }).spendStock(s, id);

  /** ROLLS real `pickDrop` rolls on the world's own seeded drop stream; each
   *  landed copy is spent again so no line ever reaches its cap (which would
   *  narrow the set for a reason other than the kit). Returns every line dropped. */
  function dropsFor(kit: ConsumableKit, seed: number): Set<string> {
    const w = bareWorld(seed);
    const a = place(w, 'a', 0, 0, 'torpedoBoat', 'captain', kit);
    const seen = new Set<string>();
    for (let i = 0; i < ROLLS; i += 1) {
      pickDrop(w, a);
      const landed = a.cards[a.cards.length - 1];
      expect(landed, `roll ${i}`).toBeDefined();
      seen.add(landed);
      spendStock(w, a, landed);
      expect(a.cards).toEqual([]);
    }
    return seen;
  }

  it('a captain whose kit lacks the DECOY BUOY is never dropped one; every drop is one of its four', () => {
    expect(DEFAULT_KIT).not.toContain('decoyBuoy');
    const seen = dropsFor(DEFAULT_KIT, 101);
    expect(seen.has('decoyBuoy')).toBe(false);
    // Uniform over the four: every carried line shows up, and nothing else.
    expect([...seen].sort()).toEqual([...DEFAULT_KIT].sort());
  });

  it('a captain whose kit carries the DECOY BUOY is dropped one, and still nothing outside its four', () => {
    expect(KIT).toContain('decoyBuoy');
    const seen = dropsFor(KIT, 101);
    expect(seen.has('decoyBuoy')).toBe(true);
    expect([...seen].sort()).toEqual([...KIT].sort());
  });
});
