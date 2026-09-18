// Balance guardrails (HULLCRACKER_NOTES "PROBLEMS SO FAR"): no single hit may
// ever kill an undamaged PLAYER-PILOTED hull — extended to MAX-STACKED
// catalog ladders (Story 2.8: every damage ladder, fully stacked to its copy
// cap, stays under the lightest CLASS hull on the water). THE TORPEDO OUTRUN
// LAW IS GONE (Story 8.9 — see the speed describe at the bottom): FR7's "a
// torpedo must always outrun every hull" was retired by Eric on 2026-09-11
// (AR49), and what stands there now is a record of the current speeds. The TTK & Objective Pip
// Rebalance (Eric ruling 2026-08-03) moved class hp onto the toughness ladder
// (TB 70→125, ML 105→150, BS 150→175), then DOUBLED again in balance cycle 1
// (TB 250, ML 300, BS 350) — which only widens every margin below.
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
  BOON_STAT_PATHS,
  CATALOG,
  CONFIG,
  DRONE_SIZE_IDS,
  LINE_IDS,
  SHIP_CLASS_IDS,
  boostedKinematics,
  effectiveStats,
  type EffectiveStats,
  type LineId,
} from '../index.js';

/** Every line that writes `path`, and the max-stacked hand that does it. */
function maxStackFor(path: string): LineId[] {
  return LINE_IDS.flatMap((id) =>
    CATALOG[id].tiers.some((t) => t.some((e) => e.kind === 'stat' && e.path === path))
      ? new Array<LineId>(CATALOG[id].cap).fill(id)
      : [],
  );
}

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
const stacked = (id: LineId, n = CATALOG[id].cap) =>
  effectiveStats(CONFIG.shipClasses.torpedoBoat, new Array<LineId>(n).fill(id));

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

  it('broadside PER-SHELL damage cannot one-hit the lightest hull', () => {
    // The cannon's separate `contactDamage` clause is RETIRED with the weapon
    // (Story 7-5 wave 2): the BROADSIDE BARRAGE has no bodyblock number of its
    // own — every shell bursts like a gun shell — so there is no second scalar
    // to bound. The per-SHELL law is what governs a barrage; the whole-barrage
    // total is deliberately outside it, exactly as a multi-barrel gun CLICK is
    // (see 'THE LAW IS PER SHELL' below).
    expect(CONFIG.broadside.damage).toBeLessThan(minHullHp);
  });

  it('the lightest CLASS hull is the 250hp torpedoBoat; drones sit BELOW it and are no longer floor-eligible', () => {
    // Objective toughness ladder (Eric ruling 2026-08-03) moved class hp onto
    // 200 + 50/pip: TB 250 (2 pips) is the lightest CLASS hull, below ML 300
    // (3 pips) and BS 175 (4 pips).
    expect(Math.min(...classHps)).toBe(250);
    expect(Math.min(...classHps)).toBe(CONFIG.shipClasses.torpedoBoat.hp);
    // Drones (45/60/75 — epic-6 amendment 24; 80/100/120 -> 60/75/90 -> here)
    // are ALL lighter than every pickable class hull. That does NOT make the
    // small drone "the lightest hull on the water" for GUARDRAIL purposes —
    // fleet hulls are PvE fodder (amendment 33) and are deliberately NOT
    // protected by the one-hit-kill law. minHullHp is therefore the CLASS
    // floor (250), not the drone floor (45).
    for (const droneHp of droneHps) {
      for (const classHp of classHps) {
        expect(droneHp).toBeLessThan(classHp);
      }
    }
    expect(minHullHp).toBe(250);
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
    // The cannon's 65 became the broadside's 20 PER SHELL (Story 7-5 wave 2),
    // which no longer clears a 45hp small drone on its own — but a BARRAGE of 3
    // does, and a barrage is the weapon's unit of fire. Pinned as the barrage
    // so the Battleship's fleet-clearing is still guarded.
    expect(CONFIG.broadside.damage * CONFIG.broadside.turrets).toBeGreaterThanOrEqual(CONFIG.drones.small.hp); // 60 >= 45
    expect(CONFIG.torpedo.damage).toBeGreaterThanOrEqual(CONFIG.drones.small.hp); // 70 >= 45
    expect(CONFIG.mine.damage).toBeGreaterThanOrEqual(CONFIG.drones.small.hp); // 55 >= 45 — the ruling
    // The `stacked('mineDamage')` half of this pin is RETIRED with the card
    // (Story 7-5 wave 1): TNT FILLER is deleted, so 55 IS the mine's damage at
    // every build and the base clause above is now the whole statement.
  });
});

