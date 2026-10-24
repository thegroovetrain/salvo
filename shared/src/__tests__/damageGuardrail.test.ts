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
// zeroed) and FLIPPED BACK in Story 8.17 (Eric 2026-09-29, amendment 130: the
// flare deals 10 → 20 across its ladder, under the same per-shell law). Pure
// CONFIG/catalog pins — they fail the moment a retune or a
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

  it('every drone hull is lighter than every class hull, so drones are not floor-eligible', () => {
    // Drones are ALL lighter than every pickable class hull. That does NOT
    // make the small drone "the lightest hull on the water" for GUARDRAIL
    // purposes — fleet hulls are PvE fodder (amendment 33) and are
    // deliberately NOT protected by the one-hit-kill law. minHullHp is
    // therefore the CLASS floor, not the drone floor.
    for (const droneHp of droneHps) {
      for (const classHp of classHps) {
        expect(droneHp).toBeLessThan(classHp);
      }
    }
    expect(minDroneHp).toBeLessThan(minHullHp);
  });
});

describe('one-hit-kill guardrail — THE TWO PICKABLE GUNS (Story 8.15, amendments 103–105)', () => {
  it('the MACHINE GUN, restated PER SHELL: its flat damage at cap × 1 barrel stays under the lightest class hull', () => {
    // The machine gun is a STREAM, so the law is stated per shell — the unit
    // the gate sees — exactly as a multi-barrel cannon click is bounded per
    // shell below. One barrel, direct hit, no burst.
    const capped = stacked('machineGun').equipment.machineGun;
    // No rung authors MG damage since Story 9.12 (Eric 2026-10-16): 5 flat.
    expect(capped.damage).toBe(CONFIG.machineGun.damage);
    expect(capped.damage * 1).toBeLessThan(minHullHp);
    expect(CONFIG.machineGun.damage).toBeLessThan(minHullHp);
    // Even a WHOLE capped magazine cannot sink the 300 hp hull from full — a
    // record, not a law: the stream is bounded per shell.
    expect(capped.maxAmmo * capped.damage).toBeLessThan(minHullHp);
  });

  it('the FLAK burst and bodyblock stay under the floor at every rung', () => {
    const capped = stacked('flak').equipment.flak;
    expect(capped.damage).toBeGreaterThan(CONFIG.flak.damage); // the ladder steps it
    expect(capped.damage).toBeLessThan(minHullHp);
    expect(capped.contactDamage).toBe(CONFIG.flak.contactDamage); // FIXED — the ladder never steps it
    expect(CONFIG.flak.contactDamage).toBeLessThanOrEqual(CONFIG.flak.damage);
  });
});

