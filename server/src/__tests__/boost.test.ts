// Speed-boost ability suite (Story 1.6) — the first non-weapon Equipment row and
// the actSeq activation control, exercised against the spec's I/O & edge-case
// matrix. Drives activation BOTH through the real World.step() path (actSeq
// monotonic gate -> sinking gate -> boost row -> boostUntil -> boosted
// kinematics) and through the public World.sinkingActivationGate for the denial
// vocabulary (never a wire event). No Date.now()/Math.random() — every number is
// a fixed seed or scripted input.

import { describe, it, expect } from 'vitest';
import { CONFIG, type InputMsg, type ShipClassId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const DT = CONFIG.tick.simDtMs;
const BOOST = CONFIG.speedBoost;
const TB_MAX = CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed; // 45
/** Slot the Torpedo Boat fits speedBoost into (Story 1.6). */
const SLOT_BOOST = 2;
/** Slot a universal-fit hull (BB/ML) fits its mine (a WEAPON) into. */
const SLOT_MINE = 2;

// ---------- construction helpers ---------------------------------------------

function bareWorld(seed = 21): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship at the origin at a known heading (speed 0). */
function place(w: World, id: string, hull: ShipClassId = 'torpedoBoat', heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), false, hull);
  rec.state = { x: 0, y: 0, heading, speed: 0 };
  return rec;
}

/** A full, valid input; fireSeq 0 / actSeq 0 mean no click / no activation. */
function makeInput(patch: Partial<InputMsg>): InputMsg {
  return { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, ...patch };
}

/** Submit an activation press (actSeq advance) for `id`. */
function pressActivate(w: World, id: string, seq: number, actSeq: number, actSlot: number, throttle = 0): void {
  w.submitInput(id, makeInput({ seq, throttle, actSeq, actSlot }));
}

// ---------- structural invariant ---------------------------------------------

describe('speed-boost CONFIG invariant', () => {
  it('reload >= duration, so an active window ALWAYS implies a cooling pool', () => {
    // This is what makes "re-activate while active" impossible by construction:
    // the charge cannot have reloaded before the window closes.
    expect(BOOST.reloadMs).toBeGreaterThanOrEqual(BOOST.durationMs);
    expect(BOOST.maxAmmo).toBe(1); // single charge
  });
});

// ---------- activate-ready: consume + open the window + raise the cap ---------

describe('activate a ready boost (Torpedo Boat, slot 2)', () => {
  it('consumes the single charge, opens the 6s window, and starts the reload', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    expect(a.loadout[SLOT_BOOST].equipmentId).toBe('speedBoost');
    pressActivate(w, 'a', 1, 1, SLOT_BOOST);
    w.step(); // applyInputs -> ... -> activationControl fires the boost
    expect(a.boostUntil).toBe(w.now + BOOST.durationMs);
    expect(a.loadout[SLOT_BOOST].state).toEqual({ n: 0, reloadMsLeft: BOOST.reloadMs });
    expect(a.lastActSeq).toBe(1);
  });

  it('raises the forward maxSpeed cap by +speedBonus: a full-throttle TB climbs past 45 toward 55', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.state.speed = TB_MAX; // already at the un-boosted cap
    pressActivate(w, 'a', 1, 1, SLOT_BOOST, 1); // full ahead + activate
    for (let i = 0; i < 40; i++) w.step(); // 2s: well inside the 6s window
    expect(a.boostUntil).toBeGreaterThan(w.now); // still active
    expect(a.state.speed).toBeGreaterThan(TB_MAX + 1); // provably above the base cap
    expect(a.state.speed).toBeLessThanOrEqual(TB_MAX + BOOST.speedBonus + 1e-6); // never past 55
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

// ---------- activate while cooling / active: no-ammo, no state change ---------

describe('activate while cooling (== while active, reload >= duration)', () => {
  it('the second activation is denied no-ammo and changes no state', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    pressActivate(w, 'a', 1, 1, SLOT_BOOST);
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
    w.sinkShip('a');
    expect(a.alive).toBe(false);
    expect(w.sinkingActivationGate(a, SLOT_BOOST)).toEqual({ ok: false, reason: 'dead' });
    expect(a.boostUntil).toBe(0);
  });

  it('activationControl skips the dead: a stored press never fires while sunk', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.sinkShip('a');
    pressActivate(w, 'a', 1, 1, SLOT_BOOST);
    w.step();
    expect(a.boostUntil).toBe(0); // no activation
  });
});

// ---------- actSeq targets abilities ONLY (weapon / empty slots inert) --------

