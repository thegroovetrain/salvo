// COMBAT-BOT DRIVER — wave-1 coverage (Story 6.4): perception, the narrow
// port, the per-bot state lifecycle and the neutral input emission. Wave 2
// owns behaviour (targeting, steering, firing, spending); nothing here
// asserts what a bot WANTS — only that the chokepoint plumbing is right:
//   * observe() is called EXACTLY ONCE per live bot per tick, EVERY tick —
//     the exactly-once-and-always pin (review-gate FIX 1: one-tick signals
//     alias against the sweep period under any sampling cadence, so a bot's
//     perception is never a sampled subset). The exactly-once half is what
//     makes observe()'s observer-state mutation (seenBallistics/torpDirs)
//     the bot's own exactly-once reveal memory rather than a hazard; only
//     DELIBERATION runs on the CONFIG.bots.decisionCadenceMs stagger;
//   * bot input rides the SAME validated store humans use and is consumed
//     the SAME tick (botsTick sits immediately before applyInputs);
//   * the frozen boarding room no-ops the brain (no observe, neutral input,
//     fireSeq never advances);
//   * a non-afloat bot goes silent and releases its per-life state;
//   * enrollment (class / profile / callsign off the decorrelated seeded
//     stream) is deterministic per world seed and collision-free;
//   * ai/'s import surface cannot regrow the doors the review gate removed
//     (world.js, a value import of perception.js, observeSpectator).

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CONFIG, SHIFT_IDS, SHIP_CLASS_IDS, abilityCode, effectiveStats, isAfloat, type Rng, type ShiftId } from '@salvo/shared';
import { World } from '../game/world.js';
import { flatRaster } from './islandFixture.js';
import { BotController, botPhase } from '../game/ai/botDriver.js';
import { profileOf } from '../game/ai/profiles.js';
import type { BotWorldPort } from '../game/ai/types.js';
import { isHuman, isParticipant } from '../game/participants.js';

/** The DELIBERATION round-robin window in ticks — recomputed here
 *  independently (250ms / 50ms = 5) so a CONFIG retune fails loudly instead
 *  of silently rescaling every expectation below. */
const CADENCE_TICKS = Math.max(1, Math.round(CONFIG.bots.decisionCadenceMs / CONFIG.tick.simDtMs));

function botWorld(seed: number, bots: number): { w: World; ids: string[] } {
  const w = new World(seed);
  w.map.islands.length = 0; // open water: spawn placement never retries ashore
  const ids: string[] = [];
  // Bots sail the hull's default deck (Story 8.2) — the resolver the arena
  // passes is the loader, which answers exactly this with no account module.
  for (let i = 0; i < bots; i += 1) ids.push(w.addBot(undefined, undefined).id);
  return { w, ids };
}

