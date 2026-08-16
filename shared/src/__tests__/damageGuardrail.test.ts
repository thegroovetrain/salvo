// Balance guardrails (HULLCRACKER_NOTES "PROBLEMS SO FAR"): no single hit may
// ever kill an undamaged PLAYER-PILOTED hull — extended to MAX-STACKED
// catalog ladders (Story 2.8: every damage ladder, fully stacked to its copy
// cap, stays under the lightest CLASS hull on the water) — and a torpedo must
// always outrun every hull, drones included. The TTK & Objective Pip
// Rebalance (Eric ruling 2026-08-03) moved class hp onto the toughness ladder
// (TB 70→125, ML 105→150, BS 150→175).
//
// THE GUARDRAIL'S SCOPE NARROWS TO CLASS HULLS (Story 5.6, Eric rulings
// 2026-08-14, amendments 33/34/38). Drones dropped 80/100/120 → 60/75/90 and
// are no longer symmetric combatants a fill could hand a human — they are
// roving PvE fleet content, explicitly designed as farmable fodder (amendment
// 33: clearing one whole fleet solo is "43 gun hits... for 3 levels," and a
// max-stacked triple-mount click one-shotting a small drone was ALREADY an
// accepted consequence below, pre-dating this story). At 60hp a base cannon
// (65) or base torpedo (70) now one-shots a small drone even unboosted — a
// direct, foreseeable consequence of the hp cut that this guardrail would
// otherwise block. Re-scoping it to CLASS hulls only (the actual "undamaged
// PLAYER hull" the HULLCRACKER_NOTES problem was about) is the deliberate
// fix; drone hp/damage values are still pinned below, just no longer wired
// into the no-one-shot law. The star-shell damage pins FLIPPED deliberately
// (amendment 39: the flare is damageless — the CONFIG field is DELETED, not
// zeroed). Pure CONFIG/catalog pins — they fail the moment a retune or a
// catalog step drifts across a line.

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
// The one-hit-kill LAW protects player-piloted CLASS hulls only (Story 5.6 —
// see the file header). Drone hp is tracked separately below, deliberately
// NOT folded into this floor.
const minHullHp = Math.min(...classHps);
const minDroneHp = Math.min(...droneHps);

const classSpeeds = SHIP_CLASS_IDS.map((c) => CONFIG.shipClasses[c].kinematics.maxSpeed);
const droneSpeeds = DRONE_SIZE_IDS.map((d) => CONFIG.drones[d].kinematics.maxSpeed);
const maxHullSpeed = Math.max(...classSpeeds, ...droneSpeeds);

/** Stats under N copies of one catalog line (the max-stack computation). */
const stacked = (id: string, n = BOON_CATALOG[id].copies) =>
  effectiveStats(CONFIG.shipClasses.torpedoBoat, resolveBoons(new Array<string>(n).fill(id)));

describe('one-hit-kill guardrail — CONFIG bases (player-piloted CLASSES only, Story 5.6)', () => {
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

  it('the lightest CLASS hull is the 125hp torpedoBoat; drones sit BELOW it and are no longer floor-eligible', () => {
    // Objective toughness ladder (Eric ruling 2026-08-03) moved class hp onto
    // 100 + 25/pip: TB 125 (2 pips) is the lightest CLASS hull, below ML 150
    // (3 pips) and BS 175 (4 pips).
    expect(Math.min(...classHps)).toBe(125);
    expect(Math.min(...classHps)).toBe(CONFIG.shipClasses.torpedoBoat.hp);
    // Drones (45/60/75 — epic-6 amendment 24; 80/100/120 -> 60/75/90 -> here)
    // are ALL lighter than every pickable class hull. That does NOT make the
    // small drone "the lightest hull on the water" for GUARDRAIL purposes —
    // fleet hulls are PvE fodder (amendment 33) and are deliberately NOT
    // protected by the one-hit-kill law. minHullHp is therefore the CLASS
    // floor (125), not the drone floor (45).
    for (const droneHp of droneHps) {
      for (const classHp of classHps) {
        expect(droneHp).toBeLessThan(classHp);
      }
    }
    expect(minHullHp).toBe(125);
    expect(minDroneHp).toBe(45);
    expect(minDroneHp).toBe(CONFIG.drones.small.hp);
  });
});

describe('the small drone (45hp) TRADES the one-hit-kill floor for the farming economy (Story 5.6, amendment 34; epic-6 amendment 24)', () => {
  it('the GUN — the fleet-clearing weapon — still cannot one-shot even the smallest drone', () => {
    // This is the one that must hold: the gun is the weapon the TTK ladder is
    // written against (3/4/5 shots = 15/20/25s), so a one-shot here would
    // collapse the whole envelope rather than reward a build.
    expect(CONFIG.gun.damage).toBeLessThan(CONFIG.drones.small.hp); // 15 < 45
  });

  it('EVERY heavier player weapon one-shots a small drone at BASE — INTENDED, and the Mine Layer case is the point', () => {
    // Eric ruling 2026-08-16: *"if you wanna spend mines to clear drones, do
    // it. My players actually found that the minelayer is a fleet-killing
    // machine, and it being able to aggro and mine pve ships can secure it an
    // XP bonus to rely on in fights."*
    //
    // At 60hp the base mine (55) fell just short and only a STACKED mine
    // cleared the bar. At 45 it clears at base, so the Mine Layer's fleet-
    // farming play works out of the box instead of needing a card first. That
    // is a RATIFIED buff, not an accepted cost — do not "restore" the gap.
    //
    // Note this does NOT touch amendment 36 clause 3: a mine hit still does
    // not aggro its victim. The Mine Layer pulls aggro with its GUN and leads
    // hulls over the field, which is that rule working as designed.
    expect(CONFIG.cannon.damage).toBeGreaterThanOrEqual(CONFIG.drones.small.hp); // 65 >= 45
    expect(CONFIG.torpedo.damage).toBeGreaterThanOrEqual(CONFIG.drones.small.hp); // 70 >= 45
    expect(CONFIG.mine.damage).toBeGreaterThanOrEqual(CONFIG.drones.small.hp); // 55 >= 45 — the ruling
    expect(stacked('mineDamage').mine.damage).toBeGreaterThanOrEqual(CONFIG.drones.small.hp); // 75 >= 45
  });
});