// NARROWED, NOT WEAKENED (Story 7-5 wave 1, completed by wave 2). ALL FOUR
// damage ladders this describe was written for are now DELETED — Eric: *"The
// gun is absurdly powerful and does not need damage bonuses"* took three of
// them, and `cannonDamage` left with the cannon — so every damage path has NO
// writer at all and is pinned at its CONFIG base by the first describe in this
// file. The general form is kept as a CATALOG SWEEP precisely because there is
// nothing left to sweep: a future damage line lands under the law
// automatically, on the day it lands, instead of needing a new pin.
describe('one-hit-kill guardrail — MAX-STACKED catalog ladders (Story 2.8; player-classes-only scope per Story 5.6)', () => {
  it('EVERY damage path, max-stacked from the catalog, stays UNDER the 250hp lightest CLASS hull', () => {
    // Swept from the catalog rather than listed, so a new damage card is
    // covered the day it lands and a deleted one needs no edit here. Catalog
    // v3 widened the sweep: every `equipment.<id>.damage` path the GENERATED
    // whitelist carries is checked, built or not.
    const damagePaths = BOON_STAT_PATHS.filter((p) => p.endsWith('.damage'));
    const read = (st: EffectiveStats, path: string): number => {
      const [, id, field] = path.split('.');
      return (st.equipment as unknown as Record<string, Record<string, number>>)[id][field];
    };
    expect(damagePaths.length).toBeGreaterThanOrEqual(9);
    for (const path of damagePaths) {
      const s2 = effectiveStats(CONFIG.shipClasses.torpedoBoat, maxStackFor(path));
      expect(read(s2, path), path).toBeLessThan(minHullHp);
    }
    // THE DECK GUN IS THE ONE DAMAGE LADDER catalog v3 authors (R14, +1.25/tier).
    // Every other damage number is its base until 8.12-8.16 fill the equipment
    // tiers — and each of those will land under this same sweep automatically.
    expect(damagePaths.filter((p) => maxStackFor(p).length > 0)).toEqual(['equipment.gun.damage']);
  });

  it('the drafted ladder endpoints land where the spec ruled them', () => {
    // THE DECK GUN LADDER (catalog-v3 R14): 15 -> 20 across four tiers, and
    // 20 is still comfortably under the 250hp floor.
    expect(stacked('deckGun').equipment.gun.damage).toBe(20);
    expect(stacked('deckGun').equipment.gun.damage).toBeLessThan(minHullHp);
    // Every other damage endpoint IS its base this cycle — pinned so a silent
    // re-add is visible.
    const bs = effectiveStats(CONFIG.shipClasses.battleship);
    const tb = effectiveStats(CONFIG.shipClasses.torpedoBoat);
    expect(bs.equipment.broadside.damage).toBe(CONFIG.broadside.damage);
    expect(tb.equipment.gun.damage).toBe(CONFIG.gun.damage);
    expect(tb.equipment.heavyTorpedo.damage).toBe(CONFIG.torpedo.damage);
    expect(tb.equipment.navalMines.damage).toBe(CONFIG.mine.damage);
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
    const barrels = stacked('deckGunBarrel').equipment.gun.barrels;
    // The per-shell number under the strongest build catalog v3 can reach: the
    // DECK GUN ladder at its cap (R14), 20 damage.
    const perShell = stacked('deckGun').equipment.gun.damage;
    expect(barrels).toBe(3); // TWIN + TRIPLE MOUNT, both copies
    expect(perShell).toBeLessThan(minHullHp); // the law, per SHELL — the thing that holds
    // And this is the consequence Eric was shown and ACCEPTED: a fully
    // max-stacked triple mount whose three overlapping bursts all connect
    // one-clicks an undamaged small drone. That is not a breach — it is three
    // hits. No player hull falls to the SHELLS ALONE: the lightest is the 125hp
    // Torpedo Boat. Rejected alternatives (do not re-propose): falloff on later
    // same-click hits, an aggregate cap below the floor.
    //
    // STORY 7-5 WAVE 1 SHRANK THIS MARGIN TO EXACTLY ZERO, and the pin is
    // loosened `>` → `>=` to say so rather than to pass. Deleting HEAVY SHELLS
    // took the max-stacked triple-mount click from 3 × 30 = 90 down to
    // 3 × 15 = 45, which is EXACTLY the 45hp small drone: the click still kills
    // it (damage >= hp sinks), but with no headroom at all, where it used to
    // have double. Nothing about the LAW moved — the per-shell bound above is
    // untouched and the click still lands far under the 125hp class floor —
    // but a small-drone hp RISE of even 1, or a gun base-damage CUT, now flips
    // the Mine Layer's fleet-farming one-click without anything else changing.
    // Ledgered here because it is the kind of thing a later balance pass moves
    // by accident.
    //
    // SCOPE, precisely: this bounds the click's GUN SHELLS and nothing else. A
    // burst also detonates the shooter's own armed mines inside burstRadius
    // (detonateMinesInBurst, Story 1.8 + the 2.8 same-owner cascade), so a
    // click walked over your own field can obviously exceed any hull's hp. That
    // is the minefield paying out, not the gun, and it is deliberately outside
    // this pin.
    expect(perShell * barrels).toBeGreaterThanOrEqual(minDroneHp); // exactly equal since wave 1 — see above
    expect(perShell * barrels).toBeLessThan(minHullHp); // minHullHp === Math.min(...classHps)
  });

  // RETIRED (Story 7-5 wave 2): 'AP falloff can only DECREASE a hit'. The
  // ARMOR-PIERCING doctrine, its falloff table and the whole pierce sweep are
  // deleted with the cannon, so there is no falloff left to bound.

  it('the BROADSIDE obeys the per-shell law at every turret count', () => {
    // CATALOG V3 INTERIM (Story 8.1): the broadside's tiers II-V are EMPTY
    // until Story 8.16 authors them from catalog-v3 R35 (+0.5 turret/tier, 4 ->
    // 6 at the cap), so no line moves turrets or damage this cycle and the
    // whole battery sits at its base. The LAW is per SHELL either way, and the
    // ruled cap is pinned here so 8.16 has a number to land on.
    const maxed = stacked('broadside');
    expect(maxed.equipment.broadside.turrets).toBe(CONFIG.broadside.turrets);
    expect(maxed.equipment.broadside.damage).toBe(CONFIG.broadside.damage);
    expect(maxed.equipment.broadside.damage).toBeLessThan(minHullHp); // the law, per SHELL
    // The tier-V barrage total R35 rules (6 x 15 = 90) would still clear the
    // 45hp drone and stay under the 250hp class floor — the multi-shell click
    // case the law deliberately does not govern.
    expect(6 * CONFIG.broadside.damage).toBeLessThan(minHullHp);
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

  // The guardrail SURVIVES the ruling that retired the clamp enforcing it
  // (Eric 2026-08-16): the trip ring is now a fixed FRACTION of the blast, so
  // "never outgrows the blast" holds by construction at every stack rather than
  // by a ceiling that used to eat most of the 5th trigger card.
  it('the trip ring can never outgrow the blast (by derivation, not a clamp)', () => {
    // CATALOG V3 INTERIM: no line writes `equipment.navalMines.blastRadius`
    // until Story 8.13 authors the mine's tiers (R23/R24, x1.1 compounding), so
    // the max stack IS the base today. The guarantee is STRUCTURAL rather than
    // stacked — the trip ring is a fixed FRACTION of the blast — which is why
    // it holds at every future stack too.
    const s = effectiveStats(CONFIG.shipClasses.torpedoBoat, maxStackFor('equipment.navalMines.blastRadius'));
    expect(s.equipment.navalMines.triggerRadius).toBeLessThan(s.equipment.navalMines.blastRadius);
    expect(CONFIG.mine.triggerFactor).toBeLessThan(1); // what makes it structural
  });
});

describe('star-shell tell guardrail', () => {
  it('base litRadius stays inside base radar range (a lit ship always has the circle on radar)', () => {
    expect(CONFIG.starShells.litRadius).toBeLessThan(CONFIG.vision.radar);
  });

  // WIDE BURST is DELETED (Story 7-5 wave 1), so `starShells.litRadius` has no
  // writer and the base pin above is the whole guarantee. Kept as a SWEEP so a
  // future radius card cannot land without re-proving the tell guardrail.
  it('no catalog line grows litRadius; if one ever does, it must stay inside BASE radar range', () => {
    const maxed = maxStackFor('equipment.starShells.litRadius');
    expect(maxed).toEqual([]);
    const s = effectiveStats(CONFIG.shipClasses.torpedoBoat, maxed);
    expect(s.equipment.starShells.litRadius).toBeLessThan(CONFIG.vision.radar);
  });
});

// THE OUTRUN LAW IS RETIRED (Story 8.9). FR7's "a torpedo must always outrun
// every hull" stopped being a requirement on 2026-09-11 (Eric, epics.md AR49;
// re-stated in epic-8 amendment 55 when the Shift boost went proportional).
// What these pins record now are CURRENT FACTS, free to move when Story 8.13
// authors the heavy torpedo's tiers or a hull is retuned — NOT a law a future
// change must obey. THE SAFETY PROPERTY that replaced it is structural: own
// ordnance never damages the own hull (Story 8.4, no friendly fire), so a firer
// that re-catches its own fish takes nothing for it.
describe('torpedo vs hull speeds — CURRENT FACTS, no longer a law (FR7 retired)', () => {
  it('the base heavy torpedo (65) still outruns every BASE hull and drone — a current fact, not a requirement', () => {
    expect(CONFIG.torpedo.speed).toBeGreaterThan(maxHullSpeed);
    for (const speed of [...classSpeeds, ...droneSpeeds]) {
      expect(CONFIG.torpedo.speed).toBeGreaterThan(speed);
    }
  });

  it('...and outruns every BASE hull under the Shift boost too (the fastest is the TB at 56.25)', () => {
    for (const c of SHIP_CLASS_IDS) {
      const boosted = boostedKinematics(CONFIG.shipClasses[c].kinematics, CONFIG.boost.factor, true);
      expect(CONFIG.torpedo.speed, c).toBeGreaterThan(boosted.maxSpeed);
    }
    // 45/40/35 x 1.25 = 56.25 / 50 / 43.75 (epic-8 amendment 55).
    const base = (c: 'torpedoBoat' | 'mineLayer' | 'battleship'): number =>
      boostedKinematics(CONFIG.shipClasses[c].kinematics, CONFIG.boost.factor, true).maxSpeed;
    expect([base('torpedoBoat'), base('mineLayer'), base('battleship')]).toEqual([56.25, 50, 43.75]);
  });

  it('a SPEED-capped boosted Torpedo Boat (68.75) OUTRUNS the 65 u/s heavy torpedo — ALLOWED', () => {
    // ALLOWED, and deliberately so: FR7's outrun law is retired (Eric
    // 2026-09-11, AR49; epic-8 amendment 55), and no friendly fire (Story 8.4)
    // is the safety property that makes catching your own fish harmless.
    const s = effectiveStats(CONFIG.shipClasses.torpedoBoat, new Array<LineId>(CATALOG.speed.cap).fill('speed'));
    expect(s.kinematics.maxSpeed).toBe(55); // 45 + 2.5 x 4 (catalog-v3 R10)
    const maxAchievableHull = boostedKinematics(s.kinematics, CONFIG.boost.factor, true).maxSpeed;
    expect(maxAchievableHull).toBe(68.75); // 55 x 1.25 — the SPEED ladder is inside the bonus
    expect(s.equipment.heavyTorpedo.speed).toBe(65); // catalog-v3 R17 Tier I; no ladder authored yet
    expect(maxAchievableHull).toBeGreaterThan(s.equipment.heavyTorpedo.speed);
  });
});

// --- The PvE exchange rate (epic-5 amendment 45) ------------------------------
//
// THE GUARDRAIL AMENDMENT 33 FAILED TO APPLY, and the one that actually caught
// the 6/8/10 fleet gun. A PvE kill is only a faucet if the XP it pays exceeds
// what the damage taken COSTS TO UNDO — and undoing damage has a hard price in
// the same currency: one HULL REPAIR copy restores instantHp + regenHp, and a
// copy is a card, which is what a banked level buys. So the honest test of a
// PvE damage profile is an EXCHANGE RATE, never a dps or a time-to-kill.
// (It was a level spent directly on the heal until Story 8.8 made the heal a
// card; the arithmetic — one level, one heal's worth of hp — is unchanged.)
//
// Eric's derivation, 2026-08-14: an unupgraded gun (15) needs 4 shots to sink a
// 60hp small hull; on a 5s reload that is 20 seconds, in which the drone fires
// back 4 times. At 6 damage that is 24 hp taken for a quarter-level earned —
// and 24 hp costs about half a level to repair. Every size was NET NEGATIVE:
// farming correctly and winning left a captain BEHIND one who ignored the
// fleet entirely, which is a broken faucet rather than a hard fight.
describe('the PvE farm must PAY — damage taken costs less to repair than the kill earns', () => {
  const HEAL_HP = CONFIG.hullRepair.instantHp + CONFIG.hullRepair.regenHp; // 100 per HULL REPAIR copy
  const TIERS = [
    ['small', 'droneSmall'],
    ['medium', 'droneMedium'],
    ['large', 'droneLarge'],
  ] as const;

  it('a solo duel with each fleet size is XP-POSITIVE after repair costs', () => {
    // 100 since balance cycle 1 (instantHp + regenHp both 25 → 50, doubled in
    // step with hull hp). CONSEQUENCE RECORDED RATHER THAN ABSORBED: a level now
    // buys twice the repair, so the level-cost of PvE damage HALVED and farming
    // is materially cheaper to sustain than it was when this bar was derived.
    // The bar itself still holds — and now holds by a wider margin.
    expect(HEAL_HP).toBe(100); // the price of a level, in hp — the whole basis of this test
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

  it('and the OLD 6/8/10 gun fails this same test at the PRE-DOUBLING heal — the pin is not vacuous', () => {
    // THE COUNTERFACTUAL IS ANCHORED TO THE OLD HEAL (50 hp/level) ON PURPOSE.
    // At today's 100 hp/level the old 6/8/10 drone gun clears the bar too (the
    // small tier costs 0.18 levels to repair against 0.25 earned), so measuring
    // it against the CURRENT heal would make this guard vacuous — it would pass
    // no matter how weak the counterfactual was. That the guard had to be
    // re-anchored IS the finding: doubling the paid heal halved the level-cost
    // of PvE damage, which loosened the faucet this whole describe-block exists
    // to keep honest. Flagged for a ruling; not silently accepted.
    const PRE_DOUBLING_HEAL = 50;
    const OLD = { small: 6, medium: 8, large: 10 } as const;
    for (const [size, hullId] of TIERS) {
      const drone = CONFIG.drones[size];
      const shotsToKill = Math.ceil(drone.hp / CONFIG.gun.damage);
      const volleysBack = Math.floor((shotsToKill * CONFIG.gun.reloadMs) / drone.gun.reloadMs);
      const damageTaken = volleysBack * OLD[size];
      expect(damageTaken / PRE_DOUBLING_HEAL).toBeGreaterThan(CONFIG.xp.droneTierLevels[hullId]);
    }
  });

  it('records HOW MUCH cheaper the farm got — the exchange rate roughly doubled', () => {
    // Same duel, priced at both heals. Not a bar, a MEASUREMENT: it exists so
    // the size of the side effect is visible in the suite rather than only in a
    // ledger, and so a future heal retune shows up here immediately.
    for (const [size, hullId] of TIERS) {
      const drone = CONFIG.drones[size];
      const shotsToKill = Math.ceil(drone.hp / CONFIG.gun.damage);
      const volleysBack = Math.floor((shotsToKill * CONFIG.gun.reloadMs) / drone.gun.reloadMs);
      const damageTaken = volleysBack * drone.gun.damage;
      const now = damageTaken / HEAL_HP;
      const before = damageTaken / 50;
      expect(before / (now || 1)).toBeCloseTo(2, 10); // exactly 2× cheaper to repair
      expect(now).toBeLessThan(CONFIG.xp.droneTierLevels[hullId]);
    }
  });
});