describe('CONFIG.bots — the un-beach maneuver is a set of relations, not three unrelated knobs', () => {

  // THE UN-BEACH MANOEUVRE'S FOUR NUMBERS, and the relations between them that
  // make it a manoeuvre rather than three unrelated knobs. It ran on ONE
  // (`stuckMs`, arming dwell AND burst length at once), which is why the
  // heaviest hull never got off: 1500ms of full astern is shorter than the
  // 0.97s a Battleship spends killing its forward way at the grounding cap,
  // so its measured net displacement over one burst was +3.21u — deeper in.
  it('the un-beach constants clear the BATTLESHIP\'s own reverse kinematics', () => {
    const bs = effectiveStats(CONFIG.shipClasses.yamato).kinematics;
    // Re-derived here from the hull's kinematics, independently of the
    // comment in constants.ts: kill the forward way the grounding cap leaves
    // on (decel), then build sternway (accel) far enough to satisfy the
    // clearance condition. A kinematics retune that outran the ceiling would
    // silently re-ship the defect.
    const killWayS = (bs.maxSpeed * CONFIG.ship.islandSpeedMult) / bs.decel;
    const toFullAsternS = bs.reverseSpeed / bs.accel;
    const runUpU = 0.5 * bs.accel * toFullAsternS * toFullAsternS;
    expect(runUpU).toBeLessThan(CONFIG.bots.unbeachClearU); // else the sums below are the wrong shape
    const clearS = killWayS + toFullAsternS + (CONFIG.bots.unbeachClearU - runUpU) / bs.reverseSpeed;
    expect(clearS * 1000).toBeLessThanOrEqual(CONFIG.bots.unbeachAsternMaxMs);
    // The old single-constant burst could NOT do it — the whole defect in one
    // assertion.
    expect(clearS * 1000).toBeGreaterThan(CONFIG.bots.stuckMs);
    // The hold must outlast the astern -> ahead turnaround, or the exit
    // heading is abandoned before the hull has any way on to hold it with.
    const turnaroundS = bs.reverseSpeed / bs.decel + bs.steerageSpeed / bs.accel;
    expect(turnaroundS * 1000).toBeLessThan(CONFIG.bots.unbeachHoldMs);
    // And no hull can satisfy the clearance condition by carrying FORWARD
    // after the astern order — the reason plain displacement is a safe
    // stand-in for sternway made good.
    for (const cls of SHIP_CLASS_IDS) {
      const k = effectiveStats(CONFIG.shipClasses[cls]).kinematics;
      const cap = k.maxSpeed * CONFIG.ship.islandSpeedMult;
      expect((cap * cap) / (2 * k.decel)).toBeLessThan(CONFIG.bots.unbeachClearU);
    }
  });

  it('profiles: the flat five, in dealing order; callsigns: ~30, unique', () => {
    // Story 8.20 (Eric ruling 2026-09-30, R6): personalities are no longer
    // per hull. The order is the dealing order the seeded pick indexes into.
    // Story 10.12 (Eric 2026-11-11, R6): `forager` retired.
    expect([...CONFIG.bots.profiles]).toEqual(['raider', 'duelist', 'bulwark', 'siege', 'trapper']);
    expect(CONFIG.bots.callsigns.length).toBeGreaterThanOrEqual(30);
    expect(new Set(CONFIG.bots.callsigns).size).toBe(CONFIG.bots.callsigns.length);
  });

});

