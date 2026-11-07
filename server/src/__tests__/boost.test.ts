// Speed-boost ability suite (Story 1.6) — the first non-weapon Equipment row and
// the actSeq activation control, exercised against the spec's I/O & edge-case
// matrix. Drives activation BOTH through the real World.step() path (actSeq
// monotonic gate -> sinking gate -> boost row -> boostUntil -> boosted
// kinematics) and through the public World.sinkingActivationGate for the denial
// vocabulary (never a wire event). No Date.now()/Math.random() — every number is
// a fixed seed or scripted input.

import { describe, it, expect } from 'vitest';
import { isAfloat, CATALOG, CONFIG, DEFAULT_CLASS_ID, DEFAULT_SHIFT, SHIFT_IDS, SHIP_CLASS_IDS, SLOT_BOOST, abilityCode, effectiveStats, type InputMsg, type ShipClassId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { fitClassWeapons } from './classWeapons.js';
import { buildFrame } from '../game/frames.js';

const DT = CONFIG.tick.simDtMs;
const BOOST = CONFIG.boost;
const TB_MAX = effectiveStats(CONFIG.shipClasses.bismarck).kinematics.maxSpeed; // 45
// SLOT_BOOST is now SHARED (= 1): since Story 8.5 the boost sits in the same
// fixed slot on EVERY captain hull (amendment 23), so this file no longer
// authors its own constant.
/** Slot the Torpedo Boat's spawn-seeded torpedo (a WEAPON) lands in — the
 *  first WEAPON slot (Q, index 2) — the actSeq weapon-wall subject (mines
 *  flipped to the ability channel in Story 1.8). */
const SLOT_TORPEDO = 2;

// ---------- construction helpers ---------------------------------------------

function bareWorld(seed = 21): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship at the origin at a known heading (speed 0). */
function place(w: World, id: string, hull: ShipClassId = 'bismarck', heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined);
  // THE CLASS WEAPON IS A CARD NOW (Story 8.10, amendment 62): the interim
  // spawn seed is deleted and a hull comes up with gun + Shift and an EMPTY
  // weapon row, so this fixture fits it explicitly through the same applyCard
  // path a real pick takes. Every case below keeps its subject.
  fitClassWeapons(w, rec);
  rec.state = { x: 0, y: 0, heading, speed: 0 };
  return rec;
}

/** A full, valid input; fireSeq 0 / actSeq 0 mean no click / no activation. */
function makeInput(patch: Partial<InputMsg>): InputMsg {
  return { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false, ...patch };
}

/** Submit an activation press (actSeq advance) for `id`. */
/** Story 10.5: the press names its ABILITY (`act`), not a slot — the Shift
 *  is `abilityCode('shift')` and always activates slot 1. `act` defaults to it. */
function pressActivate(w: World, id: string, seq: number, actSeq: number, act: number = abilityCode('shift'), throttle = 0): void {
  w.submitInput(id, makeInput({ seq, throttle, actSeq, act, hornSeq: 0, held: false, sec: false }));
}

// ---------- structural invariant ---------------------------------------------

describe('boost CONFIG invariant', () => {
  it('reload >= duration, so an active window ALWAYS implies a cooling pool', () => {
    // This is what makes "re-activate while active" impossible by construction:
    // the charge cannot have reloaded before the window closes. Since Story 8.9
    // the batch-sim harness enforces the same relation on the --tune surface
    // (batchsim/overrides.ts validateCrossKeyInvariants).
    expect(BOOST.reloadMs).toBeGreaterThanOrEqual(BOOST.durationMs);
  });
});

// ---------- activate-ready: consume + open the window + raise the cap ---------

