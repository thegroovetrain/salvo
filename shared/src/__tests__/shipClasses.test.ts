// Pins the ratified beta class table and the drone envelope table. The class
// maxSpeeds are the Eric knot-realistic rescale (2026-07-21, Story 1.6): TB 45
// / ML 40 / BS 35 — a DELIBERATE pin update from the 50/38/28 of Story 1.3.
// Every other class field (reverseSpeed/accel/decel/turnRate/steerageSpeed,
// hull dims, hp) and the entire drone table are UNCHANGED and byte-for-byte
// pinned. These pins fail the moment any envelope value drifts from the
// approved table without a matching test change.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  DRONE_HULL_IDS,
  DRONE_SIZE_IDS,
  HULL_IDS,
  SHIP_CLASS_IDS,
  hullEnvelope,
  sanitizeClassId,
} from '../index.js';

describe('ratified class table (exact Eric-approved values)', () => {
  it('torpedoBoat: 100×9, hp 70, fast and fragile', () => {
    expect(CONFIG.shipClasses.torpedoBoat).toEqual({
      hull: { length: 100, beam: 9 },
      hp: 70,
      kinematics: {
        maxSpeed: 45,
        reverseSpeed: 15,
        accel: 12,
        decel: 18,
        turnRate: 0.8,
        steerageSpeed: 12,
      },
    });
  });

  it('battleship: 124×32, hp 150, slow and armored', () => {
    expect(CONFIG.shipClasses.battleship).toEqual({
      hull: { length: 124, beam: 32 },
      hp: 150,
      kinematics: {
        maxSpeed: 35,
        reverseSpeed: 9,
        accel: 5,
        decel: 9,
        turnRate: 0.4,
        steerageSpeed: 8,
      },
    });
  });

  it('mineLayer: 88×20, hp 105, the middle envelope', () => {
    expect(CONFIG.shipClasses.mineLayer).toEqual({
      hull: { length: 88, beam: 20 },
      hp: 105,
      kinematics: {
        maxSpeed: 40,
        reverseSpeed: 14,
        accel: 8,
        decel: 15,
        turnRate: 0.6,
        steerageSpeed: 10,
      },
    });
  });
});

describe('class ordering invariants', () => {
  const tb = CONFIG.shipClasses.torpedoBoat;
  const bb = CONFIG.shipClasses.battleship;
  const ml = CONFIG.shipClasses.mineLayer;

  it('torpedoBoat is the fastest and most fragile', () => {
    expect(tb.kinematics.maxSpeed).toBeGreaterThan(ml.kinematics.maxSpeed);
    expect(tb.kinematics.maxSpeed).toBeGreaterThan(bb.kinematics.maxSpeed);
    expect(tb.hp).toBeLessThan(ml.hp);
    expect(tb.hp).toBeLessThan(bb.hp);
    expect(tb.hull.beam).toBeLessThan(ml.hull.beam);
    expect(tb.hull.beam).toBeLessThan(bb.hull.beam);
  });

  it('battleship is the slowest and toughest', () => {
    expect(bb.kinematics.maxSpeed).toBeLessThan(ml.kinematics.maxSpeed);
    expect(bb.kinematics.turnRate).toBeLessThan(tb.kinematics.turnRate);
    expect(bb.kinematics.turnRate).toBeLessThan(ml.kinematics.turnRate);
    expect(bb.hp).toBeGreaterThan(ml.hp);
    expect(bb.hull.length).toBeGreaterThan(tb.hull.length);
    expect(bb.hull.beam).toBeGreaterThan(ml.hull.beam);
  });
});

