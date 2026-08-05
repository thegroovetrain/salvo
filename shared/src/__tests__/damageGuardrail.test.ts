// Balance guardrails (HULLCRACKER_NOTES "PROBLEMS SO FAR"): no single hit may
// ever kill an undamaged hull — now extended to MAX-STACKED catalog ladders
// (Story 2.8: every damage ladder, fully stacked to its copy cap, stays under
// the lightest hull on the water) — and a torpedo must always outrun every
// hull. The TTK & Objective Pip Rebalance (Eric ruling 2026-08-03) moved class
// hp onto the toughness ladder (TB 70→125, ML 105→150, BS 150→175), which
// FLIPS the lightest-hull identity: the 80hp small drone is now the floor,
// not the torpedoBoat (drones stay 80/100/120, unchanged). The star-shell
// damage pins FLIPPED deliberately (amendment 39: the flare is damageless —
// the CONFIG field is DELETED, not zeroed). Pure CONFIG/catalog pins — they
// fail the moment a retune or a catalog step drifts across a line.

import { describe, it, expect } from 'vitest';
import {
  BOON_CATALOG,
  CONFIG,
  DRONE_SIZE_IDS,
  SHIP_CLASS_IDS,
  effectiveStats,
  resolveBoons,
} from '../index.js';

const classHps = SHIP_CLASS_IDS.map((c) => CONFIG.shipClasses[c].hp);
const droneHps = DRONE_SIZE_IDS.map((d) => CONFIG.drones[d].hp);
const minHullHp = Math.min(...classHps, ...droneHps);

const classSpeeds = SHIP_CLASS_IDS.map((c) => CONFIG.shipClasses[c].kinematics.maxSpeed);
const droneSpeeds = DRONE_SIZE_IDS.map((d) => CONFIG.drones[d].kinematics.maxSpeed);
const maxHullSpeed = Math.max(...classSpeeds, ...droneSpeeds);

/** Stats under N copies of one catalog line (the max-stack computation). */
const stacked = (id: string, n = BOON_CATALOG[id].copies) =>
  effectiveStats(CONFIG.shipClasses.torpedoBoat, resolveBoons(new Array<string>(n).fill(id)));

describe('one-hit-kill guardrail — CONFIG bases (classes AND drones)', () => {
  it('gun burst / contact damage cannot one-hit the lightest hull; bodyblock is the lighter outcome', () => {
    expect(CONFIG.gun.damage).toBeLessThan(minHullHp);
    expect(CONFIG.gun.contactDamage).toBeLessThan(minHullHp);
    expect(CONFIG.gun.contactDamage).toBeLessThanOrEqual(CONFIG.gun.damage);
  });

  it('torpedo and mine damage cannot one-hit the lightest hull', () => {
    expect(CONFIG.torpedo.damage).toBeLessThan(minHullHp);
    expect(CONFIG.mine.damage).toBeLessThan(minHullHp);
  });

  it('cannon burst / contact damage cannot one-hit the lightest hull; bodyblock lighter', () => {
    expect(CONFIG.cannon.damage).toBeLessThan(minHullHp);
    expect(CONFIG.cannon.contactDamage).toBeLessThan(minHullHp);
    expect(CONFIG.cannon.contactDamage).toBeLessThanOrEqual(CONFIG.cannon.damage);
  });

  it('the lightest CLASS hull is the 125hp torpedoBoat; every drone is now LIGHTER than every class hull', () => {
    // Objective toughness ladder (Eric ruling 2026-08-03) moved class hp onto
    // 100 + 25/pip: TB 125 (2 pips) is the lightest CLASS hull, below ML 150
    // (3 pips) and BS 175 (4 pips).
    expect(Math.min(...classHps)).toBe(125);
    expect(Math.min(...classHps)).toBe(CONFIG.shipClasses.torpedoBoat.hp);
    // Drones (80/100/120, byte-for-byte unchanged) are now ALL lighter than
    // every pickable class hull — the small drone becomes the lightest hull
    // on the water, a deliberate consequence of the ladder move, not a drone
    // retune.
    for (const droneHp of droneHps) {
      for (const classHp of classHps) {
        expect(droneHp).toBeLessThan(classHp);
      }
    }
    expect(minHullHp).toBe(80);
    expect(minHullHp).toBe(CONFIG.drones.small.hp);
  });
});