describe('one-hit-kill guardrail — MAX-STACKED catalog ladders (Story 2.8; player-classes-only scope per Story 5.6)', () => {
  it('every damage ladder, stacked to its copy cap, stays UNDER the 125hp lightest CLASS hull', () => {
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
    // 90 and one-clicks an undamaged 60hp small drone (was 80hp pre-Story-5.6;
    // now ALSO breached at BASE by cannon/torpedo — see the dedicated small-
    // drone describe above). That is not a breach — it is three hits. No
    // player hull falls to the SHELLS ALONE: the lightest is the 125hp Torpedo
    // Boat, which takes 72%. Rejected alternatives (do not re-propose):
    // falloff on later same-click hits, an aggregate cap below the floor,
    // shrinking the HEAVY SHELLS step.
    //
    // SCOPE, precisely: this bounds the click's GUN SHELLS and nothing else. A
    // burst also detonates the shooter's own armed mines inside burstRadius
    // (detonateMinesInBurst, Story 1.8 + the 2.8 same-owner cascade), so a
    // click walked over your own field can obviously exceed any hull's hp. That
    // is the minefield paying out, not the gun, and it is deliberately outside
    // this pin.
    expect(perShell * barrels).toBeGreaterThan(minDroneHp);
    expect(perShell * barrels).toBeLessThan(minHullHp); // minHullHp === Math.min(...classHps)
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

// --- The PvE exchange rate (epic-5 amendment 45) ------------------------------
//
// THE GUARDRAIL AMENDMENT 33 FAILED TO APPLY, and the one that actually caught
// the 6/8/10 fleet gun. A PvE kill is only a faucet if the XP it pays exceeds
// what the damage taken COSTS TO UNDO — and undoing damage has a hard price in
// the same currency: `damageControl` restores instantHp + regenHp (50) for one
// banked level. So the honest test of a PvE damage profile is an EXCHANGE RATE,
// never a dps or a time-to-kill.
//
// Eric's derivation, 2026-08-14: an unupgraded gun (15) needs 4 shots to sink a
// 60hp small hull; on a 5s reload that is 20 seconds, in which the drone fires
// back 4 times. At 6 damage that is 24 hp taken for a quarter-level earned —
// and 24 hp costs about half a level to repair. Every size was NET NEGATIVE:
// farming correctly and winning left a captain BEHIND one who ignored the
// fleet entirely, which is a broken faucet rather than a hard fight.
describe('the PvE farm must PAY — damage taken costs less to repair than the kill earns', () => {
  const HEAL_HP = CONFIG.damageControl.instantHp + CONFIG.damageControl.regenHp; // 50 per level
  const TIERS = [
    ['small', 'droneSmall'],
    ['medium', 'droneMedium'],
    ['large', 'droneLarge'],
  ] as const;

  it('a solo duel with each fleet size is XP-POSITIVE after repair costs', () => {
    expect(HEAL_HP).toBe(50); // the price of a level, in hp — the whole basis of this test
    for (const [size, hullId] of TIERS) {
      const drone = CONFIG.drones[size];
      // Shots the captain needs, on the base gun; the drone answers on its own
      // reload for exactly as long as that takes.
      const shotsToKill = Math.ceil(drone.hp / CONFIG.gun.damage);
      const duelMs = shotsToKill * CONFIG.gun.reloadMs;
      const volleysBack = Math.floor(duelMs / drone.gun.reloadMs);
      const damageTaken = volleysBack * drone.gun.damage;

      const levelsEarned = CONFIG.xp.droneTierLevels[hullId];
      const levelsToRepair = damageTaken / HEAL_HP;

      expect(levelsToRepair).toBeLessThan(levelsEarned);
    }
  });

  it('and the OLD 6/8/10 gun fails this same test on every size — the pin is not vacuous', () => {
    const OLD = { small: 6, medium: 8, large: 10 } as const;
    for (const [size, hullId] of TIERS) {
      const drone = CONFIG.drones[size];
      const shotsToKill = Math.ceil(drone.hp / CONFIG.gun.damage);
      const volleysBack = Math.floor((shotsToKill * CONFIG.gun.reloadMs) / drone.gun.reloadMs);
      const damageTaken = volleysBack * OLD[size];
      expect(damageTaken / HEAL_HP).toBeGreaterThan(CONFIG.xp.droneTierLevels[hullId]);
    }
  });
});
