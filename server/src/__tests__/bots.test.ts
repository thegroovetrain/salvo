// COMBAT-BOT DRIVER — wave-1 coverage (Story 6.4): the perception cadence,
// the narrow port, the per-bot state lifecycle and the neutral input
// emission. Wave 2 owns behaviour (targeting, steering, firing, spending);
// nothing here asserts what a bot WANTS — only that the chokepoint plumbing
// is right:
//   * observe() is called AT MOST ONCE per bot per tick, on a staggered
//     round-robin averaging one call per bot per observeCadenceMs — the pin
//     that makes observe()'s observer-state mutation (seenBallistics/
//     torpDirs) the bot's own exactly-once reveal memory rather than a
//     hazard;
//   * bot input rides the SAME validated store humans use and is consumed
//     the SAME tick (botsTick sits immediately before applyInputs);
//   * the frozen boarding room no-ops the brain (no observe, neutral input,
//     fireSeq never advances);
//   * a non-afloat bot goes silent and releases its view state;
//   * enrollment (class / profile / callsign off the decorrelated seeded
//     stream) is deterministic per world seed and collision-free.

import { describe, it, expect } from 'vitest';
import { CONFIG, SHIP_CLASS_IDS, isAfloat } from '@salvo/shared';
import { World } from '../game/world.js';
import { botPhase } from '../game/ai/botDriver.js';
import { isFleetHull, isHuman, isParticipant } from '../game/participants.js';

/** The observe round-robin window in ticks — recomputed here independently
 *  (250ms / 50ms = 5) so a CONFIG retune fails loudly instead of silently
 *  rescaling every expectation below. */
const CADENCE_TICKS = Math.max(1, Math.round(CONFIG.bots.observeCadenceMs / CONFIG.tick.simDtMs));

function botWorld(seed: number, bots: number): { w: World; ids: string[] } {
  const w = new World(seed);
  w.map.islands.length = 0; // open water: spawn placement never retries ashore
  const ids: string[] = [];
  for (let i = 0; i < bots; i += 1) ids.push(w.addBot().id);
  return { w, ids };
}

describe('CONFIG.bots — the tuning panel exists and carries exactly its ruled knobs', () => {
  it('pins the key set (a knob added or dropped is a reviewed edit, not drift)', () => {
    expect(Object.keys(CONFIG.bots).sort()).toEqual([
      'aimScatterRefU',
      'aimScatterU',
      'boonWeights',
      'callsigns',
      'contactMemoryMs',
      'disengageHpFrac',
      'healHpFrac',
      'observeCadenceMs',
      'profiles',
      'reactionMs',
      'stuckMs',
    ]);
  });

  it('profiles: 2 per class, every class covered; callsigns: ~30, unique', () => {
    expect(Object.keys(CONFIG.bots.profiles).sort()).toEqual([...SHIP_CLASS_IDS].sort());
    for (const cls of SHIP_CLASS_IDS) expect(CONFIG.bots.profiles[cls].length).toBe(2);
    expect(CONFIG.bots.callsigns.length).toBeGreaterThanOrEqual(30);
    expect(new Set(CONFIG.bots.callsigns).size).toBe(CONFIG.bots.callsigns.length);
  });

  it('boonWeights cover every class over that class\'s drawable categories', () => {
    // Universal categories (intel/ship/guns) + the class arsenal's own —
    // the weight table must speak the deck's vocabulary or spending.ts
    // (wave 2) scores offered cards at weight-undefined.
    expect(Object.keys(CONFIG.bots.boonWeights).sort()).toEqual([...SHIP_CLASS_IDS].sort());
    for (const cls of SHIP_CLASS_IDS) {
      const w = CONFIG.bots.boonWeights[cls] as Record<string, number>;
      for (const cat of ['intel', 'ship', 'guns']) expect(w[cat]).toBeGreaterThan(0);
    }
    expect((CONFIG.bots.boonWeights.torpedoBoat as Record<string, number>).torpedoes).toBeGreaterThan(0);
    expect((CONFIG.bots.boonWeights.battleship as Record<string, number>).cannon).toBeGreaterThan(0);
    expect((CONFIG.bots.boonWeights.mineLayer as Record<string, number>).mines).toBeGreaterThan(0);
  });
});

