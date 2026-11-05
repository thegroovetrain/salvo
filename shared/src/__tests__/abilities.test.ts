// THE ABILITY COOLDOWN LAW (sim/abilities.ts — Story 10.5, Eric 2026-11-05,
// epic-10 amendment 11, R1–R3): HULL REPAIR (`C`) and SMOKE (`V`) are ready at
// spawn, go on a FIXED cooldown from a successful press, and no RELOAD index
// or card shortens it; a HULL REPAIR press on a full hull is refused and
// starts nothing. Every expectation is a relation over CONFIG and the law's
// own functions — never the ruled seconds.

import { describe, it, expect } from 'vitest';
import {
  ABILITY_IDS,
  CATALOG,
  CONFIG,
  LINE_IDS,
  NO_SLOT,
  SHIP_CLASS_IDS,
  SLOT_BOOST,
  SLOT_COUNT,
  abilityCode,
  abilityCooldownFraction,
  abilityCooldownMs,
  abilityFromCode,
  abilityReady,
  abilityReadyAt,
  abilitySlot,
  effectiveStats,
  repairRefusal,
  smokeRefusal,
  type CooldownAbilityId,
  type LineId,
} from '../index.js';

const COOLDOWN_ABILITIES: readonly CooldownAbilityId[] = ['repair', 'smoke'];
const MAX = effectiveStats(CONFIG.shipClasses.yamato).maxHp;

describe('the ability vocabulary and its wire codes', () => {
  it('a code is the ability\'s index and round-trips; the Shift is code 0 (what a driver that never presses sends)', () => {
    ABILITY_IDS.forEach((id, i) => {
      expect(abilityCode(id), id).toBe(i);
      expect(abilityFromCode(i), id).toBe(id);
    });
    expect(abilityFromCode(0)).toBe('shift');
    expect(new Set(ABILITY_IDS).size).toBe(ABILITY_IDS.length);
  });

  it('abilityFromCode is FAIL-CLOSED: anything that is not a listed integer code is null', () => {
    for (const bad of [-1, ABILITY_IDS.length, 0.5, Number.NaN, Number.POSITIVE_INFINITY, '1', null, undefined, {}, true]) {
      expect(abilityFromCode(bad), String(bad)).toBeNull();
    }
  });

  it('only the Shift lives in a loadout slot; the two cooldown abilities hold none', () => {
    expect(abilitySlot('shift')).toBe(SLOT_BOOST);
    for (const id of COOLDOWN_ABILITIES) {
      expect(abilitySlot(id), id).toBe(NO_SLOT);
    }
    expect(NO_SLOT < 0 || NO_SLOT >= SLOT_COUNT).toBe(true); // never a real slot index
  });
});