describe('actSeq is inert on a weapon or empty slot', () => {
  it('a weapon slot (Battleship slot 2 = mine): actSeq advance drops NO mine and opens NO window', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'battleship');
    expect(a.loadout[SLOT_MINE].equipmentId).toBe('mine');
    pressActivate(w, 'a', 1, 1, SLOT_MINE); // actSeq on a WEAPON slot
    w.step();
    expect(a.boostUntil).toBe(0);
    expect(w.mines.size).toBe(0); // a click (fireSeq) drops mines — actSeq never does
    expect(a.lastActSeq).toBe(1); // counter still advanced (consumed, then inert)
  });

  it('the gun slot (0, a weapon on every hull): actSeq advance is inert', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    pressActivate(w, 'a', 1, 1, 0);
    w.step();
    expect(a.boostUntil).toBe(0);
    expect(w.shells.size).toBe(0); // no shell — actSeq never fires a weapon
  });

  it('the empty extra slot (3): actSeq advance is inert (no dereference, no state change)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    expect(a.loadout[3]).toEqual({ equipmentId: null, state: null });
    pressActivate(w, 'a', 1, 1, 3);
    w.step();
    expect(a.boostUntil).toBe(0);
  });
});

// ---------- boost expiry: cap falls back, speed decays ------------------------

describe('boost expiry', () => {
  it('once the window closes the cap returns to 45 and speed decays at class decel', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.state.speed = TB_MAX;
    pressActivate(w, 'a', 1, 1, SLOT_BOOST, 1); // full ahead + activate
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
    pressActivate(w, 'a', 1, 1, SLOT_BOOST);
    w.step();
    expect(a.boostUntil).toBeGreaterThan(0);
    const lastActSeq = a.lastActSeq;
    // Sink (respawnEnabled default true -> a waiting-phase respawn is scheduled).
    w.sinkShip('a');
    const steps = Math.ceil(CONFIG.ship.respawnDelay / DT) + 2;
    for (let i = 0; i < steps; i++) w.step();
    expect(a.alive).toBe(true); // respawned
    expect(a.boostUntil).toBe(0); // window cleared on respawn (fresh life)
    // lastActSeq is deliberately PRESERVED (mirrors lastFireSeq): the stored
    // input still carries actSeq 1, so a reset to 0 would read as a fresh press
    // and fire a phantom boost on the tick after respawn. Prove no phantom:
    expect(a.lastActSeq).toBe(lastActSeq);
    for (let i = 0; i < 3; i++) w.step();
    expect(a.boostUntil).toBe(0); // still no boost — the stale press never re-fires
  });
});

// ---------- drones never activate (actSeq 0 sentinel) ------------------------

describe('drones never activate an ability', () => {
  it('a drone stays un-boosted across many ticks (its actSeq is always 0)', () => {
    const w = bareWorld();
    const d = w.addShip('d', 'D', true, 'droneSmall');
    d.state = { x: 0, y: 0, heading: 0, speed: 0 };
    for (let i = 0; i < 30; i++) w.step();
    expect(d.boostUntil).toBe(0);
    expect(d.lastActSeq).toBe(0); // the controller only ever sends actSeq 0
  });
});

// ---------- monotonic gate: forged / regressing actSeq ignored ----------------

describe('the actSeq gate is monotonic', () => {
  it('a repeated or regressing actSeq never re-activates the boost', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    pressActivate(w, 'a', 1, 5, SLOT_BOOST); // first activation at actSeq 5
    w.step();
    const openWindow = a.boostUntil;
    expect(openWindow).toBeGreaterThan(0);
    expect(a.lastActSeq).toBe(5);
    // Repeat the SAME counter (5) then a LOWER one (3): neither out-runs lastActSeq.
    w.submitInput('a', makeInput({ seq: 2, actSeq: 5, actSlot: SLOT_BOOST }));
    w.step();
    w.submitInput('a', makeInput({ seq: 3, actSeq: 3, actSlot: SLOT_BOOST }));
    w.step();
    expect(a.lastActSeq).toBe(5); // never regressed
    // Even if the pool had a charge, no NEW activation happened (window unchanged
    // in end-time; only stamped once, at the first press).
    expect(a.loadout[SLOT_BOOST].state!.n).toBe(0); // still the single spent charge
  });
});

// ---------- owner-only: boostUntil rides `you` and NOTHING else ---------------

describe('boostUntil is owner-only (anti-cheat)', () => {
  it("appears on the owner's you, never on an enemy observer's contact or events", () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const b = place(w, 'b');
    b.state = { x: 100, y: 0, heading: 0, speed: 0 }; // inside a's sight (220u)
    pressActivate(w, 'a', 1, 1, SLOT_BOOST);
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