describe('one-hit-kill guardrail — the small drone (80hp) is the new floor (Eric ruling 2026-08-03)', () => {
  it('no single weapon, even fully max-stacked, one-shots the 80hp small drone — the lightest hull afloat', () => {
    // The objective toughness ladder made the small drone the lightest hull on
    // the water (it was 70hp-TB-relative before). Re-pin the max-stacked
    // ladder endpoints directly against CONFIG.drones.small.hp so this
    // guardrail can never quietly regress if the generic minHullHp derivation
    // changes shape.
    expect(stacked('gunDamage').gun.damage).toBeLessThan(CONFIG.drones.small.hp); // 30 < 80
    expect(stacked('cannonDamage').cannon.damage).toBeLessThan(CONFIG.drones.small.hp); // 75 < 80
    expect(stacked('torpedoDamage').torpedo.damage).toBeLessThan(CONFIG.drones.small.hp); // 75 < 80
    expect(stacked('mineDamage').mine.damage).toBeLessThan(CONFIG.drones.small.hp); // 75 < 80
  });
});

describe('one-hit-kill guardrail — MAX-STACKED catalog ladders (Story 2.8)', () => {
  it('every damage ladder, stacked to its copy cap, stays UNDER the 80hp lightest hull', () => {
    // Computed FROM the catalog defs, so a step retune re-checks automatically.
    expect(stacked('gunDamage').gun.damage).toBeLessThan(minHullHp);
    expect(stacked('cannonDamage').cannon.damage).toBeLessThan(minHullHp);
    expect(stacked('torpedoDamage').torpedo.damage).toBeLessThan(minHullHp);
    expect(stacked('mineDamage').mine.damage).toBeLessThan(minHullHp);
  });

  it('the drafted ladder endpoints land where the spec ruled them', () => {
    // Endpoints after the 2026-08-04 weapon balance pass. Torpedo and cannon
    // each got a heavier base AND a SHRUNK step (+2→+1, +3→+2) precisely so the
    // ladders top at 75 rather than the exactly-80 one-shot the untouched steps
    // would have produced. Do not "restore" the old steps.
    expect(stacked('gunDamage').gun.damage).toBe(30); // 15 +3/card ×5
    expect(stacked('cannonDamage').cannon.damage).toBe(75); // 65 +2/card ×5
    expect(stacked('torpedoDamage').torpedo.damage).toBe(75); // 70 +1/card ×5
    expect(stacked('mineDamage').mine.damage).toBe(75); // 55 +4/card ×5
  });

  it('THE LAW IS PER SHELL: a max-stacked multi-barrel CLICK may legitimately exceed the floor', () => {
    // Eric ruling 2026-08-05: "every shell that connects deals full damage; the
    // one-hit-kill law governs a single SHELL, not a single click." The Story
    // 2.8 review's same-click salvo rule (one application per click) is DELETED
    // — it was an orchestrator invention, mandatory only under the pre-rebalance
    // numbers (gun 25 vs a 70hp floor, where even a BASE 3 × 25 = 75 breached).
    //
    // What CI still enforces is the per-shell law, above and here: no single
    // shell of any weapon, max-stacked, reaches the lightest hull.
    const barrels = stacked('gunBarrel').gun.barrels;
    const perShell = stacked('gunDamage').gun.damage;
    expect(barrels).toBe(3); // TWIN + TRIPLE MOUNT, both copies
    expect(perShell).toBeLessThan(minHullHp); // the law, per SHELL — the thing that holds
    // And this is the consequence Eric was shown and ACCEPTED: a fully
    // max-stacked triple mount whose three overlapping bursts all connect deals
    // 90 and one-clicks an undamaged 80hp small drone. That is not a breach —
    // it is three hits. No player hull falls to the SHELLS ALONE: the lightest
    // is the 125hp Torpedo Boat, which takes 72%. Rejected alternatives (do not
    // re-propose): falloff on later same-click hits, an aggregate cap below the
    // floor, shrinking the HEAVY SHELLS step.
    //
    // SCOPE, precisely: this bounds the click's GUN SHELLS and nothing else. A
    // burst also detonates the shooter's own armed mines inside burstRadius
    // (detonateMinesInBurst, Story 1.8 + the 2.8 same-owner cascade), so a
    // click walked over your own field can obviously exceed any hull's hp. That
    // is the minefield paying out, not the gun, and it is deliberately outside
    // this pin.
    expect(perShell * barrels).toBeGreaterThan(minHullHp);
    expect(perShell * barrels).toBeLessThan(Math.min(...classHps));
  });

  it('AP falloff can only DECREASE a hit: even the 100% first pierce obeys the max-stacked pin', () => {
    // The AP doctrine deals 100/50/25% of cannon damage — the first hit equals
    // the burst number already pinned above; later hits are strictly smaller.
    expect(stacked('cannonDamage').cannon.damage).toBeLessThan(minHullHp);
  });
});