describe('activate a ready boost (Torpedo Boat, slot 1)', () => {
  it('consumes the single charge, opens the 10s window, and starts the reload', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    expect(a.loadout[SLOT_BOOST].equipmentId).toBe('boost');
    pressActivate(w, 'a', 1, 1);
    w.step(); // applyInputs -> ... -> activationControl fires the boost
    expect(a.boostUntil).toBe(w.now + BOOST.durationMs);
    expect(a.loadout[SLOT_BOOST].state).toEqual({ n: 0, reloadMsLeft: a.stats.equipment.boost.reloadMs }); // the RELOAD-folded reload
    expect(a.lastActSeq).toBe(1);
  });

  it('raises the forward maxSpeed cap by +25% of the ladder-raised max: a full-throttle TB climbs past 45 toward 56.25', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.state.speed = TB_MAX; // already at the un-boosted cap
    pressActivate(w, 'a', 1, 1, abilityCode('shift'), 1); // full ahead + activate
    for (let i = 0; i < 40; i++) w.step(); // 2s: well inside the 10s window
    expect(a.boostUntil).toBeGreaterThan(w.now); // still active
    expect(a.state.speed).toBeGreaterThan(TB_MAX + 1); // provably above the base cap
    // Amendment 55: the bonus is CONFIG.boost.factor x the POST-FOLD max, so an
    // un-carded TB caps at 45 + 45 x 0.25 = 56.25, never a flat +10 u/s.
    expect(a.state.speed).toBeLessThanOrEqual(TB_MAX + TB_MAX * BOOST.factor + 1e-6);
  });

  it('an un-boosted full-throttle twin caps at the base 45 (control)', () => {
    const w = bareWorld();
    const b = place(w, 'b');
    b.state.speed = TB_MAX;
    w.submitInput('b', makeInput({ throttle: 1 })); // full ahead, NO activation
    for (let i = 0; i < 40; i++) w.step();
    expect(b.boostUntil).toBe(0);
    expect(b.state.speed).toBeLessThanOrEqual(TB_MAX + 1e-6);
  });
});

// ---------- Story 8.9: THE SHIFT BOOST, end to end through submitInput -------

describe('the Shift boost end to end (Story 8.9, amendments 54-55)', () => {
  /** Run `n` ticks. */
  const run = (w: World, n: number): void => {
    for (let i = 0; i < n; i++) w.step();
  };
  /** Deal `count` copies of one upgrade line onto a live record. */
  const stack = (w: World, s: ShipRecord, lineId: string, count: number): void => {
    for (let i = 0; i < count; i++) w.applyCard(s, lineId);
  };

  it('an open boost window never moves the RATED cap (stats.kinematics.maxSpeed stays the class cap)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    expect(a.loadout[SLOT_BOOST].equipmentId).toBe('boost');
    pressActivate(w, 'a', 1, 1);
    w.step();
    expect(a.boostUntil).toBeGreaterThan(w.now);
    // THE BOTS' RATED READ IS UNTOUCHED (amendment 55): the bonus is layered
    // per tick by the shared hook and is NEVER folded into EffectiveStats, so
    // ai/utility.ts's max(rated, actual) deadband still reads the class cap.
    expect(a.stats.kinematics.maxSpeed).toBe(TB_MAX);
  });

  it('the boosted forward cap is rated × (1 + factor), un-carded and with the SPEED line at cap', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.state.speed = TB_MAX;
    pressActivate(w, 'a', 1, 1, abilityCode('shift'), 1); // full ahead + tap
    run(w, 100); // 5 s — inside the window, long past the accel ramp
    expect(a.boostUntil).toBeGreaterThan(w.now);
    expect(a.stats.kinematics.maxSpeed).toBe(TB_MAX); // rated, un-carded
    expect(a.state.speed).toBeCloseTo(TB_MAX * (1 + BOOST.factor), 6);

    // LADDER-RAISED: the SPEED line stacked to its cap lifts the rated cap
    // above the class base, and the BONUS GROWS WITH IT — rated × (1 + factor),
    // not rated + a flat amount. The cap is read off the catalog (5 since
    // Story 9.6), never hard-coded.
    const w2 = bareWorld();
    const b = place(w2, 'b');
    stack(w2, b, 'engines', CATALOG.engines.cap);
    const rated = b.stats.kinematics.maxSpeed;
    expect(rated).toBeGreaterThan(TB_MAX); // the ladder did raise it...
    expect(rated).toBe(effectiveStats(b.cls, b.cards).kinematics.maxSpeed); // ...and the read STILL rated
    b.state.speed = rated;
    pressActivate(w2, 'b', 1, 1, abilityCode('shift'), 1);
    run(w2, 100);
    expect(b.boostUntil).toBeGreaterThan(w2.now);
    expect(b.state.speed).toBeCloseTo(rated * (1 + BOOST.factor), 6);
  });

  it('a second tap INSIDE the window is no-ammo — the charge is in the 25 s pool', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    pressActivate(w, 'a', 1, 1);
    w.step();
    const opened = a.boostUntil;
    run(w, 20); // 1 s into the 10 s window
    expect(a.boostUntil).toBeGreaterThan(w.now); // still active
    pressActivate(w, 'a', 2, 2); // TAP AGAIN through the real path
    w.step();
    expect(a.boostUntil).toBe(opened); // window NOT extended, NOT restarted
    expect(w.sinkingActivationGate(a, SLOT_BOOST)).toEqual({ ok: false, reason: 'no-ammo' });
  });

  it('RELOAD cards leave the boost cooldown AND the window alone (Story 10.5, R10)', () => {
    // R40 superseded: RELOAD is the main battery's stat; a Shift reloads on its
    // own number. The DURATION is not a reload and no card addresses it.
    const w = bareWorld();
    const a = place(w, 'a');
    stack(w, a, 'reload', CATALOG.reload.cap);
    expect(a.stats.cooldownScale).toBeLessThan(1);
    expect(a.stats.equipment.boost.reloadMs).toBe(BOOST.reloadMs);
    expect(a.stats.equipment.boost.durationMs).toBe(BOOST.durationMs);
    pressActivate(w, 'a', 1, 1);
    w.step();
    expect(a.loadout[SLOT_BOOST].state).toEqual({ n: 0, reloadMsLeft: a.stats.equipment.boost.reloadMs });
    expect(a.boostUntil).toBe(w.now + BOOST.durationMs);
  });
});

