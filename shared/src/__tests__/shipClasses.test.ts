import { describe, it, expect } from 'vitest';
import { CONFIG, SHIP_CLASS_IDS, sanitizeClassId } from '../index.js';

describe('ship class balance identity (guard against silent retunes)', () => {
  it('cruiser is byte-for-byte the pre-classes single ship', () => {
    // A refactor slip can't retune the game without failing here.
    expect(CONFIG.shipClasses.cruiser).toEqual({
      hull: { length: 40, beam: 12 },
      hp: 100,
      kinematics: {
        maxSpeed: 38,
        reverseSpeed: 12,
        accel: 9,
        decel: 14,
        turnRate: 0.75,
        steerageSpeed: 10,
      },
    });
  });

  it('destroyer is faster + lighter than the cruiser', () => {
    const d = CONFIG.shipClasses.destroyer;
    const c = CONFIG.shipClasses.cruiser;
    expect(d.kinematics.maxSpeed).toBeGreaterThan(c.kinematics.maxSpeed);
    expect(d.kinematics.turnRate).toBeGreaterThan(c.kinematics.turnRate);
    expect(d.hp).toBeLessThan(c.hp);
    expect(d.hull.length).toBeLessThan(c.hull.length);
    expect(d.hull.beam).toBeLessThan(c.hull.beam);
  });

  it('battleship is slower + heavier than the cruiser', () => {
    const b = CONFIG.shipClasses.battleship;
    const c = CONFIG.shipClasses.cruiser;
    expect(b.kinematics.maxSpeed).toBeLessThan(c.kinematics.maxSpeed);
    expect(b.kinematics.turnRate).toBeLessThan(c.kinematics.turnRate);
    expect(b.hp).toBeGreaterThan(c.hp);
    expect(b.hull.length).toBeGreaterThan(c.hull.length);
    expect(b.hull.beam).toBeGreaterThan(c.hull.beam);
  });
});

describe('SHIP_CLASS_IDS', () => {
  it('is the ordered destroyer/cruiser/battleship set matching CONFIG', () => {
    expect([...SHIP_CLASS_IDS]).toEqual(['destroyer', 'cruiser', 'battleship']);
    for (const id of SHIP_CLASS_IDS) expect(CONFIG.shipClasses[id]).toBeDefined();
  });
});

describe('sanitizeClassId', () => {
  it('passes through each valid id', () => {
    for (const id of SHIP_CLASS_IDS) expect(sanitizeClassId(id)).toBe(id);
  });

  it('falls back to cruiser for garbage strings', () => {
    expect(sanitizeClassId('carrier')).toBe('cruiser');
    expect(sanitizeClassId('')).toBe('cruiser');
    expect(sanitizeClassId('CRUISER')).toBe('cruiser'); // case-sensitive
  });

  it('falls back to cruiser for non-string input', () => {
    expect(sanitizeClassId(undefined)).toBe('cruiser');
    expect(sanitizeClassId(null)).toBe('cruiser');
    expect(sanitizeClassId(3)).toBe('cruiser');
    expect(sanitizeClassId({ cls: 'destroyer' })).toBe('cruiser');
  });
});
