// STEP_ORDER identity pin (Story 5.1 AR8, epic-5 amendment 6) — the
// shipClasses.test.ts idiom applied to the tick order. AR8's benefit and its
// hazard are the same property: once the order is data, a one-line edit
// reorders the whole tick. Several steps are correct ONLY because of where
// they sit, and the row comments in world.ts are their sole documentation —
// most sharply tickRepairs, which must run dead LAST among the hp movers:
// "the alive gate reads POST-DAMAGE truth ... damage wins the tie by
// construction, with no explicit tie-break code." Move it earlier and regen
// can un-sink a hull at 0 hp. Others: sampleWakes after resolveCollisions (a
// wake records the RESOLVED pose, never a rolled-back candidate inside land);
// creepMines before stepMines (a mine that crawls into trigger range this
// tick trips this tick); applyZoneEffects before the expiry sweep (a zone
// burns/dazzles through its final tick); processRespawns before tickXp (a
// hull revived this tick accrues this tick); and founderSinking (Story 5.2)
// after the motion block but before the damage rows and the activation gates
// (the window's last tick still moves and lays wake as `sinking`, while the
// firing window closes on exactly the tick the shared decel cap reaches 0).
// This pin fails the moment a row is reordered, added, or removed without a
// matching, reviewed test change.

import { describe, it, expect } from 'vitest';
import { World } from '../game/world.js';

describe('STEP_ORDER identity (exact ratified tick order)', () => {
  it('pins the exact row sequence by name', () => {
    expect(World.STEP_ORDER.map((row) => row.name)).toEqual([
      'dronesTick',
      // Story 6.4's combat-bot driver — the third deliberate insertion: the
      // AI input rows (dronesTick + botsTick) sit IMMEDIATELY before
      // applyInputs so bot input written this tick is consumed this tick,
      // exactly as fleet input is. See the row comment in world.ts.
      'botsTick',
      'applyInputs',
      'stepShips',
      'resolveCollisions',
      'sampleWakes',
      // Story 5.2's founder edge — the one deliberate insertion this pin has
      // absorbed: after motion, before damage/activation (see the row comment
      // in world.ts for the full placement rationale).
      'founderSinking',
      'applyStorm',
      'stepShells',
      'creepMines',
      'stepMines',
      'applyZoneEffects',
      'tickRepairs',
      'tickSmoke',
      'expireLitZones',
      'expireDecoys',
      'fireControl',
      'activationControl',
      'hornControl',
      'advanceSweeps',
      'processRespawns',
      'tickXp',
      // Story 5.6's PvE wave scheduler — the second deliberate insertion, and
      // an APPEND rather than a splice: `dronesTick` keeps row 0 immediately
      // before applyInputs (its position is load-bearing), and a hull spawned
      // dead last enters the world at a clean tick boundary. See the row
      // comment in world.ts.
      'spawnFleetWaves',
    ]);
  });

  it('row names are unique and every row is runnable', () => {
    const names = World.STEP_ORDER.map((row) => row.name);
    expect(new Set(names).size).toBe(names.length);
    for (const row of World.STEP_ORDER) expect(typeof row.run).toBe('function');
  });

  it('the array AND every row are frozen — no runtime reorder or row swap', () => {
    expect(Object.isFrozen(World.STEP_ORDER)).toBe(true);
    // Freezing the container alone leaves `STEP_ORDER[i].run` writable, which
    // would let a row be replaced without moving a single name past the pin
    // above.
    for (const row of World.STEP_ORDER) expect(Object.isFrozen(row)).toBe(true);
  });

  // THE SNAPSHOT'S MATERIALIZATION POINT IS A COUPLING, AND THIS IS ITS ONLY
  // ENFORCEMENT. The tick's one aliveHulls() snapshot is memoized on FIRST
  // ACCESS of ctx.hulls(), which lands at the `stepShells` row — the exact
  // position the old inline `const hulls = this.aliveHulls()` statement held,
  // AFTER ships move and AFTER the storm bites. A future row inserted before
  // stepShells that touches ctx.hulls() would move the snapshot earlier and
  // silently hand ballistics pre-storm geometry, and the name-sequence pin
  // above would NOT catch it: the names would all still be in order.
  it('no row before stepShells touches the memoized hulls snapshot', () => {
    const rows = World.STEP_ORDER;
    const shells = rows.findIndex((row) => row.name === 'stepShells');
    expect(shells).toBeGreaterThan(0);
    const early = rows.slice(0, shells).filter((row) => /\bhulls\b/.test(String(row.run)));
    expect(early.map((row) => row.name)).toEqual([]);
  });
});