describe('the small drone (45hp) TRADES the one-hit-kill floor for the farming economy (Story 5.6, amendment 34; epic-6 amendment 24)', () => {
  it('the GUN — the fleet-clearing weapon — still cannot one-shot even the smallest drone', () => {
    // This is the one that must hold: the gun is the weapon the TTK ladder is
    // written against (3/4/5 shots = 15/20/25s), so a one-shot here would
    // collapse the whole envelope rather than reward a build.
    expect(CONFIG.gun.damage).toBeLessThan(CONFIG.drones.small.hp); // one SHELL never one-shots it
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
    expect(CONFIG.torpedo.damage).toBeGreaterThanOrEqual(CONFIG.drones.small.hp);
    expect(CONFIG.mine.damage).toBeGreaterThanOrEqual(CONFIG.drones.small.hp); // the ruling
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
  it('EVERY damage path, max-stacked from the catalog, stays UNDER the 300hp lightest CLASS hull', () => {
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
    // THE LADDERS THAT ACTUALLY MOVE DAMAGE TODAY: the DECK GUN, the FOUR
    // torpedo / mine lines, FLAK (all as retuned by Eric 2026-10-16, Story
    // 9.12), and since Story 8.17 STAR SHELLS and PHOSPHOR SHELLS (Eric
    // 2026-09-29, amendments 130/131). FOULING MINES is deliberately absent —
    // its 10 hp is FIXED at every tier (epic-8 amendment 81) — and so is the
    // BROADSIDE, whose 15 per shell is fixed at every tier (amendment 133),
    // and since Story 9.12 the MACHINE GUN, whose 5 per shell is flat.
    expect(damagePaths.filter((p) => maxStackFor(p).length > 0).sort()).toEqual([
      'equipment.captiveMines.damage',
      'equipment.flak.damage',
      'equipment.gun.damage',
      'equipment.heavyTorpedo.damage',
      'equipment.lightTorpedo.damage',
      'equipment.navalMines.damage',
      'equipment.phosphorShells.damage',
      'equipment.starShells.damage',
    ]);
  });

  it('the torpedo / mine damage endpoints (base + the authored steps) all stay under the 300hp floor', () => {
    // Story 9.12 (Eric 2026-10-16): the four stepped lines top out at
    // 120 / 135 / 135 / 135 — no single torpedo or mine one-shots a captain at
    // any build (a two-tube salvo is a multi-shell case the per-shell law
    // deliberately does not govern). The endpoint is DERIVED: the line's
    // tier-I base plus every authored damage step.
    const tops = [
      ['lightTorpedo', CONFIG.lightTorpedo.damage],
      ['heavyTorpedo', CONFIG.torpedo.damage],
      ['navalMines', CONFIG.mine.damage],
      ['captiveMines', CONFIG.captiveMines.damage],
    ] as const;
    for (const [id, base] of tops) {
      const path = `equipment.${id}.damage`;
      const steps = CATALOG[id].tiers
        .flat()
        .filter((e) => e.kind === 'stat' && e.path === path)
        .reduce((sum, e) => sum + (e as { add: number }).add, 0);
      const got = effectiveStats(CONFIG.shipClasses.torpedoBoat, maxStackFor(path)).equipment[id].damage;
      expect(got, path).toBe(base + steps);
      expect(got, path).toBeLessThan(minHullHp);
    }
    // FOULING MINES trades damage for the slow: its base hp per hit at every tier.
    expect(
      effectiveStats(CONFIG.shipClasses.torpedoBoat, new Array<LineId>(CATALOG.foulingMines.cap).fill('foulingMines'))
        .equipment.foulingMines.damage,
    ).toBe(CONFIG.foulingMines.damage);
  });

  it('the drafted ladder endpoints land where the spec ruled them', () => {
    // THE DECK GUN LADDER (Eric 2026-10-16, Story 9.12; was 12 -> 18, the
    // 2026-10-13 experiment): 8 -> 13 across four tiers — the base plus the
    // authored steps — comfortably under the 300hp floor.
    const gunSteps = CATALOG.deckGun.tiers
      .flat()
      .filter((e) => e.kind === 'stat' && e.path === 'equipment.gun.damage')
      .reduce((sum, e) => sum + (e as { add: number }).add, 0);
    expect(stacked('deckGun').equipment.gun.damage).toBe(CONFIG.gun.damage + gunSteps);
    expect(stacked('deckGun').equipment.gun.damage).toBeLessThan(minHullHp);
    // Every other damage endpoint IS its base this cycle — pinned so a silent
    // re-add is visible.
    const bs = effectiveStats(CONFIG.shipClasses.battleship);
    const tb = effectiveStats(CONFIG.shipClasses.torpedoBoat);
    expect(bs.equipment.broadside.damage).toBe(CONFIG.broadside.damage);
    expect(tb.equipment.gun.damage).toBe(CONFIG.gun.damage);
    expect(tb.equipment.heavyTorpedo.damage).toBe(CONFIG.torpedo.damage);
    expect(tb.equipment.navalMines.damage).toBe(CONFIG.mine.damage);
    expect(tb.equipment.lightTorpedo.damage).toBe(CONFIG.lightTorpedo.damage);
    expect(tb.equipment.captiveMines.damage).toBe(CONFIG.captiveMines.damage);
    expect(tb.equipment.foulingMines.damage).toBe(CONFIG.foulingMines.damage);
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
    // The CANNON at its cap (Eric 2026-10-16, Story 9.12): TWO barrels at
    // every tier, fixed — no rung authors one, so the cap reads the CONFIG dial.
    const barrels = stacked('deckGun').equipment.gun.barrels;
    // The per-shell number under the strongest build catalog v3 can reach: the
    // DECK GUN ladder at its cap.
    const perShell = stacked('deckGun').equipment.gun.damage;
    expect(barrels).toBe(CONFIG.gun.barrels); // fixed at every tier
    expect(effectiveStats(CONFIG.shipClasses.torpedoBoat).equipment.gun.barrels).toBe(barrels);
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
    //
    // 2026-09-30: the triple mount left the catalog (TURRET/BARREL folded into
    // CANNON tiers) and the max-stacked click fell to 2 × 20 = 40, below the
    // 45hp small drone.
    //
    // 2026-10-02: THE SMALL-DRONE ONE-CLICK IS BACK, AND ACCEPTED (Eric,
    // epic-8 amendment 232). Eric's cannon table puts barrels at tiers II and
    // IV (1/2/2/3/3) and damage 16/16/18/18/21, so the maxed click is
    // 3 × 21 = 63 (54 at tier IV) — every shell landing one-clicks an
    // undamaged 45hp small drone again, and the 60hp MEDIUM drone too (both
    // accepted by Eric at the cycle-166 review gate, amendment 234; the 75hp
    // large drone still takes two). This test DOCUMENTS THE CEILING; it
    // is no longer a "below drone hp" guarantee. A future barrel or damage
    // change moves this pin, which keeps that a visible decision.
    //
    // 2026-10-13 (Eric, experiment, Story 9.8): cannon 12/12/15/15/18, so the
    // maxed click was 3 × 18 = 54 (45 at tier IV) — still a small-drone
    // one-click, but the 60hp MEDIUM drone took two again.
    //
    // 2026-10-16 (Eric, Story 9.12, forge weapon-balance-math): cannon
    // 8/10/11/12/13 on a FIXED two barrels, so the maxed click is
    // barrels × damage at V = 2 × 13 = 26 — the small-drone one-click is GONE
    // again (every drone size takes two or more maxed clicks). The ceiling is
    // read from the fold; a future barrel or damage change moves it visibly.
    expect(perShell * barrels).toBeLessThan(minDroneHp); // the maxed click no longer one-clicks a small drone
    expect(perShell * barrels).toBeLessThan(CONFIG.drones.medium.hp);
    expect(perShell * barrels).toBeLessThan(CONFIG.drones.large.hp);
    expect(perShell * barrels).toBeLessThan(minHullHp); // minHullHp === Math.min(...classHps)
  });

  // RETIRED (Story 7-5 wave 2): 'AP falloff can only DECREASE a hit'. The
  // ARMOR-PIERCING doctrine, its falloff table and the whole pierce sweep are
  // deleted with the cannon, so there is no falloff left to bound.

  it('the BROADSIDE obeys the per-shell law at every turret count', () => {
    // Story 8.17 re-pin (Eric 2026-09-29, amendment 133): the broadside's
    // tiers II–V are authored now (+0.5 turret per tier, 4 -> 6 at the cap —
    // the number Story 8.1 pinned here for this day) and damage stays 15 per
    // shell at every tier. The LAW is per SHELL.
    const maxed = stacked('broadside');
    expect(maxed.equipment.broadside.turrets).toBeGreaterThan(CONFIG.broadside.turrets); // the ladder adds turrets
    expect(maxed.equipment.broadside.damage).toBe(CONFIG.broadside.damage);
    expect(maxed.equipment.broadside.damage).toBeLessThan(minHullHp); // the law, per SHELL
    // The tier-V barrage total (6 x 15 = 90) clears the 45hp drone and stays
    // under the 300hp class floor — the multi-shell click case the law
    // deliberately does not govern.
    expect(maxed.equipment.broadside.turrets * maxed.equipment.broadside.damage).toBeLessThan(minHullHp);
  });
});

// STAR SHELLS DEAL DAMAGE AGAIN (Story 8.17, Eric 2026-09-29, amendment 130 —
// SUPERSEDING amendment 39's "structurally damageless" and the flipped pin
// that stood here). The CONFIG field is back; the ladder is Eric's whole
// numbers; and the per-shell law holds at every rung.
describe('star shells DEAL DAMAGE again (amendment 130 — supersedes amendment 39)', () => {
  it('the star-shell damage ladder climbs from its CONFIG base and every rung stays under the floor', () => {
    const ladder = [1, 2, 3, 4, 5].map((n) => stacked('starShells', n).equipment.starShells.damage);
    expect(ladder[0]).toBe(CONFIG.starShells.damage);
    expect(ladder[0]).toBeGreaterThan(0); // the flare deals damage (amendment 130)
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]).toBeGreaterThanOrEqual(ladder[i - 1]);
    for (const d of ladder) expect(d).toBeLessThan(minHullHp);
  });

  it('the old incendiary/dazzle doctrine fields are GONE (amendment 134)', () => {
    for (const gone of ['incendiaryRadiusFactor', 'incendiaryDps', 'dazzleSightFactor']) {
      expect(gone in CONFIG.starShells, gone).toBe(false);
    }
  });
});