describe('SHIP_CLASS_IDS / HULL_IDS', () => {
  it('SHIP_CLASS_IDS is the ordered torpedoBoat/battleship/mineLayer set matching CONFIG', () => {
    expect([...SHIP_CLASS_IDS]).toEqual(['torpedoBoat', 'battleship', 'mineLayer']);
    for (const id of SHIP_CLASS_IDS) expect(CONFIG.shipClasses[id]).toBeDefined();
  });

  it('drones are NOT ship classes (never pickable)', () => {
    for (const id of DRONE_HULL_IDS) {
      expect((SHIP_CLASS_IDS as readonly string[]).includes(id)).toBe(false);
      expect((CONFIG.shipClasses as Record<string, unknown>)[id]).toBeUndefined();
    }
  });

  it('HULL_IDS is classes then drones, aligned with the drone size keys', () => {
    expect([...HULL_IDS]).toEqual([...SHIP_CLASS_IDS, ...DRONE_HULL_IDS]);
    expect([...DRONE_HULL_IDS]).toEqual(['droneSmall', 'droneMedium', 'droneLarge']);
    expect([...DRONE_SIZE_IDS]).toEqual(['small', 'medium', 'large']);
  });

  it('hullEnvelope resolves classes from shipClasses and drones from CONFIG.drones', () => {
    for (const id of SHIP_CLASS_IDS) expect(hullEnvelope(id)).toBe(CONFIG.shipClasses[id]);
    DRONE_HULL_IDS.forEach((id, i) => {
      expect(hullEnvelope(id)).toBe(CONFIG.drones[DRONE_SIZE_IDS[i]]);
    });
  });
});

describe('drone envelope table', () => {
  it('hp 80/100/120, chevron dims 85×25 / 100×30 / 115×35', () => {
    expect(CONFIG.drones.small.hp).toBe(80);
    expect(CONFIG.drones.medium.hp).toBe(100);
    expect(CONFIG.drones.large.hp).toBe(120);
    expect(CONFIG.drones.small.hull).toEqual({ length: 85, beam: 25 });
    expect(CONFIG.drones.medium.hull).toEqual({ length: 100, beam: 30 });
    expect(CONFIG.drones.large.hull).toEqual({ length: 115, beam: 35 });
  });

  it('kinematics are byte-for-byte the retired destroyer/cruiser/battleship blocks', () => {
    expect(CONFIG.drones.small.kinematics).toEqual({
      maxSpeed: 46,
      reverseSpeed: 14,
      accel: 11,
      decel: 17,
      turnRate: 0.9,
      steerageSpeed: 12,
    });
    expect(CONFIG.drones.medium.kinematics).toEqual({
      maxSpeed: 38,
      reverseSpeed: 12,
      accel: 9,
      decel: 14,
      turnRate: 0.75,
      steerageSpeed: 10,
    });
    expect(CONFIG.drones.large.kinematics).toEqual({
      maxSpeed: 30,
      reverseSpeed: 10,
      accel: 7,
      decel: 11,
      turnRate: 0.6,
      steerageSpeed: 8,
    });
  });

  it('every drone entry has the full ship-class envelope shape (effectiveStats-compatible)', () => {
    for (const size of DRONE_SIZE_IDS) {
      const d = CONFIG.drones[size];
      expect(Object.keys(d).sort()).toEqual(['hp', 'hull', 'kinematics']);
      expect(Object.keys(d.kinematics).sort()).toEqual(
        Object.keys(CONFIG.shipClasses.torpedoBoat.kinematics).sort(),
      );
    }
  });
});

describe('sanitizeClassId', () => {
  it('passes through each valid id', () => {
    for (const id of SHIP_CLASS_IDS) expect(sanitizeClassId(id)).toBe(id);
  });

  it('sanitizes the legacy prototype ids to torpedoBoat', () => {
    expect(sanitizeClassId('destroyer')).toBe('torpedoBoat');
    expect(sanitizeClassId('cruiser')).toBe('torpedoBoat');
  });

  it('drone hull ids are not pickable classes — they sanitize to torpedoBoat', () => {
    for (const id of DRONE_HULL_IDS) expect(sanitizeClassId(id)).toBe('torpedoBoat');
  });

  it('falls back to torpedoBoat for garbage strings', () => {
    expect(sanitizeClassId('carrier')).toBe('torpedoBoat');
    expect(sanitizeClassId('')).toBe('torpedoBoat');
    expect(sanitizeClassId('TORPEDOBOAT')).toBe('torpedoBoat'); // case-sensitive
  });

  it('falls back to torpedoBoat for non-string input', () => {
    expect(sanitizeClassId(undefined)).toBe('torpedoBoat');
    expect(sanitizeClassId(null)).toBe('torpedoBoat');
    expect(sanitizeClassId(3)).toBe('torpedoBoat');
    expect(sanitizeClassId({ cls: 'battleship' })).toBe('torpedoBoat');
  });
});