// ---------- activate while cooling / active: no-ammo, no state change ---------

describe('activate while cooling (== while active, reload >= duration)', () => {
  it('the second activation is denied no-ammo and changes no state', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    pressActivate(w, 'a', 1, 1);
    w.step();
    const openWindow = a.boostUntil;
    expect(openWindow).toBeGreaterThan(w.now); // active -> pool is cooling
    // Directed second activation through the public gate: empty pool -> no-ammo.
    expect(w.sinkingActivationGate(a, SLOT_BOOST)).toEqual({ ok: false, reason: 'no-ammo' });
    expect(a.boostUntil).toBe(openWindow); // window NOT extended, no state change
  });
});

// ---------- dead / sinking-gated denial --------------------------------------

describe('a dead ship cannot activate', () => {
  it('the gate refuses with dead before any row runs', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.respawnEnabled = false;
    w.sinkShip('a');
    // Story 5.2 (amendment 10): a SINKING hull still activates — only a
    // foundered one is dead. Cross the window before asserting the refusal.
    w.step(CONFIG.ship.sinkingWindowMs);
    expect(isAfloat(a.lifecycle)).toBe(false);
    expect(w.sinkingActivationGate(a, SLOT_BOOST)).toEqual({ ok: false, reason: 'dead' });
    expect(a.boostUntil).toBe(0);
  });

  it('activationControl skips the dead: a stored press never fires while sunk', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.respawnEnabled = false;
    w.sinkShip('a');
    w.step(CONFIG.ship.sinkingWindowMs); // Story 5.2: cross the window first
    pressActivate(w, 'a', 1, 1);
    w.step();
    expect(a.boostUntil).toBe(0); // no activation
  });
});

// ---------- actSeq names an ABILITY, never a slot (Story 10.5) -------------

describe('actSeq is inert on anything but a known ability code', () => {
  it('a Shift press (act = shift) never fires the fitted torpedo: no fish, the boost opens', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    expect(a.loadout[SLOT_TORPEDO].equipmentId).toBe('heavyTorpedo');
    pressActivate(w, 'a', 1, 1);
    w.step();
    expect(w.shells.size).toBe(0); // a click (fireSeq) fires weapons — actSeq never does
    expect(a.boostUntil).toBe(w.now + BOOST.durationMs);
  });

  it('a directly assigned input with an UNKNOWN act code is consumed and inert (the World backstop)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.input = makeInput({ seq: 1, actSeq: 1, act: 99 });
    w.step();
    expect(a.boostUntil).toBe(0);
    expect(a.lastActSeq).toBe(1); // consumed, then inert
  });
});

// ---------- THE BOOST IS THE TORPEDO BOAT'S CLASS SHIFT (Story 8.15) -------