describe('addBot — an AI captain through the ordinary addShip path', () => {
  it('stamps role bot: a participant, never a human, never fleet content', () => {
    const { w, ids } = botWorld(11, 1);
    const rec = w.ships.get(ids[0])!;
    expect(rec.role).toBe('bot');
    expect(isParticipant(rec)).toBe(true);
    expect(isHuman(rec)).toBe(false); // FR34: a bot can never arm a countdown
    expect(isFleetHull(rec)).toBe(false);
  });

  it('ids are namespaced bot-N; class is a real ship class; the deck is real', () => {
    const { w, ids } = botWorld(12, 3);
    expect(ids).toEqual(['bot-1', 'bot-2', 'bot-3']);
    for (const id of ids) {
      const rec = w.ships.get(id)!;
      expect(SHIP_CLASS_IDS).toContain(rec.hullId);
      // ECONOMY: a bot is a participant that plays the game — it draws a real
      // boon deck (fleet hulls get EMPTY_DECK; the addShip comment pins this).
      expect(rec.deck.cards.length).toBeGreaterThan(0);
    }
  });

  it('callsigns come from the CONFIG pool without repeat, suffixing past exhaustion', () => {
    const pool = new Set<string>(CONFIG.bots.callsigns);
    const n = CONFIG.bots.callsigns.length;
    const { w, ids } = botWorld(13, n + 3);
    const names = ids.map((id) => w.ships.get(id)!.name);
    expect(new Set(names).size).toBe(names.length); // all unique, even wrapped
    for (const name of names.slice(0, n)) expect(pool.has(name)).toBe(true);
    for (const name of names.slice(n)) expect(name.endsWith(' 2')).toBe(true);
  });

  it('profile assignment matches the bot\'s own class table', () => {
    const { w, ids } = botWorld(14, 8);
    for (const id of ids) {
      const rec = w.ships.get(id)!;
      const table: readonly string[] = CONFIG.bots.profiles[rec.hullId as keyof typeof CONFIG.bots.profiles];
      expect(table).toContain(w.bots.profileOf(id));
    }
  });

  it('enrollment is deterministic per world seed (the decorrelated stream)', () => {
    const a = botWorld(21, 5);
    const b = botWorld(21, 5);
    const roll = ({ w, ids }: { w: World; ids: string[] }): Array<[string, string, string | null]> =>
      ids.map((id) => [w.ships.get(id)!.name, w.ships.get(id)!.hullId, w.bots.profileOf(id)]);
    expect(roll(a)).toEqual(roll(b));
  });
});

describe('the observe cadence — staggered round-robin, at most once per bot per tick', () => {
  it('per-tick observe counts equal the id-hash phase histogram: spread, never bunched', () => {
    const BOTS = 19;
    const TICKS = 50;
    const { w, ids } = botWorld(31, BOTS);
    // The independent expectation: a bot with phase p observes exactly when
    // (controllerTick + p) % CADENCE_TICKS === 0. botPhase is exported pure
    // so the test computes the histogram without touching driver internals.
    const phases = ids.map((id) => botPhase(id, CADENCE_TICKS));
    const perTick: number[] = [];
    for (let t = 1; t <= TICKS; t += 1) {
      w.step();
      perTick.push(w.bots.observesLastTick);
      const expected = phases.filter((p) => (t + p) % CADENCE_TICKS === 0).length;
      expect(w.bots.observesLastTick).toBe(expected);
    }
    // On average one observe per bot per cadence window: 19 bots × 10 windows.
    const total = perTick.reduce((a, b) => a + b, 0);
    expect(total).toBe(BOTS * (TICKS / CADENCE_TICKS));
    // The stagger is real: no tick carries the whole roster (bunching), and
    // every tick carries someone (all phase buckets are populated at 19 ids).
    expect(Math.max(...perTick)).toBeLessThan(BOTS);
    expect(Math.min(...perTick)).toBeGreaterThan(0);
    // At most once per bot per tick, by counting: a double-observe would
    // push some tick above its own phase-bucket size, already asserted equal.
  });

  it('each bot observes exactly once per cadence window, timestamped at capture', () => {
    const { w, ids } = botWorld(32, 4);
    // After one full window every bot has observed exactly once (viewAt set),
    // and the stamp advances by exactly one window thereafter.
    for (let t = 0; t < CADENCE_TICKS; t += 1) w.step();
    const first = ids.map((id) => w.bots.viewAtOf(id));
    for (const at of first) expect(at).toBeGreaterThan(0);
    for (let t = 0; t < CADENCE_TICKS; t += 1) w.step();
    const second = ids.map((id) => w.bots.viewAtOf(id));
    second.forEach((at, i) => {
      expect(at - first[i]).toBe(CADENCE_TICKS * CONFIG.tick.simDtMs);
    });
  });
});

