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
  DEFAULT_CLASS_ID,
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

  // THE INDEX MODEL (Story 10.3, Eric 2026-11-04, epic-10 amendment 8): every
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

describe('the four battleships (Story 10.4)', () => {
  // The R1 index table and the R5 dims are Eric's numbers; an ordering between
  // two of them is a coincidence, not a rule, so none is pinned here. What IS
  // structural: one hp for every hull, and a battery on every captain hull
  // and on no drone (sim/turrets.ts and the fold key on that).
  it('every class has the same hull points (toughness is ARMOR, never hp)', () => {
    const hp = CONFIG.shipClasses[SHIP_CLASS_IDS[0]].hp;
    for (const id of SHIP_CLASS_IDS) expect(CONFIG.shipClasses[id].hp, id).toBe(hp);
  });

  it('every class carries a battery of at least one turret; no drone carries one', () => {
    for (const id of SHIP_CLASS_IDS) {
      const { battery } = CONFIG.shipClasses[id];
      expect(battery.turrets.length, id).toBeGreaterThan(0);
      expect(battery.shellDamage, id).toBeGreaterThan(0);
      expect(battery.trainDeg, id).toBeGreaterThan(0);
      expect(battery.trainDeg, id).toBeLessThan(180);
    }
    for (const id of DRONE_HULL_IDS) expect(hullEnvelope(id).battery, id).toBeUndefined();
  });

  it('no class envelope carries a Shift any more (the Shift is the seat\'s pick)', () => {
    for (const id of SHIP_CLASS_IDS) expect('shift' in CONFIG.shipClasses[id], id).toBe(false);
  });
});

describe('SHIP_CLASS_IDS / HULL_IDS', () => {
  it('SHIP_CLASS_IDS is exactly the CONFIG.shipClasses keys, in CONFIG order', () => {
    expect([...SHIP_CLASS_IDS]).toEqual(Object.keys(CONFIG.shipClasses));
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
        Object.keys(CONFIG.shipClasses.iowa.kinematics).sort(),
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
    const lightestClass = CONFIG.shipClasses.iowa.hp;
    const secondsToKill = lightestClass / dps;
    expect(secondsToKill).toBeGreaterThan(60); // attrition: over a minute, not a burst
    // And a single hull must never be the threat on its own — that is what
    // "the fleet is the danger, not the shot" means (amendment 45).
    expect(CONFIG.drones.large.gun!.damage * 20).toBeLessThan(lightestClass);
  });

  // THE "every drone sits at or below every player class" SPEED RELATION IS
  // RETIRED (Story 10.4): the drones are unchanged by ruling (10.8 retires
  // them) while the four battleships are slower than the scaffold classes, so
  // the small and medium drones now outrun most hulls. Recorded, not pinned.
});

describe('sanitizeClassId', () => {
  it('passes through each valid id', () => {
    for (const id of SHIP_CLASS_IDS) expect(sanitizeClassId(id)).toBe(id);
  });

  it('fails open to the default hull (R7) for every retired, drone, garbage or non-string input', () => {
    const bad: unknown[] = [
      'torpedoBoat', 'battleship', 'mineLayer', 'destroyer', 'cruiser', // retired ids
      ...DRONE_HULL_IDS, // never pickable
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

describe('droneSizeOf / droneHullOf', () => {
  it('drone hulls and size keys round-trip; a ship class has no drone size', () => {
    for (const size of DRONE_SIZE_IDS) expect(droneSizeOf(droneHullOf(size))).toBe(size);
    for (const hull of DRONE_HULL_IDS) expect(droneHullOf(droneSizeOf(hull) as DroneSizeId)).toBe(hull);
    for (const cls of SHIP_CLASS_IDS) expect(droneSizeOf(cls)).toBeNull();
  });
});