describe('the boost is the SEAT\'s Shift pick (Story 10.4 — no longer a class Shift)', () => {
  // Story 8.15 bound a FIXED Shift to each class; Story 10.4 (epic-10
  // amendment 9) made the Shift the SEAT's pick: slot 1 mounts whatever the
  // captain picked on any hull, Speed Boost by default (R7). The boost's own
  // window and reload law are untouched.
  it('the default seat fits boost in slot 1 on every hull, and a press opens the CONFIG window', () => {
    for (const hull of SHIP_CLASS_IDS) {
      const w = bareWorld();
      const a = place(w, 'a', hull);
      expect(a.shift).toBe(DEFAULT_SHIFT);
      expect(a.loadout[SLOT_BOOST].equipmentId).toBe(DEFAULT_SHIFT);
      expect(a.loadout[SLOT_BOOST].state).toEqual({ n: BOOST.maxAmmo, reloadMsLeft: 0 });
      pressActivate(w, 'a', 1, 1);
      w.step();
      expect(a.boostUntil).toBe(w.now + BOOST.durationMs);
      expect(a.loadout[SLOT_BOOST].state).toEqual({ n: 0, reloadMsLeft: a.stats.equipment.boost.reloadMs });
    }
  });

  it.each(SHIFT_IDS.filter((id) => id !== 'boost'))(
    'a seat that picked %s carries it in slot 1 and no boost: a Shift press opens NO boost window',
    (shift) => {
      const w = bareWorld();
      const a = w.addShip('a', 'A', 'captain', DEFAULT_CLASS_ID, undefined, undefined, shift);
      a.state = { x: 0, y: 0, heading: 0, speed: 0 };
      expect(a.loadout[SLOT_BOOST].equipmentId).toBe(shift);
      expect(a.loadout.some((s) => s.equipmentId === 'boost')).toBe(false);
      const cap = a.stats.kinematics.maxSpeed;
      a.state.speed = cap;
      pressActivate(w, 'a', 1, 1, abilityCode('shift'), 1); // full ahead + the Shift edge
      for (let i = 0; i < 40; i++) w.step();
      expect(a.boostUntil).toBe(0); // the row in slot 1 is not the boost
      expect(a.state.speed).toBeLessThanOrEqual(cap + 1e-6); // never past the rated cap
    },
  );
});

// ---------- boost expiry: cap falls back, speed decays ------------------------

describe('boost expiry', () => {
  it('once the window closes the cap returns to 45 and speed decays at class decel', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.state.speed = TB_MAX;
    pressActivate(w, 'a', 1, 1, abilityCode('shift'), 1); // full ahead + activate
    for (let i = 0; i < 60; i++) w.step(); // 3s in — mid-window, near the boosted cap
    const boostedSpeed = a.state.speed;
    expect(boostedSpeed).toBeGreaterThan(TB_MAX + 1); // it really was boosted
    expect(a.boostUntil).toBeGreaterThan(w.now); // window still open
    while (w.now < a.boostUntil) w.step(); // run the rest of the window out
    for (let i = 0; i < 40; i++) w.step(); // 2s past expiry, still full ahead
    expect(a.state.speed).toBeLessThan(boostedSpeed); // decayed
    expect(a.state.speed).toBeLessThanOrEqual(TB_MAX + 1e-6); // back under the base cap
  });
});

// ---------- death/respawn resets boostUntil; NO phantom re-activation ---------

describe('death/respawn state reset (Story 1.6)', () => {
  it('respawn clears boostUntil AND does not re-fire the boost from a stale actSeq', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    // Activate, then keep the SAME stored input (actSeq 1) live across the death.
    pressActivate(w, 'a', 1, 1);
    w.step();
    expect(a.boostUntil).toBeGreaterThan(0);
    const lastActSeq = a.lastActSeq;
    // Sink (respawnEnabled default true -> a waiting-phase respawn is scheduled).
    // Story 5.2: the revive lands on the founder tick (window > respawn delay).
    w.sinkShip('a');
    const steps = Math.ceil(CONFIG.ship.sinkingWindowMs / DT) + 2;
    for (let i = 0; i < steps; i++) w.step();
    expect(isAfloat(a.lifecycle)).toBe(true); // respawned
    expect(a.boostUntil).toBe(0); // window cleared on respawn (fresh life)
    // lastActSeq is deliberately PRESERVED (mirrors lastFireSeq): the stored
    // input still carries actSeq 1, so a reset to 0 would read as a fresh press
    // and fire a phantom boost on the tick after respawn. Prove no phantom:
    expect(a.lastActSeq).toBe(lastActSeq);
    for (let i = 0; i < 3; i++) w.step();
    expect(a.boostUntil).toBe(0); // still no boost — the stale press never re-fires
  });
});

// ---------- monotonic gate: forged / regressing actSeq ignored ----------------