describe('the cooldown law', () => {
  it('each ability reads its own CONFIG dial, a positive whole number of sim ticks', () => {
    expect(abilityCooldownMs('repair')).toBe(CONFIG.hullRepair.cooldownMs);
    expect(abilityCooldownMs('smoke')).toBe(CONFIG.countermeasure.cooldownMs);
    for (const id of COOLDOWN_ABILITIES) {
      expect(abilityCooldownMs(id), id).toBeGreaterThan(0);
      expect(abilityCooldownMs(id) % CONFIG.tick.simDtMs, id).toBe(0);
    }
  });

  it('READY AT SPAWN: a never-pressed ability (stamp 0, or the omitted wire field) is ready at any time', () => {
    for (const now of [0, 1, 50, 1e9]) {
      expect(abilityReady(now), String(now)).toBe(true);
      expect(abilityReady(now, 0), String(now)).toBe(true);
    }
  });

  it.each(COOLDOWN_ABILITIES)('%s: a press stamps press + cooldown; not ready one tick before the stamp, ready exactly at it and after', (id) => {
    for (const pressedAt of [0, 12_345, 600_000]) {
      const readyAt = abilityReadyAt(pressedAt, id);
      expect(readyAt - pressedAt).toBe(abilityCooldownMs(id));
      expect(abilityReady(pressedAt, readyAt)).toBe(false);
      expect(abilityReady(readyAt - CONFIG.tick.simDtMs, readyAt)).toBe(false);
      expect(abilityReady(readyAt, readyAt)).toBe(true);
      expect(abilityReady(readyAt + CONFIG.tick.simDtMs, readyAt)).toBe(true);
    }
  });

  it.each(COOLDOWN_ABILITIES)('%s: the wipe fraction is 1 at the press, falls linearly, and is 0 from the ready time on', (id) => {
    const pressedAt = 40_000;
    const readyAt = abilityReadyAt(pressedAt, id);
    const cd = abilityCooldownMs(id);
    expect(abilityCooldownFraction(pressedAt, readyAt, id)).toBe(1);
    expect(abilityCooldownFraction(pressedAt + cd / 2, readyAt, id)).toBeCloseTo(0.5, 12);
    expect(abilityCooldownFraction(readyAt, readyAt, id)).toBe(0);
    expect(abilityCooldownFraction(readyAt + cd, readyAt, id)).toBe(0);
    expect(abilityCooldownFraction(pressedAt, 0, id)).toBe(0); // never pressed
    let prev = 1;
    for (let t = pressedAt; t <= readyAt; t += cd / 20) {
      const f = abilityCooldownFraction(t, readyAt, id);
      expect(f).toBeLessThanOrEqual(prev);
      expect(f).toBeGreaterThanOrEqual(0);
      prev = f;
    }
    // Clamped: a clock that reads before the press never overfills the wipe.
    expect(abilityCooldownFraction(pressedAt - cd, readyAt, id)).toBe(1);
  });

  it('is FAIL-CLOSED on an unreadable clock or stamp: not ready, full wipe', () => {
    expect(abilityReady(Number.NaN, 1000)).toBe(false);
    expect(abilityReady(1000, Number.NaN)).toBe(false);
    expect(abilityCooldownFraction(Number.NaN, 1000, 'repair')).toBe(1);
    expect(abilityCooldownFraction(1000, Number.NaN, 'smoke')).toBe(1);
  });

  it('R3 — NOTHING SHORTENS IT: the law takes no stats, and no card, hull or RELOAD index is an input to the cooldown', () => {
    // The law's whole input is (clock, stamp, ability): there is no stats
    // parameter to pass. What CAN move is CONFIG — and it is the same for every
    // hull and under every hand, including a maxed RELOAD ladder.
    const hasted = new Array<LineId>(CATALOG.reload.cap).fill('reload');
    for (const hull of SHIP_CLASS_IDS) {
      const stats = effectiveStats(CONFIG.shipClasses[hull], hasted);
      expect(stats.cooldownScale, hull).toBeLessThan(1); // RELOAD does scale the main battery...
      const tree = JSON.stringify(stats);
      // ...but no ability cooldown lives anywhere on the stats tree for it to reach.
      expect(tree.includes('cooldownMs'), hull).toBe(false);
    }
    // No card addresses either dial: there is no stat path for an ability at all.
    for (const id of LINE_IDS) {
      for (const tier of CATALOG[id].tiers) {
        for (const e of tier) {
          if (e.kind === 'stat') expect(/hullRepair|countermeasure|repair|smoke/.test(e.path), `${id}: ${e.path}`).toBe(false);
        }
      }
    }
  });
});

describe('repairRefusal / smokeRefusal — the one press predicate both sides run', () => {
  it('a hurt hull with the ability ready goes through', () => {
    expect(repairRefusal(MAX - 1, MAX, 0)).toBeNull();
    expect(repairRefusal(1, MAX, 5000, 0)).toBeNull();
    expect(smokeRefusal(0)).toBeNull();
  });

  it('A FULL HULL IS REFUSED — and the caller therefore starts no cooldown: the next press on a hurt hull goes through at once', () => {
    const now = 10_000;
    expect(repairRefusal(MAX, MAX, now)).toBe('blocked');
    expect(repairRefusal(MAX - 0.5, MAX, now)).toBe('blocked'); // under a point missing IS full (amendment 53)
    // The refused press stamped nothing: readyAt is still its spawn value.
    const readyAtAfterRefusal = 0;
    expect(repairRefusal(MAX - 100, MAX, now + CONFIG.tick.simDtMs, readyAtAfterRefusal)).toBeNull();
  });

  it('inside the cooldown both abilities answer `cooling`, whatever the hull; from the ready time on they clear', () => {
    const pressedAt = 3000;
    for (const id of COOLDOWN_ABILITIES) {
      const readyAt = abilityReadyAt(pressedAt, id);
      const refusal = (now: number) => (id === 'repair' ? repairRefusal(MAX / 2, MAX, now, readyAt) : smokeRefusal(now, readyAt));
      expect(refusal(pressedAt), id).toBe('cooling');
      expect(refusal(readyAt - 1), id).toBe('cooling');
      expect(refusal(readyAt), id).toBeNull();
    }
    // Cooling outranks full: a press inside the cooldown is `cooling` on any hull.
    expect(repairRefusal(MAX, MAX, pressedAt, abilityReadyAt(pressedAt, 'repair'))).toBe('cooling');
  });
});
