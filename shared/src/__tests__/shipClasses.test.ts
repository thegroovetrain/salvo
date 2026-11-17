// The class envelope table, as RELATIONS (the ratified class-table identity
// pin is deleted, Eric 2026-10-22, story 9.14 ruling R5), plus
// SHIP_CLASS_IDS / HULL_IDS, hullEnvelope and sanitizeClassId. (The drone
// envelope table retired with the PvE fleet, Story 10.8, 2026-11-06.)

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  HULL_IDS,
  INDEX_IDS,
  SHIP_CLASS_IDS,
  hullEnvelope,
  sanitizeClassId,
} from '../index.js';
import { DEFAULT_CLASS_ID, hullBumper, type HullId } from '../constants.js';

describe('every hull envelope is finite and positive (a NaN or zero stat would fail closed into an unsailable hull)', () => {
  it('every class: hp, hull dims, every kinematics field and every index are finite and > 0', () => {
    const envelopes = SHIP_CLASS_IDS.map((id) => CONFIG.shipClasses[id]);
    for (const e of envelopes) {
      const values = [e.hp, e.hull.length, e.hull.beam, ...Object.values(e.kinematics), ...Object.values(e.index)];
      expect(values.length).toBeGreaterThan(3);
      for (const v of values) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
    }
  });

  // THE INDEX MODEL (Story 10.3, Eric 2026-11-04, epic-10 amendment 8): every
  // envelope carries the indices and NO authored top speed — it is DERIVED in
  // the fold from ENGINES. RUDDER is DELETED (Story 10.6, R2): a hull authors
  // no turn rate (it turns at CONFIG.index.turnRate).
  it('every envelope carries exactly the indices, each a whole number ≥ 1, and no maxSpeed or turn rate of its own', () => {
    for (const id of HULL_IDS) {
      const e = hullEnvelope(id);
      expect(Object.keys(e.index).sort(), id).toEqual([...INDEX_IDS].sort());
      for (const k of INDEX_IDS) {
        expect(Number.isInteger(e.index[k]), `${id} ${k}`).toBe(true);
        expect(e.index[k], `${id} ${k}`).toBeGreaterThanOrEqual(1);
      }
      expect('maxSpeed' in e.kinematics, id).toBe(false);
      expect('turnRate' in e.kinematics, id).toBe(false);
    }
  });
});

describe('the four battleships (Story 10.4)', () => {
  // The R1 index table and the R5 dims are Eric's numbers; an ordering between
  // two of them is a coincidence, not a rule, so none is pinned here. What IS
  // structural: one hp for every hull, and a battery on every hull
  // (sim/turrets.ts and the fold key on that).
  it('every class has the same hull points (toughness is ARMOR, never hp)', () => {
    const hp = CONFIG.shipClasses[SHIP_CLASS_IDS[0]].hp;
    for (const id of SHIP_CLASS_IDS) expect(CONFIG.shipClasses[id].hp, id).toBe(hp);
  });

  it('every class carries a battery of at least one turret', () => {
    for (const id of SHIP_CLASS_IDS) {
      const { battery } = CONFIG.shipClasses[id];
      expect(battery.turrets.length, id).toBeGreaterThan(0);
      expect(battery.shellDamage, id).toBeGreaterThan(0);
      expect(battery.trainDeg, id).toBeGreaterThan(0);
      expect(battery.trainDeg, id).toBeLessThan(180);
      // Story 11.2 (R2): the hull's reach ratio is a positive finite fact.
      expect(Number.isFinite(battery.reachFrac) && battery.reachFrac > 0, id).toBe(true);
    }
  });

  it('no class envelope carries a Shift any more (the Shift is the seat\'s pick)', () => {
    for (const id of SHIP_CLASS_IDS) expect('shift' in CONFIG.shipClasses[id], id).toBe(false);
  });
});

describe('SHIP_CLASS_IDS / HULL_IDS', () => {
  it('SHIP_CLASS_IDS is exactly the CONFIG.shipClasses keys, in CONFIG order', () => {
    expect([...SHIP_CLASS_IDS]).toEqual(Object.keys(CONFIG.shipClasses));
  });

  it('HULL_IDS is the class ids (the drone hull ids retired, Story 10.8)', () => {
    expect([...HULL_IDS]).toEqual([...SHIP_CLASS_IDS]);
  });

  it('hullEnvelope resolves every hull id from shipClasses', () => {
    for (const id of SHIP_CLASS_IDS) expect(hullEnvelope(id)).toBe(CONFIG.shipClasses[id]);
  });
});

describe('sanitizeClassId', () => {
  it('passes through each valid id', () => {
    for (const id of SHIP_CLASS_IDS) expect(sanitizeClassId(id)).toBe(id);
  });

  it('fails open to the default hull (R7) for every retired, drone, garbage or non-string input', () => {
    const bad: unknown[] = [
      'torpedoBoat', 'battleship', 'mineLayer', 'destroyer', 'cruiser', // retired ids
      'droneSmall', 'droneMedium', 'droneLarge', // the retired PvE drone hull ids (Story 10.8)
      'carrier', '', DEFAULT_CLASS_ID.toUpperCase(), // case-sensitive
      undefined, null, 3, { cls: DEFAULT_CLASS_ID },
    ];
    for (const raw of bad) expect(sanitizeClassId(raw), String(raw)).toBe(DEFAULT_CLASS_ID);
    expect(SHIP_CLASS_IDS).toContain(DEFAULT_CLASS_ID);
  });
});

describe('hullBumper — the contact clearance between two hulls', () => {
  it('is symmetric, and a null other reads as the own hull', () => {
    for (const a of HULL_IDS) {
      expect(hullBumper(a, null)).toBe(hullBumper(a, a));
      for (const b of HULL_IDS) expect(hullBumper(a, b)).toBe(hullBumper(b, a));
    }
  });

  it('exceeds the two half-lengths by the same margin for every pair', () => {
    const margin = (a: HullId, b: HullId): number =>
      hullBumper(a, b) - (hullEnvelope(a).hull.length + hullEnvelope(b).hull.length) / 2;
    const m0 = margin(HULL_IDS[0], HULL_IDS[0]);
    for (const a of HULL_IDS) for (const b of HULL_IDS) expect(margin(a, b)).toBeCloseTo(m0, 9);
  });
});