describe('the actSeq gate is monotonic', () => {
  it('a repeated or regressing actSeq never re-activates the boost', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    pressActivate(w, 'a', 1, 5); // first activation at actSeq 5
    w.step();
    const openWindow = a.boostUntil;
    expect(openWindow).toBeGreaterThan(0);
    expect(a.lastActSeq).toBe(5);
    // Repeat the SAME counter (5) then a LOWER one (3): neither out-runs lastActSeq.
    w.submitInput('a', makeInput({ seq: 2, actSeq: 5, act: 0, hornSeq: 0, held: false, sec: false }));
    w.step();
    w.submitInput('a', makeInput({ seq: 3, actSeq: 3, act: 0, hornSeq: 0, held: false, sec: false }));
    w.step();
    expect(a.lastActSeq).toBe(5); // never regressed
    // Even if the pool had a charge, no NEW activation happened (window unchanged
    // in end-time; only stamped once, at the first press).
    expect(a.loadout[SLOT_BOOST].state!.n).toBe(0); // still the single spent charge
  });
});

// ---------- the click channel dispatches weapons ONLY ------------------------

describe('a click never activates an ability (fireControl weapon wall)', () => {
  it('a forged click on the boost slot (slot 1) is inert: no activation, charge intact, no lastFireT', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    // A click (fireSeq advance) naming the ability slot — abilities activate via
    // actSeq, NEVER a click. Without the wall this would reach boostEquipment
    // and burn the charge + stamp lastFireT off the wrong channel.
    w.submitInput('a', makeInput({ seq: 1, fireSeq: 1, slot: SLOT_BOOST, fireT: 0 }));
    w.step();
    expect(a.boostUntil).toBe(0); // NOT activated off the click channel
    expect(a.loadout[SLOT_BOOST].state).toEqual({ n: BOOST.maxAmmo, reloadMsLeft: 0 }); // charge intact
    expect(a.lastFireT).toBe(0); // no fire-time stamp for an inert slot
    expect(a.lastFireSeq).toBe(1); // the click counter still advanced (consumed)
  });
});

// ---------- death during boost: the window survives sink-entry, dies at founder

describe('death during boost — Story 5.2 supersedes the 1.6 instant close', () => {
  it('a live boost rides through the sinking window (amendment 10) and founder zeroes it', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    pressActivate(w, 'a', 1, 1);
    w.step();
    expect(a.boostUntil).toBeGreaterThan(w.now); // mid-window
    w.respawnEnabled = false;
    w.sinkShip('a'); // killed while boosting
    expect(isAfloat(a.lifecycle)).toBe(false);
    // Amendment 10 admits the boost while sinking, so an OPEN window must
    // SURVIVE sink-entry and keep composing with the decel cap (the doomed
    // surge). The old "no active-boost chrome on a dead ship" concern does not
    // apply at entry: the owner's frame still carries `you` and advertises the
    // window honestly.
    expect(a.boostUntil).toBeGreaterThan(w.now);
    expect(buildFrame(w, 'a', 'active').you!.boostUntil).toBe(a.boostUntil);
    // At FOUNDER the original dead-chrome rule applies: the hull's life is
    // over, the next frame is a spectator frame with no `you`, and
    // founderSinking zeroes the window with the rest of the kept marks.
    w.step(CONFIG.ship.sinkingWindowMs);
    expect(a.boostUntil).toBe(0);
  });
});

// ---------- owner-only: boostUntil rides `you` and NOTHING else ---------------

describe('boostUntil is owner-only (anti-cheat)', () => {
  it("appears on the owner's you, never on an enemy observer's contact or events", () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const b = place(w, 'b');
    b.state = { x: 100, y: 0, heading: 0, speed: 0 }; // inside a's sight (220u)
    pressActivate(w, 'a', 1, 1);
    w.step();
    expect(a.boostUntil).toBeGreaterThan(0);

    // The owner's own frame carries it.
    const own = buildFrame(w, 'a');
    expect(own.you!.boostUntil).toBe(a.boostUntil);

    // The enemy observer sees a as a live contact, but NOTHING leaks the boost.
    const enemy = buildFrame(w, 'b');
    expect(enemy.contacts.some((c) => c.id === 'a')).toBe(true);
    for (const c of enemy.contacts) expect('boostUntil' in c).toBe(false);
    for (const e of enemy.events) expect('boostUntil' in e).toBe(false);
    // b's own you (not boosting) reports the inactive sentinel, still owner-scoped.
    expect(enemy.you!.boostUntil).toBe(0);
  });
});
