// The class and drone envelope tables, as RELATIONS (the ratified class-table
// identity pin is deleted, Eric 2026-10-22, story 9.14 ruling R5), plus
// SHIP_CLASS_IDS / HULL_IDS, hullEnvelope and sanitizeClassId.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  DRONE_HULL_IDS,
  DRONE_SIZE_IDS,
  HULL_IDS,
  INDEX_IDS,
  SHIP_CLASS_IDS,
  effectiveStats,
  hullEnvelope,
  sanitizeClassId,
} from '../index.js';
import {
  REGATTA_HUES,
  REGATTA_NO_HUE,
  droneHullOf,
  droneSizeOf,
  hullBumper,
  type DroneSizeId,
  type HullId,
} from '../constants.js';

describe('every hull envelope is finite and positive (a NaN or zero stat would fail closed into an unsailable hull)', () => {
  it('every class and every drone size: hp, hull dims, every kinematics field and every index are finite and > 0', () => {
    const envelopes = [
      ...SHIP_CLASS_IDS.map((id) => CONFIG.shipClasses[id]),
      ...DRONE_SIZE_IDS.map((size) => CONFIG.drones[size]),
    ];
    for (const e of envelopes) {
      const values = [e.hp, e.hull.length, e.hull.beam, ...Object.values(e.kinematics), ...Object.values(e.index)];
      expect(values.length).toBeGreaterThan(3);
      for (const v of values) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
    }
  });

  // THE INDEX MODEL (Story 10.3, Eric 2026-11-04, epic-10 amendment 7): every
  // envelope carries the seven indices and NO authored top speed or turn rate
  // — those are DERIVED in the fold from ENGINES and RUDDER.
  it('every envelope carries exactly the seven indices, each a whole number ≥ 1, and no maxSpeed / turnRate of its own', () => {
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

describe('class relations under the index scaffold (Story 10.3, Eric rulings 3 and 15)', () => {
  const tb = CONFIG.shipClasses.torpedoBoat;
  const bb = CONFIG.shipClasses.battleship;
  const ml = CONFIG.shipClasses.mineLayer;

  it('every class has the same hull (the 300 / 350 gap is DROPPED; toughness is ARMOR, never hp)', () => {
    for (const id of SHIP_CLASS_IDS) expect(CONFIG.shipClasses[id].hp, id).toBe(tb.hp);
  });

  it('ENGINES and RUDDER both order torpedoBoat > mineLayer > battleship', () => {
    expect(tb.index.engines).toBeGreaterThan(ml.index.engines);
    expect(ml.index.engines).toBeGreaterThan(bb.index.engines);
    expect(tb.index.rudder).toBeGreaterThan(ml.index.rudder);
    expect(ml.index.rudder).toBeGreaterThan(bb.index.rudder);
  });

  it('the battleship IS the 100 of the scaffold on every index but ENGINES (ruling 15 re-based its speed on 30 u/s)', () => {
    for (const k of INDEX_IDS) {
      if (k === 'engines') continue;
      expect(bb.index[k], k).toBe(CONFIG.index.base);
    }
  });

  it('hull geometry still reads the class: the torpedoBoat is the narrowest, the battleship the longest and widest', () => {
    expect(tb.hull.beam).toBeLessThan(ml.hull.beam);
    expect(tb.hull.beam).toBeLessThan(bb.hull.beam);
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

describe('drone envelope table (Story 5.6, amendment 34 — retuned off the retired destroyer/cruiser/battleship blocks)', () => {
  it('size reads on the water: hp and hull length and beam all climb small → medium → large', () => {
    const [s, m, l] = DRONE_SIZE_IDS.map((size) => CONFIG.drones[size]);
    expect(s.hp).toBeLessThan(m.hp);
    expect(m.hp).toBeLessThan(l.hp);
    expect(s.hull.length).toBeLessThan(m.hull.length);
    expect(m.hull.length).toBeLessThan(l.hull.length);
    expect(s.hull.beam).toBeLessThan(m.hull.beam);
    expect(m.hull.beam).toBeLessThan(l.hull.beam);
  });

  it('agility is a size property: ENGINES and RUDDER both fall small → medium → large (and so do the derived speed and turn rate)', () => {
    const [s, m, l] = DRONE_SIZE_IDS.map((size) => CONFIG.drones[size].index);
    expect(s.engines).toBeGreaterThan(m.engines);
    expect(m.engines).toBeGreaterThan(l.engines);
    expect(s.rudder).toBeGreaterThan(m.rudder);
    expect(m.rudder).toBeGreaterThan(l.rudder);
    const [ks, km, kl] = DRONE_SIZE_IDS.map((size) => effectiveStats(CONFIG.drones[size]).kinematics);
    expect(ks.maxSpeed).toBeGreaterThan(km.maxSpeed);
    expect(km.maxSpeed).toBeGreaterThan(kl.maxSpeed);
    expect(ks.turnRate).toBeGreaterThan(km.turnRate);
    expect(km.turnRate).toBeGreaterThan(kl.turnRate);
  });

  it('every drone entry has the ship-class envelope shape PLUS its own self-defence gun (amendment 34 — fit is gun-only)', () => {
    for (const size of DRONE_SIZE_IDS) {
      const d = CONFIG.drones[size];
      expect(Object.keys(d).sort()).toEqual(['gun', 'hp', 'hull', 'index', 'kinematics']);
      expect(Object.keys(d.kinematics).sort()).toEqual(
        Object.keys(CONFIG.shipClasses.torpedoBoat.kinematics).sort(),
      );
      expect(Object.keys(d.gun!).sort()).toEqual(['damage', 'reloadMs']);
    }
  });

  it('drone gun damage is flat across sizes on the captain gun\'s reload (size reads through hp, never a per-size damage table)', () => {
    // THE FLAT GUN IS A DERIVATION, NOT A FLATTENING (epic-6 amendment 24).
    // Eric specified the damage a hull deals back OVER ITS OWN LIFETIME as a
    // per-size count; because the drone reload equals the captain gun reload,
    // volleys-back == shots-to-kill, so ONE flat damage on every size
    // satisfies a per-size damage spec exactly, and a per-size damage table
    // would double-count the scaling hp already carries. Do not "restore" it.
    // Story 10.3 (Eric 2026-11-04, ruling 10) scaled hp AND the flat gun ×3
    // as a scaffold placeholder — the relation is untouched.
    for (const size of DRONE_SIZE_IDS) {
      expect(CONFIG.drones[size].gun!.damage, size).toBe(CONFIG.drones.small.gun!.damage);
      expect(CONFIG.drones[size].gun!.reloadMs, size).toBe(CONFIG.gun.reloadMs);
    }
  });

  it('a full GROUP volley is attrition, not a kill threat — the PROPERTY, not a literal', () => {
    // The number Eric was reacting to at 6/8/10: a whole fleet firing at once
    // was 68 damage per volley, 13.6 dps, and a 125hp Torpedo Boat died in 9.2
    // seconds. Amendment 45 cut that to 1/2/3; amendment 24 halved the group to
    // six hulls and flattened the gun, taking it further still.
    //
    // PINNED AS A PROPERTY rather than as 16/39: the group size and the damage
    // are both live CONFIG now, and a literal here would have to be re-solved
    // on every composition tweak — which is exactly the churn that lets a pin
    // get "fixed" to match a regression. What must never drift is the ROLE:
    // a captain caught by a whole group has minutes, not seconds.
    const volley =
      CONFIG.fleet.composition.small * CONFIG.drones.small.gun!.damage +
      CONFIG.fleet.composition.medium * CONFIG.drones.medium.gun!.damage +
      CONFIG.fleet.composition.large * CONFIG.drones.large.gun!.damage;
    const dps = volley / (CONFIG.drones.small.gun!.reloadMs / 1000);
    const lightestClass = CONFIG.shipClasses.torpedoBoat.hp;
    const secondsToKill = lightestClass / dps;
    expect(secondsToKill).toBeGreaterThan(60); // attrition: over a minute, not a burst
    // And a single hull must never be the threat on its own — that is what
    // "the fleet is the danger, not the shot" means (amendment 45).
    expect(CONFIG.drones.large.gun!.damage * 20).toBeLessThan(lightestClass);
  });

  it('speed ruling: every drone size now sits AT OR BELOW every player class (discharges epics.md:1090) — read through the fold', () => {
    const fastestClass = Math.max(
      ...SHIP_CLASS_IDS.map((id) => effectiveStats(CONFIG.shipClasses[id]).kinematics.maxSpeed),
    );
    for (const size of DRONE_SIZE_IDS) {
      expect(effectiveStats(CONFIG.drones[size]).kinematics.maxSpeed, size).toBeLessThanOrEqual(fastestClass);
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

describe('droneSizeOf / droneHullOf', () => {
  it('drone hulls and size keys round-trip; a ship class has no drone size', () => {
    for (const size of DRONE_SIZE_IDS) expect(droneSizeOf(droneHullOf(size))).toBe(size);
    for (const hull of DRONE_HULL_IDS) expect(droneHullOf(droneSizeOf(hull) as DroneSizeId)).toBe(hull);
    for (const cls of SHIP_CLASS_IDS) expect(droneSizeOf(cls)).toBeNull();
  });
});

describe('the Regatta hue wheel', () => {
  it('the hues are distinct and the no-hue sentinel is a uint8 that is never a wheel index', () => {
    expect(new Set(REGATTA_HUES).size).toBe(REGATTA_HUES.length);
    expect(REGATTA_NO_HUE).toBeGreaterThanOrEqual(REGATTA_HUES.length);
    expect(REGATTA_NO_HUE).toBeLessThanOrEqual(255);
    expect(Number.isInteger(REGATTA_NO_HUE)).toBe(true);
  });
});