describe('addBot — an AI captain through the ordinary addShip path', () => {
  it('stamps role bot: a participant, never a human', () => {
    const { w, ids } = botWorld(11, 1);
    const rec = w.ships.get(ids[0])!;
    expect(rec.role).toBe('bot');
    expect(isParticipant(rec)).toBe(true);
    expect(isHuman(rec)).toBe(false); // FR34: a bot can never arm a countdown
  });

  it('ids are namespaced bot-N; class is a real ship class; the economy is real', () => {
    const { w, ids } = botWorld(12, 3);
    expect(ids).toEqual(['bot-1', 'bot-2', 'bot-3']);
    for (const id of ids) {
      const rec = w.ships.get(id)!;
      expect(SHIP_CLASS_IDS).toContain(rec.hullId);
      // ECONOMY: a bot is a participant that plays the game — it draws from
      // the SAME common pool a human draws from (Story 8.14), on its own
      // private stream, with the main battery in slot 0 and the Shift its
      // enrollment dealt (Story 10.12 — no caller passed one).
      expect(SHIFT_IDS).toContain(rec.shift);
      expect(rec.loadout[1].equipmentId).toBe(rec.shift);
      expect(rec.loadout[0].equipmentId).toBe('mainBattery');
      expect(w.weightsFor(rec).size).toBe(0); // nothing taken yet
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

  it('profile assignment comes from the flat in-game list, never a test row', () => {
    const { w, ids } = botWorld(14, 8);
    const table: readonly string[] = CONFIG.bots.profiles;
    for (const id of ids) expect(table).toContain(w.bots.profileOf(id));
  });

  it('HULL UNLOCK: 600 seeded enrollments put every personality on every hull', () => {
    // Story 8.20 (Eric ruling 2026-09-30, R6): any personality on any hull.
    // The controller alone (enroll never touches the port): 600 hulls would
    // not fit a World's arena.
    const ctl = new BotController({} as BotWorldPort, 15);
    const seen = new Set<string>();
    for (let i = 0; i < 600; i += 1) {
      const id = `bot-${i}`;
      const { hullId } = ctl.enroll(id);
      seen.add(`${ctl.profileOf(id)}@${hullId}`);
    }
    for (const p of CONFIG.bots.profiles) {
      for (const cls of SHIP_CLASS_IDS) expect(seen.has(`${p}@${cls}`), `${p}@${cls}`).toBe(true);
    }
  });

  it('a forced TEST row stays hull-bound; a forced in-game personality never decides the hull', () => {
    const w = new World(16);
    w.map.islands.length = 0;
    const testRow = w.addBot(undefined, 'randomYamato');
    expect(testRow.hullId).toBe('yamato');
    expect(w.bots.profileOf(testRow.id)).toBe('randomYamato');
    expect(w.addBot('bismarck', 'randomWarspite').hullId).toBe('warspite');
    const forced = w.addBot('warspite', 'raider');
    expect(forced.hullId).toBe('warspite');
    expect(w.bots.profileOf(forced.id)).toBe('raider');
  });

  it('enrollment is deterministic per world seed (the decorrelated stream)', () => {
    const a = botWorld(21, 5);
    const b = botWorld(21, 5);
    const roll = ({ w, ids }: { w: World; ids: string[] }): Array<[string, string, string | null, string]> =>
      ids.map((id) => [w.ships.get(id)!.name, w.ships.get(id)!.hullId, w.bots.profileOf(id), w.ships.get(id)!.shift]);
    expect(roll(a)).toEqual(roll(b));
  });

  // THE WEIGHTED SHIFT (Story 10.12, Eric 2026-11-11, R5) is dealt off a
  // stream of its OWN: the controller stream still carries exactly the class
  // roll and the personality roll per enrollment, so class / profile /
  // callsign order are what they were before the Shift was dealt here.
  it('the Shift draw takes nothing from the controller stream: one class roll and one personality roll per enrollment', () => {
    const ctl = new BotController({} as BotWorldPort, 31);
    const seat = ctl as unknown as { rng: Rng };
    const inner = seat.rng;
    let draws = 0;
    seat.rng = {
      next: () => (draws += 1, inner.next()),
      float: (a, b) => (draws += 1, inner.float(a, b)),
      int: (a, b) => (draws += 1, inner.int(a, b)),
      pick: (arr) => (draws += 1, inner.pick(arr)),
    };
    const ref = new BotController({} as BotWorldPort, 31);
    for (let i = 0; i < 12; i += 1) {
      const before = draws;
      const got = ctl.enroll(`bot-${i}`);
      expect(draws - before).toBe(2); // the class roll + the personality roll
      const want = ref.enroll(`bot-${i}`);
      expect(got).toEqual(want);
      expect(ctl.profileOf(`bot-${i}`)).toBe(ref.profileOf(`bot-${i}`));
    }
  });

  it('the dealt Shift is each personality\'s fitting one more often than any other', () => {
    const ctl = new BotController({} as BotWorldPort, 32);
    const tally = new Map<string, Map<ShiftId, number>>();
    for (let i = 0; i < 600; i += 1) {
      const id = `bot-${i}`;
      const { shift } = ctl.enroll(id);
      const p = ctl.profileOf(id)!;
      const row = tally.get(p) ?? new Map<ShiftId, number>();
      row.set(shift, (row.get(shift) ?? 0) + 1);
      tally.set(p, row);
    }
    for (const p of CONFIG.bots.profiles) {
      const row = tally.get(p)!;
      const fit = profileOf(p).shiftFit;
      for (const other of SHIFT_IDS) if (other !== fit) expect(row.get(fit) ?? 0, `${p}: ${fit} vs ${other}`).toBeGreaterThan(row.get(other) ?? 0);
    }
  });

  it('a caller\'s explicit Shift is FORCED; forcing moves no later enrollment', () => {
    for (const forced of SHIFT_IDS) {
      const w = new World(33);
      w.map.islands.length = 0;
      expect(w.addBot(undefined, undefined, forced).shift).toBe(forced);
    }
    const a = new World(34);
    a.map.islands.length = 0;
    const b = new World(34);
    b.map.islands.length = 0;
    const first = a.addBot(undefined, undefined);
    const other = SHIFT_IDS.find((id) => id !== first.shift)!;
    b.addBot(undefined, undefined, other);
    const nextA = a.addBot(undefined, undefined);
    const nextB = b.addBot(undefined, undefined);
    expect([nextB.name, nextB.hullId, nextB.shift]).toEqual([nextA.name, nextA.hullId, nextA.shift]);
  });
});

describe('perception — exactly once per live bot, EVERY tick (the FIX-1 pin)', () => {
  // THE PIN THE REVIEW GATE REWROTE. Wave 1 observed 1 tick in 5 on a
  // stagger, and both adversarial reviewers independently proved that loses
  // SIGNAL, not freshness: blips and hc/sp/sunk live for one tick, and every
  // reachable sweep rate has a revolution ≡ 0 (mod 5) — 15 rpm = 80 ticks,
  // 30 rpm = 40, 20 rpm = 60 — so a fixed bearing painted on one tick-phase
  // forever and a bot whose hashed slot missed it was PERMANENTLY blind to
  // it (measured: 30 paints over 2400 ticks, 0 caught). Perception is now
  // per-tick — the human client contract — and only DELIBERATION is
  // cadence-gated.
  it('observesLastTick equals the live-bot count on every single tick', () => {
    const BOTS = 19;
    const TICKS = 50;
    const { w } = botWorld(31, BOTS);
    let total = 0;
    for (let t = 1; t <= TICKS; t += 1) {
      w.step();
      expect(w.bots.observesLastTick).toBe(BOTS); // once and ALWAYS, per bot
      total += w.bots.observesLastTick;
    }
    // ...and never more than once per bot per tick, by counting.
    expect(total).toBe(BOTS * TICKS);
  });

  it('every bot\'s view is timestamped at THIS tick, every tick', () => {
    const { w, ids } = botWorld(32, 4);
    for (let t = 0; t < CADENCE_TICKS * 2; t += 1) {
      w.step();
      for (const id of ids) expect(w.bots.viewAtOf(id)).toBe(w.now);
    }
  });

  it('the DELIBERATION stagger spreads bots across the cadence window', () => {
    // botPhase is exported pure so this histogram needs no driver internals:
    // with bot-1..bot-19 at cadence 5 every slot is populated and none holds
    // the whole roster — scoring work is spread, never bunched.
    const phases = Array.from({ length: 19 }, (_, i) => botPhase(`bot-${i + 1}`, CADENCE_TICKS));
    const buckets = Array.from({ length: CADENCE_TICKS }, (_, s) => phases.filter((p) => p === s).length);
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(19);
    expect(Math.max(...buckets)).toBeLessThan(19);
    expect(Math.min(...buckets)).toBeGreaterThan(0);
    for (const p of phases) expect(p).toBeGreaterThanOrEqual(0);
    for (const p of phases) expect(p).toBeLessThan(CADENCE_TICKS);
  });

  // THE RESONANCE REGRESSION (review-gate FIX 1) — fails on the wave-1
  // observe cadence, passes on per-tick perception. A stationary hull sits in
  // the bot's radar annulus (midway between the plain-hull sight and the
  // radar reach — past BOTH eye tiers, so radar alone can hold it; every
  // in-range, swept, unshadowed hull paints every sweep, Story 11.2, R8) on
  // open water, the two hulls astride the map centre of the real board (the
  // annulus is wider than a small board); at the base 15 rpm the sweep paints its bearing once per 80
  // ticks, always on the same tick-phase (80 ≡ 0 mod 5). bot-1's hashed slot
  // is 2 and — measured before the fix — NO bearing's paint phase lands on
  // it at this seed (successive 45° bearings are 10 ticks of sweep apart,
  // 10 ≡ 0 mod 5, so all bearings share one phase): the old driver held a
  // track for 0 of 2000 measured ticks. Per-tick observation must hold one
  // essentially continuously (contactMemoryMs 8000 far exceeds the 4s
  // revolution).
  it('a stationary hull in the radar annulus is TRACKED despite sweep aliasing', () => {
    const w = new World(61, CONFIG.map.playerCap);
    w.map.islands.length = 0; // open water: LOS/shadow can never gate the paint
    w.map.heightRaster = flatRaster(); // ...and no retained elevation shadows the long ray across the board
    const bot = w.addBot(undefined, undefined);
    expect(bot.id).toBe('bot-1');
    const apart = (bot.stats.hullSightRange + bot.stats.radarRange) / 2;
    expect(apart / 2).toBeLessThan(w.map.radius); // both stations are on the board
    const bx = -apart / 2;
    const tx = apart / 2;
    const ty = 0;
    const tgt = w.addShip('victim', 'TARGET', 'captain', 'yamato', undefined, { x: tx, y: ty });
    let measured = 0;
    let tracked = 0;
    for (let t = 0; t < 2400; t += 1) {
      // Hold the geometry: the drill is about perception, not pilotage. The
      // bot's pools are drained so it never sinks the subject, and both hulls
      // are re-pinned after each step.
      for (const s of bot.loadout) if (s.state) s.state.n = 0;
      w.step();
      bot.state.x = bx;
      bot.state.y = 0;
      bot.state.heading = 0;
      bot.state.speed = 0;
      tgt.state.x = tx;
      tgt.state.y = ty;
      tgt.state.speed = 0;
      if (t < 400) continue; // warm-up: several full revolutions first
      measured += 1;
      if (w.bots.trackCountOf(bot.id) > 0) tracked += 1;
    }
    // The old cadence measured 0 here. Demand a held track, not a lucky one.
    expect(tracked / measured).toBeGreaterThan(0.9);
  });
});

describe('the ai/ boundary — the removed doors stay removed (review-gate FIX 2)', () => {
  const AI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'game', 'ai');

  /** Source text of every ai/ module, keyed by filename. */
  const aiSources = (): Array<[string, string]> =>
    readdirSync(AI_DIR)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => [f, readFileSync(join(AI_DIR, f), 'utf8')]);

  it('ai/ never mentions observeSpectator, and never imports world.js at all', () => {
    for (const [file, src] of aiSources()) {
      // The unfogged omniscient view: one value import would be a total
      // wallhack no runtime guard would catch. It may not even be NAMED.
      expect(src.includes('observeSpectator'), `${file} mentions observeSpectator`).toBe(false);
      // world.js is banned outright (types included) — the driver gets its
      // per-bot record and observe thunk injected by world.ts.
      expect(/from\s+['"][^'"]*world\.js['"]/.test(src), `${file} imports world.js`).toBe(false);
    }
  });

  it('ai/\'s import surface from perception.js is type-only (no value import)', () => {
    // The eslint boundary enforces this too (allowTypeImports on
    // perception.js); this pin makes the same line fail the TEST run, so a
    // lint-config regression cannot silently reopen the door.
    for (const [file, src] of aiSources()) {
      const imports = src.match(/^import[^;]*from\s+['"][^'"]*perception\.js['"];/gms) ?? [];
      for (const stmt of imports) {
        expect(stmt.startsWith('import type'), `${file} value-imports perception.js: ${stmt}`).toBe(true);
      }
    }
  });
});

describe('the narrow world port — its surface is exactly the ruled one', () => {
  it('World hands the driver a port with exactly these members (amendment 190 widened it by the three zone readouts)', () => {
    const { w } = botWorld(43, 1);
    const port = (w.bots as unknown as { port: BotWorldPort }).port;
    // A member added or dropped is a reviewed edit, not drift. The cycle-110
    // "one boolean" line (zoneEndgameReached) was superseded by epic-9
    // amendment 190 (Eric 2026-10-17, human parity) for EXACTLY zoneNextRing,
    // zonePhase and zoneSafeDisc; anything else still needs a ruling.
    expect(Object.keys(port).sort()).toEqual([
      'beacons', // Story 10.8 (Eric 2026-11-06, amendment 6(g)): the public beacon chart
      'helmEnabled',
      'map',
      'nav', // Story 9.13 (amendments 191/192): the public map's nav cache — derived from `map` alone
      'now',
      'spendPoint',
      'submitInput',
      'zoneEndgameReached',
      'zoneLiveRing',
      'zoneNextRing', // amendment 190
      'zonePhase', // amendment 190
      'zoneSafeDisc', // amendment 200(3), admitted under 190's parity bar
    ]);
    // No ship store of any kind rides the port.
    for (const banned of ['ships', 'shells', 'mines', 'decoys', 'litZones', 'events']) {
      expect(banned in port, banned).toBe(false);
    }
  });

  it('the harness getters read the mind and nothing else (Story 9.13)', () => {
    const { w, ids } = botWorld(44, 1);
    expect(w.bots.postureOf(ids[0])).toBe('reposition');
    expect(w.bots.lastTacticOf(ids[0])).toBeNull();
    expect(w.bots.postureOf('nobody')).toBeNull();
    expect(w.bots.lastTacticOf('nobody')).toBeNull();
  });
});

describe('input emission — the same validated path a human uses, same-tick consumption', () => {
  // WAVE-3 PIN UPDATE (deliberate): this test asserted the wave-1 NEUTRAL
  // decision (throttle 0, rudder 0, speed 0 forever). Wave 3 plugged the real
  // brain, so a bot with nothing in sight now makes for the live ring centre
  // — the I/O contract's "no contacts" row. What is pinned here is the
  // PLUMBING, which did not move: one strictly-increasing input per tick,
  // consumed the same tick, with the three fields a bot may never touch.
  // Behaviour lives in botTactics.test.ts.
  it('driven input flows every tick and is consumed the tick it is written', () => {
    const { w, ids } = botWorld(41, 3);
    w.step();
    for (const id of ids) {
      const rec = w.ships.get(id)!;
      // botsTick sits immediately before applyInputs: the very first tick's
      // input is already acked — never a 50ms-stale echo.
      expect(rec.lastAckSeq).toBe(1);
      expect(rec.input.throttle).toBeGreaterThan(0); // the helm is live
      // Nothing in SIGHT on tick one, so no track-targeted shot exists — but
      // since the doctrine pass a Mine Layer may legitimately site its recon
      // BUOY with an empty scope (a placement, no target needed), so fireSeq
      // is 0 or 1 here, never more (one click per tick, by construction).
      expect(rec.input.fireSeq).toBeLessThanOrEqual(1);
      expect(rec.input.hornSeq).toBe(0); // bots never honk (B5)
      expect(rec.input.fireT).toBe(0); // server-driven shooters never back-date
    }
    for (let t = 0; t < 9; t += 1) w.step();
    for (const id of ids) {
      const rec = w.ships.get(id)!;
      expect(rec.lastAckSeq).toBe(10); // strictly-increasing seq, one per tick
      expect(rec.state.speed).toBeGreaterThan(0); // and it is making way
      expect(rec.input.hornSeq).toBe(0);
      expect(rec.input.fireT).toBe(0);
    }
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

  // Story 10.5 review gate (Blind Hunter F3): the frozen gate refuses a
  // cooldown-ability press SILENTLY (no stamp, no denial), so a want that read
  // only the shared refusal would press again every tick. Counted per press
  // edge, as the world consumes it (actSeq advance with the ability's code).
  it('a HURT bot in a frozen room presses no cooldown ability; once live it presses its repair once', () => {
    const { w, ids } = botWorld(42, 1);
    const rec = w.ships.get(ids[0])!;
    rec.hp = Math.floor(rec.stats.maxHp * 0.1); // hurt: under every break-off line and short a whole heal
    const repairCode = abilityCode('repair');
    let lastSeq = rec.input.actSeq;
    const pressesOver = (ticks: number, code: number): number => {
      let n = 0;
      for (let t = 0; t < ticks; t += 1) {
        w.step();
        if (rec.input.actSeq > lastSeq && rec.input.act === code) n += 1;
        lastSeq = rec.input.actSeq;
      }
      return n;
    };
    // The room as Match.applyPolicy freezes it: helm, weapons and radar together.
    w.helmEnabled = false;
    w.weaponsEnabled = false;
    w.radarEnabled = false;
    expect(pressesOver(CADENCE_TICKS * 6, repairCode)).toBe(0);
    expect(rec.input.actSeq).toBe(0);
    expect(rec.repairReadyAt).toBe(0);
    w.helmEnabled = true;
    w.weaponsEnabled = true;
    w.radarEnabled = true;
    expect(pressesOver(CADENCE_TICKS * 6, repairCode)).toBe(1);
    expect(rec.repairReadyAt).toBeGreaterThan(w.now);
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

// --- the wave-4 test rig: profile override + the engage gate -----------------

describe('World.addBot — the optional TEST profile (Story 7-6 wave 4)', () => {
  it('a forced profile does not shift the stream for the enrollments after it', () => {
    // The mirror of solo.test.ts's forced-CLASS pin: the controller still
    // rolls class AND profile and discards both, so callsigns and every later
    // enrollment land in the same order either way.
    const a = new World(9);
    a.map.islands.length = 0;
    const b = new World(9);
    b.map.islands.length = 0;
    a.addBot(undefined, undefined);
    b.addBot(undefined, 'randomWarspite');
    const nextA = a.addBot(undefined, undefined);
    const nextB = b.addBot(undefined, undefined);
    expect(nextB.hullId).toBe(nextA.hullId);
    expect(w2names(a)).toEqual(w2names(b));
    expect(a.bots.profileOf(nextA.id)).toBe(b.bots.profileOf(nextB.id));
  });
});

function w2names(w: World): string[] {
  return [...w.ships.values()].map((s) => s.name);
}

describe('the engage gate — endgame bots hold fire until the terminal ring (wave 4)', () => {
  /** Four bots staged close and pointed at each other on an open ocean — the
   *  END-TO-END block's arrangement, minus islands, so acquisition is
   *  immediate and a held trigger is unambiguous. */
  function stagedWorld(zone?: ConstructorParameters<typeof World>[2]): { w: World; ids: string[] } {
    const w = new World(3101, 8, zone);
    w.map.islands.length = 0;
    const ids: string[] = [];
    for (let i = 0; i < 4; i += 1) ids.push(w.addBot(undefined, undefined).id);
    ids.forEach((id, i) => {
      const a = (i / ids.length) * Math.PI * 2;
      const rec = w.ships.get(id)!;
      rec.state.x = Math.cos(a) * 300;
      rec.state.y = Math.sin(a) * 300;
      rec.state.heading = a + Math.PI;
      rec.prevPose = { ...rec.state };
    });
    return { w, ids };
  }

  // A fast, concentric, tick-aligned timeline: 250ms beats, closed (= endgame
  // reached, no sudden death) after 3 groups x 4 beats = 3s = 60 ticks.
  const FAST_ZONE = { beatMs: 250, ringSteps: [1 / 3, 2 / 3], offsetCap: 0, terminalSightFactor: 2 };

  it("never fires while the timeline is IDLE — the gate cannot degenerate pre-match", () => {
    const { w, ids } = stagedWorld();
    w.bots.engage = 'endgame';
    const start = ids.map((id) => ({ ...w.ships.get(id)!.state }));
    for (let t = 0; t < 400; t += 1) {
      w.step();
      expect(w.shells.size).toBe(0);
    }
    for (const id of ids) {
      const rec = w.ships.get(id)!;
      expect(rec.input.fireSeq).toBe(0); // not one click, ever
      expect(w.bots.observesLastTick).toBe(ids.length); // perception NEVER gated
    }
    // Still sailing the rhythm, not parked: the helm stays live under the gate.
    const moved = ids.filter((id) => {
      const rec = w.ships.get(id)!;
      return Math.hypot(rec.state.x - start[ids.indexOf(id)].x, rec.state.y - start[ids.indexOf(id)].y) > 20;
    });
    expect(moved.length).toBeGreaterThan(0);
  });

  it('releases at zoneEndgameReached and then fights as a normal bot', () => {
    const { w, ids } = stagedWorld(FAST_ZONE);
    w.bots.engage = 'endgame';
    w.startZone(0);
    // Held through the whole geometric timeline… (the flip tick itself may
    // legitimately fire — the gate reads the live zone fact mid-step)
    while (!w.zoneEndgameReached) {
      w.step();
      if (!w.zoneEndgameReached) expect(w.shells.size).toBe(0);
    }
    // …then released: same bots, same water, and now they shoot.
    let shellsSeen = 0;
    for (let t = 0; t < 600; t += 1) {
      w.step();
      shellsSeen = Math.max(shellsSeen, w.shells.size);
    }
    expect(shellsSeen).toBeGreaterThan(0);
    expect(ids.some((id) => (w.ships.get(id)?.input.fireSeq ?? 0) > 0)).toBe(true);
  });

  it("the default gate is 'always' — the shipped behaviour is untouched", () => {
    const { w } = stagedWorld();
    expect(w.bots.engage).toBe('always');
  });
});
