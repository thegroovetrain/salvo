// Pins the ratified beta class table and the drone/fleet envelope table. The
// class maxSpeeds are the Eric knot-realistic rescale (2026-07-21, Story 1.6):
// TB 45 / ML 40 / BS 35 — a DELIBERATE pin update from the 50/38/28 of Story
// 1.3. Class hp moved onto the objective toughness ladder (Eric ruling
// 2026-08-03, TTK & Objective Pip Rebalance): 1 pip = 100 HP, +25 HP/pip — TB
// 70→125 (2 pips), ML 105→150 (3 pips), BS 150→175 (4 pips). Every other
// class field (reverseSpeed/accel/decel/turnRate/steerageSpeed, hull dims) is
// UNCHANGED and byte-for-byte pinned.
//
// The drone table is DELIBERATELY RE-PINNED (Story 5.6, Eric rulings
// 2026-08-14, epic-5 amendment 33): hp 80/100/120 → 60/75/90, and maxSpeed
// 46/38/30 → 40/35/30 with reverse/accel/decel scaled proportionally —
// discharging `epics.md:1090`'s open note that the drone envelopes predate
// the 1.6 hull-speed rescale (droneSmall was the fastest hull afloat at 46,
// above the Torpedo Boat's 45). turnRate and steerageSpeed deliberately do
// NOT move, so agility stays a size property rather than drifting with the
// speed retune. Hull dims are unchanged. These pins fail the moment any
// envelope value drifts from the approved table without a matching test
// change.

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
  it('torpedoBoat: 100×9, hp 125, fast and fragile', () => {
    expect(CONFIG.shipClasses.torpedoBoat).toEqual({
      hull: { length: 100, beam: 9 },
      hp: 125,
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

  it('battleship: 124×32, hp 175, slow and armored', () => {
    expect(CONFIG.shipClasses.battleship).toEqual({
      hull: { length: 124, beam: 32 },
      hp: 175,
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

  it('mineLayer: 88×20, hp 150, the middle envelope', () => {
    expect(CONFIG.shipClasses.mineLayer).toEqual({
      hull: { length: 88, beam: 20 },
      hp: 150,
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

describe('drone envelope table (Story 5.6, amendment 33 — retuned off the retired destroyer/cruiser/battleship blocks)', () => {
  it('hp 60/75/90, chevron dims 85×25 / 100×30 / 115×35 (hull dims unchanged)', () => {
    expect(CONFIG.drones.small.hp).toBe(60);
    expect(CONFIG.drones.medium.hp).toBe(75);
    expect(CONFIG.drones.large.hp).toBe(90);
    expect(CONFIG.drones.small.hull).toEqual({ length: 85, beam: 25 });
    expect(CONFIG.drones.medium.hull).toEqual({ length: 100, beam: 30 });
    expect(CONFIG.drones.large.hull).toEqual({ length: 115, beam: 35 });
  });

  it('kinematics: maxSpeed 40/35/30 with reverse/accel/decel scaled proportionally; turnRate/steerageSpeed UNCHANGED', () => {
    expect(CONFIG.drones.small.kinematics).toEqual({
      maxSpeed: 40,
      reverseSpeed: 12,
      accel: 9.5,
      decel: 14.8,
      turnRate: 0.9,
      steerageSpeed: 12,
    });
    expect(CONFIG.drones.medium.kinematics).toEqual({
      maxSpeed: 35,
      reverseSpeed: 11,
      accel: 8.3,
      decel: 12.9,
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

  it('every drone entry has the ship-class envelope shape PLUS its own self-defence gun (amendment 33 — fit is gun-only)', () => {
    for (const size of DRONE_SIZE_IDS) {
      const d = CONFIG.drones[size];
      expect(Object.keys(d).sort()).toEqual(['gun', 'hp', 'hull', 'kinematics']);
      expect(Object.keys(d.kinematics).sort()).toEqual(
        Object.keys(CONFIG.shipClasses.torpedoBoat.kinematics).sort(),
      );
      expect(Object.keys(d.gun!).sort()).toEqual(['damage', 'reloadMs']);
    }
  });

  it('gun damage 6/8/10, flat 5s reload for every size (amendment 33)', () => {
    expect(CONFIG.drones.small.gun).toEqual({ damage: 6, reloadMs: 5000 });
    expect(CONFIG.drones.medium.gun).toEqual({ damage: 8, reloadMs: 5000 });
    expect(CONFIG.drones.large.gun).toEqual({ damage: 10, reloadMs: 5000 });
  });

  it('speed ruling: every drone size now sits AT OR BELOW every player class (discharges epics.md:1090)', () => {
    const fastestClass = Math.max(
      ...(['torpedoBoat', 'battleship', 'mineLayer'] as const).map(
        (id) => CONFIG.shipClasses[id].kinematics.maxSpeed,
      ),
    );
    for (const size of DRONE_SIZE_IDS) {
      expect(CONFIG.drones[size].kinematics.maxSpeed).toBeLessThanOrEqual(fastestClass);
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
