// THE TERRAIN DIALS AND THE SPAWN-RINGS FLAG (Epic 9 tuning pass instrument,
// 2026-10-06). Contracts: `terrain.*` on the --set surface writes
// TERRAIN_PARAMS and restores it; a `map.baseRadius` override drags
// `regionWavelength` with it unless the arm sets the wavelength itself; a
// cover band that cannot validate is refused before any match; and
// --spawn-rings parses `slots@fraction` lists and nothing else.
import { describe, expect, it } from 'vitest';
import { CONFIG, TERRAIN_PARAMS } from '@salvo/shared';
import { parseArgs } from '../args.js';
import { applyOverrides, validateTunableKey } from '../overrides.js';

describe('--set terrain.* (TERRAIN_PARAMS on the --set surface)', () => {
  it('accepts the cover band and regionWavelength, refuses unknown terrain keys', () => {
    for (const key of ['terrain.coverTarget', 'terrain.coverMin', 'terrain.coverMax', 'terrain.regionWavelength']) {
      expect(() => validateTunableKey(key)).not.toThrow();
    }
    expect(() => validateTunableKey('terrain.noSuchKnob')).toThrow(/does not exist|not a numeric/);
    expect(() => parseArgs(['--set', 'terrain.coverTarget=1.5'])).toThrow(/\(0, 1\)/);
    expect(() => parseArgs(['--set', 'terrain.coverTarget=0'])).toThrow(/\(0, 1\)/);
  });

  it('writes TERRAIN_PARAMS and the restore closure puts the band back', () => {
    const before = { ...TERRAIN_PARAMS };
    const restore = applyOverrides({ 'terrain.coverTarget': 0.05, 'terrain.coverMin': 0.04, 'terrain.coverMax': 0.06 });
    expect(TERRAIN_PARAMS.coverTarget).toBe(0.05);
    expect(TERRAIN_PARAMS.coverMin).toBe(0.04);
    expect(TERRAIN_PARAMS.coverMax).toBe(0.06);
    restore();
    expect(TERRAIN_PARAMS).toEqual(before);
  });

  it('refuses a cover band the generator could never validate, leaving the panel untouched', () => {
    const before = { ...TERRAIN_PARAMS };
    expect(() => applyOverrides({ 'terrain.coverTarget': 0.2 })).toThrow(/coverMin <= coverTarget <= coverMax/);
    expect(TERRAIN_PARAMS).toEqual(before);
  });

  it('a map.baseRadius override drags regionWavelength along unless the arm sets it', () => {
    const wavelength = TERRAIN_PARAMS.regionWavelength;
    const radius = CONFIG.map.baseRadius;
    expect(wavelength).toBe(radius); // the heightField.ts module-load rule
    let restore = applyOverrides({ 'map.baseRadius': 4200 });
    expect(TERRAIN_PARAMS.regionWavelength).toBe(4200);
    restore();
    expect(TERRAIN_PARAMS.regionWavelength).toBe(wavelength);
    expect(CONFIG.map.baseRadius).toBe(radius);
    restore = applyOverrides({ 'map.baseRadius': 4200, 'terrain.regionWavelength': 3000 });
    expect(TERRAIN_PARAMS.regionWavelength).toBe(3000);
    restore();
    expect(TERRAIN_PARAMS.regionWavelength).toBe(wavelength);
  });
});

describe('--spawn-rings', () => {
  it('parses a slots@fraction list; default is null (the shipped ring)', () => {
    expect(parseArgs([]).spawnRings).toBeNull();
    expect(parseArgs(['--spawn-rings', '12@0.8,8@0.4']).spawnRings).toEqual([
      { slots: 12, fraction: 0.8 },
      { slots: 8, fraction: 0.4 },
    ]);
  });

  it('refuses malformed rings, zero slots and fractions outside (0, 1]', () => {
    expect(() => parseArgs(['--spawn-rings', '12'])).toThrow(/slots@fraction/);
    expect(() => parseArgs(['--spawn-rings', '0@0.8'])).toThrow(/>= 1 slot/);
    expect(() => parseArgs(['--spawn-rings', '8@1.5'])).toThrow(/\(0, 1\]/);
  });
});
