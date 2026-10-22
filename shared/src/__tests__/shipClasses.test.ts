// The class and drone envelope tables, as RELATIONS (the ratified class-table
// identity pin is deleted, Eric 2026-10-22, story 9.14 ruling R5), plus
// SHIP_CLASS_IDS / HULL_IDS, hullEnvelope and sanitizeClassId.

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
import {
  REGATTA_HUES,
  REGATTA_NO_HUE,
  droneHullOf,
  droneSizeOf,
  hullBumper,
  type DroneSizeId,
  type HullId,
} from '../constants.js';

describe('class ordering invariants', () => {
  const tb = CONFIG.shipClasses.torpedoBoat;
  const bb = CONFIG.shipClasses.battleship;
  const ml = CONFIG.shipClasses.mineLayer;

  it('torpedoBoat is the fastest and never tougher than another class (ties the mineLayer at 300 since amendment 209)', () => {
    expect(tb.kinematics.maxSpeed).toBeGreaterThan(ml.kinematics.maxSpeed);
    expect(tb.kinematics.maxSpeed).toBeGreaterThan(bb.kinematics.maxSpeed);
    expect(tb.hp).toBeLessThanOrEqual(ml.hp);
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

  it('agility is a size property: maxSpeed and turnRate both fall small → medium → large', () => {
    const [s, m, l] = DRONE_SIZE_IDS.map((size) => CONFIG.drones[size].kinematics);
    expect(s.maxSpeed).toBeGreaterThan(m.maxSpeed);
    expect(m.maxSpeed).toBeGreaterThan(l.maxSpeed);
    expect(s.turnRate).toBeGreaterThan(m.turnRate);
    expect(m.turnRate).toBeGreaterThan(l.turnRate);
  });

  it('every drone entry has the ship-class envelope shape PLUS its own self-defence gun (amendment 34 — fit is gun-only)', () => {
    for (const size of DRONE_SIZE_IDS) {
      const d = CONFIG.drones[size];
      expect(Object.keys(d).sort()).toEqual(['gun', 'hp', 'hull', 'kinematics']);
      expect(Object.keys(d.kinematics).sort()).toEqual(
        Object.keys(CONFIG.shipClasses.torpedoBoat.kinematics).sort(),
      );
      expect(Object.keys(d.gun!).sort()).toEqual(['damage', 'reloadMs']);
    }
  });

  it('drone gun damage is flat across sizes on the captain gun\'s reload, so the damage a drone deals back over its life equals its shots-to-kill', () => {
    // THE FLAT GUN IS A DERIVATION, NOT A FLATTENING (epic-6 amendment 24).
    // Eric specified the damage a hull deals back OVER ITS OWN LIFETIME as
    // 3/4/5. Because the drone reload equals the captain gun reload,
    // volleys-back == shots-to-kill == 3/4/5 — so damage 1 on every size
    // satisfies a per-size damage spec exactly, and a per-size damage table
    // would double-count the scaling hp already carries. Do not "restore" it.
    for (const size of DRONE_SIZE_IDS) {
      expect(CONFIG.drones[size].gun!.damage, size).toBe(CONFIG.drones.small.gun!.damage);
      expect(CONFIG.drones[size].gun!.reloadMs, size).toBe(CONFIG.gun.reloadMs);
    }
    // Shots-to-kill is a whole count of clicks (ceil) at whatever the cannon's
    // base is (16 -> 12, Eric 2026-10-13, experiment: 45/60/75 hp take 4/5/7
    // clicks). The derivation is what holds: with reloads equal and damage 1,
    // the damage a drone deals back over its life IS its shots-to-kill.
    const shotsToKill = (size: (typeof DRONE_SIZE_IDS)[number]) =>
      Math.ceil(CONFIG.drones[size].hp / CONFIG.gun.damage);
    const lifetimeDamage = (size: (typeof DRONE_SIZE_IDS)[number]) =>
      Math.floor((shotsToKill(size) * CONFIG.gun.reloadMs) / CONFIG.drones[size].gun!.reloadMs) *
      CONFIG.drones[size].gun!.damage;
    for (const size of DRONE_SIZE_IDS) expect(lifetimeDamage(size), size).toBe(shotsToKill(size));
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
