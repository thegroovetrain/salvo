// STORY 10.12 — THE PERSONALITY TRAITS (Eric 2026-11-11, epic-10 amendment
// 21): the two HULL REPAIR styles (R3, ai/abilities.ts) and the weighted
// Shift roll (R5, ai/profiles.ts rollShift). Contracts only: every heal is
// read off the bot's own folded stats, every line off its profile, the
// weight off CONFIG — no ruled number and no seed-produced value is pinned.

import { describe, expect, it } from 'vitest';
import { CONFIG, SHIFT_IDS, abilityReadyAt, mulberry32, transitionLifecycle, type ShiftId, type ShipClassId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { situationOf } from '../game/ai/tactics.js';
import { ABILITY_WANTS } from '../game/ai/abilities.js';
import { BOT_PROFILES, TEST_PROFILES, profileOf, rollShift } from '../game/ai/profiles.js';
import type { TacticContext } from '../game/ai/tacticKit.js';
import type { BotMind, BotPosture, BotProfileId, BotWorldPort } from '../game/ai/types.js';

function fakePort(w: World): BotWorldPort & { now: number } {
  return {
    now: 100000,
    map: w.map,
    zoneLiveRing: { cx: 0, cy: 0, r: w.map.radius * 4 },
    zoneEndgameReached: false,
    helmEnabled: true,
    submitInput: () => true,
    spendPoint: () => true,
    zoneNextRing: () => null,
    zonePhase: () => ({ phase: 'idle', closesInMs: null }),
    zoneSafeDisc() {
      return this.zoneLiveRing;
    },
  };
}

function mkMind(profile: BotProfileId): BotMind {
  return {
    rng: mulberry32(7),
    spendRng: mulberry32(8),
    seq: 0,
    fireSeq: 0,
    actSeq: 0,
    profile,
    phase: 0,
    view: null,
    viewAt: -1,
    contacts: new Map(),
    wakeCells: [],
    lastSweep: -1,
    targetKey: null,
    posture: 'reposition',
    stuckMs: 0,
    unbeachUntil: 0,
  };
}

function mkBot(w: World, hullId: ShipClassId = 'bismarck'): ShipRecord {
  const rec = w.addShip(`b-${w.ships.size + 1}`, 'TESTER', 'bot', hullId, undefined, { x: 0, y: 0 });
  rec.state.speed = 0;
  return rec;
}

const byStyle = (style: 'early' | 'late'): BotProfileId[] =>
  CONFIG.bots.profiles.filter((id) => profileOf(id).repairStyle === style);

/** hp — everything one press heals, off the hull's own folded stats. */
const onePress = (rec: ShipRecord): number => rec.stats.repair.instantHp + rec.stats.repair.regenHp;

describe('HULL REPAIR — the two styles (Story 10.12, R3)', () => {
  const w = new World(1212, 8);
  w.map.islands.length = 0;
  const port = fakePort(w);
  const wants = (rec: ShipRecord, profile: BotProfileId, posture: BotPosture = 'engage'): boolean => {
    const mind = mkMind(profile);
    const ctx: TacticContext = { self: rec, mind, sit: situationOf(rec, mind, port), port, target: null, posture, slot: 0 };
    return ABILITY_WANTS.repair(ctx);
  };

  it('both styles are dealt, every in-game row names one', () => {
    expect(byStyle('early').length).toBeGreaterThan(0);
    expect(byStyle('late').length).toBeGreaterThan(0);
    expect(byStyle('early').length + byStyle('late').length).toBe(CONFIG.bots.profiles.length);
  });

  it('EARLY presses exactly when the unmended hull holds one whole press\'s heal (no waste)', () => {
    for (const id of byStyle('early')) {
      const rec = mkBot(w);
      expect(onePress(rec)).toBeGreaterThan(0);
      rec.hp = rec.stats.maxHp - onePress(rec); // at the full-heal deficit
      expect(wants(rec, id), id).toBe(true);
      rec.hp = rec.stats.maxHp - onePress(rec) + 1; // just short of it
      expect(wants(rec, id), id).toBe(false);
    }
  });

  it('EARLY counts the heal already owed: the paid pool is hp on its way', () => {
    for (const id of byStyle('early')) {
      const rec = mkBot(w);
      const owed = rec.stats.repair.regenHp / 2;
      rec.hp = rec.stats.maxHp - onePress(rec);
      rec.repairHp = owed;
      expect(wants(rec, id), id).toBe(false);
      rec.hp -= owed; // the deficit beyond what is owed fits a whole press again
      expect(wants(rec, id), id).toBe(true);
    }
  });

  it('LATE presses under the break-off line, never above it while fighting', () => {
    for (const id of byStyle('late')) {
      const rec = mkBot(w);
      const line = profileOf(id).disengageHpFrac * rec.stats.maxHp;
      rec.hp = line + 1; // above the line, well short of full
      expect(rec.stats.maxHp - rec.hp).toBeGreaterThan(0);
      expect(wants(rec, id, 'engage'), id).toBe(false);
      rec.hp = line - 1;
      expect(wants(rec, id, 'engage'), id).toBe(true);
    }
  });

  it('LATE presses on the way out — disengage or ram — whatever the hull reads, while something is unmended', () => {
    for (const id of byStyle('late')) {
      const rec = mkBot(w);
      rec.hp = rec.stats.maxHp - 1;
      for (const posture of ['disengage', 'ram'] as const) expect(wants(rec, id, posture), `${id} ${posture}`).toBe(true);
      for (const posture of ['engage', 'pursue', 'kite', 'farm', 'reposition'] as const) {
        expect(wants(rec, id, posture), `${id} ${posture}`).toBe(false);
      }
    }
  });

  it('LATE counts the heal already owed: a pool covering the whole deficit presses nothing', () => {
    for (const id of byStyle('late')) {
      const rec = mkBot(w);
      rec.hp = profileOf(id).disengageHpFrac * rec.stats.maxHp - 1;
      rec.repairHp = rec.stats.maxHp - rec.hp;
      expect(wants(rec, id, 'disengage'), id).toBe(false);
      rec.repairHp = rec.stats.maxHp - rec.hp - 1;
      expect(wants(rec, id, 'disengage'), id).toBe(true);
    }
  });

  it('both styles respect the shared refusal (cooling) and the afloat guard', () => {
    for (const id of CONFIG.bots.profiles) {
      const rec = mkBot(w);
      rec.hp = 1;
      expect(wants(rec, id, 'disengage'), id).toBe(true);
      rec.repairReadyAt = abilityReadyAt(port.now, rec.stats, 'repair');
      expect(wants(rec, id, 'disengage'), `${id} cooling`).toBe(false);
      rec.repairReadyAt = 0;
      rec.lifecycle = transitionLifecycle(rec.lifecycle, 'sink', port.now);
      expect(wants(rec, id, 'disengage'), `${id} sinking`).toBe(false);
    }
  });
});

/** An injected stream that hands out `u` on every draw. */
const fixed = (u: number): { next: () => number } => ({ next: () => u });

describe('rollShift — the weighted Shift roll (Story 10.12, R5)', () => {
  const rows = [...Object.values(BOT_PROFILES), ...Object.values(TEST_PROFILES)];
  const w = CONFIG.bots.shiftFitWeight;

  it('a draw under the weight deals the fitting Shift', () => {
    for (const p of rows) {
      expect(rollShift(p, fixed(0)), p.id).toBe(p.shiftFit);
      expect(rollShift(p, fixed(w / 2)), p.id).toBe(p.shiftFit);
      expect(rollShift(p, fixed(w - 1e-9)), p.id).toBe(p.shiftFit);
    }
  });

  it('above the weight the OTHER Shifts split the rest evenly, and the fit never comes up', () => {
    const N = 3000;
    for (const p of rows) {
      const count = new Map<ShiftId, number>();
      for (let i = 0; i < N; i += 1) {
        const s = rollShift(p, fixed((i + 0.5) / N));
        count.set(s, (count.get(s) ?? 0) + 1);
      }
      // Total over ShiftId: every Shift is dealt somewhere on the unit interval.
      expect([...count.keys()].sort(), p.id).toEqual([...SHIFT_IDS].sort());
      expect(Math.abs((count.get(p.shiftFit) ?? 0) / N - w), p.id).toBeLessThanOrEqual(1 / N);
      const others = SHIFT_IDS.filter((id) => id !== p.shiftFit).map((id) => count.get(id) ?? 0);
      expect(Math.max(...others) - Math.min(...others), p.id).toBeLessThanOrEqual(1);
      // Draws above the weight never deal the fit.
      for (let i = 0; i < 50; i += 1) expect(rollShift(p, fixed(w + ((1 - w) * (i + 0.5)) / 50)), p.id).not.toBe(p.shiftFit);
    }
  });

  it('draws exactly once', () => {
    let draws = 0;
    rollShift(BOT_PROFILES.raider, { next: () => (draws += 1, 0.9) });
    expect(draws).toBe(1);
  });
});
