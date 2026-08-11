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
// hull revived this tick accrues this tick). This pin fails the moment a row
// is reordered, added, or removed without a matching, reviewed test change.

import { describe, it, expect } from 'vitest';
import { World } from '../game/world.js';

describe('STEP_ORDER identity (exact ratified tick order)', () => {
  it('pins the exact row sequence by name', () => {
    expect(World.STEP_ORDER.map((row) => row.name)).toEqual([
      'dronesTick',
      'applyInputs',
      'stepShips',
      'resolveCollisions',
      'sampleWakes',
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
    ]);
  });

  it('row names are unique and every row is runnable', () => {
    const names = World.STEP_ORDER.map((row) => row.name);
    expect(new Set(names).size).toBe(names.length);
    for (const row of World.STEP_ORDER) expect(typeof row.run).toBe('function');
  });

  it('the array is frozen — no runtime reorder', () => {
    expect(Object.isFrozen(World.STEP_ORDER)).toBe(true);
  });
});
