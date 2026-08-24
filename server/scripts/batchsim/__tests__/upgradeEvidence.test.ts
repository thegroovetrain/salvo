// PER-UPGRADE EVIDENCE (balance campaign, 2026-08-24) — the raw surface the
// per-card winrate analysis reads: which cards a bot BUILT (with order and
// time), which cards it was OFFERED (the exposure denominator), and where it
// PLACED. Everything here is read-only over World state + Match.placements,
// exactly like the rest of botMetrics.
//
// WHY THESE PINS EXIST. A winrate per card is only as sound as three
// mechanisms: the pick stream must record the CARD id (not the spender id)
// with its time; a materialized offer hand must count ONCE however many ticks
// it sits open (reference diff, not content hash — two consecutive hands can
// legitimately carry identical ids); and placement must come off the same
// Match.placements map the death banner uses, never re-derived from lifeS.

import { describe, it, expect } from 'vitest';
import { World } from '../../../src/game/world.js';
import { BotCollector } from '../botMetrics.js';

describe('botMetrics — builds, picks, offers, placement', () => {
  it('records a pick with the CARD id and its sim-time, and mirrors the build', () => {
    const world = new World(21, 20);
    const bot = world.addBot('torpedoBoat');
    const col = new BotCollector([bot.id]);
    const ship = world.ships.get(bot.id)!;

    for (let t = 0; t < 40; t += 1) world.step(); // 2s of sim before the spend
    // Staged AFTER the warm-up: the bot's own brain spends a banked level it
    // sees during a step, which would drain the stage before the pin reads it.
    ship.bankedLevels = 1;
    ship.offer = ['gunBarrel', 'shipCooldown', 'intelSweep', 'torpedoSpeed'] as never;
    expect(world.spendPoint(bot.id, 2)).toBe(true); // intelSweep — bn fires next step
    world.step();
    col.observe(world, 1);

    const s = col.samples(world)[0];
    expect(s.picks).toHaveLength(1);
    expect(s.picks[0].id).toBe('intelSweep'); // the CARD, not the spender
    expect(s.picks[0].s).toBeGreaterThan(0); // stamped in sim-seconds
    expect(s.boons).toEqual(['intelSweep']); // the build mirror agrees
  });

  it('counts an offer hand ONCE across the ticks it sits open (reference diff)', () => {
    const world = new World(22, 20);
    const bot = world.addBot('battleship');
    const col = new BotCollector([bot.id]);
    const ship = world.ships.get(bot.id)!;

    ship.offer = ['gunBarrel', 'shipCooldown', 'intelSweep', 'shipSpeed'] as never;
    col.observe(world, 1);
    col.observe(world, 1);
    col.observe(world, 1);

    let s = col.samples(world)[0];
    expect(s.offerHands).toBe(1);
    expect(s.offersSeen.gunBarrel).toBe(1);

    // A NEW array with the SAME content is a new materialized hand and counts
    // again — offers are frozen at materialization, so identity IS the signal.
    ship.offer = ['gunBarrel', 'shipCooldown', 'intelSweep', 'shipSpeed'] as never;
    col.observe(world, 1);
    s = col.samples(world)[0];
    expect(s.offerHands).toBe(2);
    expect(s.offersSeen.gunBarrel).toBe(2);
  });

  it('placement comes off the passed map; absent map or row reads null', () => {
    const world = new World(23, 20);
    const bot = world.addBot('mineLayer');
    const other = world.addBot('torpedoBoat');
    const col = new BotCollector([bot.id, other.id]);
    col.observe(world, 1);

    // Without a placements map (an 'unresolved' cap-out) every row is null.
    for (const row of col.samples(world)) expect(row.placement).toBeNull();

    const placements = new Map([[bot.id, 1]]);
    const rows = col.samples(world, placements);
    expect(rows.find((r) => r.id === bot.id)!.placement).toBe(1);
    expect(rows.find((r) => r.id === other.id)!.placement).toBeNull();
  });
});
