// THE ABILITY COOLDOWN LAW (sim/abilities.ts — Story 10.5, Eric 2026-11-05,
// epic-10 amendment 11, R1–R3): HULL REPAIR (`C`) and SMOKE (`V`) are ready at
// spawn, go on a cooldown from a successful press that the ship's RELOAD index
// never shortens; a HULL REPAIR press on a full hull is refused and starts
// nothing. SINCE STORY 10.6 (R8 / R9) the cooldown is the SHIP'S OWN —
// `stats.repair.cooldownMs` / `stats.smoke.cooldownMs`, which only the HULL
// REPAIR / SMOKE SCREEN cards move (their laws: catalogUnderIndex.test.ts).
// Every expectation is a relation over the stats and the law's own functions
// — never the ruled seconds.

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
const STATS = effectiveStats(CONFIG.shipClasses.yamato);
const MAX = STATS.maxHp;

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
  it('each ability reads its own folded cooldown off the ship\'s stats — the CONFIG base at zero cards', () => {
    expect(abilityCooldownMs(STATS, 'repair')).toBe(STATS.repair.cooldownMs);
    expect(abilityCooldownMs(STATS, 'smoke')).toBe(STATS.smoke.cooldownMs);
    expect(abilityCooldownMs(STATS, 'repair')).toBe(CONFIG.hullRepair.cooldownMs);
    expect(abilityCooldownMs(STATS, 'smoke')).toBe(CONFIG.countermeasure.cooldownMs);
    for (const id of COOLDOWN_ABILITIES) expect(abilityCooldownMs(STATS, id), id).toBeGreaterThan(0);
  });

  it('READY AT SPAWN: a never-pressed ability (stamp 0, or the omitted wire field) is ready at any time', () => {
    for (const now of [0, 1, 50, 1e9]) {
      expect(abilityReady(now), String(now)).toBe(true);
      expect(abilityReady(now, 0), String(now)).toBe(true);
    }
  });

  it.each(COOLDOWN_ABILITIES)('%s: a press stamps press + cooldown; not ready one tick before the stamp, ready exactly at it and after', (id) => {
    for (const pressedAt of [0, 12_345, 600_000]) {
      const readyAt = abilityReadyAt(pressedAt, STATS, id);
      expect(readyAt - pressedAt).toBe(abilityCooldownMs(STATS, id));
      expect(abilityReady(pressedAt, readyAt)).toBe(false);
      expect(abilityReady(readyAt - CONFIG.tick.simDtMs, readyAt)).toBe(false);
      expect(abilityReady(readyAt, readyAt)).toBe(true);
      expect(abilityReady(readyAt + CONFIG.tick.simDtMs, readyAt)).toBe(true);
    }
  });

  it.each(COOLDOWN_ABILITIES)('%s: the wipe fraction is 1 at the press, falls linearly, and is 0 from the ready time on', (id) => {
    const pressedAt = 40_000;
    const readyAt = abilityReadyAt(pressedAt, STATS, id);
    const cd = abilityCooldownMs(STATS, id);
    expect(abilityCooldownFraction(pressedAt, readyAt, STATS, id)).toBe(1);
    expect(abilityCooldownFraction(pressedAt + cd / 2, readyAt, STATS, id)).toBeCloseTo(0.5, 12);
    expect(abilityCooldownFraction(readyAt, readyAt, STATS, id)).toBe(0);
    expect(abilityCooldownFraction(readyAt + cd, readyAt, STATS, id)).toBe(0);
    expect(abilityCooldownFraction(pressedAt, 0, STATS, id)).toBe(0); // never pressed
    let prev = 1;
    for (let t = pressedAt; t <= readyAt; t += cd / 20) {
      const f = abilityCooldownFraction(t, readyAt, STATS, id);
      expect(f).toBeLessThanOrEqual(prev);
      expect(f).toBeGreaterThanOrEqual(0);
      prev = f;
    }
    // Clamped: a clock that reads before the press never overfills the wipe.
    expect(abilityCooldownFraction(pressedAt - cd, readyAt, STATS, id)).toBe(1);
  });

  it('is FAIL-CLOSED on an unreadable clock or stamp: not ready, full wipe', () => {
    expect(abilityReady(Number.NaN, 1000)).toBe(false);
    expect(abilityReady(1000, Number.NaN)).toBe(false);
    expect(abilityCooldownFraction(Number.NaN, 1000, STATS, 'repair')).toBe(1);
    expect(abilityCooldownFraction(1000, Number.NaN, STATS, 'smoke')).toBe(1);
  });

  it('R3 (kept by Story 10.6) — THE SHIP\'S RELOAD NEVER SHORTENS IT: every hull, under a maxed RELOAD ladder, cools at the zero-card cooldown', () => {
    const hasted = new Array<LineId>(CATALOG.reload.cap).fill('reload');
    for (const hull of SHIP_CLASS_IDS) {
      const stats = effectiveStats(CONFIG.shipClasses[hull], hasted);
      expect(stats.cooldownScale, hull).toBeLessThan(1); // RELOAD does scale the main battery...
      // ...but not the abilities: they cool exactly as an un-hasted neutral hull's.
      for (const id of COOLDOWN_ABILITIES) expect(abilityCooldownMs(stats, id), `${hull} ${id}`).toBe(abilityCooldownMs(STATS, id));
    }
    // Only the abilities' OWN ladders write an ability path (Story 10.6, R8 / R9).
    for (const id of LINE_IDS) {
      for (const tier of CATALOG[id].tiers) {
        for (const e of tier) {
          if (e.kind !== 'stat') continue;
          if (e.path.startsWith('repair.')) expect(id, e.path).toBe('hullRepair');
          if (e.path.startsWith('smoke.')) expect(id, e.path).toBe('smokeScreen');
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
      const readyAt = abilityReadyAt(pressedAt, STATS, id);
      const refusal = (now: number) => (id === 'repair' ? repairRefusal(MAX / 2, MAX, now, readyAt) : smokeRefusal(now, readyAt));
      expect(refusal(pressedAt), id).toBe('cooling');
      expect(refusal(readyAt - 1), id).toBe('cooling');
      expect(refusal(readyAt), id).toBeNull();
    }
    // Cooling outranks full: a press inside the cooldown is `cooling` on any hull.
    expect(repairRefusal(MAX, MAX, pressedAt, abilityReadyAt(pressedAt, STATS, 'repair'))).toBe('cooling');
  });
});
