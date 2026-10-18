// THE RADAR DROPOUT'S SERVER PLUMBING (Story 9.8, epic-9 rulings 121–123):
// the three inputs perception feeds the shared roll beside the observer's id —
// the revolution index (`ShipRecord.sweepRev`), the world seed
// (`World.dropoutSeed`) and the wake ribbons' target keys (`World.wakeKeyOf`).
// The roll itself and its end-to-end agreement with the oracle live in shared
// dropout.test.ts and perception.test.ts; this file pins the contracts the
// roll's determinism and anti-cheat posture rest on.

import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { World } from '../game/world.js';

const DT = CONFIG.tick.simDtMs;

describe('ShipRecord.sweepRev — one revolution per wrap of the beam', () => {
  it('counts WRAPS past 2π: +1 exactly when the angle wraps, never otherwise', () => {
    const w = new World(7);
    const a = w.addShip('a', 'A', undefined, undefined, undefined, undefined);
    expect(a.sweepRev).toBe(0);
    let wraps = 0;
    for (let i = 0; i < 400; i += 1) {
      const before = a.sweepAngle;
      w.step();
      if (a.sweepAngle < before) wraps += 1;
      expect(a.sweepRev, `tick ${i}`).toBe(wraps);
    }
    // 400 ticks at the base period is several whole revolutions — the
    // counter is not vacuous.
    expect(wraps).toBeGreaterThanOrEqual(Math.floor((400 * DT) / a.stats.sweepPeriodMs));
    expect(wraps).toBeGreaterThan(2);
  });

  it('re-anchors to 0 with the beam at a placement edge (respawn)', () => {
    const w = new World(8);
    const a = w.addShip('a', 'A', undefined, undefined, undefined, undefined);
    for (let i = 0; i < 300; i += 1) w.step();
    expect(a.sweepRev).toBeGreaterThan(0);
    w.sinkShip('a');
    for (let i = 0; i < 400 && a.sweepRev !== 0; i += 1) w.step();
    expect(a.sweepRev).toBe(0);
  });

  it('a frozen beam (radar off) never counts a revolution', () => {
    const w = new World(9);
    const a = w.addShip('a', 'A', undefined, undefined, undefined, undefined);
    w.radarEnabled = false;
    for (let i = 0; i < 400; i += 1) w.step();
    expect(a.sweepRev).toBe(0);
  });
});

describe('World.dropoutSeed — SERVER-PRIVATE, never the client-known map seed', () => {
  it('rides the per-room pseudonym entropy: same map seed + different entropy ⇒ different roll seeds', () => {
    const a = new World(42, undefined, undefined, { pseudonymSeed: 1 });
    const b = new World(42, undefined, undefined, { pseudonymSeed: 2 });
    expect(a.dropoutSeed).not.toBe(b.dropoutSeed);
    // Deterministic per inputs (the roll must replay identically everywhere).
    expect(new World(42, undefined, undefined, { pseudonymSeed: 1 }).dropoutSeed).toBe(a.dropoutSeed);
  });

  it('is never the map seed itself', () => {
    for (const seed of [1, 42, 0xdeadbeef]) {
      expect(new World(seed).dropoutSeed).not.toBe(seed >>> 0);
      expect(new World(seed, undefined, undefined, { pseudonymSeed: seed }).dropoutSeed).not.toBe(seed >>> 0);
    }
  });
});

describe('World.wakeKeyOf — the water rolls under its SOURCE id', () => {
  it("a hull's ribbon reads the ship id, and the key survives the ribbon being replaced", () => {
    const w = new World(11);
    const a = w.addShip('a', 'A', undefined, undefined, undefined, undefined);
    expect(w.wakeKeyOf(a.wake)).toBe('a');
    const first = a.wake;
    w.sinkShip('a');
    for (let i = 0; i < 400 && a.wake === first; i += 1) w.step();
    // The fresh ribbon a new life gets is keyed too.
    expect(w.wakeKeyOf(a.wake)).toBe('a');
  });

  it('a ribbon the World never registered reads the empty key (deterministic, never a throw)', () => {
    const w = new World(12);
    const a = w.addShip('a', 'A', undefined, undefined, undefined, undefined);
    expect(w.wakeKeyOf({ ...a.wake })).toBe('');
  });
});