// PHOSPHOR SHELLS (Story 8.17, amendment 131): the burst is a per-shell hit
// like any other, and the burn is a slow DoT — neither can one-shot a hull.
describe('phosphor shells stay under the one-hit-kill floor (amendment 131)', () => {
  it('the burst and burn ladders climb from their CONFIG bases, and burst plus a whole zone of burn stays under the floor at every rung', () => {
    const rows = [1, 2, 3, 4, 5].map((n) => stacked('phosphorShells', n).equipment.phosphorShells);
    expect(rows[0].damage).toBe(CONFIG.phosphorShells.damage);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].damage).toBeGreaterThanOrEqual(rows[i - 1].damage);
      expect(rows[i].dps).toBeGreaterThanOrEqual(rows[i - 1].dps);
    }
    for (const r of rows) {
      expect(r.damage).toBeLessThan(minHullHp);
      // The WHOLE burn a zone can deal to a hull that never leaves it, plus
      // the burst, still clears the lightest class hull by a wide margin.
      expect(r.damage + r.dps * (r.zoneDurationMs / 1000)).toBeLessThan(minHullHp);
    }
  });
});

describe('mine blast geometry guardrail', () => {
  it('blastRadius is strictly larger than triggerRadius at base (blast reaches past detection)', () => {
    expect(CONFIG.mine.blastRadius).toBeGreaterThan(CONFIG.mine.triggerRadius);
  });

  // The guardrail SURVIVES the ruling that retired the clamp enforcing it
  // (Eric 2026-08-16): the trip ring is now a fixed FRACTION of the blast, so
  // "never outgrows the blast" holds by construction at every stack rather than
  // by a ceiling that used to eat most of the 5th trigger card.
  it('the trip ring can never outgrow the blast (by derivation, not a clamp)', () => {
    // STORY 8.13 MADE THE STACK REAL: NAVAL MINES and FOULING MINES both write
    // their own `blastRadius` (x1.1 compounding per tier, R23/R24 and epic-8
    // amendment 81), so this now exercises a genuinely widened blast rather
    // than the base. The guarantee stays STRUCTURAL — the trip ring is a fixed
    // FRACTION of the blast — which is why it holds at every stack.
    for (const id of ['navalMines', 'foulingMines'] as const) {
      const maxed = maxStackFor(`equipment.${id}.blastRadius`);
      expect(maxed.length, id).toBeGreaterThan(0);
      const s = effectiveStats(CONFIG.shipClasses.torpedoBoat, maxed);
      expect(s.equipment[id].blastRadius, id).toBeGreaterThan(CONFIG[id === 'navalMines' ? 'mine' : id].blastRadius);
      expect(s.equipment[id].triggerRadius, id).toBeLessThan(s.equipment[id].blastRadius);
    }
    expect(CONFIG.mine.triggerFactor).toBeLessThan(1); // what makes it structural
  });

  it('the CAPTIVE mine is the deliberate exception: a BIGGER trip ring on a FIXED burst', () => {
    // Its rings are the other way round by ruling (catalog-v3 R25) and its
    // trip ring rides its TIER, not its blast (epic-8 amendment 84d) — so the
    // line grows the reach of the trap while the bang stays 32 u at every rung.
    for (const n of [1, 3, 5]) {
      const row = effectiveStats(CONFIG.shipClasses.torpedoBoat, new Array<LineId>(n).fill('captiveMines'))
        .equipment.captiveMines;
      expect(row.blastRadius, `x${n}`).toBe(CONFIG.captiveMines.blastRadius);
      expect(row.triggerRadius, `x${n}`).toBeGreaterThan(row.blastRadius);
    }
  });
});

