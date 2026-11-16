// THE TUNED CATALOG (catalogTune.ts): the harness's per-run copy of the
// shared CATALOG. Mechanism only — every expected value is computed from
// CONFIG and the tune itself, never a shipped balance number (Eric: balance
// numbers are never tests).
import { describe, it, expect } from 'vitest';
import { CATALOG, CONFIG, effectiveStats, hullEnvelope, SHIP_CLASS_IDS, type Catalog } from '@salvo/shared';
import { buildTunedCatalog } from '../catalogTune.js';
import { applyOverrides, validateTuneKey, validateTuneValue, TunableError } from '../overrides.js';

const HULL = hullEnvelope(SHIP_CLASS_IDS[0]);

/** A line's effective row at `copies` cards under `catalog`. */
function row(line: string, copies: number, catalog: Catalog): Record<string, number> {
  const stats = effectiveStats(HULL, Array<string>(copies).fill(line), catalog);
  return stats.equipment[line as keyof typeof stats.equipment] as unknown as Record<string, number>;
}

/** Build the run's catalog exactly as main.ts does: CONFIG tunes first, then the copy. */
function tuned(tune: Record<string, number>): { catalog: Catalog; restore: () => void } {
  const restore = applyOverrides({}, tune);
  const catalog = buildTunedCatalog(tune);
  if (catalog === undefined) throw new Error('expected a tuned catalog');
  return { catalog, restore };
}

describe('buildTunedCatalog', () => {
  it('an untuned run gets no copy (the World plays the shipped CATALOG)', () => {
    expect(buildTunedCatalog({})).toBeUndefined();
  });

  it('re-deriving every load-time step from an UNCHANGED CONFIG reproduces the shipped catalog exactly', () => {
    const { catalog, restore } = tuned({ 'torpedo.speed': CONFIG.torpedo.speed });
    try {
      expect(JSON.parse(JSON.stringify(catalog))).toEqual(JSON.parse(JSON.stringify(CATALOG)));
    } finally {
      restore();
    }
  });

  it('never mutates the shipped CATALOG', () => {
    const before = JSON.stringify(CATALOG);
    const { restore } = tuned({ 'ladder.lightTorpedo.speed': 7, 'supercavTorpedo.runUAtV': CONFIG.supercavTorpedo.runU * 3 });
    restore();
    expect(JSON.stringify(CATALOG)).toBe(before);
  });

  it('a tuned Tier V run (`runUAtV`) is where Tier V lands — the step follows the live CONFIG', () => {
    const atV = CONFIG.supercavTorpedo.runU * 3;
    const { catalog, restore } = tuned({ 'supercavTorpedo.runUAtV': atV });
    try {
      expect(row('supercavTorpedo', 1, catalog).runU).toBeCloseTo(CONFIG.supercavTorpedo.runU, 9);
      expect(row('supercavTorpedo', 5, catalog).runU).toBeCloseTo(atV, 9);
    } finally {
      restore();
    }
  });

  it('a tuned shell radius step reaches the fold', () => {
    const step = CONFIG.flashShells.radiusStepPerTier + 40;
    const { catalog, restore } = tuned({ 'flashShells.radiusStepPerTier': step });
    try {
      expect(row('dazzleShells', 5, catalog).radius - row('dazzleShells', 1, catalog).radius).toBeCloseTo(4 * step, 9);
    } finally {
      restore();
    }
  });
});

describe('ladder.<line>.<stat>[.<tier>]', () => {
  it('without a tier, sets the step on every UPGRADE tier of a weapon (II–V)', () => {
    const { catalog, restore } = tuned({ 'ladder.lightTorpedo.speed': 7 });
    try {
      expect(row('lightTorpedo', 5, catalog).speed - row('lightTorpedo', 1, catalog).speed).toBeCloseTo(4 * 7, 9);
    } finally {
      restore();
    }
  });

  it('with a tier, sets that tier alone', () => {
    const shipped = row('lightTorpedo', 4, CATALOG).speed - row('lightTorpedo', 3, CATALOG).speed;
    const { catalog, restore } = tuned({ 'ladder.lightTorpedo.speed.5': 9 });
    try {
      expect(row('lightTorpedo', 5, catalog).speed - row('lightTorpedo', 4, catalog).speed).toBeCloseTo(9, 9);
      expect(row('lightTorpedo', 4, catalog).speed - row('lightTorpedo', 3, catalog).speed).toBeCloseTo(shipped, 9);
    } finally {
      restore();
    }
  });

  it('adds an `add` step where the line had none on that stat', () => {
    const { catalog, restore } = tuned({ 'ladder.supercavTorpedo.speed': 10 });
    try {
      expect(row('supercavTorpedo', 5, catalog).speed - row('supercavTorpedo', 1, catalog).speed).toBeCloseTo(40, 9);
    } finally {
      restore();
    }
  });

  it('a multiplier step keeps its operator: the value is the new factor', () => {
    const { catalog, restore } = tuned({ 'ladder.navalMines.blastRadius': 1.5 });
    try {
      expect(row('navalMines', 2, catalog).blastRadius / row('navalMines', 1, catalog).blastRadius).toBeCloseTo(1.5, 9);
    } finally {
      restore();
    }
    expect(() => validateTuneValue('ladder.navalMines.blastRadius', 0)).toThrow(TunableError);
  });

  it('refuses an unknown line, a stat no card can write, and a non-finite value', () => {
    expect(() => validateTuneKey('ladder.noSuchLine.speed')).toThrow(TunableError);
    expect(() => validateTuneKey('ladder.lightTorpedo.noSuchStat')).toThrow(TunableError);
    expect(() => validateTuneKey('ladder.lightTorpedo')).toThrow(TunableError);
    expect(() => validateTuneValue('ladder.lightTorpedo.speed', Number.NaN)).toThrow(TunableError);
  });
});

describe('the weapon CONFIG families', () => {
  it('every weapon block is on the --tune surface', () => {
    for (const key of ['lightTorpedo.damage', 'supercavTorpedo.damage', 'supercavTorpedo.speed', 'flashShells.radius']) {
      expect(() => validateTuneKey(key), key).not.toThrow();
    }
    const leaf = Object.keys(CONFIG.dispersion).find((k) => typeof (CONFIG.dispersion as Record<string, unknown>)[k] === 'number');
    expect(leaf).toBeDefined();
    expect(() => validateTuneKey(`dispersion.${leaf}`)).not.toThrow();
  });
});
