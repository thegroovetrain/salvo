// DEPLOYMENT COUNTERS — "did this equipment reach the water?", which is a
// different question from "was it asked for?".
//
// WHY THIS FILE EXISTS. `BotSample.shots` is `ship.lastFireSeq`, and world.ts
// is explicit at its consumption site that "consumption is unconditional —
// lastFireSeq advances even dead or denied". A bot that requests a radar buoy
// every tick and is refused every tick therefore reads IDENTICALLY, by shots,
// to one that deploys on cooldown. That made "do bots ever actually use the
// buoy?" unanswerable from a campaign report, and a reload-based behavioural
// probe unsound for the same reason. BotCollector now diffs the World's own
// `buoys` / `mines` maps by id instead, and these tests pin that the two
// signals cannot collapse back into one.
//
// Like every other number in botMetrics this is READ-ONLY over World state.

import { describe, it, expect } from 'vitest';
import { World } from '../../../src/game/world.js';
import { BotCollector } from '../botMetrics.js';
import { addBuoy } from '../../../src/game/equipment/radarBuoy.js';
import { addMine } from '../../../src/game/equipment/mines.js';

describe('botMetrics — placeables that actually reached the water', () => {
  it('counts a real buoy and a real mine against their OWNER, once each', () => {
    const world = new World(11, 20);
    const bot = world.addBot('mineLayer');
    const col = new BotCollector([bot.id]);

    col.observe(world, 1); // nothing on the water yet
    expect(col.samples(world)[0].buoysDeployed).toBe(0);
    expect(col.samples(world)[0].minesLaid).toBe(0);

    addBuoy(world.buoys, bot, 100, 100, world.now, 'b1', 1234);
    addMine(world.mines, bot.id, 200, 200, world.now, 'm1');
    col.observe(world, 1);

    // A SECOND sighting of the SAME entities must not double-count: both maps
    // hold their entries for many ticks, so this is a first-sighting diff and
    // not a per-tick census.
    col.observe(world, 1);
    col.observe(world, 1);

    const s = col.samples(world)[0];
    expect(s.buoysDeployed).toBe(1);
    expect(s.minesLaid).toBe(1);
  });

  it('DISCRIMINATES a deployment from a denied request — the whole point', () => {
    const world = new World(12, 20);
    const bot = world.addBot('mineLayer');
    const col = new BotCollector([bot.id]);

    // The denied-request case, staged directly: the fire sequence advances
    // (exactly what a refused click does) while nothing reaches the water.
    const ship = world.ships.get(bot.id);
    expect(ship).toBeDefined();
    ship!.lastFireSeq += 25;
    col.observe(world, 1);

    const denied = col.samples(world)[0];
    expect(denied.shots).toBe(25); // the REQUEST counter moved
    expect(denied.buoysDeployed).toBe(0); // the DEPLOYMENT counter did not
    expect(denied.minesLaid).toBe(0);

    // And the mirror image: a real placement moves the deployment counter while
    // the request counter stands still. Together these two assertions prove the
    // columns cannot be reading one underlying signal.
    addBuoy(world.buoys, ship!, 50, 50, world.now, 'b9', 7);
    col.observe(world, 1);
    const placed = col.samples(world)[0];
    expect(placed.shots).toBe(25);
    expect(placed.buoysDeployed).toBe(1);
  });

  it('ignores a placement owned by someone who is not an enrolled bot', () => {
    const world = new World(13, 20);
    const bot = world.addBot('mineLayer');
    const other = world.addBot('torpedoBoat');
    const col = new BotCollector([bot.id]); // `other` is deliberately NOT enrolled

    addMine(world.mines, other.id, 300, 300, world.now, 'm7');
    col.observe(world, 1);

    expect(col.samples(world)).toHaveLength(1);
    expect(col.samples(world)[0].minesLaid).toBe(0);
  });
});
