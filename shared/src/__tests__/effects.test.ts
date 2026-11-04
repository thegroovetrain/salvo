// The boon effect vocabulary's authoring helpers and the generated stat-path
// whitelist (sim/effects.ts).
import { describe, it, expect } from 'vitest';
import { EQUIPMENT_IDS } from '../sim/loadout.js';
import { INDEX_IDS } from '../constants.js';
import {
  BOON_STAT_PATHS,
  BOON_STAT_PATH_SET,
  TOP_LEVEL_STAT_PATHS,
  doctrineEffect,
  statEffect,
} from '../sim/effects.js';

describe('statEffect / doctrineEffect', () => {
  it('statEffect builds a stat effect carrying only the levers given', () => {
    const add = statEffect('maxHp', { add: 5 });
    expect(add).toEqual({ kind: 'stat', path: 'maxHp', add: 5 });
    expect('mult' in add).toBe(false);
    expect(statEffect('maxHp', { mult: 2, add: 1 })).toEqual({ kind: 'stat', path: 'maxHp', mult: 2, add: 1 });
  });

  it('doctrineEffect builds a doctrine effect naming the weapon and the verb', () => {
    expect(doctrineEffect('gun', 'verbX')).toEqual({ kind: 'doctrine', weapon: 'gun', mode: 'verbX' });
  });
});

describe('the stat-path whitelist', () => {
  it('the top-level paths are the seven authored indices + maxHp + radarRange + the four pass-through kinematics, and NO derived path (Story 10.3)', () => {
    const top = [...TOP_LEVEL_STAT_PATHS];
    for (const idx of INDEX_IDS) expect(top, idx).toContain(idx);
    for (const derived of ['kinematics.maxSpeed', 'kinematics.turnRate', 'sweepRpm', 'cooldownScale', 'sweepPeriodMs', 'sightRange', 'damageMultiplier']) {
      expect(top, derived).not.toContain(derived);
    }
    expect(top.some((p) => p.startsWith('regen.'))).toBe(false);
    expect(top.filter((p) => p.startsWith('kinematics.')).sort()).toEqual(
      ['kinematics.accel', 'kinematics.decel', 'kinematics.reverseSpeed', 'kinematics.steerageSpeed'],
    );
  });

  it('the guard set holds exactly the generated paths, none duplicated', () => {
    expect(BOON_STAT_PATH_SET.size).toBe(BOON_STAT_PATHS.length);
    for (const p of BOON_STAT_PATHS) expect(BOON_STAT_PATH_SET.has(p)).toBe(true);
    expect(BOON_STAT_PATH_SET.has('equipment.gun.notAField')).toBe(false);
  });

  it('every path is a top-level stat or equipment.<id>.<field> on a real equipment id', () => {
    const top = new Set<string>(TOP_LEVEL_STAT_PATHS);
    for (const p of TOP_LEVEL_STAT_PATHS) expect(BOON_STAT_PATH_SET.has(p)).toBe(true);
    const ids = new Set<string>(EQUIPMENT_IDS);
    for (const p of BOON_STAT_PATHS) {
      if (top.has(p)) continue;
      const parts = p.split('.');
      expect(parts, p).toHaveLength(3);
      expect(parts[0], p).toBe('equipment');
      expect(ids.has(parts[1]), p).toBe(true);
    }
  });
});