describe('input emission — the same validated path a human uses, same-tick consumption', () => {
  it('neutral input flows every tick and is consumed the tick it is written', () => {
    const { w, ids } = botWorld(41, 3);
    w.step();
    for (const id of ids) {
      const rec = w.ships.get(id)!;
      // botsTick sits immediately before applyInputs: the very first tick's
      // input is already acked — never a 50ms-stale echo.
      expect(rec.lastAckSeq).toBe(1);
      expect(rec.input.throttle).toBe(0);
      expect(rec.input.rudder).toBe(0);
      expect(rec.input.fireSeq).toBe(0);
      expect(rec.input.hornSeq).toBe(0); // bots never honk (B5)
      expect(rec.input.fireT).toBe(0); // server-driven shooters never back-date
    }
    for (let t = 0; t < 9; t += 1) w.step();
    for (const id of ids) {
      const rec = w.ships.get(id)!;
      expect(rec.lastAckSeq).toBe(10); // strictly-increasing seq, one per tick
      expect(rec.state.speed).toBe(0); // wave 1 is neutral: throttle 0 holds
    }
    expect(w.shells.size).toBe(0); // wave 1 never fires
  });

  it('THE BOARDING FREEZE: helm disabled → no observe, neutral input, fireSeq frozen', () => {
    const { w, ids } = botWorld(42, 5);
    w.helmEnabled = false;
    for (let t = 0; t < CADENCE_TICKS * 3; t += 1) {
      w.step();
      expect(w.bots.observesLastTick).toBe(0); // the brain no-ops: zero observes
    }
    for (const id of ids) {
      const rec = w.ships.get(id)!;
      expect(w.bots.viewAtOf(id)).toBe(-1); // never observed
      expect(rec.lastAckSeq).toBeGreaterThan(0); // the seq stream stays warm
      expect(rec.input.fireSeq).toBe(0); // never advances while frozen
    }
    // Thaw: observes resume on the very next due tick.
    w.helmEnabled = true;
    for (let t = 0; t < CADENCE_TICKS; t += 1) w.step();
    for (const id of ids) expect(w.bots.viewAtOf(id)).toBeGreaterThan(0);
  });
});

describe('state lifecycle — created with the ship, silent while down, released with it', () => {
  it('a sinking bot emits nothing and releases its perception state', () => {
    const { w, ids } = botWorld(51, 2);
    const [downId, upId] = ids;
    for (let t = 0; t < CADENCE_TICKS; t += 1) w.step();
    expect(w.bots.viewAtOf(downId)).toBeGreaterThan(0);
    w.sinkShip(downId);
    const down = w.ships.get(downId)!;
    expect(isAfloat(down.lifecycle)).toBe(false);
    const ackAtSink = down.lastAckSeq;
    for (let t = 0; t < CADENCE_TICKS * 2; t += 1) w.step();
    expect(down.lastAckSeq).toBe(ackAtSink); // emits nothing while down
    expect(w.bots.viewAtOf(downId)).toBe(-1); // view state released
    // The other bot is untouched: still observing, still submitting.
    expect(w.bots.viewAtOf(upId)).toBeGreaterThan(0);
    expect(w.ships.get(upId)!.lastAckSeq).toBeGreaterThan(ackAtSink);
  });

  it('removeShip releases the mind (and an unknown id never crashes the tick)', () => {
    const { w, ids } = botWorld(52, 3);
    expect(w.bots.size).toBe(3);
    w.removeShip(ids[1]);
    expect(w.bots.size).toBe(2);
    w.step(); // the survivors keep driving; no orphaned mind throws
    expect(w.bots.observesLastTick).toBeLessThanOrEqual(2);
  });
});
