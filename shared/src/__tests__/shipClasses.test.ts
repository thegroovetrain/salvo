// Pins the ratified beta class table and the drone/fleet envelope table. The
// HULL HP DOUBLED in balance cycle 1 (Eric ruling 2026-08-20): TB 125→250,
// BS 175→350, ML 150→300, alongside CONFIG.damageControl 25→50 (flat amounts
// that would otherwise be silently repriced) and the client's toughness pip
// ladder 100/25→200/50 (which preserves the 2/3/4 readout). The doubling is
// PROPORTIONAL by design — a flat +100 was measured first and rejected because
// it hands the thinnest hull the largest relative gain, favouring the class
// that was already winning. Kinematics are UNCHANGED and still byte-pinned.
//
// class maxSpeeds are the Eric knot-realistic rescale (2026-07-21, Story 1.6):
// TB 45 / ML 40 / BS 35 — a DELIBERATE pin update from the 50/38/28 of Story
// 1.3. Class hp moved onto the objective toughness ladder (Eric ruling
// 2026-08-03, TTK & Objective Pip Rebalance): 1 pip = 100 HP, +25 HP/pip — TB
// 70→125 (2 pips), ML 105→150 (3 pips), BS 150→175 (4 pips). Every other
// class field (reverseSpeed/accel/decel/turnRate/steerageSpeed, hull dims) is
// UNCHANGED and byte-for-byte pinned.
//
// The drone table is DELIBERATELY RE-PINNED (Story 5.6, Eric rulings
// 2026-08-14, epic-5 amendment 34): hp 80/100/120 → 60/75/90, and maxSpeed
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
  it('torpedoBoat: 100×9, hp 250, fast and fragile', () => {
    expect(CONFIG.shipClasses.torpedoBoat).toEqual({
      hull: { length: 100, beam: 9 },
      hp: 250,
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

  it('battleship: 124×32, hp 350, slow and armored', () => {
    expect(CONFIG.shipClasses.battleship).toEqual({
      hull: { length: 124, beam: 32 },
      hp: 350,
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

  it('mineLayer: 88×20, hp 300, the middle envelope', () => {
    expect(CONFIG.shipClasses.mineLayer).toEqual({
      hull: { length: 88, beam: 20 },
      hp: 300,
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

describe('drone envelope table (Story 5.6, amendment 34 — retuned off the retired destroyer/cruiser/battleship blocks)', () => {
  it('hp 45/60/75, chevron dims 85×25 / 100×30 / 115×35 (hull dims unchanged)', () => {
    // RETUNED 60/75/90 -> 45/60/75 (Eric ruling 2026-08-16, epic-6 amendment
    // 24). The ladder is now exactly 3/4/5 hits from the base 15-damage gun,
    // which at its 5s reload is the ruled 15/20/25s time-to-kill. HULL DIMS DO
    // NOT MOVE: size still reads on the water at 85/100/115u.
    expect(CONFIG.drones.small.hp).toBe(45);
    expect(CONFIG.drones.medium.hp).toBe(60);
    expect(CONFIG.drones.large.hp).toBe(75);
    for (const [size, shots] of [['small', 3], ['medium', 4], ['large', 5]] as const) {
      expect(CONFIG.drones[size].hp / CONFIG.gun.damage).toBe(shots);
      expect((shots * CONFIG.gun.reloadMs) / 1000).toBe(shots * 5); // 15 / 20 / 25s
    }
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

  it('gun damage is a FLAT 1 on every size, flat 5s reload (6/8/10 -> 1/2/3 -> 1/1/1)', () => {
    // THE FLAT GUN IS A DERIVATION, NOT A FLATTENING (epic-6 amendment 24).
    // Eric specified the damage a hull deals back OVER ITS OWN LIFETIME as
    // 3/4/5. Because the drone reload equals the captain gun reload,
    // volleys-back == shots-to-kill == 3/4/5 — so damage 1 on every size
    // satisfies a per-size damage spec exactly, and a per-size damage table
    // would double-count the scaling hp already carries. Do not "restore" it.
    for (const size of DRONE_SIZE_IDS) {
      expect(CONFIG.drones[size].gun).toEqual({ damage: 1, reloadMs: 5000 });
    }
    const lifetimeDamage = (size: (typeof DRONE_SIZE_IDS)[number]) =>
      Math.floor(
        ((CONFIG.drones[size].hp / CONFIG.gun.damage) * CONFIG.gun.reloadMs) /
          CONFIG.drones[size].gun!.reloadMs,
      ) * CONFIG.drones[size].gun!.damage;
    expect(lifetimeDamage('small')).toBe(3);
    expect(lifetimeDamage('medium')).toBe(4);
    expect(lifetimeDamage('large')).toBe(5);
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