describe('star-shell tell guardrail', () => {
  it('base litRadius stays inside base radar range (a lit ship always has the circle on radar)', () => {
    expect(CONFIG.starShells.litRadius).toBeLessThan(CONFIG.vision.radar);
  });

  // WIDE BURST was DELETED (Story 7-5 wave 1); since Story 8.17 the STAR
  // SHELLS line itself grows litRadius ×1.1 per tier (amendment 130), so the
  // SWEEP re-proves the tell guardrail at the maxed ladder: base × 1.1⁴
  // (366.0 u at sight 500, Story 9.8) stays inside radar.
  it('the STAR SHELLS ladder grows litRadius (amendment 130), and the maxed radius stays inside BASE radar range', () => {
    const maxed = maxStackFor('equipment.starShells.litRadius');
    expect(maxed).toEqual(new Array<LineId>(5).fill('starShells'));
    const s = effectiveStats(CONFIG.shipClasses.torpedoBoat, maxed);
    expect(s.equipment.starShells.litRadius).toBeCloseTo(CONFIG.starShells.litRadius * 1.1 ** 4, 9);
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
  it('THE LIGHT TORPEDO IS SLOWER THAN EVERY HULL — allowed, and deliberate (FR53)', () => {
    // 45 u/s at tier I and 55 at tier V, against class hulls of 45/40/35 that
    // boost to 56.25/50/43.75. A Torpedo Boat can outrun its own light fish at
    // every build, which is fine on two counts: FR7's outrun law is retired
    // (Eric 2026-09-11, AR49) and own ordnance NEVER damages the own hull
    // (Story 8.4, no friendly fire), so re-catching your own fish is not a
    // self-damage hazard. The light torpedo buys its arc and its cadence, not
    // its speed.
    const base = effectiveStats(CONFIG.shipClasses.torpedoBoat).equipment.lightTorpedo;
    const maxed = effectiveStats(CONFIG.shipClasses.torpedoBoat, new Array<LineId>(5).fill('lightTorpedo'))
      .equipment.lightTorpedo;
    // At tier I it merely MATCHES the fastest base hull (the Torpedo Boat's
    // 45) — so a TB at full ahead is never outrun by it — and a SPEED-capped,
    // boosted TB (71.875) outruns even the maxed fish.
    expect(base.speed).toBeLessThanOrEqual(maxHullSpeed);
    const capped = effectiveStats(CONFIG.shipClasses.torpedoBoat, new Array<LineId>(CATALOG.speed.cap).fill('speed'));
    expect(boostedKinematics(capped.kinematics, CONFIG.boost.factor, true).maxSpeed)
      .toBeGreaterThan(maxed.speed);
    expect(maxed.speed).toBeLessThan(CONFIG.torpedo.speed); // always under the heavy's
  });

  it('the SUPERCAV consumable is the fastest thing afloat, by a wide margin (amendment 74)', () => {
    // 195 u/s against a 45 u/s top hull: a straight-runner that trades homing
    // and a reload for reach-in-a-hurry. It is a CONSUMABLE, so the number
    // lives in CONFIG and no stat row carries it.
    expect(CONFIG.supercavTorpedo.speed).toBeGreaterThan(maxHullSpeed);
    expect(CONFIG.supercavTorpedo.damage).toBeLessThan(minHullHp);
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

  // The CAPTAIN's click: `barrels` shells of `damage` each (two barrels at
  // every tier since Story 9.12, Eric 2026-10-16), read through the fold —
  // never CONFIG.gun.damage alone, which is one SHELL.
  const captainGun = effectiveStats(CONFIG.shipClasses.torpedoBoat).equipment.gun;
  const clickDamage = captainGun.damage * captainGun.barrels;

  it('a solo duel with each fleet size is XP-POSITIVE after repair costs', () => {
    // 100 since balance cycle 1 (instantHp + regenHp both 25 → 50, doubled in
    // step with hull hp). CONSEQUENCE RECORDED RATHER THAN ABSORBED: a level now
    // buys twice the repair, so the level-cost of PvE damage HALVED and farming
    // is materially cheaper to sustain than it was when this bar was derived.
    // The bar itself still holds — and now holds by a wider margin.
    for (const [size, hullId] of TIERS) {
      const drone = CONFIG.drones[size];
      // Clicks the captain needs, on the base gun (every barrel's shell
      // landing); the drone answers on its own reload for exactly as long as
      // that takes.
      const shotsToKill = Math.ceil(drone.hp / clickDamage);
      const duelMs = shotsToKill * captainGun.reloadMs;
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
      const shotsToKill = Math.ceil(drone.hp / clickDamage);
      const volleysBack = Math.floor((shotsToKill * captainGun.reloadMs) / drone.gun.reloadMs);
      const damageTaken = volleysBack * OLD[size];
      expect(damageTaken / PRE_DOUBLING_HEAL).toBeGreaterThan(CONFIG.xp.droneTierLevels[hullId]);
    }
  });
});