describe('star shells are DAMAGELESS (amendment 39 — flipped pin)', () => {
  it('the CONFIG damage field is DELETED, not zeroed (structurally unarmable)', () => {
    expect('damage' in CONFIG.starShells).toBe(false);
  });

  it('the incendiary doctrine DoT is the only star-shell damage, and it cannot one-tick a hull', () => {
    expect(CONFIG.starShells.incendiaryDps).toBeGreaterThan(0);
    expect(CONFIG.starShells.incendiaryDps).toBeLessThan(minHullHp);
  });
});

describe('mine blast geometry guardrail', () => {
  it('blastRadius is strictly larger than triggerRadius at base (blast reaches past detection)', () => {
    expect(CONFIG.mine.blastRadius).toBeGreaterThan(CONFIG.mine.triggerRadius);
  });

  it('mine damage keeps the 55 reference base value', () => {
    // 45 → 55 (Eric ruling 2026-08-04, the weapon balance pass).
    expect(CONFIG.mine.damage).toBe(55);
  });

  it('max-stacked trigger can never outgrow the blast (the effectiveStats clamp holds)', () => {
    const s = stacked('mineTrigger');
    expect(s.mine.triggerRadius).toBeLessThanOrEqual(s.mine.blastRadius);
  });
});

describe('star-shell tell guardrail', () => {
  it('base litRadius stays inside base radar range (a lit ship always has the circle on radar)', () => {
    expect(CONFIG.starShells.litRadius).toBeLessThan(CONFIG.vision.radar);
  });

  it('even a max-stacked WIDE BURST zone stays inside BASE radar range', () => {
    expect(stacked('starRadius').starShells.litRadius).toBeLessThan(CONFIG.vision.radar);
  });
});

describe('torpedo chase/dodge guardrail (classes AND drones)', () => {
  it('a base torpedo outruns the fastest hull', () => {
    expect(CONFIG.torpedo.speed).toBeGreaterThan(maxHullSpeed);
  });

  it('a base torpedo outruns every ship class and every drone individually', () => {
    for (const speed of [...classSpeeds, ...droneSpeeds]) {
      expect(CONFIG.torpedo.speed).toBeGreaterThan(speed);
    }
  });

  it('a base torpedo outruns a base-BOOSTED Torpedo Boat (45 + 10 = 55 < 60)', () => {
    expect(CONFIG.torpedo.speed).toBeGreaterThan(
      CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed + CONFIG.speedBoost.speedBonus,
    );
  });

  it('the MAX-STACKED torpedo (80) outruns even a max-stacked, max-boosted hull (Story 2.8)', () => {
    const torpMax = stacked('torpedoSpeed').torpedo.speed;
    expect(torpMax).toBe(80); // the ratified 60 → 80 ladder
    // The fastest achievable hull: TB with full shipSpeed stacks + full
    // boostMax stacks, boost active — computed from the catalog defs.
    const build = resolveBoons([
      ...new Array<string>(BOON_CATALOG.shipSpeed.copies).fill('shipSpeed'),
      ...new Array<string>(BOON_CATALOG.boostMax.copies).fill('boostMax'),
    ]);
    const s = effectiveStats(CONFIG.shipClasses.torpedoBoat, build);
    const maxAchievableHull = s.kinematics.maxSpeed + s.boost.speedBonus;
    expect(maxAchievableHull).toBeLessThan(torpMax);
    // Drones never stack; the fastest drone stays below even the base fish.
    expect(Math.max(...droneSpeeds)).toBeLessThan(CONFIG.torpedo.speed);
  });
});
